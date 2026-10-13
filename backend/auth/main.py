
import json
import os
import secrets
from urllib.parse import urlencode
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from backend.auth.service import create_supabase_client
from backend.auth.oauth_store import create_transaction, consume_transaction
from backend.auth.pkce_storage import PKCEStorage

from pydantic import BaseModel
from backend.auth.oauth_store import create_handoff, consume_handoff

from backend.auth.session_security import encrypt_session, decrypt_session

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

SESSION_COOKIE_NAME = os.getenv(
    "SESSION_COOKIE_NAME", "medquad_session"
)

SESSION_MAX_AGE = int(
    os.getenv("SESSION_MAX_AGE", "604800")
)

# --------------------------------------------------
# AUTHENTICATION HEALTH CHECK
# --------------------------------------------------

@router.get("/health")
def auth_health_check():
    """
    Check whether the Supabase client
    can be initialized.
    """
    create_supabase_client()

    return {
        "status": "configured",
        "service": "Supabase Authentication"
    }


# --------------------------------------------------
# GOOGLE LOGIN
# --------------------------------------------------

@router.get("/google/login")
def google_login():
    try:
        # 1. Create isolated PKCE storage
        storage = PKCEStorage()
        supabase = create_supabase_client(storage=storage)

        # 2. Generate Google OAuth authorization URL
        callback_url = (
            f"{os.environ['BACKEND_URL']}/auth/google/callback"
        )

        oauth_response = supabase.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {
                "redirect_to": callback_url
            }
        })

        # 3. Retrieve the generated PKCE verifier
        verifier = storage.get_verifier()

        if not verifier or not oauth_response.url:
            raise RuntimeError("OAuth initialization failed")

        # 4. Store the verifier for five minutes
        transaction_id = create_transaction(verifier)

        # 5. Sign the transaction identifier
        serializer = URLSafeTimedSerializer(
            os.environ["OAUTH_STATE_SECRET"]
        )

        signed_transaction = serializer.dumps(
            transaction_id,
            salt="medquad-google-oauth"
        )

        # 6. Redirect browser to Google
        response = RedirectResponse(
            url=oauth_response.url,
            status_code=302
        )

        # 7. Bind this transaction to the browser
        response.set_cookie(
            key="medquad_oauth",
            value=signed_transaction,
            max_age=300,
            httponly=True,
            secure=False,  # Local HTTP development only
            samesite="lax",
            path="/auth"
        )

        return response

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to start Google authentication."
        )

#--------------------------------------------------
# Google Callback
#--------------------------------------------------

@router.get("/google/callback")
def google_callback(request: Request, code: str | None = None):
    # 1. Retrieve the signed browser cookie
    signed_transaction = request.cookies.get("medquad_oauth")

    if not signed_transaction:
        raise HTTPException(
            status_code=400,
            detail="Missing OAuth transaction cookie."
        )

    # 2. Validate its signature and expiration
    serializer = URLSafeTimedSerializer(
        os.environ["OAUTH_STATE_SECRET"]
    )

    try:
        transaction_id = serializer.loads(
            signed_transaction,
            salt="medquad-google-oauth",
            max_age=300
        )
    except (BadSignature, SignatureExpired):
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OAuth transaction."
        )

    if not code:
        raise HTTPException(
            status_code=400,
            detail="Missing OAuth authorization code."
        )

    # 3. Consume the original PKCE verifier
    verifier = consume_transaction(transaction_id)

    if not verifier:
        raise HTTPException(
            status_code=400,
            detail="OAuth transaction expired or already used."
        )

    # 4. Restore the verifier into isolated storage
    storage = PKCEStorage()
    storage.set_verifier(verifier)

    # 5. Exchange authorization code for Supabase session
    try:
        supabase = create_supabase_client(storage=storage)

        auth_response = supabase.auth.exchange_code_for_session(
            {"auth_code": code}
        )

        if not auth_response.user or not auth_response.session:
            raise RuntimeError("Session exchange failed")

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Google authentication could not be completed."
        )

    # 6. Store the authenticated Supabase session temporarily
    session_data = {
        "access_token": auth_response.session.access_token,
        "refresh_token": auth_response.session.refresh_token,
        }

    ticket = create_handoff(session_data)

    encrypted_session = encrypt_session(
        json.dumps(session_data)
    )

    # 7. Redirect to Streamlit with a one-time ticket

    redirect_url = (
        f"{os.environ['FRONTEND_URL']}/?"
        + urlencode({"auth_ticket": ticket})
    )

    response = RedirectResponse(
        url=redirect_url,
        status_code=302
    )

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=encrypted_session,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=False,  # Local development only
        samesite="lax",
        path="/",
    )

    response.delete_cookie(
        key="medquad_oauth",
        path="/auth"
    )

    return response

#--------------------------------------------------
# One-Time Authentication Ticket
#--------------------------------------------------

class HandoffRequest(BaseModel):
    ticket: str


@router.post("/session/exchange")
def exchange_handoff(payload: HandoffRequest):
    session_data = consume_handoff(payload.ticket)

    if session_data is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid, expired, or already used ticket."
        )

    # Verify the session with Supabase
    try:
        supabase = create_supabase_client()

        user_response = supabase.auth.get_user(
            session_data["access_token"]
        )

        if user_response.user is None:
            raise ValueError("Invalid Supabase session")

        return {
            "authenticated": True,
            "user_id": user_response.user.id,
            "email": user_response.user.email,
            "access_token": session_data["access_token"],
            "refresh_token": session_data["refresh_token"],
        }

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Unable to validate authentication session."
        )


# --------------------------------------------------
# PERSISTENT AUTHENTICATION SESSION
# --------------------------------------------------

class SessionCreateRequest(BaseModel):
    access_token: str
    refresh_token: str


@router.post("/session/create")
def create_persistent_session(
    payload: SessionCreateRequest,
    response: Response
):
    """
    Validate Supabase authentication and establish
    an encrypted browser session.
    """

    try:
        supabase = create_supabase_client()

        user_response = supabase.auth.get_user(
            payload.access_token
        )

        if user_response.user is None:
            raise ValueError("Invalid authentication session")

        # Encrypt session credentials
        import json

        session_data = json.dumps({
            "access_token": payload.access_token,
            "refresh_token": payload.refresh_token,
        })

        encrypted_session = encrypt_session(session_data)

        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=encrypted_session,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            secure=False,  # Local development only
            samesite="lax",
            path="/",
        )

        return {
            "authenticated": True,
            "user_id": user_response.user.id,
            "email": user_response.user.email,
        }

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Unable to create authentication session."
        )


@router.get("/session/me")
def get_current_session(request: Request):
    """
    Validate an existing browser session.
    """

    encrypted_session = request.cookies.get(
        SESSION_COOKIE_NAME
    )

    if not encrypted_session:
        raise HTTPException(
            status_code=401,
            detail="No active session."
        )

    decrypted = decrypt_session(encrypted_session)

    if decrypted is None:
        raise HTTPException(
            status_code=401,
            detail="Session expired or invalid."
        )

    try:
        import json

        session_data = json.loads(decrypted)

        supabase = create_supabase_client()

        user_response = supabase.auth.get_user(
            session_data["access_token"]
        )

        if user_response.user is None:
            raise ValueError("Invalid user session")

        return {
            "authenticated": True,
            "user_id": user_response.user.id,
            "email": user_response.user.email,
        }

    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Unable to validate authentication session."
        )


@router.post("/session/logout")
def logout_persistent_session(response: Response):
    """
    Remove the persistent browser session cookie.
    """

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        samesite="lax",
    )

    return {
        "authenticated": False,
        "message": "Signed out successfully."
    }


# --------------------------------------------------
# Browser Authentication Nonce
# --------------------------------------------------

BROWSER_NONCE_COOKIE = "medquad_browser_nonce"


@router.get("/session/browser/start")
def start_browser_session(response: Response):
    """
    Create a temporary browser-bound authentication nonce.

    The nonce is stored in an HttpOnly cookie and
    is not returned to JavaScript or Streamlit.
    """

    browser_nonce = secrets.token_urlsafe(32)

    response.set_cookie(
        key=BROWSER_NONCE_COOKIE,
        value=browser_nonce,
        max_age=300,
        httponly=True,
        secure=False,  # Local development only
        samesite="lax",
        path="/auth/session",
    )

    return {
        "status": "ready",
        "message": "Browser authentication initialized.",
    }


@router.get("/session/browser/logout")
def browser_logout():
    """Delete the browser session and return to Streamlit."""

    frontend_url = os.environ["FRONTEND_URL"].rstrip("/")

    response = RedirectResponse(
        url=f"{frontend_url}/?page=logged_out",
        status_code=303,
    )

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=False,  # Local development only
        httponly=True,
        samesite="lax",
    )

    return response

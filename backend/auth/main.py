
import json
import os
import secrets
from urllib.parse import urlencode
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, HTMLResponse
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


# --------------------------------------------------
# PASSWORD RECOVERY PAGE
# --------------------------------------------------

@router.get("/reset-password", response_class=HTMLResponse)
def reset_password_page():
    """Display the Supabase password recovery form."""

    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_KEY"]

    html = r"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport"
          content="width=device-width, initial-scale=1">

    <title>Reset Password | MedQuad AI</title>

    <style>
        * { box-sizing: border-box; }

        body {
            font-family: Arial, sans-serif;
            background: #f5f8ff;
            color: #172b4d;
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0;
            padding: 20px;
        }

        .container {
            background: white;
            width: 100%;
            max-width: 440px;
            padding: 36px;
            border-radius: 16px;
            box-shadow: 0 8px 30px rgba(0,0,0,.08);
        }

        h1 {
            text-align: center;
            margin-top: 0;
        }

        p {
            text-align: center;
            color: #52627a;
            line-height: 1.5;
        }

        label {
            display: block;
            margin-top: 18px;
            font-weight: 600;
        }

        input {
            width: 100%;
            padding: 12px;
            margin-top: 7px;
            border: 1px solid #ccd5e3;
            border-radius: 8px;
        }

        button {
            width: 100%;
            padding: 13px;
            margin-top: 22px;
            background: #1c4c9b;
            color: white;
            border: 0;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
        }

        button:disabled {
            opacity: .6;
        }

        #message {
            margin-top: 18px;
            text-align: center;
            line-height: 1.5;
        }

        .requirements {
            text-align: left;
            font-size: 13px;
        }
    </style>
</head>

<body>
<div class="container">

    <h1>Create New Password</h1>
    <p>Secure your MedQuad AI account.</p>

    <form id="reset-form" hidden>

        <label for="password">New Password</label>
        <input
            id="password"
            type="password"
            autocomplete="new-password"
            required
        >

        <label for="confirm">Confirm New Password</label>
        <input
            id="confirm"
            type="password"
            autocomplete="new-password"
            required
        >

        <p class="requirements">
            At least 8 characters, one uppercase letter,
            one number, and one special character.
        </p>

        <button id="submit" type="submit">
            Save New Password
        </button>

    </form>

    <div id="message" role="status">
        Verifying your recovery link...
    </div>

</div>

<script type="module">
    import { createClient } from
        "https://esm.sh/@supabase/supabase-js@2";

    // Replace with your Supabase public credentials.
    // Never use a service_role or secret key here.
    const SUPABASE_URL = __SUPABASE_URL__;
    const SUPABASE_KEY = __SUPABASE_KEY__;

    const supabase = createClient(
        SUPABASE_URL,
        SUPABASE_KEY,
        {
            auth: {
                detectSessionInUrl: false,
                persistSession: false,
                autoRefreshToken: false
            }
        }
    );

    const form = document.getElementById("reset-form");
    const message = document.getElementById("message");
    const button = document.getElementById("submit");

    const params = new URLSearchParams(
        window.location.hash.substring(1)
    );

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const recoveryType = params.get("type");

    // Remove tokens from browser address bar.
    window.history.replaceState(
        null, "",
        window.location.pathname
    );

    let recoveryVerified = false;

    if (
        accessToken &&
        refreshToken &&
        recoveryType === "recovery"
    ) {
        const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
        });

        if (!error && data.user) {
            recoveryVerified = true;
            form.hidden = false;
            message.textContent = "";
        } else {
            message.textContent =
                "Invalid or expired recovery link. " +
                "Please request a new email.";
        }
    } else {
        message.textContent =
            "Invalid recovery link. Please request a new email.";
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!recoveryVerified) return;

        const password =
            document.getElementById("password").value;

        const confirm =
            document.getElementById("confirm").value;

        const strongPassword =
            password.length >= 8 &&
            /[A-Z]/.test(password) &&
            /[0-9]/.test(password) &&
            /[^A-Za-z0-9]/.test(password);

        if (!strongPassword) {
            message.textContent =
                "Password must contain at least 8 characters, " +
                "one uppercase letter, one number, " +
                "and one special character.";
            return;
        }

        if (password !== confirm) {
            message.textContent = "Passwords do not match.";
            return;
        }

        button.disabled = true;
        message.textContent = "Updating your password...";

        const { error } = await supabase.auth.updateUser({
            password: password
        });

        if (error) {
            message.textContent =
                "Unable to update your password: " +
                error.message;
            button.disabled = false;
            return;
        }

        form.hidden = true;

        // Show success message
    message.textContent =
        "Password changed successfully! Redirecting to Login in 2 seconds...";

    // Start the 2-second countdown immediately
    setTimeout(() => {
        window.location.replace(
            "http://localhost:8501/?page=login"
        );
    }, 2000);

    // Sign out the Supabase recovery session
    supabase.auth.signOut().catch(console.error);
    });
</script>

</body>
</html>
"""

    html = html.replace(
        "__SUPABASE_URL__",
        json.dumps(supabase_url)
    ).replace(
        "__SUPABASE_KEY__",
        json.dumps(supabase_key)
    )

    return HTMLResponse(content=html)


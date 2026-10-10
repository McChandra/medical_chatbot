
import os
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from backend.auth.service import create_supabase_client


router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
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
        supabase = create_supabase_client()

        backend_url = os.environ["BACKEND_URL"]

        callback_url = (
            f"{backend_url}/auth/google/callback"
        )

        response = supabase.auth.sign_in_with_oauth(
            {
                "provider": "google",
                "options": {
                    "redirect_to": callback_url,
                },
            }
        )

        return RedirectResponse(
            url=response.url,
            status_code=302,
        )

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to start Google authentication.",
        )


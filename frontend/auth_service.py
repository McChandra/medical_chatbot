
import streamlit as st

from supabase import (
    Client,
    ClientOptions,
    create_client,
)


def get_supabase_client() -> Client:
    """Create and reuse the Supabase client."""

    if "supabase_client" not in st.session_state:

        st.session_state.supabase_client = create_client(
            st.secrets["SUPABASE_URL"],
            st.secrets["SUPABASE_KEY"],
            options=ClientOptions(
                flow_type="pkce"
            ),
        )

    return st.session_state.supabase_client


def sign_in_with_email(email: str, password: str):
    """Authenticate a user with email and password."""

    supabase = get_supabase_client()

    return supabase.auth.sign_in_with_password({
        "email": email,
        "password": password,
    })


def prepare_persistent_session(auth_response) -> dict:
    """
    Extract the Supabase credentials needed to
    establish a persistent FastAPI browser session.

    This function does not create a cookie.
    """

    if not auth_response.user or not auth_response.session:
        raise ValueError("Authentication session is missing.")

    session = auth_response.session

    if not session.access_token or not session.refresh_token:
        raise ValueError("Authentication tokens are missing.")

    return {
        "user_id": auth_response.user.id,
        "email": auth_response.user.email,
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
    }
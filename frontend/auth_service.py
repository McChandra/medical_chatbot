
import streamlit as st

from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions


def get_supabase_client() -> Client:
    """
    Create a Supabase client for the current
    Streamlit session.
    """
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
    """
    Authenticate an existing user with
    their email and password.
    """
    supabase = get_supabase_client()

    return supabase.auth.sign_in_with_password({
        "email": email,
        "password": password,
    })


def get_google_login_url() -> str:
    """
    Request a Google OAuth login URL
    from Supabase.
    """
    supabase = get_supabase_client()

    response = supabase.auth.sign_in_with_oauth({
        "provider": "google",
        "options": {
            "redirect_to": "http://localhost:8501"
        },
    })

    return response.url

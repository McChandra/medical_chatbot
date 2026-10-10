
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

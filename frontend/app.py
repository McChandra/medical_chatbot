
"""
MedQuad AI Streamlit Application

Main entry point for the MedQuad AI frontend.

Responsibilities:
- Configure Streamlit
- Initialize session state
- Restore authenticated browser sessions
- Handle Google OAuth authentication
- Handle browser logout
- Handle password recovery routing
- Load light/dark themes
- Route between application pages
"""

import os
import time
from pathlib import Path

import httpx
import streamlit as st
from dotenv import load_dotenv

from home import render_home
from login import render_login
from signup import render_signup
from chat import render_chatbot
from forgot_password import render_forgot_password
from reset_password import render_reset_password

from components.styles_loader import load_css
from components.theme_toggle import render_theme_toggle
from components.notifications import show_pending_notification


# =========================================================
# ENVIRONMENT CONFIGURATION
# =========================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent

ENV_PATH = PROJECT_ROOT / ".env"

load_dotenv(dotenv_path=ENV_PATH)


# =========================================================
# RESTORE PERSISTENT BROWSER SESSION
# =========================================================

def restore_browser_session() -> bool:
    """
    Restore authentication using the encrypted browser cookie.

    FastAPI validates the cookie before the user is authenticated.
    """

    cookie_name = os.getenv(
        "SESSION_COOKIE_NAME",
        "medquad_session",
    )

    encrypted_cookie = st.context.cookies.get(cookie_name)

    if not encrypted_cookie:
        return False

    backend_url = os.getenv("BACKEND_URL")

    if not backend_url:
        return False

    try:
        response = httpx.get(
            f"{backend_url}/auth/session/me",
            cookies={
                cookie_name: encrypted_cookie
            },
            timeout=10.0,
        )

        if response.status_code != 200:
            return False

        auth_data = response.json()

        if not auth_data.get("authenticated"):
            return False

        st.session_state.authenticated = True
        st.session_state.user_id = auth_data["user_id"]
        st.session_state.user_email = auth_data["email"]

        st.session_state.page = "chatbot"

        return True

    except (httpx.HTTPError, ValueError, KeyError):
        return False


# =========================================================
# STREAMLIT PAGE CONFIGURATION
# =========================================================

st.set_page_config(
    page_title="MedQuad AI",
    page_icon="🩺",
    layout="wide",
    initial_sidebar_state="collapsed",
)


# =========================================================
# INITIALIZE SESSION STATE
# =========================================================

if "page" not in st.session_state:
    st.session_state.page = "home"

if "dark_mode" not in st.session_state:
    st.session_state.dark_mode = False


# =========================================================
# HANDLE COMPLETE BROWSER LOGOUT
# =========================================================

if st.query_params.get("page") == "logged_out":

    session_keys = [
        "authenticated",
        "user",
        "email",
        "user_id",
        "user_email",
        "user_name",
        "access_token",
        "refresh_token",
        "supabase_client",
        "messages",
        "password_recovery_verified",
        "password_recovery_access_token",
        "password_recovery_refresh_token",
    ]

    for key in session_keys:
        st.session_state.pop(key, None)

    st.session_state.authenticated = False
    st.session_state.page = "login"

    st.session_state.success_notification = (
        "Logged out successfully. See you again!"
    )

    st.query_params.clear()

    st.rerun()


# =========================================================
# HANDLE PAGE REQUESTS FROM URL
# =========================================================

requested_page = st.query_params.get("page")

if requested_page == "forgot_password":

    st.session_state.page = "forgot_password"

    del st.query_params["page"]

elif requested_page == "reset_password":

    # Keep the URL parameters until the recovery link
    # has been verified by reset_password.py.
    st.session_state.page = "reset_password"


# =========================================================
# INITIALIZE AUTHENTICATION
# =========================================================

if "authenticated" not in st.session_state:

    st.session_state.authenticated = False

    # A password recovery link must take priority
    # over any previously saved browser session.
    if st.session_state.page != "reset_password":

        restore_browser_session()


# =========================================================
# GOOGLE OAUTH - FASTAPI SESSION HANDOFF
# =========================================================

auth_ticket = st.query_params.get("auth_ticket")

if auth_ticket:

    st.query_params.clear()

    try:
        backend_url = os.getenv("BACKEND_URL")

        if not backend_url:
            raise ValueError(
                "BACKEND_URL is not configured"
            )

        response = httpx.post(
            f"{backend_url}/auth/session/exchange",
            json={
                "ticket": auth_ticket
            },
            timeout=10.0,
        )

        response.raise_for_status()

        auth_data = response.json()

        if not auth_data.get("authenticated"):
            raise ValueError(
                "Authentication was not confirmed"
            )

        st.session_state.authenticated = True

        st.session_state.user_id = (
            auth_data["user_id"]
        )

        st.session_state.user_email = (
            auth_data["email"]
        )

        st.session_state.access_token = (
            auth_data["access_token"]
        )

        st.session_state.refresh_token = (
            auth_data["refresh_token"]
        )

        st.session_state.success_notification = (
            "Signed in successfully! "
            "Welcome to MedQuad AI."
        )

        time.sleep(2)

        st.session_state.page = "chatbot"

        st.rerun()

    except (httpx.HTTPError, KeyError, ValueError):

        st.session_state.authenticated = False

        st.session_state.page = "login"

        st.error(
            "Google sign-in could not be completed. "
            "Please try again."
        )


# =========================================================
# LOAD LIGHT / DARK THEME
# =========================================================

theme = (
    "dark"
    if st.session_state.dark_mode
    else "light"
)

load_css(theme)

show_pending_notification()


# =========================================================
# DISPLAY THEME TOGGLE
# =========================================================

theme_left, theme_right = st.columns(
    [4, 1],
    vertical_alignment="center",
)

with theme_right:

    render_theme_toggle()


# =========================================================
# PAGE ROUTING
# =========================================================

current_page = st.session_state.page


# ---------------------------------------------------------
# HOME PAGE
# ---------------------------------------------------------

if current_page == "home":

    render_home()


# ---------------------------------------------------------
# LOGIN PAGE
# ---------------------------------------------------------

elif current_page == "login":

    render_login()


# ---------------------------------------------------------
# SIGNUP PAGE
# ---------------------------------------------------------

elif current_page == "signup":

    render_signup()


# ---------------------------------------------------------
# FORGOT PASSWORD PAGE
# ---------------------------------------------------------

elif current_page == "forgot_password":

    render_forgot_password()


# ---------------------------------------------------------
# RESET PASSWORD PAGE
# ---------------------------------------------------------

elif current_page == "reset_password":

    render_reset_password()


# ---------------------------------------------------------
# CHATBOT PAGE
# ---------------------------------------------------------

elif current_page == "chatbot":

    if not st.session_state.authenticated:

        st.session_state.page = "login"

        st.rerun()

    else:

        render_chatbot()


# ---------------------------------------------------------
# UNKNOWN PAGE
# ---------------------------------------------------------

else:

    st.session_state.page = "home"

    st.rerun()

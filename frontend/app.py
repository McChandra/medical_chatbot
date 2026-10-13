"""
MedQuad AI Streamlit Application

This module is the main entry point for the MedQuad AI frontend.

Responsibilities:
- Configure the Streamlit application
- Initialize application session state
- Load the global light/dark theme
- Display the theme toggle
- Route users between application views
"""

import streamlit as st

from home import render_home
from login import render_login
from signup import render_signup
from chat import render_chatbot
from forgot_password import render_forgot_password

from components.styles_loader import load_css
from components.theme_toggle import render_theme_toggle


import os
import time
import httpx
from pathlib import Path
from dotenv import load_dotenv

from components.notifications import show_pending_notification

# Locate the project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Locate the .env file
ENV_PATH = PROJECT_ROOT / ".env"

# Load environment variables
load_dotenv(dotenv_path=ENV_PATH)


def restore_browser_session() -> bool:
    """
    Restore authentication from an existing encrypted
    browser cookie.

    Returns True only when FastAPI validates the session.
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
            cookies={cookie_name: encrypted_cookie},
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

# ------------------------------------------------------------------
# PAGE CONFIGURATION
# ------------------------------------------------------------------

st.set_page_config(
    page_title="MedQuad AI",
    page_icon="🩺",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ------------------------------------------------------------------
# SESSION STATE
# ------------------------------------------------------------------

# Current application page
if "page" not in st.session_state:
    st.session_state.page = "home"

# --------------------------------------------------
# COMPLETE BROWSER LOGOUT
# --------------------------------------------------

if st.query_params.get("page") == "logged_out":

    # Clear authentication and previous chat data
    for key in [
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
    ]:
        st.session_state.pop(key, None)

    st.session_state.authenticated = False
    st.session_state.page = "login"

    st.session_state.success_notification = (
        "Logged out successfully. See you again!"
    )

    # Remove the temporary logout parameter
    st.query_params.clear()

    st.rerun()

# Forwarding to the forgot password page if requested via query parameter
requested_page = st.query_params.get("page")

if requested_page == "forgot_password":
    st.session_state.page = "forgot_password"
    del st.query_params["page"]


# Authentication state
if "authenticated" not in st.session_state:
    st.session_state.authenticated = False

    restore_browser_session()


# Theme state
if "dark_mode" not in st.session_state:
    st.session_state.dark_mode = False


# ---------------------------------------------------------
# GOOGLE OAUTH - FASTAPI SESSION HANDOFF
# ---------------------------------------------------------

auth_ticket = st.query_params.get("auth_ticket")

if auth_ticket:

    # Clear the temporary ticket from the URL
    st.query_params.clear()

    try:
        backend_url = os.getenv("BACKEND_URL")

        if not backend_url:
            raise ValueError("BACKEND_URL is not configured")

        # Exchange the one-time ticket with FastAPI
        response = httpx.post(
            f"{backend_url}/auth/session/exchange",
            json={"ticket": auth_ticket},
            timeout=10.0
        )

        response.raise_for_status()
        auth_data = response.json()

        if not auth_data.get("authenticated"):
            raise ValueError("Authentication was not confirmed")

        # Store authenticated session details
        st.session_state.authenticated = True
        st.session_state.user_id = auth_data["user_id"]
        st.session_state.user_email = auth_data["email"]
        st.session_state.access_token = auth_data["access_token"]
        st.session_state.refresh_token = auth_data["refresh_token"]

        # Navigate to the chatbot
        success_message = st.empty()
        st.session_state.success_notification = (
            "Signed in successfully! Welcome to MedQuad AI."
        )
        time.sleep(2)
        success_message.empty()
        st.session_state.page = "chatbot"
        st.rerun()

    except (httpx.HTTPError, KeyError, ValueError):
        st.session_state.authenticated = False
        st.session_state.page = "login"
        st.error(
            "Google sign-in could not be completed. "
            "Please try again."
        )


# ------------------------------------------------------------------
# THEME CONFIGURATION
# ------------------------------------------------------------------

theme = (
    "dark"
    if st.session_state.dark_mode
    else "light"
)

load_css(theme)
show_pending_notification()


# ------------------------------------------------------------------
# MEDQUAD TOP CONTROLS
# ------------------------------------------------------------------

theme_left, theme_right = st.columns(
    [4, 1],
    vertical_alignment="center",
)

with theme_right:
    render_theme_toggle()
    

# ------------------------------------------------------------------
# PAGE ROUTING
# ------------------------------------------------------------------

current_page = st.session_state.page


# ------------------------------------------------------------------
# HOME
# ------------------------------------------------------------------

if current_page == "home":

    render_home()


# ------------------------------------------------------------------
# LOGIN
# ------------------------------------------------------------------

elif current_page == "login":

    render_login()


# ------------------------------------------------------------------
# SIGN UP
# ------------------------------------------------------------------

elif current_page == "signup":

    render_signup()

#------------------------------------------------------------------
# FORGOT PASSWORD
# ------------------------------------------------------------------

elif current_page == "forgot_password":

    render_forgot_password()

# ------------------------------------------------------------------
# CHATBOT
# ------------------------------------------------------------------

elif current_page == "chatbot":

    # Prevent unauthenticated access to the chatbot
    if not st.session_state.authenticated:

        st.session_state.page = "login"

        st.rerun()

    else:

        render_chatbot()


# ------------------------------------------------------------------
# UNKNOWN PAGE
# ------------------------------------------------------------------

else:

    st.session_state.page = "home"

    st.rerun()

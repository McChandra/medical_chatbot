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

from components.styles_loader import load_css
from components.theme_toggle import render_theme_toggle

from auth_service import get_supabase_client


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


# Authentication state
if "authenticated" not in st.session_state:
    st.session_state.authenticated = False


# Theme state
if "dark_mode" not in st.session_state:
    st.session_state.dark_mode = False


# ---------------------------------------------------------
# GOOGLE OAUTH CALLBACK
# ---------------------------------------------------------

auth_code = st.query_params.get("code")

if auth_code:
    try:
        supabase = get_supabase_client()

        response = supabase.auth.exchange_code_for_session({
            "auth_code": auth_code
        })

        if response.user and response.session:
            st.session_state.authenticated = True
            st.session_state.user_id = response.user.id
            st.session_state.user_email = response.user.email
            st.session_state.page = "chatbot"

            st.query_params.clear()
            st.rerun()

        else:
            st.query_params.clear()
            st.session_state.page = "login"
            st.error("Google authentication was not completed.")

    except Exception:
        st.query_params.clear()
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
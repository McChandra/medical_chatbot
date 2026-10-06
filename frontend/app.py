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
from components.styles import load_css
from components.theme_toggle import render_theme_toggle


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

    st.info(
        "Sign-up page will be implemented next."
    )


# ------------------------------------------------------------------
# CHATBOT
# ------------------------------------------------------------------

elif current_page == "chatbot":

    # Prevent unauthenticated access to the chatbot
    if not st.session_state.authenticated:

        st.session_state.page = "login"

        st.rerun()

    else:

        st.info(
            "MedQuad AI chatbot will be implemented here."
        )


# ------------------------------------------------------------------
# UNKNOWN PAGE
# ------------------------------------------------------------------

else:

    st.session_state.page = "home"

    st.rerun()
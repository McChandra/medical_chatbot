
import re
import os

import streamlit as st
from dotenv import load_dotenv
from pathlib import Path

from auth_service import get_supabase_client


# =========================================================
# CONFIGURATION
# =========================================================

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=PROJECT_ROOT / ".env")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


# =========================================================
# EMAIL VALIDATION
# =========================================================

def validate_email(email: str) -> bool:
    """Validate basic email address format."""

    return bool(
        re.fullmatch(
            r"[^@\s]+@[^@\s]+\.[^@\s]+",
            email
        )
    )


# =========================================================
# PASSWORD VALIDATION
# =========================================================

def get_password_requirements(password: str) -> dict:
    """Check all four password requirements."""

    return {
        "At least 8 characters": len(password) >= 8,

        "At least one uppercase letter (A-Z)": bool(
            re.search(r"[A-Z]", password)
        ),

        "At least one number (0-9)": bool(
            re.search(r"[0-9]", password)
        ),

        "At least one special character (!, @, #, etc.)": bool(
            re.search(r"[^A-Za-z0-9]", password)
        ),
    }


def validate_password(password: str) -> bool:
    """Return True when all password rules are satisfied."""

    requirements = get_password_requirements(password)

    return all(requirements.values())


# =========================================================
# PASSWORD REQUIREMENTS DISPLAY
# =========================================================

def render_password_requirements(password: str):
    """Display live password validation feedback."""

    st.markdown("**Password must contain:**")

    requirements = get_password_requirements(password)

    for requirement, valid in requirements.items():

        icon = "✅" if valid else "❌"

        st.markdown(
            f"{icon} {requirement}"
        )

    if password and validate_password(password):
        st.success("Your password meets all requirements.")


# =========================================================
# SIGNUP PAGE
# =========================================================

def render_signup():
    """Render the MedQuad AI sign-up page."""

    # -----------------------------------------------------
    # BACK TO HOME
    # -----------------------------------------------------

    if st.button(
        "Back",
        icon=":material/arrow_back:",
        key="signup_back",
    ):
        st.session_state.page = "home"
        st.rerun()

    # -----------------------------------------------------
    # CENTERED LAYOUT
    # -----------------------------------------------------

    left, center, right = st.columns([1.5, 2, 1.5])

    with center:

        # -------------------------------------------------
        # HEADER
        # -------------------------------------------------

        st.markdown(
            """<div class="auth-branding">
        <div class="auth-branding-eyebrow">WELCOME TO</div>
        <div class="auth-branding-row">
            <div class="auth-branding-logo">✚</div>
            <div class="auth-branding-title">
                MedQuad <span>AI</span>
            </div>
        </div>
        </div>""",
            unsafe_allow_html=True,
            )

        st.markdown(
    """<div class="auth-page-heading">
<h1>Create Your Account</h1>
<p>Join MedQuad AI and start asking trusted health questions.</p>
</div>""",
    unsafe_allow_html=True,
            )

        # -------------------------------------------------
        # GOOGLE SIGNUP
        # -------------------------------------------------

        st.link_button(
            "Continue with Google",
            f"{BACKEND_URL}/auth/google/login",
            use_container_width=True,
        )

        # -------------------------------------------------
        # DIVIDER
        # -------------------------------------------------

        st.markdown(
            """
<div class="auth-divider">
    <span>or continue with email</span>
</div>
            """,
            unsafe_allow_html=True,
        )

        # -------------------------------------------------
        # FULL NAME
        # -------------------------------------------------

        full_name = st.text_input(
            "Full name",
            placeholder="Enter your full name",
            key="signup_name",
        )

        # -------------------------------------------------
        # EMAIL ADDRESS
        # -------------------------------------------------

        email = st.text_input(
            "Email address",
            placeholder="you@example.com",
            key="signup_email",
        )

        # -------------------------------------------------
        # PASSWORD
        # -------------------------------------------------

        password = st.text_input(
            "Password",
            type="password",
            placeholder="Create a strong password",
            key="signup_password",
        )

        # -------------------------------------------------
        # LIVE PASSWORD REQUIREMENTS
        # -------------------------------------------------

        render_password_requirements(password)

        # -------------------------------------------------
        # CONFIRM PASSWORD
        # -------------------------------------------------

        confirm_password = st.text_input(
            "Confirm password",
            type="password",
            placeholder="Re-enter your password",
            key="signup_confirm_password",
        )

        # -------------------------------------------------
        # CREATE ACCOUNT
        # -------------------------------------------------

        if st.button(
            "Create Account",
            type="primary",
            icon=":material/person_add:",
            use_container_width=True,
            key="signup_submit",
        ):

            clean_name = full_name.strip()
            clean_email = email.strip().lower()

            # Validate form inputs
            if not clean_name:

                st.warning(
                    "Please enter your full name."
                )

            elif not validate_email(clean_email):

                st.warning(
                    "Please enter a valid email address."
                )

            elif not password:

                st.warning(
                    "Please create a password."
                )

            elif not validate_password(password):

                st.warning(
                    "Your password must meet all four "
                    "security requirements."
                )

            elif password != confirm_password:

                st.warning(
                    "Passwords do not match."
                )

            else:

                try:
                    # Connect to Supabase
                    supabase = get_supabase_client()

                    # Register new user
                    response = supabase.auth.sign_up({
                        "email": clean_email,
                        "password": password,
                        "options": {
                            "data": {
                                "full_name": clean_name
                            }
                        }
                    })

                except Exception as error:
                    import traceback

                    print("\n========== SUPABASE SIGNUP ERROR ==========")
                    print("Error type:", type(error).__name__)
                    print("Error message:", str(error))
                    traceback.print_exc()
                    print("===========================================\n")

                    st.error(
                        "Registration failed. Check the Streamlit "
                        "terminal in VS Code for details."
                    )

                else:

                    if response.user is None:

                        st.error(
                            "Account creation could not "
                            "be completed."
                        )

                    elif response.session is None:

                        # Email confirmation enabled
                        st.success(
                            "Registration submitted successfully! "
                            "Please check your email and follow "
                            "the verification link before signing in."
                        )

                    else:

                        # Session returned when email
                        # confirmation is disabled.
                        st.session_state.authenticated = True

                        st.session_state.user_id = (
                            response.user.id
                        )

                        st.session_state.user_email = (
                            response.user.email
                        )

                        st.session_state.user_name = (
                            clean_name
                        )

                        st.session_state.access_token = (
                            response.session.access_token
                        )

                        st.session_state.refresh_token = (
                            response.session.refresh_token
                        )

                        st.session_state.page = "chatbot"

                        st.rerun()

        # -------------------------------------------------
        # SIGN IN NAVIGATION
        # -------------------------------------------------

        st.markdown(
            """
<div class="auth-footer-text">
    Already have an account?
</div>
            """,
            unsafe_allow_html=True,
        )

        if st.button(
            "Sign In",
            icon=":material/login:",
            use_container_width=True,
            key="go_to_login",
        ):
            st.session_state.page = "login"
            st.rerun()

        # -------------------------------------------------
        # PRIVACY MESSAGE
        # -------------------------------------------------

        st.markdown(
            """
<div class="auth-privacy">
    🔒 Please avoid sharing sensitive medical information.
</div>
            """,
            unsafe_allow_html=True,
        )

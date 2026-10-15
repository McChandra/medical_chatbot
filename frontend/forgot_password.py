
import os
import re
import time

import streamlit as st
from auth_service import get_supabase_client


def render_forgot_password():
    """Render the MedQuad AI forgot-password page."""

    # Back to login
    if st.button("← Back to Sign In", key="forgot_back"):
        st.session_state.page = "login"
        st.rerun()

    # Page heading
    st.markdown(
        """
        <div class="auth-page-heading">
            <h1>Forgot Password?</h1>
            <p>
                Enter your registered email address.
                We'll send you a secure password reset link.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # Centered form
    left, center, right = st.columns([1.5, 2, 1.5])

    with center:

        with st.form(
            key="forgot_password_form",
            enter_to_submit=True,
            border=False,
        ):
            email = st.text_input(
                "Email Address",
                placeholder="Enter your registered email",
                key="forgot_password_email",
            )

            submitted = st.form_submit_button(
                "Send Reset Link",
                type="primary",
                use_container_width=True,
            )

        if not submitted:
            return

        # STEP 1: Validate email
        clean_email = email.strip().lower()

        if not clean_email:
            st.error("Please enter your email address.")
            return

        if not re.fullmatch(
            r"[^@\s]+@[^@\s]+\.[^@\s]+",
            clean_email,
        ):
            st.error("Please enter a valid email address.")
            return

        # STEP 2: Send password-reset email
        reset_url = os.getenv(
            "PASSWORD_RESET_URL",
            "http://localhost:8000/auth/reset-password",
        ).rstrip("/")

        try:
            supabase = get_supabase_client()

            with st.spinner("Sending password reset link..."):
                supabase.auth.reset_password_email(
                    clean_email,
                    options={
                        "redirect_to": reset_url,
                    },
                )

            st.success(
                "If an account exists for this email, "
                "a password reset link will be sent."
            )

            st.info(
                "Please check your inbox and spam folder."
            )

            # Wait for 2 seconds
            time.sleep(2)

            # Redirect to login page
            st.session_state.page = "login"
            st.query_params.clear()
            st.rerun()


        except Exception as error:
            error_text = str(error).lower()

            if "rate limit" in error_text:
                st.warning(
                    "Too many reset requests. "
                    "Please try again later."
                )
            else:
                st.error(
                    "Unable to send the password reset email. "
                    "Please try again later."
                )

                # Local development diagnostics.
                # Do not log authentication tokens.
                print(
                    "Password reset request failed:",
                    type(error).__name__,
                )

            # Wait for 2 seconds and redirect to login
            time.sleep(2)
            st.session_state.page = "login"
            st.query_params.clear()
            st.rerun()


import re
import time
import os

import streamlit as st
from auth_service import get_supabase_client


def render_forgot_password():

    if st.button("← Back to Sign In", key="forgot_back"):
        st.session_state.page = "login"
        st.rerun()

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

    left, center, right = st.columns([1.5, 2, 1.5])

    
    with center:

        with st.form(
            "forgot_password_form",
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
                key="send_reset_link",
            )

        if submitted:

            clean_email = email.strip().lower()

            # STEP 1: Validate email address
            if not clean_email:
                error_message = st.empty()
                error_message.error(
                    "Please enter your email address."
                )
                time.sleep(2)
                error_message.empty()
                return

            if not re.fullmatch(
                r"[^@\s]+@[^@\s]+\.[^@\s]+",
                clean_email,
            ):
                error_message = st.empty()
                error_message.error(
                    "Please enter a valid email address."
                )
                time.sleep(2)
                error_message.empty()
                return

            # STEP 2: Send password reset email
            try:
                supabase = get_supabase_client()

                frontend_url = os.getenv(
                    "FRONTEND_URL",
                    "http://localhost:8501",
                ).rstrip("/")

                supabase.auth.reset_password_email(
                    clean_email,
                    options={
                        "redirect_to": (
                            f"{frontend_url}/?page=reset_password"
                        )
                    },
                )

                success_message = st.empty()

                success_message.success(
                    "If an account exists for this email, "
                    "a password reset link will be sent."
                )

                time.sleep(2)
                success_message.empty()

                st.session_state.page = "login"
                st.rerun()

            except Exception as error:

                if "rate limit" in str(error).lower():
                    st.warning(
                        "Too many email requests. "
                        "Please try again later."
                    )
                else:
                    st.error(
                        "Unable to process your request. "
                        "Please try again later."
                    )


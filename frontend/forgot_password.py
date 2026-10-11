
import re
import time

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

        email = st.text_input(
            "Email Address",
            placeholder="Enter your registered email",
            key="forgot_password_email",
        )

        if st.button(
            "Send Reset Link",
            type="primary",
            use_container_width=True,
            key="send_reset_link",
        ):

            clean_email = email.strip().lower()

            if not re.fullmatch(
                r"[^@\s]+@[^@\s]+\.[^@\s]+",
                clean_email,
            ):
                st.error("Please enter a valid email address.")
                return

            try:
                supabase = get_supabase_client()

                supabase.auth.reset_password_email(
                    clean_email,
                    options={
                        "redirect_to": "http://localhost:8501/?page=reset_password"
                    },
                )

                # Show a success message to the user
                success_message = st.empty()

                success_message.success(
                    "If an account exists for this email, "
                    "a password reset link will be sent."
                )

                # Wait for 2 seconds before clearing the message
                time.sleep(2)

                # Remove the success message after the delay
                success_message.empty()

                # Redirect the user back to the login page
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

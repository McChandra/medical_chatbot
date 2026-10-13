import streamlit as st
import re


from auth_service import (
    sign_in_with_email,
    prepare_persistent_session,
)
import time


def render_login():
    """Render the MedQuad AI login page."""

    # ---------------------------------------------------------
    # BACK TO HOME
    # ---------------------------------------------------------

    if st.button(
        "← Back",
        key="login_back",
    ):
        st.session_state.page = "home"
        st.rerun()


    # ---------------------------------------------------------
    # LOGIN HEADER
    # ---------------------------------------------------------

    
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
<h1>Welcome Back</h1>
<p>Sign in to continue to your trusted health AI assistant.</p>
</div>""",
    unsafe_allow_html=True,
    )

    # ---------------------------------------------------------
    # LOGIN FORM
    # ---------------------------------------------------------

    left, center, right = st.columns([1.5, 2, 1.5])

    with center:

        # Google Login
        st.link_button(
            "Continue with Google",
            "http://localhost:8000/auth/google/login",
            use_container_width=True,
        )

        # Divider
        st.markdown(
            """<div class="auth-divider">
<span>or continue with email</span>
</div>""",
            unsafe_allow_html=True,
        )

        # -----------------------------------------------------
        # EMAIL LOGIN FORM
        # -----------------------------------------------------

        with st.form(
            key="login_form",
            enter_to_submit=True,
            border=False,
        ):

            email = st.text_input(
                "Email address",
                placeholder="you@example.com",
                key="login_email",
            )

            password = st.text_input(
                "Password",
                type="password",
                placeholder="Enter your password",
                key="login_password",
            )

            st.markdown(
                """<div class="forgot-password">
<a href="/?page=forgot_password" target="_self">
Forgot password?
</a>
</div>""",
                unsafe_allow_html=True,
            )

            submitted = st.form_submit_button(
                "Sign In",
                type="primary",
                use_container_width=True,
                key="login_submit",
            )

        # -----------------------------------------------------
        # VALIDATE AND SIGN IN
        # -----------------------------------------------------

        if submitted:

            clean_email = email.strip().lower()

            if not clean_email:
                st.warning("Please enter your email address.")

            elif not re.fullmatch(
                r"[^@\s]+@[^@\s]+\.[^@\s]+",
                clean_email,
            ):
                message = st.empty()
                message.error(
                    "Invalid email address. Please enter a valid email."
                )
                time.sleep(2)
                message.empty()

            elif not password:
                st.warning("Please enter your password.")

            else:
                try:
                    response = sign_in_with_email(
                        email=clean_email,
                        password=password,
                    )

                    if response.user and response.session:

                        session_data = prepare_persistent_session(response)

                        st.session_state.authenticated = True
                        st.session_state.user_id = session_data["user_id"]
                        st.session_state.email = session_data["email"]
                        st.session_state.access_token = session_data["access_token"]
                        st.session_state.refresh_token = session_data["refresh_token"]

                        st.session_state.page = "chatbot"
                        st.rerun()

                    else:
                        st.error(
                            "Authentication failed. Please check your credentials."
                        )

                except Exception as error:
                    st.error(f"Authentication Failed: {error}")
                    
        # -----------------------------------------------------
        # CREATE ACCOUNT
        # -----------------------------------------------------

        st.markdown(
"""<div class="auth-footer-text">
Don't have an account?
</div>""",
            unsafe_allow_html=True,
        )


        if st.button(
            "Create an account",
            use_container_width=True,
            key="go_to_signup",
        ):
            st.session_state.page = "signup"

            st.rerun()


    # ---------------------------------------------------------
    # PRIVACY
    # ---------------------------------------------------------

    st.markdown(
"""<div class="auth-privacy">
🔒 Your health questions are treated as private information.
</div>""",
        unsafe_allow_html=True,
    )
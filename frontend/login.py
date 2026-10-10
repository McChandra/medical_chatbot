import streamlit as st
from auth_service import sign_in_with_email
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

        st.link_button(
    "Continue with Google",
    "http://localhost:8000/auth/google/login",
    use_container_width=True
        )


        # Divider
        st.markdown(
"""<div class="auth-divider">
<span>or continue with email</span>
</div>""",
            unsafe_allow_html=True,
        )


        # Email
        email = st.text_input(
            "Email address",
            placeholder="you@example.com",
            key="login_email",
        )


        # Password
        password = st.text_input(
            "Password",
            type="password",
            placeholder="Enter your password",
            key="login_password",
        )


        # Forgot password
        st.markdown(
"""<div class="forgot-password">
Forgot password?
</div>""",
            unsafe_allow_html=True,
        )


        # Sign in
        if st.button(
            "Sign In",
            type="primary",
            use_container_width=True,
            key="login_submit",
        ):

            if not email.strip():

                st.warning(
                    "Please enter your email address."
                )

            elif not password:

                st.warning(
                    "Please enter your password."
                )

            else:

                # Temporary development authentication
                try:
                    response = sign_in_with_email(
                        email=email.strip(),
                        password=password,
                    )

                    # Checking the response user and session
                    if response.user and response.session:
                        st.session_state.authenticated = True
                        st.session_state.user = response.user.id
                        st.session_state.email = response.user.email
                        success_message = st.empty()
                        st.session_state.success_notification = (
                            "Signed in successfully! Welcome to MedQuad AI."
                        )
                        time.sleep(2)
                        success_message.empty()  
                        st.session_state.page = "chatbot"

                        st.rerun()

                    else:
                        st.error("Authentication failed. Please check your credentials.")

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
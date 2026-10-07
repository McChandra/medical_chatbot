import streamlit as st


def render_signup():
    """Render the MedQuad AI sign-up page."""

    # ---------------------------------------------------------
    # BACK TO HOME
    # ---------------------------------------------------------

    if st.button(
        "Back",
        icon=":material/arrow_back:",
        key="signup_back",
    ):
        st.session_state.page = "home"
        st.rerun()


    # ---------------------------------------------------------
    # SIGN-UP LAYOUT
    # ---------------------------------------------------------

    left, center, right = st.columns([1.5, 2, 1.5])

    with center:

        # -----------------------------------------------------
        # SIGN-UP HEADER
        # -----------------------------------------------------

        st.markdown(
"""<div class="auth-header">
<div class="auth-brand">✚ MedQuad <span>AI</span></div>
<h1>Create Your Account</h1>
<p>Join MedQuad AI and start asking trusted health questions.</p>
</div>""",
            unsafe_allow_html=True,
        )


        # -----------------------------------------------------
        # GOOGLE SIGN-UP
        # -----------------------------------------------------

        if st.button(
            "Continue with Google",
            icon=":material/account_circle:",
            use_container_width=True,
            key="google_signup",
        ):
            st.info(
                "Google authentication will be connected later."
            )


        # -----------------------------------------------------
        # DIVIDER
        # -----------------------------------------------------

        st.markdown(
"""<div class="auth-divider">
<span>or continue with email</span>
</div>""",
            unsafe_allow_html=True,
        )


        # -----------------------------------------------------
        # FULL NAME
        # -----------------------------------------------------

        full_name = st.text_input(
            "Full name",
            placeholder="Enter your full name",
            key="signup_name",
        )


        # -----------------------------------------------------
        # EMAIL
        # -----------------------------------------------------

        email = st.text_input(
            "Email address",
            placeholder="you@example.com",
            key="signup_email",
        )


        # -----------------------------------------------------
        # PASSWORD
        # -----------------------------------------------------

        password = st.text_input(
            "Password",
            type="password",
            placeholder="Create a password",
            key="signup_password",
        )


        # -----------------------------------------------------
        # CONFIRM PASSWORD
        # -----------------------------------------------------

        confirm_password = st.text_input(
            "Confirm password",
            type="password",
            placeholder="Re-enter your password",
            key="signup_confirm_password",
        )


        # -----------------------------------------------------
        # CREATE ACCOUNT
        # -----------------------------------------------------

        if st.button(
            "Create Account",
            type="primary",
            icon=":material/person_add:",
            use_container_width=True,
            key="signup_submit",
        ):

            if not full_name.strip():
                st.warning(
                    "Please enter your full name."
                )

            elif not email.strip():
                st.warning(
                    "Please enter your email address."
                )

            elif not password:
                st.warning(
                    "Please create a password."
                )

            elif len(password) < 8:
                st.warning(
                    "Password must contain at least 8 characters."
                )

            elif password != confirm_password:
                st.warning(
                    "Passwords do not match."
                )

            else:
                # Temporary development authentication.
                # No password is stored.

                st.session_state.authenticated = True
                st.session_state.user_name = full_name.strip()

                st.session_state.page = "chatbot"

                st.rerun()


        # -----------------------------------------------------
        # LOGIN NAVIGATION
        # -----------------------------------------------------

        st.markdown(
"""<div class="auth-footer-text">
Already have an account?
</div>""",
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


        # -----------------------------------------------------
        # PRIVACY MESSAGE
        # -----------------------------------------------------

        st.markdown(
"""<div class="auth-privacy">
🔒 Your health questions are treated as private information.
</div>""",
            unsafe_allow_html=True,
        )

import time

import streamlit as st
from auth_service import get_supabase_client


def render_reset_password():
    """Verify the recovery link and let the user set a new password."""

    st.markdown(
        """
        <div class="auth-page-heading">
            <h1>Create New Password</h1>
            <p>
                Enter and confirm your new password
                to secure your MedQuad AI account.
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    # ---------------------------------------------
    # STEP 1: VERIFY THE SUPABASE RECOVERY LINK
    # ---------------------------------------------

    if not st.session_state.get(
        "password_recovery_verified", False
    ):

        token_hash = st.query_params.get("token_hash")
        recovery_type = st.query_params.get("type")

        if not token_hash or recovery_type != "recovery":
            st.error(
                "Invalid password reset link. "
                "Please request a new reset email."
            )
            return

        try:
            supabase = get_supabase_client()

            result = supabase.auth.verify_otp(
                {
                    "token_hash": token_hash,
                    "type": "recovery",
                }
            )

            if not result.session:
                st.error(
                    "The password reset link could not be verified."
                )
                return

            st.session_state.password_recovery_verified = True

            st.session_state.password_recovery_access_token = (
                result.session.access_token
            )

            st.session_state.password_recovery_refresh_token = (
                result.session.refresh_token
            )

            # Remove the recovery token from the browser URL.
            st.query_params.clear()

            st.rerun()

        except Exception:
            st.error(
                "This password reset link has expired "
                "or has already been used."
            )
            return

    # ---------------------------------------------
    # STEP 2: DISPLAY NEW PASSWORD FORM
    # ---------------------------------------------

    left, center, right = st.columns([1.5, 2, 1.5])

    with center:
        error_message = st.empty()

        with st.form(
            "reset_password_form",
            enter_to_submit=True,
            border=False
        ):
            new_password = st.text_input(
                "New Password",
                type="password",
                placeholder="Enter your new password",
                key="reset_new_password",
            )

            confirm_password = st.text_input(
                "Confirm Password",
                type="password",
                placeholder="Re-enter your new password",
                key="reset_confirm_password",
            )

            submitted = st.form_submit_button(
                "Save New Password",
                type="primary",
                use_container_width=True,
                key="save_new_password",
            )

        if submitted:

            if not new_password:
                error_message("Please enter your new password.")
                return

            # Validate the Password
            if len(new_password) < 8:
                error_message("Password must contain at least 8 characters.")
                return

            if new_password != confirm_password:
                error_message("Passwords do not match.")
                return


            # -------------------------------------
            # STEP 4: UPDATE PASSWORD IN SUPABASE
            # -------------------------------------

            try:
                supabase = get_supabase_client()

                supabase.auth.set_session(
                    st.session_state.password_recovery_access_token,
                    st.session_state.password_recovery_refresh_token,
                )

                supabase.auth.update_user(
                    {
                        "password": new_password
                    }
                )

                try:
                    supabase.auth.sign_out()
                except Exception:
                    pass

                # Remove recovery credentials.
                for key in [
                    "password_recovery_verified",
                    "password_recovery_access_token",
                    "password_recovery_refresh_token",
                ]:
                    st.session_state.pop(key, None)

                st.session_state.authenticated = False

                st.success(
                    "Password successfully updated! "
                    "Redirecting to Login in 2 seconds..."
                )

                time.sleep(2)

                st.session_state.page = "login"
                st.query_params.clear()
                st.rerun()

            except Exception:
                st.error(
                    "Unable to update your password. "
                    "Please request a new reset link."
                )

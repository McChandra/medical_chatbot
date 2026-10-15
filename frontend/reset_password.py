
import re
import time

import streamlit as st
from auth_service import get_supabase_client


def validate_password(password):
    """Return a validation message or None."""

    if len(password) < 8:
        return "Password must contain at least 8 characters."

    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter."

    if not re.search(r"[0-9]", password):
        return "Password must contain at least one number."

    if not re.search(r"[^A-Za-z0-9]", password):
        return "Password must contain at least one special character."

    return None


def render_reset_password():
    """Verify recovery link and update the user's password."""

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

    # STEP 1: VERIFY RECOVERY LINK
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

            # Remove token from browser URL.
            st.query_params.clear()
            st.rerun()

        except Exception:
            st.error(
                "This password reset link has expired "
                "or has already been used."
            )
            return

    # STEP 2: DISPLAY PASSWORD FORM
    left, center, right = st.columns([1.5, 2, 1.5])

    with center:
        st.caption(
            "Password requirements: at least 8 characters, "
            "one uppercase letter, one number, "
            "and one special character."
        )

        with st.form(
            "reset_password_form",
            enter_to_submit=True,
            border=False,
        ):
            new_password = st.text_input(
                "New Password",
                type="password",
                placeholder="Enter your new password",
                key="reset_new_password",
            )

            confirm_password = st.text_input(
                "Confirm New Password",
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

        if not submitted:
            return

        # STEP 3: VALIDATE PASSWORD
        validation_error = validate_password(new_password)

        if validation_error:
            st.error(validation_error)
            return

        if new_password != confirm_password:
            st.error("Passwords do not match.")
            return

        # STEP 4: UPDATE PASSWORD
        try:
            supabase = get_supabase_client()

            supabase.auth.set_session(
                st.session_state.password_recovery_access_token,
                st.session_state.password_recovery_refresh_token,
            )

            supabase.auth.update_user(
                {"password": new_password}
            )

            # End recovery session.
            try:
                supabase.auth.sign_out()
            except Exception:
                pass

            # Clear recovery credentials.
            for key in [
                "password_recovery_verified",
                "password_recovery_access_token",
                "password_recovery_refresh_token",
            ]:
                st.session_state.pop(key, None)

            st.session_state.authenticated = False

            st.success(
                "Successfully changed the password! "
                "Redirecting to Login..."
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

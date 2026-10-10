
import streamlit as st


def show_pending_notification():
    """Display a success notification after navigation."""

    message = st.session_state.pop(
        "success_notification",
        None,
    )

    if message:
        st.toast(message, icon="✅")

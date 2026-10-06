import streamlit as st


def update_theme():
    """Update the application theme."""
    st.session_state.dark_mode = st.session_state.theme_toggle


def render_theme_toggle():
    """Render the MedQuad AI light/dark theme toggle."""

    if "dark_mode" not in st.session_state:
        st.session_state.dark_mode = False

    label = (
        "🌙 Dark"
        if st.session_state.dark_mode
        else "☀️ Light"
    )

    st.toggle(
        label,
        value=st.session_state.dark_mode,
        key="theme_toggle",
        on_change=update_theme,
    )
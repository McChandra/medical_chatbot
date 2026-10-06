import streamlit as st


def render_home():
    """Render the MedQuad AI landing page."""

    # ---------------------------------------------------------
    # LANDING PAGE HEADER
    # ---------------------------------------------------------

    st.markdown(
        """
<div style="text-align: center; padding: 60px 20px 30px 20px;">

<div style="
    font-size: 18px;
    color: #0866F5;
    font-weight: 600;
    letter-spacing: 1px;
">
WELCOME TO
</div>

<h1 style="
    font-size: 56px;
    margin: 8px 0;
    color: #092664;
">
MedQuad <span style="color: #0866F5;">AI</span>
</h1>

<h3 style="
    color: #162B59;
    font-weight: 500;
">
Your Trusted Health AI Assistant
</h3>

<p style="
    max-width: 650px;
    margin: 20px auto;
    font-size: 18px;
    color: #536587;
    line-height: 1.6;
">
Ask questions about symptoms, conditions, treatments,
prevention, and general health information.
</p>

</div>
""",
        unsafe_allow_html=True,
    )

    # ---------------------------------------------------------
    # ACTION BUTTONS
    # ---------------------------------------------------------

    left, center, right = st.columns([1.5, 2, 1.5])

    with center:

        if st.button(
            "Get Started",
            type="primary",
            use_container_width=True,
        ):
            st.session_state.page = "signup"
            st.rerun()

        if st.button(
            "I already have an account",
            use_container_width=True,
        ):
            st.session_state.page = "login"
            st.rerun()

    # ---------------------------------------------------------
    # SAFETY NOTICE
    # ---------------------------------------------------------

    st.markdown(
        """
<div style="
    text-align: center;
    color: #667694;
    font-size: 14px;
    padding: 35px 10px 10px 10px;
">
🛡️ <strong>Reliable Health Information</strong>
<br><br>
MedQuad AI provides educational health information
and is not a substitute for professional medical advice.
</div>
""",
        unsafe_allow_html=True,
    )
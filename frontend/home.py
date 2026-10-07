import streamlit as st


def render_home():
    """Render the public MedQuad AI landing page."""


    # ---------------------------------------------------------
    # HERO
    # ---------------------------------------------------------

    st.markdown(
"""<section class="home-hero">

<div class="home-eyebrow">
WELCOME TO
</div>

<div class="home-hero-brand">
<div class="home-hero-logo">✚</div>

<div class="home-hero-title">
MedQuad <span>AI</span>
</div>
</div>

<h2>
Your Trusted Health AI Assistant
</h2>

<p>
Ask questions about symptoms, conditions, treatments,
prevention, and general health information.
</p>

</section>""",
    unsafe_allow_html=True,
    )

    # ---------------------------------------------------------
    # ACTIONS
    # ---------------------------------------------------------

    left, center, right = st.columns([1.5, 2, 1.5])

    with center:

        if st.button(
            "Get Started",
            type="primary",
            icon=":material/arrow_forward:",
            use_container_width=True,
            key="home_get_started",
        ):
            st.session_state.page = "signup"
            st.rerun()

        if st.button(
            "I already have an account",
            icon=":material/login:",
            use_container_width=True,
            key="home_login",
        ):
            st.session_state.page = "login"
            st.rerun()

    # ---------------------------------------------------------
    # SAFETY NOTICE
    # ---------------------------------------------------------

    st.markdown(
"""<div class="home-safety">
<div class="home-safety-heading">
<span>🛡️</span>
<strong>Reliable Health Information</strong>
</div>

<p>
MedQuad AI provides educational health information and is
not a substitute for professional medical advice.
</p>
</div>""",
        unsafe_allow_html=True,
    )
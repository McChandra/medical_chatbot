import streamlit as st
import httpx
from copilot_client import api


#----------------------------------------------------------
# Logout Functionality
#----------------------------------------------------------


def logout_user():
    """
    Clear the Streamlit authentication state.

    The browser must also visit FastAPI to delete
    the persistent authentication cookie.
    """

    supabase = st.session_state.get("supabase_client")

    if supabase is not None:
        try:
            supabase.auth.sign_out()
        except Exception:
            pass

    session_keys = [
        "authenticated",
        "user",
        "email",
        "user_id",
        "user_email",
        "user_name",
        "access_token",
        "refresh_token",
        "supabase_client",
        "messages",
    ]

    for key in session_keys:
        st.session_state.pop(key, None)

    st.session_state.authenticated = False
    st.session_state.page = "login"
    st.session_state.logout_pending = True
    st.query_params.clear()

# =========================================================
# =========================================================

# MAIN CHAT PAGE
# =========================================================

def render_chatbot():
    """Render the responsive MedQuad AI dashboard."""

    if "messages" not in st.session_state:
        st.session_state.messages = []

    render_dashboard_header()
    try:
        context = api("GET", "context")
    except (httpx.HTTPError, ValueError):
        st.error("Research Copilot is unavailable. Check the API connection and sign in again.")
        render_sidebar()
        return
    topic = st.selectbox("Research topic", context["topics"], key="copilot_topic")
    st.selectbox("Research deck", range(1, len(context["decks"]) + 1),
                 format_func=lambda number: context["decks"][number - 1], key="copilot_deck")
    st.caption("Ask public education questions only. Omit names, records and personal health details.")

    # Detect browser viewport width.
    # Requires a Streamlit version supporting st.context.url
    # for URL access; viewport width itself is not exposed
    # through this API.

    # Keep the desktop sidebar, but use a compact menu
    # on mobile through CSS-controlled containers.
    sidebar_col, main_col = st.columns(
        [1.3, 4.7],
        gap="medium",
        vertical_alignment="top",
    )

    with sidebar_col:
        render_sidebar()

    with main_col:
        render_hero()
        examples = ("What is {topic}?", "Which tests identify {topic}?", "What research covers {topic}?",
                    "Which datasets cover {topic}?", "What are risk factors for {topic}?",
                    "What are the symptoms of {topic}?", "Which facilities cover {topic}?",
                    "What clinical evidence covers {topic}?")
        example = examples[st.session_state.copilot_deck - 1].format(topic=topic)
        if st.button(example, key="copilot_example"):
            submit_question(example)

    question = st.chat_input(
        "Ask about the selected topic and deck...",
        max_chars=500,
        key="health_question_input",
    )

    if question:
        submit_question(question)


# =========================================================
# HEADER
# =========================================================

def render_dashboard_header():
    """Render the top MedQuad AI dashboard header."""

    brand_col, nav_col, account_col = st.columns(
        [2.5, 2.2, 0.9],
        vertical_alignment="center",
    )

    with brand_col:
        st.markdown(
"""<div class="dashboard-brand">
<div class="dashboard-brand-icon">✚</div>
<div class="dashboard-brand-text">
<div class="dashboard-brand-name">MedQuad <span>AI</span></div>
<div class="dashboard-brand-subtitle">Your Trusted Health AI Assistant</div>
</div>
</div>""",
    unsafe_allow_html=True,
    )

    with nav_col:
        st.markdown(
"""<div class="dashboard-navigation">
<div class="dashboard-nav-item dashboard-nav-active">
<span class="dashboard-nav-icon">⌂</span>
<span>Home</span>
</div>
<div class="dashboard-nav-item">
<span class="dashboard-nav-icon">ⓘ</span>
<span>About</span>
</div>
<div class="dashboard-nav-item">
<span class="dashboard-nav-icon">▣</span>
<span>Health Resources</span>
</div>
</div>""",
    unsafe_allow_html=True,
    )


    with account_col:
        theme_class = (
        "medquad-dark"
        if st.session_state.get("dark_mode", False)
        else "medquad-light"
    )

        logout_html = """
    <a
        href="http://localhost:8000/auth/session/browser/logout"
        target="_top"
        class="medquad-logout-btn THEME_CLASS"
    >
        <span>↪ Logout</span>
    </a>
    """

        st.html(
        logout_html.replace("THEME_CLASS", theme_class)
    )


# =========================================================
# LEFT SIDEBAR
# =========================================================

def render_sidebar():
    """Render the left navigation shown in screenshot 2."""

    if st.button(
        "New Chat",
        icon=":material/add:",
        type="primary",
        use_container_width=True,
        key="new_chat_button",
    ):
        st.session_state.messages = []
        st.rerun()

    st.markdown(
"""<div class="sidebar-navigation">
<div class="sidebar-nav-item sidebar-nav-active">
<span class="sidebar-nav-icon">◯</span>
<span>Chat</span>
</div>
<div class="sidebar-nav-item">
<span class="sidebar-nav-icon">▤</span>
<span>Health Library</span>
</div>
<div class="sidebar-nav-item">
<span class="sidebar-nav-icon">♡</span>
<span>Saved Answers</span>
</div>
<div class="sidebar-nav-item">
<span class="sidebar-nav-icon">⚙</span>
<span>Settings</span>
</div>
</div>
<div class="sidebar-safety-card">
<div class="sidebar-safety-icon">✚</div>
<div class="sidebar-safety-title">
Reliable<br>
Health Information
</div>
<div class="sidebar-safety-text">
Get evidence-based answers to your health questions.
Not a substitute for professional medical advice.
</div>
</div>
""",
        unsafe_allow_html=True,
    )

# =========================================================
# MEDICAL HERO
# =========================================================

def render_hero():
    """Render the screenshot-2 MedQuad AI medical hero."""

    st.markdown(
        """
<div class="chat-hero">
<div class="chat-hero-content">
<div class="chat-hero-eyebrow">
WELCOME TO
</div>
<div class="chat-hero-title">
MedQuad <span>AI</span>
</div>
<div class="chat-hero-subtitle">
Your personal health Q&amp;A assistant
</div>
<div class="chat-hero-description">
Ask questions about symptoms, conditions, treatments, medications, and general health information.
</div>
</div>
<div class="chat-hero-visual">
<div class="medical-orbit orbit-stethoscope">🩺</div>
<div class="medical-orbit orbit-heart">❤️</div>
<div class="medical-orbit orbit-pill">💊</div>
<div class="medical-orbit orbit-document">▤</div>
<div class="medical-robot">
<div class="robot-antenna">
<div class="robot-antenna-ball"></div>
</div>
<div class="robot-head">
<div class="robot-face">
<span class="robot-eye"></span>
<span class="robot-eye"></span>
</div>
</div>
<div class="robot-body">
<span>✚</span>
</div>
</div>
</div>
</div>
""",
        unsafe_allow_html=True,
    )


# =========================================================
# =========================================================

# QUESTION SUBMISSION
# =========================================================

def submit_question(question):
    """Request a scoped answer without retaining the raw question."""

    question = question.strip()

    if not question:
        return

    try:
        reply = api("POST", "answer", json={
            "topic": st.session_state.copilot_topic, "deck": st.session_state.copilot_deck,
            "question": question,
        })
    except (httpx.HTTPError, ValueError):
        st.error("Unable to retrieve a source response. Check your session or retry.")
        return
    st.session_state.messages = [{
        "topic": st.session_state.copilot_topic, "deck": st.session_state.copilot_deck,
        "reply": reply,
    }]
    st.session_state.page = "response"
    st.rerun()

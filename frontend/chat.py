import streamlit as st


# =========================================================
# SUGGESTED QUESTIONS
# =========================================================

SUGGESTED_QUESTIONS = [
    "What are the symptoms of dengue?",
    "Tell me about Vitamin D deficiency",
    "How can I improve my heart health?",
    "What are the treatment options for type 2 diabetes?",
]


# =========================================================
# MAIN CHAT PAGE
# =========================================================

def render_chatbot():
    """Render the MedQuad AI new-chat dashboard."""

    if "messages" not in st.session_state:
        st.session_state.messages = []

    render_dashboard_header()

    sidebar_col, main_col = st.columns(
        [1.05, 4.6],
        gap="large",
    )

    with sidebar_col:
        render_sidebar()

    with main_col:
        render_hero()
        render_suggestions()

    # Streamlit keeps chat_input fixed at the bottom.
    question = st.chat_input(
        "Ask your health question...",
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
        [2.5, 2.2, 0.45],
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
# SUGGESTED QUESTIONS
# =========================================================

def render_suggestions():
    """Render the four question cards from screenshot 2."""

    st.markdown(
        """
<div class="suggested-heading">
    <span class="suggested-heading-icon">💡</span>
    <span>Try asking...</span>
</div>
""",
        unsafe_allow_html=True,
    )

    columns = st.columns(4, gap="small")

    icons = [
        ":material/stethoscope:",
        ":material/medication:",
        ":material/favorite:",
        ":material/description:",
    ]

    for index, question in enumerate(SUGGESTED_QUESTIONS):

        with columns[index]:

            if st.button(
                question,
                icon=icons[index],
                use_container_width=True,
                key=f"suggestion_{index}",
            ):
                submit_question(question)


# =========================================================
# QUESTION SUBMISSION
# =========================================================

def submit_question(question):
    """Store the question for the future response page."""

    question = question.strip()

    if not question:
        return

    st.session_state.messages = [
        {
            "role": "user",
            "content": question,
        }
    ]

    # We will connect this to response.py next.
    st.session_state.page = "response"

    st.rerun()
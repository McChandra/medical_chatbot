import streamlit as st


SUGGESTED_QUESTIONS = [
    "What are the common symptoms of diabetes?",
    "What causes high blood pressure?",
    "How can I prevent seasonal flu?",
    "When should I seek care for a headache?",
]


def render_chatbot():
    """Render the main MedQuad AI chatbot interface."""

    # ---------------------------------------------------------
    # CHAT STATE
    # ---------------------------------------------------------

    if "messages" not in st.session_state:
        st.session_state.messages = []


    # ---------------------------------------------------------
    # HEADER
    # ---------------------------------------------------------

    header_left, header_right = st.columns(
        [4, 1],
        vertical_alignment="center",
    )

    with header_left:
        st.markdown(
"""<div class="chat-brand">
✚ MedQuad <span>AI</span>
</div>""",
            unsafe_allow_html=True,
        )

    with header_right:
        if st.button(
            "Logout",
            icon=":material/logout:",
            use_container_width=True,
            key="logout",
        ):
            st.session_state.authenticated = False
            st.session_state.page = "home"
            st.session_state.messages = []

            st.rerun()


    st.divider()


    # ---------------------------------------------------------
    # EMPTY / WELCOME STATE
    # ---------------------------------------------------------

    if not st.session_state.messages:

        st.markdown(
"""<div class="chat-welcome">
<div class="chat-medical-icon">✚</div>

<h1>How can I help you today?</h1>

<p>
Ask a health-related question and MedQuad AI will
help you find relevant medical information.
</p>
</div>""",
            unsafe_allow_html=True,
        )


        st.markdown(
            "### Suggested questions"
        )


        col1, col2 = st.columns(2)

        with col1:

            if st.button(
                SUGGESTED_QUESTIONS[0],
                icon=":material/medical_information:",
                use_container_width=True,
                key="suggestion_1",
            ):
                add_user_question(
                    SUGGESTED_QUESTIONS[0]
                )

            if st.button(
                SUGGESTED_QUESTIONS[2],
                icon=":material/health_and_safety:",
                use_container_width=True,
                key="suggestion_3",
            ):
                add_user_question(
                    SUGGESTED_QUESTIONS[2]
                )


        with col2:

            if st.button(
                SUGGESTED_QUESTIONS[1],
                icon=":material/favorite:",
                use_container_width=True,
                key="suggestion_2",
            ):
                add_user_question(
                    SUGGESTED_QUESTIONS[1]
                )

            if st.button(
                SUGGESTED_QUESTIONS[3],
                icon=":material/emergency:",
                use_container_width=True,
                key="suggestion_4",
            ):
                add_user_question(
                    SUGGESTED_QUESTIONS[3]
                )


    # ---------------------------------------------------------
    # CONVERSATION
    # ---------------------------------------------------------

    else:

        for message in st.session_state.messages:

            with st.chat_message(
                message["role"]
            ):
                st.markdown(
                    message["content"]
                )


    # ---------------------------------------------------------
    # CHAT INPUT
    # ---------------------------------------------------------

    question = st.chat_input(
        "Ask a health question..."
    )

    if question:
        add_user_question(question)


def add_user_question(question):
    """Add a new question to the conversation."""

    question = question.strip()

    if not question:
        return

    st.session_state.messages.append(
        {
            "role": "user",
            "content": question,
        }
    )

    # Temporary response until model integration.
    st.session_state.messages.append(
        {
            "role": "assistant",
            "content": (
                "I'm currently running in frontend "
                "development mode. Your question was "
                "received successfully. The MedQuad AI "
                "model will be connected in a later step."
            ),
        }
    )

    st.rerun()
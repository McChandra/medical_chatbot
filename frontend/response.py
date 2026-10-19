import streamlit as st


def render_response():
    """Render the MedQuad AI response page."""

    st.title("MedQuad AI Response")

    messages = st.session_state.get("messages", [])

    if not messages:
        st.info("No question has been submitted yet.")

        if st.button("Back to Chat"):
            st.session_state.page = "chatbot"
            st.rerun()

        return

    question = messages[-1]["content"]

    st.markdown("### Your Question")
    st.write(question)

    st.markdown("### Medical Explanation")
    st.info(
        "The AI-generated explanation will appear here "
        "after we connect the backend."
    )

    if st.button("Back to Chat", key="response_back"):
        st.session_state.page = "chatbot"
        st.rerun()
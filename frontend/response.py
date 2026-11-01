import streamlit as st


def render_response():
    st.title("MedQuad research Copilot")
    messages = st.session_state.get("messages", [])
    if messages and "reply" in messages[-1]:
        current = messages[-1]
        reply = current["reply"]
        st.caption(f'{current["topic"]} · Deck {current["deck"]}')
        if reply["status"] == "urgent":
            st.error(reply["message"])
        else:
            st.info(reply["message"])
        for passage in reply["passages"]:
            st.subheader(passage["title"])
            st.text(passage["text"])
            st.caption(f'Source record {passage["record"]} · {passage["focus"]}')
            st.caption(passage.get("vintage") or "Publication and review dates unverified.")
            st.link_button("Inspect original record", passage.get("sourceRecord") or passage["url"])
            if passage.get("sourceRecord"):
                st.link_button("Publisher URL from the record", passage["url"])
            if passage.get("attribution"):
                st.text(passage["attribution"])
            if passage.get("license"):
                st.text("License: " + passage["license"])
    else:
        st.info("Submit a topic question to retrieve a cited excerpt.")

    if st.button("Back to Chat", key="response_back"):
        st.session_state.page = "chatbot"
        st.rerun()

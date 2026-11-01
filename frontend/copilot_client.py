import os

import httpx
import streamlit as st


def api(method, path, **kwargs):
    base = os.getenv("BACKEND_URL")
    if not base:
        raise ValueError("Backend unavailable.")
    cookie_name = os.getenv("SESSION_COOKIE_NAME", "medquad_session")
    cookie = st.context.cookies.get(cookie_name)
    token = st.session_state.get("access_token")
    # Restored browser sessions need no access token copied into UI state.
    headers = {"Authorization": f"Bearer {token}"} if token and not cookie else {}
    response = httpx.request(method, base.rstrip("/") + "/copilot/" + path,
                             headers=headers, cookies={cookie_name: cookie} if cookie else {},
                             timeout=10, follow_redirects=False, **kwargs)
    response.raise_for_status()
    return response.json()

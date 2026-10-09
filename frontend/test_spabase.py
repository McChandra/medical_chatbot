
import streamlit as st
from auth_service import get_supabase_client

st.title("MedQuad AI — Supabase Connection Test")

try:
    supabase = get_supabase_client()
    st.success("Supabase client initialized successfully!")
except Exception as error:
    st.error(f"Supabase initialization failed: {error}")

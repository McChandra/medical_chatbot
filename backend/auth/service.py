
import os

from supabase import Client, create_client


def create_supabase_client() -> Client:
    """
    Create a Supabase client for backend
    authentication operations.
    """
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_KEY"]

    return create_client(url, key)

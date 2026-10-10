
import os
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client
from supabase import ClientOptions

from supabase_auth._sync.storage import SyncSupportedStorage


# Locate the MedQuad AI project root
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Load backend configuration
ENV_PATH = PROJECT_ROOT / ".env"
load_dotenv(dotenv_path=ENV_PATH)



def create_supabase_client(
    storage: SyncSupportedStorage | None = None
) -> Client:

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")

    if not url or not key:
        raise RuntimeError(
            "Missing Supabase configuration in .env"
        )

    options = ClientOptions(flow_type="pkce")

    if storage is not None:
        options.storage = storage

    return create_client(
        url,
        key,
        options=options
    )


from backend.auth.service import create_supabase_client
from backend.auth.pkce_storage import PKCEStorage

storage = PKCEStorage()
supabase = create_supabase_client(storage=storage)

response = supabase.auth.sign_in_with_oauth({
    "provider": "google",
    "options": {
        "redirect_to": (
            "http://localhost:8000/auth/google/callback"
        )
    },
})

print("OAuth URL generated:", bool(response.url))
print("Storage keys:", list(storage.storage.keys()))

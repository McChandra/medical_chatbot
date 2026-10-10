
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

verifier = storage.get_verifier()

print("PKCE verifier generated:", bool(verifier))

restored_storage = PKCEStorage()

if verifier:
    restored_storage.set_verifier(verifier)

print(
    "PKCE verifier restored:",
    restored_storage.get_verifier() == verifier
)
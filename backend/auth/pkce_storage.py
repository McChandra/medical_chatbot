
from supabase_auth._sync.storage import SyncMemoryStorage


class PKCEStorage(SyncMemoryStorage):
    """
    Isolated storage for one Google OAuth transaction.
    """

    VERIFIER_KEY = "supabase.auth.token-code-verifier"

    def get_verifier(self) -> str | None:
        """Retrieve the PKCE verifier."""
        return self.get_item(self.VERIFIER_KEY)

    def set_verifier(self, verifier: str) -> None:
        """Restore a verifier for the OAuth callback."""
        self.set_item(self.VERIFIER_KEY, verifier)

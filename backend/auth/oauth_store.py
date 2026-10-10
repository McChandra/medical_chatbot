
import secrets
import time
from threading import Lock

_transactions = {}
_lock = Lock()

TRANSACTION_TTL_SECONDS = 300


def create_transaction(verifier: str) -> str:
    """Save a PKCE verifier for five minutes."""
    transaction_id = secrets.token_urlsafe(32)

    with _lock:
        _transactions[transaction_id] = {
            "verifier": verifier,
            "expires_at": time.time() + TRANSACTION_TTL_SECONDS,
        }

    return transaction_id


def consume_transaction(transaction_id: str) -> str | None:
    """Retrieve and delete a transaction exactly once."""
    with _lock:
        transaction = _transactions.pop(transaction_id, None)

    if transaction is None:
        return None

    if time.time() > transaction["expires_at"]:
        return None

    return transaction["verifier"]

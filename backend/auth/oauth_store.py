
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

#--------------------------------------------------
# Temporary Authentication Storage
#--------------------------------------------------

# One-time authentication handoffs
_handoffs = {}

HANDOFF_TTL_SECONDS = 60


def create_handoff(session_data: dict) -> str:
    """Store an authenticated session for 60 seconds."""
    ticket = secrets.token_urlsafe(32)

    with _lock:
        _handoffs[ticket] = {
            "session": session_data,
            "expires_at": time.time() + HANDOFF_TTL_SECONDS,
        }

    return ticket


def consume_handoff(ticket: str) -> dict | None:
    """Return a session once, before its expiration."""
    with _lock:
        handoff = _handoffs.pop(ticket, None)

    if handoff is None:
        return None

    if time.time() > handoff["expires_at"]:
        return None

    return handoff["session"]


# --------------------------------------------------
# Browser Session Handoffs
# --------------------------------------------------

_browser_handoffs = {}

BROWSER_HANDOFF_TTL_SECONDS = 60


def create_browser_handoff(
    session_data: dict,
    browser_nonce: str
) -> str:
    """
    Create a one-time handoff bound to a browser nonce.
    """

    ticket = secrets.token_urlsafe(32)

    with _lock:
        _browser_handoffs[ticket] = {
            "session": session_data,
            "browser_nonce": browser_nonce,
            "expires_at": (
                time.time() + BROWSER_HANDOFF_TTL_SECONDS
            ),
        }

    return ticket


def consume_browser_handoff(
    ticket: str,
    browser_nonce: str
) -> dict | None:
    """
    Consume a handoff only when its browser nonce matches.
    """

    with _lock:
        handoff = _browser_handoffs.get(ticket)

        if handoff is None:
            return None

        if time.time() > handoff["expires_at"]:
            _browser_handoffs.pop(ticket, None)
            return None

        if not secrets.compare_digest(
            handoff["browser_nonce"],
            browser_nonce
        ):
            return None

        _browser_handoffs.pop(ticket, None)

        return handoff["session"]


def consume_browser_handoff_with_cookie(
    ticket: str,
    cookie_nonce: str | None,
) -> dict | None:
    """
    Redeem a browser handoff using the nonce
    obtained from the browser's HttpOnly cookie.
    """

    if not cookie_nonce:
        return None

    return consume_browser_handoff(
        ticket=ticket,
        browser_nonce=cookie_nonce,
    )


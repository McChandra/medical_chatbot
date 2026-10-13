
"""
MedQuad AI — Session Security

Encrypts and decrypts authentication session data.

This module does not create browser cookies or
manage session expiration by itself.
"""

import os

from cryptography.fernet import Fernet, InvalidToken


def get_session_cipher() -> Fernet:
    """Initialize encryption using the configured secret."""

    encryption_key = os.getenv("SESSION_ENCRYPTION_KEY")

    if not encryption_key:
        raise RuntimeError(
            "SESSION_ENCRYPTION_KEY is missing from .env"
        )

    return Fernet(encryption_key.encode("utf-8"))


def encrypt_session(session_data: str) -> str:
    """Encrypt session data before storing it."""

    cipher = get_session_cipher()

    encrypted = cipher.encrypt(
        session_data.encode("utf-8")
    )

    return encrypted.decode("utf-8")



def decrypt_session(encrypted_data: str) -> str | None:
    """
    Decrypt session data and enforce its maximum age.

    Returns None for expired, invalid, or modified tokens.
    """

    cipher = get_session_cipher()

    max_age = int(
        os.getenv("SESSION_MAX_AGE", "604800")
    )

    try:
        decrypted = cipher.decrypt(
            encrypted_data.encode("utf-8"),
            ttl=max_age
        )

        return decrypted.decode("utf-8")

    except (InvalidToken, ValueError):
        return None


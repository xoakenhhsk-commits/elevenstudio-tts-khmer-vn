import hashlib
import hmac
import secrets


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        200_000,
    )
    return f"pbkdf2_sha256$200000${salt}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algo, iterations_str, salt, hex_digest = stored_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations_str),
        )
        return hmac.compare_digest(dk.hex(), hex_digest)
    except Exception:
        return False


def generate_session_token() -> str:
    return secrets.token_urlsafe(36)

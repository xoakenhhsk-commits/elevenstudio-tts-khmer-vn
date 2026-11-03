from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
import random
import sqlite3
import uuid

from auth import generate_session_token, hash_password, verify_password

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = BASE_DIR / "generated_audio"
PREVIEW_DIR = AUDIO_DIR / "previews"

DATA_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "kromalabs.db"

AVATAR_GRADIENTS = [
    "from-indigo-500 via-purple-500 to-pink-500",
    "from-emerald-400 via-teal-500 to-cyan-600",
    "from-amber-400 via-orange-500 to-rose-500",
    "from-sky-400 via-blue-500 to-indigo-600",
    "from-violet-500 via-fuchsia-500 to-rose-500",
]


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                avatar_gradient TEXT NOT NULL,
                plan TEXT NOT NULL DEFAULT 'Creator Free',
                created_at TEXT NOT NULL,
                last_login_at TEXT
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS generations (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                voice_id TEXT NOT NULL,
                voice_name TEXT NOT NULL,
                language TEXT NOT NULL,
                gender TEXT NOT NULL,
                speed REAL NOT NULL DEFAULT 1.0,
                pitch INTEGER NOT NULL DEFAULT 0,
                volume INTEGER NOT NULL DEFAULT 0,
                audio_filename TEXT NOT NULL,
                srt_filename TEXT,
                char_count INTEGER NOT NULL DEFAULT 0,
                file_size INTEGER NOT NULL DEFAULT 0,
                duration_est REAL NOT NULL DEFAULT 0.0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
            """
        )

        # Ensure backward compatibility if table existed without user_id
        cols = [r["name"] for r in conn.execute("PRAGMA table_info(generations)").fetchall()]
        if "user_id" not in cols:
            conn.execute("ALTER TABLE generations ADD COLUMN user_id TEXT")

        conn.commit()


# ==================== USER & SESSION FUNCTIONS ====================

def create_user(full_name: str, email: str, password: str) -> dict[str, Any]:
    normalized_email = email.strip().lower()
    now_iso = datetime.now(timezone.utc).isoformat()
    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    avatar = random.choice(AVATAR_GRADIENTS)
    pw_hash = hash_password(password)

    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?",
            (normalized_email,),
        ).fetchone()
        if existing:
            raise ValueError("Email này đã được đăng ký. Vui lòng đăng nhập hoặc dùng email khác.")

        conn.execute(
            """
            INSERT INTO users (id, full_name, email, password_hash, avatar_gradient, plan, created_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, 'Creator Free', ?, ?)
            """,
            (user_id, full_name.strip(), normalized_email, pw_hash, avatar, now_iso, now_iso),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _sanitize_user(dict(row))


def authenticate_user(email: str, password: str) -> dict[str, Any] | None:
    normalized_email = email.strip().lower()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?",
            (normalized_email,),
        ).fetchone()
        if not row:
            return None
        user_dict = dict(row)
        if not verify_password(password, user_dict["password_hash"]):
            return None

        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "UPDATE users SET last_login_at = ? WHERE id = ?",
            (now_iso, user_dict["id"]),
        )
        conn.commit()
        user_dict["last_login_at"] = now_iso
        return _sanitize_user(user_dict)


def create_session(user_id: str, days_valid: int = 30) -> str:
    token = generate_session_token()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(days=days_valid)
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, user_id, now.isoformat(), expires.isoformat()),
        )
        conn.commit()
    return token


def get_user_by_token(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? AND s.expires_at > ?
            """,
            (token, now_iso),
        ).fetchone()
        if not row:
            return None
        return _sanitize_user(dict(row))


def delete_session(token: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


def get_user_stats(user_id: str) -> dict[str, Any]:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                COUNT(*) AS total_generations,
                COALESCE(SUM(char_count), 0) AS total_chars,
                COALESCE(SUM(duration_est), 0) AS total_seconds,
                COALESCE(SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END), 0) AS total_favorites
            FROM generations
            WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        return dict(row) if row else {
            "total_generations": 0,
            "total_chars": 0,
            "total_seconds": 0,
            "total_favorites": 0,
        }


def _sanitize_user(user: dict[str, Any]) -> dict[str, Any]:
    out = dict(user)
    out.pop("password_hash", None)
    return out


# ==================== GENERATION HISTORY FUNCTIONS ====================

def insert_generation(record: dict[str, Any]) -> dict[str, Any]:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO generations (
                id, user_id, title, text, voice_id, voice_name, language, gender,
                speed, pitch, volume, audio_filename, srt_filename,
                char_count, file_size, duration_est, is_favorite, created_at
            ) VALUES (
                :id, :user_id, :title, :text, :voice_id, :voice_name, :language, :gender,
                :speed, :pitch, :volume, :audio_filename, :srt_filename,
                :char_count, :file_size, :duration_est, :is_favorite, :created_at
            )
            """,
            record,
        )
        conn.commit()
    return record


def list_generations(user_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    with get_connection() as conn:
        if user_id:
            rows = conn.execute(
                "SELECT * FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM generations WHERE user_id IS NULL ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]


def get_generation(item_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM generations WHERE id = ?",
            (item_id,),
        ).fetchone()
        return dict(row) if row else None


def toggle_favorite(item_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM generations WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
            return None
        if user_id and row["user_id"] and row["user_id"] != user_id:
            return None
        new_val = 0 if row["is_favorite"] else 1
        conn.execute(
            "UPDATE generations SET is_favorite = ? WHERE id = ?",
            (new_val, item_id),
        )
        conn.commit()
        updated = conn.execute(
            "SELECT * FROM generations WHERE id = ?",
            (item_id,),
        ).fetchone()
        return dict(updated) if updated else None


def delete_generation(item_id: str, user_id: str | None = None) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM generations WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
            return None
        if user_id and row["user_id"] and row["user_id"] != user_id:
            return None
        record = dict(row)
        conn.execute("DELETE FROM generations WHERE id = ?", (item_id,))
        conn.commit()
        return record

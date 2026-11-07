from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
import json
import random
import secrets
import sqlite3
import string
import uuid

from auth import generate_session_token, hash_password, verify_password

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "kromaforms.db"

AVATAR_GRADIENTS = [
    "from-zinc-800 via-zinc-700 to-zinc-900",
    "from-emerald-500 via-teal-500 to-cyan-600",
    "from-indigo-500 via-purple-500 to-pink-500",
    "from-amber-500 via-orange-500 to-rose-500",
    "from-sky-500 via-blue-600 to-indigo-700",
]


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _generate_short_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "KF-" + "".join(secrets.choice(chars) for _ in range(5))


def _generate_agent_key() -> str:
    return "kf_agent_" + secrets.token_hex(16)


def _generate_slug(title: str) -> str:
    import re
    import unicodedata

    normalized = unicodedata.normalize("NFKD", title.lower())
    ascii_str = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_str = ascii_str.replace("đ", "d")
    slug_base = re.sub(r"[^a-z0-9]+", "-", ascii_str).strip("-")[:36] or "khao-sat"
    suffix = uuid.uuid4().hex[:6]
    return f"{slug_base}-{suffix}"


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
                plan TEXT NOT NULL DEFAULT 'Pro Free',
                agent_api_key TEXT,
                created_at TEXT NOT NULL,
                last_login_at TEXT
            )
            """
        )

        # Safe migration for existing databases without agent_api_key
        cols = [
            row["name"]
            for row in conn.execute("PRAGMA table_info(users)").fetchall()
        ]
        if "agent_api_key" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN agent_api_key TEXT")

        # Backfill agent_api_key for any existing user missing one
        missing_key_users = conn.execute(
            "SELECT id FROM users WHERE agent_api_key IS NULL OR agent_api_key = ''"
        ).fetchall()
        for u in missing_key_users:
            conn.execute(
                "UPDATE users SET agent_api_key = ? WHERE id = ?",
                (_generate_agent_key(), u["id"]),
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
            CREATE TABLE IF NOT EXISTS forms (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                slug TEXT NOT NULL UNIQUE,
                access_code TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                theme_color TEXT NOT NULL DEFAULT 'indigo',
                thank_you_message TEXT NOT NULL DEFAULT 'Cảm ơn bạn đã dành thời gian hoàn thành khảo sát!',
                is_published INTEGER NOT NULL DEFAULT 1,
                accepting_responses INTEGER NOT NULL DEFAULT 1,
                collect_email INTEGER NOT NULL DEFAULT 0,
                allow_public_summary INTEGER NOT NULL DEFAULT 1,
                questions_json TEXT NOT NULL DEFAULT '[]',
                views_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS form_responses (
                id TEXT PRIMARY KEY,
                form_id TEXT NOT NULL,
                respondent_name TEXT,
                respondent_email TEXT,
                answers_json TEXT NOT NULL DEFAULT '{}',
                submitted_at TEXT NOT NULL,
                FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
            )
            """
        )

        # Remove legacy unowned demo/guest forms so personal dashboards stay strictly private
        conn.execute("DELETE FROM forms WHERE user_id IS NULL")

        conn.commit()


# ==================== USER & AUTH ====================

def _sanitize_user(user: dict[str, Any]) -> dict[str, Any]:
    out = dict(user)
    out.pop("password_hash", None)
    return out


def create_user(full_name: str, email: str, password: str) -> dict[str, Any]:
    normalized_email = email.strip().lower()
    now_iso = datetime.now(timezone.utc).isoformat()
    user_id = f"usr_{uuid.uuid4().hex[:12]}"
    avatar = random.choice(AVATAR_GRADIENTS)
    pw_hash = hash_password(password)
    agent_key = _generate_agent_key()

    with get_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?", (normalized_email,)
        ).fetchone()
        if existing:
            raise ValueError("Email này đã được đăng ký. Vui lòng đăng nhập.")

        conn.execute(
            """
            INSERT INTO users (
                id, full_name, email, password_hash, avatar_gradient,
                plan, agent_api_key, created_at, last_login_at
            )
            VALUES (?, ?, ?, ?, ?, 'Pro Free', ?, ?, ?)
            """,
            (
                user_id,
                full_name.strip(),
                normalized_email,
                pw_hash,
                avatar,
                agent_key,
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _sanitize_user(dict(row))


def authenticate_user(email: str, password: str) -> dict[str, Any] | None:
    normalized_email = email.strip().lower()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (normalized_email,)
        ).fetchone()
        if not row:
            return None
        user_dict = dict(row)
        if not verify_password(password, user_dict["password_hash"]):
            return None

        now_iso = datetime.now(timezone.utc).isoformat()
        if not user_dict.get("agent_api_key"):
            new_key = _generate_agent_key()
            conn.execute(
                "UPDATE users SET last_login_at = ?, agent_api_key = ? WHERE id = ?",
                (now_iso, new_key, user_dict["id"]),
            )
            user_dict["agent_api_key"] = new_key
        else:
            conn.execute(
                "UPDATE users SET last_login_at = ? WHERE id = ?",
                (now_iso, user_dict["id"]),
            )
        conn.commit()
        user_dict["last_login_at"] = now_iso
        return _sanitize_user(user_dict)


def regenerate_user_agent_key(user_id: str) -> str:
    new_key = _generate_agent_key()
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET agent_api_key = ? WHERE id = ?",
            (new_key, user_id),
        )
        conn.commit()
    return new_key


def get_user_by_agent_key(api_key: str) -> dict[str, Any] | None:
    if not api_key or not api_key.startswith("kf_agent_"):
        return None
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE agent_api_key = ?",
            (api_key.strip(),),
        ).fetchone()
        return _sanitize_user(dict(row)) if row else None


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
    if token.startswith("kf_agent_"):
        return get_user_by_agent_key(token)
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


# ==================== FORMS CRUD (STRICT PER-USER OWNERSHIP) ====================

def _parse_form_row(row: sqlite3.Row | dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
    d = dict(row)
    d["questions"] = json.loads(d.pop("questions_json", "[]"))
    d["is_published"] = bool(d["is_published"])
    d["accepting_responses"] = bool(d["accepting_responses"])
    d["collect_email"] = bool(d["collect_email"])
    d["allow_public_summary"] = bool(d["allow_public_summary"])
    count_row = conn.execute(
        "SELECT COUNT(*) AS cnt FROM form_responses WHERE form_id = ?",
        (d["id"],),
    ).fetchone()
    d["response_count"] = count_row["cnt"] if count_row else 0
    return d


def create_form(data: dict[str, Any], user_id: str) -> dict[str, Any]:
    if not user_id:
        raise PermissionError("Vui lòng đăng nhập tài khoản để tạo biểu mẫu riêng.")
    now_iso = datetime.now(timezone.utc).isoformat()
    form_id = f"frm_{uuid.uuid4().hex[:12]}"
    title = (data.get("title") or "Biểu mẫu chưa có tiêu đề").strip()
    slug = _generate_slug(title)
    access_code = _generate_short_code()
    questions = data.get("questions") or []

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO forms (
                id, user_id, slug, access_code, title, description,
                theme_color, thank_you_message, is_published, accepting_responses,
                collect_email, allow_public_summary, questions_json, views_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (
                form_id,
                user_id,
                slug,
                access_code,
                title,
                data.get("description", ""),
                data.get("theme_color", "indigo"),
                data.get(
                    "thank_you_message",
                    "Cảm ơn bạn đã dành thời gian hoàn thành khảo sát!",
                ),
                1 if data.get("is_published", True) else 0,
                1 if data.get("accepting_responses", True) else 0,
                1 if data.get("collect_email", False) else 0,
                1 if data.get("allow_public_summary", True) else 0,
                json.dumps(questions, ensure_ascii=False),
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        return _parse_form_row(row, conn)


def update_form(form_id: str, updates: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        existing = conn.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        if not existing:
            return None
        if existing["user_id"] != user_id:
            raise PermissionError("Bạn không có quyền chỉnh sửa biểu mẫu của tài khoản khác.")

        current = _parse_form_row(existing, conn)
        title = updates.get("title", current["title"])
        description = updates.get("description", current["description"])
        theme_color = updates.get("theme_color", current["theme_color"])
        thank_you_message = updates.get("thank_you_message", current["thank_you_message"])
        is_published = 1 if updates.get("is_published", current["is_published"]) else 0
        accepting_responses = 1 if updates.get("accepting_responses", current["accepting_responses"]) else 0
        collect_email = 1 if updates.get("collect_email", current["collect_email"]) else 0
        allow_public_summary = 1 if updates.get("allow_public_summary", current["allow_public_summary"]) else 0
        questions = updates.get("questions", current["questions"])

        conn.execute(
            """
            UPDATE forms
            SET title = ?, description = ?, theme_color = ?,
                thank_you_message = ?, is_published = ?, accepting_responses = ?,
                collect_email = ?, allow_public_summary = ?, questions_json = ?,
                updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                title,
                description,
                theme_color,
                thank_you_message,
                is_published,
                accepting_responses,
                collect_email,
                allow_public_summary,
                json.dumps(questions, ensure_ascii=False),
                now_iso,
                form_id,
                user_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        return _parse_form_row(row, conn)


def get_form_by_id(form_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        return _parse_form_row(row, conn) if row else None


def get_form_by_slug_or_code(identifier: str, increment_view: bool = False) -> dict[str, Any] | None:
    ident = identifier.strip()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM forms WHERE slug = ? OR UPPER(access_code) = UPPER(?) OR id = ?",
            (ident, ident, ident),
        ).fetchone()
        if not row:
            return None
        if increment_view:
            conn.execute(
                "UPDATE forms SET views_count = views_count + 1 WHERE id = ?",
                (row["id"],),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM forms WHERE id = ?", (row["id"],)).fetchone()
        return _parse_form_row(row, conn)


def list_forms_for_owner(user_id: str) -> list[dict[str, Any]]:
    """Strictly return ONLY forms belonging to this specific user account."""
    if not user_id:
        return []
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM forms WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100",
            (user_id,),
        ).fetchall()
        return [_parse_form_row(r, conn) for r in rows]


def delete_form(form_id: str, user_id: str) -> bool:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        if not row:
            return False
        if row["user_id"] != user_id:
            raise PermissionError("Bạn không có quyền xóa biểu mẫu của tài khoản khác.")
        conn.execute("DELETE FROM forms WHERE id = ? AND user_id = ?", (form_id, user_id))
        conn.commit()
        return True


# ==================== RESPONSES & ANALYTICS ====================

def submit_response(
    form_id: str,
    answers: dict[str, Any],
    respondent_name: str | None = None,
    respondent_email: str | None = None,
) -> dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    resp_id = f"rsp_{uuid.uuid4().hex[:12]}"
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO form_responses (id, form_id, respondent_name, respondent_email, answers_json, submitted_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                resp_id,
                form_id,
                (respondent_name or "").strip() or None,
                (respondent_email or "").strip() or None,
                json.dumps(answers, ensure_ascii=False),
                now_iso,
            ),
        )
        conn.commit()
    return {
        "id": resp_id,
        "form_id": form_id,
        "respondent_name": respondent_name,
        "respondent_email": respondent_email,
        "answers": answers,
        "submitted_at": now_iso,
    }


def list_responses(form_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM form_responses WHERE form_id = ? ORDER BY submitted_at DESC",
            (form_id,),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            d["answers"] = json.loads(d.pop("answers_json", "{}"))
            out.append(d)
        return out


def delete_response(response_id: str, form_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM form_responses WHERE id = ? AND form_id = ?",
            (response_id, form_id),
        )
        conn.commit()
        return cur.rowcount > 0

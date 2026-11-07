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


def _ensure_columns(conn: sqlite3.Connection, table: str, column_defs: dict[str, str]) -> None:
    existing_cols = {
        row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }
    for col_name, col_sql in column_defs.items():
        if col_name not in existing_cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_sql}")


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

        _ensure_columns(conn, "users", {"agent_api_key": "TEXT"})

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
                thank_you_message TEXT NOT NULL DEFAULT 'Cảm ơn bạn đã dành thời gian hoàn thành!',
                is_published INTEGER NOT NULL DEFAULT 1,
                accepting_responses INTEGER NOT NULL DEFAULT 1,
                collect_email INTEGER NOT NULL DEFAULT 0,
                allow_public_summary INTEGER NOT NULL DEFAULT 1,
                is_quiz INTEGER NOT NULL DEFAULT 0,
                time_limit_minutes INTEGER NOT NULL DEFAULT 0,
                anti_cheat_enabled INTEGER NOT NULL DEFAULT 0,
                max_violations INTEGER NOT NULL DEFAULT 3,
                show_score_immediately INTEGER NOT NULL DEFAULT 1,
                shuffle_questions INTEGER NOT NULL DEFAULT 0,
                strict_roster INTEGER NOT NULL DEFAULT 0,
                student_roster_json TEXT NOT NULL DEFAULT '[]',
                questions_json TEXT NOT NULL DEFAULT '[]',
                views_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        _ensure_columns(
            conn,
            "forms",
            {
                "is_quiz": "INTEGER NOT NULL DEFAULT 0",
                "time_limit_minutes": "INTEGER NOT NULL DEFAULT 0",
                "anti_cheat_enabled": "INTEGER NOT NULL DEFAULT 0",
                "max_violations": "INTEGER NOT NULL DEFAULT 3",
                "show_score_immediately": "INTEGER NOT NULL DEFAULT 1",
                "shuffle_questions": "INTEGER NOT NULL DEFAULT 0",
                "strict_roster": "INTEGER NOT NULL DEFAULT 0",
                "student_roster_json": "TEXT NOT NULL DEFAULT '[]'",
            },
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS form_responses (
                id TEXT PRIMARY KEY,
                form_id TEXT NOT NULL,
                respondent_name TEXT,
                respondent_email TEXT,
                student_class TEXT,
                answers_json TEXT NOT NULL DEFAULT '{}',
                auto_score REAL,
                max_score REAL,
                bonus_score REAL NOT NULL DEFAULT 0,
                final_score REAL,
                teacher_note TEXT,
                cheat_count INTEGER NOT NULL DEFAULT 0,
                cheat_logs_json TEXT NOT NULL DEFAULT '[]',
                auto_submitted_cheat INTEGER NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                submitted_at TEXT NOT NULL,
                FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
            )
            """
        )

        _ensure_columns(
            conn,
            "form_responses",
            {
                "student_class": "TEXT",
                "auto_score": "REAL",
                "max_score": "REAL",
                "bonus_score": "REAL NOT NULL DEFAULT 0",
                "final_score": "REAL",
                "teacher_note": "TEXT",
                "cheat_count": "INTEGER NOT NULL DEFAULT 0",
                "cheat_logs_json": "TEXT NOT NULL DEFAULT '[]'",
                "auto_submitted_cheat": "INTEGER NOT NULL DEFAULT 0",
                "duration_seconds": "INTEGER NOT NULL DEFAULT 0",
            },
        )

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
    d["student_roster"] = json.loads(d.pop("student_roster_json", "[]") or "[]")
    for bool_field in (
        "is_published",
        "accepting_responses",
        "collect_email",
        "allow_public_summary",
        "is_quiz",
        "anti_cheat_enabled",
        "show_score_immediately",
        "shuffle_questions",
        "strict_roster",
    ):
        d[bool_field] = bool(d.get(bool_field, 0))
    d["time_limit_minutes"] = int(d.get("time_limit_minutes") or 0)
    d["max_violations"] = int(d.get("max_violations") or 3)
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
    roster = [str(s).strip() for s in (data.get("student_roster") or []) if str(s).strip()]

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO forms (
                id, user_id, slug, access_code, title, description,
                theme_color, thank_you_message, is_published, accepting_responses,
                collect_email, allow_public_summary,
                is_quiz, time_limit_minutes, anti_cheat_enabled, max_violations,
                show_score_immediately, shuffle_questions, strict_roster, student_roster_json,
                questions_json, views_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
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
                    "Cảm ơn bạn đã dành thời gian hoàn thành!",
                ),
                1 if data.get("is_published", True) else 0,
                1 if data.get("accepting_responses", True) else 0,
                1 if data.get("collect_email", False) else 0,
                1 if data.get("allow_public_summary", True) else 0,
                1 if data.get("is_quiz", False) else 0,
                int(data.get("time_limit_minutes") or 0),
                1 if data.get("anti_cheat_enabled", False) else 0,
                int(data.get("max_violations") or 3),
                1 if data.get("show_score_immediately", True) else 0,
                1 if data.get("shuffle_questions", False) else 0,
                1 if data.get("strict_roster", False) else 0,
                json.dumps(roster, ensure_ascii=False),
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
        is_quiz = 1 if updates.get("is_quiz", current["is_quiz"]) else 0
        time_limit_minutes = int(updates.get("time_limit_minutes", current["time_limit_minutes"]) or 0)
        anti_cheat_enabled = 1 if updates.get("anti_cheat_enabled", current["anti_cheat_enabled"]) else 0
        max_violations = max(1, int(updates.get("max_violations", current["max_violations"]) or 3))
        show_score_immediately = 1 if updates.get("show_score_immediately", current["show_score_immediately"]) else 0
        shuffle_questions = 1 if updates.get("shuffle_questions", current["shuffle_questions"]) else 0
        strict_roster = 1 if updates.get("strict_roster", current["strict_roster"]) else 0

        raw_roster = updates.get("student_roster", current["student_roster"])
        roster = [str(s).strip() for s in (raw_roster or []) if str(s).strip()]
        questions = updates.get("questions", current["questions"])

        conn.execute(
            """
            UPDATE forms
            SET title = ?, description = ?, theme_color = ?,
                thank_you_message = ?, is_published = ?, accepting_responses = ?,
                collect_email = ?, allow_public_summary = ?,
                is_quiz = ?, time_limit_minutes = ?, anti_cheat_enabled = ?,
                max_violations = ?, show_score_immediately = ?, shuffle_questions = ?,
                strict_roster = ?, student_roster_json = ?,
                questions_json = ?, updated_at = ?
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
                is_quiz,
                time_limit_minutes,
                anti_cheat_enabled,
                max_violations,
                show_score_immediately,
                shuffle_questions,
                strict_roster,
                json.dumps(roster, ensure_ascii=False),
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


# ==================== RESPONSES, GRADING & ANTI-CHEAT LOGS ====================

def _parse_response_row(r: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    d = dict(r)
    d["answers"] = json.loads(d.pop("answers_json", "{}") or "{}")
    d["cheat_logs"] = json.loads(d.pop("cheat_logs_json", "[]") or "[]")
    d["auto_submitted_cheat"] = bool(d.get("auto_submitted_cheat", 0))
    d["cheat_count"] = int(d.get("cheat_count") or 0)
    d["duration_seconds"] = int(d.get("duration_seconds") or 0)
    d["bonus_score"] = float(d.get("bonus_score") or 0.0)
    return d


def submit_response(
    form_id: str,
    answers: dict[str, Any],
    respondent_name: str | None = None,
    respondent_email: str | None = None,
    student_class: str | None = None,
    auto_score: float | None = None,
    max_score: float | None = None,
    bonus_score: float = 0.0,
    final_score: float | None = None,
    teacher_note: str | None = None,
    cheat_count: int = 0,
    cheat_logs: list[str] | None = None,
    auto_submitted_cheat: bool = False,
    duration_seconds: int = 0,
) -> dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()
    resp_id = f"rsp_{uuid.uuid4().hex[:12]}"
    clean_name = (respondent_name or "").strip() or None
    clean_email = (respondent_email or "").strip() or None
    clean_class = (student_class or "").strip() or None

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO form_responses (
                id, form_id, respondent_name, respondent_email, student_class,
                answers_json, auto_score, max_score, bonus_score, final_score,
                teacher_note, cheat_count, cheat_logs_json, auto_submitted_cheat,
                duration_seconds, submitted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                resp_id,
                form_id,
                clean_name,
                clean_email,
                clean_class,
                json.dumps(answers, ensure_ascii=False),
                auto_score,
                max_score,
                bonus_score,
                final_score,
                (teacher_note or "").strip() or None,
                max(0, int(cheat_count)),
                json.dumps(cheat_logs or [], ensure_ascii=False),
                1 if auto_submitted_cheat else 0,
                max(0, int(duration_seconds)),
                now_iso,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM form_responses WHERE id = ?", (resp_id,)).fetchone()
        return _parse_response_row(row)


def update_response_grade(
    form_id: str,
    response_id: str,
    bonus_score: float | None = None,
    final_score: float | None = None,
    teacher_note: str | None = None,
) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM form_responses WHERE id = ? AND form_id = ?",
            (response_id, form_id),
        ).fetchone()
        if not row:
            return None
        cur = _parse_response_row(row)
        next_bonus = bonus_score if bonus_score is not None else cur["bonus_score"]
        if final_score is not None:
            next_final = round(float(final_score), 2)
        elif cur.get("auto_score") is not None:
            next_final = round(float(cur["auto_score"]) + float(next_bonus), 2)
        else:
            next_final = round(float(next_bonus), 2)
        next_note = teacher_note if teacher_note is not None else cur.get("teacher_note")

        conn.execute(
            """
            UPDATE form_responses
            SET bonus_score = ?, final_score = ?, teacher_note = ?
            WHERE id = ? AND form_id = ?
            """,
            (next_bonus, next_final, next_note, response_id, form_id),
        )
        conn.commit()
        updated = conn.execute("SELECT * FROM form_responses WHERE id = ?", (response_id,)).fetchone()
        return _parse_response_row(updated)


def list_responses(form_id: str) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM form_responses WHERE form_id = ? ORDER BY submitted_at DESC",
            (form_id,),
        ).fetchall()
        return [_parse_response_row(r) for r in rows]


def delete_response(response_id: str, form_id: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM form_responses WHERE id = ? AND form_id = ?",
            (response_id, form_id),
        )
        conn.commit()
        return cur.rowcount > 0

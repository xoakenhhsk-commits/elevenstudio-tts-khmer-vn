from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
import json
import random
import re
import secrets
import sqlite3
import string
import unicodedata
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


def _generate_classroom_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "KL-" + "".join(secrets.choice(chars) for _ in range(5))


def _generate_agent_key() -> str:
    return "kf_agent_" + secrets.token_hex(16)


def _generate_slug(title: str) -> str:
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


def normalize_student_list(raw_students: list[Any] | None) -> list[dict[str, Any]]:
    """Normalize either strings or student dicts into structured student records."""
    if not raw_students:
        return []
    result: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    for idx, item in enumerate(raw_students, start=1):
        if isinstance(item, str):
            # Strip optional leading numbering like "1. ", "01 - ", "1) "
            cleaned = re.sub(r"^\s*\d+[\.\)\-\s]+\s*", "", item.strip()).strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen_names:
                continue
            seen_names.add(key)
            result.append(
                {
                    "id": f"st_{uuid.uuid4().hex[:8]}",
                    "name": cleaned,
                    "student_code": f"HS{idx:02d}",
                    "bonus_points": 0.0,
                    "note": "",
                }
            )
        elif isinstance(item, dict):
            raw_name = str(item.get("name") or "").strip()
            cleaned = re.sub(r"^\s*\d+[\.\)\-\s]+\s*", "", raw_name).strip()
            if not cleaned:
                continue
            key = cleaned.lower()
            if key in seen_names:
                continue
            seen_names.add(key)
            result.append(
                {
                    "id": str(item.get("id") or f"st_{uuid.uuid4().hex[:8]}"),
                    "name": cleaned,
                    "student_code": str(item.get("student_code") or f"HS{idx:02d}").strip(),
                    "bonus_points": round(float(item.get("bonus_points") or 0.0), 2),
                    "note": str(item.get("note") or "").strip(),
                }
            )
    return result


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

        # Classrooms table (strictly private per teacher account)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS classrooms (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                room_code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                subject TEXT NOT NULL DEFAULT '',
                school_year TEXT NOT NULL DEFAULT '2026 - 2027',
                description TEXT NOT NULL DEFAULT '',
                theme_color TEXT NOT NULL DEFAULT 'indigo',
                students_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS forms (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                classroom_id TEXT,
                classroom_name TEXT,
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
                max_attempts INTEGER NOT NULL DEFAULT 0,
                due_at TEXT,
                pass_score REAL NOT NULL DEFAULT 5.0,
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
                "classroom_id": "TEXT",
                "classroom_name": "TEXT",
                "is_quiz": "INTEGER NOT NULL DEFAULT 0",
                "time_limit_minutes": "INTEGER NOT NULL DEFAULT 0",
                "anti_cheat_enabled": "INTEGER NOT NULL DEFAULT 0",
                "max_violations": "INTEGER NOT NULL DEFAULT 3",
                "show_score_immediately": "INTEGER NOT NULL DEFAULT 1",
                "shuffle_questions": "INTEGER NOT NULL DEFAULT 0",
                "strict_roster": "INTEGER NOT NULL DEFAULT 0",
                "student_roster_json": "TEXT NOT NULL DEFAULT '[]'",
                "max_attempts": "INTEGER NOT NULL DEFAULT 0",
                "due_at": "TEXT",
                "pass_score": "REAL NOT NULL DEFAULT 5.0",
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

    return {
        "id": user_id,
        "full_name": full_name.strip(),
        "email": normalized_email,
        "avatar_gradient": avatar,
        "plan": "Pro Free",
        "agent_api_key": agent_key,
        "created_at": now_iso,
        "last_login_at": now_iso,
    }


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
        agent_key = user_dict.get("agent_api_key") or _generate_agent_key()
        conn.execute(
            "UPDATE users SET last_login_at = ?, agent_api_key = ? WHERE id = ?",
            (now_iso, agent_key, user_dict["id"]),
        )
        conn.commit()
        user_dict["last_login_at"] = now_iso
        user_dict["agent_api_key"] = agent_key
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


def get_user_by_agent_key(agent_key: str) -> dict[str, Any] | None:
    if not agent_key:
        return None
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE agent_api_key = ?", (agent_key.strip(),)
        ).fetchone()
        if not row:
            return None
        return _sanitize_user(dict(row))


def delete_session(token: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        conn.commit()


# ==================== CLASSROOMS & STUDENT ROSTERS ====================

def _parse_classroom_row(row: sqlite3.Row | dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
    d = dict(row)
    students = json.loads(d.pop("students_json", "[]") or "[]")
    d["students"] = students
    d["student_names"] = [s["name"] for s in students if isinstance(s, dict) and s.get("name")]
    d["student_count"] = len(d["student_names"])
    forms_cnt = conn.execute(
        "SELECT COUNT(*) AS cnt FROM forms WHERE classroom_id = ?",
        (d["id"],),
    ).fetchone()
    d["assigned_forms_count"] = forms_cnt["cnt"] if forms_cnt else 0
    return d


def create_classroom(data: dict[str, Any], user_id: str) -> dict[str, Any]:
    if not user_id:
        raise PermissionError("Vui lòng đăng nhập tài khoản để tạo lớp học.")
    now_iso = datetime.now(timezone.utc).isoformat()
    cls_id = f"cls_{uuid.uuid4().hex[:12]}"
    room_code = _generate_classroom_code()
    name = (data.get("name") or "Lớp học mới").strip()
    subject = (data.get("subject") or "").strip()
    school_year = (data.get("school_year") or "2026 - 2027").strip()
    description = (data.get("description") or "").strip()
    theme_color = (data.get("theme_color") or "indigo").strip()
    students = normalize_student_list(data.get("students"))

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO classrooms (
                id, user_id, room_code, name, subject, school_year,
                description, theme_color, students_json, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                cls_id,
                user_id,
                room_code,
                name,
                subject,
                school_year,
                description,
                theme_color,
                json.dumps(students, ensure_ascii=False),
                now_iso,
                now_iso,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM classrooms WHERE id = ?", (cls_id,)).fetchone()
        return _parse_classroom_row(row, conn)


def update_classroom(classroom_id: str, updates: dict[str, Any], user_id: str) -> dict[str, Any] | None:
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT * FROM classrooms WHERE id = ?", (classroom_id,)
        ).fetchone()
        if not existing:
            return None
        if existing["user_id"] != user_id:
            raise PermissionError("Bạn không có quyền chỉnh sửa lớp học của tài khoản khác.")

        cur = _parse_classroom_row(existing, conn)
        name = (updates.get("name") if updates.get("name") is not None else cur["name"]).strip() or cur["name"]
        subject = updates.get("subject") if updates.get("subject") is not None else cur["subject"]
        school_year = updates.get("school_year") if updates.get("school_year") is not None else cur["school_year"]
        description = updates.get("description") if updates.get("description") is not None else cur["description"]
        theme_color = updates.get("theme_color") if updates.get("theme_color") is not None else cur["theme_color"]

        if "students" in updates and updates["students"] is not None:
            students = normalize_student_list(updates["students"])
        else:
            students = cur["students"]

        conn.execute(
            """
            UPDATE classrooms
            SET name = ?, subject = ?, school_year = ?, description = ?,
                theme_color = ?, students_json = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                name,
                str(subject).strip(),
                str(school_year).strip(),
                str(description).strip(),
                str(theme_color).strip(),
                json.dumps(students, ensure_ascii=False),
                now_iso,
                classroom_id,
                user_id,
            ),
        )

        # Auto-sync classroom name & student roster to all forms assigned to this class!
        roster_names = [s["name"] for s in students]
        conn.execute(
            """
            UPDATE forms
            SET classroom_name = ?, student_roster_json = ?, updated_at = ?
            WHERE classroom_id = ? AND user_id = ?
            """,
            (
                name,
                json.dumps(roster_names, ensure_ascii=False),
                now_iso,
                classroom_id,
                user_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM classrooms WHERE id = ?", (classroom_id,)).fetchone()
        return _parse_classroom_row(row, conn)


def list_classrooms_for_owner(user_id: str) -> list[dict[str, Any]]:
    if not user_id:
        return []
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM classrooms WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
        return [_parse_classroom_row(r, conn) for r in rows]


def get_classroom_by_id(classroom_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM classrooms WHERE id = ?", (classroom_id,)).fetchone()
        return _parse_classroom_row(row, conn) if row else None


def get_classroom_by_code_or_id(identifier: str) -> dict[str, Any] | None:
    ident = identifier.strip()
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM classrooms WHERE UPPER(room_code) = UPPER(?) OR id = ?",
            (ident, ident),
        ).fetchone()
        return _parse_classroom_row(row, conn) if row else None


def delete_classroom(classroom_id: str, user_id: str) -> bool:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM classrooms WHERE id = ?", (classroom_id,)).fetchone()
        if not row:
            return False
        if row["user_id"] != user_id:
            raise PermissionError("Bạn không có quyền xóa lớp học của tài khoản khác.")
        conn.execute(
            "UPDATE forms SET classroom_id = NULL, classroom_name = NULL WHERE classroom_id = ? AND user_id = ?",
            (classroom_id, user_id),
        )
        conn.execute("DELETE FROM classrooms WHERE id = ? AND user_id = ?", (classroom_id, user_id))
        conn.commit()
        return True


def list_forms_by_classroom(classroom_id: str, published_only: bool = False) -> list[dict[str, Any]]:
    with get_connection() as conn:
        if published_only:
            rows = conn.execute(
                "SELECT * FROM forms WHERE classroom_id = ? AND is_published = 1 ORDER BY created_at DESC",
                (classroom_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM forms WHERE classroom_id = ? ORDER BY created_at DESC",
                (classroom_id,),
            ).fetchall()
        return [_parse_form_row(r, conn) for r in rows]


# ==================== SURVEY & HOMEWORK QUIZ CRUD ====================

def _parse_form_row(row: sqlite3.Row | dict[str, Any], conn: sqlite3.Connection) -> dict[str, Any]:
    d = dict(row)
    d["questions"] = json.loads(d.pop("questions_json", "[]") or "[]")
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
    d["max_attempts"] = int(d.get("max_attempts") or 0)
    d["pass_score"] = float(d.get("pass_score") if d.get("pass_score") is not None else 5.0)
    count_row = conn.execute(
        "SELECT COUNT(*) AS cnt FROM form_responses WHERE form_id = ?",
        (d["id"],),
    ).fetchone()
    d["response_count"] = count_row["cnt"] if count_row else 0
    return d


def _resolve_classroom_assignment(
    conn: sqlite3.Connection,
    user_id: str,
    classroom_id: str | None,
    explicit_roster: list[str] | None,
) -> tuple[str | None, str | None, list[str]]:
    clean_roster = [str(s).strip() for s in (explicit_roster or []) if str(s).strip()]
    if not classroom_id:
        return None, None, clean_roster

    cls_row = conn.execute(
        "SELECT * FROM classrooms WHERE id = ? AND user_id = ?",
        (classroom_id.strip(), user_id),
    ).fetchone()
    if not cls_row:
        return None, None, clean_roster

    cls_parsed = _parse_classroom_row(cls_row, conn)
    synced_roster = cls_parsed["student_names"] if cls_parsed["student_names"] else clean_roster
    return cls_parsed["id"], cls_parsed["name"], synced_roster


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
        cls_id, cls_name, roster = _resolve_classroom_assignment(
            conn,
            user_id=user_id,
            classroom_id=data.get("classroom_id"),
            explicit_roster=data.get("student_roster"),
        )

        conn.execute(
            """
            INSERT INTO forms (
                id, user_id, classroom_id, classroom_name, slug, access_code, title, description,
                theme_color, thank_you_message, is_published, accepting_responses,
                collect_email, allow_public_summary,
                is_quiz, time_limit_minutes, anti_cheat_enabled, max_violations,
                show_score_immediately, shuffle_questions, strict_roster, student_roster_json,
                max_attempts, due_at, pass_score,
                questions_json, views_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (
                form_id,
                user_id,
                cls_id,
                cls_name,
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
                1 if data.get("strict_roster", bool(cls_id and roster)) else 0,
                json.dumps(roster, ensure_ascii=False),
                max(0, int(data.get("max_attempts") or 0)),
                (data.get("due_at") or "").strip() or None,
                float(data.get("pass_score") if data.get("pass_score") is not None else 5.0),
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
        max_attempts = max(0, int(updates.get("max_attempts", current["max_attempts"]) or 0))
        due_at_raw = updates.get("due_at", current.get("due_at"))
        due_at = str(due_at_raw).strip() if due_at_raw else None
        pass_score = float(
            updates.get("pass_score")
            if updates.get("pass_score") is not None
            else current.get("pass_score", 5.0)
        )

        next_cls_id_input = (
            updates["classroom_id"]
            if "classroom_id" in updates
            else current.get("classroom_id")
        )
        raw_roster = updates.get("student_roster", current["student_roster"])

        cls_id, cls_name, roster = _resolve_classroom_assignment(
            conn,
            user_id=user_id,
            classroom_id=next_cls_id_input,
            explicit_roster=raw_roster,
        )
        questions = updates.get("questions", current["questions"])

        conn.execute(
            """
            UPDATE forms
            SET classroom_id = ?, classroom_name = ?,
                title = ?, description = ?, theme_color = ?,
                thank_you_message = ?, is_published = ?, accepting_responses = ?,
                collect_email = ?, allow_public_summary = ?,
                is_quiz = ?, time_limit_minutes = ?, anti_cheat_enabled = ?,
                max_violations = ?, show_score_immediately = ?, shuffle_questions = ?,
                strict_roster = ?, student_roster_json = ?,
                max_attempts = ?, due_at = ?, pass_score = ?,
                questions_json = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                cls_id,
                cls_name,
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
                max_attempts,
                due_at,
                pass_score,
                json.dumps(questions, ensure_ascii=False),
                now_iso,
                form_id,
                user_id,
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        return _parse_form_row(row, conn)


def assign_form_to_classroom(
    form_id: str,
    classroom_id: str | None,
    user_id: str,
    strict_roster: bool | None = None,
    max_attempts: int | None = None,
    due_at: str | None = None,
) -> dict[str, Any] | None:
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        existing = conn.execute("SELECT * FROM forms WHERE id = ?", (form_id,)).fetchone()
        if not existing:
            return None
        if existing["user_id"] != user_id:
            raise PermissionError("Bạn không có quyền giao bài mẫu của tài khoản khác.")

        current = _parse_form_row(existing, conn)
        cls_id, cls_name, synced_roster = _resolve_classroom_assignment(
            conn,
            user_id=user_id,
            classroom_id=classroom_id,
            explicit_roster=current["student_roster"] if not classroom_id else [],
        )
        next_strict = (
            bool(strict_roster)
            if strict_roster is not None
            else (True if (cls_id and synced_roster) else current["strict_roster"])
        )
        next_attempts = (
            max(0, int(max_attempts))
            if max_attempts is not None
            else current["max_attempts"]
        )
        next_due = (
            (due_at.strip() or None)
            if due_at is not None
            else current.get("due_at")
        )

        conn.execute(
            """
            UPDATE forms
            SET classroom_id = ?, classroom_name = ?, student_roster_json = ?,
                strict_roster = ?, max_attempts = ?, due_at = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                cls_id,
                cls_name,
                json.dumps(synced_roster, ensure_ascii=False),
                1 if next_strict else 0,
                next_attempts,
                next_due,
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


def count_student_attempts(form_id: str, respondent_name: str) -> int:
    clean = respondent_name.strip().lower()
    if not clean:
        return 0
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM form_responses WHERE form_id = ? AND LOWER(TRIM(respondent_name)) = ?",
            (form_id, clean),
        ).fetchone()
        return int(row["cnt"]) if row else 0


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

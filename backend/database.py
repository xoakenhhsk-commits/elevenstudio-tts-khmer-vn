import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = BASE_DIR / "generated_audio"
PREVIEW_DIR = AUDIO_DIR / "previews"

DATA_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "tts_history.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS generations (
                id TEXT PRIMARY KEY,
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
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def insert_generation(record: dict[str, Any]) -> dict[str, Any]:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO generations (
                id, title, text, voice_id, voice_name, language, gender,
                speed, pitch, volume, audio_filename, srt_filename,
                char_count, file_size, duration_est, is_favorite, created_at
            ) VALUES (
                :id, :title, :text, :voice_id, :voice_name, :language, :gender,
                :speed, :pitch, :volume, :audio_filename, :srt_filename,
                :char_count, :file_size, :duration_est, :is_favorite, :created_at
            )
            """,
            record,
        )
        conn.commit()
    return record


def list_generations(limit: int = 100) -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM generations ORDER BY created_at DESC LIMIT ?",
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


def toggle_favorite(item_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM generations WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
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


def delete_generation(item_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM generations WHERE id = ?",
            (item_id,),
        ).fetchone()
        if not row:
            return None
        record = dict(row)
        conn.execute("DELETE FROM generations WHERE id = ?", (item_id,))
        conn.commit()
        return record

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
import re
import uuid

import aiofiles
import edge_tts
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from database import (
    AUDIO_DIR,
    PREVIEW_DIR,
    delete_generation,
    get_generation,
    init_db,
    insert_generation,
    list_generations,
    toggle_favorite,
)
from voices_catalog import FEATURED_VOICES, SCRIPT_TEMPLATES, get_voice_by_id


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AuraLabs TTS Studio API",
    description="Modern ElevenLabs-inspired Text-to-Speech API supporting Khmer (km-KH), Vietnamese (vi-VN), and Multilingual Neural Voices.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/audio", StaticFiles(directory=str(AUDIO_DIR)), name="audio")


class GenerateTTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=15000)
    voice_id: str = Field(default="km-KH-SreymomNeural")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    pitch: int = Field(default=0, ge=-30, le=30)
    volume: int = Field(default=0, ge=-50, le=50)
    title: str | None = Field(default=None, max_length=120)
    include_srt: bool = Field(default=True)


def format_rate(speed: float) -> str:
    pct = round((speed - 1.0) * 100)
    return f"+{pct}%" if pct >= 0 else f"{pct}%"


def format_pitch(pitch_hz: int) -> str:
    return f"+{pitch_hz}Hz" if pitch_hz >= 0 else f"{pitch_hz}Hz"


def format_volume(vol_pct: int) -> str:
    return f"+{vol_pct}%" if vol_pct >= 0 else f"{vol_pct}%"


def make_auto_title(text: str, voice_name: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    snippet = cleaned[:42] + ("..." if len(cleaned) > 42 else "")
    return snippet or f"{voice_name} Audio"


def enrich_record(record: dict[str, Any]) -> dict[str, Any]:
    out = dict(record)
    out["audio_url"] = f"/audio/{record['audio_filename']}"
    out["srt_url"] = f"/audio/{record['srt_filename']}" if record.get("srt_filename") else None
    out["is_favorite"] = bool(record.get("is_favorite", 0))
    return out


@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "Microsoft Edge Neural TTS (Free Open-Source)",
        "supported_primary": ["km-KH", "vi-VN", "en-US", "th-TH", "zh-CN"],
    }


@app.get("/api/voices")
async def get_voices(include_all: bool = False) -> dict[str, Any]:
    if not include_all:
        return {"voices": FEATURED_VOICES}

    try:
        raw_voices = await edge_tts.list_voices()
        featured_ids = {v["id"] for v in FEATURED_VOICES}
        extra: list[dict[str, Any]] = []
        for rv in raw_voices:
            short_name = rv.get("ShortName", "")
            if not short_name or short_name in featured_ids:
                continue
            locale = rv.get("Locale", "")
            gender = rv.get("Gender", "Female")
            friendly = rv.get("FriendlyName", short_name).replace("Microsoft ", "").replace(" Online (Natural)", "")
            extra.append(
                {
                    "id": short_name,
                    "name": short_name.split("-")[-1].replace("Neural", ""),
                    "native_name": friendly,
                    "language": locale,
                    "language_label": locale,
                    "flag": "🌐",
                    "gender": gender,
                    "gender_label": "Nữ" if gender == "Female" else "Nam",
                    "style": "Neural Studio Voice",
                    "description": friendly,
                    "tags": [locale, gender],
                    "gradient": "from-slate-500 via-zinc-600 to-neutral-700",
                    "featured": False,
                    "sample_text": "Hello! This is a neural voice preview.",
                }
            )
        return {"voices": FEATURED_VOICES + extra}
    except Exception:
        return {"voices": FEATURED_VOICES}


@app.get("/api/templates")
async def get_templates() -> dict[str, Any]:
    return {"templates": SCRIPT_TEMPLATES}


@app.post("/api/voices/{voice_id}/preview")
async def preview_voice(voice_id: str) -> dict[str, Any]:
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", voice_id)
    preview_file = PREVIEW_DIR / f"{safe_name}.mp3"

    if not preview_file.exists() or preview_file.stat().st_size == 0:
        voice_meta = get_voice_by_id(voice_id)
        sample_text = (
            voice_meta["sample_text"]
            if voice_meta
            else "Hello! Welcome to AuraLabs neural speech synthesis studio."
        )
        try:
            communicate = edge_tts.Communicate(text=sample_text, voice=voice_id)
            await communicate.save(str(preview_file))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Không thể tạo âm thanh nghe thử: {exc}") from exc

    return {
        "voice_id": voice_id,
        "preview_url": f"/audio/previews/{safe_name}.mp3",
    }


@app.post("/api/tts/generate")
async def generate_tts(req: GenerateTTSRequest) -> dict[str, Any]:
    clean_text = req.text.strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Vui lòng nhập nội dung văn bản cần chuyển thành giọng nói.")

    voice_meta = get_voice_by_id(req.voice_id)
    voice_name = voice_meta["name"] if voice_meta else req.voice_id.split("-")[-1].replace("Neural", "")
    language = voice_meta["language"] if voice_meta else "-".join(req.voice_id.split("-")[:2])
    gender = voice_meta["gender"] if voice_meta else "Female"

    gen_id = uuid.uuid4().hex[:12]
    audio_filename = f"tts_{gen_id}.mp3"
    srt_filename = f"tts_{gen_id}.srt" if req.include_srt else None

    audio_path = AUDIO_DIR / audio_filename
    srt_path = AUDIO_DIR / srt_filename if srt_filename else None

    rate_str = format_rate(req.speed)
    pitch_str = format_pitch(req.pitch)
    volume_str = format_volume(req.volume)

    submaker = edge_tts.SubMaker()

    try:
        communicate = edge_tts.Communicate(
            text=clean_text,
            voice=req.voice_id,
            rate=rate_str,
            pitch=pitch_str,
            volume=volume_str,
            boundary="SentenceBoundary",
        )
        async with aiofiles.open(audio_path, "wb") as audio_f:
            async for chunk in communicate.stream():
                chunk_type = chunk.get("type")
                if chunk_type == "audio":
                    await audio_f.write(chunk["data"])
                elif chunk_type in ("WordBoundary", "SentenceBoundary") and req.include_srt:
                    submaker.feed(chunk)

        if srt_path and req.include_srt:
            srt_content = submaker.get_srt()
            async with aiofiles.open(srt_path, "w", encoding="utf-8") as srt_f:
                await srt_f.write(srt_content or "")
    except Exception as exc:
        if audio_path.exists():
            audio_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Lỗi khi tổng hợp giọng nói: {exc}") from exc

    file_size = audio_path.stat().st_size if audio_path.exists() else 0
    if file_size == 0:
        audio_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Không nhận được dữ liệu âm thanh từ engine TTS.")

    # Estimate MP3 duration (~24kbps mono 24kHz typical for Edge Neural = ~6000 bytes/sec)
    duration_est = round(max(1.0, file_size / 6000.0), 1)

    record = {
        "id": gen_id,
        "title": (req.title.strip() if req.title and req.title.strip() else make_auto_title(clean_text, voice_name)),
        "text": clean_text,
        "voice_id": req.voice_id,
        "voice_name": voice_name,
        "language": language,
        "gender": gender,
        "speed": req.speed,
        "pitch": req.pitch,
        "volume": req.volume,
        "audio_filename": audio_filename,
        "srt_filename": srt_filename,
        "char_count": len(clean_text),
        "file_size": file_size,
        "duration_est": duration_est,
        "is_favorite": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    insert_generation(record)
    return enrich_record(record)


@app.get("/api/history")
async def get_history() -> dict[str, Any]:
    items = list_generations(limit=100)
    return {"items": [enrich_record(i) for i in items]}


@app.patch("/api/history/{item_id}/favorite")
async def favorite_history_item(item_id: str) -> dict[str, Any]:
    updated = toggle_favorite(item_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi âm.")
    return enrich_record(updated)


@app.delete("/api/history/{item_id}")
async def remove_history_item(item_id: str) -> dict[str, Any]:
    deleted = delete_generation(item_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi âm.")

    audio_file = AUDIO_DIR / deleted["audio_filename"]
    audio_file.unlink(missing_ok=True)
    if deleted.get("srt_filename"):
        srt_file = AUDIO_DIR / deleted["srt_filename"]
        srt_file.unlink(missing_ok=True)

    return {"deleted": True, "id": item_id}


@app.get("/api/download/{item_id}/{file_type}")
async def download_generated_file(item_id: str, file_type: str):
    item = get_generation(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp âm thanh.")

    if file_type == "mp3":
        target = AUDIO_DIR / item["audio_filename"]
        media_type = "audio/mpeg"
        ext = "mp3"
    elif file_type == "srt":
        if not item.get("srt_filename"):
            raise HTTPException(status_code=404, detail="Bản ghi này không có phụ đề SRT.")
        target = AUDIO_DIR / item["srt_filename"]
        media_type = "text/plain; charset=utf-8"
        ext = "srt"
    else:
        raise HTTPException(status_code=400, detail="Định dạng tải xuống không hợp lệ.")

    if not target.exists():
        raise HTTPException(status_code=404, detail="Tệp không còn tồn tại trên máy chủ.")

    safe_ascii = re.sub(r"[^a-zA-Z0-9_-]", "_", item["voice_name"]) or "voice"
    utf8_name = quote(f"{item['voice_name']}_{item['id']}.{ext}")
    headers = {
        "Content-Disposition": f"attachment; filename=\"{safe_ascii}_{item['id']}.{ext}\"; filename*=UTF-8''{utf8_name}"
    }
    return FileResponse(path=str(target), media_type=media_type, headers=headers)


# Serve built frontend in production if dist exists
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")

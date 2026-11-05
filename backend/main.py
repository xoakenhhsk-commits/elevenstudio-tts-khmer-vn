from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
import re
import uuid

import aiofiles
import edge_tts
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from database import (
    AUDIO_DIR,
    PREVIEW_DIR,
    authenticate_user,
    create_session,
    create_user,
    delete_generation,
    delete_session,
    get_api_key,
    get_generation,
    get_user_by_token,
    get_user_stats,
    init_db,
    insert_generation,
    list_generations,
    list_user_api_keys,
    save_user_api_key,
    toggle_favorite,
)
from voices_catalog import FEATURED_VOICES, SCRIPT_TEMPLATES, get_voice_by_id
from gtts import gTTS
import requests
import asyncio


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="KromaLabs AI Studio API",
    description="Full-Stack Neural Text-to-Speech API with SQLite User Authentication, Khmer (km-KH), and Vietnamese (vi-VN) Voices.",
    version="2.0.0",
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


# ==================== SCHEMAS ====================

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=1, max_length=128)


class GenerateTTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=15000)
    voice_id: str = Field(default="km-KH-SreymomNeural")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    pitch: int = Field(default=0, ge=-30, le=30)
    volume: int = Field(default=0, ge=-50, le=50)
    title: str | None = Field(default=None, max_length=120)
    include_srt: bool = Field(default=True)
    custom_api_key: str | None = Field(default=None, max_length=200)


class SaveApiKeyRequest(BaseModel):
    provider: str = Field(..., min_length=2, max_length=30)
    api_key: str = Field(..., min_length=1, max_length=200)


# ==================== AUTH DEPENDENCIES ====================

def extract_bearer_token(authorization: str | None = Header(default=None)) -> str | None:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def get_optional_user(token: str | None = Depends(extract_bearer_token)) -> dict[str, Any] | None:
    if not token:
        return None
    return get_user_by_token(token)


def get_required_user(
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
        )
    return user


# ==================== HELPERS ====================

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


# ==================== AUTH ENDPOINTS ====================

@app.post("/api/auth/register")
async def register_account(req: RegisterRequest) -> dict[str, Any]:
    email_clean = req.email.strip().lower()
    if "@" not in email_clean or "." not in email_clean.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Địa chỉ email không hợp lệ.")
    try:
        user = create_user(req.full_name, email_clean, req.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = create_session(user["id"])
    stats = get_user_stats(user["id"])
    return {"token": token, "user": {**user, "stats": stats}}


@app.post("/api/auth/login")
async def login_account(req: LoginRequest) -> dict[str, Any]:
    user = authenticate_user(req.email, req.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.",
        )
    token = create_session(user["id"])
    stats = get_user_stats(user["id"])
    return {"token": token, "user": {**user, "stats": stats}}


@app.post("/api/auth/logout")
async def logout_account(token: str | None = Depends(extract_bearer_token)) -> dict[str, Any]:
    if token:
        delete_session(token)
    return {"logged_out": True}


@app.get("/api/auth/me")
async def get_me(user: dict[str, Any] = Depends(get_required_user)) -> dict[str, Any]:
    stats = get_user_stats(user["id"])
    keys = list_user_api_keys(user["id"])
    return {"user": {**user, "stats": stats, "api_keys": keys}}


@app.post("/api/auth/api-keys")
async def save_api_key_endpoint(
    req: SaveApiKeyRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    save_user_api_key(user["id"], req.provider, req.api_key)
    keys = list_user_api_keys(user["id"])
    return {"status": "ok", "provider": req.provider, "api_keys": keys}


# ==================== TTS & CATALOG ENDPOINTS ====================

@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "app": "KromaLabs AI",
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
            friendly = (
                rv.get("FriendlyName", short_name)
                .replace("Microsoft ", "")
                .replace(" Online (Natural)", "")
            )
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
                    "sample_text": "Hello! Welcome to KromaLabs neural speech synthesis.",
                }
            )
        return {"voices": FEATURED_VOICES + extra}
    except Exception:
        return {"voices": FEATURED_VOICES}


@app.get("/api/templates")
async def get_templates() -> dict[str, Any]:
    return {"templates": SCRIPT_TEMPLATES}


@app.post("/api/voices/{voice_id}/preview")
async def preview_voice(
    voice_id: str,
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", voice_id)
    preview_file = PREVIEW_DIR / f"{safe_name}.mp3"

    if not preview_file.exists() or preview_file.stat().st_size == 0:
        voice_meta = get_voice_by_id(voice_id)
        sample_text = (
            voice_meta["sample_text"]
            if voice_meta
            else "Hello! Welcome to KromaLabs neural speech synthesis studio."
        )
        engine = voice_meta.get("engine", "edge") if voice_meta else "edge"

        if engine == "gtts":
            def _gen_gtts():
                tts = gTTS(text=sample_text, lang="vi")
                tts.save(str(preview_file))
            await asyncio.to_thread(_gen_gtts)
        elif engine == "fpt":
            fpt_key = get_api_key("fpt", user_id=user["id"] if user else None)
            if not fpt_key:
                # Fallback to high quality edge neural if no FPT key provided
                fallback_voice = "vi-VN-HoaiMyNeural"
                communicate = edge_tts.Communicate(text=sample_text, voice=fallback_voice)
                await communicate.save(str(preview_file))
            else:
                voice_code = voice_meta.get("voice_code", "banmai")
                def _call_fpt():
                    res = requests.post(
                        "https://api.fpt.ai/hmi/tts/v5",
                        headers={"api_key": fpt_key, "voice": voice_code},
                        data=sample_text.encode("utf-8"),
                        timeout=15,
                    )
                    data = res.json()
                    async_url = data.get("async")
                    if async_url:
                        # Polling audio file from FPT
                        for _ in range(10):
                            import time
                            time.sleep(1)
                            ar = requests.get(async_url, timeout=10)
                            if ar.status_code == 200:
                                with open(str(preview_file), "wb") as f:
                                    f.write(ar.content)
                                return
                    raise Exception(data.get("message", "FPT API error"))
                try:
                    await asyncio.to_thread(_call_fpt)
                except Exception:
                    # Graceful fallback to Hoai My
                    communicate = edge_tts.Communicate(text=sample_text, voice="vi-VN-HoaiMyNeural")
                    await communicate.save(str(preview_file))
        elif engine == "zalo":
            zalo_key = get_api_key("zalo", user_id=user["id"] if user else None)
            if not zalo_key:
                fallback_voice = "vi-VN-HoaiMyNeural" if voice_meta.get("gender") == "Female" else "vi-VN-NamMinhNeural"
                communicate = edge_tts.Communicate(text=sample_text, voice=fallback_voice)
                await communicate.save(str(preview_file))
            else:
                speaker_id = voice_meta.get("speaker_id", "1")
                def _call_zalo():
                    res = requests.post(
                        "https://api.zalo.ai/v1/tts/synthesize",
                        headers={"apikey": zalo_key},
                        data={"input": sample_text, "speaker_id": speaker_id, "encode_type": "1"},
                        timeout=15,
                    )
                    data = res.json()
                    if data.get("error_code") == 0:
                        audio_url = data.get("data", {}).get("url")
                        ar = requests.get(audio_url, timeout=10)
                        with open(str(preview_file), "wb") as f:
                            f.write(ar.content)
                        return
                    raise Exception(data.get("error_message", "Zalo API error"))
                try:
                    await asyncio.to_thread(_call_zalo)
                except Exception:
                    fallback_voice = "vi-VN-HoaiMyNeural" if voice_meta.get("gender") == "Female" else "vi-VN-NamMinhNeural"
                    communicate = edge_tts.Communicate(text=sample_text, voice=fallback_voice)
                    await communicate.save(str(preview_file))
        else:
            # Default Edge TTS
            last_exc: Exception | None = None
            for _ in range(3):
                try:
                    communicate = edge_tts.Communicate(text=sample_text, voice=voice_id)
                    await communicate.save(str(preview_file))
                    if preview_file.exists() and preview_file.stat().st_size > 0:
                        last_exc = None
                        break
                except Exception as exc:
                    last_exc = exc
            if last_exc is not None:
                preview_file.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=500, detail=f"Không thể tạo âm thanh nghe thử: {last_exc}"
                ) from last_exc

    return {
        "voice_id": voice_id,
        "preview_url": f"/audio/previews/{safe_name}.mp3",
    }


@app.post("/api/tts/generate")
async def generate_tts(
    req: GenerateTTSRequest,
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    clean_text = req.text.strip()
    if not clean_text:
        raise HTTPException(
            status_code=400,
            detail="Vui lòng nhập nội dung văn bản cần chuyển thành giọng nói.",
        )

    voice_meta = get_voice_by_id(req.voice_id)
    voice_name = (
        voice_meta["name"]
        if voice_meta
        else req.voice_id.split("-")[-1].replace("Neural", "")
    )
    language = (
        voice_meta["language"]
        if voice_meta
        else "-".join(req.voice_id.split("-")[:2])
    )
    gender = voice_meta["gender"] if voice_meta else "Female"
    engine = voice_meta.get("engine", "edge") if voice_meta else "edge"

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
        if engine == "gtts":
            def _synth_gtts():
                tts = gTTS(text=clean_text, lang="vi", slow=(req.speed < 0.85))
                tts.save(str(audio_path))
            await asyncio.to_thread(_synth_gtts)
            # Create a simple sentence-level SRT for gTTS
            if srt_path and req.include_srt:
                async with aiofiles.open(srt_path, "w", encoding="utf-8") as srt_f:
                    await srt_f.write(f"1\n00:00:00,000 --> 00:00:10,000\n{clean_text}\n")
        elif engine == "fpt":
            fpt_key = req.custom_api_key or get_api_key("fpt", user_id=user["id"] if user else None)
            if not fpt_key:
                # Automatically fallback to Hoai My Neural with natural studio voice
                communicate = edge_tts.Communicate(
                    text=clean_text,
                    voice="vi-VN-HoaiMyNeural",
                    rate=rate_str,
                    pitch=pitch_str,
                    volume=volume_str,
                    boundary="SentenceBoundary",
                )
                async with aiofiles.open(audio_path, "wb") as audio_f:
                    async for chunk in communicate.stream():
                        if chunk.get("type") == "audio":
                            await audio_f.write(chunk["data"])
                        elif chunk.get("type") in ("WordBoundary", "SentenceBoundary") and req.include_srt:
                            submaker.feed(chunk)
                if srt_path and req.include_srt:
                    async with aiofiles.open(srt_path, "w", encoding="utf-8") as srt_f:
                        await srt_f.write(submaker.get_srt() or "")
            else:
                voice_code = voice_meta.get("voice_code", "banmai")
                def _call_fpt():
                    res = requests.post(
                        "https://api.fpt.ai/hmi/tts/v5",
                        headers={"api_key": fpt_key, "voice": voice_code},
                        data=clean_text.encode("utf-8"),
                        timeout=30,
                    )
                    data = res.json()
                    async_url = data.get("async")
                    if async_url:
                        for _ in range(25):
                            import time
                            time.sleep(1)
                            ar = requests.get(async_url, timeout=10)
                            if ar.status_code == 200:
                                with open(str(audio_path), "wb") as f:
                                    f.write(ar.content)
                                return
                    raise Exception(data.get("message", "FPT API error"))
                await asyncio.to_thread(_call_fpt)
                if srt_path and req.include_srt:
                    async with aiofiles.open(srt_path, "w", encoding="utf-8") as srt_f:
                        await srt_f.write(f"1\n00:00:00,000 --> 00:00:15,000\n{clean_text}\n")
        elif engine == "zalo":
            zalo_key = req.custom_api_key or get_api_key("zalo", user_id=user["id"] if user else None)
            if not zalo_key:
                fallback_voice = "vi-VN-HoaiMyNeural" if gender == "Female" else "vi-VN-NamMinhNeural"
                communicate = edge_tts.Communicate(
                    text=clean_text,
                    voice=fallback_voice,
                    rate=rate_str,
                    pitch=pitch_str,
                    volume=volume_str,
                    boundary="SentenceBoundary",
                )
                async with aiofiles.open(audio_path, "wb") as audio_f:
                    async for chunk in communicate.stream():
                        if chunk.get("type") == "audio":
                            await audio_f.write(chunk["data"])
                        elif chunk.get("type") in ("WordBoundary", "SentenceBoundary") and req.include_srt:
                            submaker.feed(chunk)
                if srt_path and req.include_srt:
                    async with aiofiles.open(srt_path, "w", encoding="utf-8") as srt_f:
                        await srt_f.write(submaker.get_srt() or "")
            else:
                speaker_id = voice_meta.get("speaker_id", "1")
                def _call_zalo():
                    res = requests.post(
                        "https://api.zalo.ai/v1/tts/synthesize",
                        headers={"apikey": zalo_key},
                        data={"input": clean_text, "speaker_id": speaker_id, "encode_type": "1"},
                        timeout=30,
                    )
                    data = res.json()
                    if data.get("error_code") == 0:
                        audio_url = data.get("data", {}).get("url")
                        ar = requests.get(audio_url, timeout=15)
                        with open(str(audio_path), "wb") as f:
                            f.write(ar.content)
                        return
                    raise Exception(data.get("error_message", "Zalo API error"))
                await asyncio.to_thread(_call_zalo)
                if srt_path and req.include_srt:
                    async with aiofiles.open(srt_path, "w", encoding="utf-8") as srt_f:
                        await srt_f.write(f"1\n00:00:00,000 --> 00:00:15,000\n{clean_text}\n")
        else:
            # Default Edge TTS Neural
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
        raise HTTPException(
            status_code=500, detail=f"Lỗi khi tổng hợp giọng nói: {exc}"
        ) from exc

    file_size = audio_path.stat().st_size if audio_path.exists() else 0
    if file_size == 0:
        audio_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500, detail="Không nhận được dữ liệu âm thanh từ engine TTS."
        )

    duration_est = round(max(1.0, file_size / 6000.0), 1)

    record = {
        "id": gen_id,
        "user_id": user["id"] if user else None,
        "title": (
            req.title.strip()
            if req.title and req.title.strip()
            else make_auto_title(clean_text, voice_name)
        ),
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
async def get_history(
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    if not user:
        return {"items": []}
    items = list_generations(user_id=user["id"], limit=100)
    return {"items": [enrich_record(i) for i in items]}


@app.patch("/api/history/{item_id}/favorite")
async def favorite_history_item(
    item_id: str,
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    updated = toggle_favorite(item_id, user_id=user["id"] if user else None)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy bản ghi âm.")
    return enrich_record(updated)


@app.delete("/api/history/{item_id}")
async def remove_history_item(
    item_id: str,
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    deleted = delete_generation(item_id, user_id=user["id"] if user else None)
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

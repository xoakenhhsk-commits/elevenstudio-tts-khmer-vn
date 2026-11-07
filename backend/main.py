from contextlib import asynccontextmanager
from io import StringIO
from pathlib import Path
from typing import Any
import csv
import os
import socket

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from database import (
    authenticate_user,
    create_form,
    create_session,
    create_user,
    delete_form,
    delete_response,
    delete_session,
    get_form_by_id,
    get_form_by_slug_or_code,
    get_user_by_token,
    init_db,
    list_forms,
    list_responses,
    submit_response,
    update_form,
)
from templates_catalog import SURVEY_TEMPLATES


def _seed_demo_survey_if_empty() -> None:
    existing = list_forms(public_only=True)
    if existing:
        return
    tpl = SURVEY_TEMPLATES[0]
    demo = create_form(
        {
            "title": tpl["title"],
            "description": tpl["description"],
            "theme_color": tpl["theme_color"],
            "thank_you_message": tpl["thank_you_message"],
            "is_published": True,
            "accepting_responses": True,
            "allow_public_summary": True,
            "questions": tpl["questions"],
        },
        user_id=None,
    )
    # Seed 4 realistic sample responses so charts look great out of the box
    sample_submissions = [
        (
            "Nguyễn Minh Anh",
            "minhanh@example.com",
            {
                "q_rating_overall": 5,
                "q_source": "Mạng xã hội (Facebook, TikTok, Instagram)",
                "q_liked_features": [
                    "Giao diện đẹp, dễ sử dụng",
                    "Tốc độ phản hồi và xử lý nhanh",
                ],
                "q_feedback_text": "Giao diện cực kỳ sạch sẽ và hiện đại hơn Google Forms truyền thống!",
            },
        ),
        (
            "Trần Quốc Bảo",
            "quocbao@example.com",
            {
                "q_rating_overall": 5,
                "q_source": "Bạn bè / Đồng nghiệp giới thiệu",
                "q_liked_features": [
                    "Giao diện đẹp, dễ sử dụng",
                    "Giá cả hợp lý / Miễn phí",
                ],
                "q_feedback_text": "Chia sẻ link public và xuất Excel rất tiện lợi.",
            },
        ),
        (
            "Lê Thảo Vy",
            "thaovy@example.com",
            {
                "q_rating_overall": 4,
                "q_source": "Tìm kiếm Google",
                "q_liked_features": ["Đội ngũ hỗ trợ nhiệt tình", "Tốc độ phản hồi và xử lý nhanh"],
                "q_feedback_text": "Nên thêm nhiều màu sắc chủ đề hơn nữa nhé!",
            },
        ),
    ]
    for name, email, ans in sample_submissions:
        submit_response(demo["id"], ans, name, email)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    _seed_demo_survey_if_empty()
    yield


app = FastAPI(
    title="KromaForms Studio API",
    description="Modern Full-Stack Survey & Public Form Builder Platform (Google Forms + ElevenLabs Minimalist UI/UX)",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


PUBLIC_TUNNEL_URL_FILE = Path(__file__).resolve().parent / "data" / "public_url.txt"


def get_public_tunnel_url() -> str | None:
    env_url = os.environ.get("PUBLIC_WEB_URL", "").strip()
    if env_url:
        return env_url.rstrip("/")
    if PUBLIC_TUNNEL_URL_FILE.exists():
        content = PUBLIC_TUNNEL_URL_FILE.read_text(encoding="utf-8").strip()
        if content.startswith("http"):
            return content.rstrip("/")
    return None


# ==================== SCHEMAS ====================

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=1, max_length=128)


class QuestionItem(BaseModel):
    id: str
    type: str = Field(default="short_text")
    title: str = Field(default="Câu hỏi mới")
    description: str = Field(default="")
    required: bool = Field(default=False)
    options: list[str] = Field(default_factory=list)
    max_rating: int = Field(default=5)


class FormPayload(BaseModel):
    title: str = Field(default="Biểu mẫu chưa có tiêu đề", max_length=200)
    description: str = Field(default="", max_length=2000)
    theme_color: str = Field(default="indigo")
    thank_you_message: str = Field(
        default="Cảm ơn bạn đã dành thời gian hoàn thành khảo sát!", max_length=500
    )
    is_published: bool = Field(default=True)
    accepting_responses: bool = Field(default=True)
    collect_email: bool = Field(default=False)
    allow_public_summary: bool = Field(default=True)
    questions: list[QuestionItem] = Field(default_factory=list)


class SubmitSurveyRequest(BaseModel):
    respondent_name: str | None = Field(default=None, max_length=120)
    respondent_email: str | None = Field(default=None, max_length=120)
    answers: dict[str, Any] = Field(default_factory=dict)


# ==================== AUTH HELPERS ====================

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
            detail="Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.",
        )
    return user


# ==================== SYSTEM & AUTH ENDPOINTS ====================

@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "app": "KromaForms Studio",
        "lan_ip": get_lan_ip(),
        "public_tunnel_url": get_public_tunnel_url(),
    }


@app.get("/api/server-info")
async def server_info() -> dict[str, Any]:
    lan_ip = get_lan_ip()
    return {
        "lan_ip": lan_ip,
        "local_url": "http://localhost:5173",
        "lan_url": f"http://{lan_ip}:5173",
        "public_tunnel_url": get_public_tunnel_url(),
    }


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
    return {"token": token, "user": user}


@app.post("/api/auth/login")
async def login_account(req: LoginRequest) -> dict[str, Any]:
    user = authenticate_user(req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không chính xác.")
    token = create_session(user["id"])
    return {"token": token, "user": user}


@app.post("/api/auth/logout")
async def logout_account(token: str | None = Depends(extract_bearer_token)) -> dict[str, Any]:
    if token:
        delete_session(token)
    return {"logged_out": True}


@app.get("/api/auth/me")
async def get_me(user: dict[str, Any] = Depends(get_required_user)) -> dict[str, Any]:
    return {"user": user}


# ==================== TEMPLATES & FORMS ENDPOINTS ====================

@app.get("/api/templates")
async def get_survey_templates() -> dict[str, Any]:
    return {"templates": SURVEY_TEMPLATES}


@app.get("/api/forms/public-feed")
async def get_public_forms() -> dict[str, Any]:
    forms = list_forms(public_only=True)
    return {"forms": forms}


@app.get("/api/forms")
async def get_my_forms(
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    if user:
        my_forms = list_forms(user_id=user["id"])
        guest_forms = list_forms(user_id=None)
        seen = {f["id"] for f in my_forms}
        combined = my_forms + [g for g in guest_forms if g["id"] not in seen]
        return {"forms": combined}
    return {"forms": list_forms(user_id=None)}


@app.post("/api/forms")
async def create_new_form(
    payload: FormPayload,
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    data = payload.model_dump()
    if not data["questions"]:
        data["questions"] = [
            {
                "id": "q_default_1",
                "type": "single_choice",
                "title": "Câu hỏi trắc nghiệm đầu tiên của bạn?",
                "description": "",
                "required": True,
                "options": ["Lựa chọn 1", "Lựa chọn 2", "Lựa chọn 3"],
                "max_rating": 5,
            }
        ]
    created = create_form(data, user_id=user["id"] if user else None)
    return created


@app.get("/api/forms/{form_id}")
async def get_single_form(form_id: str) -> dict[str, Any]:
    form = get_form_by_id(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Không tìm thấy biểu mẫu.")
    return form


@app.put("/api/forms/{form_id}")
async def save_form_changes(
    form_id: str,
    payload: FormPayload,
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    try:
        updated = update_form(
            form_id, payload.model_dump(), user_id=user["id"] if user else None
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy biểu mẫu.")
    return updated


@app.post("/api/forms/{form_id}/duplicate")
async def duplicate_existing_form(
    form_id: str,
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    original = get_form_by_id(form_id)
    if not original:
        raise HTTPException(status_code=404, detail="Không tìm thấy biểu mẫu gốc.")
    copy_data = {
        "title": f"{original['title']} (Bản sao)",
        "description": original["description"],
        "theme_color": original["theme_color"],
        "thank_you_message": original["thank_you_message"],
        "is_published": True,
        "accepting_responses": True,
        "collect_email": original["collect_email"],
        "allow_public_summary": original["allow_public_summary"],
        "questions": original["questions"],
    }
    return create_form(copy_data, user_id=user["id"] if user else None)


@app.delete("/api/forms/{form_id}")
async def remove_form(
    form_id: str,
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    try:
        ok = delete_form(form_id, user_id=user["id"] if user else None)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy biểu mẫu.")
    return {"deleted": True, "id": form_id}


# ==================== PUBLIC RESPONDENT ENDPOINTS ====================

@app.get("/api/public/forms/{identifier}")
async def fetch_public_form(identifier: str) -> dict[str, Any]:
    form = get_form_by_slug_or_code(identifier, increment_view=True)
    if not form or not form["is_published"]:
        raise HTTPException(
            status_code=404,
            detail="Biểu mẫu này không tồn tại hoặc đã tạm ngừng công khai (Private).",
        )
    return form


@app.post("/api/public/forms/{identifier}/submit")
async def submit_public_form(identifier: str, req: SubmitSurveyRequest) -> dict[str, Any]:
    form = get_form_by_slug_or_code(identifier, increment_view=False)
    if not form or not form["is_published"]:
        raise HTTPException(status_code=404, detail="Biểu mẫu không tồn tại hoặc đã đóng.")
    if not form["accepting_responses"]:
        raise HTTPException(
            status_code=400, detail="Biểu mẫu này hiện đã ngừng nhận câu trả lời mới."
        )

    if form["collect_email"] and not (req.respondent_email or "").strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập địa chỉ Email của bạn.")

    # Validate required questions
    for q in form["questions"]:
        if q.get("required"):
            val = req.answers.get(q["id"])
            is_empty = (
                val is None
                or (isinstance(val, str) and not val.strip())
                or (isinstance(val, list) and len(val) == 0)
            )
            if is_empty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Vui lòng trả lời câu hỏi bắt buộc: {q['title']}",
                )

    saved = submit_response(
        form_id=form["id"],
        answers=req.answers,
        respondent_name=req.respondent_name,
        respondent_email=req.respondent_email,
    )
    return {
        "submitted": True,
        "response": saved,
        "thank_you_message": form["thank_you_message"],
        "allow_public_summary": form["allow_public_summary"],
    }


# ==================== ANALYTICS & EXPORT ====================

def _build_question_analytics(form: dict[str, Any], responses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stats_list: list[dict[str, Any]] = []
    for q in form["questions"]:
        qid = q["id"]
        qtype = q["type"]
        answered_values = []
        for r in responses:
            val = r["answers"].get(qid)
            if val is not None and val != "" and val != []:
                answered_values.append(val)

        q_stat: dict[str, Any] = {
            "question_id": qid,
            "title": q["title"],
            "type": qtype,
            "answered_count": len(answered_values),
        }

        if qtype in ("single_choice", "dropdown"):
            counts: dict[str, int] = {opt: 0 for opt in q.get("options", [])}
            for val in answered_values:
                s_val = str(val)
                counts[s_val] = counts.get(s_val, 0) + 1
            total = max(1, len(answered_values))
            q_stat["distribution"] = [
                {
                    "label": k,
                    "count": v,
                    "percent": round((v / total) * 100, 1) if answered_values else 0,
                }
                for k, v in counts.items()
            ]
        elif qtype == "multiple_choice":
            counts = {opt: 0 for opt in q.get("options", [])}
            for val in answered_values:
                items = val if isinstance(val, list) else [val]
                for item in items:
                    s_item = str(item)
                    counts[s_item] = counts.get(s_item, 0) + 1
            total = max(1, len(answered_values))
            q_stat["distribution"] = [
                {
                    "label": k,
                    "count": v,
                    "percent": round((v / total) * 100, 1) if answered_values else 0,
                }
                for k, v in counts.items()
            ]
        elif qtype == "rating":
            max_r = q.get("max_rating", 5)
            counts = {str(i): 0 for i in range(1, max_r + 1)}
            numeric_vals: list[float] = []
            for val in answered_values:
                try:
                    num = float(val)
                    numeric_vals.append(num)
                    k = str(int(num))
                    counts[k] = counts.get(k, 0) + 1
                except Exception:
                    pass
            avg = round(sum(numeric_vals) / len(numeric_vals), 2) if numeric_vals else 0.0
            total = max(1, len(numeric_vals))
            q_stat["average_rating"] = avg
            q_stat["max_rating"] = max_r
            q_stat["distribution"] = [
                {
                    "label": f"{k} ★",
                    "count": v,
                    "percent": round((v / total) * 100, 1) if numeric_vals else 0,
                }
                for k, v in counts.items()
            ]
        else:
            q_stat["text_answers"] = [str(v) for v in answered_values[:50]]

        stats_list.append(q_stat)
    return stats_list


@app.get("/api/forms/{identifier}/analytics")
async def get_form_analytics(identifier: str) -> dict[str, Any]:
    form = get_form_by_slug_or_code(identifier, increment_view=False)
    if not form:
        raise HTTPException(status_code=404, detail="Không tìm thấy biểu mẫu.")
    responses = list_responses(form["id"])
    question_stats = _build_question_analytics(form, responses)
    completion_rate = (
        round((len(responses) / max(1, form["views_count"])) * 100, 1)
        if form["views_count"] > 0
        else 100.0
    )
    return {
        "form": form,
        "total_responses": len(responses),
        "views_count": form["views_count"],
        "completion_rate": min(100.0, completion_rate),
        "question_stats": question_stats,
        "responses": responses,
    }


@app.get("/api/forms/{form_id}/export.csv")
async def export_responses_csv(form_id: str):
    form = get_form_by_id(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Không tìm thấy biểu mẫu.")
    responses = list_responses(form_id)

    buf = StringIO()
    # Write UTF-8 BOM so Excel opens Vietnamese characters cleanly
    buf.write("\ufeff")
    writer = csv.writer(buf)

    headers = ["ID Phản hồi", "Thời gian gửi", "Họ tên người điền", "Email"] + [
        q["title"] for q in form["questions"]
    ]
    writer.writerow(headers)

    for r in responses:
        row = [
            r["id"],
            r["submitted_at"],
            r.get("respondent_name") or "Ẩn danh",
            r.get("respondent_email") or "",
        ]
        for q in form["questions"]:
            ans = r["answers"].get(q["id"], "")
            if isinstance(ans, list):
                ans = "; ".join(str(x) for x in ans)
            row.append(str(ans) if ans is not None else "")
        writer.writerow(row)

    buf.seek(0)
    filename = f"khao_sat_{form['slug']}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/api/forms/{form_id}/responses/{response_id}")
async def remove_single_response(form_id: str, response_id: str) -> dict[str, Any]:
    ok = delete_response(response_id, form_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy phản hồi.")
    return {"deleted": True, "id": response_id}


# Serve built frontend in production with SPA history fallback for /f/:slug
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST / "index.html"))

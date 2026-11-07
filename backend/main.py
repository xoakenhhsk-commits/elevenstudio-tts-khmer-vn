from contextlib import asynccontextmanager
from io import StringIO
from pathlib import Path
from typing import Any
import csv
import os
import socket

from fastapi import Depends, FastAPI, Header, HTTPException, Query
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
    get_user_by_agent_key,
    get_user_by_token,
    init_db,
    list_forms_for_owner,
    list_responses,
    regenerate_user_agent_key,
    submit_response,
    update_form,
)
from form_agent import generate_form_from_prompt, parse_quick_code_to_form
from templates_catalog import SURVEY_TEMPLATES


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="KromaForms Studio API",
    description="Private Multi-Tenant Survey & Public Form Builder Platform with AI Agent Quick Generator",
    version="3.1.0",
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


def build_public_survey_urls(slug: str) -> dict[str, str]:
    lan_ip = get_lan_ip()
    tunnel = get_public_tunnel_url()
    local_base = "http://localhost:5173"
    lan_base = f"http://{lan_ip}:5173"
    primary_base = tunnel or (lan_base if lan_ip != "127.0.0.1" else local_base)
    return {
        "public_url": f"{primary_base}/f/{slug}",
        "local_url": f"{local_base}/f/{slug}",
        "lan_url": f"{lan_base}/f/{slug}",
    }


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


class AgentGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=2, max_length=1500)
    question_count: int = Field(default=6, ge=2, le=15)
    theme_color: str = Field(default="indigo")
    is_published: bool = Field(default=True)


class ImportCodeRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=20000)
    theme_color: str = Field(default="indigo")
    is_published: bool = Field(default=True)
    parse_only: bool = Field(default=False)


class ExternalAgentQuickCreateRequest(BaseModel):
    prompt: str | None = Field(default=None)
    code: str | None = Field(default=None)
    question_count: int = Field(default=6, ge=2, le=15)
    title: str | None = Field(default=None)
    description: str = Field(default="")
    theme_color: str = Field(default="indigo")
    is_published: bool = Field(default=True)
    questions: list[dict[str, Any]] | None = Field(default=None)


class SubmitSurveyRequest(BaseModel):
    respondent_name: str | None = Field(default=None, max_length=120)
    respondent_email: str | None = Field(default=None, max_length=120)
    answers: dict[str, Any] = Field(default_factory=dict)


# ==================== AUTH HELPERS ====================

def extract_auth_credentials(
    authorization: str | None = Header(default=None),
    x_agent_key: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> str | None:
    if x_agent_key and x_agent_key.strip():
        return x_agent_key.strip()
    if authorization:
        parts = authorization.strip().split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1].strip()
    if token and token.strip():
        return token.strip()
    return None


def get_optional_user(
    cred: str | None = Depends(extract_auth_credentials),
) -> dict[str, Any] | None:
    if not cred:
        return None
    if cred.startswith("kf_agent_"):
        return get_user_by_agent_key(cred)
    return get_user_by_token(cred)


def get_required_user(
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Vui lòng đăng nhập tài khoản (hoặc truyền X-Agent-Key) để thực hiện thao tác này.",
        )
    return user


def _assert_form_owner(form: dict[str, Any] | None, user: dict[str, Any]) -> dict[str, Any]:
    if not form:
        raise HTTPException(status_code=404, detail="Không tìm thấy biểu mẫu.")
    if form.get("user_id") != user["id"]:
        raise HTTPException(
            status_code=403,
            detail="Biểu mẫu này thuộc tài khoản khác. Bạn không có quyền truy cập quản trị.",
        )
    return form


# ==================== SYSTEM & AUTH ENDPOINTS ====================

@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "app": "KromaForms Studio",
        "version": "3.1.0",
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
async def logout_account(
    cred: str | None = Depends(extract_auth_credentials),
) -> dict[str, Any]:
    if cred and not cred.startswith("kf_agent_"):
        delete_session(cred)
    return {"logged_out": True}


@app.get("/api/auth/me")
async def get_me(user: dict[str, Any] = Depends(get_required_user)) -> dict[str, Any]:
    return {"user": user}


@app.post("/api/auth/regenerate-agent-key")
async def rotate_agent_api_key(
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    new_key = regenerate_user_agent_key(user["id"])
    return {"agent_api_key": new_key}


# ==================== TEMPLATES & PRIVATE ACCOUNT FORMS ====================

@app.get("/api/templates")
async def get_survey_templates() -> dict[str, Any]:
    return {"templates": SURVEY_TEMPLATES}


@app.get("/api/forms")
async def get_my_private_forms(
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Strictly return ONLY forms belonging to the logged-in account."""
    if not user:
        return {"forms": []}
    return {"forms": list_forms_for_owner(user["id"])}


@app.post("/api/forms")
async def create_new_form(
    payload: FormPayload,
    user: dict[str, Any] = Depends(get_required_user),
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
    return create_form(data, user_id=user["id"])


# ==================== AI AGENT & QUICK CODE FORM GENERATOR ====================

@app.post("/api/forms/agent-generate")
async def agent_generate_survey(
    req: AgentGenerateRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    generated = generate_form_from_prompt(
        prompt=req.prompt,
        question_count=req.question_count,
        theme_color=req.theme_color,
    )
    engine = generated.pop("generator_engine", "smart_agent")
    generated["is_published"] = req.is_published
    generated["accepting_responses"] = True
    generated["allow_public_summary"] = True
    saved_form = create_form(generated, user_id=user["id"])
    urls = build_public_survey_urls(saved_form["slug"])
    return {
        "form": saved_form,
        "generator_engine": engine,
        **urls,
    }


@app.post("/api/forms/import-code")
async def import_survey_from_quick_code(
    req: ImportCodeRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    try:
        parsed = parse_quick_code_to_form(req.code, default_theme=req.theme_color)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if req.parse_only:
        return {"parsed": parsed}

    parsed["is_published"] = req.is_published
    parsed["accepting_responses"] = True
    parsed["allow_public_summary"] = True
    saved_form = create_form(parsed, user_id=user["id"])
    urls = build_public_survey_urls(saved_form["slug"])
    return {
        "form": saved_form,
        **urls,
    }


@app.post("/api/agent/quick-create")
async def external_agent_quick_create(
    req: ExternalAgentQuickCreateRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    """
    Programmatic endpoint for external AI Agents / Python / cURL scripts using X-Agent-Key.
    Accepts `prompt` OR `code` OR explicit `title` + `questions`.
    """
    if req.code and req.code.strip():
        try:
            form_data = parse_quick_code_to_form(req.code, default_theme=req.theme_color)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    elif req.prompt and req.prompt.strip():
        form_data = generate_form_from_prompt(
            prompt=req.prompt,
            question_count=req.question_count,
            theme_color=req.theme_color,
        )
        form_data.pop("generator_engine", None)
    elif req.questions:
        form_data = {
            "title": req.title or "Biểu mẫu tạo tự động qua Agent API",
            "description": req.description,
            "theme_color": req.theme_color,
            "questions": req.questions,
        }
    else:
        raise HTTPException(
            status_code=400,
            detail="Vui lòng truyền 'prompt', 'code', hoặc 'questions' trong body JSON.",
        )

    if req.title:
        form_data["title"] = req.title
    form_data["is_published"] = req.is_published
    form_data["accepting_responses"] = True
    form_data["allow_public_summary"] = True

    created = create_form(form_data, user_id=user["id"])
    urls = build_public_survey_urls(created["slug"])
    return {
        "ok": True,
        "owner_email": user["email"],
        "access_code": created["access_code"],
        "slug": created["slug"],
        **urls,
        "form": created,
    }


# ==================== OWNER-ONLY FORM OPERATIONS ====================

@app.get("/api/forms/{form_id}")
async def get_single_form(
    form_id: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    form = get_form_by_id(form_id)
    return _assert_form_owner(form, user)


@app.put("/api/forms/{form_id}")
async def save_form_changes(
    form_id: str,
    payload: FormPayload,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    try:
        updated = update_form(form_id, payload.model_dump(), user_id=user["id"])
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy biểu mẫu.")
    return updated


@app.post("/api/forms/{form_id}/duplicate")
async def duplicate_existing_form(
    form_id: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    original = _assert_form_owner(get_form_by_id(form_id), user)
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
    return create_form(copy_data, user_id=user["id"])


@app.delete("/api/forms/{form_id}")
async def remove_form(
    form_id: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    try:
        ok = delete_form(form_id, user_id=user["id"])
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
    # Strip internal owner user_id when returning to public respondents
    public_copy = dict(form)
    public_copy.pop("user_id", None)
    return public_copy


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

def _build_question_analytics(
    form: dict[str, Any], responses: list[dict[str, Any]], include_open_text: bool = True
) -> list[dict[str, Any]]:
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
        elif include_open_text:
            q_stat["text_answers"] = [str(v) for v in answered_values[:50]]

        stats_list.append(q_stat)
    return stats_list


@app.get("/api/public/forms/{identifier}/summary")
async def get_public_form_summary(identifier: str) -> dict[str, Any]:
    """Aggregated chart summary for respondents (ONLY if enabled by form owner; hides emails/names)."""
    form = get_form_by_slug_or_code(identifier, increment_view=False)
    if not form or not form["is_published"] or not form["allow_public_summary"]:
        raise HTTPException(
            status_code=403, detail="Biểu mẫu này không công khai kết quả thống kê."
        )
    responses = list_responses(form["id"])
    question_stats = _build_question_analytics(form, responses, include_open_text=False)
    return {
        "total_responses": len(responses),
        "views_count": form["views_count"],
        "completion_rate": 100.0,
        "question_stats": question_stats,
        "responses": [],
    }


@app.get("/api/forms/{identifier}/analytics")
async def get_owner_form_analytics(
    identifier: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    form = _assert_form_owner(get_form_by_slug_or_code(identifier, increment_view=False), user)
    responses = list_responses(form["id"])
    question_stats = _build_question_analytics(form, responses, include_open_text=True)
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
async def export_responses_csv(
    form_id: str,
    user: dict[str, Any] = Depends(get_required_user),
):
    form = _assert_form_owner(get_form_by_id(form_id), user)
    responses = list_responses(form_id)

    buf = StringIO()
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
async def remove_single_response(
    form_id: str,
    response_id: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    _assert_form_owner(get_form_by_id(form_id), user)
    ok = delete_response(response_id, form_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy phản hồi.")
    return {"deleted": True, "id": response_id}


FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST / "index.html"))

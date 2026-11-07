from contextlib import asynccontextmanager
from io import StringIO
from pathlib import Path
from typing import Any
import csv
import os
import random
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
    update_response_grade,
)
from form_agent import generate_form_from_prompt, parse_quick_code_to_form
from templates_catalog import SURVEY_TEMPLATES


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="KromaForms Studio & Classroom Quiz API",
    description="Private Multi-Tenant Survey, Auto-Graded Homework Quiz & Anti-Cheat Exam Platform",
    version="3.2.0",
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
    points: float = Field(default=0.0)
    correct_answer: Any = Field(default=None)
    explanation: str = Field(default="")


class FormPayload(BaseModel):
    title: str = Field(default="Biểu mẫu chưa có tiêu đề", max_length=200)
    description: str = Field(default="", max_length=2000)
    theme_color: str = Field(default="indigo")
    thank_you_message: str = Field(
        default="Cảm ơn bạn đã dành thời gian hoàn thành!", max_length=500
    )
    is_published: bool = Field(default=True)
    accepting_responses: bool = Field(default=True)
    collect_email: bool = Field(default=False)
    allow_public_summary: bool = Field(default=True)
    is_quiz: bool = Field(default=False)
    time_limit_minutes: int = Field(default=0, ge=0, le=300)
    anti_cheat_enabled: bool = Field(default=False)
    max_violations: int = Field(default=3, ge=1, le=20)
    show_score_immediately: bool = Field(default=True)
    shuffle_questions: bool = Field(default=False)
    strict_roster: bool = Field(default=False)
    student_roster: list[str] = Field(default_factory=list)
    questions: list[QuestionItem] = Field(default_factory=list)


class AgentGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=2, max_length=1500)
    question_count: int = Field(default=6, ge=2, le=15)
    theme_color: str = Field(default="indigo")
    is_quiz: bool = Field(default=False)
    is_published: bool = Field(default=True)


class ImportCodeRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=20000)
    theme_color: str = Field(default="indigo")
    is_quiz: bool = Field(default=False)
    is_published: bool = Field(default=True)
    parse_only: bool = Field(default=False)


class ExternalAgentQuickCreateRequest(BaseModel):
    prompt: str | None = Field(default=None)
    code: str | None = Field(default=None)
    question_count: int = Field(default=6, ge=2, le=15)
    title: str | None = Field(default=None)
    description: str = Field(default="")
    theme_color: str = Field(default="indigo")
    is_quiz: bool = Field(default=False)
    is_published: bool = Field(default=True)
    questions: list[dict[str, Any]] | None = Field(default=None)


class SubmitSurveyRequest(BaseModel):
    respondent_name: str | None = Field(default=None, max_length=120)
    respondent_email: str | None = Field(default=None, max_length=120)
    student_class: str | None = Field(default=None, max_length=80)
    answers: dict[str, Any] = Field(default_factory=dict)
    cheat_count: int = Field(default=0, ge=0)
    cheat_logs: list[str] = Field(default_factory=list)
    auto_submitted_cheat: bool = Field(default=False)
    duration_seconds: int = Field(default=0, ge=0)


class UpdateGradeRequest(BaseModel):
    bonus_score: float | None = Field(default=None)
    final_score: float | None = Field(default=None)
    teacher_note: str | None = Field(default=None, max_length=500)


class ManualStudentGradeRequest(BaseModel):
    respondent_name: str = Field(..., min_length=1, max_length=120)
    student_class: str | None = Field(default=None, max_length=80)
    final_score: float = Field(..., ge=0, le=1000)
    max_score: float = Field(default=10.0, gt=0, le=1000)
    teacher_note: str | None = Field(default="Chấm điểm riêng trực tiếp", max_length=500)


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


# ==================== QUIZ AUTO-GRADING ENGINE ====================

def _grade_quiz_submission(
    form: dict[str, Any], answers: dict[str, Any]
) -> dict[str, Any]:
    total_earned = 0.0
    total_max = 0.0
    details: list[dict[str, Any]] = []

    for q in form["questions"]:
        qid = q["id"]
        qtype = q.get("type", "short_text")
        pts = float(q.get("points") or 0.0)
        total_max += pts
        correct_ans = q.get("correct_answer")
        user_ans = answers.get(qid)

        is_correct: bool | None = None
        earned = 0.0

        has_key = correct_ans is not None and correct_ans != "" and correct_ans != []
        if pts > 0 and has_key:
            if qtype in ("single_choice", "dropdown"):
                is_correct = (
                    user_ans is not None
                    and str(user_ans).strip() == str(correct_ans).strip()
                )
            elif qtype == "multiple_choice":
                u_list = user_ans if isinstance(user_ans, list) else []
                c_list = (
                    correct_ans
                    if isinstance(correct_ans, list)
                    else [str(correct_ans)]
                )
                u_set = {str(x).strip() for x in u_list if str(x).strip()}
                c_set = {str(x).strip() for x in c_list if str(x).strip()}
                is_correct = bool(c_set) and (u_set == c_set)
            elif qtype == "short_text":
                accepted = [
                    s.strip().lower()
                    for s in str(correct_ans).split("|")
                    if s.strip()
                ]
                u_str = str(user_ans or "").strip().lower()
                is_correct = bool(u_str) and (u_str in accepted)

            if is_correct:
                earned = pts

        total_earned += earned
        details.append(
            {
                "question_id": qid,
                "title": q["title"],
                "user_answer": user_ans,
                "correct_answer": correct_ans if has_key else None,
                "is_correct": is_correct,
                "earned_points": round(earned, 2),
                "max_points": round(pts, 2),
                "explanation": q.get("explanation") or "",
            }
        )

    if total_max <= 0:
        total_max = 10.0

    score_10 = round((total_earned / total_max) * 10.0, 2) if total_max > 0 else 0.0
    return {
        "auto_score": round(total_earned, 2),
        "max_score": round(total_max, 2),
        "score_10": score_10,
        "correct_count": sum(1 for d in details if d["is_correct"] is True),
        "gradable_count": sum(1 for d in details if d["is_correct"] is not None),
        "question_results": details,
    }


# ==================== SYSTEM & AUTH ENDPOINTS ====================

@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "app": "KromaForms Studio & Classroom",
        "version": "3.2.0",
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
                "title": "Câu hỏi đầu tiên của bạn?",
                "description": "",
                "required": True,
                "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
                "max_rating": 5,
                "points": 10.0 if data.get("is_quiz") else 0.0,
                "correct_answer": "Đáp án A" if data.get("is_quiz") else None,
                "explanation": "",
            }
        ]
    return create_form(data, user_id=user["id"])


# ==================== AI AGENT & QUICK CODE FORM/QUIZ GENERATOR ====================

@app.post("/api/forms/agent-generate")
async def agent_generate_survey(
    req: AgentGenerateRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    generated = generate_form_from_prompt(
        prompt=req.prompt,
        question_count=req.question_count,
        theme_color=req.theme_color,
        is_quiz=req.is_quiz,
    )
    engine = generated.pop("generator_engine", "smart_agent")
    generated["is_published"] = req.is_published
    generated["accepting_responses"] = True
    generated["allow_public_summary"] = not generated.get("is_quiz", False)
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
        parsed = parse_quick_code_to_form(
            req.code, default_theme=req.theme_color, force_quiz=req.is_quiz
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if req.parse_only:
        return {"parsed": parsed}

    parsed["is_published"] = req.is_published
    parsed["accepting_responses"] = True
    parsed["allow_public_summary"] = not parsed.get("is_quiz", False)
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
    if req.code and req.code.strip():
        try:
            form_data = parse_quick_code_to_form(
                req.code, default_theme=req.theme_color, force_quiz=req.is_quiz
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    elif req.prompt and req.prompt.strip():
        form_data = generate_form_from_prompt(
            prompt=req.prompt,
            question_count=req.question_count,
            theme_color=req.theme_color,
            is_quiz=req.is_quiz,
        )
        form_data.pop("generator_engine", None)
    elif req.questions:
        form_data = {
            "title": req.title or "Biểu mẫu tạo qua Agent API",
            "description": req.description,
            "theme_color": req.theme_color,
            "is_quiz": req.is_quiz,
            "anti_cheat_enabled": req.is_quiz,
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
    form_data["allow_public_summary"] = not form_data.get("is_quiz", False)

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


# ==================== OWNER-ONLY FORM & GRADEBOOK OPERATIONS ====================

@app.get("/api/forms/{form_id}")
async def get_single_form(
    form_id: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    return _assert_form_owner(get_form_by_id(form_id), user)


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
        "is_quiz": original["is_quiz"],
        "time_limit_minutes": original["time_limit_minutes"],
        "anti_cheat_enabled": original["anti_cheat_enabled"],
        "max_violations": original["max_violations"],
        "show_score_immediately": original["show_score_immediately"],
        "shuffle_questions": original["shuffle_questions"],
        "strict_roster": original["strict_roster"],
        "student_roster": original["student_roster"],
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


@app.patch("/api/forms/{form_id}/responses/{response_id}/grade")
async def patch_student_grade(
    form_id: str,
    response_id: str,
    req: UpdateGradeRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    _assert_form_owner(get_form_by_id(form_id), user)
    updated = update_response_grade(
        form_id=form_id,
        response_id=response_id,
        bonus_score=req.bonus_score,
        final_score=req.final_score,
        teacher_note=req.teacher_note,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài nộp của học sinh.")
    return {"response": updated}


@app.post("/api/forms/{form_id}/manual-grade")
async def add_manual_student_grade(
    form_id: str,
    req: ManualStudentGradeRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    """Allow teacher to assign a custom score directly to any student name in the Gradebook."""
    _assert_form_owner(get_form_by_id(form_id), user)
    saved = submit_response(
        form_id=form_id,
        answers={},
        respondent_name=req.respondent_name,
        student_class=req.student_class,
        auto_score=0.0,
        max_score=req.max_score,
        bonus_score=req.final_score,
        final_score=req.final_score,
        teacher_note=req.teacher_note,
        cheat_count=0,
        cheat_logs=[],
        auto_submitted_cheat=False,
        duration_seconds=0,
    )
    return {"response": saved}


# ==================== PUBLIC STUDENT / RESPONDENT ENDPOINTS ====================

@app.get("/api/public/forms/{identifier}")
async def fetch_public_form(identifier: str) -> dict[str, Any]:
    form = get_form_by_slug_or_code(identifier, increment_view=True)
    if not form or not form["is_published"]:
        raise HTTPException(
            status_code=404,
            detail="Biểu mẫu / Bài tập này không tồn tại hoặc đã đóng công khai.",
        )

    # Strip answer keys & explanations so students cannot inspect DevTools!
    safe_questions = []
    for q in form["questions"]:
        sq = dict(q)
        sq.pop("correct_answer", None)
        sq.pop("explanation", None)
        safe_questions.append(sq)

    if form.get("shuffle_questions"):
        random.shuffle(safe_questions)

    public_copy = dict(form)
    public_copy.pop("user_id", None)
    public_copy["questions"] = safe_questions
    return public_copy


@app.post("/api/public/forms/{identifier}/submit")
async def submit_public_form(identifier: str, req: SubmitSurveyRequest) -> dict[str, Any]:
    form = get_form_by_slug_or_code(identifier, increment_view=False)
    if not form or not form["is_published"]:
        raise HTTPException(status_code=404, detail="Biểu mẫu không tồn tại hoặc đã đóng.")
    if not form["accepting_responses"]:
        raise HTTPException(
            status_code=400, detail="Bài tập / Biểu mẫu này hiện đã khóa nhận bài mới."
        )

    clean_name = (req.respondent_name or "").strip()
    if form["is_quiz"] and not clean_name:
        raise HTTPException(
            status_code=400, detail="Vui lòng nhập hoặc chọn Họ và tên Học sinh trước khi nộp bài!"
        )

    if form["strict_roster"] and form["student_roster"]:
        allowed_names = {n.strip().lower() for n in form["student_roster"]}
        if clean_name.lower() not in allowed_names:
            raise HTTPException(
                status_code=400,
                detail="Tên học sinh không nằm trong Danh sách lớp được giao bài. Vui lòng chọn đúng tên trong danh sách!",
            )

    if form["collect_email"] and not (req.respondent_email or "").strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập địa chỉ Email của bạn.")

    # Skip strict required-field rejection ONLY if auto-submitted due to anti-cheat / timeout
    if not req.auto_submitted_cheat:
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

    quiz_result: dict[str, Any] | None = None
    auto_score: float | None = None
    max_score: float | None = None
    final_score: float | None = None

    if form["is_quiz"]:
        quiz_result = _grade_quiz_submission(form, req.answers)
        auto_score = quiz_result["auto_score"]
        max_score = quiz_result["max_score"]
        final_score = auto_score

    saved = submit_response(
        form_id=form["id"],
        answers=req.answers,
        respondent_name=clean_name or None,
        respondent_email=req.respondent_email,
        student_class=req.student_class,
        auto_score=auto_score,
        max_score=max_score,
        bonus_score=0.0,
        final_score=final_score,
        cheat_count=req.cheat_count,
        cheat_logs=req.cheat_logs,
        auto_submitted_cheat=req.auto_submitted_cheat,
        duration_seconds=req.duration_seconds,
    )

    return {
        "submitted": True,
        "response": saved,
        "thank_you_message": form["thank_you_message"],
        "allow_public_summary": form["allow_public_summary"] and not form["is_quiz"],
        "is_quiz": form["is_quiz"],
        "show_score_immediately": form["show_score_immediately"],
        "quiz_result": quiz_result if (form["is_quiz"] and form["show_score_immediately"]) else None,
    }


# ==================== ANALYTICS, GRADEBOOK & CSV EXPORT ====================

def _build_question_analytics(
    form: dict[str, Any], responses: list[dict[str, Any]], include_open_text: bool = True
) -> list[dict[str, Any]]:
    stats_list: list[dict[str, Any]] = []
    for q in form["questions"]:
        qid = q["id"]
        qtype = q["type"]
        answered_values = []
        correct_hits = 0
        has_key = q.get("correct_answer") not in (None, "", [])

        for r in responses:
            val = r["answers"].get(qid)
            if val is not None and val != "" and val != []:
                answered_values.append(val)
                if form["is_quiz"] and has_key:
                    ca = q.get("correct_answer")
                    if qtype in ("single_choice", "dropdown") and str(val).strip() == str(ca).strip():
                        correct_hits += 1
                    elif qtype == "multiple_choice":
                        u_s = {str(x).strip() for x in (val if isinstance(val, list) else [])}
                        c_s = {str(x).strip() for x in (ca if isinstance(ca, list) else [ca])}
                        if u_s == c_s:
                            correct_hits += 1
                    elif qtype == "short_text":
                        acc = [s.strip().lower() for s in str(ca).split("|") if s.strip()]
                        if str(val).strip().lower() in acc:
                            correct_hits += 1

        q_stat: dict[str, Any] = {
            "question_id": qid,
            "title": q["title"],
            "type": qtype,
            "answered_count": len(answered_values),
            "points": float(q.get("points") or 0),
            "correct_answer": q.get("correct_answer"),
            "correct_rate": round((correct_hits / max(1, len(answered_values))) * 100, 1)
            if (form["is_quiz"] and has_key and answered_values)
            else None,
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


def _build_roster_gradebook(
    form: dict[str, Any], responses: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    roster_names = form.get("student_roster") or []
    by_lower_name: dict[str, dict[str, Any]] = {}
    for r in responses:
        nm = (r.get("respondent_name") or "").strip().lower()
        if nm and nm not in by_lower_name:
            by_lower_name[nm] = r

    roster_rows: list[dict[str, Any]] = []
    for st_name in roster_names:
        matched = by_lower_name.get(st_name.strip().lower())
        if matched:
            max_s = float(matched.get("max_score") or 10.0)
            fin_s = float(matched.get("final_score") or 0.0)
            roster_rows.append(
                {
                    "student_name": st_name,
                    "submitted": True,
                    "response_id": matched["id"],
                    "student_class": matched.get("student_class"),
                    "auto_score": matched.get("auto_score"),
                    "bonus_score": matched.get("bonus_score", 0.0),
                    "final_score": fin_s,
                    "max_score": max_s,
                    "score_10": round((fin_s / max_s) * 10.0, 2) if max_s > 0 else fin_s,
                    "cheat_count": matched.get("cheat_count", 0),
                    "auto_submitted_cheat": matched.get("auto_submitted_cheat", False),
                    "duration_seconds": matched.get("duration_seconds", 0),
                    "teacher_note": matched.get("teacher_note"),
                    "submitted_at": matched.get("submitted_at"),
                }
            )
        else:
            roster_rows.append(
                {
                    "student_name": st_name,
                    "submitted": False,
                    "response_id": None,
                    "student_class": None,
                    "auto_score": None,
                    "bonus_score": 0.0,
                    "final_score": None,
                    "max_score": None,
                    "score_10": None,
                    "cheat_count": 0,
                    "auto_submitted_cheat": False,
                    "duration_seconds": 0,
                    "teacher_note": None,
                    "submitted_at": None,
                }
            )
    return roster_rows


@app.get("/api/public/forms/{identifier}/summary")
async def get_public_form_summary(identifier: str) -> dict[str, Any]:
    form = get_form_by_slug_or_code(identifier, increment_view=False)
    if not form or not form["is_published"] or not form["allow_public_summary"] or form["is_quiz"]:
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
    roster_gradebook = _build_roster_gradebook(form, responses)

    completion_rate = (
        round((len(responses) / max(1, form["views_count"])) * 100, 1)
        if form["views_count"] > 0
        else 100.0
    )

    scores_10: list[float] = []
    flagged_cheat_students = 0
    for r in responses:
        if r.get("cheat_count", 0) > 0:
            flagged_cheat_students += 1
        if r.get("final_score") is not None:
            ms = float(r.get("max_score") or 10.0)
            fs = float(r["final_score"])
            scores_10.append(round((fs / ms) * 10.0, 2) if ms > 0 else fs)

    return {
        "form": form,
        "total_responses": len(responses),
        "views_count": form["views_count"],
        "completion_rate": min(100.0, completion_rate),
        "average_score_10": round(sum(scores_10) / len(scores_10), 2) if scores_10 else None,
        "highest_score_10": max(scores_10) if scores_10 else None,
        "flagged_cheat_count": flagged_cheat_students,
        "roster_gradebook": roster_gradebook,
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

    if form["is_quiz"]:
        headers = [
            "STT",
            "Họ và tên Học sinh",
            "Lớp / Mã HS",
            "Điểm Trắc nghiệm",
            "Điểm Cộng / Tự luận",
            "Tổng Điểm",
            "Quy đổi Thang 10",
            "Số lần Thoát App (Gian lận)",
            "Thời gian làm bài (giây)",
            "Nhận xét của Giáo viên",
            "Thời gian nộp",
        ] + [q["title"] for q in form["questions"]]
        writer.writerow(headers)

        for idx, r in enumerate(responses, start=1):
            ms = float(r.get("max_score") or 10.0)
            fs = float(r.get("final_score") or 0.0)
            s10 = round((fs / ms) * 10.0, 2) if ms > 0 else fs
            row = [
                idx,
                r.get("respondent_name") or "Chưa ghi tên",
                r.get("student_class") or "",
                r.get("auto_score") if r.get("auto_score") is not None else "",
                r.get("bonus_score", 0),
                fs,
                s10,
                r.get("cheat_count", 0),
                r.get("duration_seconds", 0),
                r.get("teacher_note") or "",
                r["submitted_at"],
            ]
            for q in form["questions"]:
                ans = r["answers"].get(q["id"], "")
                if isinstance(ans, list):
                    ans = "; ".join(str(x) for x in ans)
                row.append(str(ans) if ans is not None else "")
            writer.writerow(row)
    else:
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
    prefix = "bang_diem" if form["is_quiz"] else "khao_sat"
    filename = f"{prefix}_{form['slug']}.csv"
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

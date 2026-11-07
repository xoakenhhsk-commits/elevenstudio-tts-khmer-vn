from contextlib import asynccontextmanager
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Any
import csv
import os
import random
import socket

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from database import (
    assign_form_to_classroom,
    authenticate_user,
    count_student_attempts,
    create_classroom,
    create_form,
    create_session,
    create_user,
    delete_classroom,
    delete_form,
    delete_response,
    delete_session,
    get_classroom_by_code_or_id,
    get_classroom_by_id,
    get_form_by_id,
    get_form_by_slug_or_code,
    get_user_by_agent_key,
    get_user_by_token,
    init_db,
    list_classrooms_for_owner,
    list_forms_by_classroom,
    list_forms_for_owner,
    list_responses,
    regenerate_user_agent_key,
    submit_response,
    update_classroom,
    update_form,
    update_response_grade,
)
from form_agent import generate_form_from_prompt, parse_quick_code_to_form
from live_game import (
    PLAYER_AVATARS,
    broadcast_room_state,
    create_game_room,
    find_active_room_for_classroom,
    get_room,
    host_perform_action,
    join_game_room,
    register_ws,
    remove_player_from_room,
    serialize_room_for_host,
    serialize_room_for_player,
    submit_player_answer,
    unregister_ws,
    update_room_settings,
)
from templates_catalog import SURVEY_TEMPLATES


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="KromaForms Studio, Classroom LMS & Live Game Arena API",
    description="Private Multi-Tenant Classrooms, Kahoot-Style Live Quiz Games, Auto-Graded Homework & Anti-Cheat Proctoring",
    version="5.0.0",
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
        content = PUBLIC_TUNNEL_URL_FILE.read_text(encoding="utf-8-sig").strip()
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


def build_public_game_urls(pin: str) -> dict[str, str]:
    lan_ip = get_lan_ip()
    tunnel = get_public_tunnel_url()
    local_base = "http://localhost:5173"
    lan_base = f"http://{lan_ip}:5173"
    primary_base = tunnel or (lan_base if lan_ip != "127.0.0.1" else local_base)
    return {
        "play_url": f"{primary_base}/play/{pin}",
        "lobby_url": f"{primary_base}/play",
        "lan_play_url": f"{lan_base}/play/{pin}",
        "local_play_url": f"{local_base}/play/{pin}",
    }


def _is_past_due(due_at_str: str | None) -> bool:
    if not due_at_str or not str(due_at_str).strip():
        return False
    try:
        raw = str(due_at_str).strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            now_local = datetime.now()
            return now_local > dt
        return datetime.now(timezone.utc) > dt.astimezone(timezone.utc)
    except Exception:
        return False


# ==================== SCHEMAS ====================

class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=1, max_length=128)


class ClassroomPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    subject: str = Field(default="", max_length=120)
    school_year: str = Field(default="2026 - 2027", max_length=40)
    description: str = Field(default="", max_length=1000)
    theme_color: str = Field(default="indigo")
    students: list[Any] = Field(default_factory=list)


class AssignClassroomRequest(BaseModel):
    classroom_id: str | None = Field(default=None)
    strict_roster: bool | None = Field(default=None)
    max_attempts: int | None = Field(default=None, ge=0, le=20)
    due_at: str | None = Field(default=None)


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
    classroom_id: str | None = Field(default=None)
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
    max_attempts: int = Field(default=0, ge=0, le=20)
    due_at: str | None = Field(default=None)
    pass_score: float = Field(default=5.0, ge=0, le=10)
    questions: list[QuestionItem] = Field(default_factory=list)


class AgentGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=2, max_length=1500)
    question_count: int = Field(default=6, ge=2, le=15)
    theme_color: str = Field(default="indigo")
    is_quiz: bool = Field(default=False)
    is_published: bool = Field(default=True)
    classroom_id: str | None = Field(default=None)


class ImportCodeRequest(BaseModel):
    code: str = Field(..., min_length=3, max_length=20000)
    theme_color: str = Field(default="indigo")
    is_quiz: bool = Field(default=False)
    is_published: bool = Field(default=True)
    parse_only: bool = Field(default=False)
    classroom_id: str | None = Field(default=None)


class ExternalAgentQuickCreateRequest(BaseModel):
    prompt: str | None = Field(default=None)
    code: str | None = Field(default=None)
    question_count: int = Field(default=6, ge=2, le=15)
    title: str | None = Field(default=None)
    description: str = Field(default="")
    theme_color: str = Field(default="indigo")
    is_quiz: bool = Field(default=False)
    is_published: bool = Field(default=True)
    classroom_id: str | None = Field(default=None)
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


def _assert_classroom_owner(cls: dict[str, Any] | None, user: dict[str, Any]) -> dict[str, Any]:
    if not cls:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp học.")
    if cls.get("user_id") != user["id"]:
        raise HTTPException(
            status_code=403,
            detail="Lớp học này thuộc tài khoản giáo viên khác.",
        )
    return cls


def _classify_academic_rank(avg10: float | None) -> str:
    if avg10 is None:
        return "Chưa có điểm"
    if avg10 >= 9.0:
        return "Xuất sắc"
    if avg10 >= 8.0:
        return "Giỏi"
    if avg10 >= 6.5:
        return "Khá"
    if avg10 >= 5.0:
        return "Đạt"
    return "Cần cố gắng"


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
        "app": "KromaForms Studio, Classroom LMS & Live Game Arena",
        "version": "5.0.0",
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


# ==================== CLASSROOM & MASTER GRADEBOOK ENDPOINTS ====================

@app.get("/api/classrooms")
async def get_my_classrooms(
    user: dict[str, Any] | None = Depends(get_optional_user),
) -> dict[str, Any]:
    if not user:
        return {"classrooms": []}
    return {"classrooms": list_classrooms_for_owner(user["id"])}


@app.post("/api/classrooms")
async def create_new_classroom(
    payload: ClassroomPayload,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    return create_classroom(payload.model_dump(), user_id=user["id"])


def _compute_classroom_master_gradebook(cls: dict[str, Any]) -> dict[str, Any]:
    forms = list_forms_by_classroom(cls["id"], published_only=False)
    responses_by_form: dict[str, dict[str, dict[str, Any]]] = {}

    for f in forms:
        f_resps = list_responses(f["id"])
        by_name: dict[str, dict[str, Any]] = {}
        for r in f_resps:
            nm = (r.get("respondent_name") or "").strip().lower()
            if nm and nm not in by_name:
                by_name[nm] = r
        responses_by_form[f["id"]] = by_name

    student_rows: list[dict[str, Any]] = []
    class_avg_list: list[float] = []

    for st in cls["students"]:
        st_name = st["name"]
        key = st_name.strip().lower()
        scores_by_form: dict[str, float | None] = {}
        earned_scores_10: list[float] = []
        total_cheats = 0
        submitted_cnt = 0

        for f in forms:
            matched = responses_by_form[f["id"]].get(key)
            if matched:
                submitted_cnt += 1
                total_cheats += int(matched.get("cheat_count") or 0)
                if matched.get("final_score") is not None:
                    ms = float(matched.get("max_score") or 10.0)
                    fs = float(matched["final_score"])
                    s10 = round((fs / ms) * 10.0, 2) if ms > 0 else fs
                    scores_by_form[f["id"]] = s10
                    earned_scores_10.append(s10)
                else:
                    scores_by_form[f["id"]] = 10.0
            else:
                scores_by_form[f["id"]] = None

        bonus = float(st.get("bonus_points") or 0.0)
        raw_avg = (
            round(sum(earned_scores_10) / len(earned_scores_10), 2)
            if earned_scores_10
            else None
        )
        final_avg = (
            round(min(10.0, max(0.0, raw_avg + bonus)), 2)
            if raw_avg is not None
            else (round(bonus, 2) if bonus > 0 else None)
        )
        if final_avg is not None:
            class_avg_list.append(final_avg)

        student_rows.append(
            {
                "id": st["id"],
                "student_code": st.get("student_code", ""),
                "name": st_name,
                "bonus_points": bonus,
                "note": st.get("note", ""),
                "submitted_count": submitted_cnt,
                "total_forms": len(forms),
                "total_cheats": total_cheats,
                "scores_by_form": scores_by_form,
                "average_score_10": final_avg,
                "academic_rank": _classify_academic_rank(final_avg),
            }
        )

    return {
        "classroom": cls,
        "assigned_forms": [
            {
                "id": f["id"],
                "title": f["title"],
                "slug": f["slug"],
                "access_code": f["access_code"],
                "is_quiz": f["is_quiz"],
                "is_published": f["is_published"],
                "accepting_responses": f["accepting_responses"],
                "time_limit_minutes": f["time_limit_minutes"],
                "anti_cheat_enabled": f["anti_cheat_enabled"],
                "due_at": f.get("due_at"),
                "response_count": f["response_count"],
                "question_count": len(f["questions"]),
            }
            for f in forms
        ],
        "student_rows": student_rows,
        "class_average_10": round(sum(class_avg_list) / len(class_avg_list), 2)
        if class_avg_list
        else None,
    }


@app.get("/api/classrooms/{classroom_id}/gradebook")
async def get_classroom_gradebook(
    classroom_id: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    cls = _assert_classroom_owner(get_classroom_by_id(classroom_id), user)
    return _compute_classroom_master_gradebook(cls)


@app.get("/api/classrooms/{classroom_id}/export-gradebook.csv")
async def export_classroom_master_csv(
    classroom_id: str,
    user: dict[str, Any] = Depends(get_required_user),
):
    cls = _assert_classroom_owner(get_classroom_by_id(classroom_id), user)
    gb = _compute_classroom_master_gradebook(cls)
    forms = gb["assigned_forms"]

    buf = StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf)

    headers = (
        ["STT", "Mã HS", "Họ và tên Học sinh", "Lớp"]
        + [f["title"] for f in forms]
        + [
            "Số bài đã nộp",
            "Điểm cộng chuyên cần",
            "Điểm TB Chung (Hệ 10)",
            "Xếp loại",
            "Cảnh báo Thoát App",
            "Ghi chú GV",
        ]
    )
    writer.writerow(headers)

    for idx, row in enumerate(gb["student_rows"], start=1):
        csv_row: list[Any] = [
            idx,
            row["student_code"],
            row["name"],
            cls["name"],
        ]
        for f in forms:
            sc = row["scores_by_form"].get(f["id"])
            csv_row.append(sc if sc is not None else "Chưa nộp")
        csv_row.extend(
            [
                f"{row['submitted_count']}/{row['total_forms']}",
                row["bonus_points"],
                row["average_score_10"] if row["average_score_10"] is not None else "",
                row["academic_rank"],
                row["total_cheats"],
                row["note"],
            ]
        )
        writer.writerow(csv_row)

    buf.seek(0)
    filename = f"so_diem_lop_{cls['room_code']}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.put("/api/classrooms/{classroom_id}")
async def save_classroom_changes(
    classroom_id: str,
    payload: ClassroomPayload,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    try:
        updated = update_classroom(classroom_id, payload.model_dump(), user_id=user["id"])
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp học.")
    return updated


@app.delete("/api/classrooms/{classroom_id}")
async def remove_classroom(
    classroom_id: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    try:
        ok = delete_classroom(classroom_id, user_id=user["id"])
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not ok:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp học.")
    return {"deleted": True, "id": classroom_id}


# ==================== PUBLIC CLASSROOM PORTAL (FOR STUDENTS ON MOBILE) ====================

@app.get("/api/public/classrooms/{identifier}")
async def fetch_public_classroom_portal(identifier: str) -> dict[str, Any]:
    cls = get_classroom_by_code_or_id(identifier)
    if not cls:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy Phòng Lớp Học với mã này. Vui lòng kiểm tra lại Mã Lớp (KL-...).",
        )

    forms = list_forms_by_classroom(cls["id"], published_only=True)
    assignments = []
    for f in forms:
        assignments.append(
            {
                "id": f["id"],
                "slug": f["slug"],
                "access_code": f["access_code"],
                "title": f["title"],
                "description": f["description"],
                "theme_color": f["theme_color"],
                "is_quiz": f["is_quiz"],
                "accepting_responses": f["accepting_responses"] and not _is_past_due(f.get("due_at")),
                "time_limit_minutes": f["time_limit_minutes"],
                "anti_cheat_enabled": f["anti_cheat_enabled"],
                "due_at": f.get("due_at"),
                "is_past_due": _is_past_due(f.get("due_at")),
                "question_count": len(f["questions"]),
                "response_count": f["response_count"],
                "created_at": f["created_at"],
            }
        )

    return {
        "id": cls["id"],
        "room_code": cls["room_code"],
        "name": cls["name"],
        "subject": cls["subject"],
        "school_year": cls["school_year"],
        "description": cls["description"],
        "theme_color": cls["theme_color"],
        "student_names": cls["student_names"],
        "student_count": cls["student_count"],
        "assignments": assignments,
        "active_live_game": find_active_room_for_classroom(cls["id"]),
    }


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
    if req.classroom_id:
        generated["classroom_id"] = req.classroom_id
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
    if req.classroom_id:
        parsed["classroom_id"] = req.classroom_id
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
    if req.classroom_id:
        form_data["classroom_id"] = req.classroom_id
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


@app.post("/api/forms/{form_id}/assign-classroom")
async def assign_form_classroom_endpoint(
    form_id: str,
    req: AssignClassroomRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    try:
        updated = assign_form_to_classroom(
            form_id=form_id,
            classroom_id=req.classroom_id,
            user_id=user["id"],
            strict_roster=req.strict_roster,
            max_attempts=req.max_attempts,
            due_at=req.due_at,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy bài tập / biểu mẫu.")
    return updated


@app.post("/api/forms/{form_id}/duplicate")
async def duplicate_existing_form(
    form_id: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    original = _assert_form_owner(get_form_by_id(form_id), user)
    copy_data = {
        "classroom_id": original.get("classroom_id"),
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
        "max_attempts": original.get("max_attempts", 0),
        "due_at": original.get("due_at"),
        "pass_score": original.get("pass_score", 5.0),
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
    form = _assert_form_owner(get_form_by_id(form_id), user)
    saved = submit_response(
        form_id=form_id,
        answers={},
        respondent_name=req.respondent_name,
        student_class=req.student_class or form.get("classroom_name"),
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
    public_copy["is_past_due"] = _is_past_due(form.get("due_at"))
    if form.get("classroom_id"):
        cls = get_classroom_by_id(form["classroom_id"])
        if cls:
            public_copy["classroom_room_code"] = cls["room_code"]
            public_copy["classroom_subject"] = cls["subject"]
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
    if _is_past_due(form.get("due_at")):
        raise HTTPException(
            status_code=400,
            detail="Bài tập này đã quá hạn chót nộp bài theo quy định của Giáo viên!",
        )

    clean_name = (req.respondent_name or "").strip()
    if form["is_quiz"] and not clean_name:
        raise HTTPException(
            status_code=400, detail="Vui lòng chọn hoặc nhập Họ và tên Học sinh trước khi nộp bài!"
        )

    if form["strict_roster"] and form["student_roster"]:
        allowed_names = {n.strip().lower() for n in form["student_roster"]}
        if clean_name.lower() not in allowed_names:
            cls_label = f" ({form['classroom_name']})" if form.get("classroom_name") else ""
            raise HTTPException(
                status_code=400,
                detail=f"Tên học sinh không nằm trong Danh sách lớp được giao bài{cls_label}. Vui lòng chọn đúng tên trong danh sách!",
            )

    max_att = int(form.get("max_attempts") or 0)
    if max_att > 0 and clean_name:
        used_att = count_student_attempts(form["id"], clean_name)
        if used_att >= max_att:
            raise HTTPException(
                status_code=400,
                detail=f"Học sinh '{clean_name}' đã nộp bài đủ số lần cho phép ({max_att} lần)!",
            )

    if form["collect_email"] and not (req.respondent_email or "").strip():
        raise HTTPException(status_code=400, detail="Vui lòng nhập địa chỉ Email của bạn.")

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

    effective_class = (req.student_class or "").strip() or form.get("classroom_name") or None

    saved = submit_response(
        form_id=form["id"],
        answers=req.answers,
        respondent_name=clean_name or None,
        respondent_email=req.respondent_email,
        student_class=effective_class,
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
        "pass_score": form.get("pass_score", 5.0),
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
                    "student_class": matched.get("student_class") or form.get("classroom_name"),
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
                    "student_class": form.get("classroom_name"),
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

    pass_threshold = float(form.get("pass_score") if form.get("pass_score") is not None else 5.0)
    scores_10: list[float] = []
    passed_count = 0
    flagged_cheat_students = 0
    buckets = {
        "Giỏi (8.0 - 10đ)": 0,
        "Khá (6.5 - 7.9đ)": 0,
        "Đạt (5.0 - 6.4đ)": 0,
        "Chưa đạt (< 5.0đ)": 0,
    }
    leaderboard_candidates: list[dict[str, Any]] = []

    for r in responses:
        if r.get("cheat_count", 0) > 0:
            flagged_cheat_students += 1
        if r.get("final_score") is not None:
            ms = float(r.get("max_score") or 10.0)
            fs = float(r["final_score"])
            s10 = round((fs / ms) * 10.0, 2) if ms > 0 else fs
            scores_10.append(s10)
            if s10 >= pass_threshold:
                passed_count += 1
            if s10 >= 8.0:
                buckets["Giỏi (8.0 - 10đ)"] += 1
            elif s10 >= 6.5:
                buckets["Khá (6.5 - 7.9đ)"] += 1
            elif s10 >= 5.0:
                buckets["Đạt (5.0 - 6.4đ)"] += 1
            else:
                buckets["Chưa đạt (< 5.0đ)"] += 1

            leaderboard_candidates.append(
                {
                    "id": r["id"],
                    "name": r.get("respondent_name") or "Học sinh",
                    "student_class": r.get("student_class") or form.get("classroom_name") or "",
                    "score_10": s10,
                    "duration_seconds": int(r.get("duration_seconds") or 0),
                    "cheat_count": int(r.get("cheat_count") or 0),
                }
            )

    leaderboard_candidates.sort(
        key=lambda x: (-x["score_10"], x["cheat_count"], x["duration_seconds"] or 999999)
    )
    total_scored = max(1, len(scores_10))
    score_distribution = [
        {
            "label": k,
            "count": v,
            "percent": round((v / total_scored) * 100, 1) if scores_10 else 0.0,
        }
        for k, v in buckets.items()
    ]

    return {
        "form": form,
        "total_responses": len(responses),
        "views_count": form["views_count"],
        "completion_rate": min(100.0, completion_rate),
        "average_score_10": round(sum(scores_10) / len(scores_10), 2) if scores_10 else None,
        "highest_score_10": max(scores_10) if scores_10 else None,
        "pass_rate": round((passed_count / len(scores_10)) * 100, 1) if scores_10 else None,
        "score_distribution": score_distribution,
        "top_students": leaderboard_candidates[:5],
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
                r.get("student_class") or form.get("classroom_name") or "",
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


# ==================== KAHOOT-STYLE LIVE CLASSROOM GAME ARENA ====================

class CreateLiveRoomRequest(BaseModel):
    form_id: str
    question_time_seconds: int = Field(default=20, ge=5, le=120)
    speed_bonus: bool = True
    show_options_on_phone: bool = False


class LiveHostActionRequest(BaseModel):
    action: str  # start_game | reveal_answer | show_leaderboard | next_question | finish_game


class LiveRoomSettingsRequest(BaseModel):
    question_time_seconds: int | None = None
    speed_bonus: bool | None = None
    show_options_on_phone: bool | None = None


class JoinLiveRoomRequest(BaseModel):
    name: str
    avatar: str = "🦊"
    student_class: str = ""
    player_token: str | None = None


class SubmitLiveAnswerRequest(BaseModel):
    player_id: str
    player_token: str
    choice_index: int


def _assert_room_host(pin: str, user: dict[str, Any]) -> dict[str, Any]:
    room = get_room(pin)
    if not room:
        raise HTTPException(status_code=404, detail="Phòng Game không tồn tại hoặc đã đóng.")
    if room.get("host_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Bạn không phải Giáo viên chủ phòng của Game này.")
    return room


@app.get("/api/live/avatars")
async def get_live_game_avatars() -> dict[str, Any]:
    return {"avatars": PLAYER_AVATARS}


@app.post("/api/live/rooms")
async def host_create_live_room(
    req: CreateLiveRoomRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    form = _assert_form_owner(get_form_by_id(req.form_id), user)
    room = create_game_room(
        form=form,
        host_user_id=user["id"],
        host_name=user.get("full_name") or user["email"],
        question_time_seconds=req.question_time_seconds,
        speed_bonus=req.speed_bonus,
        show_options_on_phone=req.show_options_on_phone,
    )
    return {
        "room": serialize_room_for_host(room),
        "urls": build_public_game_urls(room["pin"]),
    }


@app.get("/api/live/rooms/{pin}/host")
async def host_get_live_room_state(
    pin: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    room = _assert_room_host(pin, user)
    return {
        "room": serialize_room_for_host(room),
        "urls": build_public_game_urls(room["pin"]),
    }


@app.post("/api/live/rooms/{pin}/action")
async def host_live_room_action(
    pin: str,
    req: LiveHostActionRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    room = _assert_room_host(pin, user)
    if req.action not in (
        "start_game",
        "reveal_answer",
        "show_leaderboard",
        "next_question",
        "finish_game",
    ):
        raise HTTPException(status_code=400, detail="Hành động điều khiển Game không hợp lệ.")
    host_perform_action(room, req.action)
    await broadcast_room_state(room["pin"])
    return {
        "room": serialize_room_for_host(room),
        "urls": build_public_game_urls(room["pin"]),
    }


@app.patch("/api/live/rooms/{pin}/settings")
async def host_patch_live_room_settings(
    pin: str,
    req: LiveRoomSettingsRequest,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    room = _assert_room_host(pin, user)
    update_room_settings(
        room,
        question_time_seconds=req.question_time_seconds,
        speed_bonus=req.speed_bonus,
        show_options_on_phone=req.show_options_on_phone,
    )
    await broadcast_room_state(room["pin"])
    return {
        "room": serialize_room_for_host(room),
        "urls": build_public_game_urls(room["pin"]),
    }


@app.delete("/api/live/rooms/{pin}/players/{player_id}")
async def host_kick_player(
    pin: str,
    player_id: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    room = _assert_room_host(pin, user)
    remove_player_from_room(room, player_id)
    await broadcast_room_state(room["pin"])
    return {"room": serialize_room_for_host(room)}


@app.post("/api/live/rooms/{pin}/save-to-gradebook")
async def host_save_game_to_gradebook(
    pin: str,
    user: dict[str, Any] = Depends(get_required_user),
) -> dict[str, Any]:
    room = _assert_room_host(pin, user)
    if room.get("saved_to_gradebook"):
        return {
            "saved": True,
            "saved_count": room.get("saved_count", 0),
            "room": serialize_room_for_host(room),
        }

    total_q = len(room["questions"])
    saved_count = 0
    for p in room["players"].values():
        mapped_answers: dict[str, Any] = {}
        for q in room["questions"]:
            ans_rec = p["answers"].get(q["id"])
            c_idx = ans_rec.get("choice_index") if ans_rec else None
            if c_idx is not None and 0 <= int(c_idx) < len(q["options"]):
                mapped_answers[q["id"]] = q["options"][int(c_idx)]
            else:
                mapped_answers[q["id"]] = ""

        score_10 = round((int(p["correct_count"]) / total_q) * 10.0, 2) if total_q > 0 else 0.0
        duration_sec = max(1, round(float(p.get("total_time_ms") or 0.0) / 1000.0))
        note = (
            f"🎮 Game Live PIN {room['pin']} • Hạng #{p['rank']} • "
            f"{p['score']} pts • Đúng {p['correct_count']}/{total_q} câu"
        )
        submit_response(
            form_id=room["form_id"],
            answers=mapped_answers,
            respondent_name=p["name"],
            respondent_email=None,
            student_class=p.get("student_class") or room.get("classroom_name") or "",
            auto_score=score_10,
            max_score=10.0,
            bonus_score=0.0,
            final_score=score_10,
            teacher_note=note,
            cheat_count=0,
            cheat_logs=[],
            auto_submitted_cheat=False,
            duration_seconds=duration_sec,
        )
        saved_count += 1

    room["saved_to_gradebook"] = True
    room["saved_count"] = saved_count
    await broadcast_room_state(room["pin"])
    return {
        "saved": True,
        "saved_count": saved_count,
        "room": serialize_room_for_host(room),
    }


@app.get("/api/live/rooms/{pin}/info")
async def public_get_live_room_info(pin: str) -> dict[str, Any]:
    room = get_room(pin)
    if not room:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy phòng Game với mã PIN này. Hãy kiểm tra lại mã 6 số trên màn hình Giáo viên!",
        )
    return {
        "pin": room["pin"],
        "title": room["title"],
        "classroom_name": room.get("classroom_name"),
        "student_roster": room.get("student_roster") or [],
        "host_name": room["host_name"],
        "status": room["status"],
        "player_count": len(room["players"]),
        "total_questions": len(room["questions"]),
        "avatars": PLAYER_AVATARS,
    }


@app.post("/api/live/rooms/{pin}/join")
async def public_join_live_room(
    pin: str,
    req: JoinLiveRoomRequest,
) -> dict[str, Any]:
    try:
        room, player = join_game_room(
            pin=pin,
            name=req.name,
            avatar=req.avatar,
            student_class=req.student_class,
            player_token=req.player_token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await broadcast_room_state(room["pin"])
    return {
        "player_id": player["id"],
        "player_token": player["token"],
        "state": serialize_room_for_player(room, player["id"]),
    }


@app.get("/api/live/rooms/{pin}/state")
async def public_get_player_room_state(
    pin: str,
    player_id: str | None = Query(default=None),
) -> dict[str, Any]:
    room = get_room(pin)
    if not room:
        raise HTTPException(status_code=404, detail="Phòng Game đã đóng hoặc mã PIN không đúng.")
    return {"state": serialize_room_for_player(room, player_id)}


@app.post("/api/live/rooms/{pin}/answer")
async def public_submit_live_answer(
    pin: str,
    req: SubmitLiveAnswerRequest,
) -> dict[str, Any]:
    room = get_room(pin)
    if not room:
        raise HTTPException(status_code=404, detail="Phòng Game không tồn tại.")
    try:
        ans = submit_player_answer(
            room=room,
            player_id=req.player_id,
            player_token=req.player_token,
            choice_index=req.choice_index,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    await broadcast_room_state(room["pin"])
    return {
        "accepted": True,
        "choice_index": ans["choice_index"],
        "elapsed_ms": ans["elapsed_ms"],
        "state": serialize_room_for_player(room, req.player_id),
    }


@app.websocket("/api/live/ws/{pin}")
async def live_game_websocket(
    ws: WebSocket,
    pin: str,
    role: str = Query(default="player"),
    player_id: str | None = Query(default=None),
    auth_token: str | None = Query(default=None),
):
    room = get_room(pin)
    if not room:
        await ws.close(code=4404)
        return

    actual_role = "player"
    if role == "host":
        user = get_user_by_token(auth_token or "") if auth_token else None
        if not user or user["id"] != room.get("host_user_id"):
            await ws.close(code=4403)
            return
        actual_role = "host"

    await register_ws(room["pin"], ws, actual_role, player_id=player_id)
    try:
        # Immediately push initial snapshot
        if actual_role == "host":
            await ws.send_json({"type": "state", "data": serialize_room_for_host(room)})
        else:
            await ws.send_json({"type": "state", "data": serialize_room_for_player(room, player_id)})

        while True:
            msg = await ws.receive_text()
            if msg == "ping":
                cur_room = get_room(pin)
                if cur_room:
                    if actual_role == "host":
                        await ws.send_json({"type": "state", "data": serialize_room_for_host(cur_room)})
                    else:
                        await ws.send_json({"type": "state", "data": serialize_room_for_player(cur_room, player_id)})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        unregister_ws(room["pin"], ws)


FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST / "index.html"))

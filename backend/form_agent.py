"""
Smart AI Agent & Quick Code-to-Form / Quiz Exam Generator for KromaForms.
Supports both Standard Surveys and Auto-Graded Homework / Anti-Cheat Quizzes.
"""

from typing import Any
import json
import re
import urllib.request
import uuid

VALID_TYPES = {
    "short_text",
    "long_text",
    "single_choice",
    "multiple_choice",
    "dropdown",
    "rating",
    "date",
    "email",
}

VALID_THEMES = {"indigo", "emerald", "violet", "rose", "amber", "zinc"}

TYPE_ALIASES: dict[str, str] = {
    "text": "short_text",
    "short": "short_text",
    "short_text": "short_text",
    "input": "short_text",
    "ngan": "short_text",
    "textarea": "long_text",
    "long": "long_text",
    "long_text": "long_text",
    "paragraph": "long_text",
    "doan_van": "long_text",
    "tu_luan": "long_text",
    "radio": "single_choice",
    "single": "single_choice",
    "single_choice": "single_choice",
    "choice": "single_choice",
    "trac_nghiem": "single_choice",
    "checkbox": "multiple_choice",
    "multi": "multiple_choice",
    "multiple": "multiple_choice",
    "multiple_choice": "multiple_choice",
    "hop_kiem": "multiple_choice",
    "select": "dropdown",
    "dropdown": "dropdown",
    "menu": "dropdown",
    "rating": "rating",
    "star": "rating",
    "stars": "rating",
    "sao": "rating",
    "date": "date",
    "ngay": "date",
    "email": "email",
    "mail": "email",
}


def _qid(index: int) -> str:
    return f"q_{index}_{uuid.uuid4().hex[:5]}"


def _normalize_questions(
    raw_questions: list[dict[str, Any]], is_quiz: bool = False
) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    count = max(1, len(raw_questions))
    default_pts = round(10.0 / count, 2) if is_quiz else 0.0

    for idx, q in enumerate(raw_questions, start=1):
        if not isinstance(q, dict):
            continue
        raw_type = str(q.get("type", "short_text")).strip().lower()
        qtype = TYPE_ALIASES.get(
            raw_type, raw_type if raw_type in VALID_TYPES else "short_text"
        )
        title = str(q.get("title") or f"Câu hỏi {idx}").strip()
        if not title:
            continue
        options = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
        if qtype in ("single_choice", "multiple_choice", "dropdown") and len(options) < 2:
            options = ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"]

        max_rating = int(q.get("max_rating") or 5)
        if max_rating not in (5, 10):
            max_rating = 5

        pts_raw = q.get("points")
        points = float(pts_raw) if pts_raw is not None else default_pts

        correct_ans = q.get("correct_answer")
        if is_quiz and qtype == "single_choice" and not correct_ans and options:
            correct_ans = options[0]

        normalized.append(
            {
                "id": str(q.get("id") or _qid(idx)),
                "type": qtype,
                "title": title,
                "description": str(q.get("description") or "").strip(),
                "required": bool(q.get("required", True if is_quiz else idx <= 2)),
                "options": options
                if qtype in ("single_choice", "multiple_choice", "dropdown")
                else [],
                "max_rating": max_rating,
                "points": round(points, 2),
                "correct_answer": correct_ans,
                "explanation": str(q.get("explanation") or "").strip(),
            }
        )
    return normalized


def _detect_quiz_intent(prompt: str, explicit_quiz: bool) -> bool:
    if explicit_quiz:
        return True
    p = prompt.lower()
    quiz_keywords = [
        "bài tập",
        "kiểm tra",
        "đề thi",
        "chấm điểm",
        "học sinh",
        "trắc nghiệm kiến thức",
        "câu hỏi toán",
        "tiếng anh",
        "vật lý",
        "hóa học",
        "lịch sử",
        "địa lý",
        "sinh học",
        "tin học",
        "quiz",
        "test",
    ]
    return any(k in p for k in quiz_keywords)


def _try_llm_agent_generate(
    prompt: str, question_count: int, theme_color: str, is_quiz: bool
) -> dict[str, Any] | None:
    if is_quiz:
        pts_each = round(10.0 / max(1, question_count), 2)
        system_msg = (
            "Bạn là Giáo viên & Chuyên gia ra đề kiểm tra thông minh trên KromaForms. "
            "Trả về DUY NHẤT 1 JSON object hợp lệ (không markdown) theo cấu trúc: "
            '{"title": "...", "description": "...", "thank_you_message": "...", '
            '"questions": [{"type": "single_choice|multiple_choice|short_text", '
            f'"title": "...", "description": "", "required": true, "points": {pts_each}, '
            '"options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"], '
            '"correct_answer": "phải khớp chính xác 100% một chuỗi trong options (hoặc mảng nếu multiple_choice)", '
            '"explanation": "Giải thích ngắn gọn vì sao đúng"}]}. '
            f"Hãy tạo đúng {question_count} câu hỏi bám sát môn học/chủ đề yêu cầu, tổng điểm 10."
        )
    else:
        system_msg = (
            "Bạn là KromaForms AI Agent chuyên thiết kế biểu mẫu khảo sát tiếng Việt chuẩn Google Forms. "
            "Trả về DUY NHẤT 1 JSON object hợp lệ (không markdown) theo cấu trúc: "
            '{"title": "...", "description": "...", "thank_you_message": "...", '
            '"questions": [{"type": "single_choice|multiple_choice|dropdown|rating|short_text|long_text|email|date", '
            '"title": "...", "description": "", "required": true, "options": ["..."], "max_rating": 5}]}. '
            f"Số lượng câu hỏi phải đúng {question_count} câu, sát chủ đề."
        )

    body = json.dumps(
        {
            "model": "openai",
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": f"Yêu cầu: {prompt}"},
            ],
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://text.pollinations.ai/openai",
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "KromaForms-Agent/3.2",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"].strip()
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
        parsed = json.loads(content)
        questions = _normalize_questions(
            (parsed.get("questions") or [])[: max(2, min(20, question_count))],
            is_quiz=is_quiz,
        )
        if len(questions) >= 2:
            return {
                "title": str(parsed.get("title") or prompt[:80]).strip(),
                "description": str(
                    parsed.get("description")
                    or (
                        "Chọn đúng họ tên học sinh và hoàn thành các câu hỏi dưới đây. Không thoát màn hình trong lúc làm bài."
                        if is_quiz
                        else "Vui lòng điền thông tin khảo sát dưới đây."
                    )
                ).strip(),
                "theme_color": theme_color if theme_color in VALID_THEMES else "indigo",
                "thank_you_message": str(
                    parsed.get("thank_you_message")
                    or (
                        "Chúc mừng em đã nộp bài thành công! Điểm số đã được ghi nhận."
                        if is_quiz
                        else "Cảm ơn bạn đã hoàn thành khảo sát!"
                    )
                ).strip(),
                "is_quiz": is_quiz,
                "anti_cheat_enabled": is_quiz,
                "time_limit_minutes": 15 if is_quiz else 0,
                "show_score_immediately": True,
                "questions": questions,
            }
    except Exception:
        return None
    return None


def _local_smart_agent_fallback(
    prompt: str, question_count: int, theme_color: str, is_quiz: bool
) -> dict[str, Any]:
    p_low = prompt.lower().strip()
    target_count = max(2, min(15, question_count))

    if is_quiz:
        pts = round(10.0 / target_count, 2)
        if "tiếng anh" in p_low or "english" in p_low:
            title = "Bài Tập & Kiểm Tra Tiếng Anh (Chấm điểm tự động)"
            pool = [
                {
                    "type": "single_choice",
                    "title": "Choose the correct verb form: My brother _______ football every Sunday.",
                    "options": ["play", "plays", "playing", "played"],
                    "correct_answer": "plays",
                    "explanation": "Chủ ngữ số ít 'My brother' ở thì Hiện tại đơn thêm -s.",
                },
                {
                    "type": "single_choice",
                    "title": "She has lived in Hanoi _______ 2020.",
                    "options": ["for", "since", "in", "ago"],
                    "correct_answer": "since",
                    "explanation": "'since' + mốc thời gian (2020) dùng trong thì Hiện tại hoàn thành.",
                },
                {
                    "type": "single_choice",
                    "title": "Which word has the CLOSEST meaning to 'important'?",
                    "options": ["essential", "optional", "tiny", "careless"],
                    "correct_answer": "essential",
                    "explanation": "'essential' = thiết yếu, quan trọng.",
                },
                {
                    "type": "short_text",
                    "title": "Write the past participle (V3) of the verb 'write':",
                    "options": [],
                    "correct_answer": "written",
                    "explanation": "write -> wrote -> written.",
                },
                {
                    "type": "single_choice",
                    "title": "If we study hard, we _______ pass the final exam.",
                    "options": ["will", "would", "had", "were"],
                    "correct_answer": "will",
                    "explanation": "Câu điều kiện loại 1 diễn tả khả năng có thật ở tương lai.",
                },
                {
                    "type": "multiple_choice",
                    "title": "Select ALL countable nouns below:",
                    "options": ["apple", "student", "water", "information"],
                    "correct_answer": ["apple", "student"],
                    "explanation": "'apple' và 'student' là danh từ đếm được.",
                },
            ]
        elif "toán" in p_low:
            title = "Bài Kiểm Tra Trắc Nghiệm Môn Toán"
            pool = [
                {
                    "type": "single_choice",
                    "title": "Nghiệm của phương trình 2x - 8 = 0 là:",
                    "options": ["x = 2", "x = 4", "x = -4", "x = 8"],
                    "correct_answer": "x = 4",
                    "explanation": "2x = 8 => x = 4.",
                },
                {
                    "type": "single_choice",
                    "title": "Diện tích hình chữ nhật có chiều dài 8cm và chiều rộng 5cm bằng:",
                    "options": ["13 cm²", "26 cm²", "40 cm²", "45 cm²"],
                    "correct_answer": "40 cm²",
                    "explanation": "S = dài × rộng = 8 × 5 = 40 cm².",
                },
                {
                    "type": "short_text",
                    "title": "Tính giá trị biểu thức: 15 × 4 + 20 = ?",
                    "options": [],
                    "correct_answer": "80",
                    "explanation": "15 × 4 = 60; 60 + 20 = 80.",
                },
                {
                    "type": "single_choice",
                    "title": "Tổng ba góc trong một tam giác phẳng luôn bằng:",
                    "options": ["90°", "180°", "270°", "360°"],
                    "correct_answer": "180°",
                    "explanation": "Định lý tổng 3 góc trong tam giác bằng 180 độ.",
                },
                {
                    "type": "multiple_choice",
                    "title": "Những số nào dưới đây là SỐ NGUYÊN TỐ?",
                    "options": ["2", "7", "9", "15"],
                    "correct_answer": ["2", "7"],
                    "explanation": "2 và 7 chỉ chia hết cho 1 và chính nó.",
                },
            ]
        else:
            clean_t = prompt.strip() or "Kiến thức Tổng hợp"
            title = f"Bài Tập Kiểm Tra: {clean_t[:80]}"
            pool = [
                {
                    "type": "single_choice",
                    "title": "Câu hỏi trắc nghiệm 1: Đâu là phương án chính xác nhất?",
                    "options": ["Phương án A (Đúng)", "Phương án B", "Phương án C", "Phương án D"],
                    "correct_answer": "Phương án A (Đúng)",
                    "explanation": "Giáo viên có thể chỉnh lại nội dung câu hỏi và đáp án tùy ý.",
                },
                {
                    "type": "single_choice",
                    "title": "Câu hỏi trắc nghiệm 2: Chọn phát biểu đúng trong các lựa chọn sau:",
                    "options": ["Phát biểu 1", "Phát biểu 2 (Đúng)", "Phát biểu 3", "Phát biểu 4"],
                    "correct_answer": "Phát biểu 2 (Đúng)",
                    "explanation": "",
                },
                {
                    "type": "multiple_choice",
                    "title": "Câu hỏi hộp kiểm 3: Chọn TẤT CẢ các ý đúng dưới đây:",
                    "options": ["Ý đúng thứ nhất", "Ý đúng thứ hai", "Ý gây nhiễu 1", "Ý gây nhiễu 2"],
                    "correct_answer": ["Ý đúng thứ nhất", "Ý đúng thứ hai"],
                    "explanation": "",
                },
                {
                    "type": "short_text",
                    "title": "Câu hỏi trả lời ngắn 4: Điền từ khóa / kết quả chính xác:",
                    "options": [],
                    "correct_answer": "Đáp án mẫu",
                    "explanation": "",
                },
                {
                    "type": "long_text",
                    "title": "Câu hỏi tự luận 5 (Giáo viên chấm điểm riêng trên Bảng điểm):",
                    "options": [],
                    "correct_answer": None,
                    "explanation": "",
                },
            ]

        selected = []
        for i in range(target_count):
            base_q = dict(pool[i % len(pool)])
            base_q["points"] = pts
            base_q["required"] = True
            selected.append(base_q)

        return {
            "title": title,
            "description": "Học sinh điền đúng Họ tên & Lớp trước khi bắt đầu. Hệ thống giám sát chống thoát màn hình và tự động chấm điểm.",
            "theme_color": theme_color if theme_color in VALID_THEMES else "indigo",
            "thank_you_message": "Em đã hoàn thành và nộp bài thành công!",
            "is_quiz": True,
            "anti_cheat_enabled": True,
            "time_limit_minutes": 15,
            "show_score_immediately": True,
            "questions": _normalize_questions(selected, is_quiz=True),
        }

    # Standard Survey Fallback
    clean_topic = prompt.strip() or "Khảo sát Tổng hợp"
    survey_pool = [
        {"type": "rating", "title": f"Đánh giá tổng quan của bạn về {clean_topic[:60]}", "required": True, "max_rating": 5},
        {
            "type": "single_choice",
            "title": "Mức độ hài lòng hiện tại của bạn?",
            "required": True,
            "options": ["Rất hài lòng", "Hài lòng", "Bình thường", "Cần cải thiện"],
        },
        {
            "type": "multiple_choice",
            "title": "Yếu tố nào bạn đánh giá cao nhất?",
            "required": False,
            "options": ["Chất lượng nội dung", "Giao diện trực quan", "Tốc độ nhanh chóng", "Hỗ trợ nhiệt tình"],
        },
        {"type": "short_text", "title": "Điểm bạn ấn tượng nhất là gì?", "required": False},
        {"type": "long_text", "title": "Ý kiến đóng góp thêm của bạn", "required": False},
    ]
    selected_survey = [dict(survey_pool[i % len(survey_pool)]) for i in range(target_count)]
    return {
        "title": clean_topic[:140],
        "description": "Rất mong nhận được ý kiến phản hồi của bạn qua biểu mẫu dưới đây.",
        "theme_color": theme_color if theme_color in VALID_THEMES else "indigo",
        "thank_you_message": "Cảm ơn bạn đã hoàn thành khảo sát!",
        "is_quiz": False,
        "anti_cheat_enabled": False,
        "time_limit_minutes": 0,
        "show_score_immediately": True,
        "questions": _normalize_questions(selected_survey, is_quiz=False),
    }


def generate_form_from_prompt(
    prompt: str,
    question_count: int = 6,
    theme_color: str = "indigo",
    is_quiz: bool = False,
) -> dict[str, Any]:
    clean_prompt = prompt.strip() or "Bài kiểm tra trắc nghiệm nhanh"
    quiz_mode = _detect_quiz_intent(clean_prompt, is_quiz)
    llm_res = _try_llm_agent_generate(clean_prompt, question_count, theme_color, quiz_mode)
    if llm_res:
        llm_res["generator_engine"] = "ai_llm_agent"
        return llm_res
    fallback = _local_smart_agent_fallback(clean_prompt, question_count, theme_color, quiz_mode)
    fallback["generator_engine"] = "smart_nlp_agent"
    return fallback


def parse_quick_code_to_form(
    raw_code: str, default_theme: str = "indigo", force_quiz: bool = False
) -> dict[str, Any]:
    """
    Supports JSON, Quick Survey DSL, and Homework/Exam Quiz DSL:
      # Bài Kiểm Tra 15 Phút Toán 10
      @quiz: on
      @time: 15
      @anticheat: on
      @roster: Nguyễn Văn An, Trần Thị Bình, Lê Hoàng Nam
      Thủ đô Việt Nam là gì? * | radio: *Hà Nội, TP.HCM, Đà Nẵng | 2.5đ
      Chọn các số chẵn * | checkbox: *2, 3, *4, 5 | 2.5đ
      Kết quả 12 x 5 bằng bao nhiêu? * | text: 60 | 5đ
    """
    text = raw_code.strip()
    if not text:
        raise ValueError("Vui lòng nhập nội dung Code hoặc danh sách câu hỏi.")

    if text.startswith("{") or text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                has_ans = any("correct_answer" in x or "points" in x for x in parsed if isinstance(x, dict))
                quiz_flag = force_quiz or has_ans
                return {
                    "title": "Biểu mẫu nhập từ JSON Code",
                    "description": "",
                    "theme_color": default_theme,
                    "is_quiz": quiz_flag,
                    "anti_cheat_enabled": quiz_flag,
                    "time_limit_minutes": 15 if quiz_flag else 0,
                    "questions": _normalize_questions(parsed, is_quiz=quiz_flag),
                }
            if isinstance(parsed, dict):
                q_raw = parsed.get("questions") or []
                quiz_flag = bool(parsed.get("is_quiz", force_quiz)) or any(
                    "correct_answer" in x for x in q_raw if isinstance(x, dict)
                )
                questions = _normalize_questions(q_raw, is_quiz=quiz_flag)
                if not questions:
                    raise ValueError("JSON chưa có mảng 'questions' hợp lệ.")
                return {
                    "title": str(parsed.get("title") or "Biểu mẫu nhập từ JSON").strip(),
                    "description": str(parsed.get("description") or "").strip(),
                    "theme_color": str(parsed.get("theme_color") or default_theme),
                    "thank_you_message": str(
                        parsed.get("thank_you_message") or "Cảm ơn bạn đã hoàn thành!"
                    ),
                    "is_quiz": quiz_flag,
                    "anti_cheat_enabled": bool(parsed.get("anti_cheat_enabled", quiz_flag)),
                    "time_limit_minutes": int(parsed.get("time_limit_minutes") or (15 if quiz_flag else 0)),
                    "student_roster": parsed.get("student_roster") or [],
                    "questions": questions,
                }
        except json.JSONDecodeError as exc:
            raise ValueError(f"Cú pháp JSON không hợp lệ: {exc}") from exc

    title = "Biểu mẫu tạo nhanh từ Code"
    description_lines: list[str] = []
    theme = default_theme if default_theme in VALID_THEMES else "indigo"
    thank_you = "Cảm ơn bạn đã hoàn thành!"
    is_quiz = force_quiz
    anti_cheat = force_quiz
    time_limit = 15 if force_quiz else 0
    roster: list[str] = []
    raw_questions: list[dict[str, Any]] = []
    current_q: dict[str, Any] | None = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            title = line.lstrip("#").strip() or title
            continue
        if line.startswith(">"):
            description_lines.append(line.lstrip(">").strip())
            continue
        if line.lower().startswith("@theme:"):
            v = line.split(":", 1)[1].strip().lower()
            if v in VALID_THEMES:
                theme = v
            continue
        if line.lower().startswith("@quiz:"):
            v = line.split(":", 1)[1].strip().lower()
            is_quiz = v in ("on", "true", "1", "yes", "co")
            if is_quiz and time_limit == 0:
                time_limit = 15
            continue
        if line.lower().startswith("@anticheat:"):
            v = line.split(":", 1)[1].strip().lower()
            anti_cheat = v in ("on", "true", "1", "yes", "co")
            continue
        if line.lower().startswith("@time:"):
            nums = re.findall(r"\d+", line.split(":", 1)[1])
            if nums:
                time_limit = int(nums[0])
            continue
        if line.lower().startswith("@roster:"):
            r_part = line.split(":", 1)[1]
            roster.extend([s.strip() for s in re.split(r"[,;]", r_part) if s.strip()])
            continue
        if line.lower().startswith("@thanks:"):
            thank_you = line.split(":", 1)[1].strip() or thank_you
            continue

        # Multi-line option under a question: "- Opt" or "* Opt (correct)" or "A. Opt" or "*A. Opt"
        opt_match = re.match(r"^(\*)?(?:[-•+]|\(?[A-Ha-h][.)])\s+(.+)$", line)
        if opt_match and current_q is not None and "|" not in line:
            is_marked_correct = bool(opt_match.group(1)) or line.startswith("* ")
            opt_text = opt_match.group(2).strip()
            if opt_text.startswith("*"):
                is_marked_correct = True
                opt_text = opt_text.lstrip("*").strip()
            current_q.setdefault("options", []).append(opt_text)
            if current_q["type"] == "short_text":
                current_q["type"] = "single_choice"
            if is_marked_correct:
                is_quiz = True
                prev_corr = current_q.get("correct_answer")
                if prev_corr:
                    current_q["type"] = "multiple_choice"
                    current_q["correct_answer"] = (
                        prev_corr + [opt_text]
                        if isinstance(prev_corr, list)
                        else [prev_corr, opt_text]
                    )
                else:
                    current_q["correct_answer"] = opt_text
            continue

        # Also support "* Đáp án đúng" line directly under a question
        star_opt = re.match(r"^\*\s+(.+)$", line)
        if star_opt and current_q is not None and "|" not in line:
            opt_text = star_opt.group(1).strip()
            current_q.setdefault("options", []).append(opt_text)
            if current_q["type"] == "short_text":
                current_q["type"] = "single_choice"
            is_quiz = True
            prev_corr = current_q.get("correct_answer")
            if prev_corr:
                current_q["type"] = "multiple_choice"
                current_q["correct_answer"] = (
                    prev_corr + [opt_text]
                    if isinstance(prev_corr, list)
                    else [prev_corr, opt_text]
                )
            else:
                current_q["correct_answer"] = opt_text
            continue

        clean_line = re.sub(r"^(?:câu\s*\d+[:.)]|\d+[:.)])\s*", "", line, flags=re.IGNORECASE)
        if "|" in clean_line:
            segments = [p.strip() for p in clean_line.split("|")]
            left = segments[0]
            middle = segments[1] if len(segments) >= 2 else "text"
            pts_val: float | None = None

            if len(segments) >= 3:
                pts_match = re.search(r"(\d+(?:\.\d+)?)", segments[2])
                if pts_match:
                    pts_val = float(pts_match.group(1))
                    is_quiz = True

            required = left.endswith("*")
            q_title = left.rstrip("*").strip()

            type_part = middle
            opts_part = ""
            if ":" in middle:
                type_part, opts_part = [p.strip() for p in middle.split(":", 1)]

            q_type = TYPE_ALIASES.get(type_part.lower().strip(), "short_text")
            options: list[str] = []
            correct_answer: Any = None
            max_rating = 5

            if q_type == "rating" and opts_part.isdigit():
                max_rating = 10 if int(opts_part) == 10 else 5
            elif q_type == "short_text" and opts_part:
                # "Kết quả 5 + 5 | text: 10 | 2đ"
                correct_answer = opts_part.strip()
                is_quiz = True
            elif opts_part:
                sep = ";" if ";" in opts_part and "," not in opts_part else ","
                raw_opts = [o.strip() for o in opts_part.split(sep) if o.strip()]
                correct_list: list[str] = []
                for ro in raw_opts:
                    if ro.startswith("*"):
                        clean_o = ro.lstrip("*").strip()
                        options.append(clean_o)
                        correct_list.append(clean_o)
                        is_quiz = True
                    else:
                        options.append(ro)
                if correct_list:
                    correct_answer = (
                        correct_list if q_type == "multiple_choice" else correct_list[0]
                    )

            current_q = {
                "type": q_type,
                "title": q_title,
                "required": required,
                "options": options,
                "max_rating": max_rating,
                "correct_answer": correct_answer,
            }
            if pts_val is not None:
                current_q["points"] = pts_val
            raw_questions.append(current_q)
        else:
            # Check trailing "(2đ)" or "(2.5 điểm)"
            pts_inline: float | None = None
            m_pts = re.search(r"\((\d+(?:\.\d+)?)\s*(?:đ|điểm|pts)\)\s*\*?$", clean_line, flags=re.IGNORECASE)
            if m_pts:
                pts_inline = float(m_pts.group(1))
                clean_line = clean_line[: m_pts.start()].strip()
                is_quiz = True

            required = clean_line.endswith("*")
            q_title = clean_line.rstrip("*").strip()
            low_q = q_title.lower()
            inferred_type = "short_text"
            if "email" in low_q:
                inferred_type = "email"
            elif any(w in low_q for w in ["mấy sao", "mức độ hài lòng"]):
                inferred_type = "rating"
            elif any(w in low_q for w in ["góp ý", "tự luận", "trình bày"]):
                inferred_type = "long_text"

            current_q = {
                "type": inferred_type,
                "title": q_title,
                "required": required,
                "options": [],
                "max_rating": 5,
            }
            if pts_inline is not None:
                current_q["points"] = pts_inline
            raw_questions.append(current_q)

    normalized = _normalize_questions(raw_questions, is_quiz=is_quiz)
    if not normalized:
        raise ValueError("Không nhận diện được câu hỏi nào từ đoạn Code bạn nhập.")

    return {
        "title": title,
        "description": "\n".join(description_lines),
        "theme_color": theme,
        "thank_you_message": thank_you,
        "is_quiz": is_quiz,
        "anti_cheat_enabled": anti_cheat or is_quiz,
        "time_limit_minutes": time_limit,
        "student_roster": roster,
        "questions": normalized,
    }

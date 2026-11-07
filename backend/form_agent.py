"""
Smart AI Agent & Quick Code-to-Form Generator for KromaForms.
Supports:
1) Natural-language Vietnamese/English Prompt -> Complete Structured Survey (LLM + Domain-Aware NLP Fallback)
2) Quick Form Code DSL / Copy-Pasted Numbered Questions / JSON -> Complete Structured Survey
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


def _normalize_questions(raw_questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for idx, q in enumerate(raw_questions, start=1):
        if not isinstance(q, dict):
            continue
        raw_type = str(q.get("type", "short_text")).strip().lower()
        qtype = TYPE_ALIASES.get(raw_type, raw_type if raw_type in VALID_TYPES else "short_text")
        title = str(q.get("title") or f"Câu hỏi {idx}").strip()
        if not title:
            continue
        options = [str(o).strip() for o in (q.get("options") or []) if str(o).strip()]
        if qtype in ("single_choice", "multiple_choice", "dropdown") and len(options) < 2:
            options = ["Rất tốt", "Tốt", "Bình thường", "Cần cải thiện"]
        max_rating = int(q.get("max_rating") or 5)
        if max_rating not in (5, 10):
            max_rating = 5
        normalized.append(
            {
                "id": str(q.get("id") or _qid(idx)),
                "type": qtype,
                "title": title,
                "description": str(q.get("description") or "").strip(),
                "required": bool(q.get("required", idx <= 2)),
                "options": options if qtype in ("single_choice", "multiple_choice", "dropdown") else [],
                "max_rating": max_rating,
            }
        )
    return normalized


def _try_llm_agent_generate(
    prompt: str, question_count: int, theme_color: str
) -> dict[str, Any] | None:
    """Try free OpenAI-compatible JSON generation endpoint with short timeout."""
    system_msg = (
        "Bạn là KromaForms AI Agent chuyên thiết kế biểu mẫu khảo sát tiếng Việt chuẩn Google Forms. "
        "Trả về DUY NHẤT 1 JSON object hợp lệ (không markdown) theo cấu trúc: "
        '{"title": "...", "description": "...", "thank_you_message": "...", '
        '"questions": [{"type": "single_choice|multiple_choice|dropdown|rating|short_text|long_text|email|date", '
        '"title": "...", "description": "", "required": true, "options": ["..."], "max_rating": 5}]}. '
        f"Số lượng câu hỏi phải đúng khoảng {question_count} câu, sát chủ đề, tự nhiên, chuyên nghiệp."
    )
    body = json.dumps(
        {
            "model": "openai",
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": f"Chủ đề / Yêu cầu tạo form: {prompt}"},
            ],
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://text.pollinations.ai/openai",
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "KromaForms-Agent/3.1",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=7.5) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        content = payload["choices"][0]["message"]["content"].strip()
        # Strip optional ```json fences if present
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
        parsed = json.loads(content)
        questions = _normalize_questions(parsed.get("questions") or [])
        if len(questions) >= 2:
            return {
                "title": str(parsed.get("title") or prompt[:80]).strip(),
                "description": str(
                    parsed.get("description")
                    or "Vui lòng điền thông tin khảo sát dưới đây. Mọi phản hồi của bạn đều rất quý giá!"
                ).strip(),
                "theme_color": theme_color if theme_color in VALID_THEMES else "indigo",
                "thank_you_message": str(
                    parsed.get("thank_you_message")
                    or "Cảm ơn bạn đã hoàn thành khảo sát! Phản hồi của bạn đã được ghi nhận."
                ).strip(),
                "questions": questions[: max(2, min(20, question_count))],
            }
    except Exception:
        return None
    return None


def _local_smart_agent_fallback(
    prompt: str, question_count: int, theme_color: str
) -> dict[str, Any]:
    """Deterministic Vietnamese domain-aware survey generator (0ms latency, 100% reliable)."""
    p_low = prompt.lower().strip()
    clean_topic = re.sub(
        r"^(tạo\s+|làm\s+|thiết kế\s+)?(form\s+|biểu mẫu\s+|khảo sát\s+)?",
        "",
        prompt.strip(),
        flags=re.IGNORECASE,
    ).strip()
    title_topic = clean_topic[:1].upper() + clean_topic[1:] if clean_topic else "Khảo sát Tổng hợp"

    # Detect domain
    if any(k in p_low for k in ["tuyển dụng", "ứng viên", "cv", "việc làm", "nhân sự", "intern", "thực tập"]):
        title = f"Đăng ký Ứng tuyển — {title_topic}"
        desc = "Vui lòng điền đầy đủ thông tin ứng tuyển bên dưới. Bộ phận Nhân sự (HR) sẽ liên hệ với bạn sớm nhất."
        pool = [
            {"type": "short_text", "title": "Họ và tên đầy đủ của bạn", "required": True},
            {"type": "email", "title": "Địa chỉ Email liên hệ", "required": True},
            {"type": "short_text", "title": "Số điện thoại / Zalo", "required": True},
            {
                "type": "dropdown",
                "title": "Vị trí bạn muốn ứng tuyển",
                "required": True,
                "options": ["Full-time Chính thức", "Part-time / Cộng tác viên", "Thực tập sinh (Intern)", "Remote / Freelance"],
            },
            {
                "type": "single_choice",
                "title": "Kinh nghiệm làm việc thực tế của bạn",
                "required": True,
                "options": ["Chưa có kinh nghiệm / Mới ra trường", "Từ 6 tháng – 1 năm", "Từ 1 – 3 năm", "Trên 3 năm kinh nghiệm"],
            },
            {
                "type": "multiple_choice",
                "title": "Kỹ năng thế mạnh nổi bật của bạn",
                "required": False,
                "options": ["Giao tiếp & Làm việc nhóm", "Tư duy giải quyết vấn đề", "Ngoại ngữ (Tiếng Anh / Trung)", "Sử dụng công cụ AI & Phần mềm chuyên môn"],
            },
            {"type": "date", "title": "Ngày bạn có thể bắt đầu nhận việc", "required": False},
            {"type": "short_text", "title": "Link CV / Portfolio / GitHub / LinkedIn của bạn", "required": True},
            {"type": "long_text", "title": "Giới thiệu ngắn gọn mục tiêu nghề nghiệp của bạn", "required": False},
        ]
    elif any(k in p_low for k in ["sự kiện", "workshop", "hội thảo", "đăng ký tham", "giải đấu", "offline", "clb", "vé"]):
        title = f"Đăng ký Tham gia: {title_topic}"
        desc = "Điền thông tin xác nhận tham dự chương trình để Ban Tổ Chức chuẩn bị chu đáo nhất."
        pool = [
            {"type": "short_text", "title": "Họ và tên người tham dự", "required": True},
            {"type": "email", "title": "Email nhận vé / thông báo từ BTC", "required": True},
            {"type": "short_text", "title": "Số điện thoại liên hệ khẩn cấp", "required": True},
            {
                "type": "single_choice",
                "title": "Hình thức / Khung giờ bạn tham gia",
                "required": True,
                "options": ["Tham gia trực tiếp toàn thời gian", "Chỉ tham gia buổi sáng", "Chỉ tham gia buổi chiều", "Theo dõi trực tuyến"],
            },
            {
                "type": "multiple_choice",
                "title": "Nội dung bạn mong chờ nhất trong chương trình",
                "required": False,
                "options": ["Chia sẻ kiến thức thực chiến", "Giao lưu kết nối (Networking)", "Hỏi đáp trực tiếp cùng chuyên gia", "Quà tặng & Tài liệu độc quyền"],
            },
            {
                "type": "dropdown",
                "title": "Bạn biết đến chương trình qua kênh nào?",
                "required": False,
                "options": ["Facebook / Fanpage", "Bạn bè giới thiệu", "Email / Website", "Nhóm cộng đồng Zalo / Discord"],
            },
            {"type": "rating", "title": "Mức độ hào hứng của bạn với chủ đề lần này", "required": False, "max_rating": 5},
            {"type": "long_text", "title": "Câu hỏi hoặc lưu ý đặc biệt gửi tới Ban Tổ Chức", "required": False},
        ]
    elif any(k in p_low for k in ["môn học", "khóa học", "giảng viên", "lớp học", "sinh viên", "đào tạo", "trường"]):
        title = f"Khảo sát Đánh giá: {title_topic}"
        desc = "Ý kiến phản hồi của học viên/sinh viên giúp nâng cao chất lượng giảng dạy và tài liệu học tập."
        pool = [
            {"type": "rating", "title": "Đánh giá tổng thể chất lượng nội dung học tập", "required": True, "max_rating": 5},
            {
                "type": "single_choice",
                "title": "Phương pháp truyền đạt và hỗ trợ của Giảng viên",
                "required": True,
                "options": ["Rất dễ hiểu, nhiệt tình", "Khá rõ ràng, đầy đủ", "Bình thường", "Cần thêm ví dụ thực hành"],
            },
            {
                "type": "single_choice",
                "title": "Thời lượng và tốc độ bài giảng hiện tại",
                "required": True,
                "options": ["Vừa sức, hợp lý", "Hơi nhanh", "Hơi chậm", "Quá tải kiến thức"],
            },
            {
                "type": "multiple_choice",
                "title": "Phần học liệu nào hữu ích nhất với bạn?",
                "required": False,
                "options": ["Slide & Video bài giảng", "Bài tập thực hành dự án", "Buổi chữa bài trực tiếp", "Tài liệu tham khảo mở rộng"],
            },
            {"type": "short_text", "title": "Chủ đề bạn tâm đắc nhất sau khóa học", "required": False},
            {"type": "long_text", "title": "Đề xuất cải thiện cho khóa học / học kỳ tiếp theo", "required": False},
        ]
    elif any(k in p_low for k in ["đặt hàng", "mua", "sản phẩm", "size", "áo", "đồ uống", "quán", "cà phê", "trà sữa", "nhà hàng"]):
        title = f"Khảo sát & Phản hồi: {title_topic}"
        desc = "Cảm ơn bạn đã ủng hộ! Hãy dành 1 phút chia sẻ cảm nhận để chúng tôi phục vụ bạn tốt hơn."
        pool = [
            {"type": "rating", "title": "Mức độ hài lòng chung của bạn về sản phẩm / đồ uống", "required": True, "max_rating": 5},
            {
                "type": "single_choice",
                "title": "Đánh giá thái độ phục vụ và tốc độ lên đơn",
                "required": True,
                "options": ["Rất nhanh & thân thiện", "Tốt, đúng hẹn", "Chờ hơi lâu giờ cao điểm", "Cần cải thiện thái độ phục vụ"],
            },
            {
                "type": "single_choice",
                "title": "Mức giá hiện tại so với chất lượng theo bạn là:",
                "required": True,
                "options": ["Rất hợp lý, đáng tiền", "Phù hợp mặt bằng chung", "Hơi cao một chút", "Cần thêm combo ưu đãi"],
            },
            {
                "type": "multiple_choice",
                "title": "Yếu tố nào khiến bạn yêu thích nhất?",
                "required": False,
                "options": ["Hương vị / Chất lượng sản phẩm", "Không gian sạch đẹp, thoáng mát", "Nhân viên nhiệt tình", "Bao bì chỉn chu & Khuyến mãi"],
            },
            {
                "type": "single_choice",
                "title": "Bạn có sẵn sàng giới thiệu cho bạn bè / người thân không?",
                "required": True,
                "options": ["Chắc chắn sẽ giới thiệu", "Có thể", "Cân nhắc thêm", "Chưa có ý định"],
            },
            {"type": "long_text", "title": "Góp ý thêm để chúng tôi hoàn thiện hơn mỗi ngày", "required": False},
        ]
    else:
        title = title_topic if len(title_topic) > 6 else f"Biểu mẫu Khảo sát: {title_topic}"
        desc = "Rất mong nhận được ý kiến đóng góp chân thực của bạn qua các câu hỏi ngắn dưới đây."
        pool = [
            {"type": "rating", "title": f"Mức độ đánh giá tổng quan của bạn về {title_topic}", "required": True, "max_rating": 5},
            {
                "type": "single_choice",
                "title": "Trải nghiệm hiện tại của bạn đạt mức nào?",
                "required": True,
                "options": ["Rất hài lòng", "Hài lòng", "Bình thường", "Chưa hài lòng"],
            },
            {
                "type": "multiple_choice",
                "title": "Những điểm nào bạn đánh giá cao nhất?",
                "required": False,
                "options": ["Chất lượng chuyên môn", "Sự tiện lợi & Nhanh chóng", "Chi phí hợp lý", "Hỗ trợ tận tâm"],
            },
            {
                "type": "dropdown",
                "title": "Tần suất bạn sử dụng / quan tâm đến lĩnh vực này",
                "required": False,
                "options": ["Hàng ngày", "Hàng tuần", "Thỉnh thoảng mỗi tháng", "Lần đầu trải nghiệm"],
            },
            {"type": "short_text", "title": "Điểm nổi bật nhất bạn ấn tượng là gì?", "required": False},
            {"type": "long_text", "title": "Ý kiến đóng góp hoặc đề xuất cải tiến chi tiết", "required": False},
            {"type": "email", "title": "Email của bạn (nếu muốn nhận kết quả / phản hồi)", "required": False},
            {"type": "date", "title": "Ngày thực hiện trải nghiệm", "required": False},
        ]

    target_count = max(2, min(15, question_count))
    selected = pool[:target_count]
    while len(selected) < target_count:
        extra_idx = len(selected) + 1
        selected.append(
            {
                "type": "short_text",
                "title": f"Câu hỏi bổ sung #{extra_idx} về {title_topic}",
                "required": False,
            }
        )

    return {
        "title": title[:180],
        "description": desc,
        "theme_color": theme_color if theme_color in VALID_THEMES else "indigo",
        "thank_you_message": "Cảm ơn bạn rất nhiều! Câu trả lời của bạn đã được hệ thống ghi nhận thành công.",
        "questions": _normalize_questions(selected),
    }


def generate_form_from_prompt(
    prompt: str, question_count: int = 6, theme_color: str = "indigo"
) -> dict[str, Any]:
    clean_prompt = prompt.strip()
    if not clean_prompt:
        clean_prompt = "Khảo sát mức độ hài lòng khách hàng"
    llm_result = _try_llm_agent_generate(clean_prompt, question_count, theme_color)
    if llm_result:
        llm_result["generator_engine"] = "ai_llm_agent"
        return llm_result
    fallback = _local_smart_agent_fallback(clean_prompt, question_count, theme_color)
    fallback["generator_engine"] = "smart_nlp_agent"
    return fallback


def parse_quick_code_to_form(
    raw_code: str, default_theme: str = "indigo"
) -> dict[str, Any]:
    """
    Parse either:
    1) JSON object/array
    2) KromaForms Quick DSL:
       # Tiêu đề Form
       > Mô tả ngắn
       @theme: emerald
       Câu hỏi 1 * | radio: Đáp án A, Đáp án B, Đáp án C
       Câu hỏi 2 | rating: 5
       Câu hỏi 3 | textarea
    3) Plain numbered lines with '-' or 'A.' options underneath!
    """
    text = raw_code.strip()
    if not text:
        raise ValueError("Vui lòng nhập nội dung Code hoặc danh sách câu hỏi.")

    # 1. JSON mode
    if text.startswith("{") or text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                questions = _normalize_questions(parsed)
                return {
                    "title": "Biểu mẫu nhập từ JSON Code",
                    "description": "",
                    "theme_color": default_theme,
                    "thank_you_message": "Cảm ơn bạn đã hoàn thành khảo sát!",
                    "questions": questions,
                }
            if isinstance(parsed, dict):
                questions = _normalize_questions(parsed.get("questions") or [])
                if not questions:
                    raise ValueError("JSON chưa có mảng 'questions' hợp lệ.")
                return {
                    "title": str(parsed.get("title") or "Biểu mẫu nhập từ JSON").strip(),
                    "description": str(parsed.get("description") or "").strip(),
                    "theme_color": str(parsed.get("theme_color") or default_theme),
                    "thank_you_message": str(
                        parsed.get("thank_you_message")
                        or "Cảm ơn bạn đã dành thời gian hoàn thành khảo sát!"
                    ),
                    "questions": questions,
                }
        except json.JSONDecodeError as exc:
            raise ValueError(f"Cú pháp JSON không hợp lệ: {exc}") from exc

    # 2. Quick DSL / Plain Text mode
    title = "Biểu mẫu tạo nhanh từ Code"
    description_lines: list[str] = []
    theme = default_theme if default_theme in VALID_THEMES else "indigo"
    thank_you = "Cảm ơn bạn đã dành thời gian hoàn thành khảo sát!"
    raw_questions: list[dict[str, Any]] = []

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    current_q: dict[str, Any] | None = None

    for line in lines:
        if line.startswith("#"):
            title = line.lstrip("#").strip() or title
            continue
        if line.startswith(">"):
            description_lines.append(line.lstrip(">").strip())
            continue
        if line.lower().startswith("@theme:"):
            val = line.split(":", 1)[1].strip().lower()
            if val in VALID_THEMES:
                theme = val
            continue
        if line.lower().startswith("@thanks:"):
            thank_you = line.split(":", 1)[1].strip() or thank_you
            continue

        # Option line under current question: "- Opt" or "* Opt" or "A. Opt" / "a) Opt"
        opt_match = re.match(r"^(?:[-•+]|\(?[A-Ha-h][.)])\s+(.+)$", line)
        if opt_match and current_q is not None and "|" not in line:
            opt_val = opt_match.group(1).strip()
            current_q.setdefault("options", []).append(opt_val)
            if current_q["type"] == "short_text":
                current_q["type"] = "single_choice"
            continue

        # Pipe DSL: "1. Câu hỏi của bạn * | radio: Lựa chọn 1, Lựa chọn 2"
        clean_line = re.sub(r"^(?:câu\s*\d+[:.)]|\d+[:.)])\s*", "", line, flags=re.IGNORECASE)
        if "|" in clean_line:
            left, right = [p.strip() for p in clean_line.split("|", 1)]
            required = left.endswith("*")
            q_title = left.rstrip("*").strip()

            type_part = right
            opts_part = ""
            if ":" in right:
                type_part, opts_part = [p.strip() for p in right.split(":", 1)]

            raw_t = type_part.lower().strip()
            q_type = TYPE_ALIASES.get(raw_t, "short_text")
            options: list[str] = []
            max_rating = 5

            if q_type == "rating" and opts_part.isdigit():
                max_rating = 10 if int(opts_part) == 10 else 5
            elif opts_part:
                sep = ";" if ";" in opts_part and "," not in opts_part else ","
                options = [o.strip() for o in opts_part.split(sep) if o.strip()]

            current_q = {
                "type": q_type,
                "title": q_title,
                "required": required,
                "options": options,
                "max_rating": max_rating,
            }
            raw_questions.append(current_q)
        else:
            # Smart auto-inference from plain question line
            required = clean_line.endswith("*")
            q_title = clean_line.rstrip("*").strip()
            low_q = q_title.lower()
            inferred_type = "short_text"
            if "email" in low_q or "e-mail" in low_q:
                inferred_type = "email"
            elif any(w in low_q for w in ["ngày sinh", "ngày tham", "thời gian ngày", "chọn ngày"]):
                inferred_type = "date"
            elif any(w in low_q for w in ["mấy sao", "chấm điểm", "thang điểm", "mức độ hài lòng"]):
                inferred_type = "rating"
            elif any(w in low_q for w in ["góp ý", "ý kiến", "mô tả chi tiết", "chia sẻ thêm", "nhận xét"]):
                inferred_type = "long_text"

            current_q = {
                "type": inferred_type,
                "title": q_title,
                "required": required,
                "options": [],
                "max_rating": 5,
            }
            raw_questions.append(current_q)

    normalized = _normalize_questions(raw_questions)
    if not normalized:
        raise ValueError("Không nhận diện được câu hỏi nào từ đoạn Code bạn nhập.")

    return {
        "title": title,
        "description": "\n".join(description_lines),
        "theme_color": theme,
        "thank_you_message": thank_you,
        "questions": normalized,
    }

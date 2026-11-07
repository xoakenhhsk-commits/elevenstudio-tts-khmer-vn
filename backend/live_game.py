from __future__ import annotations

import asyncio
import random
import time
import uuid
from typing import Any

from fastapi import WebSocket

PLAYER_AVATARS: list[dict[str, str]] = [
    {"id": "fox", "emoji": "🦊", "label": "Cáo Lửa", "bg": "from-orange-400 to-rose-500"},
    {"id": "panda", "emoji": "🐼", "label": "Gấu Trúc", "bg": "from-slate-500 to-zinc-700"},
    {"id": "lion", "emoji": "🦁", "label": "Sư Tử", "bg": "from-amber-400 to-orange-600"},
    {"id": "frog", "emoji": "🐸", "label": "Ếch Xanh", "bg": "from-emerald-400 to-green-600"},
    {"id": "unicorn", "emoji": "🦄", "label": "Kỳ Lân", "bg": "from-fuchsia-400 to-purple-600"},
    {"id": "tiger", "emoji": "🐯", "label": "Hổ Vàng", "bg": "from-yellow-400 to-amber-600"},
    {"id": "dino", "emoji": "🦖", "label": "Khủng Long", "bg": "from-lime-400 to-emerald-600"},
    {"id": "octopus", "emoji": "🐙", "label": "Bạch Tuộc", "bg": "from-pink-400 to-rose-600"},
    {"id": "cat", "emoji": "🐱", "label": "Mèo Máy", "bg": "from-sky-400 to-indigo-500"},
    {"id": "dog", "emoji": "🐶", "label": "Cún Cưng", "bg": "from-amber-300 to-yellow-600"},
    {"id": "eagle", "emoji": "🦅", "label": "Đại Bàng", "bg": "from-indigo-500 to-violet-700"},
    {"id": "dragon", "emoji": "🐲", "label": "Rồng Thần", "bg": "from-teal-400 to-cyan-600"},
    {"id": "rocket", "emoji": "🚀", "label": "Tên Lửa", "bg": "from-blue-500 to-indigo-600"},
    {"id": "bolt", "emoji": "⚡", "label": "Tia Chớp", "bg": "from-yellow-300 to-orange-500"},
    {"id": "crown", "emoji": "👑", "label": "Hoàng Gia", "bg": "from-amber-400 to-rose-500"},
    {"id": "star", "emoji": "🌟", "label": "Siêu Sao", "bg": "from-violet-400 to-fuchsia-600"},
]

AVATAR_EMOJI_SET = {item["emoji"] for item in PLAYER_AVATARS}

ROOMS: dict[str, dict[str, Any]] = {}
WS_CONNECTIONS: dict[str, list[dict[str, Any]]] = {}
ROOM_TIMERS: dict[str, asyncio.Task[Any]] = {}


def normalize_pin(raw: str) -> str:
    cleaned = "".join(ch for ch in (raw or "").strip() if ch.isdigit())
    return cleaned


def _cleanup_stale_rooms() -> None:
    now = time.time()
    stale_pins = [
        pin
        for pin, room in ROOMS.items()
        if now - float(room.get("updated_at_ts", now)) > 6 * 3600
    ]
    for pin in stale_pins:
        task = ROOM_TIMERS.pop(pin, None)
        if task and not task.done():
            task.cancel()
        WS_CONNECTIONS.pop(pin, None)
        ROOMS.pop(pin, None)


def _generate_pin() -> str:
    _cleanup_stale_rooms()
    for _ in range(50):
        pin = str(random.randint(100000, 999999))
        if pin not in ROOMS:
            return pin
    return str(int(time.time() * 1000))[-6:]


def build_playable_questions(raw_questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    playable: list[dict[str, Any]] = []
    letters = ["A", "B", "C", "D"]

    for idx, q in enumerate(raw_questions):
        q_type = q.get("type", "single_choice")
        title = (q.get("title") or f"Câu hỏi {idx + 1}").strip()
        raw_opts = [str(opt).strip() for opt in (q.get("options") or []) if str(opt).strip()]
        correct_raw = q.get("correct_answer")
        points = float(q.get("points") or 1.0)
        if points <= 0:
            points = 1.0

        options: list[str] = []
        correct_index = 0

        if q_type in ("single_choice", "dropdown", "checkboxes") and len(raw_opts) >= 2:
            target_correct: str | None = None
            if isinstance(correct_raw, list) and correct_raw:
                target_correct = str(correct_raw[0]).strip()
            elif isinstance(correct_raw, str) and correct_raw.strip():
                target_correct = correct_raw.strip()

            if len(raw_opts) <= 4:
                options = raw_opts[:]
            else:
                if target_correct and target_correct in raw_opts:
                    distractors = [o for o in raw_opts if o != target_correct][:3]
                    options = [target_correct] + distractors
                    # Keep original relative order
                    options = [o for o in raw_opts if o in options][:4]
                else:
                    options = raw_opts[:4]

            if target_correct:
                for i, opt in enumerate(options):
                    if opt.strip().lower() == target_correct.lower():
                        correct_index = i
                        break
        elif q_type == "rating":
            options = ["Rất tốt (5 ⭐)", "Tốt (4 ⭐)", "Bình thường (3 ⭐)", "Cần cải thiện (1-2 ⭐)"]
            correct_index = 0
        else:
            # Convert short_text / paragraph into 4-option multiple choice
            ans_str = ""
            if isinstance(correct_raw, str) and correct_raw.strip():
                ans_str = correct_raw.strip()
            elif isinstance(correct_raw, list) and correct_raw:
                ans_str = str(correct_raw[0]).strip()

            if ans_str:
                distractors = [
                    f"Không phải {ans_str}",
                    "Chưa đủ dữ kiện kết luận",
                    "Tất cả phương án khác đều sai",
                ]
                options = [ans_str] + distractors
                # Deterministic shuffle based on index so answer isn't always A
                shift = idx % 4
                rotated = options[:]
                ans_val = rotated.pop(0)
                rotated.insert(shift, ans_val)
                options = rotated
                correct_index = shift
            else:
                options = [
                    f"Phương án {letters[0]}",
                    f"Phương án {letters[1]}",
                    f"Phương án {letters[2]}",
                    f"Phương án {letters[3]}",
                ]
                correct_index = 0

        playable.append(
            {
                "id": q.get("id") or f"gq_{idx + 1}",
                "index": idx,
                "title": title,
                "description": (q.get("description") or "").strip(),
                "options": options[:4],
                "correct_index": max(0, min(correct_index, len(options[:4]) - 1)),
                "points": points,
                "explanation": (q.get("explanation") or "").strip(),
            }
        )

    if not playable:
        playable.append(
            {
                "id": "gq_default_1",
                "index": 0,
                "title": "Câu hỏi khởi động: Bạn đã sẵn sàng chinh phục bảng vàng chưa?",
                "description": "",
                "options": [
                    "Sẵn sàng 100%!",
                    "Quyết tâm Top 1!",
                    "Bình tĩnh tự tin!",
                    "Chiến hết mình!",
                ],
                "correct_index": 0,
                "points": 10.0,
                "explanation": "Chúc cả lớp có một giờ học thật sôi động!",
            }
        )

    return playable


def _recompute_ranks(room: dict[str, Any], update_previous: bool = False) -> list[dict[str, Any]]:
    players = list(room["players"].values())
    players.sort(
        key=lambda p: (
            -int(p["score"]),
            -int(p["correct_count"]),
            float(p.get("total_time_ms", 0.0)),
            float(p.get("joined_at_ts", 0.0)),
        )
    )
    for idx, p in enumerate(players, start=1):
        if update_previous:
            p["previous_rank"] = p.get("rank") or idx
        p["rank"] = idx
    return players


def _check_and_advance_time(room: dict[str, Any]) -> bool:
    """Synchronously advances state if countdown or question timer expired. Returns True if changed."""
    now = time.time()
    status = room["status"]

    if status == "countdown" and now >= float(room.get("countdown_ends_at") or 0):
        _enter_question_phase(room, room["current_question_index"])
        return True

    if status == "question" and now >= float(room.get("question_ends_at") or 0):
        _reveal_current_question(room)
        return True

    return False


def _enter_question_phase(room: dict[str, Any], q_idx: int) -> None:
    now = time.time()
    time_limit = int(room.get("question_time_seconds") or 20)
    if room.get("shuffle_options"):
        # Keep options stable once entered
        pass
    room["status"] = "question"
    room["current_question_index"] = q_idx
    room["question_started_at"] = now
    room["question_ends_at"] = now + time_limit
    room["updated_at_ts"] = now


def _reveal_current_question(room: dict[str, Any]) -> None:
    if room["status"] == "reveal":
        return
    q_idx = int(room["current_question_index"])
    questions = room["questions"]
    if 0 <= q_idx < len(questions):
        q_id = questions[q_idx]["id"]
        # Reset streak for any player who did not answer this question
        for p in room["players"].values():
            if q_id not in p["answers"]:
                p["streak"] = 0
                p["answers"][q_id] = {
                    "choice_index": None,
                    "is_correct": False,
                    "points_earned": 0,
                    "elapsed_ms": int((room.get("question_time_seconds") or 20) * 1000),
                }
    _recompute_ranks(room, update_previous=True)
    room["status"] = "reveal"
    room["updated_at_ts"] = time.time()


def _schedule_room_timer(pin: str, delay_seconds: float) -> None:
    old_task = ROOM_TIMERS.pop(pin, None)
    if old_task and not old_task.done():
        old_task.cancel()

    async def _runner() -> None:
        try:
            await asyncio.sleep(max(0.05, delay_seconds))
            room = ROOMS.get(pin)
            if not room:
                return
            changed = _check_and_advance_time(room)
            if changed:
                await broadcast_room_state(pin)
                # If countdown just flipped to question, schedule auto-reveal timer!
                if room["status"] == "question":
                    rem = float(room["question_ends_at"]) - time.time()
                    _schedule_room_timer(pin, rem + 0.05)
        except asyncio.CancelledError:
            return

    try:
        loop = asyncio.get_running_loop()
        ROOM_TIMERS[pin] = loop.create_task(_runner())
    except RuntimeError:
        pass


def create_game_room(
    form: dict[str, Any],
    host_user_id: str,
    host_name: str,
    question_time_seconds: int = 20,
    speed_bonus: bool = True,
    show_options_on_phone: bool = False,
) -> dict[str, Any]:
    pin = _generate_pin()
    now = time.time()
    questions = build_playable_questions(form.get("questions") or [])

    room: dict[str, Any] = {
        "pin": pin,
        "form_id": form["id"],
        "form_slug": form["slug"],
        "title": form["title"],
        "description": form.get("description") or "",
        "theme_color": form.get("theme_color") or "indigo",
        "classroom_id": form.get("classroom_id"),
        "classroom_name": form.get("classroom_name"),
        "student_roster": list(form.get("student_roster") or []),
        "host_user_id": host_user_id,
        "host_name": host_name,
        "status": "lobby",  # lobby | countdown | question | reveal | leaderboard | podium
        "question_time_seconds": max(5, min(120, int(question_time_seconds or 20))),
        "speed_bonus": bool(speed_bonus),
        "show_options_on_phone": bool(show_options_on_phone),
        "current_question_index": 0,
        "countdown_ends_at": 0.0,
        "question_started_at": 0.0,
        "question_ends_at": 0.0,
        "questions": questions,
        "players": {},
        "saved_to_gradebook": False,
        "saved_count": 0,
        "created_at_ts": now,
        "updated_at_ts": now,
    }
    ROOMS[pin] = room
    return room


def get_room(pin: str) -> dict[str, Any] | None:
    clean = normalize_pin(pin)
    room = ROOMS.get(clean)
    if room:
        _check_and_advance_time(room)
    return room


def find_active_room_for_classroom(classroom_id: str) -> dict[str, Any] | None:
    if not classroom_id:
        return None
    candidates = [
        r
        for r in ROOMS.values()
        if r.get("classroom_id") == classroom_id and r.get("status") != "podium"
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda r: float(r.get("updated_at_ts", 0)), reverse=True)
    top = candidates[0]
    return {
        "pin": top["pin"],
        "title": top["title"],
        "status": top["status"],
        "player_count": len(top["players"]),
        "host_name": top["host_name"],
    }


def join_game_room(
    pin: str,
    name: str,
    avatar: str = "🦊",
    student_class: str = "",
    player_token: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    room = get_room(pin)
    if not room:
        raise ValueError("Không tìm thấy phòng Game với mã PIN này. Hãy kiểm tra lại mã 6 số trên bảng của Giáo viên!")

    if room["status"] == "podium":
        raise ValueError("Trò chơi này đã kết thúc rồi!")

    clean_name = " ".join((name or "").strip().split())
    if not clean_name:
        raise ValueError("Vui lòng nhập họ tên hoặc biệt danh của bạn để vào phòng!")

    chosen_avatar = avatar.strip() if avatar and avatar.strip() in AVATAR_EMOJI_SET else random.choice(PLAYER_AVATARS)["emoji"]
    now = time.time()

    # Reconnect existing player if token matches
    if player_token:
        for existing in room["players"].values():
            if existing["token"] == player_token:
                existing["name"] = clean_name
                existing["avatar"] = chosen_avatar
                if student_class.strip():
                    existing["student_class"] = student_class.strip()
                room["updated_at_ts"] = now
                _recompute_ranks(room)
                return room, existing

    # Reconnect if exact same name already joined and has same class or lobby
    for existing in room["players"].values():
        if existing["name"].lower() == clean_name.lower() and room["status"] == "lobby":
            existing["avatar"] = chosen_avatar
            if student_class.strip():
                existing["student_class"] = student_class.strip()
            room["updated_at_ts"] = now
            _recompute_ranks(room)
            return room, existing

    # Ensure unique display name if duplicate during mid-game
    existing_names_lower = {p["name"].lower() for p in room["players"].values()}
    final_name = clean_name
    suffix = 2
    while final_name.lower() in existing_names_lower:
        final_name = f"{clean_name} ({suffix})"
        suffix += 1

    player_id = f"plr_{uuid.uuid4().hex[:10]}"
    new_token = uuid.uuid4().hex
    player = {
        "id": player_id,
        "token": new_token,
        "name": final_name,
        "avatar": chosen_avatar,
        "student_class": student_class.strip() or (room.get("classroom_name") or ""),
        "score": 0,
        "streak": 0,
        "best_streak": 0,
        "correct_count": 0,
        "total_time_ms": 0.0,
        "rank": len(room["players"]) + 1,
        "previous_rank": len(room["players"]) + 1,
        "answers": {},
        "joined_at_ts": now,
    }
    room["players"][player_id] = player
    room["updated_at_ts"] = now
    _recompute_ranks(room)
    return room, player


def remove_player_from_room(room: dict[str, Any], player_id: str) -> bool:
    if player_id in room["players"]:
        room["players"].pop(player_id, None)
        room["updated_at_ts"] = time.time()
        _recompute_ranks(room)
        return True
    return False


def update_room_settings(
    room: dict[str, Any],
    question_time_seconds: int | None = None,
    speed_bonus: bool | None = None,
    show_options_on_phone: bool | None = None,
) -> None:
    if question_time_seconds is not None:
        room["question_time_seconds"] = max(5, min(120, int(question_time_seconds)))
    if speed_bonus is not None:
        room["speed_bonus"] = bool(speed_bonus)
    if show_options_on_phone is not None:
        room["show_options_on_phone"] = bool(show_options_on_phone)
    room["updated_at_ts"] = time.time()


def host_perform_action(room: dict[str, Any], action: str) -> None:
    pin = room["pin"]
    now = time.time()
    total_q = len(room["questions"])

    if action == "start_game":
        # Reset scores if restarting from podium, otherwise start from Q0
        for p in room["players"].values():
            p["score"] = 0
            p["streak"] = 0
            p["best_streak"] = 0
            p["correct_count"] = 0
            p["total_time_ms"] = 0.0
            p["answers"] = {}
        _recompute_ranks(room, update_previous=True)
        room["current_question_index"] = 0
        room["status"] = "countdown"
        room["countdown_ends_at"] = now + 3.2
        room["updated_at_ts"] = now
        _schedule_room_timer(pin, 3.25)

    elif action == "reveal_answer":
        if room["status"] in ("question", "countdown"):
            _reveal_current_question(room)
            old_task = ROOM_TIMERS.pop(pin, None)
            if old_task and not old_task.done():
                old_task.cancel()

    elif action == "show_leaderboard":
        if room["status"] == "reveal":
            if room["current_question_index"] + 1 >= total_q:
                room["status"] = "podium"
            else:
                room["status"] = "leaderboard"
            room["updated_at_ts"] = now

    elif action == "next_question":
        next_idx = int(room["current_question_index"]) + 1
        if next_idx >= total_q:
            _recompute_ranks(room)
            room["status"] = "podium"
            room["updated_at_ts"] = now
            old_task = ROOM_TIMERS.pop(pin, None)
            if old_task and not old_task.done():
                old_task.cancel()
        else:
            room["current_question_index"] = next_idx
            room["status"] = "countdown"
            room["countdown_ends_at"] = now + 3.0
            room["updated_at_ts"] = now
            _schedule_room_timer(pin, 3.05)

    elif action == "finish_game":
        if room["status"] == "question":
            _reveal_current_question(room)
        _recompute_ranks(room)
        room["status"] = "podium"
        room["updated_at_ts"] = now
        old_task = ROOM_TIMERS.pop(pin, None)
        if old_task and not old_task.done():
            old_task.cancel()


def submit_player_answer(
    room: dict[str, Any],
    player_id: str,
    player_token: str,
    choice_index: int,
) -> dict[str, Any]:
    _check_and_advance_time(room)
    player = room["players"].get(player_id)
    if not player or player["token"] != player_token:
        raise PermissionError("Phiên người chơi không hợp lệ. Hãy vào lại phòng Game!")

    if room["status"] != "question":
        raise ValueError("Hiện chưa trong thời gian chọn đáp án hoặc đã hết giờ!")

    q_idx = int(room["current_question_index"])
    question = room["questions"][q_idx]
    q_id = question["id"]

    if q_id in player["answers"]:
        return player["answers"][q_id]

    if choice_index < 0 or choice_index >= len(question["options"]):
        raise ValueError("Lựa chọn đáp án không hợp lệ.")

    now = time.time()
    started = float(room.get("question_started_at") or now)
    time_limit_ms = max(1000.0, float(room.get("question_time_seconds") or 20) * 1000.0)
    elapsed_ms = max(150.0, min(time_limit_ms, (now - started) * 1000.0))

    is_correct = int(choice_index) == int(question["correct_index"])
    points_earned = 0

    if is_correct:
        player["streak"] = int(player.get("streak") or 0) + 1
        player["best_streak"] = max(int(player.get("best_streak") or 0), player["streak"])
        player["correct_count"] = int(player.get("correct_count") or 0) + 1

        if room.get("speed_bonus", True):
            speed_factor = max(0.15, 1.0 - (elapsed_ms / time_limit_ms) * 0.85)
            base_pts = round(500 + 500 * speed_factor)
        else:
            base_pts = 1000

        streak_bonus = min(max(0, player["streak"] - 1), 5) * 100
        points_earned = int(base_pts + streak_bonus)
        player["score"] = int(player.get("score") or 0) + points_earned
    else:
        player["streak"] = 0

    player["total_time_ms"] = float(player.get("total_time_ms") or 0.0) + elapsed_ms
    answer_record = {
        "choice_index": int(choice_index),
        "is_correct": is_correct,
        "points_earned": points_earned,
        "elapsed_ms": round(elapsed_ms),
    }
    player["answers"][q_id] = answer_record
    room["updated_at_ts"] = now

    # Auto-reveal immediately if EVERY joined player has locked in an answer!
    total_players = len(room["players"])
    if total_players > 0:
        answered_count = sum(1 for p in room["players"].values() if q_id in p["answers"])
        if answered_count >= total_players:
            _reveal_current_question(room)
            old_task = ROOM_TIMERS.pop(room["pin"], None)
            if old_task and not old_task.done():
                old_task.cancel()

    return answer_record


def serialize_room_for_host(room: dict[str, Any]) -> dict[str, Any]:
    _check_and_advance_time(room)
    now = time.time()
    players_sorted = _recompute_ranks(room)
    total_q = len(room["questions"])
    q_idx = min(max(0, int(room["current_question_index"])), total_q - 1)
    cur_q = room["questions"][q_idx]
    q_id = cur_q["id"]

    option_counts = [0] * len(cur_q["options"])
    answered_player_ids: list[str] = []
    for p in players_sorted:
        ans = p["answers"].get(q_id)
        if ans is not None and ans.get("choice_index") is not None:
            answered_player_ids.append(p["id"])
            c_idx = int(ans["choice_index"])
            if 0 <= c_idx < len(option_counts):
                option_counts[c_idx] += 1

    remaining_ms = 0
    if room["status"] == "countdown":
        remaining_ms = max(0, round((float(room["countdown_ends_at"]) - now) * 1000))
    elif room["status"] == "question":
        remaining_ms = max(0, round((float(room["question_ends_at"]) - now) * 1000))

    serialized_players = [
        {
            "id": p["id"],
            "name": p["name"],
            "avatar": p["avatar"],
            "student_class": p["student_class"],
            "score": p["score"],
            "streak": p["streak"],
            "best_streak": p["best_streak"],
            "correct_count": p["correct_count"],
            "score_10": round((p["correct_count"] / total_q) * 10.0, 2) if total_q > 0 else 0.0,
            "rank": p["rank"],
            "previous_rank": p["previous_rank"],
            "answered_current": p["id"] in answered_player_ids,
            "current_answer": p["answers"].get(q_id),
        }
        for p in players_sorted
    ]

    return {
        "pin": room["pin"],
        "form_id": room["form_id"],
        "form_slug": room["form_slug"],
        "title": room["title"],
        "classroom_id": room.get("classroom_id"),
        "classroom_name": room.get("classroom_name"),
        "host_name": room["host_name"],
        "status": room["status"],
        "question_time_seconds": room["question_time_seconds"],
        "speed_bonus": room["speed_bonus"],
        "show_options_on_phone": room["show_options_on_phone"],
        "current_question_index": q_idx,
        "total_questions": total_q,
        "remaining_ms": remaining_ms,
        "player_count": len(serialized_players),
        "answered_count": len(answered_player_ids),
        "saved_to_gradebook": room.get("saved_to_gradebook", False),
        "saved_count": room.get("saved_count", 0),
        "current_question": {
            "id": cur_q["id"],
            "index": q_idx,
            "title": cur_q["title"],
            "description": cur_q["description"],
            "options": cur_q["options"],
            "correct_index": cur_q["correct_index"] if room["status"] in ("reveal", "leaderboard", "podium") else None,
            "explanation": cur_q["explanation"] if room["status"] in ("reveal", "leaderboard", "podium") else "",
            "option_counts": option_counts if room["status"] in ("reveal", "leaderboard", "podium") else [0] * len(cur_q["options"]),
        },
        "players": serialized_players,
    }


def serialize_room_for_player(room: dict[str, Any], player_id: str | None = None) -> dict[str, Any]:
    _check_and_advance_time(room)
    now = time.time()
    players_sorted = _recompute_ranks(room)
    total_q = len(room["questions"])
    q_idx = min(max(0, int(room["current_question_index"])), total_q - 1)
    cur_q = room["questions"][q_idx]
    q_id = cur_q["id"]

    remaining_ms = 0
    if room["status"] == "countdown":
        remaining_ms = max(0, round((float(room["countdown_ends_at"]) - now) * 1000))
    elif room["status"] == "question":
        remaining_ms = max(0, round((float(room["question_ends_at"]) - now) * 1000))

    me = room["players"].get(player_id or "")
    my_answer = me["answers"].get(q_id) if me else None
    is_revealed = room["status"] in ("reveal", "leaderboard", "podium")

    return {
        "pin": room["pin"],
        "title": room["title"],
        "classroom_name": room.get("classroom_name"),
        "student_roster": room.get("student_roster") or [],
        "host_name": room["host_name"],
        "status": room["status"],
        "show_options_on_phone": room["show_options_on_phone"],
        "current_question_index": q_idx,
        "total_questions": total_q,
        "question_time_seconds": room["question_time_seconds"],
        "remaining_ms": remaining_ms,
        "player_count": len(players_sorted),
        "current_question": {
            "id": q_id,
            "index": q_idx,
            "option_count": len(cur_q["options"]),
            "title": cur_q["title"] if (room["show_options_on_phone"] or is_revealed) else "",
            "options": cur_q["options"] if (room["show_options_on_phone"] or is_revealed) else [],
            "correct_index": cur_q["correct_index"] if is_revealed else None,
            "explanation": cur_q["explanation"] if is_revealed else "",
        },
        "me": (
            {
                "id": me["id"],
                "name": me["name"],
                "avatar": me["avatar"],
                "student_class": me["student_class"],
                "score": me["score"],
                "streak": me["streak"],
                "best_streak": me["best_streak"],
                "correct_count": me["correct_count"],
                "score_10": round((me["correct_count"] / total_q) * 10.0, 2) if total_q > 0 else 0.0,
                "rank": me["rank"],
                "previous_rank": me["previous_rank"],
                "has_answered": my_answer is not None and my_answer.get("choice_index") is not None,
                "choice_index": my_answer.get("choice_index") if my_answer else None,
                "last_result": (
                    {
                        "is_correct": bool(my_answer.get("is_correct")),
                        "points_earned": int(my_answer.get("points_earned") or 0),
                        "elapsed_ms": int(my_answer.get("elapsed_ms") or 0),
                    }
                    if (is_revealed and my_answer is not None)
                    else (
                        {"is_correct": False, "points_earned": 0, "elapsed_ms": 0}
                        if is_revealed
                        else None
                    )
                ),
            }
            if me
            else None
        ),
        "top_players": [
            {
                "id": p["id"],
                "name": p["name"],
                "avatar": p["avatar"],
                "score": p["score"],
                "streak": p["streak"],
                "rank": p["rank"],
                "score_10": round((p["correct_count"] / total_q) * 10.0, 2) if total_q > 0 else 0.0,
            }
            for p in players_sorted[:5]
        ],
    }


async def register_ws(pin: str, ws: WebSocket, role: str, player_id: str | None = None) -> None:
    await ws.accept()
    conns = WS_CONNECTIONS.setdefault(pin, [])
    conns.append({"ws": ws, "role": role, "player_id": player_id})


def unregister_ws(pin: str, ws: WebSocket) -> None:
    conns = WS_CONNECTIONS.get(pin)
    if not conns:
        return
    WS_CONNECTIONS[pin] = [c for c in conns if c["ws"] is not ws]
    if not WS_CONNECTIONS[pin]:
        WS_CONNECTIONS.pop(pin, None)


async def broadcast_room_state(pin: str) -> None:
    room = ROOMS.get(pin)
    conns = list(WS_CONNECTIONS.get(pin) or [])
    if not room or not conns:
        return

    host_payload: dict[str, Any] | None = None
    dead: list[WebSocket] = []

    for item in conns:
        ws: WebSocket = item["ws"]
        role: str = item["role"]
        pid: str | None = item.get("player_id")
        try:
            if role == "host":
                if host_payload is None:
                    host_payload = serialize_room_for_host(room)
                await ws.send_json({"type": "state", "data": host_payload})
            else:
                player_payload = serialize_room_for_player(room, pid)
                await ws.send_json({"type": "state", "data": player_payload})
        except Exception:
            dead.append(ws)

    for ws in dead:
        unregister_ws(pin, ws)


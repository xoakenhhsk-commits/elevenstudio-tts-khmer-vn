# 🎙️ ElevenStudio AI — Full-Stack Text-to-Speech (Khmer 🇰🇭 & Tiếng Việt 🇻🇳)

Ứng dụng Web **Text-to-Speech (TTS) Full-Stack** với thiết kế **UI/UX hiện đại lấy cảm hứng từ ElevenLabs Studio**, sử dụng thư viện mã nguồn mở miễn phí `edge-tts` trên GitHub (**không cần API Key, không giới hạn ký tự tháng**).

## ✨ Tính năng nổi bật

- **🇰🇭 Giọng đọc Tiếng Khmer (Campuchia) chuẩn Neural**:
  - **Sreymom (`km-KH-SreymomNeural`)** — Giọng nữ tự nhiên, trong trẻo, chuẩn Phnom Penh.
  - **Piseth (`km-KH-PisethNeural`)** — Giọng nam trầm ấm, đĩnh đạc cho tin tức & review phim.
- **🇻🇳 Giọng đọc Tiếng Việt truyền cảm**:
  - **Hoài My (`vi-VN-HoaiMyNeural`)** — Giọng nữ mượt mà, quảng cáo, TikTok, sách nói.
  - **Nam Minh (`vi-VN-NamMinhNeural`)** — Giọng nam chuyên nghiệp, podcast, thuyết minh.
- **🌐 Mở rộng 300+ giọng Quốc tế**: Tiếng Anh (Multilingual v2), Thái, Trung, Nhật, Hàn...
- **🎛️ Giao diện ElevenLabs Studio hiện đại**:
  - Chế độ **Dark / Light Mode** mượt mà.
  - Tinh chỉnh **Tốc độ đọc (`0.5x` – `2.0x`)**, **Cao độ (`Pitch Hz`)**, **Âm lượng (`Volume %`)**.
  - **Tự động xuất phụ đề `.SRT`** căn chuẩn thời gian cho CapCut / Premiere.
  - **Audio Player Bar** dưới đáy với thanh tua, đổi tốc độ nghe, tải nhanh `.MP3` & `.SRT`.
  - **Lưu trữ Lịch sử SQLite** bền vững + Kho mẫu kịch bản Khmer/Việt dựng sẵn.

---

## 🛠️ Công nghệ sử dụng (Tech Stack)

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4 + Lucide Icons + Google Fonts (`Inter` & `Noto Sans Khmer`).
- **Backend**: Python FastAPI + `edge-tts` (Free Open-Source Neural TTS) + SQLite + `aiofiles`.

---

## 🚀 Hướng dẫn cài đặt & chạy nhanh

### Cách 1: Chạy 1-click trên Windows
Nhấp đúp vào file [`start-dev.bat`](./start-dev.bat) ở thư mục gốc.

### Cách 2: Chạy thủ công qua Terminal

**1. Khởi chạy Backend (Cổng `8000`):**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**2. Khởi chạy Frontend (Cổng `5173`):**
```bash
cd frontend
npm install
npm run dev
```

Mở trình duyệt tại: **http://localhost:5173**

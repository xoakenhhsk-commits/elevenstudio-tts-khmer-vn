# 🎙️ KromaLabs AI — Full-Stack Voice Studio (Khmer 🇰🇭 & Tiếng Việt 🇻🇳)

**KromaLabs** là nền tảng Web **Text-to-Speech (TTS) Full-Stack** với thiết kế **UI/UX hiện đại phong cách ElevenLabs** (bao gồm **Trang chủ Landing Page tương tác trực tiếp**, **Studio Dashboard**, chuyển đổi **Giao diện Sáng / Tối**, bộ font `Plus Jakarta Sans` + `Noto Sans Khmer` sắc nét và **hệ thống Đăng ký / Đăng nhập User thật lưu trữ SQLite**).

---

## ✨ Tính năng nổi bật

- **🏠 Trang chủ Home tương tác chuẩn ElevenLabs**:
  - Live Voice Playground ngay trên trang chủ (chọn mẫu Kể chuyện, Quảng cáo TikTok, Review Phim bằng tiếng Khmer & tiếng Việt và bấm nghe ngay).
  - Bảng tổng quan **Trang chủ Studio** hiển thị thống kê ký tự, số bản thu và giọng đọc nổi bật.
- **🔐 Đăng ký / Đăng nhập / Đăng xuất User thật (SQLite Database)**:
  - Lưu trữ bảng `users`, `sessions`, `generations` trong `backend/data/kromalabs.db`.
  - Mật khẩu băm bảo mật chuẩn `PBKDF2-HMAC-SHA256` kèm salt ngẫu nhiên.
  - Tự động đồng bộ lịch sử file `.MP3` và phụ đề `.SRT` riêng biệt cho từng tài khoản.
- **🎨 Thương hiệu mới & Giao diện Sáng / Tối**:
  - Logo hình học âm học độc quyền **KromaLabs** (`BrandLogo.tsx` & `favicon.svg`).
  - Hỗ trợ chuyển đổi mượt mà **Giao diện Sáng (Light Mode)** & **Giao diện Tối (Dark Mode)**.
- **🇰🇭 Giọng đọc Tiếng Khmer & 🇻🇳 Tiếng Việt miễn phí 100%**:
  - **Khmer (`km-KH`)**: `Sreymom` (Nữ) & `Piseth` (Nam).
  - **Tiếng Việt (`vi-VN`)**: `Hoài My` (Nữ) & `Nam Minh` (Nam) + mở rộng hơn 300 giọng quốc tế.

---

## 🚀 Hướng dẫn chạy nhanh

### Cách 1: Chạy 1-click trên Windows
Nhấp đúp vào file [`start-dev.bat`](./start-dev.bat).

### Cách 2: Chạy thủ công qua Terminal

**1. Backend (Cổng `8000`):**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**2. Frontend (Cổng `5173`):**
```bash
cd frontend
npm install
npm run dev
```

Mở trình duyệt tại: **http://127.0.0.1:5173**

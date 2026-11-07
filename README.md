# KromaForms — Nền tảng Tạo Khảo Sát & Biểu Mẫu Public Full-Stack (Google Forms Clone)

Ứng dụng Web Full-Stack thiết kế khảo sát, thu thập phản hồi trực tuyến và phân tích thống kê thời gian thực tương tự **Google Forms**, kết hợp ngôn ngữ thiết kế tối giản hiện đại (**Plus Jakarta Sans + Inter + JetBrains Mono**, chế độ Sáng/Tối mượt mà).

---

## Tính năng nổi bật

- **Trình tạo Biểu mẫu trực quan (Form Builder)**:
  - Hỗ trợ **8 loại câu hỏi**: Trả lời ngắn, Đoạn văn dài, Trắc nghiệm 1 lựa chọn (Radio), Hộp kiểm nhiều lựa chọn (Checkbox), Menu thả xuống (Dropdown), Đánh giá Sao (`1–5 ★` / `1–10 ★`), Email, Ngày tháng.
  - Sắp xếp thứ tự câu hỏi, nhân bản, đánh dấu bắt buộc (`*`), đổi 6 tông màu chủ đề (`Indigo`, `Emerald`, `Violet`, `Rose`, `Amber`, `Minimalist`).
  - Kho **4 mẫu khảo sát tiếng Việt dựng sẵn** + **Biểu mẫu trống** khởi tạo 1-click.
- **Xuất bản Link Public tức thì (`Public Survey Sharing`)**:
  - Đường dẫn trực tiếp `/f/<slug>` cho người tham gia điền khảo sát không cần đăng nhập.
  - Hỗ trợ **Link LAN Wi-Fi**, **HTTPS Public Tunnel**, **Mã truy cập ngắn (`KF-XXXXX`)**, **Mã QR điện thoại** và **Mã nhúng HTML `<iframe>`**.
- **Phân tích & Xuất dữ liệu (`Responses & Analytics`)**:
  - Thống kê realtime: Tổng phản hồi, lượt mở link, tỷ lệ hoàn thành, biểu đồ phần trăm từng đáp án, điểm sao trung bình.
  - Xem theo **Biểu đồ tổng hợp**, **Bảng dữ liệu**, **Từng phản hồi** và **Xuất file Excel (`.CSV` chuẩn UTF-8 BOM tiếng Việt)**.
- **Xác thực Người dùng thật (`SQLite Auth`)**:
  - Đăng ký, đăng nhập, đăng xuất lưu trữ an toàn với `PBKDF2-HMAC-SHA256` trên SQLite (`backend/data/kromaforms.db`).

---

## Chạy nhanh 1-Click trên Windows

Nhấp đúp vào file `start-dev.bat` hoặc chạy lệnh:

```powershell
# 1. Chạy Backend FastAPI (Port 8000)
cd backend
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. Chạy Frontend Vite + React (Port 5173)
cd frontend
npm run dev
```

Sau khi chạy, mở trình duyệt tại:
- **Dashboard & Tạo Khảo Sát**: http://localhost:5173
- **API Backend Health**: http://localhost:8000/api/health

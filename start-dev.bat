@echo off
title KromaLabs AI - Khmer & Vietnam Voice Studio
echo ========================================================
echo   Khoi dong KromaLabs AI (Full-Stack TTS Khmer + VN)
echo ========================================================

start "KromaLabs Backend (FastAPI :8000)" cmd /k "cd /d %~dp0backend && .venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
start "KromaLabs Frontend (Vite :5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo -> Backend API:  http://127.0.0.1:8000/docs
echo -> Giao dien Web: http://localhost:5173
echo.
pause

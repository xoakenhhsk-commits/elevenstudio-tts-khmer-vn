@echo off
title ElevenStudio AI - Khmer & Vietnam Neural TTS
echo ========================================================
echo   Khoi dong ElevenStudio AI (Full-Stack TTS Khmer + VN)
echo ========================================================

start "ElevenStudio Backend (FastAPI :8000)" cmd /k "cd /d %~dp0backend && .venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload"
start "ElevenStudio Frontend (Vite :5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo -> Backend API:  http://127.0.0.1:8000/docs
echo -> Giao dien Web: http://localhost:5173
echo.
pause

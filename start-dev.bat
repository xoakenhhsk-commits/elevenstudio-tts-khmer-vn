@echo off
chcp 65001 >nul
title KromaForms - Google Forms Full-Stack Studio & Public Survey Server
echo ================================================================
echo   KROMAFORMS v3.0 - HE THONG KHAO SAT PUBLIC NHU GOOGLE FORMS
echo ================================================================
echo.

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set LAN_IP=%%a
    goto :found_ip
)
:found_ip
if defined LAN_IP set LAN_IP=%LAN_IP:~1%
if not defined LAN_IP set LAN_IP=127.0.0.1

echo [1/3] Dang khoi dong FastAPI Backend + SQLite (Port 8000)...
start "KromaForms Backend API" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/3] Dang khoi dong React + Vite Frontend (Port 5173)...
start "KromaForms Frontend Web" cmd /k "cd /d %~dp0frontend && npm run dev"

echo [3/3] Dang tao Link Public HTTPS toan cau mien phi (localhost.run)...
start "KromaForms Public HTTPS Tunnel" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0start-public-tunnel.ps1"

timeout /t 4 >nul
echo.
echo ================================================================
echo   HE THONG DA CHAY THANH CONG! LINK TRUY CAP TRUC TIEP:
echo   - Trang quan tri & Tao Form : http://localhost:5173
echo   - Link LAN Wi-Fi Public     : http://%LAN_IP%:5173
echo   - API Docs (Swagger)        : http://localhost:8000/docs
echo   - Link Public HTTPS Internet: Xem trong cua so Public Tunnel!
echo ================================================================
echo.
start http://localhost:5173
pause

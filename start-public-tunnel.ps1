# KromaForms - Script tự động tạo Link Public HTTPS toàn cầu miễn phí (localhost.run)
$ErrorActionPreference = "Continue"
$dataDir = Join-Path $PSScriptRoot "backend\data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
$urlFile = Join-Path $dataDir "public_url.txt"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  KROMAFORMS - DANG KHOI TAO PUBLIC HTTPS TUNNEL MIEN PHI..." -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:127.0.0.1:5173 nokey@localhost.run 2>&1 | ForEach-Object {
    $line = $_.ToString()
    if ($line -match "(https://[a-zA-Z0-9.-]+\.lhr\.life)") {
        $pubUrl = $Matches[1]
        Set-Content -Path $urlFile -Value $pubUrl -Encoding UTF8
        Write-Host ""
        Write-Host "  [PUBLIC ONLINE] Link Khao Sat Toàn Cầu của bạn:" -ForegroundColor Green
        Write-Host "  👉 $pubUrl" -ForegroundColor Yellow
        Write-Host ""
    }
}


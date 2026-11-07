# KromaForms - Script tự động tạo Link Public HTTPS toàn cầu miễn phí (localhost.run)
$ErrorActionPreference = "Continue"
$dataDir = Join-Path $PSScriptRoot "backend\data"
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
$urlFile = Join-Path $dataDir "public_url.txt"

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  KROMAFORMS - DANG KHOI TAO PUBLIC HTTPS TUNNEL MIEN PHI..." -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

while ($true) {
    ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=25 -o ExitOnForwardFailure=yes -R 80:localhost:5173 nokey@localhost.run 2>&1 | ForEach-Object {
        $line = $_.ToString()
        if ($line -match "(https://[a-zA-Z0-9.-]+\.lhr\.life)") {
            $pubUrl = $Matches[1]
            Set-Content -Path $urlFile -Value $pubUrl -Encoding ascii
            Write-Host ""
            Write-Host "  [PUBLIC ONLINE] Link Khao Sat / Bai Tap Toan Cau cua ban:" -ForegroundColor Green
            Write-Host "  -> $pubUrl" -ForegroundColor Yellow
            Write-Host ""
        }
    }
    Write-Host "[Tunnel] Mat ket noi tam thoi, tu dong ket noi lai sau 3 giay..." -ForegroundColor DarkYellow
    Start-Sleep -Seconds 3
}


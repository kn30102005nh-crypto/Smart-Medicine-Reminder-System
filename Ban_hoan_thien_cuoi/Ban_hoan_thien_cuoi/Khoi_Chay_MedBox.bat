@echo off
title Khoi Chay He Thong IoT Smart MedBox
color 0A
cls
echo =====================================================================
echo          HE THONG GIAM SAT TU THUOC IOT THONG MINH - MEDBOX
echo =====================================================================
echo.
echo [*] Dang kiem tra moi truong Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [LOI] May tinh cua ban chua duoc cai dat Node.js!
    echo Vui long truy cap https://nodejs.org de tai va cai dat phien ban LTS.
    echo.
    pause
    exit /b
)

echo [OK] Da tim thay Node.js phien ban:
node -v
echo.

echo [*] Dang chuan bi thu vien... Neu day la lan dau chay, qua trinh se mat 1-2 phut.
if not exist node_modules (
    echo [*] Khong tim thay thu muc node_modules. Dang tien hanh cai dat 'npm install'...
    call npm install
)

echo.
echo [*] Dang kick-off Server va tu dong bat trinh duyet...
echo.

:: Hen gio tu dong bat trinh duyet sau 3 giay (cho cho server khoi dong hoan tat)
start "" "http://localhost:3000"

:: Khoi chay server (su dung lenh CMD xuan tru tru tiep, tranh block boi PowerShell)
call npm run dev

pause

@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Arama Yonetim Sistemi - Web Sunucusu

REM Once scriptin bulundugu klasoru, sonra eski klasor duzenini dene.
set "APP_DIR=%~dp0"
if not exist "%APP_DIR%package.json" (
    set "APP_DIR="
    for /d %%D in ("%~dp0Arama*") do if exist "%%~fD\package.json" set "APP_DIR=%%~fD"
)
if not defined APP_DIR (
    echo [HATA] package.json iceren proje klasoru bulunamadi: %~dp0
    pause
    exit /b 1
)

set "PORT=8085"

echo.
echo ==========================================
echo   Arama Yonetim Sistemi
echo   Web uygulamasi baslatiliyor...
echo ==========================================
echo   Klasor: %APP_DIR%
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden kurun.
    pause
    exit /b 1
)

cd /d "%APP_DIR%"

if not exist "node_modules\expo\package.json" (
    echo node_modules eksik, bagimliliklar yukleniyor...
    call npm install
    if errorlevel 1 (
        echo [HATA] npm install basarisiz oldu.
        pause
        exit /b 1
    )
)

echo Web sunucusu baslatiliyor...
echo Tarayicinizda http://localhost:%PORT% adresini acin
echo (Durdurmak icin Ctrl+C)
echo.
call npx expo start --web --port %PORT%

echo.
pause
endlocal

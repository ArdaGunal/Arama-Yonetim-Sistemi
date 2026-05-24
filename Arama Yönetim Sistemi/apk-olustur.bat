@echo off
title Arama Yonetim Sistemi - APK Olusturucu
echo.
echo ==========================================
echo   Arama Yonetim Sistemi - APK Olusturucu
echo ==========================================
echo.

echo [1/3] EAS CLI kontrol ediliyor...
call npx eas-cli --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo EAS CLI bulunamadi. Yukleniyor...
    call npm install -g eas-cli
)
echo       EAS CLI hazir.
echo.

echo [2/3] Expo hesabi kontrol ediliyor...
call npx eas-cli whoami >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Giris yapilmamis. Lutfen giris yapin:
    call npx eas-cli login
)
echo.

echo [3/3] APK olusturuluyor...
echo       Bu islem 5-15 dakika surebilir.
echo.
call npx eas-cli build --platform android --profile preview

echo.
echo ==========================================
echo   Islem tamamlandi!
echo   APK indirme linki yukarida gorunuyor.
echo ==========================================
echo.
pause

@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Arama Yonetim Sistemi - Yerel APK Olusturucu

REM Proje yolu
set "APP_DIR=%~dp0"
if "%APP_DIR:~-1%"=="\" set "APP_DIR=%APP_DIR:~0,-1%"

echo ==========================================
echo   Arama Yonetim Sistemi - Yerel APK
echo ==========================================
echo Proje artik sorunsuz ASCII dizininde bulundugu icin
echo kopyalama gerekmeksizin dogrudan derleniyor...
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi.
    pause
    exit /b 1
)

if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" (
    set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
)
if not defined JAVA_HOME (
    echo [HATA] JAVA_HOME tanimli degil ve Android Studio JBR bulunamadi.
    pause
    exit /b 1
)
set "PATH=%JAVA_HOME%\bin;%PATH%"

if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platform-tools" (
    echo [HATA] Android SDK bulunamadi.
    pause
    exit /b 1
)

pushd "%APP_DIR%"

echo [1/3] Bagimliliklar kontrol ediliyor...
if not exist "node_modules\expo\package.json" (
    call npm ci
    if errorlevel 1 goto :fail
)

echo [2/3] Android projesi kontrol ediliyor...
if not exist "android\gradlew.bat" (
    call npx expo prebuild --platform android --no-install
    if errorlevel 1 goto :fail
)

set "SDKDIR=%ANDROID_HOME:\=\\%"
> "android\local.properties" echo sdk.dir=%SDKDIR%

echo [3/3] APK derleniyor (Gradle - bu islem biraz surebilir)...
cd android
call gradlew.bat assembleRelease --no-daemon
if errorlevel 1 goto :fail
cd ..

echo.
set "SRC_APK=android\app\build\outputs\apk\release\app-release.apk"
if not exist "%SRC_APK%" (
    echo [HATA] APK uretilemedi, cikti klasoru bos!
    goto :fail
)

for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%T"
if not exist "%~dp0APK" mkdir "%~dp0APK"
set "OUT_APK=%~dp0APK\AramaYonetim-%STAMP%.apk"
copy /y "%SRC_APK%" "%OUT_APK%" >nul

popd

echo.
echo ==========================================
echo BASARILI! APK dosyasi uretildi:
echo %OUT_APK%
echo ==========================================
if /i not "%~1"=="nopause" pause
exit /b 0

:fail
popd
echo.
echo ==========================================
echo HATA: Derleme basarisiz oldu. Yukaridaki ciktiyi inceleyin.
echo ==========================================
if /i not "%~1"=="nopause" pause
exit /b 1

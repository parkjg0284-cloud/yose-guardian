@echo off
REM Yose Guardian - one-click installer
REM Downloads the latest game package from GitHub Releases and installs it.
setlocal
set "HERE=%~dp0"
set "URL=https://github.com/parkjg0284-cloud/yose-guardian/releases/latest/download/game.zip"

echo ============================================
echo   Yose Guardian - Installer
echo ============================================
echo.

where powershell >nul 2>nul
if errorlevel 1 (
  echo [!] PowerShell not found - Windows 7 or later required.
  pause
  exit /b 1
)

echo [1/2] Downloading and installing...
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%launcher.ps1" -Url "%URL%" -Silent
if errorlevel 1 (
  echo.
  echo [!] Installation failed - see log above.
  pause
  exit /b 1
)

echo.
echo [2/2] Done. Starting the game...
if exist "%LOCALAPPDATA%\YoseGuardian\app\???.vbs" start "" "%LOCALAPPDATA%\YoseGuardian\app\???.vbs"
echo.
echo Installed to: %LOCALAPPDATA%\YoseGuardian\app
pause
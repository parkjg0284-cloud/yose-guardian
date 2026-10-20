@echo off
REM Yose Guardian - register as a Windows service (requires Administrator)
REM Runs 24/7 and starts automatically on reboot.
setlocal
set "APP_DIR=%~dp0"
set "NODE_EXE=node.exe"
for /f "delims=" %%i in ('where node 2^>nul') do set "NODE_EXE=%%i"

echo [1/3] Removing existing service...
sc stop YoseGuardian >nul 2>nul
sc delete YoseGuardian >nul 2>nul
timeout /t 2 >nul

echo [2/3] Creating service...
sc create YoseGuardian binPath= "\"%NODE_EXE%\" \"%APP_DIR%server\index.js\"" start= auto DisplayName= "Yose Guardian Game Server"
if errorlevel 1 (
  echo [!] Failed to create service - please run as Administrator
  pause
  exit /b 1
)

echo [3/3] Setting auto-restart on failure...
sc failure YoseGuardian reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc description YoseGuardian "Yose Guardian - 24/7 game server on port 3001"
sc start YoseGuardian

echo.
echo Service state:
sc query YoseGuardian | findstr "STATE"
echo.
echo URL    : http://localhost:3001
echo Stop   : sc stop YoseGuardian
echo Remove : sc delete YoseGuardian
pause
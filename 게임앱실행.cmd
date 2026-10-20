@echo off
cd /d "%~dp0"
where node >nul 2>nul || set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs"
where node >nul 2>nul || (echo [!] Node.js is required - https://nodejs.org & exit /b 1)
start "" /min cmd /c "node app.js"
exit /b 0
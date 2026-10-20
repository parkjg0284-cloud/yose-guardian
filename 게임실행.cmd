@echo off
chcp 65001 >nul
title [요세의 수호자] 실행 (창은 곧 닫힙니다)
rem ------------------------------------------------------------------
rem  더블클릭하면 콘솔 창 없이 게임이 켜지고 브라우저가 열린다.
rem  서버는 숨김 상태로 계속 돌아간다 (게임 안의 [게임종료] 로 끈다).
rem  이 창은 시작만 하고 바로 닫힌다.
rem  모든 줄이 ASCII 문자로 끝나야 cmd 가 줄을 깨뜨리지 않는다.
rem ------------------------------------------------------------------

set "REPO=%~dp0"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"

if not exist "%REPO%\run.cmd" goto :nofolder
cd /d "%REPO%"
if /i "%~1"=="check" goto :check

where node >nul 2>nul
if not errorlevel 1 goto :havenode
if exist "%ProgramFiles%\nodejs\node.exe" goto :havenode
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" goto :havenode
goto :nonode

:havenode
if not exist node_modules (
  echo [설치] 첫 실행이라 라이브러리를 받습니다. 1~3분 걸립니다. -
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 goto :npmfail
)

if not exist "client\dist\index.html" (
  echo [빌드] 화면을 만드는 중입니다. 잠시만 기다려 주세요. -
  call npm run build
  if errorlevel 1 goto :buildfail
)

echo ============================================================
echo  게임을 켭니다 - 이 창은 곧 닫힙니다 -
echo ============================================================
start "" wscript.exe //nologo "%REPO%\게임실행.vbs"
exit /b 0

:check
echo [점검] 게임 폴더 : %REPO%
for /f "delims=" %%v in ('node -v') do echo [점검] Node.js %%v
if exist node_modules (echo [점검] node_modules 있음) else (echo [점검] node_modules 없음 - 첫 실행 시 설치)
if exist "client\dist\index.html" (echo [점검] 빌드 산출물 있음) else (echo [점검] 빌드 산출물 없음)
echo [점검] 정상 - 이대로 더블클릭하면 실행됩니다.
exit /b 0

:nonode
echo [오류] Node.js 가 없습니다 -
echo        https://nodejs.org 에서 설치한 뒤 다시 실행해 주세요.
pause
exit /b 1

:npmfail
echo [오류] 라이브러리 설치에 실패했습니다 - 위 메시지를 확인해 주세요.
pause
exit /b 1

:buildfail
echo [오류] 화면 빌드에 실패했습니다 - 위 메시지를 확인해 주세요.
pause
exit /b 1

:nofolder
echo [오류] 게임 폴더를 찾지 못했습니다 -
echo        %REPO%
pause
exit /b 1

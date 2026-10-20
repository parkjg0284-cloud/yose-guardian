@echo off
chcp 65001 >nul
title [요새의 수호자] 실행 -
rem ------------------------------------------------------------------
rem  아무 폴더에서나 더블클릭해도 게임 서버가 켜진다.
rem  (npm 명령을 직접 칠 필요 없음 - 폴더를 잘못 잡으면 ENOENT 가 난다)
rem  모든 줄이 ASCII 문자로 끝나야 cmd 가 줄을 깨뜨리지 않는다.
rem ------------------------------------------------------------------

set "REPO=%~dp0"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"

if not exist "%REPO%\run.cmd" goto :nofolder
cd /d "%REPO%"
if /i "%~1"=="check" goto :check
echo ============================================================
echo    요새의 수호자 실행 -
echo ============================================================
echo  게임 폴더 : %REPO%
echo.
if not exist node_modules echo [안내] 첫 실행이라 설치부터 합니다. 1~3분 걸립니다.
echo [시작] 서버를 켭니다. 이 창은 닫지 마세요. -
echo.
call run.cmd
echo.
echo [종료] 서버가 꺼졌습니다. 위에 오류가 있으면 그대로 알려주세요. -
pause
exit /b 0

:check
echo [점검] 게임 폴더 : %REPO%
for /f "delims=" %%v in ('node -v') do echo [점검] Node.js %%v
if exist node_modules (echo [점검] node_modules 있음) else (echo [점검] node_modules 없음 - 첫 실행 시 설치)
if exist "client\dist\index.html" (echo [점검] 빌드 산출물 있음) else (echo [점검] 빌드 산출물 없음)
echo [점검] 정상 - 이대로 더블클릭하면 실행됩니다.
exit /b 0

:nofolder
echo [오류] 게임 폴더를 찾지 못했습니다 :
echo        %REPO%
echo        게임 폴더를 옮겼다면 이 파일의 REPO 경로를 고쳐 주세요.
pause
exit /b 1

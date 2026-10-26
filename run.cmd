@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 요새의 수호자 - 실행 (이 창을 닫으면 서버가 꺼집니다) -

rem ------------------------------------------------------------------
rem  규칙 : 모든 줄의 마지막 글자는 ASCII 여야 한다.
rem  한글로 줄이 끝나면 cmd 가 그 줄의 CR 을 삼켜 다음 줄과 합치고,
rem  스크립트 전체가 깨져 "... was unexpected at this time." 로 죽는다.
rem  (tools/cmd-lint.mjs 가 이 규칙을 자동 검사한다)
rem ------------------------------------------------------------------

if /i "%~1"=="firewall" goto firewall
if /i "%~1"=="firewall-run" goto firewallrun
if /i "%~1"=="build" goto build

rem 설정 화면에서 바꾼 .env 의 PORT 를 읽는다 (없으면 3001).
set "GAME_PORT=3001"
if exist ".env" for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /i "%%A"=="PORT" set "GAME_PORT=%%B"

where node >nul 2>&1
if errorlevel 1 goto nonode
if not exist "node_modules" goto install
goto run

:install
echo.
echo  처음 실행이라 필요한 파일을 설치합니다(1~3분) ...
call npm.cmd install
if errorlevel 1 goto installfail
goto run

:run
echo.
echo  ============================================
echo    요새의 수호자 실행 -
echo  ============================================
echo.
echo   이 창을 닫으면 서버가 꺼집니다. 최소화해 두세요.
echo   서버가 갑자기 죽으면 자동으로 다시 켜집니다(감시자).
echo.
echo   게임 주소 : http://localhost:%GAME_PORT%
echo   다운로드  : http://localhost:8099
echo.
echo   브라우저가 안 열리면 위 주소를 복사해 열어 주세요 -
echo.
start "" explorer "http://localhost:%GAME_PORT%"
node tools\supervise.mjs
echo.
echo  [종료] 서버가 멈췄습니다. 위에 오류가 있으면 그대로 알려주세요 -
pause
exit /b 0

:installfail
echo.
echo  [오류] 설치에 실패했습니다. 위 메시지를 그대로 알려주세요 -
pause
exit /b 1

:nonode
echo.
echo  [오류] Node.js 가 설치되어 있지 않습니다.
echo         https://nodejs.org 에서 LTS 를 설치한 뒤 다시 실행하세요 -
pause
exit /b 1

:firewall
powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0' -ArgumentList 'firewall-run'"
exit /b 0

:firewallrun
echo 관리자 권한으로 방화벽 규칙을 추가합니다 ...
netsh advfirewall firewall add rule name="요새의 수호자 %GAME_PORT%" dir=in action=allow protocol=TCP localport=%GAME_PORT%
netsh advfirewall firewall add rule name="요새의 수호자 8099" dir=in action=allow protocol=TCP localport=8099
echo.
echo  완료했습니다. 이 창은 닫아도 됩니다 -
pause
exit /b 0

:build
call npm.cmd run build
echo.
echo  빌드가 끝났습니다. 게임 창에서 새로고침(F5) 하세요 -
pause
exit /b 0

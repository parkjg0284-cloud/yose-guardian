# 설치 자동 검증 — 설치 → 서버 기동 → HTTP 200 → 번들 확인 → 서버 종료
# 창(폴더 선택) 없이 -Path/-Silent 로 설치한다.
$ErrorActionPreference = 'Continue'
$inst = $PSScriptRoot
$base = Join-Path $env:LOCALAPPDATA 'YoseGuardian'
$app = Join-Path $base 'app'
$pass = 0; $fails = @()
function T($n, $c) {
  if ($c) { Write-Host "  PASS $n" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "  FAIL $n" -ForegroundColor Red; $script:fails += $n }
}
Write-Host ''
Write-Host '=== 설치 자동 검증 ==='
Remove-Item $base -Recurse -Force -ErrorAction SilentlyContinue
Write-Host '  [1] 설치 실행'
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $inst 'install.ps1') -Path $app -Silent *> (Join-Path $inst 'last-install.log')
T '설치 폴더 생성' (Test-Path $app)
T '게임 화면 파일(client/dist) 포함' ((Get-ChildItem (Join-Path $app 'client\dist\assets') -File -ErrorAction SilentlyContinue).Count -ge 2)
T '메인화면 배경 포함' (Test-Path (Join-Path $app 'client\dist\menu-bg.jpg'))
T '서버 코드 포함' (Test-Path (Join-Path $app 'server\index.js'))
T '실행 파일 · 제거 스크립트' ((Test-Path (Join-Path $app '게임실행.cmd')) -and (Test-Path (Join-Path $app 'uninstall.cmd')))
T '바탕화면 바로가기' (Test-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) '요세의 수호자.lnk'))
T '시작메뉴 바로가기' (Test-Path (Join-Path ([Environment]::GetFolderPath('Programs')) '요세의 수호자.lnk'))
T '의존성 준비(node_modules/express)' (Test-Path (Join-Path $app 'node_modules\express'))
T '저장 파일(game.db) 준비' (Test-Path (Join-Path $app 'server\data\game.db'))
T '설치 위치를 기억한다' ((Get-Content (Join-Path $base 'location.txt') -Raw -ErrorAction SilentlyContinue).Trim() -eq $app)

Write-Host '  [2] 서버 기동'
$port = 3001
$env:TEMP = Join-Path $base 'tmp'; $env:TMP = $env:TEMP
$p = Start-Process node -ArgumentList 'server/index.js' -WorkingDirectory $app -PassThru -WindowStyle Hidden
$ok = $false; $body = ''
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 1200
  try {
    $r = Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $ok = $true; $body = $r.Content; break }
  } catch { }
}
T "HTTP 200 응답 (포트 $port)" $ok
T '화면이 번들 스크립트를 부른다' ($body -match 'assets/index-')
if ($body -match 'assets/(index-[A-Za-z0-9_-]+\.js)') {
  try {
    $b = Invoke-WebRequest "http://127.0.0.1:$port/assets/$($Matches[1])" -UseBasicParsing -TimeoutSec 8
    T '번들 JS 수신(10KB 이상)' ($b.StatusCode -eq 200 -and $b.RawContentLength -gt 10000)
  } catch { T '번들 JS 수신(10KB 이상)' $false }
}
if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800
T '서버 정상 종료' (-not $p -or $p.HasExited)
Write-Host ''
Write-Host "  결과: $pass 통과 / $($fails.Count) 실패"
if ($fails.Count) { Write-Host ('  실패: ' + ($fails -join ', ')) -ForegroundColor Red; exit 1 }
Write-Host '  OK - 설치 자동 검증 통과' -ForegroundColor Green

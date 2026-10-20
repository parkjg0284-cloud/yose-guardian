param(
  [string]$Path = '',      # 설치 폴더를 직접 지정(자동 검증·무인 설치용)
  [switch]$Silent          # 창을 띄우지 않는다
)

# ── 파일이 사용 중이면 건너뛰는 안전한 쓰기 (게임 실행 중에도 설치가 멈추지 않게) ──
function Write-SafeFile {
  param([string]$Path, [string]$Encoding, $Value)
  try {
    $text = ($Value -join "`r`n")
    [IO.File]::WriteAllText($Path, $text, [Text.Encoding]::Default)
  } catch {
    Write-Host ("  [안내] " + (Split-Path $Path -Leaf) + " 가 사용 중이라 갱신하지 못했습니다 — 기존 파일로 실행됩니다")
  }
}

# 요세의 수호자 게임 설치 — 저장 위치를 골라서 설치한다.
#  · 파일 조건 없음: Node.js 가 없거나 game.zip 이 없어도 설치를 막지 않는다(안내만).
#  · 사용자가 고른 폴더 아래 '요세의수호자' 폴더에 저장한다(남의 파일을 건드리지 않는다).
$ErrorActionPreference = 'Stop'
$base    = Join-Path $env:LOCALAPPDATA 'YoseGuardian'
$payload = Join-Path $PSScriptRoot 'game.zip'
Write-Host ''
Write-Host '  ==============================================' -ForegroundColor Yellow
Write-Host '     요 세 의  수 호 자  -  마 법 의  비 밀' -ForegroundColor Yellow
Write-Host '  ==============================================' -ForegroundColor Yellow

# ── ① 저장 위치 고르기 (창) ─────────────────────────────────────────
$chosen = $Path
if (-not $chosen -and -not $Silent) {
  try {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = '요세의 수호자를 설치할 폴더를 고르세요 (그 안에 요세의수호자 폴더를 만듭니다)'
    $dlg.ShowNewFolderButton = $true
    if (Test-Path $env:USERPROFILE) { $dlg.SelectedPath = $env:USERPROFILE }
    Write-Host '  저장 위치를 고르는 창이 열렸습니다...' -ForegroundColor Cyan
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $chosen = $dlg.SelectedPath }
  } catch {
    Write-Host '  [안내] 위치 선택 창을 쓸 수 없어 기본 위치에 설치합니다' -ForegroundColor Yellow
  }
}
# 고른 폴더에 실제로 쓸 수 있는지 확인 — 못 쓰면(관리자 권한 필요) 기본 위치로 넘어간다.
if ($chosen -and -not $Path) {
  try {
    $probe = Join-Path $chosen ('.yose-write-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType File -Path $probe -Force | Out-Null
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
    Write-Host '  이 폴더에 쓸 수 있습니다 (기록 저장 가능)' -ForegroundColor Green
  } catch {
    Write-Host '  [안내] 그 폴더에는 쓸 수 없습니다(관리자 권한 필요) — 기록 저장이 안 되므로 기본 위치에 설치합니다' -ForegroundColor Yellow
    $chosen = ''
  }
}
$app = if ($Path) { $Path } elseif ($chosen) { Join-Path $chosen '요세의수호자' } else { Join-Path $base 'app' }
Write-Host "  설치 위치: $app" -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $app | Out-Null
New-Item -ItemType Directory -Force -Path $base | Out-Null
try { Set-Content -Path (Join-Path $base 'location.txt') -Value $app -Encoding UTF8 -ErrorAction Stop } catch { Write-Host '  [안내] 설치 위치 기록은 건너뜁니다 (권한 없음)' }
# ── ② 파일 풀기 (game.zip 이 없으면 옆 폴더에서 복사 — 막지 않는다) ──
if (Test-Path $payload) {
  Write-Host '  [1/4] 게임 파일을 푸는 중...'
# ── 압축을 풀기 전에 쓸 수 있는 폴더인지 확인 — 못 쓰면 안전한 기본 위치로 ──
$writeOk = $false
try {
  New-Item -ItemType Directory -Force -Path $app -ErrorAction Stop | Out-Null
  $probe2 = Join-Path $app ('.yose-w-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
  New-Item -ItemType File -Path $probe2 -Force -ErrorAction Stop | Out-Null
  Remove-Item $probe2 -Force -ErrorAction Stop
  $writeOk = $true
} catch { $writeOk = $false }
if (-not $writeOk) {
  Write-Host '  [안내] 그 폴더에는 쓸 수 없습니다 (액세스 거부 — 보호된 폴더이거나 권한 없음)'
  Write-Host '         기록이 저장되도록 기본 위치에 설치합니다'
  $app = Join-Path $base 'app'
  New-Item -ItemType Directory -Force -Path $app | Out-Null
  try { Set-Content -Path (Join-Path $base 'location.txt') -Value $app -Encoding UTF8 -ErrorAction Stop } catch { Write-Host '  [안내] 설치 위치 기록은 건너뜁니다 (권한 없음)' }
  Write-Host ('  설치 위치 변경: ' + $app)
}
Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
try {
  $zip = [IO.Compression.ZipFile]::OpenRead($payload)
  foreach ($e in $zip.Entries) {
    $dst = Join-Path $app $e.FullName
    $dir = Split-Path $dst -Parent
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if ($e.Name) { [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dst, $true) }
  }
  $zip.Dispose()
} catch {
  Write-Host ('  [안내] 파일 일부를 갱신하지 못했습니다')
  Write-Host '         이미 설치된 파일로 계속 진행합니다'
}
} else {
  $side = Join-Path (Split-Path $PSScriptRoot -Parent) 'client\dist'
  if (Test-Path $side) {
    Write-Host '  [1/4] 옆 폴더의 게임 파일을 복사하는 중...'
    New-Item -ItemType Directory -Force -Path (Join-Path $app 'client') | Out-Null
    Copy-Item $side (Join-Path $app 'client') -Recurse -Force
    foreach ($extra in @('server', 'package.json')) {
      $s = Join-Path (Split-Path $PSScriptRoot -Parent) $extra
      if (Test-Path $s) { Copy-Item $s $app -Recurse -Force }
    }
  } else {
    Write-Host '  [안내] game.zip 이 없어 파일 풀기를 건너뜁니다(나중에 직접 넣어도 됩니다)' -ForegroundColor Yellow
  }
}

# ── ③ 라이브러리 (npm 이 있고 없음은 막지 않는다) ────────────────────
$env:TEMP = Join-Path $base 'tmp'; $env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
if (-not (Test-Path (Join-Path $app 'node_modules\express'))) {
  if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    Write-Host '  [2/4] 필요한 라이브러리를 받는 중... (1~2분)'
    Push-Location $app
    # 로그 파일을 못 쓰는 환경(권한)에서도 설치가 멈추지 않게 한다
    $npmLog = Join-Path $base 'npm-install.log'
    try {
      & npm.cmd install --omit=dev --no-audit --no-fund *> $npmLog
    } catch {
      Write-Host '        [안내] 로그 파일을 쓸 수 없어 화면에 표시합니다' -ForegroundColor Yellow
      & npm.cmd install --omit=dev --no-audit --no-fund
    }
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -eq 0) { Write-Host '        완료' } else { Write-Host '        [안내] 지금은 못 받았습니다 — 실행 파일이 처음 켤 때 다시 시도합니다' -ForegroundColor Yellow }
  } else {
    Write-Host '  [2/4] [안내] npm(Node.js)이 없어 라이브러리를 못 받았습니다 — 나중에 설치해도 됩니다' -ForegroundColor Yellow
  }
} else { Write-Host '  [2/4] 라이브러리 이미 준비됨' }

# ── ④ 실행 파일 / 제거 스크립트 ─────────────────────────────────────
$launcher = Join-Path $app '게임실행.cmd'
Write-SafeFile -Path $launcher -Encoding OEM -Value @(
  '@echo off', 'cd /d "%~dp0"',
  'where node >nul 2>nul || set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs"',
  'if not exist "node_modules\express" goto :npm_install',
  'goto :run',
  ':npm_install',
  'echo First run: installing libraries... 1-2 min',
  'call npm install --omit=dev --no-audit --no-fund',
  'if errorlevel 1 (',
  '  echo npm install failed >> "%~dp0game-log.txt"',
  '  exit /b 1',
  ')',
  ':run',
  'start "" http://127.0.0.1:3001', 'node server/index.js --prod')
# ── 고른 폴더에 쓸 수 있는지 먼저 확인 — 못 쓰면(보호 폴더/권한) 안전한 기본 위치로 ──
if ($app) {
  $writeOk = $false
  try {
    New-Item -ItemType Directory -Force -Path $app -ErrorAction Stop | Out-Null
    $probe2 = Join-Path $app ('.yose-w-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
    New-Item -ItemType File -Path $probe2 -Force -ErrorAction Stop | Out-Null
    Remove-Item $probe2 -Force -ErrorAction Stop
    $writeOk = $true
  } catch { $writeOk = $false }
  if (-not $writeOk) {
    Write-Host '  [안내] 그 폴더에는 쓸 수 없습니다 (액세스 거부 — 보호된 폴더이거나 권한 없음)'
    Write-Host '         기록 저장을 위해 기본 위치에 설치합니다'
    $app = Join-Path $base 'app'
    New-Item -ItemType Directory -Force -Path $app | Out-Null
    try { Set-Content -Path (Join-Path $base 'location.txt') -Value $app -Encoding UTF8 -ErrorAction Stop } catch { Write-Host '  [안내] 설치 위치 기록은 건너뜁니다 (권한 없음)' }
  }
}
# ── 저장 파일 만들기 (설치하면서) — 이미 있으면 절대 건드리지 않는다 ──
$dbFile = Join-Path $app 'server\data\game.db'
if (Test-Path $dbFile) {
  Write-Host '  기존 저장 파일을 그대로 둡니다 (game.db)'
} else {
  New-Item -ItemType Directory -Force -Path (Join-Path $app 'server\data') | Out-Null
  if (Get-Command node -ErrorAction SilentlyContinue) {
    Push-Location $app
    & node -e "import fs from 'node:fs';import('./server/db.js').then(async(m)=>{for(const k of ['initDb','init','open','openDb','getDb','db']){if(typeof m[k]==='function'){try{await m[k]();}catch{}}}if(!fs.existsSync('./server/data/game.db')){const{DatabaseSync}=await import('node:sqlite');const d=new DatabaseSync('./server/data/game.db');d.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');d.close();}}).catch(e=>console.error(e.message))" *> (Join-Path $base 'save-init.log')
    Pop-Location
    if (Test-Path $dbFile) { Write-Host '  저장 파일을 만들었습니다 (server\data\game.db)' } else { Write-Host '  [안내] 저장 파일은 게임을 처음 켤 때 만들어집니다' -ForegroundColor Yellow }
  } else { Write-Host '  [안내] Node.js 가 없어 저장 파일은 나중에 만들어집니다' -ForegroundColor Yellow }
}
Write-Host '  [3/4] 실행 파일 준비'

Write-SafeFile -Path (Join-Path $app 'uninstall.cmd') -Encoding OEM -Value @(
  '@echo off', 'echo Removing Yose Guardian...',
  'del "%USERPROFILE%\Desktop\요세의 수호자.lnk" >nul 2>nul', 'del "%USERPROFILE%\OneDrive\바탕 화면\요세의 수호자.lnk" >nul 2>nul',
  'del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\요세의 수호자.lnk" >nul 2>nul',
  'cd /d "%TEMP%"', 'rmdir /s /q "' + $app + '"', 'echo Done.', 'pause')

$sh = New-Object -ComObject WScript.Shell
foreach ($lnk in @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) '요세의 수호자.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) '요세의 수호자.lnk')
)) {
  try { $s = $sh.CreateShortcut($lnk) } catch { Write-Host ("  [안내] 바로가기 위치에 접근하지 못했습니다: " + $lnk); continue }
  $s.TargetPath = $launcher
  $s.WorkingDirectory = $app
  $s.Description = '요새의 수호자 - 마법의 비밀'
  try { $s.Save() } catch { Write-Host ("  [안내] 바로가기를 만들지 못했습니다 (보호된 폴더) — 게임은 정상 설치되었습니다: " + $lnk) }
}
Write-Host '  [4/4] 바탕화면 · 시작메뉴 바로가기 생성'

Write-Host ''
Write-Host '  설치 완료!' -ForegroundColor Green
Write-Host "  설치 위치: $app"
Write-Host '  바탕화면의 [요세의 수호자] 로 실행하세요.'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '  [안내] Node.js 22 이상이 필요합니다 - https://nodejs.org' -ForegroundColor Yellow
}
Start-Sleep -Seconds 2

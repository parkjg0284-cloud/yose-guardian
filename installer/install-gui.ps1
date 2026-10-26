param(
  [string]$Path = '',
  [switch]$Silent,
  [switch]$SelfTest
)

# ── 요세의 수호자 설치 클라이언트 ─────────────────────────────────────
# 창에서 설치 위치를 고르고, 진행 상황을 보면서 설치한다.
# -Silent -Path <폴더> 로 부르면 창 없이 그 위치에 설치한다(자동 검증용).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$here    = $PSScriptRoot
$payload = Join-Path $here 'game.zip'
$base    = Join-Path $env:LOCALAPPDATA 'YoseGuardian'
$script:app     = ''
$script:busy    = $false
$script:logText = ''
$script:failed  = @()

function Write-Log([string]$line) {
  $script:logText += ($line + "`r`n")
  if ($script:logBox) { $script:logBox.Text = $script:logText; $script:logBox.SelectionStart = $script:logBox.Text.Length; $script:logBox.ScrollToCaret(); [System.Windows.Forms.Application]::DoEvents() }
}

function Step([string]$name, [bool]$ok) {
  if ($ok) { Write-Log ("  [OK]   " + $name) } else { Write-Log ("  [실패] " + $name); $script:failed += $name }
}

# ── 실제 설치 (창 없이도 쓸 수 있게 분리) ─────────────────────────────
# 설치 본체는 install.ps1 하나만 쓴다(검증된 경로 재사용)
function Install-Game([string]$target, [scriptblock]$progress) {
  if ($progress) { & $progress 20 '게임 파일을 풀고 라이브러리를 준비하는 중... (1~2분)' }
  $out = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'install.ps1') -Path $target -Silent 2>&1
  foreach ($line in $out) { Write-Log ('  ' + ([string]$line).TrimEnd()) }
  if ($progress) { & $progress 90 '바로가기 확인 중...' }
  $script:app = $target
  $ok = (Test-Path (Join-Path $target 'client\dist\index.html')) -and (Test-Path (Join-Path $target '게임실행.cmd'))
  Step '게임 설치' $ok
  return $ok
}

function Install-Game_Legacy([string]$target, [scriptblock]$progress) {
  $script:failed = @()
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  New-Item -ItemType Directory -Force -Path $base | Out-Null
  Set-Content -Path (Join-Path $base 'location.txt') -Value $target -Encoding UTF8
  Write-Log ("설치 위치: " + $target)

  if ($progress) { & $progress 10 '게임 파일을 푸는 중...' }
  if (Test-Path $payload) { Expand-Archive -Path $payload -DestinationPath $target -Force }
  Step '게임 파일 풀기' (Test-Path (Join-Path $target 'client\dist\index.html'))

  if ($progress) { & $progress 40 '필요한 라이브러리를 받는 중... (1~2분)' }
  $env:TEMP = Join-Path $base 'tmp'; $env:TMP = $env:TEMP
  New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
  if (-not (Test-Path (Join-Path $target 'node_modules\express'))) {
    if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
      Push-Location $target
      & npm.cmd install --omit=dev --no-audit --no-fund *> (Join-Path $base 'npm-install.log')
      Pop-Location
    }
  }
  Step '라이브러리 준비' (Test-Path (Join-Path $target 'node_modules\express'))

  if ($progress) { & $progress 70 '저장 파일을 준비하는 중...' }
  $dbFile = Join-Path $target 'server\data\game.db'
  if (Test-Path $dbFile) { Write-Log '  기존 저장 파일을 그대로 둡니다' }
  elseif (Get-Command node -ErrorAction SilentlyContinue) {
    New-Item -ItemType Directory -Force -Path (Join-Path $target 'server\data') | Out-Null
    Push-Location $target
    & node -e "import('./server/db.js').then(()=>console.log('ok')).catch(e=>console.error(e.message))" *> (Join-Path $base 'save-init.log')
    Pop-Location
  }
  Step '저장 파일(game.db)' (Test-Path $dbFile)

  if ($progress) { & $progress 85 '실행 파일과 바로가기를 만드는 중...' }
  $launcher = Join-Path $target '게임실행.cmd'
  Set-Content -Path $launcher -Encoding OEM -Value @(
    '@echo off', 'cd /d "%~dp0"',
    'where node >nul 2>nul || (echo [!] Node.js 22+ is required - https://nodejs.org & pause & exit /b 1)',
    'if not exist "node_modules\express" (echo First run: installing libraries... (1-2 min) & call npm install --omit=dev --no-audit --no-fund || (echo npm install failed & pause & exit /b 1))',
    'set "GAME_PORT=3001"',
    'if exist ".env" for /f "usebackq tokens=1,* delims==" %%A in (".env") do if /i "%%A"=="PORT" set "GAME_PORT=%%B"',
    'start "" http://127.0.0.1:%GAME_PORT%', 'node server/index.js')
  Set-Content -Path (Join-Path $target 'uninstall.cmd') -Encoding OEM -Value @(
    '@echo off', 'echo Removing Yose Guardian...',
    'del "%USERPROFILE%\Desktop\요세의 수호자.lnk" >nul 2>nul',
    'del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\요세의 수호자.lnk" >nul 2>nul',
    'cd /d "%TEMP%"', 'rmdir /s /q "' + $target + '"', 'echo Done.', 'pause')
  $sh = New-Object -ComObject WScript.Shell
  foreach ($lnk in @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) '요세의 수호자.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) '요세의 수호자.lnk')
  )) {
    $s = $sh.CreateShortcut($lnk); $s.TargetPath = $launcher; $s.WorkingDirectory = $target
    $s.Description = '요새의 수호자 - 마법의 비밀'; $s.Save()
  }
  Step '바탕화면 · 시작메뉴 바로가기' ((Test-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) '요세의 수호자.lnk')))
  $script:app = $target
  return ($script:failed.Count -eq 0)
}

# ── 무인 설치 모드 (자동 검증용) ──────────────────────────────────────
if ($Path) {
  $t = if ($Silent) { $Path } else { $Path }
  Write-Host "설치 위치: $t"
  $ok = Install-Game $t $null
  Write-Host $script:logText
  if ($ok) { Write-Host '설치 완료'; exit 0 } else { Write-Host ('설치 실패: ' + ($script:failed -join ', ')); exit 1 }
}

# ── 창 만들기 ────────────────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = '요새의 수호자 — 설치'
$form.Size = New-Object System.Drawing.Size(760, 560)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [System.Drawing.Color]::FromArgb(12, 14, 24)
$form.ForeColor = [System.Drawing.Color]::FromArgb(240, 232, 210)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false

$title = New-Object System.Windows.Forms.Label
$title.Text = '요새의 수호자 — 마법의 비밀'
$title.Font = New-Object System.Drawing.Font('Malgun Gothic', 18, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::FromArgb(255, 206, 120)
$title.Location = New-Object System.Drawing.Point(24, 20)
$title.Size = New-Object System.Drawing.Size(700, 40)
$form.Controls.Add($title)

$desc = New-Object System.Windows.Forms.Label
$desc.Text = '설치할 폴더를 고르고 [설치] 를 누르세요. 그 폴더 안에 요세의수호자 폴더를 만듭니다.'
$desc.Font = New-Object System.Drawing.Font('Malgun Gothic', 10)
$desc.ForeColor = [System.Drawing.Color]::FromArgb(190, 195, 215)
$desc.Location = New-Object System.Drawing.Point(26, 62)
$desc.Size = New-Object System.Drawing.Size(700, 24)
$form.Controls.Add($desc)

$pathBox = New-Object System.Windows.Forms.TextBox
$pathBox.Text = $env:USERPROFILE
$pathBox.Font = New-Object System.Drawing.Font('Malgun Gothic', 10)
$pathBox.Location = New-Object System.Drawing.Point(26, 96)
$pathBox.Size = New-Object System.Drawing.Size(560, 26)
$form.Controls.Add($pathBox)

$browse = New-Object System.Windows.Forms.Button
$browse.Text = '찾아보기...'
$browse.Location = New-Object System.Drawing.Point(596, 95)
$browse.Size = New-Object System.Drawing.Size(130, 28)
$browse.Add_Click({
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = '설치할 폴더를 고르세요'
  $dlg.SelectedPath = $pathBox.Text
  if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $pathBox.Text = $dlg.SelectedPath }
})
$form.Controls.Add($browse)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = New-Object System.Drawing.Point(26, 134)
$bar.Size = New-Object System.Drawing.Size(700, 18)
$bar.Style = 'Continuous'
$form.Controls.Add($bar)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ScrollBars = 'Vertical'
$logBox.ReadOnly = $true
$logBox.BackColor = [System.Drawing.Color]::FromArgb(8, 10, 18)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(200, 220, 200)
$logBox.Font = New-Object System.Drawing.Font('Consolas', 9)
$logBox.Location = New-Object System.Drawing.Point(26, 162)
$logBox.Size = New-Object System.Drawing.Size(700, 260)
$form.Controls.Add($logBox)
$script:logBox = $logBox

$installBtn = New-Object System.Windows.Forms.Button
$installBtn.Text = '설치'
$installBtn.Font = New-Object System.Drawing.Font('Malgun Gothic', 12, [System.Drawing.FontStyle]::Bold)
$installBtn.Location = New-Object System.Drawing.Point(26, 436)
$installBtn.Size = New-Object System.Drawing.Size(180, 46)
$installBtn.BackColor = [System.Drawing.Color]::FromArgb(255, 196, 92)
$installBtn.FlatStyle = 'Flat'
$form.Controls.Add($installBtn)

$startBtn = New-Object System.Windows.Forms.Button
$startBtn.Text = '게임 시작'
$startBtn.Font = New-Object System.Drawing.Font('Malgun Gothic', 12, [System.Drawing.FontStyle]::Bold)
$startBtn.Location = New-Object System.Drawing.Point(216, 436)
$startBtn.Size = New-Object System.Drawing.Size(180, 46)
$startBtn.Enabled = $false
$form.Controls.Add($startBtn)

$closeBtn = New-Object System.Windows.Forms.Button
$closeBtn.Text = '닫기'
$closeBtn.Location = New-Object System.Drawing.Point(606, 436)
$closeBtn.Size = New-Object System.Drawing.Size(120, 46)
$closeBtn.Add_Click({ $form.Close() })
$form.Controls.Add($closeBtn)

$installBtn.Add_Click({
  if ($script:busy) { return }
  $script:busy = $true
  $installBtn.Enabled = $false; $browse.Enabled = $false; $pathBox.Enabled = $false; $startBtn.Enabled = $false
  $script:logText = ''; $logBox.Text = ''
  $target = Join-Path $pathBox.Text '요세의수호자'
  try {
    # 쓸 수 있는 폴더인지 먼저 확인 — 못 쓰면 기록이 저장되지 않으므로 기본 위치로
    $probe = Join-Path $pathBox.Text ('.yose-test-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
    New-Item -ItemType File -Path $probe -Force | Out-Null
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
  } catch {
    Write-Log '  [안내] 그 폴더에는 쓸 수 없습니다 — 기본 위치에 설치합니다'
    $target = Join-Path $base 'app'
  }
  $progress = { param($p, $m) $bar.Value = $p; Write-Log ('▶ ' + $m) }
  $ok = Install-Game $target $progress
  $bar.Value = 100
  if ($ok) {
    Write-Log ''
    Write-Log '✅ 설치 완료! [게임 시작] 을 누르면 게임이 열립니다.'
    $startBtn.Enabled = $true
    $installBtn.Text = '다시 설치'
  } else {
    Write-Log ''
    Write-Log ('⚠ 일부 단계가 실패했습니다: ' + ($script:failed -join ', '))
  }
  $installBtn.Enabled = $true; $browse.Enabled = $true; $pathBox.Enabled = $true
  $script:busy = $false
})
$form.Controls.Add($installBtn)

$startBtn.Add_Click({
  $launcher = Join-Path $script:app '게임실행.cmd'
  if (Test-Path $launcher) { Start-Process $launcher } else { Write-Log '  실행 파일을 찾지 못했습니다' }
})

if ($SelfTest) {
  $need = @('title', 'desc', 'pathBox', 'browse', 'bar', 'logBox', 'installBtn', 'startBtn', 'closeBtn')
  $missing = @($need | Where-Object { -not (Get-Variable -Name $_ -Scope 0 -ErrorAction SilentlyContinue) })
  Write-Host ("  컨트롤 " + $form.Controls.Count + "개 · 누락 " + $missing.Count + "개")
  Write-Host ("  창 크기 " + $form.Size.Width + "x" + $form.Size.Height + " · 버튼: " + $installBtn.Text + " / " + $startBtn.Text + " / " + $closeBtn.Text)
  if ($missing.Count) { Write-Host ('  X 누락: ' + ($missing -join ', ')); exit 1 }
  Write-Host '  OK GUI 구성 정상'; exit 0
}
Write-Log '설치할 폴더를 고르고 [설치] 를 누르세요.'
Write-Log ('기본 제안: ' + $pathBox.Text + '\요세의수호자')
[void]$form.ShowDialog()

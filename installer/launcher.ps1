param(
  [string]$Url = '',
  [string]$Path = '',
  [switch]$Silent,
  [switch]$SelfTest
)

# ── 요세의 수호자 다운로드 런처 ──────────────────────────────────────
# 주소에서 게임 파일(game.zip)을 내려받아 설치한다. 주소가 없으면 함께 들어 있는 파일을 쓴다.
# -Url <주소> -Path <폴더> -Silent 로 부르면 창 없이 내려받아 설치한다(자동 검증용).
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.Windows.Forms.Application]::EnableVisualStyles()

$here = $PSScriptRoot
$conf = Join-Path $here 'launcher.json'
$base = Join-Path $env:LOCALAPPDATA 'YoseGuardian'
$script:logText = ''
$script:app = ''
$script:busy = $false
$script:failed = @()

function Write-Log([string]$line) {
  $script:logText += ($line + "`r`n")
  if ($script:logBox) {
    $script:logBox.Text = $script:logText
    $script:logBox.SelectionStart = $script:logBox.Text.Length
    $script:logBox.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
  } else { Write-Host $line }
}

function Get-DefaultUrl {
  if ($Url) { return $Url }
  if (Test-Path $conf) {
    try {
      $j = Get-Content $conf -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($j.url) { return [string]$j.url }
    } catch { }
  }
  return ''
}

# ── 업데이트 내역 (launcher\updates.json) ──────────────────────────────
function Get-Updates {
  $path = Join-Path $here 'updates.json'
  if (-not (Test-Path $path)) { return @() }
  try {
    $j = Get-Content $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.entries) { return @($j.entries) }
  } catch { }
  return @()
}

function Get-UpdatesText {
  $entries = @(Get-Updates)
  if (-not $entries.Count) { return '업데이트 내역이 없습니다.' }
  $lines = @('요세의 수호자 — 업데이트 내역', '')
  foreach ($e in $entries) {
    $lines += ('v' + $e.version + '   ' + $e.date + '   ' + $e.title)
    foreach ($n in @($e.notes)) { $lines += ('  · ' + $n) }
    $lines += ''
  }
  return ($lines -join "`r`n")
}

function Show-Updates {
  $f = New-Object System.Windows.Forms.Form
  $f.Text = '요세의 수호자 — 업데이트 내역'
  $f.Size = New-Object System.Drawing.Size(760, 620)
  $f.StartPosition = 'CenterParent'
  $f.BackColor = [System.Drawing.Color]::FromArgb(255, 218, 185)
  $f.ForeColor = [System.Drawing.Color]::FromArgb(74, 46, 30)
  $box = New-Object System.Windows.Forms.TextBox
  $box.Multiline = $true
  $box.ReadOnly = $true
  $box.ScrollBars = 'Vertical'
  $box.Font = New-Object System.Drawing.Font('Malgun Gothic', 10)
  $box.BackColor = [System.Drawing.Color]::FromArgb(255, 246, 236)
  $box.ForeColor = [System.Drawing.Color]::FromArgb(74, 46, 30)
  $box.Location = New-Object System.Drawing.Point(20, 20)
  $box.Size = New-Object System.Drawing.Size(706, 500)
  $box.Text = Get-UpdatesText
  $f.Controls.Add($box)
  $close = New-Object System.Windows.Forms.Button
  $close.Text = '닫기'
  $close.Location = New-Object System.Drawing.Point(606, 532)
  $close.Size = New-Object System.Drawing.Size(120, 36)
  $close.Add_Click({ $f.Close() })
  $f.Controls.Add($close)
  [void]$f.ShowDialog()
}

# ── 내려받기: 주소 → 임시 파일 (진행률 콜백) ─────────────────────────
function Download-Package([string]$url, [scriptblock]$onProgress) {
  try { $null = Invoke-WebRequest -Uri $url -Method Head -TimeoutSec 3 -UseBasicParsing } catch { Write-Log '  [안내] 서버에 연결할 수 없어 함께 들어 있는 게임 파일로 설치합니다'; return '' }
  $dest = Join-Path $env:TEMP 'yose-download.zip'
  Remove-Item $dest -Force -ErrorAction SilentlyContinue
  if (-not $url) { Write-Log '  주소가 없어 함께 들어 있는 게임 파일을 씁니다'; return '' }
  Write-Log ('  내려받는 중: ' + $url)
  $wc = New-Object System.Net.WebClient
  if ($onProgress) {
    $wc.add_DownloadProgressChanged({ param($s, $e) & $onProgress $e.ProgressPercentage ($e.BytesReceived) ($e.TotalBytesToReceive) })
  }
  try { $wc.DownloadFile($url, $dest) } catch { Write-Log ('  [안내] 내려받기 실패: ' + $_.Exception.Message + ' — 함께 들어 있는 파일로 진행합니다'); return '' }
  $wc.Dispose()
  if (Test-Path $dest) {
    $valid = $false
    try { $z = [IO.Compression.ZipFile]::OpenRead($dest); $valid = ($z.Entries.Count -gt 5); $z.Dispose() } catch { $valid = $false }
    if (-not $valid) { Write-Log '  [안내] 서버에서 받은 파일이 게임 파일이 아니어서 함께 들어 있는 파일로 설치합니다 — 함께 들어 있는 파일로 진행합니다'; Remove-Item $dest -Force -ErrorAction SilentlyContinue; return '' }
    Write-Log ('  내려받기 완료: ' + [Math]::Round((Get-Item $dest).Length / 1MB, 2) + 'MB (검증됨)')
    return $dest
  }
  Write-Log '  [안내] 내려받지 못했습니다 — 함께 들어 있는 파일로 진행합니다'
  return ''
}

# ── 설치 (검증된 install.ps1 에 위임) ────────────────────────────────
function Install-From([string]$zip, [string]$target, [scriptblock]$progress) {
  if ($progress) { & $progress 60 '게임 파일을 풀고 준비하는 중... (1~2분)' }
  $args = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $here 'install.ps1'), '-Path', $target, '-Silent')
  if ($zip) { try { Copy-Item $zip (Join-Path $here 'game.zip') -Force; Write-Log '  내려받은 파일을 설치 묶음으로 교체' } catch { Write-Log '  [안내] 내려받은 파일을 쓸 수 없어 함께 들어 있는 파일로 설치합니다' } }
  $out = & powershell @args 2>&1
  foreach ($line in $out) { Write-Log ('  ' + ([string]$line).TrimEnd()) }
  $script:app = $target
  $ok = (Test-Path (Join-Path $target 'client\dist\index.html')) -and (Test-Path (Join-Path $target '게임실행.cmd'))
  if ($ok) { Write-Log '  [OK] 게임 설치' } else { Write-Log '  [실패] 게임 설치'; $script:failed += '게임 설치' }
  return $ok
}

# ── 무인 모드 (자동 검증용) ──────────────────────────────────────────
if ($Path) {
  $zip = Download-Package (Get-DefaultUrl) $null
  $ok = Install-From $zip $Path $null
  Write-Host $script:logText
  if ($ok) { Write-Host '런처: 설치 완료'; exit 0 } else { Write-Host ('런처: 실패 — ' + ($script:failed -join ', ')); exit 1 }
}

# ── 창 ───────────────────────────────────────────────────────────────
$GOLD = [System.Drawing.Color]::FromArgb(120, 60, 20)
$form = New-Object System.Windows.Forms.Form
$form.Text = '요세의 수호자 — 다운로드 런처'
$form.Size = New-Object System.Drawing.Size(820, 700)
$form.StartPosition = 'CenterScreen'
$form.BackColor = [System.Drawing.Color]::FromArgb(255, 218, 185)
$form.ForeColor = [System.Drawing.Color]::FromArgb(74, 46, 30)
$form.FormBorderStyle = 'Sizable'
$form.MinimumSize = New-Object System.Drawing.Size(720, 660)
$form.AutoScaleMode = 'None'   # 배율 때문에 컨트롤만 커져서 잘리는 것 방지
$form.MaximizeBox = $false

$title = New-Object System.Windows.Forms.Label
$title.Text = '요세의 수호자'
$title.Font = New-Object System.Drawing.Font('Malgun Gothic', 22, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = $GOLD
$title.Location = New-Object System.Drawing.Point(26, 18)
$title.Size = New-Object System.Drawing.Size(720, 46)
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = '마법의 비밀 — 다운로드 런처'
$sub.Font = New-Object System.Drawing.Font('Malgun Gothic', 11)
$sub.ForeColor = [System.Drawing.Color]::FromArgb(105, 70, 45)
$sub.Location = New-Object System.Drawing.Point(28, 62)
$sub.Size = New-Object System.Drawing.Size(720, 24)
$form.Controls.Add($sub)

$urlLabel = New-Object System.Windows.Forms.Label
$urlLabel.Text = '다운로드 주소'
$urlLabel.Location = New-Object System.Drawing.Point(28, 100)
$urlLabel.Size = New-Object System.Drawing.Size(120, 20)
$form.Controls.Add($urlLabel)

$urlBox = New-Object System.Windows.Forms.TextBox
$urlBox.Text = Get-DefaultUrl
$urlBox.Location = New-Object System.Drawing.Point(28, 122)
$urlBox.Size = New-Object System.Drawing.Size(748, 26)
$urlBox.Font = New-Object System.Drawing.Font('Consolas', 9)
$form.Controls.Add($urlBox)

$pathLabel = New-Object System.Windows.Forms.Label
$pathLabel.Text = '설치할 폴더 (그 안에 요세의수호자 폴더를 만듭니다)'
$pathLabel.Location = New-Object System.Drawing.Point(28, 158)
$pathLabel.Size = New-Object System.Drawing.Size(400, 20)
$form.Controls.Add($pathLabel)

$pathBox = New-Object System.Windows.Forms.TextBox
$pathBox.Text = $env:LOCALAPPDATA
$pathBox.Location = New-Object System.Drawing.Point(28, 180)
$pathBox.Size = New-Object System.Drawing.Size(608, 26)
$form.Controls.Add($pathBox)

$browse = New-Object System.Windows.Forms.Button
$browse.Text = '찾아보기...'
$browse.Location = New-Object System.Drawing.Point(652, 179)
$browse.Size = New-Object System.Drawing.Size(132, 28)
$browse.Add_Click({
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = '설치할 폴더를 고르세요'
  $dlg.SelectedPath = $pathBox.Text
  if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $pathBox.Text = $dlg.SelectedPath }
})
$form.Controls.Add($browse)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.Location = New-Object System.Drawing.Point(28, 218)
$bar.Size = New-Object System.Drawing.Size(748, 18)
$bar.Style = 'Continuous'
$form.Controls.Add($bar)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ScrollBars = 'Vertical'
$logBox.ReadOnly = $true
$logBox.BackColor = [System.Drawing.Color]::FromArgb(6, 8, 16)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(200, 224, 200)
$logBox.Font = New-Object System.Drawing.Font('Consolas', 9)
$logBox.Location = New-Object System.Drawing.Point(28, 246)
$logBox.Size = New-Object System.Drawing.Size(748, 296)
$form.Controls.Add($logBox)
$script:logBox = $logBox

$dlBtn = New-Object System.Windows.Forms.Button
$dlBtn.Text = '다운로드 & 설치'
$dlBtn.Font = New-Object System.Drawing.Font('Malgun Gothic', 12, [System.Drawing.FontStyle]::Bold)
$dlBtn.Location = New-Object System.Drawing.Point(28, 570)
$dlBtn.Size = New-Object System.Drawing.Size(220, 46)
$dlBtn.BackColor = $GOLD
$dlBtn.FlatStyle = 'Flat'
$dlBtn.ForeColor = [System.Drawing.Color]::FromArgb(255, 243, 230)
$form.Controls.Add($dlBtn)

$reChk = New-Object System.Windows.Forms.CheckBox
$reChk.Text = '재설치'
$reChk.Font = New-Object System.Drawing.Font('Malgun Gothic', 10)
$reChk.Location = New-Object System.Drawing.Point(452, 578)
$reChk.Size = New-Object System.Drawing.Size(180, 30)
$reChk.ForeColor = [System.Drawing.Color]::FromArgb(74, 46, 30)
$reChk.Visible = $false
$form.Controls.Add($reChk)
$startBtn = New-Object System.Windows.Forms.Button
$startBtn.Text = '게임 시작'
$startBtn.Font = New-Object System.Drawing.Font('Malgun Gothic', 12, [System.Drawing.FontStyle]::Bold)
$startBtn.Location = New-Object System.Drawing.Point(258, 570)
$startBtn.Size = New-Object System.Drawing.Size(180, 46)
$startBtn.Enabled = $false
$startBtn.ForeColor = [System.Drawing.Color]::FromArgb(74, 46, 30)
$form.Controls.Add($startBtn)

$closeBtn = New-Object System.Windows.Forms.Button
$closeBtn.Text = '닫기'
$closeBtn.Location = New-Object System.Drawing.Point(652, 570)
$closeBtn.Size = New-Object System.Drawing.Size(132, 46)
$closeBtn.Add_Click({ $form.Close() })
$form.Controls.Add($closeBtn)

$updatesBtn = New-Object System.Windows.Forms.Button
$updatesBtn.Text = '업데이트 내역'
$updatesBtn.Location = New-Object System.Drawing.Point(448, 570)
$updatesBtn.Size = New-Object System.Drawing.Size(184, 46)
$updatesBtn.Add_Click({ Show-Updates })
$form.Controls.Add($updatesBtn)

$dlBtn.Add_Click({
  if ($installed -and -not $reChk.Checked) { Write-Log '  이미 설치되어 있습니다 — 다시 설치하려면 [재설치] 를 체크하세요'; return }
  if ($script:busy) { return }
  $script:busy = $true
  $dlBtn.Enabled = $false; $browse.Enabled = $false; $urlBox.Enabled = $false; $pathBox.Enabled = $false; $startBtn.Enabled = $false
$startBtn.ForeColor = [System.Drawing.Color]::FromArgb(74, 46, 30)
  $script:logText = ''; $logBox.Text = ''; $bar.Value = 0
  $target = Join-Path $pathBox.Text '요세의수호자'
  try {
    $probe = Join-Path $pathBox.Text ('.yose-test-' + [guid]::NewGuid().ToString('N').Substring(0, 6))
    New-Item -ItemType File -Path $probe -Force | Out-Null
    Remove-Item $probe -Force -ErrorAction SilentlyContinue
  } catch {
    Write-Log '  [안내] 그 폴더에는 쓸 수 없습니다 — 기본 위치에 설치합니다'
    $target = Join-Path $base 'app'
  }
  try {
    $onP = { param($p, $recv, $total) $bar.Value = [Math]::Min(55, [int]($p * 0.55)); [System.Windows.Forms.Application]::DoEvents() }
    $zip = Download-Package $urlBox.Text $onP
    $ok = Install-From $zip $target ({ param($p, $m) $bar.Value = $p; Write-Log ('▶ ' + $m) })
    $bar.Value = 100
    if ($ok) { Write-Log ''; Write-Log '✅ 설치 완료! [게임 시작] 을 누르면 게임이 열립니다.'; $startBtn.Enabled = $true; $installed = $true; $dlBtn.Enabled = $false; $dlBtn.Text = '설치 완료'; $reChk.Visible = $true; $reChk.Checked = $false; $dlBtn.Text = '다시 받기' }
    else { Write-Log ''; Write-Log ('⚠ 일부 단계 실패: ' + ($script:failed -join ', ')) }
  } catch {
    Write-Log ('  [오류] ' + $_.Exception.Message)
  }
  $dlBtn.Enabled = $true; $browse.Enabled = $true; $urlBox.Enabled = $true; $pathBox.Enabled = $true
  $script:busy = $false
})
$form.Controls.Add($dlBtn)

$startBtn.Add_Click({
  # 설치 위치를 스스로 찾는다
      $cands = @()
      $loc = Join-Path $env:LOCALAPPDATA 'YoseGuardian\location.txt'
      if (Test-Path $loc) { $cands += (Get-Content $loc -Raw).Trim() }
      if ($pathBox.Text) { $cands += $pathBox.Text; $cands += (Join-Path $pathBox.Text '요세의수호자') }
      $cands += (Join-Path $env:LOCALAPPDATA 'YoseGuardian\app')
      $dir = $cands | Where-Object { $_ -and (Test-Path (Join-Path $_ 'server\index.js')) } | Select-Object -First 1
      if (-not $dir) { Write-Log '  [안내] 게임이 설치된 곳을 찾지 못했습니다 — 먼저 [다운로드 & 설치] 를 눌러주세요'; return }
      $cmdFile = Join-Path $dir '게임실행.cmd'
      if (Test-Path $cmdFile) { Start-Process -FilePath $cmdFile -WorkingDirectory $dir } else {
        Start-Process -FilePath 'node.exe' -ArgumentList 'server/index.js' -WorkingDirectory $dir -WindowStyle Hidden
        Start-Sleep -Seconds 3
        $port = 3001
        $envFile = Join-Path $dir '.env'
        if (Test-Path $envFile) {
          $line = Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -Last 1
          if ($line -match '=\s*[''"]?(\d+)[''"]?\s*$') { $port = [int]$Matches[1] }
        }
        Start-Process "http://127.0.0.1:$port"
      }
      Write-Log ('  게임 실행: ' + $dir)
})

if ($SelfTest) {
  # ── 이미 설치되어 있으면: [게임 시작] 켜기 · [다운로드 & 설치] 잠그기 ──
  $installed = $false
  $cands = @()
  $loc = Join-Path $env:LOCALAPPDATA 'YoseGuardian\location.txt'
  if (Test-Path $loc) { $cands += (Get-Content $loc -Raw).Trim() }
  $cands += (Join-Path $env:LOCALAPPDATA 'YoseGuardian\app')
  foreach ($c in $cands) { if ($c -and (Test-Path (Join-Path $c 'server\index.js'))) { $installed = $true; $found = $c; break } }
  if ($installed) {
    $startBtn.Enabled = $true; $installed = $true; $dlBtn.Enabled = $false; $dlBtn.Text = '설치 완료'; $reChk.Visible = $true; $reChk.Checked = $false
    $dlBtn.Enabled = $false
    $dlBtn.Text = '설치 완료'
    $reChk.Visible = $true
    Write-Log ('  설치된 게임을 찾았습니다: ' + $found)
    Write-Log '  [게임 시작] 을 누르면 실행됩니다. 다시 설치하려면 [재설치] 를 체크하세요.'
  }
  $reChk.Add_Click({ $dlBtn.Enabled = ($reChk.Checked -or (-not $installed)); if ($reChk.Checked) { $dlBtn.Text = '다운로드 & 설치' } else { $dlBtn.Text = '설치 완료' } })
  $need = @('title', 'sub', 'urlBox', 'pathBox', 'browse', 'bar', 'logBox', 'dlBtn', 'startBtn', 'updatesBtn', 'closeBtn')
  $missing = @($need | Where-Object { -not (Get-Variable -Name $_ -Scope 0 -ErrorAction SilentlyContinue) })
  Write-Host ('  컨트롤 ' + $form.Controls.Count + '개 · 누락 ' + $missing.Count + '개 · 창 ' + $form.Size.Width + 'x' + $form.Size.Height)
  Write-Host ('  버튼: ' + $dlBtn.Text + ' / ' + $startBtn.Text + ' / ' + $updatesBtn.Text + ' / ' + $closeBtn.Text)
  Write-Host ('  업데이트 내역: ' + @(Get-Updates).Count + '개 버전 · ' + (Get-UpdatesText).Length + '자')
  if ($missing.Count) { Write-Host ('  X 누락: ' + ($missing -join ', ')); exit 1 }
  Write-Host '  OK 런처 구성 정상'; exit 0
}

# ── 비율 유지: 창을 늘려도 배치가 따라가게 ──
$title.Anchor = 'Top,Left,Right'; $sub.Anchor = 'Top,Left,Right'
$urlLabel.Anchor = 'Top,Left'; $urlBox.Anchor = 'Top,Left,Right'
$pathLabel.Anchor = 'Top,Left'; $pathBox.Anchor = 'Top,Left,Right'
$browse.Anchor = 'Top,Right'; $bar.Anchor = 'Top,Left,Right'
$logBox.Anchor = 'Top,Bottom,Left,Right'
$dlBtn.Anchor = 'Bottom,Left'; $startBtn.Anchor = 'Bottom,Left'; $updatesBtn.Anchor = 'Bottom,Left'; $closeBtn.Anchor = 'Bottom,Right'
Write-Log '주소를 확인하고 [다운로드 & 설치] 를 누르세요.'
$latest = @(Get-Updates) | Select-Object -First 1
if ($latest) {
  Write-Log ('최신 업데이트 — v' + $latest.version + ' · ' + $latest.title)
  Write-Log '  전체 내역은 [업데이트 내역] 버튼에서 확인할 수 있습니다.'
}
if (-not (Get-DefaultUrl)) { Write-Log '  (주소가 비어 있으면 함께 들어 있는 게임 파일로 설치합니다)' }
[void]$form.ShowDialog()

param(
  [string]$Url = '',
  [string]$Path = '',
  [switch]$Silent,
  [switch]$SelfTest,
  [switch]$StateCheck,
  [switch]$Launcher,
  [string]$Zip = '',
  [string]$DumpControls = ''
)

# ── 요세의 수호자 다운로더 ───────────────────────────────────────────────
#  최신 릴리스의 game.zip 을 내려받아 설치하고 바로 실행한다.
#  · 창(GUI): [최신 버전 설치] · [설치 폴더 열기] · [게임 실행]
#  · -Silent -Path <폴더>: 창 없이 설치(자동 검증용)
#  · -SelfTest: 내장 game.zip 으로 설치만 확인하고 결과를 출력
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.Windows.Forms.Application]::EnableVisualStyles()

$here = $PSScriptRoot
$conf = Join-Path $here 'downloader.json'
$repoApi = 'https://api.github.com/repos/parkjg0284-cloud/yose-guardian/releases/latest'
$repoZip = 'https://github.com/parkjg0284-cloud/yose-guardian/releases/latest/download/game.zip'
$app = if ($Path) { [IO.Path]::GetFullPath($Path) } else { Join-Path $env:LOCALAPPDATA 'YoseGuardian\app' }
$script:bundledTag = ''

if (Test-Path $conf) {
  try {
    $j = Get-Content $conf -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.api) { $repoApi = [string]$j.api }
    if ($j.url) { $repoZip = [string]$j.url }
    if ($j.tag) { $script:bundledTag = [string]$j.tag }
  } catch { }
}

$script:logText = ''
$script:busy = $false
# 런처 모드 — 같은 엔진으로 '게임 다운로드 & 시작' 창을 띄운다(YoseGuardian-Launcher.exe)
$script:isLauncher = [bool]$Launcher
$appName = if ($script:isLauncher) { '요세의 수호자 런처' } else { '요세의 수호자 다운로더' }
$installLabel = if ($script:isLauncher) { '게임 다운로드 & 설치' } else { '최신 버전 설치' }
$playLabel = if ($script:isLauncher) { '게임 시작' } else { '게임 실행' }

# 설치 파일 직접 선택 — 비어 있으면 최신 릴리스(game.zip)를 자동으로 내려받는다
$script:selectedZip = ''
if ($Zip) { try { $script:selectedZip = [IO.Path]::GetFullPath($Zip) } catch { } }

function Write-Log([string]$line) {
  $script:logText += ($line + "`r`n")
  if ($script:logBox) {
    $script:logBox.Text = $script:logText
    $script:logBox.SelectionStart = $script:logBox.Text.Length
    $script:logBox.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
  } else {
    Write-Host $line
  }
}

# 설치 폴더에 남기는 버전 표식 — 지우면 '설치 안 됨' 으로 돌아가 [설치] 버튼이 다시 보인다
$versionFile = Join-Path $app '.yose-version'

function Get-InstalledTag {
  if (-not (Test-Path (Join-Path $app 'server\index.js'))) { return $null }
  if (Test-Path $versionFile) {
    try {
      $raw = (Get-Content $versionFile -Raw -Encoding UTF8).Trim()
      if ($raw) {
        if ($raw.StartsWith('{')) {
          $j = $raw | ConvertFrom-Json
          if ($j.tag) { return [string]$j.tag }
        } else { return $raw }
      }
    } catch { }
  }
  return '이전 버전'
}

function Set-InstalledTag([string]$tag) {
  if (-not $tag) { $tag = '내장판' }
  try {
    New-Item -ItemType Directory -Force -Path $app | Out-Null
    Set-Content -Path $versionFile -Value $tag -Encoding UTF8
  } catch { }
}

function Get-InstalledVersion {
  $tag = Get-InstalledTag
  if (-not $tag) { return '설치 안 됨' }
  return $tag
}

function Get-BundledTag { if ($script:bundledTag) { return $script:bundledTag } return '내장판' }

# 선택한 파일이 게임 패키지인지 확인 — server/index.js · client/dist/index.html 이 있어야 한다
function Test-GameZip([string]$path) {
  if (-not $path -or -not (Test-Path $path)) { return $false }
  try {
    $z = [IO.Compression.ZipFile]::OpenRead($path)
    try {
      $names = @($z.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
      return (($names -contains 'server/index.js') -and ($names -contains 'client/dist/index.html'))
    } finally { $z.Dispose() }
  } catch { return $false }
}

# 선택한 파일의 버전 표식 — 내장 판과 같은 파일이면 최신 태그, 아니면 .yose-version, 아니면 '직접 설치'
function Get-SelectedTag([string]$path) {
  $bundled = Join-Path $here 'game.zip'
  try {
    if ((Test-Path $bundled) -and ((Get-FileHash $path -Algorithm SHA256).Hash -eq (Get-FileHash $bundled -Algorithm SHA256).Hash)) {
      return (Get-BundledTag)
    }
  } catch { }
  try {
    $z = [IO.Compression.ZipFile]::OpenRead($path)
    try {
      $e = $z.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq '.yose-version' } | Select-Object -First 1
      if ($e) {
        $sr = New-Object IO.StreamReader($e.Open())
        try {
          $v = $sr.ReadToEnd().Trim()
          if ($v) { return $v }
        } finally { $sr.Dispose() }
      }
    } finally { $z.Dispose() }
  } catch { }
  return '직접 설치'
}

# 버튼 상태 — install / update / done
function Get-InstallState([string]$latestTag) {
  $inst = Get-InstalledTag
  if (-not $latestTag) { $latestTag = Get-BundledTag }
  if (-not $inst) { return [pscustomobject]@{ mode = 'install'; installed = ''; latest = $latestTag } }
  if ($inst -ne $latestTag) { return [pscustomobject]@{ mode = 'update'; installed = $inst; latest = $latestTag } }
  return [pscustomobject]@{ mode = 'done'; installed = $inst; latest = $latestTag }
}

function Get-Latest([switch]$Offline) {
  if (-not $Offline) {
    try {
      $headers = @{ 'User-Agent' = 'yose-downloader'; 'Accept' = 'application/vnd.github+json' }
      $rel = Invoke-RestMethod -Uri $repoApi -Headers $headers -TimeoutSec 12
      $zip = $rel.assets | Where-Object { $_.name -eq 'game.zip' } | Select-Object -First 1
      if ($rel.tag_name) {
        return [pscustomobject]@{
          tag  = [string]$rel.tag_name
          url  = if ($zip) { [string]$zip.browser_download_url } else { $repoZip }
          size = if ($zip) { [long]$zip.size } else { 0L }
          live = $true
        }
      }
    } catch { }
  }
  return [pscustomobject]@{ tag = (Get-BundledTag); url = $repoZip; size = 0L; live = $false }
}

function Save-Download([string]$url, [string]$dest, [long]$size) {
  $req = [System.Net.HttpWebRequest]::Create($url)
  $req.UserAgent = 'yose-downloader'
  $req.Timeout = 30000
  $req.ReadWriteTimeout = 30000
  $res = $req.GetResponse()
  $total = if ($size -gt 0) { $size } else { [long]$res.ContentLength }
  $in = $res.GetResponseStream()
  $out = [IO.File]::Create($dest)
  $buf = New-Object byte[] 65536
  [long]$got = 0
  try {
    while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
      $out.Write($buf, 0, $n)
      $got += $n
      if ($total -gt 0) {
        $pct = [int](($got * 100) / $total)
        if ($script:bar) { $script:bar.Value = [Math]::Min(100, [Math]::Max(0, $pct)) }
        if ($script:status) { $script:status.Text = ('내려받는 중… {0:N1} / {1:N1} MB ({2}%)' -f ($got / 1MB), ($total / 1MB), $pct) }
        if ($script:bar) { [System.Windows.Forms.Application]::DoEvents() }
      }
    }
  } finally {
    $out.Close(); $in.Close(); $res.Close()
  }
  return $got
}

function Install-Game([switch]$Quiet, [string]$FromFile = '') {
  $latest = Get-Latest -Offline:$Quiet
  if ($FromFile) { Write-Log ('· 설치 파일: ' + (Split-Path $FromFile -Leaf)) }
  else { Write-Log ('· 최신 버전: ' + $latest.tag + $(if ($latest.live) { ' (온라인)' } else { ' (내장)' })) }
  $work = Join-Path ([IO.Path]::GetTempPath()) ('yose-dl-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  $zip = Join-Path $work 'game.zip'
  $got = 0
  $fromSelected = $false
  if ($FromFile) {
    if (-not (Test-GameZip $FromFile)) { throw ('게임 설치 파일이 아닙니다 — game.zip 을 선택해 주세요: ' + $FromFile) }
    Copy-Item $FromFile $zip -Force
    $fromSelected = $true
    Write-Log ('  선택한 파일 사용 — {0:N1} MB' -f ((Get-Item $zip).Length / 1MB))
  }
  if ($latest.live -and -not $Quiet -and -not $fromSelected) {
    try {
      Write-Log '· 내려받는 중…'
      $got = Save-Download $latest.url $zip $latest.size
      Write-Log ('  완료 — {0:N1} MB' -f ($got / 1MB))
    } catch {
      Write-Log ('  [안내] 내려받기 실패(' + $_.Exception.Message + ') — 내장 판으로 설치합니다')
      $got = 0
    }
  }
  if (-not (Test-Path $zip) -or (Get-Item $zip).Length -lt 1024) {
    $bundled = Join-Path $here 'game.zip'
    if (-not (Test-Path $bundled)) { throw 'game.zip 이 없습니다 (인터넷 또는 내장 파일 확인)' }
    Copy-Item $bundled $zip -Force
    Write-Log ('· 내장 game.zip 사용 — {0:N1} MB' -f ((Get-Item $zip).Length / 1MB))
  }
  $install = Join-Path $here 'install.ps1'
  if (-not (Test-Path $install)) { throw 'install.ps1 이 없습니다' }
  Copy-Item $install (Join-Path $work 'install.ps1') -Force
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  if (-not (Test-Path $ps)) { $ps = 'powershell.exe' }
  Write-Log '· 설치 중… (1~2분)'
  $log  = Join-Path $work 'install-log.txt'
  $psArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $work 'install.ps1') + '" -Path "' + $app + '" -Silent *> "' + $log + '"'
  $p = Start-Process -FilePath $ps -ArgumentList $psArgs -PassThru -WindowStyle Hidden -Wait
  if (Test-Path $log) {
    foreach ($line in (Get-Content $log -Encoding UTF8 -ErrorAction SilentlyContinue)) {
      if ($line -match '\S') { Write-Log ('  ' + $line.TrimEnd()) }
    }
  }
  if ($p.ExitCode -ne 0) { Write-Log ('  [안내] 설치 스크립트 종료 코드 ' + $p.ExitCode) }
  $ok = (Test-Path (Join-Path $app 'client\dist\index.html')) -and (Test-Path (Join-Path $app 'server\index.js'))
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
  if (-not $ok) { throw '설치가 끝나지 않았습니다 — 설치 폴더를 확인해 주세요' }
  $tag = $latest.tag
  if ($fromSelected) {
    $tag = Get-SelectedTag $FromFile
    if (-not $tag) { $tag = '직접 설치' }
  }
  Set-InstalledTag $tag
  Write-Log ('· 설치 완료: ' + $app + ' (버전 ' + $tag + ')')
  return $true
}

function Start-Game {
  $vbs = Join-Path $app '게임실행.vbs'
  if (Test-Path $vbs) {
    Start-Process -FilePath 'wscript.exe' -ArgumentList ('//nologo "' + $vbs + '"') -WindowStyle Hidden
    return $true
  }
  $cmd = Join-Path $app '게임실행.cmd'
  if (Test-Path $cmd) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList ('/c start "" "' + $cmd + '"') -WindowStyle Hidden
    return $true
  }
  return $false
}

# ── 상태 검사: 버튼이 install/update/done 중 무엇인지 출력 ───────────────
if ($StateCheck) {
  $latest = Get-Latest -Offline
  $st = Get-InstallState $latest.tag
  Write-Host ('STATE installed={0} latest={1} button={2}' -f $(if ($st.installed) { $st.installed } else { '-' }), $st.latest, $st.mode)
  exit 0
}

# ── 자동 검증: 창 없이 설치만 ───────────────────────────────────────────
if ($SelfTest -or $Silent) {
  try {
    $ok = Install-Game -Quiet:$Silent -FromFile $script:selectedZip
    if ($SelfTest) { Write-Host ('SELFTEST OK — ' + $app) }
    exit 0
  } catch {
    Write-Host ('SELFTEST FAIL — ' + $_.Exception.Message)
    exit 1
  }
}

# ── 창(GUI) ─────────────────────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = $appName
$form.Size = New-Object System.Drawing.Size(620, 580)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(242, 243, 245)

$title = New-Object System.Windows.Forms.Label
$title.Text = if ($script:isLauncher) { '요세의 수호자 — 게임 다운로드 & 시작' } else { '요세의 수호자 — 다운로드 & 설치' }
$title.Font = New-Object System.Drawing.Font('Malgun Gothic', 15, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::FromArgb(32, 36, 44)
$title.Location = New-Object System.Drawing.Point(22, 18)
$title.Size = New-Object System.Drawing.Size(560, 32)
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = if ($script:isLauncher) { '최신 게임을 내려받아 설치하고 바로 시작합니다. 인터넷이 없으면 내장 판으로 설치합니다.' } else { '최신 버전을 내려받아 설치합니다. 인터넷이 없으면 내장 판으로 설치합니다.' }
$sub.ForeColor = [System.Drawing.Color]::FromArgb(92, 99, 110)
$sub.Location = New-Object System.Drawing.Point(24, 52)
$sub.Size = New-Object System.Drawing.Size(560, 20)
$form.Controls.Add($sub)

$info = New-Object System.Windows.Forms.Label
$info.ForeColor = [System.Drawing.Color]::FromArgb(38, 92, 160)
$info.Location = New-Object System.Drawing.Point(24, 78)
$info.Size = New-Object System.Drawing.Size(560, 20)
$info.Text = '설치 위치: ' + $app
$form.Controls.Add($info)

$script:fileLine = New-Object System.Windows.Forms.Label
$script:fileLine.ForeColor = [System.Drawing.Color]::FromArgb(92, 99, 110)
$script:fileLine.Location = New-Object System.Drawing.Point(24, 100)
$script:fileLine.Size = New-Object System.Drawing.Size(560, 20)
$script:fileLine.Text = '설치 파일: 최신 릴리스 (자동 다운로드)'
$form.Controls.Add($script:fileLine)

$script:status = New-Object System.Windows.Forms.Label
$script:status.ForeColor = [System.Drawing.Color]::FromArgb(70, 76, 86)
$script:status.Location = New-Object System.Drawing.Point(24, 124)
$script:status.Size = New-Object System.Drawing.Size(560, 20)
$script:status.Text = '준비됨'
$form.Controls.Add($script:status)

$script:bar = New-Object System.Windows.Forms.ProgressBar
$script:bar.Location = New-Object System.Drawing.Point(24, 146)
$script:bar.Size = New-Object System.Drawing.Size(560, 16)
$form.Controls.Add($script:bar)

$installBtn = New-Object System.Windows.Forms.Button
$installBtn.Text = $installLabel
$installBtn.Location = New-Object System.Drawing.Point(24, 172)
$installBtn.Size = New-Object System.Drawing.Size(176, 34)
$form.Controls.Add($installBtn)

$selectBtn = New-Object System.Windows.Forms.Button
$selectBtn.Text = '설치 파일 선택'
$selectBtn.Location = New-Object System.Drawing.Point(208, 172)
$selectBtn.Size = New-Object System.Drawing.Size(150, 34)
$form.Controls.Add($selectBtn)

$playBtn = New-Object System.Windows.Forms.Button
$playBtn.Text = $playLabel
$playBtn.Location = New-Object System.Drawing.Point(366, 172)
$playBtn.Size = New-Object System.Drawing.Size(110, 34)
$form.Controls.Add($playBtn)

$openBtn = New-Object System.Windows.Forms.Button
$openBtn.Text = '설치 폴더 열기'
$openBtn.Location = New-Object System.Drawing.Point(24, 212)
$openBtn.Size = New-Object System.Drawing.Size(150, 30)
$form.Controls.Add($openBtn)

$resetBtn = New-Object System.Windows.Forms.Button
$resetBtn.Text = '선택 초기화'
$resetBtn.Location = New-Object System.Drawing.Point(182, 212)
$resetBtn.Size = New-Object System.Drawing.Size(110, 30)
$resetBtn.Enabled = $false
$form.Controls.Add($resetBtn)

$closeBtn = New-Object System.Windows.Forms.Button
$closeBtn.Text = '닫기'
$closeBtn.Location = New-Object System.Drawing.Point(480, 212)
$closeBtn.Size = New-Object System.Drawing.Size(116, 30)
$form.Controls.Add($closeBtn)

$script:logBox = New-Object System.Windows.Forms.TextBox
$script:logBox.Multiline = $true
$script:logBox.ReadOnly = $true
$script:logBox.ScrollBars = 'Vertical'
$script:logBox.Location = New-Object System.Drawing.Point(24, 250)
$script:logBox.Size = New-Object System.Drawing.Size(560, 246)
$script:logBox.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$script:logBox.ForeColor = [System.Drawing.Color]::FromArgb(44, 48, 56)
$script:logBox.Font = New-Object System.Drawing.Font('Consolas', 9)
$form.Controls.Add($script:logBox)

$script:latestTag = ''

# 버튼 표시/문구 — 설치 전 install · 새 버전 update · 최신이면 버튼 삭제(done)
function Update-InstallButton([string]$latestTag) {
  if ($latestTag) { $script:latestTag = $latestTag }
  $st = Get-InstallState $script:latestTag
  switch ($st.mode) {
    'install' {
      $installBtn.Visible = $true
      $installBtn.Text = $installLabel
      $script:status.Text = if ($script:isLauncher) { '아직 설치되지 않았습니다 — [게임 다운로드 & 설치] 를 누르세요' } else { '아직 설치되지 않았습니다 — [최신 버전 설치] 를 누르세요' }
    }
    'update' {
      $installBtn.Visible = $true
      $installBtn.Text = ('업데이트 (' + $st.installed + ' → ' + $st.latest + ')')
      $script:status.Text = ('새 버전이 있습니다 — 지금 ' + $st.installed + ', 최신 ' + $st.latest)
    }
    default {
      $installBtn.Visible = $false
      $script:status.Text = ('최신 버전입니다 (' + $st.latest + ') — 설치 완료')
    }
  }
  if ($script:selectedZip) {
    $installBtn.Visible = $true
    $installBtn.Text = '선택한 파일 설치'
    $script:status.Text = ('선택한 파일로 설치합니다 — ' + (Split-Path $script:selectedZip -Leaf))
  }
  $script:info.Text = '설치 위치: ' + $app + $(if ($st.installed) { '  (설치 ' + $st.installed + ')' } else { '' })
  return $st
}

# '설치 파일' 줄 — 자동 다운로드 / 직접 선택 상태
function Update-FileLabel {
  if ($script:selectedZip) {
    $name = Split-Path $script:selectedZip -Leaf
    $mb = if (Test-Path $script:selectedZip) { [Math]::Round((Get-Item $script:selectedZip).Length / 1MB, 1) } else { 0 }
    $script:fileLine.Text = ('설치 파일: ' + $name + ' (' + $mb + ' MB) — [선택한 파일 설치]')
    $script:fileLine.ForeColor = [System.Drawing.Color]::FromArgb(150, 92, 24)
    if ($resetBtn) { $resetBtn.Enabled = $true }
  } else {
    $script:fileLine.Text = '설치 파일: 최신 릴리스 (자동 다운로드)'
    $script:fileLine.ForeColor = [System.Drawing.Color]::FromArgb(92, 99, 110)
    if ($resetBtn) { $resetBtn.Enabled = $false }
  }
}

Write-Log ('설치 위치: ' + $app)
Write-Log ('현재 설치된 버전: ' + (Get-InstalledVersion))
Update-InstallButton (Get-BundledTag) | Out-Null
Update-FileLabel
Write-Log '최신 버전을 확인하는 중…'

$installBtn.Add_Click({
  if ($script:busy) { return }
  $script:busy = $true
  $script:bar.Value = 0
  $script:status.Text = '확인 중…'
  try {
    Install-Game -FromFile $script:selectedZip
    $script:bar.Value = 100
    if ($script:selectedZip) { $script:selectedZip = ''; Update-FileLabel }
    # 최신 태그를 다시 확인해 표식과 버튼을 맞춘다
    $latest = Get-Latest
    $st = Update-InstallButton $latest.tag
    if ($st.mode -eq 'done') {
      $installBtn.Visible = $false         # 최신 판이면 [설치] 버튼은 사라진다
      $script:status.Text = ('설치 완료 — 최신 버전(' + $st.latest + ') · [' + $playLabel + '] 를 누르세요')
    } else {
      $installBtn.Visible = $true
      $script:status.Text = ('설치 완료 — 지금 ' + (Get-InstalledVersion) + ', 최신 ' + $st.latest)
    }
    $script:info.Text = '설치 위치: ' + $app + '  (설치 ' + (Get-InstalledVersion) + ')'
    Write-Log ('· 설치 완료 — 버전 ' + (Get-InstalledVersion))
    [System.Windows.Forms.MessageBox]::Show('설치가 끝났습니다. 지금 게임을 시작합니다.', $appName) | Out-Null
    if (Start-Game) { Write-Log ('· 게임을 시작했습니다') }
  } catch {
    $script:status.Text = '실패 — 아래 기록을 확인하세요'
    Write-Log ('[오류] ' + $_.Exception.Message)
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '설치 실패') | Out-Null
  } finally {
    $script:busy = $false
  }
}.GetNewClosure())

$openBtn.Add_Click({
  if (-not (Test-Path $app)) { New-Item -ItemType Directory -Path $app -Force | Out-Null }
  Start-Process explorer.exe ($app)
}.GetNewClosure())

$selectBtn.Add_Click({
  if ($script:busy) { return }
  $dlg = New-Object System.Windows.Forms.OpenFileDialog
  $dlg.Title = '설치할 게임 파일 선택'
  $dlg.Filter = '게임 패키지 (game.zip)|*.zip|모든 파일 (*.*)|*.*'
  $dlg.CheckFileExists = $true
  if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
  $path = $dlg.FileName
  if (-not (Test-GameZip $path)) {
    [System.Windows.Forms.MessageBox]::Show(('게임 설치 파일이 아닙니다.' + [Environment]::NewLine + [Environment]::NewLine + 'server/index.js 와 client/dist/index.html 이 들어 있는 game.zip 을 선택해 주세요.'), $appName) | Out-Null
    Write-Log ('[안내] 게임 패키지가 아닙니다: ' + $path)
    return
  }
  $script:selectedZip = $path
  Update-FileLabel
  $installBtn.Visible = $true
  $installBtn.Text = '선택한 파일 설치'
  $script:status.Text = ('선택한 파일로 설치합니다 — ' + (Split-Path $path -Leaf))
  Write-Log ('· 설치 파일 선택: ' + $path)
}.GetNewClosure())

$resetBtn.Add_Click({
  if ($script:busy) { return }
  $script:selectedZip = ''
  Update-FileLabel
  Update-InstallButton $script:latestTag | Out-Null
  Write-Log '· 설치 파일을 최신 릴리스(자동)로 되돌렸습니다'
}.GetNewClosure())

$playBtn.Add_Click({
  if (Start-Game) { Write-Log ('· 게임을 시작했습니다') }
  else { [System.Windows.Forms.MessageBox]::Show(('아직 설치되지 않았습니다. [' + $installLabel + '] 를 먼저 눌러 주세요.'), $appName) | Out-Null }
}.GetNewClosure())

$closeBtn.Add_Click({ $form.Close() }.GetNewClosure())

$form.Add_Shown({
  try {
    $script:status.Text = '최신 버전 확인 중…'
    [System.Windows.Forms.Application]::DoEvents()
    $latest = Get-Latest
    $st = Update-InstallButton $latest.tag
    Update-FileLabel
    if ($latest.live) { Write-Log ('· 최신 버전: ' + $latest.tag + ' (온라인)') }
    else { Write-Log '· 인터넷이 없어 내장 판 기준으로 확인했습니다' }
    if ($st.mode -eq 'done') { Write-Log '· 이미 최신 버전입니다 — 설치 버튼을 숨겼습니다' }
  } catch {
    Write-Log ('[안내] 최신 버전 확인 실패 — ' + $_.Exception.Message)
  }
}.GetNewClosure())

# 자동 검사용 — 창을 띄우지 않고 컨트롤 목록만 파일로 남긴다
if ($DumpControls) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('FORM|' + $form.Text)
  foreach ($c in $form.Controls) {
    $kind = $c.GetType().Name
    $text = if ($null -ne $c.Text) { $c.Text } else { '' }
    $lines.Add($kind + '|' + $text + '|' + $c.Location.X + ',' + $c.Location.Y)
  }
  [IO.File]::WriteAllLines($DumpControls, $lines)
  exit 0
}

[void]$form.ShowDialog()

param(
  [string]$Url = '',
  [string]$Path = '',
  [switch]$Silent,
  [switch]$SelfTest
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

if (Test-Path $conf) {
  try {
    $j = Get-Content $conf -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($j.api) { $repoApi = [string]$j.api }
    if ($j.url) { $repoZip = [string]$j.url }
  } catch { }
}

$script:logText = ''
$script:busy = $false

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

function Get-InstalledVersion {
  $pkg = Join-Path $app 'package.json'
  if (Test-Path $pkg) {
    try {
      $j = Get-Content $pkg -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($j.version) { return [string]$j.version }
    } catch { }
  }
  return '설치 안 됨'
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
  return [pscustomobject]@{ tag = '내장 판'; url = $repoZip; size = 0L; live = $false }
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

function Install-Game([switch]$Quiet) {
  $latest = Get-Latest -Offline:$Quiet
  Write-Log ('· 최신 버전: ' + $latest.tag + $(if ($latest.live) { ' (온라인)' } else { ' (내장)' }))
  $work = Join-Path ([IO.Path]::GetTempPath()) ('yose-dl-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  $zip = Join-Path $work 'game.zip'
  $got = 0
  if ($latest.live -and -not $Quiet) {
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
  Write-Log ('· 설치 완료: ' + $app)
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

# ── 자동 검증: 창 없이 설치만 ───────────────────────────────────────────
if ($SelfTest -or $Silent) {
  try {
    $ok = Install-Game -Quiet:$Silent
    if ($SelfTest) { Write-Host ('SELFTEST OK — ' + $app) }
    exit 0
  } catch {
    Write-Host ('SELFTEST FAIL — ' + $_.Exception.Message)
    exit 1
  }
}

# ── 창(GUI) ─────────────────────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = '요세의 수호자 다운로더'
$form.Size = New-Object System.Drawing.Size(620, 520)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(242, 243, 245)

$title = New-Object System.Windows.Forms.Label
$title.Text = '요세의 수호자 — 다운로드 & 설치'
$title.Font = New-Object System.Drawing.Font('Malgun Gothic', 15, [System.Drawing.FontStyle]::Bold)
$title.ForeColor = [System.Drawing.Color]::FromArgb(32, 36, 44)
$title.Location = New-Object System.Drawing.Point(22, 18)
$title.Size = New-Object System.Drawing.Size(560, 32)
$form.Controls.Add($title)

$sub = New-Object System.Windows.Forms.Label
$sub.Text = '최신 버전을 내려받아 설치합니다. 인터넷이 없으면 내장 판으로 설치합니다.'
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

$script:status = New-Object System.Windows.Forms.Label
$script:status.ForeColor = [System.Drawing.Color]::FromArgb(70, 76, 86)
$script:status.Location = New-Object System.Drawing.Point(24, 102)
$script:status.Size = New-Object System.Drawing.Size(560, 20)
$script:status.Text = '준비됨'
$form.Controls.Add($script:status)

$script:bar = New-Object System.Windows.Forms.ProgressBar
$script:bar.Location = New-Object System.Drawing.Point(24, 124)
$script:bar.Size = New-Object System.Drawing.Size(560, 16)
$form.Controls.Add($script:bar)

$installBtn = New-Object System.Windows.Forms.Button
$installBtn.Text = '최신 버전 설치'
$installBtn.Location = New-Object System.Drawing.Point(24, 150)
$installBtn.Size = New-Object System.Drawing.Size(150, 34)
$form.Controls.Add($installBtn)

$openBtn = New-Object System.Windows.Forms.Button
$openBtn.Text = '설치 폴더 열기'
$openBtn.Location = New-Object System.Drawing.Point(182, 150)
$openBtn.Size = New-Object System.Drawing.Size(140, 34)
$form.Controls.Add($openBtn)

$playBtn = New-Object System.Windows.Forms.Button
$playBtn.Text = '게임 실행'
$playBtn.Location = New-Object System.Drawing.Point(330, 150)
$playBtn.Size = New-Object System.Drawing.Size(120, 34)
$form.Controls.Add($playBtn)

$closeBtn = New-Object System.Windows.Forms.Button
$closeBtn.Text = '닫기'
$closeBtn.Location = New-Object System.Drawing.Point(468, 150)
$closeBtn.Size = New-Object System.Drawing.Size(116, 34)
$form.Controls.Add($closeBtn)

$script:logBox = New-Object System.Windows.Forms.TextBox
$script:logBox.Multiline = $true
$script:logBox.ReadOnly = $true
$script:logBox.ScrollBars = 'Vertical'
$script:logBox.Location = New-Object System.Drawing.Point(24, 196)
$script:logBox.Size = New-Object System.Drawing.Size(560, 260)
$script:logBox.BackColor = [System.Drawing.Color]::FromArgb(255, 255, 255)
$script:logBox.ForeColor = [System.Drawing.Color]::FromArgb(44, 48, 56)
$script:logBox.Font = New-Object System.Drawing.Font('Consolas', 9)
$form.Controls.Add($script:logBox)

Write-Log ('설치 위치: ' + $app)
Write-Log ('현재 설치된 버전: ' + (Get-InstalledVersion))
Write-Log '버튼을 누르면 최신 버전을 확인해 설치합니다.'

$installBtn.Add_Click({
  if ($script:busy) { return }
  $script:busy = $true
  $script:bar.Value = 0
  $script:status.Text = '확인 중…'
  try {
    Install-Game
    $script:bar.Value = 100
    $script:status.Text = '설치 완료 — 게임 실행을 누르세요'
    $script:info.Text = '설치 위치: ' + $app + '  (버전 ' + (Get-InstalledVersion) + ')'
    [System.Windows.Forms.MessageBox]::Show('설치가 끝났습니다. 지금 게임을 시작합니다.', '요세의 수호자 다운로더') | Out-Null
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

$playBtn.Add_Click({
  if (Start-Game) { Write-Log ('· 게임을 시작했습니다') }
  else { [System.Windows.Forms.MessageBox]::Show('아직 설치되지 않았습니다. [최신 버전 설치] 를 먼저 눌러 주세요.', '요세의 수호자 다운로더') | Out-Null }
}.GetNewClosure())

$closeBtn.Add_Click({ $form.Close() }.GetNewClosure())

[void]$form.ShowDialog()

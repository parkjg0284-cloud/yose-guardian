# 요세의 수호자 — 설치 파일(.exe) 만들기
#   사용법: npm run installer   (또는 powershell -ExecutionPolicy Bypass -File installer\build-installer.ps1)
#   하는 일: ① 프런트 빌드 ② 실행에 필요한 파일만 묶어 game.zip ③ iexpress 로 자체 설치 exe 생성
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$out = $PSScriptRoot
$work = Join-Path $env:LOCALAPPDATA 'yose_installer_build'   # ASCII 경로(iexpress 제약)
$payload = Join-Path $work 'payload'
New-Item -ItemType Directory -Force -Path $work | Out-Null

Write-Host ''
Write-Host '  요세의 수호자 — 설치 파일 빌드' -ForegroundColor Yellow
Write-Host '  ① 프런트 빌드'
Push-Location $repo
$ErrorActionPreference = 'Continue'   # 네이티브 stderr 를 예외로 바꾸지 않는다
$env:TEMP = $work   # 샌드박스·권한 문제로 %TEMP% 쓰기가 막히는 환경이 있다 — 작업 폴더를 쓴다
$env:TMP = $work
# 빌드는 하지 않는다 — 실패한 빌드가 dist 를 비워 설치본이 빈 채로 나가는 사고를 막는다.
#   (먼저 npm run build 로 dist 를 만들어 두면 그대로 묶인다)
if (-not (Get-ChildItem (Join-Path $repo 'client\dist\assets\index-*.js') -ErrorAction SilentlyContinue)) { Write-Host '     [주의] client\dist 가 비어 있습니다 — 먼저 npm run build 하세요' -ForegroundColor Yellow }
$ErrorActionPreference = 'Stop'
if ($LASTEXITCODE -ne 0) { Write-Host '     [주의] 빌드가 실패해 이미 있는 client\dist 를 그대로 씁니다' -ForegroundColor Yellow }
Pop-Location

# ── 메인화면 그림 자동 인식 — 게임 폴더에 둔 그림(이름·형식 무관)을 그대로 쓴다 ──
$img = Get-ChildItem (Join-Path $repo '*') -File -Include *.png, *.jpg, *.jpeg, *.webp, *.gif, *.bmp -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -notlike 'menu-bg*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($img) {
  Get-ChildItem (Join-Path $repo 'client\public') -Filter 'menu-bg.*' -File -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Copy-Item $img.FullName (Join-Path $repo ("client\public\menu-bg" + $img.Extension.ToLower())) -Force
  $cssPath = Join-Path $repo 'client\src\ui\ui-polish.css'
  $css = [IO.File]::ReadAllText($cssPath)
  $css = $css -replace "url\('/menu-bg\.[a-z]+'\)", ("url('/menu-bg" + $img.Extension.ToLower() + "')")
  [IO.File]::WriteAllText($cssPath, $css, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("     메인화면 그림: " + $img.Name + " -> menu-bg" + $img.Extension.ToLower()) -ForegroundColor Cyan
}
Write-Host '  ② 묶을 파일 모으기'
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $payload | Out-Null
foreach ($item in @('server', 'package.json', 'run.cmd', 'docs')) {
  $src = Join-Path $repo $item
  if (Test-Path $src) { Copy-Item $src $payload -Recurse -Force }
}
Copy-Item (Join-Path $out 'install.ps1') $payload -Force
Copy-Item (Join-Path $out 'install.cmd') $payload -Force
Remove-Item (Join-Path $payload 'server\data') -Recurse -Force -ErrorAction SilentlyContinue   # 저장 파일은 포장하지 않는다(설치할 때 만든다)
New-Item -ItemType Directory -Force -Path (Join-Path $payload 'client') | Out-Null
Copy-Item (Join-Path $repo 'client\dist') (Join-Path $payload 'client') -Recurse -Force   # client\dist 경로를 그대로 유지한다
Get-ChildItem $payload -Recurse -File -Include *.db, *.db-shm, *.db-wal -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue   # 저장 파일은 절대 포장하지 않는다
Compress-Archive -Path (Join-Path $payload '*') -DestinationPath (Join-Path $work 'game.zip') -Force
# iexpress 는 SED 와 같은 폴더에서 파일을 찾는다 — payload 안에만 두면 못 찾는다.
Copy-Item (Join-Path $out 'install.ps1') $work -Force
Copy-Item (Join-Path $out 'launcher.ps1') $work -Force
Copy-Item (Join-Path $out 'launcher.cmd') $work -Force
Copy-Item (Join-Path $out 'install.cmd') $work -Force
Copy-Item (Join-Path $out 'install-gui.ps1') $work -Force
Copy-Item (Join-Path $out 'install-gui.cmd') $work -Force
Copy-Item (Join-Path $out 'updates.json') $work -Force
Write-Host "     game.zip $([Math]::Round((Get-Item (Join-Path $work 'game.zip')).Length / 1MB, 1))MB"

Write-Host '  ③ 설치 exe 만들기(iexpress)'
$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=ExtractOnly
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=Yose Guardian setup is complete.
TargetName=$work\YoseGuardianLauncher.exe
FriendlyName=Yose Guardian Setup
AppLaunched=launcher.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
FILE0="game.zip"
FILE1="install.ps1"
FILE2="install.cmd"
FILE3="install-gui.ps1"
FILE4="install-gui.cmd"
FILE5="launcher.ps1"
FILE6="launcher.cmd"
FILE7="updates.json"
[SourceFiles]
SourceFiles0=$work\
[SourceFiles0]
%FILE0%=
%FILE1%=
%FILE2%=
%FILE3%=
%FILE4%=
%FILE5%=
%FILE6%=
%FILE7%=
"@
Set-Content -Path (Join-Path $work 'build.sed') -Value $sed -Encoding ASCII
$exe = Join-Path $work 'YoseGuardianLauncher.exe'
Remove-Item $exe -Force -ErrorAction SilentlyContinue
& "$env:WINDIR\System32\iexpress.exe" /N /Q (Join-Path $work 'build.sed')
Write-Host ('     iexpress 종료코드: ' + $LASTEXITCODE)
for ($i = 0; $i -lt 120; $i++) {
  if ((Test-Path $exe) -and ((Get-Item $exe).Length -gt 500KB)) { break }
  Start-Sleep -Milliseconds 500
}
if (-not (Test-Path $exe) -or (Get-Item $exe).Length -lt 500KB) { throw 'iexpress 가 exe 를 만들지 못했습니다' }
$target = Join-Path $out '요세의수호자_설치.exe'
Copy-Item $exe $target -Force
Copy-Item $exe (Join-Path $repo 'YoseGuardian-Setup.exe') -Force
Write-Host ''
Write-Host "  완료: $target ($([Math]::Round((Get-Item $target).Length / 1MB, 1))MB)" -ForegroundColor Green

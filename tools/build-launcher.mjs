// 요세의 수호자 — 게임 다운로드 런처 빌더 (v1.6.0)
//   사용: node tools/build-launcher.mjs   (= npm run launcher)
//
//   downloader.ps1(런처 모드) + downloader.json + install.ps1 + game.zip 을 exe 안에 품는다.
//   실행하면 창이 뜨고 [게임 다운로드 & 설치] → 내려받아 설치 → [게임 시작].
//   · 최신 판이 이미 설치돼 있으면 [다운로드] 버튼은 사라지고 [게임 시작] 만 남는다.
//   · 인터넷이 없으면 함께 들어 있는 game.zip 으로 설치한다.
//   · 무인 검증:  YoseGuardian-Launcher.exe <대상폴더> -StateCheck  /  -SelfTest
import { existsSync, mkdirSync, rmSync, statSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, '.build-launcher');
const OUT = join(ROOT, 'YoseGuardian-Launcher.exe');
const GAME = join(ROOT, 'game.zip');
const SRC = join(ROOT, 'downloader');
const log = (m) => console.log(`  ${m}`);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

// ── ① game.zip 준비
if (!existsSync(GAME)) {
  log('[1/7] game.zip 이 없어 새로 만듭니다...');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'pack-release.mjs')], { cwd: ROOT, stdio: 'inherit' });
} else {
  log(`[1/7] game.zip 확인됨 (${kb(statSync(GAME).size)})`);
}

// ── ② 스테이징 — 런처가 실제로 쓰는 파일만
rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });
for (const f of ['downloader.ps1', 'downloader.json', 'updates.json']) {
  const src = join(SRC, f);
  if (!existsSync(src)) {
    console.error(`  [실패] downloader/${f} 가 없습니다`);
    process.exit(1);
  }
  copyFileSync(src, join(BUILD, f));
}
copyFileSync(join(ROOT, 'launcher', 'install.ps1'), join(BUILD, 'install.ps1'));
copyFileSync(GAME, join(BUILD, 'game.zip'));

// 내장 판 태그 — 오프라인일 때 버튼 상태(install/update/done) 판정 기준
let tagOf = process.env.YOSE_TAG || '';
if (!tagOf) {
  try {
    tagOf = execSync('git describe --tags --abbrev=0', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    tagOf = '';
  }
}
{
  const confPath = join(BUILD, 'downloader.json');
  const obj = JSON.parse(readFileSync(confPath, 'utf8').replace(/^\uFEFF/, ''));
  obj.tag = tagOf;
  writeFileSync(confPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  if (tagOf) log(`  내장 태그: ${tagOf}`);
}
log('[2/7] 스테이징 완료 (downloader.ps1 · downloader.json · updates.json · install.ps1 · game.zip)');

// ── ③ 무결성 검사 — 런처 문구·설치 스크립트·자체 검사 표식
const conf = JSON.parse(readFileSync(join(BUILD, 'downloader.json'), 'utf8').replace(/^\uFEFF/, ''));
if (!conf.url || !/^https?:\/\//.test(conf.url)) {
  console.error(`  [실패] downloader.json 의 url 이 올바르지 않습니다: ${conf.url}`);
  process.exit(1);
}
const ps1 = readFileSync(join(BUILD, 'downloader.ps1'), 'utf8');
for (const needle of ['게임 다운로드 & 설치', '게임 시작', 'install.ps1', 'SELFTEST OK', 'Update-InstallButton', 'Set-PlayLocked', '업데이트 후 시작', '설치 파일 선택', '선택한 파일 설치', 'Test-GameZip', '패치노트']) {
  if (!ps1.includes(needle)) {
    console.error(`  [실패] downloader.ps1 에 '${needle}' 가 없습니다`);
    process.exit(1);
  }
}
const installSrc = readFileSync(join(BUILD, 'install.ps1'), 'utf8');
if (!installSrc.includes('--prod')) {
  console.error('  [실패] install.ps1 에 --prod 가 없습니다 — 설치 후 화면이 뜨지 않습니다');
  process.exit(1);
}
log('  무결성 확인: url ✓ · 런처 문구 ✓ · install.ps1 --prod ✓ · SelfTest ✓');

// ── ④ payload.zip
const payload = join(BUILD, 'payload.zip');
rmSync(payload, { force: true });
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${BUILD}\\downloader.ps1','${BUILD}\\downloader.json','${BUILD}\\updates.json','${BUILD}\\install.ps1','${BUILD}\\game.zip' -DestinationPath '${payload}' -Force"`,
  { cwd: ROOT, stdio: 'inherit' }
);
log(`[3/7] payload.zip ${kb(statSync(payload).size)}`);

// ── ⑤ csc (LAUNCHER_MODE 정의로 컴파일)
const csc = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
].find((p) => existsSync(p));
if (!csc) {
  console.error('  [실패] csc.exe 를 찾을 수 없습니다 (.NET Framework 4 필요)');
  process.exit(1);
}
const src = join(ROOT, 'tools', 'downloader-stub.cs');
if (!existsSync(src)) {
  console.error('  [실패] tools/downloader-stub.cs 가 없습니다');
  process.exit(1);
}
const tmpExe = join(BUILD, 'launcher.exe');
rmSync(tmpExe, { force: true });
const refDirs = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319',
  'C:\\Program Files (x86)\\Reference Assemblies\\Microsoft\\Framework\\.NETFramework\\v4.8'
];
const refArgs = [];
for (const d of refDirs) {
  for (const dll of ['System.IO.Compression.dll', 'System.IO.Compression.FileSystem.dll']) {
    const p = join(d, dll);
    if (existsSync(p) && !refArgs.some((a) => a.endsWith(dll))) refArgs.push(`/reference:${p}`);
  }
}
execFileSync(
  csc,
  [
    '/nologo',
    ...refArgs,
    '/target:exe',
    '/platform:anycpu',
    '/optimize+',
    '/codepage:65001',
    '/define:LAUNCHER_MODE',
    `/out:${tmpExe}`,
    `/resource:${payload},payload.zip`,
    src
  ],
  { cwd: ROOT, stdio: 'inherit' }
);
log(`[4/7] 컴파일 완료 ${kb(statSync(tmpExe).size)}`);

// ── ⑥ 결과물
rmSync(OUT, { force: true });
copyFileSync(tmpExe, OUT);
log(`[5/7] ${OUT.split('\\').pop()} ${kb(statSync(OUT).size)}`);

// ── ⑥-b 버튼 상태 검사 (설치 전 install · 새 버전 update · 최신 done)
{
  const stateDir = join(BUILD, 'state-probe');
  rmSync(stateDir, { recursive: true, force: true });
  mkdirSync(stateDir, { recursive: true });
  const run = (target) => {
    const out = execFileSync(OUT, ['-StateCheck', target], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    const m = out.match(/STATE installed=(\S+) latest=(\S+) button=(\w+)/);
    return m ? m.slice(1) : ['?', '?', '?'];
  };
  const a = run(stateDir);
  mkdirSync(join(stateDir, 'server'), { recursive: true });
  writeFileSync(join(stateDir, 'server', 'index.js'), '// probe\n', 'utf8');
  writeFileSync(join(stateDir, '.yose-version'), 'v0.0.1', 'utf8');
  const b = run(stateDir);
  writeFileSync(join(stateDir, '.yose-version'), tagOf || '내장판', 'utf8');
  const c = run(stateDir);
  // [게임 시작] 잠금 — 최신이면 enabled=True, 구버전이면 '업데이트 후 시작' + enabled=False
  const dumpPath = join(BUILD, 'controls-probe.txt');
  const dump = (tag) => {
    writeFileSync(join(stateDir, '.yose-version'), tag, 'utf8');
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(BUILD, 'downloader.ps1'), '-Launcher', '-Path', stateDir, '-DumpControls', dumpPath], { timeout: 60000, windowsHide: true });
    return readFileSync(dumpPath, 'utf8');
  };
  const latestDump = dump(tagOf || '내장판');
  const oldDump = dump('v0.0.0');
  rmSync(stateDir, { recursive: true, force: true });
  const playReady = /Button\|게임 시작\|[^|]*\|enabled=True/.test(latestDump);
  const playLocked = /Button\|업데이트 후 시작\|[^|]*\|enabled=False/.test(oldDump);
  const ok = a[2] === 'install' && b[2] === 'update' && c[2] === 'done' && playReady && playLocked;
  log(`[6/7] 버튼 상태 검사 ${ok ? 'OK' : '실패'} — 설치 전 ${a[2] || '?'} · 새 버전 ${b[2] || '?'} · 최신 ${c[2] || '?'} · 시작 잠금 ${playLocked ? 'OK' : '실패'}/${playReady ? 'OK' : '실패'}`);
  if (!ok) {
    console.error(`  설치 전=${a.join('|')} · 새 버전=${b.join('|')} · 최신=${c.join('|')} · playReady=${playReady} · playLocked=${playLocked}`);
    process.exitCode = 1;
  }
}

// ── ⑦ 자체 검사 (창 없이 설치) — 임시 폴더에 설치되는지
const probe = join(ROOT, '.build-launcher-probe');
const probe2 = join(ROOT, '.build-launcher-probe-zip');
rmSync(probe, { recursive: true, force: true });
rmSync(probe2, { recursive: true, force: true });
try {
  const out = execFileSync(OUT, ['-SelfTest', probe], { encoding: 'utf8', timeout: 240000, windowsHide: true });
  const ok =
    /SELFTEST OK/.test(out) &&
    existsSync(join(probe, 'client', 'dist', 'index.html')) &&
    existsSync(join(probe, 'server', 'index.js'));
  log(`[7/8] 자체 검사 ${ok ? 'OK' : '실패'} — ${probe}`);
  if (!ok) {
    console.error(out.split('\n').slice(-12).join('\n'));
    process.exitCode = 1;
  }

  // 선택한 설치 파일(game.zip)로도 설치되는지 — YOSE_ZIP 으로 전달
  const picked = join(BUILD, 'picked-game.zip');
  writeFileSync(picked, readFileSync(GAME));
  const logPath = join(BUILD, 'picked-install.log');
  const out2 = execFileSync(OUT, ['-SelfTest', probe2], {
    encoding: `utf8`,
    timeout: 240000,
    windowsHide: true,
    env: { ...process.env, YOSE_ZIP: picked, YOSE_LOG: logPath }
  });
  const logs = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  const tag2 = existsSync(join(probe2, '.yose-version')) ? readFileSync(join(probe2, '.yose-version'), 'utf8').trim() : '';
  const ok2 =
    /SELFTEST OK/.test(out2) &&
    existsSync(join(probe2, 'client', 'dist', 'index.html')) &&
    existsSync(join(probe2, 'server', 'index.js')) &&
    /선택한 파일 사용/.test(logs) &&
    tag2 === (tagOf || '내장판');
  log(`[8/8] 선택 파일 설치 ${ok2 ? 'OK' : '실패'} — 버전 ${tag2 || '?'} · ${probe2}`);
  if (!ok2) {
    console.error((logs || out2).split('\n').slice(-16).join('\n'));
    process.exitCode = 1;
  }
} finally {
  rmSync(probe2, { recursive: true, force: true });
  rmSync(probe, { recursive: true, force: true });
  rmSync(BUILD, { recursive: true, force: true });
}

if (!process.exitCode) log('완료 — 실행하면 [게임 다운로드 & 설치] → [게임 시작] 런처 창이 뜹니다');

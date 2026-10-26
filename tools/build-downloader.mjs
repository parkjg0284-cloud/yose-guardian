// 요세의 수호자 — 다운로더 앱 빌더 (v1.3.0)
//   사용: node tools/build-downloader.mjs   (= npm run downloader)
//
//   downloader.ps1 + downloader.json + install.ps1 + game.zip 을 exe 안에 품는다.
//   실행하면 창이 뜨고 [최신 버전 설치] 로 GitHub 릴리스의 game.zip 을 내려받아 설치한다.
import { existsSync, mkdirSync, rmSync, statSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, '.build-downloader');
const OUT = join(ROOT, 'YoseGuardian-Downloader.exe');
const GAME = join(ROOT, 'game.zip');
const SRC = join(ROOT, 'downloader');
const log = (m) => console.log(`  ${m}`);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

// ── ① game.zip 준비
if (!existsSync(GAME)) {
  log('[1/6] game.zip 이 없어 새로 만듭니다...');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'pack-release.mjs')], { cwd: ROOT, stdio: 'inherit' });
} else {
  log(`[1/6] game.zip 확인됨 (${kb(statSync(GAME).size)})`);
}

// ── ② 스테이징
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

// 내장 판 태그 — 오프라인일 때 [설치]/[업데이트] 판정 기준
let tagOf = process.env.YOSE_TAG || '';
if (!tagOf) {
  try {
    tagOf = execSync('git describe --tags --abbrev=0', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { tagOf = ''; }
}
{
  const confPath = join(BUILD, 'downloader.json');
  const obj = JSON.parse(readFileSync(confPath, 'utf8').replace(/^\uFEFF/, ''));
  obj.tag = tagOf;
  writeFileSync(confPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  if (tagOf) log(`  내장 태그: ${tagOf}`);
}
log('[2/6] 스테이징 완료 (downloader.ps1 · downloader.json · updates.json · install.ps1 · game.zip)');

// ── ②-b 무결성 검사
const conf = JSON.parse(readFileSync(join(BUILD, 'downloader.json'), 'utf8').replace(/^\uFEFF/, ''));
if (!conf.url || !/^https?:\/\//.test(conf.url)) {
  console.error(`  [실패] downloader.json 의 url 이 올바르지 않습니다: ${conf.url}`);
  process.exit(1);
}
const ps1 = readFileSync(join(BUILD, 'downloader.ps1'), 'utf8');
for (const needle of ['최신 버전 설치', 'install.ps1', 'SELFTEST OK', 'Update-InstallButton', 'Set-PlayLocked', '업데이트 후 시작', '업데이트 내역']) {
  if (!ps1.includes(needle)) {
    console.error(`  [실패] downloader.ps1 에 '${needle}' 가 없습니다`);
    process.exit(1);
  }
}
log('  무결성 확인: url ✓ · 설치 버튼 ✓ · SelfTest ✓');

// ── ③ payload.zip
const payload = join(BUILD, 'payload.zip');
rmSync(payload, { force: true });
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${BUILD}\\downloader.ps1','${BUILD}\\downloader.json','${BUILD}\\updates.json','${BUILD}\\install.ps1','${BUILD}\\game.zip' -DestinationPath '${payload}' -Force"`,
  { cwd: ROOT, stdio: 'inherit' }
);
log(`[3/6] payload.zip ${kb(statSync(payload).size)}`);

// ── ④ csc
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
const tmpExe = join(BUILD, 'downloader.exe');
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
execFileSync(csc, [
  '/nologo',
  ...refArgs,
  '/target:exe',
  '/platform:anycpu',
  '/optimize+',
  '/codepage:65001',
  `/out:${tmpExe}`,
  `/resource:${payload},payload.zip`,
  src
], { cwd: ROOT, stdio: 'inherit' });
log(`[4/6] 컴파일 완료 ${kb(statSync(tmpExe).size)}`);

// ── ⑤ 결과물
rmSync(OUT, { force: true });
copyFileSync(tmpExe, OUT);
log(`[5/6] ${OUT.split('\\').pop()} ${kb(statSync(OUT).size)}`);

// ── ⑤-b 버튼 상태 검사 (install · update · done)
{
  const stateDir = join(BUILD, 'state-probe');
  rmSync(stateDir, { recursive: true, force: true });
  mkdirSync(stateDir, { recursive: true });
  const run = (target) => {
    const out = execFileSync(OUT, ['-StateCheck', target], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    const m = out.match(/STATE installed=(\S+) latest=(\S+) button=(\w+)/);
    return m ? m.slice(1) : ['?', '?', '?'];
  };
  const a = run(stateDir);                       // 설치 전 → install
  mkdirSync(join(stateDir, 'server'), { recursive: true });
  writeFileSync(join(stateDir, 'server', 'index.js'), '// probe\n', 'utf8');
  writeFileSync(join(stateDir, '.yose-version'), 'v0.0.1', 'utf8');
  const b = run(stateDir);                       // 버전 다름 → update
  writeFileSync(join(stateDir, '.yose-version'), tagOf || '내장 판', 'utf8');
  const c = run(stateDir);                       // 최신 → done(버튼 숨김)
  rmSync(stateDir, { recursive: true, force: true });
  const ok = a[2] === 'install' && b[2] === 'update' && c[2] === 'done';
  log(`[5/6] 버튼 상태 검사 ${ok ? 'OK' : '실패'} — 설치 전 ${a[2] || '?'} · 새 버전 ${b[2] || '?'} · 최신 ${c[2] || '?'}`);
  if (!ok) {
    console.error(`  설치 전=${a.join('|')} · 새 버전=${b.join('|')} · 최신=${c.join('|')}`);
    process.exitCode = 1;
  }
}

// ── ⑥ 자체 검사(창 없이 설치 확인) — YOSE_TARGET 로 임시 폴더에 설치
const probe = join(ROOT, '.build-downloader-probe');
rmSync(probe, { recursive: true, force: true });
try {
  const out = execFileSync(OUT, ['-SelfTest', probe], { encoding: 'utf8', timeout: 240000, windowsHide: true });
  const ok = /SELFTEST OK/.test(out) && existsSync(join(probe, 'client', 'dist', 'index.html')) && existsSync(join(probe, 'server', 'index.js'));
  log(`[6/6] 자체 검사 ${ok ? 'OK' : '실패'} — ${probe}`);
  if (!ok) {
    console.error(out.split('\n').slice(-12).join('\n'));
    process.exitCode = 1;
  }
} finally {
  rmSync(probe, { recursive: true, force: true });
  rmSync(BUILD, { recursive: true, force: true });
}

if (!process.exitCode) log('완료 — 실행하면 창이 뜨고 [최신 버전 설치] 로 내려받아 설치합니다');

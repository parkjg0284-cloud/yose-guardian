// 요세의 수호자 — 다운로드 런처 exe 빌더
//   사용: node tools/build-launcher.mjs   (= npm run launcher)
//
//   launcher.ps1 + launcher.json + install.ps1 + game.zip 을 exe 안에 품는다.
//   실행하면 launcher.json 의 주소에서 최신 game.zip 을 받아 설치하고,
//   인터넷이 없거나 실패하면 내장된 game.zip 으로 설치한다.
import { existsSync, mkdirSync, rmSync, statSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, '.build-launcher');
const OUT = join(ROOT, 'YoseGuardian-Launcher.exe');
const GAME = join(ROOT, 'game.zip');
const LAUNCHER_DIR = join(ROOT, 'launcher');
const log = (m) => console.log(`  ${m}`);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

/** zip 안의 항목 이름 — 플레이어 데이터·비밀값이 섞였는지 검사할 때 쓴다 */
function listZipNames(zipPath) {
  const buf = readFileSync(zipPath);
  const names = [];
  for (let i = 0; i < buf.length - 30; i += 1) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const nameLen = buf.readUInt16LE(i + 26);
    if (nameLen === 0 || nameLen > 512) continue;
    const raw = buf.subarray(i + 30, i + 30 + nameLen);
    if (raw.includes(0)) continue;
    const name = raw.toString('utf8');
    if (!name || names.includes(name)) continue;
    names.push(name);
  }
  return names;
}

// ── ① game.zip 준비 (없으면 만든다)
if (!existsSync(GAME)) {
  log('[1/5] game.zip 이 없어 새로 만듭니다...');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'pack-release.mjs')], { cwd: ROOT, stdio: 'inherit' });
} else {
  log(`[1/5] game.zip 확인됨 (${kb(statSync(GAME).size)})`);
}

// ── ② 스테이징 — 런처가 실제로 쓰는 파일만 넣는다
rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });
const need = ['launcher.ps1', 'launcher.json', 'install.ps1'];
for (const f of need) {
  const src = join(LAUNCHER_DIR, f);
  if (!existsSync(src)) {
    console.error(`  [실패] launcher/${f} 가 없습니다`);
    process.exit(1);
  }
  copyFileSync(src, join(BUILD, f));
}
copyFileSync(GAME, join(BUILD, 'game.zip'));
log('[2/5] 스테이징 완료 (launcher.ps1 · launcher.json · install.ps1 · game.zip)');

// ── ②-b 무결성 검사 — 여기서 막지 않으면 사용자 PC 에서 설치가 깨진다
// launcher.json 은 메모장 호환을 위해 BOM 을 붙여 저장돼 있다 — 읽을 때 떼어낸다
const conf = JSON.parse(readFileSync(join(BUILD, 'launcher.json'), 'utf8').replace(/^\uFEFF/, ''));
if (!conf.url || !/^https?:\/\//.test(conf.url)) {
  console.error(`  [실패] launcher.json 의 url 이 올바르지 않습니다: ${conf.url}`);
  process.exit(1);
}
const installSrc = readFileSync(join(BUILD, 'install.ps1'), 'utf8');
if (!installSrc.includes('--prod')) {
  console.error('  [실패] install.ps1 에 --prod 가 없습니다 — 설치 후 화면이 뜨지 않습니다');
  process.exit(1);
}
log(`  무결성 확인: url ✓ · install.ps1 --prod ✓`);

// ── ②-c 비밀값·플레이어 데이터 검사 — exe 는 공개되므로 절대 담으면 안 된다
const zipNames = listZipNames(GAME);
const leaked = zipNames.filter(
  (n) => /(\.db(-shm|-wal)?|\.sqlite3?|\.log)$/i.test(n) || /(^|[\\/])data[\\/]/i.test(n) || /(^|[\\/])\.env(\.|$)/i.test(n)
);
if (leaked.length) {
  console.error(`  [실패] game.zip 에 비밀값/플레이어 데이터가 들어 있습니다: ${leaked.join(', ')}`);
  console.error('         npm run release:pack 으로 깨끗한 패키지를 다시 만드세요.');
  process.exit(1);
}
log('  안전 확인: 비밀값·플레이어 데이터 없음 ✓');

// ── ③ payload.zip
const payload = join(BUILD, 'payload.zip');
rmSync(payload, { force: true });
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${BUILD}\\launcher.ps1','${BUILD}\\launcher.json','${BUILD}\\install.ps1','${BUILD}\\game.zip' -DestinationPath '${payload}' -Force"`,
  { cwd: ROOT, stdio: 'inherit' }
);
log(`[3/5] payload.zip ${kb(statSync(payload).size)}`);

// ── ④ csc 컴파일 (리소스 내장)
const csc = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
].find((p) => existsSync(p));
if (!csc) {
  console.error('  [실패] csc.exe 를 찾을 수 없습니다 (.NET Framework 4 필요)');
  process.exit(1);
}

const src = join(ROOT, 'tools', 'single-launcher.cs');
if (!existsSync(src)) {
  console.error('  [실패] tools/single-launcher.cs 가 없습니다');
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
log(`[4/5] 컴파일 완료 ${kb(statSync(tmpExe).size)}`);

// ── ⑤ 결과물 배치
rmSync(OUT, { force: true });
copyFileSync(tmpExe, OUT);
log(`[5/5] ${OUT.split('\\').pop()} ${kb(statSync(OUT).size)}`);

rmSync(BUILD, { recursive: true, force: true });
log('완료 — 실행하면 최신 게임을 내려받아 설치합니다 (내장 게임은 예비용)');

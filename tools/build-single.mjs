// 단일 파일 설치기 빌드 — 요세의수호자_설치.exe
//   ① payload.zip (launcher.ps1 + install.ps1 + game.zip) 을 만든다
//   ② csc 로 C# 스텁에 리소스로 넣어 exe 하나를 만든다
// 사용: node tools/build-single.mjs
import { existsSync, mkdirSync, rmSync, statSync, copyFileSync, readdirSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

/** 파일을 문자열로 (BOM 제거) */
function readFileSyncText(p) {
  return readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

/** zip 안의 한 파일 내용을 꺼낸다 — 없으면 null (압축 해제 없이 읽는다) */
function readZipEntry(zipPath, entryName) {
  // PowerShell 로 꺼내면 인코딩 문제가 있어 node 내장 zlib 로 직접 푼다.
  const buf = readFileSync(zipPath);
  const nameBuf = Buffer.from(entryName, 'utf8');
  for (let i = 0; i < buf.length - 30; i += 1) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue; // 로컬 헤더 시그니처
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen);
    if (!name.equals(nameBuf)) continue;
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const start = i + 30 + nameLen + extraLen;
    const data = buf.subarray(start, start + compSize);
    if (method === 0) return data.toString('utf8');
    try {
      return inflateRawSync(data).toString('utf8');
    } catch {
      return null;
    }
  }
  return null;
}

/** zip 안의 모든 항목 이름 — 플레이어 데이터가 섞였는지 검사할 때 쓴다 */
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, '.build-single');
const OUT = join(ROOT, '요세의수호자_설치.exe');
const log = (m) => console.log(`  ${m}`);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

// ── ① game.zip 확인 (없으면 만든다)
const gameZip = join(ROOT, 'game.zip');
if (!existsSync(gameZip)) {
  log('[1/5] game.zip 이 없어 새로 만듭니다...');
  execFileSync(process.execPath, [join(ROOT, 'tools', 'pack-release.mjs')], { cwd: ROOT, stdio: 'inherit' });
} else {
  log(`[1/5] game.zip 확인됨 (${kb(statSync(gameZip).size)})`);
}

// ── ② payload 스테이징
rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });
copyFileSync(join(ROOT, 'launcher', 'launcher.ps1'), join(BUILD, 'launcher.ps1'));
copyFileSync(join(ROOT, 'launcher', 'install.ps1'), join(BUILD, 'install.ps1'));
copyFileSync(gameZip, join(BUILD, 'game.zip'));
log('[2/5] payload 스테이징 완료 (launcher.ps1 · install.ps1 · game.zip)');

// ── ②-b 무결성 검사 — 여기서 막지 않으면 사용자 PC 에서 설치가 깨진다
const installSrc = readFileSyncText(join(BUILD, 'install.ps1'));
if (!installSrc.includes('--prod')) {
  console.error('  [실패] install.ps1 에 --prod 가 없습니다 — 설치 후 화면이 뜨지 않습니다');
  process.exit(1);
}
const gamePkg = readZipEntry(gameZip, 'package.json');
if (gamePkg === null) {
  console.error('  [실패] game.zip 안에 package.json 이 없습니다');
  process.exit(1);
}
try {
  JSON.parse(gamePkg);
} catch (err) {
  console.error(`  [실패] game.zip 안의 package.json 이 깨졌습니다 — npm install 이 실패합니다: ${err.message}`);
  process.exit(1);
}
log('  무결성 확인: install.ps1 --prod ✓ · game.zip package.json ✓');

// ── ②-c 플레이어 데이터 검사 — exe 는 공개되므로 절대 담으면 안 된다
const zipNames = listZipNames(gameZip);
const leaked = zipNames.filter((n) => /(\.db(-shm|-wal)?|\.sqlite3?|\.log)$/i.test(n) || /(^|[\\/])data[\\/]/i.test(n));
if (leaked.length) {
  console.error(`  [실패] game.zip 에 플레이어 데이터가 들어 있습니다: ${leaked.join(', ')}`);
  console.error('         npm run release:pack 으로 데이터 없는 패키지를 다시 만드세요.');
  process.exit(1);
}
log('  안전 확인: 플레이어 데이터 없음 ✓');

// ── ③ payload.zip
const payload = join(BUILD, 'payload.zip');
rmSync(payload, { force: true });
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${BUILD}\\launcher.ps1','${BUILD}\\install.ps1','${BUILD}\\game.zip' -DestinationPath '${payload}' -Force"`,
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

const tmpExe = join(BUILD, 'installer.exe');
rmSync(tmpExe, { force: true });
// System.IO.Compression 은 참조를 명시해야 ZipArchive 를 찾는다
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
log('완료 — 이 파일 하나로 설치됩니다 (게임 내장)');

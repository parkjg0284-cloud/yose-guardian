// 릴리스 패키지 생성 — game.zip + 런처 zip
//   사용: node tools/pack-release.mjs
import { createWriteStream, existsSync, mkdirSync, rmSync, statSync, readdirSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// 배포하면 절대 안 되는 것 — 플레이어 데이터·로그·의존성
const SKIP_DIRS = new Set(['data', 'node_modules', '.tmp', '.git']);
const SKIP_FILE = /\.(db|db-shm|db-wal|log|sqlite|sqlite3)$/i;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');
const STAGE = join(OUT, 'stage');

const log = (m) => console.log(`  ${m}`);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

// ① 클라이언트 빌드 확인
if (!existsSync(join(ROOT, 'client', 'dist', 'index.html'))) {
  log('[1/4] 클라이언트 빌드...');
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
} else {
  log('[1/4] 클라이언트 빌드 확인됨');
}

// ② 스테이징
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
mkdirSync(join(STAGE, 'client'), { recursive: true });
copyDir(join(ROOT, 'client', 'dist'), join(STAGE, 'client', 'dist'));
copyDir(join(ROOT, 'server'), join(STAGE, 'server'));
copyFileSync(join(ROOT, 'package.json'), join(STAGE, 'package.json'));
for (const f of ['게임앱.vbs', '게임앱실행.cmd', 'app.js']) {
  const src = join(ROOT, f);
  if (existsSync(src)) copyFileSync(src, join(STAGE, f));
}
// 배포본에도 관리자 계정이 동작하도록 런타임 .env 를 넣는다.
//  · release.env 에는 bcrypt 해시만 있고 평문 비밀번호는 없다.
//  · JWT_SECRET 은 넣지 않는다 — 설치 PC마다 data/jwt-secret.txt 로 생성된다.
{
  const releaseEnv = join(ROOT, 'release.env');
  if (!existsSync(releaseEnv)) {
    console.error('  [실패] release.env 가 없습니다 — 배포본 관리자 로그인이 동작하지 않습니다');
    process.exit(1);
  }
  const text = readFileSync(releaseEnv, 'utf8');
  if (/^ADMIN_PASSWORD=/m.test(text)) {
    console.error('  [실패] release.env 에 평문 ADMIN_PASSWORD 가 있습니다 — ADMIN_PASSWORD_HASH 만 넣으세요');
    process.exit(1);
  }
  if (!/^ADMIN_PASSWORD_HASH=\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}\s*$/m.test(text)) {
    console.error('  [실패] release.env 의 ADMIN_PASSWORD_HASH 가 올바른 bcrypt 해시가 아닙니다');
    process.exit(1);
  }
  copyFileSync(releaseEnv, join(STAGE, '.env'));
  log('  런타임 .env 포함 (관리자 bcrypt 해시)');
}
log('[2/4] 스테이징 완료');

// ③ game.zip
const zipPath = join(ROOT, 'game.zip');
rmSync(zipPath, { force: true });
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${STAGE}\\*' -DestinationPath '${zipPath}' -Force"`, { cwd: ROOT, stdio: 'inherit' });
log(`[3/4] game.zip ${kb(statSync(zipPath).size)}`);

// ③-b 안전 검사 — 플레이어 데이터가 들어가면 배포를 중단한다
{
  const out = execFileSync('powershell', ['-NoProfile', '-Command',
    `Add-Type -AssemblyName System.IO.Compression.FileSystem; ` +
    `$z=[System.IO.Compression.ZipFile]::OpenRead('${zipPath}'); ` +
    `$z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()`], { encoding: 'utf8' });
  const bad = out.split(/\r?\n/).filter((n) => /(\.db(-shm|-wal)?|\.sqlite3?|\.log)$/i.test(n.trim()) || /(^|[\\/])data[\\/]/i.test(n));
  if (bad.length) {
    console.error(`  [실패] game.zip 에 플레이어 데이터가 들어 있습니다: ${bad.join(', ')}`);
    rmSync(zipPath, { force: true });
    process.exit(1);
  }
  log('  안전 확인: 플레이어 데이터 없음 ✓');
}

// ④ 런처 zip — 방금 만든 game.zip 을 함께 넣어 오프라인에서도 설치되게 한다
const lzip = join(ROOT, 'YoseGuardian-launcher.zip');
const lstage = join(OUT, 'launcher-pack');
rmSync(lzip, { force: true });
rmSync(lstage, { recursive: true, force: true });
mkdirSync(lstage, { recursive: true });
copyDir(join(ROOT, 'launcher'), lstage);
copyFileSync(zipPath, join(lstage, 'game.zip'));   // 항상 새 것으로 덮어쓴다
execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${lstage}\\*' -DestinationPath '${lzip}' -Force"`, { cwd: ROOT, stdio: 'inherit' });
log(`[4/4] YoseGuardian-launcher.zip ${kb(statSync(lzip).size)} (game.zip 동봉)`);

log('완료 — GitHub Releases 에 두 파일을 올리세요');


function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory() && SKIP_DIRS.has(e.name)) {
      log(`  [건너뜀] ${join(src, e.name)} — 배포 대상 아님 (데이터/의존성)`);
      continue;
    }
    if (e.isFile() && SKIP_FILE.test(e.name)) {
      log(`  [건너뜀] ${join(src, e.name)} — 플레이어 데이터`);
      continue;
    }
    const s = join(src, e.name);
    const d = join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) copyFileSync(s, d);
  }
}
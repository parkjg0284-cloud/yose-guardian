// 관리자 인증 회귀 테스트 — 해시(.env ADMIN_PASSWORD_HASH) · 평문 · JWT 키 영속화
//   실행: node tools/admin-auth-test.mjs
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import bcrypt from 'bcryptjs';

const dir = mkdtempSync(join(tmpdir(), 'yose-admin-auth-'));
const releaseEnv = readFileSync(new URL('../release.env', import.meta.url), 'utf8');
const dbPath = join(dir, 'game.db');
const jwtFile = join(dir, 'jwt-secret.txt');
const passA = 'AdminPass-A-2026!';
const passB = 'AdminPass-B-2026!';
const hashA = bcrypt.hashSync(passA, 10);
const hashB = bcrypt.hashSync(passB, 10);

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

check('release.env — bcrypt 해시 포함', /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/m.test(releaseEnv.split(/\r?\n/).find((l) => l.startsWith('ADMIN_PASSWORD_HASH='))?.slice('ADMIN_PASSWORD_HASH='.length) || ''));
check('release.env — 평문 ADMIN_PASSWORD 없음', !/^ADMIN_PASSWORD=/m.test(releaseEnv));

process.env.DB_PATH = dbPath;
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_NICKNAME = '관리자';
delete process.env.ADMIN_PASSWORD;
delete process.env.JWT_SECRET;
delete process.env.ADMIN_PASSWORD_HASH;

const { initDb, closeDb } = await import('../server/db.js');
initDb(dbPath);
const { ensureAdminAccount, adminCredentials, jwtSecret } = await import('../server/api/auth.js');

// 1) 해시만 있는 배포 .env — 계정 생성 + 해시 그대로 저장
process.env.ADMIN_PASSWORD_HASH = hashA;
const created = ensureAdminAccount();
const rowA = initDb(dbPath).prepare("SELECT id, username, role, password_hash FROM users WHERE username = 'admin'").get();
check('해시 .env — 관리자 계정 생성', created.created === true);
check('해시 .env — role=admin', rowA?.role === 'admin');
check('해시 .env — 해시 문자열 그대로 저장(재해시 없음)', rowA?.password_hash === hashA);
check('해시 .env — 입력 비밀번호 bcrypt 통과', bcrypt.compareSync(passA, rowA?.password_hash ?? ''));
check('해시 .env — 다른 비밀번호 거부', !bcrypt.compareSync(passB, rowA?.password_hash ?? ''));
check('해시 .env — 평문 password 는 비어 있음', adminCredentials().password === '');

// 2) 서버 재시작과 같은 재호출 — 같은 해시면 불필요한 UPDATE 없음
const again = ensureAdminAccount();
check('해시 재시작 — reset=false', again.reset === false);
const rowA2 = initDb(dbPath).prepare("SELECT password_hash FROM users WHERE username = 'admin'").get();
check('해시 재시작 — 해시 유지', rowA2?.password_hash === hashA);

// 3) 새 해시로 교체 — 다음 시작 때 관리자 비밀번호 갱신
process.env.ADMIN_PASSWORD_HASH = hashB;
const rotated = ensureAdminAccount();
const rowB = initDb(dbPath).prepare("SELECT password_hash FROM users WHERE username = 'admin'").get();
check('해시 교체 — reset=true', rotated.reset === true);
check('해시 교체 — 새 해시 반영', rowB?.password_hash === hashB);
check('해시 교체 — 새 비밀번호 통과', bcrypt.compareSync(passB, rowB?.password_hash ?? ''));
check('해시 교체 — 이전 비밀번호 거부', !bcrypt.compareSync(passA, rowB?.password_hash ?? ''));

// 4) 평문 .env(기존 설치) — 기존처럼 bcrypt 비교 후 필요할 때만 재설정
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PASSWORD = passA;
const plain = ensureAdminAccount();
const rowC = initDb(dbPath).prepare("SELECT password_hash FROM users WHERE username = 'admin'").get();
check('평문 .env — reset=true', plain.reset === true);
check('평문 .env — 새 비밀번호 통과', bcrypt.compareSync(passA, rowC?.password_hash ?? ''));

// 5) JWT — env 우선, 없으면 DB 옆에 한 번 생성해 재사용
process.env.JWT_SECRET = '';
const jwt1 = jwtSecret();
const jwt2 = jwtSecret();
check('JWT — 64자 무작위 키', /^[0-9a-f]{64}$/.test(jwt1), jwt1.slice(0, 8));
check('JWT — 같은 프로세스에서 재사용', jwt1 === jwt2);
check('JWT — data/jwt-secret.txt 저장', existsSync(jwtFile));
check('JWT — 파일 값과 일치', readFileSync(jwtFile, 'utf8').trim() === jwt1);
process.env.JWT_SECRET = 'env-secret-value-for-test';
check('JWT — .env JWT_SECRET 우선', jwtSecret() === 'env-secret-value-for-test');

closeDb();
try { rmSync(dir, { recursive: true, force: true }); } catch { /* 무시 */ }
console.log(`\n관리자 인증 테스트: ${passed} 통과 / ${failed} 실패`);
if (failed) process.exit(1);

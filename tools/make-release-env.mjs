// 릴리스 game.zip 에 넣을 런타임 .env 생성 — 평문 비밀번호는 쓰지 않고 bcrypt 해시만 남긴다.
//   사용:
//     ADMIN_PASSWORD=... node tools/make-release-env.mjs --out .env.release.generated
//     ADMIN_PASSWORD_HASH='$2b$10$...' node tools/make-release-env.mjs --out .env.release.generated
//   GitHub Actions 에서는 저장소 Secret(ADMIN_PASSWORD 또는 ADMIN_PASSWORD_HASH)을 환경변수로 받아 실행한다.
import { writeFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';

const BCRYPT_HASH_RE = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function argValue(name, fallback = '') {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const out = argValue('--out', '.env.release.generated');
const username = String(process.env.ADMIN_USERNAME || 'admin').trim();
const nickname = String(process.env.ADMIN_NICKNAME || '관리자').trim() || '관리자';
const rawPass = typeof process.env.ADMIN_PASSWORD === 'string' ? process.env.ADMIN_PASSWORD : '';
const rawHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim().replace(/^["']|["']$/g, '');

let passwordHash = '';
if (rawPass) {
  if (rawPass.length < 4 || rawPass.length > 72) {
    console.error('[실패] ADMIN_PASSWORD 는 4~72자여야 합니다');
    process.exit(1);
  }
  passwordHash = bcrypt.hashSync(rawPass, 10);
} else if (BCRYPT_HASH_RE.test(rawHash)) {
  passwordHash = rawHash;
} else if (rawHash) {
  console.error('[실패] ADMIN_PASSWORD_HASH 가 올바른 bcrypt 해시가 아닙니다');
  process.exit(1);
}

if (!passwordHash) {
  console.error('[실패] ADMIN_PASSWORD 또는 ADMIN_PASSWORD_HASH 가 필요합니다');
  process.exit(1);
}
if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
  console.error('[실패] ADMIN_USERNAME 은 영문/숫자/_ 3~20자여야 합니다');
  process.exit(1);
}

// 평문 비밀번호 줄은 절대 만들지 않는다. JWT_SECRET 도 넣지 않는다(설치 PC마다 생성).
const lines = [
  '# 요세의 수호자 — 릴리스 game.zip 런타임 설정 (자동 생성)',
  `NODE_ENV=${process.env.NODE_ENV || 'production'}`,
  `PORT=${process.env.PORT || '3001'}`,
  'DB_PATH=./server/data/game.db',
  `CLIENT_ORIGIN=${process.env.CLIENT_ORIGIN || '*'}`,
  `ADMIN_USERNAME=${username}`,
  `ADMIN_PASSWORD_HASH=${passwordHash}`,
  `ADMIN_NICKNAME=${nickname}`,
  '',
];
writeFileSync(out, lines.join('\n'), 'utf8');
if (/^ADMIN_PASSWORD=/m.test(lines.join('\n'))) {
  console.error('[실패] 평문 ADMIN_PASSWORD 가 생성되었습니다');
  process.exit(1);
}
console.log(`  런타임 .env 생성: ${out} (관리자 ${username}, bcrypt 해시)`);

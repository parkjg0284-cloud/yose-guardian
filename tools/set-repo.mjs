// 저장소 주소 채우기 — USER/REPO 자리표시자를 실제 GitHub 주소로 바꾼다.
//   사용: node tools/set-repo.mjs <아이디>/<저장소>
//   예  : node tools/set-repo.mjs honggildong/yose-guardian
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (process.argv[2] || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');

if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(arg)) {
  console.error('  사용법: node tools/set-repo.mjs <아이디>/<저장소>');
  console.error('   예시: node tools/set-repo.mjs honggildong/yose-guardian');
  process.exit(1);
}

// 주소를 넣을 파일들 — 자리표시자 USER/REPO 가 들어 있는 곳
const TARGETS = [
  'launcher/launcher.json',
  'launcher/설치실행.cmd',
  'launcher/런처.cmd',
  'installer/launcher.json',
  '.github/workflows/release.yml',
  'README.md',
  'GITHUB_UPLOAD.md',
  'LAUNCHER.md'
];

let changed = 0;
for (const rel of TARGETS) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) continue;
  const before = readFileSync(path, 'utf8');
  if (!before.includes('USER/REPO')) {
    console.log(`  · ${rel} — 자리표시자 없음`);
    continue;
  }
  const after = before.split('USER/REPO').join(arg);
  writeFileSync(path, after, 'utf8');
  const n = before.split('USER/REPO').length - 1;
  console.log(`  ✓ ${rel} — ${n}곳 교체`);
  changed += n;
}

if (changed === 0) {
  console.log('  [안내] 바꿀 자리표시자가 없습니다 — 이미 설정되어 있습니다.');
} else {
  console.log(`  주소: https://github.com/${arg} (${changed}곳)`);
  console.log('  다음: git add -A && git commit -m "저장소 주소 설정"');
}

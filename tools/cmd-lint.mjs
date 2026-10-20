// cmd/배치 파일 린트 — 한글로 줄이 끝나면 cmd 가 CR 을 삼켜 스크립트가 깨진다.
// 사용 : npm run cmd-lint   (실패 시 종료코드 1)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(['node_modules', '.git', '.tmp', '.npm-cache', 'release', 'dist']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(cmd|bat)$/i.test(name)) out.push(full);
  }
  return out;
}

let bad = 0;
const files = walk(ROOT);
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);
  const crlf = text.includes('\r\n');
  const lines = text.split(/\r?\n/);
  const nonAsciiEnd = [];
  lines.forEach((l, i) => { if (l.length && l.charCodeAt(l.length - 1) > 127) nonAsciiEnd.push(i + 1); });
  const bom = text.charCodeAt(0) === 0xFEFF;
  const problems = [];
  if (!crlf) problems.push('CRLF 아님(LF)');
  if (nonAsciiEnd.length) problems.push('비ASCII 로 끝나는 줄 ' + nonAsciiEnd.join(',') + ' (cmd 가 줄을 삼킴)');
  if (problems.length) { bad += 1; console.log('  X  ' + rel + ' — ' + problems.join(' · ')); }
  else console.log('  OK ' + rel + ' — ' + lines.length + '줄' + (bom ? ' (BOM)' : ''));
}
console.log('\n배치 파일 린트: ' + files.length + '개 중 ' + (files.length - bad) + '개 정상 / ' + bad + '개 문제');
process.exit(bad ? 1 : 0);

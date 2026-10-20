// 요새의 수호자 — 다운로드 서버 (run.cmd 가 함께 띄운다)
//  · <repo>/release/*.zip 과 안내문을 브라우저에서 바로 내려받게 한다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { localShareUrls } from '../server/net-info.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = path.join(ROOT, 'release');
const PORT_START = Number(process.env.DL_PORT || 8099);

const stat = (p) => { try { return fs.statSync(p); } catch { return null; } };
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

const newest = (ext, { skip = [] } = {}) => {
  const dir = stat(RELEASE);
  if (!dir || !dir.isDirectory()) return null;
  const files = fs
    .readdirSync(RELEASE)
    .filter((f) => f.toLowerCase().endsWith(ext) && !skip.includes(f));
  if (files.length === 0) return null;
  // 최신(수정 시각) 순 — 숫자 비교(문자열 비교는 자릿수가 다르면 틀린다)
  files.sort((a, b) => (stat(path.join(RELEASE, b))?.mtimeMs || 0) - (stat(path.join(RELEASE, a))?.mtimeMs || 0));
  return files[0];
};

const html = () => {
  const zip = newest('.zip');
  const guide = newest('.txt');
  const rows = [];
  if (zip) {
    rows.push(`<a class="card" href="/download"><span><span class="name">게임 압축 — ${zip}</span>` +
      `<div class="meta">소스 + 빌드 실행본(dist) + 문서 · ${mb(stat(path.join(RELEASE, zip))?.size || 0)}</div></span>` +
      `<span class="go">다운로드</span></a>`);
  } else {
    rows.push('<p class="empty">release 폴더에 zip 이 없습니다. <code>node tools/pack-release.mjs</code> 로 만들 수 있습니다.</p>');
  }
  if (guide) rows.push(`<a class="card" href="/guide"><span><span class="name">실행 안내 — ${guide}</span>` +
    `<div class="meta">압축 풀고 npm install → npm run start → http://localhost:3001</div></span>` +
    `<span class="go">열기</span></a>`);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>다운로드 — 요새의 수호자</title>` +
    '<style>body{font-family:system-ui,\'Malgun Gothic\',sans-serif;background:#12151c;color:#e8ecf4;margin:0;padding:40px 20px}' +
    '.wrap{max-width:760px;margin:0 auto}h1{font-size:22px;margin:0 0 6px}p.sub{color:#9aa6bd;margin:0 0 24px;font-size:14px}' +
    'a.card{display:flex;justify-content:space-between;align-items:center;gap:16px;background:#1c2130;border:1px solid #2c3448;border-left:4px solid #5ad1a0;border-radius:10px;padding:16px 18px;margin:0 0 12px;text-decoration:none;color:inherit}' +
    'a.card:hover{background:#232a3c}.name{font-weight:700;font-size:15px}.meta{color:#8b97ad;font-size:12.5px;margin-top:4px}' +
    '.go{background:#5ad1a0;color:#0d1017;font-weight:800;border-radius:8px;padding:9px 14px;font-size:13px;white-space:nowrap}' +
    '.empty{color:#ffb4a2}code{background:#232a3c;border-radius:4px;padding:1px 5px}</style></head><body><div class="wrap">' +
    '<h1>🎮 요새의 수호자 — 다운로드</h1><p class="sub">버튼을 누르면 바로 내려받습니다(브라우저 저장 폴더로 저장).</p>' +
    rows.join('') + '<p class="sub" style="margin-top:20px">파일 이름이 깨져 보이면 <a href="/download-ascii" style="color:#5ad1a0">ASCII 이름으로 받기</a>.</p>' +
    '</div></body></html>';
};

const sendFile = (res, name, { inline = false } = {}) => {
  if (!name) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('파일 없음'); return; }
  const file = path.join(RELEASE, name);
  const st = stat(file);
  if (!st) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('파일 없음'); return; }
  const isZip = name.toLowerCase().endsWith('.zip');
  const headers = { 'content-type': isZip ? 'application/zip' : 'text/plain; charset=utf-8', 'content-length': st.size, 'cache-control': 'no-store' };
  if (!inline) {
    headers['content-disposition'] = `attachment; filename="fortress-guardian${isZip ? '.zip' : '.txt'}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
};

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/' || url === '/index.html') {
    const body = Buffer.from(html(), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': body.length });
    res.end(body);
    return;
  }
  if (url === '/download' || url === '/download-ascii') return sendFile(res, newest('.zip'));
  if (url === '/download-kr') return sendFile(res, newest('.zip'));
  if (url === '/guide') return sendFile(res, newest('.txt', { skip: ['README.txt'] }), { inline: true });
  if (url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('없는 경로입니다. / 로 들어오세요.');
});

const portFree = (port) =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '0.0.0.0');
  });

(async () => {
  let port = PORT_START;
  for (let i = 0; i < 10 && !(await portFree(port)); i++) port += 1;
  server.listen(port, '0.0.0.0', () => {
    const zip = newest('.zip');
    console.log('  📦 다운로드 서버 : http://localhost:' + port + '   ← zip/안내문 내려받기');
    try {
      const share = localShareUrls({ port, protocol: 'http' });
      share.urls.slice(0, 1).forEach((u) => console.log('     다른 기기   : ' + u));
    } catch { /* 무시 */ }
    console.log('     파일        : ' + (zip || '(release 폴더가 비어 있습니다)'));
  });
  server.on('error', (err) => console.error('  ⚠️  다운로드 서버 오류:', err?.message || err));
})();

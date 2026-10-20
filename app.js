// 요세의 수호자 — 데스크톱 앱 런처 (서버 자동 실행 + 전용 앱 창)
// 웹 브라우저 주소창/탭 없이 독립 앱 창으로 게임을 연다.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3001);
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const logFile = path.join(ROOT, 'app-log.txt');
const log = (m) => { const line = `[${new Date().toISOString()}] ${m}`; try { fs.appendFileSync(logFile, line + '\r\n'); } catch { /* 무시 */ } console.log(m); };

function probe(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500); });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
  });
}

async function waitServer(maxMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (await probe(`http://127.0.0.1:${PORT}/api/health`)) return true;
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

(async () => {
  log('앱 시작');
  const already = await probe(`http://127.0.0.1:${PORT}/api/health`);
  if (already) {
    log('이미 실행 중인 서버를 사용합니다');
  } else {
    log('게임 서버를 시작합니다...');
    const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
      cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true,
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    });
    server.unref();
    const ok = await waitServer();
    log(ok ? '서버 준비 완료' : '서버 응답 없음 — 그래도 창을 엽니다');
  }
  if (!EDGE) { log('브라우저를 찾지 못했습니다'); process.exit(1); }
  const profile = path.join(os.tmpdir(), 'yose-app-profile');
  const url = `http://127.0.0.1:${PORT}/`;
  log('앱 창 열기: ' + url);
  const child = spawn(EDGE, [
    `--app=${url}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,900',
    '--disable-features=Translate',
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  log('앱 창을 열었습니다 (이 창은 닫아도 됩니다)');
  setTimeout(() => process.exit(0), 1500);
})();
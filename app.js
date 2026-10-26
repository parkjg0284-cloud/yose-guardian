// 요세의 수호자 — 데스크톱 앱 런처 (서버 자동 실행 + 전용 앱 창)
// 웹 브라우저 주소창/탭 없이 독립 앱 창으로 게임을 연다.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');

const ROOT = __dirname;

// .env 의 PORT 를 읽는다 — 설정 화면에서 포트를 바꾸면 다음 앱 실행부터 이 값으로 뜬다.
// (서버와 같은 규칙: 명시적 환경변수 > .env > 3001)
function readEnvPort() {
  try {
    const file = process.env.YOSE_ENV_FILE ? path.resolve(ROOT, process.env.YOSE_ENV_FILE) : path.join(ROOT, '.env');
    const raw = fs.readFileSync(file, 'utf8');
    let found = 0;
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*PORT\s*=\s*(.*?)\s*$/i.exec(line);
      if (!m) continue;
      const n = Number(String(m[1]).replace(/^['"]|['"]$/g, ''));
      if (Number.isInteger(n) && n >= 1024 && n <= 65535) found = n;
    }
    return found;
  } catch {
    return 0;
  }
}

const PORT = (() => {
  const fromEnv = Number(process.env.PORT);
  if (Number.isInteger(fromEnv) && fromEnv >= 1024 && fromEnv <= 65535) return fromEnv;
  return readEnvPort() || 3001;
})();
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
// 요세의 수호자 — GitHub Pages 용 스크린샷 (v1.6.0)
//   사용: node tools/pages-shot.mjs [url]
//   → docs/img/menu.png (메인 메뉴), docs/img/game.png (게임 화면)
//   실제 Chrome(헤드리스)으로 접속해 캡처하므로 Pages 미리보기가 실제 화면과 같다.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROMES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = CHROMES.find((p) => existsSync(p));
if (!chromePath) {
  console.log('브라우저가 없어 스크린샷을 건너뜁니다.');
  process.exit(0);
}

const url = process.argv[2] || 'http://127.0.0.1:3001';
const outDir = join(process.cwd(), 'docs', 'img');
mkdirSync(outDir, { recursive: true });
const port = 9444;
const profile = join(tmpdir(), `yose-shot-${Date.now()}`);
mkdirSync(profile, { recursive: true });

const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1440,810',
    'about:blank'
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const finish = (code) => {
  try {
    chrome.kill();
  } catch {
    /* 무시 */
  }
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* 무시 */
  }
  process.exit(code);
};

let list = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try {
    list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    if (list.length) break;
  } catch {
    /* 아직 */
  }
}
const page = list?.find((t) => t.type === 'page');
if (!page) {
  console.log('✗ 브라우저 페이지를 열지 못했습니다.');
  finish(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let seq = 0;
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 810, deviceScaleFactor: 1, mobile: false });

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(r.data, 'base64');
  const p = join(outDir, name);
  writeFileSync(p, buf);
  console.log(`  ✓ ${name} ${(buf.length / 1024).toFixed(1)}KB`);
  return buf.length;
};

await send('Page.navigate', { url });
await sleep(10000);

// 메뉴 상태 — 로딩이 끝난 화면만 남긴다
const menuState = await evalJs(`document.getElementById('menu-root')?.dataset.view || ''`);
console.log(`  메뉴 상태: ${menuState || '(없음)'}`);
await shot('menu.png');

// 게임 시작 — data-act 가 있으면 그것, 없으면 '시작' 글자 버튼
const started = await evalJs(`(() => {
  const acts = ['start', 'startGame', 'play', 'solo'];
  for (const a of acts) {
    const el = document.querySelector('[data-act="' + a + '"]');
    if (el) { el.click(); return a; }
  }
  const b = [...document.querySelectorAll('button')].find((x) => /게임 시작|시작하기|혼자 하기|싱글/.test(x.textContent || ''));
  if (b) { b.click(); return 'text'; }
  return '';
})()`);
console.log(`  시작 클릭: ${started || '(못 찾음)'}`);
await sleep(7000);
await shot('game.png');

// HUD 가 있으면 살짝 더 기다렸다 한 장 더 (없으면 생략)
const hud = await evalJs(`!!document.querySelector('#hud, .hud, #game-hud')`);
if (hud) {
  await sleep(2500);
  await shot('hud.png');
}

console.log('  완료 — docs/img/ 에 저장했습니다');
finish(0);

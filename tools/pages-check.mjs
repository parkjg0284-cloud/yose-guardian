// 요세의 수호자 — GitHub Pages 페이지 검사 (v1.6.0)
//   사용: node tools/pages-check.mjs [url|file]
//   기본: docs/index.html 을 file:// 로 열어 레이아웃·이미지·링크를 확인한다.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROMES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = CHROMES.find((p) => existsSync(p));
if (!chromePath) {
  console.log('브라우저가 없어 페이지 검사를 건너뜁니다.');
  process.exit(0);
}

const arg = process.argv[2] || join(process.cwd(), 'docs', 'index.html');
const url = /^https?:/i.test(arg) ? arg : pathToFileURL(resolve(arg)).href;
const port = 9446;
const profile = join(tmpdir(), `yose-page-${Date.now()}`);
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
    '--window-size=1440,900',
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
const errors = [];
let seq = 0;
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    errors.push(`${d.text} ${d.exception?.description || ''}`.slice(0, 200));
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`  PASS ${name} ${detail}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name} ${detail}`);
  }
};

await send('Page.navigate', { url });
await sleep(3000);

// lazy 이미지까지 실제로 로드되도록 끝까지 스크롤했다가 돌아온다
await evalJs(`window.scrollTo(0, document.body.scrollHeight)`);
await sleep(1600);
await evalJs(`window.scrollTo(0, 0)`);
await sleep(400);

const info = await evalJs(`(() => {
  const q = (s) => document.querySelector(s);
  const imgs = [...document.images].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth }));
  const links = [...document.querySelectorAll('a[href]')].map((a) => a.href);
  return {
    title: document.title,
    h1: q('h1')?.textContent?.trim() || '',
    h2: document.querySelectorAll('h2').length,
    cards: document.querySelectorAll('.card').length,
    steps: document.querySelectorAll('ol.steps li').length,
    keys: document.querySelectorAll('.keys div').length,
    imgs,
    launcher: links.filter((h) => h.includes('YoseGuardian-Launcher.exe')).length,
    repo: links.filter((h) => h.includes('github.com/parkjg0284-cloud/yose-guardian')).length,
    discord: links.filter((h) => h.includes('discord.gg/BSCgjrmTEx')).length,
    scrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    bodyH: document.body.getBoundingClientRect().height,
    bg: getComputedStyle(document.body).backgroundColor,
  };
})()`);

check('페이지 제목', /요세의 수호자/.test(info?.title || ''), info?.title || '');
check('히어로 제목', /수호자/.test(info?.h1 || ''), (info?.h1 || '').replace(/\s+/g, ' '));
check('섹션 제목 4개 이상', (info?.h2 || 0) >= 4, `h2=${info?.h2}`);
check('특징 카드 6개 이상', (info?.cards || 0) >= 6, `card=${info?.cards}`);
check('설치 3단계', info?.steps === 3, `steps=${info?.steps}`);
check('조작 13줄', info?.keys === 13, `keys=${info?.keys}`);
const badImgs = (info?.imgs || []).filter((i) => !i.ok);
check('스크린샷 로드', (info?.imgs || []).length >= 2 && badImgs.length === 0, badImgs.map((i) => i.src).join(',') || `${info?.imgs?.length}장`);
check('런처 다운로드 링크', (info?.launcher || 0) >= 1, `links=${info?.launcher}`);
check('GitHub 링크', (info?.repo || 0) >= 3, `links=${info?.repo}`);
check('디스코드 초대 링크', (info?.discord || 0) >= 3, `links=${info?.discord}`);
check('가로 넘침 없음', (info?.scrollW || 0) <= (info?.innerW || 0) + 1, `${info?.scrollW} <= ${info?.innerW}`);
check('콘솔 오류 없음', errors.length === 0, errors[0] || '');

// 좁은 화면에서도 가로 넘침이 없는지
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await sleep(600);
const mobile = await evalJs(`({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth })`);
check('모바일 가로 넘침 없음', (mobile?.scrollW || 0) <= (mobile?.innerW || 0) + 1, `${mobile?.scrollW} <= ${mobile?.innerW}`);

console.log(`\n  결과: ${pass} 통과 / ${fail} 실패`);
finish(fail === 0 ? 0 : 1);

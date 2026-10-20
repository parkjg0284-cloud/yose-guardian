// tools/boot-check.mjs — 실제 브라우저(Chrome headless)로 게임 부팅·시작을 검사한다.
//
//   node tools/boot-check.mjs [url]
//
// 왜 필요한가: 단위 테스트(ui-dom)는 DOM 스텁이라 main.js 의 런타임 ReferenceError 같은
//  "부팅 직후 죽는" 오류를 잡지 못한다(v1.0.9 에서 safe 미정의로 실제로 게임이 안 켜졌다).
//  이 검사는 진짜 Chrome 에 페이지를 띄워 [부팅 → 싱글 플레이 → 혼자 지키기] 흐름을
//  확인하고, 콘솔 error 가 하나라도 있으면 실패한다. (브라우저가 없으면 건너뛴다.)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROMES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
];
const chromePath = CHROMES.find((p) => existsSync(p));
if (!chromePath) {
  console.log('브라우저가 없어 건너뜁니다(부팅 검사 생략).');
  process.exit(0);
}

const url = process.argv[2] || 'http://127.0.0.1:3001';
const port = 9333;
const profile = join(tmpdir(), `yose-boot-${Date.now()}`);
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
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,800',
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
const logs = [];
const errors = [];
let seq = 0;
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
    logs.push(`[console.${msg.params.type}] ${text}`);
    if (msg.params.type === 'error') errors.push(text.slice(0, 300));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    errors.push(`${d.text} ${d.exception?.description || ''}`.slice(0, 300));
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

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};
const click = (act) =>
  evalJs(`(() => { const el = [...document.querySelectorAll('[data-act="${act}"]')].pop(); if (!el) return false; el.click(); return true; })()`);

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
await sleep(9000);

check('부팅 — 메뉴가 뜬다', (await evalJs(`document.getElementById('menu-root')?.dataset.view`)) === 'main');
check('부팅 — 치명적 오류 없음', !errors.some((e) => e.includes('치명적')), errors.find((e) => e.includes('치명적')) || '');
check('부팅 — 콘솔 error 없음', errors.length === 0, errors[0] || '');

// 싱글 플레이 → 혼자 지키기
check('메뉴 — [싱글 플레이] 클릭', await click('world'));
await sleep(600);
check('메뉴 — 싱글 화면으로 전환', (await evalJs(`document.getElementById('menu-root')?.dataset.view`)) === 'solo');
check('메뉴 — [혼자 지키기] 클릭', await click('menu-start'));
await sleep(2500);
const menuHidden = await evalJs(
  `(() => { const r = document.getElementById('menu-root'); return Boolean(r && (r.hidden || r.classList.contains('hidden'))); })()`
);
check('게임 — 시작하면 메뉴가 사라진다', Boolean(menuHidden));
check('게임 — 캔버스가 있다', (await evalJs(`document.querySelectorAll('canvas').length`)) >= 1);
check('게임 — 시작 후 콘솔 error 없음', errors.length === 0, errors[0] || '');

console.log(`부팅 검사: ${pass} 통과 / ${fail} 실패`);
for (const [i, l] of logs.entries()) if (i < 5) console.log(`   ${l}`);
ws.close();
finish(fail ? 1 : 0);

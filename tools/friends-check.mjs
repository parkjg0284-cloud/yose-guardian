// tools/friends-check.mjs — 친구창 실제 브라우저 검사 (Chrome headless · CDP).
//
//   node tools/friends-check.mjs [url]
//
// 확인하는 것
//   1) U 키로 친구창이 열리고 내 친구 코드(XXXX-XXXX)가 보인다
//   2) [＋ 친구 추가] → 친구 코드 입력창이 뜨고, 코드를 넣으면 목록에 카드가 생긴다
//   3) 코드가 저장되어(새로고침 없이) 목록에 남는다 · 잘못된 코드는 오류 문구
//   4) 친구에 주소·방 코드가 있으면 [들어가기] 가 켜지고 서버 주소가 ?room=CODE 로 만들어진다
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
  console.log('브라우저가 없어 건너뜁니다(친구 검사 생략).');
  process.exit(0);
}

const url = process.argv[2] || 'http://127.0.0.1:3001';
const port = 9334;
const profile = join(tmpdir(), `yose-friends-${Date.now()}`);
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
  } catch { /* 무시 */ }
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch { /* 무시 */ }
  process.exit(code);
};

let list = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  try {
    list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    if (list.length) break;
  } catch { /* 아직 */ }
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
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 300));
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
const key = async (code, keyName, vk) => {
  const k = { key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
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
await sleep(9000);
check('부팅 — 메뉴가 뜬다', (await evalJs(`document.getElementById('menu-root')?.dataset.view`)) === 'main');

await click('menu-start');
await sleep(2500);
const started = await evalJs(`Boolean(window.__GAME__ && window.__GAME__.state === 'playing')`);
check('게임 시작', started === true, String(started));

// ── 1) U 키로 친구창
await key('KeyU', 'u', 85);
await sleep(600);
const openInfo = await evalJs(`(() => {
  const root = document.getElementById('friends-root');
  const code = root?.querySelector('[data-role="my-friend-code"] strong')?.textContent || '';
  return { hidden: !root || root.classList.contains('hidden'), code };
})()`);
check('친구창 — U 키로 열린다', openInfo && openInfo.hidden === false, JSON.stringify(openInfo));
check('친구창 — 내 친구 코드 4-4', /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(openInfo?.code || ''), openInfo?.code || '');

// ── 2) 친구 추가 — 코드 입력창
check('친구창 — [＋ 친구 추가] 클릭', await click('friend-add-open'));
await sleep(300);
const formInfo = await evalJs(`(() => {
  const form = document.querySelector('[data-role="friend-add-form"]');
  return { form: Boolean(form), title: form?.querySelector('.friends-add-title')?.textContent || '',
    input: Boolean(form?.querySelector('[data-role="friend-code-input"]')) };
})()`);
check('친구 추가 — 코드 입력창이 뜬다', formInfo.form && formInfo.input && formInfo.title.includes('친구 코드'), JSON.stringify(formInfo));

await evalJs(`(() => {
  const set = (role, value) => { const el = document.querySelector('[data-role="' + role + '"]'); if (el) el.value = value; };
  set('friend-code-input', 'abcd-efgh');
  set('friend-name-input', '테스트 친구');
  set('friend-address-input', '192.168.0.9:3001');
  return true;
})()`);
check('친구 추가 — [추가] 클릭', await click('friend-add-ok'));
await sleep(500);
const listInfo = await evalJs(`(() => {
  const rows = [...document.querySelectorAll('[data-role="friend-row"]')];
  return { count: rows.length, code: rows[0]?.dataset.code || '',
    name: rows[0]?.querySelector('.friends-card-name')?.textContent || '',
    display: rows[0]?.querySelector('.friends-card-code')?.textContent || '',
    stored: Boolean(localStorage.getItem('fortress.friends.v1')) };
})()`);
check('친구 목록 — 카드가 생긴다', listInfo.count === 1, JSON.stringify(listInfo));
check('친구 목록 — 코드·이름 표시(정규화)', listInfo.code === 'ABCDEFGH' && listInfo.name === '테스트 친구' && listInfo.display === 'ABCD-EFGH', JSON.stringify(listInfo));
check('친구 목록 — 저장된다', listInfo.stored === true);

// ── 3) 잘못된 코드
await click('friend-add-open');
await sleep(200);
await evalJs(`(() => { const el = document.querySelector('[data-role="friend-code-input"]'); if (el) el.value = 'ABC'; return true; })()`);
await click('friend-add-ok');
await sleep(300);
const errText = await evalJs(`document.querySelector('.friends-error')?.textContent || ''`);
check('친구 추가 — 잘못된 코드는 오류', errText.includes('8자리'), errText);

// ── 4) 친구 서버 들어가기(주소 + 방 코드)
const joinInfo = await evalJs(`(() => {
  const f = window.__GAME__.friends;
  f.touch('ABCDEFGH', { room: 'K7F2', online: true, address: '192.168.0.9:3001' });
  return { url: f.serverUrl('ABCDEFGH'), ready: [...document.querySelectorAll('[data-act="friend-join"]')].length };
})()`);
check('친구 서버 — 주소+방 코드로 링크', joinInfo.url === 'http://192.168.0.9:3001/?room=K7F2', JSON.stringify(joinInfo));
await evalJs(`window.__GAME__.ui.friends.render(); true`);
await sleep(300);
const joinBtn = await evalJs(`(() => {
  const rows = [...document.querySelectorAll('[data-role="friend-row"]')];
  const btn = rows[0]?.querySelector('[data-act="friend-join"]');
  return { disabled: Boolean(btn?.disabled), online: rows[0]?.dataset.online,
    state: rows[0]?.querySelector('.friends-state')?.textContent || '',
    room: rows[0]?.querySelector('.friends-card-room')?.textContent || '' };
})()`);
check('친구 목록 — 접속 중이면 [들어가기] 활성', joinBtn.disabled === false && joinBtn.online === '1' && joinBtn.state.includes('접속'), JSON.stringify(joinBtn));
check('친구 목록 — 방 코드 표시', joinBtn.room.includes('K7F2'), joinBtn.room);

// ── 5) 같은 서버의 다른 플레이어 — 코드만으로 방을 찾는다
await evalJs(`(() => {
  const f = window.__GAME__.friends;
  f.remove('ABCDEFGH');
  return fetch('/api/friends/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'ZZZZ2222', name: '옆자리 친구', room: 'M3N4' })
  }).then((r) => r.ok);
})()`);
await evalJs(`window.__GAME__.ui.friends.addFriend('ZZZZ-2222', '옆자리 친구', ''); true`);
await sleep(200);
const beforeSync = await evalJs(`(() => {
  const rows = [...document.querySelectorAll('[data-role="friend-row"]')];
  return { count: rows.length, online: rows[0]?.dataset.online || '', room: rows[0]?.querySelector('.friends-card-room')?.textContent || '' };
})()`);
check('친구 동기화 — 추가 직후에는 오프라인', beforeSync.count === 1 && beforeSync.online === '0', JSON.stringify(beforeSync));
await evalJs(`window.__GAME__.ui.friends.refresh()`);
await sleep(1200);
const synced = await evalJs(`(() => {
  const f = window.__GAME__.friends;
  const rows = [...document.querySelectorAll('[data-role="friend-row"]')];
  return { online: rows[0]?.dataset.online || '', state: rows[0]?.querySelector('.friends-state')?.textContent || '',
    room: rows[0]?.querySelector('.friends-card-room')?.textContent || '', url: f.serverUrl('ZZZZ2222'),
    disabled: Boolean(rows[0]?.querySelector('[data-act="friend-join"]')?.disabled) };
})()`);
check('친구 동기화 — 서버에서 온라인·방 코드를 받아온다', synced.online === '1' && synced.room.includes('M3N4'), JSON.stringify(synced));
check('친구 동기화 — 서버 주소로 [들어가기] 가능', !synced.disabled && /\?room=M3N4$/.test(synced.url), synced.url);

// ── 6) 방을 만들면 내 친구 코드에 방 코드가 등록된다
const announced = await evalJs(`(() => {
  const f = window.__GAME__.friends;
  window.__GAME__.ui.friends.rememberRoom('P9Q8');
  return new Promise((resolve) => setTimeout(() => {
    fetch('/api/friends/lookup?code=' + f.code).then((r) => r.json()).then((j) => resolve({ room: j?.friend?.room || '', online: j?.friend?.online === true }));
  }, 600));
})()`);
check('친구 코드 — 방을 만들면 내 방이 등록된다', announced.room === 'P9Q8' && announced.online, JSON.stringify(announced));

// ── 7) 닫기
check('친구창 — [닫기] 클릭', await click('friend-close'));
await sleep(400);
const closed = await evalJs(`document.getElementById('friends-root')?.classList.contains('hidden')`);
check('친구창 — 닫힌다', closed === true);

check('친구 검사 — 콘솔 error 없음', errors.length === 0, errors[0] || '');

console.log(`친구 검사: ${pass} 통과 / ${fail} 실패`);
ws.close();
finish(fail ? 1 : 0);

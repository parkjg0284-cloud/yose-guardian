// tools/monster-check.mjs — 몬스터 외형 실제 브라우저 검사 (Chrome headless · CDP).
//
//   node tools/monster-check.mjs [url]
//
// 확인하는 것
//   1) 게임 시작 후 몬스터를 소환하면 '괴물' 파츠(몸통·팔·눈)가 붙는다
//   2) 종류별로 실루엣이 다르다 — 뿔/꼬리/다리/망토/날개 설정이 반영된다
//   3) 눈이 발광하고(상태이상 색), 드로우콜이 늘지 않는다(개체당 메시 ≤ 9)
//   4) 보스는 왕관·어깨 가시가 보이고, 콘솔 error 가 없다
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
  console.log('브라우저가 없어 건너뜁니다(몬스터 검사 생략).');
  process.exit(0);
}

const url = process.argv[2] || 'http://127.0.0.1:3001';
const port = 9335;
const profile = join(tmpdir(), `yose-monster-${Date.now()}`);
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
check('게임 시작', (await evalJs(`window.__GAME__?.state`)) === 'playing');

// 몬스터 소환 — 기지 근처에 여러 종류를 한 번에
const spawned = await evalJs(`(() => {
  const g = window.__GAME__;
  const base = g.base?.position || { x: 0, z: 0 };
  const kinds = ['imp', 'goblin', 'bat', 'wolf', 'spider', 'orc', 'skeleton', 'wraith', 'shade', 'golem', 'drake'];
  const out = [];
  kinds.forEach((typeId, i) => {
    const a = (i / kinds.length) * Math.PI * 2;
    const e = g.waves.spawnAt(base.x + Math.cos(a) * 9, base.z + Math.sin(a) * 9, { typeId, wave: 6 });
    out.push(Boolean(e));
  });
  const boss = g.waves.spawnAt(base.x + 13, base.z, { typeId: 'lich', isBoss: true, wave: 10 });
  out.push(Boolean(boss));
  return out.filter(Boolean).length;
})()`);
check('몬스터 — 11종 + 보스 소환', spawned === 12, String(spawned));
await sleep(1200);

const shape = await evalJs(`(() => {
  const g = window.__GAME__;
  const all = Array.isArray(g.enemies) ? g.enemies : (g.enemies?.list ?? g.enemies?.all ?? []);
  const rows = [];
  for (const e of all) {
    if (!e?.mesh) continue;
    const names = e.mesh.children.map((c) => c.name).filter(Boolean);
    const body = e.mesh.getObjectByName('body');
    const eyes = e.mesh.getObjectByName('eyes');
    rows.push({
      type: e.typeId,
      boss: Boolean(e.isBoss),
      names,
      verts: body?.geometry?.attributes?.position?.count ?? 0,
      colors: Boolean(body?.geometry?.attributes?.color),
      eyeGlow: Number(eyes?.material?.emissiveIntensity ?? 0),
      meshes: e.mesh.children.length,
      armX: Number(e.mesh.getObjectByName('arms')?.position?.y ?? 99)
    });
  }
  return rows;
})()`);
const rows = Array.isArray(shape) ? shape : [];
check('몬스터 — 소환된 개체를 찾았다', rows.length >= 12, String(rows.length));
const normal = rows.filter((r) => !r.boss);
const allHaveParts = rows.length > 0 && rows.every((r) => r.names.includes('body') && r.names.includes('arms') && r.names.includes('eyes'));
check('몬스터 — 몸통·팔·눈 파츠', allHaveParts, JSON.stringify(rows[0]?.names ?? []));
const detailed = rows.every((r) => r.verts > 1200 && r.colors);
check('몬스터 — 종류별 모델(정점 1200+) · 정점 색', detailed, rows.map((r) => `${r.type}:${r.verts}`).join(' '));
const glowing = rows.every((r) => r.eyeGlow >= 1.1);
check('몬스터 — 눈 발광', glowing, rows.map((r) => `${r.type}:${r.eyeGlow.toFixed(2)}`).join(' '));
const light = rows.every((r) => r.meshes <= 12);
check('몬스터 — 드로우콜 유지(개체당 메시 ≤ 12)', light, String(Math.max(...rows.map((r) => r.meshes))));
const scaled = normal.every((r) => r.armX === 0);
check('몬스터 — 팔 위치(몸통과 같은 원점 스케일)', scaled, String(normal[0]?.armX));

const looks = await evalJs(`(() => {
  const g = window.__GAME__;
  const all = Array.isArray(g.enemies) ? g.enemies : (g.enemies?.list ?? g.enemies?.all ?? []);
  const by = {};
  for (const e of all) if (e?.mesh) by[e.typeId] = e;
  const info = (id) => {
    const e = by[id];
    if (!e) return null;
    return {
      cloak: Boolean(e.mesh.getObjectByName('cloak')),
      boss: Boolean(e.isBoss),
      crest: Boolean(e.mesh.getObjectByName('crest')?.visible),
      spikes: Boolean(e.mesh.getObjectByName('spikeL')?.visible)
    };
  };
  return { spider: info('spider'), wraith: info('wraith'), shade: info('shade'), wolf: info('wolf'), lich: info('lich') };
})()`);
check('몬스터 — 거미 실루엣', Boolean(looks?.spider), JSON.stringify(looks?.spider));
check('몬스터 — 망령/그림자 망토', Boolean(looks?.wraith?.cloak) && Boolean(looks?.shade?.cloak), JSON.stringify(looks?.wraith));
check('보스 — 왕관·어깨 가시', Boolean(looks?.lich?.boss && looks?.lich?.crest && looks?.lich?.spikes), JSON.stringify(looks?.lich));

// 한 마리 애니메이션 — 팔이 흔들린다
const swing = await evalJs(`(() => {
  const g = window.__GAME__;
  const all = Array.isArray(g.enemies) ? g.enemies : (g.enemies?.list ?? g.enemies?.all ?? []);
  const e = all.find((x) => x?.mesh?.getObjectByName('arms'));
  if (!e) return null;
  const arms = e.mesh.getObjectByName('arms');
  return new Promise((resolve) => {
    const a = arms.rotation.x;
    setTimeout(() => resolve({ before: a, after: arms.rotation.x, moved: Math.abs(arms.rotation.x - a) > 1e-4 }), 600);
  });
})()`);
check('몬스터 — 팔 흔들림 애니메이션', Boolean(swing?.moved), JSON.stringify(swing));

check('몬스터 검사 — 콘솔 error 없음', errors.length === 0, errors[0] || '');

console.log(`몬스터 검사: ${pass} 통과 / ${fail} 실패`);
ws.close();
finish(fail ? 1 : 0);

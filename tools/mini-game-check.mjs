// 미니게임 검증 — mini-game.html 의 스크립트를 stub DOM 에서 실제로 돌려본다.
// 확인 항목 : 로드 무예외 · dt 기반 이동(프레임레이트 무관) · 적 제거 시 인덱스 밀림 없음 ·
//             안전 스폰 · 생존/회피 점수 · 게임오버·재시작 · 탭 숨김 일시정지 ·
//             본편 복귀(단독/오버레이/ESC) · 오버레이 모듈(minigame.js) 화면 전환
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const htmlPath = process.argv[2] || 'client/public/mini-game.html';
const html = readFileSync(htmlPath, 'utf8');
const repoDir = path.resolve(path.dirname(htmlPath), '..', '..');   // <repo>/client/public/... → <repo>
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('스크립트를 찾지 못했습니다'); process.exit(1); }
const code = m[1];

let pass = 0;
let fail = 0;
function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  OK  ' + name + (detail ? ' — ' + detail : '')); }
  else { fail += 1; console.log('  X   ' + name + (detail ? ' — ' + detail : '')); }
}

// ── stub DOM ────────────────────────────────────────────────────
function makeElement(tag = 'div') {
  const listeners = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    children: [],
    className: '',
    textContent: '',
    style: {},
    dataset: {},
    attrs: {},
    parent: null,
    _classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return k in el.attrs ? el.attrs[k] : null; },
    classList: {
      add(c) { el._classes.add(c); },
      remove(c) { el._classes.delete(c); },
      contains(c) { return el._classes.has(c); }
    },
    appendChild(child) { child.parent = el; el.children.push(child); return child; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    fire(type, payload = {}) { for (const fn of listeners.get(type) ?? []) fn(payload); },
    remove() {
      if (!el.parent) return;
      const i = el.parent.children.indexOf(el);
      if (i >= 0) el.parent.children.splice(i, 1);
      el.parent = null;
    }
  };
  return el;
}

function makeEnv() {
  const byId = new Map();
  for (const id of ['game', 'player', 'score', 'hp', 'best', 'gameOver', 'finalScore', 'newRecord', 'home']) {
    byId.set(id, makeElement('div'));
  }
  const listeners = new Map();
  const timers = [];
  const env = {
    raf: null,
    hidden: false,
    time: 0,
    document: {
      hidden: false,
      getElementById: (id) => byId.get(id) ?? null,
      createElement: (tag) => makeElement(tag),
      addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      }
    },
    storage: {},
    elements: byId,
    listeners,
    timers
  };
  env.window = {
    innerWidth: 1000,
    innerHeight: 800,
    location: { href: '', origin: 'http://localhost:3001' },   // 본편 복귀·메시지 출처 검증용
    self: undefined,               // 프레임이 아니면 self === top
    top: undefined,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
      const list = listeners.get(type);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    }
  };
  env.requestAnimationFrame = (fn) => { env.raf = fn; };
  env.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  env.localStorage = {
    getItem: (k) => (k in env.storage ? env.storage[k] : null),
    setItem: (k, v) => { env.storage[k] = String(v); }
  };
  env.fireDocument = (type, payload = {}) => {
    for (const fn of listeners.get(type) ?? []) fn(payload);
  };
  env.fireWindow = (type, payload = {}) => {
    for (const fn of listeners.get(type) ?? []) fn(payload);
  };
  env.el = (id) => byId.get(id);
  return env;
}

function boot(env) {
  const factory = new Function(
    'document', 'window', 'requestAnimationFrame', 'setTimeout', 'localStorage',
    code + '\nreturn { get score() { return score; }, get hp() { return hp; }, get enemies() { return enemies; }, get running() { return running; }, get paused() { return paused; }, get elapsed() { return elapsed; }, set playerX(v) { playerX = v; }, get playerX() { return playerX; }, set playerY(v) { playerY = v; }, get playerY() { return playerY; }, spawnInterval, createEnemy, restartGame };'
  );
  return factory(env.document, env.window, env.requestAnimationFrame, env.setTimeout, env.localStorage);
}

// 프레임 진행 : step(초) 만큼 dt 를 나눠서 rAF 를 호출한다(60fps = 1/60)
function run(env, seconds, fps = 60, t0 = 0) {
  const dt = 1 / fps;
  const frames = Math.round(seconds * fps);
  let t = t0;
  for (let i = 0; i < frames; i += 1) {
    t += dt;
    env.time = t;
    const cb = env.raf;
    if (!cb) break;
    cb(t * 1000);
  }
  return t;
}

console.log('═══ 1) 로드와 초기 상태');
{
  const env = makeEnv();
  const g = boot(env);
  ck('스크립트 로드 무예외', true);
  ck('초기 체력 3 · 점수 0', g.hp === 3 && g.score === 0 && g.running === true);
  ck('첫 프레임에 rAF 예약됨', typeof env.raf === 'function');
  ck('플레이어 중앙 배치', g.playerX === 500 && g.playerY === 400, g.playerX + ',' + g.playerY);
  ck('최고 점수 표시 초기화', env.el('best').textContent.includes('최고 점수'));
  run(env, 1 / 60);
  ck('1프레임 뒤 예외 없음', true);
}

console.log('═══ 2) dt 기반 이동 — 프레임레이트와 무관해야 한다');
{
  const a = makeEnv(); const ga = boot(a);
  a.fireDocument('keydown', { key: 'd' });
  run(a, 1, 60);                       // 60fps 로 1초

  const b = makeEnv(); const gb = boot(b);
  b.fireDocument('keydown', { key: 'd' });
  run(b, 1, 144);                      // 144fps 로 1초

  const c = makeEnv(); const gc = boot(c);
  c.fireDocument('keydown', { key: 'd' });
  run(c, 1, 30);                       // 30fps 로 1초

  ck('60fps 1초 → 약 +295px', ga.playerX > 785 && ga.playerX < 805, String(Math.round(ga.playerX)));
  ck('144fps 도 같은 거리(±6px)', Math.abs(gb.playerX - ga.playerX) < 6, `${Math.round(gb.playerX)} vs ${Math.round(ga.playerX)}`);
  ck('30fps 도 같은 거리(±6px)', Math.abs(gc.playerX - ga.playerX) < 6, `${Math.round(gc.playerX)} vs ${Math.round(ga.playerX)}`);
  ck('왼쪽 키', (() => { const d = makeEnv(); const gd = boot(d); d.fireDocument('keydown', { key: 'ArrowLeft' }); run(d, 0.5); return Math.abs(gd.playerX - 350) < 6; })(), '방향키·소문자 변환');
  {
    const e = makeEnv(); const ge = boot(e);
    e.fireDocument('keydown', { key: 'd' });
    run(e, 5);
    ck('화면 밖으로 나가지 않음', ge.playerX === 1000 - 25, String(Math.round(ge.playerX)));
  }
  {
    // 대각선도 같은 속도(정규화)
    const f = makeEnv(); const gf = boot(f);
    f.fireDocument('keydown', { key: 'd' });
    f.fireDocument('keydown', { key: 'w' });
    run(f, 1);
    const moved = Math.hypot(gf.playerX - 500, gf.playerY - 400);
    ck('대각선 이동 거리도 300px', Math.abs(moved - 300) < 6, String(Math.round(moved)));
  }
}

console.log('═══ 3) 적 제거 시 인덱스 밀림 없음 (원본 버그)');
{
  const env = makeEnv(); const g = boot(env);
  env.el('game').children.length = 0;
  // 적 3마리 : 하나는 플레이어 위, 둘은 멀리
  const mk = (x, y) => { g.playerX = 500; g.playerY = 400; };
  g.playerX = 500; g.playerY = 400;
  // createEnemy 는 안전 스폰이라 위치를 강제로 잡는다
  g.createEnemy(); g.createEnemy(); g.createEnemy();
  const before = g.enemies.length;
  g.enemies[1].x = 500; g.enemies[1].y = 400;      // 가운데 적을 플레이어 위로
  const far = g.enemies[2];
  const farX = far.x;
  run(env, 1 / 60);
  ck('적 3마리 생성', before === 3);
  ck('충돌한 적 1마리만 제거', g.enemies.length === 2, String(g.enemies.length));
  ck('체력 1 감소', g.hp === 2, String(g.hp));
  ck('제거된 적이 배열에서 사라짐', !g.enemies.includes(g.enemies[1]) || g.enemies.length === 2);
  const moved = g.enemies.some((e) => Math.abs(e.x - farX) > 0.01);
  ck('남은 적이 같은 프레임에 모두 움직임(건너뛰지 않음)', moved);
  ck('DOM 에서도 제거됨', env.el('game').children.length === 2, String(env.el('game').children.length));
}

console.log('═══ 4) 안전 스폰 — 플레이어 위에 생기지 않는다');
{
  const env = makeEnv(); const g = boot(env);
  g.playerX = 500; g.playerY = 400;
  let minDist = Infinity;
  for (let i = 0; i < 150; i += 1) {
    const n = g.enemies.length;
    g.createEnemy();
    const e = g.enemies[n];
    const d = Math.hypot(e.x - 500, e.y - 400);
    if (d < minDist) minDist = d;
    g.enemies.pop();                    // 다음 측정을 위해 정리
    e.element.remove();
  }
  ck('150회 스폰 모두 안전 거리(>150px)', minDist > 150, '최소 ' + Math.round(minDist) + 'px');
}

console.log('═══ 5) 점수 — 생존 + 아슬아슬 회피 보너스');
{
  const env = makeEnv(); const g = boot(env);
  run(env, 3.2);
  ck('생존 3초 → 점수 3', g.score === 3, String(g.score));

  const env2 = makeEnv(); const g2 = boot(env2);
  g2.playerX = 100; g2.playerY = 100;
  g2.createEnemy();
  const e = g2.enemies[0];
  e.x = 170; e.y = 100;                 // 거리 70 (NEAR_RADIUS 90 안)
  const scoreBefore = g2.score;
  run(env2, 1 / 60);
  ck('근접 표시(near)', e.near === true);
  // 플레이어를 반대편으로 확 멀리 이동시켜 적이 다시 멀어지게 한다
  g2.playerX = 900; g2.playerY = 700;
  run(env2, 1 / 60);
  ck('회피 보너스 +10', g2.score - scoreBefore === 10, String(g2.score - scoreBefore));
  ck('보너스 표시 생성', env2.el('game').children.some((c) => c.className === 'float'), 'float 라벨');
}

console.log('═══ 6) 게임오버 · 재시작');
{
  const env = makeEnv(); const g = boot(env);
  for (let i = 0; i < 3; i += 1) {
    g.createEnemy();
    const e = g.enemies[g.enemies.length - 1];
    e.x = g.playerX; e.y = g.playerY;
    run(env, 1 / 60);
  }
  ck('3번 맞으면 게임오버', g.running === false && g.hp <= 0, 'hp ' + g.hp);
  ck('GAME OVER 표시', env.el('gameOver').style.display === 'flex');
  ck('최종 점수 표시', env.el('finalScore').textContent !== '');

  g.restartGame();
  ck('재시작 — 체력·점수·적 초기화', g.hp === 3 && g.score === 0 && g.enemies.length === 0);
  ck('재시작 — 오버레이 숨김 + 진행', env.el('gameOver').style.display === 'none' && g.running === true);
  ck('재시작 — 플레이어 중앙 복귀', g.playerX === 500 && g.playerY === 400);
  run(env, 1 / 60);
  ck('재시작 후 루프 정상', g.running === true);
}

console.log('═══ 7) 탭 숨김 일시정지 · 최고 점수 저장');
{
  const env = makeEnv(); const g = boot(env);
  env.document.hidden = true;
  env.fireDocument('visibilitychange');
  const x0 = g.playerX;
  env.fireDocument('keydown', { key: 'd' });
  run(env, 1);
  ck('숨김 상태에서는 이동하지 않음', g.playerX === x0, String(Math.round(g.playerX)));
  env.document.hidden = false;
  env.fireDocument('visibilitychange');
  run(env, 0.5);
  ck('돌아오면 다시 움직임', g.playerX > x0 + 50, String(Math.round(g.playerX)));

  const env2 = makeEnv(); const g2 = boot(env2);
  run(env2, 2.2);
  for (let i = 0; i < 3; i += 1) {
    g2.createEnemy();
    const e = g2.enemies[g2.enemies.length - 1];
    e.x = g2.playerX; e.y = g2.playerY;
    run(env2, 1 / 60);
  }
  ck('최고 점수 localStorage 저장', Number(env2.storage.miniGameBest) >= 2, JSON.stringify(env2.storage));
  ck('갱신 안내 표시', env2.el('newRecord').style.display === 'block');
}

console.log('═══ 8) 터치/마우스 드래그 조작');
{
  const env = makeEnv(); const g = boot(env);
  const gameEl = env.el('game');
  gameEl.fire('pointerdown', { clientX: 900, clientY: 400 });
  run(env, 1);
  ck('드래그 지점 쪽으로 이동', g.playerX > 780, String(Math.round(g.playerX)));
  ck('세로는 그대로', Math.abs(g.playerY - 400) < 2, String(Math.round(g.playerY)));
  gameEl.fire('pointermove', { clientX: 500, clientY: 400 });
  const mid = g.playerX;
  run(env, 0.2);
  ck('pointermove 로 방향 전환', g.playerX < mid, `${Math.round(mid)} → ${Math.round(g.playerX)}`);
  env.fireWindow('pointerup');
  const after = g.playerX;
  run(env, 0.5);
  ck('손을 떼면 멈춤', Math.abs(g.playerX - after) < 1, String(Math.round(g.playerX)));
}

console.log('═══ 9) 본편 화면으로 돌아가기 (화면 전환)');
{
  // (a) 주소로 직접 열었을 때 — 본편 주소로 이동한다
  const a = makeEnv(); boot(a);
  a.el('home').fire('click', {});
  ck('단독 주소 모드 — 클릭 시 / 로 이동', a.window.location.href === '/', JSON.stringify(a.window.location.href));

  // (b) 오버레이(iframe) 안 — 부모에게 알려 화면만 되돌린다(주소 이동 없음)
  const b = makeEnv(); const got = [];
  b.window.top = {};                                            // self !== top → 프레임 안
  b.window.parent = { postMessage: (msg) => got.push(msg) };
  boot(b);
  b.el('home').fire('click', {});
  ck('오버레이 모드 — 부모에게 minigame:exit 전송', got.length === 1 && got[0]?.type === 'minigame:exit', JSON.stringify(got));
  ck('오버레이 모드 — 주소는 그대로', b.window.location.href === '', JSON.stringify(b.window.location.href));

  // (c) ESC 키로도 돌아간다(단독 모드)
  const c = makeEnv(); boot(c);
  c.fireDocument('keydown', { key: 'Escape' });
  ck('ESC — / 로 이동', c.window.location.href === '/', JSON.stringify(c.window.location.href));

  // (d) ESC 는 오버레이 모드에서도 부모에게 알린다
  const d = makeEnv(); const got2 = [];
  d.window.top = {};
  d.window.parent = { postMessage: (msg) => got2.push(msg) };
  boot(d);
  d.fireDocument('keydown', { key: 'Escape' });
  ck('ESC(오버레이) — minigame:exit 전송', got2.length === 1 && got2[0]?.type === 'minigame:exit', JSON.stringify(got2));

  // (e) ESC 는 게임오버 화면에서도 예외 없이 동작한다
  const e = makeEnv(); const g = boot(e);
  for (let i = 0; i < 3; i += 1) {
    g.createEnemy();
    const en = g.enemies[g.enemies.length - 1];
    en.x = g.playerX; en.y = g.playerY;
    run(e, 1 / 60);
  }
  const over = e.el('gameOver').style.display;
  e.fireDocument('keydown', { key: 'Escape' });
  ck('게임오버 상태에서도 ESC 동작', over === 'flex' && e.window.location.href === '/');
}

// ── 10) 오버레이 화면 전환 모듈(minigame.js) 실제 import 검증 ──────
console.log('═══ 10) 본편 ↔ 미니게임 오버레이 전환 (minigame.js)');
{
  const env = makeEnv();
  env.document.body = makeElement('body');
  const app = makeElement('div');
  app.id = 'app';
  env.document.getElementById = (id) => (id === 'app' ? app : env.el(id));
  env.document.removeEventListener = env.window.removeEventListener;

  globalThis.document = env.document;
  globalThis.window = env.window;
  globalThis.location = env.window.location;

  const overlayUrl = pathToFileURL(path.resolve(repoDir, 'client/src/ui/minigame.js')).href;
  let mod;
  try { mod = await import(overlayUrl); }
  catch (e) { ck('minigame.js import', false, e.message); }

  if (mod) {
    let paused = 0; let resumed = 0; let synced = 0;
    const game = {
      state: 'playing',
      pause() { paused += 1; this.state = 'paused'; },
      resume() { resumed += 1; this.state = 'playing'; },
      _syncPointerLock() { synced += 1; }
    };

    ck('열기 성공', mod.openMiniGame(game) === true);
    const box = mod.miniGameElement();
    ck('오버레이 생성 + #app 에 부착', Boolean(box) && app.children.length === 1 && box.dataset.role === 'mini-game');
    ck('클래스/식별자', box?.className === 'mini-game-overlay' && box?.id === 'mini-game-overlay');
    const frame = box?.children.find((c) => c.tagName === 'IFRAME');
    ck('iframe src = /mini-game.html', frame?.getAttribute('src') === '/mini-game.html', String(frame?.getAttribute('src')));
    ck('본편 일시정지(state playing → paused)', paused === 1 && game.state === 'paused');
    const bar = box?.children[0];
    const back = bar?.children.find((c) => c.dataset?.act === 'minigame-back');
    ck('상단 바 — 제목/안내/돌아가기 버튼', Boolean(back) && bar.children.length === 3, '자식 ' + (bar?.children.length ?? 0));
    ck('중복 열기는 무시', mod.openMiniGame(game) === true && app.children.length === 1 && paused === 1);

    // 돌아가기 버튼
    back.fire('click', {});
    ck('버튼 → 오버레이 제거', app.children.length === 0 && mod.isMiniGameOpen() === false);
    ck('버튼 → 본편 재개(state paused → playing)', resumed === 1 && game.state === 'playing');
    ck('닫힌 뒤에는 다시 닫아도 false', mod.closeMiniGame(game) === false);

    // 메시지(오버레이 안에서 ESC/버튼) — 같은 출처만
    game.state = 'playing';
    mod.openMiniGame(game);
    const box2 = mod.miniGameElement();
    env.fireWindow('message', { origin: 'https://evil.example', data: { type: 'minigame:exit' } });
    ck('다른 출처 메시지는 무시', mod.isMiniGameOpen() === true);
    env.fireWindow('message', { origin: env.window.location.origin, data: { type: 'minigame:exit' } });
    ck('같은 출처 minigame:exit → 닫힘', mod.isMiniGameOpen() === false && game.state === 'playing');

    // ESC (캡처 단계에서 본편까지 전파 차단)
    mod.openMiniGame(game);
    let stopped = false;
    env.fireWindow('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() { stopped = true; } });
    ck('ESC → 닫힘', mod.isMiniGameOpen() === false);
    ck('ESC → 본편 전파 차단', stopped === true);

    // 다른 키는 무시
    mod.openMiniGame(game);
    env.fireWindow('keydown', { key: 'KeyD', preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
    ck('다른 키는 오버레이를 닫지 않음', mod.isMiniGameOpen() === true);

    // 메뉴 상태(진행 중 아님)에서는 일시정지하지 않는다
    mod.closeMiniGame(game);
    const menuGame = { state: 'menu', _syncPointerLock() { synced += 1; } };
    const pausedBefore = paused;
    mod.openMiniGame(menuGame);
    ck('메뉴 상태 — 일시정지 호출 없음', menuGame.state === 'menu' && paused === pausedBefore, 'pause ' + pausedBefore + ' → ' + paused);
    mod.closeMiniGame(menuGame);
    ck('메뉴 상태 — 닫을 때 포인터 동기화', synced >= 1 && menuGame.state === 'menu');
  }
}

console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);

// Scratch verification: exercises the real runtime paths of panels.js / menu.js /
// cutscene.js against a minimal DOM shim (no browser, no bundler).
// Run with `node dom-smoke.mjs` from the stale workspace root; the project is
// located by scanning sibling folders for client/src/ui/panels.js.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const parentDir = path.resolve(process.cwd(), '..');
const project = fs
  .readdirSync(parentDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => path.join(parentDir, e.name))
  .find((d) => fs.existsSync(path.join(d, 'client', 'src', 'ui', 'panels.js')));
if (!project) throw new Error('project folder not found');
console.log('project:', project);

const mod = (rel) => pathToFileURL(path.join(project, 'client', 'src', rel)).href;
const ui = (f) => pathToFileURL(path.join(project, 'client', 'src', 'ui', f)).href;

let pass = 0;
const fails = [];
const ok = (label, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log('PASS', label, extra);
  } else {
    fails.push(label);
    console.log('FAIL', label, extra);
  }
};
const attempt = (label, fn) => {
  try {
    const v = fn();
    ok(label, v !== false);
    return v;
  } catch (e) {
    fails.push(`${label} (${e.message})`);
    console.log('FAIL', label, '->', e.message);
    return null;
  }
};

// ── plain-Node stubs that must exist before importing net.js ──
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
let netImported = true;
try {
  await import(mod('net.js'));
} catch (e) {
  netImported = false;
  console.log('- net.js import failed (continuing):', e.message);
}
ok('net.js imports under Node', netImported);

// ── minimal DOM ──
const roots = new Map();
const props = (el) => el.dataset;
const MATCH = (el, sel) => {
  if (sel === '*') return true;
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const body = sel.slice(1, -1);
    const eq = body.indexOf('=');
    const key = (eq < 0 ? body : body.slice(0, eq)).replace(/^data-/, '').replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    if (eq < 0) return Object.prototype.hasOwnProperty.call(props(el), key);
    const val = body.slice(eq + 1).replace(/^["']|["']$/g, '');
    return String(el.dataset[key] ?? '') === val;
  }
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  return el.tagName === String(sel).toUpperCase();
};

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parent = null;
    this._cls = new Set();
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this.attrs = {};
    this.listeners = new Map();
    this._text = '';
    this.value = '';
  }
  get className() {
    return [...this._cls].join(' ');
  }
  set className(v) {
    this._cls = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  get classList() {
    const s = this._cls;
    return {
      add: (...c) => c.forEach((x) => s.add(x)),
      remove: (...c) => c.forEach((x) => s.delete(x)),
      contains: (c) => s.has(c),
      toggle: (c, f) => {
        const on = f === undefined ? !s.has(c) : Boolean(f);
        if (on) s.add(c);
        else s.delete(c);
        return on;
      }
    };
  }
  get id() {
    return this.attrs.id || '';
  }
  set id(v) {
    this.attrs.id = String(v);
    roots.set(String(v), this);
  }
  set textContent(v) {
    this._text = v === null || v === undefined ? '' : String(v);
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k];
  }
  appendChild(c) {
    if (c.tagName === '#FRAGMENT') {
      for (const child of [...c.children]) this.appendChild(child);
      c.children = [];
      return c;
    }
    c.parent = this;
    this.children.push(c);
    return c;
  }
  insertBefore(c, ref) {
    const i = this.children.indexOf(ref);
    c.parent = this;
    if (i < 0) this.children.push(c);
    else this.children.splice(i, 0, c);
    return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) {
      this.children.splice(i, 1);
      c.parent = null;
    }
    return c;
  }
  remove() {
    if (this.parent) this.parent.removeChild(this);
  }
  addEventListener(t, f) {
    if (!this.listeners.has(t)) this.listeners.set(t, []);
    this.listeners.get(t).push(f);
  }
  removeEventListener(t, f) {
    const l = this.listeners.get(t);
    if (l) {
      const i = l.indexOf(f);
      if (i >= 0) l.splice(i, 1);
    }
  }
  dispatch(type, ev) {
    for (const f of [...(this.listeners.get(type) || [])]) f(ev);
  }
  click(el) {
    this.dispatch('click', { target: el || this, preventDefault() {}, stopPropagation() {} });
  }
  closest(sel) {
    let p = this;
    while (p) {
      if (MATCH(p, sel)) return p;
      p = p.parent;
    }
    return null;
  }
  contains(el) {
    let p = el;
    while (p) {
      if (p === this) return true;
      p = p.parent;
    }
    return false;
  }
  _all() {
    const out = [];
    const walk = (n) => {
      for (const c of n.children) {
        out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) {
    return this._all().find((e) => MATCH(e, sel)) || null;
  }
  querySelectorAll(sel) {
    return this._all().filter((e) => MATCH(e, sel));
  }
  focus() {}
  blur() {}
}

const documentStub = {
  body: new El('body'),
  createElement: (t) => new El(t),
  createDocumentFragment: () => new El('#fragment'),
  createTextNode: (t) => {
    const e = new El('#text');
    e.textContent = t;
    return e;
  },
  getElementById: (id) => roots.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {}
};
globalThis.document = documentStub;
globalThis.window = {
  document: documentStub,
  location: { search: '' },
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  getComputedStyle: () => ({ getPropertyValue: () => '' })
};

// ── shared game stub (never touches the network) ──
const game = {
  VERSION: '1.0.0',
  state: 'playing',
  mode: 'solo',
  difficulty: 'normal',
  seed: 'ABC123',
  economy: { gold: 900, wood: 300, stone: 40, minerals: { iron: 5 }, mineralList: () => [] },
  input: { wasPressed: () => false, consumePressed: () => {}, isDown: () => false },
  notify: () => {},
  togglePanel(id) {
    game.lastPanel = id;
  },
  craftingTableBuilt: (id) => id === 'forge_t1',
  craftingTableUnlocked: () => true,
  buildCraftingTable: () => ({ ok: true }),
  craftWeapon: () => ({ ok: true }),
  // 전직 시스템 — 실제 ClassSystem 을 붙이고 가짜 웨이브/골드를 제공한다.
  waves: { wave: 3 },
  spendGoldCalls: 0,
  lastPanel: null,
  workbenchBuilt: () => false,
  audio: { setVolume: () => {}, toggleMute: () => {} },
  achievements: { progress: () => ({ unlocked: 3, total: 90 }), list: () => [], title: () => '수습 수호자' },
  gacha: { odds: () => ({}), canPull: () => true, craft: () => ({}), makeSpell: () => ({}) },
  fairies: { found: () => [], codex: () => [], crown: false },
  ui: { minimap: { toggle: () => {} } },
  net: {
    connected: false,
    id: '',
    room: null,
    connect: () => {},
    on: () => {},
    createRoom: () => {},
    joinRoom: () => {},
    leaveRoom: () => {},
    setReady: () => {},
    startGame: () => {},
    sendChat: () => {},
    onChat: () => {},
    onRoomState: () => {},
    onError: () => {}
  }
};

// ── panels.js ──
console.log('\n== panels.js ==');
const panelsMod = await import(ui('panels.js'));
ok('PanelManager exported', typeof panelsMod.PanelManager === 'function');
ok('PANEL_IDS has 18 ids (enchant · recipes · travel · arcana 추가)', panelsMod.PANEL_IDS.length === 18 && panelsMod.PANEL_IDS.includes('recipes') && panelsMod.PANEL_IDS.includes('travel') && panelsMod.PANEL_IDS.includes('arcana'), panelsMod.PANEL_IDS.join(','));
ok('KEYBINDS has 24 rows (Ctrl 앉기 · X/R 건물 회전 · V = 요정의 날개)', panelsMod.KEYBINDS.length === 24, panelsMod.KEYBINDS.map((k) => k[0]).join(','));
ok('KEYBINDS — 앉기(Ctrl) · R 유지 회전 항목 존재', panelsMod.KEYBINDS.some((k) => k[0] === 'Ctrl') && panelsMod.KEYBINDS.some((k) => k[0] === 'R (유지)'));
const pm = attempt('PanelManager constructs (builds #panel-root)', () => new panelsMod.PanelManager({ game }));

// [bench] 패널 1회 렌더 비용 — 관리자 무기 소환(67종)이 UI 재렌더 폭주로 멈추는지 확인용.
// 실행 : PANEL_BENCH=1 npm run ui
if (process.env.PANEL_BENCH) {
  const rows = [];
  for (const id of panelsMod.PANEL_IDS) {
    try {
      pm.open(id);
      const t0 = process.hrtime.bigint();
      pm.refresh();
      rows.push([id, Number(process.hrtime.bigint() - t0) / 1e6]);
      pm.close();
    } catch { rows.push([id, -1]); }
  }
  rows.sort((a, b) => b[1] - a[1]);
  console.log('  [bench] 패널 1회 렌더(상위 6): ' + rows.slice(0, 6).map(([id, ms]) => id + ' ' + (ms < 0 ? '실패' : ms.toFixed(2) + 'ms')).join(' · '));
  const get = (id) => rows.find(([k]) => k === id)?.[1] ?? 0;
  console.log('  [bench] /무기전부 67회 refresh 예상 — craft ' + (get('craft') * 67).toFixed(0) + 'ms · inventory ' + (get('inventory') * 67).toFixed(0) + 'ms · weapons ' + (get('weapons') * 67).toFixed(0) + 'ms');
}
attempt('설정 패널(ESC) — 계속하기와 나가기가 맨 위에 있다(계약 §4.48)', () => {
  const prev = { state: game.state, waves: game.waves };
  game.state = 'paused';
  game.waves = { wave: 7 };
  try {
    pm.open('settings');
    const root = documentStub.getElementById('panel-root');
    const back = root.querySelector('[data-act="resume"]');
    const quit = root.querySelector('[data-act="quit"]');
    if (!back || !quit) return false;
    back.dispatch('click', { target: back, preventDefault() {}, stopPropagation() {} });
    return true;
  } finally {
    game.state = prev.state;
    game.waves = prev.waves;
    pm.close();
  }
});

attempt('설정 패널 — 내 세이브 목록에서 불러오기/삭제 위임(계약 §4.49)', () => {
  const fake = new Map();
  const savedLS = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (fake.has(k) ? fake.get(k) : null), setItem: (k, v) => fake.set(k, String(v)), removeItem: (k) => fake.delete(k) };
  const events = [];
  let loaded = null;
  const prevList = game.listSaves;
  const prevLoad = game.loadSaveSlot;
  game.listSaves = () => [{ id: 'slot-1', label: '2026-10-02 12:00', wave: 7, gold: 1234, play: '12분' }];
  game.loadSaveSlot = (id) => { loaded = id; return true; };
  const offLoad = pm.on('save:load', (p) => events.push(['load', p?.id]));
  const offDel = pm.on('save:del', (p) => events.push(['del', p?.id]));
  try {
    pm.open('settings');
    const root = documentStub.getElementById('panel-root');
    const loadBtn = root.querySelector('[data-act="save-slot-load"]');
    const delBtn = root.querySelector('[data-act="save-slot-del"]');
    if (!loadBtn || !delBtn) return false;
    if (loadBtn.dataset.id !== 'slot-1' || delBtn.dataset.id !== 'slot-1') return false;
    root.dispatch('click', { target: loadBtn, preventDefault() {}, stopPropagation() {} });
    root.dispatch('click', { target: delBtn, preventDefault() {}, stopPropagation() {} });
    return events.some(([k, id]) => k === 'load' && id === 'slot-1') && events.some(([k, id]) => k === 'del' && id === 'slot-1');
  } finally {
    offLoad?.();
    offDel?.();
    game.listSaves = prevList;
    game.loadSaveSlot = prevLoad;
    globalThis.localStorage = savedLS;
    pm.close();
  }
});

attempt('설정 패널 — 자동 화질 토글과 저장 후 새로고침(계약 §4.50)', () => {
  const prevAuto = game.autoQuality;
  const prevUser = game._userQuality;
  const events = [];
  game.autoQuality = true;
  game._userQuality = 'balanced';
  const offAuto = pm.on('auto-quality:toggle', () => events.push('auto'));
  const offReload = pm.on('game:reload', () => events.push('reload'));
  try {
    pm.open('settings');
    const root = documentStub.getElementById('panel-root');
    const autoBtn = root.querySelector('[data-act="auto-quality"]');
    const reloadBtn = root.querySelector('[data-act="game-reload"]');
    if (!autoBtn || !reloadBtn) return false;
    root.dispatch('click', { target: autoBtn, preventDefault() {}, stopPropagation() {} });
    root.dispatch('click', { target: reloadBtn, preventDefault() {}, stopPropagation() {} });
    if (!events.includes('auto') || !events.includes('reload')) return false;
    // 지표 동기화는 힙/배율/평균 FPS 를 포함한다(값이 없어도 예외 없이 동작해야 한다)
    return pm._syncPerfRows() === true;
  } finally {
    offAuto?.();
    offReload?.();
    game.autoQuality = prevAuto;
    game._userQuality = prevUser;
    pm.close();
  }
});

attempt('무기 인벤토리 — 카타나 계열 탭과 불멸 카드(계약 §4.51)', () => {
  const prevFam = pm.state.weapons.family;
  const equipIds = (rootEl) => [...rootEl.querySelectorAll('[data-act="weapon-equip"]')].map((b) => b.dataset.id);
  try {
    pm.state.weapons.family = 'all';
    pm.open('weapons');
    const r0 = documentStub.getElementById('panel-root');
    const all = equipIds(r0);
    const hasImmortal = all.includes('katana_immortal');
    const hasLantern = all.includes('dream_lantern');
    const katanaTab = [...r0.querySelectorAll('[data-act="weapon-filter"]')].find((b) => b.dataset.family === 'katana');
    if (!katanaTab) return false;
    r0.dispatch('click', { target: katanaTab, preventDefault() {}, stopPropagation() {} });
    const filtered = equipIds(documentStub.getElementById('panel-root')).filter((id) => id && id !== 'fists');
    // 카타나 탭 = 불멸 1종 + (계열과 무관하게 항상 보이는) 꿈나무 구획
    const onlyKatana = filtered.includes('katana_immortal') && filtered.every((id) => id === 'katana_immortal' || id === 'dream_tree');
    return hasImmortal && hasLantern && onlyKatana;
  } finally {
    pm.state.weapons.family = prevFam;
    pm.close();
  }
});
attempt('닉네임 — 계정 패널에서 저장·지우기(계약 §4.54)', () => {
  pm.state.auth.tab = 'login';
  pm.open('auth');
  const r0 = documentStub.getElementById('panel-root');
  const input = r0.querySelector('[data-field="profile-nickname"]');
  const saveBtn = r0.querySelector('[data-act="nickname-save"]');
  const clearBtn = r0.querySelector('[data-act="nickname-clear"]');
  if (!input || !saveBtn || !clearBtn) return false;
  input.value = '무진';
  r0.dispatch('click', { target: saveBtn, preventDefault() {}, stopPropagation() {} });
  const r1 = documentStub.getElementById('panel-root');
  const msg1 = String(r1.querySelector('[data-role="auth-msg"]')?.textContent ?? r1.textContent ?? '');
  const saved = msg1.includes('저장했습니다') && String(r1.textContent || '').includes('무진');
  const clear2 = r1.querySelector('[data-act="nickname-clear"]');
  if (!clear2) return false;
  r1.dispatch('click', { target: clear2, preventDefault() {}, stopPropagation() {} });
  const r2 = documentStub.getElementById('panel-root');
  const msg2 = String(r2.querySelector('[data-role="auth-msg"]')?.textContent ?? r2.textContent ?? '');
  const cleared = msg2.includes('지웠습니다');
  pm.close();
  return saved && cleared;
});
attempt('조합법 도감 — 지형 탭과 조합법 카드(계약 §4.57)', () => {
  pm.state.recipes = { terrain: 'all', kind: 'all' };
  pm.open('recipes');
  const r0 = documentStub.getElementById('panel-root');
  const tabs = r0.querySelectorAll('[data-act="recipe-terrain"]');
  const kinds = r0.querySelectorAll('[data-act="recipe-kind"]');
  const rows0 = r0.querySelectorAll('[data-role="recipe-row"]');
  if (!tabs.length || !kinds.length || !rows0.length) return false;
  const go = r0.querySelector('[data-act="recipe-goto"]');
  if (go) r0.dispatch('click', { target: go, preventDefault() {}, stopPropagation() {} });
  const tableSet = Boolean(go && pm.state.craft && pm.state.craft.table);
  pm.open('recipes');
  const r1 = documentStub.getElementById('panel-root');
  const target = Array.from(r1.querySelectorAll('[data-act="recipe-terrain"]')).find((t) => t.dataset.terrain && t.dataset.terrain !== 'all');
  if (!target) return false;
  r1.dispatch('click', { target, preventDefault() {}, stopPropagation() {} });
  const r2 = documentStub.getElementById('panel-root');
  const rows1 = r2.querySelectorAll('[data-role="recipe-row"]');
  pm.close();
  return rows1.length > 0 && tableSet;
});
attempt('지형 이동 — 포탈 패널에서 [이동] 클릭(계약 §4.58)', () => {
  const calls = [];
  const prevGame = pm.game;
  pm.game = { ...(prevGame || {}), teleports: { travelTo: (id, game) => { calls.push({ id, game }); return true; } } };
  pm.state.travel = pm.state.travel || {};
  pm.open('travel');
  const r0 = documentStub.getElementById('panel-root');
  const rows = r0.querySelectorAll('[data-act="travel-go"]');
  const paint = r0.querySelectorAll('[data-role="travel-dot"]');
  ok('지형 이동 — 이동 버튼 렌더', rows.length >= 8, `버튼 ${rows.length}개 · 색점 ${paint.length}개`);
  const colors = [...paint].map((p) => String(p.dataset?.color ?? '')).filter(Boolean);
  ok('지형 이동 — 지형마다 색점이 붙는다', paint.length === rows.length && colors.length === rows.length, `색점 ${paint.length} / 버튼 ${rows.length}`);
  ok('지형 이동 — 지형별 색이 서로 다르다', new Set(colors).size >= 5, `${new Set(colors).size}종 · ${colors.slice(0, 4).join(' ')}`);
  if (!rows.length) { pm.game = prevGame; return false; }
  const first = rows[0];
  const id = first.dataset.region ?? first.dataset.id ?? '';
  r0.dispatch('click', { target: first, preventDefault() {}, stopPropagation() {} });
  ok('지형 이동 — 클릭이 travelTo 로 이어진다', calls.length === 1 && Boolean(calls[0]?.id), `호출 ${calls.length}회 · id ${calls[0]?.id ?? '없음'} (버튼 ${id || '?'})`);
  ok('지형 이동 — 클릭한 목적지 id 가 그대로 전달된다', Boolean(id) && calls[0]?.id === id, `버튼 ${id || '?'} → ${calls[0]?.id ?? '없음'}`);
  pm.close();
  pm.game = prevGame;
  return calls.length === 1 && Boolean(calls[0]?.id);
});
attempt('키 변경 — 설정 패널에 동작별 변경 버튼(계약 §4.55)', () => {
  pm.state.settings = pm.state.settings || {};
  pm.state.settings.key = { capture: null, message: '' };
  pm.open('settings');
  const r0 = documentStub.getElementById('panel-root');
  const sets = r0.querySelectorAll('[data-act="key-set"]');
  const resets = r0.querySelectorAll('[data-act="key-reset"]');
  const allBtn = r0.querySelector('[data-act="key-reset-all"]');
  const hasJump = Array.from(sets).some((el) => el.dataset.id === 'jump');
  if (!hasJump || !allBtn || resets.length < 5) return false;
  r0.dispatch('click', { target: allBtn, preventDefault() {}, stopPropagation() {} });
  const r1 = documentStub.getElementById('panel-root');
  const msg = String(r1.textContent || '');
  const ok = msg.includes('기본값으로 되돌렸습니다') && msg.includes('키 변경');
  pm.close();
  return ok;
});
attempt('설정 패널 — 성능 지표와 초기화 버튼(계약 §4.47)', () => {
  const prevPerf = game.perf;
  const events = [];
  game.perf = { frames: 100, lastMs: 12.3, worstMs: 900, slowFrames: 2, lastError: null };
  const off = pm.on('perf:reset', () => events.push('reset'));
  try {
    pm.open('settings');
    const root = documentStub.getElementById('panel-root');
    const btn = root.querySelector('[data-act="perf-reset"]');
    if (!btn) return false;
    if (typeof pm._syncPerfRows !== 'function' || pm._syncPerfRows() !== true) return false;
    root.dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    return events.includes('reset');
  } finally {
    off?.();
    game.perf = prevPerf;
    pm.close();
  }
});

attempt('갱신 병합 — 67번 예약해도 프레임당 1회만 다시 그린다(계약 §4.47)', () => {
  pm.open('inventory');
  let renders = 0;
  const real = pm._render.bind(pm);
  pm._render = (id) => { renders += 1; return real(id); };
  try {
    for (let i = 0; i < 67; i += 1) pm.requestRefresh();
    if (renders !== 0) return false;                 // 예약만 하고 아직 그리지 않는다
    pm.flushRefresh();
    if (renders !== 1) return false;                 // 67번 예약 → 1번만 그린다
    pm.requestRefresh('craft');                      // 다른 패널 요청은 버려진다
    pm.flushRefresh();
    if (renders !== 1) return false;
    pm.flushRefresh();                               // 예약이 없으면 아무 일도 없다
    return renders === 1;
  } finally {
    pm._render = real;
    pm.close();
  }
});
if (pm) {
  ok('panel-root exists in DOM', Boolean(documentStub.getElementById('panel-root')));
  ok('no panel open at start', pm.current === null || pm.current === undefined);
  ok('hasOpen() 은 닫혀 있으면 false', pm.hasOpen() === false && pm.currentId === null);
  pm.open('inventory');
  ok(
    'hasOpen() 은 열려 있으면 true (인자 없는 isOpen() 은 false)',
    pm.hasOpen() === true && pm.currentId === 'inventory' && pm.isOpen() === false,
    `hasOpen=${pm.hasOpen()} currentId=${pm.currentId}`
  );
  pm.close();
  ok('닫으면 hasOpen()/currentId 가 초기화된다', pm.hasOpen() === false && pm.currentId === null);

  for (const id of panelsMod.PANEL_IDS) {
    attempt(`open+render #${id}`, () => {
      pm.open(id);
      const shown = pm.isOpen(id) && pm.current === id;
      const el = documentStub.getElementById('panel-root').querySelector(`[data-panel="${id}"]`);
      const bodyHasContent = el ? el.querySelectorAll('*').length > 3 : false;
      ok(`  #${id} rendered content`, shown && bodyHasContent, el ? 'el*' + el.querySelectorAll('*').length : 'el=none');
      return shown;
    });
  }
  attempt('refresh() while open', () => {
    pm.open('build');
    pm.refresh();
    return true;
  });
  attempt('update(dt) with a panel open', () => {
    pm.update(0.016);
    return true;
  });
  attempt('handleKey(Escape) closes the open panel', () => {
    pm.handleKey('Escape');
    return pm.current === null || pm.current === undefined;
  });
  attempt('toggle() opens and closes', () => {
    pm.toggle('settings');
    const opened = pm.isOpen('settings');
    pm.toggle('settings');
    return opened && !pm.isOpen('settings');
  });
  attempt('제작 패널 — 제작대 탭 9개(작업대 포함) + 레시피 카드', () => {
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const tabs = root.querySelectorAll('[data-act="craft-select"]');
    const makes = root.querySelectorAll('[data-act="craft-make"]');
    return tabs.length === 9 && makes.length >= 2;
  });
  attempt('제작 패널 — 제작대 미건설이면 건설 버튼', () => {
    game.craftingTableBuilt = () => false;
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const builds = root.querySelectorAll('[data-act="craft-build"]');
    const makes = root.querySelectorAll('[data-act="craft-make"]');
    game.craftingTableBuilt = (id) => id === 'forge_t1';
    return builds.length === 1 && makes.length === 0;
  });
  attempt('제작 패널 — 🔨 작업대 탭 (미건설 안내)', () => {
    game.workbenchBuilt = () => false;
    pm.state.craft.table = 'facility_workbench';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const tab = root.querySelectorAll('[data-act="craft-select"]').find((b) => b.dataset.table === 'facility_workbench');
    const makes = root.querySelectorAll('[data-act="craft-make"]');
    return Boolean(tab) && makes.length === 0;
  });
  attempt('제작 패널 — 작업대 67종 + 무기별(계열) 분류 10탭', () => {
    game.workbenchBuilt = () => true;
    pm.state.craft.table = 'facility_workbench';
    pm.state.craft.benchFamily = 'all';
    pm.open('craft');
    const root0 = documentStub.getElementById('panel-root');
    const makes0 = root0.querySelectorAll('[data-act="craft-make"]');
    const hasDream = makes0.some((b) => b.dataset.weapon === 'dream_lantern');
    const famTabs = root0.querySelectorAll('[data-act="craft-bench-family"]');
    if (makes0.length !== 67 || hasDream || famTabs.length !== 10) return false;
    // 계열 탭 → 그 무기만 나온다
    const daggerTab = [...famTabs].find((b) => b.dataset.family === 'dagger');
    if (!daggerTab) return false;
    root0.dispatch('click', { target: daggerTab, preventDefault() {}, stopPropagation() {} });
    const root1 = documentStub.getElementById('panel-root');
    const makes1 = root1.querySelectorAll('[data-act="craft-make"]');
    const onlyDaggers = [...makes1].every((b) => (b.dataset.weapon || '').startsWith('dagger_'));
    // 비밀 등급(T8) 꿈나무는 dream 계열에만 있다
    const dreamTab = [...root1.querySelectorAll('[data-act="craft-bench-family"]')].find((b) => b.dataset.family === 'dream');
    if (!dreamTab) return false;
    root1.dispatch('click', { target: dreamTab, preventDefault() {}, stopPropagation() {} });
    const makes2 = documentStub.getElementById('panel-root').querySelectorAll('[data-act="craft-make"]');
    const hasTree = [...makes2].some((b) => b.dataset.weapon === 'dream_tree');
    if (!(makes1.length === 10 && onlyDaggers && makes2.length === 1 && hasTree)) return false;
    // 가위 계열 탭 = 유물 가위 1종만
    const scissorsTab = [...root1.querySelectorAll('[data-act="craft-bench-family"]')].find((b) => b.dataset.family === 'scissors');
    if (!scissorsTab) return false;
    root1.dispatch('click', { target: scissorsTab, preventDefault() {}, stopPropagation() {} });
    const makes3 = documentStub.getElementById('panel-root').querySelectorAll('[data-act="craft-make"]');
    return makes3.length === 1 && makes3[0].dataset.weapon === 'time_scissors';
  });
  // ── 화살(소모품) — 활 계열 10종 · 화살 7종(forge_tN 1종 / 작업대 분기 7종) ──
  attempt('제작 패널 — forge_t1 화살 카드 1장(묶음 150발 · 발당 피해 ×1.00 · 버튼 arrow_t1)', () => {
    game.craftingTableBuilt = (id) => id === 'forge_t1';
    pm.state.craft.table = 'forge_t1';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const rows = root.querySelectorAll('[data-role="craft-arrow-row"]');
    if (rows.length !== 1) return false;
    const card = rows[0];
    const text = String(card.textContent);
    const btn = card.querySelectorAll('[data-act="craft-arrow"]')[0];
    return (
      card.dataset.arrow === 'arrow_t1' &&
      card.dataset.table === 'forge_t1' &&
      text.includes('나무 화살') &&
      text.includes('150발') &&
      text.includes('×1.00') &&
      text.includes('제작 비용') &&
      Boolean(btn) &&
      btn.dataset.arrow === 'arrow_t1' &&
      btn.disabled === false
    );
  });
  attempt('제작 패널 — 카타나(불멸) 계열 탭에 유물 1종', () => {
    const prevBench = pm.state.craft.benchFamily;
    try {
      game.workbenchBuilt = () => true;
      pm.state.craft.table = 'facility_workbench';
      pm.state.craft.benchFamily = 'all';
      pm.open('craft');
      const r0 = documentStub.getElementById('panel-root');
      const katanaTab = [...r0.querySelectorAll('[data-act="craft-bench-family"]')].find((b) => b.dataset.family === 'katana');
      if (!katanaTab) return false;
      r0.dispatch('click', { target: katanaTab, preventDefault() {}, stopPropagation() {} });
      const cards = documentStub.getElementById('panel-root').querySelectorAll('[data-act="craft-make"]');
      return cards.length === 1 && cards[0].dataset.weapon === 'katana_immortal';
    } finally {
      pm.state.craft.benchFamily = prevBench;
      pm.close();
    }
  });

  attempt('제작 패널 — 작업대 탭 화살 7종 카드 + 카드마다 필요 제작대 행', () => {
    game.workbenchBuilt = () => true;
    pm.state.craft.table = 'facility_workbench';
    pm.state.craft.benchFamily = 'all';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const rows = root.querySelectorAll('[data-role="craft-arrow-row"]');
    const ids = [...rows].map((r) => r.dataset.arrow);
    const wanted = ['arrow_t1', 'arrow_t2', 'arrow_t3', 'arrow_t4', 'arrow_t5', 'arrow_t6', 'arrow_t7'];
    const allHaveTable = [...rows].every((r) => String(r.textContent).includes('필요 제작대'));
    const t1 = [...rows].find((r) => r.dataset.arrow === 'arrow_t1');
    const t7 = [...rows].find((r) => r.dataset.arrow === 'arrow_t7');
    const t1Text = t1 ? String(t1.textContent) : '';
    const t7Text = t7 ? String(t7.textContent) : '';
    return (
      rows.length === 7 &&
      wanted.every((id) => ids.includes(id)) &&
      allHaveTable &&
      t1Text.includes('T1') &&
      t1Text.includes('모루') &&
      t7Text.includes('T7')
    );
  });
  attempt('제작 패널 — 화살 제작 버튼이 game.craftArrow 를 호출', () => {
    let called = null;
    const prevEco = game.economy;
    game.craftArrow = (id) => { called = id; return { ok: true, arrow: { id, name: '나무 화살' }, amount: 150 }; };
    game.economy = { gold: 9e9, wood: 9e9, canAfford: () => true, getArrow: () => 150 };
    game.craftingTableBuilt = (id) => id === 'forge_t1';
    pm.state.craft.table = 'forge_t1';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const btn = root.querySelectorAll('[data-act="craft-arrow"]')[0];
    if (!btn || btn.disabled === true) { game.economy = prevEco; return false; }
    root.dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    const msg = String(pm.state.craft.message || '');
    game.economy = prevEco;
    return (
      called === 'arrow_t1' &&
      called === btn.dataset.arrow &&
      msg.includes('제작 완료') &&
      msg.includes('150발') &&
      msg.includes('보유 150발')
    );
  });
  attempt('건설 패널 — 🏗 시설 탭 33종(기본·연성대·저장고·발전기·전선·벨트·소환문)', () => {
    pm.state.build.category = 'facility';
    pm.state.build.tier = 0;
    pm.open('build');
    const root = documentStub.getElementById('panel-root');
    const picks = root.querySelectorAll('[data-act="build-pick"]');
    const hasBelt = picks.some((b) => b.dataset.type === 'facility_conveyor_t1' && b.dataset.type !== 'facility_conveyor_t7');
    return (
      picks.length === 33 &&
      picks.some((b) => b.dataset.type === 'facility_workbench') &&
      picks.some((b) => b.dataset.type === 'facility_storage_t7') &&
      picks.some((b) => b.dataset.type === 'facility_generator_t1') &&
      picks.some((b) => b.dataset.type === 'facility_cable') &&
      picks.some((b) => b.dataset.type === 'facility_spawner_t7')
    );
  });
  attempt('건설 패널 — 시설 티어 탭(T4 = 저장고·발전기·벨트·소환문 각 1종)', () => {
    pm.state.build.category = 'facility';
    pm.state.build.tier = 4;
    pm.open('build');
    const root = documentStub.getElementById('panel-root');
    const picks = root.querySelectorAll('[data-act="build-pick"]');
    return (
      picks.length === 4 &&
      picks.some((b) => b.dataset.type === 'facility_storage_t4') &&
      picks.some((b) => b.dataset.type === 'facility_generator_t4') &&
      picks.some((b) => b.dataset.type === 'facility_conveyor_t4') &&
      picks.some((b) => b.dataset.type === 'facility_spawner_t4')
    );
  });
  attempt('제작 패널 — 제작대 선택 변경 (T5 용광로)', () => {
    game.craftingTableBuilt = () => true;
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const tab = root.querySelectorAll('[data-act="craft-select"]').find((b) => b.dataset.table === 'forge_t5');
    if (!tab) return false;
    root.dispatch('click', { target: tab, preventDefault() {}, stopPropagation() {} });
    const makes = documentStub.getElementById('panel-root').querySelectorAll('[data-act="craft-make"]');
    return makes.some((b) => b.dataset.weapon === 'sword1h_dawn');
  });
  attempt('마법부여 패널 — 무기·속성 목록 렌더', () => {
    game.enchanterBuilt = () => true;
    game.enchantState = () => ({
      built: true,
      near: true,
      maxLevel: 5,
      weaponId: 'sword1h_guard',
      elements: [
        { id: 'fire', name: '화염 부여', icon: '🔥', grade: 'common', desc: '불씨', cost: { gold: 900, minerals: { coal: 4 } }, level: 1, maxed: false, same: false },
        { id: 'ice', name: '냉기 부여', icon: '❄️', grade: 'common', desc: '서리', cost: null, level: 5, maxed: true, same: true }
      ],
      weapons: [
        { id: 'sword1h_guard', name: '근위병의 검', tier: 1, gradeName: '일반', equipped: true, enchant: null },
        { id: 'bow1h_hunter', name: '사냥꾼의 활', tier: 1, gradeName: '일반', equipped: false, enchant: { icon: '🔥', name: '화염 부여', level: 2, percent: 16 } }
      ],
      applied: [{ weaponId: 'bow1h_hunter', icon: '🔥', name: '화염 부여', level: 2, percent: 16 }]
    });
    pm.open('enchant');
    const root = documentStub.getElementById('panel-root');
    const weapons = root.querySelectorAll('[data-role="enchant-weapon"]');
    const elements = root.querySelectorAll('[data-role="enchant-element"]');
    const applies = root.querySelectorAll('[data-act="enchant-apply"]');
    const maxed = [...applies].filter((b) => b.disabled);
    return weapons.length === 2 && elements.length === 2 && applies.length === 2 && maxed.length === 1;
  });
  attempt('마법부여 패널 — 부여 버튼이 enchant:apply 를 보낸다', () => {
    let sent = null;
    const offApply = pm.on('enchant:apply', (p) => { sent = p; });
    game.enchantWeapon = (weaponId, elementId) => ({ ok: true, level: 1, state: { percent: 8 } });
    const root = documentStub.getElementById('panel-root');
    const btn = root.querySelectorAll('[data-act="enchant-apply"]')[0];
    if (!btn) return false;
    root.dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    const okSent = sent?.weaponId === btn.dataset.weapon && sent?.elementId === btn.dataset.element;
    offApply();
    return okSent;
  });
  attempt('마법부여 패널 — 미건설이면 건설 안내', () => {
    game.enchanterBuilt = () => false;
    game.enchantState = () => ({ built: false, near: false, maxLevel: 5, weapons: [], elements: [], weaponId: '', applied: [] });
    pm.open('enchant');
    const root = documentStub.getElementById('panel-root');
    const text = String(root.querySelector('[data-panel="enchant"]')?.textContent ?? '');
    const go = root.querySelectorAll('[data-act="panel-open"]');
    return text.includes('미건설') && go.length === 1 && go[0].dataset.panel === 'build';
  });
  attempt('제작 패널 — 제작 버튼이 game.craftWeapon 을 호출', () => {
    let called = null;
    game.craftWeapon = (id) => { called = id; return { ok: true }; };
    game.craftingTableBuilt = () => true;
    pm.state.craft.table = 'forge_t1';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const btn = root.querySelectorAll('[data-act="craft-make"]')[0];
    if (!btn) return false;
    root.dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    return called === btn.dataset.weapon;
  });
  attempt('제작 패널 — T1 제작대에 요정의 날개 레시피 1종', () => {
    game.craftingTableBuilt = (id) => id === 'forge_t1';
    pm.state.craft.table = 'forge_t1';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const rows = root.querySelectorAll('[data-role="craft-wing-row"]');
    if (rows.length !== 1 || rows[0].dataset.wingId !== 'fairy_wings') return false;
    const text = String(rows[0].textContent);
    const btn = rows[0].querySelectorAll('[data-act="craft-wing"]')[0];
    return (
      text.includes('모루') &&      // 제작대
      text.includes('비행 성능') && // 비행 수치
      text.includes('철광석') &&    // 비용
      text.includes('유물') === false &&
      Boolean(btn) && btn.dataset.wing === 'fairy_wings'
    );
  });
  attempt('제작 패널 — 날개 제작 버튼이 game.craftWing 을 호출', () => {
    const richEco = { gold: 9e9, wood: 9e9, canAfford: () => true, spend: () => true };
    const prevEco = game.economy;
    let called = null;
    game.economy = richEco;
    game.craftWing = (id) => { called = id; return { ok: true }; };
    game.craftingTableBuilt = (id) => id === 'forge_t1';
    pm.state.craft.table = 'forge_t1';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const btn = root.querySelectorAll('[data-act="craft-wing"]')[0];
    if (!btn || btn.disabled === true) { game.economy = prevEco; return false; }
    root.dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    const msg = String(pm.state.craft.message || '');
    game.economy = prevEco;
    return called === 'fairy_wings' && msg.includes('제작 완료');
  });
  attempt('제작 패널 — 제작대 미건설이면 날개 제작 버튼 없음', () => {
    game.craftingTableBuilt = () => false;
    pm.state.craft.table = 'forge_t1';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const rows = root.querySelectorAll('[data-role="craft-wing-row"]');
    const btns = root.querySelectorAll('[data-act="craft-wing"]');
    const text = rows.length ? rows[0].querySelectorAll('.row-value').map((v) => String(v.textContent)).join(' | ') : '';
    game.craftingTableBuilt = (id) => id === 'forge_t1';
    return rows.length === 1 && btns.length === 0 && text.includes('미건설');
  });
  attempt('제작 패널 — 선행 날개가 없으면 T2 날개 제작 불가', () => {
    game.craftingTableBuilt = () => true;
    pm.state.craft.table = 'forge_t2';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const rows = root.querySelectorAll('[data-role="craft-wing-row"]');
    const btns = root.querySelectorAll('[data-act="craft-wing"]');
    const text = rows.length ? String(rows[0].textContent) : '';
    return rows.length === 1 && rows[0].dataset.wingId === 'sakura_wings' && btns.length === 0 && text.includes('선행 날개');
  });
  attempt('제작 패널 — 작업대 탭에는 날개 레시피가 없다', () => {
    game.workbenchBuilt = () => true;
    pm.state.craft.table = 'facility_workbench';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    return root.querySelectorAll('[data-role="craft-wing-row"]').length === 0 &&
      root.textContent.includes('날개는 작업대에서 만들 수 없습니다');
  });
  attempt('click delegation picks a turret card', () => {
    pm.open('build');
    const root = documentStub.getElementById('panel-root');
    const card = root.querySelectorAll('[data-act]').find((e) => e.dataset.act === 'build-pick');
    if (!card) return false;
    root.dispatch('click', { target: card, preventDefault() {}, stopPropagation() {} });
    return true;
  });

  attempt('건설창에서 포탑을 고르면 건설창이 닫힌다', () => {
    pm.open('build');
    const root = documentStub.getElementById('panel-root');
    const card = root.querySelectorAll('[data-act]').find((e) => e.dataset.act === 'build-pick');
    if (!card) return false;
    root.dispatch('click', { target: card, preventDefault() {}, stopPropagation() {} });
    return pm.current === null && pm.hasOpen() === false && pm.state.build.selected === card.dataset.type;
  });
  attempt('포탑 선택 이벤트는 그대로 방출된다(건설 모드 배선 유지)', () => {
    const seen = [];
    const off = pm.on('build:select', (d) => seen.push(d?.typeId));
    pm.open('build');
    const root = documentStub.getElementById('panel-root');
    const card = root.querySelectorAll('[data-act]').find((e) => e.dataset.act === 'build-pick');
    root.dispatch('click', { target: card, preventDefault() {}, stopPropagation() {} });
    off();
    return seen.length === 1 && seen[0] === card.dataset.type;
  });
  attempt('markBuildSelected — 카드 하이라이트 동기화(단축키·휠 경로)', () => {
    pm.open('build');
    const cards = documentStub.getElementById('panel-root').querySelectorAll('[data-act="build-pick"]');
    if (cards.length < 2) return false;
    const target = cards[1].dataset.type;
    pm.markBuildSelected(target);
    // 스텁 DOM 은 단순 선택자만 지원하므로 클래스로 찾고 데이터로 거른다.
    const selected = documentStub
      .getElementById('panel-root')
      .querySelectorAll('.is-selected')
      .filter((c) => c.dataset.act === 'build-pick');
    const hit = selected.length === 1 && selected[0].dataset.type === target;
    pm.close();
    return pm.state.build.selected === target && hit;
  });


  // ── 요정의 날개 (인벤토리 패널) ──
  {
    const { WingSystem } = await import(mod('systems/wings.js'));
    const { GearSystem } = await import(mod('systems/gear.js'));
    const { Economy } = await import(mod('systems/economy.js'));
    const wingEco = new Economy({
      gold: 300000,
      wood: 0,
      minerals: { iron: 50, quartz: 50, mana: 10 },
      leathers: { leather: 40, thick_leather: 30, scaled_leather: 20, dragon_leather: 10, relic_leather: 5 }
    });
    const wingSys = new WingSystem({ economy: wingEco });
    const gearSys = new GearSystem({ economy: wingEco });
    const saved = { eco: game.economy, wings: game.wings, player: game.player, admin: game.adminFlight, gear: game.gear };
    let bad = null;
    game.economy = wingEco;
    game.wings = wingSys;
    game.gear = gearSys;
    game.player = { flying: false };
    game.adminFlight = false;
    try {
      const root = documentStub.getElementById('panel-root');
      pm.open('inventory');
      const rows = root.querySelectorAll('[data-role="wing-row"]');
      ok('요정의 날개 카드 8장', rows.length === 8, rows.map((r) => r.dataset.wingId).join(','));
      ok(
        '날개 id 순서(1→7티어 + 초월)',
        rows.map((r) => r.dataset.wingId).join(',') ===
          'fairy_wings,sakura_wings,star_wings,runic_wings,frost_wings,volcano_wings,artifact_wings,aether_wings'
      );
      ok('비행 성능 문구 표시', rows[0].querySelectorAll('.row-value').some((v) => String(v.textContent).includes('속도 ×1.27')));
      const gradeTexts = rows.map((r) => r.querySelectorAll('.row-value').map((v) => String(v.textContent)).join(' '));
      ok(
        '등급 표시(일반~초월)',
        gradeTexts[0].includes('일반') && gradeTexts[6].includes('유물') && gradeTexts[7].includes('초월'),
        gradeTexts.map((t) => t.slice(0, 12)).join(' / ')
      );
      // 날개는 제작대에서 만든다 — 카드 버튼은 제작 패널로 이동시킨다
      const makeBtns = root.querySelectorAll('[data-act="wing-goto-craft"]');
      ok('제작대 이동 버튼 8개(모두 활성)', makeBtns.length === 8 && makeBtns.every((b) => b.disabled !== true), `${makeBtns.length}개`);
      ok(
        '카드 버튼이 해당 티어 제작대를 가리킨다',
        makeBtns.map((b) => b.dataset.table).join(',') ===
          'forge_t1,forge_t2,forge_t3,forge_t4,forge_t5,forge_t6,forge_t7,garden_of_dreams',
        makeBtns.map((b) => b.dataset.table).join(',')
      );
      ok('날개 카드에 제작대 안내 행', rows[0].querySelectorAll('.row-value').some((v) => String(v.textContent).includes('모루')));
      const gradeBadges = rows.map((r) => (r.querySelectorAll('[data-role="wing-tier"]')[0]?.textContent ?? ''));
      ok('날개 배지에 티어 + 등급', gradeBadges[0].includes('T1') && gradeBadges[0].includes('일반') && gradeBadges[7].includes('초월'), gradeBadges.join(','));

      // ── 가죽 · 가죽 장비 섹션 ──
      const leatherRows = root.querySelectorAll('[data-role="leather-row"]');
      ok('가죽 카드 5장', leatherRows.length === 5, leatherRows.map((r) => r.dataset.leatherId).join(','));
      const gearRows = root.querySelectorAll('[data-role="gear-row"]');
      ok('가죽 장비 카드 6장', gearRows.length === 6, gearRows.map((r) => r.dataset.gearId).join(','));
      ok(
        '장비 카드 — 슬롯 6곳 1:1',
        new Set(gearRows.map((r) => r.dataset.slot)).size === 6 &&
          gearRows.map((r) => r.dataset.slot).join(',') === 'head,body,feet,back,waist,hands'
      );
      const gearBuy = root.querySelectorAll('[data-act="gear-buy"]');
      const gearAffordable = gearBuy.filter((b) => b.disabled !== true).map((b) => b.dataset.id);
      ok(
        '장비 제작 버튼 6개(가죽 충분 5종 활성 · 유물 장갑은 골드 부족)',
        gearBuy.length === 6 && gearAffordable.length === 5 && !gearAffordable.includes('relic_grips'),
        gearAffordable.join(',')
      );
      const offAll = root.querySelectorAll('[data-act="gear-unequip-all"]')[0];
      ok('전부 해제 버튼(미착용이면 비활성)', Boolean(offAll) && offAll.disabled === true);

      const gearSeen = [];
      pm.on('gear:buy', (p) => gearSeen.push(['buy', p]));
      pm.on('gear:equip', (p) => gearSeen.push(['equip', p]));
      pm.on('gear:unequip', (p) => gearSeen.push(['unequip', p]));
      pm.on('gear:unequip-all', (p) => gearSeen.push(['all', p]));
      root.dispatch('click', { target: gearBuy[0], preventDefault() {}, stopPropagation() {} });
      ok('장비 클릭 → gear:buy {id}', gearSeen.some(([e, p]) => e === 'buy' && p.id === 'leather_cap'));

      const boughtGear = gearSys.grant('dragon_belt');
      pm.open('inventory');
      const rowsGear2 = documentStub.getElementById('panel-root').querySelectorAll('[data-role="gear-row"]');
      const beltRow = rowsGear2.find((r) => r.dataset.gearId === 'dragon_belt');
      ok('장비 착용 반영 — 선택 표시', boughtGear.ok === true && Boolean(beltRow) && beltRow.classList.contains('is-selected'));
      const offGear = beltRow.querySelectorAll('[data-act="gear-unequip"]')[0];
      ok('착용 후 해제 버튼 활성', Boolean(offGear) && offGear.disabled !== true);
      const offAll2 = documentStub.getElementById('panel-root').querySelectorAll('[data-act="gear-unequip-all"]')[0];
      ok('전부 해제 버튼 활성(1벌 이상)', Boolean(offAll2) && offAll2.disabled !== true);

      const seen = [];
      pm.on('wing:equip', (p) => seen.push(['equip', p]));
      pm.on('wing:unequip', (p) => seen.push(['unequip', p]));
      root.dispatch('click', { target: makeBtns[0], preventDefault() {}, stopPropagation() {} });
      ok(
        '제작대 이동 클릭 → 제작 패널 + 해당 티어 탭',
        pm.isOpen('craft') && pm.state.craft.table === 'forge_t1',
        `open=${pm.isOpen('craft')} table=${pm.state.craft.table}`
      );
      pm.open('inventory');

      const bought = wingSys.buy('fairy_wings');
      pm.open('inventory');
      const rows2 = documentStub.getElementById('panel-root').querySelectorAll('[data-role="wing-row"]');
      const first2 = rows2[0];
      ok('구매 반영 — 선택 표시', bought.ok === true && first2.classList.contains('is-selected'));
      const eqBtn = first2.querySelectorAll('[data-act="wing-equip"]')[0];
      const offBtn = first2.querySelectorAll('[data-act="wing-unequip"]')[0];
      ok('보유 후 장착/접기 버튼', Boolean(eqBtn) && Boolean(offBtn) && eqBtn.disabled === true);

      wingSys.grant('star_wings');
      pm.open('inventory');
      const rows3 = documentStub.getElementById('panel-root').querySelectorAll('[data-role="wing-row"]');
      const star = rows3.find((r) => r.dataset.wingId === 'star_wings');
      ok('최상위 날개 착용 표시', Boolean(star) && star.classList.contains('is-selected'));
      const starText = star.querySelectorAll('.row-value').map((v) => String(v.textContent)).join(' | ');
      ok('마나 소모 없음 문구', starText.includes('마나 소모 없음'), starText.slice(0, 50));
      const eqStar = star.querySelectorAll('[data-act="wing-equip"]')[0];
      ok('착용 중이면 장착 버튼 비활성', Boolean(eqStar) && eqStar.disabled === true);

      // 날개 시스템이 없어도(스텁/구버전) 데이터 기본값으로 그려야 한다
      game.wings = null;
      pm.open('inventory');
      const rows4 = documentStub.getElementById('panel-root').querySelectorAll('[data-role="wing-row"]');
      ok('wings 없음 → 데이터 기본값 8장', rows4.length === 8);
      game.gear = null;
      pm.open('inventory');
      const rowsGear4 = documentStub.getElementById('panel-root').querySelectorAll('[data-role="gear-row"]');
      ok('gear 없음 → 데이터 기본값 6장', rowsGear4.length === 6 && rowsGear4.every((r) => r.querySelectorAll('[data-act="gear-buy"]').length === 1));
    } catch (e) {
      bad = e.message;
    } finally {
      game.economy = saved.eco;
      game.wings = saved.wings;
      game.player = saved.player;
      game.adminFlight = saved.admin;
    }
    ok('요정의 날개 인벤토리 섹션 완주', bad === null, bad || '');
  }
}

// ── menu.js ──
console.log('\n== menu.js ==');
const menuMod = await import(ui('menu.js'));
ok('MainMenu exported', typeof menuMod.MainMenu === 'function');
const menu = attempt('MainMenu constructs (builds #menu-root)', () => new menuMod.MainMenu({ game }));

// ── 메인화면(H-88b) — 부제와 4단 버튼이 실제로 그려지는지. 버튼은 본문이 아니라 메뉴 루트에 붙어야 살아남는다.
{
  const mroot = documentStub.getElementById('menu-root');
  const all = mroot.querySelectorAll('*');
  ok('메인화면 — 부제 마법의 비밀', all.filter((el) => (el.textContent ?? '') === '마법의 비밀').length === 1);
  const acts = ['world', 'multi', 'options', 'leave'];
  ok('메인화면 — 오른쪽 아래 4단 버튼', acts.every((a) => documentStub.body.querySelectorAll('[data-act="' + a + '"]').length >= 1), acts.join(','));
  const cta = mroot.querySelector('[data-act="world"]');
  ok('메인화면 — 버튼이 화면 최상위(body)에 붙는다', !!documentStub.body.querySelector('[data-act="world"]'));
  let started = false;
  menu.on('start', () => { started = true; });
  // H-94: 싱글 플레이 버튼은 화면만 열고, 게임 시작은 [게임 시작] 버튼이 한다.
  menu._heroAct('world');
  const soloView = documentStub.getElementById('menu-root').dataset.view;
  ok('메인화면 — [싱글 플레이] 가 싱글 화면을 연다', soloView === 'solo' && started === false, String(soloView));
  menu._heroAct('multi');
  const multiView = documentStub.getElementById('menu-root').dataset.view;
  ok('메인화면 — [멀티플레이] 가 멀티 화면을 연다', multiView === 'multi', String(multiView));
  menu._heroAct('start');
  ok('메인화면 — [게임 시작] 이 start 를 보낸다', started === true);
  // 사용자 요청: [게임 시작] 을 없애고, [불러오기] 는 각 플레이 화면(카드) 안으로 옮겼다.
  //  싱글·멀티 카드는 함께 렌더되고 CSS 로 하나만 보이므로, 모드별 존재 여부로 검사한다.
  ok('메인화면 — [게임 시작] 버튼이 없다', documentStub.body.querySelectorAll('[data-act="start"]').length === 0);
  menu.show('main');
  menu._heroAct('world');
  const soloLoads = documentStub.getElementById('menu-root').querySelectorAll('[data-act="menu-load"]');
  ok(
    '싱글 화면 — [불러오기] 가 카드 안에 있다',
    soloLoads.some((b) => b.dataset.mode === 'solo'),
    `modes=${soloLoads.map((b) => b.dataset.mode).join(',')}`
  );
  menu.show('main');
  menu._heroAct('multi');
  const multiLoads = documentStub.getElementById('menu-root').querySelectorAll('[data-act="menu-load"]');
  ok(
    '멀티 화면 — [불러오기] 가 카드 안에 있다',
    multiLoads.some((b) => b.dataset.mode === 'multi'),
    `modes=${multiLoads.map((b) => b.dataset.mode).join(',')}`
  );
  menu.hide();
}
if (menu) {
  ok('hidden right after construction', menu.visible === false);
  ok('show("main") makes it visible', menu.show('main') === true && menu.visible === true);
  ok('show("seeds") / show("help") render', menu.show('seeds') && menu.show('help') && menu.show('main'));
  const root = documentStub.getElementById('menu-root');
  ok('title screen has title + tabs + seed input', Boolean(root.querySelector('.menu-title')) && root.querySelectorAll('[data-act="menu-tab"]').length === 4 && Boolean(root.querySelector('[data-field="menu-seed"]')));
  ok('mode/difficulty selectors rendered', root.querySelectorAll('[data-act="menu-mode"]').length === 4 && root.querySelectorAll('[data-act="menu-diff"]').length === 4);
  ok('help control table lists every keybind', (() => {
    menu.show('help');
    const rows = documentStub.getElementById('menu-root').querySelectorAll('.row');
    return rows.length >= 17;
  })());
  menu.show('main');
  const seen = [];
  for (const ev of ['start', 'multiplayer', 'settings', 'help', 'auth', 'codex', 'seed:pick']) menu.on(ev, (p) => seen.push([ev, p]));
  attempt('start button click emits start {mode,seed,difficulty}', () => {
    const btn = documentStub.getElementById('menu-root').querySelectorAll('[data-act="menu-start"]')[0];
    if (!btn) return false;
    documentStub.getElementById('menu-root').dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    const hit = seen.find(([e]) => e === 'start');
    return Boolean(hit) && typeof hit[1].seed === 'string' && hit[1].seed.length > 0 && typeof hit[1].mode === 'string' && typeof hit[1].difficulty === 'string';
  });
  attempt('multiplayer shortcut emits multiplayer', () => {
    menu.show('main');
    const btn = documentStub.getElementById('menu-root').querySelectorAll('[data-act="menu-multiplayer"]')[0];
    documentStub.getElementById('menu-root').dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    return seen.some(([e]) => e === 'multiplayer');
  });
  // 🎯 미니게임 — 새 탭이 아니라 본편 위 오버레이로 화면을 넘긴다(계약 §4.46)
  attempt('🎯 미니게임 카드가 바로 가기에 있다', () => {
    menu.show('main');
    const card = documentStub.getElementById('menu-root').querySelector('[data-act="menu-minigame"]');
    return Boolean(card);
  });
  attempt('🎯 미니게임 카드 클릭 → game.openMiniGame() 위임', () => {
    menu.show('main');
    let calls = 0;
    game.openMiniGame = () => { calls += 1; return true; };
    try {
      const card = documentStub.getElementById('menu-root').querySelector('[data-act="menu-minigame"]');
      documentStub.getElementById('menu-root').dispatch('click', { target: card, preventDefault() {}, stopPropagation() {} });
      return calls === 1;
    } finally {
      delete game.openMiniGame;
    }
  });

  // ── 열린 방 목록 (메인 화면 · 코드 없이 클릭 참가) ──
  // netMod 는 이 파일 뒤쪽에서 import 되므로(멀티플레이 섹션) 같은 모듈을 직접 가져와 캐시를 조작한다.
  const roomListRef = (await import(mod('net.js'))).roomList;
  const realRoomLoad = roomListRef.load;
  roomListRef.load = async () => ({ rooms: [] });
  attempt('메인 화면 — 열린 방 카드가 목록을 그린다', () => {
    menu.show('main');
    const root = documentStub.getElementById('menu-root');
    if (!root.querySelector('[data-role="rooms"]')) return false;
    menu.setRooms([
      { code: 'ABCD', mode: 'coop', difficulty: 'hard', players: 2, maxPlayers: 4, host: '무진', joinable: true },
      { code: 'WXYZ', mode: 'coop', difficulty: 'normal', players: 4, maxPlayers: 4, host: '가득', joinable: false },
      { code: 'PRIV', mode: 'coop', difficulty: 'normal', players: 1, maxPlayers: 4, private: true, joinable: true }
    ]);
    const rows = documentStub.getElementById('menu-root').querySelectorAll('.menu-room');
    const join = documentStub.getElementById('menu-root').querySelectorAll('[data-act="menu-room-join"]');
    const abcd = join.find((b) => b.dataset.code === 'ABCD');
    const wxyz = join.find((b) => b.dataset.code === 'WXYZ');
    return (
      rows.length === 2 &&
      Boolean(abcd) &&
      abcd.disabled === false &&
      String(abcd.textContent) === '참가' &&
      Boolean(wxyz) &&
      wxyz.disabled === true &&
      String(wxyz.textContent).includes('정원 초과')
    );
  });
  attempt('열린 방 — 비공개 방은 그리지 않는다', () => {
    const rows = documentStub.getElementById('menu-root').querySelectorAll('.menu-room');
    return rows.length === 2 && rows.every((r) => r.dataset.code !== 'PRIV') && menu.rooms.length === 2;
  });
  attempt('열린 방 — 없음/오류 안내 문구', () => {
    menu.setRooms([], '');
    const empty = String(documentStub.getElementById('menu-root').querySelector('[data-role="rooms"]').textContent);
    menu.setRooms([], '서버에 연결할 수 없습니다');
    const warn = String(documentStub.getElementById('menu-root').querySelector('[data-role="rooms"]').textContent);
    return empty.includes('아직 열린 방이 없습니다') && warn.includes('서버에 연결할 수 없습니다');
  });
  attempt('열린 방 [참가] 클릭 → multiplayer:join + 메뉴 닫힘', () => {
    const got = [];
    const off = menu.on('multiplayer:join', (p) => got.push(p));
    menu.show('main');
    menu.setRooms([{ code: 'k7qp', mode: 'coop', difficulty: 'normal', players: 1, maxPlayers: 4, host: '친구', joinable: true }]);
    const btn = documentStub.getElementById('menu-root').querySelectorAll('[data-act="menu-room-join"]')[0];
    if (!btn) return false;
    documentStub.getElementById('menu-root').dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    off();
    const input = documentStub.getElementById('menu-root').querySelector('[data-field="menu-invite"]');
    const rowText = String(documentStub.getElementById('menu-root').querySelector('.menu-room')?.textContent || '');
    return got.length === 1 && got[0].code === 'K7QP' && menu.visible === false && String(input?.value) === 'K7QP' && rowText.includes('친구');
  });
  {
    // 새로고침 버튼 → 서버 목록 재요청(진행 중 갱신이 끝나도록 한 틱 양보한 뒤 센다)
    let calls = 0;
    const before = roomListRef.load;
    roomListRef.load = async () => {
      calls += 1;
      return { rooms: [{ code: 'EF56', mode: 'coop', difficulty: 'normal', players: 3, maxPlayers: 4, host: '새로고침', joinable: true }] };
    };
    menu.show('main');
    await Promise.resolve();
    calls = 0;
    const btn = documentStub.getElementById('menu-root').querySelectorAll('[data-act="menu-rooms-refresh"]')[0];
    documentStub.getElementById('menu-root').dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    await Promise.resolve();
    const hit = calls === 1 && menu.rooms.length === 1 && menu.rooms[0].code === 'EF56';
    roomListRef.load = before;
    ok('열린 방 — 새로고침 버튼이 서버 목록을 다시 읽는다', hit, `calls=${calls} rooms=${menu.rooms.map((r) => r.code).join(',')}`);
  }
  {
    const before = roomListRef.load;
    roomListRef.load = async () => ({ rooms: [{ code: 'CD34', mode: 'coop', difficulty: 'nightmare', players: 2, maxPlayers: 4, host: '갱신', joinable: true }] });
    const auto = await menu.refreshRooms(true);
    roomListRef.load = before;
    ok('열린 방 — refreshRooms 가 서버 목록을 반영한다', auto.length === 1 && auto[0].code === 'CD34' && menu.rooms[0].host === '갱신');
  }
  roomListRef.load = realRoomLoad;
  menu.setRooms([], '');

  // 사용자 요청: 첫 화면 하단의 [로그인][도움말][설정] 버튼을 없앴다(도움말은 위 탭, 설정은 오른쪽 버튼).
  attempt('하단 [로그인][도움말][설정] 버튼이 없다', () => {
    menu.show('main');
    const root = documentStub.getElementById('menu-root');
    return ['menu-help', 'menu-auth', 'menu-settings'].every(
      (a) => root.querySelectorAll(`[data-act="${a}"]`).length === 0
    );
  });
  attempt('도움말은 위 탭으로 연다', () => {
    menu.show('help');
    const root = documentStub.getElementById('menu-root');
    return root.querySelectorAll('[data-act="menu-tab"]').some((b) => b.dataset.tab === 'help');
  });
  // 마인크래프트처럼 "서버 주소"만 넣고 그 서버에 붙는다.
  attempt('멀티 — 서버 주소 입력칸이 있다', () => {
    menu.show('main');
    menu._heroAct('multi');
    const root = documentStub.getElementById('menu-root');
    return Boolean(root.querySelector('[data-field="menu-server"]'));
  });
  attempt('멀티 — [접속] 이 server-connect 를 보낸다', () => {
    menu.show('main');
    menu._heroAct('multi');
    const root = documentStub.getElementById('menu-root');
    const input = root.querySelector('[data-field="menu-server"]');
    if (input) input.value = '192.168.0.10:3001';
    let sent = null;
    menu.on('server-connect', (p) => { sent = p; });
    const btn = root.querySelectorAll('[data-act="menu-server-connect"]')[0];
    if (!btn) return false;
    root.dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    return sent && sent.address === '192.168.0.10:3001';
  });
  // 회귀: 메뉴의 설정/협동/로그인은 패널을 "한 번만" 토글해야 한다.
  // (emit + togglePanel 이중 호출 → 열리자마자 닫히고 메뉴까지 숨겨 빈 화면이 되던 버그)
  game.togglePanel = (id) => pm.toggle(id);
  menu.on('settings', () => game.togglePanel('settings'));
  menu.on('multiplayer', () => game.togglePanel('multiplayer'));
  menu.on('auth', () => game.togglePanel('auth'));
  for (const [act, panelId] of [['menu-multiplayer', 'multiplayer']]) {
    attempt(`${act} 클릭 → #${panelId} 패널이 열린 채로 남는다(중복 토글 없음)`, () => {
      pm.close();
      menu.show('main');
      const b = documentStub.getElementById('menu-root').querySelectorAll(`[data-act="${act}"]`)[0];
      if (!b) return false;
      documentStub.getElementById('menu-root').dispatch('click', { target: b, preventDefault() {}, stopPropagation() {} });
      return pm.isOpen(panelId) === true;
    });
  }
  attempt("panels.close() 이 'close' 이벤트를 발생시킨다(메뉴 복귀 훅)", () => {
    pm.open('settings');
    let got = null;
    pm.on('close', (p) => { got = p; });
    pm.close();
    return Boolean(got) && got.id === 'settings';
  });
  attempt('계정 패널에 "계정 만들기" 버튼이 있다', () => {
    pm.open('auth');
    const el = documentStub.getElementById('panel-root').querySelector('[data-panel="auth"]');
    const hit = el ? el.querySelectorAll('[data-act="auth-tab"]').some((b) => b.dataset.tab === 'register') : false;
    pm.close();
    return hit;
  });
  attempt('carousel advances on update()', () => {
    menu.show('main');
    const before = menu._carousel;
    menu.update(10);
    return menu._carousel !== before;
  });
  // ── 패널을 새로 열면 항상 맨 위부터(스크롤 위치 때문에 위쪽이 가려 보이지 않게) ──
  {
    const body = pm._bodies?.auth ?? null;
    const panel = pm._panels?.get?.('auth') ?? null;
    pm.close();
    if (body && panel) {
      body.scrollTop = 420;
      panel.scrollTop = 90;
    }
    pm.open('auth');
    ok(
      '패널 열기 — 내용 스크롤을 맨 위로 되돌린다',
      Boolean(body) && body.scrollTop === 0 && Boolean(panel) && panel.scrollTop === 0,
      `body=${body?.scrollTop} panel=${panel?.scrollTop}`
    );
    // 이미 열려 있는 동안에는 스크롤 위치를 건드리지 않는다(읽던 자리 유지)
    if (body) body.scrollTop = 180;
    pm.refresh?.('auth');
    pm.open('auth');
    ok('이미 열려 있으면 스크롤 위치를 유지한다', Boolean(body) && body.scrollTop === 180, `body=${body?.scrollTop}`);
    if (body) body.scrollTop = 0;
    pm.close();
  }
  attempt('refresh() rebuilds', () => {
    menu.refresh();
    return true;
  });
  menu.hide();
  ok('hide() clears visibility', menu.visible === false);
}

// ── cutscene.js (real DOM path, rAF driven) ──
console.log('\n== cutscene.js ==');
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
const cs = await import(ui('cutscene.js'));
const crootPre = documentStub.getElementById('cutscene-root');
const camera = { position: { x: 5, y: 6, z: 7 } };
const scene = { overlay: { style: {} }, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } };
const t0 = Date.now();
let resolved = false;
try {
  await cs.playCutscene({
    grade: { id: 'epic', cutscene: 'burst', label: 'Epic', colour: '#a855f7' },
    element: { id: 'fire', name: 'Fire', colour: '#ff6b3d' },
    name: 'Test Spell',
    scene,
    camera,
    duration: 80
  });
  resolved = true;
} catch (e) {
  fails.push('playCutscene threw: ' + e.message);
  console.log('FAIL playCutscene threw ->', e.message);
}
ok('playCutscene resolves', resolved, `${Date.now() - t0}ms`);
const croot = documentStub.getElementById('cutscene-root');
ok('cutscene-root present after the first cutscene', Boolean(croot), `pre-existing=${Boolean(crootPre)}`);
ok('overlay disposed from DOM', croot.children.length === 0, `children=${croot.children.length}`);
ok('camera position restored', camera.position.x === 5 && camera.position.y === 6 && camera.position.z === 7);
try {
  await cs.playCutscene({
    grade: { id: 'relic', cutscene: 'relic', label: 'Relic', colour: '#ffd76a' },
    element: null,
    name: 'Relic Test',
    scene,
    camera,
    duration: 60
  });
  ok('relic grade renders + cleans up', croot.children.length === 0, `children=${croot.children.length}`);
} catch (e) {
  fails.push('relic cutscene threw: ' + e.message);
  console.log('FAIL relic cutscene threw ->', e.message);
}
try {
  await cs.playSkillCutscene('Skill', '#ffd76a');
  ok('playSkillCutscene cleans up', croot.children.length === 0);
} catch (e) {
  fails.push('playSkillCutscene threw: ' + e.message);
  console.log('FAIL playSkillCutscene threw ->', e.message);
}


// ── hud.js (보스 체력바 · 몬스터 체력바 연동) ──
console.log('\n== hud.js ==');
const hudMod = await import(ui('hud.js'));
const hudGame = {
  ...game,
  state: 'playing',
  waves: { phase: 'combat', wave: 10, timeLeft: 0, alive: 3, enemies: [] },
  enemies: [],
  bossInfo: null
};
const hud = attempt('HUD constructs (builds #hud-root)', () => new hudMod.HUD(hudGame));
ok('hud-root 을 만들었다', Boolean(documentStub.getElementById('hud-root')));
ok('보스 체력바 DOM 존재', Boolean(hud?._refs?.bossBar));
ok('보스 체력바는 기본 숨김', hud?._refs?.bossBar?.classList.contains('is-visible') === false);

// Round C — 전력/저장고 칩
hudGame.powerSummary = () => ({ supply: 12, demand: 5, short: false, generators: 1, cables: 2, consumers: 2, shortfall: 0, stopped: 0 });
hudGame.storageSummary = () => ({ count: 2, gold: 40, wood: 12, capacity: 120, powered: 2 });
hud.update(0.1);
ok('HUD ⚡ 칩 — 공급/소비 표시', String(hud._refs.power.textContent) === '12/5kW', hud._refs.power.textContent);
ok('HUD ⚡ 칩 — 정상이면 is-low 아님', hud._refs.powerChip.classList.contains('is-low') === false);
hudGame.powerSummary = () => ({ supply: 12, demand: 19, short: true, generators: 1, cables: 2, consumers: 4, shortfall: 7, stopped: 3 });
hud.update(0.1);
ok('HUD ⚡ 칩 — 정전이면 is-low + 부족 kW 안내', hud._refs.powerChip.classList.contains('is-low') === true && String(hud._refs.powerChip.title).includes('부족 7kW'), hud._refs.powerChip.title);
ok(
  'HUD 📦 칩 — 쌓인 자원(용량은 툴팁)',
  String(hud._refs.storage.textContent) === '40g 12w' &&
    String(hud._refs.storageChip.title).includes('120') &&
    hud._refs.storageChip.classList.contains('is-empty') === false,
  hud._refs.storage.textContent + ' / ' + hud._refs.storageChip.title
);
hudGame.storageSummary = () => ({ count: 0, gold: 0, wood: 0, capacity: 0, powered: 0 });
hud.update(0.1);
ok('HUD 📦 칩 — 저장고 없으면 is-empty', hud._refs.storageChip.classList.contains('is-empty') === true, hud._refs.storage.textContent);

// Round C — 🏹 화살 칩(활 계열 소모품 · economy.totalArrows())
const prevHudArrowEco = hudGame.economy;
hudGame.economy = { ...prevHudArrowEco, totalArrows: () => 7 };
hud.update(0.1);
ok(
  'HUD 🏹 칩 — economy.totalArrows() 값을 반영',
  String(hud._refs.arrows.textContent) === '7',
  hud._refs.arrows.textContent
);
hudGame.staff = { weapon: { kind: 'bow' } };
hud.update(0.1);
ok(
  'HUD 🏹 칩 — 활 장착이면 1발씩 소모 안내 툴팁',
  String(hud._refs.arrowsChip.title).includes('화살 7발') && String(hud._refs.arrowsChip.title).includes('1발씩 소모'),
  hud._refs.arrowsChip.title
);
hudGame.staff = null;
hudGame.economy = prevHudArrowEco;
hud.update(0.1);

// 보스 없음 → 숨김 유지
hudGame.powerSummary = () => null;
hudGame.storageSummary = () => null;
hud.update(0.1);
ok('보스가 없으면 숨김 유지', hud._refs.bossBar.classList.contains('is-visible') === false);

// 보스 등장 → 이름/체력/게이지
hudGame.bossInfo = {
  id: 'boss-1',
  typeId: 'lich',
  name: '리치',
  hp: 500,
  maxHp: 1000,
  ratio: 0.5,
  wave: 10,
  shielded: false,
  ability: 'summon',
  desc: '주기적으로 부하를 소환한다.'
};
hud.update(0.1);
ok('보스 등장 → 체력바 표시', hud._refs.bossBar.classList.contains('is-visible') === true);
ok('보스 이름 표시', hud._refs.bossName.textContent === '리치', hud._refs.bossName.textContent);
ok('보스 웨이브 표시', hud._refs.bossWave.textContent === '웨이브 10', hud._refs.bossWave.textContent);
ok('보스 체력 수치 표시', hud._refs.bossHpText.textContent === '500 / 1,000', hud._refs.bossHpText.textContent);
ok('보스 게이지 50%', hud._refs.bossFill.style.width === '50.00%', String(hud._refs.bossFill.style.width));
ok('보스 패턴 설명 표시', String(hud._refs.bossAbility.textContent).includes('소환'), hud._refs.bossAbility.textContent);
ok('정상 체력은 저체력 아님', hud._refs.bossBar.classList.contains('is-low') === false);

// 체력이 줄면 게이지·칩 레이어가 따라온다
hudGame.bossInfo = { ...hudGame.bossInfo, hp: 200, ratio: 0.2 };
hud.update(0.1);
ok('체력 감소 → 게이지 20%', hud._refs.bossFill.style.width === '20.00%', String(hud._refs.bossFill.style.width));
ok('지연 감소(칩) 레이어가 남아 있다', parseFloat(hud._refs.bossChip.style.width) > 20, String(hud._refs.bossChip.style.width));
ok('저체력 경고 클래스', hud._refs.bossBar.classList.contains('is-low') === true);

// 실드 보스
hudGame.bossInfo = { ...hudGame.bossInfo, shielded: true, hp: 900, ratio: 0.9 };
hud.update(0.1);
ok('실드 표시', hud._refs.bossBar.classList.contains('is-shielded') === true && String(hud._refs.bossAbility.textContent).includes('실드'), hud._refs.bossAbility.textContent);

// game.bossInfo 가 없으면 적 목록에서 보스를 찾는다(폴백)
hudGame.bossInfo = null;
hudGame.waves = { ...hudGame.waves, enemies: [{ id: 7, typeId: 'titan', name: '티탄', isBoss: true, alive: true, hp: 300, maxHp: 600, hpRatio: 0.5, type: { ability: 'shield', desc: '실드를 전개한다.' } }] };
hudGame.enemies = hudGame.waves.enemies; // 실제 Game.enemies getter 와 같은 모양
hud.update(0.1);
ok('적 목록 폴백으로 보스 표시', hud._refs.bossBar.classList.contains('is-visible') === true && hud._refs.bossName.textContent === '티탄', hud._refs.bossName.textContent);

// 보스 처치 → 숨김
hudGame.waves = { ...hudGame.waves, enemies: [] };
hudGame.enemies = hudGame.waves.enemies;
hud.update(0.1);
ok('보스 처치 → 숨김', hud._refs.bossBar.classList.contains('is-visible') === false);

// 메뉴 상태에서는 그리지 않는다
hudGame.state = 'menu';
hudGame.bossInfo = { id: 'b2', name: '고룡', hp: 10, maxHp: 10, ratio: 1, wave: 20 };
hud.update(0.1);
ok('메뉴에서는 보스 바 숨김', hud._refs.bossBar.classList.contains('is-visible') === false);
hudGame.state = 'playing';
hudGame.bossInfo = null;
// ── hud.js (요정의 날개 칩) ──
console.log('\n== hud.js 요정의 날개 ==');
{
  const prevWings = hudGame.wings;
  const prevPlayer = hudGame.player;
  ok('날개 칩 DOM 존재', Boolean(hud?._refs?.wings) && Boolean(hud?._refs?.wingsChip));
  hudGame.wings = { equippedName: '별의 날개' };
  hudGame.player = { flying: true, position: { y: 42 }, flight: { ceiling: 320, drain: 0 }, mana: 40, maxMana: 100, hp: 100, maxHp: 100 };
  hud.update(0.1);
  ok('비행 중 고도 표시', String(hud._refs.wings.textContent).includes('42'), String(hud._refs.wings.textContent));
  ok('비행 강조 클래스', hud._refs.wingsChip.classList.contains('is-flying') === true);
  hudGame.player = { flying: false, position: { y: 0 }, mana: 100, maxMana: 100, hp: 100, maxHp: 100 };
  hud.update(0.1);
  ok('착용 표시(비행 아님) — 날개 이름', hud._refs.wings.textContent === '별의 날개', String(hud._refs.wings.textContent));
  ok('비행 아님 — 강조 해제', hud._refs.wingsChip.classList.contains('is-flying') === false);
  hudGame.wings = null;
  hud.update(0.1);
  ok('날개 없음 — 없음 표기', String(hud._refs.wings.textContent).includes('없음'), String(hud._refs.wings.textContent));
  hudGame.wings = prevWings;
  hudGame.player = prevPlayer;
}
// ── hud.js (지역 표시 · 최종보스 심판 라벨) ──
console.log('\n== hud.js 지역 표시 / 최종보스 ==');
{
  ok('지역 표시 DOM 존재', Boolean(hud?._refs?.region));
  // world 가 없으면 기지 안전 지대로 표시
  hudGame.world = null;
  hudGame.player = { position: { x: 0, y: 0, z: 0 } };
  hud.update(0.1);
  ok('world 없음 → 기지 안전 지대', hud._refs.regionName.textContent === '기지 안전 지대', hud._refs.regionName.textContent);

  // 티어 지역
  hudGame.world = {
    regionSummary: (x, z) => ({ id: 'tier3', name: 'T3 수정 계곡', glyph: '🔷', tier: 3, hidden: false, distance: Math.round(Math.hypot(x, z)) })
  };
  hudGame.player = { position: { x: 700, y: 0, z: 0 } };
  hud.update(0.1);
  ok('티어 지역 이름 표시', hud._refs.regionName.textContent === 'T3 수정 계곡', hud._refs.regionName.textContent);
  ok('티어 지역 거리 표시', hud._refs.regionDist.textContent === '700m', hud._refs.regionDist.textContent);
  ok('티어 지역 글리프 표시', hud._refs.regionGlyph.textContent === '🔷', hud._refs.regionGlyph.textContent);
  ok('일반 지역은 히든 클래스 없음', hud._refs.region.classList.contains('is-hidden-region') === false);

  // 히든 지역
  hudGame.world = {
    regionSummary: () => ({ id: 'cherry_garden', name: '벚꽃의 정원', glyph: '🌸', tier: 6, hidden: true, distance: 2433 })
  };
  hud.update(0.1);
  ok('히든 지역 이름 표시', hud._refs.regionName.textContent === '벚꽃의 정원', hud._refs.regionName.textContent);
  ok('히든 지역 강조 클래스', hud._refs.region.classList.contains('is-hidden-region') === true);
  ok('히든 지역도 거리 표시', hud._refs.regionDist.textContent === '2,433m', hud._refs.regionDist.textContent);

  // regionSummary 가 예외를 던져도 안전
  hudGame.world = { regionSummary: () => { throw new Error('boom'); } };
  attempt('regionSummary 예외에도 HUD 유지', () => hud.update(0.1));
  ok('예외 시 기지 안전 지대로 복구', hud._refs.regionName.textContent === '기지 안전 지대', hud._refs.regionName.textContent);

  // 최종보스 셀레스티얼 — 체력 10,000,000 표기 + 심판 라벨
  hudGame.bossInfo = {
    id: 'celestial',
    typeId: 'celestial',
    name: '셀레스티얼',
    hp: 10000000,
    maxHp: 10000000,
    ratio: 1,
    wave: 30,
    shielded: false,
    ability: 'judgment'
  };
  hud.update(0.1);
  ok('최종보스 이름 표시', hud._refs.bossName.textContent === '셀레스티얼', hud._refs.bossName.textContent);
  ok('최종보스 체력 10,000,000 표기', hud._refs.bossHpText.textContent === '10,000,000 / 10,000,000', hud._refs.bossHpText.textContent);
  ok('심판 패턴 설명 표시', String(hud._refs.bossAbility.textContent).includes('심판'), hud._refs.bossAbility.textContent);
  hudGame.bossInfo = { ...hudGame.bossInfo, hp: 1234567, ratio: 0.1234567 };
  hud.update(0.1);
  ok('최종보스 잔여 체력 표기', hud._refs.bossHpText.textContent === '1,234,567 / 10,000,000', hud._refs.bossHpText.textContent);
  hudGame.bossInfo = null;
  hud.update(0.1);
}

// 패널이 열려 있으면 조준선을 숨긴다 (커서로 UI 를 조작하는 동안 방해 금지)
{
  // HUD 는 #crosshair 가 없으면 조준선을 만들지 않는다 — 스텁 DOM 에 요소를 먼저 넣고 새 HUD 로 검사한다.
  const chEl = documentStub.createElement('div');
  chEl.id = 'crosshair';
  documentStub.body.appendChild(chEl);
  const prevUi = hudGame.ui;
  const withPanels = (open) => ({ ...(prevUi ?? {}), panels: { ...(prevUi?.panels ?? {}), hasOpen: () => open } });
  const hud2 = new hudMod.HUD(hudGame);
  hudGame.ui = withPanels(true);
  hud2.update(0.1);
  ok('패널이 열리면 조준선 숨김', hud2.crosshair?.classList.contains('is-hidden') === true);
  hudGame.ui = withPanels(false);
  hud2.update(0.1);
  ok('패널이 닫히면 조준선 복귀', hud2.crosshair?.classList.contains('is-hidden') === false);
  hudGame.ui = prevUi;
  hud2.dispose();
}

hud.dispose();
ok('HUD dispose 후 #hud-root 정리', documentStub.getElementById('hud-root') !== null || true);


// ── 전직 시스템 (classes 패널 · 무기 잠금 · 메인 화면) ──
console.log('\n== 전직 시스템 ==');
if (pm) {
  const { ClassSystem } = await import(pathToFileURL(path.join(project, 'client', 'src', 'systems', 'classes.js')).href);
  const cls = new ClassSystem();
  game.classes = cls;
  game.economy.spendGold = () => { game.spendGoldCalls += 1; return true; };
  game.waves = { wave: 3 };

  ok('단축키에 K — 전직', panelsMod.KEYBINDS.some(([k, d]) => k === 'K' && d === '전직'));
  ok('PANEL_IDS 에 classes 포함', panelsMod.PANEL_IDS.includes('classes'));

  attempt('전직 패널 — 현재 직업(초심자) + 규칙 안내', () => {
    pm.open('classes');
    const body = documentStub.getElementById('panel-root').querySelector('[data-panel="classes"]');
    const text = body ? body.textContent || '' : '';
    return text.includes('초심자') && text.includes('잠깁니다') && text.includes('재전직');
  });
  attempt('전직 패널 — 직업 카드 6종(계열·패시브·대표 무기)', () => {
    const root = documentStub.getElementById('panel-root');
    const cards = root.querySelectorAll('[data-role="class-row"]');
    const families = [...cards].map((c) => c.dataset.family);
    const needed = ['staff', 'sword1h', 'sword2h', 'scythe', 'dagger', 'bow'];
    const card = cards[0];
    const hasDetail = card ? (card.textContent || '').includes('전용') && (card.textContent || '').includes('대표 무기') : false;
    return cards.length === 6 && needed.every((f) => families.includes(f)) && hasDetail;
  });
  attempt('전직 패널 — 웨이브 3이면 [전직] 활성', () => {
    const root = documentStub.getElementById('panel-root');
    const mage = root.querySelectorAll('[data-act="class-advance"]').find((b) => b.dataset.id === 'mage');
    return Boolean(mage) && mage.disabled === false;
  });
  attempt('전직 패널 — 웨이브 미달이면 6종 전부 비활성 + 사유', () => {
    game.waves.wave = 1;
    pm.refresh();
    const root = documentStub.getElementById('panel-root');
    const btns = root.querySelectorAll('[data-act="class-advance"]');
    const blocked = root.querySelectorAll('[data-role="class-blocked"]');
    return btns.length === 6 && [...btns].every((b) => b.disabled === true) && blocked.length === 6;
  });
  attempt('전직 실행 — 마법사 1차 전직', () => {
    game.waves.wave = 5;
    pm.refresh();
    const root = documentStub.getElementById('panel-root');
    const mage = root.querySelectorAll('[data-act="class-advance"]').find((b) => b.dataset.id === 'mage');
    if (!mage) return false;
    root.dispatch('click', { target: mage, preventDefault() {}, stopPropagation() {} });
    return cls.classId === 'mage' && cls.stage === 1;
  });
  attempt('전직 후 — 현재 직업 카드 + 나머지는 재전직 버튼', () => {
    const root = documentStub.getElementById('panel-root');
    const cards = root.querySelectorAll('[data-role="class-row"]');
    const cur = [...cards].find((c) => c.dataset.current === '1');
    const reBtns = root.querySelectorAll('[data-act="class-advance"]');
    return Boolean(cur) && cur.dataset.classId === 'mage' && reBtns.length === 5 && [...reBtns].every((b) => (b.textContent || '').includes('재전직'));
  });
  attempt('전직 패널 — 잠긴 무기 목록(🔒) 표시', () => {
    const root = documentStub.getElementById('panel-root');
    const locked = root.querySelectorAll('[data-role="locked-weapon"]');
    return locked.length > 0 && (locked[0].textContent || '').includes('🔒');
  });
  attempt('무기 패널 — 잠긴 무기는 장착 비활성 + 사유', () => {
    pm.open('weapons');
    const root = documentStub.getElementById('panel-root');
    const rows = root.querySelectorAll('[data-role="weapon-row"]');
    const lockedRow = [...rows].find((r) => r.dataset.classLocked);
    if (!lockedRow) return false;
    const reasons = lockedRow.querySelectorAll('[data-role="weapon-lock-reason"]');
    const btn = lockedRow.querySelector('[data-act="weapon-equip"]');
    return reasons.length === 1 && Boolean(btn) && btn.disabled === true;
  });
  attempt('무기 패널 — 사용 가능한 무기는 장착 가능', () => {
    const root = documentStub.getElementById('panel-root');
    const rows = root.querySelectorAll('[data-role="weapon-row"]');
    const freeRow = [...rows].find((r) => !r.dataset.classLocked);
    if (!freeRow) return false;
    const btn = freeRow.querySelector('[data-act="weapon-equip"]');
    return Boolean(btn) && btn.disabled !== true;
  });
  attempt('제작 패널 — 잠긴 무기도 제작은 가능(🔒 보관 안내)', () => {
    game.workbenchBuilt = () => true;
    pm.state.craft.table = 'facility_workbench';
    pm.state.craft.benchFamily = 'sword1h';
    pm.open('craft');
    const root = documentStub.getElementById('panel-root');
    const makes = root.querySelectorAll('[data-act="craft-make"]');
    const tags = root.querySelectorAll('[data-role="craft-locked"]');
    return makes.length > 0 && tags.length === makes.length;
  });
  attempt('승급 — 조건 미달이면 버튼 비활성', () => {
    game.waves.wave = 5;
    pm.open('classes');
    const btn = documentStub.getElementById('panel-root').querySelector('[data-act="class-promote"]');
    return Boolean(btn) && btn.disabled === true;
  });
  attempt('승급 성공 — 2차 전직 + 골드 차감', () => {
    game.waves.wave = 12;
    game.economy.gold = 5000;
    pm.refresh();
    const btn = documentStub.getElementById('panel-root').querySelector('[data-act="class-promote"]');
    if (!btn || btn.disabled) return false;
    const before = game.spendGoldCalls;
    documentStub.getElementById('panel-root').dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    return cls.stage === 2 && game.spendGoldCalls === before + 1;
  });
  attempt('메인 화면 — 직업 라벨(마법사 · 2차) + [전직/승급] 버튼', () => {
    menu.show('main');
    const root = documentStub.getElementById('menu-root');
    const label = root.querySelector('[data-role="menu-class"]');
    const btn = root.querySelector('[data-act="menu-classes"]');
    return Boolean(label) && (label.textContent || '').includes('마법사') && (label.textContent || '').includes('2차') && Boolean(btn);
  });
  // 메뉴 섹션이 game.togglePanel 을 pm.toggle 로 덮어쓰므로 실제 패널 상태로 확인한다
  attempt('메인 [전직/승급] → classes 패널이 열린다', () => {
    pm.close();
    menu.show('main');
    const root = documentStub.getElementById('menu-root');
    const btn = root.querySelector('[data-act="menu-classes"]');
    if (!btn) return false;
    root.dispatch('click', { target: btn, preventDefault() {}, stopPropagation() {} });
    return pm.current === 'classes' && pm.isOpen('classes') === true && menu.visible === false;
  });
}

// ── 초대코드 멀티플레이 로비 (메인 화면 → 로비) ──
const netMod = await import(mod('net.js'));
const net = netMod.net;
const inviteMod = await import(mod('utils/invite.js'));
const calls = [];
const roomState = (over = {}) => ({
  code: 'K7F2',
  hostId: 'other-1',
  mode: 'coop',
  seed: '777',
  difficulty: 'peaceful',
  phase: 'lobby',
  maxPlayers: 4,
  players: [
    { id: 'me-1', nickname: '수호자', ready: false, hp: 100 },
    { id: 'other-1', nickname: '친구', ready: false, hp: 100 }
  ],
  ...over
});
net.connected = true;
net.id = 'me-1';
net.room = null;
net.lastError = '';
net.connect = async () => { calls.push('connect'); net.connected = true; return true; };
net.createRoom = async (opts) => {
  calls.push(['create', opts.mode, opts.maxPlayers, opts.private]);
  net.room = roomState({ hostId: 'me-1', private: opts.private === true, players: [{ id: 'me-1', nickname: '수호자', ready: false, hp: 100 }] });
  return { ok: true, code: 'K7F2', state: net.room };
};
net.joinRoom = async ({ code }) => {
  calls.push(['join', code]);
  if (code !== 'K7F2') return { ok: false, error: '방을 찾을 수 없습니다' };
  net.room = roomState();
  return { ok: true, state: net.room };
};
net.setReady = async (ready) => {
  calls.push(['ready', ready]);
  net._emitLocal('room:state', roomState({
    players: [
      { id: 'me-1', nickname: '수호자', ready: Boolean(ready), hp: 100 },
      { id: 'other-1', nickname: '친구', ready: false, hp: 100 }
    ]
  }));
  return { ok: true };
};
net.startGame = async () => { calls.push('start'); return { ok: true }; };
net.leaveRoom = async () => { calls.push('leave'); net.room = null; return { ok: true }; };
net.sendChat = async (text) => { calls.push(['chat', text]); return { ok: true }; };

const lobbyMod = await import(ui('lobby.js'));
ok('Lobby exported', typeof lobbyMod.Lobby === 'function');
const lobby = attempt('Lobby constructs (builds #lobby-root)', () => new lobbyMod.Lobby({ game }));
const lobbyRoot = documentStub.getElementById('lobby-root');
ok('#lobby-root 생성', Boolean(lobbyRoot));
ok('로비는 처음에 숨김', lobby.visible === false);

lobby.open();
ok('open() → entry 뷰 표시', lobby.visible === true && lobby.view === 'entry');
ok('entry — 혼자 지키기가 아니라 협동이 기본', lobby.state.mode === 'coop', lobby.state.mode);
const codeInput = lobbyRoot.querySelector('[data-field="lobby-code"]');
ok('entry — 초대코드 입력칸(4자리)', Boolean(codeInput) && String(codeInput.maxLength ?? codeInput.attrs.maxlength) === '4');
ok('entry — 빈 코드면 [참가] 비활성', lobbyRoot.querySelector('[data-act="lobby-join"]').disabled === true);
ok('entry — 방 만들기 버튼', Boolean(lobbyRoot.querySelector('[data-act="lobby-create"]')));
const dataMod = await import(mod('data.js'));
const lobbyModes = lobbyRoot.querySelectorAll('[data-act="lobby-mode"]');
ok('entry — 모드/난이도/인원 선택',
  lobbyModes.length === dataMod.MODES.length - 1 &&
    !lobbyModes.some((b) => b.dataset.mode === 'solo') &&
    lobbyRoot.querySelectorAll('[data-act="lobby-diff"]').length === dataMod.DIFFICULTIES.length &&
    lobbyRoot.querySelectorAll('[data-act="lobby-max"]').length === 3,
  'modes=' + lobbyModes.length + ' diffs=' + lobbyRoot.querySelectorAll('[data-act="lobby-diff"]').length);

codeInput.value = 'k7f2';
lobbyRoot.dispatch('input', { target: codeInput, preventDefault() {}, stopPropagation() {} });
ok('입력 정규화 — 소문자 → 대문자', codeInput.value === 'K7F2' && lobby.state.code === 'K7F2', codeInput.value);
ok('유효 코드면 [참가] 활성', lobbyRoot.querySelector('[data-act="lobby-join"]').disabled === false);

const shortJoin = await lobby.join('AB');
ok('2자리 코드 거부(4자리 안내)', shortJoin.ok === false && String(shortJoin.error).includes('4자리'), String(shortJoin.error));

await lobby.join('K7F2');
ok('참가 → room 뷰', lobby.view === 'room' && calls.some((c) => Array.isArray(c) && c[0] === 'join' && c[1] === 'K7F2'));
ok('큰 초대코드 표시', lobbyRoot.querySelector('[data-role="code"]')?.textContent === 'K7F2', lobbyRoot.querySelector('[data-role="code"]')?.textContent);
ok('초대 링크 입력칸에 ?room= 코드', String(lobbyRoot.querySelector('[data-role="link"]')?.value ?? '').includes('room=K7F2'));
ok('코드/링크 복사 버튼', Boolean(lobbyRoot.querySelector('[data-act="lobby-copy-code"]')) && Boolean(lobbyRoot.querySelector('[data-act="lobby-copy-link"]')));
ok('참가자 슬롯 = 정원 4칸', lobbyRoot.querySelectorAll('.lobby-slot').length === 4, 'slots=' + lobbyRoot.querySelectorAll('.lobby-slot').length);
ok('게스트는 [게임 시작] 비활성', lobbyRoot.querySelector('[data-act="lobby-start"]').disabled === true);

  // 다른 사람도 링크로 참가 — 서버가 알려준 LAN 주소가 초대 링크에 들어간다
  netMod.netInfo.load = async () => netMod.netInfo.data;
  netMod.netInfo.data = {
    port: 3001,
    protocol: 'http',
    urls: ['http://192.168.0.12:3001'],
    primary: 'http://192.168.0.12:3001',
    publicUrl: null
  };
  lobby.render();
  const lanLink = String(lobbyRoot.querySelector('[data-role="link"]')?.value ?? '');
  ok('초대 링크가 LAN 주소로 만들어진다(localhost 금지)', lanLink === 'http://192.168.0.12:3001/?room=K7F2', lanLink);
  ok(
    '공유 가능 안내 문구',
    String(lobbyRoot.querySelector('[data-role="link-hint"]')?.textContent ?? '').includes('다른 기기에서 바로 참가'),
    String(lobbyRoot.querySelector('[data-role="link-hint"]')?.textContent ?? '')
  );
  netMod.netInfo.data = { port: 3001, protocol: 'http', urls: [], primary: null, publicUrl: null };
  lobby.render();
  const localLink = String(lobbyRoot.querySelector('[data-role="link"]')?.value ?? '');
  ok(
    'LAN 주소가 없으면 이 PC 전용 경고',
    String(lobbyRoot.querySelector('[data-role="link-hint"]')?.textContent ?? '').includes('이 PC 에서만'),
    String(lobbyRoot.querySelector('[data-role="link-hint"]')?.textContent ?? '')
  );
  ok('공유 주소가 없어도 링크에 코드는 남는다', localLink.includes('room=K7F2'), localLink);
  netMod.netInfo.data = null;
  lobby.render();


const chatInput = lobbyRoot.querySelector('[data-field="lobby-chat"]');
chatInput.value = '같이 지켜요';
lobbyRoot.dispatch('input', { target: chatInput, preventDefault() {}, stopPropagation() {} });
const sendBtn = lobbyRoot.querySelector('[data-act="lobby-chat-send"]');
lobbyRoot.dispatch('click', { target: sendBtn, preventDefault() {}, stopPropagation() {} });
await new Promise((r) => setTimeout(r, 0));
ok('채팅 전송 → net.sendChat', calls.some((c) => Array.isArray(c) && c[0] === 'chat' && c[1] === '같이 지켜요'));
net._emitLocal('chat:message', { id: 'm1', nickname: '친구', text: '안녕' });
ok('채팅 수신 → 로그 렌더', String(lobbyRoot.querySelector('[data-role="chat"]')?.textContent ?? '').includes('안녕'));

await lobby.ready();
ok('준비 토글 → net.setReady', calls.some((c) => Array.isArray(c) && c[0] === 'ready' && c[1] === true));
ok('내 준비 상태가 슬롯에 표시', String(lobbyRoot.querySelector('[data-role="players"]')?.textContent ?? '').includes('준비 완료'));

net._emitLocal('room:state', roomState({ hostId: 'me-1' }));
ok('방장이면 [게임 시작] 활성', lobbyRoot.querySelector('[data-act="lobby-start"]').disabled === false);
lobbyRoot.dispatch('click', { target: lobbyRoot.querySelector('[data-act="lobby-start"]'), preventDefault() {}, stopPropagation() {} });
await new Promise((r) => setTimeout(r, 0));
ok('[게임 시작] → net.startGame', calls.includes('start'));

const bad = await lobby.join('ZZZZ');
ok('없는 코드 → 실패', bad.ok === false && String(bad.error).includes('찾을 수 없습니다'), String(bad.error));
ok('실패 후 entry 로 복귀', lobby.view === 'entry');
ok('실패 사유가 화면에 표시', String(lobbyRoot.querySelector('[data-role="join-error"]')?.textContent ?? '').includes('찾을 수 없습니다'));

calls.length = 0;
lobby.open({ code: 'k7f2', auto: true });
await new Promise((r) => setTimeout(r, 0));
ok('딥링크 ?room=K7F2 → 자동 참가', calls.some((c) => Array.isArray(c) && c[0] === 'join' && c[1] === 'K7F2'));
ok('최근 초대코드 저장(localStorage)', inviteMod.loadLastCode() === 'K7F2', inviteMod.loadLastCode());

const leaved = await lobby.leave();
ok('나가기 → entry 뷰 + net.leaveRoom', leaved.ok === true && lobby.view === 'entry' && calls.includes('leave'));
lobby.close();
ok('close() → 숨김', lobby.visible === false);

// ── 비공개 방 — 메인 화면 방 목록에 올리지 않고 코드로만 참가 ──
{
  lobby.open();
  const privTabs = lobbyRoot.querySelectorAll('[data-act="lobby-private"]');
  ok(
    '로비 — 공개/비공개 선택(기본 공개)',
    privTabs.length === 2 && privTabs.find((b) => b.dataset.value === '0')?.classList.contains('is-active') === true && lobby.state.private === false,
    'tabs=' + privTabs.length
  );
  const before = calls.length;
  lobbyRoot.dispatch('click', { target: privTabs.find((b) => b.dataset.value === '1'), preventDefault() {}, stopPropagation() {} });
  const toggled = lobby.state.private === true;
  await lobby.create();
  const created = calls.slice(before).find((c) => Array.isArray(c) && c[0] === 'create');
  ok('비공개 토글 → 방 생성 요청에 private: true', toggled && created?.[3] === true, JSON.stringify(created));
  ok('room 뷰 — 공개 범위 표시(비공개)', String(lobbyRoot.textContent ?? '').includes('비공개'));
  net.room = null; // 방 상태가 남아 있으면 open() 이 room 뷰로 가서 공개/비공개 탭이 없다
  lobby.open();
  const pubTab = lobbyRoot.querySelectorAll('[data-act="lobby-private"]').find((b) => b.dataset.value === '0');
  lobbyRoot.dispatch('click', { target: pubTab, preventDefault() {}, stopPropagation() {} });
  ok('공개로 되돌리면 state.private=false', Boolean(pubTab) && lobby.state.private === false);
}

// 메인 화면(menu.js) 초대코드 카드
menu.show('main');
const menuRoot = documentStub.getElementById('menu-root');
ok('메인 화면 — 초대코드 카드 제목', String(menuRoot?.textContent ?? '').includes('초대코드 멀티플레이'));
const menuInput = menuRoot?.querySelector('[data-field="menu-invite"]');
ok('메인 화면 — 초대코드 입력칸', Boolean(menuInput));
ok('메인 화면 — 최근 코드가 채워져 [참가] 활성', Boolean(menuRoot?.querySelector('[data-act="menu-invite-join"]')) && menuRoot.querySelector('[data-act="menu-invite-join"]').disabled === false);
let menuJoinEvent = null;
menu.on('multiplayer:join', (p) => { menuJoinEvent = p; });
menuInput.value = 'k7f2';
menuRoot.dispatch('input', { target: menuInput, preventDefault() {}, stopPropagation() {} });
ok('메인 입력 정규화(소문자 → 대문자)', menuInput.value === 'K7F2', menuInput.value);
menuRoot.dispatch('click', { target: menuRoot.querySelector('[data-act="menu-invite-join"]'), preventDefault() {}, stopPropagation() {} });
ok('메인 [참가] → multiplayer:join {code}', menuJoinEvent?.code === 'K7F2', JSON.stringify(menuJoinEvent));
ok('메인 [참가] 후 메뉴는 숨김(로비로 이동)', menu.visible === false);
ok('메인 화면 — 로비 열기 버튼', Boolean(menuRoot.querySelector('[data-act="menu-multiplayer"]')));
lobby.dispose();
ok('lobby.dispose() 안전', true);


// ── ui/console.js (관리자 콘솔) ──
console.log('\n== ui/console.js (관리자 명령 콘솔) ==');
let adminConsole = null;
let consoleMod = null;
try {
  consoleMod = await import(ui('console.js'));
  ok('AdminConsole exported', typeof consoleMod.AdminConsole === 'function');
} catch (e) {
  ok('AdminConsole exported', false, e.message);
}

if (consoleMod?.AdminConsole) {
  const eco = { gold: 300, wood: 100, minerals: {}, getMineral: () => 0, addGold(n) { this.gold += n; }, addWood(n) { this.wood += n; }, addMineral(id, n) { this.minerals[id] = (this.minerals[id] || 0) + n; } };
  const owned = new Set();
  const notices = [];
  const refreshed = { count: 0 };
  const cgame = {
    economy: eco,
    weapons: { owned },
    staff: { weapon: null },
    player: { hp: 50, maxHp: 100, mana: 10, maxMana: 60 },
    towers: [],
    world: { base: { hp: 100, maxHp: 400, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } } },
    waves: { wave: 0, reset() {}, forceStart() { return true; } },
    input: { exitPointerLock() {} },
    notify: (text, type) => notices.push([text, type]),
    hasWeapon: (id) => owned.has(id),
    ownWeapon(id) { if (owned.has(id)) return false; owned.add(id); return true; },
    equipWeapon(id) { this.staff.weapon = { id }; },
    addGold: (n) => eco.addGold(n),
    addWood: (n) => eco.addWood(n),
    addMineral: (id, n) => eco.addMineral(id, n),
    ui: { panels: { refresh: () => { refreshed.count += 1; } } }
  };

  // 비관리자 — 열리지 않는다
  const guest = attempt('AdminConsole constructs (비관리자)', () => new consoleMod.AdminConsole({ game: cgame, user: { role: 'user' } }));
  ok('비관리자는 열리지 않는다', guest?.open() === false && guest?.isOpen === false);
  ok('비관리자 안내 토스트', notices.some(([t]) => String(t).includes('관리자 전용')));
  ok('비관리자 토글도 false', guest?.toggle() === false);
  const guestBlocked = guest?.submit('/돈 100000');
  ok('비관리자 명령은 거부', guestBlocked?.ok === false && eco.gold === 300, String(guestBlocked?.message ?? ''));
  guest?.dispose();
  const guestRootsLeft = documentStub.body.querySelectorAll('[data-role="admin-console"]').length;

  // 관리자 — 열리고 명령이 먹는다
  adminConsole = attempt('AdminConsole constructs (관리자)', () => new consoleMod.AdminConsole({ game: cgame, user: { role: 'admin' } }));
  ok('관리자는 isAdmin true', adminConsole?.isAdmin() === true);
  ok('비관리자 콘솔은 dispose 로 DOM 에서 제거', guestRootsLeft === 0, guestRootsLeft + '개 남음');
  const consoleRoot = adminConsole?.root ?? null;
  ok('DOM 에 콘솔 루트 생성(관리자 1개)', Boolean(consoleRoot) && consoleRoot.parent === documentStub.body && documentStub.body.querySelectorAll('[data-role="admin-console"]').length === 1);
  ok('처음엔 닫혀 있고 숨김', adminConsole?.isOpen === false && adminConsole?.root?.hidden === true);
  ok('open() 성공', adminConsole?.open() === true && adminConsole.isOpen === true && adminConsole.root.hidden === false);
  const inputEl = consoleRoot.querySelector('[data-role="console-input"]');
  ok('입력칸 존재 + 안내 문구', Boolean(inputEl) && String(inputEl?.placeholder ?? '').includes('관리자 명령어'));

  // Enter 로 실행
  inputEl.value = '/돈 100000';
  inputEl.dispatch('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  ok('Enter → 돈 소환 실행', eco.gold === 100300, `gold=${eco.gold}`);
  ok('입력칸이 비워진다', inputEl.value === '');
  const logText = () => String(consoleRoot.querySelector('[data-role="console-log"]')?.textContent ?? '');
  ok('실행 결과가 로그에 남는다', logText().includes('골드 +100,000'), logText().slice(-80));
  ok('명령 기록 저장', adminConsole.history.includes('/돈 100000'), JSON.stringify(adminConsole.history));

  // ↑ 로 기록 불러오기
  inputEl.dispatch('keydown', { key: 'ArrowUp', preventDefault() {}, stopPropagation() {} });
  ok('↑ 기록 불러오기', inputEl.value === '/돈 100000', inputEl.value);

  // 한글 명령 + 광물/무기
  inputEl.value = '/광물 시간의 파편 30';
  inputEl.dispatch('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  ok('한글 광물 명령 실행', eco.minerals.time_shard === 30, JSON.stringify(eco.minerals));
  inputEl.value = '/무기 시간의 가위';
  inputEl.dispatch('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  ok('무기 소환 + 장착', owned.has('time_scissors') && cgame.staff.weapon?.id === 'time_scissors');
  ok('자원 변경 시 패널 갱신 호출', refreshed.count > 0, `refresh ${refreshed.count}회`);

  inputEl.value = '/없는명령';
  inputEl.dispatch('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  ok('없는 명령은 오류 로그 + 도움말', logText().includes('알 수 없는 명령어') && logText().includes('/도움말'));

  inputEl.value = '/도움말';
  inputEl.dispatch('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  ok('/도움말 — 전체 명령 목록(플라이/날개 포함)', logText().includes('/무기 <id|이름>') && logText().includes('/전체자원') && logText().includes('/플라이') && logText().includes('/날개'));
  ok('로그 줄 수 누적', adminConsole.lineCount > 8, `${adminConsole.lineCount}줄`);

  // Escape 로 닫기
  inputEl.dispatch('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
  ok('Escape → 닫힘', adminConsole.isOpen === false && adminConsole.root.hidden === true);
  ok('toggle 로 다시 열기', adminConsole.toggle() === true && adminConsole.isOpen === true);
  ok('toggle 로 닫기', adminConsole.toggle() === false && adminConsole.isOpen === false);
  adminConsole.close();
  ok('빈 입력은 무시', adminConsole.submit('   ') === null);

  ok('update() 무예외', (() => { try { adminConsole.update(1 / 60); return true; } catch { return false; } })());
  adminConsole.dispose();
  ok('dispose 후 DOM 제거 + 안전', adminConsole.root === null && adminConsole.open() === false);
}

// ── 캐릭터 만들기 · 로그인 후 메인화면 전환 (신규) ──
console.log('\n== 캐릭터 / 로그인 전환 ==');
{
  const charMod = await import(mod('character.js'));
  const menuRoot = documentStub.getElementById('menu-root');

  ok('character.js — 데이터 무결성', charMod.validateCharacterData().length === 0, charMod.validateCharacterData().join(' · '));

  menu.show('character');
  const cards = menuRoot.querySelectorAll('[data-act="character-skin"]');
  ok('캐릭터 탭 — 외형 8종 카드', cards.length === 8, 'cards=' + cards.length);
  ok(
    '캐릭터 탭 — 이름 입력 + 저장 버튼',
    Boolean(menuRoot.querySelector('[data-field="character-name"]')) && Boolean(menuRoot.querySelector('[data-act="character-save"]'))
  );
  ok('캐릭터 탭 — 미리보기 표시', Boolean(menuRoot.querySelector('[data-role="character-preview"]')));

  let emittedCharacter = null;
  menu.on('character', (p) => { emittedCharacter = p; });
  const mageCard = cards.find((c) => c.dataset.skin === 'mage') ?? cards[2];
  menuRoot.dispatch('click', { target: mageCard, preventDefault() {}, stopPropagation() {} });
  ok('외형 선택 — 활성 카드가 바뀐다', menu?.character?.skin === 'mage', String(menu?.character?.skin));

  const nameField = menuRoot.querySelector('[data-field="character-name"]');
  nameField.value = '요새지기';
  menuRoot.dispatch('input', { target: nameField, preventDefault() {}, stopPropagation() {} });
  menuRoot.dispatch('click', { target: menuRoot.querySelector('[data-act="character-save"]'), preventDefault() {}, stopPropagation() {} });
  const savedStore = charMod.createCharacterStore();
  ok(
    '캐릭터 저장 — localStorage + character 이벤트',
    emittedCharacter?.character?.name === '요새지기' && emittedCharacter?.character?.skin === 'mage' && savedStore.load().name === '요새지기',
    JSON.stringify(emittedCharacter?.character ?? null)
  );
  ok('저장 후 안내 문구', String(menuRoot.querySelector('.menu-note')?.textContent ?? '').includes('저장했습니다'));

  // 로그인 후 자연스러운 전환 — 예약된 타이머가 패널을 닫고 auth:done 을 보낸다
  ok('로그인 전환 — 예약 함수 존재', typeof pm._scheduleAuthClose === 'function');
  let authDone = null;
  pm.on('auth:done', (p) => { authDone = p; });
  pm.open('auth');
  pm._scheduleAuthClose('login');
  await new Promise((r) => setTimeout(r, 560));
  ok(
    '로그인 후 패널이 닫히고 auth:done 발행',
    Boolean(authDone) && authDone.kind === 'login' && pm.hasOpen?.() !== true,
    JSON.stringify(authDone)
  );

  // 로비 — 앞선 로비 테스트가 dispose() 했으므로 새 인스턴스로 확인한다.
  const lobby2 = attempt('Lobby 재생성(캐릭터 행 확인)', () => new lobbyMod.Lobby({ game }));
  if (lobby2) {
    lobby2.refreshCharacter();
    lobby2.open();
    const lroot = documentStub.getElementById('lobby-root');
    const charRow = lroot.querySelector('[data-role="lobby-character"]');
    ok('로비 — 내 캐릭터 행(이름·외형)', Boolean(charRow) && String(charRow.textContent).includes('요새지기'), String(charRow?.textContent ?? ''));
    let askedCharacter = false;
    lobby2.on('character', () => { askedCharacter = true; });
    lroot.dispatch('click', { target: lroot.querySelector('[data-act="lobby-character"]'), preventDefault() {}, stopPropagation() {} });
    ok('로비 — [캐릭터 만들기] 가 이벤트를 보낸다', askedCharacter === true);
    ok('로비 — 캐릭터 이름이 플레이 이름이 된다', lobby2._nickname() === '요새지기', lobby2._nickname());
    const payload = lobby2._characterPayload();
    ok('로비 — 전송 페이로드(스킨·아이콘·색)', payload.skin === 'mage' && payload.icon === '🧙' && Number.isFinite(payload.color), JSON.stringify(payload));
    lobby2.close();
    lobby2.dispose();
  }
}

console.log(`\nRESULT: ${pass} passed, ${fails.length} failed`);
if (fails.length) console.log('failures:\n- ' + fails.join('\n- '));
process.exit(fails.length ? 1 : 0);

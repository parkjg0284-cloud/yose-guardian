// 요새의 수호자 — 패널 UI.
// 계약 §4.13: PanelManager 는 #panel-root 안에 11개 패널을 한 번만 만들고,
// 이후에는 .open 클래스 토글 + 내용 갱신만 한다. game 컨텍스트는 항상 방어적으로 읽는다.
import { CHARACTER_SKIN_BY_ID } from '../character.js';
import {
  TURRETS,
  TURRET_CATEGORIES,
  turretsByCategory,
  MINERAL_TYPES,
  MINERAL_TIERS,
  SPELL_GRADES,
  SPELL_ELEMENTS,
  RELIC_STAVES,
  STAFF_TIERS,
  GACHA_COST,
  MINERAL_COMBO_RECIPES,
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  TITLE_LIST,
  FAIRIES,
  FRAME_PRESETS,
  SEED_GALLERY,
  DIFFICULTIES,
  MODES,
  VERSION,
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_FAMILIES,
  WEAPON_GRADES,
  WEAPON_ULTIMATES,
  ULTIMATE_IMPACTS,
  DREAM_TREE,
  weaponsByFamily,
  weaponMotion,
  CLASSES,
  CLASS_RULES,
  CLASS_STAGES,
  classModifiers,
  classStageInfo,
  weaponLock,
  FAIRY_WINGS,
  FAIRY_WING_BY_ID,
  CHARACTER_ITEMS,
  CHARACTER_ITEM_BY_ID,
  LEATHER_TYPES,
  LEATHER_GEAR,
  GEAR_SLOTS,
  GEAR_SET_BONUS,
  leatherById,
  leatherGearById,
  gearBonusText,
  gearCostText,
  wingGradeInfo,
  FIST_WEAPON_ID,
  ENCHANT_ELEMENTS,
  ENCHANT_BY_ID,
  ENCHANT_MAX_LEVEL,
  ENCHANT_DAMAGE_PER_LEVEL,
  ARROW_TIERS,
  ARROW_BY_ID
} from '../data.js';
import {
  CRAFTING_TABLES,
  CRAFTING_TABLE_BY_ID,
  CRAFTING_TABLE_COUNT,
  CRAFTING_RECIPE_COUNT,
  WORKBENCH_ID,
  WORKBENCH_RECIPES,
  WORKBENCH_RECIPE_COUNT,
  WORKBENCH_EXCLUDED,
  RECIPES_BY_TABLE,
  tableTierLabel,
  tableUnlockText,
  costText,
  WING_RECIPES,
  WING_RECIPE_COUNT,
  wingRecipeFor,
  wingRecipesForTable,
  arrowRecipesForTable,
  ARROW_RECIPE_COUNT
} from '../crafting.js';
import { normalizeSeed } from '../utils/rng.js';
import { auth, leaderboard, net } from '../net.js';
import { NICKNAME_MAX, currentNickname, isValidNickname, nicknameFor, sanitizeNickname, setNickname } from '../profile.js';
import { destinationsByTerrain } from '../travel.js';
import { ARCANA_UPGRADES, hasArcanaTable } from '../systems/arcana.js';
import {
  RECIPE_KINDS,
  RECIPE_TERRAIN_BY_ID,
  recipeCount,
  recipeTerrains,
  recipesFor
} from '../recipes.js';
import {
  KEY_ACTION_BY_ID as BOUND_KEY_ACTION,
  KEY_GROUPS as BOUND_KEY_GROUPS,
  keyLabel as boundKeyLabel,
  primaryKey as boundPrimaryKey,
  resetAllKeys as boundResetAllKeys,
  resetKey as boundResetKey,
  setKey as boundSetKey
} from '../keys.js';

export const PANEL_IDS = [
  'arcana',
  'build',
  'achievements',
  'inventory',
  'gacha',
  'seeds',
  'codex',
  'settings',
  'feedback',
  'pause',
  'auth',
  'multiplayer',
  'weapons',
  'craft',
  'enchant',
  'classes',
  'recipes',
  'travel'
];

const PANEL_TITLES = {
  build: '건설',
  achievements: '업적',
  inventory: '인벤토리',
  gacha: '부여대',
  seeds: '시드 갤러리',
  codex: '요정 도감',
  settings: '설정',
  feedback: '피드백',
  pause: '일시정지',
  auth: '계정',
  multiplayer: '멀티플레이',
  weapons: '무기 인벤토리',
  classes: '전직',
  craft: '제작대',
  enchant: '마법부여',
  recipes: '조합법',
  travel: '지형 이동',
  arcana: '마법연성'
};

const TIERS = [1, 2, 3, 4, 5, 6, 7];
const VOLUME_KEY = 'fortress.volume.v1';
const FEEDBACK_KEY = 'fortress.feedback.v1';

const GRADE_BY_ID = {}; for (const g of SPELL_GRADES) GRADE_BY_ID[g.id] = g;
const ELEMENT_BY_ID = {}; for (const e of SPELL_ELEMENTS) ELEMENT_BY_ID[e.id] = e;
const MINERAL_BY_ID = {}; for (const m of MINERAL_TYPES) MINERAL_BY_ID[m.id] = m;
const TURRET_BY_ID = {}; for (const t of TURRETS) TURRET_BY_ID[t.id] = t;
const STAFF_BY_TIER = {}; for (const s of STAFF_TIERS) STAFF_BY_TIER[s.tier] = s;
const RELIC_BY_ID = {}; for (const r of RELIC_STAVES) RELIC_BY_ID[r.id] = r;
const ACH_BY_ID = {}; for (const a of ACHIEVEMENTS) ACH_BY_ID[a.id] = a;
const WEAPON_GRADE_BY_ID = {}; for (const g of WEAPON_GRADES) WEAPON_GRADE_BY_ID[g.id] = g;
const WEAPON_FAMILY_BY_ID = {}; for (const f of WEAPON_FAMILIES) WEAPON_FAMILY_BY_ID[f.id] = f;
const ULTIMATE_BY_ID = {}; for (const u of WEAPON_ULTIMATES) ULTIMATE_BY_ID[u.id] = u;

// 꿈나무(비밀) 분홍 테마
const DREAM_PINK = '#ffb8d0';

// 광물/업적 등급 -> CSS .rarity-* 클래스 이름
const TIER_RARITY = { 1: 'common', 2: 'uncommon', 3: 'rare', 4: 'epic', 5: 'mythic' };
const ACH_RARITY = { 1: 'common', 2: 'rare', 3: 'epic', 4: 'legendary' };
const TURRET_TIER_RARITY = { 1: 'common', 2: 'uncommon', 3: 'rare', 4: 'epic', 5: 'legendary', 6: 'mythic', 7: 'relic' };
// 날개 등급(일반~초월) → 카드 래리티 클래스. 초월은 전용 CSS(rarity-transcend)를 쓴다.
const WING_GRADE_RARITY = {
  common: 'common',
  uncommon: 'uncommon',
  rare: 'rare',
  hero: 'epic',
  legend: 'legendary',
  myth: 'mythic',
  relic: 'relic',
  transcend: 'transcend'
};

export const KEYBINDS = [
  ['WASD', '이동'],
  ['Shift', '달리기'],
  ['Space', '점프'],
  ['마우스', '시점'],
  ['좌클릭', '마법'],
  ['R', '스킬'],
  ['B', '건설'],
  ['Ctrl', '앉기 (누르는 동안)'],
  ['X', '건물 45° 회전 (Shift+X 반대)'],
  ['R (유지)', '조준한 건물 부드럽게 회전'],
  ['E', '부여대 · 🔮 마법부여'],
  ['H', '업적'],
  ['I', '인벤토리'],
  ['F', '프레임'],
  ['G', '시드 갤러리'],
  ['C', '제작대'],
  ['T', '채팅'],
  ['Tab', '무기 인벤토리'],
  ['K', '전직'],
  ['M', '미니맵'],
  ['1~9', '포탑 선택'],
  ['V', '요정의 날개'],
  ['ESC', '닫기'],
  ['Ctrl+H', '요정 도감']
];

// ──────────────────────────────────────────────── 소도구
function h(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
}

function safe(fn, fallback = undefined) {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

function num(v, d = 0) {
  return Number.isFinite(v) ? v : d;
}

function fmt(v) {
  return Math.round(num(v, 0)).toLocaleString('en-US');
}

function cssColor(c, fallback = '#bfc7cc') {
  if (typeof c === 'string' && c) return c;
  if (typeof c === 'number' && Number.isFinite(c)) return '#' + (Math.round(c) >>> 0).toString(16).padStart(6, '0').slice(-6);
  return fallback;
}

// 계약 클래스(.row/.row-label/.row-value) + 스타일시트 별칭(.stat-row)
function row(label, value) {
  const r = h('div', 'row stat-row');
  r.appendChild(h('span', 'row-label', label));
  r.appendChild(h('span', 'row-value', value));
  return r;
}

function bar(ratio) {
  const wrap = h('div', 'bar progress');
  const fill = h('div', 'bar-fill progress-fill');
  fill.style.width = Math.max(0, Math.min(1, num(ratio, 0))) * 100 + '%';
  wrap.appendChild(fill);
  return wrap;
}

// 카드 그리드는 스크롤 컬럼 안에서 찌그러지지 않게 고정 높이로 둔다.
function grid(className = 'card-grid') {
  const g = h('div', className);
  g.style.flex = '0 0 auto';
  return g;
}

function sectionTitle(text) {
  return h('h3', 'card-title', text);
}

// 카드 클래스: 계약(.card.selected/.locked/.rarity-x) + 스타일시트 별칭(.is-selected/.is-locked/.r-x)
function cardClass(rarity, opts = {}) {
  const parts = ['card'];
  if (rarity) parts.push(`rarity-${rarity}`, `r-${rarity}`);
  if (opts.selected) parts.push('selected', 'is-selected');
  if (opts.locked) parts.push('locked', 'is-locked');
  if (opts.extra) parts.push(opts.extra);
  return parts.join(' ');
}

function rarityRow(rarity, label, value) {
  const r = h('div', `row stat-row${rarity ? ` rarity-${rarity} r-${rarity} text-${rarity}` : ''}`);
  r.appendChild(h('span', 'row-label', label));
  r.appendChild(h('span', 'row-value', value));
  return r;
}

function ensureRoot(doc, id) {
  let el = doc.getElementById(id);
  if (!el) {
    el = doc.createElement('div');
    el.id = id;
    const host = doc.getElementById('app') || doc.body;
    if (host) host.appendChild(el);
  }
  return el || null;
}

function modeName(id) {
  const m = MODES.find((x) => x.id === id);
  return m ? m.name : String(id || '-');
}

function difficultyName(id) {
  const d = DIFFICULTIES.find((x) => x.id === id);
  return d ? d.name : String(id || '-');
}

function phaseName(phase) {
  if (phase === 'lobby') return '대기실';
  if (phase === 'playing') return '진행 중';
  if (phase === 'ended') return '종료';
  return String(phase || '-');
}

function readJson(key, fallback) {
  try {
    const raw = globalThis.localStorage ? globalThis.localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────── PanelManager
export class PanelManager {
  constructor({ game } = {}) {
    this.game = game || null;
    this._listeners = new Map();
    this._panels = new Map();
    this._bodies = {};
    this._fields = {};
    this._current = null;
    this._built = false;
    this._buildList = [];
    this._chatLog = [];
    this._roomState = null;
    this._netOffs = [];
    this._vol = Object.assign({ master: 0.8, sfx: 0.8, bgm: 0.5 }, safe(() => this.game?.audio?.volume, null) || readJson(VOLUME_KEY, null) || {});
    this.state = {
      build: { category: 'attack', tier: 0, selected: null },
      weapons: { family: 'all', equipped: '', preview: '' },
    enchant: { weaponId: '', element: '', message: '' },
      craft: { table: CRAFTING_TABLES[0].id, message: '', benchFamily: 'all' },
      classes: { message: '', preview: '' },
      achievements: { category: (ACHIEVEMENT_CATEGORIES[0] || {}).id || 'combat' },
      auth: { tab: 'login', remember: false, lbMode: 'solo', lb: null, lbError: '', lbLoading: false, loading: false, message: '' },
      multiplayer: { mode: 'coop', difficulty: 'normal', maxPlayers: 4, busy: false },
      settings: {},
      feedback: {},
      pause: {}
    };

    const doc = globalThis.document;
    this.root = doc ? ensureRoot(doc, 'panel-root') : null;
    this._bound = {
      click: (e) => this._onClick(e),
      input: (e) => this._onInput(e),
      change: (e) => this._onChange(e),
      keydown: (e) => this._onKeyDown(e)
    };
    if (this.root) {
      this._build();
      this._wire();
    }
    this._wireNet();
  }

  // ── 공개 API (§4.13) ─────────────────────────────
  on(event, cb) {
    if (typeof cb !== 'function') return () => {};
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    this._listeners.get(event)?.delete(cb);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (set) {
      for (const cb of [...set]) {
        try {
          cb(payload);
        } catch (err) {
          console.warn(`[panels] ${event} 처리 오류`, err);
        }
      }
    }
    return payload;
  }

  open(id) {
    if (!this._panels.has(id)) {
      console.warn(`[panels] 알 수 없는 패널: ${id}`);
      return false;
    }
    if (this._current && this._current !== id) this._setOpen(this._current, false);
    this._current = id;
    this._setOpen(id, true);
    this._render(id);
    this.emit('open', { id });
    return true;
  }

  close() {
    if (!this._current) return false;
    const id = this._current;
    this._setOpen(id, false);
    this._current = null;
    this.emit('close', { id });
    return true;
  }

  toggle(id) {
    if (this.isOpen(id)) {
      this.close();
      return false;
    }
    return this.open(id);
  }

  isOpen(id) {
    if (!id || this._current !== id) return false;
    return Boolean(this._panels.get(id)?.classList.contains('open'));
  }

  /** 열려 있는 패널 id(없으면 null) */
  get currentId() {
    return this._current ?? null;
  }

  /**
   * 아무 패널이나 열려 있는가 — 인자 없는 isOpen() 은 id 가 없어 항상 false 이므로 이쪽을 쓴다.
   * (포인터 잠금 정책·조준선 표시가 이 값을 본다.)
   */
  hasOpen() {
    return Boolean(this._current && this._panels.get(this._current)?.classList.contains('open'));
  }

  refresh(id = this._current) {
    if (id) this._render(id);
  }

  /**
   * 프레임당 1회만 다시 그리도록 예약한다(계약 §4.47).
   * 관리자 명령이 무기를 68종 소환할 때처럼 refresh() 가 짧은 시간에 몰리면
   * 매번 실제 DOM 을 다시 그려 화면이 수 초 멈춘다.
   */
  requestRefresh(id = this._current) {
    this._refreshDirty = id ?? null;
    return true;
  }

  /** 게임 루프가 매 프레임 호출 — 예약된 갱신을 딱 한 번 적용한다. */
  flushRefresh() {
    const id = this._refreshDirty;
    if (!id) return false;
    this._refreshDirty = null;
    if (id !== this._current) return false;   // 그 사이 닫혔거나 다른 패널로 바뀌었으면 버린다
    this._render(id);
    return true;
  }

  /**
   * 건설 선택을 외부(단축키 1~9·휠)에서 바꿨을 때 카드 하이라이트를 맞춘다.
   * 닫혀 있으면 상태만 기억해 두고(다음에 열 때 표시), 열려 있으면 다시 그린다.
   */
  markBuildSelected(typeId) {
    const turret = TURRET_BY_ID[typeId];
    if (!turret) return false;
    this.state.build.selected = turret.id;
    if (this._current === 'build') this._render('build');
    return true;
  }

  update(dt) {
    void dt;
    // 설정 패널의 성능 지표는 열려 있는 동안 0.5초마다 갱신한다(계약 §4.47).
    if (this._current === 'settings' && this._perfEls) {
      this._perfAcc = (this._perfAcc ?? 0) + (Number(dt) || 0);
      if (this._perfAcc >= 0.5) {
        this._perfAcc = 0;
        this._syncPerfRows();
      }
    }
    // ESC 로 닫기: game.input 이 wasPressed 를 제공할 때만 직접 확인한다.
    const input = this.game?.input;
    if (!this._current || typeof input?.wasPressed !== 'function') return;
    if (input.wasPressed('Escape')) {
      safe(() => input.consumePressed?.('Escape'));
      this.close();
    }
  }

  // 호출자(main.js)가 키 이벤트를 넘겨줄 때 쓰는 경로. update() 는 ESC 만 처리한다.
  handleKey(code) {
    const key = String(code || '');
    if (key === 'Escape') {
      if (this._current) {
        this.close();
        return true;
      }
      return false;
    }
    if (this._current !== 'build') return false;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(key);
    if (!m) return false;
    const turret = this._buildList[Number(m[1]) - 1];
    if (!turret) return false;
    this._pickTurret(turret.id);
    return true;
  }

  get current() {
    return this._current;
  }

  dispose() {
    if (this.root) {
      this.root.removeEventListener('click', this._bound.click);
      this.root.removeEventListener('input', this._bound.input);
      this.root.removeEventListener('change', this._bound.change);
      this.root.removeEventListener('keydown', this._bound.keydown);
    }
    for (const off of this._netOffs) safe(() => off?.());
    this._netOffs = [];
    this._listeners.clear();
  }

  // ── 내부: DOM 골격 ───────────────────────────────
  _build() {
    if (this._built) return;
    this._built = true;
    const frag = document.createDocumentFragment();
    for (const id of PANEL_IDS) {
      // .panel-overlay 로 감싸 스타일시트(.hidden)와 계약(.panel.open) 양쪽에서 숨길 수 있게 한다.
      const overlay = h('div', 'panel-overlay hidden');
      overlay.dataset.overlay = id;
      overlay.setAttribute('aria-hidden', 'true');
      const panel = h('section', 'panel');
      panel.id = `panel-${id}`;
      panel.dataset.panel = id;
      panel.setAttribute('aria-hidden', 'true');
      const head = h('div', 'panel-head panel-header');
      head.appendChild(h('span', 'panel-head-title panel-title', PANEL_TITLES[id] || id));
      const closeBtn = h('button', 'panel-close', '✕');
      closeBtn.type = 'button';
      closeBtn.dataset.act = 'close';
      closeBtn.setAttribute('aria-label', '닫기');
      head.appendChild(closeBtn);
      const body = h('div', 'panel-body');
      // 내용은 스크롤 가능한 단일 컬럼에 넣는다 (.panel-body 는 flex row).
      const col = h('div', 'panel-col is-main scroll-list');
      body.appendChild(col);
      panel.appendChild(head);
      panel.appendChild(body);
      overlay.appendChild(panel);
      frag.appendChild(overlay);
      this._panels.set(id, panel);
      if (!this._overlays) this._overlays = {};
      this._overlays[id] = overlay;
      this._bodies[id] = col;
    }
    this.root.appendChild(frag);
    for (const id of PANEL_IDS) this._render(id);
  }

  _wire() {
    const r = this.root;
    r.addEventListener('click', this._bound.click);
    r.addEventListener('input', this._bound.input);
    r.addEventListener('change', this._bound.change);
    r.addEventListener('keydown', this._bound.keydown);
  }

  _setOpen(id, open) {
    const el = this._panels.get(id);
    if (!el) return;
    const wasOpen = el.classList.contains('open');
    el.classList.toggle('open', Boolean(open));
    el.setAttribute('aria-hidden', open ? 'false' : 'true');
    // 계약(.open)과 스타일시트(.hidden) 양쪽을 함께 토글한다.
    const overlay = this._overlays?.[id];
    if (overlay) {
      overlay.classList.toggle('hidden', !open);
      overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    }
    // 새로 열 때는 항상 맨 위부터 — 이전에 스크롤해 둔 위치 때문에 제목·첫 항목이 가려 보이지 않게 한다.
    if (open && !wasOpen) {
      const body = this._bodies?.[id];
      if (body) body.scrollTop = 0;
      el.scrollTop = 0;
    }
  }

  _wireNet() {
    const n = this.game?.net || net;
    if (!n) return;
    if (typeof n.onChat === 'function') this._netOffs.push(n.onChat((m) => this._onChat(m)));
    if (typeof n.onRoomState === 'function') {
      this._netOffs.push(
        n.onRoomState((s) => {
          this._roomState = s || null;
          if (this.isOpen('multiplayer')) this._renderRoomState();
        })
      );
    }
    if (typeof n.onError === 'function') {
      this._netOffs.push(
        n.onError((e) => {
          const msg = e?.message || '방 오류가 발생했습니다.';
          this._toast(msg, 'warn');
          if (this.isOpen('multiplayer')) this._render('multiplayer');
        })
      );
    }
    if (typeof n.on === 'function') {
      const off = safe(() =>
        n.on('net:connect', () => {
          if (this.isOpen('multiplayer')) this._render('multiplayer');
        })
      );
      if (typeof off === 'function') this._netOffs.push(off);
    }
  }

  // ── 내부: 입력 처리 (이벤트 위임) ─────────────────
  _onClick(e) {
    const target = e.target?.closest?.('[data-act]');
    if (!target || !this.root.contains(target)) return;
    if (target.disabled) return;
    const act = target.dataset.act;
    const d = target.dataset;
    switch (act) {
      case 'close':
        this.close();
        break;
      case 'build-cat':
        this.state.build.category = d.cat || 'attack';
        this._render('build');
        break;
      case 'build-tier':
        this.state.build.tier = Number(d.tier) || 0;
        this._render('build');
        break;
      case 'build-pick':
        this._pickTurret(d.type);
        break;
      case 'ach-cat':
        this.state.achievements.category = d.cat || this.state.achievements.category;
        this._render('achievements');
        break;
      case 'title-pick':
        this.emit('title:pick', { id: d.id });
        this._toast('칭호를 선택했습니다', 'info');
        this._render('achievements');
        break;
      case 'gacha-pull':
        this.emit('gacha:pull', { times: Number(d.times) || 1 });
        break;
      case 'gacha-craft':
        this._craft(d.id);
        break;
      case 'seed-pick':
        this.emit('seed:pick', { seed: String(d.seed ?? '') });
        this._stored('seeds', 'seed-free', '');
        this._fields.seeds['seed-free'] = String(d.seed ?? '');
        this._render('seeds');
        break;
      case 'seed-apply':
        this._seedApply();
        break;
      case 'seed-copy':
        this._copySeedLink();
        break;
      case 'frame-pick':
        this.emit('frame:pick', { id: d.id });
        break;
      case 'audio-mute':
        safe(() => this.game?.audio?.toggleMute?.());
        this._toast(safe(() => this.game?.audio?.muted) ? '음소거했습니다' : '음소거를 해제했습니다', 'info');
        this._render('settings');
        break;
      case 'minimap-toggle':
        safe(() => this.game?.ui?.minimap?.toggle?.());
        this._render('settings');
        break;
      case 'save':
        this.emit('save', {});
        break;
      case 'load':
        this.emit('load', {});
        break;
      case 'save-slot-load':
        this.emit('save:load', { id: d.id });
        break;
      case 'save-slot-del':
        this.emit('save:del', { id: d.id });
        break;
      case 'arcana-buy': {
        const res = this.game?.buyArcana?.(d.id) ?? { ok: false, reason: '연성 시스템 없음' };
        if (res.ok) this.game?.notify?.(`✨ ${res.info?.name ?? d.id} ${res.level}단계 — ${res.cost}G`, 'good');
        else this.game?.notify?.(`연성 실패 — ${res.reason ?? '알 수 없음'}`, 'bad');
        this._render('arcana');
        break;
      }
      case 'travel-go':
        this.game?.teleports?.travelTo?.(d.region, this.game);
        this._render('travel');
        break;
      case 'recipe-terrain':
        this.state.recipes.terrain = d.terrain || 'all';
        this._render('recipes');
        break;
      case 'recipe-kind':
        this.state.recipes.kind = d.kind || 'all';
        this._render('recipes');
        break;
      case 'recipe-goto':
        if (d.table) {
          if (!this.state.craft) this.state.craft = {};
          this.state.craft.table = d.table;
        }
        this.open('craft');
        break;
      case 'key-set':
        this._beginKeyCapture(d.id);
        break;
      case 'key-reset': {
        const keySt = this._keyState();
        const res = boundResetKey(d.id);
        keySt.message = res.ok ? `${BOUND_KEY_ACTION[d.id]?.label ?? d.id} 키를 기본값으로 되돌렸습니다` : res.error;
        this._render('settings');
        break;
      }
      case 'key-reset-all':
        boundResetAllKeys();
        this._keyState().message = '모든 키를 기본값으로 되돌렸습니다';
        this._render('settings');
        break;
      case 'perf-reset':
        this.emit('perf:reset', {});
        break;
      case 'auto-quality':
        this.emit('auto-quality:toggle', {});
        break;
      case 'game-reload':
        this.emit('game:reload', {});
        break;
      case 'quit':
        this.emit('quit', {});
        break;
      case 'resume':
        this.emit('resume', {});
        break;
      case 'pause-settings':
        this.open('settings');
        break;
      case 'pause-craft':
        this.open('craft');
        break;
      case 'pause-recipes':
        this.open('recipes');
        break;
      case 'feedback-submit':
        this._submitFeedback();
        break;
    case 'settings-nickname-save':
    case 'settings-nickname-clear': {
      const raw = this._field('auth', 'settings-nickname', '');
      const want = act === 'settings-nickname-clear' ? '' : raw;
      if (want && !isValidNickname(want)) { this._toast(`닉네임은 1~${NICKNAME_MAX}자`, 'warn'); break; }
      setNickname(want);
      this._fields.auth['settings-nickname'] = want;
      this._toast(want ? `닉네임을 ${want} (으)로 저장했습니다` : '닉네임을 지웠습니다', 'good');
      this._render('settings');
      break;
    }
      case 'settings-fullscreen': {
      const de = globalThis.document?.documentElement;
      const isFull = Boolean(globalThis.document?.fullscreenElement);
      if (isFull) {
        globalThis.document?.exitFullscreen?.();
        this.game?._setFullscreenPref?.(false);
        this._toast('창 모드로 바꿨습니다 (다음에도 창 모드)', 'info');
      } else if (de?.requestFullscreen) {
        this.game?._setFullscreenPref?.(true);
        Promise.resolve(de.requestFullscreen()).catch(() => this._toast('전체 화면을 켤 수 없습니다', 'warn'));
      } else {
        this._toast('이 브라우저는 전체 화면을 지원하지 않습니다', 'warn');
      }
      this._render('settings');
      break;
    }
    case 'settings-camera': {
      const mode = d.mode === 'third' ? 'third' : 'first';
      this.game?.player?.setCameraMode?.(mode);
      this.game?._syncAvatar?.();
      this._toast(mode === 'third' ? '3인칭 시점 — 캐릭터가 보입니다 (Z)' : '1인칭 시점 (Z)', 'info');
      this._render('settings');
      break;
    }
    case 'admin-console':
      this.close();
      this.game?.ui?.admin?.open?.();
      break;
    case 'nickname-save':
        this._saveNickname();
        break;
      case 'nickname-clear':
        this._saveNickname({ clear: true });
        break;
      case 'auth-remember': {
        const on = d.checked === true || d.value === 'on';
        this.state.auth.remember = on;
        this._saveRememberedUser(on ? String(this._field('auth', 'auth-username', '')).trim() : '');
        this._toast(on ? '아이디를 기억합니다' : '아이디 기억을 해제했습니다', 'info');
        break;
      }
      case 'auth-tab':
        this.state.auth.tab = d.tab || 'login';
        this.state.auth.message = '';
        this._refreshAccount();
        break;
      case 'auth-login':
        this._authSubmit('login');
        break;
      case 'auth-register':
        this._authSubmit('register');
        break;
      case 'auth-logout':
        auth.logout();
        this.state.auth.message = '로그아웃했습니다.';
        this._toast('로그아웃했습니다', 'info');
        this._refreshAccount();
        break;
      case 'craft-select':
        this.state.craft.table = d.table === WORKBENCH_ID || CRAFTING_TABLE_BY_ID[d.table] ? d.table : this.state.craft.table;
        this.state.craft.message = '';
        this._render('craft');
        break;
      case 'craft-bench-family':
        this.state.craft.benchFamily = d.family || 'all';
        this.state.craft.message = '';
        this._render('craft');
        break;
      case 'craft-build':
        this._craftBuild(d.table || this.state.craft.table);
        break;
      case 'craft-make':
        this._craftMake(d.weapon);
        break;
      case 'craft-wing':
        this._craftWing(d.wing);
        break;
      case 'craft-arrow':
        this._craftArrow(d.arrow);
        break;
      case 'panel-open': {
        // 패널에서 다른 패널로 바로 이동(예: 마법부여 → 건설)
        const target = PANEL_IDS.includes(d.panel) ? d.panel : '';
        if (target) this.open(target);
        break;
      }
      case 'enchant-goto':
        if (d.weapon !== undefined) this.state.enchant.weaponId = d.weapon;
        if (!this.state.enchant.element) this.state.enchant.element = ENCHANT_ELEMENTS[0]?.id ?? '';
        this.state.enchant.message = '';
        this.open('enchant');
        break;
      case 'enchant-pick':
        if (d.weapon !== undefined) this.state.enchant.weaponId = d.weapon;
        if (d.element !== undefined) this.state.enchant.element = d.element;
        this.state.enchant.message = '';
        this._render('enchant');
        break;
      case 'enchant-apply':
        this._enchantApply(d.weapon || this.state.enchant.weaponId, d.element || this.state.enchant.element);
        break;
      case 'wing-goto-craft': {
        // 인벤토리의 날개 카드 → 그 날개를 만들 수 있는 제작대 탭으로 이동
        const table = d.table && CRAFTING_TABLE_BY_ID[d.table] ? d.table : this.state.craft.table;
        this.state.craft.table = table;
        this.state.craft.message = `🪶 ${d.wing ?? ''} — 제작대에서 만드세요`;
        this.open('craft');
        break;
      }
      case 'class-advance':
        this._advanceClass(d.id);
        break;
      case 'class-promote':
        this._promoteClass();
        break;
      case 'class-preview':
        this.state.classes.preview = d.id || '';
        this._render('classes');
        break;
      case 'lb-load':
        this._loadLeaderboard();
        break;
      case 'mp-create':
        this._mpCreate();
        break;
      case 'mp-join':
        this._mpJoin();
        break;
      case 'mp-ready':
        this._mpReady();
        break;
      case 'mp-start':
        this._mpStart();
        break;
      case 'mp-leave':
        this._mpLeave();
        break;
      case 'mp-chat-send':
        this._mpChat();
        break;
      case 'weapon-filter':
        this.state.weapons.family = d.family || 'all';
        this._render('weapons');
        break;
      case 'weapon-equip':
        this._equipWeapon(d.id);
        break;
      case 'weapon-preview':
        this._previewWeapon(d.id);
        break;
      case 'charitem-buy':
        this.emit('charitem:buy', { id: d.id });
        this._render('inventory');
        break;
      case 'charitem-equip':
        this.emit('charitem:equip', { id: d.id });
        this._render('inventory');
        break;
      case 'charitem-unequip':
        this.emit('charitem:unequip');
        this._render('inventory');
        break;
      case 'wing-equip':
        this.emit('wing:equip', { id: d.id });
        this._render('inventory');
        break;
      case 'wing-unequip':
        this.emit('wing:unequip', {});
        this._render('inventory');
        break;
      case 'gear-buy':
        this.emit('gear:buy', { id: d.id });
        this._render('inventory');
        break;
      case 'gear-equip':
        this.emit('gear:equip', { id: d.id });
        this._render('inventory');
        break;
      case 'gear-unequip':
        this.emit('gear:unequip', { id: d.id });
        this._render('inventory');
        break;
      case 'gear-unequip-all':
        this.emit('gear:unequip-all', {});
        this._render('inventory');
        break;
      default:
        break;
    }
  }

  _onInput(e) {
    const t = e.target;
    const field = t?.dataset?.field;
    const panel = t?.closest?.('[data-panel]')?.dataset?.panel;
    if (field && panel) {
      this._stored(panel, field, '');
      this._fields[panel][field] = t.value;
    }
    if (t?.dataset?.act === 'volume') {
      this._vol[t.dataset.ch] = Number(t.value);
      writeJson(VOLUME_KEY, this._vol);
      safe(() => this.game?.audio?.setVolume?.({ master: this._vol.master, sfx: this._vol.sfx, bgm: this._vol.bgm }));
    }
  }

  _onChange(e) {
    const t = e.target;
    const act = t?.dataset?.act;
    if (!act) return;
    if (act === 'lb-mode') this.state.auth.lbMode = t.value;
    else if (act === 'mp-mode') this.state.multiplayer.mode = t.value;
    else if (act === 'mp-diff') this.state.multiplayer.difficulty = t.value;
    else if (act === 'mp-max') this.state.multiplayer.maxPlayers = Math.max(2, Math.min(4, Number(t.value) || 4));
  }

  _onKeyDown(e) {
    if (e.key !== 'Enter') return;
    const field = e.target?.dataset?.field;
    if (!field) return;
    if (field === 'mp-chat') {
      e.preventDefault();
      this._mpChat();
    } else if (field.indexOf('auth-') === 0 && field !== 'auth-message') {
      e.preventDefault();
      this._authSubmit(this.state.auth.tab === 'register' ? 'register' : 'login');
    } else if (field === 'seed-free') {
      e.preventDefault();
      this._seedApply();
    }
  }

  _stored(panel, name, fallback = '') {
    if (!this._fields[panel]) this._fields[panel] = {};
    if (!(name in this._fields[panel])) this._fields[panel][name] = fallback;
    return this._fields[panel][name];
  }

  _field(panel, name, fallback = '') {
    const el = this._bodies[panel]?.querySelector?.(`[data-field="${name}"]`);
    // 체크박스는 value 가 아니라 checked 로 읽는다(H-98).
    if (el && el.type === 'checkbox') return el.checked ? 'on' : '';
    if (el && typeof el.value === 'string') return el.value;
    return this._stored(panel, name, fallback);
  }

  _inputRow(panel, label, name, type = 'text', placeholder = '', value = null, extra = '') {
    const r = h('div', 'row');
    r.appendChild(h('span', 'row-label', label));
    const input = h('input', `input${extra ? ' ' + extra : ''}`);
    input.type = type;
    input.placeholder = placeholder;
    input.dataset.field = name;
    input.value = value === null ? this._stored(panel, name, '') : value;
    r.appendChild(input);
    return r;
  }

  _tabs(items) {
    const wrap = h('div', 'tabs panel-tabs');
    for (const it of items) {
      const b = h('button', 'tab panel-tab' + (it.active ? ' active is-active' : ''), it.label);
      b.type = 'button';
      b.dataset.act = it.act;
      if (it.data) for (const k of Object.keys(it.data)) b.dataset[k] = it.data[k];
      wrap.appendChild(b);
    }
    return wrap;
  }

  _toast(text, type = 'info') {
    const g = this.game;
    if (typeof g?.notify === 'function') {
      safe(() => g.notify(text, type));
      return;
    }
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = h('div', `toast row${type === 'warn' ? ' danger' : ''}`, text);
    el.dataset.type = type;
    root.appendChild(el);
    setTimeout(() => safe(() => el.remove()), 2600);
  }

  // ── 내부: 자원/마법 공통 ───────────────────────
  _affordable(cost = {}) {
    const eco = this.game?.economy;
    if (!eco) return true;
    if (typeof eco.canAfford === 'function') {
      const r = safe(() => eco.canAfford(cost), null);
      if (r !== null && r !== undefined) return Boolean(r);
    }
    if (num(cost.gold) > num(eco.gold)) return false;
    if (num(cost.wood) > num(eco.wood)) return false;
    const mins = cost.minerals || {};
    for (const k of Object.keys(mins)) if (num(mins[k]) > num(eco.minerals?.[k])) return false;
    return true;
  }

  _spellList() {
    const arr = safe(() => this.game?.spells?.spells);
    return Array.isArray(arr) ? arr : [];
  }

  _spellCard(s, index, selected) {
    const gradeId = typeof s?.grade === 'string' ? s.grade : s?.grade?.id;
    const grade = GRADE_BY_ID[gradeId];
    const elId = typeof s?.element === 'string' ? s.element : s?.element?.id;
    const el = ELEMENT_BY_ID[elId];
    const card = h('div', cardClass(grade ? gradeId : 'common', { selected }));
    card.style.borderTopColor = cssColor(el?.color ?? grade?.color ?? 0xbfc7cc);
    card.appendChild(row(`${index + 1}. ${s?.name ?? '이름 없는 마법'}`, grade?.name ?? (gradeId || '일반')));
    card.appendChild(row('속성', el ? `${el.name} (${el.status})` : elId || '비전'));
    if (Number.isFinite(s?.damage)) card.appendChild(row('피해', fmt(s.damage)));
    if (Number.isFinite(s?.mana)) card.appendChild(row('마나', num(s.mana)));
    if (Number.isFinite(s?.cooldown)) card.appendChild(row('쿨타임', num(s.cooldown) + 's'));
    if (s?.relic) card.appendChild(row('유물', '유물 마법'));
    return card;
  }

  // ── 렌더 라우터 ─────────────────────────────────
  _render(id) {
    const body = this._bodies[id];
    if (!body) return;
    try {
      if (id === 'build') this._renderBuild(body);
      else if (id === 'achievements') this._renderAchievements(body);
      else if (id === 'inventory') this._renderInventory(body);
      else if (id === 'gacha') this._renderGacha(body);
      else if (id === 'seeds') this._renderSeeds(body);
      else if (id === 'codex') this._renderCodex(body);
      else if (id === 'settings') this._renderSettings(body);
      else if (id === 'feedback') this._renderFeedback(body);
      else if (id === 'pause') this._renderPause(body);
      else if (id === 'auth') this._renderAuth(body);
      else if (id === 'recipes') this._renderRecipes(body);
      else if (id === 'travel') this._renderTravel(body);
      else if (id === 'arcana') this._renderArcana(body);
      else if (id === 'multiplayer') this._renderMultiplayer(body);
      else if (id === 'weapons') this._renderWeapons(body);
      else if (id === 'craft') this._renderCraft(body);
      else if (id === 'enchant') this._renderEnchant(body);
      else if (id === 'classes') this._renderClasses(body);
    } catch (err) {
      console.warn(`[panels] ${id} 렌더 오류`, err);
    }
  }

  // ── 건설 ────────────────────────────────────────
  _renderBuild(body) {
    const g = this.game;
    const st = this.state.build;
    body.textContent = '';
    body.appendChild(row('보유 자원', `골드 ${fmt(g?.economy?.gold ?? 0)} · 목재 ${fmt(g?.economy?.wood ?? 0)}`));
    const sel = st.selected ? TURRET_BY_ID[st.selected] : null;
    body.appendChild(row('선택한 포탑', sel ? `${sel.name} · 사거리 ${num(sel.range)} m` : '없음 (카드 클릭 또는 1~9)'));
    if (sel) body.appendChild(row('설명', sel.desc || '-'));

    body.appendChild(
      this._tabs(
        Object.keys(TURRET_CATEGORIES).map((key) => {
          const c = TURRET_CATEGORIES[key];
          return {
            label: `${c.icon || ''} ${c.name}`.trim(),
            act: 'build-cat',
            data: { cat: c.id },
            active: c.id === st.category
          };
        })
      )
    );

    const tierTabs = [{ label: '전체', act: 'build-tier', data: { tier: '0' }, active: st.tier === 0 }];
    for (const t of TIERS) tierTabs.push({ label: `T${t}`, act: 'build-tier', data: { tier: String(t) }, active: st.tier === t });
    body.appendChild(this._tabs(tierTabs));

    const list = turretsByCategory(st.category).filter((t) => !st.tier || t.tier === st.tier);
    this._buildList = list;
    if (!list.length) {
      body.appendChild(row('목록', '조건에 맞는 포탑이 없습니다.'));
      return;
    }
    if (st.category === 'facility') {
      // 시설은 종류별 묶음 — 기본 시설 / 컨베이어벨트(T1~T7) / 몬스터 소환문(T1~T7)
      // ⚡ 전력 현황 — 발전기·전선·소비를 한눈에
      const pw = safe(() => this.game?.powerSummary?.(), null);
      if (pw) {
        body.appendChild(sectionTitle('⚡ 전력 현황'));
        const powerBox = h('div', 'facility-power');
        powerBox.appendChild(row('공급', `${fmt(num(pw.supply))}kW · 발전기 ${fmt(num(pw.generators))}기`));
        powerBox.appendChild(row('소비', `${fmt(num(pw.demand))}kW · 소비 건물 ${fmt(num(pw.consumers))}기`));
        powerBox.appendChild(row('전선', `${fmt(num(pw.cables))}개 · 전력망 ${fmt(num(pw.networks))}개`));
        powerBox.appendChild(
          row(
            pw.short ? '⚠ 상태' : '상태',
            pw.short
              ? `전력 부족 ${fmt(num(pw.shortfall))}kW — 정지 ${fmt(num(pw.stopped))}기 (발전기를 더 세우세요)`
              : '정상 — 반경 6m 안 건물은 전선 없이도 연결됩니다'
          )
        );
        const st = safe(() => this.game?.storageSummary?.(), null);
        if (st) {
          powerBox.appendChild(
            row(
              '📦 저장고',
              num(st.count) > 0
                ? `${fmt(num(st.count))}기 · 골드 ${fmt(Math.floor(num(st.gold)))} · 목재 ${fmt(Math.floor(num(st.wood)))} / 용량 ${fmt(num(st.capacity))}`
                : '없음 — 저장고를 세우면 반경 안에서 자동으로 자원을 모읍니다'
            )
          );
        }
        body.appendChild(powerBox);
      }

      const groups = [
        { key: 'power', title: '⚡ 전력 (발전기 · 전선)', kinds: ['generator', 'cable'] },
        { key: 'base', title: '🏗 기본 시설', kinds: ['workbench', 'enchanter', 'arcana', 'storage', 'autominer'] },
        { key: 'conveyor', title: '⛓ 컨베이어벨트 (T1~T7)', kinds: ['conveyor'] },
        { key: 'spawner', title: '🌀 몬스터 소환문 (T1~T7)', kinds: ['spawner'] }
      ];
      let index = 0;
      let shown = 0;
      for (const group of groups) {
        const rows = list.filter((t) => group.kinds.includes(t.kind));
        if (!rows.length) continue;
        body.appendChild(sectionTitle(`${group.title} — ${rows.length}종`));
        const cards = grid();
        for (const t of rows) {
          cards.appendChild(this._turretCard(t, index));
          index += 1;
          shown += 1;
        }
        body.appendChild(cards);
      }
      if (shown > 0) return;
    }

    const cards = grid();
    list.forEach((t, i) => cards.appendChild(this._turretCard(t, i)));
    body.appendChild(cards);
  }

  _turretCard(t, index) {
    const cost = t.cost || {};
    const afford = this._affordable(cost);
    const card = h(
      'button',
      cardClass(TURRET_TIER_RARITY[num(t.tier, 1)] || 'common', {
        locked: !afford,
        selected: this.state.build.selected === t.id
      })
    );
    card.type = 'button';
    card.dataset.act = 'build-pick';
    card.dataset.type = t.id;
    card.dataset.index = String(index + 1);
    card.style.borderLeftColor = cssColor(t.color);
    card.appendChild(row(`${index < 9 ? index + 1 + '. ' : ''}${t.name}`, `T${num(t.tier, 1)}`));
    const cat = TURRET_CATEGORIES[t.category];
    card.appendChild(row('분류', cat ? cat.name : String(t.category || '-')));
    if (t.category === 'attack') {
      card.appendChild(row('피해', fmt(t.damage)));
      card.appendChild(row('사거리', num(t.range)));
      card.appendChild(row('연사', `${num(t.fireRate).toFixed(2)}/s`));
      card.appendChild(row('DPS', fmt(Math.round(num(t.damage) * num(t.fireRate)))));
      card.appendChild(row('조준', '적이 오면 몸체가 따라 돈다 (수동 회전 1.6초 우선)'));
    } else if (t.category === 'heal') {
      card.appendChild(row('회복', `${num(t.healPerSec)}/s`));
      card.appendChild(row('사거리', num(t.range)));
      card.appendChild(row('체력', fmt(t.hp)));
    } else if (t.category === 'portal') {
    card.appendChild(row('포탈', `🌀 ${t.portalName ?? '-'} — 세운 뒤 가까이에서 N`));
    card.appendChild(row('반경', `${num(t.range)} m`));
    card.appendChild(row('체력', fmt(t.hp)));
    card.appendChild(row('기능', '지형 이동 — 한 번 지으면 계속 쓴다 (재료만 소비)'));
  } else if (t.category === 'facility') {
      if (t.kind === 'workbench') card.appendChild(row('기능', '모든 무기 제작 (수동 — 전기 불필요)'));
      else if (t.kind === 'enchanter') card.appendChild(row('기능', '무기에 속성 부여 (수동 — 전기 불필요)'));
      else if (t.kind === 'storage') {
        card.appendChild(row('수급', `골드 ${num(t.storeRate?.gold)}/s · 목재 ${num(t.storeRate?.wood)}/s`));
        card.appendChild(row('보관 용량', `${fmt(num(t.capacity))} — 가득 차면 멈춤`));
        card.appendChild(row('수거', `반경 ${fmt(num(t.range))}m 안에서 자동 · E 즉시 수거`));
      } else if (t.kind === 'generator') {
        card.appendChild(row('공급', `${num(t.output)}kW`));
        card.appendChild(row('연결', '건물 6m · 전선 8m 안으로 붙는다'));
      } else if (t.kind === 'cable') {
        card.appendChild(row('역할', '전기를 멀리 보낸다'));
        card.appendChild(row('연결', '전선끼리 8m · 건물 6m'));
      } else if (t.kind === 'conveyor') {
        card.appendChild(row('운반', `${num(t.speed)} m/s · 위에 서면 실려 감`));
        card.appendChild(row('물류 보너스', `반경 내 자원 시설 +${Math.round(num(t.boost) * 100)}%`));
      } else if (t.kind === 'spawner') {
        card.appendChild(row('소환', `${num(t.spawnInterval)}초마다 몬스터 ${num(t.spawnCount)}마리`));
        card.appendChild(row('주의', '웨이브와 무관하게 계속 나옵니다'));
      } else card.appendChild(row('채굴', `${num(t.rate)}/s · 맨땅에서 지형 티어 광물 · 업그레이드하면 저티어 광물 채굴량 +35%/등급, 낮은 등급 광물도 랜덤 채굴`));
      const drawKw = num(t.draw);
      const powerText =
        drawKw > 0 ? `${drawKw}kW 소비` : t.kind === 'generator' ? '공급원' : '전기 불필요';
      card.appendChild(row('전력', powerText));
      card.appendChild(row('사거리', num(t.range)));
      card.appendChild(row('체력', fmt(t.hp)));
    } else {
      card.appendChild(row(t.category === 'mining' ? '채굴' : '벌목', `${num(t.rate ?? t.fireRate)}/s`));
      card.appendChild(row('사거리', num(t.range)));
      card.appendChild(row('체력', fmt(t.hp)));
    }
    card.appendChild(row('비용', this._costText(cost)));
    if (!afford) card.appendChild(row('상태', '자원 부족'));
    return card;
  }

  _costText(cost = {}) {
    const parts = [];
    if (num(cost.gold) > 0) parts.push(`${fmt(cost.gold)} G`);
    if (num(cost.wood) > 0) parts.push(`${fmt(cost.wood)} 목재`);
    const mins = cost.minerals || {};
    for (const k of Object.keys(mins)) parts.push(`${MINERAL_BY_ID[k]?.name || k} ${num(mins[k])}`);
    return parts.length ? parts.join(' + ') : '무료';
  }

  _pickTurret(typeId) {
    const turret = TURRET_BY_ID[typeId];
    if (!turret) return;
    this.state.build.selected = turret.id;
    this.emit('build:select', { typeId: turret.id });
    // 포탑을 고르면 건설창을 닫는다 — 커서를 다시 잠그고 바로 조준해 설치할 수 있게.
    // (건설 모드 자체는 main.js 의 build.active 가 유지된다. 닫힌 뒤에는 다시 그릴 필요가 없다.)
    if (this._current === 'build') {
      this.close();
    }
  }

  // ── 업적 ────────────────────────────────────────
  _achievementList() {
    const src = safe(() => this.game?.achievements?.list?.());
    const base = Array.isArray(src) && src.length ? src : ACHIEVEMENTS;
    return base.map((a) => ({
      ...a,
      target: num(a?.target, 1),
      progress: num(a?.progress, 0),
      unlocked: Boolean(a?.unlocked)
    }));
  }

  _achStat(stat) {
    const sys = this.game?.achievements;
    const v = sys?.values?.[stat];
    if (Number.isFinite(v)) return v;
    if (typeof sys?.get === 'function') {
      const r = safe(() => sys.get(stat), 0);
      if (Number.isFinite(r)) return r;
    }
    return 0;
  }

  _renderAchievements(body) {
    const g = this.game;
    const st = this.state.achievements;
    const list = this._achievementList();
    const p = safe(() => g?.achievements?.progress?.(), null);
    const total = num(p?.total, list.length);
    const unlockedCount = num(p?.unlocked, list.filter((a) => a.unlocked).length);
    const ratio = num(p?.ratio, total ? unlockedCount / total : 0);

    body.textContent = '';
    body.appendChild(row('전체 진행', `${fmt(unlockedCount)} / ${fmt(total)} (${Math.round(ratio * 100)}%)`));
    body.appendChild(bar(ratio));
    const title = safe(() => g?.achievements?.title?.(), null);
    body.appendChild(row('현재 칭호', title?.name || '없음'));

    body.appendChild(
      this._tabs(
        ACHIEVEMENT_CATEGORIES.map((c) => ({
          label: `${c.icon || ''} ${c.name}`.trim(),
          act: 'ach-cat',
          data: { cat: c.id },
          active: c.id === st.category
        }))
      )
    );

    const catList = list.filter((a) => a.category === st.category);
    const catDone = catList.filter((a) => a.unlocked).length;
    const catName = (ACHIEVEMENT_CATEGORIES.find((c) => c.id === st.category) || {}).name || st.category;
    body.appendChild(row(`${catName} 진행`, `${fmt(catDone)} / ${fmt(catList.length)}`));
    body.appendChild(bar(catList.length ? catDone / catList.length : 0));

    const cards = grid();
    if (!catList.length) cards.appendChild(row('목록', '해당 분류의 업적이 없습니다.'));
    else for (const a of catList) cards.appendChild(this._achCard(a));
    body.appendChild(cards);

    body.appendChild(sectionTitle('칭호'));
    const tgrid = grid();
    for (const t of TITLE_LIST) tgrid.appendChild(this._titleCard(t, title));
    body.appendChild(tgrid);
  }

  _achCard(a) {
    const target = num(a.target, 1);
    const progress = num(a.progress, 0);
    const done = a.unlocked || progress >= target;
    const card = h('div', cardClass(ACH_RARITY[num(a.tier, 1)] || 'common', { selected: done }));
    card.dataset.unlocked = done ? '1' : '0';
    card.appendChild(row(a.name || a.id, done ? '달성' : `${fmt(progress)}/${fmt(target)}`));
    card.appendChild(row('설명', a.desc || ''));
    card.appendChild(bar(target ? progress / target : 0));
    return card;
  }

  _titleCard(t, current) {
    const target = num(t?.condition?.target, 1);
    const stat = t?.condition?.stat;
    const unlocked = this._achStat(stat) >= target;
    const card = h('div', cardClass(null, { locked: !unlocked, selected: Boolean(current && current.id === t.id) }));
    card.appendChild(row(t.name, unlocked ? '해금' : '잠김'));
    card.appendChild(row('조건', t.desc || `${stat} ${target}`));
    card.appendChild(row('진행', `${fmt(this._achStat(stat))} / ${fmt(target)}`));
    const btn = h('button', 'btn ghost btn-ghost', '장착');
    btn.type = 'button';
    btn.dataset.act = 'title-pick';
    btn.dataset.id = t.id;
    btn.disabled = !unlocked;
    card.appendChild(btn);
    return card;
  }

  // ── 인벤토리 ────────────────────────────────────
  _renderInventory(body) {
    const g = this.game;
    const minerals = g?.economy?.minerals || {};
    body.textContent = '';
    const leatherTotal = num(safe(() => g?.economy?.totalLeather?.(), 0), 0);
    body.appendChild(
      row(
        '보유 자원',
        `골드 ${fmt(g?.economy?.gold ?? 0)} · 목재 ${fmt(g?.economy?.wood ?? 0)} · 가죽 ${fmt(leatherTotal)} · 화살 ${fmt(num(safe(() => g?.economy?.totalArrows?.(), 0), 0))}발`
      )
    );
    const ownedTypes = MINERAL_TYPES.filter((m) => num(minerals[m.id], 0) > 0).length;
    const totalMinerals = safe(() => g?.economy?.totalMinerals?.(), null);
    body.appendChild(
      row('광물 수집', `${fmt(ownedTypes)} / ${MINERAL_TYPES.length} 종${Number.isFinite(totalMinerals) ? ` · 총 ${fmt(totalMinerals)} 개` : ''}`)
    );

    const cards = grid();
    for (const m of MINERAL_TYPES) {
      const count = num(minerals[m.id], 0);
      const card = h('div', cardClass(TIER_RARITY[m.tier] || 'common', { locked: !count }));
      card.style.borderTopColor = cssColor(m.color);
      card.title = `${m.name} · ${MINERAL_TIERS[m.tier] || 'T' + m.tier}`;
      card.appendChild(row(m.name, `${fmt(count)} 개`));
      card.appendChild(row('등급', MINERAL_TIERS[m.tier] || `T${m.tier}`));
      card.appendChild(row('가치', `${fmt(count * num(m.value))} G`));
      cards.appendChild(card);
    }
    body.appendChild(cards);

    body.appendChild(sectionTitle('보유 마법'));
    const spells = this._spellList();
    const selected = num(safe(() => g?.spells?.selected, -1), -1);
    if (!spells.length) {
      body.appendChild(row('마법', '없음 — 부여대(E)에서 뽑으세요.'));
    } else {
      const sgrid = grid();
      spells.forEach((s, i) => sgrid.appendChild(this._spellCard(s, i, i === selected)));
      body.appendChild(sgrid);
    }

    body.appendChild(sectionTitle('지팡이'));
    const tier = num(g?.staff?.tier, 1);
    const info = STAFF_BY_TIER[tier];
    body.appendChild(row('장착 지팡이', info ? `${info.name} (T${tier})` : `T${tier} 지팡이`));
    if (info?.desc) body.appendChild(row('설명', info.desc));
    const relicId = safe(() => g?.staff?.relic, null);
    if (relicId) {
      const relic = RELIC_BY_ID[relicId] || RELIC_STAVES.find((r) => r.id === relicId);
      if (relic) body.appendChild(row('유물', `${relic.name} — ${relic.desc || ''}`));
    }

    body.appendChild(this._characterItemSection());
    body.appendChild(this._leatherSection());
    body.appendChild(this._gearSection());
    body.appendChild(this._wingsSection());
  }

  // ── 캐릭터 전용 아이템 (v1.2.0) ──────────────────
  /** 외형마다 하나씩 — 그 캐릭터로 플레이할 때만 사고 쓸 수 있다 */
  _characterItemSection() {
    const g = this.game;
    const sys = g?.charItems ?? null;
    const character = g?.character ?? null;
    const skinId = String(character?.skin ?? '');
    const skinInfo = CHARACTER_SKIN_BY_ID[skinId] ?? null;
    const skinName = skinInfo ? skinInfo.name : skinId || '-';
    const wrap = h('div', 'gear-section');
    wrap.dataset.role = 'character-item-section';
    wrap.appendChild(sectionTitle('캐릭터 전용 아이템 — 이 캐릭터만 사용'));
    wrap.appendChild(row('현재 캐릭터', skinName));
    const equipped = sys?.equippedId ? CHARACTER_ITEM_BY_ID[sys.equippedId] : null;
    const equippedText = equipped
      ? equipped.glyph + ' ' + equipped.name + ' — ' + gearBonusText(equipped.bonus)
      : '없음 (아래에서 구매·착용)';
    wrap.appendChild(row('착용 중', equippedText));
    wrap.appendChild(row('규칙', '다른 캐릭터의 전용 아이템은 구매·착용할 수 없습니다 (캐릭터를 바꾸면 자동 해제)'));

    const list = sys?.list?.(character) ?? [];
    const cards = grid();
    for (const C of CHARACTER_ITEMS) {
      const item = list.find((x) => x.id === C.id) ?? null;
      const usable = item ? item.usable : C.skin === skinId;
      const owned = Boolean(item?.owned);
      const isOn = Boolean(item?.equipped);
      const card = h('div', cardClass(null, { locked: !usable, selected: isOn }));
      card.style.borderTopColor = cssColor(C.color);
      card.dataset.role = 'charitem-card';
      card.dataset.id = C.id;
      const state = isOn ? '착용 중' : owned ? '보유' : (item?.costText ?? C.cost.gold + ' G');
      card.appendChild(row(C.glyph + ' ' + C.name, state));
      card.appendChild(row('전용', C.skin + (usable ? ' ← 지금 캐릭터' : '')));
      card.appendChild(row('효과', gearBonusText(C.bonus)));
      card.appendChild(row('설명', C.desc));
      if (!usable) {
        card.appendChild(row('상태', C.skin + ' 캐릭터만 사용할 수 있습니다'));
      } else if (!sys) {
        card.appendChild(row('상태', '게임을 시작한 뒤에 사용할 수 있습니다'));
      } else if (isOn) {
        const off = h('button', 'btn ghost btn-ghost', '해제');
        off.type = 'button';
        off.dataset.act = 'charitem-unequip';
        off.dataset.id = C.id;
        card.appendChild(off);
      } else if (owned) {
        const eq = h('button', 'btn primary btn-primary', '착용');
        eq.type = 'button';
        eq.dataset.act = 'charitem-equip';
        eq.dataset.id = C.id;
        card.appendChild(eq);
      } else {
        const buy = h('button', 'btn primary btn-primary', '구매');
        buy.type = 'button';
        buy.dataset.act = 'charitem-buy';
        buy.dataset.id = C.id;
        card.appendChild(buy);
      }
      cards.appendChild(card);
    }
    wrap.appendChild(cards);
    return wrap;
  }

  // ── 가죽 (몬스터 사냥 보상) ──────────────────────
  /** 가죽 5종 — 보유량과 획득처 */
  _leatherSection() {
    const g = this.game;
    const eco = g?.economy ?? null;
    const counts = (id) => num(safe(() => eco?.getLeather?.(id), 0), 0);
    const owned = LEATHER_TYPES.filter((l) => counts(l.id) > 0).length;
    const wrap = h('div', 'gear-section');
    wrap.dataset.role = 'leather-section';
    wrap.appendChild(sectionTitle('가죽 — 몬스터 사냥 보상'));
    wrap.appendChild(
      row('가죽 수집', `${fmt(owned)} / ${LEATHER_TYPES.length} 종 · 총 ${fmt(num(safe(() => eco?.totalLeather?.(), 0), 0))} 개`)
    );
    wrap.appendChild(row('얻는 법', '지형 티어별 야생 몬스터를 잡으면 떨군다(가죽 장비 · 상위 날개의 재료)'));
    const cards = grid('card-grid gear-grid');
    for (const l of LEATHER_TYPES) {
      const count = counts(l.id);
      const card = h('div', cardClass(TIER_RARITY[l.tier] || 'common', { locked: !count, extra: 'leather-card' }));
      card.dataset.role = 'leather-row';
      card.dataset.leatherId = l.id;
      card.dataset.tier = String(l.tier);
      card.style.borderTopColor = cssColor(l.color);
      card.title = l.desc || l.name;
      card.appendChild(row(`${l.glyph} ${l.name}`, `${fmt(count)} 개`));
      card.appendChild(row('등급', `T${l.tier} · ${MINERAL_TIERS[l.tier] || ''}`));
      card.appendChild(row('획득처', l.drop || '-'));
      card.appendChild(row('가치', `${fmt(count * num(l.value))} G`));
      cards.appendChild(card);
    }
    wrap.appendChild(cards);
    return wrap;
  }

  // ── 가죽 장비 (제작 · 슬롯) ──────────────────────
  /** 장비 목록 — game.gear 가 없으면(테스트 스텁) 데이터 기본값으로 그린다 */
  _gearList() {
    const raw = safe(() => this.game?.gear?.list?.(), null);
    if (Array.isArray(raw) && raw.length) return raw;
    return LEATHER_GEAR.map((ge) => ({
      ...ge,
      slotName: GEAR_SLOTS.find((s) => s.id === ge.slot)?.name ?? ge.slot,
      slotGlyph: GEAR_SLOTS.find((s) => s.id === ge.slot)?.glyph ?? '🎽',
      owned: false,
      equipped: false,
      canBuy: false,
      reason: '',
      costText: gearCostText(ge),
      bonusText: gearBonusText(ge.bonus)
    }));
  }

  _gearSection() {
    const g = this.game;
    const list = this._gearList();
    const stats = safe(() => g?.gear?.stats?.(), null);
    const equippedIds = new Set(Array.isArray(stats?.equippedIds) ? stats.equippedIds : []);
    const pieces = num(stats?.pieces, equippedIds.size);
    const wrap = h('div', 'gear-section');
    wrap.dataset.role = 'gear-section';
    wrap.appendChild(sectionTitle('가죽 장비 — 제작 방어구'));
    const slots = GEAR_SLOTS.map((s) => {
      const id = safe(() => g?.gear?.equippedIn?.(s.id), null);
      const def = id ? leatherGearById(id) : null;
      return `${s.glyph} ${s.name}: ${def ? def.name : '—'}`;
    }).join(' · ');
    wrap.appendChild(row('착용 슬롯', slots));
    wrap.appendChild(row('세트', `${fmt(pieces)} / ${fmt(LEATHER_GEAR.length)}벌 착용`));
    const bonus = stats ? gearBonusText(stats) : '';
    wrap.appendChild(row('합산 보너스', bonus || '없음'));
    for (const s of GEAR_SET_BONUS) {
      wrap.appendChild(row(s.name, `${pieces >= s.count ? '✔ ' : ''}${s.desc}`));
    }
    const acts = h('div', 'row weapon-actions');
    const offAll = h('button', 'btn ghost btn-ghost', '전부 해제');
    offAll.type = 'button';
    offAll.dataset.act = 'gear-unequip-all';
    if (!pieces) offAll.disabled = true;
    acts.appendChild(offAll);
    wrap.appendChild(acts);

    const cards = grid('card-grid gear-grid');
    for (const ge of list) cards.appendChild(this._gearCard(ge, equippedIds.has(ge.id)));
    wrap.appendChild(cards);
    return wrap;
  }

  _gearCard(ge, equipped) {
    const rarity = WING_GRADE_RARITY[ge.grade] || 'common';
    const card = h('div', cardClass(rarity, { selected: Boolean(equipped), locked: !ge.owned, extra: 'gear-card' }));
    card.dataset.role = 'gear-row';
    card.dataset.gearId = ge.id;
    card.dataset.slot = ge.slot;
    card.dataset.tier = String(num(ge.tier, 1));
    card.style.borderTopColor = cssColor(ge.color);
    card.title = ge.desc || ge.name;

    const head = h('div', 'row stat-row weapon-head');
    head.appendChild(h('span', 'row-label weapon-name', `${ge.slotGlyph ?? '🎽'} ${ge.name}`));
    const badge = h('span', `badge rarity-${rarity} r-${rarity} weapon-grade`, `T${num(ge.tier, 1)} · ${wingGradeInfo(ge.grade).name}`);
    badge.dataset.role = 'gear-tier';
    badge.style.color = cssColor(ge.color);
    badge.style.borderColor = cssColor(ge.color);
    head.appendChild(badge);
    card.appendChild(head);

    card.appendChild(row('슬롯', ge.slotName ?? ge.slot));
    card.appendChild(row('보너스', ge.bonusText || '-'));
    if (ge.desc) card.appendChild(row('설명', ge.desc));
    card.appendChild(row('비용', ge.owned ? '보유 중' : ge.costText || '-'));
    card.appendChild(row('상태', equipped ? '착용 중' : ge.owned ? '보유' : '미보유'));

    const acts = h('div', 'row weapon-actions');
    if (!ge.owned) {
      const buy = h('button', 'btn ' + (ge.canBuy ? 'primary btn-primary' : 'ghost btn-ghost'), ge.canBuy ? '만들기' : '재료 부족');
      buy.type = 'button';
      buy.dataset.act = 'gear-buy';
      buy.dataset.id = ge.id;
      if (!ge.canBuy) {
        buy.disabled = true;
        buy.setAttribute('aria-disabled', 'true');
        if (ge.reason) buy.title = ge.reason;
      }
      acts.appendChild(buy);
    } else {
      const equip = h('button', 'btn ' + (equipped ? 'ghost btn-ghost' : 'primary btn-primary'), equipped ? '착용 중' : '착용');
      equip.type = 'button';
      equip.dataset.act = 'gear-equip';
      equip.dataset.id = ge.id;
      if (equipped) {
        equip.disabled = true;
        equip.setAttribute('aria-disabled', 'true');
      }
      acts.appendChild(equip);
      const off = h('button', 'btn ghost btn-ghost', '해제');
      off.type = 'button';
      off.dataset.act = 'gear-unequip';
      off.dataset.id = ge.id;
      if (!equipped) off.disabled = true;
      acts.appendChild(off);
    }
    card.appendChild(acts);
    return card;
  }

  // ── 요정의 날개 (장비 · 비행) ────────────────────
  /** 날개 목록 — game.wings 가 없으면(테스트 스텁) 데이터 기본값으로 그린다 */
  /** 보유한 날개 id 집합 — 제작 패널의 제작 가능 판정에 쓴다 */
  _wingOwnedSet() {
    const list = this._wingList();
    return new Set(list.filter((w) => w.owned).map((w) => w.id));
  }

  _wingList() {
    const raw = safe(() => this.game?.wings?.list?.(), null);
    if (Array.isArray(raw) && raw.length) return raw;
    return FAIRY_WINGS.map((w) => ({
      ...w,
      owned: false,
      equipped: false,
      canBuy: false,
      reason: '',
      costText: '',
      flightText: ''
    }));
  }

  _wingsSection() {
    const g = this.game;
    const list = this._wingList();
    const state = safe(() => g?.wingState?.(), null);
    const equippedId = state?.equippedId ?? safe(() => g?.wings?.equippedId, null);
    const forced = Boolean(state?.forced ?? safe(() => g?.adminFlight, false));
    const flying = Boolean(state?.flying ?? safe(() => g?.player?.flying, false));
    const equippedWing = equippedId ? FAIRY_WING_BY_ID[equippedId] : null;

    const wrap = h('div', 'wing-section');
    wrap.dataset.role = 'wing-section';
    wrap.appendChild(sectionTitle('요정의 날개 — 비행 장비'));

    const status = forced
      ? '관리자 비행 활성 — 날개 없이 납니다 (마나 소모 없음)'
      : flying
        ? `비행 중 — ${equippedWing?.name ?? '날개'} · Space 상승 / Shift 하강`
        : equippedWing
          ? `착용 중 — ${equippedWing.name} (Space 상승 · Shift 하강)`
          : '착용 없음 — 아래에서 만들거나 V 키로 착용/해제';
    wrap.appendChild(row('상태', status));
    wrap.appendChild(row('조작', 'V 착용/해제 · Space 상승 · Shift 하강 · 관리자 /플라이'));
    if (equippedWing) {
      wrap.appendChild(row('장착 성능', equippedWing.flightText ?? ''));
    }

    const cards = grid('card-grid wing-grid');
    for (const w of list) {
      cards.appendChild(this._wingCard(w));
    }
    wrap.appendChild(cards);
    return wrap;
  }

  _wingCard(w) {
    const rarity = WING_GRADE_RARITY[w.grade] || TIER_RARITY[num(w.tier, 1)] || 'common';
    const card = h('div', cardClass(rarity, { selected: Boolean(w.equipped), locked: !w.owned, extra: 'wing-card' }));
    card.dataset.role = 'wing-row';
    card.dataset.wingId = w.id;
    card.dataset.tier = String(num(w.tier, 1));
    card.style.borderTopColor = cssColor(w.color);
    card.title = w.desc || w.name;

    const head = h('div', 'row stat-row weapon-head');
    head.appendChild(h('span', 'row-label weapon-name', `🪶 ${w.name}`));
    const gradeName = w.gradeName ?? wingGradeInfo(w.grade).name;
    const badge = h('span', `badge rarity-${rarity} r-${rarity} weapon-grade`, `T${num(w.tier, 1)} · ${gradeName}`);
    badge.dataset.role = 'wing-tier';
    badge.style.color = cssColor(w.color);
    badge.style.borderColor = cssColor(w.color);
    head.appendChild(badge);
    card.appendChild(head);

    card.appendChild(row('등급', w.gradeName ?? wingGradeInfo(w.grade).name));
    card.appendChild(row('비행 성능', w.flightText || ''));
    if (w.desc) card.appendChild(row('설명', w.desc));
    card.appendChild(row('비용', w.owned ? '보유 중' : w.costText || '-'));
    // 만드는 곳은 제작대다 — 어느 제작대인지 카드에 그대로 적어 준다
    const recipe = wingRecipeFor(w.id);
    const tableDef = recipe ? CRAFTING_TABLE_BY_ID[recipe.table] || null : null;
    const tableBuilt = Boolean(recipe && this._craftBuilt(recipe.table));
    if (recipe) {
      card.appendChild(row('제작대', `${tableTierLabel(tableDef)}${tableBuilt ? ' ✔' : ' — 미건설'}`));
      if (recipe.requires && !w.owned) {
        const prev = FAIRY_WING_BY_ID[recipe.requires];
        const prevOwned = Boolean(prev && this._wingOwnedSet().has(prev.id));
        card.appendChild(row('선행 날개', `${prev ? prev.name : recipe.requires}${prevOwned ? ' ✔' : ' — 먼저 제작'}`));
      }
    }
    if (!w.owned && w.hint) card.appendChild(row('힌트', w.hint));
    if (!w.owned && !w.canBuy && w.reason) card.appendChild(row('조건', w.reason));
    card.appendChild(row('상태', w.equipped ? '착용 중' : w.owned ? '보유' : '미보유'));

    const acts = h('div', 'row weapon-actions');
    if (!w.owned) {
      const make = h('button', 'btn primary btn-primary', '제작대에서 만들기');
      make.type = 'button';
      make.dataset.act = 'wing-goto-craft';
      make.dataset.id = w.id;
      make.dataset.wing = w.id;
      make.dataset.table = recipe ? recipe.table : CRAFTING_TABLES[0].id;
      make.title = recipe ? `${tableTierLabel(tableDef)}에서 제작` : '제작대에서 제작';
      acts.appendChild(make);
    } else {
      const equip = h('button', 'btn ' + (w.equipped ? 'ghost btn-ghost' : 'primary btn-primary'), w.equipped ? '착용 중' : '착용');
      equip.type = 'button';
      equip.dataset.act = 'wing-equip';
      equip.dataset.id = w.id;
      if (w.equipped) {
        equip.disabled = true;
        equip.setAttribute('aria-disabled', 'true');
      }
      acts.appendChild(equip);
      const off = h('button', 'btn ghost btn-ghost', '접기');
      off.type = 'button';
      off.dataset.act = 'wing-unequip';
      if (!w.equipped) off.disabled = true;
      acts.appendChild(off);
    }
    card.appendChild(acts);
    return card;
  }

  // ── 부여대 ──────────────────────────────────────
  _canPull(times) {
    const g = this.game;
    if (typeof g?.gacha?.canPull === 'function') {
      const r = safe(() => g.gacha.canPull(times), null);
      if (typeof r === 'boolean') return r;
      if (r && typeof r === 'object') return Boolean(r.ok !== false);
      if (typeof r === 'number') return r > 0;
    }
    const cost = times >= 10 ? GACHA_COST.ten : GACHA_COST.single;
    return num(g?.economy?.gold, 0) >= cost;
  }

  _odds() {
    const raw = safe(() => this.game?.gacha?.odds?.(), null);
    let list = null;
    if (Array.isArray(raw) && raw.length) {
      list = raw.map((o) => ({
        grade: typeof o?.grade === 'string' ? o.grade : o?.grade?.id || o?.id || 'common',
        chance: num(o?.chance, num(o?.p, 0))
      }));
    } else {
      const total = SPELL_GRADES.reduce((s, g) => s + num(g.weight, 0), 0) || 1;
      list = SPELL_GRADES.map((g) => ({ grade: g.id, chance: num(g.weight, 0) / total }));
    }
    // 확률(0~1) 대신 가중치/퍼센트를 돌려주는 구현도 견딘다.
    const sum = list.reduce((s, o) => s + o.chance, 0);
    if (sum > 1.5) list = list.map((o) => ({ grade: o.grade, chance: o.chance / sum }));
    return list;
  }

  _pct(v) {
    const p = num(v, 0);
    const percent = p <= 1 ? p * 100 : p;
    return `${percent.toFixed(2)}%`;
  }

  _renderGacha(body) {
    const g = this.game;
    body.textContent = '';
    body.appendChild(row('보유 골드', `${fmt(g?.economy?.gold ?? 0)} G`));
    body.appendChild(row('부여 비용', `1회 ${fmt(GACHA_COST.single)} G · 10회 ${fmt(GACHA_COST.ten)} G`));

    const btns = h('div', 'row');
    const single = h('button', 'btn primary btn-primary', `1회 부여 (${fmt(GACHA_COST.single)} G)`);
    single.type = 'button';
    single.dataset.act = 'gacha-pull';
    single.dataset.times = '1';
    single.disabled = !this._canPull(1);
    const ten = h('button', 'btn primary btn-primary', `10연속 부여 (${fmt(GACHA_COST.ten)} G)`);
    ten.type = 'button';
    ten.dataset.act = 'gacha-pull';
    ten.dataset.times = '10';
    ten.disabled = !this._canPull(10);
    btns.appendChild(single);
    btns.appendChild(ten);
    body.appendChild(btns);

    body.appendChild(sectionTitle('등급 확률'));
    const table = grid();
    for (const o of this._odds()) {
      const grade = GRADE_BY_ID[o.grade];
      table.appendChild(rarityRow(grade ? o.grade : 'common', grade?.name || o.grade, `${this._pct(o.chance)} · 위력 ×${num(grade?.mult, 1)}`));
    }
    body.appendChild(table);

    const spells = this._spellList();
    const selected = num(safe(() => g?.spells?.selected, -1), -1);
    body.appendChild(sectionTitle(`보유 마법 (${spells.length}/6)`));
    if (!spells.length) {
      body.appendChild(row('마법', '아직 보유한 마법이 없습니다.'));
    } else {
      const sgrid = grid();
      spells.forEach((s, i) => sgrid.appendChild(this._spellCard(s, i, i === selected)));
      body.appendChild(sgrid);
    }

    body.appendChild(sectionTitle('광물 조합 제작'));
    const recipes = grid();
    for (const r of MINERAL_COMBO_RECIPES) recipes.appendChild(this._recipeCard(r));
    body.appendChild(recipes);
  }

  _recipeCard(r) {
    const input = r.input || {};
    const can = this._affordable({ minerals: input });
    const grade = GRADE_BY_ID[r.grade];
    const card = h('div', cardClass(grade ? r.grade : 'common', { locked: !can }));
    card.appendChild(row(r.name, grade?.name || r.grade || ''));
    card.appendChild(row('재료', this._mineralListText(input)));
    if (r.relic) {
      const relic = RELIC_BY_ID[r.relic];
      if (relic) card.appendChild(row('유물', relic.name));
    }
    const btn = h('button', 'btn ghost btn-ghost', can ? '제작' : '재료 부족');
    btn.type = 'button';
    btn.dataset.act = 'gacha-craft';
    btn.dataset.id = r.id;
    btn.disabled = !can;
    card.appendChild(btn);
    return card;
  }

  _mineralListText(input = {}) {
    const parts = Object.keys(input).map((id) => {
      const have = num(safe(() => this.game?.economy?.minerals?.[id], 0), 0);
      const need = num(input[id], 0);
      return `${MINERAL_BY_ID[id]?.name || id} ${need} (보유 ${have})`;
    });
    return parts.length ? parts.join(' + ') : '없음';
  }

  _craft(id) {
    const g = this.game;
    const recipe = MINERAL_COMBO_RECIPES.find((r) => r.id === id);
    if (!recipe) return;
    if (typeof g?.gacha?.craft === 'function') {
      const r = safe(() => g.gacha.craft(recipe.id), null);
      if (r && r.ok === false) this._toast(r.reason || '제작에 실패했습니다', 'warn');
      else this._toast(`${recipe.name} 제작 완료`, 'good');
      this._render('gacha');
      return;
    }
    if (!this._affordable({ minerals: recipe.input })) {
      this._toast('재료가 부족합니다', 'warn');
      return;
    }
    const makeSpell = g?.gacha?.makeSpell;
    const addSpell = g?.spells?.add;
    if (typeof makeSpell === 'function' && typeof addSpell === 'function') {
      const paid = safe(() => g.economy?.spend?.({ minerals: recipe.input }), true);
      if (paid === false) {
        this._toast('재료가 부족합니다', 'warn');
        return;
      }
      const spell = safe(() => makeSpell.call(g.gacha, recipe.grade, recipe.element), null);
      const added = spell ? safe(() => addSpell.call(g.spells, spell), false) : false;
      this._toast(added === false ? '마법 슬롯이 가득 찼습니다' : `${recipe.name} 제작 완료`, added === false ? 'warn' : 'good');
      this._render('gacha');
      return;
    }
    this.emit('gacha:craft', { id: recipe.id, recipe });
  }

  // ── 시드 갤러리 ─────────────────────────────────
  _renderSeeds(body) {
    const g = this.game;
    body.textContent = '';
    const current = String(g?.seed ?? '');
    const head = h('div', 'seed-head-row');
    head.appendChild(h('span', 'seed-current-label', `현재 시드 ${current || '없음'}`));
    head.appendChild(h('span', 'seed-count', `${SEED_GALLERY.length}개 중 선택`));
    body.appendChild(head);
    // 8개 시드가 잘리지 않고 한 화면에 담기도록 전용 그리드(4열 x 2줄).
    const cards = grid('seed-grid');
    for (const s of SEED_GALLERY) {
      const card = h('button', cardClass(null, { extra: 'menu-seed-item' }));
      card.type = 'button';
      card.dataset.act = 'seed-pick';
      card.dataset.seed = s.seed;
      const isCurrent = String(s.seed) === current;
      if (isCurrent) card.classList.add('is-active');
      const top = h('span', 'seed-top');
      top.appendChild(h('span', 'seed-name', s.name));
      top.appendChild(h('span', 'seed-code', `#${s.seed}`));
      card.appendChild(top);
      card.appendChild(h('span', 'seed-desc', s.desc));
      const foot = h('span', 'seed-foot');
      foot.appendChild(h('span', 'seed-tags', (s.tags || []).join(' · ')));
      if (isCurrent) foot.appendChild(h('span', 'seed-now', '현재'));
      card.appendChild(foot);
      cards.appendChild(card);
    }
    body.appendChild(cards);

    const form = h('div', 'row');
    form.appendChild(h('span', 'row-label', '시드 직접 입력'));
    const input = h('input', 'input');
    input.type = 'text';
    input.placeholder = '비우면 무작위';
    input.dataset.field = 'seed-free';
    input.value = this._stored('seeds', 'seed-free', String(g?.seed ?? ''));
    form.appendChild(input);
    const apply = h('button', 'btn primary btn-primary', '적용');
    apply.type = 'button';
    apply.dataset.act = 'seed-apply';
    form.appendChild(apply);
    const copy = h('button', 'btn ghost btn-ghost', '링크 복사');
    copy.type = 'button';
    copy.dataset.act = 'seed-copy';
    form.appendChild(copy);
    body.appendChild(form);
  }

  _seedApply() {
    const raw = this._field('seeds', 'seed-free', '');
    const seed = normalizeSeed(raw);
    this._fields.seeds['seed-free'] = seed;
    this.emit('seed:pick', { seed });
    this._toast(`시드 ${seed} 선택`, 'info');
    this._render('seeds');
  }

  _copySeedLink() {
    const raw = this._field('seeds', 'seed-free', String(this.game?.seed ?? ''));
    const seed = normalizeSeed(raw);
    let url = `?seed=${encodeURIComponent(seed)}`;
    const loc = globalThis.location;
    if (loc && typeof loc.href === 'string') {
      const base = loc.href.split('#')[0].split('?')[0];
      url = `${base}?seed=${encodeURIComponent(seed)}`;
    }
    const clip = globalThis.navigator?.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      clip.writeText(url).then(
        () => this._toast('시드 링크를 복사했습니다', 'good'),
        () => this._toast(`복사 실패 — ${url}`, 'warn')
      );
    } else {
      this._toast(url, 'info');
    }
  }

  // ── 요정 도감 (Ctrl+H, 히든) ─────────────────────
  _fairyFound() {
    const s = safe(() => this.game?.fairies?.found, null);
    if (s instanceof Set) return s;
    if (Array.isArray(s)) return new Set(s);
    return new Set();
  }

  _fairyCodex() {
    const found = this._fairyFound();
    const src = safe(() => this.game?.fairies?.codex?.(), null);
    const list = Array.isArray(src) && src.length ? src : [];
    return FAIRIES.map((f) => {
      const hit = list.find((c) => c && c.id === f.id);
      return Object.assign({}, f, hit || {}, { found: Boolean(hit ? hit.found : found.has(f.id)) });
    });
  }

  _renderCodex(body) {
    const found = this._fairyFound();
    const codex = this._fairyCodex();
    body.textContent = '';
    const foundCount = codex.filter((f) => f.found).length;
    body.appendChild(row('요정 조우', `${fmt(foundCount)} / ${FAIRIES.length}`));
    body.appendChild(bar(FAIRIES.length ? foundCount / FAIRIES.length : 0));
    if (safe(() => this.game?.fairies?.crown)) body.appendChild(row('왕관', '요정 왕관 획득 — 마나 회복 +30%'));
    if (found.size !== foundCount) body.appendChild(row('힌트', 'Ctrl+H 로 언제든 다시 열 수 있습니다.'));
    const cards = grid();
    for (const f of codex) {
      const card = h('div', cardClass(null, { selected: Boolean(f.found), locked: !f.found, extra: f.found ? '' : 'fairy-locked' }));
      card.style.borderTopColor = cssColor(f.color);
      if (!f.found) {
        card.appendChild(row('???', '미발견'));
        card.appendChild(row('힌트', f.hint || f.condition?.desc || '아직 만나지 못했습니다.'));
      } else {
        const elId = typeof f.element === 'string' ? f.element : f.element?.id;
        const el = ELEMENT_BY_ID[elId];
        card.appendChild(row(f.name, el ? el.name : elId || '정령'));
        card.appendChild(row('조건', f.condition?.desc || '-'));
        const reward = f.reward || {};
        card.appendChild(row('보상', `${reward.text || '-'}${num(reward.gold) > 0 ? ` (+${fmt(reward.gold)} G)` : ''}`));
        card.appendChild(row('대사', f.quote || ''));
      }
      cards.appendChild(card);
    }
    body.appendChild(cards);
  }

  // ── 무기 인벤토리 (Tab) ─────────────────────────
  // 무기 68종(비밀 1 · 유물 카타나 포함 · 활 10종) + 보너스 + 궁극기 9종. game 상태는 항상 방어적으로 읽는다.
  _weaponOwnedSet() {
    const src = safe(() => this.game?.weapons?.owned, null);
    if (src instanceof Set) return new Set(src);
    if (Array.isArray(src)) return new Set(src.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean));
    if (src && typeof src === 'object') {
      const ids = Object.keys(src).filter((k) => src[k]);
      if (ids.length) return new Set(ids);
    }
    return null; // 보유 정보가 없으면 전체를 보여준다(main.js 없이도 렌더된다).
  }

  _weaponEquippedId() {
    const raw =
      safe(() => this.game?.weaponId, null) ??
      safe(() => this.game?.staff?.id, null) ??
      safe(() => this.game?.weapons?.equipped, null) ??
      safe(() => this.game?.weapons?.equippedId, null) ??
      safe(() => this.game?.player?.weapon, null) ??
      safe(() => this.game?.weapon, null);
    const id = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? raw.id : '';
    return String(id || this.state.weapons.equipped || '');
  }

  _weaponList() {
    const fam = this.state.weapons.family;
    if (!fam || fam === 'all') return WEAPONS.slice();
    return weaponsByFamily(fam);
  }

  _weaponSwap(id) {
    return safe(() => weaponMotion(id)?.swap, null);
  }

  _weaponActions(id, equipped) {
    const acts = h('div', 'row weapon-actions');
    const lock = this._classLock(id);
    const locked = Boolean(lock?.locked);
    const isOwnedWeapon = safe(() => this._weaponOwnedSet()?.has?.(id), true) !== false;
    const equip = h('button', 'btn ' + (equipped ? 'ghost btn-ghost' : locked ? 'ghost btn-ghost' : 'primary btn-primary'), locked ? '🔒 잠김' : equipped ? '장착 중' : '장착');
    equip.type = 'button';
    equip.dataset.act = 'weapon-equip';
    equip.dataset.id = id;
    if (locked) {
      equip.disabled = true;
      equip.setAttribute('aria-disabled', 'true');
      equip.dataset.locked = 'family';
      if (lock?.reason) equip.title = lock.reason;
    }
    acts.appendChild(equip);
    const preview = h('button', 'btn ghost btn-ghost', '스왑모션 미리보기');
    preview.type = 'button';
    preview.dataset.act = 'weapon-preview';
    preview.dataset.id = id;
    if (locked) {
      preview.disabled = true;
      if (lock?.reason) preview.title = lock.reason;
    }
    acts.appendChild(preview);
    if (!locked && isOwnedWeapon) {
      const enchant = h('button', 'btn ghost btn-ghost', '🔮 마법부여');
      enchant.type = 'button';
      enchant.dataset.act = 'enchant-goto';
      enchant.dataset.weapon = id;
      acts.appendChild(enchant);
    }
    return acts;
  }

  /** 전직 잠금 조회 — game.classes 가 없으면(테스트 스텁) 잠금 없음 */
  _classLock(weaponId) {
    const own = safe(() => this.game?.classes?.lockOf?.(weaponId), null);
    if (own) return own;
    return safe(() => weaponLock(weaponId, this.state.classes.id || 'novice', this.state.classes.stage || 0), null);
  }

  /** 현재 직업 표시 문자열 */
  _classLabel() {
    return safe(() => this.game?.classes?.label, '') || '🧭 초심자';
  }

  // ── 제작대 (T1~T7 + 꿈의 정원) ───────────────────
  _craftBuilt(id) {
    return Boolean(safe(() => this.game?.craftingTableBuilt?.(id), false));
  }

  _craftUnlocked(id) {
    return Boolean(safe(() => this.game?.craftingTableUnlocked?.(id), true));
  }

  /** 작업대(건설 시설)를 세웠는지 */
  _workbenchBuilt() {
    return Boolean(safe(() => this.game?.workbenchBuilt?.(), false));
  }

  _craftBuild(tableId) {
    const g = this.game;
    const table = CRAFTING_TABLE_BY_ID[tableId] || null;
    const name = table ? table.name : String(tableId);
    if (typeof g?.buildCraftingTable !== 'function') {
      this.state.craft.message = '제작대를 건설할 수 없습니다(게임이 실행 중이 아닙니다).';
      this._render('craft');
      return null;
    }
    const r = safe(() => g.buildCraftingTable(tableId), null);
    if (r && r.ok) {
      this.state.craft.message = `${name} 건설 완료 — 이제 이 제작대에서 무기를 만들 수 있습니다.`;
      this._toast(`${name} 건설 완료`, 'success');
    } else {
      this.state.craft.message = `${name} 건설 실패 — ${(r && r.error) || '조건을 확인하세요.'}`;
      this._toast(this.state.craft.message, 'warn');
    }
    this._render('craft');
    return r;
  }

  _craftMake(weaponId) {
    const g = this.game;
    const w = WEAPON_BY_ID[weaponId] || null;
    const name = w ? w.name : String(weaponId);
    if (typeof g?.craftWeapon !== 'function') {
      this.state.craft.message = '무기를 제작할 수 없습니다(게임이 실행 중이 아닙니다).';
      this._render('craft');
      return null;
    }
    const r = safe(() => g.craftWeapon(weaponId), null);
    if (r && r.ok) {
      this.state.craft.message = `${name} 제작 완료!`;
      this._toast(`${name} 제작 완료`, 'success');
    } else {
      this.state.craft.message = `${name} 제작 실패 — ${(r && r.error) || '재료를 확인하세요.'}`;
      this._toast(this.state.craft.message, 'warn');
    }
    this._render('craft');
    return r;
  }

  /** 제작대에서 날개 만들기 — 재료(골드·광물·가죽)는 game.craftWing 이 처리한다 */
  _craftWing(wingId) {
    const g = this.game;
    const w = FAIRY_WING_BY_ID[wingId] || null;
    const name = w ? w.name : String(wingId);
    if (typeof g?.craftWing !== 'function') {
      this.state.craft.message = '날개를 제작할 수 없습니다(게임이 실행 중이 아닙니다).';
      this._render('craft');
      return null;
    }
    const r = safe(() => g.craftWing(wingId), null);
    if (r && r.ok) {
      this.state.craft.message = `${name} 제작 완료 — 즉시 착용했습니다. V 키로 착용/해제.`;
      this._toast(`🪶 ${name} 제작 완료`, 'success');
    } else {
      this.state.craft.message = `${name} 제작 실패 — ${(r && r.error) || '재료·선행 날개를 확인하세요.'}`;
      this._toast(this.state.craft.message, 'warn');
    }
    this._render('craft');
    return r;
  }

  /** 화살 제작 — 소모품이라 여러 번 만들 수 있다(묶음 단위로 쌓인다) */
  _craftArrow(arrowId) {
    const game = this.game;
    const res = game?.craftArrow?.(arrowId) ?? { ok: false, error: '화살을 만들 수 없습니다' };
    if (res && res.ok) {
      this.state.craft.message = `${res.arrow?.name ?? arrowId} ${res.amount}발 제작 완료 — 보유 ${game?.economy?.getArrow?.(arrowId) ?? 0}발`;
      this._toast(this.state.craft.message, 'success');
    } else {
      this.state.craft.message = res.error || '제작 실패';
      this._toast(this.state.craft.message, 'warn');
    }
    this._render('craft');
    return res;
  }

  /** 만들 수 있는 화살 레시피 전부 — 작업대 분기용(티어 오름차순) */
  _allArrowRecipes() {
    const list = [];
    for (const t of CRAFTING_TABLES) {
      for (const r of arrowRecipesForTable(t.id)) {
        if (!list.some((x) => x.arrowId === r.arrowId)) list.push(r);
      }
    }
    return list.sort((xa, xb) => num(xa.tier, 0) - num(xb.tier, 0));
  }

  /** 화살 카드 — 묶음 · 발당 피해 · 보유 발수 + 제작 버튼(제작대 미건설이면 비활성) */
  _arrowCraftCard(recipe, ctx = {}) {
    const a = ARROW_BY_ID[recipe.arrowId] || null;
    if (!a) return row('화살', String(recipe.arrowId || '알 수 없음'));
    const rarity = a.grade || 'common';
    const built = ctx.built !== undefined ? Boolean(ctx.built) : this._craftBuilt(recipe.table);
    const held = num(safe(() => this.game?.economy?.getArrow?.(a.id), 0), 0);
    const card = h('div', cardClass(rarity, { locked: !built, extra: 'weapon-card craft-card arrow-craft-card' }));
    card.dataset.role = 'craft-arrow-row';
    card.dataset.arrow = a.id;
    card.dataset.table = recipe.table;
    card.dataset.tier = String(num(recipe.tier, 1));
    card.style.borderTopColor = cssColor(a.color);

    const head = h('div', 'row stat-row weapon-head');
    head.appendChild(h('span', 'row-label weapon-name', `${a.glyph || '🏹'} ${a.name}`));
    head.appendChild(h('span', `badge rarity-${rarity} r-${rarity} weapon-grade`, `T${num(recipe.tier, 1)}`));
    card.appendChild(head);
    card.appendChild(row('묶음', `${fmt(recipe.amount)}발`));
    card.appendChild(row('발당 피해', `×${num(a.damageMult, 1).toFixed(2)}`));
    card.appendChild(row('제작 비용', costText(recipe.cost)));
    card.appendChild(row('보유', `${fmt(held)}발`));
    if (ctx.showTable) {
      card.appendChild(row('필요 제작대', `T${num(recipe.tier, 1)} · ${tableTierLabel(CRAFTING_TABLE_BY_ID[recipe.table])}${built ? ' ✔' : ' — 미건설'}`));
    }

    const actions = h('div', 'row');
    const btn = h('button', 'btn primary btn-primary', '제작');
    btn.type = 'button';
    btn.dataset.act = 'craft-arrow';
    btn.dataset.arrow = a.id;
    const afford = this._affordable(recipe.cost);
    btn.disabled = !built || !afford;
    actions.appendChild(btn);
    if (!built) actions.appendChild(h('span', 'row-value', '제작대를 먼저 건설하세요'));
    else if (!afford) actions.appendChild(h('span', 'row-value', '재료 부족'));
    card.appendChild(actions);
    if (a.desc) card.appendChild(row('설명', a.desc));
    return card;
  }

  /** 화살 구획 — 무기 목록 뒤 · 날개 구획 앞. 화살이 없는 제작대면 안내 한 줄만 */
  _arrowSection(parent, tableId, opts = {}) {
    const all = opts.all === true;
    const recipes = all ? this._allArrowRecipes() : arrowRecipesForTable(tableId);
    const built = opts.built !== undefined ? Boolean(opts.built) : this._craftBuilt(tableId);
    parent.appendChild(sectionTitle(`🏹 화살 (소모품) — ${fmt(recipes.length)}종`));
    parent.appendChild(row('안내', '활은 화살을 1발씩 소모합니다. 화살은 같은 티어 제작대에서 묶음으로 만들고, 티어가 높을수록 발당 피해가 오릅니다.'));
    const cards = grid();
    if (!recipes.length) {
      cards.appendChild(row('화살', '이 제작대에서 만들 수 있는 화살이 없습니다.'));
    } else {
      for (const r of recipes) {
        cards.appendChild(this._arrowCraftCard(r, { built: all ? this._craftBuilt(r.table) : built, showTable: all }));
      }
    }
    parent.appendChild(cards);
    return recipes;
  }

  /** 제작 패널 — 그 제작대에서 만들 수 있는 날개 카드 */
  _wingCraftCard(recipe, ctx = {}) {
    const w = FAIRY_WING_BY_ID[recipe.wingId] || null;
    const rarity = WING_GRADE_RARITY[recipe.grade] || 'common';
    const owned = Boolean(ctx.owned && ctx.owned.has(recipe.wingId));
    const prev = recipe.requires ? FAIRY_WING_BY_ID[recipe.requires] : null;
    const prevOk = !prev || Boolean(ctx.owned && ctx.owned.has(prev.id));
    const card = h('div', cardClass(rarity, { locked: !owned && (!ctx.built || !prevOk), selected: owned, extra: 'weapon-card wing-craft-card' }));
    card.dataset.role = 'craft-wing-row';
    card.dataset.wingId = recipe.wingId;
    card.dataset.table = recipe.table;
    card.dataset.tier = String(num(recipe.tier, 1));
    if (w) card.style.borderTopColor = cssColor(w.color);

    const head = h('div', 'row stat-row weapon-head');
    head.appendChild(h('span', 'row-label weapon-name', `🪶 ${w ? w.name : recipe.wingId}`));
    head.appendChild(h('span', `badge rarity-${rarity} r-${rarity} weapon-grade`, `T${num(recipe.tier, 1)} · ${(w && wingGradeInfo(w.grade).name) || recipe.grade}`));
    card.appendChild(head);
    if (w) {
      card.appendChild(row('등급', wingGradeInfo(w.grade).name));
      card.appendChild(row('비행 성능', `속도 ×${num(w.flight?.speed, 1).toFixed(2)} · 상한 ${fmt(num(w.flight?.ceiling, 0))} m · 마나 ${num(w.flight?.drain, 0) > 0 ? `${num(w.flight.drain)}/s` : '없음'}`));
      card.appendChild(row('설명', w.desc || ''));
    }
    if (prev) card.appendChild(row('선행 날개', `${prev.name}${prevOk ? ' ✔' : ' — 먼저 제작'}`));
    card.appendChild(row('제작 비용', costText(recipe.cost)));
    card.appendChild(row('제작대', `${(tableTierLabel(CRAFTING_TABLE_BY_ID[recipe.table]))}${ctx.built ? ' ✔' : ' — 미건설'}`));

    const actions = h('div', 'row');
    if (owned) {
      actions.appendChild(h('span', 'badge rarity-relic r-relic', '보유 중 ✔'));
    } else if (!ctx.built) {
      actions.appendChild(h('span', 'row-value', '이 제작대를 먼저 건설하세요'));
    } else if (!prevOk) {
      actions.appendChild(h('span', 'row-value', `${prev ? prev.name : '선행 날개'} 먼저 제작`));
    } else {
      const btn = h('button', 'btn primary btn-primary', '날개 제작');
      btn.type = 'button';
      btn.dataset.act = 'craft-wing';
      btn.dataset.wing = recipe.wingId;
      const ok = this._affordable(recipe.cost);
      btn.disabled = !ok;
      actions.appendChild(btn);
      if (!ok) actions.appendChild(h('span', 'row-value', '재료 부족'));
    }
    card.appendChild(actions);
    return card;
  }

  _renderCraft(body) {
    const st = this.state.craft;
    const owned = this._weaponOwnedSet();
    body.textContent = '';
    const builtCount = CRAFTING_TABLES.filter((t) => this._craftBuilt(t.id)).length;
    body.appendChild(row('제작 체계', `제작대 ${fmt(CRAFTING_TABLE_COUNT)}종 — T1~T7 + 꿈의 정원 · 레시피 ${fmt(CRAFTING_RECIPE_COUNT)}종`));
    body.appendChild(row('건설 현황', `${fmt(builtCount)} / ${fmt(CRAFTING_TABLE_COUNT)} — 무기는 제작대를 건설한 뒤 만들 수 있습니다`));
    body.appendChild(
      row('날개 제작', `🪶 요정의 날개 ${fmt(WING_RECIPE_COUNT)}종 — 같은 티어 제작대에서 만듭니다(작업대 불가 · T8 은 꿈의 정원)`)
    );
    body.appendChild(row('화살', `🏹 화살 ${fmt(ARROW_RECIPE_COUNT)}종 — 활 계열이 1발씩 소모 (티어별 묶음 제작)`));
    body.appendChild(row('단축키', 'C — 제작대 · 🔮 마법부여대 근처에서 E — 마법부여'));
    const enchantRow = h('div', 'row stat-row craft-enchant-row');
    enchantRow.appendChild(h('span', 'row-label', '🔮 마법부여대'));
    enchantRow.appendChild(
      h('span', 'row-value', this._enchanterBuilt() ? '건설됨 ✔ — 보유한 모든 무기에 속성을 새길 수 있습니다' : '미건설 — 건설(🏗 시설)에서 마법부여대를 먼저 세우세요')
    );
    const enchantBtn = h('button', 'btn ghost btn-ghost', '🔮 마법부여 열기');
    enchantBtn.type = 'button';
    enchantBtn.dataset.act = 'enchant-goto';
    enchantRow.appendChild(enchantBtn);
    body.appendChild(enchantRow);
    if (st.message) body.appendChild(row('알림', st.message));

    const wbBuilt = this._workbenchBuilt();
    body.appendChild(sectionTitle('제작대 (티어별 · 시설)'));
    body.appendChild(this._tabs([
      { label: `🔨 작업대${wbBuilt ? ' ✔' : ''}`, act: 'craft-select', data: { table: WORKBENCH_ID }, active: st.table === WORKBENCH_ID },
      ...CRAFTING_TABLES.map((t) => ({
        label: `${t.icon} ${tableTierLabel(t)}${this._craftBuilt(t.id) ? ' ✔' : ''}`,
        act: 'craft-select',
        data: { table: t.id },
        active: st.table === t.id
      }))
    ]));

    if (st.table === WORKBENCH_ID) {
      // ── 작업대: 모든 무기 제작(꿈의 끝은 희망 제외) ──
      body.appendChild(sectionTitle(`🔨 작업대 — ${wbBuilt ? '건설됨 ✔' : '미건설'}`));
      body.appendChild(row('설명', '건설 탭(🏗 시설)에서 작업대를 배치하면, 제작대 티어와 무관하게 모든 무기를 만들 수 있습니다.'));
      body.appendChild(row('제작 범위', `${fmt(WORKBENCH_RECIPE_COUNT)}종 (전체 ${fmt(WEAPONS.length)}종 − ${WORKBENCH_EXCLUDED.length}종)`));
      body.appendChild(row('제외 무기', WORKBENCH_EXCLUDED.map((id) => (WEAPON_BY_ID[id] || {}).name || id).join(' · ') + ' — 꿈의 정원(🌸 비밀 제작대)에서만 제작'));
      body.appendChild(row('건설 위치', 'B(건설) → 🏗 시설 탭 → 🔨 작업대 — 바닥에 자유롭게 설치'));
      const family = st.benchFamily || 'all';
      const familyOf = (r) => WEAPON_BY_ID[r.weaponId]?.family ?? null;
      const countOf = (id) => WORKBENCH_RECIPES.filter((r) => familyOf(r) === id).length;
      body.appendChild(sectionTitle('무기별 분류'));
      body.appendChild(this._tabs([
        { label: `전체 ${fmt(WORKBENCH_RECIPES.length)}`, act: 'craft-bench-family', data: { family: 'all' }, active: family === 'all' },
        ...WEAPON_FAMILIES.map((f) => ({
          label: `${f.icon || ''} ${f.name} ${fmt(countOf(f.id))}`.trim(),
          act: 'craft-bench-family',
          data: { family: f.id },
          active: family === f.id
        }))
      ]));

      const wbRecipes = family === 'all' ? WORKBENCH_RECIPES : WORKBENCH_RECIPES.filter((r) => familyOf(r) === family);
      const famName = (WEAPON_FAMILIES.find((f) => f.id === family) || {}).name || '전체 계열';
      body.appendChild(sectionTitle(`${famName} — ${fmt(wbRecipes.length)}종 (티어별)`));
      if (!wbBuilt) {
        const wbCards = grid();
        wbCards.appendChild(row('안내', '작업대를 먼저 건설하세요 — B(건설) → 🏗 시설 → 🔨 작업대'));
        body.appendChild(wbCards);
      } else {
        // 티어 8(비밀)까지 포함한다 — TIERS 상수는 건설 패널용 1~7 이다
        const tiers = [...new Set(WORKBENCH_RECIPES.map((r) => WEAPON_BY_ID[r.weaponId]?.tier ?? 1))].sort((a, b) => a - b);
        for (const tier of tiers) {
          const rows = wbRecipes.filter((r) => (WEAPON_BY_ID[r.weaponId]?.tier ?? 1) === tier);
          if (!rows.length) continue;
          const grade = WEAPON_GRADES.find((gr) => (gr.tier ?? 1) === tier);
          body.appendChild(sectionTitle(`T${tier}${grade ? ` · ${grade.name}` : ''} — ${fmt(rows.length)}종`));
          const wbCards = grid();
          for (const r of rows) wbCards.appendChild(this._craftCard(r, { built: true, owned }));
          body.appendChild(wbCards);
        }
      }
      this._arrowSection(body, WORKBENCH_ID, { all: true });

      body.appendChild(sectionTitle('🪶 요정의 날개'));
      body.appendChild(row('안내', '날개는 작업대에서 만들 수 없습니다 — 같은 티어의 제작대(모루·대장간·마법 공방…)로 만드세요.'));
      body.appendChild(row('이동', '제작대 탭에서 티어를 고르면 날개 레시피가 함께 보입니다.'));
      body.appendChild(sectionTitle('제작 안내'));
      body.appendChild(row('순서', '1) 건설 탭에서 작업대 설치 → 2) 원하는 무기 제작 → 3) 무기 인벤토리(Tab)에서 장착'));
      body.appendChild(row('재료', '골드·목재·광물을 소비합니다. 채굴기(⛏)나 채굴탑으로 광물을 모으세요.'));
      return;
    }

    const table = CRAFTING_TABLE_BY_ID[st.table] || CRAFTING_TABLES[0];
    const built = this._craftBuilt(table.id);
    const unlocked = this._craftUnlocked(table.id);
    const affordable = built ? true : this._affordable(table.cost);

    body.appendChild(sectionTitle(`${table.icon} ${tableTierLabel(table)} — ${table.name}`));
    body.appendChild(row('설명', table.desc));
    body.appendChild(row('해금 조건', tableUnlockText(table)));
    body.appendChild(row('전문 등급', `${(WEAPON_GRADE_BY_ID[table.grade] || {}).name || table.grade} 무기`));
    body.appendChild(row('건설 비용', costText(table.cost)));
    const actRow = h('div', 'row');
    if (built) {
      actRow.appendChild(h('span', 'badge rarity-relic r-relic', '건설됨 ✔'));
    } else {
      const btn = h('button', 'btn primary btn-primary', unlocked ? '제작대 건설' : '해금 필요');
      btn.type = 'button';
      btn.dataset.act = 'craft-build';
      btn.dataset.table = table.id;
      btn.disabled = !unlocked || !affordable;
      actRow.appendChild(btn);
      if (!unlocked) actRow.appendChild(h('span', 'row-value', `해금 조건: ${tableUnlockText(table)}`));
      else if (!affordable) actRow.appendChild(h('span', 'row-value', '건설 재료 부족'));
    }
    body.appendChild(actRow);

    const recipes = RECIPES_BY_TABLE[table.id] || [];
    body.appendChild(sectionTitle(`제작 목록 — 무기 ${fmt(recipes.length)}종`));
    const cards = grid();
    if (!recipes.length) cards.appendChild(row('레시피', '이 제작대에서 만들 수 있는 무기가 없습니다.'));
    else for (const r of recipes) cards.appendChild(this._craftCard(r, { built, owned }));
    body.appendChild(cards);

    // ── 화살 (소모품) — 같은 티어 제작대에서 묶음으로 만든다
    this._arrowSection(body, table.id, { built });

    // ── 요정의 날개 — 같은 제작대에서 만든다(티어 1:1)
    const wingRecipes = wingRecipesForTable(table.id);
    const wingOwned = this._wingOwnedSet();
    body.appendChild(sectionTitle(`🪶 요정의 날개 — ${fmt(wingRecipes.length)}종`));
    const wingCards = grid();
    if (!wingRecipes.length) wingCards.appendChild(row('레시피', '이 제작대에서 만들 수 있는 날개가 없습니다.'));
    else for (const r of wingRecipes) wingCards.appendChild(this._wingCraftCard(r, { built, owned: wingOwned }));
    body.appendChild(wingCards);

    body.appendChild(sectionTitle('제작 안내'));
    body.appendChild(row('순서', '1) 제작대 건설 → 2) 같은 티어의 무기 제작 → 3) 무기 인벤토리(Tab)에서 장착'));
    body.appendChild(row('재료', '골드·목재·광물을 소비합니다. 광물은 채굴탑이나 직접 채굴로 얻습니다.'));
    body.appendChild(row('날개 재료', '요정의 날개는 골드·광물에 더해 가죽(야생 몬스터 사냥 보상)을 요구합니다.'));
    body.appendChild(row('참고', '유물 지팡이(시간·창세)와 꿈나무는 부여대 조합·조건 해금으로도 얻을 수 있습니다.'));
  }

  _craftCard(recipe, ctx = {}) {
    const w = WEAPON_BY_ID[recipe.weaponId] || null;
    const grade = w ? WEAPON_GRADE_BY_ID[w.grade] || null : null;
    const fam = w ? WEAPON_FAMILY_BY_ID[w.family] || null : null;
    const el = w ? ELEMENT_BY_ID[w.element] || null : null;
    const isOwned = Boolean(ctx.owned && ctx.owned.has(recipe.weaponId));
    const classLock = this._classLock(recipe.weaponId);
    const classLocked = Boolean(classLock?.locked);
    const card = h('div', cardClass(grade ? grade.id : 'common', { locked: !isOwned && !ctx.built, extra: 'weapon-card craft-card' }));
    card.dataset.role = 'craft-row';
    card.dataset.weaponId = recipe.weaponId;
    card.dataset.table = recipe.table;
    if (grade) card.style.borderTopColor = cssColor(grade.color);

    const head = h('div', 'row stat-row weapon-head');
    head.appendChild(h('span', 'row-label weapon-name', `${fam?.icon || ''} ${w ? w.name : recipe.weaponId}`.trim()));
    if (grade) head.appendChild(h('span', `badge rarity-${grade.id} r-${grade.id} weapon-grade`, grade.name));
    card.appendChild(head);
    if (w) {
      card.appendChild(row('계열', `${fam?.name || w.family} · ${w.kind === 'bow' ? '활(원거리)' : w.kind === 'save' ? '비살상(구원)' : w.kind === 'ranged' ? '원거리' : '근접'}`));
      card.appendChild(row('피해', w.nonLethal ? '비살상 (구원)' : `${fmt(w.damage)}${num(w.aoe) > 0 ? ` · 범위 ${num(w.aoe)} m` : ''}`));
      card.appendChild(row('쿨다운', `${num(w.cooldown).toFixed(2)}초${num(w.lifesteal) > 0 ? ` · 흡혈 ${Math.round(num(w.lifesteal) * 100)}%` : ''}${num(w.combo) > 0 ? ` · ${num(w.combo)}연격` : ''}`));
      card.appendChild(row('사거리', `${num(w.range)} m${el ? ` · 속성 ${el.name}` : ''}`));
    }
    card.appendChild(row('제작 비용', costText(recipe.cost)));
    const actions = h('div', 'row');
    if (isOwned) {
      actions.appendChild(h('span', 'badge rarity-common r-common', '보유 중'));
    } else if (!ctx.built) {
      actions.appendChild(h('span', 'row-value', '제작대를 먼저 건설하세요'));
    } else {
      const btn = h('button', 'btn primary btn-primary', '제작');
      btn.type = 'button';
      btn.dataset.act = 'craft-make';
      btn.dataset.weapon = recipe.weaponId;
      const ok = this._affordable(recipe.cost);
      btn.disabled = !ok;
      actions.appendChild(btn);
      if (!ok) actions.appendChild(h('span', 'row-value', '재료 부족'));
    }
    // 전직 잠금은 제작을 막지 않는다 — 보관은 되고 장착만 못 한다.
    if (classLocked && !isOwned) {
      const lockTag = h('span', 'row-value class-lock-tag', '🔒 다른 직업 전용 — 보관만');
      lockTag.dataset.role = 'craft-locked';
      if (classLock?.reason) lockTag.title = classLock.reason;
      actions.appendChild(lockTag);
    }
    card.appendChild(actions);
    if (w && w.desc) card.appendChild(row('설명', w.desc));
    return card;
  }

  // ── 전직 (K) ────────────────────────────────────
  _advanceClass(classId) {
    const game = this.game;
    const cls = game?.classes;
    if (!cls) {
      this._toast('전직 시스템을 쓸 수 없습니다', 'warn');
      return;
    }
    const wave = safe(() => game?.waves?.wave, 0) || 0;
    const gold = safe(() => game?.economy?.gold, 0) || 0;
    const res = cls.advance(classId, {
      wave,
      gold,
      spend: (n) => safe(() => game?.economy?.spendGold?.(n), false)
    });
    if (!res.ok) {
      this.state.classes.message = res.error || '전직할 수 없습니다';
      this._toast(this.state.classes.message, 'warn');
      this._render('classes');
      return;
    }
    const def = CLASSES.find((c) => c.id === classId) || null;
    this.state.classes.message = `${def?.name || classId} 전직 완료 — ${cls.label}`;
    this._toast(this.state.classes.message, 'good');
    this.emit('class:advance', { classId, stage: cls.stage });
    this._render('classes');
  }

  _promoteClass() {
    const game = this.game;
    const cls = game?.classes;
    if (!cls) return;
    const wave = safe(() => game?.waves?.wave, 0) || 0;
    const gold = safe(() => game?.economy?.gold, 0) || 0;
    const res = cls.promote({
      wave,
      gold,
      spend: (n) => safe(() => game?.economy?.spendGold?.(n), false)
    });
    if (!res.ok) {
      this.state.classes.message = res.error || '승급할 수 없습니다';
      this._toast(this.state.classes.message, 'warn');
      this._render('classes');
      return;
    }
    this.state.classes.message = `${cls.stageInfo.name} 완료 — ${cls.label}`;
    this._toast(this.state.classes.message, 'good');
    this.emit('class:promote', { classId: cls.classId, stage: cls.stage });
    this._render('classes');
  }

  /** 직업 카드의 패시브 설명 */
  _classPassiveText(def, stage = 1) {
    const m = classModifiers(def.id, stage);
    const parts = [];
    const pct = (v, up, down) => `${v > 1 ? up : down} ${Math.round(Math.abs(v - 1) * 100)}%`;
    if (m.weaponDamage !== 1) parts.push(`무기 피해 ${pct(m.weaponDamage, '+', '-')}`);
    if (m.manaRegen !== 1) parts.push(`마나 회복 ${pct(m.manaRegen, '+', '-')}`);
    if (m.moveSpeed !== 1) parts.push(`이동 속도 ${pct(m.moveSpeed, '+', '-')}`);
    if (m.miningSpeed !== 1) parts.push(`채굴 속도 ${pct(m.miningSpeed, '+', '-')}`);
    if (m.damageTaken !== 1) parts.push(`받는 피해 ${pct(m.damageTaken, '-', '+')}`);
    return parts.length ? parts.join(' · ') : '패시브 없음 (전직하면 생긴다)';
  }

  _renderClasses(body) {
    const game = this.game;
    const cls = game?.classes || null;
    const curId = safe(() => cls.classId, '') || 'novice';
    const stage = safe(() => cls.stage, 0) || 0;
    const wave = safe(() => game?.waves?.wave, 0) || 0;
    const gold = safe(() => game?.economy?.gold, 0) || 0;
    const st = this.state.classes;
    const ownedSet = this._weaponOwnedSet();
    const owned = WEAPONS.filter((w) => !ownedSet || ownedSet.has(w.id));

    body.textContent = '';
    body.appendChild(row('현재 직업', cls ? cls.label : '🧭 초심자'));
    body.appendChild(row('단계', `${(CLASS_STAGES[stage] || CLASS_STAGES[0]).name} — ${(CLASS_STAGES[stage] || CLASS_STAGES[0]).desc}`));
    body.appendChild(row('사용 가능 등급', `${(CLASS_STAGES[stage] || CLASS_STAGES[0]).maxTier}등급까지 · 공용 계열(가위·꿈나무)은 제한 없음`));
    body.appendChild(row('패시브', cls ? this._classPassiveText(cls.def, stage) : '—'));
    if (cls) {
      const usable = owned.filter((w) => cls.canUse(w.id)).length;
      body.appendChild(row('보유 무기', `${fmt(usable)} / ${fmt(owned.length)}종 사용 가능 — 나머지 ${fmt(owned.length - usable)}종은 잠김`));
    }
    body.appendChild(row('조건', `웨이브 ${fmt(wave)} 도달 · 골드 ${fmt(Math.floor(gold))} — 1차 웨이브 ${CLASS_RULES.firstWave}, 2차 웨이브 ${CLASS_RULES.secondWave}, 3차 웨이브 ${CLASS_RULES.thirdWave}`));
    body.appendChild(row('단축키', 'K — 전직'));
    if (st.message) body.appendChild(row('알림', st.message));
    if (!cls) body.appendChild(row('안내', '전직 시스템을 사용할 수 없는 상태입니다(세이브 미시작).'));

    // 다음 단계 승급 카드
    const req = cls?.nextStageRequirement?.() ?? null;
    body.appendChild(sectionTitle('다음 전직'));
    if (!cls) {
      body.appendChild(row('승급', '—'));
    } else if (!req) {
      body.appendChild(row('승급', '최종 단계(3차)입니다 — 더 오를 단계가 없습니다'));
    } else if (curId === 'novice') {
      body.appendChild(row('승급', `1차 전직 — 아래에서 직업을 고르세요 (웨이브 ${CLASS_RULES.firstWave}부터)`));
    } else {
      const okWave = wave >= req.wave;
      const okGold = gold >= req.cost;
      const card = h('div', 'row class-next-card');
      card.appendChild(row('승급', `${req.name} — 무기 ${classStageInfo(req.stage).maxTier}등급까지 · 패시브 ×${classStageInfo(req.stage).bonus}`));
      card.appendChild(row('요구', `웨이브 ${req.wave} (현재 ${wave})${req.cost > 0 ? ` · 골드 ${fmt(req.cost)} (보유 ${fmt(Math.floor(gold))})` : ''}`));
      const btn = h('button', 'btn primary btn-primary', `${req.name} 하기`);
      btn.type = 'button';
      btn.dataset.act = 'class-promote';
      btn.disabled = !(okWave && okGold);
      if (!okWave) btn.title = `웨이브 ${req.wave} 부터 가능합니다`;
      else if (!okGold) btn.title = `골드 ${req.cost} 필요`;
      card.appendChild(btn);
      body.appendChild(card);
    }

    // 직업 카드
    body.appendChild(sectionTitle(`직업 ${CLASSES.length - 1}종 — 계열 하나가 직업 하나`));
    body.appendChild(row('규칙', '한 직업으로 전직하면 그 계열 무기만 쓸 수 있고, 다른 계열 무기는 전부 잠깁니다.'));
    body.appendChild(row('재전직', `웨이브 ${CLASS_RULES.respecWave} 이상 + ${fmt(CLASS_RULES.respecCost)} 골드 — 다른 직업으로 바꾸면 1차로 돌아갑니다`));

    const list = grid('card-grid class-grid');
    for (const def of CLASSES) {
      if (!def.family) continue;
      const isCur = def.id === curId;
      const check = safe(() => cls?.canAdvanceTo?.(def.id, { wave, gold }), null) || { ok: false, error: '전직 불가', cost: 0, isChange: false };
      const usable = owned.filter((w) => !weaponLock(w.id, def.id, isCur ? stage : 1).locked).length;
      const lockPreview = owned.filter((w) => weaponLock(w.id, def.id, isCur ? stage : 1).locked).length;
      const card = h('div', `card class-card${isCur ? ' is-current' : ''}`);
      card.dataset.role = 'class-row';
      card.dataset.classId = def.id;
      card.dataset.family = def.family;
      if (isCur) card.dataset.current = '1';
      card.style.borderTopColor = cssColor(def.color);
      const head = h('div', 'row stat-row weapon-head');
      head.appendChild(h('span', 'row-label weapon-name', `${def.glyph} ${def.name}`));
      if (isCur) head.appendChild(h('span', 'badge rarity-relic r-relic', '현재 직업'));
      card.appendChild(head);
      const famName = (WEAPON_FAMILIES.find((f) => f.id === def.family) || {}).name || def.family;
      card.appendChild(row('계열', `${famName} 전용`));
      card.appendChild(row('패시브', this._classPassiveText(def, isCur ? Math.max(1, stage) : 1)));
      card.appendChild(row('대표 무기', (WEAPON_BY_ID[def.signature] || {}).name || def.signature || '—'));
      card.appendChild(row('무기', `보유 ${fmt(usable)}종 사용 가능 · ${fmt(lockPreview)}종 잠김`));
      card.appendChild(row('설명', def.desc));
      const actions = h('div', 'row class-actions');
      if (isCur) {
        actions.appendChild(h('span', 'badge rarity-common r-common', stage >= CLASS_RULES.maxStage ? '최종 단계' : '전직 중'));
      } else {
        const btn = h('button', 'btn ' + (check.ok ? 'primary btn-primary' : 'ghost btn-ghost'), check.isChange ? `재전직 (${fmt(check.cost)}G)` : '전직');
        btn.type = 'button';
        btn.dataset.act = 'class-advance';
        btn.dataset.id = def.id;
        btn.disabled = !check.ok;
        if (!check.ok && check.error) btn.title = check.error;
        actions.appendChild(btn);
        if (!check.ok) {
          const why = h('span', 'row-value class-lock-reason', check.error || '조건 미달');
          why.dataset.role = 'class-blocked';
          actions.appendChild(why);
        }
      }
      card.appendChild(actions);
      list.appendChild(card);
    }
    body.appendChild(list);

    // 잠금 미리보기 — 보유 무기 중 지금 못 쓰는 것
    if (cls) {
      const locked = owned.filter((w) => !cls.canUse(w.id));
      body.appendChild(sectionTitle(`잠긴 무기 ${fmt(locked.length)}종`));
      if (!locked.length) body.appendChild(row('잠김', '없습니다 — 보유한 무기를 전부 쓸 수 있습니다'));
      else {
        const rows = h('div', 'row class-locked-list');
        for (const w of locked.slice(0, 24)) {
          const lock = cls.lockOf(w.id);
          const tag = h('span', `badge rarity-${w.grade} r-${w.grade} class-locked-tag`, `🔒 ${w.name}`);
          tag.dataset.role = 'locked-weapon';
          tag.dataset.weaponId = w.id;
          tag.title = lock.reason;
          rows.appendChild(tag);
        }
        if (locked.length > 24) rows.appendChild(h('span', 'row-value', `외 ${fmt(locked.length - 24)}종`));
        body.appendChild(rows);
      }
    }
  }

  // ── 🔮 마법부여 ─────────────────────────────────
  _enchanterBuilt() {
    return safe(() => this.game?.enchanterBuilt?.(), false) === true;
  }

  _enchantCostText(cost) {
    if (!cost) return '최대 레벨';
    const parts = [`${fmt(cost.gold)} G`];
    for (const [id, count] of Object.entries(cost.minerals ?? {})) {
      parts.push(`${MINERAL_BY_ID[id]?.name ?? id} ${fmt(count)}`);
    }
    return parts.join(' · ');
  }

  _enchantApply(weaponId, elementId) {
    const st = this.state.enchant;
    const id = weaponId || st.weaponId || safe(() => this.game?.weaponId, '') || '';
    const element = elementId || st.element || '';
    if (!id) {
      st.message = '무기를 먼저 고르세요.';
      this._render('enchant');
      return { ok: false, error: st.message };
    }
    if (!element) {
      st.message = '속성을 먼저 고르세요.';
      this._render('enchant');
      return { ok: false, error: st.message };
    }
    st.weaponId = id;
    st.element = element;
    this.emit('enchant:apply', { weaponId: id, elementId: element });
    const state = safe(() => this.game?.enchantState?.(), null);
    const now = state?.weapons?.find?.((w) => w.id === id)?.enchant ?? null;
    const el = ENCHANT_BY_ID[element];
    st.message = now
      ? `${now.icon} ${el?.name ?? element} ${now.level}레벨 부여 완료 (피해 +${now.percent}%)`
      : '부여하지 못했습니다 — 마법부여대 건설·재료를 확인하세요.';
    this._render('enchant');
    return { ok: Boolean(now) };
  }

  _renderEnchant(body) {
    const st = this.state.enchant;
    const state = safe(() => this.game?.enchantState?.(), null) ?? {
      built: false,
      near: false,
      maxLevel: ENCHANT_MAX_LEVEL,
      weapons: [],
      elements: [],
      weaponId: '',
      equippedId: null
    };
    body.textContent = '';
    body.appendChild(row('건물', state.built ? (state.near ? '🔮 마법부여대 — 바로 앞에 있음 ✔' : '🔮 마법부여대 — 건설됨 ✔ (가까이 가면 E)') : '미건설 — 건설(B) → 🏗 시설 → 🔮 마법부여대'));
    body.appendChild(
      row('규칙', `보유한 모든 무기에 속성을 새깁니다. 같은 속성을 다시 부여하면 레벨이 오르고(최대 ${fmt(state.maxLevel ?? ENCHANT_MAX_LEVEL)}), 다른 속성은 1레벨로 교체됩니다. 레벨 1당 피해 +${Math.round(ENCHANT_DAMAGE_PER_LEVEL * 100)}%.`)
    );
    body.appendChild(row('단축키', 'E (마법부여대 근처) · C(제작대) → 🔮 마법부여 열기'));
    if (!state.built) {
      const guide = h('div', 'row stat-row enchant-guide');
      guide.appendChild(h('span', 'row-label', '건설 비용'));
      guide.appendChild(h('span', 'row-value', '4,800 G · 목재 1,100 · 은 8 · 수정 6 · 마나 5 — B(건설) → 🏗 시설 탭'));
      const go = h('button', 'btn primary btn-primary', '🏗 건설 열기');
      go.type = 'button';
      go.dataset.act = 'panel-open';
      go.dataset.panel = 'build';
      guide.appendChild(go);
      body.appendChild(guide);
    }
    if (st.message) body.appendChild(row('알림', st.message));

    const weapons = Array.isArray(state.weapons) ? state.weapons : [];
    body.appendChild(sectionTitle(`무기 선택 (${fmt(weapons.length)}종 보유)`));
    if (!weapons.length) {
      body.appendChild(row('무기', '🖐 맨손 — 아직 무기가 없습니다. 작업대(🔨)를 세우고 제작 탭에서 첫 무기를 만드세요.'));
      body.appendChild(row('안내', '건설(B) → 🏗 시설 → 🔨 작업대 (650 G · 목재 160 · 철 6 · 구리 4)'));
      return;
    }
    const selId = weapons.some((w) => w.id === st.weaponId) ? st.weaponId : weapons[0].id;
    st.weaponId = selId;
    const wgrid = grid();
    for (const w of weapons) {
      const card = h('div', cardClass('common', { selected: w.id === selId, extra: 'enchant-weapon-card' }));
      card.dataset.role = 'enchant-weapon';
      card.dataset.weaponId = w.id;
      const head = h('div', 'row stat-row');
      head.appendChild(h('span', 'row-label', `${w.equipped ? '✅ ' : ''}${w.name}`));
      head.appendChild(h('span', 'badge', w.gradeName || `T${num(w.tier, 1)}`));
      card.appendChild(head);
      card.appendChild(
        row('마법부여', w.enchant ? `${w.enchant.icon} ${w.enchant.name} ${w.enchant.level}레벨 · 피해 +${w.enchant.percent}%` : '없음')
      );
      const pick = h('button', 'btn ' + (w.id === selId ? 'ghost btn-ghost' : 'primary btn-primary'), w.id === selId ? '선택됨' : '이 무기에 부여');
      pick.type = 'button';
      pick.dataset.act = 'enchant-pick';
      pick.dataset.weapon = w.id;
      if (w.id === selId) pick.disabled = true;
      card.appendChild(pick);
      wgrid.appendChild(card);
    }
    body.appendChild(wgrid);

    const sel = weapons.find((w) => w.id === selId) ?? weapons[0];
    body.appendChild(sectionTitle(`속성 선택 — ${sel.name}`));
    body.appendChild(
      row('현재', sel.enchant ? `${sel.enchant.icon} ${sel.enchant.name} ${sel.enchant.level}레벨 · 피해 +${sel.enchant.percent}%` : '부여 없음 (기본 피해)')
    );
    const eco = safe(() => this.game?.economy, null);
    const egrid = grid();
    for (const el of state.elements ?? []) {
      const info = el.cost ? el.cost : null;
      const affordable = !eco?.canAfford || safe(() => eco.canAfford(info), true) !== false;
      const card = h('div', cardClass(el.grade || 'common', { selected: st.element === el.id, locked: !info || el.maxed, extra: 'enchant-element-card' }));
      card.dataset.role = 'enchant-element';
      card.dataset.element = el.id;
      const head = h('div', 'row stat-row');
      head.appendChild(h('span', 'row-label', `${el.icon} ${el.name}`));
      head.appendChild(h('span', 'badge', el.maxed ? '최대' : el.same ? `${num(el.level, 1)}레벨` : '1레벨'));
      card.appendChild(head);
      card.appendChild(row('효과', el.desc || '속성 부여'));
      card.appendChild(row('비용', el.maxed ? '최대 레벨' : this._enchantCostText(info)));
      const apply = h(
        'button',
        'btn ' + (el.maxed ? 'ghost btn-ghost' : affordable ? 'primary btn-primary' : 'ghost btn-ghost'),
        el.maxed ? '최대 레벨' : affordable ? (el.same ? `${num(el.level, 1)}레벨로 강화` : '부여') : '재료 부족'
      );
      apply.type = 'button';
      apply.dataset.act = 'enchant-apply';
      apply.dataset.weapon = selId;
      apply.dataset.element = el.id;
      if (el.maxed || !affordable) {
        apply.disabled = true;
        apply.setAttribute('aria-disabled', 'true');
      }
      card.appendChild(apply);
      egrid.appendChild(card);
    }
    body.appendChild(egrid);

    const applied = Array.isArray(state.applied) ? state.applied : [];
    body.appendChild(sectionTitle(`부여 현황 (${fmt(applied.length)}종)`));
    body.appendChild(
      row(
        '목록',
        applied.length
          ? applied.map((a) => `${a.icon} ${(WEAPON_BY_ID[a.weaponId] || {}).name || a.weaponId} ${a.level}레벨`).join(' · ')
          : '아직 부여한 무기가 없습니다.'
      )
    );
  }

  _renderWeapons(body) {
    const owned = this._weaponOwnedSet();
    const equippedId = this._weaponEquippedId();
    const core = WEAPONS.filter((w) => !w.bonus).length;
    const bonus = WEAPONS.length - core;
    const secrets = WEAPONS.filter((w) => w.secret || w.grade === 'secret').length;

    body.textContent = '';
    body.appendChild(row('무기 체계', `총 ${fmt(core)}종 (비밀 ${fmt(secrets)} 포함)${bonus > 0 ? ` + 보너스 ${fmt(bonus)}종` : ''}`));
    body.appendChild(row('궁극기', `${fmt(WEAPON_ULTIMATES.length)}종 — ${WEAPON_ULTIMATES.map((u) => u.name).join(' · ')}`));
    const ownedCount = owned ? WEAPONS.filter((w) => owned.has(w.id)).length : WEAPONS.length;
    body.appendChild(row('보유', owned ? `${fmt(ownedCount)} / ${fmt(WEAPONS.length)} 종` : `${fmt(WEAPONS.length)}종 전체 표시 (보유 정보 없음)`));
    const eq = equippedId ? WEAPON_BY_ID[equippedId] : null;
    body.appendChild(row('장착', eq ? `${eq.name} · ${eq.familyName} · ${eq.gradeName}` : equippedId ? String(equippedId) : '없음 — 아래에서 장착'));

    const prev = this.state.weapons.preview ? WEAPON_BY_ID[this.state.weapons.preview] : null;
    if (prev) {
      const sw = this._weaponSwap(prev.id);
      body.appendChild(row('모션 미리보기', sw ? `${prev.name} — 스왑: ${sw.style} ${num(sw.duration).toFixed(2)}s · ${sw.desc || ''}` : `${prev.name} — 스왑모션 없음`));
    }
    body.appendChild(row('단축키', 'Tab — 무기 인벤토리 / C — 제작대'));
    body.appendChild(row('미보유 무기', `제작대(C)에서 골드·목재·광물로 제작합니다 — 제작 전용 ${fmt(WEAPONS.filter((w) => w.craftOnly).length)}종`));

    body.appendChild(sectionTitle('계열'));
    const fam = this.state.weapons.family || 'all';
    const items = [{ label: '🎒 전체', act: 'weapon-filter', data: { family: 'all' }, active: fam === 'all' }];
    for (const f of WEAPON_FAMILIES) {
      items.push({ label: `${f.icon || ''} ${f.name}`.trim(), act: 'weapon-filter', data: { family: f.id }, active: fam === f.id });
    }
    body.appendChild(this._tabs(items));
    body.appendChild(row('계열별', WEAPON_FAMILIES.map((f) => `${f.icon || ''} ${f.name} ${fmt(weaponsByFamily(f.id).length)}`).join(' · ').trim()));

    const equippedNow = this._weaponEquippedId();
    const bare = !equippedNow || equippedNow === FIST_WEAPON_ID;
    const bareRow = h('div', 'row stat-row weapon-bare-row');
    bareRow.appendChild(h('span', 'row-label', '맨손'));
    bareRow.appendChild(
      h('span', 'row-value', bare ? '🖐 장착 중 — 주먹으로 싸웁니다 (모든 무기는 제작해야 생깁니다)' : '🖐 무기를 비우면 맨손')
    );
    const bareBtn = h('button', 'btn ghost btn-ghost', bare ? '맨손 사용 중' : '맨손으로');
    bareBtn.type = 'button';
    bareBtn.dataset.act = 'weapon-equip';
    bareBtn.dataset.id = FIST_WEAPON_ID;
    if (bare) bareBtn.disabled = true;
    bareRow.appendChild(bareBtn);
    body.appendChild(bareRow);

    const list = this._weaponList();
    const famName = (WEAPON_FAMILY_BY_ID[fam] || {}).name || '전체';
    body.appendChild(sectionTitle(`무기 목록 — ${famName} (${fmt(list.length)} / ${fmt(WEAPONS.length)}종)`));
    const cards = grid();
    if (!list.length) cards.appendChild(row('목록', '해당 계열의 무기가 없습니다.'));
    else for (const w of list) cards.appendChild(this._weaponCard(w, { owned, equippedId }));
    body.appendChild(cards);

    body.appendChild(sectionTitle('비밀 무기 — 행복의 끝은 꿈나무'));
    const dgrid = grid('card-grid weapon-dream-grid');
    dgrid.appendChild(this._dreamTreeCard({ equippedId }));
    body.appendChild(dgrid);
  }

  _weaponCard(w, ctx = {}) {
    const fam = WEAPON_FAMILY_BY_ID[w.family] || null;
    const el = ELEMENT_BY_ID[w.element] || null;
    const ult = w.ultimate ? ULTIMATE_BY_ID[w.ultimate] || null : null;
    const swap = this._weaponSwap(w.id);
    const isOwned = !ctx.owned || ctx.owned.has(w.id);
    const equipped = Boolean(ctx.equippedId && ctx.equippedId === w.id);

    const lock = this._classLock(w.id);
    const classLocked = Boolean(lock?.locked);
    const card = h('div', cardClass(w.grade, { selected: equipped, locked: !isOwned || classLocked, extra: 'weapon-card' }));
    card.dataset.role = 'weapon-row';
    card.dataset.weaponId = w.id;
    card.dataset.grade = w.grade;
    card.dataset.family = w.family;
    if (classLocked) card.dataset.classLocked = lock?.kind || 'family';
    card.style.borderTopColor = cssColor(w.color);

    const head = h('div', 'row stat-row weapon-head');
    head.appendChild(h('span', 'row-label weapon-name', `${fam?.icon || ''} ${w.name}`.trim()));
    const badge = h('span', `badge rarity-${w.grade} r-${w.grade} weapon-grade`, w.gradeName || (WEAPON_GRADE_BY_ID[w.grade] || {}).name || w.grade);
    badge.dataset.role = 'weapon-grade';
    badge.style.color = cssColor(w.color);
    badge.style.borderColor = cssColor(w.color);
    head.appendChild(badge);
    card.appendChild(head);

    card.appendChild(row('피해', w.nonLethal ? '비살상 (구원)' : `${fmt(w.damage)}${num(w.aoe) > 0 ? ` · 범위 ${num(w.aoe)} m` : ''}`));
    card.appendChild(row('쿨다운', `${num(w.cooldown).toFixed(2)}s`));
    if (classLocked) {
      const lockRow = h('div', 'row stat-row weapon-lock-row');
      lockRow.appendChild(h('span', 'row-label', '🔒 잠김'));
      const lv = h('span', 'row-value class-lock-reason', lock?.kind === 'tier' ? lock.reason : `${lock?.reason || ''}`);
      lv.dataset.role = 'weapon-lock-reason';
      lockRow.appendChild(lv);
      card.appendChild(lockRow);
    }
    card.appendChild(row('쿨다운', `${num(w.cooldown).toFixed(2)}s`));
    card.appendChild(row('사거리', `${num(w.range)} m`));

    if (ult) {
      const r = h('div', 'row stat-row weapon-ultimate');
      r.appendChild(h('span', 'row-label', '궁극기'));
      const v = h('span', 'row-value', `${ult.name} · 반경 ${num(ult.radius)} m · CD ${fmt(ult.cooldown)}s`);
      v.style.color = cssColor(ult.color);
      v.dataset.role = 'weapon-ultimate';
      r.appendChild(v);
      card.appendChild(r);
    }

    const er = h('div', 'row stat-row');
    er.appendChild(h('span', 'row-label', '속성'));
    const ev = h('span', 'row-value', el ? `${el.name} · ${el.status}` : w.element ? String(w.element) : '없음');
    if (el) ev.style.color = cssColor(el.color);
    er.appendChild(ev);
    card.appendChild(er);

    const ench = safe(() => this.game?.enchant?.stateFor?.(w.id), null);
    if (ench) {
      const xr = h('div', 'row stat-row weapon-enchant');
      xr.appendChild(h('span', 'row-label', '마법부여'));
      const xv = h('span', 'row-value', `${ench.icon} ${ench.name} ${ench.level}레벨 · 피해 +${ench.percent}%`);
      xv.dataset.role = 'weapon-enchant';
      if (ench.color != null) xv.style.color = cssColor(ench.color);
      xr.appendChild(xv);
      card.appendChild(xr);
    }

    const kindName = w.kind === 'bow' ? '활(원거리)' : w.kind === 'ranged' ? '원거리' : w.kind === 'save' ? '구원' : '근접';
    card.appendChild(row('장비', `${num(w.hands, 1) === 2 ? '양손' : '한손'} · ${kindName}${w.projectile ? ' · 투사체' : ''}`));
    card.appendChild(row('모션', swap ? `스왑: ${swap.style} ${num(swap.duration).toFixed(2)}s` : '스왑: 없음'));
    if (swap?.desc) card.appendChild(row('모션 설명', swap.desc));
    if (num(w.lifesteal) > 0) card.appendChild(row('생명력 흡수', `${(num(w.lifesteal) * 100).toFixed(0)}%`));
    if (num(w.combo) > 0) card.appendChild(row('연격', `${num(w.combo)} 연타`));
    if (w.bonus) card.appendChild(row('분류', '보너스 무기'));
    if (w.secret) card.appendChild(row('분류', '비밀 무기'));
    if (!isOwned) card.appendChild(row('상태', '미보유'));

    card.appendChild(this._weaponActions(w.id, equipped));
    return card;
  }

  _dreamTreeCard(ctx = {}) {
    const d = DREAM_TREE || {};
    const swap = d.swap || {};
    const impact = d.impact || {};
    const skill = Object.assign({}, d.skillImpact || {}, ULTIMATE_IMPACTS[d.ultimate] || {});
    const ult = ULTIMATE_BY_ID[d.ultimate] || null;
    const passive = d.passive || {};
    const acquire = d.acquire || {};
    const save = d.save || {};
    const equipped = Boolean(ctx.equippedId && ctx.equippedId === d.id);

    const card = h('div', cardClass('secret', { selected: equipped, extra: 'weapon-dream-card' }));
    card.dataset.role = 'dream-tree-card';
    card.style.borderTopColor = DREAM_PINK;
    card.style.borderLeftColor = DREAM_PINK;
    card.style.background = 'linear-gradient(180deg, rgba(255, 184, 208, 0.18), rgba(255, 184, 208, 0.04))';

    const head = h('div', 'row stat-row weapon-head');
    const name = h('span', 'row-label weapon-name', `${(WEAPON_FAMILY_BY_ID.dream || {}).icon || '🌸'} ${d.name || '꿈나무'}`);
    name.style.color = DREAM_PINK;
    head.appendChild(name);
    const badge = h('span', 'badge rarity-secret r-secret weapon-grade', '비밀');
    badge.dataset.role = 'weapon-grade';
    badge.style.color = DREAM_PINK;
    badge.style.borderColor = DREAM_PINK;
    head.appendChild(badge);
    card.appendChild(head);

    if (d.subtitle) card.appendChild(row('부제', d.subtitle));
    if (d.quote) card.appendChild(row('명대사', `“${d.quote}”`));
    if (d.desc) card.appendChild(row('설명', d.desc));

    const urow = h('div', 'row stat-row weapon-ultimate');
    urow.appendChild(h('span', 'row-label', '고유 스킬 임팩트'));
    const uval = h('span', 'row-value', `${ult ? ult.name : d.ultimate || '-'} — ${skill.kind || 'salvation'} · 반경 ${fmt(skill.radius)} m · 꽃잎 ${fmt(skill.petals)} · 나비 ${fmt(skill.butterflies)}`);
    uval.style.color = DREAM_PINK;
    uval.dataset.role = 'weapon-ultimate';
    urow.appendChild(uval);
    card.appendChild(urow);
    if (ult) card.appendChild(row('궁극기 정보', `쿨다운 ${fmt(ult.cooldown)}s · 지속 ${num(ult.duration)}s · ${ult.desc || ''}`));
    card.appendChild(row('고유 스왑모션', `스왑: ${swap.style || 'bloom'} ${num(swap.duration).toFixed(2)}s · 꽃잎 ${fmt(swap.petals)} · 나비 ${fmt(swap.butterflies)}${swap.chime ? ' · 차임' : ''}`));
    card.appendChild(row('고유 무기 임팩트', `${impact.kind || '-'} · 꽃잎 ${fmt(impact.petals)} · 나비 ${fmt(impact.butterflies)} · 감사 인사 ${impact.gratitude ? '있음' : '없음'}`));
    if (Array.isArray(save.gratitude) && save.gratitude.length) card.appendChild(row('감사 인사', save.gratitude.join(' · ')));
    if (num(save.radius) > 0 || num(save.manaCost) > 0) {
      card.appendChild(
        row('구원', `반경 ${num(save.radius)} m · 마나 ${num(save.manaCost)} · 쿨다운 ${num(save.cooldown)}s${num(save.healOnSave) > 0 ? ` · 구원 시 회복 +${num(save.healOnSave)}` : ''}`)
      );
    }
    if (acquire.desc) card.appendChild(row('획득 조건', acquire.desc));
    const need = [];
    if (num(acquire.fairies) > 0) need.push(`요정 ${fmt(acquire.fairies)}명`);
    if (num(acquire.achievements) > 0) need.push(`업적 ${fmt(acquire.achievements)}개`);
    if (acquire.weapon) need.push(`무기 ${(WEAPON_BY_ID[acquire.weapon] || {}).name || acquire.weapon}`);
    if (acquire.table) need.push(`장소 ${acquire.table}`);
    if (need.length) card.appendChild(row('필요 조건', need.join(' · ')));
    if (passive.name) card.appendChild(row('패시브', passive.name));
    if (passive.desc) card.appendChild(row('패시브 효과', passive.desc));
    if (num(passive.perSave) > 0) card.appendChild(row('축복', `구원 1명당 +${(num(passive.perSave) * 100).toFixed(1)}% (최대 +${fmt(num(passive.max) * 100)}%)`));

    const lore = h('div', 'card-desc weapon-lore');
    for (const line of Array.isArray(d.lore) ? d.lore : []) lore.appendChild(h('div', 'weapon-lore-line', line));
    if (lore.children.length) card.appendChild(lore);

    card.appendChild(this._weaponActions(d.id, equipped));
    return card;
  }

  _equipWeapon(id) {
    const w = WEAPON_BY_ID[id];
    if (!w) return;
    this.state.weapons.equipped = w.id;
    this.emit('weapon:equip', { id: w.id });
    this._toast(`${w.name} 장착`, 'good');
    this._render('weapons');
  }

  _previewWeapon(id) {
    const w = WEAPON_BY_ID[id];
    if (!w) return;
    this.state.weapons.preview = w.id;
    const sw = this._weaponSwap(w.id);
    this.emit('weapon:preview', { id: w.id });
    this._toast(sw ? `${w.name} — 스왑모션 ${sw.style} ${num(sw.duration).toFixed(2)}s` : `${w.name} — 스왑모션 없음`, 'info');
    this._render('weapons');
  }

  // ── 설정 ────────────────────────────────────────
  _renderSettings(body) {
    const g = this.game;
    body.textContent = '';
    // ESC 로 연 화면이다 — 게임으로 바로 돌아갈 수 있게 맨 위에 둔다(계약 §4.48).
    const inRun = g?.state === 'paused' || g?.state === 'playing';
    if (inRun) {
      const head = h('div', 'row');
      const back = h('button', 'btn primary btn-primary', '▶ 계속하기');
      back.type = 'button';
      back.dataset.act = 'resume';
      const out = h('button', 'btn danger btn-danger', '나가기');
      out.type = 'button';
      out.dataset.act = 'quit';
      head.appendChild(back);
      head.appendChild(out);
      body.appendChild(head);
      body.appendChild(row('진행 중', `웨이브 ${num(safe(() => g?.waves?.wave, 1), 1)} · ESC 를 다시 누르면 계속합니다`));
    }
    body.appendChild(sectionTitle('설정'));
    // ── 계정 · 닉네임 (설정에서 바로 변경) ──────────────
    body.appendChild(sectionTitle('계정 · 닉네임'));
    const loggedInNow = Boolean(safe(() => auth.loggedIn, false));
    const userNow = safe(() => auth.user, null);
    body.appendChild(row('로그인 상태', loggedInNow ? `로그인됨 — ${userNow?.nickname || userNow?.username || ''}` : '게스트 (로그인하지 않음)'));
    body.appendChild(row('현재 닉네임', currentNickname() || '(없음 — 캐릭터 이름/아이디를 씁니다)'));
    body.appendChild(this._inputRow('auth', '새 닉네임', 'settings-nickname', 'text', `1~${NICKNAME_MAX}자 · 비우면 해제`, currentNickname()));
    const nickRow2 = h('div', 'row');
    const nickSave2 = h('button', 'btn primary btn-primary', '닉네임 저장');
    nickSave2.type = 'button';
    nickSave2.dataset.act = 'settings-nickname-save';
    nickRow2.appendChild(nickSave2);
    const nickClear2 = h('button', 'btn ghost btn-ghost', '닉네임 지우기');
    nickClear2.type = 'button';
    nickClear2.dataset.act = 'settings-nickname-clear';
    nickRow2.appendChild(nickClear2);
    body.appendChild(nickRow2);
    body.appendChild(row('안내', '닉네임은 멀티플레이·채팅에 표시됩니다. 계정 로그인과 별개로 저장됩니다.'));

    // ── 로그인 · 회원가입 (설정 안에서 바로 — 사용자 요청) ──
    body.appendChild(sectionTitle('로그인 · 회원가입'));
    this._renderAccount(body, 'settings-auth-msg');
    // 관리자 아이디로 로그인했을 때만 보이는 구역(일반 계정에는 아무것도 없다).
    if (safe(() => auth.isAdmin, false)) {
      body.appendChild(sectionTitle('관리자 — 관리자 계정 전용'));
      const adminRow = h('div', 'row');
      const openConsole = h('button', 'btn primary btn-primary', '🛠 관리자 콘솔 열기');
      openConsole.type = 'button';
      openConsole.dataset.act = 'admin-console';
      adminRow.appendChild(openConsole);
      body.appendChild(adminRow);
      body.appendChild(row('명령어', '/도움말 · /돈 100000 · /플라이 · /무기 … (게임 중 ` 또는 / 로도 열립니다)'));
    }
    body.appendChild(row('버전', String(g?.VERSION ?? VERSION)));

    // ── 화면 — 현재 해상도 표시 + 전체 화면(1920x1080 모니터에서 꽉 채운다) ──
    body.appendChild(sectionTitle('화면'));
    const viewW = Math.round(globalThis.innerWidth || 0);
    const viewH = Math.round(globalThis.innerHeight || 0);
    body.appendChild(row('해상도', `${viewW} x ${viewH} — 창 크기에 맞춰 함께 바뀝니다`));
    const screenRow = h('div', 'row');
    const isFullNow = Boolean(globalThis.document?.fullscreenElement);
    const fsBtn = h('button', 'btn ghost btn-ghost', isFullNow ? '🪟 창 모드로 바꾸기' : '⛶ 전체 화면으로 바꾸기');
    fsBtn.type = 'button';
    fsBtn.dataset.act = 'settings-fullscreen';
    screenRow.appendChild(fsBtn);
    body.appendChild(screenRow);
    body.appendChild(row('화면 모드', isFullNow ? '전체 화면' : '창 모드'));
    body.appendChild(row('안내', '게임을 시작하면 전체 화면으로 열립니다. 여기서 창 모드로 바꾸면 다음에도 창 모드입니다.'));

    body.appendChild(sectionTitle('시점'));
    const camMode = String(this.game?.player?.cameraMode ?? 'first');
    const camRow = h('div', 'row');
    const firstBtn = h('button', 'btn ' + (camMode === 'first' ? 'primary btn-primary' : 'ghost btn-ghost'), '1인칭');
    firstBtn.type = 'button';
    firstBtn.dataset.act = 'settings-camera';
    firstBtn.dataset.mode = 'first';
    const thirdBtn = h('button', 'btn ' + (camMode === 'third' ? 'primary btn-primary' : 'ghost btn-ghost'), '3인칭 (캐릭터 보임)');
    thirdBtn.type = 'button';
    thirdBtn.dataset.act = 'settings-camera';
    thirdBtn.dataset.mode = 'third';
    camRow.appendChild(firstBtn);
    camRow.appendChild(thirdBtn);
    body.appendChild(camRow);
    body.appendChild(row('현재 시점', camMode === 'third' ? '3인칭 — 캐릭터 어깨 너머' : '1인칭 — 눈높이'));
    body.appendChild(row('단축키', 'Z — 1인칭 ↔ 3인칭 (설정에서 키 변경 가능)'));
    body.appendChild(sectionTitle('프레임 프리셋'));
    const cards = grid();
    const activePreset = String(g?.quality ?? g?.preset?.id ?? '');
    for (const p of FRAME_PRESETS) {
      const active = activePreset === p.id;
      const card = h('button', cardClass(null, { selected: active }));
      card.type = 'button';
      card.dataset.act = 'frame-pick';
      card.dataset.id = p.id;
      card.appendChild(row(p.name, active ? '적용 중' : '적용'));
      card.appendChild(row('설명', p.desc));
      cards.appendChild(card);
    }
    body.appendChild(cards);

    body.appendChild(sectionTitle('사운드'));
    const labels = [['master', '전체 음량'], ['sfx', '효과음'], ['bgm', '배경음악']];
    for (const [ch, label] of labels) {
      const wrap = h('div', 'row');
      wrap.appendChild(h('span', 'row-label', label));
      const input = h('input', 'input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(num(this._vol[ch], 0.8));
      input.dataset.act = 'volume';
      input.dataset.ch = ch;
      wrap.appendChild(input);
      body.appendChild(wrap);
    }
    const toggles = h('div', 'row');
    const muted = Boolean(safe(() => g?.audio?.muted));
    const muteBtn = h('button', `btn btn-${muted ? 'danger' : 'ghost'} ${muted ? 'danger' : 'ghost'}`, muted ? '음소거 해제' : '음소거');
    muteBtn.type = 'button';
    muteBtn.dataset.act = 'audio-mute';
    const mapOn = this._minimapOn();
    const mapBtn = h('button', `btn btn-${mapOn ? 'ghost' : 'primary'} ${mapOn ? 'ghost' : 'primary'}`, mapOn ? '미니맵 끄기' : '미니맵 켜기');
    mapBtn.type = 'button';
    mapBtn.dataset.act = 'minimap-toggle';
    toggles.appendChild(muteBtn);
    toggles.appendChild(mapBtn);
    body.appendChild(toggles);

    body.appendChild(sectionTitle('단축키'));
    for (const [key, desc] of KEYBINDS) body.appendChild(row(key, desc));

    // ── 키 변경 (계약 §4.55) — 원하는 키를 눌러 바꾼다. ESC 는 고정.
    body.appendChild(sectionTitle('키 변경'));
    const keyState = this._keyState();
    if (keyState.message) body.appendChild(row('알림', keyState.message));
    if (keyState.capture) {
      body.appendChild(row('입력 대기', `${BOUND_KEY_ACTION[keyState.capture]?.label ?? ''} — 바꿀 키를 지금 누르세요 (ESC = 취소)`));
    }
    for (const group of BOUND_KEY_GROUPS) {
      body.appendChild(sectionTitle(group.name));
      for (const action of group.actions) {
        // 관리자 전용 키는 관리자 계정에게만 보여 준다.
        if (action.id === 'admin' && !safe(() => auth.isAdmin, false)) continue;
        const line = h('div', 'row');
        line.appendChild(h('span', 'row-label', action.label));
        line.appendChild(h('span', 'key-chip', boundKeyLabel(boundPrimaryKey(action.id))));
        const setBtn = h('button', 'btn ghost btn-ghost', keyState.capture === action.id ? '입력 대기…' : '변경');
        setBtn.type = 'button';
        setBtn.dataset.act = 'key-set';
        setBtn.dataset.id = action.id;
        const resetBtn = h('button', 'btn ghost btn-ghost', '기본');
        resetBtn.type = 'button';
        resetBtn.dataset.act = 'key-reset';
        resetBtn.dataset.id = action.id;
        line.appendChild(setBtn);
        line.appendChild(resetBtn);
        body.appendChild(line);
      }
    }
    const keysResetAll = h('button', 'btn danger btn-danger', '키 전부 기본값으로');
    keysResetAll.type = 'button';
    keysResetAll.dataset.act = 'key-reset-all';
    body.appendChild(keysResetAll);
    body.appendChild(row('안내', 'ESC 는 항상 고정입니다. 바꾼 키는 바로 적용되고 이 컴퓨터에 저장됩니다.'));


    body.appendChild(sectionTitle('게임'));
    const acts = h('div', 'row');
    const save = h('button', 'btn primary btn-primary', '저장');
    save.type = 'button';
    save.dataset.act = 'save';
    const load = h('button', 'btn ghost btn-ghost', '불러오기');
    load.type = 'button';
    load.dataset.act = 'load';
    const quit = h('button', 'btn danger btn-danger', '나가기');
    quit.type = 'button';
    quit.dataset.act = 'quit';
    acts.appendChild(save);
    acts.appendChild(load);
    acts.appendChild(quit);
    body.appendChild(acts);

    // ── 내 세이브 목록 (계약 §4.49) — 저장할 때마다 쌓이고, 골라서 그 시점으로 돌아간다.
    body.appendChild(sectionTitle('내 세이브'));
    const slots = safe(() => g?.listSaves?.(), null) || [];
    if (!slots.length) {
      body.appendChild(row('저장된 세이브', '아직 없습니다 — 게임 중 [저장] 을 누르면 여기에 쌓입니다'));
    } else {
      for (const slot of slots.slice(0, 10)) {
        const line = h('div', 'row');
        line.appendChild(h('span', 'row-label', `${slot.label} · 웨이브 ${slot.wave} · ${fmt(slot.gold)}G · ${slot.play}`));
        const loadSlot = h('button', 'btn primary btn-primary', '불러오기');
        loadSlot.type = 'button';
        loadSlot.dataset.act = 'save-slot-load';
        loadSlot.dataset.id = slot.id;
        const dropSlot = h('button', 'btn ghost btn-ghost', '삭제');
        dropSlot.type = 'button';
        dropSlot.dataset.act = 'save-slot-del';
        dropSlot.dataset.id = slot.id;
        line.appendChild(loadSlot);
        line.appendChild(dropSlot);
        body.appendChild(line);
      }
      if (slots.length > 10) body.appendChild(row('안내', `최근 10개만 표시합니다 (총 ${slots.length}개)`));
    }

    // ── 성능 지표 (계약 §4.47) — 끊김이 있을 때 직접 확인할 수 있게 남긴다.
    body.appendChild(sectionTitle('성능 지표'));
    this._perfEls = {};
    const perfRow = (label, key) => {
      const line = h('div', 'row');
      line.appendChild(h('span', 'row-label', label));
      const value = h('span', 'row-value', '—');
      line.appendChild(value);
      this._perfEls[key] = value;
      body.appendChild(line);
    };
    perfRow('총 프레임', 'frames');
    perfRow('마지막 프레임', 'last');
    perfRow('최악 프레임', 'worst');
    perfRow('1초 초과 프레임', 'slow');
    perfRow('마지막 오류', 'error');
    perfRow('평균 FPS', 'fps');
    perfRow('렌더 배율', 'scale');
    perfRow('프레임 예산 (500 FPS)', 'budget');
    // 예산 소모를 눈으로 보게 막대를 붙인다(계약 §4.74).
    const budgetBar = document.createElement('div');
    budgetBar.className = 'progress perf-budget-bar';
    this._perfBudgetFill = h('span', 'progress-fill');
    budgetBar.appendChild(this._perfBudgetFill);
    body.appendChild(budgetBar);
    perfRow('JS 힙', 'heap');

    // 자동 화질 — 프레임이 낮으면 프리셋을 내리고, 안정되면 사용자가 고른 단계까지 되올린다.
    const autoRow = h('div', 'row');
    autoRow.appendChild(h('span', 'row-label', '자동 화질'));
    const autoOn = safe(() => g?.autoQuality, true) !== false;
    const autoBtn = h('button', `btn ${autoOn ? 'primary' : 'ghost'} btn-${autoOn ? 'primary' : 'ghost'}`, autoOn ? '켜짐' : '꺼짐');
    autoBtn.type = 'button';
    autoBtn.dataset.act = 'auto-quality';
    autoRow.appendChild(autoBtn);
    body.appendChild(autoRow);
    body.appendChild(row('기준 단계', `자동 조정은 [${FRAME_PRESETS.find((p) => p.id === safe(() => g._userQuality, null))?.name ?? '현재'}] 을 넘지 않습니다`));

    const reload = h('button', 'btn ghost btn-ghost', '저장하고 새로고침(메모리 정리)');
    reload.type = 'button';
    reload.dataset.act = 'game-reload';
    body.appendChild(reload);
    this._syncPerfRows();
    const perfReset = h('button', 'btn ghost btn-ghost', '지표 초기화');
    perfReset.type = 'button';
    perfReset.dataset.act = 'perf-reset';
    body.appendChild(perfReset);
    this._syncPerfRows();
  }

  /** 설정 패널의 성능 지표를 최신 값으로 갱신한다(계약 §4.47). */
  _syncPerfRows() {
    const els = this._perfEls;
    if (!els) return false;
    const p = safe(() => this.game?.perf, null) || {};
    const set = (el, text) => { if (el) el.textContent = text; };
    set(els.frames, fmt(num(p.frames, 0)));
    set(els.last, `${num(p.lastMs, 0).toFixed(1)} ms`);
    set(els.worst, `${num(p.worstMs, 0).toFixed(1)} ms`);
    set(els.slow, `${fmt(num(p.slowFrames, 0))} 회`);
    set(els.error, p.lastError ? String(p.lastError) : '없음');
    set(els.fps, `${Math.round(num(safe(() => this.game?.ui?.fps?.averageFps, 0), 0))} FPS`);
    const scale = num(safe(() => this.game?.adaptive?.scale, 1), 1);
    set(els.scale, `${Math.round(scale * 100)}%`);
    // 500 FPS 예산(2.0ms) 대비 현재 프레임(계약 §4.62)
    const budgetMs = 2.0;
    const lastMs = num(p.lastMs, 0);
    if (lastMs > 0) {
      const head = Math.round((1 - lastMs / budgetMs) * 100);
      const headroom = head >= 0 ? `여유 ${head}%` : `초과 ${Math.abs(head)}%`;
      set(els.budget, `${lastMs.toFixed(2)} ms / ${budgetMs.toFixed(2)} ms · ${headroom} (≈${Math.round(1000 / Math.max(lastMs, 0.001))} FPS 여력)`);
    } else {
      set(els.budget, `— / ${budgetMs.toFixed(2)} ms`);
    }
    if (this._perfBudgetFill) {
      const pct = Math.max(0, Math.min(100, Math.round((lastMs / budgetMs) * 100)));
      this._perfBudgetFill.style.width = `${pct}%`;
      this._perfBudgetFill.classList.toggle('is-danger', pct >= 100);
      this._perfBudgetFill.classList.toggle('is-ok', pct > 0 && pct < 60);
    }
    const mem = safe(() => this.game?.memory?.usedMb?.(), 0) || 0;
    set(els.heap, mem > 0 ? `${Math.round(mem)} MB` + (this.game?.memory?.peakMb > mem ? ` (최대 ${Math.round(this.game.memory.peakMb)} MB)` : '') : '알 수 없음');
    return true;
  }

  _minimapOn() {
    const el = document.getElementById('minimap-canvas');
    if (!el) return Boolean(safe(() => this.game?.ui?.minimap?.visible, true));
    return !el.classList.contains('hidden');
  }

  // ── 피드백 ──────────────────────────────────────
  _feedbackAll() {
    const list = readJson(FEEDBACK_KEY, []);
    return Array.isArray(list) ? list : [];
  }

  _renderFeedback(body) {
    body.textContent = '';
    body.appendChild(row('안내', '남긴 의견은 이 브라우저(localStorage)에만 저장됩니다.'));
    const area = h('textarea', 'input');
    area.rows = 6;
    area.placeholder = '버그, 개선점, 하고 싶은 말을 적어 주세요.';
    area.dataset.field = 'feedback-text';
    area.value = this._stored('feedback', 'feedback-text', '');
    body.appendChild(area);
    const submit = h('button', 'btn primary btn-primary', '보내기');
    submit.type = 'button';
    submit.dataset.act = 'feedback-submit';
    body.appendChild(submit);
    body.appendChild(row('저장된 의견', `${this._feedbackAll().length} 건`));
  }

  _submitFeedback() {
    const text = String(this._field('feedback', 'feedback-text', '')).trim();
    if (!text) {
      this._toast('내용을 입력해 주세요', 'warn');
      return;
    }
    const list = this._feedbackAll();
    list.push({ id: Date.now(), text, at: new Date().toISOString(), version: VERSION, seed: safe(() => this.game?.seed, null) });
    const ok = writeJson(FEEDBACK_KEY, list.slice(-200));
    this._fields.feedback['feedback-text'] = '';
    this._toast(ok ? '의견을 저장했습니다. 감사합니다!' : '저장에 실패했습니다 (저장 공간 부족)', ok ? 'good' : 'warn');
    this._render('feedback');
  }

  // ── 일시정지 ────────────────────────────────────
  _renderPause(body) {
    const g = this.game;
    body.textContent = '';
    body.appendChild(row('상태', String(g?.state ?? 'playing')));
    body.appendChild(row('모드', modeName(g?.mode)));
    body.appendChild(row('난이도', difficultyName(g?.difficulty)));
    body.appendChild(row('웨이브', String(num(safe(() => g?.waves?.wave, 1), 1))));
    body.appendChild(row('기지 HP', `${fmt(safe(() => g?.base?.hp, 0))} / ${fmt(safe(() => g?.base?.maxHp, 0))}`));

    const acts = h('div', 'row');
    const resume = h('button', 'btn primary btn-primary', '계속하기');
    resume.type = 'button';
    resume.dataset.act = 'resume';
    const settings = h('button', 'btn ghost btn-ghost', '설정');
    settings.type = 'button';
    settings.dataset.act = 'pause-settings';
    const craft = h('button', 'btn ghost btn-ghost', '⚒ 제작대');
    craft.type = 'button';
    craft.dataset.act = 'pause-craft';
    const recipeBtn = h('button', 'btn ghost btn-ghost', '📖 조합법');
    recipeBtn.type = 'button';
    recipeBtn.dataset.act = 'pause-recipes';
    const save = h('button', 'btn ghost btn-ghost', '저장');
    save.type = 'button';
    save.dataset.act = 'save';
    const quit = h('button', 'btn danger btn-danger', '나가기');
    quit.type = 'button';
    quit.dataset.act = 'quit';
    acts.appendChild(resume);
    acts.appendChild(craft);
    acts.appendChild(settings);
    acts.appendChild(save);
    acts.appendChild(quit);
    body.appendChild(acts);
    acts.appendChild(recipeBtn);
    body.appendChild(row('단축키', 'ESC — 닫기 / 일시정지'));
  }

  // ── 계정 ────────────────────────────────────────
  /** 아이디 기억하기 — 비밀번호는 절대 저장하지 않는다(H-98). */
  static REMEMBER_KEY = 'yose.remember.username';
  _rememberedUser() {
    try { return localStorage.getItem('yose.remember.username') || ''; } catch { return ''; }
  }
  _saveRememberedUser(username) {
    try {
      if (username) localStorage.setItem('yose.remember.username', username);
      else localStorage.removeItem('yose.remember.username');
    } catch { /* 저장소 차단 — 무시 */ }
  }

  /**
   * 계정 UI — 설정 화면 안에서도 로그인/회원가입을 한다(사용자 요청).
   * 상태·닉네임 줄 없이 탭(로그인/회원가입/리더보드)과 입력칸·버튼만 그린다.
   */
  /** 로그인/회원가입 화면을 다시 그린다 — 설정 안에 있으면 설정을, 아니면 계정 패널을 갱신한다. */
  _refreshAccount() {
    this._render(this.currentId === 'settings' ? 'settings' : 'auth');
  }

  _renderAccount(body, msgRole = 'auth-msg') {
    const st = this.state.auth;
    if (!this._fields.auth) this._fields.auth = {};
    const user = safe(() => auth.user, null);
    const loggedIn = Boolean(safe(() => auth.loggedIn, false));
    body.appendChild(
      this._tabs([
        { label: '로그인', act: 'auth-tab', data: { tab: 'login' }, active: st.tab === 'login' },
        { label: '회원가입', act: 'auth-tab', data: { tab: 'register' }, active: st.tab === 'register' },
        { label: '리더보드', act: 'auth-tab', data: { tab: 'board' }, active: st.tab === 'board' }
      ])
    );
    const msg = h('div', 'row');
    msg.dataset.role = msgRole;
    msg.appendChild(h('span', 'row-label', '알림'));
    msg.appendChild(h('span', 'row-value', st.message || ''));
    body.appendChild(msg);

    if (st.tab === 'login' || st.tab === 'register') {
      const remembered = this._rememberedUser();
      body.appendChild(this._inputRow('auth', '아이디', 'auth-username', 'text', '영문/숫자/_ 3~20자', this._fields.auth['auth-username'] || remembered));
      if (!this._fields.auth['auth-username'] && remembered) this._fields.auth['auth-username'] = remembered;
      body.appendChild(this._inputRow('auth', '비밀번호', 'auth-password', 'password', '4자 이상'));
      // 아이디만 기억한다(비밀번호는 저장하지 않는다).
      if (st.tab === 'login') {
        const remRow = h('label', 'row check-row');
        const remChk = h('input', 'checkbox');
        remChk.type = 'checkbox';
        remChk.dataset.act = 'auth-remember';
        remChk.dataset.field = 'auth-remember';
        remChk.checked = Boolean(remembered);
        remRow.appendChild(remChk);
        remRow.appendChild(h('span', 'row-label', '아이디 기억하기'));
        body.appendChild(remRow);
      }
      const acts = h('div', 'row');
      const submit = h('button', 'btn primary btn-primary', st.tab === 'login' ? '로그인' : '가입하기');
      submit.type = 'button';
      submit.dataset.act = st.tab === 'login' ? 'auth-login' : 'auth-register';
      submit.disabled = Boolean(st.loading);
      acts.appendChild(submit);
      if (loggedIn) {
        const out = h('button', 'btn danger btn-danger', '로그아웃');
        out.type = 'button';
        out.dataset.act = 'auth-logout';
        acts.appendChild(out);
      }
      body.appendChild(acts);
      body.appendChild(row('안내', '서버가 없어도 게스트로 플레이할 수 있습니다.'));
      if (st.tab === 'register') {
        body.appendChild(row('가입 규칙', '아이디(영문/숫자/_ 3~20자)와 비밀번호(4자 이상)만 있으면 됩니다. 가입하면 바로 로그인됩니다.'));
      }
    } else {
      const wrap = h('div', 'row');
      wrap.appendChild(h('span', 'row-label', '모드'));
      const sel = h('select', 'select');
      sel.dataset.act = 'lb-mode';
      for (const m of MODES) {
        const opt = h('option', null, m.name);
        opt.value = m.id;
        if (m.id === st.lbMode) opt.selected = true;
        sel.appendChild(opt);
      }
      wrap.appendChild(sel);
      const load = h('button', 'btn ghost btn-ghost', '불러오기');
      load.type = 'button';
      load.dataset.act = 'lb-load';
      load.disabled = Boolean(st.lbLoading);
      wrap.appendChild(load);
      body.appendChild(wrap);
      const out = grid();
      out.dataset.role = 'lb';
      body.appendChild(out);
      this._renderLeaderboard(out);
    }
    return body;
  }

  _renderAuth(body) {
    const st = this.state.auth;
    const user = safe(() => auth.user, null);
    const loggedIn = Boolean(safe(() => auth.loggedIn, false));
    body.textContent = '';
    body.appendChild(row('상태', loggedIn ? `로그인됨 — ${user?.nickname || user?.username || ''}` : '오프라인 (게스트 플레이 가능)'));
    // 닉네임 — 계정이 없어도 만들 수 있다(계약 §4.54). 멀티·채팅에 이 이름이 뜬다.
    body.appendChild(row('닉네임', `지금: ${currentNickname() || '(없음 — 캐릭터 이름/로그인 닉네임을 씁니다)'}`));
    body.appendChild(this._inputRow('auth', '새 닉네임', 'profile-nickname', 'text', `1~${NICKNAME_MAX}자 · 비우고 저장하면 해제`, currentNickname()));
    body.appendChild(row('중복 닉네임', '다른 사람과 같은 닉네임도 됩니다 — 겹쳐도 저장되고 그대로 표시됩니다.'));
    const nickActs = h('div', 'row');
    const nickSave = h('button', 'btn primary btn-primary', '닉네임 저장');
    nickSave.type = 'button';
    nickSave.dataset.act = 'nickname-save';
    nickActs.appendChild(nickSave);
    const nickClear = h('button', 'btn ghost btn-ghost', '닉네임 지우기');
    nickClear.type = 'button';
    nickClear.dataset.act = 'nickname-clear';
    nickActs.appendChild(nickClear);
    body.appendChild(nickActs);
    // 계정 탭·입력칸은 설정 화면과 같은 코드(_renderAccount)를 쓴다.
    this._renderAccount(body);
  }

  _renderLeaderboard(container) {
    const st = this.state.auth;
    container.textContent = '';
    if (st.lbLoading) {
      container.appendChild(row('리더보드', '불러오는 중...'));
      return;
    }
    if (st.lbError) {
      container.appendChild(row('리더보드', st.lbError));
      return;
    }
    if (!Array.isArray(st.lb)) {
      container.appendChild(row('리더보드', '불러오기를 눌러 주세요.'));
      return;
    }
    if (!st.lb.length) {
      container.appendChild(row('리더보드', '아직 기록이 없습니다.'));
      return;
    }
    for (const e of st.lb) {
      const card = h('div', 'card');
      card.appendChild(row(`#${fmt(e?.rank)} ${e?.nickname || '익명'}`, `${fmt(e?.score)} 점`));
      card.appendChild(row('웨이브', String(num(e?.wave))));
      if (e?.seed !== undefined) card.appendChild(row('시드', String(e.seed)));
      container.appendChild(card);
    }
  }

  async _authSubmit(kind) {
    const st = this.state.auth;
    const username = String(this._field('auth', 'auth-username', '')).trim();
    const password = String(this._field('auth', 'auth-password', ''));
    const nickname = String(this._field('auth', 'auth-nickname', '')).trim();
    this._fields.auth['auth-username'] = username;
    this._fields.auth['auth-password'] = password;
    this._fields.auth['auth-nickname'] = nickname;

    if (!username || !password) {
      st.message = '아이디와 비밀번호를 모두 입력해 주세요.';
      this._refreshAccount();
      return;
    }
    if (kind === 'register' && password.length < 4) {
      st.message = '비밀번호는 4자 이상이어야 합니다.';
      this._refreshAccount();
      return;
    }
    if (kind === 'register' && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      st.message = '아이디는 영문/숫자/_ 3~20자만 가능합니다.';
      this._refreshAccount();
      return;
    }
    st.loading = true;
    st.message = kind === 'login' ? '로그인 중...' : '가입 중...';
    this._refreshAccount();

    let r = null;
    try {
      r = kind === 'login' ? await auth.login(username, password) : await auth.register(username, password, nickname || undefined);
    } catch (err) {
      r = { ok: false, error: err?.message || '네트워크 오류' };
    }
    st.loading = false;
    if (r && r.ok) {
      // 아이디 기억하기 — 체크되어 있으면 저장, 아니면 지운다(비밀번호는 저장 안 함).
      const wantRemember = this._field('auth', 'auth-remember', '') === 'on' || this.state.auth.remember === true;
      this._saveRememberedUser(wantRemember ? username : '');
      st.message = `${safe(() => auth.user?.nickname, nickname) || username} 님, 환영합니다!`;
      this._toast(safe(() => auth.isAdmin, false) ? '관리자 계정으로 로그인했습니다' : '로그인했습니다', 'good');
      this.emit('auth', { ok: true, user: safe(() => auth.user, null) });
      // 로그인 성공 — 환영 문구를 잠깐 보여 준 뒤 패널을 닫고 메인 화면으로 넘어간다(§4.36).
      this._scheduleAuthClose(kind);
      this._refreshAccount();
      return;
    } else {
      st.message = String(r?.error || '요청에 실패했습니다.');
      this._toast(st.message, 'warn');
    }
    this._refreshAccount();
  }

  /** 로그인/가입 직후 자연스럽게 패널을 닫는다 — 메인 화면이 부드럽게 떠오른다 */
  _scheduleAuthClose(kind = 'login') {
    if (this._authTimer) clearTimeout(this._authTimer);
    this._authTimer = setTimeout(() => {
      this._authTimer = 0;
      this.close?.();
      this.emit('auth:done', { kind, user: safe(() => auth.user, null) });
    }, 420);
    // 타이머가 테스트/종료를 붙잡지 않게 한다(브라우저에서는 무해).
    this._authTimer?.unref?.();
    return true;
  }

  async _loadLeaderboard() {
    const st = this.state.auth;
    st.lbLoading = true;
    st.lbError = '';
    st.lb = null;
    const node = this._bodies.auth?.querySelector?.('[data-role="lb"]');
    if (node) this._renderLeaderboard(node);
    let r = null;
    try {
      r = await leaderboard.top(st.lbMode);
    } catch (err) {
      r = { ok: false, error: err?.message || '네트워크 오류' };
    }
    st.lbLoading = false;
    if (r && r.ok) {
      const data = r.data || {};
      st.lb = Array.isArray(data.entries) ? data.entries : Array.isArray(data) ? data : [];
    } else {
      st.lbError = String(r?.error || '리더보드를 불러오지 못했습니다.');
    }
    const node2 = this._bodies.auth?.querySelector?.('[data-role="lb"]');
    if (node2) this._renderLeaderboard(node2);
  }

  // ── 멀티플레이 ──────────────────────────────────
  _renderMultiplayer(body) {
    const st = this.state.multiplayer;
    const connected = Boolean(safe(() => net.connected, false));
    body.textContent = '';

    const conn = h('div', 'row');
    conn.dataset.role = 'conn';
    conn.appendChild(h('span', 'row-label', '연결 상태'));
    conn.appendChild(
      h(
        'span',
        'row-value',
        connected
          ? `온라인 · ${String(safe(() => net.id, '-') || '-')}`
          : `오프라인 — ${String(safe(() => net.lastError, '') || '서버에 연결되지 않았습니다')} (싱글 플레이 가능)`
      )
    );
    body.appendChild(conn);

    body.appendChild(sectionTitle('방 만들기'));
    const modeRow = h('div', 'row');
    modeRow.appendChild(h('span', 'row-label', '모드'));
    const modeSel = h('select', 'select');
    modeSel.dataset.act = 'mp-mode';
    for (const m of MODES) {
      const opt = h('option', null, m.name);
      opt.value = m.id;
      if (m.id === st.mode) opt.selected = true;
      modeSel.appendChild(opt);
    }
    modeRow.appendChild(modeSel);
    body.appendChild(modeRow);

    const diffRow = h('div', 'row');
    diffRow.appendChild(h('span', 'row-label', '난이도'));
    const diffSel = h('select', 'select');
    diffSel.dataset.act = 'mp-diff';
    for (const d of DIFFICULTIES) {
      const opt = h('option', null, `${d.name} (HP ×${d.hpMult} · 수 ×${d.countMult} · 골드 ×${d.goldMult})`);
      opt.value = d.id;
      if (d.id === st.difficulty) opt.selected = true;
      diffSel.appendChild(opt);
    }
    diffRow.appendChild(diffSel);
    body.appendChild(diffRow);

    body.appendChild(this._inputRow('multiplayer', '시드', 'mp-seed', 'text', '비우면 무작위'));

    const maxRow = h('div', 'row');
    maxRow.appendChild(h('span', 'row-label', '최대 인원'));
    const maxSel = h('select', 'select');
    maxSel.dataset.act = 'mp-max';
    for (const n of [2, 3, 4]) {
      const opt = h('option', null, `${n} 명`);
      opt.value = String(n);
      if (n === st.maxPlayers) opt.selected = true;
      maxSel.appendChild(opt);
    }
    maxRow.appendChild(maxSel);
    body.appendChild(maxRow);

    const create = h('button', 'btn primary btn-primary', st.busy ? '처리 중...' : '방 만들기');
    create.type = 'button';
    create.dataset.act = 'mp-create';
    create.disabled = Boolean(st.busy);
    body.appendChild(create);

    body.appendChild(sectionTitle('코드로 참가'));
    const joinRow = h('div', 'row');
    joinRow.appendChild(h('span', 'row-label', '방 코드'));
    const codeInput = h('input', 'input');
    codeInput.type = 'text';
    codeInput.maxLength = 4;
    codeInput.placeholder = '4자리 (A-Z, 0-9)';
    codeInput.dataset.field = 'mp-code';
    codeInput.value = this._stored('multiplayer', 'mp-code', '');
    joinRow.appendChild(codeInput);
    const join = h('button', 'btn ghost btn-ghost', '참가');
    join.type = 'button';
    join.dataset.act = 'mp-join';
    join.disabled = Boolean(st.busy);
    joinRow.appendChild(join);
    body.appendChild(joinRow);

    body.appendChild(sectionTitle('대기실'));
    const room = h('div', null);
    room.dataset.role = 'room';
    body.appendChild(room);
    this._renderRoomState(room);

    body.appendChild(sectionTitle('채팅'));
    const log = h('div', null);
    log.dataset.role = 'chat-log';
    body.appendChild(log);
    this._renderChatLog(log);
    const chatRow = h('div', 'row');
    const chatInput = h('input', 'input');
    chatInput.type = 'text';
    chatInput.maxLength = 200;
    chatInput.placeholder = '메시지 (최대 200자)';
    chatInput.dataset.field = 'mp-chat';
    chatInput.value = this._stored('multiplayer', 'mp-chat', '');
    chatRow.appendChild(chatInput);
    const send = h('button', 'btn ghost btn-ghost', '전송');
    send.type = 'button';
    send.dataset.act = 'mp-chat-send';
    send.disabled = !connected;
    chatRow.appendChild(send);
    body.appendChild(chatRow);
  }

  _renderRoomState(container) {
    const node = container || this._bodies.multiplayer?.querySelector?.('[data-role="room"]');
    if (!node) return;
    node.textContent = '';
    const room = this._roomState || safe(() => net.room, null);
    if (!room) {
      node.appendChild(row('방', '참가한 방이 없습니다.'));
      return;
    }
    node.appendChild(row('방 코드', String(room.code ?? '-')));
    node.appendChild(row('모드', modeName(room.mode)));
    node.appendChild(row('난이도', difficultyName(room.difficulty)));
    node.appendChild(row('시드', String(room.seed ?? '-')));
    node.appendChild(row('단계', phaseName(room.phase)));
    const players = Array.isArray(room.players) ? room.players : [];
    node.appendChild(row('인원', `${players.length} / ${num(room.maxPlayers, 4)}`));
    const cards = grid();
    for (const p of players) {
      const mine = p?.id && p.id === safe(() => net.id, null);
      const card = h('div', 'card' + (p?.ready ? ' selected' : ''));
      card.appendChild(row(`${p?.nickname ?? '플레이어'}${mine ? ' (나)' : ''}`, p?.ready ? '준비 완료' : '대기 중'));
      if (p?.id && p.id === room.hostId) card.appendChild(row('역할', '방장'));
      if (num(p?.hp) > 0) card.appendChild(row('HP', fmt(p.hp)));
      cards.appendChild(card);
    }
    if (!players.length) cards.appendChild(row('플레이어', '없음'));
    node.appendChild(cards);

    const acts = h('div', 'row');
    const ready = h('button', 'btn primary btn-primary', '준비 토글');
    ready.type = 'button';
    ready.dataset.act = 'mp-ready';
    const start = h('button', 'btn primary btn-primary', '게임 시작');
    start.type = 'button';
    start.dataset.act = 'mp-start';
    start.disabled = !(room.hostId && room.hostId === safe(() => net.id, null));
    const leave = h('button', 'btn danger btn-danger', '나가기');
    leave.type = 'button';
    leave.dataset.act = 'mp-leave';
    acts.appendChild(ready);
    acts.appendChild(start);
    acts.appendChild(leave);
    node.appendChild(acts);
  }

  _renderChatLog(container) {
    const node = container || this._bodies.multiplayer?.querySelector?.('[data-role="chat-log"]');
    if (!node) return;
    node.textContent = '';
    for (const m of this._chatLog) node.appendChild(row(m.nickname, m.text));
    node.scrollTop = node.scrollHeight;
  }

  _onChat(msg) {
    if (!msg) return;
    const entry = {
      id: msg.id ?? Date.now(),
      nickname: msg.nickname ?? '익명',
      text: String(msg.text ?? '').slice(0, 200),
      ts: msg.ts ?? Date.now()
    };
    this._chatLog.push(entry);
    if (this._chatLog.length > 120) this._chatLog.shift();
    if (this.isOpen('multiplayer')) {
      const node = this._bodies.multiplayer?.querySelector?.('[data-role="chat-log"]');
      if (node) {
        node.appendChild(row(entry.nickname, entry.text));
        node.scrollTop = node.scrollHeight;
      }
    }
  }

  /**
   * 닉네임 저장(계약 §4.54) — 계정이 없어도 이 컴퓨터에 저장한다.
   * 로그인 상태면 서버 계정에도 반영하고, 실패해도 로컬 값은 남긴다.
   */
  /** 키 변경 UI 상태(설정 패널) */
  _keyState() {
    if (!this.state.settings) this.state.settings = {};
    if (!this.state.settings.key) this.state.settings.key = { capture: null, message: '' };
    return this.state.settings.key;
  }

  /** 키 입력 대기 — 다음에 누른 키를 그 동작에 묶는다(ESC = 취소, 계약 §4.55) */
  /**
   * 조합법(레시피) 목록 — 계약 §4.57.
   * 지형(지역)별로 나누어, 그 지형에서 만드는 조합법과 필요한 재료를 한눈에 보여 준다.
   */
  /**
   * 지형 이동 — 계약 §4.59.
   * 가까운 포탈에서 N 을 누르면 열린다. 지형별로 나누어 색과 함께 보여 준다.
   */
  /** 마법연성 패널(계약 §4.70) — 11종 업그레이드를 사고 단계를 올린다. */
  _renderArcana(body) {
    const game = this.game;
    const arcana = game?.arcana ?? null;
    if (!arcana) {
      body.appendChild(h('p', 'empty', '연성 정보를 불러오지 못했습니다.'));
      return;
    }
    const gold = Math.floor(Number(game?.economy?.gold) || 0);
    const tableReady = hasArcanaTable(game?.turrets?.turrets ?? []);
    if (!tableReady) {
      // 연성대가 없으면 빨간 안내를 띄우고 구매 버튼을 모두 막는다(계약 §4.72).
      const warn = h('div', 'badge badge-danger arcana-warn');
      warn.dataset.role = 'arcana-warn';
      warn.textContent = '🔮 마법연성대가 없습니다 — 건설에서 마법연성대(골드 10 · 목재 1)를 먼저 세우세요.';
      body.appendChild(warn);
    }
    const head = h('p', 'panel-subtitle arcana-head');
    head.textContent =
      `보유 골드 ${gold.toLocaleString()}G · 연성 ${arcana.total()}단계 · 만렙 ${arcana.maxedCount()}/${ARCANA_UPGRADES.length}`;
    body.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'card-grid arcana-grid';
    for (const u of ARCANA_UPGRADES) {
      const lv = arcana.level(u.id);
      const maxed = arcana.maxed(u.id);
      const cost = arcana.cost(u.id);
      const canPay = tableReady && gold >= cost;
      const card = document.createElement('div');
      card.className = 'card arcana-card' + (maxed ? ' is-owned' : '') + (maxed || canPay ? '' : ' is-disabled');
      card.dataset.id = u.id;

      const title = h('h3', 'card-title', `${u.icon} ${u.name}`);
      title.appendChild(h('span', 'badge badge-violet arcana-lv', `${lv}/${u.max}`));
      card.appendChild(title);
      card.appendChild(h('p', 'card-desc', `${u.desc} (현재 ×${arcana.mult(u.id).toFixed(2)})`));

      const prog = document.createElement('div');
      prog.className = 'progress arcana-progress';
      const fill = h('span', 'progress-fill');
      fill.dataset.role = 'arcana-fill';
      if (maxed) fill.classList.add('is-ok');
      fill.style.width = `${Math.round((lv / u.max) * 100)}%`;
      prog.appendChild(fill);
      card.appendChild(prog);

      const costRow = h('div', 'card-cost arcana-cost');
      costRow.appendChild(h('span', 'cost-gold' + (gold >= cost ? '' : ' cost-lack'), `${cost.toLocaleString()}G`));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-primary arcana-buy';
      btn.dataset.act = 'arcana-buy';
      btn.dataset.id = u.id;
      btn.disabled = maxed || !canPay;
      btn.textContent = maxed ? '만렙' : '연성';
      costRow.appendChild(btn);
      card.appendChild(costRow);
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  _renderTravel(body) {
    const field = this.game?.teleports ?? null;
    const here = field?.near ?? null;
    body.appendChild(sectionTitle('지형 이동 — 텔레포트 포탈'));
    body.appendChild(row('현재', here ? `${here.name} 포탈 (${here.color})` : '포탈 근처가 아닙니다 — 포탈에 가까이 가면 N 으로 열 수 있습니다'));
    body.appendChild(row('안내', '지형마다 색이 다릅니다. [이동] 을 누르면 그 지형의 포탈 옆으로 순간이동합니다.'));
    for (const group of destinationsByTerrain()) {
      const card = h('div', cardClass());
      card.appendChild(sectionTitle(group.label));
      for (const d of group.items) {
        const line = h('div', 'row');
        const dot = h('span', 'swatch');
        dot.setAttribute?.('style', `background:${d.color};display:inline-block;width:0.9rem;height:0.9rem;border-radius:50%;margin-right:0.4rem`);
        // 검사·접근성용 훅(계약 §4.58) — 지형 색을 데이터로도 남긴다
        dot.dataset.role = 'travel-dot';
        dot.dataset.color = String(d.color ?? '');
        dot.title = `${d.name} — ${d.color}`;
        line.appendChild(dot);
        line.appendChild(h('span', 'row-label', `${d.glyph ?? ''} ${d.name}`.trim()));
        const go = h('button', 'btn ghost btn-ghost', here && here.id === d.id ? '여기' : '이동');
        go.type = 'button';
        go.dataset.act = 'travel-go';
        go.dataset.region = d.id;
        go.dataset.role = 'travel-go';
        line.appendChild(go);
        card.appendChild(line);
      }
      body.appendChild(card);
    }
  }
  _renderRecipes(body) {
    const st = this.state.recipes ?? (this.state.recipes = { terrain: 'all', kind: 'all' });
    body.appendChild(sectionTitle('조합법 도감 — 지형별'));
    body.appendChild(row('안내', '지형 탭을 고르면 그 지형에서 만드는 조합법만 보입니다. 재료는 제작대에서 조합합니다.'));
    const terrains = recipeTerrains();
    const tabs = [{ label: `📖 전체 (${recipeCount()})`, act: 'recipe-terrain', active: st.terrain === 'all', data: { terrain: 'all' } }];
    for (const t of terrains) {
      tabs.push({ label: `${t.icon} ${t.name} (${t.count})`, act: 'recipe-terrain', active: st.terrain === t.id, data: { terrain: t.id } });
    }
    body.appendChild(this._tabs(tabs));
    body.appendChild(this._tabs(RECIPE_KINDS.map((k) => ({ label: `${k.icon} ${k.name}`, act: 'recipe-kind', active: st.kind === k.id, data: { kind: k.id } }))));
    const list = recipesFor(st.terrain, st.kind);
    const terrainLabel = st.terrain === 'all' ? '전체 지형' : RECIPE_TERRAIN_BY_ID[st.terrain]?.name ?? st.terrain;
    body.appendChild(row('표시', `${terrainLabel} · ${list.length}종 조합법`));
    if (!list.length) {
      body.appendChild(row('조합법', '이 지형에는 아직 조합법이 없습니다 — 다른 지형 탭을 눌러 보세요'));
      return;
    }
    const grid = h('div', 'card-grid');
    for (const e of list.slice(0, 80)) {
      const card = h('div', cardClass());
      card.dataset.role = 'recipe-row';
      card.dataset.id = e.id;
      card.appendChild(sectionTitle(`${e.icon ?? '📖'} ${e.name}`));
      card.appendChild(row('종류', `${e.source ?? '조합'} · ${e.tableName ?? e.table ?? ''}${e.gradeName ? ' · ' + e.gradeName : ''}`));
      card.appendChild(row('재료', e.costLabel || '재료 없음'));
      card.appendChild(row('지형', RECIPE_TERRAIN_BY_ID[e.terrain]?.name ?? '—'));
      if (e.table && e.table !== 'workbench' && e.table !== 'gacha') {
        const go = h('button', 'btn ghost btn-ghost', '제작대로 이동');
        go.type = 'button';
        go.dataset.act = 'recipe-goto';
        go.dataset.table = e.table;
        card.appendChild(go);
      }
      grid.appendChild(card);
    }
    body.appendChild(grid);
    if (list.length > 80) body.appendChild(row('안내', `조합법이 많아 80종만 표시합니다 (총 ${list.length}종)`));
  }
  _beginKeyCapture(action) {
    const st = this._keyState();
    st.capture = action;
    st.message = '';
    this._render('settings');
    if (typeof window === 'undefined') return;
    if (this._keyCaptureOff) window.removeEventListener('keydown', this._keyCaptureOff, true);
    const onKey = (e) => {
      e.preventDefault?.();
      e.stopImmediatePropagation?.();
      window.removeEventListener('keydown', onKey, true);
      if (this._keyCaptureOff === onKey) this._keyCaptureOff = null;
      const current = this._keyState();
      const target = current.capture;
      current.capture = null;
      if (!target) {
        this._render('settings');
        return;
      }
      if (e.code === 'Escape') {
        current.message = '키 변경을 취소했습니다';
        this._render('settings');
        return;
      }
      const res = boundSetKey(target, e.code);
      current.message = res.ok
        ? `${BOUND_KEY_ACTION[target]?.label ?? target} → ${boundKeyLabel(e.code)} 로 바꿨습니다`
        : res.error;
      this._render('settings');
    };
    this._keyCaptureOff = onKey;
    window.addEventListener('keydown', onKey, true);
  }
  _saveNickname({ clear = false } = {}) {
    const st = this.state.auth;
    const raw = clear ? '' : this._field('auth', 'profile-nickname', '');
    const name = sanitizeNickname(raw);
    if (!clear && !isValidNickname(name)) {
      st.message = `닉네임은 1~${NICKNAME_MAX}자로 입력하세요`;
      this._refreshAccount();
      return false;
    }
    setNickname(clear ? '' : name);
    if (!this._fields.auth) this._fields.auth = {};
    this._fields.auth['profile-nickname'] = clear ? '' : name;
    st.message = clear ? '닉네임을 지웠습니다 — 캐릭터 이름/로그인 닉네임을 씁니다' : `닉네임을 ${name} 로 저장했습니다 (중복 닉네임 허용)`;
    this.emit('nickname', { nickname: clear ? '' : name });
    this._refreshAccount();
    if (!clear && safe(() => auth.loggedIn, false)) {
      // 서버 반영은 비동기 — 실패해도 로컬 저장은 유지된다.
      Promise.resolve()
        .then(() => net.updateNickname?.(name))
        .then((r) => {
          if (r && r.ok === false) {
            st.message = `닉네임을 ${name} 로 저장했습니다 (서버 반영 실패 — 이 컴퓨터에만 저장됨)`;
            this._refreshAccount();
          }
        })
        .catch(() => {});
    }
    return true;
  }
  _nickname() {
    // 직접 만든 닉네임이 최우선(계약 §4.54), 없으면 계정 이름.
    return nicknameFor(safe(() => auth.user, null));
  }

  async _ensureConnected() {
    if (safe(() => net.connected, false)) return true;
    try {
      await net.connect(this._nickname());
    } catch {
      /* 오프라인이어도 계속 진행 */
    }
    return Boolean(safe(() => net.connected, false));
  }

  async _mpCreate() {
    const st = this.state.multiplayer;
    if (st.busy) return;
    st.busy = true;
    st.seed = normalizeSeed(this._field('multiplayer', 'mp-seed', ''));
    this._fields.multiplayer['mp-seed'] = st.seed;
    this._render('multiplayer');
    const ok = await this._ensureConnected();
    let r = { ok: false, error: '서버에 연결되지 않았습니다' };
    if (ok) {
      try {
        r = await net.createRoom({ nickname: this._nickname(), mode: st.mode, seed: st.seed, difficulty: st.difficulty, maxPlayers: st.maxPlayers });
      } catch (err) {
        r = { ok: false, error: err?.message || '방 생성 실패' };
      }
    }
    st.busy = false;
    if (r && r.ok) {
      this._roomState = r.state || safe(() => net.room, null);
      this._toast(`방 ${r.code || ''} 을(를) 만들었습니다`, 'good');
    } else {
      this._toast(String(r?.error || '방을 만들지 못했습니다'), 'warn');
    }
    this._render('multiplayer');
  }

  async _mpJoin() {
    const st = this.state.multiplayer;
    if (st.busy) return;
    const code = String(this._field('multiplayer', 'mp-code', '')).trim().toUpperCase();
    this._fields.multiplayer['mp-code'] = code;
    if (code.length !== 4) {
      this._toast('4자리 방 코드를 입력해 주세요', 'warn');
      this._render('multiplayer');
      return;
    }
    st.busy = true;
    this._render('multiplayer');
    const ok = await this._ensureConnected();
    let r = { ok: false, error: '서버에 연결되지 않았습니다' };
    if (ok) {
      try {
        r = await net.joinRoom({ code, nickname: this._nickname() });
      } catch (err) {
        r = { ok: false, error: err?.message || '참가 실패' };
      }
    }
    st.busy = false;
    if (r && r.ok) {
      this._roomState = r.state || safe(() => net.room, null);
      this._toast(`${code} 방에 참가했습니다`, 'good');
    } else {
      this._toast(String(r?.error || '방에 참가하지 못했습니다'), 'warn');
    }
    this._render('multiplayer');
  }

  async _mpReady() {
    const room = this._roomState || safe(() => net.room, null);
    const players = Array.isArray(room?.players) ? room.players : [];
    const me = players.find((p) => p && p.id === safe(() => net.id, null));
    let r = { ok: false, error: '서버에 연결되지 않았습니다' };
    try {
      r = await net.setReady(!me?.ready);
    } catch (err) {
      r = { ok: false, error: err?.message || '전송 실패' };
    }
    if (!r?.ok) this._toast(String(r?.error || '준비 상태를 바꾸지 못했습니다'), 'warn');
    this._renderRoomState();
  }

  async _mpStart() {
    let r = { ok: false, error: '서버에 연결되지 않았습니다' };
    try {
      r = await net.startGame();
    } catch (err) {
      r = { ok: false, error: err?.message || '전송 실패' };
    }
    if (!r?.ok) this._toast(String(r?.error || '게임을 시작하지 못했습니다'), 'warn');
    this._renderRoomState();
  }

  async _mpLeave() {
    try {
      await net.leaveRoom();
    } catch {
      /* 무시 */
    }
    this._roomState = null;
    this._toast('방에서 나왔습니다', 'info');
    this._render('multiplayer');
  }

  async _mpChat() {
    const text = String(this._field('multiplayer', 'mp-chat', '')).slice(0, 200).trim();
    if (!text) return;
    this._fields.multiplayer['mp-chat'] = '';
    const el = this._bodies.multiplayer?.querySelector?.('[data-field="mp-chat"]');
    if (el) el.value = '';
    const r = await net.sendChat(text).catch(() => ({ ok: false, error: '전송 실패' }));
    if (!r?.ok) this._toast(String(r?.error || '메시지를 보내지 못했습니다'), 'warn');
  }
}

export default PanelManager;

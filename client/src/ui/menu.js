// 요새의 수호자 — 메인 메뉴 (계약 §4.18).
// #menu-root 안에 타이틀 화면을 그리고, 시작/멀티/설정/도움말/로그인 이벤트만 발행한다.
import { VERSION, MODES, DIFFICULTIES, SEED_GALLERY, FRAME_PRESETS } from '../data.js';
import { normalizeSeed } from '../utils/rng.js';
import { INVITE_CODE_LENGTH, isValidInviteCode, loadLastCode, normalizeInviteCode } from '../utils/invite.js';
import { auth, roomList } from '../net.js';
import { NICKNAME_MAX, currentNickname, nicknameFor, setNickname } from '../profile.js';
import { ENDLESS_UNLOCK_WAVE, isEndlessUnlocked } from '../progress.js';
import { KEYBINDS } from './panels.js';
import {
  CHARACTER_NAME_MAX,
  CHARACTER_SKINS,
  createCharacterStore,
  characterLabel,
  sanitizeCharacter
} from '../character.js';

const TABS = { main: '메인', character: '🧍 캐릭터', seeds: '시드 갤러리', help: '도움말' };
const CAROUSEL_INTERVAL = 4.5;
/** 열린 방 목록 자동 갱신 주기(초) */
const ROOMS_REFRESH_SEC = 4;

const RULES = [
  '기지 HP가 0이 되면 패배합니다. 웨이브 사이 30초 동안 포탑을 세우고 다음 공격을 준비하세요.',
  '골드·목재·광물로 포탑을 짓고, 부여대에서 마법을 뽑아 6칸까지 장착합니다.',
  '10의 배수 웨이브마다 보스가 등장합니다. 보스를 놓치면 기지가 크게 흔들립니다.',
  'ESC 로 일시정지, B 건설, E 부여대. 자원이 부족한 포탑은 흐리게 표시됩니다.',
  '요정 7명을 모두 만나면 요정 왕관(마나 회복 +30%)을 얻습니다.'
];

const CREDITS = [
  '제작: 요새의 수호자 팀',
  '엔진: Three.js ^0.170 · Vite 6 · Node 22 + socket.io 4',
  '모든 그래픽·사운드는 코드로 절차 생성됩니다 (외부 에셋 없음).'
];

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

// 계약 클래스(.row/.row-label/.row-value) + 스타일시트 별칭(.stat-row)
/** 데이터 목록(MODES/DIFFICULTIES)에서 표시 이름을 찾는다 */
function labelFor(list, id, fallback) {
  const found = Array.isArray(list) ? list.find((x) => x && x.id === id) : null;
  return found?.name || String(id || fallback || '');
}

function row(label, value) {
  const r = h('div', 'row stat-row');
  r.appendChild(h('span', 'row-label', label));
  r.appendChild(h('span', 'row-value', value));
  return r;
}

function ensureRoot(doc, id) {
  let el = doc.getElementById(id);
  if (!el) {
    el = doc.createElement('div');
    el.id = id;
    const parent = doc.getElementById('app') || doc.body;
    if (parent) parent.appendChild(el);
  }
  return el || null;
}

function urlSeed() {
  try {
    const search = globalThis.location?.search;
    if (!search) return '';
    const v = new URLSearchParams(search).get('seed');
    return v ? String(v) : '';
  } catch {
    return '';
  }
}

export class MainMenu {
  constructor({ game } = {}) {
    this.game = game || null;
    this._listeners = new Map();
    // 서버 주소 / 초대코드 — main.js 가 만들어 준 값을 여기 담아 보여준다.
    this._share = { address: '', code: '', link: '' };
    this._fields = this._fields || {};
    this._carousel = 0;
    this._carouselTimer = 0;
    this._acctTimer = 0;
    this._bound = {
      click: (e) => this._onClick(e),
      input: (e) => this._onInput(e),
      keydown: (e) => this._onKeyDown(e)
    };
    this.state = {
      mode: safe(() => this.game?.mode, null) || 'solo',
      difficulty: safe(() => this.game?.difficulty, null) || 'normal'
    };
    const doc = globalThis.document;
    this.root = doc ? ensureRoot(doc, 'menu-root') : null;
    this._tab = 'main';
    this._menuEl = null;
    // 캐릭터(이름·외형) — 로비/멀티플레이가 그대로 사용한다.
    this.characterStore = createCharacterStore();
    this.character = this.characterStore.load(safe(() => auth.user?.nickname, '') || '');
    this._characterSavedNote = '';
    this._flashTimer = 0;
    // 열린 방 목록(메인 화면) — 서버 /api/rooms 를 몇 초마다 조용히 다시 읽는다.
    this.rooms = [];
    this.roomsError = '';
    this._roomsEl = null;
    this._roomsTimer = 0;
    this._roomsBusy = false;
    if (this.root) {
      this.root.style.pointerEvents = 'none';
      this._render();
      this.hide();
      this.root.addEventListener('click', this._bound.click);
      this.root.addEventListener('input', this._bound.input);
      this.root.addEventListener('keydown', this._bound.keydown);
      // ESC — 하위 화면(싱글/멀티/설정/시드 갤러리…)이면 메인으로. 캡처 단계라 게임 키 처리보다 먼저 받는다.
      this._bound.escape = (e) => this._onEscape(e);
      globalThis.document?.addEventListener?.('keydown', this._bound.escape, true);
    }
  }

  // ── 공개 API (§4.18) ────────────────────────────
  show(initialTab = 'main') {
    if (!this.root) return false;
    // 메뉴를 새로 열 때 시작 화면(버튼만) — 버튼으로 연 화면은 그대로 둔다(H-95).
    if (!this.root.dataset.view) this.root.dataset.view = 'main';
    this._tab = TABS[initialTab] ? initialTab : 'main';
    this._render();
    if (this._tab === 'main') this.refreshRooms(true);
    this._menuEl?.classList.remove('hidden');
    this.root.classList.remove('hidden');
    this.root.style.pointerEvents = '';
    this.emit('show', { tab: this._tab });
    this._syncView();
    this._syncHero();
    return true;
  }

  hide() {
    if (!this.root) return false;
    this._menuEl?.classList.add('hidden');
    this.root.classList.add('hidden');
    this.root.style.pointerEvents = 'none';
    this.emit('hide', {});
    return true;
  }

  get visible() {
    if (!this.root) return false;
    if (!this._menuEl) return !this.root.classList.contains('hidden');
    return !this.root.classList.contains('hidden') && !this._menuEl.classList.contains('hidden');
  }

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
          console.warn(`[menu] ${event} 처리 오류`, err);
        }
      }
    }
    return payload;
  }

  update(dt) {
    if (!this.visible) return;
    if (this._tab === 'main') {
      this._carouselTimer += num(dt, 0);
      if (this._carouselTimer >= CAROUSEL_INTERVAL) {
        this._carouselTimer = 0;
        this._stepCarousel(1);
      }
    }
    if (this._tab === 'main') {
      this._roomsTimer += num(dt, 0);
      if (this._roomsTimer >= ROOMS_REFRESH_SEC) {
        this._roomsTimer = 0;
        this.refreshRooms();
      }
    }
    this._acctTimer += num(dt, 0);
    if (this._acctTimer >= 1) {
      this._acctTimer = 0;
      const el = this.root?.querySelector?.('[data-role="account"]');
      if (el) {
        const label = this._accountLabel();
        if (el.textContent !== label) el.textContent = label;
      }
    }
  }

  refresh() {
    this._render();
  }

  /** 열린 방 목록을 서버에서 다시 읽는다(실패하면 이전 목록을 그대로 두고 안내만 바꾼다) */
  async refreshRooms(force = false) {
    if (this._roomsBusy) return this.rooms;
    this._roomsBusy = true;
    try {
      const data = await roomList.load(force);
      if (data) this.setRooms(data.rooms, '');
      else this.setRooms(this.rooms, roomList.error || '방 목록을 불러오지 못했습니다');
    } catch {
      this.setRooms(this.rooms, '방 목록을 불러오지 못했습니다');
    } finally {
      this._roomsBusy = false;
      this._roomsTimer = 0;
    }
    return this.rooms;
  }

  /** 방 목록 상태 반영 — 비공개 방은 서버가 이미 걸러내지만 한 번 더 거른다 */
  setRooms(rooms, error = '') {
    const list = Array.isArray(rooms) ? rooms : [];
    this.rooms = list.filter((r) => r && typeof r.code === 'string' && r.code && r.private !== true);
    this.roomsError = String(error || '');
    this._renderRooms();
    return this.rooms;
  }

  /** 열린 방 목록 DOM 갱신(카드 전체를 다시 그리지 않아 입력값·스크롤이 유지된다) */
  _renderRooms() {
    const box = this._roomsEl;
    if (!box) return false;
    if (typeof box.replaceChildren === 'function') box.replaceChildren();
    else box.textContent = '';
    if (!this.rooms.length) {
      box.appendChild(h('div', `menu-rooms-empty${this.roomsError ? ' warn' : ''}`, this.roomsError || '아직 열린 방이 없습니다 — 로비에서 방을 만들면 여기에 뜹니다.'));
      return true;
    }
    for (const room of this.rooms) box.appendChild(this._roomRow(room));
    return true;
  }

  /** 방 한 줄 — [코드] 모드 · 난이도 · 인원 · 방장 + 참가 버튼 */
  _roomRow(room) {
    const joinable = room.joinable !== false;
    const players = num(room.players, 0);
    const maxPlayers = Math.max(1, num(room.maxPlayers, 4));
    const line = h('div', 'row menu-room');
    line.dataset.code = String(room.code);
    line.appendChild(h('span', 'row-label', `코드 ${room.code}`));
    const info = `${labelFor(MODES, room.mode, '협동')} · ${labelFor(DIFFICULTIES, room.difficulty, '보통')} · ${players}/${maxPlayers}명`;
    line.appendChild(h('span', 'row-value', room.host ? `${info} · 방장 ${room.host}` : info));
    const btn = h('button', `btn ${joinable ? 'primary btn-primary' : 'ghost btn-ghost'}`, joinable ? '참가' : players >= maxPlayers ? '정원 초과' : '참가 불가');
    btn.type = 'button';
    btn.disabled = !joinable;
    btn.dataset.act = 'menu-room-join';
    btn.dataset.code = String(room.code);
    line.appendChild(btn);
    return line;
  }

  dispose() {
    if (this.root) {
      this.root.removeEventListener('click', this._bound.click);
      this.root.removeEventListener('input', this._bound.input);
      this.root.removeEventListener('keydown', this._bound.keydown);
    }
    if (this._bound.escape) globalThis.document?.removeEventListener?.('keydown', this._bound.escape, true);
    this._listeners.clear();
  }

  // ── 입력 (이벤트 위임) ──────────────────────────
  _onClick(e) {
    const target = e.target?.closest?.('[data-act]');
    if (!target || !this.root.contains(target)) return;
    if (target.disabled) return;
    const d = target.dataset;
    switch (d.act) {
      case 'menu-tab':
        this._tab = TABS[d.tab] ? d.tab : 'main';
        this._characterSavedNote = '';
        this._render();
        break;
      case 'character-skin':
        this.character = sanitizeCharacter({ ...this.character, skin: d.skin }, '');
        this._characterSavedNote = '';
        this._render();
        break;
      case 'character-random': {
        const pick = CHARACTER_SKINS[Math.floor(Math.random() * CHARACTER_SKINS.length)];
        this.character = sanitizeCharacter({ ...this.character, skin: pick.id }, '');
        this._characterSavedNote = `외형을 ${pick.icon} ${pick.name} 으로 바꿨습니다 — 저장을 누르세요`;
        this._render();
        break;
      }
      case 'character-save': {
        const name = this._field('character-name', this.character.name);
        // 닉네임도 함께 저장한다(계약 §4.54) — 비우면 해제.
        const nick = setNickname(this._field('nickname', currentNickname()));
        const saved = this.characterStore.save({ ...this.character, name }, safe(() => auth.user?.nickname, '') || '');
        this.character = saved;
        this._fields['character-name'] = saved.name;
        this._fields.nickname = nick;
        this._characterSavedNote = `저장했습니다 — ${characterLabel(saved)}${nick ? ` · 닉네임 ${nick}` : ''}`;
        this.emit('character', { character: saved });
        this._toast('캐릭터를 저장했습니다', 'good');
        this._render();
        break;
      }
      case 'menu-mode':
        this.state.mode = d.mode || 'solo';
        this._render();
        break;
      case 'menu-diff':
        this.state.difficulty = d.diff || 'normal';
        this._render();
        break;
      case 'menu-random-seed':
        this._fields['menu-seed'] = normalizeSeed('');
        this._render();
        break;
      case 'menu-start':
        this._start();
        break;
      case 'menu-carousel':
        this._stepCarousel(Number(d.dir) || 1);
        break;
      case 'menu-carousel-use':
        this._useCarouselSeed();
        break;
      case 'menu-seed-pick': {
        const seed = String(d.seed ?? '');
        this._fields['menu-seed'] = seed;
        this.emit('seed:pick', { seed });
        this._toast(`시드 ${seed} 선택`, 'info');
        this._render();
        break;
      }
      case 'menu-multiplayer':
        this.emit('multiplayer', { mode: this.state.mode, difficulty: this.state.difficulty });
        this.hide();
        break;
      case 'menu-server-connect': {
        // 마인크래프트처럼 주소만 넣고 접속 — 비우면 지금 서버(내 PC)로 돌아온다.
        const address = String(this._field('menu-server', '')).trim();
        this._fields['menu-server'] = address;
        this.emit('server-connect', { address });
        break;
      }
      case 'share-address':
        this.emit('share:address', {});
        break;
      case 'share-invite':
        this.emit('share:invite', { mode: this.state.mode, difficulty: this.state.difficulty });
        break;
      case 'share-copy':
        this.emit('share:copy', { kind: d.kind || 'address' });
        break;
      case 'menu-invite-join': {
        const code = normalizeInviteCode(d.code || this._field('menu-invite', ''));
        if (!isValidInviteCode(code)) {
          this._toast(`초대코드 ${INVITE_CODE_LENGTH}자리를 입력하세요`, 'warn');
          break;
        }
        this._fields['menu-invite'] = code;
        this.emit('multiplayer:join', { code });
        this.hide();
        break;
      }
      case 'menu-room-join': {
        const code = normalizeInviteCode(d.code || '');
        if (!isValidInviteCode(code)) {
          this._toast(`초대코드 ${INVITE_CODE_LENGTH}자리를 입력하세요`, 'warn');
          break;
        }
        // 목록에서 눌러 참가할 때도 코드 입력칸을 맞춰 둔다(다시 열었을 때 방금 참가한 코드가 보인다).
        this._fields['menu-invite'] = code;
        const codeInput = this.root?.querySelector?.('[data-field="menu-invite"]');
        if (codeInput) codeInput.value = code;
        this.emit('multiplayer:join', { code });
        this.hide();
        break;
      }
      case 'menu-rooms-refresh':
        this.refreshRooms(true);
        break;
      case 'menu-settings':
        // 패널 열기는 emit('settings') → main.js 핸들러 한 곳에서만 처리한다.
        // (여기서 togglePanel 까지 부르면 두 번 토글되어 열리자마자 닫히고 빈 화면이 된다)
        this.emit('settings', {});
        this.hide();
        break;
      case 'menu-classes':
        this.game?.togglePanel?.('classes');
        this.hide();
        break;
      case 'menu-achievements':
        this.game?.togglePanel?.('achievements');
        this.hide();
        break;
      case 'menu-codex':
        this.emit('codex', {});
        this.game?.togglePanel?.('codex');
        this.hide();
        break;
      case 'menu-minigame': {
        // 본편 화면 위에 그대로 띄운다(새 탭 아님). 오버레이를 못 쓰는 환경이면 새 탭으로 폴백한다.
        this.emit('minigame', {});
        if (this.game?.openMiniGame?.()) break;
        const opener = typeof window !== 'undefined' ? window.open : null;
        const win = opener ? opener.call(window, '/mini-game.html', '_blank', 'noopener') : null;
        if (!win) this.game?.notify?.('미니게임 주소 — /mini-game.html (새 탭을 허용해 주세요)', 'info');
        break;
      }
      case 'menu-auth':
        this.emit('auth', {});
        this.hide();
        break;
      case 'menu-help':
        this.emit('help', {});
        this.show('help');
        break;
      case 'menu-seeds':
        this.show('seeds');
        break;
      case 'menu-resume':
        this.emit('resume', {});
        this.hide();
        break;
      default:
        break;
    }
  }

  _onInput(e) {
    const field = e.target?.dataset?.field;
    if (field === 'menu-invite') {
      const normalized = normalizeInviteCode(e.target.value);
      if (e.target.value !== normalized) e.target.value = normalized;
      this._fields[field] = normalized;
      const btn = this.root?.querySelector?.('[data-act="menu-invite-join"]');
      if (btn) btn.disabled = !isValidInviteCode(normalized);
      return;
    }
    if (field === 'character-name') {
      const clamped = String(e.target.value ?? '').slice(0, CHARACTER_NAME_MAX);
      if (e.target.value !== clamped) e.target.value = clamped;
      this._fields[field] = clamped;
      const el = this.root?.querySelector?.('[data-role="character-preview"] .character-preview-text');
      if (el) el.textContent = characterLabel({ name: clamped, skin: this.character?.skin });
      return;
    }
    if (field) this._fields[field] = e.target.value;
  }

  _onKeyDown(e) {
    if (e.key !== 'Enter') return;
    const field = e.target?.dataset?.field;
    if (field === 'menu-seed') {
      e.preventDefault();
      this._start();
    } else if (field === 'menu-invite') {
      e.preventDefault();
      this._joinInviteFromField();
    }
  }

  /** 메인 화면 초대코드 입력칸 → 참가 */
  _joinInviteFromField() {
    const code = normalizeInviteCode(this._field('menu-invite', ''));
    if (!isValidInviteCode(code)) {
      this._toast(`초대코드 ${INVITE_CODE_LENGTH}자리를 입력하세요`, 'warn');
      return false;
    }
    this._fields['menu-invite'] = code;
    this.emit('multiplayer:join', { code });
    this.hide();
    return true;
  }

  /** 내 세이브/서버 정보 갱신 — main.js 가 만들어 준 서버 주소·초대코드를 카드에 반영한다. */
  setShareInfo(patch = {}) {
    this._share = { ...(this._share || {}), ...patch };
    safe(() => this.refresh());
    return this._share;
  }

  _stored(name, fallback = '') {
    if (!(name in this._fields)) this._fields[name] = fallback;
    return this._fields[name];
  }

  _field(name, fallback = '') {
    const el = this.root?.querySelector?.(`[data-field="${name}"]`);
    if (el && typeof el.value === 'string') return el.value;
    return this._stored(name, fallback);
  }

  _toast(text, type = 'info') {
    const g = this.game;
    if (typeof g?.notify === 'function') {
      safe(() => g.notify(text, type));
      return;
    }
    const root = globalThis.document?.getElementById('toast-root');
    if (!root) return;
    const el = h('div', 'toast row', text);
    el.dataset.type = type;
    root.appendChild(el);
    setTimeout(() => safe(() => el.remove()), 2600);
  }

  // ── 시작 ────────────────────────────────────────
  _start() {
    const raw = String(this._field('menu-seed', ''));
    const seed = normalizeSeed(raw);
    this._fields['menu-seed'] = seed;
    const payload = { mode: this.state.mode, seed, difficulty: this.state.difficulty };
    this.emit('start', payload);
    // main.js 가 상태를 바꾸면 메뉴를 내린다 (직접 hide() 를 부르지 않아도 되도록).
    const after = () => {
      const s = safe(() => this.game?.state, null);
      if (typeof s === 'string' && s !== 'menu') this.hide();
    };
    after();
    globalThis.setTimeout?.(after, 700);
    return payload;
  }

  _stepCarousel(dir) {
    const n = SEED_GALLERY.length || 1;
    this._carousel = (((this._carousel + dir) % n) + n) % n;
    this._syncCarousel();
  }

  _useCarouselSeed() {
    const entry = SEED_GALLERY[this._carousel];
    if (!entry) return;
    this._fields['menu-seed'] = String(entry.seed);
    this.emit('seed:pick', { seed: String(entry.seed) });
    this._toast(`추천 시드 ${entry.seed} 선택`, 'info');
    this._render();
  }

  _syncCarousel() {
    const entry = SEED_GALLERY[this._carousel];
    if (!entry) return;
    const set = (role, text) => {
      const el = this.root?.querySelector?.(`[data-role="${role}"]`);
      if (el) el.textContent = text;
    };
    set('carousel-name', entry.name);
    set('carousel-seed', `#${entry.seed}`);
    set('carousel-desc', entry.desc);
    set('carousel-tags', (entry.tags || []).join(' · '));
    const dots = this.root?.querySelectorAll?.('[data-role="carousel-dot"]');
    if (dots) dots.forEach((dot, i) => dot.classList.toggle('active', i === this._carousel));
  }

  _accountLabel() {
    const user = safe(() => auth.user, null);
    const loggedIn = Boolean(safe(() => auth.loggedIn, false));
    const who = `${nicknameFor(user)} 님 접속 중`;
    return loggedIn ? who : '게스트 (오프라인 가능)';
  }

  // ── 렌더 ────────────────────────────────────────
  _render() {
    if (!this.root) return;
    this.root.textContent = '';
    // .menu-overlay / .menu-shell / .menu-hero 는 스타일시트 구조 별칭이다.
    const menu = h('div', 'menu menu-overlay');
    menu.dataset.tab = this._tab;
    this._menuEl = menu;
    const shell = h('div', 'menu-shell');

    const title = h('div', 'menu-head menu-hero');
    title.appendChild(h('h1', 'menu-title', '요새의 수호자'));
    // 귀엽게 — 부제와 장식(계약 §4.75).
    title.appendChild(h('p', 'menu-subtitle', '마법의 비밀'));
    title.appendChild(h('div', 'menu-deco', '🏰 ✨ 🔮 ✨ 🛡️'));
    this._renderHeroActions(); // 본문 렌더와 무관하게 항상 띄운다
    title.appendChild(
      h('div', 'menu-version menu-sub', `v${String(safe(() => this.game?.VERSION, null) || VERSION)} · FPS + 타워 디펜스`)
    );
    shell.appendChild(title);

    const tabs = h('div', 'tabs panel-tabs menu-tabs');
    for (const key of Object.keys(TABS)) {
      const b = h('button', 'tab panel-tab' + (key === this._tab ? ' active is-active' : ''), TABS[key]);
      b.type = 'button';
      b.dataset.act = 'menu-tab';
      b.dataset.tab = key;
      tabs.appendChild(b);
    }
    shell.appendChild(tabs);

    const body = h('div', 'menu-body');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '14px';
    if (this._tab === 'character') this._renderCharacter(body);
    else if (this._tab === 'seeds') this._renderSeeds(body);
    else if (this._tab === 'help') this._renderHelp(body);
    else this._renderMain(body);
    shell.appendChild(body);

    const foot = h('div', 'menu-foot menu-footer');
    const acct = h('div', 'row stat-row');
    acct.dataset.role = 'account';
    acct.textContent = this._accountLabel();
    foot.appendChild(acct);
    // 하단 [로그인][도움말][설정] 버튼은 제거했다(사용자 요청).
    //  · 도움말은 위 탭, 설정은 오른쪽 [⚙ 설정] 버튼으로 연다.
    //  · 계정은 [⚙ 설정] → 내 정보 에서 관리한다.
    shell.appendChild(foot);

    menu.appendChild(shell);
    this.root.appendChild(menu);
    if (this.root.classList.contains('hidden')) menu.classList.add('hidden');
    this._syncCarousel();
    this._syncView();
    this._syncHero();
  }

  _renderMain(body) {
    // 화면 상태는 _heroAct 가 정한다 — 여기서 덮어쓰면 버튼으로 연 화면이 곧바로 닫힌다(H-95).
    this._renderHeroActions(body);

    // ══ 싱글 플레이 — 금빛 카드 · 중간 크기(760px) ════════════════════
    const start = h('div', 'menu-card menu-solo');
    start.dataset.screen = 'solo';   // 싱글 플레이 버튼을 눌러야 보인다

    const soloHero = h('div', 'solo-hero');
    soloHero.appendChild(h('span', 'solo-hero-icon', '🎮'));
    const soloText = h('div', 'solo-hero-text');
    soloText.appendChild(h('h2', 'card-title', '싱글 플레이'));
    soloText.appendChild(h('p', 'solo-hero-sub', '새 게임 — 시드를 고르고 혼자서 요새를 지킨다'));
    soloHero.appendChild(soloText);
    start.appendChild(soloHero);

    const grid = h('div', 'solo-grid');

    // 모드
    const modeField = h('div', 'solo-field');
    modeField.appendChild(h('span', 'solo-label', '모드'));
    const modeTabs = h('div', 'solo-chips');
    const endlessOpen = isEndlessUnlocked();
    if (this.state.mode === 'endless' && !endlessOpen) this.state.mode = 'solo';
    for (const m of MODES) {
      const locked = m.id === 'endless' && !endlessOpen;
      const b = h('button', 'solo-chip' + (m.id === this.state.mode ? ' is-active' : ''), locked ? `${m.name} 🔒` : m.name);
      b.type = 'button';
      b.title = locked ? `웨이브 ${ENDLESS_UNLOCK_WAVE} 을 클리어하면 열립니다` : m.desc;
      b.dataset.act = 'menu-mode';
      b.dataset.mode = m.id;
      if (locked) b.dataset.locked = '1';
      modeTabs.appendChild(b);
    }
    modeField.appendChild(modeTabs);
    const modeInfo = MODES.find((m) => m.id === this.state.mode);
    if (modeInfo) {
      const lockedInfo = modeInfo.id === 'endless' && !endlessOpen;
      modeField.appendChild(h('span', 'solo-note', lockedInfo ? `잠김 — 웨이브 ${ENDLESS_UNLOCK_WAVE} 을 클리어하면 열립니다` : modeInfo.desc));
    }
    grid.appendChild(modeField);

    // 난이도
    const diffField = h('div', 'solo-field');
    diffField.appendChild(h('span', 'solo-label', '난이도'));
    const diffTabs = h('div', 'solo-chips');
    for (const d of DIFFICULTIES) {
      const b = h('button', 'solo-chip' + (d.id === this.state.difficulty ? ' is-active' : ''), d.name);
      b.type = 'button';
      b.title = d.desc;
      b.dataset.act = 'menu-diff';
      b.dataset.diff = d.id;
      diffTabs.appendChild(b);
    }
    diffField.appendChild(diffTabs);
    const diffInfo = DIFFICULTIES.find((d) => d.id === this.state.difficulty);
    if (diffInfo) {
      diffField.appendChild(
        h(
          'span',
          'solo-note',
          `적 HP ×${diffInfo.hpMult} · 공격력 ×${diffInfo.attackMult ?? 1} · 적 수 ×${diffInfo.countMult} · 골드 ×${diffInfo.goldMult}` +
            `${diffInfo.maxWaves ? ` · ${diffInfo.maxWaves} 웨이브 고정` : ''} — ${diffInfo.desc}`
        )
      );
    }
    grid.appendChild(diffField);
    start.appendChild(grid);

    // 시드 — 이 화면의 주인공
    const seedBox = h('div', 'solo-seedbox');
    const seedHead = h('div', 'solo-seedhead');
    seedHead.appendChild(h('span', 'solo-label', '시드'));
    const seedHint = h('span', 'solo-note', '비우면 무작위 6자리');
    seedHead.appendChild(seedHint);
    seedBox.appendChild(seedHead);
    const seedRow = h('div', 'solo-seedrow');
    const seedInput = h('input', 'input solo-seed-input');
    seedInput.type = 'text';
    seedInput.placeholder = '예: 42 · 777 · 2024';
    seedInput.dataset.field = 'menu-seed';
    seedInput.value = this._stored('menu-seed', safe(() => this.game?.seed, null) || urlSeed() || '');
    seedRow.appendChild(seedInput);
    const seedRandom = h('button', 'btn ghost btn-ghost', '🎲 무작위');
    seedRandom.type = 'button';
    seedRandom.dataset.act = 'menu-random-seed';
    seedRow.appendChild(seedRandom);
    const seedGallery = h('button', 'btn ghost btn-ghost', '🗂 갤러리');
    seedGallery.type = 'button';
    seedGallery.dataset.act = 'menu-seeds';
    seedRow.appendChild(seedGallery);
    seedBox.appendChild(seedRow);
    start.appendChild(seedBox);

    // 직업 — 표시만 한다. 전직은 게임 안 중앙코어에서 한다(사용자 요청).
    const classRow = h('div', 'solo-classrow');
    classRow.appendChild(h('span', 'solo-label', '직업'));
    const classVal = h('b', 'solo-class', safe(() => this.game?.classes?.label, '') || '🧭 초심자');
    classVal.dataset.role = 'menu-class';
    classRow.appendChild(classVal);
    classRow.appendChild(h('span', 'solo-note', '전직은 게임 안 중앙코어 앞에서 (E)'));
    start.appendChild(classRow);

    // 바로 가기 — 시드 갤러리·업적·도감·미니게임 (화면은 그대로, 패널만 열린다)
    const soloLinks = h('div', 'solo-links');
    const quickLinks = [
      ['🗂 시드 갤러리', 'menu-seeds'],
      ['🏆 업적', 'menu-achievements'],
      ['📖 도감', 'menu-codex'],
      ['🎯 미니게임', 'menu-minigame']
    ];
    for (const [label, act] of quickLinks) {
      const b = h('button', 'solo-link', label);
      b.type = 'button';
      b.dataset.act = act;
      soloLinks.appendChild(b);
    }
    start.appendChild(soloLinks);
    const acts = h('div', 'solo-actions');
    const solo = h('button', 'btn primary btn-primary solo-start', '혼자 지키기');
    solo.type = 'button';
    solo.dataset.act = 'menu-start';
    acts.appendChild(solo);
    start.appendChild(acts);

    if (safe(() => this.game?.state) === 'paused') {
      const resume = h('button', 'btn ghost btn-ghost', '게임으로 돌아가기');
      resume.type = 'button';
      resume.dataset.act = 'menu-resume';
      start.appendChild(resume);
    }
    body.appendChild(start);

    // ══ 멀티플레이 — 보랏빛 카드 · 중간 크기(880px), 2단 구성 ═══════════
    const multi = h('div', 'menu-card menu-multi');
    multi.dataset.screen = 'multi';   // 멀티플레이 버튼을 눌러야 보인다

    const multiHero = h('div', 'multi-hero');
    multiHero.appendChild(h('span', 'multi-hero-icon', '🌐'));
    const multiText = h('div', 'multi-hero-text');
    multiText.appendChild(h('h2', 'card-title', '멀티플레이'));
    multiText.appendChild(h('p', 'multi-hero-sub', '친구와 같은 요새에서 · 초대코드 또는 서버 주소로 만난다'));
    multiHero.appendChild(multiText);
    multi.appendChild(multiHero);

    const share = this._share || { address: '', code: '', link: '' };
    const multiGrid = h('div', 'multi-grid');

    // ① 초대코드로 참가
    const joinBlock = h('div', 'multi-block');
    const joinHead = h('div', 'multi-block-head');
    joinHead.appendChild(h('span', 'multi-step', '①'));
    joinHead.appendChild(h('span', 'multi-block-title', '초대코드로 참가'));
    joinBlock.appendChild(joinHead);
    const codeRow = h('div', 'multi-inline');
    const codeInput = h('input', 'input menu-invite-input');
    codeInput.type = 'text';
    codeInput.maxLength = INVITE_CODE_LENGTH;
    codeInput.placeholder = 'ABCD';
    codeInput.autocomplete = 'off';
    codeInput.spellcheck = false;
    codeInput.dataset.field = 'menu-invite';
    codeInput.value = normalizeInviteCode(this._stored('menu-invite', '') || loadLastCode());
    codeRow.appendChild(codeInput);
    const joinBtn = h('button', 'btn primary btn-primary', '참가');
    joinBtn.type = 'button';
    joinBtn.dataset.act = 'menu-invite-join';
    joinBtn.disabled = !isValidInviteCode(codeInput.value);
    codeRow.appendChild(joinBtn);
    joinBlock.appendChild(codeRow);
    const last = loadLastCode();
    joinBlock.appendChild(
      h('span', 'multi-note', last ? `최근 코드 ${last} · 위 칸에 넣고 [참가]` : `초대코드 ${INVITE_CODE_LENGTH}자리 — 받은 코드를 넣으세요`)
    );
    multiGrid.appendChild(joinBlock);

    // ② 서버 주소로 접속 (마인크래프트처럼)
    const srvBlock = h('div', 'multi-block');
    const srvHead = h('div', 'multi-block-head');
    srvHead.appendChild(h('span', 'multi-step', '②'));
    srvHead.appendChild(h('span', 'multi-block-title', '서버 주소로 접속'));
    srvBlock.appendChild(srvHead);
    const srvRow = h('div', 'multi-inline');
    const srvInput = h('input', 'input menu-server-input');
    srvInput.type = 'text';
    srvInput.placeholder = '예: 192.168.0.10:3001';
    srvInput.autocomplete = 'off';
    srvInput.spellcheck = false;
    srvInput.dataset.field = 'menu-server';
    srvInput.value = this._stored('menu-server', '');
    srvRow.appendChild(srvInput);
    const srvBtn = h('button', 'btn primary btn-primary', '접속');
    srvBtn.type = 'button';
    srvBtn.dataset.act = 'menu-server-connect';
    srvRow.appendChild(srvBtn);
    srvBlock.appendChild(srvRow);
    const netUrl = safe(() => this.game?.net?.url, '') || '';
    const netOn = Boolean(safe(() => this.game?.net?.connected, false));
    srvBlock.appendChild(h('span', 'multi-note', `지금 서버 ${netUrl || '—'} ${netOn ? '· 연결됨 ✅' : '· 연결 안 됨'}`));
    multiGrid.appendChild(srvBlock);
    multi.appendChild(multiGrid);

    // ③ 초대코드 멀티플레이 — 방 만들기 / 내 주소
    const makeBlock = h('div', 'multi-block multi-block-wide');
    const makeHead = h('div', 'multi-block-head');
    makeHead.appendChild(h('span', 'multi-step', '③'));
    makeHead.appendChild(h('span', 'multi-block-title', '초대코드 멀티플레이 — 방 만들기'));
    makeBlock.appendChild(makeHead);

    const addrRow = h('div', 'multi-row');
    addrRow.appendChild(h('span', 'multi-row-label', '내 서버 주소'));
    const addrVal = h('b', 'multi-row-value', share.address || '아직 없음');
    addrVal.dataset.role = 'share-address';
    addrRow.appendChild(addrVal);
    const mkAddr = h('button', 'btn ghost btn-ghost', '🌐 주소 만들기');
    mkAddr.type = 'button';
    mkAddr.dataset.act = 'share-address';
    addrRow.appendChild(mkAddr);
    const cpAddr = h('button', 'btn ghost btn-ghost', '📋 복사');
    cpAddr.type = 'button';
    cpAddr.dataset.act = 'share-copy';
    cpAddr.dataset.kind = 'address';
    addrRow.appendChild(cpAddr);
    makeBlock.appendChild(addrRow);

    const inviteRow = h('div', 'multi-row');
    inviteRow.appendChild(h('span', 'multi-row-label', '초대코드'));
    const codeVal = h('b', 'multi-row-value', share.code || '아직 없음');
    codeVal.dataset.role = 'share-code';
    inviteRow.appendChild(codeVal);
    const mkCode = h('button', 'btn primary btn-primary', '🎟 초대코드 만들기');
    mkCode.type = 'button';
    mkCode.dataset.act = 'share-invite';
    inviteRow.appendChild(mkCode);
    const cpLink = h('button', 'btn ghost btn-ghost', '📋 초대 링크 복사');
    cpLink.type = 'button';
    cpLink.dataset.act = 'share-copy';
    cpLink.dataset.kind = 'link';
    inviteRow.appendChild(cpLink);
    makeBlock.appendChild(inviteRow);

    makeBlock.appendChild(h('span', 'multi-note', '친구는 위 주소를 [서버 주소] 칸에 넣거나, 초대 링크를 누르면 한 번에 들어옵니다.'));
    multi.appendChild(makeBlock);

    const multiLinks = h('div', 'multi-links');
    for (const [label, act] of [['🏆 업적', 'menu-achievements'], ['📖 도감', 'menu-codex'], ['🎯 미니게임', 'menu-minigame']]) {
      const b = h('button', 'multi-link-btn', label);
      b.type = 'button';
      b.dataset.act = act;
      multiLinks.appendChild(b);
    }
    multi.appendChild(multiLinks);
    const multiActs = h('div', 'multi-actions');
    const lobbyBtn = h('button', 'btn primary btn-primary', '멀티플레이 로비 열기');
    lobbyBtn.type = 'button';
    lobbyBtn.dataset.act = 'menu-multiplayer';
    multiActs.appendChild(lobbyBtn);
    if (last) {
      const again = h('button', 'btn ghost btn-ghost', `최근 코드 ${last} 로 참가`);
      again.type = 'button';
      again.dataset.act = 'menu-invite-join';
      again.dataset.code = last;
      multiActs.appendChild(again);
    }
    multi.appendChild(multiActs);
    // 화면에 보이는 링크도 **방금 만든 공유 링크(_share.link)** 를 그대로 쓴다.
    // 예전에는 loadLastCode() 로 다시 만들었기 때문에 (1) 이전 방 코드가 보이거나
    // (2) localhost 주소가 보여 다른 사람이 열 수 없는 링크를 복사하는 일이 있었다.
    const shareLink = String(share.link || '');
    const linkEl = h('a', 'multi-link', `초대 링크 · ${shareLink || '—'}`);
    linkEl.dataset.role = 'share-link';
    if (shareLink) {
      linkEl.href = shareLink;
      linkEl.target = '_blank';
      linkEl.rel = 'noopener noreferrer';
      linkEl.title = '새 탭에서 초대 링크 열기';
    } else {
      linkEl.classList.add('is-empty');
      linkEl.removeAttribute?.('href');
    }
    multi.appendChild(linkEl);
    // ④ 열린 방 — 같은 서버에 접속한 사람끼리 코드 없이 참가 (멀티 한 창 안에)
    const roomsBlock = h('div', 'multi-block multi-block-wide');
    const roomsHead = h('div', 'multi-block-head');
    roomsHead.appendChild(h('span', 'multi-step', '④'));
    roomsHead.appendChild(h('span', 'multi-block-title', '열린 방 — 클릭해서 참가'));
    const roomsReload = h('button', 'multi-mini', '새로고침');
    roomsReload.type = 'button';
    roomsReload.dataset.act = 'menu-rooms-refresh';
    roomsHead.appendChild(roomsReload);
    roomsBlock.appendChild(roomsHead);
    const roomsBox = h('div', 'menu-rooms-list multi-rooms-list');
    roomsBox.dataset.role = 'rooms';
    roomsBlock.appendChild(roomsBox);
    multi.appendChild(roomsBlock);

    body.appendChild(multi);
    this._roomsEl = roomsBox;
    this._renderRooms();

    const carousel = h('div', 'menu-card menu-carousel');
    carousel.dataset.screen = 'solo';
    carousel.appendChild(h('h2', 'card-title', '추천 시드'));
    const entry = SEED_GALLERY[this._carousel] || SEED_GALLERY[0] || { seed: '', name: '-', desc: '', tags: [] };
    const cName = h('div', 'row stat-row');
    cName.appendChild(h('span', 'row-label', '이름'));
    const cNameValue = h('span', 'row-value', entry.name);
    cNameValue.dataset.role = 'carousel-name';
    cName.appendChild(cNameValue);
    const cSeed = h('div', 'row stat-row');
    cSeed.appendChild(h('span', 'row-label', '시드'));
    const cSeedValue = h('span', 'row-value', `#${entry.seed}`);
    cSeedValue.dataset.role = 'carousel-seed';
    cSeed.appendChild(cSeedValue);
    const cDesc = h('div', 'row stat-row');
    cDesc.appendChild(h('span', 'row-label', '설명'));
    const cDescValue = h('span', 'row-value', entry.desc);
    cDescValue.dataset.role = 'carousel-desc';
    cDesc.appendChild(cDescValue);
    const cTags = h('div', 'row stat-row');
    cTags.appendChild(h('span', 'row-label', '태그'));
    const cTagsValue = h('span', 'row-value', (entry.tags || []).join(' · '));
    cTagsValue.dataset.role = 'carousel-tags';
    cTags.appendChild(cTagsValue);
    carousel.appendChild(cName);
    carousel.appendChild(cSeed);
    carousel.appendChild(cDesc);
    carousel.appendChild(cTags);

    const dots = h('div', 'row stat-row');
    for (let i = 0; i < SEED_GALLERY.length; i++) {
      const dot = h('span', 'tab panel-tab' + (i === this._carousel ? ' active is-active' : ''), '●');
      dot.dataset.role = 'carousel-dot';
      dots.appendChild(dot);
    }
    carousel.appendChild(dots);

    const cActs = h('div', 'row menu-actions');
    const prev = h('button', 'btn ghost btn-ghost', '◀ 이전');
    prev.type = 'button';
    prev.dataset.act = 'menu-carousel';
    prev.dataset.dir = '-1';
    const next = h('button', 'btn ghost btn-ghost', '다음 ▶');
    next.type = 'button';
    next.dataset.act = 'menu-carousel';
    next.dataset.dir = '1';
    const use = h('button', 'btn primary btn-primary', '이 시드로 설정');
    use.type = 'button';
    use.dataset.act = 'menu-carousel-use';
    cActs.appendChild(prev);
    cActs.appendChild(next);
    cActs.appendChild(use);
    carousel.appendChild(cActs);
    body.appendChild(carousel);

    const nav = h('div', 'menu-card menu-shortcuts');   // 시작 화면에서는 숨긴다(H-95)
    nav.appendChild(h('h2', 'card-title', '바로 가기'));
    const links = h('div', 'card-grid menu-grid');
    const shortcuts = [
      ['시드 갤러리', 'menu-seeds'],
      ['업적', 'menu-achievements'],
      ['전직', 'menu-classes'],
      ['도감', 'menu-codex'],
      ['🎯 미니게임', 'menu-minigame']
    ];
    for (const [label, act] of shortcuts) {
      const b = h('button', 'card', label);
      b.type = 'button';
      b.dataset.act = act;
      links.appendChild(b);
    }
    nav.appendChild(links);
    body.appendChild(nav);
  }


  /** 🧍 캐릭터 만들기 — 이름 + 외형(코스메틱 8종) */
  /** 오른쪽 아래 4단 버튼 — 새로운 세계 · 멀티플레이 · 설정 · 게임종료(계약 §4.75). */
  _renderHeroActions(body) {
    const stack = h('div', 'menu-hero-actions');
    const item = (act, icon, label, cls) => {
      const rowEl = h('div', 'menu-cta-row');
      const b = h('button', `btn btn-lg menu-cta ${cls}`, `${icon} ${label}`);
      b.type = 'button';
      b.dataset.act = act;
      b.addEventListener('click', () => this._heroAct(act));
      rowEl.appendChild(b);
      stack.appendChild(rowEl);
      return b;
    };
    const loggedIn = Boolean(safe(() => auth.loggedIn, false));
    const user = safe(() => auth.user, null);
    // 로그인/회원가입은 설정 안으로 옮겼다(사용자 요청) — 메인 화면에는 계정 버튼을 두지 않는다.
    item('world', '🎮', '싱글 플레이', 'is-primary');
    item('multi', '🧙', '멀티플레이', 'is-violet');
    item('options', '⚙️', '설정', 'is-ghost');
    item('leave', '🚪', '게임종료', 'is-danger');
    // body 는 _renderMain 이 지웠다 다시 채우므로 스택은 **메뉴 루트**에 붙여 살아남게 한다(H-88b).
    const prev = this._heroStack;
    if (prev && prev.parentNode && typeof prev.parentNode.removeChild === 'function') prev.parentNode.removeChild(prev);
    this._heroStack = stack;
    // 메뉴 루트가 아니라 **화면 최상위(body)** 에 붙인다 — 상위 요소의 transform/overflow 에
    //  걸려 안 보이거나 잘리는 일을 막는다(H-88c). 표시/숨김은 menu 의 show/hide 로 따라간다.
    if (this._heroStack && this._heroStack !== stack && this._heroStack.parentNode?.removeChild) {
      this._heroStack.parentNode.removeChild(this._heroStack);
    }
    this._heroStack = stack;
    (document.body ?? this.root).appendChild(stack);
    const setVisible = (on) => { stack.classList[on ? 'remove' : 'add']('is-hidden'); };
    setVisible(this.visible !== false);
    this.on('show', () => setVisible(true));
    this.on('hide', () => setVisible(false));
  }

  /** 스택 버튼 → 기존 메뉴 흐름으로 넘긴다. */
  _heroAct(act) {
    // 화면 전환 — 버튼을 눌러야 그 화면만 보인다(H-94).
    if (act === 'auth') {
      // 로그인 화면 — 회원가입/로그인을 여기서 한다.
      // 로그인 화면은 카드가 아니라 패널이므로 view 를 건드리지 않는다(H-98).
      this.emit('auth', {});
      return;
    }
    if (act === 'world' || act === 'multi' || act === 'options') {
      if (this.root) this.root.dataset.view = act === 'world' ? 'solo' : act === 'multi' ? 'multi' : 'options';
      // 싱글/멀티/설정 화면에서는 큰 버튼(싱글·멀티·설정·종료)을 감춘다(사용자 요청).
      this._syncHero();
      if (act === 'options') this.emit('settings', {});
      return;
    }
    if (act === 'start') {
      if (this.root) delete this.root.dataset.view;
      this._syncHero();
      this.emit('start', { mode: this.state.mode, difficulty: this.state.difficulty });
    } else if (act === 'leave') this.emit('quit', {});
  }

  /** 탭(시드 갤러리·캐릭터·도움말)을 열면 view='tab' — 탭 내용이 보이게 한다. */
  _syncView() {
    const root = this.root;
    if (!root) return null;
    if (this._tab && this._tab !== 'main') {
      root.dataset.view = 'tab';
      return 'tab';
    }
    if (!root.dataset.view || root.dataset.view === 'tab') root.dataset.view = 'main';
    return root.dataset.view;
  }

  /** 큰 버튼(싱글·멀티·설정·종료)은 **메인 화면에서만** 보인다. */
  _syncHero() {
    const stack = this._heroStack;
    if (!stack) return false;
    const view = this.root?.dataset?.view;
    const onMain = !view || view === 'main';
    const visible = safe(() => this.visible !== false, true);
    stack.classList[onMain && visible ? 'remove' : 'add']('is-hidden');
    return onMain;
  }

  /** ESC — 하위 화면(싱글/멀티/설정/시드 갤러리·도움말·캐릭터)이면 메인으로 돌아간다. */
  _onEscape(e) {
    if (!e || e.key !== 'Escape') return false;
    const root = this.root;
    if (!root || root.classList.contains('hidden')) return false;
    const view = root.dataset?.view;
    const onMain = (!view || view === 'main') && this._tab === 'main';
    if (onMain) return false;   // 이미 메인 — 게임 쪽 ESC(일시정지)를 막지 않는다
    e.preventDefault();
    e.stopPropagation();
    this._tab = 'main';
    delete root.dataset.view;
    this._render();
    this._syncHero();
    this.emit('main', {});
    return true;
  }

  _renderCharacter(body) {
    const card = h('div', 'menu-card menu-tab menu-character');

    const hero = h('div', 'tab-hero');
    hero.appendChild(h('span', 'tab-hero-icon', '🧍'));
    const heroText = h('div', 'tab-hero-text');
    heroText.appendChild(h('h2', 'card-title', '캐릭터'));
    heroText.appendChild(h('p', 'tab-hero-sub', '이름과 외형을 정합니다 · 외형은 능력치에 영향을 주지 않습니다'));
    hero.appendChild(heroText);
    card.appendChild(hero);

    const current = this.character;
    const fields = h('div', 'tab-fields');

    const nameField = h('label', 'tab-field');
    nameField.appendChild(h('span', 'solo-label', '내 이름'));
    const nameInput = h('input', 'input tab-input');
    nameInput.type = 'text';
    nameInput.maxLength = CHARACTER_NAME_MAX;
    nameInput.placeholder = '이름 (최대 16자)';
    nameInput.value = this._field('character-name', current.name);
    nameInput.dataset.field = 'character-name';
    nameInput.dataset.role = 'character-name';
    nameField.appendChild(nameInput);
    fields.appendChild(nameField);

    const nickField = h('label', 'tab-field');
    nickField.appendChild(h('span', 'solo-label', '닉네임'));
    const nickInput = h('input', 'input tab-input');
    nickInput.type = 'text';
    nickInput.maxLength = NICKNAME_MAX;
    nickInput.placeholder = `닉네임 (최대 ${NICKNAME_MAX}자 · 비우면 이름)`;
    nickInput.value = this._field('nickname', currentNickname());
    nickInput.dataset.field = 'nickname';
    nickInput.dataset.role = 'nickname';
    nickField.appendChild(nickInput);
    fields.appendChild(nickField);
    card.appendChild(fields);
    card.appendChild(h('span', 'tab-note', '중복 닉네임도 됩니다(중복 가능) · 비워 두면 캐릭터 이름/로그인 닉네임을 씁니다'));

    const skinHead = h('div', 'tab-section-head');
    skinHead.appendChild(h('span', 'solo-label', '외형'));
    skinHead.appendChild(h('span', 'tab-hint', `${CHARACTER_SKINS.length}종 · 클릭해서 고르기`));
    card.appendChild(skinHead);

    const grid = h('div', 'character-grid');
    grid.dataset.role = 'character-skins';
    for (const skin of CHARACTER_SKINS) {
      const cell = h('button', 'character-card' + (skin.id === current.skin ? ' active is-active' : ''));
      cell.type = 'button';
      cell.title = skin.desc;
      cell.dataset.act = 'character-skin';
      cell.dataset.skin = skin.id;
      cell.style.setProperty('--skin-color', '#' + Number(skin.color).toString(16).padStart(6, '0'));
      const swatch = h('span', 'character-swatch', skin.icon);
      swatch.style.background = '#' + Number(skin.color).toString(16).padStart(6, '0');
      cell.appendChild(swatch);
      cell.appendChild(h('span', 'character-name-row', skin.name));
      cell.appendChild(h('span', 'character-desc', skin.desc));
      grid.appendChild(cell);
    }
    card.appendChild(grid);

    const preview = h('div', 'tab-preview');
    preview.dataset.role = 'character-preview';
    preview.appendChild(h('span', 'tab-preview-label', '미리보기'));
    preview.appendChild(
      h('span', 'character-preview-text', characterLabel({ name: this._field('character-name', current.name), skin: current.skin }))
    );
    card.appendChild(preview);

    const actions = h('div', 'tab-actions');
    const save = h('button', 'btn primary btn-primary tab-primary', '캐릭터 저장');
    save.type = 'button';
    save.dataset.act = 'character-save';
    actions.appendChild(save);
    const randomize = h('button', 'btn ghost btn-ghost', '외형 무작위');
    randomize.type = 'button';
    randomize.dataset.act = 'character-random';
    actions.appendChild(randomize);
    card.appendChild(actions);

    if (this._characterSavedNote) card.appendChild(h('div', 'menu-note tab-note tab-note-ok', this._characterSavedNote));
    card.appendChild(h('span', 'tab-note', '멀티플레이에서는 이 이름·외형이 그대로 보입니다 · 브라우저에 저장됩니다'));
    card.appendChild(h('span', 'tab-note', '캐릭터마다 전용 아이템이 하나씩 있습니다 — 그 캐릭터로만 구매·사용 (인벤토리 I)'));

    body.appendChild(card);
    return card;
  }

  /** 로그인 직후 메인 화면이 부드럽게 떠오르게 한다(§4.36) */
  flash() {
    const el = this._menuEl;
    if (!el?.classList) return false;
    el.classList.remove('menu-enter');
    // 리플로우를 강제해 애니메이션을 다시 시작한다.
    void el.offsetWidth;
    el.classList.add('menu-enter');
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
      el.classList.remove('menu-enter');
      this._flashTimer = 0;
    }, 900);
    return true;
  }

  /** 현재 캐릭터(외형·이름) — 로비가 그대로 재사용한다 */
  getCharacter() {
    return sanitizeCharacter(this.character, '');
  }

  _renderSeeds(body) {
    const card = h('div', 'menu-card menu-tab menu-seeds');

    const hero = h('div', 'tab-hero');
    hero.appendChild(h('span', 'tab-hero-icon', '🗂'));
    const heroText = h('div', 'tab-hero-text');
    heroText.appendChild(h('h2', 'card-title', '시드 갤러리'));
    heroText.appendChild(h('p', 'tab-hero-sub', '마음에 드는 세계를 골라 시드 칸에 넣으세요 · 게임 중에는 G 키'));
    hero.appendChild(heroText);
    const count = h('span', 'tab-count', `${SEED_GALLERY.length}개`);
    hero.appendChild(count);
    card.appendChild(hero);

    const current = String(safe(() => this.game?.seed, ''));
    const grid = h('div', 'seed-grid');
    for (const s of SEED_GALLERY) {
      const b = h('button', 'card menu-seed-item');
      b.type = 'button';
      b.dataset.act = 'menu-seed-pick';
      b.dataset.seed = s.seed;
      const isCurrent = String(s.seed) === current;
      if (isCurrent) b.classList.add('is-active');
      const top = h('span', 'seed-top');
      top.appendChild(h('span', 'seed-name', s.name));
      top.appendChild(h('span', 'seed-code', `#${s.seed}`));
      b.appendChild(top);
      b.appendChild(h('span', 'seed-desc', s.desc));
      const foot = h('span', 'seed-foot');
      foot.appendChild(h('span', 'seed-tags', (s.tags || []).join(' · ')));
      if (isCurrent) foot.appendChild(h('span', 'seed-now', '현재'));
      b.appendChild(foot);
      grid.appendChild(b);
    }
    card.appendChild(grid);

    const actions = h('div', 'tab-actions');
    const back = h('button', 'btn primary btn-primary tab-primary', '메인으로');
    back.type = 'button';
    back.dataset.act = 'menu-tab';
    back.dataset.tab = 'main';
    actions.appendChild(back);
    card.appendChild(actions);
    body.appendChild(card);
  }

  _renderHelp(body) {
    const card = h('div', 'menu-card menu-tab menu-help');

    const hero = h('div', 'tab-hero');
    hero.appendChild(h('span', 'tab-hero-icon', '❓'));
    const heroText = h('div', 'tab-hero-text');
    heroText.appendChild(h('h2', 'card-title', '도움말'));
    heroText.appendChild(h('p', 'tab-hero-sub', '조작 · 규칙 · 화면 설정을 한눈에'));
    hero.appendChild(heroText);
    card.appendChild(hero);

    const grid = h('div', 'help-grid');

    const keys = h('div', 'help-block help-block-scroll');
    keys.appendChild(h('h3', 'help-title', '⌨ 조작'));
    for (const [key, desc] of KEYBINDS) keys.appendChild(row(key, desc));
    grid.appendChild(keys);

    const rules = h('div', 'help-block');
    rules.appendChild(h('h3', 'help-title', '📜 규칙'));
    for (const line of RULES) rules.appendChild(row('•', line));
    grid.appendChild(rules);

    const frame = h('div', 'help-block');
    frame.appendChild(h('h3', 'help-title', '🖥 프레임 프리셋'));
    for (const p of FRAME_PRESETS) {
      frame.appendChild(row(p.name, `${p.desc} (그림자 ${p.shadow ? '켬' : '끔'} · 픽셀비 ${p.pixelRatio})`));
    }
    grid.appendChild(frame);

    const credits = h('div', 'help-block');
    credits.appendChild(h('h3', 'help-title', '💠 크레딧'));
    for (const line of CREDITS) credits.appendChild(row('•', line));
    grid.appendChild(credits);
    card.appendChild(grid);

    const actions = h('div', 'tab-actions');
    const back = h('button', 'btn primary btn-primary tab-primary', '메인으로');
    back.type = 'button';
    back.dataset.act = 'menu-tab';
    back.dataset.tab = 'main';
    actions.appendChild(back);
    card.appendChild(actions);
    body.appendChild(card);
  }
}

export default MainMenu;

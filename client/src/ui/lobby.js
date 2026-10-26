// 초대코드 멀티플레이 로비 — 메인 화면에서 열리는 전용 화면.
//
// 흐름:
//   1) entry 뷰 —  [방 만들기] (모드·난이도·시드·인원)  /  [초대코드로 참가]
//   2) room  뷰 —  큰 초대코드 + [코드 복사]·[초대 링크 복사]·[공유]
//                  참가자 슬롯 · 준비 토글 · (방장) 게임 시작 · 채팅 · 나가기
//
// `?room=CODE` 로 들어오면 코드를 채우고 자동으로 참가를 시도한다.
// 서버 계약은 그대로 쓴다 — net.createRoom / net.joinRoom({ code }) / net.setReady / net.startGame.
import { auth, net, netInfo } from '../net.js';
import { currentNickname } from '../profile.js';
import { DIFFICULTIES, MODES } from '../data.js';
import { characterLabel, characterPayload, createCharacterStore, sanitizeCharacter } from '../character.js';
import {
  INVITE_CODE_LENGTH,
  inviteLink,
  isLoopbackOrigin,
  isValidInviteCode,
  loadLastCode,
  normalizeInviteCode,
  resolveShareOrigin,
  saveLastCode
} from '../utils/invite.js';

const MAX_CHAT = 120;
const MAX_PLAYERS_CHOICES = [2, 3, 4];

function safe(fn, fallback = null) {
  try {
    const v = fn();
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function row(label, value) {
  const r = el('div', 'row stat-row');
  r.appendChild(el('span', 'row-label', label));
  r.appendChild(el('span', 'row-value', value));
  return r;
}

function button(label, cls, act) {
  const b = el('button', `btn ${cls}`, label);
  b.type = 'button';
  if (act) b.dataset.act = act;
  return b;
}

function ensureRoot(doc, id) {
  let node = doc.getElementById(id);
  if (!node) {
    node = doc.createElement('div');
    node.id = id;
    const parent = doc.getElementById('app') || doc.body;
    if (parent) parent.appendChild(node);
  }
  return node || null;
}

function modeName(id) {
  return MODES.find((m) => m.id === id)?.name ?? String(id ?? '-');
}

function difficultyName(id) {
  return DIFFICULTIES.find((d) => d.id === id)?.name ?? String(id ?? '-');
}

export class Lobby {
  constructor({ game = null } = {}) {
    this.game = game;
    this._listeners = new Map();
    this.view = 'entry';
    this.room = null;
    this.busy = false;
    this.error = '';
    this.notice = '';
    this.chat = [];
    this.autoTried = false;
    this._bound = {
      click: (e) => this._onClick(e),
      input: (e) => this._onInput(e),
      keydown: (e) => this._onKeyDown(e)
    };
    const gameMode = safe(() => this.game?.mode, null);
    this.state = {
      // 메인 화면에서 '혼자 지키기' 상태로 들어와도 로비는 협동이 기본이다.
      mode: gameMode && gameMode !== 'solo' ? gameMode : 'coop',
      difficulty: safe(() => this.game?.difficulty, null) || 'normal',
      seed: safe(() => this.game?.seed, null) || '',
      maxPlayers: 4,
      // 공개(기본)면 메인 화면 '열린 방' 목록에 뜨고, 비공개면 초대코드/링크를 받은 사람만 들어온다.
      private: false,
      code: loadLastCode()
    };
    const doc = globalThis.document;
    this.root = doc ? ensureRoot(doc, 'lobby-root') : null;
    this._offNet = [];
    if (this.root) {
      this.root.classList.add('lobby', 'hidden');
      this.root.addEventListener('click', this._bound.click);
      this.root.addEventListener('input', this._bound.input);
      this.root.addEventListener('keydown', this._bound.keydown);
      this.render();
    }
    this._wireNet();
    this._wireKeys();
  }

  /* ── 공개 API ────────────────────────────────────────────── */

  /** 로비 열기. code 를 주면 그 코드로 참가를 시도한다. */
  open({ code = '', auto = false } = {}) {
    if (!this.root) return false;
    const wanted = normalizeInviteCode(code);
    if (wanted.length === INVITE_CODE_LENGTH) this.state.code = wanted;
    if (safe(() => net.room, null)) {
      this.room = net.room;
      this.view = 'room';
    } else {
      this.view = 'entry';
    }
    this.error = '';
    this.autoTried = false;
    this.root.classList.remove('hidden');
    this.root.style.pointerEvents = '';
    this.render();
    this._loadShareUrls();
    this.emit('open', { code: this.state.code, auto });
    if (auto && wanted.length === INVITE_CODE_LENGTH) {
      this.autoTried = true;
      this.join(wanted, { auto: true });
    }
    return true;
  }

  close() {
    if (!this.root) return false;
    this.root.classList.add('hidden');
    this.root.style.pointerEvents = 'none';
    this.emit('close', {});
    return true;
  }

  get visible() {
    return Boolean(this.root) && !this.root.classList.contains('hidden');
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
          console.warn(`[lobby] ${event} 처리 오류`, err);
        }
      }
    }
    return payload;
  }

  update() {
    if (!this.visible) return;
    const status = this.root.querySelector?.('[data-role="status"]');
    if (status) {
      const text = this._statusText();
      if (status.textContent !== text) status.textContent = text;
    }
  }

  dispose() {
    for (const off of this._offNet) safe(off);
    this._offNet.length = 0;
    if (this._bound.windowKeydown && typeof globalThis.removeEventListener === 'function') {
      globalThis.removeEventListener('keydown', this._bound.windowKeydown);
      this._bound.windowKeydown = null;
    }
    if (this.root) {
      this.root.removeEventListener('click', this._bound.click);
      this.root.removeEventListener('input', this._bound.input);
      this.root.removeEventListener('keydown', this._bound.keydown);
    }
    this._listeners.clear();
  }

  /* ── 방 만들기 / 참가 ─────────────────────────────────────── */

  async create() {
    if (this.busy) return { ok: false, error: '처리 중입니다' };
    this.busy = true;
    this.error = '';
    this.render();
    const ok = await this._ensureConnected();
    let res = { ok: false, error: '서버에 연결되지 않았습니다' };
    if (ok) {
      try {
        res = await net.createRoom({
          nickname: this._nickname(),
          character: this._characterPayload(),
          mode: this.state.mode,
          seed: this.state.seed,
          difficulty: this.state.difficulty,
          maxPlayers: this.state.maxPlayers,
          private: this.state.private
        });
      } catch (err) {
        res = { ok: false, error: err?.message || '방 생성 실패' };
      }
    }
    this.busy = false;
    if (res?.ok) {
      this.room = res.state || safe(() => net.room, null);
      this.view = 'room';
      this.state.code = normalizeInviteCode(res.code || this.room?.code || '');
      saveLastCode(this.state.code);
      this.notice = `방을 만들었습니다 — 초대코드 ${this.state.code}`;
      this.emit('created', { code: this.state.code, state: this.room });
    } else {
      this.error = String(res?.error || '방을 만들지 못했습니다');
    }
    this.render();
    return res;
  }

  async join(code = this.state.code, { auto = false } = {}) {
    const c = normalizeInviteCode(code);
    this.state.code = c;
    if (c.length !== INVITE_CODE_LENGTH) {
      this.error = `초대코드 ${INVITE_CODE_LENGTH}자리를 입력하세요`;
      this.render();
      return { ok: false, error: this.error };
    }
    if (this.busy) return { ok: false, error: '처리 중입니다' };
    this.busy = true;
    this.error = '';
    this.render();
    const connected = await this._ensureConnected();
    let res = { ok: false, error: '서버에 연결되지 않았습니다' };
    if (connected) {
      try {
        res = await net.joinRoom({ code: c, nickname: this._nickname(), character: this._characterPayload() });
      } catch (err) {
        res = { ok: false, error: err?.message || '참가 실패' };
      }
    }
    this.busy = false;
    if (res?.ok) {
      this.room = res.state || safe(() => net.room, null);
      this.view = 'room';
      this.notice = `초대코드 ${c} 방에 참가했습니다`;
      saveLastCode(c);
      this.emit('joined', { code: c, state: this.room, auto });
    } else {
      this.error = String(res?.error || '참가하지 못했습니다');
      this.view = 'entry';
      this.emit('join-failed', { code: c, error: this.error });
    }
    this.render();
    return res;
  }

  async ready() {
    const me = this._me();
    const res = await safeAsync(() => net.setReady(!me?.ready));
    if (!res?.ok) this.error = String(res?.error || '준비 상태를 바꾸지 못했습니다');
    this.render();
    return res;
  }

  async start() {
    const res = await safeAsync(() => net.startGame());
    if (!res?.ok) this.error = String(res?.error || '게임을 시작하지 못했습니다');
    this.render();
    return res;
  }

  async leave() {
    await safeAsync(() => net.leaveRoom());
    this.room = null;
    this.view = 'entry';
    this.notice = '방에서 나왔습니다';
    this.chat.length = 0;
    this.render();
    return { ok: true };
  }

  async sendChat(text) {
    const t = String(text ?? '').trim();
    if (!t) return { ok: false, error: '빈 메시지' };
    const res = await safeAsync(() => net.sendChat(t));
    if (!res?.ok) this.error = String(res?.error || '메시지를 보내지 못했습니다');
    this.render();
    return res;
  }

  /* ── 내부 ───────────────────────────────────────────────── */

  _wireNet() {
    const on = (evt, cb) => {
      try {
        net.on(evt, cb);
        this._offNet.push(() => net.off(evt, cb));
      } catch {
        /* 네트워크 계층이 없어도 로비는 살아 있어야 한다 */
      }
    };
    on('room:state', (state) => {
      if (state && typeof state === 'object') {
        this.room = state;
        if (state.code) this.state.code = normalizeInviteCode(state.code);
        if (this.visible) this.view = 'room';
      }
      this.render();
    });
    on('chat:message', (msg) => {
      if (!msg) return;
      this.chat.push({
        id: msg.id ?? Date.now(),
        nickname: String(msg.nickname ?? '익명'),
        text: String(msg.text ?? '').slice(0, 200)
      });
      if (this.chat.length > MAX_CHAT) this.chat.shift();
      if (this.visible) this._renderChat();
    });
    on('room:error', ({ message } = {}) => {
      this.error = String(message || '방 오류');
      this.render();
    });
    on('net:connect', () => this.render());
    on('net:disconnect', () => this.render());
    on('net:error', () => this.render());
    on('net:reconnect', () => {
      this.error = '';
      this.render();
    });
    on('net:resumed', () => this.render());
  }

  _wireKeys() {
    if (typeof globalThis.addEventListener !== 'function') return;
    this._bound.windowKeydown = (e) => {
      if (!this.visible) return;
      if (e.key === 'Escape') {
        e.preventDefault?.();
        this.close();
      }
    };
    globalThis.addEventListener('keydown', this._bound.windowKeydown);
  }

  _nickname() {
    const account =
      safe(() => auth.user?.nickname, null) ||
      safe(() => auth.user?.username, null) ||
      '수호자';
    // 직접 만든 닉네임이 최우선(§4.54), 없으면 캐릭터 이름, 그다음 계정 이름(§4.35).
    const own = currentNickname();
    if (own) return own;
    return sanitizeCharacter(this.character, account).name || account;
  }

  /** 캐릭터(이름·외형) — 메뉴에서 만든 값을 그대로 쓴다 */
  _character() {
    const store = this.characterStore || (this.characterStore = createCharacterStore());
    const fallback = safe(() => auth.user?.nickname, '') || safe(() => auth.user?.username, '') || '수호자';
    const loaded = this.character || store.load(fallback);
    this.character = sanitizeCharacter(loaded, fallback);
    return this.character;
  }

  _characterPayload() {
    const fallback = safe(() => auth.user?.nickname, '') || safe(() => auth.user?.username, '') || '수호자';
    return characterPayload(this._character(), fallback);
  }

  /** 메뉴에서 만든 캐릭터를 다시 읽는다(로비를 열 때마다 최신) */
  refreshCharacter() {
    this.character = null;
    return this._character();
  }

  async _ensureConnected() {
    if (safe(() => net.connected, false)) return true;
    await safeAsync(() => net.connect(this._nickname()));
    return Boolean(safe(() => net.connected, false));
  }

  /** [다시 연결] — 끊긴 소켓을 새로 붙이고 로비를 갱신한다. */
  async reconnect() {
    if (this.busy) return false;
    this.busy = true;
    this.error = '';
    this.notice = '서버에 다시 연결하는 중…';
    this.render();
    await safeAsync(() => net.connect(this._nickname()));
    this.busy = false;
    const ok = Boolean(safe(() => net.connected, false));
    if (ok) this.notice = '서버에 다시 연결되었습니다';
    else this.error = `서버에 연결하지 못했습니다 — ${safe(() => net.lastError, '') || '주소와 네트워크를 확인하세요'}`;
    this.render();
    return ok;
  }

  _me() {
    const players = Array.isArray(this.room?.players) ? this.room.players : [];
    const id = safe(() => net.id, null);
    return players.find((p) => p?.id === id) || null;
  }

  _isHost() {
    const id = safe(() => net.id, null);
    return Boolean(this.room?.hostId && this.room.hostId === id);
  }

  _statusText() {
    const nick = this._nickname();
    if (safe(() => net.connected, false)) return `서버 연결됨 · ${nick}`;
    return `${nick} · 서버 연결 대기 (${safe(() => net.lastError, '') || '오프라인'})`;
  }

  /** 초대 링크의 기준 주소 — localhost 면 서버가 알려준 LAN 주소를 쓴다 */
  _shareOrigin() {
    return resolveShareOrigin({
      origin: safe(() => globalThis.location?.origin, ''),
      lanUrls: safe(() => netInfo.urls(), []) || []
    });
  }

  /** 지금 링크가 이 PC 에서만 열리는 주소인가 */
  _linkIsLocalOnly() {
    const link = this._link();
    return isLoopbackOrigin(link || safe(() => globalThis.location?.origin, ''));
  }

  _linkHint() {
    if (this._linkIsLocalOnly()) {
      return '⚠️ 지금 초대 링크는 이 PC 에서만 열립니다 — 같은 네트워크의 다른 기기에서 열려면 서버 PC 의 LAN 주소(예: http://192.168.0.5:3001)로 접속한 뒤 초대하세요.';
    }
    return '이 링크를 보내면 같은 네트워크(또는 공유 주소)의 다른 기기에서 바로 참가됩니다.';
  }

  /** 서버가 알려준 공유 주소를 한 번 받아 두고, 도착하면 링크를 다시 그린다 */
  _loadShareUrls() {
    try {
      Promise.resolve(netInfo.load())
        .then(() => {
          if (this.visible) this.render();
        })
        .catch(() => {});
    } catch {
      /* /api/net 없이도 동작해야 한다 */
    }
  }

  _link() {
    return inviteLink(this.state.code, this._shareOrigin());
  }

  _field(name, fallback = '') {
    const node = this.root?.querySelector?.(`[data-field="${name}"]`);
    if (node && typeof node.value === 'string') return node.value;
    return fallback;
  }

  _onInput(e) {
    const field = e.target?.dataset?.field;
    if (field === 'lobby-code') {
      const normalized = normalizeInviteCode(e.target.value);
      if (e.target.value !== normalized) e.target.value = normalized;
      this.state.code = normalized;
      const joinBtn = this.root?.querySelector?.('[data-act="lobby-join"]');
      if (joinBtn) joinBtn.disabled = !isValidInviteCode(normalized);
      const err = this.root?.querySelector?.('[data-role="join-error"]');
      if (err && this.error) {
        this.error = '';
        err.textContent = '';
      }
    } else if (field === 'lobby-seed') {
      this.state.seed = e.target.value;
    } else if (field === 'lobby-chat') {
      this._chatDraft = e.target.value;
    }
  }

  _onKeyDown(e) {
    if (e.key !== 'Enter') return;
    const field = e.target?.dataset?.field;
    if (field === 'lobby-code') {
      e.preventDefault?.();
      this.join(this._field('lobby-code', this.state.code));
    } else if (field === 'lobby-chat') {
      e.preventDefault?.();
      const text = this._field('lobby-chat', '');
      this.sendChat(text);
    }
  }

  _onClick(e) {
    const target = e.target?.closest?.('[data-act]');
    if (!target || !this.root?.contains?.(target) || target.disabled) return;
    const d = target.dataset;
    switch (d.act) {
      case 'lobby-close':
        this.close();
        break;
      case 'lobby-reconnect':
        this.reconnect();
        break;
      case 'lobby-character':
        this.emit('character', { character: this._character() });
        break;
      case 'lobby-mode':
        this.state.mode = d.mode || this.state.mode;
        this.render();
        break;
      case 'lobby-diff':
        this.state.difficulty = d.diff || this.state.difficulty;
        this.render();
        break;
      case 'lobby-max':
        this.state.maxPlayers = Number(d.max) || this.state.maxPlayers;
        this.render();
        break;
      case 'lobby-private':
        this.state.private = d.value === '1';
        this.render();
        break;
      case 'lobby-seed-random':
        this.state.seed = String(Math.floor(100000 + Math.random() * 900000));
        this.render();
        break;
      case 'lobby-create':
        this.create();
        break;
      case 'lobby-join':
        this.join(this._field('lobby-code', this.state.code));
        break;
      case 'lobby-last-code':
        this.state.code = normalizeInviteCode(d.code || loadLastCode());
        this.join(this.state.code);
        break;
      case 'lobby-copy-code':
        this._copy(this.state.code, '초대코드를 복사했습니다');
        break;
      case 'lobby-copy-link':
        this._copy(this._link(), '초대 링크를 복사했습니다');
        break;
      case 'lobby-share':
        this._share();
        break;
      case 'lobby-ready':
        this.ready();
        break;
      case 'lobby-start':
        this.start();
        break;
      case 'lobby-leave':
        this.leave();
        break;
      case 'lobby-chat-send': {
        const text = this._field('lobby-chat', this._chatDraft || '');
        this.sendChat(text);
        const input = this.root?.querySelector?.('[data-field="lobby-chat"]');
        if (input) input.value = '';
        this._chatDraft = '';
        break;
      }
      default:
        break;
    }
  }

  _copy(text, okMessage) {
    const value = String(text ?? '');
    if (!value) {
      this.notice = '복사할 내용이 없습니다';
      this.render();
      return false;
    }
    let copied = false;
    try {
      const clip = globalThis.navigator?.clipboard;
      if (clip?.writeText) {
        Promise.resolve(clip.writeText(value)).catch(() => {});
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      // 폴백: 입력칸을 만들어 선택 상태로 둔다(사용자가 Ctrl+C).
      try {
        const input = document.createElement('input');
        input.value = value;
        this.root.appendChild(input);
        input.select?.();
        document.execCommand?.('copy');
        input.remove?.();
        copied = true;
      } catch {
        copied = false;
      }
    }
    this.notice = copied ? okMessage : `복사 실패 — 직접 선택하세요: ${value}`;
    if (safe(() => this.game?.notify, null)) this.game.notify(this.notice, copied ? 'success' : 'warn');
    this.render();
    return copied;
  }

  _share() {
    const data = { title: '요새의 수호자 협동', text: `초대코드 ${this.state.code}`, url: this._link() };
    const nav = safe(() => globalThis.navigator, null);
    if (nav?.share) {
      Promise.resolve(nav.share(data)).catch(() => this._copy(this._link(), '초대 링크를 복사했습니다'));
      return;
    }
    this._copy(`${data.text}\n${data.url}`, '초대 문구를 복사했습니다');
  }

  /* ── 렌더 ───────────────────────────────────────────────── */

  render() {
    if (!this.root) return false;
    const doc = globalThis.document;
    this.root.textContent = '';
    const shell = el('div', 'lobby-shell');

    const head = el('div', 'lobby-head');
    head.appendChild(el('div', 'lobby-title', '멀티플레이 · 초대코드'));
    const status = el('div', 'lobby-status', this._statusText());
    status.dataset.role = 'status';
    head.appendChild(status);
    if (!safe(() => net.connected, false)) head.appendChild(button('다시 연결', 'primary btn-primary', 'lobby-reconnect'));
    head.appendChild(button('닫기 (ESC)', 'ghost btn-ghost', 'lobby-close'));
    shell.appendChild(head);

    const body = el('div', 'lobby-body');
    if (this.view === 'room' && this.room) this._renderRoom(body);
    else this._renderEntry(body);
    shell.appendChild(body);

    if (this.error || this.notice) {
      const line = el('div', 'lobby-msg', this.error || this.notice);
      line.dataset.type = this.error ? 'error' : 'info';
      line.dataset.role = 'message';
      shell.appendChild(line);
    }
    this.root.appendChild(shell);
    if (doc && this.view === 'room') this._renderChat();
    return true;
  }

  _renderEntry(body) {
    const make = el('div', 'lobby-card');
    make.appendChild(el('h2', 'card-title', '방 만들기'));
    make.appendChild(row('내 이름', this._nickname()));
    const charRow = el('div', 'row stat-row');
    charRow.dataset.role = 'lobby-character';
    charRow.appendChild(el('span', 'row-label', '내 캐릭터'));
    charRow.appendChild(el('span', 'row-value', characterLabel(this._character())));
    const charBtn = el('button', 'btn ghost btn-ghost', '🧍 캐릭터 만들기');
    charBtn.type = 'button';
    charBtn.title = '메인 화면의 캐릭터 탭에서 이름과 외형을 바꿉니다';
    charBtn.dataset.act = 'lobby-character';
    charRow.appendChild(charBtn);
    make.appendChild(charRow);

    const modeRow = el('div', 'row stat-row');
    modeRow.appendChild(el('span', 'row-label', '모드'));
    const modeTabs = el('div', 'tabs panel-tabs');
    for (const m of MODES) {
      if (m.id === 'solo') continue; // 혼자 하기는 메인 화면에서
      const b = el('button', 'tab panel-tab' + (m.id === this.state.mode ? ' active is-active' : ''), m.name);
      b.type = 'button';
      b.title = m.desc;
      b.dataset.act = 'lobby-mode';
      b.dataset.mode = m.id;
      modeTabs.appendChild(b);
    }
    modeRow.appendChild(modeTabs);
    make.appendChild(modeRow);

    const diffRow = el('div', 'row stat-row');
    diffRow.appendChild(el('span', 'row-label', '난이도'));
    const diffTabs = el('div', 'tabs panel-tabs');
    for (const d of DIFFICULTIES) {
      const b = el('button', 'tab panel-tab' + (d.id === this.state.difficulty ? ' active is-active' : ''), d.name);
      b.type = 'button';
      b.title = d.desc;
      b.dataset.act = 'lobby-diff';
      b.dataset.diff = d.id;
      diffTabs.appendChild(b);
    }
    diffRow.appendChild(diffTabs);
    make.appendChild(diffRow);

    const seedRow = el('div', 'row stat-row');
    seedRow.appendChild(el('span', 'row-label', '시드'));
    const seed = el('input', 'input');
    seed.type = 'text';
    seed.dataset.field = 'lobby-seed';
    seed.placeholder = '비우면 무작위';
    seed.value = this.state.seed;
    seedRow.appendChild(seed);
    seedRow.appendChild(button('무작위', 'ghost btn-ghost', 'lobby-seed-random'));
    make.appendChild(seedRow);

    const maxRow = el('div', 'row stat-row');
    maxRow.appendChild(el('span', 'row-label', '인원'));
    const maxTabs = el('div', 'tabs panel-tabs');
    for (const n of MAX_PLAYERS_CHOICES) {
      const b = el('button', 'tab panel-tab' + (n === this.state.maxPlayers ? ' active is-active' : ''), `${n}명`);
      b.type = 'button';
      b.dataset.act = 'lobby-max';
      b.dataset.max = String(n);
      maxTabs.appendChild(b);
    }
    maxRow.appendChild(maxTabs);
    make.appendChild(maxRow);

    const scopeRow = el('div', 'row stat-row');
    scopeRow.appendChild(el('span', 'row-label', '공개 범위'));
    const scopeTabs = el('div', 'tabs panel-tabs');
    for (const opt of [
      { id: false, name: '공개', desc: '메인 화면 "열린 방" 목록에 올라갑니다 — 코드 없이 클릭 참가' },
      { id: true, name: '비공개', desc: '목록에 올라가지 않습니다 — 초대코드·초대 링크를 받은 사람만 참가' }
    ]) {
      const b = el('button', 'tab panel-tab' + (Boolean(this.state.private) === opt.id ? ' active is-active' : ''), opt.name);
      b.type = 'button';
      b.title = opt.desc;
      b.dataset.act = 'lobby-private';
      b.dataset.value = opt.id ? '1' : '0';
      scopeTabs.appendChild(b);
    }
    scopeRow.appendChild(scopeTabs);
    make.appendChild(scopeRow);

    const makeActs = el('div', 'row menu-actions');
    const createBtn = button('방 만들기 (초대코드 발급)', 'primary btn-primary', 'lobby-create');
    createBtn.disabled = this.busy;
    makeActs.appendChild(createBtn);
    make.appendChild(makeActs);
    body.appendChild(make);

    const join = el('div', 'lobby-card');
    join.appendChild(el('h2', 'card-title', '초대코드로 참가'));
    const codeRow = el('div', 'row stat-row');
    codeRow.appendChild(el('span', 'row-label', `코드 ${INVITE_CODE_LENGTH}자리`));
    const input = el('input', 'input lobby-code-input');
    input.type = 'text';
    input.maxLength = INVITE_CODE_LENGTH;
    input.placeholder = 'ABCD';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.field = 'lobby-code';
    input.value = this.state.code;
    codeRow.appendChild(input);
    join.appendChild(codeRow);

    const joinActs = el('div', 'row menu-actions');
    const joinBtn = button('참가', 'primary btn-primary', 'lobby-join');
    joinBtn.disabled = !isValidInviteCode(this.state.code) || this.busy;
    joinActs.appendChild(joinBtn);
    const last = loadLastCode();
    if (last) {
      const again = button(`최근 코드 ${last}`, 'ghost btn-ghost', 'lobby-last-code');
      again.dataset.code = last;
      joinActs.appendChild(again);
    }
    join.appendChild(joinActs);

    const err = el('div', 'lobby-hint', this.error || '친구에게 받은 코드를 입력하면 바로 참가됩니다');
    err.dataset.role = 'join-error';
    join.appendChild(err);
    join.appendChild(row('초대 링크', this.state.code ? this._link() : '—'));
    if (this.state.code && this._linkIsLocalOnly()) {
      join.appendChild(el('div', 'lobby-hint warn', '이 주소는 이 PC 전용입니다 — 다른 기기에서 참가하려면 서버 PC 의 LAN 주소로 접속하세요.'));
    }
    body.appendChild(join);
  }

  _renderRoom(body) {
    const room = this.room || safe(() => net.room, null) || {};
    const code = normalizeInviteCode(room.code || this.state.code);

    const invite = el('div', 'lobby-card lobby-invite');
    invite.appendChild(el('h2', 'card-title', '초대코드'));
    const big = el('div', 'lobby-code-big', code || '----');
    big.dataset.role = 'code';
    invite.appendChild(big);
    const acts = el('div', 'row menu-actions');
    acts.appendChild(button('코드 복사', 'primary btn-primary', 'lobby-copy-code'));
    acts.appendChild(button('초대 링크 복사', 'ghost btn-ghost', 'lobby-copy-link'));
    if (safe(() => Boolean(globalThis.navigator?.share), false)) {
      acts.appendChild(button('공유', 'ghost btn-ghost', 'lobby-share'));
    }
    invite.appendChild(acts);
    const linkRow = el('div', 'row stat-row');
    linkRow.appendChild(el('span', 'row-label', '초대 링크'));
    const link = el('input', 'input lobby-link');
    link.type = 'text';
    link.readOnly = true;
    link.value = code ? this._link() : '';
    link.dataset.role = 'link';
    linkRow.appendChild(link);
    invite.appendChild(linkRow);
    invite.appendChild(el('div', 'lobby-hint', '이 코드나 링크를 친구에게 보내면 같은 방에 들어옵니다.'));
    const shareHint = el('div', 'lobby-hint', code ? this._linkHint() : '');
    shareHint.dataset.role = 'link-hint';
    if (code && this._linkIsLocalOnly()) shareHint.classList.add('warn');
    invite.appendChild(shareHint);
    body.appendChild(invite);

    const info = el('div', 'lobby-card');
    if (!safe(() => net.connected, false)) {
      info.appendChild(el('div', 'lobby-hint warn', '서버 연결이 끊겼습니다 — 자동으로 다시 연결하는 중입니다. 필요하면 위의 [다시 연결]을 누르세요.'));
    }
    const players = Array.isArray(room.players) ? room.players : [];
    info.appendChild(el('h2', 'card-title', `참가자 ${players.length} / ${room.maxPlayers ?? 4}`));
    info.appendChild(row('모드', modeName(room.mode)));
    info.appendChild(row('난이도', difficultyName(room.difficulty)));
    info.appendChild(row('시드', String(room.seed ?? '-') || '-'));
    info.appendChild(row('공개 범위', room.private === true ? '비공개 (초대코드를 아는 사람만)' : '공개 (메인 화면 방 목록에 표시)'));

    const slots = el('div', 'lobby-slots');
    slots.dataset.role = 'players';
    const total = Math.max(1, Number(room.maxPlayers) || 4);
    for (let i = 0; i < total; i++) {
      const p = players[i];
      const me = p?.id && p.id === safe(() => net.id, null);
      const slot = el('div', 'lobby-slot' + (p ? '' : ' empty') + (p?.ready ? ' ready' : ''));
      slot.appendChild(el('div', 'lobby-slot-name', p ? `${p.nickname}${me ? ' (나)' : ''}` : '빈 자리'));
      const tags = [];
      if (p && p.id === room.hostId) tags.push('방장');
      if (p?.ready) tags.push('준비 완료');
      slot.appendChild(el('div', 'lobby-slot-tag', tags.join(' · ') || (p ? '대기 중' : '초대 대기')));
      slots.appendChild(slot);
    }
    info.appendChild(slots);

    const acts2 = el('div', 'row menu-actions');
    const me = this._me();
    acts2.appendChild(button(me?.ready ? '준비 취소' : '준비 완료', 'primary btn-primary', 'lobby-ready'));
    const startBtn = button('게임 시작', 'primary btn-primary', 'lobby-start');
    startBtn.disabled = !this._isHost();
    if (!this._isHost()) startBtn.title = '방장만 시작할 수 있습니다';
    acts2.appendChild(startBtn);
    acts2.appendChild(button('나가기', 'danger btn-danger', 'lobby-leave'));
    info.appendChild(acts2);
    body.appendChild(info);

    const chatCard = el('div', 'lobby-card lobby-chat');
    chatCard.appendChild(el('h2', 'card-title', '채팅'));
    const log = el('div', 'lobby-chatlog');
    log.dataset.role = 'chat';
    chatCard.appendChild(log);
    const chatRow = el('div', 'row');
    const chatInput = el('input', 'input');
    chatInput.type = 'text';
    chatInput.maxLength = 200;
    chatInput.placeholder = '메시지 (최대 200자)';
    chatInput.dataset.field = 'lobby-chat';
    chatInput.value = this._chatDraft || '';
    chatRow.appendChild(chatInput);
    chatRow.appendChild(button('전송', 'ghost btn-ghost', 'lobby-chat-send'));
    chatCard.appendChild(chatRow);
    body.appendChild(chatCard);
  }

  _renderChat() {
    const node = this.root?.querySelector?.('[data-role="chat"]');
    if (!node) return;
    node.textContent = '';
    for (const m of this.chat) {
      const line = el('div', 'lobby-chat-line');
      line.appendChild(el('span', 'lobby-chat-name', m.nickname));
      line.appendChild(el('span', 'lobby-chat-text', m.text));
      node.appendChild(line);
    }
    node.scrollTop = node.scrollHeight;
  }
}

async function safeAsync(fn) {
  try {
    const res = await fn();
    return res && typeof res === 'object' ? res : { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || '요청 실패' };
  }
}

export default Lobby;

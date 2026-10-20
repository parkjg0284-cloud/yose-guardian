// 네트워크 클라이언트. 서버가 없어도 절대 throw 하지 않는다 (오프라인 싱글플레이 지원).
import { io } from 'socket.io-client';

const TOKEN_KEY = 'fortress.token';
const USER_KEY = 'fortress.user';

// 서버 주소를 game.net 이 바꾸면 REST(로그인·저장·순위표)도 같은 서버로 보낸다.
let API_BASE = '';
export function setApiBase(url) {
  API_BASE = url ? String(url).replace(/\/+$/, '') : '';
}
export function getApiBase() {
  return API_BASE;
}

/** 마인크래프트처럼 "주소만 넣고 접속" — ip / ip:port / http(s)://ip:port 를 모두 받는다. */
export function normalizeServerAddress(input, fallbackPort = 3001) {
  let raw = String(input ?? '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  let u;
  try {
    u = new URL(raw);
  } catch {
    return '';
  }
  if (!u.hostname) return '';
  // http 는 게임 서버 기본 포트(3001)를 붙이고, https 는 그대로 둔다(443).
  if (!u.port && u.protocol === 'http:') u.port = String(fallbackPort);
  return u.origin;
}

function store() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export async function api(path, { method = 'GET', body, token, timeout = 8000 } = {}) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const t = token ?? auth.token;
    if (t) headers.Authorization = `Bearer ${t}`;
    const target = /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
    const res = await fetch(target, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : data?.error || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err?.name === 'AbortError' ? '요청 시간 초과' : err?.message || '네트워크 오류' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const auth = {
  _user: null,

  get token() {
    try {
      return store()?.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  },

  get user() {
    if (this._user) return this._user;
    try {
      const raw = store()?.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  get loggedIn() {
    return Boolean(this.token && this.user);
  },

  /** 관리자 권한 여부 (서버 응답의 role / isAdmin 기반) */
  get isAdmin() {
    const u = this.user;
    return Boolean(u && (u.role === 'admin' || u.isAdmin === true));
  },

  setSession(token, user) {
    this._user = user || null;
    const s = store();
    if (!s) return;
    try {
      if (token) s.setItem(TOKEN_KEY, token);
      if (user) s.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* 무시 */
    }
  },

  logout() {
    this._user = null;
    try {
      store()?.removeItem(TOKEN_KEY);
      store()?.removeItem(USER_KEY);
    } catch {
      /* 무시 */
    }
  },

  async register(username, password, nickname) {
    const r = await api('/api/auth/register', { method: 'POST', body: { username, password, nickname } });
    if (r.ok && r.data?.token) this.setSession(r.data.token, r.data.user);
    return r;
  },

  async login(username, password) {
    const r = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    if (r.ok && r.data?.token) this.setSession(r.data.token, r.data.user);
    return r;
  },

  async me() {
    if (!this.token) return { ok: false, status: 401, error: '로그인 필요' };
    const r = await api('/api/auth/me');
    if (r.ok && r.data?.user) this.setSession(this.token, r.data.user);
    if (r.status === 401) this.logout();
    return r;
  },

  /** 계정 닉네임 변경 — 로그인 상태에서만 동작한다(계약 §4.54) */
  async updateNickname(nickname) {
    if (!this.token) return { ok: false, status: 401, error: '로그인 필요' };
    const r = await api('/api/auth/nickname', { method: 'POST', body: { nickname } });
    if (r.ok && r.data?.user) this.setSession(this.token, r.data.user);
    return r;
  }
};

export const cloudSave = {
  async save(data) {
    if (!auth.token) return { ok: false, status: 401, error: '로그인 필요' };
    return api('/api/save', { method: 'POST', body: { data } });
  },
  async load() {
    if (!auth.token) return { ok: false, status: 401, error: '로그인 필요' };
    return api('/api/save');
  }
};

export const leaderboard = {
  async top(mode = 'solo', limit = 100) {
    return api(`/api/leaderboard?mode=${encodeURIComponent(mode)}&limit=${limit}`);
  },
  async submit(entry) {
    if (!auth.token) return { ok: false, status: 401, error: '로그인 필요' };
    return api('/api/leaderboard', { method: 'POST', body: entry });
  }
};

export const statsApi = {
  async get() {
    return api('/api/stats');
  },
  async push(stats) {
    if (!auth.token) return { ok: false, status: 401, error: '로그인 필요' };
    return api('/api/stats', { method: 'POST', body: { stats } });
  }
};

const CLIENT_EVENTS = ['room:state', 'room:error', 'chat:message', 'game:start', 'game:snapshot', 'game:event', 'game:over'];

/**
 * 서버가 알려준 공유 주소(`GET /api/net`) 캐시.
 * 초대 링크가 `http://localhost:3001` 로 굳으면 **다른 사람은 그 링크로 못 들어온다** —
 * 서버가 알려준 LAN 주소(또는 PUBLIC_URL)로 링크를 만들기 위해 한 번만 불러온다.
 */
export const netInfo = {
  data: null,
  pending: null,
  async load(force = false) {
    if (this.data && !force) return this.data;
    if (this.pending && !force) return this.pending;
    this.pending = (async () => {
      try {
        const r = await api('/api/net');
        if (r?.ok && Array.isArray(r.data?.urls)) this.data = r.data;
      } catch {
        /* 오프라인·정적 배포 → 부르는 쪽이 지금 주소를 그대로 쓴다 */
      } finally {
        this.pending = null;
      }
      return this.data;
    })();
    return this.pending;
  },
  urls() {
    return Array.isArray(this.data?.urls) ? this.data.urls : [];
  },
  reset() {
    this.data = null;
    this.pending = null;
  }
};

/**
 * 열린 방 목록(`GET /api/rooms`) 캐시 — 메인 화면에서 코드 없이 클릭 참가하기 위한 목록.
 * 같은 주소에 접속한 사람끼리만 보이므로, LAN·터널 어느 쪽으로 들어와도 그 서버의 방이 보인다.
 */
export const roomList = {
  data: null,
  pending: null,
  error: '',
  at: 0,
  /** 최소 간격(ms) 안의 재요청은 캐시로 응답한다 */
  async load(force = false, { minIntervalMs = 1500 } = {}) {
    if (this.pending) return this.pending;
    if (!force && this.data && Date.now() - this.at < minIntervalMs) return this.data;
    this.pending = (async () => {
      try {
        const r = await api('/api/rooms');
        if (r?.ok && Array.isArray(r.data?.rooms)) {
          this.data = r.data;
          this.error = '';
          this.at = Date.now();
        } else {
          this.error = r?.error || '방 목록을 받지 못했습니다';
        }
      } catch {
        this.error = '서버에 연결할 수 없습니다';
      } finally {
        this.pending = null;
      }
      return this.data;
    })();
    return this.pending;
  },
  rooms() {
    return Array.isArray(this.data?.rooms) ? this.data.rooms : [];
  },
  reset() {
    this.data = null;
    this.pending = null;
    this.error = '';
    this.at = 0;
  }
};

export class Net {
  constructor(url) {
    this.url = url || (typeof location !== 'undefined' ? location.origin : 'http://localhost:3001');
    this.socket = null;
    this.connected = false;
    this.id = null;
    this.room = null;
    this.lastError = null;
    this._listeners = new Map();
    this._stateTimer = 0;
  }

  _emitLocal(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        cb(payload);
      } catch (err) {
        console.warn(`[net] ${event} 리스너 오류`, err);
      }
    }
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    this._listeners.get(event)?.delete(cb);
  }

  async connect(nickname) {
    if (this.socket) return this.connected;
    this.nickname = nickname || this.nickname;
    try {
      this.socket = io(this.url, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
        timeout: 4000,
        autoConnect: true,
        query: this.nickname ? { nickname: this.nickname } : {}
      });
      this.socket.on('connect', () => {
        this.connected = true;
        this.id = this.socket.id;
        this._emitLocal('net:connect', { id: this.id });
      });
      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        this._emitLocal('net:disconnect', { reason });
      });
      this.socket.on('connect_error', (err) => {
        this.connected = false;
        this.lastError = err?.message || '연결 실패';
        this._emitLocal('net:error', { error: this.lastError });
      });
      if (this.nickname) this.socket.auth = { nickname: this.nickname };
      for (const evt of CLIENT_EVENTS) {
        this.socket.on(evt, (payload) => {
          if (evt === 'room:state') this.room = payload;
          if (evt === 'room:error') this.lastError = payload?.message || '오류';
          this._emitLocal(evt, payload);
        });
      }
      await new Promise((resolve) => {
        const done = () => resolve();
        if (this.socket.connected) return done();
        this.socket.once('connect', done);
        this.socket.once('connect_error', done);
        setTimeout(done, 4200);
      });
    } catch (err) {
      this.lastError = err?.message || '연결 실패';
      this.connected = false;
      this.socket = null;
    }
    return this.connected;
  }

  /** 접속 대상 서버를 바꾼다 — 연결 중이면 끊고 새 주소로 다시 연결한다. */
  setServer(url) {
    const next = url || (typeof location !== 'undefined' ? location.origin : 'http://localhost:3001');
    if (next === this.url && !this.socket) return false;
    this.disconnect();
    this.url = next;
    return true;
  }

  disconnect() {
    try {
      this.socket?.disconnect();
    } catch {
      /* 무시 */
    }
    this.socket = null;
    this.connected = false;
    this.id = null;
    this.room = null;
  }

  _ack(event, payload, timeout = 4000) {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        resolve({ ok: false, error: '서버에 연결되어 있지 않습니다' });
        return;
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({ ok: false, error: '서버 응답 없음' });
        }
      }, timeout);
      try {
        this.socket.emit(event, payload || {}, (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(res && typeof res === 'object' ? res : { ok: true });
        });
      } catch (err) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, error: err?.message || '전송 실패' });
      }
    });
  }

  async createRoom(opts = {}) {
    const res = await this._ack('room:create', opts);
    if (res.ok && res.state) this.room = res.state;
    if (!res.ok) this.lastError = res.error;
    return res;
  }

  async joinRoom(opts = {}) {
    const res = await this._ack('room:join', opts);
    if (res.ok && res.state) this.room = res.state;
    if (!res.ok) this.lastError = res.error;
    return res;
  }

  leaveRoom() {
    const res = this._ack('room:leave', {});
    this.room = null;
    return res;
  }

  setReady(ready) {
    return this._ack('room:ready', { ready: Boolean(ready) });
  }

  startGame() {
    return this._ack('room:start', {});
  }

  sendChat(text) {
    const t = String(text || '').slice(0, 200);
    if (!t) return Promise.resolve({ ok: false, error: '빈 메시지' });
    return this._ack('chat:send', { text: t }, 2500);
  }

  sendPlayerState(state) {
    if (!this.socket?.connected) return;
    const now = Date.now();
    if (now - this._stateTimer < 45) return; // ~20Hz 제한
    this._stateTimer = now;
    this.socket.volatile.emit('player:state', state);
  }

  sendTurretPlace(turret) {
    if (!this.socket?.connected) return;
    this.socket.emit('turret:place', turret);
  }

  sendTurretRotate(turret) {
    if (!this.socket?.connected) return;
    this.socket.emit('turret:rotate', turret);
  }

  sendTurretSell(turretId) {
    if (!this.socket?.connected) return;
    this.socket.emit('turret:sell', { turretId });
  }

  sendGameEvent(type, payload) {
    if (!this.socket?.connected) return;
    this.socket.emit('game:event', { type, payload });
  }

  onRoomState(cb) {
    return this.on('room:state', cb);
  }
  onSnapshot(cb) {
    return this.on('game:snapshot', cb);
  }
  onChat(cb) {
    return this.on('chat:message', cb);
  }
  onGameEvent(cb) {
    return this.on('game:event', cb);
  }
  onGameOver(cb) {
    return this.on('game:over', cb);
  }
  onError(cb) {
    return this.on('room:error', cb);
  }
}

export const net = new Net();

export default { api, auth, cloudSave, leaderboard, statsApi, netInfo, Net, net };

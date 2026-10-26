// 방 하나의 상태 + 서버 권위 20Hz 루프 (계약 §2.4)
import { randomUUID } from 'node:crypto';
import { CHAT_MAX, S2C, TICK_HZ, TICK_MS, clampNum, normalizeDifficulty, normalizeMode, sanitizeText, toInt } from './protocol.js';

const MAP_HALF = 2500;
const BASE_MAX_HP = 4100;
const MAX_TURRETS = 256;
const MAX_ENEMIES = 200;
const MAX_CHAT_LOG = 50;
/** 접속이 끊겨도 이 시간 동안은 자리를 비워 둔다 — 그 안에 돌아오면 이어서 한다. */
export const RECONNECT_GRACE_MS = 45000;
/** 로비에서 방장이 끊겼을 때 초대코드를 살려 두는 시간 — 새로고침·순단 대비 */
const EMPTY_GRACE_MS = 20000;
/** 재접속 토큰 최대 길이 */
const TOKEN_MAX = 64;
/** 캐릭터 외형 살균 — 스킨 id·아이콘·색만 남긴다(코스메틱, 능력치 없음) */
function sanitizeCharacter(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const skinId = sanitizeText(src.skin, 24).toLowerCase();
  // `__proto__` 같은 프로토타입 키도 여기서 걸러진다(소유 키 검사는 아래 defaults 에서 한 번 더).
  const skin = /^[a-z][a-z_]{1,23}$/.test(skinId) ? skinId : 'guardian';
  const hex = (v, alt) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 0xffffff) return alt;
    return Math.round(n);
  };
  // 외형별 기본 색(클라이언트가 색을 안 보내도 같은 모습이 되게) — 소유 키만 인정한다.
  const defaults = {
    guardian: [0x5b8dd6, 0x9dc0ff, '🛡️'],
    knight: [0xc9ccd6, 0xffffff, '⚔️'],
    mage: [0x9f7bff, 0xd9c2ff, '🧙'],
    archer: [0x6fbf73, 0xccf0cd, '🏹'],
    rogue: [0x4a4f63, 0x8f9bb3, '🗡️'],
    alchemist: [0x66d9d0, 0xd0fffb, '⚗️'],
    bard: [0xffb066, 0xffe3c2, '🎻'],
    fairy_friend: [0xff9fd2, 0xffe0f0, '🧚']
  };
  const known = Object.prototype.hasOwnProperty.call(defaults, skin);
  const safeSkin = known ? skin : 'guardian';
  const [dc, da, di] = defaults[safeSkin];
  return {
    skin: safeSkin,
    icon: sanitizeText(src.icon, 4) || di,
    color: hex(src.color, dc),
    accent: hex(src.accent, da)
  };
}

const SNAPSHOT_HZ = Math.min(TICK_HZ, 20);

export class Room {
  constructor({ code, hostId = null, mode = 'coop', seed = '', difficulty = 'normal', io = null, maxPlayers = 4, private: isPrivate = false }) {
    this.code = String(code || '').toUpperCase();
    this.hostId = hostId;
    this.mode = normalizeMode(mode);
    this.seed = sanitizeText(seed, 32);
    this.difficulty = normalizeDifficulty(difficulty);
    this.io = io;
    this.maxPlayers = toInt(clampNum(maxPlayers, 1, 8, 4), 4);
    // 비공개 방은 메인 화면 '열린 방' 목록에 올리지 않는다(초대코드를 아는 사람만 입장).
    this.private = isPrivate === true;
    this.phase = 'lobby';
    this.players = new Map();
    this.turrets = new Map();
    this.enemies = new Map();
    this.chatLog = [];
    this.wave = 1;
    this.kills = 0;
    this.gold = 0;
    this.score = 0;
    this.duration = 0;
    this.baseHp = BASE_MAX_HP;
    this.baseMaxHp = BASE_MAX_HP;
    this.createdAt = Date.now();
    this.startedAt = 0;
    this.emptyGraceUntil = Date.now() + 2000;
    this.onEmpty = null;
    this.timer = null;
    this._lastTickBucket = -1;
    this._snapshotBucket = -1;
    this._turretSeq = 0;
    this.startTimer();
  }

  /** 서버 틱 간격(ms) */
  get intervalMs() {
    return TICK_MS;
  }

  /** 20Hz 루프 시작 (중복 호출 안전) */
  startTimer() {
    if (this.timer) return this.timer;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return this.timer;
  }

  /** 루프 정지 — 빈 방은 반드시 타이머를 멈춘다 */
  stopTimer() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** 플레이어 입장 — character 는 코스메틱 외형(서버가 다시 살균한다) */
  addPlayer(socket, nickname, character) {
    if (!socket || !socket.id) return { ok: false, error: '소켓이 없습니다' };
    if (this.players.has(socket.id)) {
      const existing = this.players.get(socket.id);
      return { ok: true, player: existing, token: existing.token };
    }
    if (this.players.size >= this.maxPlayers) return { ok: false, error: '방이 가득 찼습니다' };
    if (this.phase !== 'lobby') return { ok: false, error: '이미 시작된 게임입니다' };
    const player = {
      id: socket.id,
      // 재접속 토큰 — 소켓이 끊겼다 새로 붙어도 같은 좌석을 찾을 수 있게 한다.
      token: randomUUID(),
      connected: true,
      disconnectedAt: 0,
      nickname: sanitizeText(nickname, 16) || '플레이어',
      character: sanitizeCharacter(character),
      ready: false,
      alive: true,
      hp: 100,
      maxHp: 100,
      mana: 100,
      maxMana: 100,
      wave: this.wave,
      kills: 0,
      gold: 0,
      state: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hp: 100, mana: 100, element: 'arcane', tier: 1, anim: 'idle' },
    };
    this.players.set(socket.id, player);
    if (!this.hostId) this.hostId = socket.id;
    if (typeof socket.join === 'function') socket.join(this.code);
    player.socket = socket;
    this.startTimer();
    this.broadcastState();
    return { ok: true, player, token: player.token };
  }

  /** 접속 중인(끊기지 않은) 플레이어 수 */
  get connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n += 1;
    return n;
  }

  /** 플레이어 퇴장 — 진행 중 이탈도 안전해야 한다 */
  removePlayer(socketId, { silent = false, keepEmpty = false } = {}) {
    const player = this.players.get(socketId);
    if (!player) return null;
    this.players.delete(socketId);
    player.socket = null;
    const hostChanged = this.hostId === socketId;
    if (hostChanged) this.hostId = this.players.keys().next().value ?? null;
    if (this.players.size === 0) {
      if (this.phase === 'playing') this.end();
      this.stopTimer();
      // 접속이 끊긴 경우(새로고침·와이파이 순단)에는 코드를 잠시 살려 둔다.
      //  바로 지우면 친구가 같은 초대코드로 들어올 때 '방을 찾을 수 없습니다'가 된다.
      if (keepEmpty) {
        this.emptyGraceUntil = Date.now() + EMPTY_GRACE_MS;
        return player;
      }
      if (typeof this.onEmpty === 'function') {
        try { this.onEmpty(this); } catch { /* 정리 실패는 무시 */ }
      }
    } else {
      // 로비든 진행 중이든 방장 변경·인원 변화를 즉시 알린다(유령 방장 방지).
      this.broadcastState();
      if (!silent) {
        this.emit(S2C.GAME_EVENT, {
          type: 'system',
          payload: { message: `${player.nickname}님이 나갔습니다`, kind: 'player:left', playerId: player.id },
          from: player.id,
        });
      }
    }
    return player;
  }

  /**
   * 접속 끊김 처리 — 진행 중이면 45초 동안 자리를 비워 두고, 로비면 바로 내보낸다.
   * 유예 시간 안에 rejoinPlayer(token) 로 돌아오면 같은 좌석·같은 상태로 이어진다.
   */
  handleDisconnect(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    player.socket = null;
    // 방장이 끊기면 다른 사람에게 바로 넘긴다(유령 방장이 시작을 막지 않게).
    if (this.hostId === socketId) {
      const next = [...this.players.values()].find((p) => p.id !== socketId && p.connected !== false);
      if (next) this.hostId = next.id;
    }
    if (this.phase === 'playing') {
      player.connected = false;
      player.disconnectedAt = Date.now();
      this.broadcastState();
      this.emit(S2C.GAME_EVENT, {
        type: 'system',
        payload: {
          message: `${player.nickname}님의 접속이 끊겼습니다 — ${Math.round(RECONNECT_GRACE_MS / 1000)}초 안에 돌아오면 이어서 합니다`,
          kind: 'player:disconnect',
          playerId: player.id,
        },
        from: player.id,
      });
      return player;
    }
    return this.removePlayer(socketId, { silent: true, keepEmpty: true });
  }

  /** 재접속 — 토큰으로 좌석을 찾아 새 소켓에 다시 붙인다. */
  rejoinPlayer(token, socket) {
    const key = sanitizeText(token, TOKEN_MAX);
    if (!key || !socket?.id) return { ok: false, error: '재접속 정보가 없습니다' };
    let target = null;
    for (const p of this.players.values()) {
      if (p.token === key) { target = p; break; }
    }
    if (!target) return { ok: false, error: '재접속 시간이 만료되었습니다(45초)' };
    if (this.players.has(socket.id) && this.players.get(socket.id) !== target) {
      return { ok: false, error: '이미 접속 중입니다' };
    }
    const oldId = target.id;
    const wasDisconnected = target.connected === false;
    this.players.delete(oldId);
    target.id = socket.id;
    target.connected = true;
    target.disconnectedAt = 0;
    this.players.set(socket.id, target);
    if (this.hostId === oldId) this.hostId = socket.id;
    if (typeof socket.join === 'function') socket.join(this.code);
    target.socket = socket;
    this.broadcastState();
    if (wasDisconnected) {
      this.emit(S2C.GAME_EVENT, {
        type: 'system',
        payload: { message: `${target.nickname}님이 다시 접속했습니다`, kind: 'player:rejoin', playerId: target.id },
        from: target.id,
      });
    }
    return { ok: true, player: target, token: target.token, state: this.serialize(), snapshot: this.snapshot() };
  }

  /** 유예 시간이 지난 끊긴 플레이어 정리 — tick 에서 호출 */
  purgeDisconnected(now = Date.now()) {
    let removed = 0;
    for (const p of [...this.players.values()]) {
      if (p.connected) continue;
      if (!p.disconnectedAt || now - p.disconnectedAt < RECONNECT_GRACE_MS) continue;
      this.removePlayer(p.id, { silent: false });
      removed += 1;
    }
    return removed;
  }

  /** 준비 상태 토글 */
  setReady(id, ready) {
    const player = this.players.get(id);
    if (!player) return { ok: false, error: '플레이어를 찾을 수 없습니다' };
    player.ready = !!ready;
    this.broadcastState();
    return { ok: true };
  }

  /** 이동/체력 상태 반영 (서버는 값만 클램프) */
  setPlayerState(id, state) {
    const player = this.players.get(id);
    if (!player || !state || typeof state !== 'object') return false;
    const prev = player.state;
    player.state = {
      x: clampNum(state.x, -MAP_HALF, MAP_HALF, prev.x),
      y: clampNum(state.y, -500, 2000, prev.y),
      z: clampNum(state.z, -MAP_HALF, MAP_HALF, prev.z),
      yaw: clampNum(state.yaw, -Math.PI * 4, Math.PI * 4, prev.yaw),
      pitch: clampNum(state.pitch, -Math.PI / 2, Math.PI / 2, prev.pitch),
      hp: clampNum(state.hp, 0, 1e6, prev.hp),
      mana: clampNum(state.mana, 0, 1e6, prev.mana),
      element: sanitizeText(state.element ?? prev.element, 24) || prev.element,
      tier: toInt(clampNum(state.tier, 1, 7, prev.tier), prev.tier),
      anim: sanitizeText(state.anim ?? prev.anim, 24) || prev.anim,
      sit: typeof state.sit === 'boolean' ? state.sit : prev.sit === true,
    };
    player.hp = player.state.hp;
    player.mana = player.state.mana;
    player.alive = player.state.hp > 0;
    return true;
  }

  /** 포탑 설치 (검증 후 저장) — `{ entry, created }` 를 돌려준다(중복 중계 방지). */
  placeTurret(id, turret) {
    if (!turret || typeof turret !== 'object') return { entry: null, created: false, error: '건물 정보가 없습니다' };
    const turretId = sanitizeText(turret.id ?? turret.turretId, 32) || `t${++this._turretSeq}`;
    if (this.turrets.has(turretId)) return { entry: this.turrets.get(turretId), created: false };
    if (this.turrets.size >= MAX_TURRETS) return { entry: null, created: false, error: '건물이 너무 많습니다' };
    const entry = {
      id: turretId,
      typeId: sanitizeText(turret.typeId, 32) || 'unknown',
      x: clampNum(turret.x, -MAP_HALF, MAP_HALF, 0),
      y: clampNum(turret.y, -500, 2000, 0),
      z: clampNum(turret.z, -MAP_HALF, MAP_HALF, 0),
      // 방향은 설치할 때 한 번만 정해진다 — 재동기화(스냅샷)에도 실어 보낸다.
      yaw: clampNum(turret.yaw, -Math.PI * 4, Math.PI * 4, 0),
      // 소유자는 클라이언트 주장이 아니라 실제 소켓 id 를 쓴다(사칭 방지).
      ownerId: id,
    };
    this.turrets.set(turretId, entry);
    return { entry, created: true };
  }

  /** 포탑 판매/철거 — 소유자 또는 방장만 */
  removeTurret(id, turretId) {
    const key = sanitizeText(turretId, 32);
    if (!key || !this.turrets.has(key)) return null;
    const entry = this.turrets.get(key);
    if (entry.ownerId !== id && this.hostId !== id) return null;
    this.turrets.delete(key);
    return entry;
  }

  /** 게임 시작 */
  start() {
    if (this.phase === 'playing') return { ok: false, error: '이미 진행 중입니다' };
    if (this.players.size === 0) return { ok: false, error: '플레이어가 없습니다' };
    this.phase = 'playing';
    this.startedAt = Date.now();
    this.wave = 1;
    this.baseHp = this.baseMaxHp;
    // 재대국 준비 — 이전 판의 집계가 남으면 점수가 부풀려진다.
    this.kills = 0;
    this.gold = 0;
    this.score = 0;
    this.duration = 0;
    this.turrets.clear();
    this.enemies.clear();
    // 시드가 비어 있으면 모두가 다른 월드를 보게 된다 — 여기서 한 번만 정한다.
    if (!this.seed) this.seed = `mp-${Math.random().toString(36).slice(2, 10)}`;
    this.startTimer();
    for (const player of this.players.values()) {
      player.ready = true;
      player.alive = true;
      player.wave = this.wave;
    }
    this.emit(S2C.GAME_START, {
      seed: this.seed,
      mode: this.mode,
      difficulty: this.difficulty,
      wave: this.wave,
      startAt: this.startedAt,
    });
    this.broadcastState();
    return { ok: true, seed: this.seed };
  }

  /** 게임 종료 + game:over 방송 */
  end() {
    if (this.phase === 'ended') return { ok: true };
    this.phase = 'ended';
    this.duration = this.startedAt ? Math.max(0, Math.round((Date.now() - this.startedAt) / 1000)) : 0;
    this.score = Math.max(0, Math.floor(this.wave * 1000 + this.kills * 10 + this.gold / 10));
    this.stopTimer();
    this.emit(S2C.GAME_OVER, { wave: this.wave, score: this.score, duration: this.duration, stats: this.stats() });
    this.broadcastState();
    return { ok: true };
  }

  /** 집계용 요약 */
  stats() {
    return {
      wave: this.wave,
      kills: this.kills,
      gold: Math.round(this.gold),
      score: this.score,
      duration: this.duration,
      players: this.players.size,
      connected: this.connectedCount,
      baseHp: this.baseHp,
    };
  }

  /** 클라이언트 game:event 반영 + 중계 (서버는 수치만 검증) */
  applyGameEvent(from, type, payload) {
    const kind = sanitizeText(type, 32);
    const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    switch (kind) {
      case 'enemy:killed':
        this.kills += 1;
        this.gold += clampNum(data.gold, 0, 1e6, 0);
        break;
      case 'wave:start':
      case 'wave:complete':
        this.wave = Math.max(this.wave, toInt(clampNum(data.wave, 1, 1e6, this.wave), this.wave));
        this.enemies.clear();
        break;
      case 'base:damage':
        this.baseHp = clampNum(this.baseHp - clampNum(data.amount, 0, 1e6, 0), 0, this.baseMaxHp, this.baseHp);
        if (this.baseHp <= 0 && this.phase === 'playing') this.end();
        break;
      case 'enemy:spawn': {
        if (this.enemies.size >= MAX_ENEMIES) break;
        const eid = sanitizeText(data.id, 32) || `e${this.enemies.size + 1}`;
        this.enemies.set(eid, {
          id: eid,
          type: sanitizeText(data.type, 32) || 'unknown',
          x: clampNum(data.x, -MAP_HALF, MAP_HALF, 0),
          z: clampNum(data.z, -MAP_HALF, MAP_HALF, 0),
          hp: clampNum(data.hp, 0, 1e9, 0),
          maxHp: clampNum(data.maxHp ?? data.hp, 0, 1e9, 0),
          isBoss: !!data.isBoss,
        });
        break;
      }
      default:
        // 모르는 타입은 중계하지 않는다 — 시스템 알림/사운드 위조 통로를 막는다.
        return false;
    }
    // 중계용 사본 — 클라이언트가 넣은 message 같은 자유 문자열은 시스템 알림으로 쓰이지 않게 뺀다.
    const relay = { ...data };
    delete relay.message;
    if (relay.sound !== undefined) relay.sound = sanitizeText(relay.sound, 32);
    this.emit(S2C.GAME_EVENT, { type: kind, payload: relay, from });
    return true;
  }

  /** 채팅 (200자 제한) */
  chat(socketId, text) {
    const player = this.players.get(socketId);
    if (!player) return { ok: false, error: '플레이어를 찾을 수 없습니다' };
    const message = sanitizeText(text, CHAT_MAX);
    if (!message) return { ok: false, error: '빈 메시지입니다' };
    const entry = { id: `${socketId}-${Date.now()}`, nickname: player.nickname, text: message, ts: Date.now() };
    this.chatLog.push(entry);
    if (this.chatLog.length > MAX_CHAT_LOG) this.chatLog.shift();
    this.emit(S2C.CHAT_MESSAGE, entry);
    return { ok: true, message: entry };
  }

  /** room:state 페이로드 */
  serialize() {
    return {
      code: this.code,
      hostId: this.hostId,
      mode: this.mode,
      seed: this.seed,
      difficulty: this.difficulty,
      phase: this.phase,
      maxPlayers: this.maxPlayers,
      private: this.private,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        character: p.character,
        ready: !!p.ready,
        alive: !!p.alive,
        connected: p.connected !== false,
        hp: Math.round(p.hp),
        wave: p.wave,
      })),
      chat: this.chatLog.slice(-MAX_CHAT_LOG),
    };
  }

  /**
   * 방 목록(GET /api/rooms)용 요약 — 참가 판단에 필요한 최소 정보만 담는다.
   * 비공개 여부는 사실대로 실어 보내고, 공개 여부 판단은 RoomManager 가 한다.
   */
  summary(now = Date.now()) {
    const host = this.hostId ? this.players.get(this.hostId) : null;
    return {
      code: this.code,
      mode: this.mode,
      seed: this.seed,
      difficulty: this.difficulty,
      phase: this.phase,
      players: this.players.size,
      connected: this.connectedCount,
      maxPlayers: this.maxPlayers,
      host: sanitizeText(host?.nickname, 16) || '',
      private: this.private,
      joinable: this.phase === 'lobby' && this.players.size < this.maxPlayers,
      ageSec: Math.max(0, Math.round((now - this.createdAt) / 1000))
    };
  }

  /** room:state 방송 */
  broadcastState() {
    this.emit(S2C.ROOM_STATE, this.serialize());
  }

  /** game:snapshot 페이로드 */
  snapshot(now = Date.now()) {
    const players = {};
    for (const p of this.players.values()) {
      players[p.id] = {
        x: p.state.x,
        y: p.state.y,
        z: p.state.z,
        yaw: p.state.yaw,
        pitch: p.state.pitch,
        hp: p.state.hp,
        mana: p.state.mana,
        nickname: p.nickname,
        character: p.character,
        sit: p.state.sit === true,
        alive: !!p.alive,
        connected: p.connected !== false,
      };
    }
    return {
      t: this.startedAt ? Math.max(0, (now - this.startedAt) / 1000) : 0,
      wave: this.wave,
      phase: this.phase,
      baseHp: this.baseHp,
      baseMaxHp: this.baseMaxHp,
      players,
      enemies: [...this.enemies.values()],
      turrets: [...this.turrets.values()],
    };
  }

  /** 20Hz 서버 틱 — playing 중에만 스냅샷 방송 */
  tick() {
    const now = Date.now();
    const bucket = Math.floor(now / this.intervalMs);
    if (bucket === this._lastTickBucket) return;
    this._lastTickBucket = bucket;

    // 재접속 유예가 지난 좌석은 여기서 회수한다(그 사이 돌아오면 살아난다).
    this.purgeDisconnected(now);
    if (this.players.size === 0) {
      if (now > this.emptyGraceUntil) {
        this.stopTimer();
        if (typeof this.onEmpty === 'function') {
          try { this.onEmpty(this); } catch { /* 무시 */ }
        }
      }
      return;
    }
    if (this.phase !== 'playing') return;

    this.duration = this.startedAt ? Math.max(0, Math.round((now - this.startedAt) / 1000)) : 0;
    this.score = Math.max(0, Math.floor(this.wave * 1000 + this.kills * 10 + this.gold / 10));
    const snapshotBucket = Math.floor(now / (1000 / SNAPSHOT_HZ));
    if (snapshotBucket !== this._snapshotBucket) {
      this._snapshotBucket = snapshotBucket;
      this.emit(S2C.GAME_SNAPSHOT, this.snapshot(now));
    }
  }

  /** 방 정리 */
  dispose() {
    this.stopTimer();
    for (const p of this.players.values()) {
      const socket = p.socket;
      p.socket = null;
      if (!socket) continue;
      try {
        if (socket.data && socket.data.roomCode === this.code) socket.data.roomCode = null;
      } catch { /* 무시 */ }
      try {
        if (typeof socket.leave === 'function') socket.leave(this.code);
      } catch { /* 무시 */ }
    }
    this.players.clear();
    this.turrets.clear();
    this.enemies.clear();
    this.chatLog.length = 0;
    this.io = null;
  }

  /** io가 있으면 방 전체 방송 */
  emit(event, payload) {
    if (!this.io) return;
    try { this.io.to(this.code).emit(event, payload); } catch { /* 소켓 오류는 무시 */ }
  }
}

export default Room;

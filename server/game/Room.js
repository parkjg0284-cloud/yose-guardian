// 방 하나의 상태 + 서버 권위 20Hz 루프 (계약 §2.4)
import { CHAT_MAX, S2C, TICK_HZ, TICK_MS, clampNum, normalizeDifficulty, normalizeMode, sanitizeText, toInt } from './protocol.js';

const MAP_HALF = 2500;
const BASE_MAX_HP = 4100;
const MAX_TURRETS = 256;
const MAX_ENEMIES = 200;
const MAX_CHAT_LOG = 50;
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
    this.maxPlayers = toInt(clampNum(maxPlayers, 1, 16, 4), 4);
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
    if (this.players.has(socket.id)) return { ok: true, player: this.players.get(socket.id) };
    if (this.players.size >= this.maxPlayers) return { ok: false, error: '방이 가득 찼습니다' };
    if (this.phase !== 'lobby') return { ok: false, error: '이미 시작된 게임입니다' };
    const player = {
      id: socket.id,
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
    this.startTimer();
    this.broadcastState();
    return { ok: true, player };
  }

  /** 플레이어 퇴장 — 진행 중 이탈도 안전해야 한다 */
  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    this.players.delete(socketId);
    if (this.hostId === socketId) this.hostId = this.players.keys().next().value ?? null;
    if (this.players.size === 0) {
      if (this.phase === 'playing') this.end();
      this.stopTimer();
      if (typeof this.onEmpty === 'function') {
        try { this.onEmpty(this); } catch { /* 정리 실패는 무시 */ }
      }
    } else if (this.phase === 'lobby') {
      this.broadcastState();
    }
    return player;
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

  /** 포탑 설치 (검증 후 저장) */
  placeTurret(id, turret) {
    if (!turret || typeof turret !== 'object') return null;
    if (this.turrets.size >= MAX_TURRETS) return null;
    const turretId = sanitizeText(turret.id ?? turret.turretId, 32) || `t${++this._turretSeq}`;
    if (this.turrets.has(turretId)) return this.turrets.get(turretId);
    const entry = {
      id: turretId,
      typeId: sanitizeText(turret.typeId, 32) || 'unknown',
      x: clampNum(turret.x, -MAP_HALF, MAP_HALF, 0),
      y: clampNum(turret.y, -500, 2000, 0),
      z: clampNum(turret.z, -MAP_HALF, MAP_HALF, 0),
      ownerId: sanitizeText(turret.ownerId ?? id, 64),
    };
    this.turrets.set(turretId, entry);
    return entry;
  }

  /** 포탑 판매/철거 */
  removeTurret(id, turretId) {
    const key = sanitizeText(turretId, 32);
    if (!key || !this.turrets.has(key)) return null;
    const entry = this.turrets.get(key);
    this.turrets.delete(key);
    return entry;
  }

  /** 게임 시작 */
  start() {
    if (this.phase === 'playing') return { ok: false, error: '이미 진행 중입니다' };
    if (this.players.size === 0) return { ok: false, error: '플레이어가 없습니다' };
    this.phase = 'playing';
    this.startedAt = Date.now();
    this.wave = Math.max(1, toInt(this.wave, 1));
    this.baseHp = this.baseMaxHp;
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
    return { ok: true };
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
        break;
    }
    this.emit(S2C.GAME_EVENT, { type: kind, payload: data, from });
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
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        nickname: p.nickname,
        character: p.character,
        ready: !!p.ready,
        alive: !!p.alive,
        hp: Math.round(p.hp),
        wave: p.wave,
      })),
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

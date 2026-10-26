// 방 목록 관리 + 코드 생성 (계약 §2.4)
import { Room } from './Room.js';
import { clampNum, normalizeDifficulty, normalizeMode, sanitizeText, toInt } from './protocol.js';

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ROOM_TTL_MS = 10 * 60 * 1000;

export class RoomManager {
  constructor({ io = null } = {}) {
    this.io = io;
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
  }

  /** 새 방 생성 (호스트는 아직 입장 전) */
  createRoom({ hostId = null, mode = 'coop', seed = '', difficulty = 'normal', maxPlayers = 4, private: isPrivate = false } = {}) {
    const code = this.uniqueCode();
    const room = new Room({
      code,
      hostId,
      mode: normalizeMode(mode),
      seed: sanitizeText(seed, 32),
      difficulty: normalizeDifficulty(difficulty),
      io: this.io,
      maxPlayers: toInt(clampNum(maxPlayers, 1, 8, 4), 4),
      private: isPrivate === true
    });
    room.onEmpty = () => this.removeRoom(room.code);
    this.rooms.set(code, room);
    return room;
  }

  /** 코드로 입장. 실패 시 `{ok:false, error}` */
  joinRoom(code, socket, nickname, character) {
    const room = this.getRoom(code);
    if (!room) return { ok: false, error: '방을 찾을 수 없습니다' };
    const result = room.addPlayer(socket, nickname, character);
    if (!result.ok) return result;
    return { ok: true, room, player: result.player, state: room.serialize() };
  }

  /** 코드로 방 조회 (대소문자 무시) */
  getRoom(code) {
    const key = sanitizeText(code, 8).toUpperCase();
    return key ? this.rooms.get(key) || null : null;
  }

  /** 방 제거 + 타이머/소켓 정리 */
  removeRoom(code) {
    const key = sanitizeText(code, 8).toUpperCase();
    const room = this.rooms.get(key);
    if (!room) return false;
    try { room.dispose(); } catch { /* 무시 */ }
    this.rooms.delete(key);
    return true;
  }

  /** 방 개수 */
  get count() {
    return this.rooms.size;
  }

  /** 모든 방을 한 번 틱 (방별 타이머와 중복 호출 안전) */
  tickAll() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      try {
        room.tick();
      } catch (err) {
        console.error(`[room ${room.code}] tick 실패:`, err?.message || err);
      }
      const idle = room.players.size === 0 && now - room.createdAt > ROOM_TTL_MS;
      const finished = room.phase === 'ended' && now - room.createdAt > ROOM_TTL_MS;
      if (idle || finished) this.removeRoom(room.code);
    }
  }

  /**
   * 공개 방 목록 — 메인 화면 '열린 방'(초대코드 없이 클릭 참가).
   *   · 비공개 방(private)은 코드를 아는 사람만 → 목록에서 제외
   *   · 로비 단계 방만(이미 시작/종료된 방은 들어갈 수 없다)
   *   · 참가 가능한 방 먼저 → 인원 많은 순 → 코드 순 (매번 같은 순서라 UI 가 덜 흔들린다)
   */
  listPublic({ includeFull = true } = {}) {
    const now = Date.now();
    return [...this.rooms.values()]
      .filter((room) => !room.private && room.phase === 'lobby' && room.players.size > 0 && (includeFull || room.players.size < room.maxPlayers))
      .map((room) => room.summary(now))
      .sort((a, b) => Number(b.joinable) - Number(a.joinable) || b.players - a.players || a.code.localeCompare(b.code));
  }

  /** 사용 중이지 않은 4자리 A-Z0-9 코드 생성 */
  static generateCode(taken = null) {
    const isFree = (c) => !taken || !taken.has(c);
    for (let i = 0; i < 500; i += 1) {
      let code = '';
      for (let k = 0; k < 4; k += 1) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (isFree(code)) return code;
    }
    for (let n = 0; n < 36 ** 4; n += 1) {
      let value = n;
      let code = '';
      for (let k = 0; k < 4; k += 1) {
        code = CODE_ALPHABET[value % 36] + code;
        value = Math.floor(value / 36);
      }
      if (isFree(code)) return code;
    }
    return 'AAAA';
  }

  /** 이 매니저 안에서 중복되지 않는 코드 */
  uniqueCode() {
    return RoomManager.generateCode(new Set(this.rooms.keys()));
  }
}

export default RoomManager;

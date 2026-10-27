// 소켓 프로토콜 상수 + 공용 검증 유틸 (계약 §2.3)

/** 클라이언트 → 서버 이벤트 이름 */
export const C2S = Object.freeze({
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_REJOIN: 'room:rejoin',
  ROOM_LEAVE: 'room:leave',
  ROOM_READY: 'room:ready',
  ROOM_START: 'room:start',
  CHAT_SEND: 'chat:send',
  PLAYER_STATE: 'player:state',
  TURRET_PLACE: 'turret:place',
  TURRET_SELL: 'turret:sell',
  GAME_EVENT: 'game:event',
});

/** 서버 → 클라이언트 이벤트 이름 */
export const S2C = Object.freeze({
  ROOM_STATE: 'room:state',
  ROOM_ERROR: 'room:error',
  CHAT_MESSAGE: 'chat:message',
  GAME_START: 'game:start',
  GAME_SNAPSHOT: 'game:snapshot',
  GAME_EVENT: 'game:event',
  GAME_OVER: 'game:over',
});

/** 평탄화된 전체 이벤트 맵 */
export const EVENTS = Object.freeze({
  ...C2S,
  ...S2C,
  C2S,
  S2C,
});

/** 서버 틱 주파수 (.env SERVER_TICK_HZ, 기본 20) */
export const TICK_HZ = clampNum(process.env.SERVER_TICK_HZ, 1, 120, 20);

/** 서버 틱 간격(ms) */
export const TICK_MS = 1000 / TICK_HZ;

/** 서버가 아는 게임 모드 */
// client/src/data.js 의 MODES 와 id 를 일치시킨다 (서버는 정원/표시용으로만 사용)
export const MODES = Object.freeze([
  { id: 'solo', name: '혼자 지키기', maxPlayers: 1, desc: '1인 방어' },
  { id: 'coop', name: '협동 방어', maxPlayers: 4, desc: '친구와 함께 요새를 지킨다' },
  { id: 'endless', name: '무한 모드', maxPlayers: 4, desc: '끝없이 밀려오는 적을 버틴다' },
  { id: 'creative', name: '창조', maxPlayers: 4, desc: '자원 무한, 자유 건설' },
  { id: 'hardcore', name: '하드코어', maxPlayers: 2, desc: '한 번의 실수도 용납되지 않는다 (레거시)' },
]);

/** 기본 게임 모드 */
export const DEFAULT_MODE = 'coop';

/** 모드 id 목록 */
export const MODE_IDS = Object.freeze(MODES.map((m) => m.id));

/** 난이도 목록 (서버는 검증용으로만 사용) */
// client/src/data.js 의 DIFFICULTIES 와 id/수치를 일치시킨다 ('easy' 는 평온의 레거시 별칭)
export const DIFFICULTIES = Object.freeze([
  { id: 'peaceful', name: '평온', hpMult: 0.7, attackMult: 0.7, countMult: 0.8, goldMult: 1.3, desc: '느긋하게 즐기는 모드' },
  { id: 'normal', name: '표준', hpMult: 1.0, attackMult: 1.0, countMult: 1.0, goldMult: 1.0, desc: '기본 밸런스' },
  { id: 'hard', name: '도전', hpMult: 1.8, attackMult: 1.35, countMult: 1.25, goldMult: 0.85, desc: '단단하고 사나운 적 — 숙련자용' },
  { id: 'nightmare', name: '악몽', hpMult: 3.0, attackMult: 2.0, countMult: 1.6, goldMult: 0.7, desc: '모든 것이 적으로 변한다' },
  { id: 'hell', name: '지옥', hpMult: 5.0, attackMult: 3.0, countMult: 1.8, goldMult: 0.55, maxWaves: 100, desc: '100 웨이브 고정 — 마지막에 디아블로 강림' },
  { id: 'easy', name: '쉬움 (레거시)', hpMult: 0.7, attackMult: 0.7, countMult: 0.8, goldMult: 1.3, desc: '평온의 이전 이름' },
]);

/** 난이도 id 목록 */
export const DIFFICULTY_IDS = Object.freeze(DIFFICULTIES.map((d) => d.id));

/** 기본 난이도 */
export const DEFAULT_DIFFICULTY = 'normal';

/** 채팅 최대 길이 */
export const CHAT_MAX = 200;

/** 숫자로 강제 변환 후 [min,max]로 자른다. 변환 실패 시 fallback. */
export function clampNum(v, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(v);
  const base = Number.isFinite(n) ? n : fallback;
  if (!Number.isFinite(base)) return fallback;
  const lo = Number.isFinite(min) ? min : -Infinity;
  const hi = Number.isFinite(max) ? max : Infinity;
  return Math.min(hi, Math.max(lo, base));
}

/** 문자열을 trim + 제어문자 제거 후 max 길이로 자른다. */
export function sanitizeText(str, max = CHAT_MAX) {
  if (str === null || str === undefined) return '';
  const cap = clampNum(max, 1, 100000, CHAT_MAX);
  const out = String(str)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out.length > cap ? out.slice(0, cap) : out;
}

/** 유한한 정수면 그대로, 아니면 fallback. */
export function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** 모드 문자열 정규화 (미지의 값은 기본 모드로 대체) */
export function normalizeMode(mode) {
  const m = sanitizeText(mode, 24).toLowerCase();
  if (!m) return DEFAULT_MODE;
  return /^[a-z0-9_-]{1,24}$/.test(m) ? m : DEFAULT_MODE;
}

/** 난이도 문자열 정규화 */
export function normalizeDifficulty(difficulty) {
  const d = sanitizeText(difficulty, 24).toLowerCase();
  return DIFFICULTY_IDS.includes(d) ? d : DEFAULT_DIFFICULTY;
}

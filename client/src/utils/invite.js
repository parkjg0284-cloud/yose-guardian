// 초대코드 유틸 — 순수 로직(THREE·DOM 금지).
//
// 서버(server/game/RoomManager.js)가 만드는 방 코드는 **4자리 A-Z0-9** 이고,
// 대소문자를 구분하지 않는다(서버가 항상 대문자로 정규화). 클라이언트는 같은 규칙을 써서
//  - 입력을 즉시 정규화하고(공백·하이픈·소문자 허용),
//  - 유효할 때만 [참가] 버튼을 켜고,
//  - `?room=CODE` 초대 링크를 만들고 읽는다.

/** 코드 길이(서버와 동일해야 한다) */
export const INVITE_CODE_LENGTH = 4;
/** 코드 알파벳(서버 RoomManager.CODE_ALPHABET 과 동일) */
export const INVITE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** 초대 링크 쿼리 키 — 예: http://host:3001/?room=K7F2 */
export const INVITE_QUERY_KEY = 'room';

/** 입력에서 코드 문자만 뽑아 대문자로 만든다(최대 길이 제한) */
export function normalizeInviteCode(input) {
  const raw = input == null ? '' : String(input);
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (INVITE_ALPHABET.includes(ch)) out += ch;
    if (out.length >= INVITE_CODE_LENGTH) break;
  }
  return out;
}

/** 정확히 length 자리인가 */
export function isValidInviteCode(input) {
  return normalizeInviteCode(input).length === INVITE_CODE_LENGTH;
}

/** 사람이 읽기 좋은 표시(4자리를 한 칸 띄우지 않고 그대로 — 복사하기 쉽게) */
export function formatInviteCode(input) {
  return normalizeInviteCode(input);
}

/** 초대 링크 만들기 — origin 이 없으면 상대 경로만 돌려준다(온전한 코드만) */
export function inviteLink(code, origin = null) {
  const c = normalizeInviteCode(code);
  if (c.length !== INVITE_CODE_LENGTH) return '';
  const base = origin == null ? safeOrigin() : String(origin);
  const path = `/?${INVITE_QUERY_KEY}=${c}`;
  return base ? `${base.replace(/\/+$/, '')}${path}` : path;
}

/** 친구에게 붙여넣을 초대 문구 */
export function inviteMessage(code, origin = null) {
  const c = normalizeInviteCode(code);
  if (c.length !== INVITE_CODE_LENGTH) return '';
  const link = inviteLink(c, origin);
  return `요새의 수호자 협동 — 초대코드 ${c}\n${link}`;
}

/** `?room=CODE` 에서 코드 추출 */
export function codeFromUrl(search = null) {
  try {
    const q = search == null ? globalThis.location?.search : search;
    if (!q) return '';
    const value = new URLSearchParams(String(q)).get(INVITE_QUERY_KEY);
    const code = value ? normalizeInviteCode(value) : '';
    // ?room=AB 처럼 잘린 코드는 없는 것으로 본다(참가 시도 자체를 하지 않는다).
    return code.length === INVITE_CODE_LENGTH ? code : '';
  } catch {
    return '';
  }
}

/** 초대 링크로 들어온 경우인가(참가 시도했는지 표시용) */
export function hasInviteInUrl(search = null) {
  return codeFromUrl(search).length === INVITE_CODE_LENGTH;
}

/* ── 공유 주소 — localhost 링크는 남에게 쓸모없다 ─────────────────── */

/** 루프백(이 PC 에서만 열리는) 호스트인가 — localhost · 127.x · ::1 · 0.0.0.0 */
export function isLoopbackHost(host) {
  const h = String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!h) return true; // 알 수 없음 = 이 PC 전용으로 본다
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true;
  return /^127\./.test(h);
}

/** origin 문자열이 이 PC 전용인가(파싱 실패·빈 값도 true) */
export function isLoopbackOrigin(origin) {
  if (!origin) return true;
  try {
    return isLoopbackHost(new URL(String(origin)).hostname);
  } catch {
    return true;
  }
}

/**
 * 남에게 보낼 초대 링크의 기준 주소를 고른다.
 *  - 지금 접속한 주소가 localhost 가 아니면 그대로 쓴다(터널·도메인·LAN 접속).
 *  - localhost 라면 서버가 알려준 LAN 주소를 쓴다(protocol 이 같으면 우선).
 *  - LAN 주소도 없으면 어쩔 수 없이 지금 주소를 쓴다(같은 PC 전용).
 */
export function resolveShareOrigin({ origin = null, lanUrls = null, protocol = null } = {}) {
  const current = trimSlash(origin == null ? safeOrigin() : String(origin));
  if (!isLoopbackOrigin(current)) return current;
  const urls = (Array.isArray(lanUrls) ? lanUrls : []).map((u) => trimSlash(String(u ?? ''))).filter(Boolean);
  if (!urls.length) return current;
  const want = String(protocol || protocolOf(current) || 'http').replace(/:+$/, '');
  const same = urls.find((u) => protocolOf(u) === want);
  return same || urls[0];
}

function protocolOf(origin) {
  try {
    return new URL(String(origin)).protocol.replace(/:+$/, '');
  } catch {
    return '';
  }
}

function trimSlash(s) {
  return String(s ?? '').replace(/\/+$/, '');
}

function safeOrigin() {
  try {
    return String(globalThis.location?.origin ?? '');
  } catch {
    return '';
  }
}

/* ── 최근 초대코드 기억 (localStorage 없으면 메모리) ───────────────── */

const STORE_KEY = 'fps-tower:lastInviteCode';
let memoryCode = '';

/** 마지막으로 만들거나 참가한 초대코드 */
export function loadLastCode() {
  try {
    const raw = globalThis.localStorage?.getItem?.(STORE_KEY);
    if (raw) return normalizeInviteCode(raw);
  } catch {
    /* 저장소 접근 불가 → 메모리 값 사용 */
  }
  return memoryCode;
}

/** 초대코드 저장(유효한 코드만) */
export function saveLastCode(code) {
  const c = normalizeInviteCode(code);
  if (c.length !== INVITE_CODE_LENGTH) return '';
  memoryCode = c;
  try {
    globalThis.localStorage?.setItem?.(STORE_KEY, c);
  } catch {
    /* 저장 실패는 무시(메모리에는 남는다) */
  }
  return c;
}

export const INVITE = Object.freeze({
  length: INVITE_CODE_LENGTH,
  alphabet: INVITE_ALPHABET,
  queryKey: INVITE_QUERY_KEY
});

export default {
  INVITE,
  normalizeInviteCode,
  isValidInviteCode,
  formatInviteCode,
  inviteLink,
  inviteMessage,
  codeFromUrl,
  hasInviteInUrl,
  isLoopbackHost,
  isLoopbackOrigin,
  resolveShareOrigin,
  loadLastCode,
  saveLastCode
};

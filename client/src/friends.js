// 친구 — 친구 코드 · 친구 목록 · 친구 서버 주소 (순수 로직, THREE·DOM 금지).
//
//  · 내 친구 코드: 이 PC 에 저장되는 8자리 코드(XXXX-XXXX). 남에게 알려 주면 친구가 나를 추가한다.
//  · 친구 추가: 친구 코드를 입력하면 목록에 담긴다(이름·접속 주소는 나중에 채울 수 있다).
//  · 친구 서버 들어가기: 친구의 접속 주소 + 방 코드로 `http://주소/?room=CODE` 를 연다.
//    (초대 링크와 같은 규칙 — utils/invite.js 의 INVITE_QUERY_KEY)
import { INVITE_QUERY_KEY, isValidInviteCode, normalizeInviteCode } from './utils/invite.js';

/** 친구 코드 길이(하이픈 제외) */
export const FRIEND_CODE_LENGTH = 8;
/** 헷갈리는 글자(0/O/1/I)를 뺀 알파벳 */
export const FRIEND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const CODE_KEY = 'fortress.friend.code.v1';
const LIST_KEY = 'fortress.friends.v1';

/** 입력에서 코드 글자만 뽑아 대문자로 만든다 */
export function normalizeFriendCode(input) {
  const raw = input == null ? '' : String(input);
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (FRIEND_ALPHABET.includes(ch)) out += ch;
    if (out.length >= FRIEND_CODE_LENGTH) break;
  }
  return out;
}

/** 정확히 8자리인가 */
export function isValidFriendCode(input) {
  return normalizeFriendCode(input).length === FRIEND_CODE_LENGTH;
}

/** 보기 좋은 표시 — 4자리-4자리 */
export function formatFriendCode(input) {
  const c = normalizeFriendCode(input);
  if (c.length !== FRIEND_CODE_LENGTH) return c;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/** 새 친구 코드 만들기 */
export function randomFriendCode(random = Math.random) {
  let out = '';
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++) {
    const r = typeof random === 'function' ? Number(random()) : Math.random();
    const idx = Math.min(FRIEND_ALPHABET.length - 1, Math.max(0, Math.floor((Number.isFinite(r) ? r : 0) * FRIEND_ALPHABET.length)));
    out += FRIEND_ALPHABET[idx];
  }
  return out;
}

/** 접속 주소를 http(s)://host:port 형태로 다듬는다(빈 값이면 '') */
export function normalizeAddress(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  let s = raw.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname) return '';
    const port = u.port ? `:${u.port}` : '';
    return `${u.protocol}//${u.hostname}${port}`;
  } catch {
    return '';
  }
}

/** 친구 서버 주소 — 주소와 방 코드가 모두 있어야 링크가 만들어진다 */
export function friendServerUrl(address, roomCode) {
  const origin = normalizeAddress(address);
  const code = normalizeInviteCode(roomCode);
  if (!origin || !isValidInviteCode(code)) return '';
  return `${origin}/?${INVITE_QUERY_KEY}=${code}`;
}

/**
 * 친구 목록 저장소.
 *  - 저장이 막힌 환경(테스트·프라이빗 모드)에서도 메모리로 동작한다.
 *  - 목록 항목: { code, name, address, room, online, at, addedAt }
 */
export class FriendSystem {
  constructor({ storage = safeStorage(), random = Math.random, now = () => Date.now() } = {}) {
    this.storage = storage;
    this.random = random;
    this.now = now;
    this._list = [];
    this.code = this._loadCode();
    this._load();
  }

  get displayCode() {
    return formatFriendCode(this.code);
  }

  /* ── 내 코드 ─────────────────────────────────────────────── */

  _loadCode() {
    try {
      const raw = this.storage?.getItem?.(CODE_KEY);
      const c = normalizeFriendCode(raw);
      if (c.length === FRIEND_CODE_LENGTH) return c;
    } catch { /* 저장소 없음 */ }
    const made = randomFriendCode(this.random);
    try {
      this.storage?.setItem?.(CODE_KEY, made);
    } catch { /* 저장 실패는 무시 — 이번 실행 동안만 쓰인다 */ }
    return made;
  }

  /** 내 코드 다시 만들기(친구 목록은 그대로) */
  rerollCode() {
    this.code = randomFriendCode(this.random);
    try {
      this.storage?.setItem?.(CODE_KEY, this.code);
    } catch { /* 무시 */ }
    return this.code;
  }

  /* ── 친구 목록 ───────────────────────────────────────────── */

  _load() {
    try {
      const raw = this.storage?.getItem?.(LIST_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) this._list = arr.map((f) => this._clean(f)).filter(Boolean);
    } catch {
      this._list = [];
    }
    return this._list;
  }

  _save() {
    try {
      this.storage?.setItem?.(LIST_KEY, JSON.stringify(this._list));
    } catch { /* 저장 실패는 무시 */ }
  }

  /** 목록 항목 정리(잘못된 값 방어) */
  _clean(f) {
    if (!f || typeof f !== 'object') return null;
    const code = normalizeFriendCode(f.code);
    if (code.length !== FRIEND_CODE_LENGTH) return null;
    return {
      code,
      name: String(f.name ?? '').slice(0, 16),
      address: normalizeAddress(f.address),
      room: normalizeInviteCode(f.room),
      online: Boolean(f.online),
      at: Number(f.at) || 0,
      addedAt: Number(f.addedAt) || 0
    };
  }

  /** 친구 목록(복사본) — 온라인·최근 접속 순 */
  list() {
    return this._list
      .slice()
      .sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || (b.at || 0) - (a.at || 0))
      .map((f) => ({ ...f, displayCode: formatFriendCode(f.code) }));
  }

  get(code) {
    const c = normalizeFriendCode(code);
    if (c.length !== FRIEND_CODE_LENGTH) return null;
    return this._list.find((f) => f.code === c) || null;
  }

  has(code) {
    return Boolean(this.get(code));
  }

  get size() {
    return this._list.length;
  }

  /** 친구 추가 — 내 코드는 추가할 수 없다 */
  add({ code = '', name = '', address = '' } = {}) {
    const c = normalizeFriendCode(code);
    if (c.length !== FRIEND_CODE_LENGTH) {
      return { ok: false, error: `친구 코드 ${FRIEND_CODE_LENGTH}자리를 입력하세요` };
    }
    if (c === this.code) return { ok: false, error: '내 친구 코드는 추가할 수 없습니다' };
    const existing = this.get(c);
    if (existing) {
      if (name) existing.name = String(name).slice(0, 16);
      if (address) existing.address = normalizeAddress(address);
      this._save();
      return { ok: true, friend: { ...existing }, updated: true };
    }
    const friend = {
      code: c,
      name: String(name ?? '').slice(0, 16),
      address: normalizeAddress(address),
      room: '',
      online: false,
      at: this.now(),
      addedAt: this.now()
    };
    this._list.push(friend);
    this._save();
    return { ok: true, friend: { ...friend }, updated: false };
  }

  remove(code) {
    const c = normalizeFriendCode(code);
    const before = this._list.length;
    this._list = this._list.filter((f) => f.code !== c);
    if (this._list.length !== before) this._save();
    return this._list.length !== before;
  }

  /** 친구 정보 갱신(온라인·방 코드·이름 등) */
  touch(code, patch = {}) {
    const f = this.get(code);
    if (!f) return null;
    if (patch.name != null && String(patch.name).trim()) f.name = String(patch.name).slice(0, 16);
    if (patch.address != null && String(patch.address).trim()) f.address = normalizeAddress(patch.address);
    if (patch.room != null) f.room = normalizeInviteCode(patch.room);
    if (patch.online != null) f.online = Boolean(patch.online);
    if (patch.at != null) f.at = Number(patch.at) || this.now();
    this._save();
    return { ...f };
  }

  /** 친구 서버 주소 — 없으면 '' */
  serverUrl(code) {
    const f = this.get(code);
    if (!f) return '';
    return friendServerUrl(f.address, f.room);
  }

  /** 목록 비우기 */
  clear() {
    this._list = [];
    this._save();
  }
}

/** localStorage 안전 접근 — 없으면 null(메모리 모드) */
function safeStorage() {
  try {
    const s = globalThis.localStorage;
    if (s && typeof s.getItem === 'function' && typeof s.setItem === 'function') return s;
  } catch { /* 접근 차단 */ }
  return null;
}

export default FriendSystem;

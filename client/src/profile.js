// profile.js — 플레이어 표시 이름(닉네임). 계정이 없어도 만들 수 있고 이 컴퓨터에 저장된다.
// 계약 §4.54: 표시 이름은 닉네임 > 캐릭터 이름 > 계정 닉네임 > 아이디 순으로 정한다.
export const NICKNAME_KEY = 'fortress.nickname.v1';
export const NICKNAME_MAX = 16;

/** 제어문자 제거 + 공백 정리 + 16자 제한 */
export function sanitizeNickname(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NICKNAME_MAX);
}

/** 1~16자면 유효 */
export function isValidNickname(raw) {
  const s = sanitizeNickname(raw);
  return s.length >= 1 && s.length <= NICKNAME_MAX;
}

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** localStorage 저장소(없으면 메모리로만 동작 — 헤드리스 안전) */
export function createNicknameStore({ storage = null } = {}) {
  const store = storage ?? defaultStorage();
  return {
    load() {
      try {
        return sanitizeNickname(store?.getItem?.(NICKNAME_KEY) ?? '');
      } catch {
        return '';
      }
    },
    save(name) {
      const safe = sanitizeNickname(name);
      try {
        if (safe) store?.setItem?.(NICKNAME_KEY, safe);
        else store?.removeItem?.(NICKNAME_KEY);
      } catch {
        /* 저장 실패는 무시(사생활 보호 모드) */
      }
      return safe;
    },
    clear() {
      try {
        store?.removeItem?.(NICKNAME_KEY);
      } catch {
        /* 무시 */
      }
    }
  };
}

const store = createNicknameStore();
let cached = null;
const listeners = new Set();

/** 사용자가 직접 만든 닉네임(없으면 빈 문자열) */
export function currentNickname() {
  if (cached === null) cached = store.load();
  return cached;
}

/** 닉네임 저장 — 로컬 저장 + 구독자 알림. 돌려주는 값은 살균된 값 */
export function setNickname(name, { persist = true } = {}) {
  cached = sanitizeNickname(name);
  if (persist) store.save(cached);
  for (const fn of [...listeners]) {
    try {
      fn(cached);
    } catch {
      /* 구독자 오류는 무시 */
    }
  }
  return cached;
}

/** 변경 구독 — 해제 함수를 돌려준다 */
export function onNicknameChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 표시 이름 결정 — 닉네임 > 계정 닉네임 > 아이디 > fallback */
export function nicknameFor(user = null, { fallback = '수호자' } = {}) {
  const own = currentNickname();
  if (own) return own;
  const account = sanitizeNickname(user?.nickname) || sanitizeNickname(user?.username);
  return account || sanitizeNickname(fallback) || '수호자';
}

/** 무결성 검사 — 스모크 테스트가 호출 */
export function validateProfileData() {
  const errors = [];
  if (sanitizeNickname('가'.repeat(40)).length !== NICKNAME_MAX) errors.push('닉네임이 16자로 잘리지 않는다');
  if (sanitizeNickname('  홍   길동 ') !== '홍 길동') errors.push('공백 정리가 안 된다');
  if (sanitizeNickname('a\u0000b') !== 'ab') errors.push('제어문자가 남는다');
  if (isValidNickname('   ')) errors.push('공백만 있는 닉네임이 통과했다');
  if (!isValidNickname('수호자')) errors.push('정상 닉네임이 거부됐다');
  const mem = createNicknameStore({ storage: null });
  if (mem.save('가디언') !== '가디언') errors.push('저장 값이 살균되지 않았다');
  if (mem.load() !== '') errors.push('storage 가 없는데 값이 남았다');
  return errors;
}

export default { NICKNAME_MAX, sanitizeNickname, isValidNickname, currentNickname, setNickname, nicknameFor, createNicknameStore };

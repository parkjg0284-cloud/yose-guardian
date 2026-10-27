// keys.js — 플레이어가 직접 바꿀 수 있는 키 설정(계약 §4.55).
//  · 기본값은 기존 하드코딩과 100% 같다 — 바꾸지 않으면 체감 차이가 없다.
//  · ESC 는 항상 고정(패널/콘솔 닫기)이라 목록에 넣지 않는다.
//  · 설정 패널에서 키를 누르면 즉시 반영된다(게임 재시작 불필요).
export const KEYS_KEY = 'fortress.keys.v1';

/** 사용자가 바꿀 수 있는 동작 목록. def 의 첫 번째가 대표 키다. */
export const KEY_ACTIONS = [
  { id: 'forward', label: '앞으로', group: '이동', def: ['KeyW', 'ArrowUp'] },
  { id: 'back', label: '뒤로', group: '이동', def: ['KeyS', 'ArrowDown'] },
  { id: 'left', label: '왼쪽', group: '이동', def: ['KeyA', 'ArrowLeft'] },
  { id: 'right', label: '오른쪽', group: '이동', def: ['KeyD', 'ArrowRight'] },
  { id: 'jump', label: '점프 · 비행 상승', group: '이동', def: ['Space'] },
  { id: 'sprint', label: '달리기 · 비행 강하 (누르는 동안)', group: '이동', def: ['ShiftLeft', 'ShiftRight'] },
  { id: 'sit', label: '앉기 (누르는 동안)', group: '이동', def: ['ControlLeft', 'ControlRight'] },
  { id: 'ultimate', label: '무기 궁극기 · 건물 회전(누르는 동안)', group: '전투', def: ['KeyR'] },
  { id: 'swapWeapon', label: '무기 교체', group: '전투', def: ['KeyQ'] },
  { id: 'rotate', label: '건물 45° 회전 (달리기 키와 함께 = 반대 방향)', group: '전투', def: ['KeyX'] },
  { id: 'demolish', label: '철거 모드 (좌클릭으로 건물 철거 · 재료 25% 환불)', group: '전투', def: ['KeyZ'] },
  { id: 'inventory', label: '인벤토리', group: '창', def: ['KeyI'] },
  { id: 'craft', label: '제작', group: '창', def: ['KeyC'] },
  { id: 'weapons', label: '무기', group: '창', def: ['Tab'] },
  { id: 'classes', label: '직업', group: '창', def: ['KeyK'] },
  { id: 'seeds', label: '씨앗', group: '창', def: ['KeyG'] },
  { id: 'achievements', label: '업적 (앉기 키와 함께 = 도감)', group: '창', def: ['KeyJ'] },
  { id: 'multiplayer', label: '멀티플레이', group: '창', def: ['KeyT'] },
  { id: 'friends', label: '친구', group: '창', def: ['KeyU'] },
  { id: 'map', label: '미니맵 켜기/끄기', group: '창', def: ['KeyM'] },
  { id: 'build', label: '건설 모드', group: '창', def: ['KeyB'] },
  { id: 'recipes', label: '조합법(레시피) 목록', group: '창', def: ['KeyP'] },
  { id: 'arcana', label: '마법연성', group: '창', def: ['KeyY'] },
    { id: 'travel', label: '지형 이동(포탈)', group: '기타', def: ['KeyN'] },
  { id: 'interact', label: '상호작용 (수거 · 마법부여)', group: '기타', def: ['KeyE'] },
  { id: 'water', label: '지하수 추출 (물탱크 필요)', group: '기타', def: ['KeyL'] },
  { id: 'preset', label: '프리셋 전환', group: '기타', def: ['KeyF'] },
  { id: 'wings', label: '날개 토글', group: '기타', def: ['KeyV'] },
  { id: 'camera', label: '시점 전환 (1인칭 ↔ 3인칭) — 설정에서 변경', group: '기타', def: ['KeyH'] },
  { id: 'fullscreen', label: '전체 화면 ↔ 창 모드', group: '기타', def: ['KeyO'] },
  // 관리자 전용 — 관리자 아이디로 로그인했을 때만 열린다(일반 계정은 무시).
  { id: 'admin', label: '관리자 콘솔', group: '기타', def: ['Backquote', 'Slash'] },
];

export const KEY_ACTION_BY_ID = Object.fromEntries(KEY_ACTIONS.map((a) => [a.id, a]));

/** 설정 화면용 그룹 목록(정의 순서 유지) */
export const KEY_GROUPS = (() => {
  const order = [];
  const byName = new Map();
  for (const action of KEY_ACTIONS) {
    if (!byName.has(action.group)) {
      byName.set(action.group, { name: action.group, actions: [] });
      order.push(action.group);
    }
    byName.get(action.group).actions.push(action);
  }
  return order.map((name) => byName.get(name));
})();

const LABELS = {
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'ESC',
  Backquote: '`',
  Slash: '/',
  Backslash: '\\',
  ShiftLeft: 'Shift(좌)',
  ShiftRight: 'Shift(우)',
  ControlLeft: 'Ctrl(좌)',
  ControlRight: 'Ctrl(우)',
  AltLeft: 'Alt(좌)',
  AltRight: 'Alt(우)',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Enter: 'Enter',
  CapsLock: 'CapsLock'
};

/** 코드 → 사람이 읽는 이름 (KeyW → W) */
export function keyLabel(code) {
  const c = String(code ?? '');
  if (!c) return '(없음)';
  if (LABELS[c]) return LABELS[c];
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  if (c.startsWith('Numpad')) return 'Num ' + c.slice(6);
  if (/^F\d{1,2}$/.test(c)) return c;
  return c;
}

function defaultMap() {
  const out = {};
  for (const action of KEY_ACTIONS) out[action.id] = [...action.def];
  return out;
}

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

let map = null;
const listeners = new Set();

function readStored() {
  const store = defaultStorage();
  try {
    const raw = store?.getItem?.(KEYS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function persist() {
  const store = defaultStorage();
  try {
    store?.setItem?.(KEYS_KEY, JSON.stringify(map));
  } catch {
    /* 저장 실패는 무시(사생활 보호 모드) */
  }
}

/** 저장된 설정을 불러 map 을 만든다(잘못된 값은 기본값으로 되돌린다) */
export function loadKeys() {
  const base = defaultMap();
  const stored = readStored();
  if (stored) {
    for (const action of KEY_ACTIONS) {
      const list = stored[action.id];
      if (Array.isArray(list) && list.length && list.every((c) => typeof c === 'string' && c)) {
        base[action.id] = [...new Set(list)];
      }
    }
  }
  map = base;
  return map;
}

function ensure() {
  if (!map) loadKeys();
  return map;
}

/** 동작에 묶인 키 코드 목록 */
export function keyCodes(action) {
  const m = ensure();
  return m[action] ? [...m[action]] : [];
}

/** 대표 키 하나(설정 화면 표시용) */
export function primaryKey(action) {
  return keyCodes(action)[0] ?? '';
}

function notify() {
  for (const fn of [...listeners]) {
    try {
      fn(map);
    } catch {
      /* 구독자 오류는 무시 */
    }
  }
}

/**
 * 키 변경 — 같은 키를 쓰는 다른 동작이 있으면 거절한다.
 * @returns {{ ok: boolean, error?: string, keys?: string[] }}
 */
export function setKey(action, code, { persist: save = true } = {}) {
  const target = KEY_ACTION_BY_ID[action];
  if (!target) return { ok: false, error: '알 수 없는 동작입니다' };
  const next = String(code ?? '');
  if (!next) return { ok: false, error: '키를 인식하지 못했습니다' };
  if (next === 'Escape') return { ok: false, error: 'ESC 는 고정 키입니다 — 다른 키를 눌러 주세요' };
  const m = ensure();
  const swapped = [];
  for (const other of KEY_ACTIONS) {
    if (other.id === action) continue;
    const cur = m[other.id] || [];
    if (!cur.includes(next)) continue;
    // 두 동작의 기본값에 함께 들어 있는 별칭(예: ArrowUp)은 그대로 둔다.
    if ((other.def || []).includes(next) && (target.def || []).includes(next)) continue;
    // 이미 쓰는 키를 고르면 서로 바꾼다 — 상대는 내가 쓰던 키를 받는다.
    const prev = (m[action] || [])[0] || (target.def || [])[0] || '';
    const rest = cur.filter((code) => code !== next);
    m[other.id] = rest.length ? rest : (prev && prev !== next ? [prev] : [...(other.def || [])]);
    swapped.push(other.label);
  }
  m[action] = [next];
  if (save) persist();
  notify();
  return { ok: true, keys: [next], swapped };
}

/** 한 동작을 기본값으로 */
export function resetKey(action, { persist: save = true } = {}) {
  const target = KEY_ACTION_BY_ID[action];
  if (!target) return { ok: false, error: '알 수 없는 동작입니다' };
  ensure()[action] = [...target.def];
  if (save) persist();
  notify();
  return { ok: true, keys: [...target.def] };
}

/** 전부 기본값으로 */
export function resetAllKeys({ persist: save = true } = {}) {
  map = defaultMap();
  if (save) persist();
  notify();
  return { ok: true };
}

/** 변경 구독 — 해제 함수를 돌려준다 */
export function subscribeKeys(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 지금 눌려 있는가(누르는 동안 유지되는 동작) */
export function isDown(input, action) {
  for (const code of keyCodes(action)) {
    if (input?.isDown?.(code)) return true;
  }
  return false;
}

/** 이번 프레임에 눌렸는가(한 번만 소비) */
export function consume(input, action) {
  for (const code of keyCodes(action)) {
    if (input?.consumePressed?.(code)) return true;
  }
  return false;
}

/** 무결성 검사 — 스모크/버그 테스트가 호출 */
export function validateKeyData() {
  const errors = [];
  const def = defaultMap();
  for (const action of KEY_ACTIONS) {
    if (!Array.isArray(action.def) || !action.def.length) errors.push(action.id + ': 기본 키가 없다');
    if (!action.label || !action.group) errors.push(action.id + ': 라벨/그룹이 없다');
    if ((def[action.id] || []).length !== (action.def || []).length) errors.push(action.id + ': 기본값 복사 실패');
  }
  if (new Set(KEY_ACTIONS.map((a) => a.id)).size !== KEY_ACTIONS.length) errors.push('동작 id 중복');
  if (keyLabel('KeyW') !== 'W' || keyLabel('Space') !== 'Space' || keyLabel('Digit3') !== '3') errors.push('키 이름 변환 오류');

  resetAllKeys({ persist: false });
  if (setKey('jump', 'Escape', { persist: false }).ok) errors.push('ESC 가 변경됐다');
  if (!setKey('jump', 'KeyJ', { persist: false }).ok) errors.push('키 변경 실패');
  if (primaryKey('jump') !== 'KeyJ') errors.push('변경한 키가 반영되지 않았다');
  // 겹치는 키를 고르면 오류 대신 서로 교환한다 — 두 동작이 같은 키를 쓰면 안 된다.
  const swapRes = setKey('craft', 'KeyJ', { persist: false });
  if (!swapRes.ok) errors.push('키 교환 실패');
  if (primaryKey('craft') !== 'KeyJ') errors.push('교환한 키가 반영되지 않았다');
  if (primaryKey('jump') === 'KeyJ') errors.push('교환 후에도 점프 키가 겹친다');
  if ((keyCodes('jump') || []).includes('KeyJ')) errors.push('교환 후 점프 키 목록이 남았다');
  if (!resetKey('jump', { persist: false }).ok || primaryKey('jump') !== 'Space') errors.push('기본값 복원 실패');
  const fake = {
    down: new Set(['KeyJ']),
    isDown(code) {
      return this.down.has(code);
    },
    consumePressed(code) {
      const has = this.down.has(code);
      this.down.delete(code);
      return has;
    }
  };
  setKey('jump', 'KeyJ', { persist: false });
  if (!isDown(fake, 'jump') || !consume(fake, 'jump') || consume(fake, 'jump')) errors.push('입력 조회/소비 오류');
  resetAllKeys({ persist: false });
  return errors;
}

export default {
  KEYS_KEY,
  KEY_ACTIONS,
  KEY_GROUPS,
  keyCodes,
  keyLabel,
  primaryKey,
  setKey,
  resetKey,
  resetAllKeys,
  isDown,
  consume,
  loadKeys
};

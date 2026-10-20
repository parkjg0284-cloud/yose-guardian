// 멀티플레이 캐릭터 — 이름 + 외형(스킨). 순수 로직(THREE·DOM 비의존).
// 계약 §4.35: 캐릭터 생성·저장·전송(방 만들기/참가) · 서버는 외형을 살균해 스냅샷에 실어 보낸다.
export const CHARACTER_NAME_MAX = 16;
export const CHARACTER_STORAGE_KEY = 'fortress.character.v1';

/** 외형 8종 — 능력치 차이는 없다(순수 코스메틱: 공정성 유지) */
export const CHARACTER_SKINS = [
  { id: 'guardian', name: '수호자', icon: '🛡️', color: 0x5b8dd6, accent: 0x9dc0ff, desc: '푸른 갑주 — 요새의 기본' },
  { id: 'knight', name: '기사', icon: '⚔️', color: 0xc9ccd6, accent: 0xffffff, desc: '은빛 판금 — 묵직한 인상' },
  { id: 'mage', name: '마법사', icon: '🧙', color: 0x9f7bff, accent: 0xd9c2ff, desc: '보랏빛 로브 — 마력이 감돈다' },
  { id: 'archer', name: '궁수', icon: '🏹', color: 0x6fbf73, accent: 0xccf0cd, desc: '초록 망토 — 숲의 추적자' },
  { id: 'rogue', name: '도적', icon: '🗡️', color: 0x4a4f63, accent: 0x8f9bb3, desc: '먹색 두건 — 그림자 걸음' },
  { id: 'alchemist', name: '연금술사', icon: '⚗️', color: 0x66d9d0, accent: 0xd0fffb, desc: '청록 실험복 — 플라스크를 든 손' },
  { id: 'bard', name: '음유시인', icon: '🎻', color: 0xffb066, accent: 0xffe3c2, desc: '주황 망토 — 노래로 사기를 올린다' },
  { id: 'fairy_friend', name: '요정 친구', icon: '🧚', color: 0xff9fd2, accent: 0xffe0f0, desc: '분홍 날개 — 요정과 친하다' }
];

export const CHARACTER_SKIN_BY_ID = Object.fromEntries(CHARACTER_SKINS.map((s) => [s.id, s]));
export const CHARACTER_SKIN_COUNT = CHARACTER_SKINS.length;
export const DEFAULT_CHARACTER = Object.freeze({ name: '', skin: 'guardian' });
export const DEFAULT_SKIN_ID = DEFAULT_CHARACTER.skin;

/** 이름 살균 — 공백 정리 + 16자 제한 */
export function sanitizeCharacterName(name) {
  return String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHARACTER_NAME_MAX);
}

/**
 * 외형 조회 — 프로토타입 체인(`__proto__`·`constructor`)을 타지 않도록 소유 키만 인정한다.
 */
export function characterSkin(id) {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(CHARACTER_SKIN_BY_ID, id)) return null;
  const skin = CHARACTER_SKIN_BY_ID[id];
  return skin && typeof skin === 'object' ? skin : null;
}

/** 어떤 입력이 와도 유효한 캐릭터로 만든다(손상 세이브·서버 페이로드 내성) */
export function sanitizeCharacter(raw, fallbackName = '') {
  const src = raw && typeof raw === 'object' ? raw : {};
  const name = sanitizeCharacterName(src.name) || sanitizeCharacterName(fallbackName) || '';
  const skin = characterSkin(src.skin) ? String(src.skin) : DEFAULT_SKIN_ID;
  return { name, skin };
}

export function characterColors(character) {
  const skin = characterSkin(character?.skin) ?? CHARACTER_SKIN_BY_ID[DEFAULT_SKIN_ID];
  return { color: skin.color, accent: skin.accent };
}

export function characterLabel(character, fallbackName = '') {
  const safe = sanitizeCharacter(character, fallbackName);
  const skin = characterSkin(safe.skin) ?? CHARACTER_SKIN_BY_ID[DEFAULT_SKIN_ID];
  return `${skin.icon} ${safe.name || '이름 없음'} · ${skin.name}`;
}

/** 서버로 보내는 페이로드 — 이름·스킨·아이콘·색(서버가 다시 살균한다) */
export function characterPayload(character, fallbackName = '') {
  const safe = sanitizeCharacter(character, fallbackName);
  const skin = characterSkin(safe.skin) ?? CHARACTER_SKIN_BY_ID[DEFAULT_SKIN_ID];
  const cols = characterColors(safe);
  return {
    name: safe.name || sanitizeCharacterName(fallbackName) || '수호자',
    skin: safe.skin,
    icon: skin.icon,
    color: cols.color,
    accent: cols.accent
  };
}

/** 서버(Room)와 같은 규칙의 살균 — 스냅샷에 실려 오는 값을 그릴 때 쓴다 */
export function sanitizeRemoteCharacter(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const skin = characterSkin(src.skin) ? String(src.skin) : DEFAULT_SKIN_ID;
  const fallback = CHARACTER_SKIN_BY_ID[skin];
  const hex = (v, alt) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 0xffffff) return alt;
    return Math.round(n);
  };
  return {
    skin,
    icon: typeof src.icon === 'string' && src.icon.trim() ? src.icon.trim().slice(0, 4) : fallback.icon,
    color: hex(src.color, fallback.color),
    accent: hex(src.accent, fallback.accent)
  };
}

/** localStorage 저장소(없으면 메모리로만 동작 — 헤드리스 안전) */
export function createCharacterStore({ storage = null } = {}) {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  return {
    load(fallbackName = '') {
      try {
        const raw = store?.getItem?.(CHARACTER_STORAGE_KEY);
        return sanitizeCharacter(raw ? JSON.parse(raw) : null, fallbackName);
      } catch {
        return sanitizeCharacter(null, fallbackName);
      }
    },
    save(character, fallbackName = '') {
      const safe = sanitizeCharacter(character, fallbackName);
      try {
        store?.setItem?.(CHARACTER_STORAGE_KEY, JSON.stringify(safe));
      } catch {
        /* 저장 실패는 무시(사생활 보호 모드) */
      }
      return safe;
    },
    clear() {
      try {
        store?.removeItem?.(CHARACTER_STORAGE_KEY);
      } catch {
        /* 무시 */
      }
    }
  };
}

/** 데이터 무결성 — 스모크 테스트가 호출 */
export function validateCharacterData() {
  const errors = [];
  if (CHARACTER_SKINS.length !== 8) errors.push(`외형이 8종이 아니다(${CHARACTER_SKINS.length})`);
  const ids = new Set();
  for (const s of CHARACTER_SKINS) {
    if (!s.id || ids.has(s.id)) errors.push(`${s.id}: id 누락/중복`);
    ids.add(s.id);
    if (!s.name || !s.icon) errors.push(`${s.id}: 이름/아이콘 누락`);
    for (const k of ['color', 'accent']) {
      const n = Number(s[k]);
      if (!Number.isFinite(n) || n < 0 || n > 0xffffff) errors.push(`${s.id}: ${k} 값 이상(${s[k]})`);
    }
  }
  if (!characterSkin(DEFAULT_SKIN_ID)) errors.push('기본 외형이 목록에 없다');
  const long = sanitizeCharacterName('가'.repeat(40));
  if (long.length !== CHARACTER_NAME_MAX) errors.push(`이름이 ${CHARACTER_NAME_MAX}자로 잘리지 않는다(${long.length})`);
  const broken = sanitizeCharacter({ name: '  홍   길동 ', skin: 'nope' });
  if (broken.skin !== DEFAULT_SKIN_ID) errors.push('모르는 외형이 기본값으로 대체되지 않는다');
  if (broken.name !== '홍 길동') errors.push(`공백 정리 실패(${JSON.stringify(broken.name)})`);
  // 프로토타입 오염 시도 — `__proto__`/`constructor` 는 외형이 아니다.
  for (const evil of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']) {
    if (characterSkin(evil) !== null) errors.push(`${evil} 이 외형으로 통과했다`);
    if (sanitizeCharacter({ skin: evil }).skin !== DEFAULT_SKIN_ID) errors.push(`${evil} 이 기본값으로 대체되지 않았다`);
  }
  const evilPayload = characterPayload({ name: 'x', skin: '__proto__' });
  if (!Number.isFinite(evilPayload.color) || !Number.isFinite(evilPayload.accent)) errors.push('오염 입력에서 색이 유한하지 않다');
  return errors;
}

export default {
  CHARACTER_SKINS,
  DEFAULT_CHARACTER,
  sanitizeCharacter,
  characterColors,
  characterLabel,
  characterPayload,
  createCharacterStore,
  validateCharacterData
};

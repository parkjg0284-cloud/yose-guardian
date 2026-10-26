// 조준선(크로스헤어) 설정 — 순수 로직 + DOM 적용.
//
// HUD 의 #crosshair 는 상태 클래스(is-aiming/is-casting/is-hit)만 토글하고,
// 모양·색·크기는 여기서 data-crosshair + CSS 변수로 바꾼다.
// 설정 패널과 HUD 가 같은 normalize/load/save/apply 를 사용한다.

export const CROSSHAIR_KEY = 'fortress.crosshair.v1';
export const CROSSHAIR_SIZE_MIN = 0.7;
export const CROSSHAIR_SIZE_MAX = 1.8;
export const CROSSHAIR_SIZE_STEP = 0.05;

/** 모양 프리셋 — CSS 의 [data-crosshair="..."] 규칙과 1:1 대응. */
export const CROSSHAIR_STYLES = [
  { id: 'classic', name: '십자', glyph: '✚', desc: '기본 십자 조준선' },
  { id: 'dot', name: '점', glyph: '•', desc: '가운데 점만 — 시야가 깔끔하다' },
  { id: 'circle', name: '원', glyph: '◯', desc: '동그라미 — 둥근 조준' },
  { id: 'x', name: '엑스', glyph: '✕', desc: '대각선 엑스' },
  { id: 't', name: 'T자', glyph: 'T', desc: '위쪽 가로선 + 세로선' },
  { id: 'twin', name: '쌍선', glyph: '❙❙', desc: '양옆 두 줄 — 점 없음' }
];

/** 색 프리셋 — hex 는 CSS 변수, glow 는 그림자. */
export const CROSSHAIR_COLORS = [
  { id: 'gold', name: '금빛', hex: '#f0c469', glow: 'rgba(240, 196, 105, 0.55)' },
  { id: 'white', name: '백색', hex: '#eef2ff', glow: 'rgba(238, 242, 255, 0.55)' },
  { id: 'violet', name: '보라', hex: '#b58cff', glow: 'rgba(181, 140, 255, 0.6)' },
  { id: 'green', name: '초록', hex: '#7dffb0', glow: 'rgba(125, 255, 176, 0.55)' },
  { id: 'red', name: '적색', hex: '#ff6b6b', glow: 'rgba(255, 107, 107, 0.55)' },
  { id: 'cyan', name: '하늘', hex: '#7fe6ff', glow: 'rgba(127, 230, 255, 0.55)' }
];

export const DEFAULT_CROSSHAIR = Object.freeze({ style: 'classic', color: 'gold', size: 1 });

const STYLE_BY_ID = new Map(CROSSHAIR_STYLES.map((s) => [s.id, s]));
const COLOR_BY_ID = new Map(CROSSHAIR_COLORS.map((c) => [c.id, c]));

export function crosshairStyleById(id) {
  return STYLE_BY_ID.get(String(id ?? '')) || STYLE_BY_ID.get(DEFAULT_CROSSHAIR.style);
}

export function crosshairColorById(id) {
  return COLOR_BY_ID.get(String(id ?? '')) || COLOR_BY_ID.get(DEFAULT_CROSSHAIR.color);
}

/** 크기 — 0.7~1.8, 0.05 단위. 잘못된 값은 기본 1. */
export function clampCrosshairSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_CROSSHAIR.size;
  const stepped = Math.round(n / CROSSHAIR_SIZE_STEP) * CROSSHAIR_SIZE_STEP;
  return Math.min(CROSSHAIR_SIZE_MAX, Math.max(CROSSHAIR_SIZE_MIN, Number(stepped.toFixed(2))));
}

/** 어떤 입력이든 안전한 설정으로 정규화한다(로컬 저장·이전 버전 호환). */
export function normalizeCrosshair(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CROSSHAIR };
  return {
    style: crosshairStyleById(raw.style).id,
    color: crosshairColorById(raw.color).id,
    size: clampCrosshairSize(raw.size)
  };
}

function storageOf(storage) {
  if (storage) return storage;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** 저장된 설정(없거나 깨졌으면 기본값). */
export function loadCrosshair(storage = null) {
  const s = storageOf(storage);
  if (!s) return { ...DEFAULT_CROSSHAIR };
  try {
    const raw = s.getItem(CROSSHAIR_KEY);
    if (!raw) return { ...DEFAULT_CROSSHAIR };
    return normalizeCrosshair(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CROSSHAIR };
  }
}

/** 정규화해 저장하고, 저장된 값을 돌려준다(저장 실패해도 설정은 적용). */
export function saveCrosshair(prefs, storage = null) {
  const next = normalizeCrosshair(prefs);
  const s = storageOf(storage);
  try {
    s?.setItem?.(CROSSHAIR_KEY, JSON.stringify(next));
  } catch {
    /* 저장 실패(사생활 모드 등) — 이번 세션에는 적용한다. */
  }
  return next;
}

/**
 * #crosshair 요소에 설정을 적용한다.
 * - dataset.crosshair : 모양(CSS 선택자)
 * - --ch-color/--ch-glow : 색
 * - --ch-size : 크기(모든 치수가 calc 로 따라간다)
 */
export function applyCrosshair(el, prefs) {
  const next = normalizeCrosshair(prefs);
  if (!el) return next;
  const color = crosshairColorById(next.color);
  el.dataset.crosshair = next.style;
  el.style.setProperty('--ch-color', color.hex);
  el.style.setProperty('--ch-glow', color.glow);
  el.style.setProperty('--ch-size', next.size.toFixed(2));
  el.setAttribute('aria-label', `조준선 — ${crosshairStyleById(next.style).name} · ${color.name} · ${Math.round(next.size * 100)}%`);
  return next;
}

export default {
  CROSSHAIR_KEY,
  CROSSHAIR_STYLES,
  CROSSHAIR_COLORS,
  DEFAULT_CROSSHAIR,
  clampCrosshairSize,
  normalizeCrosshair,
  loadCrosshair,
  saveCrosshair,
  applyCrosshair,
  crosshairStyleById,
  crosshairColorById
};

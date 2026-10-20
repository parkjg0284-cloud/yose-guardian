// progress.js — 이 컴퓨터(계정) 단위 진행·해금 저장(계약 §4.58).
//  · 웨이브 100 을 클리어하면 무한 모드가 열린다.
//  · 세이브 슬롯과 무관하게 남는 전역 기록이다(최고 웨이브 · 셀레스티얼 처치 수).
export const PROGRESS_KEY = 'fortress.progress.v1';
export const ENDLESS_UNLOCK_WAVE = 100;

function defaultProgress() {
  return { endlessUnlocked: false, bestWave: 0, celestialKills: 0, endlessCleared: 0 };
}

function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

let cached = null;
const listeners = new Set();

function readStored() {
  try {
    const raw = defaultStorage()?.getItem?.(PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function sanitize(raw) {
  const base = defaultProgress();
  if (!raw || typeof raw !== 'object') return base;
  return {
    endlessUnlocked: raw.endlessUnlocked === true,
    bestWave: Math.max(0, Math.floor(Number(raw.bestWave) || 0)),
    celestialKills: Math.max(0, Math.floor(Number(raw.celestialKills) || 0)),
    endlessCleared: Math.max(0, Math.floor(Number(raw.endlessCleared) || 0))
  };
}

/** 진행 상태(캐시) */
export function loadProgress() {
  if (!cached) cached = sanitize(readStored());
  return cached;
}

function persist() {
  try {
    defaultStorage()?.setItem?.(PROGRESS_KEY, JSON.stringify(cached));
  } catch {
    /* 저장 실패는 무시(사생활 보호 모드) */
  }
}

function notify() {
  for (const fn of [...listeners]) {
    try {
      fn(cached);
    } catch {
      /* 구독자 오류는 무시 */
    }
  }
}

/** 일부 값 갱신 + 저장 */
export function saveProgress(patch = {}, { persist: save = true } = {}) {
  cached = sanitize({ ...loadProgress(), ...patch });
  if (save) persist();
  notify();
  return cached;
}

/** 무한 모드가 열렸는가 */
export function isEndlessUnlocked() {
  return loadProgress().endlessUnlocked === true;
}

/**
 * 무한 모드 해금 — 처음 열었는지(first)를 돌려준다.
 * @returns {{ unlocked: boolean, first: boolean, bestWave: number }}
 */
export function unlockEndless({ wave = ENDLESS_UNLOCK_WAVE, persist: save = true } = {}) {
  const before = loadProgress();
  const first = before.endlessUnlocked !== true;
  const next = saveProgress(
    { endlessUnlocked: true, bestWave: Math.max(before.bestWave, Math.floor(Number(wave) || 0)) },
    { persist: save }
  );
  return { unlocked: true, first, bestWave: next.bestWave };
}

/** 웨이브 도달 기록(최고 기록만 갱신) */
export function recordWave(wave, { persist: save = true } = {}) {
  const w = Math.max(0, Math.floor(Number(wave) || 0));
  if (w <= loadProgress().bestWave) return loadProgress();
  return saveProgress({ bestWave: w }, { persist: save });
}

/** 셀레스티얼 처치 기록 */
export function recordCelestialKill({ persist: save = true } = {}) {
  const p = loadProgress();
  const patch = { celestialKills: p.celestialKills + 1 };
  if (p.endlessCleared < 0) patch.endlessCleared = 0;
  return saveProgress(patch, { persist: save });
}

/** 진행 구독 */
export function subscribeProgress(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 설정/메뉴에 보여 줄 한 줄 요약 */
export function progressSummary() {
  const p = loadProgress();
  return `${p.endlessUnlocked ? '무한 모드 해금 ✔' : `무한 모드 잠김 — 웨이브 ${ENDLESS_UNLOCK_WAVE} 클리어`} · 최고 웨이브 ${p.bestWave} · 셀레스티얼 ${p.celestialKills}회`;
}

/** 무결성 검사 — 스모크 테스트가 호출(저장은 하지 않는다) */
export function validateProgressData() {
  const errors = [];
  const before = { ...loadProgress() };
  const fresh = sanitize(null);
  if (fresh.endlessUnlocked !== false || fresh.bestWave !== 0) errors.push('기본값이 잘못됐다');
  if (sanitize({ endlessUnlocked: 'yes', bestWave: -5 }).endlessUnlocked !== false) errors.push('잘못된 값이 통과했다');
  if (sanitize({ bestWave: 12.7 }).bestWave !== 12) errors.push('최고 웨이브 정수 변환 실패');
  // 저장 없이 동작만 확인한다.
  const first = unlockEndless({ wave: ENDLESS_UNLOCK_WAVE, persist: false });
  if (!first.unlocked || first.first !== !before.endlessUnlocked) errors.push('해금 동작 오류');
  const again = unlockEndless({ wave: ENDLESS_UNLOCK_WAVE, persist: false });
  if (again.first) errors.push('두 번째 해금이 first 로 보고됐다');
  if (!isEndlessUnlocked()) errors.push('해금 후에도 잠김으로 보인다');
  const recorded = recordWave(37, { persist: false });
  if (recorded.bestWave < 37) errors.push('웨이브 기록 실패');
  if (recordWave(5, { persist: false }).bestWave !== recorded.bestWave) errors.push('낮은 웨이브가 기록을 덮었다');
  if (typeof progressSummary() !== 'string' || !progressSummary().includes('무한 모드')) errors.push('요약 문구 오류');
  cached = before; // 검사 전 상태로 복구
  return errors;
}

export default {
  PROGRESS_KEY,
  ENDLESS_UNLOCK_WAVE,
  loadProgress,
  saveProgress,
  isEndlessUnlocked,
  unlockEndless,
  recordWave,
  recordCelestialKill,
  subscribeProgress,
  progressSummary,
  validateProgressData
};

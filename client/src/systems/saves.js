// 계약 §4.49 — 내 세이브 목록(로컬 슬롯).
// 저장할 때마다 최근 MAX_SAVES 개를 남겨 두고, 목록에서 골라 그 시점으로 되돌린다.
export const SAVES_KEY = 'fortress.saves.v1';
export const MAX_SAVES = 10;

function store() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function read() {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(SAVES_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((e) => e && typeof e === 'object' && e.id && e.data && typeof e.data === 'object');
  } catch {
    return [];
  }
}

function write(list) {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(SAVES_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** 저장 시각 → 'YYYY-MM-DD HH:MM'. */
export function saveLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '알 수 없음';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 저장 데이터 → 목록에 보여 줄 요약. */
export function summarize(data) {
  const savedAt = String(data?.savedAt ?? '');
  const playTime = Number(data?.playTime) || 0;
  return {
    id: savedAt,
    savedAt,
    label: saveLabel(savedAt),
    seed: data?.seed ?? '',
    mode: data?.mode ?? 'solo',
    difficulty: data?.difficulty ?? 'normal',
    wave: Number(data?.waves?.wave) || 1,
    gold: Number(data?.economy?.gold) || 0,
    playTime,
    play: `${Math.floor(playTime / 60)}분`,
    weapons: Array.isArray(data?.weaponsOwned) ? data.weaponsOwned.length : 0
  };
}

/** 저장 한 건을 목록 맨 앞에 넣는다(같은 시각이면 교체). 실패하면 null. */
export function pushSave(data, { max = MAX_SAVES } = {}) {
  if (!data || typeof data !== 'object' || !data.savedAt) return null;
  const id = String(data.savedAt);
  const list = read().filter((e) => e.id !== id);
  list.unshift({ id, savedAt: id, data });
  if (!write(list.slice(0, Math.max(1, max)))) return null;
  return summarize(data);
}

/** 목록(요약, 최신 순). */
export function listSaves() {
  return read().map((e) => summarize(e.data));
}

/** 고른 세이브의 전체 데이터. */
export function getSave(id) {
  const key = String(id ?? '');
  return read().find((e) => e.id === key)?.data ?? null;
}

/** 고른 세이브 삭제. */
export function removeSave(id) {
  const key = String(id ?? '');
  const list = read();
  const next = list.filter((e) => e.id !== key);
  if (next.length === list.length) return false;
  return write(next);
}

/** 전부 삭제. */
export function clearSaves() {
  const s = store();
  if (!s) return false;
  try {
    s.removeItem(SAVES_KEY);
    return true;
  } catch {
    return false;
  }
}

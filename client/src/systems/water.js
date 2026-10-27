// 물 시스템 — 지하수 추출 기능과 물탱크 용량. THREE/DOM 비의존(헤드리스 테스트 대상).
// · 물은 골드/목재/광물과 달리 **물탱크 용량**까지만 저장된다.
// · 추출은 건물이 아니라 플레이어 기능(L 키)이다 — 탱크가 없으면 저장할 곳이 없어 실패한다.
// · 탱크는 전기를 쓰지 않는다(수동 저장 시설).

/** 물 관련 상수(계약 §4.88) */
export const WATER = Object.freeze({
  tankKind: 'water_tank',
  extractAmount: 20, // 1회 추출량(L)
  cooldownMs: 800, // 연타 방지
  capacityField: 'waterCapacity'
});

function num(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

/** 물탱크 한 기의 용량 */
export function tankCapacity(turret) {
  if (!turret) return 0;
  return Math.max(0, Math.floor(num(turret.type?.[WATER.capacityField] ?? turret[WATER.capacityField])));
}

/** 살아 있는 물탱크의 저장 용량 합계 (TurretSystem 또는 Turret[] 모두 허용) */
export function waterCapacityOf(turrets) {
  const list = Array.isArray(turrets)
    ? turrets
    : Array.isArray(turrets?.turrets)
      ? turrets.turrets
      : [];
  let total = 0;
  for (const t of list) {
    if (!t || t.destroyed || t.dead) continue;
    if (t.type?.kind !== WATER.tankKind && t.kind !== WATER.tankKind) continue;
    total += tankCapacity(t);
  }
  return total;
}

/** 현재 저장된 물(L, 정수) */
export function storedWater(economy) {
  return Math.max(0, Math.floor(num(economy?.water)));
}

/** 저장량을 용량에 맞춘다(탱크 철거·파괴 시 넘치는 물은 버린다). */
export function clampWater(economy, capacity) {
  const cap = Math.max(0, Math.floor(num(capacity)));
  if (!economy) return { stored: 0, capacity: cap };
  const stored = Math.min(cap, storedWater(economy));
  economy.water = stored;
  return { stored, capacity: cap };
}

/**
 * 지하수 1회 추출.
 * @param {object} opts
 * @param {object} opts.economy 물을 저장할 경제 객체
 * @param {number} opts.capacity 현재 물탱크 총 용량
 * @param {number} [opts.now] 현재 시각(ms)
 * @param {number} [opts.nextReadyAt] 다음 추출 가능 시각(ms)
 * @param {number} [opts.amount] 1회 추출량
 * @returns {{ok:boolean, reason:string|null, gained:number, stored:number, capacity:number, nextReadyAt:number}}
 */
export function extractWater({
  economy,
  capacity,
  now = 0,
  nextReadyAt = 0,
  amount = WATER.extractAmount
} = {}) {
  const cap = Math.max(0, Math.floor(num(capacity)));
  const stored = storedWater(economy);
  const at = num(now);
  const next = num(nextReadyAt);
  const base = { ok: false, reason: null, gained: 0, stored, capacity: cap, nextReadyAt: next };

  if (!economy) return { ...base, reason: 'invalid' };
  if (cap <= 0) return { ...base, reason: 'no_tank' };
  if (stored >= cap) return { ...base, reason: 'full' };
  if (at < next) return { ...base, reason: 'cooldown' };

  const step = Math.floor(num(amount, WATER.extractAmount));
  if (step <= 0) return { ...base, reason: 'invalid' };
  const room = cap - stored;
  const gain = Math.min(step, room);
  const after = Math.min(cap, stored + gain);
  if (typeof economy.addWater === 'function') economy.addWater(after - stored);
  else economy.water = after;

  return {
    ok: true,
    reason: null,
    gained: after - stored,
    stored: after,
    capacity: cap,
    nextReadyAt: at + WATER.cooldownMs
  };
}

export default WATER;

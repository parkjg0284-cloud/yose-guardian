// 마법부여 — 보유한 **모든 무기**에 속성(화염·냉기·번개…)을 새긴다.
// 계약 §4.32: canEnchant · costFor · enchant · bonusFor · stateFor · toJSON/fromJSON.
// 순수 로직(THREE/DOM 비의존) — 스모크 테스트가 그대로 임포트해 검증한다.
import {
  ENCHANT_ELEMENTS,
  ENCHANT_BY_ID,
  ENCHANT_MAX_LEVEL,
  ENCHANT_DAMAGE_PER_LEVEL,
  SPELL_ELEMENTS
} from '../data.js';

const SPELL_BY_ID = {};
for (const e of SPELL_ELEMENTS) SPELL_BY_ID[e.id] = e;

function num(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function clampLevel(level) {
  return Math.max(1, Math.min(ENCHANT_MAX_LEVEL, Math.round(num(level, 1))));
}

/** 레벨 배수 — 1레벨 1배, 5레벨 5배(재료·골드 모두) */
function levelScale(level) {
  return Math.max(1, Math.round(num(level, 1)));
}

/**
 * 부여 비용 — 1레벨 기준값 × 레벨.
 * @returns {{ gold: number, minerals: Record<string, number> }}
 */
export function enchantCost(elementId, level = 1) {
  const el = ENCHANT_BY_ID[elementId] ?? null;
  if (!el) return { gold: 0, minerals: {} };
  const k = levelScale(level);
  const minerals = {};
  for (const [id, count] of Object.entries(el.cost?.minerals ?? {})) {
    minerals[id] = Math.max(1, Math.round(num(count) * k));
  }
  return { gold: Math.round(num(el.cost?.gold) * k), minerals };
}

/** 레벨 → 피해 배율(1레벨 +8% … 5레벨 +40%) */
export function enchantDamageMult(level) {
  return 1 + ENCHANT_DAMAGE_PER_LEVEL * Math.max(0, Math.min(ENCHANT_MAX_LEVEL, Math.round(num(level))));
}

export function enchantElement(elementId) {
  return ENCHANT_BY_ID[elementId] ?? null;
}

/** 속성의 색·상태이상(SPELL_ELEMENTS 와 연결) */
export function enchantVisual(elementId) {
  const spell = SPELL_BY_ID[elementId] ?? null;
  return {
    color: spell?.color ?? 0xffffff,
    status: spell?.status ?? null,
    statusName: spell?.name ?? elementId,
    statusDesc: spell?.desc ?? ''
  };
}

export const ENCHANT_ELEMENT_LIST = ENCHANT_ELEMENTS.slice();
export const ENCHANT_MAX = ENCHANT_MAX_LEVEL;

export class EnchantSystem {
  constructor({ economy = null, stats = null } = {}) {
    this.economy = economy;
    this.stats = stats;
    /** @type {Map<string, { element: string, level: number }>} 무기 id → 부여 상태 */
    this.applied = new Map();
    this.enchantCount = 0;
  }

  get elements() {
    return ENCHANT_ELEMENTS.slice();
  }

  get count() {
    return this.applied.size;
  }

  get maxLevel() {
    return ENCHANT_MAX_LEVEL;
  }

  /** 이 무기의 부여 상태(없으면 null) */
  stateFor(weaponId) {
    const entry = this.applied.get(String(weaponId));
    if (!entry) return null;
    const el = ENCHANT_BY_ID[entry.element] ?? null;
    const visual = enchantVisual(entry.element);
    const level = clampLevel(entry.level);
    const maxed = level >= ENCHANT_MAX_LEVEL;
    return {
      weaponId: String(weaponId),
      element: entry.element,
      name: el?.name ?? entry.element,
      icon: el?.icon ?? '✨',
      grade: el?.grade ?? 'common',
      level,
      maxLevel: ENCHANT_MAX_LEVEL,
      damageMult: enchantDamageMult(level),
      percent: Math.round((enchantDamageMult(level) - 1) * 100),
      color: visual.color,
      status: visual.status,
      statusName: visual.statusName,
      desc: el?.desc ?? visual.statusDesc,
      maxed,
      nextCost: maxed ? null : enchantCost(entry.element, level + 1)
    };
  }

  /** 다음 부여 비용과 결과 레벨(같은 속성이면 레벨업, 다른 속성이면 1레벨로 교체) */
  costFor(weaponId, elementId) {
    const cur = this.applied.get(String(weaponId)) ?? null;
    if (cur && cur.element === elementId) {
      const level = clampLevel(cur.level);
      if (level >= ENCHANT_MAX_LEVEL) return { cost: null, level, maxed: true, same: true };
      return { cost: enchantCost(elementId, level + 1), level: level + 1, maxed: false, same: true };
    }
    return { cost: enchantCost(elementId, 1), level: 1, maxed: false, same: false };
  }

  /**
   * 부여 가능 여부.
   * @param {object} ctx { hasWeapon?: (id)=>boolean, hasEnchanter?: boolean|(()=>boolean) }
   */
  canEnchant(weaponId, elementId, ctx = {}) {
    const element = ENCHANT_BY_ID[elementId] ?? null;
    if (!element) return { ok: false, error: '알 수 없는 속성입니다.' };
    const c = ctx ?? {};
    const built = typeof c.hasEnchanter === 'function' ? Boolean(c.hasEnchanter()) : c.hasEnchanter;
    if (built === false) {
      return { ok: false, error: '마법부여대를 먼저 건설해야 합니다. (건설 → 🏗 시설 → 🔮 마법부여대)' };
    }
    const hasWeapon = typeof c.hasWeapon === 'function' ? c.hasWeapon : () => true;
    if (!hasWeapon(weaponId)) return { ok: false, error: '보유하지 않은 무기입니다.' };

    const info = this.costFor(weaponId, elementId);
    if (info.maxed) return { ok: false, error: `${element.name} 은(는) 이미 최대 레벨입니다.`, maxed: true };
    const econ = this.economy;
    if (econ && typeof econ.canAfford === 'function' && !econ.canAfford(info.cost)) {
      return { ok: false, error: '재료가 부족합니다.', cost: info.cost, level: info.level };
    }
    return { ok: true, cost: info.cost, level: info.level, element, same: info.same };
  }

  /** 부여 실행 — 재료를 소비하고 무기 상태를 갱신한다 */
  enchant(weaponId, elementId, ctx = {}) {
    const res = this.canEnchant(weaponId, elementId, ctx);
    if (!res.ok) return res;
    const econ = this.economy;
    if (econ && typeof econ.spend === 'function' && !econ.spend(res.cost)) {
      return { ok: false, error: '재료가 부족합니다.' };
    }
    this.applied.set(String(weaponId), { element: elementId, level: res.level });
    this.enchantCount += 1;
    this.stats?.track?.('weaponEnchants', 1);
    return { ok: true, state: this.stateFor(weaponId), cost: res.cost, level: res.level, element: res.element, same: res.same };
  }

  /** 부여 해제(관리자/테스트용) */
  clear(weaponId) {
    return this.applied.delete(String(weaponId));
  }

  /** 전투 반영용 — 피해 배율·속성 상태 */
  bonusFor(weaponId) {
    const st = this.stateFor(weaponId);
    if (!st) return { element: null, level: 0, damageMult: 1, status: null, color: null, name: null };
    return { element: st.element, level: st.level, damageMult: st.damageMult, status: st.status, color: st.color, name: st.name };
  }

  /** 부여된 무기 목록 */
  list() {
    return [...this.applied.keys()].map((id) => this.stateFor(id));
  }

  toJSON() {
    return {
      enchantCount: this.enchantCount,
      applied: [...this.applied.entries()].map(([weaponId, v]) => ({ weaponId, element: v.element, level: v.level }))
    };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? o : {};
    this.applied.clear();
    for (const entry of src.applied ?? []) {
      const id = entry?.weaponId == null ? '' : String(entry.weaponId);
      if (!id || !ENCHANT_BY_ID[entry?.element]) continue;
      this.applied.set(id, { element: entry.element, level: clampLevel(entry.level) });
    }
    this.enchantCount = Math.max(0, Math.round(num(src.enchantCount)));
    return this;
  }
}

/** 데이터 무결성 — 스모크 테스트가 호출한다 */
export function validateEnchantData() {
  const errors = [];
  if (!ENCHANT_ELEMENTS.length) errors.push('마법부여 속성이 없다');
  if (ENCHANT_MAX_LEVEL < 1) errors.push('최대 레벨이 1 미만이다');
  for (const el of ENCHANT_ELEMENTS) {
    if (!el.id) errors.push('속성 id 누락');
    if (!SPELL_BY_ID[el.id]) errors.push(`${el.id}: SPELL_ELEMENTS 에 없는 속성`);
    if (!el.cost || num(el.cost.gold) <= 0) errors.push(`${el.id}: 골드 비용이 없다`);
    const mins = Object.keys(el.cost?.minerals ?? {});
    if (!mins.length) errors.push(`${el.id}: 재료가 없다`);
  }
  const ids = new Set(ENCHANT_ELEMENTS.map((e) => e.id));
  if (ids.size !== ENCHANT_ELEMENTS.length) errors.push('속성 id 중복');
  const l1 = enchantCost('fire', 1);
  const l3 = enchantCost('fire', 3);
  if (!(l3.gold > l1.gold)) errors.push('레벨이 오르면 비용이 비싸져야 한다');
  if (!(enchantDamageMult(5) > enchantDamageMult(1))) errors.push('레벨이 오르면 피해 배율이 커져야 한다');
  return errors;
}

export default { EnchantSystem, enchantCost, enchantDamageMult, enchantElement, enchantVisual, validateEnchantData };

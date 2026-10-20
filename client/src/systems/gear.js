// 요새의 수호자 — 가죽 장비(방어구) 시스템.
// 순수 로직: THREE / DOM 을 import 하지 않는다(헤드리스 검증 가능).
//
//  · 가죽 장비 6종의 보유/슬롯 장착 상태와 제작 비용 판정만 담당한다.
//  · 보너스는 **비율만** 돌려준다(bonus()). 실제 적용은 main.js 가 담당한다 —
//    maxHp/maxMana 같은 절대값을 건드리면 저장에 섞여 불러오기 때 이중 적용된다.
//  · 같은 슬롯(머리·몸통·발·등)은 하나만 착용한다.

import {
  LEATHER_GEAR,
  LEATHER_GEAR_BY_ID,
  GEAR_SET_BONUS,
  GEAR_SLOTS,
  leatherGearById,
  gearBonusText,
  gearCostText
} from '../data.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** 보너스 키 목록 — bonus() 가 항상 모든 키를 채워 돌려준다 */
export const GEAR_BONUS_KEYS = [
  'damageTakenPct',
  'damagePct',
  'moveSpeedPct',
  'manaRegenPct',
  'staminaRegenPct',
  'flightSpeedPct',
  'flightCeilingPct',
  'miningSpeedPct'
];

/** 0 으로 채워진 보너스 객체 */
export function emptyBonus() {
  const out = {};
  for (const k of GEAR_BONUS_KEYS) out[k] = 0;
  return out;
}

/** 보너스 합산(값을 더한다) */
export function addBonus(target, source) {
  const out = target ?? emptyBonus();
  for (const k of GEAR_BONUS_KEYS) out[k] = num(out[k]) + num(source?.[k]);
  return out;
}

/** 장비 착용 문구 — "가죽 조끼(몸통)" */
export function gearSlotText(id) {
  const def = leatherGearById(id);
  if (!def) return String(id ?? '');
  const slot = GEAR_SLOTS.find((s) => s.id === def.slot);
  return `${def.name}(${slot?.name ?? def.slot})`;
}

export class GearSystem {
  constructor({ economy = null, audio = null, achievements = null, onEvent = null } = {}) {
    this.economy = economy;
    this.audio = audio;
    this.achievements = achievements;
    this.onEvent = onEvent;
    this.owned = new Set();
    /** @type {Record<string, string>} 슬롯 id -> 장비 id */
    this.equipped = {};
    this.buys = 0;
  }

  // ── 조회 ────────────────────────────────────────────────
  get count() {
    return this.owned.size;
  }

  /** 착용 중인 장비 수 */
  get equippedCount() {
    return Object.keys(this.equipped).length;
  }

  has(id) {
    return this.owned.has(id);
  }

  /** 그 슬롯에 착용 중인 장비 id(없으면 null) */
  equippedIn(slot) {
    const id = this.equipped?.[String(slot ?? '')] ?? null;
    return id && this.owned.has(id) ? id : null;
  }

  isEquipped(id) {
    const def = leatherGearById(id);
    if (!def) return false;
    return this.equippedIn(def.slot) === def.id;
  }

  /** UI 목록 — 장비 데이터 + 보유/착용/제작 가능 여부 */
  list() {
    return LEATHER_GEAR.map((g) => {
      const check = this.canBuy(g.id);
      const slot = GEAR_SLOTS.find((s) => s.id === g.slot);
      return {
        ...g,
        slotName: slot?.name ?? g.slot,
        slotGlyph: slot?.glyph ?? '🎽',
        owned: this.owned.has(g.id),
        equipped: this.isEquipped(g.id),
        canBuy: check.ok,
        reason: check.reason,
        costText: gearCostText(g),
        bonusText: gearBonusText(g.bonus)
      };
    });
  }

  // ── 제작 ────────────────────────────────────────────────
  /** { ok, reason, gear, cost } */
  canBuy(id) {
    const gear = leatherGearById(id);
    if (!gear) return { ok: false, reason: '알 수 없는 가죽 장비입니다', gear: null, cost: null };
    if (this.owned.has(id)) return { ok: false, reason: '이미 보유한 장비입니다', gear, cost: gear.cost ?? null };
    if (!this.economy) return { ok: false, reason: '게임이 시작된 뒤에 만들 수 있습니다', gear, cost: gear.cost ?? null };
    const cost = gear.cost ?? null;
    if (cost) {
      if (typeof this.economy.canAfford === 'function') {
        if (!this.economy.canAfford(cost)) {
          return { ok: false, reason: `재료가 부족합니다 — ${gearCostText(gear)}`, gear, cost };
        }
      } else if (num(this.economy.gold, 0) < num(cost.gold)) {
        return { ok: false, reason: `골드가 부족합니다 — ${num(cost.gold).toLocaleString('en-US')} G 필요`, gear, cost };
      }
    }
    return { ok: true, reason: '', gear, cost };
  }

  /** 제작 → 보유 + 즉시 착용 */
  buy(id) {
    const check = this.canBuy(id);
    if (!check.ok) return { ok: false, reason: check.reason, gear: check.gear, cost: check.cost };
    const cost = check.cost;
    if (cost && this.economy && typeof this.economy.spend === 'function') {
      if (!this.economy.spend(cost)) {
        return { ok: false, reason: `재료가 부족합니다 — ${gearCostText(check.gear)}`, gear: check.gear, cost };
      }
    }
    this.owned.add(check.gear.id);
    this.equipped[check.gear.slot] = check.gear.id;
    this.buys += 1;
    this.achievements?.track?.('gearEquipped', 1);
    this.audio?.play?.('levelup');
    this._emit('buy', { id: check.gear.id, gear: check.gear, cost });
    return { ok: true, gear: check.gear, cost };
  }

  /** 보유 지급(관리자 · 보상) — equip=false 면 착용하지 않는다 */
  grant(id, { equip = true } = {}) {
    const gear = leatherGearById(id);
    if (!gear) return { ok: false, reason: '알 수 없는 가죽 장비입니다' };
    const isNew = !this.owned.has(gear.id);
    this.owned.add(gear.id);
    if (equip) this.equipped[gear.slot] = gear.id;
    this._emit(isNew ? 'grant' : 'equip', { id: gear.id, gear, isNew });
    return { ok: true, gear, isNew };
  }

  // ── 장착 ────────────────────────────────────────────────
  equip(id) {
    const gear = leatherGearById(id);
    if (!gear) return { ok: false, reason: '알 수 없는 가죽 장비입니다' };
    if (!this.owned.has(id)) return { ok: false, reason: `${gear.name} 을(를) 보유하고 있지 않습니다` };
    this.equipped[gear.slot] = id;
    this._emit('equip', { id, gear });
    return { ok: true, gear };
  }

  /** 슬롯 해제(슬롯 id 또는 장비 id) */
  unequip(slotOrId = null) {
    const def = leatherGearById(slotOrId);
    const slot = def ? def.slot : String(slotOrId ?? '');
    const had = this.equipped?.[slot] ?? null;
    if (!had) return { ok: false, reason: '그 슬롯에 착용 중인 장비가 없습니다' };
    delete this.equipped[slot];
    this._emit('unequip', { id: had, gear: leatherGearById(had), slot });
    return { ok: true, gear: leatherGearById(had) };
  }

  /** 착용/해제 토글 */
  toggle(id) {
    if (this.isEquipped(id)) return this.unequip(id);
    return this.equip(id);
  }

  /** 전부 해제 */
  unequipAll() {
    const ids = Object.values(this.equipped ?? {});
    this.equipped = {};
    if (ids.length) this._emit('unequipAll', { ids });
    return { ok: true, count: ids.length };
  }

  /** 모든 장비 해제(관리자) */
  clear() {
    this.unequipAll();
    this.owned.clear();
    return this;
  }

  // ── 보너스 ──────────────────────────────────────────────
  /** 착용 중인 장비 + 세트 효과의 합산 보너스(비율) */
  bonus() {
    const out = emptyBonus();
    const equippedIds = LEATHER_GEAR.filter((g) => this.isEquipped(g.id)).map((g) => g.id);
    for (const id of equippedIds) addBonus(out, leatherGearById(id)?.bonus);
    for (const set of GEAR_SET_BONUS) {
      if (equippedIds.length >= set.count) addBonus(out, set.bonus);
    }
    return out;
  }

  /** UI/적용용 상세 — { ...bonus, pieces, equippedIds, sets } */
  stats() {
    const equippedIds = LEATHER_GEAR.filter((g) => this.isEquipped(g.id)).map((g) => g.id);
    const sets = GEAR_SET_BONUS.filter((s) => equippedIds.length >= s.count).map((s) => ({ ...s }));
    return { ...this.bonus(), pieces: equippedIds.length, equippedIds, sets };
  }

  /** 세트 효과 문구 목록 */
  setTexts() {
    const pieces = this.stats().pieces;
    return GEAR_SET_BONUS.map((s) => `${s.name}${pieces >= s.count ? ' ✔' : ''} — ${s.desc}`);
  }

  // ── 저장 ────────────────────────────────────────────────
  toJSON() {
    return { owned: [...this.owned], equipped: { ...this.equipped }, buys: this.buys };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? o : null;
    this.owned = new Set();
    if (src && Array.isArray(src.owned)) {
      for (const id of src.owned) if (LEATHER_GEAR_BY_ID[id]) this.owned.add(id);
    }
    this.equipped = {};
    const eq = src?.equipped && typeof src.equipped === 'object' ? src.equipped : {};
    for (const [slot, id] of Object.entries(eq)) {
      const def = leatherGearById(id);
      if (!def || def.slot !== slot || !this.owned.has(def.id)) continue;
      this.equipped[slot] = def.id;
    }
    this.buys = num(src?.buys, 0);
    return this;
  }

  _emit(type, payload) {
    try {
      this.onEvent?.(type, payload);
    } catch {
      /* 이벤트 실패는 게임을 멈추지 않는다 */
    }
  }

  dispose() {
    this.owned.clear();
    this.equipped = {};
    this.onEvent = null;
  }
}

export { LEATHER_GEAR, LEATHER_GEAR_BY_ID, GEAR_SLOTS, GEAR_SET_BONUS, leatherGearById, gearBonusText };
export default GearSystem;

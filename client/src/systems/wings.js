// 요새의 수호자 — 요정의 날개(장비 · 비행) 시스템.
// 순수 로직: THREE / DOM 을 import 하지 않는다(헤드리스 검증 가능).
//
//  · 보유/장착 상태와 비용 판정만 담당한다(획득의 기본 경로는 제작대 — systems/crafting.js).
//  · 실제 비행 물리는 Player.setFlight() + main.js 가 담당한다(flight() 프로필을 넘긴다).
//  · 관리자 /플라이 는 setForced(true) 로 날개 없이 비행을 켠다(마나 소모 0).

import {
  FAIRY_WINGS,
  FAIRY_WING_BY_ID,
  FAIRY_WING_DEFAULT,
  WING_FLIGHT_DEFAULTS,
  MINERAL_TYPES,
  fairyWingById,
  nextFairyWing,
  leatherById,
  wingGradeInfo,
  fairyWingGrade
} from '../data.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const COST_MINERAL_NAME = {
  iron: '철광석',
  copper: '구리광석',
  coal: '석탄',
  quartz: '석영',
  clay: '점토',
  mana: '마나결정'
};

/** 비용을 사람이 읽는 문자열로 — "25,000 G · 철광석 30 · 석영 20 · 마나결정 5" */
export function wingCostText(wing) {
  const cost = wing?.cost;
  if (!cost) return '무료';
  const parts = [];
  if (num(cost.gold) > 0) parts.push(`${num(cost.gold).toLocaleString('en-US')} G`);
  for (const [id, count] of Object.entries(cost.minerals ?? {})) {
    const name = MINERAL_TYPES.find((m) => m.id === id)?.name ?? COST_MINERAL_NAME[id] ?? id;
    parts.push(`${name} ${num(count)}`);
  }
  for (const [id, count] of Object.entries(cost.leather ?? {})) {
    parts.push(`${leatherById(id)?.name ?? id} ${num(count)}`);
  }
  return parts.length ? parts.join(' · ') : '무료';
}

/** 비행 성능을 사람이 읽는 문자열로 — "속도 ×1.3 · 상승 11 · 마나 6/s · 상한 120m" */
export function wingFlightText(wing) {
  const f = wing?.flight ?? {};
  const drain = num(f.drain);
  return [
    `속도 ×${num(f.speed, 1).toFixed(2)}`,
    `상승 ${num(f.lift)} m/s`,
    drain > 0 ? `마나 ${drain}/s` : '마나 소모 없음',
    `상한 ${num(f.ceiling)} m`
  ].join(' · ');
}

export function wingIds() {
  return FAIRY_WINGS.map((w) => w.id);
}

/** 이름/id 부분일치 검색 — 관리자 명령이 쓴다 */
export function findWing(query, list = FAIRY_WINGS) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { wing: null, matches: [] };
  const exact = list.find((w) => String(w.id).toLowerCase() === q || String(w.name).toLowerCase() === q);
  if (exact) return { wing: exact, matches: [exact] };
  const matches = list.filter(
    (w) => String(w.id).toLowerCase().includes(q) || String(w.name).toLowerCase().includes(q)
  );
  return { wing: matches.length === 1 ? matches[0] : null, matches };
}

export class WingSystem {
  constructor({ economy = null, fairies = null, audio = null, stats = null, onEvent = null } = {}) {
    this.economy = economy;
    this.fairies = fairies;
    this.audio = audio;
    this.stats = stats;
    this.onEvent = onEvent;
    this.owned = new Set();
    this.equippedId = null;
    this.forced = false; // 관리자 /플라이 — 날개 없이도 비행
    this.buys = 0;
  }

  // ── 조회 ────────────────────────────────────────────────
  get equipped() {
    return fairyWingById(this.equippedId);
  }

  get equippedName() {
    return this.equipped?.name ?? (this.forced ? '관리자 비행' : null);
  }

  get count() {
    return this.owned.size;
  }

  has(id) {
    return this.owned.has(id);
  }

  isEquipped(id) {
    return Boolean(id) && this.equippedId === id;
  }

  /** UI 목록 — 날개 데이터 + 보유/장착/제작 가능 여부 */
  list() {
    return FAIRY_WINGS.map((w) => {
      const check = this.canBuy(w.id);
      return {
        ...w,
        owned: this.owned.has(w.id),
        equipped: this.equippedId === w.id,
        canBuy: check.ok,
        reason: check.reason,
        gradeName: fairyWingGrade(w.id).name,
        gradeColor: fairyWingGrade(w.id).color,
        relic: w.grade === 'relic' || w.grade === 'transcend',
        costText: wingCostText(w),
        flightText: wingFlightText(w)
      };
    });
  }

  /** 가장 좋은(티어 높은) 보유 날개 */
  best() {
    let best = null;
    for (const w of FAIRY_WINGS) if (this.owned.has(w.id)) best = w;
    return best;
  }

  // ── 획득(제작대가 기본 · buy() 는 시스템 API) ─────────────
  /** { ok, reason, wing, cost } */
  canBuy(id) {
    const wing = fairyWingById(id);
    if (!wing) return { ok: false, reason: '알 수 없는 날개입니다', wing: null, cost: null };
    if (this.owned.has(id)) return { ok: false, reason: '이미 보유한 날개입니다', wing, cost: wing.cost ?? null };
    if (wing.requires && !this.owned.has(wing.requires)) {
      const need = fairyWingById(wing.requires);
      return { ok: false, reason: `${need?.name ?? wing.requires} 을(를) 먼저 만들어야 합니다`, wing, cost: wing.cost ?? null };
    }
    if (!this.economy) return { ok: false, reason: '게임이 시작된 뒤에 구매할 수 있습니다', wing, cost: wing.cost ?? null };
    const cost = wing.cost ?? null;
    if (cost) {
      if (typeof this.economy.canAfford === 'function') {
        if (!this.economy.canAfford(cost)) {
          return { ok: false, reason: `재료가 부족합니다 — ${wingCostText(wing)}`, wing, cost };
        }
      } else if (num(this.economy.gold, 0) < num(cost.gold)) {
        return { ok: false, reason: `골드가 부족합니다 — ${num(cost.gold).toLocaleString()} G 필요`, wing, cost };
      }
    }
    return { ok: true, reason: '', wing, cost };
  }

  /** 구매 → 보유 + 즉시 장착 */
  buy(id) {
    const check = this.canBuy(id);
    if (!check.ok) return { ok: false, reason: check.reason, wing: check.wing, cost: check.cost };
    const cost = check.cost;
    if (cost && this.economy && typeof this.economy.spend === 'function') {
      if (!this.economy.spend(cost)) {
        return { ok: false, reason: `재료가 부족합니다 — ${wingCostText(check.wing)}`, wing: check.wing, cost };
      }
    }
    this.owned.add(check.wing.id);
    this.equippedId = check.wing.id;
    this.buys += 1;
    this._emit('buy', { id: check.wing.id, wing: check.wing, cost });
    return { ok: true, wing: check.wing, cost };
  }

  // ── 보유 지급(관리자 · 보상) ────────────────────────────
  grant(id, { equip = true } = {}) {
    const wing = fairyWingById(id) ?? (id ? FAIRY_WING_BY_ID[id] : null);
    if (!wing) return { ok: false, reason: '알 수 없는 날개입니다' };
    const isNew = !this.owned.has(wing.id);
    this.owned.add(wing.id);
    if (equip) this.equippedId = wing.id;
    this._emit(isNew ? 'grant' : 'equip', { id: wing.id, wing, isNew });
    return { ok: true, wing, isNew };
  }

  // ── 장착 ────────────────────────────────────────────────
  equip(id) {
    const wing = fairyWingById(id);
    if (!wing) return { ok: false, reason: '알 수 없는 날개입니다' };
    if (!this.owned.has(id)) return { ok: false, reason: `${wing.name} 을(를) 보유하고 있지 않습니다` };
    this.equippedId = id;
    this._emit('equip', { id, wing });
    return { ok: true, wing };
  }

  unequip() {
    const had = this.equippedId;
    this.equippedId = null;
    if (had) this._emit('unequip', { id: had, wing: fairyWingById(had) });
    return { ok: true, wing: null };
  }

  /** V 키 — 장착/해제 토글. id 를 주면 그 날개로 토글 */
  toggleEquip(id = null) {
    if (id) {
      if (this.equippedId === id) return this.unequip();
      return this.equip(id);
    }
    if (this.equippedId) return this.unequip();
    const target = this.best() ?? null;
    if (!target) return { ok: false, reason: '보유한 날개가 없습니다 — 인벤토리(I)에서 만들 수 있습니다' };
    return this.equip(target.id);
  }

  /** 관리자 비행 강제(날개 없이 · 마나 소모 0) */
  setForced(on) {
    this.forced = Boolean(on);
    this._emit('forced', { on: this.forced });
    return { ok: true, forced: this.forced };
  }

  // ── 비행 프로필 (Player.setFlight 용) ──────────────────
  /**
   * { equipped, id, speed, lift, descend, drain, ceiling, flap, color, accent, glow }
   * 강제 비행(관리자)은 최상위 날개 성능을 쓰고 마나를 소모하지 않는다.
   */
  flight() {
    const wing = this.equipped;
    const fallback = FAIRY_WINGS[FAIRY_WINGS.length - 1];
    const equipped = Boolean(wing) || this.forced;
    if (!equipped) return { ...WING_FLIGHT_DEFAULTS, equipped: false, id: null };
    const src = wing ?? fallback;
    const f = src?.flight ?? WING_FLIGHT_DEFAULTS;
    return {
      equipped: true,
      id: wing?.id ?? 'admin',
      name: wing?.name ?? '관리자 비행',
      speed: num(f.speed, 1),
      lift: num(f.lift, 10),
      descend: num(f.descend, 12),
      drain: this.forced ? 0 : num(f.drain, 0),
      ceiling: num(f.ceiling, 120),
      flap: num(src?.flap, 7),
      color: num(src?.color, 0xbff5d0),
      accent: num(src?.accent, 0xfff0b0),
      glow: num(src?.glow, 0x8ff0c0)
    };
  }

  // ── 저장 ────────────────────────────────────────────────
  toJSON() {
    return { owned: [...this.owned], equippedId: this.equippedId, buys: this.buys };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? o : null;
    this.owned = new Set();
    if (src && Array.isArray(src.owned)) {
      for (const id of src.owned) if (fairyWingById(id)) this.owned.add(id);
    }
    this.equippedId = src && this.owned.has(src.equippedId) ? src.equippedId : null;
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
    this.equippedId = null;
    this.forced = false;
    this.onEvent = null;
  }
}

export { FAIRY_WINGS, FAIRY_WING_BY_ID, FAIRY_WING_DEFAULT, WING_FLIGHT_DEFAULTS, fairyWingById, nextFairyWing };
export default WingSystem;

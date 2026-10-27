// 경제 시스템 — 순수 로직 모듈. THREE 를 import 하지 않는다 (헤드리스 테스트 대상).
// 계약 §4.7: gold / wood / minerals(Record) + add·spend·canAfford·totalMinerals·toJSON·fromJSON.
// 계약 §4.45: 가죽(leathers)과 같은 방식의 화살(arrows) 원장 — 활 계열의 소모품. spendArrow() 로 1발씩 소비한다.
// 계약 §4.88: 물(water) — 물탱크 용량 안에서만 저장되는 지하수 자원. 탱크 용량 검사는 water.js/게임이 맡는다.
// 음수/NaN/문자열 쓰레기 입력에 대해 절대 throw 하지 않고, 자원이 음수가 되지 않도록 방어한다.

/** 유한한 숫자만 통과시키고 그 외에는 fallback(기본 0) 으로 본다. */
function num(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

/** 0 이상의 유효한 수량인지. (음수/NaN/문자열 쓰레기 방어) */
function isValidAmount(value) {
  const v = Number(value);
  return Number.isFinite(v) && v >= 0;
}

/** 비용 객체의 minerals 를 [[mineralId, count], ...] 로 정규화한다. (Record/배열 모두 허용) */
function mineralEntries(minerals) {
  const out = [];
  if (!minerals) return out;
  if (Array.isArray(minerals)) {
    for (const entry of minerals) {
      if (!entry) continue;
      const id = entry.id ?? entry.mineralId ?? entry.mineral;
      const count = num(entry.count ?? entry.amount ?? entry.n ?? 1);
      if (typeof id === 'string' && id.length > 0) out.push([id, count]);
    }
    return out;
  }
  if (typeof minerals === 'object') {
    for (const [id, count] of Object.entries(minerals)) {
      if (!id) continue;
      out.push([id, num(count)]);
    }
  }
  return out;
}

/** 비용 객체의 leather 를 정규화 — Record/배열/문자열/숫자 모두 허용 */
function leatherEntries(leather) {
  if (leather === undefined || leather === null) return [];
  if (typeof leather === 'string') return leather ? [[leather, 1]] : [];
  const asNumber = Number(leather);
  if (typeof leather !== 'object' && Number.isFinite(asNumber)) {
    return asNumber > 0 ? [['leather', asNumber]] : [];
  }
  return mineralEntries(leather);
}

/** 비용 객체의 arrows 를 정규화 — Record/배열/문자열/숫자 모두 허용(가죽과 같은 규칙) */
function arrowEntries(arrows) {
  if (arrows === undefined || arrows === null) return [];
  if (typeof arrows === 'string') return arrows ? [[arrows, 1]] : [];
  const asNumber = Number(arrows);
  if (typeof arrows !== 'object' && Number.isFinite(asNumber)) {
    return asNumber > 0 ? [['arrow_t1', asNumber]] : [];
  }
  return mineralEntries(arrows);
}

export class Economy {
  constructor({ gold = 300, wood = 100, minerals = {}, leathers = {}, arrows = {}, water = 0 } = {}) {
    /** @type {number} 골드 */ this.gold = Math.max(0, num(gold));
    /** @type {number} 목재 */ this.wood = Math.max(0, num(wood));
    /** @type {number} 물(L) — 물탱크 용량까지만 저장된다 */ this.water = Math.max(0, Math.floor(num(water)));
    /** @type {Record<string, number>} 광물 인벤토리 (mineralId -> 개수) */ this.minerals = {};
    for (const [id, count] of mineralEntries(minerals)) {
      const n = Math.floor(Math.max(0, count));
      if (n > 0) this.minerals[id] = n;
    }
    /** @type {Record<string, number>} 가죽 인벤토리 (leatherId -> 개수) */ this.leathers = {};
    for (const [id, count] of leatherEntries(leathers)) {
      const n = Math.floor(Math.max(0, count));
      if (n > 0) this.leathers[id] = n;
    }
    /** @type {Record<string, number>} 화살 인벤토리 (arrowId -> 발수) */ this.arrows = {};
    for (const [id, count] of arrowEntries(arrows)) {
      const n = Math.floor(Math.max(0, count));
      if (n > 0) this.arrows[id] = n;
    }
  }

  // ── 골드 ────────────────────────────────────────────────────────────────
  /** 골드 추가. 음수/0/NaN 은 무시한다(골드가 줄지 않는다). 반환: 현재 골드 */
  addGold(amount) {
    const n = num(amount);
    if (n > 0) this.gold += n;
    return this.gold;
  }

  /** 골드 소비. 부족하거나 음수 요청이면 false (상태 변화 없음) */
  spendGold(amount) {
    if (!isValidAmount(amount)) return false;
    const n = num(amount);
    if (n <= 0) return true;
    if (this.gold < n) return false;
    this.gold -= n;
    return true;
  }

  // ── 목재 ────────────────────────────────────────────────────────────────
  addWood(amount) {
    const n = num(amount);
    if (n > 0) this.wood += n;
    return this.wood;
  }

  spendWood(amount) {
    if (!isValidAmount(amount)) return false;
    const n = num(amount);
    if (n <= 0) return true;
    if (this.wood < n) return false;
    this.wood -= n;
    return true;
  }

  // ── 물 (지하수 · 물탱크) ─────────────────────────────────────────────────
  /** 물 추가(L). 0/음수/NaN 은 무시. 반환: 현재 물 */
  addWater(amount) {
    const n = Math.floor(num(amount));
    if (n > 0) this.water += n;
    return this.water;
  }

  /** 물 소비(L). 부족하거나 음수 요청이면 false (상태 변화 없음) */
  spendWater(amount) {
    if (!isValidAmount(amount)) return false;
    const n = Math.floor(num(amount));
    if (n <= 0) return true;
    if (this.water < n) return false;
    this.water -= n;
    return true;
  }

  // ── 광물 ────────────────────────────────────────────────────────────────
  /** 광물 추가. id 가 비었거나 수량이 음수/NaN 이면 무시. 반환: 현재 개수 */
  addMineral(id, amount = 1) {
    if (typeof id !== 'string' || id.length === 0) return 0;
    if (!isValidAmount(amount)) return this.getMineral(id);
    const n = Math.floor(num(amount));
    if (n <= 0) return this.getMineral(id);
    this.minerals[id] = this.getMineral(id) + n;
    return this.minerals[id];
  }

  /** 보유 광물 개수 (없으면 0) */
  getMineral(id) {
    if (typeof id !== 'string') return 0;
    return num(this.minerals[id]);
  }

  /** 광물 소비(내부용). canAfford 통과를 전제로 한다. */
  _takeMineral(id, amount) {
    const n = Math.floor(num(amount));
    if (n <= 0) return;
    this.minerals[id] = Math.max(0, this.getMineral(id) - n);
    if (this.minerals[id] === 0) delete this.minerals[id];
  }

  // ── 가죽 (몬스터 사냥 보상) ─────────────────────────────────────────────
  /** 가죽 추가. id 가 비었거나 수량이 음수/NaN 이면 무시. 반환: 현재 개수 */
  addLeather(id, amount = 1) {
    if (typeof id !== 'string' || id.length === 0) return 0;
    if (!isValidAmount(amount)) return this.getLeather(id);
    const n = Math.floor(num(amount));
    if (n <= 0) return this.getLeather(id);
    this.leathers[id] = this.getLeather(id) + n;
    return this.leathers[id];
  }

  /** 보유 가죽 개수 (없으면 0) */
  getLeather(id) {
    if (typeof id !== 'string') return 0;
    return num(this.leathers?.[id]);
  }

  /** 가죽 소비(내부용). canAfford 통과를 전제로 한다. */
  _takeLeather(id, amount) {
    const n = Math.floor(num(amount));
    if (n <= 0) return;
    this.leathers[id] = Math.max(0, this.getLeather(id) - n);
    if (this.leathers[id] === 0) delete this.leathers[id];
  }

  /** 보유 가죽 총합 */
  totalLeather() {
    let total = 0;
    for (const v of Object.values(this.leathers ?? {})) total += num(v);
    return total;
  }

  // ── 화살 (활 계열 소모품) ───────────────────────────────────────────────
  /** 화살 추가. id 가 비었거나 수량이 음수/NaN 이면 무시. 반환: 현재 발수 */
  addArrow(id, amount = 1) {
    if (typeof id !== 'string' || id.length === 0) return 0;
    if (!isValidAmount(amount)) return this.getArrow(id);
    const n = Math.floor(num(amount));
    if (n <= 0) return this.getArrow(id);
    this.arrows[id] = this.getArrow(id) + n;
    return this.arrows[id];
  }

  /** 보유 화살 발수 (없으면 0) */
  getArrow(id) {
    if (typeof id !== 'string') return 0;
    return num(this.arrows?.[id]);
  }

  /** 화살 소비(내부용). canAfford 통과를 전제로 한다. */
  _takeArrow(id, amount) {
    const n = Math.floor(num(amount));
    if (n <= 0) return;
    this.arrows[id] = Math.max(0, this.getArrow(id) - n);
    if (this.arrows[id] === 0) delete this.arrows[id];
  }

  /** 화살 1발(또는 n발) 소비 — 부족하면 false (활 발사에서 쓴다) */
  spendArrow(id, amount = 1) {
    if (typeof id !== 'string' || id.length === 0) return false;
    if (!isValidAmount(amount)) return false;
    const n = Math.floor(num(amount));
    if (n <= 0) return false;
    if (this.getArrow(id) < n) return false;
    this._takeArrow(id, n);
    return true;
  }

  /** 보유 화살 총합(발) */
  totalArrows() {
    let total = 0;
    for (const v of Object.values(this.arrows ?? {})) total += num(v);
    return total;
  }

  /** 보유 화살 (arrowId -> 발수) 복사본 */
  arrowInventory() {
    return { ...(this.arrows ?? {}) };
  }

  /** order 순서대로 "남은 화살이 있는" 첫 id — 활이 가장 좋은 화살을 고를 때 쓴다 */
  firstArrowIn(order) {
    if (!Array.isArray(order)) return null;
    for (const id of order) {
      if (typeof id === 'string' && this.getArrow(id) > 0) return id;
    }
    return null;
  }

  // ── 비용 ────────────────────────────────────────────────────────────────
  /** cost = { gold, wood, minerals } 지불 가능한가 */
  canAfford(cost) {
    if (!cost) return true;
    if (num(cost.gold) > this.gold) return false;
    if (num(cost.wood) > this.wood) return false;
    for (const [id, count] of mineralEntries(cost.minerals)) {
      if (Math.floor(count) > this.getMineral(id)) return false;
    }
    for (const [id, count] of leatherEntries(cost.leather)) {
      if (Math.floor(count) > this.getLeather(id)) return false;
    }
    for (const [id, count] of arrowEntries(cost.arrows)) {
      if (Math.floor(count) > this.getArrow(id)) return false;
    }
    return true;
  }

  /** 복합 비용 지불. 하나라도 부족하면 아무것도 소비하지 않고 false */
  spend(cost) {
    if (!cost) return true;
    if (!this.canAfford(cost)) return false;
    if (!this.spendGold(num(cost.gold))) return false;
    if (!this.spendWood(num(cost.wood))) return false;
    for (const [id, count] of mineralEntries(cost.minerals)) this._takeMineral(id, count);
    for (const [id, count] of leatherEntries(cost.leather)) this._takeLeather(id, count);
    for (const [id, count] of arrowEntries(cost.arrows)) this._takeArrow(id, count);
    return true;
  }

  /** 보유 광물 총합 */
  totalMinerals() {
    let total = 0;
    for (const v of Object.values(this.minerals)) total += num(v);
    return total;
  }

  // ── 저장 ────────────────────────────────────────────────────────────────
  toJSON() {
    return {
      gold: this.gold,
      wood: this.wood,
      water: this.water,
      minerals: { ...this.minerals },
      leathers: { ...this.leathers },
      arrows: { ...this.arrows }
    };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? o : {};
    this.gold = Math.max(0, num(src.gold));
    this.wood = Math.max(0, num(src.wood));
    this.water = Math.max(0, Math.floor(num(src.water)));
    this.minerals = {};
    for (const [id, count] of mineralEntries(src.minerals)) {
      const n = Math.floor(Math.max(0, count));
      if (n > 0) this.minerals[id] = n;
    }
    this.leathers = {};
    for (const [id, count] of leatherEntries(src.leathers)) {
      const n = Math.floor(Math.max(0, count));
      if (n > 0) this.leathers[id] = n;
    }
    this.arrows = {};
    for (const [id, count] of arrowEntries(src.arrows)) {
      const n = Math.floor(Math.max(0, count));
      if (n > 0) this.arrows[id] = n;
    }
    return this;
  }
}

export default Economy;

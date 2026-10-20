// 마법연성 — 계약 §4.70.
//
// 마법부여대에서 영구 업그레이드를 사서 **포탑·중앙코어·플레이어·채굴기·벌목기**를 강화한다.
// 순수 로직이다(THREE/DOM 비의존) — 웹과 헤드리스 검사가 같은 코드를 쓴다.
//
// 배율 규칙: `mult(id) = 1 + per × level` (레벨 0 = 1.0 = 변화 없음).
// 값은 **상대 배율**로만 쓴다 — 소비 측(포탑·코어 등)이 이전 배율과의 비를 곱하므로
// 업그레이드로 얻은 이득이 연성 때문에 사라지지 않는다.

export const ARCANA_UPGRADES = [
  {
    id: 'turretRange', name: '포탑 사거리', icon: '🎯', per: 0.06, max: 12, base: 2200, growth: 1.55,
    desc: '모든 포탑의 사거리 +6%'
  },
  {
    id: 'turretDamage', name: '포탑 데미지', icon: '⚔', per: 0.07, max: 12, base: 2600, growth: 1.55,
    desc: '모든 포탑의 공격력 +7%'
  },
  {
    id: 'turretFireRate', name: '포탑 공격속도', icon: '⚡', per: 0.05, max: 12, base: 3000, growth: 1.6,
    desc: '모든 포탑의 공격속도 +5%'
  },
  {
    id: 'coreAttack', name: '중앙코어 공격', icon: '🛰', per: 1, max: 6, base: 5000, growth: 1.9,
    desc: '중앙코어가 스스로 적을 공격한다 — 단계마다 사거리 +6m'
  },
  {
    id: 'coreDamage', name: '중앙코어 데미지', icon: '💥', per: 0.25, max: 12, base: 4200, growth: 1.65,
    desc: '중앙코어 공격의 피해 +25%'
  },
  {
    id: 'coreHp', name: '중앙코어 체력', icon: '❤', per: 0.15, max: 12, base: 3600, growth: 1.6,
    desc: '중앙코어 최대 체력 +15% (오른 만큼 즉시 회복)'
  },
  {
    id: 'coreStorage', name: '중앙코어 저장고', icon: '📦', per: 0.2, max: 12, base: 2400, growth: 1.5,
    desc: '저장고가 보관할 수 있는 양 +20%'
  },
  {
    id: 'playerHp', name: '플레이어 체력', icon: '🧍', per: 0.08, max: 12, base: 2000, growth: 1.5,
    desc: '플레이어 최대 체력 +8% (오른 만큼 즉시 회복)'
  },
  {
    id: 'playerDamage', name: '플레이어 데미지', icon: '🏹', per: 0.07, max: 12, base: 2600, growth: 1.55,
    desc: '플레이어가 주는 피해 +7%'
  },
  {
    id: 'drillSpeed', name: '채굴기 채굴속도', icon: '⛏', per: 0.08, max: 12, base: 1800, growth: 1.5,
    desc: '채굴기·채굴 포탑의 채굴 속도 +8%'
  },
  {
    id: 'lumberSpeed', name: '벌목기 벌목속도', icon: '🪓', per: 0.08, max: 12, base: 1800, growth: 1.5,
    desc: '벌목 시설의 벌목 속도 +8%'
  }
];

/** 마법연성대 시설 id 와 건설 재료(계약 §4.70) */
export const ARCANA_TABLE_ID = 'facility_arcana';
export const ARCANA_TABLE_COST = { gold: 10, wood: 1 };

/** 마법연성대가 세워져 있는가 — 연성은 이 시설이 있어야 산다. */
export function hasArcanaTable(turrets) {
  return (turrets ?? []).some((t) => t && !t.destroyed && (t.typeId === ARCANA_TABLE_ID || t.type?.id === ARCANA_TABLE_ID || t.type?.kind === 'arcana'));
}

export const ARCANA_BASE_RANGE = 10; // 중앙코어 기본 사거리(m) — coreAttack 단계가 +6m 씩 더한다
export const ARCANA_RANGE_PER_LEVEL = 6;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const UPGRADE_BY_ID = Object.fromEntries(ARCANA_UPGRADES.map((u) => [u.id, u]));

export function arcanaInfo(id) {
  return UPGRADE_BY_ID[id] ?? null;
}

export class Arcana {
  constructor(levels = null) {
    /** @type {Record<string, number>} 업그레이드 id → 레벨 */
    this.levels = {};
    if (levels) this.fromJSON(levels);
  }

  level(id) {
    return Math.max(0, Math.floor(num(this.levels?.[id], 0)));
  }

  /** 배율 — 레벨 0 이면 1 */
  mult(id) {
    const info = UPGRADE_BY_ID[id];
    if (!info) return 1;
    return 1 + info.per * this.level(id);
  }

  /** 중앙코어 공격 사거리(m) */
  coreRange() {
    return ARCANA_BASE_RANGE + ARCANA_RANGE_PER_LEVEL * this.level('coreAttack');
  }

  /** 중앙코어가 공격할 수 있는가 */
  get coreAttacks() {
    return this.level('coreAttack') > 0;
  }

  maxLevel(id) {
    return Math.max(1, Math.floor(num(UPGRADE_BY_ID[id]?.max, 1)));
  }

  maxed(id) {
    return this.level(id) >= this.maxLevel(id);
  }

  /** 다음 레벨 가격(골드) — 단계마다 growth 배 */
  cost(id) {
    const info = UPGRADE_BY_ID[id];
    if (!info) return 0;
    const lv = this.level(id);
    if (lv >= this.maxLevel(id)) return 0;
    return Math.round(num(info.base, 1000) * Math.pow(num(info.growth, 1.5), lv));
  }

  /** 살 수 있는가 — 경제(골드)까지 확인 */
  canBuy(id, economy) {
    const info = UPGRADE_BY_ID[id];
    if (!info) return { ok: false, reason: '없는 연성이다' };
    if (this.maxed(id)) return { ok: false, reason: '최대 단계' };
    const cost = this.cost(id);
    const gold = num(economy?.gold, 0);
    if (gold < cost) return { ok: false, reason: `골드 부족 (${cost} 필요)`, cost };
    return { ok: true, cost, level: this.level(id) + 1 };
  }

  /**
   * 연성을 산다. 성공하면 { ok, id, level, cost } 를 돌려준다.
   * 소비(economy.spend)에 실패하면 아무것도 바꾸지 않는다.
   */
  buy(id, economy) {
    const check = this.canBuy(id, economy);
    if (!check.ok) return { ok: false, reason: check.reason };
    if (economy && typeof economy.spend === 'function') {
      const paid = economy.spend({ gold: check.cost, wood: 0, minerals: {} });
      if (paid === false) return { ok: false, reason: '골드 지불 실패' };
    } else if (economy && Number.isFinite(Number(economy.gold))) {
      economy.gold = Math.max(0, Number(economy.gold) - check.cost);
    }
    this.levels[id] = check.level;
    return { ok: true, id, level: check.level, cost: check.cost, info: UPGRADE_BY_ID[id] };
  }

  /** 지금까지 쓴 총 골드(대략) — UI 표시용 */
  spent() {
    let sum = 0;
    for (const u of ARCANA_UPGRADES) {
      for (let lv = 0; lv < this.level(u.id); lv += 1) {
        sum += Math.round(num(u.base, 1000) * Math.pow(num(u.growth, 1.5), lv));
      }
    }
    return sum;
  }

  /** 전체 단계 수 */
  total() {
    return ARCANA_UPGRADES.reduce((n, u) => n + this.level(u.id), 0);
  }

  /** 만렙 개수 */
  maxedCount() {
    return ARCANA_UPGRADES.filter((u) => this.maxed(u.id)).length;
  }

  /** 소비 측(포탑 등)이 쓰는 배율 묶음 */
  factors() {
    return {
      turretRange: this.mult('turretRange'),
      turretDamage: this.mult('turretDamage'),
      turretFireRate: this.mult('turretFireRate'),
      coreStorage: this.mult('coreStorage'),
      playerHp: this.mult('playerHp'),
      playerDamage: this.mult('playerDamage'),
      drillSpeed: this.mult('drillSpeed'),
      lumberSpeed: this.mult('lumberSpeed')
    };
  }

  /** 전부 되돌린다(검사·리셋용) */
  reset() {
    this.levels = {};
  }

  toJSON() {
    const out = {};
    for (const u of ARCANA_UPGRADES) {
      const lv = this.level(u.id);
      if (lv > 0) out[u.id] = lv;
    }
    return { levels: out, total: this.total() };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? (o.levels ?? o) : {};
    this.levels = {};
    for (const u of ARCANA_UPGRADES) {
      const lv = Math.max(0, Math.min(this.maxLevel(u.id), Math.floor(num(src?.[u.id], 0))));
      if (lv > 0) this.levels[u.id] = lv;
    }
    return this;
  }
}

/** 자체 검증 — 순수 규칙(가격·배율·상한·지불 실패·저장 왕복) */
export function validateArcana() {
  const errors = [];
  const gold = { gold: 1_000_000 };
  const a = new Arcana();

  if (a.mult('turretDamage') !== 1) errors.push('레벨 0 의 배율이 1이 아니다');
  const cost0 = a.cost('turretDamage');
  const bought = a.buy('turretDamage', gold);
  if (!bought.ok || a.level('turretDamage') !== 1) errors.push('연성을 사지 못한다');
  if (Math.abs(a.mult('turretDamage') - 1.07) > 1e-9) errors.push(`데미지 배율이 1.07이 아니다(${a.mult('turretDamage')})`);
  if (a.cost('turretDamage') <= cost0) errors.push('가격이 단계마다 오르지 않는다');
  if (gold.gold !== 1_000_000 - cost0) errors.push(`골드가 차감되지 않았다(${gold.gold})`);

  const poor = { gold: 0 };
  const denied = a.buy('coreHp', poor);
  if (denied.ok || a.level('coreHp') !== 0) errors.push('골드가 없는데 연성이 되었다');

  const capped = new Arcana({ turretRange: 999 });
  if (capped.level('turretRange') !== capped.maxLevel('turretRange')) errors.push('상한을 넘겨 저장했다');
  if (capped.buy('turretRange', { gold: 9e9 }).ok !== false) errors.push('만렙인데 더 팔았다');

  const range0 = new Arcana().coreRange();
  const range3 = new Arcana({ coreAttack: 3 }).coreRange();
  if (!(range0 === ARCANA_BASE_RANGE && range3 === ARCANA_BASE_RANGE + 3 * ARCANA_RANGE_PER_LEVEL)) errors.push('코어 사거리 계산이 틀렸다');
  if (new Arcana().coreAttacks !== false || new Arcana({ coreAttack: 1 }).coreAttacks !== true) errors.push('코어 공격 가능 판정이 틀렸다');

  const round = new Arcana({ coreStorage: 4, drillSpeed: 2, playerDamage: 5 }).toJSON();
  const back = new Arcana().fromJSON(round);
  if (back.level('coreStorage') !== 4 || back.level('drillSpeed') !== 2 || back.level('playerDamage') !== 5) errors.push('저장 왕복이 안 된다');
  if (back.total() !== 11) errors.push(`총 단계 계산이 틀렸다(${back.total()})`);
  const f = back.factors();
  if (Math.abs(f.coreStorage - 1.8) > 1e-9) errors.push(`저장고 배율이 1.8이 아니다(${f.coreStorage})`);

  if (ARCANA_UPGRADES.length !== 11) errors.push(`연성 종류가 11종이 아니다(${ARCANA_UPGRADES.length})`);
  if (hasArcanaTable([])) errors.push('연성대가 없는데 있다고 한다');
  if (hasArcanaTable([{ typeId: 'facility_arcana' }]) !== true) errors.push('연성대를 찾지 못한다');
  if (hasArcanaTable([{ typeId: ARCANA_TABLE_ID, destroyed: true }]) !== false) errors.push('부서진 연성대를 쳐 준다');
  if (new Set(ARCANA_UPGRADES.map((u) => u.id)).size !== ARCANA_UPGRADES.length) errors.push('연성 id 가 중복이다');
  return errors;
}

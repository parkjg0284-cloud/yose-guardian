// 요새의 수호자 — 지형 티어별 야생 몬스터(로밍) 스포너.
// 순수 로직: THREE / DOM 을 import 하지 않는다(헤드리스 검증 가능).
//
//  · 지역(지형 띠 T1~T7 + 히든 2곳)마다 REGION_MONSTERS 편성표가 정한 몬스터를
//    플레이어 주변 spawnRadius 거리에 일정 간격으로 등장시킨다.
//  · 지역 밖으로 despawnRadius 이상 멀어진 개체는 정리 대상으로 보고한다.
//  · 실제 스폰/정리는 main.js 가 넘긴 콜백(spawn/despawn)이 담당한다 —
//    스포너는 "언제·무엇을·어디에" 만 결정하고 상태를 갖지 않는다(재현 가능).
//
// 주의: 로밍 몬스터는 웨이브 정산과 무관해야 한다. waves.spawnRoamer() 가
//       enemy.fromTower = true 로 표시해 _aliveCount 에서 빠지게 한다.

import { REGION_MONSTERS, regionMonsterRoster, pickRegionMonster } from '../data.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const TAU = Math.PI * 2;

export const ROAMER_DEFAULTS = Object.freeze({
  /** 스폰 시도 간격(초) */
  interval: 7,
  /** 지역별 동시 생존 상한 */
  maxAlive: 10,
  /** 플레이어 기준 등장 거리(m) */
  spawnRadius: 80,
  /** 이 거리를 벗어나면 정리(m) */
  despawnRadius: 400,
  /** 정예 확률 */
  elite: 0.05,
  /** 월드 전체 로밍 상한(웨이브 몬스터 몫을 침범하지 않게) */
  totalCap: 80,
  /** 첫 스폰까지의 유예(초) — 지역에 들어가자마자 튀어나오지 않게 */
  grace: 2.5,
  /** 웨이브 준비 시간에는 스폰하지 않는다(waves.phase === 'prep' 이면 쉼) */
  spawnInPrep: false
});

/** 편성표 값에 기본값을 채워 돌려준다 */
export function roamerRoster(id) {
  const roster = regionMonsterRoster(id);
  if (!roster) return null;
  return {
    ...roster,
    interval: Math.max(1, num(roster.interval, ROAMER_DEFAULTS.interval)),
    maxAlive: Math.max(1, Math.floor(num(roster.maxAlive, ROAMER_DEFAULTS.maxAlive))),
    spawnRadius: Math.max(20, num(roster.spawnRadius, ROAMER_DEFAULTS.spawnRadius)),
    despawnRadius: Math.max(80, num(roster.despawnRadius, ROAMER_DEFAULTS.despawnRadius)),
    elite: Math.max(0, Math.min(0.5, num(roster.elite, ROAMER_DEFAULTS.elite)))
  };
}

/** 야생 몬스터인가 — waves 가 표시한 플래그 기준 */
export function isRoamer(enemy) {
  return Boolean(enemy && (enemy.roaming === true || enemy.spawnerKind === 'region'));
}

/** 살아 있는 야생 몬스터 수(지역별/전체) */
export function countRoamers(enemies, regionId = null) {
  let total = 0;
  for (const e of enemies ?? []) {
    if (!e?.alive || !isRoamer(e)) continue;
    if (regionId && e.regionId !== regionId) continue;
    total += 1;
  }
  return total;
}

/** 플레이어 기준 거리 계산용 dx/dz */
export function deltaXZ(from, to) {
  return { dx: num(to?.x) - num(from?.x), dz: num(to?.z) - num(from?.z) };
}

/** 이 개체를 정리해야 하는가(지역 이탈) */
export function shouldDespawn(enemy, position, roster = null) {
  if (!enemy?.alive) return false;
  const limit = num(roster?.despawnRadius, ROAMER_DEFAULTS.despawnRadius);
  const { dx, dz } = deltaXZ(position, enemy.position);
  return dx * dx + dz * dz > limit * limit;
}

/**
 * 등장 지점 — 플레이어 주변 고리(거리 spawnRadius ± 25%).
 * rand 는 0~1 함수(시드 RNG 호환). 반환: { x, z, angle, distance }
 */
export function roamerSpawnPoint(rand, position, roster = null) {
  const base = num(roster?.spawnRadius, ROAMER_DEFAULTS.spawnRadius);
  const spread = base * 0.25;
  const angle = num(rand(), Math.random) * TAU;
  const distance = base + (num(rand(), 0.5) * 2 - 1) * spread;
  return {
    x: num(position?.x) + Math.cos(angle) * distance,
    z: num(position?.z) + Math.sin(angle) * distance,
    angle,
    distance
  };
}

/**
 * 로밍 스포너. 상태는 "지역별 남은 타이머" 뿐이라 저장/복원이 필요 없다.
 * update(dt, ctx) 의 ctx:
 *   { position, regionId, phase, enemies, spawn({ regionId, roster, typeId, x, z, elite, wave }), despawn(enemy) }
 */
export class RegionSpawner {
  constructor({ rand = Math.random, defaults = ROAMER_DEFAULTS } = {}) {
    this.rand = typeof rand === 'function' ? rand : Math.random;
    this.defaults = { ...ROAMER_DEFAULTS, ...(defaults ?? {}) };
    this.timers = {};
    this.spawned = 0;
    this.despawned = 0;
    this.skipped = 0;
  }

  /** 지역에 처음 들어갔을 때 유예 타이머를 세팅한다 */
  enter(regionId) {
    const key = String(regionId ?? '');
    if (!key) return 0;
    if (!Number.isFinite(this.timers[key])) this.timers[key] = num(this.defaults.grace, 2.5);
    return this.timers[key];
  }

  reset() {
    this.timers = {};
    this.spawned = 0;
    this.despawned = 0;
    this.skipped = 0;
  }

  /** { spawned: enemy|null, despawned: number, region: roster|null } */
  /** 지역 id → 편성표. 매 프레임 객체를 새로 만들지 않도록 캐시한다(계약 §4.62). */
  _rosterFor(regionId) {
    const key = String(regionId ?? '');
    if (!this._rosterCache) this._rosterCache = new Map();
    if (!this._rosterCache.has(key)) this._rosterCache.set(key, roamerRoster(key));
    return this._rosterCache.get(key);
  }

  update(dt, ctx = {}) {
    const d = Math.max(0, Math.min(0.25, num(dt)));
    const enemies = ctx.enemies ?? [];
    const position = ctx.position ?? null;
    const regionId = String(ctx.regionId ?? '');
    const out = { spawned: null, despawned: 0, region: null };

    // 1) 지역 이탈 정리 — 살아 있는 모든 로밍 몬스터를 검사한다(지역이 바뀌어도 정리된다)
    if (position && typeof ctx.despawn === 'function') {
      for (const enemy of enemies) {
        if (!enemy?.alive || !isRoamer(enemy)) continue;
        const roster = this._rosterFor(enemy.regionId);
        if (!shouldDespawn(enemy, position, roster)) continue;
        ctx.despawn(enemy);
        out.despawned += 1;
      }
      this.despawned += out.despawned;
    }

    // 2) 스폰 — 플레이어가 지역 안에 있을 때만
    const roster = roamerRoster(regionId);
    out.region = roster;
    if (!roster) return out;
    if (ctx.phase === 'gameover' || (ctx.phase === 'prep' && !this.defaults.spawnInPrep)) return out;
    if (typeof ctx.spawn !== 'function') return out;

    const key = roster.id;
    this.enter(key);
    const alive = countRoamers(enemies, key);
    const total = countRoamers(enemies);
    const cap = Math.floor(num(this.defaults.totalCap, 80));
    if (alive >= roster.maxAlive || total >= cap) {
      this.timers[key] = Math.min(this.timers[key], roster.interval * 0.5);
      this.skipped += 1;
      return out;
    }

    this.timers[key] = num(this.timers[key]) - d;
    if (this.timers[key] > 0) return out;
    this.timers[key] = roster.interval;

    const type = pickRegionMonster(roster.id, this.rand);
    if (!type) return out;
    const point = roamerSpawnPoint(this.rand, position, roster);
    const elite = num(this.rand()) < roster.elite;
    const enemy = ctx.spawn({
      regionId: roster.id,
      roster,
      typeId: type.id,
      type,
      x: point.x,
      z: point.z,
      elite,
      wave: roster.power
    });
    if (enemy) {
      this.spawned += 1;
      out.spawned = enemy;
    }
    return out;
  }
}

export { REGION_MONSTERS, regionMonsterRoster, pickRegionMonster };
export default RegionSpawner;

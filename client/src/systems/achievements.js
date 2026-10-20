// 업적/통계 시스템 — 순수 로직 모듈. THREE 를 import 하지 않는다 (헤드리스 테스트 대상).
// 계약 §4.11: track(누적) / set(절대값) / list() / progress() / title() / toJSON·fromJSON·reset.
// 통계 키는 data.js 의 STAT_LABELS 에 존재하는 것만 사용한다.

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENT_BY_STAT,
  ACHIEVEMENT_CATEGORIES,
  STAT_LABELS,
  TITLE_LIST
} from '../data.js';

/** 유한한 숫자만 통과시키고 그 외에는 0 으로 본다. */
function num(value) {
  const v = Number(value);
  return Number.isFinite(v) ? v : 0;
}

export class AchievementSystem {
  constructor({ stats, onUnlock } = {}) {
    /** @type {Record<string, number>} 누적 통계 값 */ this.values = {};
    /** @type {Set<string>} 해금된 업적 id */ this.unlocked = new Set();
    /** @type {((achievement: object) => void) | null} 해금 콜백 (업적당 1회) */
    this.onUnlock = typeof onUnlock === 'function' ? onUnlock : null;
    if (stats && typeof stats === 'object') {
      // 외부 통계 저장소(또는 초기값 객체)를 주입받으면 초기값으로 흡수한다.
      const src = stats.values && typeof stats.values === 'object' ? stats.values : stats;
      for (const [key, value] of Object.entries(src)) {
        if (key in STAT_LABELS && Number.isFinite(Number(value))) this.values[key] = num(value);
      }
      if (stats.unlocked instanceof Set) for (const id of stats.unlocked) this.unlocked.add(id);
    }
  }

  /** 통계 키가 유효한지 (STAT_LABELS 기준) */
  static isValidStat(stat) {
    return typeof stat === 'string' && stat in STAT_LABELS;
  }

  /** 현재 값 (없으면 0) */
  get(stat) {
    return num(this.values[stat]);
  }

  /** 누적. amount 는 유한수여야 하며 NaN/문자열은 무시한다. 반환: 현재 값 */
  track(stat, amount = 1) {
    if (!AchievementSystem.isValidStat(stat)) return this.get(stat);
    const add = num(amount);
    if (add === 0) return this.get(stat);
    this.values[stat] = this.get(stat) + add;
    this._evaluate(stat);
    return this.values[stat];
  }

  /** 절대값 설정 (예: 최고 웨이브, 보유 유물 수, 광물 종류 수) */
  set(stat, value) {
    if (stat && typeof stat === 'object' && value === undefined) {
      for (const [key, v] of Object.entries(stat)) this.set(key, v);
      return undefined;
    }
    if (!AchievementSystem.isValidStat(stat)) return this.get(stat);
    this.values[stat] = num(value);
    this._evaluate(stat);
    return this.values[stat];
  }

  /** 해당 통계로 달성한 업적을 해금한다. onUnlock 은 업적당 정확히 1회만 호출된다. */
  _evaluate(stat) {
    const list = ACHIEVEMENT_BY_STAT[stat];
    if (!list || list.length === 0) return;
    const value = this.get(stat);
    for (const ach of list) {
      if (this.unlocked.has(ach.id)) continue;
      if (value >= ach.target) {
        this.unlocked.add(ach.id);
        this.onUnlock?.(ach);
      }
    }
  }

  /** 모든 업적 + 진행도(0..1) */
  list() {
    return ACHIEVEMENTS.map((ach) => {
      const value = this.get(ach.stat);
      const target = ach.target || 1;
      const progress = Math.max(0, Math.min(1, value / target));
      return {
        id: ach.id,
        category: ach.category,
        name: ach.name,
        desc: ach.desc,
        stat: ach.stat,
        target: ach.target,
        tier: ach.tier,
        value,
        progress,
        unlocked: this.unlocked.has(ach.id)
      };
    });
  }

  /** { unlocked, total, ratio, byCategory } */
  progress() {
    const total = ACHIEVEMENTS.length;
    const unlocked = this.unlocked.size;
    const byCategory = {};
    for (const cat of ACHIEVEMENT_CATEGORIES) byCategory[cat.id] = { unlocked: 0, total: 0, ratio: 0 };
    for (const ach of ACHIEVEMENTS) {
      const bucket = (byCategory[ach.category] ||= { unlocked: 0, total: 0, ratio: 0 });
      bucket.total++;
      if (this.unlocked.has(ach.id)) bucket.unlocked++;
    }
    for (const bucket of Object.values(byCategory)) {
      bucket.ratio = bucket.total > 0 ? bucket.unlocked / bucket.total : 0;
    }
    return { unlocked, total, ratio: total > 0 ? unlocked / total : 0, byCategory };
  }

  /** TITLE_LIST 중 조건을 만족한 가장 높은(목록상 마지막) 칭호. 없으면 null */
  title() {
    let result = null;
    for (const title of TITLE_LIST) {
      const cond = title.condition;
      if (!cond || !AchievementSystem.isValidStat(cond.stat)) continue;
      if (this.get(cond.stat) >= num(cond.target)) result = { id: title.id, name: title.name, desc: title.desc };
    }
    return result;
  }

  /** 해금된 업적만 */
  unlockedList() {
    return this.list().filter((a) => a.unlocked);
  }

  has(achId) {
    return this.unlocked.has(achId);
  }

  toJSON() {
    return { values: { ...this.values }, unlocked: [...this.unlocked] };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? o : {};
    this.values = {};
    this.unlocked = new Set();
    const values = src.values && typeof src.values === 'object' ? src.values : src;
    for (const [key, value] of Object.entries(values)) {
      if (!(key in STAT_LABELS)) continue;
      if (!Number.isFinite(Number(value))) continue;
      this.values[key] = num(value);
    }
    if (Array.isArray(src.unlocked)) {
      for (const id of src.unlocked) if (ACHIEVEMENT_BY_ID[id]) this.unlocked.add(id);
    }
    // 저장값이 목표를 넘겼는데 해금 목록이 비어 있는 경우(구버전 세이브)를 조용히 보정한다.
    for (const ach of ACHIEVEMENTS) {
      if (!this.unlocked.has(ach.id) && this.get(ach.stat) >= ach.target) this.unlocked.add(ach.id);
    }
    return this;
  }

  reset() {
    this.values = {};
    this.unlocked = new Set();
    return this;
  }
}

export default AchievementSystem;

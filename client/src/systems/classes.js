// 전직 시스템 (계약 §4.20) — 직업 선택 · 단계(1~3차) · 무기 잠금 · 패시브.
//
// 규칙은 `data.js` 의 CLASSES / CLASS_STAGES / CLASS_RULES / weaponLock() 하나만 본다.
// 이 모듈은 THREE·DOM 을 쓰지 않는다(헤드리스 검증 대상).
import {
  CLASSES,
  WEAPON_FAMILIES,
  CLASS_RULES,
  CLASS_STAGES,
  classById,
  classModifiers,
  classStageInfo,
  weaponLock
} from '../data.js';

function num(v, d = 0) {
  return Number.isFinite(v) ? Number(v) : d;
}

export class ClassSystem {
  /**
   * @param {{ game?: any, state?: { classId?: string, stage?: number } | null }} opts
   */
  constructor({ game = null, state = null } = {}) {
    this.game = game;
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
    this.classId = 'novice';
    this.stage = 0;
    this.history = [];
    if (state) this.load(state);
  }

  /* ── 조회 ───────────────────────────────────────────── */

  /** 현재 직업 정의 */
  get def() {
    return classById(this.classId);
  }

  /** 현재 단계 정의 */
  get stageInfo() {
    return classStageInfo(this.stage);
  }

  get isNovice() {
    return !this.def.family;
  }

  /** '🔮 마법사 · 2차' 같은 표시용 문자열 */
  get label() {
    if (this.isNovice) return `${this.def.glyph} ${this.def.name}`;
    return `${this.def.glyph} ${this.def.name} · ${this.stageInfo.short}`;
  }

  /** HUD·패널용 요약 */
  info() {
    const mods = this.modifiers;
    return {
      classId: this.classId,
      name: this.def.name,
      glyph: this.def.glyph,
      family: this.def.family,
      familyName: this.def.family ? WEAPON_FAMILIES.find((f) => f.id === this.def.family)?.name ?? this.def.family : '공용',
      stage: this.stage,
      stageName: this.stageInfo.name,
      stageShort: this.stageInfo.short,
      maxTier: this.stageInfo.maxTier,
      label: this.label,
      nextStage: this.nextStageRequirement(),
      modifiers: mods
    };
  }

  /** 직업 패시브(단계 배율 반영) */
  get modifiers() {
    return classModifiers(this.classId, this.stage);
  }

  /** 무기 피해 배율 (1.0 = 그대로) */
  get weaponDamageMult() {
    return num(this.modifiers.weaponDamage, 1);
  }

  canUse(weaponId) {
    return !this.lockOf(weaponId).locked;
  }

  /** 무기 잠금 정보 — { locked, reason, kind, tier, family } */
  lockOf(weaponId) {
    return weaponLock(weaponId, this.classId, this.stage);
  }

  /** 사용 가능한 무기만 남긴다 */
  filterUsable(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.filter((w) => this.canUse(w?.id ?? w));
  }

  /** 잠긴 무기 수 (직업별 비교용) */
  lockedCount(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.filter((w) => !this.canUse(w?.id ?? w)).length;
  }

  /* ── 전직 ───────────────────────────────────────────── */

  /** 다음 단계 요구 조건 — 없으면 null */
  nextStageRequirement() {
    const next = this.stage + 1;
    if (next > CLASS_RULES.maxStage) return null;
    if (next === 2) return { stage: 2, name: classStageInfo(2).name, wave: CLASS_RULES.secondWave, cost: CLASS_RULES.secondCost };
    if (next === 3) return { stage: 3, name: classStageInfo(3).name, wave: CLASS_RULES.thirdWave, cost: CLASS_RULES.thirdCost };
    return { stage: 1, name: classStageInfo(1).name, wave: CLASS_RULES.firstWave, cost: 0 };
  }

  /**
   * 직업을 고르거나 바꿀 수 있는지 (골드·웨이브는 호출자가 넘긴다).
   * @returns {{ok:boolean, error:string, cost:number, isChange:boolean}}
   */
  canAdvanceTo(classId, { wave = 0, gold = 0 } = {}) {
    const target = classById(classId);
    if (!target || target.id === 'novice') {
      return { ok: false, error: '전직할 직업을 고르세요', cost: 0, isChange: false };
    }
    const isChange = Boolean(this.def.family) && target.id !== this.classId;
    const w = num(wave, 0);
    const g = num(gold, 0);

    if (this.isNovice) {
      if (w < CLASS_RULES.firstWave) {
        return { ok: false, error: `웨이브 ${CLASS_RULES.firstWave} 부터 전직할 수 있습니다 (현재 ${w})`, cost: 0, isChange };
      }
      return { ok: true, error: '', cost: 0, isChange };
    }
    if (!isChange) {
      return { ok: false, error: `이미 ${target.name} 입니다`, cost: 0, isChange };
    }
    if (w < CLASS_RULES.respecWave) {
      return { ok: false, error: `다른 직업으로 바꾸려면 웨이브 ${CLASS_RULES.respecWave} 이상 (현재 ${w})`, cost: 0, isChange };
    }
    if (g < CLASS_RULES.respecCost) {
      return { ok: false, error: `재전직 비용 ${CLASS_RULES.respecCost} 골드가 필요합니다 (보유 ${Math.floor(g)})`, cost: CLASS_RULES.respecCost, isChange };
    }
    return { ok: true, error: '', cost: CLASS_RULES.respecCost, isChange };
  }

  /**
   * 전직 실행 — 첫 전직은 단계 1, 다른 직업으로 바꾸면 단계 1로 초기화된다.
   * @returns {{ok:boolean, error?:string, spent?:number, refund?:string[]}}
   */
  advance(classId, { wave = 0, gold = 0, spend = null, free = false } = {}) {
    const check = this.canAdvanceTo(classId, { wave, gold });
    if (!check.ok) return { ok: false, error: check.error };
    const target = classById(classId);
    let spent = 0;
    if (check.cost > 0 && !free) {
      const paid = typeof spend === 'function' ? spend(check.cost) : true;
      if (!paid) return { ok: false, error: `골드가 부족합니다 — ${check.cost} 필요` };
      spent = check.cost;
    }
    const before = { classId: this.classId, stage: this.stage };
    this.classId = target.id;
    this.stage = 1;
    this.history.push({ ...before, at: Date.now() });
    if (this.history.length > 20) this.history.shift();
    this.emit('advance', { classId: target.id, stage: this.stage, before, spent, isChange: check.isChange });
    return { ok: true, spent, before };
  }

  /** 2차·3차 전직(같은 직업 승급) */
  promote({ wave = 0, gold = 0, spend = null, free = false } = {}) {
    if (this.isNovice) return { ok: false, error: '먼저 직업을 고르세요' };
    const req = this.nextStageRequirement();
    if (!req) return { ok: false, error: '이미 최종 단계입니다' };
    const w = num(wave, 0);
    const g = num(gold, 0);
    if (w < req.wave) return { ok: false, error: `웨이브 ${req.wave} 부터 ${req.name}이 가능합니다 (현재 ${w})` };
    if (g < req.cost) return { ok: false, error: `${req.name} 비용 ${req.cost} 골드가 필요합니다 (보유 ${Math.floor(g)})` };
    let spent = 0;
    if (req.cost > 0 && !free) {
      const paid = typeof spend === 'function' ? spend(req.cost) : true;
      if (!paid) return { ok: false, error: `골드가 부족합니다 — ${req.cost} 필요` };
      spent = req.cost;
    }
    const before = this.stage;
    this.stage = req.stage;
    this.emit('promote', { classId: this.classId, stage: this.stage, before, spent });
    return { ok: true, spent, before };
  }

  /** 직업·단계 초기화(디버그/새 게임) */
  reset({ silent = false } = {}) {
    const before = { classId: this.classId, stage: this.stage };
    this.classId = 'novice';
    this.stage = 0;
    if (!silent) this.emit('reset', before);
    return before;
  }

  /* ── 저장 ───────────────────────────────────────────── */

  serialize() {
    return { classId: this.classId, stage: this.stage };
  }

  toJSON() {
    return this.serialize();
  }

  load(state = {}) {
    const id = String(state?.classId ?? 'novice');
    const def = classById(id);
    this.classId = def.id;
    const rawStage = Math.floor(num(state?.stage, 1));
    // 직업이 있으면 최소 1차, 초심자는 0차
    this.stage = def.family ? Math.max(1, Math.min(CLASS_RULES.maxStage, rawStage)) : 0;
    return this.serialize();
  }

  fromJSON(state) {
    return this.load(state ?? {});
  }

  /* ── 이벤트 ─────────────────────────────────────────── */

  on(event, cb) {
    if (typeof cb !== 'function') return () => {};
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    this._listeners.get(event)?.delete(cb);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (set) {
      for (const cb of [...set]) {
        try {
          cb(payload);
        } catch (err) {
          console.warn(`[classes] ${event} 처리 오류`, err);
        }
      }
    }
    return payload;
  }

  dispose() {
    this._listeners.clear();
  }
}

/** 직업 목록(초심자 포함)과 규칙을 그대로 노출 — UI 편의 */
export { CLASSES, CLASS_RULES, CLASS_STAGES };

export default ClassSystem;

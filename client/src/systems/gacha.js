// 가챠 시스템 — 순수 로직 모듈. THREE 를 import 하지 않는다 (헤드리스 테스트 대상).
// 계약 §4.10: pull(times) / canPull(times) / odds() / makeSpell(gradeId?, elementId?).
// 모든 난수는 주입된 rng 에서만 뽑는다 (Math.random 금지).

import { SPELL_GRADES, SPELL_ELEMENTS, RELIC_STAVES, GACHA_COST } from '../data.js';
import { createRNG } from '../utils/rng.js';

// 원소 status → 투사체 behavior (계약 §4.6 의 behavior 집합)
const BEHAVIOR_BY_STATUS = {
  burn: 'projectile',
  slow: 'beam',
  stun: 'chain',
  knockback: 'area',
  haste: 'projectile',
  cleanse: 'beam',
  heal: 'projectile',
  drain: 'homing',
  poison: 'area',
  pierce: 'beam',
  regen: 'projectile',
  armor: 'projectile',
  lifesteal: 'homing',
  erase: 'beam',
  smite: 'beam',
  random: 'area',
  reflect: 'projectile',
  chain: 'chain',
  summon: 'homing'
};

const SPEED_BY_BEHAVIOR = { projectile: 46, beam: 140, chain: 62, area: 26, homing: 32 };
const RADIUS_BY_BEHAVIOR = { projectile: 1.1, beam: 0.75, chain: 2.1, area: 4.6, homing: 1.5 };

// 등급별 이름 접미사 (낮은 등급 → 높은 등급 순으로 거창해진다)
const NAME_NOUNS = {
  common: ['화살', '구체', '파편', '탄환'],
  uncommon: ['광선', '창', '파동', '충격'],
  rare: ['폭풍', '작렬', '분노', '파열'],
  epic: ['재앙', '파멸', '성역', '대폭발'],
  legendary: ['군주', '패왕', '종말', '천벌'],
  mythic: ['창세', '심판', '세계수', '별의 종말']
};

const AUDIO_BY_GRADE = {
  common: 'gachaCommon',
  uncommon: 'gachaRare',
  rare: 'gachaRare',
  epic: 'gachaEpic',
  legendary: 'gachaLegend',
  mythic: 'gachaLegend',
  relic: 'gachaRelic'
};

const GRADE_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, relic: 6 };

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

export class GachaSystem {
  constructor({ rng, stats, economy, audio } = {}) {
    this.rng = rng ?? createRNG('gacha');
    this.stats = stats ?? null;
    this.economy = economy ?? null;
    this.audio = audio ?? null;
    /** @type {Set<string>} 보유 유물 id */ this.relics = new Set();
    /** @type {object[]} 뽑기 이력 (최근 1000개) */ this.history = [];
    this.pulls = 0;
    this._serial = 0;
  }

  // ── 확률 ────────────────────────────────────────────────────────────────
  /** 등급별 확률(%). 합계는 정확히 100. */
  odds() {
    const total = SPELL_GRADES.reduce((s, g) => s + Math.max(0, Number(g.weight) || 0), 0) || 1;
    const out = SPELL_GRADES.map((g) => ({
      grade: g.id,
      id: g.id,
      name: g.name,
      weight: g.weight,
      chance: round4((Math.max(0, Number(g.weight) || 0) / total) * 100),
      mult: g.mult,
      color: g.color,
      cutscene: g.cutscene
    }));
    // 부동소수점 잔차는 가장 확률이 큰 등급에 흡수시켜 합계를 100 으로 맞춘다.
    const sum = out.reduce((s, o) => s + o.chance, 0);
    const residual = round4(100 - sum);
    if (residual !== 0 && out.length > 0) {
      let idx = 0;
      for (let i = 1; i < out.length; i++) if (out[i].chance > out[idx].chance) idx = i;
      out[idx].chance = round4(out[idx].chance + residual);
    }
    return out;
  }

  /** 등급 id → 확률(%) */
  chanceOf(gradeId) {
    return this.odds().find((o) => o.grade === gradeId)?.chance ?? 0;
  }

  /** 주입된 rng 로 가중 등급을 뽑는다 (유물 = 0.01%). */
  rollGrade() {
    const total = SPELL_GRADES.reduce((s, g) => s + Math.max(0, Number(g.weight) || 0), 0);
    if (total <= 0) return SPELL_GRADES[0];
    let roll = this.rng.next() * total;
    for (const g of SPELL_GRADES) {
      roll -= Math.max(0, Number(g.weight) || 0);
      if (roll <= 0) return g;
    }
    return SPELL_GRADES[SPELL_GRADES.length - 1];
  }

  rollElement() {
    return this.rng.pick ? this.rng.pick(SPELL_ELEMENTS) : SPELL_ELEMENTS[Math.floor(this.rng.next() * SPELL_ELEMENTS.length)];
  }

  // ── 마법 생성 ───────────────────────────────────────────────────────────
  /** 등급/속성을 지정(또는 rng 로 추첨)해 결정적으로 마법을 만든다. 유물 등급은 RELIC_STAVES 항목을 돌려준다. */
  makeSpell(gradeId, elementId) {
    const grade = (gradeId && SPELL_GRADES.find((g) => g.id === gradeId)) || this.rollGrade();
    const element = (elementId && SPELL_ELEMENTS.find((e) => e.id === elementId)) || this.rollElement() || SPELL_ELEMENTS[0];
    if (grade.id === 'relic') return this._makeRelicSpell(elementId, grade);
    return this._makeElementSpell(grade, element);
  }

  _makeElementSpell(grade, element) {
    const status = element.status ?? 'plain';
    const behavior = BEHAVIOR_BY_STATUS[status] ?? 'projectile';
    const damage = Math.round(20 * grade.mult * (0.9 + 0.2 * this.rng.next()) * 100) / 100;
    const nouns = NAME_NOUNS[grade.id] ?? NAME_NOUNS.common;
    const noun = this.rng.pick ? this.rng.pick(nouns) : nouns[Math.floor(this.rng.next() * nouns.length)];
    const index = Math.max(0, SPELL_GRADES.indexOf(grade));
    return {
      id: `sp_${element.id}_${grade.id}_${this._serial++}`,
      name: this._nameFor(grade, element, noun),
      grade: grade.id,
      gradeName: grade.name,
      mult: grade.mult,
      element: element.id,
      elementName: element.name,
      status,
      behavior,
      damage,
      mana: Math.round(10 * grade.mult),
      speed: SPEED_BY_BEHAVIOR[behavior] ?? 46,
      cooldown: Math.round((0.6 + index * 0.15) * 100) / 100,
      radius: Math.round((RADIUS_BY_BEHAVIOR[behavior] ?? 1.2) * (0.9 + grade.mult * 0.05) * 100) / 100,
      range: 60,
      color: element.color,
      glow: grade.glow,
      cutscene: grade.cutscene,
      desc: `${element.name} 속성 ${grade.name} 마법 — ${element.desc ?? ''}`.trim(),
      relic: null
    };
  }

  _nameFor(grade, element, noun) {
    if (grade.id === 'legendary') return `위대한 ${element.name}의 ${noun}`;
    if (grade.id === 'mythic') return `신화의 ${element.name} ${noun}`;
    return `${element.name}의 ${noun}`;
  }

  /** 유물 등급 → 대응하는 RELIC_STAVES 항목(스킬 포함)을 그대로 마법 형태로 돌려준다. */
  _makeRelicSpell(elementId, grade) {
    const byElement = elementId ? RELIC_STAVES.find((r) => r.element === elementId) : null;
    const relic = byElement
      ? byElement
      : elementId
        ? RELIC_STAVES[0]
        : (this.rng.pick ? this.rng.pick(RELIC_STAVES) : RELIC_STAVES[0]) ?? RELIC_STAVES[0];
    const element = SPELL_ELEMENTS.find((e) => e.id === relic.element) ?? SPELL_ELEMENTS[0];
    const status = element?.status ?? 'plain';
    const behavior = BEHAVIOR_BY_STATUS[status] ?? 'beam';
    const damage = Math.round(20 * grade.mult * (0.9 + 0.2 * this.rng.next()) * 100) / 100;
    return {
      ...relic,
      id: relic.id,
      grade: 'relic',
      gradeName: grade.name,
      mult: grade.mult,
      status,
      behavior,
      damage,
      mana: Math.round(10 * grade.mult),
      speed: SPEED_BY_BEHAVIOR[behavior] ?? 60,
      cooldown: Math.round((0.6 + SPELL_GRADES.indexOf(grade) * 0.15) * 100) / 100,
      radius: RADIUS_BY_BEHAVIOR[behavior] ?? 1.2,
      range: 60,
      color: relic.color ?? element?.color,
      glow: grade.glow,
      cutscene: grade.cutscene,
      relic: relic.id,
      relicId: relic.id,
      relicSpell: true
    };
  }

  // ── 뽑기 ────────────────────────────────────────────────────────────────
  /** times 회 뽑기 비용 (10연차는 할인) */
  costFor(times = 1) {
    const n = Math.max(1, Math.floor(Number(times) || 1));
    const singles = Math.max(0, Number(GACHA_COST.single) || 0);
    const tens = Math.max(0, Number(GACHA_COST.ten) || 0);
    return Math.floor(n / 10) * tens + (n % 10) * singles;
  }

  /** 골드가 충분한가 (economy 가 없으면 true) */
  canPull(times = 1) {
    const cost = this.costFor(times);
    if (cost <= 0) return true;
    if (!this.economy || typeof this.economy.canAfford !== 'function') return true;
    return this.economy.canAfford({ gold: cost });
  }

  /** 뽑기 실행. Economy 를 통해 골드를 차감하고 통계를 기록한다. */
  pull(times = 1) {
    const n = Math.max(1, Math.floor(Number(times) || 1));
    const cost = this.costFor(n);
    if (!this.canPull(n)) {
      this.audio?.play?.('error');
      return { ok: false, reason: '골드가 부족합니다', results: [], spent: 0 };
    }
    if (cost > 0 && this.economy && typeof this.economy.spend === 'function') {
      if (!this.economy.spend({ gold: cost })) {
        this.audio?.play?.('error');
        return { ok: false, reason: '골드가 부족합니다', results: [], spent: 0 };
      }
    }

    const results = [];
    let best = null;
    for (let i = 0; i < n; i++) {
      const grade = this.rollGrade();
      let spell;
      if (grade.id === 'relic') {
        const relic = this.rng.pick ? this.rng.pick(RELIC_STAVES) : RELIC_STAVES[0];
        spell = this.makeSpell('relic', relic?.element);
      } else {
        spell = this.makeSpell(grade.id);
      }
      results.push(spell);
      if (!best || (GRADE_RANK[spell.grade] ?? 0) > (GRADE_RANK[best.grade] ?? 0)) best = spell;
      if (spell.relic) this.relics.add(spell.relic);
      if ((GRADE_RANK[spell.grade] ?? 0) >= GRADE_RANK.epic) this.stats?.track?.('epicSpells', 1);
      this.history.push(spell);
    }
    if (this.history.length > 1000) this.history.splice(0, this.history.length - 1000);

    this.pulls += n;
    this.stats?.track?.('gachaPulls', n);
    this.stats?.track?.('goldSpent', cost);
    this.stats?.set?.('relicsOwned', this.relics.size);
    if (best) this.audio?.play?.(AUDIO_BY_GRADE[best.grade] ?? 'gachaCommon');

    return { ok: true, reason: null, results, spent: cost, best };
  }

  /** 보유 유물 수 */
  get relicCount() {
    return this.relics.size;
  }
}

export default GachaSystem;

// 마법 시스템 — 최대 6개 습득, 시전(마나/쿨다운), 유물 스킬(시간정지·창세).
// 계약 §4.10: cast({origin,direction,player,enemies,turrets}), add/select/list/update/useSkill.

import * as THREE from 'three';
import { RELIC_STAVES } from '../data.js';

export const MAX_KNOWN_SPELLS = 6;

function num(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function asVec3(value, fallback) {
  if (value && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z))) {
    return value.clone ? value.clone() : new THREE.Vector3(Number(value.x), Number(value.y), Number(value.z));
  }
  return fallback;
}

function isRareGrade(spell) {
  const grade = spell?.grade;
  return grade === 'epic' || grade === 'legendary' || grade === 'mythic' || grade === 'relic';
}

export class SpellSystem {
  constructor({ scene, projectiles, audio, stats, economy, rng, onSkill, waves, camera } = {}) {
    this.scene = scene ?? null;
    this.projectiles = projectiles ?? null;
    this.audio = audio ?? null;
    this.stats = stats ?? null;
    this.economy = economy ?? null;
    this.rng = rng ?? null;
    this.waves = waves ?? null;
    this.camera = camera ?? null;
    /** 스킬 연출 훅: ({ id, phase, duration, color, killed }) => void */
    this.onSkill = typeof onSkill === 'function' ? onSkill : null;
    /** @type {object[]} */ this.spells = [];
    /** @type {number[]} */ this.cooldowns = [];
    this.selected = 0;
    /** @type {Record<string, number>} */ this.skillCooldowns = {};
    /** @type {Set<string>} */ this.relics = new Set();
    this.spellsCast = 0;
    this.spellDamage = 0;
    this.timeStopActive = false;
    this._timeStop = null;
    this._restoreScale = 1;
  }

  // ── 습득/선택 ──────────────────────────────────────────────────────────
  get spell() {
    return this.spells[this.selected] ?? null;
  }

  get cooldown() {
    return this.cooldowns[this.selected] ?? 0;
  }

  get count() {
    return this.spells.length;
  }

  get full() {
    return this.spells.length >= MAX_KNOWN_SPELLS;
  }

  /** 최대 6개. 유물 지팡이는 중복 습득하지 않는다. */
  add(spell) {
    if (!spell || typeof spell !== 'object') return false;
    if (spell.relic) {
      if (this.relics.has(spell.relic)) return false;
      this.relics.add(spell.relic);
      this.stats?.set?.('relicsOwned', this.relics.size);
    }
    if (this.spells.length >= MAX_KNOWN_SPELLS) return false;
    this.spells.push(spell);
    this.cooldowns.push(0);
    if (this.spells.length === 1) this.selected = 0;
    this.audio?.play?.('levelup');
    return true;
  }

  /** 유물 지팡이를 데이터에서 직접 습득한다(부여대 조합 결과 등). */
  addRelic(relicId) {
    const relic = RELIC_STAVES.find((r) => r.id === relicId) ?? null;
    if (!relic) return false;
    if (this.relics.has(relic.id)) return false;
    const spell = {
      ...relic,
      id: relic.id,
      grade: 'relic',
      damage: Math.round(20 * 8 * 1.1),
      mana: 60,
      speed: 60,
      cooldown: 2.4,
      behavior: 'beam',
      radius: 1.2,
      range: 60,
      relic: relic.id,
      relicId: relic.id,
      relicSpell: true
    };
    const ok = this.add(spell);
    if (!ok) this.relics.delete(relic.id);
    return ok;
  }

  select(index) {
    const idx = Math.floor(num(index, -1));
    if (!Number.isFinite(idx) || idx < 0 || idx >= this.spells.length) return false;
    this.selected = idx;
    return true;
  }

  selectNext(delta = 1) {
    if (this.spells.length === 0) return false;
    this.selected = (this.selected + delta + this.spells.length) % this.spells.length;
    return true;
  }

  list() {
    return this.spells.slice();
  }

  remove(index) {
    const idx = Math.floor(num(index, -1));
    if (idx < 0 || idx >= this.spells.length) return false;
    this.spells.splice(idx, 1);
    this.cooldowns.splice(idx, 1);
    this.selected = Math.max(0, Math.min(this.selected, this.spells.length - 1));
    return true;
  }

  // ── 시전 ───────────────────────────────────────────────────────────────
  cast({ origin, direction, player, enemies, turrets } = {}) {
    const spell = this.spell;
    if (!spell) return { ok: false, reason: '선택된 마법이 없습니다', spell: null };
    if ((this.cooldowns[this.selected] ?? 0) > 0) {
      return { ok: false, reason: '아직 쿨다운입니다', spell };
    }
    const mana = Math.max(0, num(spell.mana));
    if (player) {
      if (typeof player.spendMana === 'function') {
        if (!player.spendMana(mana)) return { ok: false, reason: '마나가 부족합니다', spell };
      } else if (Number.isFinite(Number(player.mana))) {
        if (Number(player.mana) < mana) return { ok: false, reason: '마나가 부족합니다', spell };
        player.mana = Number(player.mana) - mana;
      }
    }

    const fallbackOrigin = new THREE.Vector3();
    const o = asVec3(origin ?? player?.eyePosition, fallbackOrigin);
    const fallbackDir = new THREE.Vector3(0, 0, -1);
    const dir = asVec3(direction ?? player?.aimDirection, fallbackDir);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();

    this.cooldowns[this.selected] = Math.max(0, num(spell.cooldown));
    const baseDamage = Math.max(0, num(spell.damage));
    this.projectiles?.spawn?.({
      origin: o,
      direction: dir,
      speed: num(spell.speed, 40),
      damage: baseDamage,
      element: spell.element ?? 'arcane',
      behavior: spell.behavior ?? 'projectile',
      radius: num(spell.radius, 1.2),
      range: num(spell.range, 60),
      color: spell.color,
      owner: 'player',
      pierce: spell.status === 'pierce' ? 3 : 0,
      aoe: num(spell.aoe),
      onHit: (target, damage) => {
        const dealt = Number.isFinite(Number(damage)) ? Number(damage) : baseDamage;
        this.spellDamage += dealt;
        this.stats?.track?.('spellDamage', dealt);
      }
    });

    this.spellsCast += 1;
    this.stats?.track?.('spellsCast', 1);
    this.audio?.play?.(isRareGrade(spell) ? 'castRare' : 'cast');
    player?.playCast?.();
    return { ok: true, reason: null, spell, damage: baseDamage };
  }

  // ── 유물 스킬 (R) ──────────────────────────────────────────────────────
  _relicById(id) {
    return RELIC_STAVES.find((r) => r.id === id) ?? null;
  }

  /** 현재 습득한 유물 중 사용 가능한 것 */
  activeRelic() {
    const selected = this.spell;
    if (selected?.relic) {
      const relic = this._relicById(selected.relic);
      if (relic) return relic;
    }
    for (const spell of this.spells) {
      if (!spell?.relic) continue;
      const relic = this._relicById(spell.relic);
      if (relic) return relic;
    }
    for (const id of this.relics) {
      const relic = this._relicById(id);
      if (relic) return relic;
    }
    return null;
  }

  skillCooldownLeft(skillId) {
    return Math.max(0, num(this.skillCooldowns[skillId]));
  }

  useSkill({ player, enemies, turrets, waves, world } = {}) {
    const relic = this.activeRelic();
    if (!relic) return { ok: false, reason: '사용할 유물 스킬이 없습니다' };
    const skill = relic.skill;
    if (!skill) return { ok: false, reason: '이 유물에는 스킬이 없습니다' };
    const left = this.skillCooldownLeft(skill.id);
    if (left > 0) return { ok: false, reason: `쿨다운 ${Math.ceil(left)}초`, skill };

    const waveSystem = waves ?? this.waves ?? null;
    if (waveSystem) this.waves = waveSystem;

    if (skill.id === 'timeStop') {
      const duration = Math.max(0.5, num(skill.duration, 6));
      this._restoreScale = num(waveSystem?.timeScale, 1);
      if (waveSystem) waveSystem.timeScale = 0;
      this._timeStop = { t: duration, total: duration };
      this.timeStopActive = true;
      this.audio?.play?.('relic');
      this.onSkill?.({ id: 'timeStop', phase: 'start', duration, color: relic.color });
      this.skillCooldowns[skill.id] = Math.max(0, num(skill.cooldown));
      return { ok: true, reason: null, skill, duration };
    }

    if (skill.id === 'genesis') {
      const list = enemies ?? waveSystem?.enemies ?? [];
      let killed = 0;
      for (const enemy of list) {
        if (!enemy?.alive) continue;
        const overkill = Math.max(num(enemy.hp, 1), num(enemy.maxHp, 1)) + 1e7;
        const res = enemy.takeDamage?.(overkill, 'holy', 'player');
        if (res?.killed) killed += 1;
      }
      const base = world?.base ?? this.waves?.world?.base ?? null;
      if (base) {
        if (typeof base.heal === 'function') base.heal(num(base.maxHp, 4100) * 10);
        if (Number.isFinite(Number(base.maxHp))) base.hp = Number(base.maxHp);
        if (Number.isFinite(Number(base.maxShield))) base.shield = Number(base.maxShield);
      }
      player?.heal?.(num(player.maxHp, 100) * 10);
      this.audio?.play?.('victory');
      this.onSkill?.({ id: 'genesis', phase: 'start', killed, duration: num(skill.duration, 3), color: relic.color });
      this.skillCooldowns[skill.id] = Math.max(0, num(skill.cooldown));
      return { ok: true, reason: null, skill, killed };
    }

    return { ok: false, reason: '알 수 없는 스킬입니다', skill };
  }

  // ── 루프 ───────────────────────────────────────────────────────────────
  update(dt) {
    const step = Math.max(0, Math.min(num(dt), 0.5));
    if (step <= 0) return;
    for (let i = 0; i < this.cooldowns.length; i++) {
      if (this.cooldowns[i] > 0) this.cooldowns[i] = Math.max(0, this.cooldowns[i] - step);
    }
    for (const key of Object.keys(this.skillCooldowns)) {
      if (this.skillCooldowns[key] > 0) this.skillCooldowns[key] = Math.max(0, this.skillCooldowns[key] - step);
    }
    if (this._timeStop) {
      this._timeStop.t -= step;
      if (this._timeStop.t <= 0) {
        if (this.waves) this.waves.timeScale = this._restoreScale > 0 ? this._restoreScale : 1;
        this._timeStop = null;
        this.timeStopActive = false;
        this.onSkill?.({ id: 'timeStop', phase: 'end' });
      }
    }
  }

  /** 남은 시간정지 비율(0..1) — 화면 틴트용 */
  get timeStopRatio() {
    if (!this._timeStop || this._timeStop.total <= 0) return 0;
    return Math.max(0, Math.min(1, this._timeStop.t / this._timeStop.total));
  }

  // ── 저장 ───────────────────────────────────────────────────────────────
  toJSON() {
    return {
      spells: this.spells.map((s) => ({ ...s })),
      selected: this.selected,
      relics: [...this.relics],
      spellsCast: this.spellsCast,
      spellDamage: this.spellDamage,
      skillCooldowns: { ...this.skillCooldowns }
    };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? o : {};
    this.spells = Array.isArray(src.spells) ? src.spells.filter((s) => s && typeof s === 'object') : [];
    this.spells = this.spells.slice(0, MAX_KNOWN_SPELLS);
    this.cooldowns = this.spells.map(() => 0);
    this.selected = Math.max(0, Math.min(Math.floor(num(src.selected)), Math.max(0, this.spells.length - 1)));
    this.relics = new Set(Array.isArray(src.relics) ? src.relics : []);
    this.spellsCast = Math.max(0, num(src.spellsCast));
    this.spellDamage = Math.max(0, num(src.spellDamage));
    this.skillCooldowns = {};
    if (src.skillCooldowns && typeof src.skillCooldowns === 'object') {
      for (const [k, v] of Object.entries(src.skillCooldowns)) this.skillCooldowns[k] = Math.max(0, num(v));
    }
    return this;
  }
}

export default SpellSystem;

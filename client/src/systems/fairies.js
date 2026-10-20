// 요정(이스터에그) 시스템 — 조건 평가 + 등장 연출 + 패시브 + 도감.
// 계약 §4.12: found/crown, update(dt, ctx), spawn, check(ctx), codex(), toJSON/fromJSON.
// FAIRIES[].condition.type 을 stats 값/컨텍스트로 평가한다. HUD 에는 힌트만, 도감(Ctrl+H)은 히든.

import * as THREE from 'three';
import { FAIRIES } from '../data.js';

const FAIRY_BY_ID = Object.fromEntries(FAIRIES.map((f) => [f.id, f]));
const TRAIL_COUNT = 18;
const CHECK_INTERVAL = 0.5;
const FLY_DURATION = 3.0;

// 요정별 누적 패시브 (data.js reward.text 와 대응)
const FAIRY_PASSIVES = {
  aria: { manaRegen: 0.1 },
  sylph: { moveSpeed: 0.08 },
  gnome: { miningSpeed: 0.15 },
  undine: { healBonus: 0.1, baseShieldRegen: 0.05 },
  salamander: { fireDamage: 0.2 },
  titania: { healBonus: 0.1 },
  oberon: { manaRegen: 0.3 }
};

const CROWN_PASSIVE = { manaRegen: 0.3 };

// 공유 지오메트리 (요정은 최대 7개 + 연출용)
let CORE_GEO = null;
let HALO_GEO = null;
function coreGeometry() {
  return (CORE_GEO ??= new THREE.SphereGeometry(0.2, 8, 6));
}
function haloGeometry() {
  return (HALO_GEO ??= new THREE.SphereGeometry(0.4, 8, 6));
}

function num(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function asVec3(value) {
  if (value && Number.isFinite(Number(value.x))) return new THREE.Vector3(Number(value.x), Number(value.y), Number(value.z));
  return new THREE.Vector3();
}

export class FairySystem {
  constructor({ scene, world, audio, stats, rng, onFind, onReward, economy, waves, seed } = {}) {
    this.scene = scene ?? null;
    this.world = world ?? null;
    this.audio = audio ?? null;
    this.stats = stats ?? null;
    this.rng = rng ?? null;
    this.onFind = typeof onFind === 'function' ? onFind : null;
    /** 보상 금액 지급 콜백: (fairy, gold) => void */
    this.onReward = typeof onReward === 'function' ? onReward : null;
    this.economy = economy ?? null;
    this.waves = waves ?? null;
    this.seed = seed != null ? String(seed) : null;

    /** @type {Set<string>} */ this.found = new Set();
    this.crown = false;
    /** @type {object[]} */ this.active = [];
    this.time = 0;
    this.fairiesFound = 0;
    this._pending = new Set();
    this._checkTimer = 0;
    this._bossKillsAtReady = null;
    this._lastBossKills = 0;
  }

  get total() {
    return FAIRIES.length;
  }

  get foundCount() {
    return this.found.size;
  }

  get progress() {
    return { found: this.found.size, total: FAIRIES.length, ratio: FAIRIES.length > 0 ? this.found.size / FAIRIES.length : 0, crown: this.crown };
  }

  /** 획득한 요정들의 누적 패시브 */
  get modifiers() {
    const mod = { manaRegen: 0, moveSpeed: 0, miningSpeed: 0, fireDamage: 0, healBonus: 0, baseShieldRegen: 0 };
    for (const id of this.found) {
      const passives = FAIRY_PASSIVES[id];
      if (!passives) continue;
      for (const [key, value] of Object.entries(passives)) mod[key] = num(mod[key]) + value;
    }
    if (this.crown && !this.found.has('oberon')) {
      for (const [key, value] of Object.entries(CROWN_PASSIVE)) mod[key] = num(mod[key]) + value;
    }
    return mod;
  }

  // ── 조건 평가 ──────────────────────────────────────────────────────────
  _buildContext(ctx = {}) {
    const game = ctx.game ?? null;
    const waves = game?.waves ?? this.waves ?? null;
    const stats = this.stats;
    return {
      stats,
      wave: num(ctx.wave, num(waves?.wave)),
      bossKills: Number.isFinite(Number(ctx.bossKills)) ? Number(ctx.bossKills) : num(waves?.bossKills, num(stats?.get?.('bossKills'))),
      elementsKills: ctx.elementsKills ?? waves?.killsByElement ?? {},
      seed: ctx.seed ?? game?.seed ?? this.seed ?? null,
      towers: Number.isFinite(Number(ctx.towers)) ? Number(ctx.towers) : num(game?.turrets?.total?.(), game?.towers?.length ?? 0),
      player: ctx.player ?? game?.player ?? null
    };
  }

  _statValue(key) {
    const stats = this.stats;
    if (!stats) return 0;
    if (typeof stats.get === 'function') return num(stats.get(key));
    return num(stats.values?.[key]);
  }

  /**
   * 조건을 만족한 요정 id 목록을 돌려주고, 각각을 등장시킨다.
   * @returns {string[]}
   */
  check(ctx = {}) {
    const seed = ctx.seed != null ? String(ctx.seed) : this.seed != null ? String(this.seed) : '';
    if (seed === '42') this.stats?.set?.('seed42', 1);

    const bossKills = Number.isFinite(Number(ctx.bossKills)) ? Number(ctx.bossKills) : num(this.stats?.get?.('bossKills'));
    this._lastBossKills = bossKills;
    const elements = ctx.elementsKills ?? {};
    const triggered = [];

    for (const fairy of FAIRIES) {
      if (this.found.has(fairy.id) || this._pending.has(fairy.id)) continue;
      const condition = fairy.condition ?? {};
      let ok = false;
      switch (condition.type) {
        case 'seed':
          ok = seed !== '' && seed === String(condition.value);
          break;
        case 'noTurretWaves':
          ok = this._statValue('noTurretWaves') >= Math.max(1, num(condition.value, 1));
          break;
        case 'noDamageWaves':
          ok = this._statValue('noDamageWaves') >= Math.max(1, num(condition.value, 1));
          break;
        case 'mineralTypesMined':
          ok = this._statValue('mineralTypesMined') >= Math.max(1, num(condition.value, 1));
          break;
        case 'maxTurrets':
          ok = this._statValue('maxTurrets') >= Math.max(1, num(condition.value, 1));
          break;
        case 'elementKills': {
          const key = condition.element;
          const kills = num(elements?.[key], this._statValue(`elementKills_${key}`));
          ok = kills >= Math.max(1, num(condition.value, 1));
          break;
        }
        case 'crown': {
          if (this.found.size >= FAIRIES.length - 1) {
            if (this._bossKillsAtReady === null) this._bossKillsAtReady = bossKills;
            ok = bossKills > this._bossKillsAtReady;
          }
          break;
        }
        default:
          ok = false;
          break;
      }
      if (ok) triggered.push(fairy.id);
    }

    for (const id of triggered) this._trigger(id);
    return triggered;
  }

  _trigger(fairyId) {
    const fairy = FAIRY_BY_ID[fairyId];
    if (!fairy || this.found.has(fairyId) || this._pending.has(fairyId)) return null;
    this._pending.add(fairyId);
    return this.spawn(fairyId);
  }

  // ── 등장 연출 ──────────────────────────────────────────────────────────
  _spawnPosition() {
    const base = this.world?.base?.position ?? null;
    const angle = this.rng?.next ? this.rng.next() * Math.PI * 2 : 0;
    const radius = 6 + (this.rng?.next ? this.rng.next() * 4 : 0);
    const origin = base ?? new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(origin.x + Math.cos(angle) * radius, num(origin.y) + 2.2, origin.z + Math.sin(angle) * radius);
  }

  /** 요정 오브젝트(코어 + 후광 + 점광 + 파티클 트레일)를 만들어 날아오게 한다. */
  spawn(fairyId, position = null) {
    const fairy = FAIRY_BY_ID[fairyId];
    if (!fairy) return null;
    const group = new THREE.Group();
    group.name = `fairy:${fairy.id}`;
    const coreMat = new THREE.MeshBasicMaterial({ color: fairy.color });
    const haloMat = new THREE.MeshBasicMaterial({ color: fairy.color, transparent: true, opacity: 0.28, depthWrite: false });
    const core = new THREE.Mesh(coreGeometry(), coreMat);
    const halo = new THREE.Mesh(haloGeometry(), haloMat);
    const light = new THREE.PointLight(fairy.color, 1.6, 16);
    const positions = new Float32Array(TRAIL_COUNT * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const trailMat = new THREE.PointsMaterial({ color: fairy.color, size: 0.16, transparent: true, opacity: 0.75, depthWrite: false });
    const trail = new THREE.Points(trailGeo, trailMat);
    group.add(core, halo, light, trail);

    const start = position ? asVec3(position) : this._spawnPosition();
    group.position.copy(start);
    this.scene?.add?.(group);

    const obj = {
      id: fairy.id,
      fairy,
      group,
      core,
      halo,
      light,
      trail,
      positions,
      trailGeo,
      trailMat,
      coreMat,
      haloMat,
      from: start.clone(),
      life: 0,
      duration: FLY_DURATION,
      index: this.active.length
    };
    this.active.push(obj);
    this.audio?.play?.('fairy');
    return obj;
  }

  update(dt, ctx = {}) {
    const step = Math.max(0, Math.min(num(dt), 0.5));
    if (step <= 0) return;
    this.time += step;
    if (ctx.game?.seed != null) this.seed = String(ctx.game.seed);
    if (ctx.game?.waves && !this.waves) this.waves = ctx.game.waves;

    this._checkTimer -= step;
    if (this._checkTimer <= 0) {
      this._checkTimer = CHECK_INTERVAL;
      this.check(this._buildContext(ctx));
    }

    const target = ctx.player?.position ?? ctx.game?.player?.position ?? this.world?.base?.position ?? null;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const obj = this.active[i];
      obj.life += step;
      const pos = obj.group.position;
      let arrived = false;
      if (target) {
        const dx = num(target.x) - pos.x;
        const dz = num(target.z) - pos.z;
        const dist = Math.hypot(dx, dz);
        const speed = 8.5;
        if (dist > 0.6) {
          pos.x += (dx / dist) * speed * step;
          pos.z += (dz / dist) * speed * step;
        } else {
          arrived = true;
        }
        const targetY = num(target.y) + 1.7;
        pos.y += (targetY - pos.y) * Math.min(1, step * 3);
      }
      obj.core.position.y = Math.sin(this.time * 4 + obj.index) * 0.08;
      obj.halo.scale.setScalar(1 + Math.sin(this.time * 3 + obj.index) * 0.1);
      this._pushTrail(obj);
      if (arrived || obj.life >= obj.duration) this._finish(i);
    }
  }

  _pushTrail(obj) {
    const p = obj.group.position;
    const arr = obj.positions;
    for (let i = TRAIL_COUNT - 1; i > 0; i--) {
      arr[i * 3] = arr[(i - 1) * 3];
      arr[i * 3 + 1] = arr[(i - 1) * 3 + 1];
      arr[i * 3 + 2] = arr[(i - 1) * 3 + 2];
    }
    arr[0] = p.x;
    arr[1] = p.y;
    arr[2] = p.z;
    const attr = obj.trailGeo.getAttribute?.('position');
    if (attr) attr.needsUpdate = true;
  }

  _finish(index) {
    const obj = this.active[index];
    if (!obj) return;
    this.active.splice(index, 1);
    this.scene?.remove?.(obj.group);
    obj.trailGeo?.dispose?.();
    obj.trailMat?.dispose?.();
    obj.coreMat?.dispose?.();
    obj.haloMat?.dispose?.();

    this._pending.delete(obj.id);
    if (this.found.has(obj.id)) return;
    const fairy = obj.fairy;
    this.found.add(obj.id);
    this.fairiesFound += 1;
    this.stats?.track?.('fairiesFound', 1);
    const gold = Math.max(0, Math.round(num(fairy.reward?.gold)));
    if (this.onReward) this.onReward(fairy, gold);
    else if (gold > 0 && this.economy) {
      this.economy.addGold?.(gold);
      this.stats?.track?.('goldEarned', gold);
    }
    if (this.found.size >= FAIRIES.length - 1 && this._bossKillsAtReady === null) {
      this._bossKillsAtReady = this._lastBossKills;
    }
    if (this.found.size >= FAIRIES.length) {
      this.crown = true;
      this.stats?.set?.('fairyCrown', 1);
      this.audio?.play?.('victory');
    }
    this.onFind?.(fairy);
    return fairy;
  }

  /** 즉시 조우 처리 (연출 없이 — 세이브 복원/디버그용) */
  grant(fairyId) {
    const fairy = FAIRY_BY_ID[fairyId];
    if (!fairy || this.found.has(fairyId)) return false;
    this.found.add(fairyId);
    this.fairiesFound += 1;
    this.stats?.track?.('fairiesFound', 1);
    if (this.found.size >= FAIRIES.length) {
      this.crown = true;
      this.stats?.set?.('fairyCrown', 1);
    }
    this.onFind?.(fairy);
    return true;
  }

  // ── 도감 ───────────────────────────────────────────────────────────────
  /** 힌트는 항상, 정확한 조건은 조우한 뒤에만 공개한다. */
  codex() {
    return FAIRIES.map((fairy) => {
      const found = this.found.has(fairy.id);
      return {
        id: fairy.id,
        name: fairy.name,
        element: fairy.element,
        color: fairy.color,
        hint: fairy.hint,
        quote: fairy.quote,
        reward: fairy.reward,
        found,
        pending: this._pending.has(fairy.id),
        condition: found ? fairy.condition : null,
        desc: found ? fairy.condition?.desc ?? null : null
      };
    });
  }

  // ── 저장 ───────────────────────────────────────────────────────────────
  toJSON() {
    return { found: [...this.found], crown: this.crown, bossKillsAtReady: this._bossKillsAtReady };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? o : {};
    for (const obj of [...this.active]) {
      this.scene?.remove?.(obj.group);
      obj.trailGeo?.dispose?.();
      obj.trailMat?.dispose?.();
      obj.coreMat?.dispose?.();
      obj.haloMat?.dispose?.();
    }
    this.active.length = 0;
    this._pending.clear();
    this.found = new Set(Array.isArray(src.found) ? src.found.filter((id) => FAIRY_BY_ID[id]) : []);
    this.fairiesFound = this.found.size;
    this._bossKillsAtReady = Number.isFinite(Number(src.bossKillsAtReady)) ? Number(src.bossKillsAtReady) : null;
    this.crown = this.found.size >= FAIRIES.length || !!src.crown;
    return this;
  }

  reset() {
    for (const obj of [...this.active]) {
      this.scene?.remove?.(obj.group);
      obj.trailGeo?.dispose?.();
      obj.trailMat?.dispose?.();
      obj.coreMat?.dispose?.();
      obj.haloMat?.dispose?.();
    }
    this.active.length = 0;
    this.found = new Set();
    this._pending.clear();
    this.crown = false;
    this.fairiesFound = 0;
    this._bossKillsAtReady = null;
    this._lastBossKills = 0;
    this._checkTimer = 0;
    return this;
  }
}

export default FairySystem;

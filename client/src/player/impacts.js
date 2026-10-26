// 요새의 수호자 — 타격/스킬 임팩트 연출(ImpactFX).
// 계약: DOM/문서 접근 없음, Math.random() 금지(주입된 시드 RNG 사용), 외부 에셋 없음(전부 절차 생성).
//       스펙은 data.js 의 WEAPON_IMPACTS / ULTIMATE_IMPACTS / DREAM_TREE 만 참조한다.
//       꿈나무(비살상) 임팩트와 구원 연출은 화면 흔들림(shake)을 만들지 않는다.

import * as THREE from 'three';
import { WEAPON_IMPACTS, WEAPON_IMPACT_OVERRIDES, ULTIMATE_IMPACTS, DREAM_TREE, weaponById } from '../data.js';
import { elementColor } from './staff.js';
import { createRNG } from '../utils/rng.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const toVec = (p) => (p?.isVector3 ? p.clone() : new THREE.Vector3(num(p?.x), num(p?.y), num(p?.z)));

/** 종류별 파티클 기본 동작 */
const KIND_DEFAULTS = {
  burst: { speed: 3.4, spread: 0.5, life: 0.55, size: 0.17, gravity: -4.2, rise: 0.5, fade: 1 },
  spark: { speed: 5.6, spread: 0.35, life: 0.34, size: 0.11, gravity: -7.5, rise: 0.25, fade: 1 },
  shock: { speed: 6.6, spread: 0.95, life: 0.72, size: 0.27, gravity: -2.2, rise: 0.95, fade: 1 },
  arc: { speed: 5.2, spread: 1.1, life: 0.46, size: 0.15, gravity: -3.2, rise: 0.6, arc: Math.PI * 0.75 },
  petals: { speed: 1.5, spread: 1.25, life: 2.1, size: 0.2, gravity: -0.55, rise: 1.05, flutter: true },
  butterfly: { speed: 1.15, spread: 1.45, life: 2.8, size: 0.25, gravity: -0.22, rise: 1.3, flutter: true, wander: 0.75 },
  void: { speed: 3.1, spread: 1.7, life: 1.5, size: 0.21, gravity: 0, rise: -0.45, inward: 3.2 },
  holy: { speed: 7.2, spread: 0.6, life: 0.92, size: 0.23, gravity: 1.0, rise: 1.7, fade: 1 },
  // 가위가 물리는 순간 — 짧고 빠르고 밝은 파편
  snip: { speed: 8.6, spread: 0.7, life: 0.28, size: 0.11, gravity: -1.8, rise: 0.5, fade: 1 },
  // 총탄 — 작고 빠른 불티(충격 고리는 hit 에서 따로 그린다)
  bullet: { speed: 9.4, spread: 0.4, life: 0.22, size: 0.085, gravity: -5.5, rise: 0.18, fade: 1 },
  // 은하수 — 별가루가 천천히 흩날리며 떠오른다
  star: { speed: 2.4, spread: 1.3, life: 1.25, size: 0.17, gravity: 0.45, rise: 0.42, wander: 0.55, flutter: true }
};

const MAX_PARTICLES_PER_BURST = 200;
const MAX_BURSTS = 26;
const MAX_RINGS = 24;
const MAX_SPHERES = 3;

/** 파티클 묶음 — THREE.Points 하나를 재사용한다. */
class Burst {
  constructor() {
    this.capacity = MAX_PARTICLES_PER_BURST;
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = new Float32Array(this.capacity * 3);
    this.vel = new Float32Array(this.capacity * 3);
    this.life = new Float32Array(this.capacity);
    this.maxLife = new Float32Array(this.capacity);
    this.geometry = new THREE.BufferGeometry();
    this.attrPos = new THREE.BufferAttribute(this.positions, 3);
    this.attrCol = new THREE.BufferAttribute(this.colors, 3);
    this.geometry.setAttribute('position', this.attrPos);
    this.geometry.setAttribute('color', this.attrCol);
    this.material = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.count = 0;
    this.active = false;
    this.delay = 0;
    this.duration = 0;
    this.t = 0;
    this.gravity = 0;
    this.wander = 0;
    this.flutter = false;
    this.inward = 0;
    this.origin = new THREE.Vector3();
  }

  spawn(origin, opts = {}) {
    const cap = Math.min(this.capacity, Math.max(1, Math.round(num(opts.count, 10))));
    const rng = opts.rng;
    const color = new THREE.Color(num(opts.color, 0xffffff));
    const speed = num(opts.speed, 3);
    const spread = num(opts.spread, 0.5);
    const size = num(opts.size, 0.16);
    const life = num(opts.life, 0.6);
    const rise = num(opts.rise, 0.5);
    const jitter = num(opts.jitter, 0.35);
    const arc = opts.arc ?? null;

    this.origin.copy(origin);
    this.points.position.set(0, 0, 0);
    this.material.size = size;
    this.material.opacity = 1;
    this.gravity = num(opts.gravity, -4);
    this.wander = num(opts.wander, 0);
    this.flutter = !!opts.flutter;
    this.inward = num(opts.inward, 0);
    this.delay = Math.max(0, num(opts.delay, 0));
    this.t = 0;
    this.duration = 0;
    this.count = cap;
    this.active = true;

    for (let i = 0; i < cap; i += 1) {
      const i3 = i * 3;
      const theta = rng ? rng.range(0, Math.PI * 2) : (i / cap) * Math.PI * 2;
      const phi = rng ? Math.acos(rng.range(-1, 1)) : 0.5;
      const vary = rng ? rng.range(1 - jitter, 1 + jitter) : 1;
      let dirX = Math.sin(phi) * Math.cos(theta);
      let dirY = Math.cos(phi) * 0.7 + num(opts.upBias, 0.25);
      let dirZ = Math.sin(phi) * Math.sin(theta);
      if (arc !== null) {
        // 부채꼴(초승달 궤적) — YZ 평면 기준 호를 그린다
        const a = (i / Math.max(1, cap - 1)) * arc - arc / 2;
        dirX = Math.sin(a) * 0.35;
        dirY = Math.sin(a * 0.5) * 0.4;
        dirZ = Math.cos(a);
      }
      const sp = speed * vary;
      this.positions[i3] = num(origin.x) + (rng ? rng.range(-spread, spread) * 0.25 : 0);
      this.positions[i3 + 1] = num(origin.y) + (rng ? rng.range(0, spread * 0.4) : 0);
      this.positions[i3 + 2] = num(origin.z) + (rng ? rng.range(-spread, spread) * 0.25 : 0);
      this.vel[i3] = dirX * sp;
      this.vel[i3 + 1] = dirY * sp + rise * 0.5;
      this.vel[i3 + 2] = dirZ * sp;
      const l = life * (rng ? rng.range(0.75, 1.25) : 1);
      this.life[i] = l;
      this.maxLife[i] = l;
      const tint = rng ? rng.range(0.85, 1.15) : 1;
      this.colors[i3] = Math.min(1, color.r * tint);
      this.colors[i3 + 1] = Math.min(1, color.g * tint);
      this.colors[i3 + 2] = Math.min(1, color.b * tint);
      this.duration = Math.max(this.duration, l);
    }
    this.attrPos.needsUpdate = true;
    this.attrCol.needsUpdate = true;
    this.points.visible = this.delay <= 0;
    return this;
  }

  update(dt, time) {
    if (!this.active) return false;
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return true;
      this.points.visible = true;
    }
    this.t += dt;
    let alive = 0;
    const ox = num(this.origin.x);
    const oy = num(this.origin.y);
    const oz = num(this.origin.z);
    for (let i = 0; i < this.count; i += 1) {
      if (this.life[i] <= 0) continue;
      const i3 = i * 3;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i3 + 1] = -9999;
        continue;
      }
      alive += 1;
      this.vel[i3 + 1] += this.gravity * dt;
      if (this.inward > 0) {
        const dx = ox - this.positions[i3];
        const dy = oy - this.positions[i3 + 1];
        const dz = oz - this.positions[i3 + 2];
        const d = Math.max(0.2, Math.hypot(dx, dy, dz));
        const pull = (this.inward / d) * dt;
        this.vel[i3] += (dx / d) * pull;
        this.vel[i3 + 1] += (dy / d) * pull;
        this.vel[i3 + 2] += (dz / d) * pull;
      }
      if (this.flutter) {
        this.vel[i3] += Math.sin(time * 3.1 + i) * this.wander * dt * 6;
        this.vel[i3 + 2] += Math.cos(time * 2.7 + i * 1.3) * this.wander * dt * 6;
        this.vel[i3 + 1] += Math.sin(time * 2.2 + i * 0.7) * dt * 0.8;
      }
      this.positions[i3] += this.vel[i3] * dt;
      this.positions[i3 + 1] += this.vel[i3 + 1] * dt;
      this.positions[i3 + 2] += this.vel[i3 + 2] * dt;
      this.vel[i3] *= 1 - 1.6 * dt;
      this.vel[i3 + 2] *= 1 - 1.6 * dt;
    }
    this.attrPos.needsUpdate = true;
    const ratio = this.duration > 0 ? Math.max(0, 1 - this.t / this.duration) : 0;
    this.material.opacity = Math.min(1, Math.max(0, ratio));
    if (alive <= 0) {
      this.active = false;
      this.points.visible = false;
      return false;
    }
    return true;
  }

  recycle() {
    this.active = false;
    this.count = 0;
    this.points.visible = false;
    this.material.opacity = 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** 확장 링/부채꼴 */
class Ring {
  constructor() {
    this.geometry = new THREE.RingGeometry(0.84, 1, 48);
    this.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
    this.active = false;
    this.t = 0;
    this.duration = 1;
    this.radius = 5;
    this.delay = 0;
    this.spin = 0;
  }

  spawn(origin, opts = {}) {
    const rng = opts.rng;
    this.material.color.setHex(num(opts.color, 0xffffff));
    this.mesh.position.copy(origin);
    this.mesh.scale.setScalar(0.001);
    this.mesh.visible = true;
    this.radius = Math.max(0.2, num(opts.radius, 5));
    this.duration = Math.max(0.08, num(opts.duration, 0.9));
    this.delay = Math.max(0, num(opts.delay, 0));
    this.spin = num(opts.spin, 0);
    this.width = num(opts.width, 1);
    this.vertical = !!opts.vertical;
    this.t = 0;
    this.active = true;
    const jitter = rng ? rng.range(-0.2, 0.2) : 0;
    this.mesh.rotation.set(this.vertical ? Math.PI / 2 : -Math.PI / 2, 0, jitter);
    if (opts.height) this.mesh.position.y += num(opts.height, 0);
    this.mesh.visible = this.delay <= 0;
    return this;
  }

  update(dt) {
    if (!this.active) return false;
    if (this.delay > 0) {
      this.delay -= dt;
      if (this.delay > 0) return true;
      this.mesh.visible = true;
    }
    this.t += dt;
    const k = Math.min(1, this.t / this.duration);
    const eased = 1 - Math.pow(1 - k, 2.2);
    this.mesh.scale.setScalar(0.001 + eased * this.radius * this.width);
    if (this.spin) this.mesh.rotation.z += this.spin * dt;
    this.material.opacity = Math.max(0, 0.92 * (1 - k));
    if (k >= 1) {
      this.active = false;
      this.mesh.visible = false;
      return false;
    }
    return true;
  }

  recycle() {
    this.active = false;
    this.mesh.visible = false;
    this.material.opacity = 0;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** 블랙홀/소멸 구체 */
class Sphere {
  constructor() {
    this.geometry = new THREE.SphereGeometry(1, 18, 14);
    this.material = new THREE.MeshBasicMaterial({
      color: 0x120a22,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.visible = false;
    this.active = false;
    this.t = 0;
    this.duration = 3;
    this.radius = 1.4;
  }

  spawn(origin, opts = {}) {
    this.material.color.setHex(num(opts.color, 0x120a22));
    this.mesh.position.copy(origin);
    this.mesh.position.y += num(opts.height, 0.6);
    this.radius = Math.max(0.3, num(opts.radius, 1.4));
    this.duration = Math.max(0.2, num(opts.duration, 3));
    this.mesh.scale.setScalar(0.1);
    this.mesh.visible = true;
    this.t = 0;
    this.active = true;
    return this;
  }

  update(dt) {
    if (!this.active) return false;
    this.t += dt;
    const k = Math.min(1, this.t / this.duration);
    const grow = k < 0.25 ? k / 0.25 : 1;
    const shrink = k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1;
    this.mesh.scale.setScalar(Math.max(0.05, this.radius * grow * shrink));
    this.mesh.rotation.y += dt * 0.8;
    this.material.opacity = 0.92 * shrink;
    if (k >= 1) {
      this.active = false;
      this.mesh.visible = false;
      return false;
    }
    return true;
  }

  recycle() {
    this.active = false;
    this.mesh.visible = false;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** 무기/궁극기 임팩트 스펙 조회 (UI·검증에서도 재사용) */
export function impactSpec(weaponId = null, family = null) {
  const weapon = weaponId ? weaponById(weaponId) : null;
  const fam = family ?? weapon?.family ?? null;
  const base = (fam && WEAPON_IMPACTS[fam]) || WEAPON_IMPACTS.staff;
  const override = weapon?.id ? WEAPON_IMPACT_OVERRIDES[weapon.id] : null;
  return { ...base, ...(override || {}), family: fam, weaponId: weapon?.id ?? null, grade: weapon?.grade ?? null };
}

export function ultimateSpec(ultimateId) {
  return ULTIMATE_IMPACTS[ultimateId] ?? null;
}

export class ImpactFX {
  constructor({ scene = null, camera = null, audio = null, rng = null } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.audio = audio;
    this.rng = rng ?? createRNG('impact-fx');
    this.root = new THREE.Group();
    this.root.name = 'impactFX';
    scene?.add?.(this.root);
    this._bursts = [];
    this._rings = [];
    this._spheres = [];
    this._activeBursts = [];
    this._activeRings = [];
    this._activeSpheres = [];
    this._pendingQuotes = [];
    this._shake = 0;
    this._time = 0;
    this.onGratitude = null;
  }

  get activeCount() {
    return this._activeBursts.length + this._activeRings.length + this._activeSpheres.length;
  }

  get shakeAmount() {
    return this._shake;
  }

  /** 타격 — 무기 계열별 임팩트 */
  hit(point, { weaponId = null, family = null, power = 1, element = null } = {}) {
    const spec = impactSpec(weaponId, family);
    const origin = toVec(point);
    const p = Math.max(0, num(power, 1));
    const color = element ? elementColor(element) : spec.color;
    const count = Math.max(1, Math.round(num(spec.particles, 10) * (0.55 + p * 0.45)));
    const kind = spec.kind ?? 'burst';
    if (kind === 'crossSlash') {
      // 가위 임팩트 — 두 날이 교차하는 궤적이 남고, 잘린 자리에 시간의 실이 맺힌다.
      const sc = num(spec.scale, 1);
      this._ring(origin, { color, radius: 1.9 * sc, duration: 0.32, width: 0.09, arc: Math.PI * 0.85, height: 0.8, spin: 1.6 });
      this._ring(origin, { color, radius: 1.9 * sc, duration: 0.32, delay: 0.05, width: 0.09, arc: Math.PI * 0.85, height: 0.8, spin: -1.6 });
      this._emit('snip', origin, { count, color, power: p, scale: sc, rng: this.rng });
      if (spec.stitch) {
        this._emit('holy', origin, { count: Math.max(5, Math.round(count * 0.45)), color: num(spec.mist, color), rng: this.rng });
      }
      if (num(spec.shake, 0) > 0) this._shake = Math.max(this._shake, num(spec.shake, 0) * p * 0.5);
      this._play(spec.sound ?? null, { power: p });
      return { kind, count, nonLethal: false };
    }
    if (kind === 'bullet') {
      // 총탄 — 불티 + 짧은 충격 고리. 화면 흔들림은 아주 약하게.
      const sc = num(spec.scale, 0.52);
      this._emit('bullet', origin, { count, color, power: p, scale: sc, rng: this.rng });
      const ring = num(spec.ring, 0);
      if (ring > 0) {
        this._ring(origin, {
          color,
          radius: Math.max(0.18, ring * sc),
          duration: 0.16,
          width: 0.035,
          height: 0.35,
          spin: 1.4
        });
      }
      if (num(spec.shake, 0) > 0) this._shake = Math.max(this._shake, num(spec.shake, 0) * p * 0.5);
      this._play(spec.sound ?? null, { power: p });
      return { kind, count, nonLethal: false };
    }
    if (kind === 'galaxy') {
      // 은하수 타격 — 별가루가 터지고 보랏빛/청록 고리가 겹쳐 번진다.
      const sc = Math.max(0.5, num(spec.scale, 1.05));
      this._emit('star', origin, { count, color, power: p, scale: sc, rng: this.rng });
      this._emit('void', origin, {
        count: Math.max(6, Math.round(count * 0.45)),
        color: 0xc9b8ff,
        spread: 0.9,
        scale: sc * 0.7,
        rng: this.rng
      });
      const rings = Math.max(1, Math.round(num(spec.rings, 2)));
      for (let i = 0; i < rings; i += 1) {
        this._ring(origin, {
          color: i % 2 === 0 ? spec.color : 0x6af0e0,
          radius: (0.85 + i * 0.5) * sc,
          duration: 0.38 + i * 0.1,
          width: 0.055,
          height: 0.5,
          spin: i % 2 === 0 ? 1.1 : -1.5
        });
      }
      if (num(spec.shake, 0) > 0) this._shake = Math.max(this._shake, num(spec.shake, 0) * p * 0.5);
      this._play(spec.sound ?? null, { power: p });
      return { kind, count, nonLethal: false };
    }
    this._emit(kind, origin, { count, color, power: p, scale: num(spec.scale, 1), rng: this.rng });
    if (spec.nonLethal && spec.gratitude) this.gratitude(origin, spec.gratitude);
    if (num(spec.shake, 0) > 0) this._shake = Math.max(this._shake, num(spec.shake, 0) * p * 0.5);
    this._play(spec.sound ?? null, { power: p });
    return { kind, count, nonLethal: !!spec.nonLethal };
  }

  /** 궁극기 스킬 임팩트 */
  skill(center, { ultimateId = null, radius = 0, power = 1 } = {}) {
    const spec = ultimateSpec(ultimateId) ?? {
      kind: 'shock',
      color: 0xffffff,
      particles: 30,
      shake: 0.5,
      sound: null
    };
    const origin = toVec(center);
    const r = Math.max(0, num(radius, num(spec.radius, 0)));
    const p = Math.max(0, num(power, 1));
    const kind = spec.kind ?? 'shock';

    if (kind === 'salvation') {
      this.salvation(origin, {
        radius: r || num(DREAM_TREE.save.radius, 3),
        petals: num(spec.petals, 140),
        butterflies: num(spec.butterflies, 28),
        halo: spec.halo !== false,
        gratitude: true
      });
      return { kind, radius: r, nonLethal: true };
    }

    if (kind === 'slashArc') {
      this._ring(origin, {
        color: spec.color,
        radius: r || 24,
        duration: 0.75,
        arc: Math.PI * 0.6,
        width: Math.max(0.6, num(spec.width, 4.5) / 4),
        height: num(spec.height, 1.2)
      });
      this._emit('arc', origin, {
        count: num(spec.particles, 40),
        color: spec.color,
        spread: Math.max(1, r * 0.12),
        rng: this.rng
      });
    } else if (kind === 'ringWave') {
      const rings = Math.max(1, Math.round(num(spec.rings, 3)));
      for (let i = 0; i < rings; i += 1) {
        this._ring(origin, {
          color: spec.color,
          radius: r || 40,
          duration: 0.95 + i * 0.28,
          delay: i * 0.17,
          width: 1 + i * 0.25,
          height: num(spec.height, 4)
        });
      }
      this._emit('shock', origin, {
        count: num(spec.particles, 70),
        color: spec.color,
        spread: Math.max(1, r * 0.2),
        rng: this.rng
      });
    } else if (kind === 'blackhole') {
      this._sphere(origin, {
        color: 0x1a0f2e,
        radius: Math.max(1, r * 0.05),
        duration: num(spec.duration, 5),
        height: 1.2
      });
      this._emit('void', origin, {
        count: num(spec.particles, 90),
        color: spec.color,
        spread: Math.max(1.5, r * 0.25),
        inward: num(spec.pull, 9),
        rng: this.rng
      });
    } else if (kind === 'multiStrike') {
      const hits = Math.max(1, Math.round(num(spec.hits, 10)));
      for (let i = 0; i < hits; i += 1) {
        const angle = (i / hits) * Math.PI * 2;
        const rr = Math.max(0.6, r * 0.06);
        const at = origin.clone().add(new THREE.Vector3(Math.cos(angle) * rr, 0.8 + (i % 3) * 0.5, Math.sin(angle) * rr));
        this._emit('spark', at, {
          count: Math.max(3, Math.round(num(spec.particles, 26) / hits)),
          color: spec.color,
          delay: i * 0.055,
          rng: this.rng
        });
      }
    } else if (kind === 'galaxy') {
      // 은하수의 밤 — 고리 4겹 + 별가루 소용돌이 + 안쪽으로 빨려드는 별.
      const rings = Math.max(1, Math.round(num(spec.rings, 4)));
      for (let i = 0; i < rings; i += 1) {
        this._ring(origin, {
          color: i % 2 === 0 ? spec.color : 0x6af0e0,
          radius: Math.max(1.4, r * (0.3 + i * 0.22)),
          duration: 0.85 + i * 0.18,
          delay: i * 0.09,
          width: 0.45 + i * 0.12,
          height: 1.2 + i * 0.4,
          spin: i % 2 === 0 ? 0.5 : -0.7
        });
      }
      this._emit('star', origin, {
        count: num(spec.stars, 90),
        color: spec.color,
        spread: Math.max(1.5, r * 0.42),
        life: 2.1,
        rise: 0.9,
        scale: Math.max(1, r * 0.03),
        rng: this.rng
      });
      this._emit('void', origin, {
        count: num(spec.particles, 60),
        color: 0xc9b8ff,
        spread: Math.max(1.2, r * 0.2),
        inward: 4.2,
        scale: Math.max(1, r * 0.025),
        rng: this.rng
      });
      this._emit('holy', origin, {
        count: Math.max(8, Math.round(num(spec.stars, 90) * 0.25)),
        color: 0xfff0d0,
        spread: Math.max(1, r * 0.16),
        rng: this.rng
      });
    } else if (kind === 'timeStop') {
      this._ring(origin, { color: spec.color, radius: r || 14, duration: 1.5, spin: 0.6, height: 1.4 });
      this._ring(origin, { color: 0xffffff, radius: (r || 14) * 0.6, duration: 1.2, delay: 0.2, spin: -0.9 });
      this._emit('holy', origin, {
        count: num(spec.particles, 50),
        color: spec.color,
        spread: Math.max(1, (r || 12) * 0.18),
        rng: this.rng
      });
    } else if (kind === 'purge') {
      const pillars = Math.max(1, Math.round(num(spec.pillars, 12)));
      for (let i = 0; i < pillars; i += 1) {
        const angle = (i / pillars) * Math.PI * 2;
        const at = origin.clone().add(new THREE.Vector3(Math.cos(angle) * 3.2, 0.2, Math.sin(angle) * 3.2));
        this._ring(at, { color: spec.color, radius: 2.2, duration: 1.1, delay: i * 0.05, vertical: true, spin: 1.4 });
      }
      this._emit('holy', origin, {
        count: num(spec.particles, 120),
        color: spec.color,
        spread: 2.4,
        rng: this.rng
      });
    } else {
      this._emit('shock', origin, {
        count: num(spec.particles, 40),
        color: spec.color,
        spread: Math.max(1, r * 0.2),
        rng: this.rng
      });
    }

    if (num(spec.shake, 0) > 0) this._shake = Math.max(this._shake, num(spec.shake, 0) * p);
    this._play(spec.sound ?? null, { power: p });
    return { kind, radius: r, nonLethal: false };
  }

  /** 꿈나무 구원 연출 — 벚꽃잎 + 나비 + 후광. 화면 흔들림 없음. */
  salvation(point, { radius = 3, petals = 22, butterflies = 5, gratitude = false, halo = true } = {}) {
    const origin = toVec(point);
    const r = Math.max(0.8, num(radius, 3));
    const petalCount = Math.max(0, Math.round(num(petals, 22)));
    const butterflyCount = Math.max(0, Math.round(num(butterflies, 5)));
    if (petalCount > 0) {
      this._emit('petals', origin, {
        count: petalCount,
        color: 0xffb8d0,
        spread: r * 0.4,
        size: 0.22 * (1 + r * 0.012),
        life: 2.3,
        rise: 1.05,
        rng: this.rng
      });
    }
    if (butterflyCount > 0) {
      this._emit('butterfly', origin, {
        count: butterflyCount,
        color: 0xfff2f7,
        spread: r * 0.35,
        size: 0.3,
        life: 3,
        rise: 1.35,
        rng: this.rng
      });
    }
    if (halo) {
      this._ring(origin, {
        color: 0xffb8d0,
        radius: Math.max(1.4, r),
        duration: 1.25,
        width: 1.1,
        height: 0.12,
        spin: 0.25
      });
    }
    if (gratitude) this.gratitude(origin, DREAM_TREE.save.gratitude);
    this._play('salvation');
    return { kind: 'salvation', petals: petalCount, butterflies: butterflyCount, shake: 0 };
  }

  /** 감사 인사 — 잠시 뒤 HUD 로 전달된다. */
  gratitude(point, texts = null) {
    const list = Array.isArray(texts) && texts.length ? texts : DREAM_TREE.save.gratitude;
    const text = this.rng.pick ? this.rng.pick(list) : list[0];
    this._pendingQuotes.push({ t: 0.55, text });
    this._emit('spark', toVec(point), {
      count: 8,
      color: 0xffe9f2,
      speed: 1.3,
      spread: 0.4,
      life: 0.8,
      rise: 0.95,
      size: 0.1,
      rng: this.rng
    });
    return text;
  }

  update(dt) {
    const step = Math.max(0, Math.min(num(dt, 0), 0.1));
    this._time += step;
    for (let i = this._activeBursts.length - 1; i >= 0; i -= 1) {
      const burst = this._activeBursts[i];
      if (!burst.update(step, this._time)) {
        burst.recycle();
        this._activeBursts.splice(i, 1);
      }
    }
    for (let i = this._activeRings.length - 1; i >= 0; i -= 1) {
      const ring = this._activeRings[i];
      if (!ring.update(step)) {
        ring.recycle();
        this._activeRings.splice(i, 1);
      }
    }
    for (let i = this._activeSpheres.length - 1; i >= 0; i -= 1) {
      const sphere = this._activeSpheres[i];
      if (!sphere.update(step)) {
        sphere.recycle();
        this._activeSpheres.splice(i, 1);
      }
    }
    if (this._shake > 0) this._shake = Math.max(0, this._shake - step * 1.8);
    if (this._pendingQuotes.length) {
      for (const quote of this._pendingQuotes) quote.t -= step;
      const due = this._pendingQuotes.filter((q) => q.t <= 0);
      this._pendingQuotes = this._pendingQuotes.filter((q) => q.t > 0);
      for (const quote of due) {
        try {
          this.onGratitude?.(quote.text);
        } catch {
          /* 콜백 실패는 무시 */
        }
      }
    }
    return this.activeCount;
  }

  dispose() {
    for (const burst of this._bursts) burst.dispose();
    for (const ring of this._rings) ring.dispose();
    for (const sphere of this._spheres) sphere.dispose();
    this._bursts = [];
    this._rings = [];
    this._spheres = [];
    this._activeBursts = [];
    this._activeRings = [];
    this._activeSpheres = [];
    this._pendingQuotes = [];
    this._shake = 0;
    if (this.root.parent) this.root.parent.remove(this.root);
    this.root.clear?.();
    return true;
  }

  // ── 내부
  _emit(kind, origin, opts = {}) {
    const spec = KIND_DEFAULTS[kind] ?? KIND_DEFAULTS.burst;
    const burst = this._obtainBurst();
    const scale = num(opts.scale, 1);
    burst.spawn(origin, {
      count: opts.count ?? 12,
      color: opts.color ?? 0xffffff,
      speed: num(opts.speed, spec.speed) * (0.85 + scale * 0.3),
      spread: num(opts.spread, spec.spread) * scale,
      life: num(opts.life, spec.life),
      size: num(opts.size, spec.size) * (0.9 + scale * 0.15),
      gravity: num(opts.gravity, spec.gravity),
      rise: num(opts.rise, spec.rise),
      wander: num(opts.wander, spec.wander ?? 0),
      flutter: opts.flutter ?? spec.flutter ?? false,
      inward: num(opts.inward, spec.inward ?? 0),
      arc: spec.arc ?? null,
      delay: num(opts.delay, 0),
      rng: opts.rng ?? this.rng
    });
    return burst;
  }

  _ring(origin, opts = {}) {
    const ring = this._obtainRing();
    ring.spawn(origin, { ...opts, rng: opts.rng ?? this.rng });
    return ring;
  }

  _sphere(origin, opts = {}) {
    const sphere = this._obtainSphere();
    sphere.spawn(origin, opts);
    return sphere;
  }

  _obtainBurst() {
    while (this._activeBursts.length >= MAX_BURSTS) {
      const oldest = this._activeBursts.shift();
      oldest.recycle();
    }
    let burst = this._bursts.find((b) => !b.active);
    if (!burst) {
      burst = new Burst();
      this._bursts.push(burst);
      this.root.add(burst.points);
    }
    if (!this._activeBursts.includes(burst)) this._activeBursts.push(burst);
    return burst;
  }

  _obtainRing() {
    while (this._activeRings.length >= MAX_RINGS) {
      const oldest = this._activeRings.shift();
      oldest.recycle();
    }
    let ring = this._rings.find((r) => !r.active);
    if (!ring) {
      ring = new Ring();
      this._rings.push(ring);
      this.root.add(ring.mesh);
    }
    if (!this._activeRings.includes(ring)) this._activeRings.push(ring);
    return ring;
  }

  _obtainSphere() {
    while (this._activeSpheres.length >= MAX_SPHERES) {
      const oldest = this._activeSpheres.shift();
      oldest.recycle();
    }
    let sphere = this._spheres.find((s) => !s.active);
    if (!sphere) {
      sphere = new Sphere();
      this._spheres.push(sphere);
      this.root.add(sphere.mesh);
    }
    if (!this._activeSpheres.includes(sphere)) this._activeSpheres.push(sphere);
    return sphere;
  }

  _play(name, opts = {}) {
    if (!name || !this.audio?.play) return false;
    try {
      this.audio.play(name, opts);
      return true;
    } catch {
      return false;
    }
  }
}

export default ImpactFX;

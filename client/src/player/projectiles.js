// 요새의 수호자 — pooled projectile / beam / chain / area / homing system.
// Rendering: one InstancedMesh for all ball projectiles (per-instance colour) plus a small pool of
// transient beam cylinders, blast spheres and expanding rings. No per-shot geometry or material
// allocation: records and meshes are reused.

import * as THREE from 'three';
import { SPELL_ELEMENTS } from '../data.js';
import { createRNG } from '../utils/rng.js';

const ELEMENT_COLORS = Object.fromEntries(SPELL_ELEMENTS.map((e) => [e.id, e.color]));

export function elementColor(element) {
  return ELEMENT_COLORS[element] ?? ELEMENT_COLORS.arcane ?? 0x8f6bff;
}

const BEHAVIORS = new Set(['projectile', 'beam', 'chain', 'area', 'homing']);

const UP = new THREE.Vector3(0, 1, 0);
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _tc = new THREE.Vector3();
const _td = new THREE.Vector3();
const _tf = new THREE.Vector3();

const DEFAULT_BEAM_TIME = 0.26; // beam lifetime (damage ticks over this window)
const BEAM_TICK = 0.1;
const CHAIN_RANGE = 14;

/** Squared distance from point `p` to segment a→b. */
function segDistSq(p, a, b) {
  _ta.copy(b).sub(a);
  const lenSq = _ta.lengthSq();
  if (lenSq < 1e-8) return p.distanceToSquared(a);
  _tb.copy(p).sub(a);
  const t = Math.max(0, Math.min(1, _tb.dot(_ta) / lenSq));
  _tc.copy(a).addScaledVector(_ta, t);
  return p.distanceToSquared(_tc);
}

export class ProjectileSystem {
  constructor({ scene, audio, max = 400, groundHeight = null, rng } = {}) {
    this.scene = scene || null;
    this.audio = audio || null;
    this.max = Math.max(1, Math.floor(max) || 400);
    this.groundHeight = typeof groundHeight === 'function' ? groundHeight : null;
    this.rng = rng || createRNG('projectiles');

    this._onExplosion = null;
    this._time = 0;
    this._nextId = 1;
    this._dirty = false;

    // record pool
    this._records = [];
    for (let i = 0; i < this.max; i++) this._records.push(this._makeRecord(i));
    this._free = [];
    for (let i = this.max - 1; i >= 0; i--) this._free.push(i);
    this._active = [];

    // scene graph
    this.group = new THREE.Group();
    this.group.name = 'projectile-system';
    this.scene?.add?.(this.group);

    // instanced bodies
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.name = 'projectile-bodies';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = this.max;
    this.group.add(this.mesh);
    _dummy.position.set(0, 0, 0);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.setScalar(0.0001);
    _dummy.updateMatrix();
    for (let i = 0; i < this.max; i++) {
      this.mesh.setMatrixAt(i, _dummy.matrix);
      this.mesh.setColorAt(i, _color.setHex(0xffffff));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // transient effect pools (created lazily, bounded)
    this._effects = { beam: [], burst: [], ring: [] };
  }

  // ── pooling ─────────────────────────────────────────────────
  _makeRecord(index) {
    return {
      index,
      id: 0,
      active: false,
      started: false,
      behavior: 'projectile',
      position: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      origin: new THREE.Vector3(),
      direction: new THREE.Vector3(0, 0, -1),
      velocity: new THREE.Vector3(),
      speed: 40,
      damage: 10,
      element: 'arcane',
      color: 0x8f6bff,
      radius: 1.2,
      range: 60,
      traveled: 0,
      pierceLeft: 0,
      chainCount: 3,
      chainRange: CHAIN_RANGE,
      aoe: 0,
      owner: 'player',
      onHit: null,
      life: 0,
      maxLife: 0,
      target: null,
      tickTimer: 0,
      turn: 4.5,
      hitSet: new Set()
    };
  }

  _acquireRecord() {
    const idx = this._free.pop();
    if (idx === undefined) return null;
    return this._records[idx];
  }

  _release(p, activeIndex) {
    p.active = false;
    p.hitSet.clear();
    p.target = null;
    p.onHit = null;
    _dummy.position.set(0, 0, 0);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.setScalar(0.0001);
    _dummy.updateMatrix();
    this.mesh.setMatrixAt(p.index, _dummy.matrix);
    this._dirty = true;
    const arr = this._active;
    const last = arr.length - 1;
    if (activeIndex >= 0 && activeIndex <= last) {
      arr[activeIndex] = arr[last];
      arr.pop();
    }
    this._free.push(p.index);
  }

  // ── spawn / clear ───────────────────────────────────────────
  /**
   * Fires one projectile. Returns `{ id }` or null when the pool is full.
   * opts: { origin, direction, speed, damage, element, behavior, radius, range, color,
   *         owner, pierce, onHit, chainCount, aoe, scale, duration, silent }
   */
  spawn({
    origin,
    direction,
    speed = 40,
    damage = 10,
    element = 'arcane',
    behavior = 'projectile',
    radius = 1.2,
    range = 60,
    color,
    owner = 'player',
    pierce = 0,
    onHit = null,
    chainCount = 3,
    aoe = 0,
    scale = 1,
    duration = null,
    turn = 4.5,
    silent = false
  } = {}) {
    const beh = BEHAVIORS.has(behavior) ? behavior : 'projectile';
    const p = this._acquireRecord();
    if (!p) return null; // pool exhausted

    p.active = true;
    p.started = false;
    p.id = this._nextId++;
    p.behavior = beh;
    p.element = element;
    p.color = color != null ? color : elementColor(element);
    p.damage = Number.isFinite(damage) ? damage : 10;
    p.speed = Number.isFinite(speed) ? speed : 40;
    p.radius = Number.isFinite(radius) && radius > 0 ? radius : 0.4;
    p.range = Number.isFinite(range) && range > 0 ? range : 60;
    p.owner = owner;
    p.onHit = typeof onHit === 'function' ? onHit : null;
    p.pierceLeft = Math.max(0, Math.floor(pierce) || 0);
    p.chainCount = Math.max(1, Math.floor(chainCount) || 1);
    p.chainRange = CHAIN_RANGE;
    p.aoe = Math.max(0, Number(aoe) || 0);
    p.scale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    p.turn = Number.isFinite(turn) ? turn : 4.5;
    p.traveled = 0;
    p.life = 0;
    p.tickTimer = 0;
    p.target = null;
    p.hitSet.clear();

    if (origin) p.position.set(origin.x || 0, origin.y || 0, origin.z || 0);
    else p.position.set(0, 0, 0);
    p.prev.copy(p.position);
    p.origin.copy(p.position);
    if (direction && (direction.x || direction.y || direction.z)) p.direction.copy(direction).normalize();
    else p.direction.set(0, 0, -1);

    if (beh === 'beam') {
      p.maxLife = Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_BEAM_TIME;
      p.velocity.set(0, 0, 0);
    } else if (beh === 'chain') {
      p.maxLife = Number.isFinite(duration) && duration > 0 ? duration : 0.38;
      p.velocity.set(0, 0, 0);
    } else {
      p.maxLife = 0;
      p.velocity.copy(p.direction).multiplyScalar(p.speed);
    }

    this._active.push(p);
    this._setColor(p.index, p.color);
    this._writeInstance(p);
    if (!silent) this.audio?.play?.(beh === 'beam' ? 'cast' : beh === 'chain' ? 'cast' : 'fire');
    return { id: p.id };
  }

  clear() {
    for (let i = this._active.length - 1; i >= 0; i--) this._release(this._active[i], i);
    for (const kind of Object.keys(this._effects)) {
      for (const e of this._effects[kind]) {
        e.active = false;
        e.obj.visible = false;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this._dirty = false;
  }

  dispose() {
    this.clear();
    this.group.remove(this.mesh);
    this.mesh.geometry?.dispose?.();
    this.mesh.material?.dispose?.();
    this.mesh.dispose?.();
    for (const kind of Object.keys(this._effects)) {
      for (const e of this._effects[kind]) {
        this.group.remove(e.obj);
        e.geo?.dispose?.();
        e.mat?.dispose?.();
      }
      this._effects[kind].length = 0;
    }
    this.scene?.remove?.(this.group);
    this._records.length = 0;
    this._free.length = 0;
    this._active.length = 0;
  }

  /** cb({ position, radius, color, element, damage, owner }) */
  onExplosion(cb) {
    this._onExplosion = typeof cb === 'function' ? cb : null;
    return this;
  }

  get count() {
    return this._active.length;
  }

  get capacity() {
    return this.max;
  }

  get time() {
    return this._time;
  }

  // ── main loop ───────────────────────────────────────────────
  update(dt, targets) {
    const d = Math.min(Math.max(dt || 0, 0), 0.1);
    this._time += d;
    const list = Array.isArray(targets) ? targets : [];
    const active = this._active;
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      if (!p.active) continue;
      if (!this._step(p, d, list)) this._release(p, i);
    }
    if (this._dirty) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this._dirty = false;
    }
    this._updateEffects(d);
    return this;
  }

  _step(p, d, targets) {
    if (p.behavior === 'beam') return this._stepBeam(p, d, targets);
    if (p.behavior === 'chain') return this._stepChain(p, d, targets);
    return this._stepBallistic(p, d, targets);
  }

  _stepBallistic(p, d, targets) {
    if (p.behavior === 'homing') this._steer(p, d, targets);

    p.prev.copy(p.position);
    p.position.addScaledVector(p.velocity, d);
    p.traveled += p.speed * d;
    p.life += d;

    if (!this._collide(p, targets)) return false;

    const gh = this._groundAt(p.position.x, p.position.z);
    if (gh != null && p.position.y <= gh) {
      if (p.behavior === 'area' && p.aoe > 0) this._explode(p, targets);
      return false;
    }
    if (p.traveled >= p.range) {
      if (p.behavior === 'area' && p.aoe > 0) this._explode(p, targets);
      return false;
    }
    this._writeInstance(p);
    return true;
  }

  _groundAt(x, z) {
    if (!this.groundHeight) return null;
    const h = this.groundHeight(x, z);
    return typeof h === 'number' && Number.isFinite(h) ? h : null;
  }

  /** Sphere sweep (previous -> current position) against every live target. */
  _collide(p, targets) {
    for (const t of targets) {
      if (!t || t.alive === false || !t.position) continue;
      if (p.hitSet.has(t)) continue;
      const tr = Number(t.radius);
      const r = (Number.isFinite(tr) ? tr : 0.6) + p.radius;
      if (segDistSq(t.position, p.prev, p.position) > r * r) continue;

      p.hitSet.add(t);
      if (p.behavior === 'area' && p.aoe > 0) {
        this._explode(p, targets); // mass damage comes from the blast, not the impact
        return false;
      }
      const dmg = p.damage;
      t.takeDamage?.(dmg, p.element, p.owner);
      p.onHit?.(t, dmg, p.element);

      if (p.pierceLeft > 0) {
        p.pierceLeft--;
        continue; // keep flying through
      }
      return false;
    }
    return true;
  }

  /** Homing: steer toward the nearest target inside a forward cone. */
  _steer(p, d, targets) {
    let best = null;
    let bestDist = Infinity;
    const look = p.range * 1.3;
    for (const t of targets) {
      if (!t || t.alive === false || !t.position) continue;
      _tb.copy(t.position).sub(p.position);
      const dist = _tb.length();
      if (dist < 1e-4 || dist > look) continue;
      _tb.multiplyScalar(1 / dist);
      if (_tb.dot(p.direction) < 0.45) continue; // outside the ~63° cone
      if (dist < bestDist) {
        bestDist = dist;
        best = t;
      }
    }
    p.target = best;
    if (!best) return;
    _tc.copy(best.position).sub(p.position).normalize().multiplyScalar(p.speed);
    p.velocity.lerp(_tc, 1 - Math.exp(-p.turn * d));
    if (p.velocity.lengthSq() > 1e-6) {
      p.velocity.setLength(p.speed);
      p.direction.copy(p.velocity).normalize();
    }
  }

  // ── beam ────────────────────────────────────────────────────
  _stepBeam(p, d, targets) {
    p.life += d;
    if (!p.started) {
      p.started = true;
      const hit = this._rayTarget(p, targets);
      p.target = hit ? hit.target : null;
      const end = hit ? hit.point : _tf.copy(p.origin).addScaledVector(p.direction, p.range);
      this._showBeam(p.origin, end, p.radius * 0.4, p.color, p.maxLife);
      if (p.target) {
        this._applyHit(p, p.target, p.damage);
        p.tickTimer = BEAM_TICK;
      }
    } else if (p.target) {
      if (p.target.alive === false) {
        p.target = null;
      } else if (Math.abs(this._distanceAlong(p, p.target)) <= p.range) {
        p.tickTimer -= d;
        if (p.tickTimer <= 0) {
          p.tickTimer = BEAM_TICK;
          this._applyHit(p, p.target, p.damage * 0.35); // damage ticked over the beam duration
        }
      }
    }
    return p.life < p.maxLife;
  }

  _distanceAlong(p, target) {
    _td.copy(target.position).sub(p.origin);
    return _td.dot(p.direction);
  }

  _rayTarget(p, targets) {
    let best = null;
    let bestAlong = Infinity;
    for (const t of targets) {
      if (!t || t.alive === false || !t.position) continue;
      const along = this._distanceAlong(p, t);
      if (along < 0 || along > p.range) continue;
      const tr = Number(t.radius);
      const r = (Number.isFinite(tr) ? tr : 0.6) + p.radius;
      _td.copy(p.origin).addScaledVector(p.direction, along);
      if (_td.distanceTo(t.position) > r) continue;
      if (along < bestAlong) {
        bestAlong = along;
        best = t;
      }
    }
    if (!best) return null;
    _tc.copy(p.origin).addScaledVector(p.direction, bestAlong);
    return { target: best, point: _tc };
  }

  // ── chain ───────────────────────────────────────────────────
  _stepChain(p, d, targets) {
    p.life += d;
    if (!p.started) {
      p.started = true;
      this._resolveChain(p, targets);
    }
    return p.life < p.maxLife;
  }

  _resolveChain(p, targets) {
    let from = p.origin;
    let current = this._firstChainTarget(p, targets);
    let jumps = 0;
    if (!current) {
      this._showBeam(p.origin, _tf.copy(p.origin).addScaledVector(p.direction, Math.min(p.range, 12)), p.radius * 0.22, p.color, p.maxLife * 0.7);
      return;
    }
    while (current && jumps < p.chainCount) {
      p.hitSet.add(current);
      const dmg = p.damage * Math.pow(0.85, jumps); // slight falloff per jump
      current.takeDamage?.(dmg, p.element, p.owner);
      p.onHit?.(current, dmg, p.element);
      this._showBeam(from, current.position, p.radius * 0.26, p.color, p.maxLife);
      from = current.position;
      jumps++;
      current = this._nearestUnhit(current.position, targets, p.hitSet, p.chainRange);
    }
  }

  _firstChainTarget(p, targets) {
    return this._rayTarget(p, targets)?.target ?? null;
  }

  _nearestUnhit(from, targets, hitSet, radius) {
    let best = null;
    let bestDist = radius * radius;
    for (const t of targets) {
      if (!t || t.alive === false || !t.position || hitSet.has(t)) continue;
      const dist = from.distanceToSquared(t.position);
      if (dist <= bestDist) {
        bestDist = dist;
        best = t;
      }
    }
    return best;
  }

  // ── area ────────────────────────────────────────────────────
  _explode(p, targets) {
    const radius = p.aoe;
    if (!(radius > 0)) return;
    for (const t of targets) {
      if (!t || t.alive === false || !t.position) continue;
      const tr = Number(t.radius);
      const dist = Math.max(0, p.position.distanceTo(t.position) - (Number.isFinite(tr) ? tr : 0.6));
      if (dist > radius) continue;
      const falloff = Math.max(0, 1 - dist / radius); // linear falloff
      const dmg = p.damage * falloff;
      if (dmg <= 0) continue;
      t.takeDamage?.(dmg, p.element, p.owner);
      p.onHit?.(t, dmg, p.element);
    }
    this._onExplosion?.({
      position: p.position.clone(),
      radius,
      color: p.color,
      element: p.element,
      damage: p.damage,
      owner: p.owner
    });
    this.audio?.play?.('explosion');
    this._spawnBurst(p.position, radius, p.color);
  }

  _applyHit(p, target, dmg) {
    target.takeDamage?.(dmg, p.element, p.owner);
    p.onHit?.(target, dmg, p.element);
  }

  // ── instanced rendering ─────────────────────────────────────
  /** Positions the instance matrix for a flying projectile (beams/chains draw themselves). */
  _writeInstance(p) {
    if (p.behavior === 'beam' || p.behavior === 'chain') return;
    const s = Math.max(0.02, p.radius * p.scale);
    _dummy.position.copy(p.position);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.setScalar(s);
    _dummy.updateMatrix();
    this.mesh.setMatrixAt(p.index, _dummy.matrix);
    this._dirty = true;
  }

  _setColor(index, color) {
    this.mesh.setColorAt(index, _color.setHex(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // ── transient effects ───────────────────────────────────────
  _createEffect(kind) {
    let geo;
    let mat;
    if (kind === 'beam') {
      geo = new THREE.CylinderGeometry(0.3, 1, 1, 6, 1, true);
      mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      });
    } else if (kind === 'burst') {
      geo = new THREE.SphereGeometry(1, 14, 10);
      mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
    } else {
      geo = new THREE.RingGeometry(0.86, 1, 28);
      mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.75,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      });
    }
    const obj = new THREE.Mesh(geo, mat);
    obj.visible = false;
    obj.frustumCulled = false;
    obj.name = `fx-${kind}`;
    if (kind === 'ring') obj.rotation.x = -Math.PI / 2;
    this.group.add(obj);
    return {
      kind, obj, geo, mat,
      life: 0, maxLife: 0.5, active: false,
      baseOpacity: mat.opacity, baseScale: 1, grow: 1
    };
  }

  _acquire(kind) {
    const pool = this._effects[kind];
    for (const e of pool) if (!e.active) return e;
    if (pool.length >= 64 && pool.length) {
      // hard cap: recycle the oldest instance instead of growing forever
      const oldest = pool[0];
      pool.push(pool.shift());
      return oldest;
    }
    const e = this._createEffect(kind);
    pool.push(e);
    return e;
  }

  _showBeam(from, to, thickness, color, life) {
    const e = this._acquire('beam');
    e.active = true;
    e.life = 0;
    e.maxLife = Math.max(0.06, life);
    e.obj.visible = true;
    e.obj.position.copy(from).add(to).multiplyScalar(0.5);
    _tb.copy(to).sub(from);
    const len = _tb.length();
    if (len < 1e-4) {
      e.obj.scale.set(0.0001, 0.0001, 0.0001);
    } else {
      e.obj.quaternion.setFromUnitVectors(UP, _tb.multiplyScalar(1 / len));
      e.obj.scale.set(Math.max(0.01, thickness), len, Math.max(0.01, thickness));
    }
    e.mat.color.setHex(color);
    e.mat.opacity = e.baseOpacity;
  }

  _spawnBurst(center, radius, color) {
    const b = this._acquire('burst');
    b.active = true;
    b.life = 0;
    b.maxLife = 0.42;
    b.baseScale = Math.max(0.5, radius * 0.4);
    b.grow = Math.max(0.5, radius * 0.8);
    b.obj.visible = true;
    b.obj.position.copy(center);
    b.obj.scale.setScalar(b.baseScale);
    b.mat.color.setHex(color);
    b.mat.opacity = b.baseOpacity;

    const r = this._acquire('ring');
    r.active = true;
    r.life = 0;
    r.maxLife = 0.55;
    r.baseScale = Math.max(0.4, radius * 0.35);
    r.grow = Math.max(0.6, radius);
    r.obj.visible = true;
    r.obj.position.copy(center);
    r.obj.position.y += 0.06;
    r.obj.scale.set(r.baseScale, r.baseScale, 1);
    r.mat.color.setHex(color);
    r.mat.opacity = r.baseOpacity;
  }

  _updateEffects(d) {
    for (const kind of Object.keys(this._effects)) {
      for (const e of this._effects[kind]) {
        if (!e.active) continue;
        e.life += d;
        const k = e.life / e.maxLife;
        if (k >= 1) {
          e.active = false;
          e.obj.visible = false;
          continue;
        }
        if (kind === 'beam') {
          e.mat.opacity = e.baseOpacity * (1 - k);
        } else if (kind === 'burst') {
          const s = e.baseScale + e.grow * k;
          e.obj.scale.setScalar(s);
          e.mat.opacity = e.baseOpacity * Math.pow(1 - k, 1.4);
        } else {
          const s = e.baseScale + e.grow * k;
          e.obj.scale.set(s, s, 1);
          e.mat.opacity = e.baseOpacity * (1 - k);
        }
      }
    }
  }
}

export default ProjectileSystem;

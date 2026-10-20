// Core base: three defensive layers + shield, hit flash and shield ripple.
import * as THREE from 'three';

const MAX_HP = 4100;
const MAX_SHIELD = 500;
const KEEP_OUT_RADIUS = 12;
const REGEN_RATE = 2;
const REGEN_DELAY = 5;
const SHIELD_RADIUS = 13.4;

const CORE_COLOR = 0x8fe8ff;
const WALL_COLOR = 0x8c93a3;
const INNER_COLOR = 0xb9c2d0;

function ringLayout(count, radius, out) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push({ x: Math.cos(a) * radius, z: Math.sin(a) * radius, angle: a });
  }
  return out;
}

export class CoreBase {
  constructor({ terrain = null, preset = null } = {}) {
    this.terrain = terrain;
    this.preset = preset;
    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.shield = MAX_SHIELD;
    this.maxShield = MAX_SHIELD;
    this.radius = KEEP_OUT_RADIUS;
    this.regenRate = REGEN_RATE;
    this.regenDelay = REGEN_DELAY;
    this.time = 0;
    this.lastDamageTime = -1e9;
    this.flash = 0;
    this.ripple = 0;
    this.destroyed = false;

    this.group = new THREE.Group();
    this.group.name = 'base';
    this.group.matrixAutoUpdate = false;

    const h = terrain ? (typeof terrain.surfaceHeight === 'function' ? terrain.surfaceHeight(0, 0) : terrain.getHeight(0, 0)) : 0;
    this.position = this.group.position; // Vector3, kept in sync with the group
    this.position.set(0, h, 0);
    this.group.updateMatrix();

    this._geos = [];
    this._mats = [];
    this._spin = [];

    this._build();
  }

  _track(geo) {
    this._geos.push(geo);
    return geo;
  }

  _mat(mat) {
    this._mats.push(mat);
    return mat;
  }

  _build() {
    // ── stone pedestal ──
    const pedestalMat = this._mat(
      new THREE.MeshStandardMaterial({ color: 0x4a4f5a, roughness: 0.92, metalness: 0.08, flatShading: true })
    );
    const pedestal = new THREE.Mesh(this._track(new THREE.CylinderGeometry(11.4, 12.8, 1.4, 16)), pedestalMat);
    pedestal.position.set(0, 0.7, 0);
    pedestal.receiveShadow = true;
    pedestal.matrixAutoUpdate = false;
    pedestal.updateMatrix();
    this.group.add(pedestal);
    this._pedestal = pedestal;

    // ── layer 1: outer wall ring (12 segments) ──
    const wallMat = this._mat(
      new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.85, metalness: 0.15, flatShading: true })
    );
    this._wallMat = wallMat;
    const outerSeg = ringLayout(12, 10.4, []);
    const outerMesh = new THREE.InstancedMesh(
      this._track(new THREE.BoxGeometry(3.6, 3.2, 1)),
      wallMat,
      outerSeg.length
    );
    outerMesh.name = 'base.outerWall';
    outerMesh.castShadow = !!this.preset?.shadow;
    outerMesh.receiveShadow = true;
    this._fillRing(outerMesh, outerSeg, 1.8, 3.2);
    outerMesh.instanceMatrix.needsUpdate = true;
    this.group.add(outerMesh);
    this._outerWall = outerMesh;

    const merlonMesh = new THREE.InstancedMesh(
      this._track(new THREE.BoxGeometry(1.1, 0.9, 1)),
      wallMat,
      outerSeg.length
    );
    merlonMesh.name = 'base.outerMerlons';
    merlonMesh.castShadow = false;
    merlonMesh.receiveShadow = false;
    this._fillRing(merlonMesh, outerSeg, 3.85, 1);
    merlonMesh.instanceMatrix.needsUpdate = true;
    this.group.add(merlonMesh);

    // ── layer 2: inner wall ring (8 segments) ──
    const innerMat = this._mat(
      new THREE.MeshStandardMaterial({ color: INNER_COLOR, roughness: 0.6, metalness: 0.3, flatShading: true })
    );
    const innerSeg = ringLayout(8, 6.4, []);
    const innerMesh = new THREE.InstancedMesh(
      this._track(new THREE.BoxGeometry(3.2, 2.4, 0.8)),
      innerMat,
      innerSeg.length
    );
    innerMesh.name = 'base.innerWall';
    innerMesh.castShadow = !!this.preset?.shadow;
    innerMesh.receiveShadow = true;
    this._fillRing(innerMesh, innerSeg, 1.6, 2.4);
    innerMesh.instanceMatrix.needsUpdate = true;
    this.group.add(innerMesh);
    this._innerWall = innerMesh;

    // ── layer 3: core crystal ──
    const daisMat = this._mat(
      new THREE.MeshStandardMaterial({ color: 0x2f3540, roughness: 0.7, metalness: 0.35, flatShading: true })
    );
    const dais = new THREE.Mesh(this._track(new THREE.CylinderGeometry(3.1, 3.8, 1.6, 8)), daisMat);
    dais.position.set(0, 2.0, 0);
    dais.receiveShadow = true;
    dais.matrixAutoUpdate = false;
    dais.updateMatrix();
    this.group.add(dais);

    this._coreMat = this._mat(
      new THREE.MeshStandardMaterial({
        color: CORE_COLOR,
        emissive: CORE_COLOR,
        emissiveIntensity: 0.9,
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
        flatShading: true
      })
    );
    const core = new THREE.Mesh(this._track(new THREE.OctahedronGeometry(2.9, 0)), this._coreMat);
    core.position.set(0, 6.2, 0);
    core.castShadow = !!this.preset?.shadow;
    this.group.add(core);
    this._core = core;
    this._coreBaseY = 6.2;

    const shellMat = this._mat(
      new THREE.MeshBasicMaterial({
        color: CORE_COLOR,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    const shell = new THREE.Mesh(this._track(new THREE.OctahedronGeometry(3.6, 0)), shellMat);
    shell.position.set(0, 6.2, 0);
    this.group.add(shell);
    this._shell = shell;

    // ── shield bubble + impact ripple ──
    this._shieldMat = this._mat(
      new THREE.MeshBasicMaterial({
        color: 0x7fd8ff,
        transparent: true,
        opacity: 0.1,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    const shield = new THREE.Mesh(this._track(new THREE.SphereGeometry(SHIELD_RADIUS, 24, 16)), this._shieldMat);
    shield.name = 'base.shield';
    shield.position.set(0, SHIELD_RADIUS * 0.55, 0);
    shield.matrixAutoUpdate = true;
    this.group.add(shield);
    this._shield = shield;

    this._rippleMat = this._mat(
      new THREE.MeshBasicMaterial({
        color: 0xcfeeff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    const ripple = new THREE.Mesh(this._track(new THREE.SphereGeometry(SHIELD_RADIUS, 20, 12)), this._rippleMat);
    ripple.position.copy(shield.position);
    this.group.add(ripple);
    this._rippleMesh = ripple;

    this._spin.push({ obj: core, speed: 0.5 }, { obj: shell, speed: -0.32 }, { obj: outerMesh, speed: 0.06 });
  }

  _fillRing(mesh, segments, y, height) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, height, 1);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      p.set(seg.x, y, seg.z);
      e.set(0, -seg.angle, 0);
      q.setFromEuler(e);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.computeBoundingSphere?.();
  }

  damage(amount) {
    const n = Math.max(0, amount || 0);
    let remaining = n;
    let absorbed = 0;
    if (this.shield > 0) {
      absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) this.hp = Math.max(0, this.hp - remaining);
    this.lastDamageTime = this.time;
    this.flash = Math.min(1.2, this.flash + 0.5 + n / 600);
    if (absorbed > 0) this.ripple = 1;
    if (this.hp <= 0) this.destroyed = true;
    return { hp: this.hp, shield: this.shield, destroyed: this.hp <= 0 };
  }

  heal(amount) {
    const n = Math.max(0, amount || 0);
    this.hp = Math.min(this.maxHp, this.hp + n);
    if (this.hp > 0) this.destroyed = false;
    return this.hp;
  }

  healShield(amount) {
    const n = Math.max(0, amount || 0);
    this.shield = Math.min(this.maxShield, this.shield + n);
    return this.shield;
  }

  get hpRatio() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  get shieldRatio() {
    return this.maxShield > 0 ? this.shield / this.maxShield : 0;
  }

  reset() {
    this.hp = this.maxHp;
    this.shield = this.maxShield;
    this.destroyed = false;
    this.time = 0;
    this.lastDamageTime = -1e9;
    this.flash = 0;
    this.ripple = 0;
    this._applyVisuals();
    return this;
  }

  update(dt) {
    const step = typeof dt === 'number' && isFinite(dt) ? dt : 0;
    this.time += step;
    // keep the group matrix in sync even if `position` is mutated externally
    this.group.updateMatrix();

    // shield regeneration: 2/s after 5s without damage
    if (this.shield < this.maxShield && this.time - this.lastDamageTime >= this.regenDelay) {
      this.shield = Math.min(this.maxShield, this.shield + this.regenRate * step);
    }

    for (const s of this._spin) {
      s.obj.rotation.y += s.speed * step;
      if (s.obj.matrixAutoUpdate === false) {
        s.obj.updateMatrix();
      }
    }
    this._core.rotation.x = Math.sin(this.time * 0.6) * 0.18;
    this._shell.rotation.x = -this._core.rotation.x * 0.7;
    this._shell.scale.setScalar(1 + Math.sin(this.time * 1.6) * 0.04);

    if (this.flash > 0) this.flash = Math.max(0, this.flash - step * 2.4);
    if (this.ripple > 0) {
      this.ripple = Math.max(0, this.ripple - step * 0.9);
    }
    this._applyVisuals();
  }

  _applyVisuals() {
    const t = this.time;
    const shieldFrac = this.shieldRatio;
    const flash = this.flash;

    if (this._coreMat) {
      this._coreMat.emissiveIntensity = 0.75 + 0.3 * Math.sin(t * 1.8) + flash * 1.6;
      this._coreMat.opacity = 0.82 + 0.14 * this.hpRatio;
    }
    if (this._shell.material) this._shell.material.opacity = 0.14 + 0.1 * Math.sin(t * 2.2) + flash * 0.35;
    if (this._shieldMat) {
      this._shieldMat.opacity = 0.05 + 0.05 * shieldFrac + 0.02 * Math.sin(t * 1.1) + flash * 0.12;
      this._shieldMat.color.setHex(shieldFrac > 0.02 ? 0x7fd8ff : 0x6a7684);
    }
    if (this._shield) {
      const r = 1 + Math.sin(t * 0.9) * 0.01;
      this._shield.scale.setScalar(r);
    }
    if (this._wallMat) {
      const pulse = 1 + flash * 0.9;
      this._wallMat.emissive.setRGB(0.1 * pulse, 0.06 * pulse, 0.05 * pulse);
    }
    if (this._rippleMesh) {
      const p = this.ripple;
      const scale = 0.72 + (1 - p) * 0.5;
      this._rippleMesh.scale.setScalar(scale);
      this._rippleMat.opacity = p * 0.4;
      this._rippleMesh.rotation.y = t * 0.7;
    }
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    for (const geo of this._geos) geo.dispose();
    for (const mat of this._mats) mat.dispose();
    this._geos.length = 0;
    this._mats.length = 0;
    this._spin.length = 0;
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }
}

export default CoreBase;

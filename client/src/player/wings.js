// 요새의 수호자 — 요정의 날개 뷰모델(1인칭).
// 카메라 자식으로 붙어 화면 양끝에 깃털이 보인다. 광원은 쓰지 않고 emissive 만 쓴다(성능).
import * as THREE from 'three';
import { FAIRY_WINGS, fairyWingById } from '../data.js';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const FEATHER_COUNT = 6;

function featherGeometry() {
  // 깃털 한 장(가늘고 긴 판) — 공유한다
  return new THREE.BoxGeometry(0.05, 0.5, 0.014);
}

export class WingRig {
  constructor({ camera = null, audio = null } = {}) {
    this.camera = camera;
    this.audio = audio;
    this.root = new THREE.Group();
    this.root.name = 'wingRig';
    this.root.visible = false;
    this._wings = []; // [왼쪽, 오른쪽]
    this._geos = [];
    this._mats = [];
    this._core = null;
    this._trail = null;
    this._key = null;
    this._profile = null;
    this._phase = 0;
    this._spread = 0;
    this._flapRate = 7;
    if (this.camera?.add) this.camera.add(this.root);
  }

  get wingId() {
    return this._profile?.id ?? null;
  }

  get visible() {
    return this.root.visible;
  }

  /** 프로필(WingSystem.flight()) 적용 — 색/티어가 바뀌면 메시를 다시 만든다 */
  setProfile(profile = null) {
    const on = Boolean(profile?.equipped);
    const id = on ? profile.id ?? null : null;
    const wing = fairyWingById(id) ?? (on ? FAIRY_WINGS[0] : null);
    const key = on ? `${id}|${num(profile.color, 0)}|${num(profile.accent, 0)}` : null;
    this._profile = on ? { ...profile, id, name: profile.name ?? wing?.name ?? '요정의 날개' } : null;
    this._flapRate = num(profile?.flap, 7);
    if (key !== this._key) {
      this._key = key;
      this._build(wing, profile);
    }
    this.root.visible = on;
    return this;
  }

  setVisible(on) {
    this.root.visible = Boolean(on) && Boolean(this._profile);
    return this;
  }

  _clear() {
    for (const geo of this._geos) geo.dispose?.();
    for (const mat of this._mats) mat.dispose?.();
    this._geos = [];
    this._mats = [];
    this._wings = [];
    this._core = null;
    this._trail = null;
    while (this.root.children.length) this.root.remove(this.root.children[0]);
  }

  _build(wing, profile) {
    this._clear();
    if (!wing || !profile?.equipped) return;
    const color = num(profile.color, num(wing.color, 0xbff5d0));
    const accent = num(profile.accent, num(wing.accent, 0xfff0b0));
    const glow = num(profile.glow, num(wing.glow, 0x8ff0c0));

    const featherGeo = featherGeometry();
    const membraneGeo = new THREE.PlaneGeometry(0.62, 0.44, 1, 3);
    this._geos.push(featherGeo, membraneGeo);

    const featherMat = new THREE.MeshStandardMaterial({
      color,
      emissive: glow,
      emissiveIntensity: 0.55,
      roughness: 0.55,
      metalness: 0.12,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.85,
      roughness: 0.4,
      metalness: 0.2,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const membraneMat = new THREE.MeshStandardMaterial({
      color,
      emissive: glow,
      emissiveIntensity: 0.32,
      roughness: 0.7,
      metalness: 0.05,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this._mats.push(featherMat, tipMat, membraneMat);

    for (const side of [-1, 1]) {
      const group = new THREE.Group();
      group.name = side < 0 ? 'wingLeft' : 'wingRight';
      // 1인칭 — 카메라 앞쪽 살짝 옆에서 바깥/뒤로 펼쳐진다(화면 양끝에 깃털이 보인다)
      group.position.set(side * 0.3, -0.16, -0.52);
      group.rotation.set(-0.12, side * 0.72, side * 0.12);

      const membrane = new THREE.Mesh(membraneGeo, membraneMat);
      membrane.position.set(side * 0.2, 0.12, -0.08);
      membrane.rotation.set(0, side * 0.5, side * (0.42 + Math.PI / 2));
      membrane.renderOrder = 3;
      membrane.frustumCulled = false;
      group.add(membrane);

      for (let i = 0; i < FEATHER_COUNT; i++) {
        const t = i / (FEATHER_COUNT - 1);
        const len = 0.5 - t * 0.16;
        const feather = new THREE.Mesh(featherGeo, i % 2 === 0 ? featherMat : tipMat);
        feather.position.set(side * (0.06 + t * 0.24), 0.05 + t * 0.22, -0.02 - t * 0.14);
        feather.rotation.set(0, side * (0.1 + t * 0.2), side * (0.18 + t * 0.5));
        feather.scale.set(1 - t * 0.25, len / 0.5, 1 - t * 0.2);
        feather.renderOrder = 2;
        feather.frustumCulled = false;
        group.add(feather);
      }

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), tipMat);
      core.position.set(side * 0.02, 0.02, 0);
      core.frustumCulled = false;
      group.add(core);
      this._geos.push(core.geometry);

      this.root.add(group);
      this._wings.push(group);
    }

    // 등 뒤 발광 코어(요정 가루)
    const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), tipMat);
    coreMesh.position.set(0, -0.3, -0.42);
    coreMesh.renderOrder = 2;
    coreMesh.frustumCulled = false;
    this.root.add(coreMesh);
    this._geos.push(coreMesh.geometry);
    this._core = coreMesh;

    // 비행 잔상(가느다란 판 2장) — 날 때만 보인다
    const trailGeo = new THREE.PlaneGeometry(0.07, 0.5);
    const trailMat = new THREE.MeshBasicMaterial({
      color: glow,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
    this._geos.push(trailGeo);
    this._mats.push(trailMat);
    const trail = new THREE.Group();
    for (const side of [-1, 1]) {
      const plane = new THREE.Mesh(trailGeo, trailMat);
      plane.position.set(side * 0.42, -0.34, -0.62);
      plane.rotation.set(0.2, side * 0.7, side * 0.25);
      plane.frustumCulled = false;
      trail.add(plane);
    }
    trail.visible = false;
    this.root.add(trail);
    this._trail = trail;
  }

  /**
   * 매 프레임 갱신.
   * flying 이면 크게 펄럭이고, 착용만 한 상태면 등 뒤에 접혀 천천히 흔들린다.
   */
  update(dt, { flying = false, speed = 0, ascend = false, dive = false, mana = 1 } = {}) {
    if (!this._profile || !this.root.visible) return this;
    const d = Math.min(0.1, Math.max(0, num(dt)));
    this._phase += d * this._flapRate * (flying ? (ascend ? 1.5 : dive ? 0.55 : 1.1) : 0.28);

    const target = flying ? 1 : 0.34;
    this._spread += (target - this._spread) * (1 - Math.exp(-6 * d));
    const amp = (flying ? 0.44 : 0.14) * this._spread;
    const fast = Math.min(1, num(speed) / 12);

    for (let i = 0; i < this._wings.length; i++) {
      const side = i === 0 ? -1 : 1;
      const group = this._wings[i];
      const flap = Math.sin(this._phase + (side > 0 ? Math.PI : 0)) * amp;
      group.rotation.z = side * (flap + 0.16 * this._spread);
      group.rotation.x = -0.1 - this._spread * (0.24 + fast * 0.12);
      group.rotation.y = side * (0.62 - this._spread * 0.18);
      group.scale.setScalar(0.74 + 0.26 * this._spread);
    }

    if (this._core) {
      const pulse = 0.5 + 0.5 * Math.sin(this._phase * 1.6);
      this._core.material.emissiveIntensity = 0.5 + (flying ? 0.9 : 0.25) * pulse;
      this._core.scale.setScalar(0.9 + pulse * (flying ? 0.35 : 0.12));
    }
    if (this._trail) {
      this._trail.visible = flying && fast > 0.25;
      if (this._trail.visible) {
        this._trail.scale.set(1, 0.6 + fast * 1.1, 1);
        for (const plane of this._trail.children) plane.material.opacity = 0.08 + 0.16 * fast;
      }
    }
    return this;
  }

  dispose() {
    this._clear();
    this.camera?.remove?.(this.root);
    this.root.visible = false;
    this._profile = null;
    this._key = null;
    return this;
  }
}

export default WingRig;

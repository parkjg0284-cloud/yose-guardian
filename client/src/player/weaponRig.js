// 요새의 수호자 — 무기 뷰모델(68종)과 스왑모션 엔진.
// 모든 지오메트리는 절차 생성이며 외부 에셋을 쓰지 않는다.
// 계약: 계열별 메시/모션은 data.js 의 WEAPON_MOTIONS 만 보고 재생한다(하드코딩 금지).
//       모든 무기(68종)는 스왑모션을 가진다 — equip() 이 항상 swap 모션을 재생한다.
//       활 계열은 motion.string 트랙(시위 당김)으로 시위·화살을 뒤로 물린다.
//       가위 계열은 motion.snip 트랙(0=닫힘, 1=활짝)으로 두 날개를 여닫는다(그웬식 스닙).

import * as THREE from 'three';
import { WEAPON_GRADES, MOTION_EASINGS, weaponById, weaponMotion, weaponOrFist, FIST_WEAPON_ID } from '../data.js';
import { buildStaffMesh, disposeObject } from './staff.js';

const GRADE_BY_ID = Object.fromEntries(WEAPON_GRADES.map((g) => [g.id, g]));
const DEFAULT_REST = { pos: [0.34, -0.3, -0.6], rot: [-0.12, 0.18, -0.22], scale: 1 };
const SPECIAL_T = 0.55;

// ──────────────────────────────────────────────── 이징
const EASINGS = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }
};

/** 지원하는 이징 이름 목록(data.js 의 MOTION_EASINGS 와 일치해야 한다) */
export function easingNames() {
  return Object.keys(EASINGS);
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [
  lerp(a?.[0] ?? 0, b?.[0] ?? 0, k),
  lerp(a?.[1] ?? 0, b?.[1] ?? 0, k),
  lerp(a?.[2] ?? 0, b?.[2] ?? 0, k)
];
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** animated 서술자({mesh}) 또는 Object3D 를 실제 3D 객체로 해석한다. */
const targetOf = (entry) => {
  if (!entry) return null;
  if (entry.isObject3D) return entry;
  return entry.mesh?.isObject3D ? entry.mesh : null;
};

/** 모션 키프레임 샘플링 — t(0~1) 지점의 포즈 */
function sampleMotion(motion, t, fallback) {
  const base = fallback ?? DEFAULT_REST;
  const phases = Array.isArray(motion?.phases) ? motion.phases : null;
  if (!phases || phases.length === 0) return { pos: [...base.pos], rot: [...base.rot], scale: base.scale ?? 1 };
  const at = (p) => ({
    pos: p.pos ? [...p.pos] : [...base.pos],
    rot: p.rot ? [...p.rot] : [...base.rot],
    scale: num(p.scale, base.scale ?? 1)
  });
  if (t <= phases[0].t) return at(phases[0]);
  const last = phases[phases.length - 1];
  if (t >= last.t) return at(last);
  for (let i = 0; i < phases.length - 1; i += 1) {
    const a = phases[i];
    const b = phases[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = Math.max(1e-6, b.t - a.t);
      const raw = (t - a.t) / span;
      const ease = EASINGS[b.ease] ?? EASINGS.linear;
      const k = ease(raw);
      return {
        pos: lerp3(a.pos ?? base.pos, b.pos ?? base.pos, k),
        rot: lerp3(a.rot ?? base.rot, b.rot ?? base.rot, k),
        scale: lerp(num(a.scale, base.scale ?? 1), num(b.scale, base.scale ?? 1), k)
      };
    }
  }
  return at(last);
}

/**
 * 모션의 snip 트랙(가위 날개 벌림 0~1)을 t(0~1) 지점에서 샘플링한다.
 * 트랙이 없으면 rest.snip 또는 fallback 을 돌려준다 — 가위 계열 전용(다른 계열은 무시).
 */
export function sampleSnip(motions, name, t, fallback = 0.35) {
  const track = name && Array.isArray(motions?.[name]?.snip) ? motions[name].snip : null;
  const rest = Number.isFinite(Number(motions?.rest?.snip)) ? Number(motions.rest.snip) : fallback;
  if (!track || track.length === 0) return rest;
  if (t <= track[0].t) return num(track[0].open, rest);
  const last = track[track.length - 1];
  if (t >= last.t) return num(last.open, rest);
  for (let i = 0; i < track.length - 1; i += 1) {
    const a0 = track[i];
    const b0 = track[i + 1];
    if (t >= a0.t && t <= b0.t) {
      const span = Math.max(1e-6, b0.t - a0.t);
      const ease = EASINGS[b0.ease] ?? EASINGS.linear;
      return lerp(num(a0.open, rest), num(b0.open, rest), ease((t - a0.t) / span));
    }
  }
  return num(last.open, rest);
}

// ──────────────────────────────────────────────── 머티리얼/지오메트리 헬퍼
function metal(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.6,
    roughness: opts.roughness ?? 0.35,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1
  });
}

function box(w, h, d, material, pos = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

function cyl(rTop, rBottom, h, material, segments = 8) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
}

function emptyAnimated() {
  return { rings: [], particles: [], orbs: [], shards: [], spin: [], petals: [] };
}

// ──────────────────────────────────────────────── 계열별 메시 빌더
function buildSword({ length = 0.95, width = 0.075, color, glow, tier = 1, twoHanded = false }) {
  const group = new THREE.Group();
  const bladeMat = metal(color, {
    metalness: 0.9,
    roughness: 0.22,
    emissive: glow,
    emissiveIntensity: 0.12 + (tier - 1) * 0.07
  });
  const hiltMat = metal(twoHanded ? 0x4a3a2a : 0x5c4630, { metalness: 0.55, roughness: 0.55 });
  const gripMat = metal(0x2b2118, { metalness: 0.2, roughness: 0.9 });
  const gripLen = twoHanded ? 0.4 : 0.16;

  const blade = new THREE.Mesh(new THREE.BoxGeometry(width, length, width * 0.22), bladeMat);
  blade.position.y = gripLen / 2 + 0.06 + length / 2;
  group.add(blade);

  const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.72, width * 2.1, 4), bladeMat);
  tip.position.y = blade.position.y + length / 2 + width * 1.0;
  tip.rotation.y = Math.PI / 4;
  group.add(tip);

  const guard = box(twoHanded ? 0.3 : 0.21, 0.035, 0.07, hiltMat, [0, gripLen / 2 + 0.05, 0]);
  group.add(guard);

  const grip = cyl(width * 0.42, width * 0.45, gripLen, gripMat, 8);
  grip.position.y = gripLen / 2;
  group.add(grip);

  const pommel = new THREE.Mesh(new THREE.SphereGeometry(width * 0.55, 10, 8), hiltMat);
  pommel.position.y = -0.015;
  group.add(pommel);

  const animated = emptyAnimated();
  if (tier >= 6) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(width * 1.5, 0.006, 8, 24),
      metal(color, { emissive: glow, emissiveIntensity: 1.1, transparent: true, opacity: 0.7 })
    );
    ring.position.y = blade.position.y;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    animated.rings.push(ring);
  }
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(width * 0.5, 10, 8),
    metal(color, { emissive: glow, emissiveIntensity: 0.8, transparent: true, opacity: 0.85 })
  );
  orb.position.set(0, gripLen / 2 + 0.05, 0);
  group.add(orb);
  animated.orbs.push(orb);
  group.userData.animated = animated;
  group.userData.headLocal = new THREE.Vector3(0, blade.position.y + length * 0.4, 0);
  return { group, animated };
}

function buildScythe({ color, glow, tier = 1 }) {
  const group = new THREE.Group();
  const shaftMat = metal(0x3a2f26, { metalness: 0.25, roughness: 0.85 });
  const bladeMat = metal(color, {
    metalness: 0.85,
    roughness: 0.25,
    emissive: glow,
    emissiveIntensity: 0.14 + (tier - 1) * 0.08
  });
  const shaft = cyl(0.028, 0.034, 1.72, shaftMat, 8);
  group.add(shaft);

  const blade = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.026, 8, 26, Math.PI * 0.85), bladeMat);
  blade.position.set(0.0, 0.78, 0);
  blade.rotation.set(0, Math.PI / 2, Math.PI * 0.15);
  group.add(blade);

  const spine = box(0.03, 0.5, 0.03, shaftMat, [0, 0.9, 0.22]);
  group.add(spine);

  const animated = emptyAnimated();
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    metal(color, { emissive: glow, emissiveIntensity: 1.0, transparent: true, opacity: 0.9 })
  );
  orb.position.set(0, 0.78, 0);
  group.add(orb);
  animated.orbs.push(orb);
  animated.spin.push(blade);
  group.userData.animated = animated;
  group.userData.headLocal = new THREE.Vector3(0, 0.86, 0);
  return { group, animated };
}

function buildKatana({ color, glow, tier = 1 }) {
  const group = new THREE.Group();
  // 외날 · 살짝 휜 칼날을 6토막으로 이어 곡선을 만든다(칼날 면은 ±Z, 등은 -X).
  const bladeMat = metal(color, {
    metalness: 0.95,
    roughness: 0.14,
    emissive: glow,
    emissiveIntensity: 0.12 + (tier - 1) * 0.07
  });
  const edgeMat = metal(0xffffff, {
    metalness: 0.8, roughness: 0.1, emissive: glow, emissiveIntensity: 0.85, transparent: true, opacity: 0.8
  });
  const guardMat = metal(0x2b2620, { metalness: 0.75, roughness: 0.35 });
  const wrapMat = metal(0x1b181d, { metalness: 0.18, roughness: 0.95 });
  const gripLen = 0.26;
  const segs = 6;
  const segLen = 0.165;
  const bow = 0.075;
  let y = gripLen / 2 + 0.055;
  for (let i = 0; i < segs; i += 1) {
    const t = i / (segs - 1);
    const w = 0.026 - t * 0.006;
    const seg = new THREE.Mesh(new THREE.BoxGeometry(w, segLen, 0.055 - t * 0.012), bladeMat);
    seg.position.set(bow * t * t, y + segLen / 2, 0);
    seg.rotation.z = -0.16 * t;
    group.add(seg);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w * 0.24, segLen * 0.96, 0.012), edgeMat);
    edge.position.set(seg.position.x - w * 0.52, seg.position.y, 0);
    edge.rotation.z = seg.rotation.z;
    group.add(edge);
    y += segLen * 0.99;
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.05, 4), bladeMat);
  tip.position.set(bow, y + 0.012, 0);
  tip.rotation.set(0, Math.PI / 4, -0.3);
  group.add(tip);

  // 츠바(코등이) · 사야 흉내의 둥근 고리
  const tsuba = cyl(0.055, 0.055, 0.014, guardMat, 14);
  tsuba.position.y = gripLen / 2 + 0.03;
  group.add(tsuba);
  const tsubaOrb = new THREE.Mesh(
    new THREE.SphereGeometry(0.017, 10, 8),
    metal(color, { emissive: glow, emissiveIntensity: 0.9, transparent: true, opacity: 0.85 })
  );
  tsubaOrb.position.set(0.045, gripLen / 2 + 0.03, 0);
  group.add(tsubaOrb);

  // 손잡이(츠카) — 감은 끈을 링으로 표현
  const wrap = cyl(0.021, 0.023, gripLen, wrapMat, 10);
  wrap.position.y = gripLen / 2;
  group.add(wrap);
  for (let i = 0; i < 4; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0235, 0.0045, 6, 12), guardMat);
    ring.position.y = 0.04 + i * 0.055;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.021, 10, 8), guardMat);
  pommel.position.y = -0.012;
  group.add(pommel);

  const animated = emptyAnimated();
  if (tier >= 6) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.005, 8, 24),
      metal(color, { emissive: glow, emissiveIntensity: 1.1, transparent: true, opacity: 0.7 })
    );
    ring.position.set(bow * 0.5, y * 0.55, 0);
    ring.rotation.set(Math.PI / 2, 0, 0.2);
    group.add(ring);
    animated.rings.push(ring);
  }
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 10, 8),
    metal(color, { emissive: glow, emissiveIntensity: 0.85, transparent: true, opacity: 0.85 })
  );
  orb.position.set(0, gripLen / 2 + 0.03, 0);
  group.add(orb);
  animated.orbs.push(orb);
  animated.spin.push(tsubaOrb);
  group.userData.animated = animated;
  group.userData.headLocal = new THREE.Vector3(bow, y * 0.92, 0);
  return { group, animated };
}

function buildDagger({ color, glow, tier = 1 }) {
  const group = new THREE.Group();
  const bladeMat = metal(color, {
    metalness: 0.92,
    roughness: 0.18,
    emissive: glow,
    emissiveIntensity: 0.1 + (tier - 1) * 0.07
  });
  const gripMat = metal(0x241c16, { metalness: 0.2, roughness: 0.9 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.36, 0.012), bladeMat);
  blade.position.y = 0.28;
  group.add(blade);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.1, 4), bladeMat);
  tip.position.y = 0.5;
  tip.rotation.y = Math.PI / 4;
  group.add(tip);
  const guard = box(0.09, 0.018, 0.035, bladeMat, [0, 0.1, 0]);
  group.add(guard);
  const grip = cyl(0.016, 0.018, 0.12, gripMat, 8);
  grip.position.y = 0.045;
  group.add(grip);
  const animated = emptyAnimated();
  group.userData.animated = animated;
  group.userData.headLocal = new THREE.Vector3(0, 0.52, 0);
  return { group, animated };
}

/**
 * 가위 — 두 날개가 중심 나사를 축으로 여닫힌다(그웬의 의수 가위).
 * 위쪽은 날, 아래쪽은 손잡이 고리, 중심에는 시간 룬이 돈다.
 * 벌림 각도는 data.js 의 motion.snip 트랙을 _animateMesh 가 해석해 넣는다.
 */
function buildScissors({ color, glow, tier = 1 }) {
  const group = new THREE.Group();
  group.name = 'weapon_scissors';
  const a = emptyAnimated();
  const steel = metal(color, {
    metalness: 0.92,
    roughness: 0.2,
    emissive: glow,
    emissiveIntensity: 0.14 + (tier - 1) * 0.08
  });
  const edge = metal(0xf2f8ff, { metalness: 0.95, roughness: 0.1, emissive: glow, emissiveIntensity: 0.22 });
  const gripMat = metal(0x2b2f3a, { metalness: 0.25, roughness: 0.85 });
  const runeMat = metal(0xbfe6ff, {
    metalness: 0.35,
    roughness: 0.3,
    emissive: 0xbfe6ff,
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.9
  });

  // 중심(나사) — 두 날개가 이 점을 축으로 돈다
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.46, 0);
  group.add(pivot);

  const arms = [];
  for (const side of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.z = side * 0.026;
    pivot.add(arm);
    // 날 — 위로 뻗은 판 + 날카로운 끝
    arm.add(box(0.062, 0.5, 0.016, steel, [side * 0.03, 0.32, 0]));
    arm.add(box(0.018, 0.44, 0.008, edge, [side * 0.062, 0.31, 0]));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.031, 0.14, 4), steel);
    tip.position.set(side * 0.03, 0.64, 0);
    tip.rotation.y = Math.PI / 4;
    arm.add(tip);
    // 손잡이 — 아래로 내려온 목 + 고리
    arm.add(box(0.03, 0.16, 0.014, steel, [side * 0.012, 0.03, 0]));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.011, 8, 18), gripMat);
    ring.position.set(side * -0.02, -0.13, 0);
    ring.rotation.y = Math.PI / 2;
    arm.add(ring);
    arms.push({ mesh: arm, side });
  }

  // 중심 나사 + 시간 룬(천천히 돈다)
  const screw = cyl(0.036, 0.036, 0.08, edge, 12);
  screw.position.set(0, 0.46, 0);
  screw.rotation.x = Math.PI / 2;
  group.add(screw);
  const rune = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.006, 8, 20), runeMat);
  rune.position.set(0, 0.46, 0.032);
  group.add(rune);
  a.rings.push({ mesh: rune, axis: 'z', speed: 1.1 });

  // 날개 벌림 서술자 — base/spread 는 라디안, open 은 snip 트랙(0~1+)
  a.snip = { arms, base: 0.22, spread: 0.34, rest: 0.35, breath: 0.05 };
  group.userData.animated = a;
  group.userData.headLocal = new THREE.Vector3(0, 1.05, 0);
  return { group, animated: a };
}
/**
 * 활 — 리스(손잡이) + 위/아래 리커브 림 + 시위 + 걸린 화살.
 * 당김은 data.js WEAPON_MOTIONS.bow.string 트랙(max·flex)을 보고 _animateMesh 가 표현한다.
 */
function buildBow({ color, glow, tier = 1 }) {
  const group = new THREE.Group();
  group.name = 'weapon_bow';
  const a = emptyAnimated();

  const woodMat = metal(0x5a3a24, { metalness: 0.12, roughness: 0.85 });
  const limbMat = metal(color, {
    emissive: glow > 0 ? color : 0x000000,
    emissiveIntensity: 0.5,
    metalness: 0.6,
    roughness: 0.38
  });
  const trimMat = metal(0xf1e7d2, { metalness: 0.85, roughness: 0.24 });
  const stringMat = metal(0xf6efdc, { metalness: 0.15, roughness: 0.6, transparent: true, opacity: 0.92 });

  // 리스 — 등급이 높을수록 장식이 늘어난다
  group.add(box(0.052, 0.3 + tier * 0.004, 0.06, woodMat, [0, 0, 0]));
  group.add(box(0.062, 0.05, 0.05, trimMat, [0, 0.14, 0.004]));
  group.add(box(0.062, 0.05, 0.05, trimMat, [0, -0.14, 0.004]));
  if (tier >= 3) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), limbMat);
    gem.position.set(0, 0, -0.036);
    group.add(gem);
    a.orbs.push(gem);
  }

  // 위/아래 림 — 곡선 튜브. 당길 때 림 그룹을 조금 돌려 휘어짐을 표현한다.
  const limbs = [];
  for (const sign of [1, -1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.004, sign * 0.16, -0.035),
      new THREE.Vector3(0.002, sign * 0.3, -0.1),
      new THREE.Vector3(0, sign * 0.39, -0.02)
    ]);
    const limb = new THREE.Group();
    limb.position.set(0, sign * 0.14, 0.012);
    limb.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, Math.max(0.011, 0.017 - tier * 0.0006), 6, false), limbMat));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), trimMat);
    tip.position.set(0, sign * 0.39, -0.02);
    limb.add(tip);
    if (tier >= 5) {
      const rune = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, 6, 14), trimMat);
      rune.position.set(0, sign * 0.2, -0.05);
      rune.rotation.y = Math.PI / 2;
      limb.add(rune);
      a.rings.push({ mesh: rune, axis: 'x', speed: sign * 0.9 });
    }
    group.add(limb);
    limbs.push({ group: limb, sign });
  }

  // 시위 — 팁에서 중앙(노크)까지 두 토막. 당기면 피벗이 돌아 V 자가 된다.
  const strings = [];
  for (const sign of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, sign * 0.53, -0.008);
    const seg = cyl(0.005, 0.005, 0.53, stringMat, 5);
    seg.position.y = -sign * 0.265;
    pivot.add(seg);
    group.add(pivot);
    strings.push({ pivot, seg, sign });
  }

  // 걸린 화살 — 촉이 앞(-z)을 향한다
  const arrow = new THREE.Group();
  const shaft = cyl(0.007, 0.007, 0.64, metal(0xd9c6a1, { metalness: 0.25, roughness: 0.62 }), 6);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.18;
  arrow.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.08, 8), limbMat);
  head.rotation.x = -Math.PI / 2;
  head.position.z = -0.53;
  arrow.add(head);
  const fletchMat = metal(0xf3d8e4, { metalness: 0.1, roughness: 0.75, transparent: true, opacity: 0.95 });
  for (const rot of [0, Math.PI / 2]) {
    const fin = box(0.055, 0.005, 0.085, fletchMat, [0, 0, 0.09]);
    fin.rotation.z = rot;
    arrow.add(fin);
  }
  arrow.position.set(0, 0, 0.02);
  group.add(arrow);

  // 총구 — 화살촉 끝(투사체 시작점)
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -0.55);
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  group.userData.headLocal = new THREE.Vector3(0, 0.2, -0.4);

  a.bow = { strings, limbs, arrow, max: 0.3, flex: 0.07, stringBase: 0.53 };
  group.userData.animated = a;
  return { group, animated: a };
}

function buildDreamTree({ color, glow, animated }) {
  const group = new THREE.Group();
  group.name = 'weapon_dream_tree';
  const a = animated ?? emptyAnimated();
  const trunkMat = metal(0x6b4a3a, { metalness: 0.05, roughness: 0.92 });
  const trunk = cyl(0.026, 0.05, 1.34, trunkMat, 8);
  trunk.position.y = 0.16;
  group.add(trunk);

  const branchMat = metal(0x7a5540, { metalness: 0.05, roughness: 0.9 });
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const branch = cyl(0.011, 0.019, 0.3, branchMat, 6);
    branch.position.set(Math.cos(angle) * 0.09, 0.52 + i * 0.07, Math.sin(angle) * 0.09);
    branch.rotation.set(Math.cos(angle) * 0.95, 0, Math.sin(angle) * 0.95);
    group.add(branch);
  }

  const blossomMat = metal(color, { emissive: color, emissiveIntensity: 0.6, roughness: 0.55, metalness: 0.1 });
  for (let i = 0; i < 11; i += 1) {
    const angle = (i / 11) * Math.PI * 2 + i * 0.7;
    const r = 0.1 + (i % 3) * 0.05;
    const blossom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.032 + (i % 3) * 0.008, 0), blossomMat);
    blossom.position.set(Math.cos(angle) * r, 0.6 + (i % 4) * 0.07, Math.sin(angle) * r);
    group.add(blossom);
    a.orbs.push(blossom);
  }

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.27, 0.007, 8, 30),
    metal(0xffd9e8, { emissive: 0xffb8d0, emissiveIntensity: 1.0, transparent: true, opacity: 0.72 })
  );
  halo.position.y = 0.82;
  halo.rotation.x = Math.PI / 2;
  group.add(halo);
  a.rings.push(halo);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 10),
    metal(0xfff0f6, { emissive: 0xffb8d0, emissiveIntensity: 1.4, transparent: true, opacity: 0.92 })
  );
  core.position.y = 0.84;
  group.add(core);
  a.orbs.push(core);

  const petalMat = metal(0xffc9dd, {
    emissive: 0xffb8d0,
    emissiveIntensity: 0.55,
    roughness: 0.7,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  for (let i = 0; i < 6; i += 1) {
    const petal = new THREE.Mesh(new THREE.CircleGeometry(0.034, 6), petalMat);
    petal.position.set(Math.cos(i) * 0.22, 0.5 + i * 0.1, Math.sin(i) * 0.22);
    group.add(petal);
    a.petals.push({ mesh: petal, phase: i * 1.1, radius: 0.18 + (i % 3) * 0.06, base: 0.5 + i * 0.1 });
  }

  group.userData.animated = a;
  group.userData.headLocal = new THREE.Vector3(0, 0.86, 0);
  return { group, animated: a };
}

/**
 * 무기 id → 뷰모델 메시. 반환: { group, animated, weapon }
 * 계열별 실루엣이 다르며, 등급 색상/발광이 반영된다.
 */
export function buildWeaponMesh(weaponId, opts = {}) {
  const weapon = weaponById(weaponId);
  if (!weapon) return null;
  const grade = GRADE_BY_ID[weapon.grade] ?? GRADE_BY_ID.common;
  const color = num(opts.color, grade.color);
  const glow = num(opts.glow, grade.glow);
  const tier = Math.max(1, num(weapon.tier, 1));
  // 형태는 무기별 model 오버라이드를 우선한다(예: 꿈의 끝은 희망 = 꿈나무지만 낫).
  const shape = weapon.model ?? weapon.family;
  let built;

  if (shape === 'staff') {
    const relic = weaponId === 'staff_relic' ? 'time' : weaponId === 'staff_genesis' ? 'genesis' : null;
    const tier6 = Math.max(1, Math.min(6, relic ? 6 : tier));
    const group = buildStaffMesh({ tier: tier6, element: weapon.element ?? 'arcane', relic });
    const animated = group.userData.animated ?? emptyAnimated();
    group.userData.animated = animated;
    built = { group, animated };
  } else if (shape === 'sword1h') {
    built = buildSword({ length: 0.92, width: 0.07, color, glow, tier, twoHanded: false });
  } else if (shape === 'sword2h') {
    built = buildSword({ length: 1.4, width: 0.105, color, glow, tier, twoHanded: true });
  } else if (shape === 'scythe') {
    built = buildScythe({ color, glow, tier });
  } else if (shape === 'katana') {
    built = buildKatana({ color, glow, tier });
  } else if (shape === 'dagger') {
    built = buildDagger({ color, glow, tier });
  } else if (shape === 'scissors') {
    built = buildScissors({ color, glow, tier });
  } else if (shape === 'dream') {
    built = buildDreamTree({ color, glow, animated: emptyAnimated() });
  } else if (shape === 'bow') {
    built = buildBow({ color, glow, tier });
  } else {
    built = buildSword({ length: 0.9, width: 0.07, color, glow, tier });
  }

  const group = built.group;
  group.name = group.name && group.name !== '' ? group.name : `weapon_${weaponId}`;
  group.userData.weaponId = weapon.id;
  group.userData.family = weapon.family;
  group.userData.model = shape;
  group.userData.grade = weapon.grade;
  group.userData.animated = built.animated ?? group.userData.animated ?? emptyAnimated();
  if (weapon.grade === 'relic' || weapon.secret) {
    group.userData.premium = true;
  }
  return { group, animated: group.userData.animated, weapon, color, glow };
}

// ──────────────────────────────────────────────── 뷰모델
export class WeaponRig {
  constructor({ camera = null, weaponId = null, audio = null, rng = null } = {}) {
    this.camera = camera;
    this.audio = audio;
    this.rng = rng;
    this.root = new THREE.Group();
    this.root.name = 'weaponRig';
    this._mesh = null;
    this._animated = emptyAnimated();
    this._weapon = null;
    this._motions = null;
    this._motionName = null;
    this._t = 0;
    this._duration = 0;
    this._state = 'idle';
    this._released = false;
    this._specialFired = false;
    this._ultimateId = null;
    this._swayT = 0;
    this._recoil = { t: 0, duration: 0, kick: [0, 0, 0], rot: [0, 0, 0], power: 1 };
    this._pose = { pos: [...DEFAULT_REST.pos], rot: [...DEFAULT_REST.rot], scale: 1 };
    this.releaseCount = 0;
    this.lastSpecial = null;
    this.onRelease = null;
    this.onSwapSpecial = null;
    if (this.camera?.add) this.camera.add(this.root);
    this.equip(weaponId, { instant: true, silent: true });
  }

  get weapon() { return this._weapon; }
  get id() { return this._weapon?.id ?? null; }
  get family() { return this._weapon?.family ?? null; }
  get tier() { return num(this._weapon?.tier, 1); }
  get state() { return this._state; }
  get swapping() { return this._state === 'swapping'; }
  get progress() { return this._duration > 0 ? Math.min(1, this._t / this._duration) : 1; }
  get motion() {
    if (!this._motions || !this._motionName) return null;
    return this._motions[this._motionName] ?? null;
  }
  get restPose() {
    const rest = this._motions?.rest ?? DEFAULT_REST;
    return { pos: [...(rest.pos ?? DEFAULT_REST.pos)], rot: [...(rest.rot ?? DEFAULT_REST.rot)], scale: num(rest.scale, 1) };
  }
  get muzzlePosition() {
    const anchor = this._mesh?.userData?.muzzle ?? null;
    const v = new THREE.Vector3();
    if (anchor) {
      this.root.updateWorldMatrix(true, true);
      anchor.getWorldPosition(v);
      return v;
    }
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldPosition(v);
    const head = this._mesh?.userData?.headLocal;
    if (head) v.add(head.clone().applyEuler(this.root.rotation));
    return v;
  }
  get specialFired() { return this._specialFired; }
  get mesh() { return this._mesh; }

  /** 무기 장착 — 항상 스왑모션을 재생한다. */
  equip(id, { instant = false, silent = false } = {}) {
    // id 가 null/'fists' 면 맨손 — 뷰모델 없이 주먹 임펙트만 나간다.
    const weapon = weaponOrFist(id);
    if (!weapon) return { ok: false, error: '알 수 없는 무기입니다' };
    const bare = weapon.id === FIST_WEAPON_ID;
    const motions = bare ? null : weaponMotion(id) ?? null;
    const swap = motions?.swap ?? null;
    this._weapon = weapon;
    this._motions = motions;
    this._build(weapon);
    if (!silent && this.audio) {
      try { this.audio.play?.('swap', { family: weapon.family }); } catch { /* 사운드 실패는 무시 */ }
    }
    if (instant || !swap) {
      this._state = 'idle';
      this._motionName = null;
      this._t = 0;
      this._duration = 0;
      this._released = true;
      this._specialFired = true;
      const rest = this.restPose;
      this._pose = { pos: [...rest.pos], rot: [...rest.rot], scale: rest.scale };
      this._applyPose();
      return { ok: true, id: weapon.id, family: weapon.family, duration: 0, style: null, instant: true };
    }
    this._state = 'swapping';
    this._motionName = 'swap';
    this._t = 0;
    this._duration = Math.max(0.05, num(swap.duration, 0.4));
    this._released = false;
    this._specialFired = false;
    return { ok: true, id: weapon.id, family: weapon.family, duration: this._duration, style: swap.style ?? null };
  }

  swapTo(id, opts = {}) {
    return this.equip(id, opts);
  }

  /** 공격 모션 */
  triggerAttack({ nonLethal = false } = {}) {
    const motion = this._motions?.attack ?? null;
    if (!motion) return false;
    this._state = 'attacking';
    this._motionName = 'attack';
    this._t = 0;
    this._duration = Math.max(0.05, num(motion.duration, 0.3));
    this._released = false;
    this._nonLethal = !!nonLethal;
    if (this.audio) {
      try { this.audio.play?.(nonLethal ? 'salvation' : 'fire', { family: this.family }); } catch { /* 무시 */ }
    }
    return true;
  }

  /** 궁극기(스킬) 모션 */
  triggerSkill(ultimateId = null) {
    const motion = this._motions?.skill ?? null;
    if (!motion) return false;
    this._state = 'skilling';
    this._motionName = 'skill';
    this._t = 0;
    this._duration = Math.max(0.05, num(motion.duration, 0.8));
    this._released = false;
    this._specialFired = false;
    this._ultimateId = ultimateId;
    if (this.audio) {
      try { this.audio.play?.(ultimateId === 'dreamsEnd' ? 'ultimateSalvation' : 'relic'); } catch { /* 무시 */ }
    }
    return true;
  }

  /** 명중 반동 */
  triggerRecoil(power = 1) {
    const recoil = this._motions?.recoil ?? null;
    if (!recoil) return false;
    this._recoil = {
      t: 0,
      duration: Math.max(0.02, num(recoil.duration, 0.2)),
      kick: Array.isArray(recoil.kick) ? recoil.kick : [0, 0.02, 0.06],
      rot: Array.isArray(recoil.rot) ? recoil.rot : [-0.1, 0, 0],
      power: Math.max(0, num(power, 1))
    };
    return true;
  }

  update(dt, { moving = false, casting = false, speed = 0, grounded = true } = {}) {
    const step = Math.max(0, Math.min(num(dt, 0), 0.1));
    this._swayT += step;

    if (this._motionName) {
      this._t += step;
      const p = this.progress;
      const motion = this.motion;
      if (this._motionName === 'swap' && !this._specialFired && motion?.special && p >= SPECIAL_T) {
        this._specialFired = true;
        this.lastSpecial = motion.special;
        try { this.onSwapSpecial?.(motion.special); } catch { /* 콜백 실패는 무시 */ }
      }
      if (motion && motion.release !== undefined && !this._released && p >= num(motion.release, 0.5)) {
        this._released = true;
        this.releaseCount += 1;
        try {
          this.onRelease?.({
            id: this.id,
            family: this.family,
            motion: this._motionName,
            ultimateId: this._ultimateId,
            nonLethal: !!motion.nonLethal
          });
        } catch { /* 콜백 실패는 무시 */ }
      }
      if (this._t >= this._duration) {
        this._state = 'idle';
        this._motionName = null;
        this._t = 0;
        this._duration = 0;
        this._ultimateId = null;
      }
    }

    if (this._recoil.duration > 0) {
      this._recoil.t += step;
      if (this._recoil.t >= this._recoil.duration) {
        this._recoil = { t: 0, duration: 0, kick: [0, 0, 0], rot: [0, 0, 0], power: 1 };
      }
    }

    this._pose = this._composePose({ moving, speed, grounded, casting });
    this._applyPose();
    this._animateMesh(step);
    return this._pose;
  }

  debugPose() {
    return { pos: [...this._pose.pos], rot: [...this._pose.rot], scale: this._pose.scale };
  }

  // ── 호환 API (기존 main.js 의 지팡이 경로)
  setTier(tier) {
    if (this._weapon?.family !== 'staff') return false;
    const next = { ...this._weapon, tier: Math.max(1, num(tier, 1)) };
    this._weapon = next;
    this._build(next);
    return true;
  }

  setElement(element) {
    if (!this._weapon) return false;
    this._weapon = { ...this._weapon, element };
    this._build(this._weapon);
    return true;
  }

  setRelic(relic) {
    if (!relic) return false;
    const target = relic === 'genesis' ? 'staff_genesis' : 'staff_relic';
    return this.equip(target, { silent: true }).ok;
  }

  playCast() {
    if (this._state === 'idle') this.triggerAttack();
    return true;
  }

  playHit(power = 1) {
    return this.triggerRecoil(power);
  }

  dispose() {
    if (this._mesh) {
      this.root.remove(this._mesh);
      disposeObject(this._mesh);
      this._mesh = null;
    }
    this.camera?.remove?.(this.root);
    disposeObject(this.root);
    this._animated = emptyAnimated();
    this._motions = null;
    this._weapon = null;
    return true;
  }

  // ── 내부
  _build(weapon) {
    if (this._mesh) {
      this.root.remove(this._mesh);
      disposeObject(this._mesh);
      this._mesh = null;
    }
    if (weapon?.id === FIST_WEAPON_ID) {
      // 맨손 — 들고 있을 메시가 없다(모션도 없음). 이전 무기의 애니메이션 핸들은 반드시 비운다.
      this._animated = emptyAnimated();
      return true;
    }
    const built = buildWeaponMesh(weapon.id);
    if (!built) return false;
    this._mesh = built.group;
    this._animated = built.animated ?? emptyAnimated();
    this.root.add(this._mesh);
    return true;
  }

  _composePose({ moving, speed, grounded }) {
    const rest = this.restPose;
    const motion = this.motion;
    const sampled = motion ? sampleMotion(motion, this.progress, rest) : rest;

    const pos = [...sampled.pos];
    const rot = [...sampled.rot];
    let scale = num(sampled.scale, 1);

    // 반동
    if (this._recoil.duration > 0) {
      const k = 1 - this._recoil.t / this._recoil.duration;
      const decay = Math.max(0, k) * this._recoil.power;
      pos[0] += this._recoil.kick[0] * decay;
      pos[1] += this._recoil.kick[1] * decay;
      pos[2] += this._recoil.kick[2] * decay;
      rot[0] += this._recoil.rot[0] * decay;
      rot[1] += this._recoil.rot[1] * decay;
      rot[2] += this._recoil.rot[2] * decay;
    }

    // 이동 보브/스웨이
    const intensity = moving ? Math.min(1.7, 0.7 + num(speed, 0) * 0.12) : 0.22;
    const bob = Math.sin(this._swayT * 8.5) * 0.016 * intensity;
    const side = Math.cos(this._swayT * 4.2) * 0.013 * intensity;
    pos[0] += side;
    pos[1] += grounded === false ? 0.02 : bob;
    rot[2] += side * 0.7;
    rot[0] += bob * 0.5;
    return { pos, rot, scale };
  }

  _applyPose() {
    const p = this._pose;
    this.root.position.set(p.pos[0], p.pos[1], p.pos[2]);
    this.root.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    this.root.scale.setScalar(num(p.scale, 1));
  }

  _animateMesh(dt) {
    const a = this._animated;
    if (!a) return;
    const t = this._swayT;
    // staff.js 의 animated 항목은 { mesh, speed, axis, base, pulse ... } 서술자이고,
    // 이 모듈이 직접 만든 항목은 Object3D 자체다 — 둘 다 지원한다.
    for (const entry of a.rings ?? []) {
      const o = targetOf(entry);
      if (!o?.rotation) continue;
      const axis = entry.axis ?? 'z';
      o.rotation[axis] = (o.rotation[axis] ?? 0) + dt * num(entry.speed, 1.2);
    }
    for (const entry of a.orbs ?? []) {
      const o = targetOf(entry);
      if (!o?.scale?.setScalar) continue;
      o.scale.setScalar(1 + Math.sin(t * 2.6 + num(entry.base, 0)) * num(entry.pulse, 0.08));
    }
    for (const entry of a.spin ?? []) {
      const o = targetOf(entry);
      if (!o?.rotation) continue;
      o.rotation.z = (o.rotation.z ?? 0) + dt * num(entry.speed, 0.6);
    }
    for (const entry of a.shards ?? []) {
      const o = targetOf(entry);
      if (!o?.position) continue;
      const phase = num(entry.phase, 0) + t * num(entry.speed, 0.7);
      const orbit = num(entry.orbit, 0.2);
      o.position.set(
        Math.cos(phase) * orbit,
        num(entry.height, 0.6) + Math.sin(t * 1.4 + phase) * num(entry.bob, 0.05),
        Math.sin(phase) * orbit
      );
    }
    for (const entry of a.particles ?? []) {
      const o = targetOf(entry);
      if (!o?.rotation) continue;
      o.rotation.y = (o.rotation.y ?? 0) + dt * num(entry.speed, 0.4);
    }
    // 가위 날개 — 모션의 snip 트랙을 따라 여닫는다(대기 중에는 살짝 숨쉰다).
    const snip = a.snip ?? null;
    if (snip?.arms?.length) {
      const base = num(snip.base, 0.22);
      const spread = num(snip.spread, 0.34);
      let open = sampleSnip(this._motions, this._motionName, this.progress, num(snip.rest, 0.35));
      if (!this._motionName) open += Math.sin(t * 1.7) * num(snip.breath, 0.05);
      open = Math.max(0, open);
      for (const arm of snip.arms) {
        const o = arm?.mesh ?? arm;
        if (!o?.rotation) continue;
        o.rotation.z = -num(arm.side, 1) * (base + open * spread);
      }
    }

    // 활 — 시위 당김 트랙(공격 모션 진행도)에 맞춰 시위와 화살을 뒤로 물린다.
    const bow = a.bow ?? null;
    if (bow) {
      const track = this._motions?.string ?? null;
      const max = num(track?.max, num(bow.max, 0.3));
      let draw;
      if (this._motionName === 'swap') {
        draw = Math.sin(Math.min(1, this.progress) * Math.PI) * 0.3;
      } else if (this._motionName === 'attack' || this._motionName === 'skill') {
        const rel = Math.max(0.05, num(this.motion?.release, 0.62));
        const p = this.progress;
        draw = p < rel ? p / rel : Math.max(0, 1 - (p - rel) / Math.max(0.05, 1 - rel));
      } else {
        draw = 0.14 + Math.sin(t * 1.7) * 0.05;
      }
      draw = Math.max(0, Math.min(1.2, draw));
      const pull = draw * max;
      const half = num(bow.stringBase, 0.53);
      const len = Math.sqrt(half * half + pull * pull);
      const ang = Math.asin(Math.min(0.999, pull / len));
      for (const s of bow.strings ?? []) {
        if (!s?.pivot) continue;
        s.pivot.rotation.x = s.sign === 1 ? -ang : ang;
        if (s.seg?.scale) s.seg.scale.y = len / half;
      }
      if (bow.arrow) bow.arrow.position.z = 0.02 + pull;
      for (const l of bow.limbs ?? []) {
        if (!l?.group) continue;
        l.group.rotation.x = l.sign * num(track?.flex, num(bow.flex, 0.07)) * draw;
      }
    }

    for (const petal of a.petals ?? []) {
      const mesh = petal?.mesh;
      if (!mesh) continue;
      const phase = num(petal.phase, 0);
      const radius = num(petal.radius, 0.2);
      const base = num(petal.base, 0.5);
      const k = (t * 0.6 + phase) % (Math.PI * 2);
      mesh.position.set(Math.cos(k) * radius, base + Math.sin(k * 1.7) * 0.06 + 0.04 * Math.sin(t + phase), Math.sin(k) * radius);
      mesh.rotation.set(k * 0.8, k, k * 0.4);
    }
  }
}

export default WeaponRig;

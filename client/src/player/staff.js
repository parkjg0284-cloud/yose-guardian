// 요새의 수호자 — magic staff meshes (6 tiers + 2 relic staves) and the first-person staff view.
// All geometry is procedural: no external assets.

import * as THREE from 'three';
import { SPELL_ELEMENTS, RELIC_STAVES, STAFF_TIERS } from '../data.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const DEG = Math.PI / 180;

const ELEMENT_COLORS = Object.fromEntries(SPELL_ELEMENTS.map((e) => [e.id, e.color]));
const RELIC_BY_ID = Object.fromEntries(RELIC_STAVES.map((r) => [r.id, r]));
const TIER_BY_NUMBER = Object.fromEntries(STAFF_TIERS.map((t) => [t.tier, t]));

export function elementColor(element) {
  return ELEMENT_COLORS[element] ?? ELEMENT_COLORS.arcane ?? 0x8f6bff;
}

export function relicInfo(relic) {
  return relic ? RELIC_BY_ID[relic] ?? null : null;
}

export function tierInfo(tier) {
  return TIER_BY_NUMBER[tier] ?? TIER_BY_NUMBER[1];
}

// ──────────────────────────────────────────────── material helpers
function standard(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.1,
    roughness: opts.roughness ?? 0.7,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    flatShading: opts.flatShading ?? false
  });
  if (opts.transparent) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 0.7;
  }
  return m;
}

function glow(color, opacity = 0.22) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
}

function cylinder(rTop, rBottom, h, material, radialSegments = 10) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, radialSegments), material);
}

function torus(radius, tube, material, segments = 24) {
  return new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, segments), material);
}

function shard(size, material) {
  return new THREE.Mesh(new THREE.OctahedronGeometry(size, 0), material);
}

// ──────────────────────────────────────────────── staff builder
/**
 * Builds the staff group. `tier` is 1..6 for normal staves and 1..7 for fairy wands,
 * `element` is a SPELL_ELEMENTS id, `relic` is 'time' | 'genesis' | null (relic staves override the tier look).
 * `fairy` adds a pink blossom halo around the head (요정의 지팡이).
 */
export function buildStaffMesh({ tier = 1, element = 'arcane', relic = null, fairy = false } = {}) {
  const maxTier = fairy ? 7 : 6;
  const t = Math.max(1, Math.min(maxTier, Math.round(tier) || 1));
  const visualTier = Math.min(6, t);
  const color = elementColor(element);
  const group = new THREE.Group();
  group.name = relic ? `staff_relic_${relic}` : fairy ? `fairy_wand_t${t}` : `staff_t${t}`;

  const info = tierInfo(visualTier);
  const animated = { rings: [], particles: [], orbs: [], shards: [], spin: [] };
  group.userData.animated = animated;
  group.userData.tier = t;
  group.userData.element = element;
  group.userData.relic = relic;
  group.userData.fairy = !!fairy;

  if (relic) buildRelic(group, animated, relic, color, info);
  else {
    buildTier(group, animated, visualTier, color);
    if (fairy) buildFairyBloom(group, animated, t);
  }

  // muzzle anchor (also the light position) at the head of the staff
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.copy(group.userData.headLocal || new THREE.Vector3(0, 0.78, 0));
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  return group;
}

function buildTier(group, animated, tier, color) {
  const shaftColor = [0x6b4a2a, 0x5c4630, 0x4a3a52, 0x3b3350, 0x6a5136, 0xd8dbe6][tier - 1];
  const shaftMetal = [0, 0.75, 0.45, 0.7, 0.35, 0.95][tier - 1];
  const shaftRadius = [0.03, 0.034, 0.036, 0.038, 0.042, 0.046][tier - 1];
  const shaftLen = [1.08, 1.14, 1.2, 1.26, 1.34, 1.42][tier - 1];

  const shaftMat = standard(shaftColor, { metalness: shaftMetal, roughness: shaftMetal > 0.5 ? 0.32 : 0.85 });
  const shaft = cylinder(shaftRadius * 0.85, shaftRadius, shaftLen, shaftMat, 12);
  shaft.position.y = shaftLen * 0.5 - 0.12;
  group.add(shaft);

  // grip
  const gripMat = standard(0x2a2118, { roughness: 0.95 });
  const grip = cylinder(shaftRadius * 1.35, shaftRadius * 1.35, 0.24, gripMat, 12);
  grip.position.y = shaftLen * 0.5 - 0.28;
  group.add(grip);

  const accent = standard(0x8a8f9c, { metalness: 0.9, roughness: 0.28 });
  const headLocal = new THREE.Vector3(0, shaftLen * 0.5 + 0.02, 0);

  if (tier >= 2) {
    for (const y of [shaftLen * 0.5 - 0.44, shaftLen * 0.5 + 0.24]) {
      const band = torus(shaftRadius * 1.16, 0.008, accent, 18);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      group.add(band);
    }
  }
  if (tier >= 4) {
    // rune bands down the shaft
    for (let i = 0; i < 4; i++) {
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, 0.008), standard(0x000000, {
        emissive: color, emissiveIntensity: 1.6, roughness: 0.4
      }));
      const a = (i / 4) * Math.PI * 2;
      const y = shaftLen * 0.5 - 0.62 + i * 0.12;
      rune.position.set(Math.cos(a) * shaftRadius * 1.15, y, Math.sin(a) * shaftRadius * 1.15);
      rune.rotation.y = -a;
      group.add(rune);
    }
  }

  // ── head per tier ──
  if (tier === 1) {
    // two crooked prongs holding a plain stone
    for (const s of [-1, 1]) {
      const prong = cylinder(0.012, 0.018, 0.2, shaftMat, 8);
      prong.position.set(s * 0.05, headLocal.y + 0.08, 0);
      prong.rotation.z = s * -0.5;
      group.add(prong);
    }
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), standard(0x8b8478, { roughness: 0.9, flatShading: true }));
    stone.position.copy(headLocal).add(new THREE.Vector3(0, 0.16, 0));
    group.add(stone);
    animated.orbs.push({ mesh: stone, base: 0, pulse: 0 });
    group.userData.headLocal = headLocal.clone().add(new THREE.Vector3(0, 0.16, 0));
  } else if (tier === 2) {
    // iron claw
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.19, 6), standard(0x9aa4ad, { metalness: 0.85, roughness: 0.3 }));
      claw.position.set(Math.cos(a) * 0.055, headLocal.y + 0.07, Math.sin(a) * 0.055);
      claw.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      group.add(claw);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 12), standard(0x6f7883, {
      metalness: 0.7, roughness: 0.35, emissive: color, emissiveIntensity: 0.25
    }));
    core.position.copy(headLocal).add(new THREE.Vector3(0, 0.17, 0));
    group.add(core);
    animated.orbs.push({ mesh: core, base: 0.25, pulse: 0.15 });
    group.userData.headLocal = core.position.clone();
  } else if (tier === 3) {
    // crystal cluster
    const crystalMat = standard(0xaee8ff, {
      metalness: 0.1, roughness: 0.15, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, flatShading: true
    });
    const main = new THREE.Mesh(new THREE.OctahedronGeometry(0.115, 0), crystalMat);
    main.position.copy(headLocal).add(new THREE.Vector3(0, 0.17, 0));
    group.add(main);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), crystalMat);
      s.position.set(Math.cos(a) * 0.1, headLocal.y + 0.1, Math.sin(a) * 0.1);
      s.rotation.set(0.4, a, 0.5);
      group.add(s);
      animated.shards.push({ mesh: s, orbit: 0.1, speed: 0.6 + i * 0.12, height: headLocal.y + 0.1, phase: a });
    }
    animated.orbs.push({ mesh: main, base: 0.9, pulse: 0.3 });
    group.userData.headLocal = main.position.clone();
  } else if (tier === 4) {
    // arcane rune ring + floating core
    const ringMat = standard(0x8f9bb3, { metalness: 0.9, roughness: 0.25, emissive: color, emissiveIntensity: 0.5 });
    const ring = torus(0.11, 0.012, ringMat, 26);
    ring.position.copy(headLocal).add(new THREE.Vector3(0, 0.2, 0));
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    animated.rings.push({ mesh: ring, speed: 1.1, axis: 'y' });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.008), standard(0x2b3350, {
        metalness: 0.6, roughness: 0.4, emissive: color, emissiveIntensity: 1.4
      }));
      plate.position.set(Math.cos(a) * 0.11, headLocal.y + 0.2, Math.sin(a) * 0.11);
      plate.lookAt(0, plate.position.y, 0);
      plate.rotateY(Math.PI / 2);
      group.add(plate);
    }
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.085), standard(0xdfe6ff, {
      metalness: 0.4, roughness: 0.2, emissive: color, emissiveIntensity: 1.5, transparent: true, opacity: 0.92
    }));
    core.position.set(0, headLocal.y + 0.2, 0);
    group.add(core);
    animated.spin.push({ mesh: core, speed: 0.9 });
    animated.orbs.push({ mesh: core, base: 1.5, pulse: 0.4 });
    group.userData.headLocal = core.position.clone();
  } else if (tier === 5) {
    // ancient branch: helix rings + big crystal + leaves
    const barkMat = standard(0x6a5136, { roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), barkMat);
      knot.position.set(0.02 * (i % 2 ? 1 : -1), headLocal.y - 0.3 + i * 0.1, 0);
      group.add(knot);
    }
    for (let i = 0; i < 3; i++) {
      const r = torus(0.09 + i * 0.015, 0.01, standard(0x7d8a5a, {
        metalness: 0.5, roughness: 0.45, emissive: color, emissiveIntensity: 0.6
      }), 22);
      r.position.copy(headLocal).add(new THREE.Vector3(0, 0.14 + i * 0.09, 0));
      r.rotation.set(Math.PI / 2 + i * 0.3, i * 0.6, 0);
      group.add(r);
      animated.rings.push({ mesh: r, speed: 0.7 + i * 0.35, axis: 'y' });
    }
    const crystalMat = standard(0x9ff5d0, {
      metalness: 0.1, roughness: 0.1, emissive: color, emissiveIntensity: 1.2, transparent: true, opacity: 0.86, flatShading: true
    });
    const big = new THREE.Mesh(new THREE.IcosahedronGeometry(0.135, 0), crystalMat);
    big.position.copy(headLocal).add(new THREE.Vector3(0, 0.34, 0));
    group.add(big);
    animated.orbs.push({ mesh: big, base: 1.2, pulse: 0.35 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 5), standard(0x4f9c5a, {
        roughness: 0.8, emissive: 0x14381c, emissiveIntensity: 0.5
      }));
      leaf.position.set(Math.cos(a) * 0.09, headLocal.y + 0.24, Math.sin(a) * 0.09);
      leaf.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
      group.add(leaf);
    }
    group.userData.headLocal = big.position.clone();
  } else {
    // tier 6 — mythic: star core, twin rings, orbiting shards
    const metal = standard(0xe8ecf6, { metalness: 0.95, roughness: 0.18 });
    for (let i = 0; i < 2; i++) {
      const band = torus(shaftRadius * 1.25, 0.01, metal, 20);
      band.rotation.x = Math.PI / 2;
      band.position.y = shaftLen * 0.5 - 0.5 + i * 0.2;
      group.add(band);
    }
    const veinMat = standard(0x000000, { emissive: color, emissiveIntensity: 2, roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const vein = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.5, 0.012), veinMat);
      vein.position.set(Math.cos(a) * shaftRadius * 1.05, shaftLen * 0.5 - 0.5, Math.sin(a) * shaftRadius * 1.05);
      group.add(vein);
    }
    const coreMat = standard(0xffffff, {
      metalness: 0.3, roughness: 0.1, emissive: color, emissiveIntensity: 2, transparent: true, opacity: 0.95
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), coreMat);
    core.position.copy(headLocal).add(new THREE.Vector3(0, 0.22, 0));
    group.add(core);
    animated.spin.push({ mesh: core, speed: 0.7 });
    animated.orbs.push({ mesh: core, base: 2, pulse: 0.5 });
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), glow(color, 0.16));
    halo.position.copy(core.position);
    group.add(halo);
    for (let i = 0; i < 2; i++) {
      const ring = torus(0.2 + i * 0.045, 0.012, standard(0xcfe3ff, {
        metalness: 0.9, roughness: 0.2, emissive: color, emissiveIntensity: 1
      }), 28);
      ring.position.copy(core.position);
      ring.rotation.set(Math.PI / 2 + (i ? 0.6 : -0.4), i * 0.8, 0);
      group.add(ring);
      animated.rings.push({ mesh: ring, speed: (i ? -1.2 : 1.4), axis: 'y' });
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const s = shard(0.035, standard(0xffffff, {
        metalness: 0.2, roughness: 0.1, emissive: color, emissiveIntensity: 1.6, transparent: true, opacity: 0.9
      }));
      s.position.set(Math.cos(a) * 0.24, core.position.y + Math.sin(i) * 0.06, Math.sin(a) * 0.24);
      group.add(s);
      animated.shards.push({ mesh: s, orbit: 0.24, speed: 0.8 + i * 0.08, height: core.position.y, phase: a });
    }
    group.userData.headLocal = core.position.clone();
  }
}

function buildFairyBloom(group, animated, tier = 1) {
  const isCrown = tier >= 7;
  const head = (group.userData.headLocal || new THREE.Vector3(0, 0.8, 0)).clone();
  const petalMat = standard(0xffb8d0, {
    roughness: 0.48, metalness: 0.05, emissive: 0xff6fa8, emissiveIntensity: 0.42
  });
  const orbMat = standard(0xfff0b0, {
    roughness: 0.25, metalness: 0.15, emissive: 0xffe08a, emissiveIntensity: 1.25,
    transparent: true, opacity: 0.92
  });
  const petalGeo = new THREE.SphereGeometry(0.075, 8, 6);

  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.scale.set(1.45, 0.48, 0.82);
    petal.position.set(Math.cos(a) * 0.12, head.y + 0.16, Math.sin(a) * 0.12);
    petal.rotation.set(0.2, a, 0.45);
    group.add(petal);
    animated.shards.push({
      mesh: petal, orbit: 0.125 + (i % 2) * 0.018, speed: 0.42 + i * 0.07,
      height: head.y + 0.16, phase: a, bob: 0.035
    });
  }

  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), orbMat);
  orb.position.copy(head).add(new THREE.Vector3(0, 0.16, 0));
  group.add(orb);
  animated.orbs.push({ mesh: orb, base: 0.55, pulse: 0.2 });

  const halo = torus(0.17, 0.006, glow(0xffd9e8, 0.48), 24);
  halo.rotation.x = Math.PI / 2;
  halo.position.copy(orb.position);
  group.add(halo);
  animated.rings.push({ mesh: halo, speed: 1.15, axis: 'z' });

  // T7 요정 여왕의 홀 — 바깥 꽃잎 왕관과 두 번째 빛 고리
  if (isCrown) {
    const crownGeo = new THREE.SphereGeometry(0.085, 8, 6);
    const crownMat = standard(0xfff0c8, {
      roughness: 0.3, metalness: 0.2, emissive: 0xffcf5a, emissiveIntensity: 0.85
    });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const petal = new THREE.Mesh(crownGeo, crownMat);
      petal.scale.set(1.7, 0.4, 0.7);
      petal.position.set(Math.cos(a) * 0.21, head.y + 0.24, Math.sin(a) * 0.21);
      petal.rotation.set(0.08, a, 0.3);
      group.add(petal);
      animated.shards.push({
        mesh: petal, orbit: 0.21, speed: 0.28 + i * 0.04,
        height: head.y + 0.24, phase: a, bob: 0.025
      });
    }
    const crown = torus(0.25, 0.008, glow(0xffd9a0, 0.8), 32);
    crown.rotation.x = Math.PI / 2;
    crown.position.copy(orb.position).add(new THREE.Vector3(0, 0.04, 0));
    group.add(crown);
    animated.rings.push({ mesh: crown, speed: 0.7, axis: 'y' });
  }

  const mote = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), glow(0xfff0b0, 0.9));
  mote.position.copy(head).add(new THREE.Vector3(0.2, 0.3, 0.04));
  group.add(mote);
  animated.shards.push({ mesh: mote, orbit: 0.2, speed: 0.9, height: head.y + 0.3, phase: 1.3, bob: 0.05 });

  group.userData.headLocal = orb.position.clone();
}

function buildRelic(group, animated, relic, elementColorHex, info) {
  const isTime = relic === 'time';
  const color = isTime ? 0xc9b8ff : 0xfff0b0;
  const shaftLen = 1.5;
  const shaftRadius = 0.05;
  const headY = shaftLen * 0.5 + 0.22;

  const shaftMat = isTime
    ? standard(0x2b2440, { metalness: 0.85, roughness: 0.22, emissive: 0x1a1240, emissiveIntensity: 0.8 })
    : standard(0xf2e6c0, { metalness: 0.95, roughness: 0.16, emissive: 0x6b4f10, emissiveIntensity: 0.6 });
  const shaft = cylinder(shaftRadius * 0.8, shaftRadius, shaftLen, shaftMat, 14);
  shaft.position.y = shaftLen * 0.5 - 0.14;
  group.add(shaft);

  // glowing seam running up the shaft
  const seamMat = standard(0x000000, { emissive: color, emissiveIntensity: 2.4, roughness: 0.2 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.012, shaftLen * 0.62, 0.012), seamMat);
    seam.position.set(Math.cos(a) * shaftRadius, shaftLen * 0.5 - 0.3, Math.sin(a) * shaftRadius);
    group.add(seam);
  }

  const grip = cylinder(shaftRadius * 1.4, shaftRadius * 1.4, 0.26, standard(isTime ? 0x151129 : 0x8a7a52, { roughness: 0.9 }), 12);
  grip.position.y = shaftLen * 0.5 - 0.34;
  group.add(grip);

  const coreMat = standard(0xffffff, {
    metalness: 0.2, roughness: 0.05, emissive: color, emissiveIntensity: 2.6, transparent: true, opacity: 0.95
  });
  const core = new THREE.Mesh(new THREE.SphereGeometry(isTime ? 0.13 : 0.165, 24, 18), coreMat);
  core.position.set(0, headY, 0);
  group.add(core);
  animated.orbs.push({ mesh: core, base: 2.6, pulse: 0.7 });

  // stacked additive halos give the core a strong aura
  for (let i = 0; i < 3; i++) {
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry((isTime ? 0.19 : 0.24) * (1 + i * 0.42), 20, 14),
      glow(color, 0.16 - i * 0.04)
    );
    halo.position.copy(core.position);
    group.add(halo);
    animated.orbs.push({ mesh: halo, basicBase: halo.material.opacity, pulse: 0.03, basic: true, scalePulse: 0.02 + i * 0.01 });
  }

  // counter-rotating orbit rings
  const ringDefs = isTime
    ? [[0.3, 0.014, 1.1], [0.36, 0.012, -0.8], [0.24, 0.01, 1.6]]
    : [[0.34, 0.016, 0.9], [0.44, 0.013, -0.65], [0.28, 0.011, 1.35]];
  ringDefs.forEach(([radius, tube, speed], i) => {
    const ring = torus(radius, tube, standard(isTime ? 0xb9c6ff : 0xffe9a3, {
      metalness: 0.95, roughness: 0.18, emissive: color, emissiveIntensity: 1.2
    }), 32);
    ring.position.copy(core.position);
    ring.rotation.set(Math.PI / 2 + i * 0.5, i * 1.1, i * 0.35);
    group.add(ring);
    animated.rings.push({ mesh: ring, speed, axis: 'y' });
  });

  if (isTime) {
    // clock face: twelve ticks on an extra ring
    const tickMat = standard(0xffffff, { emissive: color, emissiveIntensity: 2.2, metalness: 0.8, roughness: 0.2 });
    const dial = new THREE.Group();
    dial.position.copy(core.position);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.01), tickMat);
      tick.position.set(Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0);
      tick.rotation.z = -a;
      dial.add(tick);
    }
    group.add(dial);
    animated.rings.push({ mesh: dial, speed: -0.35, axis: 'z' });
    // hourglass: two cones meeting at the core
    const glassMat = standard(0xdff1ff, {
      metalness: 0.1, roughness: 0.05, emissive: color, emissiveIntensity: 0.8, transparent: true, opacity: 0.4, flatShading: true
    });
    for (const s of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.24, 12, 1, true), glassMat);
      cone.position.set(0, headY + s * 0.2, 0);
      cone.rotation.x = s > 0 ? Math.PI : 0;
      group.add(cone);
    }
  } else {
    // genesis: radiant wings + crown of shards
    const wingMat = standard(0xfff6d0, {
      metalness: 0.9, roughness: 0.15, emissive: color, emissiveIntensity: 1.6, transparent: true, opacity: 0.9
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 4), wingMat);
      wing.position.set(Math.cos(a) * 0.2, headY + 0.24, Math.sin(a) * 0.2);
      wing.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
      group.add(wing);
    }
    const crown = torus(0.26, 0.02, standard(0xffe9a3, {
      metalness: 1, roughness: 0.12, emissive: color, emissiveIntensity: 1.4
    }), 34);
    crown.position.set(0, headY + 0.3, 0);
    crown.rotation.x = Math.PI / 2;
    group.add(crown);
    animated.rings.push({ mesh: crown, speed: 1.8, axis: 'y' });
  }

  // orbiting shards
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = shard(0.04, standard(0xffffff, {
      metalness: 0.3, roughness: 0.08, emissive: color, emissiveIntensity: 2, transparent: true, opacity: 0.92
    }));
    s.position.set(Math.cos(a) * 0.36, headY + Math.sin(i * 1.7) * 0.12, Math.sin(a) * 0.36);
    group.add(s);
    animated.shards.push({ mesh: s, orbit: 0.36, speed: 0.75 + i * 0.07, height: headY, phase: a, bob: 0.12 });
  }

  // particle cloud (deterministic placement, no per-frame allocation)
  const count = 72;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963; // golden angle
    const r = 0.2 + (i % 9) * 0.03;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = headY + (((i * 7) % 13) / 13 - 0.5) * 0.7;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    color,
    size: isTime ? 0.055 : 0.07,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  }));
  group.add(points);
  animated.particles.push({ mesh: points, speed: isTime ? 0.35 : 0.5, counter: isTime });

  // faint world light so the relic reads as special even in the dark
  const light = new THREE.PointLight(color, isTime ? 1.1 : 1.5, 9, 2);
  light.position.copy(core.position);
  group.add(light);
  animated.orbs.push({ mesh: light, isTimeLight: true, base: isTime ? 1.1 : 1.5, pulse: 0.4, light: true });

  group.userData.headLocal = core.position.clone();
  group.userData.relicName = info?.name ?? relic;
  group.userData.element = info?.element ?? 'arcane';
}

// ──────────────────────────────────────────────── first-person view
export class StaffView {
  constructor({ camera, tier = 1, element = 'arcane', relic = null, audio } = {}) {
    this.camera = camera || null;
    this.audio = audio || null;
    this.tier = tier;
    this.element = element;
    this.relic = relic || null;

    this.group = new THREE.Group();
    this.group.name = 'staff-view';
    this.group.position.set(0.42, -0.36, -0.66);
    this.group.rotation.set(0.06, -0.3, 0.14);
    this._base = { position: this.group.position.clone(), rotation: this.group.rotation.clone() };

    this.mesh = null;
    this.muzzle = null;
    this._time = 0;
    this._cast = 0;
    this._hit = 0;
    this._flash = 0;
    this._moving = 0;
    this._charge = 0;

    this.flashLight = new THREE.PointLight(elementColor(element), 0, 5.5, 2);
    this.flashLight.position.set(0, 0.7, 0);
    this.group.add(this.flashLight);

    if (this.camera) this.camera.add(this.group);
    this._rebuild();
  }

  // ── swapping ────────────────────────────────────────────────
  setTier(tier) {
    const t = Math.max(1, Math.min(6, Math.round(tier) || 1));
    if (t === this.tier && this.mesh) return this;
    this.tier = t;
    if (this.relic) return this; // relic visuals win over tier
    this._rebuild();
    return this;
  }

  setElement(element) {
    const e = element || 'arcane';
    if (e === this.element) return this;
    this.element = e;
    this.flashLight.color.setHex(elementColor(e));
    if (!this.relic) this._rebuild();
    return this;
  }

  setRelic(id) {
    const r = id || null;
    if (r === this.relic) return this;
    this.relic = r;
    this._rebuild();
    return this;
  }

  _rebuild() {
    if (this.mesh) {
      this.group.remove(this.mesh);
      disposeObject(this.mesh);
    }
    this.mesh = buildStaffMesh({ tier: this.tier, element: this.element, relic: this.relic });
    this.group.add(this.mesh);
    this.muzzle = this.mesh.userData.muzzle || null;
    const head = this.mesh.userData.headLocal;
    if (head) this.flashLight.position.copy(head).add(new THREE.Vector3(0, 0.06, 0));
    return this;
  }

  // ── one-shot feedback ───────────────────────────────────────
  playCast() {
    this._cast = 1;
    this._flash = 1;
    this.audio?.play?.(this.relic ? 'castRare' : 'cast');
    return this;
  }

  playHit() {
    this._hit = 1;
    return this;
  }

  // ── per-frame ───────────────────────────────────────────────
  update(dt, { moving = false, casting = false } = {}) {
    const d = Math.min(Math.max(dt || 0, 0), 0.1);
    this._time += d;
    const t = this._time;

    this._moving += ((moving ? 1 : 0) - this._moving) * (1 - Math.exp(-6 * d));
    this._charge += ((casting ? 1 : 0) - this._charge) * (1 - Math.exp(-8 * d));
    this._cast *= Math.exp(-9 * d);
    if (this._cast < 0.001) this._cast = 0;
    this._hit *= Math.exp(-7 * d);
    this._flash = Math.max(0, this._flash - d * 7);

    const walk = this._moving;
    const bobY = Math.sin(t * 1.7) * 0.012 + Math.sin(t * 0.73) * 0.006;
    const swayX = Math.sin(t * 6.4) * 0.026 * walk;
    const swayY = Math.abs(Math.sin(t * 6.4)) * 0.022 * walk;
    const swayRoll = Math.sin(t * 6.4) * 0.09 * walk;

    // cast recoil pushes the staff back and up, hit jolts it down
    const recoilZ = this._cast * 0.14;
    const recoilPitch = -this._cast * 0.34 + this._hit * 0.22;
    const chargePull = this._charge * 0.05;

    this.group.position.set(
      this._base.position.x + swayX + this._charge * 0.02,
      this._base.position.y + bobY + swayY + this._cast * 0.03 - chargePull * 0.2,
      this._base.position.z + recoilZ
    );
    this.group.rotation.set(
      this._base.rotation.x + recoilPitch + this._charge * -0.12 + Math.sin(t * 1.3) * 0.008,
      this._base.rotation.y + Math.sin(t * 0.9) * 0.01 + this._cast * 0.06,
      this._base.rotation.z + swayRoll
    );

    this._animateMesh(t, d);

    const energy = Math.max(this._flash, this._charge * 0.35);
    this.flashLight.intensity = energy * (this.relic ? 9 : 6.5);
    return this;
  }

  _animateMesh(t, d) {
    const anim = this.mesh?.userData?.animated;
    if (!anim) return;
    for (const ring of anim.rings) {
      if (ring.axis === 'z') ring.mesh.rotation.z += ring.speed * d;
      else if (ring.axis === 'x') ring.mesh.rotation.x += ring.speed * d;
      else ring.mesh.rotation.y += ring.speed * d;
    }
    for (const spin of anim.spin) {
      spin.mesh.rotation.y += spin.speed * d;
      spin.mesh.rotation.x += spin.speed * 0.4 * d;
    }
    for (const s of anim.shards) {
      const a = s.phase + t * s.speed;
      s.mesh.position.x = Math.cos(a) * s.orbit;
      s.mesh.position.z = Math.sin(a) * s.orbit;
      s.mesh.position.y = s.height + Math.sin(t * 1.8 + s.phase) * (s.bob ?? 0.05);
      s.mesh.rotation.y += 1.4 * d;
    }
    for (const p of anim.particles) {
      p.mesh.rotation.y += (p.counter ? -p.speed : p.speed) * d;
      const mat = p.mesh.material;
      if (mat) mat.opacity = 0.55 + Math.sin(t * 2.2) * 0.25;
    }
    const charge = this._charge;
    for (const o of anim.orbs) {
      if (o.light) {
        o.mesh.intensity = o.base * (0.85 + Math.sin(t * 3.1) * 0.15) + charge * 1.6;
        continue;
      }
      const mat = o.mesh.material;
      if (!mat) continue;
      if (o.basic) {
        mat.opacity = clamp01((o.basicBase ?? 0.2) + Math.sin(t * 2.6) * 0.03 + charge * 0.08);
        const scale = 1 + (o.scalePulse ?? 0) * Math.sin(t * 2.4);
        o.mesh.scale.setScalar(scale);
      } else {
        mat.emissiveIntensity = (o.base ?? 1) * (0.88 + Math.sin(t * 3.1) * 0.12) + charge * 0.9 + this._flash * 0.8;
      }
    }
  }

  get muzzlePosition() {
    const m = this.muzzle;
    if (!m) {
      return this.group.getWorldPosition(new THREE.Vector3());
    }
    m.updateWorldMatrix(true, false);
    return m.getWorldPosition(new THREE.Vector3());
  }

  /** Local-space muzzle offset, handy for tracer spawns. */
  get muzzleOffset() {
    return this.muzzle ? this.muzzle.position.clone() : new THREE.Vector3();
  }

  dispose() {
    if (this.camera) this.camera.remove(this.group);
    else this.group.parent?.remove(this.group);
    if (this.mesh) {
      this.group.remove(this.mesh);
      disposeObject(this.mesh);
      this.mesh = null;
    }
    this.flashLight.dispose?.();
    this.muzzle = null;
    return this;
  }
}

function disposeObject(root) {
  root.traverse?.((o) => {
    if (o.geometry?.dispose) o.geometry.dispose();
    const mat = o.material;
    if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
    else mat?.dispose?.();
  });
}

export { disposeObject };
export default StaffView;

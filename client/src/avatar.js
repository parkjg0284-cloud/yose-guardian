// avatar.js — 멀티플레이 캐릭터 3D 모델.
// 기존 캡슐 2개(몸통+머리)를 여러 겹의 판금·천·장비로 바꿔 스킨마다 실루엣이 읽히게 한다.
// 순수 Three.js 생성 코드 — 렌더러/캔버스/DOM 에 의존하지 않으므로 헤드리스에서도 만들 수 있다.
import * as THREE from 'three';

const C = {
  skin: 0xe8b88f,
  skinShade: 0xc98f68,
  metal: 0x9aa3b2,
  darkMetal: 0x3c4354,
  leather: 0x5a3b2e,
  cloth: 0x2a2f3d,
  gold: 0xe8c56a,
  eye: 0x8fe8ff,
  void: 0x120d18
};

const GEO = {
  hips: new THREE.CylinderGeometry(0.3, 0.34, 0.3, 10),
  torso: new THREE.CylinderGeometry(0.4, 0.33, 0.68, 10),
  chest: new THREE.SphereGeometry(0.36, 12, 10),
  neck: new THREE.CylinderGeometry(0.1, 0.12, 0.16, 8),
  head: new THREE.SphereGeometry(0.24, 16, 12),
  jaw: new THREE.BoxGeometry(0.28, 0.12, 0.2),
  eye: new THREE.SphereGeometry(0.035, 8, 6),
  pauldron: new THREE.SphereGeometry(0.2, 10, 8),
  upperArm: new THREE.CapsuleGeometry(0.1, 0.3, 5, 8),
  forearm: new THREE.CapsuleGeometry(0.085, 0.28, 5, 8),
  hand: new THREE.SphereGeometry(0.09, 8, 6),
  thigh: new THREE.CapsuleGeometry(0.13, 0.34, 5, 8),
  shin: new THREE.CapsuleGeometry(0.11, 0.32, 5, 8),
  boot: new THREE.BoxGeometry(0.22, 0.2, 0.36),
  belt: new THREE.CylinderGeometry(0.335, 0.345, 0.09, 10),
  cape: new THREE.BoxGeometry(0.66, 0.9, 0.04),
  capeTrim: new THREE.BoxGeometry(0.7, 0.08, 0.05),
  emblem: new THREE.CylinderGeometry(0.12, 0.12, 0.03, 10),
  shield: new THREE.CylinderGeometry(0.32, 0.32, 0.07, 8),
  swordBlade: new THREE.BoxGeometry(0.07, 0.9, 0.025),
  swordGuard: new THREE.BoxGeometry(0.28, 0.05, 0.06),
  swordGrip: new THREE.CylinderGeometry(0.035, 0.04, 0.22, 6),
  staff: new THREE.CylinderGeometry(0.035, 0.045, 1.55, 8),
  orb: new THREE.IcosahedronGeometry(0.13, 1),
  bow: new THREE.TorusGeometry(0.42, 0.025, 6, 20, Math.PI * 1.15),
  bowString: new THREE.CylinderGeometry(0.006, 0.006, 0.82, 4),
  dagger: new THREE.ConeGeometry(0.05, 0.32, 4),
  daggerGrip: new THREE.CylinderGeometry(0.025, 0.03, 0.14, 6),
  flask: new THREE.SphereGeometry(0.1, 10, 8),
  flaskNeck: new THREE.CylinderGeometry(0.04, 0.05, 0.1, 6),
  lute: new THREE.SphereGeometry(0.18, 12, 8),
  luteNeck: new THREE.BoxGeometry(0.055, 0.5, 0.05),
  hatBrim: new THREE.CylinderGeometry(0.36, 0.38, 0.035, 12),
  hatCone: new THREE.ConeGeometry(0.28, 0.62, 12),
  hood: new THREE.ConeGeometry(0.32, 0.44, 10, 1, true),
  mask: new THREE.BoxGeometry(0.32, 0.14, 0.12),
  goggles: new THREE.TorusGeometry(0.07, 0.022, 5, 12),
  quiver: new THREE.CylinderGeometry(0.1, 0.12, 0.5, 8),
  arrow: new THREE.CylinderGeometry(0.012, 0.012, 0.52, 4),
  wing: new THREE.ConeGeometry(0.28, 0.9, 4),
  wingLarge: new THREE.ConeGeometry(0.4, 1.5, 4),
  halo: new THREE.TorusGeometry(0.28, 0.018, 5, 24),
  haloRune: new THREE.TorusGeometry(0.34, 0.012, 4, 24),
  plume: new THREE.ConeGeometry(0.08, 0.34, 5),
  horn: new THREE.ConeGeometry(0.045, 0.2, 4),
  trim: new THREE.TorusGeometry(0.16, 0.02, 5, 12),
  spear: new THREE.CylinderGeometry(0.025, 0.03, 1.9, 6),
  spearHead: new THREE.ConeGeometry(0.1, 0.35, 5),
  aura: new THREE.TorusGeometry(0.55, 0.018, 4, 24)
};

const SKIN_ACCESSORY = new Set(['guardian', 'knight', 'mage', 'archer', 'rogue', 'alchemist', 'bard', 'fairy_friend', 'seraph']);

function mat(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.6,
    metalness: opts.metalness ?? 0.15,
    flatShading: opts.flat ?? true
  });
  if (opts.emissive != null) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.intensity ?? 0.35;
  }
  if (opts.transparent) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 0.7;
  }
  if (opts.side != null) m.side = opts.side;
  return m;
}

function add(parent, geo, material, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
  if (opts.scale) m.scale.set(opts.scale[0], opts.scale[1], opts.scale[2]);
  if (opts.name) m.name = opts.name;
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function darker(hex, k = 0.55) {
  return new THREE.Color(hex).multiplyScalar(k).getHex();
}

function lighter(hex, k = 0.3) {
  return new THREE.Color(hex).lerp(new THREE.Color(0xffffff), k).getHex();
}

/**
 * 캐릭터 한 명의 3D 모델을 만든다.
 * @param {{color?:number, accent?:number, skin?:string, name?:string}} look
 * @returns {THREE.Group} 루트 — userData.animated/rig 에 애니메이션 부품이 들어 있다.
 */
export function buildCharacterAvatar({ color = 0x5b8dd6, accent = 0x9dc0ff, skin = 'guardian' } = {}) {
  const root = new THREE.Group();
  root.name = 'characterAvatar';
  const rig = new THREE.Group();
  root.add(rig);
  const palette = {
    armor: color,
    armorDark: darker(color, 0.42),
    trim: accent,
    cloth: darker(accent, 0.34),
    leather: C.leather,
    skin: C.skin,
    metal: C.metal,
    gold: C.gold
  };
  const armor = mat(palette.armor, { metalness: 0.55, roughness: 0.42, emissive: palette.armorDark, intensity: 0.18 });
  const armorDark = mat(palette.armorDark, { metalness: 0.6, roughness: 0.48 });
  const trim = mat(palette.trim, { metalness: 0.45, roughness: 0.35, emissive: palette.trim, intensity: 0.5 });
  const cloth = mat(palette.cloth, { roughness: 0.94, metalness: 0, side: THREE.DoubleSide });
  const leather = mat(palette.leather, { roughness: 0.9, metalness: 0.05 });
  const skinMat = mat(palette.skin, { roughness: 0.72, metalness: 0, emissive: palette.skin, intensity: 0.06 });
  const metal = mat(palette.metal, { metalness: 0.8, roughness: 0.3 });
  const gold = mat(palette.gold, { metalness: 0.8, roughness: 0.28, emissive: palette.gold, intensity: 0.35 });
  const eyeMat = mat(C.eye, { emissive: C.eye, intensity: 1.8, roughness: 0.2, metalness: 0.1, flat: false });

  // ── 다리·골반 — 판금 갑주와 가죽 장화
  add(rig, GEO.hips, armorDark, 0, 0.86, 0);
  add(rig, GEO.belt, leather, 0, 0.72, 0);
  add(rig, GEO.belt, gold, 0, 0.72, 0, { scale: [1.01, 0.35, 1.01] });
  for (const side of [-1, 1]) {
    add(rig, GEO.thigh, armorDark, side * 0.18, 0.48, 0);
    add(rig, GEO.shin, armor, side * 0.18, 0.2, -0.01);
    add(rig, GEO.boot, leather, side * 0.18, 0.08, -0.08);
    add(rig, GEO.trim, gold, side * 0.18, 0.33, -0.01, { rot: [Math.PI / 2, 0, 0], scale: [0.72, 0.72, 0.72] });
  }
  // ── 몸통 — 겹친 흉갑과 허리 장식
  add(rig, GEO.torso, armor, 0, 1.24, 0);
  add(rig, GEO.chest, armor, 0, 1.38, -0.08, { scale: [1.18, 0.78, 0.72] });
  add(rig, GEO.emblem, trim, 0, 1.36, -0.34, { rot: [Math.PI / 2, 0, 0] });
  add(rig, GEO.emblem, gold, 0, 1.36, -0.36, { rot: [Math.PI / 2, 0, 0], scale: [0.62, 0.62, 0.62] });
  add(rig, GEO.neck, skinMat, 0, 1.7, 0);
  // ── 머리 — 얼굴·눈·턱
  const head = add(rig, GEO.head, skinMat, 0, 1.88, 0, { name: 'head' });
  head.scale.set(0.92, 1, 0.94);
  add(rig, GEO.jaw, skinMat, 0, 1.79, -0.06);
  for (const side of [-1, 1]) {
    add(rig, GEO.eye, eyeMat, side * 0.075, 1.91, -0.205, { shadow: false });
  }
  // ── 어깨·팔 — 층을 나눈 판금
  for (const side of [-1, 1]) {
    add(rig, GEO.pauldron, armor, side * 0.46, 1.55, 0, { scale: [1.15, 0.85, 1.1] });
    add(rig, GEO.pauldron, trim, side * 0.51, 1.58, 0, { scale: [0.62, 0.48, 0.62] });
    add(rig, GEO.upperArm, armorDark, side * 0.51, 1.36, 0, { rot: [0, 0, side * -0.12] });
    add(rig, GEO.forearm, armor, side * 0.55, 1.08, -0.02, { rot: [0, 0, side * -0.06] });
    add(rig, GEO.hand, leather, side * 0.57, 0.89, -0.03);
  }

  // ── 망토 — 허리에서 어깨로 흐르는 천 + 금색 테두리
  const cape = add(rig, GEO.cape, cloth, 0, 1.12, 0.3, { rot: [0.14, 0, 0], shadow: false });
  add(rig, GEO.capeTrim, trim, 0, 0.69, 0.36, { rot: [0.14, 0, 0], shadow: false });
  add(rig, GEO.trim, gold, 0, 1.57, 0, { rot: [Math.PI / 2, 0, 0], scale: [0.9, 0.9, 0.9] });
  rig.userData.cape = cape;

  // ── 스킨별 장비 — 같은 뼈대 위에 실루엣을 바꾼다
  const id = SKIN_ACCESSORY.has(skin) ? skin : 'guardian';
  const wings = [];
  const fx = [];
  if (id === 'guardian') {
    const shield = new THREE.Group();
    shield.position.set(-0.58, 1.0, -0.1);
    shield.rotation.set(0.1, 0.25, 0.12);
    rig.add(shield);
    add(shield, GEO.shield, armor, 0, 0, 0, { rot: [Math.PI / 2, 0, 0] });
    add(shield, GEO.emblem, trim, 0, 0, -0.045, { rot: [Math.PI / 2, 0, 0], scale: [0.9, 0.9, 0.9] });
    add(shield, GEO.trim, gold, 0, 0, -0.06, { rot: [Math.PI / 2, 0, 0], scale: [1.5, 1.5, 1.5] });
    add(rig, GEO.swordBlade, metal, 0.36, 0.98, 0.28, { rot: [0.2, 0, -0.35] });
    add(rig, GEO.swordGuard, gold, 0.44, 0.7, 0.31, { rot: [0.2, 0, -0.35] });
  } else if (id === 'knight') {
    add(rig, GEO.hatBrim, metal, 0, 1.98, 0, { scale: [1.35, 2.2, 1.35] });
    add(rig, GEO.hatCone, metal, 0, 2.12, 0, { scale: [0.92, 0.62, 0.92] });
    add(rig, GEO.jaw, metal, 0, 1.84, -0.12, { scale: [1.2, 1.5, 0.8] });
    add(rig, GEO.plume, trim, 0, 2.40, 0.02, { rot: [0.22, 0, 0] });
    add(rig, GEO.swordBlade, metal, 0, 1.3, 0.37, { rot: [0.38, 0, 0.12], scale: [1.45, 1.45, 1.45] });
    add(rig, GEO.swordGuard, gold, 0, 0.78, 0.44, { rot: [0.38, 0, 0.12] });
    add(rig, GEO.swordGrip, leather, 0, 0.62, 0.47, { rot: [0.38, 0, 0.12] });
  } else if (id === 'mage') {
    add(rig, GEO.hatBrim, cloth, 0, 2.02, 0);
    add(rig, GEO.hatCone, cloth, 0, 2.3, 0, { rot: [0.1, 0, 0] });
    add(rig, GEO.trim, trim, 0, 2.06, 0, { rot: [Math.PI / 2, 0, 0], scale: [1.7, 1.7, 1.7] });
    const beard = add(rig, new THREE.ConeGeometry(0.12, 0.3, 7), mat(0xe8e4d4, { roughness: 0.9 }), 0, 1.67, -0.2, { rot: [Math.PI, 0, 0] });
    beard.name = 'beard';
    const staff = new THREE.Group();
    staff.position.set(0.6, 1.0, -0.05);
    staff.rotation.z = -0.08;
    rig.add(staff);
    add(staff, GEO.staff, leather, 0, 0.22, 0);
    add(staff, GEO.orb, trim, 0, 1.03, 0, { shadow: false });
    add(staff, GEO.halo, gold, 0, 1.03, 0, { rot: [Math.PI / 2, 0, 0], scale: [1.6, 1.6, 1.6], shadow: false });
    fx.push(staff);
  } else if (id === 'archer') {
    add(rig, GEO.hood, cloth, 0, 1.98, 0.02, { rot: [0, 0, 0] });
    add(rig, GEO.quiver, leather, 0.26, 1.3, 0.33, { rot: [0.15, 0, -0.35] });
    for (let i = 0; i < 3; i++) add(rig, GEO.arrow, trim, 0.22 + i * 0.04, 1.55, 0.3, { rot: [0.15, 0, -0.35] });
    const bow = new THREE.Group();
    bow.position.set(-0.62, 1.08, -0.08);
    bow.rotation.set(0.1, 0.2, 0.55);
    rig.add(bow);
    add(bow, GEO.bow, leather, 0, 0, 0, { shadow: false });
    add(bow, GEO.bowString, trim, 0, 0, 0.02, { rot: [0, 0, 0.58], shadow: false });
    fx.push(bow);
  } else if (id === 'rogue') {
    add(rig, GEO.hood, cloth, 0, 1.98, 0.02);
    add(rig, GEO.mask, armorDark, 0, 1.84, -0.16);
    for (const side of [-1, 1]) {
      add(rig, GEO.dagger, metal, side * 0.38, 0.86, -0.05, { rot: [0, 0, side * 0.35] });
      add(rig, GEO.daggerGrip, leather, side * 0.38, 1.0, -0.05);
    }
    add(rig, GEO.cape, cloth, 0, 1.05, 0.34, { rot: [0.1, 0, 0] });
  } else if (id === 'alchemist') {
    add(rig, GEO.goggles, gold, -0.1, 1.9, -0.21, { shadow: false });
    add(rig, GEO.goggles, gold, 0.1, 1.9, -0.21, { shadow: false });
    add(rig, GEO.flask, trim, 0.48, 0.84, -0.12, { shadow: false });
    add(rig, GEO.flaskNeck, leather, 0.48, 0.94, -0.12);
    add(rig, GEO.flask, mat(0x7fe8a0, { emissive: 0x7fe8a0, intensity: 0.9 }), -0.48, 0.88, -0.1, { shadow: false });
    add(rig, GEO.trim, gold, 0.48, 1.0, -0.12, { rot: [Math.PI / 2, 0, 0], scale: [0.65, 0.65, 0.65] });
  } else if (id === 'bard') {
    add(rig, GEO.hatBrim, cloth, 0, 2.02, 0);
    add(rig, GEO.hatCone, trim, 0, 2.24, 0.03, { rot: [-0.12, 0, 0.08] });
    add(rig, GEO.plume, gold, 0.12, 2.4, 0.02);
    const lute = new THREE.Group();
    lute.position.set(0.18, 1.05, -0.28);
    lute.rotation.set(0.12, -0.3, 0.55);
    rig.add(lute);
    add(lute, GEO.lute, leather, 0, 0, 0, { scale: [1, 1.2, 0.35] });
    add(lute, GEO.luteNeck, gold, 0, 0.34, 0);
    add(lute, GEO.halo, trim, 0, 0, -0.04, { rot: [Math.PI / 2, 0, 0], scale: [0.62, 0.62, 0.62], shadow: false });
    fx.push(lute);
  } else if (id === 'fairy_friend') {
    add(rig, GEO.hatCone, trim, 0, 2.14, 0, { scale: [0.65, 0.8, 0.65] });
    add(rig, GEO.trim, gold, 0, 2.04, 0, { rot: [Math.PI / 2, 0, 0], scale: [1.1, 1.1, 1.1] });
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.18, 1.35, 0.2);
      wing.rotation.set(0.2, 0, side * 0.35);
      rig.add(wing);
      for (let i = 0; i < 2; i++) {
        const w = add(wing, GEO.wingLarge, mat(accent, { transparent: true, opacity: 0.55, emissive: accent, intensity: 0.9, side: THREE.DoubleSide }), side * (0.32 + i * 0.16), 0.22 + i * 0.24, 0.02, { shadow: false });
        w.rotation.z = side * (0.5 + i * 0.2);
        w.scale.set(0.55, 0.9 - i * 0.16, 0.55);
      }
      wings.push(wing);
    }
    add(rig, GEO.aura, mat(trim, { transparent: true, opacity: 0.5, emissive: trim, intensity: 0.9 }), 0, 0.06, 0, { rot: [Math.PI / 2, 0, 0], shadow: false });
  } else if (id === 'seraph') {
    // 신규 외형 — 황금 성광 갑주 · 빛의 날개 · 후광 · 성창
    add(rig, GEO.hatCone, gold, 0, 2.24, 0, { scale: [0.7, 0.5, 0.7] });
    add(rig, GEO.trim, trim, 0, 2.06, 0, { rot: [Math.PI / 2, 0, 0], scale: [1.9, 1.9, 1.9], shadow: false });
    const halo = add(rig, GEO.halo, mat(C.gold, { emissive: C.gold, intensity: 1.4, transparent: true, opacity: 0.85 }), 0, 2.42, 0, { rot: [Math.PI / 2, 0, 0], shadow: false });
    const halo2 = add(rig, GEO.haloRune, trim, 0, 2.42, 0, { rot: [Math.PI / 2, 0, 0], shadow: false });
    fx.push(halo, halo2);
    const spear = new THREE.Group();
    spear.position.set(0.62, 1.0, -0.04);
    spear.rotation.z = -0.07;
    rig.add(spear);
    add(spear, GEO.spear, gold, 0, 0.18, 0);
    add(spear, GEO.spearHead, trim, 0, 1.28, 0, { shadow: false });
    add(spear, GEO.trim, trim, 0, 0.98, 0, { rot: [Math.PI / 2, 0, 0], scale: [1.1, 1.1, 1.1], shadow: false });
    fx.push(spear);
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.16, 1.4, 0.22);
      rig.add(wing);
      for (let i = 0; i < 3; i++) {
        const w = add(wing, GEO.wingLarge, mat(C.gold, { transparent: true, opacity: 0.5 - i * 0.08, emissive: C.gold, intensity: 1.0, side: THREE.DoubleSide }), side * (0.34 + i * 0.22), 0.18 + i * 0.2, 0.02, { shadow: false });
        w.rotation.z = side * (0.42 + i * 0.22);
        w.scale.set(0.5, 0.95 - i * 0.13, 0.5);
      }
      wings.push(wing);
    }
    add(rig, GEO.aura, mat(C.gold, { transparent: true, opacity: 0.34, emissive: C.gold, intensity: 1.1 }), 0, 0.06, 0, { rot: [Math.PI / 2, 0, 0], shadow: false });
  }

  root.userData.animated = { rig, cape, wings, fx, skin: id };
  return root;
}

/** 원격/로컬 아바타를 프레임마다 살짝 움직인다(날개·망토·후광). */
export function animateCharacterAvatar(avatar, elapsed = 0, moving = 0) {
  const a = avatar?.userData?.animated;
  if (!a) return;
  const t = Number(elapsed) || 0;
  const m = Math.max(0, Math.min(1, Number(moving) || 0));
  if (a.rig) a.rig.position.y = Math.sin(t * 5.2) * (0.012 + m * 0.025);
  if (a.cape) {
    a.cape.rotation.y = Math.sin(t * 1.7) * 0.08 + m * 0.12;
    a.cape.rotation.x = 0.14 + Math.sin(t * 1.4) * 0.03 + m * 0.08;
  }
  for (let i = 0; i < a.wings.length; i++) {
    const wing = a.wings[i];
    wing.rotation.z = Math.sin(t * 2.4 + i * 1.7) * 0.16 + (i % 2 ? 0.08 : -0.08);
    wing.rotation.y = Math.sin(t * 1.6 + i) * 0.12;
  }
  for (let i = 0; i < a.fx.length; i++) {
    const part = a.fx[i];
    if (!part) continue;
    if (part.name === 'staff' || part.name === 'spear') continue;
    part.rotation.y = Math.sin(t * 0.8 + i) * 0.15;
  }
}

/** 아바타가 씬에서 제거될 때 GPU 자원을 반납한다. (지오메트리는 모듈 공용 — 재질만 해제) */
export function disposeCharacterAvatar(avatar) {
  if (!avatar) return;
  avatar.traverse?.((node) => {
    const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const m of mats) {
      for (const key of ['map', 'normalMap', 'emissiveMap']) if (m[key]?.dispose) m[key].dispose();
      m.dispose?.();
    }
  });
}

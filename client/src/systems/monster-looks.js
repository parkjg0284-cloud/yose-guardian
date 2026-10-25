// 몬스터 외형 — 종류별 '괴물' 실루엣을 저폴리 지오메트리로 조립한다.
//
//  · 몸통 · 머리 · 턱 · 이빨 · 뿔 · 등가시 · 꼬리 · 다리 · 발톱을 하나의 지오메트리로 합친다
//    (정점 색으로 부위별 색을 넣어 드로우콜을 늘리지 않는다 — 적 140마리 성능 유지).
//  · 팔(휘두르는 느낌)과 눈(발광)은 따로 두어 애니메이션한다.
//  · 망령 · 그림자는 반투명 망토를 따로 입힌다.
//
//  좌표 규약: 발 y=0 · 머리끝 y≈2.45 (enemies.js 가 (가로, 세로, 가로) 로 스케일한다)
import * as THREE from 'three';

/** 종류별 몬스터 실루엣 */
export const MONSTER_LOOKS = {
  imp: { stance: 'biped', horns: 2, tail: 1, hunch: 0.55, head: 0.92, eyes: 2, claws: true },
  goblin: { stance: 'biped', ears: true, tail: 0, hunch: 0.7, head: 1.08, eyes: 2, claws: true },
  bat: { stance: 'float', wings: true, ears: true, tail: 1, hunch: 0.3, head: 0.95, eyes: 2, smallBody: true },
  wolf: { stance: 'quad', snout: true, ears: true, tail: 2, hunch: 0.85, head: 0.9, eyes: 2 },
  spider: { stance: 'spider', eyes: 6, hunch: 0.9, head: 0.8, smallBody: true, tail: 0 },
  orc: { stance: 'biped', tusks: 2, plates: true, tail: 0, hunch: 0.6, head: 0.95, eyes: 2, claws: true, bulk: true },
  skeleton: { stance: 'biped', ribs: true, thin: true, tail: 0, hunch: 0.5, head: 1.0, eyes: 2 },
  wraith: { stance: 'float', cloak: true, horns: 2, tail: 0, hunch: 0.25, head: 1.0, eyes: 2 },
  golem: { stance: 'biped', plates: true, bigFists: true, horns: 1, tail: 0, hunch: 0.35, head: 0.9, eyes: 2, bulk: true },
  drake: { stance: 'quad', wings: true, snout: true, horns: 3, tail: 2, hunch: 0.75, head: 1.0, eyes: 2 },
  shade: { stance: 'float', cloak: true, horns: 2, tail: 0, hunch: 0.3, head: 1.0, eyes: 4 }
};

/** 종류 기본값 */
export const DEFAULT_LOOK = {
  stance: 'biped',
  horns: 0,
  ears: false,
  tail: 0,
  wings: false,
  cloak: false,
  plates: false,
  ribs: false,
  tusks: 0,
  bigFists: false,
  snout: false,
  thin: false,
  bulk: false,
  smallBody: false,
  hunch: 0.5,
  head: 1,
  eyes: 2,
  claws: true
};

/** 몸통·머리 기준 높이 — 자세에 따라 다르다(네 발·부유는 낮다) */
export function monsterTorsoY(typeId) {
  const look = monsterLook(typeId);
  return look.stance === 'quad' ? 1.05 : look.stance === 'float' ? 1.32 : 1.35;
}

/** 머리 중심 좌표 — 눈·뿔·턱이 모두 이 값을 쓴다 */
export function monsterHeadAnchor(typeId) {
  const look = monsterLook(typeId);
  return { y: monsterTorsoY(typeId) + 0.68, z: 0.18 + (look.snout ? 0.3 : 0.18) };
}

/** 종류 → 실루엣 (없는 종류는 기본값) */
export function monsterLook(typeId) {
  return { ...DEFAULT_LOOK, ...(MONSTER_LOOKS[typeId] || {}) };
}

/* ── 색 ──────────────────────────────────────────────────────────────── */

const BONE = 0xd8cdb0;
const CLAW = 0xb9ad92;
const PLATE = 0x7c8796;
const CLOAK = 0x1a1f2b;

function hex(n) {
  return new THREE.Color(n);
}

/** 어둡게 (몸통은 배경보다 어둡게 — 그림자 실루엣) */
function darken(color, f = 0.7) {
  const c = new THREE.Color(color);
  c.multiplyScalar(f);
  return c.getHex();
}

/** 밝게 (뿔·눈 강조) */
function lighten(color, f = 0.5) {
  const c = new THREE.Color(color);
  c.lerp(new THREE.Color(0xffffff), f);
  return c.getHex();
}

/* ── 지오메트리 합치기 ───────────────────────────────────────────────── */

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

function matrix(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  _e.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  _q.setFromEuler(_e);
  _v.set(pos[0] || 0, pos[1] || 0, pos[2] || 0);
  _s.set(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
  return _m4.compose(_v, _q, _s).clone();
}

/** [{ geo, matrix, color }] → 정점 색이 있는 하나의 지오메트리 */
function mergeParts(parts) {
  const buffers = [];
  let total = 0;
  for (const part of parts) {
    if (!part || !part.geo) continue;
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    if (part.matrix) g.applyMatrix4(part.matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position.count;
    if (!count) {
      g.dispose?.();
      continue;
    }
    const col = new Float32Array(count * 3);
    const c = hex(part.color ?? 0xffffff);
    for (let i = 0; i < count; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    buffers.push({ pos: g.attributes.position.array, nor: g.attributes.normal.array, col, count });
    total += count;
    g.dispose?.();
  }
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
  let off = 0;
  for (const b of buffers) {
    position.set(b.pos, off * 3);
    normal.set(b.nor, off * 3);
    color.set(b.col, off * 3);
    off += b.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.computeBoundingSphere();
  return out;
}

/* ── 기본 도형 ───────────────────────────────────────────────────────── */

const lump = (r = 0.5, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
const hornGeo = (r = 0.09, h = 0.55) => new THREE.ConeGeometry(r, h, 5);
const toothGeo = (r = 0.035, h = 0.14) => new THREE.ConeGeometry(r, h, 4);
const limbGeo = (top = 0.12, bottom = 0.09, h = 0.5) => new THREE.CylinderGeometry(top, bottom, h, 6);
const boxGeo = (w = 1, h = 1, d = 1) => new THREE.BoxGeometry(w, h, d);
const clawGeo = () => new THREE.ConeGeometry(0.035, 0.2, 4);

/* ── 몸 만들기 ───────────────────────────────────────────────────────── */

/** 뿔 한 쌍(또는 여러 개) */
function addHorns(parts, look, boss, color, headY, headZ) {
  const count = Math.max(0, (look.horns || 0) + (boss ? 1 : 0));
  if (!count) return;
  const bone = lighten(color, 0.55);
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const tier = Math.floor(i / 2);
    const len = (boss ? 0.55 : 0.42) + tier * 0.12;
    const x = side * (0.16 + tier * 0.08);
    const y = headY + 0.2 + tier * 0.06;
    const z = headZ - 0.02 - tier * 0.05;
    parts.push({
      geo: hornGeo(0.075, len),
      matrix: matrix([x, y, z], [0.45 + tier * 0.1, 0, -side * (0.55 + tier * 0.15)], [1, 1, 1]),
      color: bone
    });
    // 뿔 밑동(두꺼운 마디)
    parts.push({
      geo: lump(0.085, 0),
      matrix: matrix([x, y - len * 0.42, z], [0, 0, 0], [1, 0.7, 1]),
      color: darken(color, 0.55)
    });
  }
}

/** 턱 · 이빨 */
function addJaw(parts, look, color, headY, headZ, jawOpen) {
  const bone = lighten(BONE, 0.15);
  const jawY = headY - 0.2;
  parts.push({
    geo: boxGeo(0.4, 0.1, 0.34),
    matrix: matrix([0, jawY, headZ + 0.12], [jawOpen, 0, 0], [1, 1, 1]),
    color: darken(color, 0.5)
  });
  // 위 이빨(아래로) — 4개
  for (let i = 0; i < 4; i++) {
    const x = -0.15 + i * 0.1;
    parts.push({
      geo: toothGeo(0.03, 0.13),
      matrix: matrix([x, jawY + 0.08, headZ + 0.26], [Math.PI, 0, 0], [1, 1, 1]),
      color: bone
    });
  }
  // 아래 이빨(위로) — 3개
  for (let i = 0; i < 3; i++) {
    const x = -0.1 + i * 0.1;
    parts.push({
      geo: toothGeo(0.03, 0.11),
      matrix: matrix([x, jawY - 0.02, headZ + 0.24], [0.3, 0, 0], [1, 1, 1]),
      color: bone
    });
  }
  // 엄니
  for (let i = 0; i < (look.tusks || 0); i++) {
    const side = i % 2 === 0 ? 1 : -1;
    parts.push({
      geo: hornGeo(0.04, 0.24),
      matrix: matrix([side * 0.17, jawY - 0.02, headZ + 0.24], [-0.5, 0, side * 0.25], [1, 1, 1]),
      color: lighten(BONE, 0.3)
    });
  }
}

/** 등가시 — 척추를 따라 뒤로 뻗는다 */
function addBackSpikes(parts, look, boss, color, torsoY) {
  const n = boss ? 6 : 4;
  const bone = lighten(color, 0.35);
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const y = torsoY + 0.35 - t * 0.62;
    const z = -0.28 - Math.sin(t * Math.PI) * 0.12;
    const len = (0.22 + Math.sin(t * Math.PI) * 0.24) * (boss ? 1.5 : 1);
    parts.push({
      geo: hornGeo(0.07, len),
      matrix: matrix([0, y, z], [-1.15, 0, 0], [1, 1, 1]),
      color: bone
    });
  }
}

/** 꼬리 — 3마디 테이퍼 */
function addTail(parts, look, boss, color, tailZ) {
  const segments = Math.max(1, look.tail || 0);
  if (look.tail === 0) return;
  const bone = lighten(color, 0.2);
  let x = 0;
  let y = 0.95;
  let z = tailZ;
  for (let i = 0; i < 3 + (boss ? 1 : 0); i++) {
    const len = (0.34 - i * 0.05) * (segments >= 2 ? 1.35 : 1);
    const r = 0.09 - i * 0.018;
    parts.push({
      geo: new THREE.ConeGeometry(Math.max(0.02, r), len, 5),
      matrix: matrix([x, y, z], [Math.PI * 0.62 + i * 0.12, 0, 0], [1, 1, 1]),
      color: i === 0 ? bone : darken(bone, 0.75)
    });
    z -= len * 0.75;
    y -= len * 0.18;
  }
  // 꼬리 끝 가시
  parts.push({
    geo: hornGeo(0.05, 0.18),
    matrix: matrix([x, y - 0.02, z - 0.05], [Math.PI * 0.3, 0, 0], [1, 1, 1]),
    color: lighten(BONE, 0.25)
  });
}

/** 두 발 다리 */
function addBipedLegs(parts, look, color, hipY, hipX) {
  const skin = darken(color, 0.62);
  for (const side of [1, -1]) {
    const hip = [side * hipX, hipY, 0];
    // 허벅지
    parts.push({
      geo: limbGeo(0.15, 0.11, 0.5),
      matrix: matrix([hip[0], hip[1] - 0.24, 0.02], [0.18, 0, side * 0.1], [1, 1, 1]),
      color: skin
    });
    // 정강이
    parts.push({
      geo: limbGeo(0.1, 0.07, 0.46),
      matrix: matrix([hip[0] * 1.05, hip[1] - 0.62, 0.08], [-0.22, 0, 0], [1, 1, 1]),
      color: skin
    });
    // 발
    parts.push({
      geo: boxGeo(0.26, 0.1, 0.4),
      matrix: matrix([hip[0] * 1.05, 0.05, 0.16], [0, 0, 0], [1, 1, 1]),
      color: darken(color, 0.5)
    });
    // 발톱 3개
    for (let i = 0; i < 3; i++) {
      parts.push({
        geo: clawGeo(),
        matrix: matrix([hip[0] * 1.05 + (i - 1) * 0.08, 0.04, 0.36], [Math.PI * 0.55, 0, 0], [1, 1, 1]),
        color: CLAW
      });
    }
  }
}

/** 네 발(늑대 · 드레이크) — 앞다리 / 뒷다리 */
function addQuadLegs(parts, look, color) {
  const skin = darken(color, 0.62);
  const legs = [
    [0.32, 0.34],
    [-0.32, 0.34],
    [0.36, -0.3],
    [-0.36, -0.3]
  ];
  for (const [x, z] of legs) {
    parts.push({
      geo: limbGeo(0.1, 0.07, 0.55),
      matrix: matrix([x, 0.62, z], [z > 0 ? -0.15 : 0.12, 0, x > 0 ? 0.06 : -0.06], [1, 1, 1]),
      color: skin
    });
    parts.push({
      geo: limbGeo(0.07, 0.05, 0.34),
      matrix: matrix([x * 1.05, 0.24, z + (z > 0 ? 0.05 : -0.03)], [0, 0, 0], [1, 1, 1]),
      color: darken(color, 0.55)
    });
    parts.push({
      geo: boxGeo(0.18, 0.08, 0.26),
      matrix: matrix([x * 1.05, 0.04, z + 0.08], [0, 0, 0], [1, 1, 1]),
      color: darken(color, 0.45)
    });
    for (let i = 0; i < 2; i++) {
      parts.push({
        geo: clawGeo(),
        matrix: matrix([x * 1.05 + (i - 0.5) * 0.07, 0.03, z + 0.22], [Math.PI * 0.55, 0, 0], [1, 1, 1]),
        color: CLAW
      });
    }
  }
}

/** 거미 다리 8개 — 두 마디로 땅을 짚는다 */
function addSpiderLegs(parts, look, color) {
  const skin = darken(color, 0.6);
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const t = (i - 1.5) * 0.26;
      const z = t * 0.55;
      const swing = 0.55 + i * 0.12;
      const hipX = side * 0.42;
      const kneeX = side * (0.85 + i * 0.05);
      const footX = side * (1.05 + i * 0.06);
      // 위쪽 마디
      parts.push({
        geo: limbGeo(0.055, 0.045, 0.62),
        matrix: matrix([(hipX + kneeX) / 2, 1.12, z], [0, 0, side * (Math.PI * 0.34 - swing * 0.1)], [1, 1, 1]),
        color: skin
      });
      // 아래 마디
      parts.push({
        geo: limbGeo(0.045, 0.03, 0.66),
        matrix: matrix([(kneeX + footX) / 2, 0.62, z + 0.02], [0, 0, side * (Math.PI * 0.2)], [1, 1, 1]),
        color: darken(skin, 0.85)
      });
      // 발끝
      parts.push({
        geo: clawGeo(),
        matrix: matrix([footX, 0.05, z + 0.02], [Math.PI * 0.5, 0, side * 0.2], [1, 1, 1]),
        color: CLAW
      });
    }
  }
}

/** 갈비뼈(해골) — 몸통 앞쪽에 가로 막대 */
function addRibs(parts, color) {
  const bone = lighten(BONE, 0.2);
  for (let i = 0; i < 4; i++) {
    const y = 1.18 + i * 0.14;
    parts.push({
      geo: boxGeo(0.62 - i * 0.06, 0.055, 0.1),
      matrix: matrix([0, y, 0.3], [0, 0, 0], [1, 1, 1]),
      color: bone
    });
  }
}

/** 어깨 판금 */
function addPlates(parts, boss) {
  for (const side of [1, -1]) {
    parts.push({
      geo: lump(0.24, 0),
      matrix: matrix([side * 0.52, 1.7, -0.02], [0.2, side * 0.3, side * 0.4], [1.15, 0.5, 1]),
      color: PLATE
    });
  }
  if (boss) {
    parts.push({
      geo: lump(0.3, 0),
      matrix: matrix([0, 1.86, -0.22], [0.5, 0, 0], [1.4, 0.5, 1.1]),
      color: darken(PLATE, 0.8)
    });
  }
}

/** 박쥐 · 드레이크 날개 — 어깨에서 뻗은 얇은 판 */
function addWings(parts, color, boss) {
  const membrane = darken(color, 0.5);
  const boneCol = lighten(color, 0.3);
  for (const side of [1, -1]) {
    // 날개 막(납작한 원뿔)
    parts.push({
      geo: new THREE.ConeGeometry(0.5, 0.9, 3),
      matrix: matrix([side * 0.72, 1.95, -0.22], [0.2, 0, side * (0.9 + 0.1)], [1, 1, 0.16]),
      color: membrane
    });
    // 날개 뼈
    parts.push({
      geo: limbGeo(0.045, 0.03, 0.9),
      matrix: matrix([side * 0.72, 1.95, -0.22], [0.2, 0, side * (0.9 + 0.1)], [1, 1, 1]),
      color: boneCol
    });
    if (boss) {
      parts.push({
        geo: new THREE.ConeGeometry(0.36, 0.7, 3),
        matrix: matrix([side * 1.02, 2.18, -0.3], [0.1, 0, side * 0.55], [1, 1, 0.14]),
        color: membrane
      });
    }
  }
}

/** 망토 — 어깨에서 바닥까지 늘어진 반투명 천 */
function cloakGeometry(color) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const len = 1.1 + (i % 3) * 0.22;
    parts.push({
      geo: new THREE.ConeGeometry(0.14, len, 4),
      matrix: matrix([Math.cos(a) * 0.42, 1.5 - len * 0.35, Math.sin(a) * 0.32], [Math.PI, Math.sin(a) * 0.2, Math.cos(a) * 0.2], [1, 1, 1]),
      color: darken(color, 0.35)
    });
  }
  return mergeParts(parts);
}

/** 팔 — 어깨에서 손 · 발톱까지 (따로 두어 휘두르게 한다) */
function armsGeometry(typeId, look, boss, color) {
  const parts = [];
  const skin = darken(color, 0.66);
  const spread = look.bulk ? 0.72 : 0.58;
  for (const side of [1, -1]) {
    const shoulder = [side * spread, 1.72, 0.04];
    // 위팔
    parts.push({
      geo: limbGeo(0.12, 0.09, 0.52),
      matrix: matrix([shoulder[0] * 1.08, shoulder[1] - 0.26, 0.12], [0.55, 0, side * 0.34], [1, 1, 1]),
      color: skin
    });
    // 아래팔
    parts.push({
      geo: limbGeo(0.09, 0.07, 0.48),
      matrix: matrix([shoulder[0] * 1.16, shoulder[1] - 0.66, 0.3], [-0.35, 0, side * 0.12], [1, 1, 1]),
      color: darken(skin, 0.92)
    });
    // 주먹(골렘은 크게)
    const fistR = look.bigFists ? 0.26 : 0.15;
    parts.push({
      geo: lump(fistR, 0),
      matrix: matrix([shoulder[0] * 1.18, shoulder[1] - 0.9, 0.38], [0.2, 0, 0], look.bigFists ? [1.15, 0.95, 1.1] : [1, 1, 1]),
      color: darken(color, 0.55)
    });
    // 발톱 3개
    for (let i = 0; i < 3; i++) {
      parts.push({
        geo: clawGeo(),
        matrix: matrix(
          [shoulder[0] * 1.18 + (i - 1) * 0.075, shoulder[1] - 0.97, 0.5],
          [Math.PI * 0.62, 0, (i - 1) * 0.14],
          [1, 1, 1]
        ),
        color: CLAW
      });
    }
    if (look.claws) {
      // 팔꿈치 가시
      parts.push({
        geo: hornGeo(0.045, 0.18),
        matrix: matrix([shoulder[0] * 1.2, shoulder[1] - 0.58, 0.16], [0.4, 0, side * 1.2], [1, 1, 1]),
        color: lighten(BONE, 0.2)
      });
    }
  }
  return mergeParts(parts);
}

/** 눈 — 따로 두어 발광 펄스/점멸을 준다 */
function eyesGeometry(typeId, look, boss) {
  const parts = [];
  const count = Math.max(2, look.eyes || 2);
  const perSide = Math.max(1, Math.floor(count / 2));
  const head = monsterHeadAnchor(typeId);
  for (let i = 0; i < perSide; i++) {
    for (const side of [1, -1]) {
      const size = 0.072 - i * 0.014;
      const x = side * (0.14 + i * 0.07);
      const y = head.y + 0.03 + i * 0.055;
      const z = head.z + (look.snout ? 0.3 : 0.24) - i * 0.02;
      parts.push({
        geo: lump(Math.max(0.02, size), 0),
        matrix: matrix([x, y, z], [0, 0, 0], [1, 0.85, 0.8]),
        color: 0xffffff
      });
    }
  }
  if (boss) {
    // 보스 눈 — 더 크게
    for (const side of [1, -1]) {
      parts.push({
        geo: lump(0.055, 0),
        matrix: matrix([side * 0.24, head.y + 0.11, head.z + 0.2], [0, 0, 0], [1, 0.9, 0.85]),
        color: 0xffffff
      });
    }
  }
  return mergeParts(parts);
}

/** 몸통 · 머리 · 뿔 · 등가시 · 다리 … — 한 덩어리 지오메트리 */
function bodyGeometry(typeId, look, boss, color) {
  const parts = [];
  const skin = darken(color, look.thin ? 0.55 : 0.72);
  const belly = darken(color, 0.5);
  const torsoY = monsterTorsoY(typeId);
  const torsoScale = look.bulk ? [1.35, 1.05, 1.15] : look.smallBody ? [0.85, 0.75, 0.85] : look.thin ? [0.62, 0.95, 0.62] : [1.05, 0.95, 0.95];
  const hunch = look.hunch ?? 0.5;

  // 몸통(울퉁불퉁한 저폴리 덩어리)
  parts.push({
    geo: lump(0.62, 1),
    matrix: matrix([0, torsoY, 0], [hunch * 0.35, 0, 0], torsoScale),
    color: skin
  });
  // 배(밝은 살점)
  parts.push({
    geo: lump(0.42, 1),
    matrix: matrix([0, torsoY - 0.12, 0.26], [0.2, 0, 0], [0.72, 0.7, 0.55]),
    color: belly
  });
  // 목
  parts.push({
    geo: limbGeo(0.16, 0.2, 0.3),
    matrix: matrix([0, torsoY + 0.5, 0.1], [hunch * 0.2, 0, 0], [1, 1, 1]),
    color: darken(skin, 0.9)
  });

  // 머리
  const headY = monsterHeadAnchor(typeId).y;
  const headScale = look.head ?? 1;
  parts.push({
    geo: lump(0.32, 1),
    matrix: matrix(
      [0, headY, 0.18],
      [0.12 + hunch * 0.32, 0, 0],
      look.snout
        ? [0.88 * headScale, 0.82 * headScale, 1.55 * headScale]
        : [1.0 * headScale, 0.92 * headScale, 1.05 * headScale]
    ),
    color: skin
  });
  // 이마 돌기
  parts.push({
    geo: hornGeo(0.06, 0.16),
    matrix: matrix([0, headY + 0.24, 0.26], [0.8, 0, 0], [1, 1, 1]),
    color: lighten(BONE, 0.25)
  });
  // 눈두덩(눈 위 그늘)
  parts.push({
    geo: boxGeo(0.46 * headScale, 0.075, 0.12),
    matrix: matrix([0, headY + 0.08, 0.42], [0.2, 0, 0], [1, 1, 1]),
    color: darken(skin, 0.45)
  });
  // 귀
  if (look.ears) {
    for (const side of [1, -1]) {
      parts.push({
        geo: hornGeo(0.09, 0.3),
        matrix: matrix([side * 0.28 * headScale, headY + 0.16, 0.14], [0.2, 0, side * 0.9], [1, 1, 1]),
        color: darken(skin, 0.85)
      });
    }
  }

  addHorns(parts, look, boss, color, headY, 0.18);
  addJaw(parts, look, color, headY, 0.2, look.snout ? 0.34 : 0.22);
  addBackSpikes(parts, look, boss, color, torsoY);

  // 다리
  if (look.stance === 'spider') addSpiderLegs(parts, look, color);
  else if (look.stance === 'quad') addQuadLegs(parts, look, color);
  else if (look.stance !== 'float') addBipedLegs(parts, look, color, torsoY - 0.5, 0.3);
  else {
    // 떠 있는 존재 — 아래로 늘어진 갈고리
    for (const side of [1, -1]) {
      parts.push({
        geo: hornGeo(0.05, 0.4),
        matrix: matrix([side * 0.22, 0.62, 0.02], [Math.PI, 0, side * 0.15], [1, 1, 1]),
        color: darken(skin, 0.8)
      });
    }
  }

  addTail(parts, look, boss, color, -0.5);
  if (look.plates) addPlates(parts, boss);
  if (look.ribs) addRibs(parts, color);
  if (look.wings) addWings(parts, color, boss);
  if (look.bulk) {
    // 두꺼운 어깨 혹
    for (const side of [1, -1]) {
      parts.push({
        geo: lump(0.22, 0),
        matrix: matrix([side * 0.5, torsoY + 0.36, 0], [0, 0, 0], [1, 0.8, 1]),
        color: darken(skin, 0.8)
      });
    }
  }
  return mergeParts(parts);
}

/* ── 완성 모델 ───────────────────────────────────────────────────────── */

const MODEL_CACHE = new Map();

/**
 * 종류별 몬스터 모델 지오메트리.
 * @returns {{ body, arms, eyes, cloak: (THREE.BufferGeometry|null), eyeColor:number }}
 */
export function buildMonsterModel(typeId, { boss = false, color = 0xffffff } = {}) {
  const key = `${typeId}|${boss ? 'b' : 'm'}|${color}`;
  const cached = MODEL_CACHE.get(key);
  if (cached) return cached;
  const look = monsterLook(typeId);
  const eyeColor = typeId === 'skeleton' || typeId === 'wraith' || typeId === 'shade' ? 0xff7a3c : lighten(color, 0.55);
  const model = {
    look,
    body: bodyGeometry(typeId, look, boss, color),
    arms: armsGeometry(typeId, look, boss, color),
    eyes: eyesGeometry(typeId, look, boss),
    cloak: look.cloak ? cloakGeometry(color) : null,
    eyeColor
  };
  MODEL_CACHE.set(key, model);
  return model;
}

/** 몬스터 모델 지오메트리 해제 */
export function disposeMonsterAssets() {
  for (const model of MODEL_CACHE.values()) {
    model.body?.dispose?.();
    model.arms?.dispose?.();
    model.eyes?.dispose?.();
    model.cloak?.dispose?.();
  }
  MODEL_CACHE.clear();
}

/** 정점 색을 쓰는 몸통/팔 재질 */
export function monsterBodyMaterial() {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.08,
    flatShading: true
  });
}

/** 발광 눈 재질 — 개체마다 클론해 점멸시킨다 */
export function monsterEyeMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.6,
    roughness: 0.4,
    metalness: 0,
    flatShading: true
  });
}

export default {
  MONSTER_LOOKS,
  monsterLook,
  monsterTorsoY,
  monsterHeadAnchor,
  buildMonsterModel,
  disposeMonsterAssets,
  monsterBodyMaterial,
  monsterEyeMaterial
};

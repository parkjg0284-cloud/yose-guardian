// 포탑 시스템 — 건설 규칙 / 공격·회복·채굴·벌목 / 판매·업그레이드 / 저장.
// 계약 §4.8: canPlace·place·sell·upgrade·update·buildPreview·toJSON·fromJSON·dispose.
// 지오메트리/머티리얼은 모듈 전역에서 공유한다 (포탑 40개 × 4종 저폴리).

import * as THREE from 'three';
import { TURRET_BY_ID, TOWER_TIER_SCALE, MINERAL_TYPES, POWER, mineralsForRegionTier } from '../data.js';
import { PowerGrid } from './power.js';
import { regionAt } from '../world/regions.js';
import { regionColor } from '../travel.js';
import { beltAccept, beltAdvance, beltCapacity, beltLoad, beltNeighbor, beltReceiver } from './conveyors.js';

export const MAX_TURRETS = 50;
/** 시설(작업대·저장고·채굴기·벨트·소환문 등)만의 상한 — 전체 50개 안에서 40개까지 */
export const MAX_FACILITIES = 40;
/** 전선은 포탑 상한과 따로 센다(배선 때문에 건물을 못 세우면 곤란하다) */
export const MAX_CABLES = 160;
export const MIN_BASE_DISTANCE = 4;
export const MIN_TURRET_DISTANCE = 3;
/** 컨베이어벨트 물류 보너스 상한(겹쳐 놓아도 이 이상은 오르지 않는다) */
export const BELT_BOOST_CAP = 1.5;
/** 몬스터 소환문이 유지하는 최대 동시 개체 수(과밀 방지) */
export const SPAWNER_MAX_ALIVE = 90;
/**
 * 추적 조준 — 공격 포탑이 적을 향해 **몸체를 돌린다**.
 *  · turnRate(rad/s): 몸체 회전 속도. 순간이동하지 않고 이 속도로만 돈다(초당 약 258°).
 *  · holdTime(s): 플레이어가 X/R 로 수동 회전한 뒤에는 이 시간 동안 추적을 양보한다.
 * 포신(head)은 로컬 +Z 규약이라 목표를 **즉시 정확히** 가리키고, 몸체는 그 뒤를 따라간다.
 */
export const TURRET_AIM = Object.freeze({ turnRate: 4.5, holdTime: 1.6 });
/** 각도를 -π..π 로 정규화(최단 경로 회전용) */
const wrapPi = (a) => Math.atan2(Math.sin(num(a, 0)), Math.cos(num(a, 0)));
export const MAX_SLOPE = 0.6;
export const MAX_TIER = 7;
export const SELL_REFUND = 0.25;
const OBSTACLE_CLEARANCE = 1.2;
/** 주변 자원 재탐색 간격(초) — 건물이 늘어도 프레임 비용이 고정되게 한다 */
const RESCAN_INTERVAL = 0.25;

const MINERAL_BY_ID = Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, m]));
const SLOT_PATTERN = /_(\d+)$/;

function num(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function normalizeCost(cost) {
  const out = { gold: Math.max(0, Math.round(num(cost?.gold))), wood: Math.max(0, Math.round(num(cost?.wood))) };
  const minerals = {};
  if (cost?.minerals && typeof cost.minerals === 'object') {
    for (const [id, n] of Object.entries(cost.minerals)) {
      const count = Math.max(0, Math.round(num(n)));
      if (count > 0) minerals[id] = count;
    }
  }
  out.minerals = minerals;
  return out;
}

function distXZ(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function readModifiers(source) {
  if (!source) return null;
  try {
    return typeof source === 'function' ? source() : source;
  } catch {
    return null;
  }
}

// ── 공유 지오메트리 / 머티리얼 ────────────────────────────────────────────
const GEOMETRY_CACHE = new Map();
function sharedGeometry(key, factory) {
  let geo = GEOMETRY_CACHE.get(key);
  if (!geo) {
    geo = factory();
    GEOMETRY_CACHE.set(key, geo);
  }
  return geo;
}

const GEO = {
  base: () => sharedGeometry('turret:base', () => new THREE.CylinderGeometry(0.62, 0.8, 0.5, 6)),
  plinth: () => sharedGeometry('turret:plinth', () => new THREE.BoxGeometry(1.1, 0.26, 1.1)),
  tower: () => sharedGeometry('turret:tower', () => new THREE.CylinderGeometry(0.34, 0.46, 1.0, 6)),
  head: () => sharedGeometry('turret:head', () => new THREE.BoxGeometry(0.5, 0.4, 0.75)),
  barrel: () => sharedGeometry('turret:barrel', () => new THREE.CylinderGeometry(0.11, 0.14, 0.95, 6)),
  gem: () => sharedGeometry('turret:gem', () => new THREE.OctahedronGeometry(0.34, 0)),
  crystal: () => sharedGeometry('turret:crystal', () => new THREE.ConeGeometry(0.16, 0.6, 4)),
  drill: () => sharedGeometry('turret:drill', () => new THREE.ConeGeometry(0.28, 0.95, 6)),
  arm: () => sharedGeometry('turret:arm', () => new THREE.BoxGeometry(0.15, 0.15, 1.0)),
  blade: () => sharedGeometry('turret:blade', () => new THREE.ConeGeometry(0.26, 0.55, 3)),
  leg: () => sharedGeometry('turret:leg', () => new THREE.ConeGeometry(0.1, 0.7, 4)),
  ring: () => sharedGeometry('turret:ring', () => new THREE.RingGeometry(0.92, 1, 40)),
  plate: () => sharedGeometry('turret:plate', () => new THREE.BoxGeometry(1.5, 0.16, 3.4)),
  slat: () => sharedGeometry('turret:slat', () => new THREE.BoxGeometry(1.25, 0.09, 0.3)),
  rail: () => sharedGeometry('turret:rail', () => new THREE.BoxGeometry(0.14, 0.24, 3.4)),
  roller: () => sharedGeometry('turret:roller', () => new THREE.CylinderGeometry(0.22, 0.22, 1.32, 10)),
  crate: () => sharedGeometry('turret:crate', () => new THREE.BoxGeometry(0.44, 0.38, 0.44)),
  arch: () => sharedGeometry('turret:arch', () => new THREE.TorusGeometry(1.18, 0.15, 6, 14)),
  spike: () => sharedGeometry('turret:spike', () => new THREE.ConeGeometry(0.16, 0.72, 4))
};

const MATERIAL_CACHE = new Map();
function turretMaterial(color, role = 'accent', ghost = false) {
  const key = `${color}|${role}|${ghost ? 'g' : 's'}`;
  let mat = MATERIAL_CACHE.get(key);
  if (mat) return mat;
  if (ghost) {
    mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      flatShading: true
    });
  } else if (role === 'stone') {
    mat = new THREE.MeshStandardMaterial({ color: 0x6b6257, roughness: 0.92, flatShading: true });
  } else if (role === 'metal') {
    mat = new THREE.MeshStandardMaterial({ color: 0x3d434b, roughness: 0.6, metalness: 0.35, flatShading: true });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.45,
      roughness: 0.5,
      metalness: 0.2,
      flatShading: true
    });
  }
  MATERIAL_CACHE.set(key, mat);
  return mat;
}

/** 모듈 전역 공유 리소스 해제 (엔진 종료 시). */
export function disposeTurretAssets() {
  for (const geo of GEOMETRY_CACHE.values()) geo.dispose?.();
  GEOMETRY_CACHE.clear();
  for (const mat of MATERIAL_CACHE.values()) mat.dispose?.();
  MATERIAL_CACHE.clear();
}

/**
 * 카테고리별 저폴리 포탑 오브젝트를 만든다.
 * @returns {{ group: THREE.Group, head: THREE.Group, accent: THREE.Material }}
 */
function buildTurretObject(type, ghost = false) {
  const group = new THREE.Group();
  const color = type.color ?? 0xffffff;
  const stone = turretMaterial(0x6b6257, 'stone', ghost);
  const metal = turretMaterial(0x3d434b, 'metal', ghost);
  const accent = turretMaterial(color, 'accent', ghost);

  const base = new THREE.Mesh(GEO.base(), stone);
  base.position.y = 0.25;
  group.add(base);
  const plinth = new THREE.Mesh(GEO.plinth(), stone);
  plinth.position.y = 0.6;
  plinth.scale.setScalar(0.78);
  group.add(plinth);

  const head = new THREE.Group();
  group.add(head);

  if (type.category === 'attack') {
    const tower = new THREE.Mesh(GEO.tower(), metal);
    tower.position.y = 1.15;
    group.add(tower);
    head.position.y = 1.72;
    const box = new THREE.Mesh(GEO.head(), accent);
    head.add(box);
    const barrel = new THREE.Mesh(GEO.barrel(), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = 0.55;
    head.add(barrel);
  } else if (type.category === 'heal') {
    const spire = new THREE.Mesh(GEO.tower(), stone);
    spire.position.y = 1.35;
    spire.scale.set(0.72, 1.9, 0.72);
    group.add(spire);
    head.position.y = 2.5;
    const gem = new THREE.Mesh(GEO.gem(), accent);
    head.add(gem);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(GEO.crystal(), accent);
      const a = (i / 3) * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.42, -0.22, Math.sin(a) * 0.42);
      c.rotation.z = Math.cos(a) * 0.3;
      head.add(c);
    }
  } else if (type.category === 'mining') {
    const derrick = new THREE.Mesh(GEO.tower(), metal);
    derrick.position.y = 1.2;
    derrick.scale.set(0.95, 1.35, 0.95);
    group.add(derrick);
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(GEO.leg(), metal);
      const a = (i / 3) * Math.PI * 2 + 0.4;
      leg.position.set(Math.cos(a) * 0.55, 0.4, Math.sin(a) * 0.55);
      leg.rotation.x = 0.32;
      leg.rotation.z = -Math.cos(a) * 0.34;
      group.add(leg);
    }
    head.position.y = 2.05;
    const drill = new THREE.Mesh(GEO.drill(), accent);
    drill.rotation.x = Math.PI;
    drill.position.y = -0.28;
    head.add(drill);
    const collar = new THREE.Mesh(GEO.gem(), metal);
    collar.scale.setScalar(0.7);
    head.add(collar);
  } else if (type.category === 'facility') {
    const kind = type.kind ?? 'storage';
    if (kind === 'workbench') {
      // 작업대: 상판 + 다리 + 모루/보석
      const bench = new THREE.Mesh(GEO.plinth(), metal);
      bench.scale.set(1.6, 1.0, 1.1);
      bench.position.y = 0.92;
      group.add(bench);
      for (const legPos of [[-0.62, -0.42], [0.62, -0.42], [-0.62, 0.42], [0.62, 0.42]]) {
        const leg = new THREE.Mesh(GEO.leg(), metal);
        leg.scale.set(0.75, 0.62, 0.75);
        leg.position.set(legPos[0], 0.32, legPos[1]);
        group.add(leg);
      }
      head.position.y = 1.5;
      const anvil = new THREE.Mesh(GEO.head(), metal);
      anvil.scale.set(1.15, 0.7, 0.85);
      head.add(anvil);
      const spark = new THREE.Mesh(GEO.gem(), accent);
      spark.scale.setScalar(0.62);
      spark.position.y = 0.42;
      head.add(spark);
    } else if (kind === 'storage') {
      // 저장고: 큰 상자 + 금속 테 + 자물쇠
      const crate = new THREE.Mesh(GEO.plinth(), metal);
      crate.scale.set(1.5, 2.6, 1.5);
      crate.position.y = 0.95;
      group.add(crate);
      for (const bandY of [0.5, 1.42]) {
        const band = new THREE.Mesh(GEO.plinth(), stone);
        band.scale.set(1.6, 0.16, 1.6);
        band.position.y = bandY;
        group.add(band);
      }
      head.position.y = 2.15;
      const lock = new THREE.Mesh(GEO.gem(), accent);
      head.add(lock);
    } else if (kind === 'autominer') {
      // 채굴기: 자립형 드릴 리그
      const rig = new THREE.Mesh(GEO.tower(), metal);
      rig.scale.set(1.05, 1.2, 1.05);
      rig.position.y = 1.05;
      group.add(rig);
      for (let i = 0; i < 4; i++) {
        const leg = new THREE.Mesh(GEO.leg(), metal);
        const a = (i / 4) * Math.PI * 2 + 0.4;
        leg.position.set(Math.cos(a) * 0.6, 0.36, Math.sin(a) * 0.6);
        leg.rotation.x = 0.3;
        leg.rotation.z = -Math.cos(a) * 0.3;
        group.add(leg);
      }
      head.position.y = 1.85;
      const drill = new THREE.Mesh(GEO.drill(), accent);
      drill.rotation.x = Math.PI;
      drill.position.y = -0.3;
      head.add(drill);
      const collar = new THREE.Mesh(GEO.gem(), metal);
      collar.scale.setScalar(0.62);
      head.add(collar);
      // 채굴 모션 부품(계약 §4.63) — 왕복 슬리브 · 먼지 링. 날(bit)은 위 drill 을 그대로 쓴다.
      const sleeve = new THREE.Mesh(GEO.plate(), metal);
      sleeve.scale.set(0.72, 0.5, 0.72);
      sleeve.position.y = 0.1;
      head.add(sleeve);
      // 티끌은 지형 색으로 물들여야 하므로 재질을 복제해 둔다(계약 §4.63)
      const dust = new THREE.Mesh(GEO.gem(), accent.clone());
      dust.scale.setScalar(0.12);
      dust.position.y = -0.9;
      dust.visible = false;
      head.add(dust);
      head.userData.bit = drill;
      head.userData.sleeve = sleeve;
      head.userData.dust = dust;
      head.userData.dustMat = dust.material;
      head.userData.bitY = drill.position.y;
      head.userData.sleeveY = sleeve.position.y;
    } else if (kind === 'conveyor') {
      // 컨베이어벨트: 낮고 긴 데크 + 레일 + 롤러 + 흐르는 슬랫(짐칸)
      base.visible = false;
      plinth.visible = false;
      const L = num(type.beltLength, 3.4);
      const W = num(type.beltWidth, 1.5);
      const zs = L / 3.4;
      const deck = new THREE.Mesh(GEO.plate(), metal);
      deck.scale.set(W / 1.5, 1, zs);
      deck.position.y = 0.5;
      group.add(deck);
      for (const sx of [-1, 1]) {
        const rail = new THREE.Mesh(GEO.rail(), stone);
        rail.scale.set(1, 1, zs);
        rail.position.set(sx * (W / 2 + 0.06), 0.66, 0);
        group.add(rail);
      }
      for (const sz of [-1, 1]) {
        const roller = new THREE.Mesh(GEO.roller(), accent);
        roller.rotation.z = Math.PI / 2;
        roller.scale.set(1, W / 1.32, 1);
        roller.position.set(0, 0.6, sz * (L / 2 - 0.08));
        group.add(roller);
      }
      for (const [px, pz] of [[-0.5, -1.1], [0.5, -1.1], [-0.5, 1.1], [0.5, 1.1]]) {
        const leg = new THREE.Mesh(GEO.leg(), metal);
        leg.position.set(px * (W / 1.5), 0.22, pz * zs);
        group.add(leg);
      }
      head.position.y = 0.6;
      // 상자 재질 기준 — _animate 에서 복제해 광물 색을 입힌다(계약 §4.68)
      head.userData.crateMat = metal;
      const spacing = 0.5;
      const count = Math.max(3, Math.floor(L / spacing));
      for (let i = 0; i < count; i++) {
        const slat = new THREE.Mesh(GEO.slat(), i % 3 === 0 ? accent : metal);
        slat.scale.set(W / 1.25, 1, 1);
        slat.position.y = 0.08;
        slat.userData.slat = true;
        slat.userData.base = -L / 2 + (i + 0.5) * spacing;
        slat.userData.span = L;
        // (예전 정적 상자는 실제 광물 상자로 대체됐다 — 계약 §4.68)
        head.add(slat);
      }
    } else if (kind === 'spawner') {
      // 몬스터 소환문: 아치 + 어둠의 문 + 뾰족한 말뚝
      for (const sx of [-1, 1]) {
        const col = new THREE.Mesh(GEO.tower(), stone);
        col.scale.set(0.7, 1.7, 0.7);
        col.position.set(sx * 1.05, 0.85, 0);
        group.add(col);
      }
      const arch = new THREE.Mesh(GEO.arch(), stone);
      arch.position.y = 1.62;
      group.add(arch);
      for (let i = 0; i < 3; i++) {
        const spike = new THREE.Mesh(GEO.spike(), metal);
        const a = (i / 3) * Math.PI * 2 + 0.5;
        spike.position.set(Math.cos(a) * 1.25, 0.36, Math.sin(a) * 1.25);
        group.add(spike);
      }
      head.position.y = 1.55;
      const door = new THREE.Mesh(GEO.plinth(), metal);
      door.scale.set(1.7, 8.4, 0.14);
      head.add(door);
      const rim = new THREE.Mesh(GEO.ring(), accent);
      rim.scale.setScalar(1.28);
      rim.position.z = 0.06;
      head.add(rim);
      for (let i = 0; i < 3; i++) {
        const rune = new THREE.Mesh(GEO.gem(), accent);
        const a = (i / 3) * Math.PI * 2;
        rune.scale.setScalar(0.36);
        rune.position.set(Math.cos(a) * 1.15, Math.sin(a) * 1.15, 0.05);
        head.add(rune);
      }
    } else if (kind === 'generator') {
      // 발전기: 원통 본체 + 코일 다리 + 빛나는 코어 + 회전자 링
      const body = new THREE.Mesh(GEO.tower(), metal);
      body.scale.set(1.5, 1.9, 1.5);
      body.position.y = 0.95;
      group.add(body);
      const cap = new THREE.Mesh(GEO.plinth(), stone);
      cap.scale.set(1.35, 1.1, 1.35);
      cap.position.y = 1.9;
      group.add(cap);
      for (let i = 0; i < 4; i++) {
        const coil = new THREE.Mesh(GEO.leg(), stone);
        const a = (i / 4) * Math.PI * 2 + 0.4;
        coil.position.set(Math.cos(a) * 0.74, 0.52, Math.sin(a) * 0.74);
        coil.rotation.z = -Math.cos(a) * 0.26;
        group.add(coil);
      }
      head.position.y = 2.3;
      const core = new THREE.Mesh(GEO.gem(), accent);
      core.scale.setScalar(1.05);
      head.add(core);
      const rotor = new THREE.Mesh(GEO.ring(), accent);
      rotor.rotation.x = -Math.PI / 2;
      rotor.scale.setScalar(0.72);
      rotor.position.y = 0.1;
      head.add(rotor);
    } else if (kind === 'cable') {
      // 전선: 낮은 기둥 + 가로대 + 빛나는 연결구
      const pole = new THREE.Mesh(GEO.tower(), metal);
      pole.scale.set(0.4, 0.68, 0.4);
      pole.position.y = 0.34;
      group.add(pole);
      const bar = new THREE.Mesh(GEO.arm(), stone);
      bar.scale.set(1.7, 0.8, 0.5);
      bar.position.y = 0.7;
      group.add(bar);
      head.position.y = 0.86;
      const tip = new THREE.Mesh(GEO.gem(), accent);
      tip.scale.setScalar(0.4);
      head.add(tip);
    }
  } else if (type.category === 'portal') {
    // 포탈 — 기둥 2개 + 떠 있는 고리 + 안쪽 빛판 (지형 색)
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(GEO.tower(), stone);
      pillar.scale.set(0.62, 2.6, 0.62);
      pillar.position.set(side * 1.15, 1.3, 0);
      group.add(pillar);
      const cap = new THREE.Mesh(GEO.gem(), accent);
      cap.scale.setScalar(0.42);
      cap.position.set(side * 1.15, 2.75, 0);
      group.add(cap);
    }
    head.position.y = 1.7;
    const ringA = new THREE.Mesh(GEO.ring(), accent);
    ringA.scale.setScalar(1.7);
    ringA.position.y = 0.35;
    head.add(ringA);
    const ringB = new THREE.Mesh(GEO.ring(), accent);
    ringB.scale.setScalar(1.25);
    ringB.position.y = 0.35;
    head.add(ringB);
    const core = new THREE.Mesh(GEO.gem(), accent);
    core.scale.setScalar(1.05);
    head.add(core);
  } else {
    // lumber
    const frame = new THREE.Mesh(GEO.tower(), metal);
    frame.position.y = 1.1;
    frame.scale.set(0.9, 1.15, 0.9);
    group.add(frame);
    head.position.y = 1.9;
    const hub = new THREE.Mesh(GEO.gem(), metal);
    hub.scale.setScalar(0.75);
    head.add(hub);
    const arm = new THREE.Mesh(GEO.arm(), metal);
    arm.position.z = 0.5;
    head.add(arm);
    const blade = new THREE.Mesh(GEO.blade(), accent);
    blade.position.z = 1.0;
    blade.rotation.x = -Math.PI / 2;
    head.add(blade);
  }

  group.traverse?.((obj) => {
    if (obj.isMesh) {
      obj.castShadow = !ghost;
      obj.receiveShadow = false;
    }
  });
  return { group, head, accent };
}

// ── Turret ───────────────────────────────────────────────────────────────
// ── 채굴기 티어 채굴(계약 §4.60) ──────────────────────────────────
//  · 채굴기 티어(또는 지형 등급)가 높을수록 **저티어 광물 채굴량이 늘어난다**.
//  · 채굴기 티어가 높으면 **저티어 광물도 확률로 섞여 나온다**(맨땅 시추).
//  · T1 채굴기 + T1 지형은 예전과 완전히 같다(초당 1개, 1등급 광물만).
export const DRILL_YIELD_PER_GAP = 0.35;  // 등급 차이 1당 저티어 광물 +35%
export const DRILL_LOW_TIER_CHANCE = 0.2; // 채굴기 티어 1당 저티어 광물 확률 +20%
export const DRILL_LOW_TIER_MAX = 0.6;    // 저티어 광물 확률 상한

/** 채굴 능력 등급 — 채굴기 티어와 지형 등급 중 높은 쪽을 쓴다. */
export function drillPower({ drillTier = 1, terrainGrade = 1 } = {}) {
  return Math.max(1, Math.floor(num(drillTier, 1)), Math.floor(num(terrainGrade, 1)));
}

/** 저티어 광물 채굴량 배수 — 등급 차이가 0이면 1(그대로). */
export function drillYieldBonus(power, mineralTier) {
  const p = Math.max(1, Math.floor(num(power, 1)));
  const m = Math.max(1, Math.floor(num(mineralTier, 1)));
  return 1 + Math.max(0, p - m) * DRILL_YIELD_PER_GAP;
}

/** 이번 한 번, 저티어 광물을 캘 확률(0 ~ 0.6). 캘 저티어 광물이 없으면 0. */
export function drillLowTierChance(power, terrainGrade) {
  const grade = Math.max(1, Math.floor(num(terrainGrade, 1)));
  if (grade <= 1) return 0;
  const p = Math.max(1, Math.floor(num(power, 1)));
  return Math.min(DRILL_LOW_TIER_MAX, Math.max(0, (p - 1) * DRILL_LOW_TIER_CHANCE));
}

/**
 * 이번에 캘 광물 등급을 고른다.
 * roll(0~1)이 저티어 확률에 걸리면 지형 등급보다 낮은 등급 중 하나를 pickRoll 로 고른다.
 * @returns {number} 1~terrainGrade
 */
export function drillPickGrade({ power = 1, terrainGrade = 1, roll = 0, pickRoll = 0 } = {}) {
  const grade = Math.max(1, Math.floor(num(terrainGrade, 1)));
  const chance = drillLowTierChance(power, grade);
  if (chance <= 0 || Math.max(0, num(roll, 0)) >= chance) return grade;
  const span = grade - 1;
  const step = Math.min(span - 1, Math.floor(Math.max(0, num(pickRoll, 0)) * span));
  return Math.max(1, grade - 1 - Math.max(0, step));
}

export class Turret {
  constructor({ id, type, position = null, ownerId = null, scene = null, system = null, invested = null, yaw = 0 }) {
    this.id = id;
    this.type = type;
    this.typeId = type.id;
    this.category = type.category;
    this.tier = type.tier;
    this.family = type.family ?? null;
    this.slot = (type.id.match(SLOT_PATTERN)?.[1] ?? 0) | 0;
    this.ownerId = ownerId;
    this.scene = scene ?? null;
    this.system = system ?? null;
    this.position = new THREE.Vector3(num(position?.x), num(position?.y), num(position?.z));
    this.destroyed = false;
    this.hitFlash = 0;
    this.cooldown = 0;
    this.target = null;
    this.mineral = null;
    this.tree = null;
    this._harvestAcc = 0;
    this._storeGold = 0;
    this._storeWood = 0;
    this._drillPhase = 0;
    /** 전력 공급 여부(전력망 재계산 때 갱신) */
    this.powered = true;
    this.powerNet = null;
    /** 저장고 버퍼(용량까지 쌓인다) */
    this._bufGold = 0;
    this._bufWood = 0;
    this._collectFlash = 0;
    /** 채굴기가 지금 캐는 지형 티어·광물(패널 표시용) */
    this._drillRegion = null;
    this._drillPoolNow = null;
    this.yaw = num(yaw);
    /** 추적 조준(§4.42) — 실제로 바라보는 몸체 각도 · 추적 목표각 · 수동 우선 남은 시간 */
    this.aimYaw = this.yaw;
    this._aimWant = this.yaw;
    this._aimHold = 0;
    /** 지금 조준 중인 적(없으면 null) */
    this.aimTarget = null;
    this.beltBoost = 0;
    this.boostedTowers = 0;
    this._spawnTimer = null;
    this._spawnPhase = 0;
    this._spawnPulse = 0;
    this._animT = 0;
    this.invested = invested ?? {
      gold: normalizeCost(type.cost).gold,
      wood: normalizeCost(type.cost).wood,
      minerals: { ...normalizeCost(type.cost).minerals }
    };
    this._applyType(type, null);
    this.mesh = new THREE.Group();
    this.head = null;
    this.mesh.name = `turret:${this.id}`;
    this.mesh.userData.turret = this;
    this._build();
    this.mesh.position.copy(this.position);
  }

  get alive() {
    return !this.destroyed && this.hp > 0;
  }

  get radius() {
    return 1.2;
  }

  get hpRatio() {
    return this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
  }

  /** 이 시설이 바라보는 수평 방향(플레이어 yaw 규약과 동일 — 벨트 진행 방향) */
  forward(out = null) {
    const yaw = num(this.yaw);
    const v = out ?? new THREE.Vector3();
    return v.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  /**
   * 이 건물이 바라보는 방향을 지정한다(0~2π 정규화).
   * opts.smooth = true 면 메시가 목표 각도로 부드럽게 따라간다(연속 회전·릴레이용).
   */
  setYaw(yaw, opts = {}) {
    const next = num(yaw, 0);
    this.yaw = wrapPi(next);
    // 플레이어(또는 릴레이)가 돌린 각도가 우선 — holdTime 동안은 추적하지 않는다.
    this._aimHold = TURRET_AIM.holdTime;
    this._aimWant = this.yaw;
    this.aimYaw = this.yaw;
    if (opts?.smooth) {
      this.yawTarget = this.yaw;
    } else {
      this.yawTarget = null;
      if (this.mesh) this.mesh.rotation.y = this.yaw;
    }
    return this.yaw;
  }

  /** 상대 회전(+ 는 반시계). 회전 후 yaw(라디안)를 돌려준다. */
  rotateBy(delta, opts = {}) {
    return this.setYaw(num(this.yaw) + num(delta, 0), opts);
  }

  /**
   * 회전 처리 — ① 추적 조준(§4.42): 적이 있으면 몸체가 turnRate 로 그쪽을 향해 돌아간다.
   *                      ② 수동 회전(§4.37): 플레이어가 돌린 동안은 그 각도를 부드럽게 따라간다.
   * 적이 사라지면 플레이어가 정해 둔 yaw(제자리 각도) 로 되돌아온다.
   */
  _followYaw(dt) {
    const step = Math.max(0, Math.min(num(dt), 0.1));
    if (this._aimHold > 0) this._aimHold = Math.max(0, this._aimHold - step);

    if (this.mesh && this._aimHold <= 0) {
      const diff = wrapPi(num(this._aimWant) - num(this.aimYaw));
      const maxStep = TURRET_AIM.turnRate * step;
      if (Math.abs(diff) > 1e-4) {
        // 최단 경로로만, 프레임당 maxStep 만큼 — 순간이동(스냅) 없이 따라간다.
        const turn = Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep;
        this.aimYaw = wrapPi(num(this.aimYaw) + turn);
        this.mesh.rotation.y = this.aimYaw;
        this.yawTarget = null;
        return;
      }
      this.aimYaw = wrapPi(num(this.aimYaw));
      // 목표에 도달 — 이 분기는 추적이 회전을 소유하므로 남은 수동 보간 목표는 버린다.
      this.yawTarget = null;
      if (Math.abs(wrapPi(num(this.mesh.rotation.y) - this.aimYaw)) > 1e-6) {
        this.mesh.rotation.y = this.aimYaw;
      }
      return;
    }

    if (!this.mesh || this.yawTarget == null) {
      if (this.mesh) this.aimYaw = num(this.mesh.rotation.y);
      return;
    }

    const cur = num(this.mesh.rotation.y);
    let diff = wrapPi(num(this.yawTarget) - cur);
    const k = 1 - Math.exp(-14 * step);
    if (Math.abs(diff) < 0.0025) {
      this.mesh.rotation.y = this.yawTarget;
      this.yawTarget = null;
      this.aimYaw = num(this.mesh.rotation.y);
      return;
    }
    this.mesh.rotation.y = cur + diff * k;
    this.aimYaw = num(this.mesh.rotation.y);
  }

  /** 조준 상태(추적 중인 적·몸체 각도) — 패널·테스트용 */
  aimState() {
    const offset = Math.abs(wrapPi(num(this.aimYaw) - num(this.yaw)));
    return {
      yaw: num(this.yaw),
      aimYaw: num(this.aimYaw),
      targetId: this.aimTarget?.id ?? null,
      tracking: Boolean(this.aimTarget) && offset > 0.01,
      holding: this._aimHold > 0,
      offset
    };
  }

  /** 이 건물이 바라보는 방향(도 단위 · 표시용) */
  get yawDegrees() {
    return Math.round((((num(this.yaw) * 180) / Math.PI) % 360 + 360) % 360);
  }

  /** 총 투자 비용 (판매 환불 기준) */
  get investedCost() {
    return {
      gold: num(this.invested?.gold),
      wood: num(this.invested?.wood),
      minerals: { ...(this.invested?.minerals ?? {}) }
    };
  }

  _applyType(type, hpRatio) {
    this.type = type;
    this.typeId = type.id;
    this.category = type.category;
    this.tier = type.tier;
    this.family = type.family ?? this.family;
    this.damage = num(type.damage);
    this.range = num(type.range, 20);
    this.fireRate = num(type.fireRate, 1);
    this.aoe = num(type.aoe);
    this.element = type.element ?? 'arcane';
    this.effect = type.effect ?? 'projectile';
    this.color = type.color ?? 0xffffff;
    this.healPerSec = num(type.healPerSec);
    this.rate = num(type.rate);
    // 전력(공급/소비) · 저장 용량 · 연결 거리
    this.output = num(type.output);
    this.draw = num(type.draw);
    this.capacity = num(type.capacity);
    this.linkRange = num(type.linkRange);
    this.maxHp = Math.max(1, num(type.hp, 100));
    this.hp = hpRatio === null ? this.maxHp : Math.max(1, Math.round(this.maxHp * Math.max(0.3, Math.min(1, hpRatio))));
    this.tierScale = TOWER_TIER_SCALE[this.tier] ?? TOWER_TIER_SCALE[MAX_TIER];
    this._applyArcana(); // 마법연성 배율(계약 §4.70)
  }

  /**
   * 마법연성 배율을 적용한다(계약 §4.70).
   * 절대값을 다시 쓰지 않고 **이전 배율과의 비**만 곱한다 —
   * 그래서 업그레이드로 올린 데미지가 연성 때문에 초기화되지 않는다.
   */
  _applyArcana(next = null) {
    const f = next ?? this.system?.arcana?.factors?.() ?? null;
    const prev = this._arcanaFactors ?? { turretRange: 1, turretDamage: 1, turretFireRate: 1, drillSpeed: 1, lumberSpeed: 1 };
    if (!f) { this._arcanaFactors = prev; return false; }
    const rel = (k) => {
      const a = num(prev[k], 1) || 1;
      const b = num(f[k], 1);
      return b > 0 ? b / a : 1;
    };
    const dmg = rel('turretDamage');
    const rng = rel('turretRange');
    const rate = rel('turretFireRate');
    const speed = rel(this.category === 'lumber' ? 'lumberSpeed' : 'drillSpeed');
    if (dmg !== 1) this.damage = Math.max(0, Math.round(num(this.damage) * dmg));
    if (rng !== 1) this.range = Math.round(num(this.range) * rng * 10) / 10;
    if (rate !== 1) this.fireRate = Math.round(num(this.fireRate) * rate * 100) / 100;
    if (speed !== 1 && this.rate > 0) this.rate = Math.round(num(this.rate) * speed * 1000) / 1000;
    this._arcanaFactors = { ...f };
    return true;
  }

  /** 저장고가 보관할 수 있는 양(연성 '중앙코어 저장고' 반영) */
  storageCapacity() {
    const cap = Math.max(0, num(this.type?.capacity, 0));
    const mult = num(this.system?.arcana?.mult?.('coreStorage'), 1) || 1;
    return Math.round(cap * mult);
  }

  _build() {
    this.mesh.clear?.();
    const { group, head, accent } = buildTurretObject(this.type);
    // group 자체는 스케일/위치만 쓰고 자식만 옮겨 담는다.
    for (const child of [...group.children]) this.mesh.add(child);
    this.head = head;
    this._accentMaterial = accent;
    const sc = this.tierScale ?? TOWER_TIER_SCALE[1];
    this._baseScale = 1 + Math.max(0, num(sc.hp, 1) - 1) * 0.055;
    this.mesh.scale.setScalar(this._baseScale);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = num(this.yaw);
  }

  _rebuild() {
    this._build();
  }

  /** 다음 티어 항목으로 교체 (데이터 기준 — TOWER_TIER_SCALE 반영) */
  applyType(nextType, { keepHpRatio = true } = {}) {
    const ratio = keepHpRatio && this.maxHp > 0 ? this.hp / this.maxHp : null;
    this._applyType(nextType, ratio);
    this._rebuild();
  }

  /** 다음 티어 항목이 없을 때 TOWER_TIER_SCALE 배율로 직접 확장한다. */
  applyScaledTier(tier, scale) {
    const prev = TOWER_TIER_SCALE[this.tier] ?? TOWER_TIER_SCALE[MAX_TIER];
    const next = scale ?? TOWER_TIER_SCALE[Math.min(MAX_TIER, tier)] ?? TOWER_TIER_SCALE[MAX_TIER];
    const dmgRatio = num(next.damage, 1) / num(prev.damage, 1);
    const hpRatio = num(next.hp, 1) / num(prev.hp, 1);
    const rangeRatio = num(next.range, 1) / num(prev.range, 1);
    const keep = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    this.tier = tier;
    this.tierScale = next;
    this.damage = Math.round(this.damage * dmgRatio);
    this.maxHp = Math.max(1, Math.round(this.maxHp * hpRatio));
    this.hp = Math.max(1, Math.round(this.maxHp * Math.max(0.3, keep)));
    this.range = Math.round(this.range * rangeRatio * 10) / 10;
    this.fireRate = Math.round(this.fireRate * 1.06 * 100) / 100;
    if (this.rate > 0) this.rate = Math.round(this.rate * dmgRatio * 100) / 100;
    if (this.healPerSec > 0) this.healPerSec = Math.round(this.healPerSec * dmgRatio * 100) / 100;
    this._rebuild();
  }

  takeDamage(amount, element = null, source = null) {
    const dmg = Math.max(0, num(amount));
    if (this.destroyed || dmg <= 0) return { hp: this.hp, destroyed: this.destroyed };
    this.hp -= dmg;
    this.hitFlash = 0.2;
    if (this.hp <= 0) {
      this.hp = 0;
      this.destroyed = true;
      this.system?._onTurretDestroyed?.(this, source);
    }
    return { hp: this.hp, destroyed: this.destroyed };
  }

  heal(amount) {
    const n = Math.max(0, num(amount));
    if (this.destroyed || n <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + n);
    return this.hp - before;
  }

  // ── 갱신 ───────────────────────────────────────────────────────────────
  update(dt, ctx = {}) {
    if (this.destroyed) return;
    const step = Math.max(0, Math.min(num(dt), 0.5));
    if (step <= 0) return;
    this._followYaw(step);
    this._animT += step;
    this.cooldown = Math.max(0, this.cooldown - step);
    this.hitFlash = Math.max(0, this.hitFlash - step);
    this.beltBoost = this._usesBeltBoost() ? this._beltBoostNow() : 0;
    switch (this.category) {
      case 'attack':
        this._updateAttack(step, ctx);
        break;
      case 'heal':
        this._updateHeal(step, ctx);
        break;
      case 'mining':
        this._updateMining(step, ctx);
        break;
      case 'lumber':
        this._updateLumber(step, ctx);
        break;
      case 'facility':
        this._updateFacility(step, ctx);
        break;
      case 'portal':
        // 포탈은 상호작용(N)으로 이동한다 — 스스로 할 일은 회전 연출뿐
        if (this.head) this.head.rotation.y += step * 0.4;
        break;
      default:
        break;
    }
    this._animate(step);
  }

  _mods() {
    return this.system?._mods ?? null;
  }

  _muzzle(out) {
    const v = out ?? new THREE.Vector3();
    if (this.head) {
      this.head.updateWorldMatrix?.(true, false);
      v.set(0, 0, 0.7).applyMatrix4(this.head.matrixWorld);
    } else {
      v.copy(this.position).setY(this.position.y + 1.6);
    }
    return v;
  }

  _updateAttack(dt, ctx) {
    const enemies = ctx.enemies ?? [];
    let best = null;
    let bestD2 = this.range * this.range;
    for (const enemy of enemies) {
      if (!enemy?.alive) continue;
      const dx = enemy.position.x - this.position.x;
      const dz = enemy.position.z - this.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = enemy;
      }
    }
    this.target = best;
    this.aimTarget = best ?? null;
    if (!best || !this.head) {
      this._aimWant = num(this.yaw); // 적이 없으면 제자리 각도로 복귀
      return;
    }

    const dx = best.position.x - this.position.x;
    const dz = best.position.z - this.position.z;
    // 포신(head)은 로컬 +Z 규약, 몸체(yaw)는 -Z 규약(forward) — 서로 반대라 π 만큼 보정한다.
    const barrelYaw = Math.atan2(dx, dz);
    this._aimWant = wrapPi(barrelYaw + Math.PI);
    // 몸체가 어느 각도로 돌아가 있어도 포신은 항상 목표를 정확히 가리킨다.
    const bodyYaw = num(this.mesh ? this.mesh.rotation.y : this.aimYaw);
    this.head.rotation.y = wrapPi(barrelYaw - bodyYaw);

    // ★ 연사 게이트 — cooldown 이 남아 있으면 이번 프레임은 쏘지 않는다(조준은 위에서 이미 갱신).
    if (this.cooldown > 0) return;
    this.cooldown = 1 / Math.max(0.05, this.fireRate);
    const mods = this._mods();
    const bonus = this.element === 'fire' ? 1 + num(mods?.fireDamage) : 1;
    const origin = this._muzzle();
    const dir = new THREE.Vector3(dx, (best.position.y ?? 0) + this.radius - origin.y, dz).normalize();
    const speed = this.effect === 'beam' ? 130 : this.effect === 'area' ? 28 : this.effect === 'chain' ? 70 : 58;
    this.system?.projectiles?.spawn?.({
      origin,
      direction: dir,
      speed,
      damage: Math.max(1, Math.round(this.damage * bonus)),
      element: this.element,
      behavior: this.effect,
      radius: this.effect === 'area' ? 1.6 : 1.1,
      range: this.range,
      color: this.color,
      owner: 'turret',
      pierce: this.effect === 'chain' ? 0 : 1,
      chainCount: 4,
      aoe: this.aoe,
      onHit: () => {}
    });
    this.system?.audio?.play?.('fire');
    if (this.head && this.category === 'attack') this.head.position.z = -0.06; // 반동
  }

  _updateHeal(dt, ctx) {
    const system = this.system;
    const mods = this._mods();
    const amount = this.healPerSec * dt * (1 + num(mods?.healBonus));
    if (amount <= 0) return;
    const base = ctx.base ?? system?.world?.base ?? null;
    if (base) {
      if (num(base.hp) < num(base.maxHp, Infinity)) base.heal?.(amount);
      else if (num(base.maxShield) > 0 && num(base.shield) < num(base.maxShield)) {
        base.shield = Math.min(num(base.maxShield), num(base.shield) + amount * 0.35);
      }
    }
    for (const other of system?.turrets ?? []) {
      if (other === this || other.destroyed || other.hp >= other.maxHp) continue;
      if (distXZ(this.position, other.position) <= this.range) other.heal?.(amount);
    }
    const player = ctx.player;
    if (player?.position && distXZ(this.position, player.position) <= this.range && num(player.hp) < num(player.maxHp, Infinity)) {
      player.heal?.(amount);
    }
  }

  // rate 는 "초당 산출 개수"(data 의 income.per 와 동일 값)이므로,
  // 광물/나무의 hp·총산출량으로 필요한 타격량을 환산한다.
  _yieldDamage(target, perSec, totalKey) {
    const hp = num(target?.maxHp, 0);
    const total = num(target?.[totalKey], 0);
    if (hp > 0 && total > 0) return perSec * (hp / total);
    return perSec * 30;
  }

  /** 자원 재탐색 게이트 — 0.25초에 한 번만(매 프레임 전체 광물/나무 훑기 방지) */
  _rescanReady(dt) {
    this._rescanAcc = num(this._rescanAcc) + Math.max(0, num(dt));
    if (this._rescanAcc < RESCAN_INTERVAL) return false;
    this._rescanAcc = 0;
    return true;
  }

  _updateMining(dt, ctx) {
    const system = this.system;
    const mods = this._mods();
    if (!this.mineral || this.mineral.depleted) {
      if (!this._rescanReady(dt)) {
        if (this.head) this.head.rotation.y += dt * 1.5;
        return;
      }
      this.mineral = system?.world?.nearestMineral?.(this.position, this.range) ?? null;
    }
    const target = this.mineral;
    if (!target) {
      if (this.head) this.head.rotation.y += dt * 1.5;
      // 주변에 광물이 없어도 맨땅을 시추한다 — 설치 위치를 가리지 않는다.
      this._drillTerrain(dt, this.rate * (1 + num(mods?.miningSpeed)));
      return;
    }
    if (this.head) this.head.rotation.y += dt * 6;
    const rate = this.rate * (1 + num(mods?.miningSpeed));
    const res = target.harvest?.(this._yieldDamage(target, rate, 'totalYield') * dt);
    if (!res) return;
    this._harvestAcc += Math.max(0, num(res.amount)) * (1 + this.beltBoost);
    const whole = Math.floor(this._harvestAcc);
    if (whole > 0) {
      this._harvestAcc -= whole;
      this._creditMineral(res.mineralId ?? target.typeId ?? target.mineralId ?? null, whole);
    }
    if (res.depleted) this.mineral = null;
  }

  /**
   * 시스템의 컨베이어벨트만 모아 둔다(계약 §4.68).
   * 건물 수가 그대로면 지난 프레임의 목록을 그대로 쓴다 — 입금 경로가 매번 전체를 훑지 않게.
   */
  _beltList(system) {
    const list = system?.turrets;
    if (!Array.isArray(list) || !list.length) return null;
    const cache = system._beltCache;
    if (Array.isArray(cache) && system._beltCacheSrc === list && system._beltCacheLen === list.length) return cache;
    const belts = list.filter((t) => t && !t.destroyed && t.type?.kind === 'conveyor');
    system._beltCache = belts;
    system._beltCacheSrc = list;
    system._beltCacheLen = list.length;
    return belts;
  }

  /** 광물 n개를 경제/통계에 반영한다(채굴탑·채굴기 공용). */
  _creditMineral(id, whole, drilled = false) {
    if (!id || whole <= 0) return;
    const system = this.system;
    // 옆에 컨베이어벨트가 있으면 **벨트에 싣고**, 입금은 하역할 때 한다(계약 §4.68).
    //  벨트 자신은 싣지 않는다 — 하역한 광물이 다시 벨트로 올라가면 순환한다.
    if (this.type?.kind !== 'conveyor') {
      // 벨트 목록은 건물 수가 바뀔 때만 다시 만든다 — 입금은 아주 자주 일어난다(계약 §4.68)
      const loaded = beltLoad(this, id, whole, this._beltList(system));
      if (loaded > 0) {
        this._beltFeedPulse = 0.3;
        if (system) system.beltLoaded = num(system.beltLoaded) + loaded;
        whole -= loaded;
        if (whole <= 0) return;
      }
    }
    system?.economy?.addMineral?.(id, whole);
    const info = MINERAL_BY_ID[id];
    const gold = Math.round(num(info?.value, 5) * 0.1) * whole;
    if (gold > 0) {
      system?.economy?.addGold?.(gold);
      system?.stats?.track?.('goldEarned', gold);
    }
    system?.stats?.track?.('mineralsMined', whole);
    if (system) system.mineralsMined = num(system.mineralsMined) + whole;
    system?.mineralTypesMined?.add?.(id);
    system?.stats?.set?.('mineralTypesMined', system?.mineralTypesMined?.size ?? 0);
    if (drilled && system) system.mineralsDrilled = num(system.mineralsDrilled) + whole;
    system?.audio?.play?.('mine');
  }

  // ── 시설: 작업대 / 저장고 / 채굴기 ──────────────────────────────────
  _updateFacility(dt, ctx) {
    const kind = this.type?.kind;
    if (kind === 'generator' || kind === 'cable') return; // 스스로는 아무것도 하지 않는다(전력망이 판단)
    if (kind === 'autominer') {
      this._updateAutoMiner(dt, ctx);
      return;
    }
    if (kind === 'storage') {
      this._updateStorage(dt, ctx);
      return;
    }
    if (kind === 'conveyor') {
      this._updateConveyor(dt, ctx);
      return;
    }
    if (kind === 'spawner') {
      this._updateSpawner(dt, ctx);
      return;
    }
    // 작업대: 대기(무기 제작은 제작 패널에서)
  }

  /** 자원을 실어 나르는 시설인지(벨트 보너스를 받는 쪽) */
  _usesBeltBoost() {
    return this.category === 'mining' || this.category === 'lumber' || this.type?.kind === 'autominer';
  }

  /** 사거리 안 컨베이어벨트의 물류 보너스 합(상한 BELT_BOOST_CAP) */
  _beltBoostNow() {
    const list = this.system?.turrets;
    if (!Array.isArray(list)) return 0;
    let sum = 0;
    for (const t of list) {
      if (t === this || t.destroyed || t.type?.kind !== 'conveyor') continue;
      const d = Math.hypot(t.position.x - this.position.x, t.position.z - this.position.z);
      if (d > num(t.range, 10)) continue;
      sum += num(t.type?.boost, 0);
    }
    return Math.min(BELT_BOOST_CAP, sum);
  }

  /** 컨베이어벨트 — 반경 내 자원 시설을 돕고, 위에 선 플레이어를 민다(conveyorPushAt). */
  _updateConveyor(dt, ctx) {
    const list = this.system?.turrets ?? [];
    let served = 0;
    for (const t of list) {
      if (t === this || t.destroyed || !t._usesBeltBoost?.()) continue;
      const d = Math.hypot(t.position.x - this.position.x, t.position.z - this.position.z);
      if (d <= num(this.range, 10)) served += 1;
    }
    this.boostedTowers = served;
    const system = this.system;
    if (system) system.conveyorTowers = Math.max(num(system.conveyorTowers), served);
    // ── 물류(계약 §4.68): 상자를 흘려보내고 앞 벨트/건물로 넘긴다 ──
    const belts = system?.turrets ?? [];
    const step = beltAdvance(this, dt, {
      handoff: (belt, id) => beltAccept(beltNeighbor(belt, belts), id),
      deliver: (belt, id) => {
        const receiver = beltReceiver(belt, belts);
        if (!receiver) return false;
        belt._beltDeliverPulse = 0.4;
        if (system) {
          system.beltDelivered = num(system.beltDelivered) + 1;
          system.lastBeltReceiverId = receiver.id;
        }
        belt._creditMineral(id, 1, true); // 하역 = 그때 입금
        return true;
      }
    });
    this.jammed = step.jammed === true;
    this._beltJamTimer = step.jammed ? num(this._beltJamTimer) + dt : 0;
    this.beltMoved = num(this.beltMoved) + step.moved;
    if (system) system.beltJammed = belts.filter((t) => t?.jammed).length;
  }

  /** 몬스터 소환문 — 주기마다 주변에 몬스터를 불러낸다(웨이브 진행과 무관). */
  _updateSpawner(dt, ctx) {
    const type = this.type ?? {};
    const interval = Math.max(0.5, num(type.spawnInterval, 10));
    if (this.powered === false) {
      // 전기가 없으면 문이 닫힌다
      if (this._spawnTimer === null) this._spawnTimer = interval;
      this._spawnPulse = Math.max(0, num(this._spawnPulse) - dt);
      return;
    }
    if (this._spawnTimer === null) this._spawnTimer = interval;
    this._spawnTimer -= dt;
    if (this._spawnTimer > 0) return;
    const alive = Array.isArray(ctx?.enemies) ? ctx.enemies.length : 0;
    if (alive >= SPAWNER_MAX_ALIVE) {
      this._spawnTimer = 0.5; // 과밀 — 잠시 대기
      return;
    }
    this._spawnTimer = interval;
    const count = Math.max(1, Math.round(num(type.spawnCount, 1)));
    const spawn = typeof ctx?.spawnEnemy === 'function' ? ctx.spawnEnemy : null;
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      const a = (this._spawnPhase + i) * 2.399;
      const r = 1.7 + (i % 3) * 0.7;
      const x = this.position.x + Math.cos(a) * r;
      const z = this.position.z + Math.sin(a) * r;
      const enemy = spawn?.(x, z, { tier: this.tier, source: 'spawner', wave: ctx?.wave });
      if (enemy) spawned += 1;
    }
    this._spawnPhase += count;
    if (spawned <= 0) return;
    this._spawnPulse = 1;
    const system = this.system;
    if (system) system.monstersSpawned = num(system.monstersSpawned) + spawned;
    system?.stats?.track?.('monstersSpawned', spawned);
  }

  /** 설치 지점의 지형(지역) 정보 — 채굴기가 캘 광물 등급을 정한다. */
  regionInfo() {
    try {
      const reg = regionAt(this.position.x, this.position.z);
      if (!reg) return null;
      return {
        id: reg.id,
        name: reg.name,
        tier: num(reg.tier, 0),
        minerals: Array.isArray(reg.mineralIds) && reg.mineralIds.length ? [...reg.mineralIds] : null
      };
    } catch {
      return null;
    }
  }

  /**
   * 맨땅 시추 시 캘 광물 목록.
   * 히든 지역(벚꽃의 정원·시간의 지평선)은 그 지역 전용 광물, 띠 지역은 **그 지형 티어의 광물**.
   * 기지 주변(안전 지대)·황야는 1등급 광물을 기본값으로 쓴다.
   */
  _drillPool() {
    const fallback = mineralsForRegionTier(1);
    if (!this.type?.drillRegion) {
      const own = Array.isArray(this.type?.drillPool) && this.type.drillPool.length ? [...this.type.drillPool] : null;
      return own ?? fallback;
    }
    const info = this.regionInfo();
    if (!info) return fallback;
    if (info.minerals) return info.minerals;
    const pool = mineralsForRegionTier(info.tier);
    return pool.length ? pool : fallback;
  }

  /** 광물 노드가 없을 때 지형 티어에서 직접 시추한다(채굴기·채굴탑 공용). */
  _drillTerrain(dt, rate) {
    this._harvestAcc += rate * (1 + this.beltBoost) * dt;
    const whole = Math.floor(this._harvestAcc);
    if (whole <= 0) return 0;
    this._harvestAcc -= whole;
    const pool = this._drillPool();
    const region = this.regionInfo();
    this._drillRegion = region;
    this._drillPoolNow = pool;
    const rand = () => {
      const r = this.system?.rng?.next?.();
      return Number.isFinite(r) ? r : Math.random();
    };
    // 지형 등급(맨땅에서 캘 수 있는 최고 등급)
    const terrainGrade = Math.max(1, Math.floor(num(MINERAL_BY_ID[pool[0]]?.tier, 1)));
    const power = drillPower({ drillTier: this.tier, terrainGrade });
    const grade = drillPickGrade({ power, terrainGrade, roll: rand(), pickRoll: rand() });
    const subPool = grade === terrainGrade ? pool : mineralsForRegionTier(grade);
    const usable = subPool.length ? subPool : pool;
    const idx = Math.min(usable.length - 1, Math.floor(rand() * Math.max(1, usable.length)));
    const id = usable[idx] ?? pool[0] ?? 'iron';
    // 고티어 채굴기는 저티어 광물을 더 많이 캔다(소수점은 모아서 한 개로 준다)
    const bonus = drillYieldBonus(power, num(MINERAL_BY_ID[id]?.tier, terrainGrade));
    this._drillBonusAcc = (num(this._drillBonusAcc) || 0) + (bonus - 1);
    let extra = Math.floor(this._drillBonusAcc);
    if (extra > 0) this._drillBonusAcc -= extra;
    if (extra > 200) extra = 200;
    this._drillPhase += 1;
    this._drillPower = power;
    this._drillGrade = grade;
    this._minePulse = 0.35;
    this._creditMineral(id, whole + extra, true);
    return whole + extra;
  }

  /** 채굴기 — 주변 광물이 있으면 채굴하고, 없으면 지형 티어 광물을 시추한다. */
  _updateAutoMiner(dt) {
    const system = this.system;
    const mods = this._mods();
    if (this.powered === false) {
      // 전기가 없으면 멈춘다(드릴 날만 천천히 식는다)
      this._minePulse = 0;
      if (this.head) this.head.rotation.y += dt * 0.3;
      return;
    }
    if (!this.mineral || this.mineral.depleted) {
      // 광물을 찾는 동안에도 시추(맨땅 채굴)는 계속한다 — 탐색만 0.25초에 한 번.
      if (this._rescanReady(dt)) this.mineral = system?.world?.nearestMineral?.(this.position, this.range) ?? null;
    }
    const rate = this.rate * (1 + num(mods?.miningSpeed));
    const target = this.mineral;
    if (target) {
      const res = target.harvest?.(this._yieldDamage(target, rate, 'totalYield') * dt);
      if (res) {
        this._harvestAcc += Math.max(0, num(res.amount)) * (1 + this.beltBoost);
        const whole = Math.floor(this._harvestAcc);
        if (whole > 0) {
          this._harvestAcc -= whole;
          this._minePulse = 0.35;
          this._creditMineral(res.mineralId ?? target.typeId ?? target.mineralId ?? null, whole);
        }
        if (res.depleted) this.mineral = null;
      }
      return;
    }
    // 광물이 없어도 바닥에서 자원을 뽑아낸다
    this._drillTerrain(dt, rate);
  }

  /**
   * 저장고 — 골드·목재를 모아 **용량(capacity)** 까지 쌓고,
   * 플레이어가 반경(range) 안에 들어오면(또는 E) 인벤토리로 수거된다.
   * 전기가 없으면 더 모으지 않는다(쌓인 것은 그대로 수거 가능).
   */
  _updateStorage(dt, ctx) {
    const rate = this.type?.storeRate ?? null;
    if (!rate) return;
    this._collectFlash = Math.max(0, num(this._collectFlash) - dt * 2);
    if (this.powered !== false) {
      const cap = this.storageCapacity(); // 연성 저장고 배율 포함
      const mult = 1 + num(this._mods()?.storageRate);
      this._bufGold = Math.min(cap, num(this._bufGold) + num(rate.gold) * mult * dt);
      this._bufWood = Math.min(cap, num(this._bufWood) + num(rate.wood) * mult * dt);
    }
    this._collectIfNear(ctx);
  }

  /** 반경 안에 플레이어가 있으면 자동 수거 */
  _collectIfNear(ctx) {
    const pos = ctx?.player?.position;
    if (!pos) return 0;
    if (distXZ(this.position, pos) > this.range) return 0;
    return this.collect();
  }

  /** 쌓인 자원을 인벤토리(경제)로 옮긴다 — 자동 수거·E 키 공용. @returns {number} 수거 개수 */
  collect() {
    const system = this.system;
    const gold = Math.floor(num(this._bufGold));
    const wood = Math.floor(num(this._bufWood));
    if (gold <= 0 && wood <= 0) return 0;
    if (gold > 0) {
      this._bufGold -= gold;
      system?.economy?.addGold?.(gold);
      system?.stats?.track?.('goldEarned', gold);
      if (system) system.goldStored = num(system.goldStored) + gold;
    }
    if (wood > 0) {
      this._bufWood -= wood;
      system?.economy?.addWood?.(wood);
      if (system) system.woodStored = num(system.woodStored) + wood;
    }
    this._collectFlash = 1;
    system?.audio?.play?.('pickup');
    return gold + wood;
  }

  /** 저장고 상태(패널·HUD) */
  storageState() {
    const cap = this.storageCapacity(); // 연성 저장고 배율 포함
    return {
      id: this.id,
      name: this.type?.name ?? '저장고',
      tier: num(this.tier, 1),
      gold: num(this._bufGold),
      wood: num(this._bufWood),
      capacity: cap,
      ratio: cap > 0 ? Math.min(1, Math.max(num(this._bufGold), num(this._bufWood)) / cap) : 0,
      powered: this.powered !== false,
      range: this.range
    };
  }

  _updateLumber(dt, ctx) {
    const system = this.system;
    if (!this.tree || this.tree.felled) {
      if (!this._rescanReady(dt)) {
        if (this.head) this.head.rotation.x = 0;
        return;
      }
      this.tree = system?.world?.nearestTree?.(this.position, this.range) ?? null;
    }
    const target = this.tree;
    if (!target) {
      if (this.head) this.head.rotation.x = 0;
      return;
    }
    if (this.head) this.head.rotation.x = Math.sin(this._animT * 3.4) * 0.5;
    const res = target.chop?.(this._yieldDamage(target, this.rate, 'totalWood') * dt);
    if (!res) return;
    this._harvestAcc += (Math.max(0, num(res.wood)) + Math.max(0, num(res.magic))) * (1 + this.beltBoost);
    const whole = Math.floor(this._harvestAcc);
    if (whole > 0) {
      this._harvestAcc -= whole;
      system?.economy?.addWood?.(whole);
      system?.stats?.track?.('woodChopped', whole);
      if (system) system.woodChopped = num(system.woodChopped) + whole;
      system?.audio?.play?.('chop');
    }
    if (res.felled) {
      this.tree = null;
      if (system) system.treesFelled = num(system.treesFelled) + 1;
      system?.stats?.track?.('treesFelled', 1);
    }
  }

  _animate(dt) {
    if (this.head && this.category === 'attack') {
      // 반동 복귀
      const z = this.head.position.z;
      if (z < 0) this.head.position.z = Math.min(0, z + dt * 0.6);
    }
    if (this.head && this.category === 'heal') {
      this.head.rotation.y += dt * 0.8;
      this.head.position.y = 2.5 + Math.sin(this._animT * 1.8) * 0.12;
    }
    if (this.head && this.category === 'facility') {
      const kind = this.type?.kind;
      if (kind === 'autominer') {
        // 채굴 모션(계약 §4.63) — 캐는 동안 날이 빠르게 돌고 슬리브가 왕복하며 먼지가 튄다
        const digging = num(this._minePulse) > 0 && this.powered !== false;
        this._drillSpin = num(this._drillSpin) + dt * (digging ? 9.5 : 1.2);
        const bit = this.head.userData?.bit ?? null;
        const sleeve = this.head.userData?.sleeve ?? null;
        const dust = this.head.userData?.dust ?? null;
        const dustMat = this.head.userData?.dustMat ?? null;
        this.head.rotation.y = this._drillSpin * 0.32;
        if (bit) {
          bit.rotation.y = this._drillSpin;
          const by = num(this.head.userData.bitY, bit.position.y);
          bit.position.y = by + (digging ? Math.sin(this._animT * 11) * 0.14 : 0);
        }
        if (sleeve) {
          const sy = num(this.head.userData.sleeveY, sleeve.position.y);
          sleeve.position.y = sy + (digging ? Math.sin(this._animT * 5.5 + 1.2) * 0.1 : 0);
        }
        // 캐는 동안 티끌 색 = 그 지형의 색(기지·초원·화산 …)
        if (dustMat) {
          const tint = regionColor(this._drillRegion?.id ?? null);
          if (tint && this._dustTint !== tint) {
            dustMat.color.set(tint);
            this._dustTint = tint;
          }
        }
        this.head.position.y = 1.85 + (digging ? Math.sin(this._animT * 7) * 0.03 : 0);
        this._minePulse = Math.max(0, num(this._minePulse) - dt);
        if (dust) {
          const life = Math.min(1, num(this._minePulse) / 0.35);
          dust.visible = life > 0;
          if (life > 0) {
            dust.scale.setScalar(0.12 + (1 - life) * 0.95);
            dust.position.y = -0.9 - (1 - life) * 0.4;
          }
        }
      }
      else if (kind === 'storage') this.head.rotation.y += dt * 0.25;
      else if (kind === 'conveyor') {
        // 슬랫이 벨트 위를 흐른다(짐칸 포함)
        const span = Math.max(1, num(this.type?.beltLength, 3.4));
        // 월드 기준 m/s 가 되도록 모델 스케일로 나눈다(슬랫은 로컬 공간에서 움직인다)
        const scale = Math.max(0.2, num(this.mesh?.scale?.z, 1) || 1);
        const speed = num(this.type?.speed, 2.5) / scale;
        const off = (this._animT * speed) % span;
        for (const slat of this.head.children) {
          if (!slat.userData?.slat) continue;
          const base = num(slat.userData.base, 0);
          // 진행 방향(forward = -Z at yaw 0)과 같은 쪽으로 흐르게 한다
          let z = base - off;
          if (z < -span / 2) z += span;
          slat.position.z = z;
        }
        // 실제로 실려 있는 광물 상자 — 광물 색으로 물들여 벨트 위에 올린다(계약 §4.68)
        const items = Array.isArray(this.beltItems) ? this.beltItems : [];
        if (!Array.isArray(this._beltCrates)) this._beltCrates = [];
        const cap = beltCapacity(this);
        for (let i = 0; i < cap; i += 1) {
          let crate = this._beltCrates[i];
          if (!crate) {
            const baseMat = this.head?.userData?.crateMat
              ?? this.head?.children?.map?.((c) => c.material).find?.((m) => m && m.color)
              ?? null;
            if (!baseMat) break; // 재질 기준을 못 찾으면 상자를 만들지 않는다
            crate = new THREE.Mesh(GEO.crate(), baseMat.clone());
            crate.userData.beltCrate = true;
            this.head.add(crate);
            this._beltCrates[i] = crate;
          }
          const item = items[i];
          if (!item) {
            crate.visible = false;
            continue;
          }
          crate.visible = true;
          // t=0 꼬리(+Z) → t=1 앞(-Z)
          crate.position.set(0, 0.24, span / 2 - num(item.t) * span);
          const color = num(MINERAL_BY_ID[item.id]?.color, 0);
          if (crate.userData.tint !== color) {
            crate.userData.tint = color;
            if (color) crate.material.color.setHex(color);
          }
        }
        this._beltFeedPulse = Math.max(0, num(this._beltFeedPulse) - dt * 1.6);
        this._beltDeliverPulse = Math.max(0, num(this._beltDeliverPulse) - dt * 1.6);
      } else if (kind === 'spawner') {
        this.head.rotation.z += dt * 0.4;
        this._spawnPulse = Math.max(0, num(this._spawnPulse) - dt * 1.6);
        this.head.scale.setScalar(1 + num(this._spawnPulse) * 0.3);
      } else if (kind === 'generator') {
        // 전력이 흐르면 회전자가 빨리 돈다
        const spin = this.powered === false ? 0.4 : 3.2;
        this.head.rotation.y += dt * spin;
        this.head.position.y = 2.3 + Math.sin(this._animT * 2.2) * 0.05;
      } else if (kind === 'cable') {
        // 전기가 통하면 연결구가 맥동한다
        const pulse = this.powered === false ? 0.86 : 1 + Math.sin(this._animT * 4.4) * 0.12;
        this.head.scale.setScalar(pulse);
      } else this.head.position.y = 1.5 + Math.sin(this._animT * 1.4) * 0.04;
    }
    const base = this._baseScale ?? 1;
    this.mesh.scale.setScalar(base * (1 + this.hitFlash * 0.25));
  }

  toJSON() {
    return {
      id: this.id,
      typeId: this.typeId,
      tier: this.tier,
      category: this.category,
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      hp: this.hp,
      maxHp: this.maxHp,
      ownerId: this.ownerId,
      invested: this.investedCost,
      yaw: num(this.yaw, 0),
      // 시설(채굴기 등)은 티어별 전용 typeId 가 없어 rate 를 함께 저장해야 복원된다
      rate: num(this.rate, 0),
      // 벨트 위에 실려 있는 광물(계약 §4.68) — 없으면 넣지 않는다
      items: Array.isArray(this.beltItems) && this.beltItems.length
        ? this.beltItems.map((it) => ({ id: it.id, t: Math.round(num(it.t) * 1000) / 1000 }))
        : undefined
    };
  }

  dispose() {
    this.mesh?.parent?.remove?.(this.mesh);
    this.mesh?.clear?.();
    this.head = null;
    this.target = null;
    this.mineral = null;
    this.tree = null;
  }
}

// ── TurretSystem ─────────────────────────────────────────────────────────
export class TurretSystem {
  constructor({ scene, world, economy, projectiles, audio, stats, rng, modifiers, getItem = null, takeItem = null } = {}) {
    this.scene = scene ?? null;
    this.world = world ?? null;
    this.economy = economy ?? null;
    this.projectiles = projectiles ?? null;
    this.audio = audio ?? null;
    this.stats = stats ?? null;
    this.rng = rng ?? null;
    this.modifiers = modifiers ?? null;
    /** 포탈 아이템 보유 수 조회/소모 — 없으면(null) 예전처럼 자유 설치(테스트·관리자) */
    this._getItem = typeof getItem === 'function' ? getItem : null;
    this._takeItem = typeof takeItem === 'function' ? takeItem : null;
    /** @type {Turret[]} */ this.turrets = [];
    this.maxTurrets = 0;
    this.builtByCategory = { attack: 0, heal: 0, mining: 0, lumber: 0, facility: 0 };
    this.mineralsMined = 0;
    /** @type {Set<string>} */ this.mineralTypesMined = new Set();
    this.woodChopped = 0;
    this.treesFelled = 0;
    this.destroyedCount = 0;
    this._serial = 0;
    this._mods = readModifiers(this.modifiers);
    // ── 전력망 (발전기 → 전선 → 소비 건물)
    this.power = new PowerGrid({ cableRange: POWER.cableRange, deviceRange: POWER.deviceRange });
    this._powerAcc = POWER.interval; // 첫 프레임에 바로 계산
    this._powerState = this.power.status();
    this.powerShort = false;
  }

  get count() {
    return this.turrets.length;
  }

  total() {
    return this.turrets.length;
  }

  countByTier(tier) {
    return this.turrets.filter((t) => t.tier === tier).length;
  }

  countByCategory(category) {
    return this.turrets.filter((t) => t.category === category).length;
  }

  find(turretId) {
    return this.turrets.find((t) => t.id === turretId) ?? null;
  }

  byCategory(category) {
    return this.turrets.filter((t) => t.category === category);
  }

  // ── 건설 규칙 ──────────────────────────────────────────────────────────
  /** @returns {{ok: boolean, reason: string|null, cost?: object}} */
  /** 연성으로 바뀐 배율을 모든 건물에 반영한다(계약 §4.70). */
  applyArcana() {
    const f = this.arcana?.factors?.() ?? null;
    let n = 0;
    for (const t of this.turrets) if (t?._applyArcana?.(f)) n += 1;
    return n;
  }

  /** 전선을 뺀 전체 건물 수와 그중 시설 수 — 건설 상한(50/40)의 단일 계산. */
  structureCounts() {
    let total = 0;
    let facilities = 0;
    for (const t of this.turrets) {
      if (!t || t.destroyed || t.type?.kind === 'cable') continue;
      total += 1;
      if (t.type?.category === 'facility') facilities += 1;
    }
    return { total, facilities };
  }

  canPlace(typeId, position) {
    const type = TURRET_BY_ID[typeId];
    if (!type) return { ok: false, reason: '알 수 없는 포탑입니다' };
    if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.z))) {
      return { ok: false, reason: '위치가 올바르지 않습니다' };
    }
    const cableCount = this.turrets.filter((t) => !t.destroyed && t.type?.kind === 'cable').length;
    if (type.kind === 'cable') {
      // 전선은 따로 센다(배선 때문에 건물을 못 세우면 곤란하다)
      if (cableCount >= MAX_CABLES) return { ok: false, reason: `전선은 최대 ${MAX_CABLES}개까지 깔 수 있습니다` };
    } else {
      const counts = this.structureCounts();
      if (counts.total >= MAX_TURRETS) {
        return { ok: false, reason: `건물은 최대 ${MAX_TURRETS}개까지 세울 수 있습니다(전선 제외)` };
      }
      if (type.category === 'facility' && counts.facilities >= MAX_FACILITIES) {
        return { ok: false, reason: `시설은 최대 ${MAX_FACILITIES}개까지 세울 수 있습니다(전체 ${MAX_TURRETS}개 안)` };
      }
    }

    const x = Number(position.x);
    const z = Number(position.z);
    const world = this.world;

    if (world) {
      if (typeof world.isInside === 'function') {
        if (!world.isInside(x, z)) return { ok: false, reason: '맵 밖에는 세울 수 없습니다' };
      } else {
        const half = num(world.bounds?.half, 2500);
        if (Math.abs(x) > half || Math.abs(z) > half) return { ok: false, reason: '맵 밖에는 세울 수 없습니다' };
      }
    }

    const base = world?.base ?? null;
    if (base?.position) {
      const minDist = num(base.radius, 6) + MIN_BASE_DISTANCE;
      if (Math.hypot(x - base.position.x, z - base.position.z) < minDist) {
        return { ok: false, reason: '기지에 너무 가깝습니다' };
      }
    }

    for (const other of this.turrets) {
      if (other.destroyed) continue;
      const d = Math.hypot(x - other.position.x, z - other.position.z);
      if (d < MIN_TURRET_DISTANCE) return { ok: false, reason: '다른 포탑과 너무 가깝습니다' };
    }

    if (world && typeof world.getHeight === 'function') {
      const h0 = num(world.getHeight(x, z));
      const dx = Math.abs(num(world.getHeight(x + 0.5, z), h0) - num(world.getHeight(x - 0.5, z), h0));
      const dz = Math.abs(num(world.getHeight(x, z + 0.5), h0) - num(world.getHeight(x, z - 0.5), h0));
      if (Math.max(dx, dz) > MAX_SLOPE) return { ok: false, reason: '경사가 너무 급합니다' };
    }

    const probe = new THREE.Vector3(x, num(position.y), z);
    if (world?.nearestTree?.(probe, OBSTACLE_CLEARANCE)) return { ok: false, reason: '나무가 있어 세울 수 없습니다' };
    // 채굴기는 광물 위/옆에 그냥 설치할 수 있다(스스로 캐므로)
    if (type.kind !== 'autominer' && world?.nearestMineral?.(probe, OBSTACLE_CLEARANCE)) {
      return { ok: false, reason: '광물이 있어 세울 수 없습니다' };
    }

    // 포탈은 골드 건설이 아니라 '포탈 아이템'을 소비해 설치한다.
    if (type.kind === 'portal' && type.portalDest) {
      const zero = { gold: 0, wood: 0, minerals: {} };
      const have = this._getItem ? Number(this._getItem(type.portalDest)) || 0 : 1;
      if (have <= 0) {
        return { ok: false, reason: '포탈 아이템이 없습니다 — 제작(C)에서 만드세요', needPortal: type.portalDest, cost: zero };
      }
      return { ok: true, reason: null, cost: zero, portalItem: type.portalDest };
    }

    const cost = normalizeCost(type.cost);
    if (this.economy && typeof this.economy.canAfford === 'function' && !this.economy.canAfford(cost)) {
      return { ok: false, reason: '자원이 부족합니다', cost };
    }
    return { ok: true, reason: null, cost };
  }

  /** 컨베이어벨트 위 좌표의 밀림(승강). 벨트가 없으면 null. */
  conveyorPushAt(position) {
    if (!position || !Array.isArray(this.turrets)) return null;
    let best = null;
    for (const t of this.turrets) {
      if (t.destroyed || t.category !== 'facility' || t.type?.kind !== 'conveyor') continue;
      const dx = num(position.x) - t.position.x;
      const dz = num(position.z) - t.position.z;
      if (Math.abs(num(position.y) - t.position.y) > 1.5) continue;
      const f = t.forward();
      const along = dx * f.x + dz * f.z;
      const side = -dx * f.z + dz * f.x;
      // 티어가 오르면 모델이 커지므로(TOWER_TIER_SCALE) 승강 판정도 실제 크기를 따른다
      const sc = num(t.mesh?.scale?.z, 1) || 1;
      const halfLen = (num(t.type.beltLength, 3.4) * sc) / 2 + 0.25;
      const halfWide = (num(t.type.beltWidth, 1.5) * sc) / 2 + 0.15;
      if (Math.abs(along) > halfLen || Math.abs(side) > halfWide) continue;
      const speed = num(t.type.speed, 2.5);
      if (!best || speed > best.speed) best = { x: f.x * speed, z: f.z * speed, speed, turret: t };
    }
    return best;
  }

  place(typeId, position, ownerId = null, opts = {}) {
    const check = this.canPlace(typeId, position);
    if (!check.ok) {
      this.audio?.play?.('error');
      return null;
    }
    const type = TURRET_BY_ID[typeId];
    const cost = check.cost ?? normalizeCost(type.cost);
    if (check.portalItem) {
      // 아이템이 없으면 설치 실패 — 아이템 소모가 곧 건설 비용이다.
      if (this._takeItem && !this._takeItem(check.portalItem)) {
        this.audio?.play?.('error');
        return null;
      }
    } else if (this.economy && typeof this.economy.spend === 'function' && !this.economy.spend(cost)) return null;

    const y = num(position.y, num(this.world?.getHeight?.(Number(position.x), Number(position.z)), 0));
    const turret = new Turret({
      id: (typeof opts?.id === 'string' && /^[A-Za-z0-9:_-]{1,32}$/.test(opts.id) ? opts.id : `t${++this._serial}`),
      type,
      position: { x: Number(position.x), y, z: Number(position.z) },
      ownerId,
      scene: this.scene,
      system: this,
      yaw: num(opts?.yaw, 0),
      invested: { gold: cost.gold, wood: cost.wood, minerals: { ...cost.minerals } }
    });
    this.turrets.push(turret);
    this.scene?.add?.(turret.mesh);

    this.builtByCategory[type.category] = num(this.builtByCategory[type.category]) + 1;
    const st = this.stats;
    st?.track?.('towersBuilt', 1);
    if (cost.gold > 0) st?.track?.('goldSpent', cost.gold);
    if (type.category === 'attack') st?.track?.('attackTowers', 1);
    else if (type.category === 'heal') st?.track?.('healTowers', 1);
    else if (type.category === 'mining') st?.track?.('miningTowers', 1);
    else if (type.category === 'lumber') st?.track?.('lumberTowers', 1);
    else if (type.category === 'facility') st?.track?.('facilitiesBuilt', 1);
    this.maxTurrets = Math.max(this.maxTurrets, this.structureCounts().total);
    st?.set?.('maxTurrets', this.maxTurrets);
    this.updatePower(true); // 새 건물의 전력 상태를 즉시 반영
    this.audio?.play?.('build');
    return turret;
  }

  /**
   * 다른 클라이언트가 지은 건물을 그대로 세운다 — 자원 소모·통계·사운드 없음.
   * 서버가 준 id 를 유지해야 회전·철거 이벤트가 같은 건물을 가리킨다.
   */
  placeRemote(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const id = String(entry.id ?? '').slice(0, 32);
    if (!id) return null;
    const existing = this.find(id);
    if (existing) return existing;
    const type = TURRET_BY_ID[entry.typeId];
    if (!type) return null;
    if (type.kind === 'cable') {
      if (this.turrets.filter((t) => !t.destroyed && t.type?.kind === 'cable').length >= MAX_CABLES) return null;
    } else {
      const counts = this.structureCounts();
      if (counts.total >= MAX_TURRETS) return null;
      if (type.category === 'facility' && counts.facilities >= MAX_FACILITIES) return null;
    }
    const y = num(entry.y, num(this.world?.getHeight?.(num(entry.x), num(entry.z)), 0));
    const turret = new Turret({
      id,
      type,
      position: { x: num(entry.x), y, z: num(entry.z) },
      ownerId: entry.ownerId ?? null,
      scene: this.scene,
      system: this,
      yaw: num(entry.yaw, 0),
      invested: { gold: 0, wood: 0, minerals: {} }
    });
    turret.remote = true;
    this.turrets.push(turret);
    this.scene?.add?.(turret.mesh);
    this.updatePower(true);
    return turret;
  }

  /** 원격 건물 철거 — 환불·통계 없음 */
  removeRemote(turretId) {
    const turret = this.find(turretId);
    if (!turret || !turret.remote) return false;
    this._remove(turret);
    this.updatePower(true);
    return true;
  }

  /** 스냅샷 기준으로 원격 건물을 맞춘다(재접속 복구). 로컬 소유 건물은 건드리지 않는다. */
  syncRemote(list, localOwnerId = null) {
    const now = Date.now();
    if (now - (this._remoteSyncAt || 0) < 800) return 0;
    this._remoteSyncAt = now;
    const seen = new Set();
    let n = 0;
    for (const entry of Array.isArray(list) ? list : []) {
      if (!entry?.id) continue;
      const id = String(entry.id);
      if (localOwnerId && entry.ownerId === localOwnerId) continue;
      seen.add(id);
      if (!this.find(id) && this.placeRemote(entry)) n += 1;
    }
    for (const turret of [...this.turrets]) {
      if (!turret.remote || seen.has(turret.id)) continue;
      this._remove(turret);
      n += 1;
    }
    return n;
  }

  /**
   * 건물 방향 회전 — 360도 자유(delta 라디안).
   * 벨트는 진행 방향이, 채굴기·소환문은 작업 방향이 바뀐다.
   * @returns {{ ok: boolean, yaw?: number, degrees?: number, turret?: object }}
   */
  rotate(turretId, delta, opts = {}) {
    const turret = this.find(turretId);
    if (!turret || turret.destroyed || typeof turret.rotateBy !== 'function') return { ok: false };
    const yaw = turret.rotateBy(delta, opts);
    return { ok: true, yaw, degrees: turret.yawDegrees, turret };
  }

  /** 절대 방향 지정(멀티플레이 동기화·저장 복원용) */
  setYaw(turretId, yaw, opts = {}) {
    const turret = this.find(turretId);
    if (!turret || turret.destroyed || typeof turret.setYaw !== 'function') return { ok: false };
    const value = turret.setYaw(yaw, opts);
    return { ok: true, yaw: value, degrees: turret.yawDegrees, turret };
  }

  /** 건물을 철거하고 투자 재료의 25%를 돌려준다(포탑·시설 공통). */
  sell(turretId) {
    const turret = this.find(turretId);
    if (!turret) return null;
    const invested = turret.investedCost;
    const refund = { gold: Math.floor(invested.gold * SELL_REFUND), wood: Math.floor(invested.wood * SELL_REFUND), minerals: {} };
    for (const [id, count] of Object.entries(invested.minerals)) {
      const back = Math.floor(num(count) * SELL_REFUND);
      if (back > 0) {
        refund.minerals[id] = back;
        this.economy?.addMineral?.(id, back);
      }
    }
    if (refund.gold > 0) this.economy?.addGold?.(refund.gold);
    if (refund.wood > 0) this.economy?.addWood?.(refund.wood);
    this._remove(turret);
    this.audio?.play?.('sell');
    return { gold: refund.gold, wood: refund.wood, minerals: refund.minerals };
  }

  /** 티어 +1 (최대 7). TOWER_TIER_SCALE 및 상위 티어 데이터를 적용한다. */
  upgrade(turretId) {
    const turret = this.find(turretId);
    if (!turret || turret.destroyed) return false;
    if (turret.tier >= MAX_TIER) return false;
    const nextType = this.nextTierType(turret);
    const nextScale = TOWER_TIER_SCALE[Math.min(MAX_TIER, turret.tier + 1)];
    const cost = nextType ? normalizeCost(nextType.cost) : this._scaledUpgradeCost(turret, nextScale);
    if (this.economy && typeof this.economy.canAfford === 'function' && !this.economy.canAfford(cost)) return false;
    if (this.economy && typeof this.economy.spend === 'function' && !this.economy.spend(cost)) return false;
    this._addInvested(turret, cost);
    if (nextType) turret.applyType(nextType, { keepHpRatio: true });
    else turret.applyScaledTier(turret.tier + 1, nextScale);
    if (cost.gold > 0) this.stats?.track?.('goldSpent', cost.gold);
    this.audio?.play?.('upgrade');
    return true;
  }

  /** 같은 계열/슬롯의 다음 티어 포탑 데이터 */
  nextTierType(turret) {
    const tier = turret.tier + 1;
    if (tier > MAX_TIER) return null;
    if (turret.category === 'attack') return TURRET_BY_ID[`atk_${turret.family}_t${tier}_${turret.slot}`] ?? null;
    if (turret.category === 'facility' && turret.type?.kind) {
      return TURRET_BY_ID[`facility_${turret.type.kind}_t${tier}`] ?? null;
    }
    return TURRET_BY_ID[`${turret.category}_t${tier}`] ?? null;
  }

  _scaledUpgradeCost(turret, nextScale) {
    const prev = TOWER_TIER_SCALE[turret.tier] ?? TOWER_TIER_SCALE[MAX_TIER];
    const ratio = num(nextScale?.costMult, 1) / Math.max(0.01, num(prev?.costMult, 1));
    const base = Math.max(1, num(turret.type?.cost?.gold, 60));
    return { gold: Math.round(base * ratio), wood: Math.round(20 * Math.pow(turret.tier + 1, 1.4)), minerals: {} };
  }

  _addInvested(turret, cost) {
    turret.invested = turret.invested ?? { gold: 0, wood: 0, minerals: {} };
    turret.invested.gold = num(turret.invested.gold) + num(cost.gold);
    turret.invested.wood = num(turret.invested.wood) + num(cost.wood);
    turret.invested.minerals = { ...(turret.invested.minerals ?? {}) };
    for (const [id, count] of Object.entries(cost.minerals ?? {})) {
      turret.invested.minerals[id] = num(turret.invested.minerals[id]) + num(count);
    }
  }

  _onTurretDestroyed(turret, source) {
    this.destroyedCount += 1;
    this.audio?.play?.('explosion');
  }

  _remove(turret) {
    const idx = this.turrets.indexOf(turret);
    if (idx >= 0) this.turrets.splice(idx, 1);
    turret.dispose?.();
    this._powerAcc = POWER.interval; // 다음 프레임에 전력망 다시 계산
  }

  // ── 건설 미리보기 ──────────────────────────────────────────────────────
  /** 반투명 고스트 + 사거리 링 */
  buildPreview(typeId) {
    const type = TURRET_BY_ID[typeId];
    const root = new THREE.Group();
    root.name = 'turret-preview';
    if (!type) return root;
    const { group } = buildTurretObject(type, true);
    root.add(group);
    const ringMat = turretMaterial(type.color ?? 0xffffff, 'ring-ghost', true);
    const ring = new THREE.Mesh(GEO.ring(), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.scale.setScalar(num(type.range, 20));
    root.add(ring);
    root.userData.range = num(type.range, 20);
    root.userData.typeId = typeId;
    return root;
  }

  // ── 루프 ───────────────────────────────────────────────────────────────
  update(dt, ctx = {}) {
    this._mods = readModifiers(this.modifiers);
    const step = Math.max(0, Math.min(num(dt), 0.5));
    if (step <= 0) return;
    this._updatePower(step); // 전력이 있어야 돌아가는 건물이 있으므로 먼저 계산한다
    for (let i = this.turrets.length - 1; i >= 0; i--) {
      const turret = this.turrets[i];
      if (!turret) continue;
      if (turret.destroyed) {
        this._remove(turret);
        continue;
      }
      turret.update(step, ctx);
    }
  }

  // ── 전력망 ─────────────────────────────────────────────────────────────
  /** 전력 노드 목록(발전기·전선·소비 건물) */
  _powerNodes() {
    const nodes = [];
    for (const t of this.turrets) {
      if (!t || t.destroyed) continue;
      nodes.push({
        id: t.id,
        kind: t.type?.kind,
        x: t.position.x,
        z: t.position.z,
        output: num(t.type?.output),
        draw: num(t.type?.draw)
      });
    }
    return nodes;
  }

  /** 전력망 재계산 — 소비 건물의 powered 플래그를 갱신한다. */
  updatePower(force = false) {
    if (!force && num(this._powerAcc) < POWER.interval) return false;
    this._powerAcc = 0;
    this._powerState = this.power.rebuild(this._powerNodes());
    for (const t of this.turrets) {
      if (!t || t.destroyed) continue;
      t.powerNet = this.power.networkOf(t.id);
      t.powered = this.power.isPowered(t.id);
    }
    this.powerShort = this._powerState.short === true;
    return true;
  }

  /** 주기 호출(0.3초) — 발전기·전선을 새로 지으면 즉시 반영된다. */
  _updatePower(dt) {
    this._powerAcc = num(this._powerAcc) + Math.max(0, num(dt));
    if (this._powerAcc < POWER.interval) return false;
    return this.updatePower(true);
  }

  /** 추적 조준 요약 — 지금 적을 따라가고 있는 포탑 수 */
  aimStatus() {
    const list = this.turrets.filter((t) => !t.destroyed && t.aimTarget);
    return { total: this.turrets.length, aiming: list.length, ids: list.map((t) => t.id) };
  }

  /** HUD·패널용 전력 요약 */
  powerStatus() {
    const st = this._powerState ?? this.power.status();
    let generators = 0;
    let cables = 0;
    let consumers = 0;
    let stopped = 0;
    for (const t of this.turrets) {
      if (!t || t.destroyed) continue;
      const kind = t.type?.kind;
      if (kind === 'generator') generators += 1;
      else if (kind === 'cable') cables += 1;
      if (num(t.type?.draw) > 0) {
        consumers += 1;
        if (t.powered === false) stopped += 1;
      }
    }
    return {
      generators,
      cables,
      consumers,
      stopped,
      supply: num(st.supply),
      demand: num(st.demand),
      short: st.short === true,
      shortfall: num(st.shortfall),
      coverage: num(st.coverage, 1),
      networks: num(st.networks),
      // 망별 상세 — 전선으로 이어진 덩어리마다 공급/소비가 다르다
      netList: (this.power?.networks ?? []).map((g) => ({
        id: g.id,
        supply: num(g.supply),
        demand: num(g.demand),
        ok: g.ok !== false,
        sources: num(g.sources),
        consumers: num(g.consumers),
        cables: num(g.cables),
        members: Array.isArray(g.members) ? g.members.length : 0
      })),
      unpowered: Array.isArray(st.unpowered) ? [...st.unpowered] : []
    };
  }

  /** 건물 하나의 전력 상태 */
  isPowered(turretId) {
    return this.power.isPowered(turretId);
  }

  /** 특정 종류 시설의 전력 상황(제작 패널 안내용) */
  facilityPower(kind) {
    const list = this.turrets.filter((t) => !t.destroyed && t.type?.kind === kind);
    const live = list.filter((t) => this.isPowered(t.id));
    return {
      count: list.length,
      powered: live.length,
      draw: list.reduce((sum, t) => sum + num(t.type?.draw), 0),
      ok: list.length > 0 && live.length > 0
    };
  }

  /** 저장고 전체 상황(HUD·패널) */
  storageStatus() {
    const list = this.turrets.filter((t) => !t.destroyed && t.type?.kind === 'storage');
    let gold = 0;
    let wood = 0;
    let capacity = 0;
    let powered = 0;
    for (const t of list) {
      const s = typeof t.storageState === 'function' ? t.storageState() : null;
      if (!s) continue;
      gold += s.gold;
      wood += s.wood;
      capacity += s.capacity;
      if (s.powered) powered += 1;
    }
    return { count: list.length, gold: Math.floor(gold), wood: Math.floor(wood), capacity, powered };
  }

  /** 좌표 근처 저장고(가장 가까운 것) */
  nearestStorage(position, radius = Infinity) {
    let best = null;
    let bestD = radius;
    for (const t of this.turrets) {
      if (t.destroyed || t.type?.kind !== 'storage') continue;
      const d = distXZ(t.position, position);
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** E 키 — 반경 안 저장고의 자원을 즉시 수거 */
  collectStorageNear(position, radius = Infinity) {
    let gained = 0;
    let gold = 0;
    let wood = 0;
    let storages = 0;
    for (const t of this.turrets) {
      if (t.destroyed || t.type?.kind !== 'storage') continue;
      if (distXZ(t.position, position) > radius) continue;
      const before = typeof t.storageState === 'function' ? t.storageState() : null;
      const got = typeof t.collect === 'function' ? t.collect() : 0;
      if (got > 0) {
        gained += got;
        storages += 1;
        if (before) {
          gold += Math.floor(before.gold);
          wood += Math.floor(before.wood);
        }
      }
    }
    return { gained, gold, wood, storages };
  }

  // ── 저장 ───────────────────────────────────────────────────────────────
  toJSON() {
    return {
      maxTurrets: this.maxTurrets,
      builtByCategory: { ...this.builtByCategory },
      mineralsMined: this.mineralsMined,
      mineralTypesMined: [...this.mineralTypesMined],
      woodChopped: this.woodChopped,
      treesFelled: this.treesFelled,
      destroyedCount: this.destroyedCount,
      monstersSpawned: num(this.monstersSpawned),
      mineralsDrilled: num(this.mineralsDrilled),
      turrets: this.turrets.map((t) => t.toJSON())
    };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? o : {};
    for (const turret of [...this.turrets]) this._remove(turret);
    this.turrets.length = 0;
    for (const entry of src.turrets ?? []) {
      const type = TURRET_BY_ID[entry?.typeId];
      if (!type) continue;
      const turret = new Turret({
        id: entry.id ?? `t${++this._serial}`,
        type,
        position: { x: num(entry.x), y: num(entry.y), z: num(entry.z) },
        ownerId: entry.ownerId ?? null,
        scene: this.scene,
        system: this,
        invested: entry.invested ? normalizeCost(entry.invested) : null,
        yaw: num(entry.yaw, 0)
      });
      if (Number.isFinite(Number(entry.hp))) turret.hp = Math.max(1, Math.min(turret.maxHp, Number(entry.hp)));
      // 시설(채굴기 등)은 티어가 typeId 에 없으므로 저장된 tier/rate 를 되살린다(계약 §4.60).
      if (turret.category === 'facility' && Number(entry.tier) > turret.tier) {
        turret.tier = Math.max(1, Math.floor(Number(entry.tier)));
        if (num(entry.rate, 0) > 0) turret.rate = num(entry.rate, 0);
      }
      if (type.kind === 'conveyor' && Array.isArray(entry.items)) {
        // 벨트 위 광물 복원 — 아는 광물만, 용량 안에서, 앞 → 뒤 순서로(계약 §4.68)
        const cap = beltCapacity(turret);
        turret.beltItems = entry.items
          .slice(0, cap)
          .filter((it) => it && MINERAL_BY_ID[it.id])
          .map((it) => ({ id: String(it.id), t: Math.max(0, Math.min(1, num(it.t))) }))
          .sort((a, b) => b.t - a.t);
      }
      this.turrets.push(turret);
      this.scene?.add?.(turret.mesh);
      const m = String(turret.id).match(/\d+/);
      if (m) this._serial = Math.max(this._serial, Number(m[0]));
    }
    this.maxTurrets = Math.max(num(src.maxTurrets), this.turrets.length);
    for (const key of Object.keys(this.builtByCategory)) {
      this.builtByCategory[key] = Math.max(0, Math.floor(num(src.builtByCategory?.[key])));
    }
    this.mineralsMined = Math.max(0, Math.floor(num(src.mineralsMined)));
    this.woodChopped = Math.max(0, Math.floor(num(src.woodChopped)));
    this.treesFelled = Math.max(0, Math.floor(num(src.treesFelled)));
    this.destroyedCount = Math.max(0, Math.floor(num(src.destroyedCount)));
    this.monstersSpawned = Math.max(0, Math.floor(num(src.monstersSpawned)));
    this.mineralsDrilled = Math.max(0, Math.floor(num(src.mineralsDrilled)));
    this.mineralTypesMined = new Set(Array.isArray(src.mineralTypesMined) ? src.mineralTypesMined : []);
    this.power.reset();
    this.updatePower(true);
    return this;
  }

  dispose() {
    for (const turret of this.turrets) turret.dispose?.();
    this.turrets.length = 0;
    this._mods = null;
    this.power?.reset?.();
    this._powerState = this.power?.status?.() ?? null;
  }
}

export default TurretSystem;

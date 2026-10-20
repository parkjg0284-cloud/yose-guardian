// 티어별 지역 + 히든 지역 (계약 §4.21) — 순수 모듈(THREE·DOM 금지).
//
// 맵은 기지(원점)에서의 거리로 8개 띠(안전 지대 + T1~T7)로 나뉘고,
// 그 바깥 황야(OUTER)에 히든 지역 2곳이 따로 놓인다.
// **나무·자원은 자기 티어의 지역에서만 스폰된다** — 히든 지역 자원은 그곳에서만 나온다.

/** 지역 띠 — inner ≤ r < outer (m). tier 0 = 스폰 없음(안전 지대/황야) */
export const REGIONS = [
  { id: 'safe', name: '기지 안전 지대', short: '안전', tier: 0, inner: 0, outer: 70, treeTiers: [], mineralTiers: [], glyph: '🏰', desc: '기지 주변 — 나무·자원이 자라지 않는다' },
  { id: 'tier1', name: 'T1 여명 평원', short: 'T1', tier: 1, inner: 70, outer: 320, treeTiers: [1], mineralTiers: [1], glyph: '🌱', desc: '1등급 나무·광물' },
  { id: 'tier2', name: 'T2 푸른 숲', short: 'T2', tier: 2, inner: 320, outer: 620, treeTiers: [2], mineralTiers: [2], glyph: '🌿', desc: '2등급 나무·광물' },
  { id: 'tier3', name: 'T3 수정 계곡', short: 'T3', tier: 3, inner: 620, outer: 920, treeTiers: [3], mineralTiers: [3], glyph: '🔷', desc: '3등급 나무·광물' },
  { id: 'tier4', name: 'T4 룬 고원', short: 'T4', tier: 4, inner: 920, outer: 1220, treeTiers: [4], mineralTiers: [4], glyph: '🟣', desc: '4등급 나무·광물' },
  { id: 'tier5', name: 'T5 고대 설원', short: 'T5', tier: 5, inner: 1220, outer: 1520, treeTiers: [5], mineralTiers: [5], glyph: '🔶', desc: '5등급 나무·광물' },
  { id: 'tier6', name: 'T6 신화 화산', short: 'T6', tier: 6, inner: 1520, outer: 1820, treeTiers: [6], mineralTiers: [5], glyph: '🔥', desc: '6등급 나무 (광물은 5등급까지)' },
  { id: 'tier7', name: 'T7 유물 지대', short: 'T7', tier: 7, inner: 1820, outer: 2120, treeTiers: [7, 8], mineralTiers: [5], glyph: '👑', desc: '7~8등급 나무 (광물은 5등급까지)' },
  { id: 'outer', name: '끝없는 황야', short: '황야', tier: 0, inner: 2120, outer: Infinity, treeTiers: [], mineralTiers: [], glyph: '🌫️', desc: '아무것도 자라지 않는 바깥 — 히든 지역이 숨어 있다' }
];

/**
 * 히든 지역 — 황야에만 있고, 여기서만 나오는 전용 자원/나무를 가진다.
 * `discoverRadius` 안에 들어가면 발견된다.
 */
export const HIDDEN_REGIONS = [
  {
    id: 'cherry_garden',
    name: '벚꽃의 정원',
    short: '벚꽃',
    glyph: '🌸',
    tier: 6,
    x: -1900,
    z: -1520,
    radius: 240,
    discoverRadius: 320,
    treeIds: ['tree_cherry_blossom'],
    mineralIds: ['blossom_crystal', 'dream_petal'],
    desc: '사계절 내내 만개한 벚꽃이 흩날리는 숨은 정원 — 꿈의 끝은 희망을 만드는 재료가 여기에만 있다'
  },
  {
    id: 'time_horizon',
    name: '시간의 지평선',
    short: '시간',
    glyph: '⏳',
    tier: 7,
    x: 1900,
    z: 1520,
    radius: 240,
    discoverRadius: 320,
    treeIds: ['tree_time_horizon'],
    mineralIds: ['time_shard', 'frozen_hour'],
    desc: '시간이 멈춘 지평선 — 시간의 가위를 만드는 재료가 여기에만 있다'
  }
];

/** 지역별 스폰 밀도(개수) — 띠마다 같은 수를 뿌리고, 히든 지역은 더 촘촘하게 */
export const REGION_SPAWN = Object.freeze({
  /** 히든 지역 1곳당 나무 수 */
  hiddenTrees: 60,
  /** 히든 지역 1곳당 자원 수 */
  hiddenMinerals: 72
});

/** 띠 지역 스폰 가중치 — 안쪽일수록 조금 더 촘촘하다 */
export const RING_TREE_WEIGHT = Object.freeze({
  tier1: 1.25, tier2: 1.2, tier3: 1.15, tier4: 1.1, tier5: 1.05, tier6: 1.0, tier7: 0.95
});
export const RING_MINERAL_WEIGHT = Object.freeze({
  tier1: 1.2, tier2: 1.15, tier3: 1.1, tier4: 1.05, tier5: 1.0, tier6: 0.95, tier7: 0.9
});

/** 스폰 대상 띠 지역(안전 지대·황야 제외) */
export const RING_REGIONS = Object.freeze(REGIONS.filter((r) => r.id.startsWith('tier')));

/**
 * 전체 개수를 띠 지역별 할당량으로 나눈다(가중치 비례, 나머지는 안쪽부터).
 * 세대 합계는 항상 total 과 같다.
 */
export function ringQuotas(total, weights = null) {
  const n = Math.max(0, Math.round(Number(total) || 0));
  const list = RING_REGIONS;
  if (!n || !list.length) return list.map((region) => ({ region, quota: 0 }));
  const w = list.map((r) => Math.max(0.01, Number(weights?.[r.id] ?? 1)));
  const sum = w.reduce((a, b) => a + b, 0);
  const quotas = w.map((x) => Math.floor((n * x) / sum));
  let left = n - quotas.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i = (i + 1) % list.length, left--) quotas[i] += 1;
  return list.map((region, i) => ({ region, quota: quotas[i] }));
}

const REGION_BY_ID = Object.freeze(REGIONS.reduce((acc, r) => ((acc[r.id] = r), acc), {}));
const HIDDEN_BY_ID = Object.freeze(HIDDEN_REGIONS.reduce((acc, r) => ((acc[r.id] = r), acc), {}));
const ALL_BY_ID = Object.freeze({ ...REGION_BY_ID, ...HIDDEN_BY_ID });

/** id → 지역 정의(띠 + 히든) */
export function regionById(id) {
  return ALL_BY_ID[String(id ?? '')] || null;
}

export function isHiddenRegion(id) {
  return Boolean(HIDDEN_BY_ID[String(id ?? '')]);
}

/** 원점에서의 거리 */
export function distanceOf(x, z) {
  const dx = Number(x) || 0;
  const dz = Number(z) || 0;
  return Math.sqrt(dx * dx + dz * dz);
}

/** 히든 지역 판정 — 원 안이면 그 지역, 아니면 null */
export function hiddenRegionAt(x, z) {
  const px = Number(x) || 0;
  const pz = Number(z) || 0;
  for (const h of HIDDEN_REGIONS) {
    const dx = px - h.x;
    const dz = pz - h.z;
    if (dx * dx + dz * dz <= h.radius * h.radius) return h;
  }
  return null;
}

/** 좌표 → 지역(히든 우선, 그다음 거리 띠) */
export function regionAt(x, z) {
  const hidden = hiddenRegionAt(x, z);
  if (hidden) return hidden;
  const r = distanceOf(x, z);
  for (const reg of REGIONS) {
    if (r >= reg.inner && r < reg.outer) return reg;
  }
  return REGION_BY_ID.outer;
}

/** 좌표 → 지역 id */
export function regionIdAt(x, z) {
  return regionAt(x, z).id;
}

/** 지역 띠만(히든 제외) 조회 */
export function ringAt(x, z) {
  const r = distanceOf(x, z);
  for (const reg of REGIONS) {
    if (r >= reg.inner && r < reg.outer) return reg;
  }
  return REGION_BY_ID.outer;
}

/** 특정 티어의 나무를 심을 수 있는 지역인가 */
export function allowsTreeTier(regionId, tier) {
  const reg = regionById(regionId);
  if (!reg) return false;
  return (reg.treeTiers || []).includes(Number(tier));
}

/** 특정 티어의 자원을 심을 수 있는 지역인가 */
export function allowsMineralTier(regionId, tier) {
  const reg = regionById(regionId);
  if (!reg) return false;
  return (reg.mineralTiers || []).includes(Number(tier));
}

/** 지역 id + 나무(또는 {id,tier}) → 그 지역에서 자랄 수 있는가 (히든은 id 기준) */
export function allowsTree(regionId, tree) {
  const reg = regionById(regionId);
  if (!reg || !tree) return false;
  // 데이터 항목(id: 문자열)과 월드 노드(id: 인덱스 + typeId)를 모두 지원한다
  const id = typeof tree.id === 'string' ? tree.id : tree.typeId;
  if (isHiddenRegion(regionId)) return (reg.treeIds || []).includes(id);
  // 히든 지역 전용 나무는 띠 지역에서 자라지 않는다
  if (hiddenTreeIds().includes(id)) return false;
  return (reg.treeTiers || []).includes(Number(tree.tier));
}

/** 지역 id + 광물(또는 {id,tier}) → 그 지역에서 나오는가 (히든은 id 기준) */
export function allowsMineral(regionId, mineral) {
  const reg = regionById(regionId);
  if (!reg || !mineral) return false;
  const id = typeof mineral.id === 'string' ? mineral.id : mineral.typeId;
  if (isHiddenRegion(regionId)) return (reg.mineralIds || []).includes(id);
  // 히든 지역 전용 광물은 띠 지역에서 나오지 않는다
  if (hiddenMineralIds().includes(id)) return false;
  return (reg.mineralTiers || []).includes(Number(mineral.tier));
}

/** 지역 안의 무작위 좌표(띠: 면적 균등, 히든: 원판 균등). rng 는 0~1 함수 */
export function randomPointIn(regionId, rng = Math.random) {
  const reg = regionById(regionId);
  if (!reg) return { x: 0, z: 0 };
  if (isHiddenRegion(regionId)) {
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * reg.radius;
    return { x: reg.x + Math.cos(a) * rr, z: reg.z + Math.sin(a) * rr };
  }
  const outer = Math.min(Number.isFinite(reg.outer) ? reg.outer : 2500, 2500);
  const inner = Math.max(0, reg.inner);
  const a = rng() * Math.PI * 2;
  const rr = Math.sqrt(inner * inner + rng() * (outer * outer - inner * inner));
  return { x: Math.cos(a) * rr, z: Math.sin(a) * rr };
}

/** 지역 요약(패널·HUD용) */
export function regionSummary(x, z) {
  const reg = regionAt(x, z);
  return {
    id: reg.id,
    name: reg.name,
    short: reg.short,
    glyph: reg.glyph,
    tier: reg.tier,
    hidden: isHiddenRegion(reg.id),
    distance: Math.round(distanceOf(x, z))
  };
}

/** 발견 반경 안인가 */
export function inDiscoverRange(hiddenId, x, z) {
  const h = HIDDEN_BY_ID[String(hiddenId ?? '')];
  if (!h) return false;
  const dx = (Number(x) || 0) - h.x;
  const dz = (Number(z) || 0) - h.z;
  return dx * dx + dz * dz <= h.discoverRadius * h.discoverRadius;
}

/** 히든 지역의 전용 자원 id 목록 */
export function hiddenMineralIds() {
  return HIDDEN_REGIONS.flatMap((h) => h.mineralIds);
}

/** 히든 지역의 전용 나무 id 목록 */
export function hiddenTreeIds() {
  return HIDDEN_REGIONS.flatMap((h) => h.treeIds);
}

export const REGION = Object.freeze({
  list: REGIONS,
  rings: RING_REGIONS,
  hidden: HIDDEN_REGIONS,
  spawn: REGION_SPAWN,
  byId: regionById,
  at: regionAt,
  idAt: regionIdAt,
  ringAt,
  hiddenAt: hiddenRegionAt,
  distanceOf,
  allowsTreeTier,
  allowsMineralTier,
  allowsTree,
  allowsMineral,
  randomPointIn,
  ringQuotas,
  summary: regionSummary,
  inDiscoverRange,
  hiddenMineralIds,
  hiddenTreeIds
});

export default REGION;

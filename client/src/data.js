// 요새의 수호자 — 모든 게임 데이터의 단일 소스.
// 규칙: 이 파일은 THREE를 import 하지 않는다 (헤드리스 검증 대상).

export const VERSION = '1.0.0';

export const MAP = {
  size: 5000,
  half: 2500,
  fogColor: 0x9db8d6,
  fogNear: 40,
  fogFar: 340,
  skyTop: 0x1b2a4a,
  skyBottom: 0x8fb0d8,
  sunColor: 0xffe9c4,
  sunIntensity: 1.35,
  ambientColor: 0x5577aa,
  ambientIntensity: 0.55
};

// ──────────────────────────────────────────────── 지형 4종
export const TERRAIN_TYPES = [
  { id: 'plain', name: '평원', desc: '잔디가 깔린 완만한 초원. 시야가 트여 방어에 유리하다.', color: 0x6aa845, heightScale: 6, roughness: 0.95, mineralBonus: { 1: 1.15, 2: 1.0, 3: 0.9, 4: 0.8, 5: 0.7 }, weight: 34 },
  { id: 'hill', name: '언덕', desc: '잔디로 덮인 기복 있는 구릉. 광물이 고르게 분포한다.', color: 0x78b44e, heightScale: 26, roughness: 0.9, mineralBonus: { 1: 1.0, 2: 1.15, 3: 1.0, 4: 0.9, 5: 0.8 }, weight: 28 },
  { id: 'mountain', name: '산악', desc: '바위와 초지가 섞인 험준한 산. 고티어 광물이 풍부하다.', color: 0x7f9668, heightScale: 72, roughness: 0.85, mineralBonus: { 1: 0.8, 2: 0.95, 3: 1.2, 4: 1.45, 5: 1.7 }, weight: 20 },
  { id: 'valley', name: '계곡', desc: '잔디가 우거진 깊은 골짜기. 마법 나무가 자란다.', color: 0x569c50, heightScale: 18, roughness: 1.0, mineralBonus: { 1: 1.1, 2: 1.05, 3: 1.1, 4: 1.15, 5: 1.2 }, weight: 18 }
];

// ──────────────────────────────────────────────── 나무 30종 (히든 지역 2종 포함)
const TREE_TABLE = [
  // 일반 (8)
  ['oak', '참나무', 'normal', 1, { hp: 40, wood: 6, color: 0x3f7d3a, trunk: 0x6b4a2a, scale: 1.0, shape: 'round' }],
  ['birch', '자작나무', 'normal', 1, { hp: 30, wood: 5, color: 0x86b25a, trunk: 0xd8d2c0, scale: 0.9, shape: 'round' }],
  ['pine', '소나무', 'normal', 1, { hp: 46, wood: 7, color: 0x2f6b39, trunk: 0x5b3f24, scale: 1.15, shape: 'cone' }],
  ['maple', '단풍나무', 'normal', 2, { hp: 52, wood: 7, color: 0xc9642f, trunk: 0x6a4326, scale: 1.05, shape: 'round' }],
  ['willow', '버드나무', 'normal', 2, { hp: 48, wood: 6, color: 0x86a94a, trunk: 0x705235, scale: 1.1, shape: 'droop' }],
  ['ash', '물푸레나무', 'normal', 2, { hp: 50, wood: 7, color: 0x4f7f42, trunk: 0x7a6349, scale: 1.0, shape: 'round' }],
  ['zelkova', '느티나무', 'normal', 3, { hp: 62, wood: 8, color: 0x3d7a3a, trunk: 0x6f5334, scale: 1.25, shape: 'round' }],
  ['fir', '전나무', 'normal', 3, { hp: 58, wood: 8, color: 0x27603a, trunk: 0x523a22, scale: 1.2, shape: 'cone' }],
  // 마법 (6)
  ['manatree', '마나수', 'magic', 3, { hp: 70, wood: 6, magic: 3, color: 0x4fc3d9, trunk: 0x3c4f6b, scale: 1.1, shape: 'crystal' }],
  ['runetree', '룬나무', 'magic', 4, { hp: 84, wood: 7, magic: 4, color: 0x8f6bff, trunk: 0x4a3a6b, scale: 1.15, shape: 'crystal' }],
  ['starlight', '별빛나무', 'magic', 4, { hp: 78, wood: 6, magic: 5, color: 0xffe9a3, trunk: 0x5a4a30, scale: 1.2, shape: 'star' }],
  ['miragetree', '환영수', 'magic', 5, { hp: 88, wood: 8, magic: 6, color: 0xc98bff, trunk: 0x4b3b63, scale: 1.1, shape: 'crystal' }],
  ['crystaltree', '결정수', 'magic', 5, { hp: 96, wood: 9, magic: 7, color: 0x6af0e0, trunk: 0x35555a, scale: 1.05, shape: 'crystal' }],
  ['maguswood', '마도목', 'magic', 6, { hp: 108, wood: 10, magic: 9, color: 0x6d7bff, trunk: 0x3a3f6b, scale: 1.2, shape: 'star' }],
  // 원소 (6)
  ['flametree', '화염수', 'elemental', 5, { hp: 92, wood: 7, magic: 5, color: 0xff7a3a, trunk: 0x6b3020, scale: 1.1, shape: 'flame' }],
  ['frosttree', '빙결수', 'elemental', 5, { hp: 100, wood: 7, magic: 5, color: 0x9ee8ff, trunk: 0x486a80, scale: 1.1, shape: 'crystal' }],
  ['bolttree', '번개수', 'elemental', 5, { hp: 86, wood: 8, magic: 6, color: 0xffe15c, trunk: 0x6b5a25, scale: 1.15, shape: 'star' }],
  ['earthtree', '대지수', 'elemental', 5, { hp: 118, wood: 9, magic: 5, color: 0x9c7a45, trunk: 0x5e4a2c, scale: 1.2, shape: 'round' }],
  ['windtree', '풍령수', 'elemental', 6, { hp: 90, wood: 8, magic: 7, color: 0xbff5d0, trunk: 0x4f6b58, scale: 1.15, shape: 'droop' }],
  ['watertree', '수령수', 'elemental', 6, { hp: 104, wood: 8, magic: 7, color: 0x5fc4ff, trunk: 0x3d5f7a, scale: 1.15, shape: 'droop' }],
  // 고대 (5)
  ['worldtree_sapling', '고대세계수', 'ancient', 6, { hp: 190, wood: 18, magic: 10, color: 0x37a06a, trunk: 0x5b4227, scale: 1.7, shape: 'round' }],
  ['elderpine', '태고의 소나무', 'ancient', 6, { hp: 170, wood: 16, magic: 9, color: 0x1f5b3a, trunk: 0x4a3320, scale: 1.65, shape: 'cone' }],
  ['timetree', '시간의 나무', 'ancient', 7, { hp: 210, wood: 18, magic: 13, color: 0xc9b8ff, trunk: 0x453a5e, scale: 1.6, shape: 'star' }],
  ['memorytree', '기억의 나무', 'ancient', 7, { hp: 200, wood: 17, magic: 12, color: 0x8fd6c0, trunk: 0x3f5348, scale: 1.6, shape: 'round' }],
  ['guardiantree', '수호목', 'ancient', 7, { hp: 260, wood: 20, magic: 11, color: 0x4f9c5a, trunk: 0x543d24, scale: 1.8, shape: 'round' }],
  // 신화 (3)
  ['worldtree', '세계수', 'mythic', 8, { hp: 420, wood: 45, magic: 25, color: 0x6bf0a8, trunk: 0x6b4f2a, scale: 2.4, shape: 'round', speedBonus: 0.05 }],
  ['genesistree', '창세목', 'mythic', 8, { hp: 480, wood: 50, magic: 30, color: 0xfff0b0, trunk: 0x7a5a30, scale: 2.5, shape: 'star', speedBonus: 0.1 }],
  ['endtree', '종말수', 'mythic', 8, { hp: 450, wood: 48, magic: 28, color: 0x9b5cff, trunk: 0x3d3050, scale: 2.4, shape: 'flame', speedBonus: 0.08 }],
  // ── 히든 지역 전용 나무 (벚꽃의 정원 · 시간의 지평선에서만 자란다)
  ['tree_cherry_blossom', '만개한 벚꽃나무', 'mythic', 8, { hp: 520, wood: 52, magic: 34, color: 0xffb7d5, trunk: 0x6b4a3a, scale: 2.7, shape: 'droop', speedBonus: 0.06 }],
  ['tree_time_horizon', '시공의 나무', 'mythic', 8, { hp: 560, wood: 56, magic: 42, color: 0xa9e4ff, trunk: 0x4a5a74, scale: 2.8, shape: 'crystal', speedBonus: 0.1 }]
];

export const TREE_TYPES = TREE_TABLE.map(([id, name, category, tier, o]) => ({
  id,
  name,
  category,
  tier,
  hp: o.hp,
  wood: o.wood,
  magic: o.magic || 0,
  color: o.color,
  trunkColor: o.trunk,
  scale: o.scale || 1,
  shape: o.shape || 'round',
  speedBonus: o.speedBonus || 0
}));

export const TREE_CATEGORIES = {
  normal: { id: 'normal', name: '일반', desc: '흔한 나무. 목재를 준다.' },
  magic: { id: 'magic', name: '마법', desc: '마력의 목재와 마나 결정을 준다.' },
  elemental: { id: 'elemental', name: '원소', desc: '속성 정수를 품은 나무.' },
  ancient: { id: 'ancient', name: '고대', desc: '거대하고 단단하다. 큰 이득.' },
  mythic: { id: 'mythic', name: '신화', desc: '전설의 나무. 주변 아군을 강화한다.' }
};

// ──────────────────────────────────────────────── 광물 27종 (히든 지역 4종 포함)
const MINERAL_TIER_WEIGHT = { 1: 110, 2: 72, 3: 44, 4: 20, 5: 7 };
const MINERAL_TIER_YIELD = { 1: 3, 2: 4, 3: 5, 4: 7, 5: 10 };

const MINERAL_TABLE = [
  // T1 (5)
  ['iron', '철광석', 1, { color: 0x9aa4ad, emissive: 0x000000, value: 12, hardness: 1 }],
  ['copper', '구리광석', 1, { color: 0xb87333, emissive: 0x000000, value: 14, hardness: 1 }],
  ['coal', '석탄', 1, { color: 0x2e2e33, emissive: 0x000000, value: 10, hardness: 1 }],
  ['quartz', '석영', 1, { color: 0xd8e6ef, emissive: 0x223344, value: 18, hardness: 1 }],
  ['clay', '점토', 1, { color: 0xa9673f, emissive: 0x000000, value: 8, hardness: 1 }],
  // T2 (5)
  ['silver', '은광석', 2, { color: 0xd9dde3, emissive: 0x111122, value: 26, hardness: 2 }],
  ['tin', '주석', 2, { color: 0xbfc7cc, emissive: 0x000000, value: 24, hardness: 2 }],
  ['obsidian', '흑요석', 2, { color: 0x1c1a26, emissive: 0x2a1040, value: 30, hardness: 2 }],
  ['marble', '대리석', 2, { color: 0xf0ece2, emissive: 0x111111, value: 28, hardness: 2 }],
  ['mana', '마나결정', 2, { color: 0x5fc9ff, emissive: 0x1d5c8a, value: 38, hardness: 2 }],
  // T3 (5)
  ['gold', '금광석', 3, { color: 0xffd24a, emissive: 0x4a3400, value: 55, hardness: 3 }],
  ['mithril', '미스릴', 3, { color: 0x9fe8d8, emissive: 0x1d5a52, value: 68, hardness: 3 }],
  ['sapphire', '사파이어', 3, { color: 0x3f6bff, emissive: 0x112a80, value: 62, hardness: 3 }],
  ['ruby', '루비', 3, { color: 0xff3f5c, emissive: 0x6b0018, value: 62, hardness: 3 }],
  ['emerald', '에메랄드', 3, { color: 0x3fd98a, emissive: 0x0a5a30, value: 64, hardness: 3 }],
  // T4 (5)
  ['adamantite', '아다만타이트', 4, { color: 0x8f9bb3, emissive: 0x1a2340, value: 120, hardness: 4 }],
  ['orichalcum', '오리하르콘', 4, { color: 0xffb45c, emissive: 0x5a2a00, value: 135, hardness: 4 }],
  ['arcanite', '비전수정', 4, { color: 0xb06bff, emissive: 0x3a0070, value: 145, hardness: 4 }],
  ['abyss', '심연광석', 4, { color: 0x2a1a4a, emissive: 0x4a0a6b, value: 150, hardness: 4 }],
  ['dragonbone', '용린석', 4, { color: 0xd94f2a, emissive: 0x5a1500, value: 158, hardness: 4 }],
  // T5 (3)
  ['starshard', '별의 파편', 5, { color: 0xfff6c9, emissive: 0x8a7a20, value: 340, hardness: 5 }],
  ['timesand', '시간의 모래', 5, { color: 0xe0c9ff, emissive: 0x5030a0, value: 380, hardness: 5 }],
  ['genesis', '창세의 정수', 5, { color: 0xffffff, emissive: 0x88ccff, value: 460, hardness: 5 }],
  // ── 히든 지역 전용 광물 (벚꽃의 정원 · 시간의 지평선에서만 캘 수 있다)
  ['blossom_crystal', '벚꽃 결정', 5, { color: 0xffc2dd, emissive: 0x8a2a55, value: 620, hardness: 5, weight: 5 }],
  ['dream_petal', '꿈의 꽃잎', 5, { color: 0xffe2f0, emissive: 0xa04070, value: 780, hardness: 5, weight: 3 }],
  ['time_shard', '시간의 파편', 5, { color: 0xbfe9ff, emissive: 0x1f5f8a, value: 660, hardness: 5, weight: 5 }],
  ['frozen_hour', '멈춘 시간', 5, { color: 0xe8f4ff, emissive: 0x2a4a7a, value: 840, hardness: 5, weight: 3 }]
];

export const MINERAL_TIERS = { 1: '일반', 2: '고급', 3: '희귀', 4: '영웅', 5: '신화' };

export const MINERAL_TYPES = MINERAL_TABLE.map(([id, name, tier, o]) => ({
  id,
  name,
  tier,
  weight: o.weight ?? MINERAL_TIER_WEIGHT[tier],
  color: o.color,
  emissive: o.emissive,
  value: o.value,
  hardness: o.hardness,
  yield: MINERAL_TIER_YIELD[tier],
  rarity: MINERAL_TIERS[tier],
  hp: 30 * tier,
  radius: 0.9 + tier * 0.22
}));

// ── 지형(지역 띠) 티어 ↔ 그 지형에서 캘 수 있는 광물 ────────────────────
// regions.js 의 mineralTiers 와 같은 규칙: T1 평원=1등급, T2 숲=2등급 … T6·T7=5등급.
// 안전 지대(기지 주변)와 황야는 1등급(=맨땅 시추 기본값)으로 본다.
export const REGION_MINERAL_TIER = Object.freeze({ 0: 1, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 5, 7: 5 });

/** 히든 지역(벚꽃의 정원·시간의 지평선) 전용 광물 — 띠 지형에서는 절대 나오지 않는다 */
export const HIDDEN_MINERAL_IDS = Object.freeze(['blossom_crystal', 'dream_petal', 'time_shard', 'frozen_hour']);

/** 지역 띠 티어 → 광물 등급(1~5) */
export function regionMineralTier(tier) {
  const t = Math.round(Number(tier));
  const key = Number.isFinite(t) ? Math.max(0, Math.min(7, t)) : 1;
  return REGION_MINERAL_TIER[key] ?? 1;
}

const MINERAL_IDS_BY_TIER = (() => {
  const byTier = new Map();
  for (const m of MINERAL_TYPES) {
    if (HIDDEN_MINERAL_IDS.includes(m.id)) continue;
    const t = Math.max(1, Math.min(5, Number(m.tier) || 1));
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t).push(m.id);
  }
  return byTier;
})();

/** 지형(지역 띠) 티어 → 그 지형에서 나오는 광물 id 목록 (채굴기 맨땅 시추·건설 재료의 단일 소스) */
export function mineralsForRegionTier(tier) {
  const list = MINERAL_IDS_BY_TIER.get(regionMineralTier(tier));
  return list ? [...list] : [...(MINERAL_IDS_BY_TIER.get(1) ?? [])];
}

/** 티어별 건설 광물 풀 — 티어 N 건물은 이 목록 안의 광물만 요구한다 */
export const TIER_BUILD_MINERALS = Object.freeze({
  1: Object.freeze(mineralsForRegionTier(1)),
  2: Object.freeze(mineralsForRegionTier(2)),
  3: Object.freeze(mineralsForRegionTier(3)),
  4: Object.freeze(mineralsForRegionTier(4)),
  5: Object.freeze(mineralsForRegionTier(5)),
  6: Object.freeze(mineralsForRegionTier(6)),
  7: Object.freeze(mineralsForRegionTier(7))
});

/** 티어 N 건물 비용에 쓸 광물 id (index 로 종류를 돌려 쓴다 — 결정적) */
export function buildMineralFor(tier, index = 0) {
  const list = TIER_BUILD_MINERALS[Math.round(Number(tier))] ?? TIER_BUILD_MINERALS[1];
  const i = ((Math.round(Number(index)) || 0) % list.length + list.length) % list.length;
  return list[i];
}

/** 티어 N 건물의 광물 비용 한 벌 — 그 티어 지형에서만 얻을 수 있는 광물로만 구성된다 */
export function tierMinerals(tier, amountA, amountB = 0) {
  const out = { [buildMineralFor(tier, 0)]: Math.max(1, Math.round(amountA)) };
  if (amountB > 0) out[buildMineralFor(tier, 1)] = Math.max(1, Math.round(amountB));
  return out;
}

// ── 전기 시스템 상수 ──────────────────────────────────────────────────
// 발전기 → 전선 → 소비 건물. 전선끼리는 cableRange, 건물은 deviceRange 안에서 연결된다.
export const POWER = Object.freeze({
  /** 전선 ↔ 전선 연결 최대 간격(m) */
  cableRange: 8,
  /** 건물 ↔ 전선(또는 건물 ↔ 건물) 연결 최대 간격(m) */
  deviceRange: 6,
  /** 전력망 재계산 주기(초) */
  interval: 0.3,
  /**
   * 시설별 소비 전력(kW).
   * 전기를 쓰는 것은 **생산 시설**뿐이다 — 채굴기·저장고·소환문.
   * 작업대·마법부여대는 수동 시설, 컨베이어벨트는 기계식이라 전기가 필요 없다(0kW).
   */
  draw: Object.freeze({ autominer: 3, storage: 2, spawner: 4, workbench: 0, enchanter: 0 })
});

// ──────────────────────────────────────────────── 포탑 (공격47·회복7·채굴7·벌목7·시설)
// ──────────────────────────────────────────────── 가죽 5종 (몬스터 사냥 보상)
// 가죽은 광물처럼 인벤토리에 쌓이지만 **캐는 것이 아니라 몬스터를 잡아 얻는다.**
// 지형 티어가 높은 지역의 몬스터일수록 상위 가죽(용 가죽·유물 가죽)을 떨군다.
const LEATHER_TABLE = [
  ['leather', '질긴 가죽', 1, { color: 0xa9744f, value: 40, glyph: '🟫', drop: 'T1~T2 몬스터' }],
  ['thick_leather', '두꺼운 가죽', 2, { color: 0x7d5334, value: 110, glyph: '🟤', drop: 'T2~T3 몬스터' }],
  ['scaled_leather', '비늘 가죽', 3, { color: 0x4f8f7d, value: 320, glyph: '🟩', drop: 'T3~T4 몬스터' }],
  ['dragon_leather', '용 가죽', 4, { color: 0xd94f2a, value: 900, glyph: '🟥', drop: 'T5~T6 몬스터' }],
  ['relic_leather', '유물 가죽', 5, { color: 0xffe9a8, value: 2600, glyph: '🟨', drop: 'T7·히든 지역 몬스터' }]
];

export const LEATHER_TIERS = { 1: '질긴', 2: '두꺼운', 3: '비늘', 4: '용', 5: '유물' };

export const LEATHER_TYPES = LEATHER_TABLE.map(([id, name, tier, o]) => ({
  id,
  name,
  tier,
  color: o.color,
  value: o.value,
  glyph: o.glyph,
  drop: o.drop,
  rarity: MINERAL_TIERS[tier],
  desc: `${o.drop}에서 얻는 ${LEATHER_TIERS[tier]} 가죽 — 가죽 장비와 상위 날개의 재료.`
}));

export const LEATHER_BY_ID = Object.fromEntries(LEATHER_TYPES.map((l) => [l.id, l]));

/** 가죽 id → 정의(없으면 null) */
export function leatherById(id) {
  return LEATHER_BY_ID[String(id ?? '')] ?? null;
}

/** 가죽 id → 티어(1~5, 없으면 0) */
export function leatherTier(id) {
  return Number(leatherById(id)?.tier) || 0;
}

/** 티어 이하의 가죽 id 목록(하위 티어 포함) — 드롭표·관리자 소환 기본값에 쓴다 */
export function leathersUpTo(tier) {
  const t = Math.max(1, Math.min(5, Math.floor(Number(tier) || 1)));
  return LEATHER_TYPES.filter((l) => l.tier <= t).map((l) => l.id);
}

/** 그 티어에서 실제로 떨어지는 가죽(같은 티어가 기본, 없으면 가장 가까운 하위) */
export function leatherForTier(tier) {
  const t = Math.max(1, Math.min(5, Math.floor(Number(tier) || 1)));
  return LEATHER_TYPES.find((l) => l.tier === t) ?? LEATHER_TYPES[LEATHER_TYPES.length - 1];
}

// ── 캐릭터 전용 아이템 (v1.2.0) ─────────────────────────────────────────
//  외형(스킨)마다 하나씩 — **그 캐릭터로 플레이할 때만** 살 수 있고 쓸 수 있다.
//  보너스는 가죽 장비와 같은 키를 쓴다(같은 경로로 능력치에 적용된다).
export const CHARACTER_ITEMS = [
  {
    id: 'charm_guardian',
    skin: 'guardian',
    name: '수호자의 성채 방패',
    glyph: '🛡️',
    color: 0x5b8dd6,
    cost: { gold: 6000 },
    bonus: { damageTakenPct: 0.08 },
    desc: '성채의 문장이 새겨진 방패. 수호자만 들 수 있어 받는 피해가 8% 줄어든다.'
  },
  {
    id: 'charm_knight',
    skin: 'knight',
    name: '기사의 성검',
    glyph: '⚔️',
    color: 0xc9ccd6,
    cost: { gold: 7000 },
    bonus: { damagePct: 0.12 },
    desc: '은빛 판금과 한 쌍인 대검. 기사만 휘둘러 피해가 12% 늘어난다.'
  },
  {
    id: 'charm_mage',
    skin: 'mage',
    name: '마법사의 마도서',
    glyph: '📖',
    color: 0x9f7bff,
    cost: { gold: 7000 },
    bonus: { manaRegenPct: 0.2 },
    desc: '보랏빛 로브의 주인만 펼칠 수 있는 책. 마나 회복이 20% 빨라진다.'
  },
  {
    id: 'charm_archer',
    skin: 'archer',
    name: '궁수의 장궁',
    glyph: '🏹',
    color: 0x6fbf73,
    cost: { gold: 6500 },
    bonus: { damagePct: 0.09 },
    desc: '숲의 추적자가 쓰는 장궁. 궁수만 당겨 피해가 9% 늘어난다.'
  },
  {
    id: 'charm_rogue',
    skin: 'rogue',
    name: '도적의 그림자 단검',
    glyph: '🗡️',
    color: 0x8f9bb3,
    cost: { gold: 6000 },
    bonus: { moveSpeedPct: 0.12 },
    desc: '먹색 두건의 주인만 쥘 수 있는 단검. 이동 속도가 12% 빨라진다.'
  },
  {
    id: 'charm_alchemist',
    skin: 'alchemist',
    name: '연금술사의 비약',
    glyph: '⚗️',
    color: 0x66d9d0,
    cost: { gold: 6000 },
    bonus: { staminaRegenPct: 0.18 },
    desc: '청록 실험복과 함께 쓰는 비약. 연금술사만 마셔 스태미나 회복이 18% 빨라진다.'
  },
  {
    id: 'charm_bard',
    skin: 'bard',
    name: '음유시인의 류트',
    glyph: '🎻',
    color: 0xffb066,
    cost: { gold: 6500 },
    bonus: { flightSpeedPct: 0.15 },
    desc: '주황 망토의 노래를 담은 류트. 음유시인만 연주해 비행 속도가 15% 빨라진다.'
  },
  {
    id: 'charm_fairy_friend',
    skin: 'fairy_friend',
    name: '요정의 날갯깃',
    glyph: '🧚',
    color: 0xff9fd2,
    cost: { gold: 8000 },
    bonus: { flightSpeedPct: 0.2, flightCeilingPct: 0.1 },
    desc: '요정 친구만 받을 수 있는 날갯깃. 비행 속도 20% · 비행 상한 10% 늘어난다.'
  }
];

export const CHARACTER_ITEM_BY_ID = Object.fromEntries(CHARACTER_ITEMS.map((it) => [it.id, it]));

/** 스킨 id 로 전용 아이템 찾기 */
export function characterItemForSkin(skinId) {
  return CHARACTER_ITEMS.find((it) => it.skin === skinId) ?? null;
}

export const TURRET_CATEGORIES = {
  attack: { id: 'attack', name: '공격형', icon: '⚔', desc: '적을 직접 공격한다.' },
  heal: { id: 'heal', name: '회복탑', icon: '✚', desc: '주변 구조물·기지·아군을 회복시킨다.' },
  mining: { id: 'mining', name: '채굴탑', icon: '⛏', desc: '반경 내 광물을 자동으로 채굴한다.' },
  lumber: { id: 'lumber', name: '벌목탑', icon: '🪓', desc: '반경 내 나무를 자동으로 벌목한다.' },
  facility: { id: 'facility', name: '시설', icon: '🏗', desc: '작업대·저장고·채굴기·컨베이어벨트·몬스터 소환문을 세운다.' },
  portal: { id: 'portal', name: '포탈', icon: '🌀', desc: '지형 이동 포탈 — 세워 두면 가까이에서 N 키로 그 지형으로 이동한다.' }
};

// 공격 계열 7종 — 계열별 이펙트/속성/색
const FAMILIES = [
  { key: 'arrow', effect: 'projectile', element: 'metal', color: 0xd9c9a3, damage: 13, fireRate: 1.15, range: 34, aoe: 0, hp: 120, gold: 60 },
  { key: 'siege', effect: 'area', element: 'earth', color: 0xa9793f, damage: 30, fireRate: 0.45, range: 40, aoe: 5.5, hp: 190, gold: 95 },
  { key: 'arcane', effect: 'beam', element: 'arcane', color: 0x8f6bff, damage: 17, fireRate: 1.6, range: 42, aoe: 0, hp: 130, gold: 110 },
  { key: 'venom', effect: 'projectile', element: 'poison', color: 0x7fd14a, damage: 10, fireRate: 1.3, range: 32, aoe: 3.6, hp: 125, gold: 80 },
  { key: 'flame', effect: 'projectile', element: 'fire', color: 0xff6a2a, damage: 22, fireRate: 0.9, range: 30, aoe: 3.2, hp: 140, gold: 105 },
  { key: 'frost', effect: 'beam', element: 'ice', color: 0x6ad4ff, damage: 14, fireRate: 1.2, range: 35, aoe: 0, hp: 135, gold: 100 },
  { key: 'storm', effect: 'chain', element: 'lightning', color: 0xffe15c, damage: 16, fireRate: 1.0, range: 36, aoe: 0, hp: 128, gold: 120 }
];

const ATTACK_NAME_ROWS = [
  ['화살탑', '돌팔매탑', '마법진탑', '독침탑', '화염초소', '얼음초소', '전격초소'], // T1 (7)
  ['석궁탑', '투석기탑', '비전탑', '독무탑', '화염탑', '냉기탑', '번개탑'], // T2 (7)
  ['장궁탑', '발리스타', '룬탑', '맹독탑', '용암탑', '빙결탑', '뇌전탑'], // T3 (7)
  ['연사탑', '중투석기', '수정탑', '역병탑', '화산탑', '서릿탑', '폭풍탑'], // T4 (7)
  ['기관포탑', '공성탑', '비전폭풍탑', '독룡탑', '지옥불탑', '절대영도탑', '천둥신전'], // T5 (7)
  ['유성탑', '심판탑', '공허탑', '재앙탑', '태양탑', '극광탑'], // T6 (6)
  ['창세의 탑', '종말의 탑', '천상탑', '심연탑', '별빛탑', '시간의 탑'] // T7 (6)
];

const ATTACK_FAMILY_ROW = [0, 1, 2, 3, 4, 5, 6];

/**
 * 연사 정상화 보정 — 과거에는 공격 포탑이 `cooldown` 을 게이트로 쓰지 않아 **프레임마다 1발**을
 * 쏘았다(60fps 기준 초당 60발). 이제 `fireRate`(연사)를 정상 적용하므로 발사 수가 1/60 로 줄어드는데,
 * 그대로 두면 체감 DPS 가 60배 떨어져 게임 난이도가 뒤집힌다. 그래서 **한 발 피해량을 ×60** 해
 * "60fps 에서 느끼던 화력"을 유지한다(이제 프레임레이트에 의존하지 않는다).
 *
 *  · 연사가 의미를 갖는다 — DPS = 피해 × 연사 이므로 빠른 포탑(연사 1.6)이 느린 포탑(0.45)보다 세다.
 *  · 순수 데이터 표 값(DPS = 피해 × 연사)으로 되돌리려면 이 값을 1 로 두면 된다.
 *  · 발사체가 초당 60발 → 연사만큼만 나가므로 400개 풀이 포화되지 않아 **플레이어 사격이 막히지 않는다**.
 */
export const TURRET_DAMAGE_SCALE = 60;

export const TOWER_TIER_SCALE = {
  1: { hp: 1, damage: 1, range: 1, costMult: 1 },
  2: { hp: 1.5, damage: 1.75, range: 1.06, costMult: 2.1 },
  3: { hp: 2.3, damage: 3.1, range: 1.12, costMult: 4.4 },
  4: { hp: 3.6, damage: 5.4, range: 1.18, costMult: 9.2 },
  5: { hp: 5.6, damage: 9.5, range: 1.25, costMult: 19 },
  6: { hp: 8.8, damage: 17, range: 1.32, costMult: 40 },
  7: { hp: 14, damage: 31, range: 1.4, costMult: 84 }
};

// 티어 N 포탑은 **티어 N 지형에서 나는 광물**만 요구한다(각 지형을 돌아야 다음 티어가 열린다).
const ATTACK_MINERAL_AMOUNT = { 1: 0, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7 };

function scaleCost(gold, tier, familyIndex) {
  const mult = TOWER_TIER_SCALE[tier].costMult;
  const cost = { gold: Math.round(gold * mult), wood: Math.round(12 * Math.pow(tier, 1.35)) };
  const amount = ATTACK_MINERAL_AMOUNT[tier] ?? 0;
  if (amount > 0) cost.minerals = { [buildMineralFor(tier, familyIndex)]: amount };
  return cost;
}

const attackTurrets = [];
ATTACK_NAME_ROWS.forEach((names, rowIdx) => {
  const tier = rowIdx + 1;
  names.forEach((name, i) => {
    const fam = FAMILIES[ATTACK_FAMILY_ROW[i]];
    const sc = TOWER_TIER_SCALE[tier];
    attackTurrets.push({
      id: `atk_${fam.key}_t${tier}_${i}`,
      name,
      category: 'attack',
      tier,
      family: fam.key,
      effect: fam.effect,
      element: fam.element,
      color: fam.color,
      damage: Math.round(fam.damage * sc.damage * TURRET_DAMAGE_SCALE),
      range: Math.round(fam.range * sc.range * 10) / 10,
      fireRate: Math.round(fam.fireRate * (1 + (tier - 1) * 0.06) * 100) / 100,
      aoe: fam.aoe,
      hp: Math.round(fam.hp * sc.hp),
      cost: scaleCost(fam.gold, tier, i),
      desc: `${fam.key === 'arrow' ? '단일 관통' : fam.key === 'siege' ? '광역 충격' : fam.key === 'arcane' ? '지속 광선' : fam.key === 'venom' ? '독 구름' : fam.key === 'flame' ? '화염 폭발' : fam.key === 'frost' ? '냉기 감속' : '연쇄 번개'} 공격 (T${tier})`
    });
  });
});

const SUPPORT_TABLE = {
  heal: {
    names: ['치유초소', '회복탑', '성소', '빛의 샘', '생명의 탑', '축복탑', '여신의 제단'],
    colors: [0x8ff0a8, 0x6fe89a, 0x9ff5d0, 0xbfeee0, 0x9fe8c0, 0xffe9a3, 0xffffff],
    range: [16, 18, 20, 22, 25, 28, 32],
    healPerSec: [4, 9, 18, 36, 74, 150, 320],
    hp: [110, 170, 260, 400, 620, 980, 1600],
    gold: [70, 150, 320, 700, 1500, 3300, 7200],
    desc: '반경 내 아군 구조물과 기지를 회복시킨다.'
  },
  mining: {
    names: ['채굴초소', '곡괭이탑', '광산탑', '채굴기탑', '지맥탑', '심층채굴탑', '대지의 심장'],
    colors: [0xc7a06a, 0xd9b070, 0xe0c080, 0xffd24a, 0xffb45c, 0x8fd6ff, 0xfff0b0],
    range: [18, 20, 24, 28, 32, 38, 46],
    mineRate: [0.6, 1.2, 2.2, 3.8, 6.5, 11, 20],
    hp: [120, 180, 280, 430, 660, 1050, 1700],
    gold: [90, 190, 400, 850, 1800, 3900, 8400],
    desc: '반경 내 광물을 자동으로 채굴해 인벤토리에 넣는다.'
  },
  lumber: {
    names: ['벌목초소', '도끼탑', '제재소', '벌목기탑', '숲의 탑', '대벌목탑', '세계수의 낫'],
    colors: [0x9c8a5a, 0xb09a60, 0xc0a868, 0xd8c070, 0x8fd68a, 0x6bf0a8, 0xfff6c9],
    range: [18, 20, 24, 28, 32, 38, 46],
    chopRate: [0.8, 1.6, 3, 5.2, 9, 15, 27],
    hp: [120, 180, 280, 430, 660, 1050, 1700],
    gold: [85, 180, 380, 800, 1700, 3700, 8000],
    desc: '반경 내 나무를 자동으로 벌목해 목재를 모은다.'
  }
};

const supportTurrets = [];
for (const [category, T] of Object.entries(SUPPORT_TABLE)) {
  for (let i = 0; i < 7; i++) {
    const tier = i + 1;
    supportTurrets.push({
      id: `${category}_t${tier}`,
      name: T.names[i],
      category,
      tier,
      effect: category === 'heal' ? 'aura' : 'harvest',
      element: category === 'heal' ? 'light' : category === 'mining' ? 'earth' : 'nature',
      color: T.colors[i],
      damage: 0,
      range: T.range[i],
      fireRate: category === 'heal' ? 1 : T[category === 'mining' ? 'mineRate' : 'chopRate'][i],
      hp: T.hp[i],
      healPerSec: category === 'heal' ? T.healPerSec[i] : 0,
      rate: category === 'heal' ? 0 : T[category === 'mining' ? 'mineRate' : 'chopRate'][i],
      income: category === 'heal' ? null : { per: T[category === 'mining' ? 'mineRate' : 'chopRate'][i] },
      cost: {
        gold: T.gold[i],
        wood: Math.round(20 * Math.pow(tier, 1.4)),
        ...(tier > 1 ? { minerals: tierMinerals(tier, tier + 1, 0) } : {})
      },
      desc: T.desc
    });
  }
}

// ── 시설 — 기본 4종 + 저장고 7종(T1~T7) + 발전기 7종(T1~T7) + 전선 + 컨베이어벨트 7종 + 소환문 7종 ──
// 규칙: 티어 N 건물의 광물 재료는 **티어 N 지형에서 캘 수 있는 광물**뿐이다(티어 지형을 돌아야 다음 티어가 열린다).
const FACILITY_TABLE = [
  {
    key: 'arcana', id: 'facility_arcana', name: '마법연성대', icon: '🔮', color: 0xb98cff, hp: 900, range: 9,
    cost: { gold: 10, wood: 1, minerals: {} }, // 재료는 골드·목재만(계약 §4.72)
    desc: '여기서 마법연성(Y)을 연다 — 포탑·중앙코어·플레이어·채굴/벌목을 영구히 강화한다. 건설 재료: 골드 10 · 목재 1.'
  },
  {
    key: 'workbench', id: 'facility_workbench', name: '작업대', icon: '🔨', color: 0xc9a15a, hp: 420, range: 8,
    cost: { gold: 650, wood: 160, minerals: { iron: 6, copper: 4 } },
    desc: '배치하면 모든 무기를 제작할 수 있다(꿈의 끝은 희망 제외). 제작 패널(C)에 작업대 탭이 열린다. 수동 시설이라 전기는 필요 없다.'
  },
  {
    key: 'enchanter', id: 'facility_enchanter', name: '마법부여대', icon: '🔮', color: 0x9f7bff, hp: 460, range: 12,
    cost: { gold: 4800, wood: 1100, minerals: { quartz: 18, coal: 12, clay: 10 } },
    desc: '배치하면 보유한 모든 무기에 속성(화염·냉기·번개…)을 새길 수 있다. 제작 패널(C)에서 🔮 마법부여를 열 수 있고, 건물 가까이서 E 로도 연다. 수동 시설이라 전기는 필요 없다.'
  },
  {
    key: 'autominer', id: 'facility_autominer', name: '채굴기', icon: '⛏', color: 0xd9b070, hp: 320, range: 16,
    rate: 1, // 초당 1개 — 벨트 물류 보너스가 붙으면 더 빨라진다
    cost: { gold: 480, wood: 140, minerals: { iron: 5, copper: 3 } },
    desc: '맨땅에 설치하면 스스로 시추한다(초당 1개). 주변에 광물이 있으면 그 광물을, 없으면 **설치한 지형 티어의 광물**(T1 평원=철·구리·석탄 …, T5 설원=별의 파편 …)을 캔다. 전기 3kW 가 필요하다.'
  }
];

// 저장고 7종 — 티어가 오를수록 수급 속도·보관 용량·체력이 모두 오른다.
// 자동으로 모은 자원은 용량이 찰 때까지 쌓이고, 플레이어가 반경 안에 들어오면(또는 E) 인벤토리로 들어간다.
const STORAGE_TABLE = [
  { tier: 1, gold: 2, wood: 1, capacity: 60, hp: 640, color: 0x8fa6c8, cost: { gold: 520, wood: 220 } },
  { tier: 2, gold: 4, wood: 2, capacity: 170, hp: 900, color: 0x9db6d8, cost: { gold: 1300, wood: 380 } },
  { tier: 3, gold: 8, wood: 4, capacity: 420, hp: 1250, color: 0x8fd0c8, cost: { gold: 3200, wood: 700 } },
  { tier: 4, gold: 16, wood: 8, capacity: 1000, hp: 1750, color: 0xa88fe0, cost: { gold: 7800, wood: 1400 } },
  { tier: 5, gold: 32, wood: 16, capacity: 2400, hp: 2400, color: 0xffb066, cost: { gold: 18000, wood: 2600 } },
  { tier: 6, gold: 64, wood: 32, capacity: 5600, hp: 3300, color: 0x9fb4ff, cost: { gold: 41000, wood: 4800 } },
  { tier: 7, gold: 128, wood: 64, capacity: 13000, hp: 4500, color: 0xfff0a8, cost: { gold: 92000, wood: 8800 } }
].map((s) => ({
  ...s,
  id: s.tier === 1 ? 'facility_storage' : 'facility_storage_t' + s.tier,
  name: s.tier === 1 ? '저장고' : '저장고 T' + s.tier,
  cost: { ...s.cost, minerals: tierMinerals(s.tier, 3 + s.tier, 2 + Math.floor(s.tier / 2)) }
}));

// 발전기 7종 — 전선으로 이어야 전기가 간다. 티어가 오를수록 공급(kW)이 크게 오른다.
const GENERATOR_TABLE = [
  // 첫 발전기는 작업대(650골드)보다 싸게 — 전기 없이는 채굴기·저장고가 돌지 않으므로 초반에 손이 닿아야 한다.
  { tier: 1, output: 12, hp: 520, color: 0xffd24a, cost: { gold: 420, wood: 120, minerals: { iron: 3, copper: 2 } } },
  { tier: 2, output: 30, hp: 700, color: 0xffc24a, cost: { gold: 2400, wood: 520 } },
  { tier: 3, output: 70, hp: 940, color: 0xffb45c, cost: { gold: 5800, wood: 980 } },
  { tier: 4, output: 160, hp: 1250, color: 0xffa04a, cost: { gold: 13500, wood: 1800 } },
  { tier: 5, output: 380, hp: 1650, color: 0xff8a5a, cost: { gold: 31000, wood: 3200 } },
  { tier: 6, output: 900, hp: 2200, color: 0x8fd6ff, cost: { gold: 70000, wood: 5600 } },
  { tier: 7, output: 2100, hp: 3000, color: 0xfff0a8, cost: { gold: 155000, wood: 9800 } }
].map((g) => ({
  ...g,
  id: 'facility_generator_t' + g.tier,
  name: '발전기 T' + g.tier,
  // T1 은 위에서 직접 정한 재료를 그대로 쓴다(초반 가격 조정).
  cost: { ...g.cost, minerals: g.cost.minerals ?? tierMinerals(g.tier, 4 + g.tier, 2 + g.tier) }
}));

// 전선 — 발전기와 소비 건물을 잇는다(전선끼리 8m, 건물은 6m 안에서 붙는다).
const CABLE = {
  id: 'facility_cable',
  name: '전선',
  icon: '🔌',
  color: 0xffe15c,
  hp: 220,
  cost: { gold: 120, wood: 30, minerals: { iron: 2 } }
};

// 컨베이어벨트 7종 — 티어가 오를수록 빠르고(승강) 멀리(물류 반경) 실어 나른다.
// speed: 위에 선 플레이어를 미는 속도(m/s) · boost: 반경 내 채굴/벌목 산출량 증가율
const BELT_TABLE = [
  { tier: 1, speed: 2.5, boost: 0.12, range: 10, hp: 280, color: 0xb9a06a, cost: { gold: 300, wood: 90, minerals: tierMinerals(1, 3) } },
  { tier: 2, speed: 3.2, boost: 0.18, range: 12, hp: 340, color: 0xc9b073, cost: { gold: 750, wood: 200, minerals: tierMinerals(2, 4, 3) } },
  { tier: 3, speed: 4.0, boost: 0.25, range: 14, hp: 420, color: 0x8fd0c8, cost: { gold: 1900, wood: 420, minerals: tierMinerals(3, 5, 3) } },
  { tier: 4, speed: 5.0, boost: 0.33, range: 17, hp: 520, color: 0xa88fe0, cost: { gold: 4600, wood: 900, minerals: tierMinerals(4, 6, 4) } },
  { tier: 5, speed: 6.2, boost: 0.42, range: 20, hp: 640, color: 0xffb066, cost: { gold: 11000, wood: 1800, minerals: tierMinerals(5, 7, 4) } },
  { tier: 6, speed: 7.5, boost: 0.55, range: 24, hp: 800, color: 0x9fb4ff, cost: { gold: 26000, wood: 3400, minerals: tierMinerals(6, 8, 5) } },
  { tier: 7, speed: 9.0, boost: 0.80, range: 28, hp: 1000, color: 0xfff0a8, cost: { gold: 62000, wood: 6400, minerals: tierMinerals(7, 9, 6) } }
];

// 몬스터 소환문 7종 — 티어가 오를수록 자주·많이·강한 적이 나온다(파밍용). 전기 4kW 를 쓴다.
// spawnInterval: 소환 주기(초) · spawnCount: 한 번에 나오는 마릿수
const SPAWNER_TABLE = [
  { tier: 1, spawnInterval: 14, spawnCount: 1, hp: 380, color: 0x6f5aa8, cost: { gold: 700, wood: 180, minerals: tierMinerals(1, 6, 4) } },
  { tier: 2, spawnInterval: 12, spawnCount: 1, hp: 460, color: 0x7a5fb8, cost: { gold: 1600, wood: 380, minerals: tierMinerals(2, 8, 5) } },
  { tier: 3, spawnInterval: 10, spawnCount: 2, hp: 560, color: 0x8f6bff, cost: { gold: 3800, wood: 760, minerals: tierMinerals(3, 9, 6) } },
  { tier: 4, spawnInterval: 9, spawnCount: 2, hp: 680, color: 0xb06bff, cost: { gold: 8500, wood: 1500, minerals: tierMinerals(4, 10, 7) } },
  { tier: 5, spawnInterval: 8, spawnCount: 3, hp: 820, color: 0xff6ab0, cost: { gold: 19000, wood: 2900, minerals: tierMinerals(5, 11, 7) } },
  { tier: 6, spawnInterval: 7, spawnCount: 3, hp: 1000, color: 0xff8a5a, cost: { gold: 42000, wood: 5200, minerals: tierMinerals(6, 12, 8) } },
  { tier: 7, spawnInterval: 6, spawnCount: 4, hp: 1200, color: 0xff5252, cost: { gold: 96000, wood: 9600, minerals: tierMinerals(7, 13, 9) } }
];

const facilityTurrets = [
  ...FACILITY_TABLE.map((f) => ({
    id: f.id,
    name: f.name,
    category: 'facility',
    tier: 1,
    kind: f.key,
    icon: f.icon,
    effect: f.key === 'autominer' ? 'drill' : 'craft',
    element: f.key === 'workbench' || f.key === 'enchanter' ? 'arcane' : 'earth',
    color: f.color,
    damage: 0,
    range: f.range,
    fireRate: f.key === 'autominer' ? f.rate : 1,
    hp: f.hp,
    rate: f.rate ?? 0,
    storeRate: null,
    capacity: 0,
    draw: POWER.draw[f.key] ?? 0,
    drillPool: null,
    drillRegion: f.key === 'autominer',
    cost: { gold: f.cost.gold, wood: f.cost.wood, minerals: { ...f.cost.minerals } },
    desc: f.desc
  })),
  ...STORAGE_TABLE.map((s) => ({
    id: s.id,
    name: s.name,
    category: 'facility',
    tier: s.tier,
    kind: 'storage',
    icon: '📦',
    effect: 'store',
    element: 'metal',
    color: s.color,
    damage: 0,
    range: 10 + s.tier,
    fireRate: 1,
    hp: s.hp,
    rate: 0,
    storeRate: { gold: s.gold, wood: s.wood },
    capacity: s.capacity,
    draw: POWER.draw.storage,
    drillPool: null,
    drillRegion: false,
    cost: { gold: s.cost.gold, wood: s.cost.wood, minerals: { ...s.cost.minerals } },
    desc: '자원을 보관한다. 매 초 골드 ' + s.gold + ' · 목재 ' + s.wood + '를 모아 용량 ' + s.capacity + '까지 쌓고, 반경 ' + (10 + s.tier) + 'm 안에 들어오면(또는 E) 인벤토리로 들어간다. 전기 2kW 를 쓴다.'
  })),
  ...GENERATOR_TABLE.map((g) => ({
    id: g.id,
    name: g.name,
    category: 'facility',
    tier: g.tier,
    kind: 'generator',
    icon: '⚡',
    effect: 'generate',
    element: 'lightning',
    color: g.color,
    damage: 0,
    range: 0,
    fireRate: 1,
    hp: g.hp,
    rate: 0,
    output: g.output,
    draw: 0,
    storeRate: null,
    capacity: 0,
    drillPool: null,
    drillRegion: false,
    cost: { gold: g.cost.gold, wood: g.cost.wood, minerals: { ...g.cost.minerals } },
    desc: '전력 ' + g.output + 'kW 를 생산한다. 전선(🔌)으로 이어야 소비 건물(채굴기·저장고·소환문·작업대·마법부여대)이 돌아간다.'
  })),
  {
    id: CABLE.id,
    name: CABLE.name,
    category: 'facility',
    tier: 1,
    kind: 'cable',
    icon: CABLE.icon,
    effect: 'conduct',
    element: 'lightning',
    color: CABLE.color,
    damage: 0,
    range: POWER.cableRange,
    fireRate: 0,
    hp: CABLE.hp,
    rate: 0,
    linkRange: POWER.cableRange,
    output: 0,
    draw: 0,
    storeRate: null,
    capacity: 0,
    drillPool: null,
    drillRegion: false,
    cost: { gold: CABLE.cost.gold, wood: CABLE.cost.wood, minerals: { ...CABLE.cost.minerals } },
    desc: '전기를 나르는 전선. 전선끼리 ' + POWER.cableRange + 'm, 건물은 ' + POWER.deviceRange + 'm 안에서 연결된다. 발전기에서 소비 건물까지 이어야 전기가 통한다.'
  },
  ...BELT_TABLE.map((b) => ({
    id: 'facility_conveyor_t' + b.tier,
    name: '컨베이어벨트 T' + b.tier,
    category: 'facility',
    tier: b.tier,
    kind: 'conveyor',
    icon: '⛓',
    effect: 'convey',
    element: 'metal',
    color: b.color,
    damage: 0,
    range: b.range,
    fireRate: 0,
    hp: b.hp,
    rate: 0,
    speed: b.speed,
    boost: b.boost,
    beltLength: 3.4,
    beltWidth: 1.5,
    storeRate: null,
    capacity: 0,
    draw: 0,
    drillPool: null,
    drillRegion: false,
    cost: { gold: b.cost.gold, wood: b.cost.wood, minerals: { ...b.cost.minerals } },
    desc: '자원을 실어 나르는 벨트. 위에 서면 초당 ' + b.speed + 'm로 밀려 가고, 반경 ' + b.range + 'm 안 채굴기·채굴탑·벌목탑의 산출량을 +' + Math.round(b.boost * 100) + '% 늘린다(전기 불필요).'
  })),
  ...SPAWNER_TABLE.map((s) => ({
    id: 'facility_spawner_t' + s.tier,
    name: '몬스터 소환문 T' + s.tier,
    category: 'facility',
    tier: s.tier,
    kind: 'spawner',
    icon: '🌀',
    effect: 'summon',
    element: 'shadow',
    color: s.color,
    damage: 0,
    range: 12,
    fireRate: 0,
    hp: s.hp,
    rate: 0,
    spawnInterval: s.spawnInterval,
    spawnCount: s.spawnCount,
    storeRate: null,
    capacity: 0,
    draw: POWER.draw.spawner,
    drillPool: null,
    drillRegion: false,
    cost: { gold: s.cost.gold, wood: s.cost.wood, minerals: { ...s.cost.minerals } },
    desc: s.spawnInterval + '초마다 몬스터 ' + s.spawnCount + '마리가 나오는 소환문. 웨이브와 무관하게 계속 나오니 방어선을 세워 두고 파밍하자. 전기 4kW 를 쓴다.'
  }))
];


// ── 포탈 건물 (계약 §4.59 확장) ──────────────────────────────────────────
//  지형 이동을 '아이템'처럼 짓는 건물로 만든다 — 세워 둔 포탈로 언제든 그 지형에 간다.
const PORTAL_DESTS = [
  { id: 'base', name: '기지 광장', color: 0xe8d9a8, gold: 600 },
  { id: 'tier1', name: 'T1 초원', color: 0x7ee081, gold: 1200 },
  { id: 'tier2', name: 'T2 숲', color: 0x3fbf7f, gold: 2400 },
  { id: 'tier3', name: 'T3 호수', color: 0x59d6ff, gold: 4200 },
  { id: 'tier4', name: 'T4 설원', color: 0xb18cff, gold: 6800 },
  { id: 'tier5', name: 'T5 사막', color: 0xcfefff, gold: 10000 },
  { id: 'tier6', name: 'T6 화산', color: 0xff7a45, gold: 15000 },
  { id: 'tier7', name: 'T7 신전', color: 0xffe08a, gold: 22000 }
];

const portalTurrets = PORTAL_DESTS.map((d) => ({
  id: `portal_${d.id}`,
  name: `${d.name} 포탈`,
  category: 'portal',
  tier: 0,
  kind: 'portal',
  portalDest: d.id,
  portalName: d.name,
  icon: '🌀',
  effect: 'portal',
  element: 'arcane',
  color: d.color,
  damage: 0,
  range: 8,
  fireRate: 0,
  hp: 900,
  rate: 0,
  storeRate: null,
  capacity: 0,
  draw: 0,
  drillPool: null,
  drillRegion: false,
  cost: { gold: d.gold, wood: Math.round(d.gold / 20), minerals: {} },
  desc: `${d.name}(으)로 통하는 포탈을 세운다. 다 세운 뒤 가까이에서 N 키를 누르면 이동한다. (반경 8m)`
}));

export const TURRETS = [...attackTurrets, ...supportTurrets, ...facilityTurrets, ...portalTurrets];
export const TURRET_BY_ID = Object.fromEntries(TURRETS.map((t) => [t.id, t]));
export function turretsByCategory(category) {
  return TURRETS.filter((t) => t.category === category);
}
export function turretsByTier(tier) {
  return TURRETS.filter((t) => t.tier === tier);
}

// ──────────────────────────────────────────────── 마법
export const SPELL_ELEMENTS = [
  { id: 'fire', name: '화염', color: 0xff6a2a, status: 'burn', desc: '지속 화상 피해' },
  { id: 'ice', name: '냉기', color: 0x6ad4ff, status: 'slow', desc: '이동 속도 감소' },
  { id: 'lightning', name: '번개', color: 0xffe15c, status: 'stun', desc: '짧은 기절' },
  { id: 'earth', name: '대지', color: 0xa9793f, status: 'knockback', desc: '밀쳐내기' },
  { id: 'wind', name: '바람', color: 0xbff5d0, status: 'haste', desc: '연사 속도 증가' },
  { id: 'water', name: '물', color: 0x5fc4ff, status: 'cleanse', desc: '해로운 효과 정화' },
  { id: 'light', name: '빛', color: 0xfff0b0, status: 'heal', desc: '아군 회복' },
  { id: 'dark', name: '어둠', color: 0x6b2fbf, status: 'drain', desc: '피해 흡수' },
  { id: 'poison', name: '독', color: 0x7fd14a, status: 'poison', desc: '중첩 독 피해' },
  { id: 'arcane', name: '비전', color: 0x8f6bff, status: 'pierce', desc: '관통' },
  { id: 'nature', name: '자연', color: 0x4fd97a, status: 'regen', desc: '재생' },
  { id: 'metal', name: '금속', color: 0xd9c9a3, status: 'armor', desc: '방어력 증가' },
  { id: 'blood', name: '혈마', color: 0xd91f3f, status: 'lifesteal', desc: '생명력 흡수' },
  { id: 'void', name: '공허', color: 0x3a1a5c, status: 'erase', desc: '방어 무시' },
  { id: 'holy', name: '신성', color: 0xffffff, status: 'smite', desc: '언데드 추가 피해' },
  { id: 'chaos', name: '혼돈', color: 0xff3fa3, status: 'random', desc: '무작위 효과 2종' },
  { id: 'crystal', name: '수정', color: 0x6af0e0, status: 'reflect', desc: '피해 반사' },
  { id: 'storm', name: '폭풍', color: 0x8fb0ff, status: 'chain', desc: '연쇄 확산' },
  { id: 'spirit', name: '정령', color: 0xc9b8ff, status: 'summon', desc: '정령 소환' }
];

export const SPELL_GRADES = [
  { id: 'common', name: '일반', weight: 5500, mult: 1.0, color: 0xbfc7cc, glow: 0x333a40, cutscene: 'none', desc: '평범한 마법' },
  { id: 'uncommon', name: '고급', weight: 2500, mult: 1.3, color: 0x6fd97a, glow: 0x1d5c2a, cutscene: 'flash', desc: '조금 강한 마법' },
  { id: 'rare', name: '희귀', weight: 1200, mult: 1.7, color: 0x5fa8ff, glow: 0x123a7a, cutscene: 'flash', desc: '희귀한 마법' },
  { id: 'epic', name: '영웅', weight: 600, mult: 2.3, color: 0xb06bff, glow: 0x3a0070, cutscene: 'burst', desc: '영웅급 마법' },
  { id: 'legendary', name: '전설', weight: 180, mult: 3.2, color: 0xffb45c, glow: 0x6b3a00, cutscene: 'burst', desc: '전설의 마법' },
  { id: 'mythic', name: '신화', weight: 19, mult: 4.5, color: 0xff3f5c, glow: 0x6b0018, cutscene: 'cinematic', desc: '신화급 마법' },
  { id: 'relic', name: '유물', weight: 1, mult: 8.0, color: 0xffffff, glow: 0x88ccff, cutscene: 'relic', desc: '세계의 법칙을 건드리는 유물' }
];

export const RELIC_STAVES = [
  {
    id: 'time',
    name: '시간의 지팡이',
    element: 'arcane',
    grade: 'relic',
    color: 0xc9b8ff,
    desc: '시간을 멈춘다. 멈춘 세계에서 혼자 움직일 수 있다.',
    skill: { id: 'timeStop', name: '시간 정지', cooldown: 90, duration: 6, desc: '6초간 모든 적을 정지시킨다.' }
  },
  {
    id: 'genesis',
    name: '창세의 지팡이',
    element: 'holy',
    grade: 'relic',
    color: 0xfff0b0,
    desc: '세계를 다시 쓴다. 모든 적을 소멸시키고 기지를 완전 회복한다.',
    skill: { id: 'genesis', name: '창세', cooldown: 180, duration: 3, desc: '화면의 모든 적을 소멸시키고 기지를 완전 회복한다.' }
  }
];

export const STAFF_TIERS = [
  { tier: 1, name: '수습 지팡이', cost: 0, desc: '나무 막대기. 그래도 마법은 나간다.' },
  { tier: 2, name: '철제 지팡이', cost: 400, desc: '철심을 넣어 안정적이다.' },
  { tier: 3, name: '수정 지팡이', cost: 1200, desc: '마나 결정이 빛난다.' },
  { tier: 4, name: '비전 지팡이', cost: 3200, desc: '룬이 새겨져 위력이 오른다.' },
  { tier: 5, name: '고대 지팡이', cost: 8000, desc: '고대 세계수의 가지.' },
  { tier: 6, name: '신화 지팡이', cost: 20000, desc: '별의 파편이 박혀 있다.' }
];

export const GACHA_COST = { single: 100, ten: 900 };

// ── 마법부여 — 모든 무기에 속성을 새긴다(마법부여대 건설 필요) ──────────
// element: SPELL_ELEMENTS 의 색/상태이상과 연결된다. cost 는 1레벨 기준이며
//         레벨이 오를 때마다 배수로 비싸진다(systems/enchant.js).
export const ENCHANT_MAX_LEVEL = 5;
export const ENCHANT_DAMAGE_PER_LEVEL = 0.08; // 레벨 1당 피해 +8%
export const ENCHANT_ELEMENTS = [
  { id: 'fire', name: '화염 부여', icon: '🔥', grade: 'common', cost: { gold: 900, minerals: { coal: 4, iron: 2 } }, desc: '불씨를 새긴다 — 지속 화상 피해' },
  { id: 'ice', name: '냉기 부여', icon: '❄️', grade: 'common', cost: { gold: 900, minerals: { clay: 4, quartz: 2 } }, desc: '서릿결을 새긴다 — 이동 속도 감소' },
  { id: 'lightning', name: '번개 부여', icon: '⚡', grade: 'uncommon', cost: { gold: 1500, minerals: { copper: 5, quartz: 3 } }, desc: '전류를 새긴다 — 짧은 기절' },
  { id: 'earth', name: '대지 부여', icon: '🪨', grade: 'uncommon', cost: { gold: 1500, minerals: { clay: 6, iron: 3 } }, desc: '무게를 새긴다 — 밀쳐내기' },
  { id: 'poison', name: '독 부여', icon: '☠️', grade: 'uncommon', cost: { gold: 1800, minerals: { clay: 5, coal: 4 } }, desc: '독기를 새긴다 — 중첩 독 피해' },
  { id: 'wind', name: '바람 부여', icon: '🌪️', grade: 'rare', cost: { gold: 2600, minerals: { tin: 4, silver: 2 } }, desc: '바람길을 새긴다 — 연사 속도 증가' },
  { id: 'water', name: '물 부여', icon: '💧', grade: 'rare', cost: { gold: 2600, minerals: { sapphire: 2, quartz: 4 } }, desc: '물결을 새긴다 — 해로운 효과 정화' },
  { id: 'metal', name: '금속 부여', icon: '⚙️', grade: 'rare', cost: { gold: 3000, minerals: { iron: 8, silver: 3 } }, desc: '강철을 새긴다 — 방어력 증가' },
  { id: 'arcane', name: '비전 부여', icon: '🔯', grade: 'epic', cost: { gold: 4200, minerals: { mana: 4, quartz: 5, silver: 4 } }, desc: '룬 문자를 새긴다 — 관통' },
  { id: 'dark', name: '어둠 부여', icon: '🌑', grade: 'epic', cost: { gold: 4600, minerals: { obsidian: 4, ruby: 2 } }, desc: '그림자를 새긴다 — 피해 흡수' },
  { id: 'light', name: '빛 부여', icon: '🌟', grade: 'epic', cost: { gold: 4600, minerals: { gold: 3, emerald: 2 } }, desc: '성광을 새긴다 — 아군 회복' },
  { id: 'blood', name: '혈마 부여', icon: '🩸', grade: 'legendary', cost: { gold: 6000, minerals: { ruby: 4, obsidian: 5 } }, desc: '혈계약을 새긴다 — 생명력 흡수' },
  { id: 'holy', name: '신성 부여', icon: '✨', grade: 'legendary', cost: { gold: 7000, minerals: { emerald: 4, gold: 4 } }, desc: '성수를 새긴다 — 언데드 추가 피해' },
  { id: 'void', name: '공허 부여', icon: '🕳️', grade: 'legendary', cost: { gold: 8500, minerals: { mithril: 4, abyss: 2 } }, desc: '공허를 새긴다 — 방어 무시' }
];
export const ENCHANT_BY_ID = Object.fromEntries(ENCHANT_ELEMENTS.map((e) => [e.id, e]));
export const ENCHANT_ELEMENT_COUNT = ENCHANT_ELEMENTS.length;

export const MINERAL_COMBO_RECIPES = [
  { id: 'rune_fire', name: '화염의 룬', input: { iron: 3, coal: 2 }, grade: 'common', element: 'fire' },
  { id: 'rune_ice', name: '빙결의 룬', input: { quartz: 3, clay: 2 }, grade: 'common', element: 'ice' },
  { id: 'rune_bolt', name: '번개의 룬', input: { copper: 3, quartz: 2 }, grade: 'uncommon', element: 'lightning' },
  { id: 'rune_earth', name: '대지의 룬', input: { clay: 4, iron: 2 }, grade: 'uncommon', element: 'earth' },
  { id: 'rune_wind', name: '바람의 룬', input: { tin: 3, silver: 1 }, grade: 'rare', element: 'wind' },
  { id: 'rune_water', name: '물의 룬', input: { sapphire: 1, quartz: 2 }, grade: 'rare', element: 'water' },
  { id: 'rune_light', name: '빛의 룬', input: { gold: 2, emerald: 1 }, grade: 'epic', element: 'light' },
  { id: 'rune_dark', name: '어둠의 룬', input: { obsidian: 3, ruby: 1 }, grade: 'epic', element: 'dark' },
  { id: 'rune_void', name: '공허의 룬', input: { mithril: 2, abyss: 1 }, grade: 'legendary', element: 'void' },
  { id: 'rune_time', name: '시간의 지팡이', input: { starshard: 1, timesand: 2, genesis: 1 }, grade: 'relic', element: 'arcane', relic: 'time' },
  { id: 'rune_genesis', name: '창세의 지팡이', input: { genesis: 3, starshard: 2, dragonbone: 1 }, grade: 'relic', element: 'holy', relic: 'genesis' }
];

// ──────────────────────────────────────────────── 무기 시스템 (6계열 × 7등급 + 활 제작 전용 + 비밀 꿈나무)
// 계약: 무기 = 계열(family) × 등급(grade). 계열 기본값 × 등급 배율로 수치를 계산한다.
//       렌더·모션은 player/weaponRig.js 가, 타격·스킬 연출은 player/impacts.js 가
//       오직 이 데이터만 보고 재생한다(하드코딩 금지). 모든 무기는 스왑모션을 가진다.
export const WEAPON_FAMILIES = [
  {
    id: 'staff', name: '지팡이', icon: '🔮', hands: 1, kind: 'ranged', swing: 'cast',
    baseDamage: 22, cooldown: 0.75, range: 60, projectile: true,
    desc: '원거리 마법. 속성을 실어 적을 약화시킨다.'
  },
  {
    id: 'sword1h', name: '한손검', icon: '🗡️', hands: 1, kind: 'melee', swing: 'slash',
    baseDamage: 34, cooldown: 0.5, range: 3.2,
    desc: '빠르고 균형 잡힌 근접 무기.'
  },
  {
    id: 'sword2h', name: '양손검', icon: '⚔️', hands: 2, kind: 'melee', swing: 'cleave',
    baseDamage: 78, cooldown: 1.1, range: 3.8, aoe: 2.6,
    desc: '느리지만 한 번에 넓게 베어낸다.'
  },
  {
    id: 'scythe', name: '대낫', icon: '🌾', hands: 2, kind: 'melee', swing: 'spin',
    baseDamage: 52, cooldown: 0.9, range: 3.4, lifesteal: 0.15,
    desc: '회전하며 주변을 쓸고 생명력을 흡수한다.'
  },
  {
    id: 'dagger', name: '단검', icon: '🗡', hands: 1, kind: 'melee', swing: 'stab',
    baseDamage: 16, cooldown: 0.22, range: 2.4, combo: 3,
    desc: '매우 빠른 연타. 3연격마다 강타가 터진다.'
  },
  {
    id: 'katana', name: '카타나', icon: '🔪', hands: 1, kind: 'melee', swing: 'slash',
    baseDamage: 24, cooldown: 0.36, range: 3.6, combo: 3, lifesteal: 0.06,
    desc: '한 손으로 빠르게 베어내는 외날 검. 3연격마다 크게 벤다.',
    exclusive: true // 이 계열은 등급 자동 생성 대상이 아니다(전용 유물 1종)
  },
  {
    id: 'scissors', name: '가위', icon: '✂️', hands: 2, kind: 'melee', swing: 'snip',
    baseDamage: 46, cooldown: 0.78, range: 3.8, aoe: 3.2, lifesteal: 0.12,
    desc: '시간의 실을 자르는 의수 가위. 크게 벌려 수평으로 오므린다.',
    exclusive: true // 이 계열은 등급 자동 생성 대상이 아니다(전용 유물 1종)
  },
  {
    id: 'dream', name: '꿈나무', icon: '🌸', hands: 2, kind: 'save', swing: 'bloom',
    baseDamage: 0, cooldown: 0.8, range: 4.5, nonLethal: true,
    desc: '적을 죽이지 않는다. 저주를 풀어 자유롭게 한다.'
  },
  {
    id: 'bow', name: '활', icon: '🏹', hands: 2, kind: 'bow', swing: 'draw',
    baseDamage: 30, cooldown: 0.8, range: 54, projectile: true, pierce: 1,
    desc: '화살을 시위에 걸어 당겨 쏜다. 화살을 1발씩 소모하며, 화살 티어가 높을수록 위력이 오른다.'
  }
];

export const WEAPON_GRADES = [
  { id: 'common', name: '일반', mult: 1.0, tier: 1, color: 0xbfc7cc, glow: 0x333a40, desc: '흔한 무기' },
  { id: 'uncommon', name: '고급', mult: 1.05, tier: 2, color: 0x6fd97a, glow: 0x1d5c2a, desc: '조금 단단한 무기' },
  { id: 'rare', name: '희귀', mult: 1.1, tier: 3, color: 0x5fa8ff, glow: 0x123a7a, desc: '희귀한 무기' },
  { id: 'epic', name: '영웅', mult: 1.2, tier: 4, color: 0xb06bff, glow: 0x3a0070, desc: '영웅급 무기' },
  { id: 'legendary', name: '전설', mult: 1.35, tier: 5, color: 0xffb45c, glow: 0x6b3a00, desc: '전설의 무기' },
  { id: 'mythic', name: '신화', mult: 1.5, tier: 6, color: 0xffffff, glow: 0x8899bb, desc: '신화급 무기' },
  { id: 'relic', name: '유물', mult: 1.75, tier: 7, color: 0xffd75c, glow: 0xfff0b0, desc: '세계의 법칙을 건드리는 유물' },
  { id: 'secret', name: '비밀', mult: 2.0, tier: 8, color: 0xffb8d0, glow: 0xffd9e8, desc: '존재를 알 수 없었던 무기' }
];

// ── 모션 이징(weaponRig 가 해석) ───────────────────────────────
export const MOTION_EASINGS = ['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeOutBack', 'easeOutElastic'];

// ── 모든 무기의 스왑모션/공격모션/반동/궁극기 모션 ────────────────
// phases: t(0~1) · pos[x,y,z] · rot[x,y,z] · scale · ease(도착 구간에 적용)
// release: 공격 모션 중 실제 타격이 나가는 시점(0~1). recoil: 명중 반동.
export const WEAPON_MOTIONS = {
  staff: {
    rest: { pos: [0.34, -0.3, -0.62], rot: [-0.12, 0.18, -0.22], scale: 1 },
    swap: {
      duration: 0.58, style: 'twirl', desc: '한 바퀴 돌려 세운다.',
      phases: [
        { t: 0, pos: [0.34, -0.92, -0.3], rot: [-0.55, 2.6, -0.95], scale: 0.92, ease: 'easeInQuad' },
        { t: 0.45, pos: [0.26, 0.06, -0.7], rot: [0.18, 0.45, 0.22], scale: 1.04, ease: 'easeOutBack' },
        { t: 1, pos: [0.34, -0.3, -0.62], rot: [-0.12, 0.18, -0.22], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    attack: {
      duration: 0.45, style: 'cast', release: 0.35,
      phases: [
        { t: 0, pos: [0.34, -0.3, -0.62], rot: [-0.12, 0.18, -0.22], scale: 1, ease: 'easeOutQuad' },
        { t: 0.35, pos: [0.3, -0.22, -0.95], rot: [-0.3, 0.1, -0.1], scale: 1.02, ease: 'easeInQuad' },
        { t: 1, pos: [0.34, -0.3, -0.62], rot: [-0.12, 0.18, -0.22], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    skill: {
      duration: 1.15, style: 'windup',
      phases: [
        { t: 0, pos: [0.34, -0.3, -0.62], rot: [-0.12, 0.18, -0.22], scale: 1, ease: 'easeOutQuad' },
        { t: 0.4, pos: [0.34, 0.1, -0.5], rot: [0.35, 0.2, -0.1], scale: 1.1, ease: 'easeOutBack' },
        { t: 1, pos: [0.34, -0.3, -0.62], rot: [-0.12, 0.18, -0.22], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    recoil: { duration: 0.2, kick: [0, 0.03, 0.08], rot: [-0.14, 0, 0], shake: 0.3 }
  },
  sword1h: {
    rest: { pos: [0.36, -0.34, -0.58], rot: [-0.18, 0.25, -0.35], scale: 1 },
    swap: {
      duration: 0.42, style: 'draw', desc: '아래에서 칼을 뽑아 올린다.',
      phases: [
        { t: 0, pos: [0.44, -0.78, -0.42], rot: [-0.2, 0.5, -1.15], scale: 0.95, ease: 'easeInQuad' },
        { t: 0.55, pos: [0.3, -0.16, -0.66], rot: [-0.35, 0.1, 0.3], scale: 1.03, ease: 'easeOutBack' },
        { t: 1, pos: [0.36, -0.34, -0.58], rot: [-0.18, 0.25, -0.35], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    attack: {
      duration: 0.38, style: 'slash', release: 0.2,
      phases: [
        { t: 0, pos: [0.42, -0.28, -0.5], rot: [-0.15, 0.45, -0.95], scale: 1, ease: 'easeOutQuad' },
        { t: 0.2, pos: [0.1, -0.34, -0.86], rot: [-0.1, -0.35, 0.65], scale: 1.02, ease: 'easeInQuad' },
        { t: 1, pos: [0.36, -0.34, -0.58], rot: [-0.18, 0.25, -0.35], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    skill: {
      duration: 1.0, style: 'windup',
      phases: [
        { t: 0, pos: [0.36, -0.34, -0.58], rot: [-0.18, 0.25, -0.35], scale: 1, ease: 'easeOutQuad' },
        { t: 0.45, pos: [0.3, 0.16, -0.46], rot: [-1.25, 0.2, -0.2], scale: 1.08, ease: 'easeOutBack' },
        { t: 1, pos: [0.36, -0.34, -0.58], rot: [-0.18, 0.25, -0.35], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    recoil: { duration: 0.16, kick: [0, 0.02, 0.06], rot: [-0.1, 0, -0.04], shake: 0.22 }
  },
  sword2h: {
    rest: { pos: [0.42, -0.44, -0.66], rot: [-0.35, 0.3, -0.55], scale: 1 },
    swap: {
      duration: 0.72, style: 'shoulder', desc: '어깨 뒤에서 묵직하게 내려온다.',
      phases: [
        { t: 0, pos: [0.5, 0.32, 0.16], rot: [-1.0, 0.7, -0.9], scale: 0.96, ease: 'easeInQuad' },
        { t: 0.6, pos: [0.36, -0.58, -0.72], rot: [-0.5, 0.2, -0.42], scale: 1.05, ease: 'easeOutBack' },
        { t: 1, pos: [0.42, -0.44, -0.66], rot: [-0.35, 0.3, -0.55], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    attack: {
      duration: 0.62, style: 'cleave', release: 0.3,
      phases: [
        { t: 0, pos: [0.5, -0.1, -0.4], rot: [-0.9, 0.6, -0.7], scale: 1, ease: 'easeOutQuad' },
        { t: 0.3, pos: [0.12, -0.62, -0.9], rot: [0.45, -0.4, 0.55], scale: 1.03, ease: 'easeInQuad' },
        { t: 1, pos: [0.42, -0.44, -0.66], rot: [-0.35, 0.3, -0.55], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    skill: {
      duration: 1.35, style: 'windup',
      phases: [
        { t: 0, pos: [0.42, -0.44, -0.66], rot: [-0.35, 0.3, -0.55], scale: 1, ease: 'easeOutQuad' },
        { t: 0.5, pos: [0.46, 0.22, -0.3], rot: [-1.5, 0.35, -0.3], scale: 1.12, ease: 'easeOutBack' },
        { t: 1, pos: [0.42, -0.44, -0.66], rot: [-0.35, 0.3, -0.55], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    recoil: { duration: 0.28, kick: [0, 0.06, 0.12], rot: [-0.22, 0, 0.04], shake: 0.6 }
  },
  scythe: {
    rest: { pos: [0.44, -0.4, -0.7], rot: [-0.28, 0.34, -0.7], scale: 1 },
    swap: {
      duration: 0.66, style: 'spin', desc: '낫을 크게 휘둘러 어깨에 걸친다.',
      phases: [
        { t: 0, pos: [0.2, -0.86, -0.24], rot: [-0.8, -2.4, -1.2], scale: 0.94, ease: 'easeOutQuad' },
        { t: 0.5, pos: [0.6, -0.16, -0.8], rot: [0.3, 3.1, 0.4], scale: 1.06, ease: 'linear' },
        { t: 1, pos: [0.44, -0.4, -0.7], rot: [-0.28, 0.34, -0.7], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    attack: {
      duration: 0.55, style: 'spin', release: 0.15,
      phases: [
        { t: 0, pos: [0.6, -0.3, -0.6], rot: [-0.3, 0.9, -1.1], scale: 1, ease: 'easeOutQuad' },
        { t: 0.15, pos: [0.2, -0.5, -0.8], rot: [0.1, -1.2, 1.15], scale: 1.03, ease: 'linear' },
        { t: 1, pos: [0.44, -0.4, -0.7], rot: [-0.28, 0.34, -0.7], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    skill: {
      duration: 1.25, style: 'windup',
      phases: [
        { t: 0, pos: [0.44, -0.4, -0.7], rot: [-0.28, 0.34, -0.7], scale: 1, ease: 'easeOutQuad' },
        { t: 0.45, pos: [0.5, 0.14, -0.42], rot: [0.2, 4.2, 0.5], scale: 1.1, ease: 'linear' },
        { t: 1, pos: [0.44, -0.4, -0.7], rot: [-0.28, 0.34, -0.7], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    recoil: { duration: 0.22, kick: [0.03, 0.04, 0.09], rot: [-0.16, 0, -0.08], shake: 0.42 }
  },
  katana: {
    rest: { pos: [0.34, -0.34, -0.56], rot: [-0.16, 0.22, -0.38], scale: 1 },
    swap: {
      duration: 0.34, style: 'iai', desc: '칼집에서 뽑아 듯 한 번에 빼 든다.',
      phases: [
        { t: 0, pos: [0.5, -0.7, -0.3], rot: [-1.1, 0.9, -0.15], scale: 0.94, ease: 'easeInQuad' },
        { t: 0.55, pos: [0.24, -0.2, -0.62], rot: [0.28, -0.5, -0.5], scale: 1.05, ease: 'easeOutBack' },
        { t: 1, pos: [0.34, -0.34, -0.56], rot: [-0.16, 0.22, -0.38], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    attack: {
      duration: 0.3, style: 'slash', release: 0.12,
      phases: [
        { t: 0, pos: [0.44, -0.12, -0.5], rot: [-0.5, 0.8, -0.9], scale: 1, ease: 'easeOutQuad' },
        { t: 0.12, pos: [0.12, -0.44, -0.86], rot: [0.2, -0.7, 0.55], scale: 1.02, ease: 'linear' },
        { t: 1, pos: [0.34, -0.34, -0.56], rot: [-0.16, 0.22, -0.38], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    skill: {
      duration: 1.15, style: 'windup',
      phases: [
        { t: 0, pos: [0.34, -0.34, -0.56], rot: [-0.16, 0.22, -0.38], scale: 1, ease: 'easeOutQuad' },
        { t: 0.42, pos: [0.52, -0.62, -0.34], rot: [-1.35, 0.5, -0.2], scale: 1.08, ease: 'easeOutBack' },
        { t: 1, pos: [0.34, -0.34, -0.56], rot: [-0.16, 0.22, -0.38], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    recoil: { duration: 0.16, kick: [0.02, 0.03, 0.06], rot: [-0.1, 0, -0.05], shake: 0.2 }
  },
  dagger: {
    rest: { pos: [0.3, -0.28, -0.5], rot: [-0.1, 0.14, -0.15], scale: 1 },
    swap: {
      duration: 0.3, style: 'flick', desc: '손목 스냅으로 단검을 뒤집어 쥔다.',
      phases: [
        { t: 0, pos: [0.3, -0.66, -0.34], rot: [-1.6, 0.2, -0.3], scale: 0.92, ease: 'easeInQuad' },
        { t: 0.6, pos: [0.28, -0.18, -0.54], rot: [0.35, 0.1, 0.12], scale: 1.04, ease: 'easeOutBack' },
        { t: 1, pos: [0.3, -0.28, -0.5], rot: [-0.1, 0.14, -0.15], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    attack: {
      duration: 0.22, style: 'stab', release: 0.1,
      phases: [
        { t: 0, pos: [0.3, -0.28, -0.5], rot: [-0.1, 0.14, -0.15], scale: 1, ease: 'easeOutQuad' },
        { t: 0.3, pos: [0.26, -0.24, -0.78], rot: [-0.05, 0.05, 0.05], scale: 1.02, ease: 'easeInQuad' },
        { t: 1, pos: [0.3, -0.28, -0.5], rot: [-0.1, 0.14, -0.15], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    skill: {
      duration: 0.9, style: 'windup',
      phases: [
        { t: 0, pos: [0.3, -0.28, -0.5], rot: [-0.1, 0.14, -0.15], scale: 1, ease: 'easeOutQuad' },
        { t: 0.35, pos: [0.22, -0.42, -0.36], rot: [0.5, 0.9, 0.3], scale: 1.06, ease: 'easeOutBack' },
        { t: 1, pos: [0.3, -0.28, -0.5], rot: [-0.1, 0.14, -0.15], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    recoil: { duration: 0.12, kick: [0, 0.015, 0.04], rot: [-0.07, 0, 0], shake: 0.14 }
  },
  scissors: {
    // 리그 오브 레전드 그웬의 손맛 — 가위를 크게 벌려 수평으로 오므리는 스닙.
    // snip 트랙: 날개 벌림(0=완전히 닫힘, 1=활짝). release 시점에 0 으로 떨어지며 '사각' 하고 물린다.
    rest: { pos: [0.46, -0.36, -0.6], rot: [0.02, 0.45, -0.32], scale: 1, snip: 0.35 },
    swap: {
      duration: 0.66, style: 'unfold', desc: '가위를 손목으로 돌려 펼치고 한 번 딱 물린다.',
      special: { kind: 'snip', snap: true, big: false, color: 0xbfe6ff },
      snip: [
        { t: 0, open: 0, ease: 'easeOutQuad' },
        { t: 0.42, open: 1.15, ease: 'easeOutQuad' },
        { t: 0.55, open: 0, ease: 'easeInCubic' },
        { t: 0.72, open: 0.55, ease: 'easeOutBack' },
        { t: 1, open: 0.35, ease: 'easeOutCubic' }
      ],
      phases: [
        { t: 0, pos: [0.5, -0.86, -0.3], rot: [-0.3, 1.9, -1.2], scale: 0.9, ease: 'easeOutQuad' },
        { t: 0.34, pos: [0.3, 0.16, -0.62], rot: [0.5, -1.4, 1.1], scale: 1.06, ease: 'linear' },
        { t: 0.55, pos: [0.5, -0.2, -0.55], rot: [0.1, 0.75, -0.5], scale: 1.03, ease: 'easeOutBack' },
        { t: 1, pos: [0.46, -0.36, -0.6], rot: [0.02, 0.45, -0.32], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    attack: {
      duration: 0.52, style: 'snip', release: 0.32,
      snip: [
        { t: 0, open: 0.55, ease: 'easeOutQuad' },
        { t: 0.18, open: 1, ease: 'easeInQuad' },
        { t: 0.26, open: 1, ease: 'easeInCubic' },
        { t: 0.32, open: 0, ease: 'easeOutQuad' },   // ← 여기서 물린다(release)
        { t: 0.5, open: 0.12, ease: 'easeOutBack' },
        { t: 1, open: 0.4, ease: 'easeOutCubic' }
      ],
      phases: [
        { t: 0, pos: [0.5, -0.34, -0.5], rot: [0.06, 0.85, -0.5], scale: 1, ease: 'easeOutQuad' },
        { t: 0.18, pos: [0.58, -0.3, -0.34], rot: [0.12, 1.15, -0.66], scale: 1.02, ease: 'easeOutQuad' },
        { t: 0.32, pos: [0.22, -0.3, -0.86], rot: [-0.04, 0.12, -0.2], scale: 1, ease: 'easeInQuad' },
        { t: 0.6, pos: [-0.08, -0.28, -0.72], rot: [-0.1, -0.62, 0.24], scale: 0.98, ease: 'easeOutQuad' },
        { t: 1, pos: [0.46, -0.36, -0.6], rot: [0.02, 0.45, -0.32], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    skill: {
      duration: 1.32, style: 'shear', release: 0.62,
      special: { kind: 'snip', snap: true, big: true, color: 0xbfe6ff, quote: '시간을 잘라 붙인다.' },
      snip: [
        { t: 0, open: 0.35, ease: 'easeOutQuad' },
        { t: 0.4, open: 1.35, ease: 'easeOutBack' },
        { t: 0.56, open: 1.3, ease: 'easeInCubic' },
        { t: 0.62, open: 0, ease: 'easeOutQuad' },
        { t: 1, open: 0.35, ease: 'easeOutCubic' }
      ],
      phases: [
        { t: 0, pos: [0.46, -0.36, -0.6], rot: [0.02, 0.45, -0.32], scale: 1, ease: 'easeOutQuad' },
        { t: 0.4, pos: [0.3, 0.3, -0.5], rot: [-1.1, -1.6, 0.9], scale: 1.12, ease: 'easeOutBack' },
        { t: 0.62, pos: [0.16, -0.5, -0.82], rot: [0.42, 0.2, 0.4], scale: 1.06, ease: 'easeInCubic' },
        { t: 1, pos: [0.46, -0.36, -0.6], rot: [0.02, 0.45, -0.32], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    recoil: { duration: 0.18, kick: [0.012, 0.026, 0.07], rot: [-0.09, 0, 0.05], shake: 0.3 }
  },
  dream: {
    rest: { pos: [0.4, -0.32, -0.68], rot: [-0.18, 0.22, -0.3], scale: 1 },
    swap: {
      duration: 1.05, style: 'bloom', desc: '꿈나무가 천천히 피어오르고 꽃잎과 나비가 흩날린다.',
      special: {
        kind: 'bloom', petals: 22, butterflies: 5, chime: true, halo: true,
        quote: '안녕, 꿈나무야.', color: 0xffb8d0
      },
      phases: [
        { t: 0, pos: [0.4, -1.0, -0.4], rot: [-0.6, 1.2, -1.05], scale: 0.62, ease: 'easeOutQuad' },
        { t: 0.55, pos: [0.34, 0.1, -0.78], rot: [0.22, 0.3, 0.18], scale: 1.12, ease: 'easeOutBack' },
        { t: 0.78, pos: [0.36, -0.08, -0.74], rot: [0.02, 0.24, -0.02], scale: 1.04, ease: 'easeInOutQuad' },
        { t: 1, pos: [0.4, -0.32, -0.68], rot: [-0.18, 0.22, -0.3], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    attack: {
      duration: 0.5, style: 'bloom', release: 0.25, nonLethal: true,
      phases: [
        { t: 0, pos: [0.4, -0.32, -0.68], rot: [-0.18, 0.22, -0.3], scale: 1, ease: 'easeOutQuad' },
        { t: 0.25, pos: [0.34, -0.2, -0.86], rot: [-0.32, 0.08, -0.12], scale: 1.06, ease: 'easeInQuad' },
        { t: 1, pos: [0.4, -0.32, -0.68], rot: [-0.18, 0.22, -0.3], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    skill: {
      duration: 1.6, style: 'salvation', release: 0.45, nonLethal: true,
      special: { kind: 'salvation', petals: 60, butterflies: 12, halo: true, chime: true, quote: '꿈의 끝에서, 행복이 시작된다.' },
      phases: [
        { t: 0, pos: [0.4, -0.32, -0.68], rot: [-0.18, 0.22, -0.3], scale: 1, ease: 'easeOutQuad' },
        { t: 0.45, pos: [0.3, 0.26, -0.56], rot: [0.4, 0.1, 0.1], scale: 1.18, ease: 'easeOutBack' },
        { t: 0.8, pos: [0.34, 0.04, -0.72], rot: [0.1, 0.2, -0.06], scale: 1.08, ease: 'easeInOutQuad' },
        { t: 1, pos: [0.4, -0.32, -0.68], rot: [-0.18, 0.22, -0.3], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    recoil: { duration: 0.24, kick: [0, 0.02, 0.03], rot: [-0.06, 0, 0], shake: 0 }
  },
  bow: {
    rest: { pos: [0.3, -0.26, -0.6], rot: [-0.08, 0.14, -0.16], scale: 1 },
    swap: {
      duration: 0.5, style: 'nock', desc: '활을 세우고 시위에 화살을 건다.',
      phases: [
        { t: 0, pos: [0.44, -0.78, -0.3], rot: [-0.5, 1.0, -0.85], scale: 0.94, ease: 'easeInQuad' },
        { t: 0.5, pos: [0.28, 0.06, -0.66], rot: [0.12, 0.02, 0.2], scale: 1.04, ease: 'easeOutBack' },
        { t: 1, pos: [0.3, -0.26, -0.6], rot: [-0.08, 0.14, -0.16], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    attack: {
      duration: 0.52, style: 'loose', release: 0.62,
      phases: [
        { t: 0, pos: [0.3, -0.26, -0.6], rot: [-0.08, 0.14, -0.16], scale: 1, ease: 'easeOutQuad' },
        { t: 0.62, pos: [0.24, -0.18, -0.74], rot: [-0.04, 0.0, -0.02], scale: 1.03, ease: 'easeInQuad' },
        { t: 1, pos: [0.3, -0.26, -0.6], rot: [-0.08, 0.14, -0.16], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    skill: {
      duration: 1.25, style: 'drawFull',
      phases: [
        { t: 0, pos: [0.3, -0.26, -0.6], rot: [-0.08, 0.14, -0.16], scale: 1, ease: 'easeOutQuad' },
        { t: 0.4, pos: [0.26, 0.06, -0.72], rot: [-0.2, 0.05, 0.06], scale: 1.1, ease: 'easeOutBack' },
        { t: 0.72, pos: [0.22, -0.14, -0.8], rot: [0.08, -0.02, -0.04], scale: 1.06, ease: 'easeInOutQuad' },
        { t: 1, pos: [0.3, -0.26, -0.6], rot: [-0.08, 0.14, -0.16], scale: 1, ease: 'easeOutCubic' }
      ]
    },
    recoil: { duration: 0.18, kick: [0, 0.025, 0.07], rot: [-0.13, 0, 0], shake: 0.26 },
    // 시위 당김 트랙 — weaponRig 가 attack/skill 모션 진행도로 시위·화살을 뒤로 당긴다.
    string: { max: 0.3, flex: 0.07 }
  }
};

// ── 무기 임팩트(타격 연출) 프리셋 ───────────────────────────────
export const WEAPON_IMPACTS = {
  staff: { kind: 'burst', color: 0x8f6bff, particles: 14, scale: 0.8, shake: 0.3, sound: 'impactMagic', desc: '마력이 터진다.' },
  sword1h: { kind: 'spark', color: 0xdfe8ff, particles: 10, scale: 0.7, shake: 0.24, sound: 'impactBlade', desc: '불꽃이 튄다.' },
  sword2h: { kind: 'shock', color: 0xffd9a0, particles: 18, scale: 1.3, shake: 0.6, sound: 'impactHeavy', desc: '충격파가 퍼진다.' },
  scythe: { kind: 'arc', color: 0x9fe8b0, particles: 16, scale: 1.1, shake: 0.42, sound: 'impactSweep', desc: '초승달 궤적이 남는다.' },
  dagger: { kind: 'spark', color: 0xffe9f2, particles: 8, scale: 0.5, shake: 0.14, sound: 'impactQuick', desc: '짧고 날카롭다.' },
  katana: {
    kind: 'spark', color: 0xeaf4ff, particles: 12, scale: 0.68, shake: 0.2, sound: 'impactBlade',
    trail: 0xcfe8ff, desc: '얇은 칼날이 스쳐 지나간 자리에 선이 남는다.'
  },
  scissors: {
    kind: 'crossSlash', color: 0xbfe6ff, particles: 18, scale: 1.05, shake: 0.34, sound: 'impactSnip',
    stitch: true, mist: 0x7fd9ff, desc: '두 날이 교차하며 시간의 실이 봉합된다.'
  },
  dream: {
    kind: 'petals', color: 0xffb8d0, particles: 26, petals: true, butterflies: 3, halo: true, scale: 1,
    shake: 0, sound: 'salvation', nonLethal: true,
    gratitude: ['고마워요...', '이제 자유예요', '꿈에서 깨어났어요', '행복을 찾았어요'],
    desc: '벚꽃잎과 나비가 흩날리고, 저주가 풀린 적이 감사 인사를 남긴다.'
  },
  bow: {
    kind: 'spark', color: 0xd8f0ff, particles: 12, scale: 0.72, shake: 0.22, sound: 'impactQuick',
    pierce: true, trail: 0xa8e8ff, desc: '화살이 꿰뚫고 지나간다.'
  }
};

// ── 유물 무기 궁극기 8종(문서의 5종 + 유물 지팡이 2종 + 시간의 가위 1종) ──
export const WEAPON_ULTIMATES = [
  {
    id: 'kingsJudgment', weapon: 'sword1h_relic', name: '왕의 심판', kind: 'slashArc',
    cooldown: 150, duration: 4, radius: 30, color: 0xffd75c, desc: '30m 황금 참격이 전장을 가른다.'
  },
  {
    id: 'worldSlash', weapon: 'sword2h_relic', name: '세계 참격', kind: 'ringWave',
    cooldown: 180, duration: 5, radius: 60, color: 0x9fe8b0, desc: '60m 원형 파동이 모든 것을 벤다.'
  },
  {
    id: 'apocalypse', weapon: 'scythe_relic', name: '종말', kind: 'blackhole',
    cooldown: 210, duration: 6, radius: 46, color: 0x8f6bff, desc: '블랙홀이 적을 빨아들이고 찢는다.'
  },
  {
    id: 'assassination', weapon: 'dagger_relic', name: '암살', kind: 'multiStrike',
    cooldown: 120, duration: 3, radius: 24, hits: 10, color: 0x2a1a4a, desc: '10연타로 대상을 처형한다.'
  },
  {
    id: 'dreamsEnd', weapon: 'dream_tree', name: '꿈의 끝, 행복의 시작', kind: 'salvation',
    cooldown: 240, duration: 8, radius: 40, color: 0xffb8d0, petals: 140, butterflies: 28, halo: true,
    desc: '전장의 모든 적을 구원한다. 죽이지 않고 저주를 풀어준다.'
  },
  {
    id: 'timeStop', weapon: 'staff_relic', name: '시간 정지', kind: 'timeStop',
    cooldown: 90, duration: 6, radius: 0, color: 0xc9b8ff, desc: '6초간 모든 적을 정지시킨다.'
  },
  {
    id: 'genesis', weapon: 'staff_genesis', name: '창세', kind: 'purge',
    cooldown: 180, duration: 3, radius: 0, color: 0xfff0b0, desc: '화면의 모든 적을 소멸시키고 기지를 회복한다.'
  },
  {
    id: 'timeShear', weapon: 'time_scissors', name: '시간의 봉합', kind: 'slashArc',
    cooldown: 150, duration: 4, radius: 34, color: 0xbfe6ff, rays: 2,
    desc: '34m 시간의 실을 한 번에 잘라낸다. 잘린 자리는 다시 봉합된다.'
  },
  {
    id: 'eternalLove', weapon: 'bow_forever', name: '영원한 사랑', kind: 'multiStrike',
    cooldown: 165, duration: 5, radius: 44, hits: 12, color: 0xffd9e8, arrows: 60,
    desc: '44m 안의 모든 적에게 사랑의 화살 12발이 꽂힌다. 이 사랑은 영원히 멈추지 않는다.'
  }
];

export const WEAPON_ULTIMATE_BY_ID = Object.fromEntries(WEAPON_ULTIMATES.map((u) => [u.id, u]));

// ── 궁극기 임팩트(스킬 임팩트) 연출 프리셋 ───────────────────────
export const ULTIMATE_IMPACTS = {
  kingsJudgment: { kind: 'slashArc', color: 0xffd75c, rays: 1, length: 30, width: 4.5, particles: 40, shake: 1.1, sound: 'ultimateBlade', halo: true },
  worldSlash: { kind: 'ringWave', color: 0x9fe8b0, rings: 3, radius: 60, height: 6, particles: 70, shake: 1.3, sound: 'ultimateBlade' },
  apocalypse: { kind: 'blackhole', color: 0x8f6bff, radius: 46, pull: 9, spiral: true, particles: 90, shake: 1.5, sound: 'ultimateVoid' },
  assassination: { kind: 'multiStrike', color: 0x2a1a4a, hits: 10, radius: 24, particles: 26, shake: 0.8, sound: 'ultimateQuick' },
  dreamsEnd: {
    kind: 'salvation', color: 0xffb8d0, radius: 40, petals: 140, butterflies: 28, halo: true,
    chime: true, shake: 0, sound: 'ultimateSalvation', gratitude: ['꿈의 끝, 행복의 시작'],
    desc: '거대한 꽃잎 파동이 전장을 덮고, 구원된 적들이 나비가 되어 흩어진다.'
  },
  timeStop: { kind: 'timeStop', color: 0xc9b8ff, radius: 0, clock: true, particles: 50, shake: 0.6, sound: 'ultimateTime' },
  genesis: { kind: 'purge', color: 0xfff0b0, radius: 0, pillars: 12, particles: 120, shake: 1.2, sound: 'ultimateHoly' },
  timeShear: {
    kind: 'slashArc', color: 0xbfe6ff, rays: 2, length: 34, width: 4, particles: 46, shake: 1.05,
    sound: 'ultimateTime', halo: true, mist: 0x7fd9ff,
    desc: '거대한 가위가 34m 를 가로로 물고, 잘린 자리에 시간의 실이 남는다.'
  },
  eternalLove: {
    kind: 'multiStrike', color: 0xffd9e8, hits: 12, radius: 44, particles: 64, shake: 1.0,
    sound: 'ultimateQuick', halo: true, mist: 0xffb8d0,
    desc: '분홍빛 화살비가 44m 를 덮고, 꽂힌 자리마다 사랑의 빛이 번진다.'
  }
};

// ── 비밀 무기: 행복의 끝은 꿈나무 ────────────────────────────────
export const DREAM_TREE = {
  id: 'dream_tree',
  name: '행복의 끝은 꿈나무',
  subtitle: '비살상 구원 무기',
  grade: 'secret',
  family: 'dream',
  quote: '적을 죽이지 않는다. 저주를 풀어 자유롭게 한다.',
  desc: '저주에 묶인 적을 베지 않고 구원한다. 구원할수록 나무가 자라 강해진다.',
  acquire: {
    fairies: 7, achievements: 50, weapon: 'scythe_relic', table: 'garden_of_dreams',
    desc: '요정 7명을 모두 만나고 업적 50개를 달성한 뒤, 종말의 낫을 들고 꿈의 정원에 서면 꿈나무가 피어난다.'
  },
  save: {
    radius: 3.4, manaCost: 14, cooldown: 0.8, convert: true, nonLethal: true, healOnSave: 2,
    gratitude: ['고마워요...', '이제 자유예요', '꿈에서 깨어났어요', '행복을 찾았어요']
  },
  passive: {
    id: 'soulBlessing', name: '영혼의 축복', perSave: 0.005, max: 1.0,
    desc: '구원한 적 1명당 피해 +0.5% (최대 +100%). 꿈나무가 조금씩 자란다.'
  },
  ultimate: 'dreamsEnd',
  swap: { style: 'bloom', duration: 1.05, petals: 22, butterflies: 5, chime: true },
  impact: { kind: 'petals', petals: 26, butterflies: 3, halo: true, gratitude: true },
  skillImpact: { kind: 'salvation', radius: 40, petals: 140, butterflies: 28, halo: true, chime: true },
  lore: [
    '꿈나무는 적을 죽이지 않는다.',
    '저주를 풀어 자유롭게 할 뿐이다.',
    '베인 자리에는 벚꽃잎이, 떠나는 자리에는 나비가 남는다.'
  ]
};

// ── 제작 전용 무기 20종 — 제작대에서만 얻는다(기본 지급되지 않는다) ──
// family × grade 로 기본 수치를 파생하고 배율/보정만 덮어쓴다. 계열을 통해 스왑모션·임팩트를 물려받는다.
const CRAFT_ONLY_SPECS = [
  { id: 'sword1h_guard', name: '수문장의 검', family: 'sword1h', grade: 'common', element: null, table: 'forge_t1', dmgMult: 1.15, aoe: 1.8, desc: '넓게 베어 적의 접근을 막는다.' },
  { id: 'dagger_swift', name: '신속의 단검', family: 'dagger', grade: 'common', element: null, table: 'forge_t1', dmgMult: 1.12, cdMult: 0.9, combo: 4, desc: '4연격. 손이 먼저 나간다.' },
  { id: 'sword2h_cleaver', name: '도살자의 대검', family: 'sword2h', grade: 'uncommon', element: null, table: 'forge_t2', dmgMult: 1.18, aoe: 3.2, desc: '한 번에 여러 적을 갈라낸다.' },
  { id: 'staff_ember', name: '불씨 지팡이', family: 'staff', grade: 'uncommon', element: 'fire', table: 'forge_t2', dmgMult: 1.12, cdMult: 0.88, desc: '불씨를 연달아 던진다.' },
  { id: 'staff_frost', name: '서릿결 지팡이', family: 'staff', grade: 'rare', element: 'ice', table: 'forge_t3', dmgMult: 1.16, range: 70, desc: '얼려 붙잡는 냉기 마법.' },
  { id: 'scythe_reaper', name: '수확자의 낫', family: 'scythe', grade: 'rare', element: null, table: 'forge_t3', dmgMult: 1.12, lifesteal: 0.24, desc: '베면 벨수록 되돌아온다.' },
  { id: 'sword1h_duelist', name: '결투가의 검', family: 'sword1h', grade: 'rare', element: 'metal', table: 'forge_t3', dmgMult: 1.2, cdMult: 0.9, desc: '결투만을 위해 벼려졌다.' },
  { id: 'sword2h_runic', name: '룬문장 대검', family: 'sword2h', grade: 'epic', element: 'earth', table: 'forge_t4', dmgMult: 1.18, aoe: 3.4, desc: '대지를 갈라 적을 밀어낸다.' },
  { id: 'dagger_venom', name: '맹독 단검', family: 'dagger', grade: 'epic', element: 'poison', table: 'forge_t4', dmgMult: 1.15, combo: 3, desc: '독이 스며든다.' },
  { id: 'staff_arcane', name: '비전서 지팡이', family: 'staff', grade: 'epic', element: 'arcane', table: 'forge_t4', dmgMult: 1.2, range: 66, desc: '관통하는 비전 화살.' },
  { id: 'sword1h_dawn', name: '새벽의 검', family: 'sword1h', grade: 'legendary', element: 'holy', table: 'forge_t5', dmgMult: 1.24, aoe: 2.0, desc: '언데드를 태우는 빛.' },
  { id: 'scythe_bloodmoon', name: '혈월의 낫', family: 'scythe', grade: 'legendary', element: 'blood', table: 'forge_t5', dmgMult: 1.2, lifesteal: 0.3, desc: '붉은 달이 뜨면 피가 돈다.' },
  { id: 'sword2h_titan', name: '거인의 대검', family: 'sword2h', grade: 'legendary', element: 'earth', table: 'forge_t5', dmgMult: 1.28, cdMult: 1.06, aoe: 3.8, desc: '거인만이 들 수 있다.' },
  { id: 'dagger_voidfang', name: '공허의 송곳니', family: 'dagger', grade: 'mythic', element: 'void', table: 'forge_t6', dmgMult: 1.28, combo: 4, desc: '방어를 지운다.' },
  { id: 'staff_starlight', name: '별빛 지팡이', family: 'staff', grade: 'mythic', element: 'holy', table: 'forge_t6', dmgMult: 1.3, range: 72, desc: '별을 끌어내려 쏜다.' },
  { id: 'scythe_soulharvest', name: '영혼 수확의 낫', family: 'scythe', grade: 'mythic', element: 'void', table: 'forge_t6', dmgMult: 1.24, lifesteal: 0.36, desc: '영혼을 거둬들인다.' },
  { id: 'sword2h_genesis', name: '창세의 대검', family: 'sword2h', grade: 'relic', element: 'nature', table: 'forge_t7', dmgMult: 1.32, aoe: 4.2, ultimate: 'worldSlash', desc: '세계를 가르는 일격. 궁극기 [세계 참격]을 쓸 수 있다.' },
  { id: 'scythe_genesis', name: '창세의 낫', family: 'scythe', grade: 'relic', element: 'void', table: 'forge_t7', dmgMult: 1.3, lifesteal: 0.4, ultimate: 'apocalypse', desc: '종말을 거두는 낫의 완성형. 궁극기 [종말]을 쓸 수 있다.' },
  {
    id: 'time_scissors', name: '시간의 가위', family: 'scissors', grade: 'relic', element: 'crystal',
    table: 'forge_t7', dmgMult: 1.05, aoe: 3.2, lifesteal: 0.12, ultimate: 'timeShear',
    cost: { gold: 36000, wood: 4200, minerals: { timesand: 3, starshard: 3, genesis: 1, time_shard: 3, frozen_hour: 2 } },
    desc: '시간의 실을 자르는 유물 가위. 크게 벌려 오므리면 궤적이 남는다. 궁극기 [시간의 봉합]을 쓸 수 있다.'
  },
  // 꿈의 끝은 희망 — 색(비밀 등급)·비살상 성질·수치는 그대로 두고 '낫' 형태와 낫 모션만 입힌다(계약 §4.51).
  {
    id: 'dream_lantern', name: '꿈의 끝은 희망', family: 'dream', grade: 'secret', element: 'spirit',
    model: 'scythe', motion: 'scythe',
    table: 'garden_of_dreams', cdMult: 0.75, aoe: 5.2,
    cost: { gold: 120000, wood: 12000, minerals: { blossom_crystal: 6, dream_petal: 4, timesand: 6, starshard: 6, genesis: 3 } },
    desc: '저주를 풀어 자유롭게 하는 희망. 꿈나무의 형제 — 꿈을 거두는 낫으로 피어난다.'
  },
  // ── 활 계열 제작 전용 3종 — 각 티어 제단에서 만든다(T3·T5·T7) ──
  {
    id: 'bow_wind', name: '바람의 장궁', family: 'bow', grade: 'rare', element: 'wind',
    table: 'forge_t3', dmgMult: 1.14, cdMult: 0.92, pierce: 2,
    desc: '바람길을 타는 장궁. 화살 한 발이 두 명을 꿰뚫는다.'
  },
  {
    id: 'bow_dragonbone', name: '용뼈 대궁', family: 'bow', grade: 'legendary', element: 'nature',
    table: 'forge_t5', dmgMult: 1.22, aoe: 2.6, pierce: 2,
    desc: '용의 갈비로 휜 대궁. 화살이 꽂히면 뼛조각이 함께 터진다.'
  },
  {
    id: 'bow_forever', name: '이 사랑, 영원히', family: 'bow', grade: 'relic', element: 'crystal',
    table: 'forge_t7', dmgMult: 1.34, pierce: 3, ultimate: 'eternalLove',
    cost: { gold: 132000, wood: 12000, minerals: { starshard: 12, timesand: 8, genesis: 4, time_shard: 4, frozen_hour: 3 } },
    desc: '키레네가 든 활 — 시위를 놓을 때마다 사랑이 영원을 건너간다. 궁극기 [영원한 사랑]을 쓸 수 있다.'
  },
  // ── 유물 카타나 — 창세의 제단(웨이브 80+)에서 제작한다(궁극기 없음) ──
  {
    id: 'katana_immortal', name: '불멸', family: 'katana', grade: 'relic', element: 'crystal',
    table: 'forge_t7', dmgMult: 1.3, lifesteal: 0.25, combo: 3, range: 3.6,
    cost: { gold: 128000, wood: 11000, minerals: { starshard: 10, timesand: 8, genesis: 4, time_shard: 3, frozen_hour: 2 } },
    desc: '시간이 지워도 남는 칼. 스칠 때마다 목숨을 조금씩 되돌려받는다. 창세의 제단에서 제작한다.'
  }
];
// ── 무기 68종 = 6계열 × 7등급(42) + 제작 전용 24종(활 3종·유물 가위·유물 카타나 포함) + 유물 지팡이 1종(보너스) + 비밀 꿈나무 1종 ──
//    화살(ARROW_TIERS 7종)은 무기가 아니라 소모품이다 — economy 의 arrows 원장에 쌓인다.
const WEAPON_NAME_TABLE = {
  staff: ['수습 지팡이', '철제 지팡이', '수정 지팡이', '비전 지팡이', '고대 지팡이', '신화 지팡이', '시간의 지팡이'],
  sword1h: ['녹슨 검', '철검', '강철 장검', '룬 블레이드', '성기사의 검', '용살검', '엑스칼리버'],
  sword2h: ['나무 대검', '철 대검', '기사 대검', '룬 대검', '심판의 대검', '신화 대검', '세계수의 검'],
  scythe: ['낫', '철 낫', '전투 낫', '룬 낫', '사신의 낫', '신화 낫', '종말의 낫'],
  dagger: ['단검', '철 단검', '독니 단검', '룬 단검', '그림자 단검', '신화 단검', '아카식의 송곳니'],
  bow: ['나무 활', '사냥꾼의 활', '강철 장궁', '룬 장궁', '폭풍의 장궁', '신화의 장궁', '영겁의 활']
};

const WEAPON_ELEMENT_TABLE = {
  staff: ['fire', 'ice', 'lightning', 'arcane', 'nature', 'holy', 'arcane'],
  sword1h: [null, null, null, 'metal', 'holy', 'chaos', 'holy'],
  sword2h: [null, null, null, 'earth', 'metal', 'nature', 'nature'],
  scythe: [null, null, null, 'metal', 'blood', 'void', 'void'],
  dagger: [null, null, 'poison', 'dark', 'dark', 'void', 'void'],
  dream: ['spirit'],
  bow: [null, null, 'wind', 'arcane', 'lightning', 'holy', 'crystal']
};

export const WEAPONS = (() => {
  const list = [];
  for (const family of WEAPON_FAMILIES) {
    // 꿈나무·가위·카타나 계열은 등급 자동 생성 대상이 아니다(전용 항목으로 직접 추가한다)
    if (family.exclusive || family.id === 'dream') continue;
    const names = WEAPON_NAME_TABLE[family.id] || [];
    const elements = WEAPON_ELEMENT_TABLE[family.id] || [];
    // 계열별 7등급(일반~유물). '비밀' 등급은 꿈나무 전용이므로 제외한다.
    WEAPON_GRADES.filter((g) => g.id !== 'secret').forEach((grade, i) => {
      const ultimate = WEAPON_ULTIMATES.find((u) => u.weapon === `${family.id}_${grade.id}`);
      list.push({
        id: `${family.id}_${grade.id}`,
        name: names[i] || `${family.name} ${grade.name}`,
        family: family.id,
        familyName: family.name,
        grade: grade.id,
        gradeName: grade.name,
        tier: grade.tier,
        color: grade.color,
        element: elements[i] ?? null,
        damage: Math.round(family.baseDamage * grade.mult),
        cooldown: Math.round(family.cooldown * (1 - i * 0.015) * 1000) / 1000,
        range: family.range,
        aoe: family.aoe || 0,
        lifesteal: family.lifesteal || 0,
        combo: family.combo || 0,
        hands: family.hands,
        kind: family.kind,
        swing: family.swing,
        projectile: !!family.projectile,
        pierce: family.pierce || 0,
        nonLethal: !!family.nonLethal,
        ultimate: ultimate ? ultimate.id : null,
        secret: false,
        bonus: false
      });
    });
  }
  // 유물 지팡이 2종 — 시간의 지팡이는 staff_relic, 창세의 지팡이는 별도 항목(보너스)
  const genesisUltimate = WEAPON_ULTIMATE_BY_ID.genesis;
  list.push({
    id: 'staff_genesis',
    name: '창세의 지팡이',
    family: 'staff',
    familyName: '지팡이',
    grade: 'relic',
    gradeName: '유물',
    tier: 7,
    color: 0xfff0b0,
    element: 'holy',
    damage: Math.round(22 * 1.75),
    cooldown: 0.65,
    range: 60,
    aoe: 0,
    lifesteal: 0,
    combo: 0,
    hands: 1,
    kind: 'ranged',
    swing: 'cast',
    projectile: true,
    nonLethal: false,
    ultimate: genesisUltimate.id,
    secret: false,
    bonus: true
  });
  // 비밀 무기 — 꿈나무
  list.push({
    id: DREAM_TREE.id,
    name: DREAM_TREE.name,
    family: 'dream',
    familyName: '꿈나무',
    grade: DREAM_TREE.grade,
    gradeName: '비밀',
    tier: 8,
    color: 0xffb8d0,
    element: 'spirit',
    damage: 0,
    cooldown: DREAM_TREE.save.cooldown,
    range: 4.5,
    aoe: DREAM_TREE.save.radius,
    lifesteal: 0,
    combo: 0,
    hands: 2,
    kind: 'save',
    swing: 'bloom',
    projectile: false,
    nonLethal: true,
    ultimate: DREAM_TREE.ultimate,
    secret: true,
    bonus: false
  });
  // ── 제작 전용 무기 — 제작대에서만 획득한다 ──
  for (const spec of CRAFT_ONLY_SPECS) {
    const family = WEAPON_FAMILIES.find((f) => f.id === spec.family);
    const grade = WEAPON_GRADES.find((g) => g.id === spec.grade);
    if (!family || !grade) continue;
    list.push({
      id: spec.id,
      name: spec.name,
      family: family.id,
      familyName: family.name,
      grade: grade.id,
      gradeName: grade.name,
      tier: grade.tier,
      color: grade.color,
      element: spec.element ?? null,
      damage: Math.round(family.baseDamage * grade.mult * (spec.dmgMult ?? 1)),
      cooldown: Math.round(family.cooldown * (1 - (grade.tier - 1) * 0.015) * (spec.cdMult ?? 1) * 1000) / 1000,
      range: spec.range ?? family.range,
      aoe: spec.aoe ?? family.aoe ?? 0,
      lifesteal: spec.lifesteal ?? family.lifesteal ?? 0,
      combo: spec.combo ?? family.combo ?? 0,
      hands: family.hands,
      kind: family.kind,
      swing: family.swing,
      model: spec.model ?? null,
      motion: spec.motion ?? null,
      projectile: !!family.projectile,
      pierce: spec.pierce ?? family.pierce ?? 0,
      nonLethal: !!family.nonLethal,
      ultimate: spec.ultimate ?? null,
      secret: grade.id === 'secret',
      bonus: false,
      craftOnly: true,
      table: spec.table,
      cost: spec.cost ?? null,
      desc: spec.desc || ''
    });
  }
  return list;
})();

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const WEAPON_TOTAL_COUNT = WEAPONS.length;
export const WEAPON_CORE_COUNT = WEAPONS.filter((w) => !w.bonus).length;

// ── 화살 티어(소모품) — 계약: 활은 화살을 1발씩 소모한다. 화살은 제작대에서 **묶음**으로 만들고,
//    티어가 높을수록 발당 피해 배수(damageMult)가 오른다. 활 피해 = 활 피해 × 화살 배수.
//    (경제 원장은 systems/economy.js 의 arrows — 가죽과 같은 방식)
export const ARROW_TIERS = [
  {
    id: 'arrow_t1', tier: 1, name: '나무 화살', glyph: '🪵', grade: 'common', damageMult: 1.0, bundle: 150,
    color: 0xd9c9a3, table: 'forge_t1', cost: { gold: 60, wood: 40, minerals: { iron: 1 } },
    desc: '깎아 만든 나무 화살. 가볍고 흔하다.'
  },
  {
    id: 'arrow_t2', tier: 2, name: '뼈촉 화살', glyph: '🦴', grade: 'uncommon', damageMult: 1.08, bundle: 140,
    color: 0xe8e0cc, table: 'forge_t2', cost: { gold: 190, wood: 90, minerals: { iron: 3, copper: 1 } },
    desc: '짐승 뼈를 갈아 촉을 세운 화살.'
  },
  {
    id: 'arrow_t3', tier: 3, name: '강철 화살', glyph: '⚙️', grade: 'rare', damageMult: 1.18, bundle: 130,
    color: 0xc9d4e0, table: 'forge_t3', cost: { gold: 520, wood: 200, minerals: { silver: 3, iron: 4 } },
    desc: '강철 촉이 갑주를 뚫는다.'
  },
  {
    id: 'arrow_t4', tier: 4, name: '룬 화살', glyph: '🔯', grade: 'epic', damageMult: 1.3, bundle: 120,
    color: 0xb06bff, table: 'forge_t4', cost: { gold: 1300, wood: 380, minerals: { mithril: 3, ruby: 1 } },
    desc: '촉에 룬을 새겨 마력을 싣는다.'
  },
  {
    id: 'arrow_t5', tier: 5, name: '용린 화살', glyph: '🐉', grade: 'legendary', damageMult: 1.45, bundle: 110,
    color: 0xffb45c, table: 'forge_t5', cost: { gold: 3200, wood: 700, minerals: { adamantite: 4, orichalcum: 2 } },
    desc: '용의 비늘을 촉으로 삼았다.'
  },
  {
    id: 'arrow_t6', tier: 6, name: '성광 화살', glyph: '🌟', grade: 'mythic', damageMult: 1.62, bundle: 100,
    color: 0xfff0b0, table: 'forge_t6', cost: { gold: 7600, wood: 1200, minerals: { abyss: 4, arcanite: 3, starshard: 1 } },
    desc: '별빛을 담아 쏘면 궤적이 빛난다.'
  },
  {
    id: 'arrow_t7', tier: 7, name: '유물 화살', glyph: '🏹', grade: 'relic', damageMult: 1.85, bundle: 90,
    color: 0xffd75c, table: 'forge_t7', cost: { gold: 17000, wood: 2000, minerals: { starshard: 4, timesand: 2, genesis: 1 } },
    desc: '세계의 법칙을 스치는 화살. 맞은 것은 꿰뚫린 채 멈춘다.'
  }
];

export const ARROW_BY_ID = Object.fromEntries(ARROW_TIERS.map((a) => [a.id, a]));
export const ARROW_BY_TIER = Object.fromEntries(ARROW_TIERS.map((a) => [a.tier, a]));
export const ARROW_TIER_COUNT = ARROW_TIERS.length;
export const ARROW_MAX_TIER = ARROW_TIERS.reduce((m, a) => Math.max(m, a.tier), 0);

/** 화살 id → 정의(없으면 null) */
export function arrowById(id) {
  return ARROW_BY_ID[String(id ?? '')] || null;
}

/** 티어 → 화살 정의(없으면 null) */
export function arrowForTier(tier) {
  const t = Math.floor(Number(tier) || 0);
  return ARROW_BY_TIER[t] || null;
}

/** 그 제작대에서 만들 수 있는 화살들 */
export function arrowsForTable(tableId) {
  return ARROW_TIERS.filter((a) => a.table === String(tableId ?? ''));
}

/** 화살 배수 — 모르는 화살이면 1 */
export function arrowDamageMult(arrowId) {
  return Number(arrowById(arrowId)?.damageMult) || 1;
}

/** 높은 티어 우선 화살 id 순서 — 활은 이 순서로 "가장 좋은 보유 화살"을 고른다 */
export const ARROW_ORDER_DESC = [...ARROW_TIERS].sort((a, b) => b.tier - a.tier).map((a) => a.id);

export function weaponById(id) {
  return WEAPON_BY_ID[id] || null;
}

/**
 * 맨손 — 아무 무기도 장착하지 않은 상태.
 * 이제 게임은 **아무 무기 없이(맨손)** 시작하고, 모든 무기는 작업대(시설)나
 * 티어 제작대에서 만들어 장착한다. WEAPONS 목록에는 넣지 않는다
 * (수집·가챠·제작·업적 계산이 흔들리지 않게 하기 위함).
 */
export const FIST_WEAPON = {
  id: 'fists',
  name: '맨손',
  family: 'fists',
  familyName: '맨손',
  grade: 'common',
  gradeName: '기본',
  tier: 1,
  color: 0xd9c9a3,
  element: null,
  damage: 6,
  cooldown: 0.7,
  range: 2.5,
  aoe: 0,
  lifesteal: 0,
  combo: 0,
  hands: 1,
  kind: 'melee',
  swing: 'punch',
  projectile: false,
  nonLethal: false,
  ultimate: null,
  secret: false,
  bonus: false,
  craftOnly: false,
  fist: true
};

export const FIST_WEAPON_ID = FIST_WEAPON.id;

/** 무기 id → 무기(맨손·null 포함). 없는 id 는 null. */
export function weaponOrFist(id) {
  if (id == null || id === FIST_WEAPON_ID) return FIST_WEAPON;
  return WEAPON_BY_ID[id] || null;
}

export function weaponsByFamily(family) {
  return WEAPONS.filter((w) => w.family === family);
}

export function weaponsByGrade(grade) {
  return WEAPONS.filter((w) => w.grade === grade);
}

/** 무기 id → 모션 세트(모든 무기는 계열을 통해 스왑모션을 가진다) */
export function weaponMotion(id) {
  const w = WEAPON_BY_ID[id];
  // 무기별 오버라이드(예: 꿈의 끝은 희망 = 꿈나무지만 낫 모션)를 먼저 본다.
  const key = w?.motion ?? (w ? w.family : id);
  return WEAPON_MOTIONS[key] || null;
}

/** 무기 id → 타격 임팩트 프리셋 */
export function weaponImpact(id) {
  const w = WEAPON_BY_ID[id];
  const key = w?.impact ?? (w ? w.family : id);
  return WEAPON_IMPACTS[key] || null;
}

export function ultimateById(id) {
  return WEAPON_ULTIMATE_BY_ID[id] || null;
}

export function ultimateImpact(id) {
  return ULTIMATE_IMPACTS[id] || null;
}

/** 스왑모션 보유 여부 — 68종 전부 true 여야 한다(검증용 · 활·카타나 포함) */
export function hasSwapMotion(id) {
  const m = weaponMotion(id);
  return !!(m && m.swap && m.swap.duration > 0 && Array.isArray(m.swap.phases) && m.swap.phases.length >= 2);
}

// ──────────────────────────────────────────────── 요정 7종 (이스터에그)
export const FAIRIES = [
  {
    id: 'aria', name: '아리아', element: 'light', color: 0xfff0b0,
    condition: { type: 'seed', value: '42', desc: '시드 42로 세계에 들어선다' },
    hint: '빛은 숫자 42를 좋아한다고 한다.',
    reward: { gold: 500, text: '빛의 축복 — 마나 회복 +10%' },
    quote: '"삶과 우주와 모든 것의 답을 찾았구나!"'
  },
  {
    id: 'sylph', name: '실피드', element: 'wind', color: 0xbff5d0,
    condition: { type: 'noTurretWaves', value: 3, desc: '포탑 없이 웨이브 3회를 버틴다' },
    hint: '바람은 아무것도 세우지 않은 이를 지켜본다.',
    reward: { gold: 400, text: '바람의 인도 — 이동 속도 +8%' },
    quote: '"맨몸으로 버티다니, 대단한데?"'
  },
  {
    id: 'gnome', name: '노움', element: 'earth', color: 0xd9b070,
    condition: { type: 'mineralTypesMined', value: 12, desc: '광물 12종을 채굴한다' },
    hint: '땅속의 모든 것을 캐내면 그가 웃는다.',
    reward: { gold: 600, text: '대지의 눈 — 채굴 속도 +15%' },
    quote: '"반짝이는 걸 다 모았구나!"'
  },
  {
    id: 'undine', name: '운디네', element: 'water', color: 0x5fc4ff,
    condition: { type: 'noDamageWaves', value: 5, desc: '기지 피해 없이 웨이브 5회를 완료한다' },
    hint: '한 방울의 피도 흘리지 않은 요새에 물이 고인다.',
    reward: { gold: 700, text: '물의 가호 — 기지 실드 재생' },
    quote: '"완벽한 방어였어."'
  },
  {
    id: 'salamander', name: '살라만더', element: 'fire', color: 0xff6a2a,
    condition: { type: 'elementKills', element: 'fire', value: 500, desc: '화염 마법으로 적 500을 처치한다' },
    hint: '불은 불로 답한다. 화염의 길을 걸어라.',
    reward: { gold: 800, text: '불꽃의 혼 — 화염 피해 +20%' },
    quote: '"타오르는군! 마음에 들어!"'
  },
  {
    id: 'titania', name: '티타니아', element: 'nature', color: 0x4fd97a,
    condition: { type: 'maxTurrets', value: 8, desc: 'T1 포탑 8개를 동시에 세운다' },
    hint: '가장 작은 탑 여덟 개가 숲을 만든다.',
    reward: { gold: 900, text: '자연의 여왕 — 아군 회복 +10%' },
    quote: '"작은 것들이 모여 숲이 되는 법."'
  },
  {
    id: 'oberon', name: '오베론', element: 'spirit', color: 0xc9b8ff,
    condition: { type: 'crown', desc: '요정 6명을 모두 만난 뒤 보스를 처치한다' },
    hint: '여섯의 노래가 하나가 될 때 왕이 온다.',
    reward: { gold: 2000, text: '요정 왕관 (패시브)' },
    quote: '"내 딸들을 찾아준 자여, 왕관을 받으라."'
  }
];

// ──────────────────────────────────────────────── 요정의 날개 (장비 · 비행)
// 요정과의 인연으로 얻는 비행 장비. 제작대(C)에서 같은 티어의 날개를 만들고(가죽·광물 소비),
// 인벤토리(I) → 「요정의 날개」에서 착용/해제한다.
// 착용 중에는 Space 로 상승 · Shift 로 하강한다(V 키로 착용/해제).
// 마나를 태워 나는 것이 기본이며, 최상위 날개는 마나를 쓰지 않는다.
// ──────────────────────────────────────────────── 요정의 날개 등급 (일반 → 초월)
export const WING_GRADES = [
  { id: 'common', name: '일반', color: 0xd6e2ea },
  { id: 'uncommon', name: '고급', color: 0x8fe08a },
  { id: 'rare', name: '희귀', color: 0x5fa8ff },
  { id: 'hero', name: '영웅', color: 0xb06bff },
  { id: 'legend', name: '전설', color: 0xffb45c },
  { id: 'myth', name: '신화', color: 0xff5a5a },
  { id: 'relic', name: '유물', color: 0xffe9a8 },
  { id: 'transcend', name: '초월', color: 0x9ff0ff }
];

export const WING_GRADE_BY_ID = Object.fromEntries(WING_GRADES.map((g) => [g.id, g]));

/** 등급 id → 정의(모르면 일반) */
export function wingGradeInfo(id) {
  return WING_GRADE_BY_ID[String(id ?? '')] ?? WING_GRADES[0];
}

// ──────────────────────────────────────────────── 요정의 날개 8종 (티어 1~7 + 초월)
// 제작대(C)에서 티어에 맞는 제작대를 지은 뒤 만든다 — 날개 1종당 제작대 1곳(T1~T7 + 꿈의 정원).
// 인벤토리(I) → 「요정의 날개」 카드의 [제작대에서 만들기] 로 해당 제작대 탭을 연다.
// 착용 중에는 Space 로 상승 · Shift 로 하강한다(V 키로 착용/해제).
// 티어 1~6 은 지형 티어의 광물, 티어 7(유물 날개)과 초월(영겁의 날개)은 히든 지역 재료와
// 상위 가죽(용 가죽·유물 가죽)을 요구한다. 마나 소모는 티어 3 부터 0 이다.
//
// ── 비행 수치 설계 규칙 (티어가 오르면 "조금씩" 강해진다) ──────────────
//  · speed  : 이동 속도 배율. **기본(T1) ×1.27 = +27%** 에서 시작해 티어마다 약 +9~10% 씩 오르고,
//             초월(T8)만 +18% 도약(×2.60)한다. 지상 이동 속도는 건드리지 않는다 — 비행 중에만 곱해진다.
//  · lift   : 상승 속도(m/s). 11 → 27 (T2부터 +1~4).
//  · descend: 하강 속도(m/s). 항상 lift 보다 크다(빠른 착지 · 급강하 회피).
//  · drain  : 초당 마나 소모. 마나 회복은 이동 5.5/s · 정지 13/s 이므로 **실효 소모 = drain − 회복** 이다.
//             T1 18/s → 이동 중 12.5/s(마나 100 으로 약 8초) · 정지 호버 5/s(약 20초).
//             T2 9/s → 이동 중 3.5/s(약 29초) · 정지 호버는 오히려 회복(+4/s).
//             **T3부터 0 — 완전 무료 비행(무제한 체공).** 가죽 장비의 마나 회복 보너스가 체공 시간을 늘린다.
//  · ceiling: 비행 상한(m). 120 → 900. T3부터 +120 씩, 마지막은 900.
//  · flap   : 날갯짓 주기(뷰모델 연출). 상위 티어일수록 느긋하게 크게 편다.
// 가죽 장비(§16)의 비행 보너스(flightSpeedPct·flightCeilingPct)는 이 값 위에 곱해진다.
export const FAIRY_WINGS = [
  {
    id: 'fairy_wings',
    name: '요정의 날개',
    tier: 1,
    grade: 'common',
    color: 0xbff5d0,
    accent: 0xfff0b0,
    glow: 0x8ff0c0,
    flap: 7.6,
    cost: { gold: 25000, minerals: { iron: 30, quartz: 20, mana: 5 } },
    requires: null,
    flight: { speed: 1.27, lift: 11, descend: 13, drain: 18, ceiling: 120 },
    desc: '실피드의 날개를 본떠 만든 장비. 착용하면 마나를 태워 하늘을 납니다.',
    hint: 'T1 여명 평원 재료 · Space 상승 · Shift 하강 · V 착용/해제'
  },
  {
    id: 'sakura_wings',
    name: '벚꽃 날개',
    tier: 2,
    grade: 'uncommon',
    color: 0xffc2d8,
    accent: 0xfff2b0,
    glow: 0xff9ac4,
    flap: 6.6,
    cost: { gold: 120000, minerals: { blossom_crystal: 5, dream_petal: 3 }, leather: { thick_leather: 4 } },
    requires: 'fairy_wings',
    flight: { speed: 1.4, lift: 12, descend: 15, drain: 9, ceiling: 200 },
    desc: '벚꽃의 정원에서 얻은 결정을 박은 날개. 더 높이, 더 오래 납니다.',
    hint: '벚꽃의 정원 재료(x -1900 / z -1520) + 두꺼운 가죽 4'
  },
  {
    id: 'star_wings',
    name: '별의 날개',
    tier: 3,
    grade: 'rare',
    color: 0xc9d8ff,
    accent: 0xfff6d0,
    glow: 0x9fb8ff,
    flap: 5.6,
    cost: { gold: 400000, minerals: { time_shard: 5, frozen_hour: 3 }, leather: { scaled_leather: 4 } },
    requires: 'sakura_wings',
    flight: { speed: 1.54, lift: 14, descend: 17, drain: 0, ceiling: 320 },
    desc: '멈춘 시간을 깃털로 엮은 날개. 마나를 쓰지 않고 끝없이 날 수 있습니다.',
    hint: '시간의 지평선 재료(x 1900 / z 1520) + 비늘 가죽 4'
  },
  {
    id: 'runic_wings',
    name: '룬 날개',
    tier: 4,
    grade: 'hero',
    color: 0xb08cff,
    accent: 0xdfe6ff,
    glow: 0x7a5cff,
    flap: 5.2,
    cost: { gold: 750000, minerals: { adamantite: 12, arcanite: 8, orichalcum: 6 }, leather: { scaled_leather: 8 } },
    requires: 'star_wings',
    flight: { speed: 1.69, lift: 16, descend: 19, drain: 0, ceiling: 440 },
    desc: 'T4 룬 고원의 광석에 룬을 새긴 날개. 상승력이 크게 오릅니다.',
    hint: 'T4 룬 고원(920~1220m) 광물 + 비늘 가죽 8'
  },
  {
    id: 'frost_wings',
    name: '설원 날개',
    tier: 5,
    grade: 'legend',
    color: 0xd8f4ff,
    accent: 0xbfe9ff,
    glow: 0x8fd6ff,
    flap: 4.8,
    cost: { gold: 1200000, minerals: { starshard: 8, timesand: 6 }, leather: { scaled_leather: 12, dragon_leather: 4 } },
    requires: 'runic_wings',
    flight: { speed: 1.85, lift: 18, descend: 21, drain: 0, ceiling: 560 },
    desc: 'T5 고대 설원의 눈보라를 깃털로 얼린 날개. 상한이 560m 까지 열립니다.',
    hint: 'T5 고대 설원(1220~1520m) 광물 + 용 가죽 4'
  },
  {
    id: 'volcano_wings',
    name: '화산 날개',
    tier: 6,
    grade: 'myth',
    color: 0xff9a4a,
    accent: 0xffe08a,
    glow: 0xff5a2a,
    flap: 4.4,
    cost: { gold: 2000000, minerals: { genesis: 6, dragonbone: 10, abyss: 10 }, leather: { dragon_leather: 8 } },
    requires: 'frost_wings',
    flight: { speed: 2.02, lift: 20, descend: 24, drain: 0, ceiling: 680 },
    desc: 'T6 신화 화산의 용린석과 창세의 정수를 벼려 만든 날개.',
    hint: 'T6 신화 화산(1520~1820m) 광물 + 용 가죽 8'
  },
  {
    id: 'artifact_wings',
    name: '유물 날개',
    tier: 7,
    grade: 'relic',
    color: 0xffe9a8,
    accent: 0xfff6d0,
    glow: 0xffc24a,
    flap: 4.0,
    cost: {
      gold: 3500000,
      minerals: { genesis: 12, timesand: 10, starshard: 10 },
      leather: { dragon_leather: 12, relic_leather: 3 }
    },
    requires: 'volcano_wings',
    flight: { speed: 2.2, lift: 23, descend: 27, drain: 0, ceiling: 800 },
    desc: 'T7 유물 지대에서 발견된 유물 조각을 깃털로 세운 날개 — 유물 등급.',
    hint: '유물 등급 · T7 유물 지대(1820~2120m) + 유물 가죽 3'
  },
  {
    id: 'aether_wings',
    name: '영겁의 날개',
    tier: 8,
    grade: 'transcend',
    color: 0x9ff0ff,
    accent: 0xffffff,
    glow: 0x5fd8ff,
    flap: 3.6,
    cost: {
      gold: 6000000,
      minerals: { blossom_crystal: 10, dream_petal: 10, time_shard: 10, frozen_hour: 10 },
      leather: { relic_leather: 8 }
    },
    requires: 'artifact_wings',
    flight: { speed: 2.6, lift: 27, descend: 32, drain: 0, ceiling: 900 },
    desc: '벚꽃의 정원과 시간의 지평선 재료를 모두 엮은 초월 등급의 날개. 상한 900m.',
    hint: '초월 등급 · 히든 지역 재료 4종 + 유물 가죽 8'
  }
];

export const FAIRY_WING_BY_ID = Object.fromEntries(FAIRY_WINGS.map((w) => [w.id, w]));
export const FAIRY_WING_DEFAULT = FAIRY_WINGS[0].id;

/** 비행 프로필 기본값 — 날개가 없을 때 player 가 쓰는 값 */
export const WING_FLIGHT_DEFAULTS = Object.freeze({
  equipped: false,
  id: null,
  speed: 1,
  lift: 10,
  descend: 12,
  drain: 0,
  ceiling: 100,
  flap: 7
});

export function fairyWingById(id) {
  return FAIRY_WING_BY_ID[id] ?? null;
}

export function fairyWingTier(id) {
  return Number(fairyWingById(id)?.tier) || 0;
}

/** 다음 티어 날개(업그레이드 체인) */
export function nextFairyWing(id) {
  const i = FAIRY_WINGS.findIndex((w) => w.id === id);
  return i >= 0 && i + 1 < FAIRY_WINGS.length ? FAIRY_WINGS[i + 1] : null;
}

/** 등급 id → 그 등급의 날개 목록 */
export function wingsByGrade(gradeId) {
  const g = String(gradeId ?? '');
  return FAIRY_WINGS.filter((w) => w.grade === g);
}

/** 티어 이하의 날개 목록(업그레이드 경로 안내용) */
export function wingsUpToTier(tier) {
  const t = Math.max(1, Math.floor(Number(tier) || 1));
  return FAIRY_WINGS.filter((w) => Number(w.tier) <= t);
}

/** 날개 id → 등급 정보(일반/고급/…/유물/초월) */
export function fairyWingGrade(id) {
  return wingGradeInfo(fairyWingById(id)?.grade);
}

/** 날개 개수(티어 1~7 + 초월) */
export function fairyWingCount() {
  return FAIRY_WINGS.length;
}

// ──────────────────────────────────────────────── 웨이브 / 적
// ──────────────────────────────────────────────── 가죽 장비 6종 (가죽 아이템)
// 몬스터에게서 얻은 가죽으로 만드는 방어구. 슬롯은 머리·몸통·발·등 4곳이며 같은 슬롯은 하나만 착용한다.
// 보너스는 **비율(퍼센트)** 로만 준다 — 저장에 섞이지 않아 불러오기 후에도 정확히 다시 계산된다.
export const GEAR_SLOTS = [
  { id: 'head', name: '머리', glyph: '🪖' },
  { id: 'body', name: '몸통', glyph: '🥋' },
  { id: 'hands', name: '손', glyph: '🧤' },
  { id: 'waist', name: '허리', glyph: '🎗' },
  { id: 'feet', name: '발', glyph: '🥾' },
  { id: 'back', name: '등', glyph: '🧣' }
];

export const GEAR_SLOT_BY_ID = Object.fromEntries(GEAR_SLOTS.map((s) => [s.id, s]));

export const GEAR_BONUS_LABELS = {
  damageTakenPct: '받는 피해',
  damagePct: '공격력',
  moveSpeedPct: '이동 속도',
  manaRegenPct: '마나 회복',
  staminaRegenPct: '스태미나 회복',
  flightSpeedPct: '비행 속도',
  flightCeilingPct: '비행 상한',
  miningSpeedPct: '채굴 속도'
};

export const LEATHER_GEAR = [
  {
    id: 'leather_cap',
    name: '가죽 모자',
    slot: 'head',
    tier: 1,
    grade: 'common',
    glyph: '🪖',
    color: 0xa9744f,
    cost: { gold: 4000, leather: { leather: 6 } },
    bonus: { manaRegenPct: 0.1 },
    desc: '질긴 가죽을 덧댄 모자. 마나 회복이 10% 빨라집니다.'
  },
  {
    id: 'leather_vest',
    name: '가죽 조끼',
    slot: 'body',
    tier: 1,
    grade: 'common',
    glyph: '🥋',
    color: 0xa9744f,
    cost: { gold: 7000, leather: { leather: 10 } },
    bonus: { damageTakenPct: 0.06 },
    desc: '두 겹으로 겹쳐 꿰맨 조끼. 받는 피해가 6% 줄어듭니다.'
  },
  {
    id: 'thick_boots',
    name: '두꺼운 가죽 부츠',
    slot: 'feet',
    tier: 2,
    grade: 'uncommon',
    glyph: '🥾',
    color: 0x7d5334,
    cost: { gold: 22000, leather: { thick_leather: 8, leather: 6 } },
    bonus: { moveSpeedPct: 0.08, staminaRegenPct: 0.15 },
    desc: '발목을 단단히 감싼 부츠. 이동 속도 +8% · 스태미나 회복 +15%.'
  },
  {
    id: 'scaled_cloak',
    name: '비늘 가죽 망토',
    slot: 'back',
    tier: 3,
    grade: 'rare',
    glyph: '🧣',
    color: 0x4f8f7d,
    cost: { gold: 80000, leather: { scaled_leather: 10, thick_leather: 8 } },
    bonus: { manaRegenPct: 0.15, flightSpeedPct: 0.06, flightCeilingPct: 0.1 },
    desc: '비늘 가죽 망토 — 바람을 타도록 안감을 덧대 비행 속도 +6% · 상한 +10%.'
  },
  {
    id: 'dragon_belt',
    name: '용 가죽 허리띠',
    slot: 'waist',
    tier: 4,
    grade: 'hero',
    glyph: '🎗',
    color: 0xd94f2a,
    cost: { gold: 300000, leather: { dragon_leather: 10, scaled_leather: 12 } },
    bonus: { damageTakenPct: 0.12, damagePct: 0.08 },
    desc: '용의 비늘을 그대로 살린 허리띠. 받는 피해 -12% · 공격력 +8%.'
  },
  {
    id: 'relic_grips',
    name: '유물 가죽 장갑',
    slot: 'hands',
    tier: 5,
    grade: 'relic',
    glyph: '🧤',
    color: 0xffe9a8,
    cost: { gold: 1200000, leather: { relic_leather: 6, dragon_leather: 12 } },
    bonus: {
      damageTakenPct: 0.1,
      damagePct: 0.12,
      moveSpeedPct: 0.1,
      manaRegenPct: 0.2,
      flightSpeedPct: 0.15,
      flightCeilingPct: 0.25
    },
    desc: '유물 가죽으로 두른 장갑 — 모든 능력이 골고루 오르고 비행 상한이 25% 넓어집니다.'
  }
];

export const LEATHER_GEAR_BY_ID = Object.fromEntries(LEATHER_GEAR.map((g) => [g.id, g]));

/** 세트 효과 — 가죽 장비를 많이 입을수록 추가 보너스 */
export const GEAR_SET_BONUS = [
  { count: 2, name: '가죽 2세트', bonus: { damageTakenPct: 0.04 }, desc: '받는 피해 4% 추가 감소' },
  { count: 4, name: '가죽 4세트', bonus: { moveSpeedPct: 0.06, manaRegenPct: 0.1 }, desc: '이동 속도 +6% · 마나 회복 +10%' },
  {
    count: 6,
    name: '가죽 6세트',
    bonus: { damagePct: 0.1, flightSpeedPct: 0.1, flightCeilingPct: 0.2 },
    desc: '공격력 +10% · 비행 속도 +10% · 비행 상한 +20%'
  }
];

/** 가죽 장비 id → 정의(없으면 null) */
export function leatherGearById(id) {
  return LEATHER_GEAR_BY_ID[String(id ?? '')] ?? null;
}

/** 슬롯 id → 정의(없으면 null) */
export function gearSlotInfo(id) {
  return GEAR_SLOT_BY_ID[String(id ?? '')] ?? null;
}

/** 이 장비가 드는 슬롯의 다른 장비 id(교체용) */
export function otherGearInSlot(id) {
  const def = leatherGearById(id);
  if (!def) return [];
  return LEATHER_GEAR.filter((g) => g.slot === def.slot && g.id !== def.id).map((g) => g.id);
}

/** 보너스 문구 — '받는 피해 -6% · 마나 회복 +10%' */
export function gearBonusText(bonus) {
  const parts = [];
  for (const [key, value] of Object.entries(bonus || {})) {
    const label = GEAR_BONUS_LABELS[key] ?? key;
    const pct = Math.round((Number(value) || 0) * 100);
    if (!pct) continue;
    const sign = key === 'damageTakenPct' ? '-' : '+';
    parts.push(`${label} ${sign}${Math.abs(pct)}%`);
  }
  return parts.join(' · ');
}

/** 비용 문구 — '4,000 G + 질긴 가죽 6' */
export function gearCostText(gears, only = null) {
  const list = Array.isArray(gears) ? gears : [gears].filter(Boolean);
  const parts = [];
  for (const g of list) {
    if (!g) continue;
    const gold = Math.round(Number(g.cost?.gold) || 0);
    if (gold > 0) parts.push(`${gold.toLocaleString('en-US')} G`);
    for (const [id, count] of Object.entries(g.cost?.leather || {})) {
      const name = LEATHER_BY_ID[id]?.name ?? id;
      if (!only || only === id) parts.push(`${name} ${count}`);
    }
    for (const [id, count] of Object.entries(g.cost?.minerals || {})) {
      const t = MINERAL_TYPES.find((m) => m.id === id);
      parts.push(`${t?.name ?? id} ${count}`);
    }
  }
  return parts.join(' + ');
}
export const WAVE_CONFIG = {
  prepTime: 30,
  baseHp: 60,
  hpGrowth: 1.16,
  baseSpeed: 3.4,
  speedGrowth: 1.012,
  baseCount: 6,
  countGrowth: 1.13,
  maxAlive: 220,
  bossEvery: 10,
  /** 최종 웨이브 주기 — 이 웨이브마다 셀레스티얼이 강림한다 */


  // 무한 모드에서는 300 웨이브마다 셀레스티얼이 다시 강림한다(등장할 때마다 +35%) — 계약 §4.58

  finalWave: 100,

  // 웨이브 100 구간이 실제로 도달 가능하도록 — 30 웨이브부터 성장을 완만하게 하고 마릿수를 묶는다(계약 §4.58)
  softenAfter: 30,
  growthSoftening: 0.28,
  maxCount: 240,
  endlessCelestialEvery: 300,

  endlessCelestialGrowth: 1.35,
  // 무한 모드 후반 밸런스(계약 §4.65) — 체력은 등장마다 +35%(요청 그대로),
  //  공격력은 완만하게(+12% · 최대 ×6), 보상은 +25% 로 올려 성장 여지를 남긴다.
  endlessCelestialAttackGrowth: 1.12,
  endlessCelestialAttackCap: 6,
  endlessCelestialGoldGrowth: 1.25,
  perfectBonus: 2,
  rewardGold: 45,
  rewardWood: 14,
  rewardMineral: 1,
  spawnInterval: 0.45,
  firstWavePrep: 45
};

export const SPAWN_PATTERNS = [
  { id: 'radial', name: '방사형', desc: '기지 사방에서 고르게 몰려온다.' },
  { id: 'cluster', name: '집중형', desc: '한 방향에 밀집해 돌진한다.' },
  { id: 'opposite', name: '대치형', desc: '정반대 두 방향에서 협공한다.' },
  { id: 'scattered', name: '분산형', desc: '무작위로 흩어져 접근한다.' },
  { id: 'ring', name: '고리형', desc: '일정 거리 고리에서 동시에 등장한다.' }
];

export const ENEMY_TYPES = [
  { id: 'imp', name: '임프', color: 0xd94f2a, hpMult: 0.7, speedMult: 1.25, radius: 0.6, damage: 8, gold: 6, minLevel: 1 },
  { id: 'goblin', name: '고블린', color: 0x6fa03f, hpMult: 1.0, speedMult: 1.0, radius: 0.7, damage: 12, gold: 8, minLevel: 1 },
  { id: 'bat', name: '박쥐', color: 0xa06cf5, hpMult: 0.45, speedMult: 1.95, radius: 0.5, damage: 6, gold: 5, minLevel: 2, role: 'swarm', desc: '매우 빠르고 약한 무리형 — 수로 밀어붙인다.' },
  { id: 'wolf', name: '늑대', color: 0x8a8f9c, hpMult: 0.85, speedMult: 1.55, radius: 0.65, damage: 14, gold: 9, minLevel: 3 },
  { id: 'spider', name: '거미', color: 0x8a3f5c, hpMult: 1.05, speedMult: 1.3, radius: 0.7, damage: 16, gold: 11, minLevel: 4, role: 'swarm', desc: '낮게 기어오르는 다리 여럿 — 빠르게 달라붙는다.' },
  { id: 'orc', name: '오크', color: 0x4f7f42, hpMult: 2.2, speedMult: 0.8, radius: 0.95, damage: 26, gold: 16, minLevel: 5 },
  { id: 'skeleton', name: '해골', color: 0xe8e4d4, hpMult: 1.3, speedMult: 0.95, radius: 0.75, damage: 18, gold: 12, minLevel: 6, role: 'undead', desc: '신성 공격에 약한 언데드 병사.' },
  { id: 'wraith', name: '망령', color: 0x8f6bff, hpMult: 1.4, speedMult: 1.2, radius: 0.8, damage: 20, gold: 14, minLevel: 7 },
  { id: 'golem', name: '골렘', color: 0x7d7f85, hpMult: 4.5, speedMult: 0.55, radius: 1.25, damage: 44, gold: 30, minLevel: 9 },
  { id: 'drake', name: '드레이크', color: 0xffb45c, hpMult: 3.2, speedMult: 1.35, radius: 1.0, damage: 38, gold: 28, minLevel: 12 },
  { id: 'shade', name: '그림자', color: 0x2a1a4a, hpMult: 2.6, speedMult: 1.45, radius: 0.8, damage: 34, gold: 26, minLevel: 15 }
];

export const BOSS_TYPES = [
  { id: 'ogre_king', name: '오우거 왕', color: 0x8f5a2a, hpMult: 40, speedMult: 0.7, radius: 2.2, damage: 160, gold: 500, ability: 'smash', desc: '기지를 강타해 큰 피해를 준다.' },
  { id: 'lich', name: '리치', color: 0x6b2fbf, hpMult: 46, speedMult: 0.9, radius: 2.0, damage: 140, gold: 650, ability: 'summon', desc: '주기적으로 부하를 소환한다.' },
  { id: 'elder_dragon', name: '고룡', color: 0xff6a2a, hpMult: 70, speedMult: 1.0, radius: 2.8, damage: 220, gold: 900, ability: 'breath', desc: '넓은 범위에 브레스를 뿜는다.' },
  { id: 'titan', name: '티탄', color: 0x8fb0ff, hpMult: 110, speedMult: 0.6, radius: 3.4, damage: 300, gold: 1400, ability: 'shield', desc: '실드를 전개하고 아군을 밀어낸다.' },
  // ── 최종보스: 체력·공격력은 웨이브/난이도 배율을 받지 않는 고정값(hp/attack)이다
  {
    id: 'celestial', name: '셀레스티얼', color: 0xffe9a8, hpMult: 1, speedMult: 0.5, radius: 42,
    damage: 1200, hp: 5000000, attack: 1200, gold: 250000, ability: 'judgment',
    barWidth: 64, barRange: 1400,
    desc: '하늘을 가르고 강림한 최종보스 — 웨이브 100(무한 모드에서는 300 웨이브마다). 심판의 빛으로 기지와 모든 포탑을 태운다.'
  }
];

// ──────────────────────────────────────────────── 지형 티어별 몬스터 (야생 로밍)
// 지형 띠(T1~T7)와 히든 지역마다 **그곳에만 사는 몬스터**가 있다.
// 야생 몬스터는 웨이브 편성(ENEMY_TYPES)과 완전히 분리된 표(REGION_ENEMY_TYPES)를 쓰므로
// 웨이브/소환문에는 절대 섞이지 않고, 자기 지역 안에서만 나타난다(죽으면 가죽을 떨군다).
export const REGION_ENEMY_TYPES = [
  // T1 여명 평원
  { id: 'dawn_slime', name: '여명 슬라임', color: 0xbfe98a, hpMult: 0.8, speedMult: 0.85, radius: 0.62, damage: 10, gold: 7, minLevel: 1, region: 'tier1', leather: { id: 'leather', min: 1, max: 2, chance: 0.55 }, desc: '해가 막 뜬 평원을 굴러다니는 끈적한 슬라임.' },
  { id: 'grass_wolf', name: '풀숲 늑대', color: 0x7f9c5a, hpMult: 1.0, speedMult: 1.35, radius: 0.66, damage: 14, gold: 9, minLevel: 1, region: 'tier1', leather: { id: 'leather', min: 1, max: 3, chance: 0.7 }, desc: '풀숲에 숨어 무리로 달려드는 야생 늑대.' },
  // T2 푸른 숲
  { id: 'forest_spider', name: '숲 거미', color: 0x5f8a6b, hpMult: 1.1, speedMult: 1.3, radius: 0.7, damage: 18, gold: 11, minLevel: 2, region: 'tier2', role: 'swarm', leather: { id: 'thick_leather', min: 1, max: 2, chance: 0.45 }, desc: '나뭇가지 사이에 줄을 치고 기다리는 사냥꾼.' },
  { id: 'thorn_boar', name: '가시 멧돼지', color: 0x8a6a3f, hpMult: 1.7, speedMult: 1.05, radius: 0.85, damage: 22, gold: 13, minLevel: 2, region: 'tier2', leather: { id: 'thick_leather', min: 2, max: 3, chance: 0.8 }, desc: '등에 가시가 돋은 멧돼지 — 두꺼운 가죽을 남긴다.' },
  // T3 수정 계곡
  { id: 'shard_bat', name: '파편 박쥐', color: 0x9fd8ff, hpMult: 0.9, speedMult: 1.75, radius: 0.55, damage: 20, gold: 14, minLevel: 3, region: 'tier3', role: 'swarm', leather: { id: 'thick_leather', min: 1, max: 2, chance: 0.5 }, desc: '수정 파편을 날개에 붙인 박쥐. 매우 빠르다.' },
  { id: 'crystal_golem', name: '수정 골렘', color: 0x8fe8d8, hpMult: 3.6, speedMult: 0.6, radius: 1.25, damage: 40, gold: 26, minLevel: 3, region: 'tier3', leather: { id: 'scaled_leather', min: 1, max: 2, chance: 0.7 }, bonus: { mineral: 'quartz', chance: 0.3, amount: 2 }, desc: '계곡의 수정이 스스로 걸어 나온 골렘. 조각을 떨군다.' },
  // T4 룬 고원
  { id: 'rune_knight', name: '룬 기사', color: 0xb08cff, hpMult: 3.0, speedMult: 0.95, radius: 0.95, damage: 46, gold: 32, minLevel: 4, region: 'tier4', leather: { id: 'scaled_leather', min: 2, max: 3, chance: 0.75 }, bonus: { mineral: 'arcanite', chance: 0.18, amount: 1 }, desc: '고원을 지키는 갑주병. 룬이 새겨진 검을 든다.' },
  { id: 'stone_warden', name: '석상 파수꾼', color: 0x8f9bb3, hpMult: 4.8, speedMult: 0.5, radius: 1.4, damage: 54, gold: 38, minLevel: 4, region: 'tier4', leather: { id: 'scaled_leather', min: 2, max: 4, chance: 0.85 }, bonus: { mineral: 'adamantite', chance: 0.2, amount: 1 }, desc: '룬 고원의 석상이 깨어난 모습. 느리지만 단단하다.' },
  // T5 고대 설원
  { id: 'frost_wraith', name: '서리 망령', color: 0xbfe9ff, hpMult: 2.6, speedMult: 1.25, radius: 0.82, damage: 48, gold: 36, minLevel: 5, region: 'tier5', role: 'undead', leather: { id: 'dragon_leather', min: 1, max: 2, chance: 0.4 }, desc: '설원에서 얼어붙은 원한이 걸어 다닌다.' },
  { id: 'ice_troll', name: '얼음 트롤', color: 0x9fd8ff, hpMult: 5.6, speedMult: 0.7, radius: 1.35, damage: 62, gold: 46, minLevel: 5, region: 'tier5', leather: { id: 'dragon_leather', min: 2, max: 3, chance: 0.8 }, bonus: { mineral: 'starshard', chance: 0.14, amount: 1 }, desc: '설원을 떠도는 거인. 두꺼운 가죽이 무기로도 쓰인다.' },
  // T6 신화 화산
  { id: 'magma_drake', name: '마그마 드레이크', color: 0xff7a3f, hpMult: 4.2, speedMult: 1.4, radius: 1.05, damage: 70, gold: 52, minLevel: 6, region: 'tier6', leather: { id: 'dragon_leather', min: 2, max: 3, chance: 0.85 }, bonus: { mineral: 'dragonbone', chance: 0.2, amount: 1 }, desc: '용암을 등에 이고 나는 소형 드레이크.' },
  { id: 'flame_titan', name: '화염 거인', color: 0xffb45c, hpMult: 8.0, speedMult: 0.55, radius: 1.6, damage: 88, gold: 68, minLevel: 6, region: 'tier6', leather: { id: 'dragon_leather', min: 3, max: 5, chance: 0.9 }, bonus: { mineral: 'genesis', chance: 0.1, amount: 1 }, desc: '화산의 열기를 몸에 담은 거인. 쓰러지면 불꽃이 흩어진다.' },
  // T7 유물 지대
  { id: 'relic_guardian', name: '유물 수호자', color: 0xffe9a8, hpMult: 7.0, speedMult: 0.9, radius: 1.3, damage: 84, gold: 72, minLevel: 7, region: 'tier7', leather: { id: 'relic_leather', min: 1, max: 2, chance: 0.55 }, bonus: { mineral: 'timesand', chance: 0.16, amount: 1 }, desc: '유물 지대의 봉인을 지키는 갑주. 유물 가죽을 두르고 있다.' },
  { id: 'void_seraph', name: '공허의 천사', color: 0xc9b8ff, hpMult: 5.4, speedMult: 1.5, radius: 1.0, damage: 78, gold: 66, minLevel: 7, region: 'tier7', leather: { id: 'relic_leather', min: 1, max: 3, chance: 0.6 }, bonus: { mineral: 'genesis', chance: 0.15, amount: 1 }, desc: '유물 지대 상공을 나는 공허의 존재. 날개가 빛을 삼킨다.' },
  // 히든 지역 — 벚꽃의 정원 · 시간의 지평선
  { id: 'petal_moth', name: '꽃잎 나방', color: 0xffc2dd, hpMult: 1.8, speedMult: 1.65, radius: 0.75, damage: 34, gold: 24, minLevel: 4, region: 'cherry_garden', leather: { id: 'scaled_leather', min: 1, max: 2, chance: 0.6 }, bonus: { mineral: 'dream_petal', chance: 0.22, amount: 1 }, desc: '벚꽃의 정원을 떠도는 거대한 나방 — 꿈의 꽃잎을 묻혀 온다.' },
  { id: 'hour_phantom', name: '시계 유령', color: 0xe0c9ff, hpMult: 3.4, speedMult: 1.45, radius: 0.9, damage: 60, gold: 50, minLevel: 5, region: 'time_horizon', leather: { id: 'relic_leather', min: 1, max: 2, chance: 0.5 }, bonus: { mineral: 'time_shard', chance: 0.2, amount: 1 }, desc: '멈춘 시간 속에서 초침 소리를 내며 걷는 유령.' }
];

export const REGION_ENEMY_BY_ID = Object.fromEntries(REGION_ENEMY_TYPES.map((t) => [t.id, t]));

/** 야생 몬스터인가(웨이브 편성에서 제외하는 판정) */
export function isRegionEnemy(id) {
  return Boolean(REGION_ENEMY_BY_ID[String(id ?? '')]);
}

/**
 * 지역별 야생 몬스터 편성.
 * - `power`: 이 지역 몬스터의 웨이브 환산값(체력·피해 스케일 기준)
 * - `interval`: 스폰 시도 간격(초) · `maxAlive`: 동시에 살아 있을 수 있는 마릿수
 * - `spawnRadius`/`despawnRadius`: 플레이어 기준 등장 거리 / 정리 거리
 * - `elite`: 정예 개체 확률
 */
export const REGION_MONSTERS = [
  { id: 'tier1', region: 'tier1', name: '여명 평원', tier: 1, glyph: '🌱', power: 4, interval: 7, maxAlive: 8, spawnRadius: 70, despawnRadius: 340, elite: 0.03, types: [{ id: 'dawn_slime', weight: 3 }, { id: 'grass_wolf', weight: 2 }], desc: '슬라임과 풀숲 늑대가 어슬렁거린다.' },
  { id: 'tier2', region: 'tier2', name: '푸른 숲', tier: 2, glyph: '🌿', power: 9, interval: 7, maxAlive: 9, spawnRadius: 75, despawnRadius: 360, elite: 0.05, types: [{ id: 'thorn_boar', weight: 3 }, { id: 'forest_spider', weight: 2 }], desc: '가시 멧돼지가 땅을 긁고, 숲 거미가 줄을 친다.' },
  { id: 'tier3', region: 'tier3', name: '수정 계곡', tier: 3, glyph: '🔷', power: 13, interval: 7, maxAlive: 10, spawnRadius: 80, despawnRadius: 380, elite: 0.06, types: [{ id: 'crystal_golem', weight: 3 }, { id: 'shard_bat', weight: 2 }], desc: '수정 골렘이 우뚝 서 있고 파편 박쥐가 떼로 몰린다.' },
  { id: 'tier4', region: 'tier4', name: '룬 고원', tier: 4, glyph: '🟣', power: 17, interval: 8, maxAlive: 10, spawnRadius: 85, despawnRadius: 400, elite: 0.07, types: [{ id: 'rune_knight', weight: 3 }, { id: 'stone_warden', weight: 2 }], desc: '룬 기사와 석상 파수꾼이 고원을 지킨다.' },
  { id: 'tier5', region: 'tier5', name: '고대 설원', tier: 5, glyph: '🔶', power: 21, interval: 8, maxAlive: 10, spawnRadius: 90, despawnRadius: 420, elite: 0.08, types: [{ id: 'ice_troll', weight: 3 }, { id: 'frost_wraith', weight: 2 }], desc: '얼음 트롤의 발소리와 서리 망령의 속삭임.' },
  { id: 'tier6', region: 'tier6', name: '신화 화산', tier: 6, glyph: '🔥', power: 25, interval: 9, maxAlive: 10, spawnRadius: 95, despawnRadius: 440, elite: 0.1, types: [{ id: 'magma_drake', weight: 3 }, { id: 'flame_titan', weight: 1 }], desc: '마그마 드레이크가 화산재를 가르고, 화염 거인이 걸어온다.' },
  { id: 'tier7', region: 'tier7', name: '유물 지대', tier: 7, glyph: '👑', power: 29, interval: 9, maxAlive: 10, spawnRadius: 100, despawnRadius: 460, elite: 0.12, types: [{ id: 'relic_guardian', weight: 3 }, { id: 'void_seraph', weight: 2 }], desc: '유물 수호자와 공허의 천사 — 최상위 가죽을 남긴다.' },
  { id: 'cherry_garden', region: 'cherry_garden', name: '벚꽃의 정원', tier: 6, glyph: '🌸', power: 23, interval: 6, maxAlive: 8, spawnRadius: 60, despawnRadius: 260, elite: 0.08, types: [{ id: 'petal_moth', weight: 1 }], desc: '꽃잎 나방이 꿈의 꽃잎을 묻혀 온다.' },
  { id: 'time_horizon', region: 'time_horizon', name: '시간의 지평선', tier: 7, glyph: '⏳', power: 28, interval: 6, maxAlive: 8, spawnRadius: 60, despawnRadius: 260, elite: 0.1, types: [{ id: 'hour_phantom', weight: 1 }], desc: '시계 유령이 시간의 파편을 흘린다.' }
];

export const REGION_MONSTER_BY_ID = Object.fromEntries(REGION_MONSTERS.map((r) => [r.id, r]));

/** 지역 id(히든 포함) → 야생 몬스터 편성(없으면 null) */
export function regionMonsterRoster(regionId) {
  const id = String(regionId ?? '');
  return REGION_MONSTER_BY_ID[id] ?? null;
}

/** 이 지역에 야생 몬스터가 사는가 */
export function regionHasMonsters(regionId) {
  return Boolean(regionMonsterRoster(regionId));
}

/** 지역 편성에서 몬스터 한 종을 가중 추첨(rand 는 0~1 함수) */
export function pickRegionMonster(regionId, rand = Math.random) {
  const roster = regionMonsterRoster(regionId);
  if (!roster) return null;
  const list = roster.types
    .map((t) => ({ type: REGION_ENEMY_BY_ID[t.id] ?? null, weight: Math.max(0.01, Number(t.weight) || 1) }))
    .filter((t) => t.type);
  if (!list.length) return null;
  const total = list.reduce((a, t) => a + t.weight, 0);
  let roll = Math.max(0, Math.min(0.999999, Number(rand()) || 0)) * total;
  for (const t of list) {
    roll -= t.weight;
    if (roll <= 0) return t.type;
  }
  return list[list.length - 1].type;
}

/**
 * 처치 보상 — 가죽(항상 표에 적힌 확률)과 보너스 광물(히든 지역 몬스터).
 * rng 는 0~1 함수. 반환: { leather: {id, amount}|null, mineral: {id, amount}|null }
 */
export function regionMonsterLoot(type, rand = Math.random) {
  const out = { leather: null, mineral: null };
  if (!type) return out;
  const l = type.leather;
  if (l && Number(rand()) < Math.max(0, Math.min(1, Number(l.chance) || 0))) {
    const min = Math.max(1, Math.floor(Number(l.min) || 1));
    const max = Math.max(min, Math.floor(Number(l.max) || min));
    out.leather = { id: l.id, amount: min + Math.floor(Math.max(0, Math.min(0.999999, Number(rand()) || 0)) * (max - min + 1)) };
  }
  const b = type.bonus;
  if (b && b.mineral && Number(rand()) < Math.max(0, Math.min(1, Number(b.chance) || 0))) {
    out.mineral = { id: b.mineral, amount: Math.max(1, Math.floor(Number(b.amount) || 1)) };
  }
  return out;
}

/** 웨이브 편성 몬스터도 낮은 확률로 가죽을 떨군다(사냥으로도 가죽을 모을 수 있게) */
export function waveEnemyLeather(type) {
  if (!type) return null;
  const tier = Math.max(1, Math.min(5, Math.ceil((Number(type.minLevel) || 1) / 3)));
  const l = LEATHER_TYPES.find((x) => x.tier === tier) ?? LEATHER_TYPES[0];
  return { id: l.id, min: 1, max: 1 + Math.floor(tier / 2), chance: 0.22 };
}

/** id → 적 정의 (웨이브 편성 풀 — 지형 몬스터는 제외한다) */
export const ENEMY_TYPE_BY_ID = Object.fromEntries(ENEMY_TYPES.map((t) => [t.id, t]));
/** id → 보스 정의 */
export const BOSS_TYPE_BY_ID = Object.fromEntries(BOSS_TYPES.map((b) => [b.id, b]));
/** id → 모든 적 정의(웨이브 편성 11종 + 지형 몬스터 16종) — spawnEnemy 가 쓴다 */
export const ALL_ENEMY_BY_ID = Object.fromEntries([...ENEMY_TYPES, ...REGION_ENEMY_TYPES].map((t) => [t.id, t]));
/** 야생 몬스터까지 포함한 적 조회(모르면 null) */
export function enemyTypeById(id) {
  return ALL_ENEMY_BY_ID[String(id ?? '')] ?? null;
}
/** 전체 적 종류 수(웨이브 + 야생) */
export const ENEMY_TYPE_TOTAL = ENEMY_TYPES.length + REGION_ENEMY_TYPES.length;

/** 정예 개체 — 같은 종류라도 강화되어 금색 오라와 강조 체력바를 두른다. */
export const ELITE = {
  namePrefix: '정예 ',
  hpMult: 2.4,
  speedMult: 1.05,
  scaleMult: 1.35,
  goldMult: 2,
  color: 0xffc24a,
  desc: '체력 2.4배 · 크기 1.35배 · 골드 2배. 웨이브 편성표가 정한 수만큼 섞여 나온다.'
};

/** 몬스터/보스 체력바(월드 + HUD 공용 수치) */
export const HEALTH_BAR = {
  width: 1.6,
  height: 0.19,
  bossWidth: 3.4,
  bossHeight: 0.3,
  eliteWidthMult: 1.25,
  /** 머리 위 높이 = 개체 높이 × heightFactor + heightOffset */
  heightFactor: 2.55,
  heightOffset: 0.55,
  bossHeightFactor: 3.7,
  range: 150,
  /** 이 거리 안에서는 멀쩡해도 항상 보여 준다(밖은 피해를 입은 개체만) */
  alwaysRange: 55,
  lowRatio: 0.3,
  colors: {
    back: 0x0d1117,
    backBoss: 0x2a1206,
    backElite: 0x2a2208,
    boss: 0xffd75c,
    elite: 0xffc24a,
    low: 0xff5a5a,
    shield: 0x8fd6ff
  }
};

/** 소환문에서 몬스터가 튀어나오는 연출(문 앞에서 몸이 드러난다) */
export const SPAWN_FX = {
  emergeTime: 0.55, // 문에서 몸이 드러나는 시간(초)
  scaleFrom: 0.35, // 처음 크기 비율
  riseHeight: 1.15, // 솟아오르는 높이(보스는 2배)
  tint: 0x9fe8ff // 등장 순간 코어 발광색(문 빛과 같은 계열)
};

/**
 * 웨이브 편성표 — 웨이브마다 다른 몬스터 구성이 나온다.
 * `waveRoster(wave)` 가 웨이브 번호로 하나를 고르므로 같은 웨이브는 항상 같은 주제로 몰려오고,
 * 연속된 두 웨이브는 서로 다른 주제가 된다(직전 주제는 건너뛴다).
 * - types: 등장 몬스터 id(아직 해금되지 않은 종류는 자동으로 빠진다)
 * - weight: 종류별 등장 가중치(없으면 1)
 * - countMult: 마릿수 배율 / mods: 개체 강화(체력·속도·크기)
 * - elite: 정예 개체 수 / bossEscort: 보스 웨이브 경호 편성 전용
 */
export const WAVE_ROSTERS = [
  { id: 'imp_nest', name: '임프 소굴', icon: '👹', minWave: 1, types: ['imp'], countMult: 1.25, mods: { hpMult: 0.85, speedMult: 1.12 }, desc: '약하지만 빠른 임프가 물밀듯 몰려온다.' },
  { id: 'goblin_band', name: '고블린 무리', icon: '🪓', minWave: 1, types: ['goblin', 'imp'], weight: { goblin: 3, imp: 1 }, countMult: 1, desc: '고블린을 앞세운 무난한 무리.' },
  { id: 'bat_cloud', name: '박쥐 구름', icon: '🦇', minWave: 2, types: ['bat', 'imp'], weight: { bat: 4, imp: 1 }, countMult: 1.35, mods: { hpMult: 0.8, speedMult: 1.2 }, desc: '박쥐가 하늘을 뒤덮고 빠르게 파고든다.' },
  { id: 'wolf_pack', name: '늑대 사냥단', icon: '🐺', minWave: 3, types: ['wolf', 'bat'], weight: { wolf: 3, bat: 1 }, countMult: 0.95, elite: 1, mods: { speedMult: 1.08 }, desc: '빠른 늑대가 정예를 앞세워 달려든다.' },
  { id: 'spider_nest', name: '거미 둥지', icon: '🕷️', minWave: 4, types: ['spider', 'bat'], weight: { spider: 3, bat: 2 }, countMult: 1.1, desc: '낮게 기어오는 거미떼가 사방에서 붙는다.' },
  { id: 'orc_tribe', name: '오크 부족', icon: '🪨', minWave: 5, types: ['orc', 'goblin'], weight: { orc: 3, goblin: 2 }, countMult: 0.75, elite: 1, mods: { hpMult: 1.3, speedMult: 0.92 }, desc: '단단한 오크가 느리지만 묵직하게 밀고 온다.' },
  { id: 'bone_march', name: '해골 행렬', icon: '💀', minWave: 6, types: ['skeleton', 'wraith'], weight: { skeleton: 3, wraith: 1 }, countMult: 1.05, elite: 1, desc: '신성 공격에 약한 언데드 행렬.' },
  { id: 'wraith_veil', name: '망령의 장막', icon: '👻', minWave: 7, types: ['wraith', 'shade'], weight: { wraith: 3, shade: 1 }, countMult: 0.95, elite: 1, mods: { speedMult: 1.18 }, desc: '반투명한 망령이 방어선을 스며든다.' },
  { id: 'golem_guard', name: '골렘 수호대', icon: '🗿', minWave: 9, types: ['golem', 'orc'], weight: { golem: 3, orc: 2 }, countMult: 0.55, elite: 1, mods: { hpMult: 1.45, scaleMult: 1.12 }, desc: '숫자는 적지만 매우 단단한 수호대.' },
  { id: 'chaos_horde', name: '혼성 군단', icon: '⚔️', minWave: 10, types: ['imp', 'goblin', 'bat', 'wolf', 'spider', 'orc', 'skeleton', 'wraith', 'golem', 'drake', 'shade'], countMult: 1.15, elite: 2, desc: '모든 종족이 뒤섞여 밀려온다.' },
  { id: 'drake_flight', name: '드레이크 비행단', icon: '🐉', minWave: 12, types: ['drake', 'bat'], weight: { drake: 3, bat: 2 }, countMult: 0.85, elite: 1, desc: '빠르고 강한 드레이크 편대.' },
  { id: 'shade_coven', name: '그림자 결사', icon: '🌑', minWave: 15, types: ['shade', 'wraith', 'skeleton'], countMult: 0.9, elite: 2, mods: { speedMult: 1.15 }, desc: '정예가 섞인 그림자 결사.' },
  { id: 'boss_legion', name: '군단장의 친위대', icon: '👑', minWave: 10, bossEscort: true, types: ['orc', 'wraith', 'golem', 'drake', 'shade'], countMult: 0.85, elite: 2, mods: { hpMult: 1.15 }, desc: '보스를 호위하는 정예 친위대.' }
];

export const WAVE_ROSTER_BY_ID = Object.fromEntries(WAVE_ROSTERS.map((r) => [r.id, r]));

/**
 * 웨이브 번호 → 편성표. 해금된(등장 종류가 하나라도 풀린) 편성만 후보로 쓰고,
 * 직전 웨이브와 같은 편성이 나오면 한 칸 건너뛴다 — 매 웨이브 다른 몬스터가 나온다.
 * 보스 웨이브는 `bossEscort` 편성(친위대)을 우선 쓴다.
 */
export function waveRoster(wave, { prevId = null, boss = false } = {}) {
  const w = Math.max(1, Math.floor(Number(wave) || 1));
  const ready = (r) => (r.types || []).some((id) => (ENEMY_TYPE_BY_ID[id]?.minLevel ?? 1) <= w);
  const unlocked = WAVE_ROSTERS.filter((r) => (Number(r.minWave) || 1) <= w && ready(r));
  const pool = unlocked.filter((r) => (boss ? r.bossEscort === true : r.bossEscort !== true));
  const list = pool.length > 0 ? pool : unlocked.length > 0 ? unlocked : [WAVE_ROSTERS[0]];
  let idx = (w - 1) % list.length;
  if (prevId && list.length > 1 && list[idx].id === prevId) idx = (idx + 1) % list.length;
  return list[idx];
}

export const DIFFICULTIES = [
  { id: 'peaceful', name: '평온', hpMult: 0.7, countMult: 0.8, goldMult: 1.3, desc: '느긋하게 즐기는 모드' },
  { id: 'normal', name: '표준', hpMult: 1.0, countMult: 1.0, goldMult: 1.0, desc: '기본 밸런스' },
  { id: 'hard', name: '도전', hpMult: 1.5, countMult: 1.25, goldMult: 0.85, desc: '숙련자용' },
  { id: 'nightmare', name: '악몽', hpMult: 2.4, countMult: 1.6, goldMult: 0.7, desc: '모든 것이 적으로 변한다' }
];

export const MODES = [
  { id: 'solo', name: '혼자 지키기', desc: '1인 방어' },
  { id: 'coop', name: '협동 방어', desc: '최대 4인 협동' },
  { id: 'endless', name: '무한 모드', desc: '끝없이 밀려온다' },
  { id: 'creative', name: '창조', desc: '자원 무한, 자유 건설' }
];

// ──────────────────────────────────────────────── 그래픽 프리셋
export const FRAME_PRESETS = [
  { id: 'ultra', name: '고품질', desc: '그림자·고해상도. 고사양용', shadow: true, antialias: true, pixelRatio: 2, fog: { near: 60, far: 520 }, treeCount: 700, mineralCount: 260, particles: 1.0, drawDistance: 620 },
  { id: 'balanced', name: '균형', desc: '기본 권장 설정', shadow: true, antialias: true, pixelRatio: 1.5, fog: { near: 45, far: 360 }, treeCount: 480, mineralCount: 200, particles: 0.75, drawDistance: 440 },
  { id: 'performance', name: '성능', desc: '중저사양 노트북용', shadow: false, antialias: true, pixelRatio: 1, fog: { near: 40, far: 270 }, treeCount: 320, mineralCount: 150, particles: 0.5, drawDistance: 330 },
  { id: 'battery', name: '저전력', desc: '배터리 절약', shadow: false, antialias: false, pixelRatio: 0.75, fog: { near: 35, far: 200 }, treeCount: 210, mineralCount: 110, particles: 0.25, drawDistance: 250 },
  { id: 'unlimited', name: '무제한', desc: '최대한 멀리 본다', shadow: true, antialias: true, pixelRatio: 2, fog: { near: 120, far: 950 }, treeCount: 1100, mineralCount: 400, particles: 1.4, drawDistance: 1150 },
  // 500 FPS 목표 — 그림자·안티 끔, 픽셀비 1, 가까이만 그린다(프레임 예산 2.0ms)
  { id: 'speed', name: '초고속 (500 FPS)', desc: '500 FPS 목표 · 그림자/안티 끔 · 근거리만', shadow: false, antialias: false, pixelRatio: 1, fog: { near: 50, far: 260 }, treeCount: 150, mineralCount: 80, particles: 0.2, drawDistance: 260 }
];

export const SEED_GALLERY = [
  { seed: '42', name: '요정의 숲', desc: '아리아가 기다리는 시드. 은은한 빛이 감돈다.', tags: ['이스터에그', '초보'] },
  { seed: '777', name: '잭팟 평원', desc: '광물이 유난히 잘 나온다. 넓고 평평하다.', tags: ['광물', '쉬움'] },
  { seed: '1234', name: '계단식 계곡', desc: '좁은 길목이 많아 포탑 배치가 쉽다.', tags: ['방어', '길목'] },
  { seed: '2024', name: '수정 산맥', desc: '고티어 광물이 산에 몰려 있다.', tags: ['고급', '광물'] },
  { seed: '9999', name: '끝없는 언덕', desc: '기복이 심해 시야가 가린다.', tags: ['도전', '지형'] },
  { seed: '31337', name: '해커의 평원', desc: '나무와 광물이 정갈하게 배치된다.', tags: ['균형'] },
  { seed: '8888', name: '황금 벌판', desc: '골드가 풍부하게 나오는 지형.', tags: ['경제', '쉬움'] },
  { seed: '1', name: '창세', desc: '가장 단순한 세계. 첫 플레이 추천.', tags: ['초보', '단순'] }
];

// ──────────────────────────────────────────────── 업적
export const ACHIEVEMENT_CATEGORIES = [
  { id: 'combat', name: '전투', icon: '⚔' },
  { id: 'build', name: '건설', icon: '🏗' },
  { id: 'mining', name: '채굴', icon: '⛏' },
  { id: 'magic', name: '마법', icon: '✨' },
  { id: 'survival', name: '생존', icon: '🛡' },
  { id: 'secret', name: '비밀', icon: '❓' },
  { id: 'challenge', name: '도전', icon: '🔥' }
];

export const STAT_LABELS = {
  kills: '적 처치',
  turretKills: '포탑 처치',
  towersBuilt: '포탑 건설',
  maxTurrets: '동시 포탑',
  attackTowers: '공격 포탑 건설',
  healTowers: '회복탑 건설',
  miningTowers: '채굴탑 건설',
  lumberTowers: '벌목탑 건설',
  facilitiesBuilt: '시설 건설',
  monstersSpawned: '몬스터 소환',
  goldEarned: '골드 획득',
  goldSpent: '골드 사용',
  mineralsMined: '광물 채굴',
  mineralTypesMined: '광물 종류',
  woodChopped: '목재 획득',
  treesFelled: '나무 벌목',
  spellsCast: '마법 시전',
  spellDamage: '마법 피해',
  wavesCleared: '웨이브 완료',
  perfectWaves: '완벽 방어',
  noDamageWaves: '무피격 웨이브',
  deathlessWaves: '무사망 웨이브',
  bossKills: '보스 처치',
  bossNoHit: '보스 무피격',
  damageTaken: '받은 피해',
  deaths: '사망',
  fairiesFound: '요정 조우',
  relicsOwned: '보유 유물',
  gachaPulls: '뽑기 횟수',
  epicSpells: '영웅+ 마법',
  playTime: '플레이 시간(초)',
  highestWave: '최고 웨이브',
  seed42: '시드 42 입장',
  fairyCrown: '요정 왕관',
  t1OnlyWaves: 'T1만으로 웨이브',
  noTurretWaves: '포탑 없이 웨이브',
  elementsKills: '속성별 처치',
  weaponsOwned: '보유 무기',
  weaponSwaps: '무기 교체',
  ultimatesUsed: '궁극기 사용',
  salvations: '구원한 적',
  dreamTreeOwned: '꿈나무 획득',
  weaponsCrafted: '무기 제작',
  tablesBuilt: '제작대 건설',
  flightTime: '비행 시간(초)',
  leatherGathered: '가죽 수집',
  roamersKilled: '야생 몬스터 처치',
  gearEquipped: '가죽 장비 착용',
  wingsCrafted: '날개 제작'
};

const ACH_TABLE = {
  combat: [
    ['첫 사냥', 'kills', 10], ['사냥꾼', 'kills', 50], ['베테랑', 'kills', 100], ['학살자', 'kills', 250],
    ['전장의 지배자', 'kills', 500], ['천 명의 적', 'kills', 1000], ['전설의 사냥꾼', 'kills', 2500], ['만 명의 적', 'kills', 5000],
    ['포탑의 첫 불꽃', 'turretKills', 100], ['철벽 방어', 'turretKills', 1000], ['요새의 힘', 'turretKills', 5000],
    ['보스 사냥', 'bossKills', 1], ['보스 전문가', 'bossKills', 3], ['보스 학살자', 'bossKills', 5],
    ['보스 정복자', 'bossKills', 10], ['보스의 종말', 'bossKills', 25],
    ['웨이브 5 도달', 'highestWave', 5], ['웨이브 10 도달', 'highestWave', 10], ['웨이브 20 도달', 'highestWave', 20],
    ['웨이브 30 도달', 'highestWave', 30], ['웨이브 50 도달', 'highestWave', 50]
  ],
  build: [
    ['첫 포탑', 'towersBuilt', 1], ['건설가', 'towersBuilt', 10], ['건축가', 'towersBuilt', 25], ['요새 설계자', 'towersBuilt', 50],
    ['백 개의 탑', 'towersBuilt', 100], ['도시 건설자', 'towersBuilt', 200], ['건설의 대가', 'towersBuilt', 400],
    ['동시 방어 8', 'maxTurrets', 8], ['동시 방어 16', 'maxTurrets', 16], ['동시 방어 24', 'maxTurrets', 24],
    ['치유의 손길', 'healTowers', 5], ['지하의 손', 'miningTowers', 5], ['숲의 벗', 'lumberTowers', 5]
  ],
  mining: [
    ['첫 광물', 'mineralsMined', 50], ['광부', 'mineralsMined', 250], ['채굴의 달인', 'mineralsMined', 1000], ['지맥의 주인', 'mineralsMined', 5000],
    ['광물 수집가', 'mineralTypesMined', 5], ['10종 수집', 'mineralTypesMined', 10], ['15종 수집', 'mineralTypesMined', 15], ['모든 광물', 'mineralTypesMined', 27],
    ['부자', 'goldEarned', 1000], ['큰 부자', 'goldEarned', 10000], ['황금 제국', 'goldEarned', 100000],
    ['목재 수집가', 'woodChopped', 100], ['벌목의 달인', 'woodChopped', 1000]
  ],
  magic: [
    ['첫 마법', 'spellsCast', 50], ['마법사', 'spellsCast', 250], ['대마법사', 'spellsCast', 1000], ['비전의 화신', 'spellsCast', 5000],
    ['마법 피해 1만', 'spellDamage', 10000], ['마법 피해 10만', 'spellDamage', 100000],
    ['첫 뽑기', 'gachaPulls', 1], ['10회 뽑기', 'gachaPulls', 10], ['50회 뽑기', 'gachaPulls', 50],
    ['100회 뽑기', 'gachaPulls', 100], ['500회 뽑기', 'gachaPulls', 500],
    ['영웅급 마법', 'epicSpells', 1], ['전설 수집가', 'epicSpells', 5], ['신화 수집가', 'epicSpells', 20],
    ['유물의 주인', 'relicsOwned', 1], ['두 유물', 'relicsOwned', 2]
  ],
  survival: [
    ['완벽한 방어', 'perfectWaves', 1], ['무결점 5', 'perfectWaves', 5], ['무결점 10', 'perfectWaves', 10], ['무결점 25', 'perfectWaves', 25],
    ['10 웨이브', 'wavesCleared', 10], ['25 웨이브', 'wavesCleared', 25], ['50 웨이브', 'wavesCleared', 50], ['100 웨이브', 'wavesCleared', 100],
    ['무피격 웨이브', 'noDamageWaves', 1], ['무피격 3', 'noDamageWaves', 3],
    ['10분 생존', 'playTime', 600], ['1시간 생존', 'playTime', 3600], ['5시간 생존', 'playTime', 18000]
  ],
  secret: [
    ['아리아의 속삭임', 'fairiesFound', 1], ['세 요정', 'fairiesFound', 3], ['다섯 요정', 'fairiesFound', 5], ['일곱 요정', 'fairiesFound', 7],
    ['시드 42', 'seed42', 1], ['요정 왕관', 'fairyCrown', 1],
    ['T1만으로 5웨이브', 't1OnlyWaves', 5], ['포탑 없이 3웨이브', 'noTurretWaves', 3]
  ],
  challenge: [
    ['포탑 없이 5웨이브', 'noTurretWaves', 5], ['T1만으로 10웨이브', 't1OnlyWaves', 10], ['무피격 10', 'noDamageWaves', 10],
    ['보스 무피격', 'bossNoHit', 1], ['죽지 않고 20웨이브', 'deathlessWaves', 20], ['완벽한 50', 'perfectWaves', 50]
  ]
};

function achTier(target) {
  if (target >= 5000) return 4;
  if (target >= 500) return 3;
  if (target >= 50) return 2;
  return 1;
}

export const ACHIEVEMENTS = Object.entries(ACH_TABLE).flatMap(([category, rows]) =>
  rows.map(([name, stat, target], i) => ({
    id: `${category}_${String(i + 1).padStart(2, '0')}`,
    category,
    name,
    desc: `${STAT_LABELS[stat] || stat} ${target >= 1000 ? target.toLocaleString('en-US') : target} 달성`,
    stat,
    target,
    tier: achTier(target)
  }))
);

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
export const ACHIEVEMENT_BY_STAT = ACHIEVEMENTS.reduce((acc, a) => {
  (acc[a.stat] ||= []).push(a);
  return acc;
}, {});

export const TITLE_LIST = [
  { id: 'novice', name: '수습 수호자', condition: { stat: 'wavesCleared', target: 5 }, desc: '웨이브 5회 완료' },
  { id: 'builder', name: '건축가', condition: { stat: 'towersBuilt', target: 25 }, desc: '포탑 25개 건설' },
  { id: 'miner', name: '광부장', condition: { stat: 'mineralsMined', target: 1000 }, desc: '광물 1000 채굴' },
  { id: 'slayer', name: '학살자', condition: { stat: 'kills', target: 1000 }, desc: '적 1000 처치' },
  { id: 'archmage', name: '대마법사', condition: { stat: 'spellsCast', target: 1000 }, desc: '마법 1000회 시전' },
  { id: 'guardian', name: '요새의 수호자', condition: { stat: 'wavesCleared', target: 25 }, desc: '웨이브 25회 완료' },
  { id: 'fairyfriend', name: '요정의 벗', condition: { stat: 'fairiesFound', target: 5 }, desc: '요정 5명 조우' },
  { id: 'fairyking', name: '요정 왕관', condition: { stat: 'fairyCrown', target: 1 }, desc: '요정 왕관 획득' },
  { id: 'legend', name: '전설', condition: { stat: 'highestWave', target: 50 }, desc: '웨이브 50 도달' }
];

export const STAT_KEYS = Object.keys(STAT_LABELS);

export const RARITY_COLORS = {
  common: 0xbfc7cc,
  uncommon: 0x6fd97a,
  rare: 0x5fa8ff,
  epic: 0xb06bff,
  legendary: 0xffb45c,
  mythic: 0xff3f5c,
  relic: 0xffffff
};

export default {
  VERSION,
  MAP,
  TERRAIN_TYPES,
  TREE_TYPES,
  MINERAL_TYPES,
  TURRETS,
  SPELL_ELEMENTS,
  SPELL_GRADES,
  RELIC_STAVES,
  FAIRIES,
  ACHIEVEMENTS,
  WAVE_CONFIG,
  ENEMY_TYPES,
  ENEMY_TYPE_BY_ID,
  BOSS_TYPES,
  BOSS_TYPE_BY_ID,
  ELITE,
  HEALTH_BAR,
  SPAWN_FX,
  WAVE_ROSTERS,
  FRAME_PRESETS,
  SEED_GALLERY,
  DIFFICULTIES,
  WEAPON_FAMILIES,
  WEAPON_GRADES,
  WEAPONS,
  WEAPON_MOTIONS,
  WEAPON_IMPACTS,
  WEAPON_ULTIMATES,
  ULTIMATE_IMPACTS,
  DREAM_TREE
};

/* ══════════════════════════════ 전직 시스템 (계약 §4.20) ══════════════════════════════
   계열 하나 = 직업 하나(활 = 궁수). 전직하면 **그 계열 무기만** 쓸 수 있고 다른 계열은 잠긴다.
   (가위·꿈나무는 직업과 무관한 공용 계열 — 잠기지 않고 등급 상한만 적용된다.) */

/** 전직 단계 — 단계가 오르면 쓸 수 있는 등급 상한과 직업 패시브 배율이 오른다 */
export const CLASS_STAGES = [
  { stage: 0, id: 'novice', name: '미전직', short: '0차', maxTier: 2, bonus: 1, desc: '전직 전 — 모든 계열의 1~2등급만 쓴다' },
  { stage: 1, id: 'first', name: '1차 전직', short: '1차', maxTier: 4, bonus: 1, desc: '직업 선택 — 그 계열 4등급까지 (다른 계열은 잠김)' },
  { stage: 2, id: 'second', name: '2차 전직', short: '2차', maxTier: 6, bonus: 1.5, desc: '직업 패시브 ×1.5 · 6등급까지' },
  { stage: 3, id: 'third', name: '3차 전직', short: '3차', maxTier: 8, bonus: 2, desc: '직업 패시브 ×2 · 유물·비밀 등급까지' }
];

/** 전직 규칙 (웨이브·골드 조건) */
export const CLASS_RULES = Object.freeze({
  firstWave: 3,
  secondWave: 12,
  secondCost: 1200,
  thirdWave: 22,
  thirdCost: 3000,
  respecWave: 0,
  respecCost: 200,
  /** 직업과 무관하게 쓸 수 있는 공용 계열 */
  sharedFamilies: ['scissors', 'dream', 'katana'],
  maxStage: 3
});

/** 직업 6종 (계열 = 직업, 활=궁수 포함) + 초심자 */
export const CLASSES = [
  {
    id: 'novice',
    name: '초심자',
    glyph: '🧭',
    family: null,
    color: 0x9aa4b2,
    desc: '아직 전직하지 않았다. 모든 계열 1~2등급을 자유롭게 쓴다.',
    passive: {},
    signature: null
  },
  {
    id: 'mage',
    name: '마법사',
    glyph: '🔮',
    family: 'staff',
    color: 0x7aa2ff,
    desc: '지팡이 계열 전용. 마나가 빨리 차고 무기 피해가 오른다.',
    passive: { manaRegen: 1.3, weaponDamage: 1.1 },
    signature: 'staff_relic'
  },
  {
    id: 'knight',
    name: '기사',
    glyph: '🛡️',
    family: 'sword1h',
    color: 0xffd24a,
    desc: '한손검 계열 전용. 단단하게 버티고 조금 더 빠르게 움직인다.',
    passive: { damageTaken: 0.85, moveSpeed: 1.05 },
    signature: 'sword1h_relic'
  },
  {
    id: 'berserk',
    name: '광전사',
    glyph: '⚔️',
    family: 'sword2h',
    color: 0xff6b4a,
    desc: '양손검 계열 전용. 큰 피해를 주지만 얻어맞기도 쉽다.',
    passive: { weaponDamage: 1.18, damageTaken: 1.12 },
    signature: 'sword2h_relic'
  },
  {
    id: 'reaper',
    name: '사신',
    glyph: '💀',
    family: 'scythe',
    color: 0x9b6bff,
    desc: '대낫 계열 전용. 베어낸 만큼 더 큰 피해를 준다.',
    passive: { weaponDamage: 1.12, miningSpeed: 1.1 },
    signature: 'scythe_relic'
  },
  {
    id: 'shadow',
    name: '그림자',
    glyph: '🗡️',
    family: 'dagger',
    color: 0x6bf0a8,
    desc: '단검 계열 전용. 빠르게 움직이고 자원을 잘 캔다.',
    passive: { moveSpeed: 1.12, miningSpeed: 1.15, weaponDamage: 1.05 },
    signature: 'dagger_relic'
  },
  {
    id: 'archer',
    name: '아처',
    glyph: '🏹',
    family: 'bow',
    color: 0x7fe6c9,
    desc: '활 계열 전용. 화살 피해가 오르고 발이 빠르며, 멀리서 적을 꿰뚫는다.',
    passive: { weaponDamage: 1.14, moveSpeed: 1.06 },
    signature: 'bow_forever'
  }
];

/** 활 티어 카테고리 — 무기(Tab) 화면에서 활을 티어별로 묶어 본다 */
export const BOW_TIERS = Object.freeze(
  Array.from({ length: 7 }, (_, i) => {
    const tier = i + 1;
    return Object.freeze({
      id: 'bow_t' + tier,
      tier,
      name: `${tier}티어 활`,
      icon: '🏹'
    });
  })
);

/** 그 티어의 활만 (아이템이 없으면 빈 배열) */
export function bowsByTier(tier) {
  const t = Number(tier) || 0;
  if (!t) return WEAPONS.filter((w) => w.family === 'bow');
  return WEAPONS.filter((w) => w.family === 'bow' && Number(w.tier) === t);
}

/** 활 티어별 개수 요약 */
export function bowTierCounts() {
  return BOW_TIERS.map((t) => ({ ...t, count: bowsByTier(t.tier).length }));
}

/** 계열 → 직업 (초심자 제외) */
export const CLASS_BY_FAMILY = Object.freeze(
  CLASSES.reduce((acc, c) => {
    if (c.family) acc[c.family] = c.id;
    return acc;
  }, {})
);

export const CLASS_BY_ID = Object.freeze(CLASSES.reduce((acc, c) => ((acc[c.id] = c), acc), {}));

/** 직업 정의 (없으면 초심자) */
export function classById(id) {
  return CLASS_BY_ID[String(id ?? '')] || CLASS_BY_ID.novice;
}

/** 계열 id → 그 계열 직업 id (공용/미지 계열은 null) */
export function classForFamily(family) {
  return CLASS_BY_FAMILY[String(family ?? '')] || null;
}

/** 전직 단계 정보 (0~3 으로 클램프) */
export function classStageInfo(stage) {
  const s = Math.max(0, Math.min(CLASS_STAGES.length - 1, Math.floor(Number(stage) || 0)));
  return CLASS_STAGES[s];
}

/** 직업 + 단계의 패시브(배율) — 단계 배율이 붙는다 */
export function classModifiers(classId, stage = 1) {
  const def = classById(classId);
  const info = classStageInfo(stage);
  const p = def.passive || {};
  const mult = info.bonus;
  /** 패시브 배율에 단계 배율을 적용한다(1 초과분만 증폭, 1 미만은 더 강하게 감소) */
  const scale = (v, base = 1) => {
    const x = Number.isFinite(v) ? Number(v) : base;
    return x === base ? base : x > base ? 1 + (x - base) * mult : 1 - (base - x) * mult;
  };
  return {
    weaponDamage: scale(p.weaponDamage, 1),
    manaRegen: scale(p.manaRegen, 1),
    moveSpeed: scale(p.moveSpeed, 1),
    miningSpeed: scale(p.miningSpeed, 1),
    damageTaken: scale(p.damageTaken, 1),
    healBonus: 1,
    stageBonus: mult
  };
}

/** 무기 등급(tier) — 모르는 무기는 1 */
export function weaponTier(weaponId) {
  const w = WEAPON_BY_ID[String(weaponId ?? '')];
  const t = Number(w?.tier);
  return Number.isFinite(t) ? t : 1;
}

/**
 * 무기 사용 가능 여부.
 * @returns {{locked:boolean, reason:string, kind:'ok'|'family'|'tier'|'unknown', tier:number, family:string|null}}
 */
export function weaponLock(weaponId, classId = 'novice', stage = 0) {
  const id = String(weaponId ?? '');
  const w = WEAPON_BY_ID[id];
  if (!w) return { locked: true, reason: '알 수 없는 무기입니다', kind: 'unknown', tier: 0, family: null };
  const def = classById(classId);
  const info = classStageInfo(stage);
  const family = w.family ?? null;
  const tier = weaponTier(id);
  const familyName = w.familyName || family || '알 수 없음';

  // 공용 계열(가위·꿈나무)은 직업과 무관한 특별 무기라 등급 상한을 받지 않는다.
  if (CLASS_RULES.sharedFamilies.includes(family)) {
    return { locked: false, reason: '', kind: 'ok', tier, family, shared: true };
  }

  if (!def.family) {
    // 초심자 — 계열 제한은 없지만 등급 상한이 낮다
    if (tier > info.maxTier) {
      return {
        locked: true,
        reason: `초심자는 ${info.maxTier}등급까지만 씁니다 — 전직하면 ${familyName} ${tier}등급도 쓸 수 있습니다`,
        kind: 'tier',
        tier,
        family
      };
    }
    return { locked: false, reason: '', kind: 'ok', tier, family };
  }

  if (family !== def.family) {
    const owner = classById(classForFamily(family));
    return {
      locked: true,
      reason: `${familyName} 무기는 ${owner.name} 전용입니다 — ${def.name} 직업은 쓸 수 없습니다`,
      kind: 'family',
      tier,
      family
    };
  }
  if (tier > info.maxTier) {
    return {
      locked: true,
      reason: `${info.name} 단계에서는 ${info.maxTier}등급까지 씁니다 — ${w.name}(${tier}등급)은 상위 전직이 필요합니다`,
      kind: 'tier',
      tier,
      family
    };
  }
  return { locked: false, reason: '', kind: 'ok', tier, family };
}

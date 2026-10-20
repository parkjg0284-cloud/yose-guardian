// recipes.js — 조합법 도감(계약 §4.57): 지형(지역)별로 레시피를 묶어 보여 준다.
//  · 무기 · 계열 · 작업대 · 날개 · 화살 · 광물 조합을 한곳에서 본다.
//  · 지형 분류는 제작대 tier(지역)와 숨은 지형(벚꽃의 정원 · 시간의 지평선 · 꿈의 정원)을 따른다.
import * as crafting from './crafting.js';
import * as data from './data.js';

const pick = (mod, ...names) => {
  for (const n of names) {
    const v = mod?.[n];
    if (v) return v;
  }
  return null;
};

const WEAPON_RECIPES = pick(crafting, 'WEAPON_RECIPES') ?? [];
const FAMILY_TIER_RECIPES = pick(crafting, 'FAMILY_TIER_RECIPES') ?? [];
const ARROW_RECIPES = pick(crafting, 'ARROW_RECIPES') ?? [];
const WING_RECIPES = pick(crafting, 'WING_RECIPES') ?? [];
const WORKBENCH_RECIPES = pick(crafting, 'WORKBENCH_RECIPES') ?? [];
const TABLES = pick(crafting, 'CRAFTING_TABLES') ?? [];
const TABLE_BY_ID = pick(crafting, 'CRAFTING_TABLE_BY_ID') ?? Object.fromEntries(TABLES.map((t) => [t.id, t]));
const costText = pick(crafting, 'costText') ?? (() => '');
const mineralName = pick(crafting, 'mineralName') ?? ((id) => String(id));

const WEAPON_BY_ID = pick(data, 'WEAPON_BY_ID') ?? {};
const MINERAL_COMBO_RECIPES = pick(data, 'MINERAL_COMBO_RECIPES') ?? [];
const REGION_MONSTERS = pick(data, 'REGION_MONSTERS') ?? [];
const ARROWS = pick(data, 'ARROW_TYPES', 'ARROWS') ?? [];
const WINGS = pick(data, 'WING_TYPES', 'WINGS') ?? [];
const GRADES = pick(data, 'GRADES', 'GRADE_TYPES') ?? [];

const GRADE_NAME = Object.fromEntries(
  (Array.isArray(GRADES) ? GRADES : []).filter((g) => g && g.id).map((g) => [g.id, g.name ?? g.id])
);
// 등급 → 지형 tier(자료에 tier 가 있으면 그것을 우선한다)
const GRADE_TIER = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6, relic: 7, secret: 8 };
for (const g of Array.isArray(GRADES) ? GRADES : []) {
  if (g && g.id && Number.isFinite(Number(g.tier))) GRADE_TIER[g.id] = Number(g.tier);
}

const TERRAIN_META = [
  { id: 'tier1', tier: 1, icon: '🌅', fallback: '여명 평원' },
  { id: 'tier2', tier: 2, icon: '🌲', fallback: '울창한 숲' },
  { id: 'tier3', tier: 3, icon: '💎', fallback: '수정 계곡' },
  { id: 'tier4', tier: 4, icon: '🗿', fallback: '룬 고원' },
  { id: 'tier5', tier: 5, icon: '❄️', fallback: '설원' },
  { id: 'tier6', tier: 6, icon: '🌋', fallback: '화산 지대' },
  { id: 'tier7', tier: 7, icon: '🌌', fallback: '유물 지대' },
  { id: 'cherry_garden', tier: 6, icon: '🌸', fallback: '벚꽃의 정원' },
  { id: 'time_horizon', tier: 7, icon: '⏳', fallback: '시간의 지평선' },
  { id: 'garden_of_dreams', tier: 8, icon: '🌙', fallback: '꿈의 정원' }
];

function regionName(id, fallback) {
  const rows = Array.isArray(REGION_MONSTERS) ? REGION_MONSTERS : [];
  const row = rows.find((r) => r && (r.id === id || r.region === id));
  const cleaned = String(row?.name ?? '')
    .replace(/^\s*T\d+\s*/i, '')
    .replace(/^[^가-힣A-Za-z]+/, '')
    .trim();
  return cleaned || fallback;
}

/** 지형 목록(표시용) — 지역 이름은 자료에서 가져오고 없으면 기본 이름을 쓴다 */
export const RECIPE_TERRAINS = TERRAIN_META.map((t) => ({
  id: t.id,
  tier: t.tier,
  icon: t.icon,
  name: `T${t.tier} · ${regionName(t.id, t.fallback)}`
}));

export const RECIPE_TERRAIN_BY_ID = Object.fromEntries(RECIPE_TERRAINS.map((t) => [t.id, t]));

export const RECIPE_KINDS = [
  { id: 'all', name: '전체', icon: '📖' },
  { id: 'weapon', name: '무기', icon: '⚔️' },
  { id: 'wing', name: '날개', icon: '🪽' },
  { id: 'arrow', name: '화살 · 소모품', icon: '🏹' },
  { id: 'combo', name: '광물 조합', icon: '🔮' }
];

// 숨은 지형 재료가 들어가면 그 지형으로 분류한다.
const HIDDEN_HINTS = [
  { terrain: 'cherry_garden', minerals: ['blossom_crystal', 'dream_petal'] },
  { terrain: 'time_horizon', minerals: ['time_shard', 'frozen_hour'] }
];

function terrainFor(entry) {
  if (entry.table === 'garden_of_dreams') return 'garden_of_dreams';
  const mins = entry.cost && entry.cost.minerals ? Object.keys(entry.cost.minerals) : [];
  for (const hint of HIDDEN_HINTS) {
    if (mins.some((m) => hint.minerals.includes(m))) return hint.terrain;
  }
  const tier = Math.max(1, Math.min(8, Math.round(Number(entry.tier) || 1)));
  return tier >= 8 ? 'garden_of_dreams' : 'tier' + tier;
}

function tableNameOf(table) {
  if (!table) return '';
  if (table === 'workbench') return '작업대';
  return TABLE_BY_ID[table]?.name ?? String(table);
}

function inputLabel(input) {
  if (!input || typeof input !== 'object') return '';
  return Object.keys(input)
    .map((k) => `${mineralName(k)} ${input[k]}`)
    .join(' · ');
}

let cache = null;

function build() {
  const out = [];
  const push = (raw) => {
    if (!raw || !raw.name) return;
    const entry = { ...raw };
    entry.tableName = tableNameOf(entry.table);
    entry.costLabel = entry.costLabel ?? (entry.cost ? costText(entry.cost) : '');
    if (!entry.costLabel) entry.costLabel = '재료 없음';
    entry.gradeName = entry.grade ? GRADE_NAME[entry.grade] ?? String(entry.grade) : '';
    entry.terrain = terrainFor(entry);
    entry.tier = Math.max(1, Math.min(8, Math.round(Number(entry.tier) || 1)));
    out.push(entry);
  };

  for (const r of WEAPON_RECIPES) {
    const w = WEAPON_BY_ID[r.weaponId];
    push({
      id: r.id,
      kind: 'weapon',
      source: '무기 제작',
      name: w?.name ?? r.weaponId,
      icon: w?.icon ?? '⚔️',
      table: r.table,
      tier: r.tier ?? TABLE_BY_ID[r.table]?.tier ?? 1,
      grade: w?.grade,
      cost: r.cost,
      desc: r.desc
    });
  }
  for (const r of FAMILY_TIER_RECIPES) {
    const w = WEAPON_BY_ID[r.weaponId];
    push({
      id: r.id,
      kind: 'weapon',
      source: '계열 제작',
      name: w?.name ?? r.weaponId,
      icon: w?.icon ?? '⚔️',
      table: r.table,
      tier: r.tier ?? TABLE_BY_ID[r.table]?.tier ?? 1,
      cost: r.cost,
      desc: r.desc
    });
  }
  for (const r of WORKBENCH_RECIPES) {
    const w = WEAPON_BY_ID[r.weaponId];
    push({
      id: r.id,
      kind: 'weapon',
      source: '작업대',
      name: w?.name ?? r.weaponId,
      icon: w?.icon ?? '⚔️',
      table: 'workbench',
      tier: w?.tier ?? r.tier ?? 1,
      grade: w?.grade,
      cost: r.cost,
      desc: r.desc
    });
  }
  for (const r of WING_RECIPES) {
    const w = (Array.isArray(WINGS) ? WINGS : []).find((x) => x && (x.id === r.wingId || x.wingId === r.wingId));
    push({
      id: r.id,
      kind: 'wing',
      source: '날개 제작',
      name: w?.name ?? r.wingId,
      icon: w?.icon ?? '🪽',
      table: r.table,
      tier: r.tier ?? TABLE_BY_ID[r.table]?.tier ?? 1,
      grade: r.grade,
      cost: r.cost,
      desc: r.desc
    });
  }
  for (const r of ARROW_RECIPES) {
    const a = (Array.isArray(ARROWS) ? ARROWS : []).find((x) => x && (x.id === r.arrowId || x.arrowId === r.arrowId));
    push({
      id: r.id,
      kind: 'arrow',
      source: '화살 · 소모품',
      name: `${a?.name ?? r.arrowId}${r.amount ? ` ×${r.amount}` : ''}`,
      icon: a?.icon ?? '🏹',
      table: r.table,
      tier: r.tier ?? TABLE_BY_ID[r.table]?.tier ?? 1,
      grade: r.grade,
      cost: r.cost,
      desc: r.desc
    });
  }
  for (const r of MINERAL_COMBO_RECIPES) {
    push({
      id: 'combo_' + r.id,
      kind: 'combo',
      source: '광물 조합',
      name: r.name ?? r.id,
      icon: '🔮',
      table: 'gacha',
      tier: GRADE_TIER[r.grade] ?? 1,
      grade: r.grade,
      costLabel: inputLabel(r.input),
      desc: r.desc
    });
  }

  // 같은 id 가 겹치면 구분자를 붙여 목록이 비지 않게 한다.
  const seen = new Set();
  for (const entry of out) {
    if (seen.has(entry.id)) entry.id = `${entry.id}#${seen.size}`;
    seen.add(entry.id);
  }
  return out;
}

/** 전체 조합법 목록(캐시) */
export function recipeCatalog() {
  if (!cache) cache = build();
  return cache;
}

/** 조합법이 있는 지형만(개수 포함) */
export function recipeTerrains() {
  const list = recipeCatalog();
  return RECIPE_TERRAINS.map((t) => ({ ...t, count: list.filter((e) => e.terrain === t.id).length })).filter((t) => t.count > 0);
}

/** 지형/종류로 거른 목록 */
export function recipesFor(terrainId = 'all', kind = 'all') {
  return recipeCatalog().filter(
    (e) => (terrainId === 'all' || e.terrain === terrainId) && (kind === 'all' || e.kind === kind)
  );
}

/** 지형별 개수 요약 */
export function terrainSummary() {
  return recipeTerrains().map((t) => `${t.icon} ${t.name} ${t.count}종`);
}

export function recipeCount() {
  return recipeCatalog().length;
}

/** 무결성 검사 — 스모크 테스트가 호출 */
export function validateRecipeData() {
  const errors = [];
  const list = recipeCatalog();
  if (!list.length) errors.push('조합법이 하나도 없다');
  if (list.length < 30) errors.push(`조합법이 너무 적다(${list.length})`);
  for (const e of list) {
    if (!e.id) errors.push('id 없는 조합법');
    if (!e.name) errors.push(`${e.id}: 이름 없음`);
    if (!e.terrain || !RECIPE_TERRAIN_BY_ID[e.terrain]) errors.push(`${e.id}: 지형 분류 실패(${e.terrain})`);
    if (!e.costLabel) errors.push(`${e.id}: 재료 문구 없음`);
    if (!e.tableName) errors.push(`${e.id}: 제작대 이름 없음`);
  }
  const ids = new Set(list.map((e) => e.id));
  if (ids.size !== list.length) errors.push('조합법 id 중복');
  const kinds = new Set(list.map((e) => e.kind));
  for (const k of ['weapon', 'wing', 'arrow', 'combo']) {
    if (!kinds.has(k)) errors.push(`${k} 종류 조합법이 없다`);
  }
  if (recipeTerrains().length < 6) errors.push(`지형 분류가 너무 적다(${recipeTerrains().length})`);
  return errors;
}

export default {
  RECIPE_TERRAINS,
  RECIPE_KINDS,
  recipeCatalog,
  recipeTerrains,
  recipesFor,
  terrainSummary,
  recipeCount,
  validateRecipeData
};

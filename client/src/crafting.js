// 요새의 수호자 — 제작대 8종(T1~T7 + 꿈의 정원)과 무기 제작 레시피.
// 계약: 제작대는 티어를 가진다(1~7 + 비밀 8). 무기 수치는 data.js(계열 × 등급)에서 파생하고,
//       여기서는 "무엇을 만들 수 있는가(레시피)"와 "얼마가 드는가(비용)"만 정의한다. (Three.js 금지)
import {
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_FAMILIES,
  WEAPON_GRADES,
  MINERAL_TYPES,
  DREAM_TREE,
  ARROW_TIERS,
  ARROW_BY_ID,
  weaponMotion,
  FAIRY_WINGS,
  FAIRY_WING_BY_ID,
  LEATHER_BY_ID,
  wingGradeInfo,
  PORTAL_DESTS
} from './data.js';

// ── 제작대 8종 ────────────────────────────────────────────────
// unlockWave: 이 웨이브에 도달하면 건설 가능. unlock: 추가 조건(꿈의 정원).
export const CRAFTING_TABLES = [
  {
    id: 'forge_t1', tier: 1, name: '모루', icon: '⚒️', grade: 'common', unlockWave: 1,
    cost: { gold: 300, wood: 100, minerals: { iron: 4 } },
    desc: '가장 기본이 되는 제작대. 1등급 무기를 벼린다.'
  },
  {
    id: 'forge_t2', tier: 2, name: '대장간', icon: '🔨', grade: 'uncommon', unlockWave: 5,
    cost: { gold: 900, wood: 260, minerals: { iron: 8, copper: 5, coal: 4 } },
    desc: '불을 다루는 공방. 2등급 무기를 단련한다.'
  },
  {
    id: 'forge_t3', tier: 3, name: '마법 공방', icon: '✨', grade: 'rare', unlockWave: 12,
    cost: { gold: 2400, wood: 600, minerals: { silver: 6, quartz: 5, mana: 4 } },
    desc: '마력을 두르는 작업대. 3등급 무기에 속성을 새긴다.'
  },
  {
    id: 'forge_t4', tier: 4, name: '룬 제단', icon: '🔯', grade: 'epic', unlockWave: 25,
    cost: { gold: 6000, wood: 1200, minerals: { mithril: 6, ruby: 4, arcanite: 3 } },
    desc: '룬을 새기는 제단. 4등급 무기에 문장을 각인한다.'
  },
  {
    id: 'forge_t5', tier: 5, name: '용광로', icon: '🔥', grade: 'legendary', unlockWave: 40,
    cost: { gold: 15000, wood: 2400, minerals: { adamantite: 8, orichalcum: 5, dragonbone: 4 } },
    desc: '용의 뼈도 녹이는 용광로. 5등급 무기를 담금질한다.'
  },
  {
    id: 'forge_t6', tier: 6, name: '신화의 제단', icon: '🌌', grade: 'mythic', unlockWave: 60,
    cost: { gold: 36000, wood: 4800, minerals: { abyss: 10, arcanite: 8, starshard: 5 } },
    desc: '별의 힘을 끌어내는 제단. 6등급 무기에 신화를 입힌다.'
  },
  {
    id: 'forge_t7', tier: 7, name: '창세의 제단', icon: '🌠', grade: 'relic', unlockWave: 80,
    cost: { gold: 90000, wood: 9000, minerals: { starshard: 12, timesand: 8, genesis: 4 } },
    desc: '세계의 법칙을 두드리는 제단. 7등급 유물을 만든다.'
  },
  {
    id: 'garden_of_dreams', tier: 8, name: '꿈의 정원', icon: '🌸', grade: 'secret', unlockWave: 0,
    unlock: {
      fairies: DREAM_TREE.acquire.fairies,
      achievements: DREAM_TREE.acquire.achievements,
      weapon: DREAM_TREE.acquire.weapon
    },
    cost: { gold: 120000, wood: 12000, minerals: { genesis: 8, timesand: 10, starshard: 10 } },
    desc: '꿈나무가 피어나는 자리. 비밀 무기를 만든다.'
  }
];

export const CRAFTING_TABLE_BY_ID = {};
for (const t of CRAFTING_TABLES) CRAFTING_TABLE_BY_ID[t.id] = t;
export const CRAFTING_TABLE_COUNT = CRAFTING_TABLES.length;

// ── 포탈 아이템 레시피 (계약 §4.74) ──────────────────────────────────────
//  포탈은 건설(골드)이 아니라 제작대로 만드는 소모성 아이템이다.
//  아이템 1개 = 포탈 1개. 설치하면 그 지형으로 통하는 지속 포탈이 남는다.
const PORTAL_TABLE_BY_DEST = {
  base: 'forge_t1',
  tier1: 'forge_t1',
  tier2: 'forge_t2',
  tier3: 'forge_t3',
  tier4: 'forge_t4',
  tier5: 'forge_t5',
  tier6: 'forge_t6',
  tier7: 'forge_t7'
};

const PORTAL_COST_BY_DEST = {
  base: { gold: 600, wood: 30, minerals: { iron: 4 } },
  tier1: { gold: 1200, wood: 60, minerals: { iron: 6, copper: 3 } },
  tier2: { gold: 2400, wood: 120, minerals: { copper: 6, coal: 6 } },
  tier3: { gold: 4200, wood: 210, minerals: { silver: 5, quartz: 4 } },
  tier4: { gold: 6800, wood: 340, minerals: { mithril: 4, ruby: 3 } },
  tier5: { gold: 10000, wood: 500, minerals: { adamantite: 4, orichalcum: 2 } },
  tier6: { gold: 15000, wood: 750, minerals: { abyss: 4, arcanite: 3 } },
  tier7: { gold: 22000, wood: 1100, minerals: { starshard: 6, timesand: 4, genesis: 2 } }
};

export const PORTAL_RECIPES = PORTAL_DESTS.map((d) => {
  const table = PORTAL_TABLE_BY_DEST[d.id] || 'forge_t1';
  return {
    id: `portal_item_${d.id}`,
    kind: 'portal',
    portalDest: d.id,
    name: `${d.name} 포탈`,
    icon: '🌀',
    color: d.color,
    table,
    tier: CRAFTING_TABLE_BY_ID[table]?.tier || 1,
    cost: PORTAL_COST_BY_DEST[d.id] || { gold: 600, wood: 30, minerals: {} },
    desc: `설치하면 ${d.name}(으)로 통하는 지속 포탈이 된다. 가까이에서 N 키로 이동.`
  };
});

export const PORTAL_RECIPE_BY_DEST = {};
for (const r of PORTAL_RECIPES) PORTAL_RECIPE_BY_DEST[r.portalDest] = r;
export const PORTAL_RECIPE_COUNT = PORTAL_RECIPES.length;

/** 그 지형으로 통하는 포탈 레시피 */
export function portalRecipeFor(dest) {
  return PORTAL_RECIPE_BY_DEST[dest] || null;
}

/** 그 제작대에서 만들 수 있는 포탈 */
export function portalRecipesForTable(tableId) {
  return PORTAL_RECIPES.filter((r) => r.table === tableId);
}

// ── 티어별 제작 비용(재료는 실제 광물 id) ─────────────────────
export const RECIPE_COST_BY_TIER = {
  1: { gold: 450, wood: 150, minerals: { iron: 3 } },
  2: { gold: 1200, wood: 320, minerals: { iron: 5, copper: 3 } },
  3: { gold: 3000, wood: 720, minerals: { silver: 5, quartz: 4, mana: 2 } },
  4: { gold: 7500, wood: 1500, minerals: { mithril: 6, ruby: 3, arcanite: 2 } },
  5: { gold: 18000, wood: 3000, minerals: { adamantite: 8, orichalcum: 4, dragonbone: 3 } },
  6: { gold: 44000, wood: 5600, minerals: { abyss: 8, arcanite: 6, starshard: 4 } },
  7: { gold: 110000, wood: 11000, minerals: { starshard: 10, timesand: 6, genesis: 3 } },
  8: { gold: 160000, wood: 15000, minerals: { genesis: 10, timesand: 12, starshard: 12 } }
};

// ── 유물/비밀 무기는 제작대에서도 만들 수 있다(다른 경로와 결과는 동일) ──
const EXTRA_RECIPES = [
  { weaponId: 'staff_genesis', table: 'forge_t7', tier: 7, desc: '창세의 힘을 담은 유물 지팡이. 부여대 조합과 같은 결과.' },
  { weaponId: 'staff_relic', table: 'forge_t7', tier: 7, desc: '시간을 다루는 유물 지팡이.' },
  { weaponId: DREAM_TREE.id, table: 'garden_of_dreams', tier: 8, desc: '행복의 끝 — 꿈나무. 저주를 풀어 모두를 자유롭게 한다.' }
];

// ── 계열별 티어 제작(계약 §4.45) — 활은 "그 티어의 활"을 그 티어 제단에서 만든다 ──
// 자동 생성 무기(계열 × 등급)를 그대로 레시피로 쓴다. 제작 전용 무기 뒤에 붙여
// RECIPES_BY_TABLE 의 첫 레시피(제작 전용)가 유지된다.
export const FAMILY_FORGE_FAMILIES = ['bow'];

export const FAMILY_TIER_RECIPES = WEAPONS.filter(
  (w) => FAMILY_FORGE_FAMILIES.includes(w.family) && !w.craftOnly && !w.secret
).map((w) => ({
  id: 'family_' + w.id,
  weaponId: w.id,
  table: 'forge_t' + w.tier,
  tier: w.tier,
  family: w.family,
  cost: w.cost ?? (RECIPE_COST_BY_TIER[w.tier] || RECIPE_COST_BY_TIER[1]),
  desc: 'T' + w.tier + ' ' + w.familyName + ' — ' + w.name
}));

export const FAMILY_TIER_RECIPE_COUNT = FAMILY_TIER_RECIPES.length;

/** 무기 제작 레시피 — 제작 전용 무기 + 유물/비밀 3종 */
export const WEAPON_RECIPES = (() => {
  const list = [];
  for (const w of WEAPONS) {
    if (!w.craftOnly) continue;
    list.push({
      id: `craft_${w.id}`,
      weaponId: w.id,
      table: w.table,
      tier: w.tier,
      // 무기별 서명 비용(w.cost)이 있으면 그것을, 없으면 티어 표준을 쓴다
      cost: w.cost ?? (RECIPE_COST_BY_TIER[w.tier] || RECIPE_COST_BY_TIER[1]),
      desc: `${w.gradeName} ${w.familyName} — ${w.name}`
    });
  }
  for (const extra of EXTRA_RECIPES) {
    const w = WEAPON_BY_ID[extra.weaponId];
    if (!w) continue;
    list.push({
      id: `craft_${w.id}`,
      weaponId: w.id,
      table: extra.table,
      tier: extra.tier,
      cost: RECIPE_COST_BY_TIER[extra.tier] || RECIPE_COST_BY_TIER[1],
      desc: extra.desc
    });
  }
  // 계열별 티어 레시피(활) — 항상 마지막에 붙인다(제작 전용이 먼저 보이게)
  for (const r of FAMILY_TIER_RECIPES) list.push({ ...r });
  return list;
})();

// ── 화살 제작(소모품) — 같은 티어 제작대에서 묶음으로 만든다 ────────
// 수치·비용의 단일 출처는 data.js 의 ARROW_TIERS 다(여기서는 "어느 제작대인가"만 정한다).
export const ARROW_RECIPES = ARROW_TIERS.map((a) => ({
  id: 'craft_' + a.id,
  type: 'arrow',
  arrowId: a.id,
  table: a.table,
  tier: a.tier,
  amount: a.bundle,
  grade: a.grade,
  cost: { gold: a.cost.gold, wood: a.cost.wood ?? 0, minerals: { ...(a.cost.minerals || {}) } },
  desc: a.name + ' ' + a.bundle + '발 묶음 — 발당 피해 ×' + a.damageMult
}));

export const ARROW_RECIPE_BY_ARROW = {};
export const ARROW_RECIPES_BY_TABLE = {};
for (const t of CRAFTING_TABLES) ARROW_RECIPES_BY_TABLE[t.id] = [];
for (const r of ARROW_RECIPES) {
  ARROW_RECIPE_BY_ARROW[r.arrowId] = r;
  if (!ARROW_RECIPES_BY_TABLE[r.table]) ARROW_RECIPES_BY_TABLE[r.table] = [];
  ARROW_RECIPES_BY_TABLE[r.table].push(r);
}
export const ARROW_RECIPE_COUNT = ARROW_RECIPES.length;

/** 화살 레시피(없으면 null) */
export function arrowRecipeFor(arrowId) {
  return ARROW_RECIPE_BY_ARROW[String(arrowId ?? '')] || null;
}

/** 그 제작대에서 만들 수 있는 화살 레시피 */
export function arrowRecipesForTable(tableId) {
  return ARROW_RECIPES_BY_TABLE[tableId] || [];
}

/** 화살 레시피인지(무기·날개 레시피와 구분) */
export function isArrowRecipe(recipe) {
  return Boolean(recipe && (recipe.type === 'arrow' || recipe.arrowId));
}

// ── 요정의 날개 제작 — 무기와 같은 제작대에서 만든다 ─────────────
// 날개 수치·비용의 단일 출처는 data.js 의 FAIRY_WINGS 다(여기서는 "어느 제작대인가"만 정한다).
// T1~T7 은 같은 티어의 제작대, T8(초월)은 꿈의 정원(비밀 제작대)에서 만든다.
export const WING_TABLE_BY_TIER = {
  1: 'forge_t1',
  2: 'forge_t2',
  3: 'forge_t3',
  4: 'forge_t4',
  5: 'forge_t5',
  6: 'forge_t6',
  7: 'forge_t7',
  8: 'garden_of_dreams'
};

/** 날개 제작 레시피 8종 — 비용은 FAIRY_WINGS 의 cost(골드·광물·가죽)를 그대로 쓴다 */
export const WING_RECIPES = FAIRY_WINGS.map((w) => ({
  id: `craft_${w.id}`,
  type: 'wing',
  wingId: w.id,
  table: WING_TABLE_BY_TIER[w.tier] ?? 'forge_t1',
  tier: w.tier,
  grade: w.grade,
  // 앞 티어 날개를 먼저 만들어야 한다(업그레이드 체인)
  requires: w.requires ?? null,
  cost: {
    gold: w.cost.gold,
    minerals: { ...(w.cost.minerals || {}) },
    leather: { ...(w.cost.leather || {}) }
  },
  desc: `${wingGradeInfo(w.grade).name} 등급 날개 — ${w.name}`
}));

export const WING_RECIPE_BY_WING = {};
export const WING_RECIPES_BY_TABLE = {};
for (const t of CRAFTING_TABLES) WING_RECIPES_BY_TABLE[t.id] = [];
for (const r of WING_RECIPES) {
  WING_RECIPE_BY_WING[r.wingId] = r;
  if (!WING_RECIPES_BY_TABLE[r.table]) WING_RECIPES_BY_TABLE[r.table] = [];
  WING_RECIPES_BY_TABLE[r.table].push(r);
}
export const WING_RECIPE_COUNT = WING_RECIPES.length;

/** 날개 레시피(없으면 null) */
export function wingRecipeFor(wingId) {
  return WING_RECIPE_BY_WING[wingId] || null;
}

/** 그 제작대에서 만들 수 있는 날개 레시피 */
export function wingRecipesForTable(tableId) {
  return WING_RECIPES_BY_TABLE[tableId] || [];
}

/** 날개 레시피인지(무기 레시피와 구분) */
export function isWingRecipe(recipe) {
  return Boolean(recipe && (recipe.type === 'wing' || recipe.wingId));
}

// ── 작업대(건설 시설) — 티어 제작대 없이 "모든 무기"를 만든다 ──────
/** 건설 탭에서 세우는 작업대 포탑 id (data.js 의 facility_workbench) */
export const WORKBENCH_ID = 'facility_workbench';
/** 작업대에서 제외하는 무기 — 꿈의 끝은 희망은 꿈의 정원(비밀)에서만 만든다. */
export const WORKBENCH_EXCLUDED = ['dream_lantern'];

export const WORKBENCH_RECIPES = WEAPONS.filter((w) => !WORKBENCH_EXCLUDED.includes(w.id)).map((w) => ({
  id: `bench_${w.id}`,
  weaponId: w.id,
  table: 'workbench',
  tier: w.tier,
  cost: w.cost ?? (RECIPE_COST_BY_TIER[w.tier] || RECIPE_COST_BY_TIER[1]),
  desc: `${w.gradeName} ${w.familyName} — ${w.name}`
}));

export const WORKBENCH_RECIPE_BY_WEAPON = {};
for (const r of WORKBENCH_RECIPES) WORKBENCH_RECIPE_BY_WEAPON[r.weaponId] = r;
export const WORKBENCH_RECIPE_COUNT = WORKBENCH_RECIPES.length;

/** 작업대 레시피(없으면 null) — 꿈의 끝은 희망은 항상 null */
export function workbenchRecipeFor(weaponId) {
  return WORKBENCH_RECIPE_BY_WEAPON[weaponId] || null;
}

/** 작업대에서 만들 수 있는 무기인지 */
export function isWorkbenchCraftable(weaponId) {
  return Boolean(WORKBENCH_RECIPE_BY_WEAPON[weaponId]);
}

export const WEAPON_RECIPE_BY_WEAPON = {};
export const RECIPES_BY_TABLE = {};
for (const t of CRAFTING_TABLES) RECIPES_BY_TABLE[t.id] = [];
for (const r of WEAPON_RECIPES) {
  WEAPON_RECIPE_BY_WEAPON[r.weaponId] = r;
  if (!RECIPES_BY_TABLE[r.table]) RECIPES_BY_TABLE[r.table] = [];
  RECIPES_BY_TABLE[r.table].push(r);
}
export const CRAFTING_RECIPE_COUNT = WEAPON_RECIPES.length;

// ── 조회/표시 헬퍼 ───────────────────────────────────────────
export function tableById(id) {
  return CRAFTING_TABLE_BY_ID[id] || null;
}

export function recipesForTable(tableId) {
  return RECIPES_BY_TABLE[tableId] || [];
}

export function recipeForWeapon(weaponId) {
  return WEAPON_RECIPE_BY_WEAPON[weaponId] || null;
}

export function isCraftOnly(weaponId) {
  return Boolean(WEAPON_BY_ID[weaponId]?.craftOnly);
}

/** 'T3 마법 공방' 형태의 라벨 */
export function tableTierLabel(table) {
  if (!table) return '-';
  return table.tier >= 8 ? `${table.icon || ''} ${table.name}`.trim() : `T${table.tier} ${table.name}`;
}

/** 해금 조건 문구 */
export function tableUnlockText(table) {
  if (!table) return '-';
  const parts = [];
  if (table.unlockWave > 0) parts.push(`웨이브 ${table.unlockWave} 도달`);
  const u = table.unlock || {};
  if (u.fairies) parts.push(`요정 ${u.fairies}명`);
  if (u.achievements) parts.push(`업적 ${u.achievements}개`);
  if (u.weapon) parts.push(`${WEAPON_BY_ID[u.weapon]?.name || u.weapon} 보유`);
  return parts.length ? parts.join(' · ') : '처음부터 가능';
}

export function mineralName(id) {
  const m = MINERAL_TYPES.find((x) => x.id === id);
  return m ? m.name : String(id);
}

/** 비용 문구 — '골드 450 · 목재 150 · 철광석 3' */
export function costText(cost) {
  if (!cost) return '없음';
  const parts = [];
  if (cost.gold) parts.push(`골드 ${cost.gold}`);
  if (cost.wood) parts.push(`목재 ${cost.wood}`);
  const mins = cost.minerals || {};
  for (const id of Object.keys(mins)) parts.push(`${mineralName(id)} ${mins[id]}`);
  // 가죽은 별도 원장이지만 비용 문구에는 함께 보여 준다(날개·장비 제작)
  const leathers = cost.leather || {};
  for (const id of Object.keys(leathers)) parts.push(`${LEATHER_BY_ID[id]?.name || id} ${leathers[id]}`);
  return parts.length ? parts.join(' · ') : '없음';
}

/**
 * 데이터 자체 검증 — 문제가 있으면 문자열 배열을 돌려준다(테스트/부팅 점검용).
 */
export function validateCrafting() {
  const errors = [];
  const mineralIds = new Set(MINERAL_TYPES.map((m) => m.id));
  const gradeIds = new Set(WEAPON_GRADES.map((g) => g.id));
  const familyIds = new Set(WEAPON_FAMILIES.map((f) => f.id));

  if (CRAFTING_TABLES.length !== 8) errors.push(`제작대가 8종이 아니다(${CRAFTING_TABLES.length})`);
  const tiers = CRAFTING_TABLES.map((t) => t.tier);
  if (new Set(tiers).size !== tiers.length) errors.push('제작대 티어가 중복된다');
  for (let i = 1; i <= 8; i++) if (!tiers.includes(i)) errors.push(`T${i} 제작대가 없다`);
  if (new Set(CRAFTING_TABLES.map((t) => t.id)).size !== CRAFTING_TABLES.length) errors.push('제작대 id 가 중복된다');

  for (const t of CRAFTING_TABLES) {
    if (!t.name || !t.icon || !t.desc) errors.push(`${t.id}: 이름/아이콘/설명 누락`);
    if (!gradeIds.has(t.grade)) errors.push(`${t.id}: 알 수 없는 등급 ${t.grade}`);
    if (!t.cost || !(t.cost.gold > 0) || !(t.cost.wood > 0)) errors.push(`${t.id}: 건설 비용이 잘못됐다`);
    for (const id of Object.keys(t.cost.minerals || {})) {
      if (!mineralIds.has(id)) errors.push(`${t.id}: 없는 광물 ${id}`);
      if (!(t.cost.minerals[id] > 0)) errors.push(`${t.id}: 광물 수량이 0 이하(${id})`);
    }
    if (!recipesForTable(t.id).length) errors.push(`${t.id}: 레시피가 없다`);
  }

  const seen = new Set();
  for (const r of WEAPON_RECIPES) {
    const w = WEAPON_BY_ID[r.weaponId];
    if (!w) { errors.push(`레시피 ${r.id}: 무기 ${r.weaponId} 가 없다`); continue; }
    if (seen.has(r.weaponId)) errors.push(`레시피 ${r.id}: 무기 ${r.weaponId} 중복`);
    seen.add(r.weaponId);
    const table = CRAFTING_TABLE_BY_ID[r.table];
    if (!table) { errors.push(`레시피 ${r.id}: 제작대 ${r.table} 가 없다`); continue; }
    if (!(r.cost?.gold > 0) || !(r.cost?.wood > 0)) errors.push(`레시피 ${r.id}: 비용이 잘못됐다`);
    for (const id of Object.keys(r.cost?.minerals || {})) {
      if (!mineralIds.has(id)) errors.push(`레시피 ${r.id}: 없는 광물 ${id}`);
    }
    if (!familyIds.has(w.family)) errors.push(`${r.weaponId}: 알 수 없는 계열 ${w.family}`);
    if (!gradeIds.has(w.grade)) errors.push(`${r.weaponId}: 알 수 없는 등급 ${w.grade}`);
    if (!(w.damage >= 0) || !(w.cooldown > 0)) errors.push(`${r.weaponId}: 수치가 잘못됐다`);
    const m = weaponMotion(w.id);
    if (!m || !m.swap || !(m.swap.duration > 0)) errors.push(`${r.weaponId}: 스왑모션이 없다`);
  }

  // 작업대: 전체 무기 − 제외 1종
  const expectedBench = WEAPONS.length - WORKBENCH_EXCLUDED.length;
  if (WORKBENCH_RECIPES.length !== expectedBench) errors.push(`작업대 레시피가 ${expectedBench}종이 아니다(${WORKBENCH_RECIPES.length})`);
  for (const id of WORKBENCH_EXCLUDED) if (WORKBENCH_RECIPE_BY_WEAPON[id]) errors.push(`작업대에 제외 대상(${id})이 들어 있다`);
  for (const r of WORKBENCH_RECIPES) {
    if (!WEAPON_BY_ID[r.weaponId]) { errors.push(`작업대 레시피 ${r.id}: 무기 ${r.weaponId} 가 없다`); continue; }
    if (!(r.cost?.gold > 0) || !(r.cost?.wood > 0)) errors.push(`작업대 레시피 ${r.id}: 비용이 잘못됐다`);
    for (const id of Object.keys(r.cost?.minerals || {})) {
      if (!mineralIds.has(id)) errors.push(`작업대 레시피 ${r.id}: 없는 광물 ${id}`);
    }
  }

  // 요정의 날개 레시피 — 개수·제작대 티어·비용(광물/가죽)·업그레이드 체인
  const leatherIds = new Set(Object.keys(LEATHER_BY_ID));
  if (WING_RECIPES.length !== FAIRY_WINGS.length) errors.push(`날개 레시피가 ${FAIRY_WINGS.length}종이 아니다(${WING_RECIPES.length})`);
  for (const r of WING_RECIPES) {
    const w = FAIRY_WING_BY_ID[r.wingId];
    if (!w) { errors.push(`날개 레시피 ${r.id}: 날개 ${r.wingId} 가 없다`); continue; }
    const table = CRAFTING_TABLE_BY_ID[r.table];
    if (!table) { errors.push(`날개 레시피 ${r.id}: 제작대 ${r.table} 가 없다`); continue; }
    if (table.tier !== w.tier) errors.push(`${r.id}: 제작대 티어(${table.tier})와 날개 티어(${w.tier})가 다르다`);
    if (!(r.cost?.gold > 0)) errors.push(`날개 레시피 ${r.id}: 골드 비용이 잘못됐다`);
    const mins = Object.keys(r.cost?.minerals || {});
    const lths = Object.keys(r.cost?.leather || {});
    if (!mins.length && !lths.length) errors.push(`날개 레시피 ${r.id}: 재료가 없다`);
    for (const id of mins) if (!mineralIds.has(id)) errors.push(`날개 레시피 ${r.id}: 없는 광물 ${id}`);
    for (const id of lths) if (!leatherIds.has(id)) errors.push(`날개 레시피 ${r.id}: 없는 가죽 ${id}`);
    if (w.tier > 1 && r.requires !== w.requires) errors.push(`${r.id}: 선행 날개 연결이 데이터와 다르다`);
  }
  for (const w of FAIRY_WINGS) {
    if (!WING_RECIPE_BY_WING[w.id]) errors.push(`${w.id}: 날개 레시피가 없다`);
  }

  // 계열별 티어 레시피(활) — 자동 생성 무기도 그 티어 제단에서 만들 수 있어야 한다
  for (const w of WEAPONS) {
    if (!FAMILY_FORGE_FAMILIES.includes(w.family) || w.craftOnly || w.secret) continue;
    const r = WEAPON_RECIPE_BY_WEAPON[w.id];
    if (!r) { errors.push(w.id + ': 계열 티어 레시피가 없다'); continue; }
    if (CRAFTING_TABLE_BY_ID[r.table]?.tier !== w.tier) {
      errors.push(w.id + ': 계열 레시피 제작대 티어(' + CRAFTING_TABLE_BY_ID[r.table]?.tier + ')와 무기 티어(' + w.tier + ')가 다르다');
    }
  }

  // 화살 레시피 — 화살 티어 수 · 제작대 티어 · 묶음/비용
  if (ARROW_RECIPES.length !== ARROW_TIERS.length) {
    errors.push('화살 레시피가 ' + ARROW_TIERS.length + '종이 아니다(' + ARROW_RECIPES.length + ')');
  }
  for (const r of ARROW_RECIPES) {
    const a = ARROW_BY_ID[r.arrowId];
    if (!a) { errors.push('화살 레시피 ' + r.id + ': 화살 ' + r.arrowId + ' 가 없다'); continue; }
    if (CRAFTING_TABLE_BY_ID[r.table]?.tier !== a.tier) {
      errors.push(r.id + ': 제작대 티어(' + CRAFTING_TABLE_BY_ID[r.table]?.tier + ')와 화살 티어(' + a.tier + ')가 다르다');
    }
    if (!(Number(r.amount) > 0)) errors.push(r.id + ': 묶음 수량이 잘못됐다');
    if (!(r.cost?.gold > 0)) errors.push(r.id + ': 골드 비용이 잘못됐다');
    for (const id of Object.keys(r.cost?.minerals || {})) {
      if (!mineralIds.has(id)) errors.push(r.id + ': 없는 광물 ' + id);
    }
  }
  for (const a of ARROW_TIERS) {
    if (!ARROW_RECIPE_BY_ARROW[a.id]) errors.push(a.id + ': 화살 레시피가 없다');
  }

  const craftOnly = WEAPONS.filter((w) => w.craftOnly);
  if (craftOnly.length !== 24) errors.push('제작 전용 무기가 24종이 아니다(' + craftOnly.length + ')');
  for (const w of craftOnly) {
    if (!WEAPON_RECIPE_BY_WEAPON[w.id]) errors.push(`${w.id}: 레시피가 없다`);
    if (CRAFTING_TABLE_BY_ID[w.table]?.tier !== w.tier) errors.push(`${w.id}: 제작대 티어(${CRAFTING_TABLE_BY_ID[w.table]?.tier})와 무기 티어(${w.tier})가 다르다`);
  }

  // 포탈 아이템 레시피 — 목적지 1:1 · 제작대 존재 · 비용(광물) 확인
  if (PORTAL_RECIPES.length !== PORTAL_DESTS.length) {
    errors.push(`포탈 레시피가 ${PORTAL_DESTS.length}종이 아니다(${PORTAL_RECIPES.length})`);
  }
  const destSeen = new Set();
  for (const r of PORTAL_RECIPES) {
    if (destSeen.has(r.portalDest)) errors.push(`포탈 레시피 ${r.id}: 목적지 중복(${r.portalDest})`);
    destSeen.add(r.portalDest);
    if (!CRAFTING_TABLE_BY_ID[r.table]) errors.push(`포탈 레시피 ${r.id}: 제작대 ${r.table} 가 없다`);
    if (!(r.cost?.gold > 0)) errors.push(`포탈 레시피 ${r.id}: 골드 비용이 잘못됐다`);
    for (const id of Object.keys(r.cost?.minerals || {})) {
      if (!mineralIds.has(id)) errors.push(`포탈 레시피 ${r.id}: 없는 광물 ${id}`);
      if (!(r.cost.minerals[id] > 0)) errors.push(`포탈 레시피 ${r.id}: 광물 수량이 0 이하(${id})`);
    }
  }
  for (const d of PORTAL_DESTS) {
    if (!PORTAL_RECIPE_BY_DEST[d.id]) errors.push(`${d.id}: 포탈 레시피가 없다`);
  }
  return errors;
}

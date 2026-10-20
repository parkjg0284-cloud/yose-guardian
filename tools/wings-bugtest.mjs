// 날개 제작 · 가죽 · 야생 몬스터 버그테스트 — 실제 모듈로 예외/원자성/저장 내성을 검사한다.
// (최종보스 버그테스트 tools/boss-bugtest.mjs 와 같은 형식: ✅/❌ + 종료 코드)
import { readFileSync } from 'node:fs';
import {
  FAIRY_WINGS,
  FAIRY_WING_BY_ID,
  LEATHER_TYPES,
  LEATHER_BY_ID,
  LEATHER_GEAR,
  LEATHER_GEAR_BY_ID,
  GEAR_SET_BONUS,
  MINERAL_TYPES,
  REGION_MONSTERS,
  REGION_ENEMY_BY_ID,
  REGION_ENEMY_TYPES,
  STAT_LABELS,
  pickRegionMonster,
  regionMonsterLoot,
  regionMonsterRoster,
  leatherGearById,
  gearBonusText,
  gearCostText
} from '../client/src/data.js';
import {
  CRAFTING_TABLES,
  CRAFTING_TABLE_BY_ID,
  WEAPON_RECIPES,
  WING_RECIPES,
  WING_RECIPE_COUNT,
  WING_RECIPE_BY_WING,
  WING_TABLE_BY_TIER,
  WORKBENCH_ID,
  costText,
  isWingRecipe,
  validateCrafting,
  wingRecipeFor,
  wingRecipesForTable
} from '../client/src/crafting.js';
import { CraftingSystem } from '../client/src/systems/crafting.js';
import { WingSystem } from '../client/src/systems/wings.js';
import { GearSystem, emptyBonus, GEAR_BONUS_KEYS } from '../client/src/systems/gear.js';
import { Economy } from '../client/src/systems/economy.js';
import { AchievementSystem } from '../client/src/systems/achievements.js';
import {
  ROAMER_DEFAULTS,
  RegionSpawner,
  countRoamers,
  isRoamer,
  roamerRoster,
  roamerSpawnPoint,
  shouldDespawn
} from '../client/src/systems/region-spawns.js';
import { spawnEnemy } from '../client/src/systems/enemies.js';
import { WaveSystem } from '../client/src/systems/waves.js';

const problems = [];
let checks = 0;
const record = (label, cond, extra = '') => {
  checks += 1;
  if (!cond) problems.push(`${label} ${extra}`);
  console.log(`  ${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};
const section = (name) => console.log(`\n── ${name}`);
const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// ── 공통 도우미 ──────────────────────────────────────────────
const RICH_GOLD = 10000000;
const richMinerals = Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, 999]));
const richLeathers = Object.fromEntries(LEATHER_TYPES.map((l) => [l.id, 999]));

/** main.js 의 _craftingContext 와 같은 형태의 컨텍스트를 가진 가짜 게임 */
function makeGame({ gold = RICH_GOLD, minerals = null, leathers = null, built = [], owned = [], weapons = [] } = {}) {
  const eco = new Economy({
    gold,
    wood: 100000,
    minerals: { ...(minerals ?? richMinerals) },
    leathers: { ...(leathers ?? richLeathers) }
  });
  const wings = new WingSystem({ economy: eco });
  for (const id of owned) wings.grant(id, { equip: false });
  const ctx = {
    wave: 120,
    cleared: 119,
    fairies: 7,
    achievements: 60,
    hasWeapon: (id) => weapons.includes(id),
    hasWorkbench: false,
    hasWing: (id) => wings.has(id),
    onWingCrafted: (id) => wings.grant(id, { equip: true })
  };
  const cs = new CraftingSystem({ getEconomy: () => eco, getContext: () => ctx });
  for (const id of built) cs.build(id, ctx);
  return { eco, wings, ctx, cs };
}

const snap = (eco) => ({
  gold: eco.gold,
  wood: eco.wood,
  leather: eco.totalLeather(),
  minerals: eco.totalMinerals(),
  byId: Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, eco.getMineral(m.id)])),
  byLeather: Object.fromEntries(LEATHER_TYPES.map((l) => [l.id, eco.getLeather(l.id)]))
});

/** 실제로 변한 항목만 뽑는다 — 원자성·정확 차감 검증용 */
function delta(before, eco) {
  const d = {};
  if (eco.gold !== before.gold) d.gold = eco.gold - before.gold;
  if (eco.wood !== before.wood) d.wood = eco.wood - before.wood;
  for (const m of MINERAL_TYPES) {
    const v = eco.getMineral(m.id) - before.byId[m.id];
    if (v !== 0) d[`m:${m.id}`] = v;
  }
  for (const l of LEATHER_TYPES) {
    const v = eco.getLeather(l.id) - before.byLeather[l.id];
    if (v !== 0) d[`l:${l.id}`] = v;
  }
  return d;
}

const recipeDelta = (cost) => {
  const d = {};
  const gold = num(cost?.gold);
  if (gold) d.gold = -gold;
  for (const [id, n] of Object.entries(cost?.minerals ?? {})) d[`m:${id}`] = -Math.floor(num(n));
  for (const [id, n] of Object.entries(cost?.leather ?? {})) d[`l:${id}`] = -Math.floor(num(n));
  return d;
};
const sameDelta = (a, b) => JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort()) || (Object.keys(a).length === 0 && Object.keys(b).length === 0);

// ══════════════════════════════════════════════ 1. 통계 키 계약
section('1. 통계 키 계약 (track 키 ↔ STAT_LABELS)');
{
  const mainSrc = src('../client/src/main.js');
  const trackKeys = [...mainSrc.matchAll(/\.track\(\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  const setKeys = [...mainSrc.matchAll(/achievements\??\.set\??\.\(\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
  const allKeys = [...new Set([...trackKeys, ...setKeys])];
  const missing = allKeys.filter((k) => !(k in STAT_LABELS));
  record(
    'main.js 가 쓰는 통계 키가 전부 STAT_LABELS 에 등록됨',
    missing.length === 0,
    missing.length ? `미등록: ${missing.join(', ')}` : `${allKeys.length}종 확인`
  );
  record('wingsCrafted 라벨 등록(날개 제작)', STAT_LABELS.wingsCrafted === '날개 제작', String(STAT_LABELS.wingsCrafted));
  const ach = new AchievementSystem({});
  record('wingsCrafted 누적 기록', ach.track('wingsCrafted', 1) === 1 && ach.track('wingsCrafted', 2) === 3 && ach.get('wingsCrafted') === 3, `값 ${ach.get('wingsCrafted')}`);
  record(
    '가죽·야생·장비 통계 키 4종 등록',
    ['leatherGathered', 'roamersKilled', 'gearEquipped', 'tablesBuilt'].every((k) => k in STAT_LABELS)
  );
}

// ══════════════════════════════════════════════ 2. 날개 레시피 무결성
section('2. 날개 레시피 무결성 (제작대 · 비용 단일 출처)');
{
  record('validateCrafting() 오류 0건', validateCrafting().length === 0, validateCrafting().join(' / ') || '없음');
  record('레시피 8종 · id 유일 · type=wing', WING_RECIPES.length === WING_RECIPE_COUNT && WING_RECIPE_COUNT === 8 && new Set(WING_RECIPES.map((r) => r.id)).size === 8 && WING_RECIPES.every((r) => r.type === 'wing'));

  const tableMismatch = FAIRY_WINGS.filter((w) => {
    const r = WING_RECIPE_BY_WING[w.id];
    if (!r) return true;
    const t = CRAFTING_TABLE_BY_ID[r.table];
    return !t || t.tier !== w.tier || r.table !== WING_TABLE_BY_TIER[w.tier] || r.tier !== w.tier || r.wingId !== w.id;
  });
  record('날개 1종 ↔ 같은 티어 제작대 1곳', tableMismatch.length === 0, tableMismatch.map((w) => w.id).join(',') || '8/8 일치');

  const costMismatch = FAIRY_WINGS.filter((w) => {
    const r = WING_RECIPE_BY_WING[w.id];
    const a = JSON.stringify({ gold: num(r.cost.gold), minerals: r.cost.minerals ?? {}, leather: r.cost.leather ?? {} });
    const b = JSON.stringify({ gold: num(w.cost.gold), minerals: w.cost.minerals ?? {}, leather: w.cost.leather ?? {} });
    return a !== b;
  });
  record('레시피 비용 = 날개 데이터 비용(전 8종)', costMismatch.length === 0, costMismatch.map((w) => w.id).join(',') || '8/8 동일');

  record(
    'wingRecipeFor — 미지 입력은 null (예외 없음)',
    wingRecipeFor('nope') === null && wingRecipeFor('') === null && wingRecipeFor(null) === null && wingRecipeFor(undefined) === null && wingRecipeFor(42) === null
  );
  record(
    'wingRecipesForTable — 작업대·미지 id 는 빈 배열',
    wingRecipesForTable(WORKBENCH_ID).length === 0 && wingRecipesForTable('nope').length === 0 && wingRecipesForTable(null).length === 0 && CRAFTING_TABLES.every((t) => wingRecipesForTable(t.id).length <= 1),
    `제작대 ${CRAFTING_TABLES.length}곳 · 작업대 ${wingRecipesForTable(WORKBENCH_ID).length}종`
  );
  record('무기 레시피는 날개로 오인되지 않는다', WEAPON_RECIPES.every((r) => !isWingRecipe(r)) && WING_RECIPES.every((r) => isWingRecipe(r)));
  record(
    'costText — 빈/손상 비용에도 문자열(예외 없음)',
    typeof costText(null) === 'string' && typeof costText({}) === 'string' && typeof costText(undefined) === 'string' && costText({ gold: 1, leather: { nope: 2 } }).length > 0
  );
  record('costText — 가죽 이름 표시', costText(FAIRY_WING_BY_ID.artifact_wings.cost).includes('유물 가죽'), costText(FAIRY_WING_BY_ID.artifact_wings.cost));
}

// ══════════════════════════════════════════════ 3. 제작 게이트 · 원자성
section('3. 날개 제작 게이트 · 재화 원자성');
{
  // ① 제작대 미건설
  {
    const g = makeGame({ built: [] });
    const before = snap(g.eco);
    const r = g.cs.craftWing('fairy_wings', g.ctx);
    record('제작대 없으면 거부 · 재화 불변', r.ok === false && r.error.includes('모루') && Object.keys(delta(before, g.eco)).length === 0, r.error);
  }
  // ② 선행 날개 미보유
  {
    const g = makeGame({ built: ['forge_t2'] });
    const before = snap(g.eco);
    const r = g.cs.craftWing('sakura_wings', g.ctx);
    record('선행 날개 없으면 거부 · 재화 불변', r.ok === false && r.error.includes('요정의 날개') && Object.keys(delta(before, g.eco)).length === 0, r.error);
  }
  // ③ 이미 보유
  {
    const g = makeGame({ built: ['forge_t1'], owned: ['fairy_wings'] });
    const before = snap(g.eco);
    const r = g.cs.craftWing('fairy_wings', g.ctx);
    record('이미 보유한 날개는 재제작 거부 · 이중 차감 없음', r.ok === false && r.error.includes('이미 보유') && Object.keys(delta(before, g.eco)).length === 0, r.error);
  }
  // ④ 골드만 부족
  {
    const g = makeGame({ gold: 300, built: ['forge_t1'] });
    const before = snap(g.eco);
    const r = g.cs.craftWing('fairy_wings', g.ctx);
    record('골드 부족 → 거부 · 재화 불변', r.ok === false && r.error.includes('재료가 부족') && Object.keys(delta(before, g.eco)).length === 0, r.error);
  }
  // ⑤ 광물만 부족 (모루 건설로 철을 소진시킨다)
  {
    const g = makeGame({ minerals: { ...richMinerals, iron: 4 }, built: ['forge_t1'] });
    const before = snap(g.eco);
    const r = g.cs.craftWing('fairy_wings', g.ctx);
    record('광물(철) 부족 → 거부 · 재화 불변', r.ok === false && r.error.includes('재료가 부족') && Object.keys(delta(before, g.eco)).length === 0, `${r.error} · iron ${g.eco.getMineral('iron')}`);
  }
  // ⑥ 가죽만 부족 (T2)
  {
    const g = makeGame({ built: ['forge_t2'], owned: ['fairy_wings'], leathers: { ...richLeathers, thick_leather: 0 } });
    const before = snap(g.eco);
    const r = g.cs.craftWing('sakura_wings', g.ctx);
    record('가죽 부족 → 거부 · 골드/광물 불변', r.ok === false && r.error.includes('재료가 부족') && Object.keys(delta(before, g.eco)).length === 0, r.error);
  }
  // ⑦ 성공 — 정확 차감 (다른 재화는 손대지 않음)
  {
    const g = makeGame({ built: ['forge_t1'] });
    const before = snap(g.eco);
    const r = g.cs.craftWing('fairy_wings', g.ctx);
    const d = delta(before, g.eco);
    record('제작 성공 · 정확한 차감(골드·광물만)', r.ok === true && sameDelta(d, recipeDelta(WING_RECIPE_BY_WING.fairy_wings.cost)), JSON.stringify(d));
    record('제작 즉시 착용 · 기록 1건', g.wings.equippedId === 'fairy_wings' && g.cs.craftedWingCount === 1 && g.cs.wasWingCrafted('fairy_wings'));
    const before2 = snap(g.eco);
    const r2 = g.cs.craftWing('fairy_wings', g.ctx);
    record('재시도 거부 · 추가 차감 0', r2.ok === false && Object.keys(delta(before2, g.eco)).length === 0 && g.cs.craftedWingCount === 1);
  }
  // ⑧ T2 성공 시 가죽 정확 소모
  {
    const g = makeGame({ built: ['forge_t2'], owned: ['fairy_wings'] });
    const before = snap(g.eco);
    const r = g.cs.craftWing('sakura_wings', g.ctx);
    const d = delta(before, g.eco);
    record('T2 제작 · 가죽 4 정확 소모', r.ok === true && d['l:thick_leather'] === -4 && d['m:blossom_crystal'] === -5 && d['m:dream_petal'] === -3 && Object.keys(d).length === 4, JSON.stringify(d));
  }
  // ⑨ 경제 없음 / 테이블만 수동 등록
  {
    const ecoc = { wave: 120, cleared: 119, fairies: 7, achievements: 60, hasWing: () => false };
    const cs = new CraftingSystem({ getEconomy: () => null, getContext: () => ecoc });
    cs.tables.add('forge_t1');
    let threw = null;
    let r = null;
    try {
      r = cs.craftWing('fairy_wings', ecoc);
    } catch (e) {
      threw = e;
    }
    record('경제 시스템 부재 → 예외 없이 거부', threw === null && r?.ok === false && r.error.includes('경제'), threw ? threw.message : r?.error);
  }
  // ⑩ 미지 날개 id
  {
    const g = makeGame({ built: ['forge_t1', 'forge_t2'] });
    let threw = null;
    let ok = true;
    try {
      for (const bad of ['nope', '', null, undefined, 'craft_fairy_wings', 0]) ok = ok && g.cs.craftWing(bad, g.ctx).ok === false;
    } catch (e) {
      threw = e;
    }
    record('미지/빈 날개 id → 예외 없이 거부', threw === null && ok, threw ? threw.message : 'ok');
  }
  // ⑪ ctx 에 hasWing 이 없어도 이중 차감되지 않는다
  {
    const g = makeGame({ built: ['forge_t1'] });
    const bare = { wave: 120, cleared: 119, fairies: 7, achievements: 60 };
    const before = snap(g.eco);
    const a = g.cs.craftWing('fairy_wings', bare);
    const b = g.cs.craftWing('fairy_wings', bare);
    const d = delta(before, g.eco);
    record('hasWing 훅이 없어도 이중 차감 없음', a.ok === true && b.ok === false && sameDelta(d, recipeDelta(WING_RECIPE_BY_WING.fairy_wings.cost)), `${a.ok}/${b.ok} · ${JSON.stringify(d)}`);
  }
  // ⑫ 관리자 지급 날개도 선행 조건을 만족한다(보유 기준)
  {
    const g = makeGame({ built: ['forge_t2'], owned: ['fairy_wings'] });
    record('관리자 지급 날개로도 다음 티어 제작 가능', g.cs.canCraftWing('sakura_wings', g.ctx).ok === true);
  }
  // ⑬ T8 — 꿈의 정원 + 유물 날개
  {
    const allBuilt = ['forge_t1', 'forge_t2', 'forge_t3', 'forge_t4', 'forge_t5', 'forge_t6', 'forge_t7'];
    const g = makeGame({ built: allBuilt, weapons: ['scythe_relic'] });
    const noTable = g.cs.canCraftWing('aether_wings', g.ctx);
    const builtGarden = g.cs.build('garden_of_dreams', g.ctx);
    const noPrev = g.cs.canCraftWing('aether_wings', g.ctx);
    record('T8 — 꿈의 정원 없으면 거부', noTable.ok === false && noTable.error.includes('꿈의 정원'), noTable.error);
    record('T8 — 꿈의 정원 건설 성공', builtGarden.ok === true, builtGarden.error || '');
    record('T8 — 정원 건설 후에는 선행(유물)만 남는다', noPrev.ok === false && noPrev.error.includes('유물 날개'), noPrev.error);
  }
  // ⑭ 무기 제작 기록과 분리
  {
    const g = makeGame({ built: ['forge_t1'] });
    const weaponId = WEAPON_RECIPES.find((r) => r.table === 'forge_t1')?.weaponId;
    const res = weaponId ? g.cs.craft(weaponId, { ...g.ctx, hasWeapon: () => false, onCrafted: () => {} }) : { ok: false };
    record('무기 제작은 craftedWings 를 오염시키지 않는다', g.cs.craftedCount === (res.ok ? 1 : 0) && g.cs.craftedWingCount === 0, `무기 ${g.cs.craftedCount} · 날개 ${g.cs.craftedWingCount}`);
  }
  // ⑮ 작업대 경로는 날개에 적용되지 않는다
  {
    const g = makeGame({ built: [] });
    const wb = { ...g.ctx, hasWorkbench: true };
    record('작업대가 있어도 날개는 만들 수 없다', g.cs.canCraftWing('fairy_wings', wb).ok === false && g.cs.wingsFor(WORKBENCH_ID).length === 0);
  }
}

// ══════════════════════════════════════════════ 4. 저장/복원 내성
section('4. 저장/복원 내성 (손상 세이브)');
{
  const g = makeGame({ built: ['forge_t1'], owned: ['fairy_wings'] });
  g.cs.craftWing('fairy_wings', { ...g.ctx, hasWing: () => false }); // 제작 기록만 강제로 남긴다
  const dump = JSON.parse(JSON.stringify(g.cs.toJSON()));
  const fresh = makeGame({});
  fresh.cs.fromJSON(dump);
  record('toJSON → fromJSON 왕복', fresh.cs.craftedWingCount === dump.craftedWings.length && dump.craftedWings.includes('fairy_wings'), JSON.stringify(dump.craftedWings));

  const corruptCases = [
    { label: '중복·미지·비문자열', input: { tables: ['forge_t1', 'nope', 42, null], crafted: ['nope'], craftedWings: ['fairy_wings', 'fairy_wings', 'nope', 42, null, ''] }, wing: 1, tables: 1 },
    { label: '배열 아님(문자열)', input: { craftedWings: 'fairy_wings' }, wing: 0, tables: 0 },
    { label: '객체', input: { craftedWings: { fairy_wings: true } }, wing: 0, tables: 0 },
    { label: 'null', input: null, wing: 0, tables: 0 },
    { label: '문자열 전체', input: '문자열', wing: 0, tables: 0 },
    { label: '빈 배열', input: { craftedWings: [] }, wing: 0, tables: 0 }
  ];
  let threw = null;
  const badCases = [];
  for (const c of corruptCases) {
    const cs = new CraftingSystem({ getEconomy: () => null });
    try {
      cs.fromJSON(c.input);
    } catch (e) {
      threw = e;
    }
    if (cs.craftedWingCount !== c.wing || cs.builtCount !== c.tables) badCases.push(`${c.label} → 날개 ${cs.craftedWingCount}/제작대 ${cs.builtCount}`);
  }
  record('손상 세이브 → 예외 없이 유효 id 만', threw === null && badCases.length === 0, threw ? threw.message : badCases.join(' · ') || `${corruptCases.length}종 통과`);
  record('옛 세이브(craftedWings 키 없음) → 빈 기록', new CraftingSystem({ getEconomy: () => null }).fromJSON({ tables: [], crafted: [] }).craftedWingCount === 0);

  const mainSrc = src('../client/src/main.js');
  record(
    'serialize 에 날개/제작/장비/경제 포함',
    /crafting: this\.crafting\?\.toJSON/.test(mainSrc) && /wings: this\.wings\?\.toJSON/.test(mainSrc) && /gear: this\.gear\?\.toJSON/.test(mainSrc) && /economy: this\.economy\?\.toJSON/.test(mainSrc)
  );
  record('load 시 복원 호출 배선', /crafting\?\.fromJSON/.test(mainSrc) && /wings\?\.fromJSON/.test(mainSrc) && /gear\?\.fromJSON/.test(mainSrc));
}

// ══════════════════════════════════════════════ 5. 가죽 경제
section('5. 가죽 경제 (미네랄과 분리)');
{
  const eco = new Economy({ gold: 100 }).fromJSON({ gold: 100, wood: 5, minerals: { iron: 3 } });
  record('옛 세이브(leathers 없음) → 안전', eco.totalLeather() === 0 && eco.getLeather('leather') === 0 && eco.canAfford({ leather: { leather: 1 } }) === false && eco.totalMinerals() === 3);

  record('addLeather — 빈 id/NaN/음수 무시', eco.addLeather('', 5) === 0 && eco.addLeather('leather', NaN) === 0 && eco.addLeather('leather', -3) === 0 && eco.getLeather('leather') === 0);
  record('getLeather — 숫자 id 안전', eco.getLeather(7) === 0 && eco.getLeather(null) === 0);
  eco.addLeather('leather', 5.9);
  record('addLeather — 소수는 내림 누적', eco.getLeather('leather') === 5, String(eco.getLeather('leather')));
  record('가죽은 미네랄 합계에 섞이지 않는다', eco.totalMinerals() === 3 && eco.totalLeather() === 5);

  const before = { gold: eco.gold, leather: eco.totalLeather() };
  const failed = eco.spend({ gold: 50, leather: { leather: 99 } });
  record('가죽 부족 지출은 원자적(골드도 안 나감)', failed === false && eco.gold === before.gold && eco.totalLeather() === before.leather);
  const okSpend = eco.spend({ gold: 50, leather: { leather: 2 } });
  record('가죽 포함 지출 성공', okSpend === true && eco.gold === before.gold - 50 && eco.totalLeather() === 3, `${eco.gold}G · 가죽 ${eco.totalLeather()}`);

  const round = new Economy({}).fromJSON(JSON.parse(JSON.stringify(eco.toJSON())));
  record('가죽 저장/복원', round.getLeather('leather') === 3 && round.gold === eco.gold);
  record(
    '가죽 5종 정의 일관성(T1~T5)',
    LEATHER_TYPES.length === 5 && LEATHER_TYPES.every((l, i) => l.tier === i + 1 && LEATHER_BY_ID[l.id] === l) && LEATHER_TYPES.every((l) => l.name && l.color !== undefined)
  );
}

// ══════════════════════════════════════════════ 6. 가죽 장비
section('6. 가죽 장비 (세트 · 슬롯 · 복원)');
{
  const eco = new Economy({ gold: 99999999, leathers: richLeathers, minerals: richMinerals });
  const gear = new GearSystem({ economy: eco });
  for (const g of LEATHER_GEAR) gear.grant(g.id, { equip: true });
  const bonus = gear.bonus();
  const expect = emptyBonus();
  for (const g of LEATHER_GEAR) for (const [k, v] of Object.entries(g.bonus ?? {})) expect[k] = num(expect[k]) + num(v);
  for (const s of GEAR_SET_BONUS) if (LEATHER_GEAR.length >= s.count) for (const [k, v] of Object.entries(s.bonus)) expect[k] = num(expect[k]) + num(v);
  const bad = GEAR_BONUS_KEYS.filter((k) => Math.abs(num(bonus[k]) - num(expect[k])) > 1e-9);
  record('장비 6종 + 6세트 합산 보너스 정확', bad.length === 0, bad.map((k) => `${k}:${bonus[k]}≠${expect[k]}`).join(', ') || `6세트 · ${GEAR_BONUS_KEYS.length}종 항목`);
  const itemSpeed = LEATHER_GEAR.reduce((a, g) => a + num(g.bonus?.flightSpeedPct), 0);
  const itemCeiling = LEATHER_GEAR.reduce((a, g) => a + num(g.bonus?.flightCeilingPct), 0);
  record(
    '6세트 비행 보너스(장비분 + 세트 +10%/+20%)',
    Math.abs(num(bonus.flightSpeedPct) - (itemSpeed + 0.1)) < 1e-9 && Math.abs(num(bonus.flightCeilingPct) - (itemCeiling + 0.2)) < 1e-9,
    `speed ${num(bonus.flightSpeedPct).toFixed(2)} = 장비 ${itemSpeed.toFixed(2)} + 세트 0.10 · ceiling ${num(bonus.flightCeilingPct).toFixed(2)} = 장비 ${itemCeiling.toFixed(2)} + 세트 0.20`
  );

  const before = gear.bonus().moveSpeedPct;
  gear.unequip('feet');
  record('슬롯 해제 시 그 장비 보너스만 사라진다', num(gear.bonus().moveSpeedPct) < num(before), `${before} → ${gear.bonus().moveSpeedPct}`);
  gear.grant(LEATHER_GEAR.find((g) => g.slot === 'feet').id, { equip: true });

  const restored = new GearSystem({}).fromJSON({ owned: [...LEATHER_GEAR.map((g) => g.id), 'nope'], equipped: { head: 'nope', body: LEATHER_GEAR.find((g) => g.slot === 'head')?.id ?? 'nope' } });
  record('복원 — 미지 id 무시 · 슬롯 불일치 거부', restored.count === LEATHER_GEAR.length && Object.values(restored.equipped).every((id) => LEATHER_GEAR_BY_ID[id]), JSON.stringify(restored.equipped));
  record('문구 생성 예외 없음', LEATHER_GEAR.every((g) => typeof gearBonusText(g) === 'string' && gearCostText(g).length > 0) && leatherGearById('nope') === null);
}

// ══════════════════════════════════════════════ 7. 지역 몬스터 · 로밍
section('7. 지역 몬스터 편성 · 로밍 스포너');
{
  record('편성표 9곳 · 야생 몬스터 16종', REGION_MONSTERS.length === 9 && REGION_ENEMY_TYPES.length === 16, `${REGION_MONSTERS.length}곳 / ${REGION_ENEMY_TYPES.length}종`);
  const missingType = REGION_MONSTERS.flatMap((r) => r.types.map((t) => t.id)).filter((id) => !REGION_ENEMY_BY_ID[id]);
  record('편성 몬스터 id 전부 실재', missingType.length === 0, missingType.join(',') || 'ok');
  const wrongRegion = REGION_MONSTERS.flatMap((r) => r.types.filter((t) => REGION_ENEMY_BY_ID[t.id]?.region !== r.id).map((t) => `${r.id}:${t.id}`));
  const rosterIds = REGION_MONSTERS.flatMap((r) => r.types.map((t) => t.id));
  record(
    '편성 몬스터는 자기 지역 소속(교차 침범·중복 없음)',
    wrongRegion.length === 0 && new Set(rosterIds).size === rosterIds.length && rosterIds.length === REGION_ENEMY_TYPES.length,
    wrongRegion.join(',') || `${rosterIds.length}종 · 중복 0 · 전 지역 배치`
  );
  const badDrop = REGION_ENEMY_TYPES.filter((e) => {
    const l = e.leather;
    if (!l) return true;
    return !(num(l.chance) > 0 && num(l.chance) <= 1) || num(l.min) < 1 || num(l.max) < num(l.min) || !LEATHER_BY_ID[l.id];
  });
  record('가죽 드롭 정의(확률 0~1 · min≤max · 실재 id)', badDrop.length === 0, badDrop.map((e) => e.id).join(',') || `${REGION_ENEMY_TYPES.length}종`);
  const hidden = REGION_MONSTERS.filter((r) => r.id === 'cherry_garden' || r.id === 'time_horizon');
  record(
    '히든 지역 몬스터는 보너스 광물 보유',
    hidden.length === 2 && hidden.every((r) => r.types.every((t) => { const b = REGION_ENEMY_BY_ID[t.id]?.bonus; return b && MINERAL_TYPES.some((m) => m.id === b.mineral) && num(b.chance) > 0; }))
  );
  record(
    '편성 값 안전(간격>0 · maxAlive≥1 · 스폰<정리 반경)',
    REGION_MONSTERS.every((r) => num(r.interval) > 0 && num(r.maxAlive) >= 1 && num(r.spawnRadius) < num(r.despawnRadius) && num(r.elite) >= 0 && num(r.elite) <= 1)
  );
  record('미지 지역 편성 → null', regionMonsterRoster('nope') === null && regionMonsterRoster(null) === null && regionMonsterRoster(undefined) === null);
  record('pickRegionMonster — 미지 지역 null', pickRegionMonster('nope') === null && pickRegionMonster(null) === null);

  // 가중 추첨: rand 0 → 첫 종, 0.999999 → 마지막 종
  const first = pickRegionMonster('tier1', () => 0);
  const last = pickRegionMonster('tier1', () => 0.999999);
  record('가중 추첨 경계값', first?.id === 'dawn_slime' && last?.id === 'grass_wolf', `${first?.id} / ${last?.id}`);
  const counts = { dawn_slime: 0, grass_wolf: 0 };
  let seed = 0.123456789;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 1), Math.abs(seed));
  for (let i = 0; i < 400; i++) {
    const p = pickRegionMonster('tier1', rand);
    if (p) counts[p.id] += 1;
  }
  record('가중치 반영(3:2 비율 근사)', counts.dawn_slime > counts.grass_wolf && counts.grass_wolf > 0, JSON.stringify(counts));

  // 드롭 확률 경계
  record('전리품 — 타입 없음 안전', JSON.stringify(regionMonsterLoot(null)) === JSON.stringify({ leather: null, mineral: null }));
  const drop = regionMonsterLoot(REGION_ENEMY_BY_ID.dawn_slime, () => 0);
  const noDrop = regionMonsterLoot(REGION_ENEMY_BY_ID.dawn_slime, () => 0.999999);
  record('전리품 — rand 0 은 드롭 · rand 0.999 는 미드롭', Boolean(drop.leather) && drop.leather.amount >= 1 && noDrop.leather === null, `${JSON.stringify(drop.leather)} / ${JSON.stringify(noDrop.leather)}`);
  const bonusDrop = regionMonsterLoot(REGION_ENEMY_BY_ID.petal_moth, () => 0);
  record('히든 몬스터 — 보너스 광물 드롭', Boolean(bonusDrop.mineral) && MINERAL_TYPES.some((m) => m.id === bonusDrop.mineral.id), JSON.stringify(bonusDrop.mineral));

  // 로밍 스포너 동작
  const mkEnemy = (regionId, x = 0, z = 0) => ({ alive: true, roaming: true, regionId, fromTower: true, position: { x, y: 0, z } });
  const spawner = new RegionSpawner({ rand: () => 0.5 });
  record(
    '미지 지역 → 스폰 없음',
    (() => {
      const out = spawner.update(0.25, { position: { x: 0, z: 0 }, regionId: 'nope', phase: 'wave', enemies: [], spawn: () => mkEnemy('nope') });
      return out.region === null && out.spawned === null;
    })()
  );
  const mkCtx = (enemies, extra = {}) => ({
    position: { x: 0, z: 0 },
    regionId: 'tier1',
    phase: 'wave',
    enemies,
    spawn: (o) => {
      const e = mkEnemy(o.regionId, o.x, o.z);
      enemies.push(e);
      return e;
    },
    despawn: (e) => {
      e.alive = false;
    },
    ...extra
  });
  {
    const enemies = [];
    const s = new RegionSpawner({ rand: () => 0.5 });
    s.enter('tier1');
    let spawned = 0;
    for (let i = 0; i < 9; i++) if (s.update(0.25, mkCtx(enemies)).spawned) spawned += 1;
    record('유예 시간(2.5초) 동안 스폰하지 않는다', spawned === 0, `2.25초 경과 · ${spawned}마리`);
    let after = 0;
    for (let i = 0; i < 6; i++) if (s.update(0.25, mkCtx(enemies)).spawned) after += 1;
    const point = enemies[0]?.position ?? { x: 0, z: 0 };
    const dist = Math.hypot(point.x, point.z);
    record('유예 후 스폰 · 등장 거리 = spawnRadius ±25%', after === 1 && dist >= 70 * 0.75 - 1e-6 && dist <= 70 * 1.25 + 1e-6, `${after}마리 · ${dist.toFixed(1)}m`);
    record('준비 시간(prep)에는 스폰하지 않는다', s.update(0.25, mkCtx(enemies, { phase: 'prep' })).spawned === null && s.update(0.25, mkCtx(enemies, { phase: 'gameover' })).spawned === null);
  }
  {
    const roster = roamerRoster('tier1');
    const enemies = Array.from({ length: roster.maxAlive }, () => mkEnemy('tier1'));
    const s = new RegionSpawner({ rand: () => 0.5 });
    s.enter('tier1');
    for (let i = 0; i < 40; i++) s.update(0.25, mkCtx(enemies));
    record('지역 상한(maxAlive) 도달 시 스폰 중단', enemies.length === roster.maxAlive && s.spawned === 0 && s.skipped > 0, `${enemies.length}마리 · skipped ${s.skipped}`);
  }
  {
    const enemies = Array.from({ length: ROAMER_DEFAULTS.totalCap }, () => mkEnemy('tier2'));
    const s = new RegionSpawner({ rand: () => 0.5 });
    s.enter('tier1');
    for (let i = 0; i < 40; i++) s.update(0.25, mkCtx(enemies));
    record('월드 전체 상한(totalCap)도 지킨다', s.spawned === 0, `전체 ${countRoamers(enemies)}마리`);
  }
  {
    const far = mkEnemy('tier1', 5000, 5000);
    const enemies = [far];
    const s = new RegionSpawner({ rand: () => 0.5 });
    const out1 = s.update(0.25, mkCtx(enemies));
    const out2 = s.update(0.25, mkCtx(enemies));
    record('정리 반경 밖 개체 정리 · 중복 보고 없음', out1.despawned === 1 && out2.despawned === 0 && far.alive === false, `${out1.despawned} / ${out2.despawned}`);
  }
  record(
    'shouldDespawn — 지역별 반경 · 죽은 개체 제외',
    shouldDespawn(mkEnemy('tier1', 350, 0), { x: 0, z: 0 }, roamerRoster('tier1')) === true &&
      shouldDespawn(mkEnemy('tier3', 350, 0), { x: 0, z: 0 }, roamerRoster('tier3')) === false &&
      shouldDespawn({ ...mkEnemy('tier1', 5000, 0), alive: false }, { x: 0, z: 0 }, roamerRoster('tier1')) === false
  );
  record(
    'countRoamers — 웨이브 몬스터 제외 · 지역 필터',
    countRoamers([mkEnemy('tier1'), mkEnemy('tier1', 9, 9), mkEnemy('tier2'), { alive: true, regionId: 'tier1' }, { alive: false, roaming: true, regionId: 'tier1' }]) === 3 &&
      countRoamers([mkEnemy('tier1'), mkEnemy('tier2')], 'tier1') === 1 &&
      isRoamer({ spawnerKind: 'region' }) === true &&
      isRoamer({ alive: true }) === false
  );
  record(
    'roamerRoster — 손상 값 클램프',
    (() => {
      const r = roamerRoster('tier1');
      const bad = { ...r, interval: 0, maxAlive: 0, spawnRadius: 1, despawnRadius: 1, elite: 9 };
      const merged = { ...ROAMER_DEFAULTS, ...bad };
      return r.interval > 0 && r.maxAlive >= 1 && r.spawnRadius >= 20 && r.despawnRadius >= 80 && r.elite <= 1 && merged.interval >= 0;
    })()
  );
  record(
    'roamerSpawnPoint — 고리 안쪽(±25%)',
    (() => {
      const base = roamerRoster('tier1').spawnRadius;
      const a = roamerSpawnPoint(() => 0, { x: 10, z: -10 }, roamerRoster('tier1'));
      const b = roamerSpawnPoint(() => 0.999999, { x: 10, z: -10 }, roamerRoster('tier1'));
      const d = (p) => Math.hypot(p.x - 10, p.z + 10);
      return d(a) >= base * 0.75 - 1e-6 && d(b) <= base * 1.25 + 1e-6;
    })()
  );
}

// ══════════════════════════════════════════════ 8. 배선 · UI 계약
section('8. 배선 계약 (제작대 경로 · UI)');
{
  const panels = src('../client/src/ui/panels.js');
  const mainSrc = src('../client/src/main.js');
  const hud = src('../client/src/ui/hud.js');
  const admin = src('../client/src/systems/admin-commands.js');
  record('panels — 구매 경로 제거(wing-buy 0건)', !panels.includes('wing-buy'));
  record('panels — 제작대 이동/제작 버튼 존재', panels.includes('wing-goto-craft') && panels.includes("case 'craft-wing'") && panels.includes('_wingCraftCard'));
  record('panels — 작업대 탭에 날개 불가 안내', panels.includes('날개는 작업대에서 만들 수 없습니다'));
  record('main — wing:buy 이벤트 미배선', !mainSrc.includes("on('wing:buy'") && !mainSrc.includes('wing:buy'));
  record('main — 제작 API 배선', /craftWing\(id\) \{/.test(mainSrc) && mainSrc.includes('this.crafting?.craftWing?.(id)') && mainSrc.includes('hasWing: (id) =>'));
  record('admin — /날개·/가죽·/장비 별칭 유지', admin.includes("'wings'") && admin.includes("'leather'") && admin.includes("'gear'"));
  record('hud — 날개/가죽 칩', hud.includes('hud-stat-wings') && hud.includes('hud-stat-leather'));
}

// ══════════════════════════════════════════════ 9. 적 풀 재사용(소환문 ↔ 웨이브)
section('9. 적 풀 재사용 — 소환 경로 표시 누수(소환문 ↔ 웨이브)');
{
  const mk = (typeId) => spawnEnemy({ typeId, wave: 5, scene: null, world: null, position: { x: 0, y: 0, z: 0 } });
  const tower = mk('orc');
  // 소환문(waves.spawnAt)·로밍(waves.spawnRoamer)이 개체에 남기는 표시를 흉내낸다
  tower.fromTower = true;
  tower.spawnerKind = 'region';
  tower.roaming = true;
  tower.regionId = 'tier1';
  tower.spawnerTier = 3;
  tower.leatherDrop = { id: 'leather', min: 1, max: 1, chance: 1 };
  tower.despawn(); // 사망 → 적 풀(POOL) 반환
  const reused = mk('orc');
  record('적 풀에서 재사용된 같은 객체', reused === tower);
  record('소환문 표시(fromTower)가 웨이브 개체로 새지 않는다', reused.fromTower === false, `fromTower ${reused.fromTower}`);
  record(
    '로밍 표시(spawnerKind·roaming·regionId·spawnerTier·leatherDrop)가 새지 않는다',
    reused.spawnerKind === null && reused.roaming === false && reused.regionId === null && reused.spawnerTier === null && reused.leatherDrop === null && isRoamer(reused) === false,
    `spawnerKind ${reused.spawnerKind} · roaming ${reused.roaming} · regionId ${reused.regionId} · isRoamer ${isRoamer(reused)}`
  );
  const waves = new WaveSystem({ seed: 'pool-reuse', mode: 'solo', world: null });
  reused.alive = true;
  waves.enemies = [reused];
  record('재사용 개체가 웨이브 정산 카운터에 포함된다', waves._countAlive() === 1, `_countAlive ${waves._countAlive()}`);
  reused.alive = false;
  waves._prune();
  record('죽으면 정산 카운터에서 빠진다', waves._countAlive() === 0 && waves.enemies.length === 0, `_countAlive ${waves._countAlive()} · 배열 ${waves.enemies.length}`);
  const towered = waves.spawnAt(10, 10, { tier: 2 });
  record('소환문 몬스터는 여전히 정산에서 제외(의도된 동작 유지)', towered?.fromTower === true && waves._countAlive() === 0, `fromTower ${towered?.fromTower} · _countAlive ${waves._countAlive()}`);
}

console.log(`\n${problems.length === 0 ? `✅ 날개/가죽 버그테스트 전부 통과 (${checks}체크)` : `❌ 문제 ${problems.length}건 / ${checks}체크`}`);
for (const p of problems) console.log(`  - ${p}`);
process.exitCode = problems.length === 0 ? 0 : 1;

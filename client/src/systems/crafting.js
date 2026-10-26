// 요새의 수호자 — 제작 시스템(순수 로직). Three.js / DOM 을 쓰지 않는다.
// 계약: 제작대를 건설해야 그 티어의 무기를 제작할 수 있다. 비용은 economy 가 처리한다.
import {
  CRAFTING_TABLES,
  CRAFTING_TABLE_BY_ID,
  RECIPES_BY_TABLE,
  recipeForWeapon,
  tableUnlockText,
  WORKBENCH_ID,
  workbenchRecipeFor,
  WING_RECIPES,
  WING_RECIPE_BY_WING,
  wingRecipeFor,
  wingRecipesForTable,
  ARROW_RECIPE_BY_ARROW,
  arrowRecipesForTable,
  PORTAL_RECIPES,
  PORTAL_RECIPE_BY_DEST
} from '../crafting.js';
import { ARROW_BY_ID, FAIRY_WING_BY_ID, WEAPON_BY_ID } from '../data.js';

/** 목적격 조사(을/를) — 받침이 있으면 '을', 없으면 '를' */
function objectParticle(word) {
  const s = String(word ?? '');
  const code = s.charCodeAt(s.length - 1);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return '를';
  return (code - 0xac00) % 28 === 0 ? '를' : '을';
}

export class CraftingSystem {
  constructor({ getEconomy = null, getContext = null } = {}) {
    this._getEconomy = typeof getEconomy === 'function' ? getEconomy : () => null;
    this._getContext = typeof getContext === 'function' ? getContext : () => ({});
    this.tables = new Set();
    this.crafted = new Set();
    // 제작대로 만든 날개(무기 제작 기록과 분리해 센다)
    this.craftedWings = new Set();
    /** @type {Record<string, number>} 화살 묶음 제작 횟수 (arrowId -> 묶음 수) */
    this.arrowBatches = {};
    /** @type {Record<string, number>} 보유 포탈 아이템 (목적지 id -> 개수) */
    this.portalItems = {};
  }

  get economy() {
    return this._getEconomy();
  }

  get context() {
    return this._getContext() || {};
  }

  get tableCount() {
    return CRAFTING_TABLES.length;
  }

  get builtCount() {
    return this.tables.size;
  }

  get craftedCount() {
    return this.crafted.size;
  }

  get craftedWingCount() {
    return this.craftedWings.size;
  }

  /** 날개 제작 레시피 — 제작 패널이 그대로 쓴다 */
  get wingRecipes() {
    return WING_RECIPES;
  }

  table(id) {
    return CRAFTING_TABLE_BY_ID[id] || null;
  }

  recipesFor(id) {
    return RECIPES_BY_TABLE[id] || [];
  }

  get workbenchId() {
    return WORKBENCH_ID;
  }

  isBuilt(id) {
    return this.tables.has(id);
  }

  /** 해금 조건 — 웨이브 진행도 + 추가 조건(꿈의 정원) */
  isUnlocked(id, ctx = null) {
    const t = CRAFTING_TABLE_BY_ID[id];
    if (!t) return false;
    const c = ctx || this.context;
    const wave = Number(c.wave) || 1;
    const cleared = Number(c.cleared) || 0;
    const progress = Math.max(wave, cleared + 1);
    if ((t.unlockWave || 0) > progress) return false;
    const u = t.unlock || {};
    if (u.fairies && Number(c.fairies) < u.fairies) return false;
    if (u.achievements && Number(c.achievements) < u.achievements) return false;
    if (u.weapon && typeof c.hasWeapon === 'function' && !c.hasWeapon(u.weapon)) return false;
    return true;
  }

  /** 제작대 건설 — 티어별 해금 조건 + 건설 비용 */
  build(id, ctx = null) {
    const t = CRAFTING_TABLE_BY_ID[id];
    if (!t) return { ok: false, error: '알 수 없는 제작대입니다.' };
    if (this.isBuilt(id)) return { ok: false, error: '이미 건설한 제작대입니다.' };
    const c = ctx || this.context;
    if (!this.isUnlocked(id, c)) return { ok: false, error: `해금 조건이 필요합니다 — ${tableUnlockText(t)}` };
    const eco = this.economy;
    if (!eco || typeof eco.canAfford !== 'function') return { ok: false, error: '경제 시스템이 없습니다.' };
    if (!eco.canAfford(t.cost)) return { ok: false, error: '건설 재료가 부족합니다.' };
    if (!eco.spend(t.cost)) return { ok: false, error: '건설 재료가 부족합니다.' };
    this.tables.add(id);
    if (typeof c.onBuilt === 'function') c.onBuilt(id);
    return { ok: true, table: t };
  }

  /** 작업대(건설 시설)를 세웠는지 */
  hasWorkbench(ctx = null) {
    const c = ctx || this.context;
    return Boolean(c.hasWorkbench);
  }

  canCraft(weaponId, ctx = null) {
    const c = ctx || this.context;
    const owns = typeof c.hasWeapon === 'function' ? c.hasWeapon(weaponId) : false;
    if (owns) return { ok: false, error: '이미 보유한 무기입니다.' };
    const eco = this.economy;
    const afford = (cost) => Boolean(eco && typeof eco.canAfford === 'function' && eco.canAfford(cost));

    // ① 작업대가 있으면 모든 무기(꿈의 끝은 희망 제외)를 만들 수 있다.
    const bench = workbenchRecipeFor(weaponId);
    if (bench && this.hasWorkbench(c)) {
      if (!afford(bench.cost)) return { ok: false, error: '제작 재료가 부족합니다.' };
      return { ok: true, recipe: bench, via: 'workbench' };
    }

    // ② 티어 제작대 경로
    const recipe = recipeForWeapon(weaponId);
    if (recipe) {
      if (!this.isBuilt(recipe.table)) {
        const t = CRAFTING_TABLE_BY_ID[recipe.table];
        const name = t ? t.name : '제작대';
        return { ok: false, error: `${name}${objectParticle(name)} 먼저 건설해야 합니다.` };
      }
      if (!afford(recipe.cost)) return { ok: false, error: '제작 재료가 부족합니다.' };
      return { ok: true, recipe, via: 'table' };
    }

    if (!bench) return { ok: false, error: '작업대에서는 만들 수 없는 무기입니다.' };
    return { ok: false, error: '작업대를 먼저 건설해야 합니다. (건설 → 🏗 시설 → 🔨 작업대)' };
  }

  /** 무기 제작 — 재료를 소비하고 onCrafted 로 소유권을 넘긴다 */
  craft(weaponId, ctx = null) {
    const res = this.canCraft(weaponId, ctx);
    if (!res.ok) return res;
    const eco = this.economy;
    if (!eco.spend(res.recipe.cost)) return { ok: false, error: '제작 재료가 부족합니다.' };
    this.crafted.add(weaponId);
    if (res.via === 'workbench') this.workbenchCrafted = (this.workbenchCrafted || 0) + 1;
    const c = ctx || this.context;
    if (typeof c.onCrafted === 'function') c.onCrafted(weaponId);
    return { ok: true, weapon: WEAPON_BY_ID[weaponId] || null, recipe: res.recipe, via: res.via };
  }

  /**
   * 요정의 날개 제작 가능 판정 — 무기와 같은 제작대를 쓰지만 게이트가 다르다.
   *  ① 같은 티어 제작대를 건설했는가 ② 앞 티어 날개를 보유했는가 ③ 재료(골드·광물·가죽)가 있는가
   */
  canCraftWing(wingId, ctx = null) {
    const recipe = wingRecipeFor(wingId);
    if (!recipe) return { ok: false, error: '제작대에서 만들 수 없는 날개입니다.' };
    const c = ctx || this.context;
    const hasWing = typeof c.hasWing === 'function' ? c.hasWing : () => false;
    // 이미 만든 기록도 "보유"로 본다 — ctx 에 hasWing 훅이 없어도 재차감되지 않게 하는 이중 방어.
    if (hasWing(wingId) || this.craftedWings.has(wingId)) return { ok: false, error: '이미 보유한 날개입니다.' };
    if (!this.isBuilt(recipe.table)) {
      const t = CRAFTING_TABLE_BY_ID[recipe.table];
      const name = t ? t.name : '제작대';
      return { ok: false, error: `${name}${objectParticle(name)} 먼저 건설해야 합니다.` };
    }
    if (recipe.requires && !hasWing(recipe.requires)) {
      const prev = FAIRY_WING_BY_ID[recipe.requires];
      const name = prev ? prev.name : recipe.requires;
      return { ok: false, error: `${name}${objectParticle(name)} 먼저 만들어야 합니다.` };
    }
    const eco = this.economy;
    if (!eco || typeof eco.canAfford !== 'function') return { ok: false, error: '경제 시스템이 없습니다.' };
    if (!eco.canAfford(recipe.cost)) return { ok: false, error: '제작 재료가 부족합니다.' };
    return { ok: true, recipe, via: 'table' };
  }

  /** 날개 제작 — 재료를 소비하고 onWingCrafted 로 소유권을 넘긴다 */
  craftWing(wingId, ctx = null) {
    const res = this.canCraftWing(wingId, ctx);
    if (!res.ok) return res;
    const eco = this.economy;
    if (!eco.spend(res.recipe.cost)) return { ok: false, error: '제작 재료가 부족합니다.' };
    this.craftedWings.add(wingId);
    const c = ctx || this.context;
    if (typeof c.onWingCrafted === 'function') c.onWingCrafted(wingId);
    return { ok: true, wing: FAIRY_WING_BY_ID[wingId] || null, recipe: res.recipe, via: res.via };
  }

  /** 날개가 제작대에서 만들어졌는지 */
  wasWingCrafted(wingId) {
    return this.craftedWings.has(wingId);
  }

  /** 그 제작대에서 만들 수 있는 날개 레시피 */
  wingsFor(id) {
    return wingRecipesForTable(id);
  }

  /** 날개 레시피 조회 */
  wingRecipe(wingId) {
    return WING_RECIPE_BY_WING[wingId] || null;
  }

  /** 그 제작대에서 만들 수 있는 화살 레시피 */
  arrowsFor(id) {
    return arrowRecipesForTable(id);
  }

  /** 화살 레시피 조회 */
  arrowRecipe(arrowId) {
    return ARROW_RECIPE_BY_ARROW[String(arrowId ?? '')] || null;
  }

  /** 지금까지 만든 화살 묶음 수 */
  get arrowBatchCount() {
    return Object.values(this.arrowBatches).reduce((a, b) => a + (Number(b) || 0), 0);
  }

  /** 화살 묶음 제작 횟수(그 화살) */
  arrowBatchesOf(arrowId) {
    return Number(this.arrowBatches[String(arrowId ?? '')]) || 0;
  }

  /**
   * 화살 제작 가능 판정 — 무기와 같은 제작대를 쓰지만 게이트가 다르다(중복 보유 개념이 없다).
   *  ① 같은 티어 제작대를 건설했는가 ② 재료(골드·목재·광물)가 있는가
   */
  canCraftArrow(arrowId, ctx = null) {
    const recipe = this.arrowRecipe(arrowId);
    if (!recipe) return { ok: false, error: '제작대에서 만들 수 없는 화살입니다.' };
    if (!this.isBuilt(recipe.table)) {
      const t = CRAFTING_TABLE_BY_ID[recipe.table];
      const name = t ? t.name : '제작대';
      return { ok: false, error: name + objectParticle(name) + ' 먼저 건설해야 합니다.' };
    }
    const eco = this.economy;
    if (!eco || typeof eco.canAfford !== 'function') return { ok: false, error: '경제 시스템이 없습니다.' };
    if (!eco.canAfford(recipe.cost)) return { ok: false, error: '제작 재료가 부족합니다.' };
    return { ok: true, recipe, via: 'table' };
  }

  /** 포탈 레시피 — 제작 패널이 그대로 쓴다 */
  get portalRecipes() {
    return PORTAL_RECIPES;
  }

  /** 그 지형 포탈 아이템을 몇 개 가지고 있는가 */
  portalCount(dest) {
    return Math.max(0, Math.floor(Number(this.portalItems?.[dest]) || 0));
  }

  /** 보유 포탈 아이템 합계 */
  get portalCountTotal() {
    let n = 0;
    for (const dest of Object.keys(this.portalItems || {})) n += this.portalCount(dest);
    return n;
  }

  /** 포탈 아이템 제작 — 같은 제작대를 먼저 건설해야 한다 */
  craftPortal(dest, ctx = null) {
    const recipe = PORTAL_RECIPE_BY_DEST[dest];
    if (!recipe) return { ok: false, error: '알 수 없는 포탈입니다.' };
    const table = CRAFTING_TABLE_BY_ID[recipe.table];
    const tableName = table ? table.name : '제작대';
    if (!this.isBuilt(recipe.table)) {
      return { ok: false, error: tableName + objectParticle(tableName) + ' 먼저 건설해야 합니다.' };
    }
    const eco = this.economy;
    if (!eco || typeof eco.canAfford !== 'function') return { ok: false, error: '경제 시스템이 없습니다.' };
    if (!eco.canAfford(recipe.cost)) return { ok: false, error: '제작 재료가 부족합니다.' };
    if (!eco.spend(recipe.cost)) return { ok: false, error: '제작 재료가 부족합니다.' };
    this.portalItems[dest] = this.portalCount(dest) + 1;
    const c = ctx || this.context;
    if (typeof c.onPortalCrafted === 'function') c.onPortalCrafted(dest);
    return { ok: true, recipe, count: this.portalItems[dest] };
  }

  /** 설치할 때 아이템 1개를 소비한다 */
  takePortal(dest) {
    const n = this.portalCount(dest);
    if (n <= 0) return false;
    if (n === 1) delete this.portalItems[dest];
    else this.portalItems[dest] = n - 1;
    return true;
  }

  /** 화살 제작 — 재료를 소비하고 economy 원장에 묶음을 넣는다 */
  craftArrow(arrowId, ctx = null) {
    const res = this.canCraftArrow(arrowId, ctx);
    if (!res.ok) return res;
    const eco = this.economy;
    if (!eco || typeof eco.spend !== 'function') return { ok: false, error: '경제 시스템이 없습니다.' };
    if (!eco.spend(res.recipe.cost)) return { ok: false, error: '제작 재료가 부족합니다.' };
    const amount = Math.max(1, Math.floor(Number(res.recipe.amount) || 1));
    if (typeof eco.addArrow === 'function') eco.addArrow(arrowId, amount);
    this.arrowBatches[arrowId] = this.arrowBatchesOf(arrowId) + 1;
    const c = ctx || this.context;
    if (typeof c.onArrowCrafted === 'function') c.onArrowCrafted(arrowId, amount);
    return { ok: true, arrow: ARROW_BY_ID[arrowId] || null, amount, recipe: res.recipe, via: res.via };
  }

  toJSON() {
    return {
      tables: [...this.tables],
      crafted: [...this.crafted],
      craftedWings: [...this.craftedWings],
      arrowBatches: { ...this.arrowBatches },
      portalItems: { ...this.portalItems }
    };
  }

  fromJSON(o) {
    this.tables = new Set();
    this.crafted = new Set();
    this.craftedWings = new Set();
    this.arrowBatches = {};
    this.portalItems = {};
    if (o && Array.isArray(o.tables)) {
      for (const id of o.tables) if (CRAFTING_TABLE_BY_ID[id]) this.tables.add(id);
    }
    if (o && Array.isArray(o.crafted)) {
      for (const id of o.crafted) if (WEAPON_BY_ID[id]) this.crafted.add(id);
    }
    if (o && Array.isArray(o.craftedWings)) {
      for (const id of o.craftedWings) if (FAIRY_WING_BY_ID[id]) this.craftedWings.add(id);
    }
    if (o && o.arrowBatches && typeof o.arrowBatches === 'object') {
      for (const [id, n] of Object.entries(o.arrowBatches)) {
        if (!ARROW_BY_ID[id]) continue;
        const count = Math.floor(Number(n) || 0);
        if (count > 0) this.arrowBatches[id] = count;
      }
    }
    if (o && o.portalItems && typeof o.portalItems === 'object') {
      for (const [dest, n] of Object.entries(o.portalItems)) {
        if (!PORTAL_RECIPE_BY_DEST[dest]) continue;
        const count = Math.floor(Number(n) || 0);
        if (count > 0) this.portalItems[dest] = count;
      }
    }
    return this;
  }
}

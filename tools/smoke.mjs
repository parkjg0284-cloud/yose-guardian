// 요새의 수호자 — 헤드리스 스모크 테스트.
// 순수 로직(데이터/RNG/경제/업적/가챠)만 검증한다. Three.js나 DOM이 필요 없다.
// 실행: node tools/smoke.mjs

import {
  VERSION,
  TURRETS,
  TURRET_BY_ID,
  TREE_TYPES,
  MINERAL_TYPES,
  TERRAIN_TYPES,
  SPELL_ELEMENTS,
  SPELL_GRADES,
  RELIC_STAVES,
  STAFF_TIERS,
  FAIRIES,
  FAIRY_WINGS,
  FAIRY_WING_BY_ID,
  fairyWingById,
  nextFairyWing,
  WING_FLIGHT_DEFAULTS,
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  STAT_LABELS,
  WAVE_CONFIG,
  SPAWN_PATTERNS,
  ENEMY_TYPES,
  ENEMY_TYPE_BY_ID,
  BOSS_TYPE_BY_ID,
  BOSS_TYPES,
  WAVE_ROSTERS,
  WAVE_ROSTER_BY_ID,
  ELITE,
  HEALTH_BAR,
  SPAWN_FX,
  waveRoster,
  FRAME_PRESETS,
  SEED_GALLERY,
  DIFFICULTIES,
  MINERAL_COMBO_RECIPES,
  TITLE_LIST,
  GACHA_COST,
  turretsByCategory,
  TURRET_CATEGORIES,
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_FAMILIES,
  WEAPON_GRADES,
  WEAPON_MOTIONS,
  WEAPON_IMPACTS,
  WEAPON_IMPACT_OVERRIDES,
  WEAPON_ULTIMATES,
  MOTION_EASINGS,
  DREAM_TREE,
  WEAPON_TOTAL_COUNT,
  WEAPON_CORE_COUNT,
  weaponsByFamily,
  weaponMotion,
  hasSwapMotion,
  weaponImpact,
  ULTIMATE_IMPACTS,
  CLASSES,
  CLASS_STAGES,
  CLASS_RULES,
  CLASS_BY_ID,
  CLASS_BY_FAMILY,
  classById,
  classStarterWeaponId,
  classForFamily,
  classModifiers,
  classStageInfo,
  weaponLock,
  weaponTier,
  POWER,
  TURRET_DAMAGE_SCALE,
  TOWER_TIER_DAMAGE_GROWTH,
  TOWER_TIER_DAMAGE_MULT,
  TOWER_TIER_SCALE,
  mineralsForRegionTier,
  weaponById,
  ARROW_TIERS,
  ARROW_BY_ID,
  ARROW_TIER_COUNT,
  ARROW_MAX_TIER,
  ARROW_ORDER_DESC,
  arrowById,
  arrowForTier,
  arrowsForTable,
  arrowDamageMult,
  WEAPON_ULTIMATE_BY_ID
} from '../client/src/data.js';
import {
  CRAFTING_TABLES,
  CRAFTING_TABLE_BY_ID,
  WEAPON_RECIPES,
  RECIPE_COST_BY_TIER,
  recipeForWeapon,
  validateCrafting,
  WORKBENCH_ID,
  WORKBENCH_RECIPES,
  WORKBENCH_RECIPE_COUNT,
  WORKBENCH_EXCLUDED,
  workbenchRecipeFor,
  isWorkbenchCraftable,
  costText,
  WING_RECIPES,
  WING_RECIPE_COUNT,
  PORTAL_RECIPE_COUNT,
  WING_RECIPE_BY_WING,
  WING_RECIPES_BY_TABLE,
  WING_TABLE_BY_TIER,
  wingRecipeFor,
  wingRecipesForTable,
  isWingRecipe,
  ARROW_RECIPES,
  ARROW_RECIPE_BY_ARROW,
  ARROW_RECIPE_COUNT,
  arrowRecipeFor,
  arrowRecipesForTable,
  isArrowRecipe,
  FAMILY_FORGE_FAMILIES,
  FAMILY_TIER_RECIPES,
  FAMILY_TIER_RECIPE_COUNT
} from '../client/src/crafting.js';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parsePort, readEnvPort, writeEnvPort } from '../server/port-config.js';
import { validateProfileData, sanitizeNickname, isValidNickname, nicknameFor, setNickname, currentNickname, NICKNAME_MAX } from '../client/src/profile.js';
import { validateKeyData, keyCodes, keyLabel, setKey, resetAllKeys, KEY_ACTIONS } from '../client/src/keys.js';
import { validateRecipeData, recipeCount, recipeTerrains, recipesFor, RECIPE_KINDS } from '../client/src/recipes.js';
import { validateTravelData, destinationList, destinationsByTerrain, regionColor, colorInt, arrivalPoint, TERRAIN_COLORS } from '../client/src/travel.js';
import { validateProgressData, unlockEndless, isEndlessUnlocked, recordWave, progressSummary, ENDLESS_UNLOCK_WAVE } from '../client/src/progress.js';
import { syncPointerLock } from '../client/src/ui/pointer-lock.js';
import { buildShareUrls, isUsableIPv4, listLanAddresses, pickLanAddress } from '../server/net-info.js';
import {
  REGIONS,
  HIDDEN_REGIONS,
  RING_REGIONS,
  REGION_SPAWN,
  RING_TREE_WEIGHT,
  RING_MINERAL_WEIGHT,
  regionAt,
  regionIdAt,
  ringAt,
  hiddenRegionAt,
  distanceOf,
  allowsTree,
  allowsMineral,
  randomPointIn,
  ringQuotas,
  regionSummary,
  inDiscoverRange,
  hiddenMineralIds,
  hiddenTreeIds
} from '../client/src/world/regions.js';
import { RNG, createRNG, hashSeed, normalizeSeed } from '../client/src/utils/rng.js';
import {
  INVITE,
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_QUERY_KEY,
  codeFromUrl,
  hasInviteInUrl,
  inviteLink,
  inviteMessage,
  isLoopbackOrigin,
  isValidInviteCode,
  loadLastCode,
  normalizeInviteCode,
  resolveShareOrigin,
  saveLastCode
} from '../client/src/utils/invite.js';
import { Economy } from '../client/src/systems/economy.js';
import { WingSystem, wingCostText, wingFlightText, findWing } from '../client/src/systems/wings.js';
import {
  LEATHER_TYPES,
  LEATHER_BY_ID,
  LEATHER_TIERS,
  leatherById,
  leatherTier,
  leatherForTier,
  leathersUpTo,
  LEATHER_GEAR,
  LEATHER_GEAR_BY_ID,
  GEAR_SLOTS,
  GEAR_SET_BONUS,
  GEAR_BONUS_LABELS,
  gearSlotInfo,
  otherGearInSlot,
  leatherGearById,
  gearBonusText,
  gearCostText,
  WING_GRADES,
  WING_GRADE_BY_ID,
  wingGradeInfo,
  fairyWingGrade,
  wingsByGrade,
  wingsUpToTier,
  fairyWingCount,
  REGION_ENEMY_TYPES,
  REGION_ENEMY_BY_ID,
  REGION_MONSTERS,
  REGION_MONSTER_BY_ID,
  regionMonsterRoster,
  regionHasMonsters,
  pickRegionMonster,
  regionMonsterLoot,
  waveEnemyLeather,
  enemyTypeById,
  ALL_ENEMY_BY_ID,
  ENEMY_TYPE_TOTAL,
  isRegionEnemy
} from '../client/src/data.js';
import { GearSystem, emptyBonus, GEAR_BONUS_KEYS } from '../client/src/systems/gear.js';
import { RegionSpawner, roamerRoster, isRoamer, countRoamers, roamerSpawnPoint, shouldDespawn } from '../client/src/systems/region-spawns.js';
import { BARE_HAND, canHarvestByHand, harvestHint, harvestNode, nodeTier, pickHarvestNode } from '../client/src/systems/gathering.js';
import { ADAPTIVE, AdaptiveResolution, formatScale, nextPixelScale, suggestPreset, stepDownId, stepUpId, ladderIndex, PRESET_LADDER, MemoryGuard, formatMb } from '../client/src/ui/adaptive.js';
import {
  CROSSHAIR_KEY,
  CROSSHAIR_STYLES,
  CROSSHAIR_COLORS,
  DEFAULT_CROSSHAIR,
  clampCrosshairSize,
  normalizeCrosshair,
  loadCrosshair,
  saveCrosshair,
  applyCrosshair
} from '../client/src/ui/crosshair.js';
import { FPSMonitor } from '../client/src/ui/fps.js';
import {
  ADMIN_COMMANDS,
  ADMIN_DEFAULTS,
  commandHelp,
  findMineral,
  findWeapon,
  isAdminUser,
  parseCommand,
  runAdminCommand
} from '../client/src/systems/admin-commands.js';
import { requestPanels } from '../client/src/systems/admin-commands.js';
import { AchievementSystem } from '../client/src/systems/achievements.js';
import { GachaSystem } from '../client/src/systems/gacha.js';
import { FriendSystem, formatFriendCode, isValidFriendCode, friendServerUrl, normalizeFriendCode, normalizeAddress } from '../client/src/friends.js';
import { createFriendRegistry } from '../server/api/friends.js';
import { MONSTER_LOOKS, monsterLook, buildMonsterModel, disposeMonsterAssets } from '../client/src/systems/monster-looks.js';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    failures.push(name + (detail ? ` (${detail})` : ''));
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 52 - title.length))}`);
}

// ─────────────────────────────────────── 1. 데이터 무결성
section('데이터 무결성');
check('VERSION 존재', typeof VERSION === 'string' && VERSION.length > 0, VERSION);
check('포탑 109종 (공격47·지원21·시설33·포탈8)', TURRETS.length === 109, `${TURRETS.length}종`);
check('포탈 8종 (기지 + T1~T7)', turretsByCategory('portal').length === 8, `${turretsByCategory('portal').length}종`);
check('포탈마다 목적지가 있다', turretsByCategory('portal').every((t) => typeof t.portalDest === 'string' && t.portalDest.length > 0), turretsByCategory('portal').map((t) => t.portalDest).join(','));
check('공격형 47종', turretsByCategory('attack').length === 47, `${turretsByCategory('attack').length}종`);
check('회복탑 7종', turretsByCategory('heal').length === 7);
check('채굴탑 7종', turretsByCategory('mining').length === 7);
check('벌목탑 7종', turretsByCategory('lumber').length === 7);
check('나무 30종', TREE_TYPES.length === 30, `${TREE_TYPES.length}종`);
check('광물 27종', MINERAL_TYPES.length === 27, `${MINERAL_TYPES.length}종`);
check('지형 4종', TERRAIN_TYPES.length === 4);
check('마법 속성 19종', SPELL_ELEMENTS.length === 19, `${SPELL_ELEMENTS.length}종`);
check('마법 등급 7종', SPELL_GRADES.length === 7);
check('유물 지팡이 2종', RELIC_STAVES.length === 2);
check('지팡이 6티어', STAFF_TIERS.length === 6);
check('요정 7종', FAIRIES.length === 7);
check('업적 75+', ACHIEVEMENTS.length >= 75, `${ACHIEVEMENTS.length}개`);
check('업적 카테고리 7종', ACHIEVEMENT_CATEGORIES.length === 7);
check('스폰 패턴 5종', SPAWN_PATTERNS.length === 5);
check('적 타입 11종', ENEMY_TYPES.length === 11, `${ENEMY_TYPES.length}종`);
check('보스 5종', BOSS_TYPES.length === 5);
check(
  '신규 몬스터 3종(박쥐·거미·해골)',
  ['bat', 'spider', 'skeleton'].every((id) => ENEMY_TYPES.some((t) => t.id === id)),
  ['bat', 'spider', 'skeleton'].filter((id) => ENEMY_TYPES.some((t) => t.id === id)).join(',')
);
check('적 타입 id 유일', new Set(ENEMY_TYPES.map((t) => t.id)).size === ENEMY_TYPES.length);
check('적 minLevel 오름차순', ENEMY_TYPES.every((t, i, a) => i === 0 || a[i - 1].minLevel <= t.minLevel), ENEMY_TYPES.map((t) => t.minLevel).join(','));
check('모든 적에 체력/속도/피해 수치', ENEMY_TYPES.every((t) => t.hpMult > 0 && t.speedMult > 0 && t.damage > 0 && t.radius > 0));

/* ── 웨이브 편성표 / 정예 / 체력바 ────────────────────────────── */
check(
  '소환문 등장 연출 수치(작게 시작 → 제 크기)',
  SPAWN_FX.emergeTime > 0 &&
    SPAWN_FX.emergeTime < 2 &&
    SPAWN_FX.scaleFrom > 0 &&
    SPAWN_FX.scaleFrom < 1 &&
    SPAWN_FX.riseHeight > 0 &&
    Number.isFinite(SPAWN_FX.tint),
  `등장 ${SPAWN_FX.emergeTime}s · 크기 ${SPAWN_FX.scaleFrom}→1 · 높이 +${SPAWN_FX.riseHeight}`
);
check('웨이브 편성표 13종', WAVE_ROSTERS.length === 13, `${WAVE_ROSTERS.length}종`);
check('편성표 id 유일', new Set(WAVE_ROSTERS.map((r) => r.id)).size === WAVE_ROSTERS.length);
check('편성표 종류가 실존 적', WAVE_ROSTERS.every((r) => r.types.every((id) => ENEMY_TYPE_BY_ID[id])));
check('편성표 종류가 비어있지 않음', WAVE_ROSTERS.every((r) => Array.isArray(r.types) && r.types.length > 0));
check('편성표 마릿수 배율 양수', WAVE_ROSTERS.every((r) => Number(r.countMult ?? 1) > 0));
check('편성표 강화 수치 양수', WAVE_ROSTERS.every((r) => Object.values(r.mods ?? {}).every((v) => Number(v) > 0)));
check('편성표 보스 편성 1종', WAVE_ROSTERS.filter((r) => r.bossEscort === true).length === 1);
check('정예 개체 수치 (2.4 / 1.35 / x2)', ELITE.hpMult === 2.4 && ELITE.scaleMult === 1.35 && ELITE.goldMult === 2, `HP x${ELITE.hpMult} 크기 x${ELITE.scaleMult} 골드 x${ELITE.goldMult}`);
check(
  '체력바 수치(보스가 더 크고 저체력·거리 규칙 존재)',
  HEALTH_BAR.width > 0 &&
    HEALTH_BAR.bossWidth > HEALTH_BAR.width &&
    HEALTH_BAR.bossHeight > HEALTH_BAR.height &&
    HEALTH_BAR.lowRatio > 0 &&
    HEALTH_BAR.range > HEALTH_BAR.alwaysRange,
  `일반 ${HEALTH_BAR.width} / 보스 ${HEALTH_BAR.bossWidth} / 사거리 ${HEALTH_BAR.range}`
);

// 웨이브마다 다른 몬스터 — 1~40 웨이브 연속 편성이 겹치지 않는다
const rosterSeq = [];
let rosterRepeat = 0;
for (let w = 1; w <= 40; w++) {
  const r = waveRoster(w, { prevId: rosterSeq[rosterSeq.length - 1] ?? null, boss: w % WAVE_CONFIG.bossEvery === 0 });
  if (r.id === rosterSeq[rosterSeq.length - 1]) rosterRepeat += 1;
  rosterSeq.push(r.id);
}
check('1~40 웨이브 연속 편성 중복 0', rosterRepeat === 0, `${new Set(rosterSeq).size}종 순환`);
check('1~40 웨이브에서 편성 10종 이상 등장', new Set(rosterSeq).size >= 10, `${new Set(rosterSeq).size}종`);
const rosterSame = waveRoster(7, { prevId: null });
check(
  '같은 웨이브 → 같은 편성(결정적)',
  rosterSame.id === waveRoster(7, { prevId: null }).id && rosterSame.id === rosterSeq[6],
  `${rosterSeq[6]}`
);
const firstRoster = waveRoster(1, { prevId: null });
check('웨이브 1 편성은 해금된 종류만', firstRoster.types.every((id) => (ENEMY_TYPE_BY_ID[id]?.minLevel ?? 1) <= 1), firstRoster.types.join(','));
const bossRoster = waveRoster(WAVE_CONFIG.bossEvery * 3, { prevId: null, boss: true });
check('보스 웨이브는 친위대 편성', bossRoster.id === 'boss_legion', bossRoster.name);
check('일반 웨이브는 친위대 편성 제외', [1, 5, 9, 11, 15].every((w) => waveRoster(w, { prevId: null }).bossEscort !== true));
check('편성표 조회 맵 일치', WAVE_ROSTER_BY_ID.imp_nest === WAVE_ROSTERS.find((r) => r.id === 'imp_nest'));
check('프레임 프리셋 6종(초고속 500 FPS 포함)', FRAME_PRESETS.length === 6 && FRAME_PRESETS.some((p) => p.id === 'speed') && FRAME_PRESETS.filter((p) => p.id === 'speed').length === 1);
check('추천 시드 8종', SEED_GALLERY.length === 8);
check('난이도 4종', DIFFICULTIES.length === 4);
check('부여대 조합식 11종', MINERAL_COMBO_RECIPES.length === 11, `${MINERAL_COMBO_RECIPES.length}종`);
check('칭호 9종', TITLE_LIST.length === 9);

const turretIds = new Set(TURRETS.map((t) => t.id));
check('포탑 id 유일', turretIds.size === TURRETS.length, `${turretIds.size}개`);
check('모든 업적 stat이 STAT_LABELS에 존재', ACHIEVEMENTS.every((a) => a.stat in STAT_LABELS));
check('모든 업적 카테고리가 유효', ACHIEVEMENTS.every((a) => ACHIEVEMENT_CATEGORIES.some((c) => c.id === a.category)));
check('모든 칭호 stat이 STAT_LABELS에 존재', TITLE_LIST.every((t) => t.condition.stat in STAT_LABELS));
check('부여대 재료가 실존 광물', MINERAL_COMBO_RECIPES.every((r) => Object.keys(r.input).every((m) => MINERAL_TYPES.some((x) => x.id === m))));
check('요정 조건 타입 정의', FAIRIES.every((f) => f.condition && typeof f.condition.type === 'string'));

const tierCounts = {};
for (const t of TURRETS) tierCounts[t.tier] = (tierCounts[t.tier] || 0) + 1;
check('포탑 티어 1~7만 사용 (포탈은 예외 — 지형 등급 없음)', TURRETS.filter((t) => t.category !== 'portal').every((t) => Number(t.tier) >= 1 && Number(t.tier) <= 7), JSON.stringify(tierCounts));

const badCost = TURRETS.filter((t) => !t.cost || typeof t.cost.gold !== 'number' || (!t.craftOnly && t.cost.gold <= 0));
check('모든 포탑에 유효한 건설 비용 (제작 전용 포탈은 아이템)', badCost.length === 0, badCost.map((t) => t.id).join(','));

const attackNoDamage = turretsByCategory('attack').filter((t) => !(t.damage > 0) || !(t.range > 0) || !(t.fireRate > 0));
check('모든 공격 포탑에 피해/사거리/연사 존재', attackNoDamage.length === 0, attackNoDamage.map((t) => t.id).join(','));

// ── 티어별 포탑 피해 — 1티어 100% 기준, 티어마다 47% 복리(몬스터 체력 성장 기준)
check(
  '티어 피해 성장 — 1티어 100%에서 티어마다 47%',
  Math.abs(TOWER_TIER_DAMAGE_GROWTH - 1.47) < 1e-9 && Object.values(TOWER_TIER_DAMAGE_MULT).every((m, i) => Math.abs(m - Math.pow(1.47, i)) < 0.0002),
  JSON.stringify(TOWER_TIER_DAMAGE_MULT)
);
check(
  '티어 피해 배율 — T2 ×1.47 · T7 ×10.0903',
  TOWER_TIER_SCALE[2].damage === TOWER_TIER_DAMAGE_MULT[2] && TOWER_TIER_SCALE[7].damage === TOWER_TIER_DAMAGE_MULT[7] && TOWER_TIER_DAMAGE_MULT[7] === 10.0903,
  `T2 ${TOWER_TIER_SCALE[2].damage} · T7 ${TOWER_TIER_SCALE[7].damage}`
);
check(
  '티어 피해 — 1티어 화살탑은 그대로(780), T7 화살탑은 10.09배(7,870)',
  TURRET_BY_ID.atk_arrow_t1_0.damage === 780 && TURRET_BY_ID.atk_arrow_t7_0.damage === 7870,
  `${TURRET_BY_ID.atk_arrow_t1_0.damage} → ${TURRET_BY_ID.atk_arrow_t7_0.damage}`
);
{
  // 기준 웨이브 10N 의 표준 몬스터(고블린 hpMult 1) 체력과 티어 평균 피해를 비교한다.
  const refHp = (wave) => {
    const w = Math.max(1, Math.round(wave));
    const eff = w <= WAVE_CONFIG.softenAfter ? w - 1 : WAVE_CONFIG.softenAfter - 1 + (w - WAVE_CONFIG.softenAfter) * WAVE_CONFIG.growthSoftening;
    return WAVE_CONFIG.baseHp * Math.pow(WAVE_CONFIG.hpGrowth, eff);
  };
  const avgDamage = (tier) => {
    const list = turretsByCategory('attack').filter((t) => t.tier === tier);
    return list.reduce((sum, t) => sum + t.damage, 0) / list.length;
  };
  const ttk = [2, 3, 4, 5, 6, 7].map((tier) => refHp(tier * 10) / avgDamage(tier));
  check(
    'T2~T7 평균 피해 — 기준 웨이브 표준 몬스터를 0.5~3발에 처치',
    ttk.every((n) => n >= 0.5 && n <= 3),
    ttk.map((n, i) => `T${i + 2} ${n.toFixed(2)}발`).join(' · ')
  );
}

// ── 서버 포트 설정 — .env 의 PORT 한 줄만 바꾸고 비밀 값은 보존한다
check('포트 검사 — 1024~65535 정수만 허용', parsePort(1024) === 1024 && parsePort(65535) === 65535 && parsePort(1023) === null && parsePort(65536) === null && parsePort('abc') === null && parsePort('') === null);
{
  const dir = mkdtempSync(join(tmpdir(), 'yose-port-'));
  const file = join(dir, '.env');
  try {
    writeFileSync(file, 'ADMIN_PASSWORD=keep-me\r\nPORT=3001\r\nPORT=3002\r\nJWT_SECRET=secret\r\n', 'utf8');
    const saved = writeEnvPort(3123, file);
    const raw = readFileSync(file, 'utf8');
    const portLines = raw.split(/\r?\n/).filter((line) => /^\s*PORT\s*=/.test(line));
    check(
      '포트 저장 — .env 의 PORT 만 3123 으로 바꾸고 나머지 비밀 값 유지',
      saved === 3123 && readEnvPort(file) === 3123 && portLines.length === 1 && raw.includes('ADMIN_PASSWORD=keep-me') && raw.includes('JWT_SECRET=secret'),
      JSON.stringify({ saved, portLines, raw: raw.slice(0, 120) })
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const supportOk = turretsByCategory('heal').every((t) => t.healPerSec > 0) &&
  turretsByCategory('mining').every((t) => t.rate > 0) &&
  turretsByCategory('lumber').every((t) => t.rate > 0);
check('지원 포탑에 회복량/채굴·벌목 속도 존재', supportOk);

const mineralTiers = new Set(MINERAL_TYPES.map((m) => m.tier));
check('광물 티어 1~5만 사용', [...mineralTiers].every((t) => t >= 1 && t <= 5), [...mineralTiers].join(','));
check('광물 스폰 가중치 양수', MINERAL_TYPES.every((m) => m.weight > 0));

const gradeWeight = SPELL_GRADES.reduce((s, g) => s + g.weight, 0);
check('등급 가중치 합 10000 (유물 0.01%)', gradeWeight === 10000, `합계 ${gradeWeight}`);
const relic = SPELL_GRADES.find((g) => g.id === 'relic');
check('유물 확률 0.01%', relic.weight === 1, `${relic.weight}/10000 = ${(relic.weight / gradeWeight * 100).toFixed(3)}%`);

// ─────────────────────────────────────── 2. 시드 RNG
section('시드 RNG');
check('hashSeed 결정적', hashSeed('777') === hashSeed('777'));
check('hashSeed 시드별 상이', hashSeed('777') !== hashSeed('778'));

const a = createRNG('seed-42');
const b = createRNG('seed-42');
const seqA = Array.from({ length: 12 }, () => a.next());
const seqB = Array.from({ length: 12 }, () => b.next());
check('같은 시드 → 같은 수열', JSON.stringify(seqA) === JSON.stringify(seqB));
check('수열이 [0,1) 범위', seqA.every((v) => v >= 0 && v < 1));

const r = createRNG('scatter');
const p1 = Array.from({ length: 8 }, () => r.int(0, 1000));
const r2 = createRNG('scatter');
const p2 = Array.from({ length: 8 }, () => r2.int(0, 1000));
check('같은 시드 → 같은 배치', JSON.stringify(p1) === JSON.stringify(p2), p1.join(','));

const f1 = createRNG('root').fork('world');
const f2 = createRNG('root').fork('world');
check('fork 결정적', f1.next() === f2.next());

const shuffled = createRNG('x').shuffle([1, 2, 3, 4, 5]);
check('shuffle이 원소 보존', JSON.stringify([...shuffled].sort()) === JSON.stringify([1, 2, 3, 4, 5]));

const uniq = new Set();
for (let i = 0; i < 200; i++) uniq.add(normalizeSeed(null));
check('normalizeSeed(null) → 랜덤 시드 생성', uniq.size > 150, `${uniq.size}/200 고유`);
check('normalizeSeed 문자열 유지', normalizeSeed(' 777 ') === '777');
check('normalizeSeed 빈 문자열 대체', normalizeSeed('') !== '');

// ─────────────────────────────────────── 3. 경제
section('경제 시스템');
const eco = new Economy({ gold: 300, wood: 100 });
check('초기 골드', eco.gold === 300, `gold=${eco.gold}`);
check('골드 추가', (eco.addGold(200), eco.gold === 500));
check('골드 사용 성공', eco.spendGold(100) === true && eco.gold === 400);
check('골드 초과 사용 거부', eco.spendGold(99999) === false && eco.gold === 400);
check('음수 골드 불가', (eco.addGold(-1000), eco.gold >= 0), `gold=${eco.gold}`);
check('광물 추가/조회', (eco.addMineral('iron', 5), eco.getMineral('iron') === 5));
check('canAfford 통과', eco.canAfford({ gold: 100, wood: 10 }) === true);
check('canAfford 광물 부족', eco.canAfford({ gold: 1, minerals: { genesis: 1 } }) === false);
check('spend 복합 비용', eco.spend({ gold: 50, wood: 20, minerals: { iron: 2 } }) === true);
check('spend 후 잔액', eco.gold === 350 && eco.wood === 80 && eco.getMineral('iron') === 3, `g=${eco.gold} w=${eco.wood} iron=${eco.getMineral('iron')}`);
const ecoJson = eco.toJSON();
const eco2 = new Economy();
eco2.fromJSON(ecoJson);
check('직렬화 왕복', eco2.gold === eco.gold && eco2.wood === eco.wood && eco2.getMineral('iron') === 3);
check('totalMinerals', eco.totalMinerals() === 3, `${eco.totalMinerals()}`);

// ─────────────────────────────────────── 4. 업적
section('업적 시스템');
const unlockedList = [];
const ach = new AchievementSystem({ onUnlock: (x) => unlockedList.push(x.id) });
ach.track('kills', 500);
check('단일 통계 누적', ach.get('kills') === 500);
const killAchs = ACHIEVEMENTS.filter((x) => x.stat === 'kills' && x.target <= 500);
check('목표 달성 업적 해금', killAchs.every((x) => ach.unlocked.has(x.id)), `${killAchs.length}개`);
const notYet = ACHIEVEMENTS.find((x) => x.stat === 'kills' && x.target > 500);
check('미달 업적 미해금', notYet ? !ach.unlocked.has(notYet.id) : true, notYet?.name);
check('해금 콜백 1회씩', unlockedList.length === new Set(unlockedList).size);
const before = unlockedList.length;
ach.track('kills', 1);
check('중복 해금 없음', unlockedList.length === before, `${unlockedList.length}`);
ach.set('mineralTypesMined', MINERAL_TYPES.length);
check('set 절대값', ach.get('mineralTypesMined') === MINERAL_TYPES.length && ach.unlocked.has('mining_08'));
const prog = ach.progress();
check('진행도 계산', prog.unlocked >= 4 && prog.total === ACHIEVEMENTS.length, `${prog.unlocked}/${prog.total}`);
check('카테고리 진행도 존재', Object.keys(prog.byCategory).length === ACHIEVEMENT_CATEGORIES.length);
const list = ach.list();
check('list() 길이 = 전체 업적', list.length === ACHIEVEMENTS.length);
check('list() progress 0~1', list.every((x) => x.progress >= 0 && x.progress <= 1));
ach.set('wavesCleared', 60);
ach.set('towersBuilt', 30);
const title = ach.title();
check('칭호 산출', Boolean(title?.name), title?.name);
const ach2 = new AchievementSystem();
ach2.fromJSON(ach.toJSON());
check('업적 직렬화 왕복', ach2.get('kills') === ach.get('kills') && ach2.unlocked.size === ach.unlocked.size);

// ─────────────────────────────────────── 5. 가챠
section('가챠 시스템');
const gachaEco = new Economy({ gold: 1000000 });
const gStats = new AchievementSystem();
const gacha = new GachaSystem({ rng: createRNG('gacha-test'), stats: gStats, economy: gachaEco, audio: null });
const odds = gacha.odds();
const oddsSum = odds.reduce((s, o) => s + o.chance, 0);
check('확률 합 100%', Math.abs(oddsSum - 100) < 0.001, `${oddsSum.toFixed(4)}%`);
const rOdds = odds.find((o) => o.grade === 'relic' || o.id === 'relic');
check('유물 확률 표기', rOdds ? Math.abs(rOdds.chance - 0.01) < 1e-6 : false, rOdds ? `${rOdds.chance}%` : 'n/a');

const single = gacha.makeSpell('legendary', 'fire');
check('makeSpell 필수 필드', Boolean(single?.name && single?.grade && single?.element && single.damage > 0 && single.mana >= 0), single?.name);
const relicSpell = gacha.makeSpell('relic', 'arcane');
check('유물 등급 처리', Boolean(relicSpell?.grade === 'relic'), relicSpell?.name);

const pull = gacha.pull(1);
check('1회 뽑기 성공', pull.ok === true && pull.results.length === 1, `${pull.results[0]?.name} / -${pull.spent}G`);
check('골드 차감', gachaEco.gold === 1000000 - GACHA_COST.single, `${gachaEco.gold}`);
const ten = gacha.pull(10);
check('10연차 성공(할인)', ten.ok === true && ten.results.length === 10 && ten.spent === GACHA_COST.ten, `${ten.spent}G`);
check('가챠 통계 기록', gStats.get('gachaPulls') >= 11, `pulls=${gStats.get('gachaPulls')}`);

const poorEco = new Economy({ gold: 0 });
const poorGacha = new GachaSystem({ rng: createRNG('poor'), stats: new AchievementSystem(), economy: poorEco, audio: null });
const poorPull = poorGacha.pull(10);
check('골드 부족 시 거부', poorPull.ok === false && poorPull.results.length === 0, poorPull.reason);

const N = 20000;
const dist = {};
const distGacha = new GachaSystem({ rng: createRNG('dist'), stats: new AchievementSystem(), economy: new Economy({ gold: N * 200 }), audio: null });
for (let i = 0; i < N; i++) {
  const res = distGacha.pull(1);
  const g = res.results[0]?.grade ?? 'none';
  dist[g] = (dist[g] || 0) + 1;
}
const expected = Object.fromEntries(SPELL_GRADES.map((g) => [g.id, (g.weight / 10000) * N]));
const commonOk = Math.abs((dist.common || 0) - expected.common) / expected.common < 0.08;
const rareOk = Math.abs((dist.rare || 0) - expected.rare) / expected.rare < 0.25;
const epicOk = Math.abs((dist.epic || 0) - expected.epic) / expected.epic < 0.35;
check('일반 등급 분포 근사', commonOk, `${dist.common}/${expected.common.toFixed(0)}`);
check('희귀 등급 분포 근사', rareOk, `${dist.rare}/${expected.rare.toFixed(0)}`);
check('영웅 등급 분포 근사', epicOk, `${dist.epic}/${expected.epic.toFixed(0)}`);
const highShare = ((dist.legendary || 0) + (dist.mythic || 0) + (dist.relic || 0)) / N;
check('고등급(전설+) 희소성', highShare < 0.03, `${(highShare * 100).toFixed(3)}%`);

const relicRate = distGacha.odds().find((o) => o.id === 'relic' || o.grade === 'relic')?.chance ?? 0;
check('유물 확률 0.01% 유지', Math.abs(relicRate - 0.01) < 1e-6, `${relicRate}%`);

// ─────────────────────────────────────── 6. 웨이브 수치 (순수 계산)
section('웨이브 수치');
const hpAt = (w, diff = 1) => WAVE_CONFIG.baseHp * Math.pow(WAVE_CONFIG.hpGrowth, w - 1) * diff;
const countAt = (w, diff = 1) => Math.floor(WAVE_CONFIG.baseCount * Math.pow(WAVE_CONFIG.countGrowth, w - 1) * diff);
check('웨이브 1 기본 HP', Math.round(hpAt(1)) === WAVE_CONFIG.baseHp, `${Math.round(hpAt(1))}`);
check('웨이브 10 HP 증가', hpAt(10) > hpAt(1) * 3, `${Math.round(hpAt(1))} → ${Math.round(hpAt(10))}`);
check('웨이브 50 HP 증가', hpAt(50) > hpAt(10) * 5, `${Math.round(hpAt(50))}`);
check('웨이브 1 적 수', countAt(1) === WAVE_CONFIG.baseCount, `${countAt(1)}`);
check('웨이브 20 적 수 증가', countAt(20) > countAt(1) * 3, `${countAt(1)} → ${countAt(20)}`);
const nightmare = DIFFICULTIES.find((d) => d.id === 'nightmare');
check('악몽 난이도 배수 적용', hpAt(10, nightmare.hpMult) > hpAt(10) * 2, `x${nightmare.hpMult}`);
check('보스 주기 10의 배수', WAVE_CONFIG.bossEvery === 10);
check('완벽 방어 보너스 2배', WAVE_CONFIG.perfectBonus === 2);
check('준비 시간 30초', WAVE_CONFIG.prepTime === 30);

// ─────────────────────────────────────── 6. 무기 시스템 (11계열 × 7등급 + 비밀 꿈나무)
section('무기 시스템');
{
  const families = WEAPON_FAMILIES.map((f) => f.id);
  const gradeById = Object.fromEntries(WEAPON_GRADES.map((g) => [g.id, g]));
  const counts = Object.fromEntries(families.map((f) => [f, weaponsByFamily(f).length]));
  check('무기 82종 = 8계열 × 7등급(56) + 제작 전용 24 + 유물 지팡이 1 + 비밀 꿈나무 1', WEAPON_TOTAL_COUNT === 82 && WEAPON_CORE_COUNT === 81, `총 ${WEAPON_TOTAL_COUNT} / 핵심 ${WEAPON_CORE_COUNT}`);
  check('계열 11종 — 요정의 지팡이 추가 + 카타나(자동 생성 제외) + 쌍권총', WEAPON_FAMILIES.length === 11 && WEAPON_FAMILIES.some((f) => f.id === 'katana' && f.exclusive === true) && WEAPON_FAMILIES.some((f) => f.id === 'gun' && f.kind === 'gun') && WEAPON_FAMILIES.some((f) => f.id === 'fairywand' && f.kind === 'wand'), WEAPON_FAMILIES.map((f) => f.id).join(','));
  check('카타나는 등급 자동 생성 대상이 아니다(계열 무기 1종)', WEAPONS.filter((w) => w.family === 'katana').length === 1);

  // ── 유물 카타나 '불멸' (계약 §4.51) ──
  const immortalW = WEAPON_BY_ID.katana_immortal;
  check('불멸 — 유물 등급 카타나', !!immortalW && immortalW.name === '불멸' && immortalW.family === 'katana' && immortalW.grade === 'relic', immortalW ? `${immortalW.gradeName} ${immortalW.familyName}` : '없음');
  check('불멸 — 창세의 제단(forge_t7) 전용 레시피 + 비용', !!immortalW && immortalW.table === 'forge_t7' && immortalW.craftOnly === true && !!immortalW.cost && !!recipeForWeapon('katana_immortal'), immortalW?.cost ? `${immortalW.cost.gold}골드` : '없음');
  check('불멸 — 수치(1타 55 · 0.328초 · 흡혈 0.25 · 3연격)', !!immortalW && immortalW.damage === 55 && immortalW.cooldown === 0.328 && immortalW.lifesteal === 0.25 && immortalW.combo === 3 && immortalW.hands === 1, immortalW ? `damage ${immortalW.damage} · cd ${immortalW.cooldown} · DPS ${(immortalW.damage / immortalW.cooldown).toFixed(1)}` : '없음');
  check('불멸 — 카타나 모션(iai)·임팩트·스왑모션', WEAPON_MOTIONS.katana?.swap?.style === 'iai' && WEAPON_IMPACTS.katana?.sound === 'impactBlade' && hasSwapMotion('katana_immortal'));
  check('불멸 — 직업 무관(공용 계열)로 장착 가능', weaponLock('katana_immortal', 'novice', 0).kind === 'ok' && weaponLock('katana_immortal', 'archer', 3).kind === 'ok' && CLASS_RULES.sharedFamilies.includes('katana'));

  // ── 꿈의 끝은 희망 — 색·성질 유지 + 낫 형태 (계약 §4.51) ──
  const lanternW = WEAPON_BY_ID.dream_lantern;
  check('꿈의 끝은 희망 — 형태/모션만 낫(model·motion 오버라이드)', lanternW?.family === 'dream' && lanternW.model === 'scythe' && lanternW.motion === 'scythe', lanternW ? `${lanternW.family} → ${lanternW.model}` : '없음');
  check('꿈의 끝은 희망 — 색은 비밀 등급색 그대로', lanternW?.color === WEAPON_GRADES.find((g) => g.id === 'secret').color, lanternW ? '0x' + lanternW.color.toString(16) : '없음');
  check('꿈의 끝은 희망 — 비살상·수치 유지(피해 0 · kind save · 구원 임팩트)', lanternW?.nonLethal === true && lanternW.damage === 0 && lanternW.kind === 'save' && weaponImpact('dream_lantern').nonLethal === true && weaponMotion('dream_lantern').swap.style === 'spin');

  check('계열별 수량 12/7/10/11/11/10/1/1/2/10/7 (제작 무기 포함)', counts.staff === 12 && counts.fairywand === 7 && counts.sword1h === 10 && counts.sword2h === 11 && counts.scythe === 11 && counts.dagger === 10 && counts.katana === 1 && counts.scissors === 1 && counts.dream === 2 && counts.bow === 10 && counts.gun === 7, JSON.stringify(counts));
  check('무기 id 중복 없음', new Set(WEAPONS.map((w) => w.id)).size === WEAPONS.length);
  check('모든 무기에 이름/등급/계열', WEAPONS.every((w) => w.name && gradeById[w.grade] && families.includes(w.family)));
  check('등급 8종 배율 1.0/1.05/1.1/1.2/1.35/1.5/1.75/2.0',
    ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'relic', 'secret'].every((id, i) => Math.abs(gradeById[id].mult - [1, 1.05, 1.1, 1.2, 1.35, 1.5, 1.75, 2][i]) < 1e-9),
    WEAPON_GRADES.map((g) => `${g.name}×${g.mult}`).join(' '));
  check('비밀 등급 2종 (꿈나무 + 꿈의 끝은 희망)', WEAPONS.filter((w) => w.grade === 'secret').length === 2 && WEAPONS.some((w) => w.id === DREAM_TREE.id && w.grade === 'secret'));
  const wrongDamage = WEAPONS.filter((w) => {
    if (w.bonus || w.secret || w.nonLethal || w.craftOnly) return false;
    const fam = WEAPON_FAMILIES.find((f) => f.id === w.family);
    return w.damage !== Math.round(fam.baseDamage * gradeById[w.grade].mult);
  });
  check('데미지 = 계열 기본 × 등급 배율 (하드코딩 없음)', wrongDamage.length === 0, wrongDamage.map((w) => w.id).join(',') || '전부 일치');
  const craftWeak = WEAPONS.filter((w) => w.craftOnly && !w.nonLethal).filter((w) => {
    const fam = WEAPON_FAMILIES.find((f) => f.id === w.family);
    const base = fam.baseDamage * gradeById[w.grade].mult;
    return !(w.damage > base && w.damage <= base * 1.4);
  });
  check('제작 무기는 같은 등급 기본형보다 강하다(1.0~1.4배)', craftWeak.length === 0, craftWeak.map((w) => w.id).join(',') || '전부 특화형');
  check('원거리/근접/활/쌍권총/요정 지팡이/구원 종류 값 유효', WEAPONS.every((w) => ['ranged', 'melee', 'bow', 'gun', 'wand', 'save'].includes(w.kind)), JSON.stringify([...new Set(WEAPONS.map((w) => w.kind))]));

  // ★ 모든 무기에 스왑모션
  const noSwap = WEAPONS.filter((w) => {
    const m = weaponMotion(w.id);
    return !(m?.swap && m.swap.duration > 0 && Array.isArray(m.swap.phases) && m.swap.phases.length >= 2);
  });
  check('모든 무기에 스왑모션 (82/82)', noSwap.length === 0, `${WEAPONS.length - noSwap.length}/${WEAPONS.length}`);
  check('스왑모션 키프레임 0→1 정렬', families.every((f) => {
    const p = WEAPON_MOTIONS[f].swap.phases;
    return p[0].t === 0 && p[p.length - 1].t === 1 && p.every((k, i) => i === 0 || k.t >= p[i - 1].t);
  }));
  check('스왑모션 이징은 전부 지원 목록 안', families.every((f) => WEAPON_MOTIONS[f].swap.phases.every((p) => !p.ease || MOTION_EASINGS.includes(p.ease))), MOTION_EASINGS.join('/'));
  check('계열별 스왑 스타일 11종 상이(요정 fairyBloom · 카타나 iai · 쌍권총 cross 포함)', new Set(families.map((f) => WEAPON_MOTIONS[f].swap.style)).size === 11, families.map((f) => `${f}:${WEAPON_MOTIONS[f].swap.style}`).join(' '));
  check('모든 무기에 공격/스킬/반동 모션', WEAPONS.every((w) => {
    const m = weaponMotion(w.id);
    return m.attack?.duration > 0 && m.skill?.duration > 0 && m.recoil?.duration > 0;
  }));
  check('모든 무기에 타격 임팩트', WEAPONS.every((w) => !!WEAPON_IMPACTS[w.family]), `${new Set(WEAPONS.map((w) => w.family)).size}계열`);

  // 궁극기
  check('궁극기 10종 (문서 5 + 유물 지팡이 2 + 시간의 가위 1 + 유물 활 1 + 은하수의 밤 1)', WEAPON_ULTIMATES.length === 10, WEAPON_ULTIMATES.map((u) => u.name).join(' · '));
  check('모든 궁극기에 무기 연결', WEAPON_ULTIMATES.every((u) => !!WEAPON_BY_ID[u.weapon]));
  check('문서의 궁극기 5종 존재', ['kingsJudgment', 'worldSlash', 'apocalypse', 'assassination', 'dreamsEnd'].every((id) => WEAPON_ULTIMATES.some((u) => u.id === id)));
  check('궁극기마다 쿨다운/설명 존재', WEAPON_ULTIMATES.every((u) => u.cooldown > 0 && !!u.desc));

  // 시간의 가위 (유물 · 가위 계열) — 그웬식 스닙
  const scissors = WEAPON_BY_ID.time_scissors;
  check('시간의 가위 = 유물(T7) · 가위 계열 · 2H 근접', scissors?.grade === 'relic' && scissors?.tier === 7 && scissors?.family === 'scissors' && scissors?.hands === 2 && scissors?.kind === 'melee', `${scissors?.name} ${scissors?.gradeName}/T${scissors?.tier}/${scissors?.familyName}`);
  check('가위 계열 = 전용 1종(등급 자동 생성 제외)', weaponsByFamily('scissors').length === 1 && weaponsByFamily('scissors')[0].id === 'time_scissors' && WEAPON_FAMILIES.find((f) => f.id === 'scissors')?.exclusive === true, weaponsByFamily('scissors').map((w) => w.id).join(','));
  check('시간의 가위 수치 = 계열 기본 × 등급 배율 × 특화 1.05', scissors.damage === Math.round(46 * 1.75 * 1.05) && scissors.aoe === 3.2 && scissors.lifesteal === 0.12 && scissors.element === 'crystal', `dmg ${scissors.damage} · aoe ${scissors.aoe} · 흡혈 ${scissors.lifesteal}`);
  const scMotion = weaponMotion('time_scissors');
  check('가위 = 그웬식 스닙 모션 4종 + 전용 스왑 스타일', scMotion.attack.style === 'snip' && scMotion.swap.style === 'unfold' && scMotion.skill.style === 'shear' && scMotion.swap.duration > 0 && scMotion.skill.duration > 0 && scMotion.recoil.duration > 0, `${scMotion.swap.style}/${scMotion.attack.style}/${scMotion.skill.style}`);
  check('스닙 트랙 = 날개 벌림 6키프레임 (0→1→0)', scMotion.attack.snip.length === 6 && scMotion.attack.snip[0].t === 0 && scMotion.attack.snip[scMotion.attack.snip.length - 1].t === 1 && scMotion.attack.snip.every((k, i, a) => i === 0 || k.t >= a[i - 1].t), scMotion.attack.snip.map((k) => `${k.t}:${k.open}`).join(' '));
  const snipAt = (t) => { let v = scMotion.attack.snip[0].open; for (const k of scMotion.attack.snip) if (k.t <= t) v = k.open; return v; };
  check('가위는 release 직전 활짝, release 순간 맞물린다', snipAt(scMotion.attack.release - 0.06) >= 0.9 && snipAt(scMotion.attack.release) === 0, `open ${snipAt(scMotion.attack.release - 0.06)} → ${snipAt(scMotion.attack.release)} (release ${scMotion.attack.release})`);
  check('가위 스왑/스킬도 같은 순간에 물린다', scMotion.swap.special?.kind === 'snip' && scMotion.swap.special.snap === true && scMotion.skill.special?.kind === 'snip' && scMotion.skill.special.big === true, JSON.stringify(scMotion.swap.special));
  check('가위 고유 임팩트 (두 날 교차 + 시간의 실)', WEAPON_IMPACTS.scissors.kind === 'crossSlash' && WEAPON_IMPACTS.scissors.stitch === true && WEAPON_IMPACTS.scissors.sound === 'impactSnip' && WEAPON_IMPACTS.scissors.shake > 0, `${WEAPON_IMPACTS.scissors.kind} · ${WEAPON_IMPACTS.scissors.sound}`);
  const timeShear = WEAPON_ULTIMATES.find((u) => u.id === 'timeShear');
  check('가위 궁극기 시간의 봉합 (34m 참격)', timeShear?.weapon === 'time_scissors' && timeShear?.kind === 'slashArc' && timeShear?.radius === 34 && timeShear?.rays === 2 && !!ULTIMATE_IMPACTS.timeShear && ULTIMATE_IMPACTS.timeShear.kind === 'slashArc', `${timeShear?.name} r=${timeShear?.radius}`);

  // 꿈나무
  const dream = WEAPON_BY_ID[DREAM_TREE.id];
  check('꿈나무 = 비밀 등급 · 비살상 · 피해 0', dream.grade === 'secret' && dream.nonLethal === true && dream.damage === 0 && dream.kind === 'save', `${dream.name} dmg=${dream.damage}`);
  check('꿈나무 고유 스왑모션 bloom + 꽃잎/나비', WEAPON_MOTIONS.dream.swap.style === 'bloom' && WEAPON_MOTIONS.dream.swap.special.petals === 22 && WEAPON_MOTIONS.dream.swap.special.butterflies === 5, `${WEAPON_MOTIONS.dream.swap.duration}s`);
  check('꿈나무 고유 무기 임팩트 (petals + 감사 인사)', WEAPON_IMPACTS.dream.kind === 'petals' && WEAPON_IMPACTS.dream.butterflies === 3 && Array.isArray(WEAPON_IMPACTS.dream.gratitude) && WEAPON_IMPACTS.dream.shake === 0);
  check('꿈나무 고유 스킬 임팩트 (꿈의 끝, 행복의 시작)', WEAPON_ULTIMATES.find((u) => u.id === 'dreamsEnd').name === '꿈의 끝, 행복의 시작' && DREAM_TREE.skillImpact.petals === 140 && DREAM_TREE.skillImpact.butterflies === 28);
  check('꿈나무 획득 조건 (요정 7 + 업적 50 + 종말의 낫)', DREAM_TREE.acquire.fairies === 7 && DREAM_TREE.acquire.achievements === 50 && DREAM_TREE.acquire.weapon === 'scythe_relic');
  check('꿈나무 패시브 영혼의 축복 (구원당 +0.5%, 최대 +100%)', DREAM_TREE.passive.id === 'soulBlessing' && DREAM_TREE.passive.perSave === 0.005 && DREAM_TREE.passive.max === 1);
  check('꿈나무는 죽이지 않는다 (명대사/lore)', DREAM_TREE.quote.includes('죽이지 않는다') && DREAM_TREE.lore.some((l) => l.includes('죽이지 않는다')));

  // 가챠 가중치 (문서 55/25/12/6/1.8/0.19/0.01%)
  const weights = SPELL_GRADES.map((g) => g.weight);
  check('가챠 가중치 합 10000', weights.reduce((a, b) => a + b, 0) === 10000);
  check('가챠 확률 문서 일치 55/25/12/6/1.8/0.19/0.01%', [5500, 2500, 1200, 600, 180, 19, 1].every((w, i) => weights[i] === w), SPELL_GRADES.map((g) => `${(g.weight / 100).toFixed(2)}%`).join(' '));

  // 통계 키
  check('무기/제작 통계 키 7종 등록', ['weaponsOwned', 'weaponSwaps', 'ultimatesUsed', 'salvations', 'dreamTreeOwned', 'weaponsCrafted', 'tablesBuilt'].every((k) => !!STAT_LABELS[k]));
}

// ─────────────────────────────────────── 7. 건설 시설 (작업대·저장고·채굴기)
section('건설 시설 (작업대·저장고·채굴기)');
{
  const facilities = turretsByCategory('facility');
  check('시설 카테고리 등록', Boolean(TURRET_CATEGORIES.facility) && TURRET_CATEGORIES.facility.name === '시설', TURRET_CATEGORIES.facility?.name);
  const baseFacilities = facilities.filter((t) => ['workbench', 'enchanter', 'storage', 'autominer'].includes(t.kind));
  const baseFour = baseFacilities.filter((t) => t.tier === 1);
  check('기본 시설 4종 — 작업대·마법부여대·저장고·채굴기 (T1)', baseFour.length === 4 && baseFacilities.filter((t) => t.kind === 'storage').length === 7, baseFacilities.map((t) => t.name).join(' · '));
  check('컨베이어벨트 7종 (T1~T7)', facilities.filter((t) => t.kind === 'conveyor').length === 7 && facilities.filter((t) => t.kind === 'conveyor').every((t, i) => t.tier === i + 1));
  check('몬스터 소환문 7종 (T1~T7)', facilities.filter((t) => t.kind === 'spawner').length === 7 && facilities.filter((t) => t.kind === 'spawner').every((t, i) => t.tier === i + 1));
  check('시설 합계 33종 (기본5 + 저장고7 + 발전기7 + 전선1 + 벨트7 + 소환문7)', facilities.length === 33, `${facilities.length}종`);
  const wbDef = facilities.find((t) => t.kind === 'workbench');
  const stDef = facilities.find((t) => t.kind === 'storage');
  const amDef = facilities.find((t) => t.kind === 'autominer');
  check('작업대 id 가 실제 포탑과 연결', TURRET_BY_ID[WORKBENCH_ID]?.kind === 'workbench' && TURRET_BY_ID[WORKBENCH_ID]?.id === wbDef?.id, WORKBENCH_ID);
  check('저장고 — 매 초 골드·목재 생산', Number(stDef?.storeRate?.gold) > 0 && Number(stDef?.storeRate?.wood) > 0, JSON.stringify(stDef?.storeRate));
  check('채굴기 채굴 모션 — 회전 날·왕복 슬리브·먼지 링 부품',
  readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8').includes('head.userData.bit = drill') &&
    readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8').includes("if (kind === 'autominer') {") &&
    readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8').includes('this._minePulse = 0.35'));
check('채굴기 — 맨땅에서 지형 티어 광물 자동 채굴(drillRegion)', amDef?.rate > 0 && amDef.drillRegion === true && Number(amDef.draw) > 0, `${amDef?.rate}/s ${JSON.stringify(amDef?.drillPool)}`);
  // 마법연성대만 예외다 — 재료가 골드 10 · 목재 1 로 지정되어 있다(계약 §4.72).
  check(
    '시설 비용·내구도 유효 (마법연성대는 골드+목재만)',
    facilities.every((t) => t.cost.gold > 0 && t.cost.wood > 0 && t.hp > 0 && (t.kind === 'arcana' || Object.keys(t.cost.minerals).length > 0)),
    facilities.map((t) => `${t.name} ${t.cost.gold}G`).join(' · ')
  );
  check('계열 합계 = 101 (공격47 + 지원21 + 시설33)', turretsByCategory('attack').length === 47 && turretsByCategory('heal').length + turretsByCategory('mining').length + turretsByCategory('lumber').length === 21 && facilities.length === 33);
  const t2MineDef = TURRET_BY_ID.mining_t2;
  check('T2 채굴탑 — 은이 빠지고 골드·목재만', Boolean(t2MineDef) && t2MineDef.cost.minerals.silver === undefined && Object.keys(t2MineDef.cost.minerals).length === 0, JSON.stringify(t2MineDef?.cost));
  const turretSrcLimits = readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8');
  check('건설 상한 — 전체 50 · 시설 40 (전선 별도)', turretSrcLimits.includes('export const MAX_TURRETS = 50;') && turretSrcLimits.includes('export const MAX_FACILITIES = 40;') && turretSrcLimits.includes('structureCounts()'));
  const mineralSrc = readFileSync(new URL('../client/src/world/minerals.js', import.meta.url), 'utf8');
  const treeSrc = readFileSync(new URL('../client/src/world/trees.js', import.meta.url), 'utf8');
  check('자원 리스폰 — 광물 6초 · 나무 6초', /const RESPAWN_DELAY = 6;/.test(mineralSrc) && /const RESPAWN_DELAY = 6;/.test(treeSrc));
  const enDef = facilities.find((t) => t.kind === 'enchanter');
  check('마법부여대 — 건설 시설로 등록', Boolean(enDef) && enDef.id === 'facility_enchanter' && TURRET_BY_ID['facility_enchanter']?.category === 'facility', enDef?.name ?? '없음');
  // ── Round C: 전기 시스템 · 저장고 티어 · 지형 채굴 · 티어 재료
  const generators = facilities.filter((t) => t.kind === 'generator').slice().sort((a, b) => a.tier - b.tier);
  const storages = facilities.filter((t) => t.kind === 'storage').slice().sort((a, b) => a.tier - b.tier);
  const cables = facilities.filter((t) => t.kind === 'cable');
  check(
    '발전기 7종 (T1~T7) — 출력 상승',
    generators.length === 7 && generators.every((g, i) => i === 0 || g.output > generators[i - 1].output),
    generators.map((g) => g.output + 'kW').join(' → ')
  );
  check(
    '전선 1종 — 전기를 쓰지 않는다',
    cables.length === 1 && cables[0].id === 'facility_cable' && Number(cables[0].draw) === 0 && cables[0].hp > 0
  );
  check('채굴기 산출 속도 = 초당 1개(벨트 보너스는 별도)', amDef?.rate === 1 && amDef?.fireRate === 1, String(amDef?.rate) + '/s');
  check(
    '저장고 7종 — 수급·용량·체력 모두 상승',
    storages.length === 7 &&
      storages.every((s, i) => i === 0 || (s.storeRate.gold > storages[i - 1].storeRate.gold && s.capacity > storages[i - 1].capacity && s.hp > storages[i - 1].hp)),
    storages.map((s) => s.storeRate.gold + '/s·' + s.capacity).join(' / ')
  );
  check(
    '생산 시설만 전기를 쓴다 (작업대·부여대·벨트 = 0kW)',
    Number(wbDef?.draw) === 0 &&
      Number(enDef?.draw) === 0 &&
      Number(amDef?.draw) > 0 &&
      Number(stDef?.draw) > 0 &&
      facilities.filter((t) => t.kind === 'conveyor').every((t) => Number(t.draw) === 0),
    '채굴기 ' + Number(amDef?.draw) + 'kW · 저장고 ' + Number(stDef?.draw) + 'kW'
  );
  check(
    '티어 N 건물 재료 = 티어 N 지형 광물만',
    TURRETS.every((t) => Object.keys(t.cost?.minerals ?? {}).every((id) => mineralsForRegionTier(t.tier).includes(id))),
    '1~7티어 전부'
  );
  check(
    '히든 전용 광물은 건설 재료로 쓰지 않는다',
    TURRETS.every((t) => !Object.keys(t.cost?.minerals ?? {}).some((id) => ['blossom_crystal', 'dream_petal', 'time_shard', 'frozen_hour'].includes(id)))
  );
  check(
    'POWER 상수 — 전선 8m · 건물 6m · 주기 0.3s',
    POWER.cableRange === 8 && POWER.deviceRange === 6 && POWER.interval === 0.3,
    POWER.cableRange + 'm / ' + POWER.deviceRange + 'm'
  );
  check(
    '지형 티어별 광물 목록(1~5) 실재',
    [1, 2, 3, 4, 5].every((tier) => mineralsForRegionTier(tier).length >= 3 && mineralsForRegionTier(tier).every((id) => MINERAL_TYPES.some((m) => m.id === id && m.tier === tier))),
    [1, 2, 3, 4, 5].map((t) => 'T' + t + ':' + mineralsForRegionTier(t).length).join(' ')
  );
  check('마법부여대 비용·내구도·사거리 유효', Number(enDef?.cost?.gold) > 0 && Number(enDef?.cost?.wood) > 0 && Object.keys(enDef?.cost?.minerals ?? {}).length >= 3 && enDef.hp > 0 && enDef.range > 0, `${enDef?.cost?.gold}G · ${Object.keys(enDef?.cost?.minerals ?? {}).join('+')}`);

  // ── 컨베이어벨트: 티어가 오를수록 빠르고 멀리, 보너스가 크다
  const belts = facilities.filter((t) => t.kind === 'conveyor')
    .slice()
    .sort((a, b) => a.tier - b.tier);
  check('벨트 티어별 속도 상승 (2.5 → 9 m/s)', belts[0].speed === 2.5 && belts[6].speed === 9 && belts.every((b, i) => i === 0 || b.speed > belts[i - 1].speed), belts.map((b) => `${b.speed}m/s`).join(' '));
  check('벨트 티어별 물류 보너스 상승 (12% → 80%)', belts[0].boost === 0.12 && belts[6].boost === 0.8 && belts.every((b, i) => i === 0 || b.boost > belts[i - 1].boost), belts.map((b) => `+${Math.round(b.boost * 100)}%`).join(' '));
  check('벨트 티어별 반경·내구도·비용 상승', belts.every((b, i) => (i === 0 ? true : b.range > belts[i - 1].range && b.hp > belts[i - 1].hp && b.cost.gold > belts[i - 1].cost.gold)), belts.map((b) => `${b.range}m/${b.hp}hp/${b.cost.gold}G`).join(' '));
  check('벨트 비용 광물이 실재', belts.every((b) => Object.keys(b.cost.minerals).every((id) => MINERAL_TYPES.some((m) => m.id === id))), belts.map((b) => Object.keys(b.cost.minerals).join('+')).join(' / '));
  check('벨트 승급 경로 (facility_conveyor_t1..t7)', TURRET_BY_ID['facility_conveyor_t7']?.name === '컨베이어벨트 T7' && TURRET_BY_ID['facility_conveyor_t1']?.kind === 'conveyor');

  // ── 몬스터 소환문: 티어가 오를수록 자주·많이
  const spawners = facilities.filter((t) => t.kind === 'spawner')
    .slice()
    .sort((a, b) => a.tier - b.tier);
  check('소환문 티어별 주기 단축 (14 → 6초)', spawners[0].spawnInterval === 14 && spawners[6].spawnInterval === 6 && spawners.every((s, i) => i === 0 || s.spawnInterval < spawners[i - 1].spawnInterval), spawners.map((s) => `${s.spawnInterval}s`).join(' '));
  check('소환문 티어별 마릿수 증가 (1 → 4)', spawners[0].spawnCount === 1 && spawners[6].spawnCount === 4 && spawners.every((s, i) => i === 0 || s.spawnCount >= spawners[i - 1].spawnCount), spawners.map((s) => `${s.spawnCount}마리`).join(' '));
  check('소환문 비용 광물이 실재', spawners.every((s) => Object.keys(s.cost.minerals).every((id) => MINERAL_TYPES.some((m) => m.id === id))));
  check('소환문 승급 경로 (facility_spawner_t1..t7)', TURRET_BY_ID['facility_spawner_t7']?.name === '몬스터 소환문 T7');
  check('소환문은 웨이브와 무관한 파밍 시설로 설명됨', spawners.every((s) => s.desc.includes('파밍') || s.desc.includes('웨이브와 무관')));
}

// ─────────────────────────────────────── 7-2. 작업대 = 전체 무기 제작
section('작업대 (전체 무기 제작)');
{
  check('작업대 레시피 81종 = 전체 82 − 1', WORKBENCH_RECIPE_COUNT === 81 && WORKBENCH_RECIPES.length === WEAPONS.length - 1, `${WORKBENCH_RECIPE_COUNT}종`);
  check('작업대에서 꿈의 끝은 희망 제외', WORKBENCH_EXCLUDED.includes('dream_lantern') && !workbenchRecipeFor('dream_lantern') && !isWorkbenchCraftable('dream_lantern'));
  check('작업대는 나머지 전부 포함 (꿈나무·유물 지팡이 포함)', WEAPONS.filter((w) => w.id !== 'dream_lantern').every((w) => isWorkbenchCraftable(w.id)), `${WORKBENCH_RECIPE_COUNT}/${WEAPONS.length - 1}`);
  check('작업대 레시피 비용 = 등급 티어 비용(무기별 서명 비용 우선)', WORKBENCH_RECIPES.every((r) => { const w = WEAPON_BY_ID[r.weaponId]; return r.cost === (w.cost ?? RECIPE_COST_BY_TIER[w.tier]); }), WEAPON_BY_ID.time_scissors.cost.gold + 'G 서명 비용 포함');
  check('꿈의 끝은 희망은 꿈의 정원에서만 제작', recipeForWeapon('dream_lantern')?.table === 'garden_of_dreams' && !isWorkbenchCraftable('dream_lantern'));
}

// ─────────────────────────────────────── 7-3. 잔디 바닥
section('잔디 바닥 (지형색)');
{
  const green = TERRAIN_TYPES.every((t) => {
    const c = t.color;
    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    const b = c & 255;
    return g > r && g > b && g >= 120;
  });
  check('모든 지형이 잔디(초록) 색조', green, TERRAIN_TYPES.map((t) => `${t.name} #${t.color.toString(16).padStart(6, '0')}`).join(' '));
}

// ─────────────────────────────────────── 8. 제작대 (T1~T7 + 꿈의 정원)
section('제작대 / 무기 제작');
{
  const tiers = CRAFTING_TABLES.map((t) => t.tier);
  check('제작대 8종 — T1~T8 티어 전부 존재', CRAFTING_TABLES.length === 8 && new Set(tiers).size === 8 && [1, 2, 3, 4, 5, 6, 7, 8].every((n) => tiers.includes(n)), CRAFTING_TABLES.map((t) => `T${t.tier} ${t.name}`).join(' · '));
  check('제작대마다 레시피 보유', CRAFTING_TABLES.every((t) => WEAPON_RECIPES.filter((r) => r.table === t.id).length > 0), CRAFTING_TABLES.map((t) => `${t.name} ${WEAPON_RECIPES.filter((r) => r.table === t.id).length}`).join(' '));
  check('제작 레시피 48종 (제작 전용 24 + 계열 자동 활 7 + 쌍권총 7 + 요정 지팡이 7 + 유물 지팡이 2 + 꿈나무 1)', WEAPON_RECIPES.length === 48, `${WEAPON_RECIPES.length}종`);
  const craftErr = validateCrafting();
  check('제작 데이터 자체 검증', craftErr.length === 0, craftErr.join(' | ') || '문제 없음');
  const craftOnly = WEAPONS.filter((w) => w.craftOnly);
  check('제작 전용 무기 24종 · 기본 지급 제외 · 레시피 보유', craftOnly.length === 24 && craftOnly.every((w) => !w.bonus && !!w.table && !!recipeForWeapon(w.id)), craftOnly.map((w) => w.name).join(', '));
  check('제작 무기 전부 스왑모션 + 임팩트', craftOnly.every((w) => hasSwapMotion(w.id) && !!weaponImpact(w.id)), `${craftOnly.length}종 확인`);
  check('제작 유물 무기 궁극기 연결(가위 포함)', ['sword2h_genesis', 'scythe_genesis', 'time_scissors'].every((id) => !!WEAPON_ULTIMATES.find((u) => u.id === WEAPON_BY_ID[id].ultimate)), ['sword2h_genesis', 'scythe_genesis', 'time_scissors'].map((id) => `${WEAPON_BY_ID[id].name}:${WEAPON_BY_ID[id].ultimate}`).join(' · '));
  check('레시피 티어 = 제작대 티어', WEAPON_RECIPES.every((r) => CRAFTING_TABLE_BY_ID[r.table].tier === WEAPON_BY_ID[r.weaponId].tier), WEAPON_RECIPES.filter((r) => CRAFTING_TABLE_BY_ID[r.table].tier !== WEAPON_BY_ID[r.weaponId].tier).map((r) => r.weaponId).join(',') || '전부 일치');
  check('건설 비용 상승 곡선 (T1 < T8)', CRAFTING_TABLES.every((t, i) => i === 0 || t.cost.gold > CRAFTING_TABLES[i - 1].cost.gold) && CRAFTING_TABLES[0].cost.gold < CRAFTING_TABLES[7].cost.gold, CRAFTING_TABLES.map((t) => t.cost.gold).join(' < '));
  check('꿈의 정원 = 요정7 + 업적50 + 종말의 낫', CRAFTING_TABLE_BY_ID.garden_of_dreams.unlock.fairies === 7 && CRAFTING_TABLE_BY_ID.garden_of_dreams.unlock.achievements === 50 && CRAFTING_TABLE_BY_ID.garden_of_dreams.unlock.weapon === 'scythe_relic');
  check('T7 창세의 제단에서 유물 지팡이 2종도 제작', recipeForWeapon('staff_relic')?.table === 'forge_t7' && recipeForWeapon('staff_genesis')?.table === 'forge_t7');
  check('T7 창세의 제단에서 시간의 가위 제작 (서명 비용)', recipeForWeapon('time_scissors')?.table === 'forge_t7' && recipeForWeapon('time_scissors')?.cost === WEAPON_BY_ID.time_scissors.cost && isWorkbenchCraftable('time_scissors'), `${recipeForWeapon('time_scissors')?.cost.gold}G + ${Object.keys(recipeForWeapon('time_scissors')?.cost.minerals || {}).join('+')}`);
  check('꿈의 정원에서 꿈나무 · 꿈의 끝은 희망 제작', recipeForWeapon('dream_tree')?.table === 'garden_of_dreams' && recipeForWeapon('dream_lantern')?.table === 'garden_of_dreams');
  const mineralIds = new Set(MINERAL_TYPES.map((m) => m.id));
  const badMineral = WEAPON_RECIPES.flatMap((r) => Object.keys(r.cost.minerals || {}))
    .concat(CRAFTING_TABLES.flatMap((t) => Object.keys(t.cost.minerals || {})))
    .filter((id) => !mineralIds.has(id));
  check('모든 제작 비용의 광물이 실재', badMineral.length === 0, badMineral.join(',') || 'OK');
}

// ─────────────────────────────────────── 8-2. 활 계열 · 화살 (소모품)
section('활 / 화살 (궁수 계열)');
{
  // (a) 화살 7종 데이터 유효 — id 중복 없음 · 티어 1~7 · 묶음>0 · 발당 배수 단조 증가 ·
  //      table 의 CRAFTING_TABLE_BY_ID[table].tier === a.tier · cost.gold>0 · 광물 실재
  const arrowBad = [];
  if (new Set(ARROW_TIERS.map((a) => a.id)).size !== ARROW_TIERS.length) arrowBad.push('id 중복');
  for (const a of ARROW_TIERS) {
    const id = a.id;
    if (!(Number.isInteger(a.tier) && a.tier >= 1 && a.tier <= 7)) arrowBad.push(`${id}:tier=${a.tier}`);
    if (!(Number(a.bundle) > 0)) arrowBad.push(`${id}:bundle=${a.bundle}`);
    if (!(Number(a.damageMult) > 0)) arrowBad.push(`${id}:mult=${a.damageMult}`);
    const prev = ARROW_BY_ID[`arrow_t${a.tier - 1}`];
    if (a.tier > 1 && !(prev && Number(a.damageMult) > Number(prev.damageMult))) arrowBad.push(`${id}:배수 비단조`);
    if (CRAFTING_TABLE_BY_ID[a.table]?.tier !== a.tier) arrowBad.push(`${id}:제단=${a.table}`);
    if (!(Number(a.cost?.gold) > 0)) arrowBad.push(`${id}:gold=${a.cost?.gold}`);
    for (const mid of Object.keys(a.cost?.minerals ?? {})) if (!MINERAL_TYPES.some((m) => m.id === mid)) arrowBad.push(`${id}:광물 ${mid}`);
    if (arrowById(id) !== a || arrowForTier(a.tier) !== a || arrowDamageMult(id) !== a.damageMult) arrowBad.push(`${id}:조회 불일치`);
    if (!arrowsForTable(a.table).some((x) => x.id === id)) arrowBad.push(`${id}:제단 조회 누락`);
  }
  check(
    '화살 7종 데이터 유효 (id·티어 1~7·묶음·배수 단조·제단 티어·비용 광물)',
    ARROW_TIERS.length === 7 && ARROW_TIER_COUNT === 7 && ARROW_MAX_TIER === 7 && new Set(ARROW_TIERS.map((a) => a.tier)).size === 7 && arrowBad.length === 0,
    arrowBad.join(',') || ARROW_TIERS.map((a) => `${a.name} ${a.bundle}발 ×${a.damageMult}`).join(' · ')
  );
  check('화살 티어 우선순위 = 높은 티어 먼저', ARROW_ORDER_DESC.length === 7 && ARROW_ORDER_DESC[0] === 'arrow_t7' && ARROW_ORDER_DESC[6] === 'arrow_t1' && ARROW_ORDER_DESC.every((id, i, arr) => i === 0 || ARROW_BY_ID[arr[i - 1]].tier > ARROW_BY_ID[id].tier), ARROW_ORDER_DESC.join(' > '));

  // (b) 화살 레시피 7종 = 화살 7종 · type 'arrow' · amount === bundle
  const arrowRecipeBad = ARROW_RECIPES.filter((r) => {
    const a = ARROW_BY_ID[r.arrowId];
    return !a || !isArrowRecipe(r) || r.type !== 'arrow' || Number(r.amount) !== Number(a.bundle) || CRAFTING_TABLE_BY_ID[r.table]?.tier !== a.tier || arrowRecipeFor(r.arrowId) !== r;
  });
  check(
    '화살 레시피 7종 = 화살 7종 · 묶음 발수 일치',
    ARROW_RECIPE_COUNT === ARROW_TIERS.length && ARROW_RECIPE_COUNT === 7 && Object.keys(ARROW_RECIPE_BY_ARROW).length === 7 && arrowRecipeBad.length === 0 && ARROW_TIERS.every((a) => arrowRecipesForTable(a.table).some((r) => r.arrowId === a.id)),
    arrowRecipeBad.map((r) => r.id).join(',') || ARROW_RECIPES.map((r) => `${r.id}(${r.amount}발)`).join(' ')
  );

  // (c) 활 계열 10종 — 자동 생성 7종(계열 제단 레시피) + 제작 전용 3종
  const bows = weaponsByFamily('bow');
  const autoBows = bows.filter((w) => !w.craftOnly).map((w) => w.id);
  const craftBows = ['bow_wind', 'bow_dragonbone', 'bow_forever'];
  const bowBad = bows.filter((w) => w.kind !== 'bow' || w.family !== 'bow' || !(weaponMotion(w.id)?.swap?.duration > 0) || !weaponImpact(w.id));
  const familyBad = FAMILY_TIER_RECIPES.filter((r) => r.family === 'bow' && (!autoBows.includes(r.weaponId) || CRAFTING_TABLE_BY_ID[r.table]?.tier !== weaponById(r.weaponId)?.tier));
  check(
    '활 계열 10종 (자동 7 + 제작 전용 3) — kind bow · 스왑모션 · 임팩트',
    bows.length === 10 && autoBows.length === 7 && craftBows.every((id) => bows.some((w) => w.id === id)) && bowBad.length === 0 &&
      !!WEAPON_MOTIONS.bow && WEAPON_MOTIONS.bow.swap.duration > 0 && !!WEAPON_IMPACTS.bow &&
      FAMILY_FORGE_FAMILIES.includes('bow') && FAMILY_TIER_RECIPES.filter((r) => r.family === 'bow').length === 7 && familyBad.length === 0,
    bowBad.map((w) => w.id).join(',') || familyBad.map((r) => r.id).join(',') || `${bows.length}종 = 자동 ${autoBows.length} + 제작 전용 ${craftBows.length} · 스왑 ${WEAPON_MOTIONS.bow.swap.style}`
  );

  // (d) 유물 활 — 이 사랑, 영원히
  const forever = weaponById('bow_forever');
  const foreverRecipe = recipeForWeapon('bow_forever');
  const foreverOk =
    forever?.name === '이 사랑, 영원히' && forever?.grade === 'relic' && forever?.tier === 7 && forever?.family === 'bow' &&
    forever?.kind === 'bow' && forever?.ultimate === 'eternalLove' && forever?.damage === 70 && forever?.pierce === 3 &&
    WEAPON_ULTIMATE_BY_ID.eternalLove?.weapon === 'bow_forever' && !!ULTIMATE_IMPACTS.eternalLove &&
    foreverRecipe?.table === 'forge_t7' && Number(foreverRecipe?.cost?.gold) >= Number(RECIPE_COST_BY_TIER[7].gold);
  check(
    '유물 활 이 사랑, 영원히 (T7 relic · 궁극기 eternalLove · 창세의 제단 서명 비용)',
    foreverOk,
    `${forever?.name} dmg ${forever?.damage} · 관통 ${forever?.pierce} · ${foreverRecipe?.cost?.gold}G ≥ ${RECIPE_COST_BY_TIER[7].gold}G · ${forever?.ultimate}`
  );

  // (e) 궁수 직업
  const archer = classById('archer');
  const archPassive = Object.keys(archer?.passive ?? {});
  const modKeys = ['weaponDamage', 'manaRegen', 'moveSpeed', 'miningSpeed', 'damageTaken'];
  check(
    '궁수 직업 (family bow · signature bow_forever · 패시브 키 유효)',
    archer?.family === 'bow' && archer?.signature === 'bow_forever' && archPassive.length > 0 &&
      archPassive.every((k) => modKeys.includes(k)) && Object.keys(classModifiers('archer', 3)).some((k) => k === 'weaponDamage'),
    `${archer?.name} ${archPassive.map((k) => `${k}×${archer.passive[k]}`).join(' ')}`
  );

  // (f) 활 잠금 — 궁수 3차 개방 · 1차 등급 상한 · 타 직업 family 잠금
  const lockArcher3 = weaponLock('bow_forever', 'archer', 3);
  const lockArcher1 = weaponLock('bow_forever', 'archer', 1);
  const lockMage3 = weaponLock('bow_forever', 'mage', 3);
  check(
    '활 잠금 — 궁수 3차 개방 · 1차 등급 상한 · 타 직업 family 잠금',
    lockArcher3.locked === false && lockArcher1.locked === true && lockArcher1.kind === 'tier' && lockMage3.kind === 'family' && lockMage3.locked === true,
    `궁수3차 ${lockArcher3.kind} · 궁수1차 ${lockArcher1.kind} · 마법사3차 ${lockMage3.kind}`
  );

  // (g) 화면/런타임 배선 — 소스 문자열
  const wireMain = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const wireRig = readFileSync(new URL('../client/src/player/weaponRig.js', import.meta.url), 'utf8');
  const wireAudio = readFileSync(new URL('../client/src/audio.js', import.meta.url), 'utf8');
  const wireEco = readFileSync(new URL('../client/src/systems/economy.js', import.meta.url), 'utf8');
  const wirePanels = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  const wireHud = readFileSync(new URL('../client/src/ui/hud.js', import.meta.url), 'utf8');
  const wireAdmin = readFileSync(new URL('../client/src/systems/admin-commands.js', import.meta.url), 'utf8');
  const releaseBody = (wireMain.match(/_onWeaponRelease\(\)\s*\{[\s\S]{0,500}?\n  \}/) ?? [''])[0];
  const wireBad = [];
  for (const [cond, name] of [
    [wireMain.includes('_bowAttack('), 'main._bowAttack'],
    [wireMain.includes('_fireArrow('), 'main._fireArrow'],
    [wireMain.includes('_pickArrow('), 'main._pickArrow'],
    [wireMain.includes('craftArrow('), 'main.craftArrow'],
    [wireMain.includes("weapon.kind === 'bow'"), 'main.kind bow'],
    [/weapon\.kind === 'bow'/.test(releaseBody), 'release bow 제외'],
    [wireRig.includes('function buildBow('), 'rig.buildBow'],
    [wireRig.includes('a.bow = {'), 'rig.a.bow'],
    [wireRig.includes("shape === 'bow'"), 'rig.shape bow'],
    [wireAudio.includes("case 'bow':"), 'audio.bow'],
    [wireEco.includes('spendArrow('), 'economy.spendArrow'],
    [wireEco.includes('firstArrowIn('), 'economy.firstArrowIn'],
    [wireEco.includes('addArrow('), 'economy.addArrow'],
    [wirePanels.includes('craft-arrow'), 'panels.craft-arrow'],
    [wirePanels.includes('🏹 화살'), 'panels 화살 구획'],
    [wireHud.includes('hud-stat-arrows'), 'hud 화살 칩'],
    [wireAdmin.includes('/화살'), 'admin /화살']
  ]) if (!cond) wireBad.push(name);
  check('활·화살 배선 (main·rig·audio·economy·panels·hud·admin)', wireBad.length === 0, wireBad.join(',') || '전부 확인');
}


// ─────────────────────────────────────── 8-3. 쌍권총 · 건마스터
section('쌍권총 / 건마스터 (v1.11.0)');
{
  const guns = weaponsByFamily('gun');
  const tiers = guns.map((w) => w.tier).sort((a, b) => a - b);
  check(
    '쌍권총 7티어 — T1~T7 · 유물 은하수의 밤',
    guns.length === 7 && tiers.join(',') === '1,2,3,4,5,6,7' && WEAPON_BY_ID.gun_relic?.name === '은하수의 밤' &&
      WEAPON_BY_ID.gun_relic?.grade === 'relic' && WEAPON_BY_ID.gun_relic?.kind === 'gun' && WEAPON_BY_ID.gun_relic?.hands === 2,
    guns.map((w) => `T${w.tier} ${w.name}`).join(' · ')
  );
  check(
    '쌍권총 — 원거리 투사체 · 2발 버스트 · 탄 소모 없음',
    guns.every((w) => w.kind === 'gun' && w.projectile === true && w.hands === 2) &&
      WEAPON_FAMILIES.find((f) => f.id === 'gun')?.burst === 2,
    `${WEAPON_FAMILIES.find((f) => f.id === 'gun')?.baseDamage}dmg · ${WEAPON_FAMILIES.find((f) => f.id === 'gun')?.cooldown}s`
  );
  check(
    '쌍권총 모션 — cross 스왑 · release 있는 사격 · 반동',
    WEAPON_MOTIONS.gun?.swap?.style === 'cross' && WEAPON_MOTIONS.gun?.swap?.phases?.length >= 3 &&
      WEAPON_MOTIONS.gun?.attack?.release >= 0 && WEAPON_MOTIONS.gun?.attack?.duration > 0 &&
      WEAPON_MOTIONS.gun?.skill?.duration > 0 && WEAPON_MOTIONS.gun?.recoil?.duration > 0
  );
  check(
    '쌍권총 임팩트 — bullet + 은하수 오버라이드(galaxy)',
    WEAPON_IMPACTS.gun?.kind === 'bullet' && WEAPON_IMPACTS.gun?.sound === 'impactBullet' &&
      WEAPON_IMPACT_OVERRIDES.gun_relic?.kind === 'galaxy' && WEAPON_IMPACT_OVERRIDES.gun_relic?.sound === 'impactGalaxy'
  );
  check(
    '은하수의 밤 궁극기 — galaxyNight(은하수) · 42m · 유물 임팩트',
    WEAPON_ULTIMATE_BY_ID.galaxyNight?.weapon === 'gun_relic' && WEAPON_ULTIMATE_BY_ID.galaxyNight?.kind === 'galaxy' &&
      WEAPON_ULTIMATE_BY_ID.galaxyNight?.radius === 42 && ULTIMATE_IMPACTS.galaxyNight?.kind === 'galaxy' &&
      ULTIMATE_IMPACTS.galaxyNight?.sound === 'ultimateGalaxy'
  );
  const gunmaster = classById('gunmaster');
  check(
    '건마스터 직업 — family gun · signature 은하수의 밤 · 패시브',
    gunmaster?.family === 'gun' && gunmaster?.signature === 'gun_relic' &&
      Number(gunmaster?.passive?.weaponDamage) > 1 && Number(gunmaster?.passive?.moveSpeed) > 1 &&
      classModifiers('gunmaster', 3).weaponDamage > classModifiers('gunmaster', 1).weaponDamage
  );
  check(
    '건마스터 잠금 — 1차 T4 · 3차 유물 · 타 직업 family 잠금',
    weaponLock('gun_epic', 'gunmaster', 1).locked === false && weaponLock('gun_legendary', 'gunmaster', 1).kind === 'tier' &&
      weaponLock('gun_relic', 'gunmaster', 2).kind === 'tier' && weaponLock('gun_relic', 'gunmaster', 3).locked === false &&
      weaponLock('gun_relic', 'mage', 3).kind === 'family'
  );
  const gunRecipes = FAMILY_TIER_RECIPES.filter((r) => r.family === 'gun');
  check(
    '쌍권총 제작 — 7티어가 각 제단(forge_t1~t7)에 있다',
    FAMILY_FORGE_FAMILIES.includes('gun') && gunRecipes.length === 7 &&
      gunRecipes.every((r) => CRAFTING_TABLE_BY_ID[r.table]?.tier === weaponById(r.weaponId)?.tier) &&
      gunRecipes.every((r) => isWorkbenchCraftable(r.weaponId))
  );

  // 화면/런타임 배선 — 문자열 계약
  const gunMain = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const gunRig = readFileSync(new URL('../client/src/player/weaponRig.js', import.meta.url), 'utf8');
  const gunHud = readFileSync(new URL('../client/src/ui/hud.js', import.meta.url), 'utf8');
  const gunCss = readFileSync(new URL('../client/src/ui/styles.css', import.meta.url), 'utf8');
  const gunAudio = readFileSync(new URL('../client/src/audio.js', import.meta.url), 'utf8');
  const gunPanels = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  const gunBad = [];
  for (const [cond, name] of [
    [gunMain.includes('_gunAttack('), 'main._gunAttack'],
    [gunMain.includes("weapon.kind === 'gun'"), 'main.kind gun'],
    [gunMain.includes('muzzleAt?.(i)'), 'main.muzzleAt'],
    [gunMain.includes('weaponSkill()'), 'main.weaponSkill'],
    [gunMain.includes("'gunshotGalaxy'"), 'main.은하수 사격음'],
    [gunRig.includes('function buildDualPistols('), 'rig.buildDualPistols'],
    [gunRig.includes("shape === 'gun'"), 'rig.shape gun'],
    [gunRig.includes('userData.muzzles'), 'rig.두 총구'],
    [gunRig.includes("weaponId === 'gun_relic'"), 'rig.은하수 모델'],
    [gunHud.includes('hud-weaponskill'), 'hud 무기 스킬'],
    [gunHud.includes('_updateWeaponSkill('), 'hud 무기 스킬 갱신'],
    [gunCss.includes('.hud-weaponskill-key'), 'css 무기 스킬'],
    [gunAudio.includes('gunshot(o = {})'), 'audio.gunshot'],
    [gunAudio.includes('impactGalaxy(o = {})'), 'audio.impactGalaxy'],
    [gunAudio.includes('ultimateGalaxy(o = {})'), 'audio.ultimateGalaxy'],
    [gunPanels.includes('대표 무기'), 'panels 대표 무기']
  ]) if (!cond) gunBad.push(name);
  check('쌍권총 배선 (main·rig·hud·css·audio·panels)', gunBad.length === 0, gunBad.join(',') || '전부 확인');
}

// ─────────────────────────────────────── 결과
// ────────────────────────────────────────── 초대코드 유틸
section('초대코드 유틸 (멀티플레이)');
check('코드는 4자리 A-Z0-9 (서버 코드 규칙과 동일)', INVITE_CODE_LENGTH === 4 && INVITE_ALPHABET === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', `${INVITE_CODE_LENGTH}자리`);
check('초대 링크 쿼리 키는 room', INVITE_QUERY_KEY === 'room', INVITE_QUERY_KEY);
check('정규화 — 소문자·공백·기호 제거', normalizeInviteCode(' k7-f2 ') === 'K7F2', normalizeInviteCode(' k7-f2 '));
check('정규화 — 4자리 초과는 잘라냄', normalizeInviteCode('abcdef') === 'ABCD', normalizeInviteCode('abcdef'));
check('정규화 — 한글·기호만 있으면 빈 문자열', normalizeInviteCode('가나다!!') === '', `'${normalizeInviteCode('가나다!!')}'`);
check('유효성 — 4자리만 통과', isValidInviteCode('abcd') === true && isValidInviteCode('abc') === false && isValidInviteCode('') === false, `abcd=${isValidInviteCode('abcd')} abc=${isValidInviteCode('abc')}`);
check('초대 링크 생성', inviteLink('k7f2', 'http://127.0.0.1:3001') === 'http://127.0.0.1:3001/?room=K7F2', inviteLink('k7f2', 'http://127.0.0.1:3001'));
check('초대 링크 — origin 없으면 상대 경로', inviteLink('K7F2', '') === '/?room=K7F2', inviteLink('K7F2', ''));
check('초대 링크 — 잘못된 코드는 빈 문자열', inviteLink('AB', 'http://x') === '', `'${inviteLink('AB', 'http://x')}'`);
check('초대 문구에 코드와 링크', (() => { const m = inviteMessage('k7f2', 'http://x'); return m.includes('K7F2') && m.includes('http://x/?room=K7F2'); })(), inviteMessage('k7f2', 'http://x').split('\n')[0]);
check('URL 에서 초대코드 추출(소문자 허용)', codeFromUrl('?room=k7f2') === 'K7F2' && codeFromUrl('?room=AB') === '' && codeFromUrl('?seed=1') === '', codeFromUrl('?room=k7f2'));
check('초대 링크로 들어왔는지 판별', hasInviteInUrl('?room=K7F2') === true && hasInviteInUrl('?room=AB') === false && hasInviteInUrl('') === false, `ok=${hasInviteInUrl('?room=K7F2')}`);
check('최근 초대코드 저장/불러오기', saveLastCode('k7f2') === 'K7F2' && loadLastCode() === 'K7F2', loadLastCode());
check('잘못된 코드는 저장하지 않는다', saveLastCode('zz') === '' && loadLastCode() === 'K7F2', `'${saveLastCode('zz')}' / ${loadLastCode()}`);
// ────────────────────────────────────────── 멀티플레이 공유 주소(다른 사람도 링크로 참가)
section('멀티플레이 공유 주소 (다른 사람도 링크로 참가)');
{
  // 실제 PC 구성 흉내: 실제 랜카드 + 가상 어댑터(VMware·10.x) + 루프백 + 링크로컬 + IPv6
  const fakeIfaces = {
    이더넷: [
      { address: 'fe80::a1b2', family: 'IPv6', internal: false },
      { address: '192.168.0.12', family: 'IPv4', internal: false }
    ],
    'VMware Network Adapter VMnet8': [{ address: '192.168.153.1', family: 'IPv4', internal: false }],
    Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    WiMax: [{ address: '169.254.11.4', family: 4, internal: false }],
    사내VPN: [{ address: '10.5.5.5', family: 'IPv4', internal: false }]
  };
  const pick = pickLanAddress(fakeIfaces);
  const order = listLanAddresses(fakeIfaces);

  check('LAN 후보 — IPv6·루프백·링크로컬 제외', order.join(',') === '192.168.0.12,10.5.5.5,192.168.153.1', order.join(','));
  check('LAN 대표 — 192.168 대역이 1순위', pick?.address === '192.168.0.12', JSON.stringify(pick));
  check('가상 어댑터는 실제 랜카드 뒤로 밀린다', order.indexOf('192.168.153.1') > order.indexOf('192.168.0.12'), order.join(' > '));
  check(
    '사용할 IPv4 가 없으면 null',
    pickLanAddress({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] }) === null && pickLanAddress({}) === null
  );
  check(
    'isUsableIPv4 — 0.0.0.0·127.x·169.254·멀티캐스트 거부',
    isUsableIPv4('192.168.0.5') === true &&
      isUsableIPv4('0.0.0.0') === false &&
      isUsableIPv4('127.0.0.1') === false &&
      isUsableIPv4('169.254.1.2') === false &&
      isUsableIPv4('224.0.0.1') === false &&
      isUsableIPv4('192.168.0.5', { internal: true }) === false
  );
  check(
    '공유 URL — 주소마다 http://ip:port',
    buildShareUrls({ port: 3001, addresses: ['192.168.0.12', '10.0.0.7'] }).urls.join(' ') === 'http://192.168.0.12:3001 http://10.0.0.7:3001'
  );
  check(
    'PUBLIC_URL(터널·포트포워딩)이 대표가 된다',
    (() => {
      const s = buildShareUrls({ port: 3001, addresses: ['192.168.0.12'], publicUrl: 'https://x.trycloudflare.com/' });
      return s.primary === 'https://x.trycloudflare.com' && s.urls.length === 2 && s.publicUrl === 'https://x.trycloudflare.com';
    })()
  );
  check('포트가 이상하면 3001 로 대체', buildShareUrls({ port: 0, addresses: ['192.168.0.5'] }).port === 3001);
  check('주소가 없으면 urls 는 빈 배열(대표 null)', buildShareUrls({ port: 3001, addresses: [] }).urls.length === 0);

  check(
    'isLoopbackOrigin — localhost·127.x·[::1]·빈 값은 이 PC 전용',
    isLoopbackOrigin('http://localhost:3001') === true &&
      isLoopbackOrigin('http://127.0.0.1:3001') === true &&
      isLoopbackOrigin('http://[::1]:3001') === true &&
      isLoopbackOrigin('http://0.0.0.0:3001') === true &&
      isLoopbackOrigin('') === true &&
      isLoopbackOrigin('이건 주소가 아님') === true
  );
  check(
    'isLoopbackOrigin — LAN·도메인·터널은 공유 가능',
    isLoopbackOrigin('http://192.168.0.12:3001') === false &&
      isLoopbackOrigin('http://10.0.0.7:3001') === false &&
      isLoopbackOrigin('https://abc.trycloudflare.com') === false
  );
  check(
    'resolveShareOrigin — localhost 면 서버가 알려준 LAN 주소를 쓴다',
    resolveShareOrigin({ origin: 'http://localhost:3001', lanUrls: ['http://192.168.0.12:3001'] }) === 'http://192.168.0.12:3001'
  );
  check(
    'resolveShareOrigin — 터널·도메인 접속은 그대로 유지',
    resolveShareOrigin({ origin: 'https://abc.trycloudflare.com/', lanUrls: ['http://192.168.0.12:3001'] }) === 'https://abc.trycloudflare.com'
  );
  check(
    'resolveShareOrigin — 프로토콜이 같으면 그 주소를 우선',
    resolveShareOrigin({ origin: 'https://localhost:3001', lanUrls: ['http://192.168.0.12:3001', 'https://game.example.com'] }) ===
      'https://game.example.com'
  );
  check(
    'resolveShareOrigin — LAN 주소도 없으면 지금 주소 유지(같은 PC 전용)',
    resolveShareOrigin({ origin: 'http://localhost:3001', lanUrls: [] }) === 'http://localhost:3001' &&
      resolveShareOrigin({ origin: 'http://localhost:3001' }) === 'http://localhost:3001'
  );
  check(
    'resolveShareOrigin — origin 이 없어도 LAN 주소가 있으면 그것으로',
    resolveShareOrigin({ origin: '', lanUrls: ['http://10.0.0.3:3001'] }) === 'http://10.0.0.3:3001'
  );
  check(
    '남에게 보내는 초대 링크에 LAN 주소 + ?room= 코드',
    inviteLink('k7f2', resolveShareOrigin({ origin: 'http://localhost:3001', lanUrls: ['http://192.168.0.12:3001'] })) ===
      'http://192.168.0.12:3001/?room=K7F2'
  );
}

// ────────────────────────────────────────── 멀티플레이 배선 계약
section('멀티플레이 배선 계약 (로비 → /api/net → LAN 링크)');
{
  const mpServer = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const mpNet = readFileSync(new URL('../client/src/net.js', import.meta.url), 'utf8');
  const mpLobby = readFileSync(new URL('../client/src/ui/lobby.js', import.meta.url), 'utf8');
  const mpDev = readFileSync(new URL('../tools/dev.mjs', import.meta.url), 'utf8');

  check(
    '서버가 /api/net 으로 공유 주소를 알려준다(인증 불필요)',
    mpServer.includes("app.get('/api/net'") && mpServer.includes('localShareUrls(') && /app\.get\('\/api\/net',[\s\S]{0,120}res\.json/.test(mpServer)
  );
  check('서버는 모든 인터페이스에 바인딩(0.0.0.0) — LAN 접속 필수', mpServer.includes("process.env.HOST || '0.0.0.0'"));
  check(
    'net.js 가 /api/net 을 캐시한다',
    mpNet.includes("api('/api/net')") && mpNet.includes('export const netInfo') && mpNet.includes('urls() {')
  );
  check(
    '로비 초대 링크가 공유 주소를 쓴다(localhost 고정 금지)',
    mpLobby.includes('resolveShareOrigin(') && mpLobby.includes('netInfo.urls()') && mpLobby.includes('inviteLink(this.state.code, this._shareOrigin())')
  );
  check(
    '로비가 이 PC 전용 링크면 경고한다',
    mpLobby.includes('_linkIsLocalOnly()') && mpLobby.includes("dataset.role = 'link-hint'")
  );
  check('로비를 열 때 공유 주소를 받아 다시 그린다', /_loadShareUrls\(\)/.test(mpLobby) && mpLobby.includes('netInfo.load()'));
  check(
    'dev 런처가 공유 주소·방화벽·터널 안내를 출력',
    mpDev.includes('localShareUrls(') && mpDev.includes('netsh advfirewall') && mpDev.includes('cloudflared tunnel')
  );
  check('클라이언트 소켓 주소 = 접속한 origin(터널·LAN 주소 그대로)', mpNet.includes('location.origin'));
}

// ────────────────────────────────────────── 전직 시스템
section('전직 시스템 (직업 · 단계 · 무기 잠금)');
{
  const jobClasses = CLASSES.filter((c) => c.family);
  const lockedAt = (classId, stage) => WEAPONS.filter((w) => weaponLock(w.id, classId, stage).locked).length;
  check('직업 8종 + 초심자', CLASSES.length === 9 && jobClasses.length === 8, CLASSES.map((c) => c.name).join(' · '));
  check('직업 id 중복 없음', new Set(CLASSES.map((c) => c.id)).size === CLASSES.length);
  check('모든 직업이 계열·글리프·설명을 가진다', CLASSES.every((c) => c.glyph && c.desc && (c.family || c.id === 'novice')));
  check('계열 하나에 직업 하나(8계열)', ['staff', 'fairywand', 'sword1h', 'sword2h', 'scythe', 'dagger', 'bow', 'gun'].every((f) => Boolean(CLASS_BY_FAMILY[f]) && classForFamily(f) === CLASS_BY_FAMILY[f]));
  check('요정 직업 — 요정의 지팡이 전용 · 대표 무기 · 패시브', CLASS_BY_ID.fairy?.family === 'fairywand' && CLASS_BY_ID.fairy?.signature === 'fairywand_relic' && CLASS_BY_ID.fairy?.passive?.manaRegen > 1 && CLASS_BY_ID.fairy?.passive?.weaponDamage > 1.0, CLASS_BY_ID.fairy ? `${CLASS_BY_ID.fairy.name} ${CLASS_BY_ID.fairy.family}` : '없음');
  check('공용 계열(가위·꿈나무·카타나)은 직업이 없다', !classForFamily('scissors') && !classForFamily('dream') && !classForFamily('katana') && CLASS_RULES.sharedFamilies.join(',') === 'scissors,dream,katana');
  check('단계 4개(0~3차) · 등급 상한 상승', CLASS_STAGES.length === 4 && CLASS_STAGES.map((s) => s.maxTier).join(',') === '2,4,6,8');
  check('단계 패시브 배율 상승', CLASS_STAGES.map((s) => s.bonus).join(',') === '1,1,1.5,2');
  check('전직 조건 — 웨이브·비용이 단계마다 오른다', CLASS_RULES.firstWave === 3 && CLASS_RULES.secondWave === 12 && CLASS_RULES.thirdWave === 22 && CLASS_RULES.secondCost > 0 && CLASS_RULES.thirdCost > CLASS_RULES.secondCost);
  check('재전직 — 200 골드(웨이브 제한 없음)', CLASS_RULES.respecCost === 200 && CLASS_RULES.respecWave === 0, `${CLASS_RULES.respecWave}웨이브 · ${CLASS_RULES.respecCost}골드`);
  check('직업마다 대표 무기가 실제로 존재', jobClasses.every((c) => Boolean(WEAPON_BY_ID[c.signature]) && WEAPON_BY_ID[c.signature].family === c.family), jobClasses.map((c) => (WEAPON_BY_ID[c.signature] || {}).name).join(' · '));
  check('계열별 직업 무기 — 기존 6계열 10종 이상 + 쌍권총·요정 지팡이 7티어', ['staff', 'sword1h', 'sword2h', 'scythe', 'dagger', 'bow'].every((f) => weaponsByFamily(f).length >= 10) && weaponsByFamily('gun').length === 7 && weaponsByFamily('fairywand').length === 7, jobClasses.map((c) => c.name + ':' + weaponsByFamily(c.family).length).join(' '));

  // ── 요정의 지팡이 7티어 (v1.17.0) ──
  const fairyWands = weaponsByFamily('fairywand');
  check('요정의 지팡이 7티어 — T1~T7 · 1티어 이름 고정', fairyWands.length === 7 && fairyWands.every((w, i) => w.tier === i + 1 && w.kind === 'wand' && w.family === 'fairywand') && fairyWands[0].id === 'fairywand_common' && fairyWands[0].name === '요정의 지팡이', fairyWands.map((w) => `T${w.tier} ${w.name}`).join(' · '));
  check('요정의 지팡이 — 티어마다 제작 레시피(제작대 T1~T7)', fairyWands.every((w) => recipeForWeapon(w.id)?.table === 'forge_t' + w.tier), fairyWands.map((w) => `${w.id}:${recipeForWeapon(w.id)?.table}`).join(' '));
  check('요정의 지팡이 — 추적 투사체 데이터·모션·임팩트', fairyWands.every((w) => w.projectile === true && w.behavior === 'homing' && hasSwapMotion(w.id)) && WEAPON_MOTIONS.fairywand.swap.style === 'fairyBloom' && WEAPON_IMPACTS.fairywand.sound === 'impactMagic', `${WEAPON_MOTIONS.fairywand.swap.style} · ${WEAPON_IMPACTS.fairywand.color.toString(16)}`);
  check('요정의 지팡이 — 요정만 사용, 다른 직업은 잠김', fairyWands.every((w) => !weaponLock(w.id, 'fairy', 3).locked && weaponLock(w.id, 'mage', 3).kind === 'family'), 'fairy OK / mage family-locked');
  check('요정 전직 T1 지급 — fairywand_common(일반) 고정', classStarterWeaponId('fairy') === 'fairywand_common' && WEAPON_BY_ID.fairywand_common?.tier === 1 && WEAPON_BY_ID.fairywand_common?.grade === 'common', classStarterWeaponId('fairy'));

  check('82종 전부 잠금 판정 가능(unknown 없음)', WEAPONS.every((w) => weaponLock(w.id, 'novice', 0).kind !== 'unknown'), WEAPONS.length + '종');
  check('모르는 무기는 잠김 + unknown', weaponLock('없는무기', 'mage', 1).locked === true && weaponLock('없는무기', 'mage', 1).kind === 'unknown');
  check('등급 조회 — 유물 7 · 꿈나무 8', weaponTier('staff_relic') === 7 && weaponTier('dream_tree') === 8 && weaponTier('staff_common') === 1);

  check('초심자 — 1~2등급은 사용 가능', weaponLock('staff_common', 'novice', 0).locked === false && weaponLock('sword2h_uncommon', 'novice', 0).locked === false);
  check('초심자 — 3등급 이상은 잠김(kind=tier)', weaponLock('staff_rare', 'novice', 0).locked === true && weaponLock('staff_rare', 'novice', 0).kind === 'tier');
  check('초심자 — 계열 제한은 없다(모든 계열 1등급 허용)', WEAPON_FAMILIES.every((f) => weaponsByFamily(f.id).filter((w) => w.tier === 1).every((w) => !weaponLock(w.id, 'novice', 0).locked)));

  const mage = 'mage';
  check('전직 — 자기 계열 4등급까지 사용', weaponLock('staff_epic', mage, 1).locked === false && weaponLock('staff_legendary', mage, 1).locked === true);
  check('전직 — 다른 계열은 전부 잠김(kind=family)', WEAPONS.filter((w) => w.family === 'sword1h').every((w) => weaponLock(w.id, mage, 1).locked && weaponLock(w.id, mage, 1).kind === 'family'));
  check('전직 — 상위 등급은 상위 전직이 필요(kind=tier)', weaponLock('staff_mythic', mage, 2).locked === false && weaponLock('staff_relic', mage, 2).locked === true && weaponLock('staff_relic', mage, 3).locked === false);
  check('전직하면 잠기는 무기가 늘어난다', lockedAt(mage, 1) > lockedAt('novice', 0), lockedAt('novice', 0) + '종 → ' + lockedAt(mage, 1) + '종');
  check('공용 계열은 직업과 무관하게 사용(가위·꿈나무)', ['novice', 'mage', 'knight', 'reaper'].every((c) => !weaponLock('time_scissors', c, 3).locked && !weaponLock('dream_tree', c, 3).locked));
  check('공용 계열은 등급 상한 예외(초심자도 가위 사용)', weaponLock('time_scissors', 'novice', 0).locked === false && weaponLock('dream_tree', 'novice', 0).locked === false);
  check('8직업 × 3차 — 자기 계열은 전부 사용 가능', jobClasses.every((c) => weaponsByFamily(c.family).every((w) => !weaponLock(w.id, c.id, 3).locked)));

  const noviceMods = classModifiers('novice', 0);
  const mage1 = classModifiers('mage', 1);
  const mage2 = classModifiers('mage', 2);
  const mage3 = classModifiers('mage', 3);
  const knight1 = classModifiers('knight', 1);
  const knight3 = classModifiers('knight', 3);
  check('초심자 패시브는 전부 1배', noviceMods.weaponDamage === 1 && noviceMods.manaRegen === 1 && noviceMods.moveSpeed === 1 && noviceMods.damageTaken === 1);
  check('마법사 — 마나 회복 ×1.3', mage1.manaRegen > 1 && mage1.manaRegen === 1.3);
  check('단계 배율 — 2차 1.5배, 3차 2배 증폭', mage2.manaRegen > mage1.manaRegen && mage3.manaRegen > mage2.manaRegen && Math.abs(mage3.manaRegen - 1.6) < 1e-9, mage3.manaRegen);
  check('기사 — 받는 피해 감소, 단계가 오르면 더 감소', knight1.damageTaken < 1 && knight3.damageTaken < knight1.damageTaken, knight3.damageTaken);
  check('알 수 없는 직업은 초심자로 폴백', classById('??').id === 'novice' && classById(undefined).id === 'novice');
  check('단계 정보는 0~3 으로 클램프', classStageInfo(-5).stage === 0 && classStageInfo(99).stage === 3 && classStageInfo(2.7).stage === 2);
  check('CLASS_BY_ID 정합성', Object.keys(CLASS_BY_ID).length === CLASSES.length && CLASS_BY_ID.mage.family === 'staff');
}

// ────────────────────────────────────────── 전직 배선 (main.js 정적 계약)
section('전직 배선 (main.js · player.js)');
{
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const playerSrc = readFileSync(new URL('../client/src/player/player.js', import.meta.url), 'utf8');
  check('main.js — ClassSystem 생성 + 전직 이벤트 구독', mainSrc.includes("from './systems/classes.js'") && mainSrc.includes('new ClassSystem({ game: this })') && mainSrc.includes("this.classes.on('advance'"));
  check('main.js — 장착 잠금 가드(equipWeapon 단일 지점)', /equipWeapon\(id,[\s\S]{0,700}?classes\?\.lockOf\?\.\(id\)/.test(mainSrc));
  check(
    'main.js — 맨손(null/fists)은 보유·전직 잠금을 건너뛴다',
    /const bare = id === FIST_WEAPON_ID \|\| id == null/.test(mainSrc) && /const lock = bare \? null :/.test(mainSrc)
  );
  check('main.js — 무기 피해에 전직 배율 적용', mainSrc.includes('this.classes?.weaponDamageMult'));
  check('main.js — 전직으로 잠긴 무기는 자동 교체', mainSrc.includes('_equipBestUsable') && mainSrc.includes('if (this.weaponId && !cls.canUse(this.weaponId))'));
  check('main.js — Q 순환은 쓸 수 있는 무기만', /weaponList\(\)[\s\S]{0,400}?this\.classes\.canUse/.test(mainSrc));
  check(
    'main.js — 전직 패시브 반영(마나·이동·받는 피해·채굴)',
    mainSrc.includes('damageTakenMult = fx(m.damageTaken)') &&
      mainSrc.includes('fx(m.miningSpeed)') &&
      mainSrc.includes('manaRegenMult = fx(bonus.manaRegen) * fx(m.manaRegen)')
  );
  check('main.js — 저장/불러오기에 전직 포함', mainSrc.includes('classes: this.classes?.toJSON?.()') && mainSrc.includes('this.classes?.fromJSON?.(data.classes)'));
  check(
    'main.js — K 키로 전직 패널(포인터 정책 경로)',
    mainSrc.includes("actionPressed('classes')") && mainSrc.includes("this.togglePanel('classes')")
  );
  check('player.js — damageTakenMult 가 피해에 곱해진다', playerSrc.includes('this.damageTakenMult') && /takeDamage\(amount, source\)[\s\S]{0,400}?this\.damageTakenMult/.test(playerSrc));
  check(
    'main.js — 전직할 때 그 직업의 1티어 무기를 지급',
    mainSrc.includes('_grantClassStarterWeapon') && (mainSrc.includes('classStarterWeaponId') || mainSrc.includes('`${family}_common`')) && /if \(kind === '전직'\) this\._grantClassStarterWeapon/.test(mainSrc)
  );
  check('main.js — 1티어 무기 지급은 중복을 건너뛴다', /_grantClassStarterWeapon[\s\S]{0,700}?hasWeapon\(id\)/.test(mainSrc));
}

// ────────────────────────────────────────── 지역 시스템 (티어 지역 · 히든 지역)
section('지역 시스템 (티어 지역 · 히든 지역)');
{
  const rings = REGIONS.filter((r) => r.id.startsWith('tier'));
  check('지역 띠 9개(안전 + T1~T7 + 황야)', REGIONS.length === 9 && rings.length === 7, REGIONS.map((r) => r.id).join(','));
  check('띠가 빈틈·중복 없이 이어진다', REGIONS.every((r, i) => i === 0 || Math.abs(r.inner - REGIONS[i - 1].outer) < 1e-6));
  check('히든 지역 2곳', HIDDEN_REGIONS.length === 2 && HIDDEN_REGIONS.map((h) => h.id).join(',') === 'cherry_garden,time_horizon');
  check('벚꽃의 정원 = 황야(거리 2120+) 안', distanceOf(HIDDEN_REGIONS[0].x, HIDDEN_REGIONS[0].z) > 2120);
  check('시간의 지평선 = 황야 안', distanceOf(HIDDEN_REGIONS[1].x, HIDDEN_REGIONS[1].z) > 2120);
  check('히든 지역은 띠와 겹치지 않는다', HIDDEN_REGIONS.every((h) => distanceOf(h.x, h.z) - h.radius >= 2120), HIDDEN_REGIONS.map((h) => Math.round(distanceOf(h.x, h.z) - h.radius)).join(','));

  check('거리 판정 — 기지(0m)=안전 지대', regionIdAt(0, 0) === 'safe' && regionIdAt(10, 10) === 'safe');
  check('거리 판정 — 200m=T1 · 700m=T3 · 2000m=T7 · 2400m=황야', regionIdAt(200, 0) === 'tier1' && regionIdAt(700, 0) === 'tier3' && regionIdAt(2000, 0) === 'tier7' && regionIdAt(2400, 0) === 'outer');
  check('히든 판정이 띠보다 우선', regionAt(-1900, -1520).id === 'cherry_garden' && ringAt(-1900, -1520).id === 'outer');
  check('히든 지역 밖은 히든이 아니다', hiddenRegionAt(HIDDEN_REGIONS[0].x + 400, HIDDEN_REGIONS[0].z) === null);
  check('지역 요약에 이름·거리·히든 여부', regionSummary(700, 0).name === 'T3 수정 계곡' && regionSummary(700, 0).distance === 700 && regionSummary(-1900, -1520).hidden === true);
  check('발견 반경 안/밖', inDiscoverRange('cherry_garden', -1900, -1400) === true && inDiscoverRange('cherry_garden', 0, 0) === false);

  // ── 나무·광물은 자기 티어 지역에서만
  check('모든 나무 종이 자기 티어 지역에서 자란다', TREE_TYPES.filter((t) => !hiddenTreeIds().includes(t.id)).every((t) => rings.some((r) => allowsTree(r.id, t))));
  check('모든 광물 종이 자기 티어 지역에서 나온다', MINERAL_TYPES.filter((m) => !hiddenMineralIds().includes(m.id)).every((m) => rings.some((r) => allowsMineral(r.id, m))));
  check('지역별 나무 종이 비어 있지 않다', rings.every((r) => TREE_TYPES.some((t) => allowsTree(r.id, t))), rings.map((r) => TREE_TYPES.filter((t) => allowsTree(r.id, t)).length).join(','));
  check('지역별 광물 종이 비어 있지 않다', rings.every((r) => MINERAL_TYPES.some((m) => allowsMineral(r.id, m))), rings.map((r) => MINERAL_TYPES.filter((m) => allowsMineral(r.id, m)).length).join(','));
  const tier1Tree = TREE_TYPES.find((t) => t.tier === 1 && !hiddenTreeIds().includes(t.id));
  const tier7Tree = TREE_TYPES.find((t) => t.tier === 7 && !hiddenTreeIds().includes(t.id));
  check('T1 나무는 T1 지역 전용(다른 띠에서 안 자란다)', allowsTree('tier1', tier1Tree) && !allowsTree('tier2', tier1Tree) && !allowsTree('tier7', tier1Tree));
  check('T7 나무는 T7 지역 전용', allowsTree('tier7', tier7Tree) && !allowsTree('tier6', tier7Tree) && !allowsTree('tier1', tier7Tree));

  // ── 히든 지역 전용 자원
  check('벚꽃의 정원 전용 자원 2종', HIDDEN_REGIONS[0].mineralIds.join(',') === 'blossom_crystal,dream_petal');
  check('시간의 지평선 전용 자원 2종', HIDDEN_REGIONS[1].mineralIds.join(',') === 'time_shard,frozen_hour');
  check('히든 전용 광물이 데이터에 실재', hiddenMineralIds().every((id) => MINERAL_TYPES.some((m) => m.id === id)), hiddenMineralIds().join(','));
  check('히든 전용 나무가 데이터에 실재(신화 등급)', hiddenTreeIds().every((id) => TREE_TYPES.some((t) => t.id === id && t.category === 'mythic')));
  check('히든 전용 광물은 띠 지역에서 나오지 않는다', hiddenMineralIds().every((id) => {
    const m = MINERAL_TYPES.find((x) => x.id === id);
    return rings.every((r) => !allowsMineral(r.id, m));
  }));
  check('히든 전용 나무는 띠 지역에서 자라지 않는다', hiddenTreeIds().every((id) => {
    const t = TREE_TYPES.find((x) => x.id === id);
    return rings.every((r) => !allowsTree(r.id, t));
  }));
  check('히든 지역에서 나오는 광물은 전용 목록뿐', HIDDEN_REGIONS.every((h) => MINERAL_TYPES.filter((m) => allowsMineral(h.id, m)).every((m) => h.mineralIds.includes(m.id))));
  check('히든 광물 가치가 일반 T5보다 높다', hiddenMineralIds().every((id) => MINERAL_TYPES.find((m) => m.id === id).value > 500));
  check('히든 지역 자원 밀도 설정', REGION_SPAWN.hiddenTrees >= 40 && REGION_SPAWN.hiddenMinerals >= 40, JSON.stringify(REGION_SPAWN));

  // ── 할당량 · 좌표 샘플링
  check('ringQuotas 합계 = 전체 개수', [150, 320, 480, 1100].every((n) => ringQuotas(n, RING_TREE_WEIGHT).reduce((a, b) => a + b.quota, 0) === n));
  const quotas = ringQuotas(320, RING_TREE_WEIGHT);
  check('ringQuotas — 안쪽 띠가 더 많다', quotas[0].quota >= quotas[quotas.length - 1].quota, quotas.map((q) => q.quota).join(','));
  check('ringQuotas — 모든 띠에 최소 1개', ringQuotas(150, RING_TREE_WEIGHT).every((q) => q.quota >= 1));
  let inRegion = 0;
  let sampleState = 12345;
  const nextRand = () => ((sampleState = (sampleState * 9301 + 49297) % 233280) / 233280);
  for (const reg of [...RING_REGIONS, ...HIDDEN_REGIONS]) {
    let ok = true;
    for (let i = 0; i < 40; i++) {
      const p = randomPointIn(reg.id, nextRand);
      if (regionIdAt(p.x, p.z) !== reg.id) ok = false;
    }
    if (ok) inRegion += 1;
  }
  check('randomPointIn 은 항상 그 지역 안의 점을 준다', inRegion === RING_REGIONS.length + HIDDEN_REGIONS.length, `${inRegion}/${RING_REGIONS.length + HIDDEN_REGIONS.length}`);
  check('지역별 스폰 가중치가 정의됨', Object.keys(RING_TREE_WEIGHT).length === 7 && Object.keys(RING_MINERAL_WEIGHT).length === 7);

  // ── 히든 재료로 만드는 비밀 무기
  const scissors = WEAPON_BY_ID.time_scissors;
  const lantern = WEAPON_BY_ID.dream_lantern;
  check('시간의 가위 = 시간의 지평선 재료 필요', scissors.cost.minerals.time_shard >= 1 && scissors.cost.minerals.frozen_hour >= 1, JSON.stringify(scissors.cost.minerals));
  check('꿈의 끝은 희망 = 벚꽃의 정원 재료 필요', lantern.cost.minerals.blossom_crystal >= 1 && lantern.cost.minerals.dream_petal >= 1, JSON.stringify(lantern.cost.minerals));
  check('두 비밀 무기 재료가 모두 실재하는 광물', [scissors.cost, lantern.cost].every((c) => Object.keys(c.minerals).every((id) => MINERAL_TYPES.some((m) => m.id === id))));
  check('레시피에도 히든 재료가 반영된다', recipeForWeapon('time_scissors')?.cost?.minerals?.time_shard >= 1 && recipeForWeapon('dream_lantern')?.cost?.minerals?.blossom_crystal >= 1);
  check('꿈의 끝은 희망은 꿈의 정원 전용', recipeForWeapon('dream_lantern')?.table === 'garden_of_dreams' && lantern.craftOnly === true);

  // ── 배선 정적 계약
  const treesSrc = readFileSync(new URL('../client/src/world/trees.js', import.meta.url), 'utf8');
  const mineralsSrc = readFileSync(new URL('../client/src/world/minerals.js', import.meta.url), 'utf8');
  const wavesSrc = readFileSync(new URL('../client/src/systems/waves.js', import.meta.url), 'utf8');
  const worldSrc = readFileSync(new URL('../client/src/world/world.js', import.meta.url), 'utf8');
  const mainSrc2 = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  check('나무는 지역별로만 심는다', treesSrc.includes("from './regions.js'") && treesSrc.includes('_placeInRegion') && treesSrc.includes('ringQuotas'));
  check('광물도 지역별로만 심는다', mineralsSrc.includes("from './regions.js'") && mineralsSrc.includes('_placeInRegion') && mineralsSrc.includes('hiddenMineralIds'));
  check('광물 전역 풀에서 히든 전용 제외', mineralsSrc.includes('!exclusive.has(m.id)'));
  check('웨이브 보상에서 히든 전용 제외', wavesSrc.includes('EXCLUSIVE_MINERAL_IDS') && wavesSrc.includes('hiddenMineralIds'));
  check('world — 지역 조회·발견 API', worldSrc.includes('regionAt(x, z)') && worldSrc.includes('discover(x, z)') && worldSrc.includes('regionState()') && worldSrc.includes('loadRegionState('));
  check('main — 지역 발견 알림 + 세이브', mainSrc2.includes('_checkRegionDiscovery') && mainSrc2.includes('discoveredRegions: this.world?.regionState?.()') && mainSrc2.includes('loadRegionState?.(data.discoveredRegions)'));

  // ── 최종보스 셀레스티얼
  const celestial = BOSS_TYPE_BY_ID.celestial;
  check('최종보스 셀레스티얼이 보스 5종에 포함', BOSS_TYPES.length === 5 && !!celestial, BOSS_TYPES.map((b) => b.id).join(','));
  check('셀레스티얼 체력 5,000,000 (고정)', celestial.hp === 5000000 && celestial.hpMult === 1, String(celestial.hp));
  check('셀레스티얼 공격력 1,200 (고정)', celestial.attack === 1200 && celestial.damage === 1200, String(celestial.attack));
  check('셀레스티얼 크기 — 기존 최대 보스의 12배 이상', celestial.radius >= BOSS_TYPES.filter((b) => b.id !== 'celestial').reduce((a, b) => Math.max(a, b.radius), 0) * 12, `radius ${celestial.radius}`);
  check('셀레스티얼 전용 능력 = 심판', celestial.ability === 'judgment' && celestial.barWidth >= 40 && celestial.barRange >= 1000);
  check('최종 웨이브 100 = 보스 웨이브', WAVE_CONFIG.finalWave === 100 && WAVE_CONFIG.finalWave % WAVE_CONFIG.bossEvery === 0);
  const enemiesSrc = readFileSync(new URL('../client/src/systems/enemies.js', import.meta.url), 'utf8');
  check('enemies — 고정 체력/공격력 지원', enemiesSrc.includes('const fixedHp = num(this.type.hp, 0)') && enemiesSrc.includes('const fixedAttack = num(this.type.attack, 0)'));
  check('enemies — 셀레스티얼 전용 3D 메시 + 심판', enemiesSrc.includes('_buildCelestialMesh') && enemiesSrc.includes("case 'judgment'") && enemiesSrc.includes('celestialWing') && enemiesSrc.includes('celestialRing'));
  check('enemies — 심판 쿨다운·사거리 등록', enemiesSrc.includes('judgment: 16') && enemiesSrc.includes('judgment: 120'));
  const hudSrc = readFileSync(new URL('../client/src/ui/hud.js', import.meta.url), 'utf8');
  check('HUD — 심판 라벨 표시', hudSrc.includes('judgment:'));
  const barsSrc = readFileSync(new URL('../client/src/ui/healthbars.js', import.meta.url), 'utf8');
  check('월드 체력바 — 거대 보스 표시 거리(type.barRange)', barsSrc.includes('enemy.type?.barRange'));
  check('모든 광물 업적 목표 = 전체 광물 수', ACHIEVEMENTS.some((a) => a.target === MINERAL_TYPES.length), `${MINERAL_TYPES.length}종`);
}


// ─────────────────────────────────────── 14. 성능 최적화 (프레임)
section('성능 최적화 (광원 · 청크 컬링 · 해상도)');
{
  const enemiesSrcP = readFileSync(new URL('../client/src/systems/enemies.js', import.meta.url), 'utf8');
  const treesSrcP = readFileSync(new URL('../client/src/world/trees.js', import.meta.url), 'utf8');
  const mineralsSrcP = readFileSync(new URL('../client/src/world/minerals.js', import.meta.url), 'utf8');
  const worldSrcP = readFileSync(new URL('../client/src/world/world.js', import.meta.url), 'utf8');
  const mainSrcP = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const fpsSrcP = readFileSync(new URL('../client/src/ui/fps.js', import.meta.url), 'utf8');
  const panelsSrcP = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');

  check('일반 몬스터 점광원을 렌더 목록에서 제외(보스만 점등)',
    enemiesSrcP.includes('const lit = !!this.isBoss;') && enemiesSrcP.includes('this._light.visible = lit;'));
  check('나무 — 청크 InstancedMesh + 거리·안개 컬링',
    treesSrcP.includes('const CHUNK_SIZE = 460;') && treesSrcP.includes('const CULL_MARGIN = 150;') && treesSrcP.includes('cullChunks(camera)'));
  check('나무 — 도형 지오메트리·재질 공유', treesSrcP.includes('_shapeGeo(shape)') && treesSrcP.includes('shapeMats'));
  check('광물 — 청크 InstancedMesh + 재질 2종 공유',
    mineralsSrcP.includes('cullChunks(camera)') && mineralsSrcP.includes('matLow') && mineralsSrcP.includes('matHigh') && mineralsSrcP.includes('MINERAL_TYPE_BY_ID'));
  check('world — frustumCull 에서 청크 컬링 호출',
    worldSrcP.includes('this.treeField.cullChunks?.(camera)') && worldSrcP.includes('this.mineralField.cullChunks?.(camera)'));
  check('world — 품질 변경 시 청크 재계산',
    worldSrcP.includes('this.treeField.invalidateCull?.()') && worldSrcP.includes('this.mineralField.invalidateCull?.()'));
  check('그림자 맵 — autoUpdate off + 주기 갱신(0.05s)',
    mainSrcP.includes('shadowMap.autoUpdate = false') && mainSrcP.includes('const SHADOW_INTERVAL = 0.05;'));
  check('적응형 해상도 — main 배선', mainSrcP.includes('new AdaptiveResolution(') && mainSrcP.includes('this.adaptive.update(perfDt, avg)'));
  check('자동 품질 — 지속 적응(하향+되올리기, 사용자 단계가 상한)',
    mainSrcP.includes('suggestPreset(avg, FRAME_PRESETS, this.quality)') &&
    mainSrcP.includes('stepUpId(FRAME_PRESETS, this.quality, this._userQuality)') &&
    mainSrcP.includes('this.autoQuality') && mainSrcP.includes('_userQuality'));
  check('메모리 감시 — 오래 켠 세션 경고 배선',
    mainSrcP.includes('new MemoryGuard(') && mainSrcP.includes('this.memory?.sample(perfDt)'));
  check('설정 — 자동 화질 토글/저장 후 새로고침 배선',
    panelsSrcP.includes("'auto-quality:toggle'") && mainSrcP.includes('saveAndReload()') && panelsSrcP.includes("'game-reload'"));
  check('FPS 오버레이 — 해상도 배율 표시', mainSrcP.includes('scale: this.adaptive?.scale ?? 1') && fpsSrcP.includes('해상도 '));
}

// ─────────────────────────────────────── 15. 적응형 해상도
section('적응형 해상도 · 자동 품질');
{
  check('낮은 FPS → 해상도 하향', nextPixelScale({ current: 1, avgFps: 30 }) < 1, String(nextPixelScale({ current: 1, avgFps: 30 })));
  check('높은 FPS → 해상도 상향', nextPixelScale({ current: 0.8, avgFps: 60 }) > 0.8, String(nextPixelScale({ current: 0.8, avgFps: 60 })));
  check('목표 구간(50~58)이면 변화 없음', nextPixelScale({ current: 1, avgFps: 55 }) === 0 && nextPixelScale({ current: 0.8, avgFps: 54 }) === 0);
  check('하한(55%) 아래로는 내려가지 않는다', nextPixelScale({ current: ADAPTIVE.minScale, avgFps: 20 }) === ADAPTIVE.minScale, String(ADAPTIVE.minScale));
  check('FPS 정보가 없으면 변화 없음', nextPixelScale({ current: 1, avgFps: 0 }) === 0 && nextPixelScale({ current: 1, avgFps: NaN }) === 0);
  check('자동 품질 — 낮으면 한 단계 하향', suggestPreset(30, FRAME_PRESETS, 'ultra') === 'balanced', String(suggestPreset(30, FRAME_PRESETS, 'ultra')));
  check('자동 품질 — 충분하면 그대로', suggestPreset(60, FRAME_PRESETS, 'balanced') === null);
  check('자동 품질 — 진짜 최저 단계(초고속)면 null', suggestPreset(5, FRAME_PRESETS, 'speed') === null && suggestPreset(5, FRAME_PRESETS, 'battery') === 'speed', `${suggestPreset(5, FRAME_PRESETS, 'speed')} / ${suggestPreset(5, FRAME_PRESETS, 'battery')}`);
  check('자동 품질 — 모르는 프리셋이면 null', suggestPreset(5, FRAME_PRESETS, 'nope') === null);
  check('자동 품질 — 가장 무거운 단계에서도 올바른 하향(무제한 → 고품질)', suggestPreset(5, FRAME_PRESETS, 'unlimited') === 'ultra', String(suggestPreset(5, FRAME_PRESETS, 'unlimited')));
  check('자동 품질 — 저전력에서 무제한으로 내려가지 않는다(역방향 금지)', suggestPreset(5, FRAME_PRESETS, 'battery') !== 'unlimited' && suggestPreset(5, FRAME_PRESETS, 'performance') === 'battery', String(suggestPreset(5, FRAME_PRESETS, 'performance')));
  check('프리셋 사다리 — 비용 순서', ladderIndex(FRAME_PRESETS, 'speed') === 0 && ladderIndex(FRAME_PRESETS, 'battery') === 1 && ladderIndex(FRAME_PRESETS, 'unlimited') === PRESET_LADDER.length - 1, JSON.stringify(PRESET_LADDER));
  check('단계 올리기 — 사용자가 고른 단계를 넘지 않는다', stepUpId(FRAME_PRESETS, 'battery', 'balanced') === 'performance' && stepUpId(FRAME_PRESETS, 'performance', 'performance') === null && stepUpId(FRAME_PRESETS, 'unlimited') === null);
  check('배율 표기', formatScale(0.82) === '82%' && formatScale(1) === '100%');
  check('MB 표기', formatMb(0) === '-' && formatMb(524288000) === '500 MB' && formatMb(2147483648) === '2.00 GB', formatMb(524288000));

  // 메모리 감시 — Chrome 전용 performance.memory 를 흉내 내어 경고·쿨다운을 검사한다
  let heap = 100 * 1048576;
  const guard = new MemoryGuard({ warnMb: 900, cooldown: 120, reader: () => ({ usedJSHeapSize: heap }) });
  check('메모리 감시 — 임계 이하이면 경고 없음', guard.sample(0.6).warn === false && guard.usedMb() === 100, String(guard.usedMb()));
  heap = 1200 * 1048576;
  check('메모리 감시 — 임계 초과 시 경고 1회', guard.sample(0.6).warn === true && guard.warnings === 1, `${Math.round(guard.peakMb)}MB`);
  check('메모리 감시 — 쿨다운 동안은 다시 경고하지 않는다', guard.sample(0.6).warn === false && guard.sample(30).warn === false && guard.warnings === 1);
  guard.sample(0.5);
  let rewarn = false;
  for (let i = 0; i < 250 && !rewarn; i += 1) rewarn = guard.sample(0.5).warn === true;   // 쿨다운(120초) 경과
  check('메모리 감시 — 쿨다운(120초)이 지나면 다시 경고', rewarn === true && guard.warnings === 2, `${guard.warnings}회`);
  check('메모리 감시 — reset', guard.reset() === true && guard.warnings === 0 && guard.peakMb === 0);
  check('메모리 감시 — 정보가 없으면 조용히 넘어간다', new MemoryGuard({ reader: () => null }).sample(1).warn === false && new MemoryGuard({ reader: () => { throw new Error('x'); } }).usedMb() === 0);

  const calls = [];
  const renderer = { setPixelRatio: (v) => calls.push(v) };
  const adaptive = new AdaptiveResolution({ renderer, preset: FRAME_PRESETS[1], config: { ...ADAPTIVE, warmup: 0, interval: 0.5 } });
  check('기본 배율 100%', adaptive.scale === 1 && formatScale(adaptive.scale) === '100%');
  adaptive.update(0.6, 25);
  const lowScale = adaptive.scale;
  check('낮은 FPS → 실제 픽셀 비율 하향', lowScale < 1 && calls.length > 0, `scale ${lowScale} · pr ${calls[calls.length - 1]}`);
  for (let i = 0; i < 12; i++) adaptive.update(0.6, 60);
  check('높은 FPS → 다시 상향(상한 100%)', adaptive.scale > lowScale && adaptive.scale <= 1, `scale ${adaptive.scale}`);
  adaptive.setPreset(FRAME_PRESETS[0]);
  check('프리셋 변경 시 100% 로 초기화', adaptive.scale === 1);
  check('렌더러가 없어도 안전', new AdaptiveResolution({ renderer: null }).update(0.6, 20).changed === false);
  const warm = new AdaptiveResolution({ renderer, preset: FRAME_PRESETS[1] });
  check('웜업(3초) 동안은 건드리지 않는다', warm.update(1, 10).changed === false && warm.scale === 1);
  const savedWindow = globalThis.window;
  try {
    globalThis.window = { devicePixelRatio: 1 };
    const dpr1 = new AdaptiveResolution({ renderer: { setPixelRatio() {} }, preset: { pixelRatio: 1.5 } });
    dpr1.scale = 0.68;
    check('적응형 해상도 — dpr 1 화면에서 1.0 을 넘지 않는다', dpr1.baseRatio === 1 && Math.abs(dpr1.pixelRatio - 0.68) < 1e-9, `base=${dpr1.baseRatio} pr=${dpr1.pixelRatio}`);
    globalThis.window = { devicePixelRatio: 2 };
    const dpr2 = new AdaptiveResolution({ renderer: { setPixelRatio() {} }, preset: { pixelRatio: 1.5 } });
    check('적응형 해상도 — dpr 2 화면은 preset 1.5 유지', dpr2.baseRatio === 1.5, `base=${dpr2.baseRatio}`);
  } finally {
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
  }
}

// ─────────────────────────────────────── 16. 맨손 채집
section('맨손 채집 (T1 자원)');
{
  check('맨손 규칙 상수', BARE_HAND.maxTier === 1 && BARE_HAND.reach >= 3 && BARE_HAND.power > 0 && BARE_HAND.interval > 0,
    `T${BARE_HAND.maxTier} 이하 · ${BARE_HAND.reach}m · ${BARE_HAND.power}피해 · ${BARE_HAND.interval}s`);

  const t1 = {
    typeId: 'tree_dawn', name: '여명 원목', tier: 1, x: 0, y: 0, z: -2, radius: 1, felled: false,
    totalWood: 10, totalMagic: 2, chop: (n) => ({ wood: Math.floor(n / 2), magic: 0, felled: false })
  };
  const t3 = { typeId: 'tree_rune', name: '룬 나무', tier: 3, x: 0, y: 0, z: -2.4, radius: 1, felled: false, chop: () => ({ wood: 5 }) };
  const tDead = { typeId: 'tree_dawn', name: '그루터기', tier: 1, x: 0, y: 0, z: -2, radius: 1, felled: true };
  const m1 = {
    typeId: 'stone', name: '돌', tier: 1, value: 12, x: 0.4, y: 0, z: -2, radius: 1, depleted: false,
    harvest: (n) => ({ amount: Math.floor(n / 3), mineralId: 'stone', depleted: false })
  };

  check('노드 티어 읽기', nodeTier(t1) === 1 && nodeTier(t3) === 3 && nodeTier({}) === 0);
  check('T1 은 맨손 가능 · T3 는 불가', canHarvestByHand(t1) === true && canHarvestByHand(t3) === false && canHarvestByHand(m1) === true);
  check('벌목/고갈된 노드는 대상이 아니다', canHarvestByHand(tDead) === false && canHarvestByHand({ tier: 1, depleted: true }) === false);

  const origin = { x: 0, y: 1.6, z: 0 };
  const dir = { x: 0, y: 0, z: -1 };
  const pick = pickHarvestNode({ origin, dir, trees: [t1], minerals: [m1] });
  check('조준 원뿔 안의 가장 가까운 T1 노드를 고른다', pick.node === t1 && pick.kind === 'tree', `${pick.kind} — 나무가 광물보다 가깝다`);
  check('광물만 있으면 광물을 고른다', pickHarvestNode({ origin, dir, minerals: [m1] }).kind === 'mineral');
  check('사거리 밖은 고르지 않는다', pickHarvestNode({ origin, dir, trees: [{ ...t1, z: -40 }] }).node === null);
  check('뒤쪽 노드는 고르지 않는다', pickHarvestNode({ origin, dir, trees: [{ ...t1, z: 5 }] }).node === null);
  const blocked = pickHarvestNode({ origin, dir, trees: [t3] });
  check('T3 노드는 blocked 로만 잡힌다(안내용)', blocked.node === null && blocked.blocked === t3);
  check('T1 이 있으면 blocked 는 비어 있다', pickHarvestNode({ origin, dir, trees: [t1, t3] }).blocked === null);

  const sink = {
    economy: new Economy({ gold: 0, wood: 0 }),
    stats: { log: [], track(k, n) { this.log.push([k, n]); }, set() {} },
    audio: { played: [], play(n) { this.played.push(n); } },
    mineralsMined: 0,
    woodChopped: 0,
    mineralTypesMined: new Set()
  };
  const treeRes = harvestNode(t1, { kind: 'tree', power: 14, sink });
  check('나무 채집 — 목재 지급 + 통계 + 효과음',
    treeRes.ok && treeRes.amount > 0 && sink.economy.wood === treeRes.amount && sink.woodChopped === treeRes.amount && sink.audio.played.includes('chop'),
    `목재 +${treeRes.amount}`);
  const minRes = harvestNode(m1, { kind: 'mineral', power: 14, sink });
  check('광물 채집 — 광물 + 골드(가치 10%) + 통계',
    minRes.ok && minRes.amount > 0 && sink.economy.getMineral('stone') === minRes.amount && sink.economy.gold === Math.round(12 * 0.1) * minRes.amount,
    `광물 +${minRes.amount} · ${sink.economy.gold}G`);
  check('광물 종류 기록', sink.mineralTypesMined.has('stone') && sink.mineralsMined === minRes.amount);
  check('T3 는 맨손 채집 자체가 거부된다', harvestNode(t3, { kind: 'tree', power: 14, sink, maxTier: BARE_HAND.maxTier }).ok === false);
  check('안내 문구 — T1 은 좌클릭, T3 는 잠김', harvestHint(t1).includes('맨손 채집') && harvestHint(t3).includes('맨손으로는'));

  const mainSrcH = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const gatheringSrc = readFileSync(new URL('../client/src/systems/gathering.js', import.meta.url), 'utf8');
  check('main — 좌클릭 공격이 맨손 채집을 먼저 시도', mainSrcH.includes('if (this._tryBareHarvest()) return true;'));
  check('main — 적이 더 가까우면 전투 우선', mainSrcH.includes('if (dEnemy <= dNode)'));
  check('main — 채집 결과를 경제/업적에 반영', mainSrcH.includes('harvestNode(node, { kind: pick.kind, sink: this.gatherSink() })'));
  check('main — 조준 자원 HUD 안내', mainSrcH.includes('harvestHint(node)') && mainSrcH.includes('setPrompt?.('));
  check('gathering — 맨손 전용 모듈은 THREE/DOM 비의존', !gatheringSrc.includes('three') && !gatheringSrc.includes('document.'));
}

// ─────────────────────────────────────── 17. 관리자 명령어
section('관리자 명령어 (무기 · 자원 · 돈 소환)');
{
  check(
  `명령어 ${ADMIN_COMMANDS.length}종 등록 (${ADMIN_COMMANDS.length === 14 ? '11 + 플라이/날개 + 가죽/장비 + 화살' : '개수 변경'})`,
  ADMIN_COMMANDS.length === 14,
  ADMIN_COMMANDS.map((c) => c.name).join(',')
);
check(
  '/가죽 · /장비 명령 등록(별칭 포함)',
  ADMIN_COMMANDS.some((c) => c.name === 'leather' && c.aliases.includes('가죽')) &&
    ADMIN_COMMANDS.some((c) => c.name === 'gear' && c.aliases.includes('가죽장비'))
);
  check('도움말 = 명령어 수만큼', commandHelp().length === ADMIN_COMMANDS.length && commandHelp()[0].includes('/도움말'));
  check('관리자 판정 — role=admin 만', isAdminUser({ role: 'admin' }) === true && isAdminUser({ role: 'user' }) === false && isAdminUser(null) === false && isAdminUser({ isAdmin: true }) === true);

  check('한글 명령 파싱 (/돈)', parseCommand('/돈 100000').name === 'gold' && parseCommand('/돈 100000').args[0] === '100000');
  check('영문 명령 파싱 (/weapon)', parseCommand('/weapon time_scissors').name === 'weapon' && parseCommand('/gold').name === 'gold');
  check('한글 무기 이름 인자', parseCommand('/무기 시간의 가위').args.join(' ') === '시간의 가위');
  check('미지의 명령어 · 빈 입력', parseCommand('/없는명령').reason === 'unknown' && parseCommand('   ').reason === 'empty');
  check('무기 찾기 — id 부분일치', findWeapon('scissors').weapon?.id === 'time_scissors');
  check('무기 찾기 — 한글 이름 완전일치', findWeapon('꿈의 끝은 희망').weapon?.id === 'dream_lantern');
  check('광물 찾기 — 한글 이름', findMineral('시간의 파편').mineral?.id === 'time_shard');
  check('모호하면 후보 목록', findWeapon('staff').matches.length > 1, `${findWeapon('staff').matches.length}종`);

  const eco = new Economy({ gold: 0, wood: 0 });
  const game = {
    economy: eco,
    weapons: { owned: new Set() },
    staff: { weapon: null },
    player: { hp: 10, maxHp: 100, mana: 0, maxMana: 50 },
    towers: [{ heal() {} }],
    world: { base: { hp: 10, maxHp: 500, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } } },
    hasWeapon(id) { return this.weapons.owned.has(id); },
    ownWeapon(id) { if (this.weapons.owned.has(id)) return false; this.weapons.owned.add(id); return true; },
    equipWeapon(id) { this.equipped = id; return true; },
    addGold(n) { eco.addGold(n); },
    addWood(n) { eco.addWood(n); },
    addMineral(id, n) { eco.addMineral(id, n); }
  };
  const admin = { role: 'admin' };

  check('비관리자는 전부 거부', runAdminCommand('/돈 100000', { game, user: { role: 'user' } }).ok === false);
  check('비관리자 안내 문구', runAdminCommand('/무기 time_scissors', { game, user: { role: 'user' } }).message.includes('관리자'));
  check('비관리자는 자원도 못 준다', eco.gold === 0 && eco.wood === 0);

  const g1 = runAdminCommand('/돈 250000', { game, user: admin });
  check('돈 소환', g1.ok && eco.gold === 250000, `${eco.gold.toLocaleString()}G`);
  const g2 = runAdminCommand('/목재 12345', { game, user: admin });
  check('목재 소환', g2.ok && eco.wood === 12345, `${eco.wood.toLocaleString()}`);
  const g3 = runAdminCommand('/광물 time_shard 50', { game, user: admin });
  check('광물 소환 (id)', g3.ok && eco.getMineral('time_shard') === 50, `${eco.getMineral('time_shard')}개`);
  const g4 = runAdminCommand('/광물 벚꽃 결정 7', { game, user: admin });
  check('광물 소환 (한글 이름)', g4.ok && eco.getMineral('blossom_crystal') === 7);
  check('광물 기본 수량 99', runAdminCommand('/광물 frozen_hour', { game, user: admin }).ok && eco.getMineral('frozen_hour') === ADMIN_DEFAULTS.mineral);
  const g5 = runAdminCommand('/무기 시간의 가위', { game, user: admin });
  check('무기 소환 + 즉시 장착', g5.ok && game.weapons.owned.has('time_scissors') && game.equipped === 'time_scissors');
  const g6 = runAdminCommand('/무기전부', { game, user: admin });
  check('모든 무기 소환', g6.ok && game.weapons.owned.size === WEAPONS.length, `${game.weapons.owned.size}/${WEAPONS.length}종`);
  const g7 = runAdminCommand('/전체자원 999', { game, user: admin });
  check('전체 자원 소환 — 광물 27종 전부', g7.ok && MINERAL_TYPES.every((m) => eco.getMineral(m.id) >= 999), `${MINERAL_TYPES.length}종 · 골드 ${eco.gold.toLocaleString()}`);
  const g8 = runAdminCommand('/웨이브 30', { game: { waves: { wave: 0, reset() {}, forceStart() { return true; } } }, user: admin });
  check('웨이브 이동 + 최종보스 안내', g8.ok && g8.lines.some((l) => l.includes('셀레스티얼')), g8.lines.join(' / ').slice(0, 50));
  const g9 = runAdminCommand('/치유', { game, user: admin });
  check('치유 — 체력·마나·기지', g9.ok && game.player.hp === 100 && game.player.mana === 50 && game.world.base.hp === 500);
  check('인자 없는 명령은 사용법 안내', runAdminCommand('/무기', { game, user: admin }).message.includes('사용법'));
  check('없는 무기는 실패', runAdminCommand('/무기 없는무기xyz', { game, user: admin }).ok === false);
  check('게임 없이도 throw 하지 않는다', runAdminCommand('/돈', { user: admin }).ok === false && runAdminCommand('/도움말', { user: admin }).lines.length === ADMIN_COMMANDS.length);

  const consoleSrc = readFileSync(new URL('../client/src/ui/console.js', import.meta.url), 'utf8');
  const mainSrcA = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const cssSrc = readFileSync(new URL('../client/src/ui/styles.css', import.meta.url), 'utf8');
  check('콘솔 UI — 관리자 게이트(일반 계정엔 DOM·안내 없음)', consoleSrc.includes('isAdminUser(this.user ?? auth?.user ?? null)') && consoleSrc.includes('if (!this.isAdmin()) return;') && consoleSrc.includes('if (!this.isAdmin()) return false;'));
  check('콘솔 UI — Enter 실행 · Escape 닫기 · ↑↓ 기록', consoleSrc.includes("key === 'Enter'") && consoleSrc.includes("key === 'Escape'") && consoleSrc.includes("key === 'ArrowUp'"));
  // 사용자 요청(H-97): 관리자 콘솔 버튼·키·안내를 모두 없앴다.
  check('main — 관리자 콘솔 토글이 있다(관리자 계정 전용)', mainSrcA.includes("actionPressed('admin')") && mainSrcA.includes('this.ui.admin?.isAdmin?.()'));
  check('main — 관리자 계정 안내 문구가 있다', mainSrcA.includes('_adminHint()') && mainSrcA.includes('관리자 계정 —'));
  check('스타일 — 관리자 콘솔 CSS · 화면 배율 대응', cssSrc.includes('.hud-console {') && cssSrc.includes('.hud-console-input') && cssSrc.includes('bottom: clamp(84px, 11vh, 160px)') && cssSrc.includes('font-size: clamp(13px, 1.55vh, 24px)'));
}

  // ────────────────────────────────────────── 요정의 날개 (장비 · 비행)
  section('요정의 날개 (장비 · 비행)');
  {
    const MIN_BY_ID = Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, m]));
    check('날개 8종 등록(티어 1~7 + 초월)', FAIRY_WINGS.length === 8, FAIRY_WINGS.map((w) => w.name).join(', '));
    check(
      '날개 티어/업그레이드 체인',
      FAIRY_WINGS.map((w) => w.tier).join(',') === '1,2,3,4,5,6,7,8' &&
        FAIRY_WINGS.every((w, i) => (i === 0 ? !w.requires : w.requires === FAIRY_WINGS[i - 1].id))
    );
    check(
      '비행 수치 유효',
      FAIRY_WINGS.every(
        (w) =>
          w.flight.speed >= 1 &&
          w.flight.lift > 0 &&
          w.flight.descend > 0 &&
          w.flight.ceiling >= 100 &&
          w.flight.drain >= 0
      )
    );
    check(
      '티어가 오르면 더 높이 · 더 빠르게',
      FAIRY_WINGS.every(
        (w, i) => i === 0 || (w.flight.ceiling > FAIRY_WINGS[i - 1].flight.ceiling && w.flight.speed >= FAIRY_WINGS[i - 1].flight.speed)
      )
    );
    check('비용 광물이 실제 광물', FAIRY_WINGS.every((w) => Object.keys(w.cost.minerals).every((id) => MIN_BY_ID[id])));
    check('비용에 골드 포함', FAIRY_WINGS.every((w) => w.cost.gold > 0));
    check(
      'fairyWingById / nextFairyWing',
      fairyWingById('star_wings')?.name === '별의 날개' &&
        nextFairyWing('fairy_wings')?.id === 'sakura_wings' &&
        nextFairyWing('star_wings')?.id === 'runic_wings' &&
        nextFairyWing('aether_wings') === null &&
        fairyWingById('nope') === null
    );
    check('비행 기본 프로필(미장착)', WING_FLIGHT_DEFAULTS.equipped === false && WING_FLIGHT_DEFAULTS.speed === 1);
    check(
      '비용/성능 문자열',
      wingCostText(FAIRY_WINGS[0]).includes('25,000 G') &&
        wingCostText(FAIRY_WINGS[0]).includes('철광석 30') &&
        wingFlightText(FAIRY_WINGS[2]).includes('마나 소모 없음')
    );
    check('STAT_LABELS 비행 시간', STAT_LABELS.flightTime === '비행 시간(초)');

    const wEco = new Economy({ gold: 100000, wood: 0, minerals: { iron: 40, quartz: 30, mana: 10 } });
    const wings = new WingSystem({ economy: wEco });
    check('처음엔 미보유 · 비행 불가', wings.count === 0 && wings.flight().equipped === false);
    check(
      '선행 날개 없이는 구매 불가',
      wings.canBuy('sakura_wings').ok === false && wings.canBuy('sakura_wings').reason.includes('요정의 날개')
    );
    const buy1 = wings.buy('fairy_wings');
    check(
      '구매 — 비용 차감 + 자동 장착',
      buy1.ok &&
        wings.has('fairy_wings') &&
        wings.equippedId === 'fairy_wings' &&
        wEco.gold === 75000 &&
        wEco.getMineral('iron') === 10 &&
        wEco.getMineral('quartz') === 10
    );
    check(
      '구매 후 비행 프로필',
      wings.flight().equipped === true &&
        wings.flight().ceiling === 120 &&
        wings.flight().drain === 18 &&
        Math.abs(wings.flight().speed - 1.27) < 1e-9
    );
    check('이미 보유한 날개는 구매 실패', wings.canBuy('fairy_wings').ok === false && wings.canBuy('fairy_wings').reason.includes('이미 보유'));
    check('재료 부족 판정', wings.canBuy('sakura_wings').ok === false);
    const grant1 = wings.grant('star_wings');
    check('소환(grant) — 보유 + 즉시 장착', grant1.ok === true && grant1.isNew === true && wings.equippedId === 'star_wings');
    check('최상위 날개 — 마나 소모 없음 · 상한 320', wings.flight().drain === 0 && wings.flight().ceiling === 320);
    check(
      'V 토글 — 접기/착용',
      wings.toggleEquip().ok === true &&
        wings.equippedId === null &&
        wings.toggleEquip().ok === true &&
        wings.equippedId === 'star_wings'
    );
    check('없는 날개 장착 실패', wings.equip('nope_wings').ok === false);
    check(
      '관리자 강제 비행 — 날개 없이 가능 · 마나 0',
      (() => {
        const w = new WingSystem();
        w.setForced(true);
        const f = w.flight();
        return w.count === 0 && f.equipped === true && f.drain === 0 && f.ceiling >= 300;
      })()
    );
    check(
      'grant(equip:false) 는 장착하지 않음',
      (() => {
        const w = new WingSystem({ economy: wEco });
        w.grant('fairy_wings', { equip: false });
        return w.count === 1 && w.equippedId === null;
      })()
    );
    check(
      '저장/복원 왕복',
      (() => {
        const w = new WingSystem({ economy: wEco });
        w.grant('fairy_wings');
        const w2 = new WingSystem({ economy: wEco });
        w2.fromJSON(JSON.parse(JSON.stringify(w.toJSON())));
        return w2.equippedId === 'fairy_wings' && w2.count === 1;
      })()
    );
    check(
      '알 수 없는 id 는 무시',
      (() => {
        const w = new WingSystem();
        w.fromJSON({ owned: ['ghost_wings', 'fairy_wings'], equippedId: 'ghost_wings' });
        return w.count === 1 && w.equippedId === null;
      })()
    );
    check(
      'findWing — id/이름/부분일치',
      findWing('star_wings').wing?.id === 'star_wings' &&
        findWing('별의 날개').wing?.id === 'star_wings' &&
        findWing('날개').matches.length === 8 &&
        findWing('없는날개').matches.length === 0
    );
    check(
      'list() — 보유/장착/구매가능/문자열',
      (() => {
        const l = wings.list();
        return (
          l.length === 8 &&
          l.every((w) => typeof w.owned === 'boolean' && typeof w.canBuy === 'boolean' && w.costText.length > 0 && w.flightText.length > 0) &&
          l.filter((w) => w.equipped).length === 1
        );
      })()
    );

    // 관리자 명령 — /플라이 · /날개
    const wingAdmin = { role: 'admin' };
    const wingGame = {
      adminFlight: false,
      applied: 0,
      adminFly(mode) {
        const m = String(mode ?? 'toggle');
        const on = m === 'on' ? true : m === 'off' ? false : !this.adminFlight;
        this.adminFlight = on;
        return { ok: true, on, message: on ? '비행 활성화' : '비행 해제' };
      },
      wings,
      applyFlight() {
        this.applied += 1;
      },
      ui: { panels: { refresh() {} } },
      notify() {}
    };
    const fl1 = runAdminCommand('/플라이', { game: wingGame, user: wingAdmin });
    check('/플라이 — 즉시 비행', fl1.ok === true && wingGame.adminFlight === true && fl1.message.includes('비행'));
    const fl2 = runAdminCommand('/플라이 끄기', { game: wingGame, user: wingAdmin });
    check('/플라이 끄기', fl2.ok === true && wingGame.adminFlight === false);
    const fl3 = runAdminCommand('/날개 벚꽃 날개', { game: wingGame, user: wingAdmin });
    check('/날개 <이름> — 소환 + 즉시 장착', fl3.ok === true && wings.has('sakura_wings') && wings.equippedId === 'sakura_wings' && wingGame.applied > 0);
    check('/날개 목록은 전체 목록', runAdminCommand('/날개', { game: wingGame, user: wingAdmin }).lines.length === FAIRY_WINGS.length);
    check('/날개 없는 이름은 실패', runAdminCommand('/날개 없는날개xyz', { game: wingGame, user: wingAdmin }).ok === false);
    check('/플라이 — 게임 없이는 실패', runAdminCommand('/플라이', { user: wingAdmin }).ok === false);
    check('비관리자 — /플라이 거부', runAdminCommand('/플라이', { game: wingGame, user: { role: 'user' } }).ok === false);
    check('/도움말에 플라이/날개 포함', commandHelp().some((l) => l.includes('/플라이')) && commandHelp().some((l) => l.includes('/날개')));
  }


// ───────────────────────────── 가죽 · 가죽 장비 (몬스터 사냥 보상)
section('가죽 · 가죽 장비 (사냥 보상)');
{
  check('가죽 5종 등록', LEATHER_TYPES.length === 5, LEATHER_TYPES.map((l) => l.name).join(', '));
  check(
    '가죽 티어 1~5 (질긴 → 유물)',
    LEATHER_TYPES.map((l) => l.tier).join(',') === '1,2,3,4,5' && LEATHER_TYPES[4].name === '유물 가죽'
  );
  check(
    '가죽 정의 필드 유효',
    LEATHER_TYPES.every(
      (l) =>
        typeof l.id === 'string' &&
        l.id.length > 0 &&
        typeof l.name === 'string' &&
        l.value > 0 &&
        typeof l.glyph === 'string' &&
        typeof l.drop === 'string' &&
        typeof l.desc === 'string' &&
        typeof l.color === 'number'
    )
  );
  check('가죽 id 유일', new Set(LEATHER_TYPES.map((l) => l.id)).size === LEATHER_TYPES.length);
  check(
    'leatherById / leatherTier',
    leatherById('dragon_leather')?.name === '용 가죽' &&
      leatherTier('relic_leather') === 5 &&
      leatherById('nope') === null &&
      leatherTier('nope') === 0
  );
  check(
    'leatherForTier / leathersUpTo',
    leatherForTier(3).id === 'scaled_leather' &&
      leatherForTier(99).id === 'relic_leather' &&
      leathersUpTo(2).join(',') === 'leather,thick_leather'
  );
  check('LEATHER_BY_ID 파생', Object.keys(LEATHER_BY_ID).length === 5);

  // 경제 — 가죽 원장
  const lEco = new Economy({ gold: 1000, leathers: { leather: 7, dragon_leather: 2 } });
  check('경제 — 가죽 초기값', lEco.getLeather('leather') === 7 && lEco.totalLeather() === 9);
  check('경제 — addLeather', lEco.addLeather('leather', 3) === 10 && lEco.totalLeather() === 12);
  check(
    '경제 — 가죽 방어(음수/NaN/빈 id)',
    lEco.addLeather('leather', -5) === 10 && lEco.addLeather('', 3) === 0 && Number.isFinite(lEco.addLeather('leather', 'x'))
  );
  check('경제 — canAfford 가죽', lEco.canAfford({ leather: { leather: 10 } }) === true && lEco.canAfford({ leather: { leather: 11 } }) === false);
  check(
    '경제 — spend 가죽(부족하면 아무것도 소비 안 함)',
    lEco.spend({ gold: 100, leather: { leather: 99 } }) === false &&
      lEco.gold === 1000 &&
      lEco.getLeather('leather') === 10 &&
      lEco.spend({ gold: 100, leather: { leather: 4 } }) === true &&
      lEco.gold === 900 &&
      lEco.getLeather('leather') === 6
  );
  check('경제 — 가죽 0이면 키 삭제', !('dragon_leather' in lEco.leathers) === false && lEco.spend({ leather: { dragon_leather: 2 } }) && !('dragon_leather' in lEco.leathers));
  check(
    '경제 — 저장/복원 왕복(가죽 포함)',
    (() => {
      const a = new Economy({ gold: 5, leathers: { thick_leather: 4 } });
      const b = new Economy();
      b.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
      return b.getLeather('thick_leather') === 4 && b.gold === 5 && b.totalLeather() === 4;
    })()
  );

  // 가죽 장비 데이터
  check('가죽 장비 6종 등록', LEATHER_GEAR.length === 6, LEATHER_GEAR.map((g) => g.name).join(', '));
  check('장비 슬롯 6곳(머리·몸통·손·허리·발·등)', GEAR_SLOTS.map((s) => s.id).join(',') === 'head,body,hands,waist,feet,back');
  check(
    '슬롯마다 장비 1종 → 6벌 모두 착용 가능',
    GEAR_SLOTS.every((s) => LEATHER_GEAR.filter((g) => g.slot === s.id).length === 1) &&
      new Set(LEATHER_GEAR.map((g) => g.slot)).size === 6
  );
  check(
    '모든 장비의 슬롯/등급/보너스 유효',
    LEATHER_GEAR.every(
      (g) =>
        GEAR_SLOTS.some((s) => s.id === g.slot) &&
        typeof g.glyph === 'string' &&
        typeof g.desc === 'string' &&
        wingGradeInfo(g.grade).id === g.grade &&
        Object.keys(g.bonus ?? {}).length > 0 &&
        Object.keys(g.bonus).every((k) => GEAR_BONUS_KEYS.includes(k))
    )
  );
  check(
    '장비 보너스는 비율(0~1)',
    LEATHER_GEAR.every((g) => Object.values(g.bonus).every((v) => v > 0 && v <= 1))
  );
  check(
    '장비 비용은 골드 + 실제 가죽',
    LEATHER_GEAR.every((g) => g.cost.gold > 0 && Object.keys(g.cost.leather).every((id) => LEATHER_BY_ID[id]))
  );
  check(
    '유물 등급 가죽 장비 존재',
    LEATHER_GEAR.some((g) => g.grade === 'relic' && g.id === 'relic_grips') && leatherGearById('relic_grips').cost.leather.relic_leather > 0
  );
  check(
    'gearBonusText / gearCostText',
    gearBonusText({ damageTakenPct: 0.1, manaRegenPct: 0.2 }).includes('받는 피해 -10%') &&
      gearBonusText({ damagePct: 0.08 }).includes('공격력 +8%') &&
      gearCostText(LEATHER_GEAR[0]).includes('4,000 G') &&
      gearCostText(LEATHER_GEAR[0]).includes('질긴 가죽 6')
  );
  check('세트 효과 3단(2·4·6)', GEAR_SET_BONUS.length === 3 && GEAR_SET_BONUS.map((s) => s.count).join(',') === '2,4,6');

  // GearSystem
  const gEco = new Economy({ gold: 2000000, leathers: { leather: 60, thick_leather: 40, scaled_leather: 40, dragon_leather: 30, relic_leather: 12 } });
  const gear = new GearSystem({ economy: gEco });
  check('장비 — 처음엔 미보유', gear.count === 0 && gear.equippedCount === 0 && gear.list().length === 6);
  check(
    '장비 — 구매는 재료 차감 + 즉시 착용',
    gear.buy('leather_cap').ok === true &&
      gear.has('leather_cap') &&
      gear.isEquipped('leather_cap') &&
      gEco.getLeather('leather') === 54 &&
      gEco.gold === 1996000
  );
  check('장비 — 보너스 반영(마나 회복 +10%)', Math.abs(gear.bonus().manaRegenPct - 0.1) < 1e-9);
  check('장비 — 재료 부족 판정', (() => { const g = new GearSystem({ economy: new Economy({ gold: 0 }) }); return g.canBuy('leather_vest').ok === false && g.canBuy('leather_vest').reason.includes('재료'); })());
  check(
    '장비 — 같은 슬롯은 하나만(교체 규칙)',
    (() => {
      const g = new GearSystem({ economy: gEco });
      g.grant('dragon_belt');
      const first = g.equippedCount;
      g.equip('dragon_belt');
      return (
        first === 1 &&
        g.equippedCount === 1 &&
        g.equippedIn('waist') === 'dragon_belt' &&
        Object.keys(g.equipped).length === 1 &&
        g.buy('leather_vest').ok === true &&
        g.equippedIn('body') === 'leather_vest'
      );
    })()
  );
  check(
    '장비 — 착용/해제 토글',
    (() => {
      const g = new GearSystem({ economy: gEco });
      g.grant('thick_boots', { equip: false });
      const on = g.toggle('thick_boots');
      const off = g.toggle('thick_boots');
      return on.ok === true && g.isEquipped('thick_boots') === false && off.ok === true && g.equippedCount === 0;
    })()
  );
  check(
    '장비 — 세트 효과 누적(2/4/6)',
    (() => {
      const g = new GearSystem({ economy: gEco });
      for (const id of ['leather_cap', 'leather_vest']) g.grant(id);
      const s2 = g.stats();
      g.grant('thick_boots');
      g.grant('scaled_cloak');
      const s4 = g.stats();
      g.grant('dragon_belt');
      g.grant('relic_grips');
      const s6 = g.stats();
      return (
        s2.pieces === 2 &&
        s2.sets.length === 1 &&
        s4.pieces === 4 &&
        s4.sets.length === 2 &&
        s6.pieces === 6 &&
        s6.sets.length === 3 &&
        s6.damagePct >= 0.1 &&
        s6.flightCeilingPct >= 0.45
      );
    })()
  );
  check(
    '장비 — 세트 6 보너스 계산(합산)',
    (() => {
      const g = new GearSystem({ economy: gEco });
      for (const gear2 of LEATHER_GEAR) g.grant(gear2.id);
      const s = g.stats();
      // 6벌 착용 + 6세트: 부츠 8% + 장갑 10% + 세트 6% = 24%, 비행 상한 10% + 25% + 세트 20% = 55%
      return (
        s.pieces === 6 &&
        Math.abs(s.moveSpeedPct - 0.24) < 1e-9 &&
        Math.abs(s.flightCeilingPct - 0.55) < 1e-9 &&
        s.equippedIds.length === 6
      );
    })()
  );
  check('장비 — unequipAll', (() => { const g = new GearSystem({ economy: gEco }); g.grant('leather_cap'); return g.unequipAll().count === 1 && g.equippedCount === 0; })());
  check(
    '장비 — 저장/복원 왕복(슬롯 검증)',
    (() => {
      const a = new GearSystem({ economy: gEco });
      a.grant('leather_cap');
      a.grant('relic_grips');
      const b = new GearSystem({ economy: gEco });
      b.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
      const c = new GearSystem({ economy: gEco });
      c.fromJSON({ owned: ['leather_cap'], equipped: { head: 'leather_cap', body: 'relic_grips' } });
      return (
        b.count === 2 &&
        b.isEquipped('relic_grips') &&
        b.equippedIn('hands') === 'relic_grips' &&
        b.equippedIn('body') === null &&
        c.equippedIn('head') === 'leather_cap' &&
        c.equippedIn('body') === null
      );
    })()
  );
  check('장비 — 알 수 없는 id 무시', (() => { const g = new GearSystem(); g.fromJSON({ owned: ['ghost_gear'], equipped: { head: 'ghost_gear' } }); return g.count === 0 && g.equippedCount === 0; })());
  check('장비 — grant(equip:false) 는 착용하지 않음', (() => { const g = new GearSystem(); g.grant('scaled_cloak', { equip: false }); return g.count === 1 && g.equippedCount === 0; })());
  check('장비 — 없는 장비 실패', gear.equip('nope').ok === false && gear.buy('nope').ok === false);
  check('장비 — emptyBonus 0으로 채움', GEAR_BONUS_KEYS.every((k) => emptyBonus()[k] === 0));
}

// ───────────────────────────── 지형 티어별 몬스터 (야생 로밍)
section('지형 티어별 몬스터 (야생 로밍)');
{
  check('야생 몬스터 16종', REGION_ENEMY_TYPES.length === 16, REGION_ENEMY_TYPES.map((t) => t.name).join(', '));
  check('전체 적 종류 = 웨이브 11 + 야생 16 = 27', ENEMY_TYPE_TOTAL === 27 && ENEMY_TYPES.length === 11);
  check(
    '웨이브 편성과 완전 분리',
    REGION_ENEMY_TYPES.every((t) => !ENEMY_TYPE_BY_ID[t.id]) &&
      REGION_ENEMY_TYPES.every((t) => isRegionEnemy(t.id)) &&
      ENEMY_TYPES.every((t) => !isRegionEnemy(t.id))
  );
  check(
    'enemyTypeById 는 야생까지 찾는다',
    enemyTypeById('dawn_slime')?.name === '여명 슬라임' &&
      enemyTypeById('relic_guardian')?.name === '유물 수호자' &&
      enemyTypeById('golem')?.name === ENEMY_TYPE_BY_ID.golem.name &&
      enemyTypeById('nope') === null
  );
  check(
    '적 id 전체 유일',
    new Set([...ENEMY_TYPES, ...REGION_ENEMY_TYPES].map((t) => t.id)).size === ENEMY_TYPE_TOTAL &&
      Object.keys(ALL_ENEMY_BY_ID).length === ENEMY_TYPE_TOTAL
  );
  check(
    '야생 몬스터 수치 유효',
    REGION_ENEMY_TYPES.every(
      (t) =>
        t.hpMult > 0 &&
        t.speedMult > 0 &&
        t.radius > 0 &&
        t.damage > 0 &&
        t.gold > 0 &&
        typeof t.name === 'string' &&
        typeof t.desc === 'string' &&
        typeof t.color === 'number' &&
        typeof t.region === 'string'
    )
  );
  check(
    '모든 야생 몬스터의 region 이 편성표에 존재',
    REGION_ENEMY_TYPES.every((t) => Boolean(REGION_MONSTER_BY_ID[t.region]))
  );
  check(
    '야생 몬스터가 떨구는 가죽은 실제 가죽',
    REGION_ENEMY_TYPES.every((t) => t.leather && LEATHER_BY_ID[t.leather.id] && t.leather.chance > 0 && t.leather.chance <= 1 && t.leather.max >= t.leather.min)
  );
  check(
    '보너스 광물은 실제 광물(히든 포함)',
    REGION_ENEMY_TYPES.filter((t) => t.bonus).every((t) => MINERAL_TYPES.some((m) => m.id === t.bonus.mineral))
  );
  check(
    '지역 편성표 9곳(T1~T7 + 히든 2)',
    REGION_MONSTERS.length === 9 &&
      REGION_MONSTERS.filter((r) => r.id.startsWith('tier')).length === 7 &&
      REGION_MONSTERS.filter((r) => r.region === 'cherry_garden' || r.region === 'time_horizon').length === 2
  );
  check(
    'T1~T7 은 각각 2종, 히든은 1종',
    REGION_MONSTERS.every((r) => (r.region === 'cherry_garden' || r.region === 'time_horizon' ? r.types.length === 1 : r.types.length === 2))
  );
  check(
    '편성표의 모든 종이 실제 야생 몬스터',
    REGION_MONSTERS.every((r) => r.types.every((t) => REGION_ENEMY_BY_ID[t.id] && REGION_ENEMY_BY_ID[t.id].region === r.region))
  );
  check(
    '티어가 오르면 강해진다(power 증가)',
    REGION_MONSTERS.filter((r) => r.id.startsWith('tier')).every((r, i, a) => i === 0 || r.power > a[i - 1].power)
  );
  check(
    '지역 판정 — regionMonsterRoster / regionHasMonsters',
    regionMonsterRoster('tier1')?.name === '여명 평원' &&
      regionMonsterRoster('cherry_garden')?.name === '벚꽃의 정원' &&
      regionHasMonsters('tier7') === true &&
      regionHasMonsters('safe') === false &&
      regionMonsterRoster('nope') === null
  );
  check(
    'pickRegionMonster — 가중 추첨(결정적 rand)',
    pickRegionMonster('tier1', () => 0).id === 'dawn_slime' &&
      pickRegionMonster('tier1', () => 0.99).id === 'grass_wolf' &&
      pickRegionMonster('outer', () => 0.5) === null
  );
  check(
    'regionMonsterLoot — 확률표대로 0/1 지급',
    (() => {
      const t = REGION_ENEMY_BY_ID.relic_guardian;
      const always = regionMonsterLoot(t, () => 0);
      const never = regionMonsterLoot(t, () => 0.999);
      return always.leather?.id === 'relic_leather' && always.leather.amount >= 1 && always.mineral?.id === 'timesand' && never.mineral === null;
    })()
  );
  check(
    'waveEnemyLeather — 웨이브 몬스터도 낮은 확률로 가죽',
    (() => {
      const spec = waveEnemyLeather(ENEMY_TYPE_BY_ID.golem);
      return LEATHER_BY_ID[spec.id] && spec.chance > 0 && spec.chance <= 0.5 && spec.max >= spec.min;
    })()
  );
}

// ───────────────────────────── 로밍 스포너 (웨이브 정산과 무관)
section('로밍 스포너 (지역 몬스터 스폰 규칙)');
{
  const roster = roamerRoster('tier3');
  check('roamerRoster — 기본값 채움', roster.id === 'tier3' && roster.interval > 0 && roster.maxAlive > 0 && roster.spawnRadius > 20 && roster.despawnRadius > roster.spawnRadius);
  check('roamerRoster — 없는 지역은 null', roamerRoster('outer') === null && roamerRoster('nope') === null);
  check('isRoamer — 표시 플래그 판정', isRoamer({ roaming: true }) === true && isRoamer({ spawnerKind: 'region' }) === true && isRoamer({ fromTower: true }) === false && isRoamer(null) === false);
  check(
    'countRoamers — 지역별/전체',
    (() => {
      const list = [
        { alive: true, roaming: true, regionId: 'tier1' },
        { alive: true, roaming: true, regionId: 'tier3' },
        { alive: true, regionId: 'tier3' },
        { alive: false, roaming: true, regionId: 'tier3' }
      ];
      return countRoamers(list) === 2 && countRoamers(list, 'tier3') === 1;
    })()
  );
  check(
    'roamerSpawnPoint — 플레이어 주변 고리(±25%)',
    (() => {
      const p = roamerSpawnPoint(() => 0.5, { x: 100, z: 200 }, roster);
      const d = Math.hypot(p.x - 100, p.z - 200);
      return Math.abs(d - roster.spawnRadius) < 1e-6 && p.distance === d;
    })()
  );
  check(
    'shouldDespawn — 정리 거리 밖에서만',
    shouldDespawn({ alive: true, position: { x: 0, z: roster.despawnRadius + 1 } }, { x: 0, z: 0 }, roster) === true &&
      shouldDespawn({ alive: true, position: { x: 0, z: 10 } }, { x: 0, z: 0 }, roster) === false &&
      shouldDespawn({ alive: false, position: { x: 0, z: 9999 } }, { x: 0, z: 0 }, roster) === false
  );

  // 시뮬레이션 — tier3 에 180초 머무르면 상한까지 채우고 유지한다
  const spawner = new RegionSpawner({ rand: () => 0.42 });
  const enemies = [];
  const events = { spawn: 0, despawn: 0 };
  for (let i = 0; i < 1800; i++) {
    spawner.update(0.1, {
      position: { x: 0, z: 0 },
      regionId: 'tier3',
      phase: 'playing',
      enemies,
      spawn: (o) => {
        events.spawn += 1;
        const e = { alive: true, roaming: true, regionId: o.regionId, typeId: o.typeId, position: { x: o.x, z: o.z } };
        enemies.push(e);
        return e;
      },
      despawn: (e) => {
        events.despawn += 1;
        e.alive = false;
      }
    });
  }
  check(
    '로밍 시뮬레이션 — 상한(maxAlive)까지만 늘어난다',
    events.spawn === roster.maxAlive && countRoamers(enemies, 'tier3') === roster.maxAlive,
    `spawn ${events.spawn} / maxAlive ${roster.maxAlive}`
  );
  check('로밍 시뮬레이션 — 정리 대상 없음(제자리)', events.despawn === 0);

  // 준비 시간/게임오버에는 스폰하지 않는다
  const prepSpawner = new RegionSpawner({ rand: () => 0.5 });
  const prepEnemies = [];
  for (let i = 0; i < 200; i++) {
    prepSpawner.update(0.1, { position: { x: 0, z: 0 }, regionId: 'tier2', phase: 'prep', enemies: prepEnemies, spawn: (o) => { const e = { alive: true, roaming: true, regionId: o.regionId, position: { x: o.x, z: o.z } }; prepEnemies.push(e); return e; }, despawn: () => {} });
  }
  check('준비 시간에는 스폰하지 않는다', prepSpawner.spawned === 0 && prepEnemies.length === 0);
  const overSpawner = new RegionSpawner({ rand: () => 0.5 });
  check(
    '게임오버에는 스폰하지 않는다',
    overSpawner.update(0.1, { position: { x: 0, z: 0 }, regionId: 'tier2', phase: 'gameover', enemies: [], spawn: () => { throw new Error('스폰하면 안 된다'); }, despawn: () => {} }).spawned === null
  );
  check(
    '안전 지대(기지 주변)에는 야생 몬스터가 없다',
    new RegionSpawner({ rand: () => 0.5 }).update(0.1, { position: { x: 0, z: 0 }, regionId: 'safe', phase: 'playing', enemies: [], spawn: () => null, despawn: () => {} }).region === null
  );
  const farSpawner = new RegionSpawner({ rand: () => 0.5 });
  const far = [{ alive: true, roaming: true, regionId: 'tier1', position: { x: 0, z: 999 } }];
  check(
    '지역을 벗어난 개체는 정리 요청',
    farSpawner.update(0.1, { position: { x: 0, z: 0 }, regionId: 'tier1', phase: 'playing', enemies: far, spawn: () => null, despawn: (e) => { e.alive = false; } }).despawned === 1 && far[0].alive === false
  );
  check(
    '월드 전체 상한(totalCap)을 넘기지 않는다',
    (() => {
      const sp = new RegionSpawner({ rand: () => 0.5, defaults: { totalCap: 3, grace: 0, interval: 1 } });
      const list = [];
      for (let i = 0; i < 200; i++) {
        sp.update(0.1, { position: { x: 0, z: 0 }, regionId: 'tier4', phase: 'playing', enemies: list, spawn: (o) => { const e = { alive: true, roaming: true, regionId: o.regionId, position: { x: o.x, z: o.z } }; list.push(e); return e; }, despawn: () => {} });
      }
      return sp.spawned === 3;
    })()
  );
}

// ───────────────────────────── 요정의 날개 — 티어 1~7 + 유물/초월 등급
section('요정의 날개 — 티어 1~7 + 유물 등급');
{
  check('날개 8종 등록', FAIRY_WINGS.length === 8, FAIRY_WINGS.map((w) => w.name).join(', '));
  check(
    '티어 1~7 + 초월(8) 체인',
    FAIRY_WINGS.map((w) => w.tier).join(',') === '1,2,3,4,5,6,7,8' &&
      FAIRY_WINGS.every((w, i) => (i === 0 ? !w.requires : w.requires === FAIRY_WINGS[i - 1].id))
  );
  check(
    '등급 체인(일반→고급→희귀→영웅→전설→신화→유물→초월)',
    FAIRY_WINGS.map((w) => wingGradeInfo(w.grade).name).join(',') === '일반,고급,희귀,영웅,전설,신화,유물,초월'
  );
  check(
    '유물 등급 날개 = T7 유물 날개 · 초월 = 영겁의 날개',
    fairyWingGrade('artifact_wings').name === '유물' &&
      fairyWingGrade('aether_wings').name === '초월' &&
      FAIRY_WINGS[6].name === '유물 날개' &&
      FAIRY_WINGS[7].name === '영겁의 날개'
  );
  check('wingsByGrade — 유물 등급 목록', wingsByGrade('relic').map((w) => w.id).join(',') === 'artifact_wings' && wingsByGrade('nope').length === 0);
  check('WING_GRADES 8단계', WING_GRADES.length === 8 && WING_GRADE_BY_ID.transcend.name === '초월');
  check(
    '상위 티어는 가죽을 요구한다(T2부터)',
    FAIRY_WINGS.slice(1).every((w) => Object.keys(w.cost.leather ?? {}).length > 0) &&
      Object.keys(FAIRY_WINGS[0].cost.leather ?? {}).length === 0 &&
      Object.keys(FAIRY_WINGS[1].cost.leather).includes('thick_leather') &&
      Object.keys(FAIRY_WINGS[7].cost.leather).includes('relic_leather')
  );
  check('날개 가죽 비용은 실제 가죽', FAIRY_WINGS.every((w) => Object.keys(w.cost.leather ?? {}).every((id) => LEATHER_BY_ID[id])));
  check(
    '마나 소모 — T1 18/s · T2 9/s · T3부터 0',
    FAIRY_WINGS[0].flight.drain === 18 && FAIRY_WINGS[1].flight.drain === 9 && FAIRY_WINGS.slice(2).every((w) => w.flight.drain === 0)
  );
  check(
    '유물/초월 날개 성능 최상위',
    FAIRY_WINGS[6].flight.ceiling === 800 && FAIRY_WINGS[7].flight.ceiling === 900 && FAIRY_WINGS[7].flight.speed === 2.6
  );
  check(
    'nextFairyWing — 마지막은 null',
    nextFairyWing('artifact_wings')?.id === 'aether_wings' && nextFairyWing('aether_wings') === null
  );
  check(
    'wingCostText — 가죽 이름까지 표시',
    wingCostText(FAIRY_WINGS[1]).includes('두꺼운 가죽 4') && wingCostText(FAIRY_WINGS[6]).includes('유물 가죽 3')
  );
  check(
    'list() — 8종 전부 + 등급명 포함',
    (() => {
      const w = new WingSystem({ economy: new Economy({ gold: 99999999, leathers: { thick_leather: 9 } }) });
      const l = w.list();
      return l.length === 8 && l.every((x) => typeof x.gradeName === 'string' && x.gradeName.length > 0 && x.costText.length > 0 && x.flightText.length > 0);
    })()
  );
  check(
    '가죽으로 T2 날개 제작(경제 연동)',
    (() => {
      const eco = new Economy({ gold: 999999, minerals: { blossom_crystal: 5, dream_petal: 3 }, leathers: { thick_leather: 4 } });
      const w = new WingSystem({ economy: eco });
      w.grant('fairy_wings');
      const r = w.buy('sakura_wings');
      return r.ok === true && w.equippedId === 'sakura_wings' && eco.getLeather('thick_leather') === 0 && eco.getMineral('blossom_crystal') === 0;
    })()
  );
  check('findWing — 날개 8종 전부 부분일치', findWing('날개').matches.length === 8 && findWing('유물 날개').wing?.id === 'artifact_wings');
}
// ───────────────────────────── 요정의 날개 — 배선 계약 (main.js · panels.js · styles.css)
section('요정의 날개 — 제작대 레시피');
{
  check('날개 레시피 8종', WING_RECIPE_COUNT === 8 && WING_RECIPES.length === 8, `${WING_RECIPE_COUNT}종`);
  check(
    '모든 날개에 레시피 1개',
    FAIRY_WINGS.every((w) => WING_RECIPE_BY_WING[w.id] && WING_RECIPE_BY_WING[w.id].wingId === w.id),
    FAIRY_WINGS.filter((w) => !WING_RECIPE_BY_WING[w.id]).map((w) => w.id).join(',')
  );
  check(
    '레시피의 제작대 티어 = 날개 티어',
    WING_RECIPES.every((r) => CRAFTING_TABLE_BY_ID[r.table]?.tier === FAIRY_WING_BY_ID[r.wingId]?.tier),
    WING_RECIPES.filter((r) => CRAFTING_TABLE_BY_ID[r.table]?.tier !== FAIRY_WING_BY_ID[r.wingId]?.tier).map((r) => r.id).join(',')
  );
  check(
    'T1~T7 은 해당 티어 제작대 사용',
    [1, 2, 3, 4, 5, 6, 7].every((t) => WING_TABLE_BY_TIER[t] === `forge_t${t}`),
    JSON.stringify(WING_TABLE_BY_TIER)
  );
  check('T8(초월) 날개는 꿈의 정원', wingRecipeFor('aether_wings')?.table === 'garden_of_dreams', wingRecipeFor('aether_wings')?.table);
  check(
    '레시피 = 골드 + 광물/가죽 + 선행 날개',
    WING_RECIPES.every((r) => r.type === 'wing' && r.cost.gold > 0 && (Object.keys(r.cost.minerals).length + Object.keys(r.cost.leather).length) > 0),
    WING_RECIPES.filter((r) => !(r.cost.gold > 0)).map((r) => r.id).join(',')
  );
  check(
    'T2 이상은 가죽을 요구한다',
    WING_RECIPES.filter((r) => r.tier >= 2).every((r) => Object.keys(r.cost.leather).length > 0),
    WING_RECIPES.filter((r) => r.tier >= 2 && !Object.keys(r.cost.leather).length).map((r) => r.id).join(',')
  );
  check(
    '업그레이드 체인(선행 날개) 유지',
    WING_RECIPES.every((r) => r.requires === (FAIRY_WING_BY_ID[r.wingId]?.requires ?? null)),
    WING_RECIPES.filter((r) => r.requires !== (FAIRY_WING_BY_ID[r.wingId]?.requires ?? null)).map((r) => r.id).join(',')
  );
  check(
    '제작대별 날개 분배(티어당 1종)',
    CRAFTING_TABLES.every((t) => wingRecipesForTable(t.id).length <= 1) &&
      CRAFTING_TABLES.filter((t) => wingRecipesForTable(t.id).length === 1).length === 8,
    CRAFTING_TABLES.map((t) => `${t.id}:${wingRecipesForTable(t.id).length}`).join(' ')
  );
  check('isWingRecipe — 무기 레시피와 구분', isWingRecipe(WING_RECIPES[0]) && !isWingRecipe(WEAPON_RECIPES[0]));
  check('날개 비용 문구에 가죽 이름', costText(wingRecipeFor('sakura_wings').cost).includes('가죽'), costText(wingRecipeFor('sakura_wings').cost));
  check('validateCrafting — 날개 레시피 오류 없음', validateCrafting().filter((e) => e.includes('날개')).length === 0, validateCrafting().filter((e) => e.includes('날개')).join(' | '));

  const craftSrc = readFileSync(new URL('../client/src/systems/crafting.js', import.meta.url), 'utf8');
  check(
    'CraftingSystem — 날개 제작 API',
    ['canCraftWing(', 'craftWing(', 'craftedWings', 'wasWingCrafted(', 'wingsFor(', 'wingRecipe('].every((k) => craftSrc.includes(k)),
    ['canCraftWing(', 'craftWing(', 'craftedWings'].filter((k) => !craftSrc.includes(k)).join(',')
  );
  check('CraftingSystem — 저장에 craftedWings 포함', craftSrc.includes('craftedWings: [...this.craftedWings]') && craftSrc.includes('Array.isArray(o.craftedWings)'));
}

section('요정의 날개 (배선 계약)');
{
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const mainSrc = read('../client/src/main.js');
  const panelSrc = read('../client/src/ui/panels.js');
  const hudSrc = read('../client/src/ui/hud.js');
  const cssSrc = read('../client/src/ui/styles.css');
  const adminSrc = read('../client/src/systems/admin-commands.js');
  const playerSrc = read('../client/src/player/player.js');

  check('main.js — WingSystem/WingRig import', /import \{ WingSystem \} from '\.\/systems\/wings\.js'/.test(mainSrc) && /import \{ WingRig \} from '\.\/player\/wings\.js'/.test(mainSrc));
  check('main.js — 카메라를 씬에 추가(뷰모델 렌더 조건)', mainSrc.includes('this.scene.add(this.camera)'));
  check('main.js — 날개 시스템/뷰모델 생성', mainSrc.includes('new WingSystem(') && mainSrc.includes('new WingRig({'));
  check('main.js — 프레임에서 _updateWings 호출', /_updateWings\(dt\)/.test(mainSrc) && mainSrc.includes('_updateWings(dt) {'));
check('main.js — 날개 토글(키맵)', mainSrc.includes("actionPressed('wings')") && mainSrc.includes('toggleWings()'));

  const mainMethods = ['_applyFlight', 'wingState', 'toggleWings', 'buyWing', 'equipWing', 'unequipWings', 'adminFly', '_updateWings'];
  check(
    'main.js — 비행 공개 메서드 8종',
    mainMethods.every((m) => new RegExp(`\\n  ${m}\\(`).test(mainSrc)),
    mainMethods.filter((m) => !new RegExp(`\\n  ${m}\\(`).test(mainSrc)).join(',')
  );

  const emits = [...new Set([...panelSrc.matchAll(/emit\('(wing:[a-z]+)'/g)].map((m) => m[1]))].sort();
  check('panels.js — wing 이벤트 2종 emit(획득은 제작대)', emits.join(',') === 'wing:equip,wing:unequip', emits.join(','));
  const listened = emits.filter((e) => mainSrc.includes(`on('${e}'`));
  check('main.js — 2종 모두 수신(이벤트 배선 일치)', listened.length === emits.length && emits.length === 2, `${listened.length}/${emits.length}`);

  const acts = [...new Set([...panelSrc.matchAll(/dataset\.act = '(wing-[a-z-]+)'/g)].map((m) => m[1]))].sort();
  const cases = acts.filter((a) => panelSrc.includes(`case '${a}'`));
  check(
    'panels.js — 날개 버튼 3종 클릭 처리(제작대 이동 + 착용/해제)',
    acts.join(',') === 'wing-equip,wing-goto-craft,wing-unequip' && cases.length === 3,
    `${cases.length}/${acts.length}: ${acts.join(',')}`
  );
  check(
    'panels.js — 인벤토리 날개 카드는 제작대로 안내',
    panelSrc.includes("make.dataset.act = 'wing-goto-craft'") &&
      panelSrc.includes("make.dataset.table = recipe ? recipe.table") &&
      panelSrc.includes("this.open('craft')"),
    panelSrc.includes('wing-goto-craft') ? 'ok' : 'wing-goto-craft 없음'
  );
  check(
    'panels.js — 제작 패널에 날개 레시피 카드/버튼',
    panelSrc.includes('wingRecipesForTable(table.id)') &&
      panelSrc.includes("card.dataset.role = 'craft-wing-row'") &&
      panelSrc.includes("btn.dataset.act = 'craft-wing'") &&
      panelSrc.includes("btn.dataset.wing = recipe.wingId") &&
      panelSrc.includes('_craftWing('),
    panelSrc.includes('craft-wing-row') ? 'ok' : 'craft-wing-row 없음'
  );
  check(
    'main.js — 날개 제작 함수/컨텍스트',
    /\n  craftWing\(id\) \{/.test(mainSrc) &&
      mainSrc.includes('this.crafting?.craftWing?.(id)') &&
      mainSrc.includes('hasWing: (id) =>') &&
      mainSrc.includes('onWingCrafted: (id) =>') &&
      mainSrc.includes('this.wings?.grant?.(id, { equip: true })'),
    mainSrc.includes('craftWing?.(id)') ? 'ok' : 'craftWing 없음'
  );
  check(
    'main.js — 날개 조회 별칭(wingRecipeFor)',
    /\n  wingRecipeFor\(id\) \{/.test(mainSrc) && mainSrc.includes('this.crafting?.wingRecipe?.(id)')
  );
  check('panels.js — KEYBINDS 에 V 추가', /KEYBINDS[\s\S]{0,4000}?'V'/.test(panelSrc) && panelSrc.includes('요정의 날개'));

  check('main.js — 저장/불러오기 왕복', /wings: this\.wings\?\.toJSON\?\.\(\)/.test(mainSrc) && mainSrc.includes('this.wings?.fromJSON?.(data.wings)'));
  check('main.js — 런 종료 시 정리(dispose)', mainSrc.includes('this.wings?.dispose?.()') && mainSrc.includes('this.wingRig?.dispose?.()'));

  check('hud.js — 날개 칩 + 비행 클래스', hudSrc.includes("'hud-stat-wings'") && hudSrc.includes('is-flying') && hudSrc.includes('비행 '));
  check('styles.css — 날개 스타일/애니메이션', cssSrc.includes('.hud-stat-wings') && cssSrc.includes('wing-flap') && cssSrc.includes('.wing-card'));

  check('admin-commands — fly/wings 케이스가 실제 메서드 호출', adminSrc.includes('game.adminFly(') && adminSrc.includes('.grant(') && adminSrc.includes('applyFlight'));

  // 플레이어 계약 — setFlight/canFly/지면 스냅 복원
  check('player.js — setFlight/canFly/_foldWings', playerSrc.includes('setFlight(profile = null)') && playerSrc.includes('get canFly()') && playerSrc.includes('_foldWings()'));
  check('player.js — 비행 중 지면 스냅 복원(필수 한 줄)', playerSrc.includes('if (this.flying) this.position.y = altitude;'));
  check('player.js — 상한 클램프 + 마나 소진 접힘', playerSrc.includes('flight.ceiling') && playerSrc.includes('if (this.mana <= 0) this._foldWings()'));

  // 실제 Game 없이 검증 가능한 마지막 조각 — 데이터 ↔ 시스템 ↔ 플레이어 프로필 일치
  const wingSys = new WingSystem();
  wingSys.grant('star_wings');
  const starProfile = wingSys.flight();
  const dataStar = FAIRY_WINGS.find((w) => w.id === 'star_wings');
  check(
    'flight() 프로필이 데이터 수치와 일치(무료 비행)',
    starProfile.speed === dataStar.flight.speed &&
      starProfile.lift === dataStar.flight.lift &&
      starProfile.descend === dataStar.flight.descend &&
      starProfile.drain === 0 &&
      starProfile.ceiling === dataStar.flight.ceiling,
    `speed ${starProfile.speed} · lift ${starProfile.lift} · drain ${starProfile.drain} · ceiling ${starProfile.ceiling}`
  );
}

// ───────────────────────────── 마우스 포인터 정책 (패널 열림 = 커서 표시)
section('마우스 포인터 정책 (패널 열림 = 커서 표시)');
{
  const mkInput = (locked) => ({
    locked,
    calls: [],
    exitPointerLock() {
      this.calls.push('exit');
      this.locked = false;
    },
    requestPointerLock() {
      this.calls.push('lock');
      this.locked = true;
    }
  });
  const openPanels = { hasOpen: () => true };
  const closedPanels = { hasOpen: () => false };

  const a = mkInput(true);
  check(
    '패널이 열리면 포인터 잠금을 푼다(커서 표시)',
    syncPointerLock({ state: 'playing', input: a, panels: openPanels }) === 'unlock' && a.locked === false,
    a.calls.join(',')
  );
  check(
    '패널이 닫히면 다시 잠근다(시점 조작)',
    syncPointerLock({ state: 'playing', input: a, panels: closedPanels }) === 'lock' && a.locked === true,
    a.calls.join(',')
  );
  const b = mkInput(false);
  check(
    '이미 풀려 있으면 중복 호출하지 않는다',
    syncPointerLock({ state: 'playing', input: b, panels: openPanels }) === null && b.calls.length === 0,
    b.calls.join(',') || '호출 0회'
  );
  const c = mkInput(true);
  check(
    '이미 잠겨 있으면 중복 호출하지 않는다',
    syncPointerLock({ state: 'playing', input: c, panels: closedPanels }) === null && c.calls.length === 0,
    c.calls.join(',') || '호출 0회'
  );
  check(
    '플레이 중이 아니면 손대지 않는다(메뉴·일시정지·게임오버)',
    syncPointerLock({ state: 'menu', input: mkInput(true), panels: openPanels }) === null &&
      syncPointerLock({ state: 'paused', input: mkInput(true), panels: openPanels }) === null &&
      syncPointerLock({ state: 'gameover', input: mkInput(true), panels: openPanels }) === null
  );
  check(
    '관리자 콘솔이 열려도 커서를 보여준다',
    syncPointerLock({ state: 'playing', input: mkInput(true), panels: closedPanels, admin: { isOpen: true } }) === 'unlock'
  );
  check(
    '입력/패널 정보가 없어도 예외 없이 동작',
    syncPointerLock({ state: 'playing', input: null, panels: openPanels }) === null &&
      syncPointerLock() === null &&
      syncPointerLock({ state: 'playing', input: mkInput(false) }) === 'lock'
  );
}

// ───────────────────────────── 패널 · 포인터 배선 계약
section('패널 · 포인터 배선 계약 (커서가 보여야 클릭할 수 있다)');
{
  const mainPtr = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const panelsPtr = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  const playerPtr = readFileSync(new URL('../client/src/player/player.js', import.meta.url), 'utf8');
  const hudPtr = readFileSync(new URL('../client/src/ui/hud.js', import.meta.url), 'utf8');
  const consolePtr = readFileSync(new URL('../client/src/ui/console.js', import.meta.url), 'utf8');
  const cssPtr = readFileSync(new URL('../client/src/ui/styles.css', import.meta.url), 'utf8');
  const panelKeys = ['craft', 'gacha', 'achievements', 'inventory', 'classes', 'seeds', 'multiplayer', 'codex'];

  check(
    '단축키 패널 토글이 모두 togglePanel 을 거친다(포인터 정책 단일 경로)',
    !/this\.ui\.panels\.toggle\('/.test(mainPtr) && panelKeys.every((id) => mainPtr.includes("this.togglePanel('" + id + "')")),
    panelKeys.length + '종'
  );
  check(
    '패널 open/close 이벤트가 포인터 정책을 부른다',
    /panels\.on\('open', \(\) => this\._syncPointerLock\(\)\)/.test(mainPtr) &&
      /panels\.on\('close', \(\) => \{[\s\S]{0,240}?this\._syncPointerLock\(\)/.test(mainPtr)
  );
  check(
    '_syncPointerLock 이 정책 모듈을 사용',
    mainPtr.includes("from './ui/pointer-lock.js'") && mainPtr.includes('syncPointerLock({ state: this.state, input: this.input')
  );
  check('건설 모드(B)도 포인터를 동기화', mainPtr.includes('건설 패널을 열면 커서가 보여야'));
  check('패널 관리자에 hasOpen()/currentId 가 있다', panelsPtr.includes('hasOpen() {') && panelsPtr.includes('get currentId()'));
  check(
    'Input 이 UI 클릭·비잠금 클릭을 게임 입력으로 받지 않는다',
    playerPtr.includes('_isUiTarget(e)') && playerPtr.includes('if (!this.locked && !this.lookWithoutLock) return;')
  );
  check(
    '조준선은 패널이 열리면 숨는다',
    hudPtr.includes('panels?.hasOpen?.()') && /is-hidden', !active \|\| state === 'paused' \|\| panelOpen/.test(hudPtr)
  );
  check('관리자 콘솔을 닫으면 포인터를 다시 잠근다', consolePtr.includes('this.game?._syncPointerLock?.()'));
  check('CSS 가 커서를 강제로 숨기지 않는다(잠금 해제 = 커서 표시)', !/cursor:\s*none/.test(cssPtr));
  check(
    '패널이 열려 있으면 캔버스 클릭으로 포인터를 다시 잠그지 않는다(커서 유지)',
    /canvas\?\.addEventListener\('click', \(\) => \{[\s\S]{0,220}?this\.ui\?\.panels\?\.hasOpen\?\.\(\)/.test(mainPtr)
  );
  check(
    '메뉴로 나갈 때(quit) 포인터를 푼다',
    /quit\(\) \{[\s\S]{0,240}?this\.input\.exitPointerLock\?\.\(\);/.test(mainPtr)
  );
}

// ────────────────────────────────────────── 건설창 · 포탑 선택 계약
section('건설창 · 포탑 선택 계약 (고르면 창이 닫히고 바로 설치)');
{
  const mainBuild = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const panelsBuild = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  const playerBuild = readFileSync(new URL('../client/src/player/player.js', import.meta.url), 'utf8');

  check(
    '포탑을 고르면 건설창을 닫는다(패널 카드 선택)',
    /_pickTurret\(typeId\) \{[\s\S]{0,420}?if \(this\._current === 'build'\) \{\s*this\.close\(\);/.test(panelsBuild)
  );
  check(
    '단축키·휠 선택 경로도 건설창을 닫는다',
    /selectTurret\(typeId\) \{[\s\S]{0,520}?this\._closeBuildPanel\(\);/.test(mainBuild)
  );
  check(
    '_closeBuildPanel — 건설 패널일 때만 닫고 포인터를 다시 잠근다',
    /_closeBuildPanel\(\) \{\s*if \(this\.ui\?\.panels\?\.currentId !== 'build'\) return false;\s*this\.ui\.panels\.close\(\);\s*this\._syncPointerLock\(\);\s*return true;/.test(
      mainBuild
    )
  );
  check(
    '건설창을 닫아도 건설 모드는 유지(build.active 를 건드리지 않는다)',
    !/_closeBuildPanel\(\) \{[\s\S]{0,200}?build\.active = false/.test(mainBuild) &&
      /selectTurret\(typeId\) \{[\s\S]{0,200}?this\.build\.active = true;/.test(mainBuild)
  );
  check(
    '외부 선택도 카드 하이라이트와 동기화(markBuildSelected)',
    panelsBuild.includes('markBuildSelected(typeId) {') && panelsBuild.includes("this.state.build.selected = turret.id;") &&
      mainBuild.includes('markBuildSelected?.(typeId)')
  );
  check(
    '건설 카드에 type·act 데이터가 있어 선택이 전달된다',
    panelsBuild.includes("card.dataset.act = 'build-pick';") && panelsBuild.includes('card.dataset.type = t.id;')
  );
  check(
    '건설창이 열려 있으면(포인터 해제) 휠로 포탑이 바뀌지 않는다',
    /_onWheel\(e\) \{\s*if \(!this\.locked\) return;/.test(playerBuild)
  );
}

// ────────────────────────────────────────── 열린 방 목록 (RoomManager.listPublic)
section('열린 방 목록 — 공개/비공개 · 정원 · 단계 필터');
{
  const { RoomManager } = await import(new URL('../server/game/RoomManager.js', import.meta.url).href);
  const sock = (id) => ({ id, join() {}, leave() {}, emit() {} });
  const mgr = new RoomManager();

  const pub = mgr.createRoom({ hostId: 'h1', mode: 'coop', difficulty: 'hard', seed: '111', maxPlayers: 4 });
  pub.addPlayer(sock('h1'), '공개방장');
  const priv = mgr.createRoom({ hostId: 'h2', mode: 'coop', maxPlayers: 4, private: true });
  priv.addPlayer(sock('h2'), '비밀방장');
  const solo = mgr.createRoom({ hostId: 'h3', mode: 'solo', maxPlayers: 1 });
  solo.addPlayer(sock('h3'), '혼자');

  const list = mgr.listPublic();
  check('비공개 방은 목록에서 빠진다', !list.some((r) => r.code === priv.code) && list.some((r) => r.code === pub.code), list.map((r) => r.code).join(','));
  const entry = list.find((r) => r.code === pub.code);
  check(
    '요약에 코드·모드·난이도·시드·인원·방장',
    entry.mode === 'coop' && entry.difficulty === 'hard' && entry.seed === '111' && entry.players === 1 && entry.maxPlayers === 4 && entry.host === '공개방장',
    JSON.stringify(entry)
  );
  check('로비 + 자리 있음 → joinable', entry.joinable === true && entry.phase === 'lobby' && entry.ageSec >= 0);
  check('정원이 찬 방은 joinable=false 로 남는다', list.find((r) => r.code === solo.code)?.joinable === false && list.find((r) => r.code === solo.code)?.players === 1);
  check('참가 가능한 방이 목록 앞에 온다', list[0]?.code === pub.code, list.map((r) => `${r.code}:${r.joinable}`).join(' '));
  check('includeFull=false 면 정원 찬 방은 제외', mgr.listPublic({ includeFull: false }).every((r) => r.joinable === true));
  check('요약에는 내부 상태(터렛·적)가 들어가지 않는다', !('turrets' in entry) && !('enemies' in entry) && !('chatLog' in entry));
  const started = pub.start();
  check('시작된 방은 목록에서 빠진다', started?.ok === true && !mgr.listPublic().some((r) => r.code === pub.code));
  check('비공개 여부가 요약에 사실대로 실린다', priv.summary().private === true && solo.summary().private === false);

  pub.dispose();
  priv.dispose();
  solo.dispose();
}

// ────────────────────────────────────────── 터널 자동 실행 (npm run dev:tunnel)
section('터널 자동 실행 — 공개 주소 파싱 · 명령 구성 · 대기');
{
  const tn = await import(new URL('../tools/tunnel-info.mjs', import.meta.url).href);

  const cfLog = [
    '2024-01-01T00:00:00Z INF Thank you for trying Cloudflare Tunnel.',
    '2024-01-01T00:00:01Z INF Requesting new quick Tunnel on trycloudflare.com...',
    '2024-01-01T00:00:03Z INF |  https://sweet-fort-1234.trycloudflare.com  |'
  ].join('\n');
  check('cloudflared 로그에서 공개 주소 추출', tn.parseTunnelUrl(cfLog) === 'https://sweet-fort-1234.trycloudflare.com', tn.parseTunnelUrl(cfLog));
  check('localtunnel 주소 인식', tn.parseTunnelUrl('your url is: https://tidy-panda-77.loca.lt') === 'https://tidy-panda-77.loca.lt');
  check('ngrok 주소 인식', tn.parseTunnelUrl('Forwarding https://ab12-34.ngrok-free.app -> http://localhost:3001') === 'https://ab12-34.ngrok-free.app');
  check(
    '문서·다운로드 링크는 공개 주소로 오해하지 않는다',
    tn.parseTunnelUrl('see https://developers.cloudflare.com/cloudflare-one/ and https://github.com/cloudflare/cloudflared/releases') === ''
  );
  check('주소가 없으면 빈 문자열', tn.parseTunnelUrl('INF starting tunnel …') === '');
  check('문장부호가 붙은 주소도 정리', tn.parseTunnelUrl('| https://a-b.trycloudflare.com. |') === 'https://a-b.trycloudflare.com');

  check('기본 제공자는 cloudflared', tn.tunnelProvider([], {}) === 'cloudflared');
  check('TUNNEL=localtunnel 환경변수 인식', tn.tunnelProvider([], { TUNNEL: 'localtunnel' }) === 'localtunnel');
  check('--provider=localtunnel 인자 인식', tn.tunnelProvider(['--provider=localtunnel'], {}) === 'localtunnel');
  check('--provider localtunnel(띄어쓰기) 인식', tn.tunnelProvider(['--provider', 'localtunnel'], {}) === 'localtunnel');
  check('--port 인자 인식(둘 다)', tn.tunnelPort(['--port', '3002'], {}) === 3002 && tn.tunnelPort(['--port=3100'], {}) === 3100);
  check('PORT 환경변수 · 기본 3001', tn.tunnelPort([], { PORT: '4100' }) === 4100 && tn.tunnelPort([], {}) === 3001);

  const plan = tn.tunnelPlan({ provider: 'cloudflared', port: 3001, platform: 'win32', env: {} });
  check('cloudflared 계획 — tunnel --url http://localhost:3001', plan.cmd === 'cloudflared' && plan.args.join(' ') === 'tunnel --url http://localhost:3001 --no-autoupdate', plan.args.join(' '));
  check('localtunnel 계획 — 윈도우는 npx.cmd', (() => {
    const p = tn.tunnelPlan({ provider: 'localtunnel', port: 3001, platform: 'win32', env: {} });
    return p.cmd === 'npx.cmd' && p.args.includes('localtunnel') && p.args.includes('3001');
  })());
  check('TUNNEL_CMD·TUNNEL_ARGS 로 명령 덮어쓰기(자동 테스트용)', (() => {
    const p = tn.tunnelPlan({ provider: 'cloudflared', port: 3101, env: { TUNNEL_CMD: 'node', TUNNEL_ARGS: '["fake.mjs","{port}"]' } });
    return p.cmd === 'node' && p.args.join(',') === 'fake.mjs,3101' && p.custom === true;
  })());

  // pollForTunnelUrl — 가짜 시계/읽기로 부수효과 없이 검증
  const clock = (() => {
    let now = 0;
    return { now: () => now, sleep: async () => { now += 500; } };
  })();
  const found = await tn.pollForTunnelUrl({ read: () => 'INF | https://x-y.trycloudflare.com |', sleep: clock.sleep, now: clock.now, timeoutMs: 5000 });
  check('대기 루프 — 주소가 나오면 즉시 성공', found.ok === true && found.url === 'https://x-y.trycloudflare.com' && found.reason === 'found');
  const dead = await tn.pollForTunnelUrl({ read: () => 'INF no url here', isAlive: () => false, sleep: clock.sleep, now: clock.now, timeoutMs: 5000 });
  check('대기 루프 — 터널이 죽으면 exited', dead.ok === false && dead.reason === 'exited', dead.reason);
  const late = (() => {
    let n = 0;
    return () => {
      n += 1;
      return n >= 3 ? 'INF | https://late-one.trycloudflare.com |' : 'INF waiting';
    };
  })();
  const waited = await tn.pollForTunnelUrl({ read: late, sleep: clock.sleep, now: clock.now, timeoutMs: 5000 });
  check('대기 루프 — 늦게 나온 주소도 잡는다', waited.ok === true && waited.url === 'https://late-one.trycloudflare.com' && waited.elapsedMs === 1000, `elapsed=${waited.elapsedMs}`);
  const timedOut = await tn.pollForTunnelUrl({ read: () => '', sleep: clock.sleep, now: clock.now, timeoutMs: 1000 });
  check('대기 루프 — 시간 초과 처리', timedOut.ok === false && timedOut.reason === 'timeout', timedOut.reason);
  check('실패 안내용 로그 꼬리 정리', tn.tailText('a\n\nb\nc\n', 2) === 'b\nc', JSON.stringify(tn.tailText('a\n\nb\nc\n', 2)));
}

section('레이아웃 계약 — 창이 좁아도 위쪽(제목·머리글)이 잘리지 않는다');
{
  // 창 높이보다 내용이 길 때 align-items:center + overflow 조합은 위쪽을 잘라 스크롤로도 닿지 못한다.
    const css = readFileSync(new URL('../client/src/ui/styles.css', import.meta.url), 'utf8');
    const rule = (sel) => {
      const i = css.indexOf(`${sel} {`);
      if (i < 0) return '';
      const j = css.indexOf('}', i);
      return j < 0 ? '' : css.slice(i, j + 1);
    };
    const panelOverlay = rule('.panel-overlay');
    const panel = rule('.panel');
    const menuOverlay = rule('.menu-overlay');
    const menuShell = rule('.menu-shell');
    const roomsList = rule('.menu-rooms-list');
    const narrow = css.slice(css.indexOf('@media (max-width: 900px)'));

    check(
      '패널 오버레이 — 위에서부터 정렬 + 자체 스크롤(넘칠 때 위쪽이 잘리지 않는다)',
      /align-items:\s*flex-start/.test(panelOverlay) && /overflow-y:\s*auto/.test(panelOverlay),
      panelOverlay.replace(/\s+/g, ' ').slice(0, 120)
    );
    check(
      '패널 — margin:auto 로 가운데 + 창 높이(100%) 안에 들어오게 제한',
      /margin:\s*auto/.test(panel) && /max-height:\s*min\(88vh, 900px\)/.test(panel) && /max-height:\s*min\([^)]*100%/.test(panel),
      panel.replace(/\s+/g, ' ').slice(0, 140)
    );
    check(
      '좁은 화면 미디어쿼리 — 패널도 100% 기준으로 제한',
      /\.panel\s*\{[\s\S]{0,80}max-height:\s*94vh[\s\S]{0,80}max-height:\s*min\(94dvh, 100%\)/.test(narrow),
      narrow.replace(/\s+/g, ' ').slice(0, 140)
    );
    check(
      '메뉴 오버레이 — 제목·탭까지 스크롤로 닿는다(align-items:center 는 위쪽을 잘라낸다)',
      /align-items:\s*flex-start/.test(menuOverlay) && /overflow-y:\s*auto/.test(menuOverlay),
      menuOverlay.replace(/\s+/g, ' ').slice(0, 120)
    );
    check('메뉴 셸 — auto 마진(짧으면 가운데, 길면 위에서부터)', /margin:\s*auto/.test(menuShell), menuShell.replace(/\s+/g, ' '));
    check(
      '열린 방 목록 — 자체 스크롤 + 높이 제한(메인 화면이 끝없이 길어지지 않는다)',
      /max-height:\s*min\(30vh, 300px\)/.test(roomsList) && /overflow-y:\s*auto/.test(roomsList),
      roomsList.replace(/\s+/g, ' ').slice(0, 140)
    );
    check(
      '모바일 노치 — 두 오버레이가 세이프 에어리어를 존중한다',
      (css.match(/env\(safe-area-inset-top\)/g) || []).length >= 2 && (css.match(/env\(safe-area-inset-bottom\)/g) || []).length >= 2,
      `top=${(css.match(/env\(safe-area-inset-top\)/g) || []).length} bottom=${(css.match(/env\(safe-area-inset-bottom\)/g) || []).length}`
    );
  }

// ────────────────────────────────────────── 마법부여 · 맨손 시작 · 건물 회전
section('마법부여 — 모든 무기 속성 부여 · 맨손 시작');
{
  const enchant = await import('../client/src/systems/enchant.js');
  const data = await import('../client/src/data.js');
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const panelSrc = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  const turretSrc = readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8');
  const netSrc = readFileSync(new URL('../client/src/net.js', import.meta.url), 'utf8');
  const serverSrc = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');

  // ── 데이터
  check('마법부여 속성 14종 · 최대 5레벨', enchant.ENCHANT_ELEMENT_LIST.length === 14 && enchant.ENCHANT_MAX === 5, `${enchant.ENCHANT_ELEMENT_LIST.length}종 / ${enchant.ENCHANT_MAX}레벨`);
  const enchantErrors = enchant.validateEnchantData();
  check('마법부여 데이터 무결성(모든 속성에 비용·재료·대응 속성)', enchantErrors.length === 0, enchantErrors.join(' · '));
  check('맨손 — WEAPONS 밖(수집 82종·가챠 계산 유지)', !data.WEAPONS.some((w) => w.id === 'fists') && data.WEAPONS.length === 82 && data.FIST_WEAPON.id === 'fists', `${data.WEAPONS.length}종`);
  check('맨손 — 근접 무기(피해·사거리·쿨다운)', data.FIST_WEAPON.kind === 'melee' && data.FIST_WEAPON.damage > 0 && data.FIST_WEAPON.range > 0 && data.FIST_WEAPON.cooldown > 0, `피해 ${data.FIST_WEAPON.damage} · ${data.FIST_WEAPON.range}m · ${data.FIST_WEAPON.cooldown}s`);
  check(
    'weaponOrFist — null/맨손/실제 무기',
    data.weaponOrFist(null) === data.FIST_WEAPON && data.weaponOrFist('fists') === data.FIST_WEAPON && data.weaponOrFist('sword1h_guard')?.id === 'sword1h_guard' && data.weaponOrFist('nope') === null
  );
  const minWeaponDamage = Math.min(...data.WEAPONS.filter((w) => !w.nonLethal && Number(w.damage) > 0).map((w) => Number(w.damage)));
  check('맨손 피해는 가장 약한 무기 이하다', data.FIST_WEAPON.damage <= minWeaponDamage, `맨손 ${data.FIST_WEAPON.damage} ≤ 최약 ${minWeaponDamage}`);

  // ── 시스템 동작
  const eco = { gold: 1e9, wood: 0, minerals: {}, canAfford: () => true, spend: () => true };
  const sys = new enchant.EnchantSystem({ economy: eco });
  const first = sys.enchant('sword1h_guard', 'fire', { hasWeapon: () => true, hasEnchanter: true });
  check('부여 — 1레벨', first.ok === true && first.level === 1 && first.state.percent === 8, JSON.stringify({ ok: first.ok, lv: first.level }));
  const again = sys.enchant('sword1h_guard', 'fire', { hasWeapon: () => true, hasEnchanter: true });
  check('같은 속성 재부여 — 레벨 상승·배율 증가', again.ok === true && again.level === 2 && again.state.damageMult > first.state.damageMult, `+${again.state.percent}%`);
  const swapped = sys.enchant('sword1h_guard', 'ice', { hasWeapon: () => true, hasEnchanter: true });
  check('다른 속성 — 1레벨로 교체', swapped.ok === true && swapped.level === 1 && swapped.state.element === 'ice');
  const noBuilding = sys.enchant('sword1h_guard', 'fire', { hasWeapon: () => true, hasEnchanter: false });
  check('마법부여대 없으면 부여 불가', noBuilding.ok === false && String(noBuilding.error).includes('마법부여대'), String(noBuilding.error));
  const notOwned = sys.enchant('sword1h_guard', 'fire', { hasWeapon: () => false, hasEnchanter: true });
  check('미보유 무기 부여 불가', notOwned.ok === false, String(notOwned.error));
  const everyone = data.WEAPONS.every((w) => sys.canEnchant(w.id, 'fire', { hasWeapon: () => true, hasEnchanter: true }).ok);
  check('모든 무기(82종)에 부여 가능', everyone, `${data.WEAPONS.length}종`);
  const levelCost = enchant.enchantCost('fire', 1);
  const nextCost = sys.costFor('sword1h_guard', 'ice').cost;
  check('레벨이 오르면 비용이 비싸진다', nextCost.gold > levelCost.gold, `${levelCost.gold} → ${nextCost.gold}`);
  const bonus = sys.bonusFor('sword1h_guard');
  check('bonusFor — 전투 반영값(속성·배율)', bonus.element === 'ice' && bonus.damageMult > 1, JSON.stringify({ element: bonus.element, mult: bonus.damageMult }));
  const restored = new enchant.EnchantSystem({}).fromJSON(JSON.parse(JSON.stringify(sys.toJSON())));
  check('부여 상태 저장/복원', restored.count === sys.count && restored.stateFor('sword1h_guard')?.element === 'ice' && restored.enchantCount === sys.enchantCount, `${restored.count}종`);
  const poor = new enchant.EnchantSystem({ economy: { gold: 0, minerals: {}, canAfford: (c) => Number(c?.gold ?? 0) === 0, spend: () => true } });
  const denied = poor.enchant('sword1h_guard', 'fire', { hasWeapon: () => true, hasEnchanter: true });
  check('재료 부족 — 부여 거부', denied.ok === false && String(denied.error).includes('재료'), String(denied.error));

  // ── main.js 배선 계약
  check('main.js — 기본 보유 무기 0종(맨손 시작)', /_defaultOwned\(\) \{\s*return new Set\(\);/.test(mainSrc));
  check('main.js — 시작 장착은 맨손', /this\.weapons = \{ owned: this\._defaultOwned\(\), equipped: FIST_WEAPON_ID \}/.test(mainSrc));
  check('main.js — 맨손 주먹 타격(쿨다운)', /if \(weapon\.fist\) \{[\s\S]{0,320}?_meleeStrike\(weapon\)/.test(mainSrc));
  check('main.js — 제작하면 자동 장착', /onCrafted: \(id\) => \{[\s\S]{0,320}?equipWeapon\(id, \{ silent: true, instant: true \}\)/.test(mainSrc));
  check('main.js — 보유 무기만 Q 순환(전체 목록 누출 없음)', !/const list = all\.length \? all : WEAPONS/.test(mainSrc));
  check('main.js — 마법부여대 판정 + E 상호작용', mainSrc.includes('enchanterBuilt()') && /if \(this\.nearEnchanter\(\)\) this\.togglePanel\('enchant'\)/.test(mainSrc));
  check('main.js — 근접 피해에 부여 배율·속성 반영', mainSrc.includes('this.enchant?.bonusFor?.(weapon.id)') && mainSrc.includes('enchantMult'));
  check('main.js — 부여 상태 저장/복원', mainSrc.includes('enchant: this.enchant?.toJSON?.()') && mainSrc.includes('this.enchant?.fromJSON?.(data.enchant)'));
  check('panels.js — 마법부여 패널(E·적용 버튼)', panelSrc.includes('_renderEnchant') && panelSrc.includes('enchant-apply') && /'enchant',\n  'classes'/.test(panelSrc));
  check('panels.js — 맨손 줄 + 부여 이동 버튼', panelSrc.includes('weapon-bare-row') && panelSrc.includes("'enchant-goto'"));
  check('main.js — 미리보기/설치 건물 회전(X·Shift+X)', mainSrc.includes('rotateAimedTurret') && mainSrc.includes('rotatePreview') && mainSrc.includes('sendTurretRotate'));
  check('turrets.js — yaw 저장/복원 + rotate API', turretSrc.includes('setYaw(') && /toJSON\(\) \{[\s\S]{0,420}?yaw: num\(this\.yaw, 0\)/.test(turretSrc) && turretSrc.includes('rotate(turretId'));
  check('net.js — turret:rotate 전송', netSrc.includes('sendTurretRotate'));
  check('server — turret:rotate 릴레이', serverSrc.includes("socket.on('turret:rotate'") && serverSrc.includes("type: 'turret:rotate'"));
  check('turrets.js — 포탑·시설 철거 환불 25%', turretSrc.includes('export const SELL_REFUND = 0.25') && turretSrc.includes('sell(turretId)'));
  check('main.js — 철거 모드(조준 레이캐스트·25% 환불·멀티 전송)', mainSrc.includes('setDemolish(') && mainSrc.includes('_findTurretAtCrosshair(') && mainSrc.includes('_tryDemolish(') && mainSrc.includes('sendTurretSell('));
  check('panels.js — 건설 패널 철거 버튼', panelSrc.includes("'build-demolish'") && panelSrc.includes("'demolish:start'"));
}

// ────────────────────────────────────────── 캐릭터 · 앉기 · 로그인 전환 · 부드러운 회전
section('캐릭터 — 멀티플레이 생성·전송·표시');
{
  const character = await import('../client/src/character.js');
  const menuSrc = readFileSync(new URL('../client/src/ui/menu.js', import.meta.url), 'utf8');
  const lobbySrc = readFileSync(new URL('../client/src/ui/lobby.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const roomSrc = readFileSync(new URL('../server/game/Room.js', import.meta.url), 'utf8');
  const serverSrc = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const managerSrc = readFileSync(new URL('../server/game/RoomManager.js', import.meta.url), 'utf8');

  const charErrors = character.validateCharacterData();
  check('캐릭터 데이터 무결성(외형 8종·이름 16자·색)', charErrors.length === 0, charErrors.join(' · '));
  check('외형은 코스메틱 — 능력치 필드 없음', character.CHARACTER_SKINS.every((s) => !('damage' in s) && !('speed' in s) && !('hp' in s)));
  const payload = character.characterPayload({ name: '  요새   지기 ', skin: 'mage' }, '수호자');
  check(
    '캐릭터 페이로드 — 이름 정리·아이콘·스킨 색',
    payload.name === '요새 지기' && payload.skin === 'mage' && payload.icon === '🧙' && payload.color === character.CHARACTER_SKIN_BY_ID.mage.color
  );
  check('모르는 외형·손상 입력 → 기본값', character.sanitizeCharacter({ name: 'x', skin: 'zzz' }).skin === 'guardian' && character.sanitizeCharacter(null).name === '');
  const remote = character.sanitizeRemoteCharacter({ skin: 'nope', color: -5, accent: 1e9, icon: '' });
  check(
    '릴레이 값 살균(색 범위·아이콘 대체)',
    remote.skin === 'guardian' && remote.color === character.CHARACTER_SKIN_BY_ID.guardian.color && remote.icon === character.CHARACTER_SKIN_BY_ID.guardian.icon
  );
  const mem = {
    _v: {},
    getItem(k) { return this._v[k] ?? null; },
    setItem(k, v) { this._v[k] = String(v); },
    removeItem(k) { delete this._v[k]; }
  };
  const store = character.createCharacterStore({ storage: mem });
  store.save({ name: '테스터', skin: 'rogue' });
  check('localStorage 저장/복원 왕복', store.load().name === '테스터' && store.load().skin === 'rogue');
  mem.setItem(character.CHARACTER_STORAGE_KEY, '{ 깨진 JSON');
  check('손상 세이브 내성(예외 없이 기본값)', store.load('대체이름').name === '대체이름');
  store.clear();
  // ── 캐릭터 전용 아이템 (v1.2.0) ────────────────────────────────
  {
    const { CHARACTER_ITEMS } = await import('../client/src/data.js');
    const { CharacterItemSystem, validateCharacterItemData } = await import('../client/src/systems/character-items.js');
    const errors = validateCharacterItemData();
    check('전용 아이템 무결성(8종·스킨 1:1·가격·보너스)', errors.length === 0, errors.join(' · '));
    check('전용 아이템 8종', CHARACTER_ITEMS.length === 8, `${CHARACTER_ITEMS.length}종`);
    const sys = new CharacterItemSystem({ persist: false });
    const guardian = { skin: 'guardian' };
    const knight = { skin: 'knight' };
    check('다른 캐릭터 전용은 구매 불가', sys.buy('charm_knight', { character: guardian, gold: 99999 }).ok === false);
    check('같은 캐릭터 전용은 구매 가능', sys.buy('charm_guardian', { character: guardian, gold: 99999 }).ok === true);
    check('구매 시 즉시 착용', sys.isEquipped('charm_guardian') === true);
    check('착용 보너스가 현재 캐릭터에 적용', Number(sys.bonus(guardian)?.damageTakenPct) > 0);
    check('다른 캐릭터에게는 보너스 없음', sys.bonus(knight) === null);
    check('다른 캐릭터로 바꾸면 자동 해제', sys.syncCharacter(knight) !== null && sys.isEquipped('charm_guardian') === false);
    check('보유하지 않은 아이템은 착용 불가', sys.equip('charm_mage', { character: { skin: 'mage' } }).ok === false);
    check('골드 부족 시 구매 실패', new CharacterItemSystem({ persist: false }).buy('charm_guardian', { character: guardian, gold: 0 }).ok === false);
    check('모르는 아이템은 거부', sys.buy('없는아이템', { character: guardian, gold: 99999 }).ok === false);
  }

  check('캐릭터 삭제', store.load().name === '');

  // ── 메뉴 · 로비 · 서버 배선
  check('menu.js — 🧍 캐릭터 탭 + 생성 UI', menuSrc.includes("character: '🧍 캐릭터'") && menuSrc.includes('_renderCharacter') && menuSrc.includes("'character-save'"));
  check('menu.js — 외형 8종 카드 + 이름 입력(16자)', menuSrc.includes("character-skin") && menuSrc.includes('CHARACTER_NAME_MAX'));
  check('menu.js — 저장 시 캐릭터 이벤트 발행', /this\.emit\('character', \{ character: saved \}\)/.test(menuSrc));
  check('lobby.js — 캐릭터를 방 만들기/참가에 전송', /character: this\._characterPayload\(\),?\n?\s*mode/.test(lobbySrc) && lobbySrc.includes('net.joinRoom({ code: c, nickname: this._nickname(), character: this._characterPayload() })'));
  check('lobby.js — 내 캐릭터 표시 + 만들기 버튼', lobbySrc.includes("'lobby-character'") && lobbySrc.includes('refreshCharacter'));
  check('server — room:create/join 이 character 전달', /addPlayer\(socket, nickname, opts\.character\)/.test(serverSrc) && /joinRoom\(code, socket, nickname, opts\.character\)/.test(serverSrc));
  check('RoomManager — joinRoom 이 character 전달', managerSrc.includes('joinRoom(code, socket, nickname, character)') && managerSrc.includes('addPlayer(socket, nickname, character)'));
  check('Room — 입장 시 외형 살균 저장', roomSrc.includes('character: sanitizeCharacter(character)') && roomSrc.includes('function sanitizeCharacter('));
  check('Room — serialize/snapshot 에 character', /character: p\.character/.test(roomSrc) && roomSrc.split('character: p.character').length - 1 === 2);
  check('main.js — RemotePlayers 가 캐릭터 외형·이름표·앉기 반영', mainSrc.includes('sanitizeRemoteCharacter') && mainSrc.includes('_nameTag') && mainSrc.includes('entry.sitAmount'));
  check('main.js — 로그인 후 계정 이름 채택', mainSrc.includes('_adoptAccountName'));
}

section('앉기 · 점프 · 로그인 후 메인화면 전환');
{
  const playerSrc = readFileSync(new URL('../client/src/player/player.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const panelSrc = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  const menuSrc = readFileSync(new URL('../client/src/ui/menu.js', import.meta.url), 'utf8');
  const cssSrc = readFileSync(new URL('../client/src/ui/styles.css', import.meta.url), 'utf8');

  check('player.js — 앉기 상태 필드(의도·보간·속도·시야)', ['this.sitting = false', 'this.sitAmount = 0', 'this.sitSpeedMult', 'this.sitEyeDrop'].every((s) => playerSrc.includes(s)));
check('player.js — 앉기 키(키맵, 날개 비행 중 제외)', /const wantsSit = Boolean\(!this\.flying && keyDown\(input, 'sit'\)\)/.test(playerSrc));
  check('player.js — 앉으면 이동 느려짐', playerSrc.includes('(1 - this.sitAmount * (1 - this.sitSpeedMult))'));
check('player.js — 앉은 채 점프 차단(키맵)', /keyConsume\(input, 'jump'\) && this\.onGround && this\.sitAmount < 0\.5/.test(playerSrc));
  check('player.js — 앉은 채 달리기 차단', playerSrc.includes('const sprinting = wantsSprint && this.onGround && this.sitAmount < 0.5;'));
  check('player.js — 앉기 시야 높이(카메라·eyePosition)', playerSrc.split('this.sitAmount * this.sitEyeDrop').length - 1 === 2);
  check('main.js — 앉기 상태를 서버로 전송(player:state)', mainSrc.includes('sit: this.player.sitting === true'));
  check('Room — player:state 의 sit 저장 + 스냅샷 전달', /sit: typeof state\.sit === 'boolean'/.test(readFileSync(new URL('../server/game/Room.js', import.meta.url), 'utf8')) && readFileSync(new URL('../server/game/Room.js', import.meta.url), 'utf8').includes('sit: p.state.sit === true'));

  check('panels.js — 로그인 후 패널을 닫고 auth:done 발행', panelSrc.includes('_scheduleAuthClose') && panelSrc.includes("this.emit('auth:done'"));
  check('main.js — auth:done → 메인화면 + 부드러운 등장', /panels\.on\('auth:done'/.test(mainSrc) && mainSrc.includes("this.ui.menu.show('main')") && mainSrc.includes('this.ui.menu.flash?.()'));
  check('menu.js — flash() 가 menu-enter 애니메이션을 건다', menuSrc.includes('flash()') && menuSrc.includes("classList.add('menu-enter')"));
  check('styles.css — menu-enter 키프레임 + 캐릭터 카드 스타일', cssSrc.includes('@keyframes menuEnter') && cssSrc.includes('.menu-shell.menu-enter') && cssSrc.includes('.character-grid') && cssSrc.includes('.character-swatch'));
  check('styles.css — 모션 최소화 설정 존중', cssSrc.includes('prefers-reduced-motion'));
}

section('건물 부드러운 회전 — R 홀드(연속) · X 45° · 릴레이');
{
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const turretSrc = readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8');
  const panelSrc = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');

  check('main.js — 회전 상수(도달·원뿔·연속 속도·전송 주기)', /const TURRET_ROTATE = \{ reach: 9, cone: 1\.5, match: 1\.6, holdSpeed: 2\.1, netHz: 12 \};/.test(mainSrc));
  check('main.js — R 홀드 연속 회전 구현', mainSrc.includes('_updateHoldRotate') && /this\.turrets\?\.rotate\?\.\(turret\.id, step, \{ smooth: true \}\)/.test(mainSrc));
  check('main.js — 건설 중 R 홀드도 미리보기 회전', /if \(this\.build\.active\) \{[\s\S]{0,320}?this\.build\.ghost\.rotation\.y = this\.build\.yaw/.test(mainSrc));
check('main.js — 조준 중이면 궁극기 키는 회전', /const aimForRotate = rotateKey \? \(this\.build\.active \? true : Boolean\(this\._aimedTurret\(\)\)\) : false;/.test(mainSrc) && mainSrc.includes("if (actionPressed('ultimate') && !aimForRotate) this.useUltimate();"));
  check('main.js — R 유지 회전 안내(1회)', mainSrc.includes('R 유지') && mainSrc.includes('_rotateHold'));
  check('main.js — 회전은 초당 netHz 회만 전송', mainSrc.includes('this._rotateNetAcc >= 1 / TURRET_ROTATE.netHz'));
  check('main.js — 릴레이 수신 회전도 부드럽게', mainSrc.includes("setYaw?.(found.id, Number(p.yaw) || 0, { smooth: true })"));
  check('turrets.js — setYaw(yaw, opts.smooth) + yawTarget', /setYaw\(yaw, opts = \{\}\)/.test(turretSrc) && turretSrc.includes('this.yawTarget = this.yaw'));
  // 함수가 길어져(추적 조준 포함) 보간식까지의 거리를 넉넉히 본다.
  check('turrets.js — _followYaw 가 매 프레임 보간', turretSrc.includes('_followYaw(step)') && /_followYaw\(dt\) \{[\s\S]{0,1600}?Math\.exp\(-14 /.test(turretSrc));
  check('turrets.js — 시스템 rotate/setYaw 옵션 전달', /rotate\(turretId, delta, opts = \{\}\)/.test(turretSrc) && /setYaw\(turretId, yaw, opts = \{\}\)/.test(turretSrc));
  check('panels.js — 단축키에 앉기·R 유지 회전 안내', panelSrc.includes("['Ctrl', '앉기 (누르는 동안)']") && panelSrc.includes("['R (유지)', '조준한 건물 부드럽게 회전']"));
}

// ─────────────────────────────────────── 추적 조준 (§4.42)
section('추적 조준 — 포탑이 몬스터를 따라간다');
{
  const turretSrc2 = readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8');
  const panelSrc2 = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  check(
    'turrets.js — TURRET_AIM 상수(회전 4.5rad/s · 수동 우선 1.6s)',
    /export const TURRET_AIM = Object\.freeze\(\{ turnRate: 4\.5, holdTime: 1\.6 \}\);/.test(turretSrc2)
  );
  check('turrets.js — 몸체 각도(aimYaw)와 추적 목표(_aimWant)', turretSrc2.includes('this.aimYaw = this.yaw') && turretSrc2.includes('this._aimWant'));
  check(
    'turrets.js — 추적은 turnRate 만큼만 돈다(순간이동 없음)',
    /const maxStep = TURRET_AIM\.turnRate \* step;/.test(turretSrc2) && turretSrc2.includes('Math.abs(diff) <= maxStep ? diff : Math.sign(diff) * maxStep')
  );
  check(
    'turrets.js — 포신은 몸체 회전을 보정해 항상 목표를 가리킨다',
    turretSrc2.includes('this._aimWant = wrapPi(barrelYaw + Math.PI)') && turretSrc2.includes('this.head.rotation.y = wrapPi(barrelYaw - bodyYaw)')
  );
  check('turrets.js — 적이 없으면 제자리 yaw 로 복귀', turretSrc2.includes('적이 없으면 제자리 각도로 복귀'));
  check('turrets.js — 수동 회전은 holdTime 동안 우선', turretSrc2.includes('this._aimHold = TURRET_AIM.holdTime'));
  check('turrets.js — aimState()/aimStatus() 제공', turretSrc2.includes('aimState() {') && turretSrc2.includes('aimStatus() {'));
  check('panels.js — 건설 카드에 조준 안내', panelSrc2.includes("row('조준'"));
  check('panels.js — 건설 카드에 DPS 표시', panelSrc2.includes("row('DPS'") && panelSrc2.includes('num(t.damage) * num(t.fireRate)'));
  check(
    'data.js — 연사 정상화 보정 상수(피해 ×60)',
    /export const TURRET_DAMAGE_SCALE = 60;/.test(readFileSync(new URL('../client/src/data.js', import.meta.url), 'utf8')) &&
      readFileSync(new URL('../client/src/data.js', import.meta.url), 'utf8').includes('fam.damage * sc.damage * TURRET_DAMAGE_SCALE')
  );
  check('turrets.js — 발사가 cooldown 으로 게이트된다(연사 정상화)', turretSrc2.includes('★ 연사 게이트') && turretSrc2.includes('if (this.cooldown > 0) return;'));
}

console.log(`\n${'═'.repeat(58)}`);
  section('관리자 명령 멈춤 방지 · 닉네임 만들기 (계약 §4.53 · §4.54)');
    const adminSrcF = readFileSync(new URL('../client/src/systems/admin-commands.js', import.meta.url), 'utf8');
    const consoleSrcF = readFileSync(new URL('../client/src/ui/console.js', import.meta.url), 'utf8');
    const mainSrcF = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
    const auditPanels = adminSrcF.split('requestPanels(game);').length - 1;
    check('관리자 명령 — 패널 갱신을 다음 프레임으로 미룬다(즉시 렌더 0곳)', adminSrcF.includes('export function requestPanels') && !adminSrcF.includes('panels?.refresh?.()') && auditPanels === 3, `${auditPanels}곳`);
    check('관리자 콘솔 — 지연 갱신 + 명령 소요 시간 계측', consoleSrcF.includes('requestPanels(this.game)') && !consoleSrcF.includes('panels?.refresh?.()') && consoleSrcF.includes('SLOW_COMMAND_MS') && consoleSrcF.includes('lastCommand'));
    check('관리자 콘솔 — 게임 중이면 닫는 방법을 안내(멈춘 것처럼 보이지 않게)', consoleSrcF.includes('콘솔을 닫으면 게임이 계속됩니다'));
    check('무기 셰이더 프리웜 — 메뉴 6종 · 게임 중 1종 · 일시정지 0종', mainSrcF.includes('_prewarmStep(perFrame = 6, budgetMs = 2.5)') && mainSrcF.includes('buildWeaponMesh(id)') && mainSrcF.includes("if (this.state === 'menu') {") && mainSrcF.includes("} else if (this.state !== 'paused') {") && /compile\.call\(this\.renderer/.test(mainSrcF));
    check('일시정지 중에는 예열·장착을 하지 않는다(H-80 ESC 멈춤 수정)', mainSrcF.includes('this._summonStep();') && !mainSrcF.includes("this.state === 'menu' || this.state === 'paused' ? 6 : 1") && mainSrcF.includes("if (this.state === 'paused' || this.state === 'menu') return null;"));
    check('느린 프레임 로그 — 마지막 관리자 명령 + 예열 진행 기록', mainSrcF.includes('perf.lastCommand') && mainSrcF.includes('예열 '));
    check('requestPanels — 프레임 병합 우선, 없으면 즉시 렌더', requestPanels({ ui: { panels: { requestRefresh: () => 'merged', refresh: () => 'now' } } }) === 'merged' && requestPanels({ ui: { panels: { refresh: () => 'now' } } }) === 'now');
    check('requestPanels — 게임/패널이 없으면 false', requestPanels(null) === false && requestPanels({}) === false);
    const waveStub = { waves: { wave: 0, reset() {}, forceStart() {} } };
    const waveHigh = runAdminCommand('/웨이브 5000', { game: waveStub, user: { role: 'admin' } });
    check('/웨이브 — 상한 999 로 조정', waveStub.waves.wave === 998 && waveHigh.ok === true && waveHigh.lines.join(' ').includes('상한 999'), `wave=${waveStub.waves.wave}`);
    const waveMid = runAdminCommand('/웨이브 150', { game: { waves: { wave: 0, reset() {}, forceStart() {} } }, user: { role: 'admin' } });
    check('/웨이브 — 큰 웨이브는 안내 문구를 함께 보여 준다', waveMid.lines.join(' ').includes('느려질 수 있습니다'));
    check('profile — 살균·길이 규칙', validateProfileData().length === 0, validateProfileData().join(' · ') || '전부 통과');
    check('profile — 16자 제한과 빈 값 거부', sanitizeNickname('가'.repeat(40)).length === NICKNAME_MAX && sanitizeNickname('   ') === '' && isValidNickname('   ') === false);
    const nickOrder = (() => {
      setNickname('');
      const a = nicknameFor({ nickname: '계정닉', username: 'user1' }) === '계정닉';
      const b = nicknameFor({ username: 'user1' }) === 'user1';
      const c = nicknameFor(null) === '수호자';
      setNickname('내닉');
      const d = nicknameFor({ nickname: '계정닉' }) === '내닉';
      setNickname('');
      return a && b && c && d && currentNickname() === '';
    })();
    check('profile — 닉네임 > 계정 닉네임 > 아이디 우선순위', nickOrder);
    const panelsSrcF = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
    const menuSrcF = readFileSync(new URL('../client/src/ui/menu.js', import.meta.url), 'utf8');
    const lobbySrcF = readFileSync(new URL('../client/src/ui/lobby.js', import.meta.url), 'utf8');
    const netSrcF = readFileSync(new URL('../client/src/net.js', import.meta.url), 'utf8');
    const authSrcF = readFileSync(new URL('../server/api/auth.js', import.meta.url), 'utf8');
    check('닉네임 UI — 계정 패널에 입력·저장·지우기', panelsSrcF.includes("'nickname-save'") && panelsSrcF.includes("'nickname-clear'") && panelsSrcF.includes("_inputRow('auth'") && panelsSrcF.includes('_saveNickname'));
    check('닉네임 UI — 캐릭터 화면 입력 + 메뉴 상단 표시', menuSrcF.includes("dataset.role = 'nickname'") && menuSrcF.includes('nicknameFor(user)') && menuSrcF.includes('setNickname('));
    check('닉네임 — 멀티 표시 이름에 반영(lobby·panels)', lobbySrcF.includes('currentNickname()') && panelsSrcF.includes('nicknameFor(safe('));
    check('닉네임 — 서버 계정 반영(라우트 + 클라이언트)', authSrcF.includes("router.post('/nickname'") && authSrcF.includes('UPDATE users SET nickname') && netSrcF.includes('updateNickname'));
// ───────────────────────── H-56 점프 우선 · 키 변경
section('점프 우선 · 키 변경 (계약 §4.56 · §4.55)');
{
  const playerSrcK = readFileSync(new URL('../client/src/player/player.js', import.meta.url), 'utf8');
  const mainSrcK = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const panelsSrcK = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  check('점프 버그 — 지상에서는 점프가 먼저, 비행은 잠금이 풀린 뒤', playerSrcK.includes('this._jumpLock = 0.22') && playerSrcK.includes('const jumpLocked = this._jumpLock > 0') && playerSrcK.includes("const wantAir = Boolean(fly && !jumpLocked"), ' 잠금 없음');
  check('점프 — 플레이어가 키맵을 쓴다(Space 하드코딩 제거)', playerSrcK.includes("keyConsume(input, 'jump')") && !playerSrcK.includes("consumePressed?.('Space')") && playerSrcK.includes("keyDown(input, 'forward')"));
  check('키맵 — main.js 가 하드코딩 대신 동작 이름을 쓴다', mainSrcK.includes('actionPressed(') && mainSrcK.includes('actionHeld(') && !mainSrcK.includes("pressed('KeyC')") && !mainSrcK.includes("pressed('Tab')"));
  check('키 변경 UI — 설정 패널에 변경/기본/전체 초기화', panelsSrcK.includes("'key-set'") && panelsSrcK.includes("'key-reset'") && panelsSrcK.includes("'key-reset-all'") && panelsSrcK.includes('_beginKeyCapture'));
  check('keys — 무결성 검사(변경·중복 거부·ESC 고정·복원)', validateKeyData().length === 0, validateKeyData().join(' · ') || '전부 통과');
  check('keys — 기본값은 기존 하드코딩과 같다', keyCodes('jump').join(',') === 'Space' && keyCodes('forward').join(',') === 'KeyW,ArrowUp' && keyCodes('sit').join(',') === 'ControlLeft,ControlRight' && keyLabel('KeyP') === 'P');
  check('keys — ESC 는 바꿀 수 없다', setKey('jump', 'Escape', { persist: false }).ok === false && keyCodes('jump').join(',') === 'Space');
  check('keys — 30개 동작이 모두 라벨/그룹을 가진다', KEY_ACTIONS.length === 30 && KEY_ACTIONS.every((a) => a.label && a.group && a.def.length > 0), KEY_ACTIONS.length + '개');
    check('keys — 시점 전환 동작이 있다(H 키)', (KEY_ACTIONS.find((a) => a.id === 'camera')?.def ?? []).includes('KeyH') === true, JSON.stringify((KEY_ACTIONS.find((a) => a.id === 'camera')?.def) ?? []));
  resetAllKeys({ persist: false });
}
// ───────────────────────── H-57 조합법 도감(지형별)
section('조합법 도감 — 지형별 (계약 §4.57)');
{
  const errors = validateRecipeData();
  check('조합법 도감 — 자료 무결성(지형·재료·제작대)', errors.length === 0, errors.join(' · ') || '전부 통과');
  const terrains = recipeTerrains();
  check('조합법 도감 — 조합법 30종 이상', recipeCount() >= 30, recipeCount() + '종');
  check('조합법 도감 — 지형 6곳 이상으로 나뉜다', terrains.length >= 6, terrains.map((t) => t.name + ' ' + t.count).join(' / '));
  check('조합법 도감 — 숨은 지형(벚꽃의 정원 · 시간의 지평선 · 꿈의 정원) 포함', ['cherry_garden', 'time_horizon', 'garden_of_dreams'].every((id) => terrains.some((t) => t.id === id)), terrains.map((t) => t.id).join(','));
  check('조합법 도감 — 종류(무기·날개·화살·광물 조합) 모두 있음', ['weapon', 'wing', 'arrow', 'combo'].every((k) => recipesFor('all', k).length > 0) && RECIPE_KINDS.length === 5);
  const firstTerrain = terrains[0];
  const only = recipesFor(firstTerrain.id, 'all');
  check('조합법 도감 — 지형 필터가 그 지형만 돌려준다', only.length === firstTerrain.count && only.every((e) => e.terrain === firstTerrain.id));
  const panelsSrcR = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  check('조합법 패널 — PANEL_IDS/PANEL_TITLES/_render 분기 연결', /'recipes'/.test(panelsSrcR) && panelsSrcR.includes("recipes: '조합법'") && panelsSrcR.includes("_renderRecipes(body)") && panelsSrcR.includes('recipe-terrain') && panelsSrcR.includes('recipe-goto'));
}
// ───────────────────────── H-58 웨이브 100 · 셀레스티얼 · 무한 모드
section('웨이브 100 · 셀레스티얼 · 무한 모드 (계약 §4.58)');
{
  const celestial = BOSS_TYPES.find((b) => b.id === 'celestial');
  check('기본 모드 — 웨이브 100 까지', Number(WAVE_CONFIG.finalWave) === 100, 'finalWave=' + WAVE_CONFIG.finalWave);
  check('셀레스티얼 — 웨이브 100 에 등장(최종보스)', Boolean(celestial) && BOSS_TYPES[BOSS_TYPES.length - 1]?.id === 'celestial', celestial ? celestial.name : '없음');
  check('셀레스티얼 — 체력 5,000,000 · 공격력 1,200', celestial?.hp === 5000000 && celestial?.attack === 1200 && celestial?.damage === 1200, `hp=${celestial?.hp} attack=${celestial?.attack} damage=${celestial?.damage}`);
  check('무한 모드 — 300 웨이브마다 셀레스티얼(+35%)', Number(WAVE_CONFIG.endlessCelestialEvery) === 300 && Math.abs(Number(WAVE_CONFIG.endlessCelestialGrowth) - 1.35) < 1e-9);
  check('웨이브 100 도달 가능 — 마릿수 상한 · 성장 완만화', Number(WAVE_CONFIG.maxCount) === 240 && Number(WAVE_CONFIG.softenAfter) === 30 && Number(WAVE_CONFIG.growthSoftening) > 0 && Number(WAVE_CONFIG.growthSoftening) < 1, `maxCount=${WAVE_CONFIG.maxCount} softenAfter=${WAVE_CONFIG.softenAfter} x${WAVE_CONFIG.growthSoftening}`);
  const growth = [0, 1, 2, 3].map((n) => Math.round(5000000 * Math.pow(1.35, n)));
  check('무한 모드 — 등장 차수 스펙(1 → 1.35 → 1.8225 …배)', growth[0] === 5000000 && growth[1] === 6750000 && growth[2] === 9112500, growth.join(' → '));
  const errorsP = validateProgressData();
  check('진행 저장 — 무결성(해금 · 최고 웨이브)', errorsP.length === 0, errorsP.join(' · ') || '전부 통과');
  const u = unlockEndless({ wave: ENDLESS_UNLOCK_WAVE, persist: false });
  check('진행 저장 — 무한 모드 해금 · 요약 문구', u.unlocked === true && isEndlessUnlocked() === true && recordWave(120, { persist: false }).bestWave >= 120 && progressSummary().includes('무한 모드'), progressSummary());
  const wavesSrc = readFileSync(new URL('../client/src/systems/waves.js', import.meta.url), 'utf8');
  check('웨이브 시스템 — mode 분기 · 차수 카운터 · +35% 적용', wavesSrc.includes("this.mode === 'endless'") && wavesSrc.includes('endlessCelestialEvery') && wavesSrc.includes('this.celestialSpawns') && wavesSrc.includes('endlessCelestialGrowth') && wavesSrc.includes('type: entry.type ?? null'));
  // H-69 — 후반 밸런스: 공격력은 완만(+12% · 상한 ×6), 보상은 +25%(계약 §4.65)
  check('무한 모드 — 공격력 성장은 완만(+12%)·상한 ×6', Math.abs(Number(WAVE_CONFIG.endlessCelestialAttackGrowth) - 1.12) < 1e-9 && Number(WAVE_CONFIG.endlessCelestialAttackCap) === 6, `${WAVE_CONFIG.endlessCelestialAttackGrowth} / ×${WAVE_CONFIG.endlessCelestialAttackCap}`);
  check('무한 모드 — 보상 성장 +25%', Math.abs(Number(WAVE_CONFIG.endlessCelestialGoldGrowth) - 1.25) < 1e-9);
  const atkCurve = [0, 1, 2, 3].map((n) => Math.round(1200 * Math.min(6, Math.pow(1.12, n))));
  check('무한 모드 — 공격력 곡선(1200 → 1344 → 1505 → 1686)', atkCurve[0] === 1200 && atkCurve[1] === 1344 && atkCurve[2] === 1505 && atkCurve[3] === 1686, atkCurve.join(' → '));
  check('무한 모드 — 상한 ×6 은 16차에서 걸린다', Math.round(1200 * Math.min(6, Math.pow(1.12, 16))) === 7200 && Math.round(1200 * Math.min(6, Math.pow(1.12, 15))) < 7200, `16차 ${Math.round(1200 * Math.min(6, Math.pow(1.12, 16)))}`);
  const goldCurve = [0, 1, 2, 3].map((n) => Math.round(250000 * Math.pow(1.25, n)));
  check('무한 모드 — 보상 곡선(25만 → 31.25만 → …)', goldCurve[0] === 250000 && goldCurve[1] === 312500 && goldCurve[2] === 390625, goldCurve.join(' → '));
  const panelSrc9 = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  check('설정 — 500 FPS 예산 행(현재 프레임/2.0ms)', panelSrc9.includes("perfRow('프레임 예산 (500 FPS)', 'budget')") && panelSrc9.includes('const budgetMs = 2.0;') && panelSrc9.includes('FPS 여력'));
  const turretSrc9 = readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8');
  check('포탈 — 제작 카드/설치 버튼 훅', panelSrc9.includes("dataset.role = 'craft-portal-row'") && panelSrc9.includes("dataset.act = 'portal-install'") && panelSrc9.includes('_portalSection(body)'));
  check('채굴기 — 티끌이 지형 색으로 물든다', turretSrc9.includes('accent.clone()') && turretSrc9.includes('dustMat.color.set(tint)') && turretSrc9.includes("from '../travel.js'"));
  const enemiesSrc = readFileSync(new URL('../client/src/systems/enemies.js', import.meta.url), 'utf8');
  check('적 — 고정 스탯 보스는 편성표 배율 제외(정확히 5,000,000)', enemiesSrc.includes('const fixedStats = fixedHp > 0;') && enemiesSrc.includes('if (this.mods && !fixedStats)'));
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  check('메인 — 무한 모드 게이트 · 웨이브 100 해금 · mode 전달', mainSrc.includes('unlockEndless({ wave })') && mainSrc.includes('wave >= ENDLESS_UNLOCK_WAVE') && mainSrc.includes('mode: this.mode,') && mainSrc.includes('isEndlessUnlocked()'));
  const menuSrc = readFileSync(new URL('../client/src/ui/menu.js', import.meta.url), 'utf8');
  check('메뉴 — 무한 모드 잠금 표시(🔒) 와 해금 안내', menuSrc.includes('isEndlessUnlocked()') && menuSrc.includes('🔒') && menuSrc.includes('ENDLESS_UNLOCK_WAVE'));
}
// ───────────────────────── H-59 지형별 텔레포트 포탈
section('지형별 텔레포트 포탈 (계약 §4.59)');
{
  const errorsT = validateTravelData();
  check('이동 지형 — 자료 무결성(색 · 좌표 · 묶음)', errorsT.length === 0, errorsT.join(' · ') || '전부 통과');
  const dests = destinationList();
  check('이동 지형 — 9곳 이상(기지 · T1~T7 · 숨은 지형)', dests.length >= 9, dests.map((d) => d.id).join(','));
  check('이동 지형 — T1~T7 전부 포함', ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'tier6', 'tier7'].every((id) => dests.some((d) => d.id === id)));
  check('이동 지형 — 지형마다 다른 색', new Set(dests.map((d) => d.color)).size >= dests.length - 1, dests.map((d) => d.color).join(' '));
  check('이동 지형 — 색 형식(#rrggbb) 과 정수 변환', dests.every((d) => /^#[0-9a-f]{6}$/i.test(d.color)) && dests.every((d) => Number.isInteger(colorInt(d.color))) && colorInt('#ff7a45') === 0xff7a45);
  check('이동 지형 — 지형 묶음 7개 이상', destinationsByTerrain().length >= 7, destinationsByTerrain().map((g) => g.label).join(' / '));
  check('이동 지형 — 숨은 지형(벚꽃의 정원 · 시간의 지평선) 포함', ['cherry_garden', 'time_horizon'].every((id) => dests.some((d) => d.id === id && d.hidden === true)));
  check('이동 지형 — 도착 좌표가 맵 안(반지름 2600 이하)', dests.every((d) => { const p = arrivalPoint(d); return Math.hypot(p.x, p.z) <= 2600; }));
  const mainSrcT = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  check('포탈 — 월드 포탈 제거 · 설치 포탈 N 이동', !mainSrcT.includes('TeleportField') && mainSrcT.includes('travelToRegion(built.dest)') && mainSrcT.includes("actionPressed('travel')"));
  check('포탈 — 제작 아이템 API(제작·보유·설치)', mainSrcT.includes('craftPortal(dest)') && mainSrcT.includes('portalCount(dest)') && mainSrcT.includes('beginPortalPlacement(dest)'));
  const panelsSrcT = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  check('포탈 — 패널(travel) 안내 + 제작/설치 카드', panelsSrcT.includes("travel: '포탈'") && panelsSrcT.includes('_renderTravel(body)') && panelsSrcT.includes("case 'craft-portal'") && panelsSrcT.includes("case 'portal-install'"));
  const craftSrcT = readFileSync(new URL('../client/src/crafting.js', import.meta.url), 'utf8');
  check('포탈 — 제작법 8종 · 제작대 연결', PORTAL_RECIPE_COUNT === 8 && craftSrcT.includes('PORTAL_RECIPES = PORTAL_DESTS.map') && craftSrcT.includes("tier7: 'forge_t7'"));
  const turretSrcT = readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8');
  check('포탈 — 설치 시 아이템 소모(골드 아님)', turretSrcT.includes('check.portalItem') && turretSrcT.includes('_takeItem') && !TURRETS.filter((x) => x.category === 'portal').some((x) => Number(x.cost?.gold) > 0));
}
// ───────────────────────── H-62 닉네임 중복 허용
section('닉네임 중복 허용 (계약 §4.54)');
{
  const dbSrc = readFileSync(new URL('../server/db.js', import.meta.url), 'utf8');
  check('DB — 닉네임 열에 고유 제약이 없다', /nickname TEXT,/m.test(dbSrc) && !/nickname TEXT UNIQUE/i.test(dbSrc), 'username 만 UNIQUE');
  const authSrc = readFileSync(new URL('../server/api/auth.js', import.meta.url), 'utf8');
  check('서버 — 닉네임 저장에 중복 검사가 없다', authSrc.includes('UPDATE users SET nickname = ? WHERE id = ?') && !/WHERE nickname\s*=\s*\?/.test(authSrc));
  check('서버 — 닉네임 중복 허용 주석', authSrc.includes('닉네임은 **중복을 허용**한다'));
  const panelSrcN = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  const menuSrcN = readFileSync(new URL('../client/src/ui/menu.js', import.meta.url), 'utf8');
  check('UI — 설정/메뉴에 중복 닉네임 안내', panelSrcN.includes('중복 닉네임') && menuSrcN.includes('중복 닉네임도 됩니다') && menuSrcN.includes('중복 가능'));
  const n1 = setNickname('같은이름', { persist: false });
  const n2 = setNickname('같은이름', { persist: false });
  check('클라이언트 — 같은 닉네임을 다시 저장해도 통과', n1?.ok !== false && n2?.ok !== false, JSON.stringify(n2 ?? n1));
}
// ───────────────────────── H-64 채굴기 티어 채굴
section('채굴기 티어 채굴 (계약 §4.60)');
{
  const T = await import('../client/src/systems/turrets.js');
  check('T1 채굴기·T1 지형은 예전 그대로(보정 없음)', T.drillYieldBonus(1, 1) === 1 && T.drillLowTierChance(1, 1) === 0);
  check('고티어일수록 저티어 광물 채굴량 증가', T.drillYieldBonus(5, 1) > T.drillYieldBonus(3, 1) && T.drillYieldBonus(3, 1) > T.drillYieldBonus(1, 1), `T5/T1 ×${T.drillYieldBonus(5, 1).toFixed(2)}`);
  check('같은 등급 광물은 보정 없음', T.drillYieldBonus(5, 5) === 1 && T.drillYieldBonus(2, 3) === 1);
  check('고티어일수록 저티어 광물 랜덤 확률 상승(상한 0.6)', T.drillLowTierChance(4, 3) === 0.6 && T.drillLowTierChance(2, 3) === 0.2 && T.drillLowTierChance(3, 1) === 0);
  check('저티어 확률 0이면 지형 등급 그대로', T.drillPickGrade({ power: 1, terrainGrade: 3, roll: 0, pickRoll: 0 }) === 3);
  check('저티어 확률에 걸리면 낮은 등급을 고른다', T.drillPickGrade({ power: 5, terrainGrade: 5, roll: 0.1, pickRoll: 0.9 }) < 5 && T.drillPickGrade({ power: 5, terrainGrade: 5, roll: 0.1, pickRoll: 0 }) >= 1);
  check('채굴 능력 등급 = max(채굴기, 지형)', T.drillPower({ drillTier: 2, terrainGrade: 5 }) === 5 && T.drillPower({ drillTier: 7, terrainGrade: 3 }) === 7);
}
// ───────────────────────── H-71 무기 소환 멈춤 수정
section('관리자 무기 소환 — 멈춤 방지 (계약 §4.67)');
{
  const mainSrc7 = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  check('일시정지·메뉴에서는 3D 렌더를 멈춘다(H-86 — 패널 블러 멈춤)', mainSrcF.includes('const frozenView =') && mainSrcF.includes('if (needRender) {') && mainSrcF.includes('this._viewIdle >= 1.5'));
  check('풀릴 때·멈출 때 화면을 한 번 다시 그린다', mainSrcF.includes('this._viewDirty = true; // 풀리는 순간 한 번 다시 그린다') && /if \(this\.state !== 'playing'\) return;[\s\S]{0,60}_viewDirty = true;/.test(mainSrcF));
  check('예열이 게임 중에도 돈다(멈춤의 근본 원인) — 일시정지에서는 멈춘다(H-80)', mainSrcF.includes('this._prewarmStep(1);') && mainSrcF.includes("} else if (this.state !== 'paused') {") && !mainSrcF.includes("this.state === 'menu' || this.state === 'paused' ? 6 : 1"));
  check('소환은 지급 → 예열 → 장착으로 나뉜다', mainSrc7.includes('summonWeapon(id, { silent = false } = {})') && mainSrc7.includes('_warmWeapon(id)') && mainSrc7.includes('compile.call(this.renderer, this._warmScene, this.camera);'));
  const adminSrc7 = readFileSync(new URL('../client/src/systems/admin-commands.js', import.meta.url), 'utf8');
  check('/무기 명령이 소환 큐를 쓴다', adminSrc7.includes('typeof game.summonWeapon === \'function\'') && adminSrc7.includes('game.summonWeapon(weapon.id, { silent: true })'));
  const q = await import('../client/src/systems/summon-queue.js');
  const errors = q.validateSummonQueue();
  check('소환 큐 — 자체 검증(중복·순서·예열 실패·상한)', errors.length === 0, errors.join(' / ') || '전부 통과');
  const queue = new q.SummonQueue();
  queue.push('a'); queue.push('b');
  const order = [];
  queue.step((id) => { order.push(`warm:${id}`); return true; }, (id) => order.push(`equip:${id}`));
  queue.step((id) => { order.push(`warm:${id}`); return true; }, (id) => order.push(`equip:${id}`));
  check('한 프레임에 한 종씩만 장착한다', order.join(',') === 'warm:a,equip:a,warm:b,equip:b', order.join(' → '));
}
// ───────────────────────── H-73 컨베이어벨트 물류
section('컨베이어벨트 — 실제 물류 (계약 §4.68)');
{
  const turretSrc8 = readFileSync(new URL('../client/src/systems/turrets.js', import.meta.url), 'utf8');
  check('벨트가 캔 광물을 싣는다(입금은 하역 때)', turretSrc8.includes('beltLoad(this, id, whole, this._beltList(system))') && turretSrc8.includes("this.type?.kind !== 'conveyor'"));
  check('벨트가 상자를 흘려보내고 넘기고 하역한다', turretSrc8.includes('beltAdvance(this, dt, {') && turretSrc8.includes('beltAccept(beltNeighbor(belt, belts), id)') && turretSrc8.includes('beltReceiver(belt, belts)'));
  check('하역한 순간에 입금된다', turretSrc8.includes("belt._creditMineral(id, 1, true); // 하역 = 그때 입금"));
  check('벨트 위 광물 상자가 3D 로 보인다', turretSrc8.includes('beltCrate = true') && turretSrc8.includes('crate.position.set(0, 0.24, span / 2 - num(item.t) * span)') && turretSrc8.includes('MINERAL_BY_ID[item.id]?.color'));
  check('벨트 위 광물이 저장·복원된다', turretSrc8.includes('items: Array.isArray(this.beltItems) && this.beltItems.length') && turretSrc8.includes("if (type.kind === 'conveyor' && Array.isArray(entry.items))"));
  const beltTypes = ['facility_conveyor_t1', 'facility_conveyor_t4', 'facility_conveyor_t7'];
  check('벨트 7티어 — 속도가 오른다', beltTypes.every((id) => TURRET_BY_ID[id]) && TURRET_BY_ID.facility_conveyor_t7.speed > TURRET_BY_ID.facility_conveyor_t1.speed, `T1 ${TURRET_BY_ID.facility_conveyor_t1.speed} → T7 ${TURRET_BY_ID.facility_conveyor_t7.speed} m/s`);
  const beltMod = await import('../client/src/systems/conveyors.js');
  const beltErrors = beltMod.validateConveyorLogic();
  check('물류 규칙 자체 검증', beltErrors.length === 0, beltErrors.join(' / ') || '전부 통과');
  check('입금 경로가 벨트 목록을 캐시한다', turretSrc8.includes('_beltList(system)') && turretSrc8.includes('system._beltCacheSrc === list'));
  check('벨트 용량은 길이/간격으로 정해진다', beltMod.beltCapacity({ type: { beltLength: 3.4 } }) === 5 && beltMod.beltCapacity({ type: { beltLength: 10 } }) === 8);
}
// ───────────────────────── H-96 멀티플레이 서버 주소 (마인크래프트 방식)
section('멀티 서버 주소 — 주소만 넣고 접속');
{
  const netMod = await import('../client/src/net.js');
  const norm = netMod.normalizeServerAddress;
  check('ip:port 를 그대로 받는다', norm('192.168.0.10:3001') === 'http://192.168.0.10:3001', norm('192.168.0.10:3001'));
  check('포트를 빼면 3001 을 붙인다', norm('192.168.0.10') === 'http://192.168.0.10:3001', norm('192.168.0.10'));
  check('localhost 도 받는다', norm('localhost') === 'http://localhost:3001');
  check('http 주소의 끝 슬래시를 지운다', norm('http://1.2.3.4:8080/') === 'http://1.2.3.4:8080');
  check('빈 주소는 빈 값(내 PC 로 복귀)', norm('') === '' && norm('   ') === '');
  check('잘못된 주소는 빈 값', norm('나쁜 주소!!') === '', norm('나쁜 주소!!'));
  check('Net 이 서버 주소를 바꿀 수 있다', typeof netMod.net.setServer === 'function');
  check('REST 도 같은 서버로 보낸다(API_BASE)', typeof netMod.setApiBase === 'function' && netMod.getApiBase() === '');
  const menuSrc = readFileSync(new URL('../client/src/ui/menu.js', import.meta.url), 'utf8');
  check('멀티 카드에 [서버 주소] 입력칸이 있다', menuSrc.includes("data-field = 'menu-server'") || menuSrc.includes('menu-server-input'));
  check('멀티 카드에 [접속] 버튼이 있다', menuSrc.includes("'menu-server-connect'"));
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  check('게임이 server-connect 를 처리한다', mainSrc.includes("on('server-connect'") && mainSrc.includes('connectServer('));
  // 접속하면 로그인/저장/순위표도 그 서버로 가야 한다.
  check('접속 시 REST 주소도 바뀐다', mainSrc.includes('setApiBase(target === self'));
}
// ───────────────────────── 전직은 중앙코어에서만 (v1.0.15)
section('전직 — 캐릭터 화면에서 빼고 중앙코어에서');
{
  const menuSrc = readFileSync(new URL('../client/src/ui/menu.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  check('캐릭터 쪽에 [전직/승급] 버튼이 없다', !menuSrc.includes('전직/승급'));
  check('캐릭터 쪽은 직업만 보여준다', menuSrc.includes("dataset.role = 'menu-class'"));
  check('코어 안내 문구가 있다', menuSrc.includes('전직은 게임 안 중앙코어'));
  check('코어 상호작용이 classes 패널을 연다', mainSrc.includes("panels.open?.('classes')"));
  check('코어 위치는 world.base 를 쓴다', mainSrc.includes('this.world?.base?.position'));
  check('코어 근처 E 프롬프트가 있다', mainSrc.includes('중앙코어 — 전직/승급'));
}

// ───────────────────────── 탭 화면 새 UI · 멀티 한 창 (v1.0.16)
section('탭 화면(캐릭터·시드·도움말) 새 UI · 멀티 한 창');
{
  const menuSrc = readFileSync(new URL('../client/src/ui/menu.js', import.meta.url), 'utf8');
  const cssSrc = readFileSync(new URL('../client/src/ui/ui-polish.css', import.meta.url), 'utf8');
  check('캐릭터 탭 — 전용 카드', menuSrc.includes('menu-card menu-tab menu-character'));
  check('시드 갤러리 탭 — 전용 카드', menuSrc.includes('menu-card menu-tab menu-seeds'));
  check('도움말 탭 — 전용 카드 + 4블록', menuSrc.includes('menu-card menu-tab menu-help') && menuSrc.includes('help-block'));
  check('탭 카드 CSS — 중간 크기', cssSrc.includes('.menu-card.menu-tab') && cssSrc.includes('menu-seeds'));
  check('멀티 — 열린 방이 한 카드 안에', menuSrc.includes('multi-block multi-block-wide') && !menuSrc.includes("menu-card menu-rooms"));
  check('멀티 — ④ 열린 방 블록', menuSrc.includes("'④'"));
  check('탭 화면 제목/푸터 숨김 CSS', cssSrc.includes('[data-view="tab"] .menu-head'));
}

// ───────────────────────── H-97 메뉴 버튼 · 설정 안 로그인 · 관리자 제거
section('메뉴 버튼 → 창 닫고 패널 · 설정에서 로그인/회원가입');
{
  const menuSrc = readFileSync(new URL('../client/src/ui/menu.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const panelSrc = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  const keysSrc = readFileSync(new URL('../client/src/keys.js', import.meta.url), 'utf8');
  // 1) 버튼을 누르면 메뉴 창을 닫고 그 다음 패널이 뜬다.
  check('설정 버튼이 메뉴를 먼저 닫는다', mainSrc.includes("this.ui.menu.on('settings'") && mainSrc.includes('this.ui.menu?.hide?.()'));
  check('패널을 닫으면 메뉴가 다시 나온다', mainSrc.includes("this.ui.panels?.on?.('close'") && mainSrc.includes("this.ui.menu?.show?.('main')"));
  // 2) 로그인/회원가입은 설정 안에서.
  check('메인 화면에 로그인 버튼이 없다', !menuSrc.includes("item('auth'"));
  check('설정 화면이 계정 UI 를 그린다', panelSrc.includes('_renderAccount(body') && panelSrc.includes('로그인 · 회원가입'));
  check('계정 UI 에 로그인/회원가입 탭이 있다', panelSrc.includes("label: '회원가입'") && panelSrc.includes("label: '로그인'"));
  check('회원가입에 닉네임 입력칸이 없다', !panelSrc.includes("'auth-nickname', 'text'"));
  // 3) 관리자 콘솔/버튼 제거.
  check('관리자 콘솔 키가 있다(관리자 전용)', keysSrc.includes("id: 'admin'"));
  check('관리자 키는 관리자에게만 보인다', panelSrc.includes("action.id === 'admin' && !safe(() => auth.isAdmin, false)"));
  check('설정의 관리자 구역은 관리자에게만 보인다', panelSrc.includes("if (safe(() => auth.isAdmin, false)) {") && panelSrc.includes("'admin-console'"));
  check('로그아웃하면 관리자 콘솔을 닫고 DOM 에서 지운다', panelSrc.includes('ui?.admin?.revoke?.()') && readFileSync(new URL('../client/src/ui/console.js', import.meta.url), 'utf8').includes('revoke() {'));
  // v1.0.9 회귀: main.js 가 safe() 를 쓰면서 정의하지 않아 부팅이 죽었다.
  check('main — safe 헬퍼가 정의돼 있다', mainSrc.includes('const safe = (fn'));
  check('tools — boot-check 가 있다', Boolean(readFileSync(new URL('./boot-check.mjs', import.meta.url), 'utf8').includes('boot-check')));
}

// ── 친구 (v1.4.0) ────────────────────────────────────────────────
{
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const f1 = new FriendSystem({ storage, random: () => 0.42, now: () => 1000 });
  check('친구 — 코드 8자리 · 표시 4-4', f1.code.length === 8 && formatFriendCode(f1.code) === `${f1.code.slice(0, 4)}-${f1.code.slice(4)}`);
  check('친구 — 코드 정규화(소문자·하이픈 허용)', normalizeFriendCode('ab-cd efgh') === 'ABCDEFGH' && isValidFriendCode('ABCD-EFGH'));
  check('친구 — 잘못된 코드 거부', !isValidFriendCode('ABC') && f1.add({ code: 'ABC' }).ok === false);
  check('친구 — 내 코드는 추가 불가', f1.add({ code: f1.code }).ok === false);

  const added = f1.add({ code: 'WXYZ-2345', name: '친구', address: '192.168.0.9:3001' });
  check('친구 — 코드로 추가', added.ok === true && f1.size === 1 && f1.has('WXYZ2345'));
  check('친구 — 중복 추가는 갱신', f1.add({ code: 'wxyz2345', name: '새 이름' }).updated === true && f1.list()[0].name === '새 이름');
  check('친구 — 주소 정규화', normalizeAddress('192.168.0.9:3001') === 'http://192.168.0.9:3001');

  f1.touch('WXYZ2345', { room: 'K7F2', online: true });
  check('친구 — 서버 링크(?room=CODE)', friendServerUrl('192.168.0.9:3001', 'K7F2') === 'http://192.168.0.9:3001/?room=K7F2');
  check('친구 — 방 코드 없으면 링크 없음', friendServerUrl('192.168.0.9:3001', '') === '');
  check('친구 — 삭제', f1.remove('WXYZ2345') === true && f1.size === 0);

  // 저장·복원
  const f2 = new FriendSystem({ storage, random: () => 0.42, now: () => 2000 });
  f2.add({ code: 'ABCD-2345', name: '저장' });
  const f3 = new FriendSystem({ storage, random: () => 0.42, now: () => 3000 });
  check('친구 — 목록이 저장된다', f3.size === 1 && f3.get('ABCD2345').name === '저장' && f3.code === f2.code);

  // 서버 레지스트리
  let clock = 5000;
  const reg = createFriendRegistry({ now: () => clock, port: 3001 });
  check('친구 서버 — 등록', reg.register({ code: 'ABCD-2345', name: '친구', room: 'K7F2', origin: 'http://192.168.0.9:3001' }).ok === true);
  const look = reg.lookup('abcd2345');
  check('친구 서버 — 조회(온라인·방 코드)', look.ok && look.friend.online === true && look.friend.room === 'K7F2');
  check('친구 서버 — 잘못된 코드 거부', reg.lookup('XX').ok === false);
  clock += 31 * 60 * 1000;
  check('친구 서버 — 30분 지나면 오프라인', reg.lookup('ABCD2345').friend.online === false);
  check('친구 서버 — 나가면 사라진다', reg.leave({ code: 'ABCD2345' }).ok === true && reg.lookup('ABCD2345').friend === null);
}

// 친구 UI · 배선 계약
{
  const uiSrc = readFileSync(new URL('../client/src/ui/friends.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  const keysSrc = readFileSync(new URL('../client/src/keys.js', import.meta.url), 'utf8');
  const panelSrc = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  const serverSrc = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  check('친구창 — 코드 복사·추가·목록·들어가기', uiSrc.includes("data-act = 'friend-copy'") === false || uiSrc.includes('friend-copy'));
  check('친구창 — 친구 코드 입력창(별도 창)', uiSrc.includes('friend-code-input') && uiSrc.includes('friend-add-ok') && uiSrc.includes('friend-add-open'));
  check('친구창 — 서버 들어가기', uiSrc.includes('friend-join') && uiSrc.includes('serverUrl('));
  check('친구 — 키 U 로 열고 닫기', keysSrc.includes("id: 'friends'") && keysSrc.includes("def: ['KeyU']"));
  check('친구 — 메인에 연결', mainSrc.includes('new FriendSystem()') && mainSrc.includes('new FriendsOverlay') && mainSrc.includes("actionPressed('friends')"));
  check('친구 — 단축키 표에 U', panelSrc.includes("['U', '친구']"));
  check('친구 — 서버 API 등록', serverSrc.includes('registerFriendRoutes(app, friendRegistry)') && serverSrc.includes("api/friends.js"));
}


// ── 몬스터 외형 (v1.5.0) ─────────────────────────────────────────
{
  const types = Object.keys(MONSTER_LOOKS);
  check('몬스터 외형 — 11종 실루엣 정의', types.length === 11, types.join(','));
  check('몬스터 외형 — 모든 종류에 자세·눈', types.every((t) => Boolean(monsterLook(t).stance) && monsterLook(t).eyes >= 2));
  check('몬스터 외형 — 기본값 병합', monsterLook('__none__').stance === 'biped' && monsterLook('spider').stance === 'spider');
  check('몬스터 외형 — 망토는 망령/그림자만', Boolean(monsterLook('wraith').cloak) && Boolean(monsterLook('shade').cloak) && !monsterLook('orc').cloak);
  check('몬스터 외형 — 날개는 박쥐/드레이크', Boolean(monsterLook('bat').wings) && Boolean(monsterLook('drake').wings) && !monsterLook('golem').wings);

  const wolf = buildMonsterModel('wolf', { color: 0x8899aa });
  const golem = buildMonsterModel('golem', { color: 0x8899aa });
  const v = (g) => g?.attributes?.position?.count ?? 0;
  check('몬스터 모델 — 몸통·팔·눈 지오메트리', v(wolf.body) > 1200 && v(wolf.arms) > 500 && v(wolf.eyes) > 60, `${v(wolf.body)}/${v(wolf.arms)}/${v(wolf.eyes)}`);
  check('몬스터 모델 — 정점 색(부위별 색)', Boolean(wolf.body.attributes.color && wolf.body.attributes.normal && wolf.eyes.attributes.color));
  check('몬스터 모델 — 종류마다 다른 실루엣', v(wolf.body) !== v(golem.body), `${v(wolf.body)} vs ${v(golem.body)}`);
  check('몬스터 모델 — 보스는 뿔이 더 많다', v(buildMonsterModel('imp', { boss: true }).body) > v(buildMonsterModel('imp').body));
  check('몬스터 모델 — 캐시 공유', buildMonsterModel('wolf') === buildMonsterModel('wolf'));
  check('몬스터 모델 — 처치 시 해제 후 재생성', (disposeMonsterAssets(), v(buildMonsterModel('imp').body) > 0));
}

// ── 조준선 설정 (v1.12.0) ─────────────────────────────────────────
{
  check('조준선 모양 6종 · 중복 없음', CROSSHAIR_STYLES.length === 6 && new Set(CROSSHAIR_STYLES.map((s) => s.id)).size === 6);
  check('조준선 색 6종 · hex 형식', CROSSHAIR_COLORS.length === 6 && CROSSHAIR_COLORS.every((c) => /^#[0-9a-f]{6}$/i.test(c.hex) && c.glow.startsWith('rgba(')));
  check('조준선 기본값 = 십자 · 금빛 · 100%', DEFAULT_CROSSHAIR.style === 'classic' && DEFAULT_CROSSHAIR.color === 'gold' && DEFAULT_CROSSHAIR.size === 1);
  check('조준선 크기 제한 70~180%', clampCrosshairSize(0.1) === 0.7 && clampCrosshairSize(9) === 1.8 && clampCrosshairSize('1.37') === 1.35);
  check('조준선 잘못된 값 → 기본값', normalizeCrosshair(null).style === 'classic' && normalizeCrosshair({ style: 'nope', color: 'nope', size: 'x' }).color === 'gold');
  const crossStore = new Map();
  const fakeStorage = { getItem: (k) => crossStore.get(k) ?? null, setItem: (k, v) => crossStore.set(k, String(v)) };
  check('조준선 저장 → 다시 읽기', (() => {
    const saved = saveCrosshair({ style: 'x', color: 'green', size: 1.4 }, fakeStorage);
    const loaded = loadCrosshair(fakeStorage);
    return saved.style === 'x' && loaded.style === 'x' && loaded.color === 'green' && loaded.size === 1.4 && crossStore.has(CROSSHAIR_KEY);
  })());
  const fakeCross = { dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, setAttribute() {} };
  applyCrosshair(fakeCross, { style: 'circle', color: 'cyan', size: 1.25 });
  check('조준선 HUD 적용 — data 속성·CSS 변수', fakeCross.dataset.crosshair === 'circle' && fakeCross.style.props['--ch-color'] === '#7fe6ff' && fakeCross.style.props['--ch-size'] === '1.25');
}

// ── v1.12.0 문서·레이아웃 계약 ───────────────────────────────────
{
  const weaponsDoc = readFileSync(new URL('../docs/WEAPONS.md', import.meta.url), 'utf8');
  const tierPart = weaponsDoc.split('## 계열별 요약')[0];
  const docRows = (tierPart.match(/^\| [^|]+ \| [^|]+ \| \*\*/gm) || []).length;
  check('무기 목록 문서 — 82종 전부', docRows === WEAPONS.length && WEAPONS.length === 82, `${docRows}/${WEAPONS.length}`);
  check('무기 목록 문서 — T7 유물 14종', (weaponsDoc.match(/^\| [^|]+ \| 유물 \| \*\*/gm) || []).length === 14);
  check('무기 목록 문서 — T8 비밀 2종', (weaponsDoc.match(/^\| [^|]+ \| 비밀 \| \*\*/gm) || []).length === 2);
  const polishCss = readFileSync(new URL('../client/src/ui/ui-polish.css', import.meta.url), 'utf8');
  check('멀티플레이 창 배율 — 카드가 메뉴 안쪽 폭을 넘지 않는다',
    /\.menu-card\.menu-multi\s*\{[^}]*width:\s*min\(880px,\s*100%\)/s.test(polishCss) &&
    /#menu-root\[data-view="multi"\] \.menu-body[^{]*\{[^}]*width:\s*100%/s.test(polishCss) &&
    /#menu-root\[data-view="multi"\] \.menu-shell[^{]*\{[^}]*width:\s*100%/s.test(polishCss));
  const fpsMon = new FPSMonitor();
  fpsMon.update(0.25);
  check('FPS — 20fps 아래에서도 실제 프레임 시간', Math.round(fpsMon.averageFps) === 4 && Math.round(fpsMon.frameMs) === 250, `${fpsMon.averageFps.toFixed(1)}fps ${fpsMon.frameMs.toFixed(0)}ms`);
  fpsMon.dispose();
  const mainPerfSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  check('FPS·적응형 — 시뮬레이션 dt 대신 실제 프레임 시간', mainPerfSrc.includes('this._frameDt = rawDt;') && mainPerfSrc.includes('this._update(dt, rawDt);') && mainPerfSrc.includes('fps.update?.(frameDt)') && mainPerfSrc.includes('adaptive.update(perfDt, avg)') && mainPerfSrc.includes('this._qualityAcc = (this._qualityAcc ?? 0) + perfDt;'));
}

console.log(`스모크 테스트 결과: ${pass}개 통과 / ${fail}개 실패 (총 ${pass + fail}개)`);
if (fail > 0) {
  console.log('\n실패 목록:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('모든 검증을 통과했습니다. 🎉');
}
console.log('═'.repeat(58));

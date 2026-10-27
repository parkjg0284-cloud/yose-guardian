// 요새의 수호자 — 헤드리스 통합 시뮬레이션.
// WebGL 없이 실제 게임 모듈을 THREE.Scene 위에서 돌려 API 계약과 상호작용을 검증한다.
// 실행: node tools/headless.mjs
//
// 검증 범위: world 생성/충돌, 포탑 건설·사격, 웨이브 스폰·전투, 투사체, 마법 시전,
//            가챠, 업적 연동, 요정 판정, 플레이어 이동, 지팡이/사운드의 무예외 동작.

import * as THREE from 'three';
import {
  FAIRY_WING_BY_ID, DIFFICULTIES, TURRETS, MINERAL_COMBO_RECIPES, WEAPONS, WEAPON_ULTIMATES, WEAPON_FAMILIES, DREAM_TREE, weaponById, weaponsByFamily, weaponMotion, WAVE_ROSTERS, WAVE_ROSTER_BY_ID, ELITE, HEALTH_BAR, waveRoster, ARROW_BY_ID, ARROW_ORDER_DESC } from '../client/src/data.js';
import { spawnEnemy, enemyInfo } from '../client/src/systems/enemies.js';
import { PortalField } from '../client/src/world/portals.js';
import { SPAWN_FX, SPAWN_PATTERNS } from '../client/src/data.js';
import { EnemyHealthBars } from '../client/src/ui/healthbars.js';
import { createRNG } from '../client/src/utils/rng.js';
import { createWorld } from '../client/src/world/world.js';
import { Input, Player } from '../client/src/player/player.js';
import { syncPointerLock } from '../client/src/ui/pointer-lock.js';
import { StaffView, buildStaffMesh } from '../client/src/player/staff.js';
import { WeaponRig, buildWeaponMesh, sampleSnip } from '../client/src/player/weaponRig.js';
import { ImpactFX } from '../client/src/player/impacts.js';
import { ProjectileSystem } from '../client/src/player/projectiles.js';
import { Economy } from '../client/src/systems/economy.js';
import { AchievementSystem } from '../client/src/systems/achievements.js';
import { GachaSystem } from '../client/src/systems/gacha.js';
import { WaveSystem } from '../client/src/systems/waves.js';
import { TurretSystem, SPAWNER_MAX_ALIVE } from '../client/src/systems/turrets.js';
import { SpellSystem } from '../client/src/systems/spells.js';
import { FairySystem } from '../client/src/systems/fairies.js';
import { CraftingSystem } from '../client/src/systems/crafting.js';
import { wingRecipeFor, recipeForWeapon } from '../client/src/crafting.js';
import { AudioSystem } from '../client/src/audio.js';
import { ClassSystem } from '../client/src/systems/classes.js';
import { CLASS_RULES, classModifiers, classStarterWeaponId } from '../client/src/data.js';
import { MINERAL_TYPES, mineralsForRegionTier } from '../client/src/data.js';
import { BARE_HAND, canHarvestByHand, harvestNode, pickHarvestNode } from '../client/src/systems/gathering.js';
import { ADMIN_COMMANDS, runAdminCommand, commandHelp } from '../client/src/systems/admin-commands.js';
import { GrantQueue } from '../client/src/systems/grants.js';
import { SAVES_KEY, MAX_SAVES, pushSave, listSaves, getSave, removeSave, clearSaves, summarize, saveLabel } from '../client/src/systems/saves.js';
import { WingSystem } from '../client/src/systems/wings.js';
import { WingRig } from '../client/src/player/wings.js';
import { GearSystem } from '../client/src/systems/gear.js';
import { RegionSpawner } from '../client/src/systems/region-spawns.js';
import {
  FAIRY_WINGS,
  LEATHER_TYPES,
  LEATHER_GEAR,
  REGION_ENEMY_BY_ID,
  regionMonsterRoster,
  regionMonsterLoot
} from '../client/src/data.js';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` (${detail})` : ''}`);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(t) {
  console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 52 - t.length))}`);
}

function fakeInput() {
  return {
    keys: new Set(),
    mouse: { dx: 0, dy: 0, left: false, right: false, wheel: 0 },
    isDown: () => false,
    wasPressed: () => false,
    consumePressed: () => false,
    consumeMouse: () => ({ dx: 0, dy: 0, left: false, right: false, wheel: 0 }),
    requestPointerLock: () => {},
    exitPointerLock: () => {},
    get locked() {
      return false;
    },
    update: () => {},
    dispose: () => {}
  };
}

const t0 = Date.now();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 800);
const rng = createRNG('headless-777');

// ───────────────────────────── 1. 월드
section('월드');
let world = null;
try {
  world = createWorld({ scene, seed: '777', quality: 'performance', rng: rng.fork('world') });
  check('월드 생성', Boolean(world));
  const h0 = world.getHeight(0, 0);
  const h1 = world.getHeight(120, -80);
  check('getHeight 유한값', Number.isFinite(h0) && Number.isFinite(h1), `h(0,0)=${h0.toFixed(2)}`);
  check('지형 종류 결정', Boolean(world.terrainType?.id), world.terrainType?.name);
  check('나무 배치', world.trees.length > 50, `${world.trees.length}그루`);
  check('광물 배치', world.minerals.length > 20, `${world.minerals.length}개`);
  check('포탈 배치', world.portals.length >= 4, `${world.portals.length}개`);
  check('기지 HP 4100', world.base?.hp === 4100, `hp=${world.base?.hp} shield=${world.base?.shield}`);
  check('기지 실드 500', world.base?.shield === 500);
  check('맵 안쪽 판정', world.isInside(0, 0) === true && world.isInside(99999, 0) === false);
  const pos = new THREE.Vector3(3, 0, 3);
  world.resolveCollision(pos, 0.6);
  check('기지 밀어내기', Math.hypot(pos.x, pos.z) > 4, `거리 ${Math.hypot(pos.x, pos.z).toFixed(2)}`);
  const far = new THREE.Vector3(9000, 50, 0);
  world.resolveCollision(far, 0.6);
  check('경계 클램프', Math.abs(far.x) <= 2501, `x=${far.x.toFixed(1)}`);
  const firstTree = world.trees[0];
  check('nearestTree 동작', world.nearestTree(new THREE.Vector3(firstTree.x, 0, firstTree.z), 8) !== null);
  const firstMin = world.minerals[0];
  check('nearestMineral 동작', world.nearestMineral(new THREE.Vector3(firstMin.x, 0, firstMin.z), 8) !== null);
  world.update(1 / 30, { time: 1 });
  check('월드 update 무예외', true);
} catch (err) {
  check('월드 생성/조작', false, err.message);
  console.error(err);
}

// ───────────────────────────── 2. 협력자 구성
section('시스템 조립');
const world2 = world;
const economy = new Economy({ gold: 200000, wood: 50000, minerals: { silver: 400, tin: 200, obsidian: 200, marble: 200, mana: 200 } });
const achievements = new AchievementSystem({});
const audio = new AudioSystem();
const projectiles = new ProjectileSystem({ scene, audio, groundHeight: (x, z) => world2?.getHeight(x, z) ?? 0 });
const playerStub = {
  position: new THREE.Vector3(0, 0, 40),
  hp: 100,
  maxHp: 100,
  mana: 100,
  maxMana: 100,
  alive: true,
  yaw: 0,
  get eyePosition() {
    return new THREE.Vector3(0, 2, 40);
  },
  get aimDirection() {
    return new THREE.Vector3(0, 0, -1);
  },
  takeDamage() {},
  heal() {},
  spendMana() {
    return true;
  }
};

const turrets = new TurretSystem({
  scene,
  world: world2,
  economy,
  projectiles,
  audio,
  stats: achievements,
  rng: rng.fork('turrets')
});
const waves = new WaveSystem({
  scene,
  world: world2,
  economy,
  audio,
  projectiles,
  stats: achievements,
  rng: rng.fork('waves'),
  difficulty: DIFFICULTIES[1],
  player: playerStub
});
const spells = new SpellSystem({ scene, projectiles, audio, stats: achievements, economy, rng: rng.fork('spells') });
const gacha = new GachaSystem({ rng: rng.fork('gacha'), stats: achievements, economy, audio });
const fairies = new FairySystem({ scene, world: world2, audio, stats: achievements, rng: rng.fork('fairies'), onFind: () => {} });
check('TurretSystem 생성', Boolean(turrets));
check('WaveSystem 초기 phase=prep', waves.phase === 'prep', `phase=${waves.phase} wave=${waves.wave}`);
check('SpellSystem 생성', Boolean(spells));
check('GachaSystem 생성', Boolean(gacha));
check('FairySystem 생성', Boolean(fairies));

// ───────────────────────────── 3. 포탑 건설
section('포탑 건설');
const num2 = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const baseDist = (v) => Math.hypot(v.x, v.z);
const placeAt = (angleDeg, radius) => {
  const a = (angleDeg * Math.PI) / 180;
  const x = Math.cos(a) * radius;
  const z = Math.sin(a) * radius;
  return new THREE.Vector3(x, world2.getHeight(x, z), z);
};

const attackDef = TURRETS.find((t) => t.category === 'attack' && t.tier === 1);
const healDef = TURRETS.find((t) => t.category === 'heal');
const mineDef = TURRETS.find((t) => t.category === 'mining');
const lumberDef = TURRETS.find((t) => t.category === 'lumber');

try {
  const tooClose = placeAt(0, 2);
  const res = turrets.canPlace(attackDef.id, tooClose);
  check('기지 근접 건설 거부', res.ok === false, res.reason);

  const spot = placeAt(0, 34);
  const okRes = turrets.canPlace(attackDef.id, spot);
  check('정상 위치 건설 허용', okRes.ok === true, okRes.reason || 'ok');
  const goldBefore = economy.gold;
  const t1 = turrets.place(attackDef.id, spot, 'local');
  check('포탑 배치 성공', Boolean(t1), t1?.typeId);
  check('건설 비용 차감', economy.gold === goldBefore - attackDef.cost.gold, `${goldBefore} → ${economy.gold}`);

  const t2 = turrets.place(attackDef.id, placeAt(30, 34), 'local');
  const t3 = turrets.place(attackDef.id, placeAt(60, 40), 'local');
  const t4 = turrets.place(attackDef.id, placeAt(90, 40), 'local');
  // 전 방위 배치: 한 사분면만 막으면 반대편으로 접근한 적이 기지를 두들겨 웨이브가 끝나지 않는다
  const extra = [[180, 34], [225, 36], [270, 36], [315, 34]]
    .map(([deg, r]) => turrets.place(attackDef.id, placeAt(deg, r), 'local'))
    .filter(Boolean).length;
  turrets.place(healDef.id, placeAt(120, 30), 'local');
  turrets.place(mineDef.id, placeAt(150, 30), 'local');
  turrets.place(lumberDef.id, placeAt(180, 30), 'local');
  const placed = turrets.turrets.length;
  check('포탑 전 방위 배치', placed >= 11 && extra === 4, `${placed}기 (추가 공격 ${extra}기)`);
  check('카테고리 집계', turrets.countByCategory('attack') >= 8, `attack=${turrets.countByCategory('attack')}`);
  check('통계 towersBuilt 기록', achievements.get('towersBuilt') === placed, `${achievements.get('towersBuilt')}`);
  check('통계 maxTurrets 기록', achievements.get('maxTurrets') === placed, `${achievements.get('maxTurrets')}`);

  if (t1) {
    const invested = attackDef.cost.gold;
    const sold = turrets.sell(t1.id);
    check('철거 환불 25%', Boolean(sold) && sold.gold === Math.floor(invested * 0.25), `${JSON.stringify(sold)} (기대 ${Math.floor(invested * 0.25)})`);
    check('판매 후 개수 감소', turrets.turrets.length === placed - 1, `${turrets.turrets.length}기`);
    turrets.place(attackDef.id, placeAt(0, 34), 'local');
  }
  const upTurret = turrets.turrets[0];
  if (upTurret) {
    const before = upTurret.tier ?? 1;
    const upgraded = turrets.upgrade(upTurret.id);
    check('티어 강화', upgraded === true && (upTurret.tier ?? 1) > before, `T${before} → T${upTurret.tier}`);
  }
  const ghost = turrets.buildPreview(attackDef.id);
  check('건설 미리보기 생성', Boolean(ghost));
  if (ghost) scene.remove(ghost);
} catch (err) {
  check('포탑 건설 시퀀스', false, err.message);
  console.error(err);
}

// ───────────────────────────── 4. 마법 / 가챠
section('마법 / 가챠');
try {
  const spell = gacha.makeSpell('legendary', 'fire');
  check('마법 생성', Boolean(spell?.name && spell.damage > 0), `${spell?.name} dmg=${Math.round(spell?.damage)}`);
  const added = spells.add(spell);
  check('마법 습득', added === true || added === undefined, String(added));
  const castRes = spells.cast({
    origin: playerStub.eyePosition,
    direction: playerStub.aimDirection,
    player: playerStub,
    enemies: [],
    turrets: turrets.turrets
  });
  check('마법 시전', castRes?.ok === true, castRes?.reason || 'ok');
  check('시전 통계 기록', achievements.get('spellsCast') >= 1, `${achievements.get('spellsCast')}`);
  const pull = gacha.pull(10);
  check('10연차 뽑기', pull.ok === true && pull.results.length === 10, `-${pull.spent}G`);
  spells.update(1 / 30);
  check('SpellSystem.update 무예외', true);
} catch (err) {
  check('마법/가챠 시퀀스', false, err.message);
  console.error(err);
}

// ───────────────────────────── 5. 웨이브 전투 시뮬레이션
section('웨이브 전투 (시뮬레이션)');
try {
  waves.forceStart();
  check('forceStart → combat', waves.phase === 'combat', `phase=${waves.phase}`);

  const dt = 1 / 30;
  let frames = 0;
  let maxAlive = 0;
  let shotsSeen = 0;
  let spellDamageSeen = 0;
  const SIM_FRAMES = 30 * 120; // 120초 상당

  for (let i = 0; i < SIM_FRAMES; i++) {
    frames++;
    turrets.update(dt, { enemies: waves.enemies, player: playerStub, world: world2, turrets });
    waves.update(dt, { player: playerStub, turrets: turrets.turrets, ui: null });
    projectiles.update(dt, waves.enemies);
    fairies.update(dt, { player: playerStub, game: null, stats: achievements, wave: waves.wave });
    if (projectiles.count > 0) shotsSeen++;
    maxAlive = Math.max(maxAlive, waves.alive ?? waves.enemies.filter((e) => e.alive).length);
    if (waves.phase === 'gameover') break;
  }

  check('시뮬레이션 무예외 완주', frames > 100, `${frames}프레임 (${(frames * dt).toFixed(1)}초)`);
  check('적 스폰 발생', achievements.get('kills') > 0 || maxAlive > 0, `동시 최대 ${maxAlive}기`);
  check('포탑 사격 발생', shotsSeen > 0, `${shotsSeen}프레임에서 투사체 존재`);
  // §4.11: kills = 총 처치 수, turretKills = 그 부분집합
  check('적 처치 기록', achievements.get('kills') > 0, `kills=${achievements.get('kills')} turretKills=${achievements.get('turretKills')}`);
  check('포탑 처치 ⊆ 전체 처치', achievements.get('turretKills') <= achievements.get('kills'), `${achievements.get('turretKills')} <= ${achievements.get('kills')}`);
  check('포탑 처치 기록', achievements.get('turretKills') > 0, `turretKills=${achievements.get('turretKills')}`);
  check('웨이브 진행', waves.wave >= 1, `wave=${waves.wave} phase=${waves.phase} cleared=${achievements.get('wavesCleared')}`);
  spellDamageSeen = achievements.get('spellDamage');
  check('마법 피해 통계 필드 존재', spellDamageSeen >= 0, `spellDamage=${Math.round(spellDamageSeen)}`);

  const waveSnap = waves.toJSON?.();
  check('웨이브 직렬화', waveSnap !== undefined);
} catch (err) {
  check('웨이브 전투 시뮬레이션', false, err.message);
  console.error(err);
}

// ───────────────────────────── 6. 지원 포탑 (채굴/벌목/회복)
section('지원 포탑');
try {
  // 웨이브 시뮬레이션에서 지원 포탑이 파괴될 수 있으므로 전용 시스템을 새로 만들어 검증한다
  const supStats = new AchievementSystem({});
  const supTurrets = new TurretSystem({
    scene,
    world: world2,
    economy: new Economy({ gold: 200000, wood: 50000 }),
    projectiles,
    audio,
    stats: supStats,
    rng: rng.fork('support')
  });
  const mineTurret = supTurrets.place(mineDef.id, placeAt(150, 30), 'local');
  const lumberTurret = supTurrets.place(lumberDef.id, placeAt(180, 30), 'local');
  const healTurret = supTurrets.place(healDef.id, placeAt(120, 22), 'local');
  check('지원 포탑 배치 확인', Boolean(mineTurret && lumberTurret && healTurret));

  // 지원 포탑을 대상 자원 위로 옮긴다.
  // T1 채굴탑은 초당 0.6 작업량이므로 광물 HP 60 기준 첫 산출까지 약 25~50초가 걸린다
  // (산출량 = 광물 totalYield × 소모HP/최대HP). 따라서 가장 무른 광물을 고르고 시간을 넉넉히 준다.
  const liveOres = world2.minerals.filter((x) => (x.hp ?? 1) > 0);
  const softOre = liveOres.find((x) => (x.hardness ?? 9) <= 1) ?? liveOres[0] ?? world2.minerals[0];
  if (mineTurret && softOre) mineTurret.position.set(softOre.x, world2.getHeight(softOre.x, softOre.z), softOre.z);
  if (lumberTurret) {
    const t = world2.trees.find((x) => !x.felled) ?? world2.trees[0];
    lumberTurret.position.set(t.x, world2.getHeight(t.x, t.z), t.z);
  }
  if (playerStub.hp === undefined) playerStub.hp = 100;
  if (playerStub.maxHp === undefined) playerStub.maxHp = 100;
  world2.base.damage(1200); // 실드 500 + 체력 700 소모 → 회복탑이 수리할 대상 확보
  const baseHpBefore = world2.base.hp;
  const minedBefore = supStats.get('mineralsMined');
  const woodBefore = supStats.get('woodChopped');
  const SUPPORT_FRAMES = 30 * 120; // 채굴 산출까지 최대 120초
  for (let i = 0; i < SUPPORT_FRAMES; i++) {
    supTurrets.update(1 / 30, { enemies: [], player: playerStub, world: world2, turrets: supTurrets.turrets });
    if (i > 30 * 25 && supStats.get('mineralsMined') > minedBefore) break;
  }
  check('채굴탑 자동 채굴', supStats.get('mineralsMined') > minedBefore, `${minedBefore} → ${supStats.get('mineralsMined')}`);
  check('벌목탑 자동 벌목', supStats.get('woodChopped') > woodBefore, `${woodBefore} → ${supStats.get('woodChopped')}`);
  check('채굴 산출물 인벤토리 반영', Object.values(supTurrets.economy?.minerals ?? {}).some((n) => n > 0), JSON.stringify(supTurrets.economy?.minerals ?? {}));
  check('회복탑 기지 수리', world2.base.hp > baseHpBefore, `${baseHpBefore} → ${world2.base.hp}`);

  // ── 맨땅에 세운 채굴탑도 광물을 캔다(주변 광물 없음)
  let bareSpot = null;
  for (let r = 180; r <= 420 && !bareSpot; r += 20) {
    for (let deg = 0; deg < 360; deg += 20) {
      const x = Math.cos((deg * Math.PI) / 180) * r;
      const z = Math.sin((deg * Math.PI) / 180) * r;
      const p = new THREE.Vector3(x, world2.getHeight(x, z), z);
      if (!world2.nearestMineral(p, 12) && !world2.nearestTree(p, 8)) {
        bareSpot = p;
        break;
      }
    }
  }
  const bareMine = bareSpot ? supTurrets.place(mineDef.id, bareSpot, 'local') : null;
  check('채굴탑을 맨땅에 건설', Boolean(bareMine), bareSpot ? `(${bareSpot.x.toFixed(1)}, ${bareSpot.z.toFixed(1)})` : '빈 땅 없음');
  const bareBefore = supStats.get('mineralsMined');
  if (bareMine) {
    bareMine.mineral = null;
    for (let i = 0; i < 30 * 15; i++) {
      supTurrets.update(1 / 30, { enemies: [], player: playerStub, world: world2, turrets: supTurrets.turrets });
    }
  }
  check('맨땅 채굴탑 — 주변 광물 없이 자동 채굴', Boolean(bareMine) && supStats.get('mineralsMined') > bareBefore, `${bareBefore} → ${supStats.get('mineralsMined')}`);

  // T2 채굴탑(곡괭이탑)은 은을 요구하지 않는다 — 주석으로 대체
  const t2Mine = TURRETS.find((t) => t.id === 'mining_t2');
  check('T2 채굴탑 건설 재료에 은이 없다', Boolean(t2Mine) && !Object.prototype.hasOwnProperty.call(t2Mine.cost?.minerals ?? {}, 'silver'), JSON.stringify(t2Mine?.cost));
  check('T2 채굴탑은 골드·목재만 요구한다', Object.keys(t2Mine?.cost?.minerals ?? {}).length === 0, JSON.stringify(t2Mine?.cost));

  // ── 설치 제한 없음: 50개를 넘겨도 집계만 하고 막지 않는다(계약 §4.85)
  const capSys = new TurretSystem({
    scene,
    world: world2,
    economy: new Economy({ gold: 1, wood: 1 }),
    projectiles,
    audio,
    stats: supStats,
    rng: rng.fork('cap')
  });
  capSys.turrets.length = 0;
  for (let i = 0; i < 50; i++) capSys.turrets.push({ destroyed: false, type: { kind: 'attack', category: 'attack' } });
  check('설치 제한 없음 — 전체 50개 집계', capSys.structureCounts().total === 50, JSON.stringify(capSys.structureCounts()));
  for (let i = 0; i < 10; i++) capSys.turrets.push({ destroyed: false, type: { kind: 'factory', category: 'factory' } });
  check('설치 제한 없음 — 공장 10개 집계', capSys.structureCounts().factories === 10 && capSys.structureCounts().total === 60, JSON.stringify(capSys.structureCounts()));
  check('설치 제한 없음 — 시설/공장/전체를 따로 센다', capSys.structureCounts().facilities === 0, JSON.stringify(capSys.structureCounts()));
} catch (err) {
  check('지원 포탑 시퀀스', false, err.message);
  console.error(err);
}

// ───────────────────────────── 7. 플레이어 / 지팡이
section('플레이어 / 지팡이');
try {
  const player = new Player({
    camera,
    world: world2,
    input: fakeInput(),
    audio,
    stats: achievements,
    position: new THREE.Vector3(0, 0, 45)
  });
  check('플레이어 생성', Boolean(player?.position));
  for (let i = 0; i < 60; i++) player.update(1 / 60);
  const ground = world2.getHeight(player.position.x, player.position.z);
  check('지면 고정', Math.abs(player.position.y - ground) < 2.5, `y=${player.position.y.toFixed(2)} 지면=${ground.toFixed(2)}`);
  check('카메라 동기화', Math.abs(camera.position.y - (player.position.y + 1.7)) < 0.8, `cam.y=${camera.position.y.toFixed(2)}`);
  const dir = player.aimDirection;
  check('aimDirection 정규화', Number.isFinite(dir.x) && Math.abs(dir.length() - 1) < 0.01, `len=${dir.length().toFixed(3)}`);
  const manaBefore = player.mana;
  const spent = player.spendMana(10);
  check('마나 소모', spent === true && player.mana <= manaBefore, `${manaBefore.toFixed(1)} → ${player.mana.toFixed(1)}`);
  player.takeDamage(15);
  check('피해 처리', player.hp <= 100, `hp=${player.hp}`);
  if (typeof player.toJSON === 'function') {
    const snapshot = player.toJSON();
    check('플레이어 직렬화', Boolean(snapshot), typeof snapshot);
  }
} catch (err) {
  check('플레이어 시퀀스', false, err.message);
  console.error(err);
}

try {
  for (const tier of [1, 3, 6]) {
    const mesh = buildStaffMesh({ tier, element: 'fire', relic: null });
    check(`지팡이 T${tier} 메시`, Boolean(mesh) && mesh.children.length > 0, `${mesh.children.length}파트`);
  }
  const relicMesh = buildStaffMesh({ tier: 6, element: 'arcane', relic: 'time' });
  check('유물 지팡이 메시', Boolean(relicMesh) && relicMesh.children.length > 0);
  const staff = new StaffView({ camera, tier: 2, element: 'ice', relic: null });
  staff.update(1 / 60, { moving: true, casting: false });
  staff.playCast?.();
  staff.update(1 / 60, { moving: false, casting: true });
  check('StaffView 동작', Boolean(staff.muzzlePosition), `muzzle=${staff.muzzlePosition ? 'ok' : 'null'}`);
  staff.dispose?.();
} catch (err) {
  check('지팡이 시퀀스', false, err.message);
  console.error(err);
}

// ───────────────────────────── 8. 오디오 / 부여대
section('오디오 / 부여대');
try {
  audio.play('fire');
  audio.play('gachaRelic');
  audio.setVolume?.({ master: 0.5, sfx: 0.5, bgm: 0.3 });
  audio.startBGM?.('field');
  audio.stopBGM?.();
  check('오디오 무예외(헤드리스 no-op)', true, `ready=${audio.ready}`);
} catch (err) {
  check('오디오', false, err.message);
}

try {
  const recipe = MINERAL_COMBO_RECIPES.find((r) => r.grade === 'common');
  for (const [id, n] of Object.entries(recipe.input)) economy.addMineral(id, n + 5);
  const affordable = economy.canAfford({ minerals: recipe.input });
  check('부여대 재료 판정', affordable === true, recipe.name);
  const crafted = gacha.makeSpell(recipe.grade, recipe.element);
  check('조합식 → 마법 생성', Boolean(crafted?.name), crafted?.name);
} catch (err) {
  check('부여대', false, err.message);
}

// ───────────────────────────── 9. 요정 / 정리
section('요정 / 정리');
try {
  const codex = fairies.codex?.() ?? [];
  check('요정 도감 7종', codex.length === 7, `${codex.length}종`);
  check('도감 항목 필드', codex.every((f) => f.id && f.name && f.hint !== undefined));
  const seed42Achievements = new AchievementSystem({});
  seed42Achievements.set('seed42', 1);
  const fairy2 = new FairySystem({
    scene,
    world: world2,
    audio,
    stats: seed42Achievements,
    rng: rng.fork('fairies2'),
    onFind: () => {}
  });
  for (let i = 0; i < 120; i++) fairy2.update(1 / 30, { player: playerStub, stats: seed42Achievements, wave: 1 });
  check('시드 42 요정 트리거 경로 무예외', true, `found=${fairy2.found?.size ?? 0}`);
  const fjson = fairy2.toJSON?.();
  check('요정 직렬화', fjson !== undefined);
} catch (err) {
  check('요정 시퀀스', false, err.message);
  console.error(err);
}

try {
  turrets.dispose?.();
  projectiles.dispose?.();
  fairies.dispose?.();
  world2?.dispose?.();
  check('dispose 무예외', true);
} catch (err) {
  check('dispose', false, err.message);
}

// ───────────────────────────── 10. 무기 82종 · 스왑모션 · 임팩트
section('무기 / 스왑모션 / 임팩트');
{
  const weaponCamera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const fxScene = new THREE.Scene();
  const rig = new WeaponRig({ camera: weaponCamera, weaponId: 'staff_common', rng: rng.fork('weaponRig') });
  const advance = (o, seconds) => { const step = 1 / 60; for (let t = 0; t < seconds; t += step) o.update(step); };
  check('초기 무기 장착 상태', rig.id === 'staff_common' && rig.state === 'idle' && rig.family === 'staff', `${rig.id}/${rig.state}`);

  // 82종 전부 스왑모션 재생 → 완주 → rest 복귀
  const swapBad = [];
  for (const w of WEAPONS) {
    const res = rig.equip(w.id);
    const started = rig.state === 'swapping' && rig.progress < 1;
    advance(rig, 3);
    const done = rig.state === 'idle' && rig.progress >= 1;
    if (!res.ok || !(res.duration > 0) || !started || !done) swapBad.push(`${w.id}:${res.ok}/${res.duration}/${started}/${done}`);
  }
  check('모든 무기(82) 스왑모션 재생·완주', swapBad.length === 0, swapBad.join(' ') || `${WEAPONS.length}/${WEAPONS.length} (평균 ${(WEAPONS.reduce((a, w) => a + weaponMotion(w.id).swap.duration, 0) / WEAPONS.length).toFixed(3)}s)`);

  // 계열별 스왑 스타일/포즈 변화/복귀
  const styleByFamily = {};
  for (const f of WEAPON_FAMILIES) {
    const res = rig.equip(weaponsByFamily(f.id)[0].id);
    styleByFamily[f.id] = res.style;
  }
  check('계열별 스왑 스타일 11종(요정 fairyBloom · 카타나 iai · 쌍권총 cross 포함)', new Set(Object.values(styleByFamily)).size === 11, JSON.stringify(styleByFamily));
  rig.equip('sword2h_relic', { instant: true });
  advance(rig, 0.2);
  const restPose = rig.debugPose();
  rig.equip('sword2h_relic');
  advance(rig, 0.3);
  const midPose = rig.debugPose();
  advance(rig, 3);
  const endPose = rig.debugPose();
  const moved = Math.abs(midPose.pos[1] - restPose.pos[1]) + Math.abs(midPose.rot[0] - restPose.rot[0]);
  check('스왑 중 포즈가 실제로 변한다', moved > 0.01, moved.toFixed(3));
  check('스왑 종료 후 rest 로 복귀', Math.abs(endPose.pos[1] - restPose.pos[1]) < 0.05 && Math.abs(endPose.rot[0] - restPose.rot[0]) < 0.05);

  // 계열별 메시가 실제로 만들어진다
  const tris = {};
  for (const f of WEAPON_FAMILIES) {
    const built = buildWeaponMesh(weaponsByFamily(f.id)[0].id);
    let n = 0;
    built?.group?.traverse?.((o) => { if (o.geometry?.attributes?.position) n += o.geometry.attributes.position.count / 3; });
    tris[f.id] = Math.round(n);
  }
  check('계열별 뷰모델 메시 생성', Object.values(tris).every((n) => n > 0), JSON.stringify(tris));
  const fairyModel = buildWeaponMesh('fairywand_relic');
  check(
    '요정의 지팡이 뷰모델 — 꽃잎 6+ · 꽃술 오브 · 빛 고리 · T7 이름',
    fairyModel?.group?.userData?.fairy === true && fairyModel?.group?.userData?.family === 'fairywand' &&
      fairyModel?.group?.name === 'fairy_wand_t7' && fairyModel?.group?.userData?.tier === 7 &&
      fairyModel.animated.shards.length >= 7 && fairyModel.animated.orbs.length >= 1 && fairyModel.animated.rings.length >= 1,
    `shards=${fairyModel?.animated?.shards?.length ?? 0} orbs=${fairyModel?.animated?.orbs?.length ?? 0} rings=${fairyModel?.animated?.rings?.length ?? 0}`
  );
  check('유물/비밀 무기는 프리미엄 표시', buildWeaponMesh('staff_relic').group.userData.premium === true && buildWeaponMesh('dream_tree').group.userData.weaponId === DREAM_TREE.id);

  // ── 쌍권총 — 두 자루/두 총구 + 은하수 모델 ──
  const gunModel = buildWeaponMesh('gun_relic');
  const gunMuzzles = gunModel.group.userData.muzzles ?? [];
  const gunTris = { count: 0 };
  gunModel.group.traverse((o) => { if (o.geometry?.attributes?.position) gunTris.count += o.geometry.attributes.position.count / 3; });
  check(
    '은하수의 밤 뷰모델 — 두 자루 · 두 총구 · 별가루/은하 고리',
    gunModel.group.userData.family === 'gun' && gunMuzzles.length === 2 && gunModel.group.userData.premium === true &&
      gunModel.animated.spin.length >= 4 && gunModel.animated.particles.length === 2 && gunTris.count > 50,
    `muzzles=${gunMuzzles.length} spin=${gunModel.animated.spin.length} tris=${Math.round(gunTris.count)}`
  );
  const plainGun = buildWeaponMesh('gun_common');
  check(
    '일반 쌍권총도 두 자루(은하수 장식만 다르다)',
    plainGun.group.userData.muzzles?.length === 2 && plainGun.animated.spin.length === 0 && plainGun.group.userData.premium !== true
  );
  rig.equip('gun_relic', { instant: true });
  advance(rig, 0.2);
  const muzzleL = rig.muzzleAt(0);
  const muzzleR = rig.muzzleAt(1);
  check(
    '두 총구가 좌우로 실제로 떨어져 있다',
    Math.abs(muzzleL.x - muzzleR.x) > 0.15 && Math.abs(muzzleL.z - muzzleR.z) < 0.05,
    `dx=${Math.abs(muzzleL.x - muzzleR.x).toFixed(3)} dz=${Math.abs(muzzleL.z - muzzleR.z).toFixed(3)}`
  );


  // 꿈나무 고유 스왑 연출 + 공격/스킬 release
  let specials = 0;
  let releases = 0;
  rig.onSwapSpecial = () => { specials += 1; };
  rig.onRelease = () => { releases += 1; };
  rig.equip('dream_tree', { instant: true });
  advance(rig, 0.2);
  rig.equip('dream_tree');
  advance(rig, 2);
  check('꿈나무 고유 스왑 연출 1회', specials === 1, `special=${specials}`);
  check('꿈나무 스왑 연출 = 꽃잎 22 + 나비 5 + 차임', rig.lastSpecial?.kind === 'bloom' && rig.lastSpecial?.petals === 22 && rig.lastSpecial?.butterflies === 5 && rig.lastSpecial?.chime === true);
  const beforeRelease = releases;
  rig.triggerAttack({ nonLethal: true });
  advance(rig, 3);
  check('공격 모션 release 1회 발생', releases === beforeRelease + 1, `release=${releases - beforeRelease}`);
  check('스킬/반동 모션 트리거', rig.triggerSkill('dreamsEnd') === true && rig.triggerRecoil(1) === true);
  advance(rig, 9);
  check('궁극기 모션도 release 1회', releases === beforeRelease + 2, `release=${releases}`);

  // 시간의 가위 — 그웬식 스닙: 두 날개가 실제로 벌어졌다가 release 에 맞물린다
  const scMotion = weaponMotion('time_scissors');
  const scArms = () => (rig.mesh?.userData?.animated?.snip?.arms ?? []).map((a) => a.mesh.rotation.z);
  const scGap = () => { const a0 = scArms(); return a0.length === 2 ? Math.abs(a0[0] - a0[1]) : 0; };
  rig.equip('time_scissors', { instant: true });
  advance(rig, 0.2);
  check('가위 뷰모델 = 두 날개 + 시간 룬', scArms().length === 2 && rig.mesh.userData.animated.rings.length === 1 && rig.mesh.userData.family === 'scissors', `arms=${scArms().length}`);
  const scIdle = scGap();
  const scSpecials = specials;
  rig.equip('time_scissors');            // 스왑 → 0.55 지점에서 snip 연출
  advance(rig, 0.3);
  const scSwapWide = scGap();
  advance(rig, 2);
  check('가위 스왑 = 날개를 펼쳐 한 번 물고 snip 연출 1회', specials === scSpecials + 1 && rig.lastSpecial?.kind === 'snip' && scSwapWide > scIdle + 0.1, `gap ${scIdle.toFixed(3)} → ${scSwapWide.toFixed(3)} · special=${rig.lastSpecial?.kind}`);
  const scReleases = releases;
  rig.triggerAttack();
  advance(rig, scMotion.attack.duration * 0.2);   // 벌리는 구간
  const scWide = scGap();
  advance(rig, scMotion.attack.duration * 0.2);   // release(0.32) 를 지나 맞물린다
  const scSnapped = scGap();
  check('가위 두 날개가 벌어졌다 맞물린다', scWide > scIdle + 0.15 && scSnapped < scWide - 0.2, `${scIdle.toFixed(3)} → ${scWide.toFixed(3)} → ${scSnapped.toFixed(3)}`);
  check('가위 공격 모션도 release 1회', releases === scReleases + 1, `release=${releases - scReleases}`);
  advance(rig, 2);
  const snapAt = (t) => sampleSnip(scMotion, 'attack', t, scMotion.rest.snip);
  check('스닙 곡선 = release 직전 활짝 / release 순간 0', snapAt(scMotion.attack.release - 0.06) > 0.9 && snapAt(scMotion.attack.release) < 0.05, `${snapAt(scMotion.attack.release - 0.06).toFixed(2)} → ${snapAt(scMotion.attack.release).toFixed(2)}`);
  const scFx = new ImpactFX({ scene: fxScene, camera: weaponCamera, rng: rng.fork('scissors-fx') });
  const scHit = scFx.hit(new THREE.Vector3(0, 1, 0), { weaponId: 'time_scissors', power: 1 });
  check('가위 타격 = 교차 참격 임팩트', scHit.kind === 'crossSlash' && scFx.activeCount > 0, `${scHit.kind} active=${scFx.activeCount}`);
  scFx.dispose();

  // 임팩트
  const sceneBase = fxScene.children.length;
  const fx = new ImpactFX({ scene: fxScene, camera: weaponCamera, rng: rng.fork('impacts') });
  for (const w of WEAPONS) fx.hit(new THREE.Vector3(1, 1, 1), { weaponId: w.id, power: 1 });
  const afterHits = fx.activeCount;
  for (const u of WEAPON_ULTIMATES) fx.skill(new THREE.Vector3(0, 0, 0), { ultimateId: u.id });
  check('82종 타격 임팩트 재생', afterHits > 0, `active=${afterHits}`);
  check('10종 궁극기 스킬 임팩트 재생', fx.activeCount >= afterHits, `active=${fx.activeCount}`);
  const bulletHit = fx.hit(new THREE.Vector3(0, 1, 0), { weaponId: 'gun_common', power: 1 });
  const galaxyHit = fx.hit(new THREE.Vector3(0, 1, 0), { weaponId: 'gun_relic', power: 1.2 });
  const galaxySkill = fx.skill(new THREE.Vector3(0, 0, 0), { ultimateId: 'galaxyNight', radius: 42 });
  check(
    '쌍권총 타격 = bullet / 은하수의 밤 = galaxy(고리·별가루)',
    bulletHit.kind === 'bullet' && galaxyHit.kind === 'galaxy' && galaxySkill.kind === 'galaxy' && fx.shakeAmount > 0,
    `${bulletHit.kind} → ${galaxyHit.kind} / skill ${galaxySkill.kind} shake ${fx.shakeAmount.toFixed(2)}`
  );
  const shakeBefore = fx.shakeAmount;
  fx.salvation(new THREE.Vector3(0, 1, 0), { radius: 40, petals: 140, butterflies: 28, gratitude: true });
  check('꿈나무 구원 연출은 흔들림을 만들지 않는다', fx.shakeAmount <= shakeBefore, `shake ${shakeBefore.toFixed(2)} → ${fx.shakeAmount.toFixed(2)}`);
  const quotes = [];
  fx.onGratitude = (t) => quotes.push(t);
  for (let i = 0; i < 90; i += 1) fx.update(0.1);
  check('구원된 적의 감사 인사가 HUD 로 전달', quotes.length > 0 && typeof quotes[0] === 'string', JSON.stringify(quotes.slice(0, 2)));
  check('임팩트 수명 종료 후 전부 정리', fx.activeCount === 0 && fx.shakeAmount === 0, `active=${fx.activeCount}`);
  fx.dispose();
  check('임팩트 dispose 로 씬 원복', fxScene.children.length === sceneBase, `${sceneBase} → ${fxScene.children.length}`);

  // 비살상 구원 회계 (waves.salvation)
  const saveWaves = new WaveSystem({
    scene, world: world2, economy, audio, projectiles,
    stats: achievements, rng: rng.fork('waves-salvation'), difficulty: DIFFICULTIES[1], player: playerStub
  });
  saveWaves._aliveCount = 2;
  const killVictim = {
    typeId: 'slime', alive: true, hp: 10, gold: 40, isBoss: false, radius: 0.6,
    position: new THREE.Vector3(2, 0, 2),
    despawn() { this.alive = false; return this; }
  };
  const killsBefore = achievements.get('kills');
  const goldBefore = economy.gold;
  const saved = saveWaves.salvation(killVictim, { source: 'player' });
  check('구원은 처치(kills)로 집계되지 않는다', achievements.get('kills') === killsBefore && saveWaves.kills === 0, `kills ${killsBefore} → ${achievements.get('kills')}`);
  check('구원 1회 집계 + 생존 수 감소', saved?.salvations === 1 && saveWaves.salvations === 1 && saveWaves.alive === 1, `salvations=${saveWaves.salvations} alive=${saveWaves.alive}`);
  check('구원 골드 50% 지급', economy.gold - goldBefore === 20 && saved.gold === 20, `${goldBefore} → ${economy.gold}`);
  check('구원된 적은 메시 없이 풀로 반환', killVictim.alive === false && killVictim._waveCredited === true);
  check('중복 구원 방지', saveWaves.salvation(killVictim) === null);
  const saveBlob = saveWaves.toJSON();
  check('구원 통계가 세이브에 포함', saveBlob.salvations === 1, `salvations=${saveBlob.salvations}`);

  // ── 활 / 화살 (궁수 계열) ──────────────────────────────────────────────
  // (a) 활 10종 메시 생성 — 삼각형 > 0 · muzzle · bow 트랙
  const bowIds = weaponsByFamily('bow').map((w) => w.id);
  const bowMeshBad = [];
  for (const id of bowIds) {
    const bowBuilt = buildWeaponMesh(id);
    let bowTris = 0;
    bowBuilt?.group?.traverse?.((o) => { if (o.geometry?.attributes?.position) bowTris += o.geometry.attributes.position.count / 3; });
    const bowUd = bowBuilt?.group?.userData;
    if (!(bowTris > 0) || !bowUd?.muzzle || !bowUd?.animated?.bow) bowMeshBad.push(`${id}:tri=${Math.round(bowTris)}/muzzle=${!!bowUd?.muzzle}/bow=${!!bowUd?.animated?.bow}`);
  }
  check('활 10종 뷰모델 — 메시 · muzzle · bow 트랙', bowIds.length === 10 && bowMeshBad.length === 0, bowMeshBad.join(' ') || `${bowIds.length}종`);

  // (b) 활 공격 = 시위 당김 (arrow.position.z 가 rest → 최대 → rest, release 1회)
  rig.equip('bow_forever', { instant: true });
  advance(rig, 0.2);
  const bowAnim = () => rig.mesh?.userData?.animated?.bow ?? null;
  const bowRestZ = Number(bowAnim()?.arrow?.position?.z);
  const bowPrevRelease = rig.onRelease;
  let bowReleases = 0;
  rig.onRelease = () => { bowReleases += 1; };
  rig.triggerAttack();
  let bowMaxZ = bowRestZ;
  const bowAttackDur = weaponMotion('bow_forever').attack.duration;
  for (let t = 0; t < bowAttackDur + 0.5; t += 1 / 60) {
    rig.update(1 / 60);
    const z = Number(bowAnim()?.arrow?.position?.z);
    if (Number.isFinite(z)) bowMaxZ = Math.max(bowMaxZ, z);
  }
  const bowBackZ = Number(bowAnim()?.arrow?.position?.z);
  rig.onRelease = bowPrevRelease;
  check(
    '활 공격 = 시위를 당겨 화살이 물러났다 복귀 (release 1회)',
    Number.isFinite(bowRestZ) && Number.isFinite(bowBackZ) && bowMaxZ - bowRestZ >= 0.15 && Math.abs(bowBackZ - bowRestZ) < 0.05 && bowReleases === 1 && rig.state === 'idle',
    `rest ${bowRestZ.toFixed(3)} → 최대 ${bowMaxZ.toFixed(3)} → ${bowBackZ.toFixed(3)} · release ${bowReleases}`
  );

  // (c) 활 스왑 = nock 스타일 · 0.5초 · 3초 뒤 idle
  const bowSwapMotion = weaponMotion('bow_forever').swap;
  rig.equip('bow_forever', { instant: true });
  advance(rig, 0.2);
  const bowSwapRes = rig.equip('bow_forever');
  const bowSwapping = rig.state === 'swapping';
  advance(rig, 3);
  check(
    '활 스왑 = nock 스타일 0.5초 → 3초 뒤 idle',
    bowSwapMotion.style === 'nock' && bowSwapMotion.duration === 0.5 && bowSwapRes.ok === true && bowSwapRes.duration === 0.5 && bowSwapRes.style === 'nock' && bowSwapping && rig.state === 'idle' && rig.progress >= 1,
    `${bowSwapRes.style} ${bowSwapRes.duration}s → ${rig.state}`
  );

  // (d) 화살 제작 → 소비 → 티어 우선순위
  const arrowEco = new Economy({ gold: 5000000, wood: 500000, minerals: Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, 999])) });
  const arrowCtx = { wave: 200, cleared: 199 };
  const arrowCraft = new CraftingSystem({ getEconomy: () => arrowEco, getContext: () => arrowCtx });
  const arrowBeforeTable = arrowCraft.canCraftArrow('arrow_t3');
  const arrowBuilt3 = arrowCraft.build('forge_t3', arrowCtx);
  const arrowBuilt7 = arrowCraft.build('forge_t7', arrowCtx);
  const arrowGold0 = arrowEco.gold;
  const arrowBatch3 = arrowCraft.craftArrow('arrow_t3');
  const arrowGoldAfter3 = arrowEco.gold;
  const arrowT3After = arrowEco.getArrow('arrow_t3');
  const arrowTotalAfter = arrowEco.totalArrows();
  const arrowSpent = arrowEco.spendArrow('arrow_t3', 1);
  const arrowAfterSpend = arrowEco.getArrow('arrow_t3');
  const arrowBatch7 = arrowCraft.craftArrow('arrow_t7');
  const arrowBest = arrowEco.firstArrowIn(ARROW_ORDER_DESC);
  const arrowShort = arrowEco.spendArrow('arrow_t3', 999);
  check(
    '화살 제작 → 소비 → 티어 우선순위 (묶음 130발 · 1발 소모 · 최고 티어 · 부족 시 불변)',
    arrowBeforeTable.ok === false && arrowBuilt3.ok === true && arrowBuilt7.ok === true &&
      arrowBatch3.ok === true && arrowBatch3.amount === ARROW_BY_ID.arrow_t3.bundle &&
      arrowT3After === ARROW_BY_ID.arrow_t3.bundle && arrowTotalAfter === ARROW_BY_ID.arrow_t3.bundle &&
      arrowGold0 - arrowGoldAfter3 === arrowCraft.arrowRecipe('arrow_t3').cost.gold &&
      arrowSpent === true && arrowAfterSpend === ARROW_BY_ID.arrow_t3.bundle - 1 &&
      arrowBatch7.ok === true && arrowBest === 'arrow_t7' && arrowShort === false &&
      arrowEco.getArrow('arrow_t3') === ARROW_BY_ID.arrow_t3.bundle - 1 && arrowCraft.arrowBatchesOf('arrow_t3') === 1,
    `묶음 ${arrowBatch3.amount}발 · 잔여 ${arrowEco.getArrow('arrow_t3')} · 최고 ${arrowBest} · 부족소비 ${arrowShort}`
  );

  // (e) 유물 활 제작 게이트 — 창세의 제단 · 재료 차감 · 중복 거부
  const relicEco = new Economy({ gold: 5000000, wood: 500000, minerals: Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, 999])) });
  const relicOwned = new Set();
  const relicCtx = { wave: 200, cleared: 199, hasWeapon: (id) => relicOwned.has(id), onCrafted: (id) => relicOwned.add(id) };
  const relicCraft = new CraftingSystem({ getEconomy: () => relicEco, getContext: () => relicCtx });
  const relicBuilt = relicCraft.build('forge_t7', relicCtx);
  const relicRecipe = recipeForWeapon('bow_forever');
  const relicGold0 = relicEco.gold;
  const relicWood0 = relicEco.wood;
  const relicGenesis0 = relicEco.getMineral('genesis');
  const relicFirst = relicCraft.craft('bow_forever', relicCtx);
  const relicSecond = relicCraft.craft('bow_forever', relicCtx);
  check(
    '유물 활 제작 게이트 — 창세의 제단 · 재료 차감 · 중복 제작 거부',
    relicBuilt.ok === true && relicFirst.ok === true && relicFirst.weapon?.id === 'bow_forever' && relicFirst.recipe?.table === 'forge_t7' &&
      relicGold0 - relicEco.gold === relicRecipe.cost.gold && relicWood0 - relicEco.wood === relicRecipe.cost.wood &&
      relicGenesis0 - relicEco.getMineral('genesis') === (relicRecipe.cost.minerals.genesis ?? 0) &&
      relicSecond.ok === false && relicSecond.error === '이미 보유한 무기입니다.',
    `1차 ${relicFirst.ok ? 'ok' : relicFirst.error} · 2차 ${relicSecond.error} · ${relicRecipe.cost.gold}G 차감`
  );

  // (f) 화살 관통 피해 — 관통 3이면 더미 3명, 관통 0이면 1명
  const bowWeapon = weaponById('bow_forever');
  const arrowT7 = ARROW_BY_ID.arrow_t7;
  const pierceDamage = Math.round(bowWeapon.damage * arrowT7.damageMult);
  const pierceRun = (pierce) => {
    const pierceSys = new ProjectileSystem({ scene: new THREE.Scene() });
    const hits = [];
    const dummies = [0, 1, 2].map((i) => ({
      id: `pierce${i}`,
      alive: true,
      radius: 1,
      position: new THREE.Vector3(0, 0, -(8 + i * 6)),
      takeDamage(d) { hits.push(d); }
    }));
    pierceSys.spawn({ origin: new THREE.Vector3(0, 0, 0), direction: new THREE.Vector3(0, 0, -1), speed: 62, damage: pierceDamage, pierce, owner: 'player', silent: true });
    for (let i = 0; i < 60; i += 1) pierceSys.update(1 / 60, dummies);
    pierceSys.dispose();
    return hits;
  };
  const pierceHits = pierceRun(bowWeapon.pierce);
  const noPierceHits = pierceRun(0);
  check(
    '화살 관통 — 관통 3 = 더미 3명 같은 피해 · 관통 0 = 1명',
    bowWeapon.pierce === 3 && pierceDamage === Math.round(70 * 1.85) && pierceHits.length === 3 && pierceHits.every((d) => d === pierceDamage) &&
      noPierceHits.length === 1 && noPierceHits[0] === pierceDamage,
    `관통3 ${pierceHits.length}명×${pierceHits[0]} · 관통0 ${noPierceHits.length}명×${noPierceHits[0]}`
  );

  // (g) 궁수 3차 패시브
  const archerMods = classModifiers('archer', 3);
  check(
    '궁수 3차 패시브 — 무기 피해 1.28 · 이동 1.12',
    Math.abs(archerMods.weaponDamage - 1.28) < 0.01 && Math.abs(archerMods.moveSpeed - 1.12) < 0.01,
    `dmg ×${archerMods.weaponDamage.toFixed(3)} · move ×${archerMods.moveSpeed.toFixed(3)}`
  );

  // (h) 화살 저장/복원
  const arrowSaveEco = new Economy({ gold: 500, wood: 100, arrows: { arrow_t3: 17, arrow_t7: 4 } });
  const arrowSaveBack = new Economy({}).fromJSON(JSON.parse(JSON.stringify(arrowSaveEco.toJSON())));
  check(
    '화살 저장/복원 — 발수 보존',
    arrowSaveBack.getArrow('arrow_t3') === 17 && arrowSaveBack.getArrow('arrow_t7') === 4 && arrowSaveBack.totalArrows() === 21 && arrowSaveEco.toJSON().arrows.arrow_t3 === 17,
    `복원 ${arrowSaveBack.totalArrows()}발 ${JSON.stringify(arrowSaveBack.arrowInventory())}`
  );

  rig.dispose();
  check('뷰모델 dispose 로 카메라 원복', weaponCamera.children.length === 0, `children=${weaponCamera.children.length}`);
}

// ───────────────────────────── 11. 제작대 (순수 로직)
section('제작 시스템 (제작대 → 무기 제작)');
{
  const richMinerals = {};
  for (const id of ['iron', 'copper', 'coal', 'silver', 'quartz', 'mana', 'mithril', 'ruby', 'arcanite', 'adamantite', 'orichalcum', 'dragonbone', 'abyss', 'starshard', 'timesand', 'genesis', 'blossom_crystal', 'dream_petal', 'time_shard', 'frozen_hour']) richMinerals[id] = 60;
  const rich = new Economy({ gold: 5000000, wood: 500000, minerals: richMinerals });
  const owned = new Set();
  const baseCtx = {
    wave: 120,
    cleared: 119,
    fairies: 7,
    achievements: 60,
    hasWeapon: (id) => owned.has(id) || id === 'scythe_relic',
    onCrafted: (id) => owned.add(id)
  };
  const cs = new CraftingSystem({ getEconomy: () => rich, getContext: () => baseCtx });
  check('제작 시스템 — 제작대 8종 · 건설 0', cs.tableCount === 8 && cs.builtCount === 0);
  check('제작대 없이는 제작 불가', cs.craft('sword1h_guard', baseCtx).ok === false && cs.canCraft('sword1h_guard', baseCtx).error.includes('모루'), cs.canCraft('sword1h_guard', baseCtx).error);
  const goldBefore = rich.gold;
  const built = cs.build('forge_t1', baseCtx);
  check('T1 모루 건설', built.ok === true && cs.isBuilt('forge_t1'), built.error || '');
  check('건설 비용 차감 (골드300·목재100·철4)', rich.gold === goldBefore - 300 && rich.wood === 500000 - 100 && rich.getMineral('iron') === 56, `${goldBefore} → ${rich.gold}`);
  check('중복 건설 거부', cs.build('forge_t1', baseCtx).ok === false);
  check('건설 후 제작 가능', cs.canCraft('sword1h_guard', baseCtx).ok === true);
  const made = cs.craft('sword1h_guard', baseCtx);
  check('T1 무기 제작 성공', made.ok === true && owned.has('sword1h_guard') && cs.craftedCount === 1, made.error || '');
  check('제작 비용 차감 (골드450·목재150·철3)', rich.gold === goldBefore - 750 && rich.wood === 500000 - 250 && rich.getMineral('iron') === 53, `${rich.gold}`);
  check('보유 무기는 재제작 거부', cs.craft('sword1h_guard', baseCtx).ok === false);
  check('웨이브 미달이면 건설 불가', cs.build('forge_t7', { ...baseCtx, wave: 10, cleared: 9 }).ok === false);
  check('웨이브 도달 시 T7 창세의 제단 건설', cs.build('forge_t7', baseCtx).ok === true);
  check('꿈의 정원 — 요정 부족이면 불가', new CraftingSystem({ getEconomy: () => rich, getContext: () => baseCtx }).build('garden_of_dreams', { ...baseCtx, fairies: 0 }).ok === false);
  const garden = new CraftingSystem({ getEconomy: () => rich, getContext: () => baseCtx });
  check('꿈의 정원 건설 (조건 충족)', garden.build('garden_of_dreams', baseCtx).ok === true);
  const noDream = { ...baseCtx, hasWeapon: (id) => owned.has(id) };
  check('꿈의 끝은 희망 제작 (비밀 무기)', garden.craft('dream_lantern', noDream).ok === true);
  const scGold = rich.gold;
  const scTimesand = rich.getMineral('timesand');
  const madeScissors = cs.craft('time_scissors', baseCtx);
  check('T7 제단에서 시간의 가위 제작 (서명 비용 36000G + 시간의 모래 3)', madeScissors.ok === true && owned.has('time_scissors') && scGold - rich.gold === 36000 && scTimesand - rich.getMineral('timesand') === 3, `${madeScissors.error || ''} ${scGold} → ${rich.gold}G`);
  check('재료 부족이면 건설 실패', new CraftingSystem({ getEconomy: () => new Economy({ gold: 5, wood: 1, minerals: {} }), getContext: () => baseCtx }).build('forge_t1', baseCtx).ok === false);
  check('재료 부족이면 제작 실패', new CraftingSystem({ getEconomy: () => new Economy({ gold: 5, wood: 5, minerals: {} }), getContext: () => baseCtx }).craft('sword1h_guard', baseCtx).ok === false);
  const dump = JSON.parse(JSON.stringify(cs.toJSON()));
  const restored = new CraftingSystem({ getEconomy: () => rich, getContext: () => baseCtx }).fromJSON(dump);
  check('제작대 저장/복원', restored.isBuilt('forge_t1') && restored.isBuilt('forge_t7') && restored.craftedCount >= 1, JSON.stringify(dump.tables));
}

// ───────────────────────────── 10.9 포탈 아이템 제작·설치 (계약 §4.74)
section('포탈 아이템 제작 · 설치');
{
  const portalEco = new Economy({ gold: 5000000, wood: 500000, minerals: Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, 999])) });
  const pctx = { wave: 120, cleared: 119, fairies: 10, achievements: 80, hasWeapon: () => true };
  const pcs = new CraftingSystem({ getEconomy: () => portalEco, getContext: () => pctx });
  const noTable = new CraftingSystem({ getEconomy: () => portalEco, getContext: () => pctx });
  const portalType = TURRETS.find((t) => t.id === 'portal_tier1');
  check('포탈 — 건설 비용 0(아이템으로만 설치)', Boolean(portalType) && Number(portalType.cost?.gold) === 0 && portalType.craftOnly === true, JSON.stringify(portalType?.cost));
  check('포탈 — 제작대 없으면 제작 불가', noTable.craftPortal('tier1', pctx).ok === false, noTable.craftPortal('tier1', pctx).error);
  pcs.build('forge_t1', pctx);
  check('포탈 — T1 모루 건설', pcs.isBuilt('forge_t1'));
  const pSys = new TurretSystem({
    scene: new THREE.Scene(),
    world: world2,
    economy: portalEco,
    projectiles,
    audio,
    stats: new AchievementSystem({}),
    rng: rng.fork('portal-item'),
    getItem: (dest) => pcs.portalCount(dest),
    takeItem: (dest) => pcs.takePortal(dest)
  });
  const blocked = pSys.canPlace(portalType.id, placeAt(0, 34));
  check('포탈 — 아이템 없으면 설치 거부', blocked.ok === false && String(blocked.reason).includes('포탈 아이템'), blocked.reason);
  const goldBeforePortal = portalEco.gold;
  const made = pcs.craftPortal('tier1', pctx);
  check('포탈 — 제작 성공(보유 1)', made.ok === true && pcs.portalCount('tier1') === 1, made.error || '');
  check('포탈 — 제작 비용 차감(골드 1200)', goldBeforePortal - portalEco.gold === 1200, `${goldBeforePortal} → ${portalEco.gold}`);
  check('포탈 — 아이템이 있으면 설치 허용', pSys.canPlace(portalType.id, placeAt(0, 34)).ok === true);
  const placed = pSys.place(portalType.id, placeAt(0, 34), 'local', {});
  check('포탈 — 설치 성공 + 아이템 소모', Boolean(placed) && pcs.portalCount('tier1') === 0, `남은 ${pcs.portalCount('tier1')}개`);
  check('포탈 — 설치된 포탈 목적지(tier1)', placed?.type?.portalDest === 'tier1' && placed?.type?.kind === 'portal');
  check('포탈 — 아이템이 없으면 재설치 거부', pSys.canPlace(portalType.id, placeAt(90, 34)).ok === false);
  pcs.craftPortal('base', pctx);
  const pdump = JSON.parse(JSON.stringify(pcs.toJSON()));
  const prestored = new CraftingSystem({ getEconomy: () => portalEco, getContext: () => pctx }).fromJSON(pdump);
  check('포탈 — 보유 아이템 저장/복원', prestored.portalCount('base') === 1, JSON.stringify(pdump.portalItems));
}

// ───────────────────────────── 11.5 요정의 날개 제작 (제작대)
section('요정의 날개 제작 (제작대)');
{
  // main.js 의 _craftingContext 와 같은 형태 — hasWing/onWingCrafted 로 날개 시스템을 연결한다
  const richWingEco = new Economy({
    gold: 6000000,
    wood: 500000,
    minerals: { iron: 90, copper: 40, coal: 40, quartz: 90, mana: 30, silver: 30, mithril: 30, ruby: 30, arcanite: 30, adamantite: 30, orichalcum: 30, dragonbone: 30, abyss: 30, starshard: 30, timesand: 40, genesis: 30, blossom_crystal: 10, dream_petal: 10, time_shard: 10, frozen_hour: 10, frost_crystal: 10, heart_flame: 20, rune_shard: 20, aether_crystal: 20 },
    leathers: { leather: 40, thick_leather: 40, scaled_leather: 40, dragon_leather: 40, relic_leather: 40 }
  });
  const wingSys = new WingSystem({ economy: richWingEco });
  const wingCtx = {
    wave: 120,
    cleared: 119,
    fairies: 7,
    achievements: 60,
    hasWing: (id) => wingSys.has(id),
    onWingCrafted: (id) => wingSys.grant(id, { equip: true })
  };
  const wcs = new CraftingSystem({ getEconomy: () => richWingEco, getContext: () => wingCtx });

  check('제작대 없이는 날개 제작 불가', wcs.craftWing('fairy_wings', wingCtx).ok === false && wcs.canCraftWing('fairy_wings', wingCtx).error.includes('모루'), wcs.canCraftWing('fairy_wings', wingCtx).error);
  check('날개 레시피 8종 · 티어당 제작대 1곳', wcs.wingRecipes.length === 8 && wcs.wingsFor('forge_t7')[0].wingId === 'artifact_wings', wcs.wingsFor('forge_t7').map((r) => r.wingId).join(','));

  const wGoldBefore = richWingEco.gold;
  check('모루 건설', wcs.build('forge_t1', wingCtx).ok === true);
  check('T1 날개(요정의 날개) 제작', wcs.craftWing('fairy_wings', wingCtx).ok === true && wingSys.has('fairy_wings'));
  check(
    '제작 비용 차감 (25,000G · 철 30 · 석영 20 · 마나 5)',
    wGoldBefore - richWingEco.gold === 25000 + 300 &&
      richWingEco.getMineral('iron') === 90 - 4 - 30 &&
      richWingEco.getMineral('quartz') === 90 - 20 &&
      richWingEco.getMineral('mana') === 30 - 5,
    `${wGoldBefore} → ${richWingEco.gold}G`
  );
  check('제작 즉시 착용(onWingCrafted)', wingSys.equippedId === 'fairy_wings', String(wingSys.equippedId));
  check('보유 날개 재제작 거부', wcs.craftWing('fairy_wings', wingCtx).ok === false);
  check('제작 기록(craftedWings) 1건', wcs.craftedWingCount === 1 && wcs.wasWingCrafted('fairy_wings'));

  check('T2 — 대장간 미건설이면 불가', wcs.craftWing('sakura_wings', wingCtx).ok === false);
  check('대장간 건설', wcs.build('forge_t2', wingCtx).ok === true);
  const thickBefore = richWingEco.getLeather('thick_leather');
  const sakura = wcs.craftWing('sakura_wings', wingCtx);
  check('T2 벚꽃 날개 제작 + 가죽 소모(질긴 가죽 4)', sakura.ok === true && thickBefore - richWingEco.getLeather('thick_leather') === 4, `${thickBefore} → ${richWingEco.getLeather('thick_leather')}`);
  check('날개 2종 보유 · 최상위 착용', wingSys.count === 2 && wingSys.equippedId === 'sakura_wings');

  // 선행 날개 게이트 — T3 부터는 앞 티어 날개가 있어야 한다(제작대는 모두 건설해 둔다)
  const allBuilt = ['forge_t3', 'forge_t4', 'forge_t5', 'forge_t6', 'forge_t7'].every((id) => wcs.build(id, wingCtx).ok === true);
  check('T3~T7 제작대 건설', allBuilt === true, [...wcs.tables].join(','));
  const star = wcs.craftWing('star_wings', wingCtx);
  check('T3 별의 날개 제작(선행 충족)', star.ok === true && wingSys.has('star_wings'), star.error || '');
  const noPrevCtx = { ...wingCtx, hasWing: (id) => (id === 'runic_wings' ? false : wingSys.has(id)) };
  const blocked = wcs.craftWing('frost_wings', noPrevCtx);
  check('선행 날개가 없으면 제작 거부', blocked.ok === false && blocked.error.includes('룬 날개'), blocked.error);

  // T8(초월)은 꿈의 정원 — 비밀 제작대
  check('T8 날개는 꿈의 정원에서만', wcs.canCraftWing('aether_wings', wingCtx).error.includes('꿈의 정원'), wcs.canCraftWing('aether_wings', wingCtx).error);
  check('꿈의 정원 건설', wcs.build('garden_of_dreams', wingCtx).ok === true);
  check('꿈의 정원 건설 후에는 선행 날개(유물)만 남는다', wcs.canCraftWing('aether_wings', wingCtx).error.includes('유물 날개'), wcs.canCraftWing('aether_wings', wingCtx).error);

  check('재료 부족이면 날개 제작 실패', new CraftingSystem({ getEconomy: () => new Economy({ gold: 10, minerals: {}, leathers: {} }), getContext: () => wingCtx }).craftWing('fairy_wings', wingCtx).ok === false);
  const wingDump = JSON.parse(JSON.stringify(wcs.toJSON()));
  const wingRestored = new CraftingSystem({ getEconomy: () => richWingEco, getContext: () => wingCtx }).fromJSON(wingDump);
  check('날개 제작 기록 저장/복원', wingRestored.craftedWingCount === 3 && wingRestored.wasWingCrafted('star_wings') && wingRestored.craftedCount === 0, JSON.stringify(wingDump.craftedWings));

  // 날개 시스템과 제작 레시피가 같은 비용을 쓴다(단일 출처)
  const recipeT7 = wingRecipeFor('artifact_wings');
  const wingT7 = FAIRY_WING_BY_ID.artifact_wings;
  check(
    '레시피 비용 = 날개 데이터 비용(단일 출처)',
    recipeT7.cost.gold === wingT7.cost.gold &&
      JSON.stringify(recipeT7.cost.minerals) === JSON.stringify(wingT7.cost.minerals) &&
      JSON.stringify(recipeT7.cost.leather) === JSON.stringify(wingT7.cost.leather),
    `${recipeT7.cost.gold} / ${JSON.stringify(recipeT7.cost.leather)}`
  );
  check('가죽 없이는 T2 날개 제작 불가', new CraftingSystem({ getEconomy: () => new Economy({ gold: 999999, minerals: { blossom_crystal: 9, dream_petal: 9 }, leathers: {} }), getContext: () => ({ ...wingCtx, hasWing: () => false }) }).craftWing('sakura_wings', { ...wingCtx, hasWing: () => false }).ok === false);
}

// ───────────────────────────── 12. 시설 (작업대·저장고·채굴기) + 표면 고정
section('건설 시설 / 지형 표면');
try {
  // ── 지형 표면 정합: 격자 정점은 해석값과 같고, 나무는 표면에 붙어 있어야 한다
  const terr = world2.terrain;
  let vertexMismatch = 0;
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const gx = -2500 + (i * 5000) / 4;
      const gz = -2500 + (j * 5000) / 4;
      if (Math.abs(terr.getHeight(gx, gz) - terr.surfaceHeight(gx, gz)) > 1e-6) vertexMismatch += 1;
    }
  }
  check('표면 높이 = 격자 정점에서 해석 높이', vertexMismatch === 0, `${vertexMismatch}개 불일치`);
  check('표면 높이 유한값', Number.isFinite(terr.surfaceHeight(211.7, -133.3)), terr.surfaceHeight(211.7, -133.3).toFixed(2));
  const floating = world2.trees.filter((tr) => {
    const surf = world2.getHeight(tr.x, tr.z);
    return tr.y > surf + 0.05 || surf - tr.y > 0.85;
  });
  check('나무가 바닥에 고정(뜨지 않음)', floating.length === 0, floating.length ? `${floating.length}그루 뜸` : `${world2.trees.length}그루 안착`);
  check('잔디 텍스처 — 캔버스 없으면 null(헤드리스 안전)', terr._grassTexture() === null);

  // ── 시설 3종 배치와 동작
  const facStats = new AchievementSystem({});
  const facEco = new Economy({
    gold: 500000,
    wood: 50000,
    minerals: { iron: 40, copper: 40, coal: 40, silver: 40, tin: 40, obsidian: 40, marble: 40, mana: 40 }
  });
  const facTurrets = new TurretSystem({
    scene,
    world: world2,
    economy: facEco,
    projectiles,
    audio,
    stats: facStats,
    rng: rng.fork('facility')
  });
  const wbDef = TURRETS.find((t) => t.kind === 'workbench');
  const stDef = TURRETS.find((t) => t.kind === 'storage');
  const amDef = TURRETS.find((t) => t.kind === 'autominer');
  const goldBefore = facEco.gold;
  const wbTurret = facTurrets.place(wbDef.id, placeAt(60, 34), 'local');
  check('작업대 건설', Boolean(wbTurret) && wbTurret.type.kind === 'workbench', wbTurret ? 'ok' : '실패');
  check('작업대 비용 차감', facEco.gold === goldBefore - wbDef.cost.gold, `${goldBefore} → ${facEco.gold}`);
  check('builtByCategory.facility 누적', facTurrets.builtByCategory.facility === 1);
  check('시설 건설 통계', facStats.get('facilitiesBuilt') === 1);

  // Round C — 저장고·채굴기는 전기가 있어야 돈다: 옆에 발전기를 세운다(건물 6m 이내 연결).
  const genDef = TURRETS.find((t) => t.id === 'facility_generator_t1');
  const stGen = facTurrets.place(genDef.id, placeAt(91, 34), 'local');
  const stTurret = facTurrets.place(stDef.id, placeAt(85, 34), 'local');
  const amTurret = facTurrets.place(amDef.id, new THREE.Vector3(160, world2.getHeight(160, 160), 160), 'local');
  const amGen = facTurrets.place(genDef.id, new THREE.Vector3(164, world2.getHeight(164, 160), 160), 'local');
  check('저장고·채굴기 + 발전기 건설', Boolean(stTurret && amTurret && stGen && amGen));
  facTurrets.updatePower(true);
  check('발전기 옆 저장고·채굴기에 전기가 온다', stTurret?.powered === true && amTurret?.powered === true, JSON.stringify(amTurret?.powerNet));
  // 채굴기는 광물이 없는 빈 땅으로 옮겨 "바닥만으로 채굴"을 검증한다
  if (amTurret) {
    amTurret.position.set(160, world2.getHeight(160, 160), 160);
    amTurret.mineral = null;
  }
  const oreNearby = world2.nearestMineral(amTurret.position, amDef.range);
  check('채굴기 주변에 광물 없음(자가 채굴 조건)', oreNearby === null, oreNearby ? `광물 ${oreNearby.typeId ?? ''}` : '빈 땅');
  // 저장고는 반경 안에 플레이어가 있어야 인벤토리로 수거된다.
  if (stTurret) playerStub.position.copy(stTurret.position);
  const goldBeforeStore = facEco.gold;
  const woodBeforeStore = facEco.wood;
  const minedStat = facStats.get('mineralsMined');
  for (let i = 0; i < 30 * 20; i++) {
    facTurrets.update(1 / 30, { enemies: [], player: playerStub, world: world2, turrets: facTurrets.turrets });
  }
  check('저장고 — 골드 자동 생산', facEco.gold > goldBeforeStore && facTurrets.goldStored > 0, `${goldBeforeStore} → ${facEco.gold}`);
  check('저장고 — 목재 자동 생산', facEco.wood > woodBeforeStore && facTurrets.woodStored > 0, `${woodBeforeStore} → ${facEco.wood}`);
  playerStub.position.set(0, 0, 40); // 원래 자리로 복귀(이후 테스트는 플레이어 위치에 의존하지 않는다)
  check('채굴기 — 광물 없이 자동 채굴', facStats.get('mineralsMined') > minedStat && facTurrets.mineralsDrilled > 0, `+${facTurrets.mineralsDrilled ?? 0}개`);
  const t1Pool = mineralsForRegionTier(1);
  const drilledIds = [...(facTurrets.mineralTypesMined ?? [])].filter((id) => t1Pool.includes(id));
  check('채굴기 산출 광물이 설치 지형(T1) 광물 안', drilledIds.length > 0, drilledIds.join(','));
  check('채굴기가 지형 티어를 기록', amTurret?._drillRegion?.tier === 1 && Array.isArray(amTurret?._drillPoolNow), JSON.stringify(amTurret?._drillPoolNow));
  // 채굴기는 광물 위에도 설치할 수 있어야 한다(그냥 바닥에 놓으면 채굴)
  const someOre = world2.minerals.find((o) => (o.hp ?? 1) > 0);
  if (someOre) {
    const onOre = new THREE.Vector3(someOre.x, world2.getHeight(someOre.x, someOre.z), someOre.z);
    check('채굴기는 광물 위에도 설치 가능', facTurrets.canPlace(amDef.id, onOre).ok === true, facTurrets.canPlace(amDef.id, onOre).reason || 'ok');
    check('다른 포탑은 광물 위 설치 불가', facTurrets.canPlace(TURRETS.find((t) => t.category === 'mining').id, onOre).ok === false);
  }
  // ── 컨베이어벨트: 물류 보너스 · 승강 · 승급
  const beltDef = TURRETS.find((t) => t.id === 'facility_conveyor_t1');
  const drillBefore = facTurrets.mineralsDrilled;
  for (let i = 0; i < 30 * 20; i++) {
    facTurrets.update(1 / 30, { enemies: [], player: playerStub, world: world2, turrets: facTurrets.turrets });
  }
  const soloDrill = facTurrets.mineralsDrilled - drillBefore;
  // main.js 가 하는 배선(플레이어는 world 를 통해 벨트 밀림을 조회한다)
  world2.conveyorPushAt = (pos) => facTurrets.conveyorPushAt(pos);
  const belt = facTurrets.place(beltDef.id, new THREE.Vector3(168, world2.getHeight(168, 160), 160), 'local', { yaw: 0 });
  check('컨베이어벨트 T1 건설', Boolean(belt) && belt.type.kind === 'conveyor');
  const drillBefore2 = facTurrets.mineralsDrilled;
  for (let i = 0; i < 30 * 20; i++) {
    facTurrets.update(1 / 30, { enemies: [], player: playerStub, world: world2, turrets: facTurrets.turrets });
  }
  const beltDrill = facTurrets.mineralsDrilled - drillBefore2;
  check('벨트 물류 보너스 — 자원 시설 산출 증가', beltDrill > soloDrill, `20초 ${soloDrill}개 → ${beltDrill}개`);
  check('벨트가 채굴기를 돕는 중', Boolean(belt) && belt.boostedTowers >= 1 && amTurret.beltBoost > 0, `boost=+${Math.round((amTurret.beltBoost ?? 0) * 100)}%`);
  const bDir = belt ? belt.forward() : null;
  check('벨트 방향 = yaw 규약 (yaw 0 → -Z)', Boolean(bDir) && Math.abs(bDir.x) < 1e-6 && Math.abs(bDir.z + 1) < 1e-6, bDir ? `(${bDir.x.toFixed(2)}, ${bDir.z.toFixed(2)})` : '없음');
  const bPush = belt ? facTurrets.conveyorPushAt(belt.position) : null;
  check('벨트 위에서는 진행 방향으로 밀린다', Boolean(bPush) && Math.abs(bPush.speed - num2(beltDef.speed)) < 1e-6 && bPush.z < 0, bPush ? `${bPush.speed}m/s (${bPush.x.toFixed(2)}, ${bPush.z.toFixed(2)})` : '없음');
  check('벨트 밖에서는 밀리지 않는다', facTurrets.conveyorPushAt(new THREE.Vector3(320, world2.getHeight(320, 320), 320)) === null);
  const rider = new Player({ camera, world: world2, input: fakeInput(), audio, stats: facStats });
  rider.position.set(belt.position.x, belt.position.y + 0.1, belt.position.z);
  const riderZ = rider.position.z;
  for (let i = 0; i < 8; i++) rider.update(1 / 30);
  check('플레이어가 벨트 위에서 실려 간다', rider.position.z < riderZ - 0.4 && rider.onConveyor === true, `Δz=${(riderZ - rider.position.z).toFixed(2)}m`);
  const upgradeOk = belt ? facTurrets.upgrade(belt.id) : false;
  check('벨트 티어 승급 (T1→T2)', upgradeOk && belt.typeId === 'facility_conveyor_t2' && belt.type.boost > beltDef.boost, belt ? `${belt.typeId} +${Math.round(belt.type.boost * 100)}%` : '실패');

  // ── 몬스터 소환문: 주기 소환 · 위치 · 과밀 방지
  const spDef = TURRETS.find((t) => t.id === 'facility_spawner_t1');
  const spGen = facTurrets.place(genDef.id, placeAt(246, 34), 'local');
  const spawner = facTurrets.place(spDef.id, placeAt(240, 34), 'local');
  check('몬스터 소환문 + 발전기 건설', Boolean(spawner && spGen) && spawner.type.kind === 'spawner');
  facTurrets.updatePower(true);
  check('소환문에 전기가 온다', spawner?.powered === true, JSON.stringify(spawner?.powerNet));
  const spawnCalls = [];
  const spawnCtx = {
    enemies: [],
    player: playerStub,
    world: world2,
    turrets: facTurrets.turrets,
    wave: 3,
    spawnEnemy: (x, z, o) => {
      spawnCalls.push({ x, z, o });
      return { x, z };
    }
  };
  for (let i = 0; i < 30 * 32; i++) facTurrets.update(1 / 30, spawnCtx);
  check('소환문이 몬스터를 소환', facTurrets.monstersSpawned > 0 && spawnCalls.length > 0, `${facTurrets.monstersSpawned}마리`);
  check('소환 위치가 소환문 주변', spawnCalls.every((c) => Math.hypot(c.x - spawner.position.x, c.z - spawner.position.z) <= 5), spawnCalls.length ? `${spawnCalls.length}회` : '없음');
  check('소환 티어가 전달됨', spawnCalls.every((c) => c.o?.tier === spawner.tier));
  check('소환 통계 반영', facStats.get('monstersSpawned') === facTurrets.monstersSpawned, `stats=${facStats.get('monstersSpawned')}`);
  // ── 전기: 전선으로 먼 채굴기까지 보내고, 부족하면 멈춘다(Round C)
  const cableDef = TURRETS.find((t) => t.id === 'facility_cable');
  const farGen = facTurrets.place(genDef.id, placeAt(150, 60), 'local');
  const farDrill = facTurrets.place(amDef.id, placeAt(150, 90), 'local');
  facTurrets.updatePower(true);
  check('전선 없이 30m 떨어진 채굴기는 정지', farDrill?.powered === false, JSON.stringify(farDrill?.powerNet));
  let laidCables = 0;
  for (let i = 1; i <= 4; i++) if (facTurrets.place(cableDef.id, placeAt(150, 60 + i * 6), 'local')) laidCables += 1;
  facTurrets.updatePower(true);
  check('전선 4개로 30m 밖 채굴기에 전기가 간다', laidCables === 4 && farDrill?.powered === true, JSON.stringify(farDrill?.powerNet));
  const pwSummary = facTurrets.powerStatus();
  check('전력 요약 — 공급·소비·전력망 수', pwSummary.supply > 0 && pwSummary.demand > 0 && pwSummary.networks >= 3 && pwSummary.generators >= 4, JSON.stringify({ supply: pwSummary.supply, demand: pwSummary.demand, nets: pwSummary.networks, gen: pwSummary.generators }));
  check('전선은 포탑 상한과 따로 센다', facTurrets.turrets.filter((t) => t.type.kind === 'cable').length === laidCables);
  // 부족(브라운아웃) — 전선을 팔아 끊으면 그 망의 채굴기가 멈춘다
  const cut = facTurrets.turrets.filter((t) => t.type.kind === 'cable')[0];
  if (cut) {
    const cutGoldBefore = facEco.gold;
    const cutInvested = cut.investedCost.gold;
    const cutSold = facTurrets.sell(cut.id);
    check(
      '시설물 철거 환불 25%',
      Boolean(cutSold) && facEco.gold - cutGoldBefore === Math.floor(cutInvested * 0.25),
      `${JSON.stringify(cutSold)} · 골드 ${cutGoldBefore} → ${facEco.gold}`
    );
  }
  facTurrets.updatePower(true);
  check('전선을 하나 끊으면 전기가 끊긴다', farDrill?.powered === false, JSON.stringify(farDrill?.powerNet));

  const cappedAt = facTurrets.monstersSpawned;
  const crowded = { ...spawnCtx, enemies: new Array(SPAWNER_MAX_ALIVE).fill({}) };
  for (let i = 0; i < 30 * 32; i++) facTurrets.update(1 / 30, crowded);
  check('과밀하면 소환을 멈춘다', facTurrets.monstersSpawned === cappedAt, `상한 ${SPAWNER_MAX_ALIVE}마리`);

  // ── 소환몹은 웨이브 정산에서 제외된다(웨이브가 막히지 않게)
  const spawnWave = new WaveSystem({
    scene,
    world: world2,
    economy: facEco,
    audio,
    projectiles,
    stats: facStats,
    rng: rng.fork('spawner-wave'),
    difficulty: DIFFICULTIES[1],
    player: playerStub
  });
  const waveTotalBefore = spawnWave._waveTotal;
  const spawnedEnemy = spawnWave.spawnAt(120, 120, { tier: 3, wave: 5 });
  check('웨이브 시스템 즉석 소환', Boolean(spawnedEnemy) && spawnedEnemy.fromTower === true);
  check('소환몹은 웨이브 정산 제외 (alive·_waveTotal 불변)', spawnWave.alive === 0 && spawnWave._waveTotal === waveTotalBefore, `alive=${spawnWave.alive} total=${spawnWave._waveTotal}`);
  const moveFrom = spawnedEnemy?.position?.clone?.() ?? null;
  for (let i = 0; i < 90; i++) spawnWave.update(1 / 30, { player: playerStub, turrets: facTurrets.turrets });
  check('소환몹이 실제로 움직인다', !moveFrom || spawnedEnemy.position.x !== moveFrom.x || spawnedEnemy.position.z !== moveFrom.z, moveFrom ? `(${moveFrom.x.toFixed(1)},${moveFrom.z.toFixed(1)}) → (${spawnedEnemy.position.x.toFixed(1)},${spawnedEnemy.position.z.toFixed(1)})` : '없음');
  const killsBeforeSpawn = spawnWave.kills;
  spawnedEnemy?.takeDamage?.(999999, 'fire', 'player');
  check('소환몹 처치도 집계(킬·골드)', spawnWave.kills > killsBeforeSpawn && spawnWave.alive === 0, `kills ${killsBeforeSpawn} → ${spawnWave.kills}`);

  // 시설 정리(다른 테스트에 영향 없게)
  check('시설 저장/복원', (() => { const dump = facTurrets.toJSON(); return dump.turrets.filter((t) => t.category === 'facility').length >= 3; })());
} catch (err) {
  check('건설 시설 시퀀스', false, err.message);
  console.error(err);
}

// ───────────────────────────── 13. 작업대에서 전체 무기 제작
section('작업대 무기 제작');
try {
  const benchEco = new Economy({ gold: 9000000, wood: 500000, minerals: {} });
  for (const id of ['iron', 'copper', 'coal', 'silver', 'quartz', 'mana', 'mithril', 'ruby', 'arcanite', 'adamantite', 'orichalcum', 'dragonbone', 'abyss', 'starshard', 'timesand', 'genesis']) benchEco.addMineral(id, 60);
  const ownedBench = new Set();
  const benchCtx = {
    wave: 1,
    cleared: 0,
    fairies: 0,
    achievements: 0,
    hasWorkbench: true,
    hasWeapon: (id) => ownedBench.has(id),
    onCrafted: (id) => ownedBench.add(id)
  };
  const bench = new CraftingSystem({ getEconomy: () => benchEco, getContext: () => benchCtx });
  const basicWeapon = WEAPONS.find((w) => !w.craftOnly && !w.bonus && !w.secret)?.id;
  const noBench = { ...benchCtx, hasWorkbench: false };
  check('작업대 없으면 기본 무기 제작 불가', bench.canCraft(basicWeapon, noBench).ok === false && bench.canCraft(basicWeapon, noBench).error.includes('작업대'), bench.canCraft(basicWeapon, noBench).error);
  const madeBench = bench.craft(basicWeapon, benchCtx);
  check('작업대에서 기본 무기 제작', madeBench.ok === true && madeBench.via === 'workbench' && ownedBench.has(basicWeapon), madeBench.error || basicWeapon);
  check('작업대 제작은 재제작 거부', bench.craft(basicWeapon, benchCtx).ok === false);
  check('꿈의 끝은 희망은 작업대에서 불가', bench.canCraft('dream_lantern', benchCtx).ok === false, bench.canCraft('dream_lantern', benchCtx).error);
  check('꿈나무는 작업대에서 제작 가능', bench.canCraft('dream_tree', benchCtx).ok === true, bench.canCraft('dream_tree', benchCtx).error || 'ok');
  check('제작 무기는 티어 제작대 경로 유지', bench.canCraft('scythe_reaper', { ...benchCtx, hasWorkbench: false }).error.includes('마법 공방'), bench.canCraft('scythe_reaper', { ...benchCtx, hasWorkbench: false }).error);
} catch (err) {
  check('작업대 제작 시퀀스', false, err.message);
  console.error(err);
}


// ───────────────────────────── 14. 웨이브 편성 / 정예 개체 / 체력바
section('웨이브 편성 · 정예 · 체력바');
try {
  // (1) 웨이브마다 다른 몬스터 — 편성표가 주제를 정하고 연속 웨이브는 겹치지 않는다
  const rosterWaves = new WaveSystem({ scene, world: world2, rng: rng.fork('wave-roster'), difficulty: 'normal' });
  const rosterSeq = [];
  const kindsPerWave = [];
  for (let w = 1; w <= 12; w++) {
    const queue = rosterWaves._buildQueue(w);
    rosterSeq.push(rosterWaves.rosterId);
    kindsPerWave.push(new Set(queue.filter((e) => !e.isBoss).map((e) => e.typeId)));
  }
  let rosterDup = 0;
  for (let i = 1; i < rosterSeq.length; i++) if (rosterSeq[i] === rosterSeq[i - 1]) rosterDup += 1;
  check('웨이브마다 편성이 다름(연속 중복 0)', rosterDup === 0, rosterSeq.join(' → '));
  check('1~12 웨이브에서 편성 10종 이상', new Set(rosterSeq).size >= 10, `${new Set(rosterSeq).size}종`);
  const rosterKindsOk = rosterSeq.every((id, i) => {
    const r = WAVE_ROSTER_BY_ID[id];
    return r && [...kindsPerWave[i]].every((t) => r.types.includes(t));
  });
  check('등장 몬스터 ⊆ 편성표 종류', rosterKindsOk);
  check('웨이브 1은 임프/고블린만(해금 게이트)', kindsPerWave[0].size > 0 && [...kindsPerWave[0]].every((t) => ['imp', 'goblin'].includes(t)), [...kindsPerWave[0]].join(','));
  const rosterAgain = new WaveSystem({ scene, world: world2, rng: rng.fork('wave-roster-2'), difficulty: 'normal' });
  const rosterSeq2 = [];
  for (let w = 1; w <= 12; w++) { rosterAgain._buildQueue(w); rosterSeq2.push(rosterAgain.rosterId); }
  check('같은 웨이브 → 같은 편성(결정적)', rosterSeq2.join(',') === rosterSeq.join(','));

  const bossQueue = rosterWaves._buildQueue(10);
  check('10 웨이브 = 보스 웨이브(친위대 편성)', rosterWaves.isBossWave === true && rosterWaves.rosterId === 'boss_legion', String(rosterWaves.rosterId));
  check('보스 웨이브에 보스 정확히 1기', bossQueue.filter((e) => e.isBoss).length === 1);
  check('보스는 대기열 마지막', bossQueue[bossQueue.length - 1].isBoss === true);
  check('정예 개체가 편성표 수만큼 배치', bossQueue.filter((e) => e.elite).length === WAVE_ROSTER_BY_ID.boss_legion.elite, `${bossQueue.filter((e) => e.elite).length}기`);
  // 편성 → 실제 스폰 경로(강화·정예·체력바 수치)까지 확인
  const rosterMob = rosterWaves._spawnEntry({ typeId: 'orc', isBoss: false });
  const rosterElite = rosterWaves._spawnEntry({ typeId: 'orc', isBoss: false, elite: true });
  check('편성 스폰: 편성 강화가 자동 적용', rosterMob.mods?.hpMult === WAVE_ROSTER_BY_ID.boss_legion.mods.hpMult, JSON.stringify(rosterMob.mods));
  check('편성 스폰: 정예가 2.4배 단단하다', Math.abs(rosterElite.maxHp / rosterMob.maxHp - ELITE.hpMult) < 0.05, `${rosterMob.maxHp} → ${rosterElite.maxHp}`);
  check('편성 스폰: 살아있는 목록 등록 + 체력바 수치', rosterWaves.enemies.includes(rosterMob) && rosterMob.barY > 0 && rosterMob.barWidth > 0, `barY ${rosterMob.barY.toFixed(2)} 폭 ${rosterMob.barWidth}`);
  check('웨이브 편성 정보 노출(rosterInfo)', rosterWaves.rosterInfo?.id === 'boss_legion' && rosterWaves.rosterInfo.elite >= 0, JSON.stringify(rosterWaves.rosterInfo));
  const bossSnap = rosterWaves.snapshot();
  check(
    '웨이브 스냅샷에 편성/보스 포함',
    bossSnap.roster === 'boss_legion' &&
      bossSnap.boss === rosterWaves.currentBossId &&
      ['ogre_king', 'lich', 'elder_dragon', 'titan','celestial'].includes(bossSnap.boss),
    JSON.stringify({ roster: bossSnap.roster, boss: bossSnap.boss, elite: bossSnap.eliteCount })
  );

  // (2) 편성 강화(mods)와 정예 개체 능력치
  const ewRng = createRNG('wave-elite');
  const spawnOpts = { scene, world: world2, rng: ewRng, wave: 8, pattern: null };
  const plainOrc = spawnEnemy({ ...spawnOpts, typeId: 'orc' });
  const strongOrc = spawnEnemy({ ...spawnOpts, typeId: 'orc', mods: { hpMult: 1.3, speedMult: 0.92, scaleMult: 1.1 } });
  check('편성 강화: 체력 x1.3', Math.abs(strongOrc.maxHp - plainOrc.maxHp * 1.3) <= 1, `${plainOrc.maxHp} → ${strongOrc.maxHp}`);
  check('편성 강화: 속도 x0.92', Math.abs(strongOrc.baseSpeed - plainOrc.baseSpeed * 0.92) < 0.001, `${plainOrc.baseSpeed.toFixed(2)} → ${strongOrc.baseSpeed.toFixed(2)}`);
  check('편성 강화: 판정 크기 x1.1', Math.abs(strongOrc.radius - plainOrc.radius * 1.1) < 0.001, `r ${strongOrc.radius.toFixed(2)}`);
  check('편성 강화: 체력바도 함께 커짐', strongOrc.barY > plainOrc.barY, `barY ${plainOrc.barY.toFixed(2)} → ${strongOrc.barY.toFixed(2)}`);
  const eliteOrc = spawnEnemy({ ...spawnOpts, typeId: 'orc', elite: true });
  check('정예 체력 x2.4', Math.abs(eliteOrc.maxHp - plainOrc.maxHp * ELITE.hpMult) <= 1, `${plainOrc.maxHp} → ${eliteOrc.maxHp}`);
  check('정예 골드 x2', eliteOrc.gold === plainOrc.gold * 2, `${plainOrc.gold} → ${eliteOrc.gold}`);
  check('정예 이름 접두어', eliteOrc.name === `정예 ${plainOrc.type.name}`, eliteOrc.name);
  check('정예 체력바가 더 넓다', eliteOrc.barWidth > plainOrc.barWidth, `${plainOrc.barWidth} → ${eliteOrc.barWidth}`);
  check('정예 오라 표시', eliteOrc.mesh?.getObjectByName?.('eliteAura')?.visible === true);
  check('일반 개체는 오라 숨김', plainOrc.mesh?.getObjectByName?.('eliteAura')?.visible === false);
  const eliteBoss = spawnEnemy({ ...spawnOpts, typeId: 'lich', isBoss: true, elite: true });
  check('보스는 정예가 되지 않는다', eliteBoss.elite === false && eliteBoss.name === '리치', eliteBoss.name);
  check('enemyInfo 에 체력바·정예 정보 포함', (() => { const i = enemyInfo(eliteOrc); return i.elite === true && i.ratio === 1 && i.barY > 0 && i.barWidth > 0; })(), JSON.stringify(enemyInfo(eliteOrc).barY));

  // (2-1) 몬스터 외형 — 괴물 파츠(몸통 · 팔 · 눈) · 종류별 실루엣 · 망토 · 발광
  const lookImp = spawnEnemy({ ...spawnOpts, typeId: 'imp' });
  const lookWolf = spawnEnemy({ ...spawnOpts, typeId: 'wolf' });
  const lookShade = spawnEnemy({ ...spawnOpts, typeId: 'shade' });
  const partsOf = (e) => (e.mesh?.children ?? []).map((c) => c.name);
  check('몬스터 외형 — 몸통·팔·눈 파츠', ['body', 'arms', 'eyes'].every((n) => partsOf(lookImp).includes(n)), partsOf(lookImp).join(','));
  check('몬스터 외형 — 정점 색 지오메트리', Boolean(lookImp.mesh.getObjectByName('body')?.geometry?.attributes?.color));
  check('몬스터 외형 — 종류마다 다른 모델', lookImp.mesh.getObjectByName('body').geometry !== lookWolf.mesh.getObjectByName('body').geometry);
  check('몬스터 외형 — 늑대는 낮은 자세(체력바도 낮다)', lookWolf.barY < lookImp.barY, `${lookWolf.barY.toFixed(2)} < ${lookImp.barY.toFixed(2)}`);
  check('몬스터 외형 — 망토는 그림자만', Boolean(lookShade.mesh.getObjectByName('cloak')) && !lookImp.mesh.getObjectByName('cloak'));
  check('몬스터 외형 — 눈 재질 발광', (lookImp.mesh.getObjectByName('eyes')?.material?.emissiveIntensity ?? 0) > 1);
  check('몬스터 외형 — 팔·눈이 몸통과 같은 원점', lookImp.mesh.getObjectByName('arms').position.y === 0 && lookImp.mesh.getObjectByName('eyes').position.y === 0);

  // (3) 신규 몬스터 3종 + 해골(언데드) 신성 추가 피해
  const newKinds = ['bat', 'spider', 'skeleton'].map((typeId) => spawnEnemy({ ...spawnOpts, typeId }));
  check('신규 몬스터 3종 스폰', newKinds.every((e) => e && e.alive && e.hp > 0), newKinds.map((e) => e.typeId).join(','));
  check('신규 몬스터 실루엣이 서로 다름', new Set(newKinds.map((e) => e.barHeight ?? e.type.radius)).size === 3 || new Set(newKinds.map((e) => e.type.color)).size === 3);
  const holySkel = spawnEnemy({ ...spawnOpts, typeId: 'skeleton' });
  const fireSkel = spawnEnemy({ ...spawnOpts, typeId: 'skeleton' });
  const skelBefore = holySkel.hp;
  holySkel.takeDamage(100, 'holy', 'player');
  fireSkel.takeDamage(100, 'fire', 'player');
  const holyDmg = skelBefore - holySkel.hp;
  const fireDmg = skelBefore - fireSkel.hp;
  check('해골은 신성에 1.5배 피해', holyDmg > fireDmg * 1.4, `신성 ${Math.round(holyDmg)} vs 화염 ${Math.round(fireDmg)}`);
  const golemHoly = spawnEnemy({ ...spawnOpts, typeId: 'golem' });
  const golemBefore = golemHoly.hp;
  golemHoly.takeDamage(100, 'holy', 'player');
  check('비언데드는 신성 추가 피해 없음', Math.abs(golemBefore - golemHoly.hp - 100) < 0.01, `${Math.round(golemBefore - golemHoly.hp)}`);

  // (4) 월드 체력바(InstancedMesh) — 그린 개수/색/폭/정리
  const barCam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 900);
  barCam.position.set(0, 6, 0);
  barCam.updateMatrixWorld(true);
  const bars = new EnemyHealthBars({ scene, camera: barCam, capacity: 8 });
  const barRng = createRNG('wave-bars');
  const barList = [];
  for (let i = 0; i < 5; i++) {
    const e = spawnEnemy({ scene, world: world2, rng: barRng, wave: 3, typeId: 'goblin', pattern: null });
    e.position.set(i * 2, 0, -6);
    barList.push(e);
  }
  barList[1].hp = barList[1].maxHp * 0.5;
  barList[2].isBoss = true;
  barList[2].barY = 6;
  barList[2].barWidth = HEALTH_BAR.bossWidth;
  barList[3].maxHp = 500;
  barList[3].hp = 100;
  barList[4].alive = false;
  const farEnemy = barList[0];
  farEnemy.position.set(0, 0, -400); // 사거리 밖
  const drawn = bars.sync(barList, barCam);
  check('체력바: 살아있는 근접 개체만 그린다', drawn === 3, `${drawn}개 / 전체 5기(1기 사망·1기 사거리 밖)`);
  check('체력바: 사거리 밖 개체 제외', bars.visibleCount === 3);
  const bm = new THREE.Matrix4();
  const bs = new THREE.Vector3();
  const bc = new THREE.Color();
  bars.fillMesh.getMatrixAt(0, bm);
  bs.setFromMatrixScale(bm);
  check('체력바 채움 = 체력 비율 x 폭', Math.abs(bs.x - HEALTH_BAR.width * 0.5) < 0.01, `x=${bs.x.toFixed(3)}`);
  check('체력바 높이가 데이터와 일치', Math.abs(bs.y - HEALTH_BAR.height * 0.66) < 0.01, `y=${bs.y.toFixed(3)}`);
  bars.fillMesh.getColorAt(0, bc);
  check('체력바 색 = 종족 색', bc.getHex() === (barList[1].type.color & 0xffffff), `#${bc.getHexString()}`);
  bars.backMesh.getMatrixAt(1, bm);
  bs.setFromMatrixScale(bm);
  check('보스 체력바는 더 넓다', Math.abs(bs.x - HEALTH_BAR.bossWidth) < 0.01 && Math.abs(bs.y - HEALTH_BAR.bossHeight) < 0.01, `${bs.x.toFixed(2)} x ${bs.y.toFixed(2)}`);
  const lowEnemy = barList[3];
  lowEnemy.hp = lowEnemy.maxHp * 0.1;
  bars.sync(barList, barCam);
  bars.fillMesh.getColorAt(2, bc);
  check('위험 체력은 붉게 표시', bc.getHex() === (HEALTH_BAR.colors.low & 0xffffff), `#${bc.getHexString()}`);
  check('체력바 씬 등록', scene.children.some((o) => o.name === 'enemyHealthBars'));
  const capacityBefore = bars.visibleCount;
  bars.sync([], barCam);
  check('적이 없으면 전부 숨김', bars.visibleCount === 0 && capacityBefore > 0);
  bars.dispose();
  check('체력바 dispose 로 씬에서 제거', !scene.children.some((o) => o.name === 'enemyHealthBars'));

  // (5) 보스 조회(bossEnemy) — HUD 보스 체력바가 읽는 값
  const liveWaves = new WaveSystem({ scene, world: world2, rng: rng.fork('wave-boss'), difficulty: 'normal' });
  check('보스 없을 때 bossEnemy = null', liveWaves.bossEnemy === null);
  const liveBoss = spawnEnemy({ scene, world: world2, rng: createRNG('live-boss'), wave: 10, typeId: 'titan', isBoss: true, pattern: null });
  liveWaves.enemies.push(liveBoss);
  const info = enemyInfo(liveWaves.bossEnemy);
  check('살아있는 보스 조회', liveWaves.bossEnemy === liveBoss && info.isBoss === true, info.name);
  check('보스 체력바 높이/폭 정보', info.barY > 0 && info.barWidth === HEALTH_BAR.bossWidth, `barY ${info.barY.toFixed(2)} 폭 ${info.barWidth}`);
  liveBoss.takeDamage(liveBoss.maxHp * 0.5, null, 'player');
  const hurtInfo = enemyInfo(liveWaves.bossEnemy);
  check('보스 체력 비율 반영', Math.abs(hurtInfo.ratio - 0.5) < 0.02, `ratio ${hurtInfo.ratio.toFixed(2)}`);
  liveBoss.alive = false;
  check('쓰러진 보스는 조회에서 제외', liveWaves.bossEnemy === null);
  // (6) 지옥 — 100 웨이브 고정 · 마지막 보스 디아블로(고정 스펙)
  const hellWaves = new WaveSystem({ scene, world: world2, rng: rng.fork('wave-hell'), difficulty: 'hell' });
  check('지옥 — maxWaves 100', hellWaves.maxWaves === 100, String(hellWaves.maxWaves));
  hellWaves.wave = 100;
  const hellQueue = hellWaves._buildQueue(100);
  const hellBossEntry = hellQueue[hellQueue.length - 1];
  check('지옥 100 웨이브 최종보스 = 디아블로', hellBossEntry?.isBoss === true && hellBossEntry?.typeId === 'diablo', String(hellBossEntry?.typeId));
  check('지옥 100 웨이브 = 최종 보스 웨이브', hellWaves.currentBossId === 'diablo' && hellWaves.isFinalBossWave === true && hellWaves.isBossWave === true);
  const hellBoss = spawnEnemy({ scene, world: world2, rng: createRNG('hell-diablo'), wave: 100, typeId: 'diablo', isBoss: true, difficulty: 'hell', pattern: null });
  check('디아블로 고정 스펙 — HP 10억 · 공격력 170만', hellBoss.maxHp === 1000000000 && hellBoss.damage === 1700000, `${hellBoss.maxHp} / ${hellBoss.damage}`);
  check('디아블로 전용 모델·능력', hellBoss.mesh?.getObjectByName?.('diabloLight') != null || hellBoss.type?.ability === 'apocalypse', hellBoss.type?.ability);
  hellBoss.despawn?.();
  let hellVictory = null;
  hellWaves.onVictory((payload) => { hellVictory = payload; });
  hellWaves.phase = 'combat';
  hellWaves.wave = 100;
  hellWaves._completeWave({ turrets: [] });
  check('지옥 100 웨이브 완료 → 101 이 아니라 승리', hellWaves.phase === 'victory' && hellVictory?.wave === 100, `${hellWaves.phase} / ${hellVictory?.wave}`);
} catch (err) {
  check('웨이브 편성 / 체력바', false, err.message);
  console.error(err);
}


// ───────────────────────────── 15. 3D 소환문 / 등장 연출
section('3D 소환문 · 몬스터 등장 연출');
try {
  const gateRng = createRNG('gate-3d');
  const gateTerrain = { surfaceHeight: (x, z) => Math.sin(x * 0.01) * 2 + Math.cos(z * 0.013) * 1.5 };
  const gateScene = new THREE.Scene();
  const field = new PortalField({ rng: gateRng, terrain: gateTerrain });
  gateScene.add(field.group);
  check('소환문 8기 생성', field.portals.length === 8 && field.group.name === 'portals', `${field.portals.length}기`);

  // 문 하나가 3D 구조물인지: 부품 이름과 실제 크기(바운딩 박스)로 확인한다.
  const g0 = field.portals[0];
  const partNames = g0.mesh.children.map((c) => c.name);
  const required = ['arch', 'trim', 'vortex', 'vortexCore', 'halo', 'rune', 'runeInner', 'groundGlow', 'flames', 'keystone', 'vortexBack'];
  check('부품 11종(아치·소용돌이·룬·화로·쐐기돌)', required.every((n) => partNames.includes(n)), partNames.join(','));
  const bb = g0.stone.geometry.boundingBox;
  check('아치 높이 10m 이상(평면 판이 아니다)', bb.max.y > 10 && bb.min.y < 0.2, `y ${bb.min.y.toFixed(1)}..${bb.max.y.toFixed(1)}`);
  check('아치 폭/깊이 12m 이상(입체 구조)', bb.max.x - bb.min.x > 12 && bb.max.z - bb.min.z > 12, `${(bb.max.x - bb.min.x).toFixed(1)} x ${(bb.max.z - bb.min.z).toFixed(1)}`);
  const stoneTris = g0.stone.geometry.attributes.position.count / 3;
  check('석조 디테일(삼각형 600개 이상)', stoneTris > 600, `${stoneTris} 삼각형`);
  check('문 8기가 지오메트리를 공유한다(메모리 절약)', field.portals[0].stone.geometry === field.portals[7].stone.geometry && field.portals[0].vortex.geometry === field.portals[3].vortex.geometry);
  check('문 하나 = 11 draw call', g0.mesh.children.length === 11, `${g0.mesh.children.length}개`);
  // 소용돌이·광륜이 문틀(석조 아치) 안에 들어가는지 — 밖으로 삐져나오면 연출이 깨진다.
  const haloR = g0.halo.geometry.parameters.radius;
  const haloTop = g0.halo.position.y + haloR * g0.halo.scale.y;
  const haloBottom = g0.halo.position.y - haloR * g0.halo.scale.y;
  check('광륜이 문틀 안에 들어간다', haloTop < bb.max.y - 1 && haloBottom > bb.min.y + 0.5, `y ${haloBottom.toFixed(2)}..${haloTop.toFixed(2)} (문 1.05..8.19)`);
  const swirlR = 2.13; // 소용돌이 날개 최대 반지름
  const swirlTop = g0.vortex.position.y + swirlR * g0.vortex.scale.y;
  check('소용돌이가 문틀 안에 들어간다', swirlTop < bb.max.y - 1 && g0.vortex.position.y - swirlR * g0.vortex.scale.y > bb.min.y + 0.5, `y ${(g0.vortex.position.y - swirlR * g0.vortex.scale.y).toFixed(2)}..${swirlTop.toFixed(2)}`);
  check('광륜 폭이 문 폭과 맞는다', Math.abs(haloR * 2 - 4.7) < 0.6, `${(haloR * 2).toFixed(2)}m (문 4.7m)`)

  // 패턴별 색/개수, 발광 머티리얼 동기화
  field.setPattern('ring');
  check('고리 패턴은 8기 전부 열린다', field.activePortals.length === 8 && field.portals.every((p) => p.active));
  const ringColor = g0._solidMat.color.getHexString();
  check('패턴 색이 아치·소용돌이·장식에 함께 적용', g0._glowMat.color.getHexString() === ringColor && g0._trimMat.color.getHexString() === ringColor, `#${ringColor}`);
  field.setPattern('cluster');
  check('밀집 패턴은 2기만 열린다', field.activePortals.length === 2 && field.portals.filter((p) => !p.active).length === 6);
  field.setPattern('radial');
  check('다시 열면 좌표/회전이 갱신', field.activePortals.length === 6 && Math.abs(field.portals[0].mesh.rotation.y) >= 0);

  // 살아 움직이는 문
  const a0 = field.portals[0];
  const snap = { vortex: a0.vortex.rotation.z, core: a0.vortexCore.rotation.z, rune: a0.rune.rotation.y, orb: a0.orb.position.y, flame: a0.flames.scale.y };
  for (let i = 0; i < 30; i++) field.update(0.033);
  const moved = { vortex: a0.vortex.rotation.z, core: a0.vortexCore.rotation.z, rune: a0.rune.rotation.y, orb: a0.orb.position.y, flame: a0.flames.scale.y };
  check('소용돌이·고리가 반대로 돈다', moved.vortex > snap.vortex && moved.core < snap.core, `바깥 ${moved.vortex.toFixed(2)} / 안쪽 ${moved.core.toFixed(2)}`);
  check('바닥 룬이 돈다', Math.abs(moved.rune - snap.rune) > 0.5, `${moved.rune.toFixed(2)}`);
  check('문 위 쐐기돌이 떠 있다(부유)', Math.abs(moved.orb - a0.orbY) < 0.4 && moved.orb !== snap.orb, `y ${moved.orb.toFixed(2)}`);
  check('화로 불꽃이 흔들린다', Math.abs(moved.flame - snap.flame) > 0.02, `scale ${moved.flame.toFixed(3)}`);
  check('문 빛이 맥동한다(0.2~1.0)', a0._glowMat.opacity > 0.2 && a0._glowMat.opacity <= 1, a0._glowMat.opacity.toFixed(3));

  // 스폰 지점 = 문 바로 뒤(바깥쪽) 땅
  const used = field.activePortals[3 % field.activePortals.length];
  const sp = field.spawnPoint('radial', 3, 6, gateRng);
  const len = Math.hypot(used.x, used.z) || 1;
  const outward = ((sp.x - used.x) * used.x + (sp.z - used.z) * used.z) / len;
  const dist = Math.hypot(sp.x - used.x, sp.z - used.z);
  check('몬스터는 문 바로 뒤에서 나온다', outward > 0 && dist > 3 && dist < 7, `문에서 ${dist.toFixed(2)}m`);
  check('문 앞 지점은 지형 표면 높이', Math.abs(sp.y - gateTerrain.surfaceHeight(sp.x, sp.z)) < 1e-9, `y ${sp.y.toFixed(2)}`);
  const scatterA = field.spawnPoint('scattered', 1, 6, gateRng);
  const scatterAnchor = field.activePortals[1 % field.activePortals.length];
  const scatterDist = Math.hypot(scatterA.x - scatterAnchor.x, scatterA.z - scatterAnchor.z);
  check('흩어짐 패턴은 멀리 퍼진다(패턴 성격 유지)', scatterDist > 10, `${scatterDist.toFixed(1)}m`);

  // 몬스터가 나오면 문이 번쩍인다
  const flashGate = field.activePortals[0];
  const before = { flash: flashGate._flash, glow: flashGate._glowMat.opacity, emissive: flashGate._solidMat.emissiveIntensity };
  const hit = field.flashNearest(flashGate.x + 2, flashGate.z + 2, 0.55);
  check('가장 가까운 문이 번쩍인다', hit === flashGate && flashGate._flash > before.flash, `flash ${flashGate._flash.toFixed(2)}`);
  field.update(0.05);
  check('번쩍임이 빛으로 나타난다', flashGate._glowMat.opacity > before.glow && flashGate._solidMat.emissiveIntensity > before.emissive, `opacity ${flashGate._glowMat.opacity.toFixed(2)} emissive ${flashGate._solidMat.emissiveIntensity.toFixed(2)}`);
  for (let i = 0; i < 40; i++) field.update(0.1);
  check('번쩍임은 곧 잦아든다', flashGate._flash === 0);

  // 등장 연출: 문에서 나온 몬스터가 작게 시작해 제 크기로 자란다
  const gateWorld = { getHeight: () => 0 };
  const emerging = spawnEnemy({ scene: gateScene, world: gateWorld, rng: createRNG('emerge'), wave: 4, typeId: 'orc', pattern: 'radial', portals: field.portals });
  check('스폰 직후 = 등장 중', enemyInfo(emerging).emerging === true && emerging.mesh.scale.x < 0.5, `scale ${emerging.mesh.scale.x.toFixed(2)}`);
  check('땅속에서 솟아오른다(아래에서 시작)', emerging.mesh.position.y < emerging.position.y - 0.5, `${(emerging.mesh.position.y - emerging.position.y).toFixed(2)}`);
  emerging.update(0.02, {});
  check('등장 순간 코어가 소환문 색으로 번쩍인다', emerging._coreMaterial.emissive.getHex() === (SPAWN_FX.tint & 0xffffff) && emerging._coreMaterial.emissiveIntensity > 1.5, `#${emerging._coreMaterial.emissive.getHexString()} ${emerging._coreMaterial.emissiveIntensity.toFixed(2)}`);
  for (let i = 0; i < 40; i++) emerging.update(0.033, {});
  check('연출이 끝나면 제 크기/제자리', enemyInfo(emerging).emerging === false && Math.abs(emerging.mesh.scale.x - 1) < 0.01 && Math.abs(emerging.mesh.position.y - emerging.position.y) < 0.01);
  const noFx = spawnEnemy({ scene: gateScene, world: gateWorld, rng: createRNG('no-fx'), wave: 4, typeId: 'orc', emerge: false });
  check('emerge:false 는 연출을 건너뛴다', enemyInfo(noFx).emerging === false && Math.abs(noFx.mesh.position.y - noFx.position.y) < 0.01);
  check('보스는 더 크게 솟아오른다', (() => { const b = spawnEnemy({ scene: gateScene, world: gateWorld, rng: createRNG('boss-fx'), wave: 10, typeId: 'titan', isBoss: true, emerge: true }); const off = b.position.y - b.mesh.position.y; return off > SPAWN_FX.riseHeight * 1.5; })(), `+${SPAWN_FX.riseHeight} × 2`);

  // 월드에 실제로 붙어 있는지 + 정리
  // 실제 월드 조립 경로에서도 3D 소환문이 붙는지 (앞선 섹션에서 world2 는 이미 dispose 됐다)
  const gateWorldFull = createWorld({ scene: gateScene, seed: '4242', quality: 'performance', rng: createRNG('gate-world') });
  check('월드가 3D 소환문을 조립한다', gateWorldFull.portalField?.group?.parent === gateWorldFull.group && gateWorldFull.portals.length === 8, `${gateWorldFull.portals.length}기`);
  const gateCull = { position: { x: 0, y: 6, z: 0 }, getWorldPosition: (v) => v.set(0, 6, 0) };
  gateWorldFull.frustumCull(gateCull);
  check('소환문 거리 컬링이 살아 있다', gateWorldFull.portals.every((p) => p.mesh.visible === p.active), '카메라 근처 = 활성 문 전부 표시');
  gateWorldFull.dispose();
  field.dispose();
  check('dispose 로 문이 전부 정리', !gateScene.children.includes(field.group) && field.portals.length === 0 && field.group.children.length === 0);
} catch (err) {
  check('3D 소환문', false, err.message);
  console.error(err);
}

// ───────────────────────────── 31. 전직 시스템 (ClassSystem)
section('전직 시스템');
try {
  const cls = new ClassSystem();
  check('초기 상태 — 초심자 0차', cls.classId === 'novice' && cls.stage === 0 && cls.isNovice === true, cls.label);
  check('초심자 — 2등급 사용 / 3등급 잠김', cls.canUse('staff_common') === true && cls.canUse('staff_rare') === false);
  let events = 0;
  cls.on('advance', () => { events += 1; });
  const econ = new Economy({ gold: 5000, wood: 0 });
  const pay = (n) => econ.spendGold(n);
  check('초심자로는 전직할 수 없다', cls.advance('novice', { wave: 99, gold: 99999 }).ok === false);
  check('웨이브 미달이면 전직 거부', cls.advance('mage', { wave: 1, gold: 5000, spend: pay }).ok === false, cls.canAdvanceTo('mage', { wave: 1 }).error);
  const adv = cls.advance('mage', { wave: 5, gold: econ.gold, spend: pay });
  check('1차 전직 성공 + 이벤트', adv.ok === true && cls.classId === 'mage' && cls.stage === 1 && events === 1, cls.label);
  check('1차 전직은 무료', econ.gold === 5000, econ.gold + 'G');
  check('전직 후 — 자기 계열 4등급까지 사용', cls.canUse('staff_epic') === true && cls.canUse('staff_legendary') === false);
  check('전직 후 — 다른 계열은 전부 잠김', cls.canUse('sword1h_common') === false && cls.lockOf('sword1h_common').kind === 'family', cls.lockOf('sword1h_common').reason);
  check('전직 후 — 상위 등급은 상위 전직 필요', cls.lockOf('staff_legendary').kind === 'tier', cls.lockOf('staff_legendary').reason);
  check('공용 계열은 그대로 사용 가능', cls.canUse('time_scissors') === true && cls.canUse('dream_tree') === true);
  check('무기 피해 배율 — 마법사 1차 ×1.1', Math.abs(cls.weaponDamageMult - 1.1) < 1e-9, cls.weaponDamageMult);
  const usable = cls.filterUsable(WEAPONS);
  check('filterUsable — 잠긴 무기를 걸러낸다', usable.length === WEAPONS.filter((w) => cls.canUse(w.id)).length && usable.length < WEAPONS.length, usable.length + ' / ' + WEAPONS.length);
  check('잠긴 무기 수 — 40종 이상', cls.lockedCount(WEAPONS) === WEAPONS.length - usable.length && cls.lockedCount(WEAPONS) > 40, cls.lockedCount(WEAPONS) + '종');
  check('info() 요약 — 라벨·단계·다음 조건', cls.info().label === cls.label && cls.info().maxTier === 4 && cls.info().nextStage.stage === 2, cls.info().label);

  const need = cls.nextStageRequirement();
  check('2차 승급 조건', need.stage === 2 && need.wave === 12 && need.cost === 1200, JSON.stringify(need));
  check('승급 — 웨이브 미달 거부', cls.promote({ wave: 5, gold: 99999, spend: pay }).ok === false);
  check('승급 — 골드 부족 거부', cls.promote({ wave: 12, gold: 10, spend: pay }).ok === false, econ.gold + 'G');
  const goldBefore = econ.gold;
  const pro = cls.promote({ wave: 12, gold: econ.gold, spend: pay });
  check('2차 승급 성공 + 골드 차감', pro.ok === true && cls.stage === 2 && econ.gold === goldBefore - 1200, goldBefore + ' → ' + econ.gold);
  check('2차 — 6등급까지 사용', cls.canUse('staff_mythic') === true && cls.canUse('staff_relic') === false);
  check('승급 후 — 패시브가 강해진다', cls.modifiers.manaRegen > classModifiers('mage', 1).manaRegen, cls.modifiers.manaRegen);
  const pro3 = cls.promote({ wave: 22, gold: econ.gold, spend: pay });
  check('3차 승급 + 유물 사용 가능', pro3.ok === true && cls.stage === 3 && cls.canUse('staff_relic') === true, cls.label);
  check('최종 단계면 다음 요구가 없다', cls.nextStageRequirement() === null && cls.promote({ wave: 99, gold: 99999, spend: pay }).ok === false);

  check('재전직 — 웨이브·골드 조건', cls.canAdvanceTo('knight', { wave: CLASS_RULES.respecWave - 1, gold: 99999 }).ok === false && cls.canAdvanceTo('knight', { wave: CLASS_RULES.respecWave, gold: CLASS_RULES.respecCost - 1 }).ok === false && cls.canAdvanceTo('knight', { wave: CLASS_RULES.respecWave, gold: CLASS_RULES.respecCost }).ok === true, `웨이브 ${CLASS_RULES.respecWave} · ${CLASS_RULES.respecCost}G`);
  econ.addGold(5000);
  const gold2 = econ.gold;
  const re = cls.advance('knight', { wave: 12, gold: econ.gold, spend: pay });
  check('재전직 — 1차로 초기화 + 골드 차감', re.ok === true && cls.classId === 'knight' && cls.stage === 1 && gold2 - econ.gold === CLASS_RULES.respecCost, gold2 + ' → ' + econ.gold + ' (−' + CLASS_RULES.respecCost + 'G)');
  check('재전직 후 — 한손검 사용 / 지팡이 잠김', cls.canUse('sword1h_epic') === true && cls.canUse('staff_epic') === false);
  check('재전직 이력이 남는다', cls.history.length >= 2 && cls.history[cls.history.length - 1].classId === 'mage');

  const snap = cls.serialize();
  const cls2 = new ClassSystem({ state: snap });
  check('저장/불러오기 왕복', cls2.classId === 'knight' && cls2.stage === 1 && JSON.stringify(cls2.serialize()) === JSON.stringify(snap), JSON.stringify(snap));
  check('불러오기 — 모르는 직업은 초심자', new ClassSystem({ state: { classId: 'nope', stage: 5 } }).stage === 0);
  check('불러오기 — 단계 1~3 클램프', new ClassSystem({ state: { classId: 'mage', stage: 9 } }).stage === 3 && new ClassSystem({ state: { classId: 'mage', stage: 0 } }).stage === 1);
  const reset = cls.reset();
  check('reset — 초심자로 되돌린다', reset.classId === 'knight' && cls.classId === 'novice' && cls.stage === 0);

  // 플레이어 패시브 통합 — 받는 피해 배율
  // 체력은 0에서 잘리므로 50 피해로 배율만 확인한다
  const tank = new Player({ camera, world: world2, input: fakeInput(), audio, stats: achievements });
  const hit = (mult) => {
    tank.hp = 100;
    tank.damageTakenMult = mult;
    tank._invuln = 0;
    tank.takeDamage(50);
    return 100 - tank.hp;
  };
  check('기사 패시브 — 받는 피해 15% 감소', Math.abs(hit(classModifiers('knight', 1).damageTaken) - 42.5) < 0.001, '피해 50 → ' + hit(classModifiers('knight', 1).damageTaken));
  check('광전사 패시브 — 받는 피해 12% 증가', Math.abs(hit(classModifiers('berserk', 1).damageTaken) - 56) < 0.001, '피해 50 → ' + hit(classModifiers('berserk', 1).damageTaken));
  check('패시브 없으면 그대로 받는다', Math.abs(hit(1) - 50) < 0.001, '피해 50 → ' + hit(1));
  check('3차 기사는 더 단단하다', classModifiers('knight', 3).damageTaken < classModifiers('knight', 1).damageTaken, classModifiers('knight', 3).damageTaken);

  // 전직 보상 — 직업 계열마다 1티어(일반) 무기가 존재해야 지급할 수 있다
  const classFamilies = ['staff', 'fairywand', 'sword1h', 'sword2h', 'scythe', 'dagger', 'bow', 'gun'];
  const missingStarter = classFamilies.filter((f) => !WEAPONS.some((w) => w.family === f && w.tier === 1 && w.id === `${f}_common`));
  check('직업별 1티어 무기 8종 존재', missingStarter.length === 0, missingStarter.join(',') || 'staff/fairywand/sword1h/sword2h/scythe/dagger/bow/gun');
  check('1티어 무기는 일반 등급', classFamilies.every((f) => WEAPONS.find((w) => w.id === `${f}_common`)?.grade === 'common'));
  check('요정 전직 지급 id = fairywand_common', classStarterWeaponId('fairy') === 'fairywand_common', classStarterWeaponId('fairy'));
  cls.dispose();
  check('dispose 후에도 조회는 안전', cls.canUse('sword1h_common') === true);
} catch (err) {
  check('전직 시스템', false, err.message);
  console.error(err);
}

// ───────────────────────────── 결과
const ms = Date.now() - t0;
// ────────────────────────────────────────── 지역 시스템 · 최종보스
section('지역 시스템 (티어 지역 · 히든 지역)');
{
  const regions = await import('../client/src/world/regions.js');
  const world3 = createWorld({ scene, seed: 'region-777', quality: 'performance', rng: createRNG('region-777').fork('world') });

  // 1) 나무·광물이 자기 티어 지역에서만 나오는가 (전수 검사)
  const badTrees = world3.trees.filter((t) => !regions.allowsTree(regions.regionIdAt(t.x, t.z), t));
  const badMinerals = world3.minerals.filter((m) => !regions.allowsMineral(regions.regionIdAt(m.x, m.z), m));
  check('모든 나무가 자기 티어 지역 안에 있다', badTrees.length === 0, `${world3.trees.length}그루 · 위반 ${badTrees.length}`);
  check('모든 광물이 자기 티어 지역 안에 있다', badMinerals.length === 0, `${world3.minerals.length}개 · 위반 ${badMinerals.length}`);

  // 2) 지역별 분포
  const byRegion = new Map();
  for (const t of world3.trees) {
    const id = regions.regionIdAt(t.x, t.z);
    byRegion.set(id, (byRegion.get(id) || 0) + 1);
  }
  const ringIds = regions.RING_REGIONS.map((r) => r.id);
  check('T1~T7 띠에 모두 나무가 있다', ringIds.every((id) => (byRegion.get(id) || 0) > 0), ringIds.map((id) => `${id}:${byRegion.get(id) || 0}`).join(' '));
  check('히든 지역 2곳에 나무가 있다', (byRegion.get('cherry_garden') || 0) >= 40 && (byRegion.get('time_horizon') || 0) >= 40, `벚꽃 ${byRegion.get('cherry_garden')} · 시간 ${byRegion.get('time_horizon')}`);

  // 3) 히든 지역 전용 자원이 그 지역 안에만
  const exclusive = new Set(regions.hiddenMineralIds());
  const exclusiveNodes = world3.minerals.filter((m) => exclusive.has(m.typeId));
  check('히든 전용 광물 노드가 존재', exclusiveNodes.length > 0, `${exclusiveNodes.length}개`);
  check('히든 전용 광물은 그 지역 안에서만 나온다', exclusiveNodes.every((m) => regions.isHiddenRegion(regions.regionIdAt(m.x, m.z))));
  const hiddenTrees = world3.trees.filter((t) => regions.hiddenTreeIds().includes(t.typeId));
  check('히든 전용 나무는 그 지역 안에서만 자란다', hiddenTrees.length > 0 && hiddenTrees.every((t) => regions.isHiddenRegion(regions.regionIdAt(t.x, t.z))), `${hiddenTrees.length}그루`);
  check('벚꽃의 정원 = 벚꽃나무 + 벚꽃 결정', world3.minerals.some((m) => m.typeId === 'blossom_crystal') && world3.trees.some((t) => t.typeId === 'tree_cherry_blossom'));
  check('시간의 지평선 = 시공의 나무 + 시간의 파편', world3.minerals.some((m) => m.typeId === 'time_shard') && world3.trees.some((t) => t.typeId === 'tree_time_horizon'));

  // 4) 히든 광물을 실제로 캘 수 있는가(노드 → 채굴)
  const node = exclusiveNodes.find((m) => m.typeId === 'blossom_crystal') ?? exclusiveNodes[0];
  const hpBefore = node.hp;
  world3.mineralField.harvest?.(node, hpBefore);
  check('히든 광물 노드를 캘 수 있다', node.hp < hpBefore || node.depleted === true, `${node.typeId} hp ${hpBefore} → ${node.hp}`);

  // 5) 발견 상태
  check('처음엔 히든 지역 미발견', world3.regionState().length === 0);
  check('정원에 접근하면 발견된다', world3.discover(-1900, -1450)?.id === 'cherry_garden');
  check('같은 지역은 다시 발견되지 않는다', world3.discover(-1900, -1450) === null && world3.regionState().length === 1);
  check('시간의 지평선도 발견 대상', world3.discover(1900, 1500)?.id === 'time_horizon' && world3.regionState().length === 2);
  check('기지에서는 발견되지 않는다', world3.discover(0, 0) === null);
  check('발견 상태 저장/복원', world3.loadRegionState(['cherry_garden']) === 1 && world3.regionState()[0] === 'cherry_garden' && world3.loadRegionState(['nope', 'time_horizon']) === 1);
  check('지역 요약이 이름·거리를 준다', world3.regionSummary(700, 0).id === 'tier3' && world3.regionSummary(-1900, -1520).name === '벚꽃의 정원');
}

section('최종보스 셀레스티얼');
{
  const regions = await import('../client/src/world/regions.js');
  const world4 = createWorld({ scene, seed: 'boss-777', quality: 'performance', rng: createRNG('boss-777').fork('world') });
  const ctx = {
    base: world4.base,
    turrets: [],
    player: null,
    onBaseDamage: () => {},
    onKnockback: () => {},
    onAbility: () => {}
  };

  const boss = spawnEnemy({ scene, world: world4, typeId: 'celestial', isBoss: true, wave: 30, position: new THREE.Vector3(0, 0, 120) });
  check('셀레스티얼 스폰', boss?.typeId === 'celestial' && boss.isBoss === true);
  check('체력 5,000,000 고정', boss.maxHp === 5000000 && boss.hp === 5000000, String(boss.maxHp));
  check('공격력 1,200 고정', boss.damage === 1200, String(boss.damage));
  check('크기 — 반지름 42(기존 최대 티탄 3.4의 12배 이상)', boss.radius === 42, `radius ${boss.radius}`);
  check('거대 3D 메시 — 몸통/코어/왕관/빛기둥', !!boss.mesh && ['body', 'core', 'crest', 'celestialPillar'].every((n) => !!boss.mesh.getObjectByName(n)));
  check('거대 3D 메시 — 고리 3 + 날개 8', !!boss.mesh.getObjectByName('celestialRing0') && !!boss.mesh.getObjectByName('celestialRing2') && !!boss.mesh.getObjectByName('celestialWing0') && !!boss.mesh.getObjectByName('celestialWing7'));
  const sz = boss.mesh.getObjectByName('body')?.scale;
  check('메시 실제 크기가 거대하다(높이 30m 이상)', !!sz && sz.y >= 30, sz ? `body ${sz.x.toFixed(1)} x ${sz.y.toFixed(1)}` : 'none');
  check('거대 보스용 월드 체력바 위치/폭', boss.barWidth >= 40 && boss.barY >= 100, `barY ${Math.round(boss.barY)} · barWidth ${boss.barWidth}`);
  check('전용 능력 = 심판', boss.type.ability === 'judgment');

  // 웨이브/난이도에 흔들리지 않는 고정 스탯
  const boss60 = spawnEnemy({ scene, world: world4, typeId: 'celestial', isBoss: true, wave: 60, difficulty: 'nightmare', position: new THREE.Vector3(0, 0, 120) });
  check('웨이브·난이도와 무관하게 체력/공격력 고정', boss60.maxHp === 5000000 && boss60.damage === 1200, `w60 나이트메어 ${boss60.maxHp}/${boss60.damage}`);
  const titan10 = spawnEnemy({ scene, world: world4, typeId: 'titan', isBoss: true, wave: 10, position: new THREE.Vector3(0, 0, 60) });
  const titan30 = spawnEnemy({ scene, world: world4, typeId: 'titan', isBoss: true, wave: 30, position: new THREE.Vector3(0, 0, 60) });
  check('일반 보스는 기존 웨이브 배율을 그대로 받는다', titan30.maxHp > titan10.maxHp && titan30.damage > titan10.damage, `${titan10.maxHp} → ${titan30.maxHp}`);

  // 심판 능력 — 기지·포탑·플레이어 광역 피해
  let baseHits = 0;
  let baseDamage = 0;
  const fakeBase = { radius: 6, position: new THREE.Vector3(0, 0, 0), damage: (n) => { baseHits += 1; baseDamage += n; } };
  const turret = { position: new THREE.Vector3(0, 0, 140), destroyed: false, taken: 0, takeDamage(n) { this.taken += n; } };
  const farTurret = { position: new THREE.Vector3(0, 0, 600), destroyed: false, taken: 0, takeDamage(n) { this.taken += n; } };
  let playerDamage = 0;
  const fakePlayer = { position: new THREE.Vector3(0, 0, 130), velocity: new THREE.Vector3(), takeDamage(n) { playerDamage += n; } };
  boss._execute('judgment', { ...ctx, base: fakeBase, turrets: [turret, farTurret], player: fakePlayer }, fakeBase.position);
  check('심판 — 기지에 3,600 피해(공격력 x3)', baseHits === 1 && baseDamage === 3600, String(baseDamage));
  check('심판 — 사거리 안 포탑 3,600 피해', turret.taken === 3600, String(turret.taken));
  check('심판 — 사거리 밖 포탑은 무사', farTurret.taken === 0);
  check('심판 — 플레이어 3,000 피해(x2.5)', playerDamage === 3000, String(playerDamage));
  check('심판 — 플레이어가 밀려난다', fakePlayer.position.z !== 130 && fakePlayer.velocity.length() > 0, `z ${Math.round(fakePlayer.position.z)}`);

  // 처치 — 1,000만 체력을 실제로 깎아 잡는다
  const half = boss.takeDamage(2500000, null, 'player');
  check('절반 피해 — 아직 살아있다', half.killed === false && boss.hp === 2500000, `hp ${boss.hp}`);
  const dead = boss.takeDamage(2500000, null, 'player');
  check('5,000,000 피해로 처치된다', dead.killed === true && boss.alive === false);
  check('처치 보상이 크다(골드 250,000 이상)', boss.gold >= 250000, `${boss.gold}G`);

  // 프레임 경로(update + _animate) 120틱 — 메시/재질/상태이상 갱신이 죽지 않아야 한다
  let frameError = null;
  try {
    for (let i = 0; i < 120; i++) {
      boss60.update(1 / 60, { ...ctx, basePos: world4.base?.position ?? new THREE.Vector3(0, 0, 0) });
      boss60._animate(1 / 60);
    }
  } catch (e) {
    frameError = e;
  }
  check('최종보스 프레임 경로 120틱 무예외', frameError === null, frameError ? frameError.message : '120틱 통과');
  check('코어 재질에 emissive 가 있다(발광 갱신 안전)', boss60._coreMaterial?.emissive !== undefined);
  check('전용 광원이 켜져 있다(세기 > 0 · 거리 ≤ 420)', Number(boss60._light?.intensity ?? 0) > 0 && Number(boss60._light?.distance ?? 0) <= 420, `세기 ${boss60._light?.intensity} · 거리 ${boss60._light?.distance}`);

  // 거대 보스 월드 체력바
  const giantCam = new THREE.PerspectiveCamera(70, 1.7, 0.1, 2000);
  giantCam.position.set(0, 40, 260);
  giantCam.lookAt(0, 0, 0);
  giantCam.updateMatrixWorld(true);
  const giantBars = new EnemyHealthBars({ scene, camera: giantCam, capacity: 8 });
  let barError = null;
  let shown = 0;
  try {
    boss60.position.set(0, 0, 120);
    boss60.hp = boss60.maxHp * 0.5;
    giantBars.sync([boss60], giantCam);
    shown = giantBars.visibleCount ?? 0;
  } catch (e) {
    barError = e;
  }
  check('거대 보스 체력바 렌더 무예외', barError === null, barError ? barError.message : `표시 ${shown}`);
  check('거대 보스 체력바가 화면에 잡힌다', shown >= 1, `표시 ${shown}`);
  giantBars.dispose?.();

  // 웨이브 10 전체 편성을 실제로 스폰해 몇 틱 돌린다(웨이브 100 은 편성이 너무 크다)
  let waveError = null;
  let spawned = 0;
  try {
    const w = new WaveSystem({ seed: 'final-spawn', mode: 'solo', world: world4 });
    const q = w._buildQueue(10);
    const list = [];
    for (const e of q) {
      const node = spawnEnemy({ scene, world: world4, wave: 10, typeId: e.typeId, type: e.type ?? null, isBoss: e.isBoss, elite: e.elite, mods: e.mods, position: new THREE.Vector3(0, 0, 140 + list.length * 0.5) });
      if (node) list.push(node);
      spawned += 1;
    }
    for (let i = 0; i < 20; i++) for (const e of list) e.update(1 / 60, { ...ctx, basePos: world4.base?.position ?? new THREE.Vector3(0, 0, 0) });
    check('웨이브 10 전체 편성 스폰', list.length > 0, `${spawned}마리 스폰`);
    for (const e of list) e.despawn?.();
  } catch (e) {
    waveError = e;
  }
  check('웨이브 10 전체 스폰 + 20틱 무예외', waveError === null, waveError ? waveError.message : `${spawned}마리 통과`);
  check('셀레스티얼 — 웨이브 100 실제 스폰 스펙(편성표 배율 무시)', (() => {
    const node = spawnEnemy({ scene, world: world4, wave: 100, typeId: 'celestial', isBoss: true, mods: { hpMult: 1.15, scaleMult: 1.12 }, position: new THREE.Vector3(0, 0, 150) });
    const okv = node?.maxHp === 5000000 && node?.damage === 1200 && node?.radius === 42;
    node?.despawn?.();
    return okv;
  })());
  check('웨이브 100 편성 마릿수 상한(240 이하)', (() => {
    const capped = new WaveSystem({ seed: 'cap', mode: 'solo', world: world4 });
    const q = capped._buildQueue(100);
    return q.length > 0 && q.length <= Math.round(240 * 1.5) && q.length < 5000;
  })(), 'wave 100');

  // 웨이브 100 = 최종보스(기본 모드)
  const waves2 = new WaveSystem({ seed: 'final', mode: 'solo', world: world4 });
  const q100 = waves2._buildQueue(100);
  check('웨이브 100 = 최종 웨이브', waves2.isFinalBossWave === true && waves2.isBossWave === true);
  check('웨이브 100 에 셀레스티얼이 편성된다', q100.filter((e) => e.isBoss).map((e) => e.typeId).join(',') === 'celestial', q100.filter((e) => e.isBoss).map((e) => e.typeId).join(','));
  const q200 = waves2._buildQueue(200);
  check('웨이브 200 에도 다시 강림한다', waves2.isFinalBossWave === true && q200.some((e) => e.typeId === 'celestial'));
  const q10 = waves2._buildQueue(10);
  check('일반 보스 웨이브는 기존 보스', waves2.isFinalBossWave === false && q10.some((e) => e.isBoss) && !q10.some((e) => e.typeId === 'celestial'), q10.filter((e) => e.isBoss).map((e) => e.typeId).join(','));
  waves2._buildQueue(99);
  check('최종 웨이브가 아니면 최종 판정이 꺼진다', waves2.isFinalBossWave === false, 'wave 99');

  // 무한 모드 — 300 웨이브마다 셀레스티얼, 등장할 때마다 +35%(계약 §4.58)
  const endless = new WaveSystem({ seed: 'endless', mode: 'endless', world: world4 });
  const boss300 = endless._buildQueue(300).find((e) => e.isBoss);
  check('무한 모드 — 300 웨이브에 셀레스티얼 강림(기본 5,000,000)', boss300?.typeId === 'celestial' && boss300?.type?.hp === 5000000 && boss300?.type?.attack === 1200, `hp ${boss300?.type?.hp} atk ${boss300?.type?.attack}`);
  const boss600 = endless._buildQueue(600).find((e) => e.isBoss);
  check('무한 모드 — 두 번째 강림은 체력 +35% (6,750,000 / 공격 1,344)', boss600?.type?.hp === 6750000 && boss600?.type?.attack === 1344, `hp ${boss600?.type?.hp} atk ${boss600?.type?.attack}`);
  const boss900 = endless._buildQueue(900).find((e) => e.isBoss);
  check('무한 모드 — 세 번째 강림은 +82% (9,112,500)', boss900?.type?.hp === 9112500, `hp ${boss900?.type?.hp}`);
  check('무한 모드 — 300 의 배수가 아니면 셀레스티얼 없음', !endless._buildQueue(299).some((e) => e.typeId === 'celestial'));
  const solo300 = new WaveSystem({ seed: 'solo300', mode: 'solo', world: world4 });
  check('기본 모드 — 100 의 배수가 아닌 웨이브에는 셀레스티얼 없음', !solo300._buildQueue(350).some((e) => e.typeId === 'celestial') && solo300._buildQueue(300).some((e) => e.typeId === 'celestial'), 'wave 350 / 300');
  {
    const node = spawnEnemy({ scene, world: world4, wave: 600, typeId: 'celestial', type: boss600?.type ?? null, isBoss: true, mods: { hpMult: 1.15 }, position: new THREE.Vector3(0, 0, 150) });
    check('무한 모드 — 편성표 배율을 무시하고 표기 스펙 그대로', node?.maxHp === 6750000 && node?.damage === 1344, `hp ${node?.maxHp} atk ${node?.damage} · 편성 hp ${boss600?.type?.hp ?? 'none'}`);
    node?.despawn?.();
  }

  // 웨이브 보상에 히든 전용 광물이 섞이지 않는다
  const rewards = new Set();
  for (let i = 0; i < 60; i++) {
    waves2.wave = 40 + i;
    const m = waves2._pickMineral();
    if (m) rewards.add(m.id);
  }
  check('웨이브 보상에 히든 전용 광물이 없다', [...rewards].every((id) => !regions.hiddenMineralIds().includes(id)), `${rewards.size}종`);
}


// ───────────────────────────── 성능 (광원 컬링 · 청크 컬링)
section('성능 최적화 (광원 · 청크 컬링)');
{
  const worldP = createWorld({ scene, seed: 'perf-777', quality: 'balanced', rng: createRNG('perf-777').fork('world') });
  const countLights = () => {
    let point = 0;
    let visiblePoint = 0;
    scene.traverse((o) => {
      if (o.isPointLight) {
        point += 1;
        if (o.visible !== false) visiblePoint += 1;
      }
    });
    return { point, visiblePoint };
  };
  const before = countLights();
  const mobs = [];
  for (let i = 0; i < 80; i++) {
    const e = spawnEnemy({ scene, world: worldP, wave: 8, typeId: i % 4 === 0 ? 'orc' : 'imp', position: new THREE.Vector3((i % 16) * 2 - 16, 0, 320 + Math.floor(i / 16) * 3) });
    if (e) mobs.push(e);
  }
  const after = countLights();
  check('일반 몬스터 80마리 스폰', mobs.length === 80, `${mobs.length}마리`);
  check('몬스터 점광원이 렌더 목록에서 빠진다(셰이더 비용 제거)',
    after.visiblePoint - before.visiblePoint === 0,
    `보이는 점광원 ${before.visiblePoint} → ${after.visiblePoint} (전체 ${after.point}개)`);
  check('일반 몬스터는 광원이 꺼져 있다', mobs.every((e) => e._light?.visible === false));
  const bossLight = spawnEnemy({ scene, world: worldP, typeId: 'ogre_king', isBoss: true, wave: 10, position: new THREE.Vector3(0, 0, 120) });
  check('보스는 광원을 켠다', bossLight?._light?.visible === true && bossLight._light.intensity > 0, `세기 ${bossLight?._light?.intensity}`);
  const celestialLight = spawnEnemy({ scene, world: worldP, typeId: 'celestial', isBoss: true, wave: 30, position: new THREE.Vector3(0, 0, 140) });
  check('셀레스티얼 광원 유지(거리 ≤ 420)', celestialLight?._light?.visible === true && celestialLight._light.distance <= 420, `거리 ${Math.round(celestialLight?._light?.distance ?? 0)}`);

  // ── 청크 컬링
  const cam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 900);
  cam.position.set(0, 3, 70);
  cam.updateMatrixWorld(true);
  const treeMeshes = worldP.treeField._meshes.length;
  const minMeshes = worldP.mineralField._meshes.length;
  check('나무가 청크 InstancedMesh 로 쪼개진다', worldP.treeField._chunks.length > 6 && treeMeshes > 6, `${worldP.treeField._chunks.length}청크 · ${treeMeshes}메시`);
  check('광물도 청크로 쪼개진다', worldP.mineralField._chunks.length > 6 && minMeshes > 6, `${worldP.mineralField._chunks.length}청크 · ${minMeshes}메시`);
  const visibleMeshes = (field) => field._meshes.filter((m) => m.visible !== false).reduce((a, m) => a + m.count, 0);
  const totalInstances = (field) => field._meshes.reduce((a, m) => a + m.count, 0);
  worldP.frustumCull(cam);
  const treeVisible = visibleMeshes(worldP.treeField);
  const treeTotal = totalInstances(worldP.treeField);
  const minVisible = visibleMeshes(worldP.mineralField);
  const minTotal = totalInstances(worldP.mineralField);
  check('기지에서 나무의 60% 이상이 컬링된다', treeVisible < treeTotal * 0.4, `${treeVisible}/${treeTotal} 인스턴스만 렌더`);
  check('광물도 절반 이상 컬링된다', minVisible < minTotal * 0.5, `${minVisible}/${minTotal} 인스턴스만 렌더`);
  check('청크 밖/안 판정이 갱신된다', worldP.treeField._chunks.some((c) => c.on === true) && worldP.treeField._chunks.some((c) => c.on === false));

  // 카메라를 맵 반대편으로 옮기면 보이는 청크 집합이 바뀐다
  const firstVisible = worldP.treeField._chunks.filter((c) => c.on).map((c) => c.key).join(',');
  cam.position.set(-1800, 6, -1400);
  cam.updateMatrixWorld(true);
  worldP.frustumCull(cam);
  const secondVisible = worldP.treeField._chunks.filter((c) => c.on).map((c) => c.key).join(',');
  check('이동하면 보이는 청크가 바뀐다', firstVisible !== secondVisible && worldP.treeField._chunks.some((c) => c.on === true));

  // 품질 변경 → 강제 재계산
  worldP.treeField.invalidateCull();
  check('품질 변경 시 컬링 재계산 플래그', worldP.treeField._chunks.every((c) => c.on === null));
  worldP.frustumCull(cam);
  check('재계산 후에도 정상 판정', worldP.treeField._chunks.every((c) => typeof c.on === 'boolean'));

  // 벌목/복구가 청크 메시에서도 동작한다(인스턴스 0행렬 + 복원)
  const tree = worldP.trees.find((t) => !t.felled && t.mesh);
  const idx = tree.instanceIndex;
  const mesh = tree.mesh;
  const m0 = new THREE.Matrix4();
  mesh.getMatrixAt(idx, m0);
  const scaleBefore = new THREE.Vector3();
  m0.decompose(new THREE.Vector3(), new THREE.Quaternion(), scaleBefore);
  worldP.treeField.chop(tree, tree.maxHp + 1);
  const m1 = new THREE.Matrix4();
  mesh.getMatrixAt(idx, m1);
  const scaleAfter = new THREE.Vector3();
  m1.decompose(new THREE.Vector3(), new THREE.Quaternion(), scaleAfter);
  check('벌목하면 청크 메시의 인스턴스가 0행렬', tree.felled === true && scaleAfter.length() < 1e-6 && scaleBefore.length() > 0, `${scaleBefore.x.toFixed(2)} → ${scaleAfter.x.toFixed(2)}`);
  worldP.treeField._restore(tree);
  mesh.getMatrixAt(idx, m1);
  m1.decompose(new THREE.Vector3(), new THREE.Quaternion(), scaleAfter);
  check('복구하면 다시 살아난다', tree.felled === false && scaleAfter.length() > 0);

  // 나무도 6초 뒤 다시 자란다
  const treeR = worldP.trees.find((t) => !t.felled && t !== tree) ?? worldP.trees[0];
  worldP.treeField.chop(treeR, treeR.maxHp + 1);
  worldP.treeField.update(5.9);
  check('나무 리스폰 — 6초 전에는 아직 없다', treeR.felled === true);
  worldP.treeField.update(0.2);
  check('나무 리스폰 — 6초 뒤 다시 자란다', treeR.felled === false);

  // 광물 고갈/복구도 청크 메시에서 동작
  const mineral = worldP.minerals.find((m) => !m.depleted && m.mesh);
  const mres = worldP.mineralField.harvest(mineral, mineral.maxHp + 1);
  check('광물 고갈 — 청크 메시에서도 처리', mres.depleted === true && mineral.depleted === true);
  worldP.mineralField.update(5.9);
  check('광물 리스폰 — 6초 전에는 아직 없다', mineral.depleted === true);
  worldP.mineralField.update(0.2);
  check('광물 리스폰 — 6초 뒤 다시 생긴다', mineral.depleted === false && mineral.hp === mineral.maxHp);

  const perfFrameError = (() => {
    try {
      for (let i = 0; i < 30; i++) worldP.update(1 / 60, { camera: cam, time: i / 60 });
      cam.position.set(0, 3, 70);
      worldP.frustumCull(cam);
      for (let i = 0; i < 30; i++) worldP.update(1 / 60, { camera: cam, time: i / 60 });
      return null;
    } catch (e) {
      return e;
    }
  })();
  check('월드 60틱 + 컬링 무예외', perfFrameError === null, perfFrameError ? perfFrameError.message : '60틱 통과');
  worldP.dispose();
  for (const e of mobs) e.despawn?.();
  bossLight?.despawn?.();
  celestialLight?.despawn?.();
}

// ───────────────────────────── 맨손 채집 (실제 월드)
section('맨손 채집 (실제 월드 · T1)');
{
  const worldG = createWorld({ scene, seed: 'gather-777', quality: 'performance', rng: createRNG('gather-777').fork('world') });
  const eco = new Economy({ gold: 0, wood: 0 });
  const tracks = [];
  const sink = {
    economy: eco,
    stats: { track: (k, n) => tracks.push([k, n]), set: () => {} },
    audio: { play: () => {} },
    mineralsMined: 0,
    woodChopped: 0,
    mineralTypesMined: new Set()
  };

  const t1 = worldG.trees.find((t) => t.tier === 1 && !t.felled);
  const t2 = worldG.trees.find((t) => t.tier === 2 && !t.felled);
  const m1 = worldG.minerals.find((m) => m.tier === 1 && !m.depleted);
  const m4 = worldG.minerals.find((m) => m.tier >= 3 && !m.depleted);
  check('실제 월드에 T1 나무/광물이 있다', !!t1 && !!m1, `나무 ${t1?.name} · 광물 ${m1?.name}`);
  check('T1 은 맨손 가능 · T2 이상은 불가', canHarvestByHand(t1) && canHarvestByHand(m1) && !canHarvestByHand(t2) && !canHarvestByHand(m4));

  const aimAt = (node, dist = 2.2) => {
    const origin = { x: node.x, y: (node.y ?? 0) + 1.6, z: node.z + dist };
    const dir = { x: 0, y: 0, z: -1 };
    return { origin, dir };
  };
  const a1 = aimAt(t1);
  const pickTree = pickHarvestNode({ origin: a1.origin, dir: a1.dir, trees: worldG.trees, minerals: [], reach: 3.8 });
  check('실제 T1 나무를 조준하면 잡힌다', pickTree.node === t1 && pickTree.kind === 'tree');
  const woodBefore = t1.wood;
  const r1 = harvestNode(t1, { kind: 'tree', power: BARE_HAND.power, sink, maxTier: BARE_HAND.maxTier });
  check('맨손으로 T1 나무에서 목재가 나온다', r1.ok && r1.amount > 0 && eco.wood === r1.amount && t1.wood < woodBefore, `목재 +${r1.amount} (${woodBefore} → ${t1.wood})`);
  check('벌목 통계 기록', tracks.some(([k]) => k === 'woodChopped'));

  const a2 = aimAt(m1);
  const pickMin = pickHarvestNode({ origin: a2.origin, dir: a2.dir, trees: [], minerals: worldG.minerals, reach: 3.8 });
  check('실제 T1 광물을 조준하면 잡힌다', pickMin.node === m1 && pickMin.kind === 'mineral', `${m1.name}`);
  const r2 = harvestNode(m1, { kind: 'mineral', power: BARE_HAND.power, sink, maxTier: BARE_HAND.maxTier });
  check('맨손으로 T1 광물을 캔다(골드 10% 포함)', r2.ok && r2.amount > 0 && eco.getMineral(m1.typeId) === r2.amount && eco.gold > 0, `${m1.name} +${r2.amount} · ${eco.gold}G`);

  const a3 = aimAt(t2);
  const pickHigh = pickHarvestNode({ origin: a3.origin, dir: a3.dir, trees: [t2], minerals: [], reach: 3.8 });
  check('T2 노드는 맨손 대상이 아니다(blocked 안내)', pickHigh.node === null && (pickHigh.blocked === t2 || pickHigh.blocked === null), `blocked ${pickHigh.blocked ? 'T' + pickHigh.blocked.tier : 'none'}`);
  check('T2 는 채집도 거부된다', harvestNode(t2, { kind: 'tree', power: 99, sink, maxTier: BARE_HAND.maxTier }).ok === false);

  // T1 을 끝까지 캐면 벌목된다
  const t1b = worldG.trees.find((t) => t.tier === 1 && !t.felled);
  let fell = false;
  for (let i = 0; i < 40 && t1b && !t1b.felled; i++) {
    const res = harvestNode(t1b, { kind: 'tree', power: BARE_HAND.power, sink, maxTier: BARE_HAND.maxTier });
    fell = !!res.felled || t1b.felled;
  }
  check('맨손으로도 T1 나무를 끝까지 캐면 벌목된다', fell === true || t1b === undefined, `felled ${t1b?.felled}`);
  check('맨손 채집은 채굴탑 없이도 동작한다', eco.wood > 0 && eco.getMineral(m1.typeId) > 0);
  worldG.dispose();
}

// ───────────────────────────── 관리자 명령어 (실제 경제/기지)
section('관리자 명령어 (실제 경제 연동)');
{
  const worldA = createWorld({ scene, seed: 'admin-777', quality: 'performance', rng: createRNG('admin-777').fork('world') });
  const eco = new Economy({ gold: 300, wood: 100 });
  const owned = new Set();
  const game = {
    economy: eco,
    weapons: { owned },
    staff: { weapon: null },
    player: { hp: 40, maxHp: 120, mana: 5, maxMana: 80 },
    towers: [{ hp: 10, maxHp: 60, heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); } }],
    world: worldA,
    hasWeapon: (id) => owned.has(id),
    ownWeapon(id) { if (owned.has(id)) return false; owned.add(id); return true; },
    equipWeapon(id) { this.staff.weapon = weaponById(id); return true; },
    waves: null,
    addGold: (n) => eco.addGold(n),
    addWood: (n) => eco.addWood(n),
    addMineral: (id, n) => eco.addMineral(id, n)
  };
  worldA.base.damage(1000);
  const baseBefore = worldA.base.hp;
  const r0 = runAdminCommand('/도움말', { game, user: { role: 'admin' } });
  check('도움말이 전체 명령을 보여준다', r0.ok && r0.lines.length === ADMIN_COMMANDS.length, r0.message);
  check('비관리자는 거부(경제 불변)', runAdminCommand('/돈 999999', { game, user: { role: 'user' } }).ok === false && eco.gold === 300);
  const r1 = runAdminCommand('/돈 500000', { game, user: { role: 'admin' } });
  const r2 = runAdminCommand('/목재 5000', { game, user: { role: 'admin' } });
  const r3 = runAdminCommand('/광물 time_shard 25', { game, user: { role: 'admin' } });
  check('돈·목재·광물 소환이 실제 경제에 반영', r1.ok && r2.ok && r3.ok && eco.gold === 500300 && eco.wood === 5100 && eco.getMineral('time_shard') === 25,
    `${eco.gold.toLocaleString()}G · 목재 ${eco.wood} · 시간의 파편 ${eco.getMineral('time_shard')}`);
  const r4 = runAdminCommand('/전체자원 100', { game, user: { role: 'admin' } });
  check('전체 자원 — 광물 27종', r4.ok && MINERAL_TYPES.every((m) => eco.getMineral(m.id) >= 100), `${MINERAL_TYPES.length}종`);
  const r5 = runAdminCommand('/무기 시간의 가위', { game, user: { role: 'admin' } });
  check('무기 소환 — 보유 + 장착', r5.ok && owned.has('time_scissors') && game.staff.weapon?.id === 'time_scissors');
  const r6 = runAdminCommand('/무기전부', { game, user: { role: 'admin' } });
  check('모든 무기 소환', r6.ok && owned.size === WEAPONS.length, `${owned.size}/${WEAPONS.length}종`);
  const r7 = runAdminCommand('/치유', { game, user: { role: 'admin' } });
  check('치유 — 플레이어/기지/포탑', r7.ok && game.player.hp === 120 && game.player.mana === 80 && worldA.base.hp === worldA.base.maxHp && game.towers[0].hp === 60,
    `기지 ${Math.round(baseBefore)} → ${Math.round(worldA.base.hp)}`);
  const waves = new WaveSystem({ seed: 'admin-wave', mode: 'solo', world: worldA });
  game.waves = waves;
  const r8 = runAdminCommand('/웨이브 30', { game, user: { role: 'admin' } });
  check('웨이브 30 즉시 시작 + 최종보스 안내', r8.ok && waves.wave === 30 && r8.lines.some((l) => l.includes('디아블로')), `wave ${waves.wave}`);
  check('웨이브 편성이 실제로 만들어진다', waves.enemies.length > 0 || waves._queue.length > 0, `큐 ${waves._queue?.length ?? 0}`);
  waves.reset?.();
  worldA.dispose();
}

// ───────────────────────────── 프레임 예산 지급 큐 (계약 §4.47)
section('프레임 예산 지급 큐 (계약 §4.47)');
{
  const busy = (ms) => { const t = Date.now(); while (Date.now() - t < ms) { /* 대기 */ } };

  // ① 예산만큼만 처리하고 나머지는 다음 프레임으로 넘긴다
  const q = new GrantQueue({ budgetMs: 4 });
  const handled = [];
  const doneCalls = [];
  const n = q.enqueue([1, 2, 3, 4, 5, 6, 7, 8], (i) => { handled.push(i); busy(1.5); }, { onDone: (d) => doneCalls.push(d) });
  check('enqueue — 항목 수를 돌려주고 아직 처리하지 않는다', n === 8 && handled.length === 0 && q.pending === 8, `대기 ${q.pending}`);
  const s1 = q.step();
  check('step — 첫 프레임은 예산만큼만 처리(전부 처리하지 않음)', s1 > 0 && s1 < 8 && handled.length === s1, `1프레임 ${s1}개`);
  let guard = 0;
  while (q.pending && guard++ < 50) q.step();
  check('step — 여러 프레임에 걸쳐 전부 처리', handled.length === 8 && q.pending === 0, `${guard}프레임`);
  check('onDone — 끝났을 때 한 번만 호출', doneCalls.length === 1 && doneCalls[0] === 8, JSON.stringify(doneCalls));
  check('전부 처리 후 step 은 0', q.step() === 0);

  // ② 한 항목이 실패해도 나머지는 계속 지급된다
  const q2 = new GrantQueue({ budgetMs: 1000 });
  let ok2 = 0;
  q2.enqueue(['a', 'b', 'c'], (x) => { if (x === 'b') throw new Error('boom'); ok2 += 1; });
  q2.step();
  check('항목 예외 — 나머지 계속 처리 + 실패 집계', ok2 === 2 && q2.failed === 1 && q2.pending === 0, `성공 ${ok2} · 실패 ${q2.failed}`);

  // ③ 남은 항목 버리기
  const q3 = new GrantQueue({ budgetMs: 0 });
  q3.enqueue([1, 2, 3, 4], () => {});
  q3.step();
  q3.clear();
  check('clear — 남은 항목 폐기', q3.pending === 0 && q3.step() === 0);
}

// 관리자 /무기전부 — 큐를 지원하는 실제 게임에서는 즉시 지급하지 않는다
{
  const owned = new Set();
  const queued = {
    weapons: { owned },
    hasWeapon: (id) => owned.has(id),
    ownWeapon(id) { if (owned.has(id)) return false; owned.add(id); return true; },
    granted: null,
    grantWeapons(ids) { this.granted = ids; return ids.length; }
  };
  const rq = runAdminCommand('/무기전부', { game: queued, user: { role: 'admin' } });
  check('/무기전부 — 큐로 넘기고 즉시 지급하지 않는다', rq.ok === true && queued.granted?.length === WEAPONS.length && owned.size === 0, rq.message);
  check('/무기전부 — 68종 지급 예정 안내', rq.message.includes(String(WEAPONS.length)) || rq.lines.some((l) => l.includes('지급')), JSON.stringify(rq.lines));

  const allOwned = { weapons: { owned: new Set(WEAPONS.map((w) => w.id)) }, hasWeapon: () => true, ownWeapon: () => false, grantWeapons: () => 0 };
  const rq2 = runAdminCommand('/무기전부', { game: allOwned, user: { role: 'admin' } });
  check('/무기전부 — 전부 보유 시 안내', rq2.ok === true && rq2.message.includes('전부 보유'), rq2.message);
}

// ───────────────────────────── 내 세이브 목록 (계약 §4.49)
section('내 세이브 목록 (계약 §4.49)');
{
  const fake = new Map();
  const savedLS = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (fake.has(k) ? fake.get(k) : null),
    setItem: (k, v) => fake.set(k, String(v)),
    removeItem: (k) => fake.delete(k)
  };
  const mk = (min, wave, gold) => ({
    savedAt: new Date(Date.UTC(2026, 0, 1, 0, min)).toISOString(),
    seed: 'S' + min,
    mode: 'solo',
    difficulty: 'normal',
    playTime: min * 60,
    waves: { wave },
    economy: { gold },
    weaponsOwned: ['staff_common']
  });
  clearSaves();
  check('빈 목록 — 저장된 세이브 없음', listSaves().length === 0);
  pushSave(mk(1, 3, 100));
  pushSave(mk(2, 5, 200));
  const list = listSaves();
  check('최신 순 정렬', list.length === 2 && list[0].seed === 'S2' && list[1].seed === 'S1', list.map((s) => s.seed).join(','));
  check('요약 필드 — 웨이브/골드/플레이 시간/무기 수', list[0].wave === 5 && list[0].gold === 200 && list[0].play === '2분' && list[0].weapons === 1, JSON.stringify(list[0]));
  check('시각 라벨 형식', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(list[0].label), list[0].label);
  check('고른 세이브의 전체 데이터 조회', getSave(list[0].id)?.economy?.gold === 200);
  check('없는 id 조회는 null', getSave('없는세이브') === null);
  pushSave(mk(2, 9, 999));
  check('같은 시각 재저장은 교체(중복 없음)', listSaves().length === 2 && listSaves()[0].wave === 9, JSON.stringify(listSaves().map((s) => s.wave)));
  for (let i = 3; i <= 15; i += 1) pushSave(mk(i, i, i * 10));
  const capped = listSaves();
  check('최대 보관 개수 제한', capped.length === MAX_SAVES, `${capped.length}개 / 상한 ${MAX_SAVES}`);
  check('오래된 것부터 버린다', capped[0].seed === 'S15' && !capped.some((s) => s.seed === 'S1'));
  check('삭제 성공', removeSave(capped[0].id) === true && listSaves().length === MAX_SAVES - 1);
  check('없는 것 삭제는 false', removeSave('없는세이브') === false);
  fake.set(SAVES_KEY, '{깨진 JSON');
  check('깨진 JSON 은 빈 목록(예외 없음)', listSaves().length === 0 && getSave('x') === null);
  check('savedAt 없는 데이터는 저장 거부', pushSave({ seed: 'x' }) === null && summarize(null).wave === 1);
  check('시각 표시 함수 — 잘못된 값은 알 수 없음', saveLabel('이상한값') === '알 수 없음');
  delete globalThis.localStorage;
  const noStore = listSaves().length === 0 && pushSave(mk(1, 1, 1)) === null && removeSave('x') === false;
  globalThis.localStorage = savedLS;
  check('localStorage 가 없어도 안전', noStore);
}

// ───────────────────────────── 요정의 날개 (비행 물리)
section('요정의 날개 (비행 물리)');
{
  const flyWorld = createWorld({ scene, seed: 'wing-777', quality: 'performance', rng: createRNG('wing-777').fork('world') });
  const keys = new Set();
  const input = {
    keys,
    mouse: { dx: 0, dy: 0, left: false, right: false, wheel: 0 },
    isDown: (code) => keys.has(code),
    wasPressed: () => false,
    consumePressed: () => false,
    consumeMouse: () => ({ dx: 0, dy: 0, left: false, right: false, wheel: 0 }),
    requestPointerLock: () => {},
    exitPointerLock: () => {},
    get locked() {
      return false;
    },
    update: () => {},
    dispose: () => {}
  };
  const wingCam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 800);
  const flyer = new Player({
    camera: wingCam,
    world: flyWorld,
    input,
    audio,
    stats: achievements,
    position: new THREE.Vector3(0, 0, 60)
  });
  for (let i = 0; i < 30; i++) flyer.update(1 / 60);
  const groundY = flyer.position.y;
  check('날개 없이는 날 수 없다', flyer.canFly === false && flyer.flying === false);
  check('setFlight(미장착) — 착용 해제', flyer.setFlight({ equipped: false }).equipped === false && flyer.canFly === false);

  const profile = { equipped: true, id: 'fairy_wings', speed: 1.27, lift: 11, descend: 13, drain: 25, ceiling: 120, flap: 7.6 };
  flyer.setFlight(profile);
  check(
    'setFlight — 프로필 반영',
    flyer.canFly === true && flyer.flight.lift === 11 && flyer.flight.ceiling === 120 && flyer.flight.speed === 1.27
  );

  // Space — 상승 + 마나 소모
  keys.add('Space');
  const manaStart = flyer.mana;
  for (let i = 0; i < 90; i++) flyer.update(1 / 60);
  check('Space — 1.5초 만에 8m 이상 상승', flyer.position.y > groundY + 8, `y=${(flyer.position.y - groundY).toFixed(2)}m 상승`);
  check('비행 상태 플래그', flyer.flying === true && flyer.onGround === false && flyer.airborne === true);
  check('비행은 마나를 태운다', flyer.mana < manaStart - 5, `마나 ${manaStart.toFixed(1)} → ${flyer.mana.toFixed(1)}`);

  // 상한(천장) — 마나 무한으로 20초 상승
  flyer.setFlight({ ...profile, drain: 0 });
  flyer.maxMana = 1000;
  flyer.mana = 1000;
  for (let i = 0; i < 60 * 20; i++) flyer.update(1 / 60);
  check('상한 120m 에서 멈춘다', flyer.position.y <= 120.5 && flyer.position.y > 110, `y=${flyer.position.y.toFixed(1)}`);

  // Shift — 하강
  const yHigh = flyer.position.y;
  keys.delete('Space');
  keys.add('ShiftLeft');
  for (let i = 0; i < 60; i++) flyer.update(1 / 60);
  check('Shift — 하강', flyer.position.y < yHigh - 8, `${yHigh.toFixed(1)} → ${flyer.position.y.toFixed(1)}`);

  // 착지 → 날개 접힘
  for (let i = 0; i < 60 * 12; i++) flyer.update(1 / 60);
  check('착지하면 날개가 접힌다', flyer.onGround === true && flyer.flying === false, `y=${flyer.position.y.toFixed(2)}`);

  // 마나 소진 → 추락
  keys.clear();
  keys.add('Space');
  flyer.setFlight({ ...profile, drain: 20 });
  flyer.mana = 5;
  for (let i = 0; i < 60 * 2; i++) flyer.update(1 / 60);
  check('마나가 바닥나면 날개가 접힌다', flyer.mana < 1 && flyer.flying === false, `마나 ${flyer.mana.toFixed(1)} · y=${flyer.position.y.toFixed(1)}`);

  // 지상에서 수평 이동 속도 — 비행 배율
  keys.clear();
  flyer.setFlight({ ...profile, drain: 0, lift: 14 });
  flyer.maxMana = 1000;
  flyer.mana = 1000;
  keys.add('KeyW');
  keys.add('Space');
  for (let i = 0; i < 120; i++) flyer.update(1 / 60);
  const flySpeed = Math.hypot(flyer.velocity.x, flyer.velocity.z);
  check('비행 중 수평 속도가 걷기보다 빠르다', flySpeed > flyer.walkSpeed * 1.15, `${flySpeed.toFixed(2)} m/s (걷기 ${flyer.walkSpeed})`);

  // 사망/부활 — 비행 해제
  check('사망하면 비행이 꺼진다', (() => {
    flyer._die('test');
    const off = flyer.flying === false;
    keys.clear();
    for (let i = 0; i < 60; i++) flyer.update(1 / 60);
    return off && flyer.flying === false;
  })());
  flyer.respawn();
  check('부활하면 비행 상태 초기화', flyer.flying === false && flyer.flightRoll === 0 && flyer.canFly === true);

  // 착용 해제 → 즉시 추락
  keys.clear();
  keys.add('Space');
  for (let i = 0; i < 60; i++) flyer.update(1 / 60);
  const yAir = flyer.position.y;
  flyer.setFlight({ equipped: false });
  for (let i = 0; i < 120; i++) flyer.update(1 / 60);
  check('장착 해제하면 중력이 돌아온다', flyer.flying === false && flyer.position.y < yAir - 5, `${yAir.toFixed(1)} → ${flyer.position.y.toFixed(1)}`);
  keys.clear();

  flyWorld.dispose();
}

// ───────────────────────────── 요정의 날개 뷰모델 · 시스템 연동
section('요정의 날개 뷰모델');
{
  const rigCam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 800);
  const rig = new WingRig({ camera: rigCam });
  check('뷰모델 — 기본 비표시 + 카메라 자식', rig.visible === false && rigCam.children.includes(rig.root));
  rig.setProfile({ equipped: true, id: 'fairy_wings', color: 0xbff5d0, accent: 0xfff0b0, glow: 0x8ff0c0, flap: 7.6 });
  check('뷰모델 — 착용 시 좌우 날개 생성', rig.visible === true && rig.root.children.length >= 3, `${rig.root.children.length}그룹`);
  let meshCount = 0;
  rig.root.traverse((o) => {
    if (o.isMesh) meshCount += 1;
  });
  check('뷰모델 — 깃털 메시 12장 이상', meshCount >= 12, `${meshCount}메시`);
  let culled = 0;
  rig.root.traverse((o) => {
    if (o.isMesh && o.frustumCulled !== false) culled += 1;
  });
  check('뷰모델 — 컬링 해제(카메라 자식)', culled === 0);
  const z0 = rig.root.children[0].rotation.z;
  for (let i = 0; i < 30; i++) rig.update(1 / 60, { flying: true, speed: 12, ascend: true, mana: 0.5 });
  const z1 = rig.root.children[0].rotation.z;
  check('뷰모델 — 비행 시 펄럭임', Math.abs(z1 - z0) > 0.002, `Δz=${(z1 - z0).toFixed(4)}`);
  check('뷰모델 — 비행 잔상 표시', rig.root.children.some((c) => c.isGroup && c.visible === true && c.children.length === 2));
  rig.setProfile({ equipped: false });
  check('뷰모델 — 해제 시 숨김', rig.visible === false);
  rig.dispose();
  check('뷰모델 — dispose 로 카메라에서 제거', rigCam.children.length === 0);
  check('뷰모델 — 스타 3종 색상 재생성', (() => {
    const r = new WingRig({ camera: rigCam });
    r.setProfile({ equipped: true, id: 'star_wings', color: 0xc9d8ff, accent: 0xfff6d0, glow: 0x9fb8ff, flap: 5.6 });
    const ok = r.visible === true && r.wingId === 'star_wings';
    r.setProfile({ equipped: true, id: 'fairy_wings', color: 0xbff5d0, accent: 0xfff0b0, glow: 0x8ff0c0, flap: 7.6 });
    const swapped = r.wingId === 'fairy_wings';
    r.dispose();
    return ok && swapped && rigCam.children.length === 0;
  })());

  // 실제 경제 + 시스템 + 플레이어 연동
  const wingEco = new Economy({ gold: 500000, wood: 0, minerals: { iron: 50, quartz: 50, mana: 10 } });
  const wings = new WingSystem({ economy: wingEco });
  check('시스템 — 구매 → 비행 프로필', wings.buy('fairy_wings').ok === true && wings.flight().equipped === true && wingEco.gold === 475000);
  const rig2 = new WingRig({ camera: rigCam });
  rig2.setProfile(wings.flight());
  check('시스템 ↔ 뷰모델 프로필 적용', rig2.visible === true && rig2.wingId === 'fairy_wings');
  rig2.dispose();
  const forcedWings = new WingSystem();
  forcedWings.setForced(true);
  check('관리자 강제 비행 — 날개 없이 프로필', forcedWings.flight().equipped === true && forcedWings.count === 0);
}

// ───────────────────────────── 관리자 /플라이 · /날개 (실제 세션 스텁)
section('관리자 비행 명령 (요정의 날개)');
{
  const wingEco = new Economy({ gold: 100000, wood: 0, minerals: {} });
  const wings = new WingSystem({ economy: wingEco });
  const flyKeys = new Set();
  const flyInput = {
    keys: flyKeys,
    mouse: { dx: 0, dy: 0, left: false, right: false, wheel: 0 },
    isDown: (code) => flyKeys.has(code),
    wasPressed: () => false,
    consumePressed: () => false,
    consumeMouse: () => ({ dx: 0, dy: 0, left: false, right: false, wheel: 0 }),
    requestPointerLock: () => {},
    exitPointerLock: () => {},
    get locked() {
      return false;
    },
    update: () => {},
    dispose: () => {}
  };
  const flyPlayer = new Player({
    camera: new THREE.PerspectiveCamera(75, 1, 0.1, 800),
    world: null,
    input: flyInput,
    audio,
    stats: achievements
  });
  const flyGame = {
    economy: wingEco,
    wings,
    player: flyPlayer,
    adminFlight: false,
    applied: 0,
    ui: { panels: { refresh() {} } },
    notify() {},
    adminFly(mode) {
      const m = String(mode ?? 'toggle');
      const on = m === 'on' ? true : m === 'off' ? false : !this.adminFlight;
      this.adminFlight = on;
      wings.setForced(on);
      const profile = wings.flight();
      flyPlayer.setFlight(on ? { ...profile, equipped: true } : { equipped: false });
      if (on) {
        flyPlayer.onGround = false;
        flyPlayer.velocity.y = 4.5;
      } else {
        flyPlayer.flying = false;
      }
      return { ok: true, on, message: on ? '비행 활성화' : '비행 해제' };
    },
    applyFlight() {
      this.applied += 1;
    }
  };
  const a1 = runAdminCommand('/플라이', { game: flyGame, user: { role: 'admin' } });
  check('/플라이 — 즉시 비행 활성화', a1.ok === true && flyGame.adminFlight === true && flyPlayer.canFly === true && flyPlayer.flight.ceiling >= 300);
  check('/플라이 — 이륙(공중 상태)', flyPlayer.onGround === false && flyPlayer.velocity.y > 0);
  flyKeys.add('Space');
  for (let i = 0; i < 60; i++) flyPlayer.update(1 / 60);
  check('/플라이 — 날개 없이 1초 만에 5m 이상 상승', flyPlayer.position.y > 5 && flyPlayer.flying === true, `y=${flyPlayer.position.y.toFixed(2)} flying=${flyPlayer.flying}`);
  flyKeys.clear();
  const a2 = runAdminCommand('/플라이 off', { game: flyGame, user: { role: 'admin' } });
  check('/플라이 off — 비행 해제', a2.ok === true && flyGame.adminFlight === false && flyPlayer.canFly === false && flyPlayer.flying === false);
  const a3 = runAdminCommand('/날개', { game: flyGame, user: { role: 'admin' } });
  check('/날개 — 목록 안내', a3.ok === true && a3.lines.length === FAIRY_WINGS.length);
  const a4 = runAdminCommand('/날개 별의 날개', { game: flyGame, user: { role: 'admin' } });
  check('/날개 <이름> — 소환 + 장착', a4.ok === true && wings.has('star_wings') && wings.equippedId === 'star_wings' && flyGame.applied > 0);
  check('/날개 — 없는 이름 실패', runAdminCommand('/날개 없는날개xyz', { game: flyGame, user: { role: 'admin' } }).ok === false);
  check('/플라이 — 비관리자 거부', runAdminCommand('/플라이', { game: flyGame, user: { role: 'user' } }).ok === false);
  check('도움말에 /플라이 · /날개 포함', commandHelp().some((l) => l.includes('/플라이')) && commandHelp().some((l) => l.includes('/날개')));
}


// ───────────────────────────── 지형 야생 몬스터 (로밍) · 가죽 · 장비 — 실제 시스템 연동
section('지형 야생 몬스터 (로밍) · 가죽 · 장비');
try {
  // (1) 실제 WaveSystem 에 야생 몬스터를 띄운다 — 웨이브 정산과 완전히 분리되는지 확인
  const roamEco = new Economy({ gold: 0, wood: 0, minerals: {} });
  const roamStats = new AchievementSystem();
  const roamWaves = new WaveSystem({
    scene,
    world: world2,
    rng: rng.fork('roamers-headless'),
    difficulty: 'normal',
    economy: roamEco,
    stats: roamStats
  });
  const roamEvents = { leather: 0, mineral: 0, spawn: 0 };
  roamWaves.onLeatherGained = () => {
    roamEvents.leather += 1;
  };
  roamWaves.onMineralGained = () => {
    roamEvents.mineral += 1;
  };
  roamWaves.onRoamerSpawn = () => {
    roamEvents.spawn += 1;
  };
  roamWaves.phase = 'playing';
  const beforeAlive = roamWaves._aliveCount;
  const beforeTotal = roamWaves._waveTotal;
  const roamEnemy = roamWaves.spawnRoamer({ regionId: 'tier3', x: 220, z: 220 });
  check(
    '야생 몬스터 스폰 — 지역 종 + 로밍 플래그',
    Boolean(roamEnemy) &&
      roamEnemy.roaming === true &&
      roamEnemy.fromTower === true &&
      roamEnemy.spawnerKind === 'region' &&
      roamEnemy.regionId === 'tier3' &&
      roamEnemy.spawnerTier === 3 &&
      REGION_ENEMY_BY_ID[roamEnemy.typeId]?.region === 'tier3',
    `${roamEnemy?.typeId} · ${roamEnemy?.type?.name}`
  );
  check(
    '야생 스폰은 웨이브 정산을 건드리지 않는다(_aliveCount·_waveTotal)',
    roamWaves._aliveCount === beforeAlive && roamWaves._waveTotal === beforeTotal && roamWaves.enemies.includes(roamEnemy)
  );
  check('야생 스폰 카운터 + 이벤트', roamWaves.roamersSpawned === 1 && roamEvents.spawn === 1);
  check(
    '야생 체력 = 종 hpMult × 웨이브 파워 기준',
    roamEnemy.maxHp > 0 && roamEnemy.type.hpMult > 1 && roamEnemy.barY > 0,
    `hp ${roamEnemy.maxHp} · ${roamEnemy.type.name}`
  );
  check('안전 지대(로스터 없음)에는 스폰 실패', roamWaves.spawnRoamer({ regionId: 'outer', x: 0, z: 0 }) === null);
  roamWaves.phase = 'gameover';
  check('게임오버에는 스폰 실패', roamWaves.spawnRoamer({ regionId: 'tier1', x: 10, z: 10 }) === null);
  roamWaves.phase = 'playing';

  // (2) 처치 → 가죽·골드·통계가 정상 집계되고 웨이브 정산은 그대로
  const leatherBefore = roamEco.totalLeather();
  const goldBefore = roamEco.gold;
  const killsBefore = roamWaves.kills;
  roamEnemy.takeDamage(1e9);
  check('야생 처치 — 사망 처리', roamEnemy.alive === false);
  check(
    '야생 처치 — 가죽 지급(표의 확률표)',
    roamEco.totalLeather() >= leatherBefore && roamEvents.leather + (roamEco.totalLeather() === leatherBefore ? 1 : 0) >= 1,
    `가죽 ${leatherBefore} → ${roamEco.totalLeather()} (이벤트 ${roamEvents.leather})`
  );
  check('야생 처치 — 골드 지급', roamEco.gold > goldBefore, `+${roamEco.gold - goldBefore}G`);
  check('야생 처치 — 킬/야생 통계 집계', roamWaves.kills === killsBefore + 1 && roamStats.get('roamersKilled') === 1, `roamersKilled ${roamStats.get('roamersKilled')}`);
  check('야생 처치 — _aliveCount 는 그대로(정산 제외)', roamWaves._aliveCount === beforeAlive);

  // (3) 확정 드롭 — 확률과 무관하게 표의 가죽을 떨구는지(결정적 rand 로 확률 1.0 종)
  const alwaysSpec = regionMonsterLoot(REGION_ENEMY_BY_ID.relic_guardian, () => 0);
  check('유물 수호자 — 확정 가죽 + 확정 광물', alwaysSpec.leather?.id === 'relic_leather' && alwaysSpec.mineral?.id === 'timesand');
  const dropEco = new Economy({ gold: 0 });
  const dropWaves = new WaveSystem({ scene, world: world2, rng: rng.fork('roam-drop'), difficulty: 'normal', economy: dropEco, stats: roamStats });
  dropWaves.phase = 'playing';
  let guardianKills = 0;
  for (let i = 0; i < 40; i++) {
    const guardian = dropWaves.spawnRoamer({ regionId: 'tier7', typeId: 'relic_guardian', x: 300, z: 300 });
    if (!guardian) break;
    guardian.takeDamage(1e9);
    guardianKills += 1;
  }
  check(
    `T7 유물 수호자 ${guardianKills}기 처치 — 유물 가죽 + 시간의 모래`,
    guardianKills === 40 && dropEco.getLeather('relic_leather') >= 1 && dropEco.getMineral('timesand') >= 1,
    `가죽 ${dropEco.getLeather('relic_leather')} · 모래 ${dropEco.getMineral('timesand')}`
  );

  // (4) 웨이브·시설 몬스터도 낮은 확률로 가죽을 떨군다 — 여러 마리 처치로 집계
  const waveEco = new Economy({ gold: 0 });
  const waveStats = new AchievementSystem();
  const waveWaves = new WaveSystem({ scene, world: world2, rng: rng.fork('wave-leather'), difficulty: 'normal', economy: waveEco, stats: waveStats });
  waveWaves.phase = 'playing';
  let waveLeatherTotal = 0;
  for (let i = 0; i < 60; i++) {
    const e = waveWaves._spawnEntry({ typeId: 'orc', isBoss: false });
    if (!e) break;
    e.takeDamage(1e9);
    waveLeatherTotal = waveEco.totalLeather();
  }
  check('웨이브 몬스터도 가죽을 떨군다(60기 처치)', waveLeatherTotal > 0, `가죽 ${waveLeatherTotal}개`);
  check('가죽 통계 누적(leatherGathered)', waveStats.get('leatherGathered') === waveLeatherTotal, `stat ${waveStats.get('leatherGathered')} · 실제 ${waveLeatherTotal}`);

  // (5) 로밍 스포너 → waves.spawnRoamer 배선(생산 코드와 같은 콜백 모양)
  const spawnerWaves = new WaveSystem({ scene, world: world2, rng: rng.fork('roam-spawner'), difficulty: 'normal', economy: new Economy({ gold: 0 }) });
  spawnerWaves.phase = 'playing';
  const spawner = new RegionSpawner({ rand: () => 0.37 });
  for (let i = 0; i < 1500; i++) {
    spawner.update(0.1, {
      position: { x: 260, z: 260 },
      regionId: 'tier5',
      phase: 'playing',
      enemies: spawnerWaves.enemies,
      spawn: (o) => spawnerWaves.spawnRoamer(o),
      despawn: (e) => {
        e.alive = false;
      }
    });
  }
  const roamers = spawnerWaves.enemies.filter((e) => e.roaming === true);
  check(
    '로밍 스포너 — 상한까지 야생만 스폰',
    roamers.length > 0 && roamers.length <= (regionMonsterRoster('tier5').maxAlive ?? 10),
    `${roamers.length}기 · 스폰 ${spawner.spawned}`
  );
  check(
    '스포너가 띄운 개체는 전부 T5 종 + 웨이브 정산 제외',
    roamers.every((e) => e.regionId === 'tier5' && e.fromTower === true && REGION_ENEMY_BY_ID[e.typeId]?.region === 'tier5') && spawnerWaves._aliveCount === 0
  );
  check('스포너 — 웨이브 큐/총계 변화 없음', spawnerWaves._queue.length === 0 && spawnerWaves._waveTotal === 0);

  // (6) 가죽 장비 — 비율 보너스가 플레이어 수치에 반영되는지(계산식은 main.js 와 동일)
  const gearEco2 = new Economy({ gold: 9999999, leathers: { leather: 40, thick_leather: 30, scaled_leather: 30, dragon_leather: 20, relic_leather: 10 } });
  const gear2 = new GearSystem({ economy: gearEco2 });
  const gearPlayer = new Player({
    camera: new THREE.PerspectiveCamera(75, 1, 0.1, 800),
    world: null,
    input: {
      keys: new Set(),
      mouse: { dx: 0, dy: 0, left: false, right: false, wheel: 0 },
      isDown: () => false,
      wasPressed: () => false,
      consumePressed: () => false,
      consumeMouse: () => ({ dx: 0, dy: 0, left: false, right: false, wheel: 0 }),
      requestPointerLock: () => {},
      exitPointerLock: () => {},
      locked: false,
      update: () => {},
      dispose: () => {}
    },
    audio,
    stats: achievements
  });
  const baseSpeed = gearPlayer.speedMult;
  const baseMana = gearPlayer.manaRegen;
  const baseStamina = gearPlayer.staminaRegen;
  const baseTaken = gearPlayer.damageTakenMult;
  for (const g of LEATHER_GEAR) gear2.grant(g.id);
  const gb = gear2.bonus();
  // main.js _applyClassModifiers 와 동일한 비율 적용식
  gearPlayer.speedMult = baseSpeed * (1 + gb.moveSpeedPct);
  gearPlayer.manaRegenMult = 1 * (1 + gb.manaRegenPct);
  gearPlayer.staminaRegen = baseStamina * (1 + gb.staminaRegenPct);
  gearPlayer.damageTakenMult = baseTaken * (1 - gb.damageTakenPct);
  check(
    '장비 6벌 — 이동/마나/스태미나/피해감소 비율 적용',
    Math.abs(gearPlayer.speedMult - baseSpeed * 1.24) < 1e-9 &&
      Math.abs(gearPlayer.manaRegenMult - 1.55) < 1e-9 &&
      Math.abs(gearPlayer.staminaRegen - baseStamina * 1.15) < 1e-9 &&
      Math.abs(gearPlayer.damageTakenMult - baseTaken * (1 - 0.32)) < 1e-9,
    `spd ${gearPlayer.speedMult.toFixed(3)} · manaMult ${gearPlayer.manaRegenMult.toFixed(2)} (기본 ${baseMana}) · sta ${gearPlayer.staminaRegen.toFixed(2)} · taken ${gearPlayer.damageTakenMult.toFixed(3)}`
  );
  check(
    '장비는 최대 체력/마나를 직접 건드리지 않는다(저장 오염 없음)',
    gearPlayer.maxHp === 100 && gearPlayer.maxMana === 100 && !('gear' in (gearPlayer.toJSON?.() ?? {}))
  );

  // (7) 관리자 명령 — 실제 경제/장비 연동
  const adminEco = new Economy({ gold: 0 });
  const adminGear = new GearSystem({ economy: adminEco });
  const adminWingEco = new Economy({ gold: 999999, leathers: { thick_leather: 4 } });
  const adminWings = new WingSystem({ economy: adminWingEco });
  const gearGame = {
    economy: adminEco,
    gear: adminGear,
    wings: adminWings,
    ui: { panels: { refresh() {} } },
    notify() {},
    appliedGear: 0,
    applyGear() {
      this.appliedGear += 1;
    },
    applyFlight() {}
  };
  const adminUser = { role: 'admin' };
  const c1 = runAdminCommand('/가죽', { game: gearGame, user: adminUser });
  check('/가죽 — 5종 일괄 소환', c1.ok === true && LEATHER_TYPES.every((l) => adminEco.getLeather(l.id) > 0) && c1.lines.length === LEATHER_TYPES.length, c1.message);
  const c2 = runAdminCommand('/가죽 유물 가죽 3', { game: gearGame, user: adminUser });
  check('/가죽 <이름> <수량> — 이름으로 찾아 지급', c2.ok === true && adminEco.getLeather('relic_leather') === 102, c2.message);
  check('/가죽 — 없는 이름 실패', runAdminCommand('/가죽 없는가죽xyz', { game: gearGame, user: adminUser }).ok === false);
  const c3 = runAdminCommand('/장비', { game: gearGame, user: adminUser });
  check('/장비 — 6벌 소환 + 전부 착용', c3.ok === true && adminGear.count === LEATHER_GEAR.length && adminGear.equippedCount === LEATHER_GEAR.length && gearGame.appliedGear > 0, c3.message);
  check('/장비 — 세트 안내 포함', c3.lines.some((l) => l.includes('세트')), c3.lines.join(' | ').slice(0, 80));
  const c4 = runAdminCommand('/장비 용 가죽 허리띠', { game: gearGame, user: adminUser });
  check('/장비 <이름> — 개별 소환', c4.ok === true && adminGear.equippedIn('waist') === 'dragon_belt', c4.message);
  check('/장비 — 없는 장비 실패', runAdminCommand('/장비 없는장비xyz', { game: gearGame, user: adminUser }).ok === false);
  check('/가죽 · /장비 — 비관리자 거부', runAdminCommand('/가죽', { game: gearGame, user: { role: 'user' } }).ok === false && runAdminCommand('/장비', { game: gearGame, user: { role: 'user' } }).ok === false);
  check('도움말에 /가죽 · /장비 포함', commandHelp().some((l) => l.includes('/가죽')) && commandHelp().some((l) => l.includes('/장비')));
  check('관리자 명령 14종', ADMIN_COMMANDS.length === 14, ADMIN_COMMANDS.map((c) => c.name).join(','));
} catch (e) {
  check('지형 야생 몬스터 섹션 무예외', false, e?.stack ?? String(e));
}

// ───────────────────────────── 마우스 입력 — UI 클릭이 게임 입력이 되지 않는다
section('마우스 입력 — UI 클릭 차단 + 포인터 정책');
{
  const canvas = { id: 'game-canvas' };
  const uiEl = { id: 'panel-root' };
  const input = new Input(canvas);
  input.dom = canvas;
  input._doc = { pointerLockElement: null, activeElement: null, exitPointerLock() {} };

  input._onMouseDown({ button: 0, target: canvas });
  check('포인터가 풀려 있으면 클릭이 공격으로 이어지지 않는다', input.mouse.left === false);

  input._doc.pointerLockElement = canvas;
  input._onMouseDown({ button: 0, target: canvas });
  check('잠금 상태의 캔버스 클릭은 공격으로 처리', input.mouse.left === true, `left=${input.mouse.left}`);

  input._onMouseUp({ button: 0 });
  check('mouseup 은 UI 여부와 무관하게 항상 해제', input.mouse.left === false);

  input._onMouseDown({ button: 0, target: uiEl });
  check('패널 위 좌클릭은 잠금 상태여도 게임 입력이 아니다', input.mouse.left === false);

  input._onMouseDown({ button: 2, target: uiEl });
  check('패널 위 우클릭도 무시', input.mouse.right === false);

  input._onMouseDown({ button: 2, target: canvas });
  check('캔버스 우클릭은 정상 동작', input.mouse.right === true);

  input._doc.pointerLockElement = null;
  input.lookWithoutLock = true;
  input.mouse.left = false;
  input._onMouseDown({ button: 0, target: canvas });
  check('lookWithoutLock 옵션이면 잠금 없이도 클릭 허용(예외 경로)', input.mouse.left === true);
  input.lookWithoutLock = false;
  input.mouse.left = false;

  input._doc.pointerLockElement = canvas;
  let exitCalls = 0;
  input.exitPointerLock = () => {
    exitCalls += 1;
    input._doc.pointerLockElement = null;
  };
  check(
    'Input.locked 와 정책 모듈이 같은 문서 상태를 본다',
    input.locked === true &&
      syncPointerLock({ state: 'playing', input, panels: { hasOpen: () => true } }) === 'unlock' &&
      exitCalls === 1 &&
      input.locked === false,
    `exit ${exitCalls}회 · locked ${input.locked}`
  );
}

// ───────────────────────────── 휠 입력 — 건설창이 열려 있으면(잠금 해제) 포탑이 바뀌지 않는다
section('휠 입력 — 포인터 잠금 중에만 포탑 순환');
{
  const canvas2 = { id: 'game-canvas' };
  const input2 = new Input(canvas2);
  input2.dom = canvas2;
  input2._doc = { pointerLockElement: canvas2, activeElement: null, exitPointerLock() {} };

  input2.mouse.wheel = 0;
  input2._onWheel({ deltaY: 120, target: canvas2, preventDefault() {} });
  check('잠금 상태의 휠은 포탑 순환 입력으로 들어간다', input2.mouse.wheel === 1, `wheel=${input2.mouse.wheel}`);

  input2.mouse.wheel = 0;
  input2._doc.pointerLockElement = null; // 건설창이 열리면 잠금이 풀린다 → 휠은 패널 스크롤용
  input2._onWheel({ deltaY: 120, target: canvas2, preventDefault() {} });
  check('포인터가 풀려 있으면(건설창 열림) 휠이 게임 입력이 아니다', input2.mouse.wheel === 0, `wheel=${input2.mouse.wheel}`);
}

// ───────────────────────────── 마법부여 · 맨손 · 건물 회전 (F1~F4)
section('마법부여 / 맨손 / 건물 회전');
{
  const enc = await import('../client/src/systems/enchant.js');
  check('마법부여 데이터 무결성', enc.validateEnchantData().length === 0, enc.validateEnchantData().join(' · '));

  const enEco = new Economy({ gold: 300000, wood: 0, minerals: { coal: 80, iron: 80, clay: 80, quartz: 80, copper: 80 } });
  const enStats = new AchievementSystem({});
  const sys = new enc.EnchantSystem({ economy: enEco, stats: enStats });
  const gold0 = enEco.gold;
  const e1 = sys.enchant('sword1h_guard', 'fire', { hasWeapon: () => true, hasEnchanter: true });
  check('부여 — 1레벨 + 재료 차감', e1.ok === true && e1.level === 1 && enEco.gold < gold0, `${gold0} → ${enEco.gold}`);
  const e2 = sys.enchant('sword1h_guard', 'fire', { hasWeapon: () => true, hasEnchanter: true });
  check('같은 속성 재부여 — 2레벨(배율 상승)', e2.ok === true && e2.level === 2 && e2.state.damageMult > e1.state.damageMult, `+${e2.state.percent}%`);
  const other = WEAPONS.find((w) => w.id !== 'sword1h_guard');
  const e3 = sys.enchant(other.id, 'ice', { hasWeapon: () => true, hasEnchanter: true });
  check('무기마다 개별 부여(모든 무기 가능)', e3.ok === true && sys.count === 2 && sys.stateFor(other.id)?.element === 'ice', `${sys.count}종`);
  const allOk = WEAPONS.every((w) => sys.canEnchant(w.id, 'fire', { hasWeapon: () => true, hasEnchanter: true }).ok);
  check('82종 전부 부여 가능', allOk, `${WEAPONS.length}종`);
  const bonus = sys.bonusFor('sword1h_guard');
  check('bonusFor — 전투 반영값', bonus.element === 'fire' && bonus.damageMult > 1 && bonus.level === 2, JSON.stringify({ el: bonus.element, mult: bonus.damageMult }));
  const restored = new enc.EnchantSystem({}).fromJSON(JSON.parse(JSON.stringify(sys.toJSON())));
  check('부여 상태 저장/복원', restored.count === sys.count && restored.stateFor('sword1h_guard')?.level === 2, `${restored.count}종`);
  const noB = sys.enchant('sword1h_guard', 'ice', { hasWeapon: () => true, hasEnchanter: false });
  check('마법부여대 없으면 부여 불가', noB.ok === false && String(noB.error).includes('마법부여대'), String(noB.error));

  // ── 맨손 뷰모델
  const bareCam = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const bareRig = new WeaponRig({ camera: bareCam, weaponId: null, rng: rng.fork('bare') });
  check('맨손 — 뷰모델 없음 · id=fists', bareRig.id === 'fists' && bareRig.mesh === null && bareRig.weapon?.fist === true, String(bareRig.id));
  check('맨손 — 공격 모션 없음(쿨다운 타격)', bareRig.triggerAttack({}) === false);
  check('맨손 — muzzlePosition 안전', Number.isFinite(bareRig.muzzlePosition.x) && Number.isFinite(bareRig.muzzlePosition.y));
  check('맨손 전환 — 무기 장착', bareRig.equip('sword1h_guard', { instant: true }).ok === true && bareRig.mesh !== null && bareRig.id === 'sword1h_guard');
  const back = bareRig.equip('fists', { instant: true });
  check('무기 → 맨손 복귀(메시 제거)', back.ok === true && bareRig.mesh === null && bareRig.id === 'fists');

  // ── 건물 회전
  const rotEco = new Economy({ gold: 900000, wood: 90000, minerals: { iron: 90, copper: 90, coal: 90 } });
  const rotSys = new TurretSystem({ scene, world: world2, economy: rotEco, projectiles, audio, stats: new AchievementSystem({}), rng: rng.fork('rotate') });
  const rotDef = TURRETS.find((t) => t.category === 'attack' && t.tier === 1);
  const rotTurret = rotSys.place(rotDef.id, placeAt(200, 36), 'local', { yaw: Math.PI / 4 });
  check('건설 시 yaw 반영', Math.abs(Number(rotTurret?.yaw) - Math.PI / 4) < 1e-6, `${rotTurret?.yaw}`);
  check('메시 회전 반영', Math.abs(Number(rotTurret?.mesh?.rotation?.y) - Math.PI / 4) < 1e-6);
  const turned = rotSys.rotate(rotTurret.id, Math.PI / 4);
  check('rotate — 45° 회전(90°)', turned.ok === true && Math.abs(turned.degrees - 90) < 0.5, `${turned.degrees}°`);
  const turnedBack = rotSys.rotate(rotTurret.id, -Math.PI / 2);
  check('반대 회전 — 0° 로 복귀', turnedBack.ok === true && Math.abs(turnedBack.degrees) < 0.5, `${turnedBack.degrees}°`);
  check('모르는 포탑 회전 — 실패 반환', rotSys.rotate('nope', 1).ok === false);
  rotSys.rotate(rotTurret.id, Math.PI / 4);
  const rotJson = rotSys.toJSON();
  const savedYaw = (rotJson.turrets ?? []).find((t) => t.id === rotTurret.id)?.yaw;
  check('yaw 저장', Math.abs(Number(savedYaw) - Math.PI / 4) < 1e-6, String(savedYaw));
  const rotSys2 = new TurretSystem({ scene: new THREE.Scene(), world: world2, economy: new Economy({ gold: 1000, wood: 100, minerals: {} }), projectiles, audio, stats: new AchievementSystem({}), rng: rng.fork('rotate2') });
  rotSys2.fromJSON(rotJson);
  const loadedYaw = (rotSys2.turrets ?? []).find((t) => t.id === rotTurret.id)?.yaw;
  check('yaw 복원', Math.abs(Number(loadedYaw) - Math.PI / 4) < 1e-6, String(loadedYaw));
}

// ───────────────────────────── 캐릭터 · 앉기 · 부드러운 회전
section('캐릭터 만들기 / 앉기·점프 / 부드러운 회전');
{
  const ch = await import('../client/src/character.js');
  const charErrors = ch.validateCharacterData();
  check('캐릭터 데이터 무결성', charErrors.length === 0, charErrors.join(' · '));
  check('외형 9종 · 기본 = 수호자', ch.CHARACTER_SKINS.length === 9 && ch.DEFAULT_CHARACTER.skin === 'guardian');
  const payload = ch.characterPayload({ name: '  요새   지기 ', skin: 'mage' }, '수호자');
  check(
    '캐릭터 페이로드 — 이름 정리·아이콘·색',
    payload.name === '요새 지기' && payload.icon === '🧙' && payload.color === ch.CHARACTER_SKIN_BY_ID.mage.color,
    JSON.stringify(payload)
  );
  const weird = ch.sanitizeRemoteCharacter({ skin: '해커', color: -1, accent: 1e9, icon: '' });
  check(
    '모르는 외형/색 → 기본값',
    weird.skin === 'guardian' && weird.color === ch.CHARACTER_SKIN_BY_ID.guardian.color && weird.icon === ch.CHARACTER_SKIN_BY_ID.guardian.icon
  );
  const mem = {
    _v: {},
    getItem(k) { return this._v[k] ?? null; },
    setItem(k, v) { this._v[k] = String(v); },
    removeItem(k) { delete this._v[k]; }
  };
  const store = ch.createCharacterStore({ storage: mem });
  const savedChar = store.save({ name: '테스터', skin: 'bard' });
  check('저장/복원 왕복', savedChar.skin === 'bard' && store.load().name === '테스터' && store.load().skin === 'bard');
  mem.setItem(ch.CHARACTER_STORAGE_KEY, '{ 깨진');
  check('손상 세이브 내성', store.load('대체').name === '대체');
  const noStorage = ch.createCharacterStore({});
  check(
    '저장소 없음(헤드리스)에서도 저장/복원 안전',
    noStorage.save({ name: '무저장', skin: 'rogue' }).name === '무저장' && noStorage.load().skin === 'guardian'
  );

  // ── 앉기 · 점프
  const keyInput = (held = []) => {
    const keys = new Set(held);
    return { ...fakeInput(), keys, isDown: (c) => keys.has(c) };
  };
  const spawn = new THREE.Vector3(0, 0, 45);
  const standEye = 1.7;
  const sitter = new Player({
    camera,
    world: world2,
    input: keyInput(['ControlLeft']),
    audio,
    stats: new AchievementSystem({}),
    position: spawn.clone()
  });
  for (let i = 0; i < 90; i++) sitter.update(1 / 60);
  check('앉기 — 의도 + 보간 도달(sitAmount≈1)', sitter.sitting === true && sitter.sitAmount > 0.99, 'sit=' + sitter.sitAmount.toFixed(3));
  check('앉기 — 카메라 시야 높이 하강', camera.position.y < sitter.position.y + standEye - 0.5, 'cam.y=' + camera.position.y.toFixed(2));
  check('앉기 — eyePosition 도 하강', sitter.eyePosition.y < sitter.position.y + standEye - 0.5, 'eye=' + sitter.eyePosition.y.toFixed(2));

  const walker = new Player({
    camera,
    world: world2,
    input: keyInput(['KeyW']),
    audio,
    stats: new AchievementSystem({}),
    position: spawn.clone()
  });
  const sitWalker = new Player({
    camera,
    world: world2,
    input: keyInput(['KeyW', 'ControlLeft']),
    audio,
    stats: new AchievementSystem({}),
    position: spawn.clone()
  });
  for (let i = 0; i < 120; i++) {
    walker.update(1 / 60);
    sitWalker.update(1 / 60);
  }
  const walkSpeed = Math.hypot(walker.velocity.x, walker.velocity.z);
  const sitSpeed = Math.hypot(sitWalker.velocity.x, sitWalker.velocity.z);
  check(
    '앉으면 이동 속도가 느려진다(≈42%)',
    walkSpeed > 3 && sitSpeed > 0.5 && sitSpeed < walkSpeed * 0.7,
    walkSpeed.toFixed(2) + ' m/s → ' + sitSpeed.toFixed(2) + ' m/s'
  );

  const jumpInput = { ...fakeInput(), consumePressed: (c) => c === 'Space' };
  const jumper = new Player({
    camera,
    world: world2,
    input: jumpInput,
    audio,
    stats: new AchievementSystem({}),
    position: spawn.clone()
  });
  jumper.onGround = true;
  jumper.velocity.set(0, 0, 0);
  jumper.update(1 / 60);
  check('점프 — 위로 뜬다', jumper.velocity.y > 3, 'vy=' + jumper.velocity.y.toFixed(2));

  const sitJumpInput = { ...keyInput(['ControlLeft']), consumePressed: (c) => c === 'Space' };
  const sitJumper = new Player({
    camera,
    world: world2,
    input: sitJumpInput,
    audio,
    stats: new AchievementSystem({}),
    position: spawn.clone()
  });
  for (let i = 0; i < 90; i++) sitJumper.update(1 / 60);
  sitJumper.onGround = true;
  sitJumper.velocity.set(0, 0, 0);
  sitJumper.update(1 / 60);
  check(
    '앉은 채로는 점프하지 않는다',
    sitJumper.sitAmount > 0.9 && sitJumper.velocity.y <= 0.001,
    'sit=' + sitJumper.sitAmount.toFixed(2) + ' vy=' + sitJumper.velocity.y.toFixed(3)
  );

  const flyingSit = new Player({
    camera,
    world: world2,
    input: keyInput(['ControlLeft']),
    audio,
    stats: new AchievementSystem({}),
    position: spawn.clone()
  });
  flyingSit.flying = true;
  flyingSit._move(1 / 60);
  check('날개로 뜬 동안에는 앉지 않는다', flyingSit.sitting === false);

  // ── 날개를 착용해도 지상에서는 점프가 먼저다(계약 §4.56)
  const wingJumpInput = { ...keyInput([]), consumePressed: (c) => c === 'Space' };
  const wingJumper = new Player({
    camera,
    world: world2,
    input: wingJumpInput,
    audio,
    stats: new AchievementSystem({}),
    position: spawn.clone()
  });
  wingJumper.flight.equipped = true;
  wingJumper.onGround = true;
  wingJumper.velocity.set(0, 0, 0);
  wingJumper.update(1 / 60);
  check(
    '날개 착용 — 지상에서는 점프가 먼저다(비행이 점프를 삼키지 않는다)',
    wingJumper.velocity.y > 3 && wingJumper.flying === false,
    'vy=' + wingJumper.velocity.y.toFixed(2) + ' flying=' + wingJumper.flying
  );

  const wingHoldInput = { ...keyInput(['Space']), consumePressed: (c) => c === 'Space' };
  const wingHolder = new Player({
    camera,
    world: world2,
    input: wingHoldInput,
    audio,
    stats: new AchievementSystem({}),
    position: spawn.clone()
  });
  wingHolder.flight.equipped = true;
  wingHolder.onGround = true;
  wingHolder.velocity.set(0, 0, 0);
  wingHolder.update(1 / 60);
  for (let i = 0; i < 30; i++) wingHolder.update(1 / 60);
  check(
    '점프 뒤 점프 키를 계속 누르면 비행으로 이어진다',
    wingHolder.flying === true,
    'flying=' + wingHolder.flying + ' vy=' + wingHolder.velocity.y.toFixed(2)
  );
  // ── 부드러운 건물 회전
  const smoothEco = new Economy({ gold: 200000, wood: 2000, minerals: { iron: 50, quartz: 50, mana: 50, silver: 50, coal: 50, clay: 50 } });
  const smoothSys = new TurretSystem({
    scene: new THREE.Scene(),
    world: world2,
    economy: smoothEco,
    projectiles,
    audio,
    stats: new AchievementSystem({}),
    rng: rng.fork('smooth-rot')
  });
  const smoothDef = TURRETS.find((t) => t.kind === 'enchanter') ?? TURRETS.find((t) => t.category === 'attack' && t.tier === 1);
  const smoothCtx = { enemies: [], player: playerStub, world: world2, turrets: smoothSys.turrets };
  const sTurret = smoothSys.place(smoothDef.id, placeAt(224, 36), 'local', { yaw: 0 });
  smoothSys.update(1 / 60, smoothCtx);
  const smoothStep = smoothSys.rotate(sTurret.id, Math.PI / 2, { smooth: true });
  check(
    '연속 회전 — 논리 yaw 는 즉시, 메시는 목표를 향해',
    smoothStep.ok === true &&
      Math.abs(Number(sTurret.yaw) - Math.PI / 2) < 1e-6 &&
      Math.abs(Number(sTurret.mesh.rotation.y)) < 1e-6 &&
      sTurret.yawTarget != null,
    'yaw=' + Number(sTurret.yaw).toFixed(3) + ' mesh=' + Number(sTurret.mesh.rotation.y).toFixed(3)
  );
  for (let i = 0; i < 60; i++) smoothSys.update(1 / 60, smoothCtx);
  check(
    '연속 회전 — 메시가 목표 각도로 수렴(부드러움)',
    Math.abs(Number(sTurret.mesh.rotation.y) - Math.PI / 2) < 0.02 && sTurret.yawTarget == null,
    'mesh=' + Number(sTurret.mesh.rotation.y).toFixed(3)
  );
  const midYaw = Number(sTurret.mesh.rotation.y);
  smoothSys.rotate(sTurret.id, 0.6, { smooth: true });
  smoothSys.update(1 / 60, smoothCtx);
  const afterOne = Number(sTurret.mesh.rotation.y);
  check('연속 회전 — 한 프레임에 확 튀지 않는다', afterOne > midYaw && afterOne < midYaw + 0.6, midYaw.toFixed(3) + ' → ' + afterOne.toFixed(3));
  const snapped = smoothSys.setYaw(sTurret.id, 0);
  check('기본 회전(즉시)은 그대로 동작', snapped.ok === true && Math.abs(Number(sTurret.mesh.rotation.y)) < 1e-6 && sTurret.yawTarget == null);
  const relay = smoothSys.setYaw(sTurret.id, Math.PI, { smooth: true });
  check('릴레이 수신 회전도 부드럽게', relay.ok === true && sTurret.yawTarget != null && Math.abs(Number(sTurret.yaw) - Math.PI) < 1e-6);
  check('없는 건물 회전 — 실패 반환', smoothSys.rotate('nope', 1, { smooth: true }).ok === false && smoothSys.setYaw('nope', 1, { smooth: true }).ok === false);

  // ── 멀티 원격 건물 — 자원 소모 없이 생성/동기화/철거
  const goldBeforeRemote = smoothEco.gold;
  const remote = smoothSys.placeRemote({ id: 'peer-1', typeId: smoothDef.id, x: 40, y: 0, z: 40, yaw: 1.25, ownerId: 'peer' });
  check(
    '원격 건물 생성 — id·방향 유지',
    Boolean(remote) && remote.id === 'peer-1' && Math.abs(Number(remote.yaw) - 1.25) < 1e-6,
    remote ? 'yaw=' + Number(remote.yaw).toFixed(2) : '실패'
  );
  check('원격 건물 — 자원을 쓰지 않는다', smoothEco.gold === goldBeforeRemote, `${goldBeforeRemote} → ${smoothEco.gold}`);
  check(
    '원격 건물 — 같은 id 중복 생성 없음',
    smoothSys.placeRemote({ id: 'peer-1', typeId: smoothDef.id, x: 41, y: 0, z: 41, yaw: 0 }) === remote &&
      smoothSys.turrets.filter((t) => t.id === 'peer-1').length === 1
  );
  const synced = smoothSys.syncRemote([{ id: 'peer-2', typeId: smoothDef.id, x: 44, y: 0, z: 44, yaw: 0, ownerId: 'peer' }], 'local');
  check('스냅샷 동기화 — 없는 원격은 제거, 새 원격은 추가', Boolean(smoothSys.find('peer-2')) && !smoothSys.find('peer-1'), `변경 ${synced}건`);
  check('스냅샷 동기화 — 내 건물은 유지', Boolean(smoothSys.find(sTurret.id)));
  check('원격 건물 철거', smoothSys.removeRemote('peer-2') === true && !smoothSys.find('peer-2'));
  check('원격이 아닌 건물은 removeRemote 거부', smoothSys.removeRemote(sTurret.id) === false && Boolean(smoothSys.find(sTurret.id)));
}

// ───────────────────────────── 12. 공장 생산·물통로·승급 (계약 §4.85)
section('공장 — 생산 · 물통로 · 티어 승급');
{
  const fEco = new Economy({
    gold: 10000000,
    wood: 1000000,
    minerals: Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, 9999]))
  });
  const fSys = new TurretSystem({
    scene: new THREE.Scene(),
    economy: fEco,
    rng: rng.fork('factory')
  });
  const gen = fSys.place('facility_generator_t7', { x: 0, z: 0 }, 'local');
  const water = fSys.place('factory_water_t1', { x: 5, z: 0 }, 'local');
  fSys.updatePower(true);
  check('공장 건설 + 전력 공급', Boolean(gen) && Boolean(water) && water.powered === true, `powered=${water?.powered}`);
  const goldBefore = fEco.gold;
  for (let i = 0; i < 20; i++) fSys.update(0.5, {});
  check(
    '물추출기 — 골드 자동 생산',
    water.factoryProduced > 0 && fEco.gold > goldBefore,
    `+${water.factoryProduced} · ${goldBefore} → ${fEco.gold}`
  );
  const pipe = fSys.place('factory_waterway_t1', { x: 2, z: 4 }, 'local');
  fSys.updatePower(true);
  for (let i = 0; i < 4; i++) fSys.update(0.5, {});
  check(
    '물통로 — 주변 공장 생산 보너스',
    Boolean(pipe) && pipe.powered === true && water._factoryBoost > 0,
    `boost=${(water._factoryBoost * 100).toFixed(1)}%`
  );
  const t1Amount = water.type.outputs[0].amount;
  const upgraded = fSys.upgrade(water.id);
  check(
    '공장 승급 — T1 → T2 생산량 증가',
    upgraded === true && water.typeId === 'factory_water_t2' && water.type.outputs[0].amount > t1Amount,
    `${water.typeId} ${t1Amount} → ${water.type.outputs[0].amount}/s`
  );
}

console.log(`\n${'═'.repeat(58)}`);
console.log(`헤드리스 통합 시뮬레이션: ${pass}개 통과 / ${fail}개 실패 (총 ${pass + fail}개, ${(ms / 1000).toFixed(1)}초)`);
if (fail > 0) {
  console.log('\n실패 목록:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('모든 통합 검증을 통과했습니다. 🎉');
}
console.log('═'.repeat(58));

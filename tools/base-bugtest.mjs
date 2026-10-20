// 요새의 수호자 — Round C 버그테스트: 전기 시스템 · 저장고 티어 · 채굴기 지형 채굴 · 티어별 재료.
// 실행: node tools/base-bugtest.mjs
// Round C 통합 점검 — 전기(발전기·전선·정전) / 저장고 용량·수거 / 채굴기 지형 티어
import * as THREE from 'three';
import { createRNG } from '../client/src/utils/rng.js';
import { createWorld } from '../client/src/world/world.js';
import { Economy } from '../client/src/systems/economy.js';
import { TurretSystem, MAX_CABLES } from '../client/src/systems/turrets.js';
import { TURRETS, MINERAL_TYPES, mineralsForRegionTier, POWER, TURRET_DAMAGE_SCALE, TOWER_TIER_SCALE, WEAPONS, ARROW_TIERS, ARROW_BY_ID, ARROW_ORDER_DESC, arrowDamageMult, weaponById, WEAPON_ULTIMATE_BY_ID } from '../client/src/data.js';
import { FAMILY_TIER_RECIPES, CRAFTING_TABLE_BY_ID } from '../client/src/crafting.js';
import { CraftingSystem } from '../client/src/systems/crafting.js';
import { regionAt } from '../client/src/world/regions.js';
import { PowerGrid } from '../client/src/systems/power.js';
import { ProjectileSystem } from '../client/src/player/projectiles.js';

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
};

const scene = new THREE.Scene();
const rng = createRNG('roundc-42');
const world = createWorld({ scene, seed: '777', quality: 'performance', rng: rng.fork('world') });
const economy = new Economy({ gold: 9999999, wood: 999999, minerals: Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, 999])) });
const stats = { track() {}, set() {}, get() { return 0; } };
const player = { position: new THREE.Vector3(2000, 0, 2000), hp: 100, maxHp: 100, heal() {} };
const turrets = new TurretSystem({ scene, world, economy, stats, rng: rng.fork('turrets') });

const at = (x, z) => new THREE.Vector3(x, world.getHeight(x, z), z);
const idOf = (kind, tier) => TURRETS.find((t) => t.kind === kind && (!tier || t.tier === tier)).id;
const tick = (seconds, ctx = {}) => {
  const steps = Math.max(1, Math.round(seconds * 30));
  for (let i = 0; i < steps; i++) turrets.update(1 / 30, { enemies: [], player, world, turrets: turrets.turrets, ...ctx });
};
const drilled = () => Number(turrets.mineralsDrilled) || 0;

console.log('\n── ① 채굴기 — 전기가 있어야 돌고, 지형 티어 광물을 캔다 (전선 없이 6m 이내)');
const drill = turrets.place(idOf('autominer'), at(160, 160), 'local');
check('채굴기 건설', Boolean(drill));
const beforeNoPower = drilled();
tick(6);
check('전기가 없으면 채굴기가 멈춘다', drilled() === beforeNoPower, `${beforeNoPower} → ${drilled()}`);
check('정전 상태가 표시된다(stopped)', turrets.powerStatus().stopped >= 1, JSON.stringify(turrets.powerStatus().unpowered));

const gen = turrets.place(idOf('generator'), at(164, 160), 'local');
check('발전기 T1 건설(12kW)', Boolean(gen) && gen.type.output === 12);
check('발전기 4m 옆 → 전기 연결', drill.powered === true, `거리 4m ≤ deviceRange ${POWER.deviceRange}m`);
const beforeDrill = drilled();
tick(12);
check('전기가 통하면 채굴한다', drilled() > beforeDrill, `+${drilled() - beforeDrill}개`);
check('T1 지형(160,160) → 1등급 광물', drill._drillPoolNow?.every?.((id) => mineralsForRegionTier(1).includes(id)) && (drill._drillPoolNow?.length ?? 0) > 0, String(drill._drillPoolNow));
// 산출 속도 = 초당 1개(벨트 없음). 누적 소수점 때문에 ±1 여유를 둔다.
const beforeRate = drilled();
tick(10);
const gainedRate = drilled() - beforeRate;
check(
  '채굴기 산출 속도 = 초당 1개',
  drill.type.rate === 1 && gainedRate >= 9 && gainedRate <= 11,
  '10초 ' + gainedRate + '개 (rate ' + drill.type.rate + '/s)'
);

// T3 지형(수정 계곡 620~920m)으로 옮기면 3등급 광물을 캔다
const r3 = regionAt(0, 760);
check('(0,760) 은 T3 수정 계곡', r3?.id === 'tier3', `${r3?.id} ${r3?.name}`);
drill.position.set(0, world.getHeight(0, 760), 760);
drill.mineral = null;
drill._drillPhase = 0;
const gen2 = turrets.place(idOf('generator'), at(0, 764), 'local');
check('T3 지형에 발전기 배치', Boolean(gen2));
tick(1);
check('옮긴 채굴기도 전기를 받는다', drill.powered === true);
const beforeT3 = new Set(turrets.mineralTypesMined);
tick(30);
const gainedT3 = [...turrets.mineralTypesMined].filter((id) => !beforeT3.has(id));
// 고티어 지형에서는 낮은 등급 광물도 확률로 섞여 나온다(계약 §4.60) — 3등급 이하이면 통과.
check(
  'T3 지형 채굴기는 3등급 이하 광물을 캔다(저티어 랜덤 포함)',
  gainedT3.length > 0 && gainedT3.every((id) => Number(MINERAL_TYPES.find((m) => m.id === id)?.tier) <= 3) && gainedT3.some((id) => mineralsForRegionTier(3).includes(id)),
  gainedT3.join(',')
);
check('지형 정보가 채굴기에 기록된다', drill._drillRegion?.id === 'tier3', JSON.stringify(drill._drillRegion));

console.log('\n── ② 전선으로 먼 곳까지 전력 공급 (전선 8m · 건물 6m)');
const farGen = turrets.place(idOf('generator'), at(500, 700), 'local');
const cableIds = [];
for (let i = 0; i < 5; i++) if (turrets.place('facility_cable', at(506 + i * 7, 700), 'local')) cableIds.push(i);
const farDrill = turrets.place(idOf('autominer'), at(506 + 4 * 7 + 6, 700), 'local');
check('발전기 + 전선 5개 + 먼 채굴기', Boolean(farGen && farDrill) && cableIds.length === 5, `cables=${cableIds.length}`);
tick(1);
check('전선을 따라 34m 떨어진 채굴기에 전기가 간다', farDrill.powered === true, JSON.stringify(farDrill.powerNet));
const beforeFar = drilled();
tick(12);
check('먼 채굴기도 채굴한다', drilled() > beforeFar, `+${drilled() - beforeFar}개`);
check('전선은 포탑 상한과 별개로 센다', MAX_CABLES === 160 && turrets.turrets.filter((t) => t.type.kind === 'cable').length === 5);
check('발전기 바로 옆 전선이 없으면 끊긴다', (() => {
  const solo = turrets.place(idOf('autominer'), at(700, 700), 'local');
  turrets.place('facility_cable', at(720, 700), 'local'); // 20m 떨어진 전선 — 연결 불가
  turrets.updatePower(true);
  const ok = solo.powered === false;
  turrets.sell(solo.id);
  return ok;
})(), '전선이 6m 밖이면 전기가 오지 않는다');

console.log('\n── ③ 정전 — 소비가 공급을 넘으면 그 망의 건물이 멈춘다');
const g4 = turrets.place(idOf('generator'), at(800, 800), 'local');
const st1 = turrets.place(idOf('storage'), at(804, 800), 'local');
const st2 = turrets.place(idOf('storage'), at(804, 804), 'local');
const st3 = turrets.place(idOf('storage'), at(800, 804), 'local');
const sp1 = turrets.place(idOf('spawner'), at(796, 800), 'local');
tick(1);
const net4 = st1.powerNet ?? { supply: 0, demand: 0 };
check('발전기 12kW ≥ 소비 10kW (저장고 3 + 소환문 1)', net4.supply >= net4.demand && st1.powered === true, JSON.stringify(net4));
const sp2 = turrets.place(idOf('spawner'), at(796, 806), 'local');
tick(1);
const net5 = st1.powerNet ?? { supply: 0, demand: 0 };
check('소환문 추가 → 14kW > 12kW 로 정전', net5.supply < net5.demand && st1.powered === false, JSON.stringify(net5));
check('정전이면 소비 건물이 멈춘다', turrets.powerStatus().stopped >= 1, `stopped=${turrets.powerStatus().stopped}/${turrets.powerStatus().consumers}`);
const sp2Sold = turrets.sell(sp2.id);
tick(1);
check('소환문을 팔면 다시 작동', Boolean(sp2Sold) && st1.powered === true, JSON.stringify(st1.powerNet));

console.log('\n── ④ 저장고 — 용량까지 쌓이고, 가까이 가면(또는 E) 수거');
const storage = turrets.place(idOf('storage'), at(1200, 1200), 'local');
const genS = turrets.place(idOf('generator'), at(1204, 1200), 'local');
tick(3);
check('저장고가 전기를 받는다', storage.powered === true, JSON.stringify(storage.powerNet));
const st0 = storage.storageState();
check('수거 전에는 인벤토리로 안 들어가고 저장고에 쌓인다', st0.gold > 0 && st0.wood > 0, `gold=${st0.gold.toFixed(1)} wood=${st0.wood.toFixed(1)}`);
const storedBefore = Number(turrets.goldStored) || 0;
tick(40);
const st1b = storage.storageState();
check('용량(capacity)에서 멈춘다', Math.floor(st1b.gold) <= st1b.capacity && Math.floor(st1b.wood) <= st1b.capacity, `${Math.floor(st1b.gold)}/${st1b.capacity}`);
check('멀리 있으면 수거되지 않는다', (Number(turrets.goldStored) || 0) === storedBefore, `goldStored=${turrets.goldStored}`);
const manual = turrets.collectStorageNear(player.position, 99999);
check('E 수거 API — 멀어도 반경을 주면 수거된다', manual.gained > 0 && manual.storages >= 1, JSON.stringify(manual));
check('수거 후 버퍼가 비워진다', storage.storageState().gold < 1, JSON.stringify(storage.storageState()));
player.position.set(1200, world.getHeight(1200, 1200), 1200);
const storedBefore2 = Number(turrets.goldStored) || 0;
tick(6);
check('가까이 가면 자동 수거', (Number(turrets.goldStored) || 0) > storedBefore2, `goldStored=${turrets.goldStored}`);
player.position.set(2000, 0, 2000);

console.log('\n── ⑤ 저장고 티어 — 수급·용량·체력 상승 + 업그레이드');
const sT1 = TURRETS.find((t) => t.id === 'facility_storage');
const sT7 = TURRETS.find((t) => t.id === 'facility_storage_t7');
check('저장고 T1~T7 존재', Boolean(sT1 && sT7) && TURRETS.filter((t) => t.kind === 'storage').length === 7);
check('수급·용량·체력이 모두 상승', sT7.storeRate.gold > sT1.storeRate.gold && sT7.capacity > sT1.capacity && sT7.hp > sT1.hp,
  `T1 ${sT1.storeRate.gold}/s ${sT1.capacity} ${sT1.hp}hp → T7 ${sT7.storeRate.gold}/s ${sT7.capacity} ${sT7.hp}hp`);
check('저장고 업그레이드 경로(T1→T2)', turrets.nextTierType(storage)?.id === 'facility_storage_t2', turrets.nextTierType(storage)?.id);
const capBefore = storage.capacity;
check('업그레이드 성공', turrets.upgrade(storage.id) === true && storage.typeId === 'facility_storage_t2' && storage.capacity > capBefore,
  `${capBefore} → ${storage.capacity}`);

console.log('\n── ⑥ 발전기 티어·연결 규칙·재료 규칙');
const g1 = TURRETS.find((t) => t.id === 'facility_generator_t1');
const g7 = TURRETS.find((t) => t.id === 'facility_generator_t7');
check('발전기 T1~T7 + 출력 상승', Boolean(g1 && g7) && g7.output > g1.output, `${g1.output}kW → ${g7.output}kW`);
check('전선은 전기를 쓰지 않는다', TURRETS.find((t) => t.id === 'facility_cable').draw === 0);
check('벨트는 전기를 쓰지 않는다(기계식)', TURRETS.filter((t) => t.kind === 'conveyor').every((t) => t.draw === 0));
check('채굴기 소비 3kW · 저장고 2kW · 소환문 4kW', TURRETS.find((t) => t.kind === 'autominer').draw === 3 &&
  TURRETS.find((t) => t.kind === 'storage').draw === 2 && TURRETS.find((t) => t.kind === 'spawner').draw === 4);
check('티어 N 건물 = 티어 N 지형에서 나는 광물만', TURRETS.every((t) =>
  Object.keys(t.cost?.minerals ?? {}).every((id) => mineralsForRegionTier(t.tier).includes(id))));
check('히든 전용 광물은 건설 재료로 쓰지 않는다', TURRETS.every((t) =>
  !Object.keys(t.cost?.minerals ?? {}).some((id) => ['blossom_crystal', 'dream_petal', 'time_shard', 'frozen_hour'].includes(id))));
check('지역 티어 ↔ 광물 등급 규칙', mineralsForRegionTier(0).join() === mineralsForRegionTier(1).join() &&
  mineralsForRegionTier(6).join() === mineralsForRegionTier(5).join() &&
  regionAt(0, 0)?.mineralTiers?.length === 0);
check('지형 티어별 광물 목록 실재', [1, 2, 3, 4, 5].every((tier) => {
  const list = mineralsForRegionTier(tier);
  return list.length >= 3 && list.every((id) => MINERAL_TYPES.some((m) => m.id === id && m.tier === tier));
}), [1, 2, 3, 4, 5].map((t) => `T${t}:${mineralsForRegionTier(t).length}`).join(' '));

console.log('\n── ⑦ 전력망 단위 규칙(전선 8m / 건물 6m / 공급 ≥ 소비)');
const grid = new PowerGrid({ cableRange: POWER.cableRange, deviceRange: POWER.deviceRange });
const gs = { id: 'g', x: 0, z: 0, output: 10 };
check('전선 없이 6m 이내 건물은 연결', grid.rebuild([gs, { id: 'd', x: 5, z: 0, draw: 3 }]).short === false && grid.isPowered('d'));
grid.rebuild([gs, { id: 'd', x: 6.5, z: 0, draw: 3 }]);
check('6m 를 넘으면 연결 안 됨', grid.isPowered('d') === false);
grid.rebuild([gs, { id: 'c1', x: 6, z: 0, kind: 'cable' }, { id: 'c2', x: 13, z: 0, kind: 'cable' }, { id: 'd', x: 19, z: 0, draw: 3 }]);
check('전선끼리 8m 이내면 연결', grid.isPowered('d') === true);
grid.rebuild([gs, { id: 'c1', x: 6, z: 0, kind: 'cable' }, { id: 'c2', x: 15, z: 0, kind: 'cable' }, { id: 'd', x: 19, z: 0, draw: 3 }]);
check('전선 간격 8m 초과면 끊긴다', grid.isPowered('d') === false);
grid.rebuild([gs, { id: 'd', x: 4, z: 0, draw: 10 }]);
check('공급 = 소비면 작동', grid.status().short === false && grid.isPowered('d'));
grid.rebuild([gs, { id: 'd', x: 4, z: 0, draw: 10.5 }]);
check('공급 < 소비면 정지', grid.status().short === true && grid.isPowered('d') === false);
check('미등록 id 는 관대하게 통과(재계산 사이 멈춤 방지)', grid.isPowered('아직-없는-건물') === true);
check('NaN 좌표는 고립 처리', grid.rebuild([gs, { id: 'x', x: NaN, z: 0, draw: 3 }]).nodes === 2 && grid.isPowered('x') === false);
check('중복 id 는 하나로', grid.rebuild([gs, gs]).nodes === 1);


console.log('\n── ⑧ 추적 조준 — 포탑이 몬스터를 따라간다(§4.42)');
const aimSys = new TurretSystem({ scene, world, economy, stats, rng: rng.fork('aim') });
const aimDef = TURRETS.find((t) => t.category === 'attack' && t.tier === 1);
const tower = aimSys.place(aimDef.id, at(1400, 1400), 'local', { yaw: 0 });
check('공격 포탑 배치(조준 테스트)', Boolean(tower));
const enemy = { id: 'e1', alive: true, radius: 1, position: new THREE.Vector3(1410, world.getHeight(1410, 1400), 1400) };
const withEnemy = () => ({ enemies: [enemy], player, world, turrets: aimSys.turrets });
const noEnemy = () => ({ enemies: [], player, world, turrets: aimSys.turrets });
const tickAim = (seconds, without = false) => {
  const ctx = without ? noEnemy() : withEnemy();
  const steps = Math.max(1, Math.round(seconds * 30));
  for (let i = 0; i < steps; i++) aimSys.update(1 / 30, ctx);
};
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const bodyWantFor = (e) => Math.atan2(e.position.x - tower.position.x, e.position.z - tower.position.z) + Math.PI;
const barrelYaw = Math.atan2(enemy.position.x - tower.position.x, enemy.position.z - tower.position.z);
aimSys.update(1 / 30, withEnemy()); // 목표 획득(이 프레임에는 아직 돌지 않는다)
check('적을 조준 대상으로 잡는다', tower.aimTarget === enemy && aimSys.aimStatus().aiming === 1, JSON.stringify(aimSys.aimStatus()));
const yaw0 = tower.aimYaw;
aimSys.update(1 / 30, withEnemy());
const step1 = Math.abs(angDiff(tower.aimYaw, yaw0));
check('한 프레임에 순간이동하지 않는다(회전 속도 제한)', step1 > 0 && step1 <= 4.5 / 30 + 1e-6, 'Δ' + step1.toFixed(4) + 'rad');
tickAim(1.2);
const aimGap = Math.abs(angDiff(tower.aimYaw, bodyWantFor(enemy)));
check('1.2초 안에 적 쪽으로 몸체가 돌아간다', aimGap < 0.05, '오차 ' + aimGap.toFixed(4) + 'rad');
check('조준 상태가 추적 중으로 표시', tower.aimState().tracking === true && tower.aimState().targetId === 'e1', JSON.stringify(tower.aimState()));
const headFix = Math.abs(angDiff(tower.mesh.rotation.y + tower.head.rotation.y, barrelYaw));
check('포신은 목표를 정확히 가리킨다', headFix < 0.02, '오차 ' + headFix.toFixed(4) + 'rad');

// 플레이어가 X 로 돌리면 그 각도가 우선하고, 잠시 뒤 다시 추적한다
const manualYaw = 0.9;
aimSys.setYaw(tower.id, manualYaw);
tickAim(0.25);
const manualGap = Math.abs(angDiff(tower.mesh.rotation.y, manualYaw));
check('수동 회전 중에는 플레이어 각도를 지킨다', manualGap < 0.05 && tower.aimState().holding === true, '오차 ' + manualGap.toFixed(3) + 'rad');
const headFix2 = Math.abs(angDiff(tower.mesh.rotation.y + tower.head.rotation.y, barrelYaw));
check('몸체가 돌아가도 포신은 계속 목표를 가리킨다', headFix2 < 0.02, '오차 ' + headFix2.toFixed(4) + 'rad');
tickAim(2.4); // holdTime(1.6s) + 추적 재개
const resumed = Math.abs(angDiff(tower.aimYaw, bodyWantFor(enemy)));
check('수동 우선 시간이 지나면 다시 추적한다', resumed < 0.05 && tower.aimState().holding === false, '오차 ' + resumed.toFixed(3) + 'rad');

// 적이 사라지면(setYaw 없이) 플레이어가 정한 제자리 각도로 스스로 복귀
const awayFromRest = Math.abs(angDiff(tower.aimYaw, manualYaw));
check('추적 중에는 제자리 각도에서 벗어나 있다', awayFromRest > 0.3, 'Δ' + awayFromRest.toFixed(3) + 'rad');
tickAim(2.2, true);
const backGap = Math.abs(angDiff(tower.aimYaw, manualYaw));
check('적이 사라지면 제자리 각도로 돌아온다', backGap < 0.05 && tower.aimState().tracking === false && tower.aimState().targetId === null, '오차 ' + backGap.toFixed(3) + 'rad');
check('적이 없으면 추적 집계 0', aimSys.aimStatus().aiming === 0, JSON.stringify(aimSys.aimStatus()));

// 뒤쪽(180°) 적도 최단 경로로 돈다
aimSys.setYaw(tower.id, 0);
tickAim(1.7, true); // 수동 우선(1.6s)을 흘려보낸다 — 적이 없으므로 제자리 0 유지
enemy.position.set(1390, world.getHeight(1390, 1400), 1400);
aimSys.update(1 / 30, withEnemy());
const behindWant = bodyWantFor(enemy);
const beforeBehind = tower.aimYaw;
aimSys.update(1 / 30, withEnemy());
const moved = angDiff(tower.aimYaw, beforeBehind);
const path = angDiff(behindWant, beforeBehind);
check('뒤쪽 적도 최단 경로로 돈다', Math.sign(moved) === Math.sign(path) && Math.abs(moved) <= 4.5 / 30 + 1e-6, 'Δ' + moved.toFixed(3) + ' / 목표 ' + path.toFixed(3));
tickAim(1.2);
const behindGap = Math.abs(angDiff(tower.aimYaw, bodyWantFor(enemy)));
check('180° 뒤 적에게도 1.2초 안에 붙는다', behindGap < 0.05, '오차 ' + behindGap.toFixed(3) + 'rad');
check('몸체 각도는 -π..π 로 정규화', Math.abs(tower.aimYaw) <= Math.PI + 1e-9, String(tower.aimYaw));


console.log('\n── ⑨ 연사 정상화 — 표시된 연사(fireRate)만큼만 쏜다(프레임레이트 무관)');
const fireSys = new TurretSystem({ scene, world, economy, stats, rng: rng.fork('fire') });
let shots = 0;
fireSys.projectiles = { spawn: () => { shots += 1; return { id: shots }; } }; // 발사 횟수만 센다
const arrow = TURRETS.find((t) => t.id === 'atk_arrow_t1_0') ?? TURRETS.find((t) => t.category === 'attack' && t.tier === 1);
const arrowTower = fireSys.place(arrow.id, at(1300, 1300), 'local', { yaw: 0 });
check('연사 테스트용 공격 포탑 배치', Boolean(arrowTower));
const dummy = (id, x, z) => ({ id, alive: true, radius: 1, position: new THREE.Vector3(x, world.getHeight(x, z), z) });
const arrowEnemy = dummy('e9', 1312, 1300);
const shootFor = (tower, seconds, fps, enemies) => {
  shots = 0;
  tower.cooldown = 0;
  const ctx = { enemies: enemies ?? [arrowEnemy], player, world, turrets: fireSys.turrets };
  const steps = Math.max(1, Math.round(seconds * fps));
  for (let i = 0; i < steps; i++) fireSys.update(1 / fps, ctx);
  return shots;
};
check(
  '연사 보정 상수 적용 — 피해 ×TURRET_DAMAGE_SCALE',
  arrow.damage === Math.round(13 * TOWER_TIER_SCALE[1].damage * TURRET_DAMAGE_SCALE),
  '피해 ' + arrow.damage + ' (×' + TURRET_DAMAGE_SCALE + ')'
);
const shots60 = shootFor(arrowTower, 10, 60);
check(
  '10초 동안 "연사 × 시간" 만큼만 쏜다',
  shots60 >= Math.floor(arrow.fireRate * 10) && shots60 <= Math.ceil(arrow.fireRate * 10) + 1,
  shots60 + '발 (연사 ' + arrow.fireRate + '/s)'
);
check('프레임마다 쏘지 않는다(회귀 방지)', shots60 < 20, shots60 + '발 — 예전 버그라면 600발');
const shots30 = shootFor(arrowTower, 10, 30);
const shots120 = shootFor(arrowTower, 10, 120);
check('프레임레이트가 달라도 발사 수가 같다', Math.abs(shots30 - shots120) <= 1, '30fps ' + shots30 + '발 · 120fps ' + shots120 + '발');
const arcane = TURRETS.find((t) => t.family === 'arcane' && t.tier === 1);
const siege = TURRETS.find((t) => t.family === 'siege' && t.tier === 1);
// 다른 포탑의 발사가 섞이지 않게 계열별로 **독립 시스템에 1기만** 세워 10초를 잰다.
const shotsOfOne = (typeId) => {
  const sys = new TurretSystem({ scene, world, economy, stats, rng: rng.fork('fire-one') });
  let n = 0;
  sys.projectiles = { spawn: () => { n += 1; return { id: n }; } };
  const tower = sys.place(typeId, at(1300, 1300), 'local', { yaw: 0 });
  const ctx = { enemies: [dummy('e9b', 1312, 1300)], player, world, turrets: sys.turrets };
  for (let i = 0; i < 600; i++) sys.update(1 / 60, ctx); // 10초
  return n;
};
const arcShots = shotsOfOne(arcane.id);
const sieShots = shotsOfOne(siege.id);
check('연사가 빠른 탑이 더 많이 쏜다(연사가 실제로 DPS 를 가른다)', arcShots > sieShots * 2, '비전 ' + arcShots + '발 vs 공성 ' + sieShots + '발');

// 실제 발사체 풀(400) 검증 — 예전처럼 초당 60발이면 풀이 포화되어 플레이어 사격까지 막힌다
const ps = new ProjectileSystem({ scene: new THREE.Scene(), max: 400 });
fireSys.projectiles = ps;
let placedMany = 0;
for (let i = 0; i < 12; i++) {
  const t = fireSys.place(arrow.id, at(1390 + i * 4, 1300), 'local', { yaw: 0 });
  if (t) placedMany += 1;
}
check('포탑 12기 추가 배치', placedMany === 12, placedMany + '기');
const swarm = [dummy('sw1', 1400, 1330), dummy('sw2', 1412, 1330), dummy('sw3', 1424, 1330), dummy('sw4', 1436, 1330)];
const poolCtx = { enemies: swarm, player, world, turrets: fireSys.turrets };
for (let i = 0; i < 300; i++) fireSys.update(1 / 60, poolCtx); // 5초
const active = ps._records.filter((r) => r.active).length;
const playerShot = ps.spawn({ origin: new THREE.Vector3(0, 2, 0), direction: new THREE.Vector3(0, 0, 1), speed: 40, damage: 10 });
check('포탑 12기가 쏴도 발사체 풀이 남아 있다', active < 120 && ps._free.length > 250, '사용 ' + active + '/400 · 여유 ' + ps._free.length);
check('플레이어 사격이 풀 포화로 막히지 않는다', Boolean(playerShot), playerShot ? 'id ' + playerShot.id : 'null(포화!)');

console.log('\n── ⑩ 활 · 화살 — 계열 제단 레시피 · 발당 피해 · 묶음 제작 · 유물 활');
{
  const arrowRichEco = () => new Economy({ gold: 5000000, wood: 500000, minerals: Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, 999])) });
  const arrowCtxOf = (owned = new Set()) => ({ wave: 200, cleared: 199, hasWeapon: (id) => owned.has(id), onCrafted: (id) => owned.add(id) });

  // (1) 활 T1~T7 — 각 티어 제단에서 그 티어 활을 만들 수 있고, 다른 티어 제단에서는 못 만든다
  const bowTierBad = [];
  for (let tier = 1; tier <= 7; tier += 1) {
    const recipe = FAMILY_TIER_RECIPES.find((r) => r.tier === tier);
    const bowW = recipe ? weaponById(recipe.weaponId) : null;
    if (!recipe || !bowW || bowW.family !== 'bow' || bowW.tier !== tier || CRAFTING_TABLE_BY_ID[recipe.table]?.tier !== tier) {
      bowTierBad.push(`T${tier}:${recipe?.weaponId ?? '없음'}`);
      continue;
    }
    const eco = arrowRichEco();
    const ctx = arrowCtxOf();
    const cs = new CraftingSystem({ getEconomy: () => eco, getContext: () => ctx });
    const builtOk = cs.build(recipe.table, ctx).ok;
    const crafted = cs.craft(recipe.weaponId, ctx);
    if (!builtOk || !crafted.ok || crafted.weapon?.id !== recipe.weaponId) bowTierBad.push(`T${tier}:제작 ${crafted.error ?? ''}`);
    const eco2 = arrowRichEco();
    const ctx2 = arrowCtxOf();
    const cs2 = new CraftingSystem({ getEconomy: () => eco2, getContext: () => ctx2 });
    for (const other of FAMILY_TIER_RECIPES) if (other.tier !== tier) cs2.build(other.table, ctx2);
    if (cs2.canCraft(recipe.weaponId, ctx2).ok) bowTierBad.push(`T${tier}:다른 제단에서도 제작됨`);
  }
  check(
    '활 T1~T7 = 각 티어 제단 레시피 (티어 일치 · 다른 제단 불가)',
    FAMILY_TIER_RECIPES.length === 7 && bowTierBad.length === 0,
    bowTierBad.join(',') || FAMILY_TIER_RECIPES.map((r) => `${r.weaponId}@${r.table}`).join(' ')
  );

  // (2) 발당 피해 배수 = 티어 순 단조 증가 · 실제 피해 = 무기 피해 × 배수(반올림)
  const arrowMultBad = [];
  for (let i = 0; i < ARROW_TIERS.length; i += 1) {
    const a = ARROW_TIERS[i];
    if (i > 0 && !(a.damageMult > ARROW_TIERS[i - 1].damageMult)) arrowMultBad.push(`${a.id}:비단조`);
    if (arrowDamageMult(a.id) !== a.damageMult) arrowMultBad.push(`${a.id}:조회 불일치`);
  }
  const bowRelicW = weaponById('bow_forever');
  const dmgT1 = Math.round(bowRelicW.damage * ARROW_BY_ID.arrow_t1.damageMult);
  const dmgT7 = Math.round(bowRelicW.damage * ARROW_BY_ID.arrow_t7.damageMult);
  check(
    '화살 발당 피해 = 무기 피해 × 배수 (반올림) · 티어 단조 증가',
    arrowMultBad.length === 0 && ARROW_TIERS.length === 7 && dmgT1 === 70 && dmgT7 === 130 && dmgT7 > dmgT1,
    arrowMultBad.join(',') || `T1 ${dmgT1} → T7 ${dmgT7} (무기 ${bowRelicW.damage})`
  );

  // (3) 화살 0발이면 발사 불가
  const noArrowEco = new Economy({ gold: 0, wood: 0 });
  check(
    '화살 0발 = 발사 불가 (firstArrowIn null)',
    noArrowEco.firstArrowIn(ARROW_ORDER_DESC) === null && noArrowEco.totalArrows() === 0,
    `firstArrowIn=${noArrowEco.firstArrowIn(ARROW_ORDER_DESC)}`
  );

  // (4) 1발 소모 → 발수가 정확히 1 줄고, 0발이 되면 다시 null
  noArrowEco.addArrow('arrow_t3', 1);
  const oneArrow = noArrowEco.firstArrowIn(ARROW_ORDER_DESC);
  const arrowsBeforeSpend = noArrowEco.getArrow('arrow_t3');
  const arrowUsed = noArrowEco.spendArrow('arrow_t3', 1);
  const arrowsAfterSpend = noArrowEco.getArrow('arrow_t3');
  check(
    '화살 1발 소모 = 발수 정확히 -1 · 0발이면 다시 null',
    oneArrow === 'arrow_t3' && arrowUsed === true && arrowsBeforeSpend - arrowsAfterSpend === 1 && arrowsAfterSpend === 0 && noArrowEco.firstArrowIn(ARROW_ORDER_DESC) === null,
    `1발 ${oneArrow} → 소모 ${arrowUsed} → ${arrowsAfterSpend}발 · firstArrowIn=${noArrowEco.firstArrowIn(ARROW_ORDER_DESC)}`
  );

  // (5) 묶음 제작 = 정확히 bundle 만큼 · 비용만큼 차감 · 재료 부족이면 불변
  const batchEco = arrowRichEco();
  const batchCtx = arrowCtxOf();
  const batchSys = new CraftingSystem({ getEconomy: () => batchEco, getContext: () => batchCtx });
  batchSys.build('forge_t3', batchCtx);
  const t3Recipe = batchSys.arrowRecipe('arrow_t3');
  const batchGold0 = batchEco.gold;
  const batchWood0 = batchEco.wood;
  const batchArrows0 = batchEco.getArrow('arrow_t3');
  const batchRes = batchSys.craftArrow('arrow_t3');
  const batchGained = batchEco.getArrow('arrow_t3') - batchArrows0;
  const batchGoldSpent = batchGold0 - batchEco.gold;
  const batchWoodSpent = batchWood0 - batchEco.wood;
  // 재료가 모자라면 아무것도 줄지 않는다 (제단은 이미 세운 상태에서 자원만 비운다)
  const poorEco = arrowRichEco();
  const poorCtx = arrowCtxOf();
  const poorSys = new CraftingSystem({ getEconomy: () => poorEco, getContext: () => poorCtx });
  poorSys.build('forge_t3', poorCtx);
  poorEco.gold = 0;
  poorEco.wood = 0;
  poorEco.minerals = {};
  const poorArrows0 = poorEco.totalArrows();
  const poorMinerals0 = poorEco.totalMinerals();
  const poorRes = poorSys.craftArrow('arrow_t3');
  const poorUntouched = poorEco.gold === 0 && poorEco.wood === 0 && poorEco.totalArrows() === poorArrows0 && poorEco.totalMinerals() === poorMinerals0;
  check(
    '화살 묶음 제작 = bundle 만큼 증가 · 비용만큼 차감 · 재료 부족이면 불변',
    batchRes.ok === true && batchGained === t3Recipe.amount && t3Recipe.amount === ARROW_BY_ID.arrow_t3.bundle &&
      batchGoldSpent === t3Recipe.cost.gold && batchWoodSpent === t3Recipe.cost.wood &&
      poorRes.ok === false && poorUntouched === true,
    `${batchGained}발 (bundle ${ARROW_BY_ID.arrow_t3.bundle}) · ${batchGoldSpent}G/${batchWoodSpent}목 차감 · 부족 ok=${poorRes.ok} 불변=${poorUntouched}`
  );

  // (6) 유물 활 수치 — 피해 70 · 관통 3 · 궁극기 eternalLove · bow_relic 과 다른 무기
  const plainRelicBow = weaponById('bow_relic');
  check(
    '유물 활 = 피해 70 · 관통 3 · 궁극기 eternalLove (bow_relic 과 다른 무기)',
    bowRelicW?.damage === 70 && bowRelicW?.pierce === 3 && bowRelicW?.ultimate === 'eternalLove' &&
      WEAPON_ULTIMATE_BY_ID.eternalLove?.weapon === 'bow_forever' &&
      bowRelicW.id !== plainRelicBow.id && bowRelicW.name !== plainRelicBow.name &&
      WEAPONS.filter((w) => w.id === 'bow_forever').length === 1 && WEAPONS.filter((w) => w.id === 'bow_relic').length === 1,
    `${bowRelicW?.name} dmg ${bowRelicW?.damage}/관통 ${bowRelicW?.pierce}/${bowRelicW?.ultimate} vs ${plainRelicBow?.name} dmg ${plainRelicBow?.damage}`
  );
}

console.log(`\n결과: ${pass}개 통과 / ${fail}개 실패`);
process.exit(fail > 0 ? 1 : 0);

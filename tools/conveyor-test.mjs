// 요새의 수호자 — 컨베이어벨트 물류 통합 테스트(계약 §4.68).
//
//   node tools/conveyor-test.mjs
//
// 검증:
//  ① 순수 규칙(방향·용량·간격·막힘·연결·마주보기·적재) 자체 검증
//  ② 채굴기가 캔 광물이 옆 벨트에 실제로 올라간다(입금은 하역 때)
//  ③ 벨트 사슬을 따라 흘러 앞 건물에 하역 → 그때 광물이 입금된다
//  ④ 자리가 없으면 막히고, 벨트가 없으면 예전처럼 즉시 입금된다
//  ⑤ 저장·복원이 벨트 위 광물까지 되살린다
//  ⑥ 티어가 높으면 더 빨리 나른다
//  ⑦ 벨트 위 광물 상자가 3D 로 보인다(광물 색 · 위치 이동)
import * as THREE from 'three';
import { createWorld } from '../client/src/world/world.js';
import { createRNG } from '../client/src/utils/rng.js';
import { Turret, TurretSystem } from '../client/src/systems/turrets.js';
import { beltForward, beltCapacity, beltLoad, validateConveyorLogic, BELT_ITEM_GAP } from '../client/src/systems/conveyors.js';
import { TURRET_BY_ID, MINERAL_TYPES } from '../client/src/data.js';
import { Economy } from '../client/src/systems/economy.js';
import { AchievementSystem } from '../client/src/systems/achievements.js';
import { ProjectileSystem } from '../client/src/player/projectiles.js';

const MINERAL_BY_ID = Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, m]));

let pass = 0;
let fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 46 - t.length))}`);

const silentAudio = { play() {}, startBGM() {}, stopBGM() {}, setVolume() {} };
const rng = createRNG('conveyor');
const scene = new THREE.Scene();
const world = createWorld({ scene, seed: 'belt-777', quality: 'performance', rng: rng.fork('world') });
world.nearestMineral = () => null;

const economy = new Economy({ gold: 100000 });
const projectiles = new ProjectileSystem({ scene, audio: silentAudio, groundHeight: (x, z) => world.getHeight(x, z) });
const turrets = new TurretSystem({
  scene,
  world,
  economy,
  projectiles,
  audio: silentAudio,
  stats: new AchievementSystem({}),
  rng: rng.fork('turrets')
});

const DRILL = TURRET_BY_ID.facility_autominer;
const beltType = (tier) => TURRET_BY_ID['facility_conveyor_t' + tier];
const STORAGE = TURRET_BY_ID.facility_storage;

function makeTurret(type, x, z, yaw = 0) {
  const t = new Turret({
    id: `${type.id}-${Math.round(x)}-${Math.round(z)}`,
    type,
    position: new THREE.Vector3(x, 0, z),
    ownerId: 'test',
    scene,
    system: turrets,
    yaw
  });
  t.powered = true;
  t.mineral = null;
  turrets.turrets.push(t);
  return t;
}

const makeDrill = (x, z) => makeTurret(DRILL, x, z);
const makeBelt = (x, z, tier = 1, yaw = 0) => makeTurret(beltType(tier), x, z, yaw);

/** 채굴기 + 벨트들을 초 단위로 돌린다. */
function run(drill, belts, seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    drill._updateAutoMiner(1 / 60);
    for (const belt of belts) belt._updateConveyor(1 / 60);
  }
}

const total = (obj) => Object.values(obj).reduce((a, b) => a + Number(b || 0), 0);

// ── ① 순수 규칙 ─────────────────────────────────────────────────
section('① 물류 규칙(순수 로직)');
const errors = validateConveyorLogic();
check('자체 검증 — 방향·용량·간격·막힘·연결·마주보기·적재', errors.length === 0, errors.join(' / ') || '전부 통과');
const f0 = beltForward(0);
check('yaw 0 의 진행 방향은 -Z', Math.abs(f0.x) < 1e-9 && Math.abs(f0.z + 1) < 1e-9, `(${f0.x.toFixed(2)}, ${f0.z.toFixed(2)})`);

// ── ② 채굴기 → 벨트 적재 ────────────────────────────────────────
section('② 채굴기가 캔 광물이 벨트에 올라간다');
const belts0 = [makeBelt(0, -3.2, 1), makeBelt(0, -6.4, 1), makeBelt(0, -9.6, 1)];
const drill0 = makeDrill(0, 0);
const storage0 = makeTurret(STORAGE, 0, -12.8);
const before2 = total(economy.minerals);
run(drill0, belts0, 3);
const onBelt = belts0.reduce((n, b) => n + (b.beltItems?.length ?? 0), 0);
check('벨트 위에 광물 상자가 올라간다', onBelt > 0, `${onBelt}개 · ${belts0.map((b) => b.beltItems?.length ?? 0).join('/')}`);
check('올라간 동안에는 입금되지 않는다(하역 때 입금)', total(economy.minerals) === before2, `${before2} → ${total(economy.minerals)}`);
check('적재 수가 통계에 남는다', Number(turrets.beltLoaded) >= onBelt, `beltLoaded ${turrets.beltLoaded}`);

// ── ③ 사슬 → 하역 → 입금 ────────────────────────────────────────
section('③ 사슬을 따라 흘러 앞 건물에 하역한다');
run(drill0, belts0, 12);
const delivered = Number(turrets.beltDelivered) || 0;
const credited = total(economy.minerals) - before2;
check('하역이 일어난다', delivered > 0, `${delivered}회`);
check('하역한 만큼 광물이 입금된다', credited >= delivered, `입금 ${credited} / 하역 ${delivered}`);
check('마지막 건물이 하역 대상으로 기록된다', turrets.lastBeltReceiverId === storage0.id, String(turrets.lastBeltReceiverId));
check('사슬 끝에 막힌 벨트가 없다', Number(turrets.beltJammed) === 0, `막힘 ${turrets.beltJammed}`);

// ── ④ 막힘 · 벨트 없음 ──────────────────────────────────────────
section('④ 막힘과 예전 동작');
const lone = makeBelt(200, 200, 1);
const loneDrill = makeDrill(200, 201.4);
for (let i = 0; i < beltCapacity(lone); i += 1) beltLoad(loneDrill, 'iron', 1, [lone]);
check('가득 찬 벨트에는 더 못 올린다', beltLoad(loneDrill, 'iron', 1, [lone]) === 0, `${lone.beltItems.length}개`);
run(loneDrill, [lone], 3);
check('앞이 비면 끝에서 막힌다', lone.jammed === true, `jammed ${lone.jammed} · t ${Number(lone.beltItems?.[0]?.t).toFixed(2)}`);
const soloDrill = makeDrill(400, 400);
const before4 = total(economy.minerals);
run(soloDrill, [], 3);
check('벨트가 없으면 예전처럼 즉시 입금된다', total(economy.minerals) > before4, `+${total(economy.minerals) - before4}`);

// ── ⑤ 저장·복원 ─────────────────────────────────────────────────
section('⑤ 저장·복원 — 벨트 위 광물까지');
const b1 = makeBelt(600, 600, 3);
beltLoad(makeDrill(600, 601.4), 'iron', 3, [b1]);
for (let i = 0; i < 20; i += 1) b1._updateConveyor(1 / 60);
const saved = turrets.toJSON();
const savedBelt = (saved.turrets ?? []).find((t) => t.typeId === b1.typeId && Math.round(t.x) === 600 && t.y >= 0);
check('벨트 위 광물이 저장된다', Array.isArray(savedBelt?.items) && savedBelt.items.length === b1.beltItems.length, `${savedBelt?.items?.length ?? 0}개`);
const restored = new TurretSystem({ scene: new THREE.Scene(), world, economy, projectiles, audio: silentAudio, stats: new AchievementSystem({}), rng: rng.fork('restore') });
restored.fromJSON(saved);
const rb = restored.turrets.find((t) => t.typeId === b1.typeId && Math.round(t.position.x) === 600 && Math.round(t.position.z) === 600);
check('복원된 벨트에 광물이 그대로 있다', (rb?.beltItems?.length ?? 0) === b1.beltItems.length, `${rb?.beltItems?.length ?? 0} / ${b1.beltItems.length}`);
check('복원 순서가 앞 → 뒤(t 내림차순)', (rb?.beltItems ?? []).every((it, i, arr) => i === 0 || arr[i - 1].t >= it.t), (rb?.beltItems ?? []).map((it) => it.t.toFixed(2)).join(' ≥ '));
check('모르는 광물은 복원하지 않는다', (() => {
  const bad = JSON.parse(JSON.stringify(saved));
  const entry = (bad.turrets ?? []).find((t) => t.typeId === b1.typeId && Math.round(t.x) === 600);
  if (entry) entry.items = [{ id: '없는광물', t: 0.5 }, { id: 'iron', t: 0.5 }];
  const s2 = new TurretSystem({ scene: new THREE.Scene(), world, economy, projectiles, audio: silentAudio, stats: new AchievementSystem({}), rng: rng.fork('restore2') });
  s2.fromJSON(bad);
  const b2 = s2.turrets.find((t) => t.typeId === b1.typeId && Math.round(t.position.x) === 600);
  return (b2?.beltItems?.length ?? -1) === 1;
})(), '아는 광물 1개만 남는다');

// ── ⑥ 티어 = 속도 ───────────────────────────────────────────────
section('⑥ 티어가 높으면 더 빨리 나른다');
function throughput(tier, seconds) {
  // 티어마다 **독립된 시스템**에서 잰다(앞 시험의 잔여 건물·카운터에 영향받지 않게)
  const fresh = new TurretSystem({
    scene: new THREE.Scene(),
    world,
    economy,
    projectiles,
    audio: silentAudio,
    stats: new AchievementSystem({}),
    rng: rng.fork(`belt-t${tier}`)
  });
  const mk = (id, x, z, yaw = 0) => {
    const t = new Turret({
      id: `${id}-${tier}-${Math.round(x)}-${Math.round(z)}`,
      type: TURRET_BY_ID[id],
      position: new THREE.Vector3(x, 0, z),
      ownerId: 'test',
      scene: fresh.scene,
      system: fresh,
      yaw
    });
    t.powered = true;
    t.mineral = null;
    fresh.turrets.push(t);
    return t;
  };
  const chain = [mk(`facility_conveyor_t${tier}`, 800, -3.2), mk(`facility_conveyor_t${tier}`, 800, -6.4)];
  mk('facility_storage', 800, -9.6);
  const drill = mk('facility_autominer', 800, 0);
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i += 1) {
    drill._updateAutoMiner(1 / 60);
    for (const belt of chain) belt._updateConveyor(1 / 60);
  }
  return { moved: Number(fresh.beltDelivered) || 0, loaded: Number(fresh.beltLoaded) || 0, jammed: Number(fresh.beltJammed) || 0 };
}
const slow = throughput(1, 8);
const fast = throughput(7, 8);
check('T7 벨트가 T1 보다 많이 나른다', fast.moved > slow.moved, `T1 ${slow.moved}개 · T7 ${fast.moved}개`);
check('T7 체인이 막히지 않는다', fast.jammed === 0 && fast.moved >= slow.moved + 2, `막힘 ${fast.jammed} · T7 ${fast.moved} / T1 ${slow.moved}`);

// ── ⑦ 3D 표현 ───────────────────────────────────────────────────
section('⑦ 벨트 위 광물 상자가 보인다');
const visual = makeBelt(1000, 0, 2);
beltLoad(makeDrill(1000, 1.4), 'iron', 2, [visual]);
const zBefore = (() => { visual._animate(1 / 60); const c = (visual._beltCrates ?? []).find((m) => m.visible); return Number(c?.position?.z); })();
for (let i = 0; i < 12; i += 1) { visual._updateConveyor(1 / 60); visual._animate(1 / 60); }
const crates = (visual._beltCrates ?? []).filter((m) => m.visible);
const zAfter = Number(crates[0]?.position?.z);
check('상자 메시가 광물 수만큼 보인다', crates.length === visual.beltItems.length && crates.length === 2, `${crates.length}개`);
check('상자가 진행 방향(-Z)으로 흐른다', zAfter < zBefore, `${zBefore.toFixed(2)} → ${zAfter.toFixed(2)}`);
check('상자 색이 광물 색(철)이다', String(crates[0]?.material?.color?.getHexString?.() ?? '') === Number(MINERAL_BY_ID.iron.color).toString(16).padStart(6, '0'), `#${crates[0]?.material?.color?.getHexString?.()} (데이터 #${Number(MINERAL_BY_ID.iron.color).toString(16)})`);
check('상자 간격이 규칙 이상 벌어진다', (() => {
  const len = Number(visual.type.beltLength) || 3.4;
  return visual.beltItems.every((it, i, arr) => i === 0 || (arr[i - 1].t - it.t) * len >= BELT_ITEM_GAP - 1e-6);
})(), visual.beltItems.map((it) => it.t.toFixed(2)).join(' ≥ '));

console.log(`\n컨베이어벨트 테스트: ${pass}개 통과 / ${fail}개 실패 (총 ${pass + fail}개)`);
process.exit(fail ? 1 : 0);

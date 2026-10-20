// 요새의 수호자 — 채굴기 티어 채굴 통합 테스트(계약 §4.60).
//
//   node tools/drill-tier-test.mjs
//
// 검증:
//  ① 맨땅에서 지형 티어 광물을 캔다(T1 지형 → 1등급).
//  ② T1 채굴기 + T1 지형은 예전 그대로 초당 1개.
//  ③ 고티어 채굴기(또는 고티어 지형)는 저티어 광물 채굴량이 늘어난다.
//  ④ 고티어 채굴기는 저티어 광물도 랜덤으로 캔다.
//  ⑤ 업그레이드한 채굴기의 티어/속도가 저장·복원에서 유지된다.
import * as THREE from 'three';
import { createWorld } from '../client/src/world/world.js';
import { createRNG } from '../client/src/utils/rng.js';
import { Turret, TurretSystem, drillPower, drillYieldBonus, drillLowTierChance } from '../client/src/systems/turrets.js';
import { TURRET_BY_ID, MINERAL_TYPES, mineralsForRegionTier } from '../client/src/data.js';
import { REGIONS } from '../client/src/world/regions.js';
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
const rng = createRNG('drill-tier');
const scene = new THREE.Scene();
const world = createWorld({ scene, seed: 'drill-777', quality: 'performance', rng: rng.fork('world') });
// 맨땅 시추 경로만 검사한다(광물 노드 무시).
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

const AM = TURRET_BY_ID.facility_autominer;
const tier5Ring = REGIONS.find((r) => r.tier === 5);
const POS = {
  t1: new THREE.Vector3(160, 0, 160),
  t3: new THREE.Vector3(0, 0, 760),
  t5: new THREE.Vector3(0, 0, tier5Ring ? (tier5Ring.inner + tier5Ring.outer) / 2 : 1400)
};

function makeDrill(pos, tier = 1) {
  const drill = new Turret({
    id: `drill-${tier}-${Math.round(pos.x)}-${Math.round(pos.z)}`,
    type: AM,
    position: pos,
    ownerId: 'test',
    scene,
    system: turrets
  });
  drill.tier = tier;
  drill.rate = 1;           // 속도는 고정 — 순수하게 "티어 보정" 효과만 본다
  drill.powered = true;     // 전기 검사는 base-bugtest 담당
  drill.mineral = null;
  return drill;
}

/** 초 단위로 시추를 돌리고 { total, types } 를 돌려준다. */
function run(drill, seconds) {
  const before = { ...economy.minerals };
  const beforeDrilled = Number(turrets.mineralsDrilled) || 0;
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) drill._updateAutoMiner(1 / 60);
  const gained = {};
  for (const [id, n] of Object.entries(economy.minerals)) {
    const d = Number(n) - Number(before[id] ?? 0);
    if (d > 0) gained[id] = d;
  }
  return {
    gained,
    types: Object.keys(gained),
    total: Object.values(gained).reduce((a, b) => a + b, 0),
    drilled: (Number(turrets.mineralsDrilled) || 0) - beforeDrilled
  };
}

// ① 맨땅 + 지형 티어
section('① 맨땅 시추 — 지형 티어 광물');
const t1 = makeDrill(POS.t1, 1);
const r1 = run(t1, 10);
check('T1 지형에서 캔 광물이 모두 1등급', r1.types.length > 0 && r1.types.every((id) => mineralsForRegionTier(1).includes(id)), r1.types.join(', '));
check('채굴량이 mineralsDrilled 에 누적', r1.drilled === r1.total, `${r1.drilled} / ${r1.total}`);

// ①-b 채굴 모션(계약 §4.63)
section('①-b 채굴 모션 — 회전 날 · 왕복 슬리브 · 먼지 링');
const bit = t1.head?.userData?.bit ?? null;
const sleeve = t1.head?.userData?.sleeve ?? null;
const dust = t1.head?.userData?.dust ?? null;
check('채굴기 머리에 회전 날·슬리브·먼지 부품이 있다', Boolean(bit && sleeve && dust), `bit ${Boolean(bit)} sleeve ${Boolean(sleeve)} dust ${Boolean(dust)}`);
check('캐는 동안 모션 펄스가 켜진다', Number(t1._minePulse) > 0, String(t1._minePulse));
const beforeSpin = Number(t1._drillSpin) || 0;
for (let i = 0; i < 30; i++) t1._animate(1 / 60);
const afterSpin = Number(t1._drillSpin) || 0;
check('날이 실제로 회전한다', afterSpin > beforeSpin && Math.abs(Number(bit?.rotation?.y) - afterSpin) < 1e-6, `${beforeSpin.toFixed(2)} → ${afterSpin.toFixed(2)} rad`);
// 지형별 색 티끌(계약 §4.63) — T1 지형은 초원색 #7ee081
const tint = String(t1.head?.userData?.dustMat?.color?.getHexString?.() ?? '');
const t3tint = makeDrill(POS.t3, 1);
run(t3tint, 2);
for (let i = 0; i < 3; i++) t3tint._animate(1 / 60);
const tint3 = String(t3tint.head?.userData?.dustMat?.color?.getHexString?.() ?? '');
check('티끌이 T1 지형 색으로 물든다(#7ee081)', tint === '7ee081', `#${tint}`);
check('지형이 바뀌면 티끌 색도 바뀐다(T3 ≠ T1)', tint3 !== '' && tint3 !== tint, `T1 #${tint} · T3 #${tint3}`);
check('먼지 링이 보였다가 사라진다(수명 0.35초)', dust?.visible === false, `펄스 ${Number(t1._minePulse).toFixed(3)}`);
const poweredOff = makeDrill(POS.t1, 1);
poweredOff.powered = false;
for (let i = 0; i < 10; i++) poweredOff._animate(1 / 60);
check('전기가 없으면 채굴 모션이 멈춘다', Number(poweredOff._minePulse) === 0 && Number(poweredOff._drillSpin || 0) < 0.3, `spin ${Number(poweredOff._drillSpin || 0).toFixed(2)}`);

// ② T1 은 예전과 동일(초당 1개)
section('② T1 채굴기 · T1 지형 — 예전 그대로');
check('10초에 10개(±1)', r1.total >= 9 && r1.total <= 11, `${r1.total}개`);
check('보정 없음(배수 1)', drillYieldBonus(1, 1) === 1 && drillLowTierChance(1, 1) === 0);

// ③ 고티어 → 저티어 광물 채굴량 증가
section('③ 고티어 — 저티어 광물 채굴량 증가');
const t3low = makeDrill(POS.t1, 3);
const r3low = run(t3low, 10);
check('같은 T1 지형에서 T3 채굴기가 더 많이 캔다', r3low.total > r1.total, `T1 ${r1.total}개 → T3 ${r3low.total}개`);
check('증가폭이 이론값(×1.7)과 맞는다', r3low.total >= 15 && r3low.total <= 19, `${r3low.total}개 (기대 17)・배수 ${drillYieldBonus(3, 1).toFixed(2)}`);
check('T1 채굴기는 여전히 T1 광물만', r3low.types.every((id) => MINERAL_BY_ID[id]?.tier === 1), r3low.types.join(', '));

// ④ 고티어 → 저티어 광물 랜덤 채굴
section('④ 고티어 — 저티어 광물 랜덤 채굴');
check('T3 지형에서 T3 채굴기의 저티어 확률 0.4', drillLowTierChance(drillPower({ drillTier: 3, terrainGrade: 3 }), 3) === 0.4);
const t5t3 = makeDrill(POS.t3, 5);
const r5t3 = run(t5t3, 240);
const grades = [...new Set(r5t3.types.map((id) => MINERAL_BY_ID[id]?.tier))].sort();
check('T5 채굴기가 T3 지형에서 여러 등급을 캔다', grades.length >= 2, `등급 ${grades.join('/')} · 광물 ${r5t3.types.length}종`);
check('저티어(T1·T2) 광물이 실제로 섞여 나온다', grades.some((g) => g < 3), `등급 ${grades.join('/')}`);
check('캔 광물은 모두 3등급 이하', grades.every((g) => g <= 3));
const t3t3 = makeDrill(POS.t3, 1);
const r3t3 = run(t3t3, 240);
const gradesT1drill = [...new Set(r3t3.types.map((id) => MINERAL_BY_ID[id]?.tier))].sort();
check('고티어 지형에서는 T1 채굴기도 저티어 광물을 섞어 캔다', gradesT1drill.some((g) => g < 3) && gradesT1drill.every((g) => g <= 3), `등급 ${gradesT1drill.join('/')}`);
check('고티어 지형이 저티어 광물 채굴량을 늘린다(T1 지형 대비)', r3t3.total / 240 > r1.total / 10, `T1 지형 ${(r1.total / 10).toFixed(2)}/s → T3 지형 ${(r3t3.total / 240).toFixed(2)}/s`);

// ⑤ 저장/복원 — 업그레이드 티어 유지
section('⑤ 저장·복원 — 업그레이드 티어 유지');
const up = makeDrill(POS.t1, 4);
up.rate = 2.5;
turrets.turrets.push(up);
const blob = JSON.parse(JSON.stringify(turrets.toJSON()));
const restored = new TurretSystem({
  scene: new THREE.Scene(),
  world,
  economy: new Economy({ gold: 0 }),
  projectiles,
  audio: silentAudio,
  stats: new AchievementSystem({}),
  rng: rng.fork('restore')
});
restored.fromJSON(blob);
const back = restored.turrets.find((t) => t.id === up.id);
check('저장된 tier/rate 가 복원된다', back?.tier === 4 && back?.rate === 2.5, `tier ${back?.tier} · rate ${back?.rate}`);
check('mineralsDrilled 도 저장·복원된다', Number(blob.mineralsDrilled) === Number(turrets.mineralsDrilled) && Number(restored.mineralsDrilled) === Number(turrets.mineralsDrilled), String(restored.mineralsDrilled));

console.log(`\n채굴기 티어 테스트: ${pass}개 통과 / ${fail}개 실패 (총 ${pass + fail}개)`);
process.exit(fail ? 1 : 0);

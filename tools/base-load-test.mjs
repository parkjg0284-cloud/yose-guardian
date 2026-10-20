// 본진 규모별 최적화 테스트 — 계약 §4.62
//
//   node tools/base-load-test.mjs
//
// 실제 시스템(TurretSystem · 컨베이어 물류 · 채굴기 · 투사체)을 그대로 돌려
// **본진 규모(포탑 수)** 별 프레임 비용을 잰다. 적 182마리를 세워 두고 포탑이 실제로 쏘게 한다.

import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { createWorld } from '../client/src/world/world.js';
import { createRNG } from '../client/src/utils/rng.js';
import { Turret, TurretSystem } from '../client/src/systems/turrets.js';
import { TURRET_BY_ID } from '../client/src/data.js';
import { Economy } from '../client/src/systems/economy.js';
import { AchievementSystem } from '../client/src/systems/achievements.js';
import { ProjectileSystem } from '../client/src/player/projectiles.js';
import { beltLoad } from '../client/src/systems/conveyors.js';
import { Arcana } from '../client/src/systems/arcana.js';

const silentAudio = { play() {}, startBGM() {}, stopBGM() {}, setVolume() {} };
const ENEMIES = 182; // 렉테스트와 같은 조건
const WARMUP = 60;
const FRAMES = 300;

/** 가짜 적 — 포탑이 조준·발사하도록 위치/hp/피격 API만 갖춘다. */
function makeEnemies(n) {
  const list = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const r = 10 + (i % 5) * 3; // 포탑 사거리 안 — 실제로 조준·발사하게
    list.push({
      id: `e${i}`,
      position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r),
      hp: 1e9,
      maxHp: 1e9,
      dead: false,
      radius: 1,
      takeDamage: () => ({ killed: false, gold: 0 }),
      applyKnockback: () => {},
      slow: () => {}
    });
  }
  return list;
}

function build(scale) {
  const rng = createRNG(`base-${scale}`);
  const scene = new THREE.Scene();
  const world = createWorld({ scene, seed: `base-${scale}`, quality: 'balanced', rng: rng.fork('world') });
  world.nearestMineral = () => ({ id: 'iron', position: new THREE.Vector3(6, 0, 6) });
  const economy = new Economy({ gold: 10_000_000, wood: 1_000_000 });
  const projectiles = new ProjectileSystem({ scene, audio: silentAudio, groundHeight: (x, z) => world.getHeight(x, z) });
  const system = new TurretSystem({
    scene,
    world,
    economy,
    projectiles,
    audio: silentAudio,
    stats: new AchievementSystem({}),
    rng: rng.fork('turrets')
  });
  system.arcana = new Arcana({ turretDamage: 4, turretRange: 3, turretFireRate: 3, drillSpeed: 4, lumberSpeed: 4 });
  const enemies = makeEnemies(ENEMIES);

  let n = 0;
  const put = (typeId, x, z, yaw = 0) => {
    const type = TURRET_BY_ID[typeId];
    if (!type) return null;
    const t = new Turret({
      id: `${typeId}-${n}`,
      type,
      position: new THREE.Vector3(x, 0, z),
      ownerId: 'bench',
      scene,
      system,
      yaw
    });
    t.powered = true;
    t.mineral = null;
    n += 1;
    system.turrets.push(t);
    return t;
  };

  // 본진 배치 — 공격 포탑 / 지원 / 시설 / 벨트 사슬을 규모에 맞게 깐다
  const columns = Math.ceil(Math.sqrt(scale));
  const attackTypes = Object.values(TURRET_BY_ID)
    .filter((t) => t.category === 'attack' && t.tier >= 2)
    .map((t) => t.id)
    .filter((id, i, arr) => arr.indexOf(id) === i);
  const attackList = attackTypes.length ? attackTypes : ['tower_arrow_t1'];
  const pick = (i) => attackList[i % attackList.length];
  const belts = [];
  for (let i = 0; i < scale; i += 1) {
    const cx = (i % columns) * 1.6 - columns * 0.8;
    const cz = Math.floor(i / columns) * 1.6 - columns * 0.8;
    if (i % 5 === 4) {
      const belt = put('facility_conveyor_t4', 30 + cx, 30 + cz);
      if (belt) belts.push(belt);
    } else {
      put(pick(i), cx, cz);
    }
  }
  // 시설 몇 기 + 채굴기 → 벨트로 광물이 실제로 흐르게 한다
  const drill = put('facility_autominer', 30, 26);
  if (drill && belts.length) {
    for (const id of ['iron', 'coal', 'quartz']) beltLoad(drill, id, 2, belts);
  }
  for (let i = 0; i < Math.max(1, Math.round(scale / 20)); i += 1) put('facility_storage_t2', -30 - i * 2, -30);

  return { scene, world, economy, projectiles, system, enemies };
}

function measure(scale) {
  const { scene, system, enemies, projectiles } = build(scale);
  const dt = 1 / 60;
  const ctx = { enemies, player: null, waves: null, portals: null, now: 0 };
  const samples = [];
  let error = null;
  for (let i = 0; i < WARMUP + FRAMES; i += 1) {
    const t0 = performance.now();
    try {
      system.update(dt, ctx);
      system._animate?.(dt);
      projectiles.update?.(dt);
    } catch (e) {
      error = e;
      break;
    }
    const ms = performance.now() - t0;
    if (i >= WARMUP) samples.push(ms);
  }
  const avg = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
  const pct = (p) => {
    if (!samples.length) return 0;
    const s = [...samples].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))];
  };
  let meshes = 0;
  scene.traverse((o) => { if (o.isMesh) meshes += 1; });
  return {
    scale,
    turrets: system.turrets.length,
    belts: system.turrets.filter((t) => t.type?.kind === 'conveyor').length,
    meshes,
    avg,
    p50: pct(0.5),
    p95: pct(0.95),
    worst: samples.length ? Math.max(...samples) : 0,
    error
  };
}

console.log(`\n═══ 본진 부하 테스트 — 적 ${ENEMIES}마리 · ${FRAMES}프레임(워밍업 ${WARMUP}) ═══`);
const rows = [20, 60, 120, 240].map(measure);
const f = (v) => `${v.toFixed(3)}ms`;
for (const r of rows) {
  if (r.error) {
    console.log(`  포탑 ${String(r.scale).padStart(3)}기 — ❌ ${r.error.message}`);
    continue;
  }
  console.log(
    `  포탑 ${String(r.turrets).padStart(3)}기(벨트 ${String(r.belts).padStart(2)}·메시 ${String(r.meshes).padStart(4)})` +
    ` · 평균 ${f(r.avg)} · 중앙값 ${f(r.p50)} · p95 ${f(r.p95)} · 최악 ${f(r.worst)}` +
    ` → ${Math.round(1000 / Math.max(0.001, r.avg))} FPS 상한 (프레임당 포탑 ${(r.avg / Math.max(1, r.turrets) * 1000).toFixed(1)}µs)`
  );
}
const bad = rows.filter((r) => r.error);
const over = rows.filter((r) => !r.error && r.avg > 2.0);
console.log(`\n  예산 2.00ms(=500 FPS) 초과: ${over.length ? over.map((r) => `${r.turrets}기 ${f(r.avg)}`).join(' · ') : '없음'}`);
console.log(`  본진 부하 테스트: ${bad.length ? `${bad.length}개 실패` : '통과'}\n`);
process.exit(bad.length ? 1 : 0);

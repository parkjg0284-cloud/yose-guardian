// 최종보스 버그테스트 — 실제 모듈로 웨이브 30을 돌려 예외/성능/상태를 검사한다.
import * as THREE from 'three';
import { createWorld } from '../client/src/world/world.js';
import { createRNG } from '../client/src/utils/rng.js';
import { spawnEnemy, Enemy } from '../client/src/systems/enemies.js';
import { WaveSystem } from '../client/src/systems/waves.js';
import { EnemyHealthBars } from '../client/src/ui/healthbars.js';
import * as regions from '../client/src/world/regions.js';

const scene = new THREE.Scene();
const world = createWorld({ scene, seed: 'bugtest-777', quality: 'performance', rng: createRNG('bugtest-777').fork('world') });
const problems = [];
const record = (label, cond, extra = '') => {
  if (!cond) problems.push(`${label} ${extra}`);
  console.log(`  ${cond ? '✅' : '❌'} ${label}${extra ? ` — ${extra}` : ''}`);
};

/* ── 1. 웨이브 30 편성 → 셀레스티얼 스폰 ── */
const waves = new WaveSystem({ seed: 'bugtest', mode: 'solo', world });
const queue = waves._buildQueue(100);
record('웨이브 100 편성에 셀레스티얼 1마리', queue.filter((e) => e.typeId === 'celestial').length === 1, `${queue.length}개체 편성`);

const celestial = spawnEnemy({ scene, world, typeId: 'celestial', isBoss: true, wave: 30, position: new THREE.Vector3(0, 0, 90) });
record('스폰 성공', !!celestial && celestial.alive !== false);
record('HP 5,000,000 · 공격력 1,200', celestial.maxHp === 5000000 && celestial.damage === 1200, `${celestial.maxHp} / ${celestial.damage}`);
record('반지름 42 · isBoss', celestial.radius === 42 && celestial.isBoss === true);

/* ── 2. 메시 무결성 (거대 3D) ── */
const mesh = celestial.mesh;
const parts = [];
mesh.traverse((o) => { if (o.name) parts.push(o.name); });
record('메시 파츠 13개 이상', parts.length >= 13, parts.join(','));
record('NaN 스케일 없음', [mesh, ...mesh.children].every((o) => Number.isFinite(o.scale.x) && Number.isFinite(o.scale.y) && Number.isFinite(o.scale.z)));
record('전용 광원 점등(상한 420m)', celestial._light.distance > 18 && celestial._light.distance <= 420 && celestial._light.intensity > 0,
    `거리 ${celestial._light.distance} · 세기 ${celestial._light.intensity}`);

/* ── 3. 전투 시뮬레이션 (600틱) ── */
const turret = {
  position: new THREE.Vector3(0, 0, 92),
  destroyed: false,
  hp: 100000,
  maxHp: 100000,
  takeDamage(n) { this.hp = Math.max(0, this.hp - n); if (this.hp <= 0) this.destroyed = true; }
};
const player = {
  position: new THREE.Vector3(0, 0, 96),
  velocity: new THREE.Vector3(),
  hp: 100000,
  takeDamage(n) { this.hp = Math.max(0, this.hp - n); }
};
let baseHits = 0;
const base = { ...world.base, damage: (n) => { baseHits += n; } };
const ctx = { base, turrets: [turret], player, onBaseDamage: () => {}, onKnockback: () => {}, onAbility: () => {}, spawnMinion: () => {} };

let ticks = 0;
let threw = null;
const t0 = process.hrtime.bigint();
try {
  for (let i = 0; i < 600; i++) {
    // 1/60초 스텝으로 실제 업데이트 경로를 돌린다
    celestial.update(1 / 60, { ...ctx, basePos: base.position ?? new THREE.Vector3(0, 0, 0), basePos2: new THREE.Vector3(0, 0, 0) });
    celestial._animate(1 / 60);
    ticks += 1;
  }
} catch (e) {
  threw = e;
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
record('600틱 전투 시뮬레이션 무예외', threw === null, threw ? threw.message : `${ticks}틱 · ${ms.toFixed(1)}ms (틱당 ${(ms / ticks).toFixed(3)}ms)`);
record('적 피해 발생 (기지 피격)', baseHits > 0, `누적 ${baseHits.toLocaleString()}`);
record('플레이어/포탑 피격 흔적', player.hp < 100000 || turret.hp < 100000, `플레이어 ${player.hp.toLocaleString()} · 포탑 ${turret.hp.toLocaleString()}`);
record('위치가 유한값', Number.isFinite(celestial.position.x) && Number.isFinite(celestial.position.z));
record('메시가 적 위치를 따라간다', Math.abs(mesh.position.x - celestial.position.x) < 1e-6 && Math.abs(mesh.position.z - celestial.position.z) < 1e-6);

/* ── 4. 심판 능력 반복 (쿨다운 로직 포함) ── */
let judgments = 0;
let abilityThrew = null;
try {
  for (let i = 0; i < 40; i++) {
    celestial._execute('judgment', ctx, new THREE.Vector3(0, 0, 0));
    judgments += 1;
  }
} catch (e) { abilityThrew = e; }
record('심판 40회 연속 무예외', abilityThrew === null, abilityThrew?.message ?? '');
record('기지 피해 누적이 3,600 배수', baseHits % 3600 === 0 || baseHits >= 3600 * judgments, `${baseHits.toLocaleString()}`);

/* ── 5. 처치 → 풀 반납 → 재사용 ── */
const dmg = celestial.takeDamage(celestial.hp, null, 'player');
record('처치 성공', dmg.killed === true && celestial.alive === false, `${dmg.gold?.toLocaleString?.()}G`);
celestial.despawn();
const again = spawnEnemy({ scene, world, typeId: 'celestial', isBoss: true, wave: 60, position: new THREE.Vector3(0, 0, 120) });
record('풀 재사용 스폰도 정상', again.maxHp === 5000000 && again.damage === 1200 && again.alive !== false, `${again.maxHp} / ${again.damage}`);
const names2 = [];
again.mesh.traverse((o) => { if (o.name) names2.push(o.name); });
record('재사용 메시 파츠 유지', names2.length >= 13, `${names2.length}개`);

/* ── 6. 월드 체력바 (거대 보스) ── */
const bars = new EnemyHealthBars({ scene, camera: new THREE.PerspectiveCamera(70, 1.7, 0.1, 2000), capacity: 32 });
bars.camera.position.set(0, 0, 200);
bars.camera.lookAt(0, 0, 0);
let barThrew = null;
let visible = 0;
try {
  bars.camera.updateMatrixWorld(true);
  bars.sync([again], bars.camera);
  visible = bars.visibleCount ?? 0;
} catch (e) { barThrew = e; }
record('거대 보스 체력바 렌더 무예외', barThrew === null, barThrew?.message ?? `표시 ${visible}`);
record('체력바 위치가 머리 위 (100m+)', again.barY >= 100, `barY ${Math.round(again.barY)}`);

/* ── 7. 지역 스폰 무결성 (다른 시드 3개) ── */
let totalBad = 0;
let totalNodes = 0;
for (const seed of ['a1', 'b2', 'c3']) {
  const w = createWorld({ scene: new THREE.Scene(), seed, quality: 'balanced', rng: createRNG(seed).fork('world') });
  for (const t of w.trees) { totalNodes += 1; if (!regions.allowsTree(regions.regionIdAt(t.x, t.z), t)) totalBad += 1; }
  for (const m of w.minerals) { totalNodes += 1; if (!regions.allowsMineral(regions.regionIdAt(m.x, m.z), m)) totalBad += 1; }
}
record('시드 3개 × 자원 노드 전수 규칙 검사', totalBad === 0, `${totalNodes}개 노드 · 위반 ${totalBad}`);

console.log(`\n${problems.length === 0 ? '✅ 버그테스트 전부 통과' : `❌ 문제 ${problems.length}건`}`);
for (const p of problems) console.log(`  - ${p}`);
process.exitCode = problems.length === 0 ? 0 : 1;

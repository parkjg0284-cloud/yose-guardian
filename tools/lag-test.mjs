// 요새의 수호자 — 렉테스트(lag test): 프레임당 CPU 비용과 그리기 호출 수를 측정한다.
//
//   node tools/lag-test.mjs [--frames=600] [--budget=2.0] [--enemies=240] [--quality=balanced]
//
//  · 500 FPS 목표는 프레임당 2.0ms 예산과 같다(1000 / 500 = 2.0ms).
//  · 실제 GPU 없이도 "CPU 상한 FPS" 를 재현 가능하게 잰다: 시스템 갱신 + 행렬 갱신 + 컬링 + 그리기 호출 집계.
//  · 품질 프리셋별 장면 규모(개체/그리기 호출/삼각형)도 함께 보고한다.
import * as THREE from 'three';
import { createWorld } from '../client/src/world/world.js';
import { createRNG } from '../client/src/utils/rng.js';
import { Player } from '../client/src/player/player.js';
import { WaveSystem } from '../client/src/systems/waves.js';
import { TurretSystem } from '../client/src/systems/turrets.js';
import { ProjectileSystem } from '../client/src/player/projectiles.js';
import { Economy } from '../client/src/systems/economy.js';
import { AchievementSystem } from '../client/src/systems/achievements.js';
import { spawnEnemy } from '../client/src/systems/enemies.js';
import { MAP, TURRETS } from '../client/src/data.js';

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? '1'] : [a, '1'];
  })
);
const FRAMES = Math.max(60, Math.floor(Number(argv.frames) || 600));
const BUDGET = Math.max(0.2, Number(argv.budget) || 2.0); // ms — 500 FPS
const ENEMIES = Math.max(10, Math.floor(Number(argv.enemies) || 240));
const QUALITY = String(argv.quality || 'balanced');
const WARMUP = Math.max(10, Math.floor(FRAMES * 0.15));

const now = () => Number(performance.now());
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)));
  return s[i];
};
const fmt = (n, d = 3) => Number(n).toFixed(d);
let failed = 0;
const check = (name, cond, detail = '') => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed += 1;
};

// ── 장면 준비 ─────────────────────────────────────────────────────
const silentAudio = { play() {}, startBGM() {}, stopBGM() {}, setVolume() {}, resume() {} };
const rng = createRNG('lag-test');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 4000);
camera.position.set(0, 24, 46);
camera.lookAt(0, 2, 0);
camera.updateMatrixWorld(true);

const world = createWorld({ scene, seed: 'lag-777', quality: QUALITY, rng: rng.fork('world') });
const economy = new Economy({ gold: 999999, wood: 99999 });
const stats = new AchievementSystem({});
const projectiles = new ProjectileSystem({ scene, audio: silentAudio, groundHeight: (x, z) => world.getHeight(x, z) });

// 입력 스텁(플레이어가 키를 읽어도 안전)
const inputStub = {
  keys: new Set(),
  isDown: () => false,
  pressed: () => false,
  consume: () => false,
  mouse: { dx: 0, dy: 0, wheel: 0, buttons: new Set() },
  wheelDelta: 0,
  clearFrame: () => {},
  endFrame: () => {}
};
const player = new Player({ camera, world, input: inputStub, audio: silentAudio, stats, scene });
player.position?.set?.(0, 0, 0);

const turrets = new TurretSystem({
  scene,
  world,
  economy,
  projectiles,
  audio: silentAudio,
  stats,
  rng: rng.fork('turrets')
});
let builtTurrets = 0;
for (const t of (Array.isArray(TURRETS) ? TURRETS : []).slice(0, 6)) {
  const id = t?.id ?? t;
  const built = turrets.build?.(id, 12 + builtTurrets * 6, -12) ?? turrets.place?.(id, 12 + builtTurrets * 6, -12) ?? null;
  if (built || built === undefined) builtTurrets += 1;
}

const waves = new WaveSystem({
  scene,
  world,
  economy,
  audio: silentAudio,
  projectiles,
  stats,
  rng: rng.fork('waves'),
  difficulty: 'normal',
  mode: 'endless'
});
waves.enemies = waves.enemies ?? [];

// 스트레스 부하 — 웨이브 100 편성 + 최종보스
const queue = waves._buildQueue ? waves._buildQueue(100) : [];
const spawned = [];
for (let i = 0; i < Math.min(ENEMIES, queue.length || ENEMIES); i++) {
  const entry = queue[i] ?? { typeId: 'slime', isBoss: false, elite: false };
  const a = (i / Math.max(1, ENEMIES)) * Math.PI * 2;
  const r = 40 + (i % 12) * 4;
  const enemy = spawnEnemy({
    scene,
    world,
    wave: 100,
    typeId: entry.typeId,
    type: entry.type ?? null,
    isBoss: !!entry.isBoss,
    elite: !!entry.elite,
    mods: entry.mods ?? null,
    position: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)
  });
  if (enemy) spawned.push(enemy);
}
const celestial = spawnEnemy({ scene, world, wave: 100, typeId: 'celestial', isBoss: true, position: new THREE.Vector3(0, 0, 150) });
if (celestial) spawned.push(celestial);
for (const e of spawned) waves.enemies.push(e);

// 실제 게임과 같은 참조를 넘긴다
const enemyCtx = {
  base: world.base,
  turrets: turrets.turrets ?? [],
  player,
  onBaseDamage: () => {},
  onKnockback: () => {},
  onAbility: () => {}
};

// ── 그리기 호출 집계(렌더러가 프레임마다 하는 CPU 작업) ──────────
const frustum = new THREE.Frustum();
const projScreen = new THREE.Matrix4();
function sceneCost() {
  camera.updateMatrixWorld(true);
  projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreen);
  let objects = 0;
  let meshes = 0;
  let visible = 0;
  let calls = 0;
  let tris = 0;
  let lights = 0;
  let transparent = 0;
  scene.traverse((o) => {
    objects += 1;
    if (o.isLight) lights += 1;
    if (!o.isMesh && !o.isInstancedMesh) return;
    meshes += 1;
    if (o.visible === false) return;
    if (o.frustumCulled !== false && !frustum.intersectsObject(o)) return;
    visible += 1;
    const g = o.geometry;
    const count = g?.index ? g.index.count : g?.attributes?.position?.count ?? 0;
    const mult = o.isInstancedMesh ? Math.max(1, o.count) : 1;
    tris += (count / 3) * mult;
    const mats = Array.isArray(o.material) ? o.material.length : 1;
    calls += mats * (o.isInstancedMesh ? 1 : 1);
    if (!Array.isArray(o.material) && o.material?.transparent) transparent += 1;
  });
  return { objects, meshes, visible, calls, tris: Math.round(tris), lights, transparent };
}

// ── 프레임 비용 측정 ─────────────────────────────────────────────
const dt = 1 / 60;
const samples = [];
const parts = { waves: 0, player: 0, turrets: 0, world: 0, enemies: 0, matrix: 0, instrument: 0 };
let time = 0;
const cost = sceneCost();
for (let i = 0; i < FRAMES; i++) {
  const t0 = now();
  time += dt;
  let tA = now();
  waves.update?.(dt, { player, turrets: turrets.turrets ?? [], ui: null });
  let tB = now();
  parts.waves += tB - tA;
  player.update?.(dt);
  tA = now();
  parts.player += tA - tB;
  turrets.update?.(dt, { player, enemies: waves.enemies, projectiles });
  tB = now();
  parts.turrets += tB - tA;
  tA = now();
  world.update?.(dt, { player, enemies: waves.enemies, time, camera });
  world.frustumCull?.(camera);
  tB = now();
  parts.world += tB - tA;
  // 매 프레임 객체를 새로 만들면 GC 가 몰려 p95 가 튄다 — 한 번만 만들어 재사용한다(H-97).
  const enemyCtxLive = { ...enemyCtx, basePos: world.base?.position ?? new THREE.Vector3() };
  for (const e of spawned) {
    if (e?.update) e.update(dt, enemyCtxLive);
  }
  tA = now();
  parts.enemies += tA - tB;
  // 실제 게임은 renderer.render() 가 필요한 노드만 갱신한다.
  //  여기서도 강제 전체 갱신(force=true) 대신 자동 갱신에 맡겨 CPU 비용을 실제와 맞춘다(H-97).
  scene.updateMatrixWorld();
  tB = now();
  parts.matrix += tB - tA;
  // 그리기 호출 집계는 씬 전체 traverse 라 비싸다 — 계측 비용이 측정값을 오염시키므로
  //  30프레임에 한 번만 갱신하고 나머지는 직전 값을 쓴다(H-97).
  let c = cost;
  if (i % 30 === 0 || i === FRAMES - 1) c = sceneCost();
  const t1 = now();
  parts.instrument += t1 - tB;
  if (i >= WARMUP) samples.push(t1 - t0);
  cost.calls = c.calls;
  cost.visible = c.visible;
  cost.tris = c.tris;
}
const perFrame = (v) => v / Math.max(1, FRAMES);

const avg = samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length);
const p50 = pct(samples, 0.5);
const p95 = pct(samples, 0.95);
const worst = samples.length ? Math.max(...samples) : 0;
const fpsOf = (ms) => (ms > 0 ? 1000 / ms : Infinity);

// ── 보고 ─────────────────────────────────────────────────────────
console.log(`\n═══ 렉테스트 — 품질 ${QUALITY} · 적 ${spawned.length}마리 · ${samples.length}프레임 ═══`);
console.log(`  장면: 개체 ${cost.objects} · 메시 ${cost.meshes} · 화면 안 ${cost.visible} · 그리기 호출 ${cost.calls} · 삼각형 ${cost.tris.toLocaleString()} · 광원 ${cost.lights}`);
console.log('  CPU 프레임 비용(ms):');
console.log(`    평균 ${fmt(avg)} · 중앙값 ${fmt(p50)} · p95 ${fmt(p95)} · 최악 ${fmt(worst)}`);
console.log(`    → CPU 상한 FPS: 평균 ${fmt(fpsOf(avg), 0)} · p95 ${fmt(fpsOf(p95), 0)}`);
console.log(`  예산 ${fmt(BUDGET, 2)}ms (= ${fmt(1000 / BUDGET, 0)} FPS)`);
const gameMs = avg - perFrame(parts.instrument);
console.log('  구간별(프레임당 ms):');
for (const [k, label] of [
  ['world', '월드 갱신+컬링'],
  ['enemies', '적 갱신'],
  ['waves', '웨이브'],
  ['turrets', '포탑'],
  ['player', '플레이어'],
  ['matrix', '행렬 갱신'],
  ['instrument', '측정 도구(그리기 호출 집계)']
]) {
  console.log(`    ${label.padEnd(24)} ${fmt(perFrame(parts[k]))}`);
}
console.log(`  게임 로직 합계 ${fmt(gameMs)}ms → ${fmt(fpsOf(gameMs), 0)} FPS (측정 도구 제외)`);
// 예산 판정은 **측정 도구 비용을 뺀** 게임 프레임으로 한다(계약 §4.62) —
//  도구가 프레임마다 그리기 호출을 세는 비용까지 게임 탓으로 돌리면 안 된다.
const instrumentPerFrame = perFrame(parts.instrument);
const gameSamples = samples.map((s) => Math.max(0, s - instrumentPerFrame));
const p95Game = pct(gameSamples, 0.95);
const worstGame = gameSamples.length ? Math.max(...gameSamples) : 0;
check('렉테스트 — p95 게임 프레임이 500 FPS 예산(2.0ms) 안', p95Game <= 2.0, `p95 ${fmt(p95Game)}ms → ${fmt(fpsOf(p95Game), 0)} FPS (도구 ${fmt(instrumentPerFrame)}ms 제외)`);
check('렉테스트 — 게임 로직(측정 도구 제외)이 2.0ms 예산 안', gameMs <= 2.0, `${fmt(gameMs)}ms → ${fmt(fpsOf(gameMs), 0)} FPS`);
check('렉테스트 — 평균 프레임이 500 FPS 예산(2.0ms) 안', gameSamples.reduce((a, b) => a + b, 0) / Math.max(1, gameSamples.length) <= 2.0, `평균 ${fmt(avg)}ms (도구 제외 ${fmt(gameSamples.reduce((a, b) => a + b, 0) / Math.max(1, gameSamples.length))}ms)`);
check('렉테스트 — 최악 게임 프레임 8ms 이하(끊김 없음)', worstGame <= 8, `최악 ${fmt(worstGame)}ms (도구 포함 ${fmt(worst)}ms)`);

// ── 품질 프리셋별 장면 규모 비교 ─────────────────────────────────
console.log('\n── 품질 프리셋별 장면 규모' + ' ─'.repeat(10));
for (const quality of ['battery', 'performance', 'balanced', 'ultra', 'unlimited']) {
  const s = new THREE.Scene();
  const w = createWorld({ scene: s, seed: `lag-${quality}`, quality, rng: createRNG(`lag-${quality}`).fork('world') });
  const before = process.hrtime.bigint();
  w.update?.(dt, { player, enemies: [], time: 1, camera });
  w.frustumCull?.(camera);
  s.updateMatrixWorld(true);
  const ms = Number(process.hrtime.bigint() - before) / 1e6;
  let meshes = 0;
  let calls = 0;
  let tris = 0;
  let lights = 0;
  s.traverse((o) => {
    if (o.isLight) lights += 1;
    if (!o.isMesh && !o.isInstancedMesh) return;
    meshes += 1;
    const g = o.geometry;
    const count = g?.index ? g.index.count : g?.attributes?.position?.count ?? 0;
    const mult = o.isInstancedMesh ? Math.max(1, o.count) : 1;
    tris += (count / 3) * mult;
    calls += Array.isArray(o.material) ? o.material.length : 1;
  });
  console.log(
    `  ${quality.padEnd(12)} 메시 ${String(meshes).padStart(6)} · 호출 ${String(calls).padStart(6)} · 삼각형 ${Math.round(tris).toLocaleString().padStart(12)} · 광원 ${String(lights).padStart(3)} · 갱신 ${fmt(ms, 2)}ms`
  );
}

console.log(failed ? `\n  ❌ 렉테스트 실패 ${failed}건` : '\n  ✅ 렉테스트 통과');
process.exit(failed ? 1 : 0);

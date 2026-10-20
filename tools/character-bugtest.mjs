// 요새의 수호자 — 캐릭터 · 앉기 · 부드러운 회전 버그테스트 (npm run bugtest3)
// 실제 모듈을 그대로 불러와 경계값·악의 입력·상태 누수를 때린다.
import * as THREE from 'three';
import { createRNG } from '../client/src/utils/rng.js';
import { Player } from '../client/src/player/player.js';
import { TurretSystem } from '../client/src/systems/turrets.js';
import { Economy } from '../client/src/systems/economy.js';
import { AchievementSystem } from '../client/src/systems/achievements.js';
import { TURRETS } from '../client/src/data.js';
import { createWorld } from '../client/src/world/world.js';
import { ProjectileSystem } from '../client/src/player/projectiles.js';
import {
  CHARACTER_SKINS,
  CHARACTER_SKIN_BY_ID,
  CHARACTER_NAME_MAX,
  CHARACTER_STORAGE_KEY,
  DEFAULT_SKIN_ID,
  characterSkin,
  sanitizeCharacter,
  sanitizeCharacterName,
  sanitizeRemoteCharacter,
  characterColors,
  characterLabel,
  characterPayload,
  createCharacterStore,
  validateCharacterData
} from '../client/src/character.js';

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function section(t) {
  console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 44 - t.length))}`);
}
function throwing(label, fn) {
  try {
    fn();
    return null;
  } catch (err) {
    return err;
  }
}
const memStorage = () => ({
  _v: {},
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null;
  },
  setItem(k, v) {
    this._v[k] = String(v);
  },
  removeItem(k) {
    delete this._v[k];
  }
});

section('캐릭터 — 이름 경계값');
{
  check('데이터 무결성(오염 검사 포함)', validateCharacterData().length === 0, validateCharacterData().join(' · '));
  check('1000자 이름 → 16자로 절단', sanitizeCharacterName('가'.repeat(1000)).length === CHARACTER_NAME_MAX);
  check('개행·탭·중복 공백 정리', sanitizeCharacterName('  요새\n\t지  기  ') === '요새 지 기', sanitizeCharacterName('  요새\n\t지  기  '));
  check('공백만 있는 이름 → 빈 문자열', sanitizeCharacterName('   \t\n ') === '');
  check('이모지만 있는 이름 유지', sanitizeCharacterName('🧙‍♂️수호') === '🧙‍♂️수호');
  check('HTML/스크립트 문자열은 그대로 텍스트(이스케이프는 렌더러 몫)', sanitizeCharacterName('<img src=x onerror=alert(1)>').length === CHARACTER_NAME_MAX);
  check('숫자·불리언·null·undefined 안전', sanitizeCharacterName(123) === '123' && sanitizeCharacterName(true) === 'true' && sanitizeCharacterName(null) === '' && sanitizeCharacterName(undefined) === '');
  check('객체를 이름으로 주면 예외 없이 문자열화', sanitizeCharacterName({}) === '[object Object]');
}

section('캐릭터 — 외형(스킨) 오염·경계');
{
  check('외형 정확히 8종', CHARACTER_SKINS.length === 8);
  check('모든 외형 id/이름/아이콘/색 유효', CHARACTER_SKINS.every((s) => /^[a-z][a-z_]*$/.test(s.id) && s.name && s.icon && Number.isFinite(s.color) && Number.isFinite(s.accent)));
  for (const evil of ['__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', '', ' Mage', 'mage ', 'MAge']) {
    check(`외형 "${evil}" 은 거부`, characterSkin(evil) === null, String(characterSkin(evil)));
  }
  check('정상 id 는 통과', characterSkin('mage')?.id === 'mage' && characterSkin('fairy_friend')?.id === 'fairy_friend');
  check('sanitizeCharacter(원시값) 안전', ['문자열', 42, true, null, undefined, [], () => {}].every((v) => sanitizeCharacter(v).skin === DEFAULT_SKIN_ID));
  check('외형 미지정 → 기본 수호자', sanitizeCharacter({}).skin === DEFAULT_SKIN_ID);
  check('이름 fallback 우선순위(직접 > 대체 > 빈값)', sanitizeCharacter({}, '대체').name === '대체' && sanitizeCharacter({ name: '직접' }, '대체').name === '직접');
  check('색 값이 항상 유한(오염 입력)', ['__proto__', 'constructor', 'nope'].every((s) => {
    const c = characterColors({ skin: s });
    return Number.isFinite(c.color) && Number.isFinite(c.accent);
  }));
  check('라벨 — 이름 없음 표시', characterLabel({ skin: 'mage' }).includes('이름 없음') && characterLabel({ name: '홍', skin: 'mage' }).includes('🧙'));
}

section('캐릭터 — 전송 페이로드 살균');
{
  check('공백 이름 + 계정 fallback', characterPayload({ name: '   ' }, '계정닉').name === '계정닉');
  check('이름도 계정도 없으면 수호자', characterPayload(null, '   ').name === '수호자');
  check('색은 항상 0..0xFFFFFF', CHARACTER_SKINS.every((s) => {
    const p = characterPayload({ skin: s.id });
    return p.color >= 0 && p.color <= 0xffffff && p.accent >= 0 && p.accent <= 0xffffff;
  }));
  const badRemote = sanitizeRemoteCharacter({ skin: '__proto__', icon: 'x'.repeat(80), color: 1e20, accent: 'NaN' });
  check('릴레이 값 살균 — 아이콘 4자·색 기본값', badRemote.skin === DEFAULT_SKIN_ID && badRemote.icon.length <= 4 && Number.isFinite(badRemote.color));
  check('릴레이 값이 없으면 기본', sanitizeRemoteCharacter(null).skin === DEFAULT_SKIN_ID && Number.isFinite(sanitizeRemoteCharacter(undefined).color));
}

section('캐릭터 — 저장소 내성');
{
  const mem = memStorage();
  const store = createCharacterStore({ storage: mem });
  store.save({ name: '테스터', skin: 'bard' });
  check('정상 왕복', store.load().name === '테스터' && store.load().skin === 'bard');
  mem.setItem(CHARACTER_STORAGE_KEY, '{ 깨진 JSON');
  check('깨진 JSON → 기본값(예외 없음)', store.load().name === '' && store.load().skin === DEFAULT_SKIN_ID);
  mem.setItem(CHARACTER_STORAGE_KEY, '"문자열"');
  check('JSON 문자열 → 기본값', store.load().skin === DEFAULT_SKIN_ID);
  mem.setItem(CHARACTER_STORAGE_KEY, '[1,2,3]');
  check('JSON 배열 → 기본값', store.load().skin === DEFAULT_SKIN_ID);
  mem.setItem(CHARACTER_STORAGE_KEY, '{"skin":"__proto__","name":"오염"}');
  check('__proto__ 저장값 → 기본 외형', store.load().skin === DEFAULT_SKIN_ID && store.load().name === '오염');
  mem.setItem(CHARACTER_STORAGE_KEY, JSON.stringify({ name: '가'.repeat(99) }));
  check('저장값 이름도 16자 제한', store.load().name.length === CHARACTER_NAME_MAX);

  const boom = {
    getItem() {
      throw new Error('읽기 거부');
    },
    setItem() {
      throw new Error('쓰기 거부');
    },
    removeItem() {
      throw new Error('삭제 거부');
    }
  };
  const boomStore = createCharacterStore({ storage: boom });
  check('저장소가 던져도 저장/복원이 죽지 않는다', boomStore.load('대체').name === '대체' && boomStore.save({ name: '저장실패', skin: 'mage' }).name === '저장실패');
  check('clear 도 예외 없음', throwing('clear', () => boomStore.clear()) === null);
  const noStorage = createCharacterStore({});
  check('storage 없는 환경(헤드리스) 안전', noStorage.save({ name: '무저장', skin: 'rogue' }).skin === 'rogue' && noStorage.load().skin === DEFAULT_SKIN_ID);
  check('알 수 없는 원시값 로드 → 기본', createCharacterStore({ storage: 12345 }).load().skin === DEFAULT_SKIN_ID);
}

section('앉기 — 상태 누수·경계');
{
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 800);
  const rng = createRNG('bugtest3-sit');
  const world = createWorld({ scene, seed: '31337', quality: 'performance', rng: rng.fork('world') });
  const audio = { play() {}, stop() {}, setVolume() {} };
  const stats = new AchievementSystem({});
  const baseInput = (held = []) => {
    const keys = new Set(held);
    return {
      keys,
      mouse: { dx: 0, dy: 0, left: false, right: false, wheel: 0 },
      isDown: (c) => keys.has(c),
      wasPressed: () => false,
      consumePressed: () => false,
      consumeMouse: () => ({ dx: 0, dy: 0, left: false, right: false, wheel: 0 }),
      requestPointerLock() {},
      exitPointerLock() {},
      get locked() {
        return false;
      },
      update() {},
      dispose() {}
    };
  };
  const make = (held = [], extra = {}) =>
    new Player({
      camera,
      world,
      input: Object.assign(baseInput(held), extra),
      audio,
      stats,
      position: new THREE.Vector3(0, 0, 45)
    });

  const sit = make(['ControlLeft']);
  for (let i = 0; i < 60; i++) sit.update(1 / 60);
  check('앉기 — sitAmount 가 [0,1] 범위', sit.sitAmount >= 0 && sit.sitAmount <= 1, String(sit.sitAmount));
  sit.update(0);
  check('dt=0 이어도 NaN/범위 이탈 없음', Number.isFinite(sit.sitAmount) && sit.sitAmount <= 1);
  sit.update(Number.NaN);
  check('dt=NaN 이어도 상태 유지', Number.isFinite(sit.sitAmount), String(sit.sitAmount));
  sit.update(-5);
  check('음수 dt 무시', Number.isFinite(sit.sitAmount) && sit.sitAmount >= 0);
  check('시야 좌표 유한', Number.isFinite(camera.position.y) && Number.isFinite(sit.eyePosition.y));

  const stand = make([]);
  for (let i = 0; i < 30; i++) stand.update(1 / 60);
  check('서 있을 때는 sitAmount 0', stand.sitting === false && stand.sitAmount === 0);

  stand.sitting = true;
  stand.sitAmount = 1;
  const toggled = make([]);
  toggled.sitAmount = 1;
  toggled.update(1 / 60);
  check('키를 떼면 즉시 일어나기 시작', toggled.sitAmount < 1 && toggled.sitting === false, String(toggled.sitAmount));

  const flying = make(['ControlLeft']);
  flying.flying = true;
  flying._move(1 / 60);
  check('비행 중에는 앉지 않음', flying.sitting === false);

  const dead = make(['ControlLeft']);
  dead.alive = false;
  for (let i = 0; i < 30; i++) dead.update(1 / 60);
  check('사망 중에도 sitAmount 유한', Number.isFinite(dead.sitAmount) && dead.sitAmount <= 1, String(dead.sitAmount));
  check('사망 중 카메라 좌표 유한', Number.isFinite(camera.position.y));

  const spam = make(['ControlLeft']);
  for (let i = 0; i < 400; i++) {
    spam.input.keys = new Set(i % 2 ? ['ControlLeft'] : []);
    spam.update(1 / 60);
  }
  check('400프레임 토글에도 범위 유지', spam.sitAmount >= 0 && spam.sitAmount <= 1, String(spam.sitAmount));

  const walker = make(['KeyW']);
  const sitter = make(['KeyW', 'ControlLeft']);
  for (let i = 0; i < 120; i++) {
    walker.update(1 / 60);
    sitter.update(1 / 60);
  }
  const ws = Math.hypot(walker.velocity.x, walker.velocity.z);
  const ss = Math.hypot(sitter.velocity.x, sitter.velocity.z);
  check('앉으면 느리지만 0 이 아니다', ss > 0 && ss < ws, `${ws.toFixed(2)} → ${ss.toFixed(2)}`);

  const jumper = make([], { consumePressed: (c) => c === 'Space' });
  jumper.onGround = true;
  jumper.velocity.set(0, 0, 0);
  jumper.update(1 / 60);
  check('일어선 상태에서는 점프', jumper.velocity.y > 3, String(jumper.velocity.y.toFixed(2)));
  const sitJumper = make(['ControlLeft'], { consumePressed: (c) => c === 'Space' });
  for (let i = 0; i < 60; i++) sitJumper.update(1 / 60);
  sitJumper.onGround = true;
  sitJumper.velocity.set(0, 0, 0);
  sitJumper.update(1 / 60);
  check('앉은 상태에서는 점프 차단', sitJumper.velocity.y <= 0.001, String(sitJumper.velocity.y.toFixed(3)));
}

section('부드러운 회전 — 정규화·누수·경계');
{
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 800);
  const rng = createRNG('bugtest3-rot');
  const world = createWorld({ scene, seed: '777', quality: 'performance', rng: rng.fork('world') });
  const audio = { play() {}, stop() {}, setVolume() {} };
  const stats = new AchievementSystem({});
  const economy = new Economy({ gold: 500000, wood: 5000, minerals: { iron: 90, quartz: 90, mana: 90, silver: 90, coal: 90, clay: 90 } });
  const projectiles = new ProjectileSystem({ scene, audio, groundHeight: (x, z) => world?.getHeight(x, z) ?? 0 });
  const sys = new TurretSystem({ scene, world, economy, projectiles, audio, stats, rng: rng.fork('turrets') });
  const ctx = { enemies: [], player: { position: new THREE.Vector3() }, world, turrets: sys.turrets };
  const place = (x) => {
    const def = TURRETS.find((t) => t.category === 'facility' && t.kind === 'enchanter') ?? TURRETS[0];
    e = def;
    return sys.place(def.id, new THREE.Vector3(x, 0, 36), 'local', { yaw: 0 });
  };
  let e = null;
  const t1 = place(300);
  const t2 = place(310);
  check('건물 2개 배치', Boolean(t1?.id) && Boolean(t2?.id) && t1.id !== t2.id);

  for (let i = 0; i < 200; i++) sys.rotate(t1.id, 0.37, { smooth: true });
  sys.update(1 / 30, ctx);
  check('연속 회전 200회 — yaw 정규화(-π..π)', Math.abs(t1.yaw) <= Math.PI + 1e-9, String(t1.yaw));
  check('연속 회전 — 메시 yaw 도 정규화', Math.abs(t1.mesh.rotation.y) <= Math.PI + 0.01, String(t1.mesh.rotation.y));

  sys.rotate(t1.id, Math.PI * 100, { smooth: true });
  sys.update(1 / 30, ctx);
  check('100π 회전에도 정규화 유지', Math.abs(t1.yaw) <= Math.PI + 1e-9, String(t1.yaw));

  const before = t1.yaw;
  sys.rotate(t1.id, Number.NaN, { smooth: true });
  check('NaN 회전은 무시(값 유지)', Math.abs(t1.yaw - before) < 1e-9, String(t1.yaw));
  sys.setYaw(t1.id, Number.NaN);
  check('NaN 절대 회전 → 0(안전)', Math.abs(t1.yaw) < 1e-9, String(t1.yaw));
  sys.setYaw(t1.id, 'abc');
  check('문자열 회전 → 0', Math.abs(t1.yaw) < 1e-9);

  sys.setYaw(t1.id, 0, { smooth: true });
  check('smooth 절대 회전은 목표만 세운다', t1.yawTarget != null && Math.abs(t1.mesh.rotation.y) < 1e-9);
  sys.setYaw(t1.id, 0);
  check('즉시 회전은 목표를 지운다(누수 없음)', t1.yawTarget == null && Math.abs(t1.mesh.rotation.y) < 1e-9);

  sys.rotate(t2.id, 1.2, { smooth: true });
  check('다른 건물은 영향 없음', t2.yawTarget != null && t1.yawTarget == null);
  for (let i = 0; i < 120; i++) sys.update(1 / 60, ctx);
  check('수렴 후 목표 해제(양쪽)', t1.yawTarget == null && t2.yawTarget == null);
  check('t2 메시가 목표에 도달', Math.abs(t2.mesh.rotation.y - t2.yaw) < 0.02, `${t2.mesh.rotation.y.toFixed(3)} vs ${t2.yaw.toFixed(3)}`);

  const json = sys.toJSON();
  const savedT1 = (json.turrets ?? []).find((x) => x.id === t1.id);
  check('저장에 yaw 포함', Number.isFinite(Number(savedT1?.yaw)));
  const sys2 = new TurretSystem({ scene: new THREE.Scene(), world, economy, projectiles, audio, stats, rng: rng.fork('turrets2') });
  sys2.fromJSON(json);
  const loaded = sys2.find(t1.id);
  check('복원 후 yawTarget 누수 없음', loaded && loaded.yawTarget == null && Math.abs(Number(loaded.yaw) - Number(t1.yaw)) < 1e-6);

  sys.damage?.(t2.id, 99999);
  const destroyed = sys.find(t2.id);
  if (destroyed?.destroyed) {
    check('파괴된 건물 회전 거부', sys.rotate(t2.id, 1, { smooth: true }).ok === false && sys.setYaw(t2.id, 1, { smooth: true }).ok === false);
  } else {
    check('파괴 API 없음 — 건너뜀(정상)', true);
  }
  check('없는 건물 회전 거부', sys.rotate('nope', 1, { smooth: true }).ok === false && sys.setYaw('nope', 1, { smooth: true }).ok === false);
}

console.log(`\n${'═'.repeat(58)}`);
console.log(`캐릭터/앉기/회전 버그테스트: ${pass}개 통과 / ${fail}개 실패 (총 ${pass + fail}개)`);
if (fail) {
  console.log('\n실패 목록:');
  for (const f of failures) console.log('  - ' + f);
}
console.log('═'.repeat(58));
process.exit(fail ? 1 : 0);

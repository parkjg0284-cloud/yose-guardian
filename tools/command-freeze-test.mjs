// 게임 명령어 멈춤 테스트 + 마법연성 배선 검사 — 계약 §4.47 · §4.67 · §4.70 · §4.71
//
//   node tools/command-freeze-test.mjs
//
// ① 관리자 명령어 14종을 실제 코드(runAdminCommand)로 실행해 **명령 1건의 CPU 비용**을 잰다.
// ② 무기 소환 큐가 일시정지(ESC) 중에 진행되지 않는지 확인한다 — 예전에는 여기서 멈췄다.
// ③ 프레임 루프 소스가 일시정지 중 예열·장착을 막고, 예열에 시간 예산을 두는지 확인한다.
// ④ 마법연성 배율이 포탑·저장고에 실제로 곱해지는지 확인한다.

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { Turret } from '../client/src/systems/turrets.js';
import { SummonQueue } from '../client/src/systems/summon-queue.js';
import { Arcana, ARCANA_UPGRADES, validateArcana, hasArcanaTable, ARCANA_TABLE_ID, ARCANA_TABLE_COST } from '../client/src/systems/arcana.js';
import { runAdminCommand } from '../client/src/systems/admin-commands.js';
import { WEAPONS, MINERAL_TYPES, TURRET_BY_ID } from '../client/src/data.js';

let pass = 0;
let fail = 0;
const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 46 - t.length))}`);
function check(label, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`); }
  else { fail += 1; console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const now = () => performance.now();

// ── 가짜 게임(명령이 건드리는 모든 필드를 받아 준다) ───────────────
function makeGame() {
  const calls = [];
  const notices = [];
  const economy = { gold: 0, wood: 0, minerals: {}, addGold(n) { this.gold += Number(n) || 0; }, addWood(n) { this.wood += Number(n) || 0; }, addMineral(id, n) { this.minerals[id] = (this.minerals[id] || 0) + (Number(n) || 0); }, spend: () => true };
  const player = { hp: 50, maxHp: 100, mana: 0, maxMana: 100 };
  const base = { hp: 100, maxHp: 4100, destroyed: false, heal(n) { this.hp = Math.min(this.maxHp, this.hp + Number(n || 0)); } };
  const summons = new SummonQueue();
  const real = {
    state: 'playing',
    economy,
    player,
    world: { base },
    turrets: { turrets: [], all: () => [] },
    enemies: { list: [] },
    waves: { wave: 1, start: () => true },
    grants: { enqueue: () => 1, step: () => 0, pending: () => 0 },
    summons,
    notify: (t) => notices.push(String(t)),
    summonWeapon: (id, opts) => { calls.push(`summonWeapon:${id}`); summons.push(id); return true; },
    grantWeapons: (ids) => { calls.push('grantWeapons'); for (const id of ids ?? []) summons.push(id); return (ids ?? []).length; },
    ownWeapon: () => true,
    equipWeapon: (id) => { calls.push(`equipWeapon:${id}`); return true; },
    hasWeapon: () => false,
    _refreshPanels: () => {}
  };
  const stubCache = new Map();
  const game = new Proxy(real, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (!stubCache.has(k)) {
        const fn = (...args) => { calls.push(`${String(k)}(${args.length})`); return undefined; };
        stubCache.set(k, fn);
      }
      return stubCache.get(k);
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  return { game, calls, notices, economy, base, summons, player };
}

// ── ① 명령어 14종 CPU 비용 ──────────────────────────────────────
section('① 관리자 명령어 CPU 비용');
{
  const cmds = [
    '/도움말',
    `/무기 ${WEAPONS[0].id}`,
    '/무기전부',
    '/돈 50000',
    '/목재 5000',
    `/광물 ${MINERAL_TYPES[0].id} 20`,
    '/전체자원 100',
    '/웨이브 3',
    '/치유',
    '/플라이 켜기',
    `/날개 ${''}`.trim(),
    '/가죽 전부 5',
    '/화살 전부 100',
    '/장비',
    '/없는명령어'
  ];
  const times = [];
  for (const text of cmds) {
    const { game } = makeGame();
    const t0 = now();
    let threw = null;
    try { runAdminCommand(text, game); } catch (e) { threw = e; }
    const ms = now() - t0;
    times.push({ text, ms, threw });
    check(
      `명령 ${text} — 예외 없음 · 프레임 예산 안`,
      !threw && ms < 3.0,
      `${ms.toFixed(3)}ms${threw ? ` · ${threw.message}` : ''}`
    );
  }
  const worst = times.reduce((a, b) => (b.ms > a.ms ? b : a), times[0]);
  check('가장 무거운 명령이 3ms 미만', worst.ms < 3.0, `${worst.text} ${worst.ms.toFixed(3)}ms`);
  const avg = times.reduce((a, b) => a + b.ms, 0) / times.length;
  check('명령 평균 비용이 1ms 미만', avg < 1.0, `평균 ${avg.toFixed(3)}ms · ${times.length}종`);
}

// ── ② 소환 큐 — 일시정지 중에는 진행하지 않는다 ───────────────────
section('② 무기 소환 → ESC(일시정지)');
{
  const q = new SummonQueue();
  for (const w of WEAPONS.slice(0, 5)) q.push(w.id);
  let warmed = 0;
  let equipped = 0;
  const stepOnce = (state) => {
    if (state === 'paused' || state === 'menu') return null;
    return q.step(() => { warmed += 1; return true; }, () => { equipped += 1; return true; });
  };
  for (let i = 0; i < 30; i += 1) stepOnce('paused');
  check('일시정지 30프레임 동안 예열·장착이 0회', warmed === 0 && equipped === 0, `예열 ${warmed} · 장착 ${equipped}`);
  check('큐는 그대로 남아 있다', q.pending === 5, `남은 ${q.pending}종`);
  let frames = 0;
  while (q.pending && frames < 40) { stepOnce('playing'); frames += 1; }
  check('풀리면 이어서 완료된다', q.pending === 0, `${frames}프레임에 ${equipped}종 장착`);
  check('예열 없이 장착하지 않는다(프레임당 1종)', warmed === equipped, `예열 ${warmed} · 장착 ${equipped}`);
}

// ── ③ 소스 가드 ─────────────────────────────────────────────────
section('③ 프레임 루프 가드(소스)');
{
  const src = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  check('일시정지 중에는 예열·장착을 하지 않는다', src.includes("} else if (this.state !== 'paused') {") && src.includes("if (this.state === 'menu') {"));
  check('장착 단계도 일시정지·메뉴를 막는다', src.includes("if (this.state === 'paused' || this.state === 'menu') return null;"));
  check('예열에 시간 예산이 있다', src.includes('_prewarmStep(perFrame = 6, budgetMs = 2.5)') && src.includes('now() - startedAt > budgetMs'));
  check('예열된 무기만 장착한다', src.includes('!this._warmedWeapons.has(id) && this.renderer?.compile'));
}

// ── ④ 마법연성 배선 ─────────────────────────────────────────────
section('④ 마법연성(§4.70) 배율');
{
  const errors = validateArcana();
  check('연성 규칙 자체 검증', errors.length === 0, errors.join(' / ') || '전부 통과');
  check('연성 11종', ARCANA_UPGRADES.length === 11, ARCANA_UPGRADES.map((u) => u.name).join(' · '));

  const arcana = new Arcana();
  const attack = { category: 'attack', damage: 100, range: 20, fireRate: 1, rate: 0, system: { arcana } };
  const drill = { category: 'mining', damage: 10, range: 6, fireRate: 1, rate: 2, system: { arcana } };
  const lumber = { category: 'lumber', damage: 4, range: 6, fireRate: 1, rate: 1.5, system: { arcana } };
  const storage = { type: { capacity: 60 }, system: { arcana } };
  const apply = (o) => Turret.prototype._applyArcana.call(o);
  const cap = (o) => Turret.prototype.storageCapacity.call(o);
  apply(attack); apply(drill); apply(lumber);

  arcana.fromJSON({ turretDamage: 2, turretRange: 2, turretFireRate: 2, drillSpeed: 2, lumberSpeed: 2, coreStorage: 3 });
  apply(attack); apply(drill); apply(lumber);
  check('포탑 데미지 ×1.14', Math.abs(attack.damage - 114) < 1.5, `${attack.damage}`);
  check('포탑 사거리 ×1.12', Math.abs(attack.range - 22.4) < 0.2, `${attack.range}m`);
  check('포탑 공속 ×1.10', Math.abs(attack.fireRate - 1.1) < 0.02, `${attack.fireRate}`);
  check('채굴기 속도 ×1.16', Math.abs(drill.rate - 2.32) < 0.02, `${drill.rate}/s`);
  check('벌목기 속도 ×1.16', Math.abs(lumber.rate - 1.74) < 0.02, `${lumber.rate}/s`);
  check('저장고 용량 ×1.6', cap(storage) === 96, `${cap(storage)} (기본 60)`);
  check('코어 사거리 = 10 + 6×단계', new Arcana({ coreAttack: 4 }).coreRange() === 34, `${new Arcana({ coreAttack: 4 }).coreRange()}m`);

  // 업그레이드 이득이 연성 때문에 사라지지 않는다(상대 배율)
  const up = { category: 'attack', damage: 100, range: 20, fireRate: 1, rate: 0, system: { arcana: new Arcana() } };
  apply(up);
  up.damage = 250; // 포탑 자체 업그레이드로 오른 값
  up.system.arcana = arcana;
  apply(up);
  check('업그레이드 이득이 보존된다', Math.abs(up.damage - 285) < 3, `100 → 업그레이드 250 → 연성 후 ${up.damage}`);
}

// ── ⑤ 마법연성대(건설 재료 · 구매 조건) ──────────────────────
section('⑤ 마법연성대');
{
  const table = TURRET_BY_ID[ARCANA_TABLE_ID];
  check('연성대가 건설 목록에 있다', Boolean(table), table ? `${table.name} · ${JSON.stringify(table.cost)}` : '없음');
  check('건설 재료가 골드 10 · 목재 1', table?.cost?.gold === 10 && table?.cost?.wood === 1, `골드 ${table?.cost?.gold} · 목재 ${table?.cost?.wood}`);
  check('연성대는 시설이다', table?.category === 'facility' && table?.kind === 'arcana', `${table?.category}/${table?.kind}`);
  check('ARCANA_TABLE_COST 상수와 일치', ARCANA_TABLE_COST.gold === 10 && ARCANA_TABLE_COST.wood === 1);
  check('연성대 없으면 연성을 못 산다', hasArcanaTable([]) === false && hasArcanaTable([{ type: { id: 'facility_enchanter' } }]) === false);
  check('연성대가 있으면 살 수 있다', hasArcanaTable([{ typeId: ARCANA_TABLE_ID }]) === true);
  const mainSrc = readFileSync(new URL('../client/src/main.js', import.meta.url), 'utf8');
  check('구매 경로가 연성대를 확인한다', mainSrc.includes('if (!hasArcanaTable(this.turrets?.turrets ?? []))') && mainSrc.includes('마법연성대가 필요합니다'));
  const panelSrc = readFileSync(new URL('../client/src/ui/panels.js', import.meta.url), 'utf8');
  check('패널이 안내하고 버튼을 막는다', panelSrc.includes('tableReady') && panelSrc.includes('!tableReady'));
}

const total = pass + fail;
console.log(`\n명령어·연성 테스트: ${pass}개 통과 / ${fail}개 실패 (총 ${total}개)`);
process.exit(fail ? 1 : 0);

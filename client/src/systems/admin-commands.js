// 관리자 전용 명령어 — 무기 소환 / 돈 소환 / 자원 소환. 순수 로직(THREE/DOM 비의존).
// 권한은 서버 로그인 응답의 role(admin) 로만 열린다: auth.isAdmin === (user.role === 'admin').
import {
  WEAPONS,
  weaponById,
  MINERAL_TYPES,
  TREE_TYPES,
  BOSS_TYPES,
  FAIRY_WINGS,
  LEATHER_TYPES,
  LEATHER_GEAR,
  leatherById,
  leatherGearById,
  REGION_ENEMY_TYPES,
  ARROW_TIERS,
  arrowById
} from '../data.js';
import { findWing } from './wings.js';

const MINERAL_BY_ID = Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, m]));

/**
 * 패널 갱신을 **다음 프레임**으로 미룬다(계약 §4.47).
 * 명령 직후 곧바로 다시 그리면 그 프레임이 통째로 길어져 화면이 멈춘 것처럼 보인다.
 * 프레임 병합(requestRefresh)이 있으면 그쪽을 쓰고, 없으면 즉시 렌더로 물러난다.
 */
export function requestPanels(game) {
  const panels = game?.ui?.panels;
  if (!panels) return false;
  if (typeof panels.requestRefresh === 'function') return panels.requestRefresh();
  return panels.refresh?.() ?? false;
}
const TREE_BY_ID = Object.fromEntries(TREE_TYPES.map((t) => [t.id, t]));

export const ADMIN_PREFIX = '/';
export const ADMIN_LABEL = '관리자 콘솔';

/** 명령어 정의 — name(영문) + aliases(한글 포함) */
export const ADMIN_COMMANDS = [
  { name: 'help', aliases: ['도움말', '?', 'h', '명령어'], usage: '/도움말', desc: '관리자 명령어 목록을 봅니다' },
  { name: 'weapon', aliases: ['무기', 'w', '무기소환'], usage: '/무기 <id|이름>', desc: '무기 1종을 소환하고 바로 장착합니다' },
  { name: 'weapons', aliases: ['무기전부', '모든무기', 'allweapons', 'all-weapons'], usage: '/무기전부', desc: `모든 무기(${WEAPONS.length}종)를 소환합니다` },
  { name: 'gold', aliases: ['돈', '골드', 'money', 'g', '돈소환'], usage: '/돈 <수량>', desc: '골드를 소환합니다 (기본 100,000)' },
  { name: 'wood', aliases: ['목재', '나무', 'wood'], usage: '/목재 <수량>', desc: '목재를 소환합니다 (기본 10,000)' },
  { name: 'mineral', aliases: ['광물', '자원', 'ore', 'minerals'], usage: '/광물 <id|이름> [수량]', desc: '광물 1종을 소환합니다 (기본 99개)' },
  { name: 'resources', aliases: ['전체자원', '자원전부', '올인', 'resource', 'all'], usage: '/전체자원 [수량]', desc: `골드·목재·모든 광물(${MINERAL_TYPES.length}종)을 한 번에 소환합니다` },
  { name: 'wave', aliases: ['웨이브', 'wave'], usage: '/웨이브 <번호>', desc: '해당 웨이브를 즉시 시작합니다 (30 = 셀레스티얼)' },
  { name: 'heal', aliases: ['치유', '회복', '힐'], usage: '/치유', desc: '체력·마나를 가득 채우고 기지·포탑을 수리합니다' },
  { name: 'fly', aliases: ['플라이', '비행', '날기', 'fly'], usage: '/플라이 [켜기|끄기]', desc: '날개 없이 즉시 비행합니다 — Space 상승 · Shift 하강 (마나 소모 없음)' },
  { name: 'wings', aliases: ['날개', '윙', 'wing', 'fairywings'], usage: '/날개 [id|이름]', desc: `요정의 날개(${FAIRY_WINGS.length}종)를 소환하고 바로 착용합니다` },
  { name: 'leather', aliases: ['가죽', 'leather', '가죽소환'], usage: '/가죽 [id|이름|전부] [수량]', desc: `가죽(${LEATHER_TYPES.length}종)을 소환합니다 (기본 99개 · 인자 없으면 전부)` },
  { name: 'arrow', aliases: ['화살', 'arrow', 'arrows', '화살소환'], usage: '/화살 [id|이름|전부] [수량]', desc: '화살(7종)을 지급합니다 (기본 500발 · 인자 없으면 전부)' },
  { name: 'gear', aliases: ['장비', '가죽장비', 'gear', 'leathergear'], usage: '/장비 [id|이름]', desc: `가죽 장비(${LEATHER_GEAR.length}종)를 소환합니다 — 인자 없으면 최상위 6벌 전부 착용` }
];

export const ADMIN_DEFAULTS = { gold: 100000, wood: 10000, mineral: 99, resources: 999, leather: 99, arrow: 500, roamers: 4 };

/** 서버가 내려준 사용자 정보로 관리자 여부 판정 */
export function isAdminUser(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.isAdmin === true;
}

/** '/돈 100000' → { name:'gold', args:['100000'], raw:'돈 100000' } */
export function parseCommand(text) {
  const raw = String(text ?? '').trim();
  const body = raw.startsWith(ADMIN_PREFIX) ? raw.slice(ADMIN_PREFIX.length).trim() : raw;
  if (!body) return { ok: false, name: null, args: [], raw, reason: 'empty' };
  const parts = body.split(/\s+/);
  const head = parts[0].toLowerCase();
  const def = ADMIN_COMMANDS.find((c) => c.name === head || c.aliases.some((a) => a.toLowerCase() === head)) ?? null;
  if (!def) return { ok: false, name: null, args: parts.slice(1), raw, reason: 'unknown', head: parts[0] };
  return { ok: true, name: def.name, def, args: parts.slice(1), raw };
}

/** 이름/설명으로 무기 찾기 — id 완전일치 → 이름 완전일치 → 부분일치 */
export function findWeapon(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { weapon: null, matches: [] };
  const exact = weaponById(q) ?? WEAPONS.find((w) => String(w.name).toLowerCase() === q) ?? null;
  if (exact) return { weapon: exact, matches: [exact] };
  const matches = WEAPONS.filter((w) => String(w.id).toLowerCase().includes(q) || String(w.name).toLowerCase().includes(q));
  return { weapon: matches.length === 1 ? matches[0] : null, matches };
}

/** 이름/id로 광물 찾기 */
export function findMineral(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { mineral: null, matches: [] };
  const exact = MINERAL_BY_ID[q] ?? MINERAL_TYPES.find((m) => String(m.name).toLowerCase() === q) ?? null;
  if (exact) return { mineral: exact, matches: [exact] };
  const matches = MINERAL_TYPES.filter((m) => String(m.id).toLowerCase().includes(q) || String(m.name).toLowerCase().includes(q));
  return { mineral: matches.length === 1 ? matches[0] : null, matches };
}

/** 나무 찾기 — /나무 안내와 티어 조회용 */
export function findTree(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { tree: null, matches: [] };
  const exact = TREE_BY_ID[q] ?? TREE_TYPES.find((t) => String(t.name).toLowerCase() === q) ?? null;
  if (exact) return { tree: exact, matches: [exact] };
  const matches = TREE_TYPES.filter((t) => String(t.id).toLowerCase().includes(q) || String(t.name).toLowerCase().includes(q));
  return { tree: matches.length === 1 ? matches[0] : null, matches };
}

/** 이름/id로 가죽 찾기 */
export function findLeather(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { leather: null, matches: [] };
  const exact = leatherById(q) ?? LEATHER_TYPES.find((l) => String(l.name).toLowerCase() === q) ?? null;
  if (exact) return { leather: exact, matches: [exact] };
  const matches = LEATHER_TYPES.filter((l) => String(l.id).toLowerCase().includes(q) || String(l.name).toLowerCase().includes(q));
  return { leather: matches.length === 1 ? matches[0] : null, matches };
}

/** 이름/id로 화살 찾기 */
export function findArrow(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { arrow: null, matches: [] };
  const exact = arrowById(q) ?? ARROW_TIERS.find((a) => String(a.name).toLowerCase() === q) ?? null;
  if (exact) return { arrow: exact, matches: [exact] };
  const matches = ARROW_TIERS.filter((a) => String(a.id).toLowerCase().includes(q) || String(a.name).toLowerCase().includes(q));
  return { arrow: matches.length === 1 ? matches[0] : null, matches };
}

/** 이름/id로 가죽 장비 찾기 */
export function findGear(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return { gear: null, matches: [] };
  const exact = leatherGearById(q) ?? LEATHER_GEAR.find((g) => String(g.name).toLowerCase() === q) ?? null;
  if (exact) return { gear: exact, matches: [exact] };
  const matches = LEATHER_GEAR.filter((g) => String(g.id).toLowerCase().includes(q) || String(g.name).toLowerCase().includes(q));
  return { gear: matches.length === 1 ? matches[0] : null, matches };
}

/** 수량 파싱(0 이하면 기본값) */
export function count(n, fallback) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** 명령어 목록(콘솔 표시용) */
export function commandHelp() {
  return ADMIN_COMMANDS.map((c) => `${c.usage} — ${c.desc}`);
}

/** 현재 보유량 요약 */
export function walletOf(game) {
  const eco = game?.economy ?? null;
  return {
    gold: Math.floor(Number(eco?.gold) || 0),
    wood: Math.floor(Number(eco?.wood) || 0),
    minerals: Object.keys(eco?.minerals ?? {}).length,
    leather: Math.floor(Number(eco?.totalLeather?.()) || 0),
    gear: Math.floor(Number(game?.gear?.equippedCount) || 0)
  };
}

/**
 * 관리자 명령 실행.
 * @param {string} text '/돈 100000' 같은 입력
 * @param {{game?:object, user?:object, isAdmin?:boolean}} ctx
 * @returns {{ok:boolean, message:string, lines:string[], changed:boolean}}
 */
export function runAdminCommand(text, ctx = {}) {
  const fail = (message, lines = []) => ({ ok: false, message, lines, changed: false });
  const done = (message, lines = [], changed = true) => ({ ok: true, message, lines, changed });

  const allowed = ctx.isAdmin === true || isAdminUser(ctx.user);
  if (!allowed) return fail('관리자 전용 명령어입니다 (계정 role: admin)');

  const parsed = parseCommand(text);
  if (!parsed.ok) {
    if (parsed.reason === 'empty') return fail('명령어를 입력하세요');
    return fail(`알 수 없는 명령어: ${parsed.head ?? ''} — /도움말`, commandHelp());
  }

  const game = ctx.game ?? null;
  const args = parsed.args;

  switch (parsed.name) {
    case 'help':
      return { ok: true, message: `${ADMIN_LABEL} — 명령어 ${ADMIN_COMMANDS.length}종`, lines: commandHelp(), changed: false };

    case 'weapon': {
      if (!args.length) return fail('사용법: /무기 <id|이름> — 예) /무기 time_scissors, /무기 시간의 가위', commandHelp());
      const q = args.join(' ');
      const { weapon, matches } = findWeapon(q);
      if (!weapon) {
        if (matches.length > 1) return fail(`'${q}' 후보 ${matches.length}종 — 더 정확히 입력하세요`, matches.slice(0, 12).map((w) => `/무기 ${w.id} — ${w.name}`));
        return fail(`무기를 찾을 수 없습니다: ${q}`);
      }
      if (!game?.ownWeapon) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      const already = game.hasWeapon?.(weapon.id) === true;
      // 소환은 지급 → 셰이더 예열 → 장착으로 나눠서 한다(계약 §4.67).
      //  즉시 장착하면 그 프레임에 셰이더 컴파일이 몰려 게임이 멈춘 것처럼 보인다.
      const deferred = typeof game.summonWeapon === 'function';
      const owned = deferred
        ? game.summonWeapon(weapon.id, { silent: true }) !== false
        : already ? false : game.ownWeapon(weapon.id, { silent: true }) !== false;
      if (!deferred) game.equipWeapon?.(weapon.id, { silent: true, instant: true });
      const grade = weapon.gradeName ?? weapon.grade ?? '';
      return done(`무기 소환 — ${weapon.name} (${grade}) ${already ? '· 이미 보유' : '· 신규 획득'} · ${deferred ? '셰이더 예열 후 장착(잠시)' : '장착 완료'}`, [
        `id: ${weapon.id}`,
        `공격력: ${weapon.damage ?? '-'} · 사거리: ${weapon.range ?? '-'} · 등급: ${grade || '-'}`,
        `보유: ${already ? '이미 보유' : owned ? '획득' : '실패'} · 장착: ${game.staff?.weapon?.id ?? weapon.id}`,
        deferred ? '앞으로 몇 프레임 안에 장착됩니다(멈춤 방지)' : '즉시 장착'
      ]);
    }

    case 'weapons': {
      if (!game?.ownWeapon) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      // 계약 §4.47 — 실제 게임에서는 프레임 예산 큐로 나눠 지급한다(68종을 한 프레임에 주면 화면이 멈춘다).
      if (typeof game.grantWeapons === 'function') {
        const queued = game.grantWeapons(WEAPONS.map((w) => w.id));
        const owned = game.weapons?.owned?.size ?? 0;
        if (!queued) {
          return done(`모든 무기 소환 — 이미 전부 보유 (${owned}/${WEAPONS.length}종)`, [
            '무기 인벤토리(Tab)에서 장착할 수 있습니다'
          ]);
        }
        return done(`모든 무기 소환 시작 — ${queued}종을 잠시에 걸쳐 지급합니다 (보유 ${owned}/${WEAPONS.length}종)`, [
          '지급이 끝나면 알려 드립니다',
          '무기 인벤토리(Tab)에서 장착할 수 있습니다'
        ]);
      }
      let added = 0;
      for (const w of WEAPONS) {
        if (game.hasWeapon?.(w.id) === true) continue;
        if (game.ownWeapon(w.id, { silent: true }) !== false) added += 1;
      }
      const total = game.weapons?.owned?.size ?? WEAPONS.length;
      return done(`모든 무기 소환 — 신규 ${added}종 · 보유 ${total}/${WEAPONS.length}종`, [
        `보유 무기: ${total}/${WEAPONS.length}`,
        '무기 인벤토리(Tab)에서 장착할 수 있습니다'
      ]);
    }

    case 'gold': {
      if (!game?.addGold) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      const n = count(args[0], ADMIN_DEFAULTS.gold);
      game.addGold(n);
      return done(`골드 +${n.toLocaleString()} — 보유 ${walletOf(game).gold.toLocaleString()}`, [`/돈 ${n} 적용`]);
    }

    case 'wood': {
      if (!game?.addWood) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      const n = count(args[0], ADMIN_DEFAULTS.wood);
      game.addWood(n);
      return done(`목재 +${n.toLocaleString()} — 보유 ${walletOf(game).wood.toLocaleString()}`, [`/목재 ${n} 적용`]);
    }

    case 'mineral': {
      if (!game?.addMineral) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      if (!args.length) {
        return fail('사용법: /광물 <id|이름> [수량] — 예) /광물 time_shard 50', [
          `광물 ${MINERAL_TYPES.length}종: ${MINERAL_TYPES.slice(0, 12).map((m) => m.id).join(', ')} …`
        ]);
      }
      const amount = args.length > 1 ? count(args[args.length - 1], ADMIN_DEFAULTS.mineral) : ADMIN_DEFAULTS.mineral;
      const q = (args.length > 1 ? args.slice(0, -1) : args).join(' ');
      const { mineral, matches } = findMineral(q);
      if (!mineral) {
        if (matches.length > 1) return fail(`'${q}' 후보 ${matches.length}종 — 더 정확히 입력하세요`, matches.slice(0, 12).map((m) => `/광물 ${m.id} ${amount} — ${m.name}`));
        return fail(`광물을 찾을 수 없습니다: ${q}`);
      }
      game.addMineral(mineral.id, amount);
      const held = game.economy?.getMineral?.(mineral.id) ?? 0;
      return done(`광물 소환 — ${mineral.name} +${amount} (보유 ${held})`, [`id: ${mineral.id} · 티어 ${mineral.tier} · 가치 ${mineral.value}G`]);
    }

    case 'resources': {
      if (!game?.addGold) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      const n = count(args[0], ADMIN_DEFAULTS.resources);
      game.addGold(n);
      game.addWood?.(n);
      let minerals = 0;
      for (const m of MINERAL_TYPES) {
        game.addMineral?.(m.id, n);
        minerals += 1;
      }
      let leathers = 0;
      for (const l of LEATHER_TYPES) {
        if (game.economy?.addLeather?.(l.id, n) !== undefined) leathers += 1;
      }
      let arrows = 0;
      for (const a of ARROW_TIERS) {
        if (game.economy?.addArrow?.(a.id, n) !== undefined) arrows += 1;
      }
      const w = walletOf(game);
      const arrowTotal = Math.floor(Number(game.economy?.totalArrows?.()) || 0);
      return done(
        `자원 소환 — 골드 +${n.toLocaleString()} · 목재 +${n.toLocaleString()} · 광물 ${minerals}종 ×${n}${leathers ? ` · 가죽 ${leathers}종 ×${n}` : ''}${arrows ? ` · 화살 ${arrows}종 ×${n}발` : ''}`,
        [
          `보유 골드 ${w.gold.toLocaleString()} · 목재 ${w.wood.toLocaleString()} · 광물 종류 ${w.minerals} · 가죽 총 ${w.leather} · 화살 총 ${arrowTotal}발`
        ]
      );
    }

    case 'wave': {
      const waves = game?.waves ?? null;
      if (!waves) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      // 상한을 둔다 — 너무 큰 번호는 스폰이 몰려 프레임이 길어진다(계약 §4.47).
      const asked = count(args[0], 30);
      const target = Math.max(1, Math.min(999, asked));
      try {
        waves.reset?.();
        waves.wave = target - 1;
        waves.forceStart?.();
        const boss = BOSS_TYPES[BOSS_TYPES.length - 1];
        return done(`웨이브 ${target} 시작`, [
          asked > 999 ? `요청 ${asked} → 상한 999로 조정했습니다` : '',
          target >= 100 ? '큰 웨이브는 적이 많아 잠깐 느려질 수 있습니다(곧 복구됩니다).' : '',
          target % 30 === 0 && boss ? `최종보스: ${boss.name} (HP ${Number(boss.hp).toLocaleString()} · 공격력 ${Number(boss.attack).toLocaleString()})` : ''
        ].filter(Boolean));
      } catch (err) {
        return fail(`웨이브 이동 실패: ${err?.message ?? err}`);
      }
    }

    case 'heal': {
      const player = game?.player ?? null;
      if (!player) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      player.hp = player.maxHp ?? player.hp;
      player.mana = player.maxMana ?? player.mana;
      const base = game?.world?.base ?? null;
      if (base) {
        if (typeof base.heal === 'function') base.heal(1e9);
        else if (Number.isFinite(base.maxHp)) base.hp = base.maxHp;
      }
      let repaired = 0;
      for (const tower of game?.towers ?? []) {
        if (typeof tower?.heal === 'function') {
          tower.heal(1e9);
          repaired += 1;
        }
      }
      return done(
        `치유 완료 — 체력 ${Math.round(player.hp)}/${Math.round(player.maxHp ?? 0)} · 마나 ${Math.round(player.mana)}/${Math.round(player.maxMana ?? 0)}`,
        [`기지 ${base ? `${Math.round(base.hp)}/${Math.round(base.maxHp ?? 0)}` : '-'} · 포탑 ${repaired}기 수리`]
      );
    }

    case 'fly': {
      if (!game || typeof game.adminFly !== 'function') return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      const mode = args[0] ?? 'toggle';
      if (mode && !['toggle', 'on', 'off', '켜기', '끄기'].includes(String(mode).toLowerCase())) {
        return fail(`사용법: ${parsed.def?.usage ?? '/플라이 [켜기|끄기]'}`);
      }
      const r = game.adminFly(mode);
      return done(r?.message ?? '비행 전환', r?.on
        ? ['Space 를 누르고 있으면 상승 · Shift 로 하강', '마나를 쓰지 않습니다 · 착지하면 해제됩니다(키를 다시 눌러 이륙)']
        : ['비행을 껐습니다']);
    }

    case 'wings': {
      const wings = game?.wings ?? null;
      if (!wings) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      if (!args.length) {
        const list = typeof wings.list === 'function' ? wings.list() : [];
        return done(`요정의 날개 ${FAIRY_WINGS.length}종 — 보유 ${wings.count ?? 0}종`, list.map((w) => `/날개 ${w.id} — ${w.name} (${w.owned ? '보유' : '미보유'})`));
      }
      const q = args.join(' ');
      const { wing, matches } = findWing(q, FAIRY_WINGS);
      if (!wing) {
        if (matches.length > 1) return fail(`'${q}' 후보 ${matches.length}종 — 더 정확히 입력하세요`, matches.map((w) => `/날개 ${w.id} — ${w.name}`));
        return fail(`날개를 찾을 수 없습니다: ${q}`, FAIRY_WINGS.map((w) => `/날개 ${w.id} — ${w.name}`));
      }
      const r = typeof wings.grant === 'function' ? wings.grant(wing.id) : { ok: false, reason: '소환을 지원하지 않습니다' };
      if (r?.ok === false) return fail(r.reason ?? '소환 실패');
      game.applyFlight?.();
      requestPanels(game);
      game.notify?.(`요정의 날개 소환 — ${wing.name}`, 'gacha');
      return done(`날개 소환 — ${wing.name} (T${wing.tier}) ${r?.isNew ? '· 신규 획득' : '· 이미 보유'} · 착용 완료`, [
        `비행: 속도 ×${wing.flight?.speed ?? 1} · 상승 ${wing.flight?.lift ?? '-'} · 마나 ${wing.flight?.drain ?? 0}/s · 상한 ${wing.flight?.ceiling ?? '-'}m`,
        'Space 상승 · Shift 하강 · V 착용/해제'
      ]);
    }

    case 'leather': {
      const eco = game?.economy ?? null;
      if (!eco?.addLeather) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      const list = typeof eco.totalLeather === 'function' ? `가죽 ${LEATHER_TYPES.length}종` : '가죽';
      if (!args.length || ['전부', '전체', 'all'].includes(String(args[0]).toLowerCase())) {
        const amount = count(args[1], ADMIN_DEFAULTS.leather);
        for (const l of LEATHER_TYPES) eco.addLeather(l.id, amount);
        return done(`${list} 소환 — 5종 ×${amount} (보유 총 ${Math.floor(Number(eco.totalLeather?.()) || 0)})`, LEATHER_TYPES.map((l) => `${l.glyph} ${l.name} ×${eco.getLeather?.(l.id) ?? amount} — ${l.drop}`));
      }
      const amount = args.length > 1 ? count(args[args.length - 1], ADMIN_DEFAULTS.leather) : ADMIN_DEFAULTS.leather;
      const q = (args.length > 1 ? args.slice(0, -1) : args).join(' ');
      const { leather, matches } = findLeather(q);
      if (!leather) {
        if (matches.length > 1) return fail(`'${q}' 후보 ${matches.length}종 — 더 정확히 입력하세요`, matches.map((l) => `/가죽 ${l.id} ${amount} — ${l.name}`));
        return fail(`가죽을 찾을 수 없습니다: ${q}`, LEATHER_TYPES.map((l) => `/가죽 ${l.id} — ${l.name}`));
      }
      eco.addLeather(leather.id, amount);
      return done(`가죽 소환 — ${leather.name} +${amount} (보유 ${eco.getLeather?.(leather.id) ?? amount})`, [
        `id: ${leather.id} · 티어 ${leather.tier} · 가치 ${leather.value}G`,
        `획득처: ${leather.drop} · 가죽 장비는 인벤토리(I) → 가죽 장비`
      ]);
    }

    case 'arrow': {
      const eco = game?.economy ?? null;
      if (!eco?.addArrow) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      const list = typeof eco.totalArrows === 'function' ? `화살 ${ARROW_TIERS.length}종` : '화살';
      if (!args.length || ['전부', '전체', 'all'].includes(String(args[0]).toLowerCase())) {
        const amount = count(args[1], ADMIN_DEFAULTS.arrow);
        for (const a of ARROW_TIERS) eco.addArrow(a.id, amount);
        game.notify?.(`화살 ${ARROW_TIERS.length}종 ×${amount}발 소환`, 'gacha');
        return done(`${list} 소환 — ${ARROW_TIERS.length}종 ×${amount}발 (보유 총 ${Math.floor(Number(eco.totalArrows?.()) || 0)}발)`, ARROW_TIERS.map((a) => `${a.glyph} ${a.name} ×${eco.getArrow?.(a.id) ?? amount}발 — 발당 피해 ×${a.damageMult}`));
      }
      const amount = args.length > 1 ? count(args[args.length - 1], ADMIN_DEFAULTS.arrow) : ADMIN_DEFAULTS.arrow;
      const q = (args.length > 1 ? args.slice(0, -1) : args).join(' ');
      const { arrow, matches } = findArrow(q);
      if (!arrow) {
        if (matches.length > 1) return fail(`'${q}' 후보 ${matches.length}종 — 더 정확히 입력하세요`, matches.map((a) => `/화살 ${a.id} ${amount} — ${a.name}`));
        return fail(`화살을 찾을 수 없습니다: ${q}`, ARROW_TIERS.map((a) => `/화살 ${a.id} — ${a.name}`));
      }
      eco.addArrow(arrow.id, amount);
      const held = eco.getArrow?.(arrow.id) ?? amount;
      game.notify?.(`화살 소환 — ${arrow.name} +${amount}발`, 'gacha');
      return done(`/화살 소환 — ${arrow.name} +${amount} (보유 ${held}발)`, [
        `id: ${arrow.id} · 티어 ${arrow.tier} · 발당 피해 ×${arrow.damageMult}`,
        `묶음 ${arrow.bundle}발 · 제작대 ${arrow.table} · ${arrow.desc}`
      ]);
    }

    case 'gear': {
      const gear = game?.gear ?? null;
      if (!gear) return fail('게임이 시작된 뒤에 사용할 수 있습니다');
      if (!args.length || ['전부', '전체', 'all'].includes(String(args[0]).toLowerCase())) {
        for (const g of LEATHER_GEAR) gear.grant(g.id, { equip: true });
        game.applyGear?.();
        requestPanels(game);
        const stats = gear.stats?.() ?? null;
        game.notify?.(`가죽 장비 ${LEATHER_GEAR.length}벌 소환 + 착용`, 'gacha');
        return done(`가죽 장비 소환 — ${LEATHER_GEAR.length}벌 전부 착용 (${stats?.pieces ?? 0}세트)`, [
          ...LEATHER_GEAR.map((g) => `${g.glyph} ${g.name} — ${g.slot} · ${g.desc}`),
          ...(stats?.sets ?? []).map((s) => `세트: ${s.name} — ${s.desc}`)
        ]);
      }
      const q = args.join(' ');
      const { gear: one, matches } = findGear(q);
      if (!one) {
        if (matches.length > 1) return fail(`'${q}' 후보 ${matches.length}종 — 더 정확히 입력하세요`, matches.map((g) => `/장비 ${g.id} — ${g.name}`));
        return fail(`가죽 장비를 찾을 수 없습니다: ${q}`, LEATHER_GEAR.map((g) => `/장비 ${g.id} — ${g.name}`));
      }
      const r = gear.grant(one.id, { equip: true });
      if (r?.ok === false) return fail(r.reason ?? '소환 실패');
      game.applyGear?.();
      requestPanels(game);
      game.notify?.(`가죽 장비 소환 — ${one.name}`, 'gacha');
      return done(`가죽 장비 소환 — ${one.name} (${one.slot}) ${r?.isNew ? '· 신규 획득' : '· 이미 보유'} · 착용 완료`, [
        one.desc,
        `보너스: ${one.bonus ? Object.entries(one.bonus).map(([k, v]) => `${k} +${Math.round(v * 100)}%`).join(' · ') : '-'}`
      ]);
    }

    default:
      return fail(`구현되지 않은 명령어: ${parsed.name}`, commandHelp());
  }
}

export { findWing };
export const WILD_ENEMY_COUNT = REGION_ENEMY_TYPES.length;
export default { ADMIN_COMMANDS, runAdminCommand, parseCommand, isAdminUser, commandHelp, findWing, findLeather, findArrow, findGear };

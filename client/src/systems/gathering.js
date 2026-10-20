// 맨손 채집 — 도구(무기) 없이 T1 자원을 캔다. 순수 로직(THREE/DOM 비의존).
// 계약 §4.22: pickHarvestNode({origin,dir,trees,minerals,...}) -> {node, kind, blocked} | {node:null}
//             harvestNode(node, {kind, power, sink}) -> {ok, kind, id, amount, felled, depleted}

/** 맨손 채집 규칙 */
export const BARE_HAND = {
  /** 손이 닿는 거리(m) */
  reach: 3.8,
  /** 한 번 휘두를 때 자원 노드에 주는 피해 */
  power: 14,
  /** 휘두르는 주기(초) */
  interval: 0.42,
  /** 맨손으로 캘 수 있는 최대 티어 — T1 까지만 */
  maxTier: 1,
  /** 조준 원뿔(내적) — 0.15 ≈ 정면 81도 */
  cone: 0.15,
  /** 손맛: 화면 흔들림 */
  shake: 0.05,
  /** 표시 이름 */
  name: '맨손 채집'
};

/** 노드의 티어(나무·광물 공통) */
export function nodeTier(node) {
  const tier = Number(node?.tier);
  return Number.isFinite(tier) && tier > 0 ? tier : 0;
}

/** 살아있는 노드인가 */
export function isNodeAlive(node) {
  if (!node) return false;
  if (node.felled === true || node.depleted === true) return false;
  return true;
}

/** 맨손으로 캘 수 있는 노드인가(T1 이하 + 살아있음) */
export function canHarvestByHand(node, { maxTier = BARE_HAND.maxTier } = {}) {
  if (!isNodeAlive(node)) return false;
  const tier = nodeTier(node);
  return tier > 0 && tier <= maxTier;
}

function nodePos(node) {
  return { x: Number(node?.x) || 0, y: Number(node?.y) || 0, z: Number(node?.z) || 0 };
}

function aimScore(node, origin, dir, reach) {
  const p = nodePos(node);
  const dx = p.x - origin.x;
  const dy = (p.y + 0.9) - origin.y;
  const dz = p.z - origin.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const radius = Number(node?.radius) || 0.8;
  if (dist > reach + radius) return null;
  const dot = dist > 0.001 ? (dx * dir.x + dy * dir.y + dz * dir.z) / dist : 1;
  if (dot < BARE_HAND.cone) return null;
  return { dist, dot };
}

/**
 * 조준선에서 가장 가까운 노드를 고른다.
 * @returns {{node:object|null, kind:'tree'|'mineral'|null, blocked:object|null}}
 *   blocked — 손은 닿지만 티어가 높아 못 캐는 노드(안내 메시지용)
 */
export function pickHarvestNode({ origin, dir, trees = null, minerals = null, reach = BARE_HAND.reach, maxTier = BARE_HAND.maxTier } = {}) {
  const out = { node: null, kind: null, blocked: null };
  if (!origin || !dir) return out;
  let best = null;
  let bestKind = null;
  let bestScore = Infinity;
  let blocked = null;
  let blockedDist = Infinity;

  const scan = (list, kind) => {
    if (!list || !list.length) return;
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (!isNodeAlive(node)) continue;
      const aim = aimScore(node, origin, dir, reach);
      if (!aim) continue;
      if (canHarvestByHand(node, { maxTier })) {
        if (aim.dist < bestScore) {
          bestScore = aim.dist;
          best = node;
          bestKind = kind;
        }
      } else if (aim.dist < blockedDist) {
        blockedDist = aim.dist;
        blocked = node;
      }
    }
  };
  scan(minerals, 'mineral');
  scan(trees, 'tree');

  out.node = best;
  out.kind = bestKind;
  out.blocked = best ? null : blocked;
  return out;
}

/**
 * 노드를 한 대 친다 — 실제 게임 노드(chop/harvest)를 사용하고, sink(게임)에 자원을 반영한다.
 * @param {object} node world.trees / world.minerals 의 노드
 * @param {{kind?:string, power?:number, sink?:object}} opts sink: { economy, stats, audio, mineralTypesMined, ... }
 */
export function harvestNode(node, { kind = null, power = BARE_HAND.power, sink = null, maxTier = null } = {}) {
  if (!isNodeAlive(node)) return { ok: false, reason: 'none', kind, id: node?.typeId ?? null, amount: 0, felled: false, depleted: false };
  // 방어: 맨손 채집은 티어 상한을 넘길 수 없다(호출부가 뚫려도 여기서 막는다)
  if (maxTier != null && !canHarvestByHand(node, { maxTier })) {
    return { ok: false, reason: 'tier', kind, id: node?.typeId ?? null, amount: 0, felled: false, depleted: false };
  }
  const isTree = kind === 'tree' || (kind == null && Number.isFinite(Number(node.totalWood)));
  const id = node.typeId ?? null;
  if (isTree) {
    const res = node.chop?.(power) ?? null;
    const gained = Math.max(0, Number(res?.wood) || 0) + Math.max(0, Number(res?.magic) || 0);
    const felled = !!res?.felled;
    if (sink && gained > 0) {
      sink.economy?.addWood?.(gained);
      sink.stats?.track?.('woodChopped', gained);
      if (sink.woodChopped !== undefined) sink.woodChopped = Number(sink.woodChopped) + gained;
    }
    if (sink && felled) {
      sink.stats?.track?.('treesFelled', 1);
      if (sink.treesFelled !== undefined) sink.treesFelled = Number(sink.treesFelled) + 1;
    }
    if (sink?.audio && gained > 0) sink.audio.play?.('chop');
    return { ok: true, kind: 'tree', id, amount: gained, felled, depleted: false };
  }

  const res = node.harvest?.(power) ?? null;
  const gained = Math.max(0, Number(res?.amount) || 0);
  const depleted = !!res?.depleted;
  const mineralId = res?.mineralId ?? id;
  if (sink && gained > 0) {
    sink.economy?.addMineral?.(mineralId, gained);
    const value = Number(node.value) || 0;
    const gold = Math.round(value * 0.1) * gained;
    if (gold > 0) {
      sink.economy?.addGold?.(gold);
      sink.stats?.track?.('goldEarned', gold);
    }
    sink.stats?.track?.('mineralsMined', gained);
    if (sink.mineralsMined !== undefined) sink.mineralsMined = Number(sink.mineralsMined) + gained;
    sink.mineralTypesMined?.add?.(mineralId);
    sink.stats?.set?.('mineralTypesMined', sink.mineralTypesMined?.size ?? 0);
  }
  if (sink?.audio && gained > 0) sink.audio.play?.('mine');
  return { ok: true, kind: 'mineral', id: mineralId, amount: gained, felled: false, depleted };
}

/** 화면 안내 문구 */
export function harvestHint(node) {
  if (!isNodeAlive(node)) return '';
  const tier = nodeTier(node);
  const name = node?.name ?? '자원';
  if (canHarvestByHand(node)) return `🖐 ${name} — 좌클릭으로 맨손 채집`;
  return `⛏ ${name} (T${tier}) — 맨손으로는 캘 수 없습니다 · 무기(도구)를 장착하세요`;
}

export default { BARE_HAND, pickHarvestNode, harvestNode, canHarvestByHand, nodeTier, harvestHint };

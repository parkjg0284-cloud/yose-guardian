// 컨베이어벨트 물류 — 계약 §4.68.
//
// 벨트 위에는 광물 상자가 **실제로** 올라간다. 순서는 이렇다.
//   ① 채굴기가 캔 광물을 옆 벨트의 꼬리에 올린다(올릴 벨트가 없으면 예전처럼 즉시 입금)
//   ② 벨트 위 상자는 `speed`(m/s) 로 앞(-Z)으로 흐른다 — 상자끼리 최소 간격을 지킨다
//   ③ 앞 끝에 닿으면 → 앞 벨트에 넘기거나 → 앞 건물에 하역(그 순간 입금)하거나 → 막혀서 기다린다
//
// 좌표 규칙은 turrets.js 와 같다. **forward = -Z (yaw 0)** 이고, yaw 만큼 돌리면
//   forward = (-sin yaw, -cos yaw)
// 이다. 벨트 로컬 좌표에서 꼬리는 +Z, 앞은 -Z 다.
//
// 이 파일은 순수 로직이다(THREE/DOM 비의존) — 웹과 헤드리스 검사가 같은 코드를 쓴다.

export const BELT_ITEM_GAP = 0.6; // 상자 최소 간격(모델 단위)
export const BELT_ITEM_CAP = 8; // 한 벨트에 올라가는 상자 상한
export const BELT_LINK = 3.0; // 벨트 → 앞 벨트 연결 거리(앞 끝 기준)
export const BELT_PICKUP = 2.8; // 채굴기 → 벨트 적재 거리(중심 기준)
export const BELT_DELIVER = 2.8; // 벨트 끝 → 건물 하역 거리
export const BELT_YIELD_BONUS = 0; // 하역 시 추가 광물(밸런스용 — 지금은 없음)

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** 진행 방향 단위벡터 — forward = -Z(yaw 0) */
export function beltForward(yaw) {
  const a = num(yaw, 0);
  return { x: -Math.sin(a), z: -Math.cos(a) };
}

/** 벨트 앞 끝(월드) */
export function beltTip(belt) {
  const f = beltForward(belt?.yaw);
  const half = num(belt?.type?.beltLength, 3.4) / 2;
  return { x: num(belt?.position?.x) + f.x * half, z: num(belt?.position?.z) + f.z * half };
}

/** 벨트 위에 올릴 수 있는 상자 수 */
export function beltCapacity(belt) {
  const len = Math.max(1, num(belt?.type?.beltLength, 3.4));
  return Math.max(1, Math.min(BELT_ITEM_CAP, Math.floor(len / BELT_ITEM_GAP)));
}

/** 남은 자리 */
export function beltSpace(belt) {
  return Math.max(0, beltCapacity(belt) - (belt?.beltItems?.length ?? 0));
}

/** 두 벨트가 서로 마주 보는가(정면 충돌) */
export function beltsFacing(a, b) {
  const fa = beltForward(a?.yaw);
  const fb = beltForward(b?.yaw);
  const dx = num(b?.position?.x) - num(a?.position?.x);
  const dz = num(b?.position?.z) - num(a?.position?.z);
  const len = Math.hypot(dx, dz) || 1;
  const toward = { x: dx / len, z: dz / len };
  const aTowardB = fa.x * toward.x + fa.z * toward.z;
  const bTowardA = -(fb.x * toward.x + fb.z * toward.z);
  return aTowardB > 0.35 && bTowardA > 0.35;
}

/** 꼬리에 상자를 넣는다(배열은 앞 → 뒤 순서). 자리가 없으면 false. */
export function beltAccept(belt, id) {
  if (!belt || !id) return false;
  if (!Array.isArray(belt.beltItems)) belt.beltItems = [];
  if (beltSpace(belt) <= 0) return false;
  // 새 상자는 꼬리(t=0)에 들어가고, 기존 상자보다 뒤에 선다
  belt.beltItems.push({ id: String(id), t: 0 });
  return true;
}

/**
 * 한 벨트를 dt 만큼 진행시킨다.
 * @returns {{ moved: number, handed: number, delivered: number, jammed: boolean }}
 */
export function beltAdvance(belt, dt, ctx = {}) {
  const out = { moved: 0, handed: 0, delivered: 0, jammed: false };
  const items = Array.isArray(belt?.beltItems) ? belt.beltItems : null;
  if (!items || !items.length) return out;
  const len = Math.max(1, num(belt?.type?.beltLength, 3.4));
  const speed = Math.max(0, num(belt?.type?.speed, 2.5));
  const step = (speed * Math.max(0, num(dt))) / len;
  const gap = BELT_ITEM_GAP / len;
  // 앞에서부터(배열 앞이 앞쪽) 최소 간격을 지키며 전진
  let limit = 1;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const t = Math.min(limit, Math.max(0, num(item.t)) + step);
    if (t > num(item.t)) out.moved += 1;
    item.t = t;
    limit = Math.max(0, t - gap);
  }
  // 앞 상자가 끝에 닿았으면 넘기거나 하역한다
  const head = items[0];
  if (num(head?.t) < 1) return out;
  const handoff = typeof ctx.handoff === 'function' ? ctx.handoff : null;
  const deliver = typeof ctx.deliver === 'function' ? ctx.deliver : null;
  if (handoff?.(belt, head.id) === true) {
    items.shift();
    out.handed = 1;
    return out;
  }
  if (deliver?.(belt, head.id) === true) {
    items.shift();
    out.delivered = 1;
    return out;
  }
  out.jammed = true;
  return out;
}

/** 앞 끝에서 가장 가까운 '앞 벨트' — 마주 보는 벨트는 고르지 않는다 */
export function beltNeighbor(belt, belts) {
  if (!belt || !Array.isArray(belts)) return null;
  const tip = beltTip(belt);
  const f = beltForward(belt.yaw);
  let best = null;
  let bestD = BELT_LINK;
  for (const other of belts) {
    if (!other || other === belt || other.destroyed || other.type?.kind !== 'conveyor') continue;
    const dx = num(other.position?.x) - tip.x;
    const dz = num(other.position?.z) - tip.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    // 앞쪽(±90도 안)에 있어야 한다
    const len = d || 1;
    if ((f.x * dx + f.z * dz) / len < 0.2) continue;
    if (beltsFacing(belt, other)) continue;
    best = other;
    bestD = d;
  }
  return best;
}

/** 앞 끝에서 가장 가까운 '비(非)벨트 건물' — 하역 대상 */
export function beltReceiver(belt, turrets) {
  if (!belt || !Array.isArray(turrets)) return null;
  const tip = beltTip(belt);
  let best = null;
  let bestD = BELT_DELIVER;
  for (const other of turrets) {
    if (!other || other === belt || other.destroyed) continue;
    const kind = other.type?.kind;
    if (kind === 'conveyor' || kind === 'cable') continue;
    const d = Math.hypot(num(other.position?.x) - tip.x, num(other.position?.z) - tip.z);
    if (d > bestD) continue;
    best = other;
    bestD = d;
  }
  return best;
}

/**
 * 채굴기가 광물을 벨트에 올린다(올릴 벨트가 없으면 0).
 * @returns {number} 실제로 올린 개수
 */
export function beltLoad(drill, id, count, belts) {
  const want = Math.max(0, Math.floor(num(count)));
  if (!want || !id) return 0;
  const belts2 = belts ?? drill?.system?.turrets;
  if (!Array.isArray(belts2) || belts2.length === 0) return 0;
  const x = num(drill?.position?.x);
  const z = num(drill?.position?.z);
  let loaded = 0;
  for (let i = 0; i < want; i += 1) {
    let target = null;
    let bestD = BELT_PICKUP;
    for (const belt of belts2) {
      if (!belt || belt.destroyed || belt.type?.kind !== 'conveyor') continue;
      if (beltSpace(belt) <= 0) continue;
      // 꼬리 쪽(진행 방향 반대)에서 올린다 — 이미 지나간 상자와 겹치지 않는다
      const f = beltForward(belt.yaw);
      const half = num(belt.type?.beltLength, 3.4) / 2;
      const tail = { x: num(belt.position?.x) - f.x * half * 0.5, z: num(belt.position?.z) - f.z * half * 0.5 };
      const d = Math.hypot(tail.x - x, tail.z - z);
      if (d > bestD) continue;
      target = belt;
      bestD = d;
    }
    if (!target || !beltAccept(target, id)) break;
    loaded += 1;
  }
  return loaded;
}

/** 자체 검증 — 순수 규칙(간격·용량·연결·마주보기·하역·막힘) */
export function validateConveyorLogic() {
  const errors = [];
  const belt = (x, z, yaw, tier = 1) => ({
    position: { x, z },
    yaw,
    type: { kind: 'conveyor', beltLength: 3.4, speed: tier === 7 ? 9 : 2.5 },
    beltItems: []
  });

  // 방향 — yaw 0 은 -Z
  const f0 = beltForward(0);
  if (Math.abs(f0.x) > 1e-9 || Math.abs(f0.z + 1) > 1e-9) errors.push('yaw 0 의 진행 방향이 -Z 가 아니다');
  const f90 = beltForward(Math.PI / 2);
  if (!(f90.x < -0.999 && Math.abs(f90.z) < 1e-9)) errors.push('yaw 90도의 진행 방향이 -X 가 아니다');

  // 용량 — 길이/간격
  const b1 = belt(0, 0, 0);
  if (beltCapacity(b1) !== 5) errors.push(`길이 3.4 벨트의 용량이 5가 아니다(${beltCapacity(b1)})`);

  // 간격 — 같은 벨트 위 상자는 BELT_ITEM_GAP 이상 벌어진다
  const b2 = belt(0, 0, 0);
  b2.beltItems = [{ id: 'iron', t: 1 }, { id: 'copper', t: 1 }, { id: 'coal', t: 1 }];
  beltAdvance(b2, 1 / 60, {});
  const gap = BELT_ITEM_GAP / 3.4;
  if (!(b2.beltItems[0].t - b2.beltItems[1].t >= gap - 1e-9)) errors.push('상자 간격이 지켜지지 않는다');
  if (!(b2.beltItems[1].t - b2.beltItems[2].t >= gap - 1e-9)) errors.push('두 번째 간격이 지켜지지 않는다');

  // 막힘 — 앞에 아무것도 없으면 끝에서 멈춘다
  const b3 = belt(0, 0, 0);
  b3.beltItems = [{ id: 'iron', t: 0.95 }];
  const jam = beltAdvance(b3, 1, {});
  if (!jam.jammed || b3.beltItems.length !== 1) errors.push('막힘을 처리하지 못한다');

  // 연결 — 앞 벨트로 넘긴다(꼬리에 들어간다)
  const b4 = belt(0, 0, 0);
  const b5 = belt(0, -3.2, 0);
  b4.beltItems = [{ id: 'iron', t: 0.99 }];
  const handed = beltAdvance(b4, 1, { handoff: (b, id) => beltAccept(beltNeighbor(b, [b4, b5]), id) });
  if (handed.handed !== 1 || b4.beltItems.length !== 0 || b5.beltItems.length !== 1) errors.push('앞 벨트로 넘기지 못한다');
  if (!(b5.beltItems[0]?.t === 0)) errors.push('넘겨받은 상자가 꼬리에서 시작하지 않는다');

  // 하역 — 앞 건물에 넣는다
  const b6 = belt(0, 0, 0);
  const storage = { position: { x: 0, z: -3.4 }, type: { kind: 'storage' } };
  b6.beltItems = [{ id: 'iron', t: 0.99 }];
  const got = [];
  const del = beltAdvance(b6, 1, { deliver: (b, id) => { if (!beltReceiver(b, [b6, storage])) return false; got.push(id); return true; } });
  if (del.delivered !== 1 || got[0] !== 'iron' || b6.beltItems.length !== 0) errors.push('앞 건물로 하역하지 못한다');

  // 마주 보기 — 서로 향한 벨트끼리는 넘기지 않는다
  const b7 = belt(0, 0, 0); // -Z 로 진행
  const b8 = belt(0, -3.2, Math.PI); // +Z 로 진행( b7 쪽을 향한다 )
  if (!beltsFacing(b7, b8)) errors.push('마주 보는 벨트를 구분하지 못한다');
  if (beltNeighbor(b7, [b7, b8])) errors.push('마주 보는 벨트를 앞 벨트로 골랐다');

  // 적재 — 채굴기에서 벨트로, 자리가 없으면 안 올린다
  const drill = { position: { x: 0, z: 0 }, system: null };
  const b9 = belt(0, 0, 0);
  drill.system = { turrets: [b9] };
  const loaded = beltLoad(drill, 'iron', 3, [b9]);
  if (loaded !== 3 || b9.beltItems.length !== 3) errors.push(`적재 수가 맞지 않는다(${loaded})`);
  const b10 = belt(0, 0, 0);
  b10.beltItems = Array.from({ length: beltCapacity(b10) }, () => ({ id: 'iron', t: 0 }));
  if (beltLoad(drill, 'iron', 1, [b10]) !== 0) errors.push('가득 찬 벨트에 올렸다');

  return errors;
}

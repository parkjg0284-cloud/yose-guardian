// H-3: 전력망 모듈 — 발전기(공급) · 전선(도체) · 소비 건물의 연결을 계산한다.
// 규칙(data.js POWER):
//  · 전선끼리는 cableRange(8m) 안에서 연결된다.
//  · 건물은 전선(또는 다른 건물)에 deviceRange(6m) 안에서 붙는다.
//  · 같은 연결 성분(네트워크)의 공급 합 ≥ 소비 합 이면 그 네트워크의 소비 건물이 작동한다.
//  · 발전기가 있어도 전선으로 이어지지 않으면 먼 건물은 돌아가지 않는다(전선을 깔아야 한다).
// THREE 의존성 없음 — 헤드리스/단위 검증 대상.
export const POWER_ROLE = Object.freeze({
  SOURCE: 'source',
  CABLE: 'cable',
  CONSUMER: 'consumer',
  IDLE: 'idle'
});

/** 노드 하나의 역할 판정 — role 을 직접 주면 그대로 쓴다. */
export function powerRoleOf(node) {
  if (!node || typeof node !== 'object') return POWER_ROLE.IDLE;
  if (typeof node.role === 'string' && node.role) return node.role;
  const output = Number(node.output);
  const draw = Number(node.draw);
  if (Number.isFinite(output) && output > 0) return POWER_ROLE.SOURCE;
  if (Number.isFinite(draw) && draw > 0) return POWER_ROLE.CONSUMER;
  if (node.kind === 'cable' || node.cable === true) return POWER_ROLE.CABLE;
  return POWER_ROLE.IDLE;
}

/**
 * 전력망 계산기.
 * rebuild(nodes) → 요약({ networks, supply, demand, short, shortfall, coverage, unpowered })
 * nodes: [{ id, x, z, output?, draw?, role?, kind? }]
 */
export class PowerGrid {
  constructor({ cableRange = 8, deviceRange = 6, maxNodes = 800 } = {}) {
    this.cableRange = Math.max(0.5, Number(cableRange) || 8);
    this.deviceRange = Math.max(0.5, Number(deviceRange) || 6);
    this.maxNodes = Math.max(1, Math.floor(Number(maxNodes) || 800));
    /** 질의 격자 크기 — 두 연결 거리 중 큰 값이면 3×3 이웃만 보면 된다 */
    this._cell = Math.max(this.cableRange, this.deviceRange);
    /** @type {Array<object>} */ this.nodes = [];
    /** @type {Array<object>} */ this.networks = [];
    this.supply = 0;
    this.demand = 0;
    this.shortfall = 0;
    this.coverage = 1;
    this.short = false;
    this.rebuilds = 0;
    this._netOf = new Map();
    this._parent = [];
    this._rank = [];
  }

  get poweredAll() {
    return !this.short;
  }

  /** 전선인가(건물 연결 거리 규칙이 다르다) */
  _isCable(i) {
    return this.nodes[i]?.role === POWER_ROLE.CABLE;
  }

  _find(i) {
    let root = i;
    while (this._parent[root] !== root) root = this._parent[root];
    // 경로 압축
    let cur = i;
    while (this._parent[cur] !== root) {
      const next = this._parent[cur];
      this._parent[cur] = root;
      cur = next;
    }
    return root;
  }

  _union(a, b) {
    const ra = this._find(a);
    const rb = this._find(b);
    if (ra === rb) return;
    const rank = this._rank;
    if (rank[ra] < rank[rb]) this._parent[ra] = rb;
    else if (rank[ra] > rank[rb]) this._parent[rb] = ra;
    else {
      this._parent[rb] = ra;
      rank[ra] += 1;
    }
  }

  _linkDistance(i, j) {
    return this._isCable(i) && this._isCable(j) ? this.cableRange : this.deviceRange;
  }

  /** 전력망 전체 재계산 — 노드가 바뀔 때/주기마다 호출한다. */
  rebuild(nodes) {
    this.rebuilds += 1;
    const list = Array.isArray(nodes) ? nodes : [];
    const clean = [];
    const seen = new Set();
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const id = raw.id === undefined || raw.id === null ? null : String(raw.id);
      if (!id || seen.has(id)) continue;
      const x = Number(raw.x);
      const z = Number(raw.z);
      const role = powerRoleOf(raw);
      const output = role === POWER_ROLE.SOURCE ? Math.max(0, Number(raw.output) || 0) : 0;
      const draw = role === POWER_ROLE.CONSUMER ? Math.max(0, Number(raw.draw) || 0) : 0;
      seen.add(id);
      clean.push({ id, x, z, role, output, draw, valid: Number.isFinite(x) && Number.isFinite(z), index: clean.length });
      if (clean.length >= this.maxNodes) break;
    }
    this.nodes = clean;
    this._netOf = new Map();
    this.networks = [];
    this.supply = 0;
    this.demand = 0;
    this.shortfall = 0;
    this.coverage = 1;
    this.short = false;
    if (clean.length === 0) return this.status();

    // ── 질의 격자(연결 후보만 추린다 — 노드가 많아도 O(n) 에 가깝게)
    const cell = this._cell;
    const buckets = new Map();
    const key = (cx, cz) => `${cx}:${cz}`;
    const cellOf = (v) => Math.floor(v / cell);
    for (let i = 0; i < clean.length; i++) {
      const n = clean[i];
      if (!n.valid) continue;
      const k = key(cellOf(n.x), cellOf(n.z));
      const arr = buckets.get(k);
      if (arr) arr.push(i);
      else buckets.set(k, [i]);
    }

    this._parent = clean.map((_, i) => i);
    this._rank = clean.map(() => 0);

    for (let i = 0; i < clean.length; i++) {
      const a = clean[i];
      if (!a.valid) continue;
      const cx = cellOf(a.x);
      const cz = cellOf(a.z);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          const arr = buckets.get(key(cx + ox, cz + oz));
          if (!arr) continue;
          for (const j of arr) {
            if (j <= i) continue;
            const b = clean[j];
            if (!b.valid) continue;
            if (a.role === POWER_ROLE.IDLE || b.role === POWER_ROLE.IDLE) continue;
            const limit = this._linkDistance(i, j);
            const dx = a.x - b.x;
            const dz = a.z - b.z;
            if (dx * dx + dz * dz <= limit * limit) this._union(i, j);
          }
        }
      }
    }

    // ── 네트워크 합산
    const groups = new Map();
    for (let i = 0; i < clean.length; i++) {
      const n = clean[i];
      if (n.role === POWER_ROLE.IDLE) continue;
      const root = n.valid ? this._find(i) : i;
      let g = groups.get(root);
      if (!g) {
        g = { id: `net${groups.size + 1}`, supply: 0, demand: 0, members: [], sources: 0, consumers: 0, cables: 0 };
        groups.set(root, g);
      }
      g.members.push(n.id);
      g.supply += n.output;
      g.demand += n.draw;
      if (n.role === POWER_ROLE.SOURCE) g.sources += 1;
      else if (n.role === POWER_ROLE.CONSUMER) g.consumers += 1;
      else if (n.role === POWER_ROLE.CABLE) g.cables += 1;
    }

    for (const g of groups.values()) {
      g.ok = g.demand <= 0 || g.supply >= g.demand;
      g.shortfall = g.ok ? 0 : g.demand - g.supply;
      g.coverage = g.demand > 0 ? Math.min(1, g.supply / g.demand) : 1;
      this.networks.push(g);
      this.supply += g.supply;
      this.demand += g.demand;
      if (!g.ok) {
        this.short = true;
        this.shortfall += g.shortfall;
      }
    }
    this.networks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    this.coverage = this.demand > 0 ? Math.min(1, this.supply / this.demand) : 1;

    for (const n of clean) {
      if (n.role === POWER_ROLE.SOURCE || n.role === POWER_ROLE.CABLE || n.role === POWER_ROLE.IDLE) {
        this._netOf.set(n.id, { netId: null, supply: 0, demand: 0, powered: true, role: n.role });
        continue;
      }
      const g = n.valid ? groups.get(this._find(n.index)) : null;
      const own = g ?? { id: null, supply: 0, demand: n.draw, ok: false };
      const isolated = !g && n.draw > 0;
      this._netOf.set(n.id, {
        netId: g ? g.id : null,
        supply: own.supply ?? 0,
        demand: own.demand ?? 0,
        powered: isolated ? false : own.ok !== false,
        role: n.role
      });
    }
    return this.status();
  }

  /** 특정 노드의 전력 상태 */
  networkOf(id) {
    const key = id === undefined || id === null ? '' : String(id);
    return this._netOf.get(key) ?? null;
  }

  /**
   * 이 노드가 지금 돌아갈 수 있는가.
   * 등록되지 않은 id(막 지은 건물 등)는 관대하게 true — 0.3초 재계산 사이에 잘못 멈추지 않게.
   */
  isPowered(id) {
    const info = this.networkOf(id);
    if (!info) return true;
    return info.powered !== false;
  }

  status() {
    return {
      nodes: this.nodes.length,
      networks: this.networks.length,
      supply: Math.round(this.supply * 100) / 100,
      demand: Math.round(this.demand * 100) / 100,
      short: this.short,
      shortfall: Math.round(this.shortfall * 100) / 100,
      coverage: Math.round(this.coverage * 1000) / 1000,
      unpowered: this.networks
        .filter((g) => !g.ok)
        .flatMap((g) => g.members.filter((id) => this._netOf.get(id)?.role === POWER_ROLE.CONSUMER))
    };
  }

  reset() {
    this.nodes = [];
    this.networks = [];
    this._netOf = new Map();
    this.supply = 0;
    this.demand = 0;
    this.shortfall = 0;
    this.coverage = 1;
    this.short = false;
  }
}

export default PowerGrid;

// ── 자체 점검(개발 편의용) ──────────────────────────────────────────────
export function selfTest() {
  const grid = new PowerGrid({ cableRange: 8, deviceRange: 6 });
  const gen = { id: 'g', x: 0, z: 0, output: 12 };
  const drill = { id: 'd', x: 4, z: 0, draw: 3 };
  grid.rebuild([gen, drill]);
  const near = grid.isPowered('d');
  grid.rebuild([gen, { id: 'd', x: 40, z: 0, draw: 3 }]);
  const far = grid.isPowered('d');
  grid.rebuild([gen, { id: 'c1', x: 6, z: 0, kind: 'cable' }, { id: 'd', x: 40, z: 0, draw: 3 }]);
  const noLink = grid.isPowered('d');
  grid.rebuild([
    gen,
    { id: 'c1', x: 6, z: 0, kind: 'cable' },
    { id: 'c2', x: 13, z: 0, kind: 'cable' },
    { id: 'c3', x: 20, z: 0, kind: 'cable' },
    { id: 'd', x: 25, z: 0, draw: 3 }
  ]);
  const linked = grid.isPowered('d');
  return { near, far, noLink, linked };
}

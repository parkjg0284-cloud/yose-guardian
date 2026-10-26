// Trees: one InstancedMesh per crown shape family + one for trunks. No per-tree meshes.
import * as THREE from 'three';
import { MAP, TREE_TYPES, TREE_CATEGORIES } from '../data.js';
import { REGIONS, HIDDEN_REGIONS, REGION_SPAWN, RING_TREE_WEIGHT, hiddenTreeIds, randomPointIn, ringQuotas } from './regions.js';

const KEEP_OUT_RADIUS = 60;
const MAX_SLOPE = 0.55;
const MIN_SPACING = 3;
const GRID_CELL = MIN_SPACING;
const GRID_DIM = Math.ceil(MAP.size / GRID_CELL) + 4;
const RESPAWN_DELAY = 6;
const MAX_TREES = 1100;
// 질의용 공간 해시 — nearest() 가 나무 1,100그루를 매번 훑지 않게 한다
const QUERY_CELL = 16;
const QUERY_DIM = Math.ceil(MAP.size / QUERY_CELL) + 4;
// 렌더 청크 크기(m) — 이 단위로 InstancedMesh 를 나눠 거리 컬링한다
const CHUNK_SIZE = 460;
// 청크 컬링 여유(m) — 청크 경계에서 나무가 갑자기 사라지지 않게
const CULL_MARGIN = 150;

// deterministic category lottery weights
const CATEGORY_ORDER = ['normal', 'magic', 'elemental', 'ancient', 'mythic'];
const CATEGORY_WEIGHTS = { normal: 60, magic: 20, elemental: 12, ancient: 6, mythic: 2 };

// ── 자원 디자인 도구(H-89) ──────────────────────────────────────────
//  정점을 해시 노이즈로 밀어 유기적인 굴곡을 만들고, 높이에 따라 밝기를 달리하는
//  정점 색을 심는다(재질은 색 × 정점색으로 명암이 생긴다 — 텍스처 없이 입체감).
function _hash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  h = h - Math.floor(h);
  return h;
}

function _smoothNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => _hash3(xi + i, yi + j, zi + k);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  );
}

/** 지오메트리를 유기적으로 다듬고 정점 색(아래 어둡게 → 위 밝게)을 심는다. */
function detailGeometry(geo, opts = {}) {
  const { seed = 1, amp = 0.12, freq = 2.6, tint = [0.62, 1.08], wobble = 0.07, squash = 0.45 } = opts;
  const pos = geo.attributes?.position;
  if (!pos) return geo;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(0.0001, maxY - minY);
  for (let i = 0; i < n; i += 1) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const noise = _smoothNoise(x * freq + seed, y * freq + seed * 1.7, z * freq + seed * 2.3);
    const r = 1 + (noise - 0.5) * 2 * amp;
    pos.setXYZ(i, x * r, y * (1 + (noise - 0.5) * amp * squash), z * r);
    const t = (y - minY) / span;
    const shade = tint[0] + (tint[1] - tint[0]) * t + (noise - 0.5) * wobble;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere?.();
  return geo;
}

/** 줄기 — 밑동이 벌어지고(뿌리) 위로 가늘어지며 껍질이 울퉁불퉁한 원기둥. */
function makeTrunkGeometry() {
  const profile = [
    [0.62, 0.00], [0.50, 0.03], [0.40, 0.10], [0.33, 0.26],
    [0.27, 0.50], [0.23, 0.74], [0.20, 0.90], [0.10, 1.00]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 8);
  return detailGeometry(geo, { seed: 5.5, amp: 0.09, freq: 4.2, tint: [0.58, 1.0], wobble: 0.05 });
}

// crown geometry per shape family (shared across all trees of that family)
//  잎은 여러 덩어리가 뭉친 모양이 되도록 정점을 밀어 만든다(noise). 색은 아래 어둡게·위 밝게.
const _shapes = (() => {
  const round = detailGeometry(new THREE.IcosahedronGeometry(1, 2), { seed: 3.1, amp: 0.2, freq: 2.7, tint: [0.6, 1.12] });
  const cone = detailGeometry(new THREE.ConeGeometry(1, 2, 9, 3), { seed: 7.4, amp: 0.11, freq: 3.6, tint: [0.55, 1.06] });
  const crystal = detailGeometry(new THREE.OctahedronGeometry(1, 1), { seed: 11.2, amp: 0.17, freq: 3.1, tint: [0.52, 1.18] });
  const star = detailGeometry(new THREE.TetrahedronGeometry(1.45, 1), { seed: 13.9, amp: 0.14, freq: 2.9, tint: [0.58, 1.1] });
  const flame = detailGeometry(new THREE.ConeGeometry(0.88, 2.2, 8, 2), { seed: 17.3, amp: 0.15, freq: 3.3, tint: [0.5, 1.2] });
  const droop = detailGeometry(new THREE.SphereGeometry(1.15, 10, 7), { seed: 19.6, amp: 0.13, freq: 3.0, tint: [0.6, 1.05] });
  return { round, cone, crystal, star, flame, droop };
})();

const SHAPE_DEFS = {
  round: { geo: () => _shapes.round, s: [1.28, 1.16, 1.28], lift: 1.15 },
  cone: { geo: () => _shapes.cone, s: [1.05, 1.3, 1.05], lift: 1.15 },
  crystal: { geo: () => _shapes.crystal, s: [0.74, 1.7, 0.74], lift: 1.45 },
  star: { geo: () => _shapes.star, s: [1.15, 1.2, 1.15], lift: 1.25 },
  flame: { geo: () => _shapes.flame, s: [1, 1.05, 1], lift: 1.3 },
  droop: { geo: () => _shapes.droop, s: [1.22, 0.92, 1.22], lift: 0.85 }
};
const SHAPE_NAMES = Object.keys(SHAPE_DEFS);

const _zeroMatrix = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

export class TreeField {
  constructor({ rng, terrain, preset = null } = {}) {
    this.rng = rng;
    this.terrain = terrain;
    this.preset = preset;
    this.trees = [];
    this._qgrid = new Map();
    this.group = new THREE.Group();
    this.group.name = 'trees';
    this.group.matrixAutoUpdate = false;
    this.group.updateMatrix();
    this.respawnDelay = RESPAWN_DELAY;
    this._time = 0;
    this._felled = [];
    this._meshes = [];
    this._materials = [];

    // category -> type list
    this._byCategory = {};
    for (const c of CATEGORY_ORDER) this._byCategory[c] = TREE_TYPES.filter((t) => t.category === c);
    this._trunkGeo = null;
    this._disposed = false;

    // scratch objects (never allocate inside build loops)
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._color = new THREE.Color();
  }

  get count() {
    return this.trees.length;
  }

  get aliveCount() {
    let n = 0;
    for (const t of this.trees) if (!t.felled) n++;
    return n;
  }

  // 띠 지역(T1~T7) → 히든 지역 순서로 심는다. 나무 종은 자기 티어의 지역에서만 나온다.
  build() {
    if (this._disposed) return this.group;
    const count = Math.min(MAX_TREES, Math.max(0, Math.round(this.preset?.treeCount ?? 480)));
    this._scatter(count);
    this._buildInstances();
    return this.group;
  }

  // ── 지역별 배치: 띠 지역(T1~T7) → 히든 지역. 나무는 자기 티어 지역에서만 자란다 ──
  _scatter(count) {
    const state = {
      half: MAP.half - 30,
      keep2: KEEP_OUT_RADIUS * KEEP_OUT_RADIUS,
      spacing2: MIN_SPACING * MIN_SPACING,
      buckets: new Map()
    };
    const pools = this._regionPools();

    for (const { region, quota } of ringQuotas(count, RING_TREE_WEIGHT)) {
      this._placeInRegion(state, region, pools.get(region.id), quota);
    }
    for (const hidden of HIDDEN_REGIONS) {
      this._placeInRegion(state, hidden, pools.get(hidden.id), REGION_SPAWN.hiddenTrees);
    }
  }

  /** 지역 id → 그 지역에서 자라는 나무 목록(히든 나무는 자기 지역 전용) */
  _regionPools() {
    const hiddenTrees = new Set(hiddenTreeIds());
    const pools = new Map();
    for (const region of REGIONS) {
      if (region.id === 'safe' || region.id === 'outer') continue;
      const tiers = region.treeTiers || [];
      pools.set(region.id, TREE_TYPES.filter((t) => !hiddenTrees.has(t.id) && tiers.includes(t.tier)));
    }
    for (const hidden of HIDDEN_REGIONS) {
      pools.set(hidden.id, TREE_TYPES.filter((t) => hidden.treeIds.includes(t.id)));
    }
    return pools;
  }

  /** 한 지역 안에 quota 그루를 심는다(경사·간격 규칙 유지) */
  _placeInRegion(state, region, pool, quota) {
    if (!pool || !pool.length || quota <= 0) return 0;
    const rng = this.rng;
    const terrain = this.terrain;
    const rand = () => rng.range(0, 1);
    const maxTries = quota * 40 + 80;
    let placed = 0;
    for (let tries = 0; tries < maxTries && placed < quota; tries++) {
      const { x, z } = randomPointIn(region.id, rand);
      if (Math.abs(x) > state.half || Math.abs(z) > state.half) continue;
      if (x * x + z * z < state.keep2) continue;
      if (terrain.slopeAt(x, z) > MAX_SLOPE) continue;

      const gx = Math.floor((x + MAP.half) / GRID_CELL);
      const gz = Math.floor((z + MAP.half) / GRID_CELL);
      if (this._tooClose(state.buckets, gx, gz, x, z, state.spacing2)) continue;

      const type = rng.pick(pool);
      const scale = type.scale * rng.range(0.9, 1.12);
      const tree = this._makeTree(this.trees.length, type, x, z, scale, rng.range(0, Math.PI * 2), rng.range(-0.08, 0.08));
      this.trees.push(tree);
      this._indexTree(tree);

      const key = gx * GRID_DIM + gz;
      const list = state.buckets.get(key);
      if (list) list.push(tree);
      else state.buckets.set(key, [tree]);
      placed += 1;
    }
    return placed;
  }

  /** 공간 해시로 최소 간격 검사(기존 규칙 그대로) */
  _tooClose(buckets, gx, gz, x, z, spacing2) {
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const list = buckets.get((gx + ox) * GRID_DIM + (gz + oz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          const dx = o.x - x;
          const dz = o.z - z;
          if (dx * dx + dz * dz < spacing2) return true;
        }
      }
    }
    return false;
  }

  _makeTree(id, type, x, z, scale, rotation, tint) {
    const tree = {
      id,
      typeId: type.id,
      name: type.name,
      category: type.category,
      categoryName: TREE_CATEGORIES[type.category]?.name ?? type.category,
      tier: type.tier,
      shape: type.shape,
      x,
      z,
      y: 0,
      scale,
      rotation,
      hp: type.hp,
      maxHp: type.hp,
      radius: 0.9 * scale + 0.5,
      wood: type.wood,
      magic: type.magic,
      totalWood: type.wood,
      totalMagic: type.magic,
      speedBonus: type.speedBonus,
      felled: false,
      respawnAt: 0,
      mesh: null,
      instanceIndex: -1,
      _accWood: 0,
      _accMagic: 0,
      _tint: tint,
      chop: (amount) => this.chop(tree, amount)
    };
    return tree;
  }

  /* ── 청크(렌더 단위) ────────────────────────────────────────────────
     InstancedMesh 는 인스턴스 단위 컬링이 없다 → 한 덩어리로 두면
     1,100그루를 항상 그린다(정점·픽셀 비용). 나무를 (도형 × 청크)로 나눠
     담고 카메라에서 먼 청크는 통째로 숨긴다(그림자 패스에서도 뺀다). */
  _chunkOf(x, z) {
    const cx = Math.floor((x + MAP.half) / CHUNK_SIZE);
    const cz = Math.floor((z + MAP.half) / CHUNK_SIZE);
    return cx + ':' + cz;
  }

  _chunksFrom(byChunk) {
    this._chunkMap = new Map();
    this._chunks = [];
    for (const [key, list] of byChunk) {
      let sx = 0;
      let sz = 0;
      for (const t of list) {
        sx += t.x;
        sz += t.z;
      }
      const entry = {
        key,
        x: sx / list.length,
        z: sz / list.length,
        count: list.length,
        meshes: [],
        on: null,
        shadow: null
      };
      this._chunkMap.set(key, entry);
      this._chunks.push(entry);
    }
  }

  _registerMesh(entry, mesh) {
    // 수관 재질도 정점 색을 쓰게 맞춘다(H-89) — 메시 등록 시점엔 재질이 모두 만들어져 있다.
    for (const mat of this._materials ?? []) {
      if (mat && mat.vertexColors !== true) {
        mat.vertexColors = true;
        mat.needsUpdate = true;
      }
    }
    if (!entry) return mesh;
    entry.meshes.push(mesh);
    mesh.visible = entry.on !== false;
    return mesh;
  }

  /** 도형별 지오메트리는 한 번만 만들어 모든 청크가 공유한다 */
  _shapeGeo(shape) {
    if (!this._shapeGeos) this._shapeGeos = new Map();
    let geo = this._shapeGeos.get(shape);
    if (!geo) {
      const def = SHAPE_DEFS[shape] ?? SHAPE_DEFS.round;
      geo = def.geo();
      this._shapeGeos.set(shape, geo);
    }
    return geo;
  }

  _buildInstances() {
    const trunkGeo = makeTrunkGeometry(); // 뿌리 벌어짐 + 껍질 굴곡(H-89)
    this._trunkGeo = trunkGeo;
    if (!this._geos) this._geos = [];
    this._geos.push(trunkGeo);

    // (청크) · (도형 × 청크) 로 묶는다
    const byChunk = new Map();
    const byShape = new Map();
    for (const tree of this.trees) {
      const key = this._chunkOf(tree.x, tree.z);
      let list = byChunk.get(key);
      if (!list) {
        list = [];
        byChunk.set(key, list);
      }
      list.push(tree);
      const shapeKey = (tree.shape ?? 'round') + '|' + key;
      let shapeList = byShape.get(shapeKey);
      if (!shapeList) {
        shapeList = [];
        byShape.set(shapeKey, shapeList);
      }
      shapeList.push(tree);
    }
    this._chunksFrom(byChunk);

    // 지면 높이를 먼저 확정한다(줄기·수관이 같은 y 를 쓴다)
    for (const tree of this.trees) {
      const gridH = typeof this.terrain.surfaceHeight === 'function'
        ? this.terrain.surfaceHeight(tree.x, tree.z)
        : this.terrain.getHeight(tree.x, tree.z);
      tree.y = gridH - 0.22 * tree.scale; // 경사에서 뿌리가 뜨지 않게 살짝 묻는다
    }

    // 1) 줄기 — 청크마다 InstancedMesh 1개(재질 공유)
    // 정점 색을 명암으로 쓴다(H-89) — 텍스처 없이도 입체감이 산다.
    const trunkMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.02, flatShading: true, vertexColors: true });
    this._materials.push(trunkMat);
    const trunkColor = new THREE.Color();
    for (const [key, list] of byChunk) {
      const entry = this._chunkMap.get(key);
      const mesh = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      mesh.name = 'tree.trunks.' + key;
      mesh.castShadow = !!this.preset?.shadow;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      this.group.add(mesh);
      this._meshes.push(mesh);
      this._registerMesh(entry, mesh);

      for (let i = 0; i < list.length; i++) {
        const tree = list[i];
        const s = tree.scale;
        this._p.set(tree.x, tree.y, tree.z);
        this._e.set(0, tree.rotation, 0);
        this._q.setFromEuler(this._e);
        this._s.set(1.6 * s, 3.2 * s, 1.6 * s);
        this._m.compose(this._p, this._q, this._s);
        mesh.setMatrixAt(i, this._m);
        trunkColor.setHex(TREE_TYPES_BY_ID[tree.typeId]?.trunkColor ?? 0x6b4a2a);
        trunkColor.offsetHSL(0, 0, tree._tint * 0.6);
        mesh.setColorAt(i, trunkColor);
        tree.trunkInstanceIndex = i;
        tree.trunkMesh = mesh;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere?.();
    }

    // 2) 수관 — (도형 × 청크)마다 1개, 도형별 재질·지오메트리는 공유
    const shapeMats = new Map();
    const crownColor = new THREE.Color();
    for (const [shapeKey, list] of byShape) {
      const sep = shapeKey.indexOf('|');
      const shape = shapeKey.slice(0, sep);
      const chunkId = shapeKey.slice(sep + 1);
      const def = SHAPE_DEFS[shape] ?? SHAPE_DEFS.round;
      const entry = this._chunkMap.get(chunkId);
      let mat = shapeMats.get(shape);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.03, flatShading: true });
        shapeMats.set(shape, mat);
        this._materials.push(mat);
      }
      const geo = this._shapeGeo(shape);
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = 'tree.crown.' + shape + '.' + chunkId;
      mesh.castShadow = !!this.preset?.shadow;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      this.group.add(mesh);
      this._meshes.push(mesh);
      this._registerMesh(entry, mesh);

      for (let i = 0; i < list.length; i++) {
        const tree = list[i];
        const type = TREE_TYPES_BY_ID[tree.typeId];
        tree.mesh = mesh;
        tree.instanceIndex = i;
        const geoScale = tree.scale * 1.5;
        this._p.set(tree.x, tree.y + 3.2 * tree.scale + def.lift * geoScale, tree.z);
        this._e.set(0, tree.rotation, 0);
        this._q.setFromEuler(this._e);
        this._s.set(def.s[0] * geoScale, def.s[1] * geoScale, def.s[2] * geoScale);
        this._m.compose(this._p, this._q, this._s);
        mesh.setMatrixAt(i, this._m);
        crownColor.setHex(type?.color ?? 0x3f7d3a);
        crownColor.offsetHSL(0, 0, tree._tint);
        mesh.setColorAt(i, crownColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere?.();
    }
  }

  /** 카메라 거리 기준 청크 컬링 — 보이는 청크 수를 돌려준다 */
  cullChunks(camera) {
    if (!camera || !this._chunks?.length) return 0;
    const p = camera.position ?? camera;
    // 안개(fog)가 덮는 거리 밖은 어차피 보이지 않는다 → 안개 끝 + 여유까지만 그린다.
    const draw = Number(this.preset?.drawDistance) || 440;
    const fogFar = Number(this.preset?.fog?.far) || draw;
    const r = Math.min(draw, fogFar) + CULL_MARGIN;
    const r2 = r * r;
    const wantShadow = this.preset?.shadow !== false;
    let visible = 0;
    for (let i = 0; i < this._chunks.length; i++) {
      const chunk = this._chunks[i];
      const dx = chunk.x - p.x;
      const dz = chunk.z - p.z;
      const on = dx * dx + dz * dz <= r2;
      if (chunk.on !== on || chunk.shadow !== wantShadow) {
        chunk.on = on;
        chunk.shadow = wantShadow;
        for (let m = 0; m < chunk.meshes.length; m++) {
          const mesh = chunk.meshes[m];
          mesh.visible = on;
          mesh.castShadow = on && wantShadow;
        }
      }
      if (on) visible += 1;
    }
    return visible;
  }

  /** 품질/프리셋이 바뀌면 다음 컬링에서 강제로 다시 계산한다 */
  invalidateCull() {
    for (const chunk of this._chunks ?? []) {
      chunk.on = null;
      chunk.shadow = null;
    }
  }

  // ── gameplay ──
  chop(tree, amount) {
    if (!tree || tree.felled) {
      return { wood: 0, magic: 0, felled: !!(tree && tree.felled) };
    }
    const dmg = Math.max(0, amount);
    const before = tree.hp;
    tree.hp = before - dmg;
    const frac = tree.maxHp > 0 ? Math.min(1, dmg / tree.maxHp) : 1;
    tree._accWood += tree.totalWood * frac;
    tree._accMagic += tree.totalMagic * frac;
    let wood = Math.floor(tree._accWood + 1e-9);
    let magic = Math.floor(tree._accMagic + 1e-9);
    tree._accWood -= wood;
    tree._accMagic -= magic;

    let felled = false;
    if (tree.hp <= 0) {
      tree.hp = 0;
      felled = true;
      const rw = Math.round(tree._accWood);
      const rm = Math.round(tree._accMagic);
      tree._accWood = 0;
      tree._accMagic = 0;
      wood += rw;
      magic += rm;
      this._fell(tree);
    }
    tree.wood = Math.max(0, tree.wood - wood);
    tree.magic = Math.max(0, tree.magic - magic);
    return { wood, magic, felled };
  }

  _fell(tree) {
    tree.felled = true;
    tree.respawnAt = this._time + this.respawnDelay;
    if (tree.mesh && tree.instanceIndex >= 0) {
      tree.mesh.setMatrixAt(tree.instanceIndex, _zeroMatrix);
      tree.mesh.instanceMatrix.needsUpdate = true;
      tree.mesh.computeBoundingSphere?.();
    }
    this._felled.push(tree);
  }

  _restore(tree) {
    tree.felled = false;
    tree.hp = tree.maxHp;
    tree.wood = tree.totalWood;
    tree.magic = tree.totalMagic;
    tree._accWood = 0;
    tree._accMagic = 0;
    if (tree.mesh && tree.instanceIndex >= 0) {
      const def = SHAPE_DEFS[tree.shape] || SHAPE_DEFS.round;
      const geoScale = tree.scale * 1.5;
      this._p.set(tree.x, tree.y + 3.2 * tree.scale + def.lift * geoScale, tree.z);
      this._e.set(0, tree.rotation, 0);
      this._q.setFromEuler(this._e);
      this._s.set(def.s[0] * geoScale, def.s[1] * geoScale, def.s[2] * geoScale);
      this._m.compose(this._p, this._q, this._s);
      tree.mesh.setMatrixAt(tree.instanceIndex, this._m);
      tree.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  _qkey(x, z) {
    return Math.floor((x + MAP.half) / QUERY_CELL) * QUERY_DIM + Math.floor((z + MAP.half) / QUERY_CELL);
  }

  _indexTree(tree) {
    if (!tree || !Number.isFinite(tree.x) || !Number.isFinite(tree.z)) return;
    const key = this._qkey(tree.x, tree.z);
    const list = this._qgrid.get(key);
    if (list) list.push(tree);
    else this._qgrid.set(key, [tree]);
  }

  nearest(position, radius) {
    if (!position || !(radius > 0)) return null;
    let best = null;
    let bestD2 = radius * radius;
    const consider = (t) => {
      if (!t || t.felled) return;
      const dx = t.x - position.x;
      const dz = t.z - position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = t;
      }
    };
    if (this._qgrid.size === 0) {
      for (let i = 0; i < this.trees.length; i++) consider(this.trees[i]);
      return best;
    }
    const span = Math.max(0, Math.ceil(radius / QUERY_CELL));
    const cx = Math.floor((position.x + MAP.half) / QUERY_CELL);
    const cz = Math.floor((position.z + MAP.half) / QUERY_CELL);
    for (let ox = -span; ox <= span; ox++) {
      for (let oz = -span; oz <= span; oz++) {
        const list = this._qgrid.get((cx + ox) * QUERY_DIM + (cz + oz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) consider(list[i]);
      }
    }
    return best;
  }

  // optional respawn after RESPAWN_DELAY seconds
  update(dt) {
    const step = typeof dt === 'number' && isFinite(dt) ? dt : 0;
    this._time += step;
    if (!this._felled.length) return;
    for (let i = this._felled.length - 1; i >= 0; i--) {
      const tree = this._felled[i];
      if (this._time >= tree.respawnAt) {
        this._restore(tree);
        this._felled.splice(i, 1);
      }
    }
  }

  dispose() {
    this._disposed = true;
    if (this.group.parent) this.group.parent.remove(this.group);
    for (const mesh of this._meshes) mesh.dispose?.();
    for (const geo of this._geos ?? []) geo.dispose();
    for (const mat of this._materials) mat.dispose();
    this._meshes.length = 0;
    this._materials.length = 0;
    this._felled.length = 0;
    this.trees.length = 0;
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }
}

// fast id -> type lookup (built once at module load, no THREE needed)
const TREE_TYPES_BY_ID = {};
for (const t of TREE_TYPES) TREE_TYPES_BY_ID[t.id] = t;

export default TreeField;

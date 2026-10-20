// Minerals: one InstancedMesh per mineral type (27), weighted by tier + terrain bonus.
// 히든 지역 전용 광물(벚꽃 결정 · 꿈의 꽃잎 · 시간의 파편 · 멈춘 시간)은 그 지역에서만 나온다.
import * as THREE from 'three';
import { MAP, MINERAL_TYPES } from '../data.js';
import { REGIONS, HIDDEN_REGIONS, REGION_SPAWN, RING_MINERAL_WEIGHT, hiddenMineralIds, randomPointIn, ringQuotas } from './regions.js';

const KEEP_OUT_RADIUS = 60;
const MAX_SLOPE = 0.75;
const MIN_SPACING = 5;
const GRID_CELL = MIN_SPACING;
const GRID_DIM = Math.ceil(MAP.size / GRID_CELL) + 4;
const RESPAWN_DELAY = 120;
const MAX_MINERALS = 400;
// 질의용 공간 해시 — nearest() 가 광물 400개를 매번 훑지 않게 한다(프리즈·스터터 방지)
const QUERY_CELL = 16;
const QUERY_DIM = Math.ceil(MAP.size / QUERY_CELL) + 4;
// 렌더 청크 크기(m) — 이 단위로 InstancedMesh 를 나눠 거리 컬링한다
const CHUNK_SIZE = 340;
// 청크 컬링 여유(m) — 청크 경계에서 나무가 갑자기 사라지지 않게
const CULL_MARGIN = 150;
// id -> 종류 조회(모듈 로드 시 1회)
const MINERAL_TYPE_BY_ID = Object.fromEntries(MINERAL_TYPES.map((m) => [m.id, m]));

// ── 결정 디자인 도구(H-89) — 바닥은 넓고 위로 뾰족한 다면 결정에 명암을 심는다.
function _mHash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function _mNoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => _mHash3(xi + i, yi + j, zi + k);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v),
    w
  );
}

/** 결정 조각 — 면이 살짝 어긋나고 아래는 어둡게·끝은 밝게. */
function crystalGeometry(geo, seed, amp) {
  const pos = geo.attributes.position;
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
    const noise = _mNoise(x * 3.1 + seed, y * 3.1 + seed, z * 3.1 + seed * 0.7);
    const r = 1 + (noise - 0.5) * 2 * amp;
    pos.setXYZ(i, x * r, y, z * r);
    const t = (y - minY) / span;
    const shade = 0.5 + 0.62 * t + (noise - 0.5) * 0.1;
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export class MineralField {
  constructor({ rng, terrain, preset = null } = {}) {
    this.rng = rng;
    this.terrain = terrain;
    this.preset = preset;
    this.minerals = [];
    this._qgrid = new Map();
    this.group = new THREE.Group();
    this.group.name = 'minerals';
    this.group.matrixAutoUpdate = false;
    this.group.updateMatrix();
    this.respawnDelay = RESPAWN_DELAY;
    this._time = 0;
    this._meshes = [];
    this._materials = [];
    this._mats = [];
    this._pending = []; // depleted, waiting to respawn
    this._animating = []; // visually growing / shrinking
    this._disposed = false;

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();

    // tier-weighted pool, multiplied by the terrain's mineralBonus[tier]
    // 히든 지역 전용 광물은 전역 풀에서 빠진다(그 지역에서만 스폰).
    const bonus = terrain?.type?.mineralBonus ?? terrain?.mineralBonus ?? {};
    this._bonus = bonus;
    const exclusive = new Set(hiddenMineralIds());
    this._pool = MINERAL_TYPES.filter((m) => !exclusive.has(m.id)).map((m) => ({
      type: m,
      w: Math.max(0.001, (m.weight ?? 1) * (bonus[m.tier] ?? 1))
    }));

    // 결정 조각(H-89) — 낮은 티어는 뭉툭한 기둥, 높은 티어는 뾰족한 쐐기.
    this._geoLow = crystalGeometry(new THREE.CylinderGeometry(0.5, 0.78, 1.5, 6, 2), 4.2, 0.13); // tier 1-2
    this._geoHigh = crystalGeometry(new THREE.ConeGeometry(0.68, 1.9, 7, 3), 8.7, 0.16); // tier 3-5
  }

  get count() {
    return this.minerals.length;
  }

  get activeCount() {
    let n = 0;
    for (const m of this.minerals) if (!m.depleted) n++;
    return n;
  }

  // 띠 지역(T1~T7) → 히든 지역. 광물도 자기 티어 지역에서만 나온다.
  build() {
    if (this._disposed) return this.group;
    const count = Math.min(MAX_MINERALS, Math.max(0, Math.round(this.preset?.mineralCount ?? 200)));
    this._scatter(count);
    this._buildInstances();
    return this.group;
  }

  // ── 지역별 배치: 띠 지역(T1~T7) → 히든 지역 ──
  _scatter(count) {
    const state = {
      half: MAP.half - 30,
      keep2: KEEP_OUT_RADIUS * KEEP_OUT_RADIUS,
      spacing2: MIN_SPACING * MIN_SPACING,
      buckets: new Map()
    };
    const pools = this._regionPools();

    for (const { region, quota } of ringQuotas(count, RING_MINERAL_WEIGHT)) {
      this._placeInRegion(state, region, pools.get(region.id), quota);
    }
    for (const hidden of HIDDEN_REGIONS) {
      this._placeInRegion(state, hidden, pools.get(hidden.id), REGION_SPAWN.hiddenMinerals);
    }
  }

  /** 지역 id → 그 지역에서 나오는 광물 풀(tier 가중치 + 지형 보너스) */
  _regionPools() {
    const exclusive = new Set(hiddenMineralIds());
    const bonus = this._bonus || {};
    const weighted = (list) => list.map((m) => ({
      type: m,
      w: Math.max(0.001, (m.weight ?? 1) * (bonus[m.tier] ?? 1))
    }));
    const pools = new Map();
    for (const region of REGIONS) {
      if (region.id === 'safe' || region.id === 'outer') continue;
      const tiers = region.mineralTiers || [];
      pools.set(region.id, weighted(MINERAL_TYPES.filter((m) => !exclusive.has(m.id) && tiers.includes(m.tier))));
    }
    for (const hidden of HIDDEN_REGIONS) {
      pools.set(hidden.id, weighted(MINERAL_TYPES.filter((m) => hidden.mineralIds.includes(m.id))));
    }
    return pools;
  }

  /** 한 지역 안에 quota 개를 심는다(경사·간격 규칙 유지) */
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

      const entry = rng.weightedPick(pool, (e) => e.w);
      const type = entry ? entry.type : rng.pick(MINERAL_TYPES);
      const mineral = this._makeMineral(this.minerals.length, type, x, z, rng);
      this.minerals.push(mineral);
      this._indexMineral(mineral);

      const key = gx * GRID_DIM + gz;
      const list = state.buckets.get(key);
      if (list) list.push(mineral);
      else state.buckets.set(key, [mineral]);
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

  _makeMineral(id, type, x, z, rng) {
    const scale = type.radius ?? 0.9 + type.tier * 0.22;
    const mineral = {
      id,
      typeId: type.id,
      name: type.name,
      tier: type.tier,
      rarity: type.rarity,
      value: type.value,
      x,
      z,
      y: 0,
      baseScale: scale,
      rotY: rng.range(0, Math.PI * 2),
      rotX: rng.range(-0.35, 0.35),
      hp: type.hp,
      maxHp: type.hp,
      radius: scale * 1.15,
      totalYield: type.yield ?? type.tier,
      depleted: false,
      respawnAt: 0,
      mesh: null,
      instanceIndex: -1,
      _scale: 1,
      _target: 1,
      _acc: 0,
      harvest: (amount) => this.harvest(mineral, amount)
    };
    return mineral;
  }

  /* ── 청크(렌더 단위) ────────────────────────────────────────────────
     광물도 (종류 × 청크)로 나눠 담고 먼 청크는 통째로 숨긴다.
     재질은 종류별로 공유하므로 셰이더/발광 애니메이션 비용은 그대로다. */
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
      for (const m of list) {
        sx += m.x;
        sz += m.z;
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

  /* ── 청크(렌더 단위) ────────────────────────────────────────────────
     광물도 청크로 나눠 담고 먼 청크는 통째로 숨긴다.
     한 청크 = 지오메트리 2종(저티어/고티어) → 최대 2메시.
     종류별 색은 인스턴스 색(instanceColor)으로 유지한다(재질 공유 = 셰이더 절약). */
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
      for (const m of list) {
        sx += m.x;
        sz += m.z;
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

  _buildInstances() {
    // (청크) · (청크 × 지오메트리) 로 묶는다
    const byChunk = new Map();
    const groups = new Map();
    for (const mineral of this.minerals) {
      const key = this._chunkOf(mineral.x, mineral.z);
      let list = byChunk.get(key);
      if (!list) {
        list = [];
        byChunk.set(key, list);
      }
      list.push(mineral);
      const bucket = (MINERAL_TYPE_BY_ID[mineral.typeId]?.tier ?? 1) <= 2 ? 'low' : 'high';
      const gkey = bucket + '|' + key;
      let group = groups.get(gkey);
      if (!group) {
        group = [];
        groups.set(gkey, group);
      }
      group.push(mineral);
    }
    this._chunksFrom(byChunk);

    // 지면 높이를 먼저 확정한다
    for (const mineral of this.minerals) {
      mineral.y = typeof this.terrain.surfaceHeight === 'function'
        ? this.terrain.surfaceHeight(mineral.x, mineral.z)
        : this.terrain.getHeight(mineral.x, mineral.z);
    }

    // 재질 2종(저티어/고티어)만 만들어 모든 청크가 공유한다
    const matLow = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x2b3a5c,
      emissiveIntensity: 0.5,
      roughness: 0.42,
      metalness: 0.4,
      flatShading: true
    });
    const matHigh = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x6a4a8c,
      emissiveIntensity: 0.6,
      roughness: 0.3,
      metalness: 0.5,
      flatShading: true
    });
    matLow.userData.phase = 0;
    matHigh.userData.phase = Math.PI * 0.6;
    // 정점 색(아래 어둡게 → 끝 밝게)을 쓴다(H-89).
    matLow.vertexColors = true;
    matHigh.vertexColors = true;
    this._materials.push(matLow, matHigh);
    this._mats.push(matLow, matHigh);

    const color = new THREE.Color();
    for (const [gkey, list] of groups) {
      const sep = gkey.indexOf('|');
      const bucket = gkey.slice(0, sep);
      const chunkId = gkey.slice(sep + 1);
      const entry = this._chunkMap.get(chunkId);
      const geo = bucket === 'low' ? this._geoLow : this._geoHigh;
      const mat = bucket === 'low' ? matLow : matHigh;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = 'mineral.' + bucket + '.' + chunkId;
      mesh.castShadow = !!this.preset?.shadow;
      mesh.receiveShadow = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // depleted slots animate
      this.group.add(mesh);
      this._meshes.push(mesh);
      if (entry) {
        entry.meshes.push(mesh);
        mesh.visible = entry.on !== false;
      }

      for (let i = 0; i < list.length; i++) {
        const mineral = list[i];
        mineral.mesh = mesh;
        mineral.instanceIndex = i;
        this._writeMatrix(mineral, 1);
        color.setHex(MINERAL_TYPE_BY_ID[mineral.typeId]?.color ?? 0xffffff);
        mesh.setColorAt(i, color);
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

  // per-instance matrix; visualScale 0 hides a depleted deposit
  _writeMatrix(mineral, visualScale) {
    const s = mineral.baseScale * Math.max(0, visualScale);
    this._p.set(mineral.x, mineral.y + s * 0.75, mineral.z);
    this._e.set(mineral.rotX, mineral.rotY, 0);
    this._q.setFromEuler(this._e);
    this._s.set(s, s, s);
    this._m.compose(this._p, this._q, this._s);
    mineral.mesh.setMatrixAt(mineral.instanceIndex, this._m);
  }

  // ── gameplay ──
  harvest(mineral, amount) {
    if (!mineral || mineral.depleted) {
      return { amount: 0, mineralId: mineral ? mineral.typeId : null, depleted: !!mineral?.depleted };
    }
    const dmg = Math.max(0, amount);
    mineral.hp = mineral.hp - dmg;
    const frac = mineral.maxHp > 0 ? Math.min(1, dmg / mineral.maxHp) : 1;
    mineral._acc += mineral.totalYield * frac;
    let gained = Math.floor(mineral._acc + 1e-9);
    mineral._acc -= gained;

    let depleted = false;
    if (mineral.hp <= 0) {
      mineral.hp = 0;
      depleted = true;
      gained += Math.round(mineral._acc);
      mineral._acc = 0;
      this._deplete(mineral);
    }
    return { amount: gained, mineralId: mineral.typeId, depleted };
  }

  _deplete(mineral) {
    mineral.depleted = true;
    mineral.respawnAt = this._time + this.respawnDelay;
    mineral._target = 0;
    if (!this._animating.includes(mineral)) this._animating.push(mineral);
    this._pending.push(mineral);
  }

  /** 질의용 공간 해시 키 */
  _qkey(x, z) {
    return Math.floor((x + MAP.half) / QUERY_CELL) * QUERY_DIM + Math.floor((z + MAP.half) / QUERY_CELL);
  }

  _indexMineral(mineral) {
    if (!mineral || !Number.isFinite(mineral.x) || !Number.isFinite(mineral.z)) return;
    const key = this._qkey(mineral.x, mineral.z);
    const list = this._qgrid.get(key);
    if (list) list.push(mineral);
    else this._qgrid.set(key, [mineral]);
  }

  nearest(position, radius) {
    if (!position || !(radius > 0)) return null;
    let best = null;
    let bestD2 = radius * radius;
    const consider = (m) => {
      if (!m || m.depleted) return;
      const dx = m.x - position.x;
      const dz = m.z - position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = m;
      }
    };
    // 색인이 비어 있으면(직접 주입·복원 등) 예전처럼 전체를 훑는다.
    if (this._qgrid.size === 0) {
      for (let i = 0; i < this.minerals.length; i++) consider(this.minerals[i]);
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

  update(dt) {
    const step = typeof dt === 'number' && isFinite(dt) ? dt : 0;
    this._time += step;

    // respawn queue
    for (let i = this._pending.length - 1; i >= 0; i--) {
      const m = this._pending[i];
      if (this._time >= m.respawnAt) {
        m.depleted = false;
        m.hp = m.maxHp;
        m._acc = 0;
        m._target = 1;
        if (!this._animating.includes(m)) this._animating.push(m);
        this._pending.splice(i, 1);
      }
    }

    // shrink / grow animation (only for touched deposits)
    if (this._animating.length) {
      for (const mesh of this._meshes) mesh.userData.dirty = false;
      for (let i = this._animating.length - 1; i >= 0; i--) {
        const m = this._animating[i];
        const speed = m._target > m._scale ? 2.2 : 3.2;
        const diff = m._target - m._scale;
        if (Math.abs(diff) < 0.01) {
          m._scale = m._target;
          this._writeMatrix(m, m._scale);
          this._animating.splice(i, 1);
        } else {
          m._scale += Math.sign(diff) * speed * step;
          if ((m._target - m._scale) * Math.sign(diff) < 0) m._scale = m._target;
          this._writeMatrix(m, m._scale);
        }
        if (m.mesh) m.mesh.userData.dirty = true;
      }
      for (const mesh of this._meshes) {
        if (mesh.userData.dirty) mesh.instanceMatrix.needsUpdate = true;
      }
    }

    // subtle emissive pulse (23 materials, negligible cost)
    for (let i = 0; i < this._mats.length; i++) {
      const mat = this._mats[i];
      mat.emissiveIntensity = 0.5 + 0.22 * Math.sin(this._time * 1.8 + mat.userData.phase);
    }
  }

  dispose() {
    this._disposed = true;
    if (this.group.parent) this.group.parent.remove(this.group);
    for (const mesh of this._meshes) {
      mesh.dispose?.();
    }
    for (const mat of this._materials) mat.dispose();
    this._geoLow.dispose();
    this._geoHigh.dispose();
    this._meshes.length = 0;
    this._materials.length = 0;
    this._mats.length = 0;
    this._pending.length = 0;
    this._animating.length = 0;
    this.minerals.length = 0;
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }
}

export default MineralField;

// 소환문(Portal) — 몬스터가 튀어나오는 3D 차원문.
//
// 정적인 석조 부품(기둥·받침·머리돌·상인방·쐐기돌·테두리·오벨리스크·화로)은
// 문 하나당 지오메트리 1장으로 병합해 두고(draw call 최소화), 소용돌이·룬·불꽃처럼
// 움직이는 부품만 따로 둔다. 문 하나의 구성:
//
//   석조 아치(merged) · 발광 장식(merged) · 소용돌이 판 · 소용돌이 고리 · 광륜
//   바닥 룬 2겹 · 바닥 광원 · 화로 불꽃 · 쐐기돌(회전) · 어두운 배경막
//
// 몬스터는 문 바깥(+local -Z)에서 나타나 아치를 통과해 기지로 걸어간다.
// spawnPoint() 는 그 지점을, flashNearest() 는 문이 번쩍이는 연출을 담당한다.
import * as THREE from 'three';
import { MAP, SPAWN_PATTERNS } from '../data.js';

const MAX_PORTALS = 8;
const MIN_RADIUS = 90;
const MAX_RADIUS = 190;

// 아치 치수(문 로컬 좌표, +Z 가 기지 쪽)
const ARCH = {
  halfSpan: 2.95, // 기둥 중심 x
  pillarHeight: 6.4,
  pillarTop: 7.45,
  lintelY: 8.66,
  openingY: 4.62, // 문 안쪽 중심 높이
  openingSquash: 1.5, // 세로로 늘린 타원(문 모양)
  spawnRadius: 3.4, // 몬스터가 나타나는 거리(문 바깥쪽)
  glowPool: 9.0 // 바닥 광원 반지름
};

// per-pattern look + how many portals the pattern actually uses
const PATTERN_STYLE = {
  radial: { color: 0xff7a2a, count: 6, glow: 1.0 },
  cluster: { color: 0x8f6bff, count: 2, glow: 1.25 },
  opposite: { color: 0x2ad6ff, count: 2, glow: 1.1 },
  scattered: { color: 0x6bf0a8, count: 5, glow: 0.95 },
  ring: { color: 0xffd24a, count: MAX_PORTALS, glow: 1.15 }
};

// 패턴별로 문 앞에서 얼마나 흩어져 나타나는지(작으면 문에서 바로 나온다)
const SPAWN_SPREAD = { radial: 2.4, cluster: 1.8, opposite: 2.8, scattered: 22, ring: 0 };

function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// 표면 높이(렌더된 지형 메시와 일치) — 포탈이 공중에 뜨지 않게 한다.
function groundAt(terrain, x, z) {
  return typeof terrain.surfaceHeight === 'function' ? terrain.surfaceHeight(x, z) : terrain.getHeight(x, z);
}

// 부품 배치용 변환 행렬.
function place(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );
  return { geo, matrix };
}

// 정적 부품 병합: position/normal(+uv) 만 이어 붙인다. 색은 머티리얼 하나로.
export function mergeParts(parts) {
  const list = [];
  let count = 0;
  let hasUv = true;
  for (const item of parts) {
    if (!item?.geo) continue;
    const source = item.geo.index ? item.geo.toNonIndexed() : item.geo.clone();
    if (item.matrix) source.applyMatrix4(item.matrix);
    if (!source.attributes?.position || !source.attributes?.normal) {
      source.dispose();
      continue;
    }
    if (!source.attributes.uv) hasUv = false;
    count += source.attributes.position.count;
    list.push(source);
  }
  if (!list.length) return null;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = hasUv ? new Float32Array(count * 2) : null;
  let o = 0;
  let ou = 0;
  for (const geo of list) {
    position.set(geo.attributes.position.array, o);
    normal.set(geo.attributes.normal.array, o);
    if (uv) {
      uv.set(geo.attributes.uv.array, ou);
      ou += geo.attributes.uv.array.length;
    }
    o += geo.attributes.position.array.length;
    geo.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (uv) merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export class PortalField {
  constructor({ rng, terrain = null, preset = null } = {}) {
    this.rng = rng;
    this.terrain = terrain;
    this.preset = preset;
    this.portals = [];
    this.activePortals = [];
    this.group = new THREE.Group();
    this.group.name = 'portals';
    this.group.matrixAutoUpdate = false;
    this.group.updateMatrix();
    this.pattern = null;
    this.patternDef = null;
    this.patterns = SPAWN_PATTERNS;
    this.time = 0;

    this._geos = [];
    this._mats = [];
    this._scratch = [];
    this._color = new THREE.Color();
    this._layouts = {};
    this._disposed = false;

    this._buildLayouts();
    this._buildPortals();
    this.setPattern(SPAWN_PATTERNS[0].id);
  }

  // polar slot per pattern, one row per portal index
  _buildLayouts() {
    const rng = this.rng;
    const baseAngle = rng ? rng.range(0, Math.PI * 2) : 0.6;
    for (const pattern of SPAWN_PATTERNS) {
      const style = PATTERN_STYLE[pattern.id] || PATTERN_STYLE.radial;
      const row = [];
      for (let i = 0; i < MAX_PORTALS; i++) {
        let angle = 0;
        let radius = 140;
        if (pattern.id === 'radial') {
          angle = baseAngle + (i / MAX_PORTALS) * Math.PI * 2;
          radius = (rng ? rng.range(110, 175) : 140);
        } else if (pattern.id === 'cluster') {
          angle = baseAngle + (rng ? rng.range(-0.3, 0.3) : 0);
          radius = (rng ? rng.range(120, 185) : 150);
        } else if (pattern.id === 'opposite') {
          angle = baseAngle + (i % 2 ? Math.PI : 0) + (rng ? rng.range(-0.12, 0.12) : 0);
          radius = (rng ? rng.range(145, 190) : 170);
        } else if (pattern.id === 'scattered') {
          angle = rng ? rng.range(0, Math.PI * 2) : i * 1.1;
          radius = rng ? rng.range(MIN_RADIUS, MAX_RADIUS) : 150;
        } else {
          // ring: same distance for everyone
          angle = baseAngle + (i / MAX_PORTALS) * Math.PI * 2;
          radius = (rng ? rng.range(145, 155) : 150);
        }
        row.push({
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          // gates face the base at the map centre
          yaw: Math.atan2(-Math.cos(angle), -Math.sin(angle)),
          active: i < style.count
        });
      }
      this._layouts[pattern.id] = row;
    }
  }

  _buildPortals() {
    const geos = this._geos;
    const g = {
      base: new THREE.BoxGeometry(1.9, 0.5, 1.9),
      plinth: new THREE.CylinderGeometry(1.0, 1.16, 0.55, 6),
      shaft: new THREE.CylinderGeometry(0.62, 0.9, ARCH.pillarHeight, 6),
      capital: new THREE.BoxGeometry(1.9, 0.75, 1.9),
      band: new THREE.CylinderGeometry(0.92, 0.92, 0.24, 6),
      lintel: new THREE.BoxGeometry(7.9, 0.95, 1.6),
      spike: new THREE.ConeGeometry(0.24, 1.2, 4),
      spikeTall: new THREE.ConeGeometry(0.32, 1.7, 4),
      rim: new THREE.TorusGeometry(6.7, 0.18, 4, 20),
      obelisk: new THREE.BoxGeometry(0.62, 1.5, 0.62),
      cap: new THREE.BoxGeometry(0.34, 0.18, 0.34),
      post: new THREE.CylinderGeometry(0.18, 0.24, 1.4, 6),
      bowl: new THREE.CylinderGeometry(0.4, 0.22, 0.42, 6),
      flame: new THREE.ConeGeometry(0.34, 1.2, 5),
      halo: new THREE.TorusGeometry(2.32, 0.12, 6, 28),
      rune: new THREE.RingGeometry(2.7, 4.1, 6),
      runeInner: new THREE.RingGeometry(1.15, 1.75, 6),
      disc: new THREE.CircleGeometry(1, 36),
      keystone: new THREE.OctahedronGeometry(0.85, 0),
      blade: new THREE.BoxGeometry(1.75, 0.16, 0.07),
      innerRing: new THREE.TorusGeometry(1.6, 0.05, 4, 24),
      innerRing2: new THREE.TorusGeometry(0.95, 0.04, 4, 20)
    };
    for (const geo of Object.values(g)) geos.push(geo);
    g.rune.rotateX(-Math.PI / 2);
    g.runeInner.rotateX(-Math.PI / 2);
    g.rim.rotateX(-Math.PI / 2);

    // ── 정적 석조 + 발광 장식(문마다 공유하는 지오메트리 2장) ──────────────
    const stoneParts = [];
    const trimParts = [];
    for (const side of [-1, 1]) {
      const px = side * ARCH.halfSpan;
      stoneParts.push(place(g.base, { x: px, y: 0.25 }));
      stoneParts.push(place(g.plinth, { x: px, y: 0.77 }));
      stoneParts.push(place(g.shaft, { x: px, y: 1.05 + ARCH.pillarHeight / 2 }));
      stoneParts.push(place(g.capital, { x: px, y: ARCH.pillarTop + 0.375 }));
      for (const by of [2.55, 6.35]) {
        stoneParts.push(place(g.band, { x: px, y: by }));
        trimParts.push(place(g.band, { x: px, y: by, sx: 1.05, sy: 0.55, sz: 1.05 }));
      }
      // 기둥 안쪽을 따라 흐르는 발광 홈
      trimParts.push(place(g.obelisk, { x: px - side * 0.46, y: 4.3, sx: 0.22, sy: 5.4, sz: 0.22 }));
      // 화로(기둥 앞)
      stoneParts.push(place(g.post, { x: px + side * 1.05, y: 0.7, z: 1.75 }));
      stoneParts.push(place(g.bowl, { x: px + side * 1.05, y: 1.62, z: 1.75 }));
    }
    stoneParts.push(place(g.lintel, { y: ARCH.lintelY }));
    trimParts.push(place(g.lintel, { y: ARCH.lintelY, z: 1.03, sx: 0.86, sy: 0.22, sz: 0.1 }));
    stoneParts.push(place(g.spike, { x: -2.25, y: 9.6 }));
    stoneParts.push(place(g.spike, { x: 2.25, y: 9.6 }));
    stoneParts.push(place(g.spikeTall, { y: 9.9 }));
    stoneParts.push(place(g.rim, { y: 0.09 }));
    stoneParts.push(place(g.rim, { y: 0.24, sx: 0.9, sz: 0.9 }));
    for (const [ox, oz] of [
      [4.2, 4.2],
      [-4.2, 4.2],
      [4.2, -4.2],
      [-4.2, -4.2]
    ]) {
      stoneParts.push(place(g.obelisk, { x: ox, y: 0.75, z: oz }));
      trimParts.push(place(g.cap, { x: ox, y: 1.58, z: oz }));
    }

    // ── 소용돌이(문 안쪽에서 도는 날개 6장) ────────────────────────────────
    const swirlParts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      swirlParts.push(place(g.blade, { x: Math.cos(a) * 1.25, y: Math.sin(a) * 1.25, rz: a + 0.42 }));
    }

    // ── 화로 불꽃(두 개를 한 장으로) ──────────────────────────────────────
    const flameParts = [
      place(g.flame, { x: -4.0, y: 2.35, z: 1.75 }),
      place(g.flame, { x: 4.0, y: 2.35, z: 1.75 })
    ];

    const stoneGeo = mergeParts(stoneParts);
    const trimGeo = mergeParts(trimParts);
    const swirlGeo = mergeParts(swirlParts);
    const flameGeo = mergeParts(flameParts);
    const coreGeo = mergeParts([
      place(g.disc, { z: 0.04, sx: 0.86, sy: 0.86 }),
      place(g.innerRing, { z: 0.06 }),
      place(g.innerRing2, { z: 0.08 })
    ]);
    if (stoneGeo) geos.push(stoneGeo);
    if (trimGeo) geos.push(trimGeo);
    if (swirlGeo) geos.push(swirlGeo);
    if (flameGeo) geos.push(flameGeo);
    if (coreGeo) geos.push(coreGeo);

    // ── 공용 머티리얼(석조/배경) ──────────────────────────────────────────
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x4d5260,
      roughness: 0.95,
      metalness: 0.06,
      flatShading: true
    });
    const backMat = new THREE.MeshBasicMaterial({
      color: 0x080a12,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this._mats.push(stoneMat, backMat);

    for (let i = 0; i < MAX_PORTALS; i++) {
      const solidMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 1.1,
        roughness: 0.35,
        metalness: 0.2,
        flatShading: true
      });
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      const trimMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });
      this._mats.push(solidMat, glowMat, trimMat);

      const holder = new THREE.Group();
      holder.name = `portal.${i}`;
      holder.matrixAutoUpdate = false;

      // 문 뒤를 막는 어두운 막(안쪽으로 뚫린 느낌)
      const vortexBack = new THREE.Mesh(g.disc, backMat);
      vortexBack.name = 'vortexBack';
      vortexBack.position.set(0, ARCH.openingY, -0.42);
      vortexBack.scale.set(2.3, ARCH.openingY * 0.94, 1);

      const vortex = new THREE.Mesh(swirlGeo, glowMat);
      vortex.name = 'vortex';
      vortex.position.set(0, ARCH.openingY, -0.12);
      vortex.scale.set(1, ARCH.openingSquash, 1);

      const vortexCore = new THREE.Mesh(coreGeo, glowMat);
      vortexCore.name = 'vortexCore';
      vortexCore.position.set(0, ARCH.openingY, -0.04);
      vortexCore.scale.set(1, ARCH.openingSquash, 1);

      const halo = new THREE.Mesh(g.halo, glowMat);
      halo.name = 'halo';
      halo.position.set(0, ARCH.openingY, -0.06);
      halo.scale.set(1, ARCH.openingSquash, 1);

      const stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.name = 'arch';

      const trim = new THREE.Mesh(trimGeo, trimMat);
      trim.name = 'trim';

      const rune = new THREE.Mesh(g.rune, glowMat);
      rune.name = 'rune';
      rune.position.y = 0.07;

      const runeInner = new THREE.Mesh(g.runeInner, glowMat);
      runeInner.name = 'runeInner';
      runeInner.position.y = 0.05;

      const groundGlow = new THREE.Mesh(g.disc, trimMat);
      groundGlow.name = 'groundGlow';
      groundGlow.rotation.x = -Math.PI / 2;
      groundGlow.position.y = 0.04;
      groundGlow.scale.setScalar(ARCH.glowPool);

      const flames = new THREE.Mesh(flameGeo, glowMat);
      flames.name = 'flames';

      const orb = new THREE.Mesh(g.keystone, solidMat);
      orb.name = 'keystone';
      orb.position.set(0, ARCH.lintelY + 0.85, 0);
      const orbY = ARCH.lintelY + 0.85;

      holder.add(vortexBack, vortex, vortexCore, halo, stone, trim, rune, runeInner, groundGlow, flames, orb);
      this.group.add(holder);

      const portal = {
        id: i,
        pattern: this.pattern,
        x: 0,
        z: 0,
        y: 0,
        active: false,
        radius: ARCH.spawnRadius,
        mesh: holder,
        stone,
        trim,
        vortex,
        vortexCore,
        halo,
        flames,
        groundGlow,
        vortexBack,
        gate: halo, // 예전 이름 호환
        rune,
        runeInner,
        orb,
        orbY,
        _flash: 0,
        _solidMat: solidMat,
        _glowMat: glowMat,
        _trimMat: trimMat,
        spawnPoint: (vec) => {
          const out = vec || new THREE.Vector3();
          const len = Math.hypot(portal.x, portal.z) || 1;
          const ox = (portal.x / len) * portal.radius;
          const oz = (portal.z / len) * portal.radius;
          const x = portal.x + ox;
          const z = portal.z + oz;
          return out.set(x, this.terrain ? groundAt(this.terrain, x, z) : portal.y, z);
        }
      };
      this.portals.push(portal);
    }
  }

  setPattern(patternId) {
    const id = patternId && typeof patternId === 'object' ? patternId.id : patternId;
    const pattern = SPAWN_PATTERNS.find((p) => p.id === id) || SPAWN_PATTERNS[0];
    const style = PATTERN_STYLE[pattern.id] || PATTERN_STYLE.radial;
    const row = this._layouts[pattern.id] || [];
    const color = this._color.setHex(style.color);

    this.pattern = pattern.id;
    this.patternDef = pattern;
    this.activePortals.length = 0;

    for (let i = 0; i < this.portals.length; i++) {
      const portal = this.portals[i];
      const slot = row[i] || { x: 0, z: 0, yaw: 0, active: false };
      portal.pattern = pattern.id;
      portal.active = !!slot.active;
      portal.x = slot.x;
      portal.z = slot.z;
      portal.y = this.terrain ? groundAt(this.terrain, slot.x, slot.z) : 0;
      portal.mesh.position.set(portal.x, portal.y, portal.z);
      portal.mesh.rotation.y = slot.yaw;
      portal.mesh.visible = portal.active;
      portal.mesh.updateMatrix();
      portal._solidMat.color.copy(color);
      portal._solidMat.emissive.copy(color);
      portal._solidMat.emissiveIntensity = style.glow;
      portal._glowMat.color.copy(color);
      portal._trimMat.color.copy(color);
      portal._flash = 0;
      if (portal.active) this.activePortals.push(portal);
    }
    return this.pattern;
  }

  // 몬스터가 문을 통과할 때 문이 번쩍이게 한다(가장 가까운 문).
  flashNearest(x = 0, z = 0, strength = 1) {
    let best = null;
    let bestDist = Infinity;
    for (const portal of this.activePortals) {
      const dx = portal.x - num(x);
      const dz = portal.z - num(z);
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = portal;
      }
    }
    if (!best) return null;
    best._flash = Math.min(1.6, best._flash + Math.max(0.1, num(strength, 1)));
    return best;
  }

  update(dt) {
    const step = typeof dt === 'number' && isFinite(dt) ? dt : 0;
    this.time += step;
    for (let i = 0; i < this.portals.length; i++) {
      const portal = this.portals[i];
      if (!portal.active) continue;
      const id = portal.id;
      const phase = this.time * 2.1 + id * 0.9;
      const pulse = 0.5 + 0.5 * Math.sin(phase);

      // 소용돌이: 바깥 날개와 안쪽 고리가 반대로 돈다
      portal.vortex.rotation.z += step * 0.85;
      portal.vortexCore.rotation.z -= step * 1.35;
      portal.halo.rotation.z += step * 0.35;
      portal.rune.rotation.y += step * 0.9;
      portal.runeInner.rotation.y -= step * 1.4;

      // 쐐기돌(문 위 보석): 회전 + 부유
      portal.orb.rotation.y -= step * 1.4;
      portal.orb.rotation.x += step * 0.6;
      portal.orb.position.y = portal.orbY + Math.sin(this.time * 1.5 + id) * 0.28;
      portal.orb.scale.setScalar(1 + 0.12 * Math.sin(phase * 1.4));

      // 화로 불꽃 흔들림
      const flicker = 0.84 + 0.3 * Math.sin(this.time * 9 + id * 2.3) * Math.sin(this.time * 5.3 + id);
      portal.flames.scale.set(1 + 0.12 * (flicker - 1), flicker, 1 + 0.12 * (flicker - 1));

      // 문이 열린 세기 — 몬스터가 나올 때 flash 가 차오르고 서서히 식는다
      portal._flash = Math.max(0, portal._flash - step * 1.6);
      const burst = portal._flash;
      portal._glowMat.opacity = Math.min(0.95, 0.34 + 0.2 * pulse + 0.5 * burst);
      portal._trimMat.opacity = Math.min(0.8, 0.18 + 0.1 * pulse + 0.42 * burst);
      portal._solidMat.emissiveIntensity = 0.9 + 0.5 * pulse + 2.2 * burst;
      portal.vortex.scale.set(1 + 0.06 * burst, ARCH.openingSquash + 0.06 * burst, 1);
      portal.groundGlow.scale.setScalar(ARCH.glowPool * (1 + 0.08 * pulse + 0.22 * burst));
    }
  }

  // jittered spawn position near the active portal(s) of a pattern
  spawnPoint(pattern, index = 0, wave = 1, rng = null) {
    const id = pattern && typeof pattern === 'object' ? pattern.id : pattern;
    // keep the visible gates in sync when a wave asks for another pattern
    if (id && id !== this.pattern && SPAWN_PATTERNS.some((p) => p.id === id)) this.setPattern(id);
    let eligible = this._scratch;
    if (id === this.pattern && this.activePortals.length) {
      eligible = this.activePortals;
    } else {
      eligible.length = 0;
      const row = this._layouts[id];
      if (row) {
        for (let i = 0; i < this.portals.length; i++) {
          if (row[i]?.active) eligible.push(this.portals[i]);
        }
      }
    }
    const anchor = eligible.length ? eligible[Math.abs(index) % eligible.length] : this.portals[0];
    // 문 바로 앞(바깥쪽)에서 나온다 — 흩어짐 패턴만 크게 퍼진다.
    const spread = num(SPAWN_SPREAD[id], 2.2);
    const roll = rng ? rng.next() : ((Math.abs(index) * 0.6180339887) % 1);
    const angle = (rng ? rng.range(0, Math.PI * 2) : Math.abs(index) * 1.7) + roll * 0.5;
    const dist = spread * (0.25 + 0.75 * roll);
    const len = Math.hypot(anchor.x, anchor.z) || 1;
    const outX = (anchor.x / len) * ARCH.spawnRadius;
    const outZ = (anchor.z / len) * ARCH.spawnRadius;

    let x = anchor.x + outX + Math.cos(angle) * dist;
    let z = anchor.z + outZ + Math.sin(angle) * dist;
    const lim = MAP.half - 40;
    if (x > lim) x = lim;
    else if (x < -lim) x = -lim;
    if (z > lim) z = lim;
    else if (z < -lim) z = -lim;

    const y = this.terrain ? groundAt(this.terrain, x, z) : 0;
    return new THREE.Vector3(x, y, z);
  }

  dispose() {
    this._disposed = true;
    if (this.group.parent) this.group.parent.remove(this.group);
    for (const geo of this._geos) geo.dispose();
    for (const mat of this._mats) mat.dispose();
    this._geos.length = 0;
    this._mats.length = 0;
    this.activePortals.length = 0;
    this.portals.length = 0;
    this._scratch.length = 0;
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }
}

export default PortalField;

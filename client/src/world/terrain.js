// Terrain: seeded deterministic value-noise fBm (pure math, matches mesh vertices exactly).
import * as THREE from 'three';
import { MAP, TERRAIN_TYPES } from '../data.js';

const K_PLAIN = 0;
const K_HILL = 1;
const K_MOUNTAIN = 2;
const K_VALLEY = 3;
const KIND_CODE = { plain: K_PLAIN, hill: K_HILL, mountain: K_MOUNTAIN, valley: K_VALLEY };

const WALL_THICKNESS = 46;
const PLATEAU_RADIUS = 92; // flat area around the base so towers can be placed
const PLATEAU_FALLOFF = 48;
const ROCK_HEX = 0x6f747c;
const GRASS_HEX = 0x86c355; // 잔디 하이라이트
const WHITE = new THREE.Color(0xffffff);

function deriveSeg(preset, explicit) {
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);
  if (!preset) return 112;
  const high = (preset.drawDistance ?? 0) >= 600 || (preset.treeCount ?? 0) >= 600;
  return high ? 176 : 112;
}

function resolveType(type, rng) {
  if (type && typeof type === 'object') return type;
  if (typeof type === 'string') {
    const found = TERRAIN_TYPES.find((t) => t.id === type);
    if (found) return found;
  }
  return rng ? rng.weightedPick(TERRAIN_TYPES) : TERRAIN_TYPES[0];
}

export class Terrain {
  constructor({ rng, type, preset = null, seg } = {}) {
    this.rng = rng || null;
    this.preset = preset;
    this.type = resolveType(type, rng);
    this.kind = KIND_CODE[this.type.id] ?? K_PLAIN;
    this.heightScale = this.type.heightScale ?? 8;
    this.roughness = this.type.roughness ?? 0.95;
    this.frequency = 1 / 340;
    this.octaves = 4;
    this.seg = deriveSeg(preset, seg);

    this._buildNoise(rng);

    this.centerHeight = this._rawHeight(0, 0);
    this.walls = [];
    this.colliders = this._makeColliders();

    this.group = new THREE.Group();
    this.group.name = 'terrainGroup';
    this.group.matrixAutoUpdate = false;
    this.group.updateMatrix();

    this.mesh = null;
    this.material = null;
    this.borderMeshes = [];
    this._time = 0;
  }

  // ?? noise tables (built once, deterministic) ??
  _buildNoise(rng) {
    const perm = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    if (rng) {
      rng.shuffle(base);
    } else {
      // deterministic fallback permutation (no rng provided)
      let s = 1;
      for (let i = 255; i > 0; i--) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const j = s % (i + 1);
        const t = base[i];
        base[i] = base[j];
        base[j] = t;
      }
    }
    for (let i = 0; i < 512; i++) perm[i] = base[i & 255];
    this.perm = perm;

    const vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) vals[i] = rng ? rng.next() : (i * 0.6180339887) % 1;
    this.vals = vals;
  }

  _value(ix, iz) {
    const p = this.perm;
    return this.vals[p[(p[ix & 255] + (iz & 255)) & 255]] * 2 - 1;
  }

  // bilinear-interpolated value noise, allocation free
  _noise(x, z) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const fx = x - xi;
    const fz = z - zi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    const n00 = this._value(xi, zi);
    const n10 = this._value(xi + 1, zi);
    const n01 = this._value(xi, zi + 1);
    const n11 = this._value(xi + 1, zi + 1);
    const a = n00 + (n10 - n00) * u;
    const b = n01 + (n11 - n01) * u;
    return a + (b - a) * v;
  }

  // 4-octave fBm, no allocations
  _fbm(x, z) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let px = x;
    let pz = z;
    for (let o = 0; o < this.octaves; o++) {
      sum += this._noise(px, pz) * amp;
      norm += amp;
      amp *= 0.5;
      px = px * 2.03 + 1.7;
      pz = pz * 2.03 - 2.3;
    }
    return sum / norm;
  }

  // height before the base plateau blend
  _rawHeight(x, z) {
    const f = this.frequency;
    const s = this.heightScale;
    if (this.kind === K_MOUNTAIN) {
      const n = this._fbm(x * f, z * f);
      const r = 1 - Math.abs(n); // ridges
      const detail = this._fbm(x * f * 3.1 + 21.7, z * f * 3.1 - 13.3);
      return s * (r * r * 1.35 - 0.18 + detail * 0.14);
    }
    if (this.kind === K_VALLEY) {
      const n = this._fbm(x * f, z * f);
      const basin = Math.pow(Math.abs(n), 1.35);
      const detail = this._fbm(x * f * 2.7 - 5.1, z * f * 2.7 + 9.4);
      return -s * (basin * 0.95 - 0.25 + detail * 0.12);
    }
    if (this.kind === K_HILL) {
      const n = this._fbm(x * f, z * f);
      const detail = this._fbm(x * f * 2.5 + 3.3, z * f * 2.5 - 8.1);
      return s * (n * 0.8 + detail * 0.16);
    }
    const n = this._fbm(x * f, z * f);
    const detail = this._fbm(x * f * 3.3 + 7.7, z * f * 3.3 + 3.1);
    return s * (n * 0.5 + detail * 0.16);
  }

  // world height; matches the mesh vertices exactly (no raycasting needed)
  getHeight(x, z) {
    let h = this._rawHeight(x, z);
    const d = Math.sqrt(x * x + z * z);
    const outer = PLATEAU_RADIUS + PLATEAU_FALLOFF;
    if (d < outer) {
      let t = (outer - d) / PLATEAU_FALLOFF;
      if (t > 1) t = 1;
      t = t * t * (3 - 2 * t);
      h = h * (1 - t) + this.centerHeight * t;
    }
    return h;
  }

  slopeAt(x, z, e = 2) {
    const hx = (this.getHeight(x + e, z) - this.getHeight(x - e, z)) / (2 * e);
    const hz = (this.getHeight(x, z + e) - this.getHeight(x, z - e)) / (2 * e);
    return Math.sqrt(hx * hx + hz * hz);
  }

  isInside(x, z, margin = 0) {
    const lim = MAP.half - margin;
    return x >= -lim && x <= lim && z >= -lim && z <= lim;
  }

  _makeColliders() {
    const h = MAP.half;
    const t = WALL_THICKNESS;
    return [
      { minX: -h - t, maxX: h + t, minZ: h, maxZ: h + t },
      { minX: -h - t, maxX: h + t, minZ: -h - t, maxZ: -h },
      { minX: h, maxX: h + t, minZ: -h - t, maxZ: h + t },
      { minX: -h - t, maxX: -h, minZ: -h - t, maxZ: h + t }
    ];
  }

  /**
   * 렌더된 지형 메시의 "실제 표면" 높이.
   * 메시는 격자 정점을 선형 보간하므로 정점 사이에서는 해석적 getHeight 와 값이 다르다.
   * 나무·광물·포탑·플레이어를 바닥에 정확히 붙이려면 이 값을 써야 한다(공중부양/지면 관통 방지).
   */
  surfaceHeight(x, z) {
    const size = MAP.size;
    const seg = this.seg;
    const step = size / seg;
    const half = size / 2;
    const fx = (x + half) / step;
    const fz = (z + half) / step;
    let i = Math.floor(fx);
    let j = Math.floor(fz);
    if (!(i >= 0)) i = 0;
    else if (i > seg - 1) i = seg - 1;
    if (!(j >= 0)) j = 0;
    else if (j > seg - 1) j = seg - 1;
    const tx = Math.min(1, Math.max(0, fx - i));
    const tz = Math.min(1, Math.max(0, fz - j));
    const x0 = -half + i * step;
    const z0 = -half + j * step;
    const key = i * 4096 + j;
    if (!this._surfaceCells) this._surfaceCells = new Map();
    let cell = this._surfaceCells.get(key);
    if (!cell) {
      if (this._surfaceCells.size > 8192) this._surfaceCells.clear();
      cell = {
        h00: this.getHeight(x0, z0),
        h10: this.getHeight(x0 + step, z0),
        h01: this.getHeight(x0, z0 + step),
        h11: this.getHeight(x0 + step, z0 + step)
      };
      this._surfaceCells.set(key, cell);
    }
    // PlaneGeometry 삼각분할: (i,j)-(i,j+1)-(i+1,j) / (i,j+1)-(i+1,j+1)-(i+1,j)
    if (tx + tz <= 1) {
      return cell.h00 + (cell.h10 - cell.h00) * tx + (cell.h01 - cell.h00) * tz;
    }
    return cell.h11 + (cell.h01 - cell.h11) * (1 - tx) + (cell.h10 - cell.h11) * (1 - tz);
  }

  /** 절차적 잔디 텍스처(캔버스 없으면 null → 헤드리스 안전). */
  _grassTexture() {
    if (this._grassTex !== undefined) return this._grassTex;
    this._grassTex = null;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    try {
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 128;
      const g = typeof cv.getContext === 'function' ? cv.getContext('2d') : null;
      if (!g) return null;
      g.fillStyle = '#eaffdf';
      g.fillRect(0, 0, 128, 128);
      let s = 1337;
      const rand = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
      for (let n = 0; n < 2800; n++) {
        const px = rand() * 128;
        const py = rand() * 128;
        const len = 2 + rand() * 5;
        const tone = 205 + Math.floor(rand() * 50);
        g.strokeStyle = `rgba(${Math.floor(tone * 0.6)},${tone},${Math.floor(tone * 0.45)},0.55)`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + (rand() - 0.5) * 2.4, py - len);
        g.stroke();
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(900, 900);
      tex.anisotropy = 4;
      if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      this._grassTex = tex;
    } catch {
      this._grassTex = null;
    }
    return this._grassTex;
  }

  build() {
    if (this.mesh) return this.mesh;
    const seg = this.seg;
    const size = MAP.size;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const step = size / seg;

    const baseColor = new THREE.Color(this.type.color);
    const cLow = baseColor.clone().multiplyScalar(0.6);
    const cHigh = baseColor.clone().lerp(WHITE, 0.42);
    const cRock = new THREE.Color(ROCK_HEX);
    const cGrass = new THREE.Color(GRASS_HEX);
    const scratch = new THREE.Color();
    const span = Math.max(1e-3, this.heightScale * 0.9);

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.getHeight(x, z);
      pos.setY(i, h);

      // height tint
      let t = ((h - this.centerHeight) / span) * 0.5 + 0.5;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      scratch.copy(cLow).lerp(cHigh, t);

      // slope tint -> rock
      const slope = this.slopeAt(x, z, step);
      let sf = slope / 0.85;
      if (sf > 1) sf = 1;
      if (sf > 0.001) scratch.lerp(cRock, sf * 0.34); // 잔디 바닥: 급경사만 바위
      scratch.lerp(cGrass, (1 - sf) * 0.18); // 완만한 곳은 밝은 풀색

      // subtle deterministic variation
      const v = this._value(Math.floor(x * 0.25), Math.floor(z * 0.25)) * 0.5 + 0.5;
      const k = 0.93 + v * 0.14;
      colors[i * 3] = scratch.r * k;
      colors[i * 3 + 1] = scratch.g * k;
      colors[i * 3 + 2] = scratch.b * k;
    }

    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const grass = this._grassTexture();
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: this.roughness,
      metalness: 0.04
    });
    if (grass) {
      this.material.map = grass;
      this.material.needsUpdate = true;
    }
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'terrain';
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
    this.group.add(this.mesh);

    this._buildBorder();
    return this.mesh;
  }

  // visible cliff wall ring + glowing boundary line, plus matching colliders
  _buildBorder() {
    const h = MAP.half;
    const t = WALL_THICKNESS;
    const spanX = MAP.size + t * 2;
    const wallHeight = this.heightScale * 3.2 + 60;
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x3b4048,
      roughness: 0.95,
      metalness: 0.05,
      emissive: 0x101822,
      emissiveIntensity: 0.4
    });
    this.wallGeo = wallGeo;
    this.wallMat = wallMat;
    this.wallHeight = wallHeight;

    const yBase = this.centerHeight - this.heightScale * 1.8 - 10;
    const specs = [
      { x: 0, z: h + t / 2, sx: spanX, sz: t },
      { x: 0, z: -h - t / 2, sx: spanX, sz: t },
      { x: h + t / 2, z: 0, sx: t, sz: spanX },
      { x: -h - t / 2, z: 0, sx: t, sz: spanX }
    ];
    for (const s of specs) {
      const wall = new THREE.Mesh(wallGeo, wallMat);
      wall.name = 'terrain.boundaryWall';
      wall.position.set(s.x, yBase + wallHeight / 2, s.z);
      wall.scale.set(s.sx, wallHeight, s.sz);
      wall.matrixAutoUpdate = false;
      wall.updateMatrix();
      wall.receiveShadow = false;
      wall.castShadow = false;
      wall.userData.center = { x: s.x, z: s.z };
      this.group.add(wall);
      this.borderMeshes.push(wall);
      this.walls.push(wall);
    }

    // glowing barrier line on top of the cliff wall (always above the terrain)
    const topY = yBase + wallHeight;
    const ringGeo = new THREE.TorusGeometry(h, 6, 6, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x6fe3ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'terrain.boundaryRing';
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, topY - 8, 0);
    ring.matrixAutoUpdate = false;
    ring.updateMatrix();
    ring.userData.center = { x: 0, z: 0 };
    this.group.add(ring);
    this.borderMeshes.push(ring);
    this.ringGeo = ringGeo;
    this.ringMat = ringMat;
  }

  // frame preset change: nothing to rebuild, border glow stays
  update(dt) {
    this._time += dt || 0;
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.material?.dispose();
      this.mesh = null;
    }
    this.wallGeo?.dispose();
    this.wallMat?.dispose();
    this.ringGeo?.dispose();
    this.ringMat?.dispose();
    this.walls.length = 0;
    this.borderMeshes.length = 0;
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }
}

export default Terrain;

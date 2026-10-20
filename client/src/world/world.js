// World assembly: terrain + trees + minerals + base + portals + sky.
import * as THREE from 'three';
import { MAP, TERRAIN_TYPES, FRAME_PRESETS, SPAWN_PATTERNS } from '../data.js';
import { createRNG } from '../utils/rng.js';
import { Terrain } from './terrain.js';
import { TreeField } from './trees.js';
import { MineralField } from './minerals.js';
import { CoreBase } from './base.js';
import { PortalField } from './portals.js';
import { createSky, applySkyQuality } from './sky.js';
import { HIDDEN_REGIONS, regionAt, regionSummary, inDiscoverRange, hiddenRegionAt } from './regions.js';

function resolvePreset(quality, preset) {
  if (preset && typeof preset === 'object') return preset;
  if (quality && typeof quality === 'object') return quality;
  return FRAME_PRESETS.find((p) => p.id === quality) || FRAME_PRESETS[1];
}

export class World {
  constructor({ scene = null, seed = 'fortress', quality = 'balanced', preset = null, rng = null } = {}) {
    this.scene = scene;
    this.seed = seed ?? 'fortress';
    this.preset = resolvePreset(quality, preset);
    this.quality = this.preset.id;
    this.rng = rng || createRNG(this.seed);
    this.bounds = { size: MAP.size, half: MAP.half };

    this.group = new THREE.Group();
    this.group.name = 'world';
    this.group.matrixAutoUpdate = false;
    this.group.updateMatrix();

    this.time = 0;
    this._cameraPos = new THREE.Vector3();
    this._disposed = false;

    // ── 지역(티어 띠 + 히든 지역) 발견 상태 ──
    this.discoveredRegions = new Set();
    this.region = { list: HIDDEN_REGIONS, at: regionAt, summary: regionSummary };

    // ?? terrain ??
    this.terrainType = this.rng.weightedPick(TERRAIN_TYPES);
    this.terrain = new Terrain({
      rng: this.rng.fork('terrain'),
      type: this.terrainType,
      preset: this.preset
    });
    this.terrain.build();
    this.terrainType = this.terrain.type;
    this.terrainTypeId = this.terrain.type.id;
    this.group.add(this.terrain.group);

    // ?? vegetation ??
    this.treeField = new TreeField({
      rng: this.rng.fork('trees'),
      terrain: this.terrain,
      preset: this.preset
    });
    this.treeField.build();
    this.trees = this.treeField.trees;
    this.group.add(this.treeField.group);

    // ?? ore deposits ??
    this.mineralField = new MineralField({
      rng: this.rng.fork('minerals'),
      terrain: this.terrain,
      preset: this.preset
    });
    this.mineralField.build();
    this.minerals = this.mineralField.minerals;
    this.group.add(this.mineralField.group);

    // ?? base (map centre, on the plateau) ??
    this.base = new CoreBase({ terrain: this.terrain, preset: this.preset });
    this.group.add(this.base.group);

    // ?? portals ??
    this.portalField = new PortalField({
      rng: this.rng.fork('portals'),
      terrain: this.terrain,
      preset: this.preset
    });
    const pattern = this.rng.pick(SPAWN_PATTERNS);
    this.portalField.setPattern(pattern.id);
    this.portals = this.portalField.portals;
    this.spawnPattern = this.portalField.patternDef;
    this.spawnPatternId = this.portalField.pattern;
    this.group.add(this.portalField.group);

    // ?? sky + atmosphere ??
    this.sky = createSky({ scene, preset: this.preset, seed: this.seed, rng: this.rng.fork('sky') });
    this.group.add(this.sky.group);

    this._wireScene();
  }

  _wireScene() {
    const scene = this.scene;
    if (!scene) return;
    const fogNear = this.preset.fog?.near ?? MAP.fogNear;
    const fogFar = this.preset.fog?.far ?? MAP.fogFar;
    if ('fog' in scene) scene.fog = new THREE.Fog(MAP.fogColor, fogNear, fogFar);
    if ('background' in scene) scene.background = new THREE.Color(MAP.skyBottom).multiplyScalar(0.9);
    scene.add(this.group);
  }

  // ?? queries ??
  /** 바닥 표면 높이 — 렌더된 메시와 정확히 일치(나무·포탑·플레이어가 뜨지 않는다). */
  getHeight(x, z) {
    const t = this.terrain;
    if (t && typeof t.surfaceHeight === 'function') return t.surfaceHeight(x, z);
    return t.getHeight(x, z);
  }

  slopeAt(x, z) {
    return this.terrain.slopeAt(x, z);
  }

  /** 좌표가 속한 지역(띠 + 히든). 히든 지역이면 {hidden:true} */
  regionAt(x, z) {
    return regionAt(x, z);
  }

  /** 좌표 지역 요약(이름·거리·티어) — HUD/알림용 */
  regionSummary(x, z) {
    return regionSummary(x, z);
  }

  /** 히든 지역 발견 — 새로 발견했으면 그 지역 정의, 아니면 null */
  discover(x, z) {
    for (const h of HIDDEN_REGIONS) {
      if (this.discoveredRegions.has(h.id)) continue;
      if (!inDiscoverRange(h.id, x, z)) continue;
      this.discoveredRegions.add(h.id);
      return h;
    }
    return null;
  }

  /** 발견한 지역 id 목록(세이브용) */
  regionState() {
    return [...this.discoveredRegions];
  }

  /** 세이브에서 발견 상태 복원 */
  loadRegionState(ids) {
    this.discoveredRegions = new Set(Array.isArray(ids) ? ids.filter((id) => HIDDEN_REGIONS.some((h) => h.id === id)) : []);
    return this.discoveredRegions.size;
  }

  /** 좌표가 히든 지역 안인가(테스트·미니맵용) */
  hiddenRegionAt(x, z) {
    return hiddenRegionAt(x, z);
  }

  isInside(x, z, margin = 0) {
    return this.terrain.isInside(x, z, margin);
  }

  nearestMineral(position, radius = 12) {
    return this.mineralField.nearest(position, radius);
  }

  nearestTree(position, radius = 12) {
    return this.treeField.nearest(position, radius);
  }

  // Mutates `position` in place: bounds, base keep-out, tree/mineral circles, ground.
  resolveCollision(position, radius = 0.6) {
    if (!position) return position;
    const lim = this.bounds.half - radius - 2;
    if (position.x > lim) position.x = lim;
    else if (position.x < -lim) position.x = -lim;
    if (position.z > lim) position.z = lim;
    else if (position.z < -lim) position.z = -lim;

    // base keep-out circle
    const base = this.base;
    const keep = base.radius + radius;
    let dx = position.x - base.position.x;
    let dz = position.z - base.position.z;
    let d2 = dx * dx + dz * dz;
    if (d2 < keep * keep) {
      if (d2 < 1e-8) {
        position.x = base.position.x + keep;
      } else {
        const d = Math.sqrt(d2);
        position.x = base.position.x + (dx / d) * keep;
        position.z = base.position.z + (dz / d) * keep;
      }
    }

    // solid obstacles (two passes so overlapping trunks/minerals settle)
    for (let pass = 0; pass < 2; pass++) {
      this._pushOut(position, radius, this.treeField);
      this._pushOut(position, radius, this.mineralField);
    }

    position.y = this.getHeight(position.x, position.z);
    return position;
  }

  _pushOut(position, radius, field) {
    const obj = field.nearest(position, radius + 6);
    if (!obj) return;
    const keep = radius + (obj.radius || 0.8);
    let dx = position.x - obj.x;
    let dz = position.z - obj.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= keep * keep) return;
    if (d2 < 1e-8) {
      dx = 1;
      dz = 0;
    }
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    position.x = obj.x + (dx / d) * keep;
    position.z = obj.z + (dz / d) * keep;
  }

  // distance culling against preset.drawDistance; geometry is never rebuilt
  frustumCull(camera) {
    if (!camera) return;
    if (camera.getWorldPosition) camera.getWorldPosition(this._cameraPos);
    else this._cameraPos.copy(camera.position || { x: 0, y: 0, z: 0 });
    const cam = this._cameraPos;
    const draw = this.preset.drawDistance ?? 440;

    // portals
    const pr = draw + 40;
    for (let i = 0; i < this.portals.length; i++) {
      const portal = this.portals[i];
      const dx = portal.x - cam.x;
      const dz = portal.z - cam.z;
      portal.mesh.visible = portal.active && dx * dx + dz * dz < pr * pr;
    }

    // base
    const bx = this.base.position.x - cam.x;
    const bz = this.base.position.z - cam.z;
    const br = draw + 60;
    this.base.group.visible = bx * bx + bz * bz < br * br;

    // boundary cliffs (one per edge -> cheap, meaningful culling)
    const walls = this.terrain.borderMeshes;
    const wr = draw + 160;
    for (let i = 0; i < walls.length; i++) {
      const wall = walls[i];
      const c = wall.userData.center;
      if (!c) {
        wall.visible = true;
        continue;
      }
      const dx = c.x - cam.x;
      const dz = c.z - cam.z;
      wall.visible = dx * dx + dz * dz < wr * wr;
    }

    // 청크 컬링 — InstancedMesh 안의 먼 인스턴스는 통째로 숨긴다(정점·픽셀·그림자 절약)
    this.treeField.cullChunks?.(camera);
    this.mineralField.cullChunks?.(camera);

    // whole-field fallback: hide instanced fields if the camera left the playable area
    const far = this.bounds.half + draw;
    const outside = cam.x * cam.x + cam.z * cam.z > far * far;
    this.treeField.group.visible = !outside;
    this.mineralField.group.visible = !outside;
    this.terrain.group.visible = true;
  }

  update(dt, ctx = null) {
    const step = typeof dt === 'number' && isFinite(dt) ? dt : 0;
    this.time += step;
    this.group.updateMatrix();
    this.terrain.update(step);
    this.treeField.update(step);
    this.mineralField.update(step);
    this.base.update(step);
    this.portalField.update(step);
    this.sky.update(step, ctx?.camera || null);
    if (ctx?.camera) this.frustumCull(ctx.camera);
  }

  // let the wave system drive which gates are lit (keeps visuals in sync with spawning)
  setSpawnPattern(patternId) {
    const id = this.portalField.setPattern(patternId);
    this.spawnPatternId = id;
    this.spawnPattern = this.portalField.patternDef;
    return id;
  }

  // live FRAME_PRESETS switch: shadows / fog / culling distance, no rebuild
  applyQuality(quality) {
    const preset = resolvePreset(quality, null);
    this.preset = preset;
    this.quality = preset.id;
    if (this.scene) {
      const fog = this.scene.fog;
      if (fog && preset.fog) {
        fog.near = preset.fog.near;
        fog.far = preset.fog.far;
      }
    }
    applySkyQuality(this.sky, preset);
    this.treeField.invalidateCull?.();
    this.mineralField.invalidateCull?.();
    return preset;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.treeField.dispose();
    this.mineralField.dispose();
    this.portalField.dispose();
    this.base.dispose();
    this.terrain.dispose();
    this.sky.dispose();
    if (this.scene) {
      if (this.scene.fog) this.scene.fog = null;
      if (this.scene.background instanceof THREE.Color) this.scene.background = null;
      this.scene.remove(this.group);
    }
    this.trees = [];
    this.minerals = [];
    this.portals = [];
    while (this.group.children.length) this.group.remove(this.group.children[0]);
  }
}

export function createWorld({ scene = null, seed = 'fortress', quality = 'balanced', preset = null, rng = null } = {}) {
  return new World({ scene, seed, quality, preset, rng });
}

export default { createWorld, World };

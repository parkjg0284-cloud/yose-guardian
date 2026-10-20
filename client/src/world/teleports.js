// world/teleports.js — 지형 이동용 3D 텔레포트 포탈(계약 §4.59).
//  · 지형마다 하나씩, 지형 색으로 빛나는 고리 포탈을 세운다(기지 · T1~T7 · 숨은 지형).
//  · 가까이 가면 안내가 뜨고, N 키(설정에서 변경 가능)로 이동 목록을 연다.
import * as THREE from 'three';
import { REGIONS, HIDDEN_REGIONS } from './regions.js';
import { destinationList, arrivalPoint, regionColor, colorInt, destinationById } from '../travel.js';

const RING_SEGMENTS = 28;
const NEAR_RANGE = 7;

export class TeleportField {
  constructor({ scene = null, world = null, range = NEAR_RANGE } = {}) {
    this.scene = scene;
    this.world = world;
    this.range = Math.max(2, Number(range) || NEAR_RANGE);
    this.group = new THREE.Group();
    this.group.name = 'teleports';
    this.portals = [];
    this.near = null;
    this.time = 0;
    this.cooldown = 0;
    this._tmp = new THREE.Vector3();
    this._build();
    if (scene?.add) scene.add(this.group);
  }

  _build() {
    for (const dest of destinationList()) {
      const point = arrivalPoint(dest);
      const x = Number(point.x) || 0;
      const z = Number(point.z) || 0;
      const y = Number(this.world?.getHeight?.(x, z) ?? 0);
      const color = colorInt(dest.color);
      const holder = new THREE.Group();
      holder.name = `teleport:${dest.id}`;
      holder.position.set(x, y, z);

      // 바닥 고리 + 빛기둥 (지형 색)
      const baseMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 });
      const base = new THREE.Mesh(new THREE.CircleGeometry(3.4, RING_SEGMENTS), baseMat);
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0.06;
      holder.add(base);

      const ringMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 10, RING_SEGMENTS), ringMat);
      ring.position.y = 3.2;
      holder.add(ring);

      const inner = new THREE.Mesh(
        new THREE.CircleGeometry(2.35, RING_SEGMENTS),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
      );
      inner.position.y = 3.2;
      holder.add(inner);

      const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 3.2, 8.5, RING_SEGMENTS, 1, true), beamMat);
      beam.position.y = 4.2;
      holder.add(beam);

      // 떠 있는 룬 4개
      const runes = [];
      const runeMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.3 });
      for (let i = 0; i < 4; i++) {
        const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), runeMat);
        holder.add(rune);
        runes.push(rune);
      }

      this.group.add(holder);
      this.portals.push({
        id: dest.id,
        name: dest.name,
        tier: dest.tier,
        hidden: !!dest.hidden,
        color: dest.color,
        x,
        z,
        y,
        holder,
        ring,
        inner,
        beam,
        base,
        runes,
        _mats: [baseMat, ringMat, runeMat],
        _beamMat: beamMat
      });
    }
  }

  /** 현재 서 있는 지형(안내 문구용) */
  regionNameAt(x, z) {
    try {
      return this.world?.regionSummary?.(x, z)?.name ?? this.world?.regionAt?.(x, z)?.name ?? null;
    } catch {
      return null;
    }
  }

  nearest(position = null) {
    const p = position ?? this._playerPos;
    if (!p) return null;
    let best = null;
    let bestD = Infinity;
    for (const portal of this.portals) {
      const d = Math.hypot((p.x ?? 0) - portal.x, (p.z ?? 0) - portal.z);
      if (d < bestD) {
        bestD = d;
        best = portal;
      }
    }
    return best ? { ...best, distance: bestD, inRange: bestD <= this.range } : null;
  }

  /** 가까운 포탈(범위 안)만 */
  nearestInRange(position = null) {
    const info = this.nearest(position);
    return info && info.inRange ? info : null;
  }

  /** N 키 — 포탈 근처면 목적지 목록을 연다 */
  openTravel(game) {
    const info = this.nearestInRange(game?.player?.position ?? null);
    if (!info) {
      game?.notify?.('포탈 가까이에서 눌러 주세요 — 지형 이동', 'warn');
      return false;
    }
    this.near = info;
    game?.ui?.panels?.open?.('travel');
    return true;
  }

  /** 이동 — 도착 지점은 목적지 포탈 옆이다 */
  travelTo(id, game) {
    const dest = destinationById(id);
    if (!dest) return false;
    if (this.cooldown > 0) return false;
    const point = arrivalPoint(dest);
    const player = game?.player;
    if (!player?.setPosition) return false;
    player.setPosition(point.x, undefined, point.z);
    player.velocity?.set?.(0, 0, 0);
    this.cooldown = 0.8;
    this._flash(id);
    game?.notify?.(`${dest.name}(으)로 이동했습니다`, 'success');
    return true;
  }

  _flash(id) {
    const portal = this.portals.find((p) => p.id === id);
    if (!portal) return;
    portal._flash = 1;
  }

  update(dt = 0, { player = null } = {}) {
    const d = Math.max(0, Math.min(0.1, Number(dt) || 0));
    this.time += d;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - d);
    if (player?.position) this._playerPos = player.position;
    const near = this.nearestInRange(this._playerPos);
    this.near = near;
    for (const portal of this.portals) {
      const isNear = near?.id === portal.id;
      portal.ring.rotation.z += d * (isNear ? 1.6 : 0.7);
      portal.inner.rotation.z -= d * 1.1;
      portal.inner.material.opacity = 0.28 + Math.sin(this.time * 2 + portal.tier) * 0.08 + (isNear ? 0.18 : 0);
      const pulse = 1 + Math.sin(this.time * 1.6 + portal.tier) * 0.03;
      portal.ring.scale.setScalar(isNear ? 1.12 : pulse);
      for (let i = 0; i < portal.runes.length; i++) {
        const a = this.time * (isNear ? 1.5 : 0.8) + (i / portal.runes.length) * Math.PI * 2;
        portal.runes[i].position.set(Math.cos(a) * 2.6, 3.2 + Math.sin(this.time * 2 + i) * 0.35, Math.sin(a) * 2.6);
        portal.runes[i].rotation.y += d * 1.4;
      }
      if (portal._flash > 0) {
        portal._flash = Math.max(0, portal._flash - d * 1.8);
        const k = portal._flash;
        for (const m of portal._mats) m.emissiveIntensity = 0.9 + k * 2.5;
        portal._beamMat.opacity = 0.18 + k * 0.5;
      }
    }
  }

  /** 이동 목록(패널용) — 지형 색과 좌표 포함 */
  list() {
    return this.portals.map((p) => ({ id: p.id, name: p.name, tier: p.tier, hidden: p.hidden, color: p.color, x: Math.round(p.x), z: Math.round(p.z) }));
  }

  dispose() {
    for (const portal of this.portals) {
      for (const child of portal.holder.children) {
        child.geometry?.dispose?.();
        child.material?.dispose?.();
      }
    }
    this.group.removeFromParent?.();
    this.portals = [];
  }
}

export default TeleportField;

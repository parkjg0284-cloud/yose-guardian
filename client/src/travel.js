// travel.js — 지형(지역) 이동 목록과 지형별 색(계약 §4.59). three 를 쓰지 않는다(테스트·UI 공용).
import { REGIONS, HIDDEN_REGIONS } from './world/regions.js';

/** 지형별 색 — 포탈 3D 색과 이동 목록 색이 같다 */
export const TERRAIN_COLORS = {
  base: '#e8d9a8',
  safe: '#e8d9a8',
  tier1: '#7ee081',
  tier2: '#3fbf7f',
  tier3: '#59d6ff',
  tier4: '#b18cff',
  tier5: '#cfefff',
  tier6: '#ff7a45',
  tier7: '#ffe08a',
  outer: '#9aa0a6',
  cherry_garden: '#ff9ecb',
  time_horizon: '#7fd1ff',
  garden_of_dreams: '#ffa8d8'
};

/** 지역 색(없으면 회색) */
export function regionColor(id) {
  return TERRAIN_COLORS[id] ?? '#9aa0a6';
}

/** '#rrggbb' → 0xrrggbb (three 색상용) */
export function colorInt(hex) {
  const s = String(hex ?? '').replace('#', '');
  const n = Number.parseInt(s.length >= 6 ? s.slice(0, 6) : s.padEnd(6, '0'), 16);
  return Number.isFinite(n) ? n : 0x9aa0a6;
}

/** 기지 광장 포탈 — 어디서든 돌아올 수 있는 기준점 */
export const BASE_DESTINATION = Object.freeze({ id: 'base', name: '기지 광장', tier: 0, hidden: false, angle: 0.5, radius: 62 });

const RING_IDS = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'tier6', 'tier7'];

/** 이동 가능한 지형 목록(고리 지형 → 숨은 지형 순) */
export function destinationList() {
  const out = [{ ...BASE_DESTINATION, color: regionColor('base'), desc: '요새의 중심 — 안전 지대' }];
  const rings = RING_IDS.map((id, i) => {
    const region = REGIONS.find((r) => r.id === id);
    if (!region) return null;
    const radius = ((Number(region.inner) || 0) + (Number(region.outer) || 0)) / 2;
    return {
      id,
      name: region.name ?? id,
      tier: Number(region.tier) || i + 1,
      hidden: false,
      color: regionColor(id),
      radius,
      angle: (i / RING_IDS.length) * Math.PI * 2 + 0.35,
      glyph: region.glyph ?? '',
      desc: region.desc ?? ''
    };
  }).filter(Boolean);
  out.push(...rings);
  for (const h of Array.isArray(HIDDEN_REGIONS) ? HIDDEN_REGIONS : []) {
    out.push({
      id: h.id,
      name: h.name ?? h.id,
      tier: Number(h.tier) || 6,
      hidden: true,
      color: regionColor(h.id),
      x: Number(h.x) || 0,
      z: Number(h.z) || 0,
      radius: Number(h.radius) || 240,
      angle: 0,
      glyph: h.glyph ?? '',
      desc: h.desc ?? ''
    });
  }
  return out;
}

export function destinationById(id) {
  return destinationList().find((d) => d.id === id) ?? null;
}

/** 도착 좌표(월드) */
export function arrivalPoint(dest) {
  if (!dest) return { x: 0, z: 0 };
  if (Number.isFinite(dest.x) && Number.isFinite(dest.z) && (dest.hidden || dest.radius > 0) && dest.radius !== undefined && dest.angle === 0) {
    // 숨은 지형 — 중심에서 조금 떨어진 곳에 선다.
    return { x: dest.x + 10, z: dest.z + 6 };
  }
  const r = Math.max(1, Number(dest.radius) || 100);
  return { x: Math.cos(dest.angle ?? 0) * r, z: Math.sin(dest.angle ?? 0) * r };
}

/** 지형 묶음(tier 순) — 이동 목록을 지형별로 나눠 보여 준다 */
export function destinationsByTerrain() {
  const groups = new Map();
  for (const d of destinationList()) {
    const key = d.hidden ? `숨은 지형 (T${d.tier})` : d.tier <= 0 ? '기지' : `T${d.tier} 지형`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

/** 무결성 검사 — 스모크 테스트가 호출 */
export function validateTravelData() {
  const errors = [];
  const list = destinationList();
  if (list.length < 9) errors.push(`이동 지형이 너무 적다(${list.length})`);
  for (const d of list) {
    if (!d.id || !d.name) errors.push('id/이름 없는 지형');
    if (!/^#[0-9a-f]{6}$/i.test(String(d.color))) errors.push(`${d.id}: 색 형식 오류(${d.color})`);
    const p = arrivalPoint(d);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) errors.push(`${d.id}: 도착 좌표 오류`);
    if (Math.hypot(p.x, p.z) > 2600) errors.push(`${d.id}: 도착 좌표가 맵 밖(${Math.round(Math.hypot(p.x, p.z))})`);
  }
  for (const id of RING_IDS) if (!list.some((d) => d.id === id)) errors.push(`${id} 누락`);
  for (const id of ['cherry_garden', 'time_horizon']) if (!list.some((d) => d.id === id)) errors.push(`${id} 누락`);
  const colors = new Set(list.map((d) => d.color));
  if (colors.size < list.length - 1) errors.push('지형 색이 너무 겹친다');
  const groups = destinationsByTerrain();
  if (groups.length < 7) errors.push(`지형 묶음이 너무 적다(${groups.length})`);
  return errors;
}

export default { TERRAIN_COLORS, regionColor, colorInt, destinationList, destinationById, arrivalPoint, destinationsByTerrain, validateTravelData };

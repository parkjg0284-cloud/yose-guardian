// ui/minimap.js — 요새의 수호자 미니맵.
// 2D 캔버스에 직접 그린다 (three import 금지). 계약: docs/CONTRACT.md §4.13
//
// 성능 규칙
//  - 정적 레이어(배경/지형 틴트/격자/맵 테두리/광물)는 오프스크린 캔버스에 1회 굽고
//    더티 플래그가 설 때만 다시 굽는다.
//  - 매 프레임 그리는 것은 포탈/포탑/적/플레이어뿐이며, 배열을 새로 만들지 않는다.
//  - 프레임당 목표 비용 2ms 이하 (적 상한 220, 포탑 수백 개 기준).
import { MINERAL_TYPES, TERRAIN_TYPES, TURRET_BY_ID } from '../data.js';

const TAU = Math.PI * 2;
const GRID_STEPS = 10; // 5000 맵 → 500 단위 격자
const MAX_ENEMY_DOTS = 400;
const VIEW_CONE = 0.46; // 라디안

// 광물 티어 색 (가독성 우선 — 지형 위에서 도드라지게)
const TIER_COLOR = {
  1: '#bfc7cc',
  2: '#6fd97a',
  3: '#5fa8ff',
  4: '#b06bff',
  5: '#ffb45c'
};

// 포탑 계열 색 (공격형은 계약대로 시안 사각형)
const CATEGORY_COLOR = {
  attack: '#6ad4ff',
  heal: '#6fe89a',
  mining: '#ffd24a',
  lumber: '#c0a868'
};

// 스폰 패턴 색 (포탈)
const PATTERN_COLOR = {
  radial: '#ff8f5c',
  cluster: '#ffd24a',
  opposite: '#6ad4ff',
  scattered: '#b06bff',
  ring: '#4fd97a'
};

const TERRAIN_BY_ID = new Map(TERRAIN_TYPES.map((t) => [t.id, t]));
const MINERAL_TIER_BY_ID = new Map(MINERAL_TYPES.map((m) => [m.id, m.tier]));

function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// 0xRRGGBB | '#rgb' | '#rrggbb' → '#rrggbb'
function hex(color, fallback = '#8fd6ff') {
  if (typeof color === 'string') {
    if (color.startsWith('#') || color.startsWith('rgb')) return color;
    return fallback;
  }
  if (typeof color === 'number' && Number.isFinite(color)) {
    return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
  }
  return fallback;
}

function rgba(color, alpha) {
  const h = hex(color);
  if (h.startsWith('rgb')) return h;
  let body = h.slice(1);
  if (body.length === 3) body = body[0] + body[0] + body[1] + body[1] + body[2] + body[2];
  const n = parseInt(body.slice(0, 6), 16);
  if (!Number.isFinite(n)) return `rgba(140,170,220,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function xOf(entity) {
  if (!entity) return NaN;
  const p = entity.position;
  return num(p ? p.x : entity.x, NaN);
}

function zOf(entity) {
  if (!entity) return NaN;
  const p = entity.position;
  return num(p ? p.z : entity.z, NaN);
}

export class Minimap {
  constructor({ canvas, world, size = 5000 } = {}) {
    this.canvas = canvas ?? null;
    this.ctx = canvas?.getContext?.('2d') ?? null;
    this.world = world ?? null;
    this.size = Number.isFinite(size) && size > 0 ? size : 5000;
    this.visible = true;
    this.dpr = 1;

    // 논리 좌표(캔버스 CSS px). index.html 의 width/height 속성을 기준으로 삼는다.
    this.w = Number(canvas?.getAttribute?.('width')) || 220;
    this.h = Number(canvas?.getAttribute?.('height')) || 220;
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.radius = Math.max(8, Math.min(this.w, this.h) / 2 - 6);
    this.side = this.radius * Math.SQRT2; // 원에 내접하는 정사각형 = 맵 전체

    this._static = null;
    this._staticCtx = null;
    this._staticDirty = true;
    this._mineralCache = [];
    this._cachedMineralCount = -1;
    this._onResize = null;

    this._applySize();
    if (typeof window !== 'undefined') {
      this._onResize = () => this._checkDpr();
      window.addEventListener('resize', this._onResize);
    }
  }

  /* --------------------------------------------------------------- 공개 API */

  update({ player, enemies, turrets, portals } = {}) {
    if (!this.visible || !this.ctx || !this.canvas) return;
    // 3프레임에 한 번만 다시 그린다(≈20Hz) — 2D 캔버스 전체 redraw 는 프레임 예산을 크게 먹는다(계약 §4.62)
    this._frame = ((Math.floor(Number(this._frame) || 0) + 1) % 3);
    if (this._frame !== 0) return;

    this._checkDpr();
    this._refreshMinerals();
    if (this._staticDirty) this._bakeStatic();

    const ctx = this.ctx;
    const { w, h, cx, cy, radius } = this;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (this._static) ctx.drawImage(this._static, 0, 0, w, h);
    else {
      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.clip();

    this._drawPortals(portals);
    this._drawTurrets(turrets);
    this._drawEnemies(enemies);
    this._drawPlayer(player);

    ctx.restore();
  }

  toggle() {
    this.visible = !this.visible;
    const cls = this.canvas?.classList;
    if (cls) {
      if (this.visible) cls.remove('is-hidden');
      else cls.add('is-hidden');
    } else if (this.canvas) {
      this.canvas.style.visibility = this.visible ? '' : 'hidden';
    }
    return this.visible;
  }

  // 월드가 나중에 만들어지는 경우를 대비한 교체 지점.
  setWorld(world) {
    if (world === this.world) return this;
    this.world = world ?? null;
    this._cachedMineralCount = -1;
    this._staticDirty = true;
    return this;
  }

  dispose() {
    if (typeof window !== 'undefined' && this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
    this._onResize = null;
    this._static = null;
    this._staticCtx = null;
    this._mineralCache = [];
    this._cachedMineralCount = -1;
    this.ctx = null;
    this.canvas = null;
    this.world = null;
  }

  /* ------------------------------------------------------------ 캔버스 준비 */

  _applySize() {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = Math.min(2, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    this.dpr = dpr;
    const bw = Math.round(this.w * dpr);
    const bh = Math.round(this.h * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    this._staticDirty = true;
  }

  _checkDpr() {
    if (typeof window === 'undefined' || !this.canvas) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    if (dpr !== this.dpr) this._applySize();
  }

  /* ---------------------------------------------------------- 좌표 변환 */

  // 월드 XZ(-2500..2500) → 캔버스 논리 픽셀. -Z 가 화면 위쪽(북쪽)이다.
  _px(x) {
    return this.cx + (num(x, 0) / this.size) * this.side;
  }

  _py(z) {
    return this.cy + (num(z, 0) / this.size) * this.side;
  }

  /* ------------------------------------------------------------ 정적 레이어 */

  _terrainColor() {
    const terrain = this.world?.terrainType;
    const id = typeof terrain === 'string' ? terrain : terrain?.id;
    const color = terrain?.color ?? (id ? TERRAIN_BY_ID.get(id)?.color : null);
    return hex(color ?? 0x53803f);
  }

  _refreshMinerals() {
    const list = this.world?.minerals;
    if (!Array.isArray(list)) {
      if (this._mineralCache.length) {
        this._mineralCache = [];
        this._cachedMineralCount = -1;
        this._staticDirty = true;
      }
      return;
    }
    if (list.length === this._cachedMineralCount && !this._staticDirty) return;

    const cache = [];
    const step = list.length > 320 ? Math.ceil(list.length / 320) : 1; // 과밀하면 솎아낸다
    for (let i = 0; i < list.length; i += step) {
      const m = list[i];
      if (!m) continue;
      const x = xOf(m);
      const z = zOf(m);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const tier = num(m.tier, MINERAL_TIER_BY_ID.get(m.typeId) ?? 1);
      cache.push({
        x,
        z,
        color: TIER_COLOR[tier] ?? TIER_COLOR[1],
        r: tier >= 4 ? 2.1 : tier === 3 ? 1.7 : 1.3
      });
    }
    this._mineralCache = cache;
    this._cachedMineralCount = list.length;
    this._staticDirty = true;
  }

  _bakeStatic() {
    this._staticDirty = false;
    if (typeof document === 'undefined') return;

    if (!this._static) {
      this._static = document.createElement('canvas');
      this._staticCtx = this._static.getContext('2d');
    }
    const layer = this._static;
    const g = this._staticCtx;
    if (!layer || !g) return;

    layer.width = Math.round(this.w * this.dpr);
    layer.height = Math.round(this.h * this.dpr);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);

    const { w, h, cx, cy, radius, side } = this;
    const half = side / 2;

    g.save();
    g.beginPath();
    g.arc(cx, cy, radius, 0, TAU);
    g.clip();

    // 어두운 배경
    g.fillStyle = 'rgba(6,9,18,0.94)';
    g.fillRect(0, 0, w, h);

    // 지형 틴트
    const tint = this._terrainColor();
    const grad = g.createRadialGradient(cx, cy, radius * 0.08, cx, cy, radius);
    grad.addColorStop(0, rgba(tint, 0.32));
    grad.addColorStop(1, rgba(tint, 0.09));
    g.fillStyle = grad;
    g.fillRect(cx - half, cy - half, side, side);

    // 미묘한 격자
    g.strokeStyle = 'rgba(150,180,230,0.11)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 1; i < GRID_STEPS; i++) {
      const t = (i / GRID_STEPS) * side;
      const gx = Math.round(cx - half + t) + 0.5;
      const gy = Math.round(cy - half + t) + 0.5;
      g.moveTo(gx, cy - half);
      g.lineTo(gx, cy + half);
      g.moveTo(cx - half, gy);
      g.lineTo(cx + half, gy);
    }
    g.stroke();

    // 맵 테두리
    g.strokeStyle = 'rgba(168,128,255,0.5)';
    g.lineWidth = 1.2;
    g.strokeRect(Math.round(cx - half) + 0.5, Math.round(cy - half) + 0.5, Math.round(side), Math.round(side));

    // 채굴되지 않은 광물 (티어 색)
    const minerals = this._mineralCache;
    for (let i = 0; i < minerals.length; i++) {
      const m = minerals[i];
      const mx = this._px(m.x);
      const my = this._py(m.z);
      if (mx < cx - half - 2 || mx > cx + half + 2 || my < cy - half - 2 || my > cy + half + 2) continue;
      g.fillStyle = rgba(m.color, 0.62);
      g.beginPath();
      g.arc(mx, my, m.r, 0, TAU);
      g.fill();
    }

    // 나무/핏자국 덩어리는 가독성을 위해 의도적으로 그리지 않는다.
    g.restore();

    // 바깥 링(프레임 장식)
    g.beginPath();
    g.arc(cx, cy, radius - 0.5, 0, TAU);
    g.strokeStyle = 'rgba(240,196,105,0.32)';
    g.lineWidth = 1.4;
    g.stroke();

    // 기지 마커(파란 다이아)는 정적 위치이므로 여기서 굽는다.
    const base = this.world?.base ?? null;
    const bx = xOf(base);
    const bz = zOf(base);
    if (Number.isFinite(bx) && Number.isFinite(bz)) {
      const px = this._px(bx);
      const py = this._py(bz);
      g.save();
      g.translate(px, py);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#7fc4ff';
      g.strokeStyle = 'rgba(230,245,255,0.9)';
      g.lineWidth = 1;
      g.fillRect(-4, -4, 8, 8);
      g.strokeRect(-4, -4, 8, 8);
      g.restore();
    }
  }

  /* ------------------------------------------------------------ 동적 레이어 */

  _drawPortals(portals) {
    if (!Array.isArray(portals) || !portals.length) return;
    const ctx = this.ctx;
    for (let i = 0; i < portals.length; i++) {
      const p = portals[i];
      if (!p) continue;
      const x = xOf(p);
      const z = zOf(p);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const active = p.active !== false;
      const color = active ? hex(p.color ?? PATTERN_COLOR[p.pattern] ?? '#ff8f5c') : '#7d8798';
      const px = this._px(x);
      const py = this._py(z);

      ctx.strokeStyle = rgba(color, active ? 0.95 : 0.4);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = rgba(color, active ? 0.85 : 0.35);
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, TAU);
      ctx.fill();
    }
  }

  _drawTurrets(turrets) {
    if (!Array.isArray(turrets) || !turrets.length) return;
    const ctx = this.ctx;
    const step = turrets.length > 260 ? Math.ceil(turrets.length / 260) : 1;
    for (let i = 0; i < turrets.length; i += step) {
      const t = turrets[i];
      if (!t) continue;
      const x = xOf(t);
      const z = zOf(t);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const category = t.category ?? TURRET_BY_ID[t.typeId]?.category ?? 'attack';
      const color = CATEGORY_COLOR[category] ?? CATEGORY_COLOR.attack;
      const px = this._px(x);
      const py = this._py(z);
      const s = category === 'attack' ? 2.4 : 2.9;

      ctx.fillStyle = rgba(color, 0.92);
      ctx.fillRect(px - s / 2, py - s / 2, s, s);
    }
  }

  _drawEnemies(enemies) {
    if (!Array.isArray(enemies) || !enemies.length) return;
    const ctx = this.ctx;
    const count = Math.min(enemies.length, MAX_ENEMY_DOTS);
    const step = enemies.length > MAX_ENEMY_DOTS ? Math.ceil(enemies.length / MAX_ENEMY_DOTS) : 1;
    let drawn = 0;
    for (let i = 0; i < enemies.length && drawn < count; i += step) {
      const e = enemies[i];
      if (!e || e.alive === false) continue;
      const x = xOf(e);
      const z = zOf(e);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      drawn++;
      const px = this._px(x);
      const py = this._py(z);
      const boss = Boolean(e.isBoss);

      ctx.fillStyle = boss ? '#ff8f2a' : '#ff4d4d';
      ctx.beginPath();
      ctx.arc(px, py, boss ? 4 : 2, 0, TAU);
      ctx.fill();

      if (boss) {
        ctx.strokeStyle = 'rgba(255,143,42,0.85)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(px, py, 6.5, 0, TAU);
        ctx.stroke();
      }
    }
  }

  _drawPlayer(player) {
    if (!player) return;
    const x = xOf(player);
    const z = zOf(player);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const px = this._px(x);
    const py = this._py(z);
    const yaw = num(player.yaw, 0);

    // three.js 기준: yaw 0 → -Z(정면). 화면에서는 -Z 가 위쪽.
    const dirX = -Math.sin(yaw);
    const dirY = -Math.cos(yaw);
    const ang = Math.atan2(dirY, dirX);
    const ctx = this.ctx;

    // 시야 콘
    ctx.fillStyle = 'rgba(150,220,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, 17, ang - VIEW_CONE, ang + VIEW_CONE);
    ctx.closePath();
    ctx.fill();

    // 화살표
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.6, 5);
    ctx.lineTo(0, 2.6);
    ctx.lineTo(-4.6, 5);
    ctx.closePath();
    ctx.fillStyle = '#eaf3ff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(106,212,255,0.95)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

export default Minimap;

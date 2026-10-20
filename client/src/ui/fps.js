// ui/fps.js — 프레임 그래프 + 프레임 프리셋 적용기.
// 2D 캔버스만 사용한다 (three import 금지). 계약: docs/CONTRACT.md §4.13
//
// 주의: antialias(MSAA)는 WebGLRenderer 생성 시에만 정할 수 있어 런타임에 바꿀 수 없다.
//       applyFramePreset() 은 pixelRatio / shadowMap / fog 만 실제로 바꾸고,
//       antialias 는 "적용 불가" 로 정직하게 보고한다 (있는 척하지 않는다).

const SAMPLES = 120; // 롤링 그래프 샘플 수
const SAMPLE_INTERVAL = 0.1; // 초 — 120 * 0.1 = 약 12초 이력
const GRAPH_MAX_FPS = 120; // 그래프 상한
const FPS_GOOD = 40; // 이 이상이면 초록
const FPS_WARN = 25; // 이 이상이면 주황, 미만이면 빨강

const COLOR_GOOD = '#6fd97a';
const COLOR_WARN = '#ffb45c';
const COLOR_BAD = '#ff5f5f';

function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export class FPSMonitor {
  constructor({ canvas } = {}) {
    this.canvas = canvas ?? null;
    this.ctx = canvas?.getContext?.('2d') ?? null;

    // 논리 좌표는 캔버스 속성(기본 170x52)을 그대로 쓴다. 표시 크기는 CSS가 담당.
    this.w = Number(canvas?.getAttribute?.('width')) || 170;
    this.h = Number(canvas?.getAttribute?.('height')) || 52;
    this.dpr = 1;

    // 링 버퍼
    this._samples = new Array(SAMPLES).fill(0);
    this._head = 0; // 다음에 쓸 위치
    this._count = 0;
    this._acc = 0;
    this._frames = 0;
    this._emaFps = 0;
    this._lastFrameMs = 0;
    this._presetName = '기본';
    this._info = null; // setInfo({ enemies, turrets, drawCalls })
    this._dirty = true;

    this._onResize = null;
    this._applySize();
    if (typeof window !== 'undefined') {
      this._onResize = () => this._checkDpr();
      window.addEventListener('resize', this._onResize);
    }
  }

  /* --------------------------------------------------------------- 공개 API */

  update(dt) {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 1) : 0;
    if (step <= 0) return;

    this._checkDpr();

    this._lastFrameMs = step * 1000;
    const instant = 1 / step;
    this._emaFps = this._emaFps > 0 ? this._emaFps * 0.88 + instant * 0.12 : instant;

    this._acc += step;
    this._frames++;
    if (this._acc >= SAMPLE_INTERVAL) {
      // 샘플 구간 평균 = 튀는 값에 흔들리지 않는 실제 FPS
      const fps = this._frames / this._acc;
      this._samples[this._head] = fps;
      this._head = (this._head + 1) % SAMPLES;
      if (this._count < SAMPLES) this._count++;
      this._acc = 0;
      this._frames = 0;
      this._dirty = true;
    }

    if (this._dirty) {
      this._draw();
      this._dirty = false;
    }
  }

  // 그래프 라벨(프리셋 이름)과 부가 정보를 지정한다.
  setPreset(name) {
    const label = name == null ? '기본' : String(name);
    if (label !== this._presetName) {
      this._presetName = label;
      this._dirty = true;
    }
    return this;
  }

  setInfo(info) {
    if (!info || typeof info !== 'object') {
      this._info = null;
      return this;
    }
    this._info = {
      enemies: Number.isFinite(info.enemies) ? info.enemies : null,
      turrets: Number.isFinite(info.turrets) ? info.turrets : null,
      drawCalls: Number.isFinite(info.drawCalls) ? info.drawCalls : null,
      scale: Number.isFinite(info.scale) ? info.scale : (this._info?.scale ?? null)
    };
    if (info.preset != null) this.setPreset(info.preset);
    return this;
  }

  get fps() {
    return this._count > 0 ? this._lastSample() : this._emaFps;
  }

  get history() {
    const out = [];
    for (let i = 0; i < this._count; i++) {
      out.push(this._samples[(this._head - this._count + i + SAMPLES * 2) % SAMPLES]);
    }
    return out;
  }

  get frameMs() {
    return this._lastFrameMs;
  }

  get averageFps() {
    if (!this._count) return this._emaFps;
    let sum = 0;
    for (let i = 0; i < this._count; i++) sum += this._sampleAt(i);
    return sum / this._count;
  }

  get minFps() {
    if (!this._count) return this._emaFps;
    let min = Infinity;
    for (let i = 0; i < this._count; i++) {
      const v = this._sampleAt(i);
      if (v < min) min = v;
    }
    return Number.isFinite(min) ? min : 0;
  }

  dispose() {
    if (typeof window !== 'undefined' && this._onResize) {
      window.removeEventListener('resize', this._onResize);
    }
    this._onResize = null;
    this._samples.length = 0;
    this._count = 0;
    this._head = 0;
    this._info = null;
    this.ctx = null;
    this.canvas = null;
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
    this._dirty = true;
  }

  _checkDpr() {
    if (typeof window === 'undefined' || !this.canvas) return;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    if (dpr !== this.dpr) this._applySize();
  }

  /* ----------------------------------------------------------------- 내부 */

  _sampleAt(i) {
    // i = 0 이 가장 오래된 샘플
    return this._samples[(this._head - this._count + i + SAMPLES * 2) % SAMPLES];
  }

  _lastSample() {
    return this._samples[(this._head - 1 + SAMPLES) % SAMPLES];
  }

  _lineColor(fps) {
    if (fps < FPS_WARN) return COLOR_BAD;
    if (fps < FPS_GOOD) return COLOR_WARN;
    return COLOR_GOOD;
  }

  _draw() {
    const ctx = this.ctx;
    if (!ctx) return;

    const { w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 배경 (CSS 프레임 안쪽을 살짝 채운다)
    ctx.fillStyle = 'rgba(6,9,18,0.55)';
    ctx.fillRect(0, 0, w, h);

    const fps = this.fps;
    const avg = this.averageFps;
    const min = this.minFps;
    const color = this._lineColor(fps);

    // --- 그래프 영역 ---
    const gx = 3;
    const gy = 13;
    const gw = w - 6;
    const gh = 21;
    const bottom = gy + gh;

    ctx.fillStyle = 'rgba(4,7,14,0.6)';
    ctx.fillRect(gx, gy, gw, gh);

    // 60 / 30 기준선
    ctx.strokeStyle = 'rgba(150,180,230,0.11)';
    ctx.lineWidth = 1;
    for (const ref of [60, 30]) {
      const y = Math.round(bottom - (clamp(ref, 0, GRAPH_MAX_FPS) / GRAPH_MAX_FPS) * gh) + 0.5;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + gw, y);
      ctx.stroke();
    }

    // 라인 + 아래 채움
    if (this._count > 1) {
      const n = this._count;
      const dx = gw / Math.max(1, SAMPLES - 1);
      const startX = gx + Math.max(0, SAMPLES - n) * dx;

      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v = clamp(this._sampleAt(i), 0, GRAPH_MAX_FPS);
        const x = startX + i * dx;
        const y = bottom - (v / GRAPH_MAX_FPS) * gh;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.lineTo(startX + (n - 1) * dx, bottom);
      ctx.lineTo(startX, bottom);
      ctx.closePath();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // --- 텍스트 ---
    ctx.font = '700 10px "Malgun Gothic", system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(233,238,251,0.92)';
    const label = this._presetName.length > 10 ? `${this._presetName.slice(0, 9)}…` : this._presetName;
    ctx.fillText(label, 4, 10);

    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.fillText(`${Math.round(fps)} FPS`, w - 4, 10);

    ctx.font = '400 9px "Malgun Gothic", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(169,184,212,0.85)';
    ctx.fillText(`${this._lastFrameMs.toFixed(1)}ms 평균 ${Math.round(avg)} 최소 ${Math.round(min)}`, 4, h - 4);

    const info = this._info;
    if (info && (info.enemies != null || info.turrets != null || info.drawCalls != null)) {
      const parts = [];
      if (info.enemies != null) parts.push(`적 ${num(info.enemies, 0)}`);
      if (info.turrets != null) parts.push(`탑 ${num(info.turrets, 0)}`);
      if (info.drawCalls != null) parts.push(`드로 ${num(info.drawCalls, 0)}`);
      if (info.scale != null && info.scale < 0.999) parts.push('해상도 ' + Math.round(info.scale * 100) + '%');
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(169,184,212,0.7)';
      ctx.fillText(parts.join(' '), w - 4, h - 4);
    }
  }
}

/* --------------------------------------------------------- 프레임 프리셋 적용 */

/**
 * FRAME_PRESETS 항목을 렌더러/씬에 적용하고 한국어 요약을 돌려준다.
 * - pixelRatio, shadowMap.enabled, (scene 이 있으면) fog.near/far 만 바꾼다.
 * - antialias 는 WebGLRenderer 생성 시 고정되므로 런타임 변경 불가 → 요약에 표기만 한다.
 * - 절대 throw 하지 않는다 (renderer 가 불완전해도 요약 문자열을 돌려준다).
 */
export function applyFramePreset(renderer, preset, scene) {
  if (!preset || typeof preset !== 'object') return '프리셋 정보가 없어 적용하지 못했습니다.';

  const name = preset.name ?? preset.id ?? '프리셋';
  const changes = [];
  const skipped = [];

  try {
    if (renderer && typeof renderer.setPixelRatio === 'function') {
      // 생성 시점(main.js)과 같은 규칙: devicePixelRatio 를 넘겨 그리지 않는다(계약 §4.62)
      const dpr = (typeof window !== "undefined" && Number(window.devicePixelRatio)) || 1;
      const pr = clamp(Math.min(num(preset.pixelRatio, 1), dpr), 0.5, 3);
      renderer.setPixelRatio(pr);
      changes.push(`픽셀 비율 ${pr}`);
    } else {
      skipped.push('픽셀 비율');
    }

    if (renderer?.shadowMap) {
      const on = Boolean(preset.shadow);
      renderer.shadowMap.enabled = on;
      renderer.shadowMap.needsUpdate = true; // 그림자 맵 즉시 재생성
      changes.push(on ? '그림자 켬' : '그림자 끔');
    } else {
      skipped.push('그림자');
    }

    if (scene && preset.fog) {
      const fog = scene.fog;
      if (fog && typeof fog === 'object') {
        const near = num(preset.fog.near, num(fog.near, 0));
        const far = num(preset.fog.far, num(fog.far, 0));
        fog.near = near;
        fog.far = far;
        changes.push(`안개 ${Math.round(near)}~${Math.round(far)}`);
      } else {
        skipped.push('안개(씬에 fog 없음)');
      }
    } else if (preset.fog && !scene) {
      skipped.push('안개(씬 미지정)');
    }
  } catch (err) {
    return `${name} 적용 중 오류가 발생했습니다.`;
  }

  const head = `${name} 적용`;
  const applied = changes.length ? `: ${changes.join(', ')}` : ': 변경된 항목 없음';
  const note = skipped.length ? ` (${skipped.join(', ')} 제외 · 안티앨리어싱은 재시작 필요)` : ' (안티앨리어싱은 재시작 필요)';
  return `${head}${applied}${note}`;
}

export default FPSMonitor;

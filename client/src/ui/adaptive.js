// 적응형 해상도 + 자동 품질 — 순수 로직(THREE/DOM 없음).
// 프레임이 목표에 못 미치면 렌더 해상도(픽셀 비율)를 낮추고, 여유가 생기면 되돌린다.

/**
 * 프리셋 비용 순서(가벼운 것 → 무거운 것).
 * FRAME_PRESETS 선언 순서는 비용 순서가 아니다 — 그대로 쓰면 저전력 다음이 무제한(가장 무거움)이 되어
 * 자동 하향이 오히려 성능을 떨어뜨린다. 그래서 사다리를 따로 둔다.
 */
export const PRESET_LADDER = ['speed', 'battery', 'performance', 'balanced', 'ultra', 'unlimited'];

/** 적응형 해상도 기본값 */
export const ADAPTIVE = {
  enabled: true,
  /** 렌더 해상도 하한(픽셀 비율 배수) — preset.pixelRatio 에 곱한다 */
  minScale: 0.55,
  /** 목표 FPS — 이보다 낮으면 해상도를 내린다 */
  lowFps: 50,
  /** 이보다 높으면 다시 올린다 */
  highFps: 58,
  /** 한 번에 바꾸는 비율 */
  step: 0.08,
  /** 측정·조정 주기(초) */
  interval: 1.5,
  /** 시작 후 유예(초) — 셰이더 컴파일/월드 스트리밍 구간은 무시한다 */
  warmup: 3,
  /** 자동 품질 하향 임계 FPS */
  downgradeFps: 42,
  /** 자동 품질 판정 시점(초) */
  downgradeAt: 6,
  /** 자동 품질 재판정 주기(초) — 한 번만 내리는 게 아니라 계속 지켜본다 */
  qualityInterval: 12,
  /** 이 FPS 를 넘으면 한 단계 되올린다(사용자가 고른 단계까지만) */
  recoverFps: 58,
  /** 메모리 경고 임계(MB, Chrome 전용 performance.memory) */
  memoryWarnMb: 900,
  /** 경고를 다시 띄우기까지의 최소 간격(초) */
  memoryCooldown: 120
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 다음 픽셀 비율 배수를 계산한다(순수 함수).
 * @returns {number} 0(변화 없음) 또는 새 배수
 */
export function nextPixelScale({ current, avgFps, lowFps = ADAPTIVE.lowFps, highFps = ADAPTIVE.highFps, step = ADAPTIVE.step, minScale = ADAPTIVE.minScale }) {
  const scale = clamp(Number(current) || 1, minScale, 1);
  const fps = Number(avgFps);
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  if (fps < lowFps) return Math.max(minScale, Number((scale - step).toFixed(3)));
  if (fps > highFps) return Math.min(1, Number((scale + step).toFixed(3)));
  return 0;
}

/**
 * 자동 품질 하향 — 프레임이 계속 낮으면 한 단계 낮은 프리셋을 제안한다(순수 함수).
 * @param {number} avgFps
 * @param {Array} presets FRAME_PRESETS
 * @param {string} currentId
 * @returns {string|null} 바꿀 프리셋 id 또는 null
 */
/** 비용 순 사다리에서 현재 위치(없으면 -1). */
export function ladderIndex(presets, id) {
  const known = new Set((Array.isArray(presets) ? presets : []).map((p) => p && p.id).filter(Boolean));
  const ladder = PRESET_LADDER.filter((pid) => known.has(pid));
  // 사다리에 없는 프리셋이 섞여 있으면 선언 순서 뒤에 붙인다(안전한 기본값)
  for (const p of Array.isArray(presets) ? presets : []) {
    if (p && p.id && !ladder.includes(p.id)) ladder.push(p.id);
  }
  return ladder.indexOf(String(id ?? ''));
}

/** 한 단계 낮은(더 가벼운) 프리셋 id — 이미 가장 가벼우면 null. */
export function stepDownId(presets, currentId) {
  const idx = ladderIndex(presets, currentId);
  if (idx <= 0) return null;
  const known = new Set((Array.isArray(presets) ? presets : []).map((p) => p && p.id));
  const ladder = PRESET_LADDER.filter((pid) => known.has(pid));
  return ladder[idx - 1] ?? null;
}

/**
 * 한 단계 높은(더 무거운) 프리셋 id — target(사용자가 고른 단계)보다 높아지지 않는다.
 * target 이 없으면 한 단계 위까지만 올린다.
 */
export function stepUpId(presets, currentId, targetId = null) {
  const known = new Set((Array.isArray(presets) ? presets : []).map((p) => p && p.id));
  const ladder = PRESET_LADDER.filter((pid) => known.has(pid));
  const idx = ladder.indexOf(String(currentId ?? ''));
  if (idx < 0 || idx >= ladder.length - 1) return null;
  const next = ladder[idx + 1];
  const cap = targetId ? ladder.indexOf(String(targetId)) : -1;
  if (cap >= 0 && ladder.indexOf(next) > cap) return null;   // 사용자가 고른 단계를 넘지 않는다
  return next;
}

/**
 * 자동 품질 하향 — 프레임이 계속 낮으면 한 단계 가벼운 프리셋을 제안한다(순수 함수).
 * 비용 사다리(PRESET_LADDER)를 따르므로 저전력 → 무제한 같은 역방향 하향이 없다.
 */
export function suggestPreset(avgFps, presets, currentId, { minFps = ADAPTIVE.downgradeFps } = {}) {
  const fps = Number(avgFps);
  if (!Number.isFinite(fps) || fps <= 0 || fps >= minFps) return null;
  return stepDownId(presets, currentId);
}

/** 사람이 읽는 MB 표기 */
export function formatMb(bytes) {
  const mb = Number(bytes) / 1048576;
  if (!Number.isFinite(mb) || mb <= 0) return '-';
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}

/**
 * 메모리 감시 — 오래 켜 두면 느려지는 문제를 사용자가 알 수 있게 경고한다(강제 GC 는 브라우저가 막는다).
 * performance.memory 는 Chrome 계열에만 있다. 없으면 아무 일도 하지 않는다.
 */
export class MemoryGuard {
  constructor({ warnMb = ADAPTIVE.memoryWarnMb, cooldown = ADAPTIVE.memoryCooldown, reader = null } = {}) {
    this.warnMb = Number(warnMb) || 0;
    this.cooldown = Number(cooldown) || 0;
    this.reader = reader;
    this.warnings = 0;
    this.peakMb = 0;
    this._acc = 0;
    this._lastWarnAt = -Infinity;
    this._elapsed = 0;
  }

  /** 현재 JS 힙(MB). 알 수 없으면 0. */
  usedMb() {
    try {
      const m = this.reader ? this.reader() : (typeof performance !== 'undefined' ? performance.memory : null);
      const bytes = Number(m?.usedJSHeapSize);
      return Number.isFinite(bytes) && bytes > 0 ? bytes / 1048576 : 0;
    } catch {
      return 0;
    }
  }

  /** 매 프레임 호출 — 0.5초에 한 번 확인한다. 경고했으면 { warn:true, mb } 를 돌려준다. */
  sample(dt) {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.5) : 0;
    this._elapsed += step;
    this._acc += step;
    if (this._acc < 0.5) return { warn: false, mb: 0 };
    this._acc = 0;
    const mb = this.usedMb();
    if (!mb) return { warn: false, mb: 0 };
    if (mb > this.peakMb) this.peakMb = mb;
    if (mb < this.warnMb) return { warn: false, mb };
    if (this._elapsed - this._lastWarnAt < this.cooldown) return { warn: false, mb };
    this._lastWarnAt = this._elapsed;
    this.warnings += 1;
    return { warn: true, mb };
  }

  reset() {
    this.warnings = 0;
    this.peakMb = 0;
    this._acc = 0;
    this._lastWarnAt = -Infinity;
    this._elapsed = 0;
    return true;
  }
}

/** 사람이 읽는 배율 표기 */
export function formatScale(scale) {
  return `${Math.round((Number(scale) || 1) * 100)}%`;
}

/**
 * 적응형 해상도 컨트롤러 — renderer 와 프리셋만 알면 동작한다(DOM 비의존).
 * renderer 가 없거나 setPixelRatio 가 없으면 아무 일도 하지 않는다.
 */
export class AdaptiveResolution {
  constructor({ renderer = null, preset = null, config = ADAPTIVE, onChange = null } = {}) {
    this.renderer = renderer;
    this.preset = preset;
    this.config = { ...ADAPTIVE, ...(config || {}) };
    this.onChange = onChange;
    this.scale = 1;
    this._acc = 0;
    this._warm = 0;
    this.changes = 0;
    this.lastApplied = 0;
  }

  get baseRatio() {
    const presetRatio = Math.max(0.5, Number(this.preset?.pixelRatio) || 1);
    // 초기 렌더러와 같은 규칙 — devicePixelRatio 를 넘겨 그리지 않는다(계약 §4.62).
    //  이 clamp 가 없으면 dpr=1 화면에서 preset 1.5 × scale 0.68 = 1.02 로 오히려 해상도가 올라간다.
    const dpr = (typeof window !== 'undefined' && Number(window.devicePixelRatio)) || 1;
    return Math.max(0.5, Math.min(presetRatio, dpr));
  }

  /** 실제 적용될 픽셀 비율 */
  get pixelRatio() {
    return Math.max(0.35, this.baseRatio * this.scale);
  }

  setPreset(preset) {
    this.preset = preset;
    this.scale = 1;
    this._acc = 0;
    this.apply();
  }

  apply() {
    const r = this.renderer;
    if (!r || typeof r.setPixelRatio !== 'function') return this.pixelRatio;
    const pr = this.pixelRatio;
    r.setPixelRatio(pr);
    this.lastApplied = pr;
    return pr;
  }

  /**
   * 매 프레임 호출. interval 마다 평균 FPS 를 보고 배율을 조정한다.
   * @returns {{changed:boolean, scale:number, pixelRatio:number}}
   */
  update(dt, avgFps) {
    const cfg = this.config;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.5) : 0;
    if (!cfg.enabled) return { changed: false, scale: this.scale, pixelRatio: this.pixelRatio };
    if (this._warm < cfg.warmup) {
      this._warm += step;
      return { changed: false, scale: this.scale, pixelRatio: this.pixelRatio };
    }
    this._acc += step;
    if (this._acc < cfg.interval) return { changed: false, scale: this.scale, pixelRatio: this.pixelRatio };
    this._acc = 0;
    const next = nextPixelScale({ current: this.scale, avgFps, ...cfg });
    if (!next || next === this.scale) return { changed: false, scale: this.scale, pixelRatio: this.pixelRatio };
    this.scale = next;
    this.changes += 1;
    this.apply();
    this.onChange?.({ scale: this.scale, pixelRatio: this.pixelRatio, changes: this.changes, avgFps });
    return { changed: true, scale: this.scale, pixelRatio: this.pixelRatio };
  }
}

export default AdaptiveResolution;

// 요새의 수호자 — 가챠/스킬 컷씬.
// 계약 §4.13: playCutscene({ grade, element, name, scene, camera, duration }) -> Promise<void>
// 전용 CSS 클래스(.cutscene, .cutscene-card, .cutscene-grade)를 쓰고, 동적 효과만 인라인 스타일로 그린다.
import { SPELL_GRADES, SPELL_ELEMENTS } from '../data.js';

const GRADE_BY_ID = {};
for (const g of SPELL_GRADES) GRADE_BY_ID[g.id] = g;

const ELEMENT_BY_ID = {};
for (const e of SPELL_ELEMENTS) ELEMENT_BY_ID[e.id] = e;

const FLAVOUR = {
  common: '평범한 마법이 펼쳐진다.',
  uncommon: '고급 마법이 은은하게 빛난다.',
  rare: '희귀한 마법이 공간을 가른다.',
  epic: '영웅급 마법이 폭발한다!',
  legendary: '전설의 마법이 세계를 흔든다!',
  mythic: '신화급 마법 — 세계가 멈춘다.',
  relic: '유물의 힘이 세계의 법칙을 건드린다.'
};

// 타입별 연출 파라미터
const PARAMS = {
  flash: { particles: 14, speed: 360, size: 6, glow: 1.6, shake: 0.12, shakeRatio: 0.18, rays: 0, rings: 0, bars: false },
  burst: { particles: 46, speed: 640, size: 9, glow: 2.0, shake: 0.5, shakeRatio: 0.32, rays: 0, rings: 0, bars: false },
  cinematic: { particles: 22, speed: 220, size: 5, glow: 1.4, shake: 0.06, shakeRatio: 0.2, rays: 28, rings: 0, bars: true },
  relic: { particles: 64, speed: 420, size: 8, glow: 2.6, shake: 0.8, shakeRatio: 1, rays: 40, rings: 3, bars: false }
};

const GOLD = '#ffd76a';
const WHITE = '#ffffff';

let activeHandle = null;

function nowMs() {
  const perf = globalThis.performance;
  return perf && typeof perf.now === 'function' ? perf.now() : Date.now();
}

function cssColor(c, fallback = '#bfc7cc') {
  if (typeof c === 'string' && c) return c;
  if (typeof c === 'number' && Number.isFinite(c)) return '#' + (Math.round(c) >>> 0).toString(16).padStart(6, '0').slice(-6);
  return fallback;
}

function ensureRoot(doc, id) {
  let el = doc.getElementById(id);
  if (!el) {
    el = doc.createElement('div');
    el.id = id;
    const host = doc.getElementById('app') || doc.body;
    if (host) host.appendChild(el);
  }
  return el || null;
}

function resolveGrade(grade) {
  if (grade && typeof grade === 'object') {
    return Object.assign({ id: 'custom', name: '마법', cutscene: 'burst', color: 0xbfc7cc, glow: 0x333a40 }, grade);
  }
  return GRADE_BY_ID[String(grade === undefined || grade === null ? 'common' : grade)] || GRADE_BY_ID.common;
}

function resolveElement(element) {
  if (element && typeof element === 'object') return element;
  if (typeof element === 'string' && ELEMENT_BY_ID[element]) return ELEMENT_BY_ID[element];
  return null;
}

/**
 * 등급별 컷씬을 재생한다. common(none) 은 즉시 resolve.
 * 오류가 나도 오버레이는 try/finally 로 반드시 정리되고 Promise 는 항상 resolve 된다.
 */
export function playCutscene({ grade, element, name, scene, camera, duration } = {}) {
  void scene; // 씬은 직접 건드리지 않는다 (셰이크는 카메라/오버레이로만)
  return new Promise((resolve) => {
    let handle = null;
    let timer = null;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      const current = handle;
      if (current && activeHandle === current) activeHandle = null;
      try {
        current?.dispose();
      } finally {
        resolve();
      }
    };

    try {
      const doc = globalThis.document;
      const g = resolveGrade(grade);
      const raw = duration === undefined || duration === null ? 1800 : Number(duration);
      const ms = Number.isFinite(raw) ? Math.max(0, raw) : 1800;
      if (!doc || g.cutscene === 'none' || ms <= 0) {
        finish();
        return;
      }
      const root = ensureRoot(doc, 'cutscene-root');
      if (!root) {
        finish();
        return;
      }
      // 이전 컷씬이 남아 있으면 즉시 정리한다.
      if (activeHandle && typeof activeHandle.cancel === 'function') {
        try {
          activeHandle.cancel();
        } catch {
          /* 무시 */
        }
      }
      handle = buildOverlay({ doc, root, grade: g, element: resolveElement(element), name, camera, duration: ms });
      handle.cancel = finish;
      activeHandle = handle;
      timer = setTimeout(finish, ms);
    } catch (err) {
      try {
        console.warn('[cutscene] 재생 실패', err);
      } catch {
        /* 무시 */
      }
      finish();
    }
  });
}

/** R키 스킬용 짧은 연출. */
export function playSkillCutscene(name, color) {
  const c = typeof color === 'number' || typeof color === 'string' ? color : 0xc9b8ff;
  return playCutscene({
    grade: { id: 'skill', name: '스킬', label: '스킬 발동', cutscene: 'burst', color: c, glow: c },
    name: name || '스킬',
    duration: 1200
  });
}

function buildOverlay({ doc, root, grade, element, name, camera, duration }) {
  const type = PARAMS[grade.cutscene] ? grade.cutscene : 'flash';
  const p = PARAMS[type];
  const gradeColor = cssColor(grade.color, '#bfc7cc');
  const glowColor = cssColor(grade.glow, gradeColor);
  const elColor = cssColor(element?.color, gradeColor);
  const label = grade.label || `${grade.name} 등급`;
  const flavour = grade.flavour || FLAVOUR[grade.id] || FLAVOUR[grade.cutscene] || '마법이 펼쳐진다.';
  const spellName = name || '알 수 없는 마법';

  const wrap = doc.createElement('div');
  // The stylesheet uses .cutscene-burst / .cutscene-flash as child decor,
  // so the cutscene type is only flagged with is-* state classes here.
  wrap.className = `cutscene is-${type}`;
  wrap.dataset.grade = String(grade.id);
  wrap.dataset.cutscene = type;
  applyStyle(wrap, {
    position: 'fixed',
    inset: '0',
    zIndex: '9999',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    background:
      type === 'relic'
        ? 'radial-gradient(circle at 50% 50%, rgba(136,204,255,0.26), rgba(2,3,8,0.9) 62%)'
        : type === 'cinematic'
          ? 'rgba(2,3,8,0.9)'
          : 'rgba(2,3,8,0.72)'
  });

  const layers = {};

  // Stylesheet-driven radial burst decor (invisible when no such rule exists).
  if (type === 'burst' || type === 'relic' || type === 'flash') {
    const burst = doc.createElement('div');
    burst.className = 'cutscene-burst';
    applyStyle(burst, { left: '50%', top: '50%', marginLeft: '-20vmin', marginTop: '-20vmin' });
    wrap.appendChild(burst);
  }

  // 1) 화면 플래시 / 화이트아웃
  const flash = doc.createElement('div');
  flash.className = 'cutscene-flash';
  const flashColor = type === 'relic' ? WHITE : type === 'cinematic' ? '#05060a' : type === 'burst' ? WHITE : elColor;
  applyStyle(flash, { position: 'absolute', inset: '0', background: flashColor, opacity: '0' });
  wrap.appendChild(flash);
  layers.flash = flash;

  // 2) 시네마틱 레터박스
  if (p.bars) {
    const top = doc.createElement('div');
    const bottom = doc.createElement('div');
    for (const el of [top, bottom]) {
      el.className = 'cutscene-bar';
      applyStyle(el, { position: 'absolute', left: '0', right: '0', height: '0%', background: '#000' });
    }
    applyStyle(top, { top: '0' });
    applyStyle(bottom, { bottom: '0' });
    wrap.appendChild(top);
    wrap.appendChild(bottom);
    layers.bars = [top, bottom];
  }

  // 3) 회전 광선
  const rays = [];
  if (p.rays) {
    for (let i = 0; i < 2; i++) {
      const ray = doc.createElement('div');
      ray.className = 'cutscene-ray';
      applyStyle(ray, {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: '180vmax',
        height: '180vmax',
        marginLeft: '-90vmax',
        marginTop: '-90vmax',
        borderRadius: '50%',
        opacity: String(0.18 + i * 0.1),
        background: `repeating-conic-gradient(from 0deg, ${i ? glowColor : elColor} 0deg 5deg, rgba(0,0,0,0) 5deg 22deg)`,
        willChange: 'transform'
      });
      wrap.appendChild(ray);
      rays.push({ el: ray, dir: i ? -1 : 1, speed: i ? 26 : 42 });
    }
  }
  layers.rays = rays;

  // 4) 유물 룬 링
  const rings = [];
  for (let i = 0; i < p.rings; i++) {
    const ring = doc.createElement('div');
    ring.className = 'cutscene-ring';
    const size = 34 + i * 20;
    applyStyle(ring, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: `${size}vmax`,
      height: `${size}vmax`,
      marginLeft: `${-size / 2}vmax`,
      marginTop: `${-size / 2}vmax`,
      borderRadius: '50%',
      border: `${2 + i}px ${i % 2 ? 'dashed' : 'solid'} ${i === 1 ? GOLD : gradeColor}`,
      boxShadow: `0 0 26px ${glowColor} inset`,
      opacity: '0.75',
      willChange: 'transform'
    });
    wrap.appendChild(ring);
    rings.push({ el: ring, dir: i % 2 ? -1 : 1, speed: 30 + i * 22 });
  }
  layers.rings = rings;

  // 5) 방사형 입자
  const particleLayer = doc.createElement('div');
  particleLayer.className = 'cutscene-particles';
  applyStyle(particleLayer, { position: 'absolute', inset: '0' });
  wrap.appendChild(particleLayer);
  const particles = [];
  for (let i = 0; i < p.particles; i++) {
    const size = p.size * (0.5 + Math.random());
    const el = doc.createElement('div');
    el.className = 'cutscene-particle';
    applyStyle(el, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: `${size}px`,
      height: `${size}px`,
      marginLeft: `${-size / 2}px`,
      marginTop: `${-size / 2}px`,
      borderRadius: '50%',
      background: type === 'relic' ? GOLD : type === 'burst' ? elColor : WHITE,
      boxShadow: `0 0 ${size * p.glow}px ${glowColor}`,
      willChange: 'transform, opacity'
    });
    particleLayer.appendChild(el);
    particles.push({
      el,
      angle: (i / p.particles) * Math.PI * 2 + Math.random() * 0.5,
      speed: p.speed * (0.55 + Math.random() * 0.95),
      swirl: (Math.random() - 0.5) * 1.4
    });
  }
  layers.particles = particles;

  // 6) 이름 카드
  const card = doc.createElement('div');
  card.className = 'cutscene-card cutscene-core';
  applyStyle(card, {
    position: 'relative',
    maxWidth: 'min(88vw, 720px)',
    textAlign: 'center',
    opacity: '0'
  });
  const gradeEl = doc.createElement('div');
  gradeEl.className = 'cutscene-grade';
  gradeEl.textContent = label;
  applyStyle(gradeEl, { color: gradeColor });
  const nameEl = doc.createElement('div');
  nameEl.className = 'cutscene-name';
  nameEl.textContent = spellName;
  const elementEl = doc.createElement('div');
  elementEl.className = 'cutscene-element';
  elementEl.textContent = element ? `${element.name} · ${element.desc || ''}`.trim() : '';
  const flavourEl = doc.createElement('div');
  flavourEl.className = 'cutscene-flavour';
  flavourEl.textContent = flavour;
  card.appendChild(gradeEl);
  card.appendChild(nameEl);
  if (elementEl.textContent) card.appendChild(elementEl);
  card.appendChild(flavourEl);
  wrap.appendChild(card);
  layers.card = card;

  root.appendChild(wrap);

  // ── 애니메이션 ──────────────────────────────────
  const raf = typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame.bind(globalThis) : null;
  const cancelRaf = typeof globalThis.cancelAnimationFrame === 'function' ? globalThis.cancelAnimationFrame.bind(globalThis) : null;
  const start = nowMs();
  const shakeMs = Math.max(120, p.shakeRatio * duration);
  const camBase =
    camera && camera.position && Number.isFinite(camera.position.x)
      ? { x: camera.position.x, y: camera.position.y, z: camera.position.z }
      : null;
  let frame = 0;

  const tick = () => {
    frame = 0;
    const t = nowMs() - start;
    const k = duration > 0 ? Math.min(1, t / duration) : 1;

    // 플래시: 빠르게 사라진다
    const flashCurve = type === 'relic' ? Math.max(0, 1 - k * 3.2) : Math.max(0, 1 - k * 2.1);
    flash.style.opacity = String(flashCurve * (type === 'cinematic' ? 0.9 : 1));

    // 레터박스
    if (layers.bars) {
      const height = `${(12 * Math.sin(Math.PI * Math.min(1, k * 1.05))).toFixed(2)}%`;
      for (const bar of layers.bars) bar.style.height = height;
    }

    // 광선/룬 링 회전
    for (const ray of layers.rays) {
      const deg = (t / 1000) * ray.speed * ray.dir;
      ray.el.style.transform = `rotate(${deg.toFixed(2)}deg) scale(${(0.85 + 0.35 * Math.sin(t / 420)).toFixed(3)})`;
    }
    for (const ring of layers.rings) {
      const deg = (t / 1000) * ring.speed * ring.dir;
      const scale = 0.7 + 0.5 * Math.min(1, t / (duration * 0.6));
      ring.el.style.transform = `rotate(${deg.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      ring.el.style.opacity = String(Math.max(0, 0.8 - k * 0.6));
    }

    // 입자
    for (const part of layers.particles) {
      const angle = part.angle + part.swirl * k;
      const dist = part.speed * (t / 1000) * (type === 'cinematic' ? 0.6 : 1);
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist * (type === 'burst' ? 0.85 : 1);
      part.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${Math.max(0.2, 1 - k * 0.55).toFixed(3)})`;
      part.el.style.opacity = String(Math.max(0, 1 - k * (type === 'relic' ? 0.75 : 1.05)));
    }

    // 흔들림 (오버레이 + 카메라)
    const shakeLeft = t < shakeMs ? 1 - t / shakeMs : 0;
    const amp = p.shake * shakeLeft * (type === 'relic' ? 1 : 1 - k * 0.5);
    const dx = Math.sin(t * 0.045) * amp * 26;
    const dy = Math.cos(t * 0.061) * amp * 22;
    wrap.style.transform = amp > 0.001 ? `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` : '';
    if (camBase) {
      if (amp > 0.001) {
        camera.position.x = camBase.x + dx * 0.02;
        camera.position.y = camBase.y + dy * 0.02;
      } else {
        camera.position.x = camBase.x;
        camera.position.y = camBase.y;
      }
    }

    // 카드: 페이드 인 → 유지 → 페이드 아웃
    const cardOpacity = k < 0.18 ? k / 0.18 : k > 0.82 ? Math.max(0, (1 - k) / 0.18) : 1;
    layers.card.style.opacity = String(Math.max(0, Math.min(1, cardOpacity)));
    layers.card.style.transform = `scale(${(0.94 + 0.1 * Math.min(1, k * 3)).toFixed(3)})`;

    if (t < duration && raf) frame = raf(tick);
  };

  if (raf) frame = raf(tick);
  else tick();

  const dispose = () => {
    if (frame && cancelRaf) {
      try {
        cancelRaf(frame);
      } catch {
        /* 무시 */
      }
    }
    frame = 0;
    if (camBase && camera && camera.position) {
      camera.position.x = camBase.x;
      camera.position.y = camBase.y;
      camera.position.z = camBase.z;
    }
    try {
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      else wrap.remove?.();
    } catch {
      /* 무시 */
    }
  };

  return { dispose, node: wrap };
}

function applyStyle(el, styles) {
  for (const key of Object.keys(styles)) {
    try {
      el.style[key] = styles[key];
    } catch {
      /* 무시 */
    }
  }
}

export default { playCutscene, playSkillCutscene };

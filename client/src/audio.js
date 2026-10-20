// 요새의 수호자 — procedural Web Audio engine.
// No external audio assets and no extra dependencies: every sound is synthesised from
// oscillators, filtered noise bursts, FM bells, chord stacks and a procedurally generated
// convolver impulse response (noise decay) used as a shared reverb send.
// Rule: this module never imports three.

import { createRNG } from './utils/rng.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(Number.isFinite(v) ? v : 0, 0, 1);
const mtof = (semi) => 440 * Math.pow(2, (semi - 69) / 12); // midi note -> Hz

const THROTTLE = 0.03; // identical sfx fired inside this window are dropped
const LOOKAHEAD = 1.0; // BGM scheduler lookahead (seconds)
const TICK_MS = 200; // BGM scheduler interval
const FADE = 0.8; // bgm fade out/in

// ──────────────────────────────────────────────── BGM definitions
// `root` is a midi note, `bass`/`chords` are semitone offsets from the root.
const BGM_KINDS = {
  field: {
    bpm: 82, root: 45, bassWave: 'triangle', arpWave: 'triangle', bell: false,
    bass: [0, 0, 5, 5, 7, 7, 3, 3],
    chords: [[0, 3, 7], [-4, 3, 8], [-2, 2, 7], [0, 5, 9]],
    bassGain: 0.1, arpGain: 0.032, padGain: 0.05
  },
  battle: {
    bpm: 138, root: 40, bassWave: 'sawtooth', arpWave: 'square', bell: false,
    bass: [0, 0, 0, 7, 0, 0, 5, 3],
    chords: [[0, 3, 7], [0, 3, 7], [-2, 3, 5], [-4, 1, 8]],
    bassGain: 0.13, arpGain: 0.026, padGain: 0.032
  },
  menu: {
    bpm: 70, root: 48, bassWave: 'sine', arpWave: 'triangle', bell: false,
    bass: [0, 0, 7, 7, 5, 5, 3, 3],
    chords: [[0, 4, 7], [0, 4, 7], [-3, 2, 5], [-5, 2, 7]],
    bassGain: 0.08, arpGain: 0.028, padGain: 0.06
  },
  fairy: {
    bpm: 96, root: 60, bassWave: 'sine', arpWave: 'triangle', bell: true,
    bass: [0, 0, 5, 7, 0, 0, 9, 7],
    chords: [[0, 4, 7], [2, 5, 9], [-3, 4, 7], [0, 7, 12]],
    bassGain: 0.07, arpGain: 0.026, padGain: 0.05
  }
};

// ──────────────────────────────────────────────── sound patches
// Each patch is called with `this` bound to the AudioSystem instance.
const SFX = {
  // ── staff / spells ──
  fire(o = {}) {
    const v = o.volume ?? 1;
    const p = 1 + this._rng.range(-0.05, 0.05);
    this._tone({ freq: 780 * p, glideTo: 200, type: 'square', dur: 0.13, gain: 0.09 * v, attack: 0.002, send: 0.12 });
    this._noise({ freq: 2400, sweepTo: 700, type: 'bandpass', q: 0.9, dur: 0.09, gain: 0.09 * v });
  },
  cast(o = {}) {
    const v = o.volume ?? 1;
    this._tone({ freq: 420, glideTo: 880, type: 'triangle', dur: 0.34, gain: 0.1 * v, attack: 0.02, send: 0.3 });
    this._tone({ freq: 630, glideTo: 1320, type: 'sine', dur: 0.3, gain: 0.055 * v, attack: 0.03, send: 0.35 });
    this._bell({ freq: 1760, dur: 0.45, gain: 0.04 * v });
  },
  castRare(o = {}) {
    const v = o.volume ?? 1;
    this._chord({ freqs: [220, 277, 330, 440], dur: 0.9, gain: 0.04 * v, attack: 0.05, send: 0.5 });
    this._tone({ freq: 300, glideTo: 1400, type: 'sawtooth', dur: 0.55, gain: 0.055 * v, attack: 0.03, send: 0.4 });
    this._noise({ freq: 900, sweepTo: 5200, type: 'bandpass', q: 1.4, dur: 0.6, gain: 0.045 * v, send: 0.5 });
    this._bell({ freq: 2640, dur: 1.3, gain: 0.06 * v, send: 0.6 });
  },
  explosion(o = {}) {
    const v = o.volume ?? 1;
    this._noise({ freq: 420, sweepTo: 80, type: 'lowpass', q: 0.8, dur: 0.8, gain: 0.3 * v, attack: 0.004, send: 0.4 });
    this._tone({ freq: 130, glideTo: 30, type: 'sine', dur: 0.6, gain: 0.26 * v, attack: 0.003 });
    this._noise({ freq: 3200, type: 'highpass', dur: 0.16, gain: 0.1 * v });
  },
  hit(o = {}) {
    const v = o.volume ?? 1;
    const p = 1 + this._rng.range(-0.06, 0.06);
    this._noise({ freq: 2600, type: 'highpass', dur: 0.05, gain: 0.14 * v });
    this._tone({ freq: 700 * p, glideTo: 400, type: 'square', dur: 0.08, gain: 0.06 * v, attack: 0.001 });
  },
  enemyDeath(o = {}) {
    const v = o.volume ?? 1;
    this._tone({ freq: 460, glideTo: 90, type: 'sawtooth', dur: 0.42, gain: 0.11 * v, attack: 0.004, send: 0.25 });
    this._noise({ freq: 1200, sweepTo: 260, type: 'bandpass', q: 1.1, dur: 0.36, gain: 0.09 * v });
    this._tone({ freq: 180, glideTo: 60, type: 'triangle', dur: 0.5, gain: 0.07 * v });
  },
  // ── building / economy ──
  build(o = {}) {
    const v = o.volume ?? 1;
    this._noise({ freq: 900, type: 'lowpass', dur: 0.1, gain: 0.16 * v, attack: 0.001 });
    this._tone({ freq: 220, glideTo: 150, type: 'square', dur: 0.12, gain: 0.08 * v, attack: 0.001 });
    this._tone({ freq: 520, type: 'triangle', dur: 0.16, gain: 0.07 * v, attack: 0.002, when: this._now() + 0.09 });
    this._tone({ freq: 780, type: 'triangle', dur: 0.2, gain: 0.05 * v, attack: 0.002, when: this._now() + 0.16 });
  },
  sell(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    this._tone({ freq: 1180, type: 'triangle', dur: 0.1, gain: 0.09 * v, when: t });
    this._tone({ freq: 1560, type: 'triangle', dur: 0.16, gain: 0.07 * v, when: t + 0.07 });
    this._noise({ freq: 5200, type: 'highpass', dur: 0.06, gain: 0.05 * v, when: t });
  },
  upgrade(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.075 * v, attack: 0.004, when: t + i * 0.07, send: 0.3 });
    });
    this._bell({ freq: 2093, dur: 0.7, gain: 0.05 * v, when: t + 0.24 });
  },
  mine(o = {}) {
    const v = o.volume ?? 1;
    const p = 1 + this._rng.range(-0.08, 0.08);
    this._noise({ freq: 3400 * p, type: 'bandpass', q: 2.2, dur: 0.07, gain: 0.16 * v });
    this._tone({ freq: 1700 * p, glideTo: 900, type: 'square', dur: 0.07, gain: 0.05 * v, attack: 0.001 });
    this._tone({ freq: 150, type: 'sine', dur: 0.1, gain: 0.08 * v, attack: 0.002 });
  },
  chop(o = {}) {
    const v = o.volume ?? 1;
    this._noise({ freq: 620, sweepTo: 240, type: 'lowpass', q: 1.2, dur: 0.14, gain: 0.2 * v, attack: 0.002 });
    this._tone({ freq: 300, glideTo: 180, type: 'triangle', dur: 0.12, gain: 0.08 * v, attack: 0.002 });
  },
  levelup(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.07 * v, attack: 0.005, when: t + i * 0.08, send: 0.35 });
    });
    this._chord({ freqs: [523.25, 659.25, 783.99], dur: 1.1, gain: 0.05 * v, attack: 0.04, when: t + 0.4, send: 0.55 });
  },
  // ── gacha ──
  gachaCommon(o = {}) {
    const v = o.volume ?? 1;
    this._tone({ freq: 523.25, type: 'triangle', dur: 0.22, gain: 0.08 * v, attack: 0.006 });
    this._tone({ freq: 659.25, type: 'triangle', dur: 0.3, gain: 0.06 * v, attack: 0.006, when: this._now() + 0.1 });
  },
  gachaRare(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    [523.25, 698.46, 880].forEach((f, i) => this._tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.07 * v, when: t + i * 0.09, send: 0.35 }));
    this._bell({ freq: 1760, dur: 0.6, gain: 0.05 * v, when: t + 0.18 });
  },
  gachaEpic(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    [440, 554.37, 659.25, 880].forEach((f, i) => this._tone({ freq: f, type: 'sawtooth', dur: 0.35, gain: 0.055 * v, when: t + i * 0.1, send: 0.45 }));
    this._chord({ freqs: [440, 554.37, 659.25], dur: 1.2, gain: 0.045 * v, attack: 0.05, when: t + 0.4, send: 0.6 });
    this._bell({ freq: 2349, dur: 1.1, gain: 0.06 * v, when: t + 0.42, send: 0.6 });
  },
  gachaLegend(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.5, gain: 0.06 * v, when: t + i * 0.11, send: 0.5 });
    });
    this._chord({ freqs: [261.63, 392, 523.25, 783.99], dur: 1.6, gain: 0.05 * v, attack: 0.06, when: t + 0.5, send: 0.7 });
    this._bell({ freq: 3136, dur: 1.6, gain: 0.07 * v, when: t + 0.55, send: 0.7 });
    this._noise({ freq: 1200, sweepTo: 7000, type: 'bandpass', q: 1.6, dur: 0.9, gain: 0.05 * v, when: t + 0.5, send: 0.6 });
  },
  gachaRelic(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    this._chord({ freqs: [55, 82.5, 110, 164.81, 220, 329.63], dur: 2.6, gain: 0.05 * v, attack: 0.12, send: 0.75 });
    this._chord({ freqs: [440, 554.37, 659.25, 880, 1318.5], dur: 2.4, gain: 0.035 * v, attack: 0.35, when: t + 0.5, send: 0.8 });
    [1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => this._bell({ freq: f, dur: 1.8, gain: 0.05 * v, when: t + 0.6 + i * 0.16, send: 0.75 }));
    this._noise({ freq: 400, sweepTo: 9000, type: 'bandpass', q: 1.2, dur: 1.8, gain: 0.05 * v, attack: 0.2, send: 0.7 });
  },
  relic(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    this._chord({ freqs: [329.63, 493.88, 659.25, 987.77], dur: 2.0, gain: 0.045 * v, attack: 0.1, send: 0.7 });
    this._bell({ freq: 1975.5, dur: 1.8, gain: 0.06 * v, when: t + 0.1, send: 0.7 });
    this._bell({ freq: 2637, dur: 1.6, gain: 0.045 * v, when: t + 0.45, send: 0.7 });
    this._tone({ freq: 110, glideTo: 220, type: 'sine', dur: 1.4, gain: 0.09 * v, attack: 0.08, send: 0.4 });
  },
  // ── world / waves ──
  fairy(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    [1567.98, 2093, 2637, 3136].forEach((f, i) => this._bell({ freq: f, dur: 1.4, gain: 0.05 * v, when: t + i * 0.13, send: 0.7 }));
    this._chord({ freqs: [1046.5, 1318.5, 1567.98], dur: 1.6, gain: 0.028 * v, attack: 0.2, when: t + 0.2, send: 0.75 });
  },
  waveStart(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    this._tone({ freq: 116.54, type: 'sawtooth', dur: 1.3, gain: 0.12 * v, attack: 0.06, send: 0.35 });
    this._tone({ freq: 174.61, type: 'sawtooth', dur: 1.2, gain: 0.08 * v, attack: 0.08, when: t + 0.02, send: 0.35 });
    this._tone({ freq: 233.08, type: 'square', dur: 0.9, gain: 0.05 * v, attack: 0.1, when: t + 0.05, send: 0.3 });
    this._noise({ freq: 180, type: 'lowpass', dur: 0.5, gain: 0.16 * v, attack: 0.004 });
  },
  waveClear(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    [392, 523.25, 659.25, 783.99].forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: 0.42, gain: 0.08 * v, attack: 0.006, when: t + i * 0.12, send: 0.4 });
    });
    this._chord({ freqs: [392, 523.25, 659.25], dur: 1.4, gain: 0.05 * v, attack: 0.05, when: t + 0.5, send: 0.55 });
  },
  boss(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    this._chord({ freqs: [41.2, 41.9, 61.7, 82.4], dur: 2.4, gain: 0.16 * v, attack: 0.08, send: 0.4, spread: 8 });
    this._noise({ freq: 220, sweepTo: 70, type: 'lowpass', q: 0.7, dur: 2.2, gain: 0.18 * v, attack: 0.1, send: 0.4 });
    this._tone({ freq: 82.41, glideTo: 55, type: 'sawtooth', dur: 2.0, gain: 0.1 * v, attack: 0.05 });
    this._bell({ freq: 164.81, dur: 2.2, gain: 0.06 * v, when: t + 0.3, send: 0.5 });
  },
  baseHit(o = {}) {
    const v = o.volume ?? 1;
    this._noise({ freq: 300, sweepTo: 90, type: 'lowpass', q: 1.1, dur: 0.5, gain: 0.26 * v, attack: 0.003, send: 0.35 });
    this._tone({ freq: 92, glideTo: 46, type: 'sawtooth', dur: 0.5, gain: 0.16 * v, attack: 0.003 });
    this._tone({ freq: 55, type: 'sine', dur: 0.7, gain: 0.14 * v, attack: 0.01 });
  },
  // ── ui / meta ──
  ui(o = {}) {
    const v = o.volume ?? 1;
    this._tone({ freq: 1250, glideTo: 1600, type: 'sine', dur: 0.045, gain: 0.05 * v, attack: 0.001 });
  },
  error(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    this._tone({ freq: 220, type: 'square', dur: 0.14, gain: 0.07 * v, attack: 0.002 });
    this._tone({ freq: 165, type: 'square', dur: 0.22, gain: 0.07 * v, attack: 0.002, when: t + 0.14 });
  },
  victory(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    const line = [523.25, 523.25, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    line.forEach((f, i) => this._tone({ freq: f, type: 'triangle', dur: i === line.length - 1 ? 1.6 : 0.34, gain: 0.09 * v, attack: 0.006, when: t + i * 0.22, send: 0.45 }));
    this._chord({ freqs: [261.63, 392, 523.25, 783.99, 1046.5], dur: 2.2, gain: 0.055 * v, attack: 0.1, when: t + 1.3, send: 0.6 });
    this._bell({ freq: 2093, dur: 2.0, gain: 0.07 * v, when: t + 1.35, send: 0.65 });
  },
  defeat(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    const line = [440, 415.3, 349.23, 261.63];
    line.forEach((f, i) => this._tone({ freq: f, type: 'triangle', dur: 1.1, gain: 0.1 * v, attack: 0.03, when: t + i * 0.42, send: 0.55 }));
    this._chord({ freqs: [110, 130.81, 155.56, 220], dur: 3.4, gain: 0.055 * v, attack: 0.3, when: t + 1.2, send: 0.7 });
    this._noise({ freq: 500, sweepTo: 120, type: 'lowpass', dur: 2.6, gain: 0.12 * v, attack: 0.4, when: t + 0.2, send: 0.5 });
  },

  // ── weapon swaps (36-weapon set) ────────────────────────────
  // `opts.family` picks the timbre: staff | sword1h | katana | sword2h | scythe | dagger | scissors | dream | bow.
  // A swap is a frequent, low-stakes action, so every family stays short and quiet;
  // the dream tree is the only one allowed a soft, longer bloom.
  swap(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    switch (o.family) {
      case 'sword1h': // draw: a metallic hiss rising out of the sheath
        this._noise({ freq: 900, sweepTo: 5200, type: 'bandpass', q: 1.6, dur: 0.22, gain: 0.07 * v, attack: 0.004, send: 0.25 });
        this._tone({ freq: 1320, glideTo: 1760, type: 'triangle', dur: 0.18, gain: 0.05 * v, attack: 0.004, send: 0.3 });
        this._bell({ freq: 2637, dur: 0.5, gain: 0.028 * v, when: t + 0.1, send: 0.45 });
        break;
      case 'katana': // iai: 칼집에서 빠져나오는 짧고 날카로운 마찰음
        this._noise({ freq: 1200, sweepTo: 6400, type: 'bandpass', q: 1.9, dur: 0.16, gain: 0.065 * v, attack: 0.003, send: 0.28 });
        this._tone({ freq: 1760, glideTo: 2349.3, type: 'triangle', dur: 0.13, gain: 0.045 * v, attack: 0.003, send: 0.32 });
        this._bell({ freq: 3136, dur: 0.42, gain: 0.022 * v, when: t + 0.08, send: 0.5 });
        break;
      case 'sword2h': // shoulder: heavy air moved, then the weight settles
        this._noise({ freq: 620, sweepTo: 190, type: 'lowpass', q: 0.9, dur: 0.42, gain: 0.12 * v, attack: 0.01, send: 0.3 });
        this._tone({ freq: 180, glideTo: 96, type: 'triangle', dur: 0.4, gain: 0.08 * v, attack: 0.01, send: 0.2 });
        this._tone({ freq: 88, type: 'sine', dur: 0.3, gain: 0.07 * v, attack: 0.008, when: t + 0.24 });
        this._bell({ freq: 784, dur: 0.6, gain: 0.028 * v, when: t + 0.22, send: 0.4 });
        break;
      case 'scythe': // spin: one whoosh sweeping left to right, blade edge on top
        this._noise({ freq: 700, sweepTo: 3600, type: 'bandpass', q: 1.1, dur: 0.3, gain: 0.075 * v, attack: 0.02, pan: -0.6, send: 0.35 });
        this._tone({ freq: 392, glideTo: 294, type: 'triangle', dur: 0.4, gain: 0.05 * v, attack: 0.02, send: 0.3 });
        this._noise({ freq: 3300, sweepTo: 620, type: 'bandpass', q: 1.1, dur: 0.3, gain: 0.055 * v, attack: 0.02, when: t + 0.22, pan: 0.6, send: 0.35 });
        this._bell({ freq: 1568, dur: 0.5, gain: 0.024 * v, when: t + 0.4, send: 0.5 });
        break;
      case 'dagger': // flick: nothing but a wrist snap
        this._noise({ freq: 4200, type: 'highpass', dur: 0.045, gain: 0.08 * v });
        this._tone({ freq: 1800, glideTo: 2600, type: 'square', dur: 0.05, gain: 0.035 * v, attack: 0.001 });
        break;
      case 'scissors': // unfold: 강철이 갈라지는 소리, 그리고 한 번 '사각'
        this._noise({ freq: 1500, sweepTo: 4600, type: 'bandpass', q: 1.8, dur: 0.2, gain: 0.07 * v, attack: 0.004, send: 0.3 });
        this._tone({ freq: 1560, glideTo: 2100, type: 'triangle', dur: 0.16, gain: 0.045 * v, attack: 0.003, send: 0.3 });
        this._noise({ freq: 5600, type: 'highpass', dur: 0.03, gain: 0.09 * v, when: t + 0.34 });
        this._tone({ freq: 2349.3, glideTo: 1567.98, type: 'square', dur: 0.055, gain: 0.03 * v, attack: 0.001, when: t + 0.34 });
        this._bell({ freq: 2793, dur: 0.5, gain: 0.022 * v, when: t + 0.36, send: 0.5 });
        break;
      case 'dream': // bloom: petals opening, soft pentatonic chimes drifting apart
        this._chord({ freqs: [523.25, 587.33, 783.99, 880], dur: 1.2, gain: 0.026 * v, attack: 0.18, send: 0.7 });
        this._tone({ freq: 659.25, glideTo: 987.77, type: 'sine', dur: 1.0, gain: 0.032 * v, attack: 0.22, send: 0.6 });
        [1046.5, 1318.5, 1567.98].forEach((f, i) => this._bell({ freq: f, dur: 1.3, gain: 0.028 * v, when: t + 0.16 + i * 0.18, send: 0.75 }));
        this._noise({ freq: 700, sweepTo: 3000, type: 'bandpass', q: 1, dur: 0.9, gain: 0.028 * v, attack: 0.3, send: 0.65 });
        break;
      case 'bow': // nock: 시위가 팽팽해지는 나무 소리, 그리고 화살촉이 걸리는 '톡'
        this._noise({ freq: 300, sweepTo: 1500, type: 'bandpass', q: 2.4, dur: 0.26, gain: 0.055 * v, attack: 0.02, send: 0.3 });
        this._tone({ freq: 196, glideTo: 262, type: 'triangle', dur: 0.3, gain: 0.04 * v, attack: 0.02, send: 0.25 });
        this._noise({ freq: 2600, type: 'highpass', dur: 0.03, gain: 0.06 * v, when: t + 0.3 });
        this._bell({ freq: 1046.5, dur: 0.45, gain: 0.02 * v, when: t + 0.31, send: 0.4 });
        break;
      default: // staff twirl: arcane whoosh up into a single sparkle
        this._noise({ freq: 600, sweepTo: 3000, type: 'bandpass', q: 1.3, dur: 0.26, gain: 0.07 * v, attack: 0.01, send: 0.35 });
        this._tone({ freq: 520, glideTo: 1040, type: 'triangle', dur: 0.26, gain: 0.05 * v, attack: 0.012, send: 0.4 });
        this._bell({ freq: 2093, dur: 0.6, gain: 0.028 * v, when: t + 0.14, send: 0.55 });
        break;
    }
  },

  // ── weapon impacts (per-family hit feel) ────────────────────
  impactMagic(o = {}) { // burst: magic pops and scatters upward
    const v = o.volume ?? 1;
    const p = 1 + this._rng.range(-0.05, 0.05);
    this._noise({ freq: 1100, sweepTo: 3400, type: 'bandpass', q: 1.2, dur: 0.16, gain: 0.07 * v, send: 0.25 });
    this._tone({ freq: 620 * p, glideTo: 1240, type: 'triangle', dur: 0.14, gain: 0.05 * v, attack: 0.002, send: 0.25 });
    this._bell({ freq: 1975.5, dur: 0.35, gain: 0.026 * v, send: 0.4 });
  },
  impactBlade(o = {}) { // spark: bright steel click with a short ring
    const v = o.volume ?? 1;
    const p = 1 + this._rng.range(-0.06, 0.06);
    this._noise({ freq: 2600, type: 'highpass', dur: 0.055, gain: 0.1 * v });
    this._tone({ freq: 1180 * p, glideTo: 640, type: 'square', dur: 0.09, gain: 0.045 * v, attack: 0.001 });
    this._tone({ freq: 1760 * p, glideTo: 980, type: 'triangle', dur: 0.12, gain: 0.033 * v, attack: 0.001, send: 0.3 });
  },
  impactHeavy(o = {}) { // shock: low thud with a pressure wave behind it
    const v = o.volume ?? 1;
    this._noise({ freq: 900, sweepTo: 150, type: 'lowpass', q: 0.8, dur: 0.34, gain: 0.16 * v, attack: 0.003, send: 0.3 });
    this._tone({ freq: 150, glideTo: 52, type: 'sine', dur: 0.3, gain: 0.13 * v, attack: 0.003 });
    this._tone({ freq: 380, glideTo: 180, type: 'triangle', dur: 0.18, gain: 0.05 * v, attack: 0.002 });
    this._noise({ freq: 3200, type: 'highpass', dur: 0.07, gain: 0.045 * v });
  },
  impactSweep(o = {}) { // arc: the crescent scythes past the ears
    const v = o.volume ?? 1;
    const t = this._now();
    this._noise({ freq: 4800, sweepTo: 700, type: 'bandpass', q: 1.5, dur: 0.24, gain: 0.09 * v, attack: 0.004, pan: -0.45, send: 0.3 });
    this._tone({ freq: 700, glideTo: 300, type: 'triangle', dur: 0.2, gain: 0.045 * v, attack: 0.003, pan: 0.35 });
    this._bell({ freq: 1318.5, dur: 0.4, gain: 0.024 * v, when: t + 0.05, send: 0.5 });
  },
  impactSnip(o = {}) { // snip: 두 강철 날이 맞물리는 짧고 밝은 소리
    const v = o.volume ?? 1;
    const p = 1 + this._rng.range(-0.05, 0.05);
    this._noise({ freq: 6400, type: 'highpass', dur: 0.028, gain: 0.095 * v });
    this._tone({ freq: 2489 * p, glideTo: 1318.5, type: 'square', dur: 0.07, gain: 0.04 * v, attack: 0.001 });
    this._tone({ freq: 987.77 * p, glideTo: 1567.98, type: 'triangle', dur: 0.16, gain: 0.03 * v, attack: 0.002, send: 0.4 });
    this._bell({ freq: 3520, dur: 0.32, gain: 0.02 * v, send: 0.45 });
  },
  impactQuick(o = {}) { // stab: a single dry needle of sound
    const v = o.volume ?? 1;
    const p = 1 + this._rng.range(-0.07, 0.07);
    this._noise({ freq: 5200, type: 'highpass', dur: 0.035, gain: 0.07 * v });
    this._tone({ freq: 1500 * p, glideTo: 900, type: 'square', dur: 0.05, gain: 0.033 * v, attack: 0.001 });
  },

  // ── relic ultimates ─────────────────────────────────────────
  ultimateBlade(o = {}) { // king's judgment / world slash: inhale, then the golden arc falls
    const v = o.volume ?? 1;
    const t = this._now();
    this._noise({ freq: 300, sweepTo: 6000, type: 'bandpass', q: 1.4, dur: 0.5, gain: 0.08 * v, attack: 0.12, send: 0.5 });
    this._chord({ freqs: [130.81, 196, 261.63, 392], dur: 2.2, gain: 0.07 * v, attack: 0.05, when: t + 0.42, send: 0.55 });
    this._tone({ freq: 2400, glideTo: 300, type: 'sawtooth', dur: 0.5, gain: 0.045 * v, attack: 0.006, when: t + 0.42, send: 0.4 });
    this._noise({ freq: 5200, sweepTo: 800, type: 'bandpass', q: 1.2, dur: 0.6, gain: 0.09 * v, attack: 0.01, when: t + 0.44, send: 0.5 });
    this._bell({ freq: 1567.98, dur: 2.0, gain: 0.05 * v, when: t + 0.5, send: 0.65 });
    this._bell({ freq: 2349.3, dur: 1.6, gain: 0.033 * v, when: t + 0.72, send: 0.65 });
  },
  ultimateVoid(o = {}) { // apocalypse: a black hole collapsing into a sub-bass sink
    const v = o.volume ?? 1;
    const t = this._now();
    this._tone({ freq: 120, glideTo: 34, type: 'sine', dur: 2.6, gain: 0.16 * v, attack: 0.2, send: 0.4 });
    this._noise({ freq: 900, sweepTo: 90, type: 'lowpass', q: 0.8, dur: 2.4, gain: 0.12 * v, attack: 0.3, send: 0.45 });
    this._chord({ freqs: [51.91, 55, 77.78, 103.83], dur: 2.2, gain: 0.09 * v, attack: 0.35, spread: 10, send: 0.5 });
    this._chord({ freqs: [415.3, 440, 622.25], dur: 1.4, gain: 0.028 * v, attack: 0.5, when: t + 0.3, spread: 14, send: 0.6 });
    this._bell({ freq: 82.41, dur: 2.4, gain: 0.045 * v, when: t + 0.9, send: 0.6 });
  },
  ultimateQuick(o = {}) { // assassination: ten shadows landing left and right, then silence
    const v = o.volume ?? 1;
    const t = this._now();
    this._tone({ freq: 2200, glideTo: 5000, type: 'sine', dur: 0.18, gain: 0.04 * v, attack: 0.02, send: 0.3 });
    for (let i = 0; i < 10; i++) {
      const at = t + 0.12 + i * 0.075;
      const pan = i % 2 === 0 ? -0.75 : 0.75;
      this._noise({ freq: 4200, type: 'highpass', dur: 0.03, gain: 0.06 * v, when: at, pan, send: 0.2 });
      this._tone({ freq: 900 + i * 60, glideTo: 500, type: 'square', dur: 0.045, gain: 0.028 * v, attack: 0.001, when: at, pan, send: 0.15 });
    }
    this._bell({ freq: 2637, dur: 1.2, gain: 0.04 * v, when: t + 0.9, send: 0.6 });
  },
  ultimateSalvation(o = {}) { // dreamsEnd: the whole battlefield is forgiven at once
    const v = o.volume ?? 1;
    const t = this._now();
    this._chord({ freqs: [174.61, 261.63, 349.23, 440], dur: 3.4, gain: 0.055 * v, attack: 0.5, send: 0.7 });
    this._chord({ freqs: [523.25, 659.25, 783.99, 1046.5], dur: 3.0, gain: 0.032 * v, attack: 0.7, when: t + 0.3, send: 0.8 });
    [1046.5, 1318.5, 1567.98, 2093].forEach((f, i) => this._bell({ freq: f, dur: 2.2, gain: 0.038 * v, when: t + 0.25 + i * 0.34, send: 0.8 }));
    this._tone({ freq: 220, glideTo: 330, type: 'sine', dur: 2.8, gain: 0.05 * v, attack: 0.9, send: 0.6 });
    this._noise({ freq: 500, sweepTo: 4200, type: 'bandpass', q: 0.9, dur: 2.6, gain: 0.032 * v, attack: 1, send: 0.75 });
  },
  ultimateTime(o = {}) { // timeStop: a clock stutters, then every pitch stretches and freezes
    const v = o.volume ?? 1;
    const t = this._now();
    for (let i = 0; i < 6; i++) {
      this._noise({ freq: 6000, type: 'highpass', dur: 0.02, gain: 0.05 * v, when: t + i * 0.09, send: 0.2 });
      this._tone({ freq: 2400, type: 'square', dur: 0.03, gain: 0.028 * v, attack: 0.001, when: t + i * 0.09 });
    }
    this._tone({ freq: 600, glideTo: 300, type: 'sine', dur: 2.6, gain: 0.06 * v, attack: 0.4, when: t + 0.5, send: 0.6 });
    this._chord({ freqs: [311.13, 466.16, 622.25], dur: 2.8, gain: 0.028 * v, attack: 0.8, when: t + 0.5, spread: 12, send: 0.7 });
    this._bell({ freq: 1864.66, dur: 2.6, gain: 0.048 * v, when: t + 0.55, send: 0.7 });
  },
  ultimateHoly(o = {}) { // genesis: twelve pillars of light, bright and clean
    const v = o.volume ?? 1;
    const t = this._now();
    this._chord({ freqs: [130.81, 196, 261.63, 329.63, 392], dur: 3.2, gain: 0.05 * v, attack: 0.3, send: 0.65 });
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this._tone({ freq: f, type: 'triangle', dur: 1.6, gain: 0.042 * v, attack: 0.02, when: t + 0.15 + i * 0.11, send: 0.6 }));
    this._noise({ freq: 400, sweepTo: 8000, type: 'bandpass', q: 1.1, dur: 2.2, gain: 0.05 * v, attack: 0.5, send: 0.75 });
    this._bell({ freq: 2093, dur: 2.4, gain: 0.05 * v, when: t + 0.7, send: 0.75 });
    this._tone({ freq: 65.41, type: 'sine', dur: 2.4, gain: 0.09 * v, attack: 0.15 });
  },

  // ── dream tree (non-lethal salvation) ───────────────────────
  // The one sound in the game that must never read as violence: no burst, no thud and no
  // transient. Warm bells and a major chord arrive slowly, bloom, and let go.
  salvation(o = {}) {
    const v = o.volume ?? 1;
    const t = this._now();
    this._chord({ freqs: [349.23, 440, 523.25, 698.46], dur: 2.4, gain: 0.04 * v, attack: 0.35, send: 0.8 });
    [698.46, 880, 1046.5, 1396.91].forEach((f, i) => this._bell({ freq: f, dur: 1.8, gain: 0.036 * v, when: t + i * 0.26, send: 0.85 }));
    this._tone({ freq: 174.61, glideTo: 261.63, type: 'sine', dur: 2.0, gain: 0.045 * v, attack: 0.5, send: 0.6 });
    this._noise({ freq: 600, sweepTo: 2600, type: 'bandpass', q: 0.9, dur: 1.8, gain: 0.024 * v, attack: 0.6, send: 0.7 });
  }
};

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxBus = null;
    this.bgmBus = null;
    this.reverbIn = null;
    this._volumes = { master: 0.85, sfx: 0.9, bgm: 0.45 };
    this._muted = false;
    this._noiseBuffer = null;
    this._irBuffer = null;
    this._last = new Map();
    this._bgm = null;
    this._pendingBGM = null;
    this._rng = createRNG('audio');
  }

  // ── lifecycle ───────────────────────────────────────────────
  /** Creates the AudioContext (browsers need a user gesture) and resumes it. */
  init() {
    try {
      if (this.ctx) {
        if (this.ctx.state !== 'running') this.ctx.resume?.();
        return this.ctx;
      }
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null; // headless / unsupported: stay a silent no-op
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;

      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this._muted ? 0 : this._volumes.master;
      const comp = ctx.createDynamicsCompressor?.();
      if (comp) {
        comp.threshold.value = -12;
        comp.knee.value = 18;
        comp.ratio.value = 4;
        comp.attack.value = 0.004;
        comp.release.value = 0.18;
        this.masterGain.connect(comp);
        comp.connect(ctx.destination);
        this._comp = comp;
      } else {
        this.masterGain.connect(ctx.destination);
      }

      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this._volumes.sfx;
      this.sfxBus.connect(this.masterGain);

      this.bgmBus = ctx.createGain();
      this.bgmBus.gain.value = this._volumes.bgm;
      this.bgmBus.connect(this.masterGain);

      // shared reverb send
      const conv = ctx.createConvolver();
      conv.buffer = this._makeImpulse(1.9, 2.7);
      const revOut = ctx.createGain();
      revOut.gain.value = 0.32;
      this.reverbIn = ctx.createGain();
      this.reverbIn.gain.value = 1;
      this.reverbIn.connect(conv);
      conv.connect(revOut);
      revOut.connect(this.masterGain);
      this._reverb = conv;

      this._noiseBuffer = this._makeNoise(2.5);

      if (ctx.state !== 'running') ctx.resume?.();
      if (this._pendingBGM) {
        const kind = this._pendingBGM;
        this._pendingBGM = null;
        this.startBGM(kind);
      }
      return ctx;
    } catch {
      this.ctx = null;
      return null;
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get muted() {
    return this._muted;
  }

  // ── public mixing ───────────────────────────────────────────
  setVolume({ master, sfx, bgm } = {}) {
    if (master != null) this._volumes.master = clamp01(master);
    if (sfx != null) this._volumes.sfx = clamp01(sfx);
    if (bgm != null) this._volumes.bgm = clamp01(bgm);
    this._applyVolumes();
  }

  toggleMute() {
    this._muted = !this._muted;
    this._applyVolumes();
    return this._muted;
  }

  _applyVolumes() {
    const ctx = this.ctx;
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const ramp = (node, value) => {
      try {
        node.gain.cancelScheduledValues?.(t);
        node.gain.setTargetAtTime(value, t, 0.02);
      } catch {
        node.gain.value = value;
      }
    };
    ramp(this.masterGain, this._muted ? 0 : this._volumes.master);
    if (this.sfxBus) ramp(this.sfxBus, this._volumes.sfx);
    if (this.bgmBus) ramp(this.bgmBus, this._volumes.bgm);
  }

  // ── play ────────────────────────────────────────────────────
  play(name, opts = {}) {
    const ctx = this.ctx;
    if (!ctx || this._muted) return false;
    const patch = SFX[name];
    if (!patch) return false;
    const now = ctx.currentTime;
    const last = this._last.get(name);
    if (last != null && now - last < THROTTLE) return false;
    this._last.set(name, now);
    try {
      patch.call(this, opts || {});
    } catch {
      /* audio must never break the game loop */
    }
    return true;
  }

  // ── BGM ─────────────────────────────────────────────────────
  startBGM(kind = 'field') {
    const cfg = BGM_KINDS[kind] || BGM_KINDS.field;
    const name = BGM_KINDS[kind] ? kind : 'field';
    if (!this.ctx) {
      this._pendingBGM = name; // start automatically once init() runs
      return null;
    }
    if (this._bgm && this._bgm.kind === name) return this._bgm;
    this.stopBGM();
    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.bgmBus || this.ctx.destination);
    bus.gain.setTargetAtTime(1, this.ctx.currentTime, FADE * 0.4);
    const session = {
      kind: name,
      cfg,
      bus,
      step: 0,
      stepDur: 60 / cfg.bpm / 2, // 8th notes
      nextTime: this.ctx.currentTime + 0.1,
      timer: null
    };
    session.timer = setInterval(() => this._scheduleBGM(), TICK_MS);
    this._bgm = session;
    this._scheduleBGM();
    return session;
  }

  stopBGM() {
    const s = this._bgm;
    if (!s) return;
    this._bgm = null;
    if (s.timer != null) clearInterval(s.timer);
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      s.bus.gain.cancelScheduledValues?.(t);
      s.bus.gain.setTargetAtTime(0, t, FADE * 0.35);
    } catch {
      s.bus.gain.value = 0;
    }
    const bus = s.bus;
    setTimeout(() => {
      try {
        bus.disconnect();
      } catch {
        /* already gone */
      }
    }, FADE * 1500 + 400);
  }

  _scheduleBGM() {
    const ctx = this.ctx;
    const b = this._bgm;
    if (!ctx || !b) return;
    const cfg = b.cfg;
    if (b.nextTime < ctx.currentTime) b.nextTime = ctx.currentTime + 0.08; // tab was throttled
    const bus = b.bus;
    let guard = 0;
    while (b.nextTime < ctx.currentTime + LOOKAHEAD && guard++ < 64) {
      const t = b.nextTime;
      const s = b.step;
      const bar = Math.floor(s / 8) % cfg.chords.length;
      const chord = cfg.chords[bar];
      // bass on quarter notes
      if (s % 2 === 0) {
        const semi = cfg.root + cfg.bass[(s / 2) % cfg.bass.length];
        this._tone({
          freq: mtof(semi), type: cfg.bassWave, dur: b.stepDur * 1.7, gain: cfg.bassGain,
          attack: 0.012, when: t, bus, send: 0.05
        });
      }
      // arpeggio on every 8th
      const degree = chord[s % chord.length] + (s % 8 >= 4 ? 12 : 0);
      this._tone({
        freq: mtof(cfg.root + 24 + degree), type: cfg.arpWave, dur: b.stepDur * 0.85,
        gain: cfg.arpGain, attack: 0.004, when: t, bus, send: 0.25
      });
      // pad at the head of every bar
      if (s % 8 === 0) {
        for (const d of chord) {
          this._tone({
            freq: mtof(cfg.root + 12 + d), type: 'sine', dur: b.stepDur * 8, gain: cfg.padGain,
            attack: 0.7, decay: b.stepDur * 8, when: t, bus, send: 0.5
          });
        }
      }
      // fairy: bell tones on the off-beats
      if (cfg.bell && s % 4 === 2) {
        this._bell({
          freq: mtof(cfg.root + 36 + chord[(s / 4) % chord.length]), dur: 1.4,
          gain: 0.035, when: t, bus, send: 0.6
        });
      }
      b.step++;
      b.nextTime += b.stepDur;
    }
  }

  // ── internal toolkit ────────────────────────────────────────
  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _bus(bus) {
    return bus || this.sfxBus || this.masterGain || null;
  }

  /** Single oscillator voice: attack -> exponential decay, optional pitch glide + detune + pan. */
  _tone({
    freq = 440, type = 'sine', dur = 0.3, gain = 0.1, attack = 0.005, decay = null,
    detune = 0, glideTo = null, when = 0, bus = null, send = 0.15, pan = 0
  } = {}) {
    const ctx = this.ctx;
    const dest = this._bus(bus);
    if (!ctx || !dest) return null;
    const t0 = Math.max(when || 0, ctx.currentTime);
    const d = Math.max(0.02, decay == null ? dur : decay);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, glideTo), t0 + d);
    if (detune) osc.detune.setValueAtTime(detune, t0);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.max(0.001, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.02, d));

    let out = g;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      out = p;
    }
    out.connect(dest);
    const sendGain = this._send(out, send);

    osc.connect(g);
    osc.start(t0);
    osc.stop(t0 + d + 0.08);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
        if (out !== g) out.disconnect();
        sendGain?.disconnect();
      } catch {
        /* ignore */
      }
    };
    return osc;
  }

  /** Filtered noise burst from a cached white-noise buffer. */
  _noise({
    dur = 0.25, gain = 0.15, type = 'lowpass', freq = 1200, q = 1, sweepTo = null,
    attack = 0.002, when = 0, bus = null, send = 0.15, pan = 0, rate = 1
  } = {}) {
    const ctx = this.ctx;
    const dest = this._bus(bus);
    if (!ctx || !dest || !this._noiseBuffer) return null;
    const t0 = Math.max(when || 0, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    src.playbackRate.value = rate;
    const bufDur = this._noiseBuffer.duration || 2.5;
    const span = Math.min(Math.max(0.05, dur), Math.max(0.05, bufDur - 0.05));
    src.loopStart = this._rng.range(0, Math.max(0, bufDur - span - 0.02));
    src.loopEnd = Math.min(bufDur, src.loopStart + span);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.max(0.001, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let out = g;
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      out = p;
    }
    out.connect(dest);
    const sendGain = this._send(out, send);

    src.connect(filter);
    filter.connect(g);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        g.disconnect();
        if (out !== g) out.disconnect();
        sendGain?.disconnect();
      } catch {
        /* ignore */
      }
    };
    return src;
  }

  /** FM bell: sine carrier with an exponentially decaying modulator (two oscillators). */
  _bell({ freq = 880, dur = 1.2, gain = 0.07, ratio = 3.51, index = 3.2, when = 0, bus = null, send = 0.4 } = {}) {
    const ctx = this.ctx;
    const dest = this._bus(bus);
    if (!ctx || !dest) return null;
    const t0 = Math.max(when || 0, ctx.currentTime);
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.setValueAtTime(freq, t0);
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(freq * ratio, t0);
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(freq * index, t0);
    modGain.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.05), t0 + dur * 0.45);
    mod.connect(modGain);
    modGain.connect(car.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    car.connect(g);
    g.connect(dest);
    const sendGain = this._send(g, send);

    car.start(t0);
    mod.start(t0);
    car.stop(t0 + dur + 0.05);
    mod.stop(t0 + dur + 0.05);
    car.onended = () => {
      try {
        car.disconnect();
        mod.disconnect();
        modGain.disconnect();
        g.disconnect();
        sendGain?.disconnect();
      } catch {
        /* ignore */
      }
    };
    return car;
  }

  /** Chord stack: one voice per frequency with a little detune spread. */
  _chord({ freqs = [220, 277, 330], dur = 0.8, gain = 0.05, type = 'sine', attack = 0.03, spread = 6, when = 0, bus = null, send = 0.3 } = {}) {
    for (const f of freqs) {
      this._tone({
        freq: f, type, dur, gain, attack, bus, send,
        detune: this._rng.range(-spread, spread),
        when: (when || this._now()) + this._rng.range(0, 0.012)
      });
    }
  }

  /** Reverb send helper. */
  _send(node, amount) {
    const ctx = this.ctx;
    if (!ctx || !this.reverbIn || !(amount > 0)) return null;
    const g = ctx.createGain();
    g.gain.value = clamp01(amount);
    node.connect(g);
    g.connect(this.reverbIn);
    return g;
  }

  _makeNoise(seconds = 2) {
    const ctx = this.ctx;
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = this._rng.range(-1, 1);
    return buf;
  }

  /** Procedural impulse response: stereo white noise with an exponential decay tail. */
  _makeImpulse(seconds = 1.9, decay = 2.7) {
    const ctx = this.ctx;
    const len = Math.max(64, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = this._rng.range(-1, 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  /** Tear everything down (mainly for hot reload / tests). */
  dispose() {
    this.stopBGM();
    const ctx = this.ctx;
    this.ctx = null;
    this.masterGain = null;
    this.sfxBus = null;
    this.bgmBus = null;
    this.reverbIn = null;
    this._last.clear();
    if (ctx) {
      try {
        ctx.close?.();
      } catch {
        /* ignore */
      }
    }
  }
}

export const SFX_NAMES = Object.keys(SFX);
export const BGM_NAMES = Object.keys(BGM_KINDS);
export default AudioSystem;

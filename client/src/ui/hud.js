// ui/hud.js — 요새의 수호자 HUD.
// 순수 DOM/CSS 조작만 한다 (three import 금지). 계약: docs/CONTRACT.md §4.13 / §4.16 / §4.17
//
// 설계 원칙
//  - 생성자에서 DOM을 한 번만 만들고, update()는 텍스트/폭/클래스만 바꾼다.
//  - 게임 컨텍스트(game)의 모든 접근은 옵셔널 체이닝 + 숫자 방어로 처리해
//    시스템이 아직 없거나 일부만 조립된 상태에서도 절대 throw 하지 않는다.
import { FRAME_PRESETS, TURRET_BY_ID, TURRET_CATEGORIES, WAVE_CONFIG } from '../data.js';
import { applyCrosshair, loadCrosshair } from './crosshair.js';

const PHASE_LABEL = {
  idle: '대기',
  lobby: '대기실',
  loading: '불러오는 중',
  prep: '준비 단계',
  combat: '교전 중',
  complete: '웨이브 완료',
  paused: '일시정지',
  dead: '쓰러짐',
  gameover: '요새 함락'
};

const PHASE_HINT = {
  idle: 'B 로 포탑을 세우고 요새를 지키세요.',
  lobby: '다른 수호자를 기다리는 중…',
  prep: '포탑을 세우고 다음 웨이브를 맞이하세요.',
  combat: '적이 몰려옵니다! 요새를 사수하세요.',
  complete: '웨이브를 막아냈습니다. 보상을 정산합니다.',
  gameover: '기지가 파괴되었습니다. 다시 도전해 보세요.'
};

const TOAST_ICON = {
  info: 'i',
  success: '✓',
  warn: '!',
  error: '×',
  gacha: '✦',
  fairy: '✧'
};

const TOAST_LIFE = { info: 3.2, success: 3.2, warn: 4.5, error: 6, gacha: 5, fairy: 6.5 };
const TOAST_TYPES = Object.keys(TOAST_ICON);
const MAX_TOASTS = 5;
const TOAST_FADE = 0.28;

/** 보스 패턴 → 한글 설명(HUD 보스 바 하단) */
const BOSS_ABILITY_LABEL = {
  smash: '기지 강타 — 큰 피해를 준다',
  summon: '부하 소환 — 주기적으로 몬스터를 부른다',
  breath: '브레스 — 넓은 범위를 태운다',
  shield: '실드 전개 — 피해를 절반으로 줄인다',
  judgment: '심판 — 기지·포탑·플레이어를 광역으로 태운다 (최종보스)'
};

const LOW_HP_RATIO = 0.3; // 비네트 발동
const LOW_BAR_RATIO = 0.35; // 바 색 경고
const BANNER_HOLD = 3; // 페이즈 전환 배너 유지 시간(초)
const DAMAGE_FLASH_TIME = 0.5;
const HIT_MARKER_TIME = 0.25;
const DEFAULT_PROMPT = 'B 건설 · E 부여대 · I 인벤토리 · H 업적 · M 미니맵';

const PRESET_NAME_BY_ID = new Map(FRAME_PRESETS.map((p) => [p.id, p.name]));

/* ------------------------------------------------------------------ helpers */

function num(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ratio(current, max) {
  const c = num(current, 0);
  const m = num(max, 0);
  if (!(m > 0)) return 0;
  return Math.min(1, Math.max(0, c / m));
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fmt(value) {
  return Math.round(num(value, 0)).toLocaleString('en-US');
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// 값이 바뀔 때만 DOM을 건드린다 (프레임마다 레이아웃을 흔들지 않기 위해).
function setText(node, value) {
  if (!node) return;
  const v = value == null ? '' : String(value);
  if (node.__hudText === v) return;
  node.__hudText = v;
  node.textContent = v;
}

function setWidth(node, pct) {
  if (!node) return;
  const v = `${(clamp01(pct) * 100).toFixed(2)}%`;
  if (node.__hudWidth === v) return;
  node.__hudWidth = v;
  node.style.width = v;
}

function setClass(node, className, on) {
  if (!node) return;
  const has = node.classList.contains(className);
  if (has === !!on) return;
  node.classList.toggle(className, !!on);
}

function restartAnimation(node, className) {
  if (!node) return;
  node.classList.remove(className);
  // 강제 리플로우로 CSS 애니메이션을 처음부터 다시 재생한다.
  void node.offsetWidth;
  node.classList.add(className);
}

/* ---------------------------------------------------------------------- HUD */

export class HUD {
  constructor(game) {
    this.game = game ?? null;
    this.root = null;
    this.toastRoot = null;
    this.crosshair = null;
    this._crosshairPrefs = loadCrosshair();
    this._refs = Object.create(null);
    this._toasts = [];
    this._time = 0;
    this._lastPhase = null;
    this._bannerTimer = 0;
    this._bannerKey = null;
    this._phaseOverride = null;
    this._waveOverride = null;
    this._timeLeftOverride = null;
    this._promptOverride = null;
    this._buildOverride = null;
    this._flashTimer = 0;
    this._hitTimer = 0;
    this._active = null;
    this._lastHp = null;
    this._lastBaseHp = null;
    this._bossId = null;
    this._bossChip = null;
    this._lastHitAt = null;
    this._disposed = false;
    this._build();
  }

  /* ------------------------------------------------------------ DOM 최초 1회 */

  _build() {
    if (typeof document === 'undefined') return;
    this.root = document.getElementById('hud-root') || this._makeContainer('hud-root', 'hud-root');
    this.toastRoot = document.getElementById('toast-root') || this._makeContainer('toast-root', 'toast-root');
    this.crosshair = document.getElementById('crosshair') || null;
    this._buildHud();
    this._buildCrosshair();
  }

  // index.html 이 없더라도 죽지 않도록 최소 컨테이너를 만든다.
  _makeContainer(id, className) {
    const host = document.getElementById('app') || document.body;
    if (!host) return null;
    const node = el('div', className);
    node.id = id;
    host.appendChild(node);
    return node;
  }

  _reg(name, node) {
    this._refs[name] = node;
    return node;
  }

  _bar(parent, fillRef, extraClass) {
    const bar = el('div', `hud-bar${extraClass ? ` ${extraClass}` : ''}`);
    const fill = el('i', 'hud-bar-fill');
    bar.appendChild(fill);
    parent.appendChild(bar);
    this._reg(fillRef, fill);
    return bar;
  }

  _chip(parent, ref, icon, cls, label) {
    const chip = el('span', `hud-stat ${cls}`);
    if (label) chip.title = label;
    const ico = el('i', 'hud-ico', icon);
    const val = el('b', 'hud-val', '0');
    chip.appendChild(ico);
    chip.appendChild(val);
    parent.appendChild(chip);
    this._reg(ref, val);
    this._reg(`${ref}Chip`, chip);
    return chip;
  }

  _buildHud() {
    const root = this.root;
    if (!root) return;
    root.classList.add('hud-root');

    const hud = el('div', 'hud');
    this.hud = hud;
    root.appendChild(hud);

    /* --- 상단 자원 바 --- */
    const topbar = el('div', 'hud-topbar');
    this._chip(topbar, 'gold', '◆', 'hud-stat-gold', '골드');
    this._chip(topbar, 'wood', '❖', 'hud-stat-wood', '목재');
    this._chip(topbar, 'minerals', '✦', 'hud-stat-mineral', '광물 합계');
    this._chip(topbar, 'leather', '🟫', 'hud-stat-leather', '가죽 — 지형 몬스터를 잡아 얻습니다');
    this._chip(topbar, 'arrows', '🏹', 'hud-stat-arrows', '화살 — 제작대(C)에서 묶음으로 만듭니다 (활 계열이 1발씩 소모)');
    this._chip(topbar, 'turrets', '⌗', 'hud-stat-turret', '건설한 포탑');
    this._chip(topbar, 'power', '⚡', 'hud-stat-power', '전력 — 공급 / 소비 (kW) · 발전기를 세우고 전선으로 이으세요');
    this._chip(topbar, 'storage', '📦', 'hud-stat-storage', '저장고 — 쌓인 골드 · 목재 / 보관 용량');
    this._chip(topbar, 'preset', '▤', 'hud-stat-fps', '프레임 프리셋');
    this._chip(topbar, 'title', '★', 'hud-stat-title', '칭호');
    this._chip(topbar, 'job', '🎖', 'hud-stat-job', '직업');
    this._chip(topbar, 'wings', '🪶', 'hud-stat-wings', '요정의 날개 — 착용하면 하늘을 납니다');
    hud.appendChild(topbar);

    /* --- 하단 중앙: 철거 모드 --- */
    const demolish = el('div', 'hud-demolish');
    this._reg('demolish', demolish);
    this._reg('demolishTitle', demolish.appendChild(el('b', 'hud-demolish-title', '🔨 철거 모드')));
    this._reg('demolishSub', demolish.appendChild(el('span', 'hud-demolish-sub', '건물을 조준하고 좌클릭 · 재료 25% 환불')));
    hud.appendChild(demolish);

    /* --- 우상단: 현재 지역(티어 지역 · 히든 지역) --- */
    const regionRow = el('div', 'hud-region');
    this._reg('regionGlyph', regionRow.appendChild(el('span', 'hud-region-glyph', '🏰')));
    this._reg('regionName', regionRow.appendChild(el('b', 'hud-region-name', '기지 안전 지대')));
    this._reg('regionDist', regionRow.appendChild(el('span', 'hud-region-dist', '0m')));
    this._refs.region = regionRow;
    hud.appendChild(regionRow);

    /* --- 좌상단 웨이브 패널 --- */
    const wavePanel = el('div', 'hud-panel hud-wave');
    const waveHead = el('div', 'hud-wave-head');
    waveHead.appendChild(el('span', 'hud-label', '웨이브'));
    this._reg('wave', waveHead.appendChild(el('b', 'hud-wave-num', '0')));
    wavePanel.appendChild(waveHead);

    this._reg('phase', wavePanel.appendChild(el('div', 'hud-phase', PHASE_LABEL.idle)));

    const countdown = el('div', 'hud-countdown');
    const cdBar = el('div', 'hud-bar hud-countdown-bar');
    this._reg('countdownFill', cdBar.appendChild(el('i', '')));
    countdown.appendChild(cdBar);
    this._reg('countdownText', countdown.appendChild(el('span', 'hud-countdown-text', '대기 중')));
    wavePanel.appendChild(countdown);

    const enemiesRow = el('div', 'hud-enemies');
    enemiesRow.appendChild(el('span', 'hud-label', '남은 적'));
    this._reg('enemies', enemiesRow.appendChild(el('b', 'hud-enemies-val', '0 / 0')));
    wavePanel.appendChild(enemiesRow);
    this._reg('enemiesRow', enemiesRow);
    hud.appendChild(wavePanel);

    /* --- 상단 중앙: 보스 체력바 --- */
    const bossBar = el('div', 'hud-bossbar');
    const bossHead = el('div', 'hud-boss-head');
    this._reg('bossTag', bossHead.appendChild(el('span', 'hud-boss-tag', '보스')));
    this._reg('bossName', bossHead.appendChild(el('b', 'hud-boss-name', '')));
    this._reg('bossWave', bossHead.appendChild(el('span', 'hud-boss-wave', '')));
    bossBar.appendChild(bossHead);
    const bossGauge = el('div', 'hud-bar hud-boss-gauge');
    this._reg('bossChip', bossGauge.appendChild(el('i', 'hud-boss-chip')));
    this._reg('bossFill', bossGauge.appendChild(el('i', 'hud-bar-fill')));
    bossBar.appendChild(bossGauge);
    const bossFoot = el('div', 'hud-boss-foot');
    this._reg('bossHpText', bossFoot.appendChild(el('span', 'hud-boss-hp', '0 / 0')));
    this._reg('bossAbility', bossFoot.appendChild(el('span', 'hud-boss-ability', '')));
    bossBar.appendChild(bossFoot);
    this._reg('bossBar', bossBar);
    hud.appendChild(bossBar);

    /* --- 좌하단 바이탈 --- */
    const vitals = el('div', 'hud-vitals');

    const baseBox = el('div', 'hud-vital hud-vital-base');
    const baseHead = el('div', 'hud-vital-head');
    baseHead.appendChild(el('span', 'hud-label', '기지 체력'));
    this._reg('baseHpText', baseHead.appendChild(el('span', '', '0 / 0')));
    baseBox.appendChild(baseHead);
    const baseBar = this._bar(baseBox, 'baseHpFill', 'hud-bar-base'); // 1단: 체력
    const shieldBar = this._bar(baseBox, 'baseShieldFill', 'hud-bar-shield'); // 2단: 실드
    const baseSub = el('div', 'hud-sub');
    baseSub.appendChild(el('span', 'hud-label', '실드'));
    this._reg('baseShieldText', baseSub.appendChild(el('span', '', '0 / 0')));
    baseBox.appendChild(baseSub);
    this._reg('baseBox', baseBox);
    vitals.appendChild(baseBox);
    this._reg('baseBar', baseBar);
    this._reg('shieldBar', shieldBar);

    const playerBox = el('div', 'hud-vital hud-vital-player');
    const hpHead = el('div', 'hud-vital-head');
    hpHead.appendChild(el('span', 'hud-label', '체력'));
    this._reg('hpText', hpHead.appendChild(el('span', '', '0 / 0')));
    playerBox.appendChild(hpHead);
    const hpBar = this._bar(playerBox, 'hpFill', 'hud-bar-hp');
    const manaHead = el('div', 'hud-vital-head hud-vital-head-mana');
    manaHead.appendChild(el('span', 'hud-label', '마나'));
    this._reg('manaText', manaHead.appendChild(el('span', '', '0 / 0')));
    playerBox.appendChild(manaHead);
    this._bar(playerBox, 'manaFill', 'hud-bar-mana');
    this._reg('playerBox', playerBox);
    this._reg('hpBar', hpBar);
    vitals.appendChild(playerBox);
    hud.appendChild(vitals);

    /* --- 중앙 배너 --- */
    const banner = el('div', 'hud-banner');
    this._reg('bannerWave', banner.appendChild(el('div', 'hud-banner-wave', '요새의 수호자')));
    this._reg('bannerHint', banner.appendChild(el('div', 'hud-banner-hint', PHASE_HINT.idle)));
    hud.appendChild(banner);
    this._reg('banner', banner);

    /* --- 하단 중앙: 건설 힌트 + 상호작용 프롬프트 --- */
    const bottom = el('div', 'hud-bottom');

    const build = el('div', 'hud-build hidden');
    build.appendChild(el('span', 'hud-build-key', 'B'));
    this._reg('buildName', build.appendChild(el('span', 'hud-build-name', '-')));
    this._reg('buildCost', build.appendChild(el('span', 'hud-build-cost', '')));
    this._reg('buildState', build.appendChild(el('span', 'hud-build-state', '')));
    bottom.appendChild(build);
    this._reg('build', build);

    // 장착한 무기의 스킬 키·이름 — 무기를 바꾸면 즉시 갱신된다.
    const skill = el('div', 'hud-weaponskill hidden');
    this._reg('weaponSkillKey', skill.appendChild(el('span', 'hud-weaponskill-key', 'R')));
    const skillBody = el('div', 'hud-weaponskill-body');
    this._reg('weaponSkillLabel', skillBody.appendChild(el('span', 'hud-weaponskill-label', '무기 스킬')));
    this._reg('weaponSkillName', skillBody.appendChild(el('b', 'hud-weaponskill-name', '—')));
    skill.appendChild(skillBody);
    this._reg('weaponSkillCool', skill.appendChild(el('span', 'hud-weaponskill-cool', '준비됨')));
    bottom.appendChild(skill);
    this._reg('weaponSkill', skill);

    const prompt = el('div', 'hud-prompt is-passive');
    this._reg('promptKey', prompt.appendChild(el('span', 'hud-prompt-key', 'E')));
    this._reg('promptText', prompt.appendChild(el('span', 'hud-prompt-text', DEFAULT_PROMPT)));
    bottom.appendChild(prompt);
    this._reg('prompt', prompt);

    hud.appendChild(bottom);

    /* --- 오버레이: 저체력 비네트 + 피격 플래시 --- */
    this._reg('vignette', hud.appendChild(el('div', 'hud-vignette')));
    this._reg('damage', hud.appendChild(el('div', 'hud-damage')));
  }

  _buildCrosshair() {
    const ch = this.crosshair;
    if (!ch) return;
    // index.html 구조가 달라도 명중 표시는 살아 있어야 한다.
    if (!ch.querySelector('.crosshair-hit')) {
      ch.appendChild(el('span', 'crosshair-hit'));
    }
    if (!ch.querySelector('.crosshair-dot')) {
      ch.appendChild(el('span', 'crosshair-dot'));
    }
    applyCrosshair(ch, this._crosshairPrefs);
  }

  /** 설정 패널에서 바뀐 조준선 설정을 즉시 반영한다. */
  setCrosshair(prefs) {
    this._crosshairPrefs = applyCrosshair(this.crosshair, prefs) ?? this._crosshairPrefs;
    return this._crosshairPrefs;
  }

  /**
   * 철거 모드 HUD — active/target/allowed.
   *  · 조준선은 붉게 바뀌고, 대상이 있으면 이름·티어와 25% 환불 안내를 보여 준다.
   *  · 동료 건물(allowed=false)은 철거 대신 이유를 보여 준다.
   */
  setDemolish(state = {}) {
    const active = state.active === true;
    // 조준선 색은 applyCrosshair 가 인라인 변수로 넣으므로 CSS 클래스만으로는 안 바뀐다.
    //  철거 모드에 들어갈 때만 적색을 덧씌우고, 끝나면 사용자가 고른 색으로 되돌린다.
    if (active !== (this._demolishOn === true)) {
      this._demolishOn = active;
      applyCrosshair(this.crosshair, active ? { ...this._crosshairPrefs, color: 'red' } : this._crosshairPrefs);
    }
    this.crosshair?.classList.toggle('is-demolish', active);
    const box = this._refs.demolish;
    if (!box) return this;
    const target = state.target ?? null;
    const allowed = state.allowed !== false;
    box.classList.toggle('is-on', active);
    box.classList.toggle('is-blocked', active && Boolean(target) && !allowed);
    const name = target?.type?.name ?? target?.type?.id ?? '건물';
    const tier = Number(target?.tier) || 1;
    const title = this._refs.demolishTitle;
    const sub = this._refs.demolishSub;
    if (title) {
      title.textContent = !active
        ? '🔨 철거 모드'
        : target && !allowed
          ? `⛔ ${name} — 동료 건물`
          : target
            ? `🔨 ${name} · T${tier}`
            : '🔨 철거 모드 — 건물을 조준하세요';
    }
    if (sub) {
      sub.textContent = !active
        ? '건물을 조준하고 좌클릭 · 재료 25% 환불'
        : target && !allowed
          ? '멀티플레이에서는 내가 지은 건물만 철거할 수 있습니다'
          : '좌클릭 철거 — 재료 25% 환불 · Z 취소';
    }
    return this;
  }

  /* --------------------------------------------------------------- 공개 API */

  // 외부에서 페이즈를 직접 지정할 때 쓴다. game.waves 값이 있으면 그쪽이 우선한다.
  setPhase(phase, wave, timeLeft) {
    this._phaseOverride = phase == null ? null : String(phase);
    this._waveOverride = Number.isFinite(wave) ? wave : null;
    this._timeLeftOverride = Number.isFinite(timeLeft) ? timeLeft : null;
    const live = this.game?.waves?.phase ?? null;
    if (!live) this._showBanner(this._phaseOverride ?? 'idle', this._waveOverride ?? 0, 0);
    return this;
  }

  // 상호작용 프롬프트 슬롯 (예: 'E', '부여대 사용')
  setPrompt(key, text) {
    if (text == null && key == null) {
      this._promptOverride = null;
      return this;
    }
    this._promptOverride = { key: key == null ? null : String(key), text: text == null ? '' : String(text) };
    return this;
  }

  clearPrompt() {
    this._promptOverride = null;
    return this;
  }

  // 건설 모드 힌트를 외부에서 강제로 지정 (null 이면 game 컨텍스트에서 읽는다)
  setBuildHint(selection) {
    this._buildOverride = selection ?? null;
    return this;
  }

  // 명중 순간 호출하면 크로스헤어에 히트마커가 뜬다.
  hitMarker() {
    this._hitTimer = HIT_MARKER_TIME;
    restartAnimation(this.crosshair, 'is-hit');
    return this;
  }

  notify(text, type = 'info') {
    if (this._disposed) return null;
    const message = text == null ? '' : String(text);
    if (!message) return null;
    const root = this.toastRoot;
    if (!root) return null;

    const kind = TOAST_TYPES.includes(type) ? type : 'info';
    const life = TOAST_LIFE[kind] ?? TOAST_LIFE.info;

    const node = el('div', `toast toast-${kind}`);
    node.style.setProperty('--toast-life', `${life}s`);
    node.appendChild(el('span', 'toast-icon', TOAST_ICON[kind]));
    node.appendChild(el('span', 'toast-text', message));
    root.appendChild(node);

    const entry = { node, life, dying: false };
    this._toasts.push(entry);

    // 동시 표시 개수 상한 — 가장 오래된 토스트를 즉시 걷어낸다.
    while (this._toasts.length > MAX_TOASTS) {
      this._removeToast(this._toasts[0]);
    }
    return entry;
  }

  update(dt) {
    if (this._disposed) return;
    const game = this.game;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.5) : 0;
    this._time += step;

    /* ---------- 상태 / 가시성 ---------- */
    const state = game?.state ?? 'playing';
    const active = state !== 'menu' && state !== 'loading';
    if (active !== this._active) {
      this._active = active;
      setClass(this.hud, 'is-hidden', !active);
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.toggle('hud-inactive', !active);
      }
    }
    // 패널(제작·인벤·건설 등)이 열려 커서로 UI 를 조작하는 동안에는 조준선을 감춘다.
    const panelOpen = Boolean(game?.ui?.panels?.hasOpen?.());
    setClass(this.crosshair, 'is-hidden', !active || state === 'paused' || panelOpen);

    /* ---------- 페이즈 / 웨이브 ---------- */
    const waves = game?.waves ?? null;
    const livePhase = waves?.phase ?? game?.phase ?? null;
    const phase = livePhase ?? this._phaseOverride ?? 'idle';
    const wave = num(waves?.wave ?? this._waveOverride, 0);
    const timeLeft = Math.max(0, num(waves?.timeLeft ?? this._timeLeftOverride, 0));

    if (phase !== this._lastPhase) {
      this._lastPhase = phase;
      this._bannerTimer = BANNER_HOLD;
      this._bannerKey = null;
    }
    this._bannerTimer = Math.max(0, this._bannerTimer - step);

    const prepTotal = wave <= 1 ? num(WAVE_CONFIG.firstWavePrep, num(WAVE_CONFIG.prepTime, 30)) : num(WAVE_CONFIG.prepTime, 30);
    const countdownRatio = phase === 'prep' ? ratio(timeLeft, prepTotal) : phase === 'combat' || phase === 'complete' ? 1 : 0;

    setText(this._refs.wave, fmt(wave));
    setText(this._refs.phase, PHASE_LABEL[phase] ?? String(phase));
    setWidth(this._refs.countdownFill, countdownRatio);
    if (phase === 'prep') {
      setText(this._refs.countdownText, `다음 웨이브까지 ${Math.ceil(timeLeft)}초`);
    } else if (phase === 'combat') {
      setText(this._refs.countdownText, '전투 진행 중');
    } else if (phase === 'complete') {
      setText(this._refs.countdownText, '정산 중…');
    } else {
      setText(this._refs.countdownText, '대기 중');
    }

    const bannerVisible =
      phase === 'prep' || phase === 'complete' || phase === 'gameover' || phase === 'idle' || this._bannerTimer > 0;
    const bannerKey = `${phase}|${wave}|${phase === 'prep' ? Math.ceil(timeLeft) : ''}|${phase === 'gameover' ? 'over' : ''}`;
    if (bannerKey !== this._bannerKey) {
      this._bannerKey = bannerKey;
      const headline =
        phase === 'prep' ? `웨이브 ${wave} 준비` : phase === 'combat' ? `웨이브 ${wave} 시작` : PHASE_LABEL[phase] ?? '대기';
      setText(this._refs.bannerWave, headline);
      setText(this._refs.bannerHint, PHASE_HINT[phase] ?? '');
    }
    setClass(this._refs.banner, 'is-visible', bannerVisible && active);

    /* ---------- 적 ---------- */
    const list = Array.isArray(game?.enemies) ? game.enemies : Array.isArray(waves?.enemies) ? waves.enemies : null;
    let total = 0;
    let alive = 0;
    let roamers = 0;
    if (list) {
      for (const e of list) {
        if (!e) continue;
        // 지형 야생 몬스터는 웨이브 정산과 무관하다 — 따로 세어 "+야생 N" 으로 보여 준다.
        if (e.roaming === true || e.spawnerKind === 'region') {
          if (e.alive !== false) roamers++;
          continue;
        }
        total++;
        if (e.alive !== false) alive++;
      }
    }
    if (Number.isFinite(waves?.alive)) alive = Math.max(0, Math.round(waves.alive));
    setText(this._refs.enemies, roamers > 0 ? `${fmt(alive)} / ${fmt(total)} +야생 ${fmt(roamers)}` : `${fmt(alive)} / ${fmt(total)}`);
    setClass(this._refs.enemiesRow, 'is-hot', phase === 'combat' && alive > 0);

    /* ---------- 보스 체력바 ---------- */
    this._updateBossBar(game, list, active, step);
    this._updateRegion(game, active);

    /* ---------- 경제 / 포탑 / 프리셋 / 칭호 ---------- */
    const eco = game?.economy ?? null;
    setText(this._refs.gold, fmt(num(eco?.gold ?? game?.gold, 0)));
    setText(this._refs.wood, fmt(num(eco?.wood ?? game?.wood, 0)));
    setText(this._refs.minerals, fmt(this._totalMinerals(eco)));
    setText(this._refs.leather, fmt(num(eco?.totalLeather?.() ?? game?.leatherTotal, 0)));
    const arrowTotal = num(eco?.totalArrows?.() ?? 0, 0);
    setText(this._refs.arrows, fmt(arrowTotal));
    if (this._refs.arrowsChip) {
      this._refs.arrowsChip.title =
        game?.staff?.weapon?.kind === 'bow'
          ? `🏹 화살 ${fmt(arrowTotal)}발 — 장착한 활이 1발씩 소모합니다`
          : '화살 — 제작대(C)에서 묶음으로 만듭니다 (활 계열이 1발씩 소모)';
    }

    const turretCount =
      typeof game?.turrets?.total === 'function'
        ? num(game.turrets.total(), 0)
        : Array.isArray(game?.towers)
          ? game.towers.length
          : 0;
    setText(this._refs.turrets, fmt(turretCount));

    // 전기 — 공급/소비와 정전 여부
    const power = typeof game?.powerSummary === 'function' ? game.powerSummary() : null;
    if (power) {
      const supply = Math.round(num(power.supply, 0));
      const demand = Math.round(num(power.demand, 0));
      setText(this._refs.power, demand > 0 ? `${fmt(supply)}/${fmt(demand)}kW` : `${fmt(supply)}kW`);
      setClass(this._refs.powerChip, 'is-low', power.short === true);
      if (this._refs.powerChip) {
        this._refs.powerChip.title =
          `전력 — 발전기 ${fmt(num(power.generators, 0))} · 전선 ${fmt(num(power.cables, 0))} · 소비 건물 ${fmt(num(power.consumers, 0))}` +
          (power.short ? ` · ⚠ 부족 ${Math.round(num(power.shortfall, 0))}kW (정지 ${fmt(num(power.stopped, 0))}개)` : ' · 정상');
      }
    }

    // 저장고 — 쌓인 자원 / 용량
    const store = typeof game?.storageSummary === 'function' ? game.storageSummary() : null;
    if (store) {
      const count = num(store.count, 0);
      setText(
        this._refs.storage,
        count > 0 ? `${fmt(Math.floor(num(store.gold, 0)))}g ${fmt(Math.floor(num(store.wood, 0)))}w` : '없음'
      );
      setClass(this._refs.storageChip, 'is-empty', count === 0);
      if (this._refs.storageChip) {
        this._refs.storageChip.title =
          count > 0
            ? `저장고 ${fmt(count)}개 — 보관 용량 ${fmt(num(store.capacity, 0))} · 전력 정상 ${fmt(num(store.powered, 0))}개 · 반경 안이면 자동 수거`
            : '저장고가 없습니다 — 🏗 시설에서 저장고를 세우면 자원을 모아 줍니다';
      }
    }

    const presetName = game?.preset?.name ?? PRESET_NAME_BY_ID.get(game?.quality) ?? '기본';
    setText(this._refs.preset, presetName);

    const titleObj = typeof game?.achievements?.title === 'function' ? game.achievements.title() : null;
    setText(this._refs.title, titleObj?.name ?? game?.title?.name ?? '수호자');

    // 요정의 날개 — 착용/비행 상태
    const wingPlayer = game?.player ?? null;
    const wingLabel = game?.wings?.equippedName ?? (game?.adminFlight ? '관리자 비행' : null);
    const isFlying = Boolean(wingPlayer?.flying);
    setText(this._refs.wings, isFlying ? `비행 ${Math.round(num(wingPlayer?.position?.y, 0))}m` : wingLabel ?? '없음');
    setClass(this._refs.wingsChip, 'is-flying', isFlying);
    setClass(this._refs.wingsChip, 'is-equipped', Boolean(wingLabel));

    // 전직 — 현재 직업(단계 포함). classes 가 없으면 초심자로 표시한다.
    const classLabel = typeof game?.classes?.label === 'string' && game.classes.label ? game.classes.label : '🧭 초심자';
    setText(this._refs.job, classLabel);
    if (this._refs.jobChip) {
      const mods = game?.classes?.modifiers ?? null;
      this._refs.jobChip.title = mods
        ? `직업 패시브 — 무기 피해 ×${num(mods.weaponDamage, 1).toFixed(2)} · 이동 ×${num(mods.moveSpeed, 1).toFixed(2)} · 마나 ×${num(mods.manaRegen, 1).toFixed(2)}`
        : '전직하면 계열 무기 전용 패시브가 생깁니다'
    }

    /* ---------- 기지 / 플레이어 ---------- */
    const base = game?.base ?? null;
    const baseHp = num(base?.hp, 0);
    const baseMaxHp = num(base?.maxHp, 0);
    const shield = num(base?.shield, 0);
    const shieldMax = num(base?.maxShield, 0);
    const baseRatio = ratio(baseHp, baseMaxHp);

    setText(this._refs.baseHpText, `${fmt(baseHp)} / ${fmt(baseMaxHp)}`);
    setWidth(this._refs.baseHpFill, baseRatio);
    setWidth(this._refs.baseShieldFill, ratio(shield, shieldMax));
    setText(this._refs.baseShieldText, `${fmt(shield)} / ${fmt(shieldMax)}`);
    setClass(this._refs.baseBox, 'is-low', baseMaxHp > 0 && baseRatio < LOW_BAR_RATIO);
    setClass(this._refs.baseBar, 'is-low', baseMaxHp > 0 && baseRatio < LOW_BAR_RATIO);

    const player = game?.player ?? null;
    const hp = num(player?.hp, 0);
    const maxHp = num(player?.maxHp, 0);
    const mana = num(player?.mana, 0);
    const maxMana = num(player?.maxMana, 0);
    const hpRatio = ratio(hp, maxHp);

    setText(this._refs.hpText, `${fmt(hp)} / ${fmt(maxHp)}`);
    setWidth(this._refs.hpFill, hpRatio);
    setText(this._refs.manaText, `${fmt(mana)} / ${fmt(maxMana)}`);
    setWidth(this._refs.manaFill, ratio(mana, maxMana));
    setClass(this._refs.hpBar, 'is-low', maxHp > 0 && hpRatio < LOW_BAR_RATIO);
    setClass(this._refs.playerBox, 'is-low', maxHp > 0 && hp > 0 && hpRatio < LOW_HP_RATIO);

    /* ---------- 크로스헤어 ---------- */
    const mouse = game?.input?.mouse ?? null;
    const aiming = Boolean(mouse?.right || player?.aiming || game?.aiming);
    const casting = Boolean(player?.casting || game?.casting || game?.spells?.casting);
    setClass(this.crosshair, 'is-aiming', aiming && active);
    setClass(this.crosshair, 'is-casting', casting && active);
    if (this._hitTimer > 0) {
      this._hitTimer -= step;
      if (this._hitTimer <= 0) setClass(this.crosshair, 'is-hit', false);
    }

    /* ---------- 피격 플래시 ---------- */
    if (this._lastHp != null && hp < this._lastHp - 0.5) this._triggerDamage();
    if (this._lastBaseHp != null && baseHp < this._lastBaseHp - 0.5) this._triggerDamage();
    this._lastHp = hp;
    this._lastBaseHp = baseHp;
    if (this._flashTimer > 0) {
      this._flashTimer -= step;
      if (this._flashTimer <= 0) setClass(this._refs.damage, 'is-hit', false);
    }

    // 명중 이벤트(있으면)로 히트마커를 자동 표시
    const hitAt = Number.isFinite(game?.player?.hitAt) ? game.player.hitAt : Number.isFinite(game?.hitAt) ? game.hitAt : null;
    if (hitAt != null && hitAt > 0 && hitAt !== this._lastHitAt) {
      this._lastHitAt = hitAt;
      this.hitMarker();
    }

    /* ---------- 저체력 비네트 ---------- */
    const vignetteOn = active && maxHp > 0 && hp > 0 && hpRatio < LOW_HP_RATIO;
    setClass(this._refs.vignette, 'is-active', vignetteOn);
    setClass(this.crosshair, 'is-low-hp', vignetteOn);
    if (vignetteOn && this._refs.vignette) {
      const strength = (0.35 + (1 - hpRatio / LOW_HP_RATIO) * 0.5).toFixed(2);
      if (this._refs.vignette.__hudStrength !== strength) {
        this._refs.vignette.__hudStrength = strength;
        this._refs.vignette.style.setProperty('--vignette-strength', strength);
      }
    }

    /* ---------- 건설 힌트 ---------- */
    this._updateBuildHint(game, active);
    /* ---------- 무기 스킬 (키 + 이름 + 쿨다운) ---------- */
    this._updateWeaponSkill(game, active);

    /* ---------- 상호작용 프롬프트 ---------- */
    this._updatePrompt(game, active);

    /* ---------- 토스트 수명 ---------- */
    this._updateToasts(step);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    for (const entry of this._toasts) {
      entry.node?.remove?.();
    }
    this._toasts.length = 0;

    if (this.hud?.parentNode) this.hud.parentNode.removeChild(this.hud);
    if (this.root) this.root.classList.remove('hud-root');
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('hud-inactive');
    }

    this.hud = null;
    this._refs = Object.create(null);
    this.game = null;
    this.crosshair = null;
  }

  /* --------------------------------------------------------------- 내부 구현 */

  /** 살아있는 보스 중 가장 강한 개체(게임이 bossInfo 를 주면 그쪽 우선) */
  _findBoss(list) {
    const arr = Array.isArray(list) ? list : [];
    let best = null;
    for (const e of arr) {
      if (!e || e.alive === false || !e.isBoss) continue;
      if (!best || num(e.maxHp, 0) > num(best.maxHp, 0)) best = e;
    }
    return best;
  }

  /**
   * 보스 체력바(상단 중앙) — 이름·체력·패턴과 지연 감소(칩) 게이지를 그린다.
   * 보스가 없거나 메뉴/로딩이면 숨긴다. 게임 객체가 없어도 절대 throw 하지 않는다.
   */
  _updateBossBar(game, list, active, step) {
    const node = this._refs.bossBar;
    if (!node) return;
    const info = game?.bossInfo ?? this._findBoss(list);
    if (!info || !active) {
      setClass(node, 'is-visible', false);
      this._bossId = null;
      this._bossChip = null;
      return;
    }
    const maxHp = Math.max(1, num(info.maxHp, 1));
    const ratio = clamp01(num(info.ratio, num(info.hp, 0) / maxHp));
    const id = info.id ?? info.typeId ?? 'boss';
    if (this._bossId !== id) {
      this._bossId = id;
      this._bossChip = ratio;
      restartAnimation(node, 'is-entering');
    }
    // 칩 게이지: 체력이 줄면 잠시 뒤따라 내려온다(얼마나 깎였는지 보인다)
    const chip = this._bossChip == null || ratio > this._bossChip ? ratio : Math.max(ratio, this._bossChip - step * 0.4);
    this._bossChip = chip;

    setClass(node, 'is-visible', true);
    setText(this._refs.bossName, info.name ?? '보스');
    setText(this._refs.bossWave, info.wave ? `웨이브 ${fmt(info.wave)}` : '');
    setText(this._refs.bossHpText, `${fmt(Math.max(0, Math.round(num(info.hp, 0))))} / ${fmt(Math.round(maxHp))}`);
    setWidth(this._refs.bossFill, ratio);
    setWidth(this._refs.bossChip, chip);
    setClass(node, 'is-low', ratio <= LOW_HP_RATIO);
    setClass(node, 'is-shielded', !!info.shielded);
    const label = BOSS_ABILITY_LABEL[info.ability] ?? (info.desc || '');
    setText(this._refs.bossAbility, info.shielded ? `실드 전개 중${label ? ` · ${label}` : ''}` : label);
  }

  /** 우상단 지역 표시 — world 가 없으면 기지 안전 지대로 표시한다(절대 throw 하지 않는다) */
  _updateRegion(game, active) {
    const node = this._refs.region;
    if (!node) return;
    setClass(node, 'is-hidden-region', false);
    if (!active) {
      setClass(node, 'is-visible', false);
      return;
    }
    let info = null;
    try {
      const p = game?.player?.position;
      info = p ? game?.world?.regionSummary?.(p.x, p.z) ?? null : null;
    } catch {
      info = null;
    }
    if (!info) {
      setText(this._refs.regionName, '기지 안전 지대');
      setText(this._refs.regionGlyph, '🏰');
      setText(this._refs.regionDist, '0m');
      setClass(node, 'is-visible', true);
      return;
    }
    setText(this._refs.regionGlyph, info.glyph ?? '🏰');
    // 이 지역에 살아 있는 야생 몬스터 수(로밍) — 있으면 이름 옆에 붙인다
    let roamers = 0;
    for (const e of Array.isArray(game?.enemies) ? game.enemies : []) {
      if (e?.alive !== false && (e?.roaming === true || e?.spawnerKind === 'region')) roamers++;
    }
    const regionLabel = info.name ?? '알 수 없는 지역';
    setText(this._refs.regionName, roamers > 0 ? `${regionLabel} · 야생 ${fmt(roamers)}` : regionLabel);
    setText(this._refs.regionDist, `${fmt(Math.round(num(info.distance, 0)))}m`);
    setClass(node, 'is-hidden-region', !!info.hidden);
    setClass(node, 'is-visible', true);
  }

  _totalMinerals(eco) {
    if (typeof eco?.totalMinerals === 'function') {
      const v = eco.totalMinerals();
      if (Number.isFinite(v)) return v;
    }
    const bag = eco?.minerals;
    if (!bag || typeof bag !== 'object') return 0;
    let sum = 0;
    for (const key in bag) {
      if (Object.prototype.hasOwnProperty.call(bag, key)) sum += num(bag[key], 0);
    }
    return sum;
  }

  _triggerDamage() {
    this._flashTimer = DAMAGE_FLASH_TIME;
    restartAnimation(this._refs.damage, 'is-hit');
  }

  _removeToast(entry) {
    if (!entry) return;
    const idx = this._toasts.indexOf(entry);
    if (idx >= 0) this._toasts.splice(idx, 1);
    entry.node?.remove?.();
  }

  _updateToasts(step) {
    if (!this._toasts.length || step <= 0) return;
    for (let i = this._toasts.length - 1; i >= 0; i--) {
      const entry = this._toasts[i];
      entry.life -= step;
      if (entry.life > 0) continue;
      if (!entry.dying) {
        entry.dying = true;
        entry.life = TOAST_FADE;
        entry.node?.classList?.add('is-out');
        continue;
      }
      this._removeToast(entry);
    }
  }

  _showBanner(phase, wave) {
    setText(this._refs.bannerWave, phase === 'prep' ? `웨이브 ${fmt(wave)} 준비` : PHASE_LABEL[phase] ?? '대기');
    setText(this._refs.bannerHint, PHASE_HINT[phase] ?? '');
    setClass(this._refs.banner, 'is-visible', true);
  }

  // game 컨텍스트에서 "현재 선택된 포탑"을 최대한 방어적으로 찾아낸다.
  _readBuildSelection(game) {
    if (!game) return null;
    const candidates = [
      game.buildSelection,
      game.selectedTurretId,
      game.selectedTurret,
      game.build?.selection,
      game.build?.typeId,
      game.build?.selected,
      game.ui?.panels?.selectedTurretId,
      game.ui?.panels?.selection
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      if (typeof candidate === 'string') {
        return { id: candidate, def: TURRET_BY_ID[candidate] ?? null };
      }
      if (typeof candidate === 'object') {
        const id = candidate.id ?? candidate.typeId ?? null;
        const def = (id && TURRET_BY_ID[id]) || (candidate.name ? candidate : null);
        if (def) return { id: id ?? def.id ?? null, def };
      }
    }
    return null;
  }

  _affordableRaw(eco, cost) {
    if (!cost) return true;
    if (num(eco?.gold, 0) < num(cost.gold, 0)) return false;
    if (num(eco?.wood, 0) < num(cost.wood, 0)) return false;
    const need = cost.minerals;
    if (need && typeof need === 'object') {
      for (const key in need) {
        if (!Object.prototype.hasOwnProperty.call(need, key)) continue;
        const have = typeof eco?.getMineral === 'function' ? num(eco.getMineral(key), 0) : num(eco?.minerals?.[key], 0);
        if (have < num(need[key], 0)) return false;
      }
    }
    return true;
  }

  _costText(cost) {
    if (!cost) return '';
    const parts = [];
    if (num(cost.gold, 0) > 0) parts.push(`골드 ${fmt(cost.gold)}`);
    if (num(cost.wood, 0) > 0) parts.push(`목재 ${fmt(cost.wood)}`);
    if (cost.minerals && typeof cost.minerals === 'object') {
      let count = 0;
      for (const key in cost.minerals) {
        if (Object.prototype.hasOwnProperty.call(cost.minerals, key)) count += num(cost.minerals[key], 0);
      }
      if (count > 0) parts.push(`광물 ${fmt(count)}`);
    }
    return parts.join(' · ');
  }

  /** 장착 무기의 스킬 키·이름·쿨다운 — game.weaponSkill() 이 없으면 숨긴다(스텁 안전). */
  _updateWeaponSkill(game, active) {
    const box = this._refs.weaponSkill;
    if (!box) return;
    const info = typeof game?.weaponSkill === 'function' ? game.weaponSkill() : null;
    const show = Boolean(active && info && info.name);
    box.classList.toggle('hidden', !show);
    if (!show) return;
    setText(this._refs.weaponSkillKey, info.key ?? 'R');
    setText(this._refs.weaponSkillLabel, info.label ?? '무기 스킬');
    setText(this._refs.weaponSkillName, info.name);
    const cooling = info.ready === false && Number(info.readyIn) > 0;
    setClass(box, 'is-cooling', cooling);
    setClass(box, 'is-relic', info.ultimate === 'galaxyNight');
    setText(
      this._refs.weaponSkillCool,
      cooling ? `${Math.ceil(Number(info.readyIn))}초` : info.ultimate ? '준비됨' : '연사'
    );
    box.title = cooling
      ? `${info.key} — ${info.name} · ${Math.ceil(Number(info.readyIn))}초 후 사용 가능`
      : `${info.key} — ${info.name} · 지금 사용할 수 있습니다`;
  }

  _updateBuildHint(game, active) {
    const node = this._refs.build;
    if (!node) return;

    const selection = this._buildOverride ?? this._readBuildSelection(game);
    const flag = game?.buildMode ?? game?.build?.active ?? game?.building ?? null;
    const buildActive = Boolean(selection) && (flag == null ? true : Boolean(flag));
    setClass(node, 'hidden', !buildActive || !active);
    if (!buildActive || !active) return;

    const def = selection.def ?? null;
    const categoryName = def?.category ? TURRET_CATEGORIES[def.category]?.name ?? def.category : '포탑';
    const tier = def?.tier ? ` T${def.tier}` : '';
    setText(this._refs.buildName, def?.name ? `${def.name}${tier} · ${categoryName}` : '포탑 선택 필요');

    const cost = def?.cost ?? null;
    setText(this._refs.buildCost, this._costText(cost));

    const eco = game?.economy ?? null;
    const affordable = typeof eco?.canAfford === 'function' ? Boolean(eco.canAfford(cost ?? {})) : this._affordableRaw(eco, cost);
    setText(this._refs.buildState, cost ? (affordable ? '건설 가능' : '자원 부족') : '설치 위치를 지정하세요');
    setClass(node, 'is-poor', Boolean(cost) && !affordable);
  }

  _updatePrompt(game, active) {
    const node = this._refs.prompt;
    if (!node) return;

    let prompt = this._promptOverride;
    if (!prompt) {
      const raw = game?.interaction ?? game?.prompt ?? game?.nearby ?? null;
      if (typeof raw === 'string') prompt = { key: null, text: raw };
      else if (raw && typeof raw === 'object') {
        prompt = { key: raw.key ?? raw.code ?? null, text: raw.text ?? raw.label ?? raw.name ?? '' };
      }
    }

    if (!active) {
      setClass(node, 'hidden', true);
      return;
    }
    setClass(node, 'hidden', false);

    if (prompt && prompt.text) {
      setClass(node, 'is-passive', false);
      setText(this._refs.promptKey, prompt.key ?? 'E');
      setText(this._refs.promptText, prompt.text);
    } else if (game?.player?.flying) {
      setClass(node, 'is-passive', true);
      setText(this._refs.promptText, 'Space 상승 · Shift 하강 · V 날개 접기');
    } else {
      setClass(node, 'is-passive', true);
      setText(this._refs.promptText, DEFAULT_PROMPT);
    }
  }
}

export default HUD;

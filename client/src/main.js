// 요새의 수호자 — 클라이언트 진입점. 모든 시스템을 조립하고 게임 루프를 돌린다.
import * as THREE from 'three';
import {
  VERSION,
  MAP,
  FRAME_PRESETS,
  DIFFICULTIES,
  MODES,
  MINERAL_TYPES,
  TURRETS,
  TURRET_BY_ID,
  SPELL_GRADES,
  RELIC_STAVES,
  STAFF_TIERS,
  ACHIEVEMENTS,
  MINERAL_COMBO_RECIPES,
  SEED_GALLERY,
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_MOTIONS,
  DREAM_TREE,
  weaponById,
  classStarterWeaponId,
  ultimateById,
  ultimateImpact,
  WAVE_CONFIG,
  BOSS_TYPE_BY_ID,
  FIST_WEAPON_ID,
  weaponOrFist,
  ARROW_ORDER_DESC,
  arrowById,
  weaponImpact
} from './data.js';
import { CRAFTING_TABLE_BY_ID } from './crafting.js';
import { fairyWingById } from './data.js';
import { CraftingSystem } from './systems/crafting.js';
import { createRNG, normalizeSeed } from './utils/rng.js';
import { createWorld } from './world/world.js';
import { Input, Player } from './player/player.js';
import { characterPayload, createCharacterStore, sanitizeCharacter, sanitizeRemoteCharacter } from './character.js';
import { animateCharacterAvatar, buildCharacterAvatar, disposeCharacterAvatar } from './avatar.js';
import { WeaponRig, buildWeaponMesh } from './player/weaponRig.js';
import { currentNickname } from './profile.js';
import { arrivalPoint, destinationById } from './travel.js';
import { consume as keyConsume, isDown as keyDown, keyCodes, keyLabel } from './keys.js';
import { SummonQueue } from './systems/summon-queue.js';
import { Arcana, hasArcanaTable } from './systems/arcana.js';
import { ENDLESS_UNLOCK_WAVE, isEndlessUnlocked, recordWave, recordCelestialKill, unlockEndless } from './progress.js';
import { ImpactFX } from './player/impacts.js';
import { ProjectileSystem } from './player/projectiles.js';
import { Economy } from './systems/economy.js';
import { AchievementSystem } from './systems/achievements.js';
import { GachaSystem } from './systems/gacha.js';
import { EnchantSystem } from './systems/enchant.js';
import { WaveSystem } from './systems/waves.js';
import { TurretSystem } from './systems/turrets.js';
import { SpellSystem } from './systems/spells.js';
import { FairySystem } from './systems/fairies.js';
import { ClassSystem } from './systems/classes.js';
import { AudioSystem } from './audio.js';
import { HUD } from './ui/hud.js';
import { EnemyHealthBars } from './ui/healthbars.js';
import { Minimap } from './ui/minimap.js';
import { PanelManager } from './ui/panels.js';
import { FPSMonitor, applyFramePreset } from './ui/fps.js';
import { MainMenu } from './ui/menu.js';
import { Lobby } from './ui/lobby.js';
import { codeFromUrl, inviteLink, resolveShareOrigin } from './utils/invite.js';
import { playCutscene } from './ui/cutscene.js';
import { net, auth, cloudSave, leaderboard, statsApi, netInfo, normalizeServerAddress, setApiBase } from './net.js';
import { BARE_HAND, harvestHint, harvestNode, pickHarvestNode } from './systems/gathering.js';
import { ADAPTIVE, AdaptiveResolution, formatScale, suggestPreset, stepUpId, MemoryGuard, formatMb } from './ui/adaptive.js';
import { AdminConsole } from './ui/console.js';
import { FriendsOverlay } from './ui/friends.js';
import { syncPointerLock } from './ui/pointer-lock.js';
import { openMiniGame, closeMiniGame, isMiniGameOpen } from './ui/minigame.js';
import { GrantQueue } from './systems/grants.js';
import { listSaves, pushSave, getSave, removeSave } from './systems/saves.js';
import { WingSystem } from './systems/wings.js';
import { CharacterItemSystem } from './systems/character-items.js';
import { FriendSystem } from './friends.js';
import { CHARACTER_ITEM_BY_ID } from './data.js';
import { WingRig } from './player/wings.js';
import { GearSystem } from './systems/gear.js';
import { RegionSpawner } from './systems/region-spawns.js';
import { GEAR_SLOTS, LEATHER_TYPES, leatherById, regionMonsterRoster } from './data.js';

const SAVE_KEY = 'fortress.save.v1';
const QUALITY_KEY = 'fortress.quality.v1';
const AUTOSAVE_MS = 60000;
// 그림자 맵 갱신 주기(초) — 태양은 고정이라 매 프레임 다시 그릴 필요가 없다
// 건물 회전(X) 판정 — 조준 사거리/원뿔 반경/좌표 매칭 허용 오차
// holdSpeed: R 을 누르고 있을 때의 연속 회전 속도(rad/s) · netHz: 회전 릴레이 전송 주기(Hz)
const TURRET_ROTATE = { reach: 9, cone: 1.5, match: 1.6, holdSpeed: 2.1, netHz: 12 };

// 예외를 삼키는 안전 실행 — UI 헬퍼(ui/panels.js)와 같은 의미. main.js 안에서도 쓴다.
const safe = (fn, fallback = undefined) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const SHADOW_INTERVAL = 0.05;

const GRADE_ORDER = SPELL_GRADES.map((g) => g.id);
const gradeRank = (id) => Math.max(0, GRADE_ORDER.indexOf(id));

// ─────────────────────────────────────────── 원격 플레이어 표시 (협동)
class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'remotePlayers';
    scene.add(this.group);
    this.map = new Map();
    this.elapsed = 0;
  }

  _make(id, nickname, character = null) {
    const look = character ? sanitizeRemoteCharacter(character) : null;
    const fallback = new THREE.Color().setHSL(((id.length * 57) % 360) / 360, 0.65, 0.6);
    const color = look?.color ?? fallback.getHex();
    const accent = look?.accent ?? fallback.clone().offsetHSL(0, 0, 0.12).getHex();
    const group = new THREE.Group();
    const avatar = buildCharacterAvatar({ color, accent, skin: look?.skin ?? 'guardian' });
    group.add(avatar);
    // 캐릭터 아이콘 + 이름표 — 캔버스가 없는 환경(헤드리스)에서는 조용히 생략한다.
    const tag = this._nameTag(nickname || id.slice(0, 5), look?.icon ?? '');
    if (tag) {
      tag.position.y = 2.5;
      group.add(tag);
      group.userData.tag = tag;
    }
    group.userData.nickname = nickname || id.slice(0, 5);
    group.userData.avatar = avatar;
    this.group.add(group);
    const entry = { group, avatar, tag, target: new THREE.Vector3(), yaw: 0, sit: false, sitAmount: 0, look };
    this.map.set(id, entry);
    return entry;
  }

  /** 머리 위 이름표(캔버스 텍스처) — 실패하면 null */
  _nameTag(text, icon = '') {
    try {
      const doc = globalThis.document;
      if (!doc?.createElement) return null;
      const canvas = doc.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext?.('2d');
      if (!ctx) return null;
      ctx.font = 'bold 30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(0, 10, 256, 44);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(icon ? icon + ' ' : '') + String(text).slice(0, 14), 128, 32);
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      sprite.scale.set(1.7, 0.42, 1);
      return sprite;
    } catch {
      return null;
    }
  }

  _applyLook(entry, character) {
    const look = sanitizeRemoteCharacter(character);
    const prev = entry.look;
    if (prev && prev.skin === look.skin && prev.color === look.color && prev.accent === look.accent) return;
    entry.look = look;
    // 외형이 바뀌면 3D 모델을 다시 만든다(색만 바꾸면 스킨 장비가 남는다).
    if (entry.avatar) {
      entry.group.remove(entry.avatar);
      disposeCharacterAvatar(entry.avatar);
    }
    entry.avatar = buildCharacterAvatar({ color: look.color, accent: look.accent, skin: look.skin });
    entry.group.add(entry.avatar);
    entry.group.userData.avatar = entry.avatar;
  }

  update(snapshot, localId) {
    if (!snapshot?.players) return;
    const seen = new Set();
    for (const [id, p] of Object.entries(snapshot.players)) {
      if (id === localId) continue;
      seen.add(id);
      const entry = this.map.get(id) || this._make(id, p.nickname, p.character);
      if (p.character) this._applyLook(entry, p.character);
      entry.target.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
      entry.yaw = p.yaw ?? 0;
      entry.sit = p.sit === true;
      entry.group.visible = p.alive !== false;
    }
    for (const [id, entry] of this.map) {
      if (seen.has(id)) continue;
      this._disposeEntry(entry);
      this.map.delete(id);
    }
  }

  animate(dt, world) {
    this.elapsed += Math.max(0, Number(dt) || 0);
    for (const entry of this.map.values()) {
      const g = entry.group;
      g.position.lerp(entry.target, Math.min(1, dt * 12));
      if (world?.getHeight) {
        const h = world.getHeight(g.position.x, g.position.z);
        if (Number.isFinite(h)) g.position.y = h;
      }
      g.rotation.y = entry.yaw;
      // 앉기 — 아바타 전체를 낮추고 살짝 기울인다(부드럽게 보간).
      entry.sitAmount += ((entry.sit ? 1 : 0) - entry.sitAmount) * Math.min(1, dt * 8);
      if (entry.avatar) {
        entry.avatar.position.y = -entry.sitAmount * 0.42;
        entry.avatar.rotation.x = entry.sitAmount * 0.12;
        animateCharacterAvatar(entry.avatar, this.elapsed, 0);
      }
      g.scale.y = 1 - entry.sitAmount * 0.04;
    }
  }

  /** 원격 플레이어 1명 정리 — 머티리얼·이름표 텍스처까지 반납한다(누수 → GPU 폭주 → 화면 멈춤 방지). */
  _disposeEntry(entry) {
    if (!entry) return;
    this.group.remove(entry.group);
    try {
      disposeCharacterAvatar(entry.avatar);
      const tag = entry.group.userData?.tag ?? null;
      if (tag) {
        const tex = tag.material?.map ?? null;
        tag.material?.dispose?.();
        tex?.dispose?.();
        tag.parent?.remove?.(tag);
      }
    } catch {
      /* 정리 실패는 무시 — 렌더러가 알아서 회수한다 */
    }
  }

  clear() {
    for (const entry of this.map.values()) this._disposeEntry(entry);
    this.map.clear();
  }
}

// ─────────────────────────────────────────── 게임
class Game {
  constructor() {
    this.VERSION = VERSION;
    this.THREE = THREE;
    this.data = { MAP, FRAME_PRESETS, DIFFICULTIES, MODES, TURRETS, TURRET_BY_ID, MINERAL_TYPES, ACHIEVEMENTS, SEED_GALLERY, SPELL_GRADES, STAFF_TIERS };

    this.dom = {
      canvas: document.getElementById('game-canvas'),
      minimap: document.getElementById('minimap-canvas'),
      fps: document.getElementById('fps-canvas'),
      hud: document.getElementById('hud-root'),
      panel: document.getElementById('panel-root'),
      menu: document.getElementById('menu-root'),
      toast: document.getElementById('toast-root'),
      cutscene: document.getElementById('cutscene-root'),
      loading: document.getElementById('loading')
    };

    this.quality = this._readQuality();
    this.preset = FRAME_PRESETS.find((p) => p.id === this.quality) || FRAME_PRESETS[1];
    this.mode = 'solo';
    this.difficulty = 'normal';
    this.state = 'loading';

    const urlSeed = new URLSearchParams(location.search).get('seed');
    this.seed = normalizeSeed(urlSeed);
    this.rng = createRNG(this.seed);

    this.audio = new AudioSystem();
    this.net = net;
    this.clock = new THREE.Clock();
    this.startedAt = 0;
    this.playTime = 0;
    this._playTimeAcc = 0;
    this._autosaveAcc = 0;
    this._regionAcc = 0;
    this._perfElapsed = 0;
    this._autoQualityDone = false;
    this._handReadyAt = 0;
    this._handTarget = null;
    this._dt = 0;
    this.build = { active: false, typeId: TURRETS[0]?.id, ghost: null, list: TURRETS.filter((t) => t.category !== 'portal'), yaw: 0 };
    this.demolish = { active: false, target: null, lastKey: '', allowed: true };
    this._shake = 0;
      // R 홀드 연속 회전 상태(§4.37)
      this._rotateHold = false;
      this._rotateNetAcc = 0;
      this._rotateNoticeAt = 0;
    /** 무기 보유/장착 상태 — 유물 지팡이 2종과 꿈나무는 획득 대상 */
    this.weapons = { owned: this._defaultOwned(), equipped: FIST_WEAPON_ID };
    /** 전직 시스템 — 직업을 고르면 그 계열 무기만 쓸 수 있고 나머지는 잠긴다 */
    this.classes = new ClassSystem({ game: this });
    this.classes.on('advance', (p) => this._onClassChange(p, '전직'));
    this.classes.on('promote', (p) => this._onClassChange(p, '승급'));
    this.crafting = new CraftingSystem({
      getEconomy: () => this.economy,
      getContext: () => this._craftingContext()
    });
    /** 마법부여 — 마법부여대(건설 시설)에서 보유한 모든 무기에 속성을 새긴다 */
    this.enchant = new EnchantSystem({ economy: this.economy, stats: this.achievements });
    // 마법연성(계약 §4.70) — 구매 즉시 포탑·코어·플레이어·채굴/벌목에 반영된다.
    this.arcana = new Arcana();
    if (this.turrets) this.turrets.arcana = this.arcana;
    this._deaths = 0;
    this.remote = null;
    // 멈춤 방지용 상태 — 탭 복귀 자동 재개 / 그래픽 컨텍스트 손실 / 프레임 오류 워치독
    this._autoPaused = false;
    this._contextLost = false;
    this._updateErrors = 0;
    // 프레임 예산 지급 큐(계약 §4.47) — 관리자 대량 소환을 프레임마다 나눠 처리한다.
    this._grants = new GrantQueue();
    // 프레임 감시 — 1초 넘는 프레임과 마지막 오류를 남겨 원인을 추적한다.
    this.perf = { frames: 0, lastMs: 0, worstMs: 0, slowFrames: 0, lastError: null, lastCommand: null, prewarm: { done: 0, total: 0 } };
    // 자동 화질(지속 적응) — 사용자가 고른 단계가 상한이다(계약 §4.50).
    this._userQuality = this.quality;
    this.autoQuality = this._readAutoQuality();
    this.memory = new MemoryGuard();
    // 캐릭터(이름·외형) — 메뉴에서 만들고, 방 만들기/참가 시 서버로 보낸다(§4.35).
    this.characterStore = createCharacterStore();
    this._installFullscreenGuard();
    // 디버그·검사용 핸들 (읽기 전용으로만 쓴다)
    globalThis.__yoseGame = this;
    // 직접 만든 닉네임이 있으면 캐릭터 이름 기본값으로도 쓴다(계약 §4.54).
    this.character = this.characterStore.load(currentNickname() || auth.user?.nickname || auth.user?.username || '');
    this.lastSnapshot = null;
    this.multiplayer = false;

    this._initRenderer();
    this._initUI();
    this._initEvents();
    this._initPreview();

    window.__GAME__ = this;
    this._hideLoading();
    this.state = 'menu';
    this.ui.menu.show('main');
    this._loop();
  }

  // ── 초기화
  _readQuality() {
    try {
      const q = localStorage.getItem(QUALITY_KEY);
      if (q && FRAME_PRESETS.some((p) => p.id === q)) return q;
    } catch {
      /* 무시 */
    }
    return 'balanced';
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.dom.canvas,
      antialias: this.preset.antialias !== false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio || 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.preset.shadow !== false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // 성능: 그림자 맵은 SHADOW_INTERVAL 마다 한 번만 다시 그린다(autoUpdate off + needsUpdate)
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this._shadowAcc = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(MAP.fogColor);
    this.scene.fog = new THREE.Fog(MAP.fogColor, this.preset.fog?.near ?? MAP.fogNear, this.preset.fog?.far ?? MAP.fogFar);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, this.preset.drawDistance || 500);
    this.camera.position.set(0, 12, 60);
    this.camera.lookAt(0, 0, 0);
    // 카메라를 씬에 넣어야 자식(무기·요정의 날개 뷰모델)이 렌더된다.
    this.scene.add(this.camera);

    this.input = new Input(this.dom.canvas);
    // 적응형 해상도 — 목표 FPS 에 못 미치면 렌더 해상도를 자동으로 낮춘다
    this.adaptive = new AdaptiveResolution({ renderer: this.renderer, preset: this.preset, config: ADAPTIVE });
  }

  _initUI() {
    // 친구 — 친구 코드·친구 목록은 UI 보다 먼저 있어야 한다(v1.4.0)
    if (!this.friends) this.friends = new FriendSystem();
    this.ui = {
      hud: new HUD(this),
      minimap: null,
      panels: new PanelManager({ game: this }),
      fps: new FPSMonitor({ canvas: this.dom.fps }),
      menu: new MainMenu({ game: this }),
      lobby: new Lobby({ game: this }),
      admin: new AdminConsole({ game: this }),
      friends: new FriendsOverlay({ game: this, friends: this.friends })
    };
    // 몬스터/보스 월드 체력바(InstancedMesh 2장)
    this.healthBars = new EnemyHealthBars({
      scene: this.scene,
      camera: this.camera,
      capacity: Math.max(64, Math.ceil(Number(WAVE_CONFIG?.maxAlive) || 220))
    });
    if (!this.base) this.ui.hud?.notify?.('요새의 수호자에 오신 것을 환영합니다', 'info');
    this._adminHint();
    // 초대 링크(?room=CODE)로 들어오면 바로 참가를 시도한다.
    const invite = codeFromUrl();
    if (invite) this.ui.lobby?.open?.({ code: invite, auto: true });
  }

  _initEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const unlockAudio = () => this.audio.init();
    window.addEventListener('pointerdown', unlockAudio, { once: false });
    window.addEventListener('keydown', unlockAudio, { once: false });

    // 캔버스를 클릭하면 다시 시점을 잡는다 — 단, 커서로 UI 를 조작하는 중(패널·관리자 콘솔)에는 잠그지 않는다.
    this.dom.canvas?.addEventListener('click', () => {
      if (this.ui?.panels?.hasOpen?.() || this.ui?.admin?.isOpen) return;
      if (this.state === 'playing' && !this.input.locked) this.input.requestPointerLock();
    });

    window.addEventListener('beforeunload', () => {
      this.save(true);
    });
    // 탭을 벗어나면 자동 일시정지하고, **돌아오면 자동으로 이어서** 한다.
    // 예전에는 돌아와도 멈춘 화면이 그대로 남아 "게임이 얼어붙은" 것처럼 보였다.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') {
          this._autoPaused = true;
          this.pause();
        }
        return;
      }
      if (this._autoPaused) {
        this._autoPaused = false;
        this.resume();
      }
    });
    // 그래픽 장치가 죽으면(컨텍스트 손실) 조용히 얼어붙지 말고 알려 준다.
    this.dom.canvas?.addEventListener?.('webglcontextlost', (e) => {
      e?.preventDefault?.();
      this._contextLost = true;
      this.notify('그래픽 장치가 응답하지 않습니다 — 복구 중… (계속 멈춰 있으면 F5)', 'error');
    });
    this.dom.canvas?.addEventListener?.('webglcontextrestored', () => {
      this._contextLost = false;
      this.notify('그래픽이 복구되었습니다', 'success');
    });

    // 메뉴 [서버 주소] — 다른 PC 에서 켠 서버로 붙는다(마인크래프트 멀티처럼).
    this.ui.menu.on('server-connect', ({ address } = {}) => this.connectServer(address));
    // 메뉴 [주소 만들기] / [초대코드 만들기] / [복사]
    this.ui.menu.on('share:address', () => this.shareServerAddress());
    this.ui.menu.on('share:invite', () => this.createInviteCode());
    this.ui.menu.on('share:copy', ({ kind } = {}) => this.copyShareText(kind));
    // 메뉴
    this.ui.menu.on('start', (opts) => this.start(opts));
    // 멀티플레이는 메인 화면의 전용 로비(초대코드)에서 시작한다 — 메뉴 창을 닫고 연다.
    this.ui.menu.on('multiplayer', () => {
      this.ui.menu?.hide?.();
      this.ui.lobby?.open?.();
    });
    this.ui.menu.on('multiplayer:join', ({ code } = {}) => {
      this.ui.menu?.hide?.();
      this.ui.lobby?.open?.({ code, auto: true });
    });
    this.ui.lobby?.on?.('close', () => {
      if (this.state === 'menu') this.ui.menu?.show?.('main');
    });
    // 방을 만들거나 들어가면 친구 코드에 내 방을 알린다 — 친구가 [들어가기] 로 바로 온다
    this.ui.lobby?.on?.('created', ({ code } = {}) => {
      this.ui.friends?.rememberRoom?.(code);
    });
    this.ui.lobby?.on?.('joined', ({ code } = {}) => {
      this.ui.friends?.rememberRoom?.(code);
    });
    // 메뉴 버튼 → 창을 먼저 닫고, 그 다음 패널이 뜬다(사용자 요청).
    //  패널을 닫으면(state === 'menu') 다시 메뉴가 나온다.
    this.ui.menu.on('settings', () => {
      this.ui.menu?.hide?.();
      this.togglePanel('settings');
    });
    this.ui.panels?.on?.('close', () => {
      if (this.state === 'menu') this.ui.menu?.show?.('main');
    });
    this.ui.menu.on('help', () => this.ui.menu.show('help'));
    // 메인화면 [게임종료] — 저장하고 창을 닫는다(계약 §4.75). 브라우저가 막으면 안내만 한다.
    this.ui.menu.on('quit', () => this.shutdown());
    this.ui.menu.on('auth', () => this.togglePanel('auth'));
    // 캐릭터 저장(메뉴) — 네트워크/로비가 쓰는 값을 즉시 갱신한다.
    this.ui.menu.on('character', ({ character } = {}) => {
      this.character = sanitizeCharacter(character, this.character?.name || '');
      this.ui.lobby?.refreshCharacter?.();
      this._refreshAvatar?.();
      // 다른 캐릭터로 바뀌면 전용 아이템은 자동 해제된다
      const dropped = this.charItems?.syncCharacter?.(this.character) ?? null;
      if (dropped) {
        this.applyGear?.();
        this.notify?.(`${dropped} — 캐릭터가 바뀌어 자동으로 해제했습니다`, 'info');
      }
    });
    // 캐릭터 전용 아이템(패널) — 구매/착용/해제
    this.ui.panels.on('charitem:buy', ({ id } = {}) => this.buyCharacterItem(id));
    this.ui.panels.on('charitem:equip', ({ id } = {}) => this.equipCharacterItem(id));
    this.ui.panels.on('charitem:unequip', () => this.unequipCharacterItem());
    this.ui.lobby?.on?.('character', () => {
      // 로비에서 [캐릭터 만들기] — 메뉴의 캐릭터 탭으로 보낸다.
      this.ui.lobby?.close?.();
      this.ui.menu.show('character');
      this.ui.menu.flash?.();
    });
    // 로그인 완료 — 패널을 닫고 메인 화면으로 부드럽게 넘어간다(§4.36).
    this.ui.panels.on('auth:done', () => {
      this._adoptAccountName?.();
      if (this.state === 'menu') {
        this.ui.menu.show('main');
        this.ui.menu.flash?.();
      }
    });

    // 패널
    this.ui.panels.on('build:select', ({ typeId }) => this.selectTurret(typeId));
    this.ui.panels.on('demolish:start', () => this.setDemolish(true));
    this.ui.panels.on('gacha:pull', ({ times }) => this.pullGacha(times));
    this.ui.panels.on('gacha:craft', ({ recipeId, id }) => this.craftRecipe(recipeId ?? id));
    this.ui.panels.on('seed:pick', ({ seed }) => this.start({ mode: this.mode, seed, difficulty: this.difficulty }));
    this.ui.panels.on('frame:pick', ({ id }) => this.applyPreset(id, { user: true }));
    this.ui.panels.on('title:pick', ({ id }) => {
      this.activeTitle = id;
      this.notify('칭호를 변경했습니다', 'success');
    });
    this.ui.panels.on('save', () => this.save());
    this.ui.panels.on('load', () => {
      // 불러오기는 localStorage + 클라우드(네트워크)를 함께 본다. 실패가
      // unhandled rejection 으로 남지 않도록 여기서 한 번 더 감싼다.
      void this.load().catch((err) => {
        console.error('[load] 불러오기 실패', err);
        this.notify?.('게임을 불러오지 못했습니다 — 저장 데이터를 확인해 주세요', 'error');
      });
    });
    this.ui.panels.on('quit', () => this.quit());
    this.ui.panels.on('resume', () => this.resume());
    this.ui.panels.on('save:load', ({ id } = {}) => this.loadSaveSlot(id));
    this.ui.panels.on('save:del', ({ id } = {}) => this.removeSave(id));
    this.ui.panels.on('crosshair:change', (prefs) => this.ui?.hud?.setCrosshair?.(prefs));
    this.ui.panels.on('perf:reset', () => { this.resetPerf(); this._refreshPanels(); });
    this.ui.panels.on('auto-quality:toggle', () => { this.toggleAutoQuality(); this._refreshPanels(); });
    this.ui.panels.on('game:reload', () => this.saveAndReload());
    this.ui.panels.on('weapon:equip', ({ id } = {}) => this.equipWeapon(id));
    this.ui.panels.on('wing:equip', ({ id } = {}) => this.equipWing(id));
    this.ui.panels.on('wing:unequip', () => this.unequipWings());
    this.ui.panels.on('gear:buy', ({ id } = {}) => this.buyGear(id));
    this.ui.panels.on('gear:equip', ({ id } = {}) => this.equipGear(id));
    this.ui.panels.on('gear:unequip', ({ id } = {}) => this.unequipGear(id));
    this.ui.panels.on('gear:unequip-all', () => this.unequipAllGear());
    this.ui.panels.on('weapon:preview', ({ id } = {}) => this.previewSwap(id));
    this.ui.panels.on('enchant:apply', ({ weaponId, elementId } = {}) => this.enchantWeapon(weaponId, elementId));
    this.ui.panels.on('enchant:pick', ({ weaponId, elementId } = {}) => {
      if (weaponId !== undefined) this.ui.panels.state.enchant.weaponId = weaponId;
      if (elementId !== undefined) this.ui.panels.state.enchant.element = elementId;
      this.ui.panels.refresh?.();
    });
    // 다른 클라이언트가 돌린 건물 방향을 따라간다(회전 릴레이).
    this._netOffEvent = net.onGameEvent?.((ev) => this.applyNetGameEvent(ev)) ?? null;
    // 패널이 열려 있으면 마우스 커서를 보여준다(포인터 잠금 해제) — 버튼을 눌러야 하기 때문.
    this.ui.panels.on('open', () => this._syncPointerLock());
    // 메뉴에서 연 패널을 닫으면(ESC·닫기 버튼) 메뉴로 돌아온다 — 빈 화면 방지
    this.ui.panels.on('close', () => {
      if (this.state === 'menu') this.ui.menu.show('main');
      this._syncPointerLock();
    });

    // 네트워크
    net.on('game:start', (payload) => {
      this.multiplayer = true;
      this.ui.lobby?.close?.();
      this.notify('협동 게임을 시작합니다', 'success');
      // 서버가 보낸 방 설정(모드·시드·난이도)이 기준이다 — 모든 참가자가 같은 요새를 지킨다.
      const roomMode = payload?.mode && payload.mode !== 'solo' ? payload.mode : this.mode === 'solo' ? 'coop' : this.mode;
      this.start({ mode: roomMode, seed: payload?.seed ?? this.seed, difficulty: payload?.difficulty ?? this.difficulty });
      this.audio.startBGM('battle');
    });
    net.on('game:snapshot', (snap) => {
      this.lastSnapshot = snap;
      this.lastSnapshotAt = Date.now();
      this.remote?.update(snap, net.id);
      // 스냅샷의 건물 목록으로 원격 건물을 맞춘다(재접속 복구 포함).
      if (this.multiplayer) this.turrets?.syncRemote?.(snap.turrets, net.id);
    });
    net.on('game:event', (msg) => {
      // 메시지 알림은 applyNetGameEvent 가 한 번만 처리한다(중복 토스트 방지).
      if (msg?.payload?.sound) this.audio.play(msg.payload.sound);
    });
    // 접속 끊김/복귀 — 게임 중에도 상태를 알리고 자동으로 좌석을 되찾는다.
    net.on('net:disconnect', () => {
      if (this.state === 'playing' || this.state === 'paused') {
        this.notify('서버 연결이 끊겼습니다 — 자동으로 다시 연결합니다', 'warn');
      }
      // 3초 넘게 안 돌아오면 얼어붙은 동료 모델을 숨긴다(복귀하면 스냅샷으로 다시 나타난다).
      clearTimeout(this._netGhostTimer);
      this._netGhostTimer = setTimeout(() => {
        if (net.connected) return;
        this.remote?.clear?.();
      }, 3000);
    });
    net.on('net:reconnect', () => {
      clearTimeout(this._netGhostTimer);
      if (this.multiplayer) this.notify('서버에 다시 연결되었습니다', 'success');
    });
    net.on('net:resumed', () => {
      if (!this.multiplayer) return;
      this.notify('협동 게임으로 복귀했습니다', 'success');
      if (this.lastSnapshot) this.turrets?.syncRemote?.(this.lastSnapshot.turrets, net.id);
    });
    net.on('net:resume-failed', ({ fatal, error } = {}) => {
      if (!this.multiplayer) return;
      if (fatal) {
        this.multiplayer = false;
        this.remote?.clear?.();
        this.notify('복귀 시간이 지났습니다 — 로비에서 새로 시작하세요', 'error');
      } else {
        this.notify(String(error || '재접속을 다시 시도합니다'), 'warn');
      }
    });
    net.on('game:over', (res) => {
      this.notify(`게임 종료 — 웨이브 ${res?.wave ?? 0}, 점수 ${res?.score ?? 0}`, 'info');
    });
    net.on('room:error', ({ message }) => this.notify(message || '방 오류', 'error'));
  }

  _initPreview() {
    try {
      const seed = SEED_GALLERY[0]?.seed ?? '1';
      this.previewWorld = createWorld({
        scene: this.scene,
        seed,
        quality: 'performance',
        rng: createRNG(`${seed}:preview`)
      });
      this.previewAngle = 0;
    } catch (err) {
      console.warn('[preview] 미리보기 월드 생성 실패', err);
      this.previewWorld = null;
    }
  }

  _hideLoading() {
    const el = this.dom.loading;
    if (el) {
      el.classList.add('hidden');
      setTimeout(() => el.remove?.(), 600);
    }
  }

  // ── 게임 컨텍스트 편의 접근자
  get base() {
    return this.world?.base ?? null;
  }
  get enemies() {
    return this.waves?.enemies ?? [];
  }
  get towers() {
    return this.turrets?.turrets ?? [];
  }
  get running() {
    return this.state === 'playing' || this.state === 'paused' || this.state === 'dead';
  }

  notify(text, type = 'info') {
    this.ui?.hud?.notify?.(text, type);
  }

  track(stat, amount = 1) {
    this.achievements?.track?.(stat, amount);
  }

  addGold(n) {
    if (!n) return;
    this.economy?.addGold?.(n);
    if (n > 0) this.track('goldEarned', n);
    else this.track('goldSpent', -n);
  }

  addWood(n) {
    if (!n) return;
    this.economy?.addWood?.(n);
  }

  addMineral(id, n = 1) {
    this.economy?.addMineral?.(id, n);
  }

  // ── 요정의 날개 (장비 · 비행) ───────────────────────────────
  /** 현재 날개 프로필을 플레이어/뷰모델에 적용한다 */
  _applyFlight() {
    const base = this.wings?.flight?.() ?? { equipped: false };
    const forced = Boolean(this.adminFlight);
    const gear = this.gear?.bonus?.() ?? null;
    const profile = base.equipped || forced ? { ...base, equipped: true } : { equipped: false, id: null };
    // 가죽 장비 — 비행 속도/상한 보너스(비율)
    if (gear) {
      profile.speed = (Number(profile.speed) || 1) * (1 + (Number(gear.flightSpeedPct) || 0));
      profile.ceiling = Math.round((Number(profile.ceiling) || 0) * (1 + (Number(gear.flightCeilingPct) || 0)));
      profile.gearSpeedPct = Number(gear.flightSpeedPct) || 0;
      profile.gearCeilingPct = Number(gear.flightCeilingPct) || 0;
    }
    this.player?.setFlight?.(profile);
    this.wingRig?.setProfile?.(profile);
    return profile;
  }

  /** 관리자 명령/외부 시스템용 별칭 (admin-commands 의 game.applyFlight 호출 호환) */
  applyFlight() {
    return this._applyFlight();
  }

  /** 패널이 읽는 값 — { equippedId, owned, name, flying, admin } */
  wingState() {
    const wings = this.wings;
    return {
      equippedId: wings?.equippedId ?? null,
      name: wings?.equippedName ?? null,
      owned: wings ? [...wings.owned] : [],
      forced: Boolean(this.adminFlight),
      flying: Boolean(this.player?.flying),
      drain: Number(this.player?.flight?.drain) || 0,
      ceiling: Number(this.player?.flight?.ceiling) || 0
    };
  }

  /** V 키 — 날개 착용/해제 */
  toggleWings() {
    const wings = this.wings;
    if (!wings) return false;
    const r = wings.toggleEquip();
    if (r?.ok === false) {
      this.notify(r.reason ?? '날개를 사용할 수 없습니다', 'warn');
      if (!wings.count) this.ui.panels?.open?.('inventory');
      return false;
    }
    this._applyFlight();
    if (r.wing) {
      this.audio?.play?.('fairy');
      this.notify(`날개 착용 — ${r.wing.name} · Space 상승 · Shift 하강`, 'success');
    } else {
      this.audio?.play?.('swap');
      this.notify('날개를 접었습니다', 'info');
    }
    this.ui.panels?.refresh?.();
    return true;
  }

  /**
   * 날개 획득의 기본 경로는 제작대(`craftWing`)다 — 이 메서드는 시스템 API/관리자용으로 남겨 둔다.
   */
  buyWing(id) {
    const wings = this.wings;
    if (!wings) return false;
    const r = wings.buy(id);
    if (r?.ok === false) {
      this.notify(r.reason ?? '구매할 수 없습니다', 'warn');
      this.ui.panels?.refresh?.();
      return false;
    }
    this._applyFlight();
    if (r.cost?.gold) this.track?.('goldSpent', Math.round(Number(r.cost.gold) || 0));
    this.audio?.play?.('gachaLegend');
    this.notify(`요정의 날개 획득 — ${r.wing.name} · Space 상승 · Shift 하강`, 'gacha');
    this.ui.panels?.refresh?.();
    return true;
  }

  equipWing(id) {
    const wings = this.wings;
    if (!wings) return false;
    const r = wings.equip(id);
    if (r?.ok === false) {
      this.notify(r.reason ?? '장착할 수 없습니다', 'warn');
      return false;
    }
    this._applyFlight();
    this.audio?.play?.('swap');
    this.notify(`날개 착용 — ${r.wing.name}`, 'success');
    this.ui.panels?.refresh?.();
    return true;
  }

  unequipWings() {
    const wings = this.wings;
    if (!wings) return false;
    wings.unequip();
    this._applyFlight();
    this.notify('날개를 접었습니다', 'info');
    this.ui.panels?.refresh?.();
    return true;
  }

  /**
   * 관리자 /플라이 — 날개 없이 비행(마나 소모 0). mode: toggle | on | off
   * { ok, on, message }
   */
  adminFly(mode = 'toggle') {
    const m = String(mode ?? 'toggle').trim().toLowerCase();
    const on = m === 'on' || m === '켜기' || m === 'true' || m === '1' ? true : m === 'off' || m === '끄기' || m === 'false' || m === '0' ? false : !this.adminFlight;
    this.adminFlight = on;
    this.wings?.setForced?.(on);
    this._applyFlight();
    if (on && this.player) {
      // 즉시 이륙 — 살짝 띄워 준다
      this.player.onGround = false;
      this.player.velocity.y = Math.max(Number(this.player.velocity.y) || 0, 4.5);
    }
    if (!on) this.player && (this.player.flying = false);
    return {
      ok: true,
      on,
      message: on ? '비행 활성화 — Space 상승 · Shift 하강 (마나 소모 없음)' : '비행 해제'
    };
  }

  /** 매 프레임 — 날개 연출 + 비행 시간 기록 */
  _updateWings(dt) {
    const player = this.player;
    if (!player) return;
    const flying = Boolean(player.flying);
    this.wingRig?.update?.(dt, {
      flying,
      speed: Math.hypot(Number(player.velocity?.x) || 0, Number(player.velocity?.z) || 0),
      ascend: Boolean(this.input?.isDown?.('Space')),
      dive: Boolean(this.input?.isDown?.('ShiftLeft') || this.input?.isDown?.('ShiftRight')),
      mana: player.maxMana ? Number(player.mana) / Number(player.maxMana) : 1
    });
    if (flying) {
      this._flightAcc = (this._flightAcc ?? 0) + dt;
      if (this._flightAcc >= 5) {
        this.track?.('flightTime', Math.round(this._flightAcc));
        this._flightAcc = 0;
      }
    }
  }

  get enemiesAlive() {
    return this.waves?.alive ?? 0;
  }

  /** HUD 보스 체력바가 읽는 정보 — 살아있는 보스가 없으면 null */
  get bossInfo() {
    const boss = this.waves?.bossEnemy ?? null;
    if (!boss || boss.alive === false) return null;
    const type = boss.type ?? BOSS_TYPE_BY_ID[boss.typeId] ?? null;
    return {
      id: boss.id,
      typeId: boss.typeId,
      name: boss.name,
      hp: boss.hp,
      maxHp: boss.maxHp,
      ratio: boss.hpRatio,
      wave: boss.wave ?? this.waves?.wave ?? 0,
      shielded: !!(boss.shielded || boss.shieldTime > 0),
      ability: type?.ability ?? null,
      desc: type?.desc ?? '',
      color: type?.color ?? 0xffd75c
    };
  }

  // ── 시작 / 종료
  start({ mode = 'solo', seed, difficulty } = {}) {
    const prev = this.state;
    // 무한 모드는 웨이브 100 을 클리어해 해금해야 고를 수 있다(계약 §4.58).
    if (mode === 'endless' && !isEndlessUnlocked()) {
      this.notify?.(`무한 모드 — 웨이브 ${ENDLESS_UNLOCK_WAVE} 을 클리어하면 열립니다`, 'warn');
      mode = null;
    }
    this.mode = mode || this.mode;
    this.difficulty = DIFFICULTIES.some((d) => d.id === difficulty) ? difficulty : this.difficulty;
    if (seed !== undefined && seed !== null && String(seed).trim() !== '') this.seed = normalizeSeed(seed);
    this.rng = createRNG(this.seed);

    this._teardownRun();
    if (this.previewWorld) {
      this.previewWorld.dispose?.();
      this.previewWorld = null;
    }

    const rng = this.rng;
    try {
      this.world = createWorld({ scene: this.scene, seed: this.seed, quality: this.quality, preset: this.preset, rng: rng.fork('world') });
    } catch (err) {
      console.error('[world] 생성 실패', err);
      this.notify('월드 생성에 실패했습니다', 'error');
      return;
    }

    this.scene.fog = new THREE.Fog(MAP.fogColor, this.preset.fog?.near ?? MAP.fogNear, this.preset.fog?.far ?? MAP.fogFar);
    if (this.world.sky?.sun) this.world.sky.sun.castShadow = this.preset.shadow !== false;

    const diff = DIFFICULTIES.find((d) => d.id === this.difficulty) || DIFFICULTIES[1];
    const creative = this.mode === 'creative';

    // 맨손 시작 — 첫 작업대(650 G·160 목재)와 첫 무기 제작(450 G·150 목재)을 바로 할 수 있는 정도만 준다.
    this.economy = new Economy({ gold: creative ? 999999 : 1200, wood: creative ? 99999 : 400, minerals: creative ? {} : {} });
    if (creative) for (const m of MINERAL_TYPES) this.economy.addMineral(m.id, 99);

    this.achievements = new AchievementSystem({
      onUnlock: (ach) => {
        this.notify(`업적 달성 — ${ach.name}`, 'gacha');
        this.audio.play('levelup');
        this.track('playTime', 0);
      }
    });

    const bonus = this._fairyModifiers();
    this.projectiles = new ProjectileSystem({
      scene: this.scene,
      audio: this.audio,
      groundHeight: (x, z) => this.world.getHeight(x, z)
    });
    this.player = new Player({
      camera: this.camera,
      world: this.world,
      input: this.input,
      audio: this.audio,
      stats: this.achievements,
      position: new THREE.Vector3(0, 0, 40)
    });
    this.player.onDamage = (amount) => {
      this.track('damageTaken', amount);
      this._shake = Math.min(0.6, this._shake + amount * 0.004);
      this.audio.play('baseHit');
    };
    this.player.onDeath = () => {
      this._deaths++;
      this.track('deaths', 1);
      this.state = 'dead';
      this._respawnTimer = 5;
      this.notify('쓰러졌습니다. 5초 후 부활합니다.', 'error');
      this.audio.play('defeat');
    };
    // 요정 패시브 × 전직 패시브 × 가죽 장비 (장비를 바꾸면 _applyGearStats() 가 다시 계산한다)
    const gearFx = this.gear?.bonus?.() ?? null;
    this.player.manaRegenMult = bonus.manaRegen * (this.classes?.modifiers?.manaRegen ?? 1) * (1 + (gearFx?.manaRegenPct ?? 0));
    this.player.speedMult = bonus.moveSpeed * (this.classes?.modifiers?.moveSpeed ?? 1) * (1 + (gearFx?.moveSpeedPct ?? 0));
    this.player.damageTakenMult = (this.classes?.modifiers?.damageTaken ?? 1) * (1 - Math.min(0.6, gearFx?.damageTakenPct ?? 0));
    this.player.staminaRegen = this.player.staminaRegen * (1 + (gearFx?.staminaRegenPct ?? 0));

    // 무기 뷰모델(68종, 계열별 스왑모션 · 활은 화살 소모) + 타격/스킬 임팩트. this.staff 는 호환 별칭이다.
    this.impacts = new ImpactFX({
      scene: this.scene,
      camera: this.camera,
      audio: this.audio,
      rng: rng.fork('impacts')
    });
    this.impacts.onGratitude = (text) => this.notify(text, 'gacha');
    this.staff = new WeaponRig({
      camera: this.camera,
      weaponId: this.weaponId || FIST_WEAPON_ID,
      audio: this.audio,
      rng: rng.fork('weapons')
    });
    this.weaponRig = this.staff;
    this.weaponId = this.staff.id;
    this._ultReadyAt = 0;
    this.staff.onSwapSpecial = (special) => this._onSwapSpecial(special);
    this.staff.onRelease = (info) => this._onWeaponRelease(info);

    this.turrets = new TurretSystem({
      scene: this.scene,
      world: this.world,
      economy: this.economy,
      projectiles: this.projectiles,
      audio: this.audio,
      stats: this.achievements,
      rng: rng.fork('turrets'),
      getItem: (dest) => this.crafting?.portalCount?.(dest) ?? 0,
      takeItem: (dest) => this.crafting?.takePortal?.(dest) ?? false
    });
    this.turrets.miningBonus = bonus.miningSpeed * (this.classes?.modifiers?.miningSpeed ?? 1);
    // 컨베이어벨트 승강 — 플레이어는 world 를 통해 벨트 밀림을 조회한다.
    this.world.conveyorPushAt = (pos) => this.turrets?.conveyorPushAt?.(pos) ?? null;

    this.waves = new WaveSystem({
      mode: this.mode,
      scene: this.scene,
      world: this.world,
      economy: this.economy,
      audio: this.audio,
      projectiles: this.projectiles,
      stats: this.achievements,
      rng: rng.fork('waves'),
      difficulty: diff,
      player: this.player
    });
    this.waves.onWaveStart = (wave) => {
      this.world?.setSpawnPattern?.(this.waves?.pattern?.id);
      // 이번 웨이브 편성표(웨이브마다 다른 몬스터) + 보스 예고
      const roster = this.waves?.rosterInfo ?? null;
      const boss = this.waves?.currentBossId ? BOSS_TYPE_BY_ID[this.waves.currentBossId] : null;
      const theme = roster ? `${roster.icon} ${roster.name}${roster.elite > 0 ? ` · 정예 ${roster.elite}` : ''}` : null;
      if (theme) this.notify(`이번 웨이브 — ${theme}`, 'info');
      if (boss) this.notify(`보스 ${boss.name} 등장 — ${boss.desc}`, 'error');
      this.notify(`${wave} 웨이브 시작${wave % 10 === 0 ? ' — 보스!' : ''}`, wave % 10 === 0 ? 'error' : 'warn');
      this.audio.startBGM('battle');
    };
    this.waves.onWaveComplete = (wave, reward) => {
      this.notify(`${wave} 웨이브 완료 (+${reward?.gold ?? 0} 골드)`, 'success');
      this.audio.startBGM('field');
      recordWave(wave);
      // 웨이브 100 클리어 — 무한 모드 해금(계약 §4.58)
      if (this.mode !== 'endless' && wave >= ENDLESS_UNLOCK_WAVE) {
        const res = unlockEndless({ wave });
        if (res.first) {
          this.notify(`웨이브 ${ENDLESS_UNLOCK_WAVE} 클리어 — 무한 모드 해금!`, 'success');
          this.notify('모드에서 [무한 모드] 를 고르면 끝없이 이어집니다 — 300 웨이브마다 셀레스티얼 강림(+35%)', 'info');
        }
      }
    };
    this.waves.onGameOver = () => this._gameOver();
    this.waves.onVictory = (payload) => this._victory(payload);
    // 무한 모드 셀레스티얼 강림 — 등장 차수와 스펙을 알린다.
    this.waves.onCelestial = (payload) => {
      recordCelestialKill();
      this.notify(`셀레스티얼 ${payload?.count ?? ''}번째 강림 — 체력 ${payload?.hp ?? ''}`, 'error');
    };
    // 가죽 획득 — 야생/웨이브 몬스터 처치 보상(웨이브 시스템이 지급한 뒤 알려 준다)
    this.waves.onLeatherGained = (payload) => {
      const def = leatherById(payload?.id);
      if (!def) return;
      this.leatherPickups = (this.leatherPickups ?? 0) + 1;
      if (this.leatherPickups % 4 === 1) this.notify(`${def.glyph} ${def.name} +${payload.amount}`, 'success');
    };
    this.waves.onRoamerSpawn = (payload) => {
      const roster = regionMonsterRoster(payload?.regionId);
      const now = Number(this.clock?.elapsedTime) || 0;
      if (roster && now - (this._roamerWarnAt ?? -99) > 30) {
        this._roamerWarnAt = now;
        this.notify(`야생 몬스터 출현 — ${roster.name} (${roster.desc})`, 'warn');
      }
    };

    this.spells = new SpellSystem({
      scene: this.scene,
      projectiles: this.projectiles,
      audio: this.audio,
      stats: this.achievements,
      economy: this.economy,
      rng: rng.fork('spells')
    });
    this.gacha = new GachaSystem({
      rng: rng.fork('gacha'),
      stats: this.achievements,
      economy: this.economy,
      audio: this.audio
    });
    this.fairies = new FairySystem({
      scene: this.scene,
      world: this.world,
      audio: this.audio,
      stats: this.achievements,
      rng: rng.fork('fairies'),
      onFind: (fairy) => {
        this.notify(`요정을 만났습니다 — ${fairy.name}`, 'fairy');
        this.audio.play('fairy');
        if (fairy.reward?.gold) this.addGold(fairy.reward.gold);
      }
    });

    // 요정의 날개 — 보유/장착 상태(경제) + 1인칭 뷰모델
    this.wings = new WingSystem({
      economy: this.economy,
      fairies: this.fairies,
      audio: this.audio,
      stats: this.achievements
    });
    this.wingRig = new WingRig({ camera: this.camera, audio: this.audio });
    this._flightAcc = 0;

    // 가죽 장비 — 몬스터에게서 얻은 가죽으로 만드는 방어구(비율 보너스)
    this.gear = new GearSystem({
      economy: this.economy,
      audio: this.audio,
      achievements: this.achievements
    });
    // 캐릭터 전용 아이템 — 그 캐릭터로 플레이할 때만 사고 쓸 수 있다(v1.2.0)
    this.charItems = new CharacterItemSystem();
    // 지형 티어별 야생 몬스터(로밍) — 웨이브 정산과 무관하게 지역마다 등장한다
    const roamerRng = rng.fork('roamers');
    this.regionSpawner = new RegionSpawner({ rand: () => roamerRng.next() });
    // 지형 이동 포탈(3D) — 지형마다 색이 다른 고리 포탈(계약 §4.59)

    try {
      this.ui.minimap = new Minimap({ canvas: this.dom.minimap, world: this.world, size: MAP.size });
    } catch (err) {
      console.warn('[minimap] 생성 실패', err);
      this.ui.minimap = null;
    }
    this.remote = new RemotePlayers(this.scene);
    this.avatar = this._buildAvatar();
    this.ui.fps.setInfo?.({ enemies: 0, turrets: 0 });

    // 플레이어를 기지 근처에 배치
    const bx = 0;
    const bz = 32;
    this.player.position.set(bx, this.world.getHeight(bx, bz) + 0.1, bz);
    this.player.respawn?.(this.player.position.clone());

    this.build = { active: false, typeId: TURRETS[0]?.id, ghost: null, list: TURRETS.filter((t) => t.category !== 'portal'), yaw: 0 };
    this.demolish = { active: false, target: null, lastKey: '', allowed: true };
    this.playTime = 0;
    this._playTimeAcc = 0;
    this._autosaveAcc = 0;
    this._regionAcc = 0;
    this._respawnTimer = 0;
    this._deaths = 0;
    this.startedAt = performance.now();
    this.activeTitle = null;

    if (this.seed === '42') this.track('seed42', 1);

    this.ui.menu.hide();
    this.ui.panels.close();
    this.state = 'playing';
    this._applyFullscreenPref?.();
    this._requestFullscreenNow?.();
    this.audio.init();
    this.audio.startBGM('field');
    this.ui.hud.setPhase?.(this.waves.phase, this.waves.wave, this.waves.timeLeft);
    this.notify(`시드 [${this.seed}] · ${diff.name} · ${MODES.find((m) => m.id === this.mode)?.name ?? this.mode}`, 'info');
    if (prev === 'menu') this.dom.canvas?.focus?.();
  }

  /** 전체 화면 설정 (기본 켜짐 — 설정에서 창 모드로 바꾼다) */
  _fullscreenPref() {
    try {
      return globalThis.localStorage?.getItem?.('fortress.fullscreen') !== '0';
    } catch {
      return true;
    }
  }

  _setFullscreenPref(on) {
    try {
      globalThis.localStorage?.setItem?.('fortress.fullscreen', on ? '1' : '0');
    } catch {
      /* 저장 실패는 무시 */
    }
  }

  /** 전체 화면 요청 — 사용자 제스처 안에서 부른다(브라우저 규칙) */
  _requestFullscreenNow() {
    const de = globalThis.document?.documentElement;
    if (!de?.requestFullscreen) return false;
    if (globalThis.document?.fullscreenElement) return true;
    try {
      Promise.resolve(de.requestFullscreen()).catch(() => {});
    } catch {
      return false;
    }
    return true;
  }

  /** 게임 시작 시 전체 화면 고정 — 브라우저가 막으면 창 모드로 둔다 */
  _applyFullscreenPref() {
    if (!this._fullscreenPref()) return false;
    return this._requestFullscreenNow();
  }

  /** 시작 버튼을 누르는 그 순간 + 게임 중 아무 클릭에서나 전체 화면을 (다시) 요청한다 */
  _installFullscreenGuard() {
    const doc = globalThis.document;
    if (!doc?.addEventListener) return;
    const tryEnter = () => {
      if (!this._fullscreenPref()) return;
      if (doc.fullscreenElement) return;
      if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'menu') return;
      this._requestFullscreenNow();
    };
    doc.addEventListener('pointerdown', tryEnter, true);
    doc.addEventListener('keydown', (e) => {
      if (e?.code === 'Enter' || e?.code === 'NumpadEnter' || e?.code === 'Space' || e?.code === 'KeyO') tryEnter();
    }, true);
  }

  _teardownRun() {
    this.turrets?.dispose?.();
    this.waves?.reset?.();
    this.projectiles?.dispose?.();
    this.staff?.dispose?.();
    this.impacts?.dispose?.();
    this.fairies?.dispose?.();
    this.wingRig?.dispose?.();
    this.wingRig = null;
    this.wings?.dispose?.();
    this.wings = null;
    this.player?.setFlight?.(null);
    this.remote?.clear?.();
    if (this.remote) {
      this.scene.remove(this.remote.group);
      this.remote = null;
    }
    this.world?.dispose?.();
    this.world = null;
    this.ui.minimap = null;
    this.player = null;
    this.economy = null;
    this.achievements = null;
  }

  /** 🎯 미니게임 — 본편 화면 위에 단독 페이지를 띄운다(돌아오면 원래 상태로 복귀). */
  openMiniGame() { return openMiniGame(this); }

  closeMiniGame() { return closeMiniGame(this); }

  get miniGameOpen() { return isMiniGameOpen(); }

  /**
   * 일시정지. screen='settings' 이면 설정 화면을 띄운다(ESC 기본 — 계약 §4.48).
   * 탭 복귀 자동 일시정지처럼 사용자가 ESC 를 누른 게 아닌 경우엔 'pause' 화면을 쓴다.
   */
  pause({ screen = 'pause' } = {}) {
    if (this.state !== 'playing') return;
    this._viewDirty = true;
    this.state = 'paused';
    this.input.exitPointerLock?.();
    this.ui.panels.open(screen === 'settings' ? 'settings' : 'pause');
    this.audio.startBGM('menu');
  }

  resume() {
    if (this.state !== 'paused') return;
    this._viewDirty = true; // 풀리는 순간 한 번 다시 그린다
    this.ui.panels.close();
    this.state = 'playing';
    this.audio.startBGM('field');
    this.input.requestPointerLock?.();
  }

  /** 창 닫기(설치판) — 저장 후 window.close(). 브라우저가 막으면 안내한다. */
  shutdown() {
    this.notify('저장했습니다 — 창을 닫습니다', 'info');
    try { this.save(true); } catch { /* 저장 실패해도 닫기는 진행한다 */ }
    try { this.audio?.stopBGM?.(); } catch { /* 무음 실패는 무시 */ }
    window.setTimeout(() => {
      try { window.close(); } catch { /* 아래 안내로 넘어간다 */ }
      window.setTimeout(() => this.notify('브라우저가 창 닫기를 막았습니다 — 탭을 닫아 주세요', 'warn'), 400);
    }, 220);
  }

  quit() {
    this.save(true);
    this.ui.panels.close();
    // 메뉴로 돌아가면 커서가 필요하다 — 어느 상태에서 불렸든 포인터를 푼다.
    this.input.exitPointerLock?.();
    // 방에 들어가 있었다면 좌석을 반납한다 — 유령 참가자·재입장 실패 방지.
    if (this.multiplayer) {
      this.multiplayer = false;
      this.remote?.clear?.();
      try { net.leaveRoom(); } catch { /* 무시 */ }
    }
    this._teardownRun();
    this._initPreview();
    this.state = 'menu';
    this.audio.startBGM('menu');
    this.ui.menu.show('main');
  }

  async _gameOver() {
    if (this.state === 'gameover' || this.state === 'victory') return;
    this.state = 'gameover';
    this.audio.play('defeat');
    this.audio.startBGM('menu');
    this.input.exitPointerLock?.();
    const wave = this.waves?.wave ?? 0;
    this.notify(`요새가 함락되었습니다 — 웨이브 ${wave}`, 'error');
    await this.submitScore();
    this.ui.panels.open('pause');
  }

  /** 지옥 100 웨이브 정복 — 디아블로 격파. 101 웨이브로 이어지지 않고 승리 화면으로 끝난다. */
  async _victory(payload = {}) {
    if (this.state === 'gameover' || this.state === 'victory') return;
    this.state = 'victory';
    const wave = Math.max(1, Number(payload?.wave) || this.waves?.wave || 100);
    this.audio.play('victory');
    this.audio.startBGM('menu');
    this.input.exitPointerLock?.();
    this.notify(`지옥 ${wave} 웨이브 정복 — 디아블로 격파!`, 'success');
    await this.submitScore();
    this.ui.panels.open('pause');
  }

  // ── 조작
  selectTurret(typeId) {
    if (!TURRET_BY_ID[typeId]) return;
    if (this.demolish.active) this.setDemolish(false);
    this.build.typeId = typeId;
    this.build.active = true;
    // 새로 고른 건물은 플레이어가 보는 쪽을 향해 시작한다(X 로 45°씩 회전).
    this.build.yaw = Number(this.player?.yaw) || 0;
    this._updateGhost(true);
    const def = TURRET_BY_ID[typeId];
    this.notify(`건설 모드 — ${def.name} (T${def.tier})`, 'info');
    // 고른 포탑을 패널 카드에도 반영하고(단축키·휠 경로), 건설창은 닫아 바로 설치하게 한다.
    this.ui?.panels?.markBuildSelected?.(typeId);
    this._closeBuildPanel();
  }

  /**
   * 철거 모드 — 조준선 중앙의 내 건물을 좌클릭으로 철거한다.
   *  · 포탑·시설을 가리지 않고 같은 규칙(투자 재료의 25% 환불)을 쓴다.
   *  · 멀티에서는 내가 지은 건물만 — 서버도 소유자/방장만 허용한다.
   */
  setDemolish(on = true) {
    const next = Boolean(on);
    if (next === this.demolish.active) return next;
    this.demolish.active = next;
    this.demolish.target = null;
    this.demolish.lastKey = '';
    if (next) {
      if (this.build.active) {
        this.build.active = false;
        this._updateGhost();
      }
      if (this.ui?.panels?.isOpen?.()) this.ui.panels.close();
      this._syncPointerLock?.();
      this.notify('철거 모드 — 건물을 조준하고 좌클릭 (재료 25% 환불 · Z 취소)', 'warn');
    }
    this.ui?.hud?.setDemolish?.({ active: next, target: null, allowed: true });
    return next;
  }

  _canDemolish(turret) {
    if (!turret || turret.destroyed) return false;
    if (!this.multiplayer) return true;
    return String(turret.ownerId ?? '') === String(net.id || 'local');
  }

  /** 조준선(화면 중앙)에 걸린 건물 — 자식 메시에서 userData.turret 을 찾는다. */
  _findTurretAtCrosshair(maxDist = 10) {
    if (!this.camera || !this.towers?.length) return null;
    this._demolishRay ||= new THREE.Raycaster();
    this._demolishRay.far = Math.max(2, Number(maxDist) || 10);
    this._demolishRay.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const meshes = [];
    for (const t of this.towers) if (t?.mesh && !t.destroyed) meshes.push(t.mesh);
    if (!meshes.length) return null;
    const hits = this._demolishRay.intersectObjects(meshes, true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj && !obj.userData?.turret) obj = obj.parent;
      if (obj?.userData?.turret) return obj.userData.turret;
    }
    return null;
  }

  _updateDemolishTarget() {
    if (!this.demolish.active) return;
    if (this.state !== 'playing') {
      this.setDemolish(false);
      return;
    }
    const target = this._findTurretAtCrosshair();
    const allowed = target ? this._canDemolish(target) : true;
    const key = target ? `${target.id}:${allowed ? 1 : 0}` : '';
    if (key === this.demolish.lastKey) return;
    this.demolish.lastKey = key;
    this.demolish.target = target;
    this.demolish.allowed = allowed;
    this.ui?.hud?.setDemolish?.({ active: true, target, allowed });
  }

  _refundText(refund) {
    if (!refund) return '환불 없음';
    const parts = [];
    if (Number(refund.gold) > 0) parts.push(`골드 ${Math.floor(refund.gold)}`);
    if (Number(refund.wood) > 0) parts.push(`목재 ${Math.floor(refund.wood)}`);
    for (const [id, n] of Object.entries(refund.minerals || {})) {
      if (Number(n) <= 0) continue;
      const name = MINERAL_TYPES.find((m) => m.id === id)?.name || id;
      parts.push(`${name} ${Math.floor(n)}`);
    }
    return parts.length ? parts.join(' · ') : '환불 없음';
  }

  _tryDemolish() {
    if (!this.demolish.active) return false;
    const turret = this.demolish.target ?? this._findTurretAtCrosshair();
    if (!turret) {
      this.notify('철거할 건물을 조준선 중앙에 맞추세요', 'warn');
      this.audio?.play?.('error');
      return true;
    }
    if (!this._canDemolish(turret)) {
      this.notify('멀티플레이에서는 내가 지은 건물만 철거할 수 있습니다', 'warn');
      this.audio?.play?.('error');
      return true;
    }
    const name = turret.type?.name ?? '건물';
    const refund = this.turrets?.sell?.(turret.id);
    if (!refund) return true;
    net.sendTurretSell(turret.id);
    this.demolish.target = null;
    this.demolish.lastKey = '';
    this.ui?.hud?.setDemolish?.({ active: true, target: null, allowed: true });
    this.ui?.panels?.refresh?.();
    this.notify(`${name} 철거 — 재료 25% 환불 (${this._refundText(refund)})`, 'success');
    return true;
  }

  /**
   * 건설창이 열려 있으면 닫고 시점 조작(포인터 잠금)으로 돌아간다.
   * **건설 모드(build.active)는 그대로** — 바닥을 조준해 좌클릭하면 설치된다.
   */
  _closeBuildPanel() {
    if (this.ui?.panels?.currentId !== 'build') return false;
    this.ui.panels.close();
    this._syncPointerLock();
    return true;
  }

  // ── 건물 360도 회전 (X · Shift+X) ────────────────────────────────
  /**
   * 건설 미리보기 방향을 45° 돌린다(Shift+X 는 반대).
   * 설치는 이 방향(yaw) 그대로 이루어져 벨트·채굴기·소환문 진행 방향이 정해진다.
   */
  rotatePreview(dir = 1) {
    const STEP = Math.PI / 4;
    const next = (Number(this.build?.yaw) || 0) + STEP * (dir < 0 ? -1 : 1);
    this.build.yaw = Math.atan2(Math.sin(next), Math.cos(next));
    if (this.build.ghost) this.build.ghost.rotation.y = this.build.yaw;
    this.notify(`건설 방향 ${this._yawDegrees(this.build.yaw)}° — X 회전 · Shift+X 반대`, 'info');
    return this.build.yaw;
  }

  /** yaw(라디안) → 0~359 도 */
  _yawDegrees(yaw) {
    const deg = Math.round(((Number(yaw) || 0) * 180) / Math.PI) % 360;
    return (deg + 360) % 360;
  }

  /**
   * R 을 누르고 있는 동안 조준한 건물(또는 건설 미리보기)을 부드럽게 연속 회전한다.
   * Shift+R 은 반대 방향. 초당 TURRET_ROTATE.netHz 회만 네트워크로 내보낸다.
   */
  _updateHoldRotate(dt, { shift = false } = {}) {
    const input = this.input;
    const held = keyDown(input, 'ultimate');
    if (!held) {
      this._rotateHold = false;
      this._rotateNetAcc = 0;
      return false;
    }
    const step = TURRET_ROTATE.holdSpeed * Math.max(0, Math.min(Number(dt) || 0, 0.1)) * (shift ? -1 : 1);
    if (!step) return false;
    // 건설 중 — 미리보기(고스트)를 부드럽게 돌린다.
    if (this.build.active) {
      const next = (Number(this.build.yaw) || 0) + step;
      this.build.yaw = Math.atan2(Math.sin(next), Math.cos(next));
      if (this.build.ghost) this.build.ghost.rotation.y = this.build.yaw;
      if (!this._rotateHold) {
        this._rotateHold = true;
        this.notify('R 유지 — 건설 방향을 부드럽게 회전합니다 (Shift+R 반대)', 'info');
      }
      return true;
    }
    const turret = this._aimedTurret();
    if (!turret) {
      this._rotateHold = false;
      return false;
    }
    const res = this.turrets?.rotate?.(turret.id, step, { smooth: true });
    if (!res?.ok) return false;
    if (!this._rotateHold) {
      this._rotateHold = true;
      this.notify(`${turret.type?.name ?? '건물'} — R 유지로 부드럽게 회전 (Shift+R 반대)`, 'info');
    }
    this._rotateNetAcc += Math.max(0, Number(dt) || 0);
    if (this._rotateNetAcc >= 1 / TURRET_ROTATE.netHz) {
      this._rotateNetAcc = 0;
      const current = this.turrets?.find?.(turret.id) ?? turret;
      net.sendTurretRotate?.({
        turretId: current.id,
        yaw: Number(current.yaw) || 0,
        x: current.position.x,
        y: current.position.y,
        z: current.position.z
      });
    }
    return true;
  }

  /**
   * 로그인한 계정 닉네임을 캐릭터 이름 기본값으로 채택한다(이름을 직접 만든 경우 유지).
   */
  _adoptAccountName() {
    const account = currentNickname() || auth.user?.nickname || auth.user?.username || '';
    if (!account) return false;
    const current = sanitizeCharacter(this.character, '');
    if (current.name) return false;
    this.character = this.characterStore.save({ ...current, name: account }, account);
    this.ui.menu.character = this.character;
    this.ui.lobby?.refreshCharacter?.();
    return true;
  }

  /**
   * 조준선 근처의 내 건물을 찾는다(회전 조작 대상).
   * 시선 방향 투영 거리 + 수직 거리로 판정 — 별도 콜라이더 없이도 안정적이다.
   */
  _aimedTurret(reach = TURRET_ROTATE.reach) {
    const origin = this.player?.eyePosition;
    const dir = this.player?.aimDirection;
    if (!origin || !dir) return null;
    let best = null;
    let bestAlong = Infinity;
    for (const t of this.towers) {
      if (!t || t.destroyed) continue;
      const dx = t.position.x - origin.x;
      const dy = t.position.y + 0.8 - origin.y;
      const dz = t.position.z - origin.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.001 || dist > reach) continue;
      const along = dx * dir.x + dy * dir.y + dz * dir.z;
      if (along <= 0) continue;
      const perp = Math.sqrt(Math.max(0, dist * dist - along * along));
      if (perp > TURRET_ROTATE.cone) continue;
      if (along < bestAlong) {
        bestAlong = along;
        best = t;
      }
    }
    return best;
  }

  /** 조준한 건물을 45° 회전(Shift+X 는 반대). 대상이 없으면 false. */
  rotateAimedTurret(dir = 1) {
    const turret = this._aimedTurret();
    if (!turret) return false;
    return this.rotateTurret(turret.id, dir);
  }

  /** 건물 회전 — 로컬 반영 + 멀티플레이 릴레이. */
  rotateTurret(turretId, dir = 1) {
    const STEP = Math.PI / 4;
    const res = this.turrets?.rotate?.(turretId, STEP * (dir < 0 ? -1 : 1));
    if (!res?.ok) return false;
    const turret = res.turret;
    net.sendTurretRotate?.({
      turretId: turret.id,
      yaw: res.yaw,
      x: turret.position.x,
      y: turret.position.y,
      z: turret.position.z
    });
    this.audio?.play?.('build');
    this.notify(`${turret.type?.name ?? '건물'} 방향 ${res.degrees}° — 360° 자유 회전`, 'info');
    return true;
  }

  /** 다른 클라이언트가 돌린 건물 방향을 따라간다(회전 릴레이). */
  applyNetGameEvent(ev) {
    const p = ev?.payload ?? null;
    const type = ev?.type;
    if (!type || !p) return false;
    if (type === 'system') {
      if (p.message) this.notify(String(p.message).slice(0, 160), 'info');
      return true;
    }
    if (type === 'turret:place') {
      // 동료가 지은 건물을 이쪽 월드에도 세운다(자원 소모 없음).
      return Boolean(this.turrets?.placeRemote?.(p));
    }
    if (type === 'turret:sell') {
      return Boolean(this.turrets?.removeRemote?.(p.id ?? p.turretId));
    }
    if (type !== 'turret:rotate') return false;
    const byId = this.turrets?.find?.(p.turretId) ?? null;
    const found = byId && !byId.destroyed ? byId : this._turretNear(p);
    if (!found) return false;
    return Boolean(this.turrets?.setYaw?.(found.id, Number(p.yaw) || 0, { smooth: true })?.ok);
  }

  /** 좌표로 가장 가까운 건물(릴레이 id 불일치 대비) */
  _turretNear(p) {
    const x = Number(p?.x);
    const z = Number(p?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    let best = null;
    let bestD = TURRET_ROTATE.match;
    for (const t of this.towers) {
      if (!t || t.destroyed) continue;
      const d = Math.hypot(t.position.x - x, t.position.z - z);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  _cycleTurret(dir) {
    const list = this.build.list;
    if (!list?.length) return;
    const idx = Math.max(0, list.findIndex((t) => t.id === this.build.typeId));
    const next = (idx + dir + list.length) % list.length;
    this.selectTurret(list[next].id);
  }

  raycastGround(origin, direction, maxDist = 70) {
    if (!this.world) return null;
    const p = new THREE.Vector3();
    for (let t = 1; t < maxDist; t += 0.7) {
      p.copy(direction).multiplyScalar(t).add(origin);
      const h = this.world.getHeight(p.x, p.z);
      if (!Number.isFinite(h)) continue;
      if (p.y <= h + 0.4) return new THREE.Vector3(p.x, h, p.z);
    }
    return null;
  }

  _updateGhost(force = false) {
    if (!this.turrets || !this.player) return;
    if (!this.build.active) {
      if (this.build.ghost) {
        this.scene.remove(this.build.ghost);
        this.build.ghost = null;
      }
      return;
    }
    if (!this.build.ghost || force) {
      if (this.build.ghost) this.scene.remove(this.build.ghost);
      this.build.ghost = this.turrets.buildPreview?.(this.build.typeId) ?? null;
      if (this.build.ghost) this.scene.add(this.build.ghost);
    }
    if (!this.build.ghost) return;
    this.build.ghost.rotation.y = Number(this.build.yaw) || 0;
    const hit = this.raycastGround(this.player.eyePosition, this.player.aimDirection);
    if (!hit) {
      this.build.ghost.visible = false;
      this.build.ghostValid = false;
      return;
    }
    const res = this.turrets.canPlace(this.build.typeId, hit);
    this.build.ghost.visible = true;
    this.build.ghost.position.copy(hit);
    this.build.ghostValid = Boolean(res?.ok);
    const tint = this.build.ghostValid ? 0x5fd97a : 0xff4d4d;
    this.build.ghost.traverse?.((o) => {
      if (o.material && 'opacity' in o.material) {
        o.material.color?.setHex?.(tint);
        o.material.opacity = 0.4;
        o.material.transparent = true;
      }
    });
  }

  _tryPlace() {
    if (!this.build.active) return false;
    const hit = this.build.ghost?.visible ? this.build.ghost.position.clone() : this.raycastGround(this.player.eyePosition, this.player.aimDirection);
    if (!hit) {
      this.notify('건설할 지면을 찾을 수 없습니다', 'warn');
      return true;
    }
    const res = this.turrets.canPlace(this.build.typeId, hit);
    if (!res?.ok) {
      this.notify(res?.reason || '이곳에는 지을 수 없습니다', 'warn');
      this.audio.play('error');
      return true;
    }
    const placeOpts = { yaw: Number(this.build.yaw) || 0 };
    // 멀티에서는 플레이어별로 겹치지 않는 id 를 쓴다(회전·철거가 남의 건물을 건드리지 않게).
    if (this.multiplayer) {
      placeOpts.id = String(net.id || 'p').slice(0, 8) + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    }
    const turret = this.turrets.place(this.build.typeId, hit, net.id || 'local', placeOpts);
    if (turret) {
      this.audio.play('build');
      const placedType = TURRET_BY_ID[this.build.typeId] || null;
      const hint =
        placedType?.kind === 'workbench'
          ? ' — C(제작 패널)의 🔨 작업대 탭에서 모든 무기를 만들 수 있습니다'
          : placedType?.kind === 'autominer'
            ? ' — 바닥에 설치했으니 스스로 광물을 캡니다'
            : placedType?.kind === 'conveyor'
              ? ' — 바라보는 방향으로 자원을 실어 나릅니다(위에 서면 실려 갑니다)'
              : placedType?.kind === 'spawner'
                ? ' — 주기적으로 몬스터가 나옵니다! 방어선을 준비하세요'
                : placedType?.kind === 'portal'
                  ? ' — 가까이에서 N 키를 누르면 그 지형으로 이동합니다'
                  : placedType?.kind === 'storage'
              ? ' — 매 초 골드·목재를 자동으로 모읍니다'
              : '';
      this.notify(`${placedType?.name ?? '포탑'} 건설 완료${hint}`, 'success');
      if (placedType?.category === 'facility') this.ui?.panels?.refresh?.();
      if (placedType?.category === 'portal') {
        this.ui?.panels?.refresh?.();
        if (this.portalCount(placedType.portalDest) <= 0) {
          this.build.active = false;
          this._updateGhost();
        }
      }
      net.sendTurretPlace({
        id: turret.id,
        typeId: this.build.typeId,
        x: hit.x,
        y: hit.y,
        z: hit.z,
        ownerId: net.id || 'local',
        yaw: Number(this.build.yaw) || 0
      });
      if (this.mode !== 'creative' && !this.economy.canAfford(TURRET_BY_ID[this.build.typeId]?.cost || {})) {
        this.build.active = false;
        this._updateGhost();
      }
    }
    return true;
  }

  _castSpell() {
    if (!this.spells || !this.player) return;
    const res = this.spells.cast({
      origin: this.staff?.muzzlePosition ?? this.player.eyePosition,
      direction: this.player.aimDirection,
      player: this.player,
      enemies: this.enemies,
      turrets: this.towers
    });
    if (!res?.ok) {
      if (res?.reason === 'mana') this.audio.play('error');
      return;
    }
    this.staff?.triggerAttack?.({});
    this.staff?.playCast?.();
    this._shake = Math.min(0.25, this._shake + 0.05);
  }

  _useSkill() {
    const relic = this.spells?.relic;
    const res = this.spells?.useSkill?.({
      player: this.player,
      enemies: this.enemies,
      turrets: this.towers,
      waves: this.waves,
      world: this.world
    });
    if (!res?.ok) {
      this.notify(res?.reason === 'cooldown' ? '아직 사용할 수 없습니다' : '유물 스킬이 없습니다', 'warn');
      return;
    }
    this.audio.play('relic');
    this.notify('유물 스킬 발동!', 'gacha');
  }

  // ── 무기 시스템 (68종 · 계열별 스왑모션 · 임팩트 · 활은 화살 소모)
  _enemyList() {
    return this.enemies?.list ?? this.waves?.enemies ?? [];
  }

  _frontPosition(distance = 3) {
    const p = this.player?.eyePosition?.clone?.() ?? new THREE.Vector3();
    const dir = this.player?.aimDirection;
    if (dir) p.addScaledVector(dir, distance);
    return p;
  }

  _soulBlessing() {
    const saved = Number(this.achievements?.get?.('salvations')) || 0;
    return Math.min(DREAM_TREE.passive.max, saved * DREAM_TREE.passive.perSave);
  }

  weaponList() {
    const owned = this.weapons?.owned;
    // 보유하지 않은 무기는 목록에 넣지 않는다(맨손 시작 — 제작해야 생긴다).
    const list = !owned || typeof owned.has !== 'function' ? [] : WEAPONS.filter((w) => owned.has(w.id));
    // 전직 잠금 — Q 순환은 지금 쓸 수 있는 무기만 돈다
    return this.classes ? list.filter((w) => this.classes.canUse(w.id)) : list;
  }

  /** 지금 들 수 있는 가장 좋은 무기로 바꾼다(전직으로 무기가 잠겼을 때) */
  _equipBestUsable({ silent = true } = {}) {
    const list = this.weaponList().filter((w) => this.classes?.canUse?.(w.id) !== false);
    if (!list.length) return false;
    const best = list.slice().sort((a, b) => (Number(b.tier) || 0) - (Number(a.tier) || 0))[0];
    return this.equipWeapon(best.id, { silent, instant: true });
  }

  /** 전직한 직업 계열의 1티어(일반) 무기 id — 예: mage → staff_common · fairy → fairywand_common */
  _classStarterWeaponId(cls = this.classes) {
    return classStarterWeaponId(cls?.classId ?? cls?.def?.id ?? 'novice');
  }

  /** 전직 보상 — 각 직업의 1티어 무기를 지급하고, 아직 쓸 무기가 없으면 바로 장착한다. */
  _grantClassStarterWeapon(cls = this.classes) {
    const id = this._classStarterWeaponId(cls);
    const weapon = id ? WEAPON_BY_ID[id] : null;
    if (!weapon) return null;
    const already = this.hasWeapon(id);
    const added = this.ownWeapon(id, { silent: true }) !== false;
    if (added) {
      this.notify(`전직 지급 — ${weapon.name} (${weapon.gradeName || '일반'} · 1티어)`, 'success');
      if (!this.weaponId || !cls.canUse(this.weaponId)) {
        this.equipWeapon(id, { silent: true, instant: true });
      }
      this._refreshPanels();
    }
    return { id, added, already };
  }

  /** 전직 결과 알림 + 패시브 재적용 + 잠긴 무기 교체 */
  _onClassChange(payload, kind = '전직') {
    const cls = this.classes;
    if (!cls) return;
    // 전직 결과는 항상 알림으로 보여준다(HUD 토스트).
    if (this.state !== 'loading') {
      this.notify(`${kind} — ${cls.label} · 무기 피해 ×${cls.weaponDamageMult.toFixed(2)}`, 'gacha');
    }
    this.audio?.play?.('levelup');
    if (kind === '전직') this._grantClassStarterWeapon(cls);
    this._applyClassModifiers();
    if (this.weaponId && !cls.canUse(this.weaponId)) this._equipBestUsable();
    this.ui?.panels?.refresh?.();
  }

  /** 전직 패시브를 플레이어·포탑에 반영(전직 직후에도 호출) */
  /** 히든 지역(벚꽃의 정원 · 시간의 지평선)을 처음 밟으면 알린다 */
  _checkRegionDiscovery() {
    const world = this.world;
    const player = this.player;
    if (!world || !player || player.alive === false) return null;
    const found = world.discover?.(player.position.x, player.position.z);
    if (!found) return null;
    this.notify?.(`${found.glyph} 히든 지역 발견 — ${found.name}`, 'gacha');
    this.notify?.(found.desc, 'info');
    this.audio?.play?.('levelup');
    return found;
  }

  _applyClassModifiers() {
    const m = this.classes?.modifiers;
    if (!m) return;
    const bonus = this._fairyModifiers();
    const fx = (v, d = 1) => (Number.isFinite(v) ? Number(v) : d);
    const gear = this._mergedGearBonus();
    const gx = (v) => 1 + (Number(v) || 0);
    if (this.player) {
      this.player.manaRegenMult = fx(bonus.manaRegen) * fx(m.manaRegen) * gx(gear?.manaRegenPct);
      this.player.speedMult = fx(bonus.moveSpeed) * fx(m.moveSpeed) * gx(gear?.moveSpeedPct);
      this.player.damageTakenMult = fx(m.damageTaken) * (1 - Math.min(0.6, Number(gear?.damageTakenPct) || 0));
      // 스태미나 회복은 기본값 대비 비율이므로 매번 기본값에서 다시 계산한다
      if (Number.isFinite(this._staminaRegenBase)) {
        this.player.staminaRegen = this._staminaRegenBase * gx(gear?.staminaRegenPct);
      } else {
        this._staminaRegenBase = Number(this.player.staminaRegen) || 0;
      }
    }
    if (this.turrets) {
      this.turrets.miningBonus = fx(bonus.miningSpeed) * fx(m.miningSpeed) * gx(gear?.miningSpeedPct);
    }
  }

  /** 가죽 장비 + 캐릭터 전용 아이템 보너스를 합친 값 (같은 키를 더한다) */
  _mergedGearBonus() {
    const gear = this.gear?.bonus?.() ?? null;
    const charm = this.charItems?.bonus?.(this.character) ?? null;
    if (!charm) return gear;
    const out = { ...(gear || {}) };
    for (const [k, v] of Object.entries(charm)) out[k] = (Number(out[k]) || 0) + (Number(v) || 0);
    return out;
  }

  /** 가죽 장비 변경 — 보너스 재계산(능력치 + 비행) + UI 갱신 */
  applyGear() {
    this._applyClassModifiers();
    this._applyFlight();
    this.ui?.panels?.refresh?.();
    return this.gear?.bonus?.() ?? null;
  }

  /**
   * 가죽 장비 제작(구매) — 경제에서 재료를 지불하고 즉시 착용한다.
   * { ok, message, gear }
   */
  buyGear(id) {
    const gear = this.gear;
    if (!gear) return { ok: false, message: '게임이 시작된 뒤에 만들 수 있습니다' };
    const r = gear.buy(id);
    if (r?.ok === false) {
      this.notify(r.reason ?? '가죽 장비를 만들 수 없습니다', 'warn');
      this.ui?.panels?.refresh?.();
      return { ok: false, message: r.reason };
    }
    if (r.cost?.gold) this.track?.('goldSpent', Math.round(Number(r.cost.gold) || 0));
    this.applyGear();
    this.audio?.play?.('gachaLegend');
    this.notify(`가죽 장비 완성 — ${r.gear.name} (${r.gear.slot === 'back' ? '등' : r.gear.slot}) · ${gear.stats().pieces}세트`, 'gacha');
    return { ok: true, message: `${r.gear.name} 제작 완료`, gear: r.gear };
  }

  /** 가죽 장비 착용 */
  equipGear(id) {
    const gear = this.gear;
    if (!gear) return { ok: false, message: '게임이 시작된 뒤에 착용할 수 있습니다' };
    const r = gear.equip(id);
    if (r?.ok === false) {
      this.notify(r.reason ?? '착용할 수 없습니다', 'warn');
      return { ok: false, message: r.reason };
    }
    this.applyGear();
    this.audio?.play?.('swap');
    this.notify(`가죽 장비 착용 — ${r.gear.name}`, 'success');
    return { ok: true, message: `${r.gear.name} 착용`, gear: r.gear };
  }

  /** 가죽 장비 해제(슬롯 id 또는 장비 id) */
  unequipGear(slotOrId = null) {
    const gear = this.gear;
    if (!gear) return { ok: false, message: '게임이 시작된 뒤에 사용할 수 있습니다' };
    const r = gear.unequip(slotOrId);
    if (r?.ok === false) {
      this.notify(r.reason ?? '해제할 장비가 없습니다', 'warn');
      return { ok: false, message: r.reason };
    }
    this.applyGear();
    this.notify(`가죽 장비 해제 — ${r.gear?.name ?? slotOrId}`, 'info');
    return { ok: true, message: '가죽 장비 해제' };
  }

  /** 캐릭터 전용 아이템 구매 — 그 캐릭터만 살 수 있다 */
  buyCharacterItem(id) {
    const sys = this.charItems;
    if (!sys) return { ok: false, message: '게임이 시작된 뒤에 구매할 수 있습니다' };
    const item = CHARACTER_ITEM_BY_ID[id] ?? null;
    const price = Math.floor(Number(item?.cost?.gold) || 0);
    const gold = Number(this.economy?.gold) || 0;
    const r = sys.buy(id, {
      character: this.character,
      gold,
      spend: (cost) => {
        if ((Number(this.economy?.gold) || 0) < cost) return false;
        if (typeof this.economy.spendGold === 'function') this.economy.spendGold(cost);
        else this.economy.gold -= cost;
        this.track?.('goldSpent', Math.round(cost));
        return true;
      }
    });
    if (!r.ok) {
      this.notify(r.message ?? '구매할 수 없습니다', 'warn');
      this.ui?.panels?.refresh?.();
      return r;
    }
    this.applyGear();
    this.audio?.play?.('gachaLegend');
    this.notify(`${r.message} · ${price} G`, 'gacha');
    return r;
  }

  /** 캐릭터 전용 아이템 착용 */
  equipCharacterItem(id) {
    const sys = this.charItems;
    if (!sys) return { ok: false, message: '게임이 시작된 뒤에 착용할 수 있습니다' };
    const r = sys.equip(id, { character: this.character });
    if (!r.ok) {
      this.notify(r.message ?? '착용할 수 없습니다', 'warn');
      return r;
    }
    this.applyGear();
    this.audio?.play?.('swap');
    this.notify(r.message, 'success');
    return r;
  }

  /** 캐릭터 전용 아이템 해제 */
  unequipCharacterItem() {
    const r = this.charItems?.unequip?.() ?? { ok: false, message: '없음' };
    if (!r.ok) {
      this.notify('착용한 전용 아이템이 없습니다', 'info');
      return r;
    }
    this.applyGear();
    this.notify(r.message, 'info');
    return r;
  }

  /** 가죽 장비 전부 해제 */
  unequipAllGear() {
    const r = this.gear?.unequipAll?.() ?? { count: 0 };
    this.applyGear();
    if (r.count) this.notify(`가죽 장비 ${r.count}벌 해제`, 'info');
    return { ok: true, count: r.count };
  }

  /** 가죽 장비 상태 — UI/관리자가 읽는다 */
  gearState() {
    const gear = this.gear;
    const stats = gear?.stats?.() ?? null;
    return {
      owned: gear ? [...gear.owned] : [],
      equipped: { ...(gear?.equipped ?? {}) },
      pieces: stats?.pieces ?? 0,
      slots: GEAR_SLOTS.map((s) => ({ ...s, gearId: gear?.equippedIn?.(s.id) ?? null })),
      bonus: stats ?? null,
      sets: gear?.setTexts?.() ?? []
    };
  }

  /**
   * 기본 보유 무기 — **아무것도 없다(맨손 시작)**.
   * 모든 무기는 작업대(건설 → 🏗 시설 → 🔨 작업대)에서 만들거나 티어 제작대에서 만들어 장착한다.
   * 유물 지팡이 2종(시간·창세)과 꿈나무는 부여대 조합·조건 해금으로 얻는다.
   */
  _defaultOwned() {
    return new Set();
  }

  /** 지금 맨손인가(무기 미장착) */
  isBareHanded() {
    return !this.weaponId || this.weaponId === FIST_WEAPON_ID;
  }

  hasWeapon(id) {
    if (!this.weapons?.owned) return true;
    return this.weapons.owned.has(id);
  }

  /** 패널 갱신을 요청한다 — 짧은 시간에 여러 번 불려도 프레임당 1회로 병합된다(계약 §4.47). */
  _refreshPanels() {
    const panels = this.ui?.panels;
    if (!panels) return false;
    if (typeof panels.requestRefresh === 'function') return panels.requestRefresh();
    return panels.refresh?.() ?? false;
  }

  /**
   * 무기 뷰모델의 셰이더를 미리 컴파일한다(계약 §4.53).
   * 처음 장착하는 무기는 GPU 프로그램 컴파일 때문에 그 프레임만 길어져 "게임이 멈춘" 것처럼 보인다.
   * 메뉴·일시정지 동안 프레임당 몇 종씩만 컴파일해 두면 소환·장착 순간에 멈춤이 없다.
   */
  _prewarmStep(perFrame = 6, budgetMs = 2.5) {
    if (this._prewarmDone) return false;
    if (!this._prewarmQueue) {
      this._prewarmQueue = Object.keys(WEAPON_BY_ID);
      this._warmScene = new THREE.Scene();
      if (this.perf) this.perf.prewarm = { done: 0, total: this._prewarmQueue.length };
    }
    const compile = this.renderer?.compile;
    if (typeof compile !== 'function' || !this.camera) {
      this._prewarmDone = true;
      return false;
    }
    let built = 0;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    for (let i = 0; i < perFrame && this._prewarmQueue.length; i += 1) {
      // 예산을 넘겼으면 남은 종은 다음 프레임으로 — 한 프레임이 길어지면 그게 곧 "멈춤"이다.
      if (i > 0 && now() - startedAt > budgetMs) break;
      const id = this._prewarmQueue.shift();
      let mesh = null;
      try {
        mesh = buildWeaponMesh(id);
      } catch {
        mesh = null; // 한 종이 실패해도 나머지는 계속 예열한다
      }
      if (mesh?.group) {
        this._warmScene.add(mesh.group);
        built += 1;
      }
    }
    if (built) {
      try {
        compile.call(this.renderer, this._warmScene, this.camera);
      } catch {
        this._prewarmDone = true;
        return false;
      }
    }
    // 예열한 무기는 기록해 둔다 — 소환할 때 다시 만들지 않는다(계약 §4.67)
    if (!this._warmedWeapons) this._warmedWeapons = new Set();
    for (const id of Object.keys(WEAPON_BY_ID)) {
      if (!this._prewarmQueue.includes(id)) this._warmedWeapons.add(id);
    }
    if (this.perf?.prewarm) this.perf.prewarm.done = this.perf.prewarm.total - this._prewarmQueue.length;
    if (!this._prewarmQueue.length) this._prewarmDone = true;
    return built > 0;
  }

  /**
   * 무기 여러 종을 프레임 예산 안에서 나눠 지급한다(계약 §4.47).
   * /무기전부 처럼 수십 종을 한 번에 주면 그 프레임이 길어져 화면이 멈춘 것처럼 보인다.
   * 돌려주는 값은 큐에 들어간(새로 지급할) 개수다.
   */
  grantWeapons(ids) {
    const list = [...new Set(ids ?? [])].filter((id) => weaponById(id) && !this.hasWeapon?.(id));
    if (!list.length) {
      this.notify?.('이미 모든 무기를 보유하고 있습니다', 'info');
      return 0;
    }
    this._grants.enqueue(list, (id) => this.ownWeapon(id, { silent: true }), {
      onDone: (n) => {
        this._refreshPanels();
        this.notify?.(`모든 무기 소환 완료 — ${n}종 획득`, 'gacha');
      }
    });
    return list.length;
  }

  /**
   * 무기 메시를 예열한다(계약 §4.67) — 메시를 만들어 warm 씬에 넣고 셰이더를 컴파일한다.
   * 렌더러가 없으면(헤드리스) 예열할 것이 없으므로 true 를 돌려준다.
   */
  _warmWeapon(id) {
    const key = String(id ?? '');
    if (!key) return false;
    if (this._warmedWeapons?.has?.(key)) return true;
    const compile = this.renderer?.compile;
    if (typeof compile !== 'function' || !this.camera) return true;
    if (!this._warmScene) this._warmScene = new THREE.Scene();
    if (!this._warmedWeapons) this._warmedWeapons = new Set();
    try {
      const mesh = buildWeaponMesh(key);
      if (mesh?.group) this._warmScene.add(mesh.group);
      compile.call(this.renderer, this._warmScene, this.camera);
      this._warmedWeapons.add(key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 관리자 소환(계약 §4.67) — 지급은 즉시, 장착은 **셰이더 예열이 끝난 다음 프레임**에 한다.
   * 즉시 장착하면 컴파일이 그 프레임에 몰려 멈춘 것처럼 보인다.
   */
  summonWeapon(id, { silent = false } = {}) {
    const key = String(id ?? '');
    if (!key) return false;
    if (!this.summons) this.summons = new SummonQueue();
    const already = this.hasWeapon?.(key) === true;
    const owned = already ? false : this.ownWeapon(key, { silent: true }) !== false;
    const queued = this.summons.push(key);
    if (!silent) {
      const name = WEAPON_BY_ID[key]?.name ?? key;
      this.notify?.(`무기 소환 — ${name}${already ? ' · 이미 보유' : ' · 신규 획득'} · 셰이더 예열 중…`, 'info');
    }
    return owned || already || queued;
  }

  /** 소환 큐를 한 칸 진행한다(프레임당 1종). */
  _summonStep() {
    if (this.state === 'paused' || this.state === 'menu') return null; // 일시정지·메뉴에서는 진행하지 않는다(§4.71)
    if (!this.summons?.pending) return null;
    const done = this.summons.step(
      (id) => this._warmWeapon(id),
      (id) => {
        // 예열되지 않은 무기를 지금 장착하면 컴파일이 그 프레임에 몰린다 — 먼저 예열만 한다.
        if (this._warmedWeapons && !this._warmedWeapons.has(id) && this.renderer?.compile) return false;
        this.equipWeapon(id, { silent: true, instant: true });
        this.notify?.(`무기 장착 — ${WEAPON_BY_ID[id]?.name ?? id}`, 'success');
        return true;
      }
    );
    return done;
  }

  ownWeapon(id, { silent = false } = {}) {
    const weapon = weaponById(id);
    if (!weapon) return false;
    if (!this.weapons) this.weapons = { owned: this._defaultOwned(), equipped: this.weaponId ?? null };
    if (this.weapons.owned.has(id)) return false;
    this.weapons.owned.add(id);
    this.track?.('weaponsOwned', 1);
    if (id === DREAM_TREE.id) this.track?.('dreamTreeOwned', 1);
    if (!silent) {
      this.audio?.play?.('gachaLegend');
      const grade = weapon.gradeName ?? weapon.grade ?? '';
      this.notify(`무기 획득 — ${weapon.name} (${grade})`, 'gacha');
    }
    this._refreshPanels();
    return true;
  }

  /** 꿈나무 해금 조건: 요정 7명 + 업적 50개 + 종말의 낫 보유 */
  dreamTreeUnlocked() {
    const fairies = Number(this.fairies?.foundCount) || 0;
    const achievements = Number(this.achievements?.unlocked?.size) || 0;
    return (
      fairies >= DREAM_TREE.acquire.fairies &&
      achievements >= DREAM_TREE.acquire.achievements &&
      this.hasWeapon(DREAM_TREE.acquire.weapon)
    );
  }

  /** 0.5초마다 해금 조건을 확인한다(꿈나무는 조건을 만족하면 피어난다). */
  _checkWeaponUnlocks(dt = 0) {
    this._unlockT = (this._unlockT ?? 0) + (Number(dt) || 0);
    if (this._unlockT < 0.5) return false;
    this._unlockT = 0;
    if (this.hasWeapon(DREAM_TREE.id)) return false;
    if (!this.dreamTreeUnlocked()) return false;
    this.ownWeapon(DREAM_TREE.id, { silent: true });
    this.audio?.play?.('gachaLegend');
    this.notify(`${DREAM_TREE.name} — ${DREAM_TREE.quote}`, 'gacha');
    this._refreshPanels();
    return true;
  }

  /** 몬스터 소환문 → 웨이브 시스템의 즉석 소환으로 연결한다. */
  /**
   * 지형 티어별 야생 몬스터 — 매 프레임 호출.
   * 플레이어가 속한 지역의 편성표대로 등장하고, 멀어진 개체는 정리한다.
   */
  _updateRegionSpawns(dt) {
    const spawner = this.regionSpawner;
    const waves = this.waves;
    const player = this.player;
    if (!spawner || !waves || !player || this.adminFlight) return null;
    if (this.state !== 'playing' && this.state !== 'dead') return null;
    const pos = player.position ?? null;
    const regionId = this.world?.regionAt?.(Number(pos?.x) || 0, Number(pos?.z) || 0)?.id ?? null;
    this.roamerRegionId = regionId;
    return spawner.update(dt, {
      position: { x: Number(pos?.x) || 0, z: Number(pos?.z) || 0 },
      regionId,
      phase: waves.phase,
      enemies: this.enemies,
      spawn: (o) => waves.spawnRoamer?.(o) ?? null,
      despawn: (enemy) => {
        // waves._prune() 가 3초 안에 배열에서 제거하고 POOL 로 돌려준다.
        enemy.alive = false;
      }
    });
  }

  /** 관리자/디버그 — 지금 서 있는 지역의 야생 몬스터를 즉시 소환 */
  spawnRoamerNow(count = 1, typeId = null) {
    const waves = this.waves;
    const player = this.player;
    if (!waves || !player) return { ok: false, message: '게임이 시작된 뒤에 사용할 수 있습니다' };
    const x = Number(player.position?.x) || 0;
    const z = Number(player.position?.z) || 0;
    const regionId = this.world?.regionAt?.(x, z)?.id ?? null;
    const roster = regionMonsterRoster(regionId);
    if (!roster) return { ok: false, message: '이 지역에는 야생 몬스터가 없습니다 (기지 주변 안전 지대)' };
    const n = Math.max(1, Math.min(20, Math.floor(Number(count) || 1)));
    const out = [];
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n;
      const radius = 18 + i * 2;
      const enemy = waves.spawnRoamer?.({
        regionId,
        typeId: typeId ?? null,
        x: x + Math.cos(angle) * radius,
        z: z + Math.sin(angle) * radius,
        wave: roster.power,
        elite: i === 0 && n > 2
      });
      if (enemy) out.push(enemy);
    }
    if (out.length) this.notify(`야생 몬스터 ${out.length}마리 출현 — ${roster.name}`, 'warn');
    return { ok: out.length > 0, count: out.length, regionId, message: out.length ? `${roster.name} 야생 몬스터 ${out.length}마리` : '소환 실패(월드 상한)' };
  }

  /** 관리자 /가죽 — 가죽 지급 */
  adminLeather(query = '', amount = 1) {
    const eco = this.economy;
    if (!eco) return { ok: false, message: '게임이 시작된 뒤에 사용할 수 있습니다' };
    const q = String(query ?? '').trim().toLowerCase();
    const n = Math.max(1, Math.min(9999, Math.floor(Number(amount) || 1)));
    if (!q || q === '전부' || q === 'all' || q === '전체') {
      for (const l of LEATHER_TYPES) eco.addLeather?.(l.id, n);
      return { ok: true, message: `가죽 5종 각 ${n}개 지급`, ids: LEATHER_TYPES.map((l) => l.id) };
    }
    const exact = leatherById(q) ?? LEATHER_TYPES.find((l) => l.name.includes(query) || l.id.includes(q));
    if (!exact) return { ok: false, message: `알 수 없는 가죽입니다 — ${LEATHER_TYPES.map((l) => l.id).join(' / ')}` };
    eco.addLeather?.(exact.id, n);
    return { ok: true, message: `${exact.name} ${n}개 지급`, id: exact.id, amount: n };
  }

  /** 관리자 /장비 — 가죽 장비 전부 지급 + 착용 */
  adminGear(id = null) {
    const gear = this.gear;
    if (!gear) return { ok: false, message: '게임이 시작된 뒤에 사용할 수 있습니다' };
    if (id) {
      const r = gear.grant(id, { equip: true });
      if (!r.ok) return { ok: false, message: r.reason };
      this.applyGear();
      return { ok: true, message: `${r.gear.name} 지급 + 착용`, gear: r.gear };
    }
    const ids = [];
    for (const slot of GEAR_SLOTS) {
      const list = this.gear.list().filter((g) => g.slot === slot.id);
      const best = list[list.length - 1];
      if (best) {
        gear.grant(best.id, { equip: true });
        ids.push(best.id);
      }
    }
    this.applyGear();
    return { ok: true, message: `가죽 장비 ${ids.length}벌 지급 + 착용 — ${ids.join(', ')}`, ids };
  }

  _spawnFromTower(x, z, opts = {}) {
    const waves = this.waves;
    if (!waves || typeof waves.spawnAt !== 'function') return null;
    return waves.spawnAt(x, z, { wave: waves.wave, tier: opts?.tier ?? 1, source: opts?.source });
  }

  /** 제작 시스템에 넘기는 현재 상황 — 웨이브·요정·업적·보유 무기 */
  _craftingContext() {
    const waves = this.waves || {};
    const wave = Number(waves.wave ?? waves.currentWave ?? waves.current ?? 1) || 1;
    return {
      wave,
      cleared: Number(waves.cleared ?? 0) || 0,
      fairies: Number(this.fairies?.foundCount) || 0,
      achievements: Number(this.achievements?.unlocked?.size) || 0,
      hasWeapon: (id) => this.hasWeapon(id),
      // 요정의 날개 — 제작대에서 만든다(같은 제작대, 다른 게이트)
      hasWing: (id) => Boolean(this.wings?.has?.(id)),
      hasWorkbench: this.workbenchBuilt(),
      onBuilt: (id) => {
        const t = CRAFTING_TABLE_BY_ID[id];
        this.audio?.play?.('build');
        this.notify(`${t ? `${t.icon} ${t.name}` : id} 건설 완료 — 무기를 제작할 수 있습니다`, 'success');
        this.track?.('tablesBuilt', 1);
      },
      onCrafted: (id) => {
        this.ownWeapon(id, { silent: true });
        this.track?.('weaponsCrafted', 1);
        // 만든 무기는 곧바로 손에 쥔다 — 맨손 시작 → 작업대에서 제작 → 장착 흐름.
        const equipped = this.equipWeapon(id, { silent: true, instant: true });
        const w = weaponById(id);
        this.audio?.play?.('gachaLegend');
        this.notify(`제작 완료 — ${w ? w.name : id}${equipped ? ' · 장착됨' : ''}`, 'gacha');
      },
      onWingCrafted: (id) => {
        this.wings?.grant?.(id, { equip: true });
        this.applyFlight?.();
        this.track?.('wingsCrafted', 1);
        const w = fairyWingById(id);
        this.audio?.play?.('gachaLegend');
        this.notify(`날개 제작 완료 — ${w ? w.name : id} (즉시 착용)`, 'gacha');
      },
      onPortalCrafted: (dest) => {
        const name = TURRET_BY_ID['portal_' + dest]?.portalName ?? '포탈';
        this.track?.('portalsCrafted', 1);
        this.audio?.play?.('upgrade');
        this.notify(`🌀 ${name} 포탈 아이템 제작 — 설치하면 지속 포탈이 됩니다`, 'success');
      }
    };
  }

  // ── 제작대 공개 API(패널이 호출) ─────────────────
  craftingTableBuilt(id) {
    return Boolean(this.crafting?.isBuilt?.(id));
  }

  craftingTableUnlocked(id) {
    return Boolean(this.crafting?.isUnlocked?.(id));
  }

  /** 작업대(건설 시설)가 세워졌는지 — 제작 패널의 작업대 탭 조건 */
  workbenchBuilt() {
    const list = this.turrets?.turrets;
    if (!Array.isArray(list)) return false;
    return list.some((t) => !t.destroyed && t.type?.kind === 'workbench');
  }

  /** 마법부여대(시설)를 세웠는지 */
  enchanterBuilt() {
    const list = this.turrets?.turrets;
    if (!Array.isArray(list)) return false;
    return list.some((t) => !t.destroyed && t.type?.kind === 'enchanter');
  }

  /** 가장 가까운 마법부여대(사거리 안이면 그 건물) */
  nearestEnchanter(reach = 3.4) {
    const list = this.turrets?.turrets;
    const p = this.player?.position;
    if (!Array.isArray(list) || !p) return null;
    let best = null;
    let bestD = reach;
    for (const t of list) {
      if (!t || t.destroyed || t.type?.kind !== 'enchanter') continue;
      const d = Math.hypot(t.position.x - p.x, t.position.z - p.z);
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** 마법부여대 가까이 있는가(패널 게이트) */
  nearEnchanter(reach = 3.4) {
    return Boolean(this.nearestEnchanter(reach));
  }

  // ── 전기 · 저장고 (전력망은 TurretSystem 이 계산한다) ─────────────
  /** 반경 안에서 가장 가까운 저장고 */
  _nearbyStorage(radius = 26) {
    const list = this.turrets?.turrets;
    const p = this.player?.position;
    if (!Array.isArray(list) || !p) return null;
    let best = null;
    let bestD = radius;
    for (const t of list) {
      if (!t || t.destroyed || t.type?.kind !== 'storage') continue;
      const d = Math.hypot(t.position.x - p.x, t.position.z - p.z);
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** E — 반경 안 저장고의 자원을 즉시 수거. 수거한 것이 있으면 true */
  _collectNearbyStorage(radius = 26) {
    const sys = this.turrets;
    const p = this.player?.position;
    if (!sys?.collectStorageNear || !p) return false;
    const res = sys.collectStorageNear(p, radius);
    if (!res || res.gained <= 0) return false;
    this.audio?.play?.('ui');
    this.notify(`📦 저장고 수거 — 골드 ${Math.round(res.gold)} · 목재 ${Math.round(res.wood)}`, 'success');
    return true;
  }

  /** HUD·패널이 매 프레임 읽어도 비용이 없도록 0.5초마다 갱신하는 요약 */
  _refreshFacilityCaches() {
    this._powerCache = this.turrets?.powerStatus?.() ?? null;
    this._storageCache = this.turrets?.storageStatus?.() ?? null;
    this._updatePowerWarn();
  }

  /** 전력 요약(캐시) */
  powerSummary() {
    return (
      this._powerCache ?? {
        generators: 0, cables: 0, consumers: 0, stopped: 0,
        supply: 0, demand: 0, short: false, shortfall: 0, coverage: 1, networks: 0, unpowered: [], netList: []
      }
    );
  }

  /** 저장고 요약(캐시) */
  storageSummary() {
    return this._storageCache ?? { count: 0, gold: 0, wood: 0, capacity: 0, powered: 0 };
  }

  /** 전력이 모자라면 12초에 한 번만 알린다 */
  _updatePowerWarn() {
    const st = this._powerCache;
    if (!st || st.short !== true) {
      this._powerShortSeen = false;
      return;
    }
    const now = Number(this.clock?.elapsedTime) || 0;
    if (this._powerShortSeen && now - Number(this._powerWarnAt ?? -99) < 12) return;
    this._powerShortSeen = true;
    this._powerWarnAt = now;
    this.notify(
      `⚡ 전력 부족 — 공급 ${Math.round(st.supply)}kW / 소비 ${Math.round(st.demand)}kW · 발전기(⚡)를 세우고 전선(🔌)으로 이으세요`,
      'warn'
    );
  }

  /** 마법부여 컨텍스트 — 시스템이 보유 여부·건물 여부를 확인한다 */
  _enchantContext() {
    return { hasWeapon: (id) => this.hasWeapon(id), hasEnchanter: this.enchanterBuilt() };
  }

  /** 무기에 속성 부여 */
  enchantWeapon(weaponId, elementId) {
    if (!this.enchant) return { ok: false, error: '마법부여 시스템이 없습니다.' };
    const id = weaponId || this.weaponId || '';
    const res = this.enchant.enchant(id, elementId, this._enchantContext());
    if (!res.ok) {
      this.notify(res.error || '부여에 실패했습니다', 'warn');
      this.audio?.play?.('error');
      return res;
    }
    const w = weaponById(id);
    const st = res.state;
    this.audio?.play?.('levelup');
    this.notify(`${st?.icon ?? '✨'} ${w ? w.name : id} — ${st?.name ?? ''} ${st?.level ?? 1}레벨 (피해 +${st?.percent ?? 0}%)`, 'gacha');
    this.track?.('weaponEnchants', 1);
    this.ui?.panels?.refresh?.();
    return res;
  }

  /** 패널이 읽는 마법부여 상태 */
  enchantState() {
    const sys = this.enchant;
    const built = this.enchanterBuilt();
    const near = this.nearEnchanter();
    const owned = this.weaponList();
    const ids = owned.length ? owned.map((w) => w.id) : (this.weaponId ? [this.weaponId] : []);
    const equippedId = this.weaponId ?? null;
    const pick = this.ui?.panels?.state?.enchant?.weaponId || equippedId || ids[0] || '';
    return {
      built,
      near,
      maxLevel: sys?.maxLevel ?? 5,
      equippedId,
      weaponId: pick,
      element: this.ui?.panels?.state?.enchant?.element || '',
      elements: (sys?.elements ?? []).map((el) => {
        const info = sys?.costFor?.(pick, el.id) ?? { cost: null, level: 1, maxed: false, same: false };
        return { ...el, cost: info.cost, level: info.level, maxed: info.maxed, same: info.same, state: sys?.stateFor?.(pick) ?? null };
      }),
      weapons: ids.map((id) => {
        const w = weaponById(id);
        return {
          id,
          name: w?.name ?? id,
          tier: w?.tier ?? 1,
          gradeName: w?.gradeName ?? '',
          equipped: id === equippedId,
          enchant: sys?.stateFor?.(id) ?? null
        };
      }),
      applied: sys?.list?.() ?? []
    };
  }

  buildCraftingTable(id) {
    const r = this.crafting?.build?.(id) ?? { ok: false, error: '제작 시스템이 없습니다.' };
    if (r.ok) this.ui?.panels?.refresh?.();
    return r;
  }

  craftWeapon(id) {
    const r = this.crafting?.craft?.(id) ?? { ok: false, error: '제작 시스템이 없습니다.' };
    if (r.ok) this.ui?.panels?.refresh?.();
    return r;
  }

  /**
   * 요정의 날개 제작 — 제작대(같은 티어)를 건설한 뒤 만든다.
   * 비용(골드·광물·가죽)은 economy 가, 소유/장착은 WingSystem 이 처리한다.
   */
  craftWing(id) {
    const r = this.crafting?.craftWing?.(id) ?? { ok: false, error: '제작 시스템이 없습니다.' };
    if (!r.ok) {
      if (r.error) this.notify(r.error, 'warn');
      return r;
    }
    this.ui?.panels?.refresh?.();
    return r;
  }

  /** 화살 묶음 제작 — 같은 티어 제작대를 건설해야 한다(economy 화살 원장에 쌓인다). */
  craftArrow(id) {
    const r = this.crafting?.craftArrow?.(id) ?? { ok: false, error: '제작 시스템이 없습니다.' };
    if (!r.ok) {
      if (r.error) this.notify(r.error, 'warn');
      return r;
    }
    this.audio?.play?.('upgrade');
    this.notify((r.arrow?.name ?? id) + ' ' + r.amount + '발 제작 — 보유 ' + (this.economy?.getArrow?.(id) ?? 0) + '발', 'success');
    this.ui?.panels?.refresh?.();
    return r;
  }

  /** 포탈 아이템 제작 — 같은 제작대를 먼저 건설해야 한다 */
  craftPortal(dest) {
    const r = this.crafting?.craftPortal?.(dest) ?? { ok: false, error: '제작 시스템이 없습니다.' };
    if (!r.ok) {
      if (r.error) this.notify(r.error, 'warn');
      return r;
    }
    this.ui?.panels?.refresh?.();
    return r;
  }

  /** 보유 포탈 아이템 수(설치 게이트가 쓴다) */
  portalCount(dest) {
    return this.crafting?.portalCount?.(dest) ?? 0;
  }

  /** 제작한 포탈 아이템을 설치하는 건설 모드로 들어간다 */
  beginPortalPlacement(dest) {
    if (this.portalCount(dest) <= 0) {
      this.notify('포탈 아이템이 없습니다 — 제작(C)에서 먼저 만드세요', 'warn');
      return false;
    }
    this.selectTurret('portal_' + dest);
    return true;
  }

  /** 설치한 포탈 근처에서 N — 그 지형으로 이동한다 */
  travelToRegion(destId) {
    const dest = destinationById(destId);
    if (!dest) return false;
    const now = Date.now();
    if (this._travelCooldownUntil && now < this._travelCooldownUntil) return false;
    const point = arrivalPoint(dest);
    if (!this.player?.setPosition) return false;
    this.player.setPosition(point.x, undefined, point.z);
    this.player.velocity?.set?.(0, 0, 0);
    this._travelCooldownUntil = now + 800;
    this.audio?.play?.('upgrade');
    this.notify(`${dest.name}(으)로 이동했습니다`, 'success');
    return true;
  }

  /** 이 날개를 만들려면 어느 제작대가 필요한가(패널 안내용) */
  wingRecipeFor(id) {
    return this.crafting?.wingRecipe?.(id) ?? null;
  }

  equipWeapon(id, { silent = false, instant = false } = {}) {
    // null/'fists' 는 맨손으로 되돌리는 것이므로 보유·전직 잠금 검사를 건너뛴다.
    const bare = id === FIST_WEAPON_ID || id == null;
    const weapon = weaponOrFist(id);
    if (!weapon) {
      if (!silent) this.notify('알 수 없는 무기입니다', 'warn');
      return false;
    }
    const weaponId = bare ? FIST_WEAPON_ID : id;
    // 전직 잠금 — 다른 직업 계열/상위 등급은 장착할 수 없다(silent 여부와 무관).
    const lock = bare ? null : this.classes?.lockOf?.(id);
    if (lock?.locked) {
      if (!silent) this.notify(`잠긴 무기 — ${lock.reason}`, 'warn');
      return false;
    }
    if (!bare && this.weapons && !this.hasWeapon(weaponId)) {
      if (!silent) this.notify(`아직 획득하지 못한 무기입니다 — ${weapon.name}`, 'warn');
      return false;
    }
    const res = this.staff?.equip?.(weaponId, { instant, silent }) ?? { ok: false };
    if (res?.ok === false) return false;
    this.weaponId = weaponId;
    if (this.weapons) this.weapons.equipped = weaponId;
    if (!silent) {
      this.track?.('weaponSwaps', 1);
      if (bare) {
        this.notify('맨손 — 무기 없이 이동합니다 (작업대에서 제작하세요)', 'info');
      } else {
        const motion = WEAPON_MOTIONS[weapon.family]?.swap;
        const style = motion?.style ?? '기본';
        const dur = motion?.duration ?? 0;
        const ult = weapon.ultimate ? ultimateById(weapon.ultimate) : null;
        const skill = ult ? ` · ${this._ultimateKeyLabel()} 무기 스킬 ${ult.name}` : '';
        this.notify(`${weapon.name} (${weapon.gradeName}) — 스왑 ${style} ${dur}s${skill}`, 'success');
      }
    }
    this._refreshPanels();
    return true;
  }

  swapWeapon(dir = 1) {
    const list = this.weaponList();
    if (!list?.length) return false;
    const idx = Math.max(0, list.findIndex((w) => w.id === this.weaponId));
    const next = list[(idx + dir + list.length) % list.length];
    return this.equipWeapon(next.id);
  }

  /** 스왑모션 미리보기 — 재생 후 원래 무기로 되돌린다. */
  previewSwap(id) {
    const weapon = weaponById(id);
    if (!weapon) return false;
    const motion = WEAPON_MOTIONS[weapon.family]?.swap ?? null;
    const back = this.weaponId;
    this.equipWeapon(id, { silent: true });
    const style = motion?.style ?? '기본';
    const dur = motion?.duration ?? 0;
    this.notify(`스왑모션 — ${weapon.name} · ${style} ${dur}s`, 'info');
    if (this._previewTimer) clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => {
      this._previewTimer = null;
      if (back && back !== id) this.equipWeapon(back, { silent: true });
    }, Math.max(320, (motion?.duration ?? 0.5) * 1000 + 160));
    return true;
  }

  _attack() {
    // 마우스를 꾹 누르면 모든 무기가 1초에 1번씩 공격한다(v1.3.0).
    //  · 맨손 채집은 즉시, 전투 공격만 1초 간격으로 묶는다
    //  · 모션이 아직 끝나지 않았으면(무거운 무기) 그 모션의 타격이 나갈 때까지 기다린다
    const nowSec = Number(this.clock?.elapsedTime) || 0;
    if (nowSec < (this._holdAttackNextAt ?? 0)) return true;
    if (this.staff?.state === 'attacking' && Number(this.staff?.progress) < 0.9) return true;
    this._holdAttackNextAt = nowSec + 1;
    // 맨손(도구 없이) T1 자원 채집 — 적이 더 가까우면 전투를 우선한다
    if (this._tryBareHarvest()) return true;
    const weapon = this.staff?.weapon ?? null;
    if (!weapon) {
      this._castSpell();
      return false;
    }
    if (weapon.kind === 'ranged') {
      this._castSpell();
      return true;
    }
    if (weapon.kind === 'gun') {
      // 쌍권총 — 두 자루를 동시에 쏜다(탄환은 투사체가 명중 판정을 맡는다).
      this._gunAttack(weapon);
      return true;
    }
    if (weapon.kind === 'wand') {
      // 요정의 지팡이 — 티어 피해가 그대로 박히는 추적 꽃가루.
      this._wandAttack(weapon);
      return true;
    }
    if (weapon.kind === 'bow') {
      // 활 — 화살 1발 소모, 쿨다운마다 즉시 발사(모션은 연출)
      this._bowAttack(weapon);
      return true;
    }
    if (weapon.fist) {
      // 맨손 — 공격 모션이 없으므로 쿨다운마다 즉시 주먹 타격(도구 없이도 초반을 버틴다).
      const now = Number(this.clock?.elapsedTime) || 0;
      if (now < (this._fistReadyAt ?? 0)) return true;
      this._fistReadyAt = now + Math.max(0.35, Number(weapon.cooldown) || 0.7);
      this._meleeStrike(weapon);
      return true;
    }
    this.staff?.triggerAttack?.({ nonLethal: !!weapon.nonLethal });
    return true;
  }

  _onWeaponRelease() {
    const weapon = this.staff?.weapon ?? null;
    // 활은 발사 시점에 이미 화살이 나갔다 — 놓는 순간 근접 판정이 겹치면 안 된다.
    if (!weapon || weapon.kind === 'ranged' || weapon.kind === 'bow' || weapon.kind === 'gun') return null;
    return this._meleeStrike(weapon);
  }

  _meleeStrike(weapon) {
    const origin = this.player?.eyePosition;
    const dir = this.player?.aimDirection;
    if (!origin || !dir) return null;
    const aoe = Number(weapon.aoe) || 0;
    const reach = (Number(weapon.range) || 3) + aoe;
    const hits = [];
    for (const enemy of [...this._enemyList()]) {
      if (!enemy?.alive || !enemy.position) continue;
      const dx = enemy.position.x - origin.x;
      const dy = enemy.position.y - origin.y;
      const dz = enemy.position.z - origin.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const radius = Number(enemy.radius) || 0.6;
      if (dist > reach + radius) continue;
      const dot = dist > 0.001 ? (dx * dir.x + dy * dir.y + dz * dir.z) / dist : 1;
      if (aoe <= 0 && dot < 0.15) continue;
      hits.push(enemy);
      if (aoe <= 0) break;
    }
    let saved = 0;
    let hurt = 0;
    for (const enemy of hits) {
      if (weapon.nonLethal) {
        if (this._saveEnemy(enemy, weapon)) saved += 1;
      } else {
        const gearDamage = 1 + (Number(this._mergedGearBonus()?.damagePct) || 0);
        // 마법부여 — 무기에 새긴 속성의 피해 배율과 상태이상을 함께 적용한다.
        const ench = this.enchant?.bonusFor?.(weapon.id) ?? null;
        const enchantMult = Number(ench?.damageMult) || 1;
        const power = Math.max(
          1,
          Math.round((Number(weapon.damage) || 1) * (this.classes?.weaponDamageMult ?? 1) * gearDamage * enchantMult)
        );
        enemy.takeDamage?.(power, ench?.element ?? weapon.element ?? null, 'player');
        this.impacts?.hit?.(enemy.position, { weaponId: weapon.id, power: 1 });
        const steal = Number(weapon.lifesteal) || 0;
        if (steal > 0) {
          const healed = Math.round(power * steal);
          if (typeof this.player?.heal === 'function') this.player.heal(healed);
          else if (this.player) this.player.hp = Math.min(this.player.maxHp ?? this.player.hp, this.player.hp + healed);
        }
        hurt += 1;
      }
    }
    if (!hits.length) {
      const ground = this.raycastGround(origin, dir, reach + 4);
      if (ground) this.impacts?.hit?.(ground, { weaponId: weapon.id, power: 0.6 });
    }
    if (hurt > 0) this._shake = Math.min(0.6, (this._shake ?? 0) + 0.03 * hurt);
    return { hits: hits.length, saved, hurt };
  }

  /**
   * 쌍권총 — 두 자루의 총구에서 탄환을 한 발씩 동시에 쏜다.
   * 명중 판정·피해는 투사체가 처리하고, 여기서는 발사체/색/임팩트만 정한다.
   * 탄은 소모품이 아니다(활과 다른 점).
   */
  _gunAttack(weapon) {
    const now = Number(this.clock?.elapsedTime) || 0;
    if (now < (this._gunReadyAt ?? 0)) return false;
    const dir = this.player?.aimDirection;
    if (!dir || !this.projectiles?.spawn) return false;

    const gearDamage = 1 + (Number(this._mergedGearBonus()?.damagePct) || 0);
    const ench = this.enchant?.bonusFor?.(weapon.id) ?? null;
    const enchantMult = Number(ench?.damageMult) || 1;
    const arcanaMult = Number(this.arcana?.mult?.('playerDamage')) || 1;
    const power = Math.max(
      1,
      Math.round((Number(weapon.damage) || 1) * (this.classes?.weaponDamageMult ?? 1) * gearDamage * enchantMult * arcanaMult)
    );
    const tracer = weaponImpact(weapon.id)?.tracer ?? weapon.color ?? 0xffd27a;
    const right = new THREE.Vector3(-dir.z, 0, dir.x);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    else right.normalize();
    const spread = weapon.id === 'gun_relic' ? 0.005 : 0.011;
    const fallbackOrigin = this.staff?.muzzlePosition ?? this.player?.eyePosition;
    if (!fallbackOrigin) return false;
    const element = ench?.element ?? weapon.element ?? null;

    let shots = 0;
    for (let i = 0; i < 2; i += 1) {
      const sign = i === 0 ? -1 : 1;
      const origin = this.staff?.muzzleAt?.(i) ?? fallbackOrigin;
      const shotDir = dir.clone().addScaledVector(right, sign * spread).normalize();
      const res = this.projectiles.spawn({
        origin: origin.clone ? origin.clone() : origin,
        direction: shotDir,
        speed: 96,
        damage: power,
        element,
        behavior: 'projectile',
        radius: 0.42,
        range: Math.max(12, Number(weapon.range) || 46),
        color: tracer,
        owner: 'player',
        pierce: Math.max(0, Math.floor(Number(weapon.pierce) || 0)),
        aoe: 0,
        scale: weapon.id === 'gun_relic' ? 0.85 : 0.6,
        silent: true,
        onHit: (enemy) => {
          this.impacts?.hit?.(enemy?.position ?? origin, {
            weaponId: weapon.id,
            power: weapon.id === 'gun_relic' ? 1.25 : 0.9
          });
          this.staff?.triggerRecoil?.(weapon.id === 'gun_relic' ? 0.9 : 0.55);
          this.ui?.hud?.hitMarker?.();
        }
      });
      if (res) shots += 1;
    }
    if (shots === 0) return false;

    this._gunReadyAt = now + Math.max(0.1, Number(weapon.cooldown) || 0.34);
    this.staff?.triggerAttack?.({ silent: true });
    this.audio?.play?.(weapon.id === 'gun_relic' ? 'gunshotGalaxy' : 'gunshot', { family: 'gun' });
    this._shake = Math.min(0.35, (this._shake ?? 0) + 0.03);
    return true;
  }

  /**
   * 요정의 지팡이 — 꽃가루 마법을 날린다.
   * 다른 지팡이(마법 습득식)와 달리 무기 티어 피해가 그대로 들어가고,
   * 투사체가 가장 가까운 적을 부드럽게 추적한다.
   */
  _wandAttack(weapon) {
    const now = Number(this.clock?.elapsedTime) || 0;
    if (now < (this._wandReadyAt ?? 0)) return false;
    const origin = this.staff?.muzzlePosition ?? this.player?.eyePosition;
    const dir = this.player?.aimDirection;
    if (!origin || !dir || !this.projectiles?.spawn) return false;

    const gearDamage = 1 + (Number(this._mergedGearBonus()?.damagePct) || 0);
    const ench = this.enchant?.bonusFor?.(weapon.id) ?? null;
    const enchantMult = Number(ench?.damageMult) || 1;
    const arcanaMult = Number(this.arcana?.mult?.('playerDamage')) || 1;
    const power = Math.max(
      1,
      Math.round((Number(weapon.damage) || 1) * (this.classes?.weaponDamageMult ?? 1) * gearDamage * enchantMult * arcanaMult)
    );
    const spawnOrigin = origin.clone ? origin.clone() : origin;
    const res = this.projectiles.spawn({
      origin: spawnOrigin,
      direction: dir,
      speed: 54,
      damage: power,
      element: ench?.element ?? weapon.element ?? 'nature',
      behavior: 'homing',
      radius: 0.62,
      range: Math.max(16, Number(weapon.range) || 64),
      color: weapon.color ?? 0xff9fd2,
      owner: 'player',
      pierce: 0,
      aoe: 0,
      scale: 0.72,
      onHit: (enemy) => {
        this.impacts?.hit?.(enemy?.position ?? spawnOrigin, { weaponId: weapon.id, power: 0.9 });
        this.staff?.triggerRecoil?.(0.45);
        this.ui?.hud?.hitMarker?.();
      }
    });
    if (!res) return false;

    this._wandReadyAt = now + Math.max(0.12, Number(weapon.cooldown) || 0.62);
    this.staff?.triggerAttack?.({ silent: true });
    this.staff?.playCast?.();
    this.audio?.play?.('fire', { family: 'fairywand' });
    this._shake = Math.min(0.3, (this._shake ?? 0) + 0.018);
    return true;
  }

  /**
   * 활 계열 — 화살을 1발 소모해 즉시 쏜다(모션은 연출, 명중은 투사체가 처리).
   * 화살이 없으면 쏘지 않고 안내만 한다(소모품 규칙).
   */
  _bowAttack(weapon) {
    const now = Number(this.clock?.elapsedTime) || 0;
    if (now < (this._bowReadyAt ?? 0)) return false;
    const arrowId = this._pickArrow();
    if (!arrowId) {
      this._warnNoArrow(now);
      return false;
    }
    const shot = this._fireArrow(weapon, arrowId);
    if (!shot) return false;
    const eco = this.economy;
    if (eco && typeof eco.spendArrow === "function") eco.spendArrow(arrowId, 1);
    this._bowReadyAt = now + Math.max(0.12, Number(weapon.cooldown) || 0.8);
    this.staff?.triggerAttack?.({});
    this.audio?.play?.("fire", { family: "bow" });
    this._shake = Math.min(0.3, (this._shake ?? 0) + 0.02);
    return true;
  }

  /** 지금 쏠 화살 — 보유한 것 중 가장 높은 티어(없으면 null) */
  _pickArrow() {
    const eco = this.economy;
    if (!eco) return null;
    if (typeof eco.firstArrowIn === "function") return eco.firstArrowIn(ARROW_ORDER_DESC);
    for (const id of ARROW_ORDER_DESC) {
      if ((Number(eco.getArrow?.(id)) || 0) > 0) return id;
    }
    return null;
  }

  /** 화살이 없을 때 안내(2.5초에 한 번만) */
  _warnNoArrow(now) {
    if (now < (this._arrowWarnAt ?? 0)) return;
    this._arrowWarnAt = now + 2.5;
    this.notify("화살이 없습니다 — 제작대(C)에서 화살을 만드세요", "warn");
    this.audio?.play?.("error");
  }

  /**
   * 활 발사 — 무기 피해 × 화살 배수 × 직업/장비/마법부여 배율.
   * 관통(weapon.pierce)만큼 적을 꿰뚫고, 명중하면 계열 임팩트가 터진다.
   */
  _fireArrow(weapon, arrowId) {
    const arrow = arrowById(arrowId);
    const origin = this.staff?.muzzlePosition ?? this.player?.eyePosition;
    const dir = this.player?.aimDirection;
    if (!origin || !dir || !this.projectiles?.spawn) return null;
    const gearDamage = 1 + (Number(this.gear?.bonus?.().damagePct) || 0);
    const ench = this.enchant?.bonusFor?.(weapon.id) ?? null;
    const enchantMult = Number(ench?.damageMult) || 1;
    const arrowMult = Number(arrow?.damageMult) || 1;
    const power = Math.max(
      1,
      Math.round(
        (Number(weapon.damage) || 1) * arrowMult * (this.classes?.weaponDamageMult ?? 1) * gearDamage * enchantMult * (Number(this.arcana?.mult?.('playerDamage')) || 1)
      )
    );
    const spawnOrigin = origin.clone ? origin.clone() : origin;
    return this.projectiles.spawn({
      origin: spawnOrigin,
      direction: dir,
      speed: 62,
      damage: power,
      element: ench?.element ?? weapon.element ?? arrow?.element ?? null,
      behavior: "projectile",
      radius: 1.1,
      range: Math.max(12, Number(weapon.range) || 54),
      color: arrow?.color ?? weapon.color ?? 0xffe9c0,
      owner: "player",
      pierce: Math.max(0, Math.floor(Number(weapon.pierce) || 0)),
      aoe: Number(weapon.aoe) || 0,
      onHit: (enemy) => {
        this.impacts?.hit?.(enemy?.position ?? spawnOrigin, { weaponId: weapon.id, power: 1 });
      }
    });
  }

  /** 꿈나무 — 비살상 구원. 죽이지 않고 저주를 푼다. */
  _saveEnemy(enemy, weapon) {
    const blessing = this._soulBlessing();
    const res = this.waves?.salvation?.(enemy, { source: 'player' }) ?? null;
    if (!res) return false;
    const radius = DREAM_TREE.save.radius * (1 + blessing * 0.5);
    this.impacts?.salvation?.(enemy.position, {
      radius,
      petals: DREAM_TREE.impact?.petals ?? 26,
      butterflies: DREAM_TREE.impact?.butterflies ?? 3,
      gratitude: true
    });
    return true;
  }

  _onSwapSpecial(special = {}) {
    if (!special || !special.kind) return;
    const point = this._frontPosition(2.6);
    if (special.petals || special.butterflies) {
      this.impacts?.salvation?.(point, {
        radius: 2.8,
        petals: special.petals ?? 22,
        butterflies: special.butterflies ?? 5,
        gratitude: false
      });
    }
    if (special.kind === 'snip') {
      // 가위가 물리는 순간 — 짧은 참격과 손맛만 준다(피해 없음).
      this.impacts?.hit?.(point, { weaponId: this.staff?.id ?? 'time_scissors', power: special.big ? 1.2 : 0.5 });
      this._shake = Math.min(1.4, (this._shake ?? 0) + (special.big ? 0.18 : 0.06));
    }
    if (special.quote) this.notify(special.quote, 'gacha');
    if (special.chime) this.audio?.play?.('salvation');
  }

  /** 무기 스킬의 현재 키 라벨(사용자 키 설정 반영) */
  _ultimateKeyLabel() {
    try {
      const codes = keyCodes('ultimate');
      return (Array.isArray(codes) && codes.length ? keyLabel(codes[0]) : '') || 'R';
    } catch {
      return 'R';
    }
  }

  /**
   * HUD 무기 스킬 표시용 — 장착한 무기의 스킬 키·이름·쿨다운.
   * 궁극기가 없는 무기는 '좌클릭 기본 공격'을 돌려준다(빈칸을 만들지 않는다).
   */
  weaponSkill() {
    const weapon = this.staff?.weapon ?? null;
    if (!weapon || weapon.fist) return null;
    const key = this._ultimateKeyLabel();
    const ult = weapon.ultimate ? ultimateById(weapon.ultimate) : null;
    const now = Number(this.clock?.elapsedTime) || 0;
    if (!ult) {
      return {
        key: '좌클릭',
        label: '기본 공격',
        name: weapon.name,
        weaponId: weapon.id,
        ultimate: null,
        kind: 'basic',
        cooldown: 0,
        readyIn: 0,
        ready: true
      };
    }
    const readyAt = Number(this._ultReadyAt) || 0;
    return {
      key,
      label: '무기 스킬',
      name: ult.name,
      weaponId: weapon.id,
      ultimate: ult.id,
      kind: ult.kind,
      cooldown: Number(ult.cooldown) || 0,
      readyIn: Math.max(0, readyAt - now),
      ready: now >= readyAt
    };
  }

  /** R — 무기 궁극기. 유물 지팡이(시간 정지/창세)는 기존 유물 스킬로 위임한다. */
  useUltimate() {
    const weapon = this.staff?.weapon ?? null;
    const ult = weapon?.ultimate ? ultimateById(weapon.ultimate) : null;
    if (!ult) return this._useSkill();
    if (ult.kind === 'timeStop' || ult.kind === 'purge') return this._useSkill();
    const now = this.clock?.elapsedTime ?? 0;
    const readyAt = this._ultReadyAt ?? 0;
    if (now < readyAt) {
      this.notify(`${ult.name} — ${Math.ceil(readyAt - now)}초 후 사용 가능`, 'warn');
      this.audio?.play?.('error');
      return false;
    }
    this._ultReadyAt = now + (Number(ult.cooldown) || 120);
    this.staff?.triggerSkill?.(ult.id);
    const spec = ultimateImpact(ult.id);
    this.audio?.play?.(spec?.sound ?? 'ultimateBlade');
    const radius = Number(ult.radius) || 10;
    this.impacts?.skill?.(this._frontPosition(Math.min(14, radius)), {
      ultimateId: ult.id,
      radius: ult.radius
    });
    const applied = this._applyUltimate(ult);
    this.track?.('ultimatesUsed', 1);
    this.notify(`${ult.name} 발동!`, 'gacha');
    return applied;
  }

  _applyUltimate(ult) {
    const radius = Number(ult.radius) || 0;
    const list = [...this._enemyList()];
    const center = this.player?.position ?? null;
    let saved = 0;
    let hurt = 0;
    for (const enemy of list) {
      if (!enemy?.alive || !enemy.position) continue;
      if (radius > 0 && center) {
        const d = Math.hypot(enemy.position.x - center.x, enemy.position.z - center.z);
        if (d > radius) continue;
      }
      if (ult.kind === 'salvation') {
        if (this.waves?.salvation?.(enemy, { source: 'player' })) {
          saved += 1;
          this.impacts?.gratitude?.(enemy.position, DREAM_TREE.save.gratitude);
        }
        continue;
      }
      const power = Math.max(1, Math.round((Number(WEAPON_BY_ID[ult.weapon]?.damage) || 60) * 3));
      enemy.takeDamage?.(power, WEAPON_BY_ID[ult.weapon]?.element ?? 'arcane', 'player');
      this.impacts?.hit?.(enemy.position, { weaponId: ult.weapon, power: 1.6 });
      hurt += 1;
    }
    if (hurt > 0) this._shake = Math.min(1.5, (this._shake ?? 0) + 0.25);
    return { saved, hurt };
  }

  /**
   * 메인코어에서 전직(H-90) — 게임 안 코어 앞에서 바로 전직한다.
   * 전직 규칙·비용은 기존 시스템(systems/classes.js)이 판단하고, 여기서는 패널만 연다.
   */
  openClassPanel() {
    const panels = this.ui?.panels;
    const notify = (msg, kind = 'warn') => this.ui?.hud?.notify?.(msg, kind);
    if (!panels) { notify('전직 패널을 열 수 없습니다'); return false; }
    // 패널 id 는 'classes'(전직) — 열리지 않으면 토글로 한 번 더 시도한다(버전 차이 방어).
    try { panels.open?.('classes'); } catch { void 0; }
    if (!panels.hasOpen?.()) { try { panels.toggle?.('classes'); } catch { void 0; } }
    const opened = !!panels.hasOpen?.();
    if (!opened) notify('전직 패널을 열 수 없습니다');
    return opened;
  }

  /** 3인칭 아바타 — 내 캐릭터 스킨 그대로 (1인칭에서는 숨김) */
  _buildAvatar() {
    const look = sanitizeRemoteCharacter(this.character ?? null);
    const group = buildCharacterAvatar({ color: look.color, accent: look.accent, skin: look.skin });
    group.name = 'localAvatar';
    group.visible = false;
    this.scene.add(group);
    return group;
  }

  /** 캐릭터 탭에서 외형/색을 바꾸면 3인칭 아바타도 즉시 갱신한다. */
  _refreshAvatar() {
    if (!this.scene || !this.avatar) return;
    const old = this.avatar;
    const next = this._buildAvatar();
    next.position.copy(old.position);
    next.rotation.copy(old.rotation);
    next.visible = old.visible;
    this.scene.remove(old);
    disposeCharacterAvatar(old);
    this.avatar = next;
  }

  /** 아바타 위치·방향·표시 — 3인칭일 때만 보인다 */
  _syncAvatar() {
    const avatar = this.avatar;
    const player = this.player;
    if (!avatar || !player?.position) return;
    avatar.visible = player.cameraMode === 'third';
    if (!avatar.visible) return;
    avatar.position.set(player.position.x, player.position.y, player.position.z);
    avatar.rotation.y = player.yaw;
    this._avatarTime = (this._avatarTime ?? 0) + 0.016;
    const spd = Math.hypot(Number(player.velocity?.x) || 0, Number(player.velocity?.z) || 0);
    animateCharacterAvatar(avatar, this._avatarTime, Math.min(1, spd / 8));
  }

  /** 가까이 지은 포탈 건물 — N 키로 그 지형으로 이동한다 */
  _nearbyPortal(radius = 9) {
    const list = this.turrets?.turrets;
    const p = this.player?.position;
    if (!Array.isArray(list) || !p) return null;
    let best = null;
    let bestD = radius;
    for (const t of list) {
      if (!t || t.destroyed) continue;
      const type = t.type;
      if (type?.kind !== 'portal' || !type.portalDest) continue;
      const d = Math.hypot(t.position.x - p.x, t.position.z - p.z);
      if (d <= bestD) {
        bestD = d;
        best = { turret: t, dest: type.portalDest, name: type.portalName ?? type.name ?? '포탈', distance: d };
      }
    }
    return best;
  }

  /** 메인코어 반경 안인가 — 전직을 '코어에서' 하게 하는 조건 */
  _nearCore(range = 16) {
    const core = this.world?.base?.position ?? this.core?.position ?? this.world?.core?.position ?? this.world?.basePos ?? this.basePos ?? null;
    const me = this.player?.position;
    if (!core || !me) return true; // 코어·플레이어를 못 찾으면 막지 않는다(테스트 스텁·초기 상태 대비)
    const dx = core.x - me.x; const dz = core.z - me.z;
    return dx * dx + dz * dz <= range * range;
  }

  _handleKeys(dt) {
    const input = this.input;
    const pressed = (code) => input.consumePressed?.(code);
    const actionPressed = (action) => keyConsume(input, action);
    // 관리자 콘솔 — 관리자 계정에만 반응한다. 일반 계정은 키를 눌러도 아무 일도 없다(콘솔 내부에서 한 번 더 검사).
    if (actionPressed('admin') && this.ui.admin?.isAdmin?.()) this.ui.admin.toggle?.();
    if (actionPressed('travel')) {
      // 설치한 포탈이 가까이 있으면 바로 그 지형으로 — 없으면 포탈 안내(설치 목록·제작 안내)
      const built = this._nearbyPortal(9);
      if (built) this.travelToRegion(built.dest);
      else this.ui?.panels?.open?.('travel');
    }
    if (actionPressed('arcana')) this.openArcana();

    // 메인코어 상호작용(H-90) — 코어 앞에서 전직. E / interact.
    if (actionPressed('interact') || pressed('KeyE')) {
      if (this._nearCore()) this.openClassPanel();
      else this.ui?.hud?.notify?.('메인코어 가까이에서 전직할 수 있습니다', 'info');
    }
    if (!this._coreHintShown && this._nearCore(24)) {
      this._coreHintShown = true;
      this.ui?.hud?.notify?.('중앙코어 — 가까이 가서 E 키로 전직/승급', 'info');
    }
    const actionHeld = (action) => keyDown(input, action);

    if (pressed('Escape')) {
      if (this.ui.admin?.isOpen) this.ui.admin.close();
      else if (this.ui.panels.hasOpen?.()) this.ui.panels.close();
      else if (this.state === 'playing') this.pause({ screen: 'settings' });
      else if (this.state === 'paused') this.resume();
      else if (this.state === 'gameover' || this.state === 'victory') this.quit();
    }

    if (this.state !== 'playing') return;

    if (actionHeld('sit')) {
      if (actionPressed('achievements')) {
        this.togglePanel('codex');
        return;
      }
    }

    if (actionPressed('build')) {
      if (!this.build.active && this.demolish.active) this.setDemolish(false);
      this.build.active = !this.build.active;
      if (this.build.active) {
        this.build.yaw = Number(this.player?.yaw) || 0;
        this.ui.panels.open('build');
        this._updateGhost(true);
        this.notify('건설 모드 — 좌클릭으로 건설, 휠/숫자로 선택', 'info');
      } else {
        this.ui.panels.close();
        this._updateGhost();
      }
      // 건설 패널을 열면 커서가 보여야 목록을 클릭할 수 있다.
      this._syncPointerLock();
    }
    if (actionPressed('demolish')) this.setDemolish(!this.demolish.active);
    if (actionPressed('craft')) this.togglePanel('craft');
    if (actionPressed('recipes')) this.togglePanel('recipes');
    if (actionPressed('interact')) {
      // 저장고 옆에서 쌓인 자원이 있으면 먼저 수거한다(반경 안이면 자동 수거되므로 보통은 비어 있다).
      // 그 밖에는 마법부여대 옆이면 마법부여(무기 속성), 아니면 부여대(마법 뽑기).
      if (!this._collectNearbyStorage()) {
        if (this.nearEnchanter()) this.togglePanel('enchant');
        else this.togglePanel('gacha');
      }
    }
    if (actionPressed('achievements')) this.togglePanel('achievements');
    if (actionPressed('inventory')) this.togglePanel('inventory');
    if (actionPressed('classes')) this.togglePanel('classes');
    if (actionPressed('seeds')) this.togglePanel('seeds');
    if (actionPressed('multiplayer')) this.togglePanel('multiplayer');
    if (actionPressed('friends')) this.ui.friends?.toggle();
    if (actionPressed('preset')) this._cyclePreset();
    if (actionPressed('wings')) this.toggleWings();
    if (actionPressed('fullscreen')) {
      const isFull = Boolean(globalThis.document?.fullscreenElement);
      if (isFull) {
        globalThis.document?.exitFullscreen?.();
        this._setFullscreenPref?.(false);
        this.notify('창 모드로 바꿨습니다 — 다음에도 창 모드', 'info');
      } else {
        this._setFullscreenPref?.(true);
        this._requestFullscreenNow?.();
        this.notify('전체 화면', 'info');
      }
    }
    if (actionPressed('camera')) {
      const mode = this.player?.toggleCameraMode?.();
      this._syncAvatar();
      if (mode) this.notify(mode === 'third' ? '3인칭 시점 — 캐릭터가 보입니다' : '1인칭 시점', 'info');
    }
    if (actionPressed('map')) this.ui.minimap?.toggle?.();
    if (actionPressed('swapWeapon')) this.swapWeapon(1);
    if (actionPressed('weapons')) this.togglePanel('weapons');
    // R — 건설 중이거나 건물을 조준했으면 '회전'(누르고 있으면 부드럽게 연속 회전),
    //     그 밖에는 무기 궁극기다(§4.37).
    const rotateKey = actionHeld('ultimate');
    const aimForRotate = rotateKey ? (this.build.active ? true : Boolean(this._aimedTurret())) : false;
    if (actionPressed('ultimate') && !aimForRotate) this.useUltimate();
    // X — 건설 중에는 설치 방향, 평소에는 조준한 건물을 45° 회전(Shift+X 는 반대 방향).
    if (actionPressed('rotate')) {
      const back = actionHeld('sprint');
      if (this.build.active) this.rotatePreview(back ? -1 : 1);
      else this.rotateAimedTurret(back ? -1 : 1);
    }
    this._updateHoldRotate(dt, { shift: actionHeld('sprint') });

    for (let i = 1; i <= 9; i++) {
      if (pressed(`Digit${i}`)) {
        const list = this.ui.panels.buildList?.() ?? this.build.list;
        const def = list[i - 1];
        if (def) this.selectTurret(def.id);
      }
    }

    const wheel = input.mouse?.wheel ?? 0;
    if (wheel) this._cycleTurret(wheel > 0 ? 1 : -1);

    this._updateGhost();

    if (!input.mouse?.left) this._demolishClick = false;
    if (input.mouse?.left) {
      if (this.demolish.active) {
        // 한 번 누를 때 한 채만 철거한다 — 누르고 있어도 매 프레임 반복하지 않는다.
        if (!this._demolishClick) {
          this._demolishClick = true;
          if (this.input.consumeMouse) this.input.consumeMouse();
          this._tryDemolish();
        }
      } else if (this.build.active && this.input.consumeMouse) {
        const consumed = this.input.consumeMouse();
        if (consumed?.left) this._tryPlace();
      } else if (this.build.active) {
        this._tryPlace();
      } else {
        this._attack();
      }
    }
  }

  _cyclePreset() {
    const idx = FRAME_PRESETS.findIndex((p) => p.id === this.quality);
    const next = FRAME_PRESETS[(idx + 1) % FRAME_PRESETS.length];
    this.applyPreset(next.id);
  }

  applyPreset(id, { user = false } = {}) {
    const preset = FRAME_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    // 사용자가 직접 고른 단계는 자동 화질의 상한이 된다(자동이 더 무겁게 올리지 않는다).
    if (user) this._userQuality = preset.id;
    this.quality = preset.id;
    this.preset = preset;
    try {
      localStorage.setItem(QUALITY_KEY, preset.id);
    } catch {
      /* 무시 */
    }
    const summary = applyFramePreset?.(this.renderer, preset, this.scene) ?? preset.name;
    this.adaptive?.setPreset?.(this.preset);
    if (this.renderer?.shadowMap) this.renderer.shadowMap.needsUpdate = true;
    if (this.world) {
      this.world.preset = preset;
      this.world.applyQuality?.(preset.id);
      if (this.world.sky?.sun) this.world.sky.sun.castShadow = preset.shadow !== false;
    }
    this.camera.far = preset.drawDistance || this.camera.far;
    this.camera.updateProjectionMatrix();
    this.notify(`프레임 설정: ${summary} (나무·광물 수는 다음 게임부터 적용)`, 'info');
  }

  // ── 가챠 / 부여대
  async pullGacha(times = 1) {
    if (!this.gacha) return;
    const res = this.gacha.pull(times);
    if (!res?.ok) {
      this.audio.play('error');
      this.notify(res?.reason || '뽑기에 실패했습니다', 'warn');
      return;
    }
    for (const spell of res.results) {
      const added = this.spells?.add?.(spell);
      if (!added) this.notify('마법 슬롯이 가득 찼습니다', 'warn');
    }
    const best = res.results.reduce((a, b) => (gradeRank(b.grade) > gradeRank(a.grade) ? b : a), res.results[0]);
    const rank = gradeRank(best?.grade);
    const sound = rank >= 6 ? 'gachaRelic' : rank >= 4 ? 'gachaLegend' : rank >= 3 ? 'gachaEpic' : rank >= 2 ? 'gachaRare' : 'gachaCommon';
    this.audio.play(sound);
    this.notify(`${best?.name ?? '마법'} (${best?.gradeName ?? best?.grade ?? ''})`, rank >= 3 ? 'gacha' : 'success');
    if (best?.relic) {
      this.staff?.setRelic?.(best.relic);
      const relicWeapon = best.relic === 'genesis' ? 'staff_genesis' : 'staff_relic';
      this.ownWeapon(relicWeapon, { silent: true });
      this.equipWeapon(relicWeapon, { silent: true });
      this.notify(`유물 획득 — ${best.name}`, 'gacha');
    }
    if (rank >= 2) {
      try {
        await playCutscene({ grade: best.grade, element: best.element, name: best.name, scene: this.scene, camera: this.camera, duration: rank >= 4 ? 2600 : 1800 });
      } catch (err) {
        console.warn('[cutscene] 연출 실패', err);
      }
    }
    this.ui.panels.refresh?.();
  }

  craftRecipe(recipeId) {
    const recipe = MINERAL_COMBO_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;
    if (!this.economy?.canAfford?.({ minerals: recipe.input })) {
      this.notify('재료가 부족합니다', 'warn');
      this.audio.play('error');
      return false;
    }
    this.economy.spend({ minerals: recipe.input });
    const spell = this.gacha?.makeSpell?.(recipe.grade, recipe.element) ?? null;
    if (spell) {
      if (recipe.relic) spell.relic = recipe.relic;
      if (recipe.relic) {
        const relicWeapon = recipe.relic === 'genesis' ? 'staff_genesis' : 'staff_relic';
        this.ownWeapon(relicWeapon, { silent: true });
        this.equipWeapon(relicWeapon, { silent: true });
      }
      this.spells?.add?.(spell);
      this.notify(`${recipe.name} 제작 완료`, 'gacha');
      this.audio.play('levelup');
    }
    this.ui.panels.refresh?.();
    return true;
  }

  // ── 저장 / 불러오기
  serialize() {
    return {
      version: VERSION,
      savedAt: new Date().toISOString(),
      seed: this.seed,
      mode: this.mode,
      difficulty: this.difficulty,
      quality: this.quality,
      activeTitle: this.activeTitle,
      playTime: this.playTime,
      economy: this.economy?.toJSON?.() ?? null,
      waves: this.waves?.toJSON?.() ?? null,
      turrets: this.turrets?.toJSON?.() ?? null,
      enchant: this.enchant?.toJSON?.() ?? null,
      arcana: this.arcana?.toJSON?.() ?? null,
      achievements: this.achievements?.toJSON?.() ?? null,
      fairies: this.fairies?.toJSON?.() ?? null,
      player: this.player?.toJSON?.() ?? null,
      spells: this.spells?.toJSON?.() ?? null,
      weaponId: this.weaponId ?? null,
      weaponsOwned: this.weapons?.owned ? [...this.weapons.owned] : null,
      crafting: this.crafting?.toJSON?.() ?? null,
      classes: this.classes?.toJSON?.() ?? null,
      wings: this.wings?.toJSON?.() ?? null,
      gear: this.gear?.toJSON?.() ?? null,
      discoveredRegions: this.world?.regionState?.() ?? null
    };
  }

  save(silent = false) {
    if (!this.running || !this.economy) return null;
    const data = this.serialize();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[save] 로컬 저장 실패', err);
    }
    // 내 세이브 목록에도 남긴다 — 나중에 골라서 불러올 수 있다(계약 §4.49).
    pushSave(data);
    if (auth.loggedIn) {
      cloudSave.save(data).then((r) => {
        if (!r.ok) console.warn('[save] 클라우드 저장 실패', r.error);
      });
    }
    if (!silent) this.notify('저장했습니다', 'success');
    return data;
  }

  async load() {
    let data = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch {
      /* 무시 */
    }
    if (auth.loggedIn) {
      try {
        const r = await cloudSave.load();
        if (r.ok && r.data?.data) {
          const cloud = r.data.data;
          if (!data || new Date(cloud.savedAt || 0) > new Date(data.savedAt || 0)) data = cloud;
        }
      } catch (err) {
        // 클라우드가 죽어도 로컬 세이브로 계속 진행한다.
        console.warn('[load] 클라우드 저장 확인 실패', err);
      }
    }
    if (!data) {
      this.notify('저장된 게임이 없습니다', 'warn');
      return false;
    }
    return this._restore(data);
  }

  /** 저장 데이터를 실제 게임 상태로 되돌린다 — load() 와 세이브 슬롯 불러오기 공용(계약 §4.49). */
  _restore(data) {
    if (!data || typeof data !== 'object') {
      this.notify('세이브 데이터가 올바르지 않습니다', 'error');
      return false;
    }
    try {
      if (!this.running) this.start({ mode: data.mode, seed: data.seed, difficulty: data.difficulty });
      if (data.quality) this.applyPreset(data.quality);
      this.economy?.fromJSON?.(data.economy);
      this.achievements?.fromJSON?.(data.achievements);
      this.waves?.fromJSON?.(data.waves);
      this.turrets?.fromJSON?.(data.turrets);
      this.enchant?.fromJSON?.(data.enchant);
      this.arcana?.fromJSON?.(data.arcana);
      this.applyArcana();
      this.fairies?.fromJSON?.(data.fairies);
      this.player?.fromJSON?.(data.player);
      if (Array.isArray(data.weaponsOwned)) {
        const base = this._defaultOwned();
        for (const id of data.weaponsOwned) if (weaponById(id)) base.add(id);
        this.weapons = { owned: base, equipped: this.weaponId ?? null };
      }
      if (data.crafting) this.crafting?.fromJSON?.(data.crafting);
      // 전직은 무기 장착보다 먼저 복원해야 잠금 검사가 올바르게 동작한다.
      if (data.classes) this.classes?.fromJSON?.(data.classes);
      this._applyClassModifiers();
      if (data.wings) this.wings?.fromJSON?.(data.wings);
      if (data.gear) this.gear?.fromJSON?.(data.gear);
      // 가죽 장비 보너스는 저장하지 않고 복원 후 다시 계산한다(이중 적용 방지)
      this._applyClassModifiers();
      this._applyFlight();
      if (data.discoveredRegions) this.world?.loadRegionState?.(data.discoveredRegions);
      if (data.weaponId) {
        const okWeapon = this.equipWeapon(data.weaponId, { silent: true, instant: true });
        if (!okWeapon) this._equipBestUsable({ silent: true });
      }
      this.activeTitle = data.activeTitle ?? null;
      this.playTime = data.playTime ?? 0;
      this.notify(`불러왔습니다 — 시드 ${data.seed}`, 'success');
      // 불러오면 바로 게임으로 돌아간다 — 설정/일시정지 화면이 남아 있으면 닫는다.
      this.ui.panels?.close?.();
      this._refreshPanels();
      return true;
    } catch (err) {
      console.error('[load] 복원 실패', err);
      this.notify('세이브 복원 중 오류가 발생했습니다', 'error');
      return false;
    }
  }

  /**
   * 마인크래프트 멀티처럼 "서버 주소"만 넣고 그 서버에 붙는다.
   *  · ip / ip:port / http://ip:port 모두 허용 (포트를 빼면 3001)
   *  · 비우면 지금 서버(내 PC)로 돌아온다
   *  · 접속하면 로그인·저장·순위표(REST)도 같은 서버로 보낸다
   */
  async connectServer(address) {
    const raw = String(address ?? '').trim();
    const self = typeof location !== 'undefined' ? location.origin : 'http://localhost:3001';
    const target = raw ? normalizeServerAddress(raw) : self;
    if (!target) {
      this.notify('서버 주소를 확인해 주세요 (예: 192.168.0.10:3001)', 'warn');
      return false;
    }
    this.net.setServer(target);
    const nickname = currentNickname() || auth.user?.nickname || auth.user?.username || undefined;
    const ok = await this.net.connect(nickname);
    // 연결에 성공했을 때만 REST 주소를 바꾼다 — 실패한 주소로 로그인·저장이 죽지 않게.
    if (ok) {
      setApiBase(target === self ? '' : target);
      netInfo.reset();
    }
    this.notify(
      ok ? `서버에 연결되었습니다 — ${target}` : `서버에 연결하지 못했습니다 — ${target}`,
      ok ? 'success' : 'error'
    );
    safe(() => this.ui?.menu?.refresh?.());
    return ok;
  }

  /** 남에게 알려줄 내 서버 주소 — 서버가 알려준 LAN 주소를 우선 쓴다(초대 링크와 같은 규칙). */
  _shareOrigin() {
    const origin = typeof location !== 'undefined' ? location.origin : '';
    return resolveShareOrigin({ origin, lanUrls: safe(() => netInfo.urls(), []) || [] }) || origin;
  }

  /** [🌐 주소 만들기] — 친구가 접속할 내 서버 주소를 만들어 메뉴에 보여준다. */
  async shareServerAddress() {
    await safe(() => netInfo.load(true), null);
    const address = this._shareOrigin();
    this.ui?.menu?.setShareInfo?.({ address });
    this.notify(
      address ? `내 서버 주소: ${address} — 친구에게 알려 주세요` : '서버 주소를 찾지 못했습니다',
      address ? 'success' : 'warn'
    );
    return address;
  }

  /** [🎟 초대코드 만들기] — 방을 만들고 초대코드·초대 링크를 메뉴에 보여준다. */
  async createInviteCode() {
    if (!this.net.connected) {
      const ok = await this.net.connect(currentNickname() || undefined);
      if (!ok) {
        this.notify('서버에 연결되어 있지 않습니다 — 서버 주소를 확인하세요', 'warn');
        return null;
      }
    }
    const m = safe(() => this.ui?.menu?.state, null) || {};
    const res = await safe(
      () =>
        this.net.createRoom({
          nickname: currentNickname() || auth.user?.nickname || '수호자',
          mode: 'coop',
          difficulty: m.difficulty || this.difficulty || 'normal'
        }),
      null
    );
    if (!res?.ok) {
      this.notify(`초대코드를 만들지 못했습니다 — ${res?.error || '서버 응답 없음'}`, 'error');
      return null;
    }
    const code = res.code || res.state?.code || '';
    const link = code ? inviteLink(code, this._shareOrigin()) : '';
    this.ui?.menu?.setShareInfo?.({ code, link });
    this.notify(`초대코드 ${code} 를 만들었습니다 — [초대 링크 복사] 로 보내세요`, 'success');
    return code;
  }

  /** [📋 복사] — 서버 주소 또는 초대 링크를 클립보드로. */
  async copyShareText(kind = 'address') {
    const share = safe(() => this.ui?.menu?._share, null) || {};
    const text = kind === 'link' ? share.link : share.address;
    if (!text) {
      this.notify(kind === 'link' ? '먼저 [초대코드 만들기] 를 눌러 주세요' : '먼저 [주소 만들기] 를 눌러 주세요', 'warn');
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.notify(`복사했습니다 — ${text}`, 'success');
      return true;
    } catch {
      this.notify(`복사가 막혔습니다. 직접 복사하세요: ${text}`, 'warn');
      return false;
    }
  }

  /** 내 세이브 목록(요약, 최신 순) — 설정 화면에서 쓴다(계약 §4.49). */
  listSaves() { return listSaves(); }
  /** 내 세이브 삭제. */
  removeSave(id) {
    const ok = removeSave(id);
    this.notify?.(ok ? '세이브를 삭제했습니다' : '그 세이브를 찾을 수 없습니다', ok ? 'info' : 'warn');
    this._refreshPanels();
    return ok;
  }

  /** 목록에서 고른 세이브를 그 시점으로 되돌린다. */
  loadSaveSlot(id) {
    const data = getSave(id);
    if (!data) { this.notify?.('그 세이브를 찾을 수 없습니다', 'warn'); return false; }
    return this._restore(data);
  }

  /** 프레임 지표 초기화(설정 → 성능 지표). */
  resetPerf() {
    const p = this.perf;
    if (p) { p.frames = 0; p.lastMs = 0; p.worstMs = 0; p.slowFrames = 0; p.lastError = null; }
    return true;
  }

  /** 자동 화질 설정 읽기(기본 켜짐). */
  _readAutoQuality() {
    try {
      const raw = localStorage.getItem('fortress.autoquality.v1');
      return raw === '0' ? false : true;
    } catch {
      return true;
    }
  }

  /** 자동 화질 켜기/끄기 — 저장해 두고 다음에도 유지한다(계약 §4.50). */
  setAutoQuality(on) {
    this.autoQuality = Boolean(on);
    this._qualityAcc = 0;
    try {
      localStorage.setItem('fortress.autoquality.v1', this.autoQuality ? '1' : '0');
    } catch {
      /* 무시 */
    }
    this.notify(`자동 화질을 ${this.autoQuality ? '켰습니다' : '껐습니다'}`, 'info');
    return this.autoQuality;
  }

  toggleAutoQuality() { return this.setAutoQuality(!this.autoQuality); }

  /** 저장하고 새로고침 — 오래 켜 두어 메모리가 쌓였을 때 가장 확실한 정리 방법. */
  saveAndReload() {
    this.save(true);
    this.notify('저장했습니다 — 새로고침합니다', 'info');
    this._refreshPanels();
    setTimeout(() => { try { location.reload(); } catch { void 0; } }, 300);
    return true;
  }

  score() {
    const wave = this.waves?.wave ?? 0;
    const s = this.achievements?.values ?? {};
    return Math.floor(wave * 1000 + (s.kills ?? 0) * 10 + (this.economy?.gold ?? 0) / 10);
  }

  async submitScore() {
    if (!auth.loggedIn) {
      this.notify('로그인하면 리더보드에 점수를 등록할 수 있습니다', 'info');
      return null;
    }
    const entry = {
      mode: this.mode,
      score: this.score(),
      wave: this.waves?.wave ?? 0,
      seed: this.seed,
      duration: Math.round(this.playTime),
      stats: this.achievements?.values ?? {}
    };
    const res = await leaderboard.submit(entry);
    if (res.ok) {
      this.notify(`리더보드 등록 — ${res.data?.rank ?? '?'}위 (${entry.score}점)`, 'success');
      return res.data;
    }
    this.notify(res.error || '점수 등록 실패', 'warn');
    return null;
  }

  togglePanel(id) {
    if (!id) return;
    this.ui.panels.toggle(id);
    this._syncPointerLock();
  }

  closePanels() {
    this.ui.panels.close();
    this._syncPointerLock();
  }

  /**
   * 마우스 포인터 정책 — 제작/인벤/건설 패널이나 관리자 콘솔이 열려 있으면 포인터 잠금을 풀어
   * OS 커서를 보이게 하고, 전부 닫히면 시점 조작을 위해 다시 잠근다.
   * (잠금 중에는 커서가 숨겨져 패널 버튼을 누를 수 없다 — 정책 본체는 ui/pointer-lock.js)
   */
  _syncPointerLock() {
    return syncPointerLock({ state: this.state, input: this.input, panels: this.ui?.panels, admin: this.ui?.admin });
  }

  _fairyModifiers() {
    try {
      return this.fairies?.modifiers ?? { manaRegen: 1, moveSpeed: 1, miningSpeed: 1, fireDamage: 1, healBonus: 1 };
    } catch {
      return { manaRegen: 1, moveSpeed: 1, miningSpeed: 1, fireDamage: 1, healBonus: 1 };
    }
  }

  // ── 성능: 적응형 해상도 · 그림자 갱신 · 자동 품질 ──────────────────
  /**
   * 매 프레임 성능 관리.
   * 1) 적응형 해상도 — 목표 FPS 를 못 맞추면 렌더 해상도를 낮추고, 여유가 생기면 되돌린다.
   * 2) 자동 품질 — 시작 6초 뒤에도 42 FPS 미만이면 프리셋을 한 단계 낮춘다(1회).
   * 3) 맨손 채집 안내 — 조준 중인 자원을 프롬프트에 띄운다(초당 5회).
   */
  _updatePerformance(dt) {
    const fps = this.ui?.fps ?? null;
    const avg = Number(fps?.averageFps) || 0;
    // 시뮬레이션 dt 는 0.05 로 잘리므로, 성능 판단은 실제 프레임 시간을 써야
    // 20 FPS 아래에서도 해상도/품질이 제때 내려간다.
    const perfDt = Math.min(1, Number(this._frameDt) || dt || 0);
    this._perfElapsed = (this._perfElapsed ?? 0) + perfDt;

    if (this.adaptive) {
      const res = this.adaptive.update(perfDt, avg);
      if (res.changed) {
        this._notifyPerf('해상도 ' + formatScale(res.scale) + ' 로 조정 (' + res.pixelRatio.toFixed(2) + 'x · 평균 ' + Math.round(avg) + ' FPS)');
      }
    }

    // 메모리 감시 — 오래 켜 두면 느려질 때 알려 준다(강제 GC 는 브라우저가 막는다).
    const mem = this.memory?.sample(perfDt) ?? null;
    if (mem?.warn) {
      this.notify(`메모리가 ${formatMb(mem.mb * 1048576)} 쌓였습니다 — 설정에서 [저장하고 새로고침] 을 권합니다`, 'warn');
    }

    // 자동 화질(지속 적응) — 한 번만 내리는 게 아니라 계속 지켜보고, 여유가 생기면 되올린다.
    if (this.autoQuality !== false && this.state === 'playing' && this._perfElapsed >= ADAPTIVE.downgradeAt && avg > 0) {
      this._qualityAcc = (this._qualityAcc ?? 0) + perfDt;
      const interval = Number(ADAPTIVE.qualityInterval) || 12;
      if (this._qualityAcc >= interval) {
        this._qualityAcc = 0;
        const down = suggestPreset(avg, FRAME_PRESETS, this.quality);
        const up = stepUpId(FRAME_PRESETS, this.quality, this._userQuality);
        if (avg < ADAPTIVE.downgradeFps && down) {
          const preset = FRAME_PRESETS.find((p) => p.id === down) ?? null;
          this.applyPreset(down);
          this.notify('프레임이 낮아 품질을 [' + (preset?.name ?? down) + '] 로 자동 조정했습니다 (평균 ' + Math.round(avg) + ' FPS)', 'warn');
        } else if (avg >= (Number(ADAPTIVE.recoverFps) || 58) && up) {
          const preset = FRAME_PRESETS.find((p) => p.id === up) ?? null;
          this.applyPreset(up);
          this.notify('프레임이 안정되어 품질을 [' + (preset?.name ?? up) + '] 로 되돌렸습니다 (평균 ' + Math.round(avg) + ' FPS)', 'info');
        }
      }
    }

    this._promptAcc = (this._promptAcc ?? 0) + dt;
    if (this._promptAcc >= 0.2) {
      this._promptAcc = 0;
      this._updateHarvestPrompt();
    }

    // 전력·저장고 요약 — HUD 가 매 프레임 읽으므로 0.5초에 한 번만 계산한다.
    this._facilityAcc = (this._facilityAcc ?? 0) + dt;
    if (this._facilityAcc >= 0.5) {
      this._facilityAcc = 0;
      this._refreshFacilityCaches();
    }
  }

  /** 성능 안내는 8초에 한 번만 띄운다(토스트 도배 방지) */
  _notifyPerf(text) {
    const now = Number(this.clock?.elapsedTime) || 0;
    if (now - (this._perfNotifyAt ?? -99) < 8) return;
    this._perfNotifyAt = now;
    this.notify(text, 'info');
  }

  /** 조준 중인 자원을 HUD 프롬프트에 표시 */
  _updateHarvestPrompt() {
    const hud = this.ui?.hud;
    if (!hud) return;
    const origin = this.player?.eyePosition;
    const dir = this.player?.aimDirection;
    if (!origin || !dir || this.state !== 'playing') return;
    // 지어 둔 포탈 앞 — N 으로 이동
    const builtPortal = this._nearbyPortal(9);
    if (builtPortal) {
      hud.setPrompt?.('N', `🌀 ${builtPortal.name} — N 으로 이동`);
      this._handPrompt = true;
      return;
    }
    // 중앙코어 앞 — E 로 전직/승급 (사용자 요청: 전직은 코어에서만)
    if (this._nearCore(16) && !this.ui?.panels?.hasOpen?.()) {
      hud.setPrompt?.('E', '🔮 중앙코어 — 전직/승급');
      this._handPrompt = true;
      return;
    }
    // 건설 모드 — 설치 방향 안내(X 회전)
    if (this.build?.active) {
      hud.setPrompt?.('X', `방향 ${this._yawDegrees(this.build.yaw)}° · 좌클릭 설치`);
      this._handPrompt = true;
      return;
    }
    const pick = pickHarvestNode({ origin, dir, trees: this.world?.trees, minerals: this.world?.minerals });
    const node = pick.node ?? pick.blocked;
    if (!node) {
      // 자원이 없으면 조준한 건물 회전 안내
      const building = this._aimedTurret?.() ?? null;
      if (building) {
        hud.setPrompt?.('X', `${building.type?.name ?? '건물'} 회전 · Shift+X 반대`);
        this._handPrompt = true;
        return;
      }
      // 저장고 가까이 — 반경 안이면 자동 수거, E 로 즉시 수거
      const store = this._nearbyStorage();
      if (store) {
        const s = typeof store.storageState === 'function' ? store.storageState() : null;
        hud.setPrompt?.(
          'E',
          s
            ? `📦 ${s.name} — 골드 ${Math.floor(s.gold)}/${s.capacity} · 목재 ${Math.floor(s.wood)} · 반경 ${s.range}m 자동 수거`
            : '📦 저장고 — 반경 안이면 자동 수거'
        );
        this._handPrompt = true;
        return;
      }
      // 마법부여대 가까이 — E 로 무기 속성 부여
      if (this.nearEnchanter()) {
        hud.setPrompt?.('E', '🔮 마법부여 — 보유한 모든 무기에 속성 새기기');
        this._handPrompt = true;
        return;
      }
      if (this._handPrompt) {
        hud.clearPrompt?.();
        this._handPrompt = false;
      }
      return;
    }
    const text = harvestHint(node);
    if (!text) return;
    hud.setPrompt?.(pick.node ? '좌클릭' : '잠김', text);
    this._handPrompt = true;
  }

  /**
   * 맨손 채집 — 무기(도구) 없이 T1 자원을 캔다.
   * 적이 더 가까우면 전투를 우선한다(전투 중 실수로 나무를 캐지 않는다).
   * @returns {boolean} 캤으면 true(공격/마법으로 넘어가지 않는다)
   */
  _tryBareHarvest() {
    const now = Number(this.clock?.elapsedTime) || 0;
    if (now < (this._handReadyAt ?? 0)) return Boolean(this._handTarget);
    const origin = this.player?.eyePosition;
    const dir = this.player?.aimDirection;
    if (!origin || !dir) return false;
    const pick = pickHarvestNode({ origin, dir, trees: this.world?.trees, minerals: this.world?.minerals, reach: BARE_HAND.reach });
    if (!pick.node) {
      this._handTarget = null;
      if (pick.blocked && this._nearEnemy(origin, BARE_HAND.reach + 2) === false) {
        this._handReadyAt = now + 0.8;
        this.notify((pick.blocked.name ?? '자원') + ' (T' + pick.blocked.tier + ') 은(는) 맨손으로 캘 수 없습니다 — 무기(도구)나 채굴탑을 사용하세요', 'warn');
        this.audio?.play?.('error');
        return true;
      }
      return false;
    }
    const enemy = this._nearestEnemyAhead(origin, dir, BARE_HAND.reach + 3);
    if (enemy) {
      const node = pick.node;
      const dEnemy = Math.hypot(enemy.position.x - origin.x, enemy.position.y - origin.y, enemy.position.z - origin.z);
      const dNode = Math.hypot(node.x - origin.x, (node.y ?? 0) + 1 - origin.y, node.z - origin.z);
      if (dEnemy <= dNode) {
        this._handTarget = null;
        return false;
      }
    }

    this._handReadyAt = now + BARE_HAND.interval;
    this._handTarget = pick.node;
    const node = pick.node;
    const res = harvestNode(node, { kind: pick.kind, sink: this.gatherSink() });
    this.staff?.triggerAttack?.({ nonLethal: false });
    this.impacts?.hit?.({ x: node.x, y: (node.y ?? 0) + 1, z: node.z }, { hand: true, power: 0.5 });
    this._shake = Math.min(0.5, (this._shake ?? 0) + BARE_HAND.shake);
    if (res.amount > 0) {
      const label = pick.kind === 'tree' ? '목재' : node.name ?? '광물';
      this.notify('맨손 채집 — ' + label + ' +' + res.amount, 'success');
    }
    if (res.depleted || res.felled) this._handTarget = null;
    return true;
  }

  /** 조준 원뿔 안에서 가장 가까운 적(없으면 null) */
  _nearestEnemyAhead(origin, dir, reach) {
    let best = null;
    let bestD = Infinity;
    for (const enemy of this._enemyList()) {
      if (!enemy?.alive || !enemy.position) continue;
      const dx = enemy.position.x - origin.x;
      const dy = enemy.position.y - origin.y;
      const dz = enemy.position.z - origin.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const radius = Number(enemy.radius) || 0.6;
      if (d > reach + radius) continue;
      const dot = d > 0.001 ? (dx * dir.x + dy * dir.y + dz * dir.z) / d : 1;
      if (dot < 0.15) continue;
      if (d < bestD) {
        bestD = d;
        best = enemy;
      }
    }
    return best;
  }

  /** 주변에 적이 있는가(근처 자원 안내를 미룰지 판단) */
  _nearEnemy(origin, reach) {
    return this._nearestEnemyAhead(origin, { x: 0, y: 0, z: -1 }, reach) !== null
      || this._nearestEnemyAhead(origin, { x: 0, y: 0, z: 1 }, reach) !== null
      || this._nearestEnemyAhead(origin, { x: 1, y: 0, z: 0 }, reach) !== null
      || this._nearestEnemyAhead(origin, { x: -1, y: 0, z: 0 }, reach) !== null;
  }

  /** 채집 결과를 경제·업적·통계에 반영하는 어댑터(맨손 채집용, 1회 생성 후 재사용) */
  gatherSink() {
    if (this._gatherSinkRef) return this._gatherSinkRef;
    const game = this;
    this._gatherSinkRef = {
      get economy() {
        return game.economy;
      },
      get stats() {
        return game.achievements;
      },
      get audio() {
        return game.audio;
      },
      get mineralTypesMined() {
        return game.mineralTypesMined;
      },
      get woodChopped() {
        return game.woodChopped ?? 0;
      },
      set woodChopped(v) {
        game.woodChopped = v;
      },
      get treesFelled() {
        return game.treesFelled ?? 0;
      },
      set treesFelled(v) {
        game.treesFelled = v;
      },
      get mineralsMined() {
        return game.mineralsMined ?? 0;
      },
      set mineralsMined(v) {
        game.mineralsMined = v;
      }
    };
    return this._gatherSinkRef;
  }

  /** 관리자 계정 안내 — 관리자 아이디로 로그인하면 설정에서 콘솔을 열 수 있다(일반 계정은 안내 없음). */
  _adminHint() {
    if (!safe(() => auth.isAdmin, false)) return false;
    this.notify('관리자 계정 — 설정의 [관리자 콘솔 열기] 또는 ` / 로 엽니다', 'gacha');
    return true;
  }

  // ── 루프
  _loop() {
    requestAnimationFrame(() => this._loop());
    const rawDt = this.clock.getDelta() || 0.016;
    const dt = Math.min(0.05, rawDt);
    this._dt = dt;
    this._frameDt = rawDt;
    const t0 = perfNow();
    try {
      this._update(dt, rawDt);
      this._updateErrors = 0;
    } catch (err) {
      // 한 프레임 예외는 넘기고 계속 돌린다. 다만 **계속** 실패하면 진행이 멈춘 것이므로 알려 준다.
      this._updateErrors = (this._updateErrors ?? 0) + 1;
      if (this.perf) this.perf.lastError = err?.message ?? String(err);
      console.error('[loop] 업데이트 오류', err);
      if (this._updateErrors === 5) this.notify('내부 오류로 진행이 멈췄습니다 — F12 콘솔을 확인해 주세요', 'error');
      if (this._updateErrors > 600) this._updateErrors = 600;
    }
    try {
      const shadows = this.renderer.shadowMap;
      if (shadows?.enabled && !shadows.autoUpdate) {
        this._shadowAcc = (this._shadowAcc ?? 0) + dt;
        if (this._shadowAcc >= SHADOW_INTERVAL) {
          this._shadowAcc = 0;
          shadows.needsUpdate = true;
        }
      }
      // 일시정지·메뉴에서는 3D 화면을 **다시 그리지 않는다**(계약 §4.73).
      //  설정·일시정지 패널은 9px 백드롭 블러(--glass-blur)를 쓴다. 그 위에서 매 프레임 3D 를
      //  새로 그리면 브라우저가 매 프레임 배경 전체를 다시 흐리게 만들어 화면이 멈춘 것처럼 보인다.
      //  상태가 바뀐 직후 한 번, 그리고 가끔(1.5초)만 다시 그려 화면이 맞게 유지되게 한다.
      const frozenView = this.state === 'paused' || this.state === 'gameover' || this.state === 'victory' || this.state === 'menu';
      if (this._lastViewState !== this.state) {
        this._lastViewState = this.state;
        this._viewDirty = true;
      }
      this._viewIdle = (this._viewIdle ?? 0) + dt;
      const needRender = !frozenView || this._viewDirty === true || this._viewIdle >= 1.5;
      if (needRender) {
        this._viewDirty = false;
        this._viewIdle = 0;
        this.renderer.render(this.scene, this.camera);
      }
    } catch (err) {
      if (this.perf) this.perf.lastError = err?.message ?? String(err);
      console.error('[loop] 렌더 오류', err);
    }
    // 프레임 감시(계약 §4.47) — 1초가 넘는 프레임을 기록해 원인을 추적할 수 있게 남긴다.
    const ms = perfNow() - t0;
    const perf = this.perf;
    if (perf) {
      perf.frames += 1;
      perf.lastMs = ms;
      if (ms > perf.worstMs) perf.worstMs = ms;
      if (ms > 1000) {
        perf.slowFrames += 1;
        const cmd = perf.lastCommand ? ` · 마지막 명령 ${perf.lastCommand.text} (${perf.lastCommand.ms.toFixed(1)}ms)` : '';
        console.warn(`[perf] 프레임 ${ms.toFixed(0)}ms — 남은 지급 ${this._grants?.pending ?? 0}개${cmd} · 예열 ${this.perf?.prewarm?.done ?? 0}/${this.perf?.prewarm?.total ?? 0}`);
        if (perf.slowFrames === 1 || perf.slowFrames % 20 === 0) {
          this.notify(`화면이 잠깐 멈췄습니다(${ms.toFixed(0)}ms) — 곧 복구됩니다`, 'warn');
        }
      }
    }
  }

  /** 마법연성 패널을 연다. */
  openArcana() {
    this.ui?.panels?.open?.('arcana');
    return true;
  }

  /** 연성을 사고 곧바로 효과를 반영한다(계약 §4.70). */
  buyArcana(id) {
    // 마법연성대(건설 · 골드 10 · 목재 1)가 있어야 연성을 살 수 있다(계약 §4.70).
    if (!hasArcanaTable(this.turrets?.turrets ?? [])) {
      return { ok: false, reason: '마법연성대가 필요합니다 — 건설에서 골드 10 · 목재 1로 세우세요' };
    }
    const res = this.arcana?.buy?.(id, this.economy) ?? { ok: false, reason: '연성 시스템 없음' };
    if (res.ok) this.applyArcana();
    return res;
  }

  /**
   * 연성 효과를 게임 전체에 반영한다 — 포탑 배율 · 중앙코어 체력 · 플레이어 체력.
   * 코어/플레이어는 **기준값을 기억**해 두고 배율만 다시 곱한다(중복 적용 방지).
   */
  applyArcana() {
    const a = this.arcana;
    if (!a) return 0;
    const applied = this.turrets?.applyArcana?.() ?? 0;
    const core = this.world?.base ?? null;
    if (core && Number.isFinite(Number(core.maxHp))) {
      this._coreBaseMaxHp ??= Number(core.maxHp);
      const next = Math.max(1, Math.round(this._coreBaseMaxHp * a.mult('coreHp')));
      const gain = next - Number(core.maxHp);
      core.maxHp = next;
      if (gain > 0) core.heal?.(gain);
      core.hp = Math.min(core.maxHp, Math.max(0, Number(core.hp) || 0));
    }
    const p = this.player;
    if (p && Number.isFinite(Number(p.maxHp))) {
      this._playerBaseMaxHp ??= Number(p.maxHp);
      const before = Number(p.maxHp) || 1;
      p.maxHp = Math.max(1, Math.round(this._playerBaseMaxHp * a.mult('playerHp')));
      const gain = p.maxHp - before;
      if (gain > 0) p.hp = Math.min(p.maxHp, (Number(p.hp) || 0) + gain);
      p.hp = Math.min(p.maxHp, Math.max(0, Number(p.hp) || 0));
    }
    return applied;
  }

  /**
   * 중앙코어 자동 공격(계약 §4.70) — 연성 '중앙코어 공격' 단계가 있어야 작동한다.
   * 쿨다운마다 사거리 안에서 가장 가까운 적 하나를 때린다(프레임 비용 O(적 수)).
   */
  _updateCoreAttack(dt) {
    const a = this.arcana;
    if (!a?.coreAttacks) return false;
    const core = this.world?.base ?? null;
    if (!core || core.destroyed) return false;
    const rate = Math.max(0.2, 0.8 + 0.2 * a.level('coreAttack'));
    this._coreAttackCd = Math.max(0, (Number(this._coreAttackCd) || 0) - (Number(dt) || 0));
    if (this._coreAttackCd > 0) return false;
    const range = a.coreRange();
    const list = this.enemies?.list ?? this.waves?.enemies ?? [];
    const origin = core.position ?? core.mesh?.position ?? null;
    if (!origin || !list.length) return false;
    let best = null;
    let bestD2 = range * range;
    for (const e of list) {
      if (!e || e.dead || Number(e.hp) <= 0) continue;
      const p = e.position ?? e.mesh?.position ?? null;
      if (!p) continue;
      const dx = Number(p.x) - Number(origin.x);
      const dz = Number(p.z) - Number(origin.z);
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD2) { bestD2 = d2; best = e; }
    }
    if (!best) return false;
    this._coreAttackCd = 1 / rate;
    const dmg = Math.max(1, Math.round(20 * a.mult('coreDamage') * (1 + 0.35 * a.level('coreAttack'))));
    this.core?.onCoreAttack?.(best, dmg);
    const res = best.takeDamage?.(dmg, 'arcane', 'core') ?? null;
    const gold = Number(res?.gold) || 0;
    if (gold > 0 && this.economy) this.economy.gold = (Number(this.economy.gold) || 0) + gold;
    this._coreAttackFlash = 0.25;
    return true;
  }

  _update(dt, frameDt = dt) {
    this._updateCoreAttack(dt);
    // 대량 지급·패널 갱신을 프레임 예산 안에서 소화한다(계약 §4.47).
    this._grants?.step?.();
    this.ui.panels.flushRefresh?.();
    // 메뉴·일시정지에서 무기 셰이더를 조금씩 예열한다(프레임당 6종 · 계약 §4.53).
    // 셰이더 예열은 **게임 중에도** 돌린다(계약 §4.67) — 메뉴·일시정지에서만 돌리면
    //  게임 중 관리자 소환·장착 순간에 그 무기의 셰이더가 처음 컴파일되며 화면이 멈춘다.
    //  무대(menu/paused)에서는 6종, 플레이 중에는 1종씩 나눠 컴파일한다.
    // 셰이더 예열·장착은 GPU 를 오래 잡는 작업이다(계약 §4.47 · §4.71).
    //  · 메뉴(로딩 화면)에서는 프레임당 6종까지 — 어차피 게임이 시작되지 않았다.
    //  · 일시정지(ESC)에서는 **아예 하지 않는다** — 예전에는 여기서 프레임당 7종을 컴파일해
    //    일시정지 화면이 얼어붙었다(무기 소환 → ESC 멈춤). 풀리는 순간 이어서 한다.
    if (this.state === 'menu') {
      this._prewarmStep(6);
    } else if (this.state !== 'paused') {
      this._prewarmStep(1);
      this._summonStep();
    }
    this.input.update?.(dt);
    this.ui.fps.update?.(frameDt);
    this.ui.menu.update?.(dt);
    this.ui.lobby.update?.(dt);
    this.ui.panels.update?.(dt);

    if (this.state === 'menu') {
      if (this.previewWorld) {
        this.previewAngle += dt * 0.08;
        const r = 110;
        this.camera.position.set(Math.cos(this.previewAngle) * r, 34, Math.sin(this.previewAngle) * r);
        this.camera.lookAt(0, 8, 0);
        this.previewWorld.update?.(dt, { time: this.clock.elapsedTime });
      }
      this.healthBars?.clear?.();
      this.ui.hud.update?.(dt);
      return;
    }

    this._handleKeys(dt);
    this._updateDemolishTarget();
    this._updatePerformance(dt);

    const frozen = this.state === 'paused' || this.state === 'gameover' || this.state === 'victory' || document.hidden;
    if (!frozen) {
      if (this.state === 'playing' || this.state === 'dead') {
        this.playTime += dt;
        this._playTimeAcc += dt;
        if (this._playTimeAcc >= 5) {
          this.track('playTime', Math.floor(this._playTimeAcc));
          this._playTimeAcc = 0;
        }
        this.waves?.update?.(dt, { player: this.player, turrets: this.towers, ui: this.ui });
        const modalOpen = Boolean(this.ui.panels.isOpen?.() && !this.build.active);
        if (!modalOpen) this.player?.update?.(dt);
        this._syncAvatar();
        this.turrets?.update?.(dt, {
          enemies: this.enemies,
          player: this.player,
          world: this.world,
          turrets: this.turrets,
          wave: this.waves?.wave ?? 1,
          spawnEnemy: (x, z, opts) => this._spawnFromTower(x, z, opts)
        });
        this.projectiles?.update?.(dt, this.enemies);
        this.spells?.update?.(dt);
        this.fairies?.update?.(dt, { player: this.player, game: this, stats: this.achievements, wave: this.waves?.wave ?? 0 });
        this.staff?.update?.(dt, {
          moving: this.player?.moving,
          speed: this.player?.speed ?? 0,
          casting: this.spells?.cooldown > 0
        });
        this.impacts?.update?.(dt);
        this._updateWings(dt);
        this._updateRegionSpawns(dt);
        this._checkWeaponUnlocks?.(dt);
        const impactShake = this.impacts?.shakeAmount ?? 0;
        if (impactShake > 0) this._shake = Math.max(this._shake ?? 0, impactShake);
        this.world?.update?.(dt, { player: this.player, enemies: this.enemies, time: this.clock.elapsedTime, camera: this.camera });
        // frustumCull 은 world.update 안에서 이미 돈다(중복 호출 제거 — 계약 §4.62)
        //  · 화면 밖 청크/나무/광물/포탈 정리는 world.update(dt, { camera }) 가 담당한다.

        if (this.state === 'dead') {
          this._respawnTimer -= dt;
          if (this._respawnTimer <= 0) {
            this.player?.respawn?.();
            this.state = 'playing';
            this.notify('부활했습니다', 'success');
          }
        }

        if (net.connected) {
          net.sendPlayerState({
            x: this.player.position.x,
            y: this.player.position.y,
            z: this.player.position.z,
            yaw: this.player.yaw,
            pitch: this.player.pitch,
            hp: this.player.hp,
            mana: this.player.mana,
            nickname: auth.user?.nickname || auth.user?.username || '수호자',
            tier: this.staff?.tier ?? 1,
            sit: this.player.sitting === true,
            alive: this.player.alive !== false
          });
        }

        this._autosaveAcc += dt * 1000;
        if (this._autosaveAcc >= AUTOSAVE_MS) {
          this._autosaveAcc = 0;
          this.save(true);
        }

        // 히든 지역 발견 (0.4초마다 검사)
        this._regionAcc += dt;
        if (this._regionAcc >= 0.4) {
          this._regionAcc = 0;
          this._checkRegionDiscovery();
        }
      }
    }

    // 카메라 흔들림
    if (this._shake > 0) {
      this._shake = Math.max(0, this._shake - dt * 1.6);
      const s = this._shake * 0.25;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    // 월드 체력바 — 카메라 흔들림까지 끝난 최종 자세로 빌보드한다
    this.healthBars?.sync?.(this._enemyList(), this.camera);

    this.remote?.animate?.(dt, this.world);
    this.ui.minimap?.update?.({
      player: this.player,
      enemies: this.enemies,
      turrets: this.towers,
      portals: this.world?.portals
    });
    this.ui.hud.update?.(dt);
    this.ui.fps.setInfo?.({
      enemies: this.enemiesAlive,
      turrets: this.towers.length,
      drawCalls: this.renderer.info?.render?.calls ?? 0,
      scale: this.adaptive?.scale ?? 1
    });
  }
}

// 부팅
function boot() {
  try {
    const game = new Game();
    return game;
  } catch (err) {
    console.error('[boot] 치명적 오류', err);
    const el = document.getElementById('loading');
    if (el) el.innerHTML = `<div class="boot-error">게임을 시작할 수 없습니다.<br><small>${String(err?.message || err)}</small><br><small>브라우저 콘솔(F12)을 확인하세요.</small></div>`;
    return null;
  }
}

const game = boot();
export default game;
export { Game };

// 적(enemy) — THREE 저폴리 메시 + 이동/공격/상태이상/보스 패턴.
// 계약 §4.9: spawnEnemy({...}) -> Enemy, Enemy.takeDamage(amount, element, source) -> { killed, gold }.
// 지오메트리는 모듈 전역에서 공유하고, 머티리얼은 색상 키로 캐시한다. (핵심 코어만 개체별 1개 클론)

import * as THREE from 'three';
import {
  WAVE_CONFIG,
  ENEMY_TYPES,
  ALL_ENEMY_BY_ID,
  BOSS_TYPES,
  DIFFICULTIES,
  ELITE,
  HEALTH_BAR,
  SPAWN_FX
} from '../data.js';
import { createRNG } from '../utils/rng.js';
import {
  buildMonsterModel,
  disposeMonsterAssets,
  monsterEyeMaterial,
  monsterBodyMaterial
} from './monster-looks.js';

const DEVOUR_INTERVAL = 0.6;   // 계약 §4.9: 적이 광물/나무를 부수는 주기
const TELEGRAPH_TIME = 1.1;
const ABILITY_COOLDOWN = { smash: 9, summon: 14, breath: 11, shield: 20, judgment: 16 };
const ABILITY_RANGE = { smash: 4.5, summon: 60, breath: 15, shield: 9, judgment: 120 };

// 언데드 계열(신성 추가 피해 대상)
const UNDEAD_TYPES = new Set(['wraith', 'shade', 'lich', 'skeleton']);

// 원소 → 상태이상. void/holy 는 takeDamage 안에서 직접 처리한다.
const ELEMENT_EFFECT = { fire: 'burn', ice: 'slow', lightning: 'stun', poison: 'poison', chaos: 'chaos' };

// 개체별 실루엣 변형 [가로, 세로]
const VARIANTS = {
  imp: [0.92, 0.85],
  goblin: [1.0, 1.0],
  bat: [1.18, 0.6],
  wolf: [0.8, 0.72],
  spider: [1.38, 0.68],
  orc: [1.4, 1.15],
  skeleton: [0.85, 1.26],
  wraith: [1.05, 1.2],
  golem: [1.5, 1.3],
  drake: [1.3, 1.05],
  shade: [0.95, 1.12]
};

const DEFAULT_TURRET_DAMAGE = 10;

// ── 공유 리소스 ───────────────────────────────────────────────────────────
const GEOMETRY_CACHE = new Map();
function sharedGeometry(key, factory) {
  let geo = GEOMETRY_CACHE.get(key);
  if (!geo) {
    geo = factory();
    GEOMETRY_CACHE.set(key, geo);
  }
  return geo;
}

const GEO = {
  body: () => sharedGeometry('enemy:body', () => new THREE.CapsuleGeometry(0.5, 0.9, 3, 6)),
  core: () => sharedGeometry('enemy:core', () => new THREE.IcosahedronGeometry(0.4, 0)),
  crest: () => sharedGeometry('enemy:crest', () => new THREE.ConeGeometry(0.42, 0.95, 5)),
  spike: () => sharedGeometry('enemy:spike', () => new THREE.ConeGeometry(0.14, 0.5, 4)),
  shield: () => sharedGeometry('enemy:shield', () => new THREE.TorusGeometry(0.95, 0.06, 4, 14)),
  aura: () => sharedGeometry('enemy:aura', () => new THREE.TorusGeometry(1.05, 0.055, 4, 18))
};

// 몬스터 몸통 — 정점 색(부위별 색)을 쓰는 공유 재질 (개체별 클론 없음)
let MONSTER_BODY_MATERIAL = null;
function monsterBody() {
  if (!MONSTER_BODY_MATERIAL) MONSTER_BODY_MATERIAL = monsterBodyMaterial();
  return MONSTER_BODY_MATERIAL;
}

const MATERIAL_CACHE = new Map();
function sharedMaterial(color, role = 'body') {
  const key = `${color}|${role}`;
  let mat = MATERIAL_CACHE.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: role === 'core' ? 0.9 : 0.28,
      roughness: role === 'core' ? 0.35 : 0.78,
      metalness: 0.12,
      flatShading: true
    });
    MATERIAL_CACHE.set(key, mat);
  }
  return mat;
}

/** 반투명 실드 링 — 개체마다 만들지 않고 공유 캐시를 쓴다. */
function sharedBasicMaterial(color, opacity = 0.55) {
  const key = `basic|${color}|${opacity}`;
  let mat = MATERIAL_CACHE.get(key);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
    MATERIAL_CACHE.set(key, mat);
  }
  return mat;
}

/** 모듈 전역 공유 지오메트리/머티리얼을 해제한다(게임 종료 시). */
export function disposeEnemyAssets() {
  disposeMonsterAssets();
  MONSTER_BODY_MATERIAL = null;
  for (const geo of GEOMETRY_CACHE.values()) geo.dispose?.();
  GEOMETRY_CACHE.clear();
  for (const mat of MATERIAL_CACHE.values()) mat.dispose?.();
  MATERIAL_CACHE.clear();
}

function num(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

export function resolveDifficulty(difficulty) {
  const fallback = DIFFICULTIES.find((d) => d.id === 'normal') ?? DIFFICULTIES[0] ?? { id: 'normal', hpMult: 1, countMult: 1, goldMult: 1 };
  if (!difficulty) return fallback;
  if (typeof difficulty === 'string') return DIFFICULTIES.find((d) => d.id === difficulty) ?? fallback;
  return { ...fallback, ...difficulty };
}

function distXZ(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function distSqXZ(a, b) {
  if (!a || !b) return Infinity;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function lerpAngle(current, target, t) {
  // ±Infinity 가 들어오면 while 이 영원히 돌아 게임이 얼어붙었다 — 유한값만 받고 횟수도 묶는다.
  if (!Number.isFinite(current) || !Number.isFinite(target)) {
    return Number.isFinite(target) ? target : Number.isFinite(current) ? current : 0;
  }
  let diff = target - current;
  let guard = 0;
  while (diff > Math.PI && guard++ < 64) diff -= Math.PI * 2;
  guard = 0;
  while (diff < -Math.PI && guard++ < 64) diff += Math.PI * 2;
  return current + diff * Math.min(1, t);
}

// ── 스폰 위치 ─────────────────────────────────────────────────────────────
const JITTER_BY_PATTERN = { radial: 7, cluster: 3.2, opposite: 9, scattered: 42, ring: 4 };

function patternIdOf(pattern) {
  if (!pattern) return 'radial';
  return typeof pattern === 'string' ? pattern : pattern.id ?? 'radial';
}

function portalPoint(portal, out) {
  if (!portal) return null;
  const target = out ?? new THREE.Vector3();
  if (typeof portal.spawnPoint === 'function') {
    const res = portal.spawnPoint(target);
    if (res && Number.isFinite(res.x)) return res;
    if (Number.isFinite(target.x) && Number.isFinite(target.z)) return target;
  }
  if (Number.isFinite(portal.x)) return new THREE.Vector3(portal.x, 0, portal.z);
  const p = portal.position;
  if (p && Number.isFinite(p.x)) return new THREE.Vector3(p.x, 0, p.z);
  return null;
}

// 패턴에 실제로 열린 게이트에서 스폰 지점을 받아온다.
// (게이트 항목에는 spawnPoint(vec) 만 있고, 패턴 판정은 portalField 가 알고 있다.)
function fieldSpawnPoint(world, patternId, wave, rng) {
  const field = world?.portalField;
  if (!field || typeof field.spawnPoint !== 'function') return null;
  try {
    const p = field.spawnPoint(patternId, rng.int(0, 63), wave, rng);
    return p && Number.isFinite(p.x) ? p : null;
  } catch {
    return null;
  }
}

function pickPortal(portals, patternId, rng) {
  const list = (portals ?? []).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  if (patternId === 'opposite') {
    const i = rng.int(0, list.length - 1);
    const j = (i + Math.floor(list.length / 2)) % list.length;
    return rng.next() < 0.5 ? list[i] : list[j];
  }
  return list[rng.int(0, list.length - 1)];
}

function spawnPosition({ world, rng, portals, pattern, isBoss, wave = 1 }) {
  const patternId = patternIdOf(pattern);
  const pos = new THREE.Vector3();
  const portal = pickPortal(portals, patternId, rng);
  const base = fieldSpawnPoint(world, patternId, wave, rng) ?? portalPoint(portal);
  if (base) {
    const jitter = (JITTER_BY_PATTERN[patternId] ?? 7) * (isBoss ? 1.8 : 1);
    if (patternId === 'ring') {
      const radius = Math.max(10, jitter + num(portal?.radius, 8));
      const a = rng.next() * Math.PI * 2;
      pos.set(base.x + Math.cos(a) * radius, 0, base.z + Math.sin(a) * radius);
    } else if (patternId === 'cluster') {
      const a = rng.next() * Math.PI * 2;
      const r = rng.next() * jitter;
      pos.set(base.x + Math.cos(a) * r, 0, base.z + Math.sin(a) * r);
    } else {
      const a = rng.next() * Math.PI * 2;
      const r = rng.next() * jitter;
      pos.set(base.x + Math.cos(a) * r, 0, base.z + Math.sin(a) * r);
    }
  } else {
    // 포탈이 없으면 기지 주위 고리에서 스폰한다.
    const half = num(world?.bounds?.half, 0);
    const radius = half > 0 ? Math.max(60, half * 0.8) : 320;
    const a = rng.next() * Math.PI * 2;
    pos.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  }
  pos.y = num(world?.getHeight?.(pos.x, pos.z), 0);
  return pos;
}

// ── Enemy ────────────────────────────────────────────────────────────────
let nextEnemyId = 1;
const POOL = new Map();

export class Enemy {
  constructor() {
    this.id = nextEnemyId++;
    this.typeId = ENEMY_TYPES[0].id;
    this.type = ENEMY_TYPES[0];
    this.name = this.type.name;
    this.isBoss = false;
    this.position = new THREE.Vector3();
    this.hp = 1;
    this.maxHp = 1;
    this.speed = 0;
    this.baseSpeed = 0;
    this.damage = 0;
    this.radius = 0.7;
    this.gold = 0;
    this.alive = false;
    this.mesh = null;
    this.killer = null;
    this.deathElement = null;
    this.lastDamageElement = null;
    this.lastSource = null;
    this.damageTaken = 0;
    this.damageBySource = { player: 0, turret: 0, support: 0 };
    this._waveCredited = false;
    this.statuses = { burn: 0, burnDps: 0, slow: 0, slowFactor: 1, stun: 0, poison: 0, poisonStacks: 0, poisonDps: 0 };
    this.cooldown = 0;
    this.attackInterval = 1.1;
    this.abilityCooldown = 0;
    this.telegraph = null;
    this.shieldTime = 0;
    this.damageReduction = 0;
    this.shielded = false;
    this._hitFlash = 0;
    this._animT = 0;
    this._emergeT = 0;
    this._emergeMax = 0;
    this._avoidTimer = 0;
    this._avoid = new THREE.Vector3();
    this._core = null;
    this._coreMaterial = null;
    this._light = null;
    this._shieldRing = null;
    this._eliteRing = null;
    this.elite = false;
    this.mods = null;
    this.rosterId = null;
    this.scaleMul = 1;
    this.barY = 3;
    this.barWidth = HEALTH_BAR.width;
    this._meshKey = '';
    this._callbacks = {};
    this.world = null;
    this.scene = null;
    this.difficulty = resolveDifficulty(null);
  }

  // ── 생성/재사용 ────────────────────────────────────────────────────────
  reset(opts = {}) {
    const {
      scene = null,
      world = null,
      rng = null,
      wave = 1,
      difficulty = null,
      type = null,
      typeId = null,
      isBoss = false,
      position = null,
      mods = null,
      elite = false,
      rosterId = null,
      emerge = true,
      callbacks = {}
    } = opts;

    this.scene = scene;
    this.world = world;
    this.rng = rng ?? createRNG(`enemy-${this.id}`);
    this.difficulty = resolveDifficulty(difficulty);
    this._callbacks = callbacks ?? {};
    this.isBoss = !!isBoss;
    // 지형 야생 몬스터 표시 — POOL 재사용 시 이전 값이 새어 나가지 않게 매번 초기화한다.
    this.roaming = false;
    this.regionId = null;
    this.spawnerTier = null;
    this.leatherDrop = null;
    // 소환 경로 표시도 함께 지운다 — 소환문 몬스터가 풀에 반환된 뒤 같은 종이 웨이브로
    // 재사용되면 fromTower 가 남아 웨이브 정산(_countAlive)에서 빠지고, spawnerKind 가
    // 남아 야생 몬스터로 오인되던 결함의 원인이었다.
    this.spawnerKind = null;
    this.fromTower = false;
    // typeId 로 지형 몬스터(ALL_ENEMY_BY_ID)까지 찾는다 — 없으면 웨이브 기본 종.
    this.type = type ?? (this.isBoss ? BOSS_TYPES.find((b) => b.id === typeId) : ALL_ENEMY_BY_ID[typeId]) ?? ENEMY_TYPES[0];
    this.typeId = this.type.id;
    this.name = this.type.name;

    const cfg = WAVE_CONFIG;
    const w = Math.max(1, Math.floor(num(wave, 1)));
    // 웨이브 30 이후는 성장을 완만하게(웨이브 100 구간이 도달 가능하도록) — 계약 §4.58
    const softenAfter = Math.max(1, Math.round(num(cfg.softenAfter, 30)));
    const soften = Math.max(0.05, Math.min(1, num(cfg.growthSoftening, 0.28)));
    const effW = w <= softenAfter ? w - 1 : softenAfter - 1 + (w - softenAfter) * soften;
    const hpScale = Math.pow(num(cfg.hpGrowth, 1.16), effW);
    const speedScale = Math.pow(num(cfg.speedGrowth, 1.012), effW);
    const diff = this.difficulty;
    this.wave = w;
    // 최종보스처럼 고정 체력(hp)을 가진 타입은 웨이브·난이도 배율을 받지 않는다
    const fixedHp = num(this.type.hp, 0);
    this.maxHp = fixedHp > 0
      ? Math.max(1, Math.round(fixedHp))
      : Math.max(1, Math.round(num(cfg.baseHp, 60) * hpScale * num(this.type.hpMult, 1) * num(diff.hpMult, 1)));
    this.hp = this.maxHp;
    this.baseSpeed = num(cfg.baseSpeed, 3.4) * speedScale * num(this.type.speedMult, 1);
    this.speed = this.baseSpeed;
    this.radius = num(this.type.radius, 0.7);
    const fixedAttack = num(this.type.attack, 0);
    this.damage = fixedAttack > 0
      ? Math.max(1, Math.round(fixedAttack))
      : Math.max(1, Math.round(num(this.type.damage, 10) * (1 + 0.04 * (w - 1)) * (0.9 + 0.1 * num(diff.hpMult, 1))));
    this.gold = Math.max(1, Math.round(num(this.type.gold, 5) * (1 + 0.05 * (w - 1))));

    // 웨이브 편성표의 개체 강화 → 정예 개체 → 실루엣/판정 배율
    this.mods = mods
      ? { hpMult: num(mods.hpMult, 1), speedMult: num(mods.speedMult, 1), scaleMult: num(mods.scaleMult, 1) }
      : null;
    this.elite = !!elite && !this.isBoss;
    this.rosterId = rosterId ?? null;
    // 고정 스탯 보스(셀레스티얼)는 편성표 배율까지 받지 않는다 — 표기한 체력/공격력이 그대로 나온다(계약 §4.58).
    const fixedStats = fixedHp > 0;
    if (this.mods && !fixedStats) {
      this.maxHp = Math.max(1, Math.round(this.maxHp * num(this.mods.hpMult, 1)));
      this.baseSpeed *= num(this.mods.speedMult, 1);
    }
    if (this.elite) {
      this.maxHp = Math.max(1, Math.round(this.maxHp * num(ELITE.hpMult, 1)));
      this.baseSpeed *= num(ELITE.speedMult, 1);
      this.gold = Math.max(1, Math.round(this.gold * num(ELITE.goldMult, 1)));
    }
    this.hp = this.maxHp;
    this.speed = this.baseSpeed;
    this.scaleMul = (fixedStats ? 1 : num(this.mods?.scaleMult, 1)) * (this.elite ? num(ELITE.scaleMult, 1) : 1);
    this.radius = num(this.type.radius, 0.7) * this.scaleMul;
    this.name = this.elite ? `${ELITE.namePrefix}${this.type.name}` : this.type.name;

    this.attackInterval = this.isBoss ? 1.6 : 1.1;
    this.shielded = this.isBoss ? this.type.ability === 'shield' : this.typeId === 'golem';
    this._buildMesh();

    this.killer = null;
    this.deathElement = null;
    this.lastDamageElement = null;
    this.lastSource = null;
    this.damageTaken = 0;
    this.damageBySource = { player: 0, turret: 0, support: 0 };
    this.statuses = { burn: 0, burnDps: 0, slow: 0, slowFactor: 1, stun: 0, poison: 0, poisonStacks: 0, poisonDps: 0 };
    this.cooldown = 0;
    this.abilityCooldown = this.isBoss ? TELEGRAPH_TIME + 4 : 0;
    this.telegraph = null;
    this.shieldTime = 0;
    this.damageReduction = 0;
    this._hitFlash = 0;
    this._animT = 0;
    // 소환문에서 튀어나오는 연출(문 앞에서 작게 시작해 제 크기로 자란다)
    this._emergeT = emerge === false ? 0 : Math.max(0, num(SPAWN_FX.emergeTime, 0.55));
    this._emergeMax = this._emergeT;
    this._avoidTimer = 0;
    this._avoid.set(0, 0, 0);
    this._devourTimer = 0;
    this._waveCredited = false;
    this.alive = true;

    if (position) this.position.copy(position);
    if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.position.copy(this.position);
      this.mesh.rotation.set(0, 0, 0);
      this.mesh.scale.set(1, 1, 1);
      this.mesh.userData.enemy = this;
      // 첫 프레임부터 등장 연출이 적용되게 미리 작게/아래로 둔다.
      if (this._emergeT > 0) {
        const from = Math.min(1, Math.max(0.05, num(SPAWN_FX.scaleFrom, 0.35)));
        this.mesh.scale.setScalar(from);
        this.mesh.position.y -= num(SPAWN_FX.riseHeight, 1.15) * (this.isBoss ? 2 : 1);
      }
    }
    return this;
  }

  get hpRatio() {
    return this.maxHp > 0 ? Math.max(0, this.hp / this.maxHp) : 0;
  }

  // ── 메시 ───────────────────────────────────────────────────────────────
  _buildMesh() {
    const key = `${this.typeId}|${this.isBoss ? 'b' : 'm'}`;
    const color = this.type.color ?? 0xffffff;
    const [wMul, hMul] = VARIANTS[this.typeId] ?? [1, 1];
    const r = this.radius;
    // ── 최종보스 전용 메시(거대 3D) ──
    if (this.typeId === 'celestial') {
      if (this.mesh && this._meshKey === key) return;
      this._buildCelestialMesh(color);
      this._meshKey = key;
      return;
    }
    if (this.mesh && this._meshKey === key) {
      // 풀에서 재사용: 스케일만 갱신한다(같은 종류는 같은 모델).
      this._applyMeshScale(r * wMul, r * hMul);
      return;
    }
    if (this.mesh) this.mesh.clear?.();
    else {
      this.mesh = new THREE.Group();
      this.mesh.userData.enemy = this;
    }
    this._buildMonster(color);
    this._meshKey = key;
    this._applyMeshScale(r * wMul, r * hMul);
  }

  /**
   * 몬스터 모델 — 괴물 실루엣(울퉁불퉁한 몸통 · 턱과 이빨 · 뿔 · 등가시 · 꼬리 · 발톱).
   *  드로우콜을 늘리지 않도록 부위를 한 지오메트리로 합치고(정점 색), 팔·눈·망토만 따로 둔다.
   */
  _buildMonster(color) {
    // 셀레스티얼에서 넘어온 경우 전용 파츠 참조를 지운다
    this._celestialParts = null;
    this._celestialSkin = null;
    const model = buildMonsterModel(this.typeId, { boss: this.isBoss, color });
    this._monsterModel = model;

    const body = new THREE.Mesh(model.body, monsterBody());
    body.name = 'body';
    this.mesh.add(body);
    this._body = body;

    const arms = new THREE.Mesh(model.arms, monsterBody());
    arms.name = 'arms';
    this.mesh.add(arms);
    this._arms = arms;

    const eyes = new THREE.Mesh(model.eyes, monsterEyeMaterial(model.eyeColor));
    eyes.name = 'eyes';
    eyes.renderOrder = 2;
    this.mesh.add(eyes);
    this._eyes = eyes;
    this._eyeMaterial = eyes.material;
    this._eyeColor = model.eyeColor;

    if (model.cloak) {
      const cloak = new THREE.Mesh(
        model.cloak,
        new THREE.MeshStandardMaterial({
          color: 0x141a26,
          transparent: true,
          opacity: 0.72,
          roughness: 0.95,
          metalness: 0,
          flatShading: true,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      cloak.name = 'cloak';
      cloak.renderOrder = 1;
      this.mesh.add(cloak);
      this._cloak = cloak;
    }

    // 가슴 코어(발광) — 상태이상 색으로 물든다
    const core = new THREE.Mesh(GEO.core(), sharedMaterial(color, 'core').clone());
    core.name = 'core';
    this._coreMaterial = core.material;
    this._core = core;
    this.mesh.add(core);

    // 보스 장식
    const crest = new THREE.Mesh(GEO.crest(), sharedMaterial(color, 'crest'));
    crest.name = 'crest';
    crest.visible = false;
    this.mesh.add(crest);
    const spikeL = new THREE.Mesh(GEO.spike(), sharedMaterial(color, 'spike'));
    spikeL.name = 'spikeL';
    spikeL.visible = false;
    this.mesh.add(spikeL);
    const spikeR = spikeL.clone();
    spikeR.name = 'spikeR';
    this.mesh.add(spikeR);
    const ring = new THREE.Mesh(GEO.shield(), sharedBasicMaterial(0x8fd6ff, 0.55));
    ring.name = 'shieldRing';
    ring.visible = false;
    this._shieldRing = ring;
    this.mesh.add(ring);
    const aura = new THREE.Mesh(GEO.aura(), sharedBasicMaterial(ELITE.color, 0.72));
    aura.name = 'eliteAura';
    aura.visible = false;
    aura.rotation.x = -Math.PI / 2;
    this._eliteRing = aura;
    this.mesh.add(aura);

    this._light = new THREE.PointLight(color, 0, 18);
    this.mesh.add(this._light);
  }

  /**
   * 최종보스 셀레스티얼 전용 메시 — 낙원의 거대한 존재.
   * 몸통(이십면체) + 회전하는 3중 고리 + 8개 날개 파편 + 왕관 + 천상의 빛기둥.
   */
  _buildCelestialMesh(color) {
    if (!this.mesh) {
      this.mesh = new THREE.Group();
      this.mesh.userData.enemy = this;
    }
    this.mesh.clear?.();
    const r = Math.max(6, num(this.radius, 42));
    this._celestialParts = [];

    const skin = new THREE.MeshStandardMaterial({
      color,
      emissive: 0xfff0c0,
      emissiveIntensity: 0.85,
      roughness: 0.32,
      metalness: 0.15,
      flatShading: true
    });
    const glow = new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.75 });
    this._celestialSkin = skin;

    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), skin);
    body.name = 'body';
    body.scale.set(r * 0.62, r * 0.78, r * 0.62);
    body.position.y = r * 1.05;
    this.mesh.add(body);

    // 코어는 _animate 가 emissive/emissiveIntensity 를 갱신하므로 표준 재질을 쓴다
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xfff2b0,
      emissive: 0xfff0c0,
      emissiveIntensity: 1.2,
      roughness: 0.25,
      metalness: 0.1
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), coreMat);
    core.name = 'core';
    core.scale.setScalar(r * 0.28);
    core.position.y = r * 1.3;
    this._core = core;
    this._coreMaterial = core.material;
    this.mesh.add(core);

    // 3중 회전 고리(할로)
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 28), glow.clone());
      ring.name = 'celestialRing' + i;
      ring.material.opacity = 0.62 - i * 0.12;
      const rad = r * (1.15 + i * 0.32);
      ring.scale.setScalar(rad);
      ring.position.y = r * (1.5 + i * 0.35);
      ring.rotation.set(Math.PI / 2 + i * 0.42, i * 0.6, 0);
      this.mesh.add(ring);
      this._celestialParts.push({ mesh: ring, spin: (i % 2 === 0 ? 1 : -1) * (0.22 + i * 0.08) });
    }

    // 날개 파편 8장 — 좌우로 펼쳐진 거대한 날개
    for (let i = 0; i < 8; i++) {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.6, 4), skin.clone());
      wing.name = 'celestialWing' + i;
      wing.material.emissiveIntensity = 1.1;
      const side = i % 2 === 0 ? 1 : -1;
      const step = Math.floor(i / 2);
      const w = r * (0.5 + step * 0.16);
      wing.scale.set(r * 0.5, r * (1.5 - step * 0.22), r * 0.16);
      wing.position.set(side * r * (0.75 + step * 0.22), r * (1.55 - step * 0.18), -r * 0.12);
      wing.rotation.set(0, 0, side * (0.75 + step * 0.16));
      this.mesh.add(wing);
      this._celestialParts.push({ mesh: wing, flap: side * (0.5 + step * 0.12) });
    }

    // 왕관 — 12개의 첨탑
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1, 2, 8), glow.clone());
    crown.name = 'crest';
    crown.material.color.setHex(0xffe066);
    crown.scale.set(r * 0.42, r * 0.55, r * 0.42);
    crown.position.y = r * 2.1;
    this.mesh.add(crown);

    // 천상의 빛기둥
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.36, r * 0.5, r * 6, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff4cf, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    pillar.name = 'celestialPillar';
    pillar.position.y = r * 3.2;
    this.mesh.add(pillar);

    const light = new THREE.PointLight(0xffe9a8, 2.6, Math.min(420, 60 + r * 4));
    light.name = 'celestialLight';
    light.visible = true; // 최종보스는 광원을 켠다
    light.position.y = r * 1.9;
    this._light = light;
    this.mesh.add(light);

    // 월드 체력바 — 거대 모델에 맞춘 위치/폭
    const barY = num(this.type?.barY, r * 3.4);
    const barWidth = num(this.type?.barWidth, r * 1.5);
    this.barY = barY;
    this.barWidth = barWidth;
  }

  _applyMeshScale(width, height) {
    const mul = num(this.scaleMul, 1);
    if (mul !== 1) { width *= mul; height *= mul; }
    // 몸통·팔·눈은 같은 단위 모델을 함께 스케일한다(발 y=0 · 머리끝 y≈2.45).
    for (const name of ['body', 'arms', 'eyes']) {
      const part = this.mesh.getObjectByName(name);
      if (part) {
        part.scale.set(width, height, width);
        part.position.set(0, 0, 0);
      }
    }
    const cloak = this.mesh.getObjectByName('cloak');
    if (cloak) {
      cloak.scale.set(width, height, width);
      cloak.position.y = 0;
    }
    if (this._core) {
      this._core.scale.setScalar(0.3 + height * 0.26);
      this._core.position.set(0, height * 1.32, width * 0.52);
    }
    const crest = this.mesh.getObjectByName('crest');
    if (crest) {
      crest.visible = this.isBoss;
      crest.scale.setScalar(this.isBoss ? height * 0.8 : 0.01);
      crest.position.set(0, height * 2.45, -0.05);
      crest.rotation.z = Math.PI;
    }
    const spikeL = this.mesh.getObjectByName('spikeL');
    const spikeR = this.mesh.getObjectByName('spikeR');
    if (spikeL && spikeR) {
      for (const s of [spikeL, spikeR]) {
        s.visible = this.isBoss;
        s.scale.setScalar(this.isBoss ? height : 0.01);
      }
      spikeL.position.set(width * 0.92, height * 1.95, -0.08);
      spikeL.rotation.z = -0.75;
      spikeR.position.set(-width * 0.92, height * 1.95, -0.08);
      spikeR.rotation.z = 0.75;
    }
    if (this._shieldRing) {
      this._shieldRing.scale.setScalar(Math.max(1, this.radius * 1.4));
      this._shieldRing.position.y = height * 1.35;
    }
    if (this._light) {
      // 성능: 세기 0 인 광원도 three 는 셰이더에 포함시킨다(적 140마리 = 점광원 140개).
      // 보스만 켜고 일반 몬스터는 아예 렌더 목록에서 뺀다.
      const lit = !!this.isBoss;
      this._light.visible = lit;
      this._light.intensity = lit ? 1.8 : 0;
      this._light.distance = Math.min(420, 12 + this.radius * 5);
    }
    if (this._eliteRing) {
      this._eliteRing.visible = this.elite;
      this._eliteRing.scale.setScalar(Math.max(0.6, this.radius * 1.6));
      this._eliteRing.position.y = 0.14;
    }
    // 월드 체력바가 읽는 값 — 머리 위 높이와 폭
    const factor = this.isBoss ? num(HEALTH_BAR.bossHeightFactor, 3.7) : num(HEALTH_BAR.heightFactor, 2.55);
    this.barY = height * factor + num(HEALTH_BAR.heightOffset, 0.55);
    this.barWidth =
      num(this.isBoss ? HEALTH_BAR.bossWidth : HEALTH_BAR.width, 1.6) * (this.elite ? num(HEALTH_BAR.eliteWidthMult, 1.25) : 1);
  }

  // ── 피해/상태이상 ──────────────────────────────────────────────────────
  /**
   * 계약 §4.9. 원소별 효과를 적용하고, 죽으면 { killed, gold } 를 돌려준다.
   * source: 'player' | 'turret' | 'support' — 킬 귀속은 this.killer 로 노출된다.
   */
  takeDamage(amount, element = null, source = 'player') {
    if (!this.alive) return { killed: false, gold: 0, source, element };
    let dmg = Math.max(0, num(amount));
    if (dmg <= 0) return { killed: false, gold: 0, source, element };

    // 신성: 언데드 계열에 추가 피해
    if (element === 'holy' && UNDEAD_TYPES.has(this.typeId)) dmg *= 1.5;
    // 공허: 방어를 무시하지는 않지만 실드 보유 대상에게 추가 피해
    if (element === 'void' && (this.shieldTime > 0 || this.shielded)) dmg *= 1.5;
    if (this.damageReduction > 0) dmg *= 1 - this.damageReduction;

    this.hp -= dmg;
    this.damageTaken += dmg;
    this.lastDamageElement = element ?? null;
    this.lastSource = source ?? 'player';
    this.damageBySource[this.lastSource] = (this.damageBySource[this.lastSource] ?? 0) + dmg;
    this._hitFlash = 0.14;
    this._applyElementEffect(element, dmg);

    if (this.hp <= 0) return this._die(source, element);
    return { killed: false, gold: 0, source, element, hp: this.hp };
  }

  _applyElementEffect(element, dmg) {
    const effect = ELEMENT_EFFECT[element];
    if (!effect) return;
    if (effect === 'chaos') {
      const pool = ['burn', 'slow', 'stun', 'poison'];
      for (let i = 0; i < 2 && pool.length > 0; i++) {
        const idx = this.rng.int ? this.rng.int(0, pool.length - 1) : Math.floor(this.rng.next() * pool.length);
        const [picked] = pool.splice(idx, 1);
        this._applyElementEffectById(picked, dmg);
      }
      return;
    }
    this._applyElementEffectById(effect, dmg);
  }

  _applyElementEffectById(effect, dmg) {
    const st = this.statuses;
    switch (effect) {
      case 'burn':
        st.burn = Math.max(st.burn, 3);
        st.burnDps = Math.max(st.burnDps, dmg * 0.2);
        break;
      case 'slow':
        st.slow = Math.max(st.slow, 2.5);
        st.slowFactor = Math.min(st.slowFactor, 0.5);
        break;
      case 'stun':
        st.stun = Math.max(st.stun, 0.6);
        break;
      case 'poison':
        st.poison = Math.max(st.poison, 5);
        st.poisonStacks = Math.min(5, st.poisonStacks + 1);
        st.poisonDps = dmg * 0.12;
        break;
      default:
        break;
    }
  }

  _tickStatuses(dt) {
    const st = this.statuses;
    if (this.shieldTime > 0) {
      this.shieldTime -= dt;
      if (this.shieldTime <= 0) {
        this.shieldTime = 0;
        this.damageReduction = 0;
      }
    }
    if (st.burn > 0) {
      st.burn -= dt;
      this._applyDot(st.burnDps * dt);
      if (st.burn <= 0) st.burnDps = 0;
    }
    if (this.alive && st.poison > 0) {
      st.poison -= dt;
      this._applyDot(st.poisonDps * st.poisonStacks * dt);
      if (st.poison <= 0) {
        st.poisonStacks = 0;
        st.poisonDps = 0;
      }
    }
    if (st.slow > 0) {
      st.slow -= dt;
      if (st.slow <= 0) {
        st.slow = 0;
        st.slowFactor = 1;
      }
    }
    if (st.stun > 0) st.stun = Math.max(0, st.stun - dt);
  }

  /** DoT 피해 — 마지막으로 가해진 source 에 킬을 귀속시킨다. */
  _applyDot(amount) {
    const dmg = Math.max(0, num(amount));
    if (dmg <= 0 || !this.alive) return;
    this.hp -= dmg;
    this.damageTaken += dmg;
    if (this.hp <= 0) this._die(this.lastSource ?? 'player', this.lastDamageElement);
  }

  _die(source, element) {
    this.hp = 0;
    this.alive = false;
    this.killer = source ?? this.lastSource ?? 'player';
    this.deathElement = element ?? this.lastDamageElement ?? null;
    this.telegraph = null;
    if (this.mesh) this.mesh.visible = false;
    if (this._light) this._light.intensity = 0;
    const info = { gold: this.gold, source: this.killer, element: this.deathElement, isBoss: this.isBoss, enemy: this };
    this._callbacks.awardGold?.(this.gold, this, info);
    this._callbacks.onDeath?.(this, info);
    return { killed: true, gold: this.gold, source: this.killer, element: this.deathElement, killer: this.killer };
  }

  // ── 갱신 ───────────────────────────────────────────────────────────────
  update(dt, ctx = {}) {
    if (!this.alive) return;
    const step = Math.max(0, Math.min(num(dt), 0.5));
    if (step <= 0) return;
    if (ctx.callbacks) this._callbacks = { ...this._callbacks, ...ctx.callbacks };

    this._tickStatuses(step);
    if (!this.alive) return;

    const base = ctx.base ?? this.world?.base ?? null;
    const basePos = base?.position ?? null;
    const baseRadius = num(base?.radius, 6);
    const baseDist = basePos ? Math.max(0, distXZ(this.position, basePos) - baseRadius - this.radius) : Infinity;
    const baseReach = 0.9;

    if (this.telegraph) {
      this._tickTelegraph(step, ctx, basePos);
    } else if (this.isBoss) {
      this._tickAbility(step, ctx, basePos, baseDist);
    }

    if (this.statuses.stun > 0) {
      this._animate(step);
      return;
    }

    this.cooldown -= step;
    // 계약 §4.9: 적은 기지를 향해 이동하고, 기지 도달 시 기지를 공격하며
    // 경로상의 광물/나무를 부순다. (포탑은 공격 대상이 아니다 — 보스 광역만 구조물을 때린다)
    if (basePos && baseDist <= baseReach) {
      this._face(basePos, step);
      if (this.cooldown <= 0) {
        this.cooldown = this.attackInterval;
        base?.damage?.(this.damage);
        ctx.onBaseDamage?.(this.damage, this);
        this._callbacks.onBaseDamage?.(this.damage, this);
      }
    } else {
      this._move(step, ctx, basePos);
      this._devour(step, ctx);
    }

    this._animate(step);
  }

  _face(target, dt) {
    if (!this.mesh || !target) return;
    const yaw = Math.atan2(target.x - this.position.x, target.z - this.position.z);
    this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, yaw, dt * 8);
  }

  _move(dt, ctx, basePos) {
    if (!basePos) return;
    const world = this.world;
    const dirX = basePos.x - this.position.x;
    const dirZ = basePos.z - this.position.z;
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-4) return;
    let dx = dirX / len;
    let dz = dirZ / len;

    // 나무/광물 회피 — 0.3초마다 목표를 갱신한다.
    this._avoidTimer -= dt;
    if (this._avoidTimer <= 0) {
      this._avoidTimer = 0.3;
      this._avoid.set(0, 0, 0);
      const probe = Math.max(1.2, this.radius + 1.4);
      const obstacle = world?.nearestTree?.(this.position, probe) ?? world?.nearestMineral?.(this.position, probe) ?? null;
      if (obstacle) {
        const ox = this.position.x - num(obstacle.x);
        const oz = this.position.z - num(obstacle.z);
        const olen = Math.hypot(ox, oz) || 1;
        const side = this.id % 2 === 0 ? 1 : -1;
        this._avoid.set((-oz / olen) * side, 0, (ox / olen) * side);
      }
    }
    if (this._avoid.lengthSq() > 0) {
      dx += this._avoid.x * 0.65;
      dz += this._avoid.z * 0.65;
      const l2 = Math.hypot(dx, dz) || 1;
      dx /= l2;
      dz /= l2;
    }

    const speedMul = this.statuses.slow > 0 ? this.statuses.slowFactor : 1;
    const speed = this.baseSpeed * speedMul;
    this.position.x += dx * speed * dt;
    this.position.z += dz * speed * dt;

    world?.resolveCollision?.(this.position, this.radius);
    this.position.y = num(world?.getHeight?.(this.position.x, this.position.z), this.position.y);
    if (this.mesh) {
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, Math.atan2(dx, dz), dt * 8);
      this.mesh.position.copy(this.position);
    }
  }

  // 계약 §4.9: 이동 중 만난 나무/광물을 부순다(이동은 멈추지 않는다).
  _devour(dt, ctx) {
    const world = this.world;
    if (!world) return;
    this._devourTimer = num(this._devourTimer, 0) - dt;
    const reach = Math.max(1.4, this.radius + 1);
    let tree = world.nearestTree?.(this.position, reach) ?? null;
    if (tree && tree.felled) tree = null;   // 이미 쓰러진 나무는 건너뛴다(중복 콜백 방지)
    const mineral = tree ? null : world.nearestMineral?.(this.position, reach) ?? null;
    const target = tree ?? mineral;
    if (!target) {
      this._devourTimer = 0;
      return;
    }
    if (this._devourTimer > 0) return;
    this._devourTimer = DEVOUR_INTERVAL;
    const dmg = Math.max(4, this.damage * 2);
    if (tree) {
      const res = world.treeField?.chop?.(tree, dmg) ?? tree.chop?.(dmg) ?? null;
      if (!res) return;
      const wood = num(res.wood);
      if (wood > 0) {
        ctx.onResourceStolen?.(this, 'wood', wood);
        this._callbacks.onResourceStolen?.(this, 'wood', wood);
      }
      if (res.felled) this._callbacks.onFellTree?.(this, tree);
    } else {
      const res = world.mineralField?.harvest?.(mineral, dmg) ?? mineral.harvest?.(dmg) ?? null;
      if (!res) return;
      const amount = num(res.amount);
      if (amount > 0) {
        ctx.onResourceStolen?.(this, 'mineral', amount);
        this._callbacks.onResourceStolen?.(this, 'mineral', amount);
      }
    }
  }

  _animate(dt) {
    if (!this.mesh) return;
    this._animT += dt;
    this.mesh.position.copy(this.position);
    if (this._hitFlash > 0) {
      this._hitFlash = Math.max(0, this._hitFlash - dt);
      const k = 1 + this._hitFlash * 0.8;
      this.mesh.scale.set(k, 1 / k, k);
    } else if (this.mesh.scale.x !== 1 || this.mesh.scale.y !== 1) {
      this.mesh.scale.set(1, 1, 1);
    }
    if (this._emergeT > 0) {
      this._emergeT = Math.max(0, this._emergeT - dt);
      const k = 1 - this._emergeT / (this._emergeMax || 1);
      const g = k * k * (3 - 2 * k); // smoothstep
      const from = Math.min(1, Math.max(0.05, num(SPAWN_FX.scaleFrom, 0.35)));
      this.mesh.scale.multiplyScalar(from + (1 - from) * g);
      this.mesh.position.y += num(SPAWN_FX.riseHeight, 1.15) * (this.isBoss ? 2 : 1) * (g - 1);
    }
    // 몬스터 — 숨쉬는 몸통 · 앞으로 숙이는 예고 · 팔 휘두르기 · 망토 흔들림
    if (this._body) {
      const t = this._animT;
      this._body.position.y = Math.abs(Math.sin(t * 6.5 + this.id)) * 0.03;
      this._body.rotation.x = Math.sin(t * 2.2 + this.id) * 0.03 + (this.telegraph ? -0.14 : 0);
      this._body.rotation.z = Math.sin(t * 1.7 + this.id) * 0.02;
    }
    if (this._arms) {
      const swing = Math.sin(this._animT * 3.4 + this.id * 0.7) * 0.13;
      const thrash = this.telegraph ? Math.sin(this._animT * 14) * 0.4 : 0;
      this._arms.rotation.x = swing + thrash;
      this._arms.rotation.z = Math.cos(this._animT * 2.8 + this.id) * 0.05;
    }
    if (this._cloak) {
      this._cloak.rotation.y = Math.sin(this._animT * 1.4 + this.id) * 0.12;
      this._cloak.rotation.x = Math.sin(this._animT * 1.1 + this.id) * 0.05;
    }
    if (this._core) {
      this._core.rotation.y += dt * 1.6;
      const pulse = 1 + Math.sin(this._animT * 4 + this.id) * 0.06;
      this._core.scale.setScalar((0.55 + this.radius * 0.7) * pulse);
    }
    if (this._eyeMaterial) {
      const st = this.statuses;
      const glow = 1.55 + Math.sin(this._animT * 5 + this.id) * 0.2 + (this.telegraph ? 1.8 : 0);
      this._eyeMaterial.emissiveIntensity = glow;
      const eyeTint = st.burn > 0 ? 0xff7a3a : st.poison > 0 ? 0x8fe05a : st.stun > 0 ? 0xffe15c : this._eyeColor ?? 0xffffff;
      this._eyeMaterial.emissive?.setHex?.(eyeTint);
      this._eyeMaterial.color?.setHex?.(eyeTint);
    }
    if (this._coreMaterial) {
      const st = this.statuses;
      let tint = null;
      if (st.burn > 0) tint = 0xff7a3a;
      else if (st.poison > 0) tint = 0x7fd14a;
      else if (st.slow > 0) tint = 0x6ad4ff;
      else if (st.stun > 0) tint = 0xffe15c;
      const base = this.elite ? ELITE.color : this.type.color ?? 0xffffff;
      const emerge = this._emergeT > 0 ? this._emergeT / (this._emergeMax || 1) : 0;
      this._coreMaterial.emissive?.setHex?.(emerge > 0 ? num(SPAWN_FX.tint, 0x9fe8ff) : (tint ?? base));
      this._coreMaterial.emissiveIntensity = this.telegraph ? 1.6 : 0.85 + 2.2 * emerge;
    }
    // 최종보스 — 고리 회전 · 날개 펄럭임 · 공중 부양
    if (this._celestialParts) {
      for (const part of this._celestialParts) {
        if (part.spin) part.mesh.rotation.z += dt * part.spin;
        if (part.flap) part.mesh.rotation.z += Math.sin(this._animT * 1.6 + part.mesh.position.x * 0.05) * dt * part.flap;
      }
      const hover = Math.sin(this._animT * 0.9) * this.radius * 0.06;
      this.mesh.position.y += hover;
      if (this._celestialSkin) {
        const flash = this._hitFlash > 0 ? 1 + this._hitFlash * 4 : 0;
        this._celestialSkin.emissiveIntensity = 0.75 + Math.sin(this._animT * 2.2) * 0.18 + flash;
      }
    }
    if (this._shieldRing) {
      this._shieldRing.visible = this.shieldTime > 0;
      if (this._shieldRing.visible) this._shieldRing.rotation.y += dt * 1.4;
    }
    if (this._eliteRing?.visible) {
      this._eliteRing.rotation.z += dt * 1.1;
      const pulse = 1 + Math.sin(this._animT * 3 + this.id) * 0.08;
      this._eliteRing.scale.setScalar(Math.max(0.6, this.radius * 1.6) * pulse);
    }
    if (this._light && this.isBoss) this._light.intensity = 1.8 * (this.telegraph ? 2.2 : 1);
  }

  // ── 보스 패턴 ──────────────────────────────────────────────────────────
  _tickAbility(dt, ctx, basePos, baseDist) {
    const ability = this.type.ability;
    if (!ability) return;
    const inRange = baseDist <= (ABILITY_RANGE[ability] ?? 12);
    this.abilityCooldown -= dt;
    if (this.abilityCooldown <= 0 && inRange) {
      this.telegraph = { ability, t: TELEGRAPH_TIME };
      this.abilityCooldown = ABILITY_COOLDOWN[ability] ?? 12;
      this._callbacks.onTelegraph?.(this, ability);
      ctx.onTelegraph?.(this, ability);
    }
  }

  _tickTelegraph(dt, ctx, basePos) {
    this.telegraph.t -= dt;
    if (this.telegraph.t > 0) return;
    const ability = this.telegraph.ability;
    this.telegraph = null;
    this._execute(ability, ctx, basePos);
  }

  _execute(ability, ctx, basePos) {
    const base = ctx.base ?? this.world?.base ?? null;
    this._callbacks.onAbility?.(this, ability);
    ctx.onAbility?.(this, ability);
    switch (ability) {
      case 'smash': {
        const heavy = Math.round(this.damage * 3);
        if (basePos && distXZ(this.position, basePos) <= num(base?.radius, 6) + this.radius + ABILITY_RANGE.smash) {
          base?.damage?.(heavy);
          ctx.onBaseDamage?.(heavy, this);
          this._callbacks.onBaseDamage?.(heavy, this);
        }
        break;
      }
      case 'summon': {
        const spawn = ctx.spawnMinion ?? this._callbacks.spawnMinion;
        spawn?.(this, 3);
        break;
      }
      case 'breath': {
        const range = ABILITY_RANGE.breath;
        const dx = basePos ? basePos.x - this.position.x : 0;
        const dz = basePos ? basePos.z - this.position.z : 1;
        const len = Math.hypot(dx, dz) || 1;
        const fx = dx / len;
        const fz = dz / len;
        const cos = Math.cos(0.61); // ±35도 콘
        for (const t of ctx.turrets ?? []) {
          if (!t || t.destroyed) continue;
          const ox = t.position.x - this.position.x;
          const oz = t.position.z - this.position.z;
          const d = Math.hypot(ox, oz);
          if (d > range) continue;
          if ((ox / d) * fx + (oz / d) * fz < cos) continue;
          t.takeDamage?.(Math.round(this.damage * 1.5));
        }
        if (basePos) {
          const ox = basePos.x - this.position.x;
          const oz = basePos.z - this.position.z;
          const d = Math.hypot(ox, oz);
          if (d <= range + num(base?.radius, 6) && (ox / d) * fx + (oz / d) * fz >= cos) {
            const heavy = Math.round(this.damage * 2);
            base?.damage?.(heavy);
            ctx.onBaseDamage?.(heavy, this);
            this._callbacks.onBaseDamage?.(heavy, this);
          }
        }
        const player = ctx.player;
        if (player?.position) {
          const ox = player.position.x - this.position.x;
          const oz = player.position.z - this.position.z;
          const d = Math.hypot(ox, oz);
          if (d <= range && (ox / d) * fx + (oz / d) * fz >= cos) player.takeDamage?.(Math.round(this.damage * 1.2), 'fire');
        }
        break;
      }
      case 'judgment': {
        // 심판: 반경 안의 모든 것을 태운다 — 포탑 3배, 기지 3배, 플레이어 2.5배 + 밀쳐냄
        const range = ABILITY_RANGE.judgment;
        for (const t of ctx.turrets ?? []) {
          if (!t || t.destroyed) continue;
          const d = Math.hypot(t.position.x - this.position.x, t.position.z - this.position.z);
          if (d <= range) t.takeDamage?.(Math.round(this.damage * 3));
        }
        if (basePos) {
          const d = Math.hypot(basePos.x - this.position.x, basePos.z - this.position.z);
          if (d <= range + num(base?.radius, 6)) {
            const heavy = Math.round(this.damage * 3);
            base?.damage?.(heavy);
            ctx.onBaseDamage?.(heavy, this);
            this._callbacks.onBaseDamage?.(heavy, this);
          }
        }
        {
          const player = ctx.player;
          if (player?.position) {
            const ox = player.position.x - this.position.x;
            const oz = player.position.z - this.position.z;
            const d = Math.hypot(ox, oz) || 1;
            if (d <= range) {
              player.takeDamage?.(Math.round(this.damage * 2.5), 'holy');
              const push = 9;
              player.position.x += (ox / d) * push;
              player.position.z += (oz / d) * push;
              if (player.velocity) {
                player.velocity.x += (ox / d) * push * 2;
                player.velocity.z += (oz / d) * push * 2;
              }
            }
          }
        }
        ctx.onKnockback?.(this, range);
        break;
      }
      case 'shield': {
        this.shieldTime = 5;
        this.damageReduction = 0.5;
        const player = ctx.player;
        if (player?.position) {
          const ox = player.position.x - this.position.x;
          const oz = player.position.z - this.position.z;
          const d = Math.hypot(ox, oz) || 1;
          if (d <= ABILITY_RANGE.shield) {
            const push = 3.5;
            player.position.x += (ox / d) * push;
            player.position.z += (oz / d) * push;
            if (player.velocity) {
              player.velocity.x += (ox / d) * push * 2;
              player.velocity.z += (oz / d) * push * 2;
            }
          }
        }
        ctx.onKnockback?.(this, ABILITY_RANGE.shield);
        break;
      }
      default:
        break;
    }
  }

  // ── 풀링 ───────────────────────────────────────────────────────────────
  /** 메시를 씬에서 떼고 풀에 반납한다. */
  despawn() {
    this.alive = false;
    if (this.mesh) {
      this.mesh.visible = false;
      this.mesh.parent?.remove?.(this.mesh);
    }
    const key = `${this.typeId}|${this.isBoss ? 'b' : 'm'}`;
    const list = POOL.get(key);
    if (list) list.push(this);
    else POOL.set(key, [this]);
    return this;
  }

  static acquire(key) {
    const list = POOL.get(key);
    if (!list || list.length === 0) return null;
    return list.pop();
  }

  static release(enemy) {
    enemy?.despawn?.();
  }

  static clearPool() {
    POOL.clear();
  }
}

/** 보스 체력바 등 UI 가 쓰는 최소 정보 */
export function enemyInfo(enemy) {
  return {
    id: enemy.id,
    typeId: enemy.typeId,
    name: enemy.name,
    isBoss: enemy.isBoss,
    elite: !!enemy.elite,
    rosterId: enemy.rosterId ?? null,
    wave: enemy.wave ?? 1,
    emerging: num(enemy._emergeT, 0) > 0,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    ratio: enemy.hpRatio,
    shielded: !!(enemy.shielded || enemy.shieldTime > 0),
    ability: enemy.type?.ability ?? null,
    abilityDesc: enemy.type?.desc ?? '',
    color: enemy.type?.color ?? 0xffffff,
    barY: num(enemy.barY, 3),
    barWidth: num(enemy.barWidth, HEALTH_BAR.width),
    x: enemy.position.x,
    y: enemy.position.y,
    z: enemy.position.z,
    alive: enemy.alive
  };
}

/**
 * 계약 §4.9 스폰 함수.
 * @returns {Enemy|null}
 */
export function spawnEnemy({
  scene,
  world,
  rng,
  wave = 1,
  difficulty = null,
  typeId = null,
  isBoss = false,
  portals = null,
  pattern = null,
  position = null,
  mods = null,
  elite = false,
  rosterId = null,
  emerge = true,
  callbacks = null,
  type: typeOverride = null
} = {}) {
  const r = rng ?? createRNG(`wave-${wave}`);
  const boss = isBoss || (typeId ? BOSS_TYPES.some((b) => b.id === typeId) : false);
  // 무한 모드 셀레스티얼처럼 이미 계산한 타입을 넘기면 그것을 쓴다(계약 §4.58).
  const type = typeOverride ?? (boss ? BOSS_TYPES.find((b) => b.id === typeId) ?? BOSS_TYPES[0] : ALL_ENEMY_BY_ID[typeId] ?? ENEMY_TYPES[0]);
  if (!type) return null;
  const key = `${type.id}|${boss ? 'b' : 'm'}`;
  const enemy = Enemy.acquire(key) ?? new Enemy();
  const spawnAt = position ?? spawnPosition({ world, rng: r, portals: portals ?? world?.portals ?? null, pattern, isBoss: boss, wave });
  enemy.reset({
    scene,
    world,
    rng: r,
    wave,
    difficulty,
    type,
    typeId: type.id,
    isBoss: boss,
    position: spawnAt,
    mods,
    elite,
    rosterId,
    emerge,
    callbacks: callbacks ?? {}
  });
  scene?.add?.(enemy.mesh);
  return enemy;
}

export default Enemy;

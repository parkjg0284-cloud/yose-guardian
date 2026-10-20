// 웨이브 시스템 — prep(준비) → combat(전투) → complete(보상) → 다음 prep.
// 계약 §4.9: phase/wave/timeLeft/enemies/alive, forceStart/reset/toJSON·fromJSON, 콜백 4종.

import {
  WAVE_CONFIG,
  SPAWN_PATTERNS,
  ENEMY_TYPES,
  ENEMY_TYPE_BY_ID,
  BOSS_TYPES,
  MINERAL_TYPES,
  DIFFICULTIES,
  waveRoster,
  WAVE_ROSTER_BY_ID,
  waveEnemyLeather,
  regionMonsterRoster,
  regionMonsterLoot
} from '../data.js';
import { createRNG } from '../utils/rng.js';
import { spawnEnemy, resolveDifficulty } from './enemies.js';
import { hiddenMineralIds } from '../world/regions.js';

// 히든 지역(벚꽃의 정원 · 시간의 지평선) 전용 광물 — 웨이브 보상으로는 나오지 않는다
const EXCLUSIVE_MINERAL_IDS = new Set(hiddenMineralIds());
const COMPLETE_HOLD = 4; // 'complete' 배너 유지 시간(초)
const RESYNC_INTERVAL = 2; // alive 카운터 재동기화 주기
const PRUNE_INTERVAL = 3;

// main.js 는 콜백을 직접 대입한다(waves.onWaveStart = fn). 등록 메서드 방식과 함께 지원한다.
const DIRECT_HANDLER = {
  waveStart: 'onWaveStart',
  waveComplete: 'onWaveComplete',
  enemyKilled: 'onEnemyKilled',
  gameOver: 'onGameOver',
  leatherGained: 'onLeatherGained',
  roamerSpawn: 'onRoamerSpawn'
};

function num(value, fallback = 0) {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function weightedPick(rng, items, weightOf) {
  if (!items || items.length === 0) return null;
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return items[rng.int(0, items.length - 1)];
  let roll = rng.next() * total;
  for (const it of items) {
    roll -= Math.max(0, weightOf(it));
    if (roll <= 0) return it;
  }
  return items[items.length - 1];
}

export class WaveSystem {
  constructor({ scene, world, economy, audio, projectiles, stats, rng, difficulty, mode, onWaveStart, onWaveComplete, onEnemyKilled, onGameOver } = {}) {
    // 게임 모드 — 무한 모드에서만 300 웨이브마다 셀레스티얼이 다시 온다(계약 §4.58).
    this.mode = String(mode ?? 'solo');
    this.celestialSpawns = 0;
    this.scene = scene ?? null;
    this.world = world ?? null;
    this.economy = economy ?? null;
    this.audio = audio ?? null;
    this.projectiles = projectiles ?? null;
    this.stats = stats ?? null;
    this.rng = rng ?? createRNG('waves');
    this.difficulty = resolveDifficulty(difficulty);

    /** @type {import('./enemies.js').Enemy[]} */ this.enemies = [];
    this.phase = 'prep';
    this.wave = 0;
    this.timeLeft = num(WAVE_CONFIG.firstWavePrep, 45);
    this.spawnedTotal = 0;
    this.timeScale = 1;
    this.pattern = SPAWN_PATTERNS[0];
    this.maxAlive = num(WAVE_CONFIG.maxAlive, 220);
    /** 이번 웨이브 편성표(웨이브마다 다른 몬스터 구성) */
    this.roster = null;
    this.rosterId = null;
    this._lastRosterId = null;
    this._eliteCount = 0;
    this.notice = null;
    this.isBossWave = false;
    this.currentBossId = null;

    this._handlers = { waveStart: [], waveComplete: [], enemyKilled: [], gameOver: [] };
    if (onWaveStart) this.onWaveStart(onWaveStart);
    if (onWaveComplete) this.onWaveComplete(onWaveComplete);
    if (onEnemyKilled) this.onEnemyKilled(onEnemyKilled);
    if (onGameOver) this.onGameOver(onGameOver);

    this.reset();
  }

  // ── 콜백 등록 ──────────────────────────────────────────────────────────
  onWaveStart(cb) { if (typeof cb === 'function') this._handlers.waveStart.push(cb); return this; }
  onWaveComplete(cb) { if (typeof cb === 'function') this._handlers.waveComplete.push(cb); return this; }
  onEnemyKilled(cb) { if (typeof cb === 'function') this._handlers.enemyKilled.push(cb); return this; }
  onGameOver(cb) { if (typeof cb === 'function') this._handlers.gameOver.push(cb); return this; }

  _emit(name, payload) {
    for (const cb of this._handlers[name] ?? []) {
      try {
        cb(payload);
      } catch (err) {
        // UI 콜백 오류가 게임 루프를 멈추지 않게 한다.
        console.warn?.(`[waves] ${name} 콜백 오류:`, err);
      }
    }
    // main.js 처럼 직접 대입한 콜백은 계약 §4.9 의 인자 형태로 호출한다.
    const key = DIRECT_HANDLER[name];
    const direct = key ? this[key] : null;
    if (typeof direct !== 'function' || direct === WaveSystem.prototype[key]) return;
    try {
      if (name === 'waveStart') direct(payload.wave, payload.count);
      else if (name === 'waveComplete') direct(payload.wave, payload.rewards);
      else if (name === 'enemyKilled') direct(payload.enemy, payload);
      else direct(payload);
    } catch (err) {
      console.warn?.(`[waves] ${name} 콜백 오류:`, err);
    }
  }

  // ── 상태 ───────────────────────────────────────────────────────────────
  /** 현재 살아있는 적 수 */
  get alive() {
    return this._aliveCount ?? 0;
  }

  /** 살아있는 보스(가장 강한 개체) — HUD 보스 체력바가 읽는다. 없으면 null */
  get bossEnemy() {
    let best = null;
    for (const e of this.enemies ?? []) {
      if (!e || e.alive === false || !e.isBoss) continue;
      if (!best || num(e.maxHp, 0) > num(best.maxHp, 0)) best = e;
    }
    return best;
  }

  /** 이번 웨이브 편성표(웨이브마다 다른 주제) */
  get rosterInfo() {
    const r = this.roster;
    return r ? { id: r.id, name: r.name, icon: r.icon, desc: r.desc, elite: num(this._eliteCount, 0) } : null;
  }

  /** 이번 웨이브에서 아직 처리해야 할 적 (대기열 + 생존) */
  get remaining() {
    return this._queue.length + this.alive;
  }

  /** 이번 웨이브에 편성된 총 적 수 */
  get waveTotal() {
    return this._waveTotal ?? 0;
  }

  get perfect() {
    return !!this._perfect;
  }

  // ── 초기화 ─────────────────────────────────────────────────────────────
  reset() {
    this._clearEnemies();
    this.phase = 'prep';
    this.wave = 0;
    this.timeLeft = num(WAVE_CONFIG.firstWavePrep, 45);
    this.spawnedTotal = 0;
    this.timeScale = 1;
    this.notice = null;
    this.isBossWave = false;
    this.currentBossId = null;
    this.pattern = SPAWN_PATTERNS[0];
    this.roster = null;
    this.rosterId = null;
    this._lastRosterId = null;
    this._eliteCount = 0;
    this._queue = [];
    this._spawnTimer = 0;
    this._interval = num(WAVE_CONFIG.spawnInterval, 0.45);
    this._waveTotal = 0;
    this._aliveCount = 0;
    this._completeTimer = 0;
    this._resyncTimer = 0;
    this._pruneTimer = 0;
    this._waveBaseHp = Infinity;
    this._playerHpPrev = null;
    this._playerHpMin = Infinity;
    this._playerAlivePrev = true;
    this._playerDied = false;
    this._perfect = true;
    this._noDamage = true;
    this._lastTurrets = [];
    this.bossIndex = 0;

    this.wavesCleared = 0;
    this.highestWave = 0;
    this.kills = 0;
    this.turretKills = 0;
    this.salvations = 0;
    this.bossKills = 0;
    this.perfectWaves = 0;
    this.noDamageWaves = 0;
    this.deathlessWaves = 0;
    this.t1OnlyWaves = 0;
    this.noTurretWaves = 0;
    this.rewardHistory = [];
    /** @type {Record<string, number>} 원소별 처치 수 */ this.killsByElement = {};
    return this;
  }

  _clearEnemies() {
    for (const enemy of this.enemies ?? []) {
      enemy.alive = false;
      enemy.despawn?.();
    }
    if (this.enemies) this.enemies.length = 0;
    else this.enemies = [];
    this._aliveCount = 0;
  }

  // ── 웨이브 시작/종료 ───────────────────────────────────────────────────
  /** 준비 카운트다운을 건너뛰고 즉시 웨이브를 시작한다. */
  forceStart() {
    if (this.phase === 'gameover' || this.phase === 'combat') return false;
    this._startWave();
    return true;
  }

  _startWave() {
    this.wave += 1;
    const w = this.wave;
    this.phase = 'combat';
    this.timeLeft = 0;
    this.notice = null;
    this.pattern = this.rng.pick ? this.rng.pick(SPAWN_PATTERNS) : SPAWN_PATTERNS[this.rng.int(0, SPAWN_PATTERNS.length - 1)];
    this._queue = this._buildQueue(w);
    this._waveTotal = this._queue.length;
    this._interval = Math.max(0.12, num(WAVE_CONFIG.spawnInterval, 0.45) * Math.pow(0.985, w - 1));
    this._spawnTimer = 0;
    this._waveHpStart = num(this.world?.base?.hp, Infinity);
    this._playerHpMin = Infinity;
    this._playerDied = false;
    this._perfect = true;
    this._noDamage = true;

    if (w > this.highestWave) {
      this.highestWave = w;
      this.stats?.set?.('highestWave', w);
    }
    this.audio?.play?.(this.isBossWave ? 'boss' : 'waveStart');
    this._emit('waveStart', {
      wave: w,
      count: this._waveTotal,
      pattern: this.pattern,
      isBoss: this.isBossWave,
      bossId: this.currentBossId,
      roster: this.rosterInfo,
      elite: num(this._eliteCount, 0)
    });
  }

  _typePool(wave) {
    const pool = ENEMY_TYPES.filter((t) => num(t.minLevel, 1) <= wave);
    return pool.length > 0 ? pool : [ENEMY_TYPES[0]];
  }

  /** 편성표가 정한 종류 안에서만 고른다(해금된 종류만). 후보가 비면 전체 풀로 되돌린다. */
  _rosterPool(roster, wave) {
    const ids = Array.isArray(roster?.types) ? roster.types : [];
    const pool = ids.map((id) => ENEMY_TYPE_BY_ID[id]).filter((t) => t && num(t.minLevel, 1) <= wave);
    return pool.length > 0 ? pool : this._typePool(wave);
  }

  /**
   * 웨이브별 적 편성 — 웨이브 편성표(WAVE_ROSTERS)가 주제·마릿수·개체 강화를 정하고,
   * 그 안에서 종류를 가중 추첨한다. 같은 웨이브는 항상 같은 주제이고 연속 웨이브는 서로 다르다.
   * 정예(roster.elite)는 무리 사이에 고르게 섞이고, 보스 웨이브는 친위대 + 마지막에 보스 1마리.
   */
  _buildQueue(wave) {
    const cfg = WAVE_CONFIG;
    const bossEvery = num(cfg.bossEvery, 10);
    this.isBossWave = bossEvery > 0 && wave % bossEvery === 0;
    // 최종 웨이브(30 · 60 · 90 …) — 셀레스티얼이 강림한다
    const finalWave = Math.max(0, Math.round(num(cfg.finalWave, 0)));
    this.isFinalBossWave = finalWave > 0 && wave % finalWave === 0;
    if (this.isFinalBossWave) this.isBossWave = true;
    // 무한 모드 — 300 웨이브마다 셀레스티얼 강림(등장할 때마다 +35%, 계약 §4.58)
    const endlessEvery = Math.max(0, Math.round(num(cfg.endlessCelestialEvery, 300)));
    const endlessBoss = this.mode === 'endless' && endlessEvery > 0 && wave % endlessEvery === 0;
    if (endlessBoss) this.isBossWave = true;
    this.currentBossId = null;
    this.currentBossIsFinal = false;
    const roster = waveRoster(wave, { prevId: this._lastRosterId, boss: this.isBossWave });
    this.roster = roster;
    this.rosterId = roster?.id ?? null;
    this._lastRosterId = this.rosterId;
    // 마릿수 상한 — 웨이브 100 이어도 한 웨이브가 감당 가능한 수로 묶인다(계약 §4.58)
    const maxCount = Math.max(8, Math.round(num(cfg.maxCount, 240) * num(this.difficulty.countMult, 1)));
    const count = Math.min(
      maxCount,
      Math.max(
        1,
        Math.round(
          num(cfg.baseCount, 6) *
            Math.pow(num(cfg.countGrowth, 1.13), wave - 1) *
            num(this.difficulty.countMult, 1) *
            num(roster?.countMult, 1)
        )
      )
    );
    const mobCount = this.isBossWave ? Math.max(1, Math.round(count * 0.75)) : count;
    const pool = this._rosterPool(roster, wave);
    // 편성표 가중치 × (새로 해금된 종류가 조금 더 자주)
    const weightOf = (t) => num(roster?.weight?.[t.id], 1) / (1 + Math.max(0, wave - num(t.minLevel, 1)) * 0.06);
    const eliteCount = Math.max(0, Math.min(Math.max(0, mobCount - 1), Math.round(num(roster?.elite, 0))));
    const eliteAt = new Set();
    for (let k = 0; k < eliteCount; k++) {
      eliteAt.add(Math.min(mobCount - 1, Math.floor((mobCount * (k + 1)) / (eliteCount + 1))));
    }
    const queue = [];
    for (let i = 0; i < mobCount; i++) {
      const type = weightedPick(this.rng, pool, weightOf) ?? pool[0];
      queue.push({ typeId: type.id, isBoss: false, elite: eliteAt.has(i), mods: roster?.mods ?? null });
    }
    if (this.isBossWave) {
      const celestial = BOSS_TYPES.find((b) => b.id === 'celestial') ?? null;
      const finalBoss = this.isFinalBossWave || endlessBoss ? celestial : null;
      const boss = finalBoss ?? BOSS_TYPES[this.bossIndex % BOSS_TYPES.length];
      // 최종보스는 로테이션을 소모하지 않는다
      if (!finalBoss) this.bossIndex = (this.bossIndex + 1) % BOSS_TYPES.length;
      this.currentBossId = boss.id;
      this.currentBossIsFinal = !!finalBoss;
      // 무한 모드 차수마다 +35% — 등장할 때마다 강해진다.
      let bossType = null;
      if (endlessBoss && boss) {
        const n = Math.max(0, this.celestialSpawns);
        // 체력은 등장마다 +35%(요청 그대로), 공격력은 완만하게(+12% · 최대 ×6), 보상은 +25%.
        //  후반 웨이브에서 기지가 한 방에 무너지지 않으면서 업그레이드 여지를 남긴다(계약 §4.65).
        const growth = Math.pow(num(cfg.endlessCelestialGrowth, 1.35), n);
        const atkGrowth = Math.min(
          num(cfg.endlessCelestialAttackCap, 6),
          Math.pow(num(cfg.endlessCelestialAttackGrowth, 1.12), n)
        );
        const goldGrowth = Math.pow(num(cfg.endlessCelestialGoldGrowth, 1.25), n);
        const atk = Math.max(1, Math.round(num(boss.attack, num(boss.damage, 1200)) * atkGrowth));
        bossType = {
          ...boss,
          name: n > 0 ? `${boss.name} +${n}` : boss.name,
          hp: Math.max(1, Math.round(num(boss.hp, 5000000) * growth)),
          attack: atk,
          damage: atk,
          gold: Math.max(1, Math.round(num(boss.gold, 250000) * goldGrowth)),
          endlessCount: n + 1
        };
        this.celestialSpawns = n + 1;
        this._emit('celestial', { count: this.celestialSpawns, wave, hp: bossType.hp, attack: bossType.attack, gold: bossType.gold });
      }
      queue.push({ typeId: boss.id, isBoss: true, type: bossType }); // 보스는 마지막에 등장
    } else {
      this.rng.shuffle?.(queue);
    }
    this._eliteCount = eliteCount;
    return queue;
  }

  /**
   * 시설(몬스터 소환문)이 부르는 즉석 소환 — 웨이브 큐/진행과 무관하다.
   * 처치하면 골드·킬·업적은 정상 집계되지만 `fromTower` 로 표시해 웨이브 정산(_aliveCount)에서는 제외한다.
   * 티어가 높을수록 강한 종류가 나온다(웨이브 값을 티어만큼 밀어서 스케일).
   */
  spawnAt(x, z, opts = {}) {
    if (this.phase === 'gameover') return null;
    if (!Array.isArray(this.enemies) || this.enemies.length >= this.maxAlive) return null;
    const tier = Math.max(1, Math.min(7, Math.floor(num(opts.tier, 1))));
    const wave = Math.max(1, Math.floor(num(opts.wave ?? this.wave, num(this.wave, 1)) + (tier - 1) * 2));
    const pool = this._typePool(wave);
    const idxBase = Math.floor(((tier - 1) / 6) * Math.max(0, pool.length - 1));
    const idx = Math.min(pool.length - 1, idxBase + Math.floor(this.rng.next() * 2));
    const type = pool[idx] ?? pool[0] ?? ENEMY_TYPES[0];
    // waves.js 는 three 를 import 하지 않는다 — spawnEnemy 는 x/y/z 만 있으면 된다(Vector3.copy 호환)
    const position = { x: num(x), y: num(this.world?.getHeight?.(num(x), num(z)), 0), z: num(z) };
    const enemy = spawnEnemy({
      scene: this.scene,
      world: this.world,
      rng: this.rng,
      wave,
      difficulty: this.difficulty,
      typeId: opts.typeId ?? type?.id,
      isBoss: !!opts.isBoss,
      portals: this.world?.portals ?? null,
      pattern: 'cluster',
      position,
      callbacks: {
        awardGold: (gold, e, info) => this._awardKillGold(gold, e, info),
        onDeath: (e, info) => this._handleEnemyDeath(e, info),
        spawnMinion: (boss, count) => this._summonMinions(boss, count),
        onBaseDamage: (amount, e) => this._onBaseHit(amount, e)
      }
    });
    if (!enemy) return null;
    enemy.fromTower = true;
    enemy.spawnerTier = tier;
    this.enemies.push(enemy);
    this.spawnedTotal += 1;
    return enemy;
  }

  /**
   * 지형 야생 몬스터(로밍) 소환 — 지역 편성표(REGION_MONSTERS)가 정한 종류를 플레이어 주변에 띄운다.
   * 웨이브 정산과 완전히 무관하다: fromTower(=로밍)로 표시해 _aliveCount·큐·완료 판정에 끼지 않는다.
   * 처치하면 골드·킬·가죽은 정상 집계된다(가죽은 enemy.leatherDrop 확률표를 쓴다).
   */
  spawnRoamer(opts = {}) {
    const roster = regionMonsterRoster(opts.regionId) ?? null;
    if (!roster) return null;
    if (this.phase === 'gameover') return null;
    if (!Array.isArray(this.enemies) || this.enemies.length >= this.maxAlive) return null;
    const typeId = opts.typeId ?? roster.types?.[0]?.id ?? null;
    const wave = Math.max(1, Math.floor(num(opts.wave ?? roster.power, roster.power ?? this.wave)));
    const position = { x: num(opts.x), y: num(this.world?.getHeight?.(num(opts.x), num(opts.z)), 0), z: num(opts.z) };
    const enemy = spawnEnemy({
      scene: this.scene,
      world: this.world,
      rng: this.rng,
      wave,
      difficulty: this.difficulty,
      typeId,
      isBoss: false,
      portals: null,
      pattern: 'cluster',
      position,
      elite: Boolean(opts.elite) && !opts.noElite,
      callbacks: {
        awardGold: (gold, e, info) => this._awardKillGold(gold, e, info),
        onDeath: (e, info) => this._handleEnemyDeath(e, info),
        onBaseDamage: (amount, e) => this._onBaseHit(amount, e)
      }
    });
    if (!enemy) return null;
    // 웨이브 정산 제외 플래그(시설 소환과 동일) — 큐/alive/_waveTotal 은 건드리지 않는다.
    enemy.fromTower = true;
    enemy.spawnerKind = 'region';
    enemy.roaming = true;
    enemy.regionId = roster.id;
    enemy.spawnerTier = Math.max(1, Math.min(7, Math.floor(num(roster.tier, 1))));
    enemy.leatherDrop = enemy.type?.leather ?? null;
    this.enemies.push(enemy);
    this.roamersSpawned = (this.roamersSpawned ?? 0) + 1;
    this._emit('roamerSpawn', { enemy, regionId: roster.id, typeId: enemy.typeId });
    return enemy;
  }

  _spawnEntry(entry) {
    const enemy = spawnEnemy({
      scene: this.scene,
      world: this.world,
      rng: this.rng,
      wave: this.wave,
      difficulty: this.difficulty,
      typeId: entry.typeId,
      type: entry.type ?? null,
      isBoss: !!entry.isBoss,
      portals: this.world?.portals ?? null,
      pattern: this.pattern,
      mods: entry.mods ?? this.roster?.mods ?? null,
      elite: !!entry.elite,
      rosterId: this.rosterId,
      callbacks: {
        awardGold: (gold, e, info) => this._awardKillGold(gold, e, info),
        onDeath: (e, info) => this._handleEnemyDeath(e, info),
        spawnMinion: (boss, count) => this._summonMinions(boss, count),
        onBaseDamage: (amount, e) => this._onBaseHit(amount, e)
      }
    });
    if (!enemy) return null;
    // 문에서 튀어나온 순간 소환문이 번쩍인다(보스는 크게).
    this.world?.portalField?.flashNearest?.(enemy.position.x, enemy.position.z, enemy.isBoss ? 1.5 : 0.55);
    this.enemies.push(enemy);
    this.spawnedTotal += 1;
    this._aliveCount += 1;
    return enemy;
  }

  _summonMinions(boss, count = 3) {
    const n = Math.max(1, Math.floor(num(count, 3)));
    const wave = Math.max(1, this.wave - 1); // 소환수는 한 단계 약하게
    const origin = boss?.position ?? null;
    for (let i = 0; i < n; i++) {
      const type = this.rng.pick?.(this._typePool(this.wave)) ?? ENEMY_TYPES[0];
      let position = null;
      if (origin) {
        const a = this.rng.next() * Math.PI * 2;
        const r = 2.5 + this.rng.next() * 3;
        position = origin.clone();
        position.x += Math.cos(a) * r;
        position.z += Math.sin(a) * r;
      }
      const enemy = spawnEnemy({
        scene: this.scene,
        world: this.world,
        rng: this.rng,
        wave,
        difficulty: this.difficulty,
        typeId: type.id,
        isBoss: false,
        portals: this.world?.portals ?? null,
        pattern: 'cluster',
        mods: this.roster?.mods ?? null,
        position,
        callbacks: {
          awardGold: (gold, e, info) => this._awardKillGold(gold, e, info),
          onDeath: (e, info) => this._handleEnemyDeath(e, info),
          onBaseDamage: (amount, e) => this._onBaseHit(amount, e)
        }
      });
      if (!enemy) continue;
      this.enemies.push(enemy);
      this.spawnedTotal += 1;
      this._aliveCount += 1;
      this._waveTotal += 1;
    }
    this.audio?.play?.('boss');
    return n;
  }

  _awardKillGold(gold, enemy, info) {
    const base = Math.max(0, num(gold ?? enemy?.gold));
    const amount = Math.max(0, Math.round(base * num(this.difficulty.goldMult, 1)));
    if (amount > 0) {
      this.economy?.addGold?.(amount);
      this.stats?.track?.('goldEarned', amount);
    }
    this._awardKillLeather(enemy);
    return amount;
  }

  /**
   * 처치 시 가죽 지급 — 모든 킬이 이 한 곳을 지난다(웨이브 · 소환문 · 로밍).
   *  · 야생 몬스터: 자기 종의 leather 표(확률/수량)
   *  · 웨이브 몬스터: 최소 미네랄 티어에 맞춘 낮은 확률(22%)
   *  · 히든 지역 몬스터: 표에 적힌 보너스 광물까지 떨군다
   */
  _awardKillLeather(enemy) {
    if (!enemy || !this.economy?.addLeather) return null;
    // 지형 야생 몬스터 — 표(REGION_ENEMY_TYPES)의 가죽 확률표 + 히든 지역 보너스 광물
    if (enemy.roaming) {
      const loot = regionMonsterLoot(enemy.type, () => this.rng.next());
      if (loot.mineral?.id) {
        this.economy.addMineral?.(loot.mineral.id, loot.mineral.amount);
        this.stats?.track?.('mineralsMined', loot.mineral.amount);
        this._emit('mineralGained', { id: loot.mineral.id, amount: loot.mineral.amount, enemy });
      }
      if (loot.leather?.id) {
        this.economy.addLeather(loot.leather.id, loot.leather.amount);
        this.stats?.track?.('leatherGathered', loot.leather.amount);
        this._emit('leatherGained', { id: loot.leather.id, amount: loot.leather.amount, enemy });
        return loot.leather;
      }
      return null;
    }
    // 웨이브 · 소환문 몬스터 — 최소 미네랄 티어에 맞춘 낮은 확률
    const spec = enemy.leatherDrop ?? waveEnemyLeather(enemy.type);
    if (!spec?.id) return null;
    const chance = Math.max(0, Math.min(1, num(spec.chance, 0)));
    if (this.rng.next() >= chance) return null;
    const min = Math.max(1, Math.floor(num(spec.min, 1)));
    const max = Math.max(min, Math.floor(num(spec.max, min)));
    const amount = min + Math.floor(this.rng.next() * (max - min + 1));
    this.economy.addLeather(spec.id, amount);
    this.stats?.track?.('leatherGathered', amount);
    this._emit('leatherGained', { id: spec.id, amount, enemy });
    return { id: spec.id, amount };
  }

  _onBaseHit(amount, enemy) {
    this._perfect = false;
    this._noDamage = false;
    this.audio?.play?.('baseHit');
  }

  /**
   * 비살상 구원 — 꿈나무 전용. 처치로 집계하지 않고 전장에서 사라진다.
   * 웨이브 진행에는 처치와 동일하게 반영되지만 kills 는 증가하지 않는다.
   */
  salvation(enemy, { source = 'player', goldMult = 0.5 } = {}) {
    if (!enemy || !enemy.alive || enemy._waveCredited) return null;
    enemy._waveCredited = true;
    if (!enemy.fromTower) this._aliveCount = Math.max(0, this._aliveCount - 1);
    this.salvations = (this.salvations ?? 0) + 1;
    this.stats?.track?.('salvations', 1);
    const gained = Math.max(0, Math.round((Number(enemy.gold) || 0) * goldMult));
    if (gained > 0) {
      this.economy?.addGold?.(gained);
      this.stats?.track?.('goldEarned', gained);
    }
    enemy.alive = false;
    enemy.despawn?.();
    this._emit('enemySaved', { enemy, gold: gained, source, salvations: this.salvations });
    return { ok: true, gold: gained, salvations: this.salvations };
  }

  _handleEnemyDeath(enemy, info = {}) {
    if (!enemy || enemy._waveCredited) return;
    enemy._waveCredited = true;
    // 소환문이 부른 몬스터는 웨이브 정산에서 제외한다(웨이브가 막히지 않게).
    if (!enemy.fromTower) this._aliveCount = Math.max(0, this._aliveCount - 1);
    const source = info.source ?? enemy.killer ?? 'player';
    const element = info.element ?? enemy.deathElement ?? null;
    // 계약 §4.11: kills = 총 적 처치 수, turretKills = 그중 포탑이 처치한 수(부분집합).
    this.kills += 1;
    if (source === 'turret') this.turretKills += 1;
    if (enemy.isBoss) {
      this.bossKills += 1;
      this.stats?.track?.('bossKills', 1);
    }
    if (element) this.killsByElement[element] = (this.killsByElement[element] ?? 0) + 1;
    const st = this.stats;
    if (st) {
      st.track('kills', 1);
      if (source === 'turret') st.track('turretKills', 1);
      if (element) st.track('elementsKills', 1);
      if (enemy.roaming) st.track('roamersKilled', 1);
    }
    this.audio?.play?.(enemy.isBoss ? 'levelup' : 'enemyDeath');
    this._emit('enemyKilled', {
      enemy,
      source,
      element,
      gold: info.gold ?? enemy.gold,
      isBoss: enemy.isBoss,
      kills: this.kills,
      turretKills: this.turretKills,
      bossKills: this.bossKills
    });
  }

  _pickMineral() {
    const maxTier = Math.min(5, 1 + Math.floor(this.wave / 6));
    const pool = MINERAL_TYPES.filter((m) => num(m.tier, 1) <= maxTier && !EXCLUSIVE_MINERAL_IDS.has(m.id));
    const fallback = MINERAL_TYPES.filter((m) => !EXCLUSIVE_MINERAL_IDS.has(m.id));
    return weightedPick(this.rng, pool.length ? pool : fallback, (m) => num(m.weight, 1)) ?? fallback[0];
  }

  _completeWave(ctx = {}) {
    this.phase = 'complete';
    this.wavesCleared += 1;
    const w = this.wave;
    const cfg = WAVE_CONFIG;
    const perfect = this._perfect;
    const perfectMult = perfect ? num(cfg.perfectBonus, 2) : 1;

    const goldBase = Math.round(num(cfg.rewardGold, 45) * (1 + 0.35 * (w - 1)) * num(this.difficulty.goldMult, 1));
    const woodBase = Math.round(num(cfg.rewardWood, 14) * (1 + 0.25 * (w - 1)));
    const mineralCount = Math.max(1, Math.round(num(cfg.rewardMineral, 1) * (1 + 0.1 * (w - 1))));
    const gold = goldBase * perfectMult;
    const wood = woodBase * perfectMult;
    const mineral = this._pickMineral();
    const mineralAmount = mineralCount * perfectMult;

    this.economy?.addGold?.(gold);
    this.economy?.addWood?.(wood);
    this.economy?.addMineral?.(mineral?.id, mineralAmount);

    const st = this.stats;
    st?.track?.('goldEarned', gold);
    st?.track?.('wavesCleared', 1);
    if (perfect) {
      this.perfectWaves += 1;
      st?.track?.('perfectWaves', 1);
    }
    if (this._noDamage) {
      this.noDamageWaves += 1;
      st?.track?.('noDamageWaves', 1);
    }
    if (!this._playerDied) {
      this.deathlessWaves += 1;
      st?.track?.('deathlessWaves', 1);
    }
    const turrets = (ctx.turrets ?? this._lastTurrets ?? []).filter(Boolean);
    if (turrets.length === 0) {
      this.noTurretWaves += 1;
      st?.track?.('noTurretWaves', 1);
    } else if (turrets.every((t) => num(t.tier, 1) === 1)) {
      this.t1OnlyWaves += 1;
      st?.track?.('t1OnlyWaves', 1);
    }

    const rewards = { gold, wood, mineral: { id: mineral?.id, amount: mineralAmount } };
    this.rewardHistory.push({ wave: w, perfect, ...rewards });
    if (this.rewardHistory.length > 100) this.rewardHistory.shift();
    this.notice = perfect ? `웨이브 ${w} 완료 — 완벽 방어!` : `웨이브 ${w} 완료`;
    this.audio?.play?.('waveClear');
    this._completeTimer = COMPLETE_HOLD;
    this._emit('waveComplete', { wave: w, perfect, rewards, stats: this.snapshot() });
  }

  _beginPrep() {
    this.phase = 'prep';
    this.timeLeft = num(WAVE_CONFIG.prepTime, 30);
    this.notice = null;
  }

  _gameOver(reason) {
    if (this.phase === 'gameover') return;
    this.phase = 'gameover';
    this.notice = '기지가 파괴되었습니다';
    this.audio?.play?.('defeat');
    this._emit('gameOver', {
      wave: this.wave,
      reason,
      wavesCleared: this.wavesCleared,
      kills: this.kills,
      turretKills: this.turretKills,
      bossKills: this.bossKills,
      stats: this.snapshot()
    });
  }

  snapshot() {
    return {
      wave: this.wave,
      roster: this.rosterId,
      boss: this.currentBossId,
      eliteCount: num(this._eliteCount, 0),
      wavesCleared: this.wavesCleared,
      highestWave: this.highestWave,
      kills: this.kills,
      turretKills: this.turretKills,
      bossKills: this.bossKills,
      perfectWaves: this.perfectWaves,
      noDamageWaves: this.noDamageWaves,
      deathlessWaves: this.deathlessWaves,
      t1OnlyWaves: this.t1OnlyWaves,
      noTurretWaves: this.noTurretWaves
    };
  }

  // ── 메인 루프 ──────────────────────────────────────────────────────────
  update(dt, ctx = {}) {
    const d = Math.max(0, Math.min(num(dt, 0), 0.5));
    if (d <= 0) return;
    this._lastCtx = ctx;
    ctx.ui?.setPhase?.(this.phase, this.wave, this.timeLeft);

    const base = ctx.base ?? this.world?.base ?? null;
    const baseHp = num(base?.hp, Infinity);
    if (this.phase !== 'gameover' && baseHp <= 0) {
      this._gameOver('base');
      return;
    }

    this._trackPlayer(d, ctx);

    // 웨이브 단계와 무관한 시간 스케일(소환문 몬스터도 같은 속도로 움직인다)
    const scaled = d * Math.max(0, this.timeScale);

    switch (this.phase) {
      case 'prep': {
        this.timeLeft = Math.max(0, this.timeLeft - d);
        if (this.timeLeft <= 0) this._startWave();
        break;
      }
      case 'combat': {
        if (Number.isFinite(baseHp)) {
          if (!Number.isFinite(this._waveHpStart)) this._waveHpStart = baseHp;
          else if (baseHp < this._waveHpStart) {
            this._perfect = false;
            this._noDamage = false;
          }
        }
        if (scaled > 0) {
          this._tickSpawn(scaled);
          this._updateEnemies(scaled, ctx);
        }
        this._lastTurrets = ctx.turrets ?? this._lastTurrets ?? [];
        if (this._queue.length === 0 && this.alive <= 0) this._completeWave(ctx);
        break;
      }
      case 'complete': {
        this._completeTimer -= d;
        if (this._completeTimer <= 0) this._beginPrep();
        break;
      }
      default:
        break;
    }

    // 웨이브 단계와 무관하게 살아 있는 적(소환문 몬스터 등)은 계속 움직인다.
    if (this.phase !== 'combat' && this.phase !== 'gameover' && scaled > 0) {
      this._updateEnemies(scaled, ctx);
    }

    this._resyncTimer -= d;
    if (this._resyncTimer <= 0) {
      this._resyncTimer = RESYNC_INTERVAL;
      this._aliveCount = this._countAlive();
    }
    this._pruneTimer -= d;
    if (this._pruneTimer <= 0) {
      this._pruneTimer = PRUNE_INTERVAL;
      this._prune();
    }
  }

  _trackPlayer(dt, ctx) {
    const player = ctx.player;
    if (!player) return;
    const hp = Number(player.hp);
    if (Number.isFinite(hp)) {
      if (this._playerHpPrev !== null && hp < this._playerHpPrev) {
        const delta = this._playerHpPrev - hp;
        this.stats?.track?.('damageTaken', delta);
        if (this.phase === 'combat') this._noDamage = false;
      }
      this._playerHpPrev = hp;
      this._playerHpMin = Math.min(this._playerHpMin, hp);
    }
    if (player.alive === false && this._playerAlivePrev !== false) {
      this._playerDied = true;
      this.stats?.track?.('deaths', 1);
    }
    this._playerAlivePrev = player.alive;
  }

  _tickSpawn(scaledDt) {
    if (this._queue.length === 0) return;
    this._spawnTimer -= scaledDt;
    let guard = 0;
    while (this._spawnTimer <= 0 && this._queue.length > 0 && this.alive < this.maxAlive && guard < 16) {
      const entry = this._queue.shift();
      this._spawnTimer += this._interval;
      this._spawnEntry(entry);
      guard += 1;
    }
    if (this._spawnTimer < -1) this._spawnTimer = 0;
  }

  _updateEnemies(dt, ctx) {
    const enemyCtx = {
      base: ctx.base ?? this.world?.base ?? null,
      player: ctx.player ?? null,
      turrets: ctx.turrets ?? [],
      enemies: this.enemies,
      world: this.world,
      spawnMinion: (boss, count) => this._summonMinions(boss, count)
    };
    for (const enemy of this.enemies) {
      if (!enemy?.alive) continue;
      enemy.update(dt, enemyCtx);
    }
  }

  /** 웨이브 정산용 생존 수 — 소환문이 부른 몬스터(fromTower)는 제외한다. */
  _countAlive() {
    let n = 0;
    for (const e of this.enemies) if (e?.alive && !e.fromTower) n += 1;
    return n;
  }

  /** 죽은 적을 풀에 반납하고 배열에서 제거한다. */
  _prune() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (enemy?.alive) continue;
      this.enemies.splice(i, 1);
      enemy?.despawn?.();
    }
    this._aliveCount = this._countAlive();
  }

  /** 적 전체 제거(창세 스킬 등에서 사용) */
  clearEnemies() {
    this._clearEnemies();
  }

  // ── 저장 ───────────────────────────────────────────────────────────────
  toJSON() {
    return {
      phase: this.phase,
      wave: this.wave,
      timeLeft: this.timeLeft,
      spawnedTotal: this.spawnedTotal,
      salvations: this.salvations ?? 0,
      bossIndex: this.bossIndex,
      pattern: this.pattern?.id ?? null,
      roster: this.rosterId,
      wavesCleared: this.wavesCleared,
      highestWave: this.highestWave,
      kills: this.kills,
      turretKills: this.turretKills,
      bossKills: this.bossKills,
      perfectWaves: this.perfectWaves,
      noDamageWaves: this.noDamageWaves,
      deathlessWaves: this.deathlessWaves,
      t1OnlyWaves: this.t1OnlyWaves,
      noTurretWaves: this.noTurretWaves,
      killsByElement: { ...this.killsByElement }
    };
  }

  fromJSON(o) {
    const src = o && typeof o === 'object' ? o : {};
    this._clearEnemies();
    this._queue = [];
    this._spawnTimer = 0;
    this.phase = typeof src.phase === 'string' ? src.phase : 'prep';
    if (this.phase === 'combat') this.phase = 'prep'; // 적 배열은 저장하지 않으므로 전투는 준비로 되돌린다
    this.wave = Math.max(0, Math.floor(num(src.wave)));
    this.timeLeft = Math.max(0, num(src.timeLeft, num(WAVE_CONFIG.prepTime, 30)));
    this.spawnedTotal = Math.max(0, Math.floor(num(src.spawnedTotal)));
    this.salvations = Math.max(0, Math.floor(num(src.salvations)));
    this.bossIndex = Math.max(0, Math.floor(num(src.bossIndex))) % BOSS_TYPES.length;
    this.pattern = SPAWN_PATTERNS.find((p) => p.id === src.pattern) ?? this.pattern;
    this.rosterId = typeof src.roster === 'string' ? src.roster : null;
    this.roster = this.rosterId ? WAVE_ROSTER_BY_ID[this.rosterId] ?? null : null;
    this._lastRosterId = this.rosterId;
    this.wavesCleared = Math.max(0, Math.floor(num(src.wavesCleared)));
    this.highestWave = Math.max(0, Math.floor(num(src.highestWave)));
    this.kills = Math.max(0, Math.floor(num(src.kills)));
    this.turretKills = Math.max(0, Math.floor(num(src.turretKills)));
    this.bossKills = Math.max(0, Math.floor(num(src.bossKills)));
    this.perfectWaves = Math.max(0, Math.floor(num(src.perfectWaves)));
    this.noDamageWaves = Math.max(0, Math.floor(num(src.noDamageWaves)));
    this.deathlessWaves = Math.max(0, Math.floor(num(src.deathlessWaves)));
    this.t1OnlyWaves = Math.max(0, Math.floor(num(src.t1OnlyWaves)));
    this.noTurretWaves = Math.max(0, Math.floor(num(src.noTurretWaves)));
    this.killsByElement = {};
    if (src.killsByElement && typeof src.killsByElement === 'object') {
      for (const [k, v] of Object.entries(src.killsByElement)) this.killsByElement[k] = Math.max(0, Math.floor(num(v)));
    }
    this._completeTimer = 0;
    return this;
  }
}

export default WaveSystem;

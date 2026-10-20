// 요새의 수호자 — first-person player + input.
// Desktop only (keyboard + mouse, pointer lock). No gamepad support.

import * as THREE from 'three';
import { consume as keyConsume, isDown as keyDown } from '../keys.js';
import { MAP } from '../data.js';
import { createRNG } from '../utils/rng.js';

const DEG = Math.PI / 180;
const PITCH_LIMIT = 89 * DEG;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);

const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _vec = new THREE.Vector3();

/** True when the user is typing in a form field (chat / login) — movement keys must not be swallowed. */
function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable === true;
}

export class Input {
  constructor(domElement) {
    this.dom = domElement || null;
    this.enabled = true;
    this.lookWithoutLock = false; // set true to accumulate look deltas before pointer lock
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0, x: 0, y: 0 };
    this.lockError = null;
    this.onLockChange = null;
    this.onLockError = null;

    this._down = new Set();
    this._pressed = new Set();
    this._consumed = new Set();
    this._expiring = new Set();
    // Browser-only API: guarded so the module can be imported/constructed headlessly (tests).
    this._win = typeof window !== 'undefined' ? window : null;
    this._doc = typeof document !== 'undefined' ? document : null;
    this._bind();
  }

  // ── listeners ───────────────────────────────────────────────
  _bind() {
    this._handlers = [];
    if (!this._win || !this._doc) return;
    const opts = { passive: false };
    this._handlers = [
      [this._win, 'keydown', (e) => this._onKeyDown(e), opts],
      [this._win, 'keyup', (e) => this._onKeyUp(e), opts],
      [this._win, 'mousedown', (e) => this._onMouseDown(e), opts],
      [this._win, 'mouseup', (e) => this._onMouseUp(e), opts],
      [this._win, 'mousemove', (e) => this._onMouseMove(e), opts],
      [this._win, 'wheel', (e) => this._onWheel(e), opts],
      [this._win, 'blur', () => this._onBlur(), opts],
      [this._win, 'contextmenu', (e) => this._onContextMenu(e), opts],
      [this._doc, 'pointerlockchange', () => this._onLockChange(), opts],
      [this._doc, 'pointerlockerror', () => this._onLockError(), opts]
    ];
    for (const [target, type, fn, o] of this._handlers) target.addEventListener(type, fn, o);
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    if (isTypingTarget(this._doc?.activeElement)) return; // let chat / login forms work
    this.keys.add(e.code);
    if (!this._down.has(e.code)) {
      this._down.add(e.code);
      this._pressed.add(e.code);
    }
    if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault?.();
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
    this._down.delete(e.code);
  }

  _onMouseDown(e) {
    if (!this.enabled) return;
    if (isTypingTarget(this._doc?.activeElement)) return;
    // UI(패널·메뉴) 위에서 누른 클릭은 게임 입력이 아니다 — 커서로 버튼을 누를 때 휘두르지 않게 한다.
    if (this._isUiTarget(e)) return;
    // 포인터가 풀려 있으면(패널이 열려 커서가 보이는 상태) 클릭은 게임 입력이 아니다.
    // 첫 클릭은 캔버스 클릭 핸들러가 다시 잠그는 용도이므로 공격으로 이어지지 않는다.
    if (!this.locked && !this.lookWithoutLock) return;
    if (e.button === 0) this.mouse.left = true;
    if (e.button === 2) this.mouse.right = true;
  }

  /**
   * 게임 화면(캔버스) 밖에서 온 포인터 이벤트인가.
   * 포인터 잠금 중에는 모든 마우스 이벤트가 잠긴 요소(캔버스)로 오므로 전투 입력은 그대로 동작한다.
   */
  _isUiTarget(e) {
    const target = e?.target ?? null;
    if (!target || !this.dom) return false; // 대상 정보가 없는 합성 이벤트·DOM 없는 테스트는 막지 않는다
    return target !== this.dom;
  }

  _onMouseUp(e) {
    if (e.button === 0) this.mouse.left = false;
    if (e.button === 2) this.mouse.right = false;
  }

  _onMouseMove(e) {
    if (!this.enabled) return;
    if (!this.locked && !this.lookWithoutLock) return;
    const dx = e.movementX ?? 0;
    const dy = e.movementY ?? 0;
    this.mouse.dx += dx;
    this.mouse.dy += dy;
    if (Number.isFinite(e.clientX)) this.mouse.x = e.clientX;
    if (Number.isFinite(e.clientY)) this.mouse.y = e.clientY;
    this.onMove?.(dx, dy);
  }

  _onWheel(e) {
    if (!this.locked) return;
    this.mouse.wheel += Math.sign(e.deltaY || 0);
    if (this.enabled) e.preventDefault?.();
  }

  _onBlur() {
    // losing focus must not leave keys stuck down
    this.keys.clear();
    this._down.clear();
    this._pressed.clear();
    this.mouse.left = false;
    this.mouse.right = false;
  }

  _onContextMenu(e) {
    if (this.locked) e.preventDefault?.();
  }

  _onLockChange() {
    const locked = this.locked;
    if (!locked) this._onBlur();
    this.onLockChange?.(locked);
  }

  _onLockError() {
    this.lockError = 'pointerlockerror';
    this.onLockError?.(this.lockError);
  }

  // ── state queries ───────────────────────────────────────────
  isDown(code) {
    return this.keys.has(code);
  }

  /** True once per key press until update() clears the edge. */
  wasPressed(code) {
    return this._pressed.has(code) && !this._consumed.has(code);
  }

  /** One-shot key edge detection. */
  consumePressed(code) {
    if (!this.wasPressed(code)) return false;
    this._consumed.add(code);
    return true;
  }

  /** Returns the accumulated mouse state and resets the deltas. */
  consumeMouse() {
    const m = {
      dx: this.mouse.dx,
      dy: this.mouse.dy,
      wheel: this.mouse.wheel,
      left: this.mouse.left,
      right: this.mouse.right
    };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
    return m;
  }

  get locked() {
    return !!this.dom && !!this._doc && this._doc.pointerLockElement === this.dom;
  }

  requestPointerLock() {
    try {
      const p = this.dom?.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      this.lockError = 'requestPointerLock failed';
    }
  }

  exitPointerLock() {
    try {
      this._doc?.exitPointerLock?.();
    } catch {
      /* ignore */
    }
  }

  /**
   * Clears one-shot edges; call once per frame. An edge survives exactly one update() call, so
   * consumers that read `consumePressed()` either before or after update() in the same frame still
   * see it — but never twice.
   */
  update(dt) {
    void dt;
    const expiring = this._expiring;
    for (const code of expiring) {
      this._pressed.delete(code);
      this._consumed.delete(code);
    }
    expiring.clear();
    for (const code of this._pressed) expiring.add(code);
    return this;
  }

  dispose() {
    for (const [target, type, fn, o] of this._handlers || []) target.removeEventListener(type, fn, o);
    this._handlers = [];
    this.keys.clear();
    this._down.clear();
    this._pressed.clear();
    this._consumed.clear();
    this.exitPointerLock();
  }
}

export class Player {
  constructor({ camera, world, input, audio, stats, position, rng } = {}) {
    this.camera = camera || null;
    this.world = world || null;
    this.input = input || null;
    this.audio = audio || null;
    this.stats = stats || null;
    this.rng = rng || createRNG('player');

    const p = position || {};
    this.position = new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    this.velocity = new THREE.Vector3();
    this.spawnPoint = this.position.clone();
    this.yaw = 0;
    this.pitch = 0;

    this.radius = 0.5;
    this.eyeHeight = 1.7;
    this.height = 1.8;
    this.walkSpeed = 6.4;
    this.sprintSpeed = 10.2;
    this.accel = 13;
    this.friction = 10;
    this.airControl = 0.35;
    this.speedMult = 1; // fairy passives / gear multiply this
    this.gravity = 24;
    this.jumpSpeed = 7.2;
    // 점프 직후에는 날개 비행이 곧바로 시작되지 않게 잠깐 잠근다 — 지상에서는 점프가 먼저다(계약 §4.56).
    this._jumpLock = 0;
    // ── 앉기(F2) — Ctrl 을 누르고 있는 동안 낮은 자세 ──────────────
    this.sitting = false; // 의도(키 입력)
    this.sitAmount = 0; // 0=서 있음 · 1=완전히 앉음(부드럽게 보간)
    this.sitSpeedMult = 0.42; // 앉은 채 이동 속도 배율
    this.sitEyeDrop = 0.7; // 시야 높이 하강(m)
    this.sensitivity = 0.0022;

    this.maxHp = 100;
    this.hp = 100;
    this.maxMana = 100;
    this.mana = 100;
    this.manaRegen = 5.5; // while moving
    this.manaRegenIdle = 13; // while standing still
    this.manaRegenMult = 1; // fairy crown / relics raise this
    this.damageTakenMult = 1; // 전직 패시브(받는 피해 배율)
    this.maxStamina = 100;
    this.stamina = 100;
    this.staminaDrain = 26;
    this.staminaRegen = 17;

    this.alive = true;
    this.onGround = true;
    this.deathTimer = 0;
    this.respawnDelay = 4;
    this.invulnDuration = 0.5;

    this.shake = 0;
    this.onDamage = null; // (amount, source, player) => void — screen shake hook
    this.onDeath = null;
    this.onRespawn = null;

    this.bobTime = 0;
    this.landDip = 0;
    this.deathT = 0;
    this.lastWheel = 0;
    this.casting = false;

    this._invuln = 0;
    this._manaHold = 0;
    this._wasOnGround = true;

    // ── 요정의 날개 — 비행(장비 프로필은 main.js 가 setFlight() 로 넣는다)
    this.flight = {
      equipped: false,
      id: null,
      speed: 1,
      lift: 11,
      descend: 13,
      drain: 0,
      ceiling: 120,
      flap: 7
    };
    this.flying = false;
    this.flightRoll = 0;
    this._flyVy = 0;
    this.onFlightStart = null; // (player) => void
    this.onFlightEnd = null; // (player) => void
    this._snapCamera();
  }

  /**
   * 요정의 날개 프로필 적용 — { equipped, id, speed, lift, descend, drain, ceiling, flap }
   * 장비하지 않으면 비행이 즉시 꺼진다.
   */
  setFlight(profile = null) {
    const p = profile && typeof profile === 'object' ? profile : {};
    const f = this.flight;
    const pick = (v, fallback, lo, hi) => {
      const n = Number(v);
      return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
    };
    f.equipped = Boolean(p.equipped);
    f.id = f.equipped ? p.id ?? f.id ?? null : null;
    f.speed = pick(p.speed, f.speed, 0.5, 4);
    f.lift = pick(p.lift, f.lift, 1, 60);
    f.descend = pick(p.descend, f.descend, 1, 90);
    f.drain = pick(p.drain, f.drain, 0, 60);
    f.ceiling = pick(p.ceiling, f.ceiling, 5, 900);
    f.flap = pick(p.flap, f.flap, 1, 30);
    if (!f.equipped) {
      this.flying = false;
      this.flightRoll = 0;
    }
    return f;
  }

  /** 날개를 착용했고 살아 있는가 */
  get canFly() {
    return Boolean(this.flight.equipped) && this.alive;
  }

  /** 비행 중인가(상승/활공) */
  get airborne() {
    return this.flying && !this.onGround;
  }

  // ── update ──────────────────────────────────────────────────
  update(dt) {
    const d = clamp(dt || 0, 0, 0.1);
    if (this._invuln > 0) this._invuln = Math.max(0, this._invuln - d);

    const m = this.input?.consumeMouse?.();
    if (m) {
      this.lastWheel = m.wheel;
      if (this.alive) {
        this.yaw -= m.dx * this.sensitivity;
        this.pitch = clamp(this.pitch - m.dy * this.sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
      }
    }

    if (!this.alive) {
      this.deathT += d;
      this.deathTimer = Math.max(0, this.deathTimer - d);
      this.velocity.x *= Math.max(0, 1 - 6 * d);
      this.velocity.z *= Math.max(0, 1 - 6 * d);
      this._integrate(d);
      this._updateCamera(d);
      return this;
    }

    this._move(d);
    this._integrate(d);
    this._regen(d);
    this._updateCamera(d);
    return this;
  }

  _move(d) {
    const input = this.input;
    const forward = (keyDown(input, 'forward') ? 1 : 0) - (keyDown(input, 'back') ? 1 : 0);
    const strafe = (keyDown(input, 'right') ? 1 : 0) - (keyDown(input, 'left') ? 1 : 0);
    const hasInput = forward !== 0 || strafe !== 0;

    _vec.set(0, 0, 0);
    if (hasInput) {
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // yaw 0 looks down -Z
      _vec.x = -sin * forward + cos * strafe;
      _vec.z = -cos * forward - sin * strafe;
      _vec.normalize();
    }

    // ── 요정의 날개 — 이륙/마나 ────────────────────────────────
    // 점프 잠금이 풀리기 전에는 비행을 시작하지 않는다 — 지상에서 점프 키 = 점프(계약 §4.56).
    if (this._jumpLock > 0) this._jumpLock = Math.max(0, this._jumpLock - d);
    const fly = this.canFly;
    const holdingJump = keyDown(input, 'jump');
    const jumpLocked = this._jumpLock > 0;
    const ascend = Boolean(fly && holdingJump && !jumpLocked);
    const dive = Boolean(fly && keyDown(input, 'sprint'));
    const wantAir = Boolean(fly && !jumpLocked && (ascend || !this.onGround));
    if (wantAir && !this.flying) {
      this.flying = true;
      this.onGround = false;
      if (this.velocity.y < 0) this.velocity.y *= 0.35; // 낙하 → 활공 전환
      this.onFlightStart?.(this);
    }
    if (this.flying) {
      const drain = Number(this.flight.drain) || 0;
      if (drain > 0) {
        const cost = drain * d;
        if (this.mana >= cost) this.mana = Math.max(0, this.mana - cost);
        else this.mana = 0;
        if (this.mana <= 0) this._foldWings(); // 마나가 바닥나면 날개가 접힌다
      }
    }
    const flyMult = this.flying ? Number(this.flight.speed) || 1 : 1;

    // ── 앉기 — Ctrl(좌/우) 유지. 날개로 뜬 동안에는 앉지 않는다 ──────
    const wantsSit = Boolean(!this.flying && keyDown(input, 'sit'));
    this.sitting = wantsSit;
    this.sitAmount += ((wantsSit ? 1 : 0) - this.sitAmount) * (1 - Math.exp(-11 * d));
    if (this.sitAmount < 0.002) this.sitAmount = 0;
    else if (this.sitAmount > 0.998) this.sitAmount = 1;

    const wantsSprint = keyDown(input, 'sprint') && hasInput && this.stamina > 0.5;
    const sprinting = wantsSprint && this.onGround && this.sitAmount < 0.5;

    if (sprinting) this.stamina = Math.max(0, this.stamina - this.staminaDrain * d);
    else this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegen * (hasInput ? 0.6 : 1) * d);

    const speed =
      (sprinting ? this.sprintSpeed : this.walkSpeed) *
      (Number(this.speedMult) || 1) *
      flyMult *
      (1 - this.sitAmount * (1 - this.sitSpeedMult));
    const control = this.onGround ? 1 : this.flying ? 0.62 : this.airControl;
    const k = 1 - Math.exp(-(hasInput ? this.accel : this.friction) * control * d);
    this.velocity.x += (_vec.x * speed - this.velocity.x) * k;
    this.velocity.z += (_vec.z * speed - this.velocity.z) * k;

    // 앉은 상태에서는 점프하지 않는다 — 일어나서(달리기 키 해제) 점프한다.
    // 날개를 착용해도 지상에서는 언제나 점프가 먼저다(계약 §4.56 — 비행은 점프 뒤에 시작).
    if (keyConsume(input, 'jump') && this.onGround && this.sitAmount < 0.5) {
      this.velocity.y = this.jumpSpeed;
      this.onGround = false;
      this._jumpLock = 0.22;
      this.onJump?.(this);
    }

    // ── 요정의 날개 — 수직 속도 목표 + 기울기 ──────────────────
    if (this.flying) {
      const up = ascend ? 1 : 0;
      const down = dive ? 1 : 0;
      const hover = up || down ? 0 : this.flight.lift * 0.14; // 입력이 없으면 천천히 가라앉는다
      this._flyVy = up * this.flight.lift - down * this.flight.descend - hover;
      this.flightRoll += (-strafe * 0.3 - this.flightRoll) * (1 - Math.exp(-6 * d));
    } else {
      this._flyVy = 0;
      this.flightRoll += (0 - this.flightRoll) * (1 - Math.exp(-8 * d));
    }
  }

  /** 마나 소진/피격 — 날개를 접고 떨어진다 */
  _foldWings() {
    if (!this.flying) return false;
    this.flying = false;
    this._flyVy = 0;
    this.onFlightEnd?.(this);
    return true;
  }

  _integrate(d) {
    if (this.flying) {
      // 날개 — 입력에 따른 상승/하강(관성은 부드럽게)
      this.velocity.y += (this._flyVy - this.velocity.y) * (1 - Math.exp(-7 * d));
    } else {
      this.velocity.y -= this.gravity * d;
    }
    this.position.x += this.velocity.x * d;
    this.position.y += this.velocity.y * d;
    this.position.z += this.velocity.z * d;

    // resolveCollision 은 마지막에 y 를 지형 높이로 스냅한다 — 비행 중에는 고도를 유지해야 한다.
    const altitude = this.position.y;
    this.world?.resolveCollision?.(this.position, this.radius);
    if (this.flying) this.position.y = altitude;

    // 컨베이어벨트 위에 있으면 진행 방향으로 실려 간다.
    const belt = this.world?.conveyorPushAt?.(this.position) ?? null;
    this.onConveyor = Boolean(belt);
    if (belt) {
      this.position.x += (Number(belt.x) || 0) * d;
      this.position.z += (Number(belt.z) || 0) * d;
    }

    const half = (this.world?.bounds?.half ?? MAP.half) - this.radius;
    this.position.x = clamp(this.position.x, -half, half);
    this.position.z = clamp(this.position.z, -half, half);

    // 비행 상한(날개 티어별)
    const ceiling = this.flying ? Number(this.flight.ceiling) || Infinity : Infinity;
    if (this.position.y > ceiling) {
      this.position.y = ceiling;
      if (this.velocity.y > 0) this.velocity.y = 0;
    }

    const ground = this._groundHeight(this.position.x, this.position.z);
    if (this.position.y <= ground) {
      const impact = -this.velocity.y;
      if (!this._wasOnGround && impact > 6) this.landDip = Math.min(0.18, impact * 0.014);
      this.position.y = ground;
      if (this.velocity.y < 0) this.velocity.y = 0;
      // 상승 입력 중에는 지면에 닿아도 이륙 상태를 유지한다(호버링)
      const holding = this.flying && this._flyVy > 0.5;
      this.onGround = !holding;
      if (!holding) this._foldWings();
    } else {
      this.onGround = this.position.y - ground < 0.02;
      if (this.onGround) this._foldWings();
    }
    this._wasOnGround = this.onGround;
  }

  _groundHeight(x, z) {
    const h = this.world?.getHeight?.(x, z);
    if (typeof h !== 'number' || !Number.isFinite(h)) return 0;
    return h;
  }

  _regen(d) {
    if (this._manaHold > 0) {
      this._manaHold = Math.max(0, this._manaHold - d);
      return;
    }
    const rate = this.moving ? this.manaRegen : this.manaRegenIdle;
    this.mana = Math.min(this.maxMana, this.mana + rate * this.manaRegenMult * d);
  }

  _updateCamera(d) {
    const cam = this.camera;
    if (!cam) return;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    const moveAmt = clamp01(speed / this.walkSpeed);

    if (this.alive && this.onGround) this.bobTime += d * (5.2 + speed * 1.15);
    this.landDip += (0 - this.landDip) * (1 - Math.exp(-9 * d));
    this.shake *= Math.exp(-6.5 * d);
    if (this.shake < 0.0005) this.shake = 0;

    const bobY = this.alive && this.onGround ? Math.sin(this.bobTime * 2) * 0.032 * moveAmt : 0;
    const bobSide = this.alive && this.onGround ? Math.cos(this.bobTime) * 0.022 * moveAmt : 0;
    const roll =
      (this.alive && this.onGround ? Math.sin(this.bobTime) * 0.012 * moveAmt : 0) +
      (this.flying ? this.flightRoll : 0);

    const death = this.alive ? 0 : clamp01(this.deathT / 1.1);
    const eye = (this.eyeHeight - this.sitAmount * this.sitEyeDrop) * (1 - death * 0.62) + bobY - this.landDip;
    const shakeX = this.shake * this.rng.range(-0.12, 0.12);
    const shakeY = this.shake * this.rng.range(-0.1, 0.1);

    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    cam.position.set(
      this.position.x + cos * bobSide + shakeX,
      this.position.y + eye + shakeY,
      this.position.z - sin * bobSide
    );
    _euler.set(
      this.pitch + this.shake * this.rng.range(-0.03, 0.03),
      this.yaw,
      roll + (this.alive ? 0 : death * 0.75),
      'YXZ'
    );
    cam.quaternion.setFromEuler(_euler);
  }

  _snapCamera() {
    if (!this.camera) return;
    this.camera.position.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
    _euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(_euler);
  }

  // ── quaternions / queried state ─────────────────────────────
  get eyePosition() {
    if (this.camera) return this.camera.position.clone();
    return new THREE.Vector3(
      this.position.x,
      this.position.y + this.eyeHeight - this.sitAmount * this.sitEyeDrop,
      this.position.z
    );
  }

  get aimDirection() {
    if (!this.camera) {
      _vec.set(0, 0, -1);
      _vec.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      return _vec.clone().normalize();
    }
    return new THREE.Vector3(0, 0, -1)
      .applyQuaternion(this.camera.quaternion)
      .normalize();
  }

  get moving() {
    return Math.hypot(this.velocity.x, this.velocity.z) > 0.6;
  }

  get sprinting() {
    return keyDown(this.input, 'sprint') && this.moving;
  }

  get invulnerable() {
    return this._invuln > 0;
  }

  // ── damage / resources ──────────────────────────────────────
  takeDamage(amount, source) {
    const raw = Number(amount);
    if (!this.alive || !Number.isFinite(raw) || raw <= 0) return false;
    if (this._invuln > 0) return false;
    // 전직 패시브(기사는 덜 받고 광전사는 더 받는다)
    const n = Math.max(1, raw * (Number.isFinite(this.damageTakenMult) ? this.damageTakenMult : 1));

    this.hp = Math.max(0, this.hp - n);
    this._invuln = this.invulnDuration;
    this.shake = Math.min(1.4, this.shake + clamp(n / this.maxHp, 0.06, 0.9) * 1.6);
    this.stats?.track?.('damageTaken', n);
    this.onDamage?.(n, source, this);

    if (this.hp <= 0) this._die(source);
    return true;
  }

  _die(source) {
    this.alive = false;
    this.hp = 0;
    this.flying = false;
    this._flyVy = 0;
    this.deathT = 0;
    this.deathTimer = this.respawnDelay;
    this.casting = false;
    this.stats?.track?.('deaths', 1);
    this.onDeath?.(source, this);
  }

  heal(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return this.hp;
    this.hp = Math.min(this.maxHp, this.hp + v);
    return this.hp;
  }

  spendMana(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v < 0) return false;
    if (this.mana < v) return false;
    this.mana -= v;
    this._manaHold = 0.5; // short pause before regen restarts
    return true;
  }

  regen(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return this.mana;
    this.mana = Math.min(this.maxMana, this.mana + v);
    return this.mana;
  }

  respawn(position) {
    this.alive = true;
    this.deathT = 0;
    this.deathTimer = 0;
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    this.stamina = this.maxStamina;
    this._invuln = 1.5;
    this._manaHold = 0;
    this.velocity.set(0, 0, 0);
    this.landDip = 0;
    this.shake = 0;
    this.flying = false;
    this.flightRoll = 0;
    this._flyVy = 0;
    const p = position || this.spawnPoint;
    if (p) {
      this.position.set(p.x ?? this.position.x, p.y ?? this._groundHeight(p.x ?? 0, p.z ?? 0), p.z ?? this.position.z);
    }
    this._snapCamera();
    this.onRespawn?.(this);
    return this;
  }

  /** Teleport without the respawn side effects (used by debug / portals). */
  setPosition(x, y, z) {
    this.position.set(x, typeof y === 'number' ? y : this._groundHeight(x, z), z);
    this.velocity.set(0, 0, 0);
    this._snapCamera();
    return this;
  }

  // ── persistence ─────────────────────────────────────────────
  toJSON() {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      yaw: this.yaw,
      pitch: this.pitch,
      hp: this.hp,
      maxHp: this.maxHp,
      mana: this.mana,
      maxMana: this.maxMana,
      stamina: this.stamina,
      alive: this.alive
    };
  }

  fromJSON(o) {
    if (!o) return this;
    const p = o.position || {};
    if (Number.isFinite(p.x) && Number.isFinite(p.z)) {
      this.position.set(p.x, Number.isFinite(p.y) ? p.y : this._groundHeight(p.x, p.z), p.z);
    }
    if (Number.isFinite(o.yaw)) this.yaw = o.yaw;
    if (Number.isFinite(o.pitch)) this.pitch = clamp(o.pitch, -PITCH_LIMIT, PITCH_LIMIT);
    if (Number.isFinite(o.maxHp)) this.maxHp = o.maxHp;
    if (Number.isFinite(o.hp)) this.hp = clamp(o.hp, 0, this.maxHp);
    if (Number.isFinite(o.maxMana)) this.maxMana = o.maxMana;
    if (Number.isFinite(o.mana)) this.mana = clamp(o.mana, 0, this.maxMana);
    if (Number.isFinite(o.stamina)) this.stamina = clamp(o.stamina, 0, this.maxStamina);
    if (typeof o.alive === 'boolean') this.alive = o.alive;
    this.spawnPoint.copy(this.position);
    this._snapCamera();
    return this;
  }
}

export default Player;

// 몬스터/보스 월드 체력바 — 머리 위에 뜨는 체력 게이지.
// 개체마다 스프라이트를 만들지 않고 InstancedMesh 2장(배경 + 채움)으로 그린다.
// 수백 마리가 몰려도 draw call 2회로 끝나고, 빌보드는 카메라 쿼터니언을 복사한다.
import * as THREE from 'three';
import { HEALTH_BAR } from '../data.js';

const num = (value, fallback = 0) => {
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

const DEFAULT_CAPACITY = 256;

export class EnemyHealthBars {
  /**
   * @param {{ scene?: any, camera?: any, capacity?: number }} [opts]
   */
  constructor({ scene = null, camera = null, capacity = DEFAULT_CAPACITY } = {}) {
    this.scene = scene ?? null;
    this.camera = camera ?? null;
    this.capacity = Math.max(1, Math.floor(num(capacity, DEFAULT_CAPACITY)));
    this.range = num(HEALTH_BAR.range, 150);
    this.alwaysRange = num(HEALTH_BAR.alwaysRange, 55);
    /** 마지막 sync 에서 실제로 그린 체력바 수(디버그·검증용) */
    this.visibleCount = 0;

    this._matrix = new THREE.Matrix4();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._pos = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._color = new THREE.Color();

    this.group = new THREE.Group();
    this.group.name = 'enemyHealthBars';

    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.backMesh = this._makeMesh(0.8);
    this.backMesh.name = 'enemyHealthBarBack';
    this.fillMesh = this._makeMesh(0.96);
    this.fillMesh.name = 'enemyHealthBarFill';
    this.fillMesh.renderOrder = 13;
    this.group.add(this.backMesh, this.fillMesh);

    for (let i = 0; i < this.capacity; i++) {
      this.backMesh.setMatrixAt(i, this._zero);
      this.fillMesh.setMatrixAt(i, this._zero);
      this.backMesh.setColorAt(i, this._color.setHex(num(HEALTH_BAR.colors.back, 0x0d1117)));
      this.fillMesh.setColorAt(i, this._color.setHex(0xff6a6a));
    }
    this._flush();
    this.scene?.add?.(this.group);
  }

  _makeMesh(opacity) {
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity,
      depthWrite: false
    });
    const mesh = new THREE.InstancedMesh(this.geometry, material, this.capacity);
    mesh.frustumCulled = false; // 행렬을 직접 쓰므로 자동 바운딩을 믿지 않는다
    mesh.renderOrder = 12;
    mesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
    return mesh;
  }

  _flush() {
    this.backMesh.instanceMatrix.needsUpdate = true;
    this.fillMesh.instanceMatrix.needsUpdate = true;
    if (this.backMesh.instanceColor) this.backMesh.instanceColor.needsUpdate = true;
    if (this.fillMesh.instanceColor) this.fillMesh.instanceColor.needsUpdate = true;
  }

  /** 배경색 — 보스는 붉은 갈색, 정예는 금빛 갈색, 실드 보유는 푸른 갈색 */
  _backColor(enemy, boss, elite) {
    const colors = HEALTH_BAR.colors;
    if (boss) return num(colors.backBoss, 0x2a1206);
    if (elite) return num(colors.backElite, 0x2a2208);
    if (enemy.shielded || enemy.shieldTime > 0) return 0x14303f;
    return num(colors.back, 0x0d1117);
  }

  /** 채움색 — 위험할수록 붉게, 보스는 금색, 정예는 주황, 일반은 종족 색 */
  _fillColor(enemy, ratio, boss, elite) {
    const colors = HEALTH_BAR.colors;
    if (ratio <= num(HEALTH_BAR.lowRatio, 0.3)) return num(colors.low, 0xff5a5a);
    if (boss) return num(colors.boss, 0xffd75c);
    if (elite) return num(colors.elite, 0xffc24a);
    return num(enemy.type?.color, 0xff6a6a);
  }

  /**
   * 적 목록을 받아 체력바 인스턴스를 갱신한다.
   * - 카메라를 바라보는 빌보드 + 왼쪽부터 줄어드는 채움
   * - 보스 · 정예 · 피해를 입은 개체 · 가까운 개체만 그린다(멀고 멀쩡하면 숨김)
   * @returns {number} 그린 개수
   */
  sync(enemies = [], camera = null) {
    const cam = camera ?? this.camera;
    const list = Array.isArray(enemies) ? enemies : [];
    if (!cam || list.length === 0) {
      this.clear();
      return 0;
    }
    this._quat.copy(cam.quaternion);
    this._right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const camPos = cam.position;
    let i = 0;
    for (let k = 0; k < list.length && i < this.capacity; k++) {
      const enemy = list[k];
      if (!enemy || enemy.alive === false || !enemy.position) continue;
      const ex = num(enemy.position.x);
      const ey = num(enemy.position.y);
      const ez = num(enemy.position.z);
      const dist = Math.hypot(ex - num(camPos.x), ez - num(camPos.z));
      // 거대 보스는 타입별 표시 거리를 쓴다(모델이 커서 중심이 멀리 있어도 보여야 한다)
      const range = num(enemy.type?.barRange, this.range);
      if (dist > range) continue;
      const ratio = clamp01(num(enemy.hp, 0) / Math.max(1, num(enemy.maxHp, 1)));
      const boss = !!enemy.isBoss;
      const elite = !!enemy.elite;
      if (!boss && !elite && ratio >= 1 && dist > this.alwaysRange) continue;

      const width = num(enemy.barWidth, num(boss ? HEALTH_BAR.bossWidth : HEALTH_BAR.width, 1.6));
      const height = num(boss ? HEALTH_BAR.bossHeight : HEALTH_BAR.height, num(HEALTH_BAR.height, 0.19));
      const y = ey + num(enemy.barY, 3);

      // 배경(테두리 역할)
      this._pos.set(ex, y, ez);
      this._scale.set(width, height, 1);
      this._matrix.compose(this._pos, this._quat, this._scale);
      this.backMesh.setMatrixAt(i, this._matrix);
      this.backMesh.setColorAt(i, this._color.setHex(this._backColor(enemy, boss, elite)));

      // 채움 — 오른쪽 끝을 고정하고 왼쪽에서 줄어든다
      this._pos.addScaledVector(this._right, (ratio - 1) * width * 0.5);
      this._scale.set(Math.max(0.0001, width * ratio), height * 0.66, 1);
      this._matrix.compose(this._pos, this._quat, this._scale);
      this.fillMesh.setMatrixAt(i, this._matrix);
      this.fillMesh.setColorAt(i, this._color.setHex(this._fillColor(enemy, ratio, boss, elite)));
      i += 1;
    }
    // 이전 프레임에 켜져 있던 꼬리만 지운다(매 프레임 capacity 칸을 다 쓰지 않는다 — 계약 §4.62)
    const tail = Math.max(i, Math.min(this.capacity, Math.floor(Number(this._lastCount) || 0)));
    for (let k = i; k < tail; k++) {
      this.backMesh.setMatrixAt(k, this._zero);
      this.fillMesh.setMatrixAt(k, this._zero);
    }
    this.visibleCount = i;
    this._lastCount = i;
    this._flush();
    return i;
  }

  /** 체력바 전부 숨김(메뉴·정지 화면) */
  clear() {
    if (this.visibleCount === 0 && this._cleared) return 0;
    this._lastCount = 0;
    for (let i = 0; i < this.capacity; i++) {
      this.backMesh.setMatrixAt(i, this._zero);
      this.fillMesh.setMatrixAt(i, this._zero);
    }
    this.visibleCount = 0;
    this._cleared = true;
    this._flush();
    return 0;
  }

  dispose() {
    this.group?.parent?.remove?.(this.group);
    this.backMesh?.material?.dispose?.();
    this.fillMesh?.material?.dispose?.();
    this.geometry?.dispose?.();
    this.group = null;
    this.scene = null;
    this.visibleCount = 0;
  }
}

export default EnemyHealthBars;

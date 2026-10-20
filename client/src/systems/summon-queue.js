// 요새의 수호자 — 관리자 소환 지연 큐(계약 §4.67).
//
// 무기를 소환하자마자 장착하면, 그 무기의 메시·재질이 **그 프레임에 처음 렌더**되면서
// 셰이더 프로그램 컴파일이 몰려 화면이 몇백 ms 멈춘다.
// 그래서 소환은 ① 지급 → ② 예열(메시 생성 + renderer.compile) → ③ 장착 순서로 나누고,
// ②③ 을 프레임당 하나씩만 처리한다.
//
// 이 파일은 순수 로직이다(THREE/DOM 비의존) — 웹에서도 헤드리스 검사에서도 같은 코드를 쓴다.

export const SUMMON_LIMIT = 64;

export class SummonQueue {
  constructor({ limit = SUMMON_LIMIT } = {}) {
    /** @type {string[]} 아직 장착하지 못한 무기 id(먼저 넣은 것부터) */
    this.items = [];
    this.limit = Math.max(1, Math.floor(Number(limit) || SUMMON_LIMIT));
    this.done = 0;
    this.skipped = 0;
    /** 이미 예열한 id — 두 번 컴파일하지 않는다 */
    this.warmed = new Set();
  }

  get pending() {
    return this.items.length;
  }

  /** 소환 예약. 이미 줄 서 있으면 false. */
  push(id) {
    const key = String(id ?? '');
    if (!key || this.items.includes(key) || this.items.length >= this.limit) return false;
    this.items.push(key);
    return true;
  }

  has(id) {
    return this.items.includes(String(id ?? ''));
  }

  clear() {
    this.items.length = 0;
  }

  /**
   * 한 프레임에 **하나만** 처리한다.
   * @param {(id: string) => boolean} warm 메시를 만들고 셰이더를 예열한다(false 면 건너뜀)
   * @param {(id: string) => void} equip 예열이 끝난 뒤 장착한다
   * @returns {{id: string, equipped: boolean}|null}
   */
  step(warm, equip) {
    const id = this.items[0];
    if (id === undefined) return null;
    let ready = true;
    if (!this.warmed.has(id)) {
      try {
        ready = warm?.(id) !== false;
      } catch {
        ready = false;
      }
    }
    this.items.shift();
    if (!ready) {
      this.skipped += 1;
      return { id, equipped: false };
    }
    try {
      equip?.(id);
    } catch {
      this.skipped += 1;
      return { id, equipped: false };
    }
    this.warmed.add(id);
    this.done += 1;
    return { id, equipped: true };
  }

  summary() {
    return { pending: this.items.length, done: this.done, skipped: this.skipped, warmed: this.warmed.size };
  }
}

export function validateSummonQueue() {
  const errors = [];
  const q = new SummonQueue();
  if (q.push('a') !== true || q.push('a') !== false) errors.push('중복 예약을 막지 못한다');
  if (q.push('') !== false) errors.push('빈 id 를 받아들인다');
  const order = [];
  const warm = (id) => { order.push(`warm:${id}`); return true; };
  const equip = (id) => order.push(`equip:${id}`);
  const first = q.step(warm, equip);
  if (first?.id !== 'a' || first.equipped !== true) errors.push('예약을 처리하지 못한다');
  if (order.join(',') !== 'warm:a,equip:a') errors.push('예열 전에 장착했다');
  if (q.step(warm, equip) !== null) errors.push('빈 큐에서 무언가 처리했다');
  q.push('b');
  const failed = q.step(() => false, equip);
  if (failed?.equipped !== false) errors.push('예열 실패를 무시하고 장착했다');
  if (q.summary().skipped !== 1) errors.push('건너뛴 개수를 세지 않는다');
  q.push('c');
  q.step(warm, equip);
  q.push('c');
  const again = q.step(() => { throw new Error('다시 예열하면 안 된다'); }, equip);
  if (again?.equipped !== true) errors.push('예열된 무기를 다시 예열한다');
  const limited = new SummonQueue({ limit: 2 });
  limited.push('x'); limited.push('y');
  if (limited.push('z') !== false) errors.push('상한을 넘겨 받는다');
  return errors;
}

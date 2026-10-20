// 계약 §4.47 — 프레임 예산 지급 큐.
// 관리자 /무기전부 처럼 수십~수백 개를 한 프레임에 처리하면 메인 스레드가 묶여 화면이 멈춘 것처럼 보인다.
// 그래서 예산(기본 6ms)만큼만 처리하고 나머지는 다음 프레임으로 넘긴다.
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export class GrantQueue {
  constructor({ budgetMs = 6 } = {}) {
    this.budgetMs = budgetMs;
    this.items = [];
    this.handler = null;
    this.onDone = null;
    this.done = 0;
    this.total = 0;
    this.failed = 0;
    this.runs = 0;
  }

  get pending() { return this.items.length; }
  get active() { return this.items.length > 0; }

  /** items 를 순서대로 handler(item) 로 처리한다. onDone(done) 은 전부 끝났을 때 한 번. */
  enqueue(items, handler, { onDone = null, budgetMs = null } = {}) {
    this.items = [...(items ?? [])];
    this.handler = handler;
    this.onDone = onDone;
    this.done = 0;
    this.failed = 0;
    this.runs = 0;
    this.total = this.items.length;
    if (budgetMs !== null) this.budgetMs = Math.max(0, Number(budgetMs) || 0);
    if (!this.total) this._finish();
    return this.total;
  }

  /** 프레임마다 호출. 이번 프레임에 처리한 개수를 돌려준다. */
  step() {
    if (!this.items.length) return 0;
    const t0 = now();
    let n = 0;
    while (this.items.length) {
      const item = this.items.shift();
      try {
        this.handler?.(item, this);
      } catch (err) {
        // 한 항목이 실패해도 나머지는 계속 지급한다.
        this.failed += 1;
        console.warn('[grants] 항목 실패', item, err);
      }
      this.done += 1;
      n += 1;
      if (now() - t0 >= this.budgetMs) break;
    }
    this.runs += 1;
    if (!this.items.length) this._finish();
    return n;
  }

  /** 남은 항목을 버린다(게임 종료·월드 교체 시). */
  clear() {
    this.items = [];
    this.handler = null;
    this.onDone = null;
    this.total = 0;
    this.done = 0;
    return true;
  }

  _finish() {
    const cb = this.onDone;
    this.onDone = null;
    this.handler = null;
    try { cb?.(this.done, this); } catch (err) { console.warn('[grants] 완료 처리 오류', err); }
  }
}

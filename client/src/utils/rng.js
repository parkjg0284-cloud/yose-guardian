// 재현 가능한 시드 기반 난수. THREE 의존성 없음 (헤드리스 테스트 대상).

export function hashSeed(seed) {
  const str = String(seed ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(a) {
  let t = a >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed) {
    this.seed = seed;
    this.hash = hashSeed(seed);
    this._next = mulberry32(this.hash);
    this._count = 0;
  }

  next() {
    this._count++;
    return this._next();
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, max) {
    return Math.floor(this.range(min, max + 1 - 1e-9));
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  chance(p) {
    return this.next() < p;
  }

  pick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[this.int(0, arr.length - 1)];
  }

  pickMany(arr, n) {
    const copy = [...(arr || [])];
    this.shuffle(copy);
    return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
  }

  weightedPick(items, weightOf = (it) => it.weight ?? 1) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightOf(it));
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (const it of items) {
      roll -= Math.max(0, weightOf(it));
      if (roll <= 0) return it;
    }
    return items[items.length - 1];
  }

  gaussian() {
    // 이론상 0 이 연속으로 나오면 영원히 도는 루프였다 — 시도 횟수를 묶어 프리즈를 막는다.
    let u = 0;
    let v = 0;
    let guard = 0;
    while (u === 0 && guard++ < 64) u = this.next();
    guard = 0;
    while (v === 0 && guard++ < 64) v = this.next();
    const safeU = u > 0 ? u : 1e-12;
    return Math.sqrt(-2 * Math.log(safeU)) * Math.cos(2 * Math.PI * v);
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  fork(label) {
    return new RNG(`${this.seed}::${label}::${this._count}`);
  }
}

export function createRNG(seed) {
  return new RNG(seed);
}

export function normalizeSeed(seed) {
  if (seed === undefined || seed === null) return String(Math.floor(100000 + Math.random() * 900000));
  const s = String(seed).trim();
  if (s === '' || s === 'undefined' || s === 'null') return String(Math.floor(100000 + Math.random() * 900000));
  return s.slice(0, 24);
}

export default { hashSeed, mulberry32, RNG, createRNG, normalizeSeed };

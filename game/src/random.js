// Deterministic seeded random numbers (mulberry32) so the city, traffic and
// screenshot staging are identical for a given ?seed= value.

export class Random {
  constructor(seed = 1) {
    this.state = (seed >>> 0) || 1;
  }
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // Float in [min, max).
  range(min, max) { return min + this.next() * (max - min); }
  // Integer in [min, max] inclusive.
  int(min, max) { return Math.floor(this.range(min, max + 1)); }
  pick(list) { return list[Math.floor(this.next() * list.length)]; }
  chance(p) { return this.next() < p; }
  // A new Random derived from this one, for an independent stream.
  fork() { return new Random(Math.floor(this.next() * 0xffffffff)); }
}

// Parse ?seed= and ?shot= from the page URL. Defaults: seed 1, no shot.
export function readUrlParams() {
  const q = new URLSearchParams(window.location.search);
  const seed = Number.parseInt(q.get('seed') || '1', 10);
  return {
    seed: Number.isFinite(seed) ? seed : 1,
    shot: q.get('shot') || '',
  };
}

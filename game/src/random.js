// random.js — a small seeded random generator (mulberry32) so Port Solano is the
// same city on every visit, plus the range/pick helpers the builders use.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function rangeInt(rng, lo, hi) {
  return Math.floor(range(rng, lo, hi + 1));
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

export function chance(rng, p) {
  return rng() < p;
}

/** Deterministic PRNG + naming helpers for procedural sector content. */

/** Standard mulberry32 — small, fast, good enough distribution for content. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes integer sector coordinates and a world seed into one 32-bit seed. */
export function hashCoords(x: number, y: number, z: number, worldSeed: number): number {
  let h = worldSeed >>> 0;
  h = Math.imul(h ^ (x * 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (y * 0xc2b2ae35), 0x27d4eb2f);
  h = Math.imul(h ^ (z * 0x165667b1), 0x9e3779b1);
  h ^= h >>> 16;
  return h >>> 0;
}

export const SYLLABLES = ['KHE', 'VEL', 'ORA', 'TAU', 'MIR', 'SEN', 'DUV', 'ALK', 'RHO', 'ZEPH', 'CAL', 'IMB'];

export const pickFrom = <T,>(rand: () => number, items: T[]): T =>
  items[Math.floor(rand() * items.length) % items.length];

/** Two-syllable proper name, e.g. "KHEVEL". */
export const makeName = (rand: () => number): string => pickFrom(rand, SYLLABLES) + pickFrom(rand, SYLLABLES);

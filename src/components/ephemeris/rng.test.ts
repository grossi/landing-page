import { describe, expect, it } from 'vitest';
import { hashCoords, makeName, mulberry32, pickFrom, SYLLABLES } from 'components/ephemeris/rng';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(1234);
    const b = mulberry32(1234);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(Array.from({ length: 5 }, a)).not.toEqual(Array.from({ length: 5 }, b));
  });

  it('stays in [0, 1)', () => {
    const rand = mulberry32(0xdeadbeef);
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashCoords', () => {
  it('is deterministic and seed-dependent', () => {
    expect(hashCoords(3, -2, 7, 42)).toBe(hashCoords(3, -2, 7, 42));
    expect(hashCoords(3, -2, 7, 42)).not.toBe(hashCoords(3, -2, 7, 43));
  });

  // Guards the mirror-symmetry collision the original hash had, where
  // (x, -y, z) and (x, y, -z) generated identical sectors.
  it('separates every sector in a 17³ cube around the origin', () => {
    for (const seed of [0, 42, 0xdeadbeef]) {
      const seen = new Set<number>();
      for (let x = -8; x <= 8; x++)
        for (let y = -8; y <= 8; y++)
          for (let z = -8; z <= 8; z++) seen.add(hashCoords(x, y, z, seed));
      expect(seen.size).toBe(17 ** 3);
    }
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = hashCoords(-1000000, 999999, -5, 0xffffffff);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('pickFrom / makeName', () => {
  it('always picks an element of the list', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 200; i++) expect(SYLLABLES).toContain(pickFrom(rand, SYLLABLES));
  });

  it('builds names from two syllables', () => {
    const rand = mulberry32(99);
    for (let i = 0; i < 50; i++) {
      const name = makeName(rand);
      const pattern = new RegExp(`^(${SYLLABLES.join('|')})(${SYLLABLES.join('|')})$`);
      expect(name).toMatch(pattern);
    }
  });
});

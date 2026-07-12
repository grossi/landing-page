import { describe, expect, it } from 'vitest';
import {
  cellOf,
  diffSectors,
  parseSectorKey,
  sectorCenter,
  sectorKey,
} from 'engine/core/sectorGrid';

const SECTOR = 700;

describe('sectorKey / parseSectorKey', () => {
  it('round-trips including negative coordinates', () => {
    expect(sectorKey(-1, 0, 2)).toBe('-1,0,2');
    expect(parseSectorKey('-1,0,2')).toEqual([-1, 0, 2]);
  });
});

describe('cellOf', () => {
  it('floors positions into cells (negative side included)', () => {
    expect(cellOf({ x: 0, y: 0, z: 0 }, SECTOR)).toEqual({ x: 0, y: 0, z: 0, key: '0,0,0' });
    expect(cellOf({ x: 699, y: 0, z: 0 }, SECTOR).x).toBe(0);
    expect(cellOf({ x: 700, y: 0, z: 0 }, SECTOR).x).toBe(1);
    expect(cellOf({ x: -350, y: -0.1, z: -700 }, SECTOR)).toEqual({
      x: -1,
      y: -1,
      z: -1,
      key: '-1,-1,-1',
    });
  });
});

describe('sectorCenter', () => {
  it('matches the (c + 0.5) * sectorSize convention used by sector builds', () => {
    expect(sectorCenter(0, 0, 0, SECTOR)).toEqual({ x: 350, y: 350, z: 350 });
    expect(sectorCenter(-1, 2, 0, SECTOR)).toEqual({ x: -350, y: 1750, z: 350 });
  });
});

describe('diffSectors', () => {
  it('builds the full 3x3x3 window from a cold start', () => {
    const { cell, toBuild, toEvict } = diffSectors({ x: 0, y: 0, z: 0 }, SECTOR, 1, new Set());
    expect(cell.key).toBe('0,0,0');
    expect(toBuild).toHaveLength(27);
    expect(toBuild).toContain('0,0,0');
    expect(toBuild).toContain('-1,-1,-1');
    expect(toBuild).toContain('1,1,1');
    expect(toEvict).toHaveLength(0);
  });

  it('is a no-op while the position stays inside the same window', () => {
    const current = new Set(diffSectors({ x: 0, y: 0, z: 0 }, SECTOR, 1, new Set()).toBuild);
    const { toBuild, toEvict } = diffSectors({ x: 650, y: 10, z: 10 }, SECTOR, 1, current);
    expect(toBuild).toHaveLength(0);
    expect(toEvict).toHaveLength(0);
  });

  it('moving one cell +x builds the new x-plane and evicts the old one', () => {
    const current = new Set(diffSectors({ x: 0, y: 0, z: 0 }, SECTOR, 1, new Set()).toBuild);
    const { toBuild, toEvict } = diffSectors({ x: 750, y: 0, z: 0 }, SECTOR, 1, current);
    expect(toBuild).toHaveLength(9);
    expect(toBuild.every((k) => parseSectorKey(k)[0] === 2)).toBe(true);
    expect(toEvict).toHaveLength(9);
    expect(toEvict.every((k) => parseSectorKey(k)[0] === -1)).toBe(true);
  });

  it('keeps reserved (home) cells that are already active out of toBuild', () => {
    // Home cells sit in the active map with null content — from the diff's
    // point of view they are just present keys and must not be rebuilt.
    const current = new Set(['0,0,0', '0,-1,0', '1,0,1']);
    const { toBuild, toEvict } = diffSectors({ x: 10, y: 10, z: 10 }, SECTOR, 1, current);
    expect(toBuild).toHaveLength(27 - 3);
    for (const key of current) expect(toBuild).not.toContain(key);
    expect(toEvict).toHaveLength(0);
  });

  it('a long warp evicts everything and rebuilds the whole window', () => {
    const current = new Set(diffSectors({ x: 0, y: 0, z: 0 }, SECTOR, 1, new Set()).toBuild);
    const far = { x: 100 * SECTOR, y: -50 * SECTOR, z: 30 * SECTOR };
    const { cell, toBuild, toEvict } = diffSectors(far, SECTOR, 1, current);
    expect(cell.key).toBe('100,-50,30');
    expect(toBuild).toHaveLength(27);
    expect(toEvict).toHaveLength(27);
  });

  it('supports other active ranges', () => {
    const { toBuild } = diffSectors({ x: 0, y: 0, z: 0 }, SECTOR, 2, new Set());
    expect(toBuild).toHaveLength(125);
  });
});

import { describe, expect, it } from 'vitest';
import { getIcosphereTables, type IcosphereLevel } from 'engine/lod/icosphere';

const LEVELS: IcosphereLevel[] = [1, 2, 3, 4, 5, 6];

describe('getIcosphereTables', () => {
  it('produces 10 * 4^n + 2 vertices at every level', () => {
    for (const level of LEVELS) {
      const t = getIcosphereTables(level);
      const expected = 10 * 4 ** level + 2;
      expect(t.vertexCount).toBe(expected);
      expect(t.dirs.length).toBe(expected * 3);
    }
  });

  it('produces 20 * 4^n triangles at every level', () => {
    for (const level of LEVELS) {
      expect(getIcosphereTables(level).triIndex.length).toBe(3 * 20 * 4 ** level);
    }
  });

  it('produces unit-length directions (within 1e-6)', () => {
    for (const level of LEVELS) {
      const { dirs } = getIcosphereTables(level);
      for (let i = 0; i < dirs.length; i += 3) {
        const len = Math.hypot(dirs[i], dirs[i + 1], dirs[i + 2]);
        expect(Math.abs(len - 1)).toBeLessThan(1e-6);
      }
    }
  });

  it('nests vertices: level k dirs are exactly the first V(k)*3 floats of level k+1', () => {
    for (let k = 1; k < 6; k++) {
      const lo = getIcosphereTables(k as IcosphereLevel);
      const hi = getIcosphereTables((k + 1) as IcosphereLevel);
      expect(hi.dirs.subarray(0, lo.dirs.length)).toEqual(lo.dirs);
    }
  });

  it('dedupes edges to exactly 30 * 4^n pairs', () => {
    for (const level of LEVELS) {
      expect(getIcosphereTables(level).edgeIndex.length).toBe(2 * 30 * 4 ** level);
    }
  });

  it('has no duplicate unordered edge pairs and no degenerate edges', () => {
    for (const level of LEVELS) {
      const { edgeIndex, vertexCount } = getIcosphereTables(level);
      const seen = new Set<string>();
      for (let i = 0; i < edgeIndex.length; i += 2) {
        const a = edgeIndex[i];
        const b = edgeIndex[i + 1];
        expect(a).not.toBe(b);
        expect(a).toBeLessThan(vertexCount);
        expect(b).toBeLessThan(vertexCount);
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('every triangle edge appears in the edge index', () => {
    const { triIndex, edgeIndex } = getIcosphereTables(2);
    const edges = new Set<string>();
    for (let i = 0; i < edgeIndex.length; i += 2) {
      const a = edgeIndex[i];
      const b = edgeIndex[i + 1];
      edges.add(`${Math.min(a, b)}:${Math.max(a, b)}`);
    }
    for (let i = 0; i < triIndex.length; i += 3) {
      const [a, b, c] = [triIndex[i], triIndex[i + 1], triIndex[i + 2]];
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        expect(edges.has(`${Math.min(u, v)}:${Math.max(u, v)}`)).toBe(true);
      }
    }
  });

  it('memoizes: repeated calls return the same table instance', () => {
    expect(getIcosphereTables(3)).toBe(getIcosphereTables(3));
  });
});

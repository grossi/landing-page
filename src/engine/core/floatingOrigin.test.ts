import { describe, expect, it } from 'vitest';
import { computeRebase } from 'engine/core/floatingOrigin';
import { mulberry32 } from 'engine/core/rng';

const CELL = 6000;

describe('computeRebase', () => {
  it('returns null while every component is inside the threshold', () => {
    expect(computeRebase({ x: 0, y: 0, z: 0 }, CELL)).toBeNull();
    expect(computeRebase({ x: CELL - 1, y: -CELL + 1, z: 0.5 * CELL }, CELL)).toBeNull();
    // exactly at the threshold still holds (strict overshoot triggers)
    expect(computeRebase({ x: CELL, y: -CELL, z: CELL }, CELL)).toBeNull();
  });

  it('triggers when any single component exceeds the threshold', () => {
    expect(computeRebase({ x: CELL + 1, y: 0, z: 0 }, CELL)).not.toBeNull();
    expect(computeRebase({ x: 0, y: -CELL - 1, z: 0 }, CELL)).not.toBeNull();
    expect(computeRebase({ x: 0, y: 0, z: CELL * 5.3 }, CELL)).not.toBeNull();
  });

  it('respects a wider thresholdCells', () => {
    expect(computeRebase({ x: CELL * 1.5, y: 0, z: 0 }, CELL, 2)).toBeNull();
    expect(computeRebase({ x: CELL * 2.5, y: 0, z: 0 }, CELL, 2)).not.toBeNull();
  });

  it('returns an exact integer multiple of cellSize on every axis', () => {
    const delta = computeRebase({ x: CELL * 2.7, y: -CELL * 1.2, z: CELL * 0.4 }, CELL)!;
    for (const c of [delta.x, delta.y, delta.z]) {
      expect(Number.isInteger(c / CELL)).toBe(true);
    }
    expect(delta.x).toBe(2 * CELL);
    expect(delta.y).toBe(-2 * CELL); // floor(-1.2) = -2
    expect(delta.z).toBe(0);
  });

  it('leaves every local component in [0, cellSize) after applying the delta', () => {
    const rand = mulberry32(77);
    for (let i = 0; i < 200; i++) {
      const local = {
        x: (rand() - 0.5) * CELL * 40,
        y: (rand() - 0.5) * CELL * 40,
        z: (rand() - 0.5) * CELL * 40,
      };
      const delta = computeRebase(local, CELL);
      if (!delta) continue;
      for (const axis of ['x', 'y', 'z'] as const) {
        const after = local[axis] - delta[axis];
        expect(after).toBeGreaterThanOrEqual(0);
        expect(after).toBeLessThan(CELL);
      }
    }
  });

  it('accumulates no drift over a 10,000-step random walk', () => {
    const rand = mulberry32(4242);
    const origin = { x: 0, y: 0, z: 0 };
    const local = { x: 0, y: 0, z: 0 };
    const absolute = { x: 0, y: 0, z: 0 }; // independently summed doubles
    for (let i = 0; i < 10_000; i++) {
      const step = {
        x: (rand() - 0.5) * 0.8 * CELL,
        y: (rand() - 0.5) * 0.8 * CELL,
        z: (rand() - 0.5) * 0.8 * CELL,
      };
      for (const axis of ['x', 'y', 'z'] as const) {
        local[axis] += step[axis];
        absolute[axis] += step[axis];
      }
      const delta = computeRebase(local, CELL);
      if (delta) {
        for (const axis of ['x', 'y', 'z'] as const) {
          local[axis] -= delta[axis];
          origin[axis] += delta[axis];
        }
      }
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      const recomposed = origin[axis] + local[axis];
      const scale = Math.max(1, Math.abs(absolute[axis]));
      expect(Math.abs(recomposed - absolute[axis]) / scale).toBeLessThan(1e-9);
      // and the render-local coordinate stayed small throughout
      expect(Math.abs(local[axis])).toBeLessThanOrEqual(CELL * 1.4);
    }
  });

  it('round-trips warp semantics: absolute in, origin + local out', () => {
    const abs = { x: 5_000_000, y: -123_456, z: 987_654_321 };
    const origin = {
      x: Math.floor(abs.x / CELL) * CELL,
      y: Math.floor(abs.y / CELL) * CELL,
      z: Math.floor(abs.z / CELL) * CELL,
    };
    const local = { x: abs.x - origin.x, y: abs.y - origin.y, z: abs.z - origin.z };
    expect(computeRebase(local, CELL)).toBeNull(); // already normalized
    expect(origin.x + local.x).toBe(abs.x);
    expect(origin.y + local.y).toBe(abs.y);
    expect(origin.z + local.z).toBe(abs.z);
  });
});

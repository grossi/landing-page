import { describe, expect, it } from 'vitest';
import {
  coldStartLevel,
  LOD_DEMOTE_RATIO,
  LOD_MAX_LEVEL,
  LOD_MIN_DWELL_S,
  LOD_PROMOTE_PX,
  projectedPixelRadius,
  selectLod,
} from 'engine/core/selectLod';

const DWELL_OK = LOD_MIN_DWELL_S;

describe('projectedPixelRadius', () => {
  it('matches the pinhole projection formula', () => {
    // fov 90°: viewport half-height maps to tan(45°) = 1 unit at distance 1.
    const px = projectedPixelRadius(1, 100, Math.PI / 2, 1000);
    expect(px).toBeCloseTo((1 / 100) * (1000 / 2), 10);
  });

  it('scales with body radius and inversely with distance', () => {
    const base = projectedPixelRadius(1, 100, 1, 800);
    expect(projectedPixelRadius(3, 100, 1, 800)).toBeCloseTo(base * 3, 10);
    expect(projectedPixelRadius(1, 200, 1, 800)).toBeCloseTo(base / 2, 10);
  });

  it('does not blow up at zero distance', () => {
    expect(Number.isFinite(projectedPixelRadius(1, 0, 1, 800))).toBe(true);
  });
});

describe('selectLod', () => {
  it('promotes one step when px crosses the current promote threshold', () => {
    for (let level = 0; level < LOD_MAX_LEVEL; level++) {
      expect(selectLod(level, LOD_PROMOTE_PX[level], DWELL_OK)).toBe(level + 1);
    }
  });

  it('never promotes more than one step, even at enormous px', () => {
    expect(selectLod(0, 1e6, DWELL_OK)).toBe(1);
  });

  it('holds the level before the minimum dwell elapses', () => {
    expect(selectLod(0, 1e6, LOD_MIN_DWELL_S - 0.01)).toBe(0);
    expect(selectLod(3, 0, LOD_MIN_DWELL_S - 0.01)).toBe(3);
  });

  it('keeps the current level inside the hysteresis band', () => {
    // Level 1 promoted at 3 px; it only demotes below 3 * 0.75 = 2.25 px.
    const demoteAt = LOD_PROMOTE_PX[0] * LOD_DEMOTE_RATIO;
    expect(selectLod(1, demoteAt + 0.01, DWELL_OK)).toBe(1);
    expect(selectLod(1, demoteAt - 0.01, DWELL_OK)).toBe(0);
  });

  it('never demotes below level 0', () => {
    expect(selectLod(0, 0, DWELL_OK)).toBe(0);
  });

  it('respects maxLevel when promoting', () => {
    expect(selectLod(2, 1e6, DWELL_OK, 2)).toBe(2);
  });

  it('sheds one level per dwell window when the cap drops below current', () => {
    expect(selectLod(4, 1e6, DWELL_OK, 2)).toBe(3);
    expect(selectLod(4, 1e6, LOD_MIN_DWELL_S - 0.01, 2)).toBe(4);
  });

  it('crosses each boundary exactly once on a monotonic approach', () => {
    const transitions: Array<[number, number]> = [];
    let level = 0;
    let dwell = 10;
    // Sweep px from far dot to overwhelming close-up.
    for (let px = 0.5; px < 2000; px *= 1.05) {
      const next = selectLod(level, px, dwell);
      if (next !== level) {
        transitions.push([level, next]);
        level = next;
        dwell = 0;
      }
      dwell += 10; // slow approach: dwell always satisfied by the next step
    }
    expect(level).toBe(LOD_MAX_LEVEL);
    expect(transitions).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
    ]);
  });

  it('sheds every level on a monotonic retreat, one boundary at a time', () => {
    let level = LOD_MAX_LEVEL;
    let transitions = 0;
    for (let px = 2000; px > 0.5; px /= 1.05) {
      const next = selectLod(level, px, DWELL_OK);
      if (next !== level) {
        transitions++;
        level = next;
      }
    }
    expect(level).toBe(0);
    expect(transitions).toBe(LOD_MAX_LEVEL);
  });

  it('oscillating px around one threshold causes a single transition, not thrash', () => {
    // 19 ↔ 21 px straddles LOD_PROMOTE_PX[1] = 20 but stays far above the
    // demote point (15), so after one promotion the level is stable.
    let level = 1;
    let dwell = 10;
    let transitions = 0;
    for (let i = 0; i < 200; i++) {
      const px = i % 2 === 0 ? 21 : 19;
      const next = selectLod(level, px, dwell);
      if (next !== level) {
        transitions++;
        level = next;
        dwell = 0;
      }
      dwell += 0.1;
    }
    expect(transitions).toBe(1);
    expect(level).toBe(2);
  });
});

describe('coldStartLevel', () => {
  it('lands at the max rung when px is enormous', () => {
    expect(coldStartLevel(1e6)).toBe(LOD_MAX_LEVEL);
  });

  it('picks exactly the rung the promote thresholds justify', () => {
    expect(coldStartLevel(LOD_PROMOTE_PX[0] - 0.01)).toBe(0);
    expect(coldStartLevel(LOD_PROMOTE_PX[0])).toBe(1);
    expect(coldStartLevel(LOD_PROMOTE_PX[3])).toBe(4);
    expect(coldStartLevel(LOD_PROMOTE_PX[5] - 0.01)).toBe(5);
    expect(coldStartLevel(LOD_PROMOTE_PX[5])).toBe(6);
  });

  it('respects the (possibly governor-biased) maxLevel cap', () => {
    expect(coldStartLevel(1e6, 3)).toBe(3);
    expect(coldStartLevel(1e6, 0)).toBe(0);
    expect(coldStartLevel(1e6, 99)).toBe(LOD_MAX_LEVEL);
  });

  it('only the placement is dwell-free — later changes stay dwell-gated', () => {
    const placed = coldStartLevel(1e6);
    // an immediate px collapse must NOT demote before the dwell elapses
    expect(selectLod(placed, 0, LOD_MIN_DWELL_S - 0.01)).toBe(placed);
    expect(selectLod(placed, 0, LOD_MIN_DWELL_S)).toBe(placed - 1);
  });
});

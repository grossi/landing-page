import { describe, expect, it } from 'vitest';
import { GOVERNOR_LEVELS } from 'engine/core/governor';
import {
  applyQuality,
  clampDt,
  isPaused,
  MAX_DT,
  pixelRatioCap,
  type PauseSource,
} from 'engine/render/stage';

describe('clampDt', () => {
  it('converts a normal frame gap from ms to seconds', () => {
    expect(clampDt(1016, 1000)).toBeCloseTo(0.016, 10);
  });

  it('clamps a negative delta (first frame can predate `last`) to 0', () => {
    expect(clampDt(990, 1000)).toBe(0);
  });

  it('clamps a spike (tab pause, GC hitch) to MAX_DT', () => {
    expect(clampDt(9000, 1000)).toBe(MAX_DT);
  });

  it('passes a delta exactly at the cap through unchanged', () => {
    expect(clampDt(1050, 1000)).toBe(MAX_DT);
  });

  it('returns 0 for a zero delta', () => {
    expect(clampDt(1000, 1000)).toBe(0);
  });
});

describe('pixelRatioCap', () => {
  it('follows the quality table when no ceiling is given', () => {
    GOVERNOR_LEVELS.forEach((quality, level) => {
      expect(pixelRatioCap(level)).toBe(quality.pixelRatio);
    });
  });

  it('raises only level 0 to the ceiling (DEEP FIELD retina parity)', () => {
    expect(pixelRatioCap(0, 2)).toBe(2);
    expect(pixelRatioCap(1, 2)).toBe(GOVERNOR_LEVELS[1].pixelRatio);
    expect(pixelRatioCap(2, 2)).toBe(GOVERNOR_LEVELS[2].pixelRatio);
  });

  it('a ceiling at or below the table never lowers a cap (raise-only)', () => {
    expect(pixelRatioCap(0, 1.5)).toBe(GOVERNOR_LEVELS[0].pixelRatio);
    expect(pixelRatioCap(0, 1.1)).toBe(GOVERNOR_LEVELS[0].pixelRatio);
    expect(pixelRatioCap(1, 1.1)).toBe(GOVERNOR_LEVELS[1].pixelRatio);
    expect(pixelRatioCap(0, 0)).toBe(GOVERNOR_LEVELS[0].pixelRatio); // degenerate option
  });

  it('governor steps down always shed pixels below the ceiling', () => {
    for (const ceiling of [undefined, 1.1, 1.5, 2, 3]) {
      let last = pixelRatioCap(0, ceiling);
      for (let level = 1; level < GOVERNOR_LEVELS.length; level++) {
        const cap = pixelRatioCap(level, ceiling);
        expect(cap).toBeLessThan(last);
        last = cap;
      }
    }
  });
});

describe('isPaused', () => {
  it('runs when no pause source is active', () => {
    expect(isPaused(new Set<PauseSource>())).toBe(false);
  });

  it('pauses when any single source is active', () => {
    for (const source of ['hidden', 'offscreen', 'explicit'] as const) {
      expect(isPaused(new Set<PauseSource>([source]))).toBe(true);
    }
  });

  it('pauses while several sources are active', () => {
    expect(isPaused(new Set<PauseSource>(['hidden', 'explicit']))).toBe(true);
  });
});

describe('applyQuality', () => {
  it('drives the dust and LOD knobs from stage.quality()', () => {
    const stage = { quality: () => GOVERNOR_LEVELS[1] };
    let density = -1;
    let bias = -1;
    applyQuality(
      stage,
      { setDensity: (fraction) => { density = fraction; } },
      { setLodBias: (b) => { bias = b; } },
    );
    expect(density).toBe(0.66); // level-1 dustFraction
    expect(bias).toBe(1); // level-1 lodBias
  });

  it('is identity at level 0', () => {
    const stage = { quality: () => GOVERNOR_LEVELS[0] };
    let density = -1;
    let bias = -1;
    applyQuality(
      stage,
      { setDensity: (fraction) => { density = fraction; } },
      { setLodBias: (b) => { bias = b; } },
    );
    expect(density).toBe(1);
    expect(bias).toBe(0);
  });
});

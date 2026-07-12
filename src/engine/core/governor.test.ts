import { describe, expect, it } from 'vitest';
import {
  createGovernorState,
  DEGRADE_FRAMES,
  framePercentile,
  GOVERNOR_LEVELS,
  pushFrameTime,
  qualityForLevel,
  UPGRADE_FRAMES,
} from 'engine/core/governor';

const feed = (state: ReturnType<typeof createGovernorState>, ms: number, frames: number) => {
  for (let i = 0; i < frames; i++) pushFrameTime(state, ms);
  return state;
};

describe('pushFrameTime', () => {
  it('stays at level 0 on a steady comfortable load (8 ms)', () => {
    const state = feed(createGovernorState(), 8, 2000);
    expect(state.level).toBe(0);
  });

  it('descends to the lowest quality on a sustained heavy load (20 ms) and stays there', () => {
    const state = feed(createGovernorState(), 20, 2000);
    expect(state.level).toBe(GOVERNOR_LEVELS.length - 1);
    feed(state, 20, 2000);
    expect(state.level).toBe(GOVERNOR_LEVELS.length - 1);
  });

  it('degrades one level at a time, not in jumps', () => {
    const state = createGovernorState();
    feed(state, 20, DEGRADE_FRAMES);
    expect(state.level).toBe(1);
    feed(state, 20, DEGRADE_FRAMES);
    expect(state.level).toBe(2);
  });

  it('recovers slowly back to full quality when load lifts', () => {
    const state = feed(createGovernorState(), 20, 2000);
    expect(state.level).toBe(2);
    // Recovery needs the EMA to sink below 9 ms, then two sustained
    // UPGRADE_FRAMES streaks — far more frames than degradation.
    feed(state, 6, 100 + UPGRADE_FRAMES);
    expect(state.level).toBe(1);
    feed(state, 6, UPGRADE_FRAMES);
    expect(state.level).toBe(0);
  });

  it('does not flap on a boundary load alternating 9/15 ms', () => {
    const state = createGovernorState();
    for (let i = 0; i < 5000; i++) pushFrameTime(state, i % 2 === 0 ? 9 : 15);
    // EMA settles ~12 ms — inside the dead band between 9 and 14.
    expect(state.level).toBe(0);
    expect(state.ema).toBeGreaterThan(9);
    expect(state.ema).toBeLessThan(14);
  });

  it('a single spike does not degrade quality', () => {
    const state = feed(createGovernorState(), 8, 500);
    pushFrameTime(state, 200);
    feed(state, 8, 500);
    expect(state.level).toBe(0);
  });
});

describe('qualityForLevel', () => {
  it('maps levels to the degradation ladder', () => {
    expect(qualityForLevel(0)).toEqual({ pixelRatio: 1.5, dustFraction: 1, lodBias: 0 });
    expect(qualityForLevel(1)).toEqual({ pixelRatio: 1.25, dustFraction: 0.66, lodBias: 1 });
    expect(qualityForLevel(2)).toEqual({ pixelRatio: 1.0, dustFraction: 0.4, lodBias: 1 });
  });

  it('clamps out-of-range levels', () => {
    expect(qualityForLevel(-1)).toBe(GOVERNOR_LEVELS[0]);
    expect(qualityForLevel(99)).toBe(GOVERNOR_LEVELS[GOVERNOR_LEVELS.length - 1]);
  });
});

describe('framePercentile', () => {
  it('returns 0 with no samples', () => {
    expect(framePercentile(createGovernorState(), 0.95)).toBe(0);
  });

  it('computes percentiles over the recorded window', () => {
    const state = createGovernorState();
    for (let i = 1; i <= 100; i++) pushFrameTime(state, i);
    expect(framePercentile(state, 0.95)).toBe(95);
    expect(framePercentile(state, 1)).toBe(100);
  });

  it('only remembers the most recent FRAME_HISTORY samples', () => {
    const state = createGovernorState();
    feed(state, 100, 300); // old slow samples…
    feed(state, 5, 120); // …fully overwritten by the last 120
    expect(framePercentile(state, 1)).toBe(5);
  });
});

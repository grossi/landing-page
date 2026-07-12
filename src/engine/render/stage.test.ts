import { describe, expect, it } from 'vitest';
import { clampDt, isPaused, MAX_DT, type PauseSource } from 'engine/render/stage';

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

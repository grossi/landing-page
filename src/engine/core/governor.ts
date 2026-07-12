/**
 * Adaptive quality governor — a pure, allocation-free state machine that
 * watches frame times and steps the render quality level up or down.
 *
 * Levels degrade pixelRatio / dust density / LOD bias instead of frame rate:
 * slow smooth motion is the aesthetic, so we shed pixels, never frames.
 *
 * All functions are deterministic over their inputs. `pushFrameTime` mutates
 * the passed state in place (per-frame hot path — no per-frame allocation)
 * and returns it for convenience.
 */

/** Render settings for one quality level. */
export interface QualityLevel {
  /** Cap for renderer.setPixelRatio (already capped at 1.5 by the stage). */
  readonly pixelRatio: number;
  /** Fraction of the full dust/particle budget to keep alive. */
  readonly dustFraction: number;
  /** Added to LOD demotion pressure; callers subtract it from maxLevel. */
  readonly lodBias: number;
}

/** Quality ladder, best (0) to most degraded (2). */
export const GOVERNOR_LEVELS: readonly QualityLevel[] = [
  { pixelRatio: 1.5, dustFraction: 1, lodBias: 0 },
  { pixelRatio: 1.25, dustFraction: 0.66, lodBias: 1 },
  { pixelRatio: 1.0, dustFraction: 0.4, lodBias: 1 },
];

/** Degrade one level when the frame-time EMA stays above this (ms)… */
export const DEGRADE_MS = 14;
/** …for this many consecutive frames. */
export const DEGRADE_FRAMES = 30;
/** Upgrade one level when the EMA stays below this (ms)… */
export const UPGRADE_MS = 9;
/** …for this many consecutive frames (slow to trust a recovery). */
export const UPGRADE_FRAMES = 300;

/** EMA smoothing over roughly the last 30 frames. */
const EMA_ALPHA = 2 / (30 + 1);
/** Ring-buffer capacity for percentile queries (stats overlay). */
export const FRAME_HISTORY = 120;

export interface GovernorState {
  /** Current quality level, an index into GOVERNOR_LEVELS. */
  level: number;
  /** ~30-frame exponential moving average of frame time (ms). */
  ema: number;
  /** Consecutive frames with ema > DEGRADE_MS. */
  overCount: number;
  /** Consecutive frames with ema < UPGRADE_MS. */
  underCount: number;
  /** Last FRAME_HISTORY raw samples (ring buffer, for p95 display). */
  history: Float64Array;
  /** Next write index into `history`. */
  historyIndex: number;
  /** Number of valid samples in `history` (≤ FRAME_HISTORY). */
  historyCount: number;
}

export function createGovernorState(): GovernorState {
  return {
    level: 0,
    ema: 0,
    overCount: 0,
    underCount: 0,
    history: new Float64Array(FRAME_HISTORY),
    historyIndex: 0,
    historyCount: 0,
  };
}

/** Settings for the state's current level. */
export const qualityForLevel = (level: number): QualityLevel =>
  GOVERNOR_LEVELS[Math.min(Math.max(level, 0), GOVERNOR_LEVELS.length - 1)];

/**
 * Feed one frame's duration (ms). Steps `state.level` down after
 * DEGRADE_FRAMES consecutive over-budget frames, and back up after
 * UPGRADE_FRAMES consecutive comfortably-under-budget frames. The gap
 * between UPGRADE_MS and DEGRADE_MS is a dead band, so loads that hover
 * between the two never oscillate.
 */
export function pushFrameTime(state: GovernorState, ms: number): GovernorState {
  state.history[state.historyIndex] = ms;
  state.historyIndex = (state.historyIndex + 1) % FRAME_HISTORY;
  if (state.historyCount < FRAME_HISTORY) state.historyCount++;

  // Seed the EMA with the first sample so warmup doesn't drag through 0.
  state.ema = state.historyCount === 1 ? ms : state.ema + EMA_ALPHA * (ms - state.ema);

  state.overCount = state.ema > DEGRADE_MS ? state.overCount + 1 : 0;
  state.underCount = state.ema < UPGRADE_MS ? state.underCount + 1 : 0;

  if (state.overCount >= DEGRADE_FRAMES && state.level < GOVERNOR_LEVELS.length - 1) {
    state.level++;
    state.overCount = 0;
    state.underCount = 0;
  } else if (state.underCount >= UPGRADE_FRAMES && state.level > 0) {
    state.level--;
    state.overCount = 0;
    state.underCount = 0;
  }
  return state;
}

/**
 * Percentile (0..1) of the recorded frame times, e.g. 0.95 for p95.
 * Allocates + sorts — call from low-rate consumers (stats overlay), not
 * per frame. Returns 0 before any samples arrive.
 */
export function framePercentile(state: GovernorState, p: number): number {
  if (state.historyCount === 0) return 0;
  const samples = Array.from(state.history.subarray(0, state.historyCount)).sort((a, b) => a - b);
  const idx = Math.min(samples.length - 1, Math.max(0, Math.ceil(p * samples.length) - 1));
  return samples[idx];
}

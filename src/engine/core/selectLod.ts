/**
 * Pure LOD tier selection by projected screen-space pixel radius, with
 * hysteresis and a minimum dwell time so tiers never flicker or thrash.
 *
 * The ladder has 6 rungs (0..5): far dot/point → ico-sub1 wireframe →
 * displaced sub2/3/4 → near-surface detail. Rung geometry lives elsewhere;
 * this module only decides which rung a body should be on.
 *
 * Screen-space size is the one metric that captures both distance and body
 * scale (radii vary 8x-30x across archetypes) and automatically respects
 * FOV changes during throttle burns.
 */

/** Highest LOD rung (near-surface detail shell). */
export const LOD_MAX_LEVEL = 5;

/**
 * Promote from level i to i+1 when the projected radius reaches
 * LOD_PROMOTE_PX[i] pixels.
 */
export const LOD_PROMOTE_PX: readonly number[] = [3, 20, 70, 180, 420];

/** Demote below promoteThreshold * this ratio — the hysteresis band. */
export const LOD_DEMOTE_RATIO = 0.75;

/** Minimum seconds a body must stay on a level before changing again. */
export const LOD_MIN_DWELL_S = 0.5;

/**
 * Projected radius of a sphere on screen, in pixels:
 * px = (radius / distance) * (viewportHeight / (2 * tan(fovY / 2))).
 */
export function projectedPixelRadius(
  radius: number,
  distance: number,
  fovYRad: number,
  viewportHeightPx: number,
): number {
  const d = Math.max(distance, 1e-6);
  return (radius / d) * (viewportHeightPx / (2 * Math.tan(fovYRad / 2)));
}

/**
 * One LOD step per call (levels never jump, so crossfades stay pairwise).
 *
 * @param current   the body's current level (0..LOD_MAX_LEVEL)
 * @param px        projected pixel radius (see projectedPixelRadius)
 * @param dwellS    seconds spent on `current` since the last change
 * @param maxLevel  cap for this body (archetype cap minus governor lodBias)
 * @returns the next level: current, current + 1, or current - 1
 */
export function selectLod(
  current: number,
  px: number,
  dwellS: number,
  maxLevel: number = LOD_MAX_LEVEL,
): number {
  if (dwellS < LOD_MIN_DWELL_S) return current;
  const cap = Math.min(Math.max(maxLevel, 0), LOD_MAX_LEVEL);
  // Shed levels (one per dwell window) if the cap dropped below us,
  // e.g. the governor raised lodBias under load.
  if (current > cap) return current - 1;
  if (current < cap && px >= LOD_PROMOTE_PX[current]) return current + 1;
  if (current > 0 && px < LOD_PROMOTE_PX[current - 1] * LOD_DEMOTE_RATIO) return current - 1;
  return current;
}

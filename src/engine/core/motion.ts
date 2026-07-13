/**
 * Context-sensitive flight-speed law (NMS-style): max speed proportional to
 * the distance to the nearest surface, clamped to a floor and a ceiling.
 *
 * Tying speed to surface distance keeps time-to-contact roughly constant —
 * the ship decelerates smoothly and automatically as a planet grows in the
 * viewport, with zero player-visible mechanic. At large world scale this is
 * what makes travel fun AND surface approach controllable.
 *
 * The cap is direction-aware: it exists to make *approaches* controllable,
 * so it only binds when the ship is pointed at the body. Pointing away
 * relaxes it back to the open-space ceiling (`escapeRelief`) — climbing out
 * of a "gravity well" is never a grind. Boosting additionally raises the
 * cap (`BOOST_LIMIT_FACTOR`), letting a burn punch through the well; the
 * sim is no-fail (soft altitude floor), so the worst case is a fast skim.
 */

/** Max speed per unit of surface distance (≈ constant seconds-to-contact). */
export const SPEED_PER_SURFACE_DISTANCE = 0.35;
/** Speed floor so skimming a surface never feels parked (units/s). */
export const SPEED_FLOOR = 40;
/** Speed ceiling in open space (units/s). */
export const SPEED_CEIL = 3000;

/** Approach cosine at/above which the surface cap applies in full. */
export const RELIEF_START = 0.25;
/** Approach cosine at/below which the cap is fully lifted (flying away). */
export const RELIEF_FULL = -0.2;
/** Multiplier a boost burn applies to the (relieved) speed cap. */
export const BOOST_LIMIT_FACTOR = 1.8;

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * How much of the surface cap is forgiven for the current heading, from 0
 * (heading at the body — full cap) to 1 (heading away — no cap).
 *
 * `approach` is the cosine between the ship's forward direction and the
 * direction TO the nearest body. Smoothstepped between `RELIEF_START` and
 * `RELIEF_FULL` so grazing headings get partial relief and the limit never
 * steps as the ship turns.
 */
export function escapeRelief(approach: number): number {
  const t = Math.min(1, Math.max(0, (RELIEF_START - approach) / (RELIEF_START - RELIEF_FULL)));
  return smooth(t);
}

/**
 * Max allowed speed at `surfaceDistance` units from the nearest surface,
 * heading with approach cosine `approach` (defaults to a head-on 1, the
 * strictest cap — the pre-directional behavior). Linear in distance between
 * the clamps and continuous at both joints; negative distances (inside a
 * surface, mid soft-floor push-out) clamp to the floor. The relieved limit
 * blends from the distance cap to `SPEED_CEIL` as the heading turns away.
 */
export function speedLimit(surfaceDistance: number, approach = 1): number {
  const base = Math.min(
    SPEED_CEIL,
    Math.max(SPEED_FLOOR, surfaceDistance * SPEED_PER_SURFACE_DISTANCE),
  );
  return base + (SPEED_CEIL - base) * escapeRelief(approach);
}

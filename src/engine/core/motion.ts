/**
 * Context-sensitive flight-speed law (NMS-style): max speed proportional to
 * the distance to the nearest surface, clamped to a floor and a ceiling.
 *
 * Tying speed to surface distance keeps time-to-contact roughly constant —
 * the ship decelerates smoothly and automatically as a planet grows in the
 * viewport, with zero player-visible mechanic. At large world scale this is
 * what makes travel fun AND surface approach controllable.
 */

/** Max speed per unit of surface distance (≈ constant seconds-to-contact). */
export const SPEED_PER_SURFACE_DISTANCE = 0.35;
/** Speed floor so skimming a surface never feels parked (units/s). */
export const SPEED_FLOOR = 40;
/** Speed ceiling in open space (units/s). */
export const SPEED_CEIL = 3000;

/**
 * Max allowed speed at `surfaceDistance` units from the nearest surface.
 * Linear between the clamps and continuous at both joints; negative
 * distances (inside a surface, mid soft-floor push-out) clamp to the floor.
 */
export function speedLimit(surfaceDistance: number): number {
  return Math.min(
    SPEED_CEIL,
    Math.max(SPEED_FLOOR, surfaceDistance * SPEED_PER_SURFACE_DISTANCE),
  );
}

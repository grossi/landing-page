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
 *
 * Only SOLID bodies (planets, stars — see `Poi.solid`) drive the law.
 * Diffuse volumes (nebulae, clusters, swarms) are enterable: instead of a
 * cap they apply `diffuseDrag`, a gentle speed multiplier that deepens
 * toward the volume's centre but never drops below `DIFFUSE_DRAG_FLOOR` —
 * atmosphere, not a wall. Crossing into a solid body's envelope
 * (`ENVELOPE_RADII`) additionally clamps the relieved limit to
 * `envelopeCap`, giving arrival a felt beginning.
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

/**
 * Surface distance (in radii) at which a solid body's atmospheric envelope
 * begins — the same band where the LOD manager's atmosphere ring cue starts
 * fading in (ATMOSPHERE_FAR), so the arrival ritual and the visual agree.
 */
export const ENVELOPE_RADII = 4;
/** The arrival ritual re-arms beyond this surface distance (in radii). */
export const ENVELOPE_REARM_RADII = 5;
/** Half-width (in radii) of the band the envelope cap smoothsteps over. */
export const ENVELOPE_BAND_RADII = 0.25;
/** Inside the envelope the cap equals the head-on law this many radii out. */
export const ENVELOPE_CAP_RADII = 2.5;

/**
 * Speed cap inside a solid body's atmospheric envelope. Consumed as
 * `min(relievedLimit, envelopeCap(…))`, so it can only lower the law, never
 * raise it. No cap (`SPEED_CEIL`) outside `ENVELOPE_RADII`; inside, it
 * settles at the head-on law's value `ENVELOPE_CAP_RADII` radii out — entry
 * has a felt beginning even on relieved (grazing/leaving) headings, and the
 * plain distance law takes back over once it becomes the stricter of the
 * two. The cap steps down over a short smoothstep band around the boundary
 * (continuous everywhere — the velocity lerp does the rest), clamps to the
 * law's own floor and ceiling so it never fights either, and negative
 * distances (mid soft-floor push-out) hold the inside value.
 */
export function envelopeCap(surfaceDistance: number, radius: number): number {
  const inside = Math.min(
    SPEED_CEIL,
    Math.max(SPEED_FLOOR, ENVELOPE_CAP_RADII * radius * SPEED_PER_SURFACE_DISTANCE),
  );
  const d = surfaceDistance / Math.max(radius, 1e-6);
  const t = Math.min(
    1,
    Math.max(0, (ENVELOPE_RADII + ENVELOPE_BAND_RADII - d) / (2 * ENVELOPE_BAND_RADII)),
  );
  return SPEED_CEIL - (SPEED_CEIL - inside) * smooth(t);
}

/** Speed multiplier floor at the centre of a diffuse volume. */
export const DIFFUSE_DRAG_FLOOR = 0.35;

/**
 * Gentle drag inside a diffuse POI volume (nebula, cluster, swarm): a
 * multiplier on the ship's target speed, 1 at (and outside) the boundary,
 * smoothstepping down to `DIFFUSE_DRAG_FLOOR` at the centre. Atmospheric
 * resistance, not a wall — continuous at the boundary so entering never
 * snaps, and floored so crossing a nebula never feels parked.
 */
export function diffuseDrag(surfaceDistance: number, radius: number): number {
  if (surfaceDistance >= 0) return 1;
  const depth = Math.min(1, -surfaceDistance / Math.max(radius, 1e-6));
  return 1 - (1 - DIFFUSE_DRAG_FLOOR) * smooth(depth);
}

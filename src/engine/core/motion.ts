/**
 * Context-sensitive flight-speed law (NMS-style): max speed proportional to
 * the distance to the nearest surface, clamped to a floor and a ceiling.
 *
 * Tying speed to surface distance keeps time-to-contact roughly constant —
 * the ship decelerates smoothly and automatically as a planet grows in the
 * viewport, with zero player-visible mechanic. At large world scale this is
 * what makes travel fun AND surface approach controllable. The floor is
 * radius-aware (`speedFloor`): `SPEED_FLOOR` at orbit altitude, tapering to
 * `DECK_FLOOR` hugging the ground — descending the last tenth of a radius
 * is a felt slowdown, and skimming never drops below `DECK_FLOOR`, so the
 * ship still never feels parked.
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
/** Speed floor at orbit/skim altitude, so orbiting never feels parked (units/s). */
export const SPEED_FLOOR = 40;
/** Speed floor on the deck — ground-hugging flight reads slow and deliberate (units/s). */
export const DECK_FLOOR = 14;
/** Surface distance (in radii) at/above which the full skim floor applies. */
export const FLOOR_TAPER_START_RADII = 0.1;
/** …and at/below which the floor settles at `DECK_FLOOR`. */
export const FLOOR_TAPER_FULL_RADII = 0.02;
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
 * Radius-aware speed floor. A flat 40 u/s stops the law from scaling below
 * d ≈ 114 units, so orbit altitude and the deck felt the same speed — on a
 * big body the last stretch to the ground read too fast. Above
 * `FLOOR_TAPER_START_RADII` of the surface the floor is the plain
 * `SPEED_FLOOR` (orbiting feel unchanged — it is good); below, it
 * smoothsteps down to `DECK_FLOOR` by `FLOOR_TAPER_FULL_RADII` (around the
 * terrain-following ride altitude), so closing on the ground reads as a
 * landing approach. Continuous at both edges; negative distances (mid
 * soft-floor push-out) hold the deck value. Non-finite or non-positive
 * radii (no solid body scanned) keep the plain floor.
 */
export function speedFloor(surfaceDistance: number, radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return SPEED_FLOOR;
  const d = surfaceDistance / radius;
  const t = Math.min(
    1,
    Math.max(0, (FLOOR_TAPER_START_RADII - d) / (FLOOR_TAPER_START_RADII - FLOOR_TAPER_FULL_RADII)),
  );
  return SPEED_FLOOR - (SPEED_FLOOR - DECK_FLOOR) * smooth(t);
}

/**
 * Max allowed speed at `surfaceDistance` units from the nearest surface,
 * heading with approach cosine `approach` (defaults to a head-on 1, the
 * strictest cap — the pre-directional behavior). Linear in distance between
 * the clamps and continuous at both joints; negative distances (inside a
 * surface, mid soft-floor push-out) clamp to the floor. The floor itself is
 * radius-aware (`speedFloor` — pass the nearest body's radius; the default
 * Infinity reproduces the flat-floor law). The relieved limit blends from
 * the distance cap to `SPEED_CEIL` as the heading turns away.
 */
export function speedLimit(surfaceDistance: number, approach = 1, radius = Infinity): number {
  const base = Math.min(
    SPEED_CEIL,
    Math.max(speedFloor(surfaceDistance, radius), surfaceDistance * SPEED_PER_SURFACE_DISTANCE),
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

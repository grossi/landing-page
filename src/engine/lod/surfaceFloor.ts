/**
 * Terrain-following soft altitude floor — pure math, node-testable.
 *
 * The flight sim eases the ship back out when it sinks below a solid body's
 * floor radius. For bodies rendered through the LOD ladder the floor samples
 * the SAME displacement field the wireframe is built from
 * (`r(dir) = R · (1 + amplitude · field(dir))`, see engine/lod/geometry)
 * plus a small safety margin — so low flight hugs valleys and never clips
 * through the +amplitude peaks a flat mean-radius floor allowed (a planet's
 * terrain reaches 1.06R; the old flat floor sat at 1.03R, inside the hills).
 * Solid POIs without a field (the derelict station's hull cluster, a binary
 * pair's swept volume, the pulsar core) keep the flat floor.
 *
 * The sampler expects the ship's radial direction in the body's LOCAL frame:
 * the displaced geometry spins with its anchor, so callers un-rotate the
 * world-space radial by the anchor's world quaternion (the same convention
 * as the LOD manager's far-limb haze).
 */

import { makeDisplacementField, type DisplacementPreset } from 'engine/lod/displacement';

/** Flat floor altitude, in radii, for solid POIs without a field. */
export const FLAT_FLOOR_RADII = 1.03;
/** Safety margin above the sampled terrain surface, in radii. */
export const FLOOR_MARGIN_RADII = 0.015;
/**
 * Surface distance (in radii) below which the sim probes the floor. Must
 * exceed the highest floor any preset can produce: the deepest amplitude is
 * the asteroid's 0.14, so peaks top out at 1.14R + margin 0.015R = 1.155R —
 * a 0.16-radius probe band always sees the floor before the ship is under it.
 */
export const FLOOR_PROBE_RADII = 0.16;

/**
 * Floor radius along one unit direction, given the body's field value there:
 * the displaced terrain surface plus the safety margin. Matches the geometry
 * contract `R · (1 + amplitude · sample)` exactly, offset by the margin.
 */
export const floorRadius = (radius: number, amplitude: number, sample: number): number =>
  radius * (1 + amplitude * sample + FLOOR_MARGIN_RADII);

/** Floor radius as a function of a LOCAL unit direction, in world units. */
export type SurfaceFloor = (x: number, y: number, z: number) => number;

/**
 * Builds the floor sampler for one LOD body from its registration identity
 * (seed + archetype preset + radius) — the same inputs the LOD manager
 * builds the wireframe from, so floor and surface are bitwise-consistent.
 * Cheap to construct (a closure over per-octave seeds); the sim caches one
 * for the current nearest body.
 *
 * Zero-amplitude presets (stars) keep the flat `FLAT_FLOOR_RADII` floor
 * instead of the terrain margin: a star's rendered surface is not always
 * exactly 1R — the home sun's pulse wrapper animates the drawn wireframe
 * up to 1.025R at peak, and a 1.015R terrain floor would leave the ship
 * (and its chase camera) inside the wireframe for half of every pulse.
 * 1.03R clears any pulse, exactly as the pre-terrain floor always did.
 */
export function makeSurfaceFloor(
  seed: number,
  preset: DisplacementPreset,
  radius: number,
): SurfaceFloor {
  if (preset.amplitude === 0) {
    const flat = radius * FLAT_FLOOR_RADII;
    return () => flat;
  }
  const field = makeDisplacementField(seed, preset);
  return (x, y, z) => floorRadius(radius, preset.amplitude, field(x, y, z));
}

/**
 * Pure, seeded radial displacement field for planet / asteroid surfaces.
 *
 * Given a body seed and a profile, `makeDisplacementField` returns a
 * deterministic function of a unit-sphere direction producing a radial
 * offset in [-1, 1]. The geometry builder applies it as
 * `r(dir) = R * (1 + amplitude * field(dir))`, so the same seed always
 * yields the exact same planet — the core seamless-engine guarantee.
 *
 * Implementation: 3D value noise (lattice corners hashed with the shared
 * `hashCoords`, smoothstep trilinear interpolation) summed as fBm, plus a
 * seeded crater field (smooth bowls with a rim bump). Everything is plain
 * math on numbers — no THREE, no DOM — so it unit-tests in node.
 */

import { hashCoords, mulberry32 } from 'engine/core/rng';

export interface DisplacementProfile {
  /** fBm octave count; 0 disables noise entirely (stars). */
  octaves: number;
  /** Frequency multiplier between octaves (~2.1 avoids lattice alignment). */
  lacunarity: number;
  /** Amplitude multiplier between octaves (0.5 = classic fBm). */
  gain: number;
  /** Lattice frequency of the first octave over the unit sphere. */
  baseFrequency: number;
  /**
   * Relative amplitude multiplier on the LOWEST octave only (1 = classic
   * fBm). Raising it makes continent-scale lumps dominate the normalized
   * sum, so silhouettes read at the 42/162-vert rungs — where only the
   * lowest frequencies survive sampling.
   */
  baseBoost: number;
  /** Number of seeded impact craters. */
  craterCount: number;
  /** Depth of a crater bowl in field units (before the geometry amplitude). */
  craterDepth: number;
}

/** A profile bundled with the radial amplitude (fraction of body radius). */
export interface DisplacementPreset extends DisplacementProfile {
  amplitude: number;
}

/**
 * Rocky planet: continents + rolling fBm terrain + a few craters, displaced
 * ±6% R total (the amplitude is a contract — the soft altitude floor and
 * the peaks band are tuned against 1.06R). Six octaves so rung 6's 40k
 * verts have real detail to resolve; the boosted base octave keeps the
 * continent shapes legible all the way down to the level-1/2 silhouettes.
 */
export const PLANET_PROFILE: DisplacementPreset = {
  octaves: 6,
  lacunarity: 2.1,
  gain: 0.5,
  baseFrequency: 2.0,
  baseBoost: 2.0,
  craterCount: 6,
  craterDepth: 0.4,
  amplitude: 0.06,
};

/** Asteroid: chunkier noise, deeper craters, displaced ±14% R. */
export const ASTEROID_PROFILE: DisplacementPreset = {
  octaves: 3,
  lacunarity: 2.1,
  gain: 0.55,
  baseFrequency: 2.0,
  baseBoost: 1,
  craterCount: 3,
  craterDepth: 0.7,
  amplitude: 0.14,
};

/** Star: perfect sphere — zero amplitude, the field is identically 0. */
export const STAR_PROFILE: DisplacementPreset = {
  octaves: 0,
  lacunarity: 2.0,
  gain: 0.5,
  baseFrequency: 2.0,
  baseBoost: 1,
  craterCount: 0,
  craterDepth: 0,
  amplitude: 0,
};

export interface CraterSpec {
  /** Unit direction of the crater center. */
  dir: readonly [number, number, number];
  /** Angular radius in radians, in [0.08, 0.3]. */
  radius: number;
}

/**
 * Seeded crater placements. Exported so tests (and debug tooling) can locate
 * the craters a field will carve. Each crater draws from its own
 * `mulberry32(hashCoords(i, 7, 13, seed))` stream, so crater i is independent
 * of crater count.
 */
export function getCraterSpecs(seed: number, craterCount: number): CraterSpec[] {
  const specs: CraterSpec[] = [];
  for (let i = 0; i < craterCount; i++) {
    const rand = mulberry32(hashCoords(i, 7, 13, seed));
    // Uniform point on the unit sphere.
    const z = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - z * z));
    specs.push({
      dir: [s * Math.cos(theta), s * Math.sin(theta), z],
      radius: 0.08 + rand() * 0.22,
    });
  }
  return specs;
}

/** Classic smoothstep on [0, 1]. */
const fade = (t: number): number => t * t * (3 - 2 * t);

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Hash a lattice corner to a deterministic value in [-1, 1]. */
const cornerValue = (ix: number, iy: number, iz: number, seed: number): number =>
  (hashCoords(ix, iy, iz, seed) / 4294967296) * 2 - 1;

/** Smoothstep-faded trilinear value noise at (x, y, z) for one octave seed. */
function valueNoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);
  const c000 = cornerValue(ix, iy, iz, seed);
  const c100 = cornerValue(ix + 1, iy, iz, seed);
  const c010 = cornerValue(ix, iy + 1, iz, seed);
  const c110 = cornerValue(ix + 1, iy + 1, iz, seed);
  const c001 = cornerValue(ix, iy, iz + 1, seed);
  const c101 = cornerValue(ix + 1, iy, iz + 1, seed);
  const c011 = cornerValue(ix, iy + 1, iz + 1, seed);
  const c111 = cornerValue(ix + 1, iy + 1, iz + 1, seed);
  const x00 = lerp(c000, c100, fx);
  const x10 = lerp(c010, c110, fx);
  const x01 = lerp(c001, c101, fx);
  const x11 = lerp(c011, c111, fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

/** Rim bump: smooth quartic hump centered on t = 0.9, zero outside ±0.25. */
function rimBump(t: number): number {
  const u = (t - 0.9) / 0.25;
  if (u <= -1 || u >= 1) return 0;
  const q = 1 - u * u;
  return q * q;
}

/**
 * Build the displacement field for one body.
 *
 * @param seed     32-bit body seed (drawn from the sector's mulberry32 stream)
 * @param profile  noise + crater parameters (see presets)
 * @returns `(x, y, z) => offset` — unit direction in, radial offset in [-1, 1]
 *          out. Same seed + profile is bitwise-identical, always.
 */
export function makeDisplacementField(
  seed: number,
  profile: DisplacementProfile,
): (x: number, y: number, z: number) => number {
  const { octaves, lacunarity, gain, baseFrequency, baseBoost, craterDepth } = profile;

  // Per-octave seeds and amplitudes, precomputed. Golden-ratio stride
  // decorrelates octaves; the base boost weights octave 0 only. The sum is
  // normalized by `norm`, so boosting redistributes energy toward the
  // continent scale without ever growing the total amplitude.
  const octaveSeeds: number[] = [];
  const octaveAmps: number[] = [];
  let norm = 0;
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    octaveSeeds.push((seed ^ Math.imul(o + 1, 0x9e3779b9)) >>> 0);
    octaveAmps.push(o === 0 ? amp * baseBoost : amp);
    norm += octaveAmps[o];
    amp *= gain;
  }

  const craters = getCraterSpecs(seed, profile.craterCount);

  return (x: number, y: number, z: number): number => {
    let value = 0;

    if (norm > 0) {
      let f = baseFrequency;
      let sum = 0;
      for (let o = 0; o < octaves; o++) {
        sum += octaveAmps[o] * valueNoise(x * f, y * f, z * f, octaveSeeds[o]);
        f *= lacunarity;
      }
      value = sum / norm;
    }

    for (let i = 0; i < craters.length; i++) {
      const c = craters[i];
      const dot = clamp(x * c.dir[0] + y * c.dir[1] + z * c.dir[2], -1, 1);
      const t = Math.acos(dot) / c.radius;
      if (t >= 1.15) continue;
      // Smooth bowl: full depth at the center, C1-flat at the rim (t = 1).
      if (t < 1) value -= craterDepth * (1 - fade(t));
      value += 0.25 * craterDepth * rimBump(t);
    }

    return clamp(value, -1, 1);
  };
}

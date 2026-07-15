import { describe, expect, it } from 'vitest';
import { mulberry32 } from 'engine/core/rng';
import {
  ASTEROID_PROFILE,
  getCraterSpecs,
  makeDisplacementField,
  PLANET_PROFILE,
  STAR_PROFILE,
  type DisplacementProfile,
} from 'engine/lod/displacement';

/** Deterministic uniform points on the unit sphere. */
function sampleDirs(count: number, seed: number): [number, number, number][] {
  const rand = mulberry32(seed);
  const dirs: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - z * z));
    dirs.push([s * Math.cos(theta), s * Math.sin(theta), z]);
  }
  return dirs;
}

describe('makeDisplacementField', () => {
  it('is bitwise-identical for the same seed and profile', () => {
    for (const profile of [PLANET_PROFILE, ASTEROID_PROFILE]) {
      const a = makeDisplacementField(0xc0ffee, profile);
      const b = makeDisplacementField(0xc0ffee, profile);
      for (const [x, y, z] of sampleDirs(200, 7)) expect(a(x, y, z)).toBe(b(x, y, z));
    }
  });

  it('differs across seeds', () => {
    const a = makeDisplacementField(1, PLANET_PROFILE);
    const b = makeDisplacementField(2, PLANET_PROFILE);
    const dirs = sampleDirs(50, 11);
    expect(dirs.map(([x, y, z]) => a(x, y, z))).not.toEqual(dirs.map(([x, y, z]) => b(x, y, z)));
  });

  it('stays within [-1, 1] over 5000 random directions', () => {
    for (const [seed, profile] of [
      [42, PLANET_PROFILE],
      [43, ASTEROID_PROFILE],
    ] as const) {
      const field = makeDisplacementField(seed, profile);
      for (const [x, y, z] of sampleDirs(5000, seed)) {
        const v = field(x, y, z);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is continuous: 1e-3 rad rotations move the field by < 0.02', () => {
    const field = makeDisplacementField(0xdecade, PLANET_PROFILE);
    const eps = 1e-3;
    const cos = Math.cos(eps);
    const sin = Math.sin(eps);
    for (const [x, y, z] of sampleDirs(500, 3)) {
      // Rotate around each principal axis; lattice seams would spike these.
      const rotated: [number, number, number][] = [
        [x, y * cos - z * sin, y * sin + z * cos],
        [x * cos + z * sin, y, -x * sin + z * cos],
        [x * cos - y * sin, x * sin + y * cos, z],
      ];
      const v = field(x, y, z);
      for (const [rx, ry, rz] of rotated) expect(Math.abs(field(rx, ry, rz) - v)).toBeLessThan(0.02);
    }
  });

  it('carves a crater: minimum near the center is far below the field mean', () => {
    const seed = 0xbeef;
    const profile: DisplacementProfile = {
      octaves: 0,
      lacunarity: 2,
      gain: 0.5,
      baseFrequency: 2,
      baseBoost: 1,
      craterCount: 1,
      craterDepth: 1,
    };
    const field = makeDisplacementField(seed, profile);
    const [crater] = getCraterSpecs(seed, 1);

    const dirs = sampleDirs(2000, 5);
    const mean = dirs.reduce((acc, [x, y, z]) => acc + field(x, y, z), 0) / dirs.length;

    // Sample inside the crater's angular radius around its center.
    let min = Infinity;
    for (const [x, y, z] of sampleDirs(200, 9)) {
      // Blend toward the center dir, renormalize — stays within the bowl.
      const t = 0.02 * crater.radius;
      const bx = crater.dir[0] + x * t;
      const by = crater.dir[1] + y * t;
      const bz = crater.dir[2] + z * t;
      const len = Math.hypot(bx, by, bz);
      min = Math.min(min, field(bx / len, by / len, bz / len));
    }
    expect(min).toBeLessThan(mean - 0.5);
    expect(field(crater.dir[0], crater.dir[1], crater.dir[2])).toBeLessThan(-0.9);
  });

  it('star profile is identically zero (perfect sphere)', () => {
    const field = makeDisplacementField(0x5747, STAR_PROFILE);
    for (const [x, y, z] of sampleDirs(100, 13)) expect(field(x, y, z)).toBe(0);
  });

  it('planet profile runs 6 octaves with a boosted base octave', () => {
    // the boost redistributes energy toward continent scale; the amplitude
    // contract (±0.06R total — the soft floor / peaks band depend on it)
    // lives in `amplitude`, which the normalized field never exceeds
    expect(PLANET_PROFILE.octaves).toBe(6);
    expect(PLANET_PROFILE.baseBoost).toBeGreaterThan(1);
    expect(PLANET_PROFILE.amplitude).toBe(0.06);
  });

  it('the base boost never grows the field beyond the [-1, 1] bound', () => {
    const boosted: DisplacementProfile = { ...PLANET_PROFILE, baseBoost: 10 };
    const field = makeDisplacementField(0xfacade, boosted);
    for (const [x, y, z] of sampleDirs(2000, 17)) {
      const v = field(x, y, z);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('boosting the base octave preserves determinism and changes only weighting', () => {
    const a = makeDisplacementField(0xc0ffee, PLANET_PROFILE);
    const b = makeDisplacementField(0xc0ffee, PLANET_PROFILE);
    const flat = makeDisplacementField(0xc0ffee, { ...PLANET_PROFILE, baseBoost: 1 });
    let differs = false;
    for (const [x, y, z] of sampleDirs(100, 19)) {
      expect(a(x, y, z)).toBe(b(x, y, z)); // 6-octave field stays bitwise-stable
      if (a(x, y, z) !== flat(x, y, z)) differs = true;
    }
    expect(differs).toBe(true);
  });
});

describe('getCraterSpecs', () => {
  it('is deterministic, and crater i does not depend on the count', () => {
    const five = getCraterSpecs(99, 5);
    const two = getCraterSpecs(99, 2);
    expect(five.slice(0, 2)).toEqual(two);
    expect(getCraterSpecs(99, 5)).toEqual(five);
  });

  it('yields unit centers with angular radii in [0.08, 0.3]', () => {
    for (const { dir, radius } of getCraterSpecs(0xabcdef, 40)) {
      expect(Math.hypot(dir[0], dir[1], dir[2])).toBeCloseTo(1, 6);
      expect(radius).toBeGreaterThanOrEqual(0.08);
      expect(radius).toBeLessThanOrEqual(0.3);
    }
  });
});

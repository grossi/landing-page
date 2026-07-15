import { describe, expect, it } from 'vitest';
import { mulberry32 } from 'engine/core/rng';
import {
  ASTEROID_PROFILE,
  KIND_PRESETS,
  makeDisplacementField,
  PLANET_PROFILE,
  STAR_PROFILE,
} from 'engine/lod/displacement';
import {
  FLAT_FLOOR_RADII,
  FLOOR_MARGIN_RADII,
  FLOOR_PROBE_RADII,
  floorRadius,
  makeSurfaceFloor,
} from 'engine/lod/surfaceFloor';

/** Deterministic uniform unit directions (same construction as craters). */
function sampleDirs(count: number, seed: number): Array<[number, number, number]> {
  const rand = mulberry32(seed);
  const dirs: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i++) {
    const z = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - z * z));
    dirs.push([s * Math.cos(theta), s * Math.sin(theta), z]);
  }
  return dirs;
}

describe('floorRadius', () => {
  it('sits exactly the safety margin above the displaced surface', () => {
    // geometry contract: surface = R · (1 + amplitude · sample)
    for (const [radius, amplitude, sample] of [
      [960, 0.06, 1],
      [960, 0.06, -1],
      [280, 0.06, 0.37],
      [70, 0.14, -0.5],
    ]) {
      const surface = radius * (1 + amplitude * sample);
      expect(floorRadius(radius, amplitude, sample)).toBeCloseTo(
        surface + radius * FLOOR_MARGIN_RADII,
        9,
      );
    }
  });

  it('reduces to a constant margin shell at zero amplitude', () => {
    expect(floorRadius(800, 0, 1)).toBe(800 * (1 + FLOOR_MARGIN_RADII));
    expect(floorRadius(800, 0, -1)).toBe(800 * (1 + FLOOR_MARGIN_RADII));
  });
});

describe('makeSurfaceFloor', () => {
  it('matches the rendered surface plus margin at every sampled direction', () => {
    const seed = 123456789;
    const radius = 960; // a max true-scale rogue planet
    const field = makeDisplacementField(seed, PLANET_PROFILE);
    const floor = makeSurfaceFloor(seed, PLANET_PROFILE, radius);
    for (const [x, y, z] of sampleDirs(200, 42)) {
      const surface = radius * (1 + PLANET_PROFILE.amplitude * field(x, y, z));
      expect(floor(x, y, z)).toBeCloseTo(surface + radius * FLOOR_MARGIN_RADII, 9);
    }
  });

  it('hugs valleys: crater floors sit below the mean-radius flat floor', () => {
    // over many seeds and directions the field must dip negative somewhere,
    // and the floor there must sit below 1·R + margin — the "hug the
    // valley" property the flat 1.03R floor never had
    const radius = 500;
    let sawValley = false;
    for (let seed = 1; seed <= 5 && !sawValley; seed++) {
      const floor = makeSurfaceFloor(seed, PLANET_PROFILE, radius);
      for (const [x, y, z] of sampleDirs(300, seed)) {
        if (floor(x, y, z) < radius * (1 + FLOOR_MARGIN_RADII)) {
          sawValley = true;
          break;
        }
      }
    }
    expect(sawValley).toBe(true);
  });

  it('keeps stars on the flat floor, clear of the sun-pulse peak', () => {
    const floor = makeSurfaceFloor(777, STAR_PROFILE, 800);
    for (const [x, y, z] of sampleDirs(50, 7)) {
      expect(floor(x, y, z)).toBe(800 * FLAT_FLOOR_RADII);
      // the home sun's pulse wrapper draws the wireframe out to 1.025R at
      // peak — the star floor must always clear it or the ship (and chase
      // camera) would spend half of every pulse under the surface
      expect(floor(x, y, z)).toBeGreaterThan(800 * 1.025);
    }
  });

  it('is deterministic per seed', () => {
    const a = makeSurfaceFloor(2024, ASTEROID_PROFILE, 300);
    const b = makeSurfaceFloor(2024, ASTEROID_PROFILE, 300);
    for (const [x, y, z] of sampleDirs(50, 11)) {
      expect(a(x, y, z)).toBe(b(x, y, z));
    }
  });

  it('stays inside the probe band for every archetype preset', () => {
    // the sim only computes the floor below FLOOR_PROBE_RADII of the
    // surface, so no preset may ever produce a floor above 1 + probe radii
    for (const preset of Object.values(KIND_PRESETS)) {
      expect(1 + preset.amplitude + FLOOR_MARGIN_RADII).toBeLessThan(1 + FLOOR_PROBE_RADII);
    }
    // and the flat fallback engages inside the band too
    expect(FLAT_FLOOR_RADII).toBeLessThan(1 + FLOOR_PROBE_RADII);
  });
});

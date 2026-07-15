import { describe, expect, it } from 'vitest';
import {
  DIFFUSE_DRAG_FLOOR,
  diffuseDrag,
  ENVELOPE_BAND_RADII,
  ENVELOPE_CAP_RADII,
  ENVELOPE_RADII,
  envelopeCap,
  escapeRelief,
  RELIEF_FULL,
  RELIEF_START,
  SPEED_CEIL,
  SPEED_FLOOR,
  SPEED_PER_SURFACE_DISTANCE,
  speedLimit,
} from 'engine/core/motion';

describe('speedLimit', () => {
  it('clamps to the floor at and inside the surface', () => {
    expect(speedLimit(0)).toBe(SPEED_FLOOR);
    expect(speedLimit(-500)).toBe(SPEED_FLOOR);
    expect(speedLimit(1)).toBe(SPEED_FLOOR);
  });

  it('clamps to the ceiling in deep space', () => {
    expect(speedLimit(1e6)).toBe(SPEED_CEIL);
    expect(speedLimit(Infinity)).toBe(SPEED_CEIL);
  });

  it('is linear between the clamps', () => {
    expect(speedLimit(1000)).toBeCloseTo(350, 10);
    expect(speedLimit(2000)).toBeCloseTo(700, 10);
    expect(speedLimit(4000)).toBeCloseTo(2 * speedLimit(2000), 10);
  });

  it('is continuous at both clamp joints', () => {
    const floorJoint = SPEED_FLOOR / SPEED_PER_SURFACE_DISTANCE;
    const ceilJoint = SPEED_CEIL / SPEED_PER_SURFACE_DISTANCE;
    expect(speedLimit(floorJoint)).toBeCloseTo(SPEED_FLOOR, 10);
    expect(speedLimit(floorJoint - 1e-6)).toBeCloseTo(SPEED_FLOOR, 5);
    expect(speedLimit(floorJoint + 1e-6)).toBeCloseTo(SPEED_FLOOR, 5);
    expect(speedLimit(ceilJoint)).toBeCloseTo(SPEED_CEIL, 10);
    expect(speedLimit(ceilJoint - 1e-6)).toBeCloseTo(SPEED_CEIL, 5);
    expect(speedLimit(ceilJoint + 1e-6)).toBeCloseTo(SPEED_CEIL, 5);
  });
});

describe('escapeRelief', () => {
  it('applies the full cap when heading at the body', () => {
    expect(escapeRelief(1)).toBe(0);
    expect(escapeRelief(RELIEF_START)).toBe(0);
  });

  it('fully lifts the cap when heading away', () => {
    expect(escapeRelief(RELIEF_FULL)).toBe(1);
    expect(escapeRelief(-1)).toBe(1);
  });

  it('is monotonic and continuous across the band', () => {
    let previous = escapeRelief(RELIEF_START + 0.01);
    for (let a = RELIEF_START; a >= RELIEF_FULL - 0.01; a -= 0.005) {
      const relief = escapeRelief(a);
      expect(relief).toBeGreaterThanOrEqual(previous);
      expect(relief - previous).toBeLessThan(0.05); // no steps
      previous = relief;
    }
  });
});

describe('directional speedLimit', () => {
  it('defaults to the strict head-on cap', () => {
    expect(speedLimit(1000)).toBeCloseTo(speedLimit(1000, 1), 10);
  });

  it('relaxes to the ceiling when flying away from a near surface', () => {
    expect(speedLimit(100, -1)).toBeCloseTo(SPEED_CEIL, 10);
    expect(speedLimit(0, RELIEF_FULL)).toBeCloseTo(SPEED_CEIL, 10);
  });

  it('gives partial relief on a grazing heading', () => {
    const strict = speedLimit(1000, 1);
    const grazing = speedLimit(1000, 0);
    expect(grazing).toBeGreaterThan(strict);
    expect(grazing).toBeLessThan(SPEED_CEIL);
  });

  it('never exceeds the ceiling nor drops below the strict cap', () => {
    for (let a = -1; a <= 1; a += 0.1) {
      const limit = speedLimit(2000, a);
      expect(limit).toBeGreaterThanOrEqual(speedLimit(2000, 1));
      expect(limit).toBeLessThanOrEqual(SPEED_CEIL);
    }
  });
});

describe('envelopeCap', () => {
  it('imposes no cap outside the envelope band', () => {
    expect(envelopeCap(1000, 100)).toBe(SPEED_CEIL); // 10 radii out
    expect(envelopeCap((ENVELOPE_RADII + ENVELOPE_BAND_RADII) * 100, 100)).toBe(SPEED_CEIL);
    expect(envelopeCap(Infinity, 0)).toBe(SPEED_CEIL); // no solid body around
  });

  it('settles at the head-on law value ENVELOPE_CAP_RADII radii out', () => {
    const r = 100;
    const inside = envelopeCap(r, r); // well below the band
    expect(inside).toBeCloseTo(ENVELOPE_CAP_RADII * r * SPEED_PER_SURFACE_DISTANCE, 10);
    expect(envelopeCap(0, r)).toBeCloseTo(inside, 10);
    expect(envelopeCap(-50, r)).toBeCloseTo(inside, 10); // mid soft-floor push-out
  });

  it('clamps to the law floor and ceiling so min(law, cap) never fights either', () => {
    // tiny body: the inside value would undercut the skim floor — clamp up
    expect(envelopeCap(0, 25)).toBe(SPEED_FLOOR);
    // huge body: the inside value would exceed the open-space ceiling
    expect(envelopeCap(0, 1e6)).toBe(SPEED_CEIL);
  });

  it('steps down continuously over the band around ENVELOPE_RADII', () => {
    const r = 100;
    let previous = envelopeCap((ENVELOPE_RADII + 0.3) * r, r);
    for (let x = ENVELOPE_RADII + 0.3; x >= ENVELOPE_RADII - 0.3; x -= 0.01) {
      const cap = envelopeCap(x * r, r);
      expect(cap).toBeLessThanOrEqual(previous + 1e-9); // monotone on approach
      expect(previous - cap).toBeLessThan(SPEED_CEIL * 0.05); // no snap
      previous = cap;
    }
    expect(previous).toBeCloseTo(envelopeCap(0, r), 5);
  });
});

describe('diffuseDrag', () => {
  it('is 1 at and outside the volume boundary', () => {
    expect(diffuseDrag(0, 1000)).toBe(1);
    expect(diffuseDrag(500, 1000)).toBe(1);
    expect(diffuseDrag(Infinity, 0)).toBe(1);
  });

  it('bottoms out at the floor at the volume centre', () => {
    expect(diffuseDrag(-1000, 1000)).toBeCloseTo(DIFFUSE_DRAG_FLOOR, 10);
    expect(diffuseDrag(-2000, 1000)).toBeCloseTo(DIFFUSE_DRAG_FLOOR, 10); // depth clamps
  });

  it('descends continuously with depth — entering never snaps or parks', () => {
    let previous = 1;
    for (let d = 0; d >= -1000; d -= 5) {
      const drag = diffuseDrag(d, 1000);
      expect(drag).toBeLessThanOrEqual(previous + 1e-12);
      expect(previous - drag).toBeLessThan(0.02); // no steps
      expect(drag).toBeGreaterThanOrEqual(DIFFUSE_DRAG_FLOOR);
      previous = drag;
    }
  });
});

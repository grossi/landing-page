import { describe, expect, it } from 'vitest';
import {
  DECK_FLOOR,
  DIFFUSE_DRAG_FLOOR,
  diffuseDrag,
  ENVELOPE_BAND_RADII,
  ENVELOPE_CAP_RADII,
  ENVELOPE_RADII,
  envelopeCap,
  ESCAPE_FLOOR,
  ESCAPE_SLOPE_FACTOR,
  escapeCeil,
  escapeRelief,
  FLOOR_TAPER_FULL_RADII,
  FLOOR_TAPER_START_RADII,
  RELIEF_FULL,
  RELIEF_START,
  SPEED_CEIL,
  SPEED_FLOOR,
  SPEED_PER_SURFACE_DISTANCE,
  speedFloor,
  speedLimit,
} from 'engine/core/motion';

describe('speedFloor', () => {
  it('keeps the full skim floor at and above the taper band', () => {
    expect(speedFloor(0.15 * 960, 960)).toBe(SPEED_FLOOR);
    // continuous at the band's outer edge
    expect(speedFloor(FLOOR_TAPER_START_RADII * 960, 960)).toBe(SPEED_FLOOR);
  });

  it('settles at the deck floor hugging the ground', () => {
    expect(speedFloor(FLOOR_TAPER_FULL_RADII * 960, 960)).toBe(DECK_FLOOR);
    expect(speedFloor(0, 960)).toBe(DECK_FLOOR);
    expect(speedFloor(-20, 960)).toBe(DECK_FLOOR); // mid soft-floor push-out
  });

  it('is monotone non-decreasing and continuous across the band', () => {
    const r = 500;
    let last = speedFloor(-r * 0.01, r);
    for (let d = 0; d <= r * 0.2; d += r * 0.001) {
      const f = speedFloor(d, r);
      expect(f).toBeGreaterThanOrEqual(last - 1e-9);
      expect(Math.abs(f - last)).toBeLessThan(2); // no steps
      expect(f).toBeGreaterThanOrEqual(DECK_FLOOR); // never parked
      last = f;
    }
  });

  it('keeps the plain floor when no solid body is scanned', () => {
    expect(speedFloor(50, Infinity)).toBe(SPEED_FLOOR);
    expect(speedFloor(50, 0)).toBe(SPEED_FLOOR);
    expect(speedFloor(50, NaN)).toBe(SPEED_FLOOR);
  });
});

describe('speedLimit', () => {
  it('clamps to the floor at and inside the surface', () => {
    expect(speedLimit(0)).toBe(SPEED_FLOOR);
    expect(speedLimit(-500)).toBe(SPEED_FLOOR);
    expect(speedLimit(1)).toBe(SPEED_FLOOR);
  });

  it('tapers the floor near the deck when given the body radius', () => {
    const r = 500;
    // orbit altitude: the old law exactly
    expect(speedLimit(FLOOR_TAPER_START_RADII * r, 1, r)).toBe(SPEED_FLOOR);
    // on the deck: the taper governs, never below DECK_FLOOR
    expect(speedLimit(FLOOR_TAPER_FULL_RADII * r, 1, r)).toBe(DECK_FLOOR);
    expect(speedLimit(-5, 1, r)).toBe(DECK_FLOOR); // mid push-out
    // the default radius reproduces the flat-floor law bit for bit
    expect(speedLimit(10)).toBe(speedLimit(10, 1, Infinity));
    expect(speedLimit(10, 1, Infinity)).toBe(SPEED_FLOOR);
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

  it('full relief near a surface grants the escape ramp, not the ceiling', () => {
    expect(speedLimit(100, -1)).toBeCloseTo(escapeCeil(100), 10);
    expect(speedLimit(0, -1)).toBeCloseTo(ESCAPE_FLOOR, 10);
    // far from everything the ramp has rejoined the ceiling
    expect(speedLimit(1e6, -1)).toBeCloseTo(SPEED_CEIL, 10);
  });

  it('angle easing: straight up beats just over the horizon', () => {
    const overHorizon = speedLimit(1000, -0.05);
    const steepClimb = speedLimit(1000, -0.6);
    const straightUp = speedLimit(1000, -1);
    expect(overHorizon).toBeGreaterThan(speedLimit(1000, 1));
    expect(steepClimb).toBeGreaterThan(overHorizon);
    expect(straightUp).toBeGreaterThan(steepClimb);
    expect(straightUp).toBeCloseTo(escapeCeil(1000), 10);
  });

  it('proximity easing: straight up opens with altitude', () => {
    const r = 698;
    const deck = speedLimit(0, -1, r);
    const low = speedLimit(0.5 * r, -1, r);
    const high = speedLimit(2 * r, -1, r);
    expect(deck).toBeCloseTo(ESCAPE_FLOOR, 10);
    expect(low).toBeGreaterThan(deck);
    expect(high).toBeGreaterThan(low);
  });

  it('gives partial relief on a grazing heading', () => {
    const strict = speedLimit(1000, 1);
    const grazing = speedLimit(1000, 0);
    expect(grazing).toBeGreaterThan(strict);
    expect(grazing).toBeLessThan(escapeCeil(1000));
  });

  it('never exceeds the escape ramp nor drops below the strict cap', () => {
    for (let a = -1; a <= 1; a += 0.1) {
      const limit = speedLimit(2000, a);
      expect(limit).toBeGreaterThanOrEqual(speedLimit(2000, 1));
      expect(limit).toBeLessThanOrEqual(escapeCeil(2000));
    }
  });
});

describe('escapeCeil', () => {
  it('starts at ESCAPE_FLOOR on (and inside) the surface', () => {
    expect(escapeCeil(0)).toBe(ESCAPE_FLOOR);
    expect(escapeCeil(-500)).toBe(ESCAPE_FLOOR); // mid soft-floor push-out
  });

  it('climbs ESCAPE_SLOPE_FACTOR× steeper than the approach law', () => {
    expect(escapeCeil(1000)).toBeCloseTo(
      ESCAPE_FLOOR + 1000 * SPEED_PER_SURFACE_DISTANCE * ESCAPE_SLOPE_FACTOR,
      10,
    );
  });

  it('rejoins the open-space ceiling and never exceeds it', () => {
    const rejoin = (SPEED_CEIL - ESCAPE_FLOOR) / (SPEED_PER_SURFACE_DISTANCE * ESCAPE_SLOPE_FACTOR);
    expect(escapeCeil(rejoin)).toBeCloseTo(SPEED_CEIL, 8);
    expect(escapeCeil(rejoin * 2)).toBe(SPEED_CEIL);
  });

  it('never drops below the head-on law, so relief only raises the limit', () => {
    for (let d = 0; d <= 12000; d += 250) {
      expect(escapeCeil(d)).toBeGreaterThanOrEqual(speedLimit(d, 1, 960));
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

  it('keeps a sane felt step at the true-scale radii', () => {
    // biggest rogue planet (radius 960): 2.5 · 960 · 0.35 = 840 u/s
    expect(envelopeCap(0, 960)).toBeCloseTo(840, 9);
    // the ×2 home sun (radius 800): 2.5 · 800 · 0.35 = 700 u/s
    expect(envelopeCap(0, 800)).toBeCloseTo(700, 9);
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

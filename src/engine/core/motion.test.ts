import { describe, expect, it } from 'vitest';
import {
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

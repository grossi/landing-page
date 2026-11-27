import { describe, expect, it } from 'vitest';
import { formatDistance, placeMarker, type MarkerPlacement } from 'components/ephemeris/marker';

const TAN = Math.tan((64 * Math.PI) / 360);
const ASPECT = 16 / 9;
const INSET_X = 0.86;
const INSET_Y = 0.7;

const place = (x: number, y: number, z: number, aspect = ASPECT): MarkerPlacement =>
  placeMarker({ x: 0, y: 0, onScreen: false, angle: 0 }, x, y, z, TAN, aspect, INSET_X, INSET_Y);

describe('placeMarker', () => {
  it('sits on a target in view', () => {
    const dead = place(0, 0, -1000);
    expect(dead).toMatchObject({ x: 0, y: 0, onScreen: true });

    // a target half-way to the right edge of the view
    const right = place(0.5 * 1000 * TAN * ASPECT, 0, -1000);
    expect(right.onScreen).toBe(true);
    expect(right.x).toBeCloseTo(0.5, 9);
    expect(right.y).toBeCloseTo(0, 9);

    const upLeft = place(-0.3 * 1000 * TAN * ASPECT, 0.4 * 1000 * TAN, -1000);
    expect(upLeft.x).toBeCloseTo(-0.3, 9);
    expect(upLeft.y).toBeCloseTo(0.4, 9);
  });

  it('goes to the edge of the inset rectangle for a target outside the view, on its side', () => {
    const right = place(5000, 0, -1000);
    expect(right).toMatchObject({ onScreen: false, y: 0 });
    expect(right.x).toBeCloseTo(INSET_X, 9);

    const above = place(0, 5000, -1000);
    expect(above.x).toBeCloseTo(0, 9);
    expect(above.y).toBeCloseTo(INSET_Y, 9);
  });

  it('never mirrors a target behind the ship', () => {
    // behind and to the left: a projected point would land on the right
    const behindLeft = place(-800, 100, 1000);
    expect(behindLeft.onScreen).toBe(false);
    expect(behindLeft.x).toBeLessThan(0);
    expect(behindLeft.y).toBeGreaterThan(0);
    expect(behindLeft.x).toBeCloseTo(-INSET_X, 9);

    const behindBelow = place(100, -900, 500);
    expect(behindBelow.y).toBeCloseTo(-INSET_Y, 9);
    expect(behindBelow.x).toBeGreaterThan(0);
  });

  it('keeps one side as a target passes from ahead to behind', () => {
    // a body sliding past on the right: z from far ahead to far behind
    let previous = place(900, 50, -4000);
    for (let z = -3500; z <= 4000; z += 250) {
      const now = place(900, 50, z);
      expect(now.x, `z ${z}`).toBeGreaterThan(0);
      expect(now.y, `z ${z}`).toBeGreaterThanOrEqual(0);
      // and it never jumps: each step moves the marker a little or not at all
      expect(Math.hypot(now.x - previous.x, now.y - previous.y), `z ${z}`).toBeLessThan(0.35);
      previous = now;
    }
    expect(previous.onScreen).toBe(false);
  });

  it('is continuous where a target leaves the view', () => {
    const edgeX = INSET_X * 1000 * TAN * ASPECT;
    const inside = place(edgeX * 0.999, 30, -1000);
    const outside = place(edgeX * 1.001, 30, -1000);
    expect(inside.onScreen).toBe(true);
    expect(outside.onScreen).toBe(false);
    expect(outside.x).toBeCloseTo(inside.x, 2);
    expect(outside.y).toBeCloseTo(inside.y, 2);
  });

  it('stays inside the rectangle wherever the target is', () => {
    for (const [x, y, z] of [
      [1e6, 1e6, -1], [-1e6, 3, 1e6], [0.001, -1e6, 5], [7, 7, 0], [-3, 0, 0], [1e6, -1e6, 1e6],
    ]) {
      const marker = place(x, y, z);
      expect(Math.abs(marker.x)).toBeLessThanOrEqual(INSET_X + 1e-9);
      expect(Math.abs(marker.y)).toBeLessThanOrEqual(INSET_Y + 1e-9);
      expect(Number.isFinite(marker.x) && Number.isFinite(marker.y) && Number.isFinite(marker.angle)).toBe(true);
    }
  });

  it('points down for a target straight behind, where there is no side', () => {
    const behind = place(0, 0, 2000);
    expect(behind).toMatchObject({ onScreen: false, x: 0 });
    expect(behind.y).toBeCloseTo(-INSET_Y, 9);
    expect(behind.angle).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('gives the screen angle toward the target', () => {
    expect(place(5000, 0, -1000).angle).toBeCloseTo(0, 9);
    expect(place(0, 5000, -1000).angle).toBeCloseTo(Math.PI / 2, 9);
    expect(place(-5000, 0, 1000).angle).toBeCloseTo(Math.PI, 9);
  });

  it('follows the true screen direction on a tall phone screen', () => {
    // 45° up and to the right in the world is 45° on screen, whatever the aspect
    const phone = place(3000, 3000, 500, 390 / 783);
    const widthPx = 390;
    const heightPx = 783;
    const px = (phone.x * widthPx) / 2;
    const py = (phone.y * heightPx) / 2;
    expect(px).toBeGreaterThan(0);
    expect(py / px).toBeCloseTo(1, 6);
    // on a tall screen that ray leaves through the side edge
    expect(phone.x).toBeCloseTo(INSET_X, 9);
  });
});

describe('formatDistance', () => {
  it('reads in km, then in Mm from ten thousand out', () => {
    expect(formatDistance(142.9)).toBe('142 km');
    expect(formatDistance(9999)).toBe('9999 km');
    expect(formatDistance(12400)).toBe('12.40 Mm');
    expect(formatDistance(-30)).toBe('0 km');
  });
});

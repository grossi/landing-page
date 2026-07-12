// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDustField, wrapAround } from 'engine/render/dust';

describe('wrapAround', () => {
  it('returns values already inside the band untouched', () => {
    expect(wrapAround(3, 0, 10)).toBe(3);
    expect(wrapAround(-10, 0, 10)).toBe(-10);
    expect(wrapAround(10, 0, 10)).toBe(10);
    expect(wrapAround(104, 100, 10)).toBe(104);
  });

  it('wraps a single-span overshoot to the opposite edge', () => {
    expect(wrapAround(10.5, 0, 10)).toBeCloseTo(-9.5, 10);
    expect(wrapAround(-10.5, 0, 10)).toBeCloseTo(9.5, 10);
  });

  it('wraps overshoots of any number of spans back in band, preserving phase', () => {
    // d = 101 → five full spans (span 20) + 1
    expect(wrapAround(101, 0, 10)).toBeCloseTo(1, 10);
    expect(wrapAround(100 + 101, 100, 10)).toBeCloseTo(101, 10);
  });

  it('is symmetric for negative overshoots', () => {
    expect(wrapAround(-101, 0, 10)).toBeCloseTo(-1, 10);
    expect(wrapAround(-1e6 - 3, 0, 10)).toBeCloseTo(wrapAround(1e6 + 3, 0, 10) * -1, 6);
  });

  it('always lands inside [center - range, center + range]', () => {
    for (const v of [-987.6, -21, 0, 3.14, 55, 1234.5]) {
      const w = wrapAround(v, 7, 10);
      expect(w).toBeGreaterThanOrEqual(-3);
      expect(w).toBeLessThanOrEqual(17);
    }
  });
});

describe('createDustField', () => {
  const positionsOf = (field: ReturnType<typeof createDustField>) =>
    field.points.geometry.getAttribute('position') as THREE.BufferAttribute;

  it('spawns `count` particles inside the origin-centered cube', () => {
    const field = createDustField({ count: 50, range: 20 });
    const pos = positionsOf(field);
    expect(pos.count).toBe(50);
    for (let i = 0; i < pos.array.length; i++) {
      expect(Math.abs((pos.array as Float32Array)[i])).toBeLessThanOrEqual(20);
    }
    field.dispose();
  });

  it('advects by velocity * dt', () => {
    const field = createDustField({ count: 1, range: 10 });
    const pos = positionsOf(field);
    pos.setXYZ(0, 0, 1, -2);
    field.update(0.5, new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 4, -6));
    expect(pos.getX(0)).toBeCloseTo(1, 6);
    expect(pos.getY(0)).toBeCloseTo(3, 6);
    expect(pos.getZ(0)).toBeCloseTo(-5, 6);
    field.dispose();
  });

  it('wraps a particle advected past the edge to the opposite side', () => {
    const field = createDustField({ count: 1, range: 10 });
    const pos = positionsOf(field);
    pos.setXYZ(0, 9.5, 0, 0);
    field.update(1, new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, 0));
    // 9.5 + 2 = 11.5 → wraps to -8.5
    expect(pos.getX(0)).toBeCloseTo(-8.5, 5);
    field.dispose();
  });

  it('recenters all particles around a far-away center (warp jump)', () => {
    const field = createDustField({ count: 30, range: 10 });
    const center = new THREE.Vector3(5000, -3000, 900);
    field.update(0.016, center);
    const pos = positionsOf(field);
    for (let i = 0; i < pos.count; i++) {
      expect(Math.abs(pos.getX(i) - center.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(pos.getY(i) - center.y)).toBeLessThanOrEqual(10);
      expect(Math.abs(pos.getZ(i) - center.z)).toBeLessThanOrEqual(10);
    }
    field.dispose();
  });

  it('does not mark the attribute dirty when nothing moved', () => {
    const field = createDustField({ count: 4, range: 100 });
    const pos = positionsOf(field);
    const versionBefore = pos.version;
    // particles spawn inside [-100, 100]; no velocity, center unchanged
    field.update(0.016, new THREE.Vector3(0, 0, 0));
    expect(pos.version).toBe(versionBefore);
    // and marks it dirty as soon as something does move
    field.update(0.016, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
    expect(pos.version).toBe(versionBefore + 1);
    field.dispose();
  });
});

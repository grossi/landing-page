import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createResourceTracker } from 'engine/render/resourceTracker';
import { buildShipRig } from 'engine/render/shipRig';

describe('buildShipRig', () => {
  it('keeps visual banking independent of the control frame', () => {
    const tracker = createResourceTracker();
    const { ship, shipBody } = buildShipRig(tracker);
    expect(ship.children).toEqual([shipBody]);
    shipBody.rotation.z = 0.5;
    expect(ship.quaternion.equals(new THREE.Quaternion())).toBe(true);
    tracker.dispose();
  });

  it('keeps a symmetric hull facing -z within the chase-camera footprint', () => {
    const tracker = createResourceTracker();
    const { shipBody } = buildShipRig(tracker);
    const box = new THREE.Box3().setFromObject(shipBody);
    expect(box.min.x).toBeCloseTo(-box.max.x, 6);
    expect(box.max.x - box.min.x).toBeLessThan(4.5);
    expect(box.min.z).toBeCloseTo(-2.25, 6);
    expect(box.max.z).toBeLessThan(1.6);
    expect(box.max.y).toBeLessThan(0.8);
    const hull = shipBody.getObjectByName('hull') as THREE.Mesh;
    const positions = hull.geometry.getAttribute('position');
    // The most forward vertices form a narrow nose, not a backwards engine.
    for (let i = 0; i < positions.count; i++) {
      if (positions.getZ(i) < -2)
        expect(Math.abs(positions.getX(i))).toBeLessThan(0.02);
    }
    tracker.dispose();
  });

  it('tracks every geometry and material for disposal exactly once', () => {
    const tracker = createResourceTracker();
    const { shipBody } = buildShipRig(tracker);
    const resources = new Set<THREE.BufferGeometry | THREE.Material>();
    shipBody.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        resources.add(obj.geometry);
        const materials = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        materials.forEach((material) => resources.add(material));
      }
    });
    const disposed = new Map<THREE.BufferGeometry | THREE.Material, number>();
    resources.forEach((resource) =>
      resource.addEventListener('dispose', () =>
        disposed.set(resource, (disposed.get(resource) ?? 0) + 1)
      )
    );
    expect(resources.size).toBeGreaterThan(0);
    tracker.dispose();
    for (const resource of resources) expect(disposed.get(resource)).toBe(1);
    tracker.dispose();
    for (const resource of resources) expect(disposed.get(resource)).toBe(1);
  });
});

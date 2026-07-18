import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createResourceTracker } from 'engine/render/resourceTracker';
import { buildShipRig } from 'engine/render/shipRig';

describe('buildShipRig', () => {
  it('builds the control frame with the banked body as its only child', () => {
    const { ship, shipBody } = buildShipRig(createResourceTracker());
    expect(ship.children).toEqual([shipBody]);
    expect(shipBody.children).toHaveLength(2);
    const [nose, wing] = shipBody.children;
    expect(nose).toBeInstanceOf(THREE.Mesh);
    expect(wing).toBeInstanceOf(THREE.Line);
  });

  it('points the nose toward -z (camera forward)', () => {
    const { shipBody } = buildShipRig(createResourceTracker());
    const nose = shipBody.children[0] as THREE.Mesh;
    nose.geometry.computeBoundingBox();
    const box = nose.geometry.boundingBox!;
    expect(box.min.z).toBeCloseTo(-1.3, 6);
    expect(box.max.z).toBeCloseTo(1.3, 6);
    expect(box.max.y).toBeLessThan(1.3);
  });

  it('setOpacity drives both transparent materials (the departure fade)', () => {
    const rig = buildShipRig(createResourceTracker());
    rig.setOpacity(0.35);
    for (const child of rig.shipBody.children) {
      const mat = (child as THREE.Mesh).material as THREE.Material;
      expect(mat.transparent).toBe(true);
      expect(mat.opacity).toBe(0.35);
    }
  });

  it('tracks every geometry and material for disposal', () => {
    const tracker = createResourceTracker();
    const { shipBody } = buildShipRig(tracker);
    const disposed = new Set<unknown>();
    for (const child of shipBody.children) {
      const obj = child as THREE.Mesh;
      obj.geometry.addEventListener('dispose', () => disposed.add(obj.geometry));
      const material = obj.material as THREE.Material;
      material.addEventListener('dispose', () => disposed.add(material));
    }
    tracker.dispose();
    expect(disposed.size).toBe(4);
  });
});

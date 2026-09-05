import * as THREE from 'three';
import { createShipBody } from '../../../public/arcade/shared/ship.js';
import type { ResourceTracker } from 'engine/render/resourceTracker';

export interface ShipRig {
  /** Control frame: position + attitude quaternion live here. */
  ship: THREE.Group;
  /** Visual child, banked into the turn (engine/core/flight `bankBody`). */
  shipBody: THREE.Group;
}

/** Shared terminal interceptor; GPU resources belong to this rig's tracker. */
export function buildShipRig(tracker: ResourceTracker): ShipRig {
  const ship = new THREE.Group();
  const shipBody = createShipBody(THREE);
  shipBody.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      tracker.track(child.geometry);
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach((material) => tracker.track(material));
    }
  });
  ship.add(shipBody);
  return { ship, shipBody };
}

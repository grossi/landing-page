import * as THREE from 'three';
import { wireMat } from 'engine/render/assets';
import type { ResourceTracker } from 'engine/render/resourceTracker';

export interface ShipRig {
  /** Control frame: position + attitude quaternion live here. */
  ship: THREE.Group;
  /** Visual child, banked into the turn (engine/core/flight `bankBody`). */
  shipBody: THREE.Group;
}

/**
 * The shared wireframe ship: a four-sided cone nose plus a line-drawn delta
 * wing, nose toward -z (camera forward). Geometries and materials are
 * tracked on `tracker`; the caller positions `ship` and adds it to a scene.
 */
export function buildShipRig(tracker: ResourceTracker): ShipRig {
  const ship = new THREE.Group();
  const shipBody = new THREE.Group();
  const noseGeo = tracker.track(new THREE.ConeGeometry(0.8, 2.6, 4));
  noseGeo.rotateX(-Math.PI / 2);
  shipBody.add(new THREE.Mesh(noseGeo, tracker.track(wireMat(1))));
  const wingGeo = tracker.track(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(2, 0, 1),
      new THREE.Vector3(-2, 0, 1),
    ]),
  );
  shipBody.add(new THREE.Line(wingGeo, tracker.track(new THREE.LineBasicMaterial({ color: 0xffffff }))));
  ship.add(shipBody);
  return { ship, shipBody };
}

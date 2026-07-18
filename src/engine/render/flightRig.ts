import * as THREE from 'three';
import {
  attitudeFromDirection,
  attitudeQuaternion,
  bankBody,
  BOOST_FOV,
  chaseTarget,
  CRUISE_FOV,
  easeFovValue,
  steerAttitude,
  updateChaseCamera,
  type Attitude,
} from 'engine/core/flight';
import type { ResourceTracker } from 'engine/render/resourceTracker';
import { buildShipRig } from 'engine/render/shipRig';

/**
 * Ship spawn point for an engage (`arm`), in the ship's own frame relative
 * to the camera: low and behind the near plane, so a blend can carry it
 * under the view toward the chase dock without ever popping into frame.
 */
export const SHIP_ENTRY = new THREE.Vector3(0, -2.6, 18);
/**
 * Arrival-target ease rate (1/s): exponential approach — fast past the lens
 * early, decelerating into station. The chase camera follows continuously,
 * so arrival needn't finish on any schedule.
 */
export const SHIP_ARRIVAL_RATE = 1.5;

/** A virtual camera pose: what a scene copies (or blends) into its real one. */
export interface FlightRigPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fov: number;
}

/**
 * The stateful flight rig: the shared wireframe ship (mesh + roll-free
 * control frame) plus a VIRTUAL chase-camera pose, advanced by the shared
 * flight laws (engine/core/flight). The rig never touches a real camera —
 * scenes copy `pose` verbatim (EPHEMERIS) or crossfade toward it (the
 * DEEP FIELD transition), so two live rigs can coexist over one camera.
 */
export interface FlightRig {
  /** Control frame: position + roll-free attitude quaternion live here. */
  ship: THREE.Group;
  /** Visual child, banked into the turn; the caller sets visibility. */
  shipBody: THREE.Group;
  /** The live yaw/pitch control frame (exposed for HUD/debug reads). */
  attitude: Attitude;
  /** The live virtual chase-camera pose. Owned, preallocated. */
  pose: FlightRigPose;
  /** One steering frame: deflection → attitude → ship quaternion + bank. */
  steer(steerX: number, steerY: number, dt: number): void;
  /**
   * One-shot converged snap for spawn/warp: seeds the attitude from
   * `direction` (unit length; pitch-clamped like attitudeFromDirection) —
   * or keeps the current attitude when omitted — then parks the virtual
   * camera exactly at the chase pose, zero trail. Caller sets
   * `ship.position` first.
   */
  seed(direction?: { x: number; y: number; z: number }): void;
  /**
   * Engage hook: seeds the attitude from `heading`, places the ship at
   * `camPose.position + R_ship·SHIP_ENTRY`, and snaps `pose` to `camPose`
   * verbatim (position, quaternion, fov) — the virtual camera starts
   * exactly where the real one is, so a blend from it opens at identity.
   */
  arm(camPose: FlightRigPose, heading: { x: number; y: number; z: number }): void;
  /** Sets (or with `null` clears) the world-space arrival target. */
  flyTo(station: THREE.Vector3 | null): void;
  /**
   * One frame of the rig's own dynamics: arrival ease (if a station is
   * set), then the chase lerp/slerp onto `pose`, then the FOV boost cue.
   * `trailLag` extends the chase offset for world-streams-past scenes
   * (chaseLag) — default 0, the plain translating-ship chase. Positional
   * args: an options object would be one allocation per frame.
   */
  update(dt: number, boost: boolean, trailLag?: number): void;
  /**
   * Floating-origin shift: subtracts `delta` from `ship.position` AND
   * `pose.position`, so the virtual camera rides the same rebase the real
   * one used to get and the chase trail is preserved across it.
   */
  applyRebase(delta: THREE.Vector3): void;
}

/**
 * Builds a flight rig around a fresh `buildShipRig` ship. GPU resources are
 * tracked on `tracker`; the caller adds `ship` to a scene and positions it.
 * The pose starts at the world origin at CRUISE_FOV — call `seed` (or
 * `arm`) before the first frame. Zero allocation in `steer`/`update`.
 */
export function createFlightRig(tracker: ResourceTracker): FlightRig {
  const { ship, shipBody } = buildShipRig(tracker);
  const attitude: Attitude = { yaw: 0, pitch: 0 };
  const pose: FlightRigPose = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    fov: CRUISE_FOV,
  };
  // arrival target, copied (not referenced) so callers may reuse their vector
  const station = new THREE.Vector3();
  let hasStation = false;
  const scratchEntry = new THREE.Vector3();
  const scratchChase = new THREE.Vector3();

  return {
    ship,
    shipBody,
    attitude,
    pose,
    steer(steerX, steerY, dt) {
      steerAttitude(attitude, steerX, steerY, dt);
      attitudeQuaternion(attitude, ship.quaternion);
      bankBody(shipBody, steerX, dt);
    },
    seed(direction) {
      hasStation = false; // a snap supersedes any in-flight arrival
      if (direction) attitudeFromDirection(attitude, direction);
      attitudeQuaternion(attitude, ship.quaternion);
      chaseTarget(pose.position, ship.quaternion, ship.position);
      pose.quaternion.copy(ship.quaternion);
    },
    arm(camPose, heading) {
      hasStation = false; // a re-engage must not inherit the last station
      shipBody.rotation.z = 0; // nor a residual bank from the last flight
      attitudeFromDirection(attitude, heading);
      attitudeQuaternion(attitude, ship.quaternion);
      ship.position
        .copy(camPose.position)
        .add(scratchEntry.copy(SHIP_ENTRY).applyQuaternion(ship.quaternion));
      pose.position.copy(camPose.position);
      pose.quaternion.copy(camPose.quaternion);
      pose.fov = camPose.fov;
    },
    flyTo(target) {
      hasStation = target !== null;
      if (target) station.copy(target);
    },
    update(dt, boost, trailLag = 0) {
      if (hasStation) ship.position.lerp(station, Math.min(1, dt * SHIP_ARRIVAL_RATE));
      chaseTarget(scratchChase, ship.quaternion, ship.position, trailLag);
      updateChaseCamera(pose, scratchChase, ship.quaternion, dt);
      pose.fov = easeFovValue(pose.fov, boost ? BOOST_FOV : CRUISE_FOV, dt);
    },
    applyRebase(delta) {
      ship.position.sub(delta);
      pose.position.sub(delta);
    },
  };
}

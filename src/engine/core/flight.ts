import * as THREE from 'three';

/**
 * Shared flight rig math: the yaw/pitch control frame, pointer steering
 * rates, visual banking and the trailing chase camera. Single source of
 * truth for the ship feel, shared by EPHEMERIS and the landing background.
 *
 * The control frame is a roll-free YXZ attitude: `yaw` then `pitch`, roll
 * permanently 0 — banking is purely visual, applied to a child object
 * (`bankBody`) so it never feeds back into the flight direction.
 */

/** Ship forward in the control frame. Read-only. */
export const FORWARD = new THREE.Vector3(0, 0, -1);
/** Yaw rate at full pointer deflection (rad/s). */
export const YAW_RATE = 2.2;
/** Pitch rate at full pointer deflection (rad/s). */
export const PITCH_RATE = 1.7;
/** Pitch clamp (rad) — keeps the nose off the poles, where yaw degenerates. */
export const PITCH_CLAMP = 1.35;
/** Visual bank angle per unit of steer (rad), leaning into the turn. */
export const BANK_PER_STEER = 0.9;
/** Bank easing rate (1/s). */
export const BANK_RATE = 8;
/** Chase-camera offset in the ship's control frame. Read-only. */
export const CHASE_OFFSET = new THREE.Vector3(0, 2.6, 9);
/**
 * Cap on how far the chase camera may trail its pose (units). The trail is
 * the speed cue, but past this the ship reads as a speck instead of fast.
 */
export const CAMERA_MAX_LAG = 12;
/** Chase-camera position lerp rate (1/s); the lag it leaves is the speed cue. */
export const CHASE_POS_RATE = 5;
/** Chase-camera orientation slerp rate (1/s). */
export const CHASE_QUAT_RATE = 6;

export interface Attitude {
  yaw: number;
  pitch: number;
}

// scratch Euler for attitude → quaternion (a fresh one per call is garbage)
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const scratchLag = new THREE.Vector3();

/** Integrates one steering frame: pointer deflection into the attitude. */
export function steerAttitude(attitude: Attitude, steerX: number, steerY: number, dt: number): void {
  attitude.yaw -= steerX * YAW_RATE * dt;
  attitude.pitch -= steerY * PITCH_RATE * dt;
  attitude.pitch = Math.max(-PITCH_CLAMP, Math.min(PITCH_CLAMP, attitude.pitch));
}

/** Writes the attitude's roll-free orientation into `out` and returns it. */
export function attitudeQuaternion(attitude: Attitude, out: THREE.Quaternion): THREE.Quaternion {
  return out.setFromEuler(scratchEuler.set(attitude.pitch, attitude.yaw, 0));
}

/**
 * Seeds the attitude so `FORWARD · attitudeQuaternion` equals `dir` (unit
 * length assumed) — the inverse of the control frame, used to hand an
 * external heading to the rig without a pose jump.
 */
export function attitudeFromDirection(attitude: Attitude, dir: { x: number; y: number; z: number }): void {
  attitude.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  attitude.yaw = Math.atan2(-dir.x, -dir.z);
}

/** Eases the visual bank toward the current steer; call once per frame. */
export function bankBody(body: THREE.Object3D, steerX: number, dt: number): void {
  body.rotation.z += (-steerX * BANK_PER_STEER - body.rotation.z) * Math.min(1, dt * BANK_RATE);
}

/** Writes the chase camera's target pose position into `out` and returns it. */
export function chaseTarget(
  out: THREE.Vector3,
  shipQuaternion: THREE.Quaternion,
  shipPosition: THREE.Vector3,
): THREE.Vector3 {
  return out.copy(CHASE_OFFSET).applyQuaternion(shipQuaternion).add(shipPosition);
}

/**
 * One chase-camera frame. The position lerp trails the pose by ~speed/5
 * units, which reads as the ship pulling ahead under a burn — good — but
 * unclamped it shrinks the ship to a speck at full boost, so the trail is
 * capped at `CAMERA_MAX_LAG`.
 */
export function updateChaseCamera(
  camera: THREE.Object3D,
  camTarget: THREE.Vector3,
  shipQuaternion: THREE.Quaternion,
  dt: number,
): void {
  camera.position.lerp(camTarget, Math.min(1, dt * CHASE_POS_RATE));
  scratchLag.copy(camera.position).sub(camTarget);
  const lag = scratchLag.length();
  if (lag > CAMERA_MAX_LAG) {
    camera.position.copy(camTarget).addScaledVector(scratchLag, CAMERA_MAX_LAG / lag);
  }
  camera.quaternion.slerp(shipQuaternion, Math.min(1, dt * CHASE_QUAT_RATE));
}

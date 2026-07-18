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
/** Steer deflection commanded by the A/D and arrow keys. */
export const KEY_STEER = 0.7;
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
/** Camera FOV at cruise / under boost (the DEEP FIELD throttle-widen cue). */
export const CRUISE_FOV = 64;
export const BOOST_FOV = 71;
/** FOV easing rate (1/s). */
export const FOV_RATE = 5;
/**
 * Velocity response rates (1/s), asymmetric on purpose: the boost kick is
 * felt, the slowdown never slams.
 */
export const ACCEL_RATE = 2.2;
export const ACCEL_RATE_BOOST = 3.4;
export const DECEL_RATE = 1.4;

export interface Attitude {
  yaw: number;
  pitch: number;
}

// scratch Euler for attitude → quaternion (a fresh one per call is garbage)
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const scratchLag = new THREE.Vector3();

/**
 * Resolves the frame's steer deflection from pointer + keys. Input is
 * standard GL NDC (y up); the output steer is screen-down (pointer below
 * center pitches down) — the y flip lives here and nowhere else. Both axes
 * clamp to ±1: window-level listeners and captured pointers keep reporting
 * past the canvas edge. The A/D and arrow keys override the pointer's x
 * at the fixed KEY_STEER deflection.
 */
export function resolveSteer(
  out: { x: number; y: number },
  ndcX: number,
  ndcY: number,
  keys: Record<string, boolean>,
): void {
  out.x = Math.max(-1, Math.min(1, ndcX));
  out.y = Math.max(-1, Math.min(1, -ndcY));
  if (keys.ArrowLeft || keys.KeyA) out.x = -KEY_STEER;
  if (keys.ArrowRight || keys.KeyD) out.x = KEY_STEER;
}

/** True while any burn key (W / ArrowUp / Space) is held. */
export function burnKeysDown(keys: Record<string, boolean>): boolean {
  return !!(keys.KeyW || keys.ArrowUp || keys.Space);
}

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
 * external heading to the rig without a pose jump. Pitch is clamped to the
 * steering envelope, so exactness holds while `|dir.y|` stays inside
 * `sin(PITCH_CLAMP)`; steeper directions seed the nearest legal pitch.
 */
export function attitudeFromDirection(attitude: Attitude, dir: { x: number; y: number; z: number }): void {
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
  attitude.pitch = Math.max(-PITCH_CLAMP, Math.min(PITCH_CLAMP, pitch));
  attitude.yaw = Math.atan2(-dir.x, -dir.z);
}

/** Eases the visual bank toward the current steer; call once per frame. */
export function bankBody(body: THREE.Object3D, steerX: number, dt: number): void {
  body.rotation.z += (-steerX * BANK_PER_STEER - body.rotation.z) * Math.min(1, dt * BANK_RATE);
}

/**
 * Writes the chase camera's target pose position into `out` and returns it.
 * `lag` extends the offset along −FORWARD (further behind the ship) in the
 * local frame before rotating into world — callers whose ship never
 * translates pass `chaseLag(speed)` here to stand in for the trail the
 * position lerp would otherwise develop. Default 0: the plain chase pose.
 */
export function chaseTarget(
  out: THREE.Vector3,
  shipQuaternion: THREE.Quaternion,
  shipPosition: THREE.Vector3,
  lag = 0,
): THREE.Vector3 {
  out.copy(CHASE_OFFSET);
  out.z += lag;
  return out.applyQuaternion(shipQuaternion).add(shipPosition);
}

/**
 * Steady-state trail the chase position lerp develops when the ship
 * translates at `speed` (units behind the pose, clamped like the lerp is).
 * For callers in the world-streams-past frame — ship stationary, so the
 * lerp fully converges — who must emulate that trail to keep the ship at
 * the same apparent distance.
 */
export function chaseLag(speed: number): number {
  return Math.min(speed / CHASE_POS_RATE, CAMERA_MAX_LAG);
}

/**
 * One chase-camera frame. The position lerp trails the pose by ~speed/5
 * units, which reads as the ship pulling ahead under a burn — good — but
 * unclamped it shrinks the ship to a speck at full boost, so the trail is
 * capped at `CAMERA_MAX_LAG`.
 */
export function updateChaseCamera(
  camera: { position: THREE.Vector3; quaternion: THREE.Quaternion },
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

/**
 * The pure FOV easing law: one step of `current` toward `targetFov` at the
 * shared FOV_RATE. Inert (returns `current` unchanged) within the 0.01 dead
 * band — callers key the projection-matrix rebuild off the value changing.
 */
export function easeFovValue(current: number, targetFov: number, dt: number): number {
  if (Math.abs(current - targetFov) > 0.01) {
    return current + (targetFov - current) * Math.min(1, dt * FOV_RATE);
  }
  return current;
}

/**
 * Eases the camera FOV toward `targetFov` at the shared FOV_RATE; call once
 * per frame. Inert (and skips the projection-matrix rebuild) within 0.01 of
 * the target.
 */
export function easeFov(camera: THREE.PerspectiveCamera, targetFov: number, dt: number): void {
  const next = easeFovValue(camera.fov, targetFov, dt);
  if (next !== camera.fov) {
    camera.fov = next;
    camera.updateProjectionMatrix();
  }
}

/**
 * Eases the camera FOV toward the boost/cruise target; call once per frame.
 * Boost widens the view a touch — the shared speed cue.
 */
export function updateFov(camera: THREE.PerspectiveCamera, boost: boolean, dt: number): void {
  easeFov(camera, boost ? BOOST_FOV : CRUISE_FOV, dt);
}

/** Selects the asymmetric velocity response rate: accelerating chases the target (harder under boost), decelerating always eases. */
export function speedResponseRate(currentSpeed: number, targetSpeed: number, boost: boolean): number {
  return currentSpeed < targetSpeed ? (boost ? ACCEL_RATE_BOOST : ACCEL_RATE) : DECEL_RATE;
}

import * as THREE from 'three';

/**
 * Shared flight rig math: quaternion attitude with body-rate steering, the
 * roll leveler, pointer steering rates, visual banking and the trailing
 * chase camera. Single source of truth for the ship feel, shared by
 * EPHEMERIS and the landing background.
 *
 * Attitude is a quaternion integrated from body rates (steer commands
 * rates about the ship's own axes), so there is no pitch clamp and no pole
 * singularity — loops and full circles are legal. The horizon is kept by
 * an assist, not the representation: `levelRoll` eases roll toward a
 * reference up when the player isn't maneuvering. Banking stays purely
 * visual, applied to a child object (`bankBody`) so it never feeds back
 * into the flight direction.
 */

/** Ship forward in the control frame. Read-only. */
export const FORWARD = new THREE.Vector3(0, 0, -1);
/** Yaw rate at full pointer deflection (rad/s). */
export const YAW_RATE = 2.2;
/** Pitch rate at full pointer deflection (rad/s). */
export const PITCH_RATE = 1.7;
/** Steer deflection commanded by the WASD and arrow keys. */
export const KEY_STEER = 0.7;
/**
 * Default reference up for the roll leveler and heading hand-offs.
 * Read-only — pass a planet-surface normal to level locally instead.
 */
export const WORLD_UP = new THREE.Vector3(0, 1, 0);
/**
 * Roll-leveler ease rate (1/s). Gentle by design: rights a tilted horizon
 * over a few seconds of hands-off flight. 0 disables the assist.
 */
export const LEVEL_RATE = 1.2;
/**
 * Steer deflection at which the leveler is fully faded out — the assist
 * rights idle cruise but never fights a maneuver (key steer at 0.7 and any
 * decisive pointer deflection silence it entirely).
 */
export const LEVEL_STEER_FADE = 0.5;
/**
 * Ease rate (1/s) for the reference up itself, when a scene retargets it —
 * e.g. onto a planet's surface normal on approach (easeUpVector). Slightly
 * above LEVEL_RATE so the roll assist, not the retarget, is what the eye
 * reads settling the horizon.
 */
export const SURFACE_UP_RATE = 1.5;
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

// module scratch (a fresh object per call is per-frame garbage)
const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const scratchStep = new THREE.Quaternion();
const scratchRight = new THREE.Vector3();
const scratchUp = new THREE.Vector3();
const scratchForward = new THREE.Vector3();
const scratchMat = new THREE.Matrix4();
const scratchEye = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchLag = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * Resolves the frame's steer deflection from pointer + keys. Input is
 * standard GL NDC (y up); the output steer is screen-down (pointer below
 * center pitches down) — the y flip lives here and nowhere else. Both axes
 * clamp to ±1: window-level listeners and captured pointers keep reporting
 * past the canvas edge. WASD and the arrow keys override the pointer at
 * the fixed KEY_STEER deflection; note positive steer y is nose DOWN, so
 * W/ArrowUp (tilt up) command −KEY_STEER.
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
  if (keys.ArrowUp || keys.KeyW) out.y = -KEY_STEER;
  if (keys.ArrowDown || keys.KeyS) out.y = KEY_STEER;
}

/** True while the burn key (Space) is held. */
export function burnKeysDown(keys: Record<string, boolean>): boolean {
  return !!keys.Space;
}

/**
 * Integrates one steering frame as body rates on the attitude quaternion:
 * steerX yaws about the ship's local up, steerY pitches about its local
 * right (positive steer y noses DOWN, matching resolveSteer's screen-down
 * sense). Singularity-free: loops and full circles are legal. Normalized
 * every step to kill float drift.
 */
export function steerQuaternion(q: THREE.Quaternion, steerX: number, steerY: number, dt: number): void {
  scratchStep.setFromEuler(
    scratchEuler.set(-steerY * PITCH_RATE * dt, -steerX * YAW_RATE * dt, 0),
  );
  q.multiply(scratchStep).normalize();
}

/**
 * The flight-assist roll leveler: one frame easing the attitude's roll —
 * rotation about its own forward axis — toward the reference `up`. A pure
 * roll never resists pitch or yaw, so maneuvers stay free; the assist
 * additionally fades out toward the poles (level is meaningless with the
 * nose straight up) and above `steerMag` ≥ LEVEL_STEER_FADE, so it rights
 * idle cruise but never fights the player. `rate` 0 disables.
 */
export function levelRoll(
  q: THREE.Quaternion,
  steerMag: number,
  dt: number,
  up: THREE.Vector3 = WORLD_UP,
  rate: number = LEVEL_RATE,
): void {
  if (rate <= 0) return;
  const steerFade = 1 - Math.abs(steerMag) / LEVEL_STEER_FADE;
  if (steerFade <= 0) return;
  scratchRight.set(1, 0, 0).applyQuaternion(q);
  scratchUp.set(0, 1, 0).applyQuaternion(q);
  const err = Math.atan2(up.dot(scratchRight), up.dot(scratchUp));
  if (Math.abs(err) < 1e-9) return;
  scratchForward.copy(FORWARD).applyQuaternion(q);
  const poleFade = 1 - Math.abs(scratchForward.dot(up));
  const k = Math.min(1, dt * rate * steerFade * poleFade);
  if (k === 0) return;
  // roll about local forward (−Z): about +Z by −err brings local up onto `up`
  q.multiply(scratchStep.setFromAxisAngle(Z_AXIS, -err * k)).normalize();
}

/**
 * Writes into `q` the attitude whose FORWARD equals `dir` (unit length
 * assumed) with roll leveled to `up` — the heading hand-off used to seed
 * the rig from an external direction without a pose jump. Where `dir` is
 * (anti)parallel to `up` the roll is arbitrary but stable (three.js lookAt
 * fallback). Returns `q`.
 */
export function quaternionFromDirection(
  q: THREE.Quaternion,
  dir: { x: number; y: number; z: number },
  up: THREE.Vector3 = WORLD_UP,
): THREE.Quaternion {
  scratchMat.lookAt(scratchEye.set(0, 0, 0), scratchDir.set(dir.x, dir.y, dir.z), up);
  return q.setFromRotationMatrix(scratchMat);
}

/**
 * One frame easing a unit reference-up vector toward `target` (unit length
 * assumed): normalized lerp, so intermediate frames stay unit and the swing
 * follows the short arc. Exactly-antipodal inputs snap to `target` — the arc
 * side is arbitrary there, and at real frame rates the nlerp would otherwise
 * renormalize back to the start and stall forever. Feeds `levelRoll`'s `up`
 * when a scene retargets the horizon, e.g. onto the local surface normal of
 * a nearby planet.
 */
export function easeUpVector(
  up: THREE.Vector3,
  target: THREE.Vector3,
  dt: number,
  rate: number = SURFACE_UP_RATE,
): void {
  if (up.dot(target) < -0.9999) {
    up.copy(target);
    return;
  }
  up.lerp(target, Math.min(1, dt * rate));
  up.normalize();
}

/** Eases the visual bank toward the current steer; call once per frame. */
export function bankBody(body: THREE.Object3D, steerX: number, dt: number): void {
  body.rotation.z += (-steerX * BANK_PER_STEER - body.rotation.z) * Math.min(1, dt * BANK_RATE);
}

/**
 * Writes the chase camera's target pose position into `out` and returns it.
 * `lag` pushes the offset further behind the ship (local frame, before the
 * world rotation) — world-streams-past callers pass `chaseLag(speed)` to
 * stand in for the trail the position lerp would develop on a moving ship.
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
 * Steady-state trail the chase position lerp develops at `speed` (units
 * behind the pose, clamped like the lerp is) — feeds `chaseTarget` from
 * stationary-ship callers to keep the apparent ship distance in parity.
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
 * One step of `current` toward `targetFov` at FOV_RATE. Returns `current`
 * unchanged within the 0.01 dead band — callers key the projection-matrix
 * rebuild off the value changing.
 */
export function easeFovValue(current: number, targetFov: number, dt: number): number {
  if (Math.abs(current - targetFov) > 0.01) {
    return current + (targetFov - current) * Math.min(1, dt * FOV_RATE);
  }
  return current;
}

/** Selects the asymmetric velocity response rate: accelerating chases the target (harder under boost), decelerating always eases. */
export function speedResponseRate(currentSpeed: number, targetSpeed: number, boost: boolean): number {
  return currentSpeed < targetSpeed ? (boost ? ACCEL_RATE_BOOST : ACCEL_RATE) : DECEL_RATE;
}

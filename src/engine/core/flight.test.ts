import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ACCEL_RATE,
  ACCEL_RATE_BOOST,
  bankBody,
  BOOST_FOV,
  burnKeysDown,
  chaseLag,
  chaseTarget,
  CRUISE_FOV,
  DECEL_RATE,
  easeFov,
  easeFovValue,
  FORWARD,
  FOV_RATE,
  KEY_STEER,
  LEVEL_RATE,
  LEVEL_STEER_FADE,
  levelRoll,
  PITCH_RATE,
  quaternionFromDirection,
  resolveSteer,
  speedResponseRate,
  steerQuaternion,
  updateChaseCamera,
  updateFov,
  WORLD_UP,
  YAW_RATE,
} from 'engine/core/flight';

const yxz = (pitch: number, yaw: number, roll = 0) =>
  new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));

describe('steerQuaternion', () => {
  it('integrates the steering rates about the body axes', () => {
    const q = new THREE.Quaternion();
    steerQuaternion(q, 0.5, -0.25, 0.1);
    const e = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(q);
    expect(e.y).toBeCloseTo(-0.11, 12); // 0.5 · 2.2 rad/s · 0.1 s
    expect(e.x).toBeCloseTo(0.0425, 12); // 0.25 · 1.7 rad/s · 0.1 s
    expect(e.z).toBeCloseTo(0, 12);
  });

  it('has no pitch clamp: 2π of held pitch closes the loop back to the start', () => {
    const q = new THREE.Quaternion();
    const steps = 1000;
    const dt = (2 * Math.PI) / (KEY_STEER * PITCH_RATE) / steps; // W held: −KEY_STEER
    for (let i = 0; i < steps; i++) steerQuaternion(q, 0, -KEY_STEER, dt);
    expect(q.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
  });

  it('2π of held yaw also closes (circles)', () => {
    const q = new THREE.Quaternion();
    const steps = 1000;
    const dt = (2 * Math.PI) / (KEY_STEER * YAW_RATE) / steps;
    for (let i = 0; i < steps; i++) steerQuaternion(q, KEY_STEER, 0, dt);
    expect(q.angleTo(new THREE.Quaternion())).toBeLessThan(1e-5);
  });

  it('stays unit length over many mixed steps', () => {
    const q = new THREE.Quaternion();
    for (let i = 0; i < 5000; i++) {
      steerQuaternion(q, Math.sin(i * 0.13), Math.cos(i * 0.31), 1 / 60);
    }
    expect(Math.abs(q.length() - 1)).toBeLessThan(1e-12);
  });

  it('keys deflect at 0.7 of full steer', () => {
    expect(KEY_STEER).toBe(0.7);
  });
});

describe('levelRoll', () => {
  const rollOf = (q: THREE.Quaternion) =>
    new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(q).z;

  it('converges a rolled horizon back to level in a few seconds', () => {
    const q = yxz(0, 0, 0.8);
    for (let i = 0; i < 240; i++) levelRoll(q, 0, 1 / 60); // 4 s hands-off
    expect(Math.abs(rollOf(q))).toBeLessThan(0.03);
  });

  it('never touches the heading: forward is invariant under leveling', () => {
    const q = yxz(0.6, -1.1, 0.9);
    const before = FORWARD.clone().applyQuaternion(q);
    for (let i = 0; i < 600; i++) levelRoll(q, 0, 1 / 60);
    expect(FORWARD.clone().applyQuaternion(q).distanceTo(before)).toBeLessThan(1e-6);
  });

  it('is inert at zero error and at rate 0', () => {
    const level = yxz(0.4, 1.2);
    const frozen = level.clone();
    levelRoll(level, 0, 1 / 60);
    expect(level.equals(frozen)).toBe(true);
    const rolled = yxz(0, 0, 0.5);
    const rolledFrozen = rolled.clone();
    levelRoll(rolled, 0, 1 / 60, WORLD_UP, 0);
    expect(rolled.equals(rolledFrozen)).toBe(true);
  });

  it('fades to nothing at the pole (nose straight up, level is meaningless)', () => {
    const q = yxz(Math.PI / 2, 0, 0.6);
    const frozen = q.clone();
    levelRoll(q, 0, 1 / 60);
    expect(q.angleTo(frozen)).toBeLessThan(1e-9);
  });

  it('fades out under steer: silent at LEVEL_STEER_FADE, weaker in between', () => {
    const steered = yxz(0, 0, 0.5);
    const frozen = steered.clone();
    levelRoll(steered, LEVEL_STEER_FADE, 1 / 60);
    expect(steered.equals(frozen)).toBe(true);
    levelRoll(steered, KEY_STEER, 1 / 60); // key steer is past the fade knee
    expect(steered.equals(frozen)).toBe(true);
    const half = yxz(0, 0, 0.5);
    const free = yxz(0, 0, 0.5);
    levelRoll(half, LEVEL_STEER_FADE / 2, 1 / 60);
    levelRoll(free, 0, 1 / 60);
    expect(Math.abs(rollOf(half))).toBeGreaterThan(Math.abs(rollOf(free)));
  });

  it('rolls an inverted ship the long way back upright, heading invariant (intended assist feel)', () => {
    // hands-off inverted level flight: err ≈ π. The assist takes it — a
    // maneuver never sees this because steer ≥ LEVEL_STEER_FADE silences it.
    const q = yxz(0, 0, Math.PI - 0.05); // just off exactly inverted
    const before = FORWARD.clone().applyQuaternion(q);
    for (let i = 0; i < 600; i++) levelRoll(q, 0, 1 / 60); // 10 s hands-off
    expect(Math.abs(rollOf(q))).toBeLessThan(0.03);
    expect(FORWARD.clone().applyQuaternion(q).distanceTo(before)).toBeLessThan(1e-6);
  });

  it('levels toward an arbitrary reference up (the planet-surface hook)', () => {
    const q = new THREE.Quaternion(); // level vs world, 90° rolled vs +X
    const up = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < 600; i++) levelRoll(q, 0, 1 / 60, up);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(up)).toBeLessThan(1e-3);
    // still a pure roll: forward never left (0, 0, -1)
    expect(FORWARD.clone().applyQuaternion(q).distanceTo(FORWARD)).toBeLessThan(1e-6);
  });

  it('keeps the gentle feel constants', () => {
    expect(LEVEL_RATE).toBe(1.2);
    expect(LEVEL_STEER_FADE).toBe(0.5);
  });
});

describe('resolveSteer', () => {
  it('passes in-range NDC through, flipping y from GL (up) to screen-down', () => {
    const out = { x: 0, y: 0 };
    resolveSteer(out, 0.4, 0.25, {});
    expect(out.x).toBe(0.4);
    expect(out.y).toBe(-0.25); // pointer above center (GL +y) pitches up
    resolveSteer(out, -0.1, -0.6, {});
    expect(out.x).toBe(-0.1);
    expect(out.y).toBe(0.6); // pointer below center pitches down
  });

  it('clamps both axes to ±1 (window-level listeners run past the canvas)', () => {
    const out = { x: 0, y: 0 };
    resolveSteer(out, 3.2, -1.8, {});
    expect(out.x).toBe(1);
    expect(out.y).toBe(1); // flip then clamp: -(-1.8) = 1.8 → 1
    resolveSteer(out, -2.5, 4, {});
    expect(out.x).toBe(-1);
    expect(out.y).toBe(-1);
  });

  it('key overrides win over the pointer at ±KEY_STEER on x', () => {
    const out = { x: 0, y: 0 };
    resolveSteer(out, 0.9, 0.5, { ArrowLeft: true });
    expect(out.x).toBe(-0.7); // -KEY_STEER
    expect(out.y).toBe(-0.5); // y untouched by x keys
    resolveSteer(out, -0.9, 0, { KeyA: true });
    expect(out.x).toBe(-0.7);
    resolveSteer(out, -0.9, 0, { ArrowRight: true });
    expect(out.x).toBe(0.7); // KEY_STEER
    resolveSteer(out, 0, 0, { KeyD: true });
    expect(out.x).toBe(0.7);
    // right wins when both are held — the override order
    resolveSteer(out, 0, 0, { KeyA: true, KeyD: true });
    expect(out.x).toBe(0.7);
  });

  it('key overrides win over the pointer at ±KEY_STEER on y (W/up = nose up = negative)', () => {
    const out = { x: 0, y: 0 };
    resolveSteer(out, 0.5, -0.9, { KeyW: true });
    expect(out.y).toBe(-0.7); // -KEY_STEER
    expect(out.x).toBe(0.5); // x untouched by y keys
    resolveSteer(out, 0, -0.9, { ArrowUp: true });
    expect(out.y).toBe(-0.7);
    resolveSteer(out, 0, 0.9, { KeyS: true });
    expect(out.y).toBe(0.7); // KEY_STEER
    resolveSteer(out, 0, 0.9, { ArrowDown: true });
    expect(out.y).toBe(0.7);
    // down wins when both are held — the override order, matching A+D
    resolveSteer(out, 0, 0, { KeyW: true, KeyS: true });
    expect(out.y).toBe(0.7);
  });
});

describe('burnKeysDown', () => {
  it('is true only for Space — W/ArrowUp pitch now, they no longer burn', () => {
    expect(burnKeysDown({ Space: true })).toBe(true);
    expect(burnKeysDown({ KeyW: true })).toBe(false);
    expect(burnKeysDown({ ArrowUp: true })).toBe(false);
  });

  it('is false with no burn key held (including released entries)', () => {
    expect(burnKeysDown({})).toBe(false);
    expect(burnKeysDown({ Space: false, KeyA: true, ArrowDown: true })).toBe(false);
  });
});

describe('quaternionFromDirection', () => {
  it('round-trips: FORWARD through the result recovers the direction, steep ones included', () => {
    const q = new THREE.Quaternion();
    const dir = new THREE.Vector3();
    const seeds = [
      [0, 0, -1],
      [1, 0, 0],
      [0.3, 0.8, -0.2],
      [-0.5, -0.6, 0.4],
      [0.05, 1, -0.05], // steeper than the old pitch clamp — now exact
    ];
    for (const [x, y, z] of seeds) {
      const seed = new THREE.Vector3(x, y, z).normalize();
      dir.copy(FORWARD).applyQuaternion(quaternionFromDirection(q, seed));
      expect(dir.distanceTo(seed)).toBeLessThan(1e-6);
    }
  });

  it('levels the roll against the reference up', () => {
    const q = quaternionFromDirection(new THREE.Quaternion(), new THREE.Vector3(0.3, 0.5, -0.8).normalize());
    // local right ⊥ world up, local up in the up half-space: no roll
    expect(Math.abs(new THREE.Vector3(1, 0, 0).applyQuaternion(q).dot(WORLD_UP))).toBeLessThan(1e-9);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).dot(WORLD_UP)).toBeGreaterThan(0);
  });

  it('honors a custom reference up', () => {
    const up = new THREE.Vector3(1, 0, 0);
    const q = quaternionFromDirection(new THREE.Quaternion(), new THREE.Vector3(0, 0, -1), up);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(up)).toBeLessThan(1e-9);
  });

  it('stays finite and on-heading at the degenerate dir ∥ up pole', () => {
    const q = quaternionFromDirection(new THREE.Quaternion(), new THREE.Vector3(0, 1, 0));
    expect(Math.abs(q.length() - 1)).toBeLessThan(1e-9);
    expect(FORWARD.clone().applyQuaternion(q).distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-3);
  });
});

describe('bankBody', () => {
  it('eases toward -steerX·0.9 and settles there', () => {
    const body = new THREE.Group();
    for (let i = 0; i < 300; i++) bankBody(body, 0.5, 1 / 60);
    expect(body.rotation.z).toBeCloseTo(-0.45, 6);
  });
});

describe('chase camera', () => {
  it('chaseTarget applies the (0, 2.6, 9) ship-frame offset', () => {
    const q = yxz(0.4, Math.PI / 3);
    const pos = new THREE.Vector3(10, -4, 25);
    const target = chaseTarget(new THREE.Vector3(), q, pos);
    const expected = new THREE.Vector3(0, 2.6, 9).applyQuaternion(q).add(pos);
    expect(target.distanceTo(expected)).toBeLessThan(1e-12);
  });

  it('chaseTarget with lag trails the no-lag target by (0, 0, lag) in the ship frame', () => {
    const q = yxz(0.6, -0.9);
    const pos = new THREE.Vector3(-7, 3, 12);
    const lagged = chaseTarget(new THREE.Vector3(), q, pos, 6.8);
    const plain = chaseTarget(new THREE.Vector3(), q, pos);
    const expected = plain.add(new THREE.Vector3(0, 0, 6.8).applyQuaternion(q));
    expect(lagged.distanceTo(expected)).toBeLessThan(1e-12);
  });

  it('chaseTarget with lag 0 matches the 3-arg call exactly', () => {
    const q = yxz(-0.5, 2.1);
    const pos = new THREE.Vector3(4, -1, -30);
    const explicit = chaseTarget(new THREE.Vector3(), q, pos, 0);
    const implicit = chaseTarget(new THREE.Vector3(), q, pos);
    expect(explicit.equals(implicit)).toBe(true);
  });

  it('chaseLag is the steady-state trail speed/5, clamped to 12', () => {
    expect(chaseLag(34)).toBeCloseTo(6.8, 12); // deep-field cruise
    expect(chaseLag(60)).toBe(12); // clamp knee: CHASE_POS_RATE · CAMERA_MAX_LAG
    expect(chaseLag(100)).toBe(12); // 100/5 = 20 > CAMERA_MAX_LAG
    expect(chaseLag(0)).toBe(0);
  });

  it('converges onto the target pose and is identity once there', () => {
    const camera = new THREE.Object3D();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 1.1, 0, 'YXZ'));
    const target = new THREE.Vector3(3, 2, -5);
    for (let i = 0; i < 600; i++) updateChaseCamera(camera, target, q, 1 / 60);
    expect(camera.position.distanceTo(target)).toBeLessThan(1e-6);
    expect(camera.quaternion.angleTo(q)).toBeLessThan(1e-6);
    const before = camera.position.clone();
    updateChaseCamera(camera, target, q, 1 / 60);
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-9);
  });

  it('clamps the trail to 12 units', () => {
    const camera = new THREE.Object3D();
    camera.position.set(0, 0, 100);
    const q = new THREE.Quaternion();
    updateChaseCamera(camera, new THREE.Vector3(0, 0, 0), q, 1e-9);
    expect(camera.position.length()).toBeCloseTo(12, 6);
  });
});

describe('boost dynamics', () => {
  it('keeps the shared feel constants', () => {
    expect(CRUISE_FOV).toBe(64);
    expect(BOOST_FOV).toBe(71);
    expect(FOV_RATE).toBe(5);
    expect(ACCEL_RATE).toBe(2.2);
    expect(ACCEL_RATE_BOOST).toBe(3.4);
    expect(DECEL_RATE).toBe(1.4);
  });

  it('updateFov eases toward 71 under boost, back to 64 at cruise', () => {
    const camera = new THREE.PerspectiveCamera(CRUISE_FOV);
    // convergence lands just inside the 0.01 dead band, never tighter
    for (let i = 0; i < 300; i++) updateFov(camera, true, 1 / 60);
    expect(Math.abs(camera.fov - BOOST_FOV)).toBeLessThanOrEqual(0.011);
    for (let i = 0; i < 300; i++) updateFov(camera, false, 1 / 60);
    expect(Math.abs(camera.fov - CRUISE_FOV)).toBeLessThanOrEqual(0.011);
  });

  it('updateFov is inert within 0.01 of the target', () => {
    const camera = new THREE.PerspectiveCamera(CRUISE_FOV + 0.005);
    updateFov(camera, false, 1 / 60);
    expect(camera.fov).toBe(CRUISE_FOV + 0.005);
  });

  it('easeFov eases toward an arbitrary target (the DEEP FIELD title base)', () => {
    const camera = new THREE.PerspectiveCamera(62);
    for (let i = 0; i < 300; i++) easeFov(camera, 75.3, 1 / 60);
    expect(Math.abs(camera.fov - 75.3)).toBeLessThanOrEqual(0.011);
    easeFov(camera, 75.3, 1 / 60); // dead band: inert once converged
    const settled = camera.fov;
    easeFov(camera, 75.3, 1 / 60);
    expect(camera.fov).toBe(settled);
  });

  it('easeFov single step moves at FOV_RATE toward the target', () => {
    const camera = new THREE.PerspectiveCamera(62);
    easeFov(camera, 63, 0.1);
    expect(camera.fov).toBeCloseTo(62 + 1 * 0.1 * FOV_RATE, 12); // 62.5
  });

  it('easeFovValue is the pure scalar law: FOV_RATE step, 0.01 dead band', () => {
    expect(easeFovValue(62, 63, 0.1)).toBeCloseTo(62.5, 12); // 1 · 0.1 · 5
    expect(easeFovValue(71, 64, 0.1)).toBeCloseTo(67.5, 12); // -7 · 0.1 · 5
    expect(easeFovValue(64, 71, 10)).toBe(71); // step factor clamps at 1
    // dead band: within 0.01 the value passes through UNCHANGED
    expect(easeFovValue(64.005, 64, 1)).toBe(64.005);
    expect(easeFovValue(63.995, 64, 1)).toBe(63.995); // inert from below too
    expect(easeFovValue(64, 64, 1)).toBe(64);
  });

  it('easeFov applies easeFovValue to the camera (parity)', () => {
    const camera = new THREE.PerspectiveCamera(66.2);
    const expected = easeFovValue(66.2, 64, 1 / 60);
    easeFov(camera, 64, 1 / 60);
    expect(camera.fov).toBe(expected);
  });

  it('speedResponseRate is asymmetric: accel chases, decel always eases', () => {
    expect(speedResponseRate(50, 100, false)).toBe(ACCEL_RATE);
    expect(speedResponseRate(50, 100, true)).toBe(ACCEL_RATE_BOOST);
    expect(speedResponseRate(100, 50, false)).toBe(DECEL_RATE);
    expect(speedResponseRate(100, 50, true)).toBe(DECEL_RATE);
    // strict `<`: exactly at target counts as decel, boost or not
    expect(speedResponseRate(100, 100, true)).toBe(DECEL_RATE);
  });
});

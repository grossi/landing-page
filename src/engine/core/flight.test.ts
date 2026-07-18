import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ACCEL_RATE,
  ACCEL_RATE_BOOST,
  attitudeFromDirection,
  attitudeQuaternion,
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
  resolveSteer,
  speedResponseRate,
  steerAttitude,
  updateChaseCamera,
  updateFov,
  type Attitude,
} from 'engine/core/flight';

describe('steerAttitude', () => {
  it('integrates the ephemeris steering rates', () => {
    const attitude: Attitude = { yaw: 0, pitch: 0 };
    steerAttitude(attitude, 0.5, -0.25, 0.1);
    expect(attitude.yaw).toBeCloseTo(-0.11, 12); // 0.5 · 2.2 rad/s · 0.1 s
    expect(attitude.pitch).toBeCloseTo(0.0425, 12); // 0.25 · 1.7 rad/s · 0.1 s
  });

  it('clamps pitch to ±1.35 rad but never yaw', () => {
    const attitude: Attitude = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 100; i++) steerAttitude(attitude, 1, -1, 0.1);
    expect(attitude.pitch).toBe(1.35);
    expect(attitude.yaw).toBeCloseTo(-22, 9); // 2.2 rad/s · 10 s
    for (let i = 0; i < 200; i++) steerAttitude(attitude, 0, 1, 0.1);
    expect(attitude.pitch).toBe(-1.35);
  });

  it('keys deflect at 0.7 of full steer', () => {
    expect(KEY_STEER).toBe(0.7);
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

  it('key overrides win over the pointer at ±KEY_STEER, x only', () => {
    const out = { x: 0, y: 0 };
    resolveSteer(out, 0.9, 0.5, { ArrowLeft: true });
    expect(out.x).toBe(-0.7); // -KEY_STEER
    expect(out.y).toBe(-0.5); // y untouched by keys
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
});

describe('burnKeysDown', () => {
  it('is true for each burn key alone', () => {
    expect(burnKeysDown({ KeyW: true })).toBe(true);
    expect(burnKeysDown({ ArrowUp: true })).toBe(true);
    expect(burnKeysDown({ Space: true })).toBe(true);
  });

  it('is false with no burn key held (including released entries)', () => {
    expect(burnKeysDown({})).toBe(false);
    expect(burnKeysDown({ KeyW: false, KeyA: true, ArrowDown: true })).toBe(false);
  });
});

describe('attitude ↔ direction', () => {
  it('round-trips: FORWARD through attitudeQuaternion recovers the seeded direction', () => {
    const attitude: Attitude = { yaw: 0, pitch: 0 };
    const q = new THREE.Quaternion();
    const dir = new THREE.Vector3();
    for (const [x, y, z] of [[0, 0, -1], [1, 0, 0], [0.3, 0.8, -0.2], [-0.5, -0.6, 0.4]]) {
      const seed = new THREE.Vector3(x, y, z).normalize();
      attitudeFromDirection(attitude, seed);
      dir.copy(FORWARD).applyQuaternion(attitudeQuaternion(attitude, q));
      expect(dir.distanceTo(seed)).toBeLessThan(1e-12);
    }
  });

  it('clamps near-vertical directions to the pitch envelope', () => {
    const attitude: Attitude = { yaw: 0, pitch: 0 };
    attitudeFromDirection(attitude, new THREE.Vector3(0.05, 1, -0.05).normalize());
    expect(attitude.pitch).toBe(1.35);
    attitudeFromDirection(attitude, new THREE.Vector3(0, -1, 0));
    expect(attitude.pitch).toBe(-1.35);
  });

  it('produces a roll-free frame (pitch/yaw only)', () => {
    const attitude: Attitude = { yaw: 0.7, pitch: -0.3 };
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    e.setFromQuaternion(attitudeQuaternion(attitude, new THREE.Quaternion()));
    expect(e.z).toBeCloseTo(0, 12);
    expect(e.x).toBeCloseTo(-0.3, 12);
    expect(e.y).toBeCloseTo(0.7, 12);
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
    const attitude: Attitude = { yaw: Math.PI / 3, pitch: 0.4 };
    const q = attitudeQuaternion(attitude, new THREE.Quaternion());
    const pos = new THREE.Vector3(10, -4, 25);
    const target = chaseTarget(new THREE.Vector3(), q, pos);
    const expected = new THREE.Vector3(0, 2.6, 9).applyQuaternion(q).add(pos);
    expect(target.distanceTo(expected)).toBeLessThan(1e-12);
  });

  it('chaseTarget with lag trails the no-lag target by (0, 0, lag) in the ship frame', () => {
    const attitude: Attitude = { yaw: -0.9, pitch: 0.6 };
    const q = attitudeQuaternion(attitude, new THREE.Quaternion());
    const pos = new THREE.Vector3(-7, 3, 12);
    const lagged = chaseTarget(new THREE.Vector3(), q, pos, 6.8);
    const plain = chaseTarget(new THREE.Vector3(), q, pos);
    const expected = plain.add(new THREE.Vector3(0, 0, 6.8).applyQuaternion(q));
    expect(lagged.distanceTo(expected)).toBeLessThan(1e-12);
  });

  it('chaseTarget with lag 0 matches the 3-arg call exactly', () => {
    const q = attitudeQuaternion({ yaw: 2.1, pitch: -0.5 }, new THREE.Quaternion());
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

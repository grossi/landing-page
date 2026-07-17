import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  attitudeFromDirection,
  attitudeQuaternion,
  bankBody,
  BANK_PER_STEER,
  CAMERA_MAX_LAG,
  CHASE_OFFSET,
  chaseTarget,
  FORWARD,
  PITCH_CLAMP,
  PITCH_RATE,
  steerAttitude,
  updateChaseCamera,
  YAW_RATE,
  type Attitude,
} from 'engine/core/flight';

describe('steerAttitude', () => {
  it('integrates the ephemeris steering rates', () => {
    const attitude: Attitude = { yaw: 0, pitch: 0 };
    steerAttitude(attitude, 0.5, -0.25, 0.1);
    expect(attitude.yaw).toBeCloseTo(-0.5 * YAW_RATE * 0.1, 12);
    expect(attitude.pitch).toBeCloseTo(0.25 * PITCH_RATE * 0.1, 12);
  });

  it('clamps pitch to ±PITCH_CLAMP but never yaw', () => {
    const attitude: Attitude = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 100; i++) steerAttitude(attitude, 1, -1, 0.1);
    expect(attitude.pitch).toBe(PITCH_CLAMP);
    expect(attitude.yaw).toBeCloseTo(-YAW_RATE * 10, 9);
    for (let i = 0; i < 200; i++) steerAttitude(attitude, 0, 1, 0.1);
    expect(attitude.pitch).toBe(-PITCH_CLAMP);
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
  it('eases toward -steerX·BANK_PER_STEER and settles there', () => {
    const body = new THREE.Group();
    for (let i = 0; i < 300; i++) bankBody(body, 0.5, 1 / 60);
    expect(body.rotation.z).toBeCloseTo(-0.5 * BANK_PER_STEER, 6);
  });
});

describe('chase camera', () => {
  it('chaseTarget applies the ship-frame offset', () => {
    const attitude: Attitude = { yaw: Math.PI / 3, pitch: 0.4 };
    const q = attitudeQuaternion(attitude, new THREE.Quaternion());
    const pos = new THREE.Vector3(10, -4, 25);
    const target = chaseTarget(new THREE.Vector3(), q, pos);
    const expected = CHASE_OFFSET.clone().applyQuaternion(q).add(pos);
    expect(target.distanceTo(expected)).toBeLessThan(1e-12);
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

  it('clamps the trail to CAMERA_MAX_LAG', () => {
    const camera = new THREE.Object3D();
    camera.position.set(0, 0, 100);
    const q = new THREE.Quaternion();
    updateChaseCamera(camera, new THREE.Vector3(0, 0, 0), q, 1e-9);
    expect(camera.position.length()).toBeLessThanOrEqual(CAMERA_MAX_LAG + 1e-9);
  });
});

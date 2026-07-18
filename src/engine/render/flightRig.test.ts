import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  attitudeFromDirection,
  attitudeQuaternion,
  bankBody,
  BOOST_FOV,
  chaseTarget,
  CRUISE_FOV,
  steerAttitude,
  type Attitude,
} from 'engine/core/flight';
import { createFlightRig, SHIP_ARRIVAL_RATE, SHIP_ENTRY } from 'engine/render/flightRig';
import { createResourceTracker } from 'engine/render/resourceTracker';

const makeRig = () => createFlightRig(createResourceTracker());

describe('createFlightRig', () => {
  it('owns the shared ship rig and starts the pose at CRUISE_FOV', () => {
    const rig = makeRig();
    expect(rig.ship.children).toEqual([rig.shipBody]);
    expect(rig.pose.fov).toBe(CRUISE_FOV);
    expect(rig.attitude).toEqual({ yaw: 0, pitch: 0 });
  });
});

describe('seed', () => {
  it('seeds the attitude from the direction (attitudeFromDirection literals)', () => {
    const rig = makeRig();
    rig.seed({ x: 0, y: 0, z: 1 }); // straight back
    expect(rig.attitude.pitch).toBe(0);
    expect(rig.attitude.yaw).toBe(-Math.PI); // atan2(-0, -1): the -x flip
    rig.seed(new THREE.Vector3(0.05, 1, -0.05).normalize());
    expect(rig.attitude.pitch).toBe(1.35); // PITCH_CLAMP
  });

  it('parks the pose exactly at the converged chase pose (lag 0)', () => {
    const rig = makeRig();
    rig.ship.position.set(120, -40, 3000);
    const dir = new THREE.Vector3(0.3, 0.5, -0.8).normalize();
    rig.seed(dir);
    const expected = chaseTarget(new THREE.Vector3(), rig.ship.quaternion, rig.ship.position);
    expect(rig.pose.position.equals(expected)).toBe(true);
    expect(rig.pose.quaternion.equals(rig.ship.quaternion)).toBe(true);
  });

  it('without a direction keeps the hand-set attitude (the spawn tilt)', () => {
    const rig = makeRig();
    rig.attitude.pitch = -0.04;
    rig.ship.position.set(0, 680, 13437);
    rig.seed();
    const q = attitudeQuaternion({ yaw: 0, pitch: -0.04 }, new THREE.Quaternion());
    expect(rig.ship.quaternion.equals(q)).toBe(true);
    const expected = chaseTarget(new THREE.Vector3(), q, rig.ship.position);
    expect(rig.pose.position.equals(expected)).toBe(true);
  });
});

describe('steer', () => {
  it('matches the pure-helper composition over many frames (parity)', () => {
    const rig = makeRig();
    const attitude: Attitude = { yaw: 0, pitch: 0 };
    const q = new THREE.Quaternion();
    const body = new THREE.Group();
    for (let i = 0; i < 240; i++) {
      const x = Math.sin(i * 0.11) * 0.8;
      const y = Math.cos(i * 0.07) * 0.6;
      rig.steer(x, y, 1 / 60);
      steerAttitude(attitude, x, y, 1 / 60);
      attitudeQuaternion(attitude, q);
      bankBody(body, x, 1 / 60);
    }
    expect(rig.attitude).toEqual(attitude);
    expect(rig.ship.quaternion.equals(q)).toBe(true);
    expect(rig.shipBody.rotation.z).toBe(body.rotation.z);
  });
});

describe('update', () => {
  it('converges the pose onto a static ship and is then inert', () => {
    const rig = makeRig();
    rig.ship.position.set(3, 2, -5);
    rig.seed({ x: 0.3, y: 0.8, z: -0.2 });
    rig.pose.position.set(0, 0, 40); // knock the virtual camera away
    rig.pose.quaternion.identity();
    for (let i = 0; i < 600; i++) rig.update(1 / 60, false);
    const target = chaseTarget(new THREE.Vector3(), rig.ship.quaternion, rig.ship.position);
    expect(rig.pose.position.distanceTo(target)).toBeLessThan(1e-6);
    expect(rig.pose.quaternion.angleTo(rig.ship.quaternion)).toBeLessThan(1e-6);
    const before = rig.pose.position.clone();
    rig.update(1 / 60, false);
    expect(rig.pose.position.distanceTo(before)).toBeLessThan(1e-9);
  });

  it('clamps the chase trail to 12 units', () => {
    const rig = makeRig();
    rig.seed(); // ship at origin, identity attitude
    rig.pose.position.set(0, 2.6, 109); // 100 behind the (0, 2.6, 9) target
    rig.update(1e-9, false);
    expect(rig.pose.position.distanceTo(new THREE.Vector3(0, 2.6, 9))).toBeCloseTo(12, 6);
  });

  it('trailLag shifts the converged pose by (0, 0, lag) in the ship frame', () => {
    const rig = makeRig();
    rig.ship.position.set(-7, 3, 12);
    rig.seed(new THREE.Vector3(0.6, -0.4, -0.7).normalize());
    for (let i = 0; i < 600; i++) rig.update(1 / 60, false, 6.8);
    const lagged = chaseTarget(new THREE.Vector3(), rig.ship.quaternion, rig.ship.position, 6.8);
    expect(rig.pose.position.distanceTo(lagged)).toBeLessThan(1e-6);
  });

  it('eases the pose fov 64 → 71 under boost and back at cruise', () => {
    const rig = makeRig();
    for (let i = 0; i < 300; i++) rig.update(1 / 60, true);
    expect(Math.abs(rig.pose.fov - BOOST_FOV)).toBeLessThanOrEqual(0.011);
    for (let i = 0; i < 300; i++) rig.update(1 / 60, false);
    expect(Math.abs(rig.pose.fov - CRUISE_FOV)).toBeLessThanOrEqual(0.011);
  });
});

describe('arm', () => {
  it('snaps the pose to the camera pose verbatim, fov included', () => {
    const rig = makeRig();
    const camPose = {
      position: new THREE.Vector3(14, -6, 33),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -1.1, 0.2)),
      fov: 66.4,
    };
    rig.arm(camPose, { x: 0.2, y: 0.1, z: -0.97 });
    expect(rig.pose.position.equals(camPose.position)).toBe(true);
    expect(rig.pose.quaternion.equals(camPose.quaternion)).toBe(true);
    expect(rig.pose.fov).toBe(66.4);
  });

  it('places the ship at camPose + R_ship·SHIP_ENTRY, attitude from the heading', () => {
    const rig = makeRig();
    const heading = new THREE.Vector3(0.4, 0.3, -0.85).normalize();
    const camPose = {
      position: new THREE.Vector3(-20, 8, 5),
      quaternion: new THREE.Quaternion(),
      fov: 62,
    };
    rig.arm(camPose, heading);
    const attitude: Attitude = { yaw: 0, pitch: 0 };
    attitudeFromDirection(attitude, heading);
    expect(rig.attitude).toEqual(attitude);
    const q = attitudeQuaternion(attitude, new THREE.Quaternion());
    expect(rig.ship.quaternion.equals(q)).toBe(true);
    const expected = SHIP_ENTRY.clone().applyQuaternion(q).add(camPose.position);
    expect(rig.ship.position.distanceTo(expected)).toBeLessThan(1e-12);
  });

  it('SHIP_ENTRY is the low-and-behind entry offset', () => {
    expect(SHIP_ENTRY.x).toBe(0);
    expect(SHIP_ENTRY.y).toBe(-2.6);
    expect(SHIP_ENTRY.z).toBe(18);
  });
});

describe('flyTo', () => {
  it('SHIP_ARRIVAL_RATE is the 1.5/s exponential approach', () => {
    expect(SHIP_ARRIVAL_RATE).toBe(1.5);
  });

  it('single step is a lerp at dt·SHIP_ARRIVAL_RATE', () => {
    const rig = makeRig();
    rig.seed();
    rig.flyTo(new THREE.Vector3(100, 0, 0));
    rig.update(0.1, false);
    expect(rig.ship.position.x).toBeCloseTo(15, 12); // 100 · 0.1 · 1.5
  });

  it('converges the ship onto the station; clearing stops the pull', () => {
    const rig = makeRig();
    rig.seed();
    const station = new THREE.Vector3(40, -12, -260);
    rig.flyTo(station);
    for (let i = 0; i < 600; i++) rig.update(1 / 60, false);
    expect(rig.ship.position.distanceTo(station)).toBeLessThan(1e-3);
    rig.flyTo(null);
    rig.ship.position.set(0, 0, 0);
    rig.update(1 / 60, false);
    expect(rig.ship.position.length()).toBe(0); // no residual arrival pull
  });

  it('copies the station, never referencing the caller vector', () => {
    const rig = makeRig();
    rig.seed();
    const station = new THREE.Vector3(10, 0, 0);
    rig.flyTo(station);
    station.set(-9999, 0, 0); // caller reuses its scratch
    rig.update(0.1, false);
    expect(rig.ship.position.x).toBeCloseTo(1.5, 12); // toward 10, not -9999
  });
});

describe('applyRebase', () => {
  it('shifts ship and pose together — the ship-relative pose is invariant', () => {
    const rig = makeRig();
    rig.ship.position.set(500, -200, 12800);
    rig.seed(new THREE.Vector3(0.2, 0.4, -0.89).normalize());
    for (let i = 0; i < 30; i++) rig.update(1 / 60, true); // develop a trail
    const relative = rig.pose.position.clone().sub(rig.ship.position);
    const delta = new THREE.Vector3(12000, 0, 12000);
    rig.applyRebase(delta);
    expect(rig.ship.position.equals(new THREE.Vector3(-11500, -200, 800))).toBe(true);
    expect(rig.pose.position.clone().sub(rig.ship.position).equals(relative)).toBe(true);
  });
});

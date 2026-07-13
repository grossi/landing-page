// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GeometryCache, lodGeometryKey } from 'engine/lod/geometry';
import {
  apparentScale,
  ATMOSPHERE_MAX_OPACITY,
  atmosphereOpacity,
  biasedMaxLevel,
  createLodManager,
  SCALE_RAMP_FLOOR,
} from 'engine/lod/lodManager';

const VIEW_H = 800;

const makeCamera = (): THREE.PerspectiveCamera =>
  new THREE.PerspectiveCamera(64, 16 / 9, 0.5, 12000); // looks down -z from the origin

/** Flush the microtask queue so geometry-job promises land. */
const flush = (): Promise<void> => Promise.resolve();

/** Rung meshes the manager parented to this anchor. */
const rungMeshes = (anchor: THREE.Object3D): THREE.Object3D[] =>
  anchor.children.filter((child) => child instanceof THREE.LineSegments);

describe('apparentScale', () => {
  it('is 1 near the surface and the floor far away', () => {
    expect(apparentScale(10, 10)).toBe(1); // 1 radius out
    expect(apparentScale(40, 10)).toBe(1); // exactly 4 radii
    expect(apparentScale(400, 10)).toBe(SCALE_RAMP_FLOOR); // 40 radii
    expect(apparentScale(5000, 10)).toBe(SCALE_RAMP_FLOOR);
  });

  it('is monotone non-increasing and continuous across the ramp', () => {
    let last = apparentScale(1, 10);
    for (let d = 2; d <= 500; d++) {
      const s = apparentScale(d, 10);
      expect(s).toBeLessThanOrEqual(last + 1e-12);
      expect(Math.abs(s - last)).toBeLessThan(0.02); // no jumps
      last = s;
    }
  });
});

describe('atmosphereOpacity', () => {
  it('is zero beyond 4 radii and peaks near the surface', () => {
    expect(atmosphereOpacity(50, 10)).toBe(0);
    expect(atmosphereOpacity(40, 10)).toBe(0); // continuous at the far edge
    expect(atmosphereOpacity(2, 10)).toBeCloseTo(ATMOSPHERE_MAX_OPACITY, 5);
  });

  it('stays inside [0, max] and rises monotonically on approach', () => {
    let last = 0;
    for (let d = 45; d >= 1; d--) {
      const o = atmosphereOpacity(d, 10);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(ATMOSPHERE_MAX_OPACITY);
      expect(o).toBeGreaterThanOrEqual(last - 1e-12);
      last = o;
    }
  });
});

describe('biasedMaxLevel', () => {
  it('subtracts the bias from the cap', () => {
    expect(biasedMaxLevel(5, 0)).toBe(5);
    expect(biasedMaxLevel(5, 1)).toBe(4);
    expect(biasedMaxLevel(3, 1)).toBe(2);
  });

  it('floors at rung 1 — a nearby body keeps a silhouette, never a dot', () => {
    expect(biasedMaxLevel(5, 5)).toBe(1);
    expect(biasedMaxLevel(2, 99)).toBe(1);
  });

  it('never raises a cap already below the floor (always-dot content)', () => {
    expect(biasedMaxLevel(0, 0)).toBe(0);
    expect(biasedMaxLevel(0, 1)).toBe(0);
  });
});

describe('createLodManager', () => {
  it('keeps a far body at rung 0 with no meshes', () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -3000);
    scene.add(anchor);
    const handle = lod.register({ seed: 7, radius: 6, kind: 'planet', anchor });

    lod.update(makeCamera(), VIEW_H, 0.6);
    lod.update(makeCamera(), VIEW_H, 0.6);
    expect(handle.level).toBe(0);
    expect(handle.liveSlotCount).toBe(0);
    expect(anchor.children).toHaveLength(0);
    lod.dispose();
  });

  it('climbs the ladder monotonically to 5 with at most 2 live slots', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15); // px ≈ 427 at radius 10 — promotes to 5
    scene.add(anchor);
    const handle = lod.register({ seed: 42, radius: 10, kind: 'planet', anchor });

    let previous = 0;
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush(); // geometry-job promises land between frames
      expect(handle.level).toBeGreaterThanOrEqual(previous);
      expect(handle.liveSlotCount).toBeLessThanOrEqual(2);
      for (const opacity of handle.slotOpacities) {
        expect(opacity).toBeGreaterThanOrEqual(0);
        expect(opacity).toBeLessThanOrEqual(0.85 * 1.05);
      }
      previous = handle.level;
    }
    expect(handle.level).toBe(5);
    lod.dispose();
  });

  it('cross-dissolves: both rung meshes render briefly during a transition', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 3, radius: 10, kind: 'planet', anchor });

    let sawDissolve = false;
    for (let i = 0; i < 120 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.1); // dt < fade: dissolves span frames
      await flush();
      if (handle.liveSlotCount === 2) {
        sawDissolve = true;
        const sum = handle.slotOpacities.reduce((a, b) => a + b, 0);
        expect(sum).toBeGreaterThanOrEqual(0);
        expect(sum).toBeLessThanOrEqual(0.85 * 1.05);
      }
    }
    expect(sawDissolve).toBe(true);
    lod.dispose();
  });

  it('respects a registration maxLevel cap', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 9, radius: 10, kind: 'planet', anchor, maxLevel: 2 });

    for (let i = 0; i < 12; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
      expect(handle.level).toBeLessThanOrEqual(2);
    }
    expect(handle.level).toBe(2);
    lod.dispose();
  });

  it('setLodBias sheds one rung per dwell window down to the floor, then restores', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 23, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    expect(handle.level).toBe(5);

    lod.setLodBias(1); // governor quality level 1/2
    let previous = handle.level;
    for (let i = 0; i < 6; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
      expect(handle.level).toBeGreaterThanOrEqual(previous - 1); // one step per window
      previous = handle.level;
    }
    expect(handle.level).toBe(4);

    lod.setLodBias(99); // sheds to the floor, never the dot
    for (let i = 0; i < 10; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
      expect(handle.liveSlotCount).toBeLessThanOrEqual(2); // sheds stay pairwise
    }
    expect(handle.level).toBe(1);

    lod.setLodBias(0); // load recovered — the registration cap returns
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    expect(handle.level).toBe(5);
    lod.dispose();
  });

  it('clamps fadeSeconds to the dwell so an option cannot strand a dissolve', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene, { fadeSeconds: 9 }); // > LOD_MIN_DWELL_S
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 27, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    expect(handle.level).toBe(5);
    // one more dwell-length frame: the (clamped) final fade must complete
    lod.update(makeCamera(), VIEW_H, 0.6);
    expect(handle.liveSlotCount).toBe(1);
    expect(handle.slotOpacities[0]).toBeCloseTo(0.85, 5);
    lod.dispose();
  });

  it('sheds rungs on retreat and returns to the dot', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 11, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    expect(handle.level).toBe(5);

    anchor.position.set(0, 0, -5000);
    let previous = handle.level;
    for (let i = 0; i < 40 && handle.level > 0; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
      expect(handle.level).toBeLessThanOrEqual(previous);
      previous = handle.level;
    }
    expect(handle.level).toBe(0);
    lod.update(makeCamera(), VIEW_H, 0.6); // final fade-out completes
    expect(rungMeshes(anchor)).toHaveLength(0);
    lod.dispose();
  });

  it('unregister removes every mesh it added to the anchor', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 13, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    expect(anchor.children.length).toBeGreaterThan(0); // rung mesh + atmosphere

    lod.unregister(handle);
    expect(anchor.children).toHaveLength(0);
    lod.dispose();
  });

  it('pins the displayed geometry so cache pressure cannot dispose it under a live mesh', async () => {
    const scene = new THREE.Scene();
    const cache = new GeometryCache(1); // every insert evicts — worst case
    const lod = createLodManager(scene, { cache });
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 42, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    lod.update(makeCamera(), VIEW_H, 0.6); // finish the final cross-dissolve
    expect(handle.liveSlotCount).toBe(1);
    const displayed = (rungMeshes(anchor)[0] as THREE.LineSegments).geometry;
    const disposeSpy = vi.spyOn(displayed, 'dispose');

    cache.set('intruder-a', new THREE.BufferGeometry());
    cache.set('intruder-b', new THREE.BufferGeometry());
    expect(disposeSpy).not.toHaveBeenCalled();
    expect(cache.get(lodGeometryKey(42, 'planet', 10, handle.level))).toBe(displayed);

    lod.dispose(); // releases the pin (injected cache is not disposed)
    cache.dispose();
    expect(disposeSpy).toHaveBeenCalled();
  });

  it('adds the atmosphere cue for close planets only', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const planet = new THREE.Group();
    planet.position.set(0, 0, -15); // 0.5 radii off the surface — cue active
    const star = new THREE.Group();
    star.position.set(0, 0, -15);
    scene.add(planet, star);
    lod.register({ seed: 1, radius: 10, kind: 'planet', anchor: planet });
    lod.register({ seed: 2, radius: 10, kind: 'star', anchor: star });

    for (let i = 0; i < 10; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    const planetRings = planet.children.filter((c) => c instanceof THREE.Mesh && c.visible);
    const starRings = star.children.filter((c) => c instanceof THREE.Mesh);
    expect(planetRings.length).toBe(1);
    expect(starRings.length).toBe(0);
    lod.dispose();
  });

  it('drives the apparent-scale ramp on rung meshes and scale targets', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -900); // 89 radii out at radius 10 — floor scale
    const ring = new THREE.Object3D();
    ring.scale.setScalar(10);
    scene.add(anchor);
    const handle = lod.register({
      seed: 17,
      radius: 10,
      kind: 'planet',
      anchor,
      scaleTargets: [ring],
    });
    for (let i = 0; i < 6; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    expect(handle.level).toBeGreaterThan(0); // px ≈ 3.2 at floor scale
    expect(ring.scale.x).toBeCloseTo(10 * SCALE_RAMP_FLOOR, 5);
    expect(rungMeshes(anchor)[0].scale.x).toBeCloseTo(SCALE_RAMP_FLOOR, 5);

    anchor.position.set(0, 0, -20); // 1 radius off the surface — full scale
    for (let i = 0; i < 3; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    expect(ring.scale.x).toBeCloseTo(10, 5);
    lod.dispose();
  });

  it('renders beacons in the shared far-contact layer', () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const beaconPoints = scene.children.find(
      (child): child is THREE.Points =>
        child instanceof THREE.Points &&
        (child.material as THREE.PointsMaterial).vertexColors === true,
    )!;
    expect(beaconPoints).toBeDefined();
    expect(beaconPoints.geometry.drawRange.count).toBe(0);

    lod.setBeacons([
      { x: 1, y: 2, z: 3, brightness: 0.5 },
      { x: -4, y: 5, z: -6, brightness: 1 },
    ]);
    expect(beaconPoints.geometry.drawRange.count).toBe(2);
    const positions = beaconPoints.geometry.getAttribute('position');
    expect([positions.getX(0), positions.getY(0), positions.getZ(0)]).toEqual([1, 2, 3]);

    lod.setBeacons([]);
    expect(beaconPoints.geometry.drawRange.count).toBe(0);
    lod.dispose();
  });

  it('dispose removes its shared layers from the scene', () => {
    const scene = new THREE.Scene();
    const before = scene.children.length;
    const lod = createLodManager(scene);
    expect(scene.children.length).toBe(before + 2); // dot + beacon layers
    lod.register({ seed: 21, radius: 10, kind: 'planet', anchor: new THREE.Group() });
    lod.dispose();
    expect(scene.children.length).toBe(before);
  });
});

// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeometryCache, GeometryJobQueue, lodGeometryKey } from 'engine/lod/geometry';
import {
  apparentScale,
  biasedMaxLevel,
  CLOUD_DRIFT_RAD_S,
  CLOUD_FAR,
  CLOUD_MAX_OPACITY,
  CLOUD_SHELL_RADII,
  cloudOpacity,
  createLodManager,
  GRATICULE_FAR,
  GRATICULE_MAX_OPACITY,
  GRATICULE_NEAR,
  graticuleOpacity,
  HAZE_DARK_COS,
  HAZE_LIT_COS,
  HAZE_NEAR_RADII,
  HAZE_RADII,
  hazeStrength,
  hazeVertexFade,
  SCALE_RAMP_FAR,
  SCALE_RAMP_FAR_MAX_DISTANCE,
  SCALE_RAMP_FLOOR,
  SCALE_RAMP_NEAR,
} from 'engine/lod/lodManager';

const VIEW_H = 800;

// Exercise the real geometry queue with a fixed cost per slice. These tests
// cover LOD transitions; machine load must not decide when a build completes.
const updateQueue = GeometryJobQueue.prototype.update;
beforeEach(() => {
  vi.spyOn(GeometryJobQueue.prototype, 'update').mockImplementation(function (this: GeometryJobQueue, budget, now) {
    let elapsed = 0;
    return updateQueue.call(this, budget, now ?? (() => (elapsed += 0.01)));
  });
});
afterEach(() => vi.restoreAllMocks());

const makeCamera = (): THREE.PerspectiveCamera =>
  new THREE.PerspectiveCamera(64, 16 / 9, 0.5, 12000); // looks down -z from the origin

/** Flush the microtask queue so geometry-job promises land. */
const flush = (): Promise<void> => Promise.resolve();

/** Rung meshes the manager parented to this anchor (indexed LineSegments). */
const rungMeshes = (anchor: THREE.Object3D): THREE.Object3D[] =>
  anchor.children.filter(
    (child) => child instanceof THREE.LineSegments && child.geometry.getIndex() !== null,
  );

/** Skim-band shell meshes (graticule/clouds — shared non-indexed geometry). */
const shellMeshes = (anchor: THREE.Object3D): THREE.LineSegments[] =>
  anchor.children.filter(
    (child): child is THREE.LineSegments =>
      child instanceof THREE.LineSegments && child.geometry.getIndex() === null,
  );

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

  it('clamps the swell band to the fog wall for big bodies only', () => {
    // bodies at/below the binding radius keep the exact 4–40-radii ramp
    const bindRadius = SCALE_RAMP_FAR_MAX_DISTANCE / SCALE_RAMP_FAR; // 360
    expect(apparentScale(SCALE_RAMP_FAR * bindRadius, bindRadius)).toBe(SCALE_RAMP_FLOOR);
    expect(apparentScale((SCALE_RAMP_FAR - 1) * bindRadius, bindRadius)).toBeGreaterThan(
      SCALE_RAMP_FLOOR,
    );
    // a max true-scale rogue (960, clamp at 15 radii): the whole 0.6 → 1
    // swell completes exactly by the clamp distance — inside the fog wall,
    // where it can be seen
    expect(apparentScale(SCALE_RAMP_FAR_MAX_DISTANCE, 960)).toBe(SCALE_RAMP_FLOOR);
    expect(apparentScale(SCALE_RAMP_FAR_MAX_DISTANCE * 0.9, 960)).toBeGreaterThan(SCALE_RAMP_FLOOR);
    expect(apparentScale(SCALE_RAMP_NEAR * 960, 960)).toBe(1);
    // hero-giant territory (2,400 — above 14,400 / 8 = 1,800): the 2×-near
    // guard keeps a usable band, landing the far edge at 8 radii = 19,200
    const guardEdge = SCALE_RAMP_NEAR * 2 * 2400;
    expect(guardEdge).toBeGreaterThan(SCALE_RAMP_FAR_MAX_DISTANCE);
    expect(apparentScale(guardEdge, 2400)).toBe(SCALE_RAMP_FLOOR);
    expect(apparentScale(guardEdge * 0.9, 2400)).toBeGreaterThan(SCALE_RAMP_FLOOR);
  });

  it('stays monotone and continuous across the clamped band', () => {
    let last = apparentScale(100, 960);
    for (let d = 200; d <= 12000; d += 100) {
      const s = apparentScale(d, 960);
      expect(s).toBeLessThanOrEqual(last + 1e-12);
      expect(Math.abs(s - last)).toBeLessThan(0.05); // no jumps
      last = s;
    }
  });
});

describe('hazeStrength', () => {
  it('is zero at and beyond HAZE_RADII and full by HAZE_NEAR_RADII', () => {
    expect(hazeStrength(20, 10)).toBe(0); // 2 radii out
    expect(hazeStrength(HAZE_RADII * 10, 10)).toBe(0); // continuous far edge
    expect(hazeStrength(HAZE_NEAR_RADII * 10, 10)).toBe(1);
    expect(hazeStrength(0, 10)).toBe(1);
  });

  it('rises monotonically and continuously on approach', () => {
    let last = 0;
    for (let d = 20; d >= 0; d -= 0.1) {
      const s = hazeStrength(d, 10);
      expect(s).toBeGreaterThanOrEqual(last - 1e-12);
      expect(Math.abs(s - last)).toBeLessThan(0.03); // no jumps
      last = s;
    }
  });
});

describe('hazeVertexFade', () => {
  it('keeps camera-facing vertices fully lit', () => {
    expect(hazeVertexFade(1, 1)).toBe(1);
    expect(hazeVertexFade(HAZE_LIT_COS, 1)).toBe(1);
  });

  it('fades the far limb to 1 - strength', () => {
    expect(hazeVertexFade(HAZE_DARK_COS, 1)).toBeCloseTo(0, 10);
    expect(hazeVertexFade(-1, 0.5)).toBeCloseTo(0.5, 10);
    expect(hazeVertexFade(-1, 0)).toBe(1); // zero strength touches nothing
  });

  it('is monotone in the cosine with no steps across the terminator', () => {
    let last = hazeVertexFade(1, 0.8);
    for (let c = 1; c >= -1; c -= 0.01) {
      const fade = hazeVertexFade(c, 0.8);
      expect(fade).toBeLessThanOrEqual(last + 1e-12);
      expect(last - fade).toBeLessThan(0.03);
      last = fade;
    }
  });
});

describe('graticuleOpacity', () => {
  it('is a band: zero outside GRATICULE_FAR..GRATICULE_NEAR, peaked inside', () => {
    expect(graticuleOpacity(GRATICULE_FAR * 10, 10)).toBe(0); // continuous far edge
    expect(graticuleOpacity(20, 10)).toBe(0); // well outside
    expect(graticuleOpacity(GRATICULE_NEAR * 10, 10)).toBe(0); // continuous near edge
    expect(graticuleOpacity(0, 10)).toBe(0); // hugging the ground: gone
    expect(graticuleOpacity(4, 10)).toBeCloseTo(GRATICULE_MAX_OPACITY, 5); // skim window
  });

  it('stays inside [0, peak] and moves continuously across the whole band', () => {
    let last = 0;
    for (let d = 12; d >= 0; d -= 0.05) {
      const o = graticuleOpacity(d, 10);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(GRATICULE_MAX_OPACITY);
      expect(Math.abs(o - last)).toBeLessThan(0.02); // no pops
      last = o;
    }
  });
});

describe('cloudOpacity', () => {
  it('is zero at and beyond CLOUD_FAR radii and full near the surface', () => {
    expect(cloudOpacity(CLOUD_FAR * 10, 10)).toBe(0); // continuous far edge
    expect(cloudOpacity(30, 10)).toBe(0);
    expect(cloudOpacity(5, 10)).toBeCloseTo(CLOUD_MAX_OPACITY, 5);
    expect(cloudOpacity(0, 10)).toBeCloseTo(CLOUD_MAX_OPACITY, 5); // under the shell
  });

  it('rises monotonically and continuously on approach', () => {
    let last = 0;
    for (let d = 25; d >= 0; d -= 0.1) {
      const o = cloudOpacity(d, 10);
      expect(o).toBeGreaterThanOrEqual(last - 1e-12);
      expect(o - last).toBeLessThan(0.03); // no jumps
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
    anchor.position.set(0, 0, -3000); // far — the cold start places at the dot
    scene.add(anchor);
    const handle = lod.register({ seed: 42, radius: 10, kind: 'planet', anchor });
    lod.update(makeCamera(), VIEW_H, 0.6);
    expect(handle.level).toBe(0);
    anchor.position.set(0, 0, -15); // px ≈ 427 at radius 10 — promotes to 5

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
    anchor.position.set(0, 0, -3000); // far — the cold start places at the dot
    scene.add(anchor);
    const handle = lod.register({ seed: 3, radius: 10, kind: 'planet', anchor });
    lod.update(makeCamera(), VIEW_H, 0.6);
    anchor.position.set(0, 0, -15); // approach: dwell-gated rung-by-rung climb

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

    lod.setLodBias(2); // governor quality level 2 (cap 6 - 2 = 4)
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
    expect(anchor.children.length).toBeGreaterThan(0); // rung mesh

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

  it('adds no atmosphere-ring mesh to close bodies (cue removed by design)', async () => {
    // rungs are LineSegments; the removed ring cue was the only plain Mesh
    // a close body ever grew — none may come back
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const planet = new THREE.Group();
    planet.position.set(0, 0, -15); // 0.5 radii off the surface
    const star = new THREE.Group();
    star.position.set(0, 0, -15);
    scene.add(planet, star);
    lod.register({ seed: 1, radius: 10, kind: 'planet', anchor: planet });
    lod.register({ seed: 2, radius: 10, kind: 'star', anchor: star });

    for (let i = 0; i < 10; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    expect(planet.children.filter((c) => c instanceof THREE.Mesh)).toHaveLength(0);
    expect(star.children.filter((c) => c instanceof THREE.Mesh)).toHaveLength(0);
    lod.dispose();
  });

  it('hazes the far limb when skimming with surfaceHaze enabled, composing with opacity', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene, { surfaceHaze: true });
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15); // 0.5 radii off the surface — haze active
    scene.add(anchor);
    const handle = lod.register({ seed: 31, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    lod.update(makeCamera(), VIEW_H, 0.6); // finish the final cross-dissolve
    const mesh = rungMeshes(anchor)[0] as THREE.LineSegments;
    const material = mesh.material as THREE.LineBasicMaterial;
    const colors = mesh.geometry.getAttribute('color');
    expect(colors).toBeDefined();
    expect(material.vertexColors).toBe(true);
    // the haze rides vertex colors; the dissolve keeps sole ownership of opacity
    expect(material.opacity).toBeCloseTo(0.85, 5);

    // camera sits at +z of the body: the near pole stays lit, the far fades
    const positions = mesh.geometry.getAttribute('position');
    let nearIdx = 0;
    let farIdx = 0;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getZ(i) > positions.getZ(nearIdx)) nearIdx = i;
      if (positions.getZ(i) < positions.getZ(farIdx)) farIdx = i;
    }
    expect(colors.getX(nearIdx)).toBeCloseTo(1, 5);
    expect(colors.getX(farIdx)).toBeLessThan(0.15);

    // leaving the band clears the fade back to white (then costs nothing);
    // cached rungs released mid-climb were white-refilled too, so even the
    // demote's reused geometry carries no stale fade
    anchor.position.set(0, 0, -60); // 5 radii off the surface — strength 0
    lod.update(makeCamera(), VIEW_H, 0.6);
    for (const rung of rungMeshes(anchor) as THREE.LineSegments[]) {
      const c = rung.geometry.getAttribute('color');
      if (!c) continue;
      for (let i = 0; i < c.count; i++) expect(c.getX(i)).toBe(1);
    }
    lod.dispose();
  });

  it('skips identical haze rewrites while strength and camera direction hold', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene, { surfaceHaze: true });
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15); // 0.5 radii off the surface — haze active
    scene.add(anchor);
    const handle = lod.register({ seed: 35, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    lod.update(makeCamera(), VIEW_H, 0.6); // settle the final cross-dissolve
    const mesh = rungMeshes(anchor)[0] as THREE.LineSegments;
    const colors = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const version = colors.version;

    // nothing moves: the fade inputs are identical, so the ~480 KB buffer
    // must not be refilled or re-uploaded (a hover would otherwise pay it
    // every frame)
    for (let i = 0; i < 5; i++) lod.update(makeCamera(), VIEW_H, 0.016);
    expect(colors.version).toBe(version);

    // swing the local camera direction well past the drift gate at the
    // same surface distance — the fade must recompute
    anchor.position.set(0, -3, -14.7);
    lod.update(makeCamera(), VIEW_H, 0.016);
    expect(colors.version).toBeGreaterThan(version);
    lod.dispose();
  });

  it('leaves geometry and materials untouched by default (Home DEEP FIELD parity)', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene); // no surfaceHaze — the Home mount
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15); // skimming distance, yet no haze
    scene.add(anchor);
    const handle = lod.register({ seed: 33, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    lod.update(makeCamera(), VIEW_H, 0.6);
    const mesh = rungMeshes(anchor)[0] as THREE.LineSegments;
    expect(mesh.geometry.getAttribute('color')).toBeUndefined();
    expect((mesh.material as THREE.LineBasicMaterial).vertexColors).toBe(false);
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
    expect(handle.level).toBeGreaterThan(0); // px ≈ 4.3 at floor scale
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

  it('cold start jumps a close registration straight to its justified rung', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15); // px ≈ 427 — justifies rung 5 immediately
    scene.add(anchor);
    const handle = lod.register({ seed: 55, radius: 10, kind: 'planet', anchor });

    const seen = new Set<number>();
    for (let i = 0; i < 20 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.016); // real frames: no dwell credit
      await flush();
      seen.add(handle.level);
    }
    // 20 frames ≈ 0.32 s < one dwell window; a rung-by-rung climb would
    // still be at level 0 — and would pass through 1..4 on its way up
    expect(handle.level).toBe(5);
    for (const level of seen) expect([0, 5]).toContain(level);
    lod.dispose();
  });

  it('cold start at planet-filling px lands straight on rung 6', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15); // px ≈ 1067 on a 2000px viewport
    scene.add(anchor);
    const handle = lod.register({ seed: 61, radius: 10, kind: 'planet', anchor });

    const seen = new Set<number>();
    for (let i = 0; i < 60 && handle.level < 6; i++) {
      lod.update(makeCamera(), 2000, 0.016);
      await flush();
      seen.add(handle.level);
    }
    expect(handle.level).toBe(6);
    for (const level of seen) expect([0, 6]).toContain(level); // no climb
    lod.dispose();
  });

  it('cold start respects the governor lodBias cap', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    lod.setLodBias(2); // biasedMaxLevel(6, 2) = 4
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 62, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 20 && handle.level < 4; i++) {
      lod.update(makeCamera(), VIEW_H, 0.016);
      await flush();
      expect(handle.level).toBeLessThanOrEqual(4);
    }
    expect(handle.level).toBe(4);
    lod.dispose();
  });

  it('after the cold-start placement, later changes are dwell-gated again', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 63, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 20 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.016);
      await flush();
    }
    expect(handle.level).toBe(5);

    anchor.position.set(0, 0, -100); // px collapses well below the demote point
    lod.update(makeCamera(), VIEW_H, 0.016);
    await flush();
    expect(handle.level).toBe(5); // dwell not elapsed — no cold-start shortcut

    lod.update(makeCamera(), VIEW_H, 0.6); // dwell window passes
    await flush();
    // sub-dwell frames only give the demote's geometry job time to land
    for (let i = 0; i < 10 && handle.level > 4; i++) {
      lod.update(makeCamera(), VIEW_H, 0.016);
      await flush();
    }
    expect(handle.level).toBe(4); // exactly one rung, not a jump
    lod.dispose();
  });

  it('sheds a rung-6 body under governor lodBias exactly like other rungs', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene);
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15);
    scene.add(anchor);
    const handle = lod.register({ seed: 64, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 60 && handle.level < 6; i++) {
      lod.update(makeCamera(), 2000, 0.016);
      await flush();
    }
    expect(handle.level).toBe(6);

    lod.setLodBias(1); // biasedMaxLevel(6, 1) = 5
    for (let i = 0; i < 6 && handle.level > 5; i++) {
      lod.update(makeCamera(), 2000, 0.6);
      await flush();
    }
    expect(handle.level).toBe(5);

    lod.setLodBias(0); // load recovered — rung 6 comes back
    for (let i = 0; i < 10 && handle.level < 6; i++) {
      lod.update(makeCamera(), 2000, 0.6);
      await flush();
    }
    expect(handle.level).toBe(6);
    lod.dispose();
  });

  it('cold start holds a pending build through px oscillation across a threshold', async () => {
    const scene = new THREE.Scene();
    const queue = new GeometryJobQueue();
    const enqueueSpy = vi.spyOn(queue, 'enqueue');
    // ~1 slice per update: the level-6 build stays in flight across frames
    const lod = createLodManager(scene, { queue, jobBudgetMs: 0.001 });
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -15); // px ≈ 1067 on a 2000px viewport → target 6
    scene.add(anchor);
    const handle = lod.register({ seed: 65, radius: 10, kind: 'planet', anchor });

    // oscillate px across the 700px promote threshold every frame (an FOV
    // pulse during a boost); px never leaves rung 6's hysteresis band
    // (demote point 525), so the in-flight placement build must be HELD —
    // a raw retarget would cancel and restart it from vertex 0 each flip
    for (let i = 0; i < 12; i++) {
      anchor.position.set(0, 0, i % 2 === 0 ? -15 : -28); // px ≈ 1067 / 571
      lod.update(makeCamera(), 2000, 0.016);
      await flush();
      expect(handle.level).toBe(0); // still building, never committed early
    }
    expect(enqueueSpy).toHaveBeenCalledTimes(1); // one build, zero restarts

    anchor.position.set(0, 0, -15);
    for (let i = 0; i < 120 && handle.level < 6; i++) {
      lod.update(makeCamera(), 2000, 0.016);
      await flush();
    }
    expect(handle.level).toBe(6); // the held placement committed
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    lod.dispose();
  });

  it('shells resolve with the terrain — never at full opacity around the dot', async () => {
    const scene = new THREE.Scene();
    const queue = new GeometryJobQueue();
    // ~1 slice per update keeps the cold-start build in flight for a while
    const lod = createLodManager(scene, { surfaceShells: true, queue, jobBudgetMs: 0.001 });
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -14); // 0.4 radii — both shell bands fully active
    scene.add(anchor);
    const handle = lod.register({ seed: 77, radius: 10, kind: 'planet', anchor });

    // while the placement build is in flight the body is still the dot:
    // no shell may render, whatever the distance bands say
    for (let i = 0; i < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.016);
      await flush();
      expect(handle.level).toBe(0);
      expect(shellMeshes(anchor).filter((s) => s.visible)).toHaveLength(0);
    }

    // let the build land (px ≈ 457 → rung 5), then step into the dissolve
    for (let i = 0; i < 40 && handle.level < 5; i++) {
      lod.update(makeCamera(), VIEW_H, 0.016);
      await flush();
    }
    expect(handle.level).toBe(5);

    // mid-dissolve: shells render, but only as bright as the lit terrain
    lod.update(makeCamera(), VIEW_H, 0.1);
    const shells = shellMeshes(anchor);
    expect(shells).toHaveLength(2);
    const midOpacities = shells.map((s) => (s.material as THREE.LineBasicMaterial).opacity);
    for (const o of midOpacities) expect(o).toBeGreaterThan(0);
    expect(Math.max(...midOpacities)).toBeLessThan(CLOUD_MAX_OPACITY * 0.5); // no pop

    // once the dissolve completes, shells reach full band opacity
    for (let i = 0; i < 10; i++) lod.update(makeCamera(), VIEW_H, 0.1);
    const settled = shellMeshes(anchor)
      .map((s) => (s.material as THREE.LineBasicMaterial).opacity)
      .sort((a, b) => a - b);
    expect(settled[0]).toBeCloseTo(GRATICULE_MAX_OPACITY, 5);
    expect(settled[1]).toBeCloseTo(CLOUD_MAX_OPACITY, 5);
    lod.dispose();
  });

  it('grows graticule + cloud shells inside their bands when surfaceShells is on', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene, { surfaceShells: true });
    const anchor = new THREE.Group();
    anchor.position.set(0, 0, -14); // 0.4 radii off the surface — both bands
    scene.add(anchor);
    lod.register({ seed: 71, radius: 10, kind: 'planet', anchor });
    for (let i = 0; i < 6; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }

    const shells = shellMeshes(anchor);
    expect(shells).toHaveLength(2);
    const graticule = shells.find((s) => s.scale.x < 10.5)!;
    const clouds = shells.find((s) => s.scale.x > 10.5)!;
    expect(graticule.scale.x).toBeCloseTo(10, 5); // 1.0 r, full apparent scale
    expect(clouds.scale.x).toBeCloseTo(10 * CLOUD_SHELL_RADII, 5); // 1.1 r
    expect((graticule.material as THREE.LineBasicMaterial).opacity).toBeCloseTo(
      GRATICULE_MAX_OPACITY,
      5,
    );
    expect((clouds.material as THREE.LineBasicMaterial).opacity).toBeCloseTo(CLOUD_MAX_OPACITY, 5);

    // clouds drift at the constant rate; the graticule stays body-fixed
    const cloudPhase = clouds.rotation.y;
    const graticulePhase = graticule.rotation.y;
    lod.update(makeCamera(), VIEW_H, 1);
    expect(clouds.rotation.y - cloudPhase).toBeCloseTo(CLOUD_DRIFT_RAD_S, 6);
    expect(graticule.rotation.y).toBe(graticulePhase);

    // leaving the bands hides both (zero cost), materials survive re-entry
    anchor.position.set(0, 0, -60); // 5 radii — outside both bands
    lod.update(makeCamera(), VIEW_H, 0.6);
    expect(shells.every((s) => !s.visible)).toBe(true);
    lod.dispose();
    expect(anchor.children).toHaveLength(0); // shells cleaned up with the body
  });

  it('shares one unit geometry per shell across bodies (material per body)', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene, { surfaceShells: true });
    const a = new THREE.Group();
    const b = new THREE.Group();
    a.position.set(0, 0, -14);
    b.position.set(0, 0, -14);
    scene.add(a, b);
    lod.register({ seed: 72, radius: 10, kind: 'planet', anchor: a });
    lod.register({ seed: 73, radius: 10, kind: 'planet', anchor: b });
    for (let i = 0; i < 12; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6); // terrain up + dissolves settled
      await flush();
    }

    const [shellA] = shellMeshes(a);
    const shellsB = shellMeshes(b);
    const twin = shellsB.find((s) => s.geometry === shellA.geometry)!;
    expect(twin).toBeDefined();
    expect(twin.material).not.toBe(shellA.material);
    lod.dispose();
  });

  it('adds no shells to stars, far bodies, or non-opted managers', async () => {
    const scene = new THREE.Scene();
    const lod = createLodManager(scene, { surfaceShells: true });
    const star = new THREE.Group();
    star.position.set(0, 0, -14); // in-band, but stars get no shells
    const farPlanet = new THREE.Group();
    farPlanet.position.set(0, 0, -14 - 10 * CLOUD_FAR * 2); // beyond both bands
    scene.add(star, farPlanet);
    lod.register({ seed: 74, radius: 10, kind: 'star', anchor: star });
    lod.register({ seed: 75, radius: 10, kind: 'planet', anchor: farPlanet });

    const defaultScene = new THREE.Scene();
    const defaultLod = createLodManager(defaultScene); // Home DEEP FIELD mount
    const skimmed = new THREE.Group();
    skimmed.position.set(0, 0, -14);
    defaultScene.add(skimmed);
    defaultLod.register({ seed: 76, radius: 10, kind: 'planet', anchor: skimmed });

    for (let i = 0; i < 4; i++) {
      lod.update(makeCamera(), VIEW_H, 0.6);
      defaultLod.update(makeCamera(), VIEW_H, 0.6);
      await flush();
    }
    expect(shellMeshes(star)).toHaveLength(0);
    expect(shellMeshes(farPlanet)).toHaveLength(0);
    expect(shellMeshes(skimmed)).toHaveLength(0); // opt-in off: look unchanged
    lod.dispose();
    defaultLod.dispose();
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

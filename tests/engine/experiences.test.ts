// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDeepField } from 'components/deepfield/createDeepField';
import { createEphemeris } from 'components/ephemeris/createEphemeris';
import { createStage, type Stage } from 'engine/render/stage';
import { createGovernorState, qualityForLevel } from 'engine/core/governor';
import { createResourceTracker } from 'engine/render/resourceTracker';
import { ICO_LOW } from 'engine/render/assets';

vi.mock('engine/render/stage', async importOriginal => ({
  ...await importOriginal<typeof import('engine/render/stage')>(), createStage: vi.fn(),
}));
let stage: Stage;
let frame: ((dt: number, t: number) => void) | null;
let elapsed: number;
beforeEach(() => {
  elapsed = 0; frame = null;
  vi.mocked(createStage).mockImplementation((container, opts = {}) => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(opts.fov, 16 / 9, opts.near, opts.far);
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const tracker = createResourceTracker(), governor = createGovernorState();
    stage = {
      scene, camera, tracker, governor,
      renderer: {
        domElement: canvas, getPixelRatio: () => 1,
        info: { render: { calls: 0, triangles: 0, lines: 0, points: 0 }, memory: { geometries: 0, textures: 0 } },
      } as unknown as THREE.WebGLRenderer,
      quality: () => qualityForLevel(governor.level), frameCount: () => 0,
      setPaused() {}, start(callback) { frame = callback; },
      dispose() { frame = null; tracker.dispose(); canvas.remove(); },
    };
    return stage;
  });
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
function host() {
  const el = document.createElement('div');
  Object.defineProperties(el, { clientWidth: { value: 1280 }, clientHeight: { value: 720 } });
  document.body.appendChild(el);
  return el;
}
async function advance(frames: number) {
  for (let i = 0; i < frames; i++) {
    elapsed += 1 / 60;
    frame?.(1 / 60, elapsed);
    stage.scene.updateMatrixWorld(true);
    await Promise.resolve();
  }
}

it('deep field reverses transitions without resetting the camera and settles back to title', async () => {
  const container = host(), modes: string[] = [];
  const sharedDispose = vi.spyOn(ICO_LOW, 'dispose');
  const game = createDeepField(container, { onMode: mode => modes.push(mode) });
  await advance(1);
  game.play(); await advance(40);
  const before = stage.camera.position.clone();
  game.exit(); await advance(1);
  expect(stage.camera.position.distanceTo(before)).toBeLessThan(1);
  await advance(9);
  game.play(); await advance(180);
  expect(modes.at(-1)).toBe('play');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  await advance(130);
  expect(modes).toEqual(['engage', 'disengage', 'engage', 'play', 'disengage', 'title']);
  game.dispose();
  expect(frame).toBeNull();
  expect(container.querySelector('canvas')).toBeNull();
  expect(sharedDispose).not.toHaveBeenCalled();
});

it('ephemeris survives a distant warp and remount, cleaning its debug handle and owned resources', async () => {
  const container = host();
  const hud = Object.fromEntries(['body', 'dist', 'speed', 'sector', 'contacts', 'ping'].map(key => [key, document.createElement('div')])) as Parameters<typeof createEphemeris>[1];
  const sharedDispose = vi.spyOn(ICO_LOW, 'dispose');
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
  const windowDebug = window as unknown as { __EPHEMERIS?: { warp(x: number, y: number, z: number): void; shipAbs(): { x: number; y: number; z: number } } };
  const dispose = createEphemeris(container, hud);
  await advance(3);
  expect(hud.sector.textContent).toBeTruthy();
  windowDebug.__EPHEMERIS!.warp(1_000_000, -500_000, 300_000);
  await advance(3);
  const position = windowDebug.__EPHEMERIS!.shipAbs();
  expect(Math.abs(position.x - 1_000_000)).toBeLessThan(10);
  expect(Number.isFinite(stage.camera.position.length())).toBe(true);
  const before = geometryDispose.mock.calls.length;
  dispose();
  expect(windowDebug.__EPHEMERIS).toBeUndefined();
  expect(geometryDispose.mock.calls.length).toBeGreaterThan(before);
  expect(sharedDispose).not.toHaveBeenCalled();
  expect(container.querySelector('canvas')).toBeNull();
  const again = createEphemeris(container, hud);
  await advance(2);
  expect(windowDebug.__EPHEMERIS).toBeDefined();
  again();
});

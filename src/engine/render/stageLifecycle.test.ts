// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createStage } from 'engine/render/stage';

const drawing = vi.hoisted(() => ({ frame: null as ((now: number) => void) | null }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement('canvas');
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    getContext = vi.fn(() => ({ getExtension: () => null }));
    setAnimationLoop(callback: ((now: number) => void) | null) { drawing.frame = callback; }
  } };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it('combines real pause sources, resets the clock on resume, and disposes a mounted stage', () => {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  let intersection!: (entries: { isIntersecting: boolean }[]) => void;
  const disconnectIntersection = vi.fn(), disconnectResize = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof intersection) { intersection = callback; }
    observe() {}
    disconnect = disconnectIntersection;
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnectResize; });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const stage = createStage(container);
  const onFrame = vi.fn();
  const owned = { dispose: vi.fn() };
  stage.tracker.track(owned);
  stage.start(onFrame);
  drawing.frame!(1016);
  expect(onFrame.mock.calls[0][0]).toBeCloseTo(0.016);
  expect(stage.frameCount()).toBe(1);

  hidden.mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  intersection([{ isIntersecting: false }]);
  stage.setPaused(true);
  expect(drawing.frame).toBeNull();
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange'));
  stage.setPaused(false);
  expect(drawing.frame).toBeNull(); // still offscreen
  now = 60_000;
  intersection([{ isIntersecting: true }]);
  drawing.frame!(60016);
  expect(onFrame.mock.calls[1][0]).toBeCloseTo(0.016);

  stage.governor.gpuEma = 50;
  stage.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
  expect(stage.governor.gpuEma).toBeUndefined();
  expect(stage.renderer.getContext).toHaveBeenCalledTimes(2);
  stage.dispose(); stage.dispose();
  stage.renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));
  expect(stage.renderer.getContext).toHaveBeenCalledTimes(2);
  expect(drawing.frame).toBeNull();
  expect(container.children).toHaveLength(0);
  expect(owned.dispose).toHaveBeenCalledTimes(1);
  expect(stage.renderer.dispose).toHaveBeenCalledTimes(1);
  expect(disconnectIntersection).toHaveBeenCalledTimes(1);
  expect(disconnectResize).toHaveBeenCalledTimes(1);
  document.dispatchEvent(new Event('visibilitychange'));
  stage.start(onFrame);
  expect(drawing.frame).toBeNull();
});

import * as THREE from 'three';
import type { EphemerisHudElements, EphemerisPhase } from 'components/ephemeris/createEphemeris';
import type { ContactKind } from 'components/ephemeris/survey';
import { createGovernorState, qualityForLevel } from 'engine/core/governor';
import { createResourceTracker } from 'engine/render/resourceTracker';
import type { Stage, StageOptions } from 'engine/render/stage';
import type { PilotControls, PilotWorld } from './pilot';

/** Game area the tests mount into: 1280x720 at the page origin. */
export const VIEW = { width: 1280, height: 720 };

/**
 * A stage without a renderer: the real scene, camera and resource tracker,
 * and a frame callback the test steps by hand. Everything the sim does
 * (flight, streaming, LOD, the survey) runs for real; only drawing is absent.
 */
export interface FakeStage {
  stage: Stage;
  /** Steps the sim `frames` times at `dt` seconds per frame. */
  advance(frames: number, dt?: number): Promise<void>;
  /** True while the sim has a frame callback, false once disposed. */
  running(): boolean;
}

export function createFakeStage(container: HTMLElement, opts: StageOptions = {}): FakeStage {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov, VIEW.width / VIEW.height, opts.near, opts.far);
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const tracker = createResourceTracker();
  const governor = createGovernorState();
  let frame: ((dt: number, t: number) => void) | null = null;
  let elapsed = 0;
  const stage: Stage = {
    scene,
    camera,
    tracker,
    governor,
    renderer: {
      domElement: canvas,
      getPixelRatio: () => 1,
      info: { render: { calls: 0, triangles: 0, lines: 0, points: 0 }, memory: { geometries: 0, textures: 0 } },
    } as unknown as THREE.WebGLRenderer,
    quality: () => qualityForLevel(governor.level),
    frameCount: () => 0,
    setPaused() {},
    start(callback) { frame = callback; },
    dispose() {
      frame = null;
      tracker.dispose();
      canvas.remove();
    },
  };
  return {
    stage,
    running: () => frame !== null,
    async advance(frames, dt = 1 / 60) {
      for (let i = 0; i < frames; i++) {
        elapsed += dt;
        frame?.(dt, elapsed);
        // what the renderer would do before drawing
        scene.updateMatrixWorld(true);
        // let finished LOD geometry jobs land, as they would between frames
        await Promise.resolve();
      }
    },
  };
}

/** A game area of `VIEW` size, in the document. */
export function createHost(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperties(el, { clientWidth: { value: VIEW.width }, clientHeight: { value: VIEW.height } });
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: VIEW.width, bottom: VIEW.height, width: VIEW.width, height: VIEW.height, x: 0, y: 0 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const HUD_KEYS: Record<keyof EphemerisHudElements, true> = {
  body: true, dist: true, speed: true, sector: true, contacts: true, ping: true,
  best: true, clock: true, fuelFill: true, fuelLabel: true,
  scan: true, scanArc: true, scanLabel: true, marker: true, markerGlyph: true, markerLabel: true,
};

/** One detached element per HUD slot. */
export function createHud(): EphemerisHudElements {
  return Object.fromEntries(
    Object.keys(HUD_KEYS).map((key) => [key, document.createElement('div')]),
  ) as unknown as EphemerisHudElements;
}

/** The sim's debug handle, as the tests and the pilot use it. */
export interface EphemerisDebug extends PilotWorld {
  warp(x: number, y: number, z: number, lookX?: number, lookY?: number, lookZ?: number): void;
  attitude(): {
    quaternion: { x: number; y: number; z: number; w: number };
    levelUp: { x: number; y: number; z: number };
    fov: number;
    aspect: number;
  };
  pois(): Array<{ name: string; x: number; y: number; z: number; radius: number; id: string; kind: ContactKind; solid: boolean; envelope: boolean }>;
  state(): {
    phase: EphemerisPhase;
    timeLeft: number;
    fuel: number;
    score: number;
    scanned: string[];
    scanId: string | null;
    scanProgress: number;
    tooFast: boolean;
    speed: number;
    burning: boolean;
    marker: { x: number; y: number; onScreen: boolean; dist: number } | null;
  };
}

export const debug = (): EphemerisDebug =>
  (window as unknown as { __EPHEMERIS: EphemerisDebug }).__EPHEMERIS;

/** A pointer event on `target`. happy-dom's PointerEvent carries the same fields a browser's does. */
export function pointer(
  target: EventTarget,
  type: string,
  init: { x?: number; y?: number; id?: number; pointerType?: string } = {},
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      clientX: init.x ?? 0,
      clientY: init.y ?? 0,
      pointerId: init.id ?? 1,
      pointerType: init.pointerType ?? 'mouse',
    }),
  );
}

export function key(type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, ...init }));
}

/** An in-memory `Storage` stand-in. */
export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (name: string) => data.get(name) ?? null,
    setItem: (name: string, value: string) => { data.set(name, value); },
  };
}

/** The pilot's hands in a test: the mouse over the game area and the Space bar. */
export function pilotControls(container: HTMLElement): PilotControls {
  return {
    mouse(x, y) {
      pointer(container, 'pointermove', { x: (x * 0.5 + 0.5) * VIEW.width, y: (0.5 - y * 0.5) * VIEW.height });
    },
    burn(held) {
      key(held ? 'keydown' : 'keyup', 'Space');
    },
  };
}

import * as THREE from 'three';
import {
  createGovernorState,
  pushFrameTime,
  qualityForLevel,
  type GovernorState,
  type QualityLevel,
} from 'engine/core/governor';
import { createResourceTracker, type ResourceTracker } from 'engine/render/resourceTracker';

/**
 * Longest simulation step (seconds) a single frame may take. Frames arriving
 * late (background throttling, GC pause, resume from pause) are clamped so
 * the world never jumps.
 */
export const MAX_DT = 0.05;

/** Clamped frame delta in seconds from two millisecond timestamps. */
export function clampDt(now: number, last: number): number {
  return Math.max(0, Math.min((now - last) / 1000, MAX_DT));
}

/** Why the loop is (or isn't) running; any active source pauses it. */
export type PauseSource = 'hidden' | 'offscreen' | 'explicit';

/** Pure pause resolution: the loop runs only when no source is active. */
export function isPaused(sources: ReadonlySet<PauseSource>): boolean {
  return sources.size > 0;
}

/**
 * Governor pixel-ratio cap for a quality level, with an optional raised
 * level-0 ceiling (`maxPixelRatio`). The option only ever RAISES level 0
 * (never lowers any cap — a ceiling at or below the table is a no-op);
 * degraded levels keep their own smaller table caps, so governor steps
 * down always shed pixels below it.
 */
export function pixelRatioCap(level: number, maxPixelRatio?: number): number {
  const table = qualityForLevel(level).pixelRatio;
  if (maxPixelRatio === undefined || level !== 0) return table;
  return Math.max(table, maxPixelRatio);
}

/**
 * Applies the governor's per-frame quality knobs — THE list of what the
 * adaptive-quality governor drives beyond the stage's own pixelRatio cap:
 * dust density and the LOD rung bias. Call once per frame at the end of a
 * scene's loop; both knobs are identity at level 0.
 */
export function applyQuality(
  stage: Pick<Stage, 'quality'>,
  dust: { setDensity(fraction: number): void },
  lod: { setLodBias(bias: number): void },
): void {
  const quality = stage.quality();
  dust.setDensity(quality.dustFraction);
  lod.setLodBias(quality.lodBias);
}

export interface StageOptions {
  fov?: number;
  near?: number;
  far?: number;
  /** FogExp2 density (black fog); omit for no fog. */
  fogDensity?: number;
  /**
   * Logarithmic depth buffer for scenes spanning many distance decades with
   * coplanar/nested surfaces (EPHEMERIS: LOD shells, skim-band shells,
   * near 0.5 / far 60,000). A linear 24-bit z-buffer z-fights those cases;
   * the log-depth cost (broken early-z) is negligible on a low-overdraw
   * wireframe scene. Scenes without nesting should keep the default.
   */
  logDepth?: boolean;
  /**
   * Raises the governor's level-0 pixel-ratio ceiling (see pixelRatioCap).
   * Light scenes whose 1px wireframes want full retina crispness (DEEP
   * FIELD) pass 2; the default keeps the quality table's 1.5 cap.
   */
  maxPixelRatio?: number;
}

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  /**
   * Disposal registry for mount-owned GPU resources. Shared engine assets
   * (engine/render/assets) are never tracked, so they survive teardown.
   */
  tracker: ResourceTracker;
  /**
   * Adaptive-quality governor state. Fed one JS-cost sample (sim callback +
   * draw submission, ms) per frame; a sustained overload sheds pixels via
   * the DPR ladder, never frames — slow smooth motion is the aesthetic.
   * Read-only for consumers (the stats overlay renders it).
   */
  governor: GovernorState;
  /**
   * Settings for the governor's current quality level. The stage applies
   * the pixelRatio cap itself; consumers feed dustFraction/lodBias to their
   * dust field and LOD manager each frame (identity at level 0).
   */
  quality(): QualityLevel;
  /** Frames rendered since creation; the stats overlay derives FPS from it. */
  frameCount(): number;
  /** Sets the per-frame callback and starts the loop; runs before render. */
  start(onFrame: (dt: number, t: number) => void): void;
  /** Explicit pause switch, on top of visibility/occlusion pausing. */
  setPaused(paused: boolean): void;
  /** Stops the loop, frees tracked resources, removes the canvas. */
  dispose(): void;
}

/**
 * Creates the shared render stage: scene + camera + renderer with the house
 * policy, and a pausable, clamped frame loop.
 *
 * Renderer policy: MSAA stays on (1px white wireframes shimmer without it);
 * pixels are shed via the DPR cap instead — DPR 2 + MSAA costs roughly 4×
 * the fragment work of DPR 1 for no visible gain on this aesthetic.
 *
 * The loop pauses entirely (setAnimationLoop(null) — no half-rate idling)
 * whenever the document is hidden, the container is scrolled out of view or
 * occluded, or the caller asks; so the landing background costs ~zero when
 * not being looked at. The clock resets on resume, so a pause never becomes
 * a giant dt.
 */
export function createStage(container: HTMLElement, opts: StageOptions = {}): Stage {
  const { fov = 60, near = 0.1, far = 5000, fogDensity, logDepth = false, maxPixelRatio } = opts;

  const scene = new THREE.Scene();
  if (fogDensity !== undefined) scene.fog = new THREE.FogExp2(0x000000, fogDensity);
  const camera = new THREE.PerspectiveCamera(
    fov,
    container.clientWidth / Math.max(1, container.clientHeight),
    near,
    far,
  );
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: logDepth });

  // adaptive quality: the governor watches per-frame JS cost and steps the
  // pixelRatio cap down (1.5 → 1.25 → 1.0) under sustained load — DPR is
  // the big lever. Its dustFraction/lodBias knobs are read by the
  // experiences' frame loops via quality() to shed dust and LOD rungs too.
  const governor = createGovernorState();
  const applyGovernorPixelRatio = () =>
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap(governor.level, maxPixelRatio)));
  applyGovernorPixelRatio();
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const tracker = createResourceTracker();

  // ---- pausable clamped loop ----
  let onFrame: ((dt: number, t: number) => void) | null = null;
  let running = false;
  let disposed = false;
  let last = 0;
  let t = 0;
  let frames = 0;
  const pauseSources = new Set<PauseSource>();

  const frame = (now: number) => {
    const dt = clampDt(now, last);
    last = now;
    t += dt;
    const jsStart = performance.now();
    onFrame?.(dt, t);
    renderer.render(scene, camera);
    frames++;
    // feed the JS cost (not the rAF interval — that only measures the
    // display's refresh rate) and apply a level change immediately
    const level = governor.level;
    pushFrameTime(governor, performance.now() - jsStart);
    if (governor.level !== level) applyGovernorPixelRatio();
  };

  const syncLoop = () => {
    const shouldRun = !disposed && onFrame !== null && !isPaused(pauseSources);
    if (shouldRun === running) return;
    running = shouldRun;
    if (shouldRun) {
      // reset the clock so time spent paused never becomes a giant dt
      last = performance.now();
      renderer.setAnimationLoop(frame);
    } else {
      renderer.setAnimationLoop(null);
    }
  };

  const setSource = (source: PauseSource, active: boolean) => {
    if (active) pauseSources.add(source);
    else pauseSources.delete(source);
    syncLoop();
  };

  const onVisibilityChange = () => setSource('hidden', document.hidden);
  document.addEventListener('visibilitychange', onVisibilityChange);
  onVisibilityChange();

  // browsers throttle rAF inconsistently for occluded-but-visible content;
  // observing the container makes the pause deterministic
  const intersectionObserver =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => setSource('offscreen', !entries[entries.length - 1].isIntersecting),
          { threshold: 0.01 },
        );
  intersectionObserver?.observe(container);

  // observe the container, not the window — it tracks any layout change
  const onResize = () => {
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
    camera.updateProjectionMatrix();
    // re-clamp: a drag to a different-DPR monitor changes devicePixelRatio
    applyGovernorPixelRatio();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  return {
    scene,
    camera,
    renderer,
    tracker,
    governor,
    quality: () => qualityForLevel(governor.level),
    frameCount: () => frames,
    start(cb) {
      onFrame = cb;
      syncLoop();
    },
    setPaused(paused) {
      setSource('explicit', paused);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      syncLoop();
      resizeObserver.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      tracker.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

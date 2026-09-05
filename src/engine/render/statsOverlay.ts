import { framePercentile, type GovernorState } from 'engine/core/governor';

/**
 * Dev-only stats overlay: a terminal-styled panel (mono caps, square
 * corners, 1px white-alpha border on black) that reads renderer.info and
 * the stage's governor state so every perf budget is measurable in place.
 *
 * - Active only in dev builds, or with a `?stats` query param (preview
 *   deployments); otherwise `attachStatsOverlay` is an inert no-op.
 * - Toggled with the backquote key; starts visible only when `?stats` asked
 *   for it explicitly.
 * - Refreshes at 4 Hz via a timer, never per frame — watching the numbers
 *   must not perturb them.
 */

/** One 4 Hz sample of everything the overlay displays. */
export interface StatsSnapshot {
  /** Rendered frames per second since the previous refresh. */
  fps: number;
  /** ~30-frame EMA of the JS cost per frame (sim + draw submission), ms. */
  jsEmaMs: number;
  /** p95 of the same JS cost over the governor's history window, ms. */
  jsP95Ms: number;
  gpuEmaMs?: number;
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  /** Current governor quality level (0 = best). */
  level: number;
  pixelRatio: number;
  /** Host-provided lines (active sectors, LOD bodies, …). */
  extra?: readonly string[];
}

/** Compact count: 950 → "950", 48_200 → "48.2K", 3_400_000 → "3.4M". */
export const formatCount = (n: number): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
};

/** Pure snapshot → display lines; the DOM writer just joins them. */
export function formatStats(s: StatsSnapshot): string[] {
  const lines = [
    `FPS ${Math.round(s.fps)} · JS ${s.jsEmaMs.toFixed(1)} MS · P95 ${s.jsP95Ms.toFixed(1)}`,
    ...(s.gpuEmaMs === undefined ? [] : [`GPU ${s.gpuEmaMs.toFixed(1)} MS`]),
    `CALLS ${formatCount(s.calls)} · TRIS ${formatCount(s.triangles)}`,
    `LINES ${formatCount(s.lines)} · POINTS ${formatCount(s.points)}`,
    `GEOM ${formatCount(s.geometries)} · TEX ${formatCount(s.textures)}`,
    `GOV L${s.level} · DPR ${s.pixelRatio.toFixed(2)}`,
  ];
  if (s.extra) lines.push(...s.extra);
  return lines;
}

/** Pure gate: dev builds always, production only behind `?stats`. */
export const statsOverlayEnabled = (dev: boolean, search: string): boolean =>
  dev || new URLSearchParams(search).has('stats');

/** The slice of THREE.WebGLRenderer.info the overlay reads. */
export interface StatsRendererInfo {
  render: { calls: number; triangles: number; lines: number; points: number };
  memory: { geometries: number; textures: number };
}

/**
 * What the overlay needs from its host. `Stage` satisfies this structurally,
 * so callers pass the stage itself; tests pass a plain fake.
 */
export interface StatsSource {
  renderer: { info: StatsRendererInfo; getPixelRatio(): number };
  governor: GovernorState;
  frameCount(): number;
}

export interface StatsOverlayOptions {
  /** Extra display lines (active sectors, LOD bodies, …), read per refresh. */
  getExtra?: () => string[];
  /** Overrides `import.meta.env.DEV` (tests). */
  dev?: boolean;
  /** Overrides `window.location.search` (tests). */
  search?: string;
  /** Refresh period; default 250 ms (4 Hz). */
  intervalMs?: number;
}

export interface StatsOverlayHandle {
  /** The panel element, or null when the overlay is gated off. */
  readonly element: HTMLElement | null;
  dispose(): void;
}

const PANEL_STYLE = [
  'position:fixed',
  'left:12px',
  'bottom:12px',
  'z-index:9999',
  'padding:8px 10px',
  'background:rgba(0,0,0,0.85)',
  'border:1px solid rgba(255,255,255,0.2)',
  'color:rgba(255,255,255,0.85)',
  "font:10px/1.7 'SFMono-Regular',Menlo,Consolas,monospace",
  'letter-spacing:0.08em',
  'text-transform:uppercase',
  'white-space:pre',
  'pointer-events:none',
  'user-select:none',
].join(';');

/**
 * Mounts the overlay panel into `host` and wires the backquote toggle.
 * Returns an inert handle when gated off, so callers never branch.
 */
export function attachStatsOverlay(
  host: HTMLElement,
  source: StatsSource,
  opts: StatsOverlayOptions = {},
): StatsOverlayHandle {
  const dev = opts.dev ?? import.meta.env.DEV;
  const search = opts.search ?? window.location.search;
  if (!statsOverlayEnabled(dev, search)) return { element: null, dispose() {} };
  const intervalMs = opts.intervalMs ?? 250;

  const el = document.createElement('div');
  el.style.cssText = PANEL_STYLE;
  el.style.display = 'none';
  host.appendChild(el);

  let visible = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastFrames = 0;
  let lastTime = 0;

  const refresh = () => {
    const now = performance.now();
    const frames = source.frameCount();
    const fps = now > lastTime ? ((frames - lastFrames) * 1000) / (now - lastTime) : 0;
    lastFrames = frames;
    lastTime = now;
    const { governor } = source;
    const info = source.renderer.info;
    el.textContent = formatStats({
      fps,
      jsEmaMs: governor.ema,
      gpuEmaMs: source.governor.gpuEma,
      jsP95Ms: framePercentile(governor, 0.95),
      calls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      level: governor.level,
      pixelRatio: source.renderer.getPixelRatio(),
      extra: opts.getExtra?.(),
    }).join('\n');
  };

  const setVisible = (v: boolean) => {
    if (v === visible) return;
    visible = v;
    el.style.display = v ? 'block' : 'none';
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (v) {
      lastFrames = source.frameCount();
      lastTime = performance.now();
      refresh();
      timer = setInterval(refresh, intervalMs);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Backquote') setVisible(!visible);
  };
  window.addEventListener('keydown', onKeyDown);
  // dev builds stay unobtrusive until asked; `?stats` means "show me now"
  setVisible(new URLSearchParams(search).has('stats'));

  return {
    element: el,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      if (timer !== null) clearInterval(timer);
      el.remove();
    },
  };
}

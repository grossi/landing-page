// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGovernorState, pushFrameTime, type GovernorState } from 'engine/core/governor';
import {
  attachStatsOverlay,
  formatCount,
  formatStats,
  statsOverlayEnabled,
  type StatsSnapshot,
  type StatsSource,
} from 'engine/render/statsOverlay';

describe('formatCount', () => {
  it('prints small counts verbatim', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(42)).toBe('42');
    expect(formatCount(999)).toBe('999');
  });

  it('compacts thousands and millions to one decimal', () => {
    expect(formatCount(1000)).toBe('1.0K');
    expect(formatCount(48_230)).toBe('48.2K');
    expect(formatCount(3_400_000)).toBe('3.4M');
  });
});

const snapshot = (over: Partial<StatsSnapshot> = {}): StatsSnapshot => ({
  fps: 60.2,
  jsEmaMs: 2.44,
  jsP95Ms: 5.06,
  calls: 41,
  triangles: 12_400,
  lines: 48_200,
  points: 1_960,
  geometries: 30,
  textures: 2,
  level: 0,
  pixelRatio: 1.5,
  ...over,
});

describe('formatStats', () => {
  it('renders every budgeted metric in terminal caps', () => {
    expect(formatStats(snapshot())).toEqual([
      'FPS 60 · JS 2.4 MS · P95 5.1',
      'CALLS 41 · TRIS 12.4K',
      'LINES 48.2K · POINTS 2.0K',
      'GEOM 30 · TEX 2',
      'GOV L0 · DPR 1.50',
    ]);
  });

  it('appends host-provided extra lines after the core block', () => {
    const lines = formatStats(snapshot({ extra: ['SECTORS 27', 'LOD BODIES 14'] }));
    expect(lines.slice(-2)).toEqual(['SECTORS 27', 'LOD BODIES 14']);
  });

  it('reflects a degraded governor level and pixel ratio', () => {
    const lines = formatStats(snapshot({ level: 2, pixelRatio: 1 }));
    expect(lines[4]).toBe('GOV L2 · DPR 1.00');
  });
});

describe('statsOverlayEnabled', () => {
  it('is always on in dev builds', () => {
    expect(statsOverlayEnabled(true, '')).toBe(true);
  });

  it('is off in production without the query param', () => {
    expect(statsOverlayEnabled(false, '')).toBe(false);
    expect(statsOverlayEnabled(false, '?foo=1')).toBe(false);
  });

  it('turns on behind ?stats for preview deployments', () => {
    expect(statsOverlayEnabled(false, '?stats')).toBe(true);
    expect(statsOverlayEnabled(false, '?foo=1&stats')).toBe(true);
  });
});

const makeSource = (governor: GovernorState = createGovernorState()): StatsSource => {
  let frames = 0;
  return {
    renderer: {
      info: {
        render: { calls: 12, triangles: 3400, lines: 22_000, points: 900 },
        memory: { geometries: 9, textures: 1 },
      },
      getPixelRatio: () => 1.5,
    },
    governor,
    frameCount: () => frames++,
  };
};

describe('attachStatsOverlay', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('is an inert no-op when gated off (production, no ?stats)', () => {
    const handle = attachStatsOverlay(document.body, makeSource(), { dev: false, search: '' });
    expect(handle.element).toBeNull();
    expect(document.body.children).toHaveLength(0);
    handle.dispose(); // must not throw
  });

  it('starts hidden in dev and toggles with the backquote key', () => {
    const handle = attachStatsOverlay(document.body, makeSource(), { dev: true, search: '' });
    const el = handle.element!;
    expect(el.style.display).toBe('none');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('CALLS 12');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
    expect(el.style.display).toBe('none');
    handle.dispose();
  });

  it('starts visible with governor-fed numbers behind ?stats', () => {
    const governor = createGovernorState();
    for (let i = 0; i < 60; i++) pushFrameTime(governor, 4);
    const handle = attachStatsOverlay(document.body, makeSource(governor), {
      dev: false,
      search: '?stats',
      getExtra: () => ['SECTORS 27'],
    });
    const el = handle.element!;
    expect(el.style.display).toBe('block');
    expect(el.textContent).toContain('JS 4.0 MS');
    expect(el.textContent).toContain('GOV L0');
    expect(el.textContent).toContain('LINES 22.0K');
    expect(el.textContent).toContain('SECTORS 27');
    handle.dispose();
  });

  it('refreshes on a timer, not per frame, and stops on dispose', () => {
    vi.useFakeTimers();
    const source = makeSource();
    const handle = attachStatsOverlay(document.body, source, { dev: true, search: '?stats' });
    const el = handle.element!;
    const before = el.textContent;
    source.renderer.info.render.calls = 99;
    expect(el.textContent).toBe(before); // no live binding between ticks
    vi.advanceTimersByTime(260);
    expect(el.textContent).toContain('CALLS 99');
    handle.dispose();
    expect(document.body.contains(el)).toBe(false);
    source.renderer.info.render.calls = 123;
    vi.advanceTimersByTime(1000); // a leaked interval would touch the removed node
    expect(el.textContent).not.toContain('CALLS 123');
    vi.useRealTimers();
  });
});

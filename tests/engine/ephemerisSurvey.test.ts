// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEphemeris,
  type EphemerisGame,
  type EphemerisHudElements,
  type EphemerisPhase,
  type SurveyResult,
} from 'components/ephemeris/createEphemeris';
import { discoveryRange, resolveSeed, scanRange, TUNE } from 'components/ephemeris/survey';
import { ICO_LOW } from 'engine/render/assets';
import { createStage } from 'engine/render/stage';
import {
  createFakeStage,
  createHost,
  createHud,
  debug,
  key,
  memoryStorage,
  pilotControls,
  pointer,
  VIEW,
  type FakeStage,
} from './ephemerisHarness';
import { createPilot } from './pilot';

vi.mock('engine/render/stage', async importOriginal => ({
  ...await importOriginal<typeof import('engine/render/stage')>(), createStage: vi.fn(),
}));

const SEED = resolveSeed('?seed=20261126', new Date(Date.UTC(2026, 10, 26)));
const FPS = 60;
const seconds = (s: number) => Math.round(s * FPS);

let fake: FakeStage;
let container: HTMLElement;
let hud: EphemerisHudElements;
let game: EphemerisGame;
let storage: ReturnType<typeof memoryStorage>;
let phases: Array<[EphemerisPhase, SurveyResult | null]>;

function mount(options: Parameters<typeof createEphemeris>[2] = {}) {
  container = createHost();
  hud = createHud();
  phases = [];
  game = createEphemeris(container, hud, {
    seed: SEED,
    storage,
    onPhase: (phase, result) => phases.push([phase, result]),
    ...options,
  });
}

beforeEach(() => {
  storage = memoryStorage();
  vi.mocked(createStage).mockImplementation((host, opts) => (fake = createFakeStage(host, opts)).stage);
});
afterEach(() => {
  game?.dispose();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const state = () => debug().state();
const poi = (id: string) => {
  const found = debug().pois().find((p) => p.id === id);
  if (!found) throw new Error(`no POI ${id}`);
  return found;
};
/** A body's scan range, as the rules have it. */
const rangeOf = (p: ReturnType<typeof poi>) => scanRange(p.radius, p.kind, p.envelope);
/** Puts the ship at rest `surface` km above a body's surface, looking at it. */
function park(id: string, surface: number) {
  const p = poi(id);
  debug().warp(p.x, p.y + p.radius + surface, p.z, p.x, p.y, p.z);
}
const distanceFromSpawn = (spawn: { x: number; y: number; z: number }) => {
  const ship = debug().shipAbs();
  return Math.hypot(ship.x - spawn.x, ship.y - spawn.y, ship.z - spawn.z);
};
const click = () => {
  pointer(container, 'pointerdown', { x: VIEW.width / 2, y: VIEW.height / 2 });
  pointer(window, 'pointerup');
};
/** The outermost home planet: nothing else is within scan range of it. */
const PLANET = 'home:7';

describe('title', () => {
  it('opens on the title with the world already moving, and scores nothing', async () => {
    mount();
    await fake.advance(1);
    const start = debug().shipAbs();
    await fake.advance(seconds(3));
    expect(state().phase).toBe('title');
    expect(distanceFromSpawn(start)).toBeGreaterThan(150);
    expect(state().score).toBe(0);
    expect(state().timeLeft).toBe(TUNE.WINDOW_SECONDS);
    expect(phases).toEqual([]);
  });

  it('steers and burns for nobody: input behind the title does nothing', async () => {
    mount();
    await fake.advance(1);
    pointer(container, 'pointermove', { x: VIEW.width, y: 0 });
    await fake.advance(seconds(2));
    const heading = debug().attitude().quaternion;
    // still on the spawn heading: a level ship pitched 0.04 rad down
    expect(heading.y).toBeCloseTo(0, 6);
    expect(heading.z).toBeCloseTo(0, 6);
    expect(state().speed).toBeLessThan(110);
  });

  it.each([
    ['a click', () => click()],
    ['a tap', () => pointer(container, 'pointerdown', { x: 100, y: 600, id: 4, pointerType: 'touch' })],
    ['a key', () => key('keydown', 'Enter')],
  ])('%s starts the survey', async (_name, press) => {
    mount();
    await fake.advance(2);
    press();
    expect(phases).toEqual([['survey', null]]);
    await fake.advance(seconds(1.5));
    expect(state().phase).toBe('survey');
    expect(state().timeLeft).toBeCloseTo(TUNE.WINDOW_SECONDS - 1.5, 1);
    // the clock rounds up: 0:00 is shown only when it is over
    expect(hud.clock.textContent).toBe('3:59');
  });

  it('the press that starts the survey is not also a burn', async () => {
    mount();
    await fake.advance(2);
    // held, not released
    pointer(container, 'pointerdown', { x: VIEW.width / 2, y: VIEW.height / 2 });
    await fake.advance(seconds(2));
    expect(state().burning).toBe(false);
    expect(state().fuel).toBe(1);
    // the next press is a burn
    pointer(window, 'pointerup');
    pointer(container, 'pointerdown', { x: VIEW.width / 2, y: VIEW.height / 2 });
    await fake.advance(seconds(1));
    expect(state().burning).toBe(true);
  });

  it('a key held down to start does not turn into a burn when the keyboard repeats it', async () => {
    mount();
    await fake.advance(2);
    key('keydown', 'Space');
    expect(state().phase).toBe('survey');
    for (let i = 0; i < 30; i++) {
      key('keydown', 'Space', { repeat: true });
      await fake.advance(2);
    }
    expect(state().burning).toBe(false);
    expect(state().fuel).toBe(1);
    // lifted and pressed again, it burns
    key('keyup', 'Space');
    key('keydown', 'Space');
    await fake.advance(seconds(0.5));
    expect(state().burning).toBe(true);
  });

  it('starts every survey from the same place with the world in the same state', async () => {
    mount();
    await fake.advance(seconds(7));
    game.start('survey');
    await fake.advance(1);
    const first = { ship: debug().shipAbs(), pois: debug().pois(), attitude: debug().attitude() };

    // fly somewhere else for a while, turning and rolling off level, then start again
    pointer(container, 'pointermove', { x: VIEW.width * 0.6, y: VIEW.height * 0.35 });
    key('keydown', 'Space');
    await fake.advance(seconds(20));
    key('keyup', 'Space');
    expect(distanceFromSpawn(first.ship)).toBeGreaterThan(10000);
    pointer(container, 'pointermove', { x: VIEW.width / 2, y: VIEW.height / 2 });
    game.start('survey');
    await fake.advance(1);

    const again = { ship: debug().shipAbs(), pois: debug().pois(), attitude: debug().attitude() };
    expect(distanceFromSpawn(first.ship)).toBeLessThan(0.01);
    expect(again.attitude.quaternion.x).toBeCloseTo(first.attitude.quaternion.x, 6);
    expect(again.attitude.quaternion.y).toBeCloseTo(first.attitude.quaternion.y, 6);
    expect(again.attitude.levelUp).toEqual({ x: 0, y: 1, z: 0 });
    // every body, orbiting ones and the comet included, is where it was
    for (const body of first.pois.filter((p) => p.id.startsWith('home:'))) {
      const now = again.pois.find((p) => p.id === body.id)!;
      expect(Math.hypot(now.x - body.x, now.y - body.y, now.z - body.z), body.name).toBeLessThan(0.5);
    }
    expect(state()).toMatchObject({ score: 0, fuel: 1, scanned: [], scanProgress: 0 });
    expect(state().timeLeft).toBeCloseTo(TUNE.WINDOW_SECONDS, 1);
  });
});

describe('scanning in the sim', () => {
  beforeEach(async () => {
    mount();
    await fake.advance(2);
    game.start('survey');
    await fake.advance(1);
  });

  it('logs a body after the scan time in range, pays its value and refuels', async () => {
    const range = rangeOf(poi(PLANET));
    // the envelope: farther out than the range a planet was ever logged from
    expect(range).toBe(poi(PLANET).radius * 4);
    expect(range * 0.8).toBeGreaterThan(discoveryRange(poi(PLANET).radius));
    // spend some fuel first, so the refuel shows
    key('keydown', 'Space');
    await fake.advance(seconds(8));
    key('keyup', 'Space');
    const fuelBefore = state().fuel;
    expect(fuelBefore).toBeLessThan(1 - TUNE.REFUEL);
    park(PLANET, range * 0.8);

    await fake.advance(seconds(TUNE.SCAN_SECONDS - 0.3));
    expect(state().scanId).toBe(PLANET);
    expect(state().scanProgress).toBeGreaterThan(0.6);
    expect(state().scanned).toEqual([]);
    expect(hud.scan.style.opacity).toBe('1');
    expect(hud.scanLabel.textContent).toContain(`SCANNING · ${poi(PLANET).name}`);
    // the ring names the body: the marker does not sit on top of it
    expect(hud.marker.style.opacity).toBe('0');

    await fake.advance(seconds(0.6));
    const value = poi(PLANET).kind === 'ringedPlanet' ? 150 : 100;
    expect(state().scanned).toEqual([PLANET]);
    expect(state().score).toBe(value);
    expect(state().fuel).toBeCloseTo(fuelBefore + TUNE.REFUEL, 5);
    expect(hud.contacts.textContent).toBe(`SCORE ${value}`);
    expect(hud.ping.textContent).toContain(`LOGGED · ${poi(PLANET).name}`);
    expect(hud.ping.textContent).toContain(`+${value}`);
    // the ring is gone and the same body does not scan twice
    await fake.advance(seconds(3));
    expect(hud.scan.style.opacity).toBe('0');
    expect(state().score).toBe(value);
  });

  it('does not fill out of range', async () => {
    const p = poi(PLANET);
    const range = rangeOf(p);
    // just outside, looking away, so cruise carries the ship further out
    debug().warp(p.x, p.y + p.radius + range * 1.1, p.z, p.x, p.y + 1e6, p.z);
    await fake.advance(seconds(4));
    expect(state().scanId).toBeNull();
    expect(state().scanProgress).toBe(0);
    expect(state().scanned).toEqual([]);
    expect(hud.scan.style.opacity).toBe('0');
  });

  it('does not fill at burn speed: burning through a nebula logs nothing until the ship slows', async () => {
    // a formation has no flight law to slow the ship, so a burn crosses it fast
    const nebula = debug().pois().find((p) => p.kind === 'nebula');
    if (!nebula) throw new Error('this seed has no nebula in the opening window');
    // well clear of anything solid, so the nebula is the only body in range
    debug().warp(nebula.x, nebula.y, nebula.z + nebula.radius * 0.9, nebula.x, nebula.y, nebula.z);
    key('keydown', 'Space');
    await fake.advance(seconds(1.2));
    expect(state().speed).toBeGreaterThan(TUNE.SCAN_MAX_SPEED);
    expect(state().scanId).toBe(nebula.id);
    expect(state().tooFast).toBe(true);
    expect(state().scanProgress).toBe(0);
    expect(hud.scanLabel.textContent).toContain('TOO FAST');
    await fake.advance(seconds(1));
    expect(state().scanned).toEqual([]);

    // off the burn, back inside the nebula: it slows, fills and logs, at double value
    key('keyup', 'Space');
    debug().warp(nebula.x, nebula.y, nebula.z + nebula.radius * 0.9, nebula.x, nebula.y, nebula.z);
    await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.5));
    expect(state().scanned).toEqual([nebula.id]);
    expect(state().score).toBe(600);
  });

  it('scans a formation from inside it, not from the range it is logged from in free drift', async () => {
    const nebula = debug().pois().find((p) => p.kind === 'nebula')!;
    // 300 km outside its edge: inside the free-drift discovery range, looking away
    expect(discoveryRange(nebula.radius)).toBeGreaterThan(300);
    debug().warp(nebula.x, nebula.y, nebula.z + nebula.radius + 300, nebula.x, nebula.y, nebula.z + 1e6);
    await fake.advance(seconds(3));
    expect(state().scanId).toBeNull();
    expect(state().scanned).toEqual([]);
  });

  it('measures the comet\'s own speed the same on uneven frames', async () => {
    const comet = debug().pois().find((p) => p.kind === 'comet')!;
    // inside its range, off its path, looking at it
    debug().warp(comet.x, comet.y + comet.radius + 300, comet.z, comet.x, comet.y, comet.z);
    await fake.advance(2);
    const speeds: number[] = [];
    // frames of 1/60 and 1/30 s in turn, as a browser dropping every other frame
    for (let i = 0; i < 16 && state().scanId === comet.id; i++) {
      await fake.advance(1, i % 2 ? 1 / 30 : 1 / 60);
      speeds.push(state().bodySpeed);
    }
    expect(speeds.length).toBeGreaterThan(8);
    // the comet runs its orbit at 190 to 440 km/s, and does not change speed frame to frame
    expect(Math.min(...speeds)).toBeGreaterThan(150);
    expect(Math.max(...speeds)).toBeLessThan(500);
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.05);
  });

  it('keeps the ring on one body where two ranges overlap', async () => {
    // the innermost planet orbits inside the sun's scan range
    const sun = poi('home:0');
    const inner = poi('home:1');
    const toSun = Math.hypot(inner.x - sun.x, inner.y - sun.y, inner.z - sun.z) - sun.radius;
    expect(toSun).toBeLessThan(rangeOf(sun));
    park('home:1', rangeOf(inner) * 0.5);
    await fake.advance(seconds(0.5));
    const first = state().scanId;
    expect(first).not.toBeNull();
    await fake.advance(seconds(0.9));
    // the ring never changed hands mid-fill
    expect(state().scanId).toBe(first);
    await fake.advance(seconds(0.5));
    expect(state().scanned).toEqual([first]);
  });

  it('points the marker at the nearest unscanned contact with its kind and distance', async () => {
    await fake.advance(seconds(0.3));
    const ship = debug().shipAbs();
    const nearest = debug().pois()
      .map((p) => ({ ...p, d: Math.hypot(p.x - ship.x, p.y - ship.y, p.z - ship.z) - p.radius }))
      .sort((a, b) => a.d - b.d)[0];
    expect(hud.marker.style.opacity).toBe('1');
    expect(hud.markerLabel.textContent).toMatch(/^[A-Z ]+\n\d+(\.\d+)? (km|Mm)$/);
    expect(state().marker!.dist).toBeCloseTo(nearest.d, -1);

    // once that body is scanned the marker moves on to another
    park(nearest.id, 100);
    const before = hud.markerLabel.textContent;
    await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.5));
    expect(state().scanned).toEqual([nearest.id]);
    expect(state().marker).not.toBeNull();
    expect(state().marker!.dist).toBeGreaterThan(200);
    expect(hud.markerLabel.textContent).not.toBe(before);
  });

  it('never shows the last target\'s label on the next target', async () => {
    // the label is rewritten ten times a second: try every phase of that against the log
    for (let offset = 0; offset < 6; offset++) {
      game.start('survey');
      await fake.advance(1 + offset);
      park(PLANET, 100);
      let shownAfterLog = 0;
      // frame by frame through the scan and the frames after it
      for (let i = 0; i < seconds(TUNE.SCAN_SECONDS + 0.5); i++) {
        await fake.advance(1);
        if (state().scanned.length === 0 || hud.marker.style.opacity !== '1') continue;
        shownAfterLog++;
        // whenever the marker is up again it is about a body far from here,
        // not the planet 100 km below that was just logged
        const [, distance] = hud.markerLabel.textContent!.split('\n');
        expect(distance.endsWith('Mm') || parseInt(distance, 10) > 500, `offset ${offset}: ${distance}`).toBe(true);
      }
      expect(state().scanned).toEqual([PLANET]);
      expect(shownAfterLog).toBeGreaterThan(10);
    }
  });

  it('keeps the marker on the side a body really is when it is behind the ship', async () => {
    const p = poi(PLANET);
    // looking along +z with the planet behind and to the right (+x)
    debug().warp(p.x - 2000, p.y, p.z + 3000, p.x - 2000, p.y, p.z + 1e6);
    // facing +z the ship's right is world −x: the planet at +x is on the LEFT
    await fake.advance(seconds(0.3));
    const marker = state().marker!;
    expect(marker.onScreen).toBe(false);
    expect(marker.x).toBeLessThan(0);
    expect(hud.markerGlyph.textContent).toBe('▶');
  });
});

describe('the marker on a phone', () => {
  it('stays above the BURN zone', async () => {
    const burnZone = document.createElement('div');
    // bottom right of the 1280x720 game area, its top edge 160 px above the bottom
    burnZone.getBoundingClientRect = () =>
      ({ left: 1164, top: 560, right: 1260, bottom: 656, width: 96, height: 96, x: 1164, y: 560 }) as DOMRect;
    mount({ burnZone });
    await fake.advance(2);
    game.start('survey');
    await fake.advance(1);
    // a target straight below the ship: the marker goes to the bottom edge
    const p = poi(PLANET);
    debug().warp(p.x, p.y + 3000, p.z, p.x, p.y + 3000, p.z + 1e6);
    await fake.advance(seconds(0.3));
    const marker = state().marker!;
    expect(marker.onScreen).toBe(false);
    const markerY = (0.5 - marker.y * 0.5) * VIEW.height;
    expect(markerY).toBeLessThan(560 - 20);
    expect(markerY).toBeGreaterThan(VIEW.height / 2);

    // without a zone on screen it uses the room: lower than that
    game.dispose();
    document.body.replaceChildren();
    mount();
    await fake.advance(2);
    game.start('survey');
    await fake.advance(1);
    debug().warp(p.x, p.y + 3000, p.z, p.x, p.y + 3000, p.z + 1e6);
    await fake.advance(seconds(0.3));
    expect((0.5 - state().marker!.y * 0.5) * VIEW.height).toBeGreaterThan(560);
  });
});

describe('fuel in the sim', () => {
  it('a burn drains the tank, an empty tank cruises, and a scan gives the burn back', async () => {
    mount();
    await fake.advance(2);
    game.start('survey');
    // burn straight up out of the system plane, away from everything
    const ship = debug().shipAbs();
    debug().warp(ship.x, ship.y, ship.z, ship.x, ship.y + 1e6, ship.z);
    key('keydown', 'Space');
    await fake.advance(seconds(3));
    expect(state().burning).toBe(true);
    expect(state().speed).toBeGreaterThan(2000);
    expect(state().fuel).toBeCloseTo(1 - 3 / TUNE.TANK_SECONDS, 2);

    await fake.advance(seconds(TUNE.TANK_SECONDS - 3 + 0.5));
    expect(state().fuel).toBe(0);
    expect(state().burning).toBe(false);
    expect(hud.fuelFill.style.width).toBe('0%');
    expect(hud.fuelLabel.textContent).toBe('FUEL OUT · SCAN TO REFUEL');
    // still holding the burn: the ship settles back to cruise, it is not stopped
    await fake.advance(seconds(6));
    expect(state().speed).toBeGreaterThan(90);
    expect(state().speed).toBeLessThan(120);

    // a scan refuels, and the held burn fires again
    key('keyup', 'Space');
    park(PLANET, 100);
    await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.3));
    expect(state().fuel).toBeCloseTo(TUNE.REFUEL, 5);
    expect(hud.fuelLabel.textContent).toBe('FUEL');
    const up = debug().shipAbs();
    debug().warp(up.x, up.y + 5000, up.z, up.x, up.y + 1e6, up.z);
    key('keydown', 'Space');
    await fake.advance(seconds(1));
    expect(state().burning).toBe(true);
  });
});

describe('the window closing', () => {
  /** Flies a whole window; scans PLANET first when asked to score. */
  async function flyWindow(score: boolean) {
    if (score) {
      park(PLANET, 100);
      await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.5));
    }
    // far above the system, where the rest of the window passes with nothing in range
    const ship = debug().shipAbs();
    debug().warp(ship.x, ship.y + 40000, ship.z, ship.x, ship.y + 1e6, ship.z);
    const scanned = state().scanned.length;
    // frame by frame: the tests below act on the frames right after the close
    // (bounded, so a window that never closes fails here and does not hang)
    for (let i = 0; i < 20 * (TUNE.WINDOW_SECONDS + 5) && state().phase === 'survey'; i++) {
      await fake.advance(1, 1 / 20);
    }
    expect(state().phase).toBe('closed');
    expect(state().scanned).toHaveLength(scanned);
  }

  it('ends the survey at 4:00 with the result, and keeps the bests', async () => {
    mount();
    await fake.advance(2);
    click();
    await flyWindow(true);

    expect(state().phase).toBe('closed');
    expect(state().timeLeft).toBe(0);
    expect(hud.clock.textContent).toBe('0:00');
    const value = state().score;
    expect(value).toBeGreaterThan(0);
    const [phase, result] = phases.at(-1)!;
    expect(phase).toBe('closed');
    expect(result).toEqual({
      score: value,
      contacts: 1,
      rarest: { name: poi(PLANET).name, kind: expect.stringMatching(/PLANET$/) },
      bests: { seed: value, allTime: value, newSeedBest: true, newAllTimeBest: true },
    });
    expect(storage.data.get('ephemeris.best.20261126')).toBe(String(value));
    expect(storage.data.get('ephemeris.best')).toBe(String(value));
  });

  it('nothing scans, steers or burns once the window has closed', async () => {
    mount();
    await fake.advance(2);
    click();
    await flyWindow(false);
    park(PLANET, 100);
    const heading = debug().attitude().quaternion;
    const fuel = state().fuel;
    // presses inside the retry lock, so none of this is a retry either
    key('keydown', 'Space');
    pointer(container, 'pointerdown', { x: VIEW.width, y: 0 });
    pointer(container, 'pointermove', { x: VIEW.width, y: 0 });
    await fake.advance(seconds(0.5));
    expect(state().phase).toBe('closed');
    expect(state().scanned).toEqual([]);
    expect(state().score).toBe(0);
    expect(state().burning).toBe(false);
    expect(state().fuel).toBe(fuel);
    // the nose has not moved: a pointer in the corner would have turned it 60° by now
    const now = debug().attitude().quaternion;
    for (const axis of ['x', 'y', 'z', 'w'] as const) expect(now[axis]).toBeCloseTo(heading[axis], 6);
    expect(hud.marker.style.opacity).toBe('0');
    expect(hud.scan.style.opacity).toBe('0');
  });

  it('locks input for 600 ms, then any press retries the same system', async () => {
    mount();
    await fake.advance(2);
    click();
    await flyWindow(true);
    const closedAt = phases.length;

    await fake.advance(seconds(0.3));
    click();
    key('keydown', 'Enter');
    expect(phases).toHaveLength(closedAt);
    expect(state().phase).toBe('closed');

    await fake.advance(seconds(0.4));
    click();
    expect(phases.at(-1)).toEqual(['survey', null]);
    await fake.advance(1);
    expect(state()).toMatchObject({ phase: 'survey', score: 0, fuel: 1, scanned: [] });
    expect(hud.contacts.textContent).toBe('SCORE 0');
    expect(hud.best.textContent).toMatch(/^BEST [1-9]\d*$/);
  });

  it('a second, worse window is not a new best; a better one is', async () => {
    mount();
    await fake.advance(2);
    game.start('survey');
    await flyWindow(true);
    const best = state().score;

    game.start('survey');
    await flyWindow(false);
    expect(phases.at(-1)![1]!.bests).toEqual({ seed: best, allTime: best, newSeedBest: false, newAllTimeBest: false });
    expect(storage.data.get('ephemeris.best.20261126')).toBe(String(best));

    game.start('survey');
    park(PLANET, 100);
    await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.5));
    park('home:6', 100);
    await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.5));
    await flyWindow(false);
    const better = phases.at(-1)![1]!;
    expect(better.score).toBeGreaterThan(best);
    expect(better.bests).toMatchObject({ seed: better.score, newSeedBest: true, newAllTimeBest: true });
  });

  it('keeps one best per system and one for all of them', async () => {
    storage = memoryStorage({ 'ephemeris.best': '99999', 'ephemeris.best.20261125': '99999' });
    mount();
    await fake.advance(2);
    game.start('survey');
    await flyWindow(true);
    const result = phases.at(-1)![1]!;
    // yesterday's best is not today's: this is today's first, and not an all-time
    expect(result.bests).toEqual({ seed: result.score, allTime: 99999, newSeedBest: true, newAllTimeBest: false });
    expect(storage.data.get('ephemeris.best')).toBe('99999');
    expect(storage.data.get('ephemeris.best.20261125')).toBe('99999');
    expect(storage.data.get('ephemeris.best.20261126')).toBe(String(result.score));
  });

  it('runs without storage', async () => {
    mount({ storage: null });
    await fake.advance(2);
    game.start('survey');
    await flyWindow(true);
    expect(phases.at(-1)![1]!.bests.newSeedBest).toBe(true);
  });

  it('Escape abandons a survey: back to the title, nothing scored or kept', async () => {
    mount();
    await fake.advance(2);
    click();
    park(PLANET, 100);
    await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.5));
    expect(state().score).toBeGreaterThan(0);
    key('keydown', 'Escape');
    expect(phases.at(-1)).toEqual(['title', null]);
    await fake.advance(seconds(1));
    expect(state().phase).toBe('title');
    expect(storage.data.size).toBe(0);
    expect(hud.marker.style.opacity).toBe('0');
  });
});

describe('the daily seed', () => {
  it('builds the same system for the same seed and another for the next day', async () => {
    const names = async (search: string) => {
      mount({ seed: resolveSeed(search, new Date(Date.UTC(2026, 10, 26))) });
      await fake.advance(2);
      const list = debug().pois().map((p) => `${p.id} ${p.name} ${p.radius.toFixed(2)}`);
      game.dispose();
      return list;
    };
    const today = await names('');
    expect(await names('')).toEqual(today);
    expect(await names('?seed=20261126')).toEqual(today);
    expect(await names('?seed=20261127')).not.toEqual(today);
    expect(await names('?seed=khevel')).not.toEqual(today);
  });
});

describe('FREE DRIFT', () => {
  beforeEach(async () => {
    mount();
    await fake.advance(2);
    game.start('drift');
    await fake.advance(1);
  });

  it('has no clock: it is still drifting long after a window would have closed', async () => {
    expect(phases).toEqual([['drift', null]]);
    for (let i = 0; i < 30; i++) await fake.advance(seconds(10), 1 / 20);
    expect(state().phase).toBe('drift');
    expect(phases).toEqual([['drift', null]]);
    expect(storage.data.size).toBe(0);
  });

  it('has no fuel: a burn lasts as long as it is held', async () => {
    const ship = debug().shipAbs();
    debug().warp(ship.x, ship.y, ship.z, ship.x, ship.y + 1e6, ship.z);
    key('keydown', 'Space');
    for (let i = 0; i < 9; i++) await fake.advance(seconds(10), 1 / 20);
    expect(state().burning).toBe(true);
    expect(state().speed).toBeGreaterThan(3000);
    expect(state().fuel).toBe(1);
  });

  it('logs a contact on first approach with no scan, at any speed, as it always did', async () => {
    expect(hud.contacts.textContent).toBe('0 CONTACTS LOGGED');
    const p = poi(PLANET);
    // looked up now: the jumps below move the streamed window off its sector
    const nebula = debug().pois().find((q) => q.kind === 'nebula')!;
    // one frame inside the old discovery range is enough, under a burn too
    key('keydown', 'Space');
    debug().warp(p.x, p.y + p.radius + discoveryRange(p.radius) * 0.9, p.z, p.x, p.y, p.z);
    await fake.advance(2);
    expect(hud.contacts.textContent).toBe('1 CONTACT LOGGED');
    key('keyup', 'Space');
    // just outside that range nothing more is logged
    const other = poi('home:6');
    debug().warp(other.x, other.y + other.radius + discoveryRange(other.radius) * 1.1, other.z, other.x, other.y + 1e6, other.z);
    await fake.advance(2);
    expect(hud.contacts.textContent).toBe('1 CONTACT LOGGED');

    // a formation logs from outside its edge, the range it always had
    debug().warp(nebula.x, nebula.y, nebula.z + nebula.radius + 300, nebula.x, nebula.y, nebula.z + 1e6);
    await fake.advance(2);
    expect(hud.contacts.textContent).toBe('2 CONTACTS LOGGED');
    expect(hud.ping.textContent).toBe(`NEW CONTACT · ${nebula.name}`);
    // and a contact is logged once
    debug().warp(p.x, p.y + p.radius + 100, p.z, p.x, p.y, p.z);
    await fake.advance(2);
    expect(hud.contacts.textContent).toBe('2 CONTACTS LOGGED');
  });

  it('shows none of the survey: no score, ring, marker or scan state', async () => {
    park(PLANET, 100);
    await fake.advance(seconds(3));
    expect(state()).toMatchObject({ score: 0, scanned: [], scanId: null, scanProgress: 0, marker: null });
    expect(hud.scan.style.opacity).toBe('0');
    expect(hud.marker.style.opacity).toBe('0');
    expect(hud.contacts.textContent).not.toContain('SCORE');
  });

  it('still announces the atmospheric envelope and reads out body, distance, speed and sector', async () => {
    const p = poi(PLANET);
    // outside the discovery range, inside the envelope (4 radii)
    debug().warp(p.x, p.y + p.radius * 3, p.z, p.x, p.y, p.z);
    await fake.advance(seconds(0.3));
    expect(hud.ping.textContent).toBe(`ATMOSPHERIC ENVELOPE · ${p.name}`);
    expect(hud.body.textContent).toBe(p.name);
    expect(hud.dist.textContent).toMatch(/^\d+ km/);
    expect(hud.speed.textContent).toMatch(/^\d+ km\/s$/);
    expect(hud.sector.textContent).toBe('HOME SYSTEM');
  });

  it('Escape returns to the title', async () => {
    key('keydown', 'Escape');
    expect(phases.at(-1)).toEqual(['title', null]);
  });

  it('starts at the spawn point as the page always did, however long the title was up, with the world still turning', async () => {
    game.dispose();
    document.body.replaceChildren();
    mount();
    await fake.advance(1);
    const spawn = debug().shipAbs();
    const cometAt = () => debug().pois().find((p) => p.kind === 'comet')!;
    const cometAtMount = cometAt();
    // a minute behind the title: the ship has cruised 6,000 km on
    for (let i = 0; i < 6; i++) await fake.advance(seconds(10), 1 / 20);
    expect(distanceFromSpawn(spawn)).toBeGreaterThan(5000);
    const cometBefore = cometAt();

    game.start('drift');
    // (`spawn` was read one frame after mounting: a few metres on)
    expect(distanceFromSpawn(spawn)).toBeLessThan(1);
    await fake.advance(1);
    expect(state().speed).toBeLessThan(10);
    expect(debug().attitude().levelUp).toEqual({ x: 0, y: 1, z: 0 });
    // the world's clock was not turned back: the comet is where the minute took it
    const comet = cometAt();
    const moved = (a: typeof comet, b: typeof comet) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(moved(comet, cometBefore)).toBeLessThan(50);
    expect(moved(comet, cometAtMount)).toBeGreaterThan(5000);
  });
});

describe('scripted play', () => {
  it('a pilot using only the mouse and the burn key scans contacts and scores', async () => {
    mount();
    await fake.advance(2);
    click();
    const pilot = createPilot(debug(), pilotControls(container), { burnBeyond: 500 });
    for (let i = 0; i < seconds(45); i++) {
      pilot.step();
      await fake.advance(1);
    }
    expect(state().scanned.length).toBeGreaterThanOrEqual(3);
    expect(state().score).toBeGreaterThanOrEqual(300);
    expect(state().fuel).toBeLessThan(1);
    expect(state().timeLeft).toBeCloseTo(TUNE.WINDOW_SECONDS - 45, 0);
  });
});

describe('lifecycle', () => {
  it('removes every listener it added', async () => {
    const targets: Array<[string, EventTarget]> = [['window', window], ['document', document]];
    const live = new Map<string, number>();
    const track = (name: string, target: EventTarget) => {
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      vi.spyOn(target, 'addEventListener').mockImplementation((type, ...rest) => {
        live.set(`${name}:${type}`, (live.get(`${name}:${type}`) ?? 0) + 1);
        add(type, ...(rest as [EventListener]));
      });
      vi.spyOn(target, 'removeEventListener').mockImplementation((type, ...rest) => {
        live.set(`${name}:${type}`, (live.get(`${name}:${type}`) ?? 0) - 1);
        remove(type, ...(rest as [EventListener]));
      });
    };
    for (const [name, target] of targets) track(name, target);
    container = createHost();
    track('container', container);
    hud = createHud();
    phases = [];
    game = createEphemeris(container, hud, { seed: SEED, storage });
    await fake.advance(2);
    game.start('survey');
    await fake.advance(seconds(0.5));

    const added = [...live].filter(([, count]) => count > 0).map(([name]) => name);
    // the input a held burn or stick must be released by
    expect(added).toEqual(expect.arrayContaining([
      'window:keydown', 'window:keyup', 'window:blur', 'window:pointerup', 'window:pointercancel',
      'window:touchcancel', 'document:visibilitychange', 'container:pointerdown', 'container:pointermove',
      'window:contextmenu', 'window:pointermove',
    ]));
    game.dispose();
    expect([...live].filter(([, count]) => count !== 0)).toEqual([]);
  });

  it('after dispose nothing runs and no input reaches the sim', async () => {
    mount();
    const sharedDispose = vi.spyOn(ICO_LOW, 'dispose');
    await fake.advance(2);
    click();
    key('keydown', 'Space');
    await fake.advance(seconds(1));
    game.dispose();

    expect(fake.running()).toBe(false);
    expect((window as unknown as { __EPHEMERIS?: unknown }).__EPHEMERIS).toBeUndefined();
    expect(container.querySelector('canvas')).toBeNull();
    expect(sharedDispose).not.toHaveBeenCalled();
    const seen = phases.length;
    click();
    key('keydown', 'Enter');
    key('keydown', 'Escape');
    pointer(container, 'pointerdown', { x: 10, y: 10, id: 3, pointerType: 'touch' });
    game.start('survey');
    game.menu();
    game.dispose();
    expect(phases).toHaveLength(seen);
  });

  it('held input is dropped when the phase changes', async () => {
    mount();
    await fake.advance(2);
    click();
    key('keydown', 'Space');
    pointer(container, 'pointerdown', { x: 10, y: 10 });
    await fake.advance(seconds(0.5));
    expect(state().burning).toBe(true);
    game.menu();
    game.start('survey');
    await fake.advance(seconds(0.5));
    // nothing was pressed again: the new run does not inherit the old hold
    expect(state().burning).toBe(false);
    expect(state().fuel).toBe(1);
  });
});

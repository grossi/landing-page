// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEphemeris,
  type EphemerisGame,
  type EphemerisHudElements,
  type EphemerisPhase,
  type SurveyResult,
} from 'components/ephemeris/createEphemeris';
import { CHARTED_KEY, discoveryRange, FINDS, logKeyFor, resolveSeed, TUNE, type FindId } from 'components/ephemeris/survey';
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

const SEED = resolveSeed('?seed=20261127', new Date(Date.UTC(2026, 10, 27)));
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
const find = (id: FindId) => debug().finds().find((f) => f.id === id)!;
const poi = (name: string) => debug().pois().find((p) => p.name === name)!;
const distanceTo = (p: { x: number; y: number; z: number }) => {
  const ship = debug().shipAbs();
  return Math.hypot(ship.x - p.x, ship.y - p.y, ship.z - p.z);
};
/** Puts the ship at rest `offset` km above a find, looking at it. */
function park(id: FindId, offset = 200) {
  const f = find(id);
  debug().warp(f.x, f.y + offset, f.z, f.x, f.y, f.z);
}
/** Puts the ship far above everything, looking up: nothing ahead. */
function away() {
  const ship = debug().shipAbs();
  debug().warp(ship.x, ship.y + 60000, ship.z, ship.x, ship.y + 1e7, ship.z);
}
const click = () => {
  pointer(container, 'pointerdown', { x: VIEW.width / 2, y: VIEW.height / 2 });
  pointer(window, 'pointerup');
};
/** Steps to `at` seconds into the loop, in 50 ms frames. */
async function until(at: number) {
  while (TUNE.WINDOW_SECONDS - state().timeLeft < at - 1e-6 && state().phase === 'survey') {
    await fake.advance(1, Math.min(0.05, at - (TUNE.WINDOW_SECONDS - state().timeLeft)));
  }
}
const savedLog = () => JSON.parse(storage.data.get(logKeyFor(SEED.label)) ?? 'null');

describe('title', () => {
  it('opens on the title with the world moving, the relay ahead, and nothing counting', async () => {
    mount();
    await fake.advance(1);
    const start = debug().shipAbs();
    await fake.advance(seconds(3));
    expect(state().phase).toBe('title');
    expect(distanceTo(start)).toBeGreaterThan(150);
    expect(state().timeLeft).toBe(TUNE.WINDOW_SECONDS);
    expect(phases).toEqual([]);
    expect(storage.data.size).toBe(0);
  });

  it.each([
    ['a click', () => click()],
    ['a tap', () => pointer(container, 'pointerdown', { x: 100, y: 600, id: 4, pointerType: 'touch' })],
    ['a key', () => key('keydown', 'Enter')],
  ])('%s starts loop 1', async (_name, press) => {
    mount();
    await fake.advance(2);
    press();
    expect(phases).toEqual([['survey', null]]);
    await fake.advance(seconds(1.5));
    expect(state()).toMatchObject({ phase: 'survey', loop: 1, logged: [] });
    expect(hud.clock.textContent).toBe('3:59');
    expect(hud.contacts.textContent).toBe('LOG 0/5');
    expect(hud.loop.textContent).toBe('LOOP 1');
    expect(savedLog()).toEqual({ logged: [], loops: 1, best: 0 });
  });

  it('the press that starts a loop is not also a burn, and a held key does not become one', async () => {
    mount();
    await fake.advance(2);
    key('keydown', 'Space');
    for (let i = 0; i < 30; i++) {
      key('keydown', 'Space', { repeat: true });
      await fake.advance(2);
    }
    expect(state().burning).toBe(false);
    key('keyup', 'Space');
    key('keydown', 'Space');
    await fake.advance(seconds(0.5));
    expect(state().burning).toBe(true);
  });
});

describe('the first seconds', () => {
  beforeEach(async () => {
    mount();
    await fake.advance(2);
    click();
    await fake.advance(seconds(0.5));
  });

  it('start pointing at the relay: its signal is full, a few thousand km ahead, and the reticle locks on it', async () => {
    expect(state().signal).toMatchObject({ id: 'relay' });
    expect(state().signal!.strength).toBeGreaterThan(0.95);
    expect(state().signal!.dist).toBeGreaterThan(2000);
    expect(state().signal!.dist).toBeLessThan(6000);
    await fake.advance(seconds(0.2));
    expect(hud.scanLabel.textContent).toMatch(/^RELAY ▮+▯* \d+ km$/);
    expect(hud.scan.style.opacity).toBe('1');
    expect(state().locked).toBe(true);
  });

  it('a burn toward it, then off the burn, logs it within 20 seconds', async () => {
    key('keydown', 'Space');
    while (state().signal!.dist - FINDS.relay.range > 3200) await fake.advance(1);
    key('keyup', 'Space');
    await fake.advance(seconds(1));
    expect(hud.scanLabel.textContent).toContain('RELAY');
    for (let i = 0; i < seconds(18) && state().logged.length === 0; i++) await fake.advance(1);
    expect(state().logged).toEqual(['relay']);
    expect(TUNE.WINDOW_SECONDS - state().timeLeft).toBeLessThan(20);
    expect(hud.ping.textContent).toBe('RELAY LOGGED · SOMETHING RIDES THE COMET');
    expect(hud.contacts.textContent).toBe('LOG 1/5');
  });
});

describe('logging', () => {
  beforeEach(async () => {
    mount();
    await fake.advance(2);
    game.start('survey');
    await fake.advance(1);
  });

  it('fills over the scan time in range, then keeps the find in the day\'s log at once', async () => {
    park('relay');
    await fake.advance(seconds(TUNE.SCAN_SECONDS - 0.3));
    expect(state().scanId).toBe('relay');
    expect(state().logged).toEqual([]);
    expect(hud.scanLabel.textContent).toBe('LOGGING · RELAY');
    await fake.advance(seconds(0.6));
    expect(state().logged).toEqual(['relay']);
    expect(savedLog()).toEqual({ logged: ['relay'], loops: 1, best: 0 });
  });

  it('does not fill too fast, and says to come off the burn', async () => {
    const f = find('relay');
    debug().warp(f.x, f.y, f.z + 3000, f.x, f.y, f.z);
    key('keydown', 'Space');
    while (distanceTo(f) > 500) await fake.advance(1);
    await fake.advance(2);
    expect(state().speed).toBeGreaterThan(TUNE.SCAN_MAX_SPEED);
    expect(state().scanId).toBe('relay');
    expect(state().tooFast).toBe(true);
    await fake.advance(seconds(0.2));
    expect(hud.scanLabel.textContent).toBe('TOO FAST · COME OFF THE BURN');
    expect(state().logged).toEqual([]);
  });

  it('out of range nothing fills', async () => {
    park('relay', FINDS.relay.range + 400);
    away();
    await fake.advance(seconds(3));
    expect(state().scanId).toBeNull();
    expect(state().logged).toEqual([]);
  });

  it('the passenger rides the comet, and is logged by keeping pace with it', async () => {
    const comet = poi('THE COMET');
    const passenger = find('passenger');
    expect(Math.hypot(passenger.x - comet.x, passenger.y - comet.y, passenger.z - comet.z)).toBeLessThan(120);
    // in range, at rest: the comet runs away faster than any scan allows
    park('passenger', 600);
    await fake.advance(seconds(0.5));
    expect(state().scanId).toBe('passenger');
    expect(state().bodySpeed).toBeGreaterThan(150);
    expect(state().tooFast).toBe(true);
    await fake.advance(seconds(0.2));
    expect(hud.scanLabel.textContent).toBe('TOO SLOW · BURN TO KEEP PACE');
  });

  it('measures the passenger\'s speed the same on uneven frames', async () => {
    park('passenger', 300);
    await fake.advance(2);
    const speeds: number[] = [];
    for (let i = 0; i < 16 && state().scanId === 'passenger'; i++) {
      await fake.advance(1, i % 2 ? 1 / 30 : 1 / 60);
      speeds.push(state().bodySpeed);
    }
    expect(speeds.length).toBeGreaterThan(8);
    expect(Math.min(...speeds)).toBeGreaterThan(150);
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeLessThan(1.05);
  });
});

describe('signals and the log', () => {
  beforeEach(async () => {
    mount();
    await fake.advance(2);
    game.start('survey');
    await fake.advance(1);
  });

  it('a far find no note told of is silent; once told of, it is heard from anywhere', async () => {
    const wreck = find('wreck');
    expect(distanceTo(wreck)).toBeGreaterThan(TUNE.HEAR_RANGE);
    // pointed straight at the wreck, which nothing has told of: silence from it
    const ship = debug().shipAbs();
    debug().warp(ship.x, ship.y, ship.z, wreck.x, wreck.y, wreck.z);
    await fake.advance(seconds(0.2));
    expect(state().signal?.id).not.toBe('wreck');
    // log the relay, then the passenger, whose note tells of the wreck
    storage.data.set(logKeyFor(SEED.label), JSON.stringify({ logged: ['relay', 'passenger'], loops: 1, best: 0 }));
    game.start('survey');
    await fake.advance(1);
    const now = debug().shipAbs();
    debug().warp(now.x, now.y, now.z, wreck.x, wreck.y, wreck.z);
    await fake.advance(seconds(0.2));
    expect(state().signal).toMatchObject({ id: 'wreck' });
    expect(state().signal!.strength).toBeGreaterThan(0.4);
  });

  it('pointing matters: turned away, the reticle says to search', async () => {
    away();
    await fake.advance(seconds(0.3));
    expect(state().signal).toBeNull();
    expect(hud.scanLabel.textContent).toBe('NO SIGNAL AHEAD · TURN TO SEARCH');
    expect(hud.scanTick.style.opacity).toBe('0');
  });

  it('the tick on the reticle points the way the signal is', async () => {
    const relay = find('relay');
    const ship = debug().shipAbs();
    // the relay 30° to the right of the nose
    const toRelay = new THREE.Vector3(relay.x - ship.x, relay.y - ship.y, relay.z - ship.z).normalize();
    const look = toRelay.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6);
    debug().warp(ship.x, ship.y, ship.z, ship.x + look.x * 1000, ship.y + look.y * 1000, ship.z + look.z * 1000);
    await fake.advance(seconds(0.3));
    const signal = state().signal!;
    expect(signal.strength).toBeGreaterThan(0);
    // the tick's angle is the strongest signal's direction on the screen
    const target = find(signal.id);
    const here = debug().shipAbs();
    const q = debug().attitude().quaternion;
    const local = new THREE.Vector3(target.x - here.x, target.y - here.y, target.z - here.z)
      .applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w).invert());
    const expected = Math.atan2(local.y, local.x);
    const diff = Math.atan2(Math.sin(signal.angle - expected), Math.cos(signal.angle - expected));
    expect(Math.abs(diff)).toBeLessThan(0.05);
    expect(Number(hud.scanTick.style.opacity)).toBeGreaterThan(0.25);
    expect(hud.scanTick.style.transform).toBe(`rotate(${(-signal.angle).toFixed(3)}rad)`);
  });

  it('the bell answers only in its window, and cannot be logged outside that', async () => {
    park('bell');
    await fake.advance(seconds(3));
    expect(state().scanId).toBeNull();
    const opens = find('bell').opensAt;
    expect(game.schedule.bell[0]).toBe(opens);
    await until(opens - 0.5);
    park('bell');
    await until(opens + 0.2);
    expect(hud.ping.textContent).toBe('SOMETHING FAR OFF IS ANSWERING');
    await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.3));
    expect(state().logged).toEqual(['bell']);
    expect(hud.ping.textContent).toContain('BELL LOGGED');
  });

  it('a bell told of is announced as the bell', async () => {
    storage.data.set(logKeyFor(SEED.label), JSON.stringify({ logged: ['light'], loops: 1, best: 0 }));
    game.start('survey');
    await until(find('bell').opensAt + 0.2);
    expect(hud.ping.textContent).toBe('THE BELL IS ANSWERING');
    // and is heard from wherever the ship is
    const bell = find('bell');
    const ship = debug().shipAbs();
    debug().warp(ship.x, ship.y, ship.z, bell.x, bell.y, bell.z);
    await fake.advance(seconds(0.2));
    expect(state().signal?.id).toBe('bell');
  });
});

describe('the dark', () => {
  it('comes in from 3:00: fog thickens, the stars go, the late light shows, and at 4:00 the loop ends', async () => {
    mount();
    await fake.advance(2);
    game.start('survey');
    const fog = fake.stage.scene.fog as THREE.FogExp2;
    const before = fog.density;
    away();
    await until(170);
    expect(state().dark).toBe(0);
    expect(find('light').open).toBe(false);
    await until(181);
    expect(hud.ping.textContent).toBe('THE DARK IS COMING IN');
    await until(215);
    expect(state().dark).toBeGreaterThan(0.4);
    expect(fog.density).toBeGreaterThan(before * 2);
    expect(Number(hud.dark.style.getPropertyValue('--dark'))).toBeGreaterThan(0.4);
    expect(find('light').open).toBe(true);
    await until(240);
    await fake.advance(2);
    expect(state().phase).toBe('closed');
    expect(phases.at(-1)).toEqual(['closed', { loop: 1, loggedNow: [], logged: [], charted: null }]);
    expect(hud.dark.style.getPropertyValue('--dark')).toBe('1.000');
  });

  it('the late light can be logged in the dark, and only then', async () => {
    mount();
    await fake.advance(2);
    game.start('survey');
    park('light');
    await fake.advance(seconds(3));
    expect(state().logged).toEqual([]);
    away();
    await until(180.5);
    park('light');
    await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.3));
    expect(state().logged).toEqual(['light']);
  });
});

describe('loops', () => {
  it('the next loop starts from the same place with the world as it was, and the log carried over', async () => {
    mount();
    await fake.advance(2);
    game.start('survey');
    await fake.advance(1);
    const first = { ship: debug().shipAbs(), finds: debug().finds(), comet: poi('THE COMET') };
    park('relay');
    await fake.advance(seconds(2));
    expect(state().logged).toEqual(['relay']);
    away();
    await until(240);
    await fake.advance(seconds(0.3));
    // the end screen's lock swallows presses
    click();
    expect(state().phase).toBe('closed');
    await fake.advance(seconds(0.5));
    click();
    await fake.advance(1);
    expect(state()).toMatchObject({ phase: 'survey', loop: 2, logged: ['relay'], loggedNow: [] });
    expect(hud.contacts.textContent).toBe('LOG 1/5');
    expect(hud.loop.textContent).toBe('LOOP 2');
    expect(distanceTo(first.ship)).toBeLessThan(1);
    const comet = poi('THE COMET');
    expect(Math.hypot(comet.x - first.comet.x, comet.y - first.comet.y, comet.z - first.comet.z)).toBeLessThan(1);
    for (const f of first.finds) {
      const now = find(f.id);
      expect(Math.hypot(now.x - f.x, now.y - f.y, now.z - f.z), f.id).toBeLessThan(1);
    }
    expect(savedLog()).toEqual({ logged: ['relay'], loops: 2, best: 0 });
  });

  it('a log from an earlier visit is picked up on a new mount', async () => {
    storage.data.set(logKeyFor(SEED.label), JSON.stringify({ logged: ['relay', 'passenger'], loops: 3, best: 0 }));
    mount();
    await fake.advance(2);
    game.start('survey');
    await fake.advance(1);
    expect(state()).toMatchObject({ loop: 4, logged: ['relay', 'passenger'] });
    expect(hud.contacts.textContent).toBe('LOG 2/5');
  });

  it('logging the fifth charts the system: the loop ends with the loops it took, a best, and a day charted', async () => {
    storage.data.set(logKeyFor(SEED.label), JSON.stringify({ logged: ['relay', 'passenger', 'wreck', 'bell'], loops: 1, best: 0 }));
    mount();
    await fake.advance(2);
    game.start('survey');
    away();
    await until(180.5);
    park('light');
    await fake.advance(seconds(TUNE.SCAN_SECONDS + 0.3));
    expect(state().phase).toBe('closed');
    expect(phases.at(-1)).toEqual([
      'closed',
      { loop: 2, loggedNow: ['light'], logged: ['relay', 'wreck', 'bell', 'passenger', 'light'], charted: { loops: 2, best: 2, newBest: true, charted: 1 } },
    ]);
    expect(storage.data.get(CHARTED_KEY)).toBe('1');
    // the end screen of a charted system is lit
    expect(hud.dark.style.getPropertyValue('--dark')).toBe('0.000');
    // the next loop charts it again from an empty log; the best stays
    await fake.advance(seconds(1));
    click();
    await fake.advance(1);
    expect(state()).toMatchObject({ loop: 1, logged: [] });
    expect(savedLog()).toEqual({ logged: [], loops: 1, best: 2 });
  });

  it('a forgotten log starts the next loop as loop 1 with nothing logged', async () => {
    storage.data.set(logKeyFor(SEED.label), JSON.stringify({ logged: ['relay', 'passenger'], loops: 3, best: 2 }));
    mount();
    await fake.advance(2);
    const { forgetLog } = await import('components/ephemeris/survey');
    forgetLog(storage, SEED.label);
    game.start('survey');
    await fake.advance(1);
    expect(state()).toMatchObject({ loop: 1, logged: [] });
    expect(hud.contacts.textContent).toBe('LOG 0/5');
    expect(savedLog()).toEqual({ logged: [], loops: 1, best: 2 });
  });

  it('Escape abandons a loop: back to the title; finds it logged stay logged', async () => {
    mount();
    await fake.advance(2);
    click();
    park('relay');
    await fake.advance(seconds(2));
    key('keydown', 'Escape');
    expect(phases.at(-1)).toEqual(['title', null]);
    expect(savedLog().logged).toEqual(['relay']);
    expect(hud.scan.style.opacity).toBe('0');
  });

  it('with storage blocked, the log still survives the loop and charting still charts', async () => {
    const { withMemory } = await import('components/ephemeris/survey');
    const blocked = withMemory({
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    });
    for (const store of [null, blocked]) {
      mount({ storage: store });
      await fake.advance(2);
      game.start('survey');
      for (const id of ['relay', 'wreck'] as const) {
        park(id);
        await fake.advance(seconds(2));
      }
      // the passenger has to be matched in speed: let the pilot fly it
      const pilot = createPilot(debug(), pilotControls(container), { mode: 'knows' });
      for (let i = 0; i < 60 * 30 && !state().logged.includes('passenger'); i++) {
        pilot.step();
        await fake.advance(1, 1 / 30);
      }
      key('keyup', 'Space');
      expect(state().logged).toEqual(['relay', 'wreck', 'passenger']);
      game.start('survey');
      await fake.advance(1);
      expect(state()).toMatchObject({ loop: 2, logged: ['relay', 'wreck', 'passenger'] });
      await until(find('bell').opensAt + 0.1);
      park('bell');
      await fake.advance(seconds(2));
      away();
      await until(180.5);
      park('light');
      await fake.advance(seconds(2));
      expect(phases.at(-1)![0]).toBe('closed');
      expect(phases.at(-1)![1]!.charted).toMatchObject({ loops: 2, newBest: true });
      game.dispose();
      document.body.replaceChildren();
    }
  });

  it('the same seed places the same finds, another day other ones', async () => {
    const at = async (search: string) => {
      mount({ seed: resolveSeed(search, new Date(Date.UTC(2026, 10, 27))) });
      await fake.advance(1);
      const list = debug().finds().filter((f) => f.id !== 'passenger').map((f) => `${f.id} ${Math.round(f.x)} ${Math.round(f.y)} ${Math.round(f.z)}`);
      const places = game.places;
      game.dispose();
      return { list, places };
    };
    const today = await at('');
    expect(await at('')).toEqual(today);
    expect(await at('?seed=20261128')).not.toEqual(today);
    expect(today.places.wreck).not.toBe(today.places.bell);
  });

  it('the wreck and the bell are beyond the home system, on different sides; the relay is close', async () => {
    mount();
    await fake.advance(1);
    const sun = poi('THE SUN');
    const r = (id: FindId) => Math.hypot(find(id).x - sun.x, find(id).z - sun.z);
    // past hearing from the sun until a note tells of them
    expect(r('wreck')).toBeGreaterThan(TUNE.HEAR_RANGE + 5000);
    expect(r('bell')).toBeGreaterThan(TUNE.HEAR_RANGE + 5000);
    const angle = (id: FindId) => Math.atan2(find(id).z - sun.z, find(id).x - sun.x);
    const apart = Math.abs(angle('wreck') - angle('bell'));
    expect(Math.min(apart, 2 * Math.PI - apart)).toBeGreaterThan((2 * Math.PI) / 3 - 0.5);
    game.start('survey');
    await fake.advance(1);
    expect(distanceTo(find('relay'))).toBeLessThan(5500);
  });

  it('where and when come from the seed: the bell\'s window, the comet\'s place, the relay', async () => {
    const day = async (search: string) => {
      mount({ seed: resolveSeed(search, new Date(Date.UTC(2026, 10, 27))) });
      await fake.advance(1);
      game.start('survey');
      await fake.advance(1);
      const comet = poi('THE COMET');
      const out = { bell: game.schedule.bell, comet: [comet.x, comet.z].map(Math.round), relay: Math.round(distanceTo(find('relay'))) };
      game.dispose();
      document.body.replaceChildren();
      return out;
    };
    const days = [];
    for (const search of ['?seed=a', '?seed=b', '?seed=c', '?seed=d']) days.push(await day(search));
    expect(new Set(days.map((d) => d.bell[0])).size).toBeGreaterThan(1);
    expect(new Set(days.map((d) => d.comet.join())).size).toBe(4);
    expect(new Set(days.map((d) => d.relay)).size).toBeGreaterThan(1);
    expect(await day('?seed=a')).toEqual(days[0]);
  });
});

describe('FREE DRIFT', () => {
  beforeEach(async () => {
    mount();
    await fake.advance(2);
    game.start('drift');
    await fake.advance(1);
  });

  it('has no clock and no dark: still drifting long after a loop would have ended', async () => {
    expect(phases).toEqual([['drift', null]]);
    for (let i = 0; i < 30; i++) await fake.advance(seconds(10), 1 / 20);
    expect(state().phase).toBe('drift');
    expect(phases).toEqual([['drift', null]]);
    expect((fake.stage.scene.fog as THREE.FogExp2).density).toBeCloseTo(0.000055, 9);
    expect(storage.data.size).toBe(0);
  });

  it('a burn lasts as long as it is held', async () => {
    away();
    key('keydown', 'Space');
    for (let i = 0; i < 9; i++) await fake.advance(seconds(10), 1 / 20);
    expect(state().burning).toBe(true);
    expect(state().speed).toBeGreaterThan(3000);
  });

  it('logs a contact on first approach with no scan, as it always did', async () => {
    expect(hud.contacts.textContent).toBe('0 CONTACTS LOGGED');
    const planet = debug().pois().find((p) => p.id === 'home:7')!;
    debug().warp(planet.x, planet.y + planet.radius + discoveryRange(planet.radius) * 0.9, planet.z, planet.x, planet.y, planet.z);
    await fake.advance(2);
    expect(hud.contacts.textContent).toBe('1 CONTACT LOGGED');
  });

  it('shows none of the loop: no finds, signal, reticle or log', async () => {
    park('relay', 100);
    await fake.advance(seconds(3));
    expect(state()).toMatchObject({ logged: [], scanId: null, signal: null });
    expect(hud.scan.style.opacity).toBe('0');
    expect(hud.contacts.textContent).not.toMatch(/^LOG \d/);
    expect(storage.data.size).toBe(0);
  });

  it('starts at the spawn point however long the title was up, and Escape returns to the title', async () => {
    game.dispose();
    document.body.replaceChildren();
    mount();
    await fake.advance(1);
    const spawn = debug().shipAbs();
    for (let i = 0; i < 6; i++) await fake.advance(seconds(10), 1 / 20);
    expect(distanceTo(spawn)).toBeGreaterThan(5000);
    game.start('drift');
    expect(distanceTo(spawn)).toBeLessThan(1);
    key('keydown', 'Escape');
    expect(phases.at(-1)).toEqual(['title', null]);
  });
});

describe('scripted play', () => {
  it('a pilot following only what the reticle shows logs three or more finds in its first loop', async () => {
    mount();
    await fake.advance(2);
    click();
    const pilot = createPilot(debug(), pilotControls(container), { mode: 'listens' });
    let frames = 0;
    while (state().phase === 'survey') {
      pilot.step();
      await fake.advance(1, 1 / 30);
      if (++frames % 900 === 0) await new Promise((resolve) => setTimeout(resolve));
    }
    expect(state().logged.length).toBeGreaterThanOrEqual(3);
    expect(state().logged).not.toContain('bell');
  }, 60000);
});

describe('lifecycle', () => {
  it('removes every listener it added', async () => {
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
    track('window', window);
    track('document', document);
    container = createHost();
    track('container', container);
    hud = createHud();
    phases = [];
    game = createEphemeris(container, hud, { seed: SEED, storage });
    await fake.advance(2);
    game.start('survey');
    await fake.advance(seconds(0.5));
    const added = [...live].filter(([, count]) => count > 0).map(([name]) => name);
    expect(added).toEqual(expect.arrayContaining([
      'window:keydown', 'window:keyup', 'window:blur', 'window:pointerup', 'window:pointercancel',
      'window:touchcancel', 'document:visibilitychange', 'container:pointerdown', 'container:pointermove',
      'window:contextmenu', 'window:pointermove',
    ]));
    game.dispose();
    expect([...live].filter(([, count]) => count !== 0)).toEqual([]);
  });

  it('after dispose nothing runs, shared assets survive, and no input reaches the sim', async () => {
    mount();
    const sharedDispose = vi.spyOn(ICO_LOW, 'dispose');
    await fake.advance(2);
    click();
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
    game.start('survey');
    game.menu();
    game.dispose();
    expect(phases).toHaveLength(seen);
  });

  it('frees the two materials the finds own', async () => {
    mount();
    await fake.advance(2);
    const disposed = vi.spyOn(THREE.Material.prototype, 'dispose');
    game.dispose();
    // the bell's and the light's own materials go with the mount's tracked resources
    expect(disposed.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

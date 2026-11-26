import { describe, expect, it } from 'vitest';
import * as THREE from '../../public/arcade/vendor/three.module.min.js';
import { createShipBody } from '../../public/arcade/shared/ship.js';
import { mulberry32 } from '../../public/arcade/meridian/world.js';
import { BELT, ROCK_RADII, createBelt, growBelt, nearBelt, sweepBelt } from '../../public/arcade/murmur/belt.js';
import { FLOCK, WAKE, WILD, createFlock, resetFlock, stepFlock, wakeWidth } from '../../public/arcade/murmur/flock.js';
import {
  BEST_KEY, MENU_CLEAR, TUNE, clockBonus, createGame, fleeForce, fleeRadius, gateDistance, payout,
  reefRadius, reefShare, wildSpeed,
} from '../../public/arcade/murmur/game.js';
import { markerSpot } from '../../public/arcade/murmur/marker.js';
import { createView } from '../../public/arcade/murmur/view.js';
import { createBot } from './murmurBot.js';

type Game = ReturnType<typeof createGame>;
const CENTRE = { x: 0, y: 0 };
const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
  };
};
/** A run that has just begun, after a moment of the title screen. */
function running(seed = 1, storage: ReturnType<typeof memory> | null = null) {
  const game = createGame({ random: mulberry32(seed), storage });
  for (let i = 0; i < 30; i++) game.step(1 / 60, CENTRE);
  game.press();
  return game;
}
/** No belt at all: one rule at a time. */
const noRocks = (game: Game) => { game.belt.count = 0; return game; };
const fly = (game: Game, seconds: number, stick = CENTRE, boost = false, dt = 1 / 60) => {
  for (let t = 0; t < seconds - 1e-9 && game.state === 'play'; t += dt) game.step(dt, stick, boost);
};
/** Put the first `birds` birds in the wake, where the ship is. */
function giveWake(game: Game, birds: number) {
  const { flock, ship } = game;
  for (let i = 0; i < birds; i++) {
    flock.state[i] = WAKE;
    flock.pos.set([ship.x, ship.y, ship.z], i * 3);
  }
  flock.wake = birds; flock.wild = flock.count - birds;
}
/** The level unit vector to the ship's right. */
function rightOf(game: Game) {
  const { ship } = game, flat = Math.hypot(ship.fx, ship.fz);
  return { x: -ship.fz / flat, z: ship.fx / flat };
}
/** Stand the gate across the ship's nose, `ahead` in front and `off` to the side of its line. */
function gateAhead(game: Game, ahead = 0.5, off = 0) {
  const { ship, gate } = game, side = rightOf(game);
  gate.nx = ship.fx; gate.ny = ship.fy; gate.nz = ship.fz;
  gate.x = ship.x + ship.fx * ahead + side.x * off; gate.y = ship.y + ship.fy * ahead; gate.z = ship.z + ship.fz * ahead + side.z * off;
}
/** One rock, the only one, at a point. */
function oneRock(game: Game, x: number, y: number, z: number, radius = ROCK_RADII[1]) {
  const { belt } = game;
  belt.count = 1;
  belt.x[0] = x; belt.y[0] = y; belt.z[0] = z; belt.r[0] = belt.full[0] = radius; belt.grow[0] = 1;
  // It belongs to the current reef, so it is never moved.
  belt.line[0] = game.gate.id;
}
const distance = (a: { x: number, y: number, z: number }, b: { x: number, y: number, z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** The gap between the ship's hull and the nearest rock. */
function clearance(game: Game) {
  const { belt, ship } = game;
  let least = Infinity;
  for (let i = 0; i < belt.count; i++) {
    least = Math.min(least, Math.hypot(belt.x[i] - ship.x, belt.y[i] - ship.y, belt.z[i] - ship.z) - belt.r[i] - TUNE.HULL);
  }
  return least;
}

describe('a run from start to game over to retry', () => {
  it('flies itself through the flock on the title screen: nothing caught, nothing hit, never over', () => {
    const game = createGame({ random: mulberry32(4) });
    let least = Infinity, nearest = Infinity;
    for (let i = 0; i < 60 * 180; i++) {
      game.step(1 / 60, { x: 1, y: 1 }, true);
      least = Math.min(least, clearance(game));
      nearest = Math.min(nearest, distance(game.ship, game.flock.centre));
    }
    expect(game).toMatchObject({ state: 'menu', score: 0, clock: TUNE.CLOCK });
    expect(game.flock.wake).toBe(0);
    expect(least).toBeGreaterThan(20);
    expect(nearest).toBeLessThan(15); // it does dive through the birds
    expect(MENU_CLEAR).toBeGreaterThan(40 + 48 + 20);
  });

  it('starts on a press 120 out from the flock and facing it, ends on a rock, locks, then retries afresh', () => {
    const game = createGame({ random: mulberry32(5) });
    for (let i = 0; i < 90; i++) game.step(1 / 60, CENTRE);
    expect(game.press()).toBe(true);
    const { ship, flock } = game;
    expect(game).toMatchObject({ state: 'play', score: 0, clock: TUNE.CLOCK, banks: 0, runs: 1 });
    expect(distance(ship, flock.centre)).toBeCloseTo(TUNE.START, 3);
    // Facing it: the nose points at the flock's centre.
    const to = { x: flock.centre.x - ship.x, y: flock.centre.y - ship.y, z: flock.centre.z - ship.z };
    expect((to.x * ship.fx + to.y * ship.fy + to.z * ship.fz) / TUNE.START).toBeGreaterThan(0.999);
    expect(Math.hypot(ship.vx, ship.vy, ship.vz)).toBeCloseTo(TUNE.CRUISE, 3);
    expect(game.press()).toBe(false); // a press mid-run is not a restart

    fly(game, 0.5);
    giveWake(game, 30);
    oneRock(game, ship.x + ship.fx * 6, ship.y + ship.fy * 6, ship.z + ship.fz * 6);
    fly(game, 0.5);
    expect(game).toMatchObject({ state: 'over', cause: 'WRECKED', score: 0 });
    expect(flock.wake).toBe(0); // the wake scatters
    expect(flock.wild).toBe(flock.count);
    const frozen = { clock: game.clock, score: game.score };
    game.step(1 / 60, CENTRE, true);
    expect({ clock: game.clock, score: game.score }).toEqual(frozen);

    game.step(TUNE.LOCK / 2, CENTRE);
    expect(game.press()).toBe(false);
    expect(game.state).toBe('over');
    game.step(TUNE.LOCK / 2 + 0.01, CENTRE);
    game.belt.count = BELT.ROCKS; // the test's single rock is over with
    expect(game.press()).toBe(true);
    expect(game).toMatchObject({
      state: 'play', score: 0, clock: TUNE.CLOCK, banks: 0, biggest: 0, lost: 0, runTime: 0, cause: '', runs: 2,
    });
    // A new belt, with the way to the flock open.
    expect(game.belt.r.every((r: number, i: number) => r === game.belt.full[i])).toBe(true);
    expect(clearance(game)).toBeGreaterThan(20);
    expect(flock.wild).toBe(TUNE.BIRDS);
    expect(distance(ship, flock.centre)).toBeCloseTo(TUNE.START, 3);
  });

  it('opens fairly: flying straight, the first birds are caught within 3 s and nothing is hit for 4', () => {
    let gathered = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const game = createGame({ random: mulberry32(seed) });
      for (let i = 0; i < 5 + (seed % 7) * 40; i++) game.step(1 / 60, CENTRE); // any moment of the title
      game.press();
      // The flock is whole again, however the title's flight had scattered it.
      expect(game.flock.wild).toBe(TUNE.BIRDS);
      fly(game, 3);
      expect(game.flock.wake, `seed ${seed}`).toBeGreaterThan(0);
      fly(game, 1);
      expect(game.state, `seed ${seed}`).toBe('play');
      gathered += game.flock.wake;
    }
    // A first dive with no steering at all is worth having: about 30 birds.
    expect(gathered / 60).toBeGreaterThan(20);
  });

  it('runs out of time at 45 s with the unbanked wake lost', () => {
    const game = noRocks(running(2));
    fly(game, 20, { x: 1, y: 0 }); // circling, far from any gate
    giveWake(game, 80);
    fly(game, 60, { x: 1, y: 0 });
    expect(game).toMatchObject({ state: 'over', cause: 'OUT OF TIME', clock: 0, score: 0, banks: 0 });
    expect(game.runTime).toBeCloseTo(TUNE.CLOCK, 1);
    expect(game.flock.wake).toBe(0);
  });
});

describe('catching', () => {
  const env = (flock: ReturnType<typeof createFlock>, path: number[], extra = {}) => ({
    x0: path[0], y0: path[1], z0: path[2], x1: path[3], y1: path[4], z1: path[5], vx: 0, vy: 0, vz: -40,
    anchor: { x: 0, y: 0, z: 0 }, flee: 0, fleeForce: 0, wildSpeed: 30, catching: true, catchRadius: TUNE.CATCH,
    rocks: createBelt(0), near: new Int16Array(4), nearCount: 0, stream: { x: 0, y: 0, z: 0 },
    time: 0, random: mulberry32(1), caught: 0, shed: 0, flock, ...extra,
  });
  /** One wild bird at a point, standing still, with no neighbours. */
  function oneBird(x: number, y: number, z: number) {
    const flock = createFlock(1, mulberry32(1));
    resetFlock(flock, 1, { x: 0, y: 0, z: 0 }, mulberry32(1));
    flock.pos.set([x, y, z]); flock.vel.fill(0);
    return flock;
  }

  it('catches a wild bird within 6 of the hull and not one just outside', () => {
    for (const [offset, caught] of [[TUNE.CATCH - 0.05, true], [TUNE.CATCH + 0.05, false]] as const) {
      const flock = oneBird(offset, 0, 0);
      const world = env(flock, [0, 0, 0, 0, 0, 0]);
      stepFlock(flock, 1e-6, world);
      expect(flock.state[0] === WAKE, `at ${offset}`).toBe(caught);
      expect([world.caught, flock.wake, flock.wild]).toEqual(caught ? [1, 1, 0] : [0, 0, 1]);
    }
    expect(TUNE.CATCH).toBe(6);
  });

  it('catches along the whole of a slow frame, not only where the ship ends up', () => {
    // The ship crosses 100 units in one step; the bird is beside the middle of that path.
    const flock = oneBird(TUNE.CATCH - 0.5, 0, 0);
    stepFlock(flock, 1e-6, env(flock, [0, 0, 50, 0, 0, -50]));
    expect(flock.state[0]).toBe(WAKE);
    const beside = oneBird(TUNE.CATCH + 0.5, 0, 0);
    stepFlock(beside, 1e-6, env(beside, [0, 0, 50, 0, 0, -50]));
    expect(beside.state[0]).toBe(WILD);
  });

  it('catches nothing on the title screen or after the run is over', () => {
    const flock = oneBird(1, 0, 0);
    stepFlock(flock, 1e-6, env(flock, [0, 0, 0, 0, 0, 0], { catching: false }));
    expect(flock.state[0]).toBe(WILD);
  });

  it('a dive through the core gathers far more than a skim past the edge, and boost gathers more', () => {
    const pass = (seed: number, aside: number, boost: boolean) => {
      const game = noRocks(running(seed));
      const { ship, flock } = game;
      // Slide the opening line sideways so it passes `aside` from the flock's centre.
      ship.x += -ship.fz * aside; ship.z += ship.fx * aside;
      fly(game, 4.5, CENTRE, boost);
      return flock.wake;
    };
    let core = 0, edge = 0, fast = 0;
    for (let seed = 1; seed <= 8; seed++) {
      core += pass(seed, 0, false); edge += pass(seed, 34, false); fast += pass(seed, 0, true);
    }
    expect(core / 8).toBeGreaterThan(12);
    expect(edge).toBeLessThan(core / 4);
    expect(fast).toBeGreaterThan(core * 1.25);
  });

  it('carries the wake along: caught birds stay with the ship through a turn, in a swarm no wider than its width', () => {
    const game = noRocks(running(3));
    giveWake(game, 100);
    const { flock, ship } = game;
    fly(game, 4, { x: 0.6, y: 0.2 }, true);
    expect(Array.from(flock.state.subarray(0, 100)).every(state => state === WAKE)).toBe(true);
    let farthest = 0;
    for (let i = 0; i < 100; i++) {
      farthest = Math.max(farthest, Math.hypot(flock.pos[i * 3] - ship.x, flock.pos[i * 3 + 1] - ship.y, flock.pos[i * 3 + 2] - ship.z));
    }
    expect(farthest).toBeLessThan(FLOCK.BACK + FLOCK.LENGTH_MAX + wakeWidth(100) + 8);
    expect(wakeWidth(200)).toBeGreaterThan(wakeWidth(50) + 3); // a bigger haul is a wider one
  });
});

describe('banking', () => {
  it('pays n + n² / 100', () => {
    expect([0, 1, 50, 100, 200, 600].map(payout)).toEqual([0, 1, 75, 200, 600, 4200]);
    expect(payout(100) / 100).toBeGreaterThan(payout(50) / 50);
  });

  it('adds min(18, 4 + n / 10) seconds, the 4 shrinking by half a second per bank down to 0', () => {
    expect(clockBonus(50, 0)).toBe(9);
    expect(clockBonus(10, 0)).toBe(5);
    expect(clockBonus(200, 0)).toBe(18);
    expect([1, 2, 7, 8, 9, 30].map(banks => clockBonus(50, banks))).toEqual([8.5, 8, 5.5, 5, 5, 5]);
    expect(clockBonus(0, 8)).toBe(0);
    expect(clockBonus(500, 8)).toBe(18);
  });

  it('banks the wake at the gate: score, clock, counts, and the gate moves on', () => {
    const game = noRocks(running(6));
    fly(game, 1);
    giveWake(game, 50);
    gateAhead(game);
    const before = { clock: game.clock, id: game.gate.id };
    game.step(1 / 30, CENTRE);
    expect(game).toMatchObject({ score: 75, banks: 1, biggest: 50 });
    expect(game.banked).toMatchObject({ birds: 50, points: 75, seconds: 9 });
    expect(game.clock).toBeCloseTo(before.clock + 9 - 1 / 30, 6);
    expect(game.flock.wake).toBe(0);
    expect(game.gate.id).toBe(before.id + 1);
    // The banked birds stream away and then are wild again: the flock is back to 600.
    expect(game.flock.wild).toBe(TUNE.BIRDS - 50);
    fly(game, FLOCK.STREAM + 0.2);
    expect(game.flock.wild + game.flock.wake).toBe(TUNE.BIRDS);
    expect(game.flock.state.includes(2)).toBe(false);

    // The second bank pays its own points and a smaller bonus; the biggest haul stays.
    game.flock.state.fill(WILD);
    giveWake(game, 20);
    gateAhead(game);
    game.step(1 / 30, CENTRE);
    expect(game).toMatchObject({ score: 75 + 24, banks: 2, biggest: 50 });
    expect(game.banked).toMatchObject({ birds: 20, points: 24, seconds: TUNE.BONUS_BASE - TUNE.BONUS_STEP + 2 });
  });

  it('needs a wake, and a pass inside the ring', () => {
    for (const [birds, off, banked] of [[40, TUNE.PASS_R - 0.5, true], [40, TUNE.PASS_R + 0.5, false], [0, 0, false]] as const) {
      const game = noRocks(running(7));
      fly(game, 1);
      giveWake(game, birds);
      gateAhead(game, 0.5, off);
      const id = game.gate.id;
      game.step(1 / 30, CENTRE);
      expect(game.banks, `${birds} birds, ${off} off centre`).toBe(banked ? 1 : 0);
      expect(game.gate.id).toBe(banked ? id + 1 : id);
      expect(game.flock.wake).toBe(banked ? 0 : birds);
    }
    expect(TUNE.PASS_R).toBeLessThan(TUNE.GATE_R);
  });

  it('decides the gate where the ship crossed its plane, even inside one slow frame', () => {
    // A quarter-second frame at boost speed: the ship is far past the gate by its end.
    const game = noRocks(running(8));
    fly(game, 1, CENTRE, true);
    giveWake(game, 30);
    gateAhead(game, 6);
    game.step(0.25, CENTRE, true);
    expect(game.banks).toBe(1);
    expect(distance(game.ship, game.gate)).toBeGreaterThan(10);
  });

  it('judges the pass at the crossing, not where a fast step ends', () => {
    // One step carries the ship 20 units: through the ring near its edge and far out the other side.
    for (const [off, banked] of [[TUNE.PASS_R - 0.4, true], [TUNE.PASS_R + 0.4, false]] as const) {
      const game = noRocks(running(8));
      const { ship } = game;
      giveWake(game, 30);
      ship.vx = ship.fx * 600; ship.vy = ship.fy * 600; ship.vz = ship.fz * 600;
      gateAhead(game, 0.5, off);
      game.step(1 / 30, CENTRE);
      expect(distance(ship, game.gate)).toBeGreaterThan(TUNE.PASS_R + 3);
      expect(game.banks, `${off} off centre`).toBe(banked ? 1 : 0);
    }
  });

  it('keeps the best score across visits and never lowers it', () => {
    const storage = memory();
    const first = noRocks(running(1, storage));
    expect(first.best).toBe(0);
    giveWake(first, 100);
    gateAhead(first);
    first.step(1 / 30, CENTRE);
    first.clock = 0.001;
    first.step(1 / 30, CENTRE);
    expect(first).toMatchObject({ state: 'over', cause: 'OUT OF TIME', score: 200, best: 200, newBest: true });
    expect(storage.values.get(BEST_KEY)).toBe('200');
    expect(BEST_KEY).toBe('murmur.best');

    const second = noRocks(running(2, storage)); // a later visit
    expect(second.best).toBe(200);
    giveWake(second, 10);
    gateAhead(second);
    second.step(1 / 30, CENTRE);
    second.clock = 0.001;
    second.step(1 / 30, CENTRE);
    expect(second).toMatchObject({ state: 'over', score: 11, best: 200, newBest: false });
    expect(storage.values.get(BEST_KEY)).toBe('200');
  });

  it('plays on when storage is blocked or holds rubbish', () => {
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const game = noRocks(createGame({ random: mulberry32(1), storage: blocked }));
    game.press();
    giveWake(game, 10);
    gateAhead(game);
    game.step(1 / 30, CENTRE);
    game.clock = 0.001;
    game.step(1 / 30, CENTRE);
    expect(game).toMatchObject({ state: 'over', best: 11, newBest: true });
    const rubbish = memory();
    rubbish.setItem(BEST_KEY, 'NaN');
    expect(createGame({ storage: rubbish }).best).toBe(0);
  });
});

describe('rocks', () => {
  it.each([0.05, 0.25])('a %f s frame cannot carry the ship through a rock, however fast it is going', dt => {
    for (const speed of [TUNE.BOOST, 600]) {
      const game = running(9);
      const { ship } = game;
      ship.vx = ship.fx * speed; ship.vy = ship.fy * speed; ship.vz = ship.fz * speed;
      // The smallest rock, in the middle of the first piece of the step.
      const ahead = speed * TUNE.PIECE / 2;
      oneRock(game, ship.x + ship.fx * ahead, ship.y + ship.fy * ahead, ship.z + ship.fz * ahead, ROCK_RADII[0]);
      game.step(dt, CENTRE, true);
      expect(game, `speed ${speed}`).toMatchObject({ state: 'over', cause: 'WRECKED' });
    }
  });

  it('sweeps a segment against the spheres: through, beside, and which comes first', () => {
    const belt = createBelt(3);
    belt.r.fill(ROCK_RADII[0]);
    belt.x.set([0, 0, 0]); belt.y.set([0, 0, 0]); belt.z.set([-50, -20, -80]);
    expect(sweepBelt(belt, 0, 0, 0, 0, 0, -100, 1.4)).toBe(1); // the nearest along the path
    expect(sweepBelt(belt, 0, 0, -100, 0, 0, 0, 1.4)).toBe(2);
    const edge = ROCK_RADII[0] + 1.4;
    expect(sweepBelt(belt, edge + 0.01, 0, 0, edge + 0.01, 0, -30, 1.4)).toBe(-1);
    expect(sweepBelt(belt, edge - 0.01, 0, 0, edge - 0.01, 0, -30, 1.4)).toBe(1);
    expect(sweepBelt(belt, 0, 0, 0, 0, 0, -10, 1.4)).toBe(-1); // stops short of the first
  });

  it('a hull-width miss is a miss', () => {
    for (const [gap, hit] of [[-0.1, true], [0.1, false]] as const) {
      const game = running(10);
      const { ship } = game, reach = ROCK_RADII[1] + TUNE.HULL + gap, side = rightOf(game);
      // Level flight, so the rock is exactly `reach` from the ship's line.
      ship.pitch = 0; ship.vy = 0; ship.fy = 0;
      oneRock(game, ship.x + ship.fx * 10 + side.x * reach, ship.y, ship.z + ship.fz * 10 + side.z * reach);
      fly(game, 0.6);
      expect(game.state === 'over', `gap ${gap}`).toBe(hit);
    }
  });

  it('knocks wake birds that touch a rock back into the wild flock, too scared to be caught at once', () => {
    const game = running(11);
    const { ship, flock } = game;
    giveWake(game, 40);
    // A rock beside the ship, clear of the hull; ten of the wake's birds are inside it.
    const side = rightOf(game);
    oneRock(game, ship.x + side.x * 12, ship.y, ship.z + side.z * 12, 7);
    for (let i = 0; i < 10; i++) flock.pos.set([ship.x + side.x * 12, ship.y, ship.z + side.z * 12], i * 3);
    game.step(1 / 60, CENTRE);
    expect(game.state).toBe('play');
    expect([flock.wake, flock.wild, game.lost]).toEqual([30, TUNE.BIRDS - 30, 10]);
    expect(flock.state[0]).toBe(WILD);
    expect(flock.timer[0]).toBeCloseTo(FLOCK.SPOOK, 5);

    // Held against the hull, a spooked bird is not caught until its fright has passed.
    const hold = () => flock.pos.set([ship.x, ship.y, ship.z], 0);
    game.belt.count = 0;
    hold(); game.step(1 / 60, CENTRE);
    expect(flock.state[0]).toBe(WILD);
    for (let t = 0; t < FLOCK.SPOOK; t += 1 / 60) { hold(); game.step(1 / 60, CENTRE); }
    hold(); game.step(1 / 60, CENTRE);
    expect(flock.state[0]).toBe(WAKE);
  });

  it('tests the wake against every rock near the ship, not a capped few', () => {
    const game = running(12);
    const { ship, belt, flock } = game;
    // The whole belt crowds round the ship; the rock holding the birds is the last one.
    for (let i = 0; i < belt.count; i++) {
      const angle = i / belt.count * Math.PI * 2;
      belt.x[i] = ship.x + Math.cos(angle) * 30; belt.y[i] = ship.y + Math.sin(angle) * 30; belt.z[i] = ship.z;
      belt.line[i] = game.gate.id;
    }
    giveWake(game, 5);
    const last = belt.count - 1;
    for (let i = 0; i < 5; i++) flock.pos.set([belt.x[last], belt.y[last], belt.z[last]], i * 3);
    game.step(1 / 60, CENTRE);
    expect(game.lost).toBe(5);
    const out = new Int16Array(belt.count);
    expect(nearBelt(belt, ship.x, ship.y, ship.z, TUNE.WAKE_REACH, out)).toBe(belt.count);
    expect(nearBelt(belt, ship.x + 500, ship.y, ship.z, TUNE.WAKE_REACH, out)).toBe(0);
  });

  it('a moved rock grows in from nothing, and is only as solid as it is drawn', () => {
    const game = running(13);
    const { ship, belt } = game;
    oneRock(game, ship.x + ship.fx * 8, ship.y + ship.fy * 8, ship.z + ship.fz * 8, ROCK_RADII[2]);
    belt.grow[0] = 0; belt.r[0] = 0;
    expect(sweepBelt(belt, ship.x, ship.y, ship.z, belt.x[0], belt.y[0], belt.z[0], TUNE.HULL)).toBe(-1);
    growBelt(belt, BELT.GROW / 2);
    expect(belt.r[0]).toBeCloseTo(ROCK_RADII[2] / 2, 5);
    growBelt(belt, BELT.GROW);
    expect(belt.r[0]).toBe(ROCK_RADII[2]);
    expect(sweepBelt(belt, ship.x, ship.y, ship.z, belt.x[0], belt.y[0], belt.z[0], TUNE.HULL)).toBe(0);
  });

  it('keeps the belt around the ship: rocks left behind come back ahead, never close and never full size', () => {
    const game = running(14);
    const { ship, belt } = game;
    const seen = new Map<number, number>();
    for (let i = 0; i < belt.count; i++) seen.set(i, belt.x[i]);
    let moved = 0;
    for (let frame = 0; frame < 60 * 30; frame++) {
      game.clock = TUNE.CLOCK;
      game.step(1 / 60, CENTRE, true);
      if (game.state !== 'play') break;
      for (let i = 0; i < belt.count; i++) {
        if (seen.get(i) === belt.x[i]) continue;
        seen.set(i, belt.x[i]);
        moved++;
        const far = Math.hypot(belt.x[i] - ship.x, belt.y[i] - ship.y, belt.z[i] - ship.z);
        expect(far).toBeGreaterThanOrEqual(BELT.REEF_MIN - 1);
        expect(belt.r[i]).toBeLessThan(belt.full[i] * 0.01);
        expect(distance({ x: belt.x[i], y: belt.y[i], z: belt.z[i] }, game.gate)).toBeGreaterThanOrEqual(BELT.GATE_CLEAR - 1e-3);
      }
    }
    expect(moved).toBeGreaterThan(40);
    expect(belt.count).toBe(BELT.ROCKS);
  });
});

describe('escalation', () => {
  it('moves the gate out, widens the flight from the hull, speeds the flock and packs the reef, bank by bank', () => {
    expect([0, 1, 2, 9, 10, 40].map(gateDistance)).toEqual([160, 185, 210, 385, 400, 400]);
    expect([0, 1, 9, 10, 11, 40].map(fleeRadius)).toEqual([30, 33, 57, 60, 60, 60]);
    for (const grows of [wildSpeed, fleeForce, reefShare, gateDistance]) {
      expect(grows(3)).toBeGreaterThan(grows(0));
    }
    expect(reefRadius(3)).toBeLessThan(reefRadius(0));
    expect(reefShare(100)).toBeLessThanOrEqual(0.6);
    // The flock's speed has no cap: in the end it outruns the ship, boosting or not.
    expect(wildSpeed(100)).toBeGreaterThan(TUNE.BOOST);
  });

  it('stands each new gate at its distance from the flock, on another side, with its mouth clear of rocks', () => {
    const game = running(15);
    game.belt.count = BELT.ROCKS;
    for (let bank = 0; bank < 12; bank++) {
      giveWake(game, 20);
      gateAhead(game);
      const old = { ...game.gate }, anchor = { ...game.anchor };
      // Keep rocks out of this test's way without changing how many there are.
      const { ship } = game;
      for (let i = 0; i < game.belt.count; i++) {
        if (Math.hypot(game.belt.x[i] - ship.x, game.belt.y[i] - ship.y, game.belt.z[i] - ship.z) < 30) game.belt.r[i] = 0;
      }
      game.clock = TUNE.CLOCK;
      game.step(1 / 60, CENTRE);
      expect(game.banks).toBe(bank + 1);
      const { gate } = game;
      expect(distance(gate, anchor)).toBeCloseTo(gateDistance(bank + 1), 0);
      {
        // Seen from the flock, the new gate is well away from the one just used:
        // the way to it leads back past the birds.
        const a = { x: old.x - anchor.x, y: old.y - anchor.y, z: old.z - anchor.z };
        const b = { x: gate.x - anchor.x, y: gate.y - anchor.y, z: gate.z - anchor.z };
        const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z));
        expect(cos).toBeLessThan(0.5);
      }
      for (let i = 0; i < game.belt.count; i++) {
        const far = distance({ x: game.belt.x[i], y: game.belt.y[i], z: game.belt.z[i] }, gate);
        if (game.belt.r[i] > 0) expect(far).toBeGreaterThanOrEqual(BELT.GATE_CLEAR - 1e-3);
      }
      for (let i = 0; i < game.belt.count; i++) { game.belt.r[i] = game.belt.full[i]; game.belt.grow[i] = 1; }
    }
  });

  it('builds a reef between the flock and the gate, denser after more banks', () => {
    const inReef = (banks: number) => {
      const game = running(16);
      game.banks = banks;
      giveWake(game, 20);
      gateAhead(game);
      game.belt.count = 0; game.step(1 / 60, CENTRE); game.belt.count = BELT.ROCKS;
      // Fly well away so the whole belt is recycled around the new line.
      for (let i = 0; i < 60 * 20; i++) { game.clock = TUNE.CLOCK; game.belt.r.fill(0); game.step(1 / 60, CENTRE, true); }
      let count = 0;
      for (let i = 0; i < game.belt.count; i++) if (game.belt.line[i] === game.gate.id) count++;
      return count;
    };
    const early = inReef(0), late = inReef(7);
    // The reef fills to its share of the belt and stops there.
    expect(early).toBe(Math.round(BELT.ROCKS * reefShare(1)));
    expect(late).toBe(Math.round(BELT.ROCKS * reefShare(8)));
    expect(late).toBeGreaterThan(early * 2);
  });

  it('makes the flock harder to catch: the same dive gathers fewer birds after more banks', () => {
    const dive = (banks: number) => {
      let total = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const game = noRocks(running(seed));
        game.banks = banks;
        fly(game, 4.5, CENTRE, true);
        total += game.flock.wake;
      }
      return total / 6;
    };
    const [first, fifth, tenth, last] = [0, 5, 10, 100].map(dive);
    expect(first).toBeGreaterThan(30);
    expect(fifth).toBeLessThan(first * 0.8);
    expect(tenth).toBeLessThan(fifth);
    expect(last).toBeLessThan(2); // by then it cannot be caught at all
  });
});

describe('every run ends', () => {
  const play = (seed: number, options: Parameters<typeof createBot>[1], prepare?: (game: Game) => void) => {
    const game = running(seed);
    prepare?.(game);
    const bot = createBot(game, options);
    while (game.state === 'play' && game.runTime < 1800) {
      bot.update();
      game.step(1 / 30, bot.stick, bot.boost);
    }
    return game;
  };

  it('ends the lazy lines: hands off, circling, and gathering without ever banking', () => {
    for (let seed = 1; seed <= 6; seed++) {
      for (const stick of [CENTRE, { x: 1, y: 0 }, { x: -0.4, y: 0.3 }]) {
        const game = running(seed);
        fly(game, 120, stick, seed % 2 === 0);
        expect(game.state).toBe('over');
        expect(game.runTime).toBeLessThanOrEqual(TUNE.CLOCK + 0.1);
      }
      // Hoarding until the clock forces a bank is a real line of play. It ends too.
      const hoarder = play(seed, { haul: Infinity });
      expect(hoarder.state).toBe('over');
      expect(hoarder.runTime).toBeLessThan(400);
    }
  });

  it('a scripted pilot plays real runs: several banks, over a minute, and still ends', () => {
    let banks = 0, score = 0, longest = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const game = play(seed, { haul: 60 });
      expect(game.state).toBe('over');
      banks += game.banks; score += game.score; longest = Math.max(longest, game.runTime);
    }
    expect(banks / 6).toBeGreaterThan(2);
    expect(score / 6).toBeGreaterThan(200);
    expect(longest).toBeGreaterThan(70);
    expect(longest).toBeLessThan(400);
  });

  it('ends even for a pilot with no rocks to hit and a gate that comes to the ship', () => {
    // Nothing can wreck it and banking costs no travel: only the flock's
    // growing speed stands between this pilot and an endless run.
    for (const every of [4, 8]) {
      for (const seed of [1, 2]) {
        const game = noRocks(running(seed));
        const bot = createBot(game, { haul: Infinity, dodge: false });
        let next = every;
        while (game.state === 'play' && game.runTime < 3600) {
          bot.update();
          if (game.runTime >= next && game.flock.wake > 0) { next = game.runTime + every; gateAhead(game, 0.5); }
          game.step(1 / 30, bot.stick, true);
        }
        expect(game, `every ${every}, seed ${seed}`).toMatchObject({ state: 'over', cause: 'OUT OF TIME' });
        expect(game.banks).toBeGreaterThan(8); // banking does sustain a good run for a while
        expect(game.runTime).toBeLessThan(600);
      }
    }
  });
});

describe('flight feel', () => {
  const heading = (game: Game) => game.ship.yaw * 180 / Math.PI;

  it('turns gently on a small stick and no faster than the game needs on a full one', () => {
    const small = noRocks(running(1)), full = noRocks(running(1));
    const from = heading(small);
    fly(small, 1, { x: 0.25, y: 0 });
    fly(full, 1, { x: 1, y: 0 });
    const gentle = Math.abs(heading(small) - from), hard = Math.abs(heading(full) - from);
    expect(gentle).toBeLessThan(13); // a quarter stick: about a tenth of the full rate
    expect(gentle).toBeGreaterThan(4);
    expect(hard).toBeGreaterThan(70);
    expect(hard).toBeLessThan(TUNE.YAW * 180 / Math.PI + 0.01);
    expect(TUNE.YAW).toBeLessThanOrEqual(1.8); // DRIFT BELT turned at 2.7
  });

  it('eases into a turn: the first tenth of a second of full stick moves the nose under 3 degrees', () => {
    const game = noRocks(running(2));
    const from = heading(game);
    fly(game, 0.1, { x: 1, y: 0 });
    expect(Math.abs(heading(game) - from)).toBeLessThan(3);
    expect(Math.abs(heading(game) - from)).toBeGreaterThan(0.5);
  });

  it('has momentum: boost is faster, and makes the turn wider', () => {
    const circle = (boost: boolean) => {
      const game = noRocks(running(3));
      fly(game, 3, CENTRE, boost);
      const speed = Math.hypot(game.ship.vx, game.ship.vy, game.ship.vz);
      const from = { ...game.ship };
      fly(game, Math.PI / TUNE.YAW, { x: 1, y: 0 }, boost); // half a turn
      return { speed, width: distance(from, game.ship) };
    };
    const cruise = circle(false), boosted = circle(true);
    expect(cruise.speed).toBeCloseTo(TUNE.CRUISE, 0);
    expect(boosted.speed).toBeCloseTo(TUNE.BOOST, 0);
    expect(boosted.width).toBeGreaterThan(cruise.width * 1.6);
    // Even boosting, the turn fits inside the flock's reach and the gate can be lined up.
    expect(cruise.width / 2).toBeLessThan(40);
  });

  it('flies the same course on slow frames as on fast ones, and the wake keeps up', () => {
    const course = (dt: number) => {
      const game = noRocks(running(6));
      giveWake(game, 80);
      fly(game, 3, { x: 0.8, y: -0.3 }, true, dt);
      let farthest = 0;
      for (let i = 0; i < 80; i++) {
        farthest = Math.max(farthest, Math.hypot(game.flock.pos[i * 3] - game.ship.x, game.flock.pos[i * 3 + 1] - game.ship.y, game.flock.pos[i * 3 + 2] - game.ship.z));
      }
      return { ship: { ...game.ship }, farthest, wake: game.flock.wake, time: game.runTime };
    };
    const smooth = course(1 / 60);
    for (const dt of [1 / 20, 0.25]) {
      const slow = course(dt);
      expect(slow.time).toBeCloseTo(smooth.time, 6);
      expect(distance(slow.ship, smooth.ship), `dt ${dt}`).toBeLessThan(5); // of about 250 flown
      expect(Math.abs(slow.ship.yaw - smooth.ship.yaw)).toBeLessThan(0.03);
      expect(slow.wake).toBe(80);
      expect(slow.farthest).toBeLessThan(smooth.farthest + 6);
    }
  });

  it('boost comes on smoothly: a third of a second of it adds under half the extra speed', () => {
    const game = noRocks(running(3));
    fly(game, 2);
    const cruise = Math.hypot(game.ship.vx, game.ship.vy, game.ship.vz);
    fly(game, 0.3, CENTRE, true);
    const gained = Math.hypot(game.ship.vx, game.ship.vy, game.ship.vz) - cruise;
    expect(gained).toBeGreaterThan(10);
    expect(gained).toBeLessThan((TUNE.BOOST - TUNE.CRUISE) * 0.6);
    fly(game, 0.3); // and a tap of it is soon gone
    fly(game, 1.2);
    expect(Math.hypot(game.ship.vx, game.ship.vy, game.ship.vz)).toBeLessThan(cruise + 2);
  });

  it('pitches up with the stick pulled back, down with it pushed, and never past its limit', () => {
    const game = noRocks(running(4));
    fly(game, 5, { x: 0, y: -1 });
    expect(game.ship.pitch).toBe(TUNE.PITCH_MAX);
    expect(game.ship.fy).toBeGreaterThan(0.9);
    game.clock = TUNE.CLOCK;
    fly(game, 5, { x: 0, y: 1 });
    expect(game.ship.pitch).toBe(-TUNE.PITCH_MAX);
  });
});

describe('finding things', () => {
  const W = 1440, H = 900, TAN = Math.tan(32 * Math.PI / 180), ASPECT = W / H, INSET = 38;
  /** A target at (x, y, z) from a level ship and its camera: x right, y up, ahead is −z. */
  const spot = (x: number, y: number, z: number) =>
    markerSpot(x, y, z, Math.atan2(x, -z), Math.atan2(y, Math.hypot(x, z)), TAN, ASPECT, W, H, INSET, { x: 0, y: 0, edge: false });

  it('sits on the target while the target is on screen', () => {
    expect(spot(0, 0, -100)).toEqual({ x: W / 2, y: H / 2, edge: false });
    const right = spot(30, 10, -100);
    expect(right.edge).toBe(false);
    expect(right.x).toBeCloseTo(W / 2 + 30 / (100 * TAN * ASPECT) * W / 2, 6);
    expect(right.y).toBeCloseTo(H / 2 - 10 / (100 * TAN) * H / 2, 6);
  });

  it('never mirrors: a target behind and to the right is marked on the right edge, and so on round', () => {
    // The old marker flipped the projected point of a target behind the camera.
    for (const z of [50, 5, 0.001, -0.001]) {
      expect(spot(40, 0, z)).toMatchObject({ x: W - INSET, y: H / 2, edge: true });
      expect(spot(-40, 0, z)).toMatchObject({ x: INSET, y: H / 2, edge: true });
    }
    // Overhead and underfoot, just in front of the camera's plane.
    expect(spot(0, 40, -0.001)).toMatchObject({ x: W / 2, y: INSET, edge: true });
    expect(spot(0, -40, -0.001)).toMatchObject({ x: W / 2, y: H - INSET, edge: true });
    const corner = spot(100, 100, 30);
    expect(corner.x).toBeGreaterThan(W / 2);
    expect(corner.y).toBeLessThan(H / 2);
  });

  it('stays on screen and moves without a jump as a target swings from ahead, past the side, to behind', () => {
    let previous = spot(0, 5, -100), widest = 0;
    for (let degrees = 0; degrees <= 360; degrees += 0.25) {
      const angle = degrees * Math.PI / 180;
      const now = spot(Math.sin(angle) * 100, 5, -Math.cos(angle) * 100);
      expect(now.x).toBeGreaterThanOrEqual(INSET - 1e-6);
      expect(now.x).toBeLessThanOrEqual(W - INSET + 1e-6);
      expect(now.y).toBeGreaterThanOrEqual(INSET - 1e-6);
      expect(now.y).toBeLessThanOrEqual(H - INSET + 1e-6);
      // Dead astern is the one place the marker changes sides: left and right are both right there.
      const astern = Math.abs(degrees - 180) < 2;
      if (!astern) widest = Math.max(widest, Math.hypot(now.x - previous.x, now.y - previous.y));
      // On the right half of the turn the marker is on the right half of the screen.
      if (degrees > 1 && degrees < 179) expect(now.x).toBeGreaterThan(W / 2);
      if (degrees > 181 && degrees < 359) expect(now.x).toBeLessThan(W / 2);
      previous = now;
    }
    expect(widest).toBeLessThan(60);
  });

  it('marks a target behind to the side the ship must turn, never above or below where it cannot go', () => {
    // The ship cannot loop: its pitch is limited. Behind and below means turn round, then nose down.
    for (const y of [-70, 70, 0]) {
      const right = spot(1, y, 60), left = spot(-1, y, 60);
      expect(right).toMatchObject({ x: W - INSET, edge: true });
      expect(left).toMatchObject({ x: INSET, edge: true });
      if (y) expect(Math.sign(right.y - H / 2)).toBe(-Math.sign(y));
      else expect(right.y).toBe(H / 2);
    }
    expect(markerSpot(0, 0, 80, 0, 0, TAN, ASPECT, W, H, INSET, { x: 0, y: 0, edge: false }))
      .toMatchObject({ x: W / 2, y: H - INSET, edge: true });
  });

  it('gives the yaw and pitch still to go', () => {
    const game = noRocks(running(5));
    const { ship } = game, side = rightOf(game), way = { turn: 0, climb: 0 };
    ship.pitch = 0;
    game.bearing(ship.x + side.x * 50, ship.y, ship.z + side.z * 50, way);
    expect(way.turn).toBeCloseTo(Math.PI / 2, 5);
    game.bearing(ship.x - side.x * 50, ship.y + 50, ship.z - side.z * 50, way);
    expect(way.turn).toBeCloseTo(-Math.PI / 2, 5);
    expect(way.climb).toBeCloseTo(Math.PI / 4, 5);
    // Turning right (stick right) closes a positive turn.
    game.bearing(ship.x + side.x * 50, ship.y, ship.z + side.z * 50, way);
    const before = way.turn;
    fly(game, 0.5, { x: 1, y: 0 });
    game.bearing(ship.x + side.x * 50, ship.y, ship.z + side.z * 50, way);
    expect(way.turn).toBeLessThan(before);
  });

  it('steering at the marker brings the target in front, wherever it starts', () => {
    // What the audit could not do: follow the marker back to a target that was overshot.
    for (const [x, y, z] of [[60, 0, 80], [-60, 10, 80], [0, -70, 60], [5, 0, 90], [-90, 20, 0]]) {
      const game = noRocks(running(5));
      const { ship } = game;
      const side = rightOf(game), flat = Math.hypot(ship.fx, ship.fz);
      const target = {
        x: ship.x + side.x * x - ship.fx / flat * z, y: ship.y + y, z: ship.z + side.z * x - ship.fz / flat * z,
      };
      const local = { x: 0, y: 0, z: 0 }, way = { turn: 0, climb: 0 }, at = { x: 0, y: 0, edge: false };
      let reached = false;
      for (let frame = 0; frame < 60 * 12 && !reached; frame++) {
        game.fromShip(target.x, target.y, target.z, local);
        game.bearing(target.x, target.y, target.z, way);
        markerSpot(local.x, local.y, local.z, way.turn, way.climb, TAN, ASPECT, W, H, INSET, at);
        // The player pushes the stick toward the marker.
        const stick = { x: (at.x - W / 2) / (W / 2 - INSET), y: (at.y - H / 2) / (H / 2 - INSET) };
        game.clock = TUNE.CLOCK;
        game.step(1 / 60, stick);
        reached = distance(ship, target) < 13;
      }
      expect(reached, `target at ${x}, ${y}, ${z}`).toBe(true);
    }
  });
});

describe('the view', () => {
  const renderer = { render() {} };
  const tracking = () => {
    const made: any[] = [];
    const tracked: Record<string, any> = { ...THREE };
    for (const [name, value] of Object.entries(THREE) as [string, any][]) {
      if (typeof value !== 'function' || typeof value.prototype?.dispose !== 'function') continue;
      tracked[name] = class extends value { constructor(...args: any[]) { super(...args); made.push(this); } };
    }
    return { made, tracked: tracked as typeof THREE };
  };

  it('keeps fixed pools through banks and retries, and releases everything on dispose', () => {
    const { made, tracked } = tracking();
    const game = createGame({ random: mulberry32(4) });
    const view = createView({ THREE: tracked, createShipBody, game, aspect: 16 / 9 });
    const frame = (dt = 1 / 60, stick = CENTRE, boost = false) => { game.step(dt, stick, boost); view.render(renderer, dt); };
    const objects = () => { let count = 0; view.scene.traverse(() => count++); return count; };
    const arrays = [game.flock.pos, game.flock.vel, game.flock.state, game.flock.glow, game.belt.x, game.belt.r];

    frame();
    const created = made.length, inScene = objects();
    expect(created).toBeGreaterThan(15);
    game.press();
    for (let run = 0; run < 5; run++) {
      for (let i = 0; i < 90; i++) frame(1 / 30, { x: 0.3, y: 0 }, true);
      giveWake(game, 30);
      gateAhead(game);
      frame();
      expect(game.banks).toBeGreaterThan(0);
      for (let i = 0; i < 30; i++) frame();
      game.clock = 0.001; frame();
      expect(game.state).toBe('over');
      game.step(TUNE.LOCK + 0.01, CENTRE);
      expect(game.press()).toBe(true);
      frame();
    }
    expect(made.length).toBe(created);
    expect(objects()).toBe(inScene);
    expect([game.flock.pos, game.flock.vel, game.flock.state, game.flock.glow, game.belt.x, game.belt.r]
      .every((array, i) => array === arrays[i])).toBe(true);
    expect([game.flock.pos.length, game.flock.capacity, game.belt.count]).toEqual([TUNE.BIRDS * 3, TUNE.BIRDS, BELT.ROCKS]);

    let released = 0;
    for (const resource of made) resource.addEventListener('dispose', () => released++);
    view.dispose();
    expect(released).toBe(made.length);
    expect(view.scene.children.length).toBe(0);
  });

  it('draws the flock from the game\'s own arrays, and only the birds in play', () => {
    const game = createGame({ random: mulberry32(2) });
    const view = createView({ THREE, createShipBody, game, aspect: 16 / 9 });
    view.render(renderer, 1 / 60);
    const birds = view.scene.children.find((child: any) => child.isPoints && child.geometry.attributes.glow) as any;
    expect(birds.geometry.attributes.position.array).toBe(game.flock.pos);
    expect(birds.geometry.attributes.glow.array).toBe(game.flock.glow);
    expect(birds.geometry.drawRange.count).toBe(TUNE.BIRDS);
    // Wake birds are drawn brighter than wild ones.
    game.press();
    giveWake(game, 50);
    game.belt.count = 0;
    for (let i = 0; i < 60; i++) { game.step(1 / 60, CENTRE); view.render(renderer, 1 / 60); }
    expect(game.flock.glow[0]).toBeGreaterThan(game.flock.glow[TUNE.BIRDS - 1] * 1.4);

    // The smaller flock for a slow phone takes effect at the next run.
    game.setBirds(TUNE.BIRDS_LOW);
    game.clock = 0.001; game.step(1 / 60, CENTRE);
    game.step(TUNE.LOCK + 0.01, CENTRE);
    game.press();
    view.render(renderer, 1 / 60);
    expect([game.flock.count, game.flock.wild, birds.geometry.drawRange.count]).toEqual([400, 400, 400]);
    expect(game.flock.pos.length).toBe(TUNE.BIRDS * 3);
    view.dispose();
  });

  it('draws each rock where and as large as the game collides with it', () => {
    const game = running(6);
    const view = createView({ THREE, createShipBody, game, aspect: 16 / 9 });
    game.belt.grow[4] = 0.5; game.belt.r[4] = game.belt.full[4] / 2;
    view.render(renderer, 1 / 60);
    const batches = view.scene.children.filter((child: any) => child.isInstancedMesh) as any[];
    expect(batches.length).toBe(6); // faces and edges for each of three sizes
    expect(batches.reduce((sum, batch) => sum + batch.count, 0)).toBe(BELT.ROCKS * 2);
    const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), turn = new THREE.Quaternion();
    for (let i = 0; i < game.belt.count; i++) {
      for (const batch of batches.filter((_, index) => Math.floor(index / 2) === game.belt.kind[i])) {
        batch.getMatrixAt(Math.floor(i / 3), matrix);
        matrix.decompose(position, turn, scale);
        expect(position.x).toBeCloseTo(game.belt.x[i], 3);
        expect(position.z).toBeCloseTo(game.belt.z[i], 3);
        expect(scale.x).toBeCloseTo(game.belt.r[i], 4);
      }
    }
    view.dispose();
  });

  it('banks the hull for show only: the control frame never rolls', () => {
    const game = noRocks(running(7));
    const view = createView({ THREE, createShipBody, game, aspect: 16 / 9 });
    const rolled = new THREE.Euler();
    let lean = 0;
    for (let i = 0; i < 90; i++) {
      game.step(1 / 60, { x: 1, y: 0.2 });
      view.render(renderer, 1 / 60);
      rolled.setFromQuaternion(view.ship.quaternion, 'YXZ');
      expect(Math.abs(rolled.z)).toBeLessThan(1e-6);
      expect(rolled.y).toBeCloseTo(Math.atan2(Math.sin(game.ship.yaw), Math.cos(game.ship.yaw)), 5);
      lean = Math.max(lean, Math.abs(view.body.rotation.z));
    }
    expect(lean).toBeGreaterThan(0.5);
    // The same stick with the hull held level flies exactly the same path.
    const level = noRocks(running(7));
    for (let i = 0; i < 90; i++) level.step(1 / 60, { x: 1, y: 0.2 });
    expect([level.ship.x, level.ship.y, level.ship.z, level.ship.yaw]).toEqual([game.ship.x, game.ship.y, game.ship.z, game.ship.yaw]);
    view.dispose();
  });

  it.each([[1440, 900], [390, 844]])('keeps the ship well inside a %i x %i screen through hard turns, with a full wake', (width, height) => {
    const game = noRocks(running(8));
    const view = createView({ THREE, createShipBody, game, aspect: width / height });
    view.resize(width, height, 1);
    giveWake(game, 200);
    const spot = new THREE.Vector3();
    let widest = 0, tallest = 0;
    for (let i = 0; i < 600; i++) {
      const turn = Math.floor(i / 75) % 2 ? 1 : -1;
      game.clock = TUNE.CLOCK;
      game.step(1 / 60, { x: turn, y: turn * 0.6 }, i % 150 < 75);
      view.render(renderer, 1 / 60);
      spot.set(game.ship.x, game.ship.y, game.ship.z).project(view.camera);
      expect(spot.z).toBeLessThan(1);
      widest = Math.max(widest, Math.abs(spot.x));
      tallest = Math.max(tallest, Math.abs(spot.y));
    }
    expect(widest).toBeGreaterThan(0.1); // it does lag: the turn reads on screen
    expect(widest).toBeLessThan(0.7);
    expect(tallest).toBeLessThan(0.7);
    view.dispose();
  });

  it('cuts to the ship when a run starts, and backs off as the wake grows', () => {
    const game = createGame({ random: mulberry32(9) });
    const view = createView({ THREE, createShipBody, game, aspect: 16 / 9 });
    for (let i = 0; i < 30; i++) { game.step(1 / 60, CENTRE); view.render(renderer, 1 / 60); }
    game.press(); game.belt.count = 0;
    game.step(1 / 60, CENTRE); view.render(renderer, 1 / 60);
    const behind = () => distance(view.camera.position, game.ship);
    expect(behind()).toBeLessThan(11);
    const near = behind();
    giveWake(game, 150);
    for (let i = 0; i < 240; i++) { game.clock = TUNE.CLOCK; game.step(1 / 60, CENTRE); view.render(renderer, 1 / 60); }
    expect(behind()).toBeGreaterThan(near + 5);
    view.dispose();
  });
});

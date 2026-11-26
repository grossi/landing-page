import { describe, expect, it } from 'vitest';
import * as THREE from '../../public/arcade/vendor/three.module.min.js';
import { createShipBody } from '../../public/arcade/shared/ship.js';
import { CONTROL, createKeyAxis, curve } from '../../public/arcade/meridian/controls.js';
import { BEST_KEY, TUNE, createGame } from '../../public/arcade/meridian/game.js';
import { createView } from '../../public/arcade/meridian/view.js';
import {
  BLEND, CITY, HALF, LANES, LANE_W, ROW_D, SEA, SECTORS, SHARDS, SPAN, createWorld, laneX, mulberry32,
} from '../../public/arcade/meridian/world.js';

const CENTRE = { x: 0, y: 0 }, UP = { x: 0, y: -1 }, DOWN = { x: 0, y: 1 };
const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
  };
};

/** A run that has just begun. */
function running(seed = 1, storage: ReturnType<typeof memory> | null = null) {
  const game = createGame({ random: mulberry32(seed), storage });
  game.step(1 / 60, CENTRE);
  game.press();
  return game;
}

/** Flat, empty ground with no gates in the way and the opening grace over: one rule at a time. */
function flat(game: ReturnType<typeof createGame>) {
  game.world.surface = () => 0;
  game.world.crestNear = () => 0;
  game.world.animated = () => false;
  game.world.rowsNear = (_d: number, _reach: number, out: unknown[] = []) => { out.length = 0; return out; };
  game.gates.length = 0;
  game.runTime = 10;
  // Gates stand within HALF − 12 of the centre line: at the wall none can be threaded.
  game.x = HALF;
  return game;
}
const fly = (game: ReturnType<typeof createGame>, seconds: number, stick = CENTRE, dt = 1 / 60) => {
  for (let t = 0; t < seconds - 1e-9 && game.state === 'play'; t += dt) game.step(dt, stick);
};
const gateAt = (game: ReturnType<typeof createGame>, ahead: number, x = game.x, y = game.y) => {
  const gate = { id: 1000 + game.gates.length, d: game.dist + ahead, x, y, state: 0, at: 0 };
  game.gates.push(gate);
  return gate;
};

/** Least height of a gate's ring above the drawn surface, around the ring and through the swell. */
function ringClearance(game: ReturnType<typeof createGame>, gate: { x: number, y: number, d: number }) {
  let least = Infinity;
  for (let t = 0; t < 12; t += 0.25) {
    for (let k = 0; k < 64; k++) {
      const angle = k / 64 * Math.PI * 2;
      const x = gate.x + Math.cos(angle) * TUNE.GATE_R;
      least = Math.min(least, gate.y + Math.sin(angle) * TUNE.GATE_R - game.world.surface(x, gate.d, t));
    }
  }
  return least;
}

describe('a run from start to game over to retry', () => {
  it('glides on the title screen without ever ending', () => {
    const game = createGame({ random: mulberry32(4) });
    expect(game.state).toBe('menu');
    for (let i = 0; i < 60 * 180; i++) {
      game.step(1 / 60, DOWN);
      expect(game.y - game.world.surface(game.x, game.dist, game.time)).toBeGreaterThan(TUNE.SKIM);
    }
    expect(game.state).toBe('menu');
    expect(game.dist).toBeGreaterThan(TUNE.GLIDE_SPEED * 170);
    expect(game.score).toBe(0);
  });

  it('starts on a press, ends on an impact, locks, then retries from a fresh world', () => {
    const game = createGame({ random: mulberry32(5) });
    for (let i = 0; i < 90; i++) game.step(1 / 60, CENTRE);
    const glideDistance = game.dist;
    expect(game.press()).toBe(true);
    expect(game).toMatchObject({ state: 'play', score: 0, charge: TUNE.CHARGE, chain: 0, speed: TUNE.SPEED0 });
    // The run takes over the glide where it was: no jump on the first start.
    expect(game.dist).toBe(glideDistance);
    expect(game.world.origin).toBe(glideDistance);
    expect(game.press()).toBe(false); // a press mid-run is not a restart

    fly(game, 1, CENTRE);
    expect(game.score).toBeGreaterThan(0);
    game.y = game.world.surface(game.x, game.dist, game.time) - 1;
    game.step(1 / 60, CENTRE);
    expect(game).toMatchObject({ state: 'over', cause: 'IMPACT' });
    const frozen = { dist: game.dist, score: game.score };
    game.step(1 / 60, CENTRE);
    expect({ dist: game.dist, score: game.score }).toEqual(frozen);

    game.step(TUNE.LOCK / 2, CENTRE);
    expect(game.press()).toBe(false);
    expect(game.state).toBe('over');
    const epoch = game.world.epoch;
    game.step(TUNE.LOCK / 2 + 0.01, CENTRE);
    expect(game.press()).toBe(true);
    expect(game).toMatchObject({
      state: 'play', score: 0, charge: TUNE.CHARGE, chain: 0, bestChain: 0, threaded: 0,
      dist: 0, x: 0, runTime: 0, cause: '', sector: 0, lap: 1,
    });
    expect(game.world.epoch).toBe(epoch + 1);
    expect(game.gates.every(gate => gate.state === 0 && gate.d > 0)).toBe(true);
  });

  it('hands the title glide to the run with every gate ahead still clear of the ground', () => {
    // The title wraps its origin as it glides; whenever the press comes, what was
    // placed ahead must still fit the ground the run will collide with.
    for (const seconds of [0.5, 9, 12.6, 14, 30.1, 47, 200]) {
      const game = createGame({ random: mulberry32(9) });
      for (let t = 0; t < seconds; t += 1 / 60) game.step(1 / 60, CENTRE);
      const ahead = game.gates.filter(gate => gate.d > game.dist);
      expect(ahead.length).toBeGreaterThan(2);
      game.press();
      for (const gate of ahead) {
        expect(game.world.sectorAt(gate.d)).toMatchObject({ index: 0, blend: 0 });
        expect(ringClearance(game, gate), `after ${seconds} s`).toBeGreaterThan(0.5);
      }
    }
  });

  it('opens with a grace: no run ends in its first seconds, hands off or diving', () => {
    // "FLY LOW" invites a dive from the first frame; that must not be a trap.
    for (let seed = 1; seed <= 60; seed++) {
      for (const stick of [CENTRE, DOWN, { x: 0.3, y: 1 }]) {
        const game = createGame({ random: mulberry32(seed) });
        for (let i = 0; i < 5 + (seed % 7) * 40; i++) game.step(1 / 60, CENTRE); // any moment of the title glide
        game.press();
        fly(game, 4.5, stick);
        expect(game.state, `seed ${seed}, stick ${stick.y}`).toBe('play');
      }
    }
  });
});

describe('scoring', () => {
  it('pays one point per unit of distance, three while low', () => {
    const game = flat(running());
    game.y = 30;
    let from = { dist: game.dist, score: game.score };
    fly(game, 1);
    expect(game.low).toBe(false);
    expect(game.score - from.score).toBeCloseTo(game.dist - from.dist, 6);

    game.y = TUNE.LOW - 0.5;
    from = { dist: game.dist, score: game.score };
    fly(game, 1);
    expect(game.low).toBe(true);
    expect(game.score - from.score).toBeCloseTo((game.dist - from.dist) * TUNE.LOW_MULT, 6);
  });

  it('pays gates by chain, resets the chain on a miss, and caps the payout', () => {
    const game = flat(running());
    game.y = 30;
    const payouts: number[] = [];
    const first = gateAt(game, 10), second = gateAt(game, 20);
    const missed = gateAt(game, 30, game.x - TUNE.PASS_R - 0.5), third = gateAt(game, 40);
    let last = -Infinity;
    while (third.state === 0) {
      game.step(1 / 60, { x: 1, y: 0 });
      if (game.payout.at !== last) { last = game.payout.at; payouts.push(game.payout.points); }
    }
    expect([first.state, second.state, missed.state, third.state]).toEqual([1, 1, 2, 1]);
    expect(payouts).toEqual([TUNE.GATE_POINTS, 2 * TUNE.GATE_POINTS, TUNE.GATE_POINTS]);
    expect(game).toMatchObject({ chain: 1, bestChain: 2, threaded: 3 });

    game.chain = TUNE.CHAIN_CAP + 4;
    const before = game.score, distance = game.dist;
    const capped = gateAt(game, 0.5);
    game.step(1 / 60, { x: 1, y: 0 });
    expect(capped.state).toBe(1);
    expect(game.score - before - (game.dist - distance)).toBeCloseTo(TUNE.GATE_POINTS * TUNE.CHAIN_CAP, 6);
    expect(game.chain).toBe(TUNE.CHAIN_CAP + 5);
  });

  it('counts a gate threaded just inside its edge and missed just outside', () => {
    for (const [offset, state] of [[TUNE.PASS_R - 0.05, 1], [TUNE.PASS_R + 0.05, 2]] as const) {
      const game = flat(running());
      game.y = 30;
      const gate = gateAt(game, 0.5, game.x, game.y + offset);
      game.step(1 / 60, { x: 1, y: 0 });
      expect(gate.state).toBe(state);
    }
  });

  it('keeps the best score across visits and never lowers it', () => {
    const storage = memory();
    const first = flat(running(1, storage));
    expect(first.best).toBe(0);
    first.score = 1234.1; first.charge = 0.001;
    first.step(1 / 60, CENTRE);
    expect(first).toMatchObject({ state: 'over', cause: 'SIGNAL LOST', best: 1234, newBest: true });
    expect(storage.values.get(BEST_KEY)).toBe('1234');

    const second = flat(running(2, storage)); // a later visit
    expect(second.best).toBe(1234);
    second.score = 80; second.charge = 0.001;
    second.step(1 / 60, CENTRE);
    expect(second).toMatchObject({ state: 'over', best: 1234, newBest: false });
    expect(storage.values.get(BEST_KEY)).toBe('1234');
  });

  it('plays on when storage is blocked or holds rubbish', () => {
    const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const game = flat(createGame({ random: mulberry32(1), storage: blocked }));
    game.press();
    game.score = 50; game.charge = 0.001;
    game.step(1 / 60, CENTRE);
    expect(game).toMatchObject({ state: 'over', best: 50, newBest: true });
    const rubbish = memory();
    rubbish.setItem(BEST_KEY, 'NaN');
    expect(createGame({ storage: rubbish }).best).toBe(0);
  });
});

describe('charge and escalation', () => {
  it('drains the charge, refills it at a gate up to full, and ends the run empty', () => {
    const game = flat(running());
    game.y = 30;
    fly(game, 2);
    expect(game.charge).toBeCloseTo(TUNE.CHARGE - 2 * TUNE.DRAIN0, 6);
    game.charge = 50;
    gateAt(game, 0.5);
    game.step(1 / 60, { x: 1, y: 0 });
    expect(game.charge).toBeCloseTo(50 + TUNE.CHARGE_GATE - TUNE.DRAIN0 / 60, 6);
    game.charge = TUNE.CHARGE - 1;
    gateAt(game, 0.5);
    game.step(1 / 60, { x: 1, y: 0 });
    expect(game.charge).toBeLessThanOrEqual(TUNE.CHARGE);
    fly(game, 60);
    expect(game).toMatchObject({ state: 'over', cause: 'SIGNAL LOST', charge: 0 });
  });

  it('ends every lazy line: pinned high, hands off, and stick held down', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const high = running(seed);
      fly(high, 120, UP);
      // Above everything nothing can be hit, and no gate is in reach: the charge decides.
      expect(high).toMatchObject({ state: 'over', cause: 'SIGNAL LOST' });
      expect(high.runTime).toBeCloseTo(TUNE.CHARGE / TUNE.DRAIN0, 1);
      for (const stick of [CENTRE, DOWN]) {
        const game = running(seed);
        fly(game, 120, stick);
        expect(game.state).toBe('over');
        expect(game.runTime).toBeLessThan(45);
      }
    }
  });

  it('ends even a run that threads every gate: the charge cannot be held forever', () => {
    // At the ceiling nothing can be hit. Credit every gate as it passes, as a
    // perfect pilot would earn it, and the drain must still win in the end.
    for (const seed of [3, 4, 5]) {
      const game = running(seed);
      const credited = new Set<number>();
      for (let i = 0; i < 60 * 30 * 30 && game.state === 'play'; i++) {
        game.step(1 / 30, UP);
        for (const gate of game.gates) {
          if (gate.state === 0 || credited.has(gate.id)) continue;
          credited.add(gate.id);
          if (game.state === 'play') game.charge = Math.min(TUNE.CHARGE, game.charge + TUNE.CHARGE_GATE);
        }
      }
      expect(game, `seed ${seed}`).toMatchObject({ state: 'over', cause: 'SIGNAL LOST' });
      expect(game.lap).toBeGreaterThan(4); // not before the late laps: gates do sustain a good run
      expect(game.lap).toBeLessThan(12);
    }
    // The invariant behind it: at the caps, even the sea's close gates lose charge.
    expect(TUNE.DRAIN_MAX * TUNE.GATE_GAP_MAX * TUNE.SEA_GAP).toBeGreaterThan(TUNE.CHARGE_GATE);
  });

  it('raises the speed cap and the drain each lap, up to their limits', () => {
    let previous = { cap: 0, drain: 0 };
    for (const lap of [1, 2, 3, 4, 5, 9]) {
      const game = flat(running());
      game.y = 30;
      game.world.restartAt(game.dist - SPAN * SECTORS.length * (lap - 1) - 10);
      game.speed = 500;
      game.step(1 / 60, CENTRE);
      expect(game.lap).toBe(lap);
      const cap = game.speed, charge = game.charge;
      game.step(1, CENTRE);
      const drain = charge - game.charge;
      expect(cap).toBe(Math.min(TUNE.CAP_MAX, TUNE.CAP0 + TUNE.CAP_LAP * (lap - 1)));
      expect(drain).toBeCloseTo(Math.min(TUNE.DRAIN_MAX, TUNE.DRAIN0 + TUNE.DRAIN_LAP * (lap - 1)), 6);
      expect(cap).toBeGreaterThanOrEqual(previous.cap);
      expect(drain).toBeGreaterThanOrEqual(previous.drain);
      previous = { cap, drain };
    }
    expect(previous).toEqual({ cap: TUNE.CAP_MAX, drain: TUNE.DRAIN_MAX });
  });

  it('crosses the four sectors in order and then starts the next lap', () => {
    const game = running(3);
    const seen: string[] = [];
    while (seen.length < 5 && game.state === 'play') {
      game.charge = TUNE.CHARGE; // watch the track, not the clock
      game.step(1 / 30, UP);
      const label = `${SECTORS[game.sector]} ${game.lap}`;
      if (seen[seen.length - 1] !== label) seen.push(label);
    }
    expect(game.state).toBe('play'); // the ceiling clears every sector
    expect(seen).toEqual(['THE RANGES 1', 'THE CITY 1', 'THE SEA 1', 'THE SHARDS 1', 'THE RANGES 2']);
  });
});

describe('flight and collision', () => {
  it.each([1 / 120, 1 / 60, 1 / 20])('deck assist: full dive at dt %f settles at skim height on flat ground', dt => {
    for (const speed of [TUNE.SPEED0, TUNE.CAP_MAX]) {
      const game = flat(running());
      game.y = 40; game.speed = speed;
      fly(game, 5, DOWN, dt);
      expect(game.state).toBe('play');
      expect(game.y).toBeGreaterThan(TUNE.SKIM - 0.05);
      expect(game.y).toBeLessThan(TUNE.SKIM + 0.3);
      expect(game.low).toBe(true);
    }
  });

  it('holds the ship inside the track and under the ceiling', () => {
    const game = flat(running());
    game.x = 0;
    fly(game, 3, { x: 1, y: -1 });
    expect(game).toMatchObject({ x: HALF, y: TUNE.CEILING, vx: 0 });
    fly(game, 3, { x: -1, y: -1 });
    expect(game.x).toBe(-HALF);
  });

  it.each([0.05, 0.25])('a %f s frame at top speed cannot pass through a thin tower', dt => {
    const game = flat(running());
    game.x = 0; game.y = 10; game.speed = TUNE.CAP_MAX;
    const row = { d: game.dist + 3, towers: [{ lane: 4, x: 0, w: 16, depth: 1, h: 40 }] };
    game.world.rowsNear = (d: number, reach: number, out: unknown[] = []) => {
      out.length = 0;
      if (Math.abs(row.d - d) <= reach) out.push(row);
      return out;
    };
    game.step(dt, CENTRE);
    expect(game).toMatchObject({ state: 'over', cause: 'IMPACT' });
    expect(game.dist).toBeLessThan(row.d + 0.5 + TUNE.HULL + TUNE.SUBSTEP);
  });

  it('a tower is cleared above its roof and beside its walls', () => {
    for (const [x, y, hit] of [[0, 41, true], [0, 41.5, false], [8.8, 10, true], [9.2, 10, false]] as const) {
      const game = flat(running());
      game.x = x; game.y = y; game.speed = TUNE.SPEED0;
      const row = { d: game.dist + 6, towers: [{ lane: 4, x: 0, w: 16, depth: 12, h: 40 + TUNE.HIT }] };
      game.world.rowsNear = (_d: number, _reach: number, out: unknown[] = []) => { out.length = 0; out.push(row); return out; };
      fly(game, 0.5, CENTRE);
      expect(game.state === 'over', `x ${x}, y ${y}`).toBe(hit);
    }
  });

  it.each([0.05, 0.25])('a %f s frame at top speed cannot pass through a needle', dt => {
    const game = flat(running());
    game.y = 10; game.speed = TUNE.CAP_MAX;
    const at = game.dist + 3;
    game.world.surface = (_x: number, d: number) => (d > at && d < at + 2.5 ? 50 : 0);
    game.step(dt, CENTRE);
    expect(game).toMatchObject({ state: 'over', cause: 'IMPACT' });
  });

  it('decides a gate where the ship crossed it, even inside one slow frame', () => {
    // Sliding sideways at full speed, both gates are crossed early in a 100 ms frame.
    const game = flat(running());
    game.x = 0; game.y = 30; game.vx = TUNE.VX; game.speed = TUNE.CAP0;
    const end = TUNE.VX * 0.1;
    // Inside this ring at the crossing, outside it by the frame's end.
    const threaded = gateAt(game, 0.5, 0.4, 30);
    // Outside this ring at the crossing, at its centre by the frame's end.
    const missed = gateAt(game, 0.6, end + 0.1, 30);
    game.step(0.1, { x: 1, y: 0 });
    expect(game.x).toBeCloseTo(end, 5);
    expect(Math.abs(game.x - threaded.x)).toBeGreaterThan(TUNE.PASS_R);
    expect(Math.abs(game.x - missed.x)).toBeLessThan(TUNE.PASS_R);
    expect([threaded.state, missed.state]).toEqual([1, 2]);
    expect(game).toMatchObject({ chain: 0, threaded: 1 });
  });
});

describe('steering', () => {
  it('ramps a key from a nudge to full stick, lets go quickly, and restarts on a reversal', () => {
    const axis = createKeyAxis({ negative: CONTROL.KEY_CLIMB });
    expect(axis.step(1 / 60, 0)).toBe(0);
    expect(axis.step(1 / 60, 1)).toBe(CONTROL.KEY.start);
    expect(axis.step(0, 1)).toBe(CONTROL.KEY.start); // a frame of no time changes nothing
    let seconds = 0;
    while (axis.step(1 / 240, 1) < 1) seconds += 1 / 240;
    expect(seconds).toBeCloseTo(CONTROL.KEY.ramp, 1);
    expect(axis.step(1, 1)).toBe(1); // never past full, however long the frame
    seconds = 0;
    while (axis.step(1 / 240, 0) > 0) seconds += 1 / 240;
    expect(seconds).toBeCloseTo(CONTROL.KEY_RELEASE, 1);
    for (let i = 0; i < 30; i++) axis.step(1 / 60, 1);
    // No carry-over through a reversal, and each direction keeps its own ramp.
    expect(axis.step(1 / 60, -1)).toBe(-CONTROL.KEY_CLIMB.start);
    seconds = 0;
    while (axis.step(1 / 240, -1) > -1) seconds += 1 / 240;
    expect(seconds).toBeCloseTo(CONTROL.KEY_CLIMB.ramp, 1);
    axis.reset();
    expect(axis.step(0, 0)).toBe(0);
  });

  it('softens a pointer stick near the centre and keeps its ends', () => {
    expect([curve(0), curve(1), curve(-1)]).toEqual([0, 1, -1]);
    expect(curve(0.5)).toBeCloseTo(0.5 ** CONTROL.POINTER_CURVE, 12);
    expect(curve(-0.5)).toBeCloseTo(-curve(0.5), 12);
    for (let s = 0.05; s < 1; s += 0.05) expect(curve(s)).toBeLessThan(s);
  });

  it.each([[1, 'wide'], [3, 'narrow'], [9, 'narrow, top speed, heaviest drain']])(
    'a player on the keys can follow the free lane through the lap %i city (%s)', lap => {
      // Arrow keys only, pressed as a person would: they see the next free lane,
      // decide, and their fingers act 150 ms later. No look at anything else.
      const REACTION = 9; // frames at 60 Hz
      for (let seed = 1; seed <= 40; seed++) {
        const game = running(seed);
        game.gates.length = 0;
        const ordinal = (lap - 1) * SECTORS.length + CITY;
        game.world.restartAt(game.dist - ordinal * SPAN - 10); // the city of that lap starts here
        const rows = game.world.cityRows(ordinal);
        game.x = laneX(rows[0].corridor); game.y = 4; game.vx = game.vy = 0;
        game.runTime = TUNE.GRACE; game.speed = TUNE.CAP_MAX; // capped to the lap's top speed
        const keys = createKeyAxis(), decided: number[] = [];
        while (game.state === 'play' && game.dist < rows[rows.length - 1].d + 20) {
          // The free lane changes at most every second row; aim for the one after the row being entered.
          const next = rows.find((row: any) => row.d - 12 > game.dist);
          const aim = next ? rows[Math.min(rows.length - 1, next.k + next.k % 2)] : rows[rows.length - 1];
          const gap = laneX(aim.corridor) - (game.x + game.vx * 0.3);
          decided.push(Math.abs(gap) > 3 ? Math.sign(gap) : 0);
          const held = decided.length > REACTION ? decided[decided.length - 1 - REACTION] : 0;
          game.charge = TUNE.CHARGE; // watch the steering, not the clock
          game.step(1 / 60, { x: keys.step(1 / 60, held), y: 0.3 });
        }
        expect(game.state, `lap ${lap}, seed ${seed}, row ${rows.find((row: any) => row.d + 12 > game.dist)?.k}`).toBe('play');
        expect(game.lap).toBe(lap);
        expect(game.low).toBe(true); // between the towers, not over them
      }
    });
});

describe('the world', () => {
  it('keeps a way through every city: consecutive rows share a free lane', () => {
    const freeLanes = (row: { towers: { lane: number }[] }) =>
      Array.from({ length: LANES }, (_, lane) => lane).filter(lane => !row.towers.some(t => t.lane === lane));
    const averages: number[] = [];
    for (const lap of [1, 2, 3, 4, 6]) {
      let free = 0, count = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const world = createWorld(mulberry32(seed * 31 + lap));
        world.reseed();
        const ordinal = (lap - 1) * SECTORS.length + CITY;
        const rows = world.cityRows(ordinal);
        expect(world.cityRows(ordinal)).toBe(rows);
        rows.forEach((row: any, k: number) => {
          expect(row.d).toBe(ordinal * SPAN + 80 + k * ROW_D);
          expect(row.d + 10).toBeLessThan((ordinal + 1) * SPAN - BLEND);
          expect(row.towers.some((t: any) => t.lane === row.corridor)).toBe(false);
          for (const tower of row.towers) {
            expect(Math.abs(tower.x - laneX(tower.lane)) + tower.w / 2).toBeLessThanOrEqual(LANE_W / 2);
            expect(tower.h).toBeLessThan(TUNE.CEILING - 10);
          }
          if (k > 0) {
            expect(freeLanes(row).filter(lane => freeLanes(rows[k - 1]).includes(lane)).length).toBeGreaterThan(0);
            // Precisely: this row's free lane is also open in the row before it, one step away at most.
            expect(freeLanes(rows[k - 1])).toContain(row.corridor);
            expect(Math.abs(row.corridor - rows[k - 1].corridor)).toBeLessThanOrEqual(k % 2 ? 0 : 1);
          }
          if (k >= 2) { free += freeLanes(row).length; count++; }
        });
      }
      averages.push(free / count);
    }
    // Later laps leave less room.
    expect(averages[0]).toBeGreaterThan(averages[2]);
    expect(averages[2]).toBeGreaterThan(averages[4]);
  });

  it('leaves no straight line through a city at low height, on any lap', () => {
    // Flying low pays triple; it must not be free. Whatever line a ship holds
    // without steering, some tower of the city stands on it.
    for (const lap of [1, 2, 3, 5, 9]) {
      for (let seed = 1; seed <= 150; seed++) {
        const world = createWorld(mulberry32(seed * 17 + lap));
        world.reseed();
        const rows = world.cityRows((lap - 1) * SECTORS.length + CITY);
        for (let x = -HALF; x <= HALF; x += 0.25) {
          const blocked = rows.some((row: any) => row.towers.some((t: any) => Math.abs(x - t.x) < t.w / 2 + TUNE.HULL));
          if (!blocked) expect.fail(`lap ${lap}, seed ${seed}: x = ${x} is open through the whole city`);
        }
      }
    }
    // And in the game itself: the seed and line a reviewer flew straight through.
    for (const [seed, x] of [[36, 0], [36, 10], [1, -60], [7, 20], [12, -30]]) {
      const game = running(seed);
      game.gates.length = 0;
      game.world.restartAt(game.dist - SPAN - 10); // the lap 1 city starts here
      game.x = x; game.y = 4; game.vx = game.vy = 0; game.runTime = TUNE.GRACE;
      const end = game.world.cityRows(CITY)[26].d + 20;
      while (game.state === 'play' && game.dist < end) { game.charge = TUNE.CHARGE; game.step(1 / 60, CENTRE); }
      expect(game, `seed ${seed}, x ${x}`).toMatchObject({ state: 'over', cause: 'IMPACT', sector: CITY });
    }
  });

  it('stands every gate clear of the ground, inside the track, and on the free lane in the city', () => {
    for (const seed of [1, 2, 3]) {
      const game = running(seed);
      const seen = new Map<number, any>();
      let cityGates = 0;
      while (game.lap === 1 && game.state === 'play') {
        game.charge = TUNE.CHARGE;
        game.step(1 / 30, UP);
        for (const gate of game.gates) {
          if (seen.has(gate.id)) continue;
          seen.set(gate.id, gate);
          const info = game.world.sectorAt(gate.d);
          expect(Math.abs(gate.x)).toBeLessThanOrEqual(HALF - 12);
          expect(gate.y).toBeLessThan(TUNE.CEILING);
          // The whole ring is above the ground it stands on, through a full swell.
          expect(ringClearance(game, gate), `${SECTORS[info.index]} at ${gate.d}`).toBeGreaterThan(0.5);
          if (info.index === CITY && info.blend === 0) {
            // In the city the gates mark the way through: each stands on the free
            // lane of the nearest row, also just before the first and after the last.
            const rows = game.world.cityRows(info.ordinal);
            const nearest = rows.reduce((a: any, b: any) => (Math.abs(b.d - gate.d) < Math.abs(a.d - gate.d) ? b : a));
            expect(gate.x).toBe(laneX(nearest.corridor));
            cityGates++;
          }
        }
      }
      expect(cityGates).toBeGreaterThan(5);
      const sectors = new Set([...seen.values()].map(gate => game.world.sectorAt(gate.d).index));
      expect([...sectors].sort()).toEqual([0, CITY, SEA, SHARDS]);
      // The sea packs its gates closer than the land does.
      const gaps = (index: number) => {
        const gates = [...seen.values()].filter(gate => {
          const info = game.world.sectorAt(gate.d);
          return info.index === index && info.blend === 0;
        });
        return (gates[gates.length - 1].d - gates[0].d) / (gates.length - 1);
      };
      expect(gaps(SEA)).toBeLessThan(gaps(SHARDS) * 0.75);
    }
  });

  it('makes each run cross different ground', () => {
    const a = running(1), b = running(2);
    const heights = (game: ReturnType<typeof createGame>) =>
      Array.from({ length: 20 }, (_, i) => game.world.surface(0, game.dist + i * 20, 0));
    expect(heights(a)).not.toEqual(heights(b));
  });
});

describe('the view', () => {
  const renderer = { render() {} };
  const mountView = (seed = 1) => {
    const game = createGame({ random: mulberry32(seed) });
    const view = createView({ THREE, createShipBody, game, aspect: 16 / 9 });
    const frame = (dt = 1 / 60, stick = CENTRE) => { game.step(dt, stick); view.render(renderer, dt); };
    const terrain = view.scene.children.find((child: any) => child.isMesh && child.material.wireframe) as any;
    /** Largest gap between the drawn grid and the surface the ship collides with. */
    const terrainError = () => {
      const position = terrain.geometry.attributes.position, index = terrain.geometry.index;
      const surface = (x: number, z: number) => game.world.surface(x, game.dist - (terrain.position.z + z), game.time);
      let error = 0;
      for (let i = 0; i < position.count; i++) {
        error = Math.max(error, Math.abs(position.getY(i) - surface(position.getX(i), position.getZ(i))));
      }
      // Inside the drawn triangles too: the cells must be split on the collision surface's diagonal.
      for (let face = 0; face < index.count; face += 3 * 7) {
        const [a, b, c] = [0, 1, 2].map(k => index.getX(face + k));
        for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.45, 0.45, 0.1], [0.1, 0.45, 0.45], [0.45, 0.1, 0.45]]) {
          const at = (get: 'getX' | 'getY' | 'getZ') => position[get](a) * wa + position[get](b) * wb + position[get](c) * wc;
          error = Math.max(error, Math.abs(at('getY') - surface(at('getX'), at('getZ'))));
        }
      }
      return error;
    };
    /** Fly at the ceiling, charge held full, until the ship is `p` into a sector. */
    const flyTo = (sector: number, p: number) => {
      for (let i = 0; i < 20000; i++) {
        const info = game.world.sectorAt(game.dist);
        if (info.index === sector && info.p >= p) return;
        game.charge = TUNE.CHARGE;
        frame(1 / 15, UP);
      }
      throw new Error('never reached the sector');
    };
    return { game, view, frame, terrain, terrainError, flyTo };
  };

  it('draws exactly the surface the ship collides with, through streaming, the sea and a retry', () => {
    const { game, frame, terrain, terrainError, flyTo } = mountView(2);
    for (let i = 0; i < 240; i++) frame(); // title glide
    expect(terrainError()).toBeLessThan(1e-3);
    game.press();
    for (let i = 0; i < 120; i++) frame(1 / 20, UP);
    expect(terrainError()).toBeLessThan(1e-3);

    // On land a frame that exposes no new row uploads nothing.
    const position = terrain.geometry.attributes.position;
    const version = position.version;
    frame(0, UP);
    expect(position.version).toBe(version);

    flyTo(SEA, 400);
    expect(terrainError()).toBeLessThan(1e-3);
    const swell = position.getY(position.count - 1);
    frame(0, UP); // no travel: the same rows
    game.time += 1; frame(0, UP);
    expect(position.getY(position.count - 1)).not.toBeCloseTo(swell, 2);
    expect(terrainError()).toBeLessThan(1e-3);

    game.y = -100; frame(); // crash and retry: a new world
    expect(game.state).toBe('over');
    game.step(TUNE.LOCK + 0.01, CENTRE);
    game.press(); frame();
    expect(game.dist).toBeLessThan(2);
    expect(terrainError()).toBeLessThan(1e-3);
  });

  it('draws each city row from its towers', () => {
    const { game, view, frame, flyTo } = mountView(3);
    game.press();
    flyTo(CITY, 300);
    const matrix = new THREE.Matrix4();
    let rows = 0;
    for (const group of view.scene.children as any[]) {
      if (!group.isGroup || !group.visible || !group.children[0]?.isInstancedMesh) continue;
      const row = game.world.rowsNear(game.dist - group.position.z, 0.01)[0];
      expect(row).toBeDefined();
      const [faces, lines] = group.children;
      expect(faces.count).toBe(row.towers.length);
      expect(lines.geometry.drawRange.count).toBe(row.towers.length * 24);
      row.towers.forEach((tower: any, i: number) => {
        faces.getMatrixAt(i, matrix);
        const e = matrix.elements;
        expect([e[12], e[13], e[14], e[0], e[5], e[10]].map(v => +v.toFixed(3)))
          .toEqual([tower.x, tower.h / 2, 0, tower.w, tower.h, tower.depth].map(v => +v.toFixed(3)));
      });
      rows++;
    }
    expect(rows).toBeGreaterThan(8);
    frame();
  });

  it('allocates nothing on a retry and releases everything on dispose', () => {
    // Record every disposable three.js object the view (and the ship factory) constructs,
    // whether or not it is in the scene at the moment we look.
    const made: any[] = [];
    const tracked: Record<string, any> = { ...THREE };
    for (const [name, value] of Object.entries(THREE) as [string, any][]) {
      if (typeof value !== 'function' || typeof value.prototype?.dispose !== 'function') continue;
      tracked[name] = class extends value { constructor(...args: any[]) { super(...args); made.push(this); } };
    }
    const game = createGame({ random: mulberry32(4) });
    const view = createView({ THREE: tracked as typeof THREE, createShipBody, game, aspect: 16 / 9 });
    const frame = (dt = 1 / 60, stick = CENTRE) => { game.step(dt, stick); view.render(renderer, dt); };
    const dieAt = (sector: number) => {
      for (let i = 0; i < 20000; i++) {
        const info = game.world.sectorAt(game.dist);
        if (info.index === sector && info.p >= 150) break;
        game.charge = TUNE.CHARGE;
        frame(1 / 15, UP);
      }
      game.y = -100; frame();
      expect(game.state).toBe('over');
      game.step(TUNE.LOCK + 0.01, CENTRE);
      expect(game.press()).toBe(true);
      frame();
    };
    const objects = () => { let count = 0; view.scene.traverse(() => count++); return count; };

    frame();
    const created = made.length, inScene = objects();
    expect(created).toBeGreaterThan(20);
    game.press();
    for (const sector of [CITY, SEA, CITY, SHARDS, CITY, 0]) dieAt(sector);
    expect(made.length).toBe(created);
    expect(objects()).toBe(inScene);

    let released = 0;
    for (const resource of made) resource.addEventListener('dispose', () => released++);
    view.dispose();
    expect(released).toBe(made.length);
    expect(view.scene.children.length).toBe(0);
  });

  it.each([[1440, 900], [390, 844]])('keeps the ship well inside a %i x %i screen through hard turns and climbs', (width, height) => {
    const { game, view, frame } = mountView(5);
    view.resize(width, height);
    game.press();
    game.runTime = TUNE.GRACE;
    const spot = new THREE.Vector3();
    let widest = 0, tallest = 0;
    // Slam the stick from corner to corner: the camera lags, the ship must not leave.
    for (let i = 0; i < 600; i++) {
      const turn = Math.floor(i / 75) % 2 ? 1 : -1;
      game.charge = TUNE.CHARGE;
      game.world.surface = () => 0; // the track is not the subject here
      game.y = Math.max(game.y, 10);
      frame(1 / 60, { x: turn, y: turn });
      view.camera.updateMatrixWorld();
      spot.set(game.x, game.y, 0).project(view.camera);
      widest = Math.max(widest, Math.abs(spot.x));
      tallest = Math.max(tallest, Math.abs(spot.y));
    }
    expect(game.state).toBe('play');
    expect(widest).toBeGreaterThan(0.15); // it does lag: the turn reads on screen
    expect(widest).toBeLessThan(0.7);
    expect(tallest).toBeLessThan(0.7); // 0.78 without the vertical limit
  });

  it('widens the view on an upright phone', () => {
    const { view, frame } = mountView(5);
    frame();
    const wide = view.camera.fov;
    view.resize(390, 844);
    frame();
    expect(view.camera.aspect).toBeCloseTo(390 / 844);
    expect(view.camera.fov).toBeGreaterThan(wide + 10);
  });
});

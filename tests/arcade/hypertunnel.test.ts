import { describe, expect, it } from 'vitest';
import * as THREE from '../../public/arcade/vendor/three.module.min.js';
import { createShipBody } from '../../public/arcade/shared/ship.js';
import { CONTROL, chase, createKeyAxis, pointerAngle } from '../../public/arcade/tunnel/controls.js';
import {
  AHEAD, BEST_KEY, BROKEN, HIT, PASSED, PERFECT, TUNE, createGame, meet, turn,
} from '../../public/arcade/tunnel/game.js';
import { RING_POOL, SHIP_Z, createView } from '../../public/arcade/tunnel/view.js';
import {
  PATTERNS, SHIP, TAU, TUNNEL, createWorld, depthSpec, gapAngle, mulberry32, reach, wrap,
} from '../../public/arcade/tunnel/world.js';

type Game = ReturnType<typeof createGame>;
type Ring = Game['rings'][number];
const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, String(value)); },
  };
};
const START = -Math.PI / 2;

/** A run that has just begun. */
function running(seed = 1, storage: ReturnType<typeof memory> | null = null) {
  const game = createGame({ random: mulberry32(seed), storage });
  game.press();
  return game;
}
const nextRing = (game: Game) => game.rings.find(ring => ring.state === AHEAD)!;
/** Where the ring's gap will be as the ship arrives. */
const gapAt = (ring: Ring, gap = 0) => gapAngle(ring, ring.section.gaps[gap], ring.at);
/** Put the ship `offset` from the centre of the next ring's gap, hands off, and fly through it. */
function cross(game: Game, offset = 0, gap = 0) {
  const ring = nextRing(game);
  game.angle = gapAt(ring, gap) + offset; game.spin = 0;
  while (ring.state === AHEAD && game.state === 'play') game.step(1 / 60, 0);
  return ring;
}
/** Half a turn from the wide gap is wall in every pattern. */
const WALL = Math.PI;
/** A whole tunnel, section by section. */
function tunnel(seed: number) {
  const world = createWorld(mulberry32(seed));
  world.reseed(START);
  return Array.from({ length: TUNNEL.DEPTHS }, () => world.next());
}
const safe = (gap: { width: number }) => gap.width / 2 - SHIP.HULL;

describe('the tunnel', () => {
  it('escalates by depth and reaches every limit at the last one', () => {
    expect(depthSpec(1)).toMatchObject({ speed: 58, gap: 1.17 });
    expect(depthSpec(1).beat).toBeCloseTo(1.7, 9);
    expect(depthSpec(2).speed).toBe(65);
    expect(depthSpec(2).gap).toBeCloseTo(1.11, 9);
    for (let depth = 2; depth <= TUNNEL.DEPTHS + 5; depth++) {
      const now = depthSpec(depth), before = depthSpec(depth - 1);
      expect(now.speed).toBeGreaterThanOrEqual(before.speed);
      expect(now.gap).toBeLessThanOrEqual(before.gap);
      expect(now.beat).toBeLessThanOrEqual(before.beat);
      expect(now.rotor).toBeGreaterThanOrEqual(before.rotor);
    }
    // The tunnel ends on the first depth at which nothing is left to tighten.
    expect(depthSpec(TUNNEL.DEPTHS)).toMatchObject({ speed: 110, gap: 0.7 });
    expect(depthSpec(TUNNEL.DEPTHS).beat).toBeCloseTo(1.1, 9);
    expect(depthSpec(TUNNEL.DEPTHS + 5)).toEqual(depthSpec(TUNNEL.DEPTHS));
    const early = depthSpec(TUNNEL.DEPTHS - 1);
    expect(early.speed < 110 || early.beat > 1.1 + 1e-9).toBe(true);
  });

  it('puts pressure on inside 20 s and gets visibly harder every section', () => {
    // The user, after playing the first tuning: "its too easy at the start and,
    // it takes too long for the difficulty to increase". The run opens where the
    // first tuning's fourth depth was, and climbs about every ten seconds.
    const first = depthSpec(1);
    expect(first.speed).toBeGreaterThanOrEqual(55);
    expect(first.gap).toBeLessThanOrEqual(1.2);
    expect(first.beat).toBeLessThanOrEqual(1.75);
    for (let seed = 1; seed <= 60; seed++) {
      const sections = tunnel(seed);
      // At least nine rings inside the first 20 s, and the second pattern started.
      expect(sections.flatMap(section => section.rings).filter(ring => ring.at <= 20).length).toBeGreaterThanOrEqual(9);
      expect(sections[1].rings[0].at).toBeLessThan(15);
      sections.forEach((section, index) => {
        if (index === 0) return;
        const before = sections[index - 1];
        // A new depth every 12 s or sooner...
        expect(section.rings[0].at - before.rings[0].at).toBeLessThan(12 * (section.pattern === 'PINCH' || before.pattern === 'PINCH' ? 1.4 : 1));
        // ...and every one faster than the last, until the cap.
        if (before.speed < TUNNEL.SPEED_MAX) expect(section.speed - before.speed).toBeGreaterThanOrEqual(3);
        // Narrower and closer too, until their limits.
        const now = depthSpec(section.depth), then = depthSpec(before.depth);
        if (then.gap > TUNNEL.GAP_MIN) expect(then.gap - now.gap).toBeGreaterThanOrEqual(0.01);
        if (then.beat > TUNNEL.BEAT_MIN) expect(then.beat - now.beat).toBeGreaterThan(0.05);
      });
      // A full clear takes about a minute and a half.
      expect(sections.at(-1)!.tEnd).toBeGreaterThan(80);
      expect(sections.at(-1)!.tEnd).toBeLessThan(100);
    }
  });

  it('puts the first ring within 2.5 s, its gap where the ship already is', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const [first] = tunnel(seed);
      expect(first.rings[0].at).toBeLessThanOrEqual(2.5);
      expect(first.rings[0].d).toBeCloseTo(first.speed * first.rings[0].at, 9);
      expect(first.rings[0].cross).toBe(START);
    }
  });

  it('is cut into sections of ten rings with a clear stretch and a speed step between them', () => {
    const sections = tunnel(7);
    sections.forEach((section, index) => {
      expect(section.rings).toHaveLength(TUNNEL.RINGS);
      expect(section.depth).toBe(index + 1);
      expect(section.speed).toBe(depthSpec(index + 1).speed);
      section.rings.forEach((ring, i) => {
        expect(ring.last).toBe(i === TUNNEL.RINGS - 1);
        expect(ring.id).toBe(index * TUNNEL.RINGS + i);
        if (i > 0) {
          const before = section.rings[i - 1];
          expect(ring.at - before.at).toBeCloseTo(section.beat, 9);
          expect(ring.d - before.d).toBeCloseTo(section.speed * section.beat, 9);
        }
      });
      if (index === 0) return;
      const before = sections[index - 1];
      expect(section.speed).toBeGreaterThan(before.speed - 1e-9);
      // The stretch is flown at the new speed: a beat, and 1.5 s more.
      expect(section.rings[0].at - before.tEnd).toBeCloseTo(TUNNEL.CLEAR + section.beat, 9);
      expect(section.rings[0].d - before.end).toBeCloseTo(section.speed * (TUNNEL.CLEAR + section.beat), 9);
    });
  });

  it('opens with SPIRAL, then ZIGZAG, then a shuffle that is seeded and never repeats a pattern', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const names = tunnel(seed).map(section => section.pattern);
      expect(names.slice(0, 2)).toEqual(['SPIRAL', 'ZIGZAG']);
      for (let i = 1; i < names.length; i++) expect(names[i]).not.toBe(names[i - 1]);
      // The five depths after the opening hold each pattern once, and the rest draw a new bag.
      expect([...names.slice(2, 7)].sort()).toEqual([...PATTERNS].sort());
      expect(new Set(names.slice(7)).size).toBe(names.length - 7);
      expect(tunnel(seed).map(section => section.pattern)).toEqual(names);
      seen.add(names.join());
    }
    expect(seen.size).toBeGreaterThan(30);
  });

  it('draws each pattern as the title promises', () => {
    const found = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      for (const section of tunnel(seed)) {
        const { rings, gaps, pattern } = section;
        const spec = depthSpec(section.depth);
        const moves = rings.slice(1).map((ring, i) => ring.cross - rings[i].cross);
        found.add(pattern);
        if (pattern === 'SPIRAL') {
          // The rhythm section: each gap the same angle on from the last.
          for (const move of moves) expect(move).toBeCloseTo(moves[0], 9);
          expect(Math.abs(moves[0])).toBeGreaterThan(0.7);
        } else if (pattern === 'ZIGZAG') {
          // Two sides, turn about.
          for (let i = 2; i < rings.length; i++) expect(rings[i].cross).toBeCloseTo(rings[i - 2].cross, 9);
          expect(Math.abs(moves[0])).toBeGreaterThan(safe(gaps[0]) * 2); // staying put is not a way through
        } else if (pattern === 'ROTOR') {
          for (const ring of rings) expect(Math.abs(ring.spin)).toBe(spec.rotor);
          for (let i = 1; i < rings.length; i++) expect(rings[i].spin).toBe(-rings[i - 1].spin);
        } else if (pattern === 'PINCH') {
          // Narrow gaps, wide spacing.
          expect(gaps[0].width).toBeLessThan(spec.gap);
          expect(section.beat).toBeCloseTo(spec.beat * TUNNEL.PINCH_BEAT, 9);
        } else {
          // TWIN: a wide gap and a narrow one whose whole width is PERFECT.
          expect(gaps).toHaveLength(2);
          expect(gaps[0].width).toBe(spec.gap);
          expect(gaps[1].width).toBeLessThan(gaps[0].width);
          expect(gaps[1].perfect).toBeCloseTo(safe(gaps[1]), 9);
          const between = Math.abs(gaps[1].offset) - (gaps[0].width + gaps[1].width) / 2;
          expect(between).toBeGreaterThanOrEqual(TUNNEL.WALL - 1e-9);
        }
        if (pattern !== 'ROTOR') for (const ring of rings) expect(ring.spin).toBe(0);
        if (pattern !== 'TWIN') expect(gaps).toHaveLength(1);
        if (pattern !== 'PINCH' && pattern !== 'TWIN') expect(gaps[0].width).toBe(spec.gap);
      }
    }
    expect([...found].sort()).toEqual([...PATTERNS].sort());
  });

  it('shows every pattern at depth 1 behind the title, without end', () => {
    const world = createWorld(mulberry32(2));
    world.reseed(0, true);
    const sections = Array.from({ length: 40 }, () => world.next());
    expect(sections.every(section => section.depth === 1 && section.speed === TUNNEL.SPEED0)).toBe(true);
    expect(sections.slice(0, 5).map(section => section.pattern)).toEqual(PATTERNS);
  });
});

describe('the PERFECT zone', () => {
  const EDGE = 1e-9;
  it('is the middle third of a gap; the rest of the gap is safe; past the hull margin is a hit', () => {
    for (const depth of [1, 2, 5, TUNNEL.DEPTHS]) {
      const section = tunnel(3)[depth - 1];
      const ring = section.rings[4], [gap] = section.gaps;
      const centre = gapAt(ring);
      const at = (offset: number) => meet(ring, centre + offset, ring.at);
      if (section.pattern !== 'TWIN') expect(gap.perfect * 2).toBeCloseTo(gap.width / 3, 9);
      for (const side of [-1, 1]) {
        expect(at(0)).toBe(PERFECT);
        expect(at(side * (gap.perfect - EDGE))).toBe(PERFECT);
        expect(at(side * (gap.perfect + EDGE))).toBe(PASSED);
        expect(at(side * (safe(gap) - EDGE))).toBe(PASSED);
        expect(at(side * (safe(gap) + EDGE))).toBe(HIT);
        expect(at(side * gap.width / 2)).toBe(HIT); // the hull is wider than a point
      }
      // A whole turn round is the same place.
      expect(meet(ring, centre + TAU * 3, ring.at)).toBe(PERFECT);
      expect(at(WALL)).toBe(HIT);
    }
  });

  it("is the whole of TWIN's narrow gap", () => {
    const section = tunnel(3).find(candidate => candidate.pattern === 'TWIN')!;
    const ring = section.rings[2], narrow = section.gaps[1];
    const centre = gapAt(ring, 1);
    for (const side of [-1, 1]) {
      expect(meet(ring, centre + side * (safe(narrow) - EDGE), ring.at)).toBe(PERFECT);
      expect(meet(ring, centre + side * (safe(narrow) + EDGE), ring.at)).toBe(HIT);
    }
    // The wide gap beside it keeps its middle third.
    expect(meet(ring, gapAt(ring, 0) + section.gaps[0].perfect + EDGE, ring.at)).toBe(PASSED);
  });

  it('turns with a rotor: the gap is judged where it is at that moment', () => {
    const section = tunnel(3).find(candidate => candidate.pattern === 'ROTOR')!;
    const ring = section.rings[1], [gap] = section.gaps;
    expect(meet(ring, ring.cross, ring.at)).toBe(PERFECT);
    const early = ring.at - 1;
    expect(gapAngle(ring, gap, early)).toBeCloseTo(ring.cross - ring.spin, 9);
    expect(meet(ring, ring.cross - ring.spin, early)).toBe(PERFECT);
    // A second before, the gap had not yet come round to where it will be crossed.
    expect(meet(ring, ring.cross + Math.sign(ring.spin) * safe(gap), early)).toBe(HIT);
  });
});

describe('chain, shield and score', () => {
  it('pays 10 × (1 + chain) a ring, the chain counted after the ring', () => {
    const game = running(4);
    const [gap] = nextRing(game).section.gaps;
    expect(cross(game).state).toBe(PERFECT);
    expect(game).toMatchObject({ chain: 1, score: 20, passed: 1 });
    cross(game); cross(game);
    expect(game).toMatchObject({ chain: 3, score: 20 + 30 + 40 });
    expect(game.payout.points).toBe(40);
    // Through the gap but off centre: safe, and the chain is gone.
    expect(cross(game, gap.perfect + 0.05).state).toBe(PASSED);
    expect(game).toMatchObject({ chain: 0, score: 100, bestChain: 3, passed: 4, state: 'play' });
    cross(game);
    expect(game).toMatchObject({ chain: 1, score: 120, bestChain: 3 });
  });

  it('charges one shield for five perfects in a row, and never holds two', () => {
    const game = running(4);
    for (let i = 1; i <= 4; i++) { cross(game); expect(game.shield).toBe(false); }
    cross(game);
    expect(game).toMatchObject({ chain: 5, shield: true });
    expect(game.charged).toBeCloseTo(game.time, 1);
    const charged = game.charged;
    for (let i = 0; i < 9; i++) cross(game);
    expect(game).toMatchObject({ chain: 14, shield: true, charged });
    // A broken chain keeps the shield it earned.
    cross(game, nextRing(game).section.gaps[0].perfect + 0.03);
    expect(game).toMatchObject({ chain: 0, shield: true });
  });

  it('spends the shield on one hit, which resets the chain and pays nothing', () => {
    const game = running(4);
    for (let i = 0; i < 6; i++) cross(game);
    const score = game.score, passed = game.passed;
    const broken = cross(game, WALL);
    expect(broken.state).toBe(BROKEN);
    expect(game).toMatchObject({ state: 'play', shield: false, chain: 0, score, passed, bestChain: 6 });
    expect(game.broke).toBeCloseTo(broken.at, 6);
    // Four perfects are not five.
    for (let i = 0; i < 4; i++) cross(game);
    expect(game.shield).toBe(false);
    cross(game, WALL);
    expect(game).toMatchObject({ state: 'over', cause: 'WRECKED' });
  });

  it('charges the shield again after it is spent', () => {
    const game = running(4);
    for (let i = 0; i < 5; i++) cross(game);
    cross(game, WALL);
    for (let i = 0; i < 5; i++) cross(game);
    expect(game).toMatchObject({ shield: true, chain: 5, state: 'play' });
  });

  it('ends the run on a hit with no shield', () => {
    const game = running(4);
    cross(game);
    const ring = cross(game, WALL);
    expect(ring.state).toBe(AHEAD);
    expect(game).toMatchObject({ state: 'over', cause: 'WRECKED', score: 20, chain: 1 });
  });

  it('pays 100 × the section number for finishing a section, then steps the depth and the speed', () => {
    const game = running(4);
    let rings = 0;
    for (let depth = 1; depth <= 4; depth++) {
      expect(game).toMatchObject({ depth, speed: depthSpec(depth).speed });
      const name = game.pattern;
      for (let i = 0; i < TUNNEL.RINGS; i++) {
        const before = game.score;
        const ring = cross(game);
        rings++;
        expect(ring.section.pattern).toBe(name);
        const paid = TUNE.POINTS * (1 + rings) + (ring.last ? TUNE.SECTION * depth : 0);
        expect(game.score - before).toBe(paid);
        expect(game.bonus.points).toBe(ring.last ? TUNE.SECTION * depth : TUNE.SECTION * (depth - 1));
      }
      expect(game.depth).toBe(depth + 1);
    }
    // A section finished on the shield still counts.
    const game2 = running(4);
    for (let i = 0; i < TUNNEL.RINGS - 1; i++) cross(game2);
    const before = game2.score;
    expect(cross(game2, WALL).state).toBe(BROKEN);
    expect(game2.score - before).toBe(TUNE.SECTION);
    expect(game2).toMatchObject({ depth: 2, state: 'play' });
  });

  it('flies each section at its own speed: every ring is met when the tunnel said it would be', () => {
    const game = running(6);
    for (let depth = 1; depth <= 4; depth++) {
      for (let i = 0; i < TUNNEL.RINGS; i++) {
        const speed = game.speed;
        const ring = cross(game);
        expect(ring.section.depth).toBe(depth);
        expect(speed).toBe(depthSpec(depth).speed);
        // Crossed within a frame of the time the ring was laid for: a rotor is
        // where its section planned it to be.
        expect(game.time - ring.at).toBeGreaterThanOrEqual(-1e-9);
        expect(game.time - ring.at).toBeLessThan(1 / 60 + 1e-9);
      }
    }
  });
});

describe('the end of the tunnel', () => {
  it('has a last depth: a perfect run ends CLEARED, and no run goes on for ever', () => {
    const game = running(8);
    let rings = 0, score = 0;
    while (game.state === 'play' && rings < 1000) {
      const ring = cross(game);
      rings++;
      score += TUNE.POINTS * (1 + rings) + (ring.last ? TUNE.SECTION * ring.section.depth : 0);
    }
    expect(rings).toBe(TUNNEL.DEPTHS * TUNNEL.RINGS);
    expect(game).toMatchObject({
      state: 'over', cause: 'CLEARED', depth: TUNNEL.DEPTHS, bestChain: rings, score, newBest: true,
    });
    // About a minute and a half, however it is flown: speed is set by depth, not by the pilot.
    expect(game.time).toBeGreaterThan(80);
    expect(game.time).toBeLessThan(100);
  });

  it('kills the hands-off run on the second ring', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const game = running(seed);
      while (game.state === 'play') game.step(1 / 60, 0);
      expect(game).toMatchObject({ cause: 'WRECKED', passed: 1, score: 20, depth: 1 });
      expect(game.time).toBeLessThan(4.5);
    }
  });

  it('kills the run that only ever holds one way, inside the first two sections', () => {
    for (const steer of [-1, 1]) {
      for (let seed = 1; seed <= 25; seed++) {
        const game = running(seed);
        while (game.state === 'play') game.step(1 / 60, steer);
        expect(game.cause).toBe('WRECKED');
        expect(game.depth).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe('a run from start to game over to retry', () => {
  it('flies itself behind the title without ever ending or scoring', () => {
    const game = createGame({ random: mulberry32(5) });
    expect(game.state).toBe('menu');
    let through = 0;
    const seen = new Set<Ring>();
    for (let i = 0; i < 60 * 240; i++) {
      game.step(1 / 60, null);
      for (const ring of game.rings) {
        if (ring.state === AHEAD || seen.has(ring)) continue;
        seen.add(ring);
        if (ring.state === PASSED) through++;
      }
    }
    expect(game).toMatchObject({ state: 'menu', score: 0, chain: 0, shield: false, depth: 1, speed: TUNNEL.SPEED0 });
    expect(game.dist).toBeGreaterThan(TUNNEL.SPEED0 * 230);
    // The title's pilot makes its gaps: the backdrop shows the game being played.
    expect(through / seen.size).toBeGreaterThan(0.97);
    expect(game.rings.length).toBeLessThan(40);
  });

  it('starts on a press, ends on a wall, locks, then retries in a fresh tunnel', () => {
    const storage = memory();
    const game = createGame({ random: mulberry32(5), storage });
    for (let i = 0; i < 200; i++) game.step(1 / 60, null);
    const angle = game.angle;
    expect(game.press()).toBe(true);
    expect(game).toMatchObject({ state: 'play', score: 0, chain: 0, shield: false, depth: 1, pattern: 'SPIRAL', dist: 0, time: 0, spin: 0 });
    // The run begins where the ship is, and its first gap is right there.
    expect(game.angle).toBe(angle);
    expect(nextRing(game).cross).toBe(angle);
    expect((nextRing(game).d - game.dist) / game.speed).toBeLessThanOrEqual(2.5);
    expect(game.press()).toBe(false); // a press mid-run is not a restart

    for (let i = 0; i < 7; i++) cross(game);
    cross(game, WALL); // the shield
    cross(game, WALL);
    expect(game).toMatchObject({ state: 'over', cause: 'WRECKED', newBest: true, best: game.score, bestChain: 7 });
    expect(storage.values.get(BEST_KEY)).toBe(String(game.score));
    const frozen = { dist: game.dist, score: game.score, angle: game.angle, time: game.time };
    game.step(1 / 60, 1);
    expect({ dist: game.dist, score: game.score, angle: game.angle, time: game.time }).toEqual(frozen);

    game.step(TUNE.LOCK / 2, 0);
    expect(game.press()).toBe(false);
    expect(game.state).toBe('over');
    const seed = game.world.seed, best = game.best;
    game.step(TUNE.LOCK / 2 + 0.01, 0);
    expect(game.press()).toBe(true);
    expect(game).toMatchObject({
      state: 'play', score: 0, chain: 0, bestChain: 0, shield: false, passed: 0, depth: 1, pattern: 'SPIRAL',
      dist: 0, time: 0, cause: '', newBest: false, best,
    });
    expect(game.world.seed).not.toBe(seed);
    expect(game.rings.every(ring => ring.state === AHEAD && ring.d > 0)).toBe(true);
    expect([game.payout.at, game.bonus.at, game.charged, game.broke]).toEqual(Array(4).fill(-Infinity));

    // A lower score does not claim the record.
    cross(game); cross(game, WALL);
    expect(game).toMatchObject({ state: 'over', score: 20, newBest: false, best });
    expect(storage.values.get(BEST_KEY)).toBe(String(best));
  });

  it('stands the first gap where a hand is already pointing, and the ship gets there first', () => {
    for (const aim of [START + Math.PI, START + 2, START - 2.5]) {
      const game = createGame({ random: mulberry32(5) });
      expect(game.press(aim)).toBe(true);
      const first = nextRing(game);
      expect(first.cross).toBe(aim);
      // The ship chases the aim as the mouse would lead it: there with time to spare.
      let arrived = 0;
      while (first.state === AHEAD && game.state === 'play') {
        game.step(1 / 60, chase(aim, game.angle));
        if (!arrived && Math.abs(wrap(aim - game.angle)) < first.section.gaps[0].perfect) arrived = game.time;
      }
      expect(first.state).toBe(PERFECT);
      expect(first.at - arrived).toBeGreaterThan(0.6);
    }
  });

  it('keeps the best under hypertunnel.best, and survives storage that is missing or broken', () => {
    const storage = memory();
    storage.values.set('ht_best', '99999'); // the old game's distance is not a score
    storage.values.set(BEST_KEY, '340.9');
    expect(BEST_KEY).toBe('hypertunnel.best');
    expect(createGame({ storage }).best).toBe(340);
    for (const junk of ['', 'abc', '-5', 'NaN', 'Infinity']) {
      storage.values.set(BEST_KEY, junk);
      expect(createGame({ storage }).best).toBe(0);
    }
    const broken = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
    };
    const game = createGame({ random: mulberry32(2), storage: broken });
    game.press();
    cross(game); cross(game, WALL);
    expect(game).toMatchObject({ state: 'over', best: 20, newBest: true });
    expect(createGame({ random: mulberry32(2) }).best).toBe(0);
  });
});

describe('slow frames', () => {
  /** A run in the last section, at top speed, with the next ring `ahead` units off. */
  function deep(pattern: string) {
    for (let seed = 1; seed < 200; seed++) {
      const game = running(seed);
      for (let i = 0; i < (TUNNEL.DEPTHS - 1) * TUNNEL.RINGS + 3; i++) cross(game);
      if (game.pattern !== pattern) continue;
      expect(game).toMatchObject({ state: 'play', depth: TUNNEL.DEPTHS, speed: 110 });
      game.shield = false;
      return game;
    }
    throw new Error('no such tunnel');
  }
  const approach = (game: Game, ahead: number) => {
    const ring = nextRing(game);
    while (ring.d - game.dist > ahead + game.speed / 60) game.step(1 / 60, 0);
    game.step((ring.d - game.dist - ahead) / game.speed, 0);
    expect(ring.d - game.dist).toBeCloseTo(ahead, 6);
    return ring;
  };

  it.each([1000 / 30, 50, 250])('catches a wall crossed whole in one %s ms frame at top speed', ms => {
    const game = deep('SPIRAL');
    const ring = approach(game, 1);
    game.angle = gapAt(ring) + WALL;
    game.step(ms / 1000, 0);
    expect(game).toMatchObject({ state: 'over', cause: 'WRECKED' });
    // The run stops at the wall, not a frame beyond it.
    expect(game.dist).toBeLessThan(ring.d + 1);
  });

  it.each([1000 / 30, 50, 250])('lets the ship through the gap on the same %s ms frame', ms => {
    const game = deep('SPIRAL');
    const ring = approach(game, 1);
    game.angle = gapAt(ring);
    game.step(ms / 1000, 0);
    expect(ring.state).toBe(PERFECT);
    expect(game.state).toBe('play');
    expect(game.dist).toBeCloseTo(ring.d - 1 + 110 * ms / 1000, 6);
  });

  it('takes the steering angle at the crossing, not at the end of the frame', () => {
    // Turning flat out, the ship covers 0.15 rad in a 50 ms frame. Either it is in
    // the gap as it crosses and in the wall's shadow by the end of the frame, or
    // the other way round. Only the crossing counts.
    for (const [inside, expected] of [[true, PASSED], [false, AHEAD]] as const) {
      const game = deep('SPIRAL');
      const ring = approach(game, 110 * 0.05 * 0.25);
      const [gap] = ring.section.gaps;
      const edge = gapAt(ring) + safe(gap);
      const crossing = { angle: 0, spin: SHIP.TURN };
      turn(crossing, 0.05 * 0.25, 1);
      const whole = { angle: 0, spin: SHIP.TURN };
      turn(whole, 0.05, 1);
      expect(whole.angle - crossing.angle).toBeGreaterThan(0.1);
      // At the crossing: a hair inside the gap's far edge, or a hair short of its near edge
      // on the way in.
      game.angle = inside ? edge - 0.004 - crossing.angle : gapAt(ring) - safe(gap) - 0.004 - crossing.angle;
      game.spin = SHIP.TURN;
      const start = game.angle;
      game.step(0.05, 1);
      const end = start + whole.angle;
      expect(meet(ring, end, ring.at) === HIT).toBe(inside); // the end of the frame says the opposite
      expect(ring.state).toBe(expected);
      expect(game.state).toBe(inside ? 'play' : 'over');
    }
  });

  it('takes a rotor where it is at the crossing, on a 50 ms frame', () => {
    for (const [inside, expected] of [[true, PASSED], [false, AHEAD]] as const) {
      const game = deep('ROTOR');
      const ring = approach(game, 110 * 0.05 * 0.2);
      const [gap] = ring.section.gaps;
      // A fast rotor, so the 40 ms after the crossing move the gap by more than the margin.
      ring.spin = Math.sign(ring.spin) * 6;
      const trailing = -Math.sign(ring.spin) * safe(gap);
      // The ship sits still: just inside the gap's trailing edge at the crossing,
      // or just beyond its leading edge. By the end of the frame the gap has
      // swept on, away from the first and over the second.
      game.angle = ring.cross + (inside ? trailing * 0.9 : -trailing * 1.1);
      game.spin = 0;
      const crossed = game.time + 0.05 * 0.2, end = game.time + 0.05;
      expect(meet(ring, game.angle, crossed) === HIT).toBe(!inside);
      expect(meet(ring, game.angle, end) === HIT).toBe(inside);
      game.step(0.05, 0);
      expect(ring.state).toBe(expected);
      expect(game.state).toBe(inside ? 'play' : 'over');
    }
  });

  it('decides every ring of a frame long enough to cross several', () => {
    const game = running(3);
    const first = nextRing(game), second = game.rings[game.rings.indexOf(first) + 1];
    // Spiral: the second gap is a step round from the first, so standing still makes one and not two.
    game.step(5, 0);
    expect(first.state).toBe(PERFECT);
    expect(second.state).toBe(AHEAD);
    expect(game).toMatchObject({ state: 'over', score: 20 });
    expect(game.dist).toBeLessThan(second.d + 1);
  });

  it('gives the same run at 30, 60 and 144 frames a second', () => {
    const results = [30, 60, 144].map(fps => {
      const game = running(11);
      const axis = createKeyAxis();
      let t = 0;
      // A scripted hand: hold toward the next gap until close, then let go.
      while (game.state === 'play' && t < 30) {
        const off = wrap(gapAt(nextRing(game)) - game.angle);
        const held = Math.abs(off) > 0.25 ? Math.sign(off) : 0;
        game.step(1 / fps, axis.step(1 / fps, held));
        t += 1 / fps;
      }
      return { state: game.state, passed: game.passed, depth: game.depth };
    });
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
    expect(results[0].state).toBe('play');
    expect(results[0].passed).toBeGreaterThan(12);
  });
});

describe('how the steering feels, in numbers', () => {
  const DT = 1 / 120;
  /** Hold one way for `seconds`, let go, and wait for the ship to settle. */
  function press(seconds: number, direction = 1, dt = DT) {
    const ship = { angle: 0, spin: 0 }, axis = createKeyAxis();
    let top = 0;
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      turn(ship, dt, axis.step(dt, direction));
      top = Math.max(top, Math.abs(ship.spin));
    }
    const let_go = ship.angle;
    for (let i = 0; i < 240; i++) turn(ship, dt, axis.step(dt, 0));
    expect(Math.abs(ship.spin)).toBeLessThan(1e-6);
    return { angle: ship.angle, coast: ship.angle - let_go, top };
  }
  const widest = depthSpec(1).gap, narrowest = depthSpec(TUNNEL.DEPTHS).gap;

  it('a key is not a full stick at once: it starts at a fifth and takes 0.35 s to build', () => {
    const axis = createKeyAxis();
    expect(axis.step(1e-6, 1)).toBeCloseTo(CONTROL.KEY.start, 4);
    for (let i = 0; i < 20; i++) axis.step(0.01, 1);
    expect(axis.step(1e-6, 1)).toBeCloseTo(CONTROL.KEY.start + 0.8 * 0.2 / 0.35, 3);
    for (let i = 0; i < 20; i++) axis.step(0.01, 1);
    expect(axis.step(0.01, 1)).toBe(1);
    // Letting go centres it in 60 ms; reversing starts over from the first nudge.
    expect(axis.step(0.03, 0)).toBeCloseTo(0.75, 9);
    expect(axis.step(0.03, 0)).toBeCloseTo(0.25, 9);
    expect(axis.step(0.03, 0)).toBe(0);
    for (let i = 0; i < 50; i++) axis.step(0.01, 1);
    expect(axis.step(1e-6, -1)).toBeCloseTo(-CONTROL.KEY.start, 4);
    axis.reset();
    expect(axis.step(1e-6, 0)).toBe(0);
  });

  it('a 100 ms tap is a nudge: 0.05 to 0.11 rad, inside the PERFECT zone of the narrowest gap', () => {
    const tap = press(0.1).angle;
    expect(tap).toBeGreaterThan(0.05);
    expect(tap).toBeLessThan(0.11);
    expect(tap).toBeLessThan(narrowest / 6);
    expect(press(0.1, -1).angle).toBeCloseTo(-tap, 9);
    // Less than a twelfth of the widest gap.
    expect(tap / widest).toBeLessThan(1 / 12);
  });

  it('a 300 ms hold is a short turn: 0.35 to 0.6 rad, short of the edge of the widest gap', () => {
    const hold = press(0.3).angle;
    expect(hold).toBeGreaterThan(0.35);
    expect(hold).toBeLessThan(0.6);
    expect(hold).toBeLessThan(widest / 2);
    expect(press(0.3, -1).angle).toBeCloseTo(-hold, 9);
  });

  it('crossing one gap width takes 0.55 to 0.85 s of holding, and letting go carries under 0.3 rad', () => {
    const ship = { angle: 0, spin: 0 }, axis = createKeyAxis();
    let seconds = 0;
    while (ship.angle < widest && seconds < 3) { turn(ship, DT, axis.step(DT, 1)); seconds += DT; }
    expect(seconds).toBeGreaterThan(0.55);
    expect(seconds).toBeLessThan(0.85);
    for (let i = 0; i < 240; i++) turn(ship, DT, axis.step(DT, 0));
    expect(ship.angle - widest).toBeLessThan(0.3);
    // Even from a flat-out turn, the ship stops inside a PINCH gap's safe half.
    expect(press(1.5).coast).toBeLessThan(0.3);
    expect(press(1.5).coast).toBeGreaterThan(0.15);
  });

  it('a held key reaches the full turn rate and no more, and a lap is a deliberate act', () => {
    const held = press(1.5);
    expect(held.top).toBeGreaterThan(SHIP.TURN * 0.97);
    expect(held.top).toBeLessThanOrEqual(SHIP.TURN);
    expect(TAU / SHIP.TURN).toBeGreaterThan(2);
    // Well under the old game's 4.2 rad/s, which was also a full stick at once.
    expect(SHIP.TURN).toBeLessThanOrEqual(3);
    const old = { angle: 0, spin: 0 };
    for (let t = 0; t < 0.1 - 1e-9; t += DT) { old.spin += (4.2 - old.spin) * Math.min(1, DT * 10); old.angle += old.spin * DT; }
    for (let i = 0; i < 240; i++) { old.spin += (0 - old.spin) * Math.min(1, DT * 10); old.angle += old.spin * DT; }
    expect(press(0.1).angle).toBeLessThan(old.angle / 3);
  });

  it('feels the same at 30, 60 and 144 frames a second', () => {
    for (const seconds of [0.1, 0.3, 1]) {
      const at120 = press(seconds).angle;
      for (const fps of [30, 60, 144]) {
        // A hold is a whole number of frames: compare like with like.
        const frames = Math.round(seconds * fps);
        expect(press(frames / fps, 1, 1 / fps).angle / press(frames / fps).angle).toBeGreaterThan(0.9);
        expect(press(frames / fps, 1, 1 / fps).angle / press(frames / fps).angle).toBeLessThan(1.1);
      }
      expect(at120).toBeGreaterThan(0);
    }
    // A steady stick turns the ship the same however the time is cut.
    const once = { angle: 0, spin: 0 }, cut = { angle: 0, spin: 0 };
    turn(once, 0.5, 0.6);
    for (let i = 0; i < 500; i++) turn(cut, 0.001, 0.6);
    expect(cut.angle).toBeCloseTo(once.angle, 9);
    expect(cut.spin).toBeCloseTo(once.spin, 9);
  });

  it('the mouse leads the ship without overshoot, at the same top rate as a key', () => {
    for (const [far, soonest, latest] of [[0.3, 0.25, 0.6], [1, 0.45, 0.85], [Math.PI - 0.01, 1.1, 1.6]]) {
      const ship = { angle: 0, spin: 0 };
      let arrived = 0, top = 0, peak = 0;
      for (let t = 0; t < 4; t += DT) {
        turn(ship, DT, chase(far, ship.angle));
        top = Math.max(top, ship.spin); peak = Math.max(peak, ship.angle);
        if (!arrived && far - ship.angle < 0.05) arrived = t;
      }
      expect(arrived).toBeGreaterThan(soonest);
      expect(arrived).toBeLessThan(latest);
      expect(peak).toBeLessThanOrEqual(far + 1e-9);
      expect(top).toBeLessThanOrEqual(SHIP.TURN);
      expect(ship.angle).toBeCloseTo(far, 3);
    }
    // The short way round, either way.
    expect(chase(0.1, TAU * 2 - 0.1)).toBeGreaterThan(0);
    expect(chase(-3, 3)).toBeGreaterThan(0);
    expect(chase(3, -3)).toBeLessThan(0);
    expect(chase(1, 1)).toBe(0);
  });

  it('a pointer in the very middle of the screen points nowhere', () => {
    expect(pointerAngle(10, -10, 900)).toBeNull();
    expect(pointerAngle(0, 900 * CONTROL.DEAD - 1, 900)).toBeNull();
    expect(pointerAngle(NaN, NaN, 900)).toBeNull();
    expect(pointerAngle(0, -900 * CONTROL.DEAD, 900)).toBeCloseTo(Math.PI / 2, 9); // straight up is a quarter turn
    expect(pointerAngle(300, 0, 900)).toBeCloseTo(0, 9);
    expect(pointerAngle(-400, 400, 900)).toBeCloseTo(-Math.PI * 3 / 4, 9);
  });
});

describe('every ring can be reached', () => {
  const SEEDS = 150;
  /** Each place the last ring could have left the ship: the middle and both safe edges of each of its gaps. */
  function* leftAt(before: Ring | null, start: number) {
    if (!before) { yield start; return; }
    for (const gap of before.section.gaps) {
      for (const edge of [-1, 0, 1]) yield gapAngle(before, gap, before.at) + edge * safe(gap);
    }
  }
  /** How far the ship must turn to be inside a gap's safe zone, for the nearest gap. */
  const turnNeeded = (ring: Ring, from: number) => Math.min(...ring.section.gaps.map(gap =>
    Math.max(0, Math.abs(wrap(gapAngle(ring, gap, ring.at) - from)) - safe(gap))));

  it('by a calm hand, in the time between rings, at every depth and in every pattern', () => {
    // A calm hand takes REACT to answer a ring and then turns at CALM of the
    // ship's top rate: every ring must be reachable on those terms, from
    // anywhere the last ring could have left the ship.
    const hardest = new Map<string, number>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      let before: Ring | null = null;
      for (const section of tunnel(seed)) {
        for (const ring of section.rings) {
          const time = ring.at - (before ? before.at : 0) - TUNNEL.REACT;
          for (const from of leftAt(before, START)) {
            const share = turnNeeded(ring, from) / (SHIP.TURN * time);
            hardest.set(section.pattern, Math.max(hardest.get(section.pattern) ?? 0, share));
            if (share > TUNNEL.CALM) {
              throw new Error(`seed ${seed} depth ${section.depth} ${section.pattern} ring ${ring.id}: ` +
                `needs ${(share * 100).toFixed(0)}% of the top turn rate`);
            }
          }
          before = ring;
        }
      }
    }
    expect([...hardest.keys()].sort()).toEqual([...PATTERNS].sort());
    // The limit is used: the tunnel does ask for a real turn.
    expect(Math.max(...hardest.values())).toBeGreaterThan(TUNNEL.CALM * 0.6);
    expect(reach(depthSpec(TUNNEL.DEPTHS).beat)).toBeCloseTo(SHIP.TURN * TUNNEL.CALM * (1.1 - TUNNEL.REACT), 9);
  });

  /** Coasting distance once the key is let go at this spin: the release ramp, then the brake. */
  const stopping = (spin: number) => Math.abs(spin) * (CONTROL.KEY_RELEASE / 2 + 1 / SHIP.BRAKE);
  /**
   * A calm pilot on the keys, with the real ramp: nothing for REACT after a
   * ring, then hold toward the nearest gap and let go in time to stop in it.
   */
  function pilot(ship: { angle: number, spin: number }, axis: ReturnType<typeof createKeyAxis>,
    ring: Ring, sinceLast: number, time: number) {
    if (sinceLast < TUNNEL.REACT) return 0;
    let off = Infinity, zone = 0;
    for (const gap of ring.section.gaps) {
      const to = wrap(gapAngle(ring, gap, time) - ship.angle);
      if (Math.abs(to) < Math.abs(off)) { off = to; zone = Math.min(gap.perfect, safe(gap)) / 2; }
    }
    void axis;
    const coast = Math.sign(ship.spin) === Math.sign(off) ? stopping(ship.spin) : -stopping(ship.spin);
    return Math.abs(off) - coast > zone ? Math.sign(off) : 0;
  }

  it('with the keys as they are: a calm pilot makes every ring from every place the last one could leave it', () => {
    const DT = 1 / 120;
    let pairs = 0, perfects = 0, tightest = Infinity;
    for (let seed = 1; seed <= SEEDS; seed++) {
      let before: Ring | null = null;
      for (const section of tunnel(seed)) {
        for (const ring of section.rings) {
          const t0 = before ? before.at : 0;
          for (const from of leftAt(before, START)) {
            const ship = { angle: from, spin: 0 }, axis = createKeyAxis();
            for (let t = t0; t < ring.at - 1e-9;) {
              const h = Math.min(DT, ring.at - t);
              turn(ship, h, axis.step(h, pilot(ship, axis, ring, t - t0, t)));
              t += h;
            }
            const how = meet(ring, ship.angle, ring.at);
            if (how === HIT) {
              throw new Error(`seed ${seed} depth ${section.depth} ${section.pattern} ring ${ring.id}: ` +
                `not reached from ${from.toFixed(3)}`);
            }
            pairs++;
            if (how === PERFECT) perfects++;
            tightest = Math.min(tightest, ...ring.section.gaps.map(gap =>
              safe(gap) - Math.abs(wrap(ship.angle - gapAngle(ring, gap, ring.at)))).filter(margin => margin >= 0));
          }
          before = ring;
        }
      }
    }
    expect(pairs).toBeGreaterThan(SEEDS * TUNNEL.DEPTHS * TUNNEL.RINGS * 2.5);
    // Not merely alive: nearly always dead centre, and never scraping an edge.
    expect(perfects / pairs).toBeGreaterThan(0.95);
    expect(tightest).toBeGreaterThan(0.05);
  });

  it('through the game itself: the same pilot clears the whole tunnel on every seed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = running(seed);
      const axis = createKeyAxis();
      let since = 0, last = nextRing(game), top = 0;
      while (game.state === 'play') {
        const ring = nextRing(game);
        if (ring !== last) { last = ring; since = 0; }
        game.step(1 / 60, axis.step(1 / 60, pilot(game, axis, ring, since, game.time)));
        since += 1 / 60;
        top = Math.max(top, Math.abs(game.spin));
      }
      expect(game).toMatchObject({ cause: 'CLEARED', depth: TUNNEL.DEPTHS, passed: TUNNEL.DEPTHS * TUNNEL.RINGS });
      expect(top).toBeLessThanOrEqual(SHIP.TURN);
    }
  });

  it('through the game itself: a hand on the mouse, pointing at each gap in turn, clears it too', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const game = running(seed);
      let since = 0, last = nextRing(game), aim = game.angle;
      while (game.state === 'play') {
        const ring = nextRing(game);
        if (ring !== last) { last = ring; since = 0; }
        // The hand moves to the gap REACT after the last ring, and leads a rotor to where it will be.
        if (since >= TUNNEL.REACT) {
          let off = Infinity;
          for (const gap of ring.section.gaps) {
            const to = wrap(gapAngle(ring, gap, ring.at) - game.angle);
            if (Math.abs(to) < Math.abs(off)) off = to;
          }
          aim = game.angle + off;
        }
        game.step(1 / 60, chase(aim, game.angle));
        since += 1 / 60;
      }
      expect(game).toMatchObject({ cause: 'CLEARED', passed: TUNNEL.DEPTHS * TUNNEL.RINGS });
      expect(game.bestChain).toBeGreaterThan(TUNNEL.RINGS * 2);
    }
  });

  it('never asks for a turn the ship cannot make flat out, with time to spare', () => {
    // The hard limit, for any hand: the widest move against the time to the next ring.
    let worst = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      let before: Ring | null = null;
      for (const section of tunnel(seed)) {
        for (const ring of section.rings) {
          for (const from of leftAt(before, START)) {
            worst = Math.max(worst, turnNeeded(ring, from) / (SHIP.TURN * (ring.at - (before ? before.at : 0))));
          }
          before = ring;
        }
      }
    }
    expect(worst).toBeLessThan(0.4);
  });
});

describe('the picture', () => {
  class Renderer { frames = 0; render() { this.frames++; } }
  /** three.js with every geometry and material counted while it is alive. */
  function counted() {
    const alive = { geometries: 0, materials: 0 };
    const count = (Base: any, key: 'geometries' | 'materials') => class extends Base {
      constructor(...args: any[]) {
        super(...args);
        alive[key]++;
        (this as any).addEventListener('dispose', () => { alive[key]--; });
      }
    };
    return {
      alive,
      three: {
        ...THREE,
        BufferGeometry: count(THREE.BufferGeometry, 'geometries'),
        LineBasicMaterial: count(THREE.LineBasicMaterial, 'materials'),
        MeshBasicMaterial: count(THREE.MeshBasicMaterial, 'materials'),
      } as unknown as typeof THREE,
    };
  }
  const shown = (view: ReturnType<typeof createView>) => view.slots.filter(slot => slot.group.visible);

  it('draws the rings from a fixed pool, one drawing per kind of ring in view', () => {
    const game = running(3);
    const { three, alive } = counted();
    const view = createView({ THREE: three, createShipBody, game, aspect: 1.6 });
    const renderer = new Renderer();
    const objects = () => { let n = 0; view.scene.traverse(() => { n++; }); return n; };
    view.render(renderer as any, 1 / 60);
    const fixed = alive.geometries - view.drawings * 2, built = objects();
    expect(view.slots).toHaveLength(RING_POOL);
    expect(shown(view).length).toBeGreaterThan(1);
    expect(view.drawings).toBe(1);
    let most = 0, kinds = 0;
    for (let i = 0; i < 40 * 60 && game.state === 'play'; i++) {
      cross(game);
      view.render(renderer as any, 1 / 60);
      const inView = game.rings.filter(ring => {
        const ahead = ring.d - game.dist;
        return ahead <= TUNE.AHEAD && ahead >= SHIP_Z - 2 && ring.state !== BROKEN;
      });
      // Every ring in view has a slot of its own, standing where the ring is.
      expect(shown(view)).toHaveLength(inView.length);
      for (const ring of inView) {
        const slot = view.slots[ring.id % RING_POOL];
        expect(slot.group.position.z).toBeCloseTo(SHIP_Z - (ring.d - game.dist), 9);
        expect(slot.group.rotation.z).toBeCloseTo(gapAngle(ring, { offset: 0 }, game.time), 9);
        expect(slot.drawing).not.toBeNull();
      }
      most = Math.max(most, inView.length);
      kinds = Math.max(kinds, view.drawings);
      // Two geometries a drawing, and nothing else is ever made.
      expect(view.drawings).toBe(new Set(inView.map(ring => ring.section.key)).size);
      expect(alive.geometries).toBe(fixed + view.drawings * 2);
      expect(objects()).toBe(built);
    }
    expect(game.cause).toBe('CLEARED');
    expect(most).toBeLessThanOrEqual(RING_POOL - 2);
    expect(most).toBeGreaterThan(2);
    expect(kinds).toBeLessThanOrEqual(3);
    view.dispose();
  });

  it('keeps the geometry count level across retries', () => {
    const game = running(5);
    const { three, alive } = counted();
    const view = createView({ THREE: three, createShipBody, game, aspect: 1.6 });
    const renderer = new Renderer();
    const counts: number[] = [];
    for (let retry = 0; retry < 6; retry++) {
      // Into the third section, so more than one kind of ring has been drawn and retired.
      for (let i = 0; i < 24; i++) { cross(game); view.render(renderer as any, 1 / 60); }
      cross(game, WALL); cross(game, WALL);
      expect(game.state).toBe('over');
      view.render(renderer as any, 1 / 60);
      game.step(TUNE.LOCK + 0.01, 0);
      expect(game.press()).toBe(true);
      view.render(renderer as any, 1 / 60);
      counts.push(alive.geometries);
      expect(view.drawings).toBe(1); // only the new tunnel's first kind of ring
    }
    expect(new Set(counts).size).toBe(1);
    expect(alive.materials).toBe(8); // cage, walls, edges, shield, and the ship's four
    view.dispose();
    expect(alive).toEqual({ geometries: 0, materials: 0 });
    expect(view.scene.children).toHaveLength(0);
  });

  it('never leaves a slot holding a retired drawing', () => {
    const game = running(5);
    const view = createView({ THREE, createShipBody, game, aspect: 1.6 });
    const renderer = new Renderer();
    const disposed = new Set<unknown>();
    const watch = () => {
      for (const slot of view.slots) {
        for (const mesh of [slot.walls, slot.edges]) {
          if ((mesh.geometry as any).__watched) continue;
          (mesh.geometry as any).__watched = true;
          mesh.geometry.addEventListener('dispose', (event: any) => { disposed.add(event.target); });
        }
      }
    };
    for (let i = 0; i < 60 && game.state === 'play'; i++) {
      cross(game); view.render(renderer as any, 1 / 60); watch();
      for (const slot of view.slots) {
        expect(disposed.has(slot.walls.geometry)).toBe(false);
        expect(disposed.has(slot.edges.geometry)).toBe(false);
      }
    }
    expect(disposed.size).toBeGreaterThan(4);
    view.dispose();
  });

  it('draws the walls exactly where the rules say a ship is hit, and the ticks at the PERFECT zone', () => {
    type Span = { from: number, width: number };
    const walls = new Map<unknown, Span[]>(), ticks = new Map<unknown, number[]>();
    /** The arc each wall triangle covers, in the drawing's own angles. */
    const spans = (geometry: any) => {
      if (walls.has(geometry)) return walls.get(geometry)!;
      const at = geometry.attributes.position, out: Span[] = [];
      for (let i = 0; i < at.count; i += 3) {
        const angles = [0, 1, 2].map(k => Math.atan2(at.getY(i + k), at.getX(i + k)));
        const offsets = angles.map(angle => wrap(angle - angles[0]));
        const low = Math.min(...offsets);
        out.push({ from: angles[0] + low, width: Math.max(...offsets) - low });
      }
      walls.set(geometry, out);
      return out;
    };
    /** The angles of the short radial marks that stop a unit inside the tunnel wall. */
    const marks = (geometry: any) => {
      if (ticks.has(geometry)) return ticks.get(geometry)!;
      const at = geometry.attributes.position, out: number[] = [];
      for (let i = 0; i < at.count; i += 2) {
        const radii = [Math.hypot(at.getX(i), at.getY(i)), Math.hypot(at.getX(i + 1), at.getY(i + 1))];
        if (Math.abs(radii[0] - 6) < 1e-4 && Math.abs(radii[1] - 5) < 1e-4) out.push(Math.atan2(at.getY(i), at.getX(i)));
      }
      ticks.set(geometry, out);
      return out;
    };
    const positive = (angle: number) => (angle % TAU + TAU) % TAU;
    const patterns = new Set<string>();
    let checked = 0;
    for (let seed = 1; seed <= 2; seed++) {
      const game = running(seed);
      const view = createView({ THREE, createShipBody, game, aspect: 1.6 });
      const renderer = new Renderer();
      const done = new Set<string>();
      while (game.state === 'play') {
        cross(game);
        view.render(renderer as any, 1 / 60);
        for (const ring of game.rings) {
          const ahead = ring.d - game.dist;
          const slot = view.slots[ring.id % RING_POOL];
          if (ahead > TUNE.AHEAD || ahead < SHIP_Z - 2 || !slot.group.visible) continue;
          // Each ring far off, at mid distance and close by: a rotor has turned in between.
          const key = `${ring.id}:${Math.floor(ahead / 100)}`;
          if (done.has(key)) continue;
          done.add(key);
          const turned = slot.group.rotation.z, { gaps } = ring.section;
          const covered = (angle: number) => spans(slot.walls.geometry)
            .some(span => positive(angle - turned - span.from) <= span.width);
          const open = (angle: number) => gaps
            .some(gap => Math.abs(wrap(angle - gapAngle(ring, gap, game.time))) < gap.width / 2);
          const nearEdge = (angle: number) => gaps
            .some(gap => Math.abs(Math.abs(wrap(angle - gapAngle(ring, gap, game.time))) - gap.width / 2) < 0.01);
          for (let k = 0; k < 180; k++) {
            const angle = k / 180 * TAU + 0.003;
            if (!nearEdge(angle)) expect(covered(angle)).toBe(!open(angle));
            // Where the rules let the ship through, no wall is drawn across its hull.
            if (meet(ring, angle, game.time) === HIT) continue;
            expect(covered(angle - SHIP.HULL + 0.011) || covered(angle + SHIP.HULL - 0.011)).toBe(false);
          }
          const drawn = marks(slot.edges.geometry).map(angle => angle + turned);
          expect(drawn).toHaveLength(gaps.length * 2);
          for (const gap of gaps) {
            for (const side of [-1, 1]) {
              const tick = gapAngle(ring, gap, game.time) + side * gap.perfect;
              expect(drawn.some(angle => Math.abs(wrap(angle - tick)) < 1e-5)).toBe(true);
              // Just inside the tick is PERFECT; just outside it is not.
              expect(meet(ring, tick - side * 0.001, game.time)).toBe(PERFECT);
              expect(meet(ring, tick + side * 0.001, game.time)).not.toBe(PERFECT);
            }
          }
          patterns.add(ring.section.pattern);
          checked++;
        }
      }
      view.dispose();
    }
    expect([...patterns].sort()).toEqual([...PATTERNS].sort());
    expect(checked).toBeGreaterThan(2 * TUNNEL.DEPTHS * TUNNEL.RINGS * 2);
  });

  it('draws the hull as wide as the rules say it is', () => {
    const game = running(4);
    const view = createView({ THREE, createShipBody, game, aspect: 1.6 });
    const box = new THREE.Box3().setFromObject(view.body);
    const halfSpan = Math.atan(Math.max(box.max.x, -box.min.x) / 4.6);
    expect(halfSpan).toBeLessThanOrEqual(SHIP.HULL + 1e-9);
    expect(halfSpan).toBeGreaterThan(SHIP.HULL * 0.95);
    expect(-box.min.x).toBeCloseTo(box.max.x, 6);
    view.dispose();
  });

  it('hides a ring the shield broke at once, and shows the shield only while it is held', () => {
    const game = running(4);
    const view = createView({ THREE, createShipBody, game, aspect: 1.6 });
    const renderer = new Renderer();
    for (let i = 0; i < 4; i++) cross(game);
    view.render(renderer as any, 1 / 60);
    expect(view.shield.visible).toBe(false);
    cross(game);
    view.render(renderer as any, 1 / 60);
    expect(view.shield.visible).toBe(true);
    const broken = cross(game, WALL);
    view.render(renderer as any, 1 / 60);
    expect(view.shield.visible).toBe(false);
    expect(broken.d - game.dist).toBeGreaterThan(SHIP_Z); // still ahead of the camera
    expect(view.slots[broken.id % RING_POOL].group.visible).toBe(false);
    view.dispose();
  });

  it('banks the hull inside the ship, never the frame that places it', () => {
    const game = running(4);
    const view = createView({ THREE, createShipBody, game, aspect: 1.6 });
    const renderer = new Renderer();
    for (const [angle, spin] of [[0.4, 0], [0.4, SHIP.TURN], [-2, -SHIP.TURN]]) {
      game.angle = angle; game.spin = spin;
      view.render(renderer as any, 0);
      // The frame: on the wall at the ship's angle, its floor toward the wall.
      expect(view.ship.rotation.z).toBeCloseTo(angle + Math.PI / 2, 9);
      expect(Math.atan2(view.ship.position.y, view.ship.position.x)).toBeCloseTo(angle, 9);
      expect(Math.hypot(view.ship.position.x, view.ship.position.y)).toBeCloseTo(4.6, 9);
      expect([view.ship.rotation.x, view.ship.rotation.y]).toEqual([0, 0]);
      // The bank: on the body alone, into the turn.
      expect(view.body.rotation.z).toBeCloseTo(-spin * 0.15, 9);
      expect(view.body.parent).toBe(view.ship);
    }
    view.dispose();
  });

  it('rolls the camera after the ship under the keys, and holds it still under the mouse', () => {
    const game = running(4);
    const view = createView({ THREE, createShipBody, game, aspect: 1.6 });
    const renderer = new Renderer();
    /** Where the ship is drawn, as an angle round the middle of the screen. */
    const onScreen = () => {
      view.camera.updateMatrixWorld();
      const at = view.ship.position.clone().project(view.camera);
      return Math.atan2(at.y, at.x * view.camera.aspect);
    };
    // Keys: the ship settles at the bottom of the screen wherever it is in the tunnel,
    // so right is always right.
    for (const angle of [1, 2.5, -4, 30]) {
      game.angle = angle; game.spin = 0;
      for (let i = 0; i < 240; i++) view.render(renderer as any, 1 / 60);
      expect(wrap(onScreen() + Math.PI / 2)).toBeCloseTo(0, 3);
    }
    // In a flat-out turn it swings out by half a radian at most, toward the turn.
    for (let i = 0; i < 240; i++) {
      game.angle += SHIP.TURN / 60; game.spin = SHIP.TURN;
      view.render(renderer as any, 1 / 60);
    }
    const swing = wrap(onScreen() + Math.PI / 2);
    expect(swing).toBeGreaterThan(0.3);
    expect(swing).toBeLessThan(0.55);
    // Mouse: the camera holds still wherever the keys left it, so the tunnel
    // never turns when the mouse takes the stick; the ship is drawn at its
    // angle less the roll, which is where `view.roll` tells the mouse it is.
    view.follow = false;
    const held = view.camera.rotation.z;
    expect(wrap(held)).not.toBeCloseTo(0, 1);
    expect(view.roll).toBe(held);
    for (const angle of [game.angle, 0.3, -2.2, Math.PI]) {
      game.angle = angle; game.spin = 0;
      for (let i = 0; i < 240; i++) view.render(renderer as any, 1 / 60);
      expect(view.camera.rotation.z).toBe(held);
      expect(wrap(onScreen() - (angle - view.roll))).toBeCloseTo(0, 3);
    }
    view.dispose();
  });

  it('opens the lens on an upright phone so the tunnel mouth fits across the screen', () => {
    const game = createGame({ random: mulberry32(1) });
    const view = createView({ THREE, createShipBody, game, aspect: 1440 / 900 });
    expect(view.camera.fov).toBe(55);
    view.resize(390, 844);
    expect(view.camera.aspect).toBeCloseTo(390 / 844, 9);
    // Half the screen's width, at the ship's plane, is at least the tunnel's radius.
    const halfWidth = Math.tan(view.camera.fov * Math.PI / 360) * view.camera.aspect * -SHIP_Z;
    expect(halfWidth).toBeGreaterThanOrEqual(6 - 1e-9);
    view.resize(1440, 900);
    expect(view.camera.fov).toBe(55);
    view.dispose();
  });

  it('disposes what it made and leaves another consumer of the ship factory alone', () => {
    const game = running(2);
    const other = createShipBody(THREE);
    const view = createView({ THREE, createShipBody, game, aspect: 1.6 });
    const renderer = new Renderer();
    for (let i = 0; i < 12; i++) { cross(game); view.render(renderer as any, 1 / 60); }
    const mine = new Set<any>(), theirs = new Set<any>();
    const collect = (root: any, into: Set<any>) => root.traverse((object: any) => {
      if (object.geometry) into.add(object.geometry);
      for (const material of [].concat(object.material || [])) into.add(material);
    });
    collect(view.scene, mine); collect(other, theirs);
    for (const resource of theirs) expect(mine.has(resource)).toBe(false);
    const gone = new Set<any>();
    for (const resource of [...mine, ...theirs]) resource.addEventListener('dispose', () => gone.add(resource));
    view.dispose();
    for (const resource of mine) expect(gone.has(resource)).toBe(true);
    for (const resource of theirs) expect(gone.has(resource)).toBe(false);
    expect(view.scene.children).toHaveLength(0);
    expect(view.drawings).toBe(0);
  });
});

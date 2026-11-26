// MERIDIAN's rules. No DOM and no three.js: `step` is the whole game.
import { BLEND, CITY, HALF, ROW_D, SEA, SECTORS, SPAN, createWorld, laneX } from './world.js';

export const TUNE = {
  /** Forward speed: start, gain per second, cap on lap 1, cap gained per lap, hard cap. */
  SPEED0: 46, ACCEL: 1.1, CAP0: 92, CAP_LAP: 9, CAP_MAX: 128,
  /** Lateral and vertical speed at full stick, and how fast the ship reaches them. */
  VX: 110, VY: 42, RESPONSE_X: 5, RESPONSE_Y: 6,
  CEILING: 60,
  /** Deck assist: within SKIM of the ground the ship cannot be pushed lower,
   *  and its dive rate shrinks with height as ASSIST × (height − SKIM). Below
   *  SKIM it lifts the ship, by at most ASSIST_CLIMB: enough for a gentle
   *  slope, not for a ridge. */
  SKIM: 2.4, ASSIST: 5, ASSIST_CLIMB: 14,
  /** The assist reads the ground this many seconds ahead, so gentle slopes are followed. */
  ASSIST_AHEAD: 0.12,
  /** A run opens with the title's glide still holding the ship up, fading over this long. */
  GRACE: 5,
  /** Touching the ground or a tower, with this much hull around the ship's centre. */
  HIT: 0.6, HULL: 0.9,
  /** LOW: this close to the ground, distance pays LOW_MULT times. */
  LOW: 8, LOW_MULT: 3,
  /** A gate threaded within PASS_R of its centre pays GATE_POINTS × chain. */
  GATE_R: 5.5, PASS_R: 4.8, GATE_POINTS: 100, CHAIN_CAP: 10,
  /** Charge: full tank, gain per gate, drain per second on lap 1, per lap, cap.
   *  DRAIN_MAX × GATE_GAP_MAX × SEA_GAP must exceed CHARGE_GATE: at the caps even
   *  the sea's close gates lose charge, so no run can be flown forever. */
  CHARGE: 100, CHARGE_GATE: 16, DRAIN0: 4, DRAIN_LAP: 0.75, DRAIN_MAX: 9,
  /** Seconds of flight between gates on lap 1, per lap, cap; the sea packs them. */
  GATE_GAP: 2.4, GATE_GAP_LAP: 0.2, GATE_GAP_MAX: 3.2, SEA_GAP: 0.6,
  /** Seconds after a run ends during which a press is ignored. */
  LOCK: 0.6,
  /** Longest forward travel simulated in one piece, so a slow frame cannot skip anything. */
  SUBSTEP: 2,
  /** Title screen: glide speed and height. */
  GLIDE_SPEED: 40, GLIDE_HEIGHT: 9,
};

export const BEST_KEY = 'meridian.best';
/** Gates are placed out to GATE_AHEAD, and never closer together than GATE_MIN.
 *  There is no upper limit: their spacing is a time, so it grows with speed. */
const GATE_AHEAD = 440, GATE_MIN = 80;
/** How far into the ranges the title glide goes before its origin moves up:
 *  short of the fade into the city by everything placed ahead of the glide. */
const GLIDE_SPAN = SPAN - BLEND - GATE_AHEAD - TUNE.GLIDE_SPEED * TUNE.GATE_GAP_MAX - 150;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * @param {{ random?: () => number,
 *   storage?: { getItem(key: string): string | null, setItem(key: string, value: string): void } | null }} [options]
 */
export function createGame({ random = Math.random, storage = null } = {}) {
  const world = createWorld(random);
  const game = {
    world,
    /** 'menu' glides over the ranges, 'play' is a run, 'over' is frozen at its end. */
    state: 'menu',
    x: 0, y: 0, vx: 0, vy: 0, dist: 0, speed: TUNE.GLIDE_SPEED,
    /** Seconds the world has been moving; the sea runs on it. */
    time: 0,
    /** Seconds into the current run. */
    runTime: 0,
    score: 0, charge: TUNE.CHARGE, chain: 0, bestChain: 0, threaded: 0, low: false,
    sector: 0, lap: 1, cause: '', best: readBest(), newBest: false, lock: 0,
    /** Gates ahead and just behind: { id, d, x, y, state, at } with state
     *  0 waiting, 1 threaded, 2 missed, and `at` the time it was decided. */
    gates: [],
    /** The last gate payout, for the HUD: points and the time it happened. */
    payout: { points: 0, at: -Infinity },
    press, step,
  };
  let gateId = 0, lastGate = null, seaSide = 1;
  const rows = [];
  world.reseed();
  game.y = world.surface(0, 0, 0) + TUNE.GLIDE_HEIGHT;

  function readBest() {
    try {
      const value = Number(storage?.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch { return 0; }
  }

  /** Any click, tap or key: start from the title, or retry once the lock has run out. */
  function press() {
    if (game.state === 'play' || game.lock > 0) return false;
    start();
    return true;
  }

  function start() {
    if (game.state === 'over') {
      // A retry is a new world from its first metre.
      world.reseed();
      game.dist = 0; game.x = 0;
      game.y = world.surface(0, 0, game.time) + TUNE.GLIDE_HEIGHT;
      game.gates.length = 0; lastGate = null;
    } else {
      // From the title the run takes over the glide where it is.
      world.restartAt(game.dist);
    }
    game.vx = game.vy = 0;
    game.speed = TUNE.SPEED0;
    game.runTime = 0;
    game.score = 0; game.charge = TUNE.CHARGE;
    game.chain = game.bestChain = game.threaded = 0;
    game.low = false; game.sector = 0; game.lap = 1;
    game.cause = ''; game.newBest = false; game.lock = 0;
    game.payout.points = 0; game.payout.at = -Infinity;
    game.state = 'play';
  }

  function end(cause) {
    game.state = 'over';
    game.cause = cause;
    game.lock = TUNE.LOCK;
    const score = Math.floor(game.score);
    game.newBest = score > game.best;
    if (game.newBest) {
      game.best = score;
      try { storage?.setItem(BEST_KEY, String(score)); } catch { /* private mode: keep it for this visit */ }
    }
  }

  /** Advance by `dt` seconds with the stick at (x, y) in −1..1; y > 0 dives. */
  function step(dt, stick) {
    game.lock = Math.max(0, game.lock - dt);
    if (game.state === 'over') return;
    const pieces = Math.max(1, Math.ceil(game.speed * dt / TUNE.SUBSTEP));
    const h = dt / pieces;
    for (let i = 0; i < pieces && game.state !== 'over'; i++) {
      if (game.state === 'menu') glide(h); else fly(h, stick);
    }
    placeGates();
  }

  function glide(h) {
    game.time += h;
    game.dist += TUNE.GLIDE_SPEED * h;
    // Stay in the open ranges. Ground is drawn and gates are placed well ahead;
    // wrapping at GLIDE_SPAN keeps all of it short of the fade into the city, so
    // moving the origin (now, or when the run starts) changes none of it.
    if (game.dist - world.origin > GLIDE_SPAN) world.restartAt(world.origin + GLIDE_SPAN - 100);
    const targetX = Math.sin(game.time * 0.3) * 30;
    game.vx = (targetX - game.x) * 1.5;
    game.x += game.vx * h;
    const targetY = world.surface(game.x, game.dist + 6, game.time) + TUNE.GLIDE_HEIGHT;
    game.vy = (targetY - game.y) * 2.2;
    game.y += game.vy * h;
  }

  function fly(h, stick) {
    const d0 = game.dist, x0 = game.x, y0 = game.y;
    const info = world.sectorAt(d0);
    game.sector = info.index; game.lap = info.lap;

    game.vx += (clamp(stick.x, -1, 1) * TUNE.VX - game.vx) * Math.min(1, h * TUNE.RESPONSE_X);
    game.vy += (-clamp(stick.y, -1, 1) * TUNE.VY - game.vy) * Math.min(1, h * TUNE.RESPONSE_Y);
    // Deck assist: the nearer the ground, the slower the ship may sink.
    const floor = Math.max(world.surface(x0, d0, game.time),
      world.surface(x0, d0 + game.speed * TUNE.ASSIST_AHEAD, game.time));
    // The opening grace lets go slowly at first: 1 − (t / GRACE)².
    const grace = Math.max(0, 1 - (game.runTime / TUNE.GRACE) ** 2);
    const skim = TUNE.SKIM + (TUNE.GLIDE_HEIGHT - TUNE.SKIM) * grace;
    game.vy = Math.max(game.vy,
      Math.min(-(y0 - floor - skim) * TUNE.ASSIST, TUNE.ASSIST_CLIMB + grace * TUNE.VY));

    game.x = clamp(x0 + game.vx * h, -HALF, HALF);
    if (Math.abs(game.x) === HALF) game.vx = 0;
    game.y = Math.min(TUNE.CEILING, y0 + game.vy * h);
    if (game.y === TUNE.CEILING) game.vy = Math.min(0, game.vy);
    const cap = Math.min(TUNE.CAP_MAX, TUNE.CAP0 + TUNE.CAP_LAP * (info.lap - 1));
    game.speed = Math.min(cap, game.speed + TUNE.ACCEL * h);
    game.dist = d0 + game.speed * h;
    game.time += h; game.runTime += h;

    // Gates: decided at the moment the ship crosses the gate's plane.
    for (const gate of game.gates) {
      if (gate.state !== 0 || gate.d <= d0 || gate.d > game.dist) continue;
      const f = (gate.d - d0) / (game.dist - d0);
      const off = Math.hypot(x0 + (game.x - x0) * f - gate.x, y0 + (game.y - y0) * f - gate.y);
      gate.at = game.time;
      if (off <= TUNE.PASS_R) {
        gate.state = 1;
        game.chain++; game.threaded++;
        game.bestChain = Math.max(game.bestChain, game.chain);
        const points = TUNE.GATE_POINTS * Math.min(game.chain, TUNE.CHAIN_CAP);
        game.score += points;
        game.payout.points = points; game.payout.at = game.time;
        game.charge = Math.min(TUNE.CHARGE, game.charge + TUNE.CHARGE_GATE);
      } else {
        gate.state = 2;
        game.chain = 0;
      }
    }

    const height = game.y - world.surface(game.x, game.dist, game.time);
    if (height < TUNE.HIT) return end('IMPACT');
    for (const row of world.rowsNear(game.dist, 12, rows)) {
      for (const tower of row.towers) {
        if (Math.abs(game.x - tower.x) < tower.w / 2 + TUNE.HULL &&
            Math.abs(game.dist - row.d) < tower.depth / 2 + TUNE.HULL &&
            game.y < tower.h + TUNE.HIT) return end('IMPACT');
      }
    }

    game.low = height < TUNE.LOW;
    game.score += game.speed * h * (game.low ? TUNE.LOW_MULT : 1);
    const drain = Math.min(TUNE.DRAIN_MAX, TUNE.DRAIN0 + TUNE.DRAIN_LAP * (info.lap - 1));
    game.charge -= drain * h;
    if (game.charge <= 0) { game.charge = 0; end('SIGNAL LOST'); }
  }

  /** Keep gates standing out to the fog line, and forget the ones behind the camera. */
  function placeGates() {
    while (game.gates.length && game.gates[0].d < game.dist - 40) game.gates.shift();
    let from = lastGate ? lastGate.d : game.dist + 30;
    while (from < game.dist + GATE_AHEAD) {
      const lap = world.sectorAt(from).lap;
      const sea = world.sectorAt(from).index === SEA;
      const seconds = Math.min(TUNE.GATE_GAP_MAX, TUNE.GATE_GAP + TUNE.GATE_GAP_LAP * (lap - 1)) *
        (sea ? TUNE.SEA_GAP : 1);
      lastGate = placeGate(from + Math.max(GATE_MIN, game.speed * seconds));
      from = lastGate.d;
    }
  }

  function placeGate(d) {
    const info = world.sectorAt(d);
    const previous = lastGate ? lastGate.x : game.x;
    const limit = HALF - 12;
    let x, y;
    // In the city a gate stands on the guaranteed lane of the nearest row, so the
    // gates draw the way through; one before or after the towers keeps that line.
    const row = info.index === CITY
      ? world.cityRows(info.ordinal).reduce((a, b) => (Math.abs(b.d - d) < Math.abs(a.d - d) ? b : a))
      : null;
    if (row && Math.abs(row.d - d) <= ROW_D / 2) {
      d = row.d; x = laneX(row.corridor); y = 6 + random() * 2;
    } else {
      if (row && info.blend === 0) {
        x = laneX(row.corridor);
      } else if (info.index === SEA && info.blend === 0) {
        // Over the water: a slalom.
        seaSide = -seaSide;
        x = clamp(previous + seaSide * (22 + random() * 24), -limit, limit);
      } else {
        // Over ground: the lowest of a few spots within reach of the last gate.
        let crest = Infinity;
        for (let i = 0; i < 6; i++) {
          const candidate = clamp(previous + (random() * 2 - 1) * 46, -limit, limit);
          const top = world.crestNear(candidate, d, TUNE.GATE_R);
          if (top < crest) { crest = top; x = candidate; }
        }
      }
      // The whole ring stands above the highest the ground under it ever gets.
      y = world.crestNear(x, d, TUNE.GATE_R) + TUNE.GATE_R + 0.8 + random() * 1.5;
    }
    const gate = { id: gateId++, d, x, y, state: 0, at: 0 };
    game.gates.push(gate);
    return gate;
  }

  return game;
}

export const sectorName = game => SECTORS[game.sector];

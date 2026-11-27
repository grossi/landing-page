// HYPERTUNNEL's rules. No DOM and no three.js: `step` is the whole game.
import { SHIP, TUNNEL, createWorld, gapAngle, wrap } from './world.js';

export const TUNE = {
  /** A ring passed pays POINTS × (1 + chain); a section finished pays SECTION × its depth. */
  POINTS: 10, SECTION: 100,
  /** Every SHIELD perfects in a row charge the shield, if it is not held already. */
  SHIELD: 5,
  /** Seconds after a run ends during which a press is ignored. */
  LOCK: 0.6,
  /** Rings stand this far ahead of the ship, and are forgotten this far behind it. */
  AHEAD: 300, BEHIND: 20,
  /** Longest time simulated in one piece. A ring is decided where the ship
   *  crossed its plane, so this only bounds how straight a turn is drawn. */
  PIECE: 1 / 120,
};

export const BEST_KEY = 'hypertunnel.best';
/** What became of a ring: still ahead, threaded dead centre, passed, or broken by the shield. */
export const AHEAD = 0, PERFECT = 1, PASSED = 2, BROKEN = 3;
/** `meet`'s third answer: the ship is in a wall. */
export const HIT = -1;
const START_ANGLE = -Math.PI / 2;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * Turn `ship` ({ angle, spin }) for `h` seconds with the stick held at `steer`
 * (−1..1, positive is counter-clockwise as the tunnel is drawn). The spin
 * eases toward what the stick asks, and a stick held steady turns the ship
 * the same however the time is cut up.
 */
export function turn(ship, h, steer) {
  const target = clamp(steer, -1, 1) * SHIP.TURN;
  // Letting go, or reversing, bites harder than building up.
  const building = target * ship.spin >= 0 && Math.abs(target) > Math.abs(ship.spin);
  const rate = building ? SHIP.RESPONSE : SHIP.BRAKE;
  const keep = Math.exp(-rate * h);
  ship.angle += target * h + (ship.spin - target) * (1 - keep) / rate;
  ship.spin = target + (ship.spin - target) * keep;
}

/** How a ship at `angle` meets `ring` at `time`: HIT, PASSED or PERFECT. */
export function meet(ring, angle, time) {
  for (const gap of ring.section.gaps) {
    const off = Math.abs(wrap(angle - gapAngle(ring, gap, time)));
    if (off <= gap.width / 2 - SHIP.HULL) return off <= gap.perfect ? PERFECT : PASSED;
  }
  return HIT;
}

/**
 * @param {{ random?: () => number,
 *   storage?: { getItem(key: string): string | null, setItem(key: string, value: string): void } | null }} [options]
 */
export function createGame({ random = Math.random, storage = null } = {}) {
  const world = createWorld(random);
  const game = {
    world,
    /** 'menu' flies itself behind the title, 'play' is a run, 'over' is frozen at its end. */
    state: 'menu',
    /** Where the ship is round the tunnel wall (rad, unbounded) and how fast it is turning. */
    angle: START_ANGLE, spin: 0,
    dist: 0, speed: 0,
    /** Seconds this tunnel has been flown; rotors turn on it. */
    time: 0,
    score: 0, chain: 0, bestChain: 0, shield: false, passed: 0,
    depth: 1, pattern: '',
    cause: '', best: readBest(), newBest: false, lock: 0,
    /** Rings ahead and just behind, nearest first. */
    rings: [],
    /** The last ring's payout and the last section bonus, for the HUD: points and when. */
    payout: { points: 0, at: -Infinity }, bonus: { points: 0, at: -Infinity },
    /** When the shield was last charged, and when it last took a hit. */
    charged: -Infinity, broke: -Infinity,
    press, step,
  };
  /** Sections the ship has not finished, the one it is in first. */
  const sections = [];
  enter(true);

  function readBest() {
    try {
      const value = Number(storage?.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch { return 0; }
  }

  /** A new tunnel from its first metre, its first gap at `angle`. */
  function enter(demo, angle = game.angle) {
    world.reseed(angle, demo);
    sections.length = 0; game.rings.length = 0;
    game.dist = 0; game.time = 0; game.spin = 0;
    extend();
    section(sections[0]);
  }

  function section(now) {
    game.depth = now.depth; game.pattern = now.pattern; game.speed = now.speed;
  }

  /**
   * Any click, tap or key: start from the title, or retry once the lock has run
   * out. The first gap stands where the ship is, or at `aim` when a hand is
   * already pointing somewhere else: the ship gets there before the ring does.
   */
  function press(aim = game.angle) {
    if (game.state === 'play' || game.lock > 0) return false;
    game.state = 'play';
    enter(false, aim);
    game.score = game.chain = game.bestChain = game.passed = 0;
    game.shield = false;
    game.cause = ''; game.newBest = false; game.lock = 0;
    game.payout.points = game.bonus.points = 0;
    game.payout.at = game.bonus.at = game.charged = game.broke = -Infinity;
    return true;
  }

  function end(cause) {
    game.state = 'over';
    game.cause = cause;
    game.spin = 0;
    game.lock = TUNE.LOCK;
    game.newBest = game.score > game.best;
    if (game.newBest) {
      game.best = game.score;
      try { storage?.setItem(BEST_KEY, String(game.score)); } catch { /* private mode: keep it for this visit */ }
    }
  }

  /** Advance by `dt` seconds with the stick at `steer` in −1..1, or null for hands off. */
  function step(dt, steer) {
    game.lock = Math.max(0, game.lock - dt);
    let left = dt;
    while (left > 1e-9 && game.state !== 'over') {
      let h = Math.min(left, TUNE.PIECE);
      // The speed changes on the ring that ends a section: stop this piece on it.
      const edge = sections[0].end - game.dist;
      const onEdge = game.speed * h >= edge;
      if (onEdge) h = edge / game.speed;
      // Behind the title the tunnel flies itself, unless a hand is on the stick.
      const stick = game.state === 'menu' && steer === null ? autopilot() : steer ?? 0;
      advance(h, stick, onEdge ? sections[0].end : game.dist + game.speed * h);
      left -= h;
      extend();
      while (game.rings.length && game.rings[0].d < game.dist - TUNE.BEHIND) game.rings.shift();
    }
  }

  function advance(h, steer, dist) {
    const a0 = game.angle, d0 = game.dist, t0 = game.time;
    turn(game, h, steer);
    game.dist = dist; game.time = t0 + h;
    for (const ring of game.rings) {
      if (ring.d > dist) break;
      if (ring.state !== AHEAD) continue;
      // Decided where the ship crossed the ring's plane: its own angle and the
      // ring's turn are both taken at that moment, not at the end of the frame.
      const f = dist > d0 ? (ring.d - d0) / (dist - d0) : 1;
      cross(ring, a0 + (game.angle - a0) * f, t0 + h * f);
      if (game.state === 'over') return;
    }
  }

  function cross(ring, angle, time) {
    const how = meet(ring, angle, time);
    if (game.state === 'menu') {
      // Behind the title nothing is at stake: a ring the ship meets just goes.
      ring.state = how === HIT ? BROKEN : PASSED;
    } else if (how === HIT) {
      if (!game.shield) return end('WRECKED');
      game.shield = false;
      game.chain = 0;
      game.broke = time;
      ring.state = BROKEN;
    } else {
      ring.state = how;
      game.chain = how === PERFECT ? game.chain + 1 : 0;
      game.bestChain = Math.max(game.bestChain, game.chain);
      if (game.chain > 0 && game.chain % TUNE.SHIELD === 0 && !game.shield) {
        game.shield = true;
        game.charged = time;
      }
      game.passed++;
      game.payout.points = TUNE.POINTS * (1 + game.chain);
      game.payout.at = time;
      game.score += game.payout.points;
    }
    if (!ring.last) return;
    // The section's last ring: the bonus, then the next depth and its speed.
    sections.shift();
    if (game.state === 'play') {
      game.bonus.points = TUNE.SECTION * ring.section.depth;
      game.bonus.at = time;
      game.score += game.bonus.points;
      if (ring.section.depth === TUNNEL.DEPTHS) return end('CLEARED');
    }
    extend();
    section(sections[0]);
  }

  /** Keep rings standing out to AHEAD. Only ever adds: rings are dropped in `step`. */
  function extend() {
    // The tunnel has a last depth; only the title's goes on.
    const more = () => game.state === 'menu' || world.count < TUNNEL.DEPTHS;
    while ((!sections.length || sections[sections.length - 1].end < game.dist + TUNE.AHEAD) && more()) {
      const next = world.next();
      sections.push(next);
      game.rings.push(...next.rings);
    }
  }

  /** The title screen's pilot: ease toward where the nearest gap will be. */
  function autopilot() {
    let ring = null;
    for (const candidate of game.rings) {
      if (candidate.state === AHEAD) { ring = candidate; break; }
    }
    if (!ring) return 0;
    let nearest = Infinity;
    for (const gap of ring.section.gaps) {
      const off = wrap(ring.cross + gap.offset - game.angle);
      if (Math.abs(off) < Math.abs(nearest)) nearest = off;
    }
    return clamp(nearest * 2.5, -1, 1);
  }

  return game;
}

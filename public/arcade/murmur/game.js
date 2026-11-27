// MURMUR's rules. No DOM and no three.js: `step` is the whole game.
import { BELT, createBelt, growBelt, nearBelt, recycleBelt, retireRock, scatterBelt, sweepBelt } from './belt.js';
import { FLOCK, bankWake, createFlock, resetFlock, resetTrail, scatterWake, stepFlock } from './flock.js';

export const TUNE = {
  /** Birds in the flock, and the smaller flock for a phone that cannot keep up. */
  BIRDS: 600, BIRDS_LOW: 400,
  /** A wild bird this close to the hull is caught. */
  CATCH: 6,
  /** The run opens this far from the flock, facing it. */
  START: 120,
  /** Speed, cruising and boosting, and how fast the velocity follows the nose. */
  CRUISE: 44, BOOST: 84, THRUST: 2.6,
  /** Turn rates at full stick (rad/s) and the pitch limit. The rate is
   *  stick^EXPO, so a small deflection is a gentle turn, and it builds at
   *  RESPONSE per second, so a tap is a nudge. */
  YAW: 1.7, PITCH: 1.35, PITCH_MAX: 1.3, EXPO: 1.5, RESPONSE: 6,
  /** The hull, as a sphere, for rocks. */
  HULL: 1.4,
  /** The gate's ring, and how near its centre the ship must cross its plane. */
  GATE_R: 14, PASS_R: 13,
  /** Seconds on the clock at the start. */
  CLOCK: 45,
  /** A bank of n birds adds min(BONUS_MAX, base + n / BONUS_BIRDS) seconds; the
   *  base starts at BONUS_BASE and loses BONUS_STEP per bank, down to 0. */
  BONUS_MAX: 18, BONUS_BASE: 4, BONUS_STEP: 0.5, BONUS_BIRDS: 10,
  /** Per bank: the gate stands farther from the flock, up to a limit. */
  GATE_FAR: 160, GATE_FAR_STEP: 25, GATE_FAR_MAX: 400,
  /** The wild flock flees from farther, up to a limit, */
  FLEE: 30, FLEE_STEP: 3, FLEE_MAX: 60,
  /** and flies and flees faster, without limit: in the end no ship can catch
   *  enough of it to pay for the clock, which is what ends every run. */
  WILD_SPEED: 24, WILD_SPEED_STEP: 0.8, FLEE_FORCE: 100, FLEE_FORCE_STEP: 5,
  /** The flock's roaming speeds up too, to a limit. */
  ROAM_STEP: 0.08, ROAM_MAX: 2,
  /** Reef: the share of the belt standing between flock and gate, and how tight. */
  REEF: 0.2, REEF_STEP: 0.08, REEF_MAX: 0.6, REEF_R: 48, REEF_R_STEP: 3, REEF_R_MIN: 30,
  /** Seconds after a run ends during which a press is ignored. */
  LOCK: 0.6,
  /** Longest step simulated in one piece. A slow frame is cut into several. */
  PIECE: 1 / 30,
  /** Only rocks this close to the ship are tested against the wake's birds. */
  WAKE_REACH: 40,
};

export const BEST_KEY = 'murmur.best';
/** A released flock is stepped this many times before anyone sees it: 5 seconds. */
const SETTLE_STEPS = 150;
/** The title screen's flight stays within MENU_REACH of the flock's anchor, the
 *  anchor within ROAM of its home, and no rock stands within MENU_CLEAR of that home. */
export const MENU_REACH = 48, ROAM = { x: 40, y: 14, z: 40 }, MENU_CLEAR = 135;

/** What a bank of `birds` pays: bigger hauls pay much more per bird. */
export const payout = birds => Math.floor(birds + birds * birds / 100);
/** Seconds a bank of `birds` adds, after `banks` earlier ones. */
export const clockBonus = (birds, banks) => Math.min(TUNE.BONUS_MAX,
  Math.max(0, TUNE.BONUS_BASE - TUNE.BONUS_STEP * banks) + birds / TUNE.BONUS_BIRDS);
export const gateDistance = banks => Math.min(TUNE.GATE_FAR_MAX, TUNE.GATE_FAR + TUNE.GATE_FAR_STEP * banks);
export const fleeRadius = banks => Math.min(TUNE.FLEE_MAX, TUNE.FLEE + TUNE.FLEE_STEP * banks);
export const wildSpeed = banks => TUNE.WILD_SPEED + TUNE.WILD_SPEED_STEP * banks;
export const fleeForce = banks => TUNE.FLEE_FORCE + TUNE.FLEE_FORCE_STEP * banks;
export const reefShare = banks => Math.min(TUNE.REEF_MAX, TUNE.REEF + TUNE.REEF_STEP * banks);
export const reefRadius = banks => Math.max(TUNE.REEF_R_MIN, TUNE.REEF_R - TUNE.REEF_R_STEP * banks);

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const curve = stick => Math.sign(stick) * Math.abs(stick) ** TUNE.EXPO;

/**
 * A world direction (dx, dy, dz) in the frame of a ship at (yaw, pitch):
 * x to its right, y up, z behind it (ahead is −z), into `out`.
 */
export function toFrame(yaw, pitch, dx, dy, dz, out) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  out.x = dx * cy - dz * sy;
  out.y = dx * sp * sy + dy * cp + dz * sp * cy;
  out.z = dx * cp * sy - dy * sp + dz * cp * cy;
  return out;
}

/**
 * @param {{ random?: () => number, birds?: number,
 *   storage?: { getItem(key: string): string | null, setItem(key: string, value: string): void } | null }} [options]
 */
export function createGame({ random = Math.random, storage = null, birds = TUNE.BIRDS } = {}) {
  const flock = createFlock(TUNE.BIRDS, random);
  const belt = createBelt();
  const ship = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
    /** The turn and climb in progress, −1..1: the stick after its curve and lag. */
    turn: 0, climb: 0, boost: false,
    /** Unit vector along the nose. */
    fx: 0, fy: 0, fz: -1,
  };
  const game = {
    flock, belt, ship,
    /** 'menu' flies itself through the flock, 'play' is a run, 'over' is its end. */
    state: 'menu',
    /** Seconds the world has been moving, and seconds into the current run. */
    time: 0, runTime: 0,
    clock: TUNE.CLOCK, score: 0, banks: 0, biggest: 0,
    /** The last bank, for the HUD: birds, points, seconds added, and when. */
    banked: { birds: 0, points: 0, seconds: 0, at: -Infinity },
    /** Birds knocked out of the wake by rocks this run. */
    lost: 0,
    /** The gate: centre, the unit normal of its plane, and an id that changes when it moves. */
    gate: { id: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1 },
    /** The point the wild flock roams around right now. */
    anchor: { x: 0, y: 0, z: 0 },
    cause: '', best: readBest(), newBest: false, lock: 0,
    /** Counts starts: the ship jumps to its opening place, so the camera must cut. */
    runs: 0,
    press, step, setBirds,
  };
  // Where the flock lives; it roams around this point.
  const home = { x: 0, y: 0, z: 0 };
  // The reef's line, the banked birds' way out, and scratch for the flock's step.
  const line = { id: 0, from: { x: 0, y: 0, z: 0 }, to: game.gate, radius: TUNE.REEF_R };
  const heading = { x: 0, y: 0, z: -1 };
  const env = {
    x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, vx: 0, vy: 0, vz: 0,
    anchor: game.anchor, flee: TUNE.FLEE, fleeForce: TUNE.FLEE_FORCE, wildSpeed: TUNE.WILD_SPEED,
    catching: false, catchRadius: TUNE.CATCH,
    rocks: belt, near: new Int16Array(belt.count), nearCount: 0,
    stream: { x: 0, y: 0, z: 0 }, time: 0, random, caught: 0, shed: 0,
  };
  const local = { x: 0, y: 0, z: 0 };
  const recycle = { ship, heading, flock: flock.centre, line, share: 0, random };
  let roam = random() * 40, wanted = birds;

  roamTo(0);
  resetFlock(flock, wanted, game.anchor, random);
  menuPlace(0);
  // On the title screen the ship never comes near a rock.
  scatterBelt(belt, { ship: home, clear: home, clearRadius: MENU_CLEAR, random });
  placeGate(true);

  function readBest() {
    try {
      const value = Number(storage?.getItem(BEST_KEY));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch { return 0; }
  }

  /** Fly a smaller flock from the next run on (a phone that cannot keep its frame rate). */
  function setBirds(count) { wanted = clamp(Math.floor(count), 1, TUNE.BIRDS); }

  /** Any click, tap or key: start from the title, or retry once the lock has run out. */
  function press() {
    if (game.state === 'play' || game.lock > 0) return false;
    start();
    return true;
  }

  function roamTo(h) {
    roam += h * Math.min(TUNE.ROAM_MAX, 1 + TUNE.ROAM_STEP * game.banks);
    game.anchor.x = home.x + Math.sin(roam * 0.11) * ROAM.x;
    game.anchor.y = home.y + Math.sin(roam * 0.07) * ROAM.y;
    game.anchor.z = home.z + Math.cos(roam * 0.09) * ROAM.z;
  }

  /** Let a newly released flock find its shape, unseen: left alone it first
   *  falls in on its centre, and a run must not open on that one dense moment. */
  function settleFlock() {
    env.x0 = env.x1 = env.y0 = env.y1 = env.z0 = env.z1 = 0;
    env.vx = env.vy = 0; env.vz = -1;
    env.flee = 0; env.catching = false; env.nearCount = 0;
    env.wildSpeed = TUNE.WILD_SPEED; env.fleeForce = 0;
    for (let i = 0; i < SETTLE_STEPS; i++) stepFlock(flock, TUNE.PIECE, env);
  }

  function aimShip(dx, dy, dz) {
    const flat = Math.hypot(dx, dz);
    ship.yaw = Math.atan2(-dx, -dz);
    ship.pitch = clamp(Math.atan2(dy, flat), -TUNE.PITCH_MAX, TUNE.PITCH_MAX);
    nose();
  }
  function nose() {
    const cp = Math.cos(ship.pitch);
    ship.fx = -cp * Math.sin(ship.yaw); ship.fy = Math.sin(ship.pitch); ship.fz = -cp * Math.cos(ship.yaw);
  }

  function start() {
    // Every run meets the flock whole and settled, not as the last flight left it.
    // The camera cuts to the ship's new place at the same moment.
    resetFlock(flock, wanted, game.anchor, random);
    settleFlock();
    // 120 out from the flock and facing it: from where the ship is now if that
    // is a direction at all, kept close to level.
    const centre = flock.centre;
    let ux = ship.x - centre.x, uy = (ship.y - centre.y) * 0.25, uz = ship.z - centre.z;
    if (game.state === 'over' || Math.hypot(ux, uz) < 1) {
      const angle = random() * Math.PI * 2;
      ux = Math.cos(angle); uy = 0; uz = Math.sin(angle);
    }
    const length = Math.hypot(ux, uy, uz);
    ux /= length; uy /= length; uz /= length;
    ship.x = centre.x + ux * TUNE.START; ship.y = centre.y + uy * TUNE.START; ship.z = centre.z + uz * TUNE.START;
    aimShip(-ux, -uy, -uz);
    ship.vx = ship.fx * TUNE.CRUISE; ship.vy = ship.fy * TUNE.CRUISE; ship.vz = ship.fz * TUNE.CRUISE;
    ship.turn = ship.climb = 0; ship.boost = false;
    resetTrail(flock, ship.x, ship.y, ship.z, ship.fx, ship.fy, ship.fz);

    game.runTime = 0;
    game.clock = TUNE.CLOCK; game.score = 0; game.banks = 0; game.biggest = 0; game.lost = 0;
    game.banked.birds = game.banked.points = game.banked.seconds = 0; game.banked.at = -Infinity;
    game.cause = ''; game.newBest = false; game.lock = 0;
    placeGate(true);
    // The opening run is clear of rocks: to the flock, through it and out the far side.
    const beyond = { x: centre.x - ux * TUNE.START, y: centre.y - uy * TUNE.START, z: centre.z - uz * TUNE.START };
    scatterBelt(belt, {
      ship, path: { from: ship, to: beyond }, clear: centre, clearRadius: BELT.FLOCK_CLEAR,
      line, reef: Math.round(belt.count * reefShare(0)), random,
    });
    game.runs++;
    game.state = 'play';
  }

  function end(cause) {
    game.state = 'over';
    game.cause = cause;
    game.lock = TUNE.LOCK;
    // What was not banked is lost.
    scatterWake(flock);
    if (cause === 'WRECKED') ship.vx = ship.vy = ship.vz = 0;
    game.newBest = game.score > game.best;
    if (game.newBest) {
      game.best = game.score;
      try { storage?.setItem(BEST_KEY, String(game.score)); } catch { /* private mode: keep it for this visit */ }
    }
  }

  /**
   * Stand the gate `gateDistance` from the flock. The first one is off to one
   * side of the opening run, so the reef before it is not where the first pass
   * comes out; each later one is on another side of the flock than the last,
   * so the way to it leads back past the birds.
   */
  function placeGate(first) {
    const gate = game.gate, from = line.from;
    // From the flock toward the old gate, or (first) along the ship's nose.
    let ox = gate.x - from.x, oy = gate.y - from.y, oz = gate.z - from.z;
    if (first) { ox = ship.fx; oy = ship.fy; oz = ship.fz; }
    const old = Math.hypot(ox, oy, oz) || 1;
    ox /= old; oy /= old; oz /= old;
    let dx = 0, dy = 0, dz = 0;
    for (let tries = 0; tries < 24; tries++) {
      const cos = (random() * 2 - 1) * 0.4, sin = Math.sqrt(1 - cos * cos), angle = random() * Math.PI * 2;
      dx = Math.cos(angle) * sin; dy = cos; dz = Math.sin(angle) * sin;
      const dot = dx * ox + dy * oy + dz * oz;
      if (first ? dot > -0.2 && dot < 0.4 : dot < 0.3) break;
    }
    const far = gateDistance(game.banks);
    from.x = game.anchor.x; from.y = game.anchor.y; from.z = game.anchor.z;
    gate.x = from.x + dx * far; gate.y = from.y + dy * far; gate.z = from.z + dz * far;
    gate.nx = dx; gate.ny = dy; gate.nz = dz;
    gate.id++;
    line.id = gate.id;
    line.radius = reefRadius(game.banks);
    // A loose rock in the new gate's mouth goes back into the pool.
    for (let i = 0; i < belt.count; i++) {
      if ((belt.x[i] - gate.x) ** 2 + (belt.y[i] - gate.y) ** 2 + (belt.z[i] - gate.z) ** 2 < BELT.GATE_CLEAR ** 2) {
        retireRock(belt, i);
      }
    }
  }

  function bank() {
    const gate = game.gate;
    // The birds leave through the gate the way the ship went.
    const way = Math.sign(ship.vx * gate.nx + ship.vy * gate.ny + ship.vz * gate.nz) || 1;
    env.stream.x = gate.x + gate.nx * way * 90;
    env.stream.y = gate.y + gate.ny * way * 90;
    env.stream.z = gate.z + gate.nz * way * 90;
    const count = bankWake(flock);
    const points = payout(count), seconds = clockBonus(count, game.banks);
    game.score += points;
    game.clock += seconds;
    game.banks++;
    game.biggest = Math.max(game.biggest, count);
    game.banked.birds = count; game.banked.points = points; game.banked.seconds = seconds;
    game.banked.at = game.runTime;
    placeGate(false);
  }

  /** Advance by `dt` seconds with the stick at (x, y) in −1..1 (y > 0 noses down) and boost held or not. */
  function step(dt, stick, boost = false) {
    game.lock = Math.max(0, game.lock - dt);
    const pieces = Math.max(1, Math.ceil(dt / TUNE.PIECE - 1e-9));
    const h = dt / pieces;
    for (let i = 0; i < pieces; i++) {
      env.x0 = ship.x; env.y0 = ship.y; env.z0 = ship.z;
      if (game.state === 'menu') menuPlace(h);
      else if (game.state === 'play') fly(h, stick, boost);
      else coast(h);
      game.time += h;
      roamTo(h);
      const banks = game.state === 'menu' ? 0 : game.banks;
      env.x1 = ship.x; env.y1 = ship.y; env.z1 = ship.z;
      env.vx = ship.vx; env.vy = ship.vy; env.vz = ship.vz;
      env.flee = fleeRadius(banks); env.fleeForce = fleeForce(banks); env.wildSpeed = wildSpeed(banks);
      env.catching = game.state === 'play';
      env.nearCount = flock.wake ? nearBelt(belt, ship.x, ship.y, ship.z, TUNE.WAKE_REACH, env.near) : 0;
      env.time = game.time;
      stepFlock(flock, h, env);
      game.lost += env.shed;
    }
  }

  // ---- title screen: a figure of eight through the middle of the flock ----
  function menuPlace(h) {
    const phase = game.time * 0.3, anchor = game.anchor;
    const x = anchor.x + Math.sin(phase) * MENU_REACH;
    const y = anchor.y + Math.sin(phase * 2 + 0.6) * 9;
    const z = anchor.z + Math.sin(phase) * Math.cos(phase) * MENU_REACH;
    if (h > 0) {
      const yaw = ship.yaw;
      ship.vx = (x - ship.x) / h; ship.vy = (y - ship.y) / h; ship.vz = (z - ship.z) / h;
      aimShip(ship.vx, ship.vy, ship.vz);
      // How hard it is turning, for the view to bank it.
      const turned = Math.atan2(Math.sin(yaw - ship.yaw), Math.cos(yaw - ship.yaw));
      ship.turn += (clamp(turned / h / TUNE.YAW, -1, 1) - ship.turn) * Math.min(1, h * TUNE.RESPONSE);
    }
    ship.x = x; ship.y = y; ship.z = z;
  }

  function coast(h) {
    const drag = Math.exp(-h * 1.5);
    ship.vx *= drag; ship.vy *= drag; ship.vz *= drag;
    ship.x += ship.vx * h; ship.y += ship.vy * h; ship.z += ship.vz * h;
    ship.turn *= drag; ship.climb *= drag;
  }

  function fly(h, stick, boost) {
    const x0 = ship.x, y0 = ship.y, z0 = ship.z;
    const response = 1 - Math.exp(-h * TUNE.RESPONSE);
    ship.turn += (curve(clamp(stick.x, -1, 1)) - ship.turn) * response;
    ship.climb += (curve(clamp(stick.y, -1, 1)) - ship.climb) * response;
    ship.yaw -= ship.turn * TUNE.YAW * h;
    ship.pitch = clamp(ship.pitch - ship.climb * TUNE.PITCH * h, -TUNE.PITCH_MAX, TUNE.PITCH_MAX);
    nose();
    // Momentum: the velocity swings round to the nose, it does not snap to it.
    ship.boost = !!boost;
    const speed = boost ? TUNE.BOOST : TUNE.CRUISE, thrust = 1 - Math.exp(-h * TUNE.THRUST);
    ship.vx += (ship.fx * speed - ship.vx) * thrust;
    ship.vy += (ship.fy * speed - ship.vy) * thrust;
    ship.vz += (ship.fz * speed - ship.vz) * thrust;
    ship.x += ship.vx * h; ship.y += ship.vy * h; ship.z += ship.vz * h;
    game.runTime += h;

    // Rocks: the whole of this step's path against every rock.
    if (sweepBelt(belt, x0, y0, z0, ship.x, ship.y, ship.z, TUNE.HULL) >= 0) return end('WRECKED');

    // The gate: decided where the path crosses its plane.
    const gate = game.gate;
    const before = (x0 - gate.x) * gate.nx + (y0 - gate.y) * gate.ny + (z0 - gate.z) * gate.nz;
    const after = (ship.x - gate.x) * gate.nx + (ship.y - gate.y) * gate.ny + (ship.z - gate.z) * gate.nz;
    if (flock.wake > 0 && before * after <= 0 && before !== after) {
      const f = before / (before - after);
      const off = Math.hypot(x0 + (ship.x - x0) * f - gate.x, y0 + (ship.y - y0) * f - gate.y, z0 + (ship.z - z0) * f - gate.z);
      if (off <= TUNE.PASS_R) bank();
    }

    const pace = Math.hypot(ship.vx, ship.vy, ship.vz) || 1;
    heading.x = ship.vx / pace; heading.y = ship.vy / pace; heading.z = ship.vz / pace;
    recycle.share = reefShare(game.banks);
    recycleBelt(belt, recycle);
    growBelt(belt, h);

    game.clock -= h;
    if (game.clock <= 0) { game.clock = 0; end('OUT OF TIME'); }
  }

  /** How far the ship must yaw right (`turn`) and pitch up (`climb`) to face a world point, in radians. */
  game.bearing = (x, y, z, out) => {
    const dx = x - ship.x, dy = y - ship.y, dz = z - ship.z;
    const turn = ship.yaw - Math.atan2(-dx, -dz);
    out.turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    out.climb = Math.atan2(dy, Math.hypot(dx, dz)) - ship.pitch;
    return out;
  };

  /** Where a world point is from the ship: x right, y up, z behind (ahead is −z). */
  game.fromShip = (x, y, z, out = local) => toFrame(ship.yaw, ship.pitch, x - ship.x, y - ship.y, z - ship.z, out);

  return game;
}

export { FLOCK };

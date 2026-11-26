// HYPERTUNNEL's tunnel: what each depth asks, and where every ring stands.
// Plain math, no DOM and no three.js.

export const TAU = Math.PI * 2;
/** An angle as its shortest signed turn, in −π..π. */
export const wrap = angle => ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ship, as the rings see it. One ship, whatever steers it. */
export const SHIP = {
  /** Top turn rate (rad/s). Set by what the tunnel asks, not by what feels fast:
   *  the widest move a section may ask takes half of it (see `reach`). */
  TURN: 3,
  /** How fast the ship takes up a turn, and how fast it lets one go (1/s).
   *  It stops quicker than it starts: letting go is how a gap is hit. */
  RESPONSE: 10, BRAKE: 18,
  /** Half the hull, as an angle: the ship's centre must clear a gap's edge by this. */
  HULL: 0.12,
};

export const TUNNEL = {
  /** Rings in a section, and sections in the tunnel. The last depth is the one
   *  where speed, gap and spacing have all reached their limits. */
  RINGS: 10, DEPTHS: 13,
  SPEED0: 40, SPEED_STEP: 6, SPEED_MAX: 110,
  /** Gap width (rad). The middle third of a gap is its PERFECT zone. */
  GAP0: 1.35, GAP_STEP: 0.06, GAP_MIN: 0.7,
  /** Seconds of flight between rings. */
  BEAT0: 2, BEAT_STEP: 0.075, BEAT_MIN: 1.1,
  /** Seconds to the run's first ring, and of clear tunnel added between sections. */
  FIRST: 2.2, CLEAR: 1.5,
  /** PINCH and TWIN's narrow gap: this share of the depth's gap, never under
   *  NARROW_MIN. PINCH rings stand PINCH_BEAT beats apart. */
  NARROW: 0.62, NARROW_MIN: 0.52, PINCH_BEAT: 1.5,
  /** ROTOR spin (rad/s): at depth 1, gained per depth, and its cap. */
  ROTOR0: 0.3, ROTOR_STEP: 0.025, ROTOR_MAX: 0.6,
  /** A calm hand: it takes REACT seconds to answer a ring, and is never asked
   *  for more than CALM of the ship's top turn rate over the rest of the beat. */
  REACT: 0.3, CALM: 0.5,
  /** Least wall left standing between TWIN's two gaps (rad). */
  WALL: 0.5,
};

export const PATTERNS = ['SPIRAL', 'ZIGZAG', 'ROTOR', 'PINCH', 'TWIN'];

/** Speed, gap width and beat at a depth (1 is the first). */
export function depthSpec(depth) {
  const n = depth - 1;
  return {
    speed: Math.min(TUNNEL.SPEED_MAX, TUNNEL.SPEED0 + TUNNEL.SPEED_STEP * n),
    gap: Math.max(TUNNEL.GAP_MIN, TUNNEL.GAP0 - TUNNEL.GAP_STEP * n),
    beat: Math.max(TUNNEL.BEAT_MIN, TUNNEL.BEAT0 - TUNNEL.BEAT_STEP * n),
    rotor: Math.min(TUNNEL.ROTOR_MAX, TUNNEL.ROTOR0 + TUNNEL.ROTOR_STEP * n),
  };
}

/** The widest move, gap centre to gap centre, a section may ask in `beat` seconds. */
export const reach = beat => SHIP.TURN * TUNNEL.CALM * (beat - TUNNEL.REACT);

/** Where a ring's gap is at `time`: rotors turn, and stand at `cross` as the ship arrives. */
export const gapAngle = (ring, gap, time) => ring.cross + gap.offset + ring.spin * (time - ring.at);

const narrow = gap => Math.max(TUNNEL.NARROW_MIN, gap * TUNNEL.NARROW);

/**
 * The gaps every ring of a section has: `offset` from the ring's own angle,
 * `width`, and `perfect`, how far off a gap's centre still counts as PERFECT.
 */
function layout(pattern, gap, limit, side) {
  const one = width => ({ offset: 0, width, perfect: width / 6 });
  if (pattern === 'PINCH') return [one(narrow(gap))];
  if (pattern !== 'TWIN') return [one(gap)];
  // The narrow gap stands a lane change away, and its whole width is PERFECT.
  const width = narrow(gap);
  const apart = Math.max((gap + width) / 2 + TUNNEL.WALL, Math.min(1.9, limit * 0.8));
  return [one(gap), { offset: side * apart, width, perfect: width / 2 - SHIP.HULL }];
}

/**
 * @param {() => number} random
 */
export function createWorld(random = Math.random) {
  const world = {
    seed: 0,
    /** Goes up with every `reseed`: anything built from the old tunnel is stale. */
    epoch: 0,
    /** Sections handed out so far. */
    count: 0,
    reseed, next,
  };
  let demo = false, last = null, start = 0, bag = [], drawn = '';

  /**
   * A new tunnel whose first gap stands at `angle`, where the ship is. The
   * title screen's tunnel (`demo`) stays at depth 1 and shows each pattern in turn.
   */
  function reseed(angle, isDemo = false) {
    world.seed = Math.floor(random() * 0x100000000) >>> 0;
    world.epoch++;
    world.count = 0;
    demo = isDemo; start = angle; last = null; bag = []; drawn = 'ZIGZAG';
  }

  /** Depth 1 is SPIRAL, depth 2 ZIGZAG, then shuffled bags of all five, never one twice running. */
  function pattern(index, rng) {
    if (demo) return PATTERNS[index % PATTERNS.length];
    if (index < 2) return PATTERNS[index];
    if (!bag.length) {
      bag = PATTERNS.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      const top = bag.length - 1;
      if (bag[top] === drawn) [bag[0], bag[top]] = [bag[top], bag[0]];
    }
    return (drawn = bag.pop());
  }

  /** The next section of the tunnel, with all its rings. */
  function next() {
    const index = world.count++;
    const rng = mulberry32(world.seed ^ Math.imul(index + 1, 0x9e3779b1));
    const side = () => (rng() < 0.5 ? -1 : 1);
    const between = (low, high) => low + rng() * (high - low);
    const depth = demo ? 1 : index + 1;
    const spec = depthSpec(depth);
    const name = pattern(index, rng);
    const beat = spec.beat * (name === 'PINCH' ? TUNNEL.PINCH_BEAT : 1);
    const limit = reach(beat);
    // One coin per section: which side TWIN's narrow gap is on, which way a ROTOR starts.
    const hand = side();
    const gaps = layout(name, spec.gap, limit, hand);
    // The ship flies at this section's speed from the last ring of the one before.
    const from = last ? last.end : 0, t0 = last ? last.tEnd : 0;
    const first = from + spec.speed * (last ? TUNNEL.CLEAR + beat : TUNNEL.FIRST);
    const section = {
      index, depth, pattern: name, speed: spec.speed, beat, gaps,
      /** Sections with the same gaps share one drawing. */
      key: gaps.map(gap => [gap.offset, gap.width, gap.perfect].map(n => n.toFixed(4)).join(':')).join('|'),
      from, rings: [], end: 0, tEnd: 0, exit: 0,
    };

    const swing = name === 'SPIRAL' ? side() * Math.min(limit, between(0.75, 1.05))
      : name === 'ZIGZAG' ? side() * Math.min(limit * 0.9, between(1.3, 1.7)) : 0;
    let cross = last ? last.exit : start;
    for (let i = 0; i < TUNNEL.RINGS; i++) {
      let move;
      if (name === 'SPIRAL') move = swing;
      else if (name === 'ZIGZAG') move = i === 0 ? -swing / 2 : i % 2 ? swing : -swing;
      else if (name === 'ROTOR') move = (rng() * 2 - 1) * Math.min(0.8, limit * 0.6);
      else if (name === 'PINCH') move = side() * Math.min(limit * 0.8, between(0.5, 1.1));
      else move = side() * Math.min(limit * 0.6, between(0.4, 0.8));
      // The tunnel's very first ring stands where the ship already is.
      if (!last && i === 0) move = 0;
      cross += move;
      const d = first + i * spec.speed * beat;
      section.rings.push({
        id: index * TUNNEL.RINGS + i, d,
        /** When the ship arrives, and where the ring's own angle is then. */
        at: t0 + (d - from) / spec.speed, cross,
        spin: name === 'ROTOR' ? spec.rotor * hand * (i % 2 ? -1 : 1) : 0,
        section, last: i === TUNNEL.RINGS - 1,
        /** 0 ahead; the game marks what became of it. */
        state: 0,
      });
    }
    const end = section.rings[TUNNEL.RINGS - 1];
    section.end = end.d; section.tEnd = end.at; section.exit = end.cross;
    last = section;
    return section;
  }

  return world;
}

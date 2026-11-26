// MURMUR's rock belt: one fixed pool of spheres, moved around but never made or
// dropped. Plain math, no DOM and no three.js.

/** Three sizes of rock; rock i is of kind i % 3, so each size's batch is fixed. */
export const ROCK_RADII = [2.4, 4.2, 7];

export const BELT = {
  ROCKS: 150,
  /** A loose rock is moved once it is this far away, or this far behind the ship. */
  FAR: 300, BEHIND: 90,
  /** It comes back ahead of the ship, inside this cone (cosine) and this far out. */
  CONE: 0.64, AHEAD_MIN: 180, AHEAD_MAX: 290,
  /** A reef rock may come back nearer, but never nearer the ship than this. */
  REEF_MIN: 110,
  /** A moved rock grows from nothing over this many seconds. It collides at the
   *  size it is drawn, so nothing solid ever appears in the ship's way. */
  GROW: 1.5,
  /** Nothing is put this close to the gate's centre, or to the flock's. */
  GATE_CLEAR: 30, FLOCK_CLEAR: 45,
  /** A reef fills the line from the flock to the gate, but for this much at
   *  each end: room to work the flock, and a clear run into the gate. */
  REEF_FROM: 75, REEF_TO: 38,
};

/** @param {number} [count] */
export function createBelt(count = BELT.ROCKS) {
  const belt = {
    count,
    x: new Float32Array(count), y: new Float32Array(count), z: new Float32Array(count),
    /** r is a rock's size right now (drawn and collided with), full its grown size, grow 0..1. */
    r: new Float32Array(count), full: new Float32Array(count), grow: new Float32Array(count),
    kind: new Uint8Array(count),
    /** 0 for a loose rock, else the id of the gate whose reef it stands in. */
    line: new Int32Array(count),
    /** Goes up whenever a rock moves. */
    version: 0,
  };
  for (let i = 0; i < count; i++) {
    belt.kind[i] = i % 3; belt.r[i] = belt.full[i] = ROCK_RADII[i % 3]; belt.grow[i] = 1;
  }
  return belt;
}

/** A random unit vector into `out`. */
function direction(random, out) {
  const cos = random() * 2 - 1, sin = Math.sqrt(1 - cos * cos), angle = random() * Math.PI * 2;
  out.x = Math.cos(angle) * sin; out.y = cos; out.z = Math.sin(angle) * sin;
  return out;
}

const spot = { x: 0, y: 0, z: 0 }, aim = { x: 0, y: 0, z: 0 };
const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;
/** Squared distance from `p` to the segment a→b. */
function segment2(p, a, b) {
  const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z, e2 = ex * ex + ey * ey + ez * ez;
  const t = e2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey + (p.z - a.z) * ez) / e2)) : 0;
  return (p.x - a.x - ex * t) ** 2 + (p.y - a.y - ey * t) ** 2 + (p.z - a.z - ez * t) ** 2;
}

/** A place in the reef of `line` (from, to, radius), or false if it is too near `ship`. */
function reefSpot(line, ship, pop, random) {
  const ax = line.to.x - line.from.x, ay = line.to.y - line.from.y, az = line.to.z - line.from.z;
  const far = Math.hypot(ax, ay, az) || 1;
  const t = (BELT.REEF_FROM + (far - BELT.REEF_TO - BELT.REEF_FROM) * random()) / far;
  // Any direction, flattened onto the plane across the line: a disc around it.
  direction(random, aim);
  const along = (aim.x * ax + aim.y * ay + aim.z * az) / (far * far);
  aim.x -= ax * along; aim.y -= ay * along; aim.z -= az * along;
  const out = line.radius * Math.sqrt(random()) / (Math.hypot(aim.x, aim.y, aim.z) || 1);
  spot.x = line.from.x + ax * t + aim.x * out;
  spot.y = line.from.y + ay * t + aim.y * out;
  spot.z = line.from.z + az * t + aim.z * out;
  return distance2(spot, ship) >= pop * pop && distance2(spot, line.to) >= BELT.GATE_CLEAR ** 2;
}

/**
 * Lay the whole belt out afresh around `ship`: only at a cut, never in view.
 * `clear` is a ball kept empty (the title screen's flight), `path` a segment
 * kept clear (the opening run at the flock). The first `reef` rocks stand in
 * the reef of `line`.
 */
export function scatterBelt(belt, { ship, clear, clearRadius = 0, path, line, reef = 0, random }) {
  for (let i = 0; i < belt.count; i++) {
    belt.line[i] = 0;
    for (let tries = 0; tries < 12; tries++) {
      if (i < reef && tries < 6) {
        if (!reefSpot(line, ship, 60, random)) continue;
        belt.line[i] = line.id;
      } else {
        belt.line[i] = 0;
        direction(random, aim);
        const far = 55 + random() * (BELT.AHEAD_MAX - 55);
        spot.x = ship.x + aim.x * far; spot.y = ship.y + aim.y * far * 0.6; spot.z = ship.z + aim.z * far;
      }
      if (clear && distance2(spot, clear) < clearRadius * clearRadius) continue;
      if (path && segment2(spot, path.from, path.to) < 30 * 30) continue;
      if (line && distance2(spot, line.to) < BELT.GATE_CLEAR ** 2) continue;
      break;
    }
    belt.x[i] = spot.x; belt.y[i] = spot.y; belt.z[i] = spot.z;
    belt.grow[i] = 1; belt.r[i] = belt.full[i];
  }
  belt.version++;
}

/** Rocks that were moved grow toward their full size. */
export function growBelt(belt, h) {
  for (let i = 0; i < belt.count; i++) {
    if (belt.grow[i] >= 1) continue;
    const grow = belt.grow[i] = Math.min(1, belt.grow[i] + h / BELT.GROW);
    belt.r[i] = belt.full[i] * grow * grow * (3 - 2 * grow);
  }
}

/** Take a rock out of the way at once: it shrinks to nothing and is moved by the next recycle. */
export function retireRock(belt, i) {
  belt.grow[i] = 0; belt.r[i] = 0; belt.line[i] = 0;
  belt.x[i] += BELT.FAR * 4;
  belt.version++;
}

/**
 * Move the rocks the ship has left behind to where it is going. A rock of the
 * current reef stays where it is; one from an old reef is loose again. A moved
 * rock joins the reef until the reef holds `share` of the belt, else it lands ahead.
 * `heading` is the ship's direction of travel (unit), `flock` the wild centre.
 */
export function recycleBelt(belt, { ship, heading, flock, line, share, random }) {
  let moved = false, reef = 0;
  for (let i = 0; i < belt.count; i++) if (belt.line[i] === line.id) reef++;
  // The reef takes rocks as they come free, up to its share of the belt and no further.
  const room = Math.round(belt.count * share);
  for (let i = 0; i < belt.count; i++) {
    if (belt.line[i] === line.id) continue;
    const rx = belt.x[i] - ship.x, ry = belt.y[i] - ship.y, rz = belt.z[i] - ship.z;
    const far2 = rx * rx + ry * ry + rz * rz;
    if (far2 < BELT.FAR * BELT.FAR && rx * heading.x + ry * heading.y + rz * heading.z > -BELT.BEHIND) continue;
    if (reef < room && reefSpot(line, ship, BELT.REEF_MIN, random)) {
      belt.line[i] = line.id;
      reef++;
    } else {
      // Inside a cone around the heading: tilt the heading by a random angle.
      direction(random, aim);
      const k = BELT.CONE + (1 - BELT.CONE) * random();
      const dot = aim.x * heading.x + aim.y * heading.y + aim.z * heading.z;
      aim.x -= heading.x * dot; aim.y -= heading.y * dot; aim.z -= heading.z * dot;
      const across = Math.sqrt(1 - k * k) / (Math.hypot(aim.x, aim.y, aim.z) || 1);
      const far = BELT.AHEAD_MIN + (BELT.AHEAD_MAX - BELT.AHEAD_MIN) * random();
      spot.x = ship.x + (heading.x * k + aim.x * across) * far;
      spot.y = ship.y + (heading.y * k + aim.y * across) * far;
      spot.z = ship.z + (heading.z * k + aim.z * across) * far;
      // Not in the gate's mouth and not inside the flock: try again next step.
      if (distance2(spot, line.to) < BELT.GATE_CLEAR ** 2 || distance2(spot, flock) < BELT.FLOCK_CLEAR ** 2) continue;
      belt.line[i] = 0;
    }
    belt.x[i] = spot.x; belt.y[i] = spot.y; belt.z[i] = spot.z;
    belt.grow[i] = 0; belt.r[i] = 0;
    moved = true;
  }
  if (moved) belt.version++;
}

/**
 * The first rock the segment (x0,y0,z0)→(x1,y1,z1) touches, each rock grown
 * by `pad`: its index, or −1. A slow frame is a long segment, never a skip.
 */
export function sweepBelt(belt, x0, y0, z0, x1, y1, z1, pad) {
  const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0, e2 = ex * ex + ey * ey + ez * ez;
  let first = -1, when = Infinity;
  for (let i = 0; i < belt.count; i++) {
    if (belt.r[i] <= 0) continue;
    const cx = belt.x[i] - x0, cy = belt.y[i] - y0, cz = belt.z[i] - z0, reach = belt.r[i] + pad;
    const t = e2 > 0 ? Math.max(0, Math.min(1, (cx * ex + cy * ey + cz * ez) / e2)) : 0;
    const qx = cx - ex * t, qy = cy - ey * t, qz = cz - ez * t;
    if (qx * qx + qy * qy + qz * qz < reach * reach && t < when) { first = i; when = t; }
  }
  return first;
}

/** Indices of the rocks within `reach` of a point, into `out`. Returns how many. */
export function nearBelt(belt, x, y, z, reach, out) {
  let count = 0;
  for (let i = 0; i < belt.count && count < out.length; i++) {
    const qx = belt.x[i] - x, qy = belt.y[i] - y, qz = belt.z[i] - z, far = reach + belt.r[i];
    if (qx * qx + qy * qy + qz * qz < far * far) out[count++] = i;
  }
  return count;
}

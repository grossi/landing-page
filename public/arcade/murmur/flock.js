// MURMUR's flock: one fixed pool of birds. Each is wild, in the ship's wake, or
// banked and on its way out. Plain math, no DOM and no three.js.

export const WILD = 0, WAKE = 1, BANKED = 2;

export const FLOCK = {
  /** Each bird steers by this many others, picked by a fixed stride: O(N). */
  NEIGHBOURS: 7, STRIDE: 151,
  /** Wild birds: pull to their neighbours, push along with them, and apart inside NEAR. */
  COHESION: 1.4, ALIGN: 1.9, SEPARATION: 190, NEAR: 6,
  /** Pull toward the point the flock roams around, per unit of distance. */
  HOME: 0.35,
  /** Undisturbed, a wild bird flies between these speeds; one that fled slows by CALM per second. */
  MIN_SPEED: 7, CRUISE: 15, CALM: 25,
  /** A new flock fills a ball of this radius around its anchor. */
  SPREAD: 30,
  /** Wake: a swarm around the ship's path, from BACK behind the ship to LENGTH
   *  more, between INNER (clear of the hull) and WIDTH out from the path. Both
   *  grow with the wake: a big haul is a wide one. It is short, so the chase
   *  camera can keep all of it in view. */
  BACK: 1, LENGTH: 5, LENGTH_PER_BIRD: 1 / 12, LENGTH_MAX: 16,
  INNER: 2.4, WIDTH: 3, WIDTH_PER_ROOT: 0.6, WIDTH_MAX: 14,
  /** How hard a wake bird is pulled to its place, how hard it matches the
   *  ship's velocity, how fast the wake turns about its axis, its top speed. */
  FOLLOW: 9, MATCH: 5, SWIRL: 0.7, WAKE_SPEED: 130,
  /** The ship's path is remembered every TRAIL_STEP units, TRAIL samples back. */
  TRAIL: 24, TRAIL_STEP: 1,
  /** A bird knocked out of the wake cannot be caught again for this long. */
  SPOOK: 3,
  /** A banked bird streams through the gate for up to this long, then rejoins the wild flock. */
  STREAM: 1.3,
  /** Brightness by state; a fresh catch flashes. */
  GLOW_WILD: 0.62, GLOW_WAKE: 1, GLOW_CATCH: 2,
};

/**
 * @param {number} capacity
 * @param {() => number} random
 */
export function createFlock(capacity, random) {
  const flock = {
    capacity,
    /** Birds in play: the rest of the pool is idle (a slow phone flies fewer). */
    count: capacity,
    pos: new Float32Array(capacity * 3), vel: new Float32Array(capacity * 3),
    state: new Uint8Array(capacity),
    /** Seconds left: wild = cannot be caught yet, banked = until it is gone. */
    timer: new Float32Array(capacity),
    /** Brightness the view draws each bird with. */
    glow: new Float32Array(capacity),
    /** Each bird's own place in a wake: how far along it, at what angle, how far out (0..1). */
    place: new Float32Array(capacity * 3),
    wild: capacity, wake: 0,
    /** Centre of the wild birds: what the flock marker points at. */
    centre: { x: 0, y: 0, z: 0 },
    /** The ship's recent path, newest at `head`. */
    trail: new Float32Array(FLOCK.TRAIL * 3), head: 0, travelled: 0,
  };
  for (let i = 0; i < capacity; i++) {
    flock.place[i * 3] = random();
    flock.place[i * 3 + 1] = random() * Math.PI * 2;
    flock.place[i * 3 + 2] = Math.sqrt(random());
  }
  return flock;
}

/** A random point in a ball, written to (out[at], out[at + 1], out[at + 2]). */
function ball(out, at, x, y, z, inner, outer, random) {
  const cos = random() * 2 - 1, sin = Math.sqrt(1 - cos * cos), angle = random() * Math.PI * 2;
  const radius = inner + (outer - inner) * Math.cbrt(random());
  out[at] = x + Math.cos(angle) * sin * radius;
  out[at + 1] = y + cos * radius * 0.6;
  out[at + 2] = z + Math.sin(angle) * sin * radius;
}

function release(flock, i, anchor, random) {
  ball(flock.pos, i * 3, anchor.x, anchor.y, anchor.z, 0, FLOCK.SPREAD, random);
  for (let k = 0; k < 3; k++) flock.vel[i * 3 + k] = (random() - 0.5) * 20;
  flock.state[i] = WILD;
  flock.timer[i] = 0;
  flock.glow[i] = FLOCK.GLOW_WILD;
}

/** Every bird wild again, around `anchor`. */
export function resetFlock(flock, count, anchor, random) {
  flock.count = Math.min(flock.capacity, count);
  for (let i = 0; i < flock.capacity; i++) release(flock, i, anchor, random);
  flock.wild = flock.count; flock.wake = 0;
  flock.centre.x = anchor.x; flock.centre.y = anchor.y; flock.centre.z = anchor.z;
}

/** Forget the ship's path: it now leads straight back from (x, y, z) along −direction. */
export function resetTrail(flock, x, y, z, dx, dy, dz) {
  for (let k = 0; k < FLOCK.TRAIL; k++) {
    const at = ((flock.head - k + FLOCK.TRAIL) % FLOCK.TRAIL) * 3, back = k * FLOCK.TRAIL_STEP;
    flock.trail[at] = x - dx * back; flock.trail[at + 1] = y - dy * back; flock.trail[at + 2] = z - dz * back;
  }
  flock.travelled = 0;
}

/** Wake birds go back to the wild, scared: a wreck, the clock, or the caller's reason. */
export function scatterWake(flock) {
  for (let i = 0; i < flock.count; i++) {
    if (flock.state[i] !== WAKE) continue;
    flock.state[i] = WILD;
    flock.timer[i] = FLOCK.SPOOK;
  }
  flock.wild += flock.wake; flock.wake = 0;
}

/** The wake is banked: every bird in it streams out. Returns how many. */
export function bankWake(flock) {
  let banked = 0;
  for (let i = 0; i < flock.count; i++) {
    if (flock.state[i] !== WAKE) continue;
    flock.state[i] = BANKED;
    // The head of the wake goes first.
    flock.timer[i] = FLOCK.STREAM * (0.55 + 0.45 * flock.place[i * 3]);
    banked++;
  }
  flock.wake = 0;
  return banked;
}

export const wakeLength = birds => Math.min(FLOCK.LENGTH_MAX, FLOCK.LENGTH + birds * FLOCK.LENGTH_PER_BIRD);
export const wakeWidth = birds => Math.min(FLOCK.WIDTH_MAX, FLOCK.WIDTH + FLOCK.WIDTH_PER_ROOT * Math.sqrt(birds));

/**
 * Advance every bird by `h` seconds. `env` is the world around them:
 *   x0..z1    the ship's path during this step (catching sweeps the whole of it)
 *   vx,vy,vz  the ship's velocity
 *   anchor    the point the wild flock roams around
 *   flee, fleeForce, wildSpeed   how the wild birds answer the hull
 *   catching  whether a wild bird near the hull joins the wake
 *   catchRadius
 *   rocks, near, nearCount   the belt and the indices of the rocks close to the ship
 *   stream    where banked birds fly to
 *   time, random
 * Returns nothing; `env.caught` and `env.shed` count what happened.
 */
export function stepFlock(flock, h, env) {
  const { pos, vel, state, timer, glow, place, trail, count } = flock;
  const { x0, y0, z0, x1, y1, z1, anchor, rocks, near, nearCount, stream, random } = env;
  const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0, edge2 = ex * ex + ey * ey + ez * ez;
  const flee = env.flee, flee2 = flee * flee, catch2 = env.catchRadius * env.catchRadius;
  const near2 = FLOCK.NEAR * FLOCK.NEAR, ease = Math.min(1, h * 5);

  // The ship's path, for the wake to follow.
  flock.travelled += Math.sqrt(edge2);
  while (flock.travelled >= FLOCK.TRAIL_STEP) {
    flock.travelled -= FLOCK.TRAIL_STEP;
    flock.head = (flock.head + 1) % FLOCK.TRAIL;
    trail[flock.head * 3] = x1; trail[flock.head * 3 + 1] = y1; trail[flock.head * 3 + 2] = z1;
  }
  // The wake's cross-section is drawn across the ship's direction of travel.
  let dx = env.vx, dy = env.vy, dz = env.vz;
  const speed = Math.hypot(dx, dy, dz) || 1;
  dx /= speed; dy /= speed; dz /= speed;
  let rx = -dz, rz = dx;
  const flat = Math.hypot(rx, rz) || 1;
  rx /= flat; rz /= flat;
  const ux = -rz * dy, uy = rz * dx - rx * dz, uz = rx * dy;
  const length = wakeLength(flock.wake), width = wakeWidth(flock.wake);

  let wild = 0, wake = 0, sumX = 0, sumY = 0, sumZ = 0;
  env.caught = 0; env.shed = 0;
  for (let i = 0; i < count; i++) {
    const at = i * 3;
    let px = pos[at], py = pos[at + 1], pz = pos[at + 2];
    let vx = vel[at], vy = vel[at + 1], vz = vel[at + 2];
    let kind = state[i], limit = FLOCK.WAKE_SPEED, shine = FLOCK.GLOW_WILD;

    if (kind === WILD) {
      let cx = 0, cy = 0, cz = 0, ax = 0, ay = 0, az = 0, sx = 0, sy = 0, sz = 0, others = 0;
      for (let k = 1; k <= FLOCK.NEIGHBOURS; k++) {
        const j = (i + k * FLOCK.STRIDE) % count;
        if (state[j] !== WILD) continue;
        const o = j * 3, ox = pos[o] - px, oy = pos[o + 1] - py, oz = pos[o + 2] - pz;
        cx += ox; cy += oy; cz += oz;
        ax += vel[o]; ay += vel[o + 1]; az += vel[o + 2];
        const d2 = ox * ox + oy * oy + oz * oz;
        if (d2 < near2 && d2 > 1e-3) { sx -= ox / d2; sy -= oy / d2; sz -= oz / d2; }
        others++;
      }
      if (others) {
        const c = FLOCK.COHESION / others * h, a = FLOCK.ALIGN / others * h, s = FLOCK.SEPARATION * h;
        vx += cx * c + ax * a + sx * s; vy += cy * c + ay * a + sy * s; vz += cz * c + az * a + sz * s;
      }
      const home = FLOCK.HOME * h;
      vx += (anchor.x - px) * home; vy += (anchor.y - py) * home; vz += (anchor.z - pz) * home;
      // Flee the hull: harder the closer it is.
      const fx = px - x1, fy = py - y1, fz = pz - z1, f2 = fx * fx + fy * fy + fz * fz;
      if (f2 < flee2) {
        const f = Math.sqrt(f2) || 1, push = (1 - f / flee) * env.fleeForce * h / f;
        vx += fx * push; vy += fy * push; vz += fz * push;
        limit = env.wildSpeed;
      } else {
        // Out of reach it settles back to its cruising speed.
        limit = Math.max(FLOCK.CRUISE, Math.hypot(vel[at], vel[at + 1], vel[at + 2]) - FLOCK.CALM * h);
      }
      if (timer[i] > 0) timer[i] -= h;
    } else if (kind === WAKE) {
      // Its place: a point on the path the ship flew, pushed out across it.
      const back = FLOCK.BACK + place[at] * length;
      const sample = ((flock.head - Math.min(FLOCK.TRAIL - 1, Math.round(back / FLOCK.TRAIL_STEP)) + FLOCK.TRAIL) % FLOCK.TRAIL) * 3;
      const angle = place[at + 1] + env.time * FLOCK.SWIRL;
      // A cone: tight by the ship, opening out behind it.
      const out = FLOCK.INNER + place[at + 2] * (width - FLOCK.INNER) * (0.45 + 0.55 * place[at]);
      const side = Math.cos(angle) * out, lift = Math.sin(angle) * out;
      const tx = trail[sample] + rx * side + ux * lift;
      const ty = trail[sample + 1] + uy * lift;
      const tz = trail[sample + 2] + rz * side + uz * lift;
      const follow = FLOCK.FOLLOW * h, match = Math.min(1, FLOCK.MATCH * h);
      vx += (tx - px) * follow + (env.vx - vx) * match;
      vy += (ty - py) * follow + (env.vy - vy) * match;
      vz += (tz - pz) * follow + (env.vz - vz) * match;
      shine = FLOCK.GLOW_WAKE;
    } else {
      // Banked: through the gate and away.
      const pull = 4 * h, drag = Math.min(1, 2 * h);
      vx += (stream.x - px) * pull - vx * drag;
      vy += (stream.y - py) * pull - vy * drag;
      vz += (stream.z - pz) * pull - vz * drag;
      timer[i] -= h;
      shine = Math.max(0, timer[i] / FLOCK.STREAM) * FLOCK.GLOW_WAKE;
    }

    const pace = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    if (pace > limit) { const k = limit / pace; vx *= k; vy *= k; vz *= k; }
    else if (kind === WILD && pace < FLOCK.MIN_SPEED) { const k = FLOCK.MIN_SPEED / pace; vx *= k; vy *= k; vz *= k; }
    px += vx * h; py += vy * h; pz += vz * h;

    if (kind === WILD) {
      if (env.catching && timer[i] <= 0) {
        // Nearest point of the ship's path to the bird.
        const t = edge2 > 0 ? Math.max(0, Math.min(1, ((px - x0) * ex + (py - y0) * ey + (pz - z0) * ez) / edge2)) : 0;
        const qx = px - x0 - ex * t, qy = py - y0 - ey * t, qz = pz - z0 - ez * t;
        if (qx * qx + qy * qy + qz * qz < catch2) {
          kind = state[i] = WAKE;
          glow[i] = FLOCK.GLOW_CATCH;
          env.caught++;
        }
      }
    } else if (kind === WAKE) {
      for (let n = 0; n < nearCount; n++) {
        const r = near[n], qx = px - rocks.x[r], qy = py - rocks.y[r], qz = pz - rocks.z[r];
        if (qx * qx + qy * qy + qz * qz >= rocks.r[r] * rocks.r[r]) continue; // a rock still growing is that small
        // A rock: back to the wild, bounced off it, too scared to be caught at once.
        const q = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1, kick = 30 / q;
        vx = qx * kick; vy = qy * kick; vz = qz * kick;
        kind = state[i] = WILD;
        timer[i] = FLOCK.SPOOK;
        env.shed++;
        break;
      }
    } else if (timer[i] <= 0) {
      release(flock, i, anchor, random);
      wild++;
      sumX += pos[at]; sumY += pos[at + 1]; sumZ += pos[at + 2];
      continue;
    }

    pos[at] = px; pos[at + 1] = py; pos[at + 2] = pz;
    vel[at] = vx; vel[at + 1] = vy; vel[at + 2] = vz;
    glow[i] += (shine - glow[i]) * ease;
    if (kind === WILD) { wild++; sumX += px; sumY += py; sumZ += pz; }
    else if (kind === WAKE) wake++;
  }
  flock.wild = wild; flock.wake = wake;
  const centre = flock.centre;
  if (wild) { centre.x = sumX / wild; centre.y = sumY / wild; centre.z = sumZ / wild; }
  else { centre.x = anchor.x; centre.y = anchor.y; centre.z = anchor.z; }
}

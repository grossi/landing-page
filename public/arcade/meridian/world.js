// MERIDIAN's world: the surface, the city and where a gate may stand.
// Plain math, no DOM and no three.js, so the tests can step it directly.

/** Lattice cell size. The surface is the triangle mesh over this lattice, so
 *  what the ship collides with is exactly what the terrain grid draws. */
export const CX = 7, CZ = 7;
/** The ship stays within ±HALF of the track's centre line. */
export const HALF = 84;
/** Track length of one sector, and of the crossfade into the next one. */
export const SPAN = 1500, BLEND = 300;
export const RANGES = 0, CITY = 1, SEA = 2, SHARDS = 3;
export const SECTORS = ['THE RANGES', 'THE CITY', 'THE SEA', 'THE SHARDS'];
/** City layout: rows of towers across LANES lanes, the first row CITY_IN
 *  into the sector. The last row ends before the crossfade to the sea. */
export const LANES = 9, LANE_W = 20, ROW_D = 40, CITY_IN = 80, CITY_ROWS = 27;

export const laneX = lane => (lane - (LANES - 1) / 2) * LANE_W;
const smooth = t => t * t * (3 - 2 * t);

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

const hash = (x, z) => {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Pass as the time to read the sea at the top of its swell, whatever the moment. */
export const HIGH_TIDE = Infinity;

/** Height of each sector's ground at a point of the track, before blending. */
const FIELD = [
  (x, d) => noise(x / 44, d / 44) * 17 + noise(x / 100 + 40, d / 100) * 11 - 8,
  () => 0,
  (x, d, t) => (t === HIGH_TIDE ? 4 : Math.sin(x / 21 + t * 1.1) * 1.6 + Math.sin(d / 34 + t * 0.8) * 2.4) +
    noise(x / 50, d / 50) * 2 - 5,
  (x, d) => { const n = noise(x / 26, d / 26); return (n > 0.62 ? (n - 0.62) * 110 : n * 6) - 5; },
];

/**
 * `d` is distance along the track. `origin` is where the current run began, so
 * sectors and laps count from there; `ox`/`oz` shift the noise so every run
 * crosses different ground. `epoch` changes whenever ground already drawn
 * stops being valid.
 */
export function createWorld(random = Math.random) {
  const world = {
    origin: 0, ox: 0, oz: 0, seed: 1, epoch: 0,
    sectorAt, surface, animated, cityRows, rowsNear, crestNear, reseed, restartAt,
  };
  const cities = new Map();

  function sectorAt(d) {
    const q = Math.max(0, d - world.origin);
    const ordinal = Math.floor(q / SPAN);
    const p = q - ordinal * SPAN;
    return {
      ordinal, p, index: ordinal % SECTORS.length, lap: Math.floor(ordinal / SECTORS.length) + 1,
      blend: p > SPAN - BLEND ? smooth((p - (SPAN - BLEND)) / BLEND) : 0,
    };
  }

  function raw(x, d, t) {
    const { index, blend } = sectorAt(d);
    const a = FIELD[index](x + world.ox, d + world.oz, t);
    if (blend === 0) return a;
    return a + (FIELD[(index + 1) % FIELD.length](x + world.ox, d + world.oz, t) - a) * blend;
  }

  /** The drawn surface: each lattice cell is two triangles split on its B–C diagonal. */
  function surface(x, d, t) {
    const i = Math.floor(x / CX), j = Math.floor(d / CZ);
    const u = x / CX - i, v = d / CZ - j;
    const b = raw((i + 1) * CX, j * CZ, t), c = raw(i * CX, (j + 1) * CZ, t);
    if (u + v <= 1) {
      const a = raw(i * CX, j * CZ, t);
      return a + (b - a) * u + (c - a) * v;
    }
    const e = raw((i + 1) * CX, (j + 1) * CZ, t);
    return e + (c - e) * (1 - u) + (b - e) * (1 - v);
  }

  /** Whether the ground at `d` moves with time (the sea, and the fade into it). */
  function animated(d) {
    const { index, blend } = sectorAt(d);
    return index === SEA || (blend > 0 && (index + 1) % SECTORS.length === SEA);
  }

  /**
   * The towers of the city in sector `ordinal`. One lane walk guarantees a way
   * through: consecutive rows always share a free lane, and the walk moves at
   * most one lane every second row, so following it never asks for more than
   * 20 units sideways per 80 of travel. Later laps leave fewer free lanes
   * beside it. Nothing gets through without steering: every lane is walled
   * across its full width in one row, so every straight line meets a tower.
   */
  function cityRows(ordinal) {
    let rows = cities.get(ordinal);
    if (rows) return rows;
    rows = [];
    const lap = Math.floor(ordinal / SECTORS.length) + 1;
    const rng = mulberry32(world.seed ^ Math.imul(ordinal + 1, 0x9e3779b1));
    const freeChance = Math.max(0.1, 0.35 - 0.08 * (lap - 1));
    const wide = lap < 3;
    let corridor = Math.floor(LANES / 2), partner = corridor + 1;
    for (let k = 0; k < CITY_ROWS; k++) {
      if (k > 0 && k % 2 === 0) {
        if (wide) {
          // Always a step, never straight on; at the edge of the city, back inward.
          const step = rng() < 0.5 ? -1 : 1;
          corridor += corridor + step < 1 || corridor + step > LANES - 2 ? -step : step;
        } else {
          // Step onto one of the previous row's two free lanes (always, the first
          // time, so no lane is the way through from end to end), then open a neighbour.
          if (rng() < 0.5 || k === 2) corridor = partner;
          partner = corridor + (rng() < 0.5 ? -1 : 1);
          if (partner < 0 || partner >= LANES) partner = corridor - (partner - corridor);
        }
      }
      const towers = [];
      for (let lane = 0; lane < LANES; lane++) {
        const free = wide ? Math.abs(lane - corridor) <= 1 : lane === corridor || lane === partner;
        // Draw the dice even for free lanes so one lane's roll never shifts another's.
        const open = rng() < (k < 2 ? 0.75 : freeChance);
        const h = 8 + rng() * 34, w = 10 + rng() * 6, depth = 10 + rng() * 9;
        const x = laneX(lane) + (rng() - 0.5) * 3;
        if (!free && !open) towers.push({ lane, x, w, depth, h });
      }
      rows.push({ d: world.origin + ordinal * SPAN + CITY_IN + k * ROW_D, k, ordinal, corridor, towers });
    }
    // Wall each lane once. A row may wall any lane but its own free lane and the
    // next row's, which is the lane the two rows share: the way through stays.
    for (let lane = 0; lane < LANES; lane++) {
      const allowed = rows.filter((row, k) =>
        lane !== row.corridor && lane !== rows[Math.min(k + 1, rows.length - 1)].corridor);
      // Past the open entrance if possible, and off the free lane's neighbours.
      const inside = allowed.filter(row => row.k >= 2);
      const clear = inside.filter(row => Math.abs(lane - row.corridor) > 1);
      const from = clear.length ? clear : inside.length ? inside : allowed;
      const row = from[Math.floor(rng() * from.length)];
      let tower = row.towers.find(candidate => candidate.lane === lane);
      if (!tower) row.towers.push(tower = { lane, x: 0, w: 0, depth: 10 + rng() * 9, h: 8 + rng() * 34 });
      tower.x = laneX(lane); tower.w = LANE_W;
    }
    cities.set(ordinal, rows);
    return rows;
  }

  /** City rows whose centre lies within `reach` of `d`. */
  function rowsNear(d, reach, out = []) {
    out.length = 0;
    const first = sectorAt(d - reach).ordinal, last = sectorAt(d + reach).ordinal;
    for (let ordinal = first; ordinal <= last; ordinal++) {
      if (ordinal % SECTORS.length !== CITY) continue;
      for (const row of cityRows(ordinal)) if (Math.abs(row.d - d) <= reach) out.push(row);
    }
    return out;
  }

  /**
   * Highest the ground ever gets within `radius` across the track at `d`: a gate
   * stands clear of this. The surface is flat between lattice points, so its
   * highest point over a span is at one of the lattice points around it; the
   * sea is read at high tide.
   */
  function crestNear(x, d, radius) {
    let top = -Infinity;
    for (let i = Math.floor((x - radius) / CX); i <= Math.ceil((x + radius) / CX); i++) {
      for (let j = Math.floor(d / CZ); j <= Math.ceil(d / CZ); j++) top = Math.max(top, raw(i * CX, j * CZ, HIGH_TIDE));
    }
    return top;
  }

  /** New ground for a new run. Everything drawn so far is stale. */
  function reseed() {
    world.ox = Math.floor(random() * 4096);
    world.oz = Math.floor(random() * 4096);
    world.seed = Math.floor(random() * 2 ** 31);
    world.origin = 0;
    world.epoch++;
    cities.clear();
  }

  /** Begin counting sectors at `d` without touching the ground around it. */
  function restartAt(d) {
    world.origin = d;
    cities.clear();
  }

  return world;
}

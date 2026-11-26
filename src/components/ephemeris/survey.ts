import { ENVELOPE_RADII } from 'engine/core/motion';

/**
 * EPHEMERIS survey rules: the clock, the fuel, scan progress, contact values,
 * the daily seed and the kept bests. Pure on purpose: no DOM, no three.js and
 * no clock of its own (its one import is a constant of the flight law), so
 * the tests step it with any `dt` and the sim (createEphemeris) only feeds
 * it what the nearest-body pass already knows.
 */

/** Every kind of contact the world produces, plus `anomaly` as the fallback. */
export type ContactKind =
  | 'star'
  | 'planet'
  | 'ringedPlanet'
  | 'cluster'
  | 'binary'
  | 'monoliths'
  | 'comet'
  | 'swarm'
  | 'nebula'
  | 'station'
  | 'pulsar'
  | 'anomaly';

/**
 * HUD label and survey value per kind. Cheap and common at the top, rare at
 * the bottom; `rarestContact` reads the same order. `anomaly` is what a POI
 * the classifier does not recognise is worth, so a new engine archetype is
 * never worth nothing (survey.world.test.ts fails until it gets a real kind).
 */
export const CONTACT_KINDS: Record<
  ContactKind,
  {
    label: string;
    value: number;
    /** A formation with no surface: it is scanned from inside it. */
    enter?: boolean;
    /** A body scanned from at least this far out (km), however small it is. */
    minRange?: number;
  }
> = {
  star: { label: 'STAR', value: 50 },
  planet: { label: 'PLANET', value: 100 },
  anomaly: { label: 'CONTACT', value: 100 },
  ringedPlanet: { label: 'RINGED PLANET', value: 150 },
  cluster: { label: 'ASTEROID CLUSTER', value: 150, enter: true },
  binary: { label: 'BINARY STAR', value: 200 },
  monoliths: { label: 'MONOLITH FIELD', value: 200, enter: true },
  // The home comet runs its orbit at 190 to 440 km/s, faster than a ship may
  // close on so small a body. From `minRange` out the flight law lets a burn
  // keep pace behind it, and keeping pace is what scans it.
  comet: { label: 'COMET', value: 300, minRange: 800 },
  swarm: { label: 'COMET SWARM', value: 300, enter: true },
  nebula: { label: 'NEBULA', value: 300, enter: true },
  station: { label: 'DERELICT STATION', value: 400 },
  pulsar: { label: 'PULSAR', value: 500 },
};

/**
 * The numbers of the game, set by scripted play (tests/engine/surveyTuning.test.ts
 * flies whole windows with a scripted pilot and prints what each style scores).
 */
export const TUNE = {
  /** Length of one survey window (seconds). The clock never stops. */
  WINDOW_SECONDS: 240,
  /** Seconds in range, at scan speed, to log a contact. */
  SCAN_SECONDS: 1.5,
  /**
   * Above this speed relative to the body (km/s) a scan does not fill: no
   * drive-by logging. Cruise is 100, so slowing down is coming off the burn.
   */
  SCAN_MAX_SPEED: 150,
  /** Seconds of burn in a full tank. */
  TANK_SECONDS: 40,
  /**
   * Share of the tank one scan gives back: 5 s of burn. A contact costs a
   * brisk pilot 5 to 6 s of burn, so the tank runs down slowly over a window
   * and a hand that never lets go of the burn runs it dry. At the planned
   * quarter of a tank it never left full; at a tenth, a spread-out home
   * system ran even a careful pilot dry before the first minute and a half.
   */
  REFUEL: 0.125,
  /** Contacts outside the home system pay this multiple. */
  OUT_SYSTEM_MULT: 2,
  /** After the window closes, input is ignored this long (seconds). */
  RETRY_LOCK_SECONDS: 0.6,
} as const;

/**
 * What the classifier reads off a POI. Structural, so the engine's `Poi`
 * feeds it through a two-line adapter (contacts.ts) and the tests feed it
 * plain objects.
 */
export interface ContactTraits {
  name: string;
  solid: boolean;
  /** The LOD body behind the POI, when it has one. */
  body?: 'star' | 'planet' | 'asteroid';
  /** Whether a planet carries a ring. */
  ringed?: boolean;
}

/**
 * Kind of a contact. Bodies with a LOD registration are told apart by it;
 * everything else by the name its builder gives it (engine/world/sectorContent
 * names every archetype with a fixed prefix or suffix). The pairing with the
 * real builders is pinned by survey.world.test.ts.
 */
export function classifyContact(traits: ContactTraits): ContactKind {
  const { name } = traits;
  if (name.startsWith('PULSAR ')) return 'pulsar';
  if (name.includes(' STATION')) return 'station';
  if (name.endsWith(' BINARY')) return 'binary';
  if (name.endsWith(' NEBULA')) return 'nebula';
  if (name.endsWith(' CLUSTER')) return 'cluster';
  if (name.endsWith(' MONOLITHS')) return 'monoliths';
  if (name.endsWith(' SWARM')) return 'swarm';
  if (name.endsWith(' COMET')) return 'comet';
  if (traits.body === 'star') return 'star';
  if (traits.body === 'planet') return traits.ringed ? 'ringedPlanet' : 'planet';
  return 'anomaly';
}

/** Points a scan of `kind` pays: the kind's value, doubled outside the home system. */
export function contactValue(kind: ContactKind, home: boolean): number {
  return CONTACT_KINDS[kind].value * (home ? 1 : TUNE.OUT_SYSTEM_MULT);
}

/**
 * Surface distance inside which a body of `radius` is logged on first
 * approach in FREE DRIFT, as it always was. The cap binds for the sprawling
 * diffuse volumes (nebulae reach 2,940, clusters 2,598, swarms 2,400), which
 * would otherwise log from most of a cell away; the biggest solid bodies
 * stay under it (rogue 960 → 1,152, home sun 800 → 960).
 */
export function discoveryRange(radius: number): number {
  return Math.max(150, Math.min(radius * 1.2, 1200));
}

/**
 * Surface distance inside which a body can be scanned.
 *
 * - A body with an atmospheric envelope (planets, stars, the pulsar, a
 *   binary pair): the envelope, `ENVELOPE_RADII` radii out. That is where
 *   the HUD announces the body and the flight law starts to hold the ship
 *   back, and the body is whole in the view. The old logging range is so
 *   close that the surface fills the screen before the ring starts.
 * - A solid body without one (the comet, the derelict station): the range
 *   it has always been logged from, or its kind's wider one.
 * - A formation (nebula, cluster, swarm, monolith field): zero, its own
 *   edge. Its radius is thousands of kilometres of mostly nothing, and a
 *   scan from outside that would fill with no dust or rock near the ship.
 */
export function scanRange(radius: number, kind: ContactKind, envelope: boolean): number {
  const { enter, minRange = 0 } = CONTACT_KINDS[kind];
  if (enter) return 0;
  return envelope ? radius * ENVELOPE_RADII : Math.max(discoveryRange(radius), minRange);
}

export interface SurveyCandidate {
  id: string;
  name: string;
  kind: ContactKind;
  /** In the home system (pays ×1) or beyond it (pays `OUT_SYSTEM_MULT`). */
  home: boolean;
}

export interface ScannedContact extends SurveyCandidate {
  /** Points paid, multiplier included. */
  value: number;
}

export interface SurveyState {
  /** Seconds left in the window. */
  timeLeft: number;
  /** Tank level, 0..1. */
  fuel: number;
  score: number;
  /** The body being scanned, or null. */
  scanId: string | null;
  /** 0..1 fill of the scan ring. */
  scanProgress: number;
  /** In range, but faster past the body than `SCAN_MAX_SPEED`: the ring is not filling. */
  tooFast: boolean;
  /** Contacts logged this window, in scan order. */
  scanned: ScannedContact[];
  scannedIds: Set<string>;
  /** The window has closed; nothing changes after that. */
  closed: boolean;
}

export function createSurvey(): SurveyState {
  return {
    timeLeft: TUNE.WINDOW_SECONDS,
    fuel: 1,
    score: 0,
    scanId: null,
    scanProgress: 0,
    tooFast: false,
    scanned: [],
    scannedIds: new Set(),
    closed: false,
  };
}

/** Back to a fresh window, in place (the sim holds one state for the mount). */
export function resetSurvey(state: SurveyState): void {
  state.timeLeft = TUNE.WINDOW_SECONDS;
  state.fuel = 1;
  state.score = 0;
  state.scanId = null;
  state.scanProgress = 0;
  state.tooFast = false;
  state.scanned.length = 0;
  state.scannedIds.clear();
  state.closed = false;
}

/** Whether a burn may fire this frame. An empty tank cruises until the next scan. */
export function canBurn(state: SurveyState): boolean {
  return !state.closed && state.fuel > 0;
}

/**
 * The scan stays on the body it started on for as long as that body is in
 * range, so two overlapping ranges never trade the ring back and forth.
 * Called per in-range, unscanned body while the sim walks the POIs: returns
 * true when `id` at `dist` should replace the current pick.
 */
export function prefersCandidate(
  scanId: string | null,
  pickId: string | null,
  pickDist: number,
  id: string,
  dist: number,
): boolean {
  if (pickId === null) return true;
  if (pickId === scanId) return false;
  if (id === scanId) return true;
  return dist < pickDist;
}

export interface SurveyFrame {
  /** The burn actually firing this frame (input held and `canBurn`). */
  burning: boolean;
  /** Speed relative to the candidate, km/s (the ship's own speed when there is none). */
  speed: number;
  /** The in-range, unscanned body to scan, or null when none is in range. */
  candidate: SurveyCandidate | null;
}

/**
 * One step of the window. The clock runs whatever else happens; a burn drains
 * the tank; the ring fills while a candidate is in range and the ship is slow
 * enough past it, and runs back down while it is too fast. A full ring logs the
 * contact: score, a quarter of a tank, and the ring is free for the next one.
 * Returns the contact logged by this step, or null.
 *
 * The step is cut at the moment the window closes, so a slow frame cannot
 * finish a scan after the clock ran out and a closed survey never changes.
 */
export function stepSurvey(state: SurveyState, dt: number, frame: SurveyFrame): ScannedContact | null {
  if (state.closed || !(dt > 0)) return null;
  const step = Math.min(dt, state.timeLeft);
  state.timeLeft -= step;

  if (frame.burning && state.fuel > 0) {
    state.fuel = Math.max(0, state.fuel - step / TUNE.TANK_SECONDS);
  }

  let logged: ScannedContact | null = null;
  const { candidate } = frame;
  if (!candidate || state.scannedIds.has(candidate.id)) {
    state.scanId = null;
    state.scanProgress = 0;
    state.tooFast = false;
  } else {
    if (candidate.id !== state.scanId) {
      state.scanId = candidate.id;
      state.scanProgress = 0;
    }
    state.tooFast = frame.speed > TUNE.SCAN_MAX_SPEED;
    const delta = step / TUNE.SCAN_SECONDS;
    state.scanProgress = state.tooFast
      ? Math.max(0, state.scanProgress - delta)
      : state.scanProgress + delta;
    // the epsilon keeps 90 frames of 1/60 s from landing a hair under 1
    if (state.scanProgress >= 1 - 1e-9) {
      logged = { ...candidate, value: contactValue(candidate.kind, candidate.home) };
      state.scanned.push(logged);
      state.scannedIds.add(candidate.id);
      state.score += logged.value;
      state.fuel = Math.min(1, state.fuel + TUNE.REFUEL);
      state.scanId = null;
      state.scanProgress = 0;
      state.tooFast = false;
    }
  }

  if (state.timeLeft <= 1e-9) {
    state.timeLeft = 0;
    state.closed = true;
    state.scanId = null;
    state.scanProgress = 0;
    state.tooFast = false;
  }
  return logged;
}

/** The most valuable kind logged (the earliest of equals), for the end screen. */
export function rarestContact(scanned: readonly ScannedContact[]): ScannedContact | null {
  let rarest: ScannedContact | null = null;
  for (const contact of scanned) {
    if (!rarest || CONTACT_KINDS[contact.kind].value > CONTACT_KINDS[rarest.kind].value) rarest = contact;
  }
  return rarest;
}

/** `3:07` for the HUD. Rounds up, so the clock reads 0:00 only when it is over. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds - 1e-9));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// ---- the daily system ----

export interface SurveySeed {
  /** World seed handed to the engine (32-bit). */
  seed: number;
  /** What the system is called on screen and in the best-score key. */
  label: string;
  /** True for the system of the day, however it was asked for. */
  daily: boolean;
}

/** The UTC date as `YYYYMMDD`: one system per day, the same for everyone. */
export function dailyLabel(now: Date): string {
  return String(now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate());
}

/**
 * FNV-1a over the label. Days are consecutive numbers, and feeding those to
 * the engine as they are would start neighbouring days' generators one
 * apart; the hash spreads them over the whole 32 bits.
 */
export function seedFromLabel(label: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

/** Longest `?seed=` kept; it ends up in a storage key and on the title screen. */
const SEED_LABEL_MAX = 24;

/**
 * The system of this visit: `?seed=` when given, else the UTC date. The
 * value is reduced to lower-case letters, digits, `-` and `_`, so
 * `?seed=20261126` is that day's system with that day's best, and
 * `?seed=Khevel` is a system of its own. An empty or unusable value falls
 * back to the day.
 */
export function resolveSeed(search: string, now: Date): SurveySeed {
  const raw = new URLSearchParams(search).get('seed') ?? '';
  const today = dailyLabel(now);
  const label = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, SEED_LABEL_MAX) || today;
  return { seed: seedFromLabel(label), label, daily: label === today };
}

// ---- bests ----

/** The slice of `Storage` the bests need (tests pass a plain object). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** All-time best, across every system. */
export const BEST_KEY = 'ephemeris.best';
/** Best in one system: the day's, or a `?seed=` one. */
export const bestKeyFor = (label: string): string => `${BEST_KEY}.${label}`;

function readNumber(storage: StorageLike | null, key: string): number {
  try {
    const value = Number(storage?.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export interface Bests {
  /** Best in this system. */
  seed: number;
  /** Best in any system. */
  allTime: number;
}

/** Storage that throws or is missing (private mode, blocked site data) reads as no best. */
export function readBests(storage: StorageLike | null, label: string): Bests {
  return { seed: readNumber(storage, bestKeyFor(label)), allTime: readNumber(storage, BEST_KEY) };
}

export interface RecordedScore extends Bests {
  newSeedBest: boolean;
  newAllTimeBest: boolean;
}

/**
 * Keeps `score` where it beats the system's best and the all-time best.
 * A zero is never a best. A write that throws leaves the result standing for
 * this visit: the end screen still says what happened.
 */
export function recordScore(storage: StorageLike | null, label: string, score: number): RecordedScore {
  const before = readBests(storage, label);
  const newSeedBest = score > before.seed;
  const newAllTimeBest = score > before.allTime;
  try {
    if (newSeedBest) storage?.setItem(bestKeyFor(label), String(score));
    if (newAllTimeBest) storage?.setItem(BEST_KEY, String(score));
  } catch {
    // nothing to do: the best is simply not kept
  }
  return {
    seed: Math.max(before.seed, score),
    allTime: Math.max(before.allTime, score),
    newSeedBest,
    newAllTimeBest,
  };
}

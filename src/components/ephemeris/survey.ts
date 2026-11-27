/**
 * EPHEMERIS rules: the four-minute loop, the five finds and when each one
 * answers, signal strength, the scan, the dark that ends the loop, the day's
 * log that survives it, and the daily seed. Pure on purpose: no DOM, no
 * three.js and no clock of its own, so the tests step it with any `dt` and the
 * sim (createEphemeris) only feeds it what it measures: which find is in
 * range, how fast the ship is going past it.
 */

/** The day's five finds, in the order a first loop tends to meet them. */
export type FindId = 'relay' | 'wreck' | 'bell' | 'passenger' | 'light';
export const FIND_IDS: readonly FindId[] = ['relay', 'wreck', 'bell', 'passenger', 'light'];

/** The numbers of the game. */
export const TUNE = {
  /** Length of one loop (seconds). */
  WINDOW_SECONDS: 240,
  /** From this second of the loop the dark closes in, until the loop ends. */
  DARK_STARTS: 180,
  /** Seconds in range, slow enough, to log a find. */
  SCAN_SECONDS: 1.5,
  /**
   * Above this speed relative to the find (km/s) the scan does not fill.
   * Cruise is 100, so slowing down is coming off the burn.
   */
  SCAN_MAX_SPEED: 150,
  /** Distance (km) inside which a find can be logged. */
  FIND_RANGE: 600,
  /** Off the nose by more than this (radians, 60°) a signal is silent. */
  SIGNAL_CONE: Math.PI / 3,
  /** Within this of the nose (radians, 4°) a signal is at full strength. */
  SIGNAL_FOCUS: (4 * Math.PI) / 180,
  /**
   * A find no note has told you of is heard only this close (km): the home
   * system, roughly. One a note has told you of is heard from anywhere. So
   * the far finds are found through the log, and the log is the progress.
   */
  HEAR_RANGE: 15000,
  /** After a loop ends, input is ignored this long (seconds). */
  RETRY_LOCK_SECONDS: 0.6,
} as const;

/** What each find is. When it answers is the day's (`Schedule`). */
export interface FindRule {
  /** As the HUD names it. */
  label: string;
  /** Distance (km) inside which it can be logged. */
  range: number;
  /** Fastest the ship may pass it (km/s, relative) and still log it. */
  maxSpeed: number;
  /** The find whose note tells you about it, or null if only a signal does. */
  toldBy: FindId | null;
}

export const FINDS: Record<FindId, FindRule> = {
  // first, and straight ahead of the start: the first seconds teach the game
  relay: { label: 'RELAY', range: TUNE.FIND_RANGE, maxSpeed: TUNE.SCAN_MAX_SPEED, toldBy: null },
  // far, beyond the home system; told of by the passenger, tells of the light
  wreck: { label: 'WRECK', range: TUNE.FIND_RANGE, maxSpeed: TUNE.SCAN_MAX_SPEED, toldBy: 'passenger' },
  // answers for fifty seconds only (when is the day's), far out; told of
  // only by the late light, which shows after the bell has stopped: a loop
  // that learns of it cannot use it, the next one can
  bell: { label: 'BELL', range: TUNE.FIND_RANGE, maxSpeed: TUNE.SCAN_MAX_SPEED, toldBy: 'light' },
  // rides the home comet, which runs at 190 to 440 km/s: logged by keeping
  // pace with it, which a wider range and a looser match make possible
  passenger: { label: 'PASSENGER', range: 1000, maxSpeed: 250, toldBy: 'relay' },
  // only shows once the dark comes in, in the home system's belt
  light: { label: 'LATE LIGHT', range: TUNE.FIND_RANGE, maxSpeed: TUNE.SCAN_MAX_SPEED, toldBy: 'wreck' },
};

/** When each find answers: seconds into the loop it opens, and closes. */
export type Schedule = Record<FindId, readonly [number, number]>;

/** Seconds the bell answers for. */
export const BELL_SECONDS = 50;

/**
 * The day's schedule. Most finds answer all loop; the late light only in the
 * dark (that is what it is); the bell for fifty seconds starting somewhere
 * between 1:00 and 1:50, from the seed, so a day cannot be played from the
 * memory of another. It always closes before the dark, so the light that
 * tells of it comes too late for the loop that finds the light.
 */
export function daySchedule(seed: number): Schedule {
  const bellOpens = 60 + ((seed >>> 0) % 51);
  return {
    relay: [0, TUNE.WINDOW_SECONDS],
    wreck: [0, TUNE.WINDOW_SECONDS],
    bell: [bellOpens, bellOpens + BELL_SECONDS],
    passenger: [0, TUNE.WINDOW_SECONDS],
    light: [TUNE.DARK_STARTS, TUNE.WINDOW_SECONDS],
  };
}

/** Whether a find answers `elapsed` seconds into the loop. */
export function isOpen(id: FindId, elapsed: number, schedule: Schedule): boolean {
  const [opensAt, closesAt] = schedule[id];
  return elapsed >= opensAt && elapsed < closesAt;
}

/** `1:20`: a moment of the loop, for notes and the log. */
export function formatMoment(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Names of the places the notes point at (sector names, from the seed). */
export interface Places {
  wreck: string;
  bell: string;
}

/**
 * What logging `id` tells you. Each note points at another find: where it
 * is, and when it answers if that matters. Short, so a note fits a phone.
 */
export function findNote(id: FindId, places: Places, schedule: Schedule): string {
  switch (id) {
    case 'relay':
      return 'SOMETHING RIDES THE COMET';
    case 'passenger':
      return `A WRECK LIES PAST ${places.wreck}`;
    case 'wreck':
      return 'WHEN THE DARK COMES IN, A LIGHT IN THE BELT';
    case 'light':
      return `A BELL ANSWERS PAST ${places.bell}, ${formatMoment(schedule.bell[0])} TO ${formatMoment(schedule.bell[1])}`;
    case 'bell':
      return 'IT ANSWERS FOR FIFTY SECONDS A LOOP';
  }
}

// ---- signals ----

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * How strong a find's signal reads, 0..1, with the nose `offNose` radians
 * off its direction and the find `distance` km away. Pointing is most of it:
 * silent beyond `SIGNAL_CONE`, full within `SIGNAL_FOCUS`, smooth between, so
 * turning toward a signal always makes it stronger. Distance is the rest: a
 * find in the home system reads at full, one a sector away at about half.
 */
export function signalStrength(offNose: number, distance: number): number {
  const aim = (TUNE.SIGNAL_CONE - offNose) / (TUNE.SIGNAL_CONE - TUNE.SIGNAL_FOCUS);
  if (!(aim > 0)) return 0;
  const cone = smooth(Math.min(1, aim));
  // 1 within 5 Mm, 0.5 at 50 Mm, never below 0.35
  const near = 5000;
  const reach = Math.max(0.35, 1 - 0.5 * Math.log10(Math.max(distance, near) / near));
  return cone * reach;
}

/** How far the dark has closed in, 0..1: nothing before `DARK_STARTS`, black at the end. */
export function darkness(elapsed: number): number {
  const t = (elapsed - TUNE.DARK_STARTS) / (TUNE.WINDOW_SECONDS - TUNE.DARK_STARTS);
  return t <= 0 ? 0 : t >= 1 ? 1 : smooth(t);
}

// ---- the loop ----

/**
 * Free drift keeps the experience as it was: a contact is logged on the
 * first approach inside this surface distance. The cap binds for the
 * sprawling diffuse volumes (nebulae reach 2,940, clusters 2,598, swarms
 * 2,400); the biggest solid bodies stay under it.
 */
export function discoveryRange(radius: number): number {
  return Math.max(150, Math.min(radius * 1.2, 1200));
}

export interface LoopState {
  /** Seconds left in the loop. */
  timeLeft: number;
  /** The find being scanned, or null. */
  scanId: FindId | null;
  /** 0..1 fill of the scan ring. */
  scanProgress: number;
  /** In range, but passing the find faster than its `maxSpeed`: the ring is not filling. */
  tooFast: boolean;
  /** Finds logged today, this loop and earlier ones. */
  logged: Set<FindId>;
  /** Finds logged in this loop, in order. */
  loggedNow: FindId[];
  /** The loop is over: the dark came in, or the log is complete. */
  closed: boolean;
  /** All five are logged. */
  charted: boolean;
  /** When each find answers, this day. */
  schedule: Schedule;
}

/** Seconds since the loop began. */
export const elapsedOf = (state: LoopState): number => TUNE.WINDOW_SECONDS - state.timeLeft;

export function createLoop(logged: Iterable<FindId> = [], schedule: Schedule = daySchedule(0)): LoopState {
  const state: LoopState = {
    schedule,
    timeLeft: TUNE.WINDOW_SECONDS,
    scanId: null,
    scanProgress: 0,
    tooFast: false,
    logged: new Set(),
    loggedNow: [],
    closed: false,
    charted: false,
  };
  resetLoop(state, logged);
  return state;
}

/** A fresh loop, in place, carrying the day's log. */
export function resetLoop(state: LoopState, logged: Iterable<FindId>): void {
  state.timeLeft = TUNE.WINDOW_SECONDS;
  state.scanId = null;
  state.scanProgress = 0;
  state.tooFast = false;
  state.logged.clear();
  for (const id of logged) if (FIND_IDS.includes(id)) state.logged.add(id);
  state.loggedNow.length = 0;
  state.closed = false;
  state.charted = false;
}

/** Finds that answer now and are not logged: the ones that send a signal. */
export function listening(state: LoopState): FindId[] {
  const elapsed = elapsedOf(state);
  return FIND_IDS.filter((id) => !state.logged.has(id) && isOpen(id, elapsed, state.schedule));
}

/** Whether a note in the log has told you of `id` (the relay needs none: it is where you start). */
export function isTold(state: LoopState, id: FindId): boolean {
  const teller = FINDS[id].toldBy;
  return teller === null || state.logged.has(teller);
}

/** Whether `id`'s signal reaches a ship `distance` km away: from anywhere once told of, else only near. */
export function isHeard(state: LoopState, id: FindId, distance: number): boolean {
  return isTold(state, id) || distance <= TUNE.HEAR_RANGE;
}

export interface LoopFrame {
  /** Speed relative to the candidate, km/s. */
  speed: number;
  /** The unlogged, answering find in range, or null. */
  candidate: FindId | null;
}

/**
 * One step of the loop. The clock runs whatever else happens. The ring fills
 * while an answering, unlogged find is in range and the ship is slow enough
 * past it, and runs back down while it is too fast. A full ring logs the
 * find. Logging the last of the five charts the system and ends the loop.
 * Returns the find logged by this step, or null.
 *
 * The step is cut where the loop ends, so a slow frame cannot finish a scan
 * after the dark, and a find that stops answering mid-scan loses the ring.
 */
export function stepLoop(state: LoopState, dt: number, frame: LoopFrame): FindId | null {
  if (state.closed || !(dt > 0)) return null;
  const step = Math.min(dt, state.timeLeft);
  // the find must answer during the whole step, judged where the step began
  const startedAt = elapsedOf(state);
  state.timeLeft -= step;

  let logged: FindId | null = null;
  const { candidate } = frame;
  if (!candidate || state.logged.has(candidate) || !isOpen(candidate, startedAt, state.schedule)) {
    state.scanId = null;
    state.scanProgress = 0;
    state.tooFast = false;
  } else {
    if (candidate !== state.scanId) {
      state.scanId = candidate;
      state.scanProgress = 0;
    }
    state.tooFast = frame.speed > FINDS[candidate].maxSpeed;
    const delta = step / TUNE.SCAN_SECONDS;
    state.scanProgress = state.tooFast
      ? Math.max(0, state.scanProgress - delta)
      : state.scanProgress + delta;
    // the epsilon keeps 90 frames of 1/60 s from landing a hair under 1
    if (state.scanProgress >= 1 - 1e-9) {
      logged = candidate;
      state.logged.add(candidate);
      state.loggedNow.push(candidate);
      state.scanId = null;
      state.scanProgress = 0;
      state.tooFast = false;
      if (state.logged.size === FIND_IDS.length) {
        state.charted = true;
        state.closed = true;
      }
    }
  }

  if (state.timeLeft <= 1e-9) {
    state.timeLeft = 0;
    state.closed = true;
  }
  if (state.closed) {
    state.scanId = null;
    state.scanProgress = 0;
    state.tooFast = false;
  }
  return logged;
}

/**
 * The scan stays on the find it started on for as long as that find is in
 * range, so two overlapping ranges never trade the ring back and forth.
 * Returns true when `id` at `dist` should replace the current pick.
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

/** `3:07` for the HUD. Rounds up, so the clock reads 0:00 only when it is over. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds - 1e-9));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// ---- the daily system ----

export interface SurveySeed {
  /** World seed handed to the engine (32-bit). */
  seed: number;
  /** What the system is called on screen and in the log's key. */
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
 * `?seed=20261126` is that day's system with that day's log, and
 * `?seed=Khevel` is a system of its own. An empty or unusable value falls
 * back to the day.
 */
export function resolveSeed(search: string, now: Date): SurveySeed {
  const raw = new URLSearchParams(search).get('seed') ?? '';
  const today = dailyLabel(now);
  const label = raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, SEED_LABEL_MAX) || today;
  return { seed: seedFromLabel(label), label, daily: label === today };
}

// ---- the day's log ----

/** The slice of `Storage` the log needs (tests pass a plain object). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What survives the loop, for one system. */
export interface DayLog {
  /** Finds logged, in the order they were. */
  logged: FindId[];
  /** Loops started on this log. */
  loops: number;
  /** Fewest loops in which this system was charted, 0 if never. */
  best: number;
}

/** The day's log: `ephemeris.log.<day>`, JSON. */
export const logKeyFor = (label: string): string => `ephemeris.log.${label}`;
/** Days charted, across every system: the all-time record. */
export const CHARTED_KEY = 'ephemeris.charted';

const emptyLog = (): DayLog => ({ logged: [], loops: 0, best: 0 });
const count = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;

/** Storage that throws, is missing or holds junk reads as an empty log. */
export function readLog(storage: StorageLike | null, label: string): DayLog {
  try {
    const raw = storage?.getItem(logKeyFor(label));
    if (!raw) return emptyLog();
    const data = JSON.parse(raw) as Partial<Record<keyof DayLog, unknown>>;
    const logged = Array.isArray(data.logged)
      ? FIND_IDS.filter((id) => (data.logged as unknown[]).includes(id))
      : [];
    // keep the order they were logged in
    if (Array.isArray(data.logged)) {
      logged.sort((a, b) => (data.logged as unknown[]).indexOf(a) - (data.logged as unknown[]).indexOf(b));
    }
    return { logged, loops: count(data.loops), best: count(data.best) };
  } catch {
    return emptyLog();
  }
}

function writeLog(storage: StorageLike | null, label: string, log: DayLog): void {
  try {
    storage?.setItem(logKeyFor(label), JSON.stringify(log));
  } catch {
    // the log is simply not kept past this visit
  }
}

/** Days charted so far, all-time. */
export function readCharted(storage: StorageLike | null): number {
  try {
    return count(Number(storage?.getItem(CHARTED_KEY)));
  } catch {
    return 0;
  }
}

/**
 * A loop starts: count it, and return the log it starts from. On a charted
 * system the log starts over, so the day can be charted again in fewer
 * loops; the best is kept.
 */
export function beginLoop(storage: StorageLike | null, label: string): DayLog {
  const before = readLog(storage, label);
  const charted = before.logged.length === FIND_IDS.length;
  const log: DayLog = {
    logged: charted ? [] : before.logged,
    loops: (charted ? 0 : before.loops) + 1,
    best: before.best,
  };
  writeLog(storage, label, log);
  return log;
}

export interface ChartResult {
  /** The loop it took. */
  loops: number;
  /** Fewest loops so far, this one included. */
  best: number;
  newBest: boolean;
  /** Days charted all-time, this one included. */
  charted: number;
}

/**
 * Forgets the day's log, so the system can be flown again from nothing:
 * nothing logged, no loops counted. The best stays, and so do the days
 * charted: they are records of what was done.
 */
export function forgetLog(storage: StorageLike | null, label: string): DayLog {
  const log: DayLog = { logged: [], loops: 0, best: readLog(storage, label).best };
  writeLog(storage, label, log);
  return log;
}

/**
 * Keeps a find the moment it is logged, so it survives the loop, a reload
 * or a closed tab. When that was the fifth, the system is charted: the loop
 * count is checked against the best, and a first charting of the day counts
 * toward the all-time record. Returns that result when charted, else null.
 */
export function recordFind(storage: StorageLike | null, label: string, id: FindId): ChartResult | null {
  const log = readLog(storage, label);
  if (!log.logged.includes(id)) log.logged.push(id);
  if (log.logged.length < FIND_IDS.length) {
    writeLog(storage, label, log);
    return null;
  }
  const loops = Math.max(1, log.loops);
  const firstTime = log.best === 0;
  const newBest = firstTime || loops < log.best;
  if (newBest) log.best = loops;
  writeLog(storage, label, log);
  let charted = readCharted(storage);
  if (firstTime) {
    charted += 1;
    try {
      storage?.setItem(CHARTED_KEY, String(charted));
    } catch {
      // not kept
    }
  }
  return { loops, best: log.best, newBest, charted };
}

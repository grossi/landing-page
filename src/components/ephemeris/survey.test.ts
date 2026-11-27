import { describe, expect, it } from 'vitest';
import {
  beginLoop,
  CHARTED_KEY,
  createLoop,
  dailyLabel,
  darkness,
  daySchedule,
  discoveryRange,
  elapsedOf,
  FIND_IDS,
  findNote,
  FINDS,
  formatClock,
  forgetLog,
  formatMoment,
  isHeard,
  isOpen,
  isTold,
  listening,
  logKeyFor,
  prefersCandidate,
  readCharted,
  readLog,
  recordFind,
  resetLoop,
  resolveSeed,
  seedFromLabel,
  signalStrength,
  stepLoop,
  TUNE,
  type FindId,
  type LoopState,
} from 'components/ephemeris/survey';

/** Steps `seconds` of a loop in frames of `dt`, with one frame's facts held throughout. */
function run(
  state: LoopState,
  seconds: number,
  frame: { speed?: number; candidate?: FindId | null } = {},
  dt = 1 / 60,
) {
  const logged: FindId[] = [];
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) {
    const id = stepLoop(state, dt, { speed: frame.speed ?? 100, candidate: frame.candidate ?? null });
    if (id) logged.push(id);
  }
  return logged;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (name: string) => data.get(name) ?? null,
    setItem: (name: string, value: string) => { data.set(name, value); },
  };
}

const deg = (d: number) => (d * Math.PI) / 180;
const places = { wreck: 'KHEVEL EXPANSE', bell: 'ORAMIR DEEP' };
/** A day whose bell answers 1:20 to 2:10 (60 + 20). */
const day = daySchedule(20);

describe('the five finds', () => {
  it('are five, each with a name and a range', () => {
    expect(FIND_IDS).toEqual(['relay', 'wreck', 'bell', 'passenger', 'light']);
    for (const id of FIND_IDS) {
      expect(FINDS[id].label, id).toMatch(/^[A-Z ]+$/);
      expect(FINDS[id].range, id).toBeGreaterThan(0);
    }
  });

  it('answer at set times: the bell for fifty seconds, the light from 3:00, the rest all loop', () => {
    expect(day.bell).toEqual([80, 130]);
    for (const id of ['relay', 'wreck', 'passenger'] as const) {
      expect(isOpen(id, 0, day), id).toBe(true);
      expect(isOpen(id, 239.9, day), id).toBe(true);
    }
    expect(isOpen('bell', 79.9, day)).toBe(false);
    expect(isOpen('bell', 80, day)).toBe(true);
    expect(isOpen('bell', 129.9, day)).toBe(true);
    expect(isOpen('bell', 130, day)).toBe(false);
    expect(isOpen('light', 179.9, day)).toBe(false);
    expect(isOpen('light', 180, day)).toBe(true);
    expect(TUNE.DARK_STARTS).toBe(180);
  });

  it('the bell\'s window comes from the seed: somewhere from 1:00 to 1:50, always shut before the dark', () => {
    const opens = new Set<number>();
    for (let seed = 0; seed < 2000; seed += 7) {
      const [a, b] = daySchedule(seed * 2654435761).bell;
      expect(a).toBeGreaterThanOrEqual(60);
      expect(a).toBeLessThanOrEqual(110);
      expect(b - a).toBe(50);
      expect(b).toBeLessThan(TUNE.DARK_STARTS);
      opens.add(a);
    }
    expect(opens.size).toBeGreaterThan(30);
    expect(daySchedule(12345)).toEqual(daySchedule(12345));
  });

  it('only the unlogged ones that answer now send a signal', () => {
    const state = createLoop(['relay'], day);
    expect(listening(state)).toEqual(['wreck', 'passenger']);
    run(state, 100);
    expect(listening(state)).toEqual(['wreck', 'bell', 'passenger']);
    run(state, 85);
    expect(listening(state)).toEqual(['wreck', 'passenger', 'light']);
  });

  it('each note points at another find, and every find is pointed at but the relay', () => {
    const toldOf = new Set<FindId>();
    for (const id of FIND_IDS) {
      const note = findNote(id, places, day);
      expect(note.length, id).toBeLessThan(60);
      expect(note, id).toMatch(/^[A-Z0-9 ,:.]+$/);
      const told = FIND_IDS.find((other) => FINDS[other].toldBy === id);
      if (told) toldOf.add(told);
    }
    expect([...toldOf].sort()).toEqual(['bell', 'light', 'passenger', 'wreck']);
    expect(findNote('light', places, day)).toBe('A BELL ANSWERS PAST ORAMIR DEEP, 1:20 TO 2:10');
    expect(findNote('light', places, daySchedule(5))).toBe('A BELL ANSWERS PAST ORAMIR DEEP, 1:05 TO 1:55');
    expect(findNote('passenger', places, day)).toContain('KHEVEL EXPANSE');
    expect(findNote('wreck', places, day)).toContain('DARK');
    expect(findNote('relay', places, day)).toContain('COMET');
  });

  it('formats moments of the loop', () => {
    expect(formatMoment(80)).toBe('1:20');
    expect(formatMoment(130)).toBe('2:10');
    expect(formatMoment(0)).toBe('0:00');
  });
});

describe('what the log has told you', () => {
  it('a find no note told you of is heard only near; once told, from anywhere', () => {
    const fresh = createLoop();
    expect(isTold(fresh, 'relay')).toBe(true);
    expect(isHeard(fresh, 'relay', 1e6)).toBe(true);
    expect(isTold(fresh, 'wreck')).toBe(false);
    expect(isHeard(fresh, 'wreck', TUNE.HEAR_RANGE)).toBe(true);
    expect(isHeard(fresh, 'wreck', TUNE.HEAR_RANGE + 1)).toBe(false);
    const told = createLoop(['passenger']);
    expect(isHeard(told, 'wreck', 1e6)).toBe(true);
  });

  it('the chain: relay, passenger, wreck, light, then the bell', () => {
    expect(FINDS.relay.toldBy).toBeNull();
    expect(FINDS.passenger.toldBy).toBe('relay');
    expect(FINDS.wreck.toldBy).toBe('passenger');
    expect(FINDS.light.toldBy).toBe('wreck');
    expect(FINDS.bell.toldBy).toBe('light');
  });

  it('the bell is told of only after its window has closed in that loop, every day', () => {
    // the light that tells of it opens after the bell has stopped answering
    expect(FINDS.bell.toldBy).toBe('light');
    for (const seed of [0, 1, 50, 99, 4294967295]) {
      const schedule = daySchedule(seed);
      expect(schedule.light[0]).toBeGreaterThanOrEqual(schedule.bell[1]);
    }
  });
});

describe('signals', () => {
  it('are strongest pointing straight at the find, and silent past 60° off the nose', () => {
    expect(signalStrength(0, 3000)).toBe(1);
    expect(signalStrength(deg(4), 3000)).toBe(1);
    expect(signalStrength(deg(60), 3000)).toBe(0);
    expect(signalStrength(deg(90), 3000)).toBe(0);
    expect(signalStrength(Math.PI, 3000)).toBe(0);
  });

  it('grow every time the nose turns toward the find', () => {
    let last = -1;
    for (let d = 59; d >= 4; d--) {
      const now = signalStrength(deg(d), 3000);
      expect(now, `${d}°`).toBeGreaterThan(last);
      last = now;
    }
  });

  it('read weaker far away, but never too weak to follow', () => {
    expect(signalStrength(0, 5000)).toBe(1);
    expect(signalStrength(0, 50000)).toBeCloseTo(0.5, 9);
    expect(signalStrength(0, 1e9)).toBe(0.35);
    expect(signalStrength(0, 20000)).toBeLessThan(signalStrength(0, 10000));
  });

  it('a near find straight ahead outreads a far one at the same angle', () => {
    expect(signalStrength(deg(20), 4000)).toBeGreaterThan(signalStrength(deg(20), 40000));
  });
});

describe('the dark', () => {
  it('is nothing before 3:00 and black at 4:00, closing in smoothly', () => {
    expect(darkness(0)).toBe(0);
    expect(darkness(180)).toBe(0);
    expect(darkness(210)).toBeCloseTo(0.5, 9);
    expect(darkness(240)).toBe(1);
    let last = 0;
    for (let t = 181; t <= 240; t++) {
      expect(darkness(t), `${t}`).toBeGreaterThanOrEqual(last);
      last = darkness(t);
    }
  });
});

describe('scan', () => {
  it('logs a find after the scan time in range at cruise, once', () => {
    const state = createLoop();
    expect(run(state, TUNE.SCAN_SECONDS - 0.1, { candidate: 'relay' })).toEqual([]);
    expect(state.scanId).toBe('relay');
    expect(state.scanProgress).toBeGreaterThan(0.9);
    expect(run(state, 0.2, { candidate: 'relay' })).toEqual(['relay']);
    expect([...state.logged]).toEqual(['relay']);
    expect(state.loggedNow).toEqual(['relay']);
    expect(state.scanId).toBeNull();
    expect(run(state, 3, { candidate: 'relay' })).toEqual([]);
  });

  it('does not fill too fast, and runs back down', () => {
    const state = createLoop();
    run(state, 1, { candidate: 'wreck' });
    const filled = state.scanProgress;
    run(state, 0.5, { candidate: 'wreck', speed: TUNE.SCAN_MAX_SPEED + 1 });
    expect(state.tooFast).toBe(true);
    expect(state.scanProgress).toBeLessThan(filled);
    run(state, 5, { candidate: 'wreck', speed: 4000 });
    expect(state.scanProgress).toBe(0);
    expect(state.logged.size).toBe(0);
    // exactly at the limit is slow enough
    expect(run(state, TUNE.SCAN_SECONDS + 0.1, { candidate: 'wreck', speed: TUNE.SCAN_MAX_SPEED })).toEqual(['wreck']);
  });

  it('starts over when the find leaves range or another takes its place', () => {
    const state = createLoop();
    run(state, 1.2, { candidate: 'relay' });
    run(state, 0.1, { candidate: null });
    expect(state.scanProgress).toBe(0);
    run(state, 1.2, { candidate: 'relay' });
    run(state, 0.2, { candidate: 'passenger' });
    expect(state.scanId).toBe('passenger');
    expect(state.scanProgress).toBeLessThan(0.2);
  });

  it('a find that does not answer yet cannot be logged, however close', () => {
    const state = createLoop([], day);
    run(state, 70, { candidate: 'bell' });
    expect(state.scanProgress).toBe(0);
    expect(state.logged.has('bell')).toBe(false);
    run(state, 10);
    expect(run(state, 2, { candidate: 'bell' })).toEqual(['bell']);
  });

  it('a find that stops answering mid-scan loses the ring', () => {
    const state = createLoop([], day);
    run(state, 129);
    run(state, 0.9, { candidate: 'bell' });
    expect(state.scanProgress).toBeGreaterThan(0.5);
    run(state, 0.3, { candidate: 'bell' });
    expect(state.logged.has('bell')).toBe(false);
    expect(state.scanProgress).toBe(0);
  });

  it('takes the same time on slow frames as on fast ones', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 20]) {
      const state = createLoop();
      run(state, TUNE.SCAN_SECONDS - 2 * dt, { candidate: 'relay' }, dt);
      expect(state.logged.size, `dt ${dt}`).toBe(0);
      run(state, 4 * dt, { candidate: 'relay' }, dt);
      expect(state.logged.size, `dt ${dt}`).toBe(1);
    }
  });

  it('keeps the ring on the find it started on while it stays in range', () => {
    expect(prefersCandidate(null, null, Infinity, 'a', 500)).toBe(true);
    expect(prefersCandidate(null, 'a', 500, 'b', 300)).toBe(true);
    expect(prefersCandidate('a', 'a', 500, 'b', 10)).toBe(false);
    expect(prefersCandidate('a', 'b', 10, 'a', 500)).toBe(true);
  });
});

describe('the loop', () => {
  it('is four minutes and ends on its own', () => {
    const state = createLoop();
    run(state, 239.9);
    expect(state.closed).toBe(false);
    expect(elapsedOf(state)).toBeCloseTo(239.9, 6);
    run(state, 0.2);
    expect(state.closed).toBe(true);
    expect(state.charted).toBe(false);
    expect(state.timeLeft).toBe(0);
  });

  it('does not stop for scans', () => {
    const state = createLoop();
    run(state, 30, { candidate: 'relay' });
    expect(state.timeLeft).toBeCloseTo(210, 5);
  });

  it('cannot log after the dark, even on one long frame', () => {
    const state = createLoop();
    run(state, 239);
    expect(stepLoop(state, 10, { speed: 0, candidate: 'light' })).toBeNull();
    expect(state.closed).toBe(true);
    expect(state.logged.size).toBe(0);
  });

  it('a scan that completes on the closing frame still counts', () => {
    const state = createLoop();
    run(state, 240 - TUNE.SCAN_SECONDS);
    run(state, TUNE.SCAN_SECONDS, { candidate: 'light' });
    expect(state.closed).toBe(true);
    expect(state.logged.has('light')).toBe(true);
  });

  it('changes nothing once over', () => {
    const state = createLoop();
    run(state, 241);
    run(state, 30, { candidate: 'relay' });
    expect(state.logged.size).toBe(0);
    expect(state.scanProgress).toBe(0);
  });

  it('carries the day\'s log in, and logging the last find charts the system and ends the loop', () => {
    const state = createLoop(['relay', 'wreck', 'bell', 'passenger']);
    expect(listening(state)).toEqual([]);
    run(state, 181);
    expect(listening(state)).toEqual(['light']);
    expect(run(state, 2, { candidate: 'light' })).toEqual(['light']);
    expect(state.charted).toBe(true);
    expect(state.closed).toBe(true);
    expect(state.loggedNow).toEqual(['light']);
    expect(state.timeLeft).toBeGreaterThan(50);
  });

  it('a loop that starts fresh keeps only known finds from the log', () => {
    const state = createLoop();
    run(state, 100, { candidate: 'relay' });
    resetLoop(state, ['wreck', 'junk' as FindId]);
    expect([...state.logged]).toEqual(['wreck']);
    expect(state.loggedNow).toEqual([]);
    expect(state.timeLeft).toBe(TUNE.WINDOW_SECONDS);
    expect(state.closed).toBe(false);
  });

  it('formats the clock so 0:00 means over', () => {
    expect(formatClock(240)).toBe('4:00');
    expect(formatClock(239.2)).toBe('4:00');
    expect(formatClock(0.01)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
  });

  it('free drift logs a contact on first approach, from the range it always had', () => {
    expect(discoveryRange(100)).toBe(150);
    expect(discoveryRange(500)).toBe(600);
    expect(discoveryRange(5000)).toBe(1200);
  });
});

describe('the day\'s log', () => {
  it('starts empty, counts loops, and keeps a find the moment it is logged', () => {
    const storage = memoryStorage();
    expect(readLog(storage, '20261127')).toEqual({ logged: [], loops: 0, best: 0 });
    expect(beginLoop(storage, '20261127')).toEqual({ logged: [], loops: 1, best: 0 });
    expect(recordFind(storage, '20261127', 'relay')).toBeNull();
    expect(recordFind(storage, '20261127', 'passenger')).toBeNull();
    expect(readLog(storage, '20261127')).toEqual({ logged: ['relay', 'passenger'], loops: 1, best: 0 });
    // the next loop starts from it
    expect(beginLoop(storage, '20261127')).toEqual({ logged: ['relay', 'passenger'], loops: 2, best: 0 });
    // another day is its own log
    expect(readLog(storage, '20261128').logged).toEqual([]);
    expect(storage.data.has(logKeyFor('20261127'))).toBe(true);
  });

  it('a find logged twice is kept once', () => {
    const storage = memoryStorage();
    beginLoop(storage, 'x');
    recordFind(storage, 'x', 'relay');
    recordFind(storage, 'x', 'relay');
    expect(readLog(storage, 'x').logged).toEqual(['relay']);
  });

  it('charting: the loops it took, the best, and the days charted all-time', () => {
    const storage = memoryStorage();
    beginLoop(storage, 'day1');
    for (const id of ['relay', 'wreck', 'bell', 'passenger'] as const) recordFind(storage, 'day1', id);
    beginLoop(storage, 'day1');
    expect(recordFind(storage, 'day1', 'light')).toEqual({ loops: 2, best: 2, newBest: true, charted: 1 });
    expect(readCharted(storage)).toBe(1);
    expect(storage.data.get(CHARTED_KEY)).toBe('1');

    // on a charted system the next loop starts a fresh log; the best stays
    expect(beginLoop(storage, 'day1')).toEqual({ logged: [], loops: 1, best: 2 });
    for (const id of ['relay', 'wreck', 'bell', 'passenger'] as const) recordFind(storage, 'day1', id);
    // charted again in one loop: a new best, but not a new day charted
    expect(recordFind(storage, 'day1', 'light')).toEqual({ loops: 1, best: 1, newBest: true, charted: 1 });

    // charted again in three: not a best
    beginLoop(storage, 'day1');
    beginLoop(storage, 'day1');
    beginLoop(storage, 'day1');
    for (const id of FIND_IDS.slice(0, 4)) recordFind(storage, 'day1', id);
    expect(recordFind(storage, 'day1', 'light')).toMatchObject({ loops: 3, best: 1, newBest: false });

    // a second day counts toward the all-time record
    beginLoop(storage, 'day2');
    for (const id of FIND_IDS.slice(0, 4)) recordFind(storage, 'day2', id);
    expect(recordFind(storage, 'day2', 'light')).toMatchObject({ charted: 2, newBest: true });
  });

  it('can be forgotten: nothing logged, no loops, the best and the days charted kept', () => {
    const storage = memoryStorage();
    beginLoop(storage, 'x');
    for (const id of FIND_IDS) recordFind(storage, 'x', id);
    beginLoop(storage, 'x');
    recordFind(storage, 'x', 'relay');
    expect(readLog(storage, 'x')).toEqual({ logged: ['relay'], loops: 1, best: 1 });
    expect(forgetLog(storage, 'x')).toEqual({ logged: [], loops: 0, best: 1 });
    expect(readLog(storage, 'x')).toEqual({ logged: [], loops: 0, best: 1 });
    expect(readCharted(storage)).toBe(1);
    // the next loop is loop 1 of a fresh log
    expect(beginLoop(storage, 'x')).toEqual({ logged: [], loops: 1, best: 1 });
    // another day's log is untouched
    beginLoop(storage, 'y');
    recordFind(storage, 'y', 'wreck');
    forgetLog(storage, 'x');
    expect(readLog(storage, 'y').logged).toEqual(['wreck']);
    expect(forgetLog(null, 'x')).toEqual({ logged: [], loops: 0, best: 0 });
  });

  it('reads junk as an empty log and keeps the known finds of a damaged one', () => {
    expect(readLog(memoryStorage({ [logKeyFor('x')]: 'not json' }), 'x')).toEqual({ logged: [], loops: 0, best: 0 });
    const damaged = memoryStorage({
      [logKeyFor('x')]: JSON.stringify({ logged: ['bell', 'nope', 'relay', 'bell'], loops: -3, best: 2.5 }),
    });
    expect(readLog(damaged, 'x')).toEqual({ logged: ['bell', 'relay'], loops: 0, best: 0 });
    expect(readCharted(memoryStorage({ [CHARTED_KEY]: 'abc' }))).toBe(0);
  });

  it('works without storage and with storage that throws', () => {
    expect(readLog(null, 'x')).toEqual({ logged: [], loops: 0, best: 0 });
    expect(beginLoop(null, 'x')).toEqual({ logged: [], loops: 1, best: 0 });
    expect(recordFind(null, 'x', 'relay')).toBeNull();
    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(readLog(broken, 'x')).toEqual({ logged: [], loops: 0, best: 0 });
    expect(beginLoop(broken, 'x').loops).toBe(1);
    expect(readCharted(broken)).toBe(0);
  });
});

describe('the daily system', () => {
  const noon = new Date(Date.UTC(2026, 10, 26, 12));

  it('is the UTC date', () => {
    expect(dailyLabel(noon)).toBe('20261126');
    expect(resolveSeed('', noon)).toEqual({ seed: seedFromLabel('20261126'), label: '20261126', daily: true });
  });

  it('is the same all UTC day and changes at midnight', () => {
    const first = new Date(Date.UTC(2026, 10, 26, 0, 0, 1));
    const last = new Date(Date.UTC(2026, 10, 26, 23, 59, 59));
    expect(resolveSeed('', first)).toEqual(resolveSeed('', last));
    expect(dailyLabel(new Date('2026-11-26T23:30:00-05:00'))).toBe('20261127');
    const next = resolveSeed('', new Date(Date.UTC(2026, 10, 27, 0, 0, 1)));
    expect(next.seed).not.toBe(resolveSeed('', noon).seed);
  });

  it('?seed= overrides the day, and a date replays that day', () => {
    expect(resolveSeed('?seed=khevel', noon)).toEqual({ seed: seedFromLabel('khevel'), label: 'khevel', daily: false });
    expect(resolveSeed('?seed=20261126', noon)).toEqual(resolveSeed('', noon));
    expect(resolveSeed('?seed=Khevel%20Deep!', noon).label).toBe('kheveldeep');
    expect(resolveSeed('?seed=', noon).daily).toBe(true);
    expect(resolveSeed(`?seed=${'a'.repeat(200)}`, noon).label).toHaveLength(24);
  });
});

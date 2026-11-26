import { describe, expect, it } from 'vitest';
import {
  BEST_KEY,
  bestKeyFor,
  canBurn,
  classifyContact,
  CONTACT_KINDS,
  contactValue,
  createSurvey,
  dailyLabel,
  discoveryRange,
  formatClock,
  prefersCandidate,
  rarestContact,
  readBests,
  recordScore,
  resetSurvey,
  resolveSeed,
  scanRange,
  seedFromLabel,
  stepSurvey,
  TUNE,
  type ContactKind,
  type SurveyCandidate,
  type SurveyState,
} from 'components/ephemeris/survey';

const planet: SurveyCandidate = { id: 'home:1', name: 'VELORA-1', kind: 'planet', home: true };
const pulsar: SurveyCandidate = { id: '2,0,1:0', name: 'PULSAR KHEVEL', kind: 'pulsar', home: false };

/** Steps `seconds` of a window in frames of `dt`, with one frame's facts held throughout. */
function run(
  state: SurveyState,
  seconds: number,
  frame: { burning?: boolean; speed?: number; candidate?: SurveyCandidate | null } = {},
  dt = 1 / 60,
) {
  const logged = [];
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) {
    const contact = stepSurvey(state, dt, {
      burning: frame.burning ?? false,
      speed: frame.speed ?? 100,
      candidate: frame.candidate ?? null,
    });
    if (contact) logged.push(contact);
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

describe('scan', () => {
  it('fills over the scan time while a body is in range at cruise, then logs it once', () => {
    const state = createSurvey();
    expect(run(state, TUNE.SCAN_SECONDS - 0.1, { candidate: planet })).toEqual([]);
    expect(state.scanId).toBe('home:1');
    expect(state.scanProgress).toBeGreaterThan(0.9);
    expect(state.scanned).toHaveLength(0);

    const logged = run(state, 0.2, { candidate: planet });
    expect(logged).toEqual([{ ...planet, value: 100 }]);
    expect(state.score).toBe(100);
    expect(state.scannedIds.has('home:1')).toBe(true);
    // the ring is free again, and the body cannot be logged a second time
    expect(state.scanId).toBeNull();
    expect(run(state, 5, { candidate: planet })).toEqual([]);
    expect(state.score).toBe(100);
  });

  it('does not fill with nothing in range', () => {
    const state = createSurvey();
    run(state, 10, { candidate: null });
    expect(state.scanProgress).toBe(0);
    expect(state.scanned).toHaveLength(0);
  });

  it('does not fill at burn speed, and says so', () => {
    const state = createSurvey();
    run(state, 10, { candidate: planet, speed: TUNE.SCAN_MAX_SPEED + 1 });
    expect(state.tooFast).toBe(true);
    expect(state.scanProgress).toBe(0);
    expect(state.scanned).toHaveLength(0);
    // exactly at the limit is slow enough
    expect(run(state, TUNE.SCAN_SECONDS + 0.1, { candidate: planet, speed: TUNE.SCAN_MAX_SPEED })).toHaveLength(1);
  });

  it('runs back down while too fast, so a ring half filled is not kept for a drive-by', () => {
    const state = createSurvey();
    run(state, 1, { candidate: planet });
    const filled = state.scanProgress;
    run(state, 0.5, { candidate: planet, speed: 4000 });
    expect(state.scanProgress).toBeLessThan(filled);
    run(state, 2, { candidate: planet, speed: 4000 });
    expect(state.scanProgress).toBe(0);
  });

  it('starts over when the body leaves range', () => {
    const state = createSurvey();
    run(state, 1.2, { candidate: planet });
    run(state, 0.1, { candidate: null });
    expect(state.scanProgress).toBe(0);
    expect(run(state, 1.2, { candidate: planet })).toEqual([]);
    expect(run(state, 0.4, { candidate: planet })).toHaveLength(1);
  });

  it('starts over when the body in range changes', () => {
    const state = createSurvey();
    run(state, 1.2, { candidate: planet });
    expect(run(state, 1.2, { candidate: pulsar })).toEqual([]);
    expect(state.scanId).toBe(pulsar.id);
  });

  it('takes the same time on a slow frame as on a fast one', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 20]) {
      const state = createSurvey();
      run(state, TUNE.SCAN_SECONDS - 2 * dt, { candidate: planet }, dt);
      expect(state.scanned, `dt ${dt}`).toHaveLength(0);
      run(state, 4 * dt, { candidate: planet }, dt);
      expect(state.scanned, `dt ${dt}`).toHaveLength(1);
    }
  });

  it('keeps the ring on the body it started on while that body stays in range', () => {
    // nothing picked yet: the first in-range body is taken
    expect(prefersCandidate(null, null, Infinity, 'a', 500)).toBe(true);
    // a nearer body wins when neither is being scanned
    expect(prefersCandidate(null, 'a', 500, 'b', 300)).toBe(true);
    expect(prefersCandidate(null, 'a', 300, 'b', 500)).toBe(false);
    // the body being scanned wins, however near the other one is
    expect(prefersCandidate('a', 'a', 500, 'b', 10)).toBe(false);
    expect(prefersCandidate('a', 'b', 10, 'a', 500)).toBe(true);
  });
});

describe('scan range', () => {
  it('is the atmospheric envelope of a body that has one: four radii out', () => {
    expect(scanRange(100, 'planet', true)).toBe(400);
    expect(scanRange(280, 'ringedPlanet', true)).toBe(1120);
    expect(scanRange(800, 'star', true)).toBe(3200);
    expect(scanRange(140, 'pulsar', true)).toBe(560);
  });

  it('is the range a solid body without an envelope was always logged from', () => {
    expect(scanRange(273, 'station', false)).toBe(discoveryRange(273));
    expect(discoveryRange(100)).toBe(150);
    expect(discoveryRange(500)).toBe(600);
    expect(discoveryRange(5000)).toBe(1200);
  });

  it('is the edge of a formation: nebulae, clusters, swarms and monolith fields are scanned from inside', () => {
    for (const kind of ['nebula', 'cluster', 'swarm', 'monoliths'] as const) {
      expect(scanRange(2500, kind, false), kind).toBe(0);
    }
  });

  it('is wide enough to keep pace behind the comet', () => {
    expect(scanRange(54, 'comet', false)).toBe(800);
  });
});

describe('values', () => {
  it('pays every kind, the listed ones as listed', () => {
    for (const kind of Object.keys(CONTACT_KINDS) as ContactKind[]) {
      expect(CONTACT_KINDS[kind].value, kind).toBeGreaterThan(0);
      expect(CONTACT_KINDS[kind].label, kind).toMatch(/^[A-Z ]+$/);
    }
    expect(contactValue('planet', true)).toBe(100);
    expect(contactValue('ringedPlanet', true)).toBe(150);
    expect(contactValue('cluster', true)).toBe(150);
    expect(contactValue('comet', true)).toBe(300);
    expect(contactValue('nebula', true)).toBe(300);
    expect(contactValue('pulsar', true)).toBe(500);
  });

  it('doubles outside the home system', () => {
    for (const kind of Object.keys(CONTACT_KINDS) as ContactKind[]) {
      expect(contactValue(kind, false), kind).toBe(2 * contactValue(kind, true));
    }
    const state = createSurvey();
    run(state, 2, { candidate: pulsar });
    expect(state.score).toBe(1000);
  });

  it('names the rarest contact of a window', () => {
    const state = createSurvey();
    expect(rarestContact(state.scanned)).toBeNull();
    run(state, 2, { candidate: planet });
    run(state, 2, { candidate: pulsar });
    run(state, 2, { candidate: { id: 'home:8', name: 'THE COMET', kind: 'comet', home: true } });
    expect(rarestContact(state.scanned)?.name).toBe('PULSAR KHEVEL');
  });
});

describe('classification', () => {
  it('tells every archetype apart by the name its builder gives it', () => {
    const named: Array<[string, ContactKind]> = [
      ['PULSAR KHEVEL', 'pulsar'],
      ['KHEVEL STATION (DERELICT)', 'station'],
      ['KHEVEL BINARY', 'binary'],
      ['KHEVEL NEBULA', 'nebula'],
      ['KHEVEL CLUSTER', 'cluster'],
      ['THE KHEVEL MONOLITHS', 'monoliths'],
      ['KHEVEL SWARM', 'swarm'],
      ['THE COMET', 'comet'],
    ];
    for (const [name, kind] of named) {
      expect(classifyContact({ name, solid: true }), name).toBe(kind);
    }
  });

  it('tells bodies apart by their LOD registration and ring', () => {
    expect(classifyContact({ name: 'THE SUN', solid: true, body: 'star' })).toBe('star');
    expect(classifyContact({ name: 'VELORA-3', solid: true, body: 'planet' })).toBe('planet');
    expect(classifyContact({ name: 'VELORA-3', solid: true, body: 'planet', ringed: true })).toBe('ringedPlanet');
  });

  it('calls what it does not know an anomaly, which still pays', () => {
    expect(classifyContact({ name: 'SOMETHING NEW', solid: false })).toBe('anomaly');
    expect(contactValue('anomaly', true)).toBeGreaterThan(0);
  });
});

describe('fuel', () => {
  it('drains only while burning: a full tank is the tank time of burn', () => {
    const state = createSurvey();
    run(state, 10, { burning: false });
    expect(state.fuel).toBe(1);
    run(state, TUNE.TANK_SECONDS / 2, { burning: true });
    expect(state.fuel).toBeCloseTo(0.5, 5);
    expect(canBurn(state)).toBe(true);
    run(state, TUNE.TANK_SECONDS / 2 + 0.1, { burning: true });
    expect(state.fuel).toBe(0);
  });

  it('empty means cruise only, until the next scan', () => {
    const state = createSurvey();
    run(state, TUNE.TANK_SECONDS + 1, { burning: true });
    expect(canBurn(state)).toBe(false);
    // holding the burn on an empty tank changes nothing and never goes negative
    run(state, 5, { burning: true });
    expect(state.fuel).toBe(0);

    run(state, TUNE.SCAN_SECONDS + 0.1, { candidate: planet });
    expect(state.fuel).toBeCloseTo(TUNE.REFUEL, 5);
    expect(canBurn(state)).toBe(true);
  });

  it('a scan refuels a fixed share and the tank does not overfill', () => {
    const state = createSurvey();
    run(state, 2, { candidate: planet });
    expect(state.fuel).toBe(1);

    const half = createSurvey();
    run(half, TUNE.TANK_SECONDS / 2, { burning: true });
    const before = half.fuel;
    run(half, TUNE.SCAN_SECONDS + 0.1, { candidate: planet });
    expect(half.fuel).toBeCloseTo(before + TUNE.REFUEL, 5);
  });

  it('a full tank is 40 seconds of burn and a scan is worth 5 of them', () => {
    expect(TUNE.TANK_SECONDS).toBe(40);
    expect(TUNE.REFUEL * TUNE.TANK_SECONDS).toBeCloseTo(5, 9);
  });
});

describe('the window', () => {
  it('is four minutes and closes on its own', () => {
    const state = createSurvey();
    expect(TUNE.WINDOW_SECONDS).toBe(240);
    run(state, 239.9);
    expect(state.closed).toBe(false);
    run(state, 0.2);
    expect(state.closed).toBe(true);
    expect(state.timeLeft).toBe(0);
    expect(canBurn(state)).toBe(false);
  });

  it('does not stop for scans', () => {
    const state = createSurvey();
    run(state, 30, { candidate: planet });
    expect(state.timeLeft).toBeCloseTo(210, 5);
  });

  it('does not finish a scan after the clock ran out, even on one long frame', () => {
    const state = createSurvey();
    run(state, 239);
    // 1 s left, and one frame worth 10 s with a body in range
    const logged = stepSurvey(state, 10, { burning: false, speed: 0, candidate: planet });
    expect(logged).toBeNull();
    expect(state.closed).toBe(true);
    expect(state.score).toBe(0);
  });

  it('a scan that completes on the closing frame still counts', () => {
    const state = createSurvey();
    run(state, 240 - TUNE.SCAN_SECONDS);
    run(state, TUNE.SCAN_SECONDS, { candidate: planet });
    expect(state.closed).toBe(true);
    expect(state.score).toBe(100);
  });

  it('changes nothing once closed', () => {
    const state = createSurvey();
    run(state, 241);
    run(state, 30, { burning: true, candidate: planet });
    expect(state.score).toBe(0);
    expect(state.fuel).toBe(1);
    expect(state.scanned).toHaveLength(0);
    expect(state.scanProgress).toBe(0);
  });

  it('ignores a frame with no time in it', () => {
    const state = createSurvey();
    expect(stepSurvey(state, 0, { burning: true, speed: 0, candidate: planet })).toBeNull();
    expect(stepSurvey(state, Number.NaN, { burning: true, speed: 0, candidate: planet })).toBeNull();
    expect(state.timeLeft).toBe(240);
    expect(state.fuel).toBe(1);
  });

  it('resets to a fresh window for the retry', () => {
    const state = createSurvey();
    run(state, 100, { burning: true, candidate: planet });
    run(state, 200);
    resetSurvey(state);
    expect(state).toEqual(createSurvey());
  });

  it('formats the clock so 0:00 means over', () => {
    expect(formatClock(240)).toBe('4:00');
    expect(formatClock(239.2)).toBe('4:00');
    expect(formatClock(61)).toBe('1:01');
    expect(formatClock(9.01)).toBe('0:10');
    expect(formatClock(0.01)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('the daily system', () => {
  const noon = new Date(Date.UTC(2026, 10, 26, 12));

  it('is the UTC date', () => {
    expect(dailyLabel(noon)).toBe('20261126');
    expect(resolveSeed('', noon)).toEqual({ seed: seedFromLabel('20261126'), label: '20261126', daily: true });
  });

  it('is the same at any hour of the UTC day, wherever the visitor is', () => {
    const first = new Date(Date.UTC(2026, 10, 26, 0, 0, 1));
    const last = new Date(Date.UTC(2026, 10, 26, 23, 59, 59));
    expect(resolveSeed('', first)).toEqual(resolveSeed('', last));
    // 23:30 on the 26th in New York is already the 27th in UTC
    expect(dailyLabel(new Date('2026-11-26T23:30:00-05:00'))).toBe('20261127');
  });

  it('changes at UTC midnight, and neighbouring days are unrelated seeds', () => {
    const next = resolveSeed('', new Date(Date.UTC(2026, 10, 27, 0, 0, 1)));
    const today = resolveSeed('', noon);
    expect(next.label).toBe('20261127');
    expect(next.seed).not.toBe(today.seed);
    expect(Math.abs(next.seed - today.seed)).toBeGreaterThan(1000);
  });

  it('pads the month and the day', () => {
    expect(dailyLabel(new Date(Date.UTC(2027, 0, 5)))).toBe('20270105');
  });

  it('?seed= overrides the day', () => {
    const seeded = resolveSeed('?seed=khevel', noon);
    expect(seeded).toEqual({ seed: seedFromLabel('khevel'), label: 'khevel', daily: false });
    expect(seeded.seed).not.toBe(resolveSeed('', noon).seed);
    expect(resolveSeed('?stats&seed=khevel', noon).seed).toBe(seeded.seed);
  });

  it('?seed= of a date is that day, with that day\'s best', () => {
    expect(resolveSeed('?seed=20261126', noon)).toEqual(resolveSeed('', noon));
    const other = resolveSeed('?seed=20250101', noon);
    expect(other.daily).toBe(false);
    expect(bestKeyFor(other.label)).toBe('ephemeris.best.20250101');
  });

  it('cleans what ends up in a storage key, and falls back to the day when nothing is left', () => {
    expect(resolveSeed('?seed=Khevel%20Deep!', noon).label).toBe('kheveldeep');
    expect(resolveSeed('?seed=', noon).daily).toBe(true);
    expect(resolveSeed('?seed=%20%2F..', noon).daily).toBe(true);
    expect(resolveSeed(`?seed=${'a'.repeat(200)}`, noon).label).toHaveLength(24);
  });

  it('seeds are 32-bit and stable', () => {
    expect(seedFromLabel('20261126')).toBe(seedFromLabel('20261126'));
    for (const label of ['20261126', 'khevel', 'a']) {
      const seed = seedFromLabel(label);
      expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32, label).toBe(true);
    }
  });
});

describe('bests', () => {
  it('are kept per system and all-time', () => {
    const storage = memoryStorage();
    expect(readBests(storage, '20261126')).toEqual({ seed: 0, allTime: 0 });

    expect(recordScore(storage, '20261126', 1200)).toEqual({
      seed: 1200, allTime: 1200, newSeedBest: true, newAllTimeBest: true,
    });
    expect(storage.data.get('ephemeris.best.20261126')).toBe('1200');
    expect(storage.data.get(BEST_KEY)).toBe('1200');

    // a worse run in the same system keeps both
    expect(recordScore(storage, '20261126', 900)).toEqual({
      seed: 1200, allTime: 1200, newSeedBest: false, newAllTimeBest: false,
    });

    // tomorrow's system starts from nothing, the all-time best stands
    expect(recordScore(storage, '20261127', 700)).toEqual({
      seed: 700, allTime: 1200, newSeedBest: true, newAllTimeBest: false,
    });
    expect(readBests(storage, '20261127')).toEqual({ seed: 700, allTime: 1200 });
    expect(readBests(storage, '20261126')).toEqual({ seed: 1200, allTime: 1200 });

    expect(recordScore(storage, '20261127', 5000).newAllTimeBest).toBe(true);
    expect(storage.data.get(BEST_KEY)).toBe('5000');
    expect(storage.data.get('ephemeris.best.20261126')).toBe('1200');
  });

  it('a zero is not a best, and neither is a tie', () => {
    const storage = memoryStorage();
    expect(recordScore(storage, 'x', 0).newSeedBest).toBe(false);
    expect(storage.data.size).toBe(0);
    recordScore(storage, 'x', 300);
    expect(recordScore(storage, 'x', 300)).toMatchObject({ newSeedBest: false, newAllTimeBest: false });
  });

  it('reads junk in storage as no best', () => {
    const storage = memoryStorage({ 'ephemeris.best': 'abc', 'ephemeris.best.x': '-5' });
    expect(readBests(storage, 'x')).toEqual({ seed: 0, allTime: 0 });
    expect(recordScore(storage, 'x', 100).newSeedBest).toBe(true);
  });

  it('works without storage and with storage that throws', () => {
    expect(readBests(null, 'x')).toEqual({ seed: 0, allTime: 0 });
    expect(recordScore(null, 'x', 400)).toEqual({ seed: 400, allTime: 400, newSeedBest: true, newAllTimeBest: true });

    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('quota'); },
    };
    expect(readBests(broken, 'x')).toEqual({ seed: 0, allTime: 0 });
    expect(recordScore(broken, 'x', 400).newSeedBest).toBe(true);
  });
});

// @vitest-environment happy-dom
// Scripted play for tuning the survey's numbers. Not part of the suite:
//
//   SURVEY_TUNING=1 npx vitest run tests/engine/surveyTuning.test.ts
//
// Flies whole 4:00 windows of the real sim with the scripted pilot (pilot.ts)
// in several styles over several daily systems, and prints what each style
// scores, how long its tank sat empty and what a contact costs in time and
// burn. Options, all environment variables:
//   SEEDS=20261126,20261127   systems to fly (default: eight consecutive days)
//   STYLES=brisk,lazy         styles to fly (default: all)
//   TUNE='{"REFUEL":0.25}'    override rule numbers for the run
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEphemeris } from 'components/ephemeris/createEphemeris';
import { resolveSeed, TUNE } from 'components/ephemeris/survey';
import { createStage } from 'engine/render/stage';
import { createFakeStage, createHost, createHud, debug, pilotControls, type FakeStage } from './ephemerisHarness';
import { createPilot, type PilotPlan } from './pilot';

vi.mock('engine/render/stage', async importOriginal => ({
  ...await importOriginal<typeof import('engine/render/stage')>(), createStage: vi.fn(),
}));
let fake: FakeStage;
beforeEach(() => {
  vi.mocked(createStage).mockImplementation((container, opts) => (fake = createFakeStage(container, opts)).stage);
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

const STYLES: Record<string, PilotPlan> = {
  // never burns
  cruise: { burnBeyond: Infinity },
  // burns only on long legs and coasts the whole approach
  careful: { burnBeyond: 1500 },
  // burns to within 500 km of scan range: the pilot the numbers are set for
  brisk: { burnBeyond: 500 },
  // burns to within 100 km of scan range
  greedy: { burnBeyond: 100 },
  // brisk until a third of a tank is left, then only long legs
  thrifty: { burnBeyond: 500, thriftUnder: 0.35, thriftBeyond: 3000 },
  // never lets go of the burn
  lazy: { burnBeyond: 0, holdBurn: true },
  // brisk, but never leaves the home system
  homebody: { burnBeyond: 500, homeOnly: true },
  // brisk, but leaves the home system unscanned
  outbound: { burnBeyond: 500, outOnly: true },
  // a slower hand: brisk and greedy deciding only every 0.3 s, as a person
  // does, so every turn and every release of the burn comes late
  'brisk-slow': { burnBeyond: 500, reaction: 0.3 },
  'greedy-slow': { burnBeyond: 100, reaction: 0.3 },
  // greedy and slower still: half a second behind everything
  sloppy: { burnBeyond: 100, reaction: 0.5 },
};

const DT = 1 / 30;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

it.skipIf(!process.env.SURVEY_TUNING)('scripted survey windows', async () => {
  const tune = TUNE as unknown as Record<string, number>;
  for (const [name, value] of Object.entries(JSON.parse(process.env.TUNE ?? '{}'))) tune[name] = value as number;
  const seeds = (process.env.SEEDS ?? '20261126,20261127,20261128,20261129,20261130,20261201,20261202,20261203').split(',');
  const styles = (process.env.STYLES ?? Object.keys(STYLES).join(',')).split(',');

  const runs: Array<{ style: string; seed: string; score: number; scans: number; home: number; homeCleared: number; burn: number; dry: number; fuelEnd: number }> = [];
  const hops: Array<{ style: string; where: string; time: number; burn: number }> = [];

  for (const seed of seeds) {
    for (const style of styles) {
      const container = createHost();
      const game = createEphemeris(container, createHud(), { seed: resolveSeed(`?seed=${seed}`, new Date()) });
      await fake.advance(2);
      game.start('survey');
      const plan = STYLES[style];
      const pilot = createPilot(debug(), pilotControls(container), plan);
      const every = Math.max(1, Math.round((plan.reaction ?? 0) / DT));
      let burn = 0, dry = 0, scans = 0, homeCleared = -1, lastTime = 0, lastBurn = 0, lastSector = 'home', frames = 0;
      while (debug().state().phase === 'survey') {
        if (frames % every === 0) pilot.step();
        await fake.advance(1, DT);
        // let the test runner breathe: a window is 7200 frames back to back
        if (++frames % 900 === 0) await new Promise((resolve) => setTimeout(resolve));
        const state = debug().state();
        if (state.burning) burn += DT;
        if (state.fuel <= 0) dry += DT;
        if (state.scanned.length === scans) continue;
        scans = state.scanned.length;
        const id = state.scanned.at(-1)!;
        const sector = id.slice(0, id.lastIndexOf(':'));
        const now = TUNE.WINDOW_SECONDS - state.timeLeft;
        hops.push({
          style,
          where: sector === 'home' ? 'home system' : sector === lastSector ? 'out, same sector' : 'out, new sector',
          time: now - lastTime,
          burn: burn - lastBurn,
        });
        lastTime = now; lastBurn = burn; lastSector = sector;
        if (homeCleared < 0 && state.scanned.filter((scanned) => scanned.startsWith('home:')).length === 9) homeCleared = now;
      }
      const state = debug().state();
      runs.push({ style, seed, score: state.score, scans, home: state.scanned.filter((scanned) => scanned.startsWith('home:')).length, homeCleared, burn, dry, fuelEnd: state.fuel });
      game.dispose();
    }
  }

  const lines = [`rules ${JSON.stringify(TUNE)}`, `${seeds.length} systems: ${seeds.join(' ')}`, ''];
  lines.push('style        score mean   min   max  scans  home cleared  burn  tank empty  fuel at end');
  for (const style of styles) {
    const own = runs.filter((run) => run.style === style);
    const cleared = own.filter((run) => run.homeCleared >= 0);
    lines.push([
      style.padEnd(11),
      mean(own.map((run) => run.score)).toFixed(0).padStart(11),
      String(Math.min(...own.map((run) => run.score))).padStart(5),
      String(Math.max(...own.map((run) => run.score))).padStart(5),
      mean(own.map((run) => run.scans)).toFixed(1).padStart(6),
      (cleared.length ? `${mean(cleared.map((run) => run.homeCleared)).toFixed(0)}s (${cleared.length}/${own.length})` : '-').padStart(13),
      `${mean(own.map((run) => run.burn)).toFixed(0)}s`.padStart(5),
      `${mean(own.map((run) => run.dry)).toFixed(0)}s`.padStart(11),
      mean(own.map((run) => run.fuelEnd)).toFixed(2).padStart(12),
    ].join(' '));
  }
  lines.push('', 'per contact      where               n   seconds  burn seconds');
  for (const style of styles) {
    for (const where of ['home system', 'out, new sector', 'out, same sector']) {
      const own = hops.filter((hop) => hop.style === style && hop.where === where);
      if (!own.length) continue;
      lines.push(`${style.padEnd(16)} ${where.padEnd(17)} ${String(own.length).padStart(3)} ${mean(own.map((hop) => hop.time)).toFixed(1).padStart(9)} ${mean(own.map((hop) => hop.burn)).toFixed(1).padStart(13)}`);
    }
  }
  console.log(lines.join('\n'));
  expect(runs).toHaveLength(seeds.length * styles.length);
}, 1_800_000);

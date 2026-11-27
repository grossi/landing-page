// @vitest-environment happy-dom
// Scripted play for checking the loop's numbers. Not part of the suite:
//
//   SURVEY_TUNING=1 npx vitest run tests/engine/surveyTuning.test.ts
//
// Flies whole loops of the real sim with the scripted pilot (pilot.ts) over
// several daily systems and prints, per system: what a first loop finds when
// it only follows signals, and how many loops it takes to chart the system
// when the loops after the first know the log. Options (environment):
//   SEEDS=20261126,20261127   systems to fly (default: eight consecutive days)
//   LOOPS=4                   most loops per system
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEphemeris } from 'components/ephemeris/createEphemeris';
import { resolveSeed, TUNE } from 'components/ephemeris/survey';
import { createStage } from 'engine/render/stage';
import { createFakeStage, createHost, createHud, debug, memoryStorage, pilotControls, type FakeStage } from './ephemerisHarness';
import { createPilot } from './pilot';

vi.mock('engine/render/stage', async importOriginal => ({
  ...await importOriginal<typeof import('engine/render/stage')>(), createStage: vi.fn(),
}));
let fake: FakeStage;
beforeEach(() => {
  vi.mocked(createStage).mockImplementation((container, opts) => (fake = createFakeStage(container, opts)).stage);
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

const DT = 1 / 30;

it.skipIf(!process.env.SURVEY_TUNING)('scripted loops', async () => {
  const seeds = (process.env.SEEDS ?? '20261126,20261127,20261128,20261129,20261130,20261201,20261202,20261203').split(',');
  const maxLoops = Number(process.env.LOOPS ?? 4);
  const lines: string[] = [];
  for (const seed of seeds) {
    const storage = memoryStorage();
    const container = createHost();
    const game = createEphemeris(container, createHud(), { seed: resolveSeed(`?seed=${seed}`, new Date()), storage });
    await fake.advance(2);
    const loops: string[] = [];
    let charted = 0;
    for (let n = 1; n <= maxLoops && !charted; n++) {
      game.start('survey');
      const first = (process.env.FIRST ?? 'listens') as 'listens' | 'knows';
      const pilot = createPilot(debug(), pilotControls(container), { mode: n === 1 ? first : 'knows' });
      const times: string[] = [];
      let seen = 0;
      let frames = 0;
      while (debug().state().phase === 'survey') {
        pilot.step();
        await fake.advance(1, DT);
        if (++frames % 900 === 0) await new Promise((resolve) => setTimeout(resolve));
        const state = debug().state();
        if (process.env.TRACE && frames % 150 === 0) {
          const sh = debug().shipAbs();
          const near = debug().finds().map((f) => `${f.id}:${Math.round(Math.hypot(f.x - sh.x, f.y - sh.y, f.z - sh.z) / 100) / 10}${f.open ? '' : 'x'}${f.logged ? 'L' : ''}`).join(' ');
          console.log(`L${n} ${Math.round(TUNE.WINDOW_SECONDS - state.timeLeft)}s tgt=${pilot.target()} v=${Math.round(state.speed)} burn=${state.burning ? 1 : 0} sig=${state.signal ? `${state.signal.id}/${state.signal.strength.toFixed(2)}/${(state.signal.offNose * 57.3).toFixed(0)}deg` : '-'} scan=${state.scanId ?? '-'}${state.tooFast ? '!' : ''} | ${near}`);
        }
        if (state.loggedNow.length !== seen) {
          seen = state.loggedNow.length;
          times.push(`${state.loggedNow.at(-1)}@${Math.round(TUNE.WINDOW_SECONDS - state.timeLeft)}s`);
        }
      }
      const state = debug().state();
      loops.push(`L${n}(${n === 1 ? (process.env.FIRST ?? 'listens') : 'knows'}): ${times.join(' ') || 'nothing'}`);
      if (state.logged.length === 5) charted = n;
    }
    lines.push(`${seed}  ${charted ? `charted in ${charted}` : `not charted in ${maxLoops}`}\n    ${loops.join('\n    ')}`);
    game.dispose();
  }
  console.log(lines.join('\n'));
  expect(lines).toHaveLength(seeds.length);
}, 1_800_000);

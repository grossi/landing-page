// Runs in vitest's default node environment on purpose: importing the barrel
// (which pulls in every engine module, including render/assets) must not
// require a DOM.
import { describe, expect, it } from 'vitest';
import * as engine from 'engine';

describe('engine barrel', () => {
  it('exposes a representative export from every module', () => {
    // core
    expect(engine.mulberry32).toBeTypeOf('function'); // rng
    expect(engine.computeRebase).toBeTypeOf('function'); // floatingOrigin
    expect(engine.steerAttitude).toBeTypeOf('function'); // flight
    expect(engine.speedResponseRate).toBeTypeOf('function'); // flight (boost dynamics)
    expect(engine.CRUISE_FOV).toBeGreaterThan(0); // flight (FOV cue)
    expect(engine.createKeyTracker).toBeTypeOf('function'); // keyTracker
    expect(engine.speedLimit).toBeTypeOf('function'); // motion
    expect(engine.BOOST_LIMIT_FACTOR).toBeGreaterThan(0); // motion (was missing)
    expect(engine.createGovernorState).toBeTypeOf('function'); // governor
    expect(engine.selectLod).toBeTypeOf('function'); // selectLod
    expect(engine.sectorKey).toBeTypeOf('function'); // sectorGrid
    expect(engine.runBudgeted).toBeTypeOf('function'); // scheduler
    // lod
    expect(engine.makeDisplacementField).toBeTypeOf('function'); // displacement
    expect(engine.getIcosphereTables).toBeTypeOf('function'); // icosphere
    expect(engine.makeLodGeometry).toBeTypeOf('function'); // geometry
    expect(engine.createLodManager).toBeTypeOf('function'); // lodManager
    expect(engine.makeSurfaceFloor).toBeTypeOf('function'); // surfaceFloor
    // render
    expect(engine.createStage).toBeTypeOf('function'); // stage
    expect(engine.createResourceTracker).toBeTypeOf('function'); // resourceTracker
    expect(engine.createStarfield).toBeTypeOf('function'); // starfield
    expect(engine.buildShipRig).toBeTypeOf('function'); // shipRig
    expect(engine.attachStatsOverlay).toBeTypeOf('function'); // statsOverlay
    expect(engine.createDustField).toBeTypeOf('function'); // dust
    expect(engine.softSprite).toBeDefined(); // assets
    // world
    expect(engine.buildSectorContent).toBeTypeOf('function'); // sectorContent
    expect(engine.createSectorField).toBeTypeOf('function'); // sectors
  });
});

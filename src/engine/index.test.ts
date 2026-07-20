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
    expect(engine.steerQuaternion).toBeTypeOf('function'); // flight
    expect(engine.levelRoll).toBeTypeOf('function'); // flight (roll assist)
    expect(engine.speedResponseRate).toBeTypeOf('function'); // flight (boost dynamics)
    expect(engine.CRUISE_FOV).toBeGreaterThan(0); // flight (FOV cue)
    expect(engine.chaseLag).toBeTypeOf('function'); // flight (stream-lag emulation)
    expect(engine.resolveSteer).toBeTypeOf('function'); // flight (steer resolution)
    expect(engine.burnKeysDown).toBeTypeOf('function'); // flight (burn predicate)
    expect(engine.easeFov).toBeTypeOf('function'); // flight (FOV ease primitive)
    expect(engine.easeFovValue).toBeTypeOf('function'); // flight (pure FOV law)
    expect(engine.createKeyTracker).toBeTypeOf('function'); // keyTracker
    expect(engine.createListenerGroup).toBeTypeOf('function'); // listenerGroup
    expect(engine.pointerToNdc).toBeTypeOf('function'); // pointerNdc
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
    expect(engine.applyQuality).toBeTypeOf('function'); // stage (governor knobs)
    expect(engine.createResourceTracker).toBeTypeOf('function'); // resourceTracker
    expect(engine.createStarfield).toBeTypeOf('function'); // starfield
    expect(engine.buildShipRig).toBeTypeOf('function'); // shipRig
    expect(engine.createFlightRig).toBeTypeOf('function'); // flightRig
    expect(engine.SHIP_ENTRY.z).toBe(18); // flightRig (engage entry offset)
    expect(engine.SHIP_ARRIVAL_RATE).toBe(1.5); // flightRig (arrival ease)
    expect(engine.attachStatsOverlay).toBeTypeOf('function'); // statsOverlay
    expect(engine.createDustField).toBeTypeOf('function'); // dust
    expect(engine.softSprite).toBeDefined(); // assets
    // world
    expect(engine.buildSectorContent).toBeTypeOf('function'); // sectorContent
    expect(engine.createSectorField).toBeTypeOf('function'); // sectors
  });
});

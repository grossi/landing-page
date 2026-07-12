/**
 * Shared space-engine core used by both the DEEP FIELD landing background
 * and the EPHEMERIS game. Public API barrel — grows as engine modules land.
 */

export { hashCoords, makeName, mulberry32, pickFrom, SYLLABLES } from 'engine/core/rng';
export {
  createGovernorState,
  DEGRADE_FRAMES,
  DEGRADE_MS,
  FRAME_HISTORY,
  framePercentile,
  GOVERNOR_LEVELS,
  pushFrameTime,
  qualityForLevel,
  UPGRADE_FRAMES,
  UPGRADE_MS,
  type GovernorState,
  type QualityLevel,
} from 'engine/core/governor';
export {
  LOD_DEMOTE_RATIO,
  LOD_MAX_LEVEL,
  LOD_MIN_DWELL_S,
  LOD_PROMOTE_PX,
  projectedPixelRadius,
  selectLod,
} from 'engine/core/selectLod';
export {
  cellOf,
  diffSectors,
  parseSectorKey,
  sectorCenter,
  sectorKey,
  type SectorCell,
  type SectorDiff,
} from 'engine/core/sectorGrid';
export { runBudgeted, type BuildStep } from 'engine/core/scheduler';
export {
  clampDt,
  createStage,
  isPaused,
  MAX_DT,
  type PauseSource,
  type Stage,
  type StageOptions,
} from 'engine/render/stage';
export {
  createResourceTracker,
  type Disposable,
  type ResourceTracker,
} from 'engine/render/resourceTracker';
export {
  BEAM,
  BELT_MAT,
  BOX,
  CYL,
  DODEC,
  ICO_HIGH,
  ICO_LOW,
  ICO_MID,
  ICO_ULTRA,
  MAT_BEAM,
  MAT_BODY,
  MAT_BRIGHT,
  MAT_DIM,
  MAT_RING,
  NEBULA_MAT,
  OCT,
  ORBIT_MAT,
  RING,
  RING_THIN,
  softSprite,
  TRAIL_MAT,
  UNIT_CIRCLE,
  wireMat,
} from 'engine/render/assets';

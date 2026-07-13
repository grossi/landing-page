/**
 * Shared space-engine core used by both the DEEP FIELD landing background
 * and the EPHEMERIS game. Public API barrel — grows as engine modules land.
 */

export { hashCoords, makeName, mulberry32, pickFrom, SYLLABLES } from 'engine/core/rng';
export { computeRebase, type Vec3Like } from 'engine/core/floatingOrigin';
export {
  BOOST_LIMIT_FACTOR,
  escapeRelief,
  RELIEF_FULL,
  RELIEF_START,
  SPEED_CEIL,
  SPEED_FLOOR,
  SPEED_PER_SURFACE_DISTANCE,
  speedLimit,
} from 'engine/core/motion';
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
  ASTEROID_PROFILE,
  getCraterSpecs,
  makeDisplacementField,
  PLANET_PROFILE,
  STAR_PROFILE,
  type CraterSpec,
  type DisplacementPreset,
  type DisplacementProfile,
} from 'engine/lod/displacement';
export {
  getIcosphereTables,
  type IcosphereLevel,
  type IcosphereTables,
} from 'engine/lod/icosphere';
export {
  buildDisplacedPositions,
  buildLodGeometrySync,
  GEOMETRY_CACHE_MAX,
  GeometryCache,
  GeometryJobQueue,
  JOB_BUDGET_MS,
  lodGeometryKey,
  makeLodGeometry,
  SLICE_VERTS,
  type GeometryJobRequest,
  type RadialField,
} from 'engine/lod/geometry';
export {
  apparentScale,
  ATMOSPHERE_FAR,
  ATMOSPHERE_MAX_OPACITY,
  ATMOSPHERE_NEAR,
  atmosphereOpacity,
  createLodManager,
  LOD_FADE_S,
  SCALE_RAMP_FAR,
  SCALE_RAMP_FLOOR,
  SCALE_RAMP_NEAR,
  type LodBeacon,
  type LodBodyHandle,
  type LodBodyKind,
  type LodManager,
  type LodManagerOptions,
  type LodRegistration,
} from 'engine/lod/lodManager';
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
export { createStarfield, type StarfieldOptions } from 'engine/render/starfield';
export {
  attachStatsOverlay,
  formatCount,
  formatStats,
  statsOverlayEnabled,
  type StatsOverlayHandle,
  type StatsOverlayOptions,
  type StatsRendererInfo,
  type StatsSnapshot,
  type StatsSource,
} from 'engine/render/statsOverlay';
export {
  createDustField,
  wrapAround,
  type DustField,
  type DustFieldOptions,
} from 'engine/render/dust';
export {
  buildHomeSystem,
  buildSectorContent,
  drawSectorHeader,
  peekSectorBeacon,
  type Poi,
  type SectorBeacon,
  type SectorContent,
  type SectorHeader,
} from 'engine/world/sectorContent';
export {
  createSectorField,
  type SectorField,
  type SectorFieldCell,
  type SectorFieldOptions,
} from 'engine/world/sectors';
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

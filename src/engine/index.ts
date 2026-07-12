/**
 * Shared space-engine core used by both the DEEP FIELD landing background
 * and the EPHEMERIS game. Public API barrel — grows as engine modules land.
 */

export { hashCoords, makeName, mulberry32, pickFrom, SYLLABLES } from 'engine/core/rng';
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

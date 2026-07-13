/**
 * Sector-granularity floating origin — pure math.
 *
 * JS numbers are doubles, so absolute position/velocity math is exact to
 * ~2^53; the precision cliff is float32 render coordinates (visible vertex
 * jitter past ~10^5 units). Rebasing the whole scene by an EXACT multiple of
 * the sector size whenever the viewer strays more than a threshold from the
 * render origin keeps every render coordinate small forever, and — because
 * the delta is an exact cell multiple — sector-local content never moves
 * relative to its cell corner, so procedural determinism is untouched.
 *
 * The consumer owns the shifting (ship, camera, content roots, dust); this
 * module only decides WHEN to rebase and by exactly HOW MUCH.
 */

/** Anything with x/y/z numbers — THREE.Vector3 qualifies without importing it. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * The exact-multiple-of-`cellSize` delta to subtract from every render-local
 * position (and add to the absolute origin) once any component of `local`
 * exceeds `thresholdCells * cellSize` — or null while inside the threshold.
 *
 * Deltas are `Math.floor(component / cellSize) * cellSize` per axis, so after
 * applying one every component of `local` lands in `[0, cellSize)`.
 */
export function computeRebase(
  local: Vec3Like,
  cellSize: number,
  thresholdCells = 1,
): Vec3Like | null {
  const limit = thresholdCells * cellSize;
  if (
    Math.abs(local.x) <= limit &&
    Math.abs(local.y) <= limit &&
    Math.abs(local.z) <= limit
  ) {
    return null;
  }
  return {
    x: Math.floor(local.x / cellSize) * cellSize,
    y: Math.floor(local.y / cellSize) * cellSize,
    z: Math.floor(local.z / cellSize) * cellSize,
  };
}

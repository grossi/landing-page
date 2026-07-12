/**
 * Pure sector-grid math for streaming procedural space content: which cell
 * a position falls in, and which sectors to build/evict when the active
 * window (a (2*activeRange+1)^3 cube of cells) moves.
 *
 * Extracted from the ephemeris sync loop so the streaming manager becomes a
 * thin shell around a unit-tested diff. Reserved cells (e.g. the home
 * system) are simply keys the consumer keeps in `currentKeys` mapped to
 * null content — the diff needs no special casing for them.
 */

export interface SectorCell {
  x: number;
  y: number;
  z: number;
  key: string;
}

export interface SectorDiff {
  /** The cell `position` falls in. */
  cell: SectorCell;
  /** Keys needed but not in currentKeys, in near-deterministic loop order. */
  toBuild: string[];
  /** Keys in currentKeys that fell outside the active window. */
  toEvict: string[];
}

/** Canonical sector key, e.g. "-1,0,2". */
export const sectorKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;

/** Inverse of sectorKey. */
export function parseSectorKey(key: string): [number, number, number] {
  const [x, y, z] = key.split(',').map(Number);
  return [x, y, z];
}

/** Integer cell coordinates containing a world position (floor division). */
export function cellOf(
  position: { x: number; y: number; z: number },
  sectorSize: number,
): SectorCell {
  const x = Math.floor(position.x / sectorSize);
  const y = Math.floor(position.y / sectorSize);
  const z = Math.floor(position.z / sectorSize);
  return { x, y, z, key: sectorKey(x, y, z) };
}

/** World-space center of a cell, matching `(c + 0.5) * sectorSize` per axis. */
export function sectorCenter(
  x: number,
  y: number,
  z: number,
  sectorSize: number,
): { x: number; y: number; z: number } {
  return { x: (x + 0.5) * sectorSize, y: (y + 0.5) * sectorSize, z: (z + 0.5) * sectorSize };
}

/**
 * Diff the active sector set against the window centered on `position`.
 *
 * Also correct for pending build queues: keys queued but no longer needed
 * simply won't appear in toBuild, so consumers can rebuild their queue from
 * toBuild alone on every cell change.
 */
export function diffSectors(
  position: { x: number; y: number; z: number },
  sectorSize: number,
  activeRange: number,
  currentKeys: ReadonlySet<string>,
): SectorDiff {
  const cell = cellOf(position, sectorSize);
  const needed = new Set<string>();
  const toBuild: string[] = [];
  for (let dx = -activeRange; dx <= activeRange; dx++)
    for (let dy = -activeRange; dy <= activeRange; dy++)
      for (let dz = -activeRange; dz <= activeRange; dz++) {
        const key = sectorKey(cell.x + dx, cell.y + dy, cell.z + dz);
        needed.add(key);
        if (!currentKeys.has(key)) toBuild.push(key);
      }

  const toEvict: string[] = [];
  for (const key of currentKeys) if (!needed.has(key)) toEvict.push(key);

  return { cell, toBuild, toEvict };
}

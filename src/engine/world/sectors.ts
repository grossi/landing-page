import * as THREE from 'three';
import { hashCoords, mulberry32 } from 'engine/core/rng';
import { diffSectors, parseSectorKey, sectorCenter } from 'engine/core/sectorGrid';
import { buildSectorContent, type Poi, type SectorContent } from 'engine/world/sectorContent';

export interface SectorFieldOptions {
  /** Seed for the whole universe; every sector derives its PRNG from it. */
  worldSeed: number;
  /** Edge length of one cubic sector of procedural space. */
  sectorSize: number;
  /** Sectors are kept alive within this many cells of the viewer (1 → 3×3×3). */
  activeRange?: number;
  /**
   * Max sectors built per non-immediate `sync` call, spreading construction
   * over frames to avoid hitches while flying. Default 2.
   */
  buildBudgetPerFrame?: number;
  /**
   * Cells for which the caller owns the content (e.g. a hand-authored home
   * system). Reserved cells get no random content — they are tracked with
   * null content so the streaming diff needs no special casing.
   */
  reserved?: (x: number, y: number, z: number) => boolean;
  /**
   * Called after a sector's content is built and added to the scene —
   * e.g. to register its `lodBodies` with a LodManager.
   */
  onContentAdded?: (content: SectorContent) => void;
  /** Called just before a sector's content is removed and disposed. */
  onContentRemoved?: (content: SectorContent) => void;
}

/** The cell the viewer currently occupies, plus its content (if built). */
export interface SectorFieldCell {
  x: number;
  y: number;
  z: number;
  key: string;
  /** Null while queued/unbuilt and for reserved cells. */
  content: SectorContent | null;
}

/**
 * Streaming manager for deterministic procedural sectors around a moving
 * viewer: builds the active window of cells, evicts the shell that falls
 * behind, and spreads construction across frames.
 */
export interface SectorField {
  /**
   * Keep the active window centred on the viewer's ABSOLUTE position
   * (render-local position + origin). Cells are keyed absolutely, so content
   * stays deterministic across floating-origin rebases. Cheap no-op on the
   * common frame (same cell, empty build queue). `immediate` builds every
   * needed sector synchronously — use for spawn/warp so space is never empty.
   */
  sync(absolutePosition: THREE.Vector3, immediate?: boolean): void;
  /**
   * Floating-origin rebase: adds `delta` (an exact multiple of `sectorSize`
   * per axis, see engine/core/floatingOrigin) to the field's origin and
   * subtracts it from every built sector group, keeping render coordinates
   * small while absolute cells — and therefore content — never change.
   */
  applyOriginShift(delta: THREE.Vector3): void;
  /**
   * The current render origin in absolute coordinates (a live, read-only
   * view). Render-local = absolute − origin.
   */
  origin(): Readonly<THREE.Vector3>;
  /** Advance the animations of every built sector. */
  updateContents(dt: number, t: number): void;
  /** Visit every POI in every built sector. */
  forEachPoi(fn: (poi: Poi) => void): void;
  /** Number of built procedural sectors in the scene (stats overlay). */
  activeCount(): number;
  /** The cell of the last `sync` position. */
  currentCell(): SectorFieldCell;
  /** Unloads every sector and clears the build queue. */
  dispose(): void;
}

/**
 * Creates a sector-streaming field that adds/removes deterministic
 * procedural content (see `buildSectorContent`) to `scene` as the viewer
 * moves. Content is keyed only by cell coordinates and `worldSeed`, so a
 * sector rebuilt after eviction is identical — including its POI ids
 * (`"x,y,z:i"`), which keeps discovery logs stable.
 */
export function createSectorField(scene: THREE.Scene, opts: SectorFieldOptions): SectorField {
  const { worldSeed, sectorSize } = opts;
  const activeRange = opts.activeRange ?? 1;
  const buildBudget = opts.buildBudgetPerFrame ?? 2;
  const reserved = opts.reserved ?? (() => false);

  // Render origin in absolute coordinates; grows by exact sector multiples
  // as the consumer rebases (floating origin). Built groups are positioned
  // at absoluteCenter − origin so render coordinates stay float32-small.
  const origin = new THREE.Vector3();

  // Null marks reserved cells (tracked, but the caller owns their content).
  const activeSectors = new Map<string, SectorContent | null>();
  const activeKeys = new Set<string>();
  const buildQueue = new Set<string>();
  let cellX = NaN;
  let cellY = NaN;
  let cellZ = NaN;
  let cellKey = '';

  function buildSector(key: string) {
    if (activeSectors.has(key)) return;
    const [x, y, z] = parseSectorKey(key);
    activeKeys.add(key);
    if (reserved(x, y, z)) {
      activeSectors.set(key, null);
      return;
    }
    const rand = mulberry32(hashCoords(x, y, z, worldSeed));
    const c = sectorCenter(x, y, z, sectorSize);
    const content = buildSectorContent(
      rand,
      sectorSize,
      new THREE.Vector3(c.x - origin.x, c.y - origin.y, c.z - origin.z),
    );
    content.pois.forEach((poi, i) => { poi.id = `${key}:${i}`; });
    scene.add(content.group);
    // POI distances read matrixWorld, so make it valid before the next render
    content.group.updateMatrixWorld(true);
    activeSectors.set(key, content);
    opts.onContentAdded?.(content);
  }

  function unloadSector(key: string) {
    const content = activeSectors.get(key);
    if (content) {
      opts.onContentRemoved?.(content);
      scene.remove(content.group);
      content.dispose();
    }
    activeSectors.delete(key);
    activeKeys.delete(key);
  }

  return {
    sync(absolutePosition, immediate = false) {
      const position = absolutePosition;
      const cx = Math.floor(position.x / sectorSize);
      const cy = Math.floor(position.y / sectorSize);
      const cz = Math.floor(position.z / sectorSize);
      const cellChanged = cx !== cellX || cy !== cellY || cz !== cellZ;
      // most frames: same cell, nothing queued — skip all set/string work
      if (!cellChanged && !immediate && buildQueue.size === 0) return;

      if (cellChanged || immediate) {
        const diff = diffSectors(position, sectorSize, activeRange, activeKeys);
        cellX = diff.cell.x;
        cellY = diff.cell.y;
        cellZ = diff.cell.z;
        cellKey = diff.cell.key;
        for (const key of diff.toEvict) unloadSector(key);
        // toBuild is complete (queued-but-unbuilt keys are not in activeKeys),
        // so the queue is simply rebuilt from it — stale keys drop out.
        buildQueue.clear();
        for (const key of diff.toBuild) {
          if (immediate) buildSector(key);
          else buildQueue.add(key);
        }
      }
      // spread construction over frames to avoid hitches while flying
      let built = 0;
      for (const key of buildQueue) {
        if (built++ >= buildBudget) break;
        buildQueue.delete(key);
        buildSector(key);
      }
    },

    applyOriginShift(delta) {
      origin.add(delta);
      for (const content of activeSectors.values()) {
        if (!content) continue;
        content.group.position.sub(delta);
        // POI distances read matrixWorld before the next render pass
        content.group.updateMatrixWorld(true);
      }
    },

    origin() {
      return origin;
    },

    updateContents(dt, t) {
      for (const content of activeSectors.values()) content?.update?.(dt, t);
    },

    forEachPoi(fn) {
      for (const content of activeSectors.values()) {
        if (content) for (const poi of content.pois) fn(poi);
      }
    },

    activeCount() {
      let built = 0;
      for (const content of activeSectors.values()) if (content) built++;
      return built;
    },

    currentCell() {
      return { x: cellX, y: cellY, z: cellZ, key: cellKey, content: activeSectors.get(cellKey) ?? null };
    },

    dispose() {
      for (const key of [...activeSectors.keys()]) unloadSector(key);
      buildQueue.clear();
    },
  };
}

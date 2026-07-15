/**
 * Displaced-icosphere geometry for the LOD ladder: pure position builder,
 * LineSegments geometry factory, an LRU geometry cache, and a budgeted job
 * queue so the expensive rungs (sub3+) never hitch a frame.
 *
 * - Levels 1-2 (≤162 verts) build synchronously via `buildLodGeometrySync`.
 * - Levels 3+ go through `GeometryJobQueue`: resumable jobs that displace
 *   `SLICE_VERTS` vertices per step, drained by C4's `runBudgeted` scheduler
 *   inside a few-ms frame budget — at most ~one geometry build per frame.
 * - Finished geometries live in `GeometryCache` (LRU, keyed by
 *   `lodGeometryKey`) so re-approaching the same planet is free. Entries
 *   backing live meshes are pinned via retain/release and never evicted.
 *
 * No THREE.Mesh / DOM here — geometry only, so everything unit-tests in node.
 */

import * as THREE from 'three';
import { runBudgeted, type BuildStep } from 'engine/core/scheduler';
import type { IcosphereTables } from 'engine/lod/icosphere';

/** Radial displacement field: unit direction in, offset in [-1, 1] out. */
export type RadialField = (x: number, y: number, z: number) => number;

/**
 * Cache key for one body's geometry at one rung. Seed alone is not enough:
 * seeds are independent 31-bit draws, so two bodies can collide — kind and
 * radius must contribute or the second body silently renders the first
 * body's terrain at the wrong size and archetype.
 */
export const lodGeometryKey = (seed: number, kind: string, radius: number, level: number): string =>
  `${seed}:${kind}:${radius}:${level}`;

/**
 * Vertices displaced per job slice (sub6 = 40962 verts → 41 slices).
 * Sized so ONE slice fits the 3 ms budget even on slow phones: the 6-octave
 * planet field runs a 2048-vert slice in ~1.66 ms on desktop (~5-8 ms on
 * slow phones — a guaranteed overrun, since runBudgeted cannot split a
 * step), so slices are 1024. A full level-6 build measures ~35 ms of field
 * work — ~11 frames at 60 fps desktop, spread hitch-free by the queue.
 */
export const SLICE_VERTS = 1024;

/** Default per-frame job budget in milliseconds. */
export const JOB_BUDGET_MS = 3;

/**
 * Default LRU byte budget. Entries vary 60x in size (sub2 ≈ 17 KB up to a
 * hazed sub6 ≈ 1.9 MB: positions ≈ 480 KB + edge index ≈ 960 KB + a color
 * attribute matching positions when a skim engaged the haze), so the cache
 * is budgeted in bytes, not entries — ~12 MB holds ~8 top-rung planets or
 * dozens of mid rungs. A soft cap: pinned (in-use) entries never evict, so
 * the cache may run over while more geometry than this is displayed.
 */
export const GEOMETRY_CACHE_BYTES = 12 * 1024 * 1024;

/**
 * GPU byte estimate of one cached geometry: every vertex attribute plus the
 * index. The edge index's CPU backing array is shared per level, but each
 * geometry wraps it in its own BufferAttribute — its own GL buffer — so it
 * counts per entry.
 */
export function geometryByteSize(geometry: THREE.BufferGeometry): number {
  let bytes = geometry.getIndex()?.array.byteLength ?? 0;
  for (const name of Object.keys(geometry.attributes)) {
    bytes += (geometry.attributes[name] as THREE.BufferAttribute).array.byteLength;
  }
  return bytes;
}

/**
 * Displace a range of icosphere vertices:
 * `position[i] = dirs[i] * radius * (1 + amplitude * field(dir[i]))`.
 * The slice-range form is the resumable core the job queue steps through.
 */
function displaceRange(
  tables: IcosphereTables,
  field: RadialField,
  radius: number,
  amplitude: number,
  out: Float32Array,
  start: number,
  end: number,
): void {
  const { dirs } = tables;
  for (let i = start; i < end; i++) {
    const x = dirs[i * 3];
    const y = dirs[i * 3 + 1];
    const z = dirs[i * 3 + 2];
    const r = radius * (1 + amplitude * field(x, y, z));
    out[i * 3] = x * r;
    out[i * 3 + 1] = y * r;
    out[i * 3 + 2] = z * r;
  }
}

/**
 * Build the full displaced position buffer for one rung. Deterministic for
 * the same (field, radius, amplitude) — the field itself is seeded.
 *
 * @param out  optional buffer to fill (must hold vertexCount * 3 floats);
 *             allocated when omitted.
 */
export function buildDisplacedPositions(
  tables: IcosphereTables,
  field: RadialField,
  radius: number,
  amplitude: number,
  out?: Float32Array,
): Float32Array {
  const positions = out ?? new Float32Array(tables.vertexCount * 3);
  displaceRange(tables, field, radius, amplitude, positions, 0, tables.vertexCount);
  return positions;
}

/**
 * Wrap displaced positions + the level's deduped edge index into a
 * BufferGeometry for THREE.LineSegments. The bounding sphere is set
 * analytically from `radius * (1 + amplitude)` — no O(n) compute pass.
 *
 * The edge index's backing array is shared per level; each geometry gets its
 * own BufferAttribute wrapper so disposal never unhooks a sibling's index.
 */
export function makeLodGeometry(
  positions: Float32Array,
  edgeIndex: Uint32Array,
  radius: number,
  amplitude: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(edgeIndex, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius * (1 + Math.abs(amplitude)));
  return geometry;
}

/** Synchronous build path for the cheap rungs (levels 1-2, ≤162 verts). */
export function buildLodGeometrySync(
  tables: IcosphereTables,
  field: RadialField,
  radius: number,
  amplitude: number,
): THREE.BufferGeometry {
  const positions = buildDisplacedPositions(tables, field, radius, amplitude);
  return makeLodGeometry(positions, tables.edgeIndex, radius, amplitude);
}

/**
 * LRU cache of finished rung geometries keyed by `lodGeometryKey`, budgeted
 * in BYTES (see `GEOMETRY_CACHE_BYTES`). Eviction disposes the
 * BufferGeometry (frees the GPU buffers; the shared edge-index backing
 * array survives, three re-uploads it on next use).
 *
 * Every displayed geometry is also a cache entry (the manager always shows
 * the cached instance), so consumers must `retain` a key while a mesh uses
 * it and `release` it after — pinned entries are skipped by eviction, else
 * the LRU would dispose buffers out from under a live mesh. A pinned entry
 * may GROW while displayed (the skim haze adds a color attribute); its byte
 * account is refreshed on the release that makes it evictable again.
 */
export class GeometryCache {
  private readonly maxBytes: number;

  // Map iteration order is insertion order; re-inserting on get() makes the
  // first key the least recently used.
  private readonly entries = new Map<string, THREE.BufferGeometry>();

  // byte size per entry, tallied into totalBytes (recomputed on release —
  // attributes can be added while an entry is pinned to a live mesh)
  private readonly sizes = new Map<string, number>();

  private totalBytes = 0;

  // in-use refcounts; a present key means "never evict"
  private readonly pins = new Map<string, number>();

  private disposed = false;

  constructor(maxBytes: number = GEOMETRY_CACHE_BYTES) {
    this.maxBytes = Math.max(1, maxBytes);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Current byte account of every cached geometry (stats overlay, tests). */
  get bytes(): number {
    return this.totalBytes;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Returns the cached geometry (marking it most recently used), if any. */
  get(key: string): THREE.BufferGeometry | undefined {
    const geometry = this.entries.get(key);
    if (geometry !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, geometry);
    }
    return geometry;
  }

  /** Pin a key: eviction skips it until every retain is released. */
  retain(key: string): void {
    this.pins.set(key, (this.pins.get(key) ?? 0) + 1);
  }

  /** Drop one pin; the last release makes the key evictable again. */
  release(key: string): void {
    const count = this.pins.get(key);
    if (count === undefined) return;
    if (count > 1) {
      this.pins.set(key, count - 1);
      return;
    }
    this.pins.delete(key);
    this.reaccount(key); // the haze may have grown the entry while pinned
    this.evictOverflow(); // pinned overflow may be waiting to shrink back
  }

  /** Insert a geometry, evicting (and disposing) unpinned LRU entries when full. */
  set(key: string, geometry: THREE.BufferGeometry): void {
    if (this.disposed) {
      // a stale async build landing after dispose() must not re-populate
      // (nothing would ever free it)
      geometry.dispose();
      return;
    }
    const existing = this.entries.get(key);
    // a pinned existing backs a live mesh; leave its buffers alone (the pin
    // implies get() served it, so a same-key rebuild cannot actually occur)
    if (existing !== undefined && existing !== geometry && !this.pins.has(key)) existing.dispose();
    this.entries.delete(key);
    this.totalBytes -= this.sizes.get(key) ?? 0;
    this.entries.set(key, geometry);
    const size = geometryByteSize(geometry);
    this.sizes.set(key, size);
    this.totalBytes += size;
    this.evictOverflow(key);
  }

  /** Refresh one entry's byte account after its attributes changed. */
  private reaccount(key: string): void {
    const geometry = this.entries.get(key);
    if (geometry === undefined) return;
    const size = geometryByteSize(geometry);
    this.totalBytes += size - (this.sizes.get(key) ?? 0);
    this.sizes.set(key, size);
  }

  private evictOverflow(protectedKey?: string): void {
    if (this.totalBytes <= this.maxBytes) return;
    for (const [key, geometry] of this.entries) {
      if (this.pins.has(key)) continue; // in use — soft cap overflows instead
      if (key === protectedKey) continue; // never evict the entry set() just added
      this.entries.delete(key);
      this.totalBytes -= this.sizes.get(key) ?? 0;
      this.sizes.delete(key);
      geometry.dispose();
      if (this.totalBytes <= this.maxBytes) return;
    }
  }

  /** Dispose every cached geometry and empty the cache. */
  dispose(): void {
    this.disposed = true;
    for (const geometry of this.entries.values()) geometry.dispose();
    this.entries.clear();
    this.sizes.clear();
    this.totalBytes = 0;
    this.pins.clear();
  }
}

export interface GeometryJobRequest {
  /** Cache key (`lodGeometryKey(seed, kind, radius, level)`); also the job's identity. */
  key: string;
  tables: IcosphereTables;
  field: RadialField;
  radius: number;
  amplitude: number;
  /** Urgency — the LOD manager passes projected screen px; higher runs first. */
  priority: number;
}

interface GeometryJob extends GeometryJobRequest {
  positions: Float32Array;
  nextVertex: number;
  cancelled: boolean;
  resolve: (geometry: THREE.BufferGeometry | null) => void;
  promise: Promise<THREE.BufferGeometry | null>;
}

/**
 * Budgeted queue for the expensive rungs. Each `update()` drains job slices
 * through C4's `runBudgeted` in descending-priority order, so the body
 * closest on screen resolves first and no frame overruns its budget (the
 * scheduler's ≥1-step guarantee still applies: one slice, not one job).
 *
 * A body stays at its current level until its job's promise lands; cancelled
 * jobs stop early and resolve `null`.
 */
export class GeometryJobQueue {
  private readonly jobs = new Map<string, GeometryJob>();

  /** Number of jobs still building. */
  get pending(): number {
    return this.jobs.size;
  }

  /**
   * Queue a geometry build. Re-enqueueing a pending key returns the existing
   * job's promise and raises its priority to the max of old and new.
   */
  enqueue(request: GeometryJobRequest): Promise<THREE.BufferGeometry | null> {
    const existing = this.jobs.get(request.key);
    if (existing) {
      existing.priority = Math.max(existing.priority, request.priority);
      return existing.promise;
    }
    let resolve!: (geometry: THREE.BufferGeometry | null) => void;
    const promise = new Promise<THREE.BufferGeometry | null>((res) => {
      resolve = res;
    });
    this.jobs.set(request.key, {
      ...request,
      positions: new Float32Array(request.tables.vertexCount * 3),
      nextVertex: 0,
      cancelled: false,
      resolve,
      promise,
    });
    return promise;
  }

  /** Re-prioritize a pending job (no-op for unknown keys). */
  setPriority(key: string, priority: number): void {
    const job = this.jobs.get(key);
    if (job) job.priority = priority;
  }

  /** Stop a pending job; its promise resolves `null`. No-op for unknown keys. */
  cancel(key: string): void {
    const job = this.jobs.get(key);
    if (!job) return;
    job.cancelled = true;
    this.jobs.delete(key);
    job.resolve(null);
  }

  /** Cancel every pending job (dispose path). */
  clear(): void {
    for (const key of [...this.jobs.keys()]) this.cancel(key);
  }

  /**
   * Process job slices until `budgetMs` is spent. Call once per frame.
   *
   * @param now  clock override for tests (defaults to performance.now).
   * @returns the number of slices executed.
   */
  update(budgetMs: number = JOB_BUDGET_MS, now?: () => number): number {
    if (this.jobs.size === 0) return 0;

    // Snapshot in descending priority; setPriority/enqueue between updates
    // reorder naturally because the steps are rebuilt every frame.
    const ordered = [...this.jobs.values()].sort((a, b) => b.priority - a.priority);
    const steps: BuildStep[] = [];
    for (const job of ordered) {
      const remaining = job.tables.vertexCount - job.nextVertex;
      const sliceCount = Math.ceil(remaining / SLICE_VERTS);
      for (let s = 0; s < sliceCount; s++) steps.push(() => this.runSlice(job));
    }
    return now === undefined ? runBudgeted(steps, budgetMs) : runBudgeted(steps, budgetMs, now);
  }

  private runSlice(job: GeometryJob): void {
    // A job cancelled earlier in this same update leaves its remaining
    // steps as no-ops.
    if (job.cancelled || job.nextVertex >= job.tables.vertexCount) return;
    const end = Math.min(job.nextVertex + SLICE_VERTS, job.tables.vertexCount);
    displaceRange(job.tables, job.field, job.radius, job.amplitude, job.positions, job.nextVertex, end);
    job.nextVertex = end;
    if (job.nextVertex >= job.tables.vertexCount) {
      this.jobs.delete(job.key);
      job.resolve(makeLodGeometry(job.positions, job.tables.edgeIndex, job.radius, job.amplitude));
    }
  }
}

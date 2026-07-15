/**
 * Icosphere subdivision tables for the LOD ladder.
 *
 * Built by midpoint subdivision from the base icosahedron. New vertices are
 * always appended AFTER the existing ones, so level k's vertices are exactly
 * indices 0..V(k)-1 of level k+1 (V = 12, 42, 162, 642, 2562, 10242, 40962).
 * That subset property is what keeps silhouettes aligned across LOD transitions:
 * a displacement field sampled at every level produces geometrically nested
 * surfaces — higher levels only add detail between existing vertices.
 *
 * `edgeIndex` dedupes shared triangle edges (each edge appears once), so
 * displaced rungs render as THREE.LineSegments at half the vertex throughput
 * of `wireframe: true` with pixel-identical output.
 *
 * Tables are memoized per level at module scope (lazy — DEEP FIELD only ever
 * needs up to level 3). Plain typed arrays, no THREE — tests run in node.
 */

/** Subdivision levels supported by the ladder (level 0 is the shared dot). */
export type IcosphereLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface IcosphereTables {
  /** Subdivision level (1..6). */
  level: number;
  /** 10 * 4^level + 2. */
  vertexCount: number;
  /** vertexCount * 3 unit-sphere directions, subset-nested across levels. */
  dirs: Float32Array;
  /** 20 * 4^level triangles, 3 indices each. */
  triIndex: Uint32Array;
  /** 30 * 4^level unique edges, 2 indices each (deduped, a < b). */
  edgeIndex: Uint32Array;
}

interface MutableMesh {
  /** Flat xyz triples of unit directions. */
  dirs: number[];
  /** Flat triangle index triples. */
  tris: number[];
}

/** Base icosahedron: 12 unit-normalized vertices, 20 triangles. */
function baseIcosahedron(): MutableMesh {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: number[][] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const dirs: number[] = [];
  for (const [x, y, z] of raw) {
    const inv = 1 / Math.hypot(x, y, z);
    // Round-trip through Float32 immediately so every level sees bitwise
    // the same base vertices (the subset property is exact, not approximate).
    dirs.push(Math.fround(x * inv), Math.fround(y * inv), Math.fround(z * inv));
  }
  const tris = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  return { dirs, tris };
}

/** One midpoint-subdivision pass; appends new vertices after existing ones. */
function subdivide(mesh: MutableMesh): MutableMesh {
  const dirs = mesh.dirs.slice();
  const tris: number[] = [];
  // Midpoint cache keyed by the unordered vertex pair. Vertex indices stay
  // below 40962 < 2^20 (level 6's count), so min * 2^20 + max is
  // collision-free — and comfortably exact: 40962 * 2^20 ≈ 4.3e10 < 2^53.
  const midCache = new Map<number, number>();

  const midpoint = (a: number, b: number): number => {
    const key = Math.min(a, b) * 0x100000 + Math.max(a, b);
    const cached = midCache.get(key);
    if (cached !== undefined) return cached;
    const x = dirs[a * 3] + dirs[b * 3];
    const y = dirs[a * 3 + 1] + dirs[b * 3 + 1];
    const z = dirs[a * 3 + 2] + dirs[b * 3 + 2];
    const inv = 1 / Math.hypot(x, y, z);
    const index = dirs.length / 3;
    dirs.push(Math.fround(x * inv), Math.fround(y * inv), Math.fround(z * inv));
    midCache.set(key, index);
    return index;
  };

  for (let i = 0; i < mesh.tris.length; i += 3) {
    const a = mesh.tris[i];
    const b = mesh.tris[i + 1];
    const c = mesh.tris[i + 2];
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    tris.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }
  return { dirs, tris };
}

/** Dedupe triangle edges into a flat (a, b) index list with a < b. */
function buildEdgeIndex(tris: number[]): Uint32Array {
  const seen = new Set<number>();
  const edges: number[] = [];
  const addEdge = (a: number, b: number): void => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = lo * 0x100000 + hi;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(lo, hi);
  };
  for (let i = 0; i < tris.length; i += 3) {
    addEdge(tris[i], tris[i + 1]);
    addEdge(tris[i + 1], tris[i + 2]);
    addEdge(tris[i + 2], tris[i]);
  }
  return Uint32Array.from(edges);
}

// Memoized meshes by level (index 0 = base icosahedron) and finished tables.
const meshes: MutableMesh[] = [];
const tables = new Map<number, IcosphereTables>();

/**
 * Subdivision tables for one level. Cached per level at module scope —
 * callers share the returned typed arrays and must never mutate them.
 */
export function getIcosphereTables(level: IcosphereLevel): IcosphereTables {
  const cached = tables.get(level);
  if (cached) return cached;

  if (meshes.length === 0) meshes.push(baseIcosahedron());
  while (meshes.length <= level) meshes.push(subdivide(meshes[meshes.length - 1]));

  const mesh = meshes[level];
  const built: IcosphereTables = {
    level,
    vertexCount: mesh.dirs.length / 3,
    dirs: Float32Array.from(mesh.dirs),
    triIndex: Uint32Array.from(mesh.tris),
    edgeIndex: buildEdgeIndex(mesh.tris),
  };
  tables.set(level, built);
  return built;
}

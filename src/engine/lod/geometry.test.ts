import { describe, expect, it, vi } from 'vitest';
import { makeDisplacementField, PLANET_PROFILE } from 'engine/lod/displacement';
import {
  buildDisplacedPositions,
  buildLodGeometrySync,
  GEOMETRY_CACHE_BYTES,
  GeometryCache,
  geometryByteSize,
  GeometryJobQueue,
  lodGeometryKey,
  makeLodGeometry,
  SLICE_VERTS,
} from 'engine/lod/geometry';
import { getIcosphereTables } from 'engine/lod/icosphere';
import * as THREE from 'three';

const field = makeDisplacementField(1234, PLANET_PROFILE);

/** Fake clock advancing 1 ms per call — makes the queue run 1 step/update. */
const oneStepClock = () => {
  let t = 0;
  return () => t++;
};

/** Placeholder geometry holding exactly `bytes` of position data. */
const stubGeometry = (bytes = 1024) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bytes / 4), 1));
  return geometry;
};

describe('buildDisplacedPositions', () => {
  it('is deterministic for the same tables/field/radius/amplitude', () => {
    const tables = getIcosphereTables(3);
    const a = buildDisplacedPositions(tables, field, 20, 0.06);
    const b = buildDisplacedPositions(tables, field, 20, 0.06);
    expect(a).toEqual(b);
  });

  it('keeps every vertex radius within R * (1 ± amplitude)', () => {
    const tables = getIcosphereTables(2);
    const radius = 15;
    const amplitude = 0.14;
    const p = buildDisplacedPositions(tables, field, radius, amplitude);
    for (let i = 0; i < p.length; i += 3) {
      const r = Math.hypot(p[i], p[i + 1], p[i + 2]);
      expect(r).toBeGreaterThanOrEqual(radius * (1 - amplitude) - 1e-6);
      expect(r).toBeLessThanOrEqual(radius * (1 + amplitude) + 1e-6);
    }
  });

  it('fills and returns the provided out buffer without reallocating', () => {
    const tables = getIcosphereTables(1);
    const out = new Float32Array(tables.vertexCount * 3);
    const result = buildDisplacedPositions(tables, field, 10, 0.06, out);
    expect(result).toBe(out);
    expect(result).toEqual(buildDisplacedPositions(tables, field, 10, 0.06));
  });

  it('zero amplitude yields a perfect sphere at the given radius', () => {
    const tables = getIcosphereTables(1);
    const p = buildDisplacedPositions(tables, field, 26, 0);
    for (let i = 0; i < p.length; i += 3) {
      expect(Math.hypot(p[i], p[i + 1], p[i + 2])).toBeCloseTo(26, 4);
    }
  });
});

describe('makeLodGeometry / buildLodGeometrySync', () => {
  it('wires positions + edge index and sets the analytic bounding sphere', () => {
    const tables = getIcosphereTables(2);
    const geometry = buildLodGeometrySync(tables, field, 20, 0.06);
    expect(geometry.getAttribute('position').count).toBe(tables.vertexCount);
    expect(geometry.getIndex()?.count).toBe(tables.edgeIndex.length);
    expect(geometry.boundingSphere?.radius).toBeCloseTo(20 * 1.06, 10);
    geometry.dispose();
  });

  it('gives each geometry its own index attribute over the shared edge table', () => {
    const tables = getIcosphereTables(1);
    const p = buildDisplacedPositions(tables, field, 5, 0.06);
    const a = makeLodGeometry(p, tables.edgeIndex, 5, 0.06);
    const b = makeLodGeometry(p, tables.edgeIndex, 5, 0.06);
    expect(a.getIndex()).not.toBe(b.getIndex());
    expect(a.getIndex()?.array).toBe(tables.edgeIndex);
    a.dispose();
    b.dispose();
  });
});

describe('lodGeometryKey', () => {
  it('keys by seed, kind, radius, and level', () => {
    expect(lodGeometryKey(42, 'planet', 60, 3)).toBe('42:planet:60:3');
  });

  it('colliding seeds still get distinct keys when kind or radius differ', () => {
    expect(lodGeometryKey(42, 'planet', 60, 3)).not.toBe(lodGeometryKey(42, 'asteroid', 60, 3));
    expect(lodGeometryKey(42, 'planet', 60, 3)).not.toBe(lodGeometryKey(42, 'planet', 25, 3));
  });
});

describe('geometryByteSize', () => {
  it('counts positions + index (+ a color attribute when present)', () => {
    const tables = getIcosphereTables(3);
    const geometry = buildLodGeometrySync(tables, field, 20, 0.06);
    const positionBytes = tables.vertexCount * 3 * 4;
    const indexBytes = tables.edgeIndex.length * 4;
    expect(geometryByteSize(geometry)).toBe(positionBytes + indexBytes);

    // the skim haze adds a color attribute — the account must grow with it
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(tables.vertexCount * 3), 3),
    );
    expect(geometryByteSize(geometry)).toBe(positionBytes * 2 + indexBytes);
    geometry.dispose();
  });

  it('a level-6 rung is ~1.4 MB: positions ≈ 480 KB + edge index ≈ 960 KB', () => {
    const tables = getIcosphereTables(6);
    expect(tables.vertexCount * 3 * 4).toBe(491_544);
    expect(tables.edgeIndex.length * 4).toBe(983_040);
    const geometry = makeLodGeometry(
      new Float32Array(tables.vertexCount * 3),
      tables.edgeIndex,
      20,
      0.06,
    );
    expect(geometryByteSize(geometry)).toBe(491_544 + 983_040);
    // the default budget holds ~8 of them
    expect(Math.floor(GEOMETRY_CACHE_BYTES / geometryByteSize(geometry))).toBe(8);
    geometry.dispose();
  });
});

describe('GeometryCache', () => {
  it('returns the same geometry instance on hit', () => {
    const cache = new GeometryCache();
    const g = stubGeometry();
    cache.set('1:3', g);
    expect(cache.get('1:3')).toBe(g);
    expect(cache.get('1:3')).toBe(g);
    cache.dispose();
  });

  it('misses on unknown keys', () => {
    const cache = new GeometryCache();
    expect(cache.get('nope')).toBeUndefined();
    expect(cache.has('nope')).toBe(false);
  });

  it('evicts and disposes the LRU entry when an insert overflows the byte budget', () => {
    const cache = new GeometryCache(3 * 1024); // exactly three 1 KB entries
    const first = stubGeometry();
    const disposeSpy = vi.spyOn(first, 'dispose');
    cache.set('seed0:5', first);
    cache.set('seed1:5', stubGeometry());
    cache.set('seed2:5', stubGeometry());
    expect(cache.size).toBe(3);
    expect(cache.bytes).toBe(3 * 1024);
    expect(disposeSpy).not.toHaveBeenCalled();

    cache.set('overflow:5', stubGeometry());
    expect(cache.size).toBe(3);
    expect(cache.bytes).toBe(3 * 1024);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(cache.has('seed0:5')).toBe(false);
    cache.dispose();
  });

  it('evicts as many entries as the incoming bytes demand', () => {
    const cache = new GeometryCache(4 * 1024);
    cache.set('a', stubGeometry());
    cache.set('b', stubGeometry());
    cache.set('c', stubGeometry());
    cache.set('big', stubGeometry(3 * 1024)); // needs two evictions, not one
    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(cache.bytes).toBe(4 * 1024);
    cache.dispose();
  });

  it('a get() refreshes recency, so the untouched entry is evicted instead', () => {
    const cache = new GeometryCache(2 * 1024);
    const a = stubGeometry();
    const b = stubGeometry();
    const disposeB = vi.spyOn(b, 'dispose');
    cache.set('a', a);
    cache.set('b', b);
    cache.get('a'); // b is now LRU
    cache.set('c', stubGeometry());
    expect(disposeB).toHaveBeenCalledTimes(1);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    cache.dispose();
  });

  it('dispose() disposes everything and empties the cache', () => {
    const cache = new GeometryCache();
    const g = stubGeometry();
    const spy = vi.spyOn(g, 'dispose');
    cache.set('x', g);
    cache.dispose();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);
    expect(cache.bytes).toBe(0);
  });

  it('a retained entry survives eviction pressure; the next unpinned entry goes instead', () => {
    const cache = new GeometryCache(2 * 1024);
    const pinned = stubGeometry();
    const disposePinned = vi.spyOn(pinned, 'dispose');
    const b = stubGeometry();
    const disposeB = vi.spyOn(b, 'dispose');
    cache.set('pinned', pinned);
    cache.retain('pinned');
    cache.set('b', b);
    cache.set('c', stubGeometry()); // pinned is LRU but must be skipped
    expect(disposePinned).not.toHaveBeenCalled();
    expect(cache.get('pinned')).toBe(pinned);
    expect(disposeB).toHaveBeenCalledTimes(1);
    cache.dispose();
  });

  it('overflow held by pins shrinks back once the last retain is released', () => {
    const cache = new GeometryCache(1024);
    const a = stubGeometry();
    const disposeA = vi.spyOn(a, 'dispose');
    cache.set('a', a);
    cache.retain('a');
    cache.retain('a'); // two holders
    cache.set('b', stubGeometry()); // over budget; only 'a' is evictable-but-pinned
    expect(cache.size).toBe(2);
    cache.release('a');
    expect(disposeA).not.toHaveBeenCalled(); // still one holder
    cache.release('a');
    expect(disposeA).toHaveBeenCalledTimes(1); // last release trims the overflow
    expect(cache.size).toBe(1);
    expect(cache.bytes).toBe(1024);
    cache.dispose();
  });

  it('re-accounts an entry that grew while pinned (haze color attribute)', () => {
    const cache = new GeometryCache(64 * 1024);
    const a = stubGeometry(1024);
    cache.set('a', a);
    cache.retain('a');
    a.setAttribute('color', new THREE.BufferAttribute(new Float32Array(512), 1)); // +2 KB
    expect(cache.bytes).toBe(1024); // stale while pinned — nothing to evict anyway
    cache.release('a');
    expect(cache.bytes).toBe(1024 + 2048); // refreshed by the release
    cache.dispose();
  });

  it('set() after dispose() disposes the incoming geometry instead of storing it', () => {
    const cache = new GeometryCache();
    cache.dispose();
    const late = stubGeometry();
    const spy = vi.spyOn(late, 'dispose');
    cache.set('stale-job', late);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);
  });
});

describe('GeometryJobQueue', () => {
  const jobRequest = (key: string, level: 3 | 4 | 5, priority: number) => ({
    key,
    tables: getIcosphereTables(level),
    field,
    radius: 20,
    amplitude: 0.06,
    priority,
  });

  it('a sub5 job under a tiny budget takes multiple updates and matches the sync build exactly', async () => {
    const queue = new GeometryJobQueue();
    const tables = getIcosphereTables(5);
    const promise = queue.enqueue(jobRequest('1234:5', 5, 100));

    const expectedUpdates = Math.ceil(tables.vertexCount / SLICE_VERTS);
    let updates = 0;
    while (queue.pending > 0) {
      // 1 ms/step fake clock + 0.5 ms budget = exactly one slice per update.
      expect(queue.update(0.5, oneStepClock())).toBe(1);
      updates++;
      expect(updates).toBeLessThanOrEqual(expectedUpdates);
    }
    expect(updates).toBe(expectedUpdates);
    expect(updates).toBeGreaterThan(1);

    const geometry = await promise;
    const sync = buildLodGeometrySync(tables, field, 20, 0.06);
    expect(geometry).not.toBeNull();
    expect(geometry!.getAttribute('position').array).toEqual(sync.getAttribute('position').array);
    geometry!.dispose();
    sync.dispose();
  });

  it('a generous budget finishes a job in a single update', async () => {
    const queue = new GeometryJobQueue();
    const promise = queue.enqueue(jobRequest('1234:3', 3, 1));
    queue.update(1000);
    expect(queue.pending).toBe(0);
    expect(await promise).toBeInstanceOf(THREE.BufferGeometry);
  });

  it('a cancelled job resolves null and never delivers geometry', async () => {
    const queue = new GeometryJobQueue();
    const promise = queue.enqueue(jobRequest('1234:5', 5, 1));
    queue.update(0.5, oneStepClock()); // partially built
    queue.cancel('1234:5');
    expect(queue.pending).toBe(0);
    expect(await promise).toBeNull();
    // Further updates are no-ops.
    expect(queue.update(1000)).toBe(0);
  });

  it('processes the higher-priority job first', async () => {
    const queue = new GeometryJobQueue();
    const landed: string[] = [];
    const low = queue.enqueue(jobRequest('low:4', 4, 10)).then(() => landed.push('low'));
    const high = queue.enqueue(jobRequest('high:4', 4, 200)).then(() => landed.push('high'));
    while (queue.pending > 0) queue.update(0.5, oneStepClock());
    await Promise.all([low, high]);
    expect(landed).toEqual(['high', 'low']);
  });

  it('setPriority reorders pending jobs between updates', async () => {
    const queue = new GeometryJobQueue();
    const landed: string[] = [];
    const a = queue.enqueue(jobRequest('a:4', 4, 50)).then(() => landed.push('a'));
    const b = queue.enqueue(jobRequest('b:4', 4, 10)).then(() => landed.push('b'));
    queue.setPriority('b:4', 500); // b overtakes a before any slice has run
    while (queue.pending > 0) queue.update(0.5, oneStepClock());
    await Promise.all([a, b]);
    expect(landed).toEqual(['b', 'a']);
  });

  it('re-enqueueing a pending key returns the same promise and keeps one job', () => {
    const queue = new GeometryJobQueue();
    const p1 = queue.enqueue(jobRequest('dup:3', 3, 5));
    const p2 = queue.enqueue(jobRequest('dup:3', 3, 50));
    expect(p2).toBe(p1);
    expect(queue.pending).toBe(1);
  });

  it('clear() cancels every pending job', async () => {
    const queue = new GeometryJobQueue();
    const p1 = queue.enqueue(jobRequest('x:4', 4, 1));
    const p2 = queue.enqueue(jobRequest('y:4', 4, 2));
    queue.clear();
    expect(queue.pending).toBe(0);
    expect(await p1).toBeNull();
    expect(await p2).toBeNull();
  });

  it('update() with an empty queue does nothing', () => {
    const queue = new GeometryJobQueue();
    expect(queue.update()).toBe(0);
  });
});

it('charges cold topology preparation to the same incremental job budget', async () => {
  vi.resetModules();
  const { GeometryJobQueue: ColdQueue } = await import('engine/lod/geometry');
  const { getIcosphereTables: coldTables } = await import('engine/lod/icosphere');
  const queue = new ColdQueue();
  const sample = vi.fn(() => 0);
  const promise = queue.enqueue({ key: 'cold', tables: 6, field: sample, radius: 20, amplitude: 0.06, priority: 1 });
  expect(sample).not.toHaveBeenCalled();
  queue.update(0, oneStepClock());
  expect(sample).not.toHaveBeenCalled(); // still preparing topology, not a synchronous build
  expect(queue.pending).toBe(1);
  let updates = 1;
  while (queue.pending && updates < 2000) {
    queue.update(0, oneStepClock());
    updates++;
  }
  expect(queue.pending).toBe(0);
  expect(updates).toBeGreaterThan(Math.ceil(40962 / SLICE_VERTS));
  const geometry = await promise;
  const expected = buildLodGeometrySync(coldTables(6), () => 0, 20, 0.06);
  expect(geometry!.getAttribute('position').array).toEqual(expected.getAttribute('position').array);
  geometry!.dispose(); expected.dispose();
});

it('can cancel during topology preparation and reuse that progress for another body', async () => {
  vi.resetModules();
  const { GeometryJobQueue: ColdQueue } = await import('engine/lod/geometry');
  const queue = new ColdQueue();
  const abandonedField = vi.fn(() => 0);
  const abandoned = queue.enqueue({ key: 'abandoned', tables: 6, field: abandonedField, radius: 20, amplitude: 0.06, priority: 1 });
  queue.update(0, oneStepClock());
  queue.cancel('abandoned');
  expect(await abandoned).toBeNull();
  const survivor = queue.enqueue({ key: 'survivor', tables: 6, field: () => 0, radius: 30, amplitude: 0.06, priority: 1 });
  queue.update(1000);
  expect(queue.pending).toBe(0);
  expect(abandonedField).not.toHaveBeenCalled();
  const geometry = await survivor;
  expect(geometry!.boundingSphere!.radius).toBeCloseTo(31.8);
  geometry!.dispose();
});

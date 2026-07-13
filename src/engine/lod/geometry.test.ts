import { describe, expect, it, vi } from 'vitest';
import { makeDisplacementField, PLANET_PROFILE } from 'engine/lod/displacement';
import {
  buildDisplacedPositions,
  buildLodGeometrySync,
  GEOMETRY_CACHE_MAX,
  GeometryCache,
  GeometryJobQueue,
  lodGeometryKey,
  makeLodGeometry,
  SLICE_VERTS,
} from 'engine/lod/geometry';
import { getIcosphereTables } from 'engine/lod/icosphere';
import * as THREE from 'three';

const field = makeDisplacementField(1234, PLANET_PROFILE);

/** Fake clock advancing 1 ms per call — makes runBudgeted run 1 step/update. */
const oneStepClock = () => {
  let t = 0;
  return () => t++;
};

/** Tiny placeholder geometry for cache tests. */
const stubGeometry = () => new THREE.BufferGeometry();

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

  it(`evicts and disposes the LRU entry when entry ${GEOMETRY_CACHE_MAX + 1} lands`, () => {
    const cache = new GeometryCache();
    const first = stubGeometry();
    const disposeSpy = vi.spyOn(first, 'dispose');
    cache.set('seed0:5', first);
    for (let i = 1; i < GEOMETRY_CACHE_MAX; i++) cache.set(`seed${i}:5`, stubGeometry());
    expect(cache.size).toBe(GEOMETRY_CACHE_MAX);
    expect(disposeSpy).not.toHaveBeenCalled();

    cache.set('overflow:5', stubGeometry());
    expect(cache.size).toBe(GEOMETRY_CACHE_MAX);
    expect(disposeSpy).toHaveBeenCalledTimes(1);
    expect(cache.has('seed0:5')).toBe(false);
    cache.dispose();
  });

  it('a get() refreshes recency, so the untouched entry is evicted instead', () => {
    const cache = new GeometryCache(2);
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
  });

  it('a retained entry survives eviction pressure; the next unpinned entry goes instead', () => {
    const cache = new GeometryCache(2);
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
    const cache = new GeometryCache(1);
    const a = stubGeometry();
    const disposeA = vi.spyOn(a, 'dispose');
    cache.set('a', a);
    cache.retain('a');
    cache.retain('a'); // two holders
    cache.set('b', stubGeometry()); // over cap; only 'a' is evictable-but-pinned
    expect(cache.size).toBe(2);
    cache.release('a');
    expect(disposeA).not.toHaveBeenCalled(); // still one holder
    cache.release('a');
    expect(disposeA).toHaveBeenCalledTimes(1); // last release trims the overflow
    expect(cache.size).toBe(1);
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

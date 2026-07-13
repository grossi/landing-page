import { describe, expect, it } from 'vitest';
import { createResourceTracker } from 'engine/render/resourceTracker';

const makeFake = () => {
  let disposed = 0;
  return {
    dispose: () => {
      disposed++;
    },
    get disposed() {
      return disposed;
    },
  };
};

describe('createResourceTracker', () => {
  it('track() returns the resource for inline use', () => {
    const tracker = createResourceTracker();
    const fake = makeFake();
    expect(tracker.track(fake)).toBe(fake);
  });

  it('dispose() frees everything tracked, across all scopes', () => {
    const tracker = createResourceTracker();
    const a = tracker.track(makeFake());
    const b = tracker.track(makeFake(), 'sector:0,0,0');
    tracker.dispose();
    expect(a.disposed).toBe(1);
    expect(b.disposed).toBe(1);
  });

  it('disposeScope() frees exactly the scoped resources', () => {
    const tracker = createResourceTracker();
    const kept = tracker.track(makeFake());
    const evictedA = tracker.track(makeFake(), 'sector:1,0,0');
    const evictedB = tracker.track(makeFake(), 'sector:1,0,0');
    const other = tracker.track(makeFake(), 'sector:0,1,0');
    tracker.disposeScope('sector:1,0,0');
    expect(evictedA.disposed).toBe(1);
    expect(evictedB.disposed).toBe(1);
    expect(kept.disposed).toBe(0);
    expect(other.disposed).toBe(0);
  });

  it('disposeScope() of an unknown scope is a no-op', () => {
    const tracker = createResourceTracker();
    const fake = tracker.track(makeFake());
    tracker.disposeScope('never-created');
    expect(fake.disposed).toBe(0);
  });

  it('double dispose() is a no-op (each resource freed once)', () => {
    const tracker = createResourceTracker();
    const fake = tracker.track(makeFake());
    tracker.dispose();
    tracker.dispose();
    expect(fake.disposed).toBe(1);
  });

  it('tracking the same resource twice in one scope frees it once', () => {
    const tracker = createResourceTracker();
    const fake = makeFake();
    tracker.track(fake);
    tracker.track(fake);
    tracker.dispose();
    expect(fake.disposed).toBe(1);
  });

  it('resources tracked after a dispose() are freed by the next dispose()', () => {
    const tracker = createResourceTracker();
    tracker.dispose();
    const fake = tracker.track(makeFake());
    tracker.dispose();
    expect(fake.disposed).toBe(1);
  });
});

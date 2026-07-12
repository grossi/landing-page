/** Anything with a `dispose()` — geometries, materials, textures. */
export interface Disposable {
  dispose(): void;
}

/**
 * Disposal registry for mount-owned GPU resources.
 *
 * Consumers `track()` what they create (optionally into a named scope, e.g.
 * a sector key) and the stage frees everything tracked on teardown. Shared
 * module-scope assets from engine/render/assets are simply never tracked,
 * so they survive every mount/unmount cycle by construction.
 */
export interface ResourceTracker {
  /** Registers a resource for disposal and returns it, for inline use. */
  track<T extends Disposable>(resource: T, scope?: string): T;
  /** Disposes exactly the resources tracked into `scope` (e.g. one sector). */
  disposeScope(scope: string): void;
  /** Disposes everything still tracked. Safe to call more than once. */
  dispose(): void;
}

const DEFAULT_SCOPE = '';

export function createResourceTracker(): ResourceTracker {
  const scopes = new Map<string, Set<Disposable>>();

  return {
    track(resource, scope = DEFAULT_SCOPE) {
      let set = scopes.get(scope);
      if (!set) {
        set = new Set();
        scopes.set(scope, set);
      }
      set.add(resource);
      return resource;
    },
    disposeScope(scope) {
      const set = scopes.get(scope);
      if (!set) return;
      scopes.delete(scope);
      for (const resource of set) resource.dispose();
    },
    dispose() {
      const all = [...scopes.values()];
      scopes.clear();
      for (const set of all) for (const resource of set) resource.dispose();
    },
  };
}

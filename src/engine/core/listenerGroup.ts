/**
 * Shared listener registry for the flight experiences: `add` registers a
 * listener and records it, `dispose` removes everything — so a scene's
 * teardown can't drift out of sync with its setup (a hand-mirrored remove
 * list forgets entries as listeners come and go). The registered options
 * are replayed on removal; removeEventListener only matches on `capture`,
 * but passing the same value is always correct. `once` listeners would be
 * removed redundantly on dispose (harmless); none are used today.
 */
export interface ListenerGroup {
  /**
   * Generic over the event so narrowed handlers (`(e: PointerEvent) => …`)
   * register without casts; the type string itself is not checked against
   * the handler — pragmatic, like the key tracker.
   */
  add<E extends Event>(
    target: EventTarget,
    type: string,
    handler: (e: E) => void,
    opts?: AddEventListenerOptions | boolean,
  ): void;
  dispose(): void;
}

interface ListenerEntry {
  target: EventTarget;
  type: string;
  handler: EventListener;
  opts?: AddEventListenerOptions | boolean;
}

export function createListenerGroup(): ListenerGroup {
  const entries: ListenerEntry[] = [];
  return {
    add(target, type, handler, opts) {
      const listener = handler as EventListener;
      target.addEventListener(type, listener, opts);
      entries.push({ target, type, handler: listener, opts });
    },
    dispose() {
      for (const { target, type, handler, opts } of entries) {
        target.removeEventListener(type, handler, opts);
      }
      entries.length = 0;
    },
  };
}

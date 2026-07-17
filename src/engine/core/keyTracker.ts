/**
 * Shared key tracker for the flight experiences: a live `keys[e.code]`
 * held-state map fed by keydown/keyup. keyup never arrives for keys held
 * across a focus loss (Cmd-Tab etc.), which would leave a key stuck down,
 * so blur clears the whole map — `onBlur` lets callers drop their own
 * held-input flags (pointer holds) in the same event.
 */
export interface KeyTracker {
  /** Live held-state map, keyed by `KeyboardEvent.code`. */
  keys: Record<string, boolean>;
  dispose(): void;
}

export function createKeyTracker(target: Window, onBlur?: () => void): KeyTracker {
  const keys: Record<string, boolean> = {};
  const onKeyDown = (e: KeyboardEvent) => {
    keys[e.code] = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys[e.code] = false;
  };
  const handleBlur = () => {
    for (const code in keys) keys[code] = false;
    onBlur?.();
  };
  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', handleBlur);
  return {
    keys,
    dispose: () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', handleBlur);
    },
  };
}

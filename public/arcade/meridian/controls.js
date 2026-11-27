// How MERIDIAN turns keys and pointers into a stick. Plain math, so the tests
// can fly the game exactly as a player's keys would.

export const CONTROL = {
  /** A key is not a full stick at once. It starts at `start`, builds to full
   *  over `ramp` seconds while held, and falls back to centre over KEY_RELEASE
   *  seconds: a tap is a nudge, a hold is a turn. */
  KEY: { start: 0.2, ramp: 0.35 },
  /** Pulling up is how a ridge is cleared, so the climb key bites sooner. */
  KEY_CLIMB: { start: 0.5, ramp: 0.2 },
  KEY_RELEASE: 0.06,
  /** A mouse or thumb stick is bent by this power: a little finer near the
   *  centre, full at the rim. */
  POINTER_CURVE: 1.25,
};

/**
 * One axis steered by a pair of keys. `step` takes the direction held (−1, 0, 1)
 * and returns the stick. Each direction can have its own ramp.
 */
export function createKeyAxis({ negative = CONTROL.KEY, positive = CONTROL.KEY } = {}) {
  let value = 0;
  return {
    step(dt, direction) {
      if (direction === 0) {
        const fall = dt / CONTROL.KEY_RELEASE;
        value = Math.abs(value) <= fall ? 0 : value - Math.sign(value) * fall;
        return value;
      }
      const key = direction < 0 ? negative : positive;
      // A fresh press, or a reversal, starts over from the first nudge.
      value = Math.sign(value) !== direction
        ? direction * key.start
        : direction * Math.min(1, Math.abs(value) + (1 - key.start) / key.ramp * dt);
      return value;
    },
    reset() { value = 0; },
  };
}

/** A pointer's stick, softened around the centre. Keeps its sign and its ends. */
export const curve = value => Math.sign(value) * Math.abs(value) ** CONTROL.POINTER_CURVE;

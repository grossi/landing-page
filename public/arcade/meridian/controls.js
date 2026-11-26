// How MERIDIAN turns keys and pointers into a stick. Plain math, so the tests
// can fly the game exactly as a player's keys would.

export const CONTROL = {
  /** A key is not a full stick at once. It starts at KEY_START, builds to full
   *  over KEY_RAMP seconds while held, and falls back to centre over KEY_RELEASE
   *  seconds: a tap is a nudge, a hold is a turn. */
  KEY_START: 0.2, KEY_RAMP: 0.35, KEY_RELEASE: 0.06,
  /** A mouse or thumb stick is bent by this power: fine near the centre, full at the rim. */
  POINTER_CURVE: 1.5,
};

/** One axis steered by a pair of keys. `step` takes the direction held (−1, 0, 1). */
export function createKeyAxis() {
  let value = 0;
  return {
    step(dt, direction) {
      if (direction === 0) {
        const fall = dt / CONTROL.KEY_RELEASE;
        value = Math.abs(value) <= fall ? 0 : value - Math.sign(value) * fall;
      } else if (Math.sign(value) !== direction) {
        // A fresh press, or a reversal: start over from the first nudge.
        value = direction * CONTROL.KEY_START;
      } else {
        value = direction * Math.min(1, Math.abs(value) + (1 - CONTROL.KEY_START) / CONTROL.KEY_RAMP * dt);
      }
      return value;
    },
    reset() { value = 0; },
  };
}

/** A pointer's stick, softened around the centre. Keeps its sign and its ends. */
export const curve = value => Math.sign(value) * Math.abs(value) ** CONTROL.POINTER_CURVE;

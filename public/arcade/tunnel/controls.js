// How HYPERTUNNEL turns keys, thumbs and a mouse into one stick. Plain math,
// so the tests can fly the ship exactly as a player's hand would.
import { wrap } from './world.js';

export const CONTROL = {
  /** A key, or a thumb holding a side of the screen, is not a full stick at
   *  once. It starts at `start`, builds to full over `ramp` seconds while held,
   *  and falls back to centre over KEY_RELEASE seconds: a tap is a nudge, a
   *  hold is a turn. */
  KEY: { start: 0.2, ramp: 0.35 },
  KEY_RELEASE: 0.06,
  /** The mouse: the ship turns flat out only when it is this far (rad) from
   *  where the pointer is, and eases in from there. */
  CHASE: 0.7,
  /** Near the screen centre a small move of the hand is a big change of angle.
   *  Inside DEAD (a share of the shorter side) the pointer points nowhere and
   *  the ship keeps the angle it was last given. */
  DEAD: 0.05,
  /** A mouse must move this far (px) to take the ship back from the keys: a
   *  bumped mouse is not a turn. */
  WAKE: 24,
};

/**
 * The stick a held direction gives. `step` takes the direction held (−1, 0, 1)
 * and returns the stick's mean over those `dt` seconds, so a tap turns the
 * ship the same at any frame rate.
 */
export function createKeyAxis() {
  let value = 0;
  return {
    step(dt, direction) {
      let from = value;
      if (direction === 0) {
        const fall = dt / CONTROL.KEY_RELEASE;
        value = Math.abs(from) <= fall ? 0 : from - Math.sign(from) * fall;
      } else {
        // A fresh press, or a reversal, starts over from the first nudge.
        if (Math.sign(from) !== direction) from = direction * CONTROL.KEY.start;
        value = direction * Math.min(1, Math.abs(from) + (1 - CONTROL.KEY.start) / CONTROL.KEY.ramp * dt);
      }
      return (from + value) / 2;
    },
    reset() { value = 0; },
  };
}

/**
 * The angle a pointer is at around the screen centre, as the tunnel is drawn
 * (0 to the right, a quarter turn at the top), or null in the dead zone.
 * `x` and `y` are the pointer's offset from the centre in pixels, y down.
 */
export function pointerAngle(x, y, shorterSide) {
  // Written this way round so a pointer with no position points nowhere either.
  return Math.hypot(x, y) >= shorterSide * CONTROL.DEAD ? Math.atan2(-y, x) : null;
}

/** The stick that takes a ship at `angle` to `target` the short way round. */
export const chase = (target, angle) => Math.max(-1, Math.min(1, wrap(target - angle) / CONTROL.CHASE));

import { burnKeysDown, resolveSteer } from 'engine/core/flight';
import { createKeyTracker } from 'engine/core/keyTracker';
import { createListenerGroup } from 'engine/core/listenerGroup';
import { pointerToNdc } from 'engine/core/pointerNdc';

/** Full touch deflection, in CSS pixels of drag from where the thumb landed. */
export const STICK_RADIUS = 56;
/** A thumb this many CSS pixels outside the BURN zone's border still burns. */
export const BURN_ZONE_SLOP = 12;

const STEER_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
/** Keys that never start or retry a run: they belong to the browser and the page. */
const PASSIVE_KEYS = /^(Tab|Escape|CapsLock|NumLock|ScrollLock|ContextMenu|Shift|Control|Alt|Meta|OS|F\d+)/;

export interface FlightInputOptions {
  /**
   * The BURN zone for the second thumb. A touch that lands on it burns for
   * as long as it is down and never steers. Without one a touch only steers.
   */
  burnZone?: HTMLElement | null;
  /**
   * A fresh key press, click or tap on the game. Return true when the press
   * was spent on starting or retrying a run: a mouse button or BURN thumb
   * that did that is not also a burn.
   */
  onPress?: () => boolean;
  /** Escape. */
  onEscape?: () => void;
}

export interface FlightInput {
  /** Writes the frame's steer into `out`: both axes in [-1, 1], positive y is nose down. */
  readSteer(out: { x: number; y: number }): void;
  /** A burn is held: the mouse button, Space, or a thumb on the BURN zone. */
  burnHeld(): boolean;
  /** Drops everything held (keys, button, thumbs) and centres the stick. */
  release(): void;
  dispose(): void;
}

/**
 * EPHEMERIS input: one steer and one hold, from whichever of mouse, keys or
 * thumbs acted last.
 *
 * - Mouse: its offset from the centre of the game area is the stick, the
 *   button burns.
 * - Keys: WASD or the arrows steer, Space burns. Once a steering key is
 *   pressed the keys keep the stick, released or not, until the pointer
 *   moves again: a mouse left lying off-centre never steers for a keyboard
 *   player.
 * - Touch: a relative drag stick. Its centre is wherever the thumb lands,
 *   `STICK_RADIUS` pixels of drag is full deflection, and lifting the thumb
 *   centres it. A finger still down when the stick thumb lifts takes the
 *   stick over, centred where it is. The other thumb holds the BURN zone.
 *   This is the shape of `input.stick` in the standalone arcade runtime.
 *
 * Everything held is dropped on blur, when the page is hidden, and on
 * `pointercancel` and `touchcancel`, none of which is followed by the
 * matching release event: without that the ship would steer or burn forever.
 */
export function createFlightInput(container: HTMLElement, options: FlightInputOptions = {}): FlightInput {
  const { burnZone = null, onPress, onEscape } = options;

  // mouse position in standard GL NDC (y up) over the game area
  const pointer = { x: 0, y: 0 };
  // where the mouse was when the keys took the stick
  const parked = { x: 0, y: 0 };
  let keysSteer = false;
  let mouseDown = false;

  // touches that are down on the game area, by pointer id, and the one the
  // stick is anchored to. Screen sense: positive y is a drag down the screen.
  const touches = new Map<number, { x: number; y: number }>();
  const stick = { x: 0, y: 0 };
  let anchor: { id: number; x: number; y: number } | null = null;
  let burnTouch: number | null = null;
  // the pointer that steers when the keys do not: the last of the two to act
  let touchSteers = false;

  // Keys that were down at a release. They count again after a key-up or a
  // fresh press: the keyboard's auto-repeat of a key that started a run (or
  // was held across a phase change) must not turn into a burn or a turn.
  const suppressed = new Set<string>();

  const unit = (value: number) => Math.max(-1, Math.min(1, value));

  const release = () => {
    for (const code in keys) {
      if (keys[code]) suppressed.add(code);
      keys[code] = false;
    }
    mouseDown = false;
    burnTouch = null;
    anchor = null;
    touches.clear();
    stick.x = stick.y = 0;
    // the mouse stick centres too, until the mouse moves again: a pointer
    // left off-centre must not keep turning the ship after a blur or a cancel
    pointer.x = pointer.y = 0;
    parked.x = parked.y = 0;
    keysSteer = false;
    touchSteers = false;
  };

  const listeners = createListenerGroup();
  // On blur the key tracker clears its map before it calls `release`, which
  // would then find nothing held to suppress. This listener is registered
  // first and notes what was down, so a key still held when the window
  // comes back does not steer or burn on its auto-repeat either.
  listeners.add(window, 'blur', () => {
    for (const code in keys) {
      if (keys[code]) suppressed.add(code);
    }
  });
  // blur clears the key map inside the tracker; the rest is dropped here
  const keyTracker = createKeyTracker(window, release);
  const { keys } = keyTracker;

  const inBurnZone = (x: number, y: number) => {
    if (!burnZone) return false;
    const rect = burnZone.getBoundingClientRect();
    // a hidden zone has no box and takes no thumbs
    if (rect.width === 0 || rect.height === 0) return false;
    return (
      x >= rect.left - BURN_ZONE_SLOP &&
      x <= rect.right + BURN_ZONE_SLOP &&
      y >= rect.top - BURN_ZONE_SLOP &&
      y <= rect.bottom + BURN_ZONE_SLOP
    );
  };

  const onPointerDown = (e: PointerEvent) => {
    // Only the primary button plays. A right-click opens the browser's menu,
    // which takes the matching button-up: a burn begun there would never end.
    if (e.pointerType !== 'touch' && e.button !== 0) return;
    const spent = onPress?.() ?? false;
    if (e.pointerType !== 'touch') {
      if (!spent) mouseDown = true;
      return;
    }
    touchSteers = true;
    keysSteer = false;
    // A tap that started or retried a run is nothing more: not a burn and
    // not the stick. (The BURN zone is not on screen yet when it lands, so
    // a thumb resting where the zone will be would otherwise take the stick
    // and leave the other thumb with nothing.) Untracked, its moves and its
    // lift are dropped.
    if (spent) return;
    if (burnTouch === null && inBurnZone(e.clientX, e.clientY)) {
      burnTouch = e.pointerId;
      return;
    }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!anchor) {
      anchor = { id: e.pointerId, x: e.clientX, y: e.clientY };
      stick.x = stick.y = 0;
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') {
      pointerToNdc(pointer, e.clientX, e.clientY, container);
      touchSteers = false;
      return;
    }
    const point = touches.get(e.pointerId);
    if (!point) return;
    point.x = e.clientX;
    point.y = e.clientY;
    if (anchor && anchor.id === e.pointerId) {
      stick.x = unit((e.clientX - anchor.x) / STICK_RADIUS);
      stick.y = unit((e.clientY - anchor.y) / STICK_RADIUS);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') {
      mouseDown = false;
      return;
    }
    if (burnTouch === e.pointerId) burnTouch = null;
    touches.delete(e.pointerId);
    if (anchor && anchor.id === e.pointerId) {
      // the stick centres; a finger still down becomes its new centre where it is
      const next = touches.entries().next();
      anchor = next.done ? null : { id: next.value[0], x: next.value[1].x, y: next.value[1].y };
      stick.x = stick.y = 0;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) {
      // the key tracker (registered first) has just marked it held again
      if (suppressed.has(e.code)) keys[e.code] = false;
      return;
    }
    suppressed.delete(e.code);
    if (e.code === 'Escape') {
      onEscape?.();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || PASSIVE_KEYS.test(e.code)) return;
    // a key pressed on a link or a button is that control's, not the game's
    const target = e.target as Element | null;
    if (target?.closest?.('a, button, input, textarea, select')) return;
    onPress?.();
  };

  const onKeyUp = (e: KeyboardEvent) => {
    suppressed.delete(e.code);
  };

  // Ctrl-click on a Mac is a primary press that opens the menu all the same:
  // the menu ends the mouse burn. (Thumbs are left alone: a thumb resting on
  // BURN is a long press, and a phone may send this event for one.)
  const onContextMenu = () => {
    mouseDown = false;
  };

  const onVisibilityChange = () => {
    if (document.hidden) release();
  };

  // registered after the key tracker's own keydown, so a press that starts a
  // run (and releases everything) also drops the key that made it
  listeners.add(window, 'keydown', onKeyDown);
  listeners.add(window, 'keyup', onKeyUp);
  listeners.add(container, 'pointerdown', onPointerDown);
  listeners.add(container, 'pointermove', onPointerMove);
  listeners.add(window, 'pointerup', onPointerUp);
  listeners.add(container, 'contextmenu', onContextMenu);
  listeners.add(window, 'pointercancel', release);
  listeners.add(window, 'touchcancel', release);
  listeners.add(document, 'visibilitychange', onVisibilityChange);

  return {
    readSteer(out) {
      let keyHeld = false;
      for (const code of STEER_KEYS) {
        if (keys[code]) { keyHeld = true; break; }
      }
      if (keyHeld) {
        keysSteer = true;
        parked.x = pointer.x;
        parked.y = pointer.y;
      } else if (keysSteer && (pointer.x !== parked.x || pointer.y !== parked.y)) {
        keysSteer = false;
      }
      // resolveSteer takes NDC (y up) and owns the flip to the screen-down
      // steer sense, so the stick's screen-down y goes in negated
      if (keysSteer) resolveSteer(out, 0, 0, keys);
      else if (touchSteers) resolveSteer(out, stick.x, -stick.y, keys);
      else resolveSteer(out, pointer.x, pointer.y, keys);
    },
    burnHeld: () => mouseDown || burnTouch !== null || burnKeysDown(keys),
    release,
    dispose() {
      listeners.dispose();
      keyTracker.dispose();
      release();
      suppressed.clear();
    },
  };
}

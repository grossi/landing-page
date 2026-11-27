// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFlightInput,
  KEY_RAMP_SECONDS,
  STEER_SLEW,
  STICK_RADIUS,
  type FlightInput,
} from 'components/ephemeris/flightInput';
import { KEY_STEER } from 'engine/core/flight';

const VIEW = { width: 400, height: 800 };
const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

let container: HTMLElement;
let burnZone: HTMLElement;
let input: FlightInput;
const steer = { x: 0, y: 0 };
/**
 * The steer once it has settled: a second of frames, so key ramps and the
 * slew limit have run their course. The ramps themselves are pinned in
 * 'feel', below.
 */
const read = () => {
  for (let i = 0; i < 10; i++) input.readSteer(steer, 0.1);
  // `+ 0` folds the engine's −0 (a flipped zero) into 0 for toEqual
  return { x: steer.x + 0, y: steer.y + 0 };
};

function pointer(target: EventTarget, type: string, x: number, y: number, id = 1, pointerType = 'touch') {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: id, pointerType }));
}
const touchDown = (x: number, y: number, id = 1) => pointer(container, 'pointerdown', x, y, id);
const touchMove = (x: number, y: number, id = 1) => pointer(container, 'pointermove', x, y, id);
const touchUp = (id = 1) => pointer(window, 'pointerup', 0, 0, id);
const mouse = (type: string, x: number, y: number) =>
  pointer(type === 'pointerup' ? window : container, type, x, y, 9, 'mouse');
const key = (type: 'keydown' | 'keyup', code: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, ...init }));

beforeEach(() => {
  container = document.createElement('div');
  container.getBoundingClientRect = () => rect(0, 0, VIEW.width, VIEW.height);
  burnZone = document.createElement('div');
  // bottom right, 96 px, as on the page
  burnZone.getBoundingClientRect = () => rect(284, 640, 96, 96);
  document.body.append(container, burnZone);
  input = createFlightInput(container, { burnZone });
});
afterEach(() => {
  input.dispose();
  document.body.replaceChildren();
});

describe('touch stick', () => {
  it('is centred wherever the thumb lands: a touch alone does not steer', () => {
    touchDown(60, 700);
    expect(read()).toEqual({ x: 0, y: 0 });
    // the same touch anywhere else is still centre, never the finger's position on screen
    touchUp();
    touchDown(350, 100);
    expect(read()).toEqual({ x: 0, y: 0 });
  });

  it('deflects by the drag from where it landed, full at 56 px', () => {
    expect(STICK_RADIUS).toBe(56);
    touchDown(100, 600);
    touchMove(100 + 28, 600);
    expect(read()).toEqual({ x: 0.5, y: 0 });
    touchMove(100 + 56, 600);
    expect(read().x).toBe(1);
    // past the radius it stays at full deflection
    touchMove(100 + 300, 600 - 300);
    expect(read()).toEqual({ x: 1, y: -1 });
  });

  it('a drag down the screen noses down, a drag up noses up', () => {
    touchDown(100, 600);
    touchMove(100, 600 + 28);
    expect(read()).toEqual({ x: 0, y: 0.5 });
    touchMove(100 - 14, 600 - 56);
    expect(read()).toEqual({ x: -0.25, y: -1 });
  });

  it('lifting the thumb centres the stick', () => {
    touchDown(100, 600);
    touchMove(156, 600);
    expect(read().x).toBe(1);
    touchUp();
    expect(read()).toEqual({ x: 0, y: 0 });
    // and the lifted touch no longer moves it
    touchMove(300, 300);
    expect(read()).toEqual({ x: 0, y: 0 });
  });

  it('a second finger does not move the stick while the first is down', () => {
    touchDown(100, 600, 1);
    touchMove(128, 600, 1);
    touchDown(200, 300, 2);
    touchMove(260, 200, 2);
    expect(read()).toEqual({ x: 0.5, y: 0 });
  });

  it('a finger still down takes the stick over when the thumb lifts, centred where it is', () => {
    touchDown(100, 600, 1);
    touchMove(156, 600, 1);
    touchDown(200, 300, 2);
    touchMove(230, 310, 2);
    touchUp(1);
    // centred at the second finger's current position, not where it landed
    expect(read()).toEqual({ x: 0, y: 0 });
    touchMove(230 + 28, 310, 2);
    expect(read()).toEqual({ x: 0.5, y: 0 });
    touchUp(2);
    expect(read()).toEqual({ x: 0, y: 0 });
  });

  it('steers without burning: a touch outside the BURN zone is never a burn', () => {
    touchDown(100, 600);
    touchMove(156, 544);
    expect(input.burnHeld()).toBe(false);
  });
});

describe('BURN zone', () => {
  it('burns while a thumb is on it, and does not steer', () => {
    touchDown(330, 690, 2);
    expect(input.burnHeld()).toBe(true);
    touchMove(200, 400, 2);
    expect(read()).toEqual({ x: 0, y: 0 });
    // sliding off the zone keeps the burn until the thumb lifts
    expect(input.burnHeld()).toBe(true);
    touchUp(2);
    expect(input.burnHeld()).toBe(false);
  });

  it('works with the stick: one thumb each, either order, either lifted first', () => {
    touchDown(100, 600, 1);
    touchDown(330, 690, 2);
    touchMove(100, 600 - 56, 1);
    expect(read()).toEqual({ x: 0, y: -1 });
    expect(input.burnHeld()).toBe(true);

    // the stick thumb lifts: the burn thumb does not become the stick
    touchUp(1);
    touchMove(200, 200, 2);
    expect(read()).toEqual({ x: 0, y: 0 });
    expect(input.burnHeld()).toBe(true);

    // the stick comes back under a held burn
    touchDown(80, 500, 3);
    touchMove(80 + 56, 500, 3);
    expect(read().x).toBe(1);
    touchUp(2);
    expect(input.burnHeld()).toBe(false);
    expect(read().x).toBe(1);
  });

  it('forgives a thumb just outside the border, and nothing further', () => {
    touchDown(284 - 10, 700, 2);
    expect(input.burnHeld()).toBe(true);
    touchUp(2);
    touchDown(284 - 20, 700, 3);
    expect(input.burnHeld()).toBe(false);
  });

  it('takes no thumbs while it is hidden', () => {
    burnZone.getBoundingClientRect = () => rect(0, 0, 0, 0);
    touchDown(0, 0, 2);
    expect(input.burnHeld()).toBe(false);
  });

  it('a mouse click on the zone is a mouse burn like anywhere else', () => {
    mouse('pointerdown', 330, 690);
    expect(input.burnHeld()).toBe(true);
    mouse('pointerup', 330, 690);
    expect(input.burnHeld()).toBe(false);
  });
});

describe('release', () => {
  const holdEverything = () => {
    touchDown(100, 600, 1);
    touchMove(156, 544, 1);
    touchDown(330, 690, 2);
    key('keydown', 'Space');
    expect(read()).toEqual({ x: 1, y: -1 });
    expect(input.burnHeld()).toBe(true);
  };
  const expectReleased = () => {
    expect(read()).toEqual({ x: 0, y: 0 });
    expect(input.burnHeld()).toBe(false);
    // the cancelled touches are gone: their late moves and lifts do nothing
    touchMove(300, 100, 1);
    touchUp(2);
    expect(read()).toEqual({ x: 0, y: 0 });
    expect(input.burnHeld()).toBe(false);
  };

  it('on pointercancel', () => {
    holdEverything();
    pointer(window, 'pointercancel', 0, 0, 1);
    expectReleased();
  });

  it('on touchcancel', () => {
    holdEverything();
    window.dispatchEvent(new Event('touchcancel'));
    expectReleased();
  });

  it('on blur', () => {
    holdEverything();
    window.dispatchEvent(new Event('blur'));
    expectReleased();
  });

  it('when the page is hidden', () => {
    holdEverything();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    hidden.mockRestore();
    expectReleased();
  });

  it('not when the page becomes visible', () => {
    holdEverything();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(input.burnHeld()).toBe(true);
    expect(read()).toEqual({ x: 1, y: -1 });
  });

  it('drops a held mouse button and held keys too', () => {
    mouse('pointerdown', 200, 400);
    key('keydown', 'KeyA');
    expect(input.burnHeld()).toBe(true);
    expect(read().x).toBe(-KEY_STEER);
    window.dispatchEvent(new Event('blur'));
    expect(input.burnHeld()).toBe(false);
    expect(read().x).toBe(0);
  });

  it('centres the mouse stick too, until the mouse moves again', () => {
    for (const drop of [
      () => window.dispatchEvent(new Event('blur')),
      () => pointer(window, 'pointercancel', 0, 0, 9, 'mouse'),
      () => input.release(),
    ]) {
      mouse('pointermove', 400, 400);
      expect(read().x).toBe(1);
      drop();
      expect(read()).toEqual({ x: 0, y: 0 });
      mouse('pointermove', 300, 400);
      expect(read().x).toBe(0.5);
    }
  });

  it('a key held through a release does not come back on auto-repeat', () => {
    key('keydown', 'Space');
    key('keydown', 'KeyD');
    input.release();
    for (let i = 0; i < 5; i++) {
      key('keydown', 'Space', { repeat: true });
      key('keydown', 'KeyD', { repeat: true });
    }
    expect(input.burnHeld()).toBe(false);
    expect(read()).toEqual({ x: 0, y: 0 });
    // lifted and pressed again, it counts, and so do its repeats
    key('keyup', 'Space');
    key('keydown', 'Space');
    key('keydown', 'Space', { repeat: true });
    expect(input.burnHeld()).toBe(true);
    // so does a fresh press whose key-up was never seen (lifted while the window was blurred)
    key('keydown', 'KeyD');
    expect(read().x).toBe(KEY_STEER);
  });

  it('a key held across a blur or a hidden page does not come back on auto-repeat', () => {
    const hide = () => {
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
      hidden.mockRestore();
    };
    for (const leave of [() => window.dispatchEvent(new Event('blur')), hide]) {
      key('keydown', 'Space');
      key('keydown', 'KeyD');
      leave();
      // back in the window, the keys still physically down
      for (let i = 0; i < 5; i++) {
        key('keydown', 'Space', { repeat: true });
        key('keydown', 'KeyD', { repeat: true });
      }
      expect(input.burnHeld()).toBe(false);
      expect(read()).toEqual({ x: 0, y: 0 });
      // lifted and pressed again, they count
      key('keyup', 'Space');
      key('keyup', 'KeyD');
      key('keydown', 'Space');
      key('keydown', 'KeyD');
      expect(input.burnHeld()).toBe(true);
      expect(read().x).toBe(KEY_STEER);
      key('keyup', 'Space');
      key('keyup', 'KeyD');
    }
  });

  it('on dispose, and nothing reaches the input afterwards', () => {
    holdEverything();
    input.dispose();
    expect(read()).toEqual({ x: 0, y: 0 });
    expect(input.burnHeld()).toBe(false);
    touchDown(330, 690, 5);
    mouse('pointerdown', 10, 10);
    key('keydown', 'Space');
    key('keydown', 'KeyD');
    expect(input.burnHeld()).toBe(false);
    expect(read()).toEqual({ x: 0, y: 0 });
  });
});

describe('mouse and keys', () => {
  it('the mouse steers by its offset from the centre of the game area, as before', () => {
    mouse('pointermove', 300, 400);
    expect(read()).toEqual({ x: 0.5, y: 0 });
    // below centre noses down
    mouse('pointermove', 200, 600);
    expect(read()).toEqual({ x: 0, y: 0.5 });
    mouse('pointermove', 0, 0);
    expect(read()).toEqual({ x: -1, y: -1 });
  });

  it('the mouse button and Space burn', () => {
    mouse('pointerdown', 200, 400);
    expect(input.burnHeld()).toBe(true);
    mouse('pointerup', 200, 400);
    expect(input.burnHeld()).toBe(false);
    key('keydown', 'Space');
    expect(input.burnHeld()).toBe(true);
    key('keyup', 'Space');
    expect(input.burnHeld()).toBe(false);
  });

  it('only the primary mouse button burns or presses; the browser\'s menu ends a mouse burn', () => {
    let presses = 0;
    input.dispose();
    input = createFlightInput(container, { burnZone, onPress: () => { presses++; return false; } });
    for (const button of [1, 2]) {
      container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button, pointerId: 9, pointerType: 'mouse' }));
      expect(input.burnHeld(), `button ${button}`).toBe(false);
    }
    expect(presses).toBe(0);
    // ctrl-click on a Mac: a primary press, then the menu, and no button-up
    mouse('pointerdown', 200, 400);
    expect(input.burnHeld()).toBe(true);
    container.dispatchEvent(new Event('contextmenu', { bubbles: true }));
    expect(input.burnHeld()).toBe(false);
    // a thumb held still on BURN is a long press: the same event does not drop it
    touchDown(330, 690, 2);
    container.dispatchEvent(new Event('contextmenu', { bubbles: true }));
    expect(input.burnHeld()).toBe(true);
  });

  it('follows the primary button through presses and releases made with another button held', () => {
    const event = (target: EventTarget, type: string, button: number, buttons: number) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, button, buttons, pointerId: 9, pointerType: 'mouse', clientX: 200, clientY: 400 }));
    // left down, middle down, left up, middle up: only the first and the last are down/up events
    event(container, 'pointerdown', 0, 1);
    event(container, 'pointermove', 1, 5);
    expect(input.burnHeld()).toBe(true);
    event(container, 'pointermove', 0, 4);
    expect(input.burnHeld()).toBe(false);
    event(window, 'pointerup', 1, 0);
    expect(input.burnHeld()).toBe(false);

    // middle down, left down, left up, middle up: the left button never gets a down or an up of its own
    event(container, 'pointerdown', 1, 4);
    expect(input.burnHeld()).toBe(false);
    event(container, 'pointermove', 0, 5);
    expect(input.burnHeld()).toBe(true);
    // a plain move while held changes nothing
    event(container, 'pointermove', -1, 5);
    expect(input.burnHeld()).toBe(true);
    event(container, 'pointermove', 0, 4);
    expect(input.burnHeld()).toBe(false);
    event(window, 'pointerup', 1, 0);
    expect(input.burnHeld()).toBe(false);
  });

  it('ends a mouse burn whose button-up was lost, wherever the menu opened or the mouse next moves', () => {
    // a menu opened over the site header, or from the keyboard: the event is not on the game
    mouse('pointerdown', 200, 400);
    window.dispatchEvent(new Event('contextmenu'));
    expect(input.burnHeld()).toBe(false);
    // no menu event at all: the next mouse move anywhere reports the button up
    mouse('pointerdown', 200, 400);
    document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, button: -1, buttons: 0, pointerId: 9, pointerType: 'mouse' }));
    expect(input.burnHeld()).toBe(false);
    // a thumb's moves say nothing about a mouse button
    mouse('pointerdown', 200, 400);
    touchDown(100, 600, 1);
    touchMove(120, 600, 1);
    expect(input.burnHeld()).toBe(true);
  });

  it('WASD and the arrows steer at the key deflection', () => {
    key('keydown', 'KeyD');
    key('keydown', 'ArrowUp');
    expect(read()).toEqual({ x: KEY_STEER, y: -KEY_STEER });
    key('keyup', 'KeyD');
    key('keyup', 'ArrowUp');
    key('keydown', 'ArrowLeft');
    key('keydown', 'KeyS');
    expect(read()).toEqual({ x: -KEY_STEER, y: KEY_STEER });
  });

  it('a mouse left lying off-centre does not steer for a keyboard player', () => {
    mouse('pointermove', 400, 400);
    expect(read().x).toBe(1);
    key('keydown', 'KeyA');
    expect(read()).toEqual({ x: -KEY_STEER, y: 0 });
    // the key is released: the stick stays with the keys, centred
    key('keyup', 'KeyA');
    expect(read()).toEqual({ x: 0, y: 0 });
    // until the mouse moves again
    mouse('pointermove', 390, 400);
    expect(read().x).toBeCloseTo(0.95, 9);
  });

  it('a mouse that moves while a key is held does not take the stick back until after the key', () => {
    key('keydown', 'KeyW');
    mouse('pointermove', 400, 400);
    expect(read()).toEqual({ x: 0, y: -KEY_STEER });
    key('keyup', 'KeyW');
    expect(read()).toEqual({ x: 0, y: 0 });
  });

  it('the stick goes to whichever of mouse and thumb acted last', () => {
    mouse('pointermove', 400, 400);
    expect(read().x).toBe(1);
    touchDown(100, 600);
    expect(read()).toEqual({ x: 0, y: 0 });
    touchUp();
    // with no thumb down a phone flies straight, not toward the last mouse position
    expect(read()).toEqual({ x: 0, y: 0 });
    mouse('pointermove', 300, 400);
    expect(read().x).toBe(0.5);
  });
});

describe('presses', () => {
  let presses: number;
  let spend: boolean;
  let escapes: number;
  beforeEach(() => {
    input.dispose();
    presses = 0;
    escapes = 0;
    spend = false;
    input = createFlightInput(container, {
      burnZone,
      onPress: () => { presses++; return spend; },
      onEscape: () => { escapes++; },
    });
  });

  it('a click, a tap and a key are each one press', () => {
    mouse('pointerdown', 10, 10);
    touchDown(100, 600);
    key('keydown', 'Enter');
    expect(presses).toBe(3);
  });

  it('a press spent on starting a run is not also a burn', () => {
    spend = true;
    mouse('pointerdown', 10, 10);
    expect(input.burnHeld()).toBe(false);
    mouse('pointerup', 10, 10);
    touchDown(330, 690, 2);
    expect(input.burnHeld()).toBe(false);
    spend = false;
    touchUp(2);
    touchDown(330, 690, 3);
    expect(input.burnHeld()).toBe(true);
  });

  it('a tap that starts a run does not take the stick, even where the BURN zone is about to appear', () => {
    // as on the title screen: the zone is not shown, and starting releases everything
    burnZone.getBoundingClientRect = () => rect(0, 0, 0, 0);
    input.dispose();
    let started = false;
    input = createFlightInput(container, {
      burnZone,
      onPress: () => {
        if (started) return false;
        started = true;
        input.release();
        return true;
      },
    });
    // the right thumb starts the run and stays down, where BURN now appears
    touchDown(330, 690, 1);
    burnZone.getBoundingClientRect = () => rect(284, 640, 96, 96);
    touchMove(300, 600, 1);
    expect(read()).toEqual({ x: 0, y: 0 });
    expect(input.burnHeld()).toBe(false);
    // the left thumb gets the stick
    touchDown(80, 600, 2);
    touchMove(80 + 56, 600, 2);
    expect(read()).toEqual({ x: 1, y: 0 });
    // lifting the first thumb changes nothing; put down again on the zone, it burns
    touchUp(1);
    expect(read()).toEqual({ x: 1, y: 0 });
    touchDown(330, 690, 3);
    expect(input.burnHeld()).toBe(true);
    expect(read()).toEqual({ x: 1, y: 0 });
  });

  it('held keys, modifiers and browser shortcuts are not presses', () => {
    key('keydown', 'Space', { repeat: true });
    key('keydown', 'ShiftLeft');
    key('keydown', 'Tab');
    key('keydown', 'F5');
    key('keydown', 'KeyR', { ctrlKey: true });
    key('keydown', 'KeyL', { metaKey: true });
    expect(presses).toBe(0);
    key('keydown', 'KeyF');
    expect(presses).toBe(1);
  });

  it('a key pressed on a link or a button belongs to that control', () => {
    const link = document.createElement('a');
    link.href = '/blog';
    document.body.appendChild(link);
    link.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    expect(presses).toBe(0);
  });

  it('Escape is its own thing, not a press', () => {
    key('keydown', 'Escape');
    expect(escapes).toBe(1);
    expect(presses).toBe(0);
  });
});

describe('feel', () => {
  /** Steps `seconds` of 60 Hz frames and returns every steer the ship got. */
  const frames = (seconds: number) => {
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      input.readSteer(steer, 1 / 60);
      out.push({ x: steer.x + 0, y: steer.y + 0 });
    }
    return out;
  };
  const most = (list: Array<{ x: number; y: number }>, axis: 'x' | 'y') =>
    Math.max(...list.map((s) => Math.abs(s[axis])));

  it('a 100 ms tap is a nudge: about a quarter of the key\'s full turn, then back to straight', () => {
    expect(KEY_RAMP_SECONDS).toBe(0.4);
    key('keydown', 'KeyD');
    const held = frames(0.1);
    key('keyup', 'KeyD');
    const after = frames(0.5);
    const peak = most([...held, ...after], 'x');
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(0.22);
    expect(after.at(-1)).toEqual({ x: 0, y: 0 });
  });

  it('a 300 ms hold is a turn: three quarters of the way; full after 400 ms', () => {
    key('keydown', 'ArrowLeft');
    const held = frames(0.3);
    expect(held.at(-1)!.x).toBeLessThan(-0.45);
    expect(held.at(-1)!.x).toBeGreaterThan(-0.6);
    frames(0.2);
    expect(steer.x).toBeCloseTo(-KEY_STEER, 9);
  });

  it('pitch keys ramp the same way', () => {
    key('keydown', 'KeyW');
    expect(frames(0.1).at(-1)!.y).toBeGreaterThan(-0.22);
    expect(frames(0.4).at(-1)!.y).toBeCloseTo(-KEY_STEER, 9);
  });

  it('a key reversed mid-turn starts its ramp again on the other side', () => {
    key('keydown', 'KeyD');
    frames(0.5);
    key('keyup', 'KeyD');
    key('keydown', 'KeyA');
    const turn = frames(0.1);
    // from full right to a little left, never more than the slew allows per frame
    expect(turn.at(-1)!.x).toBeGreaterThan(-0.22);
    expect(turn.at(-1)!.x).toBeLessThan(0.3);
  });

  it('nothing reaches the ship faster than the slew limit, whoever steers', () => {
    const step = STEER_SLEW / 60 + 1e-9;
    const jumps = (list: Array<{ x: number; y: number }>) =>
      list.slice(1).every((s, i) => Math.abs(s.x - list[i].x) <= step && Math.abs(s.y - list[i].y) <= step);
    // a mouse flicked from one edge to the other
    mouse('pointermove', 400, 0);
    const flick = frames(0.3);
    mouse('pointermove', 0, 800);
    flick.push(...frames(0.5));
    expect(jumps(flick)).toBe(true);
    expect(flick.at(-1)).toEqual({ x: -1, y: 1 });
    // a handover from the mouse, full right, to a key pushing left
    mouse('pointermove', 400, 400);
    const handover = frames(0.4);
    key('keydown', 'KeyA');
    handover.push(...frames(0.6));
    expect(jumps(handover)).toBe(true);
    expect(handover.at(-1)!.x).toBeCloseTo(-KEY_STEER, 9);
    // and back to the mouse, which is still full right
    key('keyup', 'KeyA');
    mouse('pointermove', 399, 400);
    const back = frames(0.6);
    expect(jumps(back)).toBe(true);
    // a thumb taking the stick
    touchDown(100, 600);
    touchMove(156, 544);
    const thumb = frames(0.6);
    expect(jumps([...back.slice(-1), ...thumb])).toBe(true);
  });

  it('a long frame cannot jump either: the step is capped at 100 ms', () => {
    mouse('pointermove', 400, 400);
    input.readSteer(steer, 5);
    expect(steer.x).toBeCloseTo(STEER_SLEW * 0.1, 9);
  });
});

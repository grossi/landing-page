// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from '../../public/arcade/vendor/three.module.min.js';
import { createShipBody } from '../../public/arcade/shared/ship.js';
import { CONTROL } from '../../public/arcade/tunnel/controls.js';
import { AHEAD, BEST_KEY, TUNE } from '../../public/arcade/tunnel/game.js';
import { mount } from '../../public/arcade/tunnel/main.js';
import { SHIP, TUNNEL, depthSpec, gapAngle, mulberry32, wrap } from '../../public/arcade/tunnel/world.js';

// happy-dom replaces the global URL; file paths need node's.
const read = (path: string) => readFileSync(new NodeURL(`../../public/arcade/${path}`, import.meta.url), 'utf8');
const send = (target: EventTarget, type: string, fields = {}) =>
  target.dispatchEvent(Object.assign(new Event(type), fields));
const touch = (type: string, id: number, x: number, y = 600) =>
  send(window, type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y });
/** The mouse at an angle round the screen centre, as the tunnel is drawn, `far` pixels out. */
const mouse = (angle: number, far = 300, type = 'pointermove') => send(window, type, {
  pointerType: 'mouse', pointerId: 1,
  clientX: innerWidth / 2 + Math.cos(angle) * far, clientY: innerHeight / 2 - Math.sin(angle) * far,
});
const hidden = (id: string) => document.getElementById(id)!.classList.contains('hidden');
const text = (id: string) => document.getElementById(id)!.textContent;

class Renderer {
  domElement = document.createElement('canvas');
  disposed = false; frames = 0; size = [0, 0];
  setPixelRatio() {}
  setSize(width: number, height: number) { this.size = [width, height]; }
  render() { this.frames++; }
  dispose() { this.disposed = true; }
}

let page: ReturnType<typeof mount> | undefined;
/** The shipped page: its real HUD markup and wiring, with only the GPU replaced. */
function open(best?: number) {
  document.body.innerHTML = read('tunnel/index.html').match(/<div class="hud">[\s\S]*?(?=<script)/)![0];
  const values = new Map<string, string>();
  if (best) values.set(BEST_KEY, String(best));
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  page = mount({ THREE: { ...THREE, WebGLRenderer: Renderer }, createShipBody, storage, random: mulberry32(3) });
  return { ...page, values };
}
const DT = 1 / 120;
const ticks = (seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) page!.tick(dt);
};
type Game = ReturnType<typeof mount>['game'];
const nextRing = (game: Game) => game.rings.find(ring => ring.state === AHEAD)!;
/** Put the ship `offset` from the centre of the next ring's gap and let the page fly it through. */
function cross(game: Game, offset = 0) {
  const ring = nextRing(game);
  game.angle = gapAngle(ring, ring.section.gaps[0], ring.at) + offset; game.spin = 0;
  while (ring.state === AHEAD && game.state === 'play') page!.tick(1 / 60);
  return ring;
}
/** A run with the tunnel pushed out of the way: nothing but the ship and the hand. */
function calm() {
  const opened = open();
  send(window, 'keydown', { code: 'Enter' });
  send(window, 'keyup', { code: 'Enter' });
  for (const ring of opened.game.rings) ring.d += 1e6;
  opened.game.angle = 0; opened.game.spin = 0;
  return opened;
}
afterEach(() => { page?.dispose(); page = undefined; });

describe('HYPERTUNNEL page', () => {
  it('shows the three rules over a tunnel that is already moving, then starts on a key', () => {
    const { game, renderer } = open(4200);
    const rules = document.querySelector('#menu .sub')!.innerHTML.split('<br>');
    expect(rules).toEqual(['SLIP THROUGH THE GAPS', 'DEAD CENTRE = PERFECT, PERFECTS CHAIN', 'FIVE PERFECTS CHARGE A SHIELD']);
    ticks(0.5);
    expect(game.state).toBe('menu');
    expect(game.dist).toBeGreaterThan(15);
    expect((renderer as any).frames).toBe(30);
    expect([hidden('menu'), hidden('flight'), hidden('over')]).toEqual([false, true, true]);
    expect(text('best')).toBe('BEST 4200');
    expect(document.body.contains((renderer as any).domElement)).toBe(true);

    send(window, 'keydown', { code: 'Space' });
    send(window, 'keyup', { code: 'Space' });
    ticks(0.5);
    expect(game.state).toBe('play');
    expect([hidden('menu'), hidden('flight'), hidden('over')]).toEqual([true, false, true]);
    expect(text('score')).toBe('SCORE 0');
    expect(text('depth')).toBe('DEPTH 1 · SPIRAL');
    expect(text('shield')).toBe('SHIELD □□□□□');
    // The first ring is on its way: under 2.5 s from the press.
    expect((nextRing(game).d - game.dist) / game.speed).toBeLessThan(2.5 - 0.5);
    // Autorepeat while the key is held is not another press.
    send(window, 'keydown', { code: 'Space', repeat: true });
    expect(game.state).toBe('play');
  });

  it('starts on a click or a tap as well', () => {
    for (const start of [() => mouse(0, 5, 'pointerdown'), () => touch('pointerdown', 4, 200)]) {
      const { game } = open();
      ticks(0.2);
      start();
      expect(game.state).toBe('play');
      page!.dispose(); page = undefined;
    }
  });

  it('shows the result, keeps the best, locks, and retries', () => {
    const { game, values } = open(100);
    send(window, 'keydown', { code: 'Enter' });
    send(window, 'keyup', { code: 'Enter' });
    for (let i = 0; i < 6; i++) cross(game);
    cross(game, Math.PI); // the shield takes it
    expect(game.state).toBe('play');
    cross(game, Math.PI);
    expect(game.state).toBe('over');
    page!.tick(1 / 60);
    const score = 20 + 30 + 40 + 50 + 60 + 70;
    expect([hidden('menu'), hidden('flight'), hidden('over'), hidden('record')]).toEqual([true, false, false, false]);
    expect(text('cause')).toBe('WRECKED');
    expect(text('result')).toBe('SCORE ' + score);
    expect(text('score')).toBe('SCORE ' + score);
    expect(text('facts')).toBe('DEPTH 1 · BEST CHAIN 6');
    expect(text('best')).toBe('BEST ' + score);
    expect(values.get(BEST_KEY)).toBe(String(score));
    expect(document.getElementById('flash')!.classList.contains('hit')).toBe(true);

    send(window, 'pointerdown', { pointerType: 'mouse' }); // inside the lock
    ticks(TUNE.LOCK / 2);
    expect(game.state).toBe('over');
    ticks(TUNE.LOCK);
    let announced = 0;
    const depth = document.getElementById('depth')!;
    const add = depth.classList.add.bind(depth.classList);
    depth.classList.add = (...names: string[]) => { if (names.includes('announce')) announced++; add(...names); };
    send(window, 'pointerdown', { pointerType: 'mouse' });
    ticks(1 / 60);
    expect(game.state).toBe('play');
    // A click that carries no position points nowhere: it starts the run and steers nothing.
    expect(Number.isFinite(game.angle)).toBe(true);
    expect([hidden('over'), hidden('flight')]).toEqual([true, false]);
    expect(text('score')).toBe('SCORE 0');
    expect(text('chain')).toBe('');
    expect(document.getElementById('flash')!.classList.contains('hit')).toBe(false);
    expect(announced).toBe(1); // the retry names its first section again, though the name is the same

    // A lower score does not claim a record.
    cross(game); cross(game, Math.PI);
    page!.tick(1 / 60);
    expect([game.state, game.best, hidden('record'), text('result')]).toEqual(['over', score, true, 'SCORE 20']);
  });

  it('reports the chain, the payout, the shield and each new section on the HUD', () => {
    const { game } = open();
    send(window, 'keydown', { code: 'Enter' });
    send(window, 'keyup', { code: 'Enter' });
    cross(game);
    page!.tick(1 / 60);
    expect(text('chain')).toBe('PERFECT ×1  +20');
    expect(text('shield')).toBe('SHIELD ■□□□□');
    ticks(1.2);
    expect(text('chain')).toBe('PERFECT ×1');
    // Off centre: paid, but no chain.
    cross(game, nextRing(game).section.gaps[0].perfect + 0.05);
    page!.tick(1 / 60);
    expect(text('chain')).toBe('+10');
    expect(text('shield')).toBe('SHIELD □□□□□');
    ticks(1.2);
    expect(text('chain')).toBe('');
    for (let i = 0; i < 5; i++) cross(game);
    page!.tick(1 / 60);
    expect(text('chain')).toBe('PERFECT ×5  +60');
    expect(text('shield')).toBe('SHIELD READY');
    expect(text('note')).toBe('SHIELD CHARGED');
    ticks(1.2);
    expect(text('note')).toBe('');
    cross(game, Math.PI);
    page!.tick(1 / 60);
    expect(text('note')).toBe('SHIELD LOST');
    expect(text('shield')).toBe('SHIELD □□□□□');
    expect(document.getElementById('flash')!.classList.contains('soft')).toBe(true);
    expect(document.getElementById('flash')!.classList.contains('hit')).toBe(false);
    ticks(0.5);
    expect(document.getElementById('flash')!.classList.contains('soft')).toBe(false);

    cross(game); cross(game);
    page!.tick(1 / 60);
    expect(game.depth).toBe(2);
    expect(text('note')).toBe('SECTION CLEAR +100');
    expect(text('depth')).toBe('DEPTH 2 · ZIGZAG');
    expect(document.getElementById('depth')!.classList.contains('announce')).toBe(true);
  });

  it('ends a cleared tunnel without the wreck flash', () => {
    const { game } = open();
    send(window, 'keydown', { code: 'Enter' });
    send(window, 'keyup', { code: 'Enter' });
    while (game.state === 'play') cross(game);
    page!.tick(1 / 60);
    expect(text('cause')).toBe('CLEARED');
    expect(text('facts')).toBe(`DEPTH ${TUNNEL.DEPTHS} · BEST CHAIN ${TUNNEL.DEPTHS * TUNNEL.RINGS}`);
    expect(hidden('record')).toBe(false);
    expect(document.getElementById('flash')!.classList.contains('hit')).toBe(false);
  });

  it('resizes with the window', () => {
    const { view, renderer } = open();
    Object.assign(window, { innerWidth: 390, innerHeight: 844 });
    send(window, 'resize');
    expect((renderer as any).size).toEqual([390, 844]);
    expect(view.camera.aspect).toBeCloseTo(390 / 844);
    expect(view.camera.fov).toBeGreaterThan(55);
    Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
  });

  it('stops drawing while the page is hidden and picks up again when it is shown', async () => {
    const { renderer } = open();
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    await wait(80);
    expect((renderer as any).frames).toBeGreaterThan(0);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    send(document, 'visibilitychange');
    const frames = (renderer as any).frames;
    await wait(80);
    expect((renderer as any).frames).toBe(frames);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    send(document, 'visibilitychange');
    await wait(80);
    expect((renderer as any).frames).toBeGreaterThan(frames);
  });

  it('after dispose: no canvas, no renderer, no listeners, no frames', () => {
    const { game, renderer, view } = open();
    ticks(0.1);
    const frames = (renderer as any).frames;
    page!.dispose();
    expect((renderer as any).disposed).toBe(true);
    expect(document.body.contains((renderer as any).domElement)).toBe(false);
    expect(view.scene.children.length).toBe(0);
    send(window, 'keydown', { code: 'Enter' });
    touch('pointerdown', 1, 10);
    mouse(1);
    expect(game.state).toBe('menu');
    expect(view.follow).toBe(true); // the mouse no longer reaches it
    Object.assign(window, { innerWidth: 500 });
    send(window, 'resize');
    Object.assign(window, { innerWidth: 1024 });
    expect((renderer as any).size).toEqual([1024, 768]);
    return new Promise<void>(resolve => setTimeout(() => {
      expect((renderer as any).frames).toBe(frames);
      page = undefined;
      resolve();
    }, 60));
  });
});

describe('the keys and the thumbs, in numbers', () => {
  /** Hold `down` for `seconds`, lift with `up`, and wait for the ship to settle. Returns how far it turned. */
  function press(down: () => void, up: () => void, seconds: number) {
    const { game } = calm();
    down();
    ticks(seconds, DT);
    up();
    ticks(2, DT);
    expect(game.state).toBe('play');
    expect(game.spin).toBeCloseTo(0, 6);
    return game.angle;
  }
  const key = (code: string, seconds: number) =>
    press(() => send(window, 'keydown', { code }), () => send(window, 'keyup', { code }), seconds);
  const thumb = (x: number, seconds: number) =>
    press(() => touch('pointerdown', 5, x), () => touch('pointerup', 5, x), seconds);
  const widest = depthSpec(1).gap, narrowest = depthSpec(TUNNEL.DEPTHS).gap;

  it('a 100 ms tap is a nudge: 0.05 to 0.11 rad, inside the PERFECT zone of the narrowest gap', () => {
    const right = key('ArrowRight', 0.1);
    expect(right).toBeGreaterThan(0.05);
    expect(right).toBeLessThan(0.11);
    expect(right).toBeLessThan(narrowest / 6);
    expect(key('KeyD', 0.1)).toBeCloseTo(right, 9);
    expect(key('ArrowLeft', 0.1)).toBeCloseTo(-right, 9);
    expect(key('KeyA', 0.1)).toBeCloseTo(-right, 9);
  });

  it('a 300 ms hold is a short turn: 0.35 to 0.6 rad, short of the edge of the widest gap', () => {
    const right = key('ArrowRight', 0.3);
    expect(right).toBeGreaterThan(0.35);
    expect(right).toBeLessThan(0.6);
    expect(right).toBeLessThan(widest / 2);
    expect(key('KeyA', 0.3)).toBeCloseTo(-right, 9);
  });

  it('crossing one gap width takes 0.55 to 0.85 s of holding, and letting go carries under 0.3 rad', () => {
    const { game } = calm();
    send(window, 'keydown', { code: 'KeyD' });
    let seconds = 0;
    while (game.angle < widest && seconds < 3) { page!.tick(DT); seconds += DT; }
    send(window, 'keyup', { code: 'KeyD' });
    ticks(2, DT);
    expect(seconds).toBeGreaterThan(0.55);
    expect(seconds).toBeLessThan(0.85);
    expect(game.angle - widest).toBeLessThan(0.3);
  });

  it('a held key builds to the full turn rate and no further', () => {
    const { game } = calm();
    send(window, 'keydown', { code: 'ArrowRight' });
    page!.tick(DT);
    // The first frame is the first nudge, not a full stick.
    expect(game.spin).toBeLessThan(SHIP.TURN * 0.03);
    let top = 0;
    for (let t = 0; t < 1.5; t += DT) { page!.tick(DT); top = Math.max(top, game.spin); }
    expect(top).toBeGreaterThan(SHIP.TURN * 0.97);
    expect(top).toBeLessThanOrEqual(SHIP.TURN);
  });

  it('a thumb held on a side of the screen is the same stick as a key', () => {
    for (const seconds of [0.1, 0.3]) {
      const right = key('ArrowRight', seconds);
      expect(thumb(innerWidth * 0.8, seconds)).toBeCloseTo(right, 9);
      expect(thumb(innerWidth * 0.2, seconds)).toBeCloseTo(-right, 9);
    }
  });

  it('gives the stick to the thumb that came down last, and back when it lifts', () => {
    const { game } = calm();
    touch('pointerdown', 1, innerWidth * 0.2);
    ticks(0.6, DT);
    expect(game.spin).toBeLessThan(-SHIP.TURN * 0.9);
    touch('pointerdown', 2, innerWidth * 0.8);
    page!.tick(DT);
    ticks(0.6, DT);
    expect(game.spin).toBeGreaterThan(SHIP.TURN * 0.9);
    touch('pointerup', 2, innerWidth * 0.8);
    ticks(0.6, DT);
    expect(game.spin).toBeLessThan(-SHIP.TURN * 0.9);
    // A thumb that slides across the middle changes side.
    touch('pointermove', 1, innerWidth * 0.7);
    ticks(0.6, DT);
    expect(game.spin).toBeGreaterThan(SHIP.TURN * 0.9);
    touch('pointerup', 1, innerWidth * 0.7);
    ticks(1, DT);
    expect(game.spin).toBeCloseTo(0, 6);
    // A touch never counts as the mouse: the camera keeps following the ship.
    expect(page!.view.follow).toBe(true);
  });

  it('a reversal starts over from the first nudge', () => {
    const { game } = calm();
    send(window, 'keydown', { code: 'ArrowRight' });
    ticks(1, DT);
    send(window, 'keyup', { code: 'ArrowRight' });
    send(window, 'keydown', { code: 'ArrowLeft' });
    const before = game.angle;
    ticks(0.1, DT);
    // Still carried the old way for a moment; nowhere near a full stick the other way.
    expect(game.spin).toBeGreaterThan(-SHIP.TURN * 0.35);
    ticks(1, DT);
    expect(game.spin).toBeLessThan(-SHIP.TURN * 0.97);
    expect(game.angle).toBeLessThan(before);
  });
});

describe('the mouse', () => {
  it('leads the ship to the angle it points at, at no more than the ship\'s turn rate, on a level camera', () => {
    const { game, view } = calm();
    expect(view.follow).toBe(true);
    mouse(1.2);
    let top = 0, peak = -Infinity;
    for (let t = 0; t < 2; t += DT) { page!.tick(DT); top = Math.max(top, game.spin); peak = Math.max(peak, game.angle); }
    expect(view.follow).toBe(false);
    expect(game.angle).toBeCloseTo(1.2, 3);
    expect(peak).toBeLessThanOrEqual(1.2 + 1e-9); // no overshoot
    expect(top).toBeLessThanOrEqual(SHIP.TURN);
    expect(top).toBeGreaterThan(SHIP.TURN * 0.8);
    // The short way round.
    mouse(-3);
    ticks(2, DT);
    expect(wrap(game.angle - -3)).toBeCloseTo(0, 3);
    mouse(3);
    page!.tick(DT); page!.tick(DT);
    expect(game.spin).toBeLessThan(0);
  });

  it('points nowhere from the very middle of the screen: the last aim stands', () => {
    const shorter = Math.min(innerWidth, innerHeight);
    const { game } = calm();
    mouse(1, shorter * CONTROL.DEAD * 0.5);
    ticks(0.5, DT);
    expect(game.angle).toBe(0);
    mouse(1, shorter * CONTROL.DEAD * 1.1);
    ticks(0.3, DT);
    expect(game.spin).toBeGreaterThan(SHIP.TURN * 0.5);
    mouse(2, shorter * CONTROL.DEAD * 0.5);
    ticks(2, DT);
    expect(game.angle).toBeCloseTo(1, 3);
  });

  it('never takes the ship from the keys by lying off-centre or by being bumped', () => {
    const { game, view } = calm();
    mouse(2);
    ticks(1.5, DT);
    expect(game.angle).toBeGreaterThan(1.9);
    send(window, 'keydown', { code: 'KeyA' });
    ticks(0.5, DT);
    send(window, 'keyup', { code: 'KeyA' });
    expect(view.follow).toBe(true);
    ticks(3, DT);
    const left = game.angle;
    expect(left).toBeLessThan(1.5);
    // Keys released: the ship stays put, however long the mouse lies there.
    ticks(5, DT);
    expect(game.angle).toBe(left);
    // A bump of a few pixels is not a turn.
    send(window, 'pointermove', {
      pointerType: 'mouse', clientX: innerWidth / 2 + Math.cos(2) * 300 + CONTROL.WAKE - 4, clientY: innerHeight / 2 - Math.sin(2) * 300,
    });
    ticks(1, DT);
    expect(game.angle).toBe(left);
    expect(view.follow).toBe(true);
    // A real move takes the stick back.
    mouse(2.6);
    ticks(2, DT);
    expect(view.follow).toBe(false);
    expect(game.angle).toBeCloseTo(2.6, 3);
  });

  it('does not take the stick from a key that is still held, and needs a new move once it is let go', () => {
    // Holding a key is acting, for as long as it is held: a hand that brushes
    // the mouse in the middle of a turn must not send the ship after the pointer.
    const { game, view } = calm();
    send(window, 'keydown', { code: 'ArrowRight' });
    ticks(0.5, DT);
    mouse(-2, 300);
    ticks(0.5, DT);
    expect(view.follow).toBe(true);
    expect(game.spin).toBeGreaterThan(SHIP.TURN * 0.97); // still turning right, flat out
    send(window, 'keyup', { code: 'ArrowRight' });
    ticks(3, DT);
    const stopped = game.angle;
    expect(game.spin).toBeCloseTo(0, 6);
    ticks(2, DT);
    expect(game.angle).toBe(stopped);
    // The next real move of the mouse has the stick.
    mouse(-2, 340);
    ticks(3, DT);
    expect(view.follow).toBe(false);
    expect(wrap(game.angle + 2)).toBeCloseTo(0, 3);
  });

  it('comes back to the stick pointing nowhere until it points somewhere new', () => {
    const { game, view } = calm();
    mouse(2);
    ticks(1.5, DT);
    send(window, 'keydown', { code: 'KeyA' });
    ticks(0.5, DT);
    send(window, 'keyup', { code: 'KeyA' });
    ticks(3, DT);
    const left = game.angle;
    // The mouse travels to the middle of the screen: it has the stick again,
    // but the old aim is not what it points at now.
    mouse(2, 5);
    ticks(2, DT);
    expect(view.follow).toBe(false);
    expect(game.angle).toBe(left);
    mouse(-1);
    ticks(2, DT);
    expect(game.angle).toBeCloseTo(-1, 3);
  });

  it('steers the ship behind the title too, where nothing is at stake', () => {
    const { game } = open();
    ticks(0.5);
    mouse(0.4);
    ticks(3);
    expect(game.state).toBe('menu');
    expect(wrap(game.angle - 0.4)).toBeCloseTo(0, 2);
    // The run starts where the ship is, so its first gap is under the pointer.
    mouse(0.4, 300, 'pointerdown');
    expect(game.state).toBe('play');
    expect(wrap(nextRing(game).cross - 0.4)).toBeCloseTo(0, 2);
    ticks(2.3);
    expect(game).toMatchObject({ state: 'play', chain: 1 });
  });
});

describe('starting with the mouse', () => {
  it.each(['title', 'retry'])('from the %s, with the pointer far from the ship: the first gap is where the pointer is', from => {
    const { game } = open();
    ticks(0.3);
    if (from === 'retry') {
      send(window, 'keydown', { code: 'Enter' });
      send(window, 'keyup', { code: 'Enter' });
      cross(game, Math.PI);
      ticks(TUNE.LOCK + 0.1);
      expect(game.state).toBe('over');
    }
    // The pointer comes from nowhere to the far side of the tunnel and clicks at once.
    const aim = game.angle + 2.8;
    mouse(aim);
    mouse(aim, 300, 'pointerdown');
    expect(game.state).toBe('play');
    expect(wrap(nextRing(game).cross - aim)).toBeCloseTo(0, 9);
    // Nothing more from the hand: the ship arrives and takes the first ring dead centre.
    ticks(2.3);
    expect(game).toMatchObject({ state: 'play', chain: 1, score: 20 });
  });

  it('with keys or a thumb the first gap is where the ship is, wherever the mouse lies', () => {
    const starts = [
      () => send(window, 'keydown', { code: 'ArrowLeft' }),
      () => touch('pointerdown', 3, 100),
    ];
    for (const start of starts) {
      const { game } = open();
      // The mouse has the ship on its way round the tunnel when the run is started by hand.
      mouse(game.angle + 2.5);
      ticks(0.3);
      const angle = game.angle;
      expect(Math.abs(wrap(angle + 2.5 - game.angle))).toBeGreaterThan(1);
      start();
      expect(game.state).toBe('play');
      expect(nextRing(game).cross).toBe(angle);
      page!.dispose(); page = undefined;
    }
    // Any other key leaves the stick with the mouse, so the gap stands at the pointer.
    const { game } = open();
    const aim = game.angle + 2.5;
    mouse(aim);
    ticks(0.3);
    send(window, 'keydown', { code: 'Space' });
    expect(wrap(nextRing(game).cross - aim)).toBeCloseTo(0, 9);
  });
});

describe('letting go', () => {
  it.each(['pointercancel', 'touchcancel', 'blur', 'pagehide', 'hidden'])('drops the keys, the thumbs and the aim on %s', how => {
    for (const hold of ['key', 'thumb', 'mouse']) {
      const { game, input } = calm();
      if (hold === 'key') send(window, 'keydown', { code: 'ArrowRight' });
      if (hold === 'thumb') touch('pointerdown', 1, innerWidth * 0.9);
      if (hold === 'mouse') mouse(2.5);
      ticks(0.5, DT);
      expect(game.spin).toBeGreaterThan(SHIP.TURN * 0.8);

      if (how === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        send(document, 'visibilitychange');
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      } else send(window, how);
      // No keyup ever reaches a page that was hidden or put in the back/forward
      // cache with the key down: the key is let go here and now.
      expect(input.keys.ArrowRight ?? false).toBe(false);
      if (how === 'pagehide') send(window, 'pageshow');
      // The very next frame steers nothing (a hidden tab resumes here, however
      // long it was away): the ship only runs out the turn it had.
      game.spin = 0;
      const angle = game.angle;
      ticks(1, DT);
      expect(game.angle).toBe(angle);
      // The cancelled thumb is gone: its late move must not steer.
      touch('pointermove', 1, innerWidth * 0.9);
      ticks(0.3, DT);
      expect(game.angle).toBe(angle);
      // A fresh press starts from the first nudge again, not from a full stick.
      send(window, 'keydown', { code: 'ArrowRight' });
      page!.tick(DT);
      expect(game.spin).toBeGreaterThan(0);
      expect(game.spin).toBeLessThan(SHIP.TURN * 0.03);
      send(window, 'keyup', { code: 'ArrowRight' });
      page!.dispose(); page = undefined;
    }
  });
});

describe('MONOSTACK', () => {
  it('/arcade/stack/ redirects to HYPERTUNNEL and keeps the query and hash', () => {
    const html = read('stack/index.html');
    const target = '/arcade/tunnel/index.html';
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${target}">`);
    expect(html).toContain(`<link rel="canonical" href="${target}">`);
    expect(html).toContain(`<a href="${target}">`);
    expect(html).not.toContain('type="module"');
    expect(html).not.toContain('three');
    let replaced = '';
    const location = { search: '?from=old', hash: '#top', replace: (url: string) => { replaced = url; } };
    new Function('location', html.match(/<script>([\s\S]*?)<\/script>/)![1])(location);
    expect(replaced).toBe(target + '?from=old#top');
  });

  it('the redirect target is the game page, loading its modules by absolute path', () => {
    const html = read('tunnel/index.html');
    expect(html).toContain('<title>HYPERTUNNEL</title>');
    expect(html).toMatch(/html, body \{[^}]*touch-action: none/);
    const imports = [...html.matchAll(/from '([^']+)'/g)].map(match => match[1]);
    expect(imports).toEqual(['three', '/arcade/shared/ship.js', '/arcade/tunnel/main.js']);
    for (const path of imports.slice(1)) expect(() => read(path.replace('/arcade/', ''))).not.toThrow();
  });
});

// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from '../../public/arcade/vendor/three.module.min.js';
import { createShipBody } from '../../public/arcade/shared/ship.js';
import { createInput } from '../../public/arcade/shared/runtime.js';
import { mulberry32 } from '../../public/arcade/meridian/world.js';
import { WAKE } from '../../public/arcade/murmur/flock.js';
import { BEST_KEY, TUNE } from '../../public/arcade/murmur/game.js';
import { KEY_RAMP, ZONE, inBoostZone, mount } from '../../public/arcade/murmur/main.js';

// happy-dom replaces the global URL; file paths need node's.
const read = (path: string) => readFileSync(new NodeURL(`../../public/arcade/${path}`, import.meta.url), 'utf8');
const send = (target: EventTarget, type: string, fields = {}) =>
  target.dispatchEvent(Object.assign(new Event(type), fields));
const touch = (type: string, id: number, x: number, y: number) =>
  send(window, type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y });
const mouse = (type: string, x = innerWidth / 2, y = innerHeight / 2) =>
  send(window, type, { pointerType: 'mouse', pointerId: 1, clientX: x, clientY: y });
const element = (id: string) => document.getElementById(id)!;
const hidden = (id: string) => element(id).classList.contains('hidden');
const text = (id: string) => element(id).textContent;
/** A point inside the BOOST square, and one on the steering side of the screen. */
const boostSpot = () => [innerWidth - ZONE.GAP - ZONE.SIZE / 2, innerHeight - ZONE.GAP - ZONE.SIZE / 2] as const;

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
  document.body.innerHTML = read('murmur/index.html').match(/<div class="hud"[\s\S]*?(?=<script)/)![0];
  const values = new Map<string, string>();
  if (best) values.set(BEST_KEY, String(best));
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  page = mount({ THREE: { ...THREE, WebGLRenderer: Renderer }, createShipBody, storage, random: mulberry32(3) });
  return { ...page, values };
}
const ticks = (seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) page!.tick(dt);
};
/** A run in progress with no rocks: one thing at a time. */
function playing(best?: number) {
  const opened = open(best);
  send(window, 'keydown', { code: 'Enter' });
  send(window, 'keyup', { code: 'Enter' });
  opened.game.belt.count = 0;
  return opened;
}
const speed = (game: ReturnType<typeof open>['game']) => Math.hypot(game.ship.vx, game.ship.vy, game.ship.vz);
function giveWake(game: ReturnType<typeof open>['game'], birds: number) {
  game.flock.state.fill(0);
  for (let i = 0; i < birds; i++) {
    game.flock.state[i] = WAKE;
    game.flock.pos.set([game.ship.x, game.ship.y, game.ship.z], i * 3);
  }
  game.flock.wake = birds; game.flock.wild = game.flock.count - birds;
}
function gateAhead(game: ReturnType<typeof open>['game']) {
  const { ship, gate } = game;
  gate.nx = ship.fx; gate.ny = ship.fy; gate.nz = ship.fz;
  gate.x = ship.x + ship.fx * 0.4; gate.y = ship.y + ship.fy * 0.4; gate.z = ship.z + ship.fz * 0.4;
}
afterEach(() => { page?.dispose(); page = undefined; });

describe('MURMUR page', () => {
  it('shows the three rules over a moving world, then starts on a key', () => {
    const html = read('murmur/index.html');
    expect(html).toContain('DIVE THROUGH THE FLOCK TO GATHER IT<br>CARRY IT THROUGH THE GATE TO BANK IT<br>ROCKS WRECK YOU AND SCATTER YOUR WAKE');
    expect(html).toMatch(/html, body \{[^}]*touch-action: none/);

    const { game, renderer } = open(4200);
    const from = { ...game.ship };
    ticks(0.5);
    expect(game.state).toBe('menu');
    expect(Math.hypot(game.ship.x - from.x, game.ship.z - from.z)).toBeGreaterThan(3);
    expect((renderer as any).frames).toBe(30);
    expect([hidden('menu'), hidden('flight'), hidden('over')]).toEqual([false, true, true]);
    expect(text('best')).toBe('BEST 4200');
    expect(document.body.contains((renderer as any).domElement)).toBe(true);

    send(window, 'keydown', { code: 'Space' });
    ticks(0.5);
    expect(game.state).toBe('play');
    expect([hidden('menu'), hidden('flight'), hidden('over')]).toEqual([true, false, true]);
    expect(text('score')).toBe('SCORE 0');
    expect(text('wake')).toMatch(/^WAKE \d+$/);
    expect(text('clock')).toMatch(/^4[45]\.\d$/);
    // Autorepeat while the key is held is not another press.
    send(window, 'keydown', { code: 'Space', repeat: true });
    expect(game.state).toBe('play');
  });

  it('steers with a drag from wherever the thumb lands, and centres when it lifts', () => {
    const { game, input } = open();
    touch('pointerdown', 1, 120, 600); // the tap that starts the run is also the anchor
    game.belt.count = 0;
    expect(game.state).toBe('play');
    expect(input.stick).toEqual({ x: 0, y: 0 });
    const yaw = game.ship.yaw;
    touch('pointermove', 1, 120 + 56, 600);
    expect(input.stick.x).toBe(1);
    ticks(0.5);
    expect(game.ship.turn).toBeGreaterThan(0.8);
    expect(game.ship.yaw).toBeLessThan(yaw - 0.4); // stick right turns right

    touch('pointerup', 1, 176, 600);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    ticks(1);
    expect(Math.abs(game.ship.turn)).toBeLessThan(0.01);

    const pitch = game.ship.pitch;
    touch('pointerdown', 2, 60, 300); // a new thumb position is a new centre
    touch('pointermove', 2, 60, 300 - 56);
    ticks(0.5);
    expect(game.ship.pitch).toBeGreaterThan(pitch + 0.3); // drag up noses up
  });

  it('boosts while the other thumb holds the BOOST zone, without disturbing the stick', () => {
    const { game, input } = open();
    touch('pointerdown', 1, 120, 600);
    game.belt.count = 0;
    touch('pointermove', 1, 120 + 28, 600);
    ticks(1);
    expect(speed(game)).toBeLessThan(TUNE.CRUISE + 2);
    expect(element('hud').classList.contains('touch')).toBe(true);

    const [bx, by] = boostSpot();
    touch('pointerdown', 2, bx, by);
    expect(input.hold).toBe(true);
    expect(input.stick).toEqual({ x: 0.5, y: 0 });
    touch('pointermove', 2, bx - 80, by - 200); // the boost thumb sliding about is not steering
    expect(input.stick).toEqual({ x: 0.5, y: 0 });
    ticks(2);
    expect(game.ship.boost).toBe(true);
    expect(speed(game)).toBeGreaterThan(TUNE.BOOST - 4);
    expect(element('boost').classList.contains('on')).toBe(true);

    // The steering thumb lifts: the boost thumb does not become the stick.
    touch('pointerup', 1, 148, 600);
    touch('pointermove', 2, bx - 150, by);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    expect(input.hold).toBe(true);

    touch('pointerup', 2, bx, by);
    expect(input.hold).toBe(false);
    ticks(2);
    expect(speed(game)).toBeLessThan(TUNE.CRUISE + 2);
    expect(element('boost').classList.contains('on')).toBe(false);
  });

  it('puts the BOOST zone in the bottom right corner, 96 px square, with a little slack', () => {
    const boost = element.bind(null, 'boost');
    open();
    expect([boost().style.width, boost().style.height, boost().style.right, boost().style.bottom]).toEqual(['96px', '96px', '20px', '20px']);
    const [bx, by] = boostSpot();
    expect(inBoostZone(bx, by)).toBe(true);
    expect(inBoostZone(innerWidth - 1, innerHeight - 1)).toBe(true);
    expect(inBoostZone(innerWidth - ZONE.GAP - ZONE.SIZE - ZONE.SLACK - 1, by)).toBe(false);
    expect(inBoostZone(bx, innerHeight - ZONE.GAP - ZONE.SIZE - ZONE.SLACK - 1)).toBe(false);
    expect(inBoostZone(60, innerHeight - 60)).toBe(false); // the left thumb's corner steers
    // A tap on the zone starts a run like any other tap.
    touch('pointerdown', 4, bx, by);
    expect(page!.game.state).toBe('play');
  });

  it('boosts on a held mouse button, W or Space, and lets go with them', () => {
    const { game, input } = playing();
    for (const [press, release] of [
      [() => mouse('pointerdown'), () => mouse('pointerup')],
      [() => send(window, 'keydown', { code: 'KeyW' }), () => send(window, 'keyup', { code: 'KeyW' })],
      [() => send(window, 'keydown', { code: 'Space' }), () => send(window, 'keyup', { code: 'Space' })],
    ]) {
      press();
      ticks(2);
      expect(speed(game)).toBeGreaterThan(TUNE.BOOST - 4);
      release();
      game.clock = TUNE.CLOCK;
      ticks(2);
      expect(speed(game)).toBeLessThan(TUNE.CRUISE + 2);
    }
    expect(input.hold).toBe(false);
  });

  it.each(['pointercancel', 'touchcancel', 'blur', 'hidden'])('lets go of the stick, the keys and the boost on %s', how => {
    const { game, input } = open();
    const [bx, by] = boostSpot();
    touch('pointerdown', 1, 120, 600);
    game.belt.count = 0;
    touch('pointermove', 1, 176, 656);
    touch('pointerdown', 2, bx, by);
    send(window, 'keydown', { code: 'ArrowRight' });
    send(window, 'keydown', { code: 'KeyW' });
    ticks(1.5);
    expect(game.ship.boost).toBe(true);
    expect(game.ship.turn).toBeGreaterThan(0.5);

    if (how === 'hidden') {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      send(document, 'visibilitychange');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    } else send(window, how);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    expect(input.hold).toBe(false);
    expect([input.keys.ArrowRight, input.keys.KeyW]).toEqual([false, false]);
    ticks(2);
    expect(game.ship.boost).toBe(false);
    expect(speed(game)).toBeLessThan(TUNE.CRUISE + 2);
    expect(Math.abs(game.ship.turn)).toBeLessThan(0.01);
    // The cancelled touches are gone: their late moves and lifts change nothing.
    touch('pointermove', 1, 400, 500);
    touch('pointermove', 2, bx, by);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    expect(input.hold).toBe(false);
  });

  it('steers with the mouse, and a mouse left lying off-centre never takes the ship from the keys', () => {
    const { game, input } = playing();
    mouse('pointermove', innerWidth, innerHeight / 2);
    expect(input.stick).toEqual({ x: 1, y: 0 });
    ticks(0.6);
    expect(game.ship.turn).toBeGreaterThan(0.8);

    send(window, 'keydown', { code: 'KeyA' });
    ticks(1);
    expect(game.ship.turn).toBeLessThan(-0.8);
    send(window, 'keyup', { code: 'KeyA' });
    // Keys released: the ship flies straight and stays straight, however long the mouse lies there.
    for (const seconds of [1, 3]) {
      game.clock = TUNE.CLOCK;
      ticks(seconds);
      expect(Math.abs(game.ship.turn)).toBeLessThan(0.01);
    }
    // Moving the mouse takes the stick back.
    mouse('pointermove', innerWidth * 0.9, innerHeight / 2);
    ticks(0.6);
    expect(game.ship.turn).toBeGreaterThan(0.8);
  });

  it('keys are calm: a 100 ms tap is a nudge, a 300 ms hold a small turn, a long hold the full rate', () => {
    const turned = (hold: number) => {
      const { game } = playing();
      const yaw = game.ship.yaw;
      send(window, 'keydown', { code: 'ArrowRight' });
      ticks(hold);
      send(window, 'keyup', { code: 'ArrowRight' });
      ticks(1);
      page!.dispose(); page = undefined;
      return (yaw - game.ship.yaw) * 180 / Math.PI;
    };
    const tap = turned(0.1), short = turned(0.3), long = turned(1.5);
    expect(tap).toBeGreaterThan(0.1);
    expect(tap).toBeLessThan(2); // degrees
    expect(short).toBeGreaterThan(tap * 3);
    expect(short).toBeLessThan(12);
    // Held, it reaches the full turn rate: nothing is lost at the top end.
    expect(long).toBeGreaterThan(90);
    expect(KEY_RAMP).toBeLessThanOrEqual(3);
  });

  it('pitches with the up and down arrows and leaves W to the boost', () => {
    const { game } = playing();
    const pitch = game.ship.pitch;
    send(window, 'keydown', { code: 'ArrowUp' });
    ticks(1);
    expect(game.ship.pitch).toBeGreaterThan(pitch + 0.3);
    expect(game.ship.boost).toBe(false);
    send(window, 'keyup', { code: 'ArrowUp' });
    send(window, 'keydown', { code: 'ArrowDown' });
    ticks(2);
    expect(game.ship.pitch).toBeLessThan(pitch);
    send(window, 'keyup', { code: 'ArrowDown' });
    ticks(3);
    // W and S are not a second way to pitch: W is the boost, and boosting must not move the nose.
    const level = game.ship.pitch;
    send(window, 'keydown', { code: 'KeyW' });
    send(window, 'keydown', { code: 'KeyS' });
    ticks(1);
    expect(game.ship.pitch).toBeCloseTo(level, 5);
    expect(game.ship.boost).toBe(true);
  });

  it('reports the wake, the bank and the clock on the HUD', () => {
    const { game } = playing();
    ticks(0.2);
    giveWake(game, 50);
    ticks(1 / 60);
    expect(text('wake')).toBe('WAKE 50');
    expect(element('banked').classList.contains('announce')).toBe(false);
    gateAhead(game);
    ticks(1 / 30);
    expect(text('score')).toBe('SCORE 75');
    expect(text('wake')).toBe('WAKE 0');
    expect(text('banked')).toBe('BANKED 50 · +75 · +9.0 S');
    expect(element('banked').classList.contains('announce')).toBe(true);

    const clock = element('clock');
    game.clock = 30; ticks(0.2);
    expect(text('clock')).toMatch(/^29\.\d$/);
    expect(clock.classList.contains('low')).toBe(false);
    game.clock = 7.9; ticks(0.2);
    expect(clock.classList.contains('low')).toBe(true);
  });

  it('points a marker at the flock and one at the gate, each with its distance, on screen or on its edge', () => {
    const { game } = playing();
    ticks(0.5);
    const { ship, flock, gate } = game;
    const at = (id: string) => element(id).style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/)!.slice(1).map(Number);
    const far = (target: { x: number, y: number, z: number }) =>
      String(Math.round(Math.hypot(target.x - ship.x, target.y - ship.y, target.z - ship.z)));
    // The run opens facing the flock: its marker is on it, near the middle of the screen.
    expect(element('flockMark').classList.contains('edge')).toBe(false);
    expect(Math.abs(at('flockMark')[0] - innerWidth / 2)).toBeLessThan(120);
    expect(text('flockFar')).toBe(far(flock.centre));
    expect(text('gateFar')).toBe(far(gate));

    // Put the gate behind and to the right: its marker goes to the right edge, not the left.
    const flat = Math.hypot(ship.fx, ship.fz);
    gate.x = ship.x + (-ship.fz / flat) * 60 - ship.fx * 120; gate.y = ship.y; gate.z = ship.z + (ship.fx / flat) * 60 - ship.fz * 120;
    ticks(1 / 60);
    expect(element('gateMark').classList.contains('edge')).toBe(true);
    expect(at('gateMark')[0]).toBeGreaterThan(innerWidth - 60);
    gate.x = ship.x - (-ship.fz / flat) * 60 - ship.fx * 120; gate.z = ship.z - (ship.fx / flat) * 60 - ship.fz * 120;
    ticks(1 / 60);
    expect(at('gateMark')[0]).toBeLessThan(60);
    for (const id of ['flockMark', 'gateMark']) {
      const [x, y] = at(id);
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(innerWidth);
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(innerHeight);
    }
  });

  it('shows the result, keeps the best, locks, and retries', () => {
    const { game, values } = playing(100);
    ticks(0.5);
    giveWake(game, 100);
    gateAhead(game);
    ticks(1 / 30);
    giveWake(game, 30);
    game.clock = 0.01;
    ticks(1 / 30);
    expect(game.state).toBe('over');
    expect([hidden('menu'), hidden('flight'), hidden('over'), hidden('record')]).toEqual([true, false, false, false]);
    expect(text('cause')).toBe('OUT OF TIME');
    expect(text('result')).toBe('SCORE 200');
    expect(text('score')).toBe('SCORE 200');
    expect(text('wake')).toBe('WAKE 0'); // the unbanked wake is lost
    expect(text('facts')).toBe('HAULS 1 · BIGGEST 100');
    expect(text('best')).toBe('BEST 200');
    expect(text('clock')).toBe('0.0');
    expect(values.get(BEST_KEY)).toBe('200');
    expect(element('flight').classList.contains('ended')).toBe(true);
    expect(element('flash').classList.contains('hit')).toBe(false); // nothing was hit

    mouse('pointerdown'); // inside the lock
    ticks(TUNE.LOCK / 2);
    expect(game.state).toBe('over');
    ticks(TUNE.LOCK);
    mouse('pointerdown');
    mouse('pointerup');
    game.belt.count = 0;
    ticks(1 / 60);
    expect(game.state).toBe('play');
    expect([hidden('over'), hidden('flight')]).toEqual([true, false]);
    expect(text('score')).toBe('SCORE 0');
    expect(text('clock')).toBe(TUNE.CLOCK.toFixed(1));
    expect(element('banked').classList.contains('announce')).toBe(false);
    expect(element('flight').classList.contains('ended')).toBe(false);

    // A lower score does not claim a record; a wreck flashes.
    game.belt.count = 1;
    game.belt.x[0] = game.ship.x + game.ship.fx * 3; game.belt.y[0] = game.ship.y + game.ship.fy * 3; game.belt.z[0] = game.ship.z + game.ship.fz * 3;
    game.belt.r[0] = 4; game.belt.line[0] = game.gate.id;
    ticks(0.2);
    expect([game.state, game.best, hidden('record'), text('cause')]).toEqual(['over', 200, true, 'WRECKED']);
    expect(element('flash').classList.contains('hit')).toBe(true);
  });

  it('resizes with the window', () => {
    const { view, renderer } = open();
    Object.assign(window, { innerWidth: 390, innerHeight: 844 });
    send(window, 'resize');
    expect((renderer as any).size).toEqual([390, 844]);
    expect(view.camera.aspect).toBeCloseTo(390 / 844);
    expect(inBoostZone(390 - 60, 844 - 60)).toBe(true);
    Object.assign(window, { innerWidth: 1024, innerHeight: 768 });
  });

  it('after dispose: no canvas, no renderer, no listeners, no frames', () => {
    const { game, input, renderer, view } = open();
    ticks(0.1);
    const frames = (renderer as any).frames;
    page!.dispose();
    expect((renderer as any).disposed).toBe(true);
    expect(document.body.contains((renderer as any).domElement)).toBe(false);
    expect(view.scene.children.length).toBe(0);
    element('hud').classList.remove('touch');
    send(window, 'keydown', { code: 'Enter' });
    touch('pointerdown', 1, 10, 10);
    touch('pointermove', 1, 200, 10);
    touch('pointerdown', 2, ...boostSpot());
    expect(game.state).toBe('menu');
    expect(input.stick).toEqual({ x: 0, y: 0 });
    expect(input.hold).toBe(false);
    expect(element('hud').classList.contains('touch')).toBe(false);
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

describe('shared input: the hold', () => {
  it('without a hold zone every touch steers, as before, and a mouse button still holds', () => {
    const input = createInput();
    touch('pointerdown', 1, innerWidth - 30, innerHeight - 30);
    touch('pointermove', 1, innerWidth - 30 - 28, innerHeight - 30);
    expect(input.stick).toEqual({ x: -0.5, y: 0 });
    expect(input.hold).toBe(false);
    touch('pointerup', 1, 0, 0);
    mouse('pointerdown');
    expect([input.hold, input.pointerDown]).toEqual([true, true]);
    mouse('pointerup');
    expect([input.hold, input.pointerDown]).toEqual([false, false]);
    input.dispose();
  });

  it('holds while any finger is in the zone, whichever lands first', () => {
    const input = createInput({ holdZone: (x: number) => x > 500 });
    touch('pointerdown', 1, 600, 100); // the boost thumb first
    expect(input.hold).toBe(true);
    touch('pointerdown', 2, 100, 100); // then the steering thumb
    touch('pointermove', 2, 100, 156);
    expect(input.stick).toEqual({ x: 0, y: 1 });
    touch('pointerdown', 3, 700, 300);
    touch('pointerup', 1, 600, 100);
    expect(input.hold).toBe(true); // one finger is still on it
    touch('pointerup', 3, 700, 300);
    expect(input.hold).toBe(false);
    expect(input.stick).toEqual({ x: 0, y: 1 });
    // A finger that landed on the stick side and slid into the zone is still the stick.
    touch('pointermove', 2, 600, 100);
    expect(input.hold).toBe(false);
    expect(input.stick).toEqual({ x: 1, y: 0 });
    input.dispose();
    touch('pointerdown', 9, 600, 100);
    expect(input.hold).toBe(false);
  });
});

describe('absorbed and dropped demos', () => {
  it.each(['drift', 'asteroids'])('/arcade/%s/ redirects to MURMUR and keeps the query and hash', slug => {
    const html = read(`${slug}/index.html`);
    const target = '/arcade/murmur/index.html';
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${target}">`);
    expect(html).toContain(`<link rel="canonical" href="${target}">`);
    expect(html).toContain(`<a href="${target}">`);
    expect(html).not.toContain('type="module"');
    let replaced = '';
    const location = { search: '?from=old', hash: '#top', replace: (url: string) => { replaced = url; } };
    new Function('location', html.match(/<script>([\s\S]*?)<\/script>/)![1])(location);
    expect(replaced).toBe(target + '?from=old#top');
  });

  it('the redirect target is the game page, loading its modules by absolute path', () => {
    const html = read('murmur/index.html');
    expect(html).toContain('<title>MURMUR</title>');
    const imports = [...html.matchAll(/from '([^']+)'/g)].map(match => match[1]);
    expect(imports).toEqual(['three', '/arcade/shared/ship.js', '/arcade/murmur/main.js']);
    for (const path of imports.slice(1)) expect(() => read(path.replace('/arcade/', ''))).not.toThrow();
  });
});

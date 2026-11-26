// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from '../../public/arcade/vendor/three.module.min.js';
import { createShipBody } from '../../public/arcade/shared/ship.js';
import { createInput } from '../../public/arcade/shared/runtime.js';
import { BEST_KEY, TUNE } from '../../public/arcade/meridian/game.js';
import { mount } from '../../public/arcade/meridian/main.js';
import { HALF, LANE_W, SEA, SPAN, mulberry32 } from '../../public/arcade/meridian/world.js';

// happy-dom replaces the global URL; file paths need node's.
const read = (path: string) => readFileSync(new NodeURL(`../../public/arcade/${path}`, import.meta.url), 'utf8');
const send = (target: EventTarget, type: string, fields = {}) =>
  target.dispatchEvent(Object.assign(new Event(type), fields));
const touch = (type: string, id: number, x: number, y: number) =>
  send(window, type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y });
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
  document.body.innerHTML = read('meridian/index.html').match(/<div class="hud">[\s\S]*?(?=<script)/)![0];
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
afterEach(() => { page?.dispose(); page = undefined; });

describe('MERIDIAN page', () => {
  it('shows the title over a moving world, then starts on a key', () => {
    const { game, renderer } = open(4200);
    ticks(0.5);
    expect(game.state).toBe('menu');
    expect(game.dist).toBeGreaterThan(0);
    expect((renderer as any).frames).toBe(30);
    expect([hidden('menu'), hidden('flight'), hidden('over')]).toEqual([false, true, true]);
    expect(text('best')).toBe('BEST 4200');
    expect(document.body.contains((renderer as any).domElement)).toBe(true);

    send(window, 'keydown', { code: 'Space' });
    ticks(0.5);
    expect(game.state).toBe('play');
    expect([hidden('menu'), hidden('flight'), hidden('over')]).toEqual([true, false, true]);
    expect(text('score')).toMatch(/^SCORE \d+$/);
    expect(text('sector')).toBe('THE RANGES');
    // Autorepeat while the key is held is not another press.
    send(window, 'keydown', { code: 'Space', repeat: true });
    expect(game.state).toBe('play');
  });

  it('steers with a drag from wherever the thumb lands, and centres when it lifts', () => {
    const { game, input } = open();
    touch('pointerdown', 1, 300, 600); // the tap that starts the run is also the anchor
    expect(game.state).toBe('play');
    expect(input.stick).toEqual({ x: 0, y: 0 });
    touch('pointermove', 1, 300 + 56, 600);
    expect(input.stick.x).toBe(1);
    ticks(0.5);
    expect(game.vx).toBeGreaterThan(TUNE.VX * 0.9);
    expect(game.x).toBeGreaterThan(10);

    touch('pointerup', 1, 356, 600);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    ticks(1);
    expect(Math.abs(game.vx)).toBeLessThan(2);

    touch('pointerdown', 2, 40, 200); // a new thumb position is a new centre
    touch('pointermove', 2, 12, 200);
    expect(input.stick.x).toBe(-0.5);
    ticks(0.5);
    expect(game.vx).toBeLessThan(-TUNE.VX * 0.25); // half a stick, softened by the pointer curve
  });

  it.each(['pointercancel', 'touchcancel', 'blur', 'hidden'])('lets go of the stick and the keys on %s', how => {
    const { game, input } = open();
    touch('pointerdown', 1, 200, 500);
    touch('pointermove', 1, 256, 556);
    send(window, 'keydown', { code: 'ArrowRight' });
    ticks(0.4);
    expect(game.vx).toBeGreaterThan(TUNE.VX * 0.6);

    if (how === 'hidden') {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      send(document, 'visibilitychange');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    } else send(window, how);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    expect(input.keys.ArrowRight).toBe(false);
    game.charge = TUNE.CHARGE;
    ticks(2);
    expect(Math.abs(game.vx)).toBeLessThan(1);
    // The cancelled touch is gone: its late move must not steer.
    touch('pointermove', 1, 400, 500);
    expect(input.stick).toEqual({ x: 0, y: 0 });
  });

  it('steers with the mouse, and a mouse left lying off-centre never takes the ship from the keys', () => {
    const { game, input } = open();
    send(window, 'pointerdown', { pointerType: 'mouse', clientX: innerWidth / 2, clientY: innerHeight / 2 });
    send(window, 'pointermove', { pointerType: 'mouse', clientX: innerWidth, clientY: innerHeight / 2 });
    expect(input.stick).toEqual({ x: 1, y: 0 });
    ticks(0.4);
    expect(game.vx).toBeGreaterThan(TUNE.VX * 0.9);

    send(window, 'keydown', { code: 'KeyA' });
    ticks(0.6);
    expect(game.vx).toBeLessThan(-TUNE.VX * 0.9);
    send(window, 'keyup', { code: 'KeyA' });
    // Keys released: the ship levels out and stays level, however long the mouse lies there.
    for (const seconds of [1, 3, 5]) {
      game.charge = TUNE.CHARGE;
      ticks(seconds);
      expect(Math.abs(game.vx)).toBeLessThan(1);
    }
    // Moving the mouse takes the stick back.
    send(window, 'pointermove', { pointerType: 'mouse', clientX: innerWidth * 0.9, clientY: innerHeight / 2 });
    ticks(0.6);
    expect(game.vx).toBeGreaterThan(TUNE.VX * 0.9);
  });

  it('climbs with the mouse above centre or the up key, dives with the opposite', () => {
    const { game } = open();
    send(window, 'keydown', { code: 'Enter' });
    send(window, 'keyup', { code: 'Enter' });
    game.runTime = TUNE.GRACE; game.y = 30;
    send(window, 'pointermove', { pointerType: 'mouse', clientX: innerWidth / 2, clientY: 0 });
    ticks(0.3);
    expect(game.vy).toBeGreaterThan(20);
    send(window, 'pointermove', { pointerType: 'mouse', clientX: innerWidth / 2, clientY: innerHeight });
    ticks(0.3);
    expect(game.vy).toBeLessThan(-20);
    send(window, 'keydown', { code: 'ArrowUp' });
    ticks(0.6); // the key builds up from a nudge
    expect(game.vy).toBeGreaterThan(20);
  });

  it('shows the result, keeps the best, locks, and retries', () => {
    const { game, values } = open(100);
    send(window, 'keydown', { code: 'Enter' });
    ticks(1);
    game.score = 987.2; game.bestChain = 6;
    game.y = -100;
    ticks(1 / 60);
    expect(game.state).toBe('over');
    expect([hidden('menu'), hidden('flight'), hidden('over'), hidden('record')]).toEqual([true, false, false, false]);
    expect(text('cause')).toBe('IMPACT');
    expect(text('result')).toMatch(/^SCORE 98[78]$/);
    expect(text('score')).toBe(text('result'));
    expect(text('facts')).toBe('THE RANGES · LAP 1 · BEST CHAIN 6');
    expect(text('best')).toBe('BEST ' + game.best);
    expect(values.get(BEST_KEY)).toBe(String(game.best));
    expect(document.getElementById('flash')!.classList.contains('hit')).toBe(true);

    let announced = 0;
    const sector = document.getElementById('sector')!;
    const add = sector.classList.add.bind(sector.classList);
    sector.classList.add = (...names: string[]) => { if (names.includes('announce')) announced++; add(...names); };
    send(window, 'pointerdown', { pointerType: 'mouse' }); // inside the lock
    ticks(TUNE.LOCK / 2);
    expect(game.state).toBe('over');
    ticks(TUNE.LOCK);
    send(window, 'pointerdown', { pointerType: 'mouse' });
    ticks(1 / 60);
    expect(game.state).toBe('play');
    expect([hidden('over'), hidden('flight')]).toEqual([true, false]);
    expect(text('score')).toMatch(/^SCORE [0-9]$/);
    expect(document.getElementById('flash')!.classList.contains('hit')).toBe(false);
    expect(announced).toBe(1); // the retry names its first sector again, though the name is the same

    // A lower score does not claim a record.
    const best = game.best;
    game.y = -100;
    ticks(1 / 60);
    expect([game.state, game.best, hidden('record')]).toEqual(['over', best, true]);
  });

  it('reports low flight, the chain, the charge and each new sector on the HUD', () => {
    const { game } = open();
    send(window, 'keydown', { code: 'Enter' });
    game.runTime = TUNE.GRACE;
    game.world.surface = () => 0;
    game.world.rowsNear = (_d: number, _reach: number, out: unknown[] = []) => { out.length = 0; return out; };
    game.gates.length = 0;
    game.y = 30;
    ticks(0.2);
    expect(text('low')).toBe('');
    expect(text('chain')).toBe('');
    game.y = 4;
    game.gates.push({ id: 99, d: game.dist + 0.5, x: game.x, y: 4, state: 0, at: 0 });
    ticks(0.2);
    expect(text('low')).toBe(`LOW ×${TUNE.LOW_MULT}`);
    expect(text('chain')).toBe(`CHAIN 1  +${TUNE.GATE_POINTS}`);
    ticks(1);
    expect(text('chain')).toBe('CHAIN 1');

    const fill = document.getElementById('chargeFill')!, bar = document.getElementById('charge')!;
    game.charge = 60; ticks(1 / 60);
    expect(fill.style.width).toBe('60%');
    expect(bar.classList.contains('low')).toBe(false);
    game.charge = 12; ticks(1 / 60);
    expect(fill.style.width).toBe('15%');
    expect(bar.classList.contains('low')).toBe(true);

    game.y = 30; game.charge = TUNE.CHARGE;
    game.world.restartAt(game.dist - SPAN * (4 + SEA) - 10);
    ticks(0.1);
    expect(text('sector')).toBe('THE SEA · LAP 2');
    expect(document.getElementById('sector')!.classList.contains('announce')).toBe(true);
  });

  it('resizes with the window', () => {
    const { view, renderer } = open();
    Object.assign(window, { innerWidth: 390, innerHeight: 844 });
    send(window, 'resize');
    expect((renderer as any).size).toEqual([390, 844]);
    expect(view.camera.aspect).toBeCloseTo(390 / 844);
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
    send(window, 'keydown', { code: 'Enter' });
    touch('pointerdown', 1, 10, 10);
    touch('pointermove', 1, 200, 10);
    expect(game.state).toBe('menu');
    expect(input.stick).toEqual({ x: 0, y: 0 });
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

describe('how the steering feels, in numbers', () => {
  /** A run over flat, empty ground with the opening grace over and the ship at rest. */
  function calm() {
    const page = open();
    send(window, 'keydown', { code: 'Enter' });
    send(window, 'keyup', { code: 'Enter' });
    const { game } = page;
    game.world.surface = () => 0;
    game.world.rowsNear = (_d: number, _reach: number, out: unknown[] = []) => { out.length = 0; return out; };
    game.runTime = TUNE.GRACE;
    game.x = 0; game.y = 25; game.vx = 0; game.vy = 0;
    return page;
  }
  const DT = 1 / 120;
  /** Hold a key for `seconds`, then let the ship come to rest. Returns where it ended up. */
  function press(code: string, seconds: number, read: (game: any) => number) {
    const { game } = calm();
    const from = read(game);
    send(window, 'keydown', { code });
    ticks(seconds, DT);
    send(window, 'keyup', { code });
    for (let i = 0; i < 20; i++) { game.charge = TUNE.CHARGE; ticks(0.1, DT); }
    expect(game.state).toBe('play');
    return read(game) - from;
  }
  const x = (game: any) => game.x, y = (game: any) => game.y;

  it('a 100 ms tap sideways is a nudge: 1.5 to 5 units of a 20-unit lane', () => {
    const right = press('ArrowRight', 0.1, x);
    expect(right).toBeGreaterThan(1.5);
    expect(right).toBeLessThan(5);
    expect(press('KeyA', 0.1, x)).toBeCloseTo(-right, 6);
  });

  it('a 300 ms hold sideways stays inside the next lane: 8 to 16 units', () => {
    const right = press('ArrowRight', 0.3, x);
    expect(right).toBeGreaterThan(8);
    expect(right).toBeLessThan(16);
    expect(press('ArrowLeft', 0.3, x)).toBeCloseTo(-right, 6);
  });

  it('crossing one lane takes 0.40 to 0.65 s of holding, and letting go there does not carry into the lane beyond', () => {
    const { game } = calm();
    send(window, 'keydown', { code: 'ArrowRight' });
    let seconds = 0;
    while (game.x < LANE_W && seconds < 3) { page!.tick(DT); seconds += DT; }
    send(window, 'keyup', { code: 'ArrowRight' });
    for (let i = 0; i < 20; i++) { game.charge = TUNE.CHARGE; ticks(0.1, DT); }
    expect(seconds).toBeGreaterThan(0.40);
    expect(seconds).toBeLessThan(0.65);
    // The lane beyond starts 1.5 lanes from where the ship set off.
    expect(game.x).toBeLessThan(LANE_W * 1.5);
  });

  it('a held key still reaches full speed, and no more', () => {
    const { game } = calm();
    send(window, 'keydown', { code: 'ArrowRight' });
    ticks(1, DT);
    expect(game.vx).toBeGreaterThan(TUNE.VX * 0.97);
    expect(game.vx).toBeLessThanOrEqual(TUNE.VX);
    // Crossing the whole track is a deliberate act, not a twitch.
    expect(HALF * 2 / TUNE.VX).toBeGreaterThan(2.2);
  });

  it('up and down taps are nudges too: 0.8 to 3 units for 100 ms, 4 to 10 for 300 ms', () => {
    const tap = press('ArrowUp', 0.1, y), hold = press('ArrowUp', 0.3, y);
    expect(tap).toBeGreaterThan(0.8);
    expect(tap).toBeLessThan(3);
    expect(hold).toBeGreaterThan(4);
    expect(hold).toBeLessThan(10);
    expect(press('KeyS', 0.1, y)).toBeCloseTo(-tap, 6);
  });
});

describe('shared input stick', () => {
  it('maps the mouse by its offset from the centre, with gain, clamped', () => {
    const input = createInput();
    const at = (x: number, y: number) =>
      send(window, 'pointermove', { pointerType: 'mouse', clientX: innerWidth * x, clientY: innerHeight * y });
    expect(input.stick).toEqual({ x: 0, y: 0 });
    at(0.5, 0.5); expect(input.stick).toEqual({ x: 0, y: 0 });
    at(0.75, 0.25); expect(input.stick).toEqual({ x: 0.75, y: -0.75 });
    at(1, 0); expect(input.stick).toEqual({ x: 1, y: -1 });
    at(0.1, 0.5); expect(input.stick).toEqual({ x: -1, y: 0 });
    // A mouse has no thumb to lift: releasing the button keeps the stick where the pointer is.
    send(window, 'pointerup', { pointerType: 'mouse' });
    expect(input.stick).toEqual({ x: -1, y: 0 });
    input.dispose();
  });

  it('gives one thumb the stick: a second finger cannot move it, and takes it over when the thumb lifts', () => {
    const input = createInput();
    touch('pointerdown', 7, 100, 700);
    touch('pointermove', 7, 128, 672);
    expect(input.stick).toEqual({ x: 0.5, y: -0.5 });
    touch('pointerdown', 8, 300, 300);
    touch('pointermove', 8, 10, 10);
    expect(input.stick).toEqual({ x: 0.5, y: -0.5 });
    touch('pointerup', 8, 10, 10);
    expect(input.stick).toEqual({ x: 0.5, y: -0.5 });
    touch('pointermove', 7, 100 - 400, 700 + 400);
    expect(input.stick).toEqual({ x: -1, y: 1 });
    touch('pointerup', 7, 0, 0);
    expect(input.stick).toEqual({ x: 0, y: 0 });

    // Swapping thumbs: the finger still down takes the stick over, centred where it is.
    touch('pointerdown', 1, 100, 500);
    touch('pointermove', 1, 156, 500);
    touch('pointerdown', 2, 300, 500);
    touch('pointermove', 2, 310, 520);
    expect(input.stick).toEqual({ x: 1, y: 0 });
    touch('pointerup', 1, 156, 500);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    touch('pointermove', 2, 310 - 28, 520);
    expect(input.stick).toEqual({ x: -0.5, y: 0 });
    touch('pointerup', 2, 282, 520);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    send(window, 'pointercancel');
    touch('pointermove', 2, 0, 0); // a cancelled touch is forgotten
    expect(input.stick).toEqual({ x: 0, y: 0 });
    input.dispose();
    touch('pointerdown', 9, 100, 100);
    touch('pointermove', 9, 156, 100);
    expect(input.stick).toEqual({ x: 0, y: 0 });
  });
});

describe('absorbed demos', () => {
  it.each(['horizon', 'city'])('/arcade/%s/ redirects to MERIDIAN and keeps the query and hash', slug => {
    const html = read(`${slug}/index.html`);
    const target = '/arcade/meridian/index.html';
    expect(html).toContain(`<meta http-equiv="refresh" content="0;url=${target}">`);
    expect(html).toContain(`<a href="${target}">`);
    expect(html).not.toContain('type="module"');
    let replaced = '';
    const location = { search: '?from=old', hash: '#top', replace: (url: string) => { replaced = url; } };
    new Function('location', html.match(/<script>([\s\S]*?)<\/script>/)![1])(location);
    expect(replaced).toBe(target + '?from=old#top');
  });

  it('the redirect target is the game page, loading its modules by absolute path', () => {
    const html = read('meridian/index.html');
    expect(html).toContain('<title>MERIDIAN</title>');
    const imports = [...html.matchAll(/from '([^']+)'/g)].map(match => match[1]);
    expect(imports).toEqual(['three', '/arcade/shared/ship.js', '/arcade/meridian/main.js']);
    for (const path of imports.slice(1)) expect(() => read(path.replace('/arcade/', ''))).not.toThrow();
  });
});

// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from '../../public/arcade/vendor/three.module.min.js';
import { createShipBody } from '../../public/arcade/shared/ship.js';
import { createInput } from '../../public/arcade/shared/runtime.js';
import { BEST_KEY, TUNE } from '../../public/arcade/meridian/game.js';
import { mount } from '../../public/arcade/meridian/main.js';
import { SEA, SPAN, mulberry32 } from '../../public/arcade/meridian/world.js';

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
    expect(game.vx).toBeGreaterThan(80);
    expect(game.x).toBeGreaterThan(10);

    touch('pointerup', 1, 356, 600);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    ticks(1);
    expect(Math.abs(game.vx)).toBeLessThan(2);

    touch('pointerdown', 2, 40, 200); // a new thumb position is a new centre
    touch('pointermove', 2, 12, 200);
    expect(input.stick.x).toBe(-0.5);
    ticks(0.5);
    expect(game.vx).toBeLessThan(-30);
  });

  it.each(['pointercancel', 'touchcancel', 'blur', 'hidden'])('lets go of the stick and the keys on %s', how => {
    const { game, input } = open();
    touch('pointerdown', 1, 200, 500);
    touch('pointermove', 1, 256, 556);
    send(window, 'keydown', { code: 'ArrowRight' });
    ticks(0.4);
    expect(game.vx).toBeGreaterThan(60);

    if (how === 'hidden') {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      send(document, 'visibilitychange');
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    } else send(window, how);
    expect(input.stick).toEqual({ x: 0, y: 0 });
    expect(input.keys.ArrowRight).toBe(false);
    game.charge = TUNE.CHARGE;
    ticks(KEYS_HOLD + 1);
    expect(Math.abs(game.vx)).toBeLessThan(1);
    // The cancelled touch is gone: its late move must not steer.
    touch('pointermove', 1, 400, 500);
    expect(input.stick).toEqual({ x: 0, y: 0 });
  });

  it('steers with the mouse, and lets held keys overrule a parked mouse', () => {
    const { game, input } = open();
    send(window, 'pointerdown', { pointerType: 'mouse', clientX: innerWidth / 2, clientY: innerHeight / 2 });
    send(window, 'pointermove', { pointerType: 'mouse', clientX: innerWidth, clientY: innerHeight / 2 });
    expect(input.stick).toEqual({ x: 1, y: 0 });
    ticks(0.4);
    expect(game.vx).toBeGreaterThan(60);

    send(window, 'keydown', { code: 'KeyA' });
    ticks(0.6);
    expect(game.vx).toBeLessThan(-60);
    send(window, 'keyup', { code: 'KeyA' });
    ticks(KEYS_HOLD / 2);
    expect(Math.abs(game.vx)).toBeLessThan(10); // still the keys' turn: no snap back
    ticks(KEYS_HOLD);
    expect(game.vx).toBeGreaterThan(60);
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
    ticks(0.3);
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

const KEYS_HOLD = 1.2;

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

  it('gives one thumb the stick: a second finger neither moves nor releases it', () => {
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

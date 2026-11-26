// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDeepField } from 'components/deepfield/createDeepField';
import type { DeepFieldHandle } from 'components/deepfield/createDeepField';

// The real stage runs over a renderer that draws nothing: the loop, its
// pausing and every input listener are the real ones.
const drawing = vi.hoisted(() => ({
  frame: null as ((now: number) => void) | null,
  scenes: [] as unknown[],
}));
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = Object.assign(document.createElement('canvas'), {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
      });
      info = {
        render: { calls: 0, triangles: 0, lines: 0, points: 0 },
        memory: { geometries: 0, textures: 0 },
      };
      setPixelRatio = vi.fn();
      getPixelRatio = () => 1;
      setSize = vi.fn();
      dispose = vi.fn();
      getContext = vi.fn(() => ({ getExtension: () => null }));
      render(scene: unknown) {
        if (!drawing.scenes.includes(scene)) drawing.scenes.push(scene);
      }
      setAnimationLoop(callback: ((now: number) => void) | null) {
        drawing.frame = callback;
      }
    },
  };
});

const CRUISE = 34; // BASE_SPEED: the title drift, in units per second
let now = 0;
let field: DeepFieldHandle | undefined;

beforeEach(() => {
  now = 1000;
  drawing.frame = null;
  drawing.scenes.length = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  field?.dispose();
  field = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function element(parent: HTMLElement = document.body, tag = 'div'): HTMLElement {
  const el = document.createElement(tag);
  Object.defineProperties(el, { clientWidth: { value: 1280 }, clientHeight: { value: 720 } });
  parent.appendChild(el);
  return el;
}

/** Runs `frames` frames at 60 Hz; false if the loop is not running. */
function advance(frames: number): boolean {
  for (let i = 0; i < frames; i++) {
    if (!drawing.frame) return false;
    now += 1000 / 60;
    drawing.frame(now);
  }
  return true;
}

const scene = () => drawing.scenes[drawing.scenes.length - 1] as THREE.Scene;
const bodies = () => scene().children.filter((child) => (child as THREE.Group).isGroup);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** The drifting bodies' median velocity over the next `frames` frames. */
function drift(frames = 30) {
  const before = bodies().map((body) => body.position.clone());
  expect(advance(frames)).toBe(true);
  const seconds = frames / 60;
  const moved = bodies().map((body, i) => body.position.clone().sub(before[i]).divideScalar(seconds));
  return { speed: median(moved.map((v) => v.length())), x: median(moved.map((v) => v.x)) };
}

const press = (target: EventTarget) =>
  target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
const release = () => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
const touch = (type: string, target: EventTarget) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch' }));
const moveTo = (target: EventTarget, clientX: number, clientY: number) =>
  target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }));

/** A hero with the field in it, a section beside it, and the field scoped to the hero. */
function scopedPage() {
  const hero = element();
  const container = element(hero);
  const section = element();
  const modes: string[] = [];
  field = createDeepField(container, { inputScope: hero, onMode: (mode) => modes.push(mode) });
  advance(2);
  return { hero, container, section, modes, field };
}

it('cruises at the title drift until something is pressed', () => {
  scopedPage();
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
});

it('without an input scope, a press anywhere on the page burns, as before', () => {
  const container = element();
  const elsewhere = element();
  field = createDeepField(container);
  advance(2);
  press(elsewhere);
  expect(drift().speed).toBeGreaterThan(CRUISE * 2.5);
});

it('with an input scope, a press inside it burns and a press outside it does not', () => {
  const { hero, section } = scopedPage();
  press(section);
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
  release();

  press(document.body);
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
  release();

  press(hero);
  expect(drift().speed).toBeGreaterThan(CRUISE * 2.5);
});

it('still leaves a link or button inside the scope alone', () => {
  const { hero } = scopedPage();
  press(element(hero, 'a'));
  press(element(hero, 'button'));
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
});

it('with an input scope, the cursor steers inside it and not outside it', () => {
  const { hero, section } = scopedPage();
  // far right of the field, but over the section: the drift stays straight
  moveTo(section, 1200, 360);
  expect(Math.abs(drift(90).x)).toBeLessThan(0.01);
  // the same point over the hero turns the heading right: the world slides left
  moveTo(hero, 1200, 360);
  expect(drift(90).x).toBeLessThan(-1);
  // leaving the scope is leaving the field: the heading eases back to straight
  moveTo(section, 1200, 360);
  advance(60 * 60);
  expect(Math.abs(drift(30).x)).toBeLessThan(1);
});

it('with an input scope, a finger that turns into a scroll does not touch the drift', () => {
  const { hero } = scopedPage();
  // the browser takes the gesture over as a scroll: pointercancel, no pointerup
  touch('pointerdown', hero);
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
  touch('pointercancel', window);
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
  // and a finger resting on the hero is not a burn either
  touch('pointerdown', hero);
  expect(drift(120).speed).toBeCloseTo(CRUISE, 0);
  touch('pointercancel', window);
});

it('with an input scope, a tap kicks the drift when the finger lifts', () => {
  const { hero } = scopedPage();
  touch('pointerdown', hero);
  touch('pointerup', window);
  expect(drift(10).speed).toBeGreaterThan(CRUISE * 2.5);
  // a kick, not a held burn: it coasts back to cruise
  advance(60 * 8);
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
});

it('with an input scope, a finger still burns for as long as it is held once in play', () => {
  const { hero, modes, field } = scopedPage();
  field.play();
  advance(200);
  expect(modes.at(-1)).toBe('play');
  touch('pointerdown', hero);
  expect(drift(60).speed).toBeGreaterThan(CRUISE * 2.5);
  touch('pointerup', window);
});

it('without an input scope, a finger kicks and burns from the moment it lands, as before', () => {
  const container = element();
  field = createDeepField(container);
  advance(2);
  touch('pointerdown', container);
  expect(drift().speed).toBeGreaterThan(CRUISE * 2.5);
});

it('forgets a finger that was down when the field was paused', () => {
  const { hero, field } = scopedPage();
  touch('pointerdown', hero);
  field.setPaused(true);
  touch('pointerup', window);
  field.setPaused(false);
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
});

it('gives the whole window back to the game from the first engage frame', () => {
  const { section, modes, field } = scopedPage();
  field.play();
  advance(1);
  expect(modes.at(-1)).toBe('engage');
  press(section);
  advance(200);
  expect(modes.at(-1)).toBe('play');
  expect(drift().speed).toBeGreaterThan(CRUISE * 2.5);
  release();

  // back on the title screen the scope applies again
  field.exit();
  advance(400);
  expect(modes.at(-1)).toBe('title');
  press(section);
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
});

it('stops the loop while paused and ignores presses and moves made meanwhile', () => {
  const { hero, field } = scopedPage();
  field.setPaused(true);
  expect(drawing.frame).toBeNull();
  expect(advance(10)).toBe(false);

  press(hero);
  moveTo(hero, 1200, 360);
  field.setPaused(false);
  expect(drawing.frame).not.toBeNull();
  const resumed = drift(60);
  expect(resumed.speed).toBeCloseTo(CRUISE, 0);
  expect(Math.abs(resumed.x)).toBeLessThan(0.01);
});

it('drops a held burn when paused, so it is not still burning on resume', () => {
  const { hero, field } = scopedPage();
  press(hero);
  expect(drift(60).speed).toBeGreaterThan(CRUISE * 4);
  // no pointerup arrives: the button is released while the handlers are gated
  field.setPaused(true);
  field.setPaused(false);
  advance(60 * 8);
  expect(drift().speed).toBeCloseTo(CRUISE, 0);
});

it('still takes Escape while paused, and leaves play once resumed', () => {
  const { modes, field } = scopedPage();
  field.play();
  advance(200);
  expect(modes.at(-1)).toBe('play');
  field.setPaused(true);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  expect(modes.at(-1)).toBe('play');
  field.setPaused(false);
  advance(400);
  expect(modes.at(-1)).toBe('title');
});

it('keeps nothing running or listening after dispose, paused or not', () => {
  const { hero, field } = scopedPage();
  field.setPaused(true);
  field.dispose();
  expect(drawing.frame).toBeNull();
  field.setPaused(false);
  expect(drawing.frame).toBeNull();
  expect(() => {
    press(hero);
    moveTo(hero, 10, 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  }).not.toThrow();
  expect(hero.querySelector('canvas')).toBeNull();
});

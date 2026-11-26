// Wires the rules and the picture to the page: input in, HUD out.
import { createInput, startLoop, setText } from '../shared/runtime.js';
import { TUNE, createGame } from './game.js';
import { markerSpot } from './marker.js';
import { createView } from './view.js';

/** The BOOST square: its side, its gap from the screen's corner, and the slack around it that still counts. */
export const ZONE = { SIZE: 96, GAP: 20, SLACK: 16 };
/** A held steering key moves the stick to full in 1 / KEY_RAMP seconds, so a tap
 *  is a nudge; let go and it centres in 1 / KEY_RELEASE. */
export const KEY_RAMP = 2.5, KEY_RELEASE = 6;
const STEER_KEYS = ['ArrowRight', 'KeyD', 'ArrowLeft', 'KeyA', 'ArrowDown', 'ArrowUp'];
/** Markers stay this far inside the screen's edge. */
const INSET = 38;
/** A marker's centre keeps this far from the BOOST square, sideways and upward.
 *  A marker is a sign with its distance under or over it: about 30 px wide and
 *  39 tall, hung up to 9 px off its centre. Upward needs room for all of that. */
export const ZONE_CLEAR = { x: 22, y: 36 };
/** A phone slower than this many frames a second flies the smaller flock from its next run. */
const SLOW_FPS = 34;

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

/** A touch here is the BOOST thumb: the square in the bottom right corner and a little around it. */
export const inBoostZone = (x, y) => {
  const reach = ZONE.GAP + ZONE.SIZE + ZONE.SLACK;
  return x >= innerWidth - reach && y >= innerHeight - reach;
};

/**
 * Mount MURMUR on the page's HUD markup. three.js and the ship are passed in
 * so the page chooses its three.js build.
 * @param {{ THREE: typeof import('three'),
 *   createShipBody: (three: typeof import('three')) => import('three').Group,
 *   storage?: Storage | null, random?: () => number }} options
 */
export function mount({ THREE, createShipBody, storage = safeStorage(), random = Math.random }) {
  const el = id => document.getElementById(id);
  const hud = {
    root: el('hud'), score: el('score'), wake: el('wake'), clock: el('clock'), best: el('best'),
    banked: el('banked'), boost: el('boost'), flight: el('flight'), flash: el('flash'),
    flock: el('flockMark'), flockFar: el('flockFar'), gate: el('gateMark'), gateFar: el('gateFar'),
    menu: el('menu'), over: el('over'), cause: el('cause'), result: el('result'),
    record: el('record'), facts: el('facts'),
  };
  hud.boost.style.width = hud.boost.style.height = ZONE.SIZE + 'px';
  hud.boost.style.right = hud.boost.style.bottom = ZONE.GAP + 'px';

  const game = createGame({ random, storage });
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const pixelRatio = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  const view = createView({ THREE, createShipBody, game, aspect: innerWidth / innerHeight });
  view.resize(innerWidth, innerHeight, pixelRatio);

  // A slow phone gets the smaller flock, from its next run on and for good.
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  let frameTime = 1 / 60;
  const input = createInput({
    holdZone: inBoostZone,
    onPress: () => {
      if (coarse && frameTime > 1 / SLOW_FPS) game.setBirds(TUNE.BIRDS_LOW);
      game.press();
    },
  });
  // The BOOST square is for thumbs: it appears with the first touch.
  let thumbs = coarse;
  const onTouch = event => {
    if (event.pointerType !== 'touch') return;
    thumbs = true;
    hud.root.classList.add('touch');
  };
  addEventListener('pointerdown', onTouch);
  // No menu over the game: a right click must not freeze the page mid-run.
  const noMenu = event => event.preventDefault();
  addEventListener('contextmenu', noMenu);

  const stick = { x: 0, y: 0 }, keyStick = { x: 0, y: 0 };
  // The stick belongs to whoever acted last: pressing a steering key gives it
  // to the keys, moving the pointer gives it back. A key still held does not
  // hold on to it, and a mouse left lying off-centre does not take it: only a
  // new press or a new move counts. `parked` is where the pointer was when
  // the keys took over (its position, not the stick, which is clamped).
  let keysSteer = false, held = 0;
  const parked = { x: 0, y: 0 };
  const ramp = (value, target, dt) => {
    const rate = (target === 0 ? KEY_RELEASE : KEY_RAMP) * dt;
    return value + Math.max(-rate, Math.min(rate, target - value));
  };

  function readStick(dt) {
    const { keys } = input;
    const right = keys.ArrowRight || keys.KeyD ? 1 : 0, left = keys.ArrowLeft || keys.KeyA ? 1 : 0;
    const down = keys.ArrowDown ? 1 : 0, up = keys.ArrowUp ? 1 : 0;
    // One bit per steering key, so a new press is seen whatever else is held.
    let now = 0;
    for (let i = 0; i < STEER_KEYS.length; i++) if (keys[STEER_KEYS[i]]) now |= 1 << i;
    if (now & ~held) {
      keysSteer = true;
      parked.x = input.pointer.x; parked.y = input.pointer.y;
    } else if (keysSteer && (input.pointer.x !== parked.x || input.pointer.y !== parked.y)) {
      keysSteer = false;
    }
    held = now;
    // While the pointer has the stick the keys' own stick runs down, so taking
    // it back with a new press starts from a nudge again.
    keyStick.x = ramp(keyStick.x, keysSteer ? right - left : 0, dt);
    keyStick.y = ramp(keyStick.y, keysSteer ? down - up : 0, dt);
    stick.x = keysSteer ? keyStick.x : input.stick.x;
    stick.y = keysSteer ? keyStick.y : input.stick.y;
    return stick;
  }
  const boosting = () => !!(input.hold || input.keys.KeyW || input.keys.Space);

  const camera = { x: 0, y: 0, z: 0 }, way = { turn: 0, climb: 0 }, spot = { x: 0, y: 0, edge: false };
  function mark(element, label, target) {
    const { ship } = game;
    view.toCamera(target.x, target.y, target.z, camera);
    game.bearing(target.x, target.y, target.z, way);
    markerSpot(camera.x, camera.y, camera.z, way.turn, way.climb,
      Math.tan(view.camera.fov * Math.PI / 360), view.camera.aspect, innerWidth, innerHeight, INSET, spot);
    if (thumbs) {
      // Never under the BOOST thumb: a marker that lands on the square moves
      // up the right edge, or along the bottom edge, to just clear of it.
      const left = innerWidth - ZONE.GAP - ZONE.SIZE - ZONE_CLEAR.x, top = innerHeight - ZONE.GAP - ZONE.SIZE - ZONE_CLEAR.y;
      if (spot.x > left && spot.y > top) {
        if (innerWidth - spot.x <= innerHeight - spot.y) spot.y = top; else spot.x = left;
      }
    }
    element.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px) translate(-50%, -50%)`;
    element.classList.toggle('edge', spot.edge);
    setText(label, String(Math.round(Math.hypot(target.x - ship.x, target.y - ship.y, target.z - ship.z))));
  }

  let shown = '', hudClock = 1, announced = -Infinity;
  function show(state) {
    if (state === shown) return;
    shown = state;
    hudClock = 1; // a new run must not show the last run's numbers, even for a frame
    hud.menu.classList.toggle('hidden', state !== 'menu');
    hud.over.classList.toggle('hidden', state !== 'over');
    hud.flight.classList.toggle('hidden', state === 'menu');
    hud.flight.classList.toggle('ended', state === 'over');
    hud.flash.classList.toggle('hit', state === 'over' && game.cause === 'WRECKED');
    if (state === 'play') { announced = -Infinity; hud.banked.classList.remove('announce'); }
    if (state !== 'over') return;
    setText(hud.cause, game.cause);
    setText(hud.result, 'SCORE ' + game.score);
    hud.record.classList.toggle('hidden', !game.newBest);
    setText(hud.facts, `HAULS ${game.banks} · BIGGEST ${game.biggest}`);
  }

  function paint(dt) {
    show(game.state);
    setText(hud.best, 'BEST ' + game.best);
    if (game.state === 'menu') return;
    hudClock += dt;
    if (hudClock >= 0.1 || game.state === 'over') {
      hudClock = 0;
      setText(hud.clock, game.clock.toFixed(1));
    }
    setText(hud.score, 'SCORE ' + game.score);
    setText(hud.wake, 'WAKE ' + game.flock.wake);
    hud.clock.classList.toggle('low', game.state === 'play' && game.clock < 8);
    hud.boost.classList.toggle('on', game.state === 'play' && game.ship.boost);
    if (game.banked.at !== announced && game.banked.at > -Infinity) {
      // Restart the fade so every bank announces itself.
      announced = game.banked.at;
      setText(hud.banked, `BANKED ${game.banked.birds} · +${game.banked.points} · +${game.banked.seconds.toFixed(1)} S`);
      hud.banked.classList.remove('announce');
      void hud.banked.offsetWidth;
      hud.banked.classList.add('announce');
    }
    if (game.state !== 'play') return;
    mark(hud.flock, hud.flockFar, game.flock.centre);
    mark(hud.gate, hud.gateFar, game.gate);
  }

  function tick(dt) {
    frameTime += (dt - frameTime) * 0.05;
    game.step(dt, readStick(dt), boosting());
    view.render(renderer, dt);
    paint(dt);
  }

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    view.resize(innerWidth, innerHeight, pixelRatio);
  };
  addEventListener('resize', resize);
  const loop = startLoop(tick);

  function dispose() {
    loop.dispose();
    input.dispose();
    removeEventListener('resize', resize);
    removeEventListener('pointerdown', onTouch);
    removeEventListener('contextmenu', noMenu);
    view.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { game, view, input, renderer, tick, dispose };
}

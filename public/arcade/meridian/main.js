// Wires the rules and the picture to the page: input in, HUD out.
import { createInput, startLoop, setText } from '../shared/runtime.js';
import { TUNE, createGame, sectorName } from './game.js';
import { createView } from './view.js';

/** Seconds the pointer is ignored after a steering key, so a parked mouse cannot fight the keys. */
const KEYS_HOLD = 1.2;
const CHARGE_CELLS = 20;

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

/**
 * Mount MERIDIAN on the page's HUD markup. three.js and the ship are passed in
 * so the page chooses its three.js build.
 * @param {{ THREE: typeof import('three'),
 *   createShipBody: (three: typeof import('three')) => import('three').Group,
 *   storage?: Storage | null, random?: () => number }} options
 */
export function mount({ THREE, createShipBody, storage = safeStorage(), random = Math.random }) {
  const el = id => document.getElementById(id);
  const hud = {
    score: el('score'), low: el('low'), chain: el('chain'), best: el('best'),
    sector: el('sector'), charge: el('charge'), chargeFill: el('chargeFill'),
    menu: el('menu'), over: el('over'), cause: el('cause'), result: el('result'),
    record: el('record'), facts: el('facts'), flight: el('flight'), flash: el('flash'),
  };

  const game = createGame({ random, storage });
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  const view = createView({ THREE, createShipBody, game, aspect: innerWidth / innerHeight });

  const input = createInput({ onPress: () => { game.press(); } });
  const stick = { x: 0, y: 0 };
  let keysHold = 0;

  function readStick(dt) {
    const { keys } = input;
    const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    const ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    keysHold = kx || ky ? KEYS_HOLD : Math.max(0, keysHold - dt);
    stick.x = keysHold > 0 ? kx : input.stick.x;
    stick.y = keysHold > 0 ? ky : input.stick.y;
    return stick;
  }

  let shown = '', hudClock = 1, sector = '';
  function show(state) {
    if (state === shown) return;
    shown = state;
    hudClock = 1; // a new run must not show the last run's score, even for a frame
    hud.menu.classList.toggle('hidden', state !== 'menu');
    hud.over.classList.toggle('hidden', state !== 'over');
    hud.flight.classList.toggle('hidden', state === 'menu');
    hud.flash.classList.toggle('hit', state === 'over');
    if (state !== 'over') return;
    setText(hud.cause, game.cause);
    setText(hud.result, 'SCORE ' + Math.floor(game.score));
    hud.record.classList.toggle('hidden', !game.newBest);
    setText(hud.facts, `${sectorName(game)} · LAP ${game.lap} · BEST CHAIN ${game.bestChain}`);
  }

  function paint(dt) {
    show(game.state);
    setText(hud.best, 'BEST ' + game.best);
    if (game.state === 'menu') return;
    hudClock += dt;
    if (hudClock >= 0.1 || game.state === 'over') {
      hudClock = 0;
      setText(hud.score, 'SCORE ' + Math.floor(game.score));
    }
    setText(hud.low, game.low && game.state === 'play' ? `LOW ×${TUNE.LOW_MULT}` : '');
    const paid = game.time - game.payout.at < 0.9 ? `  +${game.payout.points}` : '';
    setText(hud.chain, game.chain > 0 ? `CHAIN ${game.chain}${paid}` : '');
    const name = sectorName(game) + (game.lap > 1 ? ` · LAP ${game.lap}` : '');
    if (name !== sector) {
      // Restart the fade so every new sector announces itself.
      sector = name;
      setText(hud.sector, name);
      hud.sector.classList.remove('announce');
      void hud.sector.offsetWidth;
      hud.sector.classList.add('announce');
    }
    const cells = Math.ceil(game.charge / TUNE.CHARGE * CHARGE_CELLS);
    hud.chargeFill.style.width = cells / CHARGE_CELLS * 100 + '%';
    hud.charge.classList.toggle('low', game.state === 'play' && game.charge < 25);
  }

  function tick(dt) {
    game.step(dt, readStick(dt));
    view.render(renderer, dt);
    paint(dt);
  }

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    view.resize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  const loop = startLoop(tick);

  function dispose() {
    loop.dispose();
    input.dispose();
    removeEventListener('resize', resize);
    view.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { game, view, input, renderer, tick, dispose };
}

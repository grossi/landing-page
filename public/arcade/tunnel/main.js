// Wires the rules and the picture to the page: input in, HUD out.
import { createInput, startLoop, setText } from '../shared/runtime.js';
import { CONTROL, chase, createKeyAxis, pointerAngle } from './controls.js';
import { TUNE, createGame } from './game.js';
import { createView } from './view.js';

/** How long a payout or a notice stays on the HUD. */
const SHOWN = 1.1;

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

/**
 * Mount HYPERTUNNEL on the page's HUD markup. three.js and the ship are passed
 * in so the page chooses its three.js build.
 * @param {{ THREE: typeof import('three'),
 *   createShipBody: (three: typeof import('three')) => import('three').Group,
 *   storage?: Storage | null, random?: () => number }} options
 */
export function mount({ THREE, createShipBody, storage = safeStorage(), random = Math.random }) {
  const el = id => document.getElementById(id);
  const hud = {
    score: el('score'), chain: el('chain'), shield: el('shield'), best: el('best'),
    depth: el('depth'), note: el('note'), menu: el('menu'), over: el('over'),
    cause: el('cause'), result: el('result'), record: el('record'), facts: el('facts'),
    flight: el('flight'), flash: el('flash'),
  };

  const game = createGame({ random, storage });
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.body.appendChild(renderer.domElement);
  const view = createView({ THREE, createShipBody, game, aspect: innerWidth / innerHeight });

  const axis = createKeyAxis();
  /** Thumbs that are down, by pointer id, and where across the screen each one is. */
  const thumbs = new Map();
  /** The mouse, as an offset from the screen centre, and what it points at. */
  const mouse = { x: 0, y: 0 };
  let aim = null;
  // The stick belongs to whoever acted last: 'keys' (keys or thumbs) or 'mouse'.
  // Once a key is pressed the keys keep it, released or not, until the mouse
  // has moved WAKE pixels from where it lay then (`parked`): a mouse left lying
  // off-centre, or bumped, must not take the ship from a keyboard player.
  let owner = '';
  const parked = { x: 0, y: 0 };

  function onPointer(event) {
    if (event.pointerType === 'touch') {
      if (event.type === 'pointerdown' || thumbs.has(event.pointerId)) thumbs.set(event.pointerId, event.clientX);
      return;
    }
    // A pointer event that carries no position says nothing about where the mouse is.
    if (!Number.isFinite(event.clientX + event.clientY)) return;
    mouse.x = event.clientX - innerWidth / 2; mouse.y = event.clientY - innerHeight / 2;
    if (owner === 'keys' && Math.hypot(mouse.x - parked.x, mouse.y - parked.y) < CONTROL.WAKE) return;
    owner = 'mouse';
    // In the dead zone the pointer points nowhere: the last aim stands.
    aim = pointerAngle(mouse.x, mouse.y, Math.min(innerWidth, innerHeight)) ?? aim;
  }
  const onLift = event => { thumbs.delete(event.pointerId); };
  // These listen before the shared input does, so the click that starts a run
  // has already said where the mouse is.
  const POINTERS = [['pointermove', onPointer], ['pointerdown', onPointer], ['pointerup', onLift]];
  for (const [type, handler] of POINTERS) addEventListener(type, handler);
  const input = createInput({
    // Under the mouse the ship is on its way to the pointer: the run's first gap
    // stands there. A steering key or a thumb takes the stick with the same
    // press, so then the gap stands where the ship is.
    onPress: () => { game.press(owner === 'mouse' && aim !== null && !held() ? aim : undefined); },
  });

  /** The direction the keys or the thumbs hold: −1, 0 or 1. */
  function held() {
    const { keys } = input;
    const keyed = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    if (keyed || !thumbs.size) return keyed;
    // The thumb that came down last decides: the left half turns left, the right half right.
    let x = 0;
    for (const at of thumbs.values()) x = at;
    return x < innerWidth / 2 ? -1 : 1;
  }

  /** The stick for this frame, or null for hands off. */
  function readSteer(dt) {
    const direction = held();
    if (direction) {
      // The keys take the stick, and what the mouse was pointing at is forgotten:
      // when it comes back it must point somewhere new.
      owner = 'keys'; aim = null;
      parked.x = mouse.x; parked.y = mouse.y;
    }
    // The key axis always runs, so a key let go eases out even as the mouse takes over.
    const keyed = axis.step(dt, direction);
    view.follow = owner !== 'mouse';
    if (owner === 'mouse') return aim === null ? null : chase(aim, game.angle);
    // Behind the title a key starts the run, so nobody holds the stick there.
    return game.state === 'menu' ? null : keyed;
  }

  let shown = '', hudClock = 1, announced = '';
  function show(state) {
    if (state === shown) return;
    shown = state;
    hudClock = 1; // a new run must not show the last run's score, even for a frame
    if (state === 'play') announced = ''; // and announces its first section again
    hud.menu.classList.toggle('hidden', state !== 'menu');
    hud.over.classList.toggle('hidden', state !== 'over');
    hud.flight.classList.toggle('hidden', state === 'menu');
    hud.flash.classList.toggle('hit', state === 'over' && game.cause === 'WRECKED');
    if (state !== 'over') return;
    setText(hud.cause, game.cause);
    setText(hud.result, 'SCORE ' + game.score);
    hud.record.classList.toggle('hidden', !game.newBest);
    setText(hud.facts, `DEPTH ${game.depth} · BEST CHAIN ${game.bestChain}`);
  }

  function paint(dt) {
    show(game.state);
    setText(hud.best, 'BEST ' + game.best);
    if (game.state === 'menu') return;
    hudClock += dt;
    if (hudClock >= 0.1 || game.state === 'over') {
      hudClock = 0;
      setText(hud.score, 'SCORE ' + game.score);
    }
    const recent = at => game.time - at < SHOWN;
    const paid = recent(game.payout.at) ? `+${game.payout.points}` : '';
    setText(hud.chain, game.chain > 0 ? `PERFECT ×${game.chain}${paid && '  ' + paid}` : paid);
    const pips = game.chain % TUNE.SHIELD;
    setText(hud.shield, game.shield ? 'SHIELD READY'
      : 'SHIELD ' + '■'.repeat(pips) + '□'.repeat(TUNE.SHIELD - pips));
    const depth = `DEPTH ${game.depth} · ${game.pattern}`;
    if (depth !== announced) {
      // Restart the pulse so every new section announces itself.
      announced = depth;
      setText(hud.depth, depth);
      hud.depth.classList.remove('announce');
      void hud.depth.offsetWidth;
      hud.depth.classList.add('announce');
    }
    // The newest of the things worth a line: a shield lost, a shield charged, a section paid.
    const latest = Math.max(game.broke, game.charged, game.bonus.at);
    setText(hud.note, !recent(latest) ? ''
      : latest === game.broke ? 'SHIELD LOST'
        : latest === game.charged ? 'SHIELD CHARGED' : `SECTION CLEAR +${game.bonus.points}`);
    hud.flash.classList.toggle('soft', game.state === 'play' && game.time - game.broke < 0.3);
  }

  function tick(dt) {
    game.step(dt, readSteer(dt));
    view.render(renderer, dt);
    paint(dt);
  }

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    view.resize(innerWidth, innerHeight);
  };
  // Whatever makes the runtime let go of held keys also lets go of the key's
  // ramp, the thumbs and the mouse's aim: a tab that was hidden must not come
  // back still turning, and the next press starts from the first nudge.
  const release = () => { axis.reset(); thumbs.clear(); aim = null; owner = ''; };
  const RELEASES = ['blur', 'pointercancel', 'touchcancel', 'pagehide'];
  addEventListener('resize', resize);
  for (const type of RELEASES) addEventListener(type, release);
  document.addEventListener('visibilitychange', release);
  const loop = startLoop(tick);

  function dispose() {
    loop.dispose();
    input.dispose();
    removeEventListener('resize', resize);
    for (const [type, handler] of POINTERS) removeEventListener(type, handler);
    for (const type of RELEASES) removeEventListener(type, release);
    document.removeEventListener('visibilitychange', release);
    release();
    view.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { game, view, input, renderer, tick, dispose };
}

// A scripted pilot for MURMUR. It reads the game the way a player reads the
// screen (where the flock and the gate are from the ship, the rocks ahead, the
// wake, the clock) and answers with a stick and a boost. The tests fly it, and
// the browser fixture drives the real page's pointer handlers with it.
import { TUNE, toFrame } from '../../public/arcade/murmur/game.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const curve = stick => Math.sign(stick) * Math.abs(stick) ** TUNE.EXPO;
/** How far ahead the pilot looks for rocks, and the room it wants around one. */
const HORIZON = 1.7, LOOK_STEP = 0.05, ROOM = 2.2;
const WAYS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/**
 * @param {any} game
 * @param {{ haul?: number, boost?: boolean, dodge?: boolean }} [options]
 *   haul: bank once the wake holds this many; boost: use it; dodge: avoid rocks.
 */
export function createBot(game, { haul = 60, boost = true, dodge = true } = {}) {
  const bot = { stick: { x: 0, y: 0 }, boost: false, mode: 'gather', update };
  const local = { x: 0, y: 0, z: 0 };
  const close = new Int16Array(game.belt.count);
  let committed = false, banks = game.banks;

  function steerAt(x, y, z) {
    game.fromShip(x, y, z, local);
    const far = Math.hypot(local.x, local.y, local.z) || 1;
    if (local.z > 0) {
      // Behind: commit to a hard turn toward its side.
      bot.stick.x = local.x >= 0 ? 1 : -1;
      bot.stick.y = clamp(-local.y / far * 2, -0.6, 0.6);
    } else {
      bot.stick.x = clamp(local.x / far * 3.5, -1, 1);
      bot.stick.y = clamp(-local.y / far * 3.5, -1, 1);
    }
    return { far, ahead: -local.z / far };
  }

  /** Seconds until the ship would touch a rock holding this stick, by the game's own flight rules. */
  function clearFor(sx, sy, boosting, count) {
    const { ship, belt } = game;
    let { x, y, z, vx, vy, vz, yaw, pitch, turn, climb } = ship;
    const response = 1 - Math.exp(-LOOK_STEP * TUNE.RESPONSE), thrust = 1 - Math.exp(-LOOK_STEP * TUNE.THRUST);
    const speed = boosting ? TUNE.BOOST : TUNE.CRUISE;
    for (let t = LOOK_STEP; t <= HORIZON; t += LOOK_STEP) {
      turn += (curve(sx) - turn) * response; climb += (curve(sy) - climb) * response;
      yaw -= turn * TUNE.YAW * LOOK_STEP;
      pitch = clamp(pitch - climb * TUNE.PITCH * LOOK_STEP, -TUNE.PITCH_MAX, TUNE.PITCH_MAX);
      const cp = Math.cos(pitch);
      vx += (-cp * Math.sin(yaw) * speed - vx) * thrust;
      vy += (Math.sin(pitch) * speed - vy) * thrust;
      vz += (-cp * Math.cos(yaw) * speed - vz) * thrust;
      x += vx * LOOK_STEP; y += vy * LOOK_STEP; z += vz * LOOK_STEP;
      for (let n = 0; n < count; n++) {
        const i = close[n], reach = belt.r[i] + TUNE.HULL + ROOM;
        if ((belt.x[i] - x) ** 2 + (belt.y[i] - y) ** 2 + (belt.z[i] - z) ** 2 < reach * reach) return t;
      }
    }
    return Infinity;
  }

  function update() {
    const { ship, flock, belt, gate } = game;
    const gateFar = Math.hypot(gate.x - ship.x, gate.y - ship.y, gate.z - ship.z);
    // Bank when the haul is in, or when the clock only just covers the trip. Once
    // on its way it goes through with it: birds shed in the reef do not turn it back.
    if (game.banks !== banks || flock.wake === 0) { banks = game.banks; committed = false; }
    if (flock.wake >= haul || (flock.wake > 0 && game.clock < gateFar / 60 + 4)) committed = true;
    const due = committed;
    bot.mode = due ? 'bank' : 'gather';
    const target = due ? gate : flock.centre;
    const aim = steerAt(target.x, target.y, target.z);
    bot.boost = boost && aim.ahead > 0.9 && (due ? aim.far > 60 : aim.far < 140);
    if (!dodge) return bot;

    // Rocks near enough to matter within the horizon.
    let count = 0;
    const range = TUNE.BOOST * HORIZON + 12;
    for (let i = 0; i < belt.count && count < close.length; i++) {
      if ((belt.x[i] - ship.x) ** 2 + (belt.y[i] - ship.y) ** 2 + (belt.z[i] - ship.z) ** 2 < range * range) close[count++] = i;
    }
    if (!count || clearFor(bot.stick.x, bot.stick.y, bot.boost, count) === Infinity) return bot;
    // The wanted line meets a rock: take the stick that stays clear longest,
    // and of those the one nearest to what was wanted.
    let best = -1, bestTime = -1, bestCost = Infinity;
    for (let w = 0; w < WAYS.length; w++) {
      const time = clearFor(WAYS[w][0], WAYS[w][1], false, count);
      const cost = (WAYS[w][0] - bot.stick.x) ** 2 + (WAYS[w][1] - bot.stick.y) ** 2;
      if (time > bestTime || (time === bestTime && cost < bestCost)) { best = w; bestTime = time; bestCost = cost; }
    }
    bot.stick.x = WAYS[best][0]; bot.stick.y = WAYS[best][1];
    bot.boost = false;
    return bot;
  }
  return bot;
}

/**
 * Scripted play for EPHEMERIS: a pilot that flies a loop through the same
 * inputs a player has, a mouse for the stick and one held burn. No imports,
 * so the same module runs under vitest and in a real page.
 *
 * Two kinds of pilot:
 * - `knows`: has read the day's log, so knows where every find is and when it
 *   answers. It flies to the nearest one answering, and waits out the gaps
 *   near the next. A second or third loop of a player who reads the notes.
 * - `listens`: knows nothing. It follows what the reticle shows: the
 *   strongest signal ahead and the tick that says which way, and when there
 *   is none it turns to search. A first loop.
 *
 * It is a model of a hand, used to check the loop is winnable and what a
 * first loop finds. It is not a hand.
 */

export interface PilotWorld {
  pois(): Array<{ name: string; x: number; y: number; z: number; radius: number; id: string; solid: boolean; envelope: boolean }>;
  finds(): Array<{ id: string; x: number; y: number; z: number; open: boolean; logged: boolean; opensAt: number; closesAt: number }>;
  shipAbs(): { x: number; y: number; z: number };
  attitude(): { quaternion: { x: number; y: number; z: number; w: number }; fov: number; aspect: number };
  state(): {
    phase: string;
    timeLeft: number;
    scanId: string | null;
    speed: number;
    bodySpeed: number;
    tooFast: boolean;
    signal: { id: string; strength: number; dist: number; offNose: number; angle: number } | null;
  };
}

export interface PilotControls {
  /** Puts the mouse at this point of the game area, in NDC (x right, y up). */
  mouse(x: number, y: number): void;
  /** Presses or releases the burn. Called only when it changes. */
  burn(held: boolean): void;
}

export interface PilotPlan {
  mode: 'knows' | 'listens';
  /** Extra distance (km) it leaves for braking, on top of what the flight law needs. */
  margin?: number;
}

/** Find ranges as the rules have them (survey.ts FINDS); windows come from the day (world.finds). */
const RANGE: Record<string, number> = { relay: 600, wreck: 600, bell: 600, passenger: 1000, light: 600 };

/** How far the ship coasts off the burn from `speed` to 150 km/s (createEphemeris brakingDistance). */
function brakingDistance(speed: number): number {
  const excess = speed - 100;
  if (excess <= 50) return 0;
  return (excess - 50) / 1.4 + (100 * Math.log(excess / 50)) / 1.4;
}

type Vec = { x: number; y: number; z: number };
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec) => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec): Vec => mul(a, 1 / Math.max(1e-9, len(a)));
const cross = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
/** `v` rotated by the inverse of unit quaternion `q`: world into camera space. */
function toCamera(v: Vec, q: { x: number; y: number; z: number; w: number }): Vec {
  const u = { x: -q.x, y: -q.y, z: -q.z };
  const t = mul(cross(u, v), 2);
  return add(add(v, mul(t, q.w)), cross(u, t));
}

export interface Pilot {
  /** One decision. Call it a few times a second or every frame. */
  step(): void;
  /** What the pilot is flying at, for logs. */
  target(): string;
}

export function createPilot(world: PilotWorld, controls: PilotControls, plan: PilotPlan): Pilot {
  let burning = false;
  let targetName = '';
  const margin = plan.margin ?? 300;
  // off the burn once what is left is no more than the coast to scan speed
  const keepBurning = (dist: number, id: string, speed: number) =>
    dist - RANGE[id] * 0.5 > brakingDistance(Math.max(speed, 1500)) + margin;
  // matching a moving find: burn while slower than it, coast while faster
  const keepPace = (dist: number, speed: number, bodySpeed: number, inRange: boolean) =>
    inRange ? speed < bodySpeed : dist > 700;
  const setBurn = (held: boolean) => {
    if (held !== burning) {
      burning = held;
      controls.burn(held);
    }
  };

  // steer at a world point, around any solid body in the way; returns how far off the nose it is
  const steerAt = (goal: Vec): number => {
    const ship = world.shipAbs();
    let aim: Vec = goal;
    const toGoal = sub(goal, ship);
    const range = len(toGoal);
    const heading = unit(toGoal);
    let nearest = Infinity;
    for (const poi of world.pois()) {
      if (!poi.solid) continue;
      const along = dot(sub(poi, ship), heading);
      if (along <= 0 || along >= range) continue;
      const closest = sub(add(ship, mul(heading, along)), poi);
      if (len(closest) >= poi.radius * 1.3 + 60 || along >= nearest) continue;
      nearest = along;
      const side = len(closest) > 1 ? unit(closest) : unit(cross(heading, { x: 0.3, y: 1, z: 0.2 }));
      aim = add(poi, mul(side, poi.radius * 1.7 + 120));
    }
    const { quaternion, fov, aspect } = world.attitude();
    const tan = Math.tan((fov * Math.PI) / 360);
    const local = toCamera(sub(aim, ship), quaternion);
    let mx: number;
    let my: number;
    if (local.z < 0) {
      mx = (local.x / (-local.z * tan * aspect)) * 2.4;
      my = (local.y / (-local.z * tan)) * 2.4;
    } else {
      const side = Math.hypot(local.x, local.y) || 1;
      mx = (local.x / side) * 2;
      my = (local.y / side) * 2;
    }
    controls.mouse(Math.max(-1, Math.min(1, mx)), Math.max(-1, Math.min(1, my)));
    return Math.acos(Math.max(-1, Math.min(1, -local.z / Math.max(1e-9, len(local)))));
  };

  return {
    target: () => targetName,
    step() {
      const state = world.state();
      if (state.phase !== 'survey') {
        setBurn(false);
        return;
      }
      const elapsed = 240 - state.timeLeft;

      if (plan.mode === 'listens') {
        const signal = state.signal;
        if (!signal) {
          // nothing ahead: turn to search, weaving up and down so the
          // sweep covers more than one plane, at cruise
          targetName = 'searching';
          controls.mouse(0.7, 0.6 * Math.sin(elapsed * 0.5));
          setBurn(false);
          return;
        }
        targetName = signal.id;
        // follow the tick round the reticle toward the signal
        const pull = Math.min(1, signal.offNose * 6);
        controls.mouse(Math.cos(signal.angle) * pull, Math.sin(signal.angle) * pull);
        const aimed = signal.offNose < 0.2;
        if (signal.id === 'passenger') {
          setBurn(aimed && keepPace(signal.dist, state.speed, state.bodySpeed, state.scanId === 'passenger'));
        } else {
          setBurn(aimed && state.scanId === null && keepBurning(signal.dist, signal.id, state.speed));
        }
        return;
      }

      // knows: the nearest unlogged find that answers now; if none, the one
      // that opens next, flown to and waited at
      const ship = world.shipAbs();
      const finds = world.finds().filter((f) => !f.logged);
      if (finds.length === 0) {
        setBurn(false);
        return;
      }
      const etaPenalty = (f: (typeof finds)[number]) => {
        const d = len(sub(f, ship));
        const travel = d / 3000;
        const opensIn = Math.max(0, f.opensAt - elapsed);
        // a find that closes before we could get there is out
        if (elapsed + travel > f.closesAt - 2) return Infinity;
        return Math.max(travel, opensIn) + d / 20000;
      };
      let pick = finds[0];
      for (const f of finds) if (etaPenalty(f) < etaPenalty(pick)) pick = f;
      targetName = pick.id;
      const goal: Vec = pick;
      const offNose = steerAt(goal);
      const d = len(sub(goal, ship));
      const aimed = offNose < 0.25;
      const waiting = !pick.open && d < 3000;
      if (waiting) {
        setBurn(false);
      } else if (pick.id === 'passenger') {
        setBurn(aimed && keepPace(d, state.speed, state.bodySpeed, state.scanId === 'passenger'));
      } else {
        setBurn(aimed && state.scanId === null && keepBurning(d, pick.id, state.speed));
      }
    },
  };
}

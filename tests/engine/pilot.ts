/**
 * Scripted play for EPHEMERIS: a pilot that flies a survey through the same
 * inputs a player has, a mouse for the stick and one held burn. It reads the
 * world from the sim's debug handle (where things are, what is scanned) and
 * decides two things per step: where the mouse goes and whether the burn is
 * down. No imports, so the same module runs under vitest and in a real page.
 *
 * It is a model of a competent hand, used to tune the survey's numbers. It
 * is not a hand: it knows every body's position at once and never hesitates.
 */

export interface PilotWorld {
  pois(): Array<{ name: string; x: number; y: number; z: number; radius: number; id: string; kind: string; solid: boolean; envelope: boolean }>;
  shipAbs(): { x: number; y: number; z: number };
  attitude(): { quaternion: { x: number; y: number; z: number; w: number }; fov: number; aspect: number };
  state(): {
    phase: string;
    fuel: number;
    scanned: string[];
    scanId: string | null;
    tooFast: boolean;
    speed: number;
  };
}

export interface PilotControls {
  /** Puts the mouse at this point of the game area, in NDC (x right, y up). */
  mouse(x: number, y: number): void;
  /** Presses or releases the burn. Called only when it changes. */
  burn(held: boolean): void;
}

export interface PilotPlan {
  /** Burn toward a target farther than this from its scan range (km). Infinity: never burn. */
  burnBeyond: number;
  /** Hold the burn all the time: the lazy hand. */
  holdBurn?: boolean;
  /** Kinds this pilot does not go for. */
  skip?: string[];
  /** Never leave the home system. */
  homeOnly?: boolean;
  /** Under this share of a tank, burn only on legs longer than `thriftBeyond` km. */
  thriftUnder?: number;
  thriftBeyond?: number;
  /** Never scan the home system: straight out. */
  outOnly?: boolean;
  /** Seconds between decisions, for whoever drives the pilot (0: every frame). */
  reaction?: number;
}

/** Scan range, as the rules have it (survey.ts `scanRange`): the pilot brakes for it. */
const scanRangeOf = (radius: number, kind: string, solid: boolean, envelope: boolean) =>
  !solid ? 0 : envelope ? radius * 4 : Math.max(150, Math.min(radius * 1.2, 1200), kind === 'comet' ? 800 : 0);

type Vec = { x: number; y: number; z: number };
const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec) => Math.hypot(a.x, a.y, a.z);
const unit = (a: Vec): Vec => mul(a, 1 / Math.max(1e-9, len(a)));
const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
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
  let targetId = '';
  let targetName = '';

  const setBurn = (held: boolean) => {
    if (held !== burning) {
      burning = held;
      controls.burn(held);
    }
  };

  return {
    target: () => targetName,
    step() {
      const state = world.state();
      if (state.phase !== 'survey') {
        setBurn(false);
        return;
      }
      const ship = world.shipAbs();
      const pois = world.pois();
      const scanned = new Set(state.scanned);

      // the target: the nearest unscanned body, kept until it is scanned
      // unless another comes a third closer
      let pick: (typeof pois)[number] | null = null;
      let pickDist = Infinity;
      let held: (typeof pois)[number] | null = null;
      let heldDist = Infinity;
      for (const poi of pois) {
        if (!poi.id || scanned.has(poi.id)) continue;
        if (plan.skip?.includes(poi.kind)) continue;
        if (plan.homeOnly && !poi.id.startsWith('home:')) continue;
        if (plan.outOnly && poi.id.startsWith('home:')) continue;
        const d = len(sub(poi, ship)) - poi.radius;
        if (poi.id === targetId) {
          held = poi;
          heldDist = d;
        }
        if (d < pickDist) {
          pick = poi;
          pickDist = d;
        }
      }
      if (held && heldDist < pickDist * 1.5) {
        pick = held;
        pickDist = heldDist;
      }

      const { quaternion, fov, aspect } = world.attitude();
      const tan = Math.tan((fov * Math.PI) / 360);

      if (!pick) {
        // nothing this pilot wants is in the streamed window: fly on
        targetId = '';
        targetName = 'nothing';
        controls.mouse(0, 0);
        setBurn(!!plan.holdBurn || (!plan.homeOnly && plan.burnBeyond < Infinity));
        return;
      }
      targetId = pick.id;
      targetName = pick.name;

      // aim at the target, or around the solid body that stands in the way
      let aim: Vec = pick;
      const toTarget = sub(pick, ship);
      const range = len(toTarget);
      const heading = unit(toTarget);
      let nearestBlock = Infinity;
      for (const poi of pois) {
        if (!poi.solid || poi.id === pick.id) continue;
        const toBody = sub(poi, ship);
        const along = dot(toBody, heading);
        if (along <= 0 || along >= range) continue;
        const closest = sub(add(ship, mul(heading, along)), poi);
        const clearance = poi.radius * 1.3 + 40;
        if (len(closest) >= clearance || along >= nearestBlock) continue;
        nearestBlock = along;
        // pass it on the side the line already leans to (any side if dead centre)
        const side = len(closest) > 1 ? unit(closest) : unit(cross(heading, { x: 0.3, y: 1, z: 0.2 }));
        aim = add(poi, mul(side, poi.radius * 1.7 + 80));
      }

      const local = toCamera(sub(aim, ship), quaternion);
      // the stick is proportional: lead a target in view so the turn finishes
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

      const offNose = Math.acos(Math.max(-1, Math.min(1, -local.z / Math.max(1e-9, len(local)))));
      const aimed = offNose < 0.3;
      const toRange = pickDist - scanRangeOf(pick.radius, pick.kind, pick.solid, pick.envelope);
      const beyond =
        plan.thriftUnder !== undefined && state.fuel < plan.thriftUnder
          ? (plan.thriftBeyond ?? 3000)
          : plan.burnBeyond;
      if (plan.holdBurn) {
        setBurn(true);
      } else if (pick.kind === 'comet') {
        // the comet is caught by keeping pace behind it, which takes the burn
        setBurn(aimed && plan.burnBeyond < Infinity);
      } else if (state.scanId !== null) {
        // in range: come off the burn and let the ring fill
        setBurn(false);
      } else {
        setBurn(aimed && toRange > beyond);
      }
    },
  };
}

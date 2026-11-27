import * as THREE from 'three';
import { buildFinds, clockOffsetFor, planFinds, type FindPlan, type Keepout } from 'components/ephemeris/finds';
import { createFlightInput } from 'components/ephemeris/flightInput';
import { formatDistance, placeMarker, type MarkerPlacement } from 'components/ephemeris/marker';
import {
  beginLoop,
  createLoop,
  darkness,
  daySchedule,
  discoveryRange,
  elapsedOf,
  FIND_IDS,
  findNote,
  FINDS,
  formatClock,
  isHeard,
  isOpen,
  isTold,
  listening,
  prefersCandidate,
  readLog,
  recordFind,
  resetLoop,
  signalStrength,
  stepLoop,
  TUNE,
  type ChartResult,
  type FindId,
  type Places,
  type Schedule,
  type StorageLike,
  type SurveySeed,
} from 'components/ephemeris/survey';
import {
  CRUISE_FOV,
  DECEL_RATE,
  easeUpVector,
  FORWARD,
  speedResponseRate,
  WORLD_UP,
} from 'engine/core/flight';
import { computeRebase } from 'engine/core/floatingOrigin';
import {
  BOOST_LIMIT_FACTOR,
  diffuseDrag,
  ENVELOPE_RADII,
  ENVELOPE_REARM_RADII,
  envelopeCap,
  speedLimit,
} from 'engine/core/motion';
import { mulberry32 } from 'engine/core/rng';
import { KIND_PRESETS } from 'engine/lod/displacement';
import { createLodManager, type LodBeacon, type LodBodyHandle } from 'engine/lod/lodManager';
import {
  FLAT_FLOOR_RADII,
  FLOOR_PROBE_RADII,
  makeSurfaceFloor,
  type SurfaceFloor,
} from 'engine/lod/surfaceFloor';
import { createDustField } from 'engine/render/dust';
import { createFlightRig } from 'engine/render/flightRig';
import { applyQuality, createStage } from 'engine/render/stage';
import { createStarfield } from 'engine/render/starfield';
import { attachStatsOverlay } from 'engine/render/statsOverlay';
import {
  buildHomeSystem,
  homeLayout,
  peekSectorBeacon,
  TRUE_SCALE,
  type Poi,
  type SectorContent,
} from 'engine/world/sectorContent';
import { createSectorField } from 'engine/world/sectors';

export interface EphemerisHudElements {
  /** Name of the nearest body, e.g. "VELORA-3". */
  body: HTMLElement;
  /** Distance line, e.g. "142 km · APPROACH". */
  dist: HTMLElement;
  /** Ship speed, e.g. "550 km/s". */
  speed: HTMLElement;
  /** Current sector, e.g. "KHEVEL EXPANSE · 2.0.-1". */
  sector: HTMLElement;
  /** "LOG 2/5" in a loop; in FREE DRIFT the discovery tally, e.g. "5 CONTACTS LOGGED". */
  contacts: HTMLElement;
  /** Transient banner (a find logged, a new signal, the dark); the sim drives its opacity. */
  ping: HTMLElement;
  /** "LOOP 2". */
  loop: HTMLElement;
  /** Loop clock, e.g. "3:42". */
  clock: HTMLElement;
  /** The reticle at screen centre; the sim drives its opacity. */
  scan: HTMLElement;
  /** The reticle's progress arc: any element whose `stroke-dashoffset` runs 100 (empty) to 0 (full). */
  scanArc: HTMLElement | SVGElement;
  /** A tick on the reticle toward the signal; the sim drives its rotation and opacity. */
  scanTick: HTMLElement;
  /** Line under the reticle: the signal, the scan, or what to do. */
  scanLabel: HTMLElement;
  /** Bracket on a find the ship is pointed at; the sim drives its transform and opacity. */
  marker: HTMLElement;
  /** The bracket's glyph. */
  markerGlyph: HTMLElement;
  /** The find's name and distance on two lines, e.g. "RELAY" over "1420 km". */
  markerLabel: HTMLElement;
  /** Full-screen layer for the dark; the sim drives its `--dark` (0..1). */
  dark: HTMLElement;
}

/**
 * - `title`: the world drifts behind the title screen; any press starts a loop.
 * - `survey`: the four-minute loop.
 * - `closed`: the loop is over (the dark came in, or the log is complete);
 *   any press after the lock starts the next loop.
 * - `drift`: FREE DRIFT, the experience as it was before the loop: no clock,
 *   no dark, contacts logged on first approach.
 */
export type EphemerisPhase = 'title' | 'survey' | 'closed' | 'drift';

/** What the end screen shows. */
export interface SurveyResult {
  /** Which loop of the day's log this was. */
  loop: number;
  /** Finds logged in this loop. */
  loggedNow: FindId[];
  /** Finds logged today, this loop included. */
  logged: FindId[];
  /** Set when this loop completed the log. */
  charted: ChartResult | null;
}

export interface EphemerisOptions {
  /** The system to fly. Default: a new random one per mount. */
  seed?: SurveySeed;
  /** Where the day's log is kept. Default: nowhere. */
  storage?: StorageLike | null;
  /** The BURN zone for the second thumb on a phone (see createFlightInput). */
  burnZone?: HTMLElement | null;
  /** Phase changes, with the result when a loop ends. Not called per frame. */
  onPhase?: (phase: EphemerisPhase, result: SurveyResult | null) => void;
}

export interface EphemerisGame {
  /** Starts a loop (from the same start, every time) or FREE DRIFT (from the spawn, the world clock running). */
  start(mode: 'survey' | 'drift'): void;
  /** Back to the title screen. A loop in flight is abandoned; finds it logged stay logged. */
  menu(): void;
  /** Names of the places the finds' notes point at. */
  places: Places;
  /** When each find answers, this day. */
  schedule: Schedule;
  /** Stops the loop, removes listeners and frees all GPU resources. */
  dispose(): void;
}

/**
 * Edge length of one cubic sector of procedural space (1 unit = 1 km).
 * Doubled from 6,000 (plan Phase 3.5) after the true-scale playtest read as
 * crowded: one archetype per cell, so bigger cells mean sparser space by
 * design — formation probability is deliberately NOT raised. Content sizes
 * are grid-independent, so every cell-budget margin doubles (offset
 * ±0.25·SECTOR = ±3000, eviction line 1.5·SECTOR = 18,000 vs a worst-case
 * mini-system reach of 3000 + 3880 + 180 = 7060). The dust wrap span
 * (2 × 500 = 1000) divides 12,000 exactly, as the rebase math requires.
 */
const SECTOR = 12000;
/**
 * Budgeted true scale: the per-archetype multipliers this experience feeds
 * the shared sector builders and the home system (rogues ×6 up to radius
 * 960, mini-systems ×2, home ×2 — the cell-fit arithmetic lives with
 * TRUE_SCALE and in the builders). Fog-wall check at the new top radius
 * 960: the envelope/atmosphere band engages at 4r = 3840, clouds at
 * 2r = 1920, graticule at 0.8r = 768 — all far inside the 14,400-unit
 * swell clamp (SCALE_RAMP_FAR_MAX_DISTANCE) and the ~36,000-unit fog wall,
 * so no cue ever fades in past visibility. envelopeCap at these radii
 * (2.5·0.35·960 = 840 u/s at a max rogue, 700 at the 800 home sun) sits
 * above the 100 u/s cruise, so at cruise the arrival ritual is HUD-first;
 * the cap only BINDS — is felt — under boost. Design-accepted: slow-cruise
 * pacing (review decision W2).
 */
const WORLD_SCALE = TRUE_SCALE;
/** Derived home dimensions (orbits, worst-case extent) at the home scale. */
const HOME_LAYOUT = homeLayout(WORLD_SCALE.home);
/** Sectors are kept alive within this many cells of the ship (1 → 3×3×3). */
const ACTIVE_RANGE = 1;
/**
 * Sectors beyond the streamed window still show as far-contact beacon dots
 * out to this Chebyshev cell range (peeked, zero geometry built). At
 * 12,000-unit cells, range 2 puts the farthest beacon cell centres at
 * 24,000·√3 ≈ 41,600 on the diagonal — the same physical distance the old
 * range-4 shell had at 6,000 cells, and inside the 60,000 far plane (range
 * 4 would sit at ~83,000 and clip). Fewer candidate cells (98 vs 704) is
 * the sparser-space goal, not a regression.
 */
const BEACON_RANGE = 2;
/**
 * Open-space cruise speed. Deliberately slow — cruise is for drifting and
 * looking around; covering distance is what the boost burn is for.
 */
const CRUISE_SPEED = 100;
const BOOST_FACTOR = 40;
/** The HUD flags "APPROACH" inside this surface distance. */
const approachRange = (radius: number) => Math.max(60, radius * 0.5);
/** Points in the home comet's trail (engine/world/sectorContent builds it). */
const COMET_TRAIL = 70;
/** The clock blinks through its last seconds. */
const CLOCK_WARN_SECONDS = 20;
/** Fog density of the world, and what the dark thickens it to at the end of a loop. */
const FOG_DENSITY = 0.000055;
const FOG_DARK = 0.0006;
/** Starfield opacity (createStarfield below), faded out by the dark. */
const STAR_OPACITY = 0.55;
/** Cells in the signal meter under the reticle. */
const SIGNAL_CELLS = 8;
/**
 * The bracket on a find shows once the ship points at it this well, or once
 * it is this close: a lock, not a marker on everything.
 */
const LOCK_STRENGTH = 0.75;
const LOCK_DISTANCE = 3000;
/**
 * How far the ship coasts, off the burn, from `speed` down to scan speed:
 * the flight law eases speed toward cruise at DECEL_RATE (about 3,000 km
 * from a full burn). The readout says to come off the burn when a find is
 * this close, plus a margin to react.
 */
const brakingDistance = (speed: number) => {
  const excess = speed - CRUISE_SPEED;
  const goal = TUNE.SCAN_MAX_SPEED - CRUISE_SPEED;
  if (excess <= goal) return 0;
  const seconds = Math.log(excess / goal) / DECEL_RATE;
  return (excess - goal) / DECEL_RATE + CRUISE_SPEED * seconds;
};
const BRAKE_MARGIN = 1500;
/** The passenger rides this far above the comet's centre (the comet's radius is 54). */
const PASSENGER_LIFT = 70;

/**
 * Mounts the EPHEMERIS solar-system simulation into `container` and starts
 * its render loop. The world opens drifting behind a title screen; the
 * returned handle starts a survey or FREE DRIFT and disposes the mount.
 *
 * The loop's rules (clock, finds and their windows, signal strength, the
 * scan, the dark, the day's log) live in components/ephemeris/survey and know
 * nothing of this file. Here they are fed what the sim measures: which find
 * is in range, how fast the ship is going past it, where the nose points.
 *
 * Space is truly unbounded: ship physics run in JS doubles as absolute
 * position = floating origin + render-local position, and the whole scene is
 * rebased by exact sector multiples whenever the ship strays more than a
 * sector from the render origin (engine/core/floatingOrigin) — render
 * coordinates stay float32-small forever, with no 45,000-unit range cap.
 * Beyond the hand-authored home system, every sector deterministically
 * generates its own content (asteroid clusters, nebulae, rogue planets,
 * minor star systems, pulsars, derelicts…) from its absolute coordinates.
 *
 * Max speed is proportional to the distance to the nearest SOLID surface
 * (engine/core/motion), so deep-space hops stay quick while planetary
 * approaches decelerate into a controlled, seamless surface skim — and a
 * soft altitude floor pushes the ship out gently instead of ever crashing.
 * The cap is direction-aware (pointing away from a body lifts it, so
 * leaving is never a grind) and boosting punches through it. Crossing into
 * a solid body's atmospheric envelope announces itself on the HUD with a
 * felt speed step; diffuse formations (nebulae, clusters, swarms) are
 * enterable — no floor, no cap, just a gentle drag inside the volume.
 *
 * The sim owns its canvas; HUD text is written into the provided elements so
 * the caller controls layout/styling without re-rendering per frame.
 */
export function createEphemeris(
  container: HTMLElement,
  hud: EphemerisHudElements,
  options: EphemerisOptions = {},
): EphemerisGame {
  // log depth: near 0.5 / far 60,000 spans five distance decades with nested
  // nested LOD + skim-band shells — a linear z-buffer would z-fight them.
  // far covers the beacon-dot shell (BEACON_RANGE sectors on the diagonal).
  // Gentle exp2 fog gives far content the DEEP FIELD emergence — geometry
  // fades up from black over the ~24k → 6k approach band instead of popping
  // (density halved with the doubled SECTOR so the band tracks the doubled
  // stream-in distance: transmittance ~0.18 at 24,000, ~0.02 by 36,000 —
  // the same proportions the old 0.00011 had at 12,000/18,000).
  // Far *contacts* stay visible regardless: the LOD dot/beacon layers and
  // the starfield are fog-free, so fog shapes emergence, not awareness.
  const stage = createStage(container, {
    fov: CRUISE_FOV,
    near: 0.5,
    far: 60000,
    logDepth: true,
    fogDensity: 0.000055,
  });
  const { scene, camera, tracker } = stage;

  // One system per seed: the page passes the UTC day (or `?seed=`), so a
  // best score is a best in a system that can be flown again.
  const randomSeed = Math.floor(Math.random() * 2 ** 31);
  const { seed: worldSeed, label: seedLabel } =
    options.seed ?? { seed: randomSeed, label: String(randomSeed) };
  const storage = options.storage ?? null;

  // ---- LOD ladder for planets/stars (screen-space rungs, cross-dissolve) ----
  // surfaceHaze: skimming a body fades its far limb; surfaceShells: skim-band
  // graticule + drifting clouds on planets (both Ephemeris-only cues)
  const lod = createLodManager(scene, { jobBudgetMs: 3, surfaceHaze: true, surfaceShells: true });

  // ---- the home system (permanent, at absolute (0,0,0)) ----
  const home = buildHomeSystem(mulberry32(worldSeed ^ 0x5eed), WORLD_SCALE.home);
  home.pois.forEach((poi, i) => { poi.id = `home:${i}`; });
  scene.add(home.group);
  home.group.updateMatrixWorld(true);
  home.lodBodies.forEach((body) => lod.register(body));

  const scratchFind = new THREE.Vector3();
  // stars — attached to the ship's position each frame so the backdrop is
  // infinite (they only rotate with the camera, never translate past you);
  // the 20–40k shell spans the beacon band, inside the far plane
  const stars = createStarfield({ count: 800, minRadius: 20000, spread: 20000, size: 26, opacity: 0.55, fog: false });
  tracker.track(stars.geometry);
  tracker.track(stars.material);
  scene.add(stars);

  // local dust — tiny soft points recycled around the ship so speed is
  // visible even in the emptiest stretch of space. The wrap span (2 × range
  // = 1,000) must divide SECTOR exactly (12,000 / 1,000 = 12 ✓), or a
  // floating-origin rebase would teleport every particle by the remainder
  // (e.g. a 900-unit span leaves 12,000 % 900 = 300 — a visible pop).
  const dust = tracker.track(createDustField({ count: 260, range: 500, size: 3, opacity: 0.35 }));
  scene.add(dust.points);

  // ---- procedural sectors ----
  // The home system spans these cells; they get no random content. At the
  // 12,000-unit grid, cells -1..1 guarantee reserved space to ±12,000 per
  // axis (cell 1 spans 12,000–24,000) — the home layout's hard wall
  // (homeLayout: max extent ~11,037 at ×2) and the spawn point (z ≈ 13,437,
  // cell 1) both sit inside. y keeps ±1 — its old generosity.
  const isHomeCell = (x: number, y: number, z: number) =>
    x >= -1 && x <= 1 && z >= -1 && z <= 1 && y >= -1 && y <= 1;

  const lodHandles = new Map<SectorContent, LodBodyHandle[]>();
  const field = createSectorField(scene, {
    worldSeed,
    sectorSize: SECTOR,
    activeRange: ACTIVE_RANGE,
    reserved: isHomeCell,
    contentScale: WORLD_SCALE,
    // new sectors emerge from black (fog covers the distance ramp; this
    // covers builds that land inside the visible band)
    revealSeconds: 1.4,
    onContentAdded: (content) => {
      lodHandles.set(content, content.lodBodies.map((body) => lod.register(body)));
    },
    onContentRemoved: (content) => {
      lodHandles.get(content)?.forEach((handle) => lod.unregister(handle));
      lodHandles.delete(content);
    },
  });
  // the floating origin lives in the field; absolute = origin + render-local
  const origin = field.origin();

  // dev-only perf panel (backquote toggles; `?stats` shows it immediately)
  const stats = attachStatsOverlay(container, stage, {
    getExtra: () => [`SECTORS ${field.activeCount()}`, `LOD BODIES ${lod.bodyCount()}`],
  });

  // far-contact beacons: sectors outside the streamed window peeked as dots;
  // refreshed when the ship crosses a cell boundary (or the origin moves —
  // dot positions are render-local)
  let beaconCellKey = '';
  const refreshBeacons = () => {
    const cell = field.currentCell();
    if (cell.key === beaconCellKey) return;
    beaconCellKey = cell.key;
    const beacons: LodBeacon[] = [];
    for (let dx = -BEACON_RANGE; dx <= BEACON_RANGE; dx++) {
      for (let dy = -BEACON_RANGE; dy <= BEACON_RANGE; dy++) {
        for (let dz = -BEACON_RANGE; dz <= BEACON_RANGE; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) <= ACTIVE_RANGE) continue;
          const x = cell.x + dx;
          const y = cell.y + dy;
          const z = cell.z + dz;
          if (isHomeCell(x, y, z)) continue;
          const beacon = peekSectorBeacon(x, y, z, worldSeed, SECTOR);
          beacons.push({
            x: beacon.x - origin.x,
            y: beacon.y - origin.y,
            z: beacon.z - origin.z,
            brightness: beacon.brightness,
          });
        }
      }
    }
    lod.setBeacons(beacons);
  };

  // ---- ship + virtual chase camera (engine/render/flightRig) ----
  const rig = createFlightRig(tracker);
  const { ship } = rig;
  // spawn just outside the home system: past the outermost planet's deepest
  // moon reach, with the same ~2,400-unit clearance the pre-scale layout
  // had (extent 9,591 → spawn 12,000; at home ×2, extent ~11,037 → ~13,437)
  const SPAWN = new THREE.Vector3(0, 340 * WORLD_SCALE.home, HOME_LAYOUT.maxExtent + 2400);
  // slight spawn tilt: the pitch −0.04 forward direction
  const SPAWN_HEADING = new THREE.Vector3(0, -Math.sin(0.04), -Math.cos(0.04));
  ship.position.copy(SPAWN);
  scene.add(ship);

  // ---- the day's finds (components/ephemeris/finds) ----
  // The late light keeps clear of the planets that cross the belt; planets
  // move a few kilometres a second, so where they are at the start is where
  // they are all loop.
  const beltRadius = 4700 * HOME_LAYOUT.orbitStretch;
  // the world's clock starts where the seed says, so the comet does too;
  // laying the trail down that many times puts it all on the comet
  const clockOffset = clockOffsetFor(worldSeed);
  const setWorldClock = () => {
    for (let i = 0; i < COMET_TRAIL; i++) home.update?.(0, clockOffset);
    home.group.updateMatrixWorld(true);
  };
  setWorldClock();
  const keepouts: Keepout[] = home.pois.map((poi) => {
    poi.object.getWorldPosition(scratchFind);
    return { x: scratchFind.x, z: scratchFind.z, reach: poi.radius * (1 + HOME_LAYOUT.moonReachRadii) + 200 };
  });
  const plan: FindPlan = planFinds(worldSeed, SECTOR, SPAWN, SPAWN_HEADING, beltRadius, keepouts);
  const finds = buildFinds(tracker);
  // parented to the home group, the finds ride the floating origin with it
  const findGroup = new THREE.Group();
  for (const id of ['relay', 'wreck', 'bell', 'light'] as const) {
    finds.groups[id].position.set(plan[id].x, plan[id].y, plan[id].z);
  }
  for (const id of FIND_IDS) findGroup.add(finds.groups[id]);
  home.group.add(findGroup);
  // the passenger rides the comet: the home system's last POI
  const comet = home.pois.find((poi) => poi.name === 'THE COMET')!.object;
  const placePassenger = () => {
    finds.groups.passenger.position.copy(comet.position);
    finds.groups.passenger.position.y += PASSENGER_LIFT;
  };
  placePassenger();
  home.group.updateMatrixWorld(true);

  // ---- phase ----
  let phase: EphemerisPhase = 'title';
  // seconds of the end screen's input lock still to run
  let lockTimer = 0;
  // Clock of the world's own motion (orbits, the comet). The stage's clock
  // only ever runs forward; this one goes back to zero with every loop, so
  // each attempt at a system finds its bodies where the last one did.
  let worldTime = clockOffset;
  const schedule = daySchedule(worldSeed);
  const loop = createLoop(readLog(storage, seedLabel).logged, schedule);
  let loopNumber = 0;

  // ---- input (components/ephemeris/flightInput) ----
  const input = createFlightInput(container, {
    burnZone: options.burnZone,
    onPress: () => {
      if (phase === 'title') {
        start('survey');
        return true;
      }
      if (phase === 'closed') {
        // presses during the lock are swallowed: the hand that was burning
        // when the window closed must not skip the result
        if (lockTimer <= 0) start('survey');
        return true;
      }
      return false;
    },
    onEscape: () => menu(),
  });

  // ---- HUD (write only on change; per-frame DOM writes cause layout churn) ----
  const hudCache = new Map<HTMLElement, string>();
  const setHudText = (el: HTMLElement, text: string) => {
    if (hudCache.get(el) !== text) {
      hudCache.set(el, text);
      el.textContent = text;
    }
  };
  // The same rule for the inline styles the sim drives. One cached property
  // per element (opacity, width, the arc's offset); the marker's transform
  // changes every frame it is shown and is written directly.
  const styleCache = new Map<Element, string>();
  const setHudStyle = (el: HTMLElement | SVGElement, property: string, value: string) => {
    if (styleCache.get(el) !== value) {
      styleCache.set(el, value);
      el.style.setProperty(property, value);
    }
  };
  // blinking is CSS, switched by an attribute the page styles
  const setHudWarn = (el: HTMLElement, warn: boolean) => {
    const value = warn ? 'on' : 'off';
    if (el.dataset.warn !== value) el.dataset.warn = value;
  };

  // ---- discovery ----
  // Keyed by stable POI id so re-entering a rebuilt sector doesn't re-log
  // (POI ids are deterministic per sector rebuild).
  const discoveredIds = new Set<string>();
  let pingTimer = 0;
  // readout strings rebuild at 10 Hz, not per frame — template literals every
  // frame are steady garbage, and a 60 Hz distance readout is unreadable
  let hudTimer = 0;
  setHudText(hud.contacts, '0 CONTACTS LOGGED');

  // ---- the loop ----
  // Where each find is this frame, render-local (the passenger moves).
  const findPos: Record<FindId, THREE.Vector3> = {
    relay: new THREE.Vector3(),
    wreck: new THREE.Vector3(),
    bell: new THREE.Vector3(),
    passenger: new THREE.Vector3(),
    light: new THREE.Vector3(),
  };
  // the find in range and slow enough to scan, and the strongest signal
  let pick: FindId | null = null;
  let pickDist = Infinity;
  const signal = { id: null as FindId | null, strength: 0, dist: Infinity, offNose: 0 };
  // how many finds can be heard from here at all, ahead or not
  let heard = 0;
  // Where the find being scanned was a frame ago, in absolute coordinates
  // (a rebase must not read as motion): its velocity is what the ship's
  // speed is measured against. Every find is at rest but the passenger.
  const scanPrev = new THREE.Vector3();
  let scanPrevId = '';
  const bodyVelocity = new THREE.Vector3();
  // one-shot pings of the loop's set times
  let bellAnnounced = false;
  let darkAnnounced = false;
  const marker: MarkerPlacement = { x: 0, y: 0, onScreen: false, angle: 0 };
  const cameraInverse = new THREE.Quaternion();
  const markerPos = new THREE.Vector3();
  let locked = false;

  // Nearest bodies of the last completed HUD pass (one frame stale —
  // <50 units at max speed). `nearest` spans BOTH kinds and drives the HUD;
  // `nearestSolid` drives the speed law, the arrival ritual and the soft
  // altitude floor — a nebula must never wall the ship out. `dragFactor` is
  // the deepest diffuse-volume drag the pass found (1 in open space).
  const nearest = { name: '', dist: Infinity, radius: 0 };
  const nearestSolid = {
    name: '',
    id: '',
    envelope: false,
    dist: Infinity,
    radius: 0,
    center: new THREE.Vector3(),
    // the POI's LOD registration + anchor, for the terrain-following floor
    // (null → no displacement field → flat floor)
    lod: null as Poi['lod'] | null,
    anchor: null as THREE.Object3D | null,
  };
  let dragFactor = 1;
  // Floor sampler for the CURRENT nearest solid body — the only body whose
  // floor can engage — rebuilt when the nearest id changes. Pure and
  // deterministic (seed + kind + radius), so an evicted-and-rebuilt body
  // resolves the identical floor.
  let floorSamplerId = '';
  let floorSampler: SurfaceFloor | null = null;
  // Arrival-ritual one-shots, PER BODY: announced id → that body's own d/r
  // from the latest scan. An id re-arms (leaves the map) only once ITS OWN
  // distance passes ENVELOPE_REARM_RADII — never another body's — so
  // touring overlapping envelopes can't ping-pong announcements. Checked in
  // the 10 Hz HUD pass; a value left at Infinity there means the POI is no
  // longer scanned (sector eviction) and re-arms too.
  const envelopeAnnounced = new Map<string, number>();
  const poiPos = new THREE.Vector3();
  const considerPoi = (poi: Poi) => {
    poiPos.setFromMatrixPosition(poi.object.matrixWorld);
    const d = ship.position.distanceTo(poiPos) - poi.radius;
    if (d < nearest.dist) {
      nearest.dist = d;
      nearest.name = poi.name;
      nearest.radius = poi.radius;
    }
    if (poi.solid) {
      const id = poi.id ?? poi.name;
      // refresh the ritual's per-body re-arm distance while announced
      if (envelopeAnnounced.has(id)) envelopeAnnounced.set(id, d / poi.radius);
      if (d < nearestSolid.dist) {
        nearestSolid.dist = d;
        nearestSolid.name = poi.name;
        nearestSolid.id = id;
        nearestSolid.envelope = poi.envelope ?? true;
        nearestSolid.radius = poi.radius;
        nearestSolid.center.copy(poiPos);
        nearestSolid.lod = poi.lod ?? null;
        nearestSolid.anchor = poi.object;
      }
    } else if (d < 0) {
      // inside a diffuse volume — the deepest overlapping one sets the drag
      dragFactor = Math.min(dragFactor, diffuseDrag(d, poi.radius));
    }
    // FREE DRIFT: the first close approach logs the contact, as it always did
    if (phase === 'drift' && poi.id && d < discoveryRange(poi.radius) && !discoveredIds.has(poi.id)) {
      discoveredIds.add(poi.id);
      pingTimer = 4;
      setHudText(hud.ping, `NEW CONTACT · ${poi.name}`);
      setHudText(hud.contacts, `${discoveredIds.size} CONTACT${discoveredIds.size === 1 ? '' : 'S'} LOGGED`);
    }
  };

  // ---- phase changes ----
  // The dark belongs to the loop: anything else is lit as it always was.
  const setDark = (amount: number) => {
    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) fog.density = FOG_DENSITY + (FOG_DARK - FOG_DENSITY) * amount;
    stars.material.opacity = STAR_OPACITY * (1 - amount);
    setHudStyle(hud.dark, '--dark', amount.toFixed(3));
  };

  const setPhase = (next: EphemerisPhase, result: SurveyResult | null = null) => {
    phase = next;
    // whatever was held belongs to the phase that just ended
    input.release();
    hudTimer = 0; // the readouts of the new phase show on its first frame
    pingTimer = 0;
    hud.ping.style.opacity = '0';
    setHudStyle(hud.scan, 'opacity', '0');
    setHudStyle(hud.scanTick, 'opacity', '0');
    setHudStyle(hud.marker, 'opacity', '0');
    // the finds are part of the loop's world; FREE DRIFT is the world as it was
    findGroup.visible = next !== 'drift';
    if (next !== 'closed') setDark(0);
    options.onPhase?.(next, result);
  };

  // Puts the ship at ABSOLUTE coordinates: re-anchors the floating origin at
  // the containing cell corner, keeps the ship at the render-local remainder
  // and shifts every render-local root. With a look target the chase pose is
  // re-seeded, converged, so there is no swoop.
  const placeShip = (x: number, y: number, z: number, look?: THREE.Vector3) => {
    rebase.set(
      Math.floor(x / SECTOR) * SECTOR - origin.x,
      Math.floor(y / SECTOR) * SECTOR - origin.y,
      Math.floor(z / SECTOR) * SECTOR - origin.z,
    );
    if (rebase.lengthSq() > 0) {
      // keep the chase pose — no cross-sector swoop. The rig shifts the
      // virtual pose (ship.position is rewritten just below anyway); the
      // real camera shifts too so it stays the pose's mirror mid-warp.
      rig.applyRebase(rebase);
      camera.position.sub(rebase);
      home.group.position.sub(rebase);
      home.group.updateMatrixWorld(true);
      field.applyOriginShift(rebase);
      beaconCellKey = '';
    }
    ship.position.set(x - origin.x, y - origin.y, z - origin.z);
    velocity.set(0, 0, 0);
    envelopeAnnounced.clear(); // a jump is not an approach — start re-armed
    if (look) {
      rig.seed(scratch.copy(look).sub(scratch2.set(x, y, z)).normalize());
      camera.position.copy(rig.pose.position);
      camera.quaternion.copy(rig.pose.quaternion);
    }
    field.sync(shipAbs.copy(ship.position).add(origin), true);
  };

  function start(mode: 'survey' | 'drift') {
    if (disposed) return;
    discoveredIds.clear();
    // Every flight starts where the page always started: the ship at the
    // spawn point on the spawn heading, level and at rest. (Behind the title
    // and the end screen it has been cruising on with no hand on it.)
    rig.levelUp.copy(WORLD_UP);
    rig.shipBody.rotation.z = 0;
    placeShip(SPAWN.x, SPAWN.y, SPAWN.z, scratch3.copy(SPAWN).add(SPAWN_HEADING));
    if (mode === 'survey') {
      // and a loop finds the world as the last one did: its clock goes back
      // to zero, so the bodies, the comet and its passenger are where they were
      const log = beginLoop(storage, seedLabel);
      loopNumber = log.loops;
      resetLoop(loop, log.logged);
      scanPrevId = '';
      bellAnnounced = darkAnnounced = false;
      worldTime = clockOffset;
      // the orbiters read the clock, so move them now: the first frame must
      // not see the last loop's positions (the comet drags a trail of its
      // last COMET_TRAIL positions; that many steps lay the whole trail back
      // on the comet, as on a fresh mount, so no line crosses the system)
      setWorldClock();
      field.updateContents(0, clockOffset);
      placePassenger();
      finds.update(0, 0, 0);
      scene.updateMatrixWorld(true);
      setHudText(hud.contacts, `LOG ${loop.logged.size}/${FIND_IDS.length}`);
      setHudText(hud.loop, `LOOP ${loopNumber}`);
    } else {
      setHudText(hud.contacts, '0 CONTACTS LOGGED');
    }
    setPhase(mode);
  }

  function menu() {
    if (disposed || phase === 'title') return;
    setPhase('title');
  }

  // ---- the loop, per frame ----
  // Hands the rules this frame's facts and puts what they decide on the HUD.
  const stepLoopFrame = (dt: number) => {
    const elapsed = elapsedOf(loop);
    for (const id of FIND_IDS) finds.groups[id].getWorldPosition(findPos[id]);

    // (getWorldPosition brings the matrices up to date: these are this
    // frame's positions, after the world update, so the passenger's step
    // between two samples took this frame's dt)

    // which find is in range to scan; which signal is strongest ahead
    forward.copy(FORWARD).applyQuaternion(ship.quaternion);
    pick = null;
    pickDist = Infinity;
    signal.id = null;
    signal.strength = 0;
    heard = 0;
    for (const id of listening(loop)) {
      scratchFind.copy(findPos[id]).sub(ship.position);
      const d = scratchFind.length();
      if (d < FINDS[id].range && prefersCandidate(loop.scanId, pick, pickDist, id, d)) {
        pick = id;
        pickDist = d;
      }
      if (!isHeard(loop, id, d)) continue;
      heard += 1;
      const offNose = d > 1e-6 ? Math.acos(Math.max(-1, Math.min(1, forward.dot(scratchFind) / d))) : 0;
      const strength = signalStrength(offNose, d);
      if (strength > signal.strength) {
        signal.id = id;
        signal.strength = strength;
        signal.dist = d;
        signal.offNose = offNose;
      }
    }

    // the find's own velocity, from where it was a frame ago
    bodyVelocity.set(0, 0, 0);
    if (pick) {
      scratch.copy(findPos[pick]).add(origin);
      if (scanPrevId === pick && dt > 0) {
        bodyVelocity.copy(scratch).sub(scanPrev).divideScalar(dt);
      }
      scanPrev.copy(scratch);
      scanPrevId = pick;
    } else {
      scanPrevId = '';
    }
    const logged = stepLoop(loop, dt, {
      speed: scratch.copy(velocity).sub(bodyVelocity).length(),
      candidate: pick,
    });

    if (logged) {
      const charted = recordFind(storage, seedLabel, logged);
      pingTimer = 5;
      setHudText(hud.ping, `${FINDS[logged].label} LOGGED · ${findNote(logged, plan.places, schedule)}`);
      setHudText(hud.contacts, `LOG ${loop.logged.size}/${FIND_IDS.length}`);
      if (loop.closed) {
        closeLoop(charted);
        return;
      }
    }
    if (loop.closed) {
      closeLoop(null);
      return;
    }

    // the set times: a signal that starts mid-loop, and the dark
    if (!bellAnnounced && elapsed >= schedule.bell[0] && !loop.logged.has('bell')) {
      bellAnnounced = true;
      pingTimer = 4;
      // told of it, the bell can be followed; not, it is something to look for
      setHudText(hud.ping, isTold(loop, 'bell') ? 'THE BELL IS ANSWERING' : 'SOMETHING FAR OFF IS ANSWERING');
    }
    if (!darkAnnounced && elapsed >= TUNE.DARK_STARTS) {
      darkAnnounced = true;
      pingTimer = 4;
      setHudText(hud.ping, 'THE DARK IS COMING IN');
    }
    setDark(darkness(elapsed));
  };

  const closeLoop = (charted: ChartResult | null) => {
    lockTimer = TUNE.RETRY_LOCK_SECONDS;
    setHudText(hud.clock, formatClock(loop.timeLeft));
    setPhase('closed', {
      loop: loopNumber,
      loggedNow: [...loop.loggedNow],
      logged: FIND_IDS.filter((id) => loop.logged.has(id)),
      charted,
    });
    // the end screen sits in the dark, or in the light of a charted system
    setDark(loop.charted ? 0 : 1);
  };

  // The 10 Hz readouts of a loop: clock and the line under the reticle.
  const writeLoopReadouts = () => {
    setHudText(hud.clock, formatClock(loop.timeLeft));
    setHudWarn(hud.clock, loop.timeLeft <= CLOCK_WARN_SECONDS);
    const speed = velocity.length();
    let line: string;
    if (loop.scanId) {
      // a moving find (the passenger) is matched, not stopped at: say which way
      const chasing = bodyVelocity.lengthSq() > 1;
      line = !loop.tooFast
        ? `LOGGING · ${FINDS[loop.scanId].label}`
        : chasing && velocity.dot(bodyVelocity) < bodyVelocity.lengthSq()
          ? 'TOO SLOW · BURN TO KEEP PACE'
          : 'TOO FAST · COME OFF THE BURN';
    } else if (signal.id) {
      const cells = Math.max(1, Math.round(signal.strength * SIGNAL_CELLS));
      const bars = '▮'.repeat(cells) + '▯'.repeat(SIGNAL_CELLS - cells);
      const brake =
        signal.id !== 'passenger' && signal.dist - FINDS[signal.id].range < brakingDistance(speed) + BRAKE_MARGIN
          ? ' · COME OFF THE BURN'
          : '';
      line = `${FINDS[signal.id].label} ${bars} ${formatDistance(signal.dist)}${brake}`;
    } else if (heard > 0) {
      line = 'NO SIGNAL AHEAD · TURN TO SEARCH';
    } else {
      line = 'SILENCE';
    }
    setHudText(hud.scanLabel, line);
    // the bracket is the find's place; the line over the reticle already names it
    setHudText(hud.markerLabel, '');
  };

  // Per frame, on the settled camera: the reticle, its tick toward the
  // signal, and the bracket on a find the ship is locked on.
  const drawReticle = () => {
    setHudStyle(hud.scan, 'opacity', '1');
    setHudStyle(hud.scanArc, 'stroke-dashoffset', (100 - loop.scanProgress * 100).toFixed(1));
    const id = signal.id;
    if (!id || loop.scanId) {
      setHudStyle(hud.scanTick, 'opacity', '0');
      setHudStyle(hud.marker, 'opacity', '0');
      locked = false;
      return;
    }
    markerPos
      .copy(findPos[id])
      .sub(camera.position)
      .applyQuaternion(cameraInverse.copy(camera.quaternion).invert());
    const width = container.clientWidth;
    const height = container.clientHeight;
    placeMarker(
      marker,
      markerPos.x,
      markerPos.y,
      markerPos.z,
      Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2),
      width / Math.max(1, height),
      0.9,
      0.9,
    );
    // the tick: which way round the reticle the signal is, as strong as it reads
    setHudStyle(hud.scanTick, 'opacity', (0.25 + 0.75 * signal.strength).toFixed(2));
    hud.scanTick.style.transform = `rotate(${(-marker.angle).toFixed(3)}rad)`;
    locked = marker.onScreen && (signal.strength >= LOCK_STRENGTH || signal.dist < LOCK_DISTANCE);
    if (!locked) {
      setHudStyle(hud.marker, 'opacity', '0');
      return;
    }
    setHudStyle(hud.marker, 'opacity', '1');
    hud.marker.style.transform =
      `translate(${((marker.x * 0.5 + 0.5) * width).toFixed(1)}px, ${((0.5 - marker.y * 0.5) * height).toFixed(1)}px)`;
    setHudText(hud.markerGlyph, '◇');
  };

  // ---- simulation loop ----
  const velocity = new THREE.Vector3();
  const steer = { x: 0, y: 0 };
  const forward = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const scratch2 = new THREE.Vector3();
  const scratch3 = new THREE.Vector3();
  const shipAbs = new THREE.Vector3();
  let disposed = false;
  // the burn that fired last frame, for the debug handle
  let lastBoost = false;
  const rebase = new THREE.Vector3();
  // floor scratch: the radial direction in the body's local frame
  const floorDir = new THREE.Vector3();
  const floorQuat = new THREE.Quaternion();

  // start the camera in the chase pose — at the new world scale a swoop-in
  // from the scene origin would cross the whole home system
  rig.seed(SPAWN_HEADING);
  camera.position.copy(rig.pose.position);
  camera.quaternion.copy(rig.pose.quaternion);

  field.sync(shipAbs.copy(ship.position).add(origin), true);

  stage.start((dt) => {
    worldTime += dt;
    if (lockTimer > 0) lockTimer -= dt;
    // Behind the title and the end screen the ship holds its heading at
    // cruise: the world keeps moving, and no hand is on the controls.
    const flying = phase === 'survey' || phase === 'drift';
    if (flying) {
      input.readSteer(steer, dt);
    } else {
      steer.x = steer.y = 0;
    }
    const boost = flying && input.burnHeld();
    lastBoost = boost;
    rig.steer(steer.x, steer.y, dt);

    // distance-proportional speed law: time-to-contact stays roughly
    // constant, so approaches decelerate into a skim automatically. The cap
    // is direction-aware (pointing away from the body relaxes it — leaving
    // is never a grind) and a boost burn punches through it. Only SOLID
    // bodies drive the law; inside the envelope the relieved limit is
    // additionally clamped (min — it can only lower the law), the felt
    // beginning of the arrival ritual. Diffuse volumes contribute only
    // `dragFactor` — atmosphere, never a wall.
    forward.copy(FORWARD).applyQuaternion(ship.quaternion);
    const approach = nearestSolid.dist === Infinity
      ? -1
      : forward.dot(scratch.copy(nearestSolid.center).sub(ship.position).normalize());
    // the radius makes the floor taper near the deck (speedFloor); with no
    // solid body scanned, radius is 0 and the plain flat-floor law applies
    const solidLimit = speedLimit(nearestSolid.dist, approach, nearestSolid.radius);
    // the envelope step is fiction as much as physics — bodies flagged
    // envelope: false (the comet, the station) keep the plain law
    const limit =
      (nearestSolid.envelope
        ? Math.min(solidLimit, envelopeCap(nearestSolid.dist, nearestSolid.radius))
        : solidLimit) * (boost ? BOOST_LIMIT_FACTOR : 1);
    const targetSpeed = Math.min(boost ? CRUISE_SPEED * BOOST_FACTOR : CRUISE_SPEED, limit) * dragFactor;
    const rate = speedResponseRate(velocity.length(), targetSpeed, boost);
    velocity.lerp(scratch.copy(forward).multiplyScalar(targetSpeed), Math.min(1, dt * rate));
    ship.position.addScaledVector(velocity, dt);

    // floating origin: once the ship strays a sector from the render origin,
    // shift the whole render-local scene by an exact sector multiple — same
    // frame, before sync and render, so it is visually invisible
    const delta = computeRebase(ship.position, SECTOR);
    if (delta) {
      rebase.set(delta.x, delta.y, delta.z);
      // ship + virtual chase pose; the real camera picks up the shifted
      // pose at the chase-site copy below, before this frame renders
      rig.applyRebase(rebase);
      home.group.position.sub(rebase);
      home.group.updateMatrixWorld(true);
      field.applyOriginShift(rebase);
      beaconCellKey = ''; // beacon dots are render-local — re-derive them
    }

    // world updates (the passenger rides the comet, the finds turn)
    home.update?.(dt, worldTime);
    placePassenger();
    if (phase === 'survey' || phase === 'closed' || phase === 'title') {
      const elapsed = phase === 'survey' ? elapsedOf(loop) : 0;
      const bellLit = phase === 'survey' && isOpen('bell', elapsed, schedule) && !loop.logged.has('bell') ? 1 : 0;
      const lightLit = phase === 'survey' && !loop.logged.has('light') ? darkness(elapsed) > 0 ? Math.min(1, 0.4 + darkness(elapsed)) : 0 : 0;
      finds.update(dt, bellLit, lightLit);
    }
    field.sync(shipAbs.copy(ship.position).add(origin));
    refreshBeacons();
    field.updateContents(dt, worldTime);

    // adaptive quality: under sustained load the governor sheds dust and
    // LOD rungs alongside pixels
    applyQuality(stage, dust, lod);

    // backdrop + dust follow the ship (render-local; a rebase wraps the dust
    // by whole sector multiples, which the modulo wrap absorbs in one step)
    stars.position.copy(ship.position);
    dust.update(dt, ship.position);

    // nearest-body HUD across home + all active sector POIs, plus discovery
    nearest.name = 'DEEP SPACE';
    nearest.dist = Infinity;
    nearest.radius = 0;
    nearestSolid.dist = Infinity;
    nearestSolid.radius = 0;
    // drop references so evicted sector content is collectable (typed as
    // the full union — considerPoi refills these, but TS can't see through
    // the callback and would narrow the properties to `null` for the rest
    // of the frame)
    nearestSolid.lod = null as Poi['lod'] | null;
    nearestSolid.anchor = null as THREE.Object3D | null;
    dragFactor = 1;
    for (const poi of home.pois) considerPoi(poi);
    field.forEachPoi(considerPoi);

    // the loop: one step of the rules, fed from this frame's measurements
    if (phase === 'survey') stepLoopFrame(dt);

    // surface-horizon leveling: inside an enveloped body's ring-cue band the
    // roll leveler's reference up eases onto the local surface normal, so a
    // planetary approach settles the horizon horizontal on its own (the
    // leveler still yields to active steering and to nose-down dives).
    // Leaving the band freezes the up where it was — space has no correct
    // orientation, so nothing ever un-rotates. Envelope-less solids (the
    // comet, the station) don't retarget: too small to read as a horizon.
    const inEnvelopeBand =
      nearestSolid.envelope && nearestSolid.dist < nearestSolid.radius * ENVELOPE_RADII;
    if (inEnvelopeBand) {
      scratch.copy(ship.position).sub(nearestSolid.center);
      if (scratch.lengthSq() > 1e-9) {
        easeUpVector(rig.levelUp, scratch.normalize(), dt);
      }
    }

    // arrival ritual: crossing into a solid body's atmospheric envelope
    // (the ring-cue band) announces once per approach; each body re-arms
    // past its OWN ENVELOPE_REARM_RADII (hysteresis, per-body — see the
    // 10 Hz pass below). HUD text plus the envelope speed step only — no
    // camera cut; the only camera response near a body is the horizon
    // leveling above, and that is an ease, never a jump.
    if (inEnvelopeBand && !envelopeAnnounced.has(nearestSolid.id)) {
      envelopeAnnounced.set(nearestSolid.id, nearestSolid.dist / nearestSolid.radius);
      pingTimer = 4;
      setHudText(hud.ping, `ATMOSPHERIC ENVELOPE · ${nearestSolid.name}`);
    }

    if (pingTimer > 0) {
      pingTimer -= dt;
      hud.ping.style.opacity = String(Math.max(0, Math.min(1, pingTimer / 1.5)));
    }
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
      // envelope re-arm: drop ids past their own re-arm band, then reset
      // the rest to Infinity — the per-frame POI scan refreshes live ones,
      // so a value still Infinity next pass means the POI was evicted with
      // its sector and re-arms too. The map only ever holds nearby bodies.
      for (const [id, ratio] of envelopeAnnounced) {
        if (ratio > ENVELOPE_REARM_RADII) envelopeAnnounced.delete(id);
        else envelopeAnnounced.set(id, Infinity);
      }
      setHudText(hud.body, nearest.name);
      const approach = nearest.dist < approachRange(nearest.radius) ? ' · APPROACH' : '';
      setHudText(hud.dist, `${formatDistance(nearest.dist)}${approach}`);
      setHudText(hud.speed, `${Math.floor(velocity.length())} km/s`);
      const cell = field.currentCell();
      setHudText(
        hud.sector,
        isHomeCell(cell.x, cell.y, cell.z)
          ? 'HOME SYSTEM'
          : `${cell.content ? `${cell.content.name} · ` : ''}${cell.x}.${cell.y}.${cell.z}`,
      );
      if (phase === 'survey') writeLoopReadouts();
    }

    // terrain-following soft altitude floor: probing below FLOOR_PROBE_RADII
    // of a SOLID body's surface, the floor under the ship is that body's own
    // displacement field sampled along the ship's radial — in the anchor's
    // LOCAL frame, since the displaced wireframe spins with it — plus a
    // small margin (engine/lod/surfaceFloor). Low flight hugs valleys and
    // never clips through the 1.06R peaks the old flat 1.03r floor allowed;
    // sinking below eases the ship back out — no bounce, no damage, no fail
    // state. Solid POIs without a field (station, binary pair, pulsar core)
    // keep the flat floor; diffuse volumes have no floor at all: formations
    // are meant to be flown through.
    if (nearestSolid.dist < nearestSolid.radius * FLOOR_PROBE_RADII) {
      scratch.copy(ship.position).sub(nearestSolid.center);
      const len = scratch.length();
      if (len > 1e-6) {
        let floorR = nearestSolid.radius * FLAT_FLOOR_RADII;
        if (nearestSolid.lod && nearestSolid.anchor) {
          if (floorSamplerId !== nearestSolid.id || !floorSampler) {
            floorSamplerId = nearestSolid.id;
            floorSampler = makeSurfaceFloor(
              nearestSolid.lod.seed,
              KIND_PRESETS[nearestSolid.lod.kind],
              nearestSolid.radius,
            );
          }
          // frame skew: `center` is the last scan's matrixWorld while the
          // quaternion reads current — ≤ ~1.2 units at max skim speed,
          // absorbed by the 0.015r margin and the ease-out lerp
          nearestSolid.anchor.getWorldQuaternion(floorQuat).invert();
          floorDir.copy(scratch).multiplyScalar(1 / len).applyQuaternion(floorQuat);
          floorR = floorSampler(floorDir.x, floorDir.y, floorDir.z);
        }
        if (len < floorR) {
          scratch.multiplyScalar(floorR / len).add(nearestSolid.center);
          ship.position.lerp(scratch, Math.min(1, dt * 3));
        }
      }
    }

    // virtual chase camera + FOV boost cue (engine/render/flightRig:
    // trailing lerp capped at CAMERA_MAX_LAG), then project the rig's pose
    // onto the real camera — the projection matrix rebuilds only when the
    // eased FOV actually moved beyond the scalar law's dead band
    rig.update(dt, boost);
    camera.position.copy(rig.pose.position);
    camera.quaternion.copy(rig.pose.quaternion);
    if (camera.fov !== rig.pose.fov) {
      camera.fov = rig.pose.fov;
      camera.updateProjectionMatrix();
    }

    // the reticle rides the settled camera, so it never trails its target
    if (phase === 'survey') drawReticle();

    // LOD after the camera settles: rung selection, dissolves, budgeted jobs
    lod.update(camera, container.clientHeight, dt);
  });

  // debug/testing hook — lets tests (and the curious) jump across the universe
  interface EphemerisDebug {
    /** Teleport to ABSOLUTE coordinates (the origin re-anchors under you). */
    warp: (x: number, y: number, z: number, lookX?: number, lookY?: number, lookZ?: number) => void;
    /** POIs of the home system + active sectors, in absolute coordinates. */
    pois: () => Array<{ name: string; x: number; y: number; z: number; radius: number; id: string; solid: boolean; envelope: boolean }>;
    /** The day's finds, where they are now in absolute coordinates, and whether each answers. */
    finds: () => Array<{ id: FindId; x: number; y: number; z: number; open: boolean; logged: boolean; opensAt: number; closesAt: number }>;
    /**
     * The game as a player sees it, for scripted play: the phase, the loop's
     * numbers, the speed, and the strongest signal ahead.
     */
    state: () => {
      phase: EphemerisPhase;
      timeLeft: number;
      loop: number;
      logged: FindId[];
      loggedNow: FindId[];
      scanId: FindId | null;
      scanProgress: number;
      tooFast: boolean;
      /** Speed of the find being scanned, as the sim estimates it (0 with none). */
      bodySpeed: number;
      speed: number;
      burning: boolean;
      dark: number;
      /** The strongest signal ahead; `angle` is where the reticle's tick points (radians, 0 = right, counter-clockwise). */
      signal: { id: FindId; strength: number; dist: number; offNose: number; angle: number } | null;
      locked: boolean;
    };
    /** Current floating-origin offset (absolute doubles). */
    origin: () => { x: number; y: number; z: number };
    /** The ship's absolute position (origin + render-local). */
    shipAbs: () => { x: number; y: number; z: number };
    /** Camera attitude and lens + the roll leveler's current reference up. */
    attitude: () => {
      quaternion: { x: number; y: number; z: number; w: number };
      levelUp: { x: number; y: number; z: number };
      fov: number;
      aspect: number;
    };
  }
  const debugHandle: EphemerisDebug = {
    warp: (x, y, z, lookX, lookY, lookZ) => {
      placeShip(
        x,
        y,
        z,
        lookX !== undefined && lookY !== undefined && lookZ !== undefined
          ? scratch3.set(lookX, lookY, lookZ)
          : undefined,
      );
    },
    pois: () => {
      const all: ReturnType<EphemerisDebug['pois']> = [];
      const collect = (poi: Poi) => {
        poi.object.getWorldPosition(poiPos);
        all.push({
          name: poi.name,
          x: poiPos.x + origin.x,
          y: poiPos.y + origin.y,
          z: poiPos.z + origin.z,
          radius: poi.radius,
          id: poi.id ?? '',
          solid: poi.solid,
          envelope: poi.solid && (poi.envelope ?? true),
        });
      };
      home.pois.forEach(collect);
      field.forEachPoi(collect);
      return all;
    },
    origin: () => ({ x: origin.x, y: origin.y, z: origin.z }),
    finds: () => {
      const elapsed = elapsedOf(loop);
      return FIND_IDS.map((id) => {
        finds.groups[id].getWorldPosition(scratchFind);
        return {
          id,
          x: scratchFind.x + origin.x,
          y: scratchFind.y + origin.y,
          z: scratchFind.z + origin.z,
          open: isOpen(id, elapsed, schedule),
          opensAt: schedule[id][0],
          closesAt: schedule[id][1],
          logged: loop.logged.has(id),
        };
      });
    },
    state: () => ({
      phase,
      timeLeft: loop.timeLeft,
      loop: loopNumber,
      logged: FIND_IDS.filter((id) => loop.logged.has(id)),
      loggedNow: [...loop.loggedNow],
      scanId: loop.scanId,
      scanProgress: loop.scanProgress,
      tooFast: loop.tooFast,
      bodySpeed: bodyVelocity.length(),
      speed: velocity.length(),
      burning: lastBoost,
      dark: phase === 'survey' ? darkness(elapsedOf(loop)) : 0,
      signal:
        phase === 'survey' && signal.id
          ? { id: signal.id, strength: signal.strength, dist: signal.dist, offNose: signal.offNose, angle: marker.angle }
          : null,
      locked,
    }),
    attitude: () => ({
      quaternion: {
        x: camera.quaternion.x,
        y: camera.quaternion.y,
        z: camera.quaternion.z,
        w: camera.quaternion.w,
      },
      levelUp: { x: rig.levelUp.x, y: rig.levelUp.y, z: rig.levelUp.z },
      fov: camera.fov,
      aspect: camera.aspect,
    }),
    shipAbs: () => ({
      x: ship.position.x + origin.x,
      y: ship.position.y + origin.y,
      z: ship.position.z + origin.z,
    }),
  };
  const globalHost = window as unknown as { __EPHEMERIS?: EphemerisDebug };
  globalHost.__EPHEMERIS = debugHandle;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (globalHost.__EPHEMERIS === debugHandle) delete globalHost.__EPHEMERIS;
    // first: no key, button or thumb may reach a sim that is being torn down
    input.dispose();
    home.group.remove(findGroup);
    field.dispose(); // unregisters sector LOD bodies via onContentRemoved
    home.dispose();
    lod.dispose();
    stats.dispose();
    // Stops the loop and frees this mount's tracked resources (ship, stars,
    // dust). Shared module-level assets are never tracked, so navigating
    // Home ↔ EPHEMERIS no longer forces GPU re-uploads of shared geometry.
    stage.dispose();
  };

  return { start, menu, places: plan.places, schedule, dispose };
}

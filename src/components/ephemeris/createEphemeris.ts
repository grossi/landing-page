import * as THREE from 'three';
import { contactKind, isHomeContact } from 'components/ephemeris/contacts';
import { createFlightInput } from 'components/ephemeris/flightInput';
import { formatDistance, placeMarker, type MarkerPlacement } from 'components/ephemeris/marker';
import {
  discoveryRange,
  canBurn,
  CONTACT_KINDS,
  contactValue,
  createSurvey,
  formatClock,
  prefersCandidate,
  rarestContact,
  readBests,
  recordScore,
  resetSurvey,
  scanRange,
  stepSurvey,
  TUNE,
  type ContactKind,
  type RecordedScore,
  type StorageLike,
  type SurveyCandidate,
  type SurveySeed,
} from 'components/ephemeris/survey';
import {
  CRUISE_FOV,
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
  /** "SCORE 450" in a survey; in FREE DRIFT the discovery tally, e.g. "5 CONTACTS LOGGED". */
  contacts: HTMLElement;
  /** Transient "NEW CONTACT" banner; the sim drives its opacity. */
  ping: HTMLElement;
  /** Best in this system, e.g. "BEST 1200". */
  best: HTMLElement;
  /** Survey clock, e.g. "3:42". */
  clock: HTMLElement;
  /** Fuel bar fill; the sim drives its width. */
  fuelFill: HTMLElement;
  /** Line under the fuel bar: "FUEL", or what an empty tank means. */
  fuelLabel: HTMLElement;
  /** The scan ring's wrapper at screen centre; the sim drives its opacity. */
  scan: HTMLElement;
  /** The ring's progress arc: any element whose `stroke-dashoffset` runs 100 (empty) to 0 (full). */
  scanArc: HTMLElement | SVGElement;
  /** Line under the ring: what is being scanned, or why it is not filling. */
  scanLabel: HTMLElement;
  /** Target marker; the sim drives its transform and opacity. */
  marker: HTMLElement;
  /** The marker's glyph: a bracket on the target, an arrow on the edge. */
  markerGlyph: HTMLElement;
  /** The marker's kind and distance on two lines, e.g. "PLANET" over "1420 km". */
  markerLabel: HTMLElement;
}

/**
 * - `title`: the world drifts behind the title screen; any press starts a survey.
 * - `survey`: the timed window.
 * - `closed`: the window has closed; any press after the lock retries.
 * - `drift`: FREE DRIFT, the experience as it was before the survey: no
 *   clock, no fuel, contacts logged on first approach.
 */
export type EphemerisPhase = 'title' | 'survey' | 'closed' | 'drift';

/** What the end screen shows. */
export interface SurveyResult {
  score: number;
  /** Contacts scanned in the window. */
  contacts: number;
  /** The most valuable contact scanned, e.g. "PULSAR KHEVEL". */
  rarest: { name: string; kind: string } | null;
  bests: RecordedScore;
}

export interface EphemerisOptions {
  /** The system to fly. Default: a new random one per mount. */
  seed?: SurveySeed;
  /** Where bests are kept. Default: none kept. */
  storage?: StorageLike | null;
  /** The BURN zone for the second thumb on a phone (see createFlightInput). */
  burnZone?: HTMLElement | null;
  /** Phase changes, with the result when a window closes. Not called per frame. */
  onPhase?: (phase: EphemerisPhase, result: SurveyResult | null) => void;
}

export interface EphemerisGame {
  /** Starts a survey (from the same start, every time) or FREE DRIFT (from where the ship is). */
  start(mode: 'survey' | 'drift'): void;
  /** Back to the title screen. A survey in flight is abandoned and not scored. */
  menu(): void;
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
/** The fuel bar is drawn in this many steps, so its width changes a few times a second at most. */
const FUEL_CELLS = 20;
/** The clock blinks through its last seconds. */
const CLOCK_WARN_SECONDS = 20;
/** The fuel bar blinks under this share of a tank. */
const FUEL_WARN = 0.25;
/**
 * The target marker stays this many CSS pixels inside the game area, so its
 * two-line label is never cut off and it keeps clear of the control hint.
 * On a phone the vertical margin grows to clear the BURN zone as well.
 */
const MARKER_MARGIN_X = 84;
const MARKER_MARGIN_Y = 110;

/**
 * Mounts the EPHEMERIS solar-system simulation into `container` and starts
 * its render loop. The world opens drifting behind a title screen; the
 * returned handle starts a survey or FREE DRIFT and disposes the mount.
 *
 * The survey's rules (clock, fuel, scan progress, values, bests) live in
 * components/ephemeris/survey and know nothing of this file. Here they are
 * fed from the nearest-body pass: which unscanned body is in range, how
 * fast the ship is going and whether a burn is firing.
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

  // ---- phase ----
  let phase: EphemerisPhase = 'title';
  // seconds of the end screen's input lock still to run
  let lockTimer = 0;
  // Clock of the world's own motion (orbits, the comet). The stage's clock
  // only ever runs forward; this one goes back to zero with every survey,
  // so each attempt at a system finds its bodies where the last one did.
  let worldTime = 0;
  const survey = createSurvey();
  let bests = readBests(storage, seedLabel);

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

  // ---- survey ----
  // The in-range, unscanned body of this frame's POI pass (the scan), and
  // the nearest unscanned one whatever its range (the marker).
  let pickPoi: Poi | null = null;
  let pickDist = Infinity;
  const pickCenter = new THREE.Vector3();
  // Where the body being scanned was a frame ago, in absolute coordinates
  // (a rebase must not read as motion): its velocity is what the ship's
  // speed is measured against. Almost every body is at rest next to a
  // ship; the home comet is not.
  const scanPrev = new THREE.Vector3();
  let scanPrevId = '';
  const bodyVelocity = new THREE.Vector3();
  // The POI pass reads world matrices, which are those of the last render:
  // the world as the PREVIOUS frame's update left it. So the step between
  // two samples of a body took the previous frame's dt, not this one's.
  let previousDt = 0;
  // POI kinds, by id: ids are stable across sector rebuilds, and classifying
  // reads names and decorations, which is not per-frame work
  const kinds = new Map<string, ContactKind>();
  const kindOf = (poi: Poi): ContactKind => {
    const id = poi.id ?? poi.name;
    let kind = kinds.get(id);
    if (!kind) {
      kind = contactKind(poi);
      kinds.set(id, kind);
    }
    return kind;
  };
  let targetPoi: Poi | null = null;
  let targetDist = Infinity;
  const targetCenter = new THREE.Vector3();
  // handed to the rules; reused, and refilled only when the body changes
  const candidate: SurveyCandidate = { id: '', name: '', kind: 'anomaly', home: true };
  const marker: MarkerPlacement = { x: 0, y: 0, onScreen: false, angle: 0 };
  // the marker's target as of the last 10 Hz pass: its label is on the HUD
  let markerDist = Infinity;
  const cameraInverse = new THREE.Quaternion();
  const markerPos = new THREE.Vector3();
  let markerMarginY = MARKER_MARGIN_Y;

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
    if (!poi.id) return;
    if (phase === 'drift') {
      // FREE DRIFT: the first close approach logs the contact, as it always did
      if (d < discoveryRange(poi.radius) && !discoveredIds.has(poi.id)) {
        discoveredIds.add(poi.id);
        pingTimer = 4;
        setHudText(hud.ping, `NEW CONTACT · ${poi.name}`);
        setHudText(hud.contacts, `${discoveredIds.size} CONTACT${discoveredIds.size === 1 ? '' : 'S'} LOGGED`);
      }
    } else if (phase === 'survey' && !survey.scannedIds.has(poi.id)) {
      if (d < targetDist) {
        targetDist = d;
        targetPoi = poi;
        targetCenter.copy(poiPos);
      }
      if (
        d < scanRange(poi.radius, kindOf(poi), poi.solid && (poi.envelope ?? true)) &&
        prefersCandidate(survey.scanId, pickPoi?.id ?? null, pickDist, poi.id, d)
      ) {
        pickPoi = poi;
        pickDist = d;
        pickCenter.copy(poiPos);
      }
    }
  };

  // ---- phase changes ----
  const setPhase = (next: EphemerisPhase, result: SurveyResult | null = null) => {
    phase = next;
    // whatever was held belongs to the phase that just ended
    input.release();
    hudTimer = 0; // the readouts of the new phase show on its first frame
    pingTimer = 0;
    hud.ping.style.opacity = '0';
    setHudStyle(hud.scan, 'opacity', '0');
    setHudStyle(hud.marker, 'opacity', '0');
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
      // and a survey finds the world as the last attempt did: its clock
      // goes back to zero, so the bodies are where they were
      resetSurvey(survey);
      markerDist = Infinity;
      scanPrevId = '';
      worldTime = 0;
      // the orbiters read the clock, so move them now: the first frame's
      // nearest-body pass must not see the last run's positions
      // (the comet drags a trail of its last COMET_TRAIL positions; that
      // many steps lay the whole trail back on the comet, as on a fresh
      // mount, so no line is drawn across the system to where it was)
      for (let i = 0; i < COMET_TRAIL; i++) home.update?.(0, 0);
      field.updateContents(0, 0);
      scene.updateMatrixWorld(true);
      bests = readBests(storage, seedLabel);
      setHudText(hud.contacts, 'SCORE 0');
      setHudText(hud.best, `BEST ${bests.seed}`);
    } else {
      setHudText(hud.contacts, '0 CONTACTS LOGGED');
    }
    setPhase(mode);
  }

  function menu() {
    if (disposed || phase === 'title') return;
    setPhase('title');
  }

  const closeSurvey = () => {
    const recorded = recordScore(storage, seedLabel, survey.score);
    bests = recorded;
    const rarest = rarestContact(survey.scanned);
    lockTimer = TUNE.RETRY_LOCK_SECONDS;
    setHudText(hud.clock, formatClock(0));
    setPhase('closed', {
      score: survey.score,
      contacts: survey.scanned.length,
      rarest: rarest && { name: rarest.name, kind: CONTACT_KINDS[rarest.kind].label },
      bests: recorded,
    });
  };

  // ---- survey frame ----
  // Hands the rules this frame's facts and puts what they decide on the HUD.
  const stepSurveyFrame = (dt: number, burning: boolean) => {
    const pick: Poi | null = pickPoi;
    if (pick && pick.id !== candidate.id) {
      candidate.id = pick.id ?? '';
      candidate.name = pick.name;
      candidate.kind = kindOf(pick);
      candidate.home = isHomeContact(candidate.id);
    }
    // the body's own velocity, from where it was a frame ago
    bodyVelocity.set(0, 0, 0);
    if (pick) {
      scratch.copy(pickCenter).add(origin);
      if (scanPrevId === candidate.id && previousDt > 0) {
        bodyVelocity.copy(scratch).sub(scanPrev).divideScalar(previousDt);
      }
      scanPrev.copy(scratch);
      scanPrevId = candidate.id;
    } else {
      scanPrevId = '';
    }
    bodyMoving = bodyVelocity.lengthSq() > TUNE.SCAN_MAX_SPEED ** 2;
    const logged = stepSurvey(survey, dt, {
      burning,
      speed: scratch.copy(velocity).sub(bodyVelocity).length(),
      candidate: pick ? candidate : null,
    });
    if (logged) {
      pingTimer = 4;
      setHudText(hud.ping, `LOGGED · ${logged.name} · ${CONTACT_KINDS[logged.kind].label} +${logged.value}`);
      setHudText(hud.contacts, `SCORE ${survey.score}`);
      // the body just logged is still this frame's marker target
      if (targetPoi === pick) targetPoi = null;
    }
    if (survey.closed) {
      closeSurvey();
      return;
    }
    // the ring: shown while a body is in range, filling at scan speed
    if (survey.scanId) {
      setHudStyle(hud.scan, 'opacity', '1');
      setHudStyle(hud.scanArc, 'stroke-dashoffset', (100 - survey.scanProgress * 100).toFixed(1));
      setHudText(
        hud.scanLabel,
        survey.tooFast
          ? bodyMoving
            ? 'TOO FAST · KEEP PACE WITH IT'
            : `TOO FAST · SLOW BELOW ${TUNE.SCAN_MAX_SPEED} km/s`
          : `SCANNING · ${candidate.name} · +${contactValue(candidate.kind, candidate.home)}`,
      );
    } else {
      setHudStyle(hud.scan, 'opacity', '0');
    }
  };

  // The 10 Hz readouts of a survey: clock, fuel and what the marker says.
  const writeSurveyReadouts = () => {
    setHudText(hud.clock, formatClock(survey.timeLeft));
    setHudWarn(hud.clock, survey.timeLeft <= CLOCK_WARN_SECONDS);
    const cells = Math.ceil(survey.fuel * FUEL_CELLS - 1e-9);
    setHudStyle(hud.fuelFill, 'width', `${(cells / FUEL_CELLS) * 100}%`);
    setHudText(hud.fuelLabel, survey.fuel > 0 ? 'FUEL' : 'FUEL OUT · SCAN TO REFUEL');
    setHudWarn(hud.fuelLabel, survey.fuel < FUEL_WARN);

    // keep the marker above the BURN zone while that is on screen
    const zone = options.burnZone?.getBoundingClientRect();
    markerMarginY = Math.max(
      MARKER_MARGIN_Y,
      zone && zone.height > 0 ? container.getBoundingClientRect().bottom - zone.top + 28 : 0,
    );

    // what the marker says: the nearest unscanned body in the streamed
    // window (27 sectors around the ship, so there is always one)
    const target: Poi | null = targetPoi;
    markerDist = target ? targetDist : Infinity;
    if (target) labelMarker(target);
  };

  // The marker's two lines, and which body they were written for.
  let markerLabelId = '';
  const labelMarker = (target: Poi) => {
    markerLabelId = target.id ?? '';
    setHudText(hud.markerLabel, `${CONTACT_KINDS[kindOf(target)].label}\n${formatDistance(targetDist)}`);
  };

  // Per frame: where the marker sits. Bodies orbit and the camera turns,
  // so the position is this frame's. The label waits for the 10 Hz pass,
  // except when the target changes: a marker never names the body before.
  const drawMarker = () => {
    // nothing to point at, or the target is the body under the scan ring,
    // which already names it at screen centre
    const target: Poi | null = targetPoi;
    if (!target || markerDist === Infinity || target.id === survey.scanId) {
      setHudStyle(hud.marker, 'opacity', '0');
      return;
    }
    if (target.id !== markerLabelId) labelMarker(target);
    markerPos
      .copy(targetCenter)
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
      Math.max(0.1, 1 - (2 * MARKER_MARGIN_X) / Math.max(1, width)),
      Math.max(0.1, 1 - (2 * markerMarginY) / Math.max(1, height)),
    );
    setHudStyle(hud.marker, 'opacity', '1');
    hud.marker.style.transform =
      `translate(${((marker.x * 0.5 + 0.5) * width).toFixed(1)}px, ${((0.5 - marker.y * 0.5) * height).toFixed(1)}px)`;
    // a bracket on the target itself, an arrow toward it on the edge
    // (CSS rotation is clockwise and screen y runs down: hence the minus)
    setHudText(hud.markerGlyph, marker.onScreen ? '◇' : '▶');
    hud.markerGlyph.style.transform = marker.onScreen ? '' : `rotate(${(-marker.angle).toFixed(3)}rad)`;
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
  // the body being scanned is itself moving too fast to scan from rest
  let bodyMoving = false;
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
      input.readSteer(steer);
    } else {
      steer.x = steer.y = 0;
    }
    // an empty tank cruises until the next scan refuels it
    const boost = flying && input.burnHeld() && (phase === 'drift' || canBurn(survey));
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

    // world updates
    home.update?.(dt, worldTime);
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
    pickPoi = null;
    pickDist = Infinity;
    targetPoi = null;
    targetDist = Infinity;
    for (const poi of home.pois) considerPoi(poi);
    field.forEachPoi(considerPoi);

    // the survey: one step of the rules, fed from the pass above
    if (phase === 'survey') stepSurveyFrame(dt, boost);
    previousDt = dt;

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
      if (phase === 'survey') writeSurveyReadouts();
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

    // the marker rides the settled camera, so it never trails its target
    if (phase === 'survey') drawMarker();

    // LOD after the camera settles: rung selection, dissolves, budgeted jobs
    lod.update(camera, container.clientHeight, dt);
  });

  // debug/testing hook — lets tests (and the curious) jump across the universe
  interface EphemerisDebug {
    /** Teleport to ABSOLUTE coordinates (the origin re-anchors under you). */
    warp: (x: number, y: number, z: number, lookX?: number, lookY?: number, lookZ?: number) => void;
    /** POIs of the home system + active sectors, in absolute coordinates. */
    pois: () => Array<{ name: string; x: number; y: number; z: number; radius: number; id: string; kind: ContactKind; solid: boolean; envelope: boolean }>;
    /**
     * The game as a player sees it, for scripted play: the phase, the
     * survey's numbers, the speed, and the marker (NDC, y up) with its
     * target's distance.
     */
    state: () => {
      phase: EphemerisPhase;
      timeLeft: number;
      fuel: number;
      score: number;
      scanned: string[];
      scanId: string | null;
      scanProgress: number;
      tooFast: boolean;
      /** Speed of the body being scanned, as the sim estimates it (0 with none). */
      bodySpeed: number;
      speed: number;
      burning: boolean;
      marker: { x: number; y: number; onScreen: boolean; dist: number } | null;
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
          kind: kindOf(poi),
          solid: poi.solid,
          envelope: poi.solid && (poi.envelope ?? true),
        });
      };
      home.pois.forEach(collect);
      field.forEachPoi(collect);
      return all;
    },
    origin: () => ({ x: origin.x, y: origin.y, z: origin.z }),
    state: () => ({
      phase,
      timeLeft: survey.timeLeft,
      fuel: survey.fuel,
      score: survey.score,
      scanned: survey.scanned.map((contact) => contact.id),
      scanId: survey.scanId,
      scanProgress: survey.scanProgress,
      tooFast: survey.tooFast,
      bodySpeed: bodyVelocity.length(),
      speed: velocity.length(),
      burning: lastBoost,
      marker:
        phase === 'survey' && targetPoi && markerDist < Infinity
          ? { x: marker.x, y: marker.y, onScreen: marker.onScreen, dist: markerDist }
          : null,
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
    field.dispose(); // unregisters sector LOD bodies via onContentRemoved
    home.dispose();
    lod.dispose();
    stats.dispose();
    // Stops the loop and frees this mount's tracked resources (ship, stars,
    // dust). Shared module-level assets are never tracked, so navigating
    // Home ↔ EPHEMERIS no longer forces GPU re-uploads of shared geometry.
    stage.dispose();
  };

  return { start, menu, dispose };
}

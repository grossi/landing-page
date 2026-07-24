import * as THREE from 'three';
import {
  burnKeysDown,
  CRUISE_FOV,
  easeUpVector,
  FORWARD,
  resolveSteer,
  speedResponseRate,
} from 'engine/core/flight';
import { computeRebase } from 'engine/core/floatingOrigin';
import { createKeyTracker } from 'engine/core/keyTracker';
import { createListenerGroup } from 'engine/core/listenerGroup';
import {
  BOOST_LIMIT_FACTOR,
  diffuseDrag,
  ENVELOPE_RADII,
  ENVELOPE_REARM_RADII,
  envelopeCap,
  speedLimit,
} from 'engine/core/motion';
import { pointerToNdc } from 'engine/core/pointerNdc';
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
  /** Running discovery tally, e.g. "5 CONTACTS LOGGED". */
  contacts: HTMLElement;
  /** Transient "NEW CONTACT" banner; the sim drives its opacity. */
  ping: HTMLElement;
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
/**
 * First close approach inside this surface distance logs a POI. The cap
 * binds for the sprawling diffuse volumes — nebulae reach 2,940, clusters
 * 2,598, swarms 2,400 — which would otherwise log from most of a cell
 * away; the biggest solid bodies stay under it (rogue 960 → 1,152, home
 * sun 800 → 960), and a future authored giant caps at 1,200 too.
 */
const discoveryRange = (radius: number) => Math.max(150, Math.min(radius * 1.2, 1200));
/** The HUD flags "APPROACH" inside this surface distance. */
const approachRange = (radius: number) => Math.max(60, radius * 0.5);

/**
 * Mounts the EPHEMERIS solar-system simulation into `container` and starts
 * its render loop. Returns a dispose function that stops the loop, removes
 * listeners and frees all GPU resources.
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
export function createEphemeris(container: HTMLElement, hud: EphemerisHudElements): () => void {
  // log depth: near 0.5 / far 60,000 spans five distance decades with nested
  // LOD shells + atmosphere rings — a linear z-buffer would z-fight them.
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

  const worldSeed = Math.floor(Math.random() * 2 ** 31);

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
  ship.position.set(0, 340 * WORLD_SCALE.home, HOME_LAYOUT.maxExtent + 2400);
  scene.add(ship);

  // ---- input ----
  // last pointer position in standard GL NDC (y up); resolveSteer flips it
  // to the screen-down steer sense at the consumption site
  const pointer = { x: 0, y: 0 };
  let pointerDown = false;
  // blur also drops the pointer hold — pointerup never arrives for a button
  // held across a focus loss, which would leave the ship burning forever
  const keyTracker = createKeyTracker(window, () => { pointerDown = false; });
  const { keys } = keyTracker;

  // pointerToNdc mutates the stable `pointer` — pointermove fires every
  // frame while steering, and a fresh object per event is per-frame garbage
  const onPointerMove = (e: PointerEvent) => { pointerToNdc(pointer, e.clientX, e.clientY, container); };
  const onPointerDown = () => { pointerDown = true; };
  const onPointerUp = () => { pointerDown = false; };
  const onTouchMove = (e: TouchEvent) => {
    pointerToNdc(pointer, e.touches[0].clientX, e.touches[0].clientY, container);
  };
  const listeners = createListenerGroup();
  listeners.add(container, 'pointermove', onPointerMove);
  listeners.add(container, 'pointerdown', onPointerDown);
  listeners.add(window, 'pointerup', onPointerUp);
  // a browser-canceled touch (scroll takeover, system gesture) never sends
  // pointerup — without this the ship burns forever
  listeners.add(window, 'pointercancel', onPointerUp);
  listeners.add(container, 'touchmove', onTouchMove, { passive: true });

  // ---- HUD (write only on change; per-frame DOM writes cause layout churn) ----
  const hudCache = new Map<HTMLElement, string>();
  const setHudText = (el: HTMLElement, text: string) => {
    if (hudCache.get(el) !== text) {
      hudCache.set(el, text);
      el.textContent = text;
    }
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
    if (d < discoveryRange(poi.radius) && poi.id && !discoveredIds.has(poi.id)) {
      discoveredIds.add(poi.id);
      pingTimer = 4;
      setHudText(hud.ping, `NEW CONTACT · ${poi.name}`);
      setHudText(hud.contacts, `${discoveredIds.size} CONTACT${discoveredIds.size === 1 ? '' : 'S'} LOGGED`);
    }
  };

  // ---- simulation loop ----
  const velocity = new THREE.Vector3();
  const steer = { x: 0, y: 0 };
  const forward = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const shipAbs = new THREE.Vector3();
  const rebase = new THREE.Vector3();
  // floor scratch: the radial direction in the body's local frame
  const floorDir = new THREE.Vector3();
  const floorQuat = new THREE.Quaternion();

  // start the camera in the chase pose — at the new world scale a swoop-in
  // from the scene origin would cross the whole home system. Slight spawn
  // tilt: seed with the pitch −0.04 forward direction.
  rig.seed(scratch.set(0, -Math.sin(0.04), -Math.cos(0.04)));
  camera.position.copy(rig.pose.position);
  camera.quaternion.copy(rig.pose.quaternion);

  field.sync(shipAbs.copy(ship.position).add(origin), true);

  stage.start((dt, t) => {
    // steering — resolveSteer also clamps to ±1, which the raw pointer read
    // never did: a captured pointer dragged past the canvas edge used to
    // command super-unit deflection
    resolveSteer(steer, pointer.x, pointer.y, keys);
    const boost = pointerDown || burnKeysDown(keys);
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
    home.update?.(dt, t);
    field.sync(shipAbs.copy(ship.position).add(origin));
    refreshBeacons();
    field.updateContents(dt, t);

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
      const surface = Math.max(0, nearest.dist);
      const approach = nearest.dist < approachRange(nearest.radius) ? ' · APPROACH' : '';
      setHudText(
        hud.dist,
        surface >= 10000 ? `${(surface / 1000).toFixed(2)} Mm${approach}` : `${Math.floor(surface)} km${approach}`,
      );
      setHudText(hud.speed, `${Math.floor(velocity.length())} km/s`);
      const cell = field.currentCell();
      setHudText(
        hud.sector,
        isHomeCell(cell.x, cell.y, cell.z)
          ? 'HOME SYSTEM'
          : `${cell.content ? `${cell.content.name} · ` : ''}${cell.x}.${cell.y}.${cell.z}`,
      );
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
    // eased FOV actually moved, the same dead-band cadence updateFov had
    rig.update(dt, boost);
    camera.position.copy(rig.pose.position);
    camera.quaternion.copy(rig.pose.quaternion);
    if (camera.fov !== rig.pose.fov) {
      camera.fov = rig.pose.fov;
      camera.updateProjectionMatrix();
    }

    // LOD after the camera settles: rung selection, dissolves, budgeted jobs
    lod.update(camera, container.clientHeight, dt);
  });

  // debug/testing hook — lets tests (and the curious) jump across the universe
  interface EphemerisDebug {
    /** Teleport to ABSOLUTE coordinates (the origin re-anchors under you). */
    warp: (x: number, y: number, z: number, lookX?: number, lookY?: number, lookZ?: number) => void;
    /** POIs of the home system + active sectors, in absolute coordinates. */
    pois: () => Array<{ name: string; x: number; y: number; z: number; radius: number }>;
    /** Current floating-origin offset (absolute doubles). */
    origin: () => { x: number; y: number; z: number };
    /** The ship's absolute position (origin + render-local). */
    shipAbs: () => { x: number; y: number; z: number };
    /** Camera attitude + the roll leveler's current reference up. */
    attitude: () => {
      quaternion: { x: number; y: number; z: number; w: number };
      levelUp: { x: number; y: number; z: number };
    };
  }
  const debugHandle: EphemerisDebug = {
    warp: (x, y, z, lookX, lookY, lookZ) => {
      // re-anchor the origin at the containing cell corner, keep the ship at
      // the render-local remainder, and shift every render-local root
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
      envelopeAnnounced.clear(); // a warp is not an approach — start re-armed
      if (lookX !== undefined && lookY !== undefined && lookZ !== undefined) {
        rig.seed(scratch.set(lookX - x, lookY - y, lookZ - z).normalize());
        camera.position.copy(rig.pose.position);
        camera.quaternion.copy(rig.pose.quaternion);
      }
      field.sync(shipAbs.copy(ship.position).add(origin), true);
    },
    pois: () => {
      const all: Array<{ name: string; x: number; y: number; z: number; radius: number }> = [];
      const collect = (poi: Poi) => {
        poi.object.getWorldPosition(poiPos);
        all.push({
          name: poi.name,
          x: poiPos.x + origin.x,
          y: poiPos.y + origin.y,
          z: poiPos.z + origin.z,
          radius: poi.radius,
        });
      };
      home.pois.forEach(collect);
      field.forEachPoi(collect);
      return all;
    },
    origin: () => ({ x: origin.x, y: origin.y, z: origin.z }),
    attitude: () => ({
      quaternion: {
        x: camera.quaternion.x,
        y: camera.quaternion.y,
        z: camera.quaternion.z,
        w: camera.quaternion.w,
      },
      levelUp: { x: rig.levelUp.x, y: rig.levelUp.y, z: rig.levelUp.z },
    }),
    shipAbs: () => ({
      x: ship.position.x + origin.x,
      y: ship.position.y + origin.y,
      z: ship.position.z + origin.z,
    }),
  };
  const globalHost = window as unknown as { __EPHEMERIS?: EphemerisDebug };
  globalHost.__EPHEMERIS = debugHandle;

  return () => {
    if (globalHost.__EPHEMERIS === debugHandle) delete globalHost.__EPHEMERIS;
    keyTracker.dispose();
    listeners.dispose();
    field.dispose(); // unregisters sector LOD bodies via onContentRemoved
    home.dispose();
    lod.dispose();
    stats.dispose();
    // Stops the loop and frees this mount's tracked resources (ship, stars,
    // dust). Shared module-level assets are never tracked, so navigating
    // Home ↔ EPHEMERIS no longer forces GPU re-uploads of shared geometry.
    stage.dispose();
  };
}

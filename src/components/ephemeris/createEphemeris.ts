import * as THREE from 'three';
import { computeRebase } from 'engine/core/floatingOrigin';
import { BOOST_LIMIT_FACTOR, speedLimit } from 'engine/core/motion';
import { mulberry32 } from 'engine/core/rng';
import { createLodManager, type LodBeacon, type LodBodyHandle } from 'engine/lod/lodManager';
import { wireMat } from 'engine/render/assets';
import { createDustField } from 'engine/render/dust';
import { createStage } from 'engine/render/stage';
import { createStarfield } from 'engine/render/starfield';
import { attachStatsOverlay } from 'engine/render/statsOverlay';
import {
  buildHomeSystem,
  peekSectorBeacon,
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

/** Edge length of one cubic sector of procedural space (1 unit = 1 km). */
const SECTOR = 6000;
/** Sectors are kept alive within this many cells of the ship (1 → 3×3×3). */
const ACTIVE_RANGE = 1;
/**
 * Sectors beyond the streamed window still show as far-contact beacon dots
 * out to this Chebyshev cell range (peeked, zero geometry built).
 */
const BEACON_RANGE = 4;
/** Open-space cruise speed; boost quadruples it (see the speed-law block). */
const CRUISE_SPEED = 1000;
const BOOST_FACTOR = 4;
/** Camera FOV at cruise / under boost (the DEEP FIELD throttle-widen cue). */
const CRUISE_FOV = 64;
const BOOST_FOV = 71;
/** Velocity response rates (1/s): a boost kicks, a slowdown eases. */
const ACCEL_RATE = 2.2;
const ACCEL_RATE_BOOST = 3.4;
const DECEL_RATE = 1.4;
/** First close approach inside this surface distance logs a POI. */
const discoveryRange = (radius: number) => Math.max(150, radius * 1.2);
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
 * Max speed is proportional to the distance to the nearest surface
 * (engine/core/motion), so deep-space hops stay quick while planetary
 * approaches decelerate into a controlled, seamless surface skim — and a
 * soft altitude floor pushes the ship out gently instead of ever crashing.
 * The cap is direction-aware (pointing away from a body lifts it, so
 * leaving is never a grind) and boosting punches through it.
 *
 * The sim owns its canvas; HUD text is written into the provided elements so
 * the caller controls layout/styling without re-rendering per frame.
 */
export function createEphemeris(container: HTMLElement, hud: EphemerisHudElements): () => void {
  // log depth: near 0.5 / far 60,000 spans five distance decades with nested
  // LOD shells + atmosphere rings — a linear z-buffer would z-fight them.
  // far covers the beacon-dot shell (BEACON_RANGE sectors on the diagonal).
  // Gentle exp2 fog gives far content the DEEP FIELD emergence — geometry
  // fades up from black over the ~12k → 3k approach band instead of popping.
  // Far *contacts* stay visible regardless: the LOD dot/beacon layers and
  // the starfield are fog-free, so fog shapes emergence, not awareness.
  const stage = createStage(container, {
    fov: CRUISE_FOV,
    near: 0.5,
    far: 60000,
    logDepth: true,
    fogDensity: 0.00011,
  });
  const { scene, camera, tracker } = stage;

  const worldSeed = Math.floor(Math.random() * 2 ** 31);

  // ---- LOD ladder for planets/stars (screen-space rungs, cross-dissolve) ----
  const lod = createLodManager(scene, { jobBudgetMs: 3 });

  // ---- the home system (permanent, at absolute (0,0,0)) ----
  const home = buildHomeSystem(mulberry32(worldSeed ^ 0x5eed));
  home.pois.forEach((poi, i) => { poi.id = `home:${i}`; });
  scene.add(home.group);
  home.group.updateMatrixWorld(true);
  home.lodBodies.forEach((body) => lod.register(body));

  // stars — attached to the ship's position each frame so the backdrop is
  // infinite (they only rotate with the camera, never translate past you);
  // the shell sits beyond the beacon range but inside the far plane
  const stars = createStarfield({ count: 800, minRadius: 20000, spread: 20000, size: 26, opacity: 0.55, fog: false });
  tracker.track(stars.geometry);
  tracker.track(stars.material);
  scene.add(stars);

  // local dust — tiny soft points recycled around the ship so speed is
  // visible even in the emptiest stretch of space. The wrap span (2 × range)
  // must divide SECTOR exactly, or a floating-origin rebase would teleport
  // every particle by the remainder (6,000 % 800 = 400 — a visible pop).
  const dust = tracker.track(createDustField({ count: 260, range: 500, size: 3, opacity: 0.35 }));
  scene.add(dust.points);

  // ---- procedural sectors ----
  // The home system spans these cells; they get no random content.
  const isHomeCell = (x: number, y: number, z: number) =>
    x >= -2 && x <= 2 && z >= -2 && z <= 2 && y >= -1 && y <= 1;

  const lodHandles = new Map<SectorContent, LodBodyHandle[]>();
  const field = createSectorField(scene, {
    worldSeed,
    sectorSize: SECTOR,
    activeRange: ACTIVE_RANGE,
    reserved: isHomeCell,
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

  // ---- ship ----
  const ship = new THREE.Group();
  const shipBody = new THREE.Group(); // banked visually; `ship` carries the control frame
  const noseGeo = tracker.track(new THREE.ConeGeometry(0.8, 2.6, 4));
  noseGeo.rotateX(-Math.PI / 2); // nose toward -z (camera forward)
  shipBody.add(new THREE.Mesh(noseGeo, tracker.track(wireMat(1))));
  const wingGeo = tracker.track(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-2, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(2, 0, 1),
      new THREE.Vector3(-2, 0, 1),
    ]),
  );
  shipBody.add(new THREE.Line(wingGeo, tracker.track(new THREE.LineBasicMaterial({ color: 0xffffff }))));
  ship.add(shipBody);
  ship.position.set(0, 340, 12000); // just outside the outermost home orbit
  scene.add(ship);

  // ---- input ----
  const keys: Record<string, boolean> = {};
  const pointer = { x: 0, y: 0 };
  let pointerDown = false;

  // mutates the stable `pointer` — pointermove fires every frame while
  // steering, and a fresh object per event is per-frame garbage
  const toLocal = (clientX: number, clientY: number) => {
    const rect = container.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = ((clientY - rect.top) / rect.height) * 2 - 1;
  };
  const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
  const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
  // keyup never arrives for keys held across a focus loss (Cmd-Tab etc.),
  // which would leave the ship burning forever.
  const onBlur = () => { for (const code in keys) keys[code] = false; };
  const onPointerMove = (e: PointerEvent) => { toLocal(e.clientX, e.clientY); };
  const onPointerDown = () => { pointerDown = true; };
  const onPointerUp = () => { pointerDown = false; };
  const onTouchMove = (e: TouchEvent) => { toLocal(e.touches[0].clientX, e.touches[0].clientY); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  container.addEventListener('touchmove', onTouchMove, { passive: true });

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

  // Nearest body of the last completed HUD pass. `dist`/`radius`/`center`
  // also feed the speed law (one frame stale — <50 units at max speed) and
  // the soft altitude floor.
  const nearest = { name: '', dist: Infinity, radius: 0, center: new THREE.Vector3() };
  const poiPos = new THREE.Vector3();
  const considerPoi = (poi: Poi) => {
    poiPos.setFromMatrixPosition(poi.object.matrixWorld);
    const d = ship.position.distanceTo(poiPos) - poi.radius;
    if (d < nearest.dist) {
      nearest.dist = d;
      nearest.name = poi.name;
      nearest.radius = poi.radius;
      nearest.center.copy(poiPos);
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
  const attitude = { yaw: 0, pitch: -0.04 };
  const forward = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const shipAbs = new THREE.Vector3();
  const rebase = new THREE.Vector3();
  // scratch Euler for attitude → quaternion (a fresh one per frame is garbage)
  const scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  // start the camera in the chase pose — at the new world scale a swoop-in
  // from the scene origin would cross the whole home system
  ship.quaternion.setFromEuler(scratchEuler.set(attitude.pitch, attitude.yaw, 0));
  camera.position.copy(scratch.set(0, 2.6, 9).applyQuaternion(ship.quaternion).add(ship.position));
  camera.quaternion.copy(ship.quaternion);

  field.sync(shipAbs.copy(ship.position).add(origin), true);

  stage.start((dt, t) => {
    // steering
    let steerX = pointer.x;
    let steerY = pointer.y;
    const boost = pointerDown || keys.KeyW || keys.ArrowUp || keys.Space;
    if (keys.ArrowLeft || keys.KeyA) steerX = -0.7;
    if (keys.ArrowRight || keys.KeyD) steerX = 0.7;
    attitude.yaw -= steerX * 2.2 * dt;
    attitude.pitch -= steerY * 1.7 * dt;
    attitude.pitch = Math.max(-1.35, Math.min(1.35, attitude.pitch));
    ship.quaternion.setFromEuler(scratchEuler.set(attitude.pitch, attitude.yaw, 0));
    shipBody.rotation.z += (-steerX * 0.9 - shipBody.rotation.z) * Math.min(1, dt * 8);

    // distance-proportional speed law: time-to-contact stays roughly
    // constant, so approaches decelerate into a skim automatically. The cap
    // is direction-aware (pointing away from the body relaxes it — leaving
    // is never a grind) and a boost burn punches through it.
    forward.set(0, 0, -1).applyQuaternion(ship.quaternion);
    const approach = nearest.dist === Infinity
      ? -1
      : forward.dot(scratch.copy(nearest.center).sub(ship.position).normalize());
    const limit = speedLimit(nearest.dist, approach) * (boost ? BOOST_LIMIT_FACTOR : 1);
    const targetSpeed = Math.min(boost ? CRUISE_SPEED * BOOST_FACTOR : CRUISE_SPEED, limit);
    // asymmetric response: the boost kick is felt, the slowdown never slams
    const rate = velocity.length() < targetSpeed ? (boost ? ACCEL_RATE_BOOST : ACCEL_RATE) : DECEL_RATE;
    velocity.lerp(scratch.copy(forward).multiplyScalar(targetSpeed), Math.min(1, dt * rate));
    ship.position.addScaledVector(velocity, dt);

    // boost widens the FOV a touch (same cue as the Home throttle burn)
    const targetFov = boost ? BOOST_FOV : CRUISE_FOV;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
      camera.updateProjectionMatrix();
    }

    // floating origin: once the ship strays a sector from the render origin,
    // shift the whole render-local scene by an exact sector multiple — same
    // frame, before sync and render, so it is visually invisible
    const delta = computeRebase(ship.position, SECTOR);
    if (delta) {
      rebase.set(delta.x, delta.y, delta.z);
      ship.position.sub(rebase);
      camera.position.sub(rebase);
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

    // backdrop + dust follow the ship (render-local; a rebase wraps the dust
    // by whole sector multiples, which the modulo wrap absorbs in one step)
    stars.position.copy(ship.position);
    dust.update(dt, ship.position);

    // nearest-body HUD across home + all active sector POIs, plus discovery
    nearest.name = 'DEEP SPACE';
    nearest.dist = Infinity;
    nearest.radius = 0;
    for (const poi of home.pois) considerPoi(poi);
    field.forEachPoi(considerPoi);
    if (pingTimer > 0) {
      pingTimer -= dt;
      hud.ping.style.opacity = String(Math.max(0, Math.min(1, pingTimer / 1.5)));
    }
    hudTimer -= dt;
    if (hudTimer <= 0) {
      hudTimer = 0.1;
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

    // soft altitude floor: below 3% of the radius the ship is eased back out
    // to a 1.03r skim — no bounce, no damage, no fail state
    if (nearest.dist < nearest.radius * 0.03) {
      scratch.copy(ship.position).sub(nearest.center);
      const len = scratch.length();
      if (len > 1e-6) {
        scratch.multiplyScalar((nearest.radius * 1.03) / len).add(nearest.center);
        ship.position.lerp(scratch, Math.min(1, dt * 3));
      }
    }

    // chase camera
    const camTarget = scratch.set(0, 2.6, 9).applyQuaternion(ship.quaternion).add(ship.position);
    camera.position.lerp(camTarget, Math.min(1, dt * 5));
    camera.quaternion.slerp(ship.quaternion, Math.min(1, dt * 6));

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
        camera.position.sub(rebase); // keep the chase pose — no cross-sector swoop
        home.group.position.sub(rebase);
        home.group.updateMatrixWorld(true);
        field.applyOriginShift(rebase);
        beaconCellKey = '';
      }
      ship.position.set(x - origin.x, y - origin.y, z - origin.z);
      velocity.set(0, 0, 0);
      if (lookX !== undefined && lookY !== undefined && lookZ !== undefined) {
        const dir = scratch.set(lookX - x, lookY - y, lookZ - z).normalize();
        attitude.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        attitude.yaw = Math.atan2(-dir.x, -dir.z);
        ship.quaternion.setFromEuler(scratchEuler.set(attitude.pitch, attitude.yaw, 0));
        camera.position.copy(scratch.set(0, 2.6, 9).applyQuaternion(ship.quaternion).add(ship.position));
        camera.quaternion.copy(ship.quaternion);
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
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('touchmove', onTouchMove);
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

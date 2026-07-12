import * as THREE from 'three';
import { hashCoords, mulberry32 } from 'components/ephemeris/rng';
import {
  buildHomeSystem,
  buildSectorContent,
  softSprite,
  wireMat,
  type Poi,
  type SectorContent,
} from 'components/ephemeris/sectorContent';

export interface EphemerisHudElements {
  /** Name of the nearest body, e.g. "VELORA-3". */
  body: HTMLElement;
  /** Distance line, e.g. "142 km · APPROACH". */
  dist: HTMLElement;
  /** Ship speed, e.g. "55 km/s". */
  speed: HTMLElement;
  /** Current sector, e.g. "KHEVEL EXPANSE · 2.0.-1". */
  sector: HTMLElement;
  /** Running discovery tally, e.g. "5 CONTACTS LOGGED". */
  contacts: HTMLElement;
  /** Transient "NEW CONTACT" banner; the sim drives its opacity. */
  ping: HTMLElement;
}

/** Edge length of one cubic sector of procedural space. */
const SECTOR = 700;
/** Sectors are kept alive within this many cells of the ship (1 → 3×3×3). */
const ACTIVE_RANGE = 1;
/** First close approach within this many units of a POI's surface logs it. */
const DISCOVERY_RANGE = 60;
/** The HUD flags "APPROACH" inside this surface distance. */
const APPROACH_RANGE = 30;
/**
 * Beyond this radius the ship is gently curved back toward charted space.
 * Not a gameplay wall — float32 world coordinates lose visible precision
 * (jitter) past ~10^5, so the playable universe is capped well below that.
 * ~64 sectors of travel in any direction ≈ minutes of sustained boost.
 */
const MAX_RANGE = 45000;

/**
 * Mounts the EPHEMERIS solar-system simulation into `container` and starts
 * its render loop. Returns a dispose function that stops the loop, removes
 * listeners and frees all GPU resources.
 *
 * Space is effectively infinite: beyond the hand-authored home system, every
 * sector of the universe deterministically generates its own content
 * (asteroid clusters, nebulae, rogue planets, minor star systems, pulsars,
 * derelicts…) from its coordinates.
 *
 * The sim owns its canvas; HUD text is written into the provided elements so
 * the caller controls layout/styling without re-rendering per frame.
 */
export function createEphemeris(container: HTMLElement, hud: EphemerisHudElements): () => void {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    64,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.5,
    4000,
  );
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const worldSeed = Math.floor(Math.random() * 2 ** 31);

  // ---- the home system (permanent, at the origin) ----
  const home = buildHomeSystem(mulberry32(worldSeed ^ 0x5eed));
  home.pois.forEach((poi, i) => { poi.id = `home:${i}`; });
  scene.add(home.group);
  home.group.updateMatrixWorld(true);

  // stars — attached to the ship's position each frame so the backdrop is
  // infinite (they only rotate with the camera, never translate past you)
  const stars = (() => {
    const n = 800;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1600 + Math.random() * 900);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, transparent: true, opacity: 0.55 }),
    );
    points.frustumCulled = false;
    scene.add(points);
    return points;
  })();

  // local dust — tiny soft points recycled around the ship so speed is
  // visible even in the emptiest stretch of space
  const DUST_N = 260;
  const DUST_RANGE = 130;
  const dustPositions = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N * 3; i++) dustPositions[i] = (Math.random() - 0.5) * DUST_RANGE * 2;
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.6,
      map: softSprite,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  dust.frustumCulled = false;
  scene.add(dust);

  // ---- procedural sectors ----
  // Value is null for cells reserved by the home system (no random content).
  const activeSectors = new Map<string, SectorContent | null>();
  const buildQueue = new Set<string>();
  let cellX = NaN;
  let cellY = NaN;
  let cellZ = NaN;
  let cellKey = '';

  const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

  // The home system spans these cells; they get no random content.
  const isHomeCell = (x: number, y: number, z: number) =>
    x >= -1 && x <= 1 && z >= -1 && z <= 1 && y >= -1 && y <= 0;

  function buildSector(key: string) {
    if (activeSectors.has(key)) return;
    const [x, y, z] = key.split(',').map(Number);
    if (isHomeCell(x, y, z)) {
      activeSectors.set(key, null);
      return;
    }
    const rand = mulberry32(hashCoords(x, y, z, worldSeed));
    const center = new THREE.Vector3((x + 0.5) * SECTOR, (y + 0.5) * SECTOR, (z + 0.5) * SECTOR);
    const content = buildSectorContent(rand, SECTOR, center);
    content.pois.forEach((poi, i) => { poi.id = `${key}:${i}`; });
    scene.add(content.group);
    // POI distances read matrixWorld, so make it valid before the next render
    content.group.updateMatrixWorld(true);
    activeSectors.set(key, content);
  }

  function syncSectors(immediate: boolean) {
    const cx = Math.floor(ship.position.x / SECTOR);
    const cy = Math.floor(ship.position.y / SECTOR);
    const cz = Math.floor(ship.position.z / SECTOR);
    const cellChanged = cx !== cellX || cy !== cellY || cz !== cellZ;
    // most frames: same cell, nothing queued — skip all set/string work
    if (!cellChanged && !immediate && buildQueue.size === 0) return;

    if (cellChanged || immediate) {
      cellX = cx; cellY = cy; cellZ = cz;
      cellKey = keyOf(cx, cy, cz);
      const needed = new Set<string>();
      for (let dx = -ACTIVE_RANGE; dx <= ACTIVE_RANGE; dx++)
        for (let dy = -ACTIVE_RANGE; dy <= ACTIVE_RANGE; dy++)
          for (let dz = -ACTIVE_RANGE; dz <= ACTIVE_RANGE; dz++)
            needed.add(keyOf(cx + dx, cy + dy, cz + dz));

      for (const [key, content] of activeSectors) {
        if (!needed.has(key)) {
          if (content) {
            scene.remove(content.group);
            content.dispose();
          }
          activeSectors.delete(key);
        }
      }
      for (const key of buildQueue) if (!needed.has(key)) buildQueue.delete(key);
      for (const key of needed) {
        if (activeSectors.has(key)) continue;
        if (immediate) {
          buildQueue.delete(key);
          buildSector(key);
        } else {
          buildQueue.add(key);
        }
      }
    }
    // spread construction over frames to avoid hitches while flying
    let built = 0;
    for (const key of buildQueue) {
      if (built++ >= 2) break;
      buildQueue.delete(key);
      buildSector(key);
    }
  }

  // ---- ship ----
  const ship = new THREE.Group();
  const shipBody = new THREE.Group(); // banked visually; `ship` carries the control frame
  const noseGeo = new THREE.ConeGeometry(0.8, 2.6, 4);
  noseGeo.rotateX(-Math.PI / 2); // nose toward -z (camera forward)
  shipBody.add(new THREE.Mesh(noseGeo, wireMat(1)));
  const wingGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(2, 0, 1),
    new THREE.Vector3(-2, 0, 1),
  ]);
  shipBody.add(new THREE.Line(wingGeo, new THREE.LineBasicMaterial({ color: 0xffffff })));
  ship.add(shipBody);
  ship.position.set(0, 40, 900);
  scene.add(ship);

  // ---- input ----
  const keys: Record<string, boolean> = {};
  let pointer = { x: 0, y: 0 };
  let pointerDown = false;

  const toLocal = (clientX: number, clientY: number) => {
    const rect = container.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: ((clientY - rect.top) / rect.height) * 2 - 1,
    };
  };
  const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
  const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
  // keyup never arrives for keys held across a focus loss (Cmd-Tab etc.),
  // which would leave the ship burning forever.
  const onBlur = () => { for (const code in keys) keys[code] = false; };
  const onPointerMove = (e: PointerEvent) => { pointer = toLocal(e.clientX, e.clientY); };
  const onPointerDown = () => { pointerDown = true; };
  const onPointerUp = () => { pointerDown = false; };
  const onTouchMove = (e: TouchEvent) => { pointer = toLocal(e.touches[0].clientX, e.touches[0].clientY); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  container.addEventListener('touchmove', onTouchMove, { passive: true });

  const onResize = () => {
    const w = container.clientWidth;
    const h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

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
  setHudText(hud.contacts, '0 CONTACTS LOGGED');

  const nearest = { name: '', dist: 0 };
  const poiPos = new THREE.Vector3();
  const considerPoi = (poi: Poi) => {
    poiPos.setFromMatrixPosition(poi.object.matrixWorld);
    const d = ship.position.distanceTo(poiPos) - poi.radius;
    if (d < nearest.dist) {
      nearest.dist = d;
      nearest.name = poi.name;
    }
    if (d < DISCOVERY_RANGE && poi.id && !discoveredIds.has(poi.id)) {
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
  let t = 0;
  let rafId = 0;
  let last = performance.now();

  syncSectors(true);

  function tick(now: number) {
    rafId = requestAnimationFrame(tick);
    // rAF timestamps can predate `last` on the first frame — clamp to 0.
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    t += dt;

    // steering
    let steerX = pointer.x;
    let steerY = pointer.y;
    const boost = pointerDown || keys.KeyW || keys.ArrowUp || keys.Space;
    if (keys.ArrowLeft || keys.KeyA) steerX = -0.7;
    if (keys.ArrowRight || keys.KeyD) steerX = 0.7;
    attitude.yaw -= steerX * 2.2 * dt;
    attitude.pitch -= steerY * 1.7 * dt;
    attitude.pitch = Math.max(-1.35, Math.min(1.35, attitude.pitch));
    ship.quaternion.setFromEuler(new THREE.Euler(attitude.pitch, attitude.yaw, 0, 'YXZ'));
    shipBody.rotation.z += (-steerX * 0.9 - shipBody.rotation.z) * Math.min(1, dt * 8);

    forward.set(0, 0, -1).applyQuaternion(ship.quaternion);
    velocity.lerp(scratch.copy(forward).multiplyScalar(boost ? 170 : 55), Math.min(1, dt * 2.2));
    ship.position.addScaledVector(velocity, dt);
    // precision guard — see MAX_RANGE
    const range = ship.position.length();
    if (range > MAX_RANGE) {
      ship.position.multiplyScalar(1 - ((range - MAX_RANGE) / range) * Math.min(1, dt * 2));
    }

    // world updates
    home.update?.(dt, t);
    syncSectors(false);
    for (const content of activeSectors.values()) content?.update?.(dt, t);

    // backdrop + dust follow the ship
    stars.position.copy(ship.position);
    {
      const sx = ship.position.x;
      const sy = ship.position.y;
      const sz = ship.position.z;
      const span = DUST_RANGE * 2;
      let moved = false;
      // O(1) modulo wrap per component — safe even across huge warp jumps
      const wrap = (idx: number, center: number) => {
        const d = dustPositions[idx] - center;
        if (d > DUST_RANGE || d < -DUST_RANGE) {
          dustPositions[idx] = center + ((((d + DUST_RANGE) % span) + span) % span) - DUST_RANGE;
          moved = true;
        }
      };
      for (let i = 0; i < DUST_N; i++) {
        wrap(i * 3, sx);
        wrap(i * 3 + 1, sy);
        wrap(i * 3 + 2, sz);
      }
      if (moved) dustGeo.attributes.position.needsUpdate = true;
    }

    // nearest-body HUD across home + all active sector POIs, plus discovery
    nearest.name = 'THE SUN';
    nearest.dist = ship.position.length() - 26;
    for (const poi of home.pois) considerPoi(poi);
    for (const content of activeSectors.values()) {
      if (content) for (const poi of content.pois) considerPoi(poi);
    }
    if (pingTimer > 0) {
      pingTimer -= dt;
      hud.ping.style.opacity = String(Math.max(0, Math.min(1, pingTimer / 1.5)));
    }
    setHudText(hud.body, nearest.name);
    setHudText(
      hud.dist,
      `${Math.max(0, Math.floor(nearest.dist))} km${nearest.dist < APPROACH_RANGE ? ' · APPROACH' : ''}`,
    );
    setHudText(hud.speed, `${Math.floor(velocity.length())} km/s`);
    const cellContent = activeSectors.get(cellKey);
    setHudText(
      hud.sector,
      isHomeCell(cellX, cellY, cellZ)
        ? 'HOME SYSTEM'
        : `${cellContent ? `${cellContent.name} · ` : ''}${cellX}.${cellY}.${cellZ}`,
    );

    // chase camera
    const camTarget = scratch.set(0, 2.6, 9).applyQuaternion(ship.quaternion).add(ship.position);
    camera.position.lerp(camTarget, Math.min(1, dt * 5));
    camera.quaternion.slerp(ship.quaternion, Math.min(1, dt * 6));
    renderer.render(scene, camera);
  }
  rafId = requestAnimationFrame(tick);

  // debug/testing hook — lets tests (and the curious) jump across the universe
  interface EphemerisDebug {
    warp: (x: number, y: number, z: number, lookX?: number, lookY?: number, lookZ?: number) => void;
    pois: () => Array<{ name: string; x: number; y: number; z: number; radius: number }>;
  }
  const debugHandle: EphemerisDebug = {
    warp: (x, y, z, lookX, lookY, lookZ) => {
      ship.position.set(x, y, z);
      velocity.set(0, 0, 0);
      if (lookX !== undefined && lookY !== undefined && lookZ !== undefined) {
        const dir = scratch.set(lookX - x, lookY - y, lookZ - z).normalize();
        attitude.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        attitude.yaw = Math.atan2(-dir.x, -dir.z);
        ship.quaternion.setFromEuler(new THREE.Euler(attitude.pitch, attitude.yaw, 0, 'YXZ'));
        camera.position.copy(scratch.set(0, 2.6, 9).applyQuaternion(ship.quaternion).add(ship.position));
        camera.quaternion.copy(ship.quaternion);
      }
      syncSectors(true);
    },
    pois: () => {
      const all: Array<{ name: string; x: number; y: number; z: number; radius: number }> = [];
      const collect = (poi: Poi) => {
        poi.object.getWorldPosition(poiPos);
        all.push({ name: poi.name, x: poiPos.x, y: poiPos.y, z: poiPos.z, radius: poi.radius });
      };
      home.pois.forEach(collect);
      for (const content of activeSectors.values()) content?.pois.forEach(collect);
      return all;
    },
  };
  const globalHost = window as unknown as { __EPHEMERIS?: EphemerisDebug };
  globalHost.__EPHEMERIS = debugHandle;

  return () => {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    if (globalHost.__EPHEMERIS === debugHandle) delete globalHost.__EPHEMERIS;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('touchmove', onTouchMove);
    for (const content of activeSectors.values()) {
      if (content) {
        scene.remove(content.group);
        content.dispose();
      }
    }
    activeSectors.clear();
    home.dispose();
    // Frees what this mount created (ship, stars, dust, home meshes). Shared
    // module-level assets from sectorContent get disposed too when reachable,
    // which is safe: three.js re-uploads a disposed resource on next use.
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const material = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

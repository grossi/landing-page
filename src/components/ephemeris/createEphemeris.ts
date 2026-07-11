import * as THREE from 'three';
import { hashCoords, makeName, mulberry32 } from 'components/ephemeris/rng';
import {
  buildSectorContent,
  sectorName,
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

/**
 * Mounts the EPHEMERIS solar-system simulation into `container` and starts
 * its render loop. Returns a dispose function that stops the loop, removes
 * listeners and frees all GPU resources.
 *
 * Space is infinite: beyond the hand-authored home system, every sector of
 * the universe deterministically generates its own content (asteroid
 * clusters, nebulae, rogue planets, minor star systems) from its coordinates.
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

  // ---- the home system (hand-authored, permanent, at the origin) ----
  const homeRand = mulberry32(worldSeed ^ 0x5eed);
  const homePois: Poi[] = [];

  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(26, 2), wireMat(0.9));
  scene.add(sun);
  homePois.push({ name: 'THE SUN', object: sun, radius: 26 });
  const haloSpins: number[] = [];
  for (let i = 0; i < 3; i++) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(34 + i * 7, 0.12, 4, 64), wireMat(0.22 - i * 0.06));
    halo.rotation.x = homeRand() * Math.PI;
    halo.rotation.y = homeRand() * Math.PI;
    haloSpins.push(0.05 + homeRand() * 0.1);
    sun.add(halo);
  }

  interface MoonData { r: number; speed: number; phase: number }
  interface PlanetData {
    r: number;
    speed: number;
    phase: number;
    spin: number;
    moons: THREE.Mesh[];
  }

  const planets: THREE.Mesh[] = [];
  const orbitMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
  const ORBIT_RADII = [95, 150, 215, 300, 400, 520, 660];
  for (let i = 0; i < ORBIT_RADII.length; i++) {
    const radius = 3.5 + homeRand() * 10;
    const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, radius > 9 ? 1 : 0), wireMat(0.85));
    const data: PlanetData = {
      r: ORBIT_RADII[i],
      speed: (0.5 / Math.pow(ORBIT_RADII[i] / 95, 1.5)) * 0.06,
      phase: homeRand() * Math.PI * 2,
      spin: 0.1 + homeRand() * 0.4,
      moons: [],
    };
    planet.userData = data;
    homePois.push({ name: `${makeName(homeRand)}-${i + 1}`, object: planet, radius });

    const orbitPoints: THREE.Vector3[] = [];
    for (let a = 0; a <= 96; a++) {
      const angle = (a / 96) * Math.PI * 2;
      orbitPoints.push(new THREE.Vector3(Math.cos(angle) * data.r, 0, Math.sin(angle) * data.r));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPoints), orbitMat));

    if (homeRand() < 0.4) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.9, 0.15, 4, 42), wireMat(0.5));
      ring.rotation.x = Math.PI / 2 + (homeRand() - 0.5) * 0.6;
      planet.add(ring);
    }

    const moonCount = homeRand() < 0.5 ? 1 + Math.floor(homeRand() * 2) : 0;
    for (let k = 0; k < moonCount; k++) {
      const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.22, 0), wireMat(0.7));
      const moonData: MoonData = {
        r: radius * (2.6 + k * 1.4),
        speed: 0.5 + homeRand(),
        phase: homeRand() * Math.PI * 2,
      };
      moon.userData = moonData;
      planet.add(moon);
      data.moons.push(moon);
    }
    planets.push(planet);
    scene.add(planet);
  }

  // asteroid belt between the 4th and 5th orbits
  const belt = new THREE.Group();
  {
    const n = 500;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = homeRand() * Math.PI * 2;
      const r = 340 + homeRand() * 34;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (homeRand() - 0.5) * 9;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    belt.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0.55 }),
      ),
    );
    scene.add(belt);
  }

  // comet on an eccentric orbit, dragging a trail
  const comet = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), wireMat(0.9));
  scene.add(comet);
  homePois.push({ name: 'THE COMET', object: comet, radius: 2 });
  const TRAIL_LENGTH = 70;
  const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  scene.add(new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })));

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
  const activeSectors = new Map<string, SectorContent>();
  const sectorNames = new Map<string, string>();
  const buildQueue: string[] = [];

  const sectorOf = (v: THREE.Vector3) => ({
    x: Math.floor(v.x / SECTOR),
    y: Math.floor(v.y / SECTOR),
    z: Math.floor(v.z / SECTOR),
  });
  const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

  // The home system spans these cells; they get no random content.
  const isHomeCell = (x: number, y: number, z: number) =>
    x >= -1 && x <= 1 && z >= -1 && z <= 1 && y >= -1 && y <= 0;

  function buildSector(key: string) {
    if (activeSectors.has(key)) return;
    const [x, y, z] = key.split(',').map(Number);
    const rand = mulberry32(hashCoords(x, y, z, worldSeed));
    sectorNames.set(key, `${sectorName(rand)} ${['EXPANSE', 'REACH', 'DRIFT', 'VERGE', 'DEEP'][Math.floor(rand() * 5)]}`);
    if (isHomeCell(x, y, z)) {
      // the hand-authored home system owns these cells; keep an empty entry
      // so this sector isn't re-queued every frame
      activeSectors.set(key, { group: new THREE.Group(), pois: [], dispose: () => {} });
      return;
    }
    const center = new THREE.Vector3((x + 0.5) * SECTOR, (y + 0.5) * SECTOR, (z + 0.5) * SECTOR);
    const content = buildSectorContent(rand, SECTOR, center);
    scene.add(content.group);
    activeSectors.set(key, content);
  }

  function syncSectors(shipPos: THREE.Vector3, immediate: boolean) {
    const c = sectorOf(shipPos);
    const needed = new Set<string>();
    for (let dx = -ACTIVE_RANGE; dx <= ACTIVE_RANGE; dx++)
      for (let dy = -ACTIVE_RANGE; dy <= ACTIVE_RANGE; dy++)
        for (let dz = -ACTIVE_RANGE; dz <= ACTIVE_RANGE; dz++)
          needed.add(keyOf(c.x + dx, c.y + dy, c.z + dz));

    for (const [key, content] of activeSectors) {
      if (!needed.has(key)) {
        scene.remove(content.group);
        content.dispose();
        activeSectors.delete(key);
      }
    }
    for (const key of needed) {
      if (!activeSectors.has(key) && !buildQueue.includes(key)) {
        if (immediate) buildSector(key);
        else buildQueue.push(key);
      }
    }
    // spread construction over frames to avoid hitches while flying
    for (let n = 0; n < 2 && buildQueue.length; n++) {
      const key = buildQueue.shift()!;
      const [x, y, z] = key.split(',').map(Number);
      if (Math.max(Math.abs(x - c.x), Math.abs(y - c.y), Math.abs(z - c.z)) <= ACTIVE_RANGE) {
        buildSector(key);
      }
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
  const onPointerMove = (e: PointerEvent) => { pointer = toLocal(e.clientX, e.clientY); };
  const onPointerDown = () => { pointerDown = true; };
  const onPointerUp = () => { pointerDown = false; };
  const onTouchMove = (e: TouchEvent) => { pointer = toLocal(e.touches[0].clientX, e.touches[0].clientY); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
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

  // ---- simulation loop ----
  const velocity = new THREE.Vector3();
  const attitude = { yaw: 0, pitch: -0.04 };
  const forward = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  const poiPos = new THREE.Vector3();
  let t = 0;
  let rafId = 0;
  let last = performance.now();
  let discovered = 0;
  let pingTimer = 0;

  syncSectors(ship.position, true);

  function tick(now: number) {
    rafId = requestAnimationFrame(tick);
    // rAF timestamps can predate `last` on the first frame — clamp to 0.
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    t += dt;

    // home-system orbits
    sun.rotation.y += dt * 0.06;
    const pulse = 1 + Math.sin(t * 1.3) * 0.025;
    sun.scale.set(pulse, pulse, pulse);
    sun.children.forEach((halo, i) => { halo.rotation.z += haloSpins[i] * dt; });
    for (const planet of planets) {
      const data = planet.userData as PlanetData;
      const angle = data.phase + t * data.speed;
      planet.position.set(Math.cos(angle) * data.r, 0, Math.sin(angle) * data.r);
      planet.rotation.y += data.spin * dt;
      for (const moon of data.moons) {
        const moonData = moon.userData as MoonData;
        const moonAngle = moonData.phase + t * moonData.speed;
        moon.position.set(Math.cos(moonAngle) * moonData.r, 0, Math.sin(moonAngle) * moonData.r);
      }
    }
    belt.rotation.y += dt * 0.012;

    // comet ellipse + trail
    const cometAngle = t * 0.045 + 2;
    comet.position.set(Math.cos(cometAngle) * 620, Math.sin(cometAngle * 2) * 18, Math.sin(cometAngle) * 260);
    for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
      trailPositions[i * 3] = trailPositions[(i - 1) * 3];
      trailPositions[i * 3 + 1] = trailPositions[(i - 1) * 3 + 1];
      trailPositions[i * 3 + 2] = trailPositions[(i - 1) * 3 + 2];
    }
    trailPositions[0] = comet.position.x;
    trailPositions[1] = comet.position.y;
    trailPositions[2] = comet.position.z;
    trailGeo.attributes.position.needsUpdate = true;

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

    // sectors follow the ship
    syncSectors(ship.position, false);
    for (const content of activeSectors.values()) content.update?.(dt, t);

    // backdrop + dust follow the ship
    stars.position.copy(ship.position);
    for (let i = 0; i < DUST_N; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const idx = i * 3 + axis;
        const shipAxis = axis === 0 ? ship.position.x : axis === 1 ? ship.position.y : ship.position.z;
        while (dustPositions[idx] - shipAxis > DUST_RANGE) dustPositions[idx] -= DUST_RANGE * 2;
        while (dustPositions[idx] - shipAxis < -DUST_RANGE) dustPositions[idx] += DUST_RANGE * 2;
      }
    }
    dustGeo.attributes.position.needsUpdate = true;

    // nearest-body HUD across home + all active sector POIs, plus discovery
    let nearestName = 'THE SUN';
    let nearestDist = ship.position.length() - 26;
    const consider = (poi: Poi) => {
      poi.object.getWorldPosition(poiPos);
      const d = ship.position.distanceTo(poiPos) - poi.radius;
      if (d < nearestDist) { nearestDist = d; nearestName = poi.name; }
      if (!poi.discovered && d < 60) {
        poi.discovered = true;
        discovered++;
        pingTimer = 4;
        hud.ping.textContent = `NEW CONTACT · ${poi.name}`;
        hud.contacts.textContent = `${discovered} CONTACT${discovered === 1 ? '' : 'S'} LOGGED`;
      }
    };
    for (const poi of homePois) consider(poi);
    for (const content of activeSectors.values()) for (const poi of content.pois) consider(poi);
    if (pingTimer > 0) {
      pingTimer -= dt;
      hud.ping.style.opacity = String(Math.max(0, Math.min(1, pingTimer / 1.5)));
    }
    hud.body.textContent = nearestName;
    hud.dist.textContent = `${Math.max(0, Math.floor(nearestDist))} km${nearestDist < 30 ? ' · APPROACH' : ''}`;
    hud.speed.textContent = `${Math.floor(velocity.length())} km/s`;

    const cell = sectorOf(ship.position);
    const cellKey = keyOf(cell.x, cell.y, cell.z);
    const isHome = isHomeCell(cell.x, cell.y, cell.z);
    hud.sector.textContent = isHome
      ? 'HOME SYSTEM'
      : `${sectorNames.get(cellKey) ?? ''} · ${cell.x}.${cell.y}.${cell.z}`;

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
  (window as unknown as { __EPHEMERIS?: EphemerisDebug }).__EPHEMERIS = {
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
      syncSectors(ship.position, true);
    },
    pois: () => {
      const all: Array<{ name: string; x: number; y: number; z: number; radius: number }> = [];
      const collect = (poi: Poi) => {
        poi.object.getWorldPosition(poiPos);
        all.push({ name: poi.name, x: poiPos.x, y: poiPos.y, z: poiPos.z, radius: poi.radius });
      };
      homePois.forEach(collect);
      for (const content of activeSectors.values()) content.pois.forEach(collect);
      return all;
    },
  };

  return () => {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    delete (window as unknown as { __EPHEMERIS?: EphemerisDebug }).__EPHEMERIS;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('touchmove', onTouchMove);
    for (const content of activeSectors.values()) {
      scene.remove(content.group);
      content.dispose();
    }
    activeSectors.clear();
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

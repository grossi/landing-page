import * as THREE from 'three';
import { makeName, pickFrom } from 'components/ephemeris/rng';

/** A named place the HUD can point at (and, later, "discover"). */
export interface Poi {
  name: string;
  object: THREE.Object3D;
  /** Approximate radius of the thing, so distance reads as surface distance. */
  radius: number;
  /** Stable identity across sector rebuilds; assigned by the engine. */
  id?: string;
}

export interface SectorContent {
  /** Display name, e.g. "KHEVEL EXPANSE" or "HOME SYSTEM". */
  name: string;
  group: THREE.Group;
  pois: Poi[];
  update?: (dt: number, t: number) => void;
  /** Frees only resources created for this sector (shared assets stay). */
  dispose: () => void;
}

// ---- shared assets ----
// Created once at module scope and reused by every sector for the lifetime
// of the app; intentionally never disposed (three.js re-uploads a disposed
// resource on next use, so even a full renderer teardown/remount is safe).

export const wireMat = (opacity: number) =>
  new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity });

const ICO_LOW = new THREE.IcosahedronGeometry(1, 0);
const ICO_MID = new THREE.IcosahedronGeometry(1, 1);
const ICO_HIGH = new THREE.IcosahedronGeometry(1, 2);
const RING = new THREE.TorusGeometry(1.9, 0.1, 4, 42);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const BEAM = new THREE.ConeGeometry(1, 1, 6, 1, true);
const MAT_BRIGHT = wireMat(0.9);
const MAT_BODY = wireMat(0.85);
const MAT_DIM = wireMat(0.6);
const MAT_RING = wireMat(0.5);
const MAT_BEAM = wireMat(0.16);
const ORBIT_MAT = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
const TRAIL_MAT = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
const BELT_MAT = new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0.55 });

// unit circle for orbit lines, scaled per orbit
const UNIT_CIRCLE = (() => {
  const pts: THREE.Vector3[] = [];
  for (let a = 0; a <= 96; a++) {
    const angle = (a / 96) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
})();

// soft round sprite for nebula/dust points
export const softSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'); // null in canvas-less test environments
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
})();

const NEBULA_MAT = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 7,
  map: softSprite,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});

// ---- orbit helper shared by every builder ----

interface Orbiter {
  mesh: THREE.Object3D;
  r: number;
  speed: number;
  phase: number;
  /** Vertical wobble factor; 0/undefined keeps the orbit flat. */
  tilt?: number;
}

function updateOrbiters(orbiters: Orbiter[], t: number) {
  for (const o of orbiters) {
    const a = o.phase + t * o.speed;
    o.mesh.position.set(
      Math.cos(a) * o.r,
      o.tilt ? Math.sin(a) * o.r * o.tilt : 0,
      Math.sin(a) * o.r,
    );
  }
}

// ---- archetype builders ----
// Each places content in sector-local coordinates around (0,0,0); the caller
// positions the group at the sector centre. Geometries created here (points,
// per-sector lines) are pushed to `own` and disposed with the sector.

type Built = Omit<SectorContent, 'dispose' | 'name'>;
type Builder = (rand: () => number, own: THREE.BufferGeometry[]) => Built;

const gaussish = (rand: () => number) => (rand() + rand() + rand()) / 3 - 0.5;

const asteroidCluster: Builder = (rand) => {
  const group = new THREE.Group();
  const spread = 130 + rand() * 90;
  const count = 40 + Math.floor(rand() * 50);
  for (let i = 0; i < count; i++) {
    const rock = new THREE.Mesh(ICO_LOW, MAT_DIM);
    rock.position.set(gaussish(rand) * spread * 2, gaussish(rand) * spread, gaussish(rand) * spread * 2);
    rock.scale.setScalar(0.8 + rand() * 5);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    group.add(rock);
  }
  const spin = (rand() - 0.5) * 0.02;
  return {
    group,
    pois: [{ name: `${makeName(rand)} CLUSTER`, object: group, radius: spread }],
    update: (dt) => { group.rotation.y += spin * dt; },
  };
};

const nebula: Builder = (rand, own) => {
  const group = new THREE.Group();
  const blobs = 2 + Math.floor(rand() * 3);
  const total = 380 + Math.floor(rand() * 280);
  const positions = new Float32Array(total * 3);
  const reach = 150 + rand() * 110;
  let i = 0;
  for (let b = 0; b < blobs; b++) {
    const cx = (rand() - 0.5) * reach * 1.4;
    const cy = (rand() - 0.5) * reach * 0.6;
    const cz = (rand() - 0.5) * reach * 1.4;
    const r = reach * (0.4 + rand() * 0.5);
    // last blob takes the rounding remainder so no point is left at (0,0,0)
    const share = b === blobs - 1 ? total - i : Math.floor(total / blobs);
    for (let k = 0; k < share; k++, i++) {
      positions[i * 3] = cx + gaussish(rand) * r * 2;
      positions[i * 3 + 1] = cy + gaussish(rand) * r;
      positions[i * 3 + 2] = cz + gaussish(rand) * r * 2;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  own.push(geometry);
  group.add(new THREE.Points(geometry, NEBULA_MAT));
  // a few protostars embedded in the cloud
  const stars = 1 + Math.floor(rand() * 3);
  for (let s = 0; s < stars; s++) {
    const star = new THREE.Mesh(ICO_MID, MAT_BRIGHT);
    star.position.set((rand() - 0.5) * reach, (rand() - 0.5) * reach * 0.5, (rand() - 0.5) * reach);
    star.scale.setScalar(2 + rand() * 3);
    group.add(star);
  }
  const spin = (rand() - 0.5) * 0.014;
  return {
    group,
    pois: [{ name: `${makeName(rand)} NEBULA`, object: group, radius: reach }],
    update: (dt) => { group.rotation.y += spin * dt; },
  };
};

const roguePlanet: Builder = (rand) => {
  const group = new THREE.Group();
  const radius = 8 + rand() * 9;
  const planet = new THREE.Mesh(ICO_MID, MAT_BODY);
  planet.scale.setScalar(radius);
  group.add(planet);
  if (rand() < 0.45) {
    const ring = new THREE.Mesh(RING, MAT_RING);
    ring.scale.setScalar(radius);
    ring.rotation.x = Math.PI / 2 + (rand() - 0.5) * 0.6;
    group.add(ring);
  }
  const moons: Orbiter[] = [];
  const moonCount = Math.floor(rand() * 3);
  for (let k = 0; k < moonCount; k++) {
    const moon = new THREE.Mesh(ICO_LOW, MAT_DIM);
    moon.scale.setScalar(radius * 0.2);
    group.add(moon);
    moons.push({ mesh: moon, r: radius * (2.6 + k * 1.5), speed: 0.3 + rand() * 0.6, phase: rand() * Math.PI * 2 });
  }
  const spin = 0.08 + rand() * 0.25;
  const name = `${makeName(rand)}-${1 + Math.floor(rand() * 8)}`;
  return {
    group,
    pois: [{ name, object: planet, radius }],
    update: (dt, t) => {
      planet.rotation.y += spin * dt;
      updateOrbiters(moons, t);
    },
  };
};

const miniSystem: Builder = (rand) => {
  const group = new THREE.Group();
  const starName = makeName(rand);
  const starRadius = 9 + rand() * 7;
  const star = new THREE.Mesh(ICO_MID, MAT_BRIGHT);
  star.scale.setScalar(starRadius);
  group.add(star);
  const halo = new THREE.Mesh(RING, MAT_RING);
  halo.scale.setScalar(starRadius * 0.85);
  halo.rotation.x = rand() * Math.PI;
  group.add(halo);

  const pois: Poi[] = [{ name: starName, object: star, radius: starRadius }];
  const planets: Orbiter[] = [];
  const count = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const orbitR = starRadius * 3 + 34 * (i + 1) + rand() * 20;
    const radius = 2 + rand() * 5;
    const planet = new THREE.Mesh(ICO_LOW, MAT_BODY);
    planet.scale.setScalar(radius);
    group.add(planet);
    const orbit = new THREE.Line(UNIT_CIRCLE, ORBIT_MAT);
    orbit.scale.setScalar(orbitR);
    group.add(orbit);
    planets.push({ mesh: planet, r: orbitR, speed: (0.5 / Math.pow(orbitR / 40, 1.5)) * 0.5, phase: rand() * Math.PI * 2 });
    pois.push({ name: `${starName}-${i + 1}`, object: planet, radius });
  }
  // the whole system tilts a little
  group.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
  return {
    group,
    pois,
    update: (dt, t) => {
      star.rotation.y += dt * 0.06;
      updateOrbiters(planets, t);
    },
  };
};

const binaryStars: Builder = (rand) => {
  const group = new THREE.Group();
  const name = makeName(rand);
  const separation = 20 + rand() * 16;
  const speed = 0.22 + rand() * 0.2; // shared — the pair stays opposed
  const stars: Orbiter[] = [];
  for (let i = 0; i < 2; i++) {
    const radius = 6 + rand() * 5;
    const star = new THREE.Mesh(ICO_MID, MAT_BRIGHT);
    star.scale.setScalar(radius);
    group.add(star);
    const halo = new THREE.Mesh(RING, MAT_RING);
    // child of a star scaled by `radius`, so this is in star units
    halo.scale.setScalar(0.8);
    halo.rotation.x = rand() * Math.PI;
    star.add(halo);
    stars.push({ mesh: star, r: separation, speed, phase: i * Math.PI });
  }
  const orbit = new THREE.Line(UNIT_CIRCLE, ORBIT_MAT);
  orbit.scale.setScalar(separation);
  group.add(orbit);
  return {
    group,
    pois: [{ name: `${name} BINARY`, object: group, radius: separation + 14 }],
    update: (_dt, t) => { updateOrbiters(stars, t); },
  };
};

const pulsar: Builder = (rand) => {
  const group = new THREE.Group();
  const core = new THREE.Mesh(ICO_MID, MAT_BRIGHT);
  const coreSize = 3.5 + rand() * 2;
  core.scale.setScalar(coreSize);
  group.add(core);
  // two opposed lighthouse beams, tilted off the spin axis
  const beams = new THREE.Group();
  for (const dir of [1, -1]) {
    const beam = new THREE.Mesh(BEAM, MAT_BEAM);
    beam.scale.set(7, 150, 7);
    beam.position.y = dir * 75;
    if (dir === 1) beam.rotation.z = Math.PI;
    beams.add(beam);
  }
  beams.rotation.x = 0.5 + rand() * 0.5;
  group.add(beams);
  const spin = 1.4 + rand() * 1.2;
  const phase = rand() * Math.PI * 2;
  return {
    group,
    pois: [{ name: `PULSAR ${makeName(rand)}`, object: core, radius: 8 }],
    update: (dt, t) => {
      beams.rotation.y += spin * dt;
      core.scale.setScalar(coreSize * (1 + Math.sin(phase + t * 6) * 0.16));
    },
  };
};

const monolithField: Builder = (rand) => {
  const group = new THREE.Group();
  const count = 6 + Math.floor(rand() * 9);
  const spread = 90 + rand() * 70;
  for (let i = 0; i < count; i++) {
    const monolith = new THREE.Mesh(BOX, MAT_DIM);
    const h = 18 + rand() * 30;
    monolith.scale.set(2 + rand() * 2.5, h, 1.2 + rand() * 1.6);
    const a = rand() * Math.PI * 2;
    const r = rand() * spread;
    monolith.position.set(Math.cos(a) * r, (rand() - 0.5) * 30, Math.sin(a) * r);
    monolith.rotation.y = rand() * Math.PI;
    group.add(monolith);
  }
  const spin = (rand() - 0.5) * 0.01;
  return {
    group,
    pois: [{ name: `THE ${makeName(rand)} MONOLITHS`, object: group, radius: spread }],
    update: (dt) => { group.rotation.y += spin * dt; },
  };
};

const derelictStation: Builder = (rand) => {
  const group = new THREE.Group();
  const hull = new THREE.Mesh(CYL, MAT_DIM);
  hull.scale.set(6, 34, 6);
  group.add(hull);
  const ring = new THREE.Mesh(RING, MAT_RING);
  ring.scale.setScalar(11);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const pods = 2 + Math.floor(rand() * 4);
  for (let i = 0; i < pods; i++) {
    const pod = new THREE.Mesh(BOX, MAT_DIM);
    pod.scale.set(4 + rand() * 5, 3 + rand() * 3, 3 + rand() * 3);
    pod.position.set((rand() - 0.5) * 14, (rand() - 0.5) * 26, (rand() - 0.5) * 14);
    pod.rotation.y = rand() * Math.PI;
    group.add(pod);
  }
  // a broken-off spar drifting nearby
  const spar = new THREE.Mesh(CYL, MAT_DIM);
  spar.scale.set(1, 18, 1);
  spar.position.set(30 + rand() * 25, (rand() - 0.5) * 20, (rand() - 0.5) * 30);
  spar.rotation.set(rand() * Math.PI, 0, rand() * Math.PI);
  group.add(spar);
  const tumbleX = (rand() - 0.5) * 0.08;
  const tumbleY = (rand() - 0.5) * 0.12;
  return {
    group,
    pois: [{ name: `${makeName(rand)} STATION (DERELICT)`, object: group, radius: 26 }],
    update: (dt) => {
      group.rotation.x += tumbleX * dt;
      group.rotation.y += tumbleY * dt;
      spar.rotation.z += dt * 0.2;
    },
  };
};

const cometSwarm: Builder = (rand) => {
  const group = new THREE.Group();
  const name = makeName(rand);
  const count = 5 + Math.floor(rand() * 5);
  const swarm: Orbiter[] = [];
  for (let i = 0; i < count; i++) {
    const comet = new THREE.Mesh(ICO_LOW, MAT_BODY);
    comet.scale.setScalar(1 + rand() * 1.6);
    group.add(comet);
    swarm.push({
      mesh: comet,
      r: 30 + rand() * 110,
      speed: 0.1 + rand() * 0.25,
      phase: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 1.2,
    });
  }
  return {
    group,
    pois: [{ name: `${name} SWARM`, object: group, radius: 140 }],
    update: (_dt, t) => { updateOrbiters(swarm, t); },
  };
};

// weights roughly tuned so space feels varied but never empty
const BUILDERS: Array<[Builder, number]> = [
  [asteroidCluster, 0.2],
  [nebula, 0.2],
  [roguePlanet, 0.16],
  [miniSystem, 0.14],
  [binaryStars, 0.08],
  [monolithField, 0.07],
  [pulsar, 0.06],
  [cometSwarm, 0.05],
  [derelictStation, 0.04],
];

const SECTOR_SUFFIXES = ['EXPANSE', 'REACH', 'DRIFT', 'VERGE', 'DEEP'];

/**
 * Small unnamed secondary feature so a sector rarely reads as empty even
 * when its main content sits behind the camera: a knot of rocks or a wisp
 * of nebula dust.
 */
function addGarnish(rand: () => number, group: THREE.Group, own: THREE.BufferGeometry[]) {
  const offset = new THREE.Vector3(
    (rand() - 0.5) * 420,
    (rand() - 0.5) * 300,
    (rand() - 0.5) * 420,
  );
  if (rand() < 0.5) {
    for (let i = 0; i < 8 + Math.floor(rand() * 7); i++) {
      const rock = new THREE.Mesh(ICO_LOW, MAT_DIM);
      rock.position.set(
        offset.x + gaussish(rand) * 70,
        offset.y + gaussish(rand) * 40,
        offset.z + gaussish(rand) * 70,
      );
      rock.scale.setScalar(0.6 + rand() * 2.4);
      rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      group.add(rock);
    }
  } else {
    const n = 70 + Math.floor(rand() * 60);
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = offset.x + gaussish(rand) * 130;
      positions[i * 3 + 1] = offset.y + gaussish(rand) * 60;
      positions[i * 3 + 2] = offset.z + gaussish(rand) * 130;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    own.push(geometry);
    group.add(new THREE.Points(geometry, NEBULA_MAT));
  }
}

/** Builds the deterministic content of one sector from its own PRNG. */
export function buildSectorContent(
  rand: () => number,
  sectorSize: number,
  center: THREE.Vector3,
): SectorContent {
  const own: THREE.BufferGeometry[] = [];
  const name = `${makeName(rand)} ${pickFrom(rand, SECTOR_SUFFIXES)}`;
  let roll = rand();
  let builder = BUILDERS[BUILDERS.length - 1][0];
  for (const [candidate, weight] of BUILDERS) {
    if (roll < weight) { builder = candidate; break; }
    roll -= weight;
  }
  const content = builder(rand, own);
  if (rand() < 0.55) addGarnish(rand, content.group, own);
  // scatter the content off-centre so sector boundaries aren't felt
  content.group.position.set(
    center.x + (rand() - 0.5) * sectorSize * 0.5,
    center.y + (rand() - 0.5) * sectorSize * 0.5,
    center.z + (rand() - 0.5) * sectorSize * 0.5,
  );
  return {
    ...content,
    name,
    dispose: () => { own.forEach((g) => g.dispose()); },
  };
}

/**
 * The hand-authored solar system at the origin, expressed through the same
 * SectorContent contract as procedural sectors so the engine has a single
 * code path for updates, POIs, discovery, and disposal.
 */
export function buildHomeSystem(rand: () => number): SectorContent {
  const own: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  const pois: Poi[] = [];

  const sun = new THREE.Mesh(ICO_HIGH, MAT_BRIGHT);
  sun.scale.setScalar(26);
  group.add(sun);
  pois.push({ name: 'THE SUN', object: sun, radius: 26 });
  // halos live beside the sun (not inside it) so its unit-scale doesn't
  // multiply their world-space radii
  const halos = new THREE.Group();
  group.add(halos);
  const haloSpins: number[] = [];
  for (let i = 0; i < 3; i++) {
    const haloGeo = new THREE.TorusGeometry(34 + i * 7, 0.12, 4, 64);
    own.push(haloGeo);
    const halo = new THREE.Mesh(haloGeo, wireMat(0.22 - i * 0.06));
    halo.rotation.x = rand() * Math.PI;
    halo.rotation.y = rand() * Math.PI;
    haloSpins.push(0.05 + rand() * 0.1);
    halos.add(halo);
  }

  const ORBIT_RADII = [95, 150, 215, 300, 400, 520, 660];
  const planetOrbiters: Orbiter[] = [];
  const moonOrbiters: Orbiter[] = [];
  const planetSpins: Array<{ mesh: THREE.Mesh; spin: number }> = [];
  for (let i = 0; i < ORBIT_RADII.length; i++) {
    const radius = 3.5 + rand() * 10;
    const planet = new THREE.Mesh(radius > 9 ? ICO_MID : ICO_LOW, MAT_BODY);
    planet.scale.setScalar(radius);
    group.add(planet);
    pois.push({ name: `${makeName(rand)}-${i + 1}`, object: planet, radius });
    planetOrbiters.push({
      mesh: planet,
      r: ORBIT_RADII[i],
      speed: (0.5 / Math.pow(ORBIT_RADII[i] / 95, 1.5)) * 0.06,
      phase: rand() * Math.PI * 2,
    });
    planetSpins.push({ mesh: planet, spin: 0.1 + rand() * 0.4 });

    const orbit = new THREE.Line(UNIT_CIRCLE, ORBIT_MAT);
    orbit.scale.setScalar(ORBIT_RADII[i]);
    group.add(orbit);

    if (rand() < 0.4) {
      const ring = new THREE.Mesh(RING, MAT_RING);
      // child of a planet scaled by `radius`, so unit scale ≈ 1.9× planet
      ring.rotation.x = Math.PI / 2 + (rand() - 0.5) * 0.6;
      planet.add(ring);
    }

    const moonCount = rand() < 0.5 ? 1 + Math.floor(rand() * 2) : 0;
    for (let k = 0; k < moonCount; k++) {
      const moon = new THREE.Mesh(ICO_LOW, MAT_DIM);
      // moons are children of a scaled planet, so size/orbit are in planet units
      moon.scale.setScalar(0.22);
      planet.add(moon);
      moonOrbiters.push({ mesh: moon, r: 2.6 + k * 1.4, speed: 0.5 + rand(), phase: rand() * Math.PI * 2 });
    }
  }

  // asteroid belt between the 4th and 5th orbits
  const belt = new THREE.Group();
  {
    const n = 500;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = 340 + rand() * 34;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (rand() - 0.5) * 9;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    own.push(geometry);
    belt.add(new THREE.Points(geometry, BELT_MAT));
    group.add(belt);
  }

  // comet on an eccentric orbit, dragging a trail
  const comet = new THREE.Mesh(ICO_LOW, MAT_BRIGHT);
  comet.scale.setScalar(1.6);
  group.add(comet);
  pois.push({ name: 'THE COMET', object: comet, radius: 2 });
  const TRAIL_LENGTH = 70;
  const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
  // Start the whole trail at the comet's t=0 position (same formula as
  // update below); zeros would draw a line to the origin for the first
  // TRAIL_LENGTH frames.
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    trailPositions[i * 3] = Math.cos(2) * 620;
    trailPositions[i * 3 + 1] = Math.sin(4) * 18;
    trailPositions[i * 3 + 2] = Math.sin(2) * 260;
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  own.push(trailGeo);
  group.add(new THREE.Line(trailGeo, TRAIL_MAT));

  return {
    name: 'HOME SYSTEM',
    group,
    pois,
    update: (dt, t) => {
      sun.rotation.y += dt * 0.06;
      sun.scale.setScalar(26 * (1 + Math.sin(t * 1.3) * 0.025));
      halos.children.forEach((halo, i) => { halo.rotation.z += haloSpins[i] * dt; });
      updateOrbiters(planetOrbiters, t);
      updateOrbiters(moonOrbiters, t);
      for (const p of planetSpins) p.mesh.rotation.y += p.spin * dt;
      belt.rotation.y += dt * 0.012;

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
    },
    dispose: () => { own.forEach((g) => g.dispose()); },
  };
}

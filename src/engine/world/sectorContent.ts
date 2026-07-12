import * as THREE from 'three';
import { hashCoords, makeName, mulberry32, pickFrom } from 'engine/core/rng';
import { sectorCenter } from 'engine/core/sectorGrid';
import type { LodRegistration } from 'engine/lod/lodManager';
import {
  BEAM,
  BELT_MAT,
  BOX,
  CYL,
  ICO_LOW,
  ICO_MID,
  MAT_BEAM,
  MAT_BODY,
  MAT_BRIGHT,
  MAT_DIM,
  MAT_RING,
  NEBULA_MAT,
  ORBIT_MAT,
  RING,
  TRAIL_MAT,
  UNIT_CIRCLE,
  wireMat,
} from 'engine/render/assets';

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
  /**
   * Planet/star bodies rendered through the LOD ladder instead of static
   * meshes; the consumer registers them with a LodManager on mount and
   * unregisters on unload.
   */
  lodBodies: LodRegistration[];
  update?: (dt: number, t: number) => void;
  /** Frees only resources created for this sector (shared assets stay). */
  dispose: () => void;
}

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

type Built = Omit<SectorContent, 'dispose' | 'name' | 'lodBodies'> & {
  lodBodies?: LodRegistration[];
};
type Builder = (rand: () => number, own: THREE.BufferGeometry[]) => Built;

const gaussish = (rand: () => number) => (rand() + rand() + rand()) / 3 - 0.5;

const asteroidCluster: Builder = (rand) => {
  const group = new THREE.Group();
  const spread = 900 + rand() * 600;
  const count = 40 + Math.floor(rand() * 50);
  for (let i = 0; i < count; i++) {
    const rock = new THREE.Mesh(ICO_LOW, MAT_DIM);
    rock.position.set(gaussish(rand) * spread * 2, gaussish(rand) * spread, gaussish(rand) * spread * 2);
    rock.scale.setScalar(6 + rand() * 40);
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
  const reach = 1200 + rand() * 900;
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
    star.scale.setScalar(16 + rand() * 26);
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
  const radius = 60 + rand() * 100;
  // per-body LOD seed draws immediately after the radius — the rand() stream
  // order is load-bearing (determinism tests + peekSectorBeacon parity)
  const seed = Math.floor(rand() * 2 ** 31);
  const planet = new THREE.Group(); // LOD anchor; the manager parents rungs here
  group.add(planet);
  const scaleTargets: THREE.Object3D[] = [];
  if (rand() < 0.45) {
    const ring = new THREE.Mesh(RING, MAT_RING);
    ring.scale.setScalar(radius);
    ring.rotation.x = Math.PI / 2 + (rand() - 0.5) * 0.6;
    group.add(ring);
    scaleTargets.push(ring); // ring tracks the apparent-scale ramp
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
    lodBodies: [{ seed, radius, kind: 'planet', anchor: planet, baseOpacity: 0.85, scaleTargets }],
    update: (dt, t) => {
      planet.rotation.y += spin * dt;
      updateOrbiters(moons, t);
    },
  };
};

const miniSystem: Builder = (rand) => {
  const group = new THREE.Group();
  const starName = makeName(rand);
  const starRadius = 100 + rand() * 80;
  const starSeed = Math.floor(rand() * 2 ** 31); // seed right after the radius
  const star = new THREE.Group(); // LOD anchor
  group.add(star);
  const halo = new THREE.Mesh(RING, MAT_RING);
  halo.scale.setScalar(starRadius * 0.85);
  halo.rotation.x = rand() * Math.PI;
  group.add(halo);

  const pois: Poi[] = [{ name: starName, object: star, radius: starRadius }];
  const lodBodies: LodRegistration[] = [
    { seed: starSeed, radius: starRadius, kind: 'star', anchor: star, baseOpacity: 0.9, scaleTargets: [halo] },
  ];
  const planets: Orbiter[] = [];
  const count = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const orbitR = starRadius * 3 + 300 * (i + 1) + rand() * 200;
    const radius = 25 + rand() * 65;
    const planetSeed = Math.floor(rand() * 2 ** 31); // seed right after the radius
    const planet = new THREE.Group(); // LOD anchor, positioned by its orbiter
    group.add(planet);
    const orbit = new THREE.Line(UNIT_CIRCLE, ORBIT_MAT);
    orbit.scale.setScalar(orbitR);
    group.add(orbit);
    planets.push({ mesh: planet, r: orbitR, speed: (0.5 / Math.pow(orbitR / 340, 1.5)) * 0.5, phase: rand() * Math.PI * 2 });
    pois.push({ name: `${starName}-${i + 1}`, object: planet, radius });
    lodBodies.push({ seed: planetSeed, radius, kind: 'planet', anchor: planet, baseOpacity: 0.85 });
  }
  // the whole system tilts a little
  group.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5);
  return {
    group,
    pois,
    lodBodies,
    update: (dt, t) => {
      star.rotation.y += dt * 0.06;
      updateOrbiters(planets, t);
    },
  };
};

const binaryStars: Builder = (rand) => {
  const group = new THREE.Group();
  const name = makeName(rand);
  const separation = 170 + rand() * 140;
  const speed = 0.22 + rand() * 0.2; // shared — the pair stays opposed
  const stars: Orbiter[] = [];
  const lodBodies: LodRegistration[] = [];
  for (let i = 0; i < 2; i++) {
    const radius = 50 + rand() * 45;
    const seed = Math.floor(rand() * 2 ** 31); // seed right after the radius
    const star = new THREE.Group(); // LOD anchor, positioned by its orbiter
    group.add(star);
    const halo = new THREE.Mesh(RING, MAT_RING);
    // child of the unit-scale anchor, so the star's radius scales it here
    halo.scale.setScalar(0.8 * radius);
    halo.rotation.x = rand() * Math.PI;
    star.add(halo);
    stars.push({ mesh: star, r: separation, speed, phase: i * Math.PI });
    lodBodies.push({ seed, radius, kind: 'star', anchor: star, baseOpacity: 0.9, scaleTargets: [halo] });
  }
  const orbit = new THREE.Line(UNIT_CIRCLE, ORBIT_MAT);
  orbit.scale.setScalar(separation);
  group.add(orbit);
  return {
    group,
    pois: [{ name: `${name} BINARY`, object: group, radius: separation + 120 }],
    lodBodies,
    update: (_dt, t) => { updateOrbiters(stars, t); },
  };
};

const pulsar: Builder = (rand) => {
  const group = new THREE.Group();
  const core = new THREE.Mesh(ICO_MID, MAT_BRIGHT);
  const coreSize = 30 + rand() * 17;
  core.scale.setScalar(coreSize);
  group.add(core);
  // two opposed lighthouse beams, tilted off the spin axis
  const beams = new THREE.Group();
  for (const dir of [1, -1]) {
    const beam = new THREE.Mesh(BEAM, MAT_BEAM);
    beam.scale.set(60, 1300, 60);
    beam.position.y = dir * 650;
    if (dir === 1) beam.rotation.z = Math.PI;
    beams.add(beam);
  }
  beams.rotation.x = 0.5 + rand() * 0.5;
  group.add(beams);
  const spin = 1.4 + rand() * 1.2;
  const phase = rand() * Math.PI * 2;
  return {
    group,
    pois: [{ name: `PULSAR ${makeName(rand)}`, object: core, radius: 70 }],
    update: (dt, t) => {
      beams.rotation.y += spin * dt;
      core.scale.setScalar(coreSize * (1 + Math.sin(phase + t * 6) * 0.16));
    },
  };
};

const monolithField: Builder = (rand) => {
  const group = new THREE.Group();
  const count = 6 + Math.floor(rand() * 9);
  const spread = 770 + rand() * 600;
  for (let i = 0; i < count; i++) {
    const monolith = new THREE.Mesh(BOX, MAT_DIM);
    const h = 120 + rand() * 200;
    monolith.scale.set(17 + rand() * 21, h, 10 + rand() * 14);
    const a = rand() * Math.PI * 2;
    const r = rand() * spread;
    monolith.position.set(Math.cos(a) * r, (rand() - 0.5) * 260, Math.sin(a) * r);
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
  hull.scale.set(42, 238, 42);
  group.add(hull);
  const ring = new THREE.Mesh(RING, MAT_RING);
  ring.scale.setScalar(77);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const pods = 2 + Math.floor(rand() * 4);
  for (let i = 0; i < pods; i++) {
    const pod = new THREE.Mesh(BOX, MAT_DIM);
    pod.scale.set(28 + rand() * 35, 21 + rand() * 21, 21 + rand() * 21);
    pod.position.set((rand() - 0.5) * 98, (rand() - 0.5) * 182, (rand() - 0.5) * 98);
    pod.rotation.y = rand() * Math.PI;
    group.add(pod);
  }
  // a broken-off spar drifting nearby
  const spar = new THREE.Mesh(CYL, MAT_DIM);
  spar.scale.set(7, 126, 7);
  spar.position.set(210 + rand() * 175, (rand() - 0.5) * 140, (rand() - 0.5) * 210);
  spar.rotation.set(rand() * Math.PI, 0, rand() * Math.PI);
  group.add(spar);
  const tumbleX = (rand() - 0.5) * 0.08;
  const tumbleY = (rand() - 0.5) * 0.12;
  return {
    group,
    pois: [{ name: `${makeName(rand)} STATION (DERELICT)`, object: group, radius: 182 }],
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
    comet.scale.setScalar(8 + rand() * 14);
    group.add(comet);
    swarm.push({
      mesh: comet,
      r: 260 + rand() * 940,
      speed: 0.1 + rand() * 0.25,
      phase: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 1.2,
    });
  }
  return {
    group,
    pois: [{ name: `${name} SWARM`, object: group, radius: 1200 }],
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
    (rand() - 0.5) * 3400,
    (rand() - 0.5) * 2400,
    (rand() - 0.5) * 3400,
  );
  if (rand() < 0.5) {
    for (let i = 0; i < 8 + Math.floor(rand() * 7); i++) {
      const rock = new THREE.Mesh(ICO_LOW, MAT_DIM);
      rock.position.set(
        offset.x + gaussish(rand) * 560,
        offset.y + gaussish(rand) * 320,
        offset.z + gaussish(rand) * 560,
      );
      rock.scale.setScalar(5 + rand() * 19);
      rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
      group.add(rock);
    }
  } else {
    const n = 70 + Math.floor(rand() * 60);
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = offset.x + gaussish(rand) * 1040;
      positions[i * 3 + 1] = offset.y + gaussish(rand) * 480;
      positions[i * 3 + 2] = offset.z + gaussish(rand) * 1040;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    own.push(geometry);
    group.add(new THREE.Points(geometry, NEBULA_MAT));
  }
}

/** The part of a sector's generation shared with `peekSectorBeacon`. */
export interface SectorHeader {
  /** Display name, e.g. "KHEVEL EXPANSE". */
  name: string;
  /** Index into the weighted archetype table. */
  builderIndex: number;
  /** Content-group offset from the sector centre, per axis, as a fraction of sectorSize (each in [-0.25, 0.25]). */
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

/**
 * Draws a sector's name, archetype and content offset from the head of its
 * PRNG stream. Used by BOTH `buildSectorContent` and `peekSectorBeacon`, so
 * a peeked far-contact dot always lands exactly where the sector's content
 * will stream in. The draw ORDER here is load-bearing — inserting a rand()
 * call reshuffles every downstream sector and breaks the peek parity.
 */
export function drawSectorHeader(rand: () => number): SectorHeader {
  const name = `${makeName(rand)} ${pickFrom(rand, SECTOR_SUFFIXES)}`;
  let roll = rand();
  let builderIndex = BUILDERS.length - 1;
  for (let i = 0; i < BUILDERS.length; i++) {
    if (roll < BUILDERS[i][1]) { builderIndex = i; break; }
    roll -= BUILDERS[i][1];
  }
  return {
    name,
    builderIndex,
    // scatter the content off-centre so sector boundaries aren't felt
    offsetX: (rand() - 0.5) * 0.5,
    offsetY: (rand() - 0.5) * 0.5,
    offsetZ: (rand() - 0.5) * 0.5,
  };
}

/** Far-contact dot for a sector that hasn't streamed in. */
export interface SectorBeacon {
  x: number;
  y: number;
  z: number;
  /** 0..1 — stars read brighter than debris. */
  brightness: number;
}

/** Dot brightness per archetype, aligned with the BUILDERS table. */
const BEACON_BRIGHTNESS = [0.5, 0.7, 0.75, 1, 1, 0.45, 1, 0.55, 0.5];

/**
 * Derives only a sector's main-feature position and brightness — without
 * building any geometry — so cells beyond the streamed window still show as
 * far-contact dots. Exact-position parity with `buildSectorContent` is
 * guaranteed by the shared `drawSectorHeader`.
 */
export function peekSectorBeacon(
  x: number,
  y: number,
  z: number,
  worldSeed: number,
  sectorSize: number,
): SectorBeacon {
  const header = drawSectorHeader(mulberry32(hashCoords(x, y, z, worldSeed)));
  const center = sectorCenter(x, y, z, sectorSize);
  return {
    x: center.x + header.offsetX * sectorSize,
    y: center.y + header.offsetY * sectorSize,
    z: center.z + header.offsetZ * sectorSize,
    brightness: BEACON_BRIGHTNESS[header.builderIndex],
  };
}

/** Builds the deterministic content of one sector from its own PRNG. */
export function buildSectorContent(
  rand: () => number,
  sectorSize: number,
  center: THREE.Vector3,
): SectorContent {
  const own: THREE.BufferGeometry[] = [];
  const header = drawSectorHeader(rand);
  const content = BUILDERS[header.builderIndex][0](rand, own);
  if (rand() < 0.55) addGarnish(rand, content.group, own);
  content.group.position.set(
    center.x + header.offsetX * sectorSize,
    center.y + header.offsetY * sectorSize,
    center.z + header.offsetZ * sectorSize,
  );
  return {
    ...content,
    lodBodies: content.lodBodies ?? [],
    name: header.name,
    dispose: () => { own.forEach((g) => g.dispose()); },
  };
}

/**
 * The hand-authored solar system at the origin, expressed through the same
 * SectorContent contract as procedural sectors so the engine has a single
 * code path for updates, POIs, discovery, and disposal.
 */
export function buildHomeSystem(rand: () => number): SectorContent {
  // geometries AND the few per-mount materials created here; shared assets
  // (MAT_*, UNIT_CIRCLE, …) are module-scope and never disposed
  const own: Array<{ dispose(): void }> = [];
  const group = new THREE.Group();
  const pois: Poi[] = [];
  const lodBodies: LodRegistration[] = [];

  const SUN_RADIUS = 400;
  const sunSeed = Math.floor(rand() * 2 ** 31);
  // the pulse animates this wrapper, so the LOD manager (which drives the
  // scale of its own rung meshes under the anchor) never fights it
  const sunPulse = new THREE.Group();
  group.add(sunPulse);
  const sun = new THREE.Group(); // LOD anchor
  sunPulse.add(sun);
  pois.push({ name: 'THE SUN', object: sun, radius: SUN_RADIUS });
  // halos live beside the sun (not inside it) so its unit-scale doesn't
  // multiply their world-space radii
  const halos = new THREE.Group();
  group.add(halos);
  const haloSpins: number[] = [];
  for (let i = 0; i < 3; i++) {
    const haloGeo = new THREE.TorusGeometry(520 + i * 110, 1.8, 4, 64);
    own.push(haloGeo);
    const haloMat = wireMat(0.22 - i * 0.06);
    own.push(haloMat);
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = rand() * Math.PI;
    halo.rotation.y = rand() * Math.PI;
    haloSpins.push(0.05 + rand() * 0.1);
    halos.add(halo);
  }
  lodBodies.push({
    seed: sunSeed,
    radius: SUN_RADIUS,
    kind: 'star',
    anchor: sun,
    baseOpacity: 0.9,
    scaleTargets: [halos],
  });

  // all inside 2 home cells of the 6,000-unit sector grid (< 12,000)
  const ORBIT_RADII = [1300, 2100, 3000, 4200, 5600, 7300, 9000];
  const planetOrbiters: Orbiter[] = [];
  const moonOrbiters: Orbiter[] = [];
  const planetSpins: Array<{ mesh: THREE.Object3D; spin: number }> = [];
  for (let i = 0; i < ORBIT_RADII.length; i++) {
    const radius = 40 + rand() * 100;
    const planetSeed = Math.floor(rand() * 2 ** 31); // seed right after the radius
    const planet = new THREE.Group(); // LOD anchor, positioned by its orbiter
    group.add(planet);
    pois.push({ name: `${makeName(rand)}-${i + 1}`, object: planet, radius });
    planetOrbiters.push({
      mesh: planet,
      r: ORBIT_RADII[i],
      speed: (0.5 / Math.pow(ORBIT_RADII[i] / 1300, 1.5)) * 0.06,
      phase: rand() * Math.PI * 2,
    });
    planetSpins.push({ mesh: planet, spin: 0.1 + rand() * 0.4 });

    const orbit = new THREE.Line(UNIT_CIRCLE, ORBIT_MAT);
    orbit.scale.setScalar(ORBIT_RADII[i]);
    group.add(orbit);

    const scaleTargets: THREE.Object3D[] = [];
    if (rand() < 0.4) {
      const ring = new THREE.Mesh(RING, MAT_RING);
      // child of the unit-scale anchor, so the planet's radius scales it here
      ring.scale.setScalar(radius);
      ring.rotation.x = Math.PI / 2 + (rand() - 0.5) * 0.6;
      planet.add(ring);
      scaleTargets.push(ring);
    }

    const moonCount = rand() < 0.5 ? 1 + Math.floor(rand() * 2) : 0;
    if (moonCount > 0) {
      // moons live under one group so the apparent-scale ramp compresses
      // their orbits together with the planet
      const moonSystem = new THREE.Group();
      planet.add(moonSystem);
      scaleTargets.push(moonSystem);
      for (let k = 0; k < moonCount; k++) {
        const moon = new THREE.Mesh(ICO_LOW, MAT_DIM);
        moon.scale.setScalar(0.22 * radius);
        moonSystem.add(moon);
        moonOrbiters.push({
          mesh: moon,
          r: (2.6 + k * 1.4) * radius,
          speed: 0.5 + rand(),
          phase: rand() * Math.PI * 2,
        });
      }
    }
    lodBodies.push({ seed: planetSeed, radius, kind: 'planet', anchor: planet, baseOpacity: 0.85, scaleTargets });
  }

  // asteroid belt between the 4th and 5th orbits
  const belt = new THREE.Group();
  {
    const n = 500;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = 4450 + rand() * 500;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (rand() - 0.5) * 120;
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
  comet.scale.setScalar(22);
  group.add(comet);
  pois.push({ name: 'THE COMET', object: comet, radius: 27 });
  const TRAIL_LENGTH = 70;
  const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
  // Start the whole trail at the comet's t=0 position (same formula as
  // update below); zeros would draw a line to the origin for the first
  // TRAIL_LENGTH frames.
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    trailPositions[i * 3] = Math.cos(2) * 8500;
    trailPositions[i * 3 + 1] = Math.sin(4) * 250;
    trailPositions[i * 3 + 2] = Math.sin(2) * 3600;
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  own.push(trailGeo);
  group.add(new THREE.Line(trailGeo, TRAIL_MAT));

  return {
    name: 'HOME SYSTEM',
    group,
    pois,
    lodBodies,
    update: (dt, t) => {
      sun.rotation.y += dt * 0.06;
      sunPulse.scale.setScalar(1 + Math.sin(t * 1.3) * 0.025);
      halos.children.forEach((halo, i) => { halo.rotation.z += haloSpins[i] * dt; });
      updateOrbiters(planetOrbiters, t);
      updateOrbiters(moonOrbiters, t);
      for (const p of planetSpins) p.mesh.rotation.y += p.spin * dt;
      belt.rotation.y += dt * 0.012;

      const cometAngle = t * 0.045 + 2;
      comet.position.set(Math.cos(cometAngle) * 8500, Math.sin(cometAngle * 2) * 250, Math.sin(cometAngle) * 3600);
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

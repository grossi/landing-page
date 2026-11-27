import * as THREE from 'three';
import type { FindId, Places } from 'components/ephemeris/survey';
import { hashCoords, mulberry32 } from 'engine/core/rng';
import { sectorCenter } from 'engine/core/sectorGrid';
import { BOX, CYL, DODEC, ICO_MID, MAT_BRIGHT, MAT_DIM, MAT_RING, OCT, RING, wireMat } from 'engine/render/assets';
import type { ResourceTracker } from 'engine/render/resourceTracker';
import { drawSectorHeader } from 'engine/world/sectorContent';

type Vec3 = { x: number; y: number; z: number };

/** Where the day's fixed finds are, in absolute coordinates, and the places the notes name. */
export interface FindPlan {
  relay: Vec3;
  wreck: Vec3;
  bell: Vec3;
  light: Vec3;
  /** Sector cells of the two finds beyond the home system, e.g. "2,0,-1". */
  cells: { wreck: [number, number, number]; bell: [number, number, number] };
  places: Places;
}

/** A body the late light must keep clear of: where it is, and how far it reaches. */
export interface Keepout {
  x: number;
  z: number;
  reach: number;
}

/**
 * The finds beyond the home system sit this far above their sector's main
 * feature: clear of every archetype's vertical reach (a tilted mini-system's
 * outer planet at most ~960, a comet swarm's ~1,440), close enough that the
 * sector's own body is in the picture when you arrive.
 */
const ABOVE_FEATURE = 3200;
/** The relay sits this far ahead of the spawn point (km), on the spawn heading, give or take the seed's share. */
const RELAY_AHEAD = 3600;
const RELAY_AHEAD_SPREAD = 1200;
/** …and this far off that line at most (km): a few degrees, so the first signal reads full. */
const RELAY_ASIDE = 500;
/** The late light sits in the home belt, at this radius scale times the belt's middle. */
const LIGHT_LIFT = 400;

/**
 * Places the day's finds from the seed alone. The relay is just ahead of the
 * spawn, so a loop starts pointing at a signal. The wreck and the bell are in
 * two sectors of the ring two cells out from the home system, on different
 * sides (at least 120° apart seen from the sun), found from the sector
 * headers without building anything. The late light is in the belt, on the
 * side away from the planets that cross it.
 */
export function planFinds(
  worldSeed: number,
  sectorSize: number,
  spawn: Vec3,
  spawnHeading: Vec3,
  beltRadius: number,
  keepouts: readonly Keepout[],
): FindPlan {
  const rand = mulberry32((worldSeed ^ 0x51f7) >>> 0);

  const ahead = RELAY_AHEAD + rand() * RELAY_AHEAD_SPREAD;
  const relay = {
    x: spawn.x + spawnHeading.x * ahead + (rand() - 0.5) * 2 * RELAY_ASIDE,
    y: spawn.y + spawnHeading.y * ahead + (rand() - 0.5) * RELAY_ASIDE,
    z: spawn.z + spawnHeading.z * ahead,
  };

  // the ring of cells whose centres are two and a half cells out from the
  // sun (cells are numbered from their low corner, so that is x = -3 or 2),
  // in the plane of the system: 30,000 to 42,000 km away, past the home
  // system and past hearing until a note tells of them
  const ring: Array<[number, number, number]> = [];
  for (let x = -3; x <= 2; x++) {
    for (let z = -3; z <= 2; z++) {
      if (Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5)) === 2.5) ring.push([x, 0, z]);
    }
  }
  const angleOf = ([x, , z]: [number, number, number]) => Math.atan2(z + 0.5, x + 0.5);
  const wreckCell = ring[Math.floor(rand() * ring.length) % ring.length];
  const across = ring.filter((cell) => {
    const d = Math.abs(angleOf(cell) - angleOf(wreckCell));
    return Math.min(d, 2 * Math.PI - d) >= (2 * Math.PI) / 3;
  });
  const bellCell = across[Math.floor(rand() * across.length) % across.length];

  const feature = ([x, y, z]: [number, number, number]) => {
    const header = drawSectorHeader(mulberry32(hashCoords(x, y, z, worldSeed)));
    const c = sectorCenter(x, y, z, sectorSize);
    return {
      name: header.name,
      at: {
        x: c.x + header.offsetX * sectorSize,
        y: c.y + header.offsetY * sectorSize + ABOVE_FEATURE,
        z: c.z + header.offsetZ * sectorSize,
      },
    };
  };
  const wreck = feature(wreckCell);
  const bell = feature(bellCell);

  // the light: of twelve places round the belt, the one farthest from any
  // body that crosses it (planets barely move in four minutes)
  const start = rand() * Math.PI * 2;
  let light = { x: 0, y: LIGHT_LIFT, z: 0 };
  let clearest = -Infinity;
  for (let i = 0; i < 12; i++) {
    const a = start + (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * beltRadius;
    const z = Math.sin(a) * beltRadius;
    let clearance = Infinity;
    for (const k of keepouts) clearance = Math.min(clearance, Math.hypot(x - k.x, z - k.z) - k.reach);
    if (clearance > clearest) {
      clearest = clearance;
      light = { x, y: LIGHT_LIFT, z };
    }
  }

  return {
    relay,
    wreck: wreck.at,
    bell: bell.at,
    light,
    cells: { wreck: wreckCell, bell: bellCell },
    places: { wreck: wreck.name, bell: bell.name },
  };
}

/**
 * Where the world's clock starts each loop, from the seed: up to one turn of
 * the home comet (about 140 s), so the comet, and the passenger on it, start
 * each day somewhere else on its orbit. The planets move a few hundred km.
 */
export function clockOffsetFor(worldSeed: number): number {
  return ((worldSeed >>> 0) % 1400) / 10;
}

/** The finds as things in the world. */
export interface FindObjects {
  /** One group per find; the sim positions the passenger every frame. */
  groups: Record<FindId, THREE.Group>;
  /**
   * One frame of their own motion (spin, the bell's swing), and how lit the
   * two timed ones are: `bell` 0..1 while it answers, `light` 0..1 as the
   * dark comes in.
   */
  update(dt: number, bell: number, light: number): void;
}

/**
 * Builds the five finds from the shared unit geometries, each its own
 * shape: a relay (an octahedron in a ring), a wreck (a broken spar and two
 * hull pieces), a bell (a dodecahedron inside two rings), a passenger (a
 * small octahedron and a box) and the late light (a lit sphere and a ring).
 * Geometry is shared and never disposed here; the two materials the bell and
 * the light fade are created for this mount and tracked, so the stage frees
 * them with everything else it owns.
 */
export function buildFinds(tracker: ResourceTracker): FindObjects {
  const bellMat = tracker.track(wireMat(0.25));
  const lightMat = tracker.track(wireMat(0));
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, scale: number | Vec3) => {
    const m = new THREE.Mesh(geometry, material);
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(scale.x, scale.y, scale.z);
    return m;
  };

  const relay = new THREE.Group();
  const relayCore = mesh(OCT, MAT_BRIGHT, 80);
  const relayRing = mesh(RING, MAT_RING, 68);
  relayRing.rotation.x = Math.PI / 2;
  relay.add(relayCore, relayRing);

  const wreck = new THREE.Group();
  const spar = mesh(CYL, MAT_DIM, { x: 24, y: 420, z: 24 });
  spar.rotation.set(0.6, 0, 1.1);
  const hullA = mesh(BOX, MAT_DIM, { x: 160, y: 70, z: 110 });
  hullA.position.set(-90, 35, 20);
  hullA.rotation.set(0.3, 0.8, 0);
  const hullB = mesh(BOX, MAT_DIM, { x: 70, y: 120, z: 50 });
  hullB.position.set(120, -70, -35);
  hullB.rotation.set(1.2, 0.2, 0.4);
  wreck.add(spar, hullA, hullB);

  const bell = new THREE.Group();
  const bellCore = mesh(DODEC, bellMat, 110);
  const bellRingA = mesh(RING, bellMat, 84);
  const bellRingB = mesh(RING, bellMat, 104);
  bellRingB.rotation.x = Math.PI / 2;
  bell.add(bellCore, bellRingA, bellRingB);

  const passenger = new THREE.Group();
  const passengerCore = mesh(OCT, MAT_BRIGHT, 18);
  const passengerBox = mesh(BOX, MAT_DIM, 14);
  passengerBox.position.set(0, -16, 0);
  passenger.add(passengerCore, passengerBox);

  const light = new THREE.Group();
  const lightCore = mesh(ICO_MID, lightMat, 70);
  const lightRing = mesh(RING, lightMat, 60);
  light.add(lightCore, lightRing);

  let t = 0;
  return {
    groups: { relay, wreck, bell, passenger, light },
    update(dt, bellLit, lightLit) {
      t += dt;
      relayCore.rotation.y += dt * 0.8;
      relayRing.rotation.z += dt * 0.3;
      wreck.rotation.x += dt * 0.04;
      wreck.rotation.y += dt * 0.06;
      // the bell swings while it answers, and is a dim shape the rest of the loop
      bellMat.opacity = 0.25 + 0.65 * bellLit;
      bellRingA.rotation.y += dt * (0.2 + 2.2 * bellLit);
      bellRingB.rotation.z += dt * (0.15 + 1.6 * bellLit);
      bell.rotation.z = Math.sin(t * 2.6) * 0.25 * bellLit;
      passengerCore.rotation.y += dt * 1.4;
      // the light is not there at all until the dark, then breathes
      lightMat.opacity = lightLit * (0.75 + 0.2 * Math.sin(t * 3));
      light.visible = lightLit > 0;
      lightRing.rotation.x += dt * 0.5;
    },
  };
}

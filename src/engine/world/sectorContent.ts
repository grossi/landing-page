import * as THREE from 'three';
import { hashCoords, makeName, mulberry32, pickFrom } from 'engine/core/rng';
import { sectorCenter } from 'engine/core/sectorGrid';
import type { LodRegistration } from 'engine/lod/lodManager';
import type { Disposable } from 'engine/render/resourceTracker';
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
  /**
   * Whether the radius is a hard surface. Solid bodies (planets, stars, the
   * pulsar core, the derelict station's hull cluster) get the soft altitude
   * floor and the full surface-distance speed cap; diffuse volumes (nebulae,
   * asteroid clusters, comet swarms, monolith fields — sparse enough to
   * thread through) are enterable and apply only a gentle drag inside.
   */
  solid: boolean;
  /**
   * Whether the body reads as carrying an atmospheric envelope (the HUD
   * arrival ritual and its entry speed step). Defaults to `solid`; small or
   * artificial bodies (the comet, the derelict station) opt out — the
   * fiction reads wrong over a hull or a 27-unit snowball. The speed law
   * and soft altitude floor ignore this flag: they follow `solid` alone.
   */
  envelope?: boolean;
  /** Stable identity across sector rebuilds; assigned by the engine. */
  id?: string;
  /**
   * The LOD registration behind this POI, when the body renders through the
   * LOD ladder. The flight sim's terrain-following altitude floor resolves
   * the body's displacement field through it (seed + kind, see
   * engine/lod/surfaceFloor); solid POIs without one (the derelict station,
   * a binary pair's swept volume, the pulsar core, the comet) keep the flat
   * floor.
   */
  lod?: LodRegistration;
}

/**
 * Per-archetype size multipliers threaded through the sector builders and
 * the home system. ABSOLUTE RULE: a scale only ever MULTIPLIES values
 * derived from the existing rand() draws — zero new draws, zero reordering —
 * so the deterministic draw-order contracts (peekSectorBeacon parity, POI
 * ids, LOD seeds) hold at every scale, and `UNIT_SCALE` reproduces the
 * pre-scale world bit for bit.
 */
export interface WorldScale {
  /** Asteroid-cluster rock sizes (the spread grows by √scale — see builder). */
  clusterRocks: number;
  /** Nebula reach — the POI radius, budgeted against the half-sector. */
  nebula: number;
  /** Rogue-planet radius (ring and moons follow proportionally). */
  roguePlanet: number;
  /** Mini-system star/planet radii AND orbital distances. */
  miniSystem: number;
  /** Binary-star radii and pair separation. */
  binaryStars: number;
  /** Monolith slab dimensions (the spread grows by √scale — see builder). */
  monoliths: number;
  /** Pulsar core and lighthouse beams. */
  pulsar: number;
  /** Comet-swarm body sizes and orbits. */
  cometSwarm: number;
  /** Derelict-station hull dimensions. */
  station: number;
  /** Home system: sun/planet radii ×scale; orbits budget-stretched (homeLayout). */
  home: number;
}

/** Identity scale: the world exactly as authored before the scale-up. */
export const UNIT_SCALE: WorldScale = Object.freeze({
  clusterRocks: 1,
  nebula: 1,
  roguePlanet: 1,
  miniSystem: 1,
  binaryStars: 1,
  monoliths: 1,
  pulsar: 1,
  cometSwarm: 1,
  station: 1,
  home: 1,
});

/**
 * The budgeted true-scale tuning the EPHEMERIS flight experience passes
 * (plan: "Phase 3 — Budgeted true scale"). Each factor sits at the top of
 * its locked range and is verified against the cell budget in the builder
 * comments and the eviction-budget test. All arithmetic below is stated at
 * a 6,000-unit sector — the tightest grid the tests assert; EPHEMERIS
 * itself streams 12,000-unit sectors (Phase 3.5), which doubles every
 * margin since content sizes are grid-independent:
 *
 * - content offset is ±0.25·SECTOR = ±1500 per axis (drawSectorHeader);
 * - single solid bodies fit their own cell: offset + extent < 0.5·SECTOR
 *   = 3000 (rogue 1500 + 960 = 2460 ✓);
 * - orbiting/diffuse layouts stay under the 6000 test budget — well inside
 *   the (ACTIVE_RANGE + 0.5)·SECTOR = 9000 line past which a skimming
 *   ship could evict the sector under itself (mini-system worst case
 *   1500 + 3880 + 180 = 5560 ✓).
 *
 * `nebula` is 1.4 rather than the budgeted 1.5: worst-case reach
 * (1200 + 900)·1.4 = 2940 keeps the POI radius inside the half-sector 3000
 * that the POI-radius test asserts (×1.5 would reach 3150).
 */
export const TRUE_SCALE: WorldScale = Object.freeze({
  clusterRocks: 3,
  nebula: 1.4,
  roguePlanet: 6,
  miniSystem: 2,
  binaryStars: 2,
  monoliths: 2,
  pulsar: 2,
  cometSwarm: 2,
  station: 1.5,
  home: 2,
});

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
// positions the group at the sector centre. Per-sector resources (point
// geometries, instanced batches) are pushed to `own` and disposed with the
// sector; shared unit geometries/materials are never pushed.

type Built = Omit<SectorContent, 'dispose' | 'name' | 'lodBodies'> & {
  lodBodies?: LodRegistration[];
};
type Builder = (rand: () => number, own: Disposable[], scale: WorldScale) => Built;

const gaussish = (rand: () => number) => (rand() + rand() + rand()) / 3 - 0.5;

// Static swarms (cluster rocks, monoliths, garnish debris) render as ONE
// InstancedMesh per archetype instead of N meshes — an asteroid cluster was
// up to 90 draw calls, now 1. They never move relative to their group, so
// the spin animation stays on the parent and the matrices upload once.
const scratchInstance = new THREE.Object3D();
function buildInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  place: (instance: THREE.Object3D, index: number) => void,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  for (let i = 0; i < count; i++) {
    scratchInstance.position.set(0, 0, 0);
    scratchInstance.rotation.set(0, 0, 0);
    scratchInstance.scale.set(1, 1, 1);
    place(scratchInstance, i);
    scratchInstance.updateMatrix();
    mesh.setMatrixAt(i, scratchInstance.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  // instanced culling is whole-batch: without an explicit bounding sphere
  // the UNIT geometry's sphere would cull swarms still on screen
  mesh.computeBoundingSphere();
  return mesh;
}

const asteroidCluster: Builder = (rand, own, scale) => {
  const group = new THREE.Group();
  // Rocks grow with the full factor, the spread only by √scale — volume
  // feel without eviction risk. True-scale budget (clusterRocks 3): spread
  // ≤ 1500·√3 ≈ 2598 < half-sector 3000, and rock centres lie within
  // ±spread of the group (gaussish spans ±0.5, ×spread·2), so worst reach
  // = offset 1500 + 2598 + rock 138 ≈ 4236 < the 6000 eviction budget.
  const spreadScale = Math.sqrt(scale.clusterRocks);
  const spread = (900 + rand() * 600) * spreadScale;
  const count = 40 + Math.floor(rand() * 50);
  // rand() draws per rock match the old per-mesh builder exactly
  const rocks = buildInstanced(ICO_LOW, MAT_DIM, count, (rock) => {
    rock.position.set(gaussish(rand) * spread * 2, gaussish(rand) * spread, gaussish(rand) * spread * 2);
    rock.scale.setScalar((6 + rand() * 40) * scale.clusterRocks);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
  });
  own.push(rocks);
  group.add(rocks);
  const spin = (rand() - 0.5) * 0.02;
  return {
    group,
    // scattered rocks, mostly void — flyable, so the volume is not solid
    pois: [{ name: `${makeName(rand)} CLUSTER`, object: group, radius: spread, solid: false }],
    update: (dt) => { group.rotation.y += spin * dt; },
  };
};

const nebula: Builder = (rand, own, scale) => {
  const group = new THREE.Group();
  const blobs = 2 + Math.floor(rand() * 3);
  const total = 380 + Math.floor(rand() * 280);
  const positions = new Float32Array(total * 3);
  // True-scale budget (nebula 1.4): reach ≤ (1200 + 900)·1.4 = 2940 — the
  // POI radius stays inside the half-sector 3000. Blob points stray to
  // ~1.6·reach ≈ 4700 (+1500 offset ≈ 6200 < 9000): loose dust wisps past
  // the cell edge, no floor or speed law attached (diffuse).
  const reach = (1200 + rand() * 900) * scale.nebula;
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
    star.scale.setScalar((16 + rand() * 26) * scale.nebula);
    group.add(star);
  }
  const spin = (rand() - 0.5) * 0.014;
  return {
    group,
    pois: [{ name: `${makeName(rand)} NEBULA`, object: group, radius: reach, solid: false }],
    update: (dt) => { group.rotation.y += spin * dt; },
  };
};

const roguePlanet: Builder = (rand, _own, scale) => {
  const group = new THREE.Group();
  // True-scale budget (roguePlanet 6): radius 360–960. The planet sits AT
  // the group origin, so worst cell reach = offset 1500 + 960 = 2460 <
  // half-sector 3000 — the archetype big enough to read as a full planet
  // still fits its own cell. Moons orbit at ≤ 4.1·radius ≈ 3936: visual-only
  // past the cell edge, far inside the ±9000 eviction line.
  const radius = (60 + rand() * 100) * scale.roguePlanet;
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
  // TODO(Phase 4): at ×6 these moons reach radius ~192 yet remain
  // fly-through ghosts — no POI, no solidity, no altitude floor (a
  // pre-existing gap the true scale makes conspicuous). Intended fix:
  // promote rogue moons to solid POIs with `lod` links so the speed law
  // and the terrain-following floor bind to them too.
  for (let k = 0; k < moonCount; k++) {
    const moon = new THREE.Mesh(ICO_LOW, MAT_DIM);
    moon.scale.setScalar(radius * 0.2);
    group.add(moon);
    moons.push({ mesh: moon, r: radius * (2.6 + k * 1.5), speed: 0.3 + rand() * 0.6, phase: rand() * Math.PI * 2 });
  }
  // near-imperceptible day cycle (÷50 from the old 0.08–0.33 rad/s, which
  // spun a full turn in under a minute): skimming the surface, the terrain
  // drifts rather than scrolls, so flying around the planet feels natural
  const spin = 0.0016 + rand() * 0.005;
  const name = `${makeName(rand)}-${1 + Math.floor(rand() * 8)}`;
  const body: LodRegistration = { seed, radius, kind: 'planet', anchor: planet, baseOpacity: 0.85, scaleTargets };
  return {
    group,
    pois: [{ name, object: planet, radius, solid: true, lod: body }],
    lodBodies: [body],
    update: (dt, t) => {
      planet.rotation.y += spin * dt;
      updateOrbiters(moons, t);
    },
  };
};

const miniSystem: Builder = (rand, _own, scale) => {
  const s = scale.miniSystem;
  const group = new THREE.Group();
  const starName = makeName(rand);
  const starRadius = (100 + rand() * 80) * s;
  const starSeed = Math.floor(rand() * 2 ** 31); // seed right after the radius
  const star = new THREE.Group(); // LOD anchor
  group.add(star);
  const halo = new THREE.Mesh(RING, MAT_RING);
  halo.scale.setScalar(starRadius * 0.85);
  halo.rotation.x = rand() * Math.PI;
  group.add(halo);

  const starBody: LodRegistration = {
    seed: starSeed, radius: starRadius, kind: 'star', anchor: star, baseOpacity: 0.9, scaleTargets: [halo],
  };
  const pois: Poi[] = [{ name: starName, object: star, radius: starRadius, solid: true, lod: starBody }];
  const lodBodies: LodRegistration[] = [starBody];
  const planets: Orbiter[] = [];
  const count = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    // Every orbital term scales with the same factor — including the
    // additive 300-unit gap, or orbits would interpenetrate as planets
    // grew — so the same draws yield exactly the ×1 layout magnified.
    // True-scale budget (miniSystem 2), worst case (4 planets, max draws):
    // orbit = 360·3 + 600·4 + 400 = 3880, + planet 180 + offset 1500 =
    // 5560. That exceeds the half-sector 3000 (the ×1 layout already did:
    // 1500 + 2300 + 90 = 3890) but stays under the 6000 eviction budget —
    // a ship at the outermost planet is at most one cell from the system's
    // own cell, and sectors only evict beyond (ACTIVE_RANGE + 0.5)·SECTOR
    // = 9000.
    const orbitR = starRadius * 3 + 300 * s * (i + 1) + rand() * 200 * s;
    const radius = (25 + rand() * 65) * s;
    const planetSeed = Math.floor(rand() * 2 ** 31); // seed right after the radius
    const planet = new THREE.Group(); // LOD anchor, positioned by its orbiter
    group.add(planet);
    const orbit = new THREE.Line(UNIT_CIRCLE, ORBIT_MAT);
    orbit.scale.setScalar(orbitR);
    group.add(orbit);
    planets.push({ mesh: planet, r: orbitR, speed: (0.5 / Math.pow(orbitR / (340 * s), 1.5)) * 0.5, phase: rand() * Math.PI * 2 });
    const body: LodRegistration = { seed: planetSeed, radius, kind: 'planet', anchor: planet, baseOpacity: 0.85 };
    pois.push({ name: `${starName}-${i + 1}`, object: planet, radius, solid: true, lod: body });
    lodBodies.push(body);
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

const binaryStars: Builder = (rand, _own, scale) => {
  const s = scale.binaryStars;
  const group = new THREE.Group();
  const name = makeName(rand);
  // True-scale budget (binaryStars 2): separation ≤ 620, star radius ≤ 190
  // → worst reach = offset 1500 + 620 + 190 = 2310 < half-sector 3000.
  const separation = (170 + rand() * 140) * s;
  const speed = 0.22 + rand() * 0.2; // shared — the pair stays opposed
  const stars: Orbiter[] = [];
  const lodBodies: LodRegistration[] = [];
  for (let i = 0; i < 2; i++) {
    const radius = (50 + rand() * 45) * s;
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
    // the orbiting pair sweeps the whole radius — treat it as one solid
    // star, with the pad scaled to keep covering the biggest star (no `lod`:
    // a swept volume has no single displacement field, so the flat floor
    // applies)
    pois: [{ name: `${name} BINARY`, object: group, radius: separation + 120 * s, solid: true }],
    lodBodies,
    update: (_dt, t) => { updateOrbiters(stars, t); },
  };
};

const pulsar: Builder = (rand, _own, scale) => {
  const s = scale.pulsar;
  const group = new THREE.Group();
  const core = new THREE.Mesh(ICO_MID, MAT_BRIGHT);
  const coreSize = (30 + rand() * 17) * s;
  core.scale.setScalar(coreSize);
  group.add(core);
  // two opposed lighthouse beams, tilted off the spin axis. True-scale
  // budget (pulsar 2): POI reach = offset 1500 + 140 < half-sector 3000;
  // the beams sweep out to 1300·2 = 2600 — light crossing the cell edge,
  // no POI or floor attached, far inside the ±9000 eviction line.
  const beams = new THREE.Group();
  for (const dir of [1, -1]) {
    const beam = new THREE.Mesh(BEAM, MAT_BEAM);
    beam.scale.set(60 * s, 1300 * s, 60 * s);
    beam.position.y = dir * 650 * s;
    if (dir === 1) beam.rotation.z = Math.PI;
    beams.add(beam);
  }
  beams.rotation.x = 0.5 + rand() * 0.5;
  group.add(beams);
  const spin = 1.4 + rand() * 1.2;
  const phase = rand() * Math.PI * 2;
  return {
    group,
    pois: [{ name: `PULSAR ${makeName(rand)}`, object: core, radius: 70 * s, solid: true }],
    update: (dt, t) => {
      beams.rotation.y += spin * dt;
      core.scale.setScalar(coreSize * (1 + Math.sin(phase + t * 6) * 0.16));
    },
  };
};

const monolithField: Builder = (rand, own, scale) => {
  const group = new THREE.Group();
  const count = 6 + Math.floor(rand() * 9);
  // Slabs grow with the full factor, the spread only by √scale (same rule
  // as the asteroid cluster). True-scale budget (monoliths 2): spread ≤
  // 1370·√2 ≈ 1937 < half-sector 3000; reach 1500 + 1937 + slab ≈ 3760
  // < the 6000 eviction budget — diffuse, enterable.
  const spreadScale = Math.sqrt(scale.monoliths);
  const spread = (770 + rand() * 600) * spreadScale;
  const monoliths = buildInstanced(BOX, MAT_DIM, count, (monolith) => {
    const h = (120 + rand() * 200) * scale.monoliths;
    monolith.scale.set((17 + rand() * 21) * scale.monoliths, h, (10 + rand() * 14) * scale.monoliths);
    const a = rand() * Math.PI * 2;
    const r = rand() * spread;
    monolith.position.set(Math.cos(a) * r, (rand() - 0.5) * 260 * spreadScale, Math.sin(a) * r);
    monolith.rotation.y = rand() * Math.PI;
  });
  own.push(monoliths);
  group.add(monoliths);
  const spin = (rand() - 0.5) * 0.01;
  return {
    group,
    // a handful of slabs over a huge spread — drifting among them is the point
    pois: [{ name: `THE ${makeName(rand)} MONOLITHS`, object: group, radius: spread, solid: false }],
    update: (dt) => { group.rotation.y += spin * dt; },
  };
};

const derelictStation: Builder = (rand, _own, scale) => {
  const s = scale.station;
  const group = new THREE.Group();
  // True-scale budget (station 1.5): the whole wreck — spar included, at
  // ≤ 578 from the hull — stays under 1500 + 578 + spar length, trivially
  // inside the half-sector 3000.
  const hull = new THREE.Mesh(CYL, MAT_DIM);
  hull.scale.set(42 * s, 238 * s, 42 * s);
  group.add(hull);
  const ring = new THREE.Mesh(RING, MAT_RING);
  ring.scale.setScalar(77 * s);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const pods = 2 + Math.floor(rand() * 4);
  for (let i = 0; i < pods; i++) {
    const pod = new THREE.Mesh(BOX, MAT_DIM);
    pod.scale.set((28 + rand() * 35) * s, (21 + rand() * 21) * s, (21 + rand() * 21) * s);
    pod.position.set((rand() - 0.5) * 98 * s, (rand() - 0.5) * 182 * s, (rand() - 0.5) * 98 * s);
    pod.rotation.y = rand() * Math.PI;
    group.add(pod);
  }
  // a broken-off spar drifting nearby
  const spar = new THREE.Mesh(CYL, MAT_DIM);
  spar.scale.set(7 * s, 126 * s, 7 * s);
  spar.position.set((210 + rand() * 175) * s, (rand() - 0.5) * 140 * s, (rand() - 0.5) * 210 * s);
  spar.rotation.set(rand() * Math.PI, 0, rand() * Math.PI);
  group.add(spar);
  const tumbleX = (rand() - 0.5) * 0.08;
  const tumbleY = (rand() - 0.5) * 0.12;
  return {
    group,
    // the radius hugs the hull cluster itself, so the station reads solid —
    // but a wreck has no atmosphere to announce (and no displacement field:
    // the flat floor applies)
    pois: [{ name: `${makeName(rand)} STATION (DERELICT)`, object: group, radius: 182 * s, solid: true, envelope: false }],
    update: (dt) => {
      group.rotation.x += tumbleX * dt;
      group.rotation.y += tumbleY * dt;
      spar.rotation.z += dt * 0.2;
    },
  };
};

const cometSwarm: Builder = (rand, _own, scale) => {
  const s = scale.cometSwarm;
  const group = new THREE.Group();
  const name = makeName(rand);
  const count = 5 + Math.floor(rand() * 5);
  // True-scale budget (cometSwarm 2): orbits ≤ 2400 (the POI radius, ≤
  // half-sector 3000); tilted orbiters stray to ≤ 1.17·2400 ≈ 2800, +1500
  // offset ≈ 4300 < the 6000 eviction budget — diffuse, enterable.
  const swarm: Orbiter[] = [];
  for (let i = 0; i < count; i++) {
    const comet = new THREE.Mesh(ICO_LOW, MAT_BODY);
    comet.scale.setScalar((8 + rand() * 14) * s);
    group.add(comet);
    swarm.push({
      mesh: comet,
      r: (260 + rand() * 940) * s,
      speed: 0.1 + rand() * 0.25,
      phase: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 1.2,
    });
  }
  return {
    group,
    pois: [{ name: `${name} SWARM`, object: group, radius: 1200 * s, solid: false }],
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
function addGarnish(rand: () => number, group: THREE.Group, own: Disposable[]) {
  const offset = new THREE.Vector3(
    (rand() - 0.5) * 3400,
    (rand() - 0.5) * 2400,
    (rand() - 0.5) * 3400,
  );
  if (rand() < 0.5) {
    const count = 8 + Math.floor(rand() * 7);
    const rocks = buildInstanced(ICO_LOW, MAT_DIM, count, (rock) => {
      rock.position.set(
        offset.x + gaussish(rand) * 560,
        offset.y + gaussish(rand) * 320,
        offset.z + gaussish(rand) * 560,
      );
      rock.scale.setScalar(5 + rand() * 19);
      rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    });
    own.push(rocks);
    group.add(rocks);
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

/**
 * Builds the deterministic content of one sector from its own PRNG.
 * `scale` multiplies sizes derived from the SAME rand() draws (see
 * `WorldScale`) — content identity, draw order and beacon parity are
 * scale-independent.
 */
export function buildSectorContent(
  rand: () => number,
  sectorSize: number,
  center: THREE.Vector3,
  scale: WorldScale = UNIT_SCALE,
): SectorContent {
  const own: Disposable[] = [];
  const header = drawSectorHeader(rand);
  const content = BUILDERS[header.builderIndex][0](rand, own, scale);
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

// ---- home system layout budget ----

/** Home sun radius at ×1 (the pre-scale value). */
const HOME_SUN_RADIUS = 400;
/** Home orbital radii at ×1 (the pre-scale values). */
const HOME_BASE_ORBITS = [1300, 2100, 3000, 4200, 5600, 7300, 9000];
/** Home planet radius draw is 40 + rand()·100, so ×scale tops out here. */
const HOME_MAX_PLANET = 140;
/** Home moon orbit ladder at ×1: moon k orbits at (2.6 + 1.4k)·planetRadius. */
const HOME_MOON_ORBIT_BASE = 2.6;
const HOME_MOON_ORBIT_STEP = 1.4;
/** Moon body radius, in planet radii. */
const HOME_MOON_RADIUS = 0.22;
/** Conjunction pad between a moon and the neighbouring planet, in planet radii. */
const HOME_MOON_PAD = 0.1;
/**
 * The EPHEMERIS reservation spans home cells x,z ∈ [-1, 1] of the
 * 12,000-unit grid, so content centred at the origin is guaranteed reserved
 * space only inside ±1 cell = ±12,000 per axis — the hard wall every home
 * body must stay inside at any scale.
 */
const HOME_SPAN = 12000;
/** Clearance kept between the deepest home body and the reservation wall. */
const HOME_WALL_MARGIN = 400;

/** The home system's derived dimensions at a given scale — pure math. */
export interface HomeLayout {
  sunRadius: number;
  /** Planet orbital radii, innermost first. */
  orbitRadii: number[];
  /** Stretch applied to every orbital distance (belt and comet included). */
  orbitStretch: number;
  /** Largest possible planet radius at this scale. */
  maxPlanetRadius: number;
  /** Compression applied to the moon orbit ladder (1 at ×1 — see below). */
  moonOrbitCompression: number;
  /** Deepest moon-system reach beyond a planet centre, in planet radii. */
  moonReachRadii: number;
  /**
   * Worst-case reach of any home body from the origin: the outermost
   * planet's orbit plus its deepest possible moon system. The ship spawn
   * point and the budget tests derive from it.
   */
  maxExtent: number;
}

/**
 * Home layout at a given scale. Bodies (sun, planets, moons, the comet)
 * grow with the full factor; ORBITS stretch only as far as the reservation
 * allows: outermost orbit + deepest moon reach + margin ≤ 12,000. At scale
 * 2 that solves to ×(12000 − 400 − 4.22·280)/9000 ≈ 1.158 — planets double
 * while the map gains ~16%, and with the compressed moon ladder the
 * worst-case extent lands at ~11,037, under the 11,600 wall margin. At
 * scale 1 the bound is slack (×1.22) and the stretch clamps to the plain
 * scale, reproducing today's exact layout.
 */
export function homeLayout(scale: number): HomeLayout {
  const sunRadius = HOME_SUN_RADIUS * scale;
  const maxPlanetRadius = HOME_MAX_PLANET * scale;
  const outermostBase = HOME_BASE_ORBITS[HOME_BASE_ORBITS.length - 1];
  const ladder = HOME_MOON_ORBIT_BASE + HOME_MOON_ORBIT_STEP; // deepest orbit, ×1
  // one pass, conservative: the stretch is budgeted with the UNCOMPRESSED
  // moon reach (compressed moons would only allow more stretch)
  const orbitStretch = Math.min(
    scale,
    (HOME_SPAN - HOME_WALL_MARGIN - (ladder + HOME_MOON_RADIUS) * maxPlanetRadius) / outermostBase,
  );
  // Conjunction budget: the deepest moon system plus the fattest neighbour
  // planet must fit the smallest orbit gap (orbits 1 → 2: 800·stretch),
  // with a 0.1-planet-radius pad. At ×1 the bound is slack (solves to
  // ×1.10 → clamp to 1, today's exact ladder); at ×2 it solves to ×0.497:
  // gap 926 − planet 280 − pad 28 = 618 allowed reach = 2.21 radii →
  // (2.21 − 0.22)/4.0. Moons then orbit at 1.29R/1.99R — the innermost
  // still clears the 1.06R terrain peaks (1.29 − 0.22 moon body = 1.07R).
  const minGap = (HOME_BASE_ORBITS[1] - HOME_BASE_ORBITS[0]) * orbitStretch;
  const allowedReachRadii = minGap / maxPlanetRadius - 1 - HOME_MOON_PAD;
  const moonOrbitCompression = Math.min(1, (allowedReachRadii - HOME_MOON_RADIUS) / ladder);
  const moonReachRadii = ladder * moonOrbitCompression + HOME_MOON_RADIUS;
  const orbitRadii = HOME_BASE_ORBITS.map((r) => r * orbitStretch);
  return {
    sunRadius,
    orbitRadii,
    orbitStretch,
    maxPlanetRadius,
    moonOrbitCompression,
    moonReachRadii,
    maxExtent: orbitRadii[orbitRadii.length - 1] + moonReachRadii * maxPlanetRadius,
  };
}

/**
 * The hand-authored solar system at the origin, expressed through the same
 * SectorContent contract as procedural sectors so the engine has a single
 * code path for updates, POIs, discovery, and disposal. `scale` follows the
 * same multiplier-only rule as the sector builders (`WorldScale.home`);
 * the orbital budget lives in `homeLayout`.
 */
export function buildHomeSystem(rand: () => number, scale = 1): SectorContent {
  // geometries AND the few per-mount materials created here; shared assets
  // (MAT_*, UNIT_CIRCLE, …) are module-scope and never disposed
  const own: Array<{ dispose(): void }> = [];
  const group = new THREE.Group();
  const pois: Poi[] = [];
  const lodBodies: LodRegistration[] = [];

  const { sunRadius, orbitRadii, orbitStretch, maxPlanetRadius, moonOrbitCompression } =
    homeLayout(scale);
  const sunSeed = Math.floor(rand() * 2 ** 31);
  // the pulse animates this wrapper, so the LOD manager (which drives the
  // scale of its own rung meshes under the anchor) never fights it
  const sunPulse = new THREE.Group();
  group.add(sunPulse);
  const sun = new THREE.Group(); // LOD anchor
  sunPulse.add(sun);
  // halos live beside the sun (not inside it) so its unit-scale doesn't
  // multiply their world-space radii
  const halos = new THREE.Group();
  group.add(halos);
  const haloSpins: number[] = [];
  // Halo ladder in sun radii (today's 520/630/740 over the 400 sun),
  // compressed when the scaled sun would push it into the innermost orbit:
  // at scale 2 the outermost halo must stay under orbit 1 (1505) − max
  // planet 280 − 40 pad = 1185, squeezing the ladder ×0.80 — the inner
  // halo (833) still clears the pulsing sun's 800·1.025 = 820 peak. At
  // scale 1 the fit is slack ((1300−180)/740 ≈ 1.51) and nothing changes.
  const HALO_LADDER = [1.3, 1.575, 1.85];
  const haloFit = Math.min(
    1,
    (orbitRadii[0] - maxPlanetRadius - 40) / (HALO_LADDER[HALO_LADDER.length - 1] * sunRadius),
  );
  for (let i = 0; i < 3; i++) {
    const haloGeo = new THREE.TorusGeometry(HALO_LADDER[i] * sunRadius * haloFit, 1.8 * scale, 4, 64);
    own.push(haloGeo);
    const haloMat = wireMat(0.22 - i * 0.06);
    own.push(haloMat);
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = rand() * Math.PI;
    halo.rotation.y = rand() * Math.PI;
    haloSpins.push(0.05 + rand() * 0.1);
    halos.add(halo);
  }
  const sunBody: LodRegistration = {
    seed: sunSeed,
    radius: sunRadius,
    kind: 'star',
    anchor: sun,
    baseOpacity: 0.9,
    scaleTargets: [halos],
  };
  pois.push({ name: 'THE SUN', object: sun, radius: sunRadius, solid: true, lod: sunBody });
  lodBodies.push(sunBody);

  // every home body stays inside the reservation: worst case is
  // homeLayout's maxExtent = outermost orbit + deepest moon reach ≤
  // 12,000 − 400 at any scale (~11,037 at the true-scale ×2)
  const planetOrbiters: Orbiter[] = [];
  const moonOrbiters: Orbiter[] = [];
  const planetSpins: Array<{ mesh: THREE.Object3D; spin: number }> = [];
  for (let i = 0; i < orbitRadii.length; i++) {
    const radius = (40 + rand() * 100) * scale;
    const planetSeed = Math.floor(rand() * 2 ** 31); // seed right after the radius
    const planet = new THREE.Group(); // LOD anchor, positioned by its orbiter
    group.add(planet);
    // the name draws here — between the seed and the orbit phase — exactly
    // as before; the registration is linked onto the POI at the loop's end
    const poi: Poi = { name: `${makeName(rand)}-${i + 1}`, object: planet, radius, solid: true };
    pois.push(poi);
    planetOrbiters.push({
      mesh: planet,
      r: orbitRadii[i],
      // normalized by the innermost orbit, so a uniform stretch keeps the
      // exact ×1 angular speeds
      speed: (0.5 / Math.pow(orbitRadii[i] / orbitRadii[0], 1.5)) * 0.06,
      phase: rand() * Math.PI * 2,
    });
    // near-imperceptible day cycle, matching the rogue planets (÷50)
    planetSpins.push({ mesh: planet, spin: 0.002 + rand() * 0.008 });

    const orbit = new THREE.Line(UNIT_CIRCLE, ORBIT_MAT);
    orbit.scale.setScalar(orbitRadii[i]);
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
        moon.scale.setScalar(HOME_MOON_RADIUS * radius);
        moonSystem.add(moon);
        moonOrbiters.push({
          mesh: moon,
          // the ladder compresses at scale so a deep moon system can never
          // sweep through the neighbouring planet at conjunction (the
          // budget arithmetic lives in homeLayout)
          r: (HOME_MOON_ORBIT_BASE + k * HOME_MOON_ORBIT_STEP) * moonOrbitCompression * radius,
          speed: 0.5 + rand(),
          phase: rand() * Math.PI * 2,
        });
      }
    }
    const body: LodRegistration = { seed: planetSeed, radius, kind: 'planet', anchor: planet, baseOpacity: 0.85, scaleTargets };
    poi.lod = body;
    lodBodies.push(body);
  }

  // asteroid belt between the 4th and 5th orbits — it stretches with them
  // (at ×2: 5152–5731, between orbit 4 at 4862 and orbit 5 at 6483)
  const belt = new THREE.Group();
  {
    const n = 500;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const r = (4450 + rand() * 500) * orbitStretch;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (rand() - 0.5) * 120 * orbitStretch;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    own.push(geometry);
    belt.add(new THREE.Points(geometry, BELT_MAT));
    group.add(belt);
  }

  // comet on an eccentric orbit, dragging a trail. The ellipse stretches
  // with the orbits (apoapsis 8500·stretch ≈ 9840 at ×2 — inside the
  // outermost orbit, exactly as at ×1, and inside the 12,000 wall); the
  // body itself grows with the planet scale.
  const cometApo = 8500 * orbitStretch;
  const cometMinor = 3600 * orbitStretch;
  const cometLift = 250 * orbitStretch;
  const comet = new THREE.Mesh(ICO_LOW, MAT_BRIGHT);
  comet.scale.setScalar(22 * scale);
  group.add(comet);
  // solid, but far too small for an "atmospheric envelope" to read right
  pois.push({ name: 'THE COMET', object: comet, radius: 27 * scale, solid: true, envelope: false });
  const TRAIL_LENGTH = 70;
  const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
  // Start the whole trail at the comet's t=0 position (same formula as
  // update below); zeros would draw a line to the origin for the first
  // TRAIL_LENGTH frames.
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    trailPositions[i * 3] = Math.cos(2) * cometApo;
    trailPositions[i * 3 + 1] = Math.sin(4) * cometLift;
    trailPositions[i * 3 + 2] = Math.sin(2) * cometMinor;
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
      comet.position.set(
        Math.cos(cometAngle) * cometApo,
        Math.sin(cometAngle * 2) * cometLift,
        Math.sin(cometAngle) * cometMinor,
      );
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

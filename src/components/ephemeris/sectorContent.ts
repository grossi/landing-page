import * as THREE from 'three';
import { makeName } from 'components/ephemeris/rng';

/** A named place the HUD can point at (and, later, "discover"). */
export interface Poi {
  name: string;
  object: THREE.Object3D;
  /** Approximate radius of the thing, so distance reads as surface distance. */
  radius: number;
  discovered?: boolean;
}

export interface SectorContent {
  group: THREE.Group;
  pois: Poi[];
  update?: (dt: number, t: number) => void;
  /** Frees only resources created for this sector (shared assets stay). */
  dispose: () => void;
}

// ---- shared assets (created once, never disposed per sector) ----

export const wireMat = (opacity: number) =>
  new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity });

const ICO_LOW = new THREE.IcosahedronGeometry(1, 0);
const ICO_MID = new THREE.IcosahedronGeometry(1, 1);
const RING = new THREE.TorusGeometry(1.9, 0.1, 4, 42);
const MAT_BRIGHT = wireMat(0.9);
const MAT_BODY = wireMat(0.85);
const MAT_DIM = wireMat(0.6);
const MAT_RING = wireMat(0.5);
const ORBIT_MAT = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });

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
const softSprite = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
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

// ---- archetype builders ----
// Each places content in sector-local coordinates around (0,0,0); the caller
// positions the group at the sector centre. Geometries created here (points,
// per-sector lines) are pushed to `own` and disposed with the sector.

type Builder = (rand: () => number, own: THREE.BufferGeometry[]) => Omit<SectorContent, 'dispose'>;

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
  for (let b = 0, i = 0; b < blobs; b++) {
    const cx = (rand() - 0.5) * reach * 1.4;
    const cy = (rand() - 0.5) * reach * 0.6;
    const cz = (rand() - 0.5) * reach * 1.4;
    const r = reach * (0.4 + rand() * 0.5);
    const share = Math.floor(total / blobs);
    for (let k = 0; k < share && i < total; k++, i++) {
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

interface Orbiter { mesh: THREE.Mesh; r: number; speed: number; phase: number }

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
      for (const m of moons) {
        const a = m.phase + t * m.speed;
        m.mesh.position.set(Math.cos(a) * m.r, 0, Math.sin(a) * m.r);
      }
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
      for (const p of planets) {
        const a = p.phase + t * p.speed;
        p.mesh.position.set(Math.cos(a) * p.r, 0, Math.sin(a) * p.r);
      }
    },
  };
};

// weights roughly tuned so space feels varied but never empty
const BUILDERS: Array<[Builder, number]> = [
  [asteroidCluster, 0.3],
  [nebula, 0.26],
  [roguePlanet, 0.24],
  [miniSystem, 0.2],
];

/** Builds the deterministic content of one sector from its own PRNG. */
export function buildSectorContent(
  rand: () => number,
  sectorSize: number,
  center: THREE.Vector3,
): SectorContent {
  const own: THREE.BufferGeometry[] = [];
  let roll = rand();
  let builder = BUILDERS[BUILDERS.length - 1][0];
  for (const [candidate, weight] of BUILDERS) {
    if (roll < weight) { builder = candidate; break; }
    roll -= weight;
  }
  const content = builder(rand, own);
  // scatter the content off-centre so sector boundaries aren't felt
  content.group.position.set(
    center.x + (rand() - 0.5) * sectorSize * 0.5,
    center.y + (rand() - 0.5) * sectorSize * 0.5,
    center.z + (rand() - 0.5) * sectorSize * 0.5,
  );
  return {
    ...content,
    dispose: () => { own.forEach((g) => g.dispose()); },
  };
}

/** Sector display name, e.g. "KHEVEL EXPANSE". */
export function sectorName(rand: () => number): string {
  return makeName(rand);
}

export { softSprite };

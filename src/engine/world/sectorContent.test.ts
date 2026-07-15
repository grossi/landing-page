// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { hashCoords, mulberry32 } from 'engine/core/rng';
import {
  buildHomeSystem,
  buildSectorContent,
  drawSectorHeader,
  homeLayout,
  peekSectorBeacon,
  TRUE_SCALE,
  UNIT_SCALE,
  type SectorContent,
  type WorldScale,
} from 'engine/world/sectorContent';

const SECTOR = 6000;

const buildAt = (x: number, y: number, z: number, worldSeed: number, scale?: WorldScale) =>
  buildSectorContent(
    mulberry32(hashCoords(x, y, z, worldSeed)),
    SECTOR,
    new THREE.Vector3((x + 0.5) * SECTOR, (y + 0.5) * SECTOR, (z + 0.5) * SECTOR),
    scale,
  );

describe('buildSectorContent', () => {
  // The discovery log keys POIs by `${sectorKey}:${index}`, which only stays
  // stable across sector unload/rebuild if generation is fully deterministic.
  it('regenerates identical content for the same sector and seed', () => {
    for (const [x, y, z] of [[2, 0, -1], [-5, 3, 8], [40, -12, 7]]) {
      const a = buildAt(x, y, z, 12345);
      const b = buildAt(x, y, z, 12345);
      expect(a.name).toBe(b.name);
      expect(a.pois.map((p) => p.name)).toEqual(b.pois.map((p) => p.name));
      expect(a.pois.map((p) => p.radius)).toEqual(b.pois.map((p) => p.radius));
      expect(a.group.position.toArray()).toEqual(b.group.position.toArray());
      // LOD bodies (seed, radius, kind) must regenerate identically too —
      // a rebuilt sector's planets must keep their exact shapes
      expect(a.lodBodies.map((l) => [l.seed, l.radius, l.kind])).toEqual(
        b.lodBodies.map((l) => [l.seed, l.radius, l.kind]),
      );
      a.dispose();
      b.dispose();
    }
  });

  it('registers LOD bodies with anchors inside the sector group', () => {
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const content = buildAt(i, 1, -i, 99);
      for (const body of content.lodBodies) {
        expect(body.radius).toBeGreaterThan(0);
        expect(Number.isInteger(body.seed)).toBe(true);
        expect(['planet', 'asteroid', 'star']).toContain(body.kind);
        let root = body.anchor;
        while (root.parent) root = root.parent;
        expect(root).toBe(content.group);
      }
      total += content.lodBodies.length;
      content.dispose();
    }
    // planets/stars are common enough that 40 sectors must yield some
    expect(total).toBeGreaterThan(0);
  });

  it('peekSectorBeacon lands exactly on the content group position', () => {
    for (let i = 0; i < 50; i++) {
      const [x, y, z] = [i - 25, 2 * i - 50, 7 - 3 * i];
      const content = buildAt(x, y, z, 4242);
      const beacon = peekSectorBeacon(x, y, z, 4242, SECTOR);
      expect([beacon.x, beacon.y, beacon.z]).toEqual(content.group.position.toArray());
      expect(beacon.brightness).toBeGreaterThan(0);
      expect(beacon.brightness).toBeLessThanOrEqual(1);
      content.dispose();
    }
  });

  it('always yields at least one named POI with a positive radius', () => {
    for (let i = 0; i < 40; i++) {
      const content = buildAt(i, -i, 2 * i + 1, 777);
      expect(content.pois.length).toBeGreaterThan(0);
      for (const poi of content.pois) {
        expect(poi.name).toBeTruthy();
        expect(poi.radius).toBeGreaterThan(0);
        // scaled-up archetypes must still fit their sector comfortably
        expect(poi.radius).toBeLessThanOrEqual(SECTOR / 2);
      }
      content.dispose();
    }
  });

  it('classifies archetype solidity: hard bodies solid, formations diffuse', () => {
    // Indices into the BUILDERS table whose volumes are enterable:
    // 0 = asteroidCluster, 1 = nebula, 5 = monolithField, 7 = cometSwarm
    // (8 = derelictStation, asserted solid-but-envelopeless below).
    // Coupled to the table's order — reordering BUILDERS fails here loudly.
    const DIFFUSE_BUILDERS = new Set([0, 1, 5, 7]);
    let sawDiffuse = 0;
    let sawSolid = 0;
    for (let i = 0; i < 60; i++) {
      const [x, y, z] = [i, 4, 3 * i];
      const header = drawSectorHeader(mulberry32(hashCoords(x, y, z, 2024)));
      const content = buildAt(x, y, z, 2024);
      const expected = !DIFFUSE_BUILDERS.has(header.builderIndex);
      for (const poi of content.pois) {
        expect(poi.solid).toBe(expected);
        // the derelict station is solid but carries no envelope fiction
        if (header.builderIndex === 8) expect(poi.envelope).toBe(false);
        if (poi.solid) sawSolid++;
        else sawDiffuse++;
      }
      content.dispose();
    }
    // both kinds are common enough that 60 sectors must yield each
    expect(sawDiffuse).toBeGreaterThan(0);
    expect(sawSolid).toBeGreaterThan(0);
  });

  it('renders static swarms as instanced batches with covering bounds', () => {
    const collectInstanced = (root: THREE.Object3D): THREE.InstancedMesh[] => {
      const out: THREE.InstancedMesh[] = [];
      root.traverse((obj) => {
        if ((obj as THREE.InstancedMesh).isInstancedMesh) out.push(obj as THREE.InstancedMesh);
      });
      return out;
    };
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let batches = 0;
    for (let i = 0; i < 60; i++) {
      const a = buildAt(i, 9, -2 * i, 31337);
      const b = buildAt(i, 9, -2 * i, 31337);
      const instancedA = collectInstanced(a.group);
      const instancedB = collectInstanced(b.group);
      expect(instancedA.length).toBe(instancedB.length);
      for (let m = 0; m < instancedA.length; m++) {
        batches++;
        const meshA = instancedA[m];
        // a rebuilt sector places every instance identically (determinism)
        expect(Array.from(meshA.instanceMatrix.array)).toEqual(
          Array.from(instancedB[m].instanceMatrix.array),
        );
        // instanced frustum culling is whole-batch: the explicit bounding
        // sphere must cover every instance or swarms clip while visible
        const sphere = meshA.boundingSphere!;
        expect(sphere).not.toBeNull();
        for (let k = 0; k < meshA.count; k++) {
          meshA.getMatrixAt(k, matrix);
          matrix.decompose(position, quaternion, scale);
          expect(position.distanceTo(sphere.center)).toBeLessThanOrEqual(sphere.radius + 1e-3);
        }
      }
      a.dispose();
      b.dispose();
    }
    // clusters/monoliths/garnish are common; 60 sectors must instance a few
    expect(batches).toBeGreaterThan(0);
  });

  it('scatters content off the sector centre but within the sector', () => {
    for (let i = 0; i < 40; i++) {
      const content = buildAt(i, 0, -i, 42);
      const center = new THREE.Vector3((i + 0.5) * SECTOR, 0.5 * SECTOR, (-i + 0.5) * SECTOR);
      const offset = content.group.position.clone().sub(center);
      for (const c of offset.toArray()) expect(Math.abs(c)).toBeLessThanOrEqual(SECTOR * 0.25);
      content.dispose();
    }
  });
});

/**
 * Eviction budget, parameterized on the grid: the content group sits at
 * most 0.25·sectorSize off the sector centre per axis (drawSectorHeader),
 * and sectors stay alive within ACTIVE_RANGE 1 of the ship — eviction only
 * past 1.5·sectorSize from the sector centre. A skimming ship can never
 * evict the body under itself as long as the worst-case POI reach (max
 * offset + orbit + radius) stays comfortably below; we assert < sectorSize,
 * a 0.5·sectorSize margin. Orbiting POIs (mini-system planets) sit at
 * |local| = orbit radius at every phase, so any sampled time measures the
 * true extent.
 */
function assertInsideBudget(content: SectorContent, sectorSize: number) {
  const maxOffset = sectorSize * 0.25;
  for (const t of [0, 250]) {
    content.update?.(1 / 60, t);
    content.group.updateMatrixWorld(true);
    for (const poi of content.pois) {
      const local = new THREE.Vector3()
        .setFromMatrixPosition(poi.object.matrixWorld)
        .sub(content.group.position);
      expect(maxOffset + local.length() + poi.radius).toBeLessThan(sectorSize);
      // and no single POI volume outgrows its half-sector
      expect(poi.radius).toBeLessThanOrEqual(sectorSize / 2);
    }
  }
}

describe('world scale', () => {
  it('UNIT_SCALE is the default and reproduces the unscaled world exactly', () => {
    for (const [x, y, z] of [[3, -1, 5], [-8, 2, 0], [21, 7, -4]]) {
      const implicit = buildAt(x, y, z, 555);
      const explicit = buildAt(x, y, z, 555, UNIT_SCALE);
      expect(implicit.pois.map((p) => [p.name, p.radius, p.solid])).toEqual(
        explicit.pois.map((p) => [p.name, p.radius, p.solid]),
      );
      expect(implicit.lodBodies.map((l) => [l.seed, l.radius, l.kind])).toEqual(
        explicit.lodBodies.map((l) => [l.seed, l.radius, l.kind]),
      );
      implicit.dispose();
      explicit.dispose();
    }
  });

  it('scale multiplies existing draws only — identity and draw order never change', () => {
    // the ABSOLUTE RULE: the same PRNG stream must yield the same names,
    // seeds, kinds, counts and group position at ANY scale — only sizes move
    for (let i = 0; i < 60; i++) {
      const [x, y, z] = [2 * i, -i, i + 3];
      const unit = buildAt(x, y, z, 9090);
      const scaled = buildAt(x, y, z, 9090, TRUE_SCALE);
      expect(scaled.name).toBe(unit.name);
      expect(scaled.group.position.toArray()).toEqual(unit.group.position.toArray());
      expect(scaled.pois.map((p) => p.name)).toEqual(unit.pois.map((p) => p.name));
      expect(scaled.pois.map((p) => p.solid)).toEqual(unit.pois.map((p) => p.solid));
      expect(scaled.lodBodies.map((l) => [l.seed, l.kind])).toEqual(
        unit.lodBodies.map((l) => [l.seed, l.kind]),
      );
      // sizes only ever grow (every TRUE_SCALE factor is ≥ 1)
      scaled.pois.forEach((p, k) => expect(p.radius).toBeGreaterThanOrEqual(unit.pois[k].radius));
      unit.dispose();
      scaled.dispose();
    }
  });

  it('regenerates identical content at TRUE_SCALE', () => {
    for (const [x, y, z] of [[2, 0, -1], [-5, 3, 8], [40, -12, 7]]) {
      const a = buildAt(x, y, z, 12345, TRUE_SCALE);
      const b = buildAt(x, y, z, 12345, TRUE_SCALE);
      expect(a.pois.map((p) => [p.name, p.radius])).toEqual(b.pois.map((p) => [p.name, p.radius]));
      expect(a.lodBodies.map((l) => [l.seed, l.radius, l.kind])).toEqual(
        b.lodBodies.map((l) => [l.seed, l.radius, l.kind]),
      );
      a.dispose();
      b.dispose();
    }
  });

  it('links solid LOD-rendered POIs to their registration for the terrain floor', () => {
    let linked = 0;
    for (let i = 0; i < 60; i++) {
      const content = buildAt(i, 5, -i, 777, TRUE_SCALE);
      for (const poi of content.pois) {
        if (poi.lod) {
          linked++;
          // the link must be to a registration of the same body
          expect(content.lodBodies).toContain(poi.lod);
          expect(poi.lod.anchor).toBe(poi.object);
          expect(poi.lod.radius).toBe(poi.radius);
          expect(poi.solid).toBe(true);
        }
      }
      content.dispose();
    }
    expect(linked).toBeGreaterThan(0);
  });

  it('keeps every true-scale POI inside the eviction budget', () => {
    // Random sweep at the tightest grid (6,000; see assertInsideBudget).
    // Worst case today is the ×2 mini-system: 1500 + 3880 + 180 = 5560 <
    // 6000. A future scale bump that overflows fails loudly here instead
    // of catapulting a ship off an evicted planet.
    for (let i = 0; i < 150; i++) {
      const content = buildAt(i, 13, 7 - 2 * i, 31415, TRUE_SCALE);
      assertInsideBudget(content, SECTOR);
      content.dispose();
    }
  });

  it('keeps even the extreme-draw worst case of every archetype inside the budget', () => {
    // The random sweep above can miss the tail (a 4-planet mini-system
    // with near-max draws is rare), so pin the analytic worst case
    // deterministically: replay a real header until drawSectorHeader picks
    // each archetype, then peg every body draw to ~1 (max sizes, orbits,
    // counts) or 0. Asserted at BOTH grids — 6,000 (the tightest budget)
    // and 12,000 (the sector size EPHEMERIS actually ships).
    const ARCHETYPES = 9; // BUILDERS table length
    for (const sectorSize of [6000, 12000]) {
      for (let target = 0; target < ARCHETYPES; target++) {
        for (const extreme of [1 - 1e-9, 0]) {
          let content: SectorContent | null = null;
          for (let seed = 0; seed < 5000 && !content; seed++) {
            let draws = 0;
            const probe = mulberry32(seed);
            const counted = () => {
              draws++;
              return probe();
            };
            if (drawSectorHeader(counted).builderIndex !== target) continue;
            // same header stream, then pegged extremes for the body draws
            const replay = mulberry32(seed);
            let remaining = draws;
            const rand = () => (remaining-- > 0 ? replay() : extreme);
            content = buildSectorContent(rand, sectorSize, new THREE.Vector3(), TRUE_SCALE);
          }
          expect(content).not.toBeNull();
          assertInsideBudget(content!, sectorSize);
          content!.dispose();
        }
      }
    }
  });
});

describe('homeLayout', () => {
  it('is the identity at scale 1', () => {
    const layout = homeLayout(1);
    expect(layout.sunRadius).toBe(400);
    expect(layout.orbitStretch).toBe(1);
    expect(layout.orbitRadii).toEqual([1300, 2100, 3000, 4200, 5600, 7300, 9000]);
    expect(layout.maxPlanetRadius).toBe(140);
    // the ×1 moon ladder already fits the conjunction budget — no compression
    expect(layout.moonOrbitCompression).toBe(1);
    expect(layout.moonReachRadii).toBeCloseTo(4.22, 9);
    expect(layout.maxExtent).toBeLessThan(12000);
  });

  it('doubles bodies but budget-stretches orbits inside the reservation wall at scale 2', () => {
    const layout = homeLayout(2);
    expect(layout.sunRadius).toBe(800);
    expect(layout.maxPlanetRadius).toBe(280);
    // orbits gain ~16%, not ×2 — the reservation wall binds
    expect(layout.orbitStretch).toBeGreaterThan(1);
    expect(layout.orbitStretch).toBeLessThan(1.2);
    // outermost orbit + deepest moon reach stays behind the wall margin
    expect(layout.maxExtent).toBeLessThanOrEqual(12000 - 400 + 1e-9);
    // conjunction budget: EVERY orbit gap clears a max planet plus the
    // deepest (compressed) moon system of its neighbour, with the pad
    const reach = layout.moonReachRadii * layout.maxPlanetRadius;
    for (let i = 1; i < layout.orbitRadii.length; i++) {
      expect(layout.orbitRadii[i] - layout.orbitRadii[i - 1]).toBeGreaterThanOrEqual(
        reach + layout.maxPlanetRadius,
      );
    }
    expect(layout.moonOrbitCompression).toBeLessThan(1);
    // compressed moons still orbit clear of the 1.06R terrain peaks
    // (innermost ladder rung 2.6·compression minus the 0.22R moon body)
    expect(2.6 * layout.moonOrbitCompression - 0.22).toBeGreaterThan(1.06);
    // the innermost orbit clears the sun and the biggest planet
    expect(layout.orbitRadii[0]).toBeGreaterThan(layout.sunRadius + layout.maxPlanetRadius);
  });
});

describe('buildHomeSystem', () => {
  it('is deterministic for a given seed and exposes the fixed landmarks', () => {
    const a = buildHomeSystem(mulberry32(9));
    const b = buildHomeSystem(mulberry32(9));
    expect(a.pois.map((p) => p.name)).toEqual(b.pois.map((p) => p.name));
    const names = a.pois.map((p) => p.name);
    expect(names[0]).toBe('THE SUN');
    expect(names).toContain('THE COMET');
    // sun + seven planets + comet — all hard bodies; only the comet is too
    // small to carry the atmospheric-envelope fiction
    expect(a.pois).toHaveLength(9);
    expect(a.pois.every((p) => p.solid)).toBe(true);
    expect(a.pois.find((p) => p.name === 'THE COMET')!.envelope).toBe(false);
    // the sun and every planet render through the LOD ladder
    expect(a.lodBodies).toHaveLength(8);
    expect(a.lodBodies[0]).toMatchObject({ kind: 'star', radius: 400 });
    expect(a.lodBodies.slice(1).every((l) => l.kind === 'planet')).toBe(true);
    expect(a.lodBodies.map((l) => l.seed)).toEqual(b.lodBodies.map((l) => l.seed));
    a.dispose();
    b.dispose();
  });

  it('starts the comet trail on the comet, not at the origin', () => {
    const home = buildHomeSystem(mulberry32(3));
    home.update?.(1 / 60, 0);
    const comet = home.pois.find((p) => p.name === 'THE COMET')!.object;
    const trail = home.group.children.find(
      (obj): obj is THREE.Line => obj instanceof THREE.Line && obj.geometry.attributes.position.count === 70,
    )!;
    const positions = trail.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const d = comet.position.distanceTo(new THREE.Vector3().fromBufferAttribute(positions, i));
      // every trail point sits near the comet's spawn, none at (0,0,0)
      expect(d).toBeLessThan(800);
    }
    home.dispose();
  });

  it('keeps every body inside the reserved home cells (< 2 sectors of 6,000)', () => {
    const home = buildHomeSystem(mulberry32(5));
    // sample a few orbit phases; positions are pure functions of t
    for (const t of [0, 60, 500, 3600]) {
      home.update?.(1 / 60, t);
      home.group.updateMatrixWorld(true);
      for (const poi of home.pois) {
        const p = new THREE.Vector3().setFromMatrixPosition(poi.object.matrixWorld);
        expect(p.length() + poi.radius).toBeLessThan(12000);
      }
    }
    home.dispose();
  });

  it('keeps identity across scales and doubles every body at scale 2', () => {
    const unit = buildHomeSystem(mulberry32(9));
    const scaled = buildHomeSystem(mulberry32(9), 2);
    // same names, same seeds — scale multiplies existing draws only
    expect(scaled.pois.map((p) => p.name)).toEqual(unit.pois.map((p) => p.name));
    expect(scaled.lodBodies.map((l) => l.seed)).toEqual(unit.lodBodies.map((l) => l.seed));
    // sun and planets double exactly (radius draw × scale)
    scaled.lodBodies.forEach((l, i) => expect(l.radius).toBeCloseTo(unit.lodBodies[i].radius * 2, 9));
    expect(scaled.lodBodies[0].radius).toBe(800);
    // planet radii land in the ×2 band 80–280
    for (const l of scaled.lodBodies.slice(1)) {
      expect(l.radius).toBeGreaterThanOrEqual(80);
      expect(l.radius).toBeLessThanOrEqual(280);
    }
    unit.dispose();
    scaled.dispose();
  });

  it('keeps every scaled body inside the reservation and links terrain floors', () => {
    const home = buildHomeSystem(mulberry32(5), 2);
    for (const t of [0, 60, 500, 3600]) {
      home.update?.(1 / 60, t);
      home.group.updateMatrixWorld(true);
      for (const poi of home.pois) {
        const p = new THREE.Vector3().setFromMatrixPosition(poi.object.matrixWorld);
        expect(p.length() + poi.radius).toBeLessThan(12000);
      }
    }
    // the sun and every planet carry their registration so the flight sim's
    // altitude floor can follow their terrain; the comet stays flat-floored
    expect(home.pois[0].lod).toBe(home.lodBodies[0]);
    const planets = home.pois.filter((p) => p.lod?.kind === 'planet');
    expect(planets).toHaveLength(7);
    expect(home.pois.find((p) => p.name === 'THE COMET')!.lod).toBeUndefined();
    home.dispose();
  });
});

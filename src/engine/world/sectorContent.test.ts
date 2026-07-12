// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { hashCoords, mulberry32 } from 'engine/core/rng';
import { buildHomeSystem, buildSectorContent } from 'engine/world/sectorContent';

const SECTOR = 700;

const buildAt = (x: number, y: number, z: number, worldSeed: number) =>
  buildSectorContent(
    mulberry32(hashCoords(x, y, z, worldSeed)),
    SECTOR,
    new THREE.Vector3((x + 0.5) * SECTOR, (y + 0.5) * SECTOR, (z + 0.5) * SECTOR),
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
      a.dispose();
      b.dispose();
    }
  });

  it('always yields at least one named POI with a positive radius', () => {
    for (let i = 0; i < 40; i++) {
      const content = buildAt(i, -i, 2 * i + 1, 777);
      expect(content.pois.length).toBeGreaterThan(0);
      for (const poi of content.pois) {
        expect(poi.name).toBeTruthy();
        expect(poi.radius).toBeGreaterThan(0);
      }
      content.dispose();
    }
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

describe('buildHomeSystem', () => {
  it('is deterministic for a given seed and exposes the fixed landmarks', () => {
    const a = buildHomeSystem(mulberry32(9));
    const b = buildHomeSystem(mulberry32(9));
    expect(a.pois.map((p) => p.name)).toEqual(b.pois.map((p) => p.name));
    const names = a.pois.map((p) => p.name);
    expect(names[0]).toBe('THE SUN');
    expect(names).toContain('THE COMET');
    // sun + seven planets + comet
    expect(a.pois).toHaveLength(9);
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
      expect(d).toBeLessThan(60);
    }
    home.dispose();
  });
});

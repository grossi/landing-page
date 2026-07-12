// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { SectorContent } from 'engine/world/sectorContent';
import { createSectorField, type SectorField } from 'engine/world/sectors';

const SECTOR = 700;
const WINDOW = 27; // (2 * activeRange + 1)^3 with the default activeRange 1

const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const makeField = (scene: THREE.Scene, opts: Partial<Parameters<typeof createSectorField>[1]> = {}) =>
  createSectorField(scene, { worldSeed: 12345, sectorSize: SECTOR, ...opts });

/** Sector groups are the only children these tests add to the scene. */
const sectorCount = (scene: THREE.Scene) => scene.children.length;

const poiIds = (field: SectorField) => {
  const ids: string[] = [];
  field.forEachPoi((poi) => { ids.push(poi.id!); });
  return ids.sort();
};

describe('createSectorField', () => {
  it('immediate sync at the origin builds the full active window', () => {
    const scene = new THREE.Scene();
    const field = makeField(scene);
    field.sync(at(0, 0, 0), true);
    expect(sectorCount(scene)).toBe(WINDOW);
    const cell = field.currentCell();
    expect(cell).toMatchObject({ x: 0, y: 0, z: 0, key: '0,0,0' });
    expect(cell.content).not.toBeNull();
    field.dispose();
  });

  it('moving one full sector evicts the far shell and queues the new one', () => {
    const scene = new THREE.Scene();
    const field = makeField(scene);
    field.sync(at(0, 0, 0), true);

    field.sync(at(SECTOR * 1.5, 0, 0)); // non-immediate: builds are budgeted
    // 9 cells evicted at once, 9 queued, 2 (default budget) built this call
    expect(sectorCount(scene)).toBe(WINDOW - 9 + 2);
    expect(field.currentCell().key).toBe('1,0,0');

    // repeated syncs in place drain the queue back to a full window
    for (let i = 0; i < 4; i++) field.sync(at(SECTOR * 1.5, 0, 0));
    expect(sectorCount(scene)).toBe(WINDOW);
    // and the fast path holds steady
    field.sync(at(SECTOR * 1.5, 0, 0));
    expect(sectorCount(scene)).toBe(WINDOW);
    field.dispose();
  });

  it('reserved cells get null content and never a random group', () => {
    const scene = new THREE.Scene();
    const field = makeField(scene, { reserved: (x, y, z) => x === 0 && y === 0 && z === 0 });
    field.sync(at(0, 0, 0), true);
    expect(sectorCount(scene)).toBe(WINDOW - 1);
    expect(field.currentCell().content).toBeNull();
    // POIs come only from the 26 non-reserved cells
    expect(poiIds(field).some((id) => id.startsWith('0,0,0:'))).toBe(false);
    field.dispose();
  });

  it('spreads a fresh window across syncs at buildBudgetPerFrame sectors each', () => {
    const scene = new THREE.Scene();
    const field = makeField(scene, { buildBudgetPerFrame: 2 });
    let syncs = 0;
    while (sectorCount(scene) < WINDOW) {
      const before = sectorCount(scene);
      field.sync(at(0, 0, 0));
      syncs++;
      expect(sectorCount(scene) - before).toBeLessThanOrEqual(2);
      expect(syncs).toBeLessThanOrEqual(WINDOW); // safety against a stalled queue
    }
    expect(syncs).toBe(Math.ceil(WINDOW / 2));
    field.dispose();
  });

  it('rebuilds an evicted cell with identical POI ids and names', () => {
    const scene = new THREE.Scene();
    const field = makeField(scene);
    field.sync(at(0, 0, 0), true);
    const before = poiIds(field);
    const names = new Map<string, string>();
    field.forEachPoi((poi) => names.set(poi.id!, poi.name));

    field.sync(at(SECTOR * 40, 0, 0), true); // far away: everything evicted
    expect(poiIds(field).some((id) => before.includes(id))).toBe(false);

    field.sync(at(0, 0, 0), true); // return: same cells, same seed
    expect(poiIds(field)).toEqual(before);
    field.forEachPoi((poi) => expect(poi.name).toBe(names.get(poi.id!)));
    field.dispose();
  });

  it('reports every content addition and removal through the hooks', () => {
    const scene = new THREE.Scene();
    const added: SectorContent[] = [];
    const removed: SectorContent[] = [];
    const field = makeField(scene, {
      onContentAdded: (content) => added.push(content),
      onContentRemoved: (content) => removed.push(content),
    });
    field.sync(at(0, 0, 0), true);
    expect(added).toHaveLength(WINDOW);
    expect(removed).toHaveLength(0);

    field.sync(at(SECTOR * 40, 0, 0), true); // far away: everything evicted
    expect(added).toHaveLength(2 * WINDOW);
    expect(removed).toHaveLength(WINDOW);
    for (const content of removed) expect(added).toContain(content);

    field.dispose(); // disposal reports removals too
    expect(removed).toHaveLength(2 * WINDOW);
  });

  it('applyOriginShift moves groups render-local while cells stay absolute', () => {
    const scene = new THREE.Scene();
    const field = makeField(scene);
    field.sync(at(0, 0, 0), true);
    const ids = poiIds(field);
    const groups = [...scene.children];
    const before = groups.map((g) => g.position.clone());

    const delta = at(SECTOR * 3, -SECTOR, SECTOR * 2);
    field.applyOriginShift(delta);
    expect(field.origin().toArray()).toEqual(delta.toArray());
    // every built group shifted by exactly -delta…
    groups.forEach((group, i) => {
      expect(group.position.toArray()).toEqual(before[i].clone().sub(delta).toArray());
    });
    // …and the same ABSOLUTE viewer position rebuilds nothing
    field.sync(at(0, 0, 0));
    expect(scene.children.length).toBe(groups.length);
    groups.forEach((group, i) => expect(scene.children[i]).toBe(group));
    expect(poiIds(field)).toEqual(ids);
    expect(field.currentCell().key).toBe('0,0,0');
    field.dispose();
  });

  it('builds far sectors render-local to the shifted origin', () => {
    const scene = new THREE.Scene();
    const field = makeField(scene);
    // origin re-anchored a million sectors out (a deep-space warp)
    field.applyOriginShift(at(SECTOR * 1_000_000, 0, 0));
    field.sync(at(SECTOR * 1_000_000.5, 0, 0), true);
    expect(field.currentCell().key).toBe('1000000,0,0');
    // absolute cell keys are huge, render coordinates stay float32-small
    for (const child of scene.children) {
      expect(Math.abs(child.position.x)).toBeLessThan(SECTOR * 3);
      expect(Math.abs(child.position.y)).toBeLessThan(SECTOR * 3);
      expect(Math.abs(child.position.z)).toBeLessThan(SECTOR * 3);
    }
    field.dispose();
  });

  it('rebuilds a sector identically whether or not the origin has shifted', () => {
    const sceneA = new THREE.Scene();
    const fieldA = makeField(sceneA);
    fieldA.sync(at(SECTOR * 7.5, 0, 0), true);
    const namesA = new Map<string, string>();
    fieldA.forEachPoi((poi) => namesA.set(poi.id!, poi.name));

    const sceneB = new THREE.Scene();
    const fieldB = makeField(sceneB);
    fieldB.applyOriginShift(at(SECTOR * 7, 0, 0));
    fieldB.sync(at(SECTOR * 7.5, 0, 0), true); // same absolute position
    const namesB = new Map<string, string>();
    fieldB.forEachPoi((poi) => namesB.set(poi.id!, poi.name));

    expect([...namesB.entries()].sort()).toEqual([...namesA.entries()].sort());
    fieldA.dispose();
    fieldB.dispose();
  });

  describe('revealSeconds (spawn fade-in)', () => {
    /** Every drawable material under `scene`, deduped. */
    const materialsOf = (scene: THREE.Scene) => {
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        const material = (object as THREE.Mesh).material as THREE.Material | undefined;
        if (material && !Array.isArray(material)) materials.add(material);
      });
      return [...materials];
    };

    it('builds sectors fully transparent and fades them in over the window', () => {
      const scene = new THREE.Scene();
      const field = makeField(scene, { revealSeconds: 1 });
      field.sync(at(0, 0, 0), true);
      const materials = materialsOf(scene);
      expect(materials.length).toBeGreaterThan(0);
      for (const material of materials) expect(material.opacity).toBe(0);

      field.updateContents(0.5, 0.5); // halfway: strictly between 0 and base
      for (const material of materials) {
        expect(material.opacity).toBeGreaterThan(0);
      }

      field.updateContents(0.6, 1.1); // past the window: back to base opacity
      const halfway = materialsOf(scene).map((m) => m.opacity);
      field.updateContents(1, 2.1); // done reveals are settled — no drift
      materialsOf(scene).forEach((material, i) => expect(material.opacity).toBe(halfway[i]));
      for (const material of materials) expect(material.opacity).toBeGreaterThan(0.05);
      field.dispose();
    });

    it('clones materials per sector so shared assets are never dimmed', () => {
      const sceneA = new THREE.Scene();
      const fieldA = makeField(sceneA, { revealSeconds: 1 });
      fieldA.sync(at(0, 0, 0), true); // opacity 0 everywhere in A

      const sceneB = new THREE.Scene();
      const fieldB = makeField(sceneB); // no reveal: shared assets as-authored
      fieldB.sync(at(0, 0, 0), true);
      for (const material of materialsOf(sceneB)) {
        expect(material.opacity).toBeGreaterThan(0);
      }
      // and no material instance is shared across the two fields
      const cloned = new Set(materialsOf(sceneA));
      for (const material of materialsOf(sceneB)) expect(cloned.has(material)).toBe(false);
      fieldA.dispose();
      fieldB.dispose();
    });

    it('without the option, materials are the shared assets (no clones)', () => {
      const sceneA = new THREE.Scene();
      const fieldA = makeField(sceneA);
      fieldA.sync(at(0, 0, 0), true);
      const sceneB = new THREE.Scene();
      const fieldB = makeField(sceneB);
      fieldB.sync(at(0, 0, 0), true);
      // identical content in both scenes reuses the exact same material objects
      const shared = new Set(materialsOf(sceneA));
      const overlap = materialsOf(sceneB).filter((material) => shared.has(material));
      expect(overlap.length).toBeGreaterThan(0);
      fieldA.dispose();
      fieldB.dispose();
    });
  });

  it('dispose removes every sector group from the scene', () => {
    const scene = new THREE.Scene();
    const field = makeField(scene);
    field.sync(at(0, 0, 0), true);
    expect(sectorCount(scene)).toBeGreaterThan(0);
    field.dispose();
    expect(sectorCount(scene)).toBe(0);
    // POIs are gone with their sectors
    expect(poiIds(field)).toEqual([]);
  });
});

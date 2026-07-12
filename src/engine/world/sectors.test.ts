// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
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

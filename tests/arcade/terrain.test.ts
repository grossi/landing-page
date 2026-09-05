import { expect, it } from 'vitest';
import { mountGame } from './harness';

it('meridian reuses static terrain between grid changes, but updates sea and crossfades', () => {
  const game = mountGame('meridian');
  game.run(`let calls = 0; const originalHeight = heightAt;
    heightAt = (...args) => { calls++; return originalHeight(...args); };`);
  for (let i = 0; i < 60; i++) game.advance(1000 / 60);
  expect(game.run('calls')).toBe(6 * 4225 + 60);
  for (const distance of [BIOME_SEA_START, BIOME_CROSSFADE_START]) {
    game.run(`dist = ${distance};`);
    game.advance(16);
    game.run('calls = 0;');
    game.advance(16);
    expect(game.run('calls')).toBe(4226);
  }
});
const BIOME_SEA_START = 1800;
const BIOME_CROSSFADE_START = 800;

it('horizon streams rows that still match world-space terrain after motion and reset', () => {
  const game = mountGame('horizon');
  game.run(`let samples = 0; const originalTerrain = terrainH;
    terrainH = (...args) => { samples++; return originalTerrain(...args); };`);
  for (let i = 1; i <= 60; i++) game.run(`travel = ${i}; updateTerrain();`);
  // 60 units exposes only eight rows, instead of sixty complete meshes.
  expect(game.run('samples')).toBe(8 * 53);
  for (const travel of [60, 400, 0]) {
    const maxError = game.run(`travel = ${travel}; updateTerrain();
      (() => { let error = 0; for (let i = 0; i < tPos.count; i++) {
        error = Math.max(error, Math.abs(tPos.getY(i) - originalTerrain(tPos.getX(i), tPos.getZ(i) + terrain.position.z - travel)));
      } return error; })()`);
    expect(maxError).toBeLessThan(1e-5);
  }
});

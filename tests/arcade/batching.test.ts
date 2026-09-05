import { expect, it } from 'vitest';
import { mountGame } from './harness';

it('city batches track visible collision cells through reset and recycling', () => {
  const game = mountGame('city');
  for (const setup of ['reset()', 'rollRow(buildings[0], -500)']) {
    game.run(setup);
    expect(game.run(`buildings.every(row => {
      const visible = row.cells.filter(cell => cell.visible);
      if (row.faces.count !== visible.length || row.lines.geometry.drawRange.count !== visible.length * boxEdges.attributes.position.count) return false;
      return visible.every((cell, i) => {
        const matrix = new THREE.Matrix4(); row.faces.getMatrixAt(i, matrix);
        return Math.abs(matrix.elements[12] - cell.position.x) < 1e-4 &&
          Math.abs(matrix.elements[13] - cell.position.y) < 1e-4 &&
          Math.abs(matrix.elements[0] - cell.scale.x) < 1e-4 &&
          row.visual.position.z === row.z;
      });
    })`)).toBe(true);
  }
});

it('drift instances follow their collision transforms after recycling', () => {
  const game = mountGame('drift');
  game.run('reset(); asteroids[0].position.set(1000, 0, 0);');
  game.advance(16);
  expect(game.run('asteroidBatches.reduce((sum, batch) => sum + batch.count, 0)')).toBe(110);
  expect(game.run(`(() => {
    const indices = [0, 0, 0]; const matrix = new THREE.Matrix4();
    return asteroids.every(a => {
      asteroidBatches[a.userData.kind].getMatrixAt(indices[a.userData.kind]++, matrix);
      return Math.abs(matrix.elements[12] - a.position.x) < 1e-4 &&
        Math.abs(matrix.elements[14] - a.position.z) < 1e-4;
    });
  })()`)).toBe(true);
});

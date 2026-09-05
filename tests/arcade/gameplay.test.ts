import { describe, expect, it } from 'vitest';
import { mountGame } from './harness';

describe('shipped arcade game loops', () => {
  it.each([1000 / 30, 50])('tunnel catches a swept collision at %s ms and can retry', (ms) => {
    const game = mountGame('tunnel');
    game.run(`reset(); speed = 95; spawnObstacle(-13, 0.7);
      obstacles[0].userData.gapCenter = angle + Math.PI;`);
    game.advance(ms);
    expect(game.run('state')).toBe('over');
    game.advance(650);
    game.event('keydown', { code: 'Enter' });
    expect(game.run('({ state, count: obstacles.length, dist })')).toEqual({ state: 'play', count: 0, dist: 0 });
  });

  it('tunnel permits passage through the gap on the same slow step', () => {
    const game = mountGame('tunnel');
    game.run('reset(); speed = 95; spawnObstacle(-13, 0.7); obstacles[0].userData.gapCenter = angle;');
    game.advance(50);
    expect(game.run('({ state, hit: obstacles[0].userData.hit })')).toEqual({ state: 'play', hit: true });
  });

  it('asteroids consumes the final life only once for simultaneous collisions', () => {
    const game = mountGame('asteroids');
    game.run(`state = 'play'; lives = 1; invuln = 0;
      spawnAsteroid(1, 0, 0); spawnAsteroid(1, 0, 0);`);
    game.advance(16);
    expect(game.run('({ state, lives, shards: shards.length })')).toEqual({ state: 'over', lives: 0, shards: 14 });
    game.advance(650);
    game.event('keydown', { code: 'Enter' });
    expect(game.run('({ state, lives, wave })')).toEqual({ state: 'play', lives: 3, wave: 1 });
  });

  it('stack disposes retired faces on retry and falling-piece removal, keeping shared assets', () => {
    const game = mountGame('stack');
    game.run(`reset(); let disposed = 0, sharedDisposed = 0;
      boxGeo.addEventListener('dispose', () => sharedDisposed++);
      edgeMat.addEventListener('dispose', () => sharedDisposed++);
      stack[0].mesh.children[0].material.addEventListener('dispose', () => disposed++);
      moving.mesh.children[0].material.addEventListener('dispose', () => disposed++);
      reset();`);
    expect(game.run('({ disposed, sharedDisposed })')).toEqual({ disposed: 2, sharedDisposed: 0 });
    game.run(`moving.mesh.children[0].material.addEventListener('dispose', () => disposed++);
      drop(); falling[0].mesh.position.y = -100;`);
    game.advance(16);
    expect(game.run('({ disposed, falling: falling.length })')).toEqual({ disposed: 3, falling: 0 });
  });

  it('stack retains score and height while retiring blocks below the camera', () => {
    const game = mountGame('stack');
    game.run(`reset(); for (let i = 0; i < 80; i++) {
      const top = stack[stack.length - 1];
      moving.mesh.position.set(top.x, moving.mesh.position.y, top.z); drop();
    } camY = 160;`);
    game.advance(16);
    expect(game.run('stack.length')).toBeLessThan(30);
    expect(game.run('level')).toBe(81);
    expect(game.run('score')).toBe(80 * 81);
    game.run('drop()'); // newly spawned block is still at the far end: miss
    expect(game.run('finalEl.textContent')).toContain('HEIGHT 80');
  });
});

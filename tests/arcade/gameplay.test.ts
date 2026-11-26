import { describe, expect, it } from 'vitest';
import { mountGame } from './harness';

describe('shipped arcade game loops', () => {
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
});

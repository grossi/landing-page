import { describe, expect, it } from 'vitest';
import { mountGame } from './harness';

const games = ['asteroids', 'city', 'drift', 'horizon', 'meridian', 'murmur', 'stack', 'tunnel'];

describe.each(games)('%s input and frame lifecycle', name => {
  it('clears held input on blur and canceled gestures', () => {
    const game = mountGame(name);
    for (const cancellation of ['blur', 'pointercancel', 'touchcancel']) {
      game.event('keydown', { code: 'ArrowLeft' });
      game.event('pointermove', { clientX: 1000, clientY: 300 });
      game.event('pointerdown');
      game.event('touchstart', { touches: [{ clientX: 0 }] });
      game.event(cancellation);
      expect(game.run(`({ key: input.keys.ArrowLeft, down: input.pointerDown,
        active: input.pointerActive, touch: input.touchDirection, x: input.pointer.x })`))
        .toEqual({ key: false, down: false, active: false, touch: 0, x: 0 });
    }
  });

  it('stops hidden frames, resumes with a fresh clock, and disposes listeners', () => {
    const game = mountGame(name);
    game.run('let observedDt = -1; const originalTick = tick; tick = dt => { observedDt = dt; }; loop.dispose(); const testLoop = startLoop((dt, now) => tick(dt, now));');
    game.visibility(true);
    expect(game.scheduled).toBe(false);
    game.advance(60_000);
    expect(game.run('observedDt')).toBe(-1);
    game.visibility(false);
    game.advance(16);
    expect(game.run('observedDt')).toBeCloseTo(0.016);
    game.run('testLoop.dispose(); input.dispose();');
    game.event('keydown', { code: 'ArrowLeft' });
    expect(game.run('input.keys.ArrowLeft')).toBeFalsy();
    game.visibility(true); game.visibility(false);
    expect(game.scheduled).toBe(false);
  });
});

it('stack ignores keyboard autorepeat instead of dropping multiple blocks', () => {
  const game = mountGame('stack');
  game.event('keydown', { code: 'Space' });
  expect(game.run('state')).toBe('play');
  game.event('keydown', { code: 'Space', repeat: true });
  expect(game.run('state')).toBe('play');
  expect(game.run('level')).toBe(1);
});

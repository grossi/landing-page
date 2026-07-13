import { describe, expect, it } from 'vitest';
import { runBudgeted, type BuildStep } from 'engine/core/scheduler';

/** Fake clock: each executed step advances time by `msPerStep`. */
function makeClock(msPerStep: number) {
  let t = 0;
  const now = () => t;
  const step = (fn?: () => void): BuildStep => () => {
    t += msPerStep;
    fn?.();
  };
  return { now, step };
}

describe('runBudgeted', () => {
  it('returns 0 on an empty queue', () => {
    expect(runBudgeted([], 3, () => 0)).toBe(0);
  });

  it('stops once the budget is spent', () => {
    const { now, step } = makeClock(2);
    const queue = [step(), step(), step(), step(), step()];
    // 2 ms per step, 5 ms budget: after 3 steps 6 ms have elapsed → stop.
    expect(runBudgeted(queue, 5, now)).toBe(3);
    expect(queue).toHaveLength(2);
  });

  it('drains the whole queue when the budget allows', () => {
    const { now, step } = makeClock(1);
    const queue = [step(), step(), step()];
    expect(runBudgeted(queue, 100, now)).toBe(3);
    expect(queue).toHaveLength(0);
  });

  it('always runs at least one step so tiny budgets cannot stall the queue', () => {
    const { now, step } = makeClock(10);
    const queue = [step(), step()];
    expect(runBudgeted(queue, 0, now)).toBe(1);
    expect(runBudgeted(queue, 0, now)).toBe(1);
    expect(queue).toHaveLength(0);
  });

  it('preserves FIFO order across calls', () => {
    const { now, step } = makeClock(2);
    const order: number[] = [];
    const queue = [1, 2, 3, 4, 5].map((n) => step(() => order.push(n)));
    runBudgeted(queue, 3, now);
    runBudgeted(queue, 3, now);
    runBudgeted(queue, 3, now);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('drops a throwing step (never retried) and keeps the rest queued', () => {
    const { now, step } = makeClock(1);
    const order: number[] = [];
    const queue: BuildStep[] = [
      step(() => order.push(1)),
      () => {
        throw new Error('boom');
      },
      step(() => order.push(3)),
    ];
    expect(() => runBudgeted(queue, 100, now)).toThrow('boom');
    expect(order).toEqual([1]);
    // The throwing step is gone; the survivor runs next call.
    expect(runBudgeted(queue, 100, now)).toBe(1);
    expect(order).toEqual([1, 3]);
  });
});

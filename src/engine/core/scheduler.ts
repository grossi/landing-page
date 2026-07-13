/**
 * Time-budgeted build scheduler: drain a FIFO queue of work steps until a
 * per-frame millisecond budget is spent. Replaces count-based rules like
 * "build at most 2 sectors per frame", which aren't machine-relative — two
 * nebulae in one frame can hitch a slow machine while a fast one idles.
 *
 * Pure over (queue, budget, now); tests inject a fake clock.
 */

export type BuildStep = () => void;

const defaultNow = (): number => performance.now();

/**
 * Run steps from the front of `queue` (mutating it: executed steps are
 * removed) until `budgetMs` has elapsed.
 *
 * Invariants:
 * - At least one step runs per call when the queue is non-empty, so a
 *   budget smaller than any single step can never stall the queue forever.
 * - Order is preserved; unexecuted steps stay queued for the next frame.
 * - A throwing step is still removed (never retried), and steps already
 *   executed stay removed; the error propagates to the caller.
 *
 * @returns the number of steps executed.
 */
export function runBudgeted(
  queue: BuildStep[],
  budgetMs: number,
  now: () => number = defaultNow,
): number {
  if (queue.length === 0) return 0;
  const start = now();
  let executed = 0;
  try {
    while (executed < queue.length) {
      queue[executed++]();
      if (now() - start >= budgetMs) break;
    }
  } finally {
    queue.splice(0, executed);
  }
  return executed;
}

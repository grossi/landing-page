import { expect, it, vi } from 'vitest';
import { createGpuTimer } from 'engine/render/gpuTimer';

function context() {
  const status = { available: false, disjoint: false, lost: false };
  const gl = {
    CURRENT_QUERY: 1, QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
    getExtension: vi.fn(() => ({ TIME_ELAPSED_EXT: 4, GPU_DISJOINT_EXT: 5 })),
    isContextLost: () => status.lost,
    getQuery: () => null,
    createQuery: vi.fn(() => ({})), beginQuery: vi.fn(), endQuery: vi.fn(), deleteQuery: vi.fn(),
    getParameter: () => status.disjoint,
    getQueryParameter: vi.fn((_query: unknown, parameter: number) => parameter === 2 ? status.available : 25_000_000),
  };
  return { status, gl, timer: createGpuTimer(gl as unknown as WebGL2RenderingContext) };
}

it('polls asynchronously and permits only one outstanding GPU query', () => {
  const { gl, status, timer } = context();
  timer.begin(); timer.begin(); timer.end(); timer.begin();
  expect(gl.createQuery).toHaveBeenCalledTimes(1);
  expect(timer.poll()).toBeUndefined();
  expect(gl.getQueryParameter).not.toHaveBeenCalledWith(expect.anything(), gl.QUERY_RESULT);
  status.available = true;
  expect(timer.poll()).toBe(25);
  expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
  timer.begin(); timer.end(); timer.reset(); timer.reset();
  expect(gl.createQuery).toHaveBeenCalledTimes(2);
  expect(gl.deleteQuery).toHaveBeenCalledTimes(2);
});

it.each(['disjoint', 'lost'] as const)('invalidates %s GPU samples and frees the pending query', flag => {
  const { gl, status, timer } = context();
  timer.begin(); timer.end();
  status[flag] = true;
  expect(timer.poll()).toBeNull();
  expect(gl.getQueryParameter).not.toHaveBeenCalled();
  expect(gl.deleteQuery).toHaveBeenCalledTimes(1);
});

it('stays inert when GPU timers are unavailable', () => {
  const gl = { createQuery: vi.fn(), getExtension: () => null };
  const timer = createGpuTimer(gl as unknown as WebGL2RenderingContext);
  timer.begin(); timer.end(); timer.reset();
  expect(timer.poll()).toBeUndefined();
  expect(gl.createQuery).not.toHaveBeenCalled();
});

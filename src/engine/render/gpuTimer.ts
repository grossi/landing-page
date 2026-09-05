/**
 * One asynchronous WebGL2 timer query at a time; never wait for GPU completion.
 * https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
 */
export function createGpuTimer(context: WebGLRenderingContext | WebGL2RenderingContext) {
  const gl = 'createQuery' in context ? context : null;
  const extension = gl?.getExtension('EXT_disjoint_timer_query_webgl2');
  let active: WebGLQuery | null = null;
  let pending: WebGLQuery | null = null;
  return {
    begin() {
      if (!gl || !extension || active || pending || gl.isContextLost()) return;
      // Don't nest inside a query owned by browser instrumentation or a caller.
      if (gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return;
      active = gl.createQuery();
      if (active) gl.beginQuery(extension.TIME_ELAPSED_EXT, active);
    },
    end() {
      if (!gl || !extension || !active) return;
      gl.endQuery(extension.TIME_ELAPSED_EXT);
      pending = active;
      active = null;
    },
    /** null invalidates older samples; undefined means no new result yet. */
    poll(): number | null | undefined {
      if (!gl || !extension || !pending) return undefined;
      if (gl.isContextLost() || gl.getParameter(extension.GPU_DISJOINT_EXT)) {
        gl.deleteQuery(pending);
        pending = null;
        return null;
      }
      if (!gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) return undefined;
      const ms = gl.getQueryParameter(pending, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(pending);
      pending = null;
      return Number.isFinite(ms) && ms >= 0 ? ms : null;
    },
    reset() {
      if (gl && active && extension) {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        gl.deleteQuery(active);
      }
      if (gl && pending) gl.deleteQuery(pending);
      active = pending = null;
    },
  };
}

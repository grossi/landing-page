/**
 * Pointer → NDC, on the one house convention: standard GL NDC, y up
 * (bottom of the element is −1, top is +1). Consumers that want the
 * screen-down steer sense go through `resolveSteer` (engine/core/flight),
 * which owns the flip — no other site re-flips.
 */

/**
 * Writes the element-relative GL NDC of a client-space point into `out`.
 * Mutates a stable `out` on purpose — move events fire every frame while
 * steering, and a fresh object per event is per-frame garbage. Unclamped:
 * window-level listeners see coordinates past ±1 outside the element.
 */
export function pointerToNdc(
  out: { x: number; y: number },
  clientX: number,
  clientY: number,
  el: Element,
): void {
  const rect = el.getBoundingClientRect();
  out.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  out.y = -((clientY - rect.top) / rect.height) * 2 + 1;
}

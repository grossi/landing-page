// Where to draw a marker for something that may be off screen or behind the
// camera. Plain math, no DOM and no three.js.

/**
 * `x, y, z` is the target in the camera's frame: x right, y up, ahead is −z.
 * `turn` and `climb` are how far the ship must yaw right and pitch up to face
 * it (radians). `tan` is the tangent of half the vertical field of view.
 * Writes the marker's place in pixels to `out.x`, `out.y`, and `out.edge`
 * (true when the target is not on screen and the marker sits on the border).
 *
 * On screen the marker is the target's projection. Off screen it is a
 * direction pushed out to a rectangle `inset` pixels inside the screen. Just
 * off screen that direction is the one the target left by, so the marker
 * slides along the border without a jump. The farther round the target goes
 * the more the direction becomes the way to steer, (turn, climb), and beside
 * or behind the camera it is only that. A projected point flips sign behind
 * the camera; the way to steer does not, so a target behind and to the right
 * stays on the right. And because the ship cannot loop (its pitch is
 * limited), a target behind is marked to the side it must turn to, not above
 * or below where it can never go.
 */
/** Off screen by this many times the border's distance, the marker is purely the way to steer. */
const BLEND = 3;

export function markerSpot(x, y, z, turn, climb, tan, aspect, width, height, inset, out) {
  const halfWide = Math.max(1, width / 2 - inset), halfTall = Math.max(1, height / 2 - inset);
  let steer = 1, seenX = 0, seenY = 0;
  if (z < 0) {
    const px = x / (-z * tan * aspect) * width / 2, py = -y / (-z * tan) * height / 2;
    const over = Math.max(Math.abs(px) / halfWide, Math.abs(py) / halfTall);
    if (over <= 1) {
      out.x = width / 2 + px; out.y = height / 2 + py; out.edge = false;
      return out;
    }
    // Still in front: how far past the border, 0 at the border to 1 at BLEND times as far.
    const far = Math.hypot(px, py);
    seenX = px / far; seenY = py / far;
    steer = Math.min(1, (over - 1) / (BLEND - 1));
  }
  let dx = turn, dy = -climb;
  const length = Math.hypot(dx, dy);
  // Off screen yet dead ahead cannot happen; if the numbers say so, point down.
  if (length < 1e-6) { dx = 0; dy = 1; } else { dx /= length; dy /= length; }
  if (steer < 1) {
    // Blend the two directions. If they all but cancel, the way to steer wins.
    const bx = seenX * (1 - steer) + dx * steer, by = seenY * (1 - steer) + dy * steer;
    const blended = Math.hypot(bx, by);
    if (blended > 1e-3) { dx = bx / blended; dy = by / blended; }
  }
  const reach = Math.min(dx ? halfWide / Math.abs(dx) : Infinity, dy ? halfTall / Math.abs(dy) : Infinity);
  out.x = width / 2 + dx * reach; out.y = height / 2 + dy * reach; out.edge = true;
  return out;
}

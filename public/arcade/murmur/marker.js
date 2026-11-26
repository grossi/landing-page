// Where to draw a marker for something that may be off screen or behind the
// camera. Plain math, no DOM and no three.js.

/**
 * `x, y, z` is the target in the camera's frame: x right, y up, ahead is −z.
 * `turn` and `climb` are how far the ship must yaw right and pitch up to face
 * it (radians). `tan` is the tangent of half the vertical field of view.
 * Writes the marker's place in pixels to `out.x`, `out.y`, and `out.edge`
 * (true when the target is not on screen and the marker sits on the border).
 *
 * On screen the marker is the target's projection. Off screen it is the way to
 * steer: the direction (turn, climb) pushed out to a rectangle `inset` pixels
 * inside the screen. A projected point flips sign behind the camera; this
 * direction does not, so a target behind and to the right stays on the right.
 * And because the ship cannot loop (its pitch is limited), a target behind is
 * marked to the side it must turn to, not above or below where it can never go.
 */
export function markerSpot(x, y, z, turn, climb, tan, aspect, width, height, inset, out) {
  const halfWide = Math.max(1, width / 2 - inset), halfTall = Math.max(1, height / 2 - inset);
  if (z < 0) {
    const px = x / (-z * tan * aspect) * width / 2, py = -y / (-z * tan) * height / 2;
    if (Math.abs(px) <= halfWide && Math.abs(py) <= halfTall) {
      out.x = width / 2 + px; out.y = height / 2 + py; out.edge = false;
      return out;
    }
  }
  let dx = turn, dy = -climb;
  const length = Math.hypot(dx, dy);
  // Off screen yet dead ahead cannot happen; if the numbers say so, point down.
  if (length < 1e-6) { dx = 0; dy = 1; } else { dx /= length; dy /= length; }
  const reach = Math.min(dx ? halfWide / Math.abs(dx) : Infinity, dy ? halfTall / Math.abs(dy) : Infinity);
  out.x = width / 2 + dx * reach; out.y = height / 2 + dy * reach; out.edge = true;
  return out;
}

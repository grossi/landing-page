/**
 * Where the survey's target marker sits on screen. Pure math, so the rule
 * that matters is testable: a target behind the ship is never mirrored onto
 * the wrong side of the screen.
 */

export interface MarkerPlacement {
  /** Marker position in NDC: x right, y up, both in [-1, 1]. */
  x: number;
  y: number;
  /** The target itself is in view; false means the marker is an arrow on the edge. */
  onScreen: boolean;
  /** Screen angle from the centre toward the target (radians, 0 = right, counter-clockwise). */
  angle: number;
}

/**
 * Places the marker for a target at (`x`, `y`, `z`) in CAMERA space (x
 * right, y up, the view looks down −z).
 *
 * In view (in front and inside the inset rectangle) the marker sits on the
 * target. Otherwise the depth is dropped and the remaining 2D direction is
 * pushed out to the inset rectangle's edge. That direction is the target's
 * own (x, y), so a target behind and to the left stays on the left: a
 * projected point would flip sides behind the camera. Straight behind, where
 * there is no direction, the marker goes to the bottom edge.
 *
 * `insetX`/`insetY` are the half-size of the rectangle in NDC (0..1): the
 * marker never leaves it, so it stays clear of the screen edge and the HUD.
 */
export function placeMarker(
  out: MarkerPlacement,
  x: number,
  y: number,
  z: number,
  tanHalfFov: number,
  aspect: number,
  insetX: number,
  insetY: number,
): MarkerPlacement {
  if (z < 0) {
    const px = x / (-z * tanHalfFov * aspect);
    const py = y / (-z * tanHalfFov);
    if (Math.abs(px) <= insetX && Math.abs(py) <= insetY) {
      out.x = px;
      out.y = py;
      out.onScreen = true;
      out.angle = Math.atan2(y, x);
      return out;
    }
  }
  // Pixels are square, NDC is not: one unit of camera x is 1/aspect of NDC
  // width for one unit of camera y of NDC height.
  let dx = x / aspect;
  let dy = y;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    dx = 0;
    dy = -1;
    out.angle = -Math.PI / 2;
  } else {
    out.angle = Math.atan2(y, x);
  }
  const scale = Math.min(
    Math.abs(dx) < 1e-9 ? Infinity : insetX / Math.abs(dx),
    Math.abs(dy) < 1e-9 ? Infinity : insetY / Math.abs(dy),
  );
  out.x = dx * scale;
  out.y = dy * scale;
  out.onScreen = false;
  return out;
}

/** `142 km`, or `12.40 Mm` from ten thousand kilometres out: the HUD's distance format. */
export function formatDistance(km: number): string {
  const surface = Math.max(0, km);
  return surface >= 10000 ? `${(surface / 1000).toFixed(2)} Mm` : `${Math.floor(surface)} km`;
}

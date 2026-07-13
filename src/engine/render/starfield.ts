import * as THREE from 'three';

export interface StarfieldOptions {
  /** Number of stars. */
  count?: number;
  /** Stars spawn at least this far from the origin. */
  minRadius?: number;
  /** Stars spawn within `minRadius + spread` of the origin. */
  spread?: number;
  /** Point size in world units (size-attenuated by distance). */
  size?: number;
  opacity?: number;
  /** Whether scene fog dims the stars (default true, three's default). */
  fog?: boolean;
}

/**
 * A distant-star backdrop: points scattered on a thick shell around the
 * origin, never frustum-culled.
 *
 * The caller adds it to the scene and owns disposal of `geometry` and
 * `material` (track both on the stage's ResourceTracker). Experiences that
 * travel (EPHEMERIS) copy their viewer position onto `points.position` each
 * frame so the shell only rotates with the camera, never translates past it.
 */
export function createStarfield(
  opts: StarfieldOptions = {},
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const { count = 800, minRadius = 1600, spread = 900, size = 1.8, opacity = 0.55, fog = true } = opts;

  const positions = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(minRadius + Math.random() * spread);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size,
    transparent: true,
    opacity,
    fog,
  });

  const points = new THREE.Points(geometry, material);
  // the shell surrounds every camera position by construction
  points.frustumCulled = false;
  return points;
}

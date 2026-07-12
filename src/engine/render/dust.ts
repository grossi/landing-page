import * as THREE from 'three';
import { softSprite } from 'engine/render/assets';

/**
 * O(1) modulo wrap of `v` onto `[center - range, center + range]`.
 * Values already inside the band are returned untouched; any overshoot —
 * a fast frame, a warp jump of dozens of spans — lands back in band in a
 * single step, preserving the particle's phase within the span.
 */
export function wrapAround(v: number, center: number, range: number): number {
  const d = v - center;
  if (d > range || d < -range) {
    const span = range * 2;
    return center + ((((d + range) % span) + span) % span) - range;
  }
  return v;
}

export interface DustFieldOptions {
  /** Number of particles. */
  count?: number;
  /** Half-width of the wrap cube each particle is kept inside. */
  range?: number;
  /** Point size (size-attenuated soft sprite). */
  size?: number;
  opacity?: number;
}

export interface DustField {
  /** Add to the scene; positions are managed by `update()`. */
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  /**
   * Advects every particle by `velocity * dt` (when given), then wraps each
   * component onto `[center - range, center + range]`. Marks the position
   * attribute dirty only when something actually moved, so a stationary
   * viewer with no velocity uploads nothing.
   */
  update(dt: number, center: THREE.Vector3, velocity?: THREE.Vector3): void;
  dispose(): void;
}

/**
 * Local dust for speed perception: tiny soft points recycled inside a cube
 * around a moving center, so motion reads even in empty space. Stationary
 * worlds (EPHEMERIS) pass only the viewer position; heading-relative worlds
 * (DEEP FIELD) also pass a stream velocity.
 */
export function createDustField(opts: DustFieldOptions = {}): DustField {
  const { count = 300, range = 150, size = 1.5, opacity = 0.34 } = opts;

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) positions[i] = (Math.random() - 0.5) * range * 2;
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute('position', attribute);

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size,
    map: softSprite,
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  let moved = false;
  const step = (idx: number, delta: number, center: number) => {
    const next = wrapAround(positions[idx] + delta, center, range);
    if (next !== positions[idx]) {
      positions[idx] = next;
      moved = true;
    }
  };

  return {
    points,
    update(dt, center, velocity) {
      moved = false;
      const dx = velocity ? velocity.x * dt : 0;
      const dy = velocity ? velocity.y * dt : 0;
      const dz = velocity ? velocity.z * dt : 0;
      for (let i = 0; i < count; i++) {
        step(i * 3, dx, center.x);
        step(i * 3 + 1, dy, center.y);
        step(i * 3 + 2, dz, center.z);
      }
      if (moved) attribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * LOD manager — owns the full detail ladder for the bodies registered in a
 * scene, for both experiences (EPHEMERIS sector bodies, DEEP FIELD planets).
 *
 * - Rung selection is screen-space (projected pixel radius) with hysteresis
 *   and a minimum dwell (engine/core/selectLod) — never raw distance.
 * - Transitions cross-dissolve over LOD_FADE_S seconds: both wireframes
 *   render briefly, reading as the surface "resolving" — the on-brand
 *   anti-pop for a black-and-white wireframe scene.
 * - Rung 0 is a slot in a shared THREE.Points layer (a far-contact dot);
 *   rungs 1+ are LineSegments of displaced icospheres served by the LRU
 *   cache and budgeted job queue (engine/lod/geometry). Level 3+ never
 *   builds on the hot path — a body holds its rung until the job lands.
 * - An apparent-scale ramp renders far bodies compressed (0.45×), easing to
 *   1× on approach, so planets visibly swell as you close in — the NMS
 *   approach feel with zero camera involvement (camera rules are sacred).
 * - Planets grow a billboarded wireframe "atmosphere" ring as an approach
 *   cue inside 4 radii of the surface.
 * - `setBeacons` drives a second shared dot layer for content that is not
 *   even built yet (peeked far sectors), so space reads far bigger than the
 *   streamed window.
 *
 * The manager scales only objects it owns (its rung meshes) plus any
 * `scaleTargets` the registration hands over (rings, halos, moon systems),
 * so content animation (orbits, spins, the sun's pulse on a wrapper group)
 * keeps owning the anchor itself.
 */

import * as THREE from 'three';
import { projectedPixelRadius, selectLod } from 'engine/core/selectLod';
import {
  ASTEROID_PROFILE,
  makeDisplacementField,
  PLANET_PROFILE,
  STAR_PROFILE,
  type DisplacementPreset,
} from 'engine/lod/displacement';
import { getIcosphereTables, type IcosphereLevel } from 'engine/lod/icosphere';
import {
  buildLodGeometrySync,
  GeometryCache,
  GeometryJobQueue,
  lodGeometryKey,
  type RadialField,
} from 'engine/lod/geometry';

/** Cross-dissolve duration for rung transitions, in seconds (< dwell 0.5s). */
export const LOD_FADE_S = 0.35;

/** Apparent-scale ramp: rendered scale of a body at 40+ radii of distance. */
export const SCALE_RAMP_FLOOR = 0.45;
/** Surface distance (in radii) at which a body renders at full scale. */
export const SCALE_RAMP_NEAR = 4;
/** Surface distance (in radii) beyond which a body renders at the floor. */
export const SCALE_RAMP_FAR = 40;

/** Peak opacity of the wireframe atmosphere ring cue. */
export const ATMOSPHERE_MAX_OPACITY = 0.3;
/** The atmosphere cue starts fading in at this surface distance (radii). */
export const ATMOSPHERE_FAR = 4;
/** …and reaches full opacity at this surface distance (radii). */
export const ATMOSPHERE_NEAR = 0.2;

/** Highest rung built synchronously (≤162 verts); above goes to the queue. */
const SYNC_LEVEL_MAX = 2;

/** Far-contact dot slots for registered bodies. */
const DOT_CAPACITY = 256;
/** Far-contact dot slots for peeked (unbuilt) sector beacons. */
const BEACON_CAPACITY = 1024;
/** Unused dot slots park far off any view frustum. */
const PARK_Y = 1e9;

const smooth = (t: number): number => t * t * (3 - 2 * t);

const LOG_NEAR = Math.log10(SCALE_RAMP_NEAR);
const LOG_FAR = Math.log10(SCALE_RAMP_FAR);

/**
 * Apparent-scale ramp: 1 inside `SCALE_RAMP_NEAR` radii of the surface,
 * `SCALE_RAMP_FLOOR` beyond `SCALE_RAMP_FAR`, smoothstepped over
 * log-distance between (monotonic and C1, so the swell never reads as a
 * camera zoom). HUD distances and POI radii keep logical values.
 */
export function apparentScale(surfaceDistance: number, radius: number): number {
  const d = Math.max(surfaceDistance, 1e-6) / Math.max(radius, 1e-6);
  if (d <= SCALE_RAMP_NEAR) return 1;
  if (d >= SCALE_RAMP_FAR) return SCALE_RAMP_FLOOR;
  const u = (Math.log10(d) - LOG_NEAR) / (LOG_FAR - LOG_NEAR);
  return 1 - (1 - SCALE_RAMP_FLOOR) * smooth(u);
}

/**
 * Opacity of the "atmosphere resolving" ring cue: 0 beyond `ATMOSPHERE_FAR`
 * radii of the surface, easing up to `ATMOSPHERE_MAX_OPACITY` by
 * `ATMOSPHERE_NEAR`. Continuous at both ends — the cue never pops.
 */
export function atmosphereOpacity(surfaceDistance: number, radius: number): number {
  const d = surfaceDistance / Math.max(radius, 1e-6);
  const t = Math.min(1, Math.max(0, (ATMOSPHERE_FAR - d) / (ATMOSPHERE_FAR - ATMOSPHERE_NEAR)));
  return ATMOSPHERE_MAX_OPACITY * smooth(t);
}

export type LodBodyKind = 'planet' | 'asteroid' | 'star';

const KIND_PRESET: Record<LodBodyKind, DisplacementPreset> = {
  planet: PLANET_PROFILE,
  asteroid: ASTEROID_PROFILE,
  star: STAR_PROFILE,
};

/** Ladder cap per archetype (stars stay smooth; asteroids are texture). */
const KIND_MAX_LEVEL: Record<LodBodyKind, number> = { planet: 5, asteroid: 3, star: 4 };

/** Default wireframe opacity per archetype (house opacities). */
const KIND_OPACITY: Record<LodBodyKind, number> = { planet: 0.85, asteroid: 0.6, star: 0.9 };

export interface LodRegistration {
  /** 32-bit body seed; same seed ⇒ identical surface, always. */
  seed: number;
  /** Logical body radius in world units (HUD/POI values stay logical). */
  radius: number;
  kind: LodBodyKind;
  /**
   * Empty group at the body's position; the manager parents rung meshes to
   * it. Content animation (orbits, spin) keeps owning the anchor transform —
   * except `anchor.scale` of the meshes the manager adds, which it drives.
   */
  anchor: THREE.Object3D;
  /** Target wireframe opacity; defaults to the archetype's house value. */
  baseOpacity?: number;
  /** Ladder cap for this body; defaults to the archetype cap. */
  maxLevel?: number;
  /**
   * Decorations (rings, halos, moon systems) whose scale should track the
   * apparent-scale ramp; the manager multiplies their registration-time
   * uniform scale by the ramp each frame.
   */
  scaleTargets?: THREE.Object3D[];
}

/** A far-contact dot for content that isn't built (peeked sectors). */
export interface LodBeacon {
  x: number;
  y: number;
  z: number;
  /** 0..1 grayscale of the dot. */
  brightness: number;
}

/** Read-only view of a registered body, for callers and tests. */
export interface LodBodyHandle {
  /** Current committed rung (0..5). */
  readonly level: number;
  /** Live rung meshes (0 at the dot rung, 2 during a cross-dissolve). */
  readonly liveSlotCount: number;
  /** Opacities of the live rung meshes. */
  readonly slotOpacities: readonly number[];
}

export interface LodManagerOptions {
  /** Cross-dissolve duration in seconds. */
  fadeSeconds?: number;
  /** Per-update geometry job budget in milliseconds. */
  jobBudgetMs?: number;
  /** Inject a shared cache (the manager owns and disposes one by default). */
  cache?: GeometryCache;
  /** Inject a shared queue (the manager owns and clears one by default). */
  queue?: GeometryJobQueue;
}

export interface LodManager {
  register(registration: LodRegistration): LodBodyHandle;
  unregister(handle: LodBodyHandle): void;
  /** Replace the beacon dot layer (peeked far sectors). */
  setBeacons(beacons: readonly LodBeacon[]): void;
  /** Number of registered bodies (stats overlay). */
  bodyCount(): number;
  /** Advance selection, dissolves, dots and geometry jobs. Once per frame. */
  update(camera: THREE.PerspectiveCamera, viewportHeightPx: number, dt: number): void;
  dispose(): void;
}

interface Slot {
  mesh: THREE.LineSegments;
  material: THREE.LineBasicMaterial;
}

interface ScaleTarget {
  target: THREE.Object3D;
  base: number;
}

interface BodyState {
  seed: number;
  radius: number;
  kind: LodBodyKind;
  anchor: THREE.Object3D;
  baseOpacity: number;
  maxLevel: number;
  scaleTargets: ScaleTarget[];
  preset: DisplacementPreset;
  field: RadialField;
  level: number;
  dwell: number;
  fading: boolean;
  fadeT: number;
  /** Level the current fade left (0 keeps the dot lit through the fade). */
  fadeFrom: number;
  current: Slot | null;
  previous: Slot | null;
  /** Level a queued geometry job is building toward; -1 when idle. */
  pendingLevel: number;
  pendingKey: string;
  /** Slot in the shared dot layer; -1 when the layer is full. */
  dotIndex: number;
  atmosphere: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial } | null;
  lastScale: number;
  disposed: boolean;
}

// Shared unit atmosphere ring (module scope, intentionally never disposed —
// same convention as engine/render/assets).
let atmosphereGeometry: THREE.TorusGeometry | null = null;
const getAtmosphereGeometry = (): THREE.TorusGeometry => {
  if (!atmosphereGeometry) atmosphereGeometry = new THREE.TorusGeometry(1.05, 0.008, 4, 64);
  return atmosphereGeometry;
};

/** Creates the LOD manager for one scene. Call `update` once per frame. */
export function createLodManager(scene: THREE.Scene, opts: LodManagerOptions = {}): LodManager {
  const fadeSeconds = opts.fadeSeconds ?? LOD_FADE_S;
  const jobBudgetMs = opts.jobBudgetMs ?? 3;
  const ownsCache = opts.cache === undefined;
  const ownsQueue = opts.queue === undefined;
  const cache = opts.cache ?? new GeometryCache();
  const queue = opts.queue ?? new GeometryJobQueue();

  const bodies = new Set<BodyState>();
  const states = new Map<LodBodyHandle, BodyState>();

  // ---- shared far-contact dot layer (rung 0 of every registered body) ----
  const dotPositions = new Float32Array(DOT_CAPACITY * 3);
  for (let i = 0; i < DOT_CAPACITY; i++) dotPositions[i * 3 + 1] = PARK_Y;
  const dotAttribute = new THREE.BufferAttribute(dotPositions, 3);
  dotAttribute.setUsage(THREE.DynamicDrawUsage);
  const dotGeometry = new THREE.BufferGeometry();
  dotGeometry.setAttribute('position', dotAttribute);
  const dotMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });
  const dots = new THREE.Points(dotGeometry, dotMaterial);
  dots.frustumCulled = false; // parked slots would wreck any bounding sphere
  scene.add(dots);
  const freeDotSlots: number[] = [];
  for (let i = DOT_CAPACITY - 1; i >= 0; i--) freeDotSlots.push(i);

  // ---- beacon dot layer (peeked, unbuilt sectors) ----
  const beaconPositions = new Float32Array(BEACON_CAPACITY * 3);
  const beaconColors = new Float32Array(BEACON_CAPACITY * 3);
  const beaconPositionAttribute = new THREE.BufferAttribute(beaconPositions, 3);
  const beaconColorAttribute = new THREE.BufferAttribute(beaconColors, 3);
  beaconPositionAttribute.setUsage(THREE.DynamicDrawUsage);
  beaconColorAttribute.setUsage(THREE.DynamicDrawUsage);
  const beaconGeometry = new THREE.BufferGeometry();
  beaconGeometry.setAttribute('position', beaconPositionAttribute);
  beaconGeometry.setAttribute('color', beaconColorAttribute);
  beaconGeometry.setDrawRange(0, 0);
  const beaconMaterial = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    fog: false,
  });
  const beacons = new THREE.Points(beaconGeometry, beaconMaterial);
  beacons.frustumCulled = false;
  scene.add(beacons);

  // per-update scratch (no per-frame allocation)
  const cameraPosition = new THREE.Vector3();
  const cameraQuaternion = new THREE.Quaternion();
  const worldPosition = new THREE.Vector3();
  const scratchQuaternion = new THREE.Quaternion();

  const parkDot = (index: number): void => {
    if (index < 0) return;
    dotPositions[index * 3] = 0;
    dotPositions[index * 3 + 1] = PARK_Y;
    dotPositions[index * 3 + 2] = 0;
  };

  const releaseSlot = (body: BodyState, slot: Slot | null): void => {
    if (!slot) return;
    body.anchor.remove(slot.mesh);
    slot.material.dispose(); // geometry stays in the LRU cache
  };

  const finishFade = (body: BodyState): void => {
    if (body.previous) {
      releaseSlot(body, body.previous);
      body.previous = null;
    }
    if (body.current) body.current.material.opacity = body.baseOpacity;
    body.fading = false;
  };

  const beginFade = (body: BodyState, level: number, geometry: THREE.BufferGeometry | null): void => {
    finishFade(body); // an interrupted dissolve resolves instantly, never leaks
    body.previous = body.current;
    body.fadeFrom = body.level;
    if (geometry) {
      const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.LineSegments(geometry, material);
      mesh.scale.setScalar(body.lastScale);
      body.anchor.add(mesh);
      body.current = { mesh, material };
    } else {
      body.current = null; // rung 0: the shared dot carries the body
    }
    body.level = level;
    body.dwell = 0;
    body.fadeT = 0;
    body.fading = true;
  };

  const cancelPending = (body: BodyState): void => {
    if (body.pendingLevel < 0) return;
    body.pendingLevel = -1; // before cancel: the resolve callback checks it
    queue.cancel(body.pendingKey);
  };

  const requestLevel = (body: BodyState, target: number, px: number): void => {
    cancelPending(body);
    if (target === 0) {
      beginFade(body, 0, null);
      return;
    }
    const level = target as IcosphereLevel;
    const key = lodGeometryKey(body.seed, level);
    const cached = cache.get(key);
    if (cached) {
      beginFade(body, target, cached);
      return;
    }
    const tables = getIcosphereTables(level);
    // sub1 stays undisplaced — at ≤20px the silhouette change would be noise
    const amplitude = level === 1 ? 0 : body.preset.amplitude;
    if (level <= SYNC_LEVEL_MAX) {
      const geometry = buildLodGeometrySync(tables, body.field, body.radius, amplitude);
      cache.set(key, geometry);
      beginFade(body, target, geometry);
      return;
    }
    body.pendingLevel = target;
    body.pendingKey = key;
    queue
      .enqueue({ key, tables, field: body.field, radius: body.radius, amplitude, priority: px })
      .then((geometry) => {
        if (geometry) cache.set(key, geometry); // keep even a stale build — re-approach is free
        if (body.pendingLevel !== target) return; // cancelled or superseded
        body.pendingLevel = -1;
        if (!geometry || body.disposed) return;
        beginFade(body, target, geometry);
      });
  };

  const updateAtmosphere = (body: BodyState, surfaceDistance: number, scale: number): void => {
    const opacity = atmosphereOpacity(surfaceDistance, body.radius);
    if (opacity <= 0.001) {
      if (body.atmosphere) body.atmosphere.mesh.visible = false;
      return;
    }
    if (!body.atmosphere) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(getAtmosphereGeometry(), material);
      body.anchor.add(mesh);
      body.atmosphere = { mesh, material };
    }
    const atmosphere = body.atmosphere;
    atmosphere.mesh.visible = true;
    atmosphere.material.opacity = opacity;
    atmosphere.mesh.scale.setScalar(scale * body.radius);
    // billboard in world space, compensating any anchor spin
    body.anchor.getWorldQuaternion(scratchQuaternion).invert();
    atmosphere.mesh.quaternion.copy(scratchQuaternion).multiply(cameraQuaternion);
  };

  const unregisterState = (body: BodyState): void => {
    if (body.disposed) return;
    body.disposed = true;
    cancelPending(body);
    releaseSlot(body, body.current);
    releaseSlot(body, body.previous);
    body.current = null;
    body.previous = null;
    if (body.atmosphere) {
      body.anchor.remove(body.atmosphere.mesh);
      body.atmosphere.material.dispose();
      body.atmosphere = null;
    }
    if (body.dotIndex >= 0) {
      parkDot(body.dotIndex);
      dotAttribute.needsUpdate = true;
      freeDotSlots.push(body.dotIndex);
      body.dotIndex = -1;
    }
    bodies.delete(body);
  };

  return {
    register(registration) {
      const kind = registration.kind;
      const body: BodyState = {
        seed: registration.seed,
        radius: registration.radius,
        kind,
        anchor: registration.anchor,
        baseOpacity: registration.baseOpacity ?? KIND_OPACITY[kind],
        maxLevel: registration.maxLevel ?? KIND_MAX_LEVEL[kind],
        scaleTargets: (registration.scaleTargets ?? []).map((target) => ({
          target,
          base: target.scale.x, // decorations are uniformly scaled
        })),
        preset: KIND_PRESET[kind],
        field: makeDisplacementField(registration.seed, KIND_PRESET[kind]),
        level: 0,
        dwell: 0,
        fading: false,
        fadeT: 0,
        fadeFrom: 0,
        current: null,
        previous: null,
        pendingLevel: -1,
        pendingKey: '',
        dotIndex: freeDotSlots.pop() ?? -1,
        atmosphere: null,
        lastScale: SCALE_RAMP_FLOOR,
        disposed: false,
      };
      bodies.add(body);
      const handle: LodBodyHandle = {
        get level() {
          return body.level;
        },
        get liveSlotCount() {
          return (body.current ? 1 : 0) + (body.previous ? 1 : 0);
        },
        get slotOpacities() {
          const opacities: number[] = [];
          if (body.current) opacities.push(body.current.material.opacity);
          if (body.previous) opacities.push(body.previous.material.opacity);
          return opacities;
        },
      };
      states.set(handle, body);
      return handle;
    },

    unregister(handle) {
      const body = states.get(handle);
      if (!body) return;
      states.delete(handle);
      unregisterState(body);
    },

    bodyCount() {
      return bodies.size;
    },

    setBeacons(list) {
      const count = Math.min(list.length, BEACON_CAPACITY);
      for (let i = 0; i < count; i++) {
        const beacon = list[i];
        beaconPositions[i * 3] = beacon.x;
        beaconPositions[i * 3 + 1] = beacon.y;
        beaconPositions[i * 3 + 2] = beacon.z;
        beaconColors[i * 3] = beacon.brightness;
        beaconColors[i * 3 + 1] = beacon.brightness;
        beaconColors[i * 3 + 2] = beacon.brightness;
      }
      beaconGeometry.setDrawRange(0, count);
      beaconPositionAttribute.needsUpdate = true;
      beaconColorAttribute.needsUpdate = true;
    },

    update(camera, viewportHeightPx, dt) {
      const fovYRad = THREE.MathUtils.degToRad(camera.fov);
      camera.getWorldPosition(cameraPosition);
      camera.getWorldQuaternion(cameraQuaternion);

      for (const body of bodies) {
        body.anchor.getWorldPosition(worldPosition);
        const centerDistance = cameraPosition.distanceTo(worldPosition);
        const surfaceDistance = Math.max(centerDistance - body.radius, 1e-3);
        const scale = apparentScale(surfaceDistance, body.radius);
        body.lastScale = scale;
        if (body.current) body.current.mesh.scale.setScalar(scale);
        if (body.previous) body.previous.mesh.scale.setScalar(scale);
        for (const entry of body.scaleTargets) entry.target.scale.setScalar(entry.base * scale);

        // advance the cross-dissolve
        if (body.fading) {
          body.fadeT += dt;
          const k = smooth(Math.min(1, body.fadeT / fadeSeconds));
          if (body.current) body.current.material.opacity = body.baseOpacity * k;
          if (body.previous) body.previous.material.opacity = body.baseOpacity * (1 - k);
          if (body.fadeT >= fadeSeconds) finishFade(body);
        }

        // rung selection (one step per frame; dwell ≥ fade keeps it pairwise)
        const px = projectedPixelRadius(body.radius * scale, centerDistance, fovYRad, viewportHeightPx);
        body.dwell += dt;
        const desired = selectLod(body.level, px, body.dwell, body.maxLevel);
        if (desired !== body.level) {
          if (body.pendingLevel === desired) queue.setPriority(body.pendingKey, px);
          else requestLevel(body, desired, px);
        } else if (body.pendingLevel >= 0) {
          cancelPending(body); // the approach reversed before the job landed
        }

        // rung-0 dot: lit at level 0, and through a fade leaving level 0
        if (body.dotIndex >= 0) {
          const dotVisible = body.level === 0 || (body.fading && body.fadeFrom === 0);
          if (dotVisible) {
            dotPositions[body.dotIndex * 3] = worldPosition.x;
            dotPositions[body.dotIndex * 3 + 1] = worldPosition.y;
            dotPositions[body.dotIndex * 3 + 2] = worldPosition.z;
          } else {
            parkDot(body.dotIndex);
          }
        }

        if (body.kind === 'planet') updateAtmosphere(body, surfaceDistance, scale);
      }
      dotAttribute.needsUpdate = true;

      queue.update(jobBudgetMs);
    },

    dispose() {
      for (const body of [...bodies]) unregisterState(body);
      states.clear();
      scene.remove(dots);
      dotGeometry.dispose();
      dotMaterial.dispose();
      scene.remove(beacons);
      beaconGeometry.dispose();
      beaconMaterial.dispose();
      if (ownsQueue) queue.clear();
      if (ownsCache) cache.dispose();
    },
  };
}

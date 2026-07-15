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
 * - An apparent-scale ramp renders far bodies compressed (0.6×), easing to
 *   1× on approach, so planets visibly swell as you close in — the NMS
 *   approach feel with zero camera involvement (camera rules are sacred).
 * - Planets grow a billboarded wireframe "atmosphere" ring as an approach
 *   cue inside 4 radii of the surface.
 * - Below `HAZE_RADII` of a body's surface its far limb fades out
 *   (per-vertex colors, opt-in via `surfaceHaze`), so a skimmed planet
 *   reads as extending beyond sight instead of ending at the silhouette.
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
import { LOD_MIN_DWELL_S, projectedPixelRadius, selectLod } from 'engine/core/selectLod';
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

/**
 * Apparent-scale ramp: rendered scale of a body at 40+ radii of distance.
 * Raised from the original 0.45 so distant planets keep more presence — the
 * planet-scale design's own fallback tune (lod-detail.md).
 */
export const SCALE_RAMP_FLOOR = 0.6;
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

/** The far-limb haze engages below this surface distance (radii). */
export const HAZE_RADII = 1.5;
/** …and reaches full strength by this surface distance (radii). */
export const HAZE_NEAR_RADII = 0.3;
/** Vertex-to-camera cosine at/above which a vertex stays fully lit. */
export const HAZE_LIT_COS = 0.2;
/** …and at/below which the far limb is fully hazed out. */
export const HAZE_DARK_COS = -0.5;

/**
 * Strength of the near-surface far-limb haze: 0 at and beyond `HAZE_RADII`
 * of the surface (the per-vertex pass is skipped entirely — zero cost),
 * smoothstepping to 1 by `HAZE_NEAR_RADII`. Continuous at the far edge, so
 * the haze never pops on.
 */
export function hazeStrength(surfaceDistance: number, radius: number): number {
  const d = surfaceDistance / Math.max(radius, 1e-6);
  const t = Math.min(1, Math.max(0, (HAZE_RADII - d) / (HAZE_RADII - HAZE_NEAR_RADII)));
  return smooth(t);
}

/**
 * Per-vertex haze brightness: 1 for vertices facing the camera (cosine ≥
 * `HAZE_LIT_COS` between the vertex direction and the body→camera
 * direction), fading to `1 - strength` past `HAZE_DARK_COS` on the far
 * limb. Written as vertex COLORS, which the renderer multiplies with the
 * material color — on the black scene that reads as per-vertex alpha and
 * COMPOSES with the cross-dissolve's animated material opacity instead of
 * overwriting it.
 */
export function hazeVertexFade(cosToCamera: number, strength: number): number {
  const t = Math.min(1, Math.max(0, (HAZE_LIT_COS - cosToCamera) / (HAZE_LIT_COS - HAZE_DARK_COS)));
  return 1 - strength * smooth(t);
}

/**
 * Effective ladder cap under governor load-shedding (`setLodBias`). The
 * floor is rung 1, not 0: demoting a nearby body all the way to the
 * far-contact dot under load would read as it vanishing, while rung 1
 * keeps a wireframe silhouette. Bodies registered with a cap below 1
 * (always-dot content) stay there — the bias never raises a cap.
 */
export function biasedMaxLevel(maxLevel: number, lodBias: number): number {
  return Math.min(maxLevel, Math.max(1, maxLevel - lodBias));
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
  /**
   * Enable the near-surface far-limb haze (per-vertex fade below
   * `HAZE_RADII` of a body's surface). Off by default: the Home DEEP FIELD
   * registers LOD bodies through this manager too and must keep its exact
   * look — only the flight experience opts in.
   */
  surfaceHaze?: boolean;
}

export interface LodManager {
  register(registration: LodRegistration): LodBodyHandle;
  unregister(handle: LodBodyHandle): void;
  /** Replace the beacon dot layer (peeked far sectors). */
  setBeacons(beacons: readonly LodBeacon[]): void;
  /** Number of registered bodies (stats overlay). */
  bodyCount(): number;
  /**
   * Governor load-shedding: lowers every body's effective ladder cap (see
   * biasedMaxLevel). Bodies above the biased cap shed one rung per dwell
   * window through the normal cross-dissolve — no extra smoothing needed;
   * 0 (quality level 0) restores the registration caps.
   */
  setLodBias(bias: number): void;
  /** Advance selection, dissolves, dots and geometry jobs. Once per frame. */
  update(camera: THREE.PerspectiveCamera, viewportHeightPx: number, dt: number): void;
  dispose(): void;
}

interface Slot {
  mesh: THREE.LineSegments;
  material: THREE.LineBasicMaterial;
  /** Icosphere level of this slot's geometry (keys the haze direction table). */
  level: IcosphereLevel;
  /** Whether the haze pass has written non-white vertex colors here. */
  hazed: boolean;
  /** Cache key pinned while this slot displays it (the geometry is the cache's instance). */
  cacheKey: string;
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
  // clamp: a fade longer than the selection dwell would be interrupted by
  // the next rung change, violating the no-interrupted-fade invariant
  const fadeSeconds = Math.min(opts.fadeSeconds ?? LOD_FADE_S, LOD_MIN_DWELL_S);
  const jobBudgetMs = opts.jobBudgetMs ?? 3;
  const surfaceHaze = opts.surfaceHaze ?? false;
  const ownsCache = opts.cache === undefined;
  const ownsQueue = opts.queue === undefined;
  const cache = opts.cache ?? new GeometryCache();
  const queue = opts.queue ?? new GeometryJobQueue();

  const bodies = new Set<BodyState>();
  const states = new Map<LodBodyHandle, BodyState>();
  // governor load-shedding bias applied to every body's cap (0 = no shed)
  let lodBias = 0;

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
  const hazeCameraDir = new THREE.Vector3();

  const parkDot = (index: number): void => {
    if (index < 0) return;
    dotPositions[index * 3] = 0;
    dotPositions[index * 3 + 1] = PARK_Y;
    dotPositions[index * 3 + 2] = 0;
  };

  const releaseSlot = (body: BodyState, slot: Slot | null): void => {
    if (!slot) return;
    // refill haze colors before the geometry returns to the LRU: rendered
    // output must always be clean — a future slot for this rung (or any
    // pooled material with vertexColors already on) starts white, never
    // with another approach's stale fade baked in
    clearHaze(slot);
    body.anchor.remove(slot.mesh);
    slot.material.dispose(); // geometry stays in the LRU cache
    cache.release(slot.cacheKey); // …and becomes evictable again
  };

  const finishFade = (body: BodyState): void => {
    if (body.previous) {
      releaseSlot(body, body.previous);
      body.previous = null;
    }
    if (body.current) body.current.material.opacity = body.baseOpacity;
    body.fading = false;
  };

  const beginFade = (
    body: BodyState,
    level: number,
    geometry: THREE.BufferGeometry | null,
    cacheKey: string,
  ): void => {
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
      cache.retain(cacheKey); // never evicted out from under the live mesh
      body.current = { mesh, material, level: level as IcosphereLevel, hazed: false, cacheKey };
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
      beginFade(body, 0, null, '');
      return;
    }
    const level = target as IcosphereLevel;
    const key = lodGeometryKey(body.seed, body.kind, body.radius, level);
    const cached = cache.get(key);
    if (cached) {
      beginFade(body, target, cached, key);
      return;
    }
    const tables = getIcosphereTables(level);
    // sub1 stays undisplaced — at ≤20px the silhouette change would be noise
    const amplitude = level === 1 ? 0 : body.preset.amplitude;
    if (level <= SYNC_LEVEL_MAX) {
      const geometry = buildLodGeometrySync(tables, body.field, body.radius, amplitude);
      cache.set(key, geometry);
      beginFade(body, target, geometry, key);
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
        beginFade(body, target, geometry, key);
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

  // ---- near-surface far-limb haze (surfaceHaze consumers only) ----
  // One brightness per vertex, in a color attribute the material multiplies
  // with its (dissolve-animated) opacity — the two channels compose freely.
  const clearHaze = (slot: Slot | null): void => {
    if (!slot || !slot.hazed) return;
    const colors = slot.mesh.geometry.getAttribute('color');
    (colors.array as Float32Array).fill(1);
    colors.needsUpdate = true;
    slot.hazed = false;
  };

  const applyHaze = (slot: Slot | null, strength: number): void => {
    if (!slot) return; // rung 0 — the dot has no limb to fade
    if (strength <= 0.001) {
      clearHaze(slot); // one white refill on exit, then zero-cost again
      return;
    }
    const geometry = slot.mesh.geometry;
    let colors = geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (colors === undefined) {
      const array = new Float32Array(geometry.getAttribute('position').count * 3).fill(1);
      colors = new THREE.BufferAttribute(array, 3);
      colors.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('color', colors);
    }
    if (!slot.material.vertexColors) {
      // program swap (three caches the variant); left ON once engaged —
      // clearHaze writes white instead — so skimming along the haze
      // boundary never thrashes program switches
      slot.material.vertexColors = true;
      slot.material.needsUpdate = true;
    }
    // vertex directions come from the level's shared unit table, so the
    // fade ignores displacement noise and stays exact at every rung
    const { dirs, vertexCount } = getIcosphereTables(slot.level);
    const array = colors.array as Float32Array;
    for (let i = 0; i < vertexCount; i++) {
      const fade = hazeVertexFade(
        dirs[i * 3] * hazeCameraDir.x + dirs[i * 3 + 1] * hazeCameraDir.y + dirs[i * 3 + 2] * hazeCameraDir.z,
        strength,
      );
      array[i * 3] = fade;
      array[i * 3 + 1] = fade;
      array[i * 3 + 2] = fade;
    }
    colors.needsUpdate = true;
    slot.hazed = true;
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

    setLodBias(bias) {
      lodBias = bias;
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
        const desired = selectLod(body.level, px, body.dwell, biasedMaxLevel(body.maxLevel, lodBias));
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

        // far-limb haze while skimming: fade the side of the wireframe
        // facing away from the camera so the body extends beyond sight
        if (surfaceHaze && (body.current !== null || body.previous !== null)) {
          const strength = hazeStrength(surfaceDistance, body.radius);
          if (strength > 0.001 || body.current?.hazed || body.previous?.hazed) {
            // body→camera direction in the anchor's local frame (where the
            // vertex directions live; uniform ancestor scales keep it valid)
            body.anchor.getWorldQuaternion(scratchQuaternion).invert();
            hazeCameraDir
              .copy(cameraPosition)
              .sub(worldPosition)
              .applyQuaternion(scratchQuaternion)
              .normalize();
            applyHaze(body.current, strength);
            applyHaze(body.previous, strength);
          }
        }
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

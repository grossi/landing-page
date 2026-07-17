import * as THREE from 'three';
import {
  attitudeFromDirection,
  attitudeQuaternion,
  bankBody,
  CAMERA_MAX_LAG,
  CHASE_OFFSET,
  CHASE_POS_RATE,
  chaseTarget,
  FORWARD,
  KEY_STEER,
  PITCH_CLAMP,
  speedResponseRate,
  steerAttitude,
  updateChaseCamera,
  updateFov,
} from 'engine/core/flight';
import { createKeyTracker } from 'engine/core/keyTracker';
import { createLodManager } from 'engine/lod/lodManager';
import { DODEC, ICO_MID, OCT, RING_THIN, wireMat } from 'engine/render/assets';
import { createDustField } from 'engine/render/dust';
import { buildShipRig } from 'engine/render/shipRig';
import { createStage } from 'engine/render/stage';
import { createStarfield } from 'engine/render/starfield';
import { attachStatsOverlay } from 'engine/render/statsOverlay';

/** Per-body drift state kept outside the scene graph for type safety. */
interface BodyState {
  group: THREE.Group;
  rot: THREE.Vector3;
}

/** Per-giant state: one fog-free material drives the distance fade. */
interface GiantState {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  maxOpacity: number;
  /** Slow self-rotation (rad/s) — barely perceptible, just alive. */
  spin: number;
  /** Farthest reach of the geometry from the group origin (ring or body). */
  extent: number;
}

/** Half-width / half-height of the corridor bodies spawn in. */
const SPREAD_X = 620;
const SPREAD_Y = 360;
/** Bodies live between these distances along the heading. */
const FAR = -2100;
const NEAR = 90;
/**
 * Recycled bodies respawn between these distances ahead of the heading;
 * with fog exp2 0.00115 anything past ~1100 fades in rather than popping.
 */
const SPAWN_NEAR = 1100;
const SPAWN_FAR = 2100;
/** Base drift speed (units/s); clicks multiply it via the throttle. */
const BASE_SPEED = 34;
const DUST_N = 300;
const DUST_RANGE = 150;

// ---- distant giants (silhouette layer beyond the fog falloff) ----
/** Lateral half-spread of the giant corridor around the heading. */
const GIANT_SPREAD = 3000;
/** First spawn anywhere in the deep corridor so the field opens populated. */
const GIANT_FIRST_NEAR = 4000;
const GIANT_FIRST_FAR = 14000;
/** Recycled giants respawn inside the fade band so they emerge from black. */
const GIANT_SPAWN_NEAR = 9000;
const GIANT_SPAWN_FAR = 14000;
/** Distance-driven opacity ramp: 0 at FADE_FAR, full at FADE_NEAR. */
const GIANT_FADE_NEAR = 9000;
const GIANT_FADE_FAR = 14000;
/**
 * Giants are fog-free, so unlike the mid bodies (which fog erases before
 * they recycle) they must fade to black explicitly before leaving the
 * corridor — otherwise the lateral recycle would despawn a visible
 * silhouette inside the frustum. The fade band starts beyond the widest
 * possible spawn (√2 · SPREAD ≈ 1.42); its far edge, where the target
 * opacity hits 0, doubles as the recycle rim.
 */
const GIANT_LAT_FADE_NEAR = GIANT_SPREAD * 1.45;
const GIANT_LAT_FADE_FAR = GIANT_SPREAD * 1.8;
/** Giants drift at this fraction of ship speed — far things barely parallax. */
const GIANT_PARALLAX = 0.06;
const GIANT_COUNT = 3;

// ---- transition choreography ----
/**
 * Ship path through the engage blend, in the ship's own frame relative to
 * the camera: it enters low and behind the near plane, passes under the
 * view and docks at the exact inverse of the chase offset — so at full
 * blend the chase equation closes on the camera with zero pop.
 */
const SHIP_ENTRY = new THREE.Vector3(0, -2.6, 18);
const SHIP_DOCK = CHASE_OFFSET.clone().negate();
/** The ship docks at this fraction of the blend, before the camera settles. */
const DOCK_FRACTION = 0.85;
/**
 * On ESC from settled play the chase camera trails the nose mid-turn, so
 * the ship pose re-derived from it differs from the ship's live pose by the
 * lag residual (up to ~4 units / ~21°); that residual is eased out of the
 * prop over this fraction of DISENGAGE_S in real time — gone well before
 * the disengage endpoint, so the end-of-disengage math stays exact, and
 * keyed to time rather than blend so a re-engage mid-fade keeps easing
 * instead of snapping the prop.
 */
const RESIDUAL_FADE = 0.3;
/**
 * While the ship frame is live (blend > 0) the heading's pitch is eased
 * inside the play clamp: the roll-free YXZ attitude degenerates at the
 * poles — yaw sweeps ~π as the heading crosses vertical, a barrel-roll the
 * title rig's transported up absorbs but the chase pose would copy.
 */
const MAX_HEADING_Y = Math.sin(PITCH_CLAMP);

export type DeepFieldMode = 'title' | 'engage' | 'play' | 'disengage';

export interface DeepFieldHandle {
  dispose(): void;
  play(): void;
  exit(): void;
}

/**
 * Mounts the DEEP FIELD backdrop into `container` and starts its render
 * loop. Returns a handle whose `dispose` stops the loop, removes listeners
 * and frees all GPU resources.
 *
 * An endless drift through wireframe planets, asteroids and derelicts.
 * The cursor steers: the flight heading turns slowly toward where the
 * cursor sits — off-center carves a wide banking turn, recentering flies
 * straight — and the camera itself never jumps. Clicking kicks the drift
 * speed (the throttle); holding the button sustains a full burn.
 */
export function createDeepField(
  container: HTMLElement,
  opts?: { onMode?: (mode: DeepFieldMode) => void },
): DeepFieldHandle {
  const onMode = opts?.onMode;
  // far 20,000 gives the giants a deep corridor; nothing nests, so a
  // standard depth buffer at 4e4 far:near is comfortable (near raised to 0.5).
  // maxPixelRatio 2: full retina crispness for the 1px wireframes at quality
  // level 0 (parity with main); governor steps down still shed below it.
  const stage = createStage(container, {
    fov: 62,
    near: 0.5,
    far: 20000,
    fogDensity: 0.00115,
    maxPixelRatio: 2,
  });
  const { scene, camera, renderer, tracker } = stage;

  // Mount-owned GPU resources (point clouds, fresh wireframe materials) are
  // tracked so stage.dispose() frees them; the shared unit geometries from
  // engine/render/assets are never tracked and never disposed.
  const wire = (opacity: number) => tracker.track(wireMat(opacity));

  // LOD ladder for the drifting planets: they resolve from a dot to a
  // displaced wireframe on approach (jobs budgeted low — it's a backdrop).
  // Capped at level 3: the landing page is mood, not close inspection.
  const lod = createLodManager(scene, { jobBudgetMs: 2 });

  // dev-only perf panel (backquote toggles; `?stats` shows it immediately)
  const stats = attachStatsOverlay(container, stage, {
    getExtra: () => [`LOD BODIES ${lod.bodyCount()}`],
  });

  // ---- distant stars (rotate with the view, never translate) ----
  {
    const stars = createStarfield({
      count: 900,
      minRadius: 1800,
      spread: 1400,
      size: 1.7,
      opacity: 0.5,
      fog: false,
    });
    tracker.track(stars.geometry);
    tracker.track(stars.material);
    scene.add(stars);
  }

  // ---- drifting wireframe bodies (shared unit geometries, per-mesh scale) ----
  function makeBody(): BodyState {
    const group = new THREE.Group();
    const kind = Math.random();
    if (kind < 0.45) {
      // asteroid — dodecahedron squashed a little differently on each axis
      const r = 6 + Math.random() * 14;
      const rock = new THREE.Mesh(DODEC, wire(0.5));
      rock.scale.set(
        r * (0.75 + Math.random() * 0.5),
        r * (0.75 + Math.random() * 0.5),
        r * (0.75 + Math.random() * 0.5),
      );
      group.add(rock);
    } else if (kind < 0.8) {
      // planet, sometimes ringed — rendered through the LOD ladder. The
      // registration lives as long as the body: recycled bodies keep their
      // seed, so a respawned planet keeps its shape (cache hit, zero build).
      const r = 18 + Math.random() * 30;
      const planet = new THREE.Group(); // LOD anchor
      group.add(planet);
      const scaleTargets: THREE.Object3D[] = [];
      if (Math.random() < 0.55) {
        const ring = new THREE.Mesh(RING_THIN, wire(0.6));
        ring.scale.setScalar(r);
        ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.7;
        group.add(ring);
        scaleTargets.push(ring); // ring tracks the apparent-scale ramp
      }
      lod.register({
        seed: Math.floor(Math.random() * 2 ** 31),
        radius: r,
        kind: 'planet',
        anchor: planet,
        baseOpacity: 0.45,
        maxLevel: 3,
        scaleTargets,
      });
    } else {
      // beacon / derelict — stacked octahedra
      const r = 8 + Math.random() * 8;
      const outer = new THREE.Mesh(OCT, wire(0.7));
      outer.scale.setScalar(r);
      const inner = new THREE.Mesh(OCT, wire(0.9));
      inner.scale.setScalar(r * 0.55);
      inner.rotation.z = Math.PI / 4;
      group.add(outer, inner);
    }
    group.position.set(
      (Math.random() - 0.5) * 2 * SPREAD_X,
      (Math.random() - 0.5) * 2 * SPREAD_Y,
      FAR + Math.random() * (NEAR - FAR),
    );
    scene.add(group);
    return {
      group,
      rot: new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.4,
      ),
    };
  }
  const bodies = Array.from({ length: 26 }, makeBody);

  // ---- distant giants (purely additive layer; steering untouched) ----
  // Huge low-detail silhouettes far beyond the fog falloff: their materials
  // are fog-free, so visibility is driven entirely by a distance smoothstep —
  // they emerge from black over the 14,000 → 9,000 band and never pop.
  function makeGiant(): GiantState {
    const mat = tracker.track(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0,
        fog: false,
      }),
    );
    const maxOpacity = 0.12 + Math.random() * 0.08;
    const r = 300 + Math.random() * 500;
    const group = new THREE.Group();
    const body = new THREE.Mesh(ICO_MID, mat);
    body.scale.setScalar(r);
    group.add(body);
    let extent = r;
    if (Math.random() < 0.2) {
      // one in five giants gets a ring — same fading material, shared torus
      const ring = new THREE.Mesh(RING_THIN, mat);
      ring.scale.setScalar(r);
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.7;
      group.add(ring);
      extent = r * 1.75; // RING_THIN reaches 1.7 body radii (+ tube)
    }
    // first spawn fills the whole corridor so the deep field opens populated
    group.position.set(
      (Math.random() - 0.5) * 2 * GIANT_SPREAD,
      (Math.random() - 0.5) * 2 * GIANT_SPREAD,
      -(GIANT_FIRST_NEAR + Math.random() * (GIANT_FIRST_FAR - GIANT_FIRST_NEAR)),
    );
    scene.add(group);
    return { group, mat, maxOpacity, spin: (Math.random() - 0.5) * 0.04, extent };
  }
  const giants = Array.from({ length: GIANT_COUNT }, makeGiant);

  // ---- dust for speed perception ----
  const dust = tracker.track(
    createDustField({ count: DUST_N, range: DUST_RANGE, size: 1.5, opacity: 0.34 }),
  );
  scene.add(dust.points);

  // ---- ship (hidden until the transition engages) ----
  const { ship, shipBody } = buildShipRig(tracker);
  ship.visible = false;
  scene.add(ship);

  // ---- transition state machine ----
  // One reversible scalar: `target` flips between the title rig (0) and the
  // chase cam (1) and `blend` glides toward it. play()/exit() ONLY flip the
  // target; the frame loop derives the mode from (target, blend) and runs
  // every edge action in one place — spamming play/exit just reverses the
  // scalar mid-flight, and a target flipped away and back between frames
  // settles as a no-op (no re-seed, no callbacks).
  const ENGAGE_S = 2.6;
  const DISENGAGE_S = 2.0;
  const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
  const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
  let target = 0;
  let blend = 0;
  let lastMode: DeepFieldMode = 'title';
  // stand-in for the chase lerp's trail: here the ship never translates
  // (the world streams past), so the lerp converges and would park the
  // camera at the raw chase offset — twice as close as EPHEMERIS at cruise
  let streamLag = 0;

  const play = () => {
    target = 1;
  };
  const exit = () => {
    target = 0;
  };

  // ---- input ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let mouseActive = false;
  // stale-deflection guard: play steer reads zero until a fresh move
  // arrives, so entering play or losing the cursor never consumes an old
  // position
  let steerLive = false;
  let throttleDown = false;
  let boost = 1;

  // mutates the stable `ndc` — move events fire every frame while steering,
  // and a fresh object per event is per-frame garbage
  const toNdc = (clientX: number, clientY: number) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  };
  const onMouseMove = (e: MouseEvent) => {
    toNdc(e.clientX, e.clientY);
    mouseActive = true;
    steerLive = true;
  };
  const onMouseLeave = () => {
    mouseActive = false;
    steerLive = false;
  };
  const onTouchMove = (e: TouchEvent) => {
    toNdc(e.touches[0].clientX, e.touches[0].clientY);
    steerLive = true;
  };
  const onPointerDown = (e: PointerEvent) => {
    // Links and buttons layered over the backdrop keep their normal clicks.
    if (e.target instanceof Element && e.target.closest('a,button')) return;
    throttleDown = true;
    // the click kick is a title-throttle gimmick; in play (like EPHEMERIS)
    // pointer hold is just a burn, no impulse. Checking target too covers
    // the sub-frame after ESC flips it, where blend still reads 1 but the
    // mode is effectively disengage — the kick applies again there
    if (!(blend === 1 && target === 1)) boost = Math.min(boost + 2.6, 8);
  };
  const onPointerUp = () => {
    throttleDown = false;
  };
  // pointerup never arrives for a button held across a focus loss, so blur
  // drops the throttle along with the tracked keys
  const keyTracker = createKeyTracker(window, () => {
    throttleDown = false;
  });
  const { keys } = keyTracker;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') exit();
  };
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseleave', onMouseLeave);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  container.addEventListener('touchmove', onTouchMove, { passive: true });

  // ---- render loop ----
  const heading = new THREE.Vector3(0, 0, -1);
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  // camera up, parallel-transported to stay perpendicular to the heading
  const camUp = new THREE.Vector3(0, 1, 0);
  const lookTarget = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const dustCenter = new THREE.Vector3();
  const dustVelocity = new THREE.Vector3();
  let roll = 0;

  // The title rig's pose, computed every frame the blend has weight; the
  // camera copies it in title mode and blends away from it through the
  // transition. A camera (never rendered) rather than a plain Object3D so
  // lookAt aims down -z exactly like the real one.
  const rig = new THREE.PerspectiveCamera();
  const attitude = { yaw: 0, pitch: 0 };
  const offsetLocal = new THREE.Vector3();
  const dockLocal = new THREE.Vector3();
  const chasePos = new THREE.Vector3();
  // the ship's live pose captured on ESC from settled play (see RESIDUAL_FADE)
  const exitPos = new THREE.Vector3();
  const exitQuat = new THREE.Quaternion();
  const shipRawPos = new THREE.Vector3();
  let exitResidual = false;
  let exitFade = 0;
  // prop-only correction, applied after the camera consumed the raw pose:
  // the camera path stays exact while the visible ship eases from its
  // captured live pose onto wherever the current mode drives it. The raw
  // position is stashed so play mode — which never rewrites it — can
  // restore the authority before the next chase read.
  const applyExitResidual = () => {
    const r = 1 - easeOutCubic(Math.min(1, exitFade / (RESIDUAL_FADE * DISENGAGE_S)));
    if (r > 0) {
      shipRawPos.copy(ship.position);
      ship.position.lerp(exitPos, r);
      ship.quaternion.slerp(exitQuat, r);
    } else {
      exitResidual = false;
    }
  };

  // Bodies passing behind respawn ahead of the *current* heading, so the
  // view stays populated whichever way a long turn ends up pointing.
  const respawnAhead = (b: BodyState) => {
    // camUp is re-transported perpendicular to the heading each frame before
    // bodies recycle, so heading × camUp is already unit length
    side.crossVectors(heading, camUp);
    lift.copy(camUp);
    b.group.position
      .copy(heading)
      .multiplyScalar(SPAWN_NEAR + Math.random() * (SPAWN_FAR - SPAWN_NEAR))
      .addScaledVector(side, (Math.random() - 0.5) * 2 * SPREAD_X)
      .addScaledVector(lift, (Math.random() - 0.5) * 2 * SPREAD_Y);
  };

  // Giants recycle the same way, but respawn inside the fade band with their
  // opacity zeroed, so they always emerge from black instead of popping —
  // even when the fade band's distance ramp is already partly up at spawn.
  const respawnGiantAhead = (g: GiantState) => {
    side.crossVectors(heading, camUp);
    lift.copy(camUp);
    g.group.position
      .copy(heading)
      .multiplyScalar(GIANT_SPAWN_NEAR + Math.random() * (GIANT_SPAWN_FAR - GIANT_SPAWN_NEAR))
      .addScaledVector(side, (Math.random() - 0.5) * 2 * GIANT_SPREAD)
      .addScaledVector(lift, (Math.random() - 0.5) * 2 * GIANT_SPREAD);
    g.mat.opacity = 0;
  };

  stage.start((dt, t) => {
    // transition: glide toward the target rig, derive the mode, and run the
    // edge actions exactly once, all in this one site
    if (blend !== target) {
      const step = dt / (target ? ENGAGE_S : DISENGAGE_S);
      blend = target ? Math.min(1, blend + step) : Math.max(0, blend - step);
    }
    const mode: DeepFieldMode =
      blend === 1 ? 'play' : target === 1 ? 'engage' : blend > 0 ? 'disengage' : 'title';
    if (mode !== lastMode) {
      if (mode === 'play') {
        // settling into play arms the controls: seed the control frame from
        // the drift heading, and drop the deflection recorded before the
        // press — steering resumes on the next fresh move
        attitudeFromDirection(attitude, heading);
        steerLive = false;
      }
      if (mode === 'disengage' && lastMode === 'play') {
        // from settled play the rig has no weight, so the title roll
        // restarts level (matching the roll-free ship frame)
        roll = 0;
        // hand the drift law the direction the chase camera actually faces:
        // its trailing slerp lags the nose mid-turn, and seeding from the
        // ship would snap the whole view by that residual — the ship prop
        // instead keeps its live pose and eases onto the dock path
        heading.copy(FORWARD).applyQuaternion(camera.quaternion);
        exitPos.copy(ship.position);
        exitQuat.copy(ship.quaternion);
        exitResidual = true;
        exitFade = 0;
      }
      lastMode = mode;
      onMode?.(mode);
    }
    const playing = mode === 'play';
    if (exitResidual) exitFade += dt;

    // throttle: click kicks, holding burns, release coasts back to cruise.
    // The pointer works in every mode; the burn keys (W / ArrowUp / Space)
    // arm with the rest of the game controls at settle
    const burn = throttleDown || (playing && (keys.KeyW || keys.ArrowUp || keys.Space));
    if (playing) {
      // play runs the shared EPHEMERIS boost feel (flight.ts response rates
      // and cruise/boost FOV cue) on the stream-speed multiplier — the ×8
      // target is map-scale, not feel, so it stays deep-field. Both FOV laws
      // ease at the same rate toward their targets, so mode edges glide.
      const targetBoost = burn ? 8 : 1;
      boost += (targetBoost - boost) * Math.min(1, dt * speedResponseRate(boost, targetBoost, burn));
      updateFov(camera, burn, dt);
    } else {
      if (burn) boost += (8 - boost) * Math.min(1, dt * 1.6);
      else boost += (1 - boost) * Math.min(1, dt * 1.1);
      const targetFov = 62 + (boost - 1) * 1.9;
      if (Math.abs(camera.fov - targetFov) > 0.01) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
        camera.updateProjectionMatrix();
      }
    }
    const speed = BASE_SPEED * boost;

    // stream lag: reproduces, in the ship-static frame, the trail the
    // ephemeris chase lerp develops while the ship translates — same
    // dynamics, so the apparent ship distance and the boost pull-ahead cue
    // match, and the trail winds out at the same rate through a disengage.
    // The ease targets the PRE-clamp steady state (speed/rate) and clamps
    // after, like the real lerp: under a burn the trail ramps at full rate
    // into the cap instead of slowing asymptotically toward it.
    const lagTarget = playing ? speed / CHASE_POS_RATE : 0;
    streamLag += (lagTarget - streamLag) * Math.min(1, dt * CHASE_POS_RATE);
    streamLag = Math.min(streamLag, CAMERA_MAX_LAG);

    // steering: in play the ship is the authority — pointer deflection
    // integrates the attitude at game rates and the heading follows the
    // nose, so flying is steering the stream. Otherwise the heading turns
    // slowly toward the cursor's ray. With the camera looking along the
    // heading, an off-center cursor is a constant angular offset — a
    // steady, gentle turn; recentering flies straight.
    if (playing) {
      // steer flips ndc.y back to the ephemeris screen-down convention, and
      // clamps: window-level moves over the site header land past ±1
      let steerX = steerLive ? THREE.MathUtils.clamp(ndc.x, -1, 1) : 0;
      let steerY = steerLive ? THREE.MathUtils.clamp(-ndc.y, -1, 1) : 0;
      if (keys.ArrowLeft || keys.KeyA) steerX = -KEY_STEER;
      if (keys.ArrowRight || keys.KeyD) steerX = KEY_STEER;
      steerAttitude(attitude, steerX, steerY, dt);
      attitudeQuaternion(attitude, ship.quaternion);
      bankBody(shipBody, steerX, dt);
      heading.copy(FORWARD).applyQuaternion(ship.quaternion);
    } else if (mouseActive) {
      raycaster.setFromCamera(ndc, camera);
      heading.lerp(raycaster.ray.direction, Math.min(1, dt * 0.55));
    } else {
      heading.lerp(FORWARD, Math.min(1, dt * 0.08));
    }
    heading.normalize();

    // keep the heading off the poles while the ship frame consumes it (see
    // MAX_HEADING_Y); eased rather than clamped so engaging from a steep
    // title-mode climb pitches down gently instead of snapping. Inert at
    // blend == 1, where PITCH_CLAMP already bounds the ship-driven heading
    // — gated off so the two mechanisms never fight
    if (blend > 0 && blend < 1 && Math.abs(heading.y) > MAX_HEADING_Y) {
      heading.y += (Math.sign(heading.y) * MAX_HEADING_Y - heading.y) * Math.min(1, dt * 2);
      let horizontal = Math.hypot(heading.x, heading.z);
      if (horizontal < 1e-6) {
        // dead vertical leaves the descent direction arbitrary; pitch back
        // the way the transported up frame came from (camUp ⊥ heading, so
        // it is horizontal here — but only approximately unit, so remeasure)
        heading.x = -camUp.x;
        heading.z = -camUp.z;
        horizontal = Math.hypot(heading.x, heading.z);
      }
      const k = Math.sqrt(1 - heading.y ** 2) / horizontal;
      heading.x *= k;
      heading.z *= k;
    }

    // parallel-transport the up basis: strip its heading component so the
    // view rolls smoothly through vertical flight instead of snapping at the
    // poles of lookAt's fixed world up
    camUp.addScaledVector(heading, -camUp.dot(heading));
    if (camUp.lengthSq() < 1e-6) {
      camUp.crossVectors(heading, X_AXIS);
      if (camUp.lengthSq() < 1e-6) camUp.crossVectors(heading, FORWARD);
    }
    camUp.normalize();

    // title rig pose: slow autonomous sway, never coupled to the cursor
    // position. Dead weight once play settles, so it is skipped there; the
    // blend just updated above, so the first disengage frame recomputes a
    // fresh pose before the camera blend reads it.
    if (blend < 1) {
      rig.position.x = Math.sin(t * 0.045) * 16;
      rig.position.y = Math.cos(t * 0.036) * 10;
      rig.position.z = 0;
      rig.up.copy(camUp);
      lookTarget.copy(rig.position).addScaledVector(heading, 520);
      lookTarget.x += Math.sin(t * 0.058) * 20;
      lookTarget.y += Math.cos(t * 0.049) * 12;
      rig.lookAt(lookTarget);
      // bank with the commanded turn, not the world direction — cruising
      // along any axis flies level
      const rollTarget = mouseActive ? THREE.MathUtils.clamp(-ndc.x * 0.3, -0.3, 0.3) : 0;
      roll += (rollTarget - roll) * Math.min(1, dt * 2);
      if (roll !== 0) rig.rotateZ(roll);
    }

    // camera: the title rig verbatim, a blend toward the chase pose, or —
    // settled in play — the verbatim chase cam. Through the blend the ship
    // follows the drift heading in a roll-free frame (the rig's roll winds
    // out inside the slerp) and glides along its entry path relative to
    // LAST frame's camera; both endpoints are live poses, so the blend is
    // bit-identity at s = 0 and s = 1 — zero pop by construction. In play
    // the ship stays put (the world streams past it, so speed reads from
    // the stream, never from ship translation) and the chase lerp holds
    // converged; it only works during turns, trailing the chase offset as
    // it swings with the nose.
    if (playing) {
      if (exitResidual) ship.position.copy(shipRawPos);
      chaseTarget(chasePos, ship.quaternion, ship.position, streamLag);
      updateChaseCamera(camera, chasePos, ship.quaternion, dt);
      if (exitResidual) applyExitResidual();
    } else if (blend > 0) {
      attitudeFromDirection(attitude, heading);
      attitudeQuaternion(attitude, ship.quaternion);
      bankBody(shipBody, 0, dt);
      const s = easeInOutCubic(blend);
      const u = easeOutCubic(Math.min(1, blend / DOCK_FRACTION));
      // lag-adjusted dock: dockLocal = −(CHASE_OFFSET + (0,0,streamLag)), the
      // exact inverse of the lagged chase offset — so at u = 1 the chase read
      // below closes on last frame's camera position for ANY streamLag:
      // ship = cam + R·dockLocal, chase = ship + R·(CHASE_OFFSET+(0,0,lag))
      // = cam. On a first engage streamLag is 0 (lagTarget is 0 outside
      // play) and this is the original path; it only carries value briefly
      // on an ESC from play, decaying at CHASE_POS_RATE.
      dockLocal.copy(SHIP_DOCK);
      dockLocal.z -= streamLag;
      offsetLocal.lerpVectors(SHIP_ENTRY, dockLocal, u).applyQuaternion(ship.quaternion);
      ship.position.copy(camera.position).add(offsetLocal);
      chaseTarget(chasePos, ship.quaternion, ship.position, streamLag);
      camera.position.lerpVectors(rig.position, chasePos, s);
      camera.quaternion.slerpQuaternions(rig.quaternion, ship.quaternion, s);
      if (exitResidual) applyExitResidual();
    } else {
      camera.position.copy(rig.position);
      camera.quaternion.copy(rig.quaternion);
    }
    ship.visible = blend > 0;

    // bodies: the world slides past, opposite the heading
    for (const b of bodies) {
      b.group.position.addScaledVector(heading, -speed * dt);
      b.group.rotation.x += b.rot.x * dt;
      b.group.rotation.y += b.rot.y * dt;
      b.group.rotation.z += b.rot.z * dt;

      // recycle once behind the camera, or once a turn has left the body
      // too far off the flight axis to ever be seen again
      const proj = b.group.position.dot(heading);
      lateral.copy(b.group.position).addScaledVector(heading, -proj);
      if (proj < -NEAR || lateral.lengthSq() > (SPREAD_X * 1.9) ** 2) {
        respawnAhead(b);
      }
    }

    // giants: barely-parallaxing silhouettes in the far field. The opacity
    // TARGET is a pure function of position — a depth ramp (fades in over
    // the 14k → 9k band) times a lateral ramp (fades out toward the recycle
    // rim); actual opacity glides toward it, so a respawn (which zeroes it)
    // always resolves out of black over a couple of seconds. Recycling waits
    // until the giant is provably invisible — fully behind the camera, or
    // past the fade band's far edge (target opacity 0) with its glided
    // opacity at black — so it never pops in EITHER direction, and a faded
    // giant never squats invisibly in one of the few slots.
    for (const g of giants) {
      g.group.position.addScaledVector(heading, -speed * GIANT_PARALLAX * dt);
      g.group.rotation.y += g.spin * dt;
      const proj = g.group.position.dot(heading);
      lateral.copy(g.group.position).addScaledVector(heading, -proj);
      const lat = lateral.length();
      const d = g.group.position.length();
      const targetOpacity =
        g.maxOpacity *
        (1 - THREE.MathUtils.smoothstep(d, GIANT_FADE_NEAR, GIANT_FADE_FAR)) *
        (1 - THREE.MathUtils.smoothstep(lat, GIANT_LAT_FADE_NEAR, GIANT_LAT_FADE_FAR));
      g.mat.opacity += (targetOpacity - g.mat.opacity) * Math.min(1, dt * 0.6);
      if (proj < -(NEAR + g.extent) || (lat > GIANT_LAT_FADE_FAR && g.mat.opacity < 0.005)) {
        respawnGiantAhead(g);
      }
    }

    // adaptive quality: under sustained load the governor sheds dust and
    // LOD rungs alongside pixels; both knobs are identity at level 0
    const quality = stage.quality();
    dust.setDensity(quality.dustFraction);
    lod.setLodBias(quality.lodBias);

    // dust: streams past opposite the heading; the wrap cube is centered 60
    // units ahead along it so most particles stay in front of the camera
    dust.update(
      dt,
      dustCenter.copy(heading).multiplyScalar(60),
      dustVelocity.copy(heading).multiplyScalar(-speed * 2.4),
    );

    // LOD: planets resolve (and swell) on approach; geometry jobs budgeted
    lod.update(camera, container.clientHeight, dt);
  });

  const dispose = () => {
    window.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseleave', onMouseLeave);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    container.removeEventListener('touchmove', onTouchMove);
    keyTracker.dispose();
    stats.dispose();
    lod.dispose();
    // stops the loop and frees every tracked geometry/material
    stage.dispose();
  };

  return { dispose, play, exit };
}

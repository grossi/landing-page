import * as THREE from 'three';
import {
  burnKeysDown,
  CAMERA_MAX_LAG,
  CHASE_OFFSET,
  CHASE_POS_RATE,
  easeFovValue,
  FORWARD,
  resolveSteer,
  speedResponseRate,
} from 'engine/core/flight';
import { createKeyTracker } from 'engine/core/keyTracker';
import { createListenerGroup } from 'engine/core/listenerGroup';
import { pointerToNdc } from 'engine/core/pointerNdc';
import { createLodManager } from 'engine/lod/lodManager';
import { DODEC, ICO_MID, OCT, RING_THIN, wireMat } from 'engine/render/assets';
import { createDustField } from 'engine/render/dust';
import { createFlightRig, SHIP_ARRIVAL_RATE, SHIP_ENTRY } from 'engine/render/flightRig';
import { applyQuality, createStage } from 'engine/render/stage';
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
 * Engage arrival station, in the ship's frame relative to the camera pose
 * the engage began from: the inverse of the chase offset extended by the
 * cruise trail (BASE_SPEED / CHASE_POS_RATE). The flight rig flies the
 * ship out to it while the crossfade runs; once its chase pose converges —
 * trail included — the virtual camera lands back exactly where the engage
 * began, so net camera travel ≈ 0 and the settle is seamless. The closure
 * assumes the cruise trail: a burn held through settle parks the converged
 * pose ~5 u off (aesthetic only — the crossfade stays continuous).
 */
const STATION_OFFSET = new THREE.Vector3(0, 0, BASE_SPEED / CHASE_POS_RATE)
  .add(CHASE_OFFSET)
  .negate();

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

  // ---- flight rig: ship + virtual chase camera (hidden until engage) ----
  const flightRig = createFlightRig(tracker);
  const { ship } = flightRig;
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

  const onMouseMove = (e: MouseEvent) => {
    // pointerToNdc mutates the stable `ndc` — move events fire every frame
    // while steering, and a fresh object per event is per-frame garbage
    pointerToNdc(ndc, e.clientX, e.clientY, renderer.domElement);
    mouseActive = true;
    steerLive = true;
  };
  const onMouseLeave = () => {
    mouseActive = false;
    steerLive = false;
  };
  const onTouchMove = (e: TouchEvent) => {
    pointerToNdc(ndc, e.touches[0].clientX, e.touches[0].clientY, renderer.domElement);
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
  const listeners = createListenerGroup();
  listeners.add(window, 'mousemove', onMouseMove);
  listeners.add(document, 'mouseleave', onMouseLeave);
  listeners.add(window, 'pointerdown', onPointerDown);
  listeners.add(window, 'pointerup', onPointerUp);
  listeners.add(window, 'pointercancel', onPointerUp);
  listeners.add(window, 'keydown', onKeyDown);
  listeners.add(container, 'touchmove', onTouchMove, { passive: true });

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
  // camera copies it in title mode and crossfades away from it through the
  // transition. A camera (never rendered) rather than a plain Object3D so
  // lookAt aims down -z exactly like the real one.
  const titleRig = new THREE.PerspectiveCamera();
  // The title FOV law's own state, eased here and mixed into the camera by
  // the crossfade weight. In play it freezes and the rig's 64/71 law owns
  // the lens; a disengage resumes easing it toward the title target.
  let titleFov = 62;
  const steer = { x: 0, y: 0 };
  const shipForward = new THREE.Vector3();
  // scratch pose handed to flightRig.arm — a view of the real camera
  const armPose = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    fov: 62,
  };
  const station = new THREE.Vector3();
  // the prop's home: shipBody centered on the control frame (third person)
  const propHome = new THREE.Vector3();
  // exit-leg scratch: the hull position expressed in the ship's local frame
  const propTarget = new THREE.Vector3();
  const propQuat = new THREE.Quaternion();
  const applyFov = (fov: number) => {
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
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
      if (mode === 'play' && lastMode === 'engage') {
        // settle: release the arrival pull — the last ~0.7 u of approach
        // would otherwise creep the world-fixed station (and the camera
        // with it) through settled play, breaking the identity invariant
        flightRig.flyTo(null);
      }
      if (mode === 'engage' && lastMode === 'disengage') {
        // re-engage mid-fade: the rig is still live, so no re-arm — but
        // re-issue the last station for state hygiene. If the previous
        // engage settled, the station was cleared (above) with the ship
        // ~0.7 u short of it (the settle residual) — resuming that whisper
        // of approach is imperceptible; if ESC came mid-engage the rig
        // still holds it — idempotent. Either way the arrival ease resumes
        // wherever the ship is.
        flightRig.flyTo(station);
      }
      if (mode === 'engage' && lastMode === 'title') {
        // arm the flight rig on the real camera: its virtual chase pose
        // starts exactly here (the crossfade opens at identity), the ship
        // spawns low-and-behind on SHIP_ENTRY, and its arrival station is
        // placed so the converged chase pose lands the camera back where
        // it is now (STATION_OFFSET). Controls arm with the engage: the
        // deflection recorded before the press is dropped — steering
        // resumes on the next fresh move, authority ramping in with s.
        // A re-engage caught mid-disengage skips all this: the rig is
        // still live and simply keeps flying.
        armPose.position.copy(camera.position);
        armPose.quaternion.copy(camera.quaternion);
        armPose.fov = camera.fov;
        flightRig.arm(armPose, heading);
        flightRig.flyTo(
          station.copy(STATION_OFFSET).applyQuaternion(ship.quaternion).add(camera.position),
        );
        steerLive = false;
      }
      if (mode === 'disengage' && lastMode === 'play') {
        // from settled play the rig has no weight, so the title roll
        // restarts level (the ship frame cruises near-level too — the roll
        // leveler rights it; any residual fades through the crossfade)
        roll = 0;
        // hand the drift law the direction the chase camera actually faces:
        // its trailing slerp lags the nose mid-turn — the title heading
        // resumes from what is on screen, while the ship simply stays
        // parked at its station and recedes as the camera returns
        heading.copy(FORWARD).applyQuaternion(camera.quaternion);
      }
      lastMode = mode;
      onMode?.(mode);
    }
    const playing = mode === 'play';
    // crossfade weight: steering authority, heading hand-off and the
    // camera mix all ride the same curve
    const s = easeInOutCubic(blend);

    // throttle: click kicks, holding burns, release coasts back to cruise.
    // The pointer works in every mode; the burn key (Space) arms with the
    // rest of the game controls at settle
    const burn = throttleDown || (playing && burnKeysDown(keys));
    if (playing) {
      // play runs the shared EPHEMERIS boost feel (flight.ts response
      // rates) on the stream-speed multiplier — the ×8 target is
      // map-scale, not feel, so it stays deep-field. The lens is the
      // flight rig's own 64/71 law, mixed in at full weight below.
      const targetBoost = burn ? 8 : 1;
      boost += (targetBoost - boost) * Math.min(1, dt * speedResponseRate(boost, targetBoost, burn));
    } else {
      if (burn) boost += (8 - boost) * Math.min(1, dt * 1.6);
      else boost += (1 - boost) * Math.min(1, dt * 1.1);
      // the title look deliberately targets its own 62 base (design-locked),
      // not the shared CRUISE_FOV — only the easing primitive is shared
      titleFov = easeFovValue(titleFov, 62 + (boost - 1) * 1.9, dt);
    }
    const speed = BASE_SPEED * boost;

    // stream lag: reproduces, in the ship-static frame, the trail the
    // ephemeris chase lerp develops while the ship translates — same
    // dynamics, so the apparent ship distance and the boost pull-ahead cue
    // match, and the trail winds out at the same rate through a disengage.
    // The ease targets the PRE-clamp steady state (speed/rate) and clamps
    // after, like the real lerp: under a burn the trail ramps at full rate
    // into the cap instead of slowing asymptotically toward it. The trail
    // develops from the first engage frame — the rig is live throughout.
    const lagTarget = target === 1 && blend > 0 ? speed / CHASE_POS_RATE : 0;
    streamLag += (lagTarget - streamLag) * Math.min(1, dt * CHASE_POS_RATE);
    streamLag = Math.min(streamLag, CAMERA_MAX_LAG);

    // steering: while the engage target holds, the ship frame is the
    // authority from the first blend frame — pointer deflection integrates
    // the attitude at game rates with authority ramped by the crossfade
    // (× s), so control fades in as the chase pose gains weight and is
    // exact game feel at settle (s = 1). The heading eases onto the ship's
    // nose (verbatim copy once settled), keeping the streaming world and
    // the respawn corridor aligned with flight; a play-mode loop can drive
    // the heading through (0, ±1, 0) — the camUp parallel transport below
    // (heading component stripped each frame, degenerate fallbacks) is
    // what keeps the up basis and respawn corridor pole-safe, not any
    // attitude envelope. Disengaging, the rig still steers — at zero
    // deflection, so the bank eases out — while the heading returns to the
    // cursor drift law: an off-center cursor is a constant angular offset,
    // a steady gentle turn; recentering flies straight.
    if (target === 1 && blend > 0) {
      // resolveSteer flips ndc.y to the ephemeris screen-down sense and
      // clamps (window-level moves over the site header land past ±1); the
      // steerLive gate zeroes only the pointer — keys still steer while the
      // deflection is stale
      resolveSteer(steer, steerLive ? ndc.x : 0, steerLive ? ndc.y : 0, keys);
      flightRig.steer(steer.x * s, steer.y * s, dt);
      // prop returning home: PLAY caught mid-exit flies the ship back out
      // of the hull to the third-person frame as steer authority ramps in
      // — the camera pulling back out. Inert in normal flight: arm zeroed
      // the offset, so settled play never enters the branch
      if (flightRig.shipBody.position.lengthSq() > 0) {
        flightRig.shipBody.position.lerp(propHome, Math.min(1, dt * SHIP_ARRIVAL_RATE));
        // the exponential never reaches zero on its own; snap once
        // subvisual (<1 mm) so settled play re-arms the zero-work gate
        if (flightRig.shipBody.position.lengthSq() < 1e-6) flightRig.shipBody.position.set(0, 0, 0);
      }
      shipForward.copy(FORWARD).applyQuaternion(ship.quaternion);
      // the heading trails the nose on an ease that stiffens as the blend
      // closes (factor → 1 continuously as s → 1), so the trailing gap is
      // wound out BY settle — the verbatim copy below never snaps it
      // s === 1 is reachable with blend < 1 (easeInOutCubic rounds to 1.0
      // just under the endpoint): the division would be 0/0 on a dt = 0
      // frame (clampDt floors at 0 on resume) — NaN into the heading,
      // permanently. The copy IS the ease's limit in that window.
      if (s === 1) heading.copy(shipForward);
      else heading.lerp(shipForward, Math.min(1, (dt * 3) / (1 - s)));
    } else {
      if (blend > 0) {
        flightRig.steer(0, 0, dt);
        // exit leg (prop-only, like banking): the ship is "always there" —
        // title is first person, inside the hull; play is third person.
        // ESC is the camera moving back in, so the prop slides under the
        // view and tucks into the hull position at the mixed camera (as of
        // last frame — the mix runs below; one frame stale, continuous,
        // identical endpoint): world target camera + R_ship·SHIP_ENTRY,
        // expressed in the ship's local frame. Because the target tracks
        // the moving camera — NOT the
        // station — the prop ends behind the near plane wherever the title
        // rig wound up, so the visibility cutoff at blend 0 is guaranteed
        // imperceptible (~95% converged over DISENGAGE_S at the shared
        // SHIP_ARRIVAL_RATE — one rate for both legs, symmetric by
        // construction). The chase pose, still the crossfade's endpoint,
        // barely moves: steer(0,0,dt) lets the roll leveler ease any
        // residual roll out during the exit, and the propTarget lerp
        // recomputes against the current frame each step, so the prop
        // still converges on the hull.
        propTarget
          .copy(camera.position)
          .sub(ship.position)
          .applyQuaternion(propQuat.copy(ship.quaternion).invert())
          .add(SHIP_ENTRY);
        flightRig.shipBody.position.lerp(propTarget, Math.min(1, dt * SHIP_ARRIVAL_RATE));
      }
      if (mouseActive) {
        raycaster.setFromCamera(ndc, camera);
        heading.lerp(raycaster.ray.direction, Math.min(1, dt * 0.55));
      } else {
        heading.lerp(FORWARD, Math.min(1, dt * 0.08));
      }
    }
    heading.normalize();

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
      titleRig.position.x = Math.sin(t * 0.045) * 16;
      titleRig.position.y = Math.cos(t * 0.036) * 10;
      titleRig.position.z = 0;
      titleRig.up.copy(camUp);
      lookTarget.copy(titleRig.position).addScaledVector(heading, 520);
      lookTarget.x += Math.sin(t * 0.058) * 20;
      lookTarget.y += Math.cos(t * 0.049) * 12;
      titleRig.lookAt(lookTarget);
      // bank with the commanded turn, not the world direction — cruising
      // along any axis flies level
      const rollTarget = mouseActive ? THREE.MathUtils.clamp(-ndc.x * 0.3, -0.3, 0.3) : 0;
      roll += (rollTarget - roll) * Math.min(1, dt * 2);
      if (roll !== 0) titleRig.rotateZ(roll);
    }

    // camera: two live rigs, one crossfade. The title rig and the flight
    // rig's virtual chase camera each run their own full laws every frame
    // they have weight; the real camera is a single mix — position lerp,
    // quaternion slerp, fov lerp — weighted by s. Both endpoints are live
    // poses, so the mix is bit-identity at s = 0 and s = 1: title mode and
    // settled play run their exact laws, and the transition is nothing but
    // the fade between them. Through an engage the rig's ship flies out to
    // its station (net camera travel ≈ 0 once the trail converges); at
    // settle the arrival pull is released and the ship stays parked (the
    // world streams past it, so speed reads from the stream, never from
    // ship translation) with the chase lerp converged, working only during
    // turns. Through a disengage the rig keeps simulating while it has
    // weight: after settled play the control frame is parked, so the pose
    // endpoint holds still while the prop tucks back into the hull; an
    // ESC mid-engage leaves the arrival ease running, so frame and prop
    // motion superpose — correct and harmless.
    if (blend > 0) flightRig.update(dt, playing && burn, streamLag);
    if (blend === 0) {
      camera.position.copy(titleRig.position);
      camera.quaternion.copy(titleRig.quaternion);
      applyFov(titleFov);
    } else if (blend === 1) {
      camera.position.copy(flightRig.pose.position);
      camera.quaternion.copy(flightRig.pose.quaternion);
      applyFov(flightRig.pose.fov);
    } else {
      camera.position.lerpVectors(titleRig.position, flightRig.pose.position, s);
      camera.quaternion.slerpQuaternions(titleRig.quaternion, flightRig.pose.quaternion, s);
      applyFov(titleFov + (flightRig.pose.fov - titleFov) * s);
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
    // LOD rungs alongside pixels
    applyQuality(stage, dust, lod);

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
    listeners.dispose();
    keyTracker.dispose();
    stats.dispose();
    lod.dispose();
    // stops the loop and frees every tracked geometry/material
    stage.dispose();
  };

  return { dispose, play, exit };
}

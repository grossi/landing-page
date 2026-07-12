import * as THREE from 'three';
import { DODEC, ICO_MID, OCT, RING_THIN, softSprite, wireMat } from 'engine/render/assets';
import { createStage } from 'engine/render/stage';

/** Per-body drift state kept outside the scene graph for type safety. */
interface BodyState {
  group: THREE.Group;
  rot: THREE.Vector3;
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

/**
 * Mounts the DEEP FIELD backdrop into `container` and starts its render
 * loop. Returns a dispose function that stops the loop, removes listeners
 * and frees all GPU resources.
 *
 * An endless drift through wireframe planets, asteroids and derelicts.
 * The cursor steers: the flight heading turns slowly toward where the
 * cursor sits — off-center carves a wide banking turn, recentering flies
 * straight — and the camera itself never jumps. Clicking kicks the drift
 * speed (the throttle); holding the button sustains a full burn.
 */
export function createDeepField(container: HTMLElement): () => void {
  const stage = createStage(container, { fov: 62, near: 0.1, far: 5000, fogDensity: 0.00115 });
  const { scene, camera, renderer, tracker } = stage;

  // Mount-owned GPU resources (point clouds, fresh wireframe materials) are
  // tracked so stage.dispose() frees them; the shared unit geometries from
  // engine/render/assets are never tracked and never disposed.
  const wire = (opacity: number) => tracker.track(wireMat(opacity));

  // ---- distant stars (rotate with the view, never translate) ----
  {
    const n = 900;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1800 + Math.random() * 1400);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    tracker.track(geometry);
    const stars = new THREE.Points(
      geometry,
      tracker.track(
        new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, transparent: true, opacity: 0.5, fog: false }),
      ),
    );
    stars.frustumCulled = false;
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
      // planet, sometimes ringed
      const r = 18 + Math.random() * 30;
      const planet = new THREE.Mesh(ICO_MID, wire(0.45));
      planet.scale.setScalar(r);
      group.add(planet);
      if (Math.random() < 0.55) {
        const ring = new THREE.Mesh(RING_THIN, wire(0.6));
        ring.scale.setScalar(r);
        ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.7;
        group.add(ring);
      }
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

  // ---- dust for speed perception ----
  const dustPositions = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N * 3; i++) dustPositions[i] = (Math.random() - 0.5) * DUST_RANGE * 2;
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  tracker.track(dustGeo);
  const dust = new THREE.Points(
    dustGeo,
    tracker.track(
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.5,
        map: softSprite,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
    ),
  );
  dust.frustumCulled = false;
  scene.add(dust);

  // ---- input ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let mouseActive = false;
  let throttleDown = false;
  let boost = 1;

  const onMouseMove = (e: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    mouseActive = true;
  };
  const onMouseLeave = () => {
    mouseActive = false;
  };
  const onPointerDown = (e: PointerEvent) => {
    // Links and buttons layered over the backdrop keep their normal clicks.
    if (e.target instanceof Element && e.target.closest('a,button')) return;
    throttleDown = true;
    boost = Math.min(boost + 2.6, 8);
  };
  const onPointerUp = () => {
    throttleDown = false;
  };
  window.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseleave', onMouseLeave);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // ---- render loop ----
  const heading = new THREE.Vector3(0, 0, -1);
  const FORWARD = new THREE.Vector3(0, 0, -1);
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  // camera up, parallel-transported to stay perpendicular to the heading
  const camUp = new THREE.Vector3(0, 1, 0);
  const lookTarget = new THREE.Vector3();
  const side = new THREE.Vector3();
  const lift = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  let roll = 0;

  // O(1) modulo wrap onto [-DUST_RANGE, DUST_RANGE] — handles any
  // single-frame overshoot on any axis (same pattern as EPHEMERIS)
  const DUST_SPAN = DUST_RANGE * 2;
  const wrapDust = (v: number) =>
    v > DUST_RANGE || v < -DUST_RANGE
      ? ((((v + DUST_RANGE) % DUST_SPAN) + DUST_SPAN) % DUST_SPAN) - DUST_RANGE
      : v;

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

  stage.start((dt, t) => {
    // throttle: click kicks, hold burns, release coasts back to cruise
    if (throttleDown) boost += (8 - boost) * Math.min(1, dt * 1.6);
    else boost += (1 - boost) * Math.min(1, dt * 1.1);
    const speed = BASE_SPEED * boost;
    const targetFov = 62 + (boost - 1) * 1.9;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
      camera.updateProjectionMatrix();
    }

    // camera: slow autonomous sway, never coupled to the cursor position
    camera.position.x = Math.sin(t * 0.045) * 16;
    camera.position.y = Math.cos(t * 0.036) * 10;
    camera.position.z = 0;

    // steering: the heading turns slowly toward the cursor's ray. With the
    // camera looking along the heading, an off-center cursor is a constant
    // angular offset — a steady, gentle turn; recentering flies straight.
    if (mouseActive) {
      raycaster.setFromCamera(ndc, camera);
      heading.lerp(raycaster.ray.direction, Math.min(1, dt * 0.55));
    } else {
      heading.lerp(FORWARD, Math.min(1, dt * 0.08));
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
    camera.up.copy(camUp);

    lookTarget.copy(camera.position).addScaledVector(heading, 520);
    lookTarget.x += Math.sin(t * 0.058) * 20;
    lookTarget.y += Math.cos(t * 0.049) * 12;
    camera.lookAt(lookTarget);
    // bank with the commanded turn, not the world direction — cruising along
    // any axis flies level
    const rollTarget = mouseActive ? THREE.MathUtils.clamp(-ndc.x * 0.3, -0.3, 0.3) : 0;
    roll += (rollTarget - roll) * Math.min(1, dt * 2);
    if (roll !== 0) camera.rotateZ(roll);

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

    // dust: streams past opposite the heading; the wrap cube is centered 60
    // units ahead along it so most particles stay in front of the camera
    const dp = dustGeo.attributes.position as THREE.BufferAttribute;
    const dvx = -heading.x * speed * 2.4;
    const dvy = -heading.y * speed * 2.4;
    const dvz = -heading.z * speed * 2.4;
    const cx = heading.x * 60;
    const cy = heading.y * 60;
    const cz = heading.z * 60;
    for (let i = 0; i < DUST_N; i++) {
      dp.setXYZ(
        i,
        wrapDust(dp.getX(i) + dvx * dt - cx) + cx,
        wrapDust(dp.getY(i) + dvy * dt - cy) + cy,
        wrapDust(dp.getZ(i) + dvz * dt - cz) + cz,
      );
    }
    dp.needsUpdate = true;
  });

  return () => {
    window.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseleave', onMouseLeave);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    // stops the loop and frees every tracked geometry/material
    stage.dispose();
  };
}

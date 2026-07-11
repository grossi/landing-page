import * as THREE from 'three';

export interface EphemerisHudElements {
  /** Name of the nearest body, e.g. "VELORA-3". */
  body: HTMLElement;
  /** Distance line, e.g. "142 km · APPROACH". */
  dist: HTMLElement;
  /** Ship speed, e.g. "55 km/s". */
  speed: HTMLElement;
}

/**
 * Mounts the EPHEMERIS solar-system simulation into `container` and starts
 * its render loop. Returns a dispose function that stops the loop, removes
 * listeners and frees all GPU resources.
 *
 * The sim owns its canvas; HUD text is written into the provided elements so
 * the caller controls layout/styling without re-rendering per frame.
 */
export function createEphemeris(container: HTMLElement, hud: EphemerisHudElements): () => void {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    64,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.5,
    4000,
  );
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const wire = (opacity: number) =>
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity });

  // ---- the system ----
  const SYLLABLES = ['KHE', 'VEL', 'ORA', 'TAU', 'MIR', 'SEN', 'DUV', 'ALK', 'RHO', 'ZEPH', 'CAL', 'IMB'];
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  const nameOf = (i: number) => `${pick(SYLLABLES)}${pick(SYLLABLES)}-${i + 1}`;

  interface MoonData { r: number; speed: number; phase: number }
  interface PlanetData {
    name: string;
    r: number;
    radius: number;
    speed: number;
    phase: number;
    spin: number;
    moons: THREE.Mesh[];
  }

  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(26, 2), wire(0.9));
  scene.add(sun);
  const haloSpins: number[] = [];
  for (let i = 0; i < 3; i++) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(34 + i * 7, 0.12, 4, 64), wire(0.22 - i * 0.06));
    halo.rotation.x = Math.random() * Math.PI;
    halo.rotation.y = Math.random() * Math.PI;
    haloSpins.push(0.05 + Math.random() * 0.1);
    sun.add(halo);
  }

  const planets: THREE.Mesh[] = [];
  const orbitMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
  const ORBIT_RADII = [95, 150, 215, 300, 400, 520, 660];
  for (let i = 0; i < ORBIT_RADII.length; i++) {
    const radius = 3.5 + Math.random() * 10;
    const planet = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, radius > 9 ? 1 : 0), wire(0.85));
    const data: PlanetData = {
      name: nameOf(i),
      r: ORBIT_RADII[i],
      radius,
      speed: (0.5 / Math.pow(ORBIT_RADII[i] / 95, 1.5)) * 0.06,
      phase: Math.random() * Math.PI * 2,
      spin: 0.1 + Math.random() * 0.4,
      moons: [],
    };
    planet.userData = data;

    const orbitPoints: THREE.Vector3[] = [];
    for (let a = 0; a <= 96; a++) {
      const angle = (a / 96) * Math.PI * 2;
      orbitPoints.push(new THREE.Vector3(Math.cos(angle) * data.r, 0, Math.sin(angle) * data.r));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPoints), orbitMat));

    if (Math.random() < 0.4) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.9, 0.15, 4, 42), wire(0.5));
      ring.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.6;
      planet.add(ring);
    }

    const moonCount = Math.random() < 0.5 ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let k = 0; k < moonCount; k++) {
      const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.22, 0), wire(0.7));
      const moonData: MoonData = {
        r: radius * (2.6 + k * 1.4),
        speed: 0.5 + Math.random(),
        phase: Math.random() * Math.PI * 2,
      };
      moon.userData = moonData;
      planet.add(moon);
      data.moons.push(moon);
    }
    planets.push(planet);
    scene.add(planet);
  }

  // asteroid belt between the 4th and 5th orbits
  const belt = new THREE.Group();
  {
    const n = 500;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 340 + Math.random() * 34;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 9;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    belt.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0.55 }),
      ),
    );
    scene.add(belt);
  }

  // comet on an eccentric orbit, dragging a trail
  const comet = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), wire(0.9));
  scene.add(comet);
  const TRAIL_LENGTH = 70;
  const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  scene.add(new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })));

  // stars
  {
    const n = 800;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(1600 + Math.random() * 900);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, transparent: true, opacity: 0.55 }),
      ),
    );
  }

  // ---- ship ----
  const ship = new THREE.Group();
  const shipBody = new THREE.Group(); // banked visually; `ship` carries the control frame
  const noseGeo = new THREE.ConeGeometry(0.8, 2.6, 4);
  noseGeo.rotateX(-Math.PI / 2); // nose toward -z (camera forward)
  shipBody.add(new THREE.Mesh(noseGeo, wire(1)));
  const wingGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-2, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(2, 0, 1),
    new THREE.Vector3(-2, 0, 1),
  ]);
  shipBody.add(new THREE.Line(wingGeo, new THREE.LineBasicMaterial({ color: 0xffffff })));
  ship.add(shipBody);
  ship.position.set(0, 40, 900);
  scene.add(ship);

  // ---- input ----
  const keys: Record<string, boolean> = {};
  let pointer = { x: 0, y: 0 };
  let pointerDown = false;

  const toLocal = (clientX: number, clientY: number) => {
    const rect = container.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 2 - 1,
      y: ((clientY - rect.top) / rect.height) * 2 - 1,
    };
  };
  const onKeyDown = (e: KeyboardEvent) => { keys[e.code] = true; };
  const onKeyUp = (e: KeyboardEvent) => { keys[e.code] = false; };
  const onPointerMove = (e: PointerEvent) => { pointer = toLocal(e.clientX, e.clientY); };
  const onPointerDown = () => { pointerDown = true; };
  const onPointerUp = () => { pointerDown = false; };
  const onTouchMove = (e: TouchEvent) => { pointer = toLocal(e.touches[0].clientX, e.touches[0].clientY); };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  container.addEventListener('touchmove', onTouchMove, { passive: true });

  const onResize = () => {
    const w = container.clientWidth;
    const h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  // ---- simulation loop ----
  const velocity = new THREE.Vector3();
  const attitude = { yaw: 0, pitch: -0.04 };
  const forward = new THREE.Vector3();
  const scratch = new THREE.Vector3();
  let t = 0;
  let rafId = 0;
  let last = performance.now();

  function tick(now: number) {
    rafId = requestAnimationFrame(tick);
    // rAF timestamps can predate `last` on the first frame — clamp to 0.
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
    last = now;
    t += dt;

    // orbits
    sun.rotation.y += dt * 0.06;
    const pulse = 1 + Math.sin(t * 1.3) * 0.025;
    sun.scale.set(pulse, pulse, pulse);
    sun.children.forEach((halo, i) => { halo.rotation.z += haloSpins[i] * dt; });
    for (const planet of planets) {
      const data = planet.userData as PlanetData;
      const angle = data.phase + t * data.speed;
      planet.position.set(Math.cos(angle) * data.r, 0, Math.sin(angle) * data.r);
      planet.rotation.y += data.spin * dt;
      for (const moon of data.moons) {
        const moonData = moon.userData as MoonData;
        const moonAngle = moonData.phase + t * moonData.speed;
        moon.position.set(Math.cos(moonAngle) * moonData.r, 0, Math.sin(moonAngle) * moonData.r);
      }
    }
    belt.rotation.y += dt * 0.012;

    // comet ellipse + trail
    const cometAngle = t * 0.045 + 2;
    comet.position.set(Math.cos(cometAngle) * 620, Math.sin(cometAngle * 2) * 18, Math.sin(cometAngle) * 260);
    for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
      trailPositions[i * 3] = trailPositions[(i - 1) * 3];
      trailPositions[i * 3 + 1] = trailPositions[(i - 1) * 3 + 1];
      trailPositions[i * 3 + 2] = trailPositions[(i - 1) * 3 + 2];
    }
    trailPositions[0] = comet.position.x;
    trailPositions[1] = comet.position.y;
    trailPositions[2] = comet.position.z;
    trailGeo.attributes.position.needsUpdate = true;

    // steering
    let steerX = pointer.x;
    let steerY = pointer.y;
    const boost = pointerDown || keys.KeyW || keys.ArrowUp || keys.Space;
    if (keys.ArrowLeft || keys.KeyA) steerX = -0.7;
    if (keys.ArrowRight || keys.KeyD) steerX = 0.7;
    attitude.yaw -= steerX * 2.2 * dt;
    attitude.pitch -= steerY * 1.7 * dt;
    attitude.pitch = Math.max(-1.35, Math.min(1.35, attitude.pitch));
    ship.quaternion.setFromEuler(new THREE.Euler(attitude.pitch, attitude.yaw, 0, 'YXZ'));
    shipBody.rotation.z += (-steerX * 0.9 - shipBody.rotation.z) * Math.min(1, dt * 8);

    forward.set(0, 0, -1).applyQuaternion(ship.quaternion);
    velocity.lerp(scratch.copy(forward).multiplyScalar(boost ? 170 : 55), Math.min(1, dt * 2.2));
    ship.position.addScaledVector(velocity, dt);
    // soft leash: far beyond the system, curve back toward it
    const distFromSun = ship.position.length();
    if (distFromSun > 1300) {
      ship.position.multiplyScalar(1 - ((distFromSun - 1300) / distFromSun) * Math.min(1, dt * 2));
    }

    // nearest-body HUD
    let nearestName = 'THE SUN';
    let nearestDist = ship.position.length() - 26;
    for (const planet of planets) {
      const data = planet.userData as PlanetData;
      const d = ship.position.distanceTo(planet.position) - data.radius;
      if (d < nearestDist) { nearestDist = d; nearestName = data.name; }
    }
    const cometDist = ship.position.distanceTo(comet.position);
    if (cometDist < nearestDist) { nearestDist = cometDist; nearestName = 'THE COMET'; }
    hud.body.textContent = nearestName;
    hud.dist.textContent = `${Math.max(0, Math.floor(nearestDist))} km${nearestDist < 30 ? ' · APPROACH' : ''}`;
    hud.speed.textContent = `${Math.floor(velocity.length())} km/s`;

    // chase camera
    const camTarget = scratch.set(0, 2.6, 9).applyQuaternion(ship.quaternion).add(ship.position);
    camera.position.lerp(camTarget, Math.min(1, dt * 5));
    camera.quaternion.slerp(ship.quaternion, Math.min(1, dt * 6));
    renderer.render(scene, camera);
  }
  rafId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    container.removeEventListener('pointermove', onPointerMove);
    container.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('touchmove', onTouchMove);
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const material = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

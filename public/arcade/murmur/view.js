// MURMUR's picture of a game. Everything here is allocated once: runs, retries
// and banks only rewrite the same buffers, and `dispose` releases all of it.
import { wakeLength } from './flock.js';
import { TUNE } from './game.js';

/** The chase camera sits this far behind and above the ship, in the ship's frame.
 *  It backs off and rises by a share of the wake's length, to keep the wake in view. */
const CAMERA_BACK = 9.5, CAMERA_UP = 2.6, WAKE_BACK = 0.6, WAKE_UP = 0.14;
/** How far the camera may trail the ship's turn, as a share of the half-screen, and in units. */
const LAG_SCREEN = 0.42, LAG_UNITS = 2.2;
const FOG_NEAR = 110, FOG_FAR = 340;
/** A bird's size in world units, and the most pixels it may cover however close it is. */
const BIRD = 0.55, BIRD_PIXELS = 5;
const GRID_STEP = 60, GRID_Y = -170;
/** Title screen: the camera circles the flock from this far out, this high, this fast (rad/s). */
const TITLE_FAR = 72, TITLE_UP = 13, TITLE_TURN = 0.07;

const BIRD_VERTEX = `
  attribute float glow;
  uniform float scale, cap, fogNear, fogFar;
  varying float shine;
  void main() {
    vec4 eye = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * eye;
    float depth = max(1.0, -eye.z);
    gl_PointSize = clamp(scale * (0.7 + 0.45 * min(glow, 1.5)) / depth, cap * 0.36, cap * (0.75 + 0.25 * min(glow, 1.0)));
    // A far flock dims but never goes out: it has to be findable.
    shine = glow * (1.0 - 0.7 * smoothstep(fogNear, fogFar, depth));
  }`;
const BIRD_FRAGMENT = `
  varying float shine;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float edge = dot(p, p) * 4.0;
    if (edge > 1.0) discard;
    gl_FragColor = vec4(vec3(1.0), min(1.0, smoothstep(1.0, 0.35, edge) * shine));
  }`;

/**
 * @param {{ THREE: typeof import('three'),
 *   createShipBody: (three: typeof import('three')) => import('three').Group,
 *   game: ReturnType<typeof import('./game.js').createGame>, aspect: number }} options
 */
export function createView({ THREE, createShipBody, game, aspect }) {
  const { flock, belt, gate } = game;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, FOG_NEAR, FOG_FAR);
  const camera = new THREE.PerspectiveCamera(64, aspect, 0.5, 1400);

  // ---- the flock: one Points over the game's own arrays ----
  const birdGeometry = new THREE.BufferGeometry();
  const birdPositions = new THREE.BufferAttribute(flock.pos, 3);
  const birdGlow = new THREE.BufferAttribute(flock.glow, 1);
  birdPositions.setUsage(THREE.DynamicDrawUsage);
  birdGlow.setUsage(THREE.DynamicDrawUsage);
  birdGeometry.setAttribute('position', birdPositions);
  birdGeometry.setAttribute('glow', birdGlow);
  const birdMaterial = new THREE.ShaderMaterial({
    uniforms: {
      scale: { value: 600 }, cap: { value: BIRD_PIXELS },
      fogNear: { value: FOG_NEAR }, fogFar: { value: FOG_FAR * 1.6 },
    },
    vertexShader: BIRD_VERTEX, fragmentShader: BIRD_FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const birds = new THREE.Points(birdGeometry, birdMaterial);
  birds.frustumCulled = false;
  scene.add(birds);

  // ---- the belt: three sizes of rock, each a batch of black faces and a batch of white edges ----
  const rockFaces = new THREE.MeshBasicMaterial({
    color: 0x000000, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const rockEdges = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
  const batches = [0, 1, 2].map(kind => {
    const count = Math.ceil((belt.count - kind) / 3);
    const geometry = new THREE.IcosahedronGeometry(1, kind === 2 ? 1 : 0);
    const faces = new THREE.InstancedMesh(geometry, rockFaces, count);
    const edges = new THREE.InstancedMesh(geometry, rockEdges, count);
    for (const batch of [faces, edges]) {
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Rocks are spread all round the ship: there is nothing to cull.
      batch.frustumCulled = false;
      scene.add(batch);
    }
    return { faces, edges };
  });
  const rock = new THREE.Object3D();
  function updateRocks() {
    for (let i = 0; i < belt.count; i++) {
      const batch = batches[belt.kind[i]], slot = Math.floor(i / 3);
      rock.position.set(belt.x[i], belt.y[i], belt.z[i]);
      // Each rock tumbles at its own slow rate.
      rock.rotation.set(game.time * (0.15 + (i % 7) * 0.05), game.time * (0.1 + (i % 5) * 0.06), i);
      rock.scale.setScalar(belt.r[i]);
      rock.updateMatrix();
      batch.faces.setMatrixAt(slot, rock.matrix);
      batch.edges.setMatrixAt(slot, rock.matrix);
    }
    for (const batch of batches) {
      batch.faces.instanceMatrix.needsUpdate = true;
      batch.edges.instanceMatrix.needsUpdate = true;
    }
  }

  // ---- the gate: a ring that shows through the fog, so it can be found ----
  const gateMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const faintMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.35 });
  const ring = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(TUNE.GATE_R, 0.13, 6, 64), gateMaterial);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(TUNE.GATE_R * 0.62, 0.07, 4, 6), faintMaterial);
  ring.add(rim, inner);
  scene.add(ring);
  const along = new THREE.Vector3(), forward = new THREE.Vector3(0, 0, 1);
  let gateId = NaN;
  function updateGate() {
    if (gateId !== gate.id) {
      gateId = gate.id;
      ring.position.set(gate.x, gate.y, gate.z);
      ring.quaternion.setFromUnitVectors(forward, along.set(gate.nx, gate.ny, gate.nz));
    }
    inner.rotation.z = game.time * 0.8;
  }

  // ---- sky and floor: stars at infinity, and a faint grid far below to fly over ----
  const sky = new THREE.Group();
  {
    const count = 500, stars = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const cos = Math.random() * 2 - 1, sin = Math.sqrt(1 - cos * cos), angle = Math.random() * Math.PI * 2;
      const radius = 600 + Math.random() * 300;
      stars[i * 3] = Math.cos(angle) * sin * radius;
      stars[i * 3 + 1] = cos * radius;
      stars[i * 3 + 2] = Math.sin(angle) * sin * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    sky.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.3, fog: false,
    })));
  }
  scene.add(sky);
  const grid = (() => {
    const lines = [], half = 9 * GRID_STEP;
    for (let i = -9; i <= 9; i++) {
      lines.push(i * GRID_STEP, 0, -half, i * GRID_STEP, 0, half, -half, 0, i * GRID_STEP, half, 0, i * GRID_STEP);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    return new THREE.LineSegments(geometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, fog: false }));
  })();
  scene.add(grid);

  // ---- ship: the group is the control frame, the body only banks for show ----
  const ship = new THREE.Group();
  const body = createShipBody(THREE);
  ship.add(body);
  scene.add(ship);

  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const seat = new THREE.Vector3(), spot = new THREE.Vector3();
  let runs = NaN, height = 900, pixels = 1, pulled = 0;

  function render(renderer, dt) {
    const pilot = game.ship;
    ship.position.set(pilot.x, pilot.y, pilot.z);
    ship.quaternion.setFromEuler(euler.set(pilot.pitch, pilot.yaw, 0));
    // Bank into the turn. The control frame above knows nothing of it.
    body.rotation.z += (-pilot.turn * 0.9 - body.rotation.z) * Math.min(1, dt * 8);
    body.visible = game.cause !== 'WRECKED';

    // A phone held upright sees a narrow slice: widen it. Speed opens it further.
    const speed = Math.hypot(pilot.vx, pilot.vy, pilot.vz);
    const rush = Math.max(0, Math.min(1, (speed - TUNE.CRUISE) / (TUNE.BOOST - TUNE.CRUISE)));
    const fov = (camera.aspect < 1 ? 80 : 64) + rush * 9;
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const tan = Math.tan(camera.fov * Math.PI / 360);
    birdMaterial.uniforms.scale.value = BIRD * height * pixels / (2 * tan);
    birdMaterial.uniforms.cap.value = BIRD_PIXELS * pixels;

    // Chase camera: it trails the ship's turn so the turn reads on screen, but
    // only so far that the ship never nears the edge, however narrow the screen.
    const pull = flock.wake ? wakeLength(flock.wake) : 0;
    pulled += (pull - pulled) * Math.min(1, dt * 1.5);
    seat.set(0, CAMERA_UP + pulled * WAKE_UP, CAMERA_BACK + pulled * WAKE_BACK)
      .applyQuaternion(ship.quaternion).add(ship.position);
    if (game.state === 'menu') {
      // Title: stand off and watch the ship dive through the flock. A narrow
      // screen stands farther off to keep the whole flock in.
      const far = TITLE_FAR / Math.min(1, camera.aspect * 1.3), angle = game.time * TITLE_TURN;
      camera.position.set(game.anchor.x + Math.sin(angle) * far, game.anchor.y + TITLE_UP, game.anchor.z + Math.cos(angle) * far);
      camera.lookAt(game.anchor.x, game.anchor.y, game.anchor.z);
    } else if (runs !== game.runs) {
      // The ship was put somewhere new: cut, do not swing across the belt.
      runs = game.runs;
      pulled = 0;
      camera.position.copy(seat.set(0, CAMERA_UP, CAMERA_BACK).applyQuaternion(ship.quaternion).add(ship.position));
      camera.quaternion.copy(ship.quaternion);
    } else {
      camera.position.lerp(seat, Math.min(1, dt * 8));
      camera.quaternion.slerp(ship.quaternion, Math.min(1, dt * 6));
      const trail = camera.position.distanceTo(seat);
      if (trail > LAG_UNITS) camera.position.lerp(seat, 1 - LAG_UNITS / trail);
      const limit = Math.atan(LAG_SCREEN * tan * Math.min(1, camera.aspect));
      const angle = camera.quaternion.angleTo(ship.quaternion);
      if (angle > limit) camera.quaternion.slerp(ship.quaternion, 1 - limit / angle);
    }
    camera.updateMatrixWorld();

    birdGeometry.setDrawRange(0, flock.count);
    birdPositions.needsUpdate = true;
    birdGlow.needsUpdate = true;
    updateRocks();
    updateGate();
    sky.position.copy(camera.position);
    grid.position.set(Math.round(pilot.x / GRID_STEP) * GRID_STEP, GRID_Y, Math.round(pilot.z / GRID_STEP) * GRID_STEP);
    renderer.render(scene, camera);
  }

  /** A world point in the camera's frame (x right, y up, ahead is −z), into `out`. */
  function toCamera(x, y, z, out) {
    spot.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    out.x = spot.x; out.y = spot.y; out.z = spot.z;
    return out;
  }

  function resize(width, tall, pixelRatio = 1) {
    camera.aspect = width / tall;
    camera.updateProjectionMatrix();
    height = tall; pixels = pixelRatio;
  }

  /** Release every geometry and material the view created, including the ship's own. */
  function dispose() {
    const released = new Set();
    scene.traverse(object => {
      if (object.geometry) released.add(object.geometry);
      for (const material of [].concat(object.material || [])) released.add(material);
      if (object.isInstancedMesh) object.dispose();
    });
    for (const resource of released) resource.dispose();
    scene.clear();
  }

  return { scene, camera, ship, body, render, resize, toCamera, dispose };
}

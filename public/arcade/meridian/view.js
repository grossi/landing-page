// MERIDIAN's picture of a game. Everything here is allocated once: runs, retries
// and sectors only rewrite the same buffers, and `dispose` releases all of it.
import { TUNE } from './game.js';
import { CX, CZ, LANES } from './world.js';

/** Terrain grid: columns across, rows along the track, rows kept behind the ship. */
const COLS = 64, ROWS = 66, BACK = 4;
/** Tower rows and gates on screen at once, with room to spare. */
const ROW_POOL = 14, GATE_POOL = 12;
const VIEW_AHEAD = 440, VIEW_BEHIND = 30;
/** The chase camera sits this far behind and above the ship. */
const CAMERA_BACK = 16, CAMERA_UP = 5.2;

/**
 * @param {{ THREE: typeof import('three'),
 *   createShipBody: (three: typeof import('three')) => import('three').Group,
 *   game: ReturnType<typeof import('./game.js').createGame>, aspect: number }} options
 */
export function createView({ THREE, createShipBody, game, aspect }) {
  const { world } = game;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 120, 400);
  const camera = new THREE.PerspectiveCamera(62, aspect, 0.5, 1200);
  camera.position.set(0, game.y + CAMERA_UP, CAMERA_BACK);

  // ---- terrain: one grid whose rows are the track's lattice rows ----
  const W1 = COLS + 1;
  const positions = new Float32Array(W1 * (ROWS + 1) * 3);
  const indices = [];
  for (let r = 0; r <= ROWS; r++) {
    for (let i = 0; i <= COLS; i++) {
      const at = (r * W1 + i) * 3;
      positions[at] = (i - COLS / 2) * CX;
      positions[at + 2] = -r * CZ;
      if (r < ROWS && i < COLS) {
        // Split each cell on the same diagonal the collision surface uses.
        const a = r * W1 + i, b = a + 1, c = a + W1, e = c + 1;
        indices.push(a, c, b, b, c, e);
      }
    }
  }
  const terrainGeometry = new THREE.BufferGeometry();
  const terrainHeights = new THREE.BufferAttribute(positions, 3);
  terrainHeights.setUsage(THREE.DynamicDrawUsage);
  terrainGeometry.setAttribute('position', terrainHeights);
  terrainGeometry.setIndex(indices);
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshBasicMaterial({
    color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3,
  }));
  terrain.frustumCulled = false;
  scene.add(terrain);
  let baseRow = NaN, epoch = NaN;

  function sampleRow(r) {
    const d = (baseRow + r) * CZ;
    for (let i = 0; i <= COLS; i++) {
      positions[(r * W1 + i) * 3 + 1] = world.surface((i - COLS / 2) * CX, d, game.time);
    }
  }
  function updateTerrain() {
    const base = Math.floor(game.dist / CZ) - BACK;
    const advance = base - baseRow;
    let changed = false;
    if (epoch !== world.epoch || !(advance >= 0 && advance <= ROWS)) {
      baseRow = base; epoch = world.epoch;
      for (let r = 0; r <= ROWS; r++) sampleRow(r);
      changed = true;
    } else if (advance > 0) {
      // Slide the rows already sampled toward the ship; sample only the new far rows.
      for (let at = 1, end = (ROWS + 1 - advance) * W1 * 3; at < end; at += 3) {
        positions[at] = positions[at + advance * W1 * 3];
      }
      baseRow = base;
      for (let r = ROWS + 1 - advance; r <= ROWS; r++) sampleRow(r);
      changed = true;
    }
    // The sea moves: its rows are resampled every frame, the land's never.
    for (let r = 0; r <= ROWS; r++) {
      if (world.animated((baseRow + r) * CZ)) { sampleRow(r); changed = true; }
    }
    if (changed) terrainHeights.needsUpdate = true;
    terrain.position.z = game.dist - baseRow * CZ;
  }

  // ---- sky: stars and the scanline sun, both at infinity ----
  const sky = new THREE.Group();
  {
    const count = 350, stars = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, radius = 600 + Math.random() * 200;
      stars[i * 3] = Math.cos(angle) * radius;
      stars[i * 3 + 1] = 30 + Math.random() * 380;
      stars[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    sky.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.4, transparent: true, opacity: 0.5, fog: false,
    })));
    const sun = [];
    for (const radius of [34, 29]) {
      for (let a = 0; a < 64; a++) {
        const from = a / 64 * Math.PI * 2, to = (a + 1) / 64 * Math.PI * 2;
        sun.push(Math.cos(from) * radius, Math.sin(from) * radius, 0, Math.cos(to) * radius, Math.sin(to) * radius, 0);
      }
    }
    for (let i = 0; i < 5; i++) {
      const y = -5 - i * 5.2, half = Math.sqrt(34 * 34 - y * y);
      sun.push(-half, y, 0, half, y, 0);
    }
    const disk = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(sun, 3)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, fog: false }));
    disk.position.set(-150, 78, -640);
    sky.add(disk);
  }
  scene.add(sky);

  // ---- towers: black solids with white edges, one batch pair per city row ----
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const boxEdges = new THREE.EdgesGeometry(boxGeometry);
  const faceMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
  const edgeCount = boxEdges.attributes.position.count;
  const rowSlots = [];
  for (let i = 0; i < ROW_POOL; i++) {
    const group = new THREE.Group();
    const faces = new THREE.InstancedMesh(boxGeometry, faceMaterial, LANES);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LANES * edgeCount * 3), 3));
    const lines = new THREE.LineSegments(lineGeometry, edgeMaterial);
    // Rows are placed by hand and always near the ship: skip per-row bounds.
    faces.frustumCulled = lines.frustumCulled = false;
    group.add(faces, lines);
    group.visible = false;
    scene.add(group);
    rowSlots.push({ group, faces, lines, row: null, epoch: NaN, used: false });
  }
  const instance = new THREE.Object3D();
  function fillRow(slot, row) {
    const edges = boxEdges.attributes.position, out = slot.lines.geometry.attributes.position;
    let vertex = 0;
    row.towers.forEach((tower, index) => {
      instance.position.set(tower.x, tower.h / 2, 0);
      instance.scale.set(tower.w, tower.h, tower.depth);
      instance.updateMatrix();
      slot.faces.setMatrixAt(index, instance.matrix);
      for (let i = 0; i < edgeCount; i++) {
        out.setXYZ(vertex++, edges.getX(i) * tower.w + tower.x,
          edges.getY(i) * tower.h + tower.h / 2, edges.getZ(i) * tower.depth);
      }
    });
    slot.faces.count = row.towers.length;
    slot.faces.instanceMatrix.needsUpdate = true;
    slot.lines.geometry.setDrawRange(0, vertex);
    out.needsUpdate = true;
    slot.row = row; slot.epoch = world.epoch;
  }
  const visibleRows = [];
  function updateTowers() {
    for (const slot of rowSlots) slot.used = false;
    const middle = game.dist + (VIEW_AHEAD - VIEW_BEHIND) / 2;
    for (const row of world.rowsNear(middle, (VIEW_AHEAD + VIEW_BEHIND) / 2, visibleRows)) {
      const slot = rowSlots[row.k % ROW_POOL];
      if (slot.used) continue; // two cities never share the view; never draw one slot twice
      if (slot.row !== row || slot.epoch !== world.epoch) fillRow(slot, row);
      slot.used = true;
      slot.group.position.z = game.dist - row.d;
    }
    for (const slot of rowSlots) slot.group.visible = slot.used;
  }

  // ---- gates ----
  const gateGeometry = new THREE.TorusGeometry(TUNE.GATE_R, 0.22, 6, 32);
  const gateMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const spentMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 });
  const gateSlots = [];
  for (let i = 0; i < GATE_POOL; i++) {
    const mesh = new THREE.Mesh(gateGeometry, gateMaterial);
    mesh.visible = false;
    scene.add(mesh);
    gateSlots.push(mesh);
  }
  function updateGates() {
    for (const mesh of gateSlots) mesh.visible = false;
    for (const gate of game.gates) {
      const z = game.dist - gate.d;
      if (z < -VIEW_AHEAD || z > VIEW_BEHIND) continue;
      // A threaded gate is gone at once: it is at the camera, and the HUD pays out.
      if (gate.state === 1) continue;
      const mesh = gateSlots[gate.id % GATE_POOL];
      mesh.visible = true;
      mesh.material = gate.state === 0 ? gateMaterial : spentMaterial;
      mesh.position.set(gate.x, gate.y, z);
      mesh.rotation.z = gate.id + game.time * 0.6;
    }
  }

  // ---- ship ----
  const ship = createShipBody(THREE);
  scene.add(ship);

  function render(renderer, dt) {
    updateTerrain();
    updateTowers();
    updateGates();
    ship.position.set(game.x, game.y, 0);
    // The same bank at any sideways speed in a run; the title glide's own motion
    // does not depend on the dial, so neither does its bank.
    ship.rotation.z = -game.vx / (game.state === 'menu' ? TUNE.VX : game.vxMax) * 0.67;
    ship.rotation.x = game.vy * 0.006;
    const ease = rate => Math.min(1, dt * rate);
    camera.position.x += (game.x - camera.position.x) * ease(5);
    camera.position.y += (game.y + CAMERA_UP - camera.position.y) * ease(4.5);
    // The camera trails the ship, but never so far that the ship nears the edge
    // of the screen: on an upright phone the view is only a few units wide.
    const halfHeight = Math.tan(camera.fov * Math.PI / 360) * CAMERA_BACK;
    const slackX = halfHeight * camera.aspect * 0.6, slackY = halfHeight * 0.45;
    camera.position.x = Math.max(game.x - slackX, Math.min(game.x + slackX, camera.position.x));
    camera.position.y = Math.max(game.y + CAMERA_UP - slackY, Math.min(game.y + CAMERA_UP + slackY, camera.position.y));
    // A phone held upright sees a narrow slice: widen it. Speed opens it further.
    const fov = (camera.aspect < 1 ? 80 : 62) + (game.speed - TUNE.SPEED0) * 0.1;
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.lookAt(game.x, game.y + 0.5, -40);
    sky.position.x = camera.position.x;
    renderer.render(scene, camera);
  }

  function resize(width, height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  /** Release every geometry and material the view created, including the ship's own. */
  function dispose() {
    const released = new Set([gateMaterial, spentMaterial, boxEdges]);
    scene.traverse(object => {
      if (object.geometry) released.add(object.geometry);
      for (const material of [].concat(object.material || [])) released.add(material);
      if (object.isInstancedMesh) object.dispose();
    });
    for (const resource of released) resource.dispose();
    scene.clear();
  }

  return { scene, camera, render, resize, dispose };
}

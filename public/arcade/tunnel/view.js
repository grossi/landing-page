// HYPERTUNNEL's picture of a game. The cage, the ring slots and the ship are
// allocated once. A ring's drawing belongs to its section's gaps: it is built
// when rings with those gaps come into view, shared by all of them, and
// disposed when the last one has gone. `dispose` releases everything.
import { BROKEN, TUNE } from './game.js';
import { SHIP, TAU, gapAngle, wrap } from './world.js';

/** The tunnel wall, the circle the ship rides, and the inner edge of a ring's wall. */
const TUNNEL_R = 6, LANE_R = 4.6, WALL_IN = 3.3;
/** The ship's plane; the camera sits on the tunnel's axis at the origin. A long
 *  lens from well behind the ship: the next ring is read while it is still far. */
export const SHIP_Z = -16;
const FOV = 55;
/** Guide circles: this many, this far apart. */
const HOOPS = 36, HOOP_GAP = 8;
/** Rings on screen at once, with room to spare. */
export const RING_POOL = 8;
/** One wall segment per this much arc. */
const ARC_STEP = TAU / 48;
/** How fast the camera rolls after the ship (1/s): the ship swings out of a turn and settles. */
const FOLLOW = 6;

/**
 * @param {{ THREE: typeof import('three'),
 *   createShipBody: (three: typeof import('three')) => import('three').Group,
 *   game: ReturnType<typeof import('./game.js').createGame>, aspect: number }} options
 */
export function createView({ THREE, createShipBody, game, aspect }) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x000000, 40, 230);
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 320);
  const geometry = positions => {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return result;
  };
  const point = (out, angle, radius, z = 0) => out.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);

  // ---- the cage: guide circles that scroll, and rails that do not ----
  const hoops = [], rails = [];
  for (let i = 0; i < HOOPS; i++) {
    for (let k = 0; k < 48; k++) {
      point(hoops, k / 48 * TAU, TUNNEL_R, 4 - i * HOOP_GAP);
      point(hoops, (k + 1) / 48 * TAU, TUNNEL_R, 4 - i * HOOP_GAP);
    }
  }
  // The rails start just ahead of the camera: a line with an end behind the
  // lens is dropped whole by some renderers.
  for (let i = 0; i < 12; i++) {
    point(rails, i / 12 * TAU, TUNNEL_R, -0.5);
    point(rails, i / 12 * TAU, TUNNEL_R, 4 - HOOPS * HOOP_GAP);
  }
  const cageMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
  const tunnel = new THREE.LineSegments(geometry(hoops), cageMaterial);
  const track = new THREE.LineSegments(geometry(rails), cageMaterial);
  tunnel.frustumCulled = track.frustumCulled = false;
  scene.add(tunnel, track);

  // ---- rings: black walls with white edges, a slot each ----
  const wallMaterial = new THREE.MeshBasicMaterial({
    color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  // Every slot starts on an empty drawing of the view's own, and goes back to
  // it when its drawing is retired: no slot ever holds a disposed one.
  const blank = { walls: geometry([]), edges: geometry([]) };
  const slots = [];
  for (let i = 0; i < RING_POOL; i++) {
    const group = new THREE.Group();
    const walls = new THREE.Mesh(blank.walls, wallMaterial);
    const edges = new THREE.LineSegments(blank.edges, edgeMaterial);
    // Rings are placed by hand and always in the tunnel ahead: skip their bounds.
    walls.frustumCulled = edges.frustumCulled = false;
    group.add(walls, edges);
    group.visible = false;
    scene.add(group);
    slots.push({ group, walls, edges, drawing: null });
  }

  /** Drawings in use, by the section key they were built for. */
  const drawings = new Map();
  /** A ring with these gaps, drawn about its own angle: walls, spokes, and the PERFECT ticks. */
  function draw(section) {
    const walls = [], edges = [];
    const gaps = section.gaps.map(gap => ({ from: gap.offset - gap.width / 2, to: gap.offset + gap.width / 2, gap }))
      .sort((a, b) => a.from - b.from);
    gaps.forEach(({ from, to, gap }, index) => {
      // The wall runs from this gap's far edge round to the next gap's near edge.
      const next = gaps[(index + 1) % gaps.length];
      const end = next.from + (index + 1 === gaps.length ? TAU : 0);
      const steps = Math.max(1, Math.ceil((end - to) / ARC_STEP));
      for (let i = 0; i < steps; i++) {
        const a = to + (end - to) * i / steps, b = to + (end - to) * (i + 1) / steps;
        point(walls, a, WALL_IN); point(walls, a, TUNNEL_R); point(walls, b, TUNNEL_R);
        point(walls, a, WALL_IN); point(walls, b, TUNNEL_R); point(walls, b, WALL_IN);
        point(edges, a, WALL_IN); point(edges, b, WALL_IN);
        point(edges, a, TUNNEL_R); point(edges, b, TUNNEL_R);
        // Spokes: they make a wall read as solid, and a rotor's turn readable from far off.
        point(edges, a, WALL_IN); point(edges, a, TUNNEL_R);
      }
      point(edges, end, WALL_IN); point(edges, end, TUNNEL_R);
      // Across the gap: the rim, and a tick at each end of the PERFECT zone.
      const rim = Math.max(1, Math.ceil((to - from) / ARC_STEP));
      for (let i = 0; i < rim; i++) {
        point(edges, from + (to - from) * i / rim, TUNNEL_R);
        point(edges, from + (to - from) * (i + 1) / rim, TUNNEL_R);
      }
      for (const side of [-1, 1]) {
        point(edges, gap.offset + side * gap.perfect, TUNNEL_R);
        point(edges, gap.offset + side * gap.perfect, TUNNEL_R - 1);
      }
    });
    return { walls: geometry(walls), edges: geometry(edges), used: true };
  }

  function updateRings() {
    for (const slot of slots) slot.group.visible = false;
    for (const drawing of drawings.values()) drawing.used = false;
    for (const ring of game.rings) {
      const ahead = ring.d - game.dist;
      if (ahead > TUNE.AHEAD) break;
      // A ring the shield broke is gone at once; the rest fly past the camera.
      if (ahead < SHIP_Z - 2 || ring.state === BROKEN) continue;
      const slot = slots[ring.id % RING_POOL];
      if (slot.group.visible) continue; // never draw one slot twice
      let drawing = drawings.get(ring.section.key);
      if (!drawing) drawings.set(ring.section.key, drawing = draw(ring.section));
      drawing.used = true;
      if (slot.drawing !== drawing) {
        slot.drawing = drawing;
        slot.walls.geometry = drawing.walls; slot.edges.geometry = drawing.edges;
      }
      slot.group.visible = true;
      slot.group.position.z = SHIP_Z - ahead;
      slot.group.rotation.z = gapAngle(ring, NO_OFFSET, game.time);
    }
    // Retire the drawings no ring in view uses any more.
    for (const [key, drawing] of drawings) {
      if (drawing.used) continue;
      for (const slot of slots) {
        if (slot.drawing !== drawing) continue;
        slot.drawing = null;
        slot.walls.geometry = blank.walls; slot.edges.geometry = blank.edges;
      }
      drawing.walls.dispose(); drawing.edges.dispose();
      drawings.delete(key);
    }
  }
  const NO_OFFSET = { offset: 0 };

  // ---- ship: the group is its place on the wall, the body banks inside it ----
  const ship = new THREE.Group();
  const body = createShipBody(THREE);
  // The hull is drawn as wide as the rules say it is: its wingtips reach
  // SHIP.HULL either side of its centre, so a ship seen to clear a wall does.
  const span = new THREE.Box3().setFromObject(body);
  body.scale.setScalar(Math.tan(SHIP.HULL) * LANE_R / Math.max(span.max.x, -span.min.x));
  ship.add(body);
  const halo = [];
  for (let k = 0; k < 40; k++) {
    point(halo, k / 40 * TAU, 1); point(halo, (k + 1) / 40 * TAU, 1);
  }
  const shield = new THREE.LineSegments(geometry(halo), new THREE.LineBasicMaterial({ color: 0xffffff }));
  shield.visible = false;
  ship.add(shield);
  scene.add(ship);

  const view = {
    scene, camera, ship, body, shield, slots,
    /** True while keys or thumbs steer: the camera rolls after the ship, so right
     *  is always right. False under the mouse: the pointer and the ring must stay
     *  lined up, so the camera stays level. */
    follow: true,
    render, resize, dispose,
    /** Ring drawings alive right now. */
    get drawings() { return drawings.size; },
  };
  let roll = game.angle + Math.PI / 2;
  resize(aspect, 1);

  function render(renderer, dt) {
    tunnel.position.z = game.dist % HOOP_GAP;
    updateRings();
    ship.position.set(Math.cos(game.angle) * LANE_R, Math.sin(game.angle) * LANE_R, SHIP_Z);
    ship.rotation.z = game.angle + Math.PI / 2;
    body.rotation.z = -game.spin * 0.15;
    shield.visible = game.shield;
    shield.scale.setScalar(1 + Math.sin(game.time * 9) * 0.04);
    const level = view.follow ? game.angle + Math.PI / 2 : 0;
    roll += wrap(level - roll) * Math.min(1, dt * FOLLOW);
    camera.rotation.z = roll;
    renderer.render(scene, camera);
  }

  function resize(width, height) {
    camera.aspect = width / height;
    // A phone held upright sees a narrow slice: open the lens until the whole
    // tunnel mouth fits across the screen.
    const across = Math.atan(TUNNEL_R / -SHIP_Z / camera.aspect) * 360 / Math.PI;
    camera.fov = Math.min(100, Math.max(FOV, across));
    camera.updateProjectionMatrix();
  }

  /** Release every geometry and material the view created, including the ship's own. */
  function dispose() {
    const released = new Set([wallMaterial, edgeMaterial, blank.walls, blank.edges]);
    for (const drawing of drawings.values()) released.add(drawing.walls).add(drawing.edges);
    drawings.clear();
    scene.traverse(object => {
      if (object.geometry) released.add(object.geometry);
      for (const material of [].concat(object.material || [])) released.add(material);
    });
    for (const resource of released) resource.dispose();
    scene.clear();
  }

  return view;
}

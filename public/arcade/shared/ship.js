/**
 * Shared terminal interceptor. Local forward is -Z, up is +Y.
 * Inject THREE so the app and standalone games use their own renderer version.
 * All surfaces / outlines / panel seams / engine apertures are batched: four
 * draw calls, no textures, lighting, loaders, or per-frame allocations.
 */
export function createShipBody(THREE) {
  const body = new THREE.Group();
  body.name = 'terminal-interceptor';
  const faces = [],
    edges = [],
    panels = [],
    engines = [];

  function line(target, a, b) {
    target.push(...a, ...b);
  }
  function loop(target, points) {
    points.forEach((p, i) => line(target, p, points[(i + 1) % points.length]));
  }
  function face(points) {
    for (let i = 1; i < points.length - 1; i++)
      faces.push(...points[0], ...points[i], ...points[i + 1]);
  }
  function loft(rings) {
    face([...rings[0]].reverse());
    face(rings[rings.length - 1]);
    rings.forEach((ring) => loop(edges, ring));
    for (let r = 1; r < rings.length; r++) {
      rings[r].forEach((p, i) => {
        const j = (i + 1) % rings[r].length;
        face([rings[r - 1][i], rings[r - 1][j], rings[r][j], p]);
        line(edges, rings[r - 1][i], p);
      });
    }
  }

  // Chined fuselage: a long needle nose, broad shoulders, and a tapered stern.
  const section = (z, w, top, bottom) => [
    [0, top, z],
    [w, 0, z],
    [0, bottom, z],
    [-w, 0, z],
  ];
  loft([
    section(-2.25, 0.015, 0.025, -0.025),
    section(-0.55, 0.46, 0.3, -0.24),
    section(0.95, 0.4, 0.23, -0.2),
    section(1.3, 0.25, 0.12, -0.12),
  ]);

  // Raised, faceted canopy. The frame stays legible in the low chase view.
  loft([
    [
      [-0.18, 0.23, -1.0],
      [0, 0.39, -1.0],
      [0.18, 0.23, -1.0],
    ],
    [
      [-0.26, 0.27, -0.3],
      [0, 0.64, -0.3],
      [0.26, 0.27, -0.3],
    ],
    [
      [-0.23, 0.24, 0.26],
      [0, 0.48, 0.26],
      [0.23, 0.24, 0.26],
    ],
  ]);

  for (const side of [-1, 1]) {
    const mirror = (points) => points.map(([x, y, z]) => [x * side, y, z]);
    // Swept, clipped delta wings with real thickness and a recessed panel seam.
    const wing = mirror([
      [0.37, 0.025, -1.12],
      [2.15, -0.06, 1.03],
      [1.8, -0.06, 1.24],
      [0.4, 0.025, 0.72],
    ]);
    loft([wing, wing.map(([x, y, z]) => [x, y - 0.11, z])]);
    const seam = mirror([
      [0.61, 0.023, -0.62],
      [1.84, -0.037, 0.99],
      [1.27, -0.012, 0.78],
    ]);
    for (let i = 1; i < seam.length; i++) line(panels, seam[i - 1], seam[i]);

    // Twin hexagonal engine nacelles; the open white exhausts anchor the rear.
    const ring = (z, radius) =>
      Array.from({ length: 6 }, (_, i) => {
        const angle = (i * Math.PI) / 3;
        return [
          side * (0.86 + Math.cos(angle) * radius),
          Math.sin(angle) * radius,
          z,
        ];
      });
    loft([
      ring(-0.23, 0.2),
      ring(0.25, 0.29),
      ring(1.34, 0.29),
      ring(1.55, 0.23),
    ]);
    loop(engines, ring(1.56, 0.175));
    line(engines, [side * 0.75, 0, 1.565], [side * 0.97, 0, 1.565]);

    // Canted tail fins and three short radiator slits on each nacelle.
    const fin = mirror([
      [0.88, 0.23, 0.25],
      [1.11, 0.72, 0.94],
      [1.13, 0.25, 1.3],
    ]);
    loft([fin, fin.map(([x, y, z]) => [x + side * 0.045, y, z])]);
    for (let z = 0.5; z < 0.95; z += 0.16) {
      line(panels, [side * 0.73, 0.256, z], [side * 0.99, 0.256, z]);
    }
  }

  function geometry(positions) {
    const result = new THREE.BufferGeometry();
    result.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    return result;
  }
  const hull = new THREE.Mesh(
    geometry(faces),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    })
  );
  hull.name = 'hull';
  body.add(hull);
  for (const [name, positions, color] of [
    ['outline', edges, 0xd9d9d9],
    ['panels', panels, 0x707070],
    ['engines', engines, 0xffffff],
  ]) {
    const lines = new THREE.LineSegments(
      geometry(positions),
      new THREE.LineBasicMaterial({ color })
    );
    lines.name = name;
    body.add(lines);
  }
  return body;
}

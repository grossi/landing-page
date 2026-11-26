// The three.js demos that live on this site, shown as the "Experiments"
// section of the projects page.

export interface Demo {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  controls: string;
  kind: 'game' | 'simulation';
  /** Site route instead of the static /arcade/<slug>/ build. */
  route?: string;
  featured?: boolean;
}

// All prototypes are self-contained HTML files served from public/arcade/;
// EPHEMERIS graduated to a real page with three.js bundled by Vite.
export const demos: Demo[] = [
  {
    slug: 'ephemeris',
    title: 'EPHEMERIS',
    tagline: 'solar-system drifter',
    description:
      'Drift through a procedurally generated solar system — seven named planets with rings and moons, an asteroid belt, and a comet dragging its trail. New system every visit.',
    controls: 'mouse steers · hold = burn',
    kind: 'simulation',
    route: '/ephemeris',
    featured: true,
  },
  {
    slug: 'meridian',
    title: 'MERIDIAN',
    tagline: 'endless landscape glider',
    description:
      'Auto-gliding flight over infinite terrain that keeps becoming somewhere else — ranges, dunes, an animated sea, crystal shards — under a scanline sun.',
    controls: 'mouse steers',
    kind: 'simulation',
  },
  {
    slug: 'murmur',
    title: 'MURMUR',
    tagline: 'interactive murmuration',
    description:
      'A flock of 1,100 boids swirls and breathes around a wander point. Fly into the cloud and it scatters off your hull, then reforms behind you.',
    controls: 'mouse steers · hold = boost',
    kind: 'simulation',
  },
  {
    slug: 'horizon',
    title: 'OPEN HORIZON',
    tagline: 'terrain-skimming gate runner',
    description:
      'Skim a procedural wireframe landscape and thread the floating gates without clipping a ridge. The mountains never repeat and the speed never stops climbing.',
    controls: 'mouse or arrows',
    kind: 'game',
  },
  {
    slug: 'drift',
    title: 'DRIFT BELT',
    tagline: '360° free-flight beacon chase',
    description:
      'True open space: pitch and yaw anywhere with momentum drift. Chase pulsing beacons through an endless asteroid belt before the clock runs out.',
    controls: 'mouse steers · hold = boost',
    kind: 'game',
  },
  {
    slug: 'city',
    title: 'GRID CITY',
    tagline: 'street-level city run',
    description:
      'Weave between black monolith towers over a glowing street grid. Flying low between the buildings pays ×3 — climbing above them is the escape hatch.',
    controls: 'mouse or arrows',
    kind: 'game',
  },
  {
    slug: 'tunnel',
    title: 'HYPERTUNNEL',
    tagline: 'endless tunnel dodger',
    description:
      'Ride the wall of a wireframe tunnel and steer through the gaps in incoming rings while the speed ramps and the camera rolls with you.',
    controls: 'arrows / A-D',
    kind: 'game',
  },
  {
    slug: 'asteroids',
    title: 'VOID FIELD',
    tagline: '3D asteroids',
    description:
      'Classic Asteroids on a tilted plane, Vectrex style. Rotate, thrust, fire — icosahedron rocks split twice and the world wraps at the frame edge.',
    controls: 'arrows + space',
    kind: 'game',
  },
  {
    slug: 'stack',
    title: 'MONOSTACK',
    tagline: 'one-button tower',
    description:
      'Drop the sliding block; the overhang gets sliced off and tumbles away. Perfect drops chain a combo while the grayscale tower climbs.',
    controls: 'click / space',
    kind: 'game',
  },
];

/** Where a demo opens: its site route, or its static build under public/arcade/. */
export const demoHref = (demo: Demo): string => demo.route ?? `/arcade/${demo.slug}/index.html`;

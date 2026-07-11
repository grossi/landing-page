import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import PageLayout from 'components/layout/PageLayout';

interface Demo {
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
const demos: Demo[] = [
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

const CardShell = ({ demo }: { demo: Demo }) => (
  <Flex
    direction="column"
    height="100%"
    p={5}
    borderWidth="1px"
    borderColor={{ base: 'gray.300', _dark: 'gray.700' }}
    bg={{ base: 'white', _dark: 'black' }}
    transition="border-color 0.15s ease, transform 0.15s ease"
    _hover={{
      borderColor: { base: 'gray.900', _dark: 'white' },
      transform: 'translateY(-2px)',
    }}
  >
    <Flex align="baseline" justify="space-between" gap={2}>
      <Heading as="h3" size="md" fontFamily="mono" letterSpacing="0.15em">
        {demo.title}
      </Heading>
      <Text
        fontSize="xs"
        fontFamily="mono"
        letterSpacing="0.1em"
        color={{ base: 'gray.500', _dark: 'gray.400' }}
        flexShrink={0}
      >
        {demo.featured ? '★ featured' : demo.kind}
      </Text>
    </Flex>
    <Text mt={1} fontSize="sm" fontStyle="italic" color={{ base: 'gray.600', _dark: 'gray.400' }}>
      {demo.tagline}
    </Text>
    <Text mt={3} fontSize="sm" flex="1">
      {demo.description}
    </Text>
    <Flex mt={4} align="center" justify="space-between" fontFamily="mono" fontSize="xs">
      <Text color={{ base: 'gray.500', _dark: 'gray.500' }} letterSpacing="0.08em">
        {demo.controls}
      </Text>
      <Text fontWeight="bold" letterSpacing="0.25em">
        ▶ PLAY
      </Text>
    </Flex>
  </Flex>
);

const Arcade = () => (
  <PageLayout>
    <Heading as="h1" size="2xl" fontFamily="mono" letterSpacing="0.1em">
      ARCADE
    </Heading>
    <Text mt={3} maxW="2xl" color={{ base: 'gray.600', _dark: 'gray.400' }}>
      Nine little three.js experiments in black and white — arcade games and ambient simulations.
      Each one is a single small file; nothing to install, nothing to lose.
    </Text>
    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={5} mt={10}>
      {demos.map((demo) =>
        demo.route ? (
          <RouterLink key={demo.slug} to={demo.route} style={{ textDecoration: 'none', display: 'block' }}>
            <CardShell demo={demo} />
          </RouterLink>
        ) : (
          <Box
            key={demo.slug}
            asChild
            textDecoration="none"
            display="block"
            color="inherit"
          >
            <a href={`/arcade/${demo.slug}/`} target="_blank" rel="noreferrer">
              <CardShell demo={demo} />
            </a>
          </Box>
        ),
      )}
    </SimpleGrid>
  </PageLayout>
);

export default Arcade;

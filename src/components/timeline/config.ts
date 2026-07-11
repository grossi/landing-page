import { TimelineColors, TimelineItem, TimelineParticleConfig } from 'components/timeline/types';

// Chakra conditional tokens resolve per color mode, so no useColorMode needed.
// Black-and-white palette: neutral grays only.
export const timelineColors: TimelineColors = {
  cardBg: { base: 'white', _dark: 'gray.800' },
  borderColor: { base: 'gray.200', _dark: 'gray.700' },
  lineColor: { base: 'gray.300', _dark: 'gray.600' },
  highlightColor: { base: 'gray.900', _dark: 'gray.100' },
};

export const typeColorPalettes: Record<TimelineItem['type'], string> = {
  work: 'gray',
  education: 'gray',
  achievement: 'gray',
};

export const particleConfig: TimelineParticleConfig = {
  icon: {
    count: 20, // Number of particles for icon clicks
    size: 10, // Particle size in pixels
    speed: 100, // Particle travel speed
    duration: 0.8, // Animation duration in seconds
  },
  card: {
    count: 32,
    size: 10,
    speed: 80, // Slower than icons
    duration: 0.8,
  },
};

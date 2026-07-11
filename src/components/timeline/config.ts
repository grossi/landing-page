import { TimelineColors, TimelineItem, TimelineParticleConfig } from 'components/timeline/types';

// Chakra conditional tokens resolve per color mode, so no useColorMode needed.
export const timelineColors: TimelineColors = {
  cardBg: { base: 'white', _dark: 'gray.800' },
  borderColor: { base: 'gray.200', _dark: 'gray.700' },
  lineColor: { base: 'purple.200', _dark: 'purple.700' },
  highlightColor: { base: 'purple.500', _dark: 'purple.400' },
};

export const typeColorPalettes: Record<TimelineItem['type'], string> = {
  work: 'blue',
  education: 'green',
  achievement: 'yellow',
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

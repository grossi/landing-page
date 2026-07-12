import { TimelineColors, TimelineParticleConfig } from 'components/timeline/types';

// Terminal wireframe palette: black surfaces, thin white-alpha strokes.
export const timelineColors: TimelineColors = {
  cardBg: 'black',
  borderColor: 'rgba(255,255,255,0.25)',
  lineColor: 'rgba(255,255,255,0.2)',
  highlightColor: 'white',
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

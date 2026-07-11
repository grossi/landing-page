export interface TimelineItem {
  id: number;
  type: 'work' | 'education' | 'achievement';
  title: string;
  organization: string;
  period: string;
  description: string;
  skills: string[];
  icon: string;
  highlight?: boolean;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
}

export interface ParticleEffectProps {
  particles: Particle[];
  color: ColorToken;
  elementWidth: number;
  elementHeight: number;
  isCircle?: boolean;
  size?: number;
  speed?: number;
  duration?: number;
}

/** A Chakra color value, either plain or conditional on color mode. */
export type ColorToken = string | { base: string; _dark: string };

export interface TimelineColors {
  cardBg: ColorToken;
  borderColor: ColorToken;
  lineColor: ColorToken;
  highlightColor: ColorToken;
}

export interface ParticleConfig {
  count: number;
  size: number;
  speed: number;
  duration: number;
}

export interface TimelineParticleConfig {
  icon: ParticleConfig;
  card: ParticleConfig;
}

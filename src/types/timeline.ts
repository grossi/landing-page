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
  projects?: Array<{
    name: string;
    url: string;
    repo: string;
  }>;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
}

export interface ParticleEffectProps {
  particles: Particle[];
  color: string;
  elementWidth: number;
  elementHeight: number;
  isCircle?: boolean;
  size?: number;
  speed?: number;
  duration?: number;
}

export interface TimelineColors {
  cardBg: string;
  borderColor: string;
  lineColor: string;
  highlightColor: string;
}

export interface AnimationControls {
  start: (animation: any) => Promise<void>;
}

export interface ParticleAnimationHookResult {
  particles: Particle[];
  dimensions: { width: number; height: number };
  handleClick: (e: React.MouseEvent<HTMLDivElement>) => Promise<void>;
  isHovered: boolean;
  setIsHovered: (hovered: boolean) => void;
  controls: any;
}
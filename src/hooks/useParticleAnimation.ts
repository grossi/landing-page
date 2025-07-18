import { useState } from 'react';
import { useAnimation } from 'framer-motion';
import { Particle, ParticleAnimationHookResult } from '../types/timeline';
import { createParticlesAroundBorder, offsetParticles } from '../utils/particleUtils';

interface UseParticleAnimationProps {
  isCircle: boolean;
  offsetX: number;
  offsetY: number;
  scaleAnimation: {
    peak: number;
    hover: number;
  };
  particleCount?: number;
  particleDuration?: number;
}

export const useParticleAnimation = ({
  isCircle,
  offsetX,
  offsetY,
  scaleAnimation,
  particleCount,
  particleDuration = 800
}: UseParticleAnimationProps): ParticleAnimationHookResult => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const controls = useAnimation();

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    
    // Set dimensions for particle effect
    setDimensions({ width: rect.width, height: rect.height });
    
    // Create and position particles
    const newParticles = createParticlesAroundBorder(rect.width, rect.height, isCircle, particleCount);
    const offsettedParticles = offsetParticles(newParticles, offsetX, offsetY);
    setParticles(offsettedParticles);
    
    // Clear particles after animation
    setTimeout(() => setParticles([]), particleDuration);
    
    // Animate scale
    await controls.start({ scale: scaleAnimation.peak });
    await controls.start({ scale: isHovered ? scaleAnimation.hover : 1 });
  };

  return {
    particles,
    dimensions,
    handleClick,
    isHovered,
    setIsHovered,
    controls
  };
};
import React from 'react';
import { Box } from '@chakra-ui/react';
import ParticleEffect from '../atoms/ParticleEffect';
import { Particle } from '../../types/timeline';

interface AnimatedParticleContainerProps {
  particles: Particle[];
  color: string;
  dimensions: { width: number; height: number };
  isCircle: boolean;
  containerStyle?: React.CSSProperties;
  position?: {
    top?: string;
    left?: string;
    right?: string;
    bottom?: string;
    transform?: string;
  };
  particleSize?: number;
  particleSpeed?: number;
  particleDuration?: number;
}

const AnimatedParticleContainer: React.FC<AnimatedParticleContainerProps> = ({
  particles,
  color,
  dimensions,
  isCircle,
  containerStyle,
  position,
  particleSize,
  particleSpeed,
  particleDuration
}) => {
  return (
    <Box
      position="absolute"
      pointerEvents="none"
      overflow="visible"
      zIndex={100}
      style={containerStyle}
      {...position}
    >
      <ParticleEffect 
        particles={particles} 
        color={color} 
        elementWidth={dimensions.width} 
        elementHeight={dimensions.height} 
        isCircle={isCircle}
        size={particleSize}
        speed={particleSpeed}
        duration={particleDuration}
      />
    </Box>
  );
};

export default AnimatedParticleContainer;
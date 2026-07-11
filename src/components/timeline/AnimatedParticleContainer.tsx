import React from 'react';
import { Box } from '@chakra-ui/react';
import ParticleEffect from 'components/timeline/ParticleEffect';
import { Particle, ParticleConfig } from 'components/timeline/types';
import { timelineColors } from 'components/timeline/config';

interface AnimatedParticleContainerProps {
  particles: Particle[];
  dimensions: { width: number; height: number };
  isCircle: boolean;
  config: ParticleConfig;
  containerStyle?: React.CSSProperties;
  position?: {
    top?: string;
    left?: string;
    right?: string;
    bottom?: string;
    transform?: string;
  };
}

const AnimatedParticleContainer: React.FC<AnimatedParticleContainerProps> = ({
  particles,
  dimensions,
  isCircle,
  config,
  containerStyle,
  position
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
        color={timelineColors.highlightColor}
        elementWidth={dimensions.width}
        elementHeight={dimensions.height}
        isCircle={isCircle}
        size={config.size}
        speed={config.speed}
        duration={config.duration}
      />
    </Box>
  );
};

export default AnimatedParticleContainer;

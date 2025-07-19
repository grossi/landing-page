import React, { useMemo } from 'react';
import { Box } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { ParticleEffectProps } from '../../types/timeline';

// Constants for better maintainability
const ICON_CONTAINER_OFFSET = 30;
const CARD_CONTAINER_OFFSET = 20;
const RECT_SPEED_MULTIPLIER = 0.8;
const PARTICLE_Z_INDEX = 100;
const ANIMATION_SCALE_KEYFRAMES = [0, 2, 0];
const ANIMATION_OPACITY_KEYFRAMES = [1, 0.8, 0];

const MotionBox = motion(Box);

const ParticleEffect: React.FC<ParticleEffectProps> = ({ 
  particles, 
  color, 
  elementWidth, 
  elementHeight, 
  isCircle = false,
  size = 10,
  speed = 100,
  duration = 0.8
}) => {
  // Memoize particle calculations to prevent recalculation on every render
  const particleData = useMemo(() => {
    return particles.map((particle) => {
      let normalizedX = 0;
      let normalizedY = 0;
      
      if (isCircle) {
        // For circular elements, calculate direction from center through particle position
        const centerX = elementWidth / 2 + ICON_CONTAINER_OFFSET;
        const centerY = elementHeight / 2 + ICON_CONTAINER_OFFSET;
        const dirX = particle.x - centerX;
        const dirY = particle.y - centerY;
        const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
        normalizedX = magnitude > 0 ? (dirX / magnitude) * speed : 0;
        normalizedY = magnitude > 0 ? (dirY / magnitude) * speed : 0;
      } else {
        // For rectangular elements, calculate outward direction based on particle position
        const centerX = elementWidth / 2 + CARD_CONTAINER_OFFSET;
        const centerY = elementHeight / 2 + CARD_CONTAINER_OFFSET;
        const dirX = particle.x - centerX;
        const dirY = particle.y - centerY;
        const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
        normalizedX = magnitude > 0 ? (dirX / magnitude) * (speed * RECT_SPEED_MULTIPLIER) : 0;
        normalizedY = magnitude > 0 ? (dirY / magnitude) * (speed * RECT_SPEED_MULTIPLIER) : 0;
      }
      
      return {
        ...particle,
        normalizedX,
        normalizedY
      };
    });
  }, [particles, elementWidth, elementHeight, isCircle, speed]);

  return (
    <AnimatePresence>
      {particleData.map((particle) => {
        return (
          <MotionBox
            key={particle.id}
            position="absolute"
            left={`${particle.x}px`}
            top={`${particle.y}px`}
            w={`${size}px`}
            h={`${size}px`}
            bg={color}
            borderRadius="full"
            pointerEvents="none"
            zIndex={PARTICLE_Z_INDEX}
            initial={{ scale: 0, opacity: 1, x: 0, y: 0 }}
            animate={{ 
              scale: ANIMATION_SCALE_KEYFRAMES,
              opacity: ANIMATION_OPACITY_KEYFRAMES,
              x: particle.normalizedX,
              y: particle.normalizedY,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration, ease: "easeOut" }}
            style={{ transform: 'translate(-50%, -50%)' }}
          />
        );
      })}
    </AnimatePresence>
  );
};

// Custom comparison function for React.memo
const arePropsEqual = (
  prevProps: ParticleEffectProps,
  nextProps: ParticleEffectProps
): boolean => {
  // Check if primitive props are equal
  if (
    prevProps.color !== nextProps.color ||
    prevProps.elementWidth !== nextProps.elementWidth ||
    prevProps.elementHeight !== nextProps.elementHeight ||
    prevProps.isCircle !== nextProps.isCircle ||
    prevProps.size !== nextProps.size ||
    prevProps.speed !== nextProps.speed ||
    prevProps.duration !== nextProps.duration
  ) {
    return false;
  }

  // Check if particles array has changed
  if (prevProps.particles.length !== nextProps.particles.length) {
    return false;
  }

  // Deep comparison of particles array
  return prevProps.particles.every((particle, index) => {
    const nextParticle = nextProps.particles[index];
    return (
      particle.id === nextParticle.id &&
      particle.x === nextParticle.x &&
      particle.y === nextParticle.y
    );
  });
};

export default React.memo(ParticleEffect, arePropsEqual);
import React, { useMemo } from 'react';
import { Box } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { ParticleEffectProps } from 'components/timeline/types';

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
  // Memoize particle calculations to prevent recalculation on every render.
  // Particles fly outward from the element center through their spawn point.
  const particleData = useMemo(() => {
    const containerOffset = isCircle ? ICON_CONTAINER_OFFSET : CARD_CONTAINER_OFFSET;
    const effectiveSpeed = isCircle ? speed : speed * RECT_SPEED_MULTIPLIER;
    const centerX = elementWidth / 2 + containerOffset;
    const centerY = elementHeight / 2 + containerOffset;

    return particles.map((particle) => {
      const dirX = particle.x - centerX;
      const dirY = particle.y - centerY;
      const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
      return {
        ...particle,
        normalizedX: magnitude > 0 ? (dirX / magnitude) * effectiveSpeed : 0,
        normalizedY: magnitude > 0 ? (dirY / magnitude) * effectiveSpeed : 0
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

export default React.memo(ParticleEffect);
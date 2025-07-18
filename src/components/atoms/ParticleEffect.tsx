import React from 'react';
import { Box } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { ParticleEffectProps } from '../../types/timeline';

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
  return (
    <AnimatePresence>
      {particles.map((particle) => {
        let normalizedX = 0;
        let normalizedY = 0;
        
        if (isCircle) {
          // For circular elements, calculate direction from center through particle position
          const centerX = elementWidth / 2 + 30; // Add offset for icon container
          const centerY = elementHeight / 2 + 30;
          const dirX = particle.x - centerX;
          const dirY = particle.y - centerY;
          const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
          normalizedX = magnitude > 0 ? (dirX / magnitude) * speed : 0;
          normalizedY = magnitude > 0 ? (dirY / magnitude) * speed : 0;
        } else {
          // For rectangular elements, calculate outward direction based on particle position
          const centerX = elementWidth / 2 + 20; // Add offset for card container
          const centerY = elementHeight / 2 + 20;
          const dirX = particle.x - centerX;
          const dirY = particle.y - centerY;
          const magnitude = Math.sqrt(dirX * dirX + dirY * dirY);
          normalizedX = magnitude > 0 ? (dirX / magnitude) * (speed * 0.8) : 0;
          normalizedY = magnitude > 0 ? (dirY / magnitude) * (speed * 0.8) : 0;
        }
        
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
            zIndex={100}
            initial={{ scale: 0, opacity: 1, x: 0, y: 0 }}
            animate={{ 
              scale: [0, 2, 0],
              opacity: [1, 0.8, 0],
              x: normalizedX,
              y: normalizedY,
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

export default ParticleEffect;
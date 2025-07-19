import { Particle } from '../types/timeline';

/**
 * Creates particles around the border of a circular element
 */
export const createCircularParticles = (width: number, height: number, particleCount: number = 20): Particle[] => {
  const particles: Particle[] = [];
  const radius = width / 2;
  const borderOffset = 5; // Start particles slightly outside the border
  const adjustedRadius = radius + borderOffset;
  
  for (let i = 0; i < particleCount; i++) {
    // Distribute particles evenly around the circle
    const angle = (i / particleCount) * Math.PI * 2;
    particles.push({
      id: Date.now() + i,
      x: radius + adjustedRadius * Math.cos(angle),
      y: radius + adjustedRadius * Math.sin(angle),
    });
  }
  
  return particles;
};

/**
 * Creates particles around the border of a rectangular element
 */
export const createRectangularParticles = (width: number, height: number, particleCount: number = 32): Particle[] => {
  const particles: Particle[] = [];
  const margin = -5; // Start particles outside the border
  const adjustedWidth = width - 2 * margin;
  const adjustedHeight = height - 2 * margin;
  const perimeter = 2 * (adjustedWidth + adjustedHeight);
  const spacing = perimeter / particleCount;
  
  for (let i = 0; i < particleCount; i++) {
    const distance = i * spacing;
    let x, y;
    
    if (distance < adjustedWidth) {
      // Top edge
      x = margin + distance;
      y = margin;
    } else if (distance < adjustedWidth + adjustedHeight) {
      // Right edge
      x = width - margin;
      y = margin + (distance - adjustedWidth);
    } else if (distance < 2 * adjustedWidth + adjustedHeight) {
      // Bottom edge
      x = width - margin - (distance - adjustedWidth - adjustedHeight);
      y = height - margin;
    } else {
      // Left edge
      x = margin;
      y = height - margin - (distance - 2 * adjustedWidth - adjustedHeight);
    }
    
    particles.push({ id: Date.now() + i, x, y });
  }
  
  return particles;
};

/**
 * Creates particles around the border of an element based on its shape
 */
export const createParticlesAroundBorder = (
  width: number, 
  height: number, 
  isCircle: boolean = false,
  particleCount?: number
): Particle[] => {
  return isCircle 
    ? createCircularParticles(width, height, particleCount || 20)
    : createRectangularParticles(width, height, particleCount || 32);
};

/**
 * Applies offset to particles for container positioning
 */
export const offsetParticles = (particles: Particle[], offsetX: number, offsetY: number): Particle[] => {
  return particles.map(p => ({
    ...p,
    x: p.x + offsetX,
    y: p.y + offsetY
  }));
};
import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { TimelineItem as TimelineItemType, TimelineColors } from '../../types/timeline';
import TimelineCard from '../molecules/TimelineCard';
import TimelineIcon from '../atoms/TimelineIcon';
import AnimatedParticleContainer from '../molecules/AnimatedParticleContainer';
import { useParticleAnimation } from '../../hooks/useParticleAnimation';

const MotionBox = motion(Box);

interface TimelineItemProps {
  item: TimelineItemType;
  index: number;
  colors: TimelineColors;
  getColorPalette: (type: string) => string;
  particleConfig?: {
    icon: {
      count: number;
      size: number;
      speed: number;
      duration: number;
    };
    card: {
      count: number;
      size: number;
      speed: number;
      duration: number;
    };
  };
}

const TimelineItem: React.FC<TimelineItemProps> = ({
  item,
  index,
  colors,
  getColorPalette,
  particleConfig
}) => {
  const isLeft = index % 2 === 0;
  
  const { particles, dimensions, handleClick, isHovered, setIsHovered, controls } = useParticleAnimation({
    isCircle: true,
    offsetX: 18,
    offsetY: 18,
    scaleAnimation: { peak: 1.4, hover: 1.2 },
    particleCount: particleConfig?.icon.count,
    particleDuration: particleConfig?.icon.duration ? particleConfig.icon.duration * 1000 : undefined
  });

  return (
    <MotionBox
      key={item.id}
      initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      w="full"
    >
      <Flex
        direction={{ base: 'column', md: 'row' }}
        align="center"
        justify="center"
        position="relative"
      >
        <TimelineCard
          item={item}
          isLeft={isLeft}
          colors={colors}
          getColorPalette={getColorPalette}
          particleConfig={particleConfig?.card}
        />

        <Box
          position={{ base: 'relative', md: 'absolute' }}
          left={{ base: 'auto', md: '50%' }}
          transform={{ base: 'none', md: 'translateX(-50%)' }}
          order={{ base: 0, md: 1 }}
          mb={{ base: 4, md: 0 }}
          overflow="visible"
          zIndex={50}
        >
          <AnimatedParticleContainer
            particles={particles}
            color={colors.highlightColor}
            dimensions={dimensions}
            isCircle={true}
            position={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)"
            }}
            containerStyle={{
              width: "120px",
              height: "120px"
            }}
            particleSize={particleConfig?.icon.size}
            particleSpeed={particleConfig?.icon.speed}
            particleDuration={particleConfig?.icon.duration}
          />
          
          <TimelineIcon
            icon={item.icon}
            isHighlighted={!!item.highlight}
            cardBg={colors.cardBg}
            lineColor={colors.lineColor}
            highlightColor={colors.highlightColor}
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            animate={controls}
          />
        </Box>

        <Box
          display={{ base: 'none', md: 'block' }}
          w="42%"
          order={{ md: isLeft ? 2 : 0 }}
        />
      </Flex>
    </MotionBox>
  );
};

export default TimelineItem;
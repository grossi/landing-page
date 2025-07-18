import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { TimelineItem, TimelineColors } from '../../types/timeline';
import TimelineItemHeader from './TimelineItemHeader';
import SkillsList from './SkillsList';
import AnimatedParticleContainer from './AnimatedParticleContainer';
import { useParticleAnimation } from '../../hooks/useParticleAnimation';

const MotionBox = motion(Box);

interface TimelineCardProps {
  item: TimelineItem;
  isLeft: boolean;
  colors: TimelineColors;
  getColorPalette: (type: string) => string;
  particleConfig?: {
    count: number;
    size: number;
    speed: number;
    duration: number;
  };
}

const TimelineCard: React.FC<TimelineCardProps> = ({
  item,
  isLeft,
  colors,
  getColorPalette,
  particleConfig
}) => {
  const { particles, dimensions, handleClick, isHovered, setIsHovered, controls } = useParticleAnimation({
    isCircle: false,
    offsetX: 20,
    offsetY: 20,
    scaleAnimation: { peak: 1.05, hover: 1.02 },
    particleCount: particleConfig?.count,
    particleDuration: particleConfig?.duration ? particleConfig.duration * 1000 : undefined
  });

  return (
    <Box
      w={{ base: 'full', md: '42%' }}
      pr={{ base: 0, md: isLeft ? 12 : 0 }}
      pl={{ base: 0, md: !isLeft ? 12 : 0 }}
      textAlign={{ base: 'left', md: isLeft ? 'right' : 'left' }}
      order={{ base: 1, md: isLeft ? 0 : 2 }}
      position="relative"
      overflow="visible"
    >
      <AnimatedParticleContainer
        particles={particles}
        color={colors.highlightColor}
        dimensions={dimensions}
        isCircle={false}
        position={{
          top: "-20px",
          left: "-20px",
          right: "-20px",
          bottom: "-20px"
        }}
        particleSize={particleConfig?.size}
        particleSpeed={particleConfig?.speed}
        particleDuration={particleConfig?.duration}
      />
      
      <MotionBox
        bg={colors.cardBg}
        p={6}
        borderRadius="xl"
        borderWidth={1}
        borderColor={item.highlight ? colors.highlightColor : colors.borderColor}
        shadow={item.highlight ? 'lg' : 'md'}
        whileHover={{ scale: 1.02, shadow: 'xl' }}
        transition={{ duration: 0.2 }}
        cursor="pointer"
        onClick={handleClick}
        animate={controls}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        position="relative"
        zIndex={10}
      >
        <TimelineItemHeader
          type={item.type}
          period={item.period}
          title={item.title}
          organization={item.organization}
          isLeft={isLeft}
          highlightColor={colors.highlightColor}
          getColorPalette={getColorPalette}
        />
        
        <Text fontSize="sm" color={{ base: 'gray.600', _dark: 'gray.400' }} mb={4}>
          {item.description}
        </Text>
        
        <SkillsList skills={item.skills} isLeft={isLeft} />
      </MotionBox>
    </Box>
  );
};

export default TimelineCard;
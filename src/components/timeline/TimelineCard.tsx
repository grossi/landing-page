import React from 'react';
import { Box, Text } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { TimelineItem } from 'components/timeline/types';
import { particleConfig, timelineColors } from 'components/timeline/config';
import TimelineItemHeader from 'components/timeline/TimelineItemHeader';
import SkillsList from 'components/timeline/SkillsList';
import AnimatedParticleContainer from 'components/timeline/AnimatedParticleContainer';
import { useParticleAnimation } from 'components/timeline/useParticleAnimation';

const MotionBox = motion(Box);

interface TimelineCardProps {
  item: TimelineItem;
  isLeft: boolean;
}

const TimelineCard: React.FC<TimelineCardProps> = ({ item, isLeft }) => {
  const { particles, dimensions, handleClick, setIsHovered, controls } = useParticleAnimation({
    isCircle: false,
    offsetX: 20,
    offsetY: 20,
    scaleAnimation: { peak: 1.05, hover: 1.02 },
    particleCount: particleConfig.card.count,
    particleDuration: particleConfig.card.duration * 1000
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
        dimensions={dimensions}
        isCircle={false}
        position={{
          top: "-20px",
          left: "-20px",
          right: "-20px",
          bottom: "-20px"
        }}
        config={particleConfig.card}
      />

      <MotionBox
        bg={timelineColors.cardBg}
        p={6}
        borderRadius="xl"
        borderWidth={1}
        borderColor={item.highlight ? timelineColors.highlightColor : timelineColors.borderColor}
        shadow={item.highlight ? 'lg' : 'md'}
        whileHover={{ scale: 1.02, boxShadow: 'var(--chakra-shadows-xl)' }}
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

import React from 'react';
import { Box, VStack } from '@chakra-ui/react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { TimelineItem as TimelineItemType } from 'types/timeline';
import { timelineColors } from 'config/timeline';
import TimelineItem from 'components/timeline/TimelineItem';

const MotionBox = motion(Box);

interface TimelineProps {
  items: TimelineItemType[];
}

const Timeline: React.FC<TimelineProps> = ({ items }) => {
  const { scrollYProgress } = useScroll();
  const lineHeight = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    <Box position="relative" w="full" overflow="visible">
      {/* Background timeline line */}
      <Box
        position="absolute"
        left="50%"
        transform="translateX(-50%)"
        w="2px"
        h="full"
        bg={timelineColors.lineColor}
      />

      {/* Animated progress line */}
      <MotionBox
        position="absolute"
        left="50%"
        transform="translateX(-50%)"
        w="2px"
        bg={timelineColors.highlightColor}
        style={{ height: lineHeight }}
        initial={{ height: '0%' }}
      />

      {/* Timeline items */}
      <VStack gap={12} position="relative" overflow="visible">
        {items.map((item, index) => (
          <TimelineItem key={item.id} item={item} index={index} />
        ))}
      </VStack>
    </Box>
  );
};

export default Timeline;

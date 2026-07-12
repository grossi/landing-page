import React from 'react';
import { Box, VStack } from '@chakra-ui/react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { TimelineItem as TimelineItemType } from 'components/timeline/types';
import { timelineColors } from 'components/timeline/config';
import TimelineItem from 'components/timeline/TimelineItem';

const MotionBox = motion(Box);

interface TimelineProps {
  items: TimelineItemType[];
}

const Timeline: React.FC<TimelineProps> = ({ items }) => {
  const { scrollYProgress } = useScroll();
  const lineHeight = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);

  return (
    // x-axis clipped: below-the-fold items wait at x ±50 for their
    // slide-in, which otherwise widens the page on narrow screens
    <Box position="relative" w="full" overflowX="clip">
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

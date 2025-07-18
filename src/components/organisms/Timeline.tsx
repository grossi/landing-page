import React from 'react';
import { Box, VStack } from '@chakra-ui/react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { TimelineItem as TimelineItemType, TimelineColors } from '../../types/timeline';
import TimelineItem from './TimelineItem';

const MotionBox = motion(Box);

interface TimelineProps {
  items: TimelineItemType[];
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

const Timeline: React.FC<TimelineProps> = ({ items, colors, getColorPalette, particleConfig }) => {
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
        bg={colors.lineColor}
      />
      
      {/* Animated progress line */}
      <MotionBox
        position="absolute"
        left="50%"
        transform="translateX(-50%)"
        w="2px"
        bg={colors.highlightColor}
        style={{ height: lineHeight }}
        initial={{ height: '0%' }}
      />

      {/* Timeline items */}
      <VStack gap={12} position="relative" overflow="visible">
        {items.map((item, index) => (
          <TimelineItem
            key={item.id}
            item={item}
            index={index}
            colors={colors}
            getColorPalette={getColorPalette}
            particleConfig={particleConfig}
          />
        ))}
      </VStack>
    </Box>
  );
};

export default Timeline;
import React from 'react';
import { Badge, HStack, Heading, Text } from '@chakra-ui/react';
import { TimelineItem } from 'components/timeline/types';
import { timelineColors, typeColorPalettes } from 'components/timeline/config';

interface TimelineItemHeaderProps {
  type: TimelineItem['type'];
  period: string;
  title: string;
  organization: string;
  isLeft: boolean;
}

const TimelineItemHeader: React.FC<TimelineItemHeaderProps> = ({
  type,
  period,
  title,
  organization,
  isLeft
}) => {
  return (
    <>
      <HStack
        justify={{ base: 'flex-start', md: isLeft ? 'flex-end' : 'flex-start' }}
        mb={2}
      >
        <Badge colorPalette={typeColorPalettes[type]} size="sm" variant="subtle">
          {type}
        </Badge>
        <Text fontSize="sm" color={{ base: 'gray.600', _dark: 'gray.400' }}>
          {period}
        </Text>
      </HStack>
      <Heading size="md" mb={1} color={{ base: 'gray.800', _dark: 'white' }}>
        {title}
      </Heading>
      <Text
        fontSize="sm"
        fontWeight="semibold"
        color={timelineColors.highlightColor}
        mb={3}
      >
        {organization}
      </Text>
    </>
  );
};

export default TimelineItemHeader;

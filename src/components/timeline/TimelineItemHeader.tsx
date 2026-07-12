import React from 'react';
import { Badge, HStack, Heading, Text } from '@chakra-ui/react';
import { TimelineItem } from 'components/timeline/types';
import { timelineColors } from 'components/timeline/config';

const mono = 'ui-monospace, "SF Mono", Menlo, monospace';

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
        <Badge
          size="sm"
          variant="outline"
          borderRadius={0}
          fontFamily={mono}
          textTransform="uppercase"
          letterSpacing=".14em"
          bg="transparent"
          color="whiteAlpha.800"
          boxShadow="none"
          border="1px solid rgba(255,255,255,0.3)"
        >
          {type}
        </Badge>
        <Text fontFamily={mono} fontSize="xs" letterSpacing=".1em" color="whiteAlpha.600">
          {period}
        </Text>
      </HStack>
      <Heading
        size="sm"
        mb={1}
        fontFamily={mono}
        textTransform="uppercase"
        letterSpacing=".16em"
        color="white"
      >
        {title}
      </Heading>
      <Text
        fontFamily={mono}
        fontSize="xs"
        fontWeight="semibold"
        textTransform="uppercase"
        letterSpacing=".18em"
        color={timelineColors.highlightColor}
        opacity={0.8}
        mb={3}
      >
        {organization}
      </Text>
    </>
  );
};

export default TimelineItemHeader;

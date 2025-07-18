import React from 'react';
import { HStack, Heading, Text } from '@chakra-ui/react';
import SkillBadge from '../atoms/SkillBadge';

interface TimelineItemHeaderProps {
  type: string;
  period: string;
  title: string;
  organization: string;
  isLeft: boolean;
  highlightColor: string;
  getColorPalette: (type: string) => string;
}

const TimelineItemHeader: React.FC<TimelineItemHeaderProps> = ({
  type,
  period,
  title,
  organization,
  isLeft,
  highlightColor,
  getColorPalette
}) => {
  return (
    <>
      <HStack
        justify={{ base: 'flex-start', md: isLeft ? 'flex-end' : 'flex-start' }}
        mb={2}
      >
        <SkillBadge 
          skill={type} 
          colorPalette={getColorPalette(type)} 
          size="sm" 
        />
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
        color={highlightColor}
        mb={3}
      >
        {organization}
      </Text>
    </>
  );
};

export default TimelineItemHeader;
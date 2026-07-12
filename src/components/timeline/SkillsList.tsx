import React from 'react';
import { Badge, HStack } from '@chakra-ui/react';
import { monoFont as mono } from 'config/site';

interface SkillsListProps {
  skills: string[];
  isLeft: boolean;
}

const SkillsList: React.FC<SkillsListProps> = ({ skills, isLeft }) => {
  return (
    <HStack
      wrap="wrap"
      gap={2}
      justify={{ base: 'flex-start', md: isLeft ? 'flex-end' : 'flex-start' }}
    >
      {skills.map((skill) => (
        <Badge
          key={skill}
          size="sm"
          variant="outline"
          borderRadius={0}
          fontFamily={mono}
          textTransform="uppercase"
          letterSpacing=".12em"
          bg="transparent"
          color="whiteAlpha.700"
          boxShadow="none"
          border="1px solid rgba(255,255,255,0.25)"
        >
          {skill}
        </Badge>
      ))}
    </HStack>
  );
};

export default SkillsList;

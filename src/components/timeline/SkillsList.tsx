import React from 'react';
import { Badge, HStack } from '@chakra-ui/react';

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
        <Badge key={skill} size="sm" variant="subtle">
          {skill}
        </Badge>
      ))}
    </HStack>
  );
};

export default SkillsList;

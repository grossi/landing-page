import React from 'react';
import { HStack } from '@chakra-ui/react';
import SkillBadge from '../atoms/SkillBadge';

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
        <SkillBadge 
          key={skill} 
          skill={skill} 
          size="sm" 
          variant="subtle" 
        />
      ))}
    </HStack>
  );
};

export default SkillsList;
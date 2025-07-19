import React from 'react';
import { VStack, Heading, Text } from '@chakra-ui/react';

interface ExperienceHeaderProps {
  title: string;
  subtitle: string;
}

const ExperienceHeader: React.FC<ExperienceHeaderProps> = ({ title, subtitle }) => {
  return (
    <VStack gap={4} textAlign="center">
      <Heading
        size="4xl"
        fontWeight="bold"
        bgGradient="linear(to-r, blue.400, purple.400)"
        bgClip="text"
      >
        {title}
      </Heading>
      <Text fontSize="lg" color={{ base: 'gray.600', _dark: 'gray.400' }} maxW="2xl">
        {subtitle}
      </Text>
    </VStack>
  );
};

export default ExperienceHeader;
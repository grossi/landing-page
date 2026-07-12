import React from 'react';
import { VStack, Heading, Text } from '@chakra-ui/react';

const mono = 'ui-monospace, "SF Mono", Menlo, monospace';

interface ExperienceHeaderProps {
  title: string;
  subtitle?: string;
}

const ExperienceHeader: React.FC<ExperienceHeaderProps> = ({ title, subtitle }) => {
  return (
    <VStack gap={4} textAlign="center">
      <Heading
        size="3xl"
        fontFamily={mono}
        fontWeight="bold"
        textTransform="uppercase"
        letterSpacing=".22em"
        color="white"
      >
        {title}
      </Heading>
      {subtitle && (
        <Text
          fontFamily={mono}
          fontSize="12px"
          textTransform="uppercase"
          letterSpacing=".26em"
          color="white"
          opacity={0.5}
          maxW="2xl"
        >
          {subtitle}
        </Text>
      )}
    </VStack>
  );
};

export default ExperienceHeader;

import * as React from 'react';
import { Box, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react';
import { monoFont as mono } from 'config/site';
import { grey } from 'components/projects/cardStyles';

interface SectionProps {
  /** The section's anchor, e.g. `/projects#studio`. */
  id: string;
  title: string;
  blurb: string;
  count: number;
  children: React.ReactNode;
}

/** One titled group of cards on the projects page. */
const Section = ({ id, title, blurb, count, children }: SectionProps) => (
  // scrollMarginTop keeps the title clear of the sticky header on an anchor jump.
  <Box as="section" id={id} mt={14} scrollMarginTop="88px">
    <Flex
      align="baseline"
      justify="space-between"
      gap={4}
      pb={3}
      borderBottomWidth="1px"
      borderColor={grey.border}
    >
      <Heading
        as="h2"
        size="lg"
        fontFamily={mono}
        fontWeight="bold"
        letterSpacing="0.12em"
        textTransform="uppercase"
      >
        {title}
      </Heading>
      <Text fontSize="xs" fontFamily={mono} letterSpacing="0.1em" color={grey.dim} flexShrink={0}>
        {String(count).padStart(2, '0')}
      </Text>
    </Flex>
    <Text mt={3} maxW="2xl" fontSize="sm" color={grey.text} lineHeight="1.5">
      {blurb}
    </Text>
    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={5} mt={6}>
      {children}
    </SimpleGrid>
  </Box>
);

export default Section;

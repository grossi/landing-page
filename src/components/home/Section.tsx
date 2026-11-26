import * as React from 'react';
import { Box, Grid, Text } from '@chakra-ui/react';
import { motion, useReducedMotion } from 'framer-motion';
import { monoFont } from 'config/site';
import { sections } from 'components/home/content';
import type { SectionId } from 'components/home/content';

/** The site's existing greys, named once for the home sections. */
export const tone = {
  line: 'rgba(255,255,255,.15)',
  border: '#3f3f46',
  dim: '#71717a',
  soft: '#a1a1aa',
} as const;

/** Small spaced-out mono label: section names, tags, link text. */
export const label = {
  fontFamily: monoFont,
  fontSize: '12px',
  letterSpacing: '.22em',
  textTransform: 'uppercase',
} as const;

export const focusRing = {
  outline: '1px solid white',
  outlineOffset: '4px',
} as const;

/**
 * Height of the sticky header, published by Home as a CSS variable (it is
 * taller on a phone, where the menu button sets it).
 */
export const headerHeightVar = 'var(--home-header-h, 61px)';

/** Fades content up the first time it scrolls into view. */
export const Reveal = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
};

/**
 * One numbered band of the page: the label sits in a left rail that sticks
 * under the header on wide screens and stacks above the content on a phone.
 */
const Section = ({ id, children }: { id: SectionId; children: React.ReactNode }) => {
  const index = sections.findIndex((section) => section.id === id);
  const headingId = `${id}-heading`;
  return (
    <Box
      as="section"
      id={id}
      aria-labelledby={headingId}
      borderTop={`1px solid ${tone.line}`}
      px="34px"
      scrollMarginTop={headerHeightVar}
    >
      <Grid
        maxW="1280px"
        mx="auto"
        py={{ base: '56px', md: '96px' }}
        templateColumns={{ base: 'minmax(0, 1fr)', lg: '240px minmax(0, 1fr)' }}
        gap={{ base: '28px', lg: '56px' }}
      >
        <Box
          alignSelf="start"
          position={{ base: 'static', lg: 'sticky' }}
          top={`calc(${headerHeightVar} + 40px)`}
        >
          <Text as="h2" id={headingId} {...label} color="white">
            <Box as="span" color={tone.dim}>
              {String(index + 1).padStart(2, '0')} /{' '}
            </Box>
            {sections[index].label}
          </Text>
        </Box>
        <Box minW={0}>{children}</Box>
      </Grid>
    </Box>
  );
};

export default Section;

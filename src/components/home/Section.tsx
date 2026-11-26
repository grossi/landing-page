import * as React from 'react';
import { Box, Grid, Text } from '@chakra-ui/react';
import { motion, useReducedMotion } from 'framer-motion';
import { monoFont } from 'config/site';
import { homeSections } from 'components/home/sectionNav';
import type { SectionId } from 'components/home/sectionNav';

/**
 * The site's existing greys, named once for the home sections. `soft` is the
 * one for secondary text (8.2:1 on black); the darker greys are for lines.
 */
export const tone = {
  line: 'rgba(255,255,255,.15)',
  border: '#3f3f46',
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

/** The footer's height: the last section is sized to leave exactly this under it. */
export const FOOTER_HEIGHT = '76px';

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
 * scrollMarginTop lands a jump to the section with its top edge (and so its
 * heading) just under the sticky header, not behind it.
 */
interface SectionProps {
  id: SectionId;
  /**
   * Fills what is left of a screen above the footer, content centred. For
   * the last section: without it the page ends before a short closing
   * section can reach the top, and its header entry would scroll to the
   * same place as the one before it.
   */
  fill?: boolean;
  children: React.ReactNode;
}

const Section = ({ id, fill = false, children }: SectionProps) => {
  const index = homeSections.findIndex((section) => section.id === id);
  const headingId = `${id}-heading`;
  return (
    <Box
      as="section"
      id={id}
      aria-labelledby={headingId}
      borderTop={`1px solid ${tone.line}`}
      px="34px"
      scrollMarginTop={headerHeightVar}
      display="flex"
      flexDirection="column"
      justifyContent="center"
      css={
        fill
          ? {
              minHeight: `calc(100vh - ${headerHeightVar} - ${FOOTER_HEIGHT})`,
              '@supports (height: 100svh)': {
                minHeight: `calc(100svh - ${headerHeightVar} - ${FOOTER_HEIGHT})`,
              },
            }
          : undefined
      }
    >
      <Grid
        w="100%"
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
            <Box as="span" color={tone.soft}>
              {String(index + 1).padStart(2, '0')} /{' '}
            </Box>
            {homeSections[index].label}
          </Text>
        </Box>
        <Box minW={0}>{children}</Box>
      </Grid>
    </Box>
  );
};

export default Section;

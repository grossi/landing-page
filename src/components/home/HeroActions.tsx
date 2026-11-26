import * as React from 'react';
import { Box, Flex, Icon, Text, chakra } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { FaGithub, FaLinkedin } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { navSections } from 'components/home/sectionNav';
import type { SectionId } from 'components/home/sectionNav';
import { monoFont, socialLinks } from 'config/site';

// The hero's actions, first shown in mock A ("Signal"). There they opened the
// full pages; here they scroll to the home sections, like the header entries
// they share their labels with.
const ACTIONS: SectionId[] = ['work', 'experience', 'contact'];
const actions = ACTIONS.map((id) => navSections.find((section) => section.id === id)).filter(
  (section) => section !== undefined,
);

// Email is the contact section, so the row lists the three profiles.
export const heroSocialLinks: Array<{ label: string; href: string; icon: React.ElementType }> = [
  { label: 'LINKEDIN', href: socialLinks.linkedin, icon: FaLinkedin },
  { label: 'GITHUB', href: socialLinks.github, icon: FaGithub },
  { label: 'X', href: socialLinks.twitter, icon: FaXTwitter },
];

const buttonBase = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minH: '44px',
  px: '22px',
  fontFamily: monoFont,
  fontSize: '12px',
  fontWeight: 'bold',
  letterSpacing: '.22em',
  whiteSpace: 'nowrap',
  borderWidth: '1px',
  borderRadius: 0,
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'border-color 0.15s ease, background 0.15s ease, color 0.15s ease, transform 0.15s ease',
  _focusVisible: { outline: '1px solid white', outlineOffset: '3px' },
} as const;

const primaryStyle = {
  bg: 'white',
  color: 'black',
  borderColor: 'white',
  _hover: { bg: '#d4d4d8', borderColor: '#d4d4d8', transform: 'translateY(-2px)' },
} as const;

const outlineStyle = {
  bg: 'rgba(0,0,0,.55)',
  color: 'white',
  borderColor: '#3f3f46',
  _hover: { borderColor: 'white', transform: 'translateY(-2px)' },
} as const;

export interface HeroActionsProps {
  onPlay: () => void;
}

/**
 * The hero's action row: where a visitor can go from here, with PLAY as the
 * quiet fourth. The links are anchors and PLAY is a button, which the
 * field's pointer handler already leaves alone, so none of them fires a
 * burn.
 */
const HeroActions = ({ onPlay }: HeroActionsProps) => (
  <Flex direction="column" gap="18px" pointerEvents="auto">
    <Box
      display={{ base: 'grid', md: 'flex' }}
      flexWrap="wrap"
      gridTemplateColumns="1fr 1fr"
      gap="10px"
      alignItems="center"
    >
      {actions.map((section, i) => (
        <Box asChild key={section.id} {...buttonBase} {...(i === 0 ? primaryStyle : outlineStyle)}>
          <RouterLink to={{ pathname: '/', hash: `#${section.id}` }}>{section.nav}</RouterLink>
        </Box>
      ))}
      <chakra.button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          onPlay();
        }}
        {...buttonBase}
        // the quiet one of the four, but still readable with a planet behind it
        bg="rgba(0,0,0,.55)"
        color="#a1a1aa"
        borderColor="#27272a"
        _hover={{ color: 'white', borderColor: '#71717a', transform: 'translateY(-2px)' }}
      >
        ▶ PLAY
      </chakra.button>
    </Box>

    <Flex gap="22px" align="center" wrap="wrap">
      {heroSocialLinks.map(({ label, href, icon }) => (
        <chakra.a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          display="flex"
          alignItems="center"
          gap="8px"
          py="6px"
          fontFamily={monoFont}
          fontSize="11px"
          letterSpacing=".2em"
          color="white"
          textDecoration="none"
          opacity={0.6}
          transition="opacity 0.15s ease"
          _hover={{ opacity: 1 }}
          _focusVisible={{ opacity: 1, outline: '1px solid white', outlineOffset: '3px' }}
        >
          <Icon as={icon} boxSize="13px" />
          <Text as="span">{label}</Text>
        </chakra.a>
      ))}
    </Flex>
  </Flex>
);

export default HeroActions;

import * as React from 'react';
import { Box, Flex, Icon, Text, chakra } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { FaGithub, FaLinkedin } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { monoFont, socialLinks } from 'config/site';
import { heroActions } from 'components/home/content';
import type { HeroAction } from 'components/home/content';
import type { Density } from 'components/home/useFitDensity';

// Email is the CONTACT action above, so the row lists the three profiles.
const socialItems: Array<{ label: string; href: string; icon: React.ElementType }> = [
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

const ActionLink = ({ action }: { action: HeroAction }) => {
  const style = { ...buttonBase, ...(action.primary ? primaryStyle : outlineStyle) };
  if (action.to) {
    return (
      <Box asChild {...style}>
        <RouterLink to={action.to}>{action.label}</RouterLink>
      </Box>
    );
  }
  return (
    <chakra.a href={action.href} {...style}>
      {action.label}
    </chakra.a>
  );
};

export interface HeroActionsProps {
  /** PLAY is only offered from the settled title screen. */
  playEnabled: boolean;
  onPlay: () => void;
  /** From `useFitDensity`: tighter spacing, then no social row. */
  density: Density;
}

/**
 * The hero's action row: where a visitor can go from here. The links are
 * anchors and PLAY is a button, which the field's pointer handler already
 * leaves alone, so none of them fires a burn.
 */
const HeroActions = ({ playEnabled, onPlay, density }: HeroActionsProps) => (
  <Flex direction="column" gap={density >= 1 ? '10px' : '18px'} pointerEvents="auto">
    <Box
      display={density >= 4 ? 'flex' : { base: 'grid', md: 'flex' }}
      flexWrap="wrap"
      gridTemplateColumns="1fr 1fr"
      gap="10px"
      alignItems="center"
    >
      {heroActions.map((action) => (
        <ActionLink key={action.label} action={action} />
      ))}
      <chakra.button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          onPlay();
        }}
        tabIndex={playEnabled ? 0 : -1}
        aria-hidden={!playEnabled}
        {...buttonBase}
        bg="transparent"
        color="#a1a1aa"
        borderColor="#27272a"
        opacity={playEnabled ? 1 : 0}
        pointerEvents={playEnabled ? 'auto' : 'none'}
        _hover={{ color: 'white', borderColor: '#71717a', transform: 'translateY(-2px)' }}
      >
        ▶ PLAY
      </chakra.button>
    </Box>

    <Flex gap="22px" align="center" wrap="wrap" display={density >= 4 ? 'none' : 'flex'}>
      {socialItems.map(({ label, href, icon }) => (
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

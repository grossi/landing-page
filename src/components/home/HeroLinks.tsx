import * as React from 'react';
import { Flex, Icon, Text, chakra } from '@chakra-ui/react';
import { FaGithub, FaLinkedin } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { monoFont, socialLinks } from 'config/site';

// Email is the contact section, so the row lists the three profiles.
const profiles: Array<{ label: string; href: string; icon: React.ElementType }> = [
  { label: 'LINKEDIN', href: socialLinks.linkedin, icon: FaLinkedin },
  { label: 'GITHUB', href: socialLinks.github, icon: FaGithub },
  { label: 'X', href: socialLinks.twitter, icon: FaXTwitter },
];

/**
 * The profile links under the name: all the hero offers besides the page
 * itself. The sections are one scroll away and in the header, so the hero
 * does not repeat them. Anchors are left alone by the field's pointer
 * handler, so pressing one never fires a burn.
 */
const HeroLinks = () => (
  <Flex columnGap={{ base: '20px', md: '28px' }} rowGap="4px" align="center" wrap="wrap" pointerEvents="auto">
    {profiles.map(({ label, href, icon }) => (
      <chakra.a
        key={label}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        display="flex"
        alignItems="center"
        gap="9px"
        py="8px"
        fontFamily={monoFont}
        fontSize="12px"
        letterSpacing=".2em"
        color="white"
        textDecoration="none"
        opacity={0.7}
        transition="opacity 0.15s ease"
        _hover={{ opacity: 1 }}
        _focusVisible={{ opacity: 1, outline: '1px solid white', outlineOffset: '3px' }}
      >
        <Icon as={icon} boxSize="14px" />
        <Text as="span">{label}</Text>
      </chakra.a>
    ))}
  </Flex>
);

export default HeroLinks;

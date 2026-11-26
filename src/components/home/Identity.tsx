import { Box, Flex, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { socialLinks } from 'config/site';
import type { SocialLinks } from 'config/site';
import { focusRing, grey, label, mono } from 'components/home/styles';

const facts: Array<{ key: string; value: string }> = [
  { key: 'Now', value: 'Senior Full Stack Software Engineer, Lazuli, since 2025' },
  { key: 'Studio', value: 'Hoshi Labs, a one-person indie game studio in Japan' },
  { key: 'Stack', value: 'React · Node.js · Go · Google Cloud · Rust · three.js' },
];

const contacts: Array<{ key: keyof SocialLinks; text: string }> = [
  { key: 'email', text: 'Email' },
  { key: 'linkedin', text: 'LinkedIn' },
  { key: 'github', text: 'GitHub' },
  { key: 'twitter', text: 'X' },
];

const linkStyle = {
  ...label,
  color: 'white',
  pb: '2px',
  mr: '20px',
  borderBottom: `1px solid ${grey.border}`,
  transition: 'border-color 0.15s ease',
  _hover: { borderBottomColor: 'white' },
  _focusVisible: focusRing,
} as const;

const Identity = () => (
  <Box as="section" aria-labelledby="identity-heading">
    <Text
      as="h1"
      id="identity-heading"
      {...mono}
      fontSize={{ base: '30px', md: '42px' }}
      fontWeight="bold"
      letterSpacing=".12em"
      lineHeight="1.1"
    >
      GABRIEL ROSSI
    </Text>
    <Text {...label} mt="12px" color={grey.text} letterSpacing=".26em" lineHeight="1.7">
      Senior full stack engineer · Indie game developer
    </Text>

    <Box mt={{ base: '22px', md: '24px' }} maxW="62ch">
      <Text {...mono} fontSize="14px" lineHeight="1.7" opacity={0.85}>
        I build AI solutions at Lazuli with React, Node.js, Go and Google Cloud. Before that I was
        a full stack engineer at Uber, led frontend teams at Accenture and was CTO at TVManager.
      </Text>
      <Text {...mono} mt="12px" fontSize="14px" lineHeight="1.7" opacity={0.85}>
        I also run Hoshi Labs, a one-person indie game studio in Japan. Its roguelike Star Survival
        is out on Google Play, and more games are on the way.
      </Text>
    </Box>

    <Box
      as="dl"
      mt="22px"
      py="12px"
      borderTop={`1px solid ${grey.rule}`}
      borderBottom={`1px solid ${grey.rule}`}
      display="grid"
      gridTemplateColumns="84px 1fr"
      rowGap="7px"
    >
      {facts.map(({ key, value }) => (
        <Box key={key} display="contents">
          <Text as="dt" {...label} color={grey.dim} lineHeight="20px">
            {key}
          </Text>
          <Text as="dd" {...mono} m={0} fontSize="12.5px" lineHeight="20px" color={grey.text}>
            {value}
          </Text>
        </Box>
      ))}
    </Box>

    <Flex as="nav" aria-label="Contact" mt="18px" wrap="wrap" align="baseline" rowGap="12px">
      <Text {...label} color={grey.dim} w="84px" flexShrink={0} whiteSpace="nowrap">
        Contact
      </Text>
      {contacts.map(({ key, text }) => (
        <Box
          key={key}
          asChild
          {...linkStyle}
        >
          <a
            href={socialLinks[key]}
            {...(key === 'email' ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
          >
            {text}
          </a>
        </Box>
      ))}
    </Flex>
    <Flex as="nav" aria-label="More" mt="12px" wrap="wrap" align="baseline" rowGap="12px">
      <Text {...label} color={grey.dim} w="84px" flexShrink={0} whiteSpace="nowrap">
        More
      </Text>
      <Box asChild {...linkStyle}>
        <RouterLink to="/experience">Experience →</RouterLink>
      </Box>
      <Box asChild {...linkStyle}>
        <RouterLink to="/blog">Blog →</RouterLink>
      </Box>
    </Flex>
  </Box>
);

export default Identity;

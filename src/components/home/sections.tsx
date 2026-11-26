import * as React from 'react';
import { Box, Flex, Grid, SimpleGrid, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { formatPostDate } from 'components/post/frontMatter';
import {
  contactLinks,
  currentRole,
  email,
  post,
  projects,
  roles,
  STRIP_ROLES,
} from 'components/home/content';
import type { Project } from 'components/home/content';
import Section, { focusRing, label, Reveal, tone } from 'components/home/Section';
import { monoFont, socialLinks } from 'config/site';

const HOSHI_LABS = 'https://hoshilabs.jp.net/';

/** A spaced mono text link with an arrow: `→` in-site, `↗` leaving it. */
const ArrowLink = ({
  to,
  href,
  children,
}: {
  to?: string;
  href?: string;
  children: React.ReactNode;
}) => {
  const body = (
    <>
      {children} <span aria-hidden>{to ? '→' : '↗'}</span>
    </>
  );
  return (
    <Box
      asChild
      {...label}
      display="inline-block"
      color="white"
      pb="3px"
      borderBottom={`1px solid ${tone.border}`}
      transition="border-color 0.15s ease"
      _hover={{ borderBottomColor: 'white' }}
      _focusVisible={focusRing}
    >
      {to ? (
        <RouterLink to={to}>{body}</RouterLink>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      )}
    </Box>
  );
};

const cardFrame = {
  borderWidth: '1px',
  borderColor: tone.border,
  bg: 'black',
  color: 'white',
  textDecoration: 'none',
  transition: 'border-color 0.15s ease, transform 0.15s ease',
  _hover: { borderColor: 'white', transform: 'translateY(-2px)' },
  _focusVisible: focusRing,
} as const;

// ---- 01 about ----

const Fact = ({ name, children }: { name: string; children: React.ReactNode }) => (
  <Grid
    templateColumns="76px minmax(0, 1fr)"
    gap="14px"
    py="12px"
    borderBottom={`1px solid ${tone.line}`}
    fontFamily={monoFont}
    fontSize="13px"
    lineHeight="1.6"
  >
    <Text as="dt" color={tone.dim} letterSpacing=".18em">
      {name}
    </Text>
    <Box as="dd" m={0}>
      {children}
    </Box>
  </Grid>
);

export const About = () => (
  <Section id="about">
    <Grid
      templateColumns={{ base: 'minmax(0, 1fr)', xl: 'minmax(0, 1fr) 340px' }}
      gap={{ base: '40px', xl: '72px' }}
    >
      <Reveal>
        <Text
          fontFamily={monoFont}
          fontSize={{ base: '18px', md: '24px' }}
          lineHeight="1.5"
          maxW="760px"
        >
          I'm a senior full-stack software engineer at {currentRole.organization}, where I lead
          the development of AI solutions and mentor the team.
        </Text>
        <Flex direction="column" gap="16px" mt="28px" maxW="640px" color={tone.soft} lineHeight="1.7">
          <Text>
            Before that I spent three years at Uber on large-scale distributed systems, led
            frontend teams at Accenture, and was CTO of TVManager, a content platform for digital
            signage.
          </Text>
          <Text>
            Outside work I run Hoshi Labs, a one-person indie game studio in Japan. Its first
            release, Star Survival, is out on Google Play, and more games are on the way.
          </Text>
          <Text>
            The field at the top of this page runs on a small three.js flight engine I wrote for
            this site. Press PLAY up there to fly it.
          </Text>
        </Flex>
      </Reveal>

      <Reveal delay={0.1}>
        <Box as="dl" m={0} borderTop={`1px solid ${tone.line}`}>
          <Fact name="NOW">
            {currentRole.title}, {currentRole.organization}
          </Fact>
          <Fact name="SINCE">{currentRole.period.split(' - ')[0]}</Fact>
          <Fact name="STACK">{currentRole.skills.join(' · ')}</Fact>
          <Fact name="STUDIO">
            <ArrowLink href={HOSHI_LABS}>Hoshi Labs</ArrowLink>
          </Fact>
        </Box>
      </Reveal>
    </Grid>
  </Section>
);

// ---- 02 selected work ----

const ProjectCard = ({ project }: { project: Project }) => (
  <Flex asChild direction="column" height="100%" p={{ base: 5, md: 6 }} {...cardFrame}>
    <a href={project.href} target="_blank" rel="noopener noreferrer">
      <Flex align="center" justify="space-between" gap={3}>
        <Text
          as="h3"
          fontFamily={monoFont}
          fontSize={{ base: '16px', md: '19px' }}
          fontWeight="bold"
          letterSpacing={{ base: '.1em', md: '.15em' }}
        >
          {project.name}
        </Text>
        <Text
          flexShrink={0}
          fontFamily={monoFont}
          fontSize="10px"
          letterSpacing=".18em"
          px="8px"
          py="3px"
          border={`1px solid ${tone.border}`}
          color={tone.soft}
        >
          {project.status}
        </Text>
      </Flex>
      <Text mt={1} fontSize="sm" fontStyle="italic" color={tone.soft}>
        {project.tagline}
      </Text>
      <Text mt={4} fontSize="sm" flex="1" lineHeight="1.6">
        {project.description}
      </Text>
      <Flex
        mt={6}
        align="baseline"
        justify="space-between"
        gap={3}
        wrap="wrap"
        fontFamily={monoFont}
        fontSize="xs"
      >
        <Text color={tone.dim} letterSpacing=".08em">
          {project.tags.join(' · ')}
        </Text>
        <Text fontWeight="bold" letterSpacing=".2em">
          {project.linkLabel} <span aria-hidden>↗</span>
        </Text>
      </Flex>
    </a>
  </Flex>
);

export const SelectedWork = () => (
  <Section id="work">
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={5}>
      {projects.map((project, i) => (
        <Reveal key={project.name} delay={(i % 2) * 0.08}>
          <ProjectCard project={project} />
        </Reveal>
      ))}
    </SimpleGrid>
    <Box mt="32px">
      <ArrowLink to="/arcade">All projects and demos</ArrowLink>
    </Box>
  </Section>
);

// ---- 03 experience ----

export const ExperienceStrip = () => {
  const earlier = roles.length - STRIP_ROLES;
  return (
    <Section id="experience">
      <Reveal>
        <Box as="ol" m={0} p={0} listStyleType="none" borderTop={`1px solid ${tone.line}`}>
          {roles.slice(0, STRIP_ROLES).map((role) => (
            <Grid
              as="li"
              key={role.id}
              templateColumns={{ base: 'minmax(0, 1fr)', md: '210px minmax(0, 1fr) auto' }}
              columnGap="24px"
              rowGap="4px"
              alignItems="baseline"
              py="18px"
              borderBottom={`1px solid ${tone.line}`}
              fontFamily={monoFont}
            >
              <Text fontSize="12px" letterSpacing=".14em" color={tone.dim} textTransform="uppercase">
                {role.period.replace(' - ', ' — ')}
              </Text>
              <Text fontSize={{ base: '14px', md: '15px' }}>{role.title}</Text>
              <Text fontSize="13px" fontWeight="bold" letterSpacing=".2em" textTransform="uppercase">
                {role.organization}
              </Text>
            </Grid>
          ))}
        </Box>
      </Reveal>
      <Flex mt="28px" align="baseline" gap="20px" wrap="wrap">
        <ArrowLink to="/experience">Full timeline</ArrowLink>
        {earlier > 0 && (
          <Text fontFamily={monoFont} fontSize="12px" color={tone.dim} letterSpacing=".08em">
            + {earlier} earlier {earlier === 1 ? 'role' : 'roles'}
          </Text>
        )}
      </Flex>
    </Section>
  );
};

// ---- 04 writing ----

export const Writing = () => (
  <Section id="writing">
    <Reveal>
      <Box asChild display="block" maxW="820px" p={{ base: 5, md: 7 }} {...cardFrame}>
        <RouterLink to={post.href}>
          {post.date && (
            <Text fontFamily={monoFont} fontSize="12px" letterSpacing=".14em" color={tone.dim}>
              {formatPostDate(post.date).toUpperCase()}
            </Text>
          )}
          <Text
            as="h3"
            mt={2}
            fontFamily={monoFont}
            fontSize={{ base: '19px', md: '24px' }}
            fontWeight="bold"
            lineHeight="1.35"
          >
            {post.title}
          </Text>
          <Text mt={3} fontSize="sm" lineHeight="1.6" color={tone.soft}>
            {post.excerpt}
          </Text>
          <Text mt={6} {...label} fontWeight="bold">
            Read the post <span aria-hidden>→</span>
          </Text>
        </RouterLink>
      </Box>
    </Reveal>
  </Section>
);

// ---- 05 contact ----

export const Contact = () => (
  <Section id="contact">
    <Reveal>
      <Text color={tone.soft} lineHeight="1.7" maxW="520px">
        For work, games, or anything else on this page, write to
      </Text>
      <Box
        asChild
        display="inline-block"
        mt="14px"
        fontFamily={monoFont}
        fontSize="clamp(20px, 4.4vw, 44px)"
        fontWeight="bold"
        letterSpacing=".04em"
        color="white"
        pb="6px"
        borderBottom={`1px solid ${tone.border}`}
        transition="border-color 0.15s ease"
        _hover={{ borderBottomColor: 'white' }}
        _focusVisible={focusRing}
      >
        <a href={socialLinks.email}>{email}</a>
      </Box>
      <Flex mt="40px" gap={{ base: '22px', md: '34px' }} wrap="wrap">
        {contactLinks
          .filter(({ key }) => key !== 'email')
          .map(({ key, label: name }) => (
            <ArrowLink key={key} href={socialLinks[key]}>
              {name}
            </ArrowLink>
          ))}
      </Flex>
    </Reveal>
  </Section>
);

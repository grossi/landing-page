import * as React from 'react';
import { Box, Flex, Grid, SimpleGrid, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { formatPostDate } from 'components/post/frontMatter';
import {
  email,
  post,
  released,
  roles,
  selectedWork,
  STRIP_ROLES,
  studio,
} from 'components/home/content';
import Section, { focusRing, label, Reveal, tone } from 'components/home/Section';
import ProjectCard from 'components/projects/ProjectCard';
import { monoFont, socialLinks } from 'config/site';
import type { Project } from 'data/projects';

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
      {children} <span aria-hidden="true">{to ? '→' : '↗'}</span>
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
    <Text as="dt" color={tone.soft} letterSpacing=".18em">
      {name}
    </Text>
    <Box as="dd" m={0}>
      {children}
    </Box>
  </Grid>
);

/** A fact that names a project links to it, when the project has a public link. */
const ProjectFact = ({ name, project }: { name: string; project: Project | undefined }) => {
  if (!project) return null;
  const link = project.links[0];
  return (
    <Fact name={name}>
      {link ? <ArrowLink href={link.href}>{project.name}</ArrowLink> : project.name}
    </Fact>
  );
};

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
          I'm a software engineer, and I make games.
        </Text>
        {/* Short lines, not paragraphs; the projects page has the rest. */}
        <Text mt="20px" maxW="640px" color={tone.soft} lineHeight="1.7">
          Hoshi Labs is my one-person studio in Japan.
        </Text>
      </Reveal>

      <Reveal delay={0.1}>
        <Box as="dl" m={0} borderTop={`1px solid ${tone.line}`}>
          <ProjectFact name="STUDIO" project={studio} />
          <ProjectFact name="OUT NOW" project={released} />
        </Box>
      </Reveal>
    </Grid>
  </Section>
);

// ---- 02 selected work ----

export const SelectedWork = () => (
  <Section id="work">
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={5}>
      {selectedWork.map((project, i) => (
        <Reveal key={project.slug} delay={(i % 2) * 0.08}>
          <ProjectCard project={project} />
        </Reveal>
      ))}
    </SimpleGrid>
    <Box mt="32px">
      <ArrowLink to="/projects">All projects</ArrowLink>
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
              <Text fontSize="12px" letterSpacing=".14em" color={tone.soft} textTransform="uppercase">
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
      <Box mt="28px">
        {/* The link says what the full page adds; the number comes from the data. */}
        <ArrowLink to="/experience">
          {earlier > 0 ? `+ ${earlier} earlier ${earlier === 1 ? 'role' : 'roles'}` : 'Full timeline'}
        </ArrowLink>
      </Box>
    </Section>
  );
};

// ---- 04 writing ----

export const Writing = () => (
  <Section id="writing">
    <Reveal>
      <Box
        asChild
        display="block"
        maxW="820px"
        p={{ base: 5, md: 7 }}
        borderWidth="1px"
        borderColor={tone.border}
        bg="black"
        color="white"
        textDecoration="none"
        transition="border-color 0.15s ease, transform 0.15s ease"
        _hover={{ borderColor: 'white', transform: 'translateY(-2px)' }}
        _focusVisible={focusRing}
      >
        <RouterLink to={post.href}>
          {post.date && (
            <Text fontFamily={monoFont} fontSize="12px" letterSpacing=".14em" color={tone.soft}>
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
          <Text mt={6} {...label} fontWeight="bold">
            Read <span aria-hidden="true">→</span>
          </Text>
        </RouterLink>
      </Box>
    </Reveal>
  </Section>
);

// ---- 05 contact ----

const profiles = [
  { name: 'LINKEDIN', href: socialLinks.linkedin },
  { name: 'GITHUB', href: socialLinks.github },
  { name: 'X', href: socialLinks.twitter },
];

export const Contact = () => (
  <Section id="contact" fill>
    <Reveal>
      <Box
        asChild
        display="inline-block"
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
        {profiles.map(({ name, href }) => (
          <ArrowLink key={name} href={href}>
            {name}
          </ArrowLink>
        ))}
      </Flex>
    </Reveal>
  </Section>
);

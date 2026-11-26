import { useEffect } from 'react';
import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { useLocation } from 'react-router';
import PageLayout from 'components/layout/PageLayout';
import DemoCard from 'components/projects/DemoCard';
import ProjectCard from 'components/projects/ProjectCard';
import Section from 'components/projects/Section';
import { grey } from 'components/projects/cardStyles';
import { monoFont as mono } from 'config/site';
import { demos } from 'data/demos';
import { projectSections } from 'data/projects';

// The demos are the page's last section, after the real projects.
const experiments = {
  id: 'experiments',
  title: 'Experiments',
  blurb: 'Three.js flight toys and small games that live on this site.',
};

const jumpLinks = [...projectSections, experiments].map(({ id, title }) => ({ id, title }));

/**
 * The element a URL fragment names. Like a browser, it tries the fragment as
 * written, then percent-decoded (`#%74ools` is `#tools`).
 */
function fragmentTarget(hash: string): HTMLElement | null {
  const fragment = hash.slice(1);
  if (!fragment) return null;
  const exact = document.getElementById(fragment);
  if (exact) return exact;
  try {
    return document.getElementById(decodeURIComponent(fragment));
  } catch {
    // A malformed escape such as `#%` names nothing.
    return null;
  }
}

// The projects page. It is served at /projects and at /arcade, its old
// address (this file keeps the old name); the canonical link names /projects.
const Projects = () => {
  const { hash } = useLocation();

  // The page is a lazy chunk: on a fresh load of /projects#tools the browser
  // looks for the section before it exists and stays at the top. Go there once
  // the page has rendered.
  useEffect(() => {
    fragmentTarget(hash)?.scrollIntoView();
  }, [hash]);

  return (
    <PageLayout>
      <link rel="canonical" href="https://grossi.tech/projects" />
      <Heading as="h1" size="2xl" fontFamily={mono} fontWeight="bold" letterSpacing="0.1em">
        PROJECTS
      </Heading>
      <Text mt={3} maxW="2xl" color={grey.text} lineHeight="1.5">
        Games from my one-person studio, the prototypes behind them, tools I have built, and the
        experiments that live on this site.
      </Text>
      <Flex
        as="nav"
        aria-label="Sections"
        mt={6}
        columnGap={6}
        rowGap={1}
        wrap="wrap"
        fontFamily={mono}
        fontSize="xs"
        letterSpacing="0.14em"
        textTransform="uppercase"
      >
        {jumpLinks.map((link) => (
          <Box
            key={link.id}
            asChild
            py={1}
            color={grey.text}
            textDecoration="none"
            borderBottom="1px solid transparent"
            _hover={{ color: 'white', borderBottomColor: 'white' }}
            _focusVisible={{ outline: '1px solid white', outlineOffset: '3px' }}
          >
            <a href={`#${link.id}`}>{link.title}</a>
          </Box>
        ))}
      </Flex>

      {projectSections.map((section) => (
        <Section
          key={section.id}
          id={section.id}
          title={section.title}
          blurb={section.blurb}
          count={section.projects.length}
        >
          {section.projects.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </Section>
      ))}

      <Section {...experiments} count={demos.length}>
        {demos.map((demo) => (
          <DemoCard key={demo.slug} demo={demo} />
        ))}
      </Section>
    </PageLayout>
  );
};

export default Projects;

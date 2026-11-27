import * as React from 'react';
import { useId } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { focusRing, tone } from 'components/home/Section';
import { monoFont } from 'config/site';
import type { Project } from 'data/projects';

/**
 * Where a project link goes decides how it opens, as on the projects page:
 * the site's own pages through the router, the static arcade games as a
 * plain page load in this tab, everything else in a new tab.
 */
function ProjectAnchor({
  project,
  describedBy,
  children,
  ...style
}: { project: Project; describedBy: string; children: React.ReactNode } & React.ComponentProps<typeof Box>) {
  const { href, label } = project.link;
  // A short name for link lists; the project's line is its description, so
  // a screen reader still says what the project is.
  const name = `${project.name}: ${label}`;
  if (href.startsWith('/') && !href.startsWith('/arcade/')) {
    return (
      <Box asChild {...style}>
        <RouterLink to={href} aria-label={name} aria-describedby={describedBy}>
          {children}
        </RouterLink>
      </Box>
    );
  }
  return (
    <Box asChild {...style}>
      {href.startsWith('/') ? (
        <a href={href} aria-label={name} aria-describedby={describedBy}>
          {children}
        </a>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${name} (opens in a new tab)`}
          aria-describedby={describedBy}
        >
          {children}
        </a>
      )}
    </Box>
  );
}

/**
 * One selected project: its screenshot, name, line and link, as the
 * projects data has them. The whole tile is the one link. On a phone it is
 * a row (a small thumbnail beside the text) so four of them stay short.
 */
const WorkTile = ({ project }: { project: Project }) => {
  const external = !project.link.href.startsWith('/');
  const lineId = useId();
  return (
    <ProjectAnchor
      project={project}
      describedBy={lineId}
      data-project={project.slug}
      display="flex"
      flexDirection={{ base: 'row', md: 'column' }}
      height="100%"
      borderWidth="1px"
      borderColor={tone.border}
      bg="black"
      color="white"
      textDecoration="none"
      transition="border-color 0.15s ease, transform 0.15s ease"
      _hover={{ borderColor: 'white', transform: 'translateY(-2px)' }}
      _focusVisible={focusRing}
    >
      {/* A fixed 16:10 box, so nothing moves as the image loads. */}
      <Box
        aspectRatio="16 / 10"
        flexShrink={0}
        w={{ base: '88px', md: '100%' }}
        alignSelf={{ base: 'center', md: 'stretch' }}
        ml={{ base: 3, md: 0 }}
        bg="#111"
        borderWidth={{ base: '1px', md: 0 }}
        borderBottomWidth="1px"
        borderColor={tone.border}
        overflow="hidden"
      >
        {project.image && (
          <img
            src={project.image.small.src}
            width={project.image.small.width}
            height={project.image.small.height}
            alt={project.image.alt}
            loading="lazy"
            decoding="async"
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
      </Box>
      <Flex direction="column" gap="6px" minW={0} flex="1" p={{ base: 3, md: 4 }}>
        {/* Wraps, so on a narrow phone the label drops under the name
            instead of running past the tile's edge. */}
        <Flex align="baseline" justify="space-between" columnGap={3} rowGap="2px" wrap="wrap">
          <Text
            as="h3"
            minW={0}
            overflowWrap="anywhere"
            fontFamily={monoFont}
            fontSize={{ base: '13px', md: '14px' }}
            fontWeight="bold"
            letterSpacing=".14em"
            textTransform="uppercase"
          >
            {project.name}
          </Text>
          <Text as="span" flexShrink={0} fontFamily={monoFont} fontSize="11px" fontWeight="bold" letterSpacing=".2em">
            {project.link.label} <span aria-hidden="true">{external ? '↗' : '→'}</span>
          </Text>
        </Flex>
        <Text id={lineId} fontSize={{ base: '13px', md: 'sm' }} lineHeight="1.5" color={tone.soft}>
          {project.line}
        </Text>
      </Flex>
    </ProjectAnchor>
  );
};

export default WorkTile;

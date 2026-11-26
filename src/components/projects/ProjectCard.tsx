import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { monoFont as mono } from 'config/site';
import { statusLabels, type Project, type ProjectStatus } from 'data/projects';
import { cardFrame, grey } from 'components/projects/cardStyles';

// Something a visitor can use today reads brighter than the rest.
const brightStatuses: ProjectStatus[] = ['released', 'live'];

/**
 * A project card. Unlike a demo card it is not one big link: a project can
 * have several links (store and game page) or none (a private project).
 */
const ProjectCard = ({ project }: { project: Project }) => {
  const bright = brightStatuses.includes(project.status);
  return (
    <Flex
      as="article"
      data-project={project.slug}
      {...cardFrame}
      transition="border-color 0.15s ease"
      _hover={{ borderColor: project.links.length > 0 ? 'white' : grey.dim }}
    >
      <Flex align="center" justify="space-between" gap={3} wrap="wrap">
        <Heading
          as="h3"
          size="md"
          fontFamily={mono}
          fontWeight="bold"
          letterSpacing="0.15em"
          textTransform="uppercase"
        >
          {project.name}
        </Heading>
        <Text
          fontSize="10px"
          fontFamily={mono}
          letterSpacing="0.14em"
          lineHeight="1"
          px="6px"
          py="4px"
          borderWidth="1px"
          borderColor={bright ? 'white' : grey.border}
          color={bright ? 'white' : grey.text}
          flexShrink={0}
        >
          {statusLabels[project.status]}
        </Text>
      </Flex>
      <Text mt={2} fontSize="sm" fontStyle="italic" color={grey.text}>
        {project.tagline}
      </Text>
      <Text mt={3} fontSize="sm" flex="1" lineHeight="1.5">
        {project.description}
      </Text>
      <Text mt={4} fontSize="xs" fontFamily={mono} letterSpacing="0.08em" color={grey.text}>
        {project.tech.join(' · ')}
      </Text>
      <Flex
        mt={3}
        pt={3}
        borderTopWidth="1px"
        borderColor={grey.border}
        columnGap={6}
        rowGap={1}
        wrap="wrap"
        fontFamily={mono}
        fontSize="xs"
      >
        {project.links.length === 0 ? (
          <Text py={1} color={grey.text} letterSpacing="0.2em">
            NO PUBLIC LINK
          </Text>
        ) : (
          project.links.map((link) => (
            <Box
              key={link.href}
              asChild
              py={1}
              color="white"
              fontWeight="bold"
              letterSpacing="0.2em"
              textDecoration="none"
              borderBottom="1px solid transparent"
              _hover={{ borderBottomColor: 'white' }}
              _focusVisible={{ outline: '1px solid white', outlineOffset: '3px' }}
            >
              {/* Several cards share a label ("GAME PAGE"), so the name adds the project. */}
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.label}: ${project.name} (opens in a new tab)`}
              >
                {link.label} <span aria-hidden="true">↗</span>
              </a>
            </Box>
          ))
        )}
      </Flex>
    </Flex>
  );
};

export default ProjectCard;

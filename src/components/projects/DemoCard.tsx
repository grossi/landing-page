import { Box, Flex, Heading, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { monoFont as mono } from 'config/site';
import { demoHref, type Demo } from 'data/demos';
import { cardFrame, grey } from 'components/projects/cardStyles';

const CardShell = ({ demo }: { demo: Demo }) => (
  <Flex
    {...cardFrame}
    transition="border-color 0.15s ease, transform 0.15s ease"
    _hover={{
      borderColor: 'white',
      transform: 'translateY(-2px)',
    }}
  >
    <Flex align="baseline" justify="space-between" gap={2}>
      <Heading as="h3" size="md" fontFamily={mono} fontWeight="bold" letterSpacing="0.15em">
        {demo.title}
      </Heading>
      <Text fontSize="xs" fontFamily={mono} letterSpacing="0.1em" color={grey.text} flexShrink={0}>
        {demo.featured ? '★ featured' : demo.kind}
      </Text>
    </Flex>
    <Text mt={1} fontSize="sm" fontStyle="italic" color={grey.text}>
      {demo.tagline}
    </Text>
    <Text mt={3} fontSize="sm" flex="1" lineHeight="1.5">
      {demo.description}
    </Text>
    <Flex mt={4} align="center" justify="space-between" fontFamily={mono} fontSize="xs">
      <Text color={grey.dim} letterSpacing="0.08em">
        {demo.controls}
      </Text>
      <Text fontWeight="bold" letterSpacing="0.25em">
        ▶ PLAY
      </Text>
    </Flex>
  </Flex>
);

/** The whole card is the link: a site route, or the demo's static build in a new tab. */
const DemoCard = ({ demo }: { demo: Demo }) =>
  demo.route ? (
    <RouterLink
      to={demo.route}
      data-demo={demo.slug}
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <CardShell demo={demo} />
    </RouterLink>
  ) : (
    <Box asChild textDecoration="none" display="block" color="inherit">
      <a href={demoHref(demo)} data-demo={demo.slug} target="_blank" rel="noreferrer">
        <CardShell demo={demo} />
      </a>
    </Box>
  );

export default DemoCard;

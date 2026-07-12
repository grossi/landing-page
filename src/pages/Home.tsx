import { useEffect, useRef } from 'react';
import { Box, Flex, HStack, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { createDeepField } from 'components/deepfield/createDeepField';

const mono = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  color: 'white',
} as const;

const navItems = [
  { name: 'BLOG', path: '/blog' },
  { name: 'EXPERIENCE', path: '/experience' },
  { name: 'ARCADE', path: '/arcade' },
];

// The main page: the DEEP FIELD wireframe drift as a full-screen backdrop
// with the site's front door layered on top. Overlay content ignores the
// pointer (except links) so the field receives every steer and click.
const Home = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    return createDeepField(containerRef.current);
  }, []);

  return (
    <Box position="relative" height="100vh" overflow="hidden" bg="black">
      <Box ref={containerRef} position="absolute" inset={0} />

      <Flex
        position="absolute"
        inset={0}
        direction="column"
        pointerEvents="none"
        userSelect="none"
      >
        <Flex justify="space-between" align="baseline" px="34px" py="26px">
          <Text {...mono} fontSize="14px" fontWeight="bold" letterSpacing=".3em">
            GROSSI.TECH
          </Text>
          <HStack gap="26px">
            {navItems.map((item) => (
              <RouterLink
                key={item.path}
                to={item.path}
                style={{ pointerEvents: 'auto', textDecoration: 'none' }}
              >
                <Text
                  {...mono}
                  fontSize="12px"
                  letterSpacing=".22em"
                  opacity={0.55}
                  borderBottom="1px solid transparent"
                  _hover={{ opacity: 1, borderBottomColor: 'whiteAlpha.500' }}
                >
                  {item.name}
                </Text>
              </RouterLink>
            ))}
          </HStack>
        </Flex>

        <Flex flex="1" direction="column" justify="center" px="34px" maxW="720px">
          <Text
            as="h1"
            {...mono}
            fontSize="clamp(34px, 7vw, 72px)"
            fontWeight="bold"
            letterSpacing=".14em"
            lineHeight="1.05"
            textShadow="0 0 24px rgba(0,0,0,.9)"
          >
            GABRIEL
            <br />
            ROSSI
          </Text>
          <Text {...mono} mt="14px" fontSize="13px" letterSpacing=".34em" opacity={0.6}>
            SOFTWARE ENGINEER
          </Text>
          <Text {...mono} mt="42px" fontSize="11px" letterSpacing=".26em" opacity={0.35}>
            STEER WITH THE MOUSE &middot; CLICK TO KICK &middot; HOLD TO BURN
          </Text>
        </Flex>
      </Flex>
    </Box>
  );
};

export default Home;

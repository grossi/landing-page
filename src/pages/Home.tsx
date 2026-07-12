import { useEffect, useRef } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import Header from 'components/layout/Header';
import { createDeepField } from 'components/deepfield/createDeepField';

const mono = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  color: 'white',
} as const;

// The main page: the shared header on top and the DEEP FIELD wireframe
// drift filling the rest of the viewport, with the hero layered on top.
// Overlay content ignores the pointer so the field receives every steer
// and click.
const Home = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    return createDeepField(containerRef.current);
  }, []);

  return (
    <Flex direction="column" height="100vh" overflow="hidden" bg="black">
      <Header />

      <Box position="relative" flex="1" overflow="hidden">
        <Box ref={containerRef} position="absolute" inset={0} />

        <Flex
          position="absolute"
          inset={0}
          direction="column"
          justify="center"
          pointerEvents="none"
          userSelect="none"
          px="34px"
        >
          <Box maxW="1280px" mx="auto" w="100%">
            <Flex direction="column" maxW="720px">
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
            </Flex>
          </Box>
        </Flex>
      </Box>
    </Flex>
  );
};

export default Home;

import { useEffect, useRef, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import Header from 'components/layout/Header';
import { createDeepField } from 'components/deepfield/createDeepField';
import type { DeepFieldHandle, DeepFieldMode } from 'components/deepfield/createDeepField';
import { monoFont } from 'config/site';

const mono = {
  fontFamily: monoFont,
  color: 'white',
} as const;

// The main page: the shared header on top and the DEEP FIELD wireframe
// drift filling the rest of the viewport, with the hero layered on top.
// Overlay content ignores the pointer so the field receives every steer
// and click; only the PLAY button opts back in.
const Home = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<DeepFieldHandle | null>(null);
  const [mode, setMode] = useState<DeepFieldMode>('title');

  useEffect(() => {
    if (!containerRef.current) return;
    const handle = createDeepField(containerRef.current, { onMode: setMode });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.dispose();
    };
  }, []);

  const heroVisible = mode === 'title' || mode === 'disengage';
  const playVisible = mode === 'title';

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
          opacity={heroVisible ? 1 : 0}
          transition="opacity 600ms ease"
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

        <Flex
          position="absolute"
          bottom="9vh"
          left={0}
          right={0}
          justify="center"
          pointerEvents="none"
          opacity={playVisible ? 1 : 0}
          transition="opacity 600ms ease"
        >
          <Box
            as="button"
            onClick={(e) => {
              e.currentTarget.blur();
              handleRef.current?.play();
            }}
            pointerEvents={playVisible ? 'auto' : 'none'}
            tabIndex={playVisible ? 0 : -1}
            aria-hidden={!playVisible}
            {...mono}
            fontSize="15px"
            fontWeight="bold"
            letterSpacing="0.3em"
            px="40px"
            py="14px"
            bg="rgba(0,0,0,.55)"
            borderWidth="1px"
            borderColor="#3f3f46"
            borderRadius={0}
            cursor="pointer"
            transition="border-color 0.15s ease, transform 0.15s ease"
            _hover={{ borderColor: 'white', transform: 'translateY(-2px)' }}
          >
            ▶ PLAY
          </Box>
        </Flex>

        <Box
          as="button"
          onClick={(e) => {
            e.currentTarget.blur();
            handleRef.current?.exit();
          }}
          aria-label="Exit to title"
          position="absolute"
          bottom="16px"
          right="22px"
          fontFamily={monoFont}
          fontSize="12px"
          letterSpacing="0.25em"
          color="#71717a"
          bg="transparent"
          pointerEvents={mode === 'play' ? 'auto' : 'none'}
          tabIndex={mode === 'play' ? 0 : -1}
          aria-hidden={mode !== 'play'}
          cursor="pointer"
          userSelect="none"
          opacity={mode === 'play' ? 1 : 0}
          transition="opacity 600ms ease"
        >
          EXIT — ESC
        </Box>
      </Box>
    </Flex>
  );
};

export default Home;

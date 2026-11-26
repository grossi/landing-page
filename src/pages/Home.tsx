import { useEffect, useRef, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import Header from 'components/layout/Header';
import { createDeepField } from 'components/deepfield/createDeepField';
import type { DeepFieldHandle, DeepFieldMode } from 'components/deepfield/createDeepField';
import BuildingStrip from 'components/home/BuildingStrip';
import HeroActions from 'components/home/HeroActions';
import { kicker, statement } from 'components/home/content';
import { useFitDensity } from 'components/home/useFitDensity';
import { monoFont } from 'config/site';

const mono = {
  fontFamily: monoFont,
  color: 'white',
} as const;

// The main page: the shared header on top and the DEEP FIELD wireframe
// drift filling the rest of the viewport, with the hero layered on top.
// The overlay ignores the pointer so the field receives every steer and
// click; the action links, PLAY and the "currently building" bar opt back
// in. They are anchors and buttons, which the field's pointer handler
// skips, so using them never fires a burn.
const Home = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<DeepFieldHandle | null>(null);
  const [mode, setMode] = useState<DeepFieldMode>('title');
  // The page never scrolls, so the hero sheds detail until it fits.
  const overlayRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const density = useFitDensity(overlayRef, slotRef, heroRef);

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
    <Flex direction="column" height="100dvh" overflow="hidden" bg="black">
      <Header />

      <Box position="relative" flex="1" minH={0} overflow="hidden">
        <Box ref={containerRef} position="absolute" inset={0} />

        {/* `inert` while flying: the faded-out hero takes no clicks or focus. */}
        <Flex
          ref={overlayRef}
          position="absolute"
          inset={0}
          direction="column"
          pointerEvents="none"
          userSelect="none"
          opacity={heroVisible ? 1 : 0}
          transition="opacity 600ms ease"
          inert={!heroVisible}
        >
          <Flex ref={slotRef} flex="1" minH={0} direction="column" justify="center" px="34px">
            <Box maxW="1280px" mx="auto" w="100%">
              <Flex ref={heroRef} direction="column" maxW="760px">
                <Text
                  as="h1"
                  {...mono}
                  fontSize="clamp(34px, 7vw, 72px)"
                  fontWeight="bold"
                  letterSpacing=".14em"
                  lineHeight="1.05"
                  textShadow="0 0 24px rgba(0,0,0,.9)"
                >
                  GABRIEL{density >= 4 ? ' ' : <br />}ROSSI
                </Text>
                <Text
                  {...mono}
                  mt="14px"
                  fontSize={{ base: '11px', md: '13px' }}
                  letterSpacing={{ base: '.24em', md: '.34em' }}
                  opacity={0.6}
                  display={density >= 4 ? 'none' : 'block'}
                >
                  {kicker.map((part, i) => (
                    <Box as="span" key={part} whiteSpace="nowrap">
                      {i > 0 && '· '}
                      {part}{' '}
                    </Box>
                  ))}
                </Text>
                <Text
                  {...mono}
                  mt={density >= 1 ? '12px' : { base: '18px', md: '26px' }}
                  fontSize={{ base: '13px', md: '15px' }}
                  lineHeight="1.7"
                  opacity={0.88}
                  textShadow="0 0 12px rgba(0,0,0,1), 0 0 4px rgba(0,0,0,1)"
                >
                  {statement.map((line) => (
                    <Box as="span" key={line} display={{ base: 'inline', md: 'block' }}>
                      {line}{' '}
                    </Box>
                  ))}
                </Text>
                <Box mt={density >= 1 ? '14px' : { base: '22px', md: '30px' }}>
                  <HeroActions
                    playEnabled={playVisible}
                    onPlay={() => handleRef.current?.play()}
                    density={density}
                  />
                </Box>
              </Flex>
            </Box>
          </Flex>

          <BuildingStrip density={density} />
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

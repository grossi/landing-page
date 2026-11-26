import { useEffect, useRef, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { createDeepField } from 'components/deepfield/createDeepField';
import type { DeepFieldHandle, DeepFieldMode } from 'components/deepfield/createDeepField';
import { currentRole } from 'components/home/content';
import { focusRing, headerHeightVar, tone } from 'components/home/Section';
import { monoFont } from 'config/site';

const mono = {
  fontFamily: monoFont,
  color: 'white',
} as const;

interface DescentHeroProps {
  /** Rendered height of the sticky header above the hero, in px. */
  headerHeight: number;
  /** Scrolls to the first section below the hero. */
  onDescend: () => void;
  /** True from PLAY until the field is back on its title screen. */
  onFlightChange: (inFlight: boolean) => void;
}

// The first screen of the page: the DEEP FIELD drift under the name, with
// PLAY. Unlike the old single-screen home the page continues below, so the
// field is told where its title-screen input ends (inputScope) and when it
// has been scrolled away (setPaused), and the page stops scrolling while
// the hero is a game.
const DescentHero = ({ headerHeight, onDescend, onFlightChange }: DescentHeroProps) => {
  const heroRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<DeepFieldHandle | null>(null);
  const [mode, setMode] = useState<DeepFieldMode>('title');
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!containerRef.current || !heroRef.current) return;
    const handle = createDeepField(containerRef.current, {
      onMode: setMode,
      inputScope: heroRef.current,
    });
    handleRef.current = handle;
    return () => {
      handleRef.current = null;
      handle.dispose();
    };
  }, []);

  // Pause the field (loop and input) once the hero has scrolled up behind
  // the sticky header: the stage's own off-screen pause only sees the
  // viewport, and the last strip of the hero is covered by the header.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => handleRef.current?.setPaused(!entries[entries.length - 1].isIntersecting),
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [headerHeight]);

  // From PLAY until the field is back on its title screen the hero is a
  // game: the page must not scroll under it (wheel, keys or a steering
  // finger).
  const inFlight = mode !== 'title';
  useEffect(() => onFlightChange(inFlight), [inFlight, onFlightChange]);
  useEffect(() => {
    if (!inFlight) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previous;
    };
  }, [inFlight]);

  // The field dims and the title lifts away as the page scrolls past.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const fieldOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.2]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const titleLift = useTransform(scrollYProgress, [0, 1], [0, reduceMotion ? 0 : -70]);

  const heroVisible = mode === 'title' || mode === 'disengage';
  const playVisible = mode === 'title';

  return (
    <Box
      ref={heroRef}
      position="relative"
      overflow="hidden"
      bg="black"
      touchAction={inFlight ? 'none' : 'auto'}
      css={{
        height: `calc(100vh - ${headerHeightVar})`,
        // the small viewport height keeps the canvas from resizing as a
        // phone's address bar collapses on scroll
        '@supports (height: 100svh)': { height: `calc(100svh - ${headerHeightVar})` },
        minHeight: '420px',
      }}
    >
      <motion.div style={{ position: 'absolute', inset: 0, opacity: fieldOpacity }}>
        <Box ref={containerRef} position="absolute" inset={0} />
      </motion.div>

      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          pointerEvents: 'none',
          opacity: titleOpacity,
          y: titleLift,
        }}
      >
        <Flex
          flex="1"
          direction="column"
          justify="center"
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
              <Text
                {...mono}
                mt="16px"
                fontSize={{ base: '11px', md: '13px' }}
                letterSpacing={{ base: '.24em', md: '.34em' }}
                lineHeight="1.7"
                opacity={0.6}
                textTransform="uppercase"
              >
                {currentRole.title}
              </Text>
              <Text
                {...mono}
                mt="18px"
                maxW="520px"
                fontSize={{ base: '14px', md: '16px' }}
                lineHeight="1.6"
                opacity={0.85}
                textShadow="0 0 18px rgba(0,0,0,.9)"
              >
                Building AI solutions at {currentRole.organization} and indie games as Hoshi Labs.
              </Text>
            </Flex>
          </Box>
        </Flex>
      </motion.div>

      <Flex
        position="absolute"
        bottom="22px"
        left={0}
        right={0}
        direction="column"
        align="center"
        gap={{ base: '22px', md: '30px' }}
        pointerEvents="none"
        opacity={playVisible ? 1 : 0}
        transition="opacity 600ms ease"
      >
        <Box
          as="button"
          onClick={(e) => {
            e.currentTarget.blur();
            // the game owns the whole first screen: line the hero up first
            window.scrollTo(0, 0);
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
          borderColor={tone.border}
          borderRadius={0}
          cursor="pointer"
          transition="border-color 0.15s ease, transform 0.15s ease"
          _hover={{ borderColor: 'white', transform: 'translateY(-2px)' }}
          _focusVisible={focusRing}
        >
          ▶ PLAY
        </Box>

        <Box
          as="button"
          onClick={onDescend}
          pointerEvents={playVisible ? 'auto' : 'none'}
          tabIndex={playVisible ? 0 : -1}
          aria-hidden={!playVisible}
          aria-label="Scroll to the about section"
          {...mono}
          fontSize="11px"
          letterSpacing=".3em"
          px="12px"
          py="6px"
          bg="transparent"
          cursor="pointer"
          opacity={0.6}
          transition="opacity 0.15s ease"
          _hover={{ opacity: 1 }}
          _focusVisible={focusRing}
        >
          SCROLL ↓
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
        color={tone.dim}
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
  );
};

export default DescentHero;

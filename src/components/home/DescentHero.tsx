import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { createDeepField } from 'components/deepfield/createDeepField';
import type { DeepFieldHandle, DeepFieldMode } from 'components/deepfield/createDeepField';
import { kicker } from 'components/home/content';
import HeroLinks from 'components/home/HeroLinks';
import { focusRing, headerHeightVar, tone } from 'components/home/Section';
import { monoFont } from 'config/site';

const mono = {
  fontFamily: monoFont,
  color: 'white',
} as const;

/** Room for the name, the links and the bottom row, in px. */
const HERO_MIN_HEIGHT = 380;

export interface DescentHeroHandle {
  /** Leaves play for the title screen; a no-op on the title screen. */
  exit(): void;
}

interface DescentHeroProps {
  ref?: Ref<DescentHeroHandle>;
  /** Rendered height of the sticky header above the hero, in px. */
  headerHeight: number;
  /** True from PLAY until the field is back on its title screen. */
  onFlightChange: (inFlight: boolean) => void;
  /** PLAY was pressed. */
  onPlay?: () => void;
}

// The first screen of the page: the DEEP FIELD drift under the name and the
// profile links, with a scroll cue and a quiet PLAY along the bottom edge. The page continues below, so the field is told where its
// title-screen input ends (inputScope) and when it has been scrolled away
// (setPaused), and the page stops scrolling while the hero is a game.
const DescentHero = ({ ref, headerHeight, onFlightChange, onPlay }: DescentHeroProps) => {
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

  useImperativeHandle(ref, () => ({ exit: () => handleRef.current?.exit() }), []);

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

  // The hero comes back as the exit fades in; its links then queue behind
  // the rest of the exit (Home), and PLAY turns it around.
  const heroVisible = mode === 'title' || mode === 'disengage';

  return (
    <Box
      ref={heroRef}
      data-hero
      position="relative"
      overflow="hidden"
      bg="black"
      touchAction={inFlight ? 'none' : 'auto'}
      // On a short screen (a phone on its side) the hero is taller than the
      // screen so its content fits, and the page scrolls. The game cannot
      // scroll: it gets exactly the screen, so EXIT at its bottom edge stays
      // in reach.
      style={{ minHeight: inFlight ? 0 : HERO_MIN_HEIGHT }}
      css={{
        height: `calc(100vh - ${headerHeightVar})`,
        // the small viewport height keeps the canvas from resizing as a
        // phone's address bar collapses on scroll
        '@supports (height: 100svh)': { height: `calc(100svh - ${headerHeightVar})` },
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
        {/* `inert` while flying: the faded-out hero takes no clicks or focus. */}
        <Flex
          flex="1"
          direction="column"
          userSelect="none"
          opacity={heroVisible ? 1 : 0}
          transition="opacity 600ms ease"
          inert={!heroVisible}
        >
          <Flex flex="1" minH={0} direction="column" justify="center" px="34px">
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
                >
                  {kicker.map((part, i) => (
                    <Box as="span" key={part} whiteSpace="nowrap">
                      {i > 0 && '· '}
                      {part}{' '}
                    </Box>
                  ))}
                </Text>
                <Box mt={{ base: '18px', md: '24px' }}>
                  <HeroLinks />
                </Box>
              </Flex>
            </Box>
          </Flex>

          {/* The bottom edge: the scroll cue in the middle, and PLAY in the
              corner where EXIT sits once the game is on. */}
          <Grid templateColumns="1fr auto 1fr" alignItems="center" px="22px" pb="14px">
            <Box />
            <Box
              asChild
              {...mono}
              fontSize="11px"
              letterSpacing=".3em"
              px="12px"
              py="8px"
              textDecoration="none"
              pointerEvents="auto"
              opacity={0.6}
              transition="opacity 0.15s ease"
              _hover={{ opacity: 1 }}
              _focusVisible={focusRing}
            >
              <RouterLink to={{ pathname: '/', hash: '#about' }} aria-label="Scroll to About">
                SCROLL ↓
              </RouterLink>
            </Box>
            <Box
              as="button"
              onClick={(e) => {
                e.currentTarget.blur();
                // the game owns the whole first screen: line the hero up first
                window.scrollTo(0, 0);
                handleRef.current?.play();
                onPlay?.();
              }}
              aria-label="Play the flight game"
              justifySelf="end"
              fontFamily={monoFont}
              fontSize="12px"
              letterSpacing="0.25em"
              color={tone.soft}
              bg="transparent"
              px="0"
              py="8px"
              cursor="pointer"
              pointerEvents="auto"
              transition="color 0.15s ease"
              _hover={{ color: 'white' }}
              _focusVisible={{ ...focusRing, color: 'white' }}
            >
              ▶ PLAY
            </Box>
          </Grid>
        </Flex>
      </motion.div>

      <Box
        as="button"
        onClick={(e) => {
          e.currentTarget.blur();
          handleRef.current?.exit();
        }}
        // Escape works too; a phone has no Esc key, so the label leaves it out
        aria-label="Exit the flight game"
        position="absolute"
        bottom="16px"
        right="22px"
        fontFamily={monoFont}
        fontSize="12px"
        letterSpacing="0.25em"
        color={tone.soft}
        bg="transparent"
        pointerEvents={mode === 'play' ? 'auto' : 'none'}
        tabIndex={mode === 'play' ? 0 : -1}
        aria-hidden={mode !== 'play'}
        cursor="pointer"
        userSelect="none"
        opacity={mode === 'play' ? 1 : 0}
        transition="opacity 600ms ease"
      >
        EXIT
      </Box>
    </Box>
  );
};

export default DescentHero;

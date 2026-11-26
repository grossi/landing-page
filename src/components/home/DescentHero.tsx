import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { createDeepField } from 'components/deepfield/createDeepField';
import type { DeepFieldHandle, DeepFieldMode } from 'components/deepfield/createDeepField';
import { kicker } from 'components/home/content';
import HeroActions from 'components/home/HeroActions';
import { focusRing, headerHeightVar, tone } from 'components/home/Section';
import { monoFont } from 'config/site';

const mono = {
  fontFamily: monoFont,
  color: 'white',
} as const;

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

// The first screen of the page: the DEEP FIELD drift under the name, the
// actions and PLAY. The page continues below, so the field is told where its
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
      css={{
        height: `calc(100vh - ${headerHeightVar})`,
        // the small viewport height keeps the canvas from resizing as a
        // phone's address bar collapses on scroll
        '@supports (height: 100svh)': { height: `calc(100svh - ${headerHeightVar})` },
        minHeight: '480px',
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
                <Box mt={{ base: '26px', md: '34px' }}>
                  <HeroActions
                    onPlay={() => {
                      // the game owns the whole first screen: line the hero up first
                      window.scrollTo(0, 0);
                      handleRef.current?.play();
                      onPlay?.();
                    }}
                  />
                </Box>
              </Flex>
            </Box>
          </Flex>

          <Flex justify="center" pb="18px">
            <Box
              asChild
              {...mono}
              fontSize="11px"
              letterSpacing=".3em"
              px="12px"
              py="6px"
              textDecoration="none"
              pointerEvents="auto"
              opacity={0.6}
              transition="opacity 0.15s ease"
              _hover={{ opacity: 1 }}
              _focusVisible={focusRing}
            >
              <RouterLink to={{ pathname: '/', hash: '#about' }} aria-label="Scroll to the about section">
                SCROLL ↓
              </RouterLink>
            </Box>
          </Flex>
        </Flex>
      </motion.div>

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
        EXIT — ESC
      </Box>
    </Box>
  );
};

export default DescentHero;

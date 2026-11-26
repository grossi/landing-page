import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { motion, useScroll } from 'framer-motion';
import Header from 'components/layout/Header';
import DescentHero from 'components/home/DescentHero';
import { focusRing, label, tone } from 'components/home/Section';
import { About, Contact, ExperienceStrip, SelectedWork, Writing } from 'components/home/sections';

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth');

// The main page, mock B "Descent": the DEEP FIELD hero is the first screen
// of a page that scrolls on through about, selected work, experience,
// writing and contact. The window itself scrolls (as in PageLayout) and the
// header stays stuck on top.
const Home = () => {
  const headerRef = useRef<HTMLDivElement>(null);
  // the header is taller on a phone (its menu button); the hero and the
  // section anchors are sized against the real thing
  const [headerHeight, setHeaderHeight] = useState(61);
  const { scrollYProgress } = useScroll();
  // while the hero is a game the rest of the page is inert, so focus (Tab)
  // cannot scroll the locked page out from under it
  const [inFlight, setInFlight] = useState(false);
  const descend = useCallback(
    () => document.getElementById('about')?.scrollIntoView({ behavior: scrollBehavior() }),
    [],
  );

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => setHeaderHeight(header.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // The router keeps the scroll position across routes; the other pages
  // expect to open at their top, so leave Home there.
  useLayoutEffect(() => () => window.scrollTo(0, 0), []);

  return (
    <Box
      bg="black"
      color="white"
      minH="100vh"
      style={{ '--home-header-h': `${headerHeight}px` } as CSSProperties}
    >
      {/* Header is sticky inside its parent, so this wrapper is what sticks
          for the whole page; it also carries the scroll progress line. */}
      <Box ref={headerRef} position="sticky" top={0} zIndex={1100}>
        <Header />
        <motion.div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 1,
            background: 'white',
            transformOrigin: 'left',
            // above Header's own sticky bar, over its bottom border
            zIndex: 1101,
            scaleX: scrollYProgress,
          }}
        />
      </Box>

      <main>
        <DescentHero
          headerHeight={headerHeight}
          onDescend={descend}
          onFlightChange={setInFlight}
        />
        <Box inert={inFlight}>
          <About />
          <SelectedWork />
          <ExperienceStrip />
          <Writing />
          <Contact />
        </Box>
      </main>

      <Box as="footer" inert={inFlight} borderTop={`1px solid ${tone.line}`} px="34px">
        <Flex maxW="1280px" mx="auto" py="28px" align="center" justify="space-between" gap={4}>
          <Text {...label} fontSize="11px" color={tone.dim}>
            © {new Date().getFullYear()} Gabriel Rossi
          </Text>
          <Box
            as="button"
            onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
            {...label}
            fontSize="11px"
            color={tone.soft}
            bg="transparent"
            cursor="pointer"
            transition="color 0.15s ease"
            _hover={{ color: 'white' }}
            _focusVisible={focusRing}
          >
            Back to top ↑
          </Box>
        </Flex>
      </Box>
    </Box>
  );
};

export default Home;

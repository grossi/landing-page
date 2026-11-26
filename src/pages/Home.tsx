import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { useLocation, useNavigationType } from 'react-router';
import { motion, useScroll } from 'framer-motion';
import Header from 'components/layout/Header';
import DescentHero from 'components/home/DescentHero';
import type { DescentHeroHandle } from 'components/home/DescentHero';
import { focusRing, FOOTER_HEIGHT, label, tone } from 'components/home/Section';
import { homeSections, pickActiveSection, sectionFromHash } from 'components/home/sectionNav';
import type { SectionId } from 'components/home/sectionNav';
import { About, Contact, ExperienceStrip, SelectedWork, Writing } from 'components/home/sections';

type ScrollTarget = SectionId | 'top';

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Goes to a section or the top: glides when `smooth`, unless the visitor
 * asked for less motion. Keyboard focus goes with it to the section's
 * heading, as it would on a native fragment link: the next Tab continues
 * from the section, not from the link that was pressed (which, in the phone
 * menu, is gone by then).
 */
function scrollToTarget(target: ScrollTarget, smooth: boolean) {
  const behavior: ScrollBehavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
  if (target === 'top') {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  const section = document.getElementById(target);
  if (!section) return;
  // each section's scroll-margin-top keeps its heading clear of the sticky header
  section.scrollIntoView({ behavior, block: 'start' });
  section.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
}

/** How far down the space under the header a section's top must be to count as "in view". */
const ACTIVE_LINE = 0.35;

// The home page: the DEEP FIELD hero is the first screen of a page that
// scrolls on through about, selected work, experience, writing and contact.
// The window itself scrolls (as in PageLayout) and the header, stuck on top,
// is the page's table of contents: its entries link to `/#<section>`, and
// this component turns the fragment into a scroll.
const Home = () => {
  const pageRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<DescentHeroHandle>(null);
  // the header is taller on a phone (its menu button); the hero and the
  // section anchors are sized against the real thing
  const [headerHeight, setHeaderHeight] = useState(61);
  const { scrollYProgress } = useScroll();
  // while the hero is a game the rest of the page is inert, so focus (Tab)
  // cannot scroll the locked page out from under it
  const [inFlight, setInFlight] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => {
      // Written to the element here, not through a render: the layout must
      // be final before the arrival scroll below measures it.
      pageRef.current?.style.setProperty('--home-header-h', `${header.offsetHeight}px`);
      setHeaderHeight(header.offsetHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // The router keeps the scroll position across routes; the other pages
  // expect to open at their top, so leave Home there.
  useLayoutEffect(() => () => window.scrollTo(0, 0), []);

  // ---- the address decides where the page is scrolled ----
  // A link to `/#work` (a header entry, a hero action, a link on another
  // page, a fresh load, back and forward) lands on that section; a link to
  // `/` (the logo) lands at the top. Arriving on the page jumps; a link
  // followed while already here glides.
  const location = useLocation();
  const navigationType = useNavigationType();
  // the navigation that brought the visitor to this page, until they follow
  // another one
  const arrivalKey = useRef<string | null>(null);
  const movedOn = useRef(false);
  const inFlightRef = useRef(false);
  const pending = useRef<ScrollTarget | null>(null);

  useEffect(() => {
    // Arriving is judged by the navigation, not by this effect's first run:
    // StrictMode runs it twice for the same arrival, and both must jump.
    // Coming Back to that first entry later (same key) is not arriving.
    arrivalKey.current ??= location.key;
    if (location.key !== arrivalKey.current) movedOn.current = true;
    const arriving = !movedOn.current;
    const section = sectionFromHash(location.hash);
    // No fragment: a link to the page is a link to its top. A reload or
    // back/forward (POP) is left to the browser's own scroll restoration.
    const target: ScrollTarget | null =
      section ?? (location.hash === '' && navigationType !== 'POP' ? 'top' : null);
    if (!target) {
      // This navigation asks for no scroll (Back to `/`, say), so it also
      // withdraws one an earlier navigation left queued behind an exit.
      pending.current = null;
      return;
    }
    if (inFlightRef.current) {
      // The hero is a game and the page is locked under it: leave the game
      // first, and go once the title screen is back (below).
      pending.current = target;
      heroRef.current?.exit();
      return;
    }
    scrollToTarget(target, !arriving);
    // location.key changes on every navigation, so following the same link
    // twice scrolls twice
  }, [location.key, location.hash, navigationType]);

  useEffect(() => {
    inFlightRef.current = inFlight;
    if (!inFlight && pending.current) {
      scrollToTarget(pending.current, true);
      pending.current = null;
    }
  }, [inFlight]);

  // ---- the section in view, for the header ----
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const header = headerRef.current?.offsetHeight ?? 0;
      const line = header + (window.innerHeight - header) * ACTIVE_LINE;
      const tops = homeSections.flatMap(({ id }) => {
        const section = document.getElementById(id);
        return section ? [{ id, top: section.getBoundingClientRect().top }] : [];
      });
      const page = document.documentElement;
      const atPageEnd =
        window.scrollY > 0 && window.scrollY + window.innerHeight >= page.scrollHeight - 2;
      setActiveSection(pickActiveSection(tops, line, atPageEnd));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const backToTop = useCallback(() => scrollToTarget('top', true), []);
  // PLAY pressed while an exit was fading in: the visitor chose the game
  // over the link they followed, so that scroll is off.
  const forgetPending = useCallback(() => {
    pending.current = null;
  }, []);

  return (
    <Box ref={pageRef} bg="black" color="white" minH="100vh">
      {/* Measured for the hero and the section anchors; also carries the
          scroll progress line. Header is sticky inside it, so this wrapper
          is what sticks for the whole page. */}
      <Box ref={headerRef} position="sticky" top={0} zIndex={1100}>
        <Header activeSection={activeSection} />
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
          ref={heroRef}
          headerHeight={headerHeight}
          onFlightChange={setInFlight}
          onPlay={forgetPending}
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
        <Flex maxW="1280px" mx="auto" minH={FOOTER_HEIGHT} align="center" justify="space-between" gap={4}>
          <Text {...label} fontSize="11px" color={tone.soft}>
            © {new Date().getFullYear()} Gabriel Rossi
          </Text>
          <Box
            as="button"
            onClick={backToTop}
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

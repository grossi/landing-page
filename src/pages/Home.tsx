import { useLayoutEffect, useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import Header from 'components/layout/Header';
import FieldPanel from 'components/home/FieldPanel';
import Identity from 'components/home/Identity';
import Manifest from 'components/home/Manifest';

// The main page as an index ("Manifest"): who Gabriel is and what he has
// built lead the page; the DEEP FIELD drift sits beside them as a framed
// viewport. On wide screens identity and viewport share the left column and
// the project manifest takes the right; on a phone they stack in that order
// and the window scrolls. Pressing PLAY expands the viewport over the content.
const Home = () => {
  const mainRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [fieldExpanded, setFieldExpanded] = useState(false);

  // The header is sticky at the top of the viewport, so the main area's
  // offset in the document is its height.
  useLayoutEffect(() => {
    const measure = () => {
      if (mainRef.current) {
        setHeaderHeight(Math.round(mainRef.current.getBoundingClientRect().top + window.scrollY));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // `inert` takes the hidden content out of the tab order and the pointer's
  // reach while the field covers it.
  const content = {
    inert: fieldExpanded,
    opacity: fieldExpanded ? 0 : 1,
    transition: 'opacity 300ms ease',
  };

  return (
    <Box minH="100dvh" bg="black">
      <Header />

      <Box
        ref={mainRef}
        as="main"
        minH={`calc(100dvh - ${headerHeight}px)`}
        display="flex"
        px={{ base: '20px', md: '34px' }}
        pt={{ base: '28px', lg: '36px' }}
        pb={{ base: '40px', lg: '28px' }}
      >
        <Box
          flex="1"
          w="100%"
          maxW="1280px"
          mx="auto"
          display="grid"
          gridTemplateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 5fr) minmax(0, 7fr)' }}
          columnGap="56px"
          rowGap="36px"
        >
          <Flex direction="column" gap={{ base: '28px', lg: '26px' }}>
            <Box {...content}>
              <Identity />
            </Box>
            <FieldPanel topOffset={headerHeight} onExpandedChange={setFieldExpanded} />
          </Flex>

          <Box {...content}>
            <Manifest />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Home;

import { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Spacer,
  Container,
  HStack,
  IconButton,
  VStack,
} from '@chakra-ui/react';
import { Link as RouterLink, useLocation } from 'react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { FaBars, FaTimes } from 'react-icons/fa';
import { navSections, sectionForPage } from 'components/home/sectionNav';
import type { SectionId } from 'components/home/sectionNav';
import { monoFont } from 'config/site';

const MotionBox = motion(Box);

const mono = {
  fontFamily: monoFont,
  color: 'white',
} as const;

const MENU_ID = 'site-menu';

interface HeaderProps {
  /**
   * On the home page, the section in view (null on the hero). Other pages
   * leave it out: there the entry of the page's own section is marked.
   */
  activeSection?: SectionId | null;
}

// The header is the home page's table of contents on every page: each entry
// links to `/#<section>`. On the home page that scrolls to the section (Home
// reacts to the fragment); from another page it opens the home page there.
const Header = ({ activeSection }: HeaderProps) => {
  const { pathname } = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const onHome = pathname === '/';
  const current = onHome ? (activeSection ?? null) : sectionForPage(pathname);
  // "location": where the visitor is within this page. On a full page the
  // entry is the page's section, but the link itself leads to the home page,
  // so it is not "page".
  const currentToken = onHome ? 'location' : 'true';
  const isActive = (id: SectionId) => id === current;

  return (
    // Above all page content — the timeline uses z-indexes up to 100 internally.
    <Box
      bg="black"
      px="34px"
      py="20px"
      position="sticky"
      top={0}
      zIndex={1100}
      borderBottom="1px solid rgba(255,255,255,.15)"
    >
      <Container maxW="container.xl" px={0}>
        <Flex align="baseline">
          <RouterLink to="/" style={{ textDecoration: 'none' }}>
            <Text {...mono} fontSize="14px" fontWeight="bold" letterSpacing=".3em">
              GROSSI.TECH
            </Text>
          </RouterLink>

          <Spacer />

          <HStack as="nav" aria-label="Site" display={{ base: 'none', md: 'flex' }} gap="26px">
            {navSections.map((section) => (
              <RouterLink
                key={section.id}
                to={{ pathname: '/', hash: `#${section.id}` }}
                aria-current={isActive(section.id) ? currentToken : undefined}
                style={{ textDecoration: 'none' }}
              >
                <Text
                  {...mono}
                  fontSize="12px"
                  letterSpacing=".22em"
                  opacity={isActive(section.id) ? 1 : 0.55}
                  borderBottom={
                    isActive(section.id)
                      ? '1px solid rgba(255,255,255,.7)'
                      : '1px solid transparent'
                  }
                  transition="opacity 0.15s ease, border-color 0.15s ease"
                  _hover={{ opacity: 1, borderBottomColor: 'whiteAlpha.500' }}
                >
                  {section.nav}
                </Text>
              </RouterLink>
            ))}
          </HStack>

          <IconButton
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls={MENU_ID}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            variant="ghost"
            color="white"
            borderRadius={0}
            _hover={{ bg: 'whiteAlpha.200' }}
            display={{ base: 'flex', md: 'none' }}
          >
            {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
          </IconButton>
        </Flex>
      </Container>

      {/* Hangs from the bar's bottom edge, whatever height the bar is. */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <MotionBox
            id={MENU_ID}
            position="absolute"
            top="100%"
            left={0}
            right={0}
            mt="1px"
            bg="black"
            borderBottom="1px solid rgba(255,255,255,.15)"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            display={{ base: 'block', md: 'none' }}
          >
            <VStack as="nav" aria-label="Site" gap={0} align="stretch" p={4}>
              {navSections.map((section) => (
                <RouterLink
                  key={section.id}
                  to={{ pathname: '/', hash: `#${section.id}` }}
                  aria-current={isActive(section.id) ? currentToken : undefined}
                  style={{ textDecoration: 'none' }}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Box
                    p={3}
                    borderRadius={0}
                    border={
                      isActive(section.id)
                        ? '1px solid rgba(255,255,255,.35)'
                        : '1px solid transparent'
                    }
                    _hover={{ bg: 'whiteAlpha.100' }}
                    display="block"
                  >
                    <Text
                      {...mono}
                      fontSize="12px"
                      letterSpacing=".22em"
                      opacity={isActive(section.id) ? 1 : 0.55}
                    >
                      {section.nav}
                    </Text>
                  </Box>
                </RouterLink>
              ))}
            </VStack>
          </MotionBox>
        )}
      </AnimatePresence>
    </Box>
  );
};

export default Header;

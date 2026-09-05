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
import { monoFont } from 'config/site';

const MotionBox = motion(Box);

const mono = {
  fontFamily: monoFont,
  color: 'white',
} as const;

const navItems = [
  { name: 'EXPERIENCE', path: '/experience' },
  { name: 'BLOG', path: '/blog' },
  { name: 'PROJECTS', path: '/arcade' },
];

const Header = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Above all page content — the timeline uses z-indexes up to 100 internally. */}
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

            <HStack display={{ base: 'none', md: 'flex' }} gap="26px">
              {navItems.map((item) => (
                <RouterLink
                  key={item.path}
                  to={item.path}
                  style={{ textDecoration: 'none' }}
                >
                  <Text
                    {...mono}
                    fontSize="12px"
                    letterSpacing=".22em"
                    opacity={isActive(item.path) ? 1 : 0.55}
                    borderBottom={
                      isActive(item.path)
                        ? '1px solid rgba(255,255,255,.7)'
                        : '1px solid transparent'
                    }
                    _hover={{ opacity: 1, borderBottomColor: 'whiteAlpha.500' }}
                  >
                    {item.name}
                  </Text>
                </RouterLink>
              ))}
            </HStack>

            <IconButton
              aria-label="Toggle menu"
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
      </Box>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <MotionBox
            position="fixed"
            top="61px"
            left={0}
            right={0}
            bg="black"
            borderBottom="1px solid rgba(255,255,255,.15)"
            zIndex={1000}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            display={{ base: 'block', md: 'none' }}
          >
            <VStack gap={0} align="stretch" p={4}>
              {navItems.map((item) => (
                <RouterLink
                  key={item.path}
                  to={item.path}
                  style={{ textDecoration: 'none' }}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Box
                    p={3}
                    borderRadius={0}
                    border={
                      isActive(item.path)
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
                      opacity={isActive(item.path) ? 1 : 0.55}
                    >
                      {item.name}
                    </Text>
                  </Box>
                </RouterLink>
              ))}
            </VStack>
          </MotionBox>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;

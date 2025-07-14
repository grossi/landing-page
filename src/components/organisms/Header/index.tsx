import React, { useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Center,
  Spacer,
  Container,
  HStack,
  IconButton,
  VStack,
} from '@chakra-ui/react';
import { ColorModeButton } from 'components/ui/color-mode';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FaBars, FaTimes } from 'react-icons/fa';

const MotionBox = motion(Box);

const navItems = [
  { name: 'Blog', path: '/' },
  { name: 'About', path: '/about' },
  { name: 'Projects', path: '/projects' },
  { name: 'Experience', path: '/experience' },
  { name: 'Contact', path: '/contact' },
];

const Header = () => {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      <Box bg={{ base: 'gray.100', _dark: 'gray.700' }} p={3} position="sticky" top={0} zIndex={10}>
        <Container maxW="container.xl">
          <Flex align="center">
            <RouterLink to="/" style={{ textDecoration: 'none' }}>
              <Center>
                <Text fontSize="2xl" fontWeight="bold" color={{ base: 'gray.800', _dark: 'white' }}>
                  Gabriel Rossi
                </Text>
              </Center>
            </RouterLink>
            
            <Spacer />
            
            <HStack display={{ base: 'none', md: 'flex' }} gap={8} mr={8}>
              {navItems.map((item) => (
                <RouterLink
                  key={item.path}
                  to={item.path}
                  style={{ textDecoration: 'none' }}
                >
                  <Box
                    position="relative"
                    color={{ base: 'gray.600', _dark: 'gray.300' }}
                    fontWeight="medium"
                    _hover={{ 
                      color: { base: 'purple.600', _dark: 'purple.400' }
                    }}
                  >
                    {item.name}
                    {isActive(item.path) && (
                      <MotionBox
                        position="absolute"
                        bottom="-8px"
                        left={0}
                        right={0}
                        height="2px"
                        bg={{ base: 'purple.600', _dark: 'purple.400' }}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}
                  </Box>
                </RouterLink>
              ))}
            </HStack>
            
            <IconButton
              aria-label="Toggle menu"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              variant="ghost"
              mr={2}
              display={{ base: 'flex', md: 'none' }}
            >
              {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
            </IconButton>
            
            <ColorModeButton />
          </Flex>
        </Container>
      </Box>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <MotionBox
            position="fixed"
            top="60px"
            left={0}
            right={0}
            bg={{ base: 'white', _dark: 'gray.800' }}
            shadow="lg"
            zIndex={9}
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
                    borderRadius="md"
                    bg={isActive(item.path) ? { base: 'purple.100', _dark: 'purple.900' } : 'transparent'}
                    color={isActive(item.path) ? { base: 'purple.700', _dark: 'purple.200' } : { base: 'gray.700', _dark: 'gray.300' }}
                    fontWeight={isActive(item.path) ? 'bold' : 'medium'}
                    _hover={{ 
                      bg: { base: 'gray.100', _dark: 'gray.700' }
                    }}
                    display="block"
                  >
                    {item.name}
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
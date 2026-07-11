import * as React from 'react';
import { Box, Container } from '@chakra-ui/react';
import Header from 'components/layout/Header';

interface PageLayoutProps {
  children: React.ReactNode;
  maxW?: string;
  px?: number | object;
  py?: number | object;
}

// The window itself scrolls (no inner scroll container) so that
// window-based effects like Timeline's useScroll work; Header handles
// its own stickiness.
const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  maxW = 'container.xl',
  px = 4,
  py = 12
}) => {
  return (
    <Box
      minHeight="100vh"
      bg={{ base: 'gray.50', _dark: 'gray.800' }}
      color={{ base: 'gray.800', _dark: 'white' }}
    >
      <Header />
      <Container maxW={maxW} px={px} py={py}>
        {children}
      </Container>
    </Box>
  );
};

export default PageLayout;

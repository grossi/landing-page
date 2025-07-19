import * as React from 'react';
import { Box, Container } from '@chakra-ui/react';
import Header from 'components/organisms/Header';

interface PageLayoutProps {
  children: React.ReactNode;
  maxW?: string;
  px?: number | object;
  py?: number | object;
}

const PageLayout: React.FC<PageLayoutProps> = ({ 
  children, 
  maxW = 'container.xl',
  px = 4,
  py = 12 
}) => {
  return (
    <Box 
      display="flex"
      flexDirection="column"
      height="100vh"
      bg={{ base: 'gray.50', _dark: 'gray.800' }} 
      color={{ base: 'gray.800', _dark: 'white' }}
    >
      <Box position="sticky" top={0} zIndex={10} bg={{ base: 'gray.50', _dark: 'gray.800' }}>
        <Header />
      </Box>
      <Box flex="1" overflowY="auto">
        <Container maxW={maxW} px={px} py={py}>
          {children}
        </Container>
      </Box>
    </Box>
  );
};

export default PageLayout;
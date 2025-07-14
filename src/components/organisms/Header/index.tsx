import React from 'react';
import {
  Box,
  Flex,
  Link,
  Text,
  Center,
  Spacer,
  Container,
} from '@chakra-ui/react';
import { ColorModeButton } from 'components/ui/color-mode';

const Header = () => {
  return (
    <Box bg={{ base: 'gray.100', _dark: 'gray.700' }} p={3}>
      <Container maxW="container.xl">
        <Flex>
          <Link href="/">
            <Center>
              <Text fontSize="2xl" color={{ base: 'gray.800', _dark: 'white' }}>Gabriel Rossi</Text>
            </Center>
          </Link>
          <Spacer />
          <ColorModeButton />
        </Flex>
      </Container>
    </Box>
  );
};

export default Header;

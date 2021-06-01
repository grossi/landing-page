import React from 'react';
import {
  Box,
  Button,
  Flex,
  Link,
  Text,
  Center,
  Spacer,
  Container,
  useColorMode,
  useColorModeValue,
} from '@chakra-ui/react';
import { MoonIcon, SunIcon } from '@chakra-ui/icons';

const Header = () => {
  const { colorMode, toggleColorMode } = useColorMode();
  const bg = useColorModeValue('gray.100', 'gray.700');

  return (
    <Box bg={bg} p={3}>
      <Container maxW="container.xl">
        <Flex>
          <Link href="\">
            <Center>
              <Text fontSize="2xl">Gabriel Rossi</Text>
            </Center>
          </Link>
          <Spacer />
          <Button onClick={toggleColorMode}>
            {colorMode === 'light' ? <MoonIcon /> : <SunIcon />}
          </Button>
        </Flex>
      </Container>
    </Box>
  );
};

export default Header;

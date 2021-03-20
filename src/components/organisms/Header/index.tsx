import React from "react";
import { Box, Flex, Text, Center, Container } from "@chakra-ui/react";

const Header = () => {
  return (
    <Box bg="gray.100" p={3}>
      <Container maxW="container.lg">
        <Flex>
          <Center>
            <Text fontSize="2xl">Gabriel Rossi</Text>
          </Center>
        </Flex>
      </Container>
    </Box>
  );
};

export default Header;

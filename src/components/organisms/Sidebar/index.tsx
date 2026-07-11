import React from 'react';
import { Box, Flex, Text, Center } from '@chakra-ui/react';
import SocialLinks from 'components/molecules/SocialLinks';
import { socialLinks } from 'config/site';

const Sidebar = () => {
  return (
    <Box p={3}>
      <Flex direction="column">
        <Center>
          <Text fontSize="2xl" color={{ base: "gray.800", _dark: "white" }}>Hello!</Text>
        </Center>
        <SocialLinks links={socialLinks} />
      </Flex>
    </Box>
  );
}

export default Sidebar;

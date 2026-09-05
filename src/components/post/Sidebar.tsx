import { Box, Flex, Text } from '@chakra-ui/react';
import SocialLinks from 'components/post/SocialLinks';
import { monoFont as mono, socialLinks } from 'config/site';

const Sidebar = () => {
  return (
    <Box
      p={4}
      bg="black"
      border="1px solid rgba(255,255,255,.25)"
      borderRadius={0}
    >
      <Flex direction="column">
        <Text
          fontFamily={mono}
          fontSize="13px"
          fontWeight="bold"
          textTransform="uppercase"
          letterSpacing=".26em"
          color="white"
          textAlign="left"
          pb={3}
          borderBottom="1px solid rgba(255,255,255,.15)"
        >
          Hello!
        </Text>
        <SocialLinks links={socialLinks} />
      </Flex>
    </Box>
  );
}

export default Sidebar;

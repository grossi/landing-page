import React from 'react';
import { Box, Flex, Text, Center, Link } from '@chakra-ui/react';
import SocialLinks, { SocialLinksProps } from 'components/molecules/SocialLinks';

export interface SidebarProps {
  socialInfo: SocialLinksProps;
}

const Sidebar = (props: SidebarProps) => {
  return (
    <Box p={3}>
        <Flex direction="column">
          <Center>
            <Text fontSize="2xl" color={{ base: "gray.800", _dark: "white" }}>Hello!</Text>
          </Center>
          <SocialLinks links={props.socialInfo.links} />
          {/* <Link href="/about">
            <Text fontSize="2xl" color={{ base: "gray.800", _dark: "white" }}>
              About me
            </Text>
          </Link> */}
        </Flex>
    </Box>
  );
}

export default Sidebar;

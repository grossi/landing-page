import React from 'react';
import { Box, Flex, Text, Center } from '@chakra-ui/react';
import SocialLinks, { SocialLinksProps } from 'components/molecules/SocialLinks';

export interface SidebarProps {
  socialInfo: SocialLinksProps;
}

const Sidebar = (props: SidebarProps) => {
  return (
    <Box p={3}>
        <Flex direction="column">
          <Center>
            <Text fontSize="2xl">Hello!</Text>
          </Center>
          <SocialLinks links={props.socialInfo.links} />
        </Flex>
    </Box>
  );
}

export default Sidebar;

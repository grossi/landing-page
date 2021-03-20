import * as React from "react";
import { Box, Flex, Text, Spacer, Link } from "@chakra-ui/react";
import SideTitle from "components/atoms/SideTitle";

export interface SocialLinksProps {
  links: {
    linkedin: string,
    github: string,
    twitter: string,
    email: string
  }
}

const SocialLinks = (props: SocialLinksProps) => {
  const { links } = props;
  return (
    <Box p={3}>
      <Flex direction="column">
        <SideTitle title="Connect" />
        <Spacer />
        <Flex direction="column">
          <Link href={links.linkedin} isExternal>
            <Text fontSize="lg">LinkedIn</Text>
          </Link>
          <Spacer />
          <Link href={links.github} isExternal>
            <Text fontSize="lg">Github</Text>
          </Link>
          <Spacer />
          <Link href={links.twitter} isExternal>
            <Text fontSize="lg">Twitter</Text>
          </Link>
          <Spacer />
          <Link href={links.email} isExternal>
            <Text fontSize="lg">Email</Text>
          </Link>
        </Flex>
      </Flex>
    </Box>
  );
};

export default SocialLinks;

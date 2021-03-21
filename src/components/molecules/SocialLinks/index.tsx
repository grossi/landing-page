import * as React from "react";
import { Box, Flex, Text, Spacer, Link, Center } from "@chakra-ui/react";
import SideTitle from "components/atoms/SideTitle";
import { Icon } from "@chakra-ui/react";
import { FaTwitter } from "react-icons/fa";
import { FaLinkedin } from "react-icons/fa";
import { FaGithub } from "react-icons/fa";
import { FaRegEnvelope } from "react-icons/fa";

export interface SocialLinksProps {
  links: {
    linkedin: string;
    github: string;
    twitter: string;
    email: string;
  };
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
            <Flex>
              <Center>
                <Icon mr={2} as={FaLinkedin} />
                <Text fontSize="lg">LinkedIn</Text>
              </Center>
            </Flex>
          </Link>
          <Spacer />
          <Link href={links.github} isExternal>
            <Flex>
              <Center>
                <Icon mr={2} as={FaGithub} />
                <Text fontSize="lg">Github</Text>
              </Center>
            </Flex>
          </Link>
          <Spacer />
          <Link href={links.twitter} isExternal>
            <Flex>
              <Center>
                <Icon mr={2} as={FaTwitter} />
                <Text fontSize="lg">Twitter</Text>
              </Center>
            </Flex>
          </Link>
          <Spacer />
          <Link href={links.email} isExternal>
            <Flex>
              <Center>
                <Icon mr={2} as={FaRegEnvelope} />
                <Text fontSize="lg">Email</Text>
              </Center>
            </Flex>
          </Link>
        </Flex>
      </Flex>
    </Box>
  );
};

export default SocialLinks;

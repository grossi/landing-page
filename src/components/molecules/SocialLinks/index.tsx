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
          <Link href={links.linkedin} target="_blank" rel="noopener noreferrer">
            <Flex>
              <Center>
                <Icon mr={2} as={FaLinkedin} color={{ base: "gray.800", _dark: "white" }} />
                <Text fontSize="lg" color={{ base: "gray.800", _dark: "white" }}>LinkedIn</Text>
              </Center>
            </Flex>
          </Link>
          <Spacer />
          <Link href={links.github} target="_blank" rel="noopener noreferrer">
            <Flex>
              <Center>
                <Icon mr={2} as={FaGithub} color={{ base: "gray.800", _dark: "white" }} />
                <Text fontSize="lg" color={{ base: "gray.800", _dark: "white" }}>Github</Text>
              </Center>
            </Flex>
          </Link>
          <Spacer />
          <Link href={links.twitter} target="_blank" rel="noopener noreferrer">
            <Flex>
              <Center>
                <Icon mr={2} as={FaTwitter} color={{ base: "gray.800", _dark: "white" }} />
                <Text fontSize="lg" color={{ base: "gray.800", _dark: "white" }}>Twitter</Text>
              </Center>
            </Flex>
          </Link>
          <Spacer />
          <Link href={links.email} target="_blank" rel="noopener noreferrer">
            <Flex>
              <Center>
                <Icon mr={2} as={FaRegEnvelope} color={{ base: "gray.800", _dark: "white" }} />
                <Text fontSize="lg" color={{ base: "gray.800", _dark: "white" }}>Email</Text>
              </Center>
            </Flex>
          </Link>
        </Flex>
      </Flex>
    </Box>
  );
};

export default SocialLinks;

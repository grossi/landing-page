import * as React from "react";
import { Box, Flex, Text, Link, Center, Icon } from "@chakra-ui/react";
import { FaTwitter, FaLinkedin, FaGithub, FaRegEnvelope } from "react-icons/fa";
import { SocialLinks as SocialLinksConfig } from "config/site";

export interface SocialLinksProps {
  links: SocialLinksConfig;
}

const linkItems: Array<{ key: keyof SocialLinksConfig; label: string; icon: React.ElementType }> = [
  { key: "linkedin", label: "LinkedIn", icon: FaLinkedin },
  { key: "github", label: "Github", icon: FaGithub },
  { key: "twitter", label: "Twitter", icon: FaTwitter },
  { key: "email", label: "Email", icon: FaRegEnvelope },
];

const SocialLinks = ({ links }: SocialLinksProps) => {
  return (
    <Box p={3}>
      <Flex direction="column">
        <Box
          borderBottom="4px solid"
          borderBottomColor={{ base: "gray.100", _dark: "gray.600" }}
          py={1}
          mb={6}
        >
          <Text fontSize="xl" color={{ base: "gray.800", _dark: "white" }}>Connect</Text>
        </Box>
        <Flex direction="column" gap={1}>
          {linkItems.map(({ key, label, icon }) => (
            <Link key={key} href={links[key]} target="_blank" rel="noopener noreferrer">
              <Center>
                <Icon mr={2} as={icon} color={{ base: "gray.800", _dark: "white" }} />
                <Text fontSize="lg" color={{ base: "gray.800", _dark: "white" }}>{label}</Text>
              </Center>
            </Link>
          ))}
        </Flex>
      </Flex>
    </Box>
  );
};

export default SocialLinks;

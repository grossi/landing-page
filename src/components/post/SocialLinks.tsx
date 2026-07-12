import * as React from "react";
import { Box, Flex, Text, Link, Icon } from "@chakra-ui/react";
import { FaLinkedin, FaGithub, FaRegEnvelope } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { SocialLinks as SocialLinksConfig } from "config/site";

const mono = 'ui-monospace, "SF Mono", Menlo, monospace';

export interface SocialLinksProps {
  links: SocialLinksConfig;
}

const linkItems: Array<{ key: keyof SocialLinksConfig; label: string; icon: React.ElementType }> = [
  { key: "linkedin", label: "LinkedIn", icon: FaLinkedin },
  { key: "github", label: "Github", icon: FaGithub },
  { key: "twitter", label: "X", icon: FaXTwitter },
  { key: "email", label: "Email", icon: FaRegEnvelope },
];

const SocialLinks = ({ links }: SocialLinksProps) => {
  return (
    <Box p={3}>
      <Flex direction="column">
        <Box
          borderBottom="1px solid rgba(255,255,255,.15)"
          py={1}
          mb={6}
        >
          <Text
            fontFamily={mono}
            fontSize="12px"
            fontWeight="bold"
            textTransform="uppercase"
            letterSpacing=".26em"
            color="white"
            opacity={0.7}
          >
            Connect
          </Text>
        </Box>
        <Flex direction="column" gap={2}>
          {linkItems.map(({ key, label, icon }) => (
            <Link key={key} href={links[key]} target="_blank" rel="noopener noreferrer" _hover={{ textDecoration: 'none' }}>
              <Flex align="center" justify="flex-start" gap={2} opacity={0.7} _hover={{ opacity: 1 }}>
                <Icon as={icon} color="white" boxSize="14px" />
                <Text
                  fontFamily={mono}
                  fontSize="12px"
                  textTransform="uppercase"
                  letterSpacing=".18em"
                  color="white"
                >
                  {label}
                </Text>
              </Flex>
            </Link>
          ))}
        </Flex>
      </Flex>
    </Box>
  );
};

export default SocialLinks;

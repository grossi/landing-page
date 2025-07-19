import * as React from "react";
import { Box, Text } from "@chakra-ui/react";

interface SideTitleProps {
  title: string;
}

const SideTitle = (props: SideTitleProps) => {
  return (
    <React.Fragment>
      <Box borderBottom="4px solid" borderBottomStyle="solid" borderBottomColor={{ base: "gray.100", _dark: "gray.600" }} py={1} mb={6}>
        <Text fontSize="xl" color={{ base: "gray.800", _dark: "white" }}>{props.title}</Text>
      </Box>
    </React.Fragment>
  );
};

export default SideTitle;

import * as React from "react";
import { Box, Text } from "@chakra-ui/react";

interface SideTitleProps {
  title: string;
}

const SideTitle = (props: SideTitleProps) => {
  return (
    <React.Fragment>
      <Box borderBottom="4px solid" borderBottomStyle="solid" borderBottomColor="gray.100" py={1} mb={6}>
        <Text fontSize="xl">{props.title}</Text>
      </Box>
    </React.Fragment>
  );
};

export default SideTitle;

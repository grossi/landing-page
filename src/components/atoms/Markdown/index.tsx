import * as React from "react";
import ReactMarkdown from "markdown-to-jsx";
import { Box, Link, Text } from "@chakra-ui/react";

function MarkdownListItem(props: any) {
  return (
    <Box pl={16} py={1}>
      <li>
        <Text component="span" {...props} />
      </li>
    </Box>
  );
}

const options = {
  overrides: {
    h1: {
      component: Text,
      props: {
        fontSize: "6xl",
        my: 4,
      },
    },
    h2: {
      component: Text,
      props: {
        fontSize: "4xl",
        my: 2,
      },
    },
    h3: {
      component: Text,
      props: { fontSize: "lg", ml: 6, my: 2 },
    },
    h4: {
      component: Text,
      props: {
        fontSize: "lg",
      },
    },
    p: {
      component: Text,
      props: { 
        fontSize: "md",
        ml: 10,
        mb: 4
      },
    },
    a: { component: Link, props: { isExternal: true } },
    li: {
      component: MarkdownListItem,
    },
  },
};

export default function Markdown(props: any) {
  return <ReactMarkdown options={options} {...props} />;
}

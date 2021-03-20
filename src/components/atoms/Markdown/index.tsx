import * as React from "react";
import ReactMarkdown from "markdown-to-jsx";
import { Box, Link, Text, Center, Container } from "@chakra-ui/react";

function MarkdownListItem(props: any) {
  return (
    <Box pl={8} py={1}>
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
        fontSize: "4xl",
        my: 4,
      },
    },
    h2: {
      component: Text,
      props: {
        fontSize: "2xl",
        my: 2,
      },
    },
    h3: {
      component: Text,
      props: { fontSize: "lg" },
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
        m: 2
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

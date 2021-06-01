import * as React from 'react';
import ReactMarkdown from 'markdown-to-jsx';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDarkReasonable } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { Box, Link, Text } from '@chakra-ui/react';

function MarkdownListItem(props: any) {
  return (
    <Box pl={16} py={1}>
      <li>
        <Text component="span" {...props} />
      </li>
    </Box>
  );
}

function MarkdownCode(props: any) {
  return (
    <Box mx={[null, 2, 4, 6]} mb={4}>
      <SyntaxHighlighter
        language="typescript"
        style={atomOneDarkReasonable}
        customStyle={{ borderRadius: 6 }}
      >
        {props.children.props.children}
      </SyntaxHighlighter>
    </Box>
  );
}

const options = {
  overrides: {
    h1: {
      component: Text,
      props: {
        fontSize: '6xl',
        my: 4,
      },
    },
    h2: {
      component: Text,
      props: {
        fontSize: '4xl',
        my: 2,
      },
    },
    h3: {
      component: Text,
      props: { fontSize: '2xl', ml: 2, my: 2 },
    },
    h4: {
      component: Text,
      props: {
        fontSize: 'lg',
      },
    },
    h5: {
      component: Text,
      props: {
        fontSize: 'xs',
        mx: [null, 2, 4, 6],
      },
    },
    p: {
      component: Text,
      props: {
        fontSize: 'md',
        mx: [0, 0, 2, 4],
        mb: 4,
      },
    },
    a: { component: Link, props: { isExternal: true } },
    li: {
      component: MarkdownListItem,
    },
    pre: {
      component: MarkdownCode,
    },
  },
};

export default function Markdown(props: any) {
  return <ReactMarkdown options={options} {...props} />;
}

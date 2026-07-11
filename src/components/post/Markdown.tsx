import * as React from 'react';
import ReactMarkdown from 'markdown-to-jsx';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import typescript from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript';
import { atomOneDarkReasonable } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { Box, Link, Text } from '@chakra-ui/react';

// Only the languages used by posts are registered — the full hljs build
// is ~800 kB. Register more here as posts need them.
SyntaxHighlighter.registerLanguage('typescript', typescript);

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
  // markdown-to-jsx renders fenced/indented blocks as <pre><code>, with a
  // `lang-*` class when the fence names a language; raw <pre> HTML in a post
  // may have a plain string child instead.
  const inner = props.children?.props;
  const code = inner ? inner.children : props.children;
  const language = inner?.className?.match(/lang-(\w+)/)?.[1] ?? 'typescript';

  return (
    <Box mx={{ base: 0, sm: 2, md: 4, lg: 6 }} mb={4}>
      <SyntaxHighlighter
        language={language}
        style={atomOneDarkReasonable}
        customStyle={{ borderRadius: 6 }}
      >
        {code}
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
    a: { component: Link, props: { target: '_blank', rel: 'noopener noreferrer' } },
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

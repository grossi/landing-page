import * as React from 'react';
import ReactMarkdown from 'markdown-to-jsx';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import typescript from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript';
import { atomOneDarkReasonable } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { Box, Link, Text } from '@chakra-ui/react';
import { monoFont as mono } from 'config/site';

// Only the languages used by posts are registered — the full hljs build
// is ~800 kB. Register more here as posts need them.
SyntaxHighlighter.registerLanguage('typescript', typescript);

// Strip emoji/pictographs so markdown titles render in the site's
// plain terminal style even when the source file decorates them.
const stripEmoji = (node: React.ReactNode): React.ReactNode => {
  if (typeof node === 'string') {
    return node.replace(/[\p{Extended_Pictographic}️]/gu, '').replace(/^\s+/, '');
  }
  if (Array.isArray(node)) return node.map(stripEmoji);
  return node;
};

function MarkdownH1({ children, ...props }: any) {
  return (
    <Text {...props}>
      {stripEmoji(children)}
    </Text>
  );
}

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
        customStyle={{
          borderRadius: 0,
          border: '1px solid rgba(255,255,255,.2)',
          background: '#050505',
          fontFamily: mono,
        }}
      >
        {code}
      </SyntaxHighlighter>
    </Box>
  );
}

const options = {
  overrides: {
    h1: {
      component: MarkdownH1,
      props: {
        fontSize: '3xl',
        my: 6,
        fontFamily: mono,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '.18em',
        color: 'white',
      },
    },
    h2: {
      component: Text,
      props: {
        fontSize: 'xl',
        my: 4,
        fontFamily: mono,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '.16em',
        color: 'white',
      },
    },
    h3: {
      component: Text,
      props: {
        fontSize: 'md',
        ml: 2,
        my: 3,
        fontFamily: mono,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '.14em',
        color: 'white',
      },
    },
    h4: {
      component: Text,
      props: {
        fontSize: 'sm',
        fontFamily: mono,
        fontWeight: 'bold',
        letterSpacing: '.12em',
        textTransform: 'uppercase',
        color: 'white',
      },
    },
    h5: {
      component: Text,
      props: {
        fontSize: 'xs',
        mx: [null, 2, 4, 6],
        fontFamily: mono,
        letterSpacing: '.12em',
        color: 'whiteAlpha.700',
      },
    },
    p: {
      component: Text,
      props: {
        fontSize: 'md',
        mx: [0, 0, 2, 4],
        mb: 4,
        color: 'whiteAlpha.900',
      },
    },
    a: { component: Link, props: { target: '_blank', rel: 'noopener noreferrer', color: 'white', textDecoration: 'underline' } },
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

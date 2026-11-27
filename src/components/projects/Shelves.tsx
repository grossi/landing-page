import type { FocusEvent, KeyboardEvent } from 'react';
import { Box } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { monoFont as mono } from 'config/site';
import type { Project, ProjectGroup } from 'data/projects';

// Mock E, "Shelves": one row per group, each a sideways strip of small image
// cards. On a desktop all four shelves fit one screen; a strip scrolls
// sideways (touch, trackpad, Tab or the arrow keys) when its cards overflow.

/** Width of the left-hand title column on wide screens. */
const TITLE_COLUMN = '168px';

/**
 * Card width on wide screens: sized from the viewport height so the four
 * shelves fit one screen. There the picture box is 2:1 (half the width tall),
 * cropping a little off the 16:10 screenshot to spend the spare width rather
 * than height; everything else, the text under four rows of cards included,
 * takes about 420px.
 */
const DESKTOP_CARD = 'clamp(200px, calc((100vh - 420px) / 2), 360px)';

/** On a phone a card is narrower than the screen, so the next one peeks in. */
const PHONE_CARD = 'min(68vw, 260px)';

const GREY = '#a1a1aa';
const DIM = '#71717a';
const RULE = '#3f3f46';

/** Where a link goes and how it opens: in-app route, full page, or new tab. */
function linkProps(project: Project) {
  const { href, label } = project.link;
  const name = `${label} ${project.name}: ${project.line}`;
  if (href.startsWith('/') && !href.startsWith('/arcade/')) {
    return { kind: 'route' as const, href, ariaLabel: name };
  }
  // Static arcade pages load as full pages; other sites open in a new tab.
  return href.startsWith('/')
    ? { kind: 'page' as const, href, ariaLabel: name }
    : {
        kind: 'external' as const,
        href,
        ariaLabel: `${name} (opens in a new tab)`,
      };
}

const cardCss = {
  display: 'block',
  height: '100%',
  color: 'white',
  textDecoration: 'none',
  outline: 'none',
  '& [data-frame]': { transition: 'border-color 0.15s ease' },
  '& img': { opacity: 0.82, transition: 'opacity 0.15s ease' },
  '&:hover [data-frame], &:focus-visible [data-frame]': {
    borderColor: 'white',
  },
  '&:hover img, &:focus-visible img': { opacity: 1 },
  '&:hover [data-label], &:focus-visible [data-label]': { color: 'white' },
  '&:focus-visible [data-name]': {
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
};

const CardBody = ({ project }: { project: Project }) => (
  <>
    <Box
      data-frame=""
      position="relative"
      aspectRatio={{ base: '16 / 10', md: '2 / 1' }}
      border={`1px solid ${RULE}`}
      bg="#111"
      overflow="hidden"
    >
      {project.image ? (
        <img
          src={project.image.small.src}
          width={project.image.small.width}
          height={project.image.small.height}
          alt={project.image.alt}
          loading="lazy"
          decoding="async"
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        // No screenshot: the same box, holding the name in type instead.
        <Box
          aria-hidden="true"
          position="absolute"
          inset={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontFamily={mono}
          fontSize="15px"
          letterSpacing="0.14em"
          color={GREY}
          bg="repeating-linear-gradient(135deg, #0d0d0d 0 6px, #111 6px 12px)"
          textTransform="uppercase"
        >
          {project.name}
        </Box>
      )}
      <Box
        position="absolute"
        top="6px"
        left="6px"
        px="5px"
        bg="rgba(0,0,0,.78)"
        border={`1px solid ${RULE}`}
        fontFamily={mono}
        fontSize="10px"
        lineHeight="16px"
        letterSpacing="0.14em"
        color={GREY}
        textTransform="uppercase"
      >
        {project.kind}
      </Box>
    </Box>
    <Box
      display="flex"
      alignItems="baseline"
      gap="8px"
      mt="6px"
      fontFamily={mono}
    >
      <Box
        as="h3"
        data-name=""
        flex="1"
        minW={0}
        fontSize="13px"
        lineHeight="18px"
        fontWeight="bold"
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {project.name}
      </Box>
      <Box
        as="span"
        data-label=""
        flexShrink={0}
        fontSize="10px"
        letterSpacing="0.16em"
        color={DIM}
      >
        {project.link.label}
        {project.link.href.startsWith('/') ? ' →' : ' ↗'}
      </Box>
    </Box>
    <Box
      as="p"
      mt="2px"
      fontFamily={mono}
      fontSize="11px"
      lineHeight="15px"
      color={GREY}
      lineClamp={3}
      minH="30px"
    >
      {project.line}
    </Box>
  </>
);

const Card = ({ project }: { project: Project }) => {
  const link = linkProps(project);
  const body = <CardBody project={project} />;
  if (link.kind === 'route') {
    return (
      <Box asChild css={cardCss}>
        <RouterLink to={link.href} aria-label={link.ariaLabel}>
          {body}
        </RouterLink>
      </Box>
    );
  }
  return (
    <Box asChild css={cardCss}>
      <a
        href={link.href}
        aria-label={link.ariaLabel}
        {...(link.kind === 'external'
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : {})}
      >
        {body}
      </a>
    </Box>
  );
};

/** Left and right arrows move between the cards of one shelf. */
function onShelfKey(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  const cards = [
    ...event.currentTarget.querySelectorAll<HTMLAnchorElement>('a'),
  ];
  const at = cards.indexOf(document.activeElement as HTMLAnchorElement);
  if (at < 0) return;
  const next = cards[at + (event.key === 'ArrowRight' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/**
 * Keeps the focused card wholly in view: the browser's own focus scroll stops
 * at a card that is only partly visible.
 */
function onShelfFocus(event: FocusEvent<HTMLElement>) {
  event.target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

const Shelf = ({ group }: { group: ProjectGroup }) => (
  <Box
    as="section"
    id={group.id}
    aria-labelledby={`${group.id}-title`}
    display="grid"
    gridTemplateColumns={{
      base: 'minmax(0, 1fr)',
      md: `${TITLE_COLUMN} minmax(0, 1fr)`,
    }}
    gap={{ base: '10px', md: '0' }}
    py={{ base: '18px', md: '8px' }}
    borderTop={`1px solid ${RULE}`}
    scrollMarginTop="88px"
  >
    <Box
      as="h2"
      id={`${group.id}-title`}
      fontFamily={mono}
      fontSize="12px"
      lineHeight="18px"
      letterSpacing="0.2em"
      color={GREY}
      pt={{ md: '2px' }}
      textTransform="uppercase"
    >
      {group.title}
    </Box>
    <Box
      as="ul"
      onKeyDown={onShelfKey}
      onFocus={onShelfFocus}
      display="flex"
      gap={{ base: '12px', md: '16px' }}
      listStyleType="none"
      m={{ base: '0 -16px', md: 0 }}
      px={{ base: '16px', md: 0 }}
      overflowX="auto"
      overscrollBehaviorX="contain"
      scrollSnapType="x proximity"
      scrollPaddingInline={{ base: '16px', md: 0 }}
      css={{
        scrollbarWidth: 'thin',
        scrollbarColor: `${RULE} transparent`,
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {group.projects.map((project) => (
        <Box
          as="li"
          key={project.slug}
          data-project={project.slug}
          flex="0 0 auto"
          w={{ base: PHONE_CARD, md: DESKTOP_CARD }}
          scrollSnapAlign="start"
        >
          <Card project={project} />
        </Box>
      ))}
    </Box>
  </Box>
);

const Shelves = ({ groups }: { groups: ProjectGroup[] }) => (
  <Box borderBottom={`1px solid ${RULE}`}>
    {groups.map((group) => (
      <Shelf key={group.id} group={group} />
    ))}
  </Box>
);

export default Shelves;

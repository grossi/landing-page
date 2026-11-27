import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router';
import { Box, chakra } from '@chakra-ui/react';
import { monoFont as mono } from 'config/site';
import type { Project, ProjectGroup } from 'data/projects';

// Mock B, "Contact sheet": the projects page as a grid of screenshot tiles,
// image first. Each tile is one link: the screenshot (or, for an entry with
// none, a plain text frame of the same size) with the name, kind and line as
// its caption. The group titles are quiet dividers between runs of tiles.

const RouterAnchor = chakra(RouterLink);

const muted = '#a1a1aa';
const faint = '#71717a';
const rule = 'rgba(255,255,255,.15)';

// Three across on desktop, two on a tablet, one on a phone. The grid's widest
// tile is about 410px, so a 2x screen takes the 1280px file there.
const imageSizes = '(min-width: 1024px) 410px, (min-width: 640px) 50vw, 100vw';

/** The tile's frame and focus look, shared by every kind of link. */
const tileStyle = {
  display: 'block',
  height: '100%',
  color: 'inherit',
  textDecoration: 'none',
  outline: 'none',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: rule,
  borderRadius: 0,
  transition: 'border-color 120ms ease',
  _hover: { borderColor: 'rgba(255,255,255,.6)', textDecoration: 'none' },
  _focusVisible: {
    borderColor: 'white',
    outline: '1px solid white',
    outlineOffset: '3px',
  },
  '&:hover [data-shot], &:focus-visible [data-shot]': { opacity: 1 },
  '&:hover [data-label], &:focus-visible [data-label]': { color: 'white' },
} as const;

/**
 * The whole tile as one link. In-app routes stay in the app; the static arcade
 * pages load as full pages; other sites open in a new tab, without an opener.
 */
const TileLink = ({
  project,
  children,
}: {
  project: Project;
  children: ReactNode;
}) => {
  const { href, label } = project.link;
  const name = `${label}: ${project.name}, ${project.line}`;
  if (href.startsWith('/') && !href.startsWith('/arcade/')) {
    return (
      <RouterAnchor to={href} aria-label={name} {...tileStyle}>
        {children}
      </RouterAnchor>
    );
  }
  return href.startsWith('/') ? (
    <chakra.a href={href} aria-label={name} {...tileStyle}>
      {children}
    </chakra.a>
  ) : (
    <chakra.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${name} (opens in a new tab)`}
      {...tileStyle}
    >
      {children}
    </chakra.a>
  );
};

/** A 16:10 box, so a tile keeps its height before its image arrives. */
const Frame = ({ project }: { project: Project }) => (
  <Box
    position="relative"
    aspectRatio="16 / 10"
    bg="#050505"
    borderBottom={`1px solid ${rule}`}
    overflow="hidden"
  >
    {project.image ? (
      // A plain <img>, so width and height stay attributes (intrinsic size)
      // rather than becoming style props.
      <img
        data-shot
        src={project.image.small.src}
        srcSet={`${project.image.small.src} ${project.image.small.width}w, ${project.image.large.src} ${project.image.large.width}w`}
        sizes={imageSizes}
        width={project.image.small.width}
        height={project.image.small.height}
        alt={project.image.alt}
        loading="lazy"
        decoding="async"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.85,
          transition: 'opacity 120ms ease',
        }}
      />
    ) : (
      // No screenshot: the frame holds the entry's slug as a prompt line.
      <Box
        data-shot
        aria-hidden
        position="absolute"
        inset={0}
        display="flex"
        alignItems="center"
        justifyContent="center"
        fontFamily={mono}
        fontSize="15px"
        letterSpacing="0.08em"
        color={muted}
        opacity={0.85}
        transition="opacity 120ms ease"
        backgroundImage={`repeating-linear-gradient(0deg, transparent 0 23px, rgba(255,255,255,.04) 23px 24px)`}
      >
        <span>
          <span style={{ color: faint }}>&gt; </span>
          {project.slug}
          <span style={{ color: faint }}>_</span>
        </span>
      </Box>
    )}
  </Box>
);

const Tile = ({ project }: { project: Project }) => (
  <chakra.li data-project={project.slug} listStyleType="none">
    <TileLink project={project}>
      <Frame project={project} />
      <Box px="14px" py="12px" fontFamily={mono}>
        <Box display="flex" alignItems="baseline" gap="10px">
          <chakra.h3
            fontSize="14px"
            fontWeight="600"
            letterSpacing="0.04em"
            m={0}
            minW={0}
            truncate
          >
            {project.name}
          </chakra.h3>
          <Box as="span" fontSize="11px" color={faint} letterSpacing="0.08em">
            [{project.kind}]
          </Box>
          <Box
            as="span"
            data-label
            ml="auto"
            flexShrink={0}
            fontSize="11px"
            letterSpacing="0.12em"
            color={muted}
            transition="color 120ms ease"
          >
            {project.link.label}
            {project.link.href.startsWith('https://') ? ' ↗' : ' →'}
          </Box>
        </Box>
        <chakra.p m={0} mt="6px" fontSize="12px" lineHeight="1.5" color={muted}>
          {project.line}
        </chakra.p>
      </Box>
    </TileLink>
  </chakra.li>
);

/** A group: its title as a thin labelled rule, then its tiles. */
const Sheet = ({ group }: { group: ProjectGroup }) => (
  <chakra.section id={group.id} mt="44px" scrollMarginTop="88px">
    <Box display="flex" alignItems="center" gap="12px" mb="16px">
      <chakra.h2
        m={0}
        fontFamily={mono}
        fontSize="11px"
        fontWeight="400"
        letterSpacing="0.16em"
        textTransform="uppercase"
        color={faint}
      >
        {group.title}
      </chakra.h2>
      <Box flex="1" h="1px" bg={rule} />
    </Box>
    <chakra.ul
      m={0}
      p={0}
      display="grid"
      gap="20px"
      gridTemplateColumns={{
        base: '1fr',
        sm: 'repeat(2, minmax(0, 1fr))',
        lg: 'repeat(3, minmax(0, 1fr))',
      }}
    >
      {group.projects.map((project) => (
        <Tile key={project.slug} project={project} />
      ))}
    </chakra.ul>
  </chakra.section>
);

const ContactSheet = ({ groups }: { groups: ProjectGroup[] }) => (
  <>
    {groups.map((group) => (
      <Sheet key={group.id} group={group} />
    ))}
  </>
);

export default ContactSheet;

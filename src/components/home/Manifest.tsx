import * as React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router';
import { manifest } from 'components/home/manifest';
import type { ManifestEntry, ProjectStatus } from 'components/home/manifest';
import { focusRing, grey, label, mono } from 'components/home/styles';

// Status reads from the marker's shape and fill, not from colour: the page
// stays inside the site's greys.
const markers: Record<ProjectStatus, React.CSSProperties> = {
  LIVE: { background: 'white', border: '1px solid white' },
  'IN TESTING': {
    background: 'linear-gradient(90deg, white 50%, transparent 50%)',
    border: '1px solid white',
  },
  PROTOTYPE: { border: `1px solid ${grey.text}` },
  'OPEN SOURCE': { border: '1px solid white', transform: 'rotate(45deg) scale(.82)' },
};

const StatusTag = ({ status }: { status: ProjectStatus }) => (
  <Flex
    align="center"
    gap="8px"
    flexShrink={0}
    px="8px"
    py="3px"
    borderWidth="1px"
    borderColor={grey.border}
    {...label}
    fontSize="10px"
    letterSpacing=".16em"
    color={status === 'PROTOTYPE' ? grey.text : 'white'}
    whiteSpace="nowrap"
  >
    <span aria-hidden style={{ width: 7, height: 7, flexShrink: 0, ...markers[status] }} />
    {status}
  </Flex>
);

const RowLink = ({ entry, children }: { entry: ManifestEntry; children: React.ReactNode }) => {
  if (!entry.href) return <>{children}</>;
  const style = { display: 'block', color: 'inherit', textDecoration: 'none' };
  return entry.href.startsWith('/') ? (
    <RouterLink to={entry.href} style={style} className="manifest-link">
      {children}
    </RouterLink>
  ) : (
    <a href={entry.href} target="_blank" rel="noopener noreferrer" style={style} className="manifest-link">
      {children}
    </a>
  );
};

const Row = ({ entry, index }: { entry: ManifestEntry; index: number }) => {
  const internal = entry.href?.startsWith('/');
  return (
    <Box
      as="li"
      borderBottom={`1px solid ${grey.rule}`}
      css={{
        '& .manifest-link:focus-visible': focusRing,
        '&:hover': entry.href ? { background: 'rgba(255,255,255,.045)' } : undefined,
        '&:hover .manifest-name': entry.href ? { textDecoration: 'underline' } : undefined,
        '&:hover .manifest-go': { color: 'white' },
      }}
      transition="background 0.15s ease"
    >
      <RowLink entry={entry}>
        <Box
          display="grid"
          gridTemplateColumns={{ base: '26px 1fr', md: '34px 1fr auto' }}
          columnGap={{ base: '6px', md: '10px' }}
          rowGap="4px"
          px={{ base: '4px', md: '10px' }}
          py={{ base: '14px', md: '11px' }}
        >
          <Text {...mono} fontSize="12px" lineHeight="20px" color={grey.dim} gridRow={{ md: '1 / span 2' }}>
            {String(index + 1).padStart(2, '0')}
          </Text>

          <Flex align="center" justify="space-between" gap="10px" minW={0}>
            <Text
              as="h3"
              className="manifest-name"
              {...mono}
              fontSize="14px"
              lineHeight="20px"
              fontWeight="bold"
              letterSpacing=".14em"
              textUnderlineOffset="4px"
            >
              {entry.name}
            </Text>
            <Box display={{ base: 'block', md: 'none' }}>
              <StatusTag status={entry.status} />
            </Box>
          </Flex>

          <Flex display={{ base: 'none', md: 'flex' }} justify="flex-end" align="center">
            <StatusTag status={entry.status} />
          </Flex>

          <Text
            {...mono}
            gridColumn="2"
            fontSize="13px"
            lineHeight="1.5"
            color={grey.text}
          >
            {entry.summary}
          </Text>

          {entry.linkLabel && (
            <Text
              className="manifest-go"
              {...label}
              gridColumn={{ base: '2', md: '3' }}
              textAlign={{ md: 'right' }}
              alignSelf="start"
              pt={{ md: '2px' }}
              letterSpacing=".12em"
              textTransform="none"
              color={grey.dim}
              transition="color 0.15s ease"
              whiteSpace="nowrap"
            >
              {entry.linkLabel} {internal ? '→' : '↗'}
            </Text>
          )}
        </Box>
      </RowLink>
    </Box>
  );
};

const Manifest = () => (
  <Box as="section" aria-labelledby="manifest-heading">
    <Flex
      align="baseline"
      justify="space-between"
      gap="16px"
      pb="10px"
      borderBottom={`1px solid ${grey.border}`}
    >
      <Flex align="baseline" gap="14px">
        <Text as="h2" id="manifest-heading" {...label} color="white" fontWeight="bold" letterSpacing=".3em">
          Manifest
        </Text>
        <Text {...label} color={grey.dim}>
          {String(manifest.length).padStart(2, '0')} entries
        </Text>
      </Flex>
      <Box
        asChild
        {...label}
        color={grey.text}
        whiteSpace="nowrap"
        _hover={{ color: 'white' }}
        _focusVisible={focusRing}
      >
        <RouterLink to="/arcade">All projects →</RouterLink>
      </Box>
    </Flex>

    <Box as="ol" listStyleType="none" m={0} p={0}>
      {manifest.map((entry, index) => (
        <Row key={entry.name} entry={entry} index={index} />
      ))}
    </Box>
  </Box>
);

export default Manifest;

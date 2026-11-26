import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { monoFont } from 'config/site';
import { buildingItems } from 'components/home/content';
import type { Density } from 'components/home/useFitDensity';

const RULE = '1px solid rgba(255,255,255,.15)';

const mono = {
  fontFamily: monoFont,
  color: 'white',
} as const;

/**
 * "Currently building": a bar along the bottom of the field that mirrors
 * the header, with one full-cell link per project. As `density` rises
 * (see `useFitDensity`) it tightens, drops the taglines, then goes away,
 * so the hero never overflows the screen.
 */
const BuildingStrip = ({ density }: { density: Density }) => (
  <Box
    as="nav"
    aria-label="Currently building"
    pointerEvents="auto"
    bg="rgba(0,0,0,.72)"
    borderTop={RULE}
    px={{ base: 0, md: '34px' }}
    display={density >= 3 ? 'none' : 'block'}
  >
    <Flex maxW="1280px" mx="auto" direction={{ base: 'column', md: 'row' }}>
      <Flex
        align={{ base: 'center', md: 'flex-start' }}
        flexShrink={0}
        w={{ base: 'auto', md: '170px' }}
        px={{ base: '34px', md: 0 }}
        py={{ base: density >= 1 ? '6px' : '9px', md: density >= 1 ? '12px' : '18px' }}
        borderBottom={{ base: RULE, md: 'none' }}
      >
        <Text {...mono} fontSize="11px" letterSpacing=".26em" opacity={0.55} lineHeight="1.7">
          CURRENTLY
          <Box as="br" display={{ base: 'none', md: 'inline' }} />{' '}
          BUILDING
        </Text>
      </Flex>

      {buildingItems.map((item, i) => (
        <chakra.a
          key={item.name}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          flex="1"
          minW={0}
          display="block"
          px={{ base: '34px', md: '22px' }}
          py={{ base: density >= 1 ? '7px' : '10px', md: density >= 1 ? '12px' : '18px' }}
          borderLeft={{ base: 'none', md: RULE }}
          borderRight={{ base: 'none', md: i === buildingItems.length - 1 ? RULE : 'none' }}
          borderBottom={{ base: i === buildingItems.length - 1 ? 'none' : RULE, md: 'none' }}
          textDecoration="none"
          transition="background 0.15s ease"
          _hover={{ bg: 'rgba(255,255,255,.07)' }}
          _focusVisible={{ bg: 'rgba(255,255,255,.07)', outline: '1px solid white', outlineOffset: '-1px' }}
          className="group"
        >
          <Flex align="baseline" gap="10px">
            <Text {...mono} fontSize="11px" opacity={0.45}>
              {String(i + 1).padStart(2, '0')}
            </Text>
            <Text {...mono} fontSize="13px" fontWeight="bold" letterSpacing=".2em" flex="1" minW={0}>
              {item.name}
            </Text>
            <Text
              {...mono}
              fontSize="13px"
              opacity={0.5}
              transition="opacity 0.15s ease, transform 0.15s ease"
              _groupHover={{ opacity: 1, transform: 'translate(2px, -2px)' }}
              aria-hidden
            >
              ↗
            </Text>
          </Flex>
          <Text
            {...mono}
            mt={{ base: '3px', md: '8px' }}
            fontSize="12px"
            lineHeight="1.5"
            opacity={0.72}
            display={density >= 2 ? 'none' : 'block'}
          >
            {item.tagline}
          </Text>
          <Text
            {...mono}
            mt="6px"
            fontSize="10px"
            letterSpacing=".22em"
            opacity={0.45}
            display={density >= 2 ? 'none' : { base: 'none', md: 'block' }}
          >
            {item.status}
          </Text>
        </chakra.a>
      ))}
    </Flex>
  </Box>
);

export default BuildingStrip;

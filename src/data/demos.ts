// The arcade games that live on this site. The user kept three (MURMUR was
// shelved on 2026-11-27); names, lines and URLs follow the managers' ARCADE.md.
// The other old demo pages stay reachable at their URLs but are not listed.

import ephemerisLarge from 'data/images/ephemeris-1280.webp';
import ephemerisSmall from 'data/images/ephemeris-640.webp';
import hypertunnelLarge from 'data/images/hypertunnel-1280.webp';
import hypertunnelSmall from 'data/images/hypertunnel-640.webp';
import meridianLarge from 'data/images/meridian-1280.webp';
import meridianSmall from 'data/images/meridian-640.webp';
import { screenshot, type Project } from 'data/types';

export const arcadeGames: Project[] = [
  {
    slug: 'meridian',
    name: 'MERIDIAN',
    kind: 'game',
    line: 'low-altitude run across a changing world',
    link: { label: 'PLAY', href: '/arcade/meridian/index.html' },
    image: screenshot(
      'MERIDIAN being played: a white wireframe ship skimming wireframe mountains toward a ring gate, on black.',
      meridianLarge,
      meridianSmall,
    ),
  },
  {
    slug: 'hypertunnel',
    name: 'HYPERTUNNEL',
    kind: 'game',
    line: 'tunnel reflex run with a perfect chain',
    link: { label: 'PLAY', href: '/arcade/tunnel/index.html' },
    image: screenshot(
      'HYPERTUNNEL being played: a wireframe ring wall with one gap, the ship below it, looking down a black tunnel.',
      hypertunnelLarge,
      hypertunnelSmall,
    ),
  },
  {
    slug: 'ephemeris',
    name: 'EPHEMERIS',
    kind: 'game',
    line: 'daily solar-system survey',
    link: { label: 'PLAY', href: '/ephemeris' },
    image: screenshot(
      'EPHEMERIS being played: a wireframe ship drifting past a wireframe planet and its orbit, in black space.',
      ephemerisLarge,
      ephemerisSmall,
    ),
  },
];

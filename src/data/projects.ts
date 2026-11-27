// The projects page's data, shared by every layout. Facts and links were
// checked on 2026-11-27; images are screenshots taken that day of the live
// page or of the game being played.
//
// Rules (data/projects.test.ts enforces them):
// - An entry is a name, a kind, one line of at most 12 words, one link and
//   an optional image. Nothing else: no descriptions, tech lists or status.
// - No public link, no entry. Links are public https URLs or in-site paths.
// - A repo is linked only after `gh repo view <repo> --json visibility`
//   says PUBLIC; a store listing only once it is public.

import emberwatchLarge from 'data/images/emberwatch-1280.webp';
import emberwatchSmall from 'data/images/emberwatch-640.webp';
import hoshiLabsLarge from 'data/images/hoshi-labs-1280.webp';
import hoshiLabsSmall from 'data/images/hoshi-labs-640.webp';
import isuzuLarge from 'data/images/isuzu-portfolio-1280.webp';
import isuzuSmall from 'data/images/isuzu-portfolio-640.webp';
import mossmageLarge from 'data/images/mossmage-1280.webp';
import mossmageSmall from 'data/images/mossmage-640.webp';
import starSurvivalLarge from 'data/images/star-survival-1280.webp';
import starSurvivalSmall from 'data/images/star-survival-640.webp';
import tactiaLarge from 'data/images/tactia-pocket-1280.webp';
import tactiaSmall from 'data/images/tactia-pocket-640.webp';
import tsukikageLarge from 'data/images/tsukikage-1280.webp';
import tsukikageSmall from 'data/images/tsukikage-640.webp';
import { arcadeGames } from 'data/demos';
import { screenshot, type ProjectGroup, type Project } from 'data/types';

export type {
  ImageFile,
  LinkLabel,
  Project,
  ProjectGroup,
  ProjectImage,
  ProjectKind,
  ProjectLink,
} from 'data/types';

export const projectGroups: ProjectGroup[] = [
  {
    id: 'hoshi-labs',
    title: 'Hoshi Labs',
    projects: [
      {
        slug: 'hoshi-labs',
        name: 'Hoshi Labs',
        kind: 'site',
        line: 'My one-person game studio in Japan',
        link: { label: 'VISIT', href: 'https://hoshilabs.jp.net/en/' },
        image: screenshot(
          'The Hoshi Labs website listing its games: Star Survival, Tactia Pocket, Yonkoma Yokochō and Yomikiri.',
          hoshiLabsLarge,
          hoshiLabsSmall,
        ),
      },
      {
        slug: 'star-survival',
        name: 'Star Survival',
        kind: 'game',
        line: 'One-thumb roguelike survivor where spells fire on their own',
        link: {
          label: 'GET',
          href: 'https://play.google.com/store/apps/details?id=net.jp.hoshilabs.starsurvival',
        },
        image: screenshot(
          "Star Survival's page on the Hoshi Labs website: the title art of a young witch and a Google Play button.",
          starSurvivalLarge,
          starSurvivalSmall,
        ),
      },
      {
        slug: 'tactia-pocket',
        name: 'Tactia Pocket',
        kind: 'game',
        line: 'A small party of heroes, a dungeon, one battle at a time',
        link: { label: 'VISIT', href: 'https://hoshilabs.jp.net/en/games/tactia-pocket/' },
        image: screenshot(
          "Tactia Pocket's page on the Hoshi Labs website: title art of a party of heroes on a dungeon grid.",
          tactiaLarge,
          tactiaSmall,
        ),
      },
    ],
  },
  {
    id: 'prototypes',
    title: 'Prototypes',
    projects: [
      {
        slug: 'mossmage',
        name: 'Mossmage',
        kind: 'demo',
        line: 'A mage, a grove and five minutes against the swarm',
        link: { label: 'PLAY', href: 'https://game-prototypes-omega.vercel.app/games/01_mossmage/' },
        image: screenshot(
          'Mossmage being played: a small mage in a sunlit forest clearing, firing spells at dark creatures closing in.',
          mossmageLarge,
          mossmageSmall,
        ),
      },
      {
        slug: 'emberwatch',
        name: 'Emberwatch',
        kind: 'demo',
        line: 'Turn-based squad tactics on a grid',
        link: { label: 'PLAY', href: 'https://game-prototypes-omega.vercel.app/games/02_emberwatch/' },
        image: screenshot(
          'Emberwatch being played: three heroes on the left of a stone and grass grid, ice creatures on the right.',
          emberwatchLarge,
          emberwatchSmall,
        ),
      },
      {
        slug: 'tsukikage',
        name: 'Tsukikage',
        kind: 'demo',
        line: 'Moonlit precision platformer: run, jump, dash, try again',
        link: { label: 'PLAY', href: 'https://game-prototypes-omega.vercel.app/games/10_tsukikage/' },
        image: screenshot(
          'Tsukikage being played: a small figure on stone ledges under a full moon, with spikes and a star shard ahead.',
          tsukikageLarge,
          tsukikageSmall,
        ),
      },
    ],
  },
  {
    id: 'web-and-apps',
    title: 'Web and apps',
    projects: [
      {
        slug: 'isuzu-portfolio',
        name: 'isuZu portfolio',
        kind: 'site',
        line: "Illustrator's gallery, works and books, in Japanese and English",
        link: { label: 'VISIT', href: 'https://isuzu.work/' },
        image: screenshot(
          "The isuZu portfolio's home page: a large illustration of two animal-eared girls with a basket of vegetables.",
          isuzuLarge,
          isuzuSmall,
        ),
      },
      {
        slug: 'fold-fix',
        name: 'FoldFix',
        kind: 'app',
        line: 'Screen switching for first-generation Pixel Folds with a dead hinge sensor',
        link: { label: 'SOURCE', href: 'https://github.com/grossi/fold-fix' },
      },
    ],
  },
  {
    id: 'arcade',
    title: 'Arcade',
    projects: arcadeGames,
  },
];

/** Every entry, in page order. */
export const projects: Project[] = projectGroups.flatMap((group) => group.projects);

/**
 * The home page manifest: a short index of real projects. It is a summary;
 * the full list lives on the projects page (`/arcade`).
 *
 * Every entry is a checked fact. Links are public URLs or public repos only:
 * no private repo, no unreleased store listing. Only original work is listed:
 * a fork of someone else's project is not an entry here.
 */

export type ProjectStatus = 'LIVE' | 'IN TESTING' | 'PROTOTYPE' | 'OPEN SOURCE';

export interface ManifestEntry {
  name: string;
  status: ProjectStatus;
  summary: string;
  /** What the link is called on the row, e.g. the host it opens. */
  linkLabel?: string;
  /** Public `https://` URL, or a site route starting with `/`. */
  href?: string;
}

export const manifest: ManifestEntry[] = [
  {
    name: 'HOSHI LABS',
    status: 'LIVE',
    summary: 'My one-person indie game studio in Japan. Studio site in Japanese, English and Portuguese.',
    linkLabel: 'hoshilabs.jp.net',
    href: 'https://hoshilabs.jp.net/en/',
  },
  {
    name: 'STAR SURVIVAL',
    status: 'LIVE',
    summary: 'One-thumb roguelike survivor for Android: ten spells, twelve tomes, six stages. Free.',
    linkLabel: 'Google Play',
    href: 'https://play.google.com/store/apps/details?id=net.jp.hoshilabs.starsurvival',
  },
  {
    name: 'TACTIA POCKET',
    status: 'IN TESTING',
    summary: 'Turn-based tactics roguelite for phones, inspired by classic tactics RPGs. Coming soon.',
    linkLabel: 'hoshilabs.jp.net',
    href: 'https://hoshilabs.jp.net/en/games/tactia-pocket/',
  },
  {
    name: 'GAME PROTOTYPES',
    status: 'PROTOTYPE',
    summary: '20+ browser games on shared kits: horde survivor, tactics, visual novels, Japanese-learning manga.',
    linkLabel: 'game-prototypes',
    href: 'https://game-prototypes-omega.vercel.app',
  },
  {
    name: 'ISUZU PORTFOLIO',
    status: 'LIVE',
    summary: 'Portfolio site for the artist isuZu, with an admin console to manage it.',
    linkLabel: 'isuzu.work',
    href: 'https://isuzu.work',
  },
  {
    name: 'FOLD-FIX',
    status: 'OPEN SOURCE',
    summary: 'Android app that restores screen switching on Pixel Folds with a dead hinge sensor. No root.',
    linkLabel: 'GitHub',
    href: 'https://github.com/grossi/fold-fix',
  },
  {
    name: 'FLIGHT DEMOS',
    status: 'LIVE',
    summary: 'Nine three.js flight toys and arcade games, playable in the browser on this site.',
    linkLabel: 'on this site',
    href: '/arcade',
  },
];

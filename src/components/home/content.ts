import { socialLinks } from 'config/site';

/**
 * Copy and links for the home hero. Every claim here is a checked fact:
 * the role comes from `assets/experience-data.json`, the studio and game
 * facts from hoshilabs.jp.net and the Google Play listing, and the
 * prototype count from the game-prototypes index.
 */

/** Each part stays on one line; narrow screens wrap between parts. */
export const kicker = ['SOFTWARE ENGINEER', 'GAME DEVELOPER'] as const;

export const statement = [
  'Senior full-stack engineer building AI solutions at Lazuli, previously at Uber.',
  'I also make games as Hoshi Labs, my one-person studio in Japan.',
] as const;

export interface HeroAction {
  label: string;
  /** In-site route (`to`) or an external/mailto address (`href`). */
  to?: string;
  href?: string;
  primary?: boolean;
}

export const heroActions: HeroAction[] = [
  { label: 'PROJECTS', to: '/arcade', primary: true },
  { label: 'EXPERIENCE', to: '/experience' },
  { label: 'CONTACT', href: socialLinks.email },
];

export interface BuildingItem {
  name: string;
  tagline: string;
  status: string;
  href: string;
}

export const buildingItems: BuildingItem[] = [
  {
    name: 'STAR SURVIVAL',
    tagline: 'A survivors-like for phones.',
    status: 'LIVE ON GOOGLE PLAY',
    href: 'https://play.google.com/store/apps/details?id=net.jp.hoshilabs.starsurvival',
  },
  {
    name: 'HOSHI LABS',
    tagline: 'One-person indie game studio in Japan.',
    status: 'STUDIO SITE',
    href: 'https://hoshilabs.jp.net/',
  },
  {
    name: 'GAME PROTOTYPES',
    tagline: '20+ browser game prototypes on shared kits.',
    status: 'PLAYABLE IN THE BROWSER',
    href: 'https://game-prototypes-omega.vercel.app',
  },
];

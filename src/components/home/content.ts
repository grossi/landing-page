import experienceData from 'assets/experience-data.json';
import postSource from 'assets/npm-library.md?raw';
import { parseFrontMatter } from 'components/post/frontMatter';
import { socialLinks } from 'config/site';

/**
 * Copy and data for the home page. Everything here is either derived from
 * the site's own data (experience JSON, the blog post, socialLinks) or a
 * fact checked against its public source; nothing is invented.
 */

export const sections = [
  { id: 'about', label: 'ABOUT' },
  { id: 'work', label: 'SELECTED WORK' },
  { id: 'experience', label: 'EXPERIENCE' },
  { id: 'writing', label: 'WRITING' },
  { id: 'contact', label: 'CONTACT' },
] as const;

export type SectionId = (typeof sections)[number]['id'];

// ---- experience (src/assets/experience-data.json, newest first) ----

export const roles = experienceData.experiences;
export const currentRole = roles[0];

/** Roles shown on the home page; the rest live on /experience. */
export const STRIP_ROLES = 4;

// ---- selected work ----

export interface Project {
  name: string;
  tagline: string;
  description: string;
  /** Short terminal-style tags: platform, stack. */
  tags: string[];
  status: string;
  href: string;
  /** Text of the link, naming where it goes. */
  linkLabel: string;
}

export const projects: Project[] = [
  {
    name: 'HOSHI LABS',
    tagline: 'one-person indie game studio',
    description:
      'The game studio I run in Japan, and the site I built for it: games, studio and contact pages in Japanese and English, with the game pages in Portuguese too.',
    tags: ['GATSBY', 'REACT', 'TAILWIND'],
    status: 'LIVE',
    href: 'https://hoshilabs.jp.net/',
    linkLabel: 'HOSHILABS.JP.NET',
  },
  {
    name: 'STAR SURVIVAL',
    tagline: 'roguelike survivor for phones',
    description:
      'Move with one finger while your spells fire on their own. Ten spells, twelve tomes, six stages and their bosses. Free on Google Play.',
    tags: ['ANDROID', 'FREE'],
    status: 'RELEASED',
    href: 'https://play.google.com/store/apps/details?id=net.jp.hoshilabs.starsurvival',
    linkLabel: 'GOOGLE PLAY',
  },
  {
    name: 'TACTIA POCKET',
    tagline: 'turn-based tactics roguelite',
    description:
      'A turn-based roguelite inspired by classic tactics RPGs. Lead a small party of heroes down into a dungeon, one battle at a time, and face the boss waiting on each floor.',
    tags: ['ANDROID'],
    status: 'COMING SOON',
    href: 'https://hoshilabs.jp.net/en/games/tactia-pocket/',
    linkLabel: 'HOSHILABS.JP.NET',
  },
  {
    name: 'GAME PROTOTYPES',
    tagline: '20+ browser prototypes on shared kits',
    description:
      'A workspace where each prototype is built on reusable kits: a horde survivor, squad tactics, a precision platformer, visual novels, and novels and manga for learning Japanese.',
    tags: ['BROWSER', 'DESKTOP + MOBILE'],
    status: 'PROTOTYPES',
    href: 'https://game-prototypes-omega.vercel.app',
    linkLabel: 'OPEN THE LAUNCHER',
  },
];

// ---- writing (the post rendered at /blog) ----

const { meta: postMeta, body: postBody } = parseFrontMatter(postSource);
const postBlocks = postBody
  .split(/\r?\n\s*\r?\n/)
  .map((block) => block.trim())
  .filter(Boolean);
const postHeading = postBlocks.find((block) => block.startsWith('# '));

export const post = {
  // the heading without its `# ` marker and leading emoji
  title: postHeading?.replace(/^#\s+[^\p{L}\p{N}]*/u, '').trim() ?? 'Blog',
  date: postMeta.date,
  excerpt: postBlocks.find((block) => !block.startsWith('#')) ?? '',
  href: '/blog',
};

// ---- contact (config/site.ts) ----

export const email = socialLinks.email.replace(/^mailto:/, '');

export const contactLinks: Array<{ key: keyof typeof socialLinks; label: string }> = [
  { key: 'email', label: 'EMAIL' },
  { key: 'linkedin', label: 'LINKEDIN' },
  { key: 'github', label: 'GITHUB' },
  { key: 'twitter', label: 'X' },
];

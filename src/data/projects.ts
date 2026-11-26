// The real projects on the projects page. Facts were checked against each
// project's repo and live page on 2026-11-26; re-check before changing a count,
// a status or a link.
//
// Rules for this file (data/projects.test.ts enforces the checkable ones):
// - Links are public https URLs only. A repo is linked only after
//   `gh repo view <repo> --json visibility` says PUBLIC.
// - A store listing is linked only once it is public.
// - A private project has `links: []` and the card says so.

export type ProjectStatus =
  | 'released'
  | 'live'
  | 'coming-soon'
  | 'prototype'
  | 'open-source'
  | 'in-development'
  | 'private';

export const statusLabels: Record<ProjectStatus, string> = {
  released: 'RELEASED',
  live: 'LIVE',
  'coming-soon': 'COMING SOON',
  prototype: 'PROTOTYPE',
  'open-source': 'OPEN SOURCE',
  'in-development': 'IN DEVELOPMENT',
  private: 'PRIVATE',
};

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  slug: string;
  name: string;
  /** One line, lower case, shown in italics under the name. */
  tagline: string;
  /** Two or three sentences. */
  description: string;
  tech: string[];
  status: ProjectStatus;
  /** Public links, the main one first. Empty for a private project. */
  links: ProjectLink[];
}

export interface ProjectSection {
  /** Also the section's anchor on the page (`/projects#studio`). */
  id: string;
  title: string;
  blurb: string;
  projects: Project[];
}

export const projectSections: ProjectSection[] = [
  {
    id: 'studio',
    title: 'Studio and games',
    blurb: 'Hoshi Labs is my one-person game studio in Japan. One game is out and three are announced.',
    projects: [
      {
        slug: 'hoshi-labs',
        name: 'Hoshi Labs',
        tagline: 'one-person indie game studio in Japan',
        description:
          'The studio I make games under, on my own, in Japan. Its site presents the games, the studio and their support pages in Japanese and English, with Portuguese for the home and game pages.',
        tech: ['Gatsby 5', 'React 18', 'Tailwind CSS 3'],
        status: 'live',
        links: [{ label: 'VISIT SITE', href: 'https://hoshilabs.jp.net/en/' }],
      },
      {
        slug: 'star-survival',
        name: 'Star Survival',
        tagline: 'roguelike survivor for Android',
        description:
          'Little Witch Adventures: move with one finger while your spells fire on their own. Ten spells and twelve tomes combine into builds that have to outlast six stages and their bosses. Free on Google Play, built in Unity, with a Rust port on wgpu in testing.',
        tech: ['Unity', 'Rust', 'wgpu', 'Android'],
        status: 'released',
        links: [
          {
            label: 'GOOGLE PLAY',
            href: 'https://play.google.com/store/apps/details?id=net.jp.hoshilabs.starsurvival',
          },
          { label: 'GAME PAGE', href: 'https://hoshilabs.jp.net/en/games/star-survival/' },
        ],
      },
      {
        slug: 'tactia-pocket',
        name: 'Tactia Pocket',
        tagline: 'tactics roguelite for Android',
        description:
          'Turn-based tactics that fit in your pocket: lead a small party of heroes down into a dungeon, one battle at a time, and face the boss waiting on each floor. Seven classes and 49 skills, inspired by classic tactics RPGs. It started as a TypeScript browser prototype and is now being rebuilt in Rust for Android.',
        tech: ['Rust', 'wgpu', 'TypeScript', 'Android'],
        status: 'coming-soon',
        links: [{ label: 'GAME PAGE', href: 'https://hoshilabs.jp.net/en/games/tactia-pocket/' }],
      },
      {
        slug: 'yonkoma-yokocho',
        name: 'Yonkoma Yokochō',
        tagline: 'Japanese-learning manga',
        description:
          '4-panel manga strips for Japanese learners. An alley of made-up manga artists each run a strip in their own style: tap any word to look it up, and the words you tap become flashcards.',
        tech: ['TypeScript', 'Vite', 'Web'],
        status: 'coming-soon',
        links: [{ label: 'GAME PAGE', href: 'https://hoshilabs.jp.net/en/games/yonkoma/' }],
      },
      {
        slug: 'yomikiri',
        name: 'Yomikiri',
        tagline: 'Japanese-learning visual novel',
        description:
          'One-shot stories for Japanese learners. Short, fully voiced stories you read in Japanese: tap any word to look it up, and the words you tap become flashcards.',
        tech: ['TypeScript', 'Vite', 'Web'],
        status: 'coming-soon',
        links: [{ label: 'GAME PAGE', href: 'https://hoshilabs.jp.net/en/games/yomikiri/' }],
      },
    ],
  },
  {
    id: 'prototypes',
    title: 'Prototypes',
    blurb: 'Games still being found: playable, unfinished, and where the studio games start.',
    projects: [
      {
        slug: 'game-prototypes',
        name: 'Game prototypes',
        tagline: 'a workspace of browser game prototypes',
        description:
          'Where game ideas get built and played before they become products: more than twenty browser prototypes on a shared set of TypeScript kits. They range from a horde survivor and squad tactics to visual novels, Japanese-learning readers, dungeon action roguelikes and a precision platformer. Tactia Pocket, Yonkoma Yokochō and Yomikiri all started here, and the index is a working one, so many entries are unfinished.',
        tech: ['TypeScript', 'Vite', 'Phaser 3', 'Three.js'],
        status: 'prototype',
        // Open decision (ERD 4.1): whether this deployment is meant to be linked.
        // To unlink it, empty this array and set the status to 'private'.
        links: [{ label: 'OPEN THE INDEX', href: 'https://game-prototypes-omega.vercel.app/' }],
      },
      // Open decision (ERD 4.3): private projects shown without links.
      {
        slug: 'pickaxe-rs',
        name: 'pickaxe-rs',
        tagline: 'physics climbing game in Rust',
        description:
          'A climbing game in the style of Getting Over It: one person, one pickaxe, a mouse and a lot of falling. The 2D physics run on rapier2d and the rendering on macroquad, with desktop, browser and Android builds from the same code.',
        tech: ['Rust', 'rapier2d', 'macroquad', 'WebAssembly', 'Android'],
        status: 'in-development',
        links: [],
      },
    ],
  },
  {
    id: 'tools',
    title: 'Tools and open source',
    blurb: 'Sites, apps and developer tools, most of them with public source.',
    projects: [
      // Open decision (ERD 4.2): whether isuZu's portfolio is listed.
      {
        slug: 'isuzu-portfolio',
        name: 'isuZu portfolio',
        tagline: 'portfolio site for the illustrator isuZu',
        description:
          "The site of the illustrator isuZu, in Japanese and English: an illustration gallery, a works page and the artist's books. Its pages are generated from the image folders, and a small admin console manages the gallery, the carousel and the book list without a pull request.",
        tech: ['React 19', 'TypeScript', 'Vite', 'MUI'],
        status: 'live',
        links: [
          { label: 'VISIT SITE', href: 'https://isuzu.work/' },
          { label: 'SOURCE', href: 'https://github.com/grossi/isuzu-artist-portfolio' },
        ],
      },
      {
        slug: 'fold-fix',
        name: 'FoldFix',
        tagline: 'screen switching for Pixel Folds with a dead hinge sensor',
        description:
          'An Android app that gets a first-generation Pixel Fold switching between its inner and outer screens again after its hinge sensor dies. It listens to the hall-effect sensor, which keeps working, and tells Android which screen to use. No root and no computer needed.',
        tech: ['Java', 'Android'],
        status: 'open-source',
        links: [{ label: 'SOURCE', href: 'https://github.com/grossi/fold-fix' }],
      },
      {
        slug: 'image-gen-mcp',
        name: 'image-gen-mcp',
        tagline: 'fork of a text-to-image MCP server',
        description:
          "My fork of Ichigo3766's MCP server, which lets an agent generate and upscale images through the Stable Diffusion WebUI API. I run it with my own defaults, and my fix for the scheduler parameter was merged upstream.",
        tech: ['TypeScript', 'Node.js', 'MCP'],
        status: 'open-source',
        links: [{ label: 'SOURCE', href: 'https://github.com/grossi/image-gen-mcp' }],
      },
      // Open decision (ERD 4.3): private projects shown without links.
      {
        slug: 'gamelib',
        name: 'gamelib',
        tagline: 'self-hosted game asset library',
        description:
          'A self-hosted library for game assets made by hand or with generation tools: images, sprite sheets, audio, 3D models and fonts. Every asset records what it is, what made it and which games it was made for. A web dashboard and a command-line client built for coding agents sit on top.',
        tech: ['Python', 'FastAPI', 'SQLite', 'React'],
        status: 'private',
        links: [],
      },
    ],
  },
];

export const projects: Project[] = projectSections.flatMap((section) => section.projects);

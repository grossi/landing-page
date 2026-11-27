import experienceData from 'assets/experience-data.json';
import postSource from 'assets/npm-library.md?raw';
import { parseFrontMatter } from 'components/post/frontMatter';
import { socialLinks } from 'config/site';
import { projects } from 'data/projects';
import type { Project } from 'data/projects';

/**
 * Data for the home page. All of it is read from the site's own sources:
 * the experience JSON, the blog post, `socialLinks` and the projects page's
 * data module. The home page keeps no second copy of a fact.
 */

// ---- hero ----

/** Each part stays on one line; narrow screens wrap between parts. */
export const kicker = ['SOFTWARE ENGINEER', 'GAME DEVELOPER'] as const;

// ---- selected work (data/projects.ts, the projects page's data) ----

/** The projects shown on the home page, in this order. */
export const SELECTED_WORK = ['hoshi-labs', 'star-survival', 'tactia-pocket', 'game-prototypes'];

const findProject = (slug: string): Project | undefined =>
  projects.find((project) => project.slug === slug);

/** A slug the data no longer has is skipped, not invented. */
export const selectedWork: Project[] = SELECTED_WORK.map(findProject).filter(
  (project): project is Project => project !== undefined,
);

/** The studio and its released game, for the about section's fact sheet. */
export const studio = findProject('hoshi-labs');
export const released = findProject('star-survival');

// ---- experience (src/assets/experience-data.json, newest first) ----

export const roles = experienceData.experiences;

/** Roles shown on the home page; the rest live on /experience. */
export const STRIP_ROLES = 4;

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
  href: '/blog',
};

// ---- contact (config/site.ts) ----

export const email = socialLinks.email.replace(/^mailto:/, '');

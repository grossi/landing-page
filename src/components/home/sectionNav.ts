/**
 * The home page's sections, and the header navigation built from them. The
 * header is the home page's table of contents on every page: each entry
 * links to `/#<section>`, and a section with a full page of its own
 * (`page`) is marked while a visitor is on that page.
 *
 * Kept free of page content so the header, which every page loads, does not
 * pull the home page's data in with it.
 */

export interface HomeSection {
  /** The section's element id and URL fragment. */
  id: string;
  /** The heading on the home page. */
  label: string;
  /** The header entry; a section without one is not in the header. */
  nav?: string;
  /** The full page the section summarises. */
  page?: string;
  /** Other addresses that render that page. */
  aliases?: readonly string[];
}

export const homeSections = [
  { id: 'about', label: 'ABOUT' },
  // /arcade is the projects page's old address and still renders it.
  { id: 'work', label: 'WORK', nav: 'WORK', page: '/projects', aliases: ['/arcade'] },
  { id: 'experience', label: 'EXPERIENCE', nav: 'EXPERIENCE', page: '/experience' },
  { id: 'writing', label: 'WRITING', nav: 'WRITING', page: '/blog' },
  { id: 'contact', label: 'CONTACT', nav: 'CONTACT' },
] as const satisfies readonly HomeSection[];

export type SectionId = (typeof homeSections)[number]['id'];

const sectionList: readonly HomeSection[] = homeSections;

/** The sections the header lists, in page order. */
export const navSections = homeSections.filter(
  (section): section is Extract<(typeof homeSections)[number], { nav: string }> => 'nav' in section,
);

/** Where a section's link points, from any page. */
export const sectionHref = (id: SectionId): string => `/#${id}`;

/**
 * The home section a URL fragment names, or null. Like a browser it tries
 * the fragment as written, then percent-decoded (`#%77ork` is `#work`).
 */
export function sectionFromHash(hash: string): SectionId | null {
  const fragment = hash.replace(/^#/, '');
  if (!fragment) return null;
  const candidates = [fragment];
  try {
    candidates.push(decodeURIComponent(fragment));
  } catch {
    // A malformed escape such as `#%` names nothing more.
  }
  const found = homeSections.find((section) => candidates.includes(section.id));
  return found ? found.id : null;
}

/** The section whose full page is at `pathname`, or null. */
export function sectionForPage(pathname: string): SectionId | null {
  const found = sectionList.find(
    (section) => section.page === pathname || (section.aliases ?? []).includes(pathname),
  );
  return found ? (found.id as SectionId) : null;
}

/**
 * The section a visitor is reading: the last one whose top edge has reached
 * `line` (a height in the viewport, below the header). At the end of the
 * page it is the last section, which may be too short to ever reach the
 * line. Null above the first section, i.e. on the hero.
 *
 * `tops` are viewport-relative top edges in page order.
 */
export function pickActiveSection<Id extends string>(
  tops: ReadonlyArray<{ id: Id; top: number }>,
  line: number,
  atPageEnd: boolean,
): Id | null {
  if (tops.length === 0) return null;
  if (atPageEnd) return tops[tops.length - 1].id;
  let active: Id | null = null;
  for (const { id, top } of tops) {
    if (top <= line) active = id;
  }
  return active;
}

// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import theme from '../../theme';
import type { DeepFieldMode, DeepFieldOptions } from 'components/deepfield/createDeepField';
import { SELECTED_WORK } from 'components/home/content';
import { navSections } from 'components/home/sectionNav';
import { socialLinks } from 'config/site';
import { projects } from 'data/projects';
import experienceData from 'assets/experience-data.json';

// The field needs WebGL, so the page gets a stand-in that records what the
// page asks of it and lets a test report mode changes. The field's own
// behaviour is covered in components/deepfield/createDeepField.test.ts.
interface FakeField {
  container: HTMLElement;
  opts: DeepFieldOptions;
  play: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
  setPaused: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}
const fields = vi.hoisted(() => [] as FakeField[]);
vi.mock('components/deepfield/createDeepField', () => ({
  createDeepField: (container: HTMLElement, opts: DeepFieldOptions = {}) => {
    const field = { container, opts, play: vi.fn(), exit: vi.fn(), setPaused: vi.fn(), dispose: vi.fn() };
    fields.push(field);
    return field;
  },
}));

let root: Root | undefined;
let host: HTMLElement | undefined;

// happy-dom has no layout, so scrolls are observed, not performed.
const scrollIntoView = vi.fn();
const scrollTo = vi.fn();
let reducedMotion = false;
const observers: Array<{ callback: IntersectionObserverCallback; targets: Element[] }> = [];

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // Load the lazy pages up front, so a render never waits on an import.
  await Promise.all([import('pages/Home'), import('pages/Arcade'), import('pages/Blog')]);
});

beforeEach(() => {
  reducedMotion = false;
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.stubGlobal('scrollTo', scrollTo);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private entry: { callback: IntersectionObserverCallback; targets: Element[] };
      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback, targets: [] };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.targets.push(target);
      }
      unobserve() {}
      disconnect() {
        this.entry.targets.length = 0;
      }
    },
  );
  // The blog page fetches its post; the text does not matter here.
  vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '# A post' }));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  fields.length = 0;
  observers.length = 0;
  scrollIntoView.mockClear();
  scrollTo.mockClear();
  document.documentElement.style.overflow = '';
  // overrides made by scrollPageTo
  delete (window as { scrollY?: number }).scrollY;
  delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/** Mounts the whole app on a fresh navigation to `path`, as a deep link would. */
async function openApp(path: string, ready = 'main, h1, h2'): Promise<HTMLElement> {
  window.history.replaceState({}, '', path);
  host = document.createElement('div');
  document.body.appendChild(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(
      <ChakraProvider value={theme}>
        <App />
      </ChakraProvider>,
    );
  });
  // Pages are lazy: let the page replace the Suspense fallback.
  for (let i = 0; i < 500 && !host.querySelector(ready); i++) await settle(10);
  await settle();
  return host;
}

const click = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });

/** The header's desktop entries (the phone menu is closed unless a test opens it). */
const headerEntries = (page: HTMLElement) => [
  ...page.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Site"] a'),
];
const entry = (page: HTMLElement, name: string) => {
  const found = headerEntries(page).find((link) => link.textContent === name);
  if (!found) throw new Error(`no header entry "${name}"`);
  return found;
};
const section = (page: HTMLElement, id: string) => {
  const found = page.querySelector<HTMLElement>(`section#${id}`);
  if (!found) throw new Error(`no section "${id}"`);
  return found;
};
const hero = (page: HTMLElement) => page.querySelector<HTMLElement>('[data-hero]')!;
const lastScroll = () => ({
  target: scrollIntoView.mock.contexts.at(-1) as Element | undefined,
  behavior: (scrollIntoView.mock.calls.at(-1)?.[0] as ScrollIntoViewOptions | undefined)?.behavior,
});
/** Reports a field mode change to the page, as the field's frame loop would. */
const setMode = (mode: DeepFieldMode) => act(async () => fields.at(-1)!.opts.onMode?.(mode));

/** Places the sections' top edges (viewport px) and reports a scroll. */
async function scrollPageTo(tops: Record<string, number>, atEnd = false) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return { top: tops[this.id] ?? 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
  });
  Object.defineProperty(window, 'scrollY', { configurable: true, value: atEnd ? 5000 : 100 });
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: atEnd ? 5000 + window.innerHeight : 9000,
  });
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
  });
  await settle(40);
}

describe('the header on the home page', () => {
  it('lists the home sections, each linking to its fragment', async () => {
    const page = await openApp('/');
    expect(headerEntries(page).map((link) => [link.textContent, link.getAttribute('href')])).toEqual(
      navSections.map((item) => [item.nav, `/#${item.id}`]),
    );
    for (const item of navSections) expect(section(page, item.id)).toBeTruthy();
  });

  it('scrolls smoothly to a section when its entry is pressed', async () => {
    const page = await openApp('/');
    expect(scrollIntoView).not.toHaveBeenCalled();
    for (const item of navSections) {
      await click(entry(page, item.nav));
      expect(lastScroll(), item.id).toEqual({ target: section(page, item.id), behavior: 'smooth' });
      expect(window.location.pathname + window.location.hash, item.id).toBe(`/#${item.id}`);
    }
  });

  it('moves keyboard focus to the section heading, so Tab continues from the section', async () => {
    const page = await openApp('/');
    for (const item of navSections) {
      const link = entry(page, item.nav);
      link.focus();
      await click(link);
      expect(document.activeElement, item.id).toBe(section(page, item.id).querySelector('h2'));
    }
    // the hero's scroll cue does the same, for the first section
    const cue = hero(page).querySelector<HTMLAnchorElement>('a[href="/#about"]')!;
    cue.focus();
    await click(cue);
    expect(document.activeElement).toBe(section(page, 'about').querySelector('h2'));
  });

  it('scrolls again when the same entry is pressed again', async () => {
    const page = await openApp('/');
    await click(entry(page, 'WORK'));
    await click(entry(page, 'WORK'));
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(lastScroll().target).toBe(section(page, 'work'));
  });

  it('jumps instead of gliding when the visitor prefers reduced motion', async () => {
    reducedMotion = true;
    const page = await openApp('/');
    await click(entry(page, 'EXPERIENCE'));
    expect(lastScroll()).toEqual({ target: section(page, 'experience'), behavior: 'auto' });
  });

  it('marks the entry of the section in view, and none on the hero', async () => {
    const page = await openApp('/');
    const current = () =>
      headerEntries(page)
        .filter((link) => link.hasAttribute('aria-current'))
        .map((link) => [link.textContent, link.getAttribute('aria-current')]);
    // the hero fills the screen: every section is still below it
    await scrollPageTo({ about: 900, work: 1700, experience: 2600, writing: 3200, contact: 3700 });
    expect(current()).toEqual([]);

    // about is not a header entry, so nothing is marked while reading it
    await scrollPageTo({ about: 80, work: 880, experience: 1780, writing: 2380, contact: 2880 });
    expect(current()).toEqual([]);

    await scrollPageTo({ about: -720, work: 80, experience: 980, writing: 1580, contact: 2080 });
    expect(current()).toEqual([['WORK', 'location']]);

    await scrollPageTo({ about: -1900, work: -1100, experience: -200, writing: 400, contact: 900 });
    expect(current()).toEqual([['EXPERIENCE', 'location']]);

    // the end of the page: contact is too short to reach the top
    await scrollPageTo({ about: -2600, work: -1800, experience: -900, writing: -300, contact: 300 }, true);
    expect(current()).toEqual([['CONTACT', 'location']]);
  });

  it('returns to the top when the logo is pressed', async () => {
    const page = await openApp('/#work');
    scrollTo.mockClear();
    await click(page.querySelector('a[href="/"]')!);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
  });
});

describe('a link to a section', () => {
  it('lands on the section on a fresh load, without gliding', async () => {
    for (const item of [{ id: 'about' }, ...navSections]) {
      const page = await openApp(`/#${item.id}`);
      expect(lastScroll(), item.id).toEqual({ target: section(page, item.id), behavior: 'auto' });
      act(() => root?.unmount());
      host?.remove();
      scrollIntoView.mockClear();
    }
  });

  it('jumps both times when StrictMode runs the arrival twice', async () => {
    window.history.replaceState({}, '', '/#work');
    host = document.createElement('div');
    document.body.appendChild(host);
    const mounted = createRoot(host);
    root = mounted;
    await act(async () => {
      mounted.render(
        <StrictMode>
          <ChakraProvider value={theme}>
            <App />
          </ChakraProvider>
        </StrictMode>,
      );
    });
    for (let i = 0; i < 500 && !host.querySelector('section#work'); i++) await settle(10);
    await settle();
    const behaviors = scrollIntoView.mock.calls.map((call) => (call[0] as ScrollIntoViewOptions).behavior);
    expect(behaviors.length).toBeGreaterThan(1);
    expect(new Set(behaviors)).toEqual(new Set(['auto']));
    expect(lastScroll().target).toBe(host.querySelector('section#work'));
  });

  it('glides when Back returns to the entry the visitor arrived on', async () => {
    const page = await openApp('/#work');
    expect(lastScroll().behavior).toBe('auto');
    await click(entry(page, 'CONTACT'));
    expect(lastScroll()).toEqual({ target: section(page, 'contact'), behavior: 'smooth' });
    // Back: the first entry again, which carries the same key as the arrival
    await act(async () => {
      window.history.replaceState({}, '', '/#work');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(lastScroll()).toEqual({ target: section(page, 'work'), behavior: 'smooth' });
  });

  it('reads a percent-encoded fragment as a browser does', async () => {
    const page = await openApp('/#%63ontact');
    expect(lastScroll().target).toBe(section(page, 'contact'));
  });

  it('starts keyboard focus at the section, as a native fragment link would', async () => {
    const page = await openApp('/#experience');
    expect(document.activeElement).toBe(section(page, 'experience').querySelector('h2'));
  });

  it('stays put without a fragment, or with an unknown or malformed one', async () => {
    for (const path of ['/', '/#', '/#nowhere', '/#%', '/#%E0%A4%A']) {
      await openApp(path);
      expect(scrollIntoView, path).not.toHaveBeenCalled();
      // a fresh load is left where the browser restored it
      expect(scrollTo, path).not.toHaveBeenCalled();
      act(() => root?.unmount());
      host?.remove();
      scrollTo.mockClear();
    }
  });
});

describe('the header on the full pages', () => {
  const pages = [
    { path: '/projects', current: 'WORK' },
    { path: '/arcade', current: 'WORK' },
    { path: '/experience', current: 'EXPERIENCE' },
    { path: '/blog', current: 'WRITING' },
  ];

  it('keeps the same entries, linking to the home sections, with the page\'s own section marked', async () => {
    for (const { path, current } of pages) {
      const page = await openApp(path, 'nav[aria-label="Site"]');
      expect(
        headerEntries(page).map((link) => [link.textContent, link.getAttribute('href')]),
        path,
      ).toEqual(navSections.map((item) => [item.nav, `/#${item.id}`]));
      expect(
        headerEntries(page)
          .filter((link) => link.hasAttribute('aria-current'))
          .map((link) => [link.textContent, link.getAttribute('aria-current')]),
        path,
      ).toEqual([[current, 'true']]);
      act(() => root?.unmount());
      host?.remove();
    }
  });

  it('opens the home page on the section, without gliding', async () => {
    for (const { path } of pages) {
      const page = await openApp(path, 'nav[aria-label="Site"]');
      await click(entry(page, 'CONTACT'));
      for (let i = 0; i < 200 && !page.querySelector('section#contact'); i++) await settle(10);
      await settle();
      expect(window.location.pathname + window.location.hash, path).toBe('/#contact');
      expect(lastScroll(), path).toEqual({ target: section(page, 'contact'), behavior: 'auto' });
      act(() => root?.unmount());
      host?.remove();
      scrollIntoView.mockClear();
    }
  });

  it('opens the home page at its top from the logo, wherever the last page was scrolled', async () => {
    const page = await openApp('/experience', 'nav[aria-label="Site"]');
    await click(page.querySelector('a[href="/"]')!);
    for (let i = 0; i < 200 && !page.querySelector('[data-hero]'); i++) await settle(10);
    await settle();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'auto' });
  });
});

describe('the phone menu', () => {
  const toggle = (page: HTMLElement) => page.querySelector<HTMLButtonElement>('button[aria-label="Toggle menu"]')!;
  const menu = (page: HTMLElement) => page.querySelector<HTMLElement>('#site-menu');

  it('is closed until the button is pressed, then lists the same entries', async () => {
    const page = await openApp('/');
    expect(toggle(page).getAttribute('aria-expanded')).toBe('false');
    expect(menu(page)).toBeNull();
    await click(toggle(page));
    expect(toggle(page).getAttribute('aria-expanded')).toBe('true');
    expect(toggle(page).getAttribute('aria-controls')).toBe(menu(page)?.id);
    expect([...menu(page)!.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual(
      navSections.map((item) => [item.nav, `/#${item.id}`]),
    );
  });

  it('scrolls to the section and closes after a tap', async () => {
    const page = await openApp('/');
    await click(toggle(page));
    const link = [...menu(page)!.querySelectorAll('a')].find((a) => a.textContent === 'WRITING')!;
    await click(link);
    expect(lastScroll()).toEqual({ target: section(page, 'writing'), behavior: 'smooth' });
    expect(toggle(page).getAttribute('aria-expanded')).toBe('false');
    for (let i = 0; i < 100 && menu(page); i++) await settle(20);
    expect(menu(page)).toBeNull();
    // the tapped link is gone with the menu; focus is on the section, not lost
    expect(document.activeElement).toBe(section(page, 'writing').querySelector('h2'));
  });

  it('from another page, opens the home page on the section and is closed there', async () => {
    const page = await openApp('/projects', 'nav[aria-label="Site"]');
    await click(toggle(page));
    await click([...menu(page)!.querySelectorAll('a')].find((a) => a.textContent === 'EXPERIENCE')!);
    for (let i = 0; i < 200 && !page.querySelector('section#experience'); i++) await settle(10);
    await settle();
    expect(lastScroll()).toEqual({ target: section(page, 'experience'), behavior: 'auto' });
    expect(toggle(page).getAttribute('aria-expanded')).toBe('false');
  });

  it('jumps instead of gliding when the visitor prefers reduced motion', async () => {
    reducedMotion = true;
    const page = await openApp('/');
    await click(toggle(page));
    await click([...menu(page)!.querySelectorAll('a')].find((a) => a.textContent === 'CONTACT')!);
    expect(lastScroll()).toEqual({ target: section(page, 'contact'), behavior: 'auto' });
  });
});

describe('the home sections', () => {
  it('each end with a link to their full page', async () => {
    const page = await openApp('/');
    for (const item of navSections) {
      if (!('page' in item)) continue;
      const links = [...section(page, item.id).querySelectorAll('a')];
      expect(links.at(-1)?.getAttribute('href'), item.id).toBe(item.page);
    }
  });

  it('show the selected work from the projects data, not a copy', async () => {
    const page = await openApp('/');
    // each tile is the entry's one link
    const tiles = [...section(page, 'work').querySelectorAll<HTMLAnchorElement>('a[data-project]')];
    expect(tiles.map((tile) => tile.getAttribute('data-project'))).toEqual(SELECTED_WORK);
    for (const tile of tiles) {
      const project = projects.find((p) => p.slug === tile.getAttribute('data-project'))!;
      expect(tile.querySelector('h3')?.textContent, project.slug).toBe(project.name);
      expect(tile.textContent, project.slug).toContain(project.line);
      expect(tile.textContent, project.slug).toContain(project.link.label);
      expect(tile.getAttribute('href'), project.slug).toBe(project.link.href);
      expect(tile.querySelectorAll('a').length, project.slug).toBe(0);
    }
  });

  it('open each selected project the way the projects page does', async () => {
    const page = await openApp('/');
    for (const tile of section(page, 'work').querySelectorAll<HTMLAnchorElement>('a[data-project]')) {
      const href = tile.getAttribute('href')!;
      if (href.startsWith('/arcade/')) {
        // a static game page: a real page load in this tab, which the router must not intercept
        expect(tile.getAttribute('target'), href).toBeNull();
        const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
        // The window hears the click last, after React's root listener where the
        // router would take it over: read the verdict there, then stop
        // happy-dom's own navigation.
        let preventedByApp: boolean | undefined;
        window.addEventListener(
          'click',
          (e) => {
            preventedByApp = e.defaultPrevented;
            e.preventDefault();
          },
          { once: true },
        );
        await act(async () => {
          tile.dispatchEvent(click);
        });
        expect(preventedByApp, href).toBe(false);
        expect(window.location.pathname, href).toBe('/');
      } else if (href.startsWith('/')) {
        expect(tile.getAttribute('target'), href).toBeNull();
      } else {
        expect(href).toMatch(/^https:\/\//);
        expect(tile.getAttribute('target'), href).toBe('_blank');
        expect(tile.getAttribute('rel'), href).toContain('noopener');
        expect(tile.getAttribute('aria-label'), href).toContain('opens in a new tab');
      }
    }
  });

  it('give each selected project a short link name and its line as the description', async () => {
    const page = await openApp('/');
    for (const tile of section(page, 'work').querySelectorAll<HTMLAnchorElement>('a[data-project]')) {
      const project = projects.find((p) => p.slug === tile.getAttribute('data-project'))!;
      expect(tile.getAttribute('aria-label'), project.slug).toContain(`${project.name}: ${project.link.label}`);
      const described = tile.getAttribute('aria-describedby');
      expect(described, project.slug).toBeTruthy();
      const description = document.getElementById(described!);
      expect(description?.textContent, project.slug).toBe(project.line);
      expect(tile.contains(description), project.slug).toBe(true);
    }
  });

  it('load the selected work images lazily, at the small size, in a fixed box', async () => {
    const page = await openApp('/');
    for (const tile of section(page, 'work').querySelectorAll<HTMLAnchorElement>('a[data-project]')) {
      const project = projects.find((p) => p.slug === tile.getAttribute('data-project'))!;
      const img = tile.querySelector('img');
      if (!project.image) {
        expect(img, project.slug).toBeNull();
        continue;
      }
      expect(img?.getAttribute('src'), project.slug).toBe(project.image.small.src);
      expect(img?.getAttribute('alt'), project.slug).toBe(project.image.alt);
      expect(img?.getAttribute('loading'), project.slug).toBe('lazy');
      expect(img?.getAttribute('width'), project.slug).toBe(String(project.image.small.width));
      expect(img?.getAttribute('height'), project.slug).toBe(String(project.image.small.height));
    }
  });

  it('name the employer only in the experience strip', async () => {
    const page = await openApp('/');
    const employer = experienceData.experiences[0].organization;
    expect(section(page, 'experience').textContent).toContain(employer);
    for (const part of [hero(page), section(page, 'about'), section(page, 'contact')]) {
      expect(part.textContent).not.toContain(employer);
      expect(part.textContent).not.toMatch(/AI solutions/i);
    }
  });

  it('keep the about text in one column with reduced motion', async () => {
    reducedMotion = true;
    const page = await openApp('/');
    const about = section(page, 'about');
    const lead = [...about.querySelectorAll('p')].find((p) => p.textContent?.includes('I make games'))!;
    const sheet = about.querySelector('dl')!;
    // the grid that holds both: the nearest ancestor of the fact sheet that also holds the lead
    let grid: Element = sheet;
    while (!grid.contains(lead)) grid = grid.parentElement!;
    // two cells, the text and the fact sheet, in that order; the text lines stay with the lead
    const cells = [...grid.children];
    expect(cells.length).toBe(2);
    expect(cells[0].textContent).toContain('I make games');
    expect(cells[0].textContent).toContain('Hoshi Labs is my one-person studio');
    expect(cells[1].contains(sheet)).toBe(true);
  });

  it('use short lines, not paragraphs, outside the project cards', async () => {
    // "a bit too much prose, a lot of big paragraphs" (owner, 2026-11-27).
    // The cards' own text comes from the projects data and has its own limit.
    const page = await openApp('/');
    const blocks = [...page.querySelectorAll<HTMLElement>('[data-hero] p, main section p, main section h3, footer p')]
      .filter((el) => !el.closest('[data-project]'))
      .map((el) => (el.textContent ?? '').trim())
      .filter(Boolean);
    expect(blocks.length).toBeGreaterThan(3);
    for (const text of blocks) expect(text.split(/\s+/).length, text).toBeLessThanOrEqual(12);
  });

  it('offer every contact address from socialLinks', async () => {
    const page = await openApp('/');
    const hrefs = [...section(page, 'contact').querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([socialLinks.email, socialLinks.linkedin, socialLinks.github, socialLinks.twitter]);
  });

  it('never link to a tailnet, loopback or plain-http address', async () => {
    const page = await openApp('/');
    const external = [...page.querySelectorAll<HTMLAnchorElement>('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => !href.startsWith('/') && !href.startsWith('mailto:'));
    expect(external.length).toBeGreaterThan(0);
    for (const href of external) {
      expect(href).toMatch(/^https:\/\//);
      expect(href).not.toMatch(/ts\.net|localhost|127\.0\.0\.1/);
    }
  });
});

describe('the hero', () => {
  it('has the name, a title, and no description under them', async () => {
    const page = await openApp('/');
    expect(hero(page).querySelector('h1')?.textContent).toBe('GABRIELROSSI');
    expect(hero(page).querySelectorAll('p').length).toBe(1);
    expect(hero(page).querySelector('p')?.textContent).toMatch(/SOFTWARE ENGINEER/);
  });

  it('does not repeat the header: no section links under the name', async () => {
    const page = await openApp('/');
    const inHero = [...hero(page).querySelectorAll<HTMLAnchorElement>('a')];
    for (const item of navSections) {
      expect(inHero.map((a) => a.textContent), item.id).not.toContain(item.nav);
      expect(inHero.map((a) => a.getAttribute('href')), item.id).not.toContain(`/#${item.id}`);
    }
    // what is left: the profiles, and the cue down to the first section
    expect(inHero.map((a) => a.getAttribute('href'))).toEqual([
      socialLinks.linkedin,
      socialLinks.github,
      socialLinks.twitter,
      '/#about',
    ]);
  });

  it('links the profiles from socialLinks, each in a new tab', async () => {
    const page = await openApp('/');
    const external = [...hero(page).querySelectorAll<HTMLAnchorElement>('a[target="_blank"]')];
    expect(external.map((a) => a.getAttribute('href'))).toEqual([
      socialLinks.linkedin,
      socialLinks.github,
      socialLinks.twitter,
    ]);
    for (const a of external) expect(a.getAttribute('rel')).toContain('noopener');
  });

  it('keeps one PLAY button, which starts the game from the top of the page', async () => {
    const page = await openApp('/');
    const plays = [...hero(page).querySelectorAll('button')].filter((b) => b.textContent?.includes('PLAY'));
    expect(plays.length).toBe(1);
    const play = plays[0];
    expect(play.getAttribute('aria-label')).toBeTruthy();
    expect(fields.at(-1)!.play).not.toHaveBeenCalled();
    await click(play);
    expect(fields.at(-1)!.play).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });
});

describe('the field under the hero', () => {
  it('takes title-screen input from the hero only', async () => {
    const page = await openApp('/');
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.at(-1)!.opts.inputScope).toBe(hero(page));
    expect(hero(page).contains(fields.at(-1)!.container)).toBe(true);
    for (const item of navSections) {
      expect(hero(page).contains(section(page, item.id)), item.id).toBe(false);
    }
  });

  it('is paused while the hero is scrolled away and resumed when it is back', async () => {
    const page = await openApp('/');
    const watcher = observers.find((o) => o.targets.includes(hero(page)));
    expect(watcher).toBeTruthy();
    const report = (isIntersecting: boolean) =>
      act(async () =>
        watcher!.callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver),
      );
    await report(false);
    expect(fields.at(-1)!.setPaused).toHaveBeenLastCalledWith(true);
    await report(true);
    expect(fields.at(-1)!.setPaused).toHaveBeenLastCalledWith(false);
  });

  it('locks the page and makes the sections inert from PLAY until the title screen is back', async () => {
    const page = await openApp('/');
    const rest = section(page, 'about').parentElement!;
    const locked = () => [document.documentElement.style.overflow, rest.inert, page.querySelector('footer')!.inert];
    expect(locked()).toEqual(['', false, false]);
    for (const mode of ['engage', 'play', 'disengage'] as const) {
      await setMode(mode);
      expect(locked(), mode).toEqual(['hidden', true, true]);
    }
    await setMode('title');
    expect(locked()).toEqual(['', false, false]);
  });

  it('gives up its minimum height while it is a game, so EXIT stays on a short screen', async () => {
    const page = await openApp('/');
    const minHeight = () => parseFloat(hero(page).style.minHeight);
    // on the title screen the hero may be taller than a short screen: the page scrolls
    expect(minHeight()).toBeGreaterThan(300);
    for (const mode of ['engage', 'play', 'disengage'] as const) {
      await setMode(mode);
      // the page is locked now, so the hero must be exactly the screen
      expect(minHeight(), mode).toBe(0);
    }
    await setMode('title');
    expect(minHeight()).toBeGreaterThan(300);
  });

  it('leaves play first when a header entry is pressed, and scrolls once the title screen is back', async () => {
    const page = await openApp('/');
    await setMode('engage');
    await setMode('play');
    await click(entry(page, 'WORK'));
    expect(fields.at(-1)!.exit).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).not.toHaveBeenCalled();
    await setMode('disengage');
    expect(scrollIntoView).not.toHaveBeenCalled();
    await setMode('title');
    expect(lastScroll()).toEqual({ target: section(page, 'work'), behavior: 'smooth' });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does the same for the logo: leaves play, then returns to the top', async () => {
    const page = await openApp('/#work');
    scrollTo.mockClear();
    await setMode('engage');
    await setMode('play');
    await click(page.querySelector('a[href="/"]')!);
    expect(fields.at(-1)!.exit).toHaveBeenCalledTimes(1);
    expect(scrollTo).not.toHaveBeenCalled();
    await setMode('disengage');
    await setMode('title');
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('drops the queued scroll if the visitor goes Back while the game is still exiting', async () => {
    const page = await openApp('/');
    await setMode('engage');
    await setMode('play');
    await click(entry(page, 'WORK'));
    expect(window.location.hash).toBe('#work');
    await setMode('disengage');
    // Back: the address is `/` again, which asks for no scroll
    await act(async () => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await setMode('title');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(section(page, 'work').querySelector('h2'));
  });

  it('follows the latest link when another is pressed while the game is still exiting', async () => {
    const page = await openApp('/');
    await setMode('engage');
    await setMode('play');
    await click(entry(page, 'WORK'));
    await setMode('disengage');
    await click(entry(page, 'CONTACT'));
    await setMode('title');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(lastScroll().target).toBe(section(page, 'contact'));
  });

  it('drops the queued scroll if PLAY is pressed again while the exit fades in', async () => {
    const page = await openApp('/');
    await setMode('engage');
    await setMode('play');
    await click(entry(page, 'CONTACT'));
    await setMode('disengage');
    const play = [...hero(page).querySelectorAll('button')].find((b) => b.textContent?.includes('PLAY'))!;
    await click(play);
    await setMode('engage');
    await setMode('play');
    await setMode('disengage');
    await setMode('title');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('is disposed, with the page unlocked and at its top, when leaving for another page', async () => {
    const page = await openApp('/');
    const field = fields.at(-1)!;
    await setMode('engage');
    await setMode('play');
    scrollTo.mockClear();
    await act(async () => {
      window.history.pushState({}, '', '/experience');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    for (let i = 0; i < 200 && page.querySelector('[data-hero]'); i++) await settle(10);
    expect(page.querySelector('[data-hero]')).toBeNull();
    expect(field.dispose).toHaveBeenCalled();
    expect(document.documentElement.style.overflow).toBe('');
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

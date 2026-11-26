// @vitest-environment happy-dom
import { act } from 'react';
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

  it('reads a percent-encoded fragment as a browser does', async () => {
    const page = await openApp('/#%63ontact');
    expect(lastScroll().target).toBe(section(page, 'contact'));
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
    const cards = [...section(page, 'work').querySelectorAll<HTMLElement>('[data-project]')];
    expect(cards.map((card) => card.getAttribute('data-project'))).toEqual(SELECTED_WORK);
    for (const card of cards) {
      const project = projects.find((p) => p.slug === card.getAttribute('data-project'))!;
      expect(card.querySelector('h3')?.textContent).toBe(project.name);
      expect(card.textContent).toContain(project.tagline);
      expect(card.textContent).toContain(project.description);
      expect([...card.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(
        project.links.map((link) => link.href),
      );
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

  it('offers work, experience and contact, which scroll to their sections', async () => {
    const page = await openApp('/');
    const actions = [...hero(page).querySelectorAll<HTMLAnchorElement>('a')].filter((a) =>
      ['WORK', 'EXPERIENCE', 'CONTACT'].includes(a.textContent ?? ''),
    );
    expect(actions.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['WORK', '/#work'],
      ['EXPERIENCE', '/#experience'],
      ['CONTACT', '/#contact'],
    ]);
    for (const action of actions) {
      await click(action);
      const id = action.getAttribute('href')!.slice(2);
      expect(lastScroll(), id).toEqual({ target: section(page, id), behavior: 'smooth' });
    }
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

  it('keeps PLAY as a button that starts the game from the top of the page', async () => {
    const page = await openApp('/');
    const play = [...hero(page).querySelectorAll('button')].find((b) => b.textContent?.includes('PLAY'))!;
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

// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import theme from '../../theme';
import { demoHref, demos } from 'data/demos';
import { projectSections, projects, statusLabels } from 'data/projects';

let root: Root | undefined;
let host: HTMLElement | undefined;

// happy-dom has no layout, so the scroll is observed, not performed.
const scrollIntoView = vi.fn();

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = scrollIntoView;
  // Load the page's lazy chunk up front, so a render never waits on the import.
  await import('pages/Arcade');
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  scrollIntoView.mockClear();
});

/** Mounts the whole app on a fresh navigation to `path`, as a deep link would. */
async function openApp(path: string): Promise<HTMLElement> {
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
  // The page is lazy: let it replace the Suspense fallback. The chunk is already
  // loaded, so this normally takes one pass; the bound only stops a broken render.
  for (let i = 0; i < 500 && !host.querySelector('h1'); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return host;
}

const card = (page: HTMLElement, slug: string): HTMLElement => {
  const found = page.querySelector<HTMLElement>(`[data-project="${slug}"]`);
  if (!found) throw new Error(`no card for "${slug}"`);
  return found;
};

describe('the projects page', () => {
  it('renders on /projects and on the old /arcade address', async () => {
    for (const path of ['/projects', '/arcade']) {
      const page = await openApp(path);
      expect(page.querySelector('h1')?.textContent, path).toBe('PROJECTS');
      expect(page.querySelectorAll('[data-project]').length, path).toBe(projects.length);
      expect(page.querySelectorAll('[data-demo]').length, path).toBe(demos.length);
      // Two addresses, one page: both name /projects as the canonical one.
      const canonical = [...document.querySelectorAll('link[rel="canonical"]')];
      expect(canonical.map((link) => link.getAttribute('href')), path).toEqual([
        'https://grossi.tech/projects',
      ]);
      act(() => root?.unmount());
      host?.remove();
    }
  });

  it('points the PROJECTS nav entry at /projects and marks it current on both addresses', async () => {
    for (const path of ['/projects', '/arcade']) {
      const page = await openApp(path);
      const navLinks = [...page.querySelectorAll<HTMLAnchorElement>('a')].filter(
        (link) => link.textContent === 'PROJECTS',
      );
      expect(navLinks.length, path).toBeGreaterThan(0);
      for (const link of navLinks) {
        expect(link.getAttribute('href'), path).toBe('/projects');
        expect(link.getAttribute('aria-current'), path).toBe('page');
      }
      const others = [...page.querySelectorAll<HTMLAnchorElement>('a')].filter((link) =>
        ['EXPERIENCE', 'BLOG'].includes(link.textContent ?? ''),
      );
      expect(others.length, path).toBeGreaterThan(0);
      for (const link of others) expect(link.getAttribute('aria-current'), path).toBeNull();
      act(() => root?.unmount());
      host?.remove();
    }
  });

  it('shows the sections in order: studio, prototypes, tools, then the demos', async () => {
    const page = await openApp('/projects');
    const sections = [...page.querySelectorAll('section')];
    expect(sections.map((section) => section.id)).toEqual(['studio', 'prototypes', 'tools', 'experiments']);
    projectSections.forEach((section, index) => {
      expect(sections[index].querySelector('h2')?.textContent).toBe(section.title);
      const slugs = [...sections[index].querySelectorAll('[data-project]')].map((el) =>
        el.getAttribute('data-project'),
      );
      expect(slugs).toEqual(section.projects.map((project) => project.slug));
    });
    expect(sections[3].querySelectorAll('[data-demo]').length).toBe(demos.length);
    expect(sections[3].querySelectorAll('[data-project]').length).toBe(0);
  });

  it('scrolls to the section named in the address on a fresh load', async () => {
    for (const [path, id] of [
      ['/projects#tools', 'tools'],
      ['/arcade#experiments', 'experiments'],
    ]) {
      const page = await openApp(path);
      const section = page.querySelector(`section#${id}`);
      expect(section, path).not.toBeNull();
      expect(scrollIntoView.mock.contexts.at(-1), path).toBe(section);
      act(() => root?.unmount());
      host?.remove();
      scrollIntoView.mockClear();
    }
  });

  it('stays at the top without a section in the address, or with an unknown one', async () => {
    for (const path of ['/projects', '/projects#nowhere']) {
      await openApp(path);
      expect(scrollIntoView, path).not.toHaveBeenCalled();
      act(() => root?.unmount());
      host?.remove();
    }
  });

  it('names each project link by its project and says it opens a new tab', async () => {
    const page = await openApp('/projects');
    const names = [...page.querySelectorAll('[data-project] a')].map((a) => a.getAttribute('aria-label'));
    expect(new Set(names).size).toBe(names.length);
    for (const project of projects) {
      for (const a of card(page, project.slug).querySelectorAll('a')) {
        const name = a.getAttribute('aria-label') ?? '';
        expect(name, project.slug).toContain(project.name);
        expect(name, project.slug).toContain('opens in a new tab');
        // The accessible name starts with the words a sighted visitor reads.
        const visible = a.querySelector('[aria-hidden="true"]')
          ? (a.textContent ?? '').replace(a.querySelector('[aria-hidden="true"]')?.textContent ?? '', '').trim()
          : '';
        expect(visible, project.slug).not.toBe('');
        expect(name.startsWith(visible), project.slug).toBe(true);
      }
    }
  });

  it('puts name, tagline, description, tech, status and links on every project card', async () => {
    const page = await openApp('/projects');
    for (const project of projects) {
      const el = card(page, project.slug);
      const text = el.textContent ?? '';
      expect(el.querySelector('h3')?.textContent, project.slug).toBe(project.name);
      expect(text, project.slug).toContain(project.tagline);
      expect(text, project.slug).toContain(project.description);
      for (const tech of project.tech) expect(text, project.slug).toContain(tech);
      expect(text, project.slug).toContain(statusLabels[project.status]);
      const anchors = [...el.querySelectorAll('a')];
      expect(anchors.map((a) => a.getAttribute('href')), project.slug).toEqual(
        project.links.map((link) => link.href),
      );
      for (const a of anchors) {
        expect(a.getAttribute('target'), project.slug).toBe('_blank');
        expect(a.getAttribute('rel'), project.slug).toContain('noopener');
      }
    }
  });

  it('gives a private project a note in place of a link', async () => {
    const page = await openApp('/projects');
    for (const slug of ['pickaxe-rs', 'gamelib']) {
      const el = card(page, slug);
      expect(el.querySelectorAll('a').length, slug).toBe(0);
      expect(el.textContent, slug).toContain('NO PUBLIC LINK');
    }
  });

  it('never renders a link to a tailnet, loopback or plain-http address', async () => {
    const page = await openApp('/projects');
    const external = [...page.querySelectorAll<HTMLAnchorElement>('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => !href.startsWith('/') && !href.startsWith('#'));
    expect(external.length).toBeGreaterThan(0);
    for (const href of external) {
      expect(href).toMatch(/^https:\/\//);
      expect(href).not.toMatch(/ts\.net|localhost|127\.0\.0\.1/);
    }
  });

  it('opens every demo where it opened before', async () => {
    const page = await openApp('/arcade');
    for (const demo of demos) {
      const el = page.querySelector<HTMLAnchorElement>(`a[data-demo="${demo.slug}"]`);
      expect(el, demo.slug).not.toBeNull();
      expect(el?.getAttribute('href'), demo.slug).toBe(demoHref(demo));
      expect(el?.textContent, demo.slug).toContain(demo.title);
      expect(el?.textContent, demo.slug).toContain('PLAY');
      // The in-site route stays in this tab; the static builds open in a new one.
      expect(el?.getAttribute('target'), demo.slug).toBe(demo.route ? null : '_blank');
    }
  });
});

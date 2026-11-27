// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import theme from '../../theme';

import { projectGroups, projects } from 'data/projects';

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

const row = (page: HTMLElement, slug: string): HTMLElement => {
  const found = page.querySelector<HTMLElement>(`[data-project="${slug}"]`);
  if (!found) throw new Error(`no row for "${slug}"`);
  return found;
};

const unmount = () => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
};

describe('the projects page (placeholder)', () => {
  it('renders every entry on /projects and on the old /arcade address', async () => {
    for (const path of ['/projects', '/arcade']) {
      const page = await openApp(path);
      expect(page.querySelector('h1')?.textContent, path).toBe('PROJECTS');
      expect(
        [...page.querySelectorAll('[data-project]')].map((el) => el.getAttribute('data-project')),
        path,
      ).toEqual(projects.map((project) => project.slug));
      // Two addresses, one page: both name /projects as the canonical one.
      const canonical = [...document.querySelectorAll('link[rel="canonical"]')];
      expect(canonical.map((link) => link.getAttribute('href')), path).toEqual(['https://grossi.tech/projects']);
      unmount();
    }
  });

  it('marks WORK, the page\'s section, in the header on both addresses', async () => {
    // The header lists the home page's sections on every page (see
    // components/home/homePage.test.tsx); the projects page is the full page
    // of the work section.
    for (const path of ['/projects', '/arcade']) {
      const page = await openApp(path);
      const entries = [...page.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Site"] a')];
      const work = entries.filter((link) => link.textContent === 'WORK');
      expect(work.length, path).toBeGreaterThan(0);
      for (const link of work) {
        expect(link.getAttribute('href'), path).toBe('/#work');
        expect(link.getAttribute('aria-current'), path).toBe('true');
      }
      const others = entries.filter((link) => link.textContent !== 'WORK');
      expect(others.length, path).toBeGreaterThan(0);
      for (const link of others) expect(link.getAttribute('aria-current'), path).toBeNull();
      unmount();
    }
  });

  it('shows each group as a section with its entries in order', async () => {
    const page = await openApp('/projects');
    const sections = [...page.querySelectorAll('section')];
    expect(sections.map((section) => section.id)).toEqual(projectGroups.map((group) => group.id));
    projectGroups.forEach((group, index) => {
      expect(sections[index].querySelector('h2')?.textContent).toBe(group.title);
      expect(
        [...sections[index].querySelectorAll('[data-project]')].map((el) => el.getAttribute('data-project')),
      ).toEqual(group.projects.map((project) => project.slug));
    });
  });

  it('shows the name, kind, line, one link and the image of every entry', async () => {
    const page = await openApp('/projects');
    for (const project of projects) {
      const el = row(page, project.slug);
      expect(el.querySelector('h3')?.textContent, project.slug).toBe(project.name);
      expect(el.textContent, project.slug).toContain(project.kind);
      expect(el.textContent, project.slug).toContain(project.line);
      const links = [...el.querySelectorAll('a')];
      expect(links.map((a) => a.getAttribute('href')), project.slug).toEqual([project.link.href]);
      expect(links[0].textContent, project.slug).toContain(project.link.label);
      expect(links[0].getAttribute('aria-label'), project.slug).toContain(project.name);
      const img = el.querySelector('img');
      if (project.image) {
        expect(img?.getAttribute('src'), project.slug).toBe(project.image.small.src);
        expect(img?.getAttribute('alt'), project.slug).toBe(project.image.alt);
        expect(img?.getAttribute('loading'), project.slug).toBe('lazy');
        expect(img?.getAttribute('width'), project.slug).toBeTruthy();
        expect(img?.getAttribute('height'), project.slug).toBeTruthy();
      } else {
        expect(img, project.slug).toBeNull();
      }
    }
  });

  it('opens other sites in a new tab and the arcade games in this one', async () => {
    const page = await openApp('/projects');
    for (const project of projects) {
      const a = row(page, project.slug).querySelector('a')!;
      if (project.link.href.startsWith('https://')) {
        expect(a.getAttribute('target'), project.slug).toBe('_blank');
        expect(a.getAttribute('rel'), project.slug).toContain('noopener');
      } else {
        expect(a.getAttribute('target'), project.slug).toBeNull();
      }
    }
  });

  it('scrolls to the group named in the address on a fresh load', async () => {
    for (const [path, id] of [
      ['/projects#arcade', 'arcade'],
      ['/arcade#prototypes', 'prototypes'],
      ['/projects#%61rcade', 'arcade'],
    ]) {
      const page = await openApp(path);
      expect(scrollIntoView.mock.contexts.at(-1), path).toBe(page.querySelector(`section#${id}`));
      unmount();
      scrollIntoView.mockClear();
    }
    for (const path of ['/projects', '/projects#', '/projects#nowhere', '/projects#%']) {
      await openApp(path);
      expect(scrollIntoView, path).not.toHaveBeenCalled();
      unmount();
    }
  });
});

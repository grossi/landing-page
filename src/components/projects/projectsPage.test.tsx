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

describe('the projects page (mock C, select screen)', () => {
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

  it('points the PROJECTS nav entry at /projects and marks it current on both addresses', async () => {
    for (const path of ['/projects', '/arcade']) {
      const page = await openApp(path);
      const nav = [...page.querySelectorAll<HTMLAnchorElement>('a')].filter((a) => a.textContent === 'PROJECTS');
      expect(nav.length, path).toBeGreaterThan(0);
      for (const a of nav) {
        expect(a.getAttribute('href'), path).toBe('/projects');
        expect(a.getAttribute('aria-current'), path).toBe('page');
      }
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

  // Mock C ("Select screen"): a row is the entry's name and its one link; the
  // kind, line and image show in the preview of the selected entry.
  it('shows the name, kind, line, one link and the image of every entry', async () => {
    const page = await openApp('/projects');
    const preview = () => page.querySelector<HTMLElement>('[data-preview]')!;
    expect(preview().getAttribute('data-preview')).toBe(projects[0].slug);
    for (const project of projects) {
      const el = row(page, project.slug);
      const links = [...el.querySelectorAll('a')];
      expect(links.map((a) => a.getAttribute('href')), project.slug).toEqual([project.link.href]);
      expect(links[0].textContent, project.slug).toContain(project.name);
      expect(links[0].getAttribute('aria-label'), project.slug).toContain(project.link.label);
      expect(links[0].getAttribute('aria-label'), project.slug).toContain(project.name);
      expect(el.textContent, project.slug).toContain(project.line);

      act(() => links[0].focus());
      expect(preview().getAttribute('data-preview'), project.slug).toBe(project.slug);
      expect(preview().textContent, project.slug).toContain(project.name);
      expect(preview().textContent, project.slug).toContain(project.kind);
      expect(preview().textContent, project.slug).toContain(project.line);
      const go = preview().querySelector('[data-preview-link]')!;
      expect(go.getAttribute('href'), project.slug).toBe(project.link.href);
      expect(go.textContent, project.slug).toContain(project.link.label);
      if (project.image) {
        const img = preview().querySelector('img[data-shown]');
        // happy-dom loads no images, so the frame may still hold the last one.
        const pic = preview().querySelector(`img[src="${project.image.large.src}"]`);
        expect(pic, project.slug).not.toBeNull();
        expect(pic?.getAttribute('width'), project.slug).toBeTruthy();
        expect(pic?.getAttribute('height'), project.slug).toBeTruthy();
        expect(img === null || img.getAttribute('alt') !== '', project.slug).toBe(true);
      } else {
        expect(preview().querySelector('img[data-shown]'), project.slug).toBeNull();
        expect(preview().querySelector('[data-blank]')?.textContent, project.slug).toContain(project.name);
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

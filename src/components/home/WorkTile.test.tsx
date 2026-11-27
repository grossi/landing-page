// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ChakraProvider } from '@chakra-ui/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeAll, expect, it } from 'vitest';
import theme from '../../theme';
import WorkTile from 'components/home/WorkTile';
import type { Project } from 'data/projects';

// The home page's four picks are all external or static arcade pages with
// images; these cover the other two cases a pick from the data can be.

let root: Root | undefined;
let host: HTMLElement | undefined;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const Where = () => <p data-where>{useLocation().pathname}</p>;

async function render(project: Project) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ChakraProvider value={theme}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="*" element={<><WorkTile project={project} /><Where /></>} />
          </Routes>
        </MemoryRouter>
      </ChakraProvider>,
    );
  });
  return host;
}

it('sends an in-site page through the router, in this tab', async () => {
  const page = await render({
    slug: 'ephemeris',
    name: 'EPHEMERIS',
    kind: 'game',
    line: 'daily solar-system survey',
    link: { label: 'PLAY', href: '/ephemeris' },
  });
  const tile = page.querySelector<HTMLAnchorElement>('a[data-project="ephemeris"]')!;
  expect(tile.getAttribute('target')).toBeNull();
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  await act(async () => {
    tile.dispatchEvent(click);
  });
  // the router took the click and moved to the page without a page load
  expect(click.defaultPrevented).toBe(true);
  expect(page.querySelector('[data-where]')?.textContent).toBe('/ephemeris');
});

it('shows a project without an image as name, line and link, with no empty image', async () => {
  const page = await render({
    slug: 'fold-fix',
    name: 'FoldFix',
    kind: 'app',
    line: 'Screen switching for first-generation Pixel Folds with a dead hinge sensor',
    link: { label: 'SOURCE', href: 'https://github.com/grossi/fold-fix' },
  });
  const tile = page.querySelector<HTMLAnchorElement>('a[data-project="fold-fix"]')!;
  expect(tile.querySelector('img')).toBeNull();
  expect(tile.querySelector('h3')?.textContent).toBe('FoldFix');
  expect(tile.textContent).toContain('Screen switching for first-generation Pixel Folds');
  expect(tile.getAttribute('href')).toBe('https://github.com/grossi/fold-fix');
  expect(tile.getAttribute('target')).toBe('_blank');
});

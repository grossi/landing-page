/// <reference types="node" />
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { arcadeGames } from 'data/demos';
import { projectGroups, projects, type ImageFile } from 'data/projects';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

/** Width and height from a WebP file's header (VP8, VP8L or VP8X). */
function webpSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8 ') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  throw new Error(`unknown WebP chunk ${chunk}`);
}

/** The file on disk behind an imported image URL (`/src/data/images/x.webp`). */
const fileOf = (image: ImageFile): string => {
  const path = image.src.split('?')[0];
  expect(path, image.src).toMatch(/^\/src\/data\/images\/[a-z0-9-]+\.webp$/);
  return `${repoRoot}${path.slice(1)}`;
};

describe('entries', () => {
  it('are exactly the agreed list, grouped in page order', () => {
    expect(projectGroups.map((group) => [group.id, group.projects.map((p) => p.slug)])).toEqual([
      ['hoshi-labs', ['hoshi-labs', 'star-survival', 'tactia-pocket']],
      ['prototypes', ['mossmage', 'emberwatch', 'tsukikage']],
      ['web-and-apps', ['isuzu-portfolio', 'fold-fix']],
      ['arcade', ['meridian', 'hypertunnel', 'ephemeris']],
    ]);
    expect(projects).toEqual(projectGroups.flatMap((group) => group.projects));
  });

  it('leave out what has no public link or was cut', () => {
    for (const slug of ['pickaxe-rs', 'gamelib', 'image-gen-mcp', 'game-prototypes', 'murmur']) {
      expect(projects.some((project) => project.slug === slug), slug).toBe(false);
    }
  });

  it('have unique, URL-safe slugs and group ids', () => {
    const slugs = projects.map((project) => project.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const ids = projectGroups.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of projectGroups) expect(group.title.trim(), group.id).not.toBe('');
  });

  it('carry only a name, kind, line, link and optional image', () => {
    for (const project of projects) {
      expect(Object.keys(project).sort(), project.slug).toEqual(
        project.image
          ? ['image', 'kind', 'line', 'link', 'name', 'slug']
          : ['kind', 'line', 'link', 'name', 'slug'],
      );
      expect(project.name.trim(), project.slug).not.toBe('');
      expect(['game', 'site', 'app', 'demo'], project.slug).toContain(project.kind);
      expect(Object.keys(project.link).sort(), project.slug).toEqual(['href', 'label']);
      expect(['PLAY', 'VISIT', 'GET', 'SOURCE'], project.slug).toContain(project.link.label);
    }
  });

  it('say one line of at most 12 words', () => {
    for (const project of projects) {
      const words = project.line.trim().split(/\s+/);
      expect(project.line.trim(), project.slug).not.toBe('');
      expect(project.line, project.slug).not.toMatch(/\n/);
      expect(words.length, `${project.slug}: "${project.line}"`).toBeLessThanOrEqual(12);
    }
  });

  it('use the arcade taglines from ARCADE.md', () => {
    expect(arcadeGames.map((game) => [game.name, game.line])).toEqual([
      ['MERIDIAN', 'low-altitude run across a changing world'],
      ['HYPERTUNNEL', 'tunnel reflex run with a perfect chain'],
      ['EPHEMERIS', 'daily solar-system survey'],
    ]);
  });
});

describe('links', () => {
  it('are public https URLs or in-site paths, never a tailnet or local host', () => {
    for (const { slug, link } of projects) {
      if (link.href.startsWith('/')) {
        expect(link.href, slug).not.toMatch(/^\/\//);
        continue;
      }
      const url = new URL(link.href);
      expect(url.protocol, slug).toBe('https:');
      expect(url.hostname.endsWith('.ts.net'), slug).toBe(false);
      expect(url.hostname, slug).not.toMatch(/^(localhost|.*\.local|.*\.lan|.*\.internal|[\d.]+|\[.*\])$/);
      expect(url.port + url.username + url.password, slug).toBe('');
    }
  });

  it('send every in-site link to a page that exists', () => {
    for (const { slug, link } of projects.filter((project) => project.link.href.startsWith('/'))) {
      if (link.href === '/ephemeris') continue; // a route in App.tsx
      expect(existsSync(`${repoRoot}public${link.href}`), `${slug}: ${link.href}`).toBe(true);
    }
  });

  it('link only the repo checked as public and the one public store listing', () => {
    const hosts = projects.map((project) => [project.slug, project.link.href]);
    const repos = hosts.filter(([, href]) => href.startsWith('https://github.com/'));
    expect(repos).toEqual([['fold-fix', 'https://github.com/grossi/fold-fix']]);
    const stores = hosts.filter(([, href]) => href.includes('play.google.com'));
    expect(stores).toEqual([
      ['star-survival', 'https://play.google.com/store/apps/details?id=net.jp.hoshilabs.starsurvival'],
    ]);
  });

  it('send prototypes straight to a game, never to the prototypes index', () => {
    for (const project of projects) {
      const { hostname, pathname } = new URL(project.link.href, 'https://grossi.tech');
      if (hostname !== 'game-prototypes-omega.vercel.app') continue;
      expect(project.kind, project.slug).toBe('demo');
      expect(project.link.label, project.slug).toBe('PLAY');
      expect(pathname, project.slug).toMatch(/^\/games\/\d{2}_[a-z0-9_]+\/$/);
    }
    const demos = projects.filter((project) => project.link.href.startsWith('https://game-prototypes-omega.vercel.app/'));
    expect(demos.map((project) => project.slug)).toEqual(['mossmage', 'emberwatch', 'tsukikage']);
  });
});

describe('images', () => {
  const withImages = projects.filter((project) => project.image);

  it('exist for every entry but FoldFix', () => {
    expect(projects.filter((project) => !project.image).map((project) => project.slug)).toEqual(['fold-fix']);
  });

  it('are WebP files of their stated size and within the byte limits', () => {
    for (const project of withImages) {
      const image = project.image!;
      for (const [file, size, limit] of [
        [image.large, [1280, 800], 120_000],
        [image.small, [640, 400], 40_000],
      ] as const) {
        expect([file.width, file.height], project.slug).toEqual(size);
        const path = fileOf(file);
        expect(existsSync(path), path).toBe(true);
        expect(webpSize(readFileSync(path)), path).toEqual({ width: file.width, height: file.height });
        expect(statSync(path).size, path).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('have alt text that names what is shown', () => {
    for (const project of withImages) {
      const alt = project.image!.alt;
      expect(alt.length, project.slug).toBeGreaterThan(20);
      expect(alt, project.slug).not.toMatch(/screenshot of|image of/i);
    }
  });

  it('are not shared between entries', () => {
    const files = withImages.flatMap((project) => [project.image!.large.src, project.image!.small.src]);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe('the whole data', () => {
  it('holds no private detail', () => {
    const text = JSON.stringify(projectGroups);
    for (const forbidden of [
      /ts\.net/i,
      /tailnet|tailscale/i,
      /localhost|127\.0\.0\.1/i,
      /\/home\//,
      /internal t(rack|esting)/i,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
    expect(text.match(/net\.jp\.[a-z0-9.]+/gi)).toEqual(['net.jp.hoshilabs.starsurvival']);
  });
});

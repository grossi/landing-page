/// <reference types="node" />
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { demoHref, demos } from 'data/demos';
import {
  projectSections,
  projects,
  statusLabels,
  type Project,
  type ProjectLink,
} from 'data/projects';

const bySlug = (slug: string): Project => {
  const found = projects.find((project) => project.slug === slug);
  if (!found) throw new Error(`no project with slug "${slug}"`);
  return found;
};

const hrefs = (slug: string) => bySlug(slug).links.map((link) => link.href);

const allLinks: ProjectLink[] = projects.flatMap((project) => project.links);

// Repos checked as PUBLIC with `gh repo view <repo> --json visibility` on
// 2026-11-26. Linking another repo means checking it and adding it here.
const PUBLIC_REPOS = [
  'https://github.com/grossi/isuzu-artist-portfolio',
  'https://github.com/grossi/fold-fix',
  'https://github.com/grossi/image-gen-mcp',
];

describe('project data shape', () => {
  it('groups the page as studio, prototypes, tools, in that order', () => {
    expect(projectSections.map((section) => section.id)).toEqual(['studio', 'prototypes', 'tools']);
    for (const section of projectSections) {
      expect(section.title.trim()).not.toBe('');
      expect(section.blurb.trim()).not.toBe('');
      expect(section.projects.length).toBeGreaterThan(0);
    }
  });

  it('uses unique, URL-safe slugs across projects and demos', () => {
    const slugs = [...projects.map((project) => project.slug), ...demos.map((demo) => demo.slug)];
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('gives every project a name, tagline, description, tech and a known status', () => {
    for (const project of projects) {
      expect(project.name.trim(), project.slug).not.toBe('');
      expect(project.tagline.trim(), project.slug).not.toBe('');
      expect(project.tech.length, project.slug).toBeGreaterThan(0);
      for (const item of project.tech) expect(item.trim(), project.slug).not.toBe('');
      expect(Object.keys(statusLabels), project.slug).toContain(project.status);
    }
  });

  it('keeps each description to two or three sentences', () => {
    for (const project of projects) {
      const sentences = project.description.split(/(?<=[.!?])\s+/).filter(Boolean);
      expect(sentences.length, project.slug).toBeGreaterThanOrEqual(2);
      expect(sentences.length, project.slug).toBeLessThanOrEqual(3);
    }
  });

  it('labels every link', () => {
    for (const link of allLinks) expect(link.label.trim(), link.href).not.toBe('');
  });
});

describe('project links are public', () => {
  it('uses https for every external link and never a tailnet host', () => {
    expect(allLinks.length).toBeGreaterThan(0);
    for (const link of allLinks) {
      const url = new URL(link.href);
      expect(url.protocol, link.href).toBe('https:');
      expect(url.hostname.endsWith('.ts.net'), link.href).toBe(false);
      expect(url.hostname, link.href).not.toBe('ts.net');
      expect(url.port, link.href).toBe('');
      expect(url.username + url.password, link.href).toBe('');
    }
  });

  it('never links a loopback, LAN or bare-IP host', () => {
    for (const link of allLinks) {
      const { hostname } = new URL(link.href);
      expect(hostname, link.href).not.toMatch(/^(localhost|.*\.local|.*\.lan|.*\.internal)$/);
      expect(hostname, link.href).not.toMatch(/^[\d.]+$|^\[/);
      expect(hostname, link.href).toContain('.');
    }
  });

  it('links only repos that were checked as public', () => {
    const repoLinks = allLinks.filter((link) => new URL(link.href).hostname === 'github.com');
    expect(repoLinks.map((link) => link.href).sort()).toEqual([...PUBLIC_REPOS].sort());
  });

  it('links one store listing: the released Star Survival', () => {
    const storeLinks = allLinks.filter((link) => /(^|\.)play\.google\.com$/.test(new URL(link.href).hostname));
    expect(storeLinks.map((link) => link.href)).toEqual([
      'https://play.google.com/store/apps/details?id=net.jp.hoshilabs.starsurvival',
    ]);
  });

  it('keeps private details out of every string in the data', () => {
    const text = JSON.stringify({ projectSections, demos });
    for (const forbidden of [
      /ts\.net/i,
      /tailnet|tailscale/i,
      /localhost|127\.0\.0\.1/i,
      /\/home\//,
      /internal t(rack|esting)/i,
      /\b\d{1,3}(\.\d{1,3}){3}\b/,
    ]) {
      expect(text).not.toMatch(forbidden);
    }
    // The one app id on the page is the released game's public listing.
    expect(text.match(/net\.jp\.[a-z0-9.]+/gi)).toEqual(['net.jp.hoshilabs.starsurvival']);
  });
});

describe('the real projects', () => {
  it('lists the studio and all four Hoshi Labs games first, each with its checked page', () => {
    expect(projectSections[0].projects.map((project) => project.slug)).toEqual([
      'hoshi-labs',
      'star-survival',
      'tactia-pocket',
      'yonkoma-yokocho',
      'yomikiri',
    ]);
    expect(hrefs('hoshi-labs')).toEqual(['https://hoshilabs.jp.net/en/']);
    expect(hrefs('star-survival')).toEqual([
      'https://play.google.com/store/apps/details?id=net.jp.hoshilabs.starsurvival',
      'https://hoshilabs.jp.net/en/games/star-survival/',
    ]);
    expect(hrefs('tactia-pocket')).toEqual(['https://hoshilabs.jp.net/en/games/tactia-pocket/']);
    expect(hrefs('yonkoma-yokocho')).toEqual(['https://hoshilabs.jp.net/en/games/yonkoma/']);
    expect(hrefs('yomikiri')).toEqual(['https://hoshilabs.jp.net/en/games/yomikiri/']);
  });

  it('marks only Star Survival as released; the other games are coming soon', () => {
    expect(bySlug('star-survival').status).toBe('released');
    for (const slug of ['tactia-pocket', 'yonkoma-yokocho', 'yomikiri']) {
      expect(bySlug(slug).status, slug).toBe('coming-soon');
    }
  });

  it('lists the prototypes workspace with its public deployment', () => {
    expect(bySlug('game-prototypes').status).toBe('prototype');
    expect(hrefs('game-prototypes')).toEqual(['https://game-prototypes-omega.vercel.app/']);
  });

  it('lists the tools and open source with their public links', () => {
    expect(hrefs('isuzu-portfolio')).toEqual([
      'https://isuzu.work/',
      'https://github.com/grossi/isuzu-artist-portfolio',
    ]);
    expect(hrefs('fold-fix')).toEqual(['https://github.com/grossi/fold-fix']);
    expect(hrefs('image-gen-mcp')).toEqual(['https://github.com/grossi/image-gen-mcp']);
    for (const slug of ['fold-fix', 'image-gen-mcp']) expect(bySlug(slug).status, slug).toBe('open-source');
  });

  it('says image-gen-mcp is a fork, not an original project', () => {
    const fork = bySlug('image-gen-mcp');
    expect(`${fork.tagline} ${fork.description}`).toMatch(/fork/i);
  });

  it('shows private projects without any link', () => {
    const unlinked = projects.filter((project) => project.links.length === 0);
    expect(unlinked.map((project) => project.slug).sort()).toEqual(['gamelib', 'pickaxe-rs']);
    for (const project of unlinked) {
      expect(['in-development', 'private'], project.slug).toContain(project.status);
    }
  });

  it('gives every public status at least one link', () => {
    for (const project of projects) {
      if (project.status === 'in-development' || project.status === 'private') continue;
      expect(project.links.length, project.slug).toBeGreaterThan(0);
    }
  });
});

describe('the demos', () => {
  it('keeps all nine, in the original order', () => {
    expect(demos.map((demo) => demo.slug)).toEqual([
      'ephemeris',
      'meridian',
      'murmur',
      'horizon',
      'drift',
      'city',
      'tunnel',
      'asteroids',
      'stack',
    ]);
  });

  it('opens EPHEMERIS on its site route and the rest from their static builds', () => {
    expect(demoHref(demos[0])).toBe('/ephemeris');
    for (const demo of demos.slice(1)) {
      expect(demo.route, demo.slug).toBeUndefined();
      expect(demoHref(demo), demo.slug).toBe(`/arcade/${demo.slug}/index.html`);
    }
  });

  it('points every static demo at a build that exists in public/', () => {
    for (const demo of demos) {
      if (demo.route) continue;
      const file = fileURLToPath(new URL(`../../public${demoHref(demo)}`, import.meta.url));
      expect(existsSync(file), file).toBe(true);
    }
  });

  it('gives every demo its card fields', () => {
    for (const demo of demos) {
      for (const field of [demo.title, demo.tagline, demo.description, demo.controls]) {
        expect(field.trim(), demo.slug).not.toBe('');
      }
      expect(['game', 'simulation'], demo.slug).toContain(demo.kind);
    }
  });
});

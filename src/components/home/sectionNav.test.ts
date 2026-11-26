import { describe, expect, it } from 'vitest';
import {
  homeSections,
  navSections,
  pickActiveSection,
  sectionForPage,
  sectionFromHash,
  sectionHref,
} from 'components/home/sectionNav';

describe('the home sections', () => {
  it('lists the header entries in page order, each with a label', () => {
    expect(navSections.map((section) => section.id)).toEqual(['work', 'experience', 'writing', 'contact']);
    expect(navSections.map((section) => section.nav)).toEqual(['WORK', 'EXPERIENCE', 'WRITING', 'CONTACT']);
    const order = homeSections.map((section) => section.id);
    expect(navSections.map((section) => order.indexOf(section.id))).toEqual([1, 2, 3, 4]);
  });

  it('has unique ids that are safe to use as fragments', () => {
    const ids = homeSections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+$/);
  });

  it('links a section as a fragment of the home page', () => {
    expect(sectionHref('work')).toBe('/#work');
    expect(sectionHref('contact')).toBe('/#contact');
  });
});

describe('sectionFromHash', () => {
  it('names the section a fragment points at', () => {
    for (const { id } of homeSections) expect(sectionFromHash(`#${id}`)).toBe(id);
  });

  it('reads a percent-encoded fragment as a browser does', () => {
    expect(sectionFromHash('#%77ork')).toBe('work');
    expect(sectionFromHash('#%63ontact')).toBe('contact');
  });

  it('is null without a fragment, or with an unknown or malformed one', () => {
    for (const hash of ['', '#', '#nowhere', '#Work', '#work/more', '#%', '#%E0%A4%A']) {
      expect(sectionFromHash(hash), hash).toBeNull();
    }
  });
});

describe('sectionForPage', () => {
  it('names the section a full page belongs to, old address included', () => {
    expect(sectionForPage('/projects')).toBe('work');
    expect(sectionForPage('/arcade')).toBe('work');
    expect(sectionForPage('/experience')).toBe('experience');
    expect(sectionForPage('/blog')).toBe('writing');
  });

  it('is null on the home page and on a page no section summarises', () => {
    for (const path of ['/', '/ephemeris', '/projects/', '/nowhere']) {
      expect(sectionForPage(path), path).toBeNull();
    }
  });
});

describe('pickActiveSection', () => {
  // Top edges relative to the viewport, in page order; the line sits at 300.
  const tops = (about: number) => [
    { id: 'about', top: about },
    { id: 'work', top: about + 700 },
    { id: 'experience', top: about + 1500 },
    { id: 'contact', top: about + 2100 },
  ];

  it('is null while the first section is still below the line (the hero)', () => {
    expect(pickActiveSection(tops(900), 300, false)).toBeNull();
    expect(pickActiveSection(tops(301), 300, false)).toBeNull();
  });

  it('is the last section whose top has reached the line', () => {
    expect(pickActiveSection(tops(300), 300, false)).toBe('about');
    expect(pickActiveSection(tops(-399), 300, false)).toBe('about');
    expect(pickActiveSection(tops(-400), 300, false)).toBe('work');
    expect(pickActiveSection(tops(-1200), 300, false)).toBe('experience');
  });

  it('is the last section at the end of the page, even if its top never reaches the line', () => {
    // contact's top is at 500, below the line, but the page cannot scroll further
    expect(pickActiveSection(tops(-1600), 300, false)).toBe('experience');
    expect(pickActiveSection(tops(-1600), 300, true)).toBe('contact');
  });

  it('is null with no sections', () => {
    expect(pickActiveSection([], 300, false)).toBeNull();
    expect(pickActiveSection([], 300, true)).toBeNull();
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { contactKind, isHomeContact } from 'components/ephemeris/contacts';
import { CONTACT_KINDS, contactValue, type ContactKind } from 'components/ephemeris/survey';
import { hashCoords, mulberry32 } from 'engine/core/rng';
import { RING } from 'engine/render/assets';
import {
  buildHomeSystem,
  buildSectorContent,
  drawSectorHeader,
  TRUE_SCALE,
  type Poi,
} from 'engine/world/sectorContent';

/**
 * Kinds the weighted archetype table produces, in its order
 * (engine/world/sectorContent BUILDERS). A new archetype makes this list too
 * short and the test below says so.
 */
const ARCHETYPE_KINDS: ContactKind[][] = [
  ['cluster'],
  ['nebula'],
  ['planet', 'ringedPlanet'],
  ['star', 'planet'],
  ['binary'],
  ['monoliths'],
  ['pulsar'],
  ['swarm'],
  ['station'],
];

/** Every POI of `cells` sectors of one world, with the archetype that built it. */
function sectorPois(worldSeed: number, cells: number) {
  const out: Array<{ poi: Poi; archetype: number }> = [];
  const center = new THREE.Vector3();
  for (let i = 0; i < cells; i++) {
    const cell = hashCoords(i, i * 7 + 1, -i, worldSeed);
    const archetype = drawSectorHeader(mulberry32(cell)).builderIndex;
    const content = buildSectorContent(mulberry32(cell), 12000, center, TRUE_SCALE);
    for (const poi of content.pois) out.push({ poi, archetype });
    content.dispose();
  }
  return out;
}

describe('contact kinds against the real world', () => {
  const pois = [...sectorPois(20261126, 400), ...sectorPois(7, 400)];

  it('gives every POI of every archetype a kind of its own, never the fallback', () => {
    const seen = new Map<number, Set<ContactKind>>();
    for (const { poi, archetype } of pois) {
      const kind = contactKind(poi);
      expect(kind, poi.name).not.toBe('anomaly');
      expect(ARCHETYPE_KINDS[archetype], `archetype ${archetype} is not in the list`).toBeDefined();
      expect(ARCHETYPE_KINDS[archetype], poi.name).toContain(kind);
      seen.set(archetype, (seen.get(archetype) ?? new Set()).add(kind));
    }
    // 800 sectors hold every archetype, and every kind each one can produce
    expect([...seen.keys()].sort()).toEqual(ARCHETYPE_KINDS.map((_, i) => i));
    for (const [archetype, kinds] of seen) {
      expect([...kinds].sort(), `archetype ${archetype}`).toEqual([...ARCHETYPE_KINDS[archetype]].sort());
    }
  });

  it('gives every kind the world produces a value', () => {
    for (const { poi } of pois) {
      const kind = contactKind(poi);
      expect(contactValue(kind, false), poi.name).toBeGreaterThan(0);
    }
  });

  it('scans formations from inside and solid bodies from outside', () => {
    for (const { poi } of pois) {
      const kind = contactKind(poi);
      expect(CONTACT_KINDS[kind].enter ?? false, poi.name).toBe(!poi.solid);
    }
  });

  it('classifies the home system: a star, seven planets (some ringed), the comet', () => {
    const counts = new Map<ContactKind, number>();
    let ringedSeen = 0;
    for (const seed of [1, 2, 3, 20261126]) {
      const home = buildHomeSystem(mulberry32(seed), TRUE_SCALE.home);
      const kinds = home.pois.map(contactKind);
      expect(kinds[0]).toBe('star');
      expect(kinds.at(-1)).toBe('comet');
      const planets = kinds.slice(1, -1);
      expect(planets).toHaveLength(7);
      for (const kind of planets) expect(['planet', 'ringedPlanet']).toContain(kind);
      for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
      // the ring the classifier reads is the ring that is drawn
      home.pois.forEach((poi, i) => {
        const drawn = poi.object.children.some((child) => (child as THREE.Mesh).geometry === RING);
        if (kinds[i] === 'ringedPlanet') ringedSeen++;
        if (kinds[i] === 'planet' || kinds[i] === 'ringedPlanet') {
          expect(kinds[i] === 'ringedPlanet', poi.name).toBe(drawn);
        }
      });
      home.dispose();
    }
    expect(ringedSeen).toBeGreaterThan(0);
    expect(counts.get('planet')).toBeGreaterThan(0);
  });

  it('does not take a star\'s halo for a ring', () => {
    const stars = pois.filter(({ poi }) => poi.lod?.kind === 'star');
    expect(stars.length).toBeGreaterThan(0);
    for (const { poi } of stars) expect(contactKind(poi)).toBe('star');
  });
});

describe('contact ids', () => {
  it('home contacts pay ×1, everything else is out-system', () => {
    expect(isHomeContact('home:3')).toBe(true);
    expect(isHomeContact('2,0,-1:0')).toBe(false);
  });
});

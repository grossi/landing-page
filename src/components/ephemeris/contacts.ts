import type * as THREE from 'three';
import { RING } from 'engine/render/assets';
import type { Poi } from 'engine/world/sectorContent';
import { classifyContact, type ContactKind } from 'components/ephemeris/survey';

/**
 * Kind of an engine POI, for the survey. The one place the rules read the
 * engine's content: a body's LOD registration says star or planet, the
 * shared ring geometry among its decorations says ringed, and every other
 * archetype is told apart by the name its builder gives it.
 */
export function contactKind(poi: Poi): ContactKind {
  return classifyContact({
    name: poi.name,
    solid: poi.solid,
    body: poi.lod?.kind,
    // a star's halo is the same torus; the classifier asks this of planets only
    ringed: (poi.lod?.scaleTargets ?? []).some((target) => (target as THREE.Mesh).geometry === RING),
  });
}

/** The home system's POIs carry `home:` ids; everything else is out-system. */
export const isHomeContact = (id: string): boolean => id.startsWith('home:');

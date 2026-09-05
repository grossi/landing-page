import * as THREE from 'three';

// ---- shared GPU assets ----
// Created once at module scope and reused by every consumer (sector content,
// DEEP FIELD bodies, upcoming LOD rungs) for the lifetime of the app;
// intentionally never disposed (three.js re-uploads a disposed resource on
// next use, so even a full renderer teardown/remount is safe).

/** Fresh white wireframe material at the given opacity; caller owns it. */
export const wireMat = (opacity: number) =>
  new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity });

// unit icospheres — scale per mesh to size bodies
export const ICO_LOW = new THREE.IcosahedronGeometry(1, 0);
export const ICO_MID = new THREE.IcosahedronGeometry(1, 1);
export const ICO_HIGH = new THREE.IcosahedronGeometry(1, 2);

// other unit primitives — scale per mesh
export const RING = new THREE.TorusGeometry(1.9, 0.1, 4, 42);
/** Thin planetary ring in planet-radius units (DEEP FIELD's proportions). */
export const RING_THIN = new THREE.TorusGeometry(1.7, 0.015, 3, 56);
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
export const BEAM = new THREE.ConeGeometry(1, 1, 6, 1, true);
export const DODEC = new THREE.DodecahedronGeometry(1, 0);
export const OCT = new THREE.OctahedronGeometry(1, 0);

// shared wireframe materials at the house opacities
export const MAT_BRIGHT = wireMat(0.9);
export const MAT_BODY = wireMat(0.85);
export const MAT_DIM = wireMat(0.6);
export const MAT_RING = wireMat(0.5);
export const MAT_BEAM = wireMat(0.16);
export const ORBIT_MAT = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 });
export const TRAIL_MAT = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
export const BELT_MAT = new THREE.PointsMaterial({ color: 0xffffff, size: 8, transparent: true, opacity: 0.55 });

// unit circle for orbit lines, scaled per orbit
export const UNIT_CIRCLE = (() => {
  const pts: THREE.Vector3[] = [];
  for (let a = 0; a <= 96; a++) {
    const angle = (a / 96) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
})();

// soft round sprite for nebula/dust points
export const softSprite: THREE.Texture = (() => {
  if (typeof document === 'undefined') {
    // DOM-less test environments (node): single white texel stands in for the
    // radial gradient so importing this module never touches the DOM.
    const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'); // null in canvas-less test environments
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
})();

export const NEBULA_MAT = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 40,
  map: softSprite,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
});

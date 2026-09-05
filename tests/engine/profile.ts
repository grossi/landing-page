// Run with: npx vite-node tests/engine/profile.ts
import { GeometryJobQueue } from 'engine/lod/geometry';
import { KIND_PRESETS, makeDisplacementField } from 'engine/lod/displacement';

const queue = new GeometryJobQueue();
const preset = KIND_PRESETS.planet;
const start = performance.now();
const promise = queue.enqueue({ key: 'profile', tables: 6,
  field: makeDisplacementField(1234, preset), radius: 960, amplitude: preset.amplitude, priority: 1 });
const enqueueMs = performance.now() - start;
const frames: number[] = [];
while (queue.pending) {
  const start = performance.now();
  queue.update(3);
  frames.push(performance.now() - start);
  // Let completed geometry promises run as they would between browser frames.
  await Promise.resolve();
}
const geometry = await promise;
const sorted = [...frames].sort((a, b) => a - b);
console.log(JSON.stringify({ enqueueMs, updates: frames.length,
  totalMs: frames.reduce((a, b) => a + b, 0), maxUpdateMs: sorted.at(-1),
  p95UpdateMs: sorted[Math.ceil(sorted.length * 0.95) - 1], vertices: geometry?.getAttribute('position').count }, null, 2));
geometry?.dispose();

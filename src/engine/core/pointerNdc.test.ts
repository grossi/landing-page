import { describe, expect, it } from 'vitest';
import { pointerToNdc } from 'engine/core/pointerNdc';

/** Element stub: pointerToNdc only ever reads getBoundingClientRect. */
const el = (left: number, top: number, width: number, height: number) =>
  ({ getBoundingClientRect: () => ({ left, top, width, height }) }) as unknown as Element;

describe('pointerToNdc', () => {
  it('maps a known rect to exact GL NDC values', () => {
    const out = { x: 0, y: 0 };
    const target = el(100, 50, 200, 100);
    pointerToNdc(out, 100, 50, target); // top-left corner
    expect(out.x).toBe(-1);
    expect(out.y).toBe(1);
    pointerToNdc(out, 300, 150, target); // bottom-right corner
    expect(out.x).toBe(1);
    expect(out.y).toBe(-1);
    pointerToNdc(out, 200, 100, target); // center
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    pointerToNdc(out, 250, 75, target); // right of center, above center
    expect(out.x).toBe(0.5);
    expect(out.y).toBe(0.5);
  });

  it('is GL y-up: a point BELOW center maps to negative y', () => {
    const out = { x: 0, y: 0 };
    pointerToNdc(out, 200, 125, el(100, 50, 200, 100));
    expect(out.y).toBe(-0.5);
  });

  it('is unclamped past the element (window-level listeners keep reporting)', () => {
    const out = { x: 0, y: 0 };
    pointerToNdc(out, 500, 250, el(100, 50, 200, 100));
    expect(out.x).toBe(3);
    expect(out.y).toBe(-3);
  });

  it('mutates the stable out object rather than allocating', () => {
    const out = { x: 0, y: 0 };
    const target = el(0, 0, 100, 100);
    pointerToNdc(out, 25, 25, target);
    const same = out;
    pointerToNdc(out, 75, 75, target);
    expect(out).toBe(same);
    expect(out.x).toBe(0.5);
    expect(out.y).toBe(-0.5);
  });
});

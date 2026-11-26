import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * How much the hero has given up to fit the viewport without scrolling:
 * 0 full · 1 tighter spacing · 2 bar without taglines · 3 no bar ·
 * 4 minimal hero (one-line name, no kicker, no social row).
 */
export type Density = 0 | 1 | 2 | 3 | 4;
export const MAX_DENSITY: Density = 4;

/** Breathing room (px) the hero keeps above and below itself. */
const MARGIN = 16;

/**
 * Picks the roomiest density at which `content` fits inside `slot`.
 *
 * The page is a single non-scrolling viewport, so anything that does not
 * fit is clipped. Text wraps differently at every width, which makes fixed
 * height breakpoints unreliable; instead this measures: each time `frame`
 * (whose size does not depend on the density) resizes, start again from the
 * full layout and step down until the content fits. The stepping runs in
 * layout effects, so intermediate densities are never painted.
 */
export function useFitDensity(
  frame: RefObject<HTMLElement | null>,
  slot: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
): Density {
  const [density, setDensity] = useState<Density>(0);
  // Bumped on every frame resize so the measuring effect re-runs even when
  // the reset leaves the density where it already was.
  const [resizes, setResizes] = useState(0);
  const frameSize = useRef('');

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const size = `${el.clientWidth}x${el.clientHeight}`;
      if (size === frameSize.current) return;
      frameSize.current = size;
      setDensity(0);
      setResizes((n) => n + 1);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame]);

  useLayoutEffect(() => {
    if (!slot.current || !content.current || density >= MAX_DENSITY) return;
    if (content.current.offsetHeight + 2 * MARGIN > slot.current.clientHeight) {
      setDensity((density + 1) as Density);
    }
  }, [slot, content, density, resizes]);

  return density;
}

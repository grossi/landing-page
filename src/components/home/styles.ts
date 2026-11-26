import { monoFont } from 'config/site';

/** The terminal language's greys, as used across the site. */
export const grey = {
  text: '#a1a1aa',
  dim: '#71717a',
  border: '#3f3f46',
  rule: 'rgba(255,255,255,.15)',
} as const;

export const mono = {
  fontFamily: monoFont,
  color: 'white',
} as const;

/** Small tracked caps: section labels, keys, link text. */
export const label = {
  fontFamily: monoFont,
  fontSize: '11px',
  letterSpacing: '.22em',
  textTransform: 'uppercase',
} as const;

export const focusRing = {
  outline: '1px solid white',
  outlineOffset: '3px',
} as const;

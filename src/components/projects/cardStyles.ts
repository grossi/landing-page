// The card look shared by project and demo cards.

export const grey = {
  border: '#3f3f46',
  /** Secondary text: 8.2:1 on the black card, so it passes AA at any size. */
  text: '#a1a1aa',
  /**
   * 4.35:1 on black, under the 4.5:1 that AA asks of small text. Kept for the
   * demo cards' controls line, which had it before, and for borders. Don't use
   * it for new text.
   */
  dim: '#71717a',
} as const;

export const cardFrame = {
  direction: 'column',
  height: '100%',
  p: 5,
  borderWidth: '1px',
  borderColor: grey.border,
  bg: 'black',
} as const;

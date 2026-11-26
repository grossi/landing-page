// The card look shared by project and demo cards.

export const grey = {
  border: '#3f3f46',
  text: '#a1a1aa',
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

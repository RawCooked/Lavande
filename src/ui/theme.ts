/**
 * Lavende palette + glyphs. Every component reads from here so the entire UI
 * can be re-themed by editing this one file.
 */
export const theme = {
  // Lavender family
  primary: '#B39DDB',
  accent: '#D1C4E9',
  deep: '#7E57C2',
  glow: '#9575CD',

  // Neutrals
  text: '#EDE7F6',
  muted: '#9E9AB8',
  dim: '#6E6A8B',

  // Status
  success: '#A5D6A7',
  warn: '#FFCC80',
  danger: '#EF9A9A',

  // Surface
  border: '#9575CD',
  borderDim: '#5E548E',
} as const;

export const gradients = {
  /** Main brand gradient: deep → primary → accent. */
  brand: [theme.deep, theme.primary, theme.accent],
  /** Soft fade used for the tagline. */
  soft: [theme.muted, theme.accent],
} as const;

export const glyphs = {
  prompt: '❯',
  bullet: '•',
  arrow: '→',
  check: '✓',
  cross: '✗',
  spark: '✦',
  wave: '∿',
  divider: '─',
} as const;

export type Theme = typeof theme;

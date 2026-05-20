/**
 * Curated swatch palette for the division color picker (Step 3).
 *
 * Hex values are derived from the original OKLCH tokens in
 * src/styles/tokens.css. Layout.tsx emits these as `--d-${code}` CSS
 * variables at runtime so every existing `var(--d-…)` reference keeps
 * working with the new wizard-driven colors.
 *
 * Restricted to a curated set so a tenant can't pick a color that's
 * unreadable on the dark background.
 */
export interface PaletteSwatch {
  label: string;
  hex: string;
  /** Source token name in tokens.css (for reference). */
  sourceToken?: string;
}

export const DIVISION_PALETTE: PaletteSwatch[] = [
  { label: 'Sky',     hex: '#3FB6E8', sourceToken: '--d-hvac_service' },
  { label: 'Violet',  hex: '#8E72E0', sourceToken: '--d-hvac_sales' },
  { label: 'Amber',   hex: '#E89858', sourceToken: '--d-hvac_maintenance' },
  { label: 'Teal',    hex: '#2FBDB4', sourceToken: '--d-plumbing' },
  { label: 'Purple',  hex: '#A66BD8', sourceToken: '--d-commercial' },
  { label: 'Lime',    hex: '#C3C040', sourceToken: '--d-electrical' },
  { label: 'Emerald', hex: '#3FC282', sourceToken: '--d-etx' },
  { label: 'Rose',    hex: '#E26A8E' },
  { label: 'Indigo',  hex: '#6C7AE0' },
  { label: 'Coral',   hex: '#E87760' },
  { label: 'Mint',    hex: '#65D8B7' },
  { label: 'Slate',   hex: '#7B8AA0' },
];

export function paletteContains(hex: string): boolean {
  return DIVISION_PALETTE.some((s) => s.hex.toLowerCase() === hex.toLowerCase());
}

/** Common Lucide icon names suitable for divisions. */
export const DIVISION_ICONS = [
  'wrench',
  'flame',
  'snowflake',
  'droplet',
  'zap',
  'building-2',
  'home',
  'truck',
  'hammer',
  'fan',
  'shield',
  'leaf',
] as const;

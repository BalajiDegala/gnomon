/**
 * Gnomon soft-UI palettes. Each theme is one neutral base colour; depth comes
 * from paired shadows (neumorphism.io rule: dark shadow = base darkened ~15%,
 * light shadow = base lightened ~15%). Colour is used only as small hints.
 */
export const themeNames = ['light', 'slate', 'dark'] as const;
export type ThemeName = (typeof themeNames)[number];
export const DEFAULT_THEME: ThemeName = 'slate';

export const themeLabels: Record<ThemeName, string> = {
  light: 'Light',
  slate: 'Slate',
  dark: 'Studio dark',
};

export interface GnomonPalette {
  mode: 'light' | 'dark';
  base: string;
  fg: string;
  muted: string;
  faint: string;
  line: string;
  /** Hairline outline for cards, fields and panels. */
  border: string;
  hi: string;
  lo: string;
  convexTop: string;
  convexBottom: string;
  accent: string;
  accentText: string;
  accentFg: string;
  danger: string;
  pr: string;
  pt: string;
  ab: string;
  lv: string;
  pn: string;
  off: string;
  nr: string;
}

export const palettes: Record<ThemeName, GnomonPalette> = {
  light: {
    mode: 'light',
    base: '#e0e0e0',
    fg: '#121212',
    muted: '#3a3a3a',
    faint: '#555555',
    line: 'rgba(0,0,0,0.17)',
    border: 'rgba(0,0,0,0.16)',
    hi: '#ffffff',
    lo: '#b5b5b5',
    convexTop: '#eeeeee',
    convexBottom: '#d2d2d2',
    accent: '#377d82',
    accentText: '#1d4d50',
    accentFg: '#ffffff',
    danger: '#7c353d',
    pr: '#25543d',
    pt: '#60471e',
    ab: '#7c353d',
    lv: '#344e68',
    pn: '#4a457e',
    off: '#504473',
    nr: '#515151',
  },
  slate: {
    mode: 'dark',
    base: '#34373c',
    fg: '#ffffff',
    muted: '#d9dadd',
    faint: '#aeb0b5',
    line: 'rgba(255,255,255,0.16)',
    border: 'rgba(255,255,255,0.15)',
    hi: '#464a50',
    lo: '#1e1f22',
    convexTop: '#3c4046',
    convexBottom: '#2b2d31',
    accent: '#6fbcc1',
    accentText: '#93d1d5',
    accentFg: '#13282a',
    danger: '#ebb2b7',
    pr: '#8ccdac',
    pt: '#dcbb85',
    ab: '#ebb2b7',
    lv: '#a6c2e6',
    pn: '#bebbeb',
    off: '#c8b8f1',
    nr: '#afb9c3',
  },
  dark: {
    mode: 'dark',
    base: '#26272a',
    fg: '#f7f7f7',
    muted: '#c4c5c8',
    faint: '#9b9da2',
    line: 'rgba(255,255,255,0.14)',
    border: 'rgba(255,255,255,0.13)',
    hi: '#383a3e',
    lo: '#0f0f11',
    convexTop: '#2e3033',
    convexBottom: '#1c1d1f',
    accent: '#66c2c7',
    accentText: '#7fd0d4',
    accentFg: '#0d2224',
    danger: '#e7969d',
    pr: '#6fc79c',
    pt: '#d8b06f',
    ab: '#e7969d',
    lv: '#8db2e2',
    pn: '#aaa5ea',
    off: '#b9a8f5',
    nr: '#9ca6b0',
  },
};

/** CSS custom properties for one palette; components read these as var(--g-*). */
export function paletteVariables(palette: GnomonPalette): Record<string, string> {
  const soft = (color: string, percent = 16) =>
    `color-mix(in srgb, ${color} ${percent}%, transparent)`;
  return {
    '--g-base': palette.base,
    '--g-fg': palette.fg,
    '--g-muted': palette.muted,
    '--g-faint': palette.faint,
    '--g-line': palette.line,
    '--g-border': palette.border,
    '--g-hi': palette.hi,
    '--g-lo': palette.lo,
    '--g-convex-top': palette.convexTop,
    '--g-convex-bottom': palette.convexBottom,
    '--g-accent': palette.accent,
    '--g-accent-text': palette.accentText,
    '--g-accent-fg': palette.accentFg,
    '--g-accent-soft': soft(palette.accent),
    '--g-danger': palette.danger,
    '--g-pr': palette.pr,
    '--g-pt': palette.pt,
    '--g-ab': palette.ab,
    '--g-lv': palette.lv,
    '--g-pn': palette.pn,
    '--g-off': palette.off,
    '--g-nr': palette.nr,
    // Light tints keep status text above 5:1 on top of them.
    '--g-pr-soft': soft(palette.pr, 11),
    '--g-pt-soft': soft(palette.pt, 11),
    '--g-ab-soft': soft(palette.ab, 11),
    '--g-lv-soft': soft(palette.lv, 11),
    '--g-pn-soft': soft(palette.pn, 11),
    '--g-off-soft': soft(palette.off, 12),
    '--g-nr-soft': soft(palette.nr, 12),
    '--g-raised': `9px 9px 18px ${palette.lo}, -9px -9px 18px ${palette.hi}`,
    '--g-raised-sm': `4px 4px 8px ${palette.lo}, -4px -4px 8px ${palette.hi}`,
    '--g-inset': `inset 6px 6px 12px ${palette.lo}, inset -6px -6px 12px ${palette.hi}`,
    '--g-inset-sm': `inset 3px 3px 6px ${palette.lo}, inset -3px -3px 6px ${palette.hi}`,
    // Futura where installed (every Mac); Jost, an open Futura revival bundled with the app, elsewhere.
    '--g-font':
      '"Futura PT", "Futura", "Jost Variable", "Jost", "Century Gothic", ui-sans-serif, system-ui, sans-serif',
    '--g-mono':
      '"Geist Mono Variable", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  };
}

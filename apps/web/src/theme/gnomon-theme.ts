import { createTheme, type Theme } from '@mui/material';

import { paletteVariables, type GnomonPalette } from './palettes';

const FONT = 'var(--g-font)';

/**
 * Builds the MUI theme for one palette. MUI needs real colour values for its
 * own calculations; components styled by hand read the matching var(--g-*).
 */
export function createGnomonTheme(palette: GnomonPalette): Theme {
  const vars = paletteVariables(palette);
  return createTheme({
    palette: {
      mode: palette.mode,
      // Text-strength teal: MUI uses primary.main for links, text buttons and labels.
      primary: {
        main: palette.accentText,
        light: palette.accentText,
        dark: palette.accentText,
        contrastText: palette.accentFg,
      },
      secondary: { main: palette.pn },
      success: { main: palette.pr },
      warning: { main: palette.pt },
      error: { main: palette.danger },
      info: { main: palette.lv },
      background: { default: palette.base, paper: palette.base },
      text: { primary: palette.fg, secondary: palette.muted, disabled: palette.faint },
      divider: palette.line,
    },
    typography: {
      fontFamily: FONT,
      // Futura/Jost strokes are thin; a touch more weight keeps small text legible.
      fontWeightRegular: 450,
      body1: { fontWeight: 450 },
      body2: { fontWeight: 450 },
      h4: { fontWeight: 600, letterSpacing: '-0.02em' },
      h5: { fontWeight: 600, letterSpacing: '-0.015em' },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
    },
    shape: { borderRadius: 14 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { ...vars, colorScheme: palette.mode },
          html: { backgroundColor: palette.base },
          body: {
            minWidth: 320,
            backgroundColor: palette.base,
            color: palette.fg,
            fontFamily: FONT,
            WebkitFontSmoothing: 'antialiased',
          },
          '*': { boxSizing: 'border-box' },
          '::selection': { backgroundColor: `${palette.accent}55`, color: palette.fg },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: palette.lo,
            border: '3px solid transparent',
            borderRadius: 20,
            backgroundClip: 'padding-box',
          },
          'code, kbd, samp': { fontFamily: 'var(--g-mono)' },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none', backgroundColor: palette.base, color: palette.fg },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${palette.border}`,
            borderRadius: 20,
            boxShadow: 'var(--g-raised)',
            backgroundColor: palette.base,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: palette.base,
            color: palette.fg,
            borderBottom: `1px solid ${palette.line}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: palette.base, borderRight: `1px solid ${palette.line}` },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        variants: [
          {
            // Primary actions stay soft surfaces; a small accent dot marks them.
            props: { variant: 'contained', color: 'primary' },
            style: {
              color: palette.accentText,
              '&::before': {
                content: '""',
                width: 7,
                height: 7,
                flex: '0 0 auto',
                borderRadius: '50%',
                marginRight: 8,
                backgroundColor: palette.accent,
              },
              '&:has(.MuiButton-startIcon)::before, &:has(.MuiButton-endIcon)::before': {
                display: 'none',
              },
              '& .MuiButton-startIcon': { color: palette.accent },
            },
          },
          { props: { variant: 'contained', color: 'error' }, style: { color: palette.danger } },
        ],
        styleOverrides: {
          root: {
            minHeight: 38,
            borderRadius: 12,
            transition: 'box-shadow 150ms ease, color 150ms ease',
          },
          contained: {
            backgroundColor: palette.base,
            color: palette.fg,
            boxShadow: 'var(--g-raised-sm)',
            border: `1px solid ${palette.border}`,
            '&:hover': { backgroundColor: palette.base, boxShadow: 'var(--g-raised-sm)' },
            '&:active': { boxShadow: 'var(--g-inset-sm)' },
            '&.Mui-disabled': {
              backgroundColor: palette.base,
              color: palette.faint,
              boxShadow: 'none',
            },
          },
          outlined: {
            borderColor: palette.border,
            backgroundColor: palette.base,
            boxShadow: 'var(--g-raised-sm)',
            '&:hover': { borderColor: palette.faint, backgroundColor: palette.base },
            '&:active': { boxShadow: 'var(--g-inset-sm)' },
          },
          text: { '&:hover': { backgroundColor: 'var(--g-accent-soft)' } },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: { '&:hover': { backgroundColor: 'var(--g-accent-soft)' } },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            border: 0,
            color: palette.muted,
            backgroundColor: palette.base,
            '&.Mui-selected, &.Mui-selected:hover': {
              color: palette.fg,
              backgroundColor: palette.base,
              boxShadow: 'var(--g-inset-sm)',
            },
          },
        },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: {
            boxShadow: 'var(--g-raised-sm)',
            borderRadius: 12,
            backgroundColor: palette.base,
            border: `1px solid ${palette.border}`,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: palette.base,
            // A tight inset keeps the pressed-in look without a smudge under the floating label.
            boxShadow: `inset 0 1px 2px ${palette.lo}`,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.border },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: palette.faint },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.accent,
              borderWidth: 1,
            },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: palette.danger },
            '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: palette.border },
            // Locked fields (e.g. today's shift) must stay readable, not faded out.
            '&.Mui-disabled': { color: palette.muted },
            '& .MuiInputBase-input.Mui-disabled': {
              color: palette.muted,
              WebkitTextFillColor: palette.muted,
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: palette.muted,
            '&.Mui-focused': { color: palette.accentText },
            '&.Mui-disabled': { color: palette.muted },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 9,
            fontWeight: 600,
            backgroundColor: palette.base,
            color: palette.fg,
          },
          outlined: { borderColor: palette.line },
          // No soft halo: a blurred shadow behind small chip text makes it look out of focus.
          filled: { boxShadow: 'none', border: `1px solid ${palette.border}` },
        },
        // Coloured chips stay soft surfaces: the colour goes on the text, which
        // is tuned for contrast, never as a fill under dark text.
        variants: (
          [
            ['primary', palette.accentText],
            ['secondary', palette.pn],
            ['success', palette.pr],
            ['warning', palette.pt],
            ['error', palette.danger],
            ['info', palette.lv],
          ] as const
        ).map(([color, text]) => ({
          props: { color },
          style: {
            color: text,
            backgroundColor: palette.base,
            borderColor: text,
            '& .MuiChip-icon': { color: text },
          },
        })),
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            boxShadow: 'var(--g-raised)',
            borderRadius: 14,
            border: `1px solid ${palette.border}`,
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            boxShadow: 'var(--g-raised)',
            borderRadius: 14,
            border: `1px solid ${palette.border}`,
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: 'var(--g-accent-soft)' },
            '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: 'var(--g-accent-soft)' },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          // Crisp elevation instead of the soft neumorphic halo, which read as a blur
          // around forms once the backdrop dimmed the page.
          paper: {
            borderRadius: 16,
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08), 0 16px 40px -12px rgba(15, 23, 42, 0.28)',
            border: `1px solid ${palette.border}`,
            backgroundImage: 'none',
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            '&:not(.MuiBackdrop-invisible)': { backgroundColor: 'rgba(15, 23, 42, 0.32)' },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 8,
            fontSize: 11.5,
            fontWeight: 500,
            backgroundColor: palette.fg,
            color: palette.base,
          },
          arrow: { color: palette.fg },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            boxShadow: 'var(--g-inset-sm)',
            backgroundColor: palette.base,
            border: `1px solid ${palette.border}`,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: palette.line },
          head: {
            backgroundColor: palette.base,
            color: palette.muted,
            borderBottom: `1px solid ${palette.border}`,
          },
        },
      },
      MuiTablePagination: {
        styleOverrides: { root: { color: palette.muted } },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: palette.accent, height: 3, borderRadius: 3 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            color: palette.muted,
            '&.Mui-selected': { color: palette.fg },
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: {
            height: 10,
            borderRadius: 8,
            backgroundColor: palette.base,
            boxShadow: 'var(--g-inset-sm)',
          },
          bar: { borderRadius: 8, backgroundColor: palette.accent },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          track: { backgroundColor: palette.lo, opacity: 1 },
          thumb: { boxShadow: 'var(--g-raised-sm)' },
        },
      },
      MuiDivider: { styleOverrides: { root: { borderColor: palette.line } } },
      MuiSkeleton: { styleOverrides: { root: { backgroundColor: palette.line } } },
    },
  });
}

import { Box, ButtonBase, Tooltip } from '@mui/material';
import { Contrast, Moon, Sun } from 'lucide-react';

import { themeLabels, themeNames, type ThemeName } from '../theme/palettes';
import { useThemeMode } from '../theme/ThemeModeProvider';

const icons: Record<ThemeName, typeof Sun> = { light: Sun, slate: Contrast, dark: Moon };

/** Light / Slate / Studio dark switch: a pressed-in track with the active theme raised. */
export function ThemeSwitcher() {
  const { themeName, setThemeName } = useThemeMode();
  return (
    <Box
      role="radiogroup"
      aria-label="Theme"
      sx={{
        display: 'inline-flex',
        gap: 0.5,
        p: 0.5,
        borderRadius: '13px',
        bgcolor: 'var(--g-base)',
        boxShadow: 'var(--g-inset-sm)',
        border: '1px solid var(--g-border)',
      }}
    >
      {themeNames.map((name) => {
        const Icon = icons[name];
        const selected = name === themeName;
        return (
          <Tooltip key={name} title={themeLabels[name]}>
            <ButtonBase
              role="radio"
              aria-checked={selected}
              aria-label={themeLabels[name]}
              onClick={() => setThemeName(name)}
              sx={{
                width: 32,
                height: 30,
                borderRadius: '10px',
                color: selected ? 'var(--g-accent)' : 'var(--g-muted)',
                bgcolor: 'var(--g-base)',
                boxShadow: selected ? 'var(--g-raised-sm)' : 'none',
                transition: 'box-shadow 150ms ease, color 150ms ease',
                '&:hover': { color: 'var(--g-fg)' },
                '&.Mui-focusVisible': { outline: '2px solid var(--g-accent)', outlineOffset: 2 },
              }}
            >
              <Icon size={15} />
            </ButtonBase>
          </Tooltip>
        );
      })}
    </Box>
  );
}

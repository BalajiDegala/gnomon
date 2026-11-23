import { CssBaseline, ThemeProvider } from '@mui/material';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { createGnomonTheme } from './gnomon-theme';
import { DEFAULT_THEME, palettes, themeNames, type ThemeName } from './palettes';

const STORAGE_KEY = 'gnomon:theme';

interface ThemeModeContextValue {
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function readStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return themeNames.includes(stored as ThemeName) ? (stored as ThemeName) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Provides the selected Gnomon theme (Slate unless the user chose another). */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>(readStoredTheme);
  const theme = useMemo(() => createGnomonTheme(palettes[themeName]), [themeName]);

  useEffect(() => {
    document.documentElement.dataset.gnomonTheme = themeName;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', palettes[themeName].base);
    try {
      localStorage.setItem(STORAGE_KEY, themeName);
    } catch {
      // The choice is a convenience; ignore blocked storage.
    }
  }, [themeName]);

  const value = useMemo(() => ({ themeName, setThemeName }), [themeName]);
  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode(): ThemeModeContextValue {
  const context = useContext(ThemeModeContext);
  if (!context) throw new Error('useThemeMode must be used inside ThemeModeProvider');
  return context;
}

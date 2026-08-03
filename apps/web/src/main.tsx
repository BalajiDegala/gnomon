import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { AuthProvider } from './lib/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1294a1', dark: '#086b77', light: '#e5f7f8' },
    secondary: { main: '#5d63d8', dark: '#4248b2', light: '#eef0ff' },
    success: { main: '#249e6b' },
    warning: { main: '#d9872f' },
    error: { main: '#d4515a' },
    background: { default: '#f3f6f8', paper: '#ffffff' },
    divider: '#dfe6eb',
    text: { primary: '#142033', secondary: '#647287' },
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    h4: { fontWeight: 820, letterSpacing: '-0.035em' },
    h5: { fontWeight: 800, letterSpacing: '-0.025em' },
    button: { textTransform: 'none', fontWeight: 750, letterSpacing: '-0.01em' },
  },
  shape: { borderRadius: 14 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { backgroundColor: '#f3f6f8' },
        body: {
          minWidth: 320,
          backgroundColor: '#f3f6f8',
          backgroundImage:
            'radial-gradient(circle at 76% -10%, rgba(18,148,161,.07), transparent 30%), radial-gradient(circle at 104% 62%, rgba(93,99,216,.045), transparent 28%)',
          backgroundAttachment: 'fixed',
        },
        '*': { boxSizing: 'border-box' },
        '::selection': { backgroundColor: '#bcebed', color: '#10202a' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: '#c9d3dc',
          border: '3px solid transparent',
          borderRadius: 20,
          backgroundClip: 'padding-box',
        },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(216,225,232,.95)',
          borderRadius: 16,
          boxShadow: '0 8px 28px rgba(20,32,51,.055)',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 38,
          borderRadius: 10,
          transition: 'transform 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
          '&.MuiButton-containedPrimary': {
            boxShadow: '0 7px 18px rgba(18,148,161,.2)',
            '&:hover': {
              boxShadow: '0 10px 24px rgba(18,148,161,.27)',
              transform: 'translateY(-1px)',
            },
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 11,
          backgroundColor: 'rgba(255,255,255,.92)',
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#aebdc9' },
          '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(18,148,161,.1)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8, fontWeight: 700 } },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderColor: '#e7ecf0' } },
    },
    MuiTooltip: {
      styleOverrides: { tooltip: { borderRadius: 8, fontSize: 11, fontWeight: 650 } },
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);

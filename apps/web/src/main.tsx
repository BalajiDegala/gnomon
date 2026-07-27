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
    primary: { main: '#1ab1c0', dark: '#087b88', light: '#e6f8fa' },
    success: { main: '#249e6b' },
    error: { main: '#d9545b' },
    background: { default: '#f5f7fa', paper: '#ffffff' },
    divider: '#e5e9ef',
    text: { primary: '#172033', secondary: '#687588' },
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    button: { textTransform: 'none', fontWeight: 750, letterSpacing: '-0.01em' },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { minWidth: 320 },
        '*': { boxSizing: 'border-box' },
        '::selection': { backgroundColor: '#bcecf0', color: '#10202a' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid #e5e9ef',
          boxShadow: '0 6px 24px rgba(23,32,51,.055)',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 11, backgroundColor: '#fff' },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 8 } },
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

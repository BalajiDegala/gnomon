import '@fontsource-variable/jost';
import '@fontsource-variable/geist-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { AuthProvider } from './lib/auth';
import { DeveloperModeProvider } from './lib/developer-mode';
import { ThemeModeProvider } from './theme/ThemeModeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <ThemeModeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DeveloperModeProvider>
            <App />
          </DeveloperModeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeModeProvider>
  </StrictMode>,
);

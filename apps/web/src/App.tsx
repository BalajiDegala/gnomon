import { Box, CircularProgress } from '@mui/material';

import { AppShell } from './components/AppShell';
import { useAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';

export function App() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress aria-label="Loading session" />
      </Box>
    );
  }

  return user ? <AppShell /> : <LoginPage />;
}

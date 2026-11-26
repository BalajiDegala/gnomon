import { Box, Chip, Fade, Stack, Typography } from '@mui/material';
import { AlertTriangle, Terminal } from 'lucide-react';

import { useDeveloperMode } from '../lib/developer-mode';

export function DeveloperModeIndicator() {
  // Hidden - magic happens silently
  return null;

  // Original code kept for reference:
  /* eslint-disable */
  const { isActive, timeUntilChaos, chaosTriggered, deactivate } = useDeveloperMode();

  if (!isActive) return null;

  return (
    <Fade in={isActive}>
      <Box
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 1,
        }}
      >
        <Chip
          icon={<Terminal size={14} />}
          label="Developer Mode"
          color="warning"
          size="small"
          onDelete={deactivate}
          sx={{
            fontWeight: 600,
            '& .MuiChip-icon': { color: 'inherit' },
          }}
        />

        {!chaosTriggered && (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              px: 1.5,
              py: 0.75,
              bgcolor: 'rgba(0, 0, 0, 0.85)',
              borderRadius: '8px',
              color: '#fff',
            }}
          >
            <AlertTriangle size={14} color="#f59e0b" />
            <Typography sx={{ fontSize: 12, fontWeight: 500 }}>
              Gravity in {timeUntilChaos}s...
            </Typography>
          </Stack>
        )}

        {chaosTriggered && (
          <Box
            sx={{
              px: 1.5,
              py: 0.75,
              bgcolor: '#ef4444',
              borderRadius: '8px',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              animation: 'pulse 0.5s ease-in-out infinite alternate',
              '@keyframes pulse': {
                from: { opacity: 1 },
                to: { opacity: 0.7 },
              },
            }}
          >
            GRAVITY ENABLED
          </Box>
        )}
      </Box>
    </Fade>
  );
}

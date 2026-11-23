import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { Eyebrow } from '../soft';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}

/** Page title block in the soft-UI style: eyebrow, title, meta, and actions on the right. */
export function PageHeader({ eyebrow, title, meta, action }: PageHeaderProps) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      sx={{
        justifyContent: 'space-between',
        alignItems: { sm: 'flex-end' },
        gap: 2.5,
        pb: 0.5,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Typography
          component="h1"
          sx={{
            mt: 0.5,
            fontSize: { xs: 28, sm: 34 },
            lineHeight: 1.1,
            fontWeight: 600,
            letterSpacing: '-0.03em',
          }}
        >
          {title}
        </Typography>
        {meta && (
          <Typography sx={{ mt: 0.75, color: 'var(--g-muted)', fontSize: 13 }}>{meta}</Typography>
        )}
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Stack>
  );
}

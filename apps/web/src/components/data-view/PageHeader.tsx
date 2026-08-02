import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, meta, action }: PageHeaderProps) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-end' }, gap: 2 }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 0 }}>
          {eyebrow}
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontSize: 30, fontWeight: 850, letterSpacing: 0 }}>
          {title}
        </Typography>
        {meta && (
          <Typography sx={{ mt: 0.65, color: 'text.secondary', fontSize: 12.5 }}>{meta}</Typography>
        )}
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Stack>
  );
}

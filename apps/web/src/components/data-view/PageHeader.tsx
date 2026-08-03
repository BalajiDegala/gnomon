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
        <Typography
          component="span"
          sx={{
            display: 'inline-flex',
            px: 1,
            py: 0.4,
            borderRadius: 1.5,
            color: 'primary.dark',
            bgcolor: 'primary.light',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 0.8,
          }}
        >
          {eyebrow}
        </Typography>
        <Typography
          variant="h4"
          sx={{ mt: 0.8, fontSize: { xs: 28, sm: 32 }, fontWeight: 850, letterSpacing: '-0.035em' }}
        >
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

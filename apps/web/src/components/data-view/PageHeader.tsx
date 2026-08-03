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
      sx={{
        position: 'relative',
        isolation: 'isolate',
        minHeight: { xs: 154, sm: 166 },
        px: { xs: 2.5, sm: 3.5, lg: 4 },
        py: { xs: 2.75, sm: 3.25 },
        overflow: 'hidden',
        justifyContent: 'space-between',
        alignItems: { sm: 'center' },
        gap: 2.5,
        color: '#fff',
        border: '1px solid rgba(30,197,211,.12)',
        borderRadius: '24px',
        background:
          'radial-gradient(circle at 82% 0%, rgba(39,204,216,.2), transparent 28%), radial-gradient(circle at 96% 118%, rgba(96,105,222,.2), transparent 34%), linear-gradient(135deg, #0d1b2d 0%, #0c2434 62%, #10283b 100%)',
        boxShadow: '0 20px 55px rgba(13,27,45,.15)',
        '&::before': {
          content: '""',
          position: 'absolute',
          zIndex: -1,
          width: 260,
          height: 260,
          right: { xs: -170, sm: -90 },
          top: -170,
          border: '1px solid rgba(255,255,255,.07)',
          borderRadius: '50%',
          boxShadow: '0 0 0 36px rgba(255,255,255,.018), 0 0 0 72px rgba(255,255,255,.012)',
        },
        '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,.98)' },
        '& .MuiIconButton-root': {
          bgcolor: 'rgba(255,255,255,.1)',
          color: '#fff',
          borderColor: 'rgba(255,255,255,.18)',
          backdropFilter: 'blur(8px)',
          '&:hover': { bgcolor: 'rgba(255,255,255,.18)' },
        },
        '& .MuiButton-containedPrimary': {
          bgcolor: '#3acbd6',
          color: '#07171b',
          boxShadow: '0 10px 24px rgba(14,181,195,.2)',
          '&:hover': { bgcolor: '#57d6df' },
        },
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1, minWidth: 0 }}>
        <Typography
          component="span"
          sx={{
            display: 'inline-flex',
            px: 1.1,
            py: 0.45,
            borderRadius: 1.75,
            color: '#8ce7ec',
            bgcolor: 'rgba(48,202,214,.1)',
            border: '1px solid rgba(78,215,225,.15)',
            fontSize: 10,
            fontWeight: 850,
            letterSpacing: 1,
          }}
        >
          {eyebrow}
        </Typography>
        <Typography
          variant="h4"
          sx={{
            mt: 1,
            color: '#fff',
            fontSize: { xs: 30, sm: 36 },
            lineHeight: 1.08,
            fontWeight: 850,
            letterSpacing: '-0.045em',
          }}
        >
          {title}
        </Typography>
        {meta && (
          <Typography sx={{ mt: 0.8, color: 'rgba(226,239,244,.6)', fontSize: 12.5 }}>
            {meta}
          </Typography>
        )}
      </Box>
      {action && (
        <Box sx={{ position: 'relative', zIndex: 1, flexShrink: 0, alignSelf: { sm: 'center' } }}>
          {action}
        </Box>
      )}
    </Stack>
  );
}

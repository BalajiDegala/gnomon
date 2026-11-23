import type { DailyAttendanceStatus } from '@gnomon/shared';
import { Box, Typography, type BoxProps } from '@mui/material';
import type { ReactNode } from 'react';

/** Raised soft-UI surface in the base colour. */
export function SoftCard({ sx, children, ...props }: BoxProps) {
  return (
    <Box
      {...props}
      sx={[
        {
          bgcolor: 'var(--g-base)',
          borderRadius: '22px',
          border: '1px solid var(--g-border)',
          boxShadow: 'var(--g-raised)',
          p: { xs: 2, md: 2.75 },
          display: 'grid',
          gap: 2,
          alignContent: 'start',
          minWidth: 0,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}

/** Small tracked uppercase label above a card title. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="div"
      sx={{
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: 'var(--g-muted)',
      }}
    >
      {children}
    </Typography>
  );
}

export function CardHeading({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: string;
  title: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 1.5,
        flexWrap: 'wrap',
        // A hairline under every card heading separates it from the content.
        pb: 1.5,
        borderBottom: '1px solid var(--g-line)',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Typography sx={{ mt: 0.25, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>
          {title}
        </Typography>
      </Box>
      {aside && (
        <Typography component="div" sx={{ fontSize: 12.5, color: 'var(--g-muted)' }}>
          {aside}
        </Typography>
      )}
    </Box>
  );
}

/** Attendance status colour, used only as a small dot. */
export const statusDotColor: Record<DailyAttendanceStatus, string> = {
  present: 'var(--g-pr)',
  partial: 'var(--g-pt)',
  absent: 'var(--g-ab)',
  leave: 'var(--g-lv)',
  pending_regularisation: 'var(--g-pn)',
  holiday: 'var(--g-off)',
  weekend: 'var(--g-off)',
};

export function Dot({ color, size = 7 }: { color: string; size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{ width: size, height: size, borderRadius: '50%', bgcolor: color, flex: '0 0 auto' }}
    />
  );
}

/** Raised row: dot + code, label, value. */
export function SoftRow({
  dot,
  code,
  label,
  value,
  detail,
}: {
  dot: string;
  code?: string;
  label: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: code ? '52px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 1.25,
        px: 1.5,
        py: 1,
        borderRadius: '13px',
        bgcolor: 'var(--g-base)',
        border: '1px solid var(--g-border)',
        boxShadow: 'var(--g-raised-sm)',
      }}
    >
      {code && (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.9 }}>
          <Dot color={dot} />
          <Typography sx={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 0.8 }}>
            {code}
          </Typography>
        </Box>
      )}
      <Box sx={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
        {!code && <Dot color={dot} />}
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 13 }}>
            {label}
          </Typography>
          {detail && (
            <Typography noWrap sx={{ fontSize: 12, color: 'var(--g-muted)' }}>
              {detail}
            </Typography>
          )}
        </Box>
      </Box>
      {value !== undefined && (
        <Typography
          component="div"
          sx={{ fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </Typography>
      )}
    </Box>
  );
}

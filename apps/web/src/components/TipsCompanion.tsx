import { Box, Button, IconButton, keyframes, Paper, Stack, Typography } from '@mui/material';
import {
  CalendarDays,
  Clock3,
  Coffee,
  Droplets,
  Eye,
  HeartHandshake,
  ListChecks,
  Lock,
  PersonStanding,
  Save,
  Timer,
  UtensilsCrossed,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '../lib/auth';
import { pickTip, SHOW_TIP_EVENT, useTipsSettings, type Tip, type TipIcon } from '../lib/tips';

const icons: Record<TipIcon, LucideIcon> = {
  clock: Clock3,
  water: Droplets,
  coffee: Coffee,
  eye: Eye,
  stretch: PersonStanding,
  food: UtensilsCrossed,
  calendar: CalendarDays,
  timer: Timer,
  list: ListChecks,
  heart: HeartHandshake,
  lock: Lock,
  save: Save,
  breath: Wind,
};

const countdown = keyframes`
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
`;
const wave = keyframes`
  0%, 60%, 100% { transform: rotate(0deg); }
  10%, 30% { transform: rotate(14deg); }
  20%, 40% { transform: rotate(-8deg); }
`;

/** First tip of a session comes a few minutes after sign-in, not immediately. */
const FIRST_TIP_DELAY_MS = 3 * 60_000;
const CHECK_EVERY_MS = 60_000;
const RECENT_LIMIT = 6;

function readNumber(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function readList(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Tips still work for this session without storage.
  }
}

/**
 * "Tip from Relangi": a small companion in the bottom-right corner that shares a
 * wellbeing or work-habit tip every couple of hours. Timing is kept per person
 * in this browser, so reloading the page does not bring a tip back early.
 * Administrators switch it on/off and tune timing in Site preferences.
 */
export function TipsCompanion() {
  const { user } = useAuth();
  const { settings, isLoaded } = useTipsSettings();
  const [tip, setTip] = useState<Tip | null>(null);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const lastKey = `gnomon:tips:${user?.id ?? 'anonymous'}:last-shown`;
  const recentKey = `gnomon:tips:${user?.id ?? 'anonymous'}:recent`;

  const show = useCallback(() => {
    const recent = readList(recentKey);
    const next = pickTip(recent);
    write(lastKey, String(Date.now()));
    write(recentKey, JSON.stringify([next.id, ...recent].slice(0, RECENT_LIMIT)));
    setTip(next);
    setVisible(true);
  }, [lastKey, recentKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    // Unmount after the slide-out transition.
    hideTimer.current = window.setTimeout(() => setTip(null), 400);
  }, []);

  // Schedule: check once a minute; show when the interval has passed and the tab is in view.
  useEffect(() => {
    if (!isLoaded || !settings.enabled || !user) return;
    if (readNumber(lastKey) === null) {
      // Pretend the last tip was shown just under one interval ago.
      write(lastKey, String(Date.now() - settings.intervalMinutes * 60_000 + FIRST_TIP_DELAY_MS));
    }
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const last = readNumber(lastKey) ?? 0;
      if (Date.now() - last >= settings.intervalMinutes * 60_000) show();
    };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [isLoaded, lastKey, settings.enabled, settings.intervalMinutes, show, user]);

  // Preview from Site preferences.
  useEffect(() => {
    const handler = () => show();
    window.addEventListener(SHOW_TIP_EVENT, handler);
    return () => window.removeEventListener(SHOW_TIP_EVENT, handler);
  }, [show]);

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  if (!tip) return null;
  const Icon = icons[tip.icon];

  return (
    <Paper
      role="status"
      aria-live="polite"
      elevation={0}
      sx={{
        position: 'fixed',
        right: { xs: 12, sm: 24 },
        bottom: { xs: 12, sm: 24 },
        zIndex: (theme) => theme.zIndex.snackbar,
        width: { xs: 'calc(100vw - 24px)', sm: 340 },
        borderRadius: '18px',
        overflow: 'hidden',
        border: '1px solid var(--g-border)',
        bgcolor: 'var(--g-base)',
        boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 18px 40px -14px rgba(15,23,42,.35)',
        transform: visible ? 'translateY(0)' : 'translateY(calc(100% + 32px))',
        opacity: visible ? 1 : 0,
        transition: 'transform 420ms cubic-bezier(.2,.9,.3,1.15), opacity 300ms ease',
        willChange: 'transform, opacity',
        // Hovering pauses the countdown so the tip can be read at leisure.
        '&:hover .tip-countdown': { animationPlayState: 'paused' },
        '@media (prefers-reduced-motion: reduce)': { transition: 'opacity 200ms ease' },
      }}
    >
      <Stack direction="row" spacing={1.5} sx={{ p: 2, pr: 1, alignItems: 'flex-start' }}>
        <Box
          aria-hidden
          sx={{
            flex: '0 0 auto',
            width: 44,
            height: 44,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'var(--g-accent-soft)',
            color: 'var(--g-accent-text)',
            fontSize: 22,
          }}
        >
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              transformOrigin: '70% 70%',
              animation: visible ? `${wave} 2.4s ease-in-out 0.5s 1` : 'none',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            }}
          >
            👋
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: 'text.secondary' }}
          >
            TIP FROM RELANGI
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: 'center' }}>
            <Icon size={16} color="var(--g-accent-text)" />
            <Typography sx={{ fontSize: 14.5, fontWeight: 800 }}>{tip.title}</Typography>
          </Stack>
          <Typography sx={{ mt: 0.5, fontSize: 13, color: 'text.secondary', lineHeight: 1.45 }}>
            {tip.text}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
            <Button size="small" variant="contained" onClick={dismiss} sx={{ minHeight: 30 }}>
              Thanks, Relangi!
            </Button>
            <Button size="small" color="inherit" onClick={show} sx={{ minHeight: 30 }}>
              Another tip
            </Button>
          </Stack>
        </Box>
        <IconButton size="small" aria-label="Close tip" onClick={dismiss}>
          <X size={16} />
        </IconButton>
      </Stack>
      {/* Countdown bar; when it finishes the tip slides away (paused on hover). */}
      <Box
        key={tip.id}
        className="tip-countdown"
        onAnimationEnd={dismiss}
        sx={{
          height: 3,
          bgcolor: 'var(--g-accent)',
          transformOrigin: 'left center',
          willChange: 'transform',
          animation: visible ? `${countdown} ${settings.displaySeconds}s linear forwards` : 'none',
        }}
      />
    </Paper>
  );
}

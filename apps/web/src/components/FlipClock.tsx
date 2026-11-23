import { Box, keyframes } from '@mui/material';
import { Fragment, memo, useEffect, useRef, useState } from 'react';

const flipTop = keyframes`
  0% { transform: rotateX(0deg); }
  50%, 100% { transform: rotateX(-90deg); }
`;
const flipBottom = keyframes`
  0%, 50% { transform: rotateX(90deg); }
  100% { transform: rotateX(0deg); }
`;

export type FlipSize = 'md' | 'date' | 'xl';

const sizes: Record<FlipSize, { w: number; h: number; fs: number; gap: number; r: number }> = {
  md: { w: 44, h: 62, fs: 38, gap: 7, r: 11 },
  date: { w: 56, h: 80, fs: 50, gap: 8, r: 12 },
  xl: { w: 74, h: 104, fs: 66, gap: 12, r: 14 },
};

const FLIP_MS = 600;

/** One split-flap card in the base colour; the top flap falls, the new lower half swings down. */
const FlipUnit = memo(function FlipUnit({ digit, size }: { digit: string; size: FlipSize }) {
  const [shown, setShown] = useState(digit);
  const [previous, setPrevious] = useState(digit);
  const [flipping, setFlipping] = useState(false);
  const lastDigit = useRef(digit);

  useEffect(() => {
    if (digit === lastDigit.current) return;
    setPrevious(lastDigit.current);
    setShown(digit);
    lastDigit.current = digit;
    setFlipping(true);
    const timer = window.setTimeout(() => {
      setPrevious(digit);
      setFlipping(false);
    }, FLIP_MS);
    return () => window.clearTimeout(timer);
  }, [digit]);

  const { w, h, fs, r } = sizes[size];
  const half = {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '50%',
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  } as const;
  const top = {
    ...half,
    top: 0,
    borderRadius: `${r}px ${r}px 0 0`,
    background: 'linear-gradient(180deg, var(--g-convex-top), var(--g-base))',
  } as const;
  const bottom = {
    ...half,
    top: '50%',
    borderRadius: `0 0 ${r}px ${r}px`,
    background: 'linear-gradient(180deg, var(--g-base), var(--g-convex-bottom))',
  } as const;
  const glyph = (position: 'top' | 'bottom') =>
    ({
      position: 'absolute',
      left: 0,
      right: 0,
      height: '200%',
      top: position === 'top' ? 0 : '-100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 1,
    }) as const;
  const motion = '@media (prefers-reduced-motion: reduce)';

  return (
    <Box
      aria-hidden
      sx={{
        position: 'relative',
        width: w,
        minWidth: w,
        height: h,
        perspective: '1000px',
        borderRadius: `${r}px`,
        fontFamily: 'var(--g-mono)',
        fontSize: fs,
        fontWeight: 500,
        color: 'var(--g-fg)',
        fontVariantNumeric: 'tabular-nums',
        boxShadow: '5px 5px 10px var(--g-lo), -5px -5px 10px var(--g-hi)',
        // The split between the two halves.
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          height: 2,
          transform: 'translateY(-50%)',
          bgcolor: 'var(--g-base)',
          boxShadow: '0 -1px 0 color-mix(in srgb, var(--g-lo) 45%, transparent)',
          zIndex: 4,
        },
      }}
    >
      <Box sx={top}>
        <Box component="span" sx={glyph('top')}>
          {shown}
        </Box>
      </Box>
      <Box sx={bottom}>
        <Box component="span" sx={glyph('bottom')}>
          {previous}
        </Box>
      </Box>
      <Box
        sx={{
          ...top,
          zIndex: 3,
          transformOrigin: 'bottom',
          animation: flipping ? `${flipTop} ${FLIP_MS}ms ease-in forwards` : 'none',
          [motion]: { animation: 'none', display: flipping ? 'none' : 'block' },
        }}
      >
        <Box component="span" sx={glyph('top')}>
          {previous}
        </Box>
      </Box>
      <Box
        sx={{
          ...bottom,
          zIndex: 2,
          transformOrigin: 'top',
          transform: 'rotateX(90deg)',
          animation: flipping ? `${flipBottom} ${FLIP_MS}ms ease-out forwards` : 'none',
          [motion]: { animation: 'none' },
        }}
      >
        <Box component="span" sx={glyph('bottom')}>
          {shown}
        </Box>
      </Box>
    </Box>
  );
});

/**
 * Split-flap display for groups of digits, e.g. "032741" with groups [2,2,2]
 * renders 03:27:41. Pass `digits={null}` while loading to show dashes.
 */
export function FlipClock({
  digits,
  groups = [2, 2, 2],
  size = 'md',
  label,
}: {
  digits: string | null;
  groups?: readonly number[];
  size?: FlipSize;
  /** Read out instead of the individual cards, e.g. "Time worked 3 hours 27 minutes". */
  label: string;
}) {
  const total = groups.reduce((sum, count) => sum + count, 0);
  const characters = (digits ?? '').padStart(total, '-').slice(-total).split('');
  const { gap, fs } = sizes[size];
  let index = 0;
  return (
    <Box
      role="timer"
      aria-label={label}
      sx={{ display: 'flex', alignItems: 'center', gap: `${gap}px`, py: 0.5, px: 0.25 }}
    >
      {groups.map((count, groupIndex) => (
        <Fragment key={groupIndex}>
          {groupIndex > 0 && (
            <Box
              component="span"
              aria-hidden
              sx={{
                fontFamily: 'var(--g-mono)',
                fontSize: fs,
                lineHeight: 1,
                color: 'var(--g-faint)',
                transform: 'translateY(-6%)',
                px: '2px',
              }}
            >
              :
            </Box>
          )}
          {Array.from({ length: count }, () => {
            const position = index++;
            return <FlipUnit key={position} digit={characters[position]!} size={size} />;
          })}
        </Fragment>
      ))}
    </Box>
  );
}

/** "HHMMSS" for a duration in seconds (hours may exceed 24). */
export function durationDigits(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join('');
}

export function durationLabel(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  return `${hours} hours ${minutes} minutes`;
}

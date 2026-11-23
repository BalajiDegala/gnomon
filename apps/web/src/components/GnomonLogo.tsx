import { Box, keyframes, Typography, useMediaQuery } from '@mui/material';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { INDIA_ZONE, zoneTime } from '../lib/world-time';

const halo = keyframes`
  0%, 100% { opacity: 0.25; transform: scale(0.92); }
  50% { opacity: 0.6; transform: scale(1.04); }
`;
/** A light glint that travels round the dial rim, like the sun moving. */
const orbit = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;
/** The shadow quivers slightly, as a real shadow does in moving light. */
const sway = keyframes`
  0%, 100% { transform: rotate(-2.5deg); }
  50% { transform: rotate(2.5deg); }
`;
const breathe = keyframes`
  0%, 100% { opacity: 0.35; transform: scale(0.85); }
  50% { opacity: 0.85; transform: scale(1.15); }
`;
/** A wave of light passing across the wordmark, one letter after another. */
const letterWave = keyframes`
  0%, 60%, 100% { opacity: 0.72; transform: translateY(0); }
  20% { opacity: 1; transform: translateY(-1.5px); }
`;
const accentGlow = keyframes`
  0%, 60%, 100% { opacity: 0; }
  20% { opacity: 1; }
`;
/** The two Os orbit the M and trade places, pause, then trade back. */
const orbitSwap = keyframes`
  0%, 30% { transform: rotate(0deg); }
  50%, 80% { transform: rotate(180deg); }
  100% { transform: rotate(360deg); }
`;
/** Counter-rotation that keeps each orbiting O upright. */
const keepUpright = keyframes`
  0%, 30% { transform: rotate(0deg); }
  50%, 80% { transform: rotate(-180deg); }
  100% { transform: rotate(-360deg); }
`;
const sweepIn = keyframes`
  from { transform: rotate(var(--g-sweep-from)); }
  to { transform: rotate(var(--g-sweep-to)); }
`;

/*
 * Performance: every animated part is its own absolutely positioned layer and
 * only animates transform/opacity, which the browser composites on the GPU
 * without repainting the SVG. Animations stop under prefers-reduced-motion and
 * browsers pause them in background tabs.
 */
const reducedMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } };
const layer = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  willChange: 'transform',
} as const;

/** Shadow angle like a clock hand: 12 o'clock points up, one hour = 30°. */
function indiaShadowAngle(date: Date): number {
  const time = zoneTime(INDIA_ZONE, date);
  return ((time.hour % 12) + time.minute / 60) * 30;
}

function useIndiaShadowAngle(): number {
  const [angle, setAngle] = useState(() => indiaShadowAngle(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setAngle(indiaShadowAngle(new Date())), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return angle;
}

/**
 * The Gnomon mark: a sundial seen from above. The fixed blade is the gnomon;
 * the accent shadow points at the current India time. `sweep` spins the
 * shadow once round the dial before it settles (skipped with reduced motion).
 */
export function GnomonMark({
  size = 40,
  variant = 'live',
  raised = true,
}: {
  size?: number;
  variant?: 'live' | 'sweep';
  raised?: boolean;
}) {
  const angle = useIndiaShadowAngle();
  const glintId = `gnomon-glint-${useId().replaceAll(':', '')}`;
  const ticks = Array.from({ length: 12 }, (_, index) => index * 30);
  return (
    <Box
      aria-hidden
      sx={{
        position: 'relative',
        width: size,
        height: size,
        flex: '0 0 auto',
        display: 'grid',
        placeItems: 'center',
        borderRadius: '30%',
        color: 'var(--g-fg)',
        bgcolor: 'var(--g-base)',
        ...(raised && {
          boxShadow: 'var(--g-raised-sm)',
          border: '1px solid var(--g-border)',
        }),
        ...(variant === 'sweep' && {
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: -size * 0.18,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--g-accent) 38%, transparent), transparent 68%)',
            animation: `${halo} 4.5s ease-in-out infinite`,
            zIndex: -1,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.35 },
          },
        }),
      }}
    >
      <Box sx={{ position: 'relative', width: size * 0.78, height: size * 0.78 }}>
        {/* Static dial: drawn once, never repainted by the animations. */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 48 48"
          fill="none"
          style={{ display: 'block' }}
        >
          <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="2" opacity="0.9" />
          {ticks.map((tick) => (
            <line
              key={tick}
              x1="24"
              y1={tick % 90 === 0 ? 5.5 : 6.5}
              x2="24"
              y2={tick % 90 === 0 ? 10 : 8.8}
              stroke="currentColor"
              strokeWidth={tick % 90 === 0 ? 2.2 : 1.4}
              strokeLinecap="round"
              transform={`rotate(${tick} 24 24)`}
              opacity={tick % 90 === 0 ? 0.95 : 0.6}
            />
          ))}
        </svg>

        {/* Sun glint orbiting the rim. */}
        <Box sx={{ ...layer, animation: `${orbit} 12s linear infinite`, ...reducedMotion }}>
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 48 48"
            fill="none"
            style={{ display: 'block' }}
          >
            <defs>
              <linearGradient id={glintId} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="var(--g-accent)" stopOpacity="0" />
                <stop offset="1" stopColor="var(--g-accent)" stopOpacity="0.95" />
              </linearGradient>
            </defs>
            <path
              d="M 9.15 9.15 A 21 21 0 0 1 24 3"
              stroke={`url(#${glintId})`}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <circle cx="24" cy="3" r="2" fill="var(--g-accent)" />
          </svg>
        </Box>

        {/* Shadow: points at the India time, with a gentle sway. */}
        <Box
          sx={{
            ...layer,
            transform: `rotate(${angle}deg)`,
            transition: 'transform 1.2s ease',
            ...(variant === 'sweep' && {
              '--g-sweep-from': `${angle - 360}deg`,
              '--g-sweep-to': `${angle}deg`,
              animation: `${sweepIn} 1.8s cubic-bezier(.22,.9,.24,1) both`,
              ...reducedMotion,
            }),
          }}
        >
          <Box
            sx={{
              ...layer,
              animation: `${sway} 5s ease-in-out infinite`,
              animationDelay: variant === 'sweep' ? '1.8s' : '0s',
              ...reducedMotion,
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 48 48"
              fill="none"
              style={{ display: 'block' }}
            >
              <line
                x1="24"
                y1="24"
                x2="24"
                y2="9.5"
                stroke="var(--g-accent)"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
            </svg>
          </Box>
        </Box>

        {/* Fixed gnomon blade and hub, above the shadow. */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 48 48"
          fill="none"
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          <path d="M24 24 L21.6 12.5 L24 11 L26.4 12.5 Z" fill="currentColor" opacity="0.85" />
          <circle cx="24" cy="24" r="3.2" fill="currentColor" />
        </svg>
        {/* Hub light pulse. */}
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: size * 0.78 * (2.6 / 48),
            height: size * 0.78 * (2.6 / 48),
            ml: `${-(size * 0.78 * (1.3 / 48))}px`,
            mt: `${-(size * 0.78 * (1.3 / 48))}px`,
            borderRadius: '50%',
            bgcolor: 'var(--g-accent)',
            willChange: 'transform, opacity',
            animation: `${breathe} 3s ease-in-out infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.8 },
          }}
        />
      </Box>
    </Box>
  );
}

const WORDMARK = ['G', 'N', 'O', 'M', 'O', 'N'] as const;
const LETTER_SPACING_EM = 0.32;
const SWAP_SECONDS = 9;

function waveSx(index: number) {
  return {
    display: 'inline-block',
    willChange: 'transform, opacity',
    animation: `${letterWave} 4.8s ease-in-out infinite`,
    animationDelay: `${index * 0.22}s`,
    '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 1 },
  } as const;
}

function OLetter({ index, children }: { index: number; children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        ...waveSx(index),
        position: 'relative',
        // The two Os pick up the shadow's accent.
        color: 'var(--g-accent-text)',
        // Soft glow behind each O when the wave passes (opacity only).
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: '-20% -0.1em',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--g-accent) 35%, transparent), transparent 70%)',
          opacity: 0,
          zIndex: -1,
          willChange: 'opacity',
          animation: `${accentGlow} 4.8s ease-in-out infinite`,
          animationDelay: `${index * 0.22}s`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * GNOMON wordmark. A light wave runs across the letters, and the two Os orbit
 * the M to swap places (one over, one under) while staying upright. Only
 * transform/opacity animate, so it runs on the compositor.
 */
function AnimatedWordmark({ fontSize }: { fontSize: number }) {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const containerRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [geometry, setGeometry] = useState<{ pivot: number; left: number; right: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const base = container.getBoundingClientRect().left;
      const spacing = fontSize * LETTER_SPACING_EM;
      const centre = (index: number) => {
        const rect = letterRefs.current[index]?.getBoundingClientRect();
        return rect ? rect.left - base + (rect.width - spacing) / 2 : 0;
      };
      const pivot = centre(3);
      setGeometry({ pivot, left: centre(2) - pivot, right: centre(4) - pivot });
    };
    measure();
    // Web fonts can change letter widths after first paint.
    void document.fonts?.ready.then(measure);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [fontSize]);

  const orbiting = Boolean(geometry) && !reducedMotion;

  return (
    <Typography
      ref={containerRef}
      component="div"
      aria-label="GNOMON"
      sx={{
        position: 'relative',
        fontSize,
        fontWeight: 600,
        letterSpacing: `${LETTER_SPACING_EM}em`,
        lineHeight: 1.1,
        color: 'var(--g-fg)',
        whiteSpace: 'nowrap',
      }}
    >
      {WORDMARK.map((letter, index) => {
        const ref = (element: HTMLSpanElement | null) => {
          letterRefs.current[index] = element;
        };
        if (letter !== 'O') {
          return (
            <Box key={index} ref={ref} component="span" aria-hidden sx={waveSx(index)}>
              {letter}
            </Box>
          );
        }
        // Os keep their slot in the layout; while orbiting, the visible O is an overlay.
        return (
          <Box
            key={index}
            ref={ref}
            component="span"
            aria-hidden
            sx={{ display: 'inline-block', visibility: orbiting ? 'hidden' : 'visible' }}
          >
            <OLetter index={index}>{letter}</OLetter>
          </Box>
        );
      })}

      {orbiting &&
        geometry &&
        (
          [
            [2, geometry.left],
            [4, geometry.right],
          ] as const
        ).map(([index, offset]) => (
          // Arm pinned at the M's centre; it rotates, carrying the O round.
          <Box
            key={index}
            component="span"
            aria-hidden
            sx={{
              position: 'absolute',
              left: geometry.pivot,
              top: '50%',
              width: 0,
              height: 0,
              willChange: 'transform',
              animation: `${orbitSwap} ${SWAP_SECONDS}s cubic-bezier(.65,0,.35,1) infinite`,
            }}
          >
            <Box
              component="span"
              sx={{
                position: 'absolute',
                left: offset,
                top: 0,
                width: 0,
                height: 0,
                willChange: 'transform',
                animation: `${keepUpright} ${SWAP_SECONDS}s cubic-bezier(.65,0,.35,1) infinite`,
              }}
            >
              <Box
                component="span"
                sx={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  transform: 'translate(-50%, -50%)',
                  letterSpacing: 0,
                }}
              >
                <OLetter index={index}>O</OLetter>
              </Box>
            </Box>
          </Box>
        ))}
    </Typography>
  );
}

/** Mark plus the GNOMON wordmark and Digital Domain India line. */
export function GnomonLogo({
  size = 40,
  variant = 'live',
  wordmarkSize = 16,
}: {
  size?: number;
  variant?: 'live' | 'sweep';
  wordmarkSize?: number;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: size * 0.032 + 1.1 }}>
      <GnomonMark size={size} variant={variant} />
      <Box>
        <AnimatedWordmark fontSize={wordmarkSize} />
        <Typography
          component="div"
          sx={{
            mt: 0.25,
            fontSize: Math.max(10, wordmarkSize * 0.6),
            letterSpacing: '0.22em',
            color: 'var(--g-muted)',
          }}
        >
          DIGITAL DOMAIN INDIA
        </Typography>
      </Box>
    </Box>
  );
}

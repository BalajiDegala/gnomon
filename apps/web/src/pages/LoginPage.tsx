import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  keyframes,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Eye, EyeOff } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { GnomonLogo, GnomonMark } from '../components/GnomonLogo';
import { TerrainContour, type TerrainContourHandle } from '../components/TerrainContour';
import { useAuth } from '../lib/auth';
import { INDIA_ZONE, useNow, zoneTime } from '../lib/world-time';

const fieldSx = { '& .MuiOutlinedInput-input': { py: 1.75 } };
const caretBlink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;
const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
const mono = {
  fontFamily: 'var(--g-mono)',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
} as const;

export function LoginPage() {
  const { login } = useAuth();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const terrain = useRef<TerrainContourHandle>(null);
  const [userIdFocused, setUserIdFocused] = useState(false);
  // Shrinks long user IDs so they stay on one line above the 600px-wide area.
  const echoSize = Math.min(80, Math.max(32, 600 / (Math.max(userId.length, 1) * 0.58)));
  const now = useNow(1_000);
  const india = zoneTime(INDIA_ZONE, now);

  useEffect(() => {
    document.title = 'Sign in | Gnomon';
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    terrain.current?.pulse();

    try {
      await login({ userId, password });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  const hairline = { borderColor: 'var(--g-line)' };

  return (
    <Box
      component="main"
      sx={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        bgcolor: 'var(--g-base)',
        color: 'var(--g-fg)',
        userSelect: 'none',
      }}
    >
      {/* Topographic contour surface */}
      <Box sx={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <TerrainContour ref={terrain} />
      </Box>

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          px: { xs: 2, sm: 4, md: 6 },
          py: { xs: 2, sm: 3 },
          pointerEvents: 'none',
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            pb: 2,
            borderBottom: '1px solid',
            ...hairline,
            pointerEvents: 'auto',
          }}
        >
          <GnomonLogo size={44} variant="sweep" wordmarkSize={17} />
          <Stack direction="row" sx={{ alignItems: 'center', gap: 2.5 }}>
            <Typography
              sx={{
                ...mono,
                display: { xs: 'none', md: 'block' },
                fontSize: 11.5,
                color: 'var(--g-muted)',
              }}
            >
              Hyderabad · 17°23′N 78°29′E
            </Typography>
            <Typography
              sx={{
                ...mono,
                fontSize: 12,
                fontWeight: 600,
                px: 1.25,
                py: 0.5,
                borderRadius: '8px',
                border: '1px solid var(--g-border)',
                bgcolor: 'var(--g-base)',
              }}
            >
              {india.digits.slice(0, 2)}:{india.digits.slice(2, 4)} IST
            </Typography>
          </Stack>
        </Stack>

        {/* Sign-in panel */}
        <Box sx={{ display: 'flex', alignItems: 'center', py: 4 }}>
          <Box
            sx={{
              width: '100%',
              maxWidth: 420,
              mx: { xs: 'auto', md: 0 },
              ml: { md: '5vw' },
              pointerEvents: 'auto',
              userSelect: 'text',
            }}
          >
            {/* Echo of the typed user ID with a blinking caret; plain text, no animation. */}
            <Box
              aria-hidden
              sx={{
                height: 170,
                mb: 3,
                width: { md: 600 },
                maxWidth: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                overflow: 'hidden',
              }}
            >
              <Typography
                component="div"
                noWrap
                sx={{
                  fontSize: echoSize,
                  fontWeight: 500,
                  lineHeight: 1.1,
                  letterSpacing: '-0.01em',
                  color: 'var(--g-fg)',
                }}
              >
                {userId}
                {userIdFocused && (
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-block',
                      width: '0.06em',
                      minWidth: 2,
                      height: '0.95em',
                      ml: '0.06em',
                      verticalAlign: '-0.12em',
                      bgcolor: 'var(--g-accent)',
                      animation: `${caretBlink} 1.06s step-end infinite`,
                      '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                    }}
                  />
                )}
              </Typography>
            </Box>
            {/* Named for screen readers; the page shows only the form. */}
            <Typography component="h1" sx={visuallyHidden}>
              Sign in to Gnomon
            </Typography>
            <Box
              sx={{
                p: { xs: 3, sm: 3.5 },
                borderRadius: '24px',
                // Solid on purpose: a blurred panel over the animation is re-blurred every frame.
                bgcolor: 'var(--g-base)',
                border: '1px solid var(--g-border)',
                boxShadow: 'var(--g-raised)',
              }}
            >
              <Box component="form" onSubmit={(event) => void submit(event)}>
                <Stack spacing={2.5}>
                  {error && <Alert severity="error">{error}</Alert>}
                  <TextField
                    label="User ID"
                    autoComplete="username"
                    autoFocus
                    value={userId}
                    onChange={(event) => setUserId(event.target.value)}
                    onFocus={() => setUserIdFocused(true)}
                    onBlur={() => setUserIdFocused(false)}
                    required
                    fullWidth
                    sx={fieldSx}
                    slotProps={{
                      htmlInput: {
                        autoCapitalize: 'none',
                        autoCorrect: 'off',
                        spellCheck: false,
                        maxLength: 64,
                      },
                    }}
                  />
                  <TextField
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    fullWidth
                    sx={fieldSx}
                    slotProps={{
                      htmlInput: { minLength: 8 },
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                              edge="end"
                              onClick={() => setShowPassword((visible) => !visible)}
                            >
                              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={submitting}
                    startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : null}
                    sx={{ py: 1.5, mt: 1, fontSize: 15, borderRadius: '14px' }}
                  >
                    {submitting ? 'Signing in…' : 'Sign in to Gnomon'}
                  </Button>
                </Stack>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Footer */}
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            pt: 2,
            borderTop: '1px solid',
            ...hairline,
            color: 'var(--g-muted)',
          }}
        >
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <GnomonMark size={20} raised={false} />
            <Typography sx={{ ...mono, fontSize: 11 }}>Digital Domain India</Typography>
          </Stack>
          <Typography sx={{ ...mono, fontSize: 11, display: { xs: 'none', md: 'block' } }}>
            Attendance · Timesheets · Leave
          </Typography>
          <Typography sx={{ ...mono, fontSize: 11 }}>Internal system</Typography>
        </Stack>
      </Box>
    </Box>
  );
}

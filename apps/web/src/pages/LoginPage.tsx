import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Activity,
  ArrowRight,
  Clock3,
  Eye,
  EyeOff,
  Fingerprint,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import { useAuth } from '../lib/auth';

const platformSignals = [
  {
    icon: Fingerprint,
    title: 'Attendance reconciliation',
    detail: 'Biometric, access-card and website signals in one workday.',
  },
  {
    icon: Clock3,
    title: 'Time and delivery',
    detail: 'Start, stop and show-level timesheets with clear ownership.',
  },
  {
    icon: ShieldCheck,
    title: 'Scoped approvals',
    detail: 'Reporting Manager, Show Manager and HR access stays separated.',
  },
];

const workspaceSnapshot = [
  { value: '3', label: 'attendance signals' },
  { value: '1', label: 'reconciled workday' },
  { value: '24/7', label: 'audited activity' },
];

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    document.title = 'Sign in | Gnomon';
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login({ email, password });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.15fr) minmax(520px, .85fr)' },
        bgcolor: '#0b1220',
      }}
    >
      <Box
        sx={{
          display: { xs: 'none', lg: 'flex' },
          position: 'relative',
          overflow: 'hidden',
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: { lg: 6, xl: 8 },
          color: '#fff',
          background:
            'radial-gradient(circle at 16% 10%, rgba(42,206,218,.2), transparent 30%), radial-gradient(circle at 84% 86%, rgba(77,90,196,.18), transparent 32%), linear-gradient(145deg, #0a1724 0%, #0b1220 62%, #11162d 100%)',
          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            opacity: 0.22,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'linear-gradient(to bottom, transparent, #000 22%, #000 80%, transparent)',
            pointerEvents: 'none',
          },
        }}
      >
        <Stack
          direction="row"
          sx={{ position: 'relative', zIndex: 1, alignItems: 'center', gap: 1.5 }}
        >
          <Box
            sx={{
              width: 42,
              height: 42,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 2.5,
              background: 'linear-gradient(135deg, #32d0de, #138697)',
              boxShadow: '0 10px 30px rgba(31,190,205,.25)',
            }}
          >
            <Sparkles size={21} color="#061419" />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 17, fontWeight: 850, letterSpacing: 1.2 }}>
              GNOMON
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,.44)', fontSize: 10, letterSpacing: 0.9 }}>
              DIGITAL DOMAIN INDIA
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 680, py: 5 }}>
          <Chip
            label="WORKFORCE OPERATIONS"
            size="small"
            sx={{
              mb: 3,
              color: '#9deaf0',
              bgcolor: 'rgba(43,204,217,.1)',
              border: '1px solid rgba(43,204,217,.17)',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1,
            }}
          />
          <Typography
            sx={{
              maxWidth: 600,
              fontSize: { lg: 47, xl: 58 },
              lineHeight: 1.06,
              fontWeight: 850,
              letterSpacing: '-0.052em',
            }}
          >
            One clear view of every workday.
          </Typography>
          <Typography
            sx={{
              mt: 2.25,
              maxWidth: 560,
              color: 'rgba(255,255,255,.56)',
              fontSize: 15,
              lineHeight: 1.7,
            }}
          >
            Attendance, show time, leave and approvals designed around how a VFX studio actually
            works.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              mt: 4,
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,.035)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 18px 48px rgba(0,0,0,.12)',
            }}
          >
            {workspaceSnapshot.map((item, index) => (
              <Box
                key={item.label}
                sx={{
                  p: 2,
                  borderLeft: index ? '1px solid rgba(255,255,255,.075)' : 0,
                }}
              >
                <Typography sx={{ color: '#72e0e7', fontSize: 20, fontWeight: 840 }}>
                  {item.value}
                </Typography>
                <Typography sx={{ mt: 0.25, color: 'rgba(255,255,255,.43)', fontSize: 10.5 }}>
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>

          <Stack spacing={2.1} sx={{ mt: 4 }}>
            {platformSignals.map((signal) => {
              const Icon = signal.icon;
              return (
                <Stack key={signal.title} direction="row" sx={{ alignItems: 'center', gap: 1.75 }}>
                  <Box
                    sx={{
                      width: 38,
                      height: 38,
                      flex: '0 0 auto',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 2,
                      bgcolor: 'rgba(255,255,255,.055)',
                      border: '1px solid rgba(255,255,255,.07)',
                      color: '#4ed3de',
                    }}
                  >
                    <Icon size={18} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 750 }}>{signal.title}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,.43)', fontSize: 11.5, mt: 0.2 }}>
                      {signal.detail}
                    </Typography>
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        </Box>

        <Stack
          direction="row"
          sx={{ position: 'relative', zIndex: 1, alignItems: 'center', gap: 0.75 }}
        >
          <Activity size={13} color="#52d6df" />
          <Typography sx={{ color: 'rgba(255,255,255,.32)', fontSize: 10.5 }}>
            Internal workforce system · Asia/Kolkata
          </Typography>
        </Stack>
      </Box>

      <Box
        sx={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          px: { xs: 2, sm: 5, lg: 7 },
          py: 5,
          bgcolor: { xs: '#0b1220', lg: '#f3f6f8' },
          background: {
            xs: 'radial-gradient(circle at 15% 10%, rgba(35,199,213,.18), transparent 34%), #0b1220',
            lg: 'radial-gradient(circle at 80% 20%, rgba(18,148,161,.08), transparent 28%), radial-gradient(circle at 20% 84%, rgba(93,99,216,.055), transparent 30%), #f3f6f8',
          },
        }}
      >
        <Card
          sx={{
            width: '100%',
            maxWidth: 460,
            borderRadius: 4,
            overflow: 'hidden',
            border: '1px solid rgba(215,224,231,.86)',
            boxShadow: { xs: '0 24px 80px rgba(0,0,0,.36)', lg: '0 28px 80px rgba(23,32,51,.12)' },
            '&::before': {
              content: '""',
              display: 'block',
              height: 4,
              background: 'linear-gradient(90deg, #22b8c5, #5961d8)',
            },
          }}
        >
          <CardContent sx={{ p: { xs: 3.25, sm: 5 } }}>
            <Stack spacing={3.25}>
              <Box>
                <Stack
                  direction="row"
                  sx={{ display: { lg: 'none' }, alignItems: 'center', gap: 1, mb: 3 }}
                >
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 2,
                      bgcolor: 'primary.main',
                    }}
                  >
                    <Sparkles size={17} color="#061419" />
                  </Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 850, letterSpacing: 1 }}>
                    GNOMON
                  </Typography>
                </Stack>
                <Typography
                  sx={{
                    color: 'primary.dark',
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: 1.3,
                  }}
                >
                  DIGITAL DOMAIN INDIA
                </Typography>
                <Typography
                  variant="h4"
                  sx={{ mt: 0.75, fontWeight: 850, letterSpacing: '-0.04em' }}
                >
                  Welcome back
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 13, mt: 1 }}>
                  Sign in with your Gnomon work account.
                </Typography>
              </Box>

              {error && <Alert severity="error">{error}</Alert>}

              <Box component="form" onSubmit={(event) => void submit(event)}>
                <Stack spacing={2.25}>
                  <TextField
                    label="Work email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    fullWidth
                  />
                  <TextField
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
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
                    required
                    fullWidth
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    endIcon={<ArrowRight size={17} />}
                    disabled={submitting}
                    sx={{ py: 1.45, mt: 0.5, fontSize: 14 }}
                  >
                    {submitting ? 'Signing in…' : 'Sign in to Gnomon'}
                  </Button>
                </Stack>
              </Box>

              <Stack
                direction="row"
                sx={{ alignItems: 'center', justifyContent: 'center', gap: 0.75 }}
              >
                <ShieldCheck size={14} color="#7b8798" />
                <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                  Secured with scoped role-based access
                </Typography>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

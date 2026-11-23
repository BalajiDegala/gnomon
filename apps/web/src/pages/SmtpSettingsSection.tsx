import {
  gmailSmtpDefaults,
  type SmtpSecurity,
  type SmtpSettingsDto,
  type UpdateSmtpSettingsRequest,
} from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Eye, EyeOff, Mail, Save, Send } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth';
import { useSmtpSettings } from '../lib/smtp';

interface SmtpForm {
  enabled: boolean;
  host: string;
  port: string;
  security: SmtpSecurity;
  username: string;
  /** Empty means "keep the saved password" when one exists. */
  password: string;
  allowSelfSignedCertificate: boolean;
  fromName: string;
  fromAddress: string;
  replyTo: string;
}

const securityLabels: Record<SmtpSecurity, string> = {
  starttls: 'STARTTLS (usually port 587)',
  ssl: 'SSL/TLS (usually port 465)',
  none: 'None (internal relay, usually port 25)',
};
const defaultPorts: Record<SmtpSecurity, number> = { starttls: 587, ssl: 465, none: 25 };

function formFrom(settings: SmtpSettingsDto): SmtpForm {
  return {
    enabled: settings.enabled,
    host: settings.host,
    port: String(settings.port),
    security: settings.security,
    username: settings.username,
    password: '',
    allowSelfSignedCertificate: settings.allowSelfSignedCertificate,
    fromName: settings.fromName,
    fromAddress: settings.fromAddress,
    replyTo: settings.replyTo ?? '',
  };
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export function SmtpSettingsSection({ onSaved }: { onSaved: (message: string) => void }) {
  const { user } = useAuth();
  const smtp = useSmtpSettings();
  const [form, setForm] = useState<SmtpForm | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [testRecipient, setTestRecipient] = useState(user?.email ?? '');

  useEffect(() => {
    if (smtp.settings) setForm(formFrom(smtp.settings));
  }, [smtp.settings]);

  if (!smtp.canManage) return null;
  const settings = smtp.settings;
  const isGmail = form?.host.trim().toLowerCase() === gmailSmtpDefaults.host;
  const update = (change: Partial<SmtpForm>) =>
    setForm((current) => (current ? { ...current, ...change } : current));

  const portNumber = Number(form?.port);
  const portValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65_535;
  const needsPassword =
    Boolean(form?.enabled && form.username.trim()) &&
    !form?.password &&
    (!settings?.hasPassword || settings.passwordNeedsReentry);
  const canSave =
    Boolean(form?.host.trim() && form.fromName.trim() && form.fromAddress.trim()) &&
    portValid &&
    !needsPassword;

  const submit = async () => {
    if (!form) return;
    const input: UpdateSmtpSettingsRequest = {
      enabled: form.enabled,
      host: form.host.trim(),
      port: portNumber,
      security: form.security,
      username: form.username.trim(),
      ...(form.password ? { password: form.password } : {}),
      allowSelfSignedCertificate: form.allowSelfSignedCertificate,
      fromName: form.fromName.trim(),
      fromAddress: form.fromAddress.trim(),
      replyTo: form.replyTo.trim() || null,
    };
    try {
      await smtp.save.mutateAsync(input);
      onSaved('Email settings saved.');
    } catch {
      // Shown through smtp.save.error.
    }
  };

  const status = !settings?.configured
    ? { label: 'Not set up', color: 'default' as const }
    : settings.enabled
      ? { label: 'Sending enabled', color: 'success' as const }
      : { label: 'Sending off', color: 'warning' as const };
  const error = smtp.save.error ?? smtp.test.error ?? smtp.loadError;

  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' }, gap: 1.5 }}
        >
          <Stack direction="row" sx={{ gap: 1.5, alignItems: 'flex-start' }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                borderRadius: '10px',
                bgcolor: 'var(--g-accent-soft)',
                color: 'primary.dark',
              }}
            >
              <Mail size={18} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Email (SMTP)</Typography>
              <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11.5, maxWidth: 640 }}>
                The mail server Gnomon uses for email triggers. Starts with Gmail; switch to your
                own server any time by changing the server details below.
              </Typography>
            </Box>
          </Stack>
          <Chip size="small" label={status.label} color={status.color} sx={{ fontWeight: 700 }} />
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error instanceof Error ? error.message : 'The request failed.'}
          </Alert>
        )}
        {settings?.passwordNeedsReentry && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            The saved password can no longer be read because the server key changed. Enter it again
            and save.
          </Alert>
        )}

        {smtp.isLoading || !form ? (
          <Box sx={{ py: 4, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <>
            <Stack direction="row" sx={{ mt: 2.5, gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mr: 0.5 }}>
                Preset
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={isGmail ? 'gmail' : 'custom'}
                onChange={(_event, value: 'gmail' | 'custom' | null) => {
                  if (value === 'gmail') update({ ...gmailSmtpDefaults, port: '587' });
                  if (value === 'custom' && isGmail) update({ host: '' });
                }}
              >
                <ToggleButton value="gmail" sx={{ px: 1.5, textTransform: 'none' }}>
                  Gmail
                </ToggleButton>
                <ToggleButton value="custom" sx={{ px: 1.5, textTransform: 'none' }}>
                  Own / local server
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            {isGmail && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                Gmail needs an <b>App Password</b>, not the normal account password: Google account
                → Security → 2-Step Verification → App passwords. Use the full Gmail address as the
                username and as the sender address.
              </Alert>
            )}

            <Box
              sx={{
                mt: 2,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) 120px minmax(0, 1.4fr)' },
                gap: 1.5,
              }}
            >
              <TextField
                size="small"
                label="SMTP server"
                value={form.host}
                onChange={(event) => update({ host: event.target.value })}
                placeholder="smtp.example.local"
                required
              />
              <TextField
                size="small"
                label="Port"
                value={form.port}
                onChange={(event) => update({ port: event.target.value.replace(/\D/g, '') })}
                error={!portValid}
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5 } }}
                required
              />
              <TextField
                select
                size="small"
                label="Security"
                value={form.security}
                onChange={(event) => {
                  const security = event.target.value as SmtpSecurity;
                  const port = Object.values(defaultPorts).includes(portNumber)
                    ? String(defaultPorts[security])
                    : form.port;
                  update({ security, port });
                }}
              >
                {(Object.keys(securityLabels) as SmtpSecurity[]).map((security) => (
                  <MenuItem key={security} value={security}>
                    {securityLabels[security]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Username"
                value={form.username}
                onChange={(event) => update({ username: event.target.value })}
                placeholder={isGmail ? 'name@gmail.com' : 'Leave empty if no sign-in is needed'}
                autoComplete="off"
                sx={{ gridColumn: { md: '1 / 2' } }}
              />
              <TextField
                size="small"
                label={isGmail ? 'App password' : 'Password'}
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(event) => update({ password: event.target.value })}
                placeholder={
                  settings?.hasPassword && !settings.passwordNeedsReentry
                    ? 'Saved — type to replace'
                    : ''
                }
                autoComplete="new-password"
                error={needsPassword}
                helperText={needsPassword ? 'Required to enable sending' : undefined}
                sx={{ gridColumn: { md: '2 / 4' } }}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          edge="end"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((visible) => !visible)}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                size="small"
                label="Sender name"
                value={form.fromName}
                onChange={(event) => update({ fromName: event.target.value })}
                required
              />
              <TextField
                size="small"
                label="Sender address"
                type="email"
                value={form.fromAddress}
                onChange={(event) => update({ fromAddress: event.target.value })}
                placeholder="gnomon@d2-india.com"
                required
                sx={{ gridColumn: { md: '2 / 4' } }}
              />
              <TextField
                size="small"
                label="Reply-to (optional)"
                type="email"
                value={form.replyTo}
                onChange={(event) => update({ replyTo: event.target.value })}
                placeholder="hr@d2-india.com"
              />
              <Stack
                direction="row"
                sx={{ gridColumn: { md: '2 / 4' }, alignItems: 'center', flexWrap: 'wrap', gap: 2 }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={form.allowSelfSignedCertificate}
                      onChange={(event) =>
                        update({ allowSelfSignedCertificate: event.target.checked })
                      }
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: 12.5 }}>
                      Allow self-signed certificate (internal servers only)
                    </Typography>
                  }
                />
              </Stack>
            </Box>

            <Stack
              direction={{ xs: 'column', md: 'row' }}
              sx={{
                mt: 2,
                pt: 2,
                gap: 2,
                justifyContent: 'space-between',
                alignItems: { md: 'center' },
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            >
              <FormControlLabel
                control={
                  <Switch
                    checked={form.enabled}
                    onChange={(event) => update({ enabled: event.target.checked })}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 750 }}>Send emails</Typography>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                      When off, email triggers are skipped. Test emails still work.
                    </Typography>
                  </Box>
                }
              />
              <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
                {settings?.updatedAt && (
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                    Saved {formatWhen(settings.updatedAt)}
                    {settings.updatedByName ? ` by ${settings.updatedByName}` : ''}
                  </Typography>
                )}
                <Button
                  variant="contained"
                  disabled={!canSave || smtp.save.isPending}
                  startIcon={
                    smtp.save.isPending ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <Save size={15} />
                    )
                  }
                  onClick={() => void submit()}
                  sx={{ boxShadow: 'none' }}
                >
                  Save settings
                </Button>
              </Stack>
            </Stack>

            <Box
              sx={{
                mt: 2,
                p: 1.75,
                borderRadius: '12px',
                bgcolor: 'var(--g-base)',
                boxShadow: 'var(--g-inset-sm)',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 750 }}>Send a test email</Typography>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 1.25 }}>
                Uses the saved settings. Save first if you changed anything above.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
                <TextField
                  size="small"
                  type="email"
                  label="Send to"
                  value={testRecipient}
                  onChange={(event) => setTestRecipient(event.target.value)}
                  sx={{ flex: 1, maxWidth: { sm: 360 }, bgcolor: 'var(--g-base)' }}
                />
                <Button
                  variant="outlined"
                  disabled={!settings?.configured || !testRecipient.trim() || smtp.test.isPending}
                  startIcon={
                    smtp.test.isPending ? <CircularProgress size={14} /> : <Send size={15} />
                  }
                  onClick={() => smtp.test.mutate(testRecipient.trim())}
                >
                  {smtp.test.isPending ? 'Sending…' : 'Send test'}
                </Button>
              </Stack>
              {settings?.lastTest && (
                <Alert severity={settings.lastTest.ok ? 'success' : 'error'} sx={{ mt: 1.5 }}>
                  {settings.lastTest.message}
                  <Typography component="span" sx={{ ml: 1, fontSize: 11, opacity: 0.75 }}>
                    · {formatWhen(settings.lastTest.at)}
                  </Typography>
                </Alert>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

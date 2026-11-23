import type { LdapAttributeMap, LdapSettingsDto, UpdateLdapSettingsRequest } from '@gnomon/shared';
import { defaultLdapAttributes, defaultLdapUserFilter } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { ChevronDown, Eye, EyeOff, PlugZap, Save, ServerCog } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useLdapSettings } from '../lib/ldap';

interface LdapForm {
  enabled: boolean;
  url: string;
  startTls: boolean;
  allowSelfSignedCertificate: boolean;
  bindDn: string;
  /** Empty means "keep the saved password" when one exists. */
  bindPassword: string;
  baseDn: string;
  userFilter: string;
  attributes: LdapAttributeMap;
  autoCreateUsers: boolean;
  notifyAdmins: boolean;
}

const attributeLabels: Record<keyof LdapAttributeMap, string> = {
  username: 'User ID',
  email: 'Email',
  firstName: 'First name',
  lastName: 'Last name',
  displayName: 'Display name',
  department: 'Department',
  designation: 'Designation',
  employeeId: 'Employee ID',
};

function formFrom(settings: LdapSettingsDto): LdapForm {
  return {
    enabled: settings.enabled,
    url: settings.url,
    startTls: settings.startTls,
    allowSelfSignedCertificate: settings.allowSelfSignedCertificate,
    bindDn: settings.bindDn,
    bindPassword: '',
    baseDn: settings.baseDn,
    userFilter: settings.userFilter,
    attributes: settings.attributes,
    autoCreateUsers: settings.autoCreateUsers,
    notifyAdmins: settings.notifyAdmins,
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

/** Site preferences card for Active Directory / LDAP sign-in. */
export function LdapSettingsSection({ onSaved }: { onSaved: (message: string) => void }) {
  const ldap = useLdapSettings();
  const [form, setForm] = useState<LdapForm | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showMapping, setShowMapping] = useState(false);
  const [testLogin, setTestLogin] = useState('');
  const [testPassword, setTestPassword] = useState('');

  useEffect(() => {
    if (ldap.settings) setForm(formFrom(ldap.settings));
  }, [ldap.settings]);

  if (!ldap.canManage) return null;
  const settings = ldap.settings;
  const update = (change: Partial<LdapForm>) =>
    setForm((current) => (current ? { ...current, ...change } : current));
  const urlValid = /^ldaps?:\/\/[^\s/]+(:\d{1,5})?\/?$/i.test(form?.url.trim() ?? '');
  const needsPassword =
    Boolean(form?.bindDn.trim()) &&
    !form?.bindPassword &&
    (!settings?.hasBindPassword || settings.passwordNeedsReentry);
  const canSave =
    Boolean(form?.baseDn.trim()) &&
    urlValid &&
    Boolean(form?.userFilter.includes('{{login}}')) &&
    !needsPassword;

  const submit = async () => {
    if (!form) return;
    const input: UpdateLdapSettingsRequest = {
      enabled: form.enabled,
      url: form.url.trim(),
      startTls: form.startTls,
      allowSelfSignedCertificate: form.allowSelfSignedCertificate,
      bindDn: form.bindDn.trim(),
      ...(form.bindPassword ? { bindPassword: form.bindPassword } : {}),
      baseDn: form.baseDn.trim(),
      userFilter: form.userFilter.trim(),
      attributes: form.attributes,
      autoCreateUsers: form.autoCreateUsers,
      notifyAdmins: form.notifyAdmins,
    };
    try {
      await ldap.save.mutateAsync(input);
      update({ bindPassword: '' });
      onSaved(form.enabled ? 'Directory sign-in saved and on.' : 'Directory settings saved.');
    } catch {
      // Shown through ldap.save.error.
    }
  };

  const status = !settings?.configured
    ? { label: 'Not set up', color: 'default' as const }
    : settings.enabled
      ? { label: 'Sign-in enabled', color: 'success' as const }
      : { label: 'Sign-in off', color: 'warning' as const };
  const error = ldap.save.error ?? ldap.test.error ?? ldap.loadError;

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
              <ServerCog size={18} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 800 }}>
                Active Directory / LDAP sign-in
              </Typography>
              <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11.5, maxWidth: 720 }}>
                People sign in with their company directory password. A directory account is matched
                to an existing Gnomon person by email, user ID or employee ID, so nobody is
                duplicated. Anyone new is added with the Employee role and administrators are
                notified. Local accounts the directory does not know (such as the built-in
                administrator) keep their own password.
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
            The saved bind password can no longer be read because the server key changed. Enter it
            again and save.
          </Alert>
        )}

        {form && (
          <Stack spacing={2} sx={{ mt: 2.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.enabled}
                  onChange={(event) => update({ enabled: event.target.checked })}
                />
              }
              label="Sign in with the company directory"
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                size="small"
                label="Server URL"
                placeholder="ldaps://dc01.company.local:636"
                value={form.url}
                onChange={(event) => update({ url: event.target.value })}
                error={Boolean(form.url) && !urlValid}
                helperText={
                  form.url && !urlValid
                    ? 'Use ldap://host[:port] or ldaps://host[:port]'
                    : 'ldaps:// (port 636) is recommended'
                }
              />
              <TextField
                fullWidth
                size="small"
                label="Base DN (where people are searched)"
                placeholder="OU=Users,DC=company,DC=local"
                value={form.baseDn}
                onChange={(event) => update({ baseDn: event.target.value })}
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                size="small"
                label="Service account (bind DN)"
                placeholder="CN=gnomon-svc,OU=Service,DC=company,DC=local"
                value={form.bindDn}
                onChange={(event) => update({ bindDn: event.target.value })}
                helperText="Read-only account used to look people up. Leave empty for anonymous search."
              />
              <TextField
                fullWidth
                size="small"
                label="Service account password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.bindPassword}
                onChange={(event) => update({ bindPassword: event.target.value })}
                placeholder={settings?.hasBindPassword ? 'Saved; leave empty to keep' : ''}
                error={needsPassword}
                helperText={needsPassword ? 'Enter the password for the service account' : ' '}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((value) => !value)}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: { md: 3 } }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.startTls}
                    onChange={(event) => update({ startTls: event.target.checked })}
                  />
                }
                label="Use STARTTLS (for ldap://)"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.allowSelfSignedCertificate}
                    onChange={(event) =>
                      update({ allowSelfSignedCertificate: event.target.checked })
                    }
                  />
                }
                label="Allow self-signed certificate"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.autoCreateUsers}
                    onChange={(event) => update({ autoCreateUsers: event.target.checked })}
                  />
                }
                label="Add new people on first sign-in"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.notifyAdmins}
                    onChange={(event) => update({ notifyAdmins: event.target.checked })}
                  />
                }
                label="Email admins about new users"
              />
            </Stack>

            <Box>
              <Button
                size="small"
                color="inherit"
                endIcon={
                  <ChevronDown
                    size={15}
                    style={{ transform: showMapping ? 'rotate(180deg)' : undefined }}
                  />
                }
                onClick={() => setShowMapping((value) => !value)}
              >
                Search filter and attribute mapping
              </Button>
              <Collapse in={showMapping}>
                <Stack spacing={2} sx={{ mt: 1.5 }}>
                  <TextField
                    size="small"
                    label="User search filter"
                    value={form.userFilter}
                    onChange={(event) => update({ userFilter: event.target.value })}
                    error={!form.userFilter.includes('{{login}}')}
                    helperText={
                      form.userFilter.includes('{{login}}')
                        ? '{{login}} is replaced by what the person types as their user ID.'
                        : 'The filter must contain {{login}}'
                    }
                    slotProps={{ htmlInput: { style: { fontFamily: 'var(--g-mono)' } } }}
                  />
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(2, 1fr)',
                        lg: 'repeat(4, 1fr)',
                      },
                      gap: 1.5,
                    }}
                  >
                    {(Object.keys(attributeLabels) as Array<keyof LdapAttributeMap>).map((key) => (
                      <TextField
                        key={key}
                        size="small"
                        label={attributeLabels[key]}
                        value={form.attributes[key]}
                        onChange={(event) =>
                          update({ attributes: { ...form.attributes, [key]: event.target.value } })
                        }
                        slotProps={{ htmlInput: { style: { fontFamily: 'var(--g-mono)' } } }}
                      />
                    ))}
                  </Box>
                  <Box>
                    <Button
                      size="small"
                      color="inherit"
                      onClick={() =>
                        update({
                          userFilter: defaultLdapUserFilter,
                          attributes: defaultLdapAttributes,
                        })
                      }
                    >
                      Use Active Directory defaults
                    </Button>
                  </Box>
                </Stack>
              </Collapse>
            </Box>

            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                disabled={!canSave || ldap.save.isPending}
                startIcon={
                  ldap.save.isPending ? <CircularProgress size={15} /> : <Save size={15} />
                }
                onClick={() => void submit()}
              >
                Save directory settings
              </Button>
            </Stack>

            <Divider />

            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 800 }}>Test the connection</Typography>
              <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 11.5 }}>
                Uses the saved settings. Leave the fields empty to just connect, add a user ID to
                look someone up, or add their password to try a full sign-in. Nothing is created by
                a test.
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
                <TextField
                  size="small"
                  label="User ID (optional)"
                  value={testLogin}
                  onChange={(event) => setTestLogin(event.target.value)}
                  sx={{ minWidth: 220 }}
                />
                <TextField
                  size="small"
                  label="Password (optional)"
                  type="password"
                  autoComplete="new-password"
                  value={testPassword}
                  onChange={(event) => setTestPassword(event.target.value)}
                  sx={{ minWidth: 220 }}
                />
                <Button
                  variant="outlined"
                  color="inherit"
                  disabled={!settings?.configured || ldap.test.isPending}
                  startIcon={
                    ldap.test.isPending ? <CircularProgress size={15} /> : <PlugZap size={15} />
                  }
                  onClick={() =>
                    ldap.test.mutate(
                      {
                        ...(testLogin.trim() ? { login: testLogin.trim() } : {}),
                        ...(testLogin.trim() && testPassword ? { password: testPassword } : {}),
                      },
                      { onSettled: () => setTestPassword('') },
                    )
                  }
                >
                  Run test
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
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

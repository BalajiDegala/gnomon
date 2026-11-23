import type { TipsSettings } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Lightbulb, Save, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { previewTip, tips, useTipsSettings } from '../lib/tips';

const intervalOptions = [
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 180, label: 'Every 3 hours' },
  { value: 240, label: 'Every 4 hours' },
];
const displayOptions = [
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 45, label: '45 seconds' },
  { value: 60, label: '1 minute' },
];

/** Site preferences card for the "Tip from Relangi" wellbeing reminders. */
export function TipsSettingsSection({ onSaved }: { onSaved: (message: string) => void }) {
  const tipsSettings = useTipsSettings();
  const [form, setForm] = useState<TipsSettings>(tipsSettings.settings);

  useEffect(() => {
    setForm(tipsSettings.settings);
  }, [tipsSettings.settings]);

  if (!tipsSettings.canManage) return null;
  const dirty =
    form.enabled !== tipsSettings.settings.enabled ||
    form.intervalMinutes !== tipsSettings.settings.intervalMinutes ||
    form.displaySeconds !== tipsSettings.settings.displaySeconds;

  const save = async () => {
    try {
      await tipsSettings.save.mutateAsync(form);
      onSaved(form.enabled ? 'Tips from Relangi are on.' : 'Tips from Relangi are turned off.');
    } catch {
      // The error is shown in the card.
    }
  };

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
              <Lightbulb size={18} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Tips from Relangi</Typography>
              <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11.5, maxWidth: 640 }}>
                A friendly pop-up in the bottom-right corner with {tips.length} rotating tips: drink
                water, take a break, come on time, apply for leave early, log your hours, and more,
                matched to the time of day. Applies to everyone.
              </Typography>
            </Box>
          </Stack>
          <Chip
            size="small"
            label={tipsSettings.settings.enabled ? 'On' : 'Off'}
            color={tipsSettings.settings.enabled ? 'success' : 'default'}
            sx={{ fontWeight: 700 }}
          />
        </Stack>

        {tipsSettings.save.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {tipsSettings.save.error.message}
          </Alert>
        )}

        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{ mt: 2.5, gap: 2, alignItems: { md: 'center' }, flexWrap: 'wrap' }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={form.enabled}
                onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              />
            }
            label="Show tips"
          />
          <TextField
            select
            size="small"
            label="How often"
            value={form.intervalMinutes}
            disabled={!form.enabled}
            onChange={(event) => setForm({ ...form, intervalMinutes: Number(event.target.value) })}
            sx={{ minWidth: 190 }}
          >
            {intervalOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Stays on screen for"
            value={form.displaySeconds}
            disabled={!form.enabled}
            onChange={(event) => setForm({ ...form, displaySeconds: Number(event.target.value) })}
            sx={{ minWidth: 190 }}
          >
            {displayOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <Box sx={{ flex: 1 }} />
          <Button color="inherit" startIcon={<Sparkles size={15} />} onClick={previewTip}>
            Preview a tip
          </Button>
          <Button
            variant="contained"
            disabled={!dirty || tipsSettings.save.isPending}
            startIcon={
              tipsSettings.save.isPending ? <CircularProgress size={15} /> : <Save size={15} />
            }
            onClick={() => void save()}
          >
            Save
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

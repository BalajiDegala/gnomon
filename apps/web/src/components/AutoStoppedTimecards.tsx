import type { AttendanceActionItem } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Check, Clock3, Pencil, Send } from 'lucide-react';
import { useState } from 'react';

import { exitInstantAfter, indiaTimeInput, useConfirmAutoStop } from '../lib/attendance-actions';
import { useMyRegularisations } from '../lib/regularisations';
import { formatIndiaTime } from '../lib/timecard';
import { formatMinutes } from '../lib/timesheets';

const MIN_REASON = 10;

function dayLabel(workDate: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${workDate}T00:00:00Z`));
}

function minutesBetween(start: string, end: string | Date): number {
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
}

/**
 * Days whose timecard was left running and stopped automatically at 07:00. The
 * employee confirms the stop (saved straight away) or requests a corrected exit
 * time, which goes through the normal regularisation approval.
 */
export function AutoStoppedTimecards({
  items,
  onChanged,
}: {
  items: readonly AttendanceActionItem[];
  onChanged: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <Card sx={{ boxShadow: 'none', border: '1px solid var(--g-border)' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack direction="row" sx={{ gap: 1.5, alignItems: 'flex-start', mb: 2 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              flex: '0 0 auto',
              display: 'grid',
              placeItems: 'center',
              borderRadius: '10px',
              bgcolor: 'var(--g-pt-soft)',
              color: 'var(--g-pt)',
            }}
          >
            <Clock3 size={18} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 800 }}>
              Timecard stopped automatically
            </Typography>
            <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 12, maxWidth: 720 }}>
              Your timecard was still running when the workday ended at 07:00, so it was stopped
              then. If you really worked until 07:00, confirm it. Otherwise enter the time you
              actually left; that goes to your manager for approval.
            </Typography>
          </Box>
        </Stack>
        <Stack spacing={1.5}>
          {items.map((item) => (
            <AutoStoppedRow key={item.workDate} item={item} onChanged={onChanged} />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function AutoStoppedRow({
  item,
  onChanged,
}: {
  item: AttendanceActionItem;
  onChanged: () => void;
}) {
  const stop = item.autoStopped!;
  const confirm = useConfirmAutoStop();
  const regularisations = useMyRegularisations();
  const [editing, setEditing] = useState(false);
  const [exitTime, setExitTime] = useState(indiaTimeInput(stop.suggestedEnd));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const exitAt = /^\d{2}:\d{2}$/.test(exitTime) ? exitInstantAfter(stop.startedAt, exitTime) : null;
  const exitValid = Boolean(exitAt && exitAt <= new Date(stop.stoppedAt));
  const nextDay =
    exitAt &&
    new Date(exitAt.getTime() + 330 * 60_000).toISOString().slice(0, 10) !==
      new Date(new Date(stop.startedAt).getTime() + 330 * 60_000).toISOString().slice(0, 10);

  const submitCorrection = async () => {
    if (!exitAt) return;
    setSubmitting(true);
    setError('');
    try {
      await regularisations.create({
        workDate: item.workDate,
        source: 'website',
        missingEvent: 'closing',
        requestedStart: stop.startedAt,
        requestedEnd: exitAt.toISOString(),
        reason: reason.trim(),
      });
      setEditing(false);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      sx={{
        p: 1.75,
        borderRadius: '12px',
        border: '1px solid var(--g-border)',
        bgcolor: 'var(--g-base)',
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        sx={{ gap: 1.5, justifyContent: 'space-between', alignItems: { md: 'center' } }}
      >
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 750 }}>{dayLabel(item.workDate)}</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
            Started {formatIndiaTime(stop.startedAt)} · stopped automatically{' '}
            {formatIndiaTime(stop.stoppedAt)} next morning ·{' '}
            {formatMinutes(minutesBetween(stop.startedAt, stop.stoppedAt))}
          </Typography>
        </Box>
        {!editing && (
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={confirm.isPending ? <CircularProgress size={14} /> : <Check size={16} />}
              disabled={confirm.isPending}
              onClick={() =>
                confirm.mutate(stop.sessionId, {
                  onSuccess: onChanged,
                  onError: (cause) => setError(cause.message),
                })
              }
            >
              It's correct – save
            </Button>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<Pencil size={15} />}
              onClick={() => {
                setError('');
                setEditing(true);
              }}
            >
              Change exit time
            </Button>
          </Stack>
        )}
      </Stack>

      {editing && (
        <Stack spacing={1.5} sx={{ mt: 1.75 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5 }}>
            <TextField
              size="small"
              type="time"
              label="Actual exit time"
              value={exitTime}
              onChange={(event) => setExitTime(event.target.value)}
              error={!exitValid}
              helperText={
                !exitValid
                  ? 'Must be after the start and no later than 07:00 next morning'
                  : nextDay
                    ? 'Next morning'
                    : exitAt
                      ? `Worked ${formatMinutes(minutesBetween(stop.startedAt, exitAt))}`
                      : ' '
              }
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: { sm: 190 } }}
            />
            <TextField
              size="small"
              fullWidth
              label="Reason"
              placeholder="e.g. Forgot to stop the timecard when leaving"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText={
                reason.trim().length < MIN_REASON
                  ? `At least ${MIN_REASON} characters`
                  : 'Sent to your manager for approval'
              }
            />
          </Stack>
          <Stack direction="row" sx={{ gap: 1, justifyContent: 'flex-end' }}>
            <Button color="inherit" onClick={() => setEditing(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="contained"
              startIcon={submitting ? <CircularProgress size={14} /> : <Send size={15} />}
              disabled={submitting || !exitValid || reason.trim().length < MIN_REASON}
              onClick={() => void submitCorrection()}
            >
              Send for approval
            </Button>
          </Stack>
        </Stack>
      )}
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}

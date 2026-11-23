import type { WorkMode } from '@gnomon/shared';
import { MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Lock } from 'lucide-react';

import type { useTodayTimecard } from '../lib/timecard';

type Timecard = ReturnType<typeof useTodayTimecard>;

export function formatShiftHours(startTime: string | null, endTime: string | null): string {
  return startTime && endTime ? `${startTime}–${endTime}` : '—';
}

const fieldSx = {
  minWidth: 0,
  '& .MuiInputLabel-root': { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  '& .MuiSelect-select': { py: 1, fontSize: 13, fontWeight: 500 },
};

/**
 * Shift and work-mode choice on the timecard. The shift is fixed at the day's
 * first start. The work mode is chosen for every start, so someone who leaves
 * the office early can stop, then start again from home with Home (WFH).
 */
export function TimecardContextPicker({
  timecard,
  direction = 'row',
}: {
  timecard: Timecard;
  direction?: 'row' | 'column';
}) {
  const busy = !timecard.canWrite || timecard.isLoading || timecard.isUpdating;
  const shiftLocked = timecard.shiftLocked;
  const workModeLocked = timecard.workModeLocked;
  // A locked day may reference a shift that was later deactivated; show its saved name.
  const lockedShiftMissing =
    shiftLocked && !timecard.shifts.some((shift) => shift.id === timecard.shiftId);

  return (
    <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction={direction} sx={{ gap: 1.5, minWidth: 0 }}>
        <Tooltip title={shiftLocked ? 'Set at your first start today' : ''}>
          <TextField
            select
            size="small"
            label="Shift"
            value={lockedShiftMissing ? 'locked' : timecard.shiftId}
            onChange={(event) => timecard.setShiftId(event.target.value)}
            disabled={busy || shiftLocked}
            sx={{ ...fieldSx, flex: 1.4 }}
            slotProps={{
              input: shiftLocked
                ? {
                    endAdornment: (
                      <Typography
                        component="span"
                        sx={{ color: 'var(--g-faint)', display: 'inline-flex', mr: 2.5 }}
                      >
                        <Lock size={13} aria-label="Locked for today" />
                      </Typography>
                    ),
                  }
                : undefined,
            }}
          >
            {lockedShiftMissing && (
              <MenuItem value="locked">{timecard.workContext?.shiftName ?? 'Saved shift'}</MenuItem>
            )}
            {timecard.shifts.map((shift) => (
              <MenuItem key={shift.id} value={shift.id}>
                {shift.name} · {formatShiftHours(shift.startTime, shift.endTime)}
              </MenuItem>
            ))}
          </TextField>
        </Tooltip>
        <TextField
          select
          size="small"
          label="Work mode"
          value={timecard.workMode}
          onChange={(event) => timecard.setWorkMode(event.target.value as WorkMode)}
          disabled={busy || workModeLocked}
          sx={{ ...fieldSx, flex: 1 }}
        >
          <MenuItem value="office">Office (WFO)</MenuItem>
          <MenuItem value="home">Home (WFH)</MenuItem>
        </TextField>
      </Stack>
      {workModeLocked && (
        <Typography sx={{ fontSize: 12, color: 'var(--g-muted)' }}>
          To switch work mode, stop and start again, for example once you reach home.
        </Typography>
      )}
    </Stack>
  );
}

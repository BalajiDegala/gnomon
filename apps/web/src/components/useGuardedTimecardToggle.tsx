import { Typography } from '@mui/material';
import { useState } from 'react';

import type { useTodayTimecard } from '../lib/timecard';
import { ConfirmDialog } from './ConfirmDialog';

type Timecard = ReturnType<typeof useTodayTimecard>;

const leaveTypeLabels: Record<string, string> = {
  casual: 'Casual/Sick leave',
  earned: 'Privilege leave',
  comp_off: 'Compensatory off',
  unpaid: 'Unpaid leave',
};
const dayPartLabels: Record<string, string> = {
  full_day: 'full day',
  first_half: 'first half',
  second_half: 'second half',
};

/**
 * Wraps the timecard start/stop toggle: starting work on a day that already
 * has leave applied asks for confirmation first. Stopping is never blocked.
 */
export function useGuardedTimecardToggle(timecard: Timecard) {
  const [confirming, setConfirming] = useState(false);
  const leave = timecard.timecard?.leave ?? null;
  const starting = !timecard.timecard?.activeSession;

  const onToggle = () => {
    if (starting && leave) setConfirming(true);
    else timecard.toggle();
  };

  const dialog = (
    <ConfirmDialog
      open={confirming && Boolean(leave)}
      title="You have leave today"
      confirmLabel="Start anyway"
      busy={timecard.isUpdating}
      onCancel={() => setConfirming(false)}
      onConfirm={() => {
        setConfirming(false);
        timecard.toggle();
      }}
    >
      {leave && (
        <>
          <Typography sx={{ fontSize: 13.5 }}>
            {leaveTypeLabels[leave.leaveType] ?? 'Leave'} ({dayPartLabels[leave.dayPart]}) is{' '}
            {leave.status === 'approved' ? 'approved' : 'waiting for approval'} for today.
          </Typography>
          <Typography sx={{ fontSize: 13.5 }}>
            Starting the timecard records work on a leave day. If you are working after all,
            consider cancelling the leave or changing it to a half day.
          </Typography>
        </>
      )}
    </ConfirmDialog>
  );

  return { onToggle, dialog };
}

import { Alert, Button } from '@mui/material';
import { ArrowRight } from 'lucide-react';

import { useAttendanceActionItems } from '../lib/attendance-actions';

/** Small pointer to the Catch-up page while missed or short days are waiting. */
export function CatchUpBanner({ onOpen }: { onOpen?: () => void }) {
  const actions = useAttendanceActionItems();
  const count = actions.items.length;
  if (!actions.canRead || !count || !onOpen) return null;
  return (
    <Alert
      severity="warning"
      action={
        <Button color="inherit" size="small" endIcon={<ArrowRight size={14} />} onClick={onOpen}>
          Open Catch-up
        </Button>
      }
    >
      {count} {count === 1 ? 'day needs' : 'days need'} leave or a correction. Sort them out in one
      go on Catch-up.
    </Alert>
  );
}

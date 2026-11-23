import { Stack } from '@mui/material';

import { AttendanceActionPanel } from '../components/AttendanceActionPanel';
import { PageHeader } from '../components/data-view/PageHeader';
import { useAttendanceActionItems } from '../lib/attendance-actions';

/**
 * Catch-up: one place to clear every missed (absent / LOP) or short day by
 * applying leave or sending a correction, several days at once.
 */
export function CatchUpPage() {
  const actions = useAttendanceActionItems();
  const count = actions.items.length;
  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        eyebrow="MISSED & SHORT DAYS"
        title="Catch-up"
        meta={
          count
            ? `${count} ${count === 1 ? 'day needs' : 'days need'} your attention`
            : 'Nothing pending'
        }
      />
      <AttendanceActionPanel />
    </Stack>
  );
}

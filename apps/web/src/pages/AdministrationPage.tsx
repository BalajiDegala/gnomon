import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { ArrowLeft, CalendarCog, UploadCloud } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useAuth } from '../lib/auth';
import { AttendanceImportsPage } from './AttendanceImportsPage';
import { PolicyAdministrationPage } from './PolicyAdministrationPage';

type AdministrationSection = 'imports' | 'leave_policy';

export function AdministrationPage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const canImport = user?.permissions.includes('imports:create') ?? false;
  const canManagePolicy = user?.permissions.includes('policy:manage') ?? false;
  const canManageBalances = user?.permissions.includes('employee:update') ?? false;
  const canSeeLeavePolicy = canManagePolicy || canManageBalances;
  const [section, setSection] = useState<AdministrationSection>(
    canImport ? 'imports' : 'leave_policy',
  );

  useEffect(() => {
    if (section === 'imports' && !canImport && canSeeLeavePolicy) setSection('leave_policy');
    if (section === 'leave_policy' && !canSeeLeavePolicy && canImport) setSection('imports');
  }, [canImport, canSeeLeavePolicy, section]);

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1280, mx: 'auto' }}>
      <Box>
        <Button color="inherit" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
          Back to overview
        </Button>
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          WORKFORCE OPERATIONS
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Administration
        </Typography>
        <Typography sx={{ maxWidth: 780, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Permission-aware operational tools for attendance evidence, leave balances, and
          working-day policy.
        </Typography>
      </Box>

      {canImport && canSeeLeavePolicy && (
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                fullWidth
                variant={section === 'imports' ? 'contained' : 'text'}
                startIcon={<UploadCloud size={16} />}
                onClick={() => setSection('imports')}
              >
                Attendance imports
              </Button>
              <Button
                fullWidth
                variant={section === 'leave_policy' ? 'contained' : 'text'}
                startIcon={<CalendarCog size={16} />}
                onClick={() => setSection('leave_policy')}
              >
                Leave & holidays
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {section === 'imports' && canImport ? (
        <AttendanceImportsPage embedded />
      ) : (
        canSeeLeavePolicy && <PolicyAdministrationPage />
      )}
    </Stack>
  );
}

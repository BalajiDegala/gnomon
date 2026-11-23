import {
  Alert,
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, Clock3, Play, Square } from 'lucide-react';

import { durationDigits, durationLabel, FlipClock } from '../components/FlipClock';
import { CardHeading, Dot, Eyebrow, SoftCard, SoftRow } from '../components/soft';
import { TimecardContextPicker } from '../components/TimecardContextPicker';
import { useGuardedTimecardToggle } from '../components/useGuardedTimecardToggle';
import { formatIndiaTime, useTodayTimecard } from '../lib/timecard';
import { useAuth } from '../lib/auth';
import type { AppView } from '../navigation';
import { AdministrationPage } from './AdministrationPage';
import { ApprovalQueuePage } from './ApprovalQueuePage';
import { CatchUpPage } from './CatchUpPage';
import { AttendanceDetailsPage } from './AttendanceDetailsPage';
import { CalendarPage } from './CalendarPage';
import { LeavePage } from './LeavePage';
import { PeoplePage } from './PeoplePage';
import { RegularisationPage } from './RegularisationPage';
import { ShowManagementPage } from './ShowManagementPage';
import { SystemEventsPage } from './SystemEventsPage';
import { TeamCalendarPage } from './TeamCalendarPage';
import { TeamTimesheetsPage } from './TeamTimesheetsPage';
import { TimesheetsPage } from './TimesheetsPage';

interface ModulePageProps {
  view: Exclude<AppView, 'overview'>;
  onNavigate: (view: AppView) => void;
}

export function ModulePage({ view, onNavigate }: ModulePageProps) {
  const { user } = useAuth();
  if (view === 'timecard') return <TimecardDetailPage onBack={() => onNavigate('overview')} />;
  if (view === 'timesheets') {
    return (
      <TimesheetsPage
        onManageShows={() => onNavigate('shows')}
        canManageShows={user?.permissions.includes('show:manage') ?? false}
      />
    );
  }
  if (view === 'catch-up') return <CatchUpPage />;
  if (view === 'regularisation') {
    return <RegularisationPage onOpenCatchUp={() => onNavigate('catch-up')} />;
  }
  if (view === 'leave') return <LeavePage onOpenCatchUp={() => onNavigate('catch-up')} />;
  if (view === 'calendar') return <CalendarPage />;
  if (view === 'team-calendar') {
    return <TeamCalendarPage onBack={() => onNavigate('overview')} />;
  }
  if (view === 'attendance-details') return <AttendanceDetailsPage />;
  if (view === 'system-events') return <SystemEventsPage />;
  if (view === 'team-timesheets') return <TeamTimesheetsPage />;
  if (view === 'leave-approvals') {
    return <ApprovalQueuePage key="leave" kind="leave" />;
  }
  if (view === 'regularisation-approvals') {
    return <ApprovalQueuePage key="regularisations" kind="regularisations" />;
  }
  if (view === 'shows') return <ShowManagementPage />;
  if (view === 'administration') {
    return <AdministrationPage />;
  }
  if (view === 'people') return <PeoplePage />;
  return null;
}

function PageBackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button color="inherit" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 1.5 }}>
      Back to overview
    </Button>
  );
}

function TimecardDetailPage({ onBack }: { onBack: () => void }) {
  const timecard = useTodayTimecard();
  const guardedToggle = useGuardedTimecardToggle(timecard);
  const completion = Math.min(100, (timecard.trackedSeconds / (9 * 3_600)) * 100);
  const running = Boolean(timecard.timecard?.activeSession);
  const sessions = timecard.timecard?.sessions ?? [];

  return (
    <Stack spacing={3} sx={{ maxWidth: 1120, mx: 'auto' }}>
      <Box>
        <PageBackButton onBack={onBack} />
        <Eyebrow>Personal attendance</Eyebrow>
        <Typography
          component="h1"
          sx={{ mt: 0.5, fontSize: 32, fontWeight: 600, letterSpacing: '-0.03em' }}
        >
          My timecard
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mt: 0.5 }}>
          Website sessions for the active 07:00-to-07:00 workday.
        </Typography>
      </Box>

      {timecard.error && <Alert severity="error">{timecard.error.message}</Alert>}

      <SoftCard>
        <CardHeading
          eyebrow={`Work date ${timecard.timecard?.workDate ?? '—'}`}
          title={running ? 'Your day is in progress' : 'Ready when you are'}
          aside={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <Dot color={running ? 'var(--g-pr)' : 'var(--g-faint)'} />
              {running ? 'Active' : 'Not running'}
            </Box>
          }
        />
        <Box sx={{ overflowX: 'auto' }}>
          <FlipClock
            size="xl"
            digits={timecard.isLoading ? null : durationDigits(timecard.trackedSeconds)}
            label={`Time worked ${durationLabel(timecard.trackedSeconds)}`}
          />
        </Box>
        <Box>
          <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.75 }}>
            <Typography
              sx={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 1.4, color: 'var(--g-muted)' }}
            >
              9-HOUR DAY
            </Typography>
            <Typography sx={{ fontSize: 11.5, fontWeight: 600 }}>
              {Math.round(completion)}%
            </Typography>
          </Stack>
          <LinearProgress variant="determinate" value={completion} aria-label="9-hour day" />
        </Box>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{ gap: 2, alignItems: { md: 'center' }, justifyContent: 'space-between' }}
        >
          <Box sx={{ flex: 1, minWidth: 0, maxWidth: { md: 520 } }}>
            <TimecardContextPicker timecard={timecard} />
          </Box>
          {guardedToggle.dialog}
          <Button
            size="large"
            variant="contained"
            color={running ? 'error' : 'primary'}
            disabled={!timecard.canWrite || timecard.isLoading || timecard.isUpdating}
            onClick={guardedToggle.onToggle}
            startIcon={
              timecard.isUpdating ? (
                <CircularProgress size={15} color="inherit" />
              ) : running ? (
                <Square size={13} fill="currentColor" />
              ) : (
                <Play size={14} fill="currentColor" />
              )
            }
            sx={{ minWidth: 190, py: 1.3 }}
          >
            {timecard.isUpdating ? 'Updating…' : running ? 'Stop workday' : 'Start workday'}
          </Button>
        </Stack>
      </SoftCard>

      <SoftCard>
        <CardHeading
          eyebrow="Session history"
          title="Every start and stop is kept as a separate interval"
        />
        {sessions.length ? (
          <Stack spacing={1.25}>
            {sessions.map((session) => (
              <SoftRow
                key={session.id}
                dot={session.status === 'running' ? 'var(--g-pr)' : 'var(--g-faint)'}
                label={`${formatIndiaTime(session.startedAt)} – ${
                  session.stoppedAt ? formatIndiaTime(session.stoppedAt) : 'now'
                }`}
                detail={[
                  session.shiftName,
                  session.workMode === 'home'
                    ? 'WFH'
                    : session.workMode === 'office'
                      ? 'WFO'
                      : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                value={
                  session.status === 'running' ? 'Running' : `${session.durationMinutes ?? 0} min`
                }
              />
            ))}
          </Stack>
        ) : (
          <EmptyPanel
            icon={Clock3}
            title="No sessions for this work date"
            detail="Use Start workday when you begin."
          />
        )}
      </SoftCard>
    </Stack>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <Box
      sx={{
        minHeight: 180,
        display: 'grid',
        placeItems: 'center',
        textAlign: 'center',
        px: 2,
        borderRadius: '18px',
        boxShadow: 'var(--g-inset-sm)',
        border: '1px dashed var(--g-border)',
      }}
    >
      <Box sx={{ color: 'var(--g-faint)' }}>
        <Icon size={24} />
        <Typography sx={{ mt: 0.75, fontSize: 13.5, fontWeight: 600, color: 'var(--g-fg)' }}>
          {title}
        </Typography>
        <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 12 }}>{detail}</Typography>
      </Box>
    </Box>
  );
}

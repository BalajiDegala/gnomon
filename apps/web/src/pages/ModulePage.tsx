import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileClock,
  Sparkles,
  UserRoundCog,
  UsersRound,
} from 'lucide-react';

import { formatElapsed, formatIndiaTime, useTodayTimecard } from '../lib/timecard';
import { useAuth } from '../lib/auth';
import type { AppView } from '../navigation';
import { AttendanceImportsPage } from './AttendanceImportsPage';
import { ApprovalQueuePage } from './ApprovalQueuePage';
import { CalendarPage } from './CalendarPage';
import { LeavePage } from './LeavePage';
import { RegularisationPage } from './RegularisationPage';
import { ShowManagementPage } from './ShowManagementPage';
import { TimesheetsPage } from './TimesheetsPage';

interface ModulePageProps {
  view: Exclude<AppView, 'overview'>;
  onNavigate: (view: AppView) => void;
}

interface ModuleDefinition {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  capabilities: Array<{ label: string; detail: string; icon: LucideIcon }>;
}

const moduleDefinitions: Record<
  Exclude<
    AppView,
    | 'overview'
    | 'timecard'
    | 'timesheets'
    | 'regularisation'
    | 'leave'
    | 'calendar'
    | 'approvals'
    | 'shows'
    | 'administration'
  >,
  ModuleDefinition
> = {
  people: {
    eyebrow: 'Company structure',
    title: 'People',
    description:
      'Manage employee profiles, departments, reporting relationships, show assignments and scoped access.',
    icon: UsersRound,
    capabilities: [
      {
        label: 'Employee directory',
        detail: 'Active and inactive employee records.',
        icon: UsersRound,
      },
      {
        label: 'Reporting lines',
        detail: 'Assign the responsible Reporting Manager.',
        icon: UserRoundCog,
      },
      { label: 'Show assignments', detail: 'Scope Show Manager access precisely.', icon: Sparkles },
    ],
  },
};

export function ModulePage({ view, onNavigate }: ModulePageProps) {
  const { user } = useAuth();
  if (view === 'timecard') return <TimecardDetailPage onBack={() => onNavigate('overview')} />;
  if (view === 'timesheets') {
    return (
      <TimesheetsPage
        onBack={() => onNavigate('overview')}
        onManageShows={() => onNavigate('shows')}
        canManageShows={user?.permissions.includes('show:manage') ?? false}
      />
    );
  }
  if (view === 'regularisation') {
    return <RegularisationPage onBack={() => onNavigate('overview')} />;
  }
  if (view === 'leave') return <LeavePage onBack={() => onNavigate('overview')} />;
  if (view === 'calendar') return <CalendarPage onBack={() => onNavigate('overview')} />;
  if (view === 'approvals') {
    return <ApprovalQueuePage onBack={() => onNavigate('overview')} />;
  }
  if (view === 'shows') return <ShowManagementPage onBack={() => onNavigate('overview')} />;
  if (view === 'administration') {
    return <AttendanceImportsPage onBack={() => onNavigate('overview')} />;
  }
  return (
    <PlannedModule definition={moduleDefinitions[view]} onBack={() => onNavigate('overview')} />
  );
}

function PageBackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button color="inherit" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
      Back to overview
    </Button>
  );
}

function TimecardDetailPage({ onBack }: { onBack: () => void }) {
  const timecard = useTodayTimecard();
  const completion = Math.min(100, (timecard.trackedSeconds / (9 * 3_600)) * 100);

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 1120, mx: 'auto' }}>
      <Box>
        <PageBackButton onBack={onBack} />
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          PERSONAL ATTENDANCE
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          My timecard
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 13.5, mt: 0.6 }}>
          Website sessions for the active 07:00-to-07:00 workday.
        </Typography>
      </Box>

      {timecard.error && <Alert severity="error">{timecard.error.message}</Alert>}

      <Card
        sx={{
          border: 0,
          color: '#fff',
          background: 'linear-gradient(135deg, #111c30 0%, #0b1423 100%)',
          boxShadow: '0 18px 48px rgba(12,18,32,.16)',
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, gap: 3 }}
          >
            <Box>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2 }}>
                <Chip
                  size="small"
                  label={timecard.timecard?.activeSession ? 'Active' : 'Not running'}
                  color={timecard.timecard?.activeSession ? 'success' : 'default'}
                  sx={{ fontWeight: 750 }}
                />
                <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>
                  Work date {timecard.timecard?.workDate ?? '—'}
                </Typography>
              </Stack>
              <Typography
                sx={{
                  fontSize: { xs: 48, sm: 64 },
                  fontWeight: 850,
                  lineHeight: 1,
                  letterSpacing: '-0.055em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {timecard.isLoading ? '— — : — —' : formatElapsed(timecard.trackedSeconds)}
              </Typography>
              <Box sx={{ width: { xs: '100%', sm: 360 }, mt: 2.5 }}>
                <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography sx={{ color: 'rgba(255,255,255,.48)', fontSize: 11 }}>
                    Daily completion
                  </Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 750 }}>
                    {Math.round(completion)}%
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={completion}
                  sx={{
                    height: 6,
                    borderRadius: 5,
                    bgcolor: 'rgba(255,255,255,.1)',
                    '& .MuiLinearProgress-bar': { bgcolor: '#38ceda', borderRadius: 5 },
                  }}
                />
              </Box>
            </Box>
            <Button
              size="large"
              variant="contained"
              disabled={!timecard.canWrite || timecard.isLoading || timecard.isUpdating}
              onClick={timecard.toggle}
              startIcon={
                timecard.isUpdating ? (
                  <CircularProgress size={16} color="inherit" />
                ) : timecard.timecard?.activeSession ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <Clock3 size={18} />
                )
              }
              sx={{
                minWidth: 210,
                py: 1.35,
                bgcolor: timecard.timecard?.activeSession ? '#df5e63' : '#39ceda',
                color: timecard.timecard?.activeSession ? '#fff' : '#071519',
              }}
            >
              {timecard.isUpdating
                ? 'Updating…'
                : timecard.timecard?.activeSession
                  ? 'Stop workday'
                  : 'Start workday'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ boxShadow: 'none' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Session history</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11.5, mb: 2.25 }}>
            Every start and stop is retained as a separate audited interval.
          </Typography>
          {timecard.timecard?.sessions.length ? (
            <Stack spacing={1}>
              {timecard.timecard.sessions.map((session, index) => (
                <Box
                  key={session.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '32px 1fr auto', sm: '32px 1fr 1fr auto' },
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: index % 2 === 0 ? '#f7f9fb' : '#fff',
                  }}
                >
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: session.status === 'running' ? '#e6f7ef' : '#edf1f5',
                      color: session.status === 'running' ? '#188b5c' : '#687587',
                    }}
                  >
                    <Clock3 size={14} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Started</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                      {formatIndiaTime(session.startedAt)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Stopped</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 750 }}>
                      {formatIndiaTime(session.stoppedAt)}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={
                      session.status === 'running'
                        ? 'Running'
                        : `${session.durationMinutes ?? 0} min`
                    }
                    color={session.status === 'running' ? 'success' : 'default'}
                    variant={session.status === 'running' ? 'filled' : 'outlined'}
                  />
                </Box>
              ))}
            </Stack>
          ) : (
            <EmptyPanel
              icon={Clock3}
              title="No sessions for this work date"
              detail="Use Start workday when you begin."
            />
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

function PlannedModule({
  definition,
  onBack,
}: {
  definition: ModuleDefinition;
  onBack: () => void;
}) {
  const HeroIcon = definition.icon;

  return (
    <Stack spacing={3} sx={{ maxWidth: 1120, mx: 'auto' }}>
      <Box>
        <PageBackButton onBack={onBack} />
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          {definition.eyebrow.toUpperCase()}
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          {definition.title}
        </Typography>
        <Typography sx={{ maxWidth: 720, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          {definition.description}
        </Typography>
      </Box>

      <Card
        sx={{
          border: 0,
          overflow: 'hidden',
          color: '#fff',
          background:
            'radial-gradient(circle at 80% 10%, rgba(56,211,222,.2), transparent 35%), linear-gradient(135deg, #111c30, #0b1423)',
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{ alignItems: { sm: 'center' }, gap: 2.5 }}
          >
            <Box
              sx={{
                width: 58,
                height: 58,
                borderRadius: 3,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(55,207,219,.14)',
                color: '#43d2de',
              }}
            >
              <HeroIcon size={28} />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Chip
                size="small"
                label="MVP delivery queue"
                sx={{ mb: 1.25, color: '#b7f5f8', bgcolor: 'rgba(55,207,219,.12)' }}
              />
              <Typography variant="h5" sx={{ fontWeight: 800 }}>
                Interface prepared for the next workflow
              </Typography>
              <Typography sx={{ mt: 0.5, color: 'rgba(255,255,255,.55)', fontSize: 12.5 }}>
                The navigation, responsive shell and permission-aware entry point are ready. Data
                entry and API workflows will be connected in the next implementation slice.
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 2,
        }}
      >
        {definition.capabilities.map((capability) => {
          const Icon = capability.icon;
          return (
            <Card key={capability.label} sx={{ boxShadow: 'none' }}>
              <CardContent sx={{ p: 2.75 }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2.25,
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: '#eaf7f8',
                    color: '#0f8795',
                    mb: 2,
                  }}
                >
                  <Icon size={19} />
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{capability.label}</Typography>
                <Typography
                  sx={{ mt: 0.6, color: 'text.secondary', fontSize: 12, lineHeight: 1.55 }}
                >
                  {capability.detail}
                </Typography>
              </CardContent>
            </Card>
          );
        })}
      </Box>
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
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 3,
      }}
    >
      <Box>
        <Icon size={25} color="#8491a3" />
        <Typography sx={{ mt: 0.75, fontSize: 13.5, fontWeight: 750 }}>{title}</Typography>
        <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 11.5 }}>{detail}</Typography>
      </Box>
    </Box>
  );
}

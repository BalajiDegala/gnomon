import type { DailyReconciliationDto, ReconciliationAnomaly } from '@gnomon/shared';
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
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileClock,
  Fingerprint,
  MonitorCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { useAuth } from '../lib/auth';
import { formatElapsed, formatIndiaTime, useTodayTimecard } from '../lib/timecard';
import type { AppView } from '../navigation';

interface DashboardPageProps {
  onNavigate: (view: AppView) => void;
}

function getGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Kolkata',
    }).format(new Date()),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const policyItems = [
  { label: 'Standard shift', value: '09:00 – 18:00' },
  { label: 'Required hours', value: '9h 00m' },
  { label: 'Workday boundary', value: '07:00 – 07:00' },
  { label: 'Working week', value: 'Monday – Friday' },
];

const anomalyLabels: Record<ReconciliationAnomaly, string> = {
  missing_biometric_in: 'Missing biometric in',
  missing_biometric_out: 'Missing biometric out',
  missing_access_entry: 'Missing card entry',
  missing_access_exit: 'Missing card exit',
  missing_web_start: 'Missing website start',
  missing_web_stop: 'Missing website stop',
  source_time_mismatch: 'Source times differ',
  insufficient_hours: 'Below nine hours',
  task_outside_web_session: 'Task outside website session',
  task_exceeds_presence: 'Task time exceeds presence',
  unsubmitted_task_time: 'Draft task time remains',
  invalid_event_order: 'Invalid event order',
};

function formatMinutesCompact(minutes: number): string {
  const hours = Math.floor(Math.abs(minutes) / 60);
  const remainder = Math.abs(minutes) % 60;
  return `${hours}h ${String(remainder).padStart(2, '0')}m`;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { user } = useAuth();
  const timecard = useTodayTimecard();
  const firstName = user?.displayName.split(' ')[0] ?? 'there';
  const today = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  const completion = Math.min(100, (timecard.trackedSeconds / (9 * 3_600)) * 100);
  const nextActions = [
    { view: 'timesheets' as const, label: 'Task time entries', icon: FileClock },
    ...(user?.permissions.includes('regularisation:create')
      ? [
          {
            view: 'regularisation' as const,
            label: 'Attendance correction',
            icon: Fingerprint,
          },
        ]
      : []),
    { view: 'leave' as const, label: 'Leave requests', icon: CalendarDays },
    ...(user?.permissions.includes('regularisation:approve')
      ? [{ view: 'approvals' as const, label: 'Manager approvals', icon: ShieldCheck }]
      : []),
  ];

  const biometric = timecard.signals?.biometric;
  const accessCard = timecard.signals?.accessCard;

  const sourceSignals = [
    {
      label: 'Biometric',
      detail: biometric?.eventCount
        ? `${biometric.eventCount} event${biometric.eventCount === 1 ? '' : 's'} · ${formatIndiaTime(biometric.firstEventAt)} – ${formatIndiaTime(biometric.lastEventAt)}`
        : 'Awaiting attendance import',
      icon: Fingerprint,
      tone: '#6d5bd0',
      background: '#f2efff',
      status:
        biometric?.status === 'complete'
          ? 'Complete'
          : biometric?.status === 'incomplete'
            ? 'Needs review'
            : 'Pending source',
    },
    {
      label: 'Access card',
      detail: accessCard?.eventCount
        ? `${accessCard.eventCount} event${accessCard.eventCount === 1 ? '' : 's'} · ${formatIndiaTime(accessCard.firstEventAt)} – ${formatIndiaTime(accessCard.lastEventAt)}`
        : 'Awaiting access-card import',
      icon: CreditCard,
      tone: '#d06f21',
      background: '#fff3e8',
      status:
        accessCard?.status === 'complete'
          ? 'Complete'
          : accessCard?.status === 'incomplete'
            ? 'Needs review'
            : 'Pending source',
    },
    {
      label: 'Website',
      detail: timecard.timecard?.activeSession
        ? `Started ${formatIndiaTime(timecard.timecard.activeSession.startedAt)}`
        : timecard.timecard?.sessions.length
          ? `${timecard.timecard.sessions.length} session${timecard.timecard.sessions.length === 1 ? '' : 's'} recorded`
          : 'No session started',
      icon: MonitorCheck,
      tone: '#0d8b9b',
      background: '#e7f8fa',
      status: timecard.timecard?.activeSession ? 'Tracking' : 'Ready',
    },
  ];

  return (
    <Stack spacing={3.25} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-end' }, gap: 1.5 }}
      >
        <Box>
          <Typography sx={{ color: 'text.secondary', fontSize: 12.5, fontWeight: 650, mb: 0.5 }}>
            {today}
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 850, letterSpacing: '-0.035em' }}>
            {getGreeting()}, {firstName}
          </Typography>
          <Typography sx={{ mt: 0.65, color: 'text.secondary', fontSize: 14 }}>
            Here is your workday across attendance, time and approvals.
          </Typography>
        </Box>
        <Chip
          icon={<ShieldCheck size={15} />}
          label={`${user?.permissions.length ?? 0} active permissions`}
          variant="outlined"
          sx={{ alignSelf: { xs: 'flex-start', sm: 'auto' }, bgcolor: '#fff' }}
        />
      </Stack>

      {(!timecard.canRead || !timecard.canWrite) && (
        <Alert severity="warning">
          Your account needs Employee attendance permissions before it can use the website timecard.
        </Alert>
      )}
      {timecard.error && <Alert severity="error">{timecard.error.message}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(310px, .75fr)' },
          gap: 2.5,
        }}
      >
        <Card
          sx={{
            overflow: 'hidden',
            border: 0,
            color: '#fff',
            background:
              'radial-gradient(circle at 88% 16%, rgba(56,218,227,.22), transparent 34%), linear-gradient(135deg, #101a2d 0%, #0a1220 70%)',
            boxShadow: '0 18px 48px rgba(12,18,32,.16)',
          }}
        >
          <CardContent sx={{ p: { xs: 2.75, sm: 4 } }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ justifyContent: 'space-between', gap: 3 }}
            >
              <Box>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2.5 }}>
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 2,
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: 'rgba(47,208,220,.14)',
                    }}
                  >
                    <Clock3 size={18} color="#47d4df" />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,.58)' }}>
                      Website timecard
                    </Typography>
                    <Typography sx={{ fontSize: 14, fontWeight: 750 }}>
                      {timecard.timecard?.activeSession
                        ? 'Your day is in progress'
                        : 'Ready when you are'}
                    </Typography>
                  </Box>
                </Stack>

                <Typography
                  sx={{
                    fontSize: { xs: 42, sm: 58 },
                    lineHeight: 1,
                    fontWeight: 850,
                    letterSpacing: '-0.055em',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {timecard.isLoading ? '— — : — —' : formatElapsed(timecard.trackedSeconds)}
                </Typography>
                <Typography sx={{ mt: 1, color: 'rgba(255,255,255,.5)', fontSize: 12.5 }}>
                  Tracked for work date {timecard.timecard?.workDate ?? '—'}
                </Typography>
              </Box>

              <Stack sx={{ minWidth: { sm: 205 }, justifyContent: 'space-between', gap: 3 }}>
                <Box>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                      9-hour completion
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
                      borderRadius: 4,
                      bgcolor: 'rgba(255,255,255,.1)',
                      '& .MuiLinearProgress-bar': { bgcolor: '#3cd3df', borderRadius: 4 },
                    }}
                  />
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
                      <Sparkles size={18} />
                    )
                  }
                  sx={{
                    py: 1.25,
                    bgcolor: timecard.timecard?.activeSession ? '#e05e62' : '#37cbd7',
                    color: timecard.timecard?.activeSession ? '#fff' : '#07151a',
                    boxShadow: 'none',
                    '&:hover': {
                      bgcolor: timecard.timecard?.activeSession ? '#c8494d' : '#54d9e2',
                      boxShadow: 'none',
                    },
                  }}
                >
                  {timecard.isUpdating
                    ? 'Updating…'
                    : timecard.timecard?.activeSession
                      ? 'Stop workday'
                      : timecard.timecard?.state === 'completed'
                        ? 'Start another session'
                        : 'Start workday'}
                </Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Today’s policy</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11.5, mt: 0.25 }}>
                  Asia/Kolkata schedule
                </Typography>
              </Box>
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: 2,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: '#eef7f8',
                  color: '#117f8c',
                }}
              >
                <CalendarDays size={17} />
              </Box>
            </Stack>
            <Stack sx={{ mt: 2.25 }} divider={<DividerLine />}>
              {policyItems.map((item) => (
                <Stack
                  key={item.label}
                  direction="row"
                  sx={{ py: 1.45, alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Typography sx={{ color: 'text.secondary', fontSize: 12.5 }}>
                    {item.label}
                  </Typography>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 750 }}>{item.value}</Typography>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>

      <Box>
        <Stack
          direction="row"
          sx={{ alignItems: 'flex-end', justifyContent: 'space-between', mb: 1.5 }}
        >
          <Box>
            <Typography sx={{ fontSize: 16, fontWeight: 800 }}>Attendance signals</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>
              Independent sources reconciled into one attendance day.
            </Typography>
          </Box>
        </Stack>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {sourceSignals.map((signal) => {
            const Icon = signal.icon;
            return (
              <Card key={signal.label} sx={{ boxShadow: 'none' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1.75 }}>
                    <Box
                      sx={{
                        width: 42,
                        height: 42,
                        flex: '0 0 auto',
                        borderRadius: 2.25,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: signal.background,
                        color: signal.tone,
                      }}
                    >
                      <Icon size={20} />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack
                        direction="row"
                        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <Typography sx={{ fontSize: 13.5, fontWeight: 780 }}>
                          {signal.label}
                        </Typography>
                        <Typography sx={{ color: signal.tone, fontSize: 10.5, fontWeight: 750 }}>
                          {signal.status}
                        </Typography>
                      </Stack>
                      <Typography noWrap sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11.5 }}>
                        {signal.detail}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </Box>

      <ReconciliationCard reconciliation={timecard.reconciliation} />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.15fr) minmax(330px, .85fr)' },
          gap: 2.5,
        }}
      >
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: 3 }}>
            <Stack
              direction="row"
              sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2.25 }}
            >
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Website sessions</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                  Start and stop activity for the current work date
                </Typography>
              </Box>
              <Button
                size="small"
                endIcon={<ArrowUpRight size={15} />}
                onClick={() => onNavigate('timecard')}
              >
                View details
              </Button>
            </Stack>
            {timecard.timecard?.sessions.length ? (
              <Stack spacing={1}>
                {timecard.timecard.sessions
                  .slice(-3)
                  .reverse()
                  .map((session, index) => (
                    <Stack
                      key={session.id}
                      direction="row"
                      sx={{
                        alignItems: 'center',
                        gap: 1.5,
                        px: 1.5,
                        py: 1.25,
                        borderRadius: 2,
                        bgcolor: index === 0 ? '#f5fafb' : 'transparent',
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          bgcolor: session.status === 'running' ? '#25ae73' : '#9ba6b5',
                          boxShadow:
                            session.status === 'running'
                              ? '0 0 0 4px rgba(37,174,115,.12)'
                              : 'none',
                        }}
                      />
                      <Typography sx={{ minWidth: 72, fontSize: 12.5, fontWeight: 750 }}>
                        {formatIndiaTime(session.startedAt)}
                      </Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: 12 }}>
                        to {formatIndiaTime(session.stoppedAt)}
                      </Typography>
                      <Chip
                        size="small"
                        label={
                          session.status === 'running'
                            ? 'Active'
                            : `${session.durationMinutes ?? 0} min`
                        }
                        color={session.status === 'running' ? 'success' : 'default'}
                        variant={session.status === 'running' ? 'filled' : 'outlined'}
                        sx={{ ml: 'auto', height: 24, fontSize: 10.5 }}
                      />
                    </Stack>
                  ))}
              </Stack>
            ) : (
              <Box
                sx={{
                  minHeight: 126,
                  display: 'grid',
                  placeItems: 'center',
                  textAlign: 'center',
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 2.5,
                }}
              >
                <Box>
                  <Clock3 size={22} color="#8a96a8" />
                  <Typography sx={{ mt: 0.5, fontSize: 12.5, fontWeight: 700 }}>
                    No website sessions yet
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                    Start your workday to create the first session.
                  </Typography>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>

        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: 3 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Quick access</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 11.5, mb: 2 }}>
              Continue into time, attendance, leave, or manager work
            </Typography>
            <Stack spacing={1}>
              {nextActions.map((item) => {
                const Icon = item.icon;
                return (
                  <Button
                    key={item.view}
                    color="inherit"
                    onClick={() => onNavigate(item.view)}
                    sx={{
                      justifyContent: 'flex-start',
                      py: 1.15,
                      px: 1.25,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: '#fff',
                    }}
                  >
                    <Icon size={17} />
                    <Typography
                      sx={{ ml: 1.25, flex: 1, textAlign: 'left', fontSize: 12.5, fontWeight: 700 }}
                    >
                      {item.label}
                    </Typography>
                    <ArrowUpRight size={14} color="#8b96a5" />
                  </Button>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}

function DividerLine() {
  return <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />;
}

function ReconciliationCard({
  reconciliation,
}: {
  reconciliation: DailyReconciliationDto | undefined;
}) {
  const statusColor =
    reconciliation?.calculated.status === 'present'
      ? 'success'
      : reconciliation?.calculated.status === 'absent'
        ? 'error'
        : reconciliation?.calculated.status === 'weekend'
          ? 'info'
          : 'warning';
  const sourceLabel =
    reconciliation?.calculated.primarySource === 'access_card'
      ? 'Access card'
      : reconciliation?.calculated.primarySource === 'website'
        ? 'Website'
        : reconciliation?.calculated.primarySource === 'biometric'
          ? 'Biometric'
          : 'Awaiting evidence';
  const completion = reconciliation
    ? Math.min(
        100,
        (reconciliation.calculated.grossMinutes / reconciliation.calculated.requiredMinutes) * 100,
      )
    : 0;

  return (
    <Card sx={{ boxShadow: 'none', overflow: 'hidden' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1.5 }}
        >
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 2.25,
                bgcolor: '#edf7f8',
                color: '#117f8c',
              }}
            >
              <ShieldCheck size={19} />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15.5, fontWeight: 820 }}>Daily reconciliation</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                {reconciliation
                  ? `Work date ${reconciliation.workDate} · ${reconciliation.calculated.workdayClosed ? 'window closed' : 'live calculation'}`
                  : 'Calculating attendance evidence…'}
              </Typography>
            </Box>
          </Stack>
          {reconciliation && (
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              {reconciliation.calculated.provisional && (
                <Chip size="small" label="Provisional" variant="outlined" />
              )}
              <Chip
                size="small"
                color={statusColor}
                label={reconciliation.calculated.status.replaceAll('_', ' ')}
                sx={{ textTransform: 'capitalize', fontWeight: 750 }}
              />
            </Stack>
          )}
        </Stack>

        {reconciliation && (
          <>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(5, minmax(0, 1fr))',
                },
                gap: 1,
                mt: 2.5,
              }}
            >
              <ReconciliationMetric label="Primary source" value={sourceLabel} />
              <ReconciliationMetric
                label="Biometric"
                value={formatMinutesCompact(reconciliation.sourceSummary.biometric.workedMinutes)}
              />
              <ReconciliationMetric
                label="Access card"
                value={formatMinutesCompact(reconciliation.sourceSummary.accessCard.workedMinutes)}
              />
              <ReconciliationMetric
                label="Website"
                value={formatMinutesCompact(reconciliation.sourceSummary.website.workedMinutes)}
              />
              <ReconciliationMetric
                label="Task entries"
                value={formatMinutesCompact(reconciliation.sourceSummary.taskEntries.totalMinutes)}
              />
            </Box>

            <Box sx={{ mt: 2.5 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.8 }}>
                <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                  Calculated presence ·{' '}
                  {formatMinutesCompact(reconciliation.calculated.grossMinutes)}
                  {' / '}
                  {formatMinutesCompact(reconciliation.calculated.requiredMinutes)}
                </Typography>
                <Typography
                  sx={{
                    color:
                      reconciliation.calculated.differenceMinutes >= 0
                        ? 'success.main'
                        : 'text.secondary',
                    fontSize: 11.5,
                    fontWeight: 750,
                  }}
                >
                  {reconciliation.calculated.differenceMinutes >= 0 ? '+' : '−'}
                  {formatMinutesCompact(reconciliation.calculated.differenceMinutes)}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={completion}
                color={
                  reconciliation.calculated.status === 'present' &&
                  !reconciliation.calculated.requiresReview
                    ? 'success'
                    : reconciliation.calculated.status === 'absent'
                      ? 'error'
                      : 'warning'
                }
                sx={{ height: 7, borderRadius: 5 }}
              />
            </Box>

            {reconciliation.calculated.anomalies.length ? (
              <Box sx={{ mt: 2.25 }}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, mb: 1 }}>
                  <AlertTriangle size={15} color="#c17424" />
                  <Typography sx={{ color: '#945719', fontSize: 11.5, fontWeight: 800 }}>
                    Evidence requiring review
                  </Typography>
                </Stack>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {reconciliation.calculated.anomalies.map((anomaly) => (
                    <Chip
                      key={anomaly}
                      size="small"
                      color="warning"
                      variant="outlined"
                      label={anomalyLabels[anomaly]}
                    />
                  ))}
                </Stack>
              </Box>
            ) : reconciliation.calculated.primarySource === 'none' ? (
              <Alert severity="info" sx={{ mt: 2.25 }}>
                Awaiting the first attendance signal for this work date.
              </Alert>
            ) : (
              <Alert severity="success" sx={{ mt: 2.25 }}>
                Available evidence is aligned; no discrepancy has been detected.
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReconciliationMetric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f6f8fa', minWidth: 0 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{label}</Typography>
      <Typography noWrap sx={{ mt: 0.3, fontSize: 13, fontWeight: 800 }}>
        {value}
      </Typography>
    </Box>
  );
}

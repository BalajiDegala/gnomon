import {
  attendanceStatusLabels,
  type DailyReconciliationDto,
  type ReconciliationAnomaly,
} from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { ArrowUpRight, Play, Square } from 'lucide-react';

import { durationDigits, durationLabel, FlipClock } from '../components/FlipClock';
import { CardHeading, Dot, SoftCard, SoftRow, statusDotColor } from '../components/soft';
import { formatShiftHours, TimecardContextPicker } from '../components/TimecardContextPicker';
import { useAuth } from '../lib/auth';
import { useGuardedTimecardToggle } from '../components/useGuardedTimecardToggle';
import { formatIndiaTime, useTodayTimecard } from '../lib/timecard';
import {
  CALIFORNIA_ZONE,
  formatGap,
  INDIA_ZONE,
  indiaWorkDate,
  isoWeekNumber,
  useNow,
  zoneTime,
} from '../lib/world-time';
import type { AppView } from '../navigation';

interface DashboardPageProps {
  onNavigate: (view: AppView) => void;
}

const REQUIRED_SECONDS = 9 * 3_600;

const anomalyLabels: Record<ReconciliationAnomaly, string> = {
  missing_biometric_in: 'Missing biometric in',
  missing_biometric_out: 'Missing biometric out',
  missing_access_entry: 'Missing card entry',
  missing_access_exit: 'Missing card exit',
  missing_web_start: 'Missing website start',
  missing_web_stop: 'Missing website stop',
  source_time_mismatch: 'Source times differ',
  insufficient_hours: 'Below nine hours',
  show_time_outside_web_session: 'Show time outside website session',
  show_time_exceeds_presence: 'Show time exceeds presence',
  invalid_event_order: 'Invalid event order',
};

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatMinutesCompact(minutes: number): string {
  const absolute = Math.abs(minutes);
  return `${Math.floor(absolute / 60)}h ${String(absolute % 60).padStart(2, '0')}m`;
}

function longDate(workDate: string) {
  const date = new Date(`${workDate}T00:00:00.000Z`);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...options }).format(date);
  return {
    day: workDate.slice(8, 10),
    monthYear: format({ month: 'long', year: 'numeric' }),
    weekday: format({ weekday: 'long' }),
  };
}

function clockLabel(prefix: string, hour: number, minute: number): string {
  return `${prefix} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { user } = useAuth();
  const timecard = useTodayTimecard();
  const guardedToggle = useGuardedTimecardToggle(timecard);
  const now = useNow(1_000);
  const india = zoneTime(INDIA_ZONE, now);
  const california = zoneTime(CALIFORNIA_ZONE, now);
  const firstName = user?.displayName.split(' ')[0] ?? 'there';
  const workDate = timecard.timecard?.workDate ?? indiaWorkDate(now);
  const date = longDate(workDate);
  const completion = Math.min(100, (timecard.trackedSeconds / REQUIRED_SECONDS) * 100);
  const running = Boolean(timecard.timecard?.activeSession);
  const sessions = timecard.timecard?.sessions ?? [];
  const context = timecard.workContext;
  const strong = { color: 'var(--g-fg)', fontWeight: 600 } as const;

  const runningAside = timecard.timecard?.activeSession ? (
    <>
      Running since{' '}
      <Box component="b" sx={strong}>
        {formatIndiaTime(timecard.timecard.activeSession.startedAt)} IST
      </Box>
    </>
  ) : sessions.length ? (
    `Stopped · ${sessions.length} session${sessions.length === 1 ? '' : 's'} today`
  ) : (
    'Not started yet'
  );

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}
      >
        <Typography
          component="h1"
          sx={{ fontSize: { xs: 28, md: 36 }, fontWeight: 600, letterSpacing: '-0.03em' }}
        >
          {greeting(india.hour)}, {firstName}
        </Typography>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.75,
            borderRadius: '999px',
            boxShadow: 'var(--g-raised-sm)',
            border: '1px solid var(--g-border)',
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          <Dot color="var(--g-pr)" />
          Live · Hyderabad
        </Box>
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
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        {/* Time worked */}
        <SoftCard sx={{ gridColumn: { lg: 'span 2' } }}>
          <CardHeading eyebrow="Time worked today" title="Website timecard" aside={runningAside} />
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
                sx={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: 1.4,
                  color: 'var(--g-muted)',
                }}
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
              {timecard.isUpdating
                ? 'Updating…'
                : running
                  ? 'Stop workday'
                  : sessions.length
                    ? 'Start another session'
                    : 'Start workday'}
            </Button>
          </Stack>
        </SoftCard>

        {/* Work date */}
        <SoftCard>
          <CardHeading eyebrow="Work date" title="Today in India" aside="Day runs 07:00–07:00" />
          <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <FlipClock
              size="date"
              groups={[2]}
              digits={date.day}
              label={`${date.weekday} ${Number(date.day)} ${date.monthYear}`}
            />
            <Box>
              <Typography
                sx={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.1 }}
              >
                {date.monthYear}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: 'var(--g-muted)' }}>
                {date.weekday} · Week {isoWeekNumber(workDate)}
              </Typography>
            </Box>
          </Stack>
          {context?.shiftName && (
            <Typography sx={{ fontSize: 12.5, color: 'var(--g-muted)' }}>
              Shift{' '}
              <Box component="b" sx={strong}>
                {context.shiftName} {formatShiftHours(context.shiftStartTime, context.shiftEndTime)}
              </Box>
              {context.workModes.length > 0 &&
                ` · ${context.workModes.map((mode) => (mode === 'home' ? 'WFH' : 'WFO')).join(' → ')}`}
            </Typography>
          )}
        </SoftCard>

        {/* India */}
        <SoftCard sx={{ alignContent: 'space-between' }}>
          <CardHeading eyebrow="India" title="Hyderabad" aside={india.abbreviation} />
          <FlipClock
            digits={india.digits}
            label={clockLabel('India time', india.hour, india.minute)}
          />
          <Typography sx={{ fontSize: 12, color: 'var(--g-muted)' }}>UTC +5:30</Typography>
        </SoftCard>

        {/* California */}
        <SoftCard sx={{ alignContent: 'space-between' }}>
          <CardHeading eyebrow="California" title="Los Angeles" aside={california.abbreviation} />
          <FlipClock
            digits={california.digits}
            label={clockLabel('California time', california.hour, california.minute)}
          />
          <Typography sx={{ fontSize: 12, color: 'var(--g-muted)' }}>
            {formatGap(india.offsetMinutes - california.offsetMinutes)} behind India ·{' '}
            {california.weekday}
          </Typography>
        </SoftCard>

        <TodayAttendanceCard timecard={timecard} onNavigate={onNavigate} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(0, 1fr)' },
        }}
      >
        <ReconciliationCard reconciliation={timecard.reconciliation} />
        <SoftCard>
          <CardHeading
            eyebrow="Website sessions"
            title="Start and stop history"
            aside={
              <Button
                size="small"
                endIcon={<ArrowUpRight size={14} />}
                onClick={() => onNavigate('timecard')}
              >
                My timecard
              </Button>
            }
          />
          {sessions.length ? (
            <Stack spacing={1.25}>
              {sessions
                .slice()
                .reverse()
                .map((session) => (
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
                      session.status === 'running'
                        ? 'Running'
                        : `${session.durationMinutes ?? 0} min`
                    }
                  />
                ))}
            </Stack>
          ) : (
            <Box
              sx={{
                py: 4,
                px: 2,
                textAlign: 'center',
                borderRadius: '16px',
                boxShadow: 'var(--g-inset-sm)',
                border: '1px dashed var(--g-border)',
                color: 'var(--g-muted)',
                fontSize: 13,
              }}
            >
              No sessions yet. Start your workday to record the first one.
            </Box>
          )}
        </SoftCard>
      </Box>
    </Stack>
  );
}

function TodayAttendanceCard({
  timecard,
  onNavigate,
}: {
  timecard: ReturnType<typeof useTodayTimecard>;
  onNavigate: (view: AppView) => void;
}) {
  const reconciliation = timecard.reconciliation;
  const biometric = timecard.signals?.biometric;
  const accessCard = timecard.signals?.accessCard;
  const status = reconciliation?.calculated.status;
  const sourceStatus = (value: string | undefined) =>
    value === 'complete' ? 'Complete' : value === 'incomplete' ? 'Needs review' : 'Waiting';
  const sourceDot = (value: string | undefined) =>
    value === 'complete'
      ? 'var(--g-pr)'
      : value === 'incomplete'
        ? 'var(--g-pt)'
        : 'var(--g-faint)';
  const range = (first: string | null | undefined, last: string | null | undefined) =>
    first ? `${formatIndiaTime(first)} – ${formatIndiaTime(last ?? null)}` : 'No events yet';
  const active = timecard.timecard?.activeSession;
  const sessionCount = timecard.timecard?.sessions.length ?? 0;

  return (
    <SoftCard>
      <CardHeading
        eyebrow="My attendance today"
        title={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            {status && <Dot color={statusDotColor[status]} size={9} />}
            {status ? attendanceStatusLabels[status] : 'Calculating…'}
          </Box>
        }
        aside={
          <Button size="small" onClick={() => onNavigate('calendar')}>
            Calendar
          </Button>
        }
      />
      <Stack spacing={1.25}>
        <SoftRow
          dot={sourceDot(biometric?.status)}
          label="Biometric"
          detail={range(biometric?.firstEventAt, biometric?.lastEventAt)}
          value={sourceStatus(biometric?.status)}
        />
        <SoftRow
          dot={sourceDot(accessCard?.status)}
          label="Access card"
          detail={range(accessCard?.firstEventAt, accessCard?.lastEventAt)}
          value={sourceStatus(accessCard?.status)}
        />
        <SoftRow
          dot={active ? 'var(--g-pr)' : 'var(--g-faint)'}
          label="Website timecard"
          detail={
            active
              ? `Started ${formatIndiaTime(active.startedAt)}`
              : sessionCount
                ? `${sessionCount} session${sessionCount === 1 ? '' : 's'} recorded`
                : 'Not started'
          }
          value={active ? 'Tracking' : 'Ready'}
        />
      </Stack>
    </SoftCard>
  );
}

function ReconciliationCard({
  reconciliation,
}: {
  reconciliation: DailyReconciliationDto | undefined;
}) {
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
    <SoftCard>
      <CardHeading
        eyebrow="Daily reconciliation"
        title={
          reconciliation
            ? `Work date ${reconciliation.workDate}`
            : 'Calculating attendance evidence…'
        }
        aside={
          reconciliation && (
            <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
              {reconciliation.calculated.provisional && (
                <Chip size="small" variant="outlined" label="Provisional" />
              )}
              <Box
                component="span"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
              >
                <Dot color={statusDotColor[reconciliation.calculated.status]} />
                <Typography
                  component="span"
                  sx={{ fontSize: 12.5, fontWeight: 600, color: 'var(--g-fg)' }}
                >
                  {attendanceStatusLabels[reconciliation.calculated.status]}
                </Typography>
              </Box>
            </Stack>
          )
        }
      />
      {reconciliation && (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(5, minmax(0, 1fr))',
              },
              gap: 1.5,
            }}
          >
            <Metric label="Primary source" value={sourceLabel} />
            <Metric
              label="Biometric"
              value={formatMinutesCompact(reconciliation.sourceSummary.biometric.workedMinutes)}
            />
            <Metric
              label="Access card"
              value={formatMinutesCompact(reconciliation.sourceSummary.accessCard.workedMinutes)}
            />
            <Metric
              label="Website"
              value={formatMinutesCompact(reconciliation.sourceSummary.website.workedMinutes)}
            />
            <Metric
              label="Show entries"
              value={formatMinutesCompact(reconciliation.sourceSummary.showEntries.totalMinutes)}
            />
          </Box>
          <Box>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.75 }}>
              <Typography sx={{ color: 'var(--g-muted)', fontSize: 12 }}>
                Calculated presence {formatMinutesCompact(reconciliation.calculated.grossMinutes)}{' '}
                of {formatMinutesCompact(reconciliation.calculated.requiredMinutes)}
              </Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
                {reconciliation.calculated.differenceMinutes >= 0 ? '+' : '−'}
                {formatMinutesCompact(reconciliation.calculated.differenceMinutes)}
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={completion} aria-label="Presence" />
          </Box>
          {reconciliation.calculated.anomalies.length ? (
            <Box>
              <Typography
                sx={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  letterSpacing: 1.4,
                  color: 'var(--g-muted)',
                  mb: 1,
                }}
              >
                NEEDS REVIEW
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {reconciliation.calculated.anomalies.map((anomaly) => (
                  <Box
                    key={anomaly}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1.25,
                      py: 0.5,
                      borderRadius: '10px',
                      boxShadow: 'var(--g-raised-sm)',
                      border: '1px solid var(--g-border)',
                      fontSize: 12,
                    }}
                  >
                    <Dot color="var(--g-pt)" />
                    {anomalyLabels[anomaly]}
                  </Box>
                ))}
              </Stack>
            </Box>
          ) : (
            <Typography sx={{ fontSize: 12.5, color: 'var(--g-muted)' }}>
              {reconciliation.calculated.primarySource === 'none'
                ? 'Waiting for the first attendance signal for this work date.'
                : 'Available evidence is aligned; nothing needs review.'}
            </Typography>
          )}
        </>
      )}
    </SoftCard>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: '14px',
        boxShadow: 'var(--g-inset-sm)',
        border: '1px solid var(--g-border)',
        minWidth: 0,
      }}
    >
      <Typography sx={{ fontSize: 11.5, color: 'var(--g-muted)' }}>{label}</Typography>
      <Typography noWrap sx={{ mt: 0.25, fontSize: 14, fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

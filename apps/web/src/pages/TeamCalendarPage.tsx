import type { ManagedCalendarDayDto, ManagedCalendarMemberDto } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { ArrowLeft, ChevronLeft, ChevronRight, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';

import { currentIndiaMonth, useManagedCalendar } from '../lib/calendar';
import { parseYearMonth, useUrlQueryState } from '../lib/url-query-state';
import { MonthPicker } from '../components/data-view/MonthPicker';

interface TeamCalendarPageProps {
  onBack: () => void;
}

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pageSize = 25;

function parsePage(value: string): number | null {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

const availabilityTones = {
  available: { background: '#e6f7ef', color: '#19764d', short: 'A', label: 'Available' },
  partial: { background: '#fff4df', color: '#a86616', short: 'P', label: 'Partial day' },
  unavailable: { background: '#fdebec', color: '#b43f48', short: 'U', label: 'Unavailable' },
  pending: { background: '#fff0dc', color: '#a35d0d', short: '?', label: 'Pending' },
  no_record: { background: '#f1f3f6', color: '#697587', short: '—', label: 'No record' },
  non_working: { background: '#f1edff', color: '#6852a8', short: 'Off', label: 'Non-working' },
  not_assigned: {
    background: '#f7f8fa',
    color: '#a2a9b3',
    short: '·',
    label: 'Not assigned',
  },
} as const;

function moveMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function dayDetail(day: ManagedCalendarDayDto): string {
  if (day.holiday) return `${day.holiday.name} · Holiday`;
  if (day.leave) {
    const part = day.leave.dayPart === 'full_day' ? 'Full day' : 'Half day';
    return `${day.leave.status === 'approved' ? 'Approved' : 'Pending'} leave · ${part}`;
  }
  if (day.attendanceStatus) return day.attendanceStatus.replaceAll('_', ' ');
  return availabilityTones[day.availability].label;
}

function AvailabilityCell({
  day,
  compact = false,
}: {
  day: ManagedCalendarDayDto;
  compact?: boolean;
}) {
  const tone = availabilityTones[day.availability];
  return (
    <Tooltip title={dayDetail(day)} arrow>
      <Box
        aria-label={`${day.date}: ${dayDetail(day)}`}
        sx={{
          minWidth: compact ? 0 : 34,
          height: compact ? 42 : 34,
          display: 'grid',
          placeItems: 'center',
          borderRadius: 1.25,
          bgcolor: tone.background,
          color: tone.color,
          fontSize: compact ? 10 : 9.5,
          fontWeight: 850,
        }}
      >
        {tone.short}
      </Box>
    </Tooltip>
  );
}

function MobileMemberCalendar({ member }: { member: ManagedCalendarMemberDto }) {
  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: 2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 820 }}>{member.displayName}</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 10.5, mb: 1.5 }}>
          {member.employeeCode}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.55 }}>
          {member.days.map((day) => (
            <Box key={day.date} sx={{ minWidth: 0, textAlign: 'center' }}>
              <Typography sx={{ color: 'text.secondary', fontSize: 8, mb: 0.35 }}>
                {weekdayLabels[day.weekday - 1]?.slice(0, 1)} {Number(day.date.slice(-2))}
              </Typography>
              <AvailabilityCell day={day} compact />
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

export function TeamCalendarPage({ onBack }: TeamCalendarPageProps) {
  const defaultMonth = useMemo(currentIndiaMonth, []);
  const [month, setMonth] = useUrlQueryState('month', defaultMonth, parseYearMonth);
  const [page, setPage] = useUrlQueryState('page', 1, parsePage);
  const selectedLatestRecordedMonth = useRef(false);
  const managed = useManagedCalendar(month, page, pageSize);
  const calendar = managed.calendar;
  const allDays = calendar?.members.flatMap((member) => member.days) ?? [];
  const unavailableDays = allDays.filter((day) => day.availability === 'unavailable').length;
  const partialDays = allDays.filter((day) => day.availability === 'partial').length;
  const pendingDays = allDays.filter((day) => day.availability === 'pending').length;
  const headerDays = calendar?.members[0]?.days ?? [];
  const selectMonth = (value: string) => {
    setMonth(value);
    setPage(1);
  };

  useEffect(() => {
    if (
      selectedLatestRecordedMonth.current ||
      month !== defaultMonth ||
      !calendar?.latestRecordedMonth ||
      calendar.latestRecordedMonth === month ||
      calendar.members.some((member) => member.days.some((day) => day.attendanceStatus !== null))
    ) {
      return;
    }
    selectedLatestRecordedMonth.current = true;
    selectMonth(calendar.latestRecordedMonth);
  }, [calendar, defaultMonth, month]);

  useEffect(() => {
    if (calendar?.totalPages && page > calendar.totalPages) setPage(calendar.totalPages);
  }, [calendar?.totalPages, page, setPage]);

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1500, mx: 'auto' }}>
      <Box>
        <Button color="inherit" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
          Back to overview
        </Button>
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          WORKFORCE AVAILABILITY
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Team calendar
        </Typography>
        <Typography sx={{ maxWidth: 820, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Direct-report availability across attendance and leave. Leave reasons are never included
          in this view.
        </Typography>
      </Box>

      {!managed.canRead && (
        <Alert severity="warning">Your account cannot read team attendance.</Alert>
      )}
      {managed.error && <Alert severity="error">{managed.error.message}</Alert>}
      {calendar?.latestRecordedMonth &&
        month === calendar.latestRecordedMonth &&
        month !== defaultMonth && (
          <Alert severity="info">
            The current month has no attendance records, so the latest recorded month is shown.
          </Alert>
        )}

      <Card sx={{ boxShadow: 'none' }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            sx={{ justifyContent: 'space-between', alignItems: { lg: 'center' }, gap: 2 }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
              <Button
                aria-label="Previous month"
                color="inherit"
                onClick={() => selectMonth(moveMonth(month, -1))}
                sx={{ minWidth: 38, px: 0.75 }}
              >
                <ChevronLeft size={18} />
              </Button>
              <Box sx={{ minWidth: { sm: 180 }, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 17, fontWeight: 850 }}>{monthLabel(month)}</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                  Asia/Kolkata
                </Typography>
              </Box>
              <Button
                aria-label="Next month"
                color="inherit"
                onClick={() => selectMonth(moveMonth(month, 1))}
                sx={{ minWidth: 38, px: 0.75 }}
              >
                <ChevronRight size={18} />
              </Button>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.25 }}>
              <MonthPicker label="Calendar month" value={month} onChange={selectMonth} />
            </Stack>
          </Stack>

          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 2.5 }}>
            <Chip
              icon={<UsersRound size={14} />}
              size="small"
              label={`${calendar?.totalMembers ?? 0} people`}
              variant="outlined"
            />
            <Chip
              size="small"
              label={`${unavailableDays} unavailable on page`}
              sx={{
                bgcolor: availabilityTones.unavailable.background,
                color: availabilityTones.unavailable.color,
              }}
            />
            <Chip
              size="small"
              label={`${partialDays} partial on page`}
              sx={{
                bgcolor: availabilityTones.partial.background,
                color: availabilityTones.partial.color,
              }}
            />
            <Chip
              size="small"
              label={`${pendingDays} pending on page`}
              sx={{
                bgcolor: availabilityTones.pending.background,
                color: availabilityTones.pending.color,
              }}
            />
          </Stack>
        </CardContent>
      </Card>

      {managed.isLoading ? (
        <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={28} />
        </Box>
      ) : !calendar?.selectedAudience ? (
        <Alert severity="info">No team calendar scope is configured.</Alert>
      ) : calendar.members.length === 0 ? (
        <Alert severity="info">
          No active employees are available in {calendar.selectedAudience.label} for this month.
        </Alert>
      ) : (
        <>
          <TableContainer
            component={Card}
            sx={{ display: { xs: 'none', md: 'block' }, boxShadow: 'none', maxWidth: '100%' }}
          >
            <Table size="small" aria-label="Monthly team availability" sx={{ minWidth: 1320 }}>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 3,
                      minWidth: 190,
                      bgcolor: '#fff',
                      fontWeight: 800,
                    }}
                  >
                    Employee
                  </TableCell>
                  {headerDays.map((day) => (
                    <TableCell
                      key={day.date}
                      align="center"
                      sx={{
                        minWidth: 40,
                        px: 0.4,
                        bgcolor: day.weekday > 5 ? '#f6f4fb' : '#fafbfc',
                      }}
                    >
                      <Typography sx={{ color: 'text.secondary', fontSize: 8 }}>
                        {weekdayLabels[day.weekday - 1]?.slice(0, 1)}
                      </Typography>
                      <Typography sx={{ fontSize: 10.5, fontWeight: 820 }}>
                        {Number(day.date.slice(-2))}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {calendar.members.map((member) => (
                  <TableRow key={member.employeeId} hover>
                    <TableCell sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: '#fff' }}>
                      <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 780 }}>
                        {member.displayName}
                      </Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: 9.5 }}>
                        {member.employeeCode}
                      </Typography>
                    </TableCell>
                    {member.days.map((day) => (
                      <TableCell key={day.date} align="center" sx={{ p: 0.4 }}>
                        <AvailabilityCell day={day} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' } }}>
            {calendar.members.map((member) => (
              <MobileMemberCalendar key={member.employeeId} member={member} />
            ))}
          </Stack>
          <TablePagination
            component="div"
            count={calendar.totalMembers}
            page={calendar.page - 1}
            rowsPerPage={calendar.pageSize}
            rowsPerPageOptions={[calendar.pageSize]}
            onPageChange={(_event, nextPage) => setPage(nextPage + 1)}
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} of ${count} people`}
          />
        </>
      )}

      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        {Object.entries(availabilityTones)
          .filter(([status]) => status !== 'not_assigned')
          .map(([status, tone]) => (
            <Chip
              key={status}
              size="small"
              label={tone.label}
              sx={{ bgcolor: tone.background, color: tone.color }}
            />
          ))}
      </Stack>
    </Stack>
  );
}

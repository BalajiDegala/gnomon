import type { PersonalCalendarDayDto } from '@gnomon/shared';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { MonthPicker } from '../components/data-view/MonthPicker';
import { currentIndiaMonth, usePersonalCalendar } from '../lib/calendar';
import { formatMinutes } from '../lib/timesheets';
import { parseEnumValue, parseYearMonth, useUrlQueryState } from '../lib/url-query-state';
import { leaveTypeLabels } from './LeavePage';

type CalendarLayer = 'all' | 'attendance' | 'leave' | 'holiday';

const calendarLayers = ['all', 'attendance', 'leave', 'holiday'] as const;
const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseCalendarLayer(value: string): CalendarLayer | null {
  return parseEnumValue(value, calendarLayers);
}

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

function AttendanceMarker({ day, layer }: { day: PersonalCalendarDayDto; layer: CalendarLayer }) {
  if ((layer === 'all' || layer === 'holiday') && day.holiday) {
    return (
      <Box sx={{ mt: 0.75, px: 0.75, py: 0.5, borderRadius: 1, bgcolor: '#f1edff' }}>
        <Typography
          noWrap
          sx={{ color: '#6852a8', fontSize: { xs: 8.5, sm: 10 }, fontWeight: 800 }}
        >
          {day.holiday.name}
        </Typography>
      </Box>
    );
  }
  if (layer === 'holiday') return null;
  if ((layer === 'all' || layer === 'leave') && day.leave) {
    const approved = day.leave.status === 'approved';
    return (
      <Box
        sx={{
          mt: 0.75,
          px: 0.75,
          py: 0.5,
          borderRadius: 1,
          bgcolor: approved ? '#e6f7ef' : '#fff4df',
        }}
      >
        <Typography
          noWrap
          sx={{
            color: approved ? '#19764d' : '#a86616',
            fontSize: { xs: 8.5, sm: 10 },
            fontWeight: 800,
          }}
        >
          {leaveTypeLabels[day.leave.leaveType]}
        </Typography>
      </Box>
    );
  }
  if (layer === 'leave') return null;
  if (!day.attendance) return null;
  const tones = {
    present: { background: '#e6f7ef', color: '#19764d' },
    partial: { background: '#fff4df', color: '#a86616' },
    absent: { background: '#fdebec', color: '#b43f48' },
    leave: { background: '#e9f1ff', color: '#315fa4' },
    holiday: { background: '#f1edff', color: '#6852a8' },
    weekend: { background: '#f1f3f6', color: '#697587' },
    pending_regularisation: { background: '#fff4df', color: '#a86616' },
  }[day.attendance.status];
  return (
    <Box sx={{ mt: 0.75, px: 0.75, py: 0.5, borderRadius: 1, bgcolor: tones.background }}>
      <Typography
        noWrap
        sx={{
          color: tones.color,
          fontSize: { xs: 8.5, sm: 10 },
          fontWeight: 800,
          textTransform: 'capitalize',
        }}
      >
        {day.attendance.status.replaceAll('_', ' ')}
      </Typography>
      {day.attendance.grossMinutes > 0 && (
        <Typography sx={{ display: { xs: 'none', sm: 'block' }, color: tones.color, fontSize: 9 }}>
          {formatMinutes(day.attendance.grossMinutes)}
        </Typography>
      )}
    </Box>
  );
}

export function CalendarPage() {
  const defaultMonth = useMemo(currentIndiaMonth, []);
  const [month, setMonth] = useUrlQueryState('month', defaultMonth, parseYearMonth);
  const [layer, setLayer] = useUrlQueryState<CalendarLayer>('layer', 'all', parseCalendarLayer);
  const calendar = usePersonalCalendar(month);
  const days = calendar.calendar?.days ?? [];
  const leadingBlanks = days[0] ? days[0].weekday - 1 : 0;
  const workingDays = days.filter((day) => day.isWorkingDay).length;
  const attendanceDays = days.filter(
    (day) => day.attendance && !['weekend', 'holiday', 'leave'].includes(day.attendance.status),
  ).length;
  const leaveDays = days.filter((day) => day.leave).length;
  const holidayDays = days.filter((day) => day.holiday).length;
  const tabs = useMemo<ReadonlyArray<PageTab<CalendarLayer>>>(
    () => [
      { value: 'all', label: 'All activity', count: days.length },
      { value: 'attendance', label: 'Attendance', count: attendanceDays },
      { value: 'leave', label: 'Leave', count: leaveDays },
      { value: 'holiday', label: 'Holidays', count: holidayDays },
    ],
    [attendanceDays, days.length, holidayDays, leaveDays],
  );

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        eyebrow="PERSONAL SCHEDULE"
        title="Calendar"
        meta={`${monthLabel(month)} - Asia/Kolkata`}
        action={
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
            <Tooltip title="Previous month">
              <IconButton
                aria-label="Previous month"
                onClick={() => setMonth(moveMonth(month, -1))}
                sx={{ border: '1px solid', borderColor: 'divider' }}
              >
                <ChevronLeft size={18} />
              </IconButton>
            </Tooltip>
            <MonthPicker label="Jump to month" value={month} onChange={setMonth} />
            <Tooltip title="Next month">
              <IconButton
                aria-label="Next month"
                onClick={() => setMonth(moveMonth(month, 1))}
                sx={{ border: '1px solid', borderColor: 'divider' }}
              >
                <ChevronRight size={18} />
              </IconButton>
            </Tooltip>
          </Stack>
        }
      />

      {!calendar.canRead && (
        <Alert severity="warning">Your account cannot read personal attendance.</Alert>
      )}
      {calendar.error && <Alert severity="error">{calendar.error.message}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, 1fr)' },
          gap: { xs: 1.5, sm: 3 },
          px: 2,
          py: 1.5,
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: '#fff',
        }}
      >
        <SummaryValue label="Working days" value={String(workingDays)} />
        <SummaryValue label="Attendance days" value={String(attendanceDays)} />
        <SummaryValue label="Leave days" value={String(leaveDays)} />
        <SummaryValue label="Holidays" value={String(holidayDays)} />
      </Box>

      <PageTabs value={layer} tabs={tabs} onChange={setLayer} ariaLabel="Calendar layers" />

      <Box
        sx={{
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1.5,
          bgcolor: '#fff',
        }}
      >
        {calendar.isLoading ? (
          <Box sx={{ minHeight: 480, display: 'grid', placeItems: 'center' }}>
            <CircularProgress aria-label="Loading personal calendar" size={27} />
          </Box>
        ) : (
          <Box sx={{ p: { xs: 1, sm: 2 } }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: { xs: 0.4, sm: 0.75 },
                mb: 0.75,
              }}
            >
              {weekdayLabels.map((label) => (
                <Typography
                  key={label}
                  sx={{
                    py: 0.75,
                    textAlign: 'center',
                    color: 'text.secondary',
                    fontSize: { xs: 9, sm: 11 },
                    fontWeight: 800,
                  }}
                >
                  {label}
                </Typography>
              ))}
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: { xs: 0.4, sm: 0.75 },
              }}
            >
              {Array.from({ length: leadingBlanks }).map((_, index) => (
                <Box key={`blank-${index}`} />
              ))}
              {days.map((day) => (
                <Box
                  key={day.date}
                  aria-label={`${day.date}${day.isWorkingDay ? ': Working day' : ': Non-working day'}`}
                  sx={{
                    minWidth: 0,
                    minHeight: { xs: 72, sm: 104 },
                    p: { xs: 0.6, sm: 1 },
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: day.isWorkingDay ? '#fff' : '#f6f7f9',
                  }}
                >
                  <Typography sx={{ fontSize: { xs: 11, sm: 12.5 }, fontWeight: 820 }}>
                    {Number(day.date.slice(-2))}
                  </Typography>
                  <AttendanceMarker day={day} layer={layer} />
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }} aria-label="Calendar legend">
        <Chip size="small" label="Present" sx={{ bgcolor: '#e6f7ef', color: '#19764d' }} />
        <Chip
          size="small"
          label="Partial / pending"
          sx={{ bgcolor: '#fff4df', color: '#a86616' }}
        />
        <Chip size="small" label="Absent" sx={{ bgcolor: '#fdebec', color: '#b43f48' }} />
        <Chip size="small" label="Holiday" sx={{ bgcolor: '#f1edff', color: '#6852a8' }} />
        <Chip
          size="small"
          icon={<CalendarDays size={13} />}
          label="Leave"
          sx={{ bgcolor: '#e9f1ff', color: '#315fa4' }}
        />
      </Stack>
    </Stack>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <Box aria-label={`${value} ${label.toLowerCase()}`} sx={{ minWidth: 0 }}>
      <Typography noWrap sx={{ color: 'text.secondary', fontSize: 10.5 }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.15, fontSize: 15, fontWeight: 850 }}>{value}</Typography>
    </Box>
  );
}

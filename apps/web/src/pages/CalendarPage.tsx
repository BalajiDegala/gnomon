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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';

import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { MonthPicker } from '../components/data-view/MonthPicker';
import { currentIndiaMonth, usePersonalCalendar } from '../lib/calendar';
import { calendarCodes, legendCodes } from '../lib/calendar-codes';
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

/** Whether a day belongs on the selected layer tab. */
function inLayer(day: PersonalCalendarDayDto, layer: CalendarLayer): boolean {
  if (layer === 'all') return true;
  if (layer === 'holiday') return Boolean(day.holiday);
  if (layer === 'leave') return Boolean(day.leave);
  return Boolean(day.attendance) && !day.holiday && day.availability !== 'non_working';
}

function dayDetail(day: PersonalCalendarDayDto): string | null {
  if (day.holiday) return day.holiday.name;
  if (day.leave) {
    const part = day.leave.dayPart === 'full_day' ? '' : ' · half day';
    const pending = day.leave.status === 'approved' ? '' : ' · awaiting approval';
    return `${leaveTypeLabels[day.leave.leaveType]}${part}${pending}`;
  }
  if (day.attendance?.status === 'pending_regularisation') return 'Correction pending';
  if (day.attendance && day.attendance.grossMinutes > 0) {
    return formatMinutes(day.attendance.grossMinutes);
  }
  return null;
}

/** Same code as the team calendar (PR, PT, AB, LV, PN, —, Off), plus what it refers to. */
function DayMarker({ day, layer }: { day: PersonalCalendarDayDto; layer: CalendarLayer }) {
  if (!inLayer(day, layer)) return null;
  const code = calendarCodes[day.availability];
  // The legend says "Weekend / holiday"; a single day can be specific.
  const label =
    day.availability === 'non_working' ? (day.holiday ? 'Holiday' : 'Weekend') : code.label;
  const detail = dayDetail(day);
  if (!code.short && !detail) return null;
  return (
    <Tooltip title={[label, detail].filter(Boolean).join(' · ')} arrow>
      <Box sx={{ mt: 0.75, minWidth: 0 }}>
        {code.short && (
          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              gap: 0.6,
              px: 0.6,
              py: 0.4,
              borderRadius: '6px',
              bgcolor: code.background,
              color: code.color,
              minWidth: 0,
            }}
          >
            <Typography sx={{ fontSize: { xs: 11, sm: 11 }, fontWeight: 900, lineHeight: 1.2 }}>
              {code.short}
            </Typography>
            <Typography
              noWrap
              sx={{
                display: { xs: 'none', md: 'block' },
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              {label}
            </Typography>
          </Stack>
        )}
        {detail && (
          <Typography
            noWrap
            sx={{
              display: { xs: 'none', sm: 'block' },
              mt: 0.4,
              px: 0.25,
              color: 'text.secondary',
              fontSize: 10.5,
            }}
          >
            {detail}
          </Typography>
        )}
      </Box>
    </Tooltip>
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
          bgcolor: 'var(--g-base)',
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
          bgcolor: 'var(--g-base)',
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
                    fontSize: { xs: 10, sm: 11 },
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
                    bgcolor: 'var(--g-base)',
                    boxShadow: day.isWorkingDay ? 'var(--g-raised-sm)' : 'var(--g-inset-sm)',
                  }}
                >
                  <Typography sx={{ fontSize: { xs: 11, sm: 12.5 }, fontWeight: 820 }}>
                    {Number(day.date.slice(-2))}
                  </Typography>
                  <DayMarker day={day} layer={layer} />
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }} aria-label="Calendar legend">
        {legendCodes.map((availability) => {
          const code = calendarCodes[availability];
          return (
            <Chip
              key={availability}
              size="small"
              label={`${code.short} = ${code.label}`}
              sx={{ bgcolor: code.background, color: code.color, fontWeight: 700 }}
            />
          );
        })}
      </Stack>
    </Stack>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <Box aria-label={`${value} ${label.toLowerCase()}`} sx={{ minWidth: 0 }}>
      <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11.5 }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.15, fontSize: 15, fontWeight: 850 }}>{value}</Typography>
    </Box>
  );
}

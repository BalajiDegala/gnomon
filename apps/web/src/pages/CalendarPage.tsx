import type { PersonalCalendarDayDto } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { currentIndiaMonth, usePersonalCalendar } from '../lib/calendar';
import { formatMinutes } from '../lib/timesheets';
import { leaveTypeLabels } from './LeavePage';

interface CalendarPageProps {
  onBack: () => void;
}

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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

function AttendanceMarker({ day }: { day: PersonalCalendarDayDto }) {
  if (day.leave) {
    const approved = day.leave.status === 'approved';
    return (
      <Box
        sx={{
          mt: 0.75,
          px: 0.75,
          py: 0.5,
          borderRadius: 1.25,
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
    <Box sx={{ mt: 0.75, px: 0.75, py: 0.5, borderRadius: 1.25, bgcolor: tones.background }}>
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

export function CalendarPage({ onBack }: CalendarPageProps) {
  const [month, setMonth] = useState(currentIndiaMonth);
  const calendar = usePersonalCalendar(month);
  const days = calendar.calendar?.days ?? [];
  const leadingBlanks = days[0] ? days[0].weekday - 1 : 0;
  const attendanceDays = days.filter(
    (day) => day.attendance && day.attendance.status !== 'weekend',
  ).length;
  const leaveDays = days.filter((day) => day.leave).length;

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1280, mx: 'auto' }}>
      <Box>
        <Button color="inherit" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
          Back to overview
        </Button>
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          PERSONAL SCHEDULE
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Calendar
        </Typography>
        <Typography sx={{ maxWidth: 760, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          One monthly view of reconciled attendance and pending or approved leave.
        </Typography>
      </Box>

      {!calendar.canRead && (
        <Alert severity="warning">Your account cannot read personal attendance.</Alert>
      )}
      {calendar.error && <Alert severity="error">{calendar.error.message}</Alert>}

      <Card sx={{ boxShadow: 'none', overflow: 'hidden' }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{
              justifyContent: 'space-between',
              alignItems: { sm: 'center' },
              gap: 1.5,
              mb: 2.5,
            }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
              <Button
                aria-label="Previous month"
                color="inherit"
                onClick={() => setMonth(moveMonth(month, -1))}
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
                onClick={() => setMonth(moveMonth(month, 1))}
                sx={{ minWidth: 38, px: 0.75 }}
              >
                <ChevronRight size={18} />
              </Button>
            </Stack>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
              <Chip size="small" label={`${attendanceDays} attendance days`} variant="outlined" />
              <Chip
                size="small"
                label={`${leaveDays} leave days`}
                color="info"
                variant="outlined"
              />
              <TextField
                type="month"
                label="Jump to month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                size="small"
              />
            </Stack>
          </Stack>

          {calendar.isLoading ? (
            <Box sx={{ minHeight: 420, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={27} />
            </Box>
          ) : (
            <Box>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gap: { xs: 0.45, sm: 0.75 },
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
                  gap: { xs: 0.45, sm: 0.75 },
                }}
              >
                {Array.from({ length: leadingBlanks }).map((_, index) => (
                  <Box key={`blank-${index}`} />
                ))}
                {days.map((day) => (
                  <Box
                    key={day.date}
                    sx={{
                      minWidth: 0,
                      minHeight: { xs: 76, sm: 108 },
                      p: { xs: 0.65, sm: 1.1 },
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: { xs: 1.5, sm: 2 },
                      bgcolor: day.isWorkingDay ? '#fff' : '#f6f7f9',
                    }}
                  >
                    <Typography sx={{ fontSize: { xs: 11, sm: 12.5 }, fontWeight: 820 }}>
                      {Number(day.date.slice(-2))}
                    </Typography>
                    <AttendanceMarker day={day} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
        <Chip size="small" label="Present" sx={{ bgcolor: '#e6f7ef', color: '#19764d' }} />
        <Chip
          size="small"
          label="Partial / pending"
          sx={{ bgcolor: '#fff4df', color: '#a86616' }}
        />
        <Chip size="small" label="Absent" sx={{ bgcolor: '#fdebec', color: '#b43f48' }} />
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

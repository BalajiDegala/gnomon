import type { LeaveDayPart, LeaveRequestDto, LeaveStatus, LeaveType } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, Gauge, Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { useMyLeaves } from '../lib/leaves';

interface LeavePageProps {
  onBack: () => void;
}

export const leaveTypeLabels: Record<LeaveType, string> = {
  casual: 'Casual leave',
  sick: 'Sick leave',
  earned: 'Earned leave',
  unpaid: 'Unpaid leave',
};

function nextWorkingDate(): string {
  const now = new Date();
  const indiaDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(now);
  const date = new Date(`${indiaDate}T00:00:00.000Z`);
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

function workingDayCount(
  startDate: string,
  endDate: string,
  dayPart: LeaveDayPart,
  holidayDates: ReadonlySet<string>,
): number {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  let count = 0;
  for (let date = start; date <= end; date = new Date(date.getTime() + 86_400_000)) {
    if (
      date.getUTCDay() !== 0 &&
      date.getUTCDay() !== 6 &&
      !holidayDates.has(date.toISOString().slice(0, 10))
    ) {
      count += 1;
    }
  }
  return dayPart === 'full_day' ? count : count ? 0.5 : 0;
}

function statusLabel(status: LeaveStatus): string {
  const labels: Record<LeaveStatus, string> = {
    pending_manager: 'Manager review',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return labels[status];
}

function statusColor(status: LeaveStatus): 'warning' | 'success' | 'error' | 'default' {
  if (status === 'pending_manager') return 'warning';
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  return 'default';
}

function dayPartLabel(dayPart: LeaveDayPart): string {
  if (dayPart === 'first_half') return 'First half';
  if (dayPart === 'second_half') return 'Second half';
  return 'Full day';
}

export function LeavePage({ onBack }: LeavePageProps) {
  const defaultDate = useMemo(nextWorkingDate, []);
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [leaveType, setLeaveType] = useState<LeaveType>('casual');
  const [dayPart, setDayPart] = useState<LeaveDayPart>('full_day');
  const [reason, setReason] = useState('');
  const year = Number(startDate.slice(0, 4));
  const leaves = useMyLeaves(year);
  const holidayDates = useMemo(
    () => new Set(leaves.holidays.map((holiday) => holiday.date)),
    [leaves.holidays],
  );
  const requestedDays = workingDayCount(startDate, endDate, dayPart, holidayDates);
  const selectedBalance = leaves.balances.find((balance) => balance.leaveType === leaveType);

  useEffect(() => {
    if (endDate < startDate || endDate.slice(0, 4) !== startDate.slice(0, 4)) {
      setEndDate(startDate);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    if (startDate !== endDate && dayPart !== 'full_day') setDayPart('full_day');
  }, [dayPart, endDate, startDate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await leaves.create({ leaveType, startDate, endDate, dayPart, reason });
      setReason('');
    } catch {
      // Mutation errors are rendered by the hook.
    }
  };

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1280, mx: 'auto' }}>
      <Box>
        <Button color="inherit" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
          Back to overview
        </Button>
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          TIME AWAY
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Leave
        </Typography>
        <Typography sx={{ maxWidth: 780, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Request full-day or half-day leave. Weekends and configured holidays are excluded, and
          your Reporting Manager owns the decision.
        </Typography>
      </Box>

      {!leaves.canCreate && (
        <Alert severity="warning">Your account cannot create leave requests.</Alert>
      )}
      {leaves.error && <Alert severity="error">{leaves.error.message}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(380px, .78fr) minmax(0, 1.22fr)' },
          gap: 2.5,
          alignItems: 'start',
        }}
      >
        <Stack spacing={2.5}>
          <Card sx={{ boxShadow: 'none' }}>
            <CardContent component="form" onSubmit={(event) => void submit(event)} sx={{ p: 3 }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2.5 }}>
                <CalendarDays size={19} color="#137f8d" />
                <Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 800 }}>New leave request</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
                    Private reason visible only to authorized approvers.
                  </Typography>
                </Box>
              </Stack>
              <Stack spacing={2}>
                <FormControl fullWidth>
                  <InputLabel id="leave-type-label">Leave type</InputLabel>
                  <Select
                    labelId="leave-type-label"
                    label="Leave type"
                    value={leaveType}
                    onChange={(event) => setLeaveType(event.target.value as LeaveType)}
                  >
                    {Object.entries(leaveTypeLabels).map(([value, label]) => (
                      <MenuItem key={value} value={value}>
                        {label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 2,
                  }}
                >
                  <TextField
                    type="date"
                    label="Start date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    required
                  />
                  <TextField
                    type="date"
                    label="End date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startDate } }}
                    required
                  />
                </Box>
                <FormControl fullWidth>
                  <InputLabel id="leave-day-part-label">Day portion</InputLabel>
                  <Select
                    labelId="leave-day-part-label"
                    label="Day portion"
                    value={dayPart}
                    onChange={(event) => setDayPart(event.target.value as LeaveDayPart)}
                  >
                    <MenuItem value="full_day">Full day</MenuItem>
                    {startDate === endDate && <MenuItem value="first_half">First half</MenuItem>}
                    {startDate === endDate && <MenuItem value="second_half">Second half</MenuItem>}
                  </Select>
                </FormControl>
                <TextField
                  multiline
                  minRows={4}
                  label="Private reason"
                  placeholder="Briefly explain the leave request."
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 1_000 } }}
                  helperText={`${reason.trim().length}/1000 · minimum 5 characters`}
                  required
                />
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f4f8f9' }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                      Working-day duration
                    </Typography>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>
                      {requestedDays} day{requestedDays === 1 ? '' : 's'}
                    </Typography>
                  </Stack>
                  <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 10.5 }}>
                    {selectedBalance?.availableDays === null
                      ? 'Entitlement is not configured yet; approval remains available.'
                      : selectedBalance?.availableDays !== undefined
                        ? `${selectedBalance.availableDays} configured days remain after pending and approved leave.`
                        : 'Loading balance policy…'}
                  </Typography>
                  {leaves.holidays.some(
                    (holiday) => holiday.date >= startDate && holiday.date <= endDate,
                  ) && (
                    <Typography sx={{ mt: 0.45, color: 'primary.dark', fontSize: 10.5 }}>
                      Company holidays inside this range are excluded automatically.
                    </Typography>
                  )}
                </Box>
                <Button
                  type="submit"
                  size="large"
                  variant="contained"
                  disabled={requestedDays <= 0 || reason.trim().length < 5 || leaves.isUpdating}
                  startIcon={
                    leaves.isUpdating ? <CircularProgress size={16} /> : <Send size={17} />
                  }
                >
                  Submit for manager review
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <BalanceSummary balances={leaves.balances} />
        </Stack>

        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 2.25 }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Request history</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                  Decisions and comments remain available for the selected year.
                </Typography>
              </Box>
              <Clock3 size={19} color="#738094" />
            </Stack>
            {leaves.isLoading ? (
              <Box sx={{ py: 10, textAlign: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            ) : leaves.requests.length ? (
              <Stack spacing={1.25}>
                {leaves.requests.map((request) => (
                  <LeaveHistoryCard
                    key={request.id}
                    request={request}
                    isUpdating={leaves.isUpdating}
                    onCancel={() => void leaves.cancel(request.id).catch(() => undefined)}
                  />
                ))}
              </Stack>
            ) : (
              <Box
                sx={{
                  minHeight: 360,
                  display: 'grid',
                  placeItems: 'center',
                  textAlign: 'center',
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 2.5,
                }}
              >
                <Box>
                  <CheckCircle2 size={27} color="#8794a6" />
                  <Typography sx={{ mt: 0.75, fontSize: 13.5, fontWeight: 750 }}>
                    No leave requests
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                    New requests and decisions will appear here.
                  </Typography>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}

function BalanceSummary({ balances }: { balances: ReturnType<typeof useMyLeaves>['balances'] }) {
  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.75 }}>
          <Gauge size={17} color="#137f8d" />
          <Typography sx={{ fontSize: 14, fontWeight: 800 }}>Leave balances</Typography>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
          {balances.map((balance) => (
            <Box key={balance.leaveType} sx={{ p: 1.4, borderRadius: 2, bgcolor: '#f7f9fb' }}>
              <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                {leaveTypeLabels[balance.leaveType]}
              </Typography>
              <Typography sx={{ mt: 0.2, fontSize: 16, fontWeight: 850 }}>
                {balance.balanceTracked
                  ? balance.availableDays === null
                    ? 'Not set'
                    : balance.availableDays
                  : 'As approved'}
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 9.5 }}>
                {balance.pendingDays} pending · {balance.approvedDays} approved
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}

function LeaveHistoryCard({
  request,
  isUpdating,
  onCancel,
}: {
  request: LeaveRequestDto;
  isUpdating: boolean;
  onCancel: () => void;
}) {
  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', gap: 1.25 }}
      >
        <Box>
          <Typography sx={{ fontSize: 12.5, fontWeight: 820 }}>
            {leaveTypeLabels[request.leaveType]} · {request.requestedDays} day
            {request.requestedDays === 1 ? '' : 's'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
            {request.startDate}
            {request.endDate !== request.startDate ? ` – ${request.endDate}` : ''} ·{' '}
            {dayPartLabel(request.dayPart)}
          </Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, alignSelf: 'flex-start' }}>
          <Chip
            size="small"
            color={statusColor(request.status)}
            label={statusLabel(request.status)}
          />
          {request.status === 'pending_manager' && (
            <Button
              aria-label={`Cancel ${request.startDate} leave`}
              color="error"
              size="small"
              disabled={isUpdating}
              onClick={onCancel}
              sx={{ minWidth: 34, px: 0.75 }}
            >
              <Trash2 size={15} />
            </Button>
          )}
        </Stack>
      </Stack>
      <Typography sx={{ mt: 1.1, color: 'text.secondary', fontSize: 11.5 }}>
        {request.reason}
      </Typography>
      {request.decision && (
        <Typography
          sx={{
            mt: 1,
            pt: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            color: 'text.secondary',
            fontSize: 10.75,
          }}
        >
          {request.decision.decision === 'approved' ? 'Approved' : 'Rejected'} by{' '}
          {request.decision.actorDisplayName}
          {request.decision.comment ? ` · ${request.decision.comment}` : ''}
        </Typography>
      )}
    </Box>
  );
}

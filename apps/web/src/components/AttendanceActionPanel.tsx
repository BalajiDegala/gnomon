import type { AttendanceActionItem, LeaveDayPart, LeaveType } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { CheckCircle2, CircleAlert, ListTodo, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  correctedWindow,
  indiaTimeInput,
  initialActionRow,
  useAttendanceActionItems,
  type ActionRow,
} from '../lib/attendance-actions';
import { useMyLeaves } from '../lib/leaves';
import { useMyRegularisations } from '../lib/regularisations';
import { currentIndiaWorkDate, formatMinutes } from '../lib/timesheets';

const leaveTypeOptions: Array<{ value: LeaveType; label: string }> = [
  { value: 'casual', label: 'Casual/Sick' },
  { value: 'earned', label: 'Privilege' },
  { value: 'comp_off', label: 'Comp off' },
  { value: 'unpaid', label: 'Unpaid (LOP)' },
];
const dayPartOptions: Array<{ value: LeaveDayPart; label: string }> = [
  { value: 'full_day', label: 'Full day' },
  { value: 'first_half', label: 'First half' },
  { value: 'second_half', label: 'Second half' },
];
const MIN_REASON = 10;

type Outcome = { ok: true } | { ok: false; message: string };
type MonthFilter = 'both' | 'this' | 'last';

function monthName(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function weekdayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * "Needs your attention": past days the system detected as absent (LOP) or
 * partial. The employee ticks the days, adjusts each row (leave type and day
 * part, or corrected times), gives each day its own reason and submits them all at once.
 * Absent days default to leave; partial days default to regularisation and can
 * be switched to leave.
 */
export function AttendanceActionPanel() {
  const actions = useAttendanceActionItems();
  const year = new Date().getFullYear();
  const leaves = useMyLeaves(year);
  const regularisations = useMyRegularisations();
  const [rows, setRows] = useState<Record<string, ActionRow>>({});
  const [submitting, setSubmitting] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});

  // Keep edits for days still listed; add defaults for new ones.
  useEffect(() => {
    setRows((current) =>
      Object.fromEntries(
        actions.items.map((item) => [
          item.workDate,
          current[item.workDate] ?? initialActionRow(item, leaves.balances),
        ]),
      ),
    );
  }, [actions.items, leaves.balances]);

  const [monthFilter, setMonthFilter] = useState<MonthFilter>('both');
  const thisMonth = currentIndiaWorkDate().slice(0, 7);
  const lastMonth = (() => {
    const date = new Date(`${thisMonth}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - 1);
    return date.toISOString().slice(0, 7);
  })();
  const monthCounts = {
    this: actions.items.filter((item) => item.workDate.startsWith(thisMonth)).length,
    last: actions.items.filter((item) => item.workDate.startsWith(lastMonth)).length,
  };
  // Only the rows on screen can be selected and submitted.
  const items = useMemo(
    () =>
      actions.items.filter((item) =>
        monthFilter === 'this'
          ? item.workDate.startsWith(thisMonth)
          : monthFilter === 'last'
            ? item.workDate.startsWith(lastMonth)
            : true,
      ),
    [actions.items, lastMonth, monthFilter, thisMonth],
  );
  const selected = useMemo(
    () => items.filter((item) => rows[item.workDate]?.selected),
    [items, rows],
  );
  const counts = useMemo(
    () => ({
      absent: items.filter((item) => item.kind === 'absent').length,
      partial: items.filter((item) => item.kind === 'partial').length,
    }),
    [items],
  );

  if (!actions.canRead || actions.isLoading) return null;

  const update = (workDate: string, patch: Partial<ActionRow>) =>
    setRows((current) => ({ ...current, [workDate]: { ...current[workDate]!, ...patch } }));
  const allSelected = items.length > 0 && selected.length === items.length;
  const toggleAll = () =>
    setRows((current) =>
      Object.fromEntries(
        Object.entries(current).map(([date, row]) => [
          date,
          items.some((item) => item.workDate === date) ? { ...row, selected: !allSelected } : row,
        ]),
      ),
    );

  const canLeave = leaves.canCreate;
  const canRegularise = regularisations.canCreate;
  const missingReasons = selected.filter(
    (item) => (rows[item.workDate]?.reason.trim().length ?? 0) < MIN_REASON,
  ).length;
  const blocked = selected.some((item) => {
    const row = rows[item.workDate]!;
    return row.action === 'leave' ? !canLeave : !canRegularise;
  });

  const submit = async () => {
    setSubmitting(true);
    const results: Record<string, Outcome> = {};
    // One request per day, oldest first, so approvers see them in order.
    for (const item of [...selected].sort((a, b) => a.workDate.localeCompare(b.workDate))) {
      const row = rows[item.workDate]!;
      try {
        if (row.action === 'leave') {
          await leaves.create({
            leaveType: row.leaveType,
            startDate: item.workDate,
            endDate: item.workDate,
            dayPart: row.dayPart,
            reason: row.reason.trim(),
          });
        } else {
          await regularisations.create({
            workDate: item.workDate,
            source: item.source,
            missingEvent: item.missingEvent,
            ...correctedWindow(item.workDate, row.start, row.end),
            reason: row.reason.trim(),
          });
        }
        results[item.workDate] = { ok: true };
      } catch (error) {
        results[item.workDate] = {
          ok: false,
          message: error instanceof Error ? error.message : 'Could not submit this day.',
        };
      }
    }
    setOutcomes(results);
    setSubmitting(false);
    await actions.refresh();
  };

  const sent = Object.values(outcomes).filter((outcome) => outcome.ok).length;
  const failures = Object.entries(outcomes).filter(([, outcome]) => !outcome.ok) as Array<
    [string, { ok: false; message: string }]
  >;

  return (
    <Card sx={{ boxShadow: 'none', border: '1px solid var(--g-border)' }}>
      <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ gap: 1.5, justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
        >
          <Stack direction="row" sx={{ gap: 1.5, alignItems: 'flex-start' }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                flex: '0 0 auto',
                display: 'grid',
                placeItems: 'center',
                borderRadius: '10px',
                bgcolor: items.length ? 'var(--g-pt-soft)' : 'var(--g-pr-soft)',
                color: items.length ? 'var(--g-pt)' : 'var(--g-pr)',
              }}
            >
              {items.length ? <ListTodo size={18} /> : <CheckCircle2 size={18} />}
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 800 }}>
                {items.length ? 'Needs your attention' : 'All caught up'}
              </Typography>
              <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 12, maxWidth: 720 }}>
                {items.length
                  ? `Working days in ${monthName(lastMonth)} and ${monthName(thisMonth)} (up to yesterday) with no attendance (loss of pay) or short / missing punches. Tick the days, check each row, give each a reason and submit. Absent days are set to leave; partial days are set to a correction and can be switched to leave.`
                  : 'No absent or partial days need leave or a correction right now.'}
              </Typography>
            </Box>
          </Stack>
          {items.length > 0 && (
            <Stack direction="row" spacing={1}>
              {counts.absent > 0 && (
                <Chip
                  size="small"
                  color="error"
                  variant="outlined"
                  label={`${counts.absent} absent`}
                />
              )}
              {counts.partial > 0 && (
                <Chip
                  size="small"
                  color="warning"
                  variant="outlined"
                  label={`${counts.partial} partial`}
                />
              )}
            </Stack>
          )}
        </Stack>

        {actions.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {actions.error.message}
          </Alert>
        )}
        {sent > 0 && failures.length === 0 && (
          <Alert severity="success" sx={{ mt: 2 }} onClose={() => setOutcomes({})}>
            {sent} {sent === 1 ? 'request was' : 'requests were'} submitted for approval.
          </Alert>
        )}
        {failures.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2 }} onClose={() => setOutcomes({})}>
            {sent > 0 && `${sent} submitted. `}
            {failures.length} could not be submitted:
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {failures.map(([date, outcome]) => (
                <li key={date}>
                  {date}: {outcome.message}
                </li>
              ))}
            </Box>
          </Alert>
        )}

        {items.length > 0 && (
          <>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={monthFilter}
              onChange={(_event, value: MonthFilter | null) => value && setMonthFilter(value)}
              aria-label="Month"
              sx={{
                mt: 2,
                bgcolor: 'var(--g-base)',
                '& .MuiToggleButton-root': { borderRadius: '10px', px: 1.5, textTransform: 'none' },
              }}
            >
              <ToggleButton value="both">Both months · {actions.items.length}</ToggleButton>
              <ToggleButton value="this">
                {monthName(thisMonth)} · {monthCounts.this}
              </ToggleButton>
              <ToggleButton value="last">
                {monthName(lastMonth)} · {monthCounts.last}
              </ToggleButton>
            </ToggleButtonGroup>
            <TableContainer sx={{ mt: 1.5, maxHeight: 480 }}>
              <Table size="small" stickyHeader aria-label="Days needing action">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={allSelected}
                        indeterminate={selected.length > 0 && !allSelected}
                        onChange={toggleAll}
                        slotProps={{ input: { 'aria-label': 'Select all days' } }}
                      />
                    </TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>What we found</TableCell>
                    <TableCell>Recorded</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>Send as</TableCell>
                    <TableCell sx={{ minWidth: 300 }}>Details</TableCell>
                    <TableCell sx={{ minWidth: 260 }}>Reason</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, index) => {
                    const row = rows[item.workDate];
                    if (!row) return null;
                    const outcome = outcomes[item.workDate];
                    const month = item.workDate.slice(0, 7);
                    const newMonth =
                      index === 0 || items[index - 1]!.workDate.slice(0, 7) !== month;
                    return [
                      newMonth && (
                        <TableRow key={`month-${month}`}>
                          <TableCell
                            colSpan={7}
                            sx={{
                              py: 0.75,
                              bgcolor: 'var(--g-accent-soft)',
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            {monthName(month)} ·{' '}
                            {
                              items.filter((candidate) => candidate.workDate.startsWith(month))
                                .length
                            }{' '}
                            days
                          </TableCell>
                        </TableRow>
                      ),
                      <ActionRowView
                        key={item.workDate}
                        item={item}
                        row={row}
                        outcome={outcome}
                        canLeave={canLeave}
                        canRegularise={canRegularise}
                        onChange={(patch) => update(item.workDate, patch)}
                      />,
                    ];
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Stack
              direction={{ xs: 'column', md: 'row' }}
              sx={{ mt: 2, gap: 1.5, alignItems: { md: 'flex-start' } }}
            >
              <Typography
                sx={{
                  flex: 1,
                  alignSelf: 'center',
                  fontSize: 12,
                  color: missingReasons ? 'var(--g-ab)' : 'text.secondary',
                }}
              >
                {missingReasons
                  ? `${missingReasons} selected ${missingReasons === 1 ? 'day needs' : 'days need'} a reason (at least ${MIN_REASON} characters).`
                  : 'Each day is sent with the reason written on its row.'}
              </Typography>
              <Button
                variant="contained"
                disabled={!selected.length || missingReasons > 0 || blocked || submitting}
                startIcon={submitting ? <CircularProgress size={15} /> : <Send size={15} />}
                onClick={() => void submit()}
                sx={{ flex: '0 0 auto', minHeight: 40 }}
              >
                Submit {selected.length || ''} selected
              </Button>
            </Stack>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActionRowView({
  item,
  row,
  outcome,
  canLeave,
  canRegularise,
  onChange,
}: {
  item: AttendanceActionItem;
  row: ActionRow;
  outcome?: Outcome;
  canLeave: boolean;
  canRegularise: boolean;
  onChange: (patch: Partial<ActionRow>) => void;
}) {
  const recorded =
    item.detectedStart || item.detectedEnd
      ? `${item.detectedStart ? indiaTimeInput(item.detectedStart) : '—'} – ${
          item.detectedEnd ? indiaTimeInput(item.detectedEnd) : '—'
        }`
      : 'Nothing recorded';
  return (
    <TableRow hover selected={row.selected}>
      <TableCell padding="checkbox">
        <Checkbox
          size="small"
          checked={row.selected}
          onChange={(event) => onChange({ selected: event.target.checked })}
          slotProps={{ input: { 'aria-label': `Select ${item.workDate}` } }}
        />
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 750 }}>
          {weekdayLabel(item.workDate)}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{item.workDate}</Typography>
      </TableCell>
      <TableCell>
        <Stack direction="row" sx={{ gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <Chip
            size="small"
            variant="outlined"
            color={item.kind === 'absent' ? 'error' : 'warning'}
            label={
              item.kind === 'absent'
                ? 'Absent · LOP'
                : `Partial · ${formatMinutes(item.workedMinutes)} of ${formatMinutes(item.requiredMinutes)}`
            }
          />
          {outcome?.ok && <CheckCircle2 size={16} color="var(--g-pr)" aria-label="Submitted" />}
          {outcome && !outcome.ok && (
            <Tooltip title={outcome.message}>
              <CircleAlert size={16} color="var(--g-ab)" aria-label={outcome.message} />
            </Tooltip>
          )}
        </Stack>
        {item.kind === 'partial' && item.issues.length > 0 && (
          <Typography sx={{ mt: 0.4, fontSize: 11, color: 'text.secondary' }}>
            {item.issues.join(' · ')}
          </Typography>
        )}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>{recorded}</TableCell>
      <TableCell>
        <TextField
          select
          size="small"
          fullWidth
          value={row.action}
          onChange={(event) =>
            onChange({ action: event.target.value as ActionRow['action'], selected: true })
          }
          slotProps={{ htmlInput: { 'aria-label': `Send ${item.workDate} as` } }}
        >
          <MenuItem value="leave" disabled={!canLeave}>
            Leave
          </MenuItem>
          <MenuItem value="regularisation" disabled={!canRegularise}>
            Correction
          </MenuItem>
        </TextField>
      </TableCell>
      <TableCell>
        {row.action === 'leave' ? (
          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              label="Type"
              value={row.leaveType}
              onChange={(event) =>
                onChange({ leaveType: event.target.value as LeaveType, selected: true })
              }
              sx={{ minWidth: 130 }}
            >
              {leaveTypeOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Day"
              value={row.dayPart}
              onChange={(event) =>
                onChange({ dayPart: event.target.value as LeaveDayPart, selected: true })
              }
              sx={{ minWidth: 130 }}
            >
              {dayPartOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        ) : (
          <Stack direction="row" spacing={1}>
            <TextField
              type="time"
              size="small"
              label="In"
              value={row.start}
              onChange={(event) => onChange({ start: event.target.value, selected: true })}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 120 }}
            />
            <TextField
              type="time"
              size="small"
              label="Out"
              value={row.end}
              onChange={(event) => onChange({ end: event.target.value, selected: true })}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 120 }}
            />
          </Stack>
        )}
      </TableCell>
      <TableCell>
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={3}
          placeholder={
            row.action === 'leave' ? 'Why were you away?' : 'What happened to the punch?'
          }
          value={row.reason}
          onChange={(event) => onChange({ reason: event.target.value, selected: true })}
          error={row.selected && row.reason.trim().length < MIN_REASON}
          helperText={
            row.selected && row.reason.trim().length < MIN_REASON
              ? `At least ${MIN_REASON} characters`
              : undefined
          }
          slotProps={{
            htmlInput: { maxLength: 1_000, 'aria-label': `Reason for ${item.workDate}` },
          }}
        />
      </TableCell>
    </TableRow>
  );
}

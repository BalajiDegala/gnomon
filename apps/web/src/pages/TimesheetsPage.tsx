import type { CreateTimeEntryRequest, TimeEntryStatus } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileClock,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { formatIndiaTime } from '../lib/timecard';
import {
  currentIndiaWorkDate,
  formatMinutes,
  indiaLocalInputToIso,
  useTimesheetDay,
} from '../lib/timesheets';

interface TimesheetsPageProps {
  onBack: () => void;
  onManageShows: () => void;
  canManageShows: boolean;
}

function statusColor(status: TimeEntryStatus): 'default' | 'info' | 'success' | 'error' {
  if (status === 'submitted') return 'info';
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  return 'default';
}

export function TimesheetsPage({ onBack, onManageShows, canManageShows }: TimesheetsPageProps) {
  const [workDate, setWorkDate] = useState(currentIndiaWorkDate);
  const timesheet = useTimesheetDay(workDate);
  const [showId, setShowId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [startedAt, setStartedAt] = useState(`${workDate}T09:00`);
  const [endedAt, setEndedAt] = useState(`${workDate}T10:00`);
  const [description, setDescription] = useState('');
  const [billable, setBillable] = useState(true);
  const selectedShow = timesheet.options.find((show) => show.id === showId);
  const selectedShowId = selectedShow ? showId : '';
  const selectedTaskId = selectedShow?.tasks.some((task) => task.id === taskId) ? taskId : '';
  const completion = Math.min(100, ((timesheet.day?.totalMinutes ?? 0) / 540) * 100);

  useEffect(() => {
    setStartedAt(`${workDate}T09:00`);
    setEndedAt(`${workDate}T10:00`);
  }, [workDate]);

  useEffect(() => {
    if (!timesheet.options.length) return;
    if (!timesheet.options.some((show) => show.id === showId)) {
      setShowId(timesheet.options[0]!.id);
    }
  }, [showId, timesheet.options]);

  useEffect(() => {
    if (!selectedShow?.tasks.length) {
      setTaskId('');
      return;
    }
    if (!selectedShow.tasks.some((task) => task.id === taskId)) {
      setTaskId(selectedShow.tasks[0]!.id);
    }
  }, [selectedShow, taskId]);

  const submitEntry = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const input: CreateTimeEntryRequest = {
        showId: selectedShowId,
        taskId: selectedTaskId,
        startedAt: indiaLocalInputToIso(startedAt),
        endedAt: indiaLocalInputToIso(endedAt),
        description,
        billable,
      };
      await timesheet.create(input);
      setDescription('');
    } catch {
      // The mutation error is rendered by the timesheet hook.
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
          TASK TIME
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Timesheets
        </Typography>
        <Typography sx={{ maxWidth: 760, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Record non-overlapping start and end times against your assigned shows and tasks, then
          submit the work date. Show Manager decisions arrive with the approval workflow.
        </Typography>
      </Box>

      {!timesheet.canCreate && (
        <Alert severity="warning">Your account does not have timesheet permission.</Alert>
      )}
      {timesheet.error && <Alert severity="error">{timesheet.error.message}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(360px, .8fr) minmax(0, 1.2fr)' },
          gap: 2.5,
          alignItems: 'start',
        }}
      >
        <Stack spacing={2.5}>
          <Card sx={{ boxShadow: 'none' }}>
            <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Work date</Typography>
              <TextField
                fullWidth
                type="date"
                label="Timesheet date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ mt: 2 }}
              />
            </CardContent>
          </Card>

          <Card sx={{ boxShadow: 'none' }}>
            <CardContent
              component="form"
              onSubmit={(event) => void submitEntry(event)}
              sx={{ p: 3 }}
            >
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2.25 }}>
                <FileClock size={18} color="#137f8d" />
                <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Add task time</Typography>
              </Stack>

              {timesheet.options.length === 0 && !timesheet.isLoading ? (
                <Alert
                  severity="info"
                  action={
                    canManageShows ? (
                      <Button color="inherit" size="small" onClick={onManageShows}>
                        Manage shows
                      </Button>
                    ) : undefined
                  }
                >
                  No active show assignment is available for your employee profile.
                </Alert>
              ) : (
                <Stack spacing={2}>
                  <FormControl fullWidth>
                    <InputLabel id="timesheet-show-label">Show</InputLabel>
                    <Select
                      labelId="timesheet-show-label"
                      label="Show"
                      value={selectedShowId}
                      onChange={(event) => {
                        setShowId(event.target.value);
                        setTaskId('');
                      }}
                    >
                      {timesheet.options.map((show) => (
                        <MenuItem key={show.id} value={show.id}>
                          {show.code} · {show.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth>
                    <InputLabel id="timesheet-task-label">Task</InputLabel>
                    <Select
                      labelId="timesheet-task-label"
                      label="Task"
                      value={selectedTaskId}
                      onChange={(event) => setTaskId(event.target.value)}
                    >
                      {(selectedShow?.tasks ?? []).map((task) => (
                        <MenuItem key={task.id} value={task.id}>
                          {task.code} · {task.name}
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
                      type="datetime-local"
                      label="Started at"
                      value={startedAt}
                      onChange={(event) => setStartedAt(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      required
                    />
                    <TextField
                      type="datetime-local"
                      label="Ended at"
                      value={endedAt}
                      onChange={(event) => setEndedAt(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                      required
                    />
                  </Box>
                  <TextField
                    multiline
                    minRows={3}
                    label="Task details"
                    placeholder="Describe the shot, sequence, review, or delivery work completed."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 1_000 } }}
                    required
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={billable}
                        onChange={(event) => setBillable(event.target.checked)}
                      />
                    }
                    label="Billable task time"
                  />
                  <Button
                    type="submit"
                    size="large"
                    variant="contained"
                    disabled={
                      !selectedShowId ||
                      !selectedTaskId ||
                      !startedAt ||
                      !endedAt ||
                      description.trim().length < 3 ||
                      timesheet.isUpdating
                    }
                    startIcon={
                      timesheet.isUpdating ? <CircularProgress size={16} /> : <Clock3 size={17} />
                    }
                  >
                    Add draft entry
                  </Button>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Stack>

        <Stack spacing={2.5}>
          <Card
            sx={{
              border: 0,
              color: '#fff',
              background:
                'radial-gradient(circle at 85% 10%, rgba(56,211,222,.18), transparent 38%), linear-gradient(135deg, #111c30, #0b1423)',
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 3.5 } }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}
              >
                <Box>
                  <Typography sx={{ color: 'rgba(255,255,255,.55)', fontSize: 11 }}>
                    Total task time · {workDate}
                  </Typography>
                  <Typography sx={{ mt: 0.5, fontSize: 38, fontWeight: 850 }}>
                    {formatMinutes(timesheet.day?.totalMinutes ?? 0)}
                  </Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 11.5 }}>
                    {Math.round(completion)}% of the nine-hour attendance target
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  disabled={!timesheet.day?.draftCount || timesheet.isUpdating}
                  startIcon={<Send size={16} />}
                  onClick={() => void timesheet.submit().catch(() => undefined)}
                  sx={{ bgcolor: '#3bcbd7', color: '#071519' }}
                >
                  Submit {timesheet.day?.draftCount ?? 0} draft
                  {(timesheet.day?.draftCount ?? 0) === 1 ? '' : 's'}
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ boxShadow: 'none' }}>
            <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
              <Stack
                direction="row"
                sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}
              >
                <Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Task entries</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                    Drafts can be removed until the work date is submitted.
                  </Typography>
                </Box>
                <Chip size="small" label={`${timesheet.day?.entries.length ?? 0} entries`} />
              </Stack>
              {timesheet.isLoading ? (
                <Box sx={{ py: 7, textAlign: 'center' }}>
                  <CircularProgress size={24} />
                </Box>
              ) : timesheet.day?.entries.length ? (
                <Stack spacing={1}>
                  {timesheet.day.entries.map((entry) => (
                    <Box
                      key={entry.id}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr auto', sm: '100px 1fr auto auto' },
                        gap: 1.5,
                        alignItems: 'center',
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: '#f7f9fb',
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
                          {formatIndiaTime(entry.startedAt)}
                        </Typography>
                        <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                          to {formatIndiaTime(entry.endedAt)}
                        </Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 750 }}>
                          {entry.showCode} · {entry.taskName}
                        </Typography>
                        <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11 }}>
                          {entry.description}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
                          {formatMinutes(entry.durationMinutes)}
                        </Typography>
                        <Chip
                          size="small"
                          color={statusColor(entry.status)}
                          label={entry.status}
                          icon={
                            entry.status === 'submitted' ? <CheckCircle2 size={12} /> : undefined
                          }
                        />
                      </Box>
                      {entry.status === 'draft' && (
                        <Button
                          aria-label={`Delete ${entry.taskName} entry`}
                          color="error"
                          size="small"
                          onClick={() => void timesheet.remove(entry.id).catch(() => undefined)}
                          sx={{ minWidth: 34, px: 0.75 }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      )}
                    </Box>
                  ))}
                </Stack>
              ) : (
                <Box sx={{ py: 7, textAlign: 'center' }}>
                  <Sparkles size={24} color="#8995a6" />
                  <Typography sx={{ mt: 0.75, fontSize: 13, fontWeight: 750 }}>
                    No task time for this work date
                  </Typography>
                  <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 11.5 }}>
                    Add the first show/task interval from the form.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          <Alert icon={<CalendarDays size={18} />} severity="info">
            Entries can cross midnight but cannot cross the 07:00 logical workday boundary.
          </Alert>
        </Stack>
      </Box>
    </Stack>
  );
}

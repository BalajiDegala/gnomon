import { getWorkDate, type CreateTimeEntryRequest, type TimeEntryDto } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileClock,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '../components/data-view/DataTable';
import { FilterBar } from '../components/data-view/FilterBar';
import { PageHeader } from '../components/data-view/PageHeader';
import { formatIndiaTime } from '../lib/timecard';
import {
  currentIndiaWorkDate,
  formatMinutes,
  indiaLocalInputToIso,
  useTimesheetDay,
} from '../lib/timesheets';
import { parseEnumValue, parseIsoDate, useUrlQueryState } from '../lib/url-query-state';

interface TimesheetsPageProps {
  onManageShows: () => void;
  canManageShows: boolean;
}

type TimesheetSortKey = 'start' | 'show' | 'duration' | 'percentage';

const timesheetSortKeys = ['start', 'show', 'duration', 'percentage'] as const;
const sortDirections = ['asc', 'desc'] as const;
const pageSizes = [10, 25, 50, 100] as const;
const progressOptions = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);

function parseTimesheetSort(value: string): TimesheetSortKey | null {
  return parseEnumValue(value, timesheetSortKeys);
}

function parseSortDirection(value: string): SortDirection | null {
  return parseEnumValue(value, sortDirections);
}

function parsePage(value: string): number | null {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

function parsePageSize(value: string): number | null {
  const pageSize = Number(value);
  return pageSizes.includes(pageSize as (typeof pageSizes)[number]) ? pageSize : null;
}

function parseShowFilter(value: string): string | null {
  return value === 'all' || /^[a-f\d]{24}$/i.test(value) ? value : null;
}

function compareEntries(left: TimeEntryDto, right: TimeEntryDto, key: TimesheetSortKey): number {
  if (key === 'start') return left.startedAt.localeCompare(right.startedAt);
  if (key === 'show')
    return left.showName.localeCompare(right.showName, undefined, { numeric: true });
  if (key === 'duration') return left.durationMinutes - right.durationMinutes;
  return left.percentage - right.percentage;
}

function isoToIndiaLocalInput(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function moveDate(workDate: string, offset: number): string {
  const date = new Date(`${workDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function validateEntryForm(input: {
  workDate: string;
  showId: string;
  startedAt: string;
  endedAt: string;
  comment: string;
  percentage: number;
}): string | null {
  if (!input.showId) return 'Select a show.';
  if (!input.startedAt || !input.endedAt) return 'Enter both the start and end time.';

  const startedAt = new Date(indiaLocalInputToIso(input.startedAt));
  const endedAt = new Date(indiaLocalInputToIso(input.endedAt));
  if (endedAt <= startedAt) return 'End time must be after start time.';
  if (endedAt.getTime() - startedAt.getTime() > 24 * 60 * 60_000) {
    return 'A time entry cannot exceed 24 hours.';
  }
  if (endedAt.getTime() > Date.now() + 5 * 60_000) return 'Show time cannot end in the future.';

  const startWorkDate = getWorkDate(startedAt);
  const endWorkDate = getWorkDate(new Date(endedAt.getTime() - 1));
  if (startWorkDate !== input.workDate || endWorkDate !== input.workDate) {
    return `The entry must stay inside the ${input.workDate} workday (07:00 to 07:00).`;
  }
  if (!input.comment.trim()) return 'Describe the work performed.';
  if (!progressOptions.includes(input.percentage)) return 'Select progress from 10% to 100%.';
  return null;
}

export function TimesheetsPage({ onManageShows, canManageShows }: TimesheetsPageProps) {
  const defaultWorkDate = useMemo(currentIndiaWorkDate, []);
  const [workDate, setWorkDate] = useUrlQueryState('date', defaultWorkDate, parseIsoDate);
  const [showFilter, setShowFilter] = useUrlQueryState('show', 'all', parseShowFilter);
  const [sortKey, setSortKey] = useUrlQueryState<TimesheetSortKey>(
    'sort',
    'start',
    parseTimesheetSort,
  );
  const [sortDirection, setSortDirection] = useUrlQueryState<SortDirection>(
    'order',
    'asc',
    parseSortDirection,
  );
  const [pageNumber, setPageNumber] = useUrlQueryState('page', 1, parsePage);
  const [rowsPerPage, setRowsPerPage] = useUrlQueryState('size', 25, parsePageSize);
  const timesheet = useTimesheetDay(workDate);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntryDto | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryDto | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<TimeEntryDto | null>(null);
  const [showId, setShowId] = useState('');
  const [startedAt, setStartedAt] = useState(`${workDate}T09:00`);
  const [endedAt, setEndedAt] = useState(`${workDate}T10:00`);
  const [comment, setComment] = useState('');
  const [percentage, setPercentage] = useState('100');
  const percentageValue = Number(percentage);
  const entries = timesheet.day?.entries ?? [];
  const entryOptions = useMemo(() => {
    const options = timesheet.options.map((show) => ({ ...show, inactive: false }));
    if (editingEntry && !options.some((show) => show.id === editingEntry.showId)) {
      options.push({
        id: editingEntry.showId,
        code: editingEntry.showCode,
        name: editingEntry.showName,
        inactive: true,
      });
    }
    return options;
  }, [editingEntry, timesheet.options]);
  const filterOptions = useMemo(() => {
    const options = new Map(timesheet.options.map((show) => [show.id, show]));
    for (const entry of entries) {
      if (!options.has(entry.showId)) {
        options.set(entry.showId, {
          id: entry.showId,
          code: entry.showCode,
          name: entry.showName,
        });
      }
    }
    return [...options.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [entries, timesheet.options]);
  const selectedShowId = entryOptions.some((show) => show.id === showId) ? showId : '';
  const formValidationError = formOpen
    ? validateEntryForm({
        workDate,
        showId: selectedShowId,
        startedAt,
        endedAt,
        comment,
        percentage: percentageValue,
      })
    : null;

  useEffect(() => {
    setFormOpen(false);
    setEditingEntry(null);
    setSelectedEntry(null);
    setDeleteEntry(null);
    setStartedAt(`${workDate}T09:00`);
    setEndedAt(`${workDate}T10:00`);
  }, [workDate]);

  useEffect(() => {
    if (!timesheet.options.length || selectedShowId) return;
    setShowId(timesheet.options[0]!.id);
  }, [selectedShowId, timesheet.options]);

  useEffect(() => {
    if (
      !timesheet.isLoading &&
      showFilter !== 'all' &&
      !filterOptions.some((show) => show.id === showFilter)
    ) {
      setShowFilter('all');
    }
  }, [filterOptions, setShowFilter, showFilter, timesheet.isLoading]);

  const filteredEntries = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return entries
      .filter((entry) => showFilter === 'all' || entry.showId === showFilter)
      .slice()
      .sort(
        (left, right) =>
          compareEntries(left, right, sortKey) * direction ||
          left.startedAt.localeCompare(right.startedAt),
      );
  }, [entries, showFilter, sortDirection, sortKey]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredEntries.length / rowsPerPage));
    if (pageNumber > lastPage) setPageNumber(lastPage);
  }, [filteredEntries.length, pageNumber, rowsPerPage, setPageNumber]);

  const openCreate = () => {
    timesheet.clearError();
    setEditingEntry(null);
    setStartedAt(`${workDate}T09:00`);
    setEndedAt(`${workDate}T10:00`);
    setComment('');
    setPercentage('100');
    setFormOpen(true);
  };

  const openEdit = (entry: TimeEntryDto) => {
    timesheet.clearError();
    setEditingEntry(entry);
    setShowId(entry.showId);
    setStartedAt(isoToIndiaLocalInput(entry.startedAt));
    setEndedAt(isoToIndiaLocalInput(entry.endedAt));
    setComment(entry.comment);
    setPercentage(String(entry.percentage));
    setSelectedEntry(null);
    setFormOpen(true);
  };

  const submitEntry = async (event: FormEvent) => {
    event.preventDefault();
    if (formValidationError) return;
    const input: CreateTimeEntryRequest = {
      showId: selectedShowId,
      startedAt: indiaLocalInputToIso(startedAt),
      endedAt: indiaLocalInputToIso(endedAt),
      comment,
      percentage: percentageValue,
    };
    try {
      if (editingEntry) await timesheet.update(editingEntry.id, input);
      else await timesheet.create(input);
      setFormOpen(false);
      setEditingEntry(null);
    } catch {
      // The mutation error is rendered in the entry dialog.
    }
  };

  const confirmDelete = async () => {
    if (!deleteEntry) return;
    try {
      await timesheet.remove(deleteEntry.id);
      if (selectedEntry?.id === deleteEntry.id) setSelectedEntry(null);
      setDeleteEntry(null);
    } catch {
      // The mutation error is rendered in the confirmation dialog.
    }
  };

  const updateSort = (key: TimesheetSortKey) => {
    if (key === sortKey) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPageNumber(1);
  };

  const columns: ReadonlyArray<DataTableColumn<TimeEntryDto, TimesheetSortKey>> = [
    {
      id: 'time',
      label: 'Time',
      sortKey: 'start',
      width: 112,
      render: (entry) => (
        <Box>
          <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
            {formatIndiaTime(entry.startedAt)}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
            to {formatIndiaTime(entry.endedAt)}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'show',
      label: 'Show',
      sortKey: 'show',
      minWidth: 180,
      render: (entry) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 750 }}>
            {entry.showName}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{entry.showCode}</Typography>
          <Typography
            noWrap
            sx={{ display: { xs: 'block', sm: 'none' }, mt: 0.35, maxWidth: 190, fontSize: 10.5 }}
          >
            {entry.comment} · {entry.percentage}%
          </Typography>
        </Box>
      ),
    },
    {
      id: 'comment',
      label: 'Work comment',
      minWidth: 280,
      hideBelow: 'sm',
      render: (entry) => (
        <Typography noWrap sx={{ maxWidth: 420, fontSize: 12 }}>
          {entry.comment}
        </Typography>
      ),
    },
    {
      id: 'duration',
      label: 'Duration',
      sortKey: 'duration',
      align: 'right',
      hideBelow: 'sm',
      width: 110,
      render: (entry) => formatMinutes(entry.durationMinutes),
    },
    {
      id: 'progress',
      label: 'Progress',
      sortKey: 'percentage',
      align: 'right',
      hideBelow: 'sm',
      width: 105,
      render: (entry) => `${entry.percentage}%`,
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      width: 84,
      render: (entry) => (
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="Edit entry">
            <IconButton
              aria-label={`Edit ${entry.showCode} entry`}
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                openEdit(entry);
              }}
            >
              <Pencil size={15} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete entry">
            <IconButton
              aria-label={`Delete ${entry.showCode} entry`}
              color="error"
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                timesheet.clearError();
                setDeleteEntry(entry);
              }}
            >
              <Trash2 size={15} />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        eyebrow="SHOW TIME"
        title="Timesheets"
        meta={`${formatMinutes(timesheet.day?.totalMinutes ?? 0)} recorded · ${workDate}`}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Tooltip title="Previous day">
                <IconButton
                  aria-label="Previous timesheet day"
                  onClick={() => setWorkDate(moveDate(workDate, -1))}
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                >
                  <ChevronLeft size={18} />
                </IconButton>
              </Tooltip>
              <TextField
                size="small"
                type="date"
                label="Timesheet date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ flex: 1, minWidth: 150 }}
              />
              <Tooltip title="Next day">
                <IconButton
                  aria-label="Next timesheet day"
                  onClick={() => setWorkDate(moveDate(workDate, 1))}
                  sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
                >
                  <ChevronRight size={18} />
                </IconButton>
              </Tooltip>
            </Stack>
            <Button
              variant="contained"
              startIcon={<Plus size={17} />}
              disabled={!timesheet.canCreate}
              onClick={openCreate}
            >
              Add entry
            </Button>
          </Stack>
        }
      />

      {!timesheet.canCreate && (
        <Alert severity="warning">Your account does not have timesheet permission.</Alert>
      )}
      {timesheet.error && !formOpen && <Alert severity="error">{timesheet.error.message}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          minHeight: 72,
          px: { xs: 1.5, sm: 2 },
          py: 1.25,
          alignItems: 'center',
          gap: 2,
          borderTop: '1px solid',
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: '#fff',
        }}
      >
        <SummaryValue label="Total" value={formatMinutes(timesheet.day?.totalMinutes ?? 0)} />
        <SummaryValue label="Entries" value={String(timesheet.day?.entryCount ?? 0)} />
        <SummaryValue label="Average progress" value={`${timesheet.day?.averageProgress ?? 0}%`} />
      </Box>

      <FilterBar
        resultCount={filteredEntries.length}
        resultLabel={filteredEntries.length === 1 ? 'entry' : 'entries'}
        hasActiveFilters={showFilter !== 'all'}
        onClear={() => {
          setShowFilter('all');
          setPageNumber(1);
        }}
      >
        <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 240 } }}>
          <InputLabel id="timesheet-show-filter-label">Show</InputLabel>
          <Select
            labelId="timesheet-show-filter-label"
            label="Show"
            value={showFilter}
            onChange={(event) => {
              setShowFilter(event.target.value);
              setPageNumber(1);
            }}
          >
            <MenuItem value="all">All shows</MenuItem>
            {filterOptions.map((show) => (
              <MenuItem key={show.id} value={show.id}>
                {show.code} · {show.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FilterBar>

      <DataTable
        ariaLabel="Timesheet entries"
        rows={filteredEntries}
        columns={columns}
        getRowId={(entry) => entry.id}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={updateSort}
        page={pageNumber - 1}
        rowsPerPage={rowsPerPage}
        onPageChange={(page) => setPageNumber(page + 1)}
        onRowsPerPageChange={(size) => {
          setRowsPerPage(size);
          setPageNumber(1);
        }}
        onRowClick={setSelectedEntry}
        isLoading={timesheet.isLoading}
        emptyTitle={entries.length ? 'No entries match this show' : 'No show time recorded'}
        emptyMessage={
          entries.length
            ? 'Change or clear the show filter.'
            : 'Add the first show entry for this work date.'
        }
      />

      <EntryFormDialog
        open={formOpen}
        editing={Boolean(editingEntry)}
        options={entryOptions}
        selectedShowId={selectedShowId}
        startedAt={startedAt}
        endedAt={endedAt}
        comment={comment}
        percentage={percentage}
        isUpdating={timesheet.isSaving}
        error={formOpen ? timesheet.error?.message : undefined}
        validationError={formValidationError ?? undefined}
        canManageShows={canManageShows}
        onShowChange={setShowId}
        onStartedAtChange={setStartedAt}
        onEndedAtChange={setEndedAt}
        onCommentChange={setComment}
        onPercentageChange={setPercentage}
        onManageShows={onManageShows}
        onClose={() => {
          setFormOpen(false);
          setEditingEntry(null);
          timesheet.clearError();
        }}
        onSubmit={submitEntry}
      />

      <EntryDetailsDrawer
        entry={selectedEntry}
        onEdit={openEdit}
        onClose={() => setSelectedEntry(null)}
      />

      <Dialog
        open={Boolean(deleteEntry)}
        onClose={timesheet.isDeleting ? undefined : () => setDeleteEntry(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontSize: 18, fontWeight: 850 }}>Delete time entry?</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            {timesheet.error && <Alert severity="error">{timesheet.error.message}</Alert>}
            <Typography sx={{ fontSize: 13.5 }}>
              {deleteEntry
                ? `${deleteEntry.showCode} · ${formatIndiaTime(deleteEntry.startedAt)} to ${formatIndiaTime(deleteEntry.endedAt)}`
                : ''}
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 12.5 }}>
              This removes the entry from the day and cannot be undone.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button
            color="inherit"
            disabled={timesheet.isDeleting}
            onClick={() => {
              setDeleteEntry(null);
              timesheet.clearError();
            }}
          >
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={timesheet.isDeleting}
            startIcon={timesheet.isDeleting ? <CircularProgress size={15} /> : <Trash2 size={16} />}
            onClick={() => void confirmDelete()}
          >
            Delete entry
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{label}</Typography>
      <Typography sx={{ mt: 0.15, fontSize: 15, fontWeight: 850 }}>{value}</Typography>
    </Box>
  );
}

function EntryFormDialog({
  open,
  editing,
  options,
  selectedShowId,
  startedAt,
  endedAt,
  comment,
  percentage,
  isUpdating,
  error,
  validationError,
  canManageShows,
  onShowChange,
  onStartedAtChange,
  onEndedAtChange,
  onCommentChange,
  onPercentageChange,
  onManageShows,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  options: Array<{ id: string; code: string; name: string; inactive: boolean }>;
  selectedShowId: string;
  startedAt: string;
  endedAt: string;
  comment: string;
  percentage: string;
  isUpdating: boolean;
  error?: string;
  validationError?: string;
  canManageShows: boolean;
  onShowChange: (value: string) => void;
  onStartedAtChange: (value: string) => void;
  onEndedAtChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onPercentageChange: (value: string) => void;
  onManageShows: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Dialog open={open} onClose={isUpdating ? undefined : onClose} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={(event) => void onSubmit(event)}>
        <DialogTitle sx={{ fontSize: 18, fontWeight: 850 }}>
          {editing ? 'Edit show time' : 'Add show time'}
        </DialogTitle>
        <DialogContent dividers>
          {options.length === 0 ? (
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
              No active shows are available.
            </Alert>
          ) : (
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              {error && <Alert severity="error">{error}</Alert>}
              {!error && validationError && <Alert severity="warning">{validationError}</Alert>}
              <FormControl fullWidth>
                <InputLabel id="timesheet-entry-show-label">Show</InputLabel>
                <Select
                  labelId="timesheet-entry-show-label"
                  label="Show"
                  value={selectedShowId}
                  onChange={(event) => onShowChange(event.target.value)}
                >
                  {options.map((show) => (
                    <MenuItem key={show.id} value={show.id}>
                      {show.code} · {show.name}
                      {show.inactive ? ' (inactive)' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
              >
                <TextField
                  type="datetime-local"
                  label="Started at"
                  value={startedAt}
                  onChange={(event) => onStartedAtChange(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
                <TextField
                  type="datetime-local"
                  label="Ended at"
                  value={endedAt}
                  onChange={(event) => onEndedAtChange(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
              </Box>
              <TextField
                label="Work comment"
                placeholder="Describe the task or work performed"
                value={comment}
                onChange={(event) => onCommentChange(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 500 } }}
                multiline
                minRows={2}
                required
              />
              <FormControl fullWidth>
                <InputLabel id="timesheet-progress-label">Progress</InputLabel>
                <Select
                  labelId="timesheet-progress-label"
                  label="Progress"
                  value={percentage}
                  onChange={(event) => onPercentageChange(event.target.value)}
                >
                  {progressOptions.map((value) => (
                    <MenuItem key={value} value={String(value)}>
                      {value}%
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button color="inherit" onClick={onClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={
              !options.length ||
              !selectedShowId ||
              !startedAt ||
              !endedAt ||
              !comment.trim() ||
              !progressOptions.includes(Number(percentage)) ||
              Boolean(validationError) ||
              isUpdating
            }
            startIcon={isUpdating ? <CircularProgress size={15} /> : <Clock3 size={16} />}
          >
            {editing ? 'Update entry' : 'Save entry'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function EntryDetailsDrawer({
  entry,
  onEdit,
  onClose,
}: {
  entry: TimeEntryDto | null;
  onEdit: (entry: TimeEntryDto) => void;
  onClose: () => void;
}) {
  return (
    <Drawer
      anchor="right"
      open={Boolean(entry)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 480 }, maxWidth: '100vw' } } }}
    >
      <Stack sx={{ height: '100%' }}>
        <Stack direction="row" sx={{ minHeight: 72, px: 2.5, alignItems: 'center', gap: 1.5 }}>
          <FileClock size={19} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: 17, fontWeight: 850 }}>
              {entry?.showName ?? 'Entry details'}
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
              {entry?.showCode}
            </Typography>
          </Box>
          {entry && (
            <Tooltip title="Edit entry">
              <IconButton aria-label="Edit entry" onClick={() => onEdit(entry)}>
                <Pencil size={18} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Close entry details">
            <IconButton aria-label="Close entry details" onClick={onClose}>
              <X size={19} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Divider />
        {entry && (
          <Stack spacing={2.5} sx={{ p: 2.5, overflowY: 'auto' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
              <Detail label="Work date" value={entry.workDate} />
              <Detail label="Duration" value={formatMinutes(entry.durationMinutes)} />
              <Detail label="Started" value={formatIndiaTime(entry.startedAt)} />
              <Detail label="Ended" value={formatIndiaTime(entry.endedAt)} />
              <Detail label="Progress" value={`${entry.percentage}%`} />
            </Box>
            <Divider />
            <Detail label="Work comment" value={entry.comment} />
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{label}</Typography>
      <Typography sx={{ mt: 0.25, fontSize: 12.5, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

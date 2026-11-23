import type { CreateTimeEntryRequest, TimeEntryDto } from '@gnomon/shared';
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
  Chip,
  Drawer,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock3,
  Download,
  FileClock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { ColumnPicker } from '../components/data-view/ColumnPicker';
import { DataGrid, type DataGridColumn } from '../components/data-view/DataGrid';
import { MultiSelectFilter } from '../components/data-view/MultiSelectFilter';
import { PageHeader } from '../components/data-view/PageHeader';
import { useAuth } from '../lib/auth';
import { useStoredColumnOrder } from '../lib/column-order';
import { downloadCsv } from '../lib/csv';
import { readFormDraft, useSessionFormDraft } from '../lib/form-drafts';
import {
  buildMyTimesheetExport,
  defaultMyTimesheetSort,
  entryGroupFor,
  filterEntries,
  movePeriod,
  myTimesheetColumnIds,
  myTimesheetColumnLabels,
  myTimesheetGroupLabels,
  myTimesheetGroupOptions,
  nextMyTimesheetSort,
  orderEntries,
  parseMyTimesheetSort,
  periodRange,
  progressBands,
  serializeMyTimesheetSort,
  timesheetPeriods,
  type MyTimesheetColumnId,
  type MyTimesheetGroupBy,
  type MyTimesheetSortRule,
  type TimesheetPeriod,
} from '../lib/my-timesheet-view';
import {
  currentIndiaWorkDate,
  formatMinutes,
  useTimesheetDay,
  useTimesheetRange,
} from '../lib/timesheets';
import {
  parseEnumValue,
  parseIsoDate,
  parseShortSearch,
  useUrlQueryState,
} from '../lib/url-query-state';
import { confirmDiscardChanges, useUnsavedChanges } from '../lib/unsaved-changes';

interface TimesheetsPageProps {
  onManageShows: () => void;
  canManageShows: boolean;
}

const LIST_SEPARATOR = '|';
const emptyList: readonly string[] = [];
const parseList = (value: string): readonly string[] | null => {
  const items = value.split(LIST_SEPARATOR).filter(Boolean);
  return items.length <= 100 && items.every((item) => item.length <= 40) ? items : null;
};
const serializeList = (items: readonly string[]) => items.join(LIST_SEPARATOR);
const parsePeriod = (value: string) => parseEnumValue(value, timesheetPeriods);
const parseGroupBy = (value: string) => parseEnumValue(value, myTimesheetGroupOptions);
const parseSort = (value: string) => parseMyTimesheetSort(value);
const serializeSort = (rules: readonly MyTimesheetSortRule[]) => serializeMyTimesheetSort(rules);
const VISIBLE_COLUMNS_KEY = 'gnomon:my-timesheets:visible-columns';
const COLUMN_ORDER_KEY = 'gnomon:my-timesheets:column-order';
const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: 'var(--g-base)' } };
const outlinedButtonSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '10px',
  bgcolor: 'var(--g-base)',
};

function readVisibleColumns(): MyTimesheetColumnId[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(VISIBLE_COLUMNS_KEY) ?? 'null');
    if (Array.isArray(value)) {
      const valid = myTimesheetColumnIds.filter((id) => value.includes(id));
      if (valid.length) return valid;
    }
  } catch {
    // Fall back to every column.
  }
  return [...myTimesheetColumnIds];
}
const progressOptions = Array.from({ length: 10 }, (_, index) => (index + 1) * 10);

interface TimesheetFormDraft {
  workDate: string;
  showId: string;
  hours: string;
  comment: string;
  percentage: string;
}

function isTimesheetFormDraft(value: unknown): value is TimesheetFormDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<TimesheetFormDraft>;
  return (
    typeof draft.workDate === 'string' &&
    typeof draft.showId === 'string' &&
    typeof draft.hours === 'string' &&
    typeof draft.comment === 'string' &&
    typeof draft.percentage === 'string'
  );
}

const defaultHours = '1';

function formatHoursInput(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

function validateEntryForm(input: {
  workDate: string;
  showId: string;
  hours: string;
  comment: string;
  percentage: number;
}): string | null {
  if (!input.showId) return 'Select a show.';
  const hours = Number(input.hours);
  if (!input.hours.trim() || !Number.isFinite(hours) || hours <= 0) {
    return 'Enter the number of hours worked.';
  }
  if (hours > 24) return 'A time entry cannot exceed 24 hours.';
  if (!Number.isInteger(hours * 4)) return 'Use quarter-hour steps (e.g. 1.25, 2.5).';
  if (input.workDate > currentIndiaWorkDate())
    return 'Show time cannot be logged for a future date.';
  if (!input.comment.trim()) return 'Describe the work performed.';
  if (!progressOptions.includes(input.percentage)) return 'Select progress from 10% to 100%.';
  return null;
}

export function TimesheetsPage({ onManageShows, canManageShows }: TimesheetsPageProps) {
  const { user } = useAuth();
  const defaultWorkDate = useMemo(currentIndiaWorkDate, []);
  const draftKey = `${user?.employeeId ?? 'anonymous'}:timesheet-entry`;
  const recoveredDraft = useMemo(() => readFormDraft(draftKey, isTimesheetFormDraft), [draftKey]);
  const [workDate, setWorkDate] = useUrlQueryState(
    'date',
    recoveredDraft?.workDate ?? defaultWorkDate,
    parseIsoDate,
  );
  const [period, setPeriod] = useUrlQueryState<TimesheetPeriod>('period', 'day', parsePeriod);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [showFilter, setShowFilter] = useUrlQueryState('show', emptyList, parseList, serializeList);
  const [progressFilter, setProgressFilter] = useUrlQueryState(
    'progress',
    emptyList,
    parseList,
    serializeList,
  );
  const [groupBy, setGroupBy] = useUrlQueryState<MyTimesheetGroupBy>('group', 'none', parseGroupBy);
  const [sortRules, setSortRules] = useUrlQueryState<readonly MyTimesheetSortRule[]>(
    'sort',
    defaultMyTimesheetSort,
    parseSort,
    serializeSort,
  );
  const [visibleColumns, setVisibleColumns] = useState<MyTimesheetColumnId[]>(readVisibleColumns);
  const columnOrder = useStoredColumnOrder(COLUMN_ORDER_KEY, myTimesheetColumnIds);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const timesheet = useTimesheetDay(workDate);
  const range = useMemo(() => periodRange(period, workDate), [period, workDate]);
  const rangeData = useTimesheetRange(range.from, range.to);
  const [formOpen, setFormOpen] = useState(Boolean(recoveredDraft));
  const [editingEntry, setEditingEntry] = useState<TimeEntryDto | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TimeEntryDto | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<TimeEntryDto | null>(null);
  const [showId, setShowId] = useState(recoveredDraft?.showId ?? '');
  const [hours, setHours] = useState(recoveredDraft?.hours ?? defaultHours);
  const [comment, setComment] = useState(recoveredDraft?.comment ?? '');
  const [percentage, setPercentage] = useState(recoveredDraft?.percentage ?? '100');
  const recoveredOnMount = useRef(Boolean(recoveredDraft && recoveredDraft.workDate === workDate));
  const percentageValue = Number(percentage);
  const entries = period === 'day' ? (timesheet.day?.entries ?? []) : rangeData.entries;
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
    return [...options.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((show) => ({
        value: show.id,
        label: `${show.code} · ${show.name}`,
        secondary: `${entries.filter((entry) => entry.showId === show.id).length} entries`,
      }));
  }, [entries, timesheet.options]);
  const selectedShowId = entryOptions.some((show) => show.id === showId) ? showId : '';
  const formValidationError = formOpen
    ? validateEntryForm({
        workDate: editingEntry?.workDate ?? workDate,
        showId: selectedShowId,
        hours,
        comment,
        percentage: percentageValue,
      })
    : null;
  const formDirty = Boolean(
    formOpen &&
    (editingEntry
      ? showId !== editingEntry.showId ||
        hours !== formatHoursInput(editingEntry.durationMinutes) ||
        comment !== editingEntry.comment ||
        percentage !== String(editingEntry.percentage)
      : hours !== defaultHours || Boolean(comment) || percentage !== '100'),
  );
  const draft = useMemo(
    () => ({ workDate, showId, hours, comment, percentage }),
    [comment, hours, percentage, showId, workDate],
  );
  const clearDraft = useSessionFormDraft(draftKey, draft, formDirty && !editingEntry);
  useUnsavedChanges(formDirty);

  const closeForm = () => {
    if (formDirty && !confirmDiscardChanges()) return;
    clearDraft();
    setFormOpen(false);
    setEditingEntry(null);
    setComment('');
    setPercentage('100');
    timesheet.clearError();
  };

  useEffect(() => {
    if (recoveredOnMount.current) {
      recoveredOnMount.current = false;
      return;
    }
    setFormOpen(false);
    setEditingEntry(null);
    setSelectedEntry(null);
    setDeleteEntry(null);
    setHours(defaultHours);
  }, [workDate]);

  useEffect(() => {
    if (!timesheet.options.length || selectedShowId) return;
    setShowId(timesheet.options[0]!.id);
  }, [selectedShowId, timesheet.options]);

  useEffect(() => {
    try {
      localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns));
    } catch {
      // Preferences are a convenience; ignore blocked storage.
    }
  }, [visibleColumns]);

  const viewRows = useMemo(
    () =>
      orderEntries(
        filterEntries(entries, { search, showIds: showFilter, progress: progressFilter }),
        sortRules,
        groupBy,
      ),
    [entries, groupBy, progressFilter, search, showFilter, sortRules],
  );
  const groupKeys = useMemo(
    () =>
      groupBy === 'none'
        ? []
        : [...new Set(viewRows.map((entry) => entryGroupFor(entry, groupBy).key))],
    [groupBy, viewRows],
  );
  const totals = useMemo(
    () => ({
      minutes: viewRows.reduce((total, entry) => total + entry.durationMinutes, 0),
      count: viewRows.length,
      progress: viewRows.length
        ? Math.round(
            viewRows.reduce((total, entry) => total + entry.percentage, 0) / viewRows.length,
          )
        : 0,
      days: new Set(viewRows.map((entry) => entry.workDate)).size,
    }),
    [viewRows],
  );
  useEffect(() => setPage(0), [groupBy, period, progressFilter, range.from, search, showFilter]);
  useEffect(() => setCollapsedGroups(new Set()), [groupBy]);

  const openCreate = () => {
    timesheet.clearError();
    setEditingEntry(null);
    setHours(defaultHours);
    setComment('');
    setPercentage('100');
    setFormOpen(true);
  };

  const openEdit = (entry: TimeEntryDto) => {
    timesheet.clearError();
    setEditingEntry(entry);
    setShowId(entry.showId);
    setHours(formatHoursInput(entry.durationMinutes));
    setComment(entry.comment);
    setPercentage(String(entry.percentage));
    setSelectedEntry(null);
    setFormOpen(true);
  };

  const submitEntry = async (event: FormEvent) => {
    event.preventDefault();
    if (formValidationError) return;
    const input: CreateTimeEntryRequest = {
      workDate: editingEntry?.workDate ?? workDate,
      showId: selectedShowId,
      hours: Number(hours),
      comment,
      percentage: percentageValue,
    };
    try {
      if (editingEntry) await timesheet.update(editingEntry.id, input);
      else await timesheet.create(input);
      clearDraft();
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

  const allColumns: Record<
    MyTimesheetColumnId,
    DataGridColumn<TimeEntryDto, MyTimesheetColumnId>
  > = {
    date: {
      id: 'date',
      label: myTimesheetColumnLabels.date,
      sortKey: 'date',
      width: 130,
      render: (entry) => (
        <Typography sx={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
          {entry.workDate}
        </Typography>
      ),
    },
    show: {
      id: 'show',
      label: myTimesheetColumnLabels.show,
      sortKey: 'show',
      minWidth: 190,
      render: (entry) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 750 }}>
            {entry.showName}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>{entry.showCode}</Typography>
        </Box>
      ),
    },
    comment: {
      id: 'comment',
      label: myTimesheetColumnLabels.comment,
      sortKey: 'comment',
      minWidth: 280,
      render: (entry) => (
        <Tooltip title={entry.comment} enterDelay={500}>
          <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary' }}>
            {entry.comment}
          </Typography>
        </Tooltip>
      ),
    },
    hours: {
      id: 'hours',
      label: myTimesheetColumnLabels.hours,
      sortKey: 'hours',
      width: 110,
      align: 'right',
      render: (entry) => (
        <Typography sx={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {formatMinutes(entry.durationMinutes)}
        </Typography>
      ),
    },
    progress: {
      id: 'progress',
      label: myTimesheetColumnLabels.progress,
      sortKey: 'progress',
      width: 120,
      align: 'right',
      render: (entry) => (
        <Typography sx={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
          {entry.percentage}%
        </Typography>
      ),
    },
  };
  const hiddenNow = (id: MyTimesheetColumnId) =>
    (period === 'day' && id === 'date') ||
    (groupBy === 'date' && id === 'date') ||
    (groupBy === 'show' && id === 'show');
  const orderedIds = columnOrder.order.filter(
    (id) => visibleColumns.includes(id) && !hiddenNow(id),
  );
  const gridColumns: DataGridColumn<TimeEntryDto, MyTimesheetColumnId>[] = [
    ...(orderedIds.length ? orderedIds : (['show'] as const)).map((id) => allColumns[id]),
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      width: 96,
      render: (entry) => (
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="Edit entry">
            <IconButton
              aria-label={`Edit ${entry.showCode} entry`}
              size="small"
              onClick={() => openEdit(entry)}
            >
              <Pencil size={15} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete entry">
            <IconButton
              aria-label={`Delete ${entry.showCode} entry`}
              color="error"
              size="small"
              onClick={() => {
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

  const hasFilters =
    Boolean(search) || showFilter.length > 0 || progressFilter.length > 0 || groupBy !== 'none';
  const clearFilters = () => {
    setSearch('');
    setShowFilter([]);
    setProgressFilter([]);
    setGroupBy('none');
  };
  const exportCsv = () => {
    const ids = columnOrder.order.filter(
      (id) => visibleColumns.includes(id) || (id === 'date' && period !== 'day'),
    );
    const withDate = ids.includes('date') ? ids : (['date', ...ids] as MyTimesheetColumnId[]);
    const csv = buildMyTimesheetExport(viewRows, withDate, groupBy);
    downloadCsv(`my-timesheet-${range.from}-to-${range.to}.csv`, csv.headers, csv.rows);
  };
  const periodLabel = period === 'day' ? workDate : `${range.from} – ${range.to}`;
  const isLoading = period === 'day' ? timesheet.isLoading : rangeData.isLoading;

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1600, mx: 'auto' }}>
      <PageHeader
        eyebrow="SHOW TIME"
        title="Timesheets"
        meta={`${formatMinutes(totals.minutes)} recorded · ${periodLabel}`}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={period}
              onChange={(_event, value: TimesheetPeriod | null) => value && setPeriod(value)}
              aria-label="Period"
              sx={{
                bgcolor: 'var(--g-base)',
                '& .MuiToggleButton-root': { borderRadius: '10px', px: 1.5 },
              }}
            >
              <ToggleButton value="day">Day</ToggleButton>
              <ToggleButton value="week">Week</ToggleButton>
              <ToggleButton value="month">Month</ToggleButton>
            </ToggleButtonGroup>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Tooltip title={`Previous ${period}`}>
                <IconButton
                  aria-label="Previous timesheet day"
                  onClick={() => setWorkDate(movePeriod(period, workDate, -1))}
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
              <Tooltip title={`Next ${period}`}>
                <IconButton
                  aria-label="Next timesheet day"
                  onClick={() => setWorkDate(movePeriod(period, workDate, 1))}
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
      {(timesheet.error || rangeData.error) && !formOpen && (
        <Alert severity="error">{(timesheet.error ?? rangeData.error)?.message}</Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          gap: 1.5,
        }}
      >
        <SummaryValue label="Total" value={formatMinutes(totals.minutes)} />
        <SummaryValue label="Entries" value={String(totals.count)} />
        <SummaryValue label="Days with entries" value={String(totals.days)} />
        <SummaryValue label="Average progress" value={`${totals.progress}%`} />
      </Box>

      <Stack direction="row" sx={{ gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search show, comment, date…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ width: { xs: '100%', sm: 250 }, ...fieldSx }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search timesheet entries' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={15} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setSearch('')}>
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        <MultiSelectFilter
          label="Show"
          values={showFilter}
          options={filterOptions}
          onChange={setShowFilter}
          width={200}
          sx={fieldSx}
        />
        <MultiSelectFilter
          label="Progress"
          values={progressFilter}
          options={progressBands.map((band) => ({ value: band.value, label: band.label }))}
          onChange={setProgressFilter}
          width={160}
          sx={fieldSx}
        />
        <TextField
          select
          size="small"
          label="Group by"
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as MyTimesheetGroupBy)}
          sx={{ width: 150, ...fieldSx }}
        >
          {myTimesheetGroupOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {myTimesheetGroupLabels[option]}
            </MenuItem>
          ))}
        </TextField>
        {groupBy !== 'none' && (
          <Tooltip
            title={
              collapsedGroups.size === groupKeys.length
                ? 'Expand all groups'
                : 'Collapse all groups'
            }
          >
            <IconButton
              aria-label={
                collapsedGroups.size === groupKeys.length
                  ? 'Expand all groups'
                  : 'Collapse all groups'
              }
              onClick={() =>
                setCollapsedGroups(
                  collapsedGroups.size === groupKeys.length ? new Set() : new Set(groupKeys),
                )
              }
              sx={outlinedButtonSx}
            >
              {collapsedGroups.size === groupKeys.length ? (
                <ChevronsUpDown size={17} />
              ) : (
                <ChevronsDownUp size={17} />
              )}
            </IconButton>
          </Tooltip>
        )}
        <ColumnPicker
          columns={columnOrder.order.map((id) => ({ id, label: myTimesheetColumnLabels[id] }))}
          visible={visibleColumns}
          onChange={setVisibleColumns}
          onReset={() => {
            setVisibleColumns([...myTimesheetColumnIds]);
            columnOrder.reset();
          }}
        />
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<Download size={15} />}
          onClick={exportCsv}
          disabled={!viewRows.length}
          sx={outlinedButtonSx}
        >
          Export
        </Button>
        {serializeMyTimesheetSort(sortRules) !==
          serializeMyTimesheetSort(defaultMyTimesheetSort) && (
          <Button
            size="small"
            color="inherit"
            startIcon={<RotateCcw size={14} />}
            onClick={() => setSortRules(defaultMyTimesheetSort)}
          >
            Reset sort
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        {hasFilters && (
          <Button color="inherit" size="small" startIcon={<X size={14} />} onClick={clearFilters}>
            Clear
          </Button>
        )}
        <Chip
          size="small"
          label={`${viewRows.length} ${viewRows.length === 1 ? 'entry' : 'entries'}`}
          sx={{ fontWeight: 750, bgcolor: 'var(--g-accent-soft)', color: 'primary.dark' }}
        />
      </Stack>

      {isLoading ? (
        <Box sx={{ minHeight: 280, display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading timesheet" />
        </Box>
      ) : (
        <DataGrid
          ariaLabel="Timesheet entries"
          rows={viewRows}
          columns={gridColumns}
          getRowId={(entry) => entry.id}
          sort={sortRules}
          onSort={(key, additive) => setSortRules(nextMyTimesheetSort(sortRules, key, additive))}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={(value) => {
            setRowsPerPage(value);
            setPage(0);
          }}
          height="56vh"
          emptyTitle={entries.length ? 'No entries match these filters' : 'No show time recorded'}
          emptyMessage={
            entries.length
              ? 'Change or clear the search and filters.'
              : period === 'day'
                ? 'Add the first show entry for this work date.'
                : 'No entries in this period yet.'
          }
          getRowGroup={groupBy === 'none' ? undefined : (entry) => entryGroupFor(entry, groupBy)}
          collapsedGroups={collapsedGroups}
          onToggleGroup={(key) =>
            setCollapsedGroups((current) => {
              const next = new Set(current);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
          renderGroupSummary={(rows) => (
            <Typography sx={{ fontSize: 11.5, fontWeight: 750, color: 'text.secondary' }}>
              {formatMinutes(rows.reduce((total, entry) => total + entry.durationMinutes, 0))}
            </Typography>
          )}
          rowNoun={{ one: 'entry', other: 'entries' }}
          onRowClick={setSelectedEntry}
          onColumnMove={(columnId, targetId, place) => {
            if (columnId === 'actions' || targetId === 'actions') return;
            columnOrder.move(columnId, targetId, place);
          }}
        />
      )}

      <EntryFormDialog
        open={formOpen}
        editing={Boolean(editingEntry)}
        options={entryOptions}
        selectedShowId={selectedShowId}
        hours={hours}
        comment={comment}
        percentage={percentage}
        isUpdating={timesheet.isSaving}
        error={formOpen ? timesheet.error?.message : undefined}
        validationError={formValidationError ?? undefined}
        canManageShows={canManageShows}
        onShowChange={setShowId}
        onHoursChange={setHours}
        onCommentChange={setComment}
        onPercentageChange={setPercentage}
        onManageShows={onManageShows}
        onClose={closeForm}
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
                ? `${deleteEntry.showCode} · ${formatMinutes(deleteEntry.durationMinutes)}`
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
    <Box
      sx={{
        minWidth: 0,
        p: { xs: 1.5, sm: 1.8 },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '18px',
        bgcolor: 'var(--g-base)',
        boxShadow: 'var(--g-raised)',
      }}
    >
      <Typography sx={{ color: 'primary.dark', fontSize: 11.5, fontWeight: 750 }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.35, fontSize: { xs: 14, sm: 17 }, fontWeight: 850 }}>
        {value}
      </Typography>
    </Box>
  );
}

function EntryFormDialog({
  open,
  editing,
  options,
  selectedShowId,
  hours,
  comment,
  percentage,
  isUpdating,
  error,
  validationError,
  canManageShows,
  onShowChange,
  onHoursChange,
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
  hours: string;
  comment: string;
  percentage: string;
  isUpdating: boolean;
  error?: string;
  validationError?: string;
  canManageShows: boolean;
  onShowChange: (value: string) => void;
  onHoursChange: (value: string) => void;
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
              <TextField
                type="number"
                label="Hours"
                value={hours}
                onChange={(event) => onHoursChange(event.target.value)}
                helperText="Total hours spent on this show (e.g. 2 or 1.5)"
                slotProps={{ htmlInput: { min: 0.25, max: 24, step: 0.25, inputMode: 'decimal' } }}
                required
              />
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
              !hours ||
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
              <Detail label="Hours" value={formatMinutes(entry.durationMinutes)} />
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
      <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>{label}</Typography>
      <Typography sx={{ mt: 0.25, fontSize: 12.5, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

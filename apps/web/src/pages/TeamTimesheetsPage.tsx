import type { TeamTimesheetRow } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  Maximize2,
  Minimize2,
  RotateCcw,
  Rows3,
  Rows4,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { DataGrid, type DataGridColumn } from '../components/data-view/DataGrid';
import { MultiSelectFilter } from '../components/data-view/MultiSelectFilter';
import { downloadCsv } from '../lib/csv';
import { fullscreenShortcutLabel, useFullscreenMode } from '../lib/use-fullscreen-mode';
import {
  buildTimesheetExport,
  datePresetLabels,
  datePresets,
  defaultTimesheetSort,
  filterTimesheets,
  formatHours,
  nextTimesheetSort,
  orderTimesheets,
  parseTimesheetSort,
  presetRange,
  serializeTimesheetSort,
  summarizeTimesheets,
  timesheetGroupFor,
  timesheetGroupLabels,
  timesheetGroupOptions,
  todayInIndia,
  UNASSIGNED_DEPARTMENT,
  useTeamTimesheets,
  type DatePreset,
  type TimesheetGroupBy,
  type TimesheetSortKey,
  type TimesheetSortRule,
  timesheetColumnIds,
} from '../lib/team-timesheets';
import { useStoredColumnOrder } from '../lib/column-order';
import {
  parseEnumValue,
  parseIsoDate,
  parseShortSearch,
  useUrlQueryState,
} from '../lib/url-query-state';

const DENSITY_STORAGE_KEY = 'gnomon:team-timesheets:density';
const COLUMN_ORDER_STORAGE_KEY = 'gnomon:team-timesheets:column-order';
const LIST_SEPARATOR = '|';

const parseGroupBy = (value: string) => parseEnumValue(value, timesheetGroupOptions);
const parseSortRules = (value: string) => parseTimesheetSort(value);
const serializeSortRules = (rules: readonly TimesheetSortRule[]) => serializeTimesheetSort(rules);
const parseList = (value: string): readonly string[] | null => {
  const items = value.split(LIST_SEPARATOR).filter(Boolean);
  return items.length <= 100 && items.every((item) => item.length <= 120) ? items : null;
};
const serializeList = (items: readonly string[]) => items.join(LIST_SEPARATOR);
const emptyList: readonly string[] = [];

function readDensity(): 'comfortable' | 'compact' {
  try {
    return localStorage.getItem(DENSITY_STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: 'var(--g-base)' } };
const outlinedButtonSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '10px',
  bgcolor: 'var(--g-base)',
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        px: 1.75,
        py: 0.25,
        '&:not(:first-of-type)': { borderLeft: '1px solid', borderColor: 'divider' },
      }}
    >
      <Typography
        sx={{ fontSize: 17, fontWeight: 850, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}
      >
        {value}
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 11.5, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </Box>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, width: '100%' }}>
      <Box
        sx={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          bgcolor: 'var(--g-base)',
          boxShadow: 'var(--g-inset-sm)',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${value}%`,
            height: '100%',
            borderRadius: 3,
            bgcolor: value >= 100 ? 'var(--g-pr)' : 'var(--g-accent)',
          }}
        />
      </Box>
      <Typography sx={{ width: 34, textAlign: 'right', fontSize: 11.5, fontWeight: 750 }}>
        {value}%
      </Typography>
    </Stack>
  );
}

export function TeamTimesheetsPage() {
  const today = useMemo(() => todayInIndia(), []);
  const thisMonth = useMemo(() => presetRange('thisMonth', today), [today]);
  const [dateFrom, setDateFrom] = useUrlQueryState('from', thisMonth.from, parseIsoDate);
  const [dateTo, setDateTo] = useUrlQueryState('to', thisMonth.to, parseIsoDate);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [departments, setDepartments] = useUrlQueryState(
    'dept',
    emptyList,
    parseList,
    serializeList,
  );
  const [showIds, setShowIds] = useUrlQueryState('show', emptyList, parseList, serializeList);
  const [groupBy, setGroupBy] = useUrlQueryState<TimesheetGroupBy>('group', 'none', parseGroupBy);
  const [sortRules, setSortRules] = useUrlQueryState<readonly TimesheetSortRule[]>(
    'sort',
    defaultTimesheetSort,
    parseSortRules,
    serializeSortRules,
  );
  const [density, setDensity] = useState<'comfortable' | 'compact'>(readDensity);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const { fullscreen, toggle: toggleFullscreen } = useFullscreenMode();

  const validRange = dateFrom <= dateTo;
  const report = useTeamTimesheets(dateFrom, dateTo);
  const timesheets = report.timesheets;
  const columnOrder = useStoredColumnOrder(COLUMN_ORDER_STORAGE_KEY, timesheetColumnIds);

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, density);
    } catch {
      // Preferences are a convenience; ignore blocked storage.
    }
  }, [density]);

  const viewRows = useMemo(
    () =>
      orderTimesheets(
        filterTimesheets(timesheets?.rows ?? [], { search, departments, showIds }),
        sortRules,
        groupBy,
      ),
    [departments, groupBy, search, showIds, sortRules, timesheets?.rows],
  );
  const summary = useMemo(() => summarizeTimesheets(viewRows), [viewRows]);
  const groupKeys = useMemo(
    () =>
      groupBy === 'none'
        ? []
        : [...new Set(viewRows.map((row) => timesheetGroupFor(row, groupBy).key))],
    [groupBy, viewRows],
  );

  useEffect(() => setPage(0), [dateFrom, dateTo, departments, groupBy, search, showIds]);
  useEffect(() => setCollapsedGroups(new Set()), [groupBy]);

  const departmentOptions = useMemo(
    () => [
      ...(timesheets?.departments ?? []).map((name) => ({ value: name, label: name })),
      ...(timesheets?.rows.some((row) => !row.departmentName)
        ? [{ value: UNASSIGNED_DEPARTMENT, label: 'Unassigned' }]
        : []),
    ],
    [timesheets],
  );
  const showOptions = useMemo(
    () =>
      (timesheets?.shows ?? []).map((show) => ({
        value: show.id,
        label: show.code,
        secondary: show.name,
      })),
    [timesheets?.shows],
  );

  const activePreset = datePresets.find((preset) => {
    const range = presetRange(preset, today);
    return range.from === dateFrom && range.to === dateTo;
  });
  const applyPreset = (preset: DatePreset) => {
    const range = presetRange(preset, today);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  /* Full screen: fixed overlay plus native full screen when the browser allows it. */

  const hasFilters =
    Boolean(search) || departments.length > 0 || showIds.length > 0 || groupBy !== 'none';
  const clearFilters = () => {
    setSearch('');
    setDepartments([]);
    setShowIds([]);
    setGroupBy('none');
  };

  const exportCsv = () => {
    const csv = buildTimesheetExport(viewRows, groupBy, columnOrder.order);
    const name = ['timesheets', dateFrom, 'to', dateTo, groupBy !== 'none' ? `by-${groupBy}` : null]
      .filter(Boolean)
      .join('-');
    downloadCsv(`${name}.csv`, csv.headers, csv.rows);
  };

  const allColumns: DataGridColumn<TeamTimesheetRow, TimesheetSortKey>[] = [
    {
      id: 'employee',
      label: 'Employee',
      sortKey: 'employee',
      minWidth: 210,
      sticky: true,
      render: (row) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 750 }}>
            {row.employeeDisplayName}
          </Typography>
          <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11.5 }}>
            {row.employeeCode}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'department',
      label: 'Department',
      sortKey: 'department',
      minWidth: 150,
      render: (row) =>
        row.departmentName ?? (
          <Typography sx={{ color: 'text.disabled', fontSize: 12.5 }}>Unassigned</Typography>
        ),
    },
    {
      id: 'date',
      label: 'Work date',
      sortKey: 'date',
      width: 136,
      render: (row) => (
        <Typography sx={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
          {row.workDate}
        </Typography>
      ),
    },
    {
      id: 'show',
      label: 'Show',
      sortKey: 'show',
      minWidth: 170,
      render: (row) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 750 }}>
            {row.showCode}
          </Typography>
          <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11.5 }}>
            {row.showName}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'duration',
      label: 'Duration',
      sortKey: 'duration',
      width: 128,
      align: 'right',
      render: (row) => (
        <Typography sx={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {formatHours(row.durationMinutes)}
        </Typography>
      ),
    },
    {
      id: 'progress',
      label: 'Progress',
      sortKey: 'progress',
      width: 150,
      render: (row) => <ProgressBar value={row.percentage} />,
    },
    {
      id: 'comment',
      label: 'Comment',
      minWidth: 260,
      render: (row) =>
        row.comment ? (
          <Tooltip title={row.comment} enterDelay={500}>
            <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary' }}>
              {row.comment}
            </Typography>
          </Tooltip>
        ) : (
          <Typography sx={{ color: 'text.disabled', fontSize: 12.5 }}>—</Typography>
        ),
    },
  ];
  const columns = columnOrder.order
    .map((id) => allColumns.find((column) => column.id === id)!)
    .filter(
      (column) =>
        !(groupBy === 'employee' && column.id === 'employee') &&
        !(groupBy === 'department' && column.id === 'department') &&
        !(groupBy === 'show' && column.id === 'show') &&
        !(groupBy === 'date' && column.id === 'date'),
    );

  return (
    <Box
      sx={
        fullscreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 1250,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              p: { xs: 1.5, md: 2.5 },
              bgcolor: 'var(--g-base)',
              boxShadow: 'var(--g-inset-sm)',
              overflow: 'hidden',
            }
          : {
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              width: '100%',
              maxWidth: 1800,
              mx: 'auto',
            }
      }
    >
      {/* Header: title, date range, export, full screen */}
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        sx={{ alignItems: { lg: 'center' }, justifyContent: 'space-between', gap: 2 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{ fontSize: fullscreen ? 20 : 24, fontWeight: 850, letterSpacing: '-0.03em' }}
          >
            Team timesheets
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12.5, mt: 0.25 }}>
            Show time logged by your team and on the shows you manage
          </Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            type="date"
            label="From"
            value={dateFrom}
            onChange={(event) => event.target.value && setDateFrom(event.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: dateTo } }}
            sx={{ width: 158, ...fieldSx }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={dateTo}
            onChange={(event) => event.target.value && setDateTo(event.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dateFrom } }}
            sx={{ width: 158, ...fieldSx }}
          />
          <Button
            variant="contained"
            startIcon={<Download size={16} />}
            disabled={viewRows.length === 0}
            onClick={exportCsv}
            sx={{ borderRadius: '10px', boxShadow: 'none', whiteSpace: 'nowrap' }}
          >
            Export CSV
          </Button>
          <Tooltip
            title={
              fullscreen
                ? `Exit full screen (Esc or ${fullscreenShortcutLabel()})`
                : `Full screen (${fullscreenShortcutLabel()})`
            }
          >
            <IconButton
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              onClick={toggleFullscreen}
              sx={outlinedButtonSx}
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* Quick ranges and totals for the current view */}
      <Stack
        direction="row"
        sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}
      >
        <Stack
          direction="row"
          sx={{ gap: 1, flexWrap: 'wrap' }}
          role="group"
          aria-label="Date range"
        >
          {datePresets.map((preset) => {
            const selected = activePreset === preset;
            return (
              <ButtonBase
                key={preset}
                aria-pressed={selected}
                onClick={() => applyPreset(preset)}
                sx={{
                  px: 1.4,
                  py: 0.7,
                  borderRadius: '10px',
                  border: '1px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: 'var(--g-base)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  '&:hover': { color: 'var(--g-fg)' },
                }}
              >
                {datePresetLabels[preset]}
              </ButtonBase>
            );
          })}
        </Stack>
        {timesheets && (
          <Stack
            direction="row"
            sx={{
              py: 0.75,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '12px',
              bgcolor: 'var(--g-base)',
              overflowX: 'auto',
              maxWidth: '100%',
            }}
          >
            <Stat label="Total time" value={formatHours(summary.minutes)} />
            <Stat label="Entries" value={summary.entries.toLocaleString('en-IN')} />
            <Stat label="People" value={summary.people.toLocaleString('en-IN')} />
            <Stat label="Shows" value={summary.shows.toLocaleString('en-IN')} />
            <Stat label="Avg progress" value={`${summary.averageProgress}%`} />
          </Stack>
        )}
      </Stack>

      {!report.canRead && (
        <Alert severity="warning">Your account cannot review team timesheets.</Alert>
      )}
      {!validRange && (
        <Alert severity="warning">The start date must be on or before the end date.</Alert>
      )}
      {report.error && <Alert severity="error">{report.error.message}</Alert>}

      {/* Toolbar */}
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          p: 1.25,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: '14px',
          bgcolor: 'var(--g-base)',
          boxShadow: 'var(--g-inset-sm)',
        }}
      >
        <TextField
          size="small"
          placeholder="Search person, show, comment…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ width: { xs: '100%', sm: 240 }, ...fieldSx }}
          slotProps={{
            htmlInput: { maxLength: 100, 'aria-label': 'Search timesheets' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
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
          label="Department"
          values={departments}
          options={departmentOptions}
          onChange={setDepartments}
          width={190}
          sx={fieldSx}
        />
        <MultiSelectFilter
          label="Show"
          values={showIds}
          options={showOptions}
          onChange={setShowIds}
          width={170}
          sx={fieldSx}
        />
        <TextField
          select
          size="small"
          label="Group by"
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as TimesheetGroupBy)}
          sx={{ width: 160, ...fieldSx }}
        >
          {timesheetGroupOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {timesheetGroupLabels[option]}
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
        {serializeTimesheetSort(sortRules) !== serializeTimesheetSort(defaultTimesheetSort) && (
          <Button
            size="small"
            color="inherit"
            startIcon={<RotateCcw size={14} />}
            onClick={() => setSortRules(defaultTimesheetSort)}
          >
            Reset sort
          </Button>
        )}
        <ToggleButtonGroup
          exclusive
          size="small"
          value={density}
          onChange={(_event, value: 'comfortable' | 'compact' | null) => value && setDensity(value)}
          aria-label="Row density"
          sx={{
            bgcolor: 'var(--g-base)',
            '& .MuiToggleButton-root': { borderRadius: '10px', px: 1 },
          }}
        >
          <ToggleButton value="comfortable" aria-label="Comfortable rows">
            <Rows3 size={16} />
          </ToggleButton>
          <ToggleButton value="compact" aria-label="Compact rows">
            <Rows4 size={16} />
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        {hasFilters && (
          <Button color="inherit" size="small" startIcon={<X size={14} />} onClick={clearFilters}>
            Clear
          </Button>
        )}
        {!columnOrder.isDefault && (
          <Button color="inherit" size="small" onClick={columnOrder.reset}>
            Reset column order
          </Button>
        )}
        <Chip
          size="small"
          label={`${viewRows.length.toLocaleString('en-IN')} ${viewRows.length === 1 ? 'entry' : 'entries'}`}
          sx={{ fontWeight: 750, bgcolor: 'var(--g-accent-soft)', color: 'primary.dark' }}
        />
      </Stack>

      {report.isLoading ? (
        <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading timesheets" />
        </Box>
      ) : (
        <DataGrid
          ariaLabel="Team timesheet entries"
          rows={viewRows}
          columns={columns}
          getRowId={(row) => row.id}
          sort={sortRules}
          onSort={(key, additive) => setSortRules(nextTimesheetSort(sortRules, key, additive))}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={(value) => {
            setRowsPerPage(value);
            setPage(0);
          }}
          density={density}
          rowNoun={{ one: 'entry', other: 'entries' }}
          onColumnMove={columnOrder.move}
          fill={fullscreen}
          height="calc(100vh - 360px)"
          emptyTitle="No timesheet entries"
          emptyMessage={
            hasFilters
              ? 'No entries match these filters. Clear them to see everything in this range.'
              : 'Nobody in your scope logged show time in this date range.'
          }
          getRowGroup={groupBy === 'none' ? undefined : (row) => timesheetGroupFor(row, groupBy)}
          collapsedGroups={collapsedGroups}
          onToggleGroup={(key) =>
            setCollapsedGroups((current) => {
              const next = new Set(current);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
          renderGroupSummary={(rows) => {
            const group = summarizeTimesheets(rows);
            return (
              <Typography
                sx={{ ml: 0.5, color: 'text.secondary', fontSize: 11, whiteSpace: 'nowrap' }}
              >
                {formatHours(group.minutes)} · {group.people}{' '}
                {group.people === 1 ? 'person' : 'people'} · {group.shows}{' '}
                {group.shows === 1 ? 'show' : 'shows'} · avg {group.averageProgress}%
              </Typography>
            );
          }}
        />
      )}
    </Box>
  );
}

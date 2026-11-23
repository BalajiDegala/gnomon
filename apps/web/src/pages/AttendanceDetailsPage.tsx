import { attendanceStatusLabels, type AttendanceDetailsRow } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns3,
  Download,
  Maximize2,
  Minimize2,
  Plus,
  Rows3,
  Rows4,
  Search,
  X,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { DataGrid, type DataGridColumn } from '../components/data-view/DataGrid';
import { MonthPicker } from '../components/data-view/MonthPicker';
import { mergeAttendanceRows, useAttendanceDetails } from '../lib/attendance-details';
import {
  attendanceColumnIds,
  attendanceGroupOptions,
  attendanceSourceFilters,
  attendanceStatusFilters,
  attendanceStatusOrder,
  buildAttendanceExport,
  dayWorkModes,
  countByStatus,
  defaultSort,
  filterRowsExceptStatus,
  formatMinutes,
  formatTime,
  groupFor,
  groupLabels,
  humanize,
  initialDirection,
  nextSort,
  orderRows,
  parseSort,
  serializeSort,
  workModeFilters,
  type AttendanceColumnId,
  type AttendanceGroupBy,
  type AttendanceSortKey,
  type AttendanceSourceFilter,
  type AttendanceStatus,
  type AttendanceStatusFilter,
  type SortRule,
  type WorkModeFilter,
} from '../lib/attendance-view';
import { useStoredColumnOrder } from '../lib/column-order';
import { downloadCsv } from '../lib/csv';
import { fullscreenShortcutLabel, useFullscreenMode } from '../lib/use-fullscreen-mode';
import {
  parseEnumValue,
  parseShortSearch,
  parseYearMonth,
  useUrlQueryState,
} from '../lib/url-query-state';

/* ---------------------------------------------------------- preferences */

const COLUMN_STORAGE_KEY = 'gnomon:attendance-details:visible-columns:v2';
const DENSITY_STORAGE_KEY = 'gnomon:attendance-details:density';
const COLUMN_ORDER_STORAGE_KEY = 'gnomon:attendance-details:column-order';
const defaultVisibleColumns: AttendanceColumnId[] = [
  'employee',
  'department',
  'date',
  'shift',
  'workMode',
  'biometricIn',
  'biometricOut',
  'accessEntry',
  'accessExit',
  'status',
];
const columnLabels: Record<AttendanceColumnId, string> = {
  employee: 'Employee',
  department: 'Department',
  date: 'Work date',
  shift: 'Shift',
  workMode: 'Work mode',
  biometricIn: 'Biometric entry',
  biometricOut: 'Biometric exit',
  biometricSummary: 'Biometric summary',
  accessEntry: 'Access-card entry',
  accessExit: 'Access-card exit',
  accessSummary: 'Access-card summary',
  website: 'Website timecard',
  timesheets: 'Show timesheets',
  payable: 'Payable time',
  status: 'Attendance',
};
const sortLabels: Record<AttendanceSortKey, string> = {
  employee: 'Employee',
  department: 'Department',
  date: 'Work date',
  shift: 'Shift',
  workMode: 'Work mode',
  biometricIn: 'Biometric entry',
  biometricOut: 'Biometric exit',
  biometricDuration: 'Biometric duration',
  accessEntry: 'Access-card entry',
  accessExit: 'Access-card exit',
  accessDuration: 'Access-card duration',
  website: 'Website time',
  timesheets: 'Show time',
  payable: 'Payable time',
  status: 'Attendance',
};
const sourceLabels: Record<AttendanceSourceFilter, string> = {
  all: 'All evidence',
  biometric: 'Has biometric punches',
  accessCard: 'Has access-card events',
  website: 'Has website sessions',
  timesheets: 'Has show timesheets',
  noEvidence: 'No evidence yet',
};
const workModeLabels: Record<WorkModeFilter, string> = {
  all: 'All modes',
  office: 'Office (WFO)',
  home: 'Home (WFH)',
  undeclared: 'Not declared',
};

const statusTones: Record<AttendanceStatus, { bg: string; fg: string; dot: string }> = {
  absent: { bg: 'var(--g-ab-soft)', fg: 'var(--g-ab)', dot: 'var(--g-ab)' },
  partial: { bg: 'var(--g-pt-soft)', fg: 'var(--g-pt)', dot: 'var(--g-pt)' },
  present: { bg: 'var(--g-pr-soft)', fg: 'var(--g-pr)', dot: 'var(--g-pr)' },
  pending_regularisation: { bg: 'var(--g-pn-soft)', fg: 'var(--g-pn)', dot: 'var(--g-pn)' },
  leave: { bg: 'var(--g-lv-soft)', fg: 'var(--g-lv)', dot: 'var(--g-lv)' },
  holiday: { bg: 'var(--g-off-soft)', fg: 'var(--g-off)', dot: 'var(--g-off)' },
  weekend: { bg: 'var(--g-nr-soft)', fg: 'var(--g-nr)', dot: 'var(--g-nr)' },
};

function readStored<T>(key: string, parse: (value: unknown) => T | null, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return parse(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are a convenience; ignore blocked storage.
  }
}

const parseColumns = (value: unknown): AttendanceColumnId[] | null => {
  if (!Array.isArray(value)) return null;
  const valid = attendanceColumnIds.filter((id) => value.includes(id));
  return valid.length > 0 ? valid : null;
};

const parseStatusFilter = (value: string) => parseEnumValue(value, attendanceStatusFilters);
const parseWorkModeFilter = (value: string) => parseEnumValue(value, workModeFilters);
const parseSourceFilter = (value: string) => parseEnumValue(value, attendanceSourceFilters);
const parseGroupBy = (value: string) => parseEnumValue(value, attendanceGroupOptions);
const parseSortRules = (value: string) => parseSort(value);
const serializeSortRules = (rules: readonly SortRule[]) => serializeSort(rules);

function monthLabel(month: string): string {
  if (!month) return 'Latest recorded month';
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

/* --------------------------------------------------------- cell renderers */

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const tone = statusTones[status];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.6,
        px: 1,
        py: 0.3,
        borderRadius: '999px',
        bgcolor: tone.bg,
        color: tone.fg,
        fontSize: 11.5,
        fontWeight: 750,
        whiteSpace: 'nowrap',
      }}
    >
      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tone.dot }} />
      {attendanceStatusLabels[status]}
    </Box>
  );
}

function TwoLine({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        noWrap
        sx={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
      >
        {primary}
      </Typography>
      {secondary && (
        <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11.5 }}>
          {secondary}
        </Typography>
      )}
    </Box>
  );
}

function EmptyCell() {
  return (
    <Typography aria-label="None" sx={{ color: 'text.disabled', fontSize: 12.5 }}>
      —
    </Typography>
  );
}

function EvidenceTime({ value, status }: { value: string | null; status: string }) {
  if (!value) return <EmptyCell />;
  return (
    <TwoLine
      primary={formatTime(value)}
      secondary={status === 'complete' ? undefined : humanize(status)}
    />
  );
}

function WorkModeBadge({ row }: { row: AttendanceDetailsRow }) {
  const modes = dayWorkModes(row);
  if (!modes.length) return <EmptyCell />;
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}
      title={modes.length > 1 ? 'Started at the office, continued from home' : undefined}
    >
      {modes.map((mode, index) => (
        <Fragment key={mode}>
          {index > 0 && (
            <Box component="span" sx={{ color: 'var(--g-muted)', fontSize: 12 }}>
              →
            </Box>
          )}
          <Box
            component="span"
            sx={{
              px: 0.9,
              py: 0.25,
              borderRadius: '6px',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.3,
              ...(mode === 'home'
                ? { bgcolor: 'var(--g-lv-soft)', color: 'var(--g-lv)' }
                : { bgcolor: 'var(--g-pr-soft)', color: 'var(--g-pr)' }),
            }}
          >
            {mode === 'home' ? 'WFH' : 'WFO'}
          </Box>
        </Fragment>
      ))}
    </Box>
  );
}

/* --------------------------------------------------------------- toolbar */

function ToolbarSelect<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  width = 170,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
  width?: number;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      sx={{ width, '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: 'var(--g-base)' } }}
    >
      {options.map((option) => (
        <MenuItem key={option} value={option}>
          {labels[option]}
        </MenuItem>
      ))}
    </TextField>
  );
}

function SortControl({
  rules,
  onChange,
}: {
  rules: readonly SortRule[];
  onChange: (rules: SortRule[]) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const unused = (Object.keys(sortLabels) as AttendanceSortKey[]).filter(
    (key) => !rules.some((rule) => rule.key === key),
  );
  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<ArrowUpDown size={15} />}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          borderColor: 'divider',
          borderRadius: '10px',
          bgcolor: 'var(--g-base)',
          whiteSpace: 'nowrap',
        }}
      >
        Sort
        <Typography
          component="span"
          noWrap
          sx={{ ml: 0.75, maxWidth: 130, color: 'text.secondary', fontSize: 12 }}
        >
          {rules.map((rule) => sortLabels[rule.key]).join(', ')}
        </Typography>
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 340, p: 1 } } }}
      >
        <Typography sx={{ px: 1, pb: 1, color: 'text.secondary', fontSize: 11.5 }}>
          Up to three levels. Tip: Shift+click a column header to add a level.
        </Typography>
        {rules.map((rule, index) => (
          <Stack
            key={rule.key}
            direction="row"
            sx={{ alignItems: 'center', gap: 1, px: 1, py: 0.5 }}
          >
            <Typography sx={{ width: 44, color: 'text.secondary', fontSize: 11 }}>
              {index === 0 ? 'Sort by' : 'then'}
            </Typography>
            <TextField
              select
              size="small"
              value={rule.key}
              onChange={(event) =>
                onChange(
                  rules.map((current) =>
                    current.key === rule.key
                      ? {
                          key: event.target.value as AttendanceSortKey,
                          direction: initialDirection(event.target.value as AttendanceSortKey),
                        }
                      : current,
                  ),
                )
              }
              sx={{ flex: 1 }}
            >
              {[rule.key, ...unused].map((key) => (
                <MenuItem key={key} value={key}>
                  {sortLabels[key]}
                </MenuItem>
              ))}
            </TextField>
            <Tooltip title={rule.direction === 'asc' ? 'Ascending' : 'Descending'}>
              <IconButton
                size="small"
                aria-label={`Reverse ${sortLabels[rule.key]} order`}
                onClick={() =>
                  onChange(
                    rules.map((current) =>
                      current.key === rule.key
                        ? { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' }
                        : current,
                    ),
                  )
                }
              >
                {rule.direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              aria-label={`Remove ${sortLabels[rule.key]} sort`}
              disabled={rules.length === 1}
              onClick={() => onChange(rules.filter((current) => current.key !== rule.key))}
            >
              <X size={15} />
            </IconButton>
          </Stack>
        ))}
        <Stack direction="row" sx={{ justifyContent: 'space-between', px: 1, pt: 1 }}>
          <Button
            size="small"
            startIcon={<Plus size={14} />}
            disabled={rules.length >= 3 || unused.length === 0}
            onClick={() =>
              onChange([...rules, { key: unused[0]!, direction: initialDirection(unused[0]!) }])
            }
          >
            Add level
          </Button>
          <Button size="small" color="inherit" onClick={() => onChange([...defaultSort])}>
            Reset
          </Button>
        </Stack>
      </Menu>
    </>
  );
}

function ColumnControl({
  visible,
  onChange,
  onResetOrder,
}: {
  visible: readonly AttendanceColumnId[];
  onChange: (columns: AttendanceColumnId[]) => void;
  onResetOrder: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const toggle = (id: AttendanceColumnId) => {
    const next = visible.includes(id)
      ? visible.filter((column) => column !== id)
      : attendanceColumnIds.filter((column) => column === id || visible.includes(column));
    if (next.length > 0) onChange(next);
  };
  const sections: Array<[string, AttendanceColumnId[]]> = [
    ['Who & when', ['employee', 'department', 'date', 'shift', 'workMode']],
    ['Biometric', ['biometricIn', 'biometricOut', 'biometricSummary']],
    ['Access card', ['accessEntry', 'accessExit', 'accessSummary']],
    ['Website & time', ['website', 'timesheets', 'payable']],
    ['Result', ['status']],
  ];
  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<Columns3 size={15} />}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          borderColor: 'divider',
          borderRadius: '10px',
          bgcolor: 'var(--g-base)',
          whiteSpace: 'nowrap',
        }}
      >
        Columns
        <Typography component="span" sx={{ ml: 0.75, color: 'text.secondary', fontSize: 12 }}>
          {visible.length}/{attendanceColumnIds.length}
        </Typography>
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 280, maxHeight: 520 } } }}
      >
        {sections.flatMap(([title, ids]) => [
          <ListSubheader key={title} sx={{ lineHeight: '32px', fontSize: 11, fontWeight: 800 }}>
            {title}
          </ListSubheader>,
          ...ids.map((id) => (
            <MenuItem key={id} dense onClick={() => toggle(id)}>
              <Checkbox
                size="small"
                checked={visible.includes(id)}
                disabled={visible.includes(id) && visible.length === 1}
                sx={{ p: 0.5, mr: 1 }}
              />
              <ListItemText primary={columnLabels[id]} />
            </MenuItem>
          )),
        ])}
        <Divider />
        <Typography sx={{ px: 2, pt: 1, color: 'text.secondary', fontSize: 11.5 }}>
          Drag column headers to change their order. Export uses the same order.
        </Typography>
        <Stack direction="row" sx={{ justifyContent: 'space-between', px: 1, pt: 0.5 }}>
          <Button size="small" onClick={() => onChange([...attendanceColumnIds])}>
            Show all
          </Button>
          <Button
            size="small"
            color="inherit"
            onClick={() => {
              onChange([...defaultVisibleColumns]);
              onResetOrder();
            }}
          >
            Reset
          </Button>
        </Stack>
      </Menu>
    </>
  );
}

function StatusChips({
  counts,
  total,
  value,
  onChange,
}: {
  counts: Record<AttendanceStatus, number>;
  total: number;
  value: AttendanceStatusFilter;
  onChange: (value: AttendanceStatusFilter) => void;
}) {
  const statuses = attendanceStatusOrder.filter(
    (status) => counts[status] > 0 || ['absent', 'partial', 'present'].includes(status),
  );
  const chip = (key: AttendanceStatusFilter, label: string, count: number, dot?: string) => {
    const selected = value === key;
    return (
      <ButtonBase
        key={key}
        onClick={() => onChange(selected && key !== 'all' ? 'all' : key)}
        aria-pressed={selected}
        sx={{
          gap: 0.8,
          px: 1.25,
          py: 0.7,
          borderRadius: '10px',
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'divider',
          bgcolor: 'var(--g-base)',
          boxShadow: selected ? 'var(--g-inset-sm)' : 'var(--g-raised-sm)',
          transition: 'all 120ms ease',
          '&:hover': { color: 'var(--g-fg)' },
        }}
      >
        {dot && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot }} />}
        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{label}</Typography>
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 800,
            color: selected ? 'primary.dark' : 'text.secondary',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count.toLocaleString('en-IN')}
        </Typography>
      </ButtonBase>
    );
  };
  return (
    <Stack
      direction="row"
      sx={{ gap: 1, flexWrap: 'wrap' }}
      role="group"
      aria-label="Filter by attendance status"
    >
      {chip('all', 'All days', total)}
      {statuses.map((status) =>
        chip(status, attendanceStatusLabels[status], counts[status], statusTones[status].dot),
      )}
    </Stack>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
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
        {value.toLocaleString('en-IN')}
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 11.5, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </Box>
  );
}

/* ----------------------------------------------------------------- page */

export function AttendanceDetailsPage() {
  const [month, setMonth] = useUrlQueryState('month', '', parseYearMonth);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [statusFilter, setStatusFilter] = useUrlQueryState<AttendanceStatusFilter>(
    'status',
    'all',
    parseStatusFilter,
  );
  const [workModeFilter, setWorkModeFilter] = useUrlQueryState<WorkModeFilter>(
    'mode',
    'all',
    parseWorkModeFilter,
  );
  const [sourceFilter, setSourceFilter] = useUrlQueryState<AttendanceSourceFilter>(
    'source',
    'all',
    parseSourceFilter,
  );
  const [groupBy, setGroupBy] = useUrlQueryState<AttendanceGroupBy>('group', 'none', parseGroupBy);
  const [sortRules, setSortRules] = useUrlQueryState<readonly SortRule[]>(
    'sort',
    defaultSort,
    parseSortRules,
    serializeSortRules,
  );
  const [visibleColumns, setVisibleColumns] = useState<AttendanceColumnId[]>(() =>
    readStored(COLUMN_STORAGE_KEY, parseColumns, defaultVisibleColumns),
  );
  const columnOrder = useStoredColumnOrder(COLUMN_ORDER_STORAGE_KEY, attendanceColumnIds);
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() =>
    readStored(
      DENSITY_STORAGE_KEY,
      (value) => (value === 'compact' || value === 'comfortable' ? value : null),
      'comfortable',
    ),
  );
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());
  const { fullscreen, toggle: toggleFullscreen } = useFullscreenMode();
  const containerRef = useRef<HTMLDivElement>(null);

  const details = useAttendanceDetails(month);
  const attendance = details.attendance;
  const selectedMonth = month || attendance?.month || '';
  const biometricMonth = attendance?.availableMonths.find((item) => item.biometricEvents > 0);

  useEffect(() => writeStored(COLUMN_STORAGE_KEY, visibleColumns), [visibleColumns]);
  useEffect(() => writeStored(DENSITY_STORAGE_KEY, density), [density]);

  /* Data pipeline: merge duplicate identities → filter → count → order. */
  const mergedRows = useMemo(() => mergeAttendanceRows(attendance?.rows ?? []), [attendance?.rows]);
  const rowsBeforeStatus = useMemo(
    () =>
      filterRowsExceptStatus(mergedRows, {
        search,
        workMode: workModeFilter,
        source: sourceFilter,
      }),
    [mergedRows, search, sourceFilter, workModeFilter],
  );
  const statusCounts = useMemo(() => countByStatus(rowsBeforeStatus), [rowsBeforeStatus]);
  const viewRows = useMemo(
    () =>
      orderRows(
        statusFilter === 'all'
          ? rowsBeforeStatus
          : rowsBeforeStatus.filter((row) => row.status === statusFilter),
        sortRules,
        groupBy,
      ),
    [groupBy, rowsBeforeStatus, sortRules, statusFilter],
  );
  const stats = useMemo(
    () => ({
      employees: new Set(mergedRows.map((row) => row.employeeId)).size,
      days: mergedRows.length,
      biometric: mergedRows.filter((row) => row.biometric.status === 'complete').length,
      access: mergedRows.filter((row) => row.accessCard.status === 'complete').length,
      website: mergedRows.filter((row) => row.website.sessionCount > 0).length,
    }),
    [mergedRows],
  );

  useEffect(() => setPage(0), [groupBy, month, search, sourceFilter, statusFilter, workModeFilter]);
  useEffect(() => setCollapsedGroups(new Set()), [groupBy]);

  /* Full screen: a fixed overlay over the app, plus native full screen when allowed. */

  function exportCsv() {
    const csv = buildAttendanceExport(
      viewRows,
      gridColumns.map((column) => column.id as AttendanceColumnId),
      groupBy,
    );
    const parts = [
      'attendance-details',
      selectedMonth || 'latest',
      statusFilter !== 'all'
        ? attendanceStatusLabels[statusFilter].toLowerCase().replaceAll(' ', '-')
        : null,
      workModeFilter !== 'all' ? workModeFilter : null,
      groupBy !== 'none' ? `by-${groupBy}` : null,
    ].filter(Boolean);
    downloadCsv(`${parts.join('-')}.csv`, csv.headers, csv.rows);
  }

  const groupKeys = useMemo(
    () =>
      groupBy === 'none' ? [] : [...new Set(viewRows.map((row) => groupFor(row, groupBy).key))],
    [groupBy, viewRows],
  );
  const toggleGroup = (key: string) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allColumns: Record<
    AttendanceColumnId,
    DataGridColumn<AttendanceDetailsRow, AttendanceSortKey>
  > = {
    employee: {
      id: 'employee',
      label: 'Employee',
      sortKey: 'employee',
      minWidth: 220,
      sticky: true,
      render: (row) => <TwoLine primary={row.employeeDisplayName} secondary={row.employeeCode} />,
    },
    department: {
      id: 'department',
      label: 'Department',
      sortKey: 'department',
      minWidth: 150,
      render: (row) =>
        row.departmentName ?? (
          <Typography sx={{ color: 'text.disabled', fontSize: 12.5 }}>Unassigned</Typography>
        ),
    },
    date: {
      id: 'date',
      label: 'Work date',
      sortKey: 'date',
      width: 132,
      render: (row) => (
        <Typography sx={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
          {row.workDate}
        </Typography>
      ),
    },
    shift: {
      id: 'shift',
      label: 'Shift',
      sortKey: 'shift',
      minWidth: 140,
      render: (row) =>
        row.workContext.shiftName ? (
          <TwoLine
            primary={row.workContext.shiftName}
            secondary={
              row.workContext.shiftStartTime && row.workContext.shiftEndTime
                ? `${row.workContext.shiftStartTime} – ${row.workContext.shiftEndTime}`
                : undefined
            }
          />
        ) : (
          <EmptyCell />
        ),
    },
    workMode: {
      id: 'workMode',
      label: 'Mode',
      sortKey: 'workMode',
      width: 90,
      render: (row) => <WorkModeBadge row={row} />,
    },
    biometricIn: {
      id: 'biometricIn',
      label: 'Bio in',
      sortKey: 'biometricIn',
      width: 112,
      render: (row) => <EvidenceTime value={row.biometric.firstAt} status={row.biometric.status} />,
    },
    biometricOut: {
      id: 'biometricOut',
      label: 'Bio out',
      sortKey: 'biometricOut',
      width: 112,
      render: (row) => <EvidenceTime value={row.biometric.lastAt} status={row.biometric.status} />,
    },
    biometricSummary: {
      id: 'biometricSummary',
      label: 'Bio total',
      sortKey: 'biometricDuration',
      width: 130,
      render: (row) =>
        row.biometric.eventCount ? (
          <TwoLine
            primary={formatMinutes(row.biometric.workedMinutes)}
            secondary={`${row.biometric.eventCount} punch${row.biometric.eventCount === 1 ? '' : 'es'}`}
          />
        ) : (
          <EmptyCell />
        ),
    },
    accessEntry: {
      id: 'accessEntry',
      label: 'Card in',
      sortKey: 'accessEntry',
      width: 112,
      render: (row) => (
        <EvidenceTime value={row.accessCard.firstAt} status={row.accessCard.status} />
      ),
    },
    accessExit: {
      id: 'accessExit',
      label: 'Card out',
      sortKey: 'accessExit',
      width: 112,
      render: (row) => (
        <EvidenceTime value={row.accessCard.lastAt} status={row.accessCard.status} />
      ),
    },
    accessSummary: {
      id: 'accessSummary',
      label: 'Card total',
      sortKey: 'accessDuration',
      width: 130,
      render: (row) =>
        row.accessCard.eventCount ? (
          <TwoLine
            primary={formatMinutes(row.accessCard.workedMinutes)}
            secondary={`${row.accessCard.eventCount} event${row.accessCard.eventCount === 1 ? '' : 's'}`}
          />
        ) : (
          <EmptyCell />
        ),
    },
    website: {
      id: 'website',
      label: 'Website',
      sortKey: 'website',
      width: 140,
      render: (row) =>
        row.website.sessionCount ? (
          <TwoLine
            primary={formatMinutes(row.website.workedMinutes)}
            secondary={`${row.website.sessionCount} session${row.website.sessionCount === 1 ? '' : 's'} · ${humanize(row.website.status)}`}
          />
        ) : (
          <EmptyCell />
        ),
    },
    timesheets: {
      id: 'timesheets',
      label: 'Show time',
      sortKey: 'timesheets',
      width: 140,
      render: (row) =>
        row.timesheets.entryCount ? (
          <TwoLine
            primary={formatMinutes(row.timesheets.totalMinutes)}
            secondary={`${row.timesheets.entryCount} entries · ${row.timesheets.averageProgress}%`}
          />
        ) : (
          <EmptyCell />
        ),
    },
    payable: {
      id: 'payable',
      label: 'Payable',
      sortKey: 'payable',
      width: 110,
      align: 'right',
      render: (row) => (
        <Typography sx={{ fontSize: 12.5, fontWeight: 750, fontVariantNumeric: 'tabular-nums' }}>
          {formatMinutes(row.payableMinutes)}
        </Typography>
      ),
    },
    status: {
      id: 'status',
      label: 'Attendance',
      sortKey: 'status',
      minWidth: 150,
      render: (row) => (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
          <StatusBadge status={row.status} />
          {row.requiresReview && (
            <Tooltip title={row.anomalies.map(humanize).join(', ') || 'Review required'}>
              <Box
                component="span"
                sx={{ color: 'warning.dark', fontSize: 11.5, fontWeight: 750, cursor: 'help' }}
              >
                Review
              </Box>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  };
  const columns = columnOrder.order
    .filter(
      (id) =>
        visibleColumns.includes(id) &&
        !(groupBy === 'employee' && id === 'employee') &&
        !(groupBy === 'department' && id === 'department') &&
        !(groupBy === 'date' && id === 'date'),
    )
    .map((id) => allColumns[id]);
  const gridColumns = columns.length > 0 ? columns : [allColumns.date];

  const hasFilters =
    Boolean(search) ||
    statusFilter !== 'all' ||
    workModeFilter !== 'all' ||
    sourceFilter !== 'all' ||
    groupBy !== 'none';
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setWorkModeFilter('all');
    setSourceFilter('all');
    setGroupBy('none');
  };

  return (
    <Box
      ref={containerRef}
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
      {/* Header */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', gap: 2 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="h1"
            sx={{ fontSize: fullscreen ? 20 : 24, fontWeight: 850, letterSpacing: '-0.03em' }}
          >
            Attendance details
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12.5, mt: 0.25 }}>
            {monthLabel(selectedMonth)} · every working day starts as LOP until biometric,
            access-card or timecard evidence arrives
          </Typography>
        </Box>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <MonthPicker label="Month" value={selectedMonth} onChange={setMonth} />
          <Button
            variant="contained"
            startIcon={<Download size={16} />}
            disabled={!attendance || viewRows.length === 0}
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
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '10px',
                bgcolor: 'var(--g-base)',
              }}
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {!details.canRead && (
        <Alert severity="warning">Your account cannot read team attendance.</Alert>
      )}
      {details.error && <Alert severity="error">{details.error.message}</Alert>}
      {!fullscreen &&
        attendance &&
        !month &&
        attendance.latestRecordedMonth &&
        selectedMonth !== attendance.latestRecordedMonth && (
          <Alert severity="info">
            Showing {monthLabel(selectedMonth)} because it contains the widest workforce coverage.
            The newest recorded activity is {monthLabel(attendance.latestRecordedMonth)}.
          </Alert>
        )}
      {!fullscreen &&
        attendance &&
        biometricMonth &&
        selectedMonth !== biometricMonth.month &&
        stats.biometric === 0 && (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  setMonth(biometricMonth.month);
                  setSourceFilter('biometric');
                }}
              >
                View biometric data
              </Button>
            }
          >
            Biometric data is recorded in {monthLabel(biometricMonth.month)}:{' '}
            {biometricMonth.biometricEvents.toLocaleString('en-IN')} punches across{' '}
            {biometricMonth.biometricDays.toLocaleString('en-IN')} days.
          </Alert>
        )}

      {details.isLoading ? (
        <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading attendance details" />
        </Box>
      ) : attendance ? (
        <>
          <Stack
            direction="row"
            sx={{
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <StatusChips
              counts={statusCounts}
              total={rowsBeforeStatus.length}
              value={statusFilter}
              onChange={setStatusFilter}
            />
            {!fullscreen && (
              <Stack
                direction="row"
                sx={{
                  display: { xs: 'none', lg: 'flex' },
                  py: 0.75,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '12px',
                  bgcolor: 'var(--g-base)',
                }}
              >
                <Stat label="Employees" value={stats.employees} />
                <Stat label="Attendance days" value={stats.days} />
                <Stat label="Biometric complete" value={stats.biometric} />
                <Stat label="Card complete" value={stats.access} />
                <Stat label="Website days" value={stats.website} />
              </Stack>
            )}
          </Stack>

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
              placeholder="Search name, code, department, shift…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{
                width: { xs: '100%', sm: 240 },
                '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: 'var(--g-base)' },
              }}
              slotProps={{
                htmlInput: { maxLength: 100, 'aria-label': 'Search attendance' },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={16} />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label="Clear search"
                        onClick={() => setSearch('')}
                      >
                        <X size={14} />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
            <ToolbarSelect
              label="Evidence"
              value={sourceFilter}
              options={attendanceSourceFilters}
              labels={sourceLabels}
              onChange={setSourceFilter}
              width={175}
            />
            <ToolbarSelect
              label="Work mode"
              value={workModeFilter}
              options={workModeFilters}
              labels={workModeLabels}
              onChange={setWorkModeFilter}
              width={150}
            />
            <ToolbarSelect
              label="Group by"
              value={groupBy}
              options={attendanceGroupOptions}
              labels={groupLabels}
              onChange={setGroupBy}
              width={165}
            />
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
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '10px',
                    bgcolor: 'var(--g-base)',
                  }}
                >
                  {collapsedGroups.size === groupKeys.length ? (
                    <ChevronsUpDown size={17} />
                  ) : (
                    <ChevronsDownUp size={17} />
                  )}
                </IconButton>
              </Tooltip>
            )}
            <SortControl rules={sortRules} onChange={(rules) => setSortRules(rules)} />
            <ColumnControl
              visible={visibleColumns}
              onChange={setVisibleColumns}
              onResetOrder={columnOrder.reset}
            />
            <ToggleButtonGroup
              exclusive
              size="small"
              value={density}
              onChange={(_event, value: 'comfortable' | 'compact' | null) =>
                value && setDensity(value)
              }
              aria-label="Row density"
              sx={{
                bgcolor: 'var(--g-base)',
                '& .MuiToggleButton-root': { borderRadius: '10px', px: 1 },
              }}
            >
              <ToggleButton value="comfortable" aria-label="Comfortable rows">
                <Tooltip title="Comfortable rows">
                  <Rows3 size={16} />
                </Tooltip>
              </ToggleButton>
              <ToggleButton value="compact" aria-label="Compact rows">
                <Tooltip title="Compact rows">
                  <Rows4 size={16} />
                </Tooltip>
              </ToggleButton>
            </ToggleButtonGroup>
            <Box sx={{ flex: 1 }} />
            {hasFilters && (
              <Button
                color="inherit"
                size="small"
                startIcon={<X size={14} />}
                onClick={clearFilters}
              >
                Clear
              </Button>
            )}
            <Chip
              size="small"
              label={`${viewRows.length.toLocaleString('en-IN')} ${viewRows.length === 1 ? 'day' : 'days'}`}
              sx={{ fontWeight: 750, bgcolor: 'var(--g-accent-soft)', color: 'primary.dark' }}
            />
          </Stack>

          <DataGrid
            ariaLabel="All employee attendance source details"
            rows={viewRows}
            columns={gridColumns}
            getRowId={(row) => row.id}
            sort={sortRules}
            onSort={(key, additive) => setSortRules(nextSort(sortRules, key, additive))}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={setPage}
            onRowsPerPageChange={(value) => {
              setRowsPerPage(value);
              setPage(0);
            }}
            density={density}
            fill={fullscreen}
            height="calc(100vh - 380px)"
            emptyTitle={`No attendance in ${monthLabel(attendance.month)}`}
            emptyMessage={
              hasFilters
                ? 'No days match these filters. Clear them to see everything.'
                : 'Choose another month or upload attendance data for this period.'
            }
            getRowGroup={groupBy === 'none' ? undefined : (row) => groupFor(row, groupBy)}
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            renderGroupSummary={(rows) => <GroupSummary rows={rows} />}
            onColumnMove={columnOrder.move}
          />
        </>
      ) : null}
    </Box>
  );
}

function GroupSummary({ rows }: { rows: readonly AttendanceDetailsRow[] }) {
  const counts = countByStatus(rows);
  const payable = rows.reduce((total, row) => total + row.payableMinutes, 0);
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, ml: 0.5 }}>
      {attendanceStatusOrder
        .filter((status) => counts[status] > 0)
        .map((status) => (
          <Stack key={status} direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: statusTones[status].dot }}
            />
            <Typography sx={{ fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {attendanceStatusLabels[status]} {counts[status]}
            </Typography>
          </Stack>
        ))}
      <Typography sx={{ fontSize: 11, color: 'text.secondary', whiteSpace: 'nowrap' }}>
        · Payable {formatMinutes(payable)}
      </Typography>
    </Stack>
  );
}

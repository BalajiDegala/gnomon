import type { AttendanceDetailsRow } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  CalendarClock,
  Columns3,
  Fingerprint,
  ScanLine,
  TimerReset,
  UsersRound,
} from 'lucide-react';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';

import { DataTable, type DataTableColumn } from '../components/data-view/DataTable';
import { FilterBar } from '../components/data-view/FilterBar';
import { PageHeader } from '../components/data-view/PageHeader';
import { useAttendanceDetails } from '../lib/attendance-details';

type AttendanceSortKey =
  | 'employee'
  | 'department'
  | 'date'
  | 'biometricIn'
  | 'biometricOut'
  | 'biometricDuration'
  | 'accessEntry'
  | 'accessExit'
  | 'accessDuration'
  | 'website'
  | 'timesheets'
  | 'payable'
  | 'status';
type AttendanceSourceFilter = 'all' | 'biometric' | 'accessCard' | 'website' | 'timesheets';
type AttendanceGroup = 'none' | 'employee' | 'department';
type AttendanceColumnId =
  | 'employee'
  | 'department'
  | 'date'
  | 'biometricIn'
  | 'biometricOut'
  | 'biometricSummary'
  | 'accessEntry'
  | 'accessExit'
  | 'accessSummary'
  | 'website'
  | 'timesheets'
  | 'payable'
  | 'status';

const COLUMN_STORAGE_KEY = 'gnomon:attendance-details:visible-columns';
const defaultVisibleColumns: AttendanceColumnId[] = [
  'employee',
  'department',
  'date',
  'biometricIn',
  'biometricOut',
  'accessEntry',
  'accessExit',
  'status',
];
const columnOptions: Array<{ id: AttendanceColumnId; label: string }> = [
  { id: 'employee', label: 'Employee' },
  { id: 'department', label: 'Department' },
  { id: 'date', label: 'Work date' },
  { id: 'biometricIn', label: 'Biometric entry' },
  { id: 'biometricOut', label: 'Biometric exit' },
  { id: 'biometricSummary', label: 'Biometric duration / punches' },
  { id: 'accessEntry', label: 'Access-card entry' },
  { id: 'accessExit', label: 'Access-card exit' },
  { id: 'accessSummary', label: 'Access-card duration / events' },
  { id: 'website', label: 'Website timecard' },
  { id: 'timesheets', label: 'Show timesheets' },
  { id: 'payable', label: 'Payable time' },
  { id: 'status', label: 'Attendance status' },
];
const validColumnIds = new Set(columnOptions.map((column) => column.id));

function initialVisibleColumns(): Set<AttendanceColumnId> {
  try {
    const stored = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) ?? '[]') as unknown;
    if (Array.isArray(stored)) {
      const valid = stored.filter(
        (value): value is AttendanceColumnId =>
          typeof value === 'string' && validColumnIds.has(value as AttendanceColumnId),
      );
      if (valid.length > 0) return new Set(valid);
    }
  } catch {
    // Invalid browser preferences fall back to the clean default view.
  }
  return new Set(defaultVisibleColumns);
}

function formatMinutes(minutes: number): string {
  if (!minutes) return '0h 00m';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function monthLabel(month: string): string {
  if (!month) return 'Latest recorded month';
  return new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

function EvidenceTime({ value, detail }: { value: string | null; detail: string }) {
  return (
    <Box sx={{ minWidth: 112 }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {formatTime(value)}
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 10 }}>{detail}</Typography>
    </Box>
  );
}

function EvidenceSummary({
  minutes,
  count,
  countLabel,
  status,
}: {
  minutes: number;
  count: number;
  countLabel: string;
  status: string;
}) {
  return (
    <Box sx={{ minWidth: 145 }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>{formatMinutes(minutes)}</Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 10 }}>
        {count} {countLabel} · {label(status)}
      </Typography>
    </Box>
  );
}

function AttendanceStatus({ row }: { row: AttendanceDetailsRow }) {
  const tone =
    row.status === 'present'
      ? { background: '#e6f7ef', color: '#19764d' }
      : row.status === 'partial'
        ? { background: '#fff4df', color: '#9a621b' }
        : row.status === 'weekend' || row.status === 'holiday'
          ? { background: '#f1edff', color: '#6852a8' }
          : { background: '#fdebec', color: '#ad3f48' };
  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
      <Chip size="small" label={label(row.status)} sx={{ ...tone, fontWeight: 750 }} />
      {row.requiresReview && (
        <Typography sx={{ color: 'warning.dark', fontSize: 9.5 }}>Review required</Typography>
      )}
    </Stack>
  );
}

function compareNullable(
  left: string | number | null,
  right: string | number | null,
  direction: 1 | -1,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
  return (
    String(left).localeCompare(String(right), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) * direction
  );
}

function sortValue(row: AttendanceDetailsRow, key: AttendanceSortKey): string | number | null {
  if (key === 'employee') return `${row.employeeDisplayName} ${row.employeeCode}`;
  if (key === 'department') return row.departmentName;
  if (key === 'date') return row.workDate;
  if (key === 'biometricIn') return row.biometric.firstAt;
  if (key === 'biometricOut') return row.biometric.lastAt;
  if (key === 'biometricDuration') return row.biometric.workedMinutes;
  if (key === 'accessEntry') return row.accessCard.firstAt;
  if (key === 'accessExit') return row.accessCard.lastAt;
  if (key === 'accessDuration') return row.accessCard.workedMinutes;
  if (key === 'website') return row.website.workedMinutes;
  if (key === 'timesheets') return row.timesheets.totalMinutes;
  if (key === 'payable') return row.payableMinutes;
  return row.status;
}

export function AttendanceDetailsPage() {
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<AttendanceSourceFilter>('all');
  const [groupBy, setGroupBy] = useState<AttendanceGroup>('none');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortKey, setSortKey] = useState<AttendanceSortKey>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [visibleColumnIds, setVisibleColumnIds] = useState(initialVisibleColumns);
  const [columnMenuAnchor, setColumnMenuAnchor] = useState<HTMLElement | null>(null);
  const details = useAttendanceDetails(month);
  const attendance = details.attendance;
  const selectedMonth = month || attendance?.month || '';
  const biometricMonth = attendance?.availableMonths.find((item) => item.biometricEvents > 0);

  useEffect(() => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify([...visibleColumnIds]));
  }, [visibleColumnIds]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = (attendance?.rows ?? []).filter((row) => {
      const matchesSource =
        sourceFilter === 'all' ||
        (sourceFilter === 'biometric' && row.biometric.eventCount > 0) ||
        (sourceFilter === 'accessCard' && row.accessCard.eventCount > 0) ||
        (sourceFilter === 'website' && row.website.sessionCount > 0) ||
        (sourceFilter === 'timesheets' && row.timesheets.entryCount > 0);
      const matchesSearch =
        !term ||
        [
          row.employeeCode,
          row.employeeDisplayName,
          row.departmentName ?? '',
          row.workDate,
          row.status,
        ]
          .join(' ')
          .toLowerCase()
          .includes(term);
      return matchesSource && matchesSearch;
    });
    const direction = sortDirection === 'asc' ? 1 : -1;
    return [...rows].sort((left, right) => {
      const leftGroup =
        groupBy === 'employee'
          ? `${left.employeeDisplayName} ${left.employeeCode}`
          : groupBy === 'department'
            ? (left.departmentName ?? 'Unassigned')
            : '';
      const rightGroup =
        groupBy === 'employee'
          ? `${right.employeeDisplayName} ${right.employeeCode}`
          : groupBy === 'department'
            ? (right.departmentName ?? 'Unassigned')
            : '';
      const groupComparison = leftGroup.localeCompare(rightGroup, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      if (groupComparison) return groupComparison;
      return (
        compareNullable(sortValue(left, sortKey), sortValue(right, sortKey), direction) ||
        left.employeeDisplayName.localeCompare(right.employeeDisplayName) ||
        left.workDate.localeCompare(right.workDate)
      );
    });
  }, [attendance?.rows, groupBy, search, sortDirection, sortKey, sourceFilter]);

  useEffect(() => setPage(0), [groupBy, month, search, sourceFilter]);
  useEffect(() => {
    const lastPage = Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [filteredRows.length, page, rowsPerPage]);

  const updateSort = (next: AttendanceSortKey) => {
    if (sortKey === next) setSortDirection((value) => (value === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(next);
      setSortDirection('asc');
    }
  };

  const allColumns: ReadonlyArray<
    DataTableColumn<AttendanceDetailsRow, AttendanceSortKey> & { id: AttendanceColumnId }
  > = [
    {
      id: 'employee',
      label: 'Employee',
      sortKey: 'employee',
      minWidth: 190,
      render: (row) => (
        <Box>
          <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
            {row.employeeDisplayName}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10 }}>{row.employeeCode}</Typography>
        </Box>
      ),
    },
    {
      id: 'department',
      label: 'Department',
      sortKey: 'department',
      minWidth: 145,
      render: (row) => row.departmentName ?? 'Unassigned',
    },
    {
      id: 'date',
      label: 'Work date',
      sortKey: 'date',
      width: 112,
      render: (row) => row.workDate,
    },
    {
      id: 'biometricIn',
      label: 'Biometric entry',
      sortKey: 'biometricIn',
      minWidth: 125,
      render: (row) => (
        <EvidenceTime value={row.biometric.firstAt} detail={label(row.biometric.status)} />
      ),
    },
    {
      id: 'biometricOut',
      label: 'Biometric exit',
      sortKey: 'biometricOut',
      minWidth: 125,
      render: (row) => (
        <EvidenceTime value={row.biometric.lastAt} detail={label(row.biometric.status)} />
      ),
    },
    {
      id: 'biometricSummary',
      label: 'Biometric summary',
      sortKey: 'biometricDuration',
      minWidth: 150,
      render: (row) => (
        <EvidenceSummary
          minutes={row.biometric.workedMinutes}
          count={row.biometric.eventCount}
          countLabel={row.biometric.eventCount === 1 ? 'punch' : 'punches'}
          status={row.biometric.status}
        />
      ),
    },
    {
      id: 'accessEntry',
      label: 'Access-card entry',
      sortKey: 'accessEntry',
      minWidth: 125,
      render: (row) => (
        <EvidenceTime value={row.accessCard.firstAt} detail={label(row.accessCard.status)} />
      ),
    },
    {
      id: 'accessExit',
      label: 'Access-card exit',
      sortKey: 'accessExit',
      minWidth: 125,
      render: (row) => (
        <EvidenceTime value={row.accessCard.lastAt} detail={label(row.accessCard.status)} />
      ),
    },
    {
      id: 'accessSummary',
      label: 'Access-card summary',
      sortKey: 'accessDuration',
      minWidth: 150,
      render: (row) => (
        <EvidenceSummary
          minutes={row.accessCard.workedMinutes}
          count={row.accessCard.eventCount}
          countLabel={row.accessCard.eventCount === 1 ? 'event' : 'events'}
          status={row.accessCard.status}
        />
      ),
    },
    {
      id: 'website',
      label: 'Website timecard',
      sortKey: 'website',
      minWidth: 155,
      render: (row) => (
        <EvidenceSummary
          minutes={row.website.workedMinutes}
          count={row.website.sessionCount}
          countLabel={row.website.sessionCount === 1 ? 'session' : 'sessions'}
          status={row.website.status}
        />
      ),
    },
    {
      id: 'timesheets',
      label: 'Show timesheets',
      sortKey: 'timesheets',
      minWidth: 150,
      render: (row) => (
        <Box>
          <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
            {formatMinutes(row.timesheets.totalMinutes)}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10 }}>
            {row.timesheets.entryCount} entries · {row.timesheets.averageProgress}% avg
          </Typography>
        </Box>
      ),
    },
    {
      id: 'payable',
      label: 'Payable time',
      sortKey: 'payable',
      minWidth: 115,
      render: (row) => formatMinutes(row.payableMinutes),
    },
    {
      id: 'status',
      label: 'Attendance',
      sortKey: 'status',
      minWidth: 135,
      render: (row) => <AttendanceStatus row={row} />,
    },
  ];
  const selectedColumns = allColumns.filter(
    (column) =>
      visibleColumnIds.has(column.id) &&
      !(groupBy === 'employee' && column.id === 'employee') &&
      !(groupBy === 'department' && column.id === 'department'),
  );
  const columns =
    selectedColumns.length > 0
      ? selectedColumns
      : allColumns.filter((column) => column.id === 'date');
  const rowGroup =
    groupBy === 'employee'
      ? (row: AttendanceDetailsRow) => ({
          key: row.employeeId,
          label: row.employeeDisplayName,
          secondary: row.employeeCode,
        })
      : groupBy === 'department'
        ? (row: AttendanceDetailsRow) => ({
            key: row.departmentName ?? 'unassigned',
            label: row.departmentName ?? 'Unassigned department',
          })
        : undefined;

  const toggleColumn = (columnId: AttendanceColumnId) => {
    setVisibleColumnIds((current) => {
      const next = new Set(current);
      if (next.has(columnId)) {
        if (next.size > 1) next.delete(columnId);
      } else next.add(columnId);
      return next;
    });
  };

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1800, mx: 'auto' }}>
      <PageHeader
        eyebrow="ATTENDANCE EVIDENCE"
        title="Attendance details"
        meta="Biometric and access-card entry/exit evidence for all scoped employees"
        action={
          <TextField
            size="small"
            type="month"
            label="Attendance month"
            value={selectedMonth}
            onChange={(event) => setMonth(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        }
      />

      {!details.canRead && (
        <Alert severity="warning">Your account cannot read team attendance.</Alert>
      )}
      {details.error && <Alert severity="error">{details.error.message}</Alert>}
      {attendance &&
        !month &&
        attendance.latestRecordedMonth &&
        selectedMonth !== attendance.latestRecordedMonth && (
          <Alert severity="info">
            Showing {monthLabel(selectedMonth)} because it contains the widest workforce coverage.
            The newest recorded activity is {monthLabel(attendance.latestRecordedMonth)}.
          </Alert>
        )}
      {attendance &&
        biometricMonth &&
        selectedMonth !== biometricMonth.month &&
        attendance.summary.completeBiometricDays === 0 && (
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  setMonth(biometricMonth.month);
                  setSourceFilter('biometric');
                  setSearch('');
                  setSortKey('date');
                  setSortDirection('asc');
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
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, minmax(0, 1fr))' },
              gap: 1.5,
            }}
          >
            <SummaryCard
              icon={UsersRound}
              label="Employees"
              value={attendance.summary.employeesWithRecords}
            />
            <SummaryCard
              icon={CalendarClock}
              label="Attendance days"
              value={attendance.summary.attendanceDays}
            />
            <SummaryCard
              icon={Fingerprint}
              label="Biometric complete"
              value={attendance.summary.completeBiometricDays}
            />
            <SummaryCard
              icon={ScanLine}
              label="Access complete"
              value={attendance.summary.completeAccessCardDays}
            />
            <SummaryCard
              icon={TimerReset}
              label="Website sessions"
              value={attendance.summary.websiteSessionDays}
            />
          </Box>

          <Box>
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              searchLabel="Search employee, department, code, date, or status"
              resultCount={filteredRows.length}
              resultLabel={filteredRows.length === 1 ? 'attendance day' : 'attendance days'}
              hasActiveFilters={Boolean(search) || sourceFilter !== 'all' || groupBy !== 'none'}
              onClear={() => {
                setSearch('');
                setSourceFilter('all');
                setGroupBy('none');
              }}
            >
              <TextField
                select
                size="small"
                label="Attendance source"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as AttendanceSourceFilter)}
                sx={{ minWidth: 190 }}
              >
                <MenuItem value="all">All sources</MenuItem>
                <MenuItem value="biometric">Biometric punches</MenuItem>
                <MenuItem value="accessCard">Access-card events</MenuItem>
                <MenuItem value="website">Website sessions</MenuItem>
                <MenuItem value="timesheets">Show timesheets</MenuItem>
              </TextField>
              <TextField
                select
                size="small"
                label="Group by"
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as AttendanceGroup)}
                sx={{ minWidth: 170 }}
              >
                <MenuItem value="none">No grouping</MenuItem>
                <MenuItem value="employee">User / employee</MenuItem>
                <MenuItem value="department">Department</MenuItem>
              </TextField>
              <Button
                variant="outlined"
                startIcon={<Columns3 size={16} />}
                onClick={(event: MouseEvent<HTMLButtonElement>) =>
                  setColumnMenuAnchor(event.currentTarget)
                }
                sx={{ minHeight: 40, whiteSpace: 'nowrap' }}
              >
                Columns ({visibleColumnIds.size})
              </Button>
              <Menu
                anchorEl={columnMenuAnchor}
                open={Boolean(columnMenuAnchor)}
                onClose={() => setColumnMenuAnchor(null)}
                slotProps={{ paper: { sx: { maxHeight: 480, minWidth: 290 } } }}
              >
                {columnOptions.map((column) => (
                  <MenuItem key={column.id} onClick={() => toggleColumn(column.id)} dense>
                    <Checkbox
                      size="small"
                      checked={visibleColumnIds.has(column.id)}
                      disabled={visibleColumnIds.has(column.id) && visibleColumnIds.size === 1}
                    />
                    <ListItemText primary={column.label} />
                  </MenuItem>
                ))}
              </Menu>
            </FilterBar>
            <DataTable
              ariaLabel="All employee attendance source details"
              rows={filteredRows}
              columns={columns}
              getRowId={(row) => row.id}
              getRowGroup={rowGroup}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={updateSort}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={setPage}
              onRowsPerPageChange={(value) => {
                setRowsPerPage(value);
                setPage(0);
              }}
              emptyTitle={`No attendance in ${monthLabel(attendance.month)}`}
              emptyMessage="Choose a recorded month or upload attendance data for this period."
            />
          </Box>
        </>
      ) : null}
    </Stack>
  );
}

function SummaryCard({
  icon: Icon,
  label: cardLabel,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
}) {
  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: 2.25 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: 24, fontWeight: 850 }}>
              {value.toLocaleString('en-IN')}
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{cardLabel}</Typography>
          </Box>
          <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#e9f6f8', color: 'primary.dark' }}>
            <Icon size={18} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

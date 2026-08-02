import type {
  AttendanceReportRow,
  LeaveReportRow,
  RegularisationReportRow,
  TimesheetReportRow,
} from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
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
import { FileDown, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '../components/data-view/DataTable';
import { FilterBar } from '../components/data-view/FilterBar';
import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { useWorkforceReport } from '../lib/reporting';
import {
  parseEnumValue,
  parseIsoDate,
  parseShortSearch,
  useUrlQueryState,
} from '../lib/url-query-state';

type ReportTab = 'attendance' | 'leave' | 'regularisations' | 'timesheets';
type ReportSortKey =
  | 'employee'
  | 'date'
  | 'status'
  | 'source'
  | 'payable'
  | 'difference'
  | 'review'
  | 'type'
  | 'days'
  | 'submitted'
  | 'show'
  | 'duration'
  | 'progress';
type ReportRow =
  AttendanceReportRow | LeaveReportRow | RegularisationReportRow | TimesheetReportRow;

const reportTabs = ['attendance', 'leave', 'regularisations', 'timesheets'] as const;
const reportSortKeys = [
  'employee',
  'date',
  'status',
  'source',
  'payable',
  'difference',
  'review',
  'type',
  'days',
  'submitted',
  'show',
  'duration',
  'progress',
] as const;
const sortDirections = ['asc', 'desc'] as const;
const pageSizes = [10, 25, 50, 100] as const;
const allowedSortKeys: Record<ReportTab, readonly ReportSortKey[]> = {
  attendance: ['employee', 'date', 'status', 'source', 'payable', 'difference', 'review'],
  leave: ['employee', 'date', 'type', 'days', 'status', 'submitted'],
  regularisations: ['employee', 'date', 'source', 'duration', 'status', 'submitted'],
  timesheets: ['employee', 'date', 'show', 'duration', 'progress'],
};

function parseReportTab(value: string): ReportTab | null {
  return parseEnumValue(value, reportTabs);
}

function parseReportSort(value: string): ReportSortKey | null {
  return parseEnumValue(value, reportSortKeys);
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

function parseStatusFilter(value: string): string | null {
  return value === 'all' || /^[a-z_]{1,40}$/.test(value) ? value : null;
}

function indiaDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)}h ${String(absolute % 60).padStart(2, '0')}m`;
}

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function csvValue(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(
  name: string,
  headers: string[],
  rows: Array<Array<string | number | boolean>>,
) {
  const csv = [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function filterRows<T extends ReportRow>(rows: T[], search: string, status: string): T[] {
  const term = search.trim().toLowerCase();
  return rows.filter((row) => {
    const rowStatus = 'status' in row ? row.status : '';
    if (status !== 'all' && rowStatus !== status) return false;
    const values = [row.employeeDisplayName, row.employeeCode, rowStatus];
    if ('showName' in row) values.push(row.showName, row.showCode, row.comment);
    if ('leaveType' in row) values.push(row.leaveType, row.dayPart);
    if ('source' in row) values.push(row.source);
    return !term || values.some((value) => value.toLowerCase().includes(term));
  });
}

export function ReportingPage() {
  const today = useMemo(indiaDate, []);
  const defaultDateFrom = `${today.slice(0, 8)}01`;
  const [appliedDateFrom, setAppliedDateFrom] = useUrlQueryState(
    'from',
    defaultDateFrom,
    parseIsoDate,
  );
  const [appliedDateTo, setAppliedDateTo] = useUrlQueryState('to', today, parseIsoDate);
  const [tab, setTab] = useUrlQueryState<ReportTab>('tab', 'attendance', parseReportTab);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [status, setStatus] = useUrlQueryState('status', 'all', parseStatusFilter);
  const [sortKey, setSortKey] = useUrlQueryState<ReportSortKey>('sort', 'date', parseReportSort);
  const [sortDirection, setSortDirection] = useUrlQueryState<SortDirection>(
    'order',
    'desc',
    parseSortDirection,
  );
  const [pageNumber, setPageNumber] = useUrlQueryState('page', 1, parsePage);
  const [rowsPerPage, setRowsPerPage] = useUrlQueryState('size', 25, parsePageSize);
  const hasValidAppliedRange = appliedDateFrom <= appliedDateTo;
  const activeRange = hasValidAppliedRange
    ? { dateFrom: appliedDateFrom, dateTo: appliedDateTo }
    : { dateFrom: defaultDateFrom, dateTo: today };
  const [dateFrom, setDateFrom] = useState(activeRange.dateFrom);
  const [dateTo, setDateTo] = useState(activeRange.dateTo);
  const reporting = useWorkforceReport(activeRange.dateFrom, activeRange.dateTo);
  const report = reporting.report;

  useEffect(() => {
    if (!hasValidAppliedRange) {
      setAppliedDateFrom(defaultDateFrom);
      setAppliedDateTo(today);
      return;
    }
    setDateFrom(appliedDateFrom);
    setDateTo(appliedDateTo);
  }, [
    appliedDateFrom,
    appliedDateTo,
    defaultDateFrom,
    hasValidAppliedRange,
    setAppliedDateFrom,
    setAppliedDateTo,
    today,
  ]);

  useEffect(() => {
    if (!allowedSortKeys[tab].includes(sortKey)) setSortKey('date');
  }, [setSortKey, sortKey, tab]);

  const filteredAttendance = useMemo(
    () => filterRows(report?.attendance ?? [], search, status),
    [report?.attendance, search, status],
  );
  const filteredLeave = useMemo(
    () => filterRows(report?.leave ?? [], search, status),
    [report?.leave, search, status],
  );
  const filteredRegularisations = useMemo(
    () => filterRows(report?.regularisations ?? [], search, status),
    [report?.regularisations, search, status],
  );
  const filteredTimesheets = useMemo(
    () => filterRows(report?.timesheets ?? [], search, status),
    [report?.timesheets, search, status],
  );
  const activeRows: ReportRow[] = report ? report[tab] : [];
  const activeFilteredCount =
    tab === 'attendance'
      ? filteredAttendance.length
      : tab === 'leave'
        ? filteredLeave.length
        : tab === 'regularisations'
          ? filteredRegularisations.length
          : filteredTimesheets.length;
  const statusOptions: string[] = [
    ...new Set(activeRows.flatMap((row) => ('status' in row ? [row.status] : []))),
  ].sort();

  useEffect(() => {
    if (status !== 'all' && !statusOptions.includes(status)) setStatus('all');
  }, [setStatus, status, statusOptions]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(activeFilteredCount / rowsPerPage));
    if (pageNumber > lastPage) setPageNumber(lastPage);
  }, [activeFilteredCount, pageNumber, rowsPerPage, setPageNumber]);

  const tabs = useMemo<ReadonlyArray<PageTab<ReportTab>>>(
    () => [
      { value: 'attendance', label: 'Attendance', count: report?.attendance.length ?? 0 },
      { value: 'timesheets', label: 'Timesheets', count: report?.timesheets.length ?? 0 },
      { value: 'leave', label: 'Leave', count: report?.leave.length ?? 0 },
      {
        value: 'regularisations',
        label: 'Regularisation',
        count: report?.regularisations.length ?? 0,
      },
    ],
    [report],
  );

  const applyRange = () => {
    if (dateFrom && dateTo && dateFrom <= dateTo) {
      setAppliedDateFrom(dateFrom);
      setAppliedDateTo(dateTo);
      setPageNumber(1);
    }
  };
  const updateSort = (key: ReportSortKey) => {
    if (key === sortKey) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPageNumber(1);
  };
  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setPageNumber(1);
  };

  const exportSelected = () => {
    if (!report) return;
    const baseName = `${tab}-${report.dateFrom}-to-${report.dateTo}.csv`;
    if (tab === 'attendance') {
      downloadCsv(
        baseName,
        [
          'Employee code',
          'Employee',
          'Work date',
          'Status',
          'Source',
          'Payable minutes',
          'Required minutes',
          'Difference minutes',
          'Requires review',
          'Anomalies',
          'Final source',
        ],
        filteredAttendance.map((row) => [
          row.employeeCode,
          row.employeeDisplayName,
          row.workDate,
          row.status,
          row.primarySource,
          row.payableMinutes,
          row.requiredMinutes,
          row.differenceMinutes,
          row.requiresReview,
          row.anomalies.join('; '),
          row.finalSource,
        ]),
      );
    } else if (tab === 'leave') {
      downloadCsv(
        baseName,
        [
          'Employee code',
          'Employee',
          'Leave type',
          'Start date',
          'End date',
          'Day part',
          'Days',
          'Status',
          'Submitted at',
        ],
        filteredLeave.map((row) => [
          row.employeeCode,
          row.employeeDisplayName,
          row.leaveType,
          row.startDate,
          row.endDate,
          row.dayPart,
          row.requestedDays,
          row.status,
          row.submittedAt,
        ]),
      );
    } else if (tab === 'regularisations') {
      downloadCsv(
        baseName,
        [
          'Employee code',
          'Employee',
          'Work date',
          'Source',
          'Missing event',
          'Requested minutes',
          'Status',
          'Submitted at',
        ],
        filteredRegularisations.map((row) => [
          row.employeeCode,
          row.employeeDisplayName,
          row.workDate,
          row.source,
          row.missingEvent,
          row.requestedMinutes,
          row.status,
          row.submittedAt,
        ]),
      );
    } else {
      downloadCsv(
        baseName,
        [
          'Employee code',
          'Employee',
          'Work date',
          'Show code',
          'Show',
          'Duration minutes',
          'Progress percentage',
          'Comment',
        ],
        filteredTimesheets.map((row) => [
          row.employeeCode,
          row.employeeDisplayName,
          row.workDate,
          row.showCode,
          row.showName,
          row.durationMinutes,
          row.percentage,
          row.comment,
        ]),
      );
    }
  };

  const queueProps = {
    sortKey,
    sortDirection,
    page: pageNumber - 1,
    rowsPerPage,
    onSort: updateSort,
    onPageChange: (page: number) => setPageNumber(page + 1),
    onRowsPerPageChange: (size: number) => {
      setRowsPerPage(size);
      setPageNumber(1);
    },
  };

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1500, mx: 'auto' }}>
      <PageHeader
        eyebrow="REPORTING CENTER"
        title="Workforce reports"
        meta={`${activeRange.dateFrom} to ${activeRange.dateTo}`}
        action={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField
              size="small"
              type="date"
              label="From"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: dateTo } }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dateFrom } }}
            />
            <Button
              variant="contained"
              onClick={applyRange}
              disabled={!dateFrom || !dateTo || dateFrom > dateTo || reporting.isFetching}
              startIcon={
                reporting.isFetching ? <CircularProgress size={15} /> : <RefreshCw size={16} />
              }
            >
              Run report
            </Button>
          </Stack>
        }
      />

      {!reporting.canRead && (
        <Alert severity="warning">Your account does not have reporting access.</Alert>
      )}
      {reporting.error && <Alert severity="error">{reporting.error.message}</Alert>}

      {reporting.isLoading ? (
        <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading workforce report" />
        </Box>
      ) : report ? (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                sm: 'repeat(4, minmax(100px, 1fr))',
              },
              minHeight: 68,
              px: 2,
              py: 1.25,
              alignItems: 'center',
              gap: { xs: 1.5, sm: 4 },
              borderTop: '1px solid',
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: '#fff',
            }}
          >
            <SummaryValue label="Employees" value={String(report.summary.scopedEmployees)} />
            <SummaryValue
              label="Payable time"
              value={formatMinutes(report.summary.payableMinutes)}
            />
            <SummaryValue
              label="Pending approvals"
              value={String(report.summary.pendingApprovals)}
            />
            <SummaryValue label="Exception days" value={String(report.summary.exceptionDays)} />
          </Box>

          <Box>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              sx={{
                alignItems: { md: 'center' },
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <PageTabs
                  value={tab}
                  tabs={tabs}
                  onChange={(value) => {
                    setTab(value);
                    setSearch('');
                    setStatus('all');
                    setSortKey('date');
                    setSortDirection('desc');
                    setPageNumber(1);
                  }}
                  ariaLabel="Report dataset"
                />
              </Box>
              <Button
                sx={{ mx: 1.25, my: 0.75 }}
                variant="outlined"
                startIcon={<FileDown size={16} />}
                disabled={activeFilteredCount === 0}
                onClick={exportSelected}
              >
                Export CSV
              </Button>
            </Stack>
            <FilterBar
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPageNumber(1);
              }}
              searchLabel="Search report"
              resultCount={activeFilteredCount}
              resultLabel={activeFilteredCount === 1 ? 'record' : 'records'}
              hasActiveFilters={Boolean(search) || (tab !== 'timesheets' && status !== 'all')}
              onClear={clearFilters}
            >
              {tab !== 'timesheets' && (
                <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 190 } }}>
                  <InputLabel id="report-status-filter-label">Status</InputLabel>
                  <Select
                    labelId="report-status-filter-label"
                    label="Status"
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value);
                      setPageNumber(1);
                    }}
                  >
                    <MenuItem value="all">All statuses</MenuItem>
                    {statusOptions.map((option) => (
                      <MenuItem key={option} value={option}>
                        {label(option)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </FilterBar>
          </Box>

          {tab === 'attendance' ? (
            <AttendanceTable rows={filteredAttendance} {...queueProps} />
          ) : tab === 'leave' ? (
            <LeaveTable rows={filteredLeave} {...queueProps} />
          ) : tab === 'regularisations' ? (
            <RegularisationTable rows={filteredRegularisations} {...queueProps} />
          ) : (
            <TimesheetTable rows={filteredTimesheets} {...queueProps} />
          )}
        </>
      ) : null}
    </Stack>
  );
}

interface TableProps {
  sortKey: ReportSortKey;
  sortDirection: SortDirection;
  page: number;
  rowsPerPage: number;
  onSort: (key: ReportSortKey) => void;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (size: number) => void;
}

function AttendanceTable({ rows, ...props }: TableProps & { rows: AttendanceReportRow[] }) {
  const sortedRows = sortAttendance(rows, props.sortKey, props.sortDirection);
  const columns: ReadonlyArray<DataTableColumn<AttendanceReportRow, ReportSortKey>> = [
    employeeColumn(),
    { id: 'date', label: 'Date', sortKey: 'date', width: 115, render: (row) => row.workDate },
    {
      id: 'status',
      label: 'Status',
      sortKey: 'status',
      width: 145,
      render: (row) => <ReportStatus status={row.status} />,
    },
    {
      id: 'source',
      label: 'Source',
      sortKey: 'source',
      hideBelow: 'sm',
      width: 130,
      render: (row) => label(row.primarySource),
    },
    {
      id: 'payable',
      label: 'Payable',
      sortKey: 'payable',
      align: 'right',
      hideBelow: 'sm',
      width: 105,
      render: (row) => formatMinutes(row.payableMinutes),
    },
    {
      id: 'difference',
      label: 'Difference',
      sortKey: 'difference',
      align: 'right',
      hideBelow: 'md',
      width: 115,
      render: (row) =>
        ['weekend', 'holiday', 'leave'].includes(row.status)
          ? 'Not required'
          : formatMinutes(row.differenceMinutes),
    },
    {
      id: 'review',
      label: 'Review',
      sortKey: 'review',
      hideBelow: 'md',
      width: 100,
      render: (row) => (row.requiresReview ? 'Required' : 'Clear'),
    },
    {
      id: 'anomalies',
      label: 'Anomalies',
      hideBelow: 'md',
      minWidth: 220,
      render: (row) => row.anomalies.map(label).join(', ') || 'None',
    },
  ];
  return (
    <ReportDataTable ariaLabel="Attendance report" rows={sortedRows} columns={columns} {...props} />
  );
}

function LeaveTable({ rows, ...props }: TableProps & { rows: LeaveReportRow[] }) {
  const sortedRows = sortLeave(rows, props.sortKey, props.sortDirection);
  const columns: ReadonlyArray<DataTableColumn<LeaveReportRow, ReportSortKey>> = [
    employeeColumn(),
    {
      id: 'dates',
      label: 'Dates',
      sortKey: 'date',
      minWidth: 175,
      render: (row) =>
        row.startDate === row.endDate ? row.startDate : `${row.startDate} – ${row.endDate}`,
    },
    {
      id: 'type',
      label: 'Type',
      sortKey: 'type',
      hideBelow: 'sm',
      width: 120,
      render: (row) => label(row.leaveType),
    },
    {
      id: 'part',
      label: 'Day part',
      hideBelow: 'md',
      width: 130,
      render: (row) => label(row.dayPart),
    },
    {
      id: 'days',
      label: 'Days',
      sortKey: 'days',
      align: 'right',
      hideBelow: 'sm',
      width: 80,
      render: (row) => row.requestedDays,
    },
    {
      id: 'status',
      label: 'Status',
      sortKey: 'status',
      width: 145,
      render: (row) => <ReportStatus status={row.status} />,
    },
    {
      id: 'submitted',
      label: 'Submitted',
      sortKey: 'submitted',
      hideBelow: 'md',
      width: 120,
      render: (row) => row.submittedAt.slice(0, 10),
    },
  ];
  return (
    <ReportDataTable ariaLabel="Leave report" rows={sortedRows} columns={columns} {...props} />
  );
}

function RegularisationTable({ rows, ...props }: TableProps & { rows: RegularisationReportRow[] }) {
  const sortedRows = sortRegularisations(rows, props.sortKey, props.sortDirection);
  const columns: ReadonlyArray<DataTableColumn<RegularisationReportRow, ReportSortKey>> = [
    employeeColumn(),
    { id: 'date', label: 'Work date', sortKey: 'date', width: 120, render: (row) => row.workDate },
    {
      id: 'source',
      label: 'Source',
      sortKey: 'source',
      hideBelow: 'sm',
      width: 125,
      render: (row) => label(row.source),
    },
    {
      id: 'missing',
      label: 'Missing event',
      hideBelow: 'md',
      width: 135,
      render: (row) => label(row.missingEvent),
    },
    {
      id: 'duration',
      label: 'Requested',
      sortKey: 'duration',
      align: 'right',
      hideBelow: 'sm',
      width: 110,
      render: (row) => formatMinutes(row.requestedMinutes),
    },
    {
      id: 'status',
      label: 'Status',
      sortKey: 'status',
      width: 150,
      render: (row) => <ReportStatus status={row.status} />,
    },
    {
      id: 'submitted',
      label: 'Submitted',
      sortKey: 'submitted',
      hideBelow: 'md',
      width: 120,
      render: (row) => row.submittedAt.slice(0, 10),
    },
  ];
  return (
    <ReportDataTable
      ariaLabel="Regularisation report"
      rows={sortedRows}
      columns={columns}
      {...props}
    />
  );
}

function TimesheetTable({ rows, ...props }: TableProps & { rows: TimesheetReportRow[] }) {
  const sortedRows = sortTimesheets(rows, props.sortKey, props.sortDirection);
  const columns: ReadonlyArray<DataTableColumn<TimesheetReportRow, ReportSortKey>> = [
    employeeColumn(),
    { id: 'date', label: 'Date', sortKey: 'date', width: 115, render: (row) => row.workDate },
    {
      id: 'show',
      label: 'Show',
      sortKey: 'show',
      minWidth: 190,
      render: (row) => <PrimarySecondary primary={row.showName} secondary={row.showCode} />,
    },
    {
      id: 'duration',
      label: 'Duration',
      sortKey: 'duration',
      align: 'right',
      hideBelow: 'sm',
      width: 105,
      render: (row) => formatMinutes(row.durationMinutes),
    },
    {
      id: 'progress',
      label: 'Progress',
      sortKey: 'progress',
      align: 'right',
      hideBelow: 'md',
      width: 105,
      render: (row) => `${row.percentage}%`,
    },
    {
      id: 'comment',
      label: 'Comment',
      hideBelow: 'md',
      minWidth: 240,
      render: (row) => (
        <Typography noWrap sx={{ maxWidth: 360, fontSize: 12 }}>
          {row.comment}
        </Typography>
      ),
    },
  ];
  return (
    <ReportDataTable ariaLabel="Timesheet report" rows={sortedRows} columns={columns} {...props} />
  );
}

function ReportDataTable<Row extends ReportRow>({
  ariaLabel,
  rows,
  columns,
  ...props
}: TableProps & {
  ariaLabel: string;
  rows: Row[];
  columns: ReadonlyArray<DataTableColumn<Row, ReportSortKey>>;
}) {
  return (
    <DataTable
      ariaLabel={ariaLabel}
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      sortKey={props.sortKey}
      sortDirection={props.sortDirection}
      onSort={props.onSort}
      page={props.page}
      rowsPerPage={props.rowsPerPage}
      onPageChange={props.onPageChange}
      onRowsPerPageChange={props.onRowsPerPageChange}
      emptyTitle="No records for this period"
      emptyMessage="Change the report range or clear the active filters."
    />
  );
}

function employeeColumn<Row extends ReportRow>(): DataTableColumn<Row, ReportSortKey> {
  return {
    id: 'employee',
    label: 'Employee',
    sortKey: 'employee',
    minWidth: 210,
    render: (row) => (
      <PrimarySecondary primary={row.employeeDisplayName} secondary={row.employeeCode} />
    ),
  };
}

function PrimarySecondary({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 750 }}>
        {primary}
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{secondary}</Typography>
    </Box>
  );
}

function ReportStatus({ status }: { status: string }) {
  const success = ['present', 'approved'].includes(status);
  const warning = status.startsWith('pending') || status === 'submitted' || status === 'partial';
  return (
    <Chip
      size="small"
      label={label(status)}
      color={
        success
          ? 'success'
          : warning
            ? 'warning'
            : status === 'rejected' || status === 'absent'
              ? 'error'
              : 'default'
      }
      variant="outlined"
    />
  );
}

function SummaryValue({ label: valueLabel, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 105 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{valueLabel}</Typography>
      <Typography sx={{ mt: 0.15, fontSize: 15, fontWeight: 850 }}>{value}</Typography>
    </Box>
  );
}

function directionMultiplier(direction: SortDirection): number {
  return direction === 'asc' ? 1 : -1;
}

function sortAttendance(rows: AttendanceReportRow[], key: ReportSortKey, direction: SortDirection) {
  const multiplier = directionMultiplier(direction);
  return rows.slice().sort((left, right) => {
    const comparison =
      key === 'employee'
        ? left.employeeDisplayName.localeCompare(right.employeeDisplayName)
        : key === 'status'
          ? left.status.localeCompare(right.status)
          : key === 'source'
            ? left.primarySource.localeCompare(right.primarySource)
            : key === 'payable'
              ? left.payableMinutes - right.payableMinutes
              : key === 'difference'
                ? left.differenceMinutes - right.differenceMinutes
                : key === 'review'
                  ? Number(left.requiresReview) - Number(right.requiresReview)
                  : left.workDate.localeCompare(right.workDate);
    return comparison * multiplier || left.id.localeCompare(right.id);
  });
}

function sortLeave(rows: LeaveReportRow[], key: ReportSortKey, direction: SortDirection) {
  const multiplier = directionMultiplier(direction);
  return rows.slice().sort((left, right) => {
    const comparison =
      key === 'employee'
        ? left.employeeDisplayName.localeCompare(right.employeeDisplayName)
        : key === 'status'
          ? left.status.localeCompare(right.status)
          : key === 'type'
            ? left.leaveType.localeCompare(right.leaveType)
            : key === 'days'
              ? left.requestedDays - right.requestedDays
              : key === 'submitted'
                ? left.submittedAt.localeCompare(right.submittedAt)
                : left.startDate.localeCompare(right.startDate);
    return comparison * multiplier || left.id.localeCompare(right.id);
  });
}

function sortRegularisations(
  rows: RegularisationReportRow[],
  key: ReportSortKey,
  direction: SortDirection,
) {
  const multiplier = directionMultiplier(direction);
  return rows.slice().sort((left, right) => {
    const comparison =
      key === 'employee'
        ? left.employeeDisplayName.localeCompare(right.employeeDisplayName)
        : key === 'status'
          ? left.status.localeCompare(right.status)
          : key === 'source'
            ? left.source.localeCompare(right.source)
            : key === 'duration'
              ? left.requestedMinutes - right.requestedMinutes
              : key === 'submitted'
                ? left.submittedAt.localeCompare(right.submittedAt)
                : left.workDate.localeCompare(right.workDate);
    return comparison * multiplier || left.id.localeCompare(right.id);
  });
}

function sortTimesheets(rows: TimesheetReportRow[], key: ReportSortKey, direction: SortDirection) {
  const multiplier = directionMultiplier(direction);
  return rows.slice().sort((left, right) => {
    const comparison =
      key === 'employee'
        ? left.employeeDisplayName.localeCompare(right.employeeDisplayName)
        : key === 'show'
          ? left.showName.localeCompare(right.showName)
          : key === 'duration'
            ? left.durationMinutes - right.durationMinutes
            : key === 'progress'
              ? left.percentage - right.percentage
              : left.workDate.localeCompare(right.workDate);
    return comparison * multiplier || left.id.localeCompare(right.id);
  });
}

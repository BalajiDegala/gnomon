import type { LeaveRequestDto, RegularisationRequestDto } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Check,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  RotateCcw,
  Rows3,
  Rows4,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ColumnPicker } from '../components/data-view/ColumnPicker';
import { DataGrid, type DataGridColumn } from '../components/data-view/DataGrid';
import { MultiSelectFilter } from '../components/data-view/MultiSelectFilter';
import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs } from '../components/data-view/PageTabs';
import {
  approvalColumnIds,
  approvalColumnLabels,
  approvalFacet,
  approvalGroupFor,
  approvalGroupLabels,
  approvalGroupOptions,
  buildApprovalExport,
  decisionLabel,
  defaultApprovalSort,
  defaultVisibleApprovalColumns,
  filterApprovals,
  leaveRow,
  nextApprovalSort,
  orderApprovals,
  parseApprovalSort,
  parseVisibleApprovalColumns,
  regularisationRow,
  serializeApprovalSort,
  type ApprovalColumnId,
  type ApprovalGroupBy,
  type ApprovalRow,
  type ApprovalSortRule,
} from '../lib/approval-view';
import { useAuth } from '../lib/auth';
import { useStoredColumnOrder } from '../lib/column-order';
import { downloadCsv } from '../lib/csv';
import { useLeaveApprovals } from '../lib/leaves';
import { useRegularisationApprovals } from '../lib/regularisations';
import { formatIndiaTime } from '../lib/timecard';
import { formatMinutes } from '../lib/timesheets';
import {
  parseEnumValue,
  parseIsoDate,
  parseShortSearch,
  useUrlQueryState,
} from '../lib/url-query-state';
import { leaveTypeLabels } from './LeavePage';

type ApprovalTab = 'regularisations' | 'leave';
type ApprovalView = 'pending' | 'decided';
type SelectedApproval =
  | { kind: 'regularisations'; item: RegularisationRequestDto }
  | { kind: 'leave'; item: LeaveRequestDto };

const approvalViews = ['pending', 'decided'] as const;
const LIST_SEPARATOR = '|';
const emptyList: readonly string[] = [];

const parseApprovalView = (value: string) => parseEnumValue(value, approvalViews);
const parseGroupBy = (value: string) => parseEnumValue(value, approvalGroupOptions);
const parseList = (value: string): readonly string[] | null => {
  const items = value.split(LIST_SEPARATOR).filter(Boolean);
  return items.length <= 50 && items.every((item) => item.length <= 80) ? items : null;
};
const serializeList = (items: readonly string[]) => items.join(LIST_SEPARATOR);
const parseOptionalDate = (value: string) => (value === '' ? '' : parseIsoDate(value));
const parseSort = (value: string) => parseApprovalSort(value);
const serializeSort = (rules: readonly ApprovalSortRule[]) => serializeApprovalSort(rules);

const finalStatusLabels: Record<string, string> = {
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function stageColor(status: string): 'warning' | 'info' | 'success' | 'error' | 'default' {
  if (status === 'pending_manager') return 'warning';
  if (status === 'pending_hr') return 'info';
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  return 'default';
}

function regularisationStage(request: RegularisationRequestDto): string {
  const final = finalStatusLabels[request.status];
  if (final) return final;
  return request.status === 'pending_manager' ? 'Manager review' : 'Final HR review';
}

function leaveStage(request: LeaveRequestDto): string {
  const final = finalStatusLabels[request.status];
  if (final) return final;
  return request.status === 'pending_manager'
    ? `Approver 1 of ${request.approvalSteps}`
    : `Approver 2 of ${request.approvalSteps}`;
}

function readStored<T>(key: string, parse: (value: unknown) => T | null, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (parse(JSON.parse(raw)) ?? fallback);
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

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: '10px', bgcolor: 'var(--g-base)' } };
const outlinedButtonSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '10px',
  bgcolor: 'var(--g-base)',
};
const DENSITY_STORAGE_KEY = 'gnomon:approvals:density';
const VISIBLE_COLUMNS_STORAGE_KEY = 'gnomon:approvals:visible-columns';
const COLUMN_ORDER_STORAGE_KEY = 'gnomon:approvals:column-order';

export function ApprovalQueuePage({ kind }: { kind: ApprovalTab }) {
  const { user } = useAuth();
  const regularisations = useRegularisationApprovals();
  const leave = useLeaveApprovals();
  const canApprove = kind === 'regularisations' ? regularisations.canApprove : leave.canApprove;
  const [view, setView] = useUrlQueryState<ApprovalView>('view', 'pending', parseApprovalView);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [stageFilter, setStageFilter] = useUrlQueryState(
    'stage',
    emptyList,
    parseList,
    serializeList,
  );
  const [categoryFilter, setCategoryFilter] = useUrlQueryState(
    'type',
    emptyList,
    parseList,
    serializeList,
  );
  const [decisionFilter, setDecisionFilter] = useUrlQueryState(
    'decision',
    emptyList,
    parseList,
    serializeList,
  );
  const [dateFrom, setDateFrom] = useUrlQueryState('from', '', parseOptionalDate);
  const [dateTo, setDateTo] = useUrlQueryState('to', '', parseOptionalDate);
  const [groupBy, setGroupBy] = useUrlQueryState<ApprovalGroupBy>('group', 'none', parseGroupBy);
  const defaultSort = useMemo(() => defaultApprovalSort(view), [view]);
  const [sortRules, setSortRules] = useUrlQueryState<readonly ApprovalSortRule[]>(
    'sort',
    defaultSort,
    parseSort,
    serializeSort,
  );
  const [visibleColumns, setVisibleColumns] = useState<ApprovalColumnId[]>(() =>
    readStored(VISIBLE_COLUMNS_STORAGE_KEY, parseVisibleApprovalColumns, [
      ...defaultVisibleApprovalColumns,
    ]),
  );
  const columnOrder = useStoredColumnOrder(COLUMN_ORDER_STORAGE_KEY, approvalColumnIds);
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
  const [selected, setSelected] = useState<SelectedApproval | null>(null);
  const [decisionComment, setDecisionComment] = useState('');

  useEffect(() => writeStored(VISIBLE_COLUMNS_STORAGE_KEY, visibleColumns), [visibleColumns]);
  useEffect(() => writeStored(DENSITY_STORAGE_KEY, density), [density]);

  const columnLabels = approvalColumnLabels(kind);
  const groupLabels = approvalGroupLabels(kind);
  const sourceRequests =
    kind === 'regularisations'
      ? view === 'pending'
        ? regularisations.requests
        : regularisations.history
      : view === 'pending'
        ? leave.requests
        : leave.history;
  const allRows = useMemo<ApprovalRow[]>(
    () =>
      kind === 'regularisations'
        ? (sourceRequests as RegularisationRequestDto[]).map((request) =>
            regularisationRow(request, user?.employeeId, formatIndiaTime),
          )
        : (sourceRequests as LeaveRequestDto[]).map((request) =>
            leaveRow(request, user?.employeeId, (type) => leaveTypeLabels[type]),
          ),
    [kind, sourceRequests, user?.employeeId],
  );
  const viewRows = useMemo(
    () =>
      orderApprovals(
        filterApprovals(allRows, {
          search,
          stages: stageFilter,
          categories: categoryFilter,
          decisions: view === 'decided' ? decisionFilter : [],
          dateFrom,
          dateTo,
        }),
        sortRules,
        groupBy,
      ),
    [
      allRows,
      categoryFilter,
      dateFrom,
      dateTo,
      decisionFilter,
      groupBy,
      search,
      sortRules,
      stageFilter,
      view,
    ],
  );
  const groupKeys = useMemo(
    () =>
      groupBy === 'none'
        ? []
        : [...new Set(viewRows.map((row) => approvalGroupFor(row, groupBy).key))],
    [groupBy, viewRows],
  );
  const stageOptions = useMemo(() => approvalFacet(allRows, (row) => row.stage), [allRows]);
  const categoryOptions = useMemo(() => approvalFacet(allRows, (row) => row.category), [allRows]);
  const decisionOptions = useMemo(() => approvalFacet(allRows, decisionLabel), [allRows]);

  useEffect(
    () => setPage(0),
    [categoryFilter, dateFrom, dateTo, decisionFilter, groupBy, search, stageFilter, kind, view],
  );
  useEffect(() => setCollapsedGroups(new Set()), [groupBy]);

  const activeError =
    view === 'decided'
      ? kind === 'regularisations'
        ? regularisations.historyError
        : leave.historyError
      : kind === 'regularisations'
        ? regularisations.error
        : leave.error;
  const isLoading =
    kind === 'regularisations'
      ? view === 'pending'
        ? regularisations.isLoading
        : regularisations.isHistoryLoading
      : view === 'pending'
        ? leave.isLoading
        : leave.isHistoryLoading;
  const pendingCount =
    kind === 'regularisations' ? regularisations.requests.length : leave.requests.length;

  const hasFilters =
    Boolean(search) ||
    stageFilter.length > 0 ||
    categoryFilter.length > 0 ||
    decisionFilter.length > 0 ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    groupBy !== 'none';
  const clearFilters = () => {
    setSearch('');
    setStageFilter([]);
    setCategoryFilter([]);
    setDecisionFilter([]);
    setDateFrom('');
    setDateTo('');
    setGroupBy('none');
  };

  const selectRow = (row: ApprovalRow) => {
    const item = sourceRequests.find((request) => request.id === row.id);
    if (!item) return;
    setSelected(
      kind === 'regularisations'
        ? { kind, item: item as RegularisationRequestDto }
        : { kind: 'leave', item: item as LeaveRequestDto },
    );
    setDecisionComment('');
  };

  const decide = async (decision: 'approved' | 'rejected') => {
    if (!selected) return;
    try {
      const input = { decision, comment: decisionComment.trim() };
      if (selected.kind === 'regularisations') {
        await regularisations.decide(selected.item.id, input);
      } else await leave.decide(selected.item.id, input);
      setSelected(null);
      setDecisionComment('');
    } catch {
      // The active mutation error is rendered in the review drawer.
    }
  };

  const formatDateTime = (value: string | null) =>
    value
      ? new Date(value).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        })
      : null;

  const allColumns: Record<ApprovalColumnId, DataGridColumn<ApprovalRow, ApprovalColumnId>> = {
    employee: {
      id: 'employee',
      label: columnLabels.employee,
      sortKey: 'employee',
      minWidth: 210,
      sticky: true,
      render: (row) => <EmployeeCell name={row.employeeName} code={row.employeeCode} />,
    },
    date: {
      id: 'date',
      label: columnLabels.date,
      sortKey: 'date',
      minWidth: kind === 'leave' ? 180 : 120,
      render: (row) => <CellText>{row.dateLabel}</CellText>,
    },
    category: {
      id: 'category',
      label: columnLabels.category,
      sortKey: 'category',
      minWidth: 130,
      render: (row) => <CellText>{row.category}</CellText>,
    },
    detail: {
      id: 'detail',
      label: columnLabels.detail,
      sortKey: 'detail',
      minWidth: kind === 'leave' ? 120 : 170,
      render: (row) => <CellText>{row.detail}</CellText>,
    },
    amount: {
      id: 'amount',
      label: columnLabels.amount,
      sortKey: 'amount',
      width: 110,
      align: 'right',
      render: (row) => <CellText>{row.amountLabel}</CellText>,
    },
    reason: {
      id: 'reason',
      label: columnLabels.reason,
      sortKey: 'reason',
      minWidth: 240,
      render: (row) => (
        <Tooltip title={row.reason} enterDelay={500}>
          <Typography noWrap sx={{ fontSize: 12.5, color: 'text.secondary' }}>
            {row.reason}
          </Typography>
        </Tooltip>
      ),
    },
    stage: {
      id: 'stage',
      label: columnLabels.stage,
      sortKey: 'stage',
      minWidth: 150,
      render: (row) => (
        <Chip size="small" variant="outlined" color={stageColor(row.status)} label={row.stage} />
      ),
    },
    submitted: {
      id: 'submitted',
      label: columnLabels.submitted,
      sortKey: 'submitted',
      minWidth: 170,
      render: (row) => <CellText>{formatDateTime(row.submittedAt)}</CellText>,
    },
    decision: {
      id: 'decision',
      label: columnLabels.decision,
      sortKey: 'decision',
      minWidth: 140,
      render: (row) =>
        row.myDecision ? (
          <Chip
            size="small"
            variant="outlined"
            color={row.myDecision === 'approved' ? 'success' : 'error'}
            label={decisionLabel(row)}
          />
        ) : (
          <CellText>{null}</CellText>
        ),
    },
    decidedAt: {
      id: 'decidedAt',
      label: columnLabels.decidedAt,
      sortKey: 'decidedAt',
      minWidth: 170,
      render: (row) => <CellText>{formatDateTime(row.myDecidedAt)}</CellText>,
    },
  };
  // "Your decision" columns only make sense once you have decided.
  const hiddenInView = (id: ApprovalColumnId) =>
    view === 'pending' && (id === 'decision' || id === 'decidedAt');
  const groupedColumn: Partial<Record<ApprovalGroupBy, ApprovalColumnId>> = {
    employee: 'employee',
    stage: 'stage',
    category: 'category',
    decision: 'decision',
  };
  const orderedIds = columnOrder.order.filter(
    (id) => visibleColumns.includes(id) && !hiddenInView(id) && groupedColumn[groupBy] !== id,
  );
  const gridColumns: DataGridColumn<ApprovalRow, ApprovalColumnId>[] = [
    ...(orderedIds.length ? orderedIds : (['employee'] as const)).map((id) => allColumns[id]),
    {
      id: 'review',
      label: 'Review',
      align: 'right',
      width: 80,
      render: (row) => (
        <Tooltip title="Review request">
          <IconButton size="small" aria-label="Review request" onClick={() => selectRow(row)}>
            <ChevronRight size={17} />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  const exportCsv = () => {
    const ids = columnOrder.order.filter((id) => visibleColumns.includes(id) && !hiddenInView(id));
    const csv = buildApprovalExport(viewRows, kind, ids, groupBy);
    const name = ['approvals', kind, view, groupBy !== 'none' ? `by-${groupBy}` : null]
      .filter(Boolean)
      .join('-');
    downloadCsv(`${name}.csv`, csv.headers, csv.rows);
  };

  const pickerColumns = columnOrder.order
    .filter((id) => !hiddenInView(id))
    .map((id) => ({ id, label: columnLabels[id] }));

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1800, mx: 'auto' }}>
      <PageHeader
        eyebrow="APPROVALS"
        title={kind === 'leave' ? 'Leave approvals' : 'Regularisation approvals'}
        meta={`${pendingCount} ${pendingCount === 1 ? 'request' : 'requests'} awaiting your decision`}
        action={
          canApprove ? (
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<Download size={16} />}
              onClick={exportCsv}
              disabled={!viewRows.length}
              sx={outlinedButtonSx}
            >
              Export CSV
            </Button>
          ) : undefined
        }
      />

      {activeError && !selected && <Alert severity="error">{activeError.message}</Alert>}
      {!canApprove && (
        <Alert severity="info">
          Your account cannot approve {kind === 'leave' ? 'leave' : 'regularisation'} requests.
        </Alert>
      )}

      {canApprove && (
        <>
          <Box>
            <PageTabs
              value={view}
              tabs={[
                {
                  value: 'pending',
                  label: 'Waiting for me',
                  count:
                    kind === 'regularisations'
                      ? regularisations.requests.length
                      : leave.requests.length,
                },
                {
                  value: 'decided',
                  label: 'Decided by me',
                  count:
                    kind === 'regularisations'
                      ? regularisations.history.length
                      : leave.history.length,
                },
              ]}
              onChange={(value) => {
                setView(value);
                setStageFilter([]);
                setDecisionFilter([]);
                setSortRules(defaultApprovalSort(value));
                setSelected(null);
              }}
              ariaLabel="Approval status"
            />
          </Box>

          <Stack direction="row" sx={{ gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search employee, reason…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              sx={{ width: { xs: '100%', sm: 240 }, ...fieldSx }}
              slotProps={{
                htmlInput: { 'aria-label': 'Search approvals' },
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search size={15} />
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
            <TextField
              type="date"
              size="small"
              label="From"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 155, ...fieldSx }}
            />
            <TextField
              type="date"
              size="small"
              label="To"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 155, ...fieldSx }}
            />
            <MultiSelectFilter
              label={columnLabels.category}
              values={categoryFilter}
              options={categoryOptions}
              onChange={setCategoryFilter}
              width={160}
              sx={fieldSx}
            />
            <MultiSelectFilter
              label="Stage"
              values={stageFilter}
              options={stageOptions}
              onChange={setStageFilter}
              width={160}
              sx={fieldSx}
            />
            {view === 'decided' && (
              <MultiSelectFilter
                label="Your decision"
                values={decisionFilter}
                options={decisionOptions}
                onChange={setDecisionFilter}
                width={160}
                sx={fieldSx}
              />
            )}
            <TextField
              select
              size="small"
              label="Group by"
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as ApprovalGroupBy)}
              sx={{ width: 160, ...fieldSx }}
            >
              {approvalGroupOptions
                .filter((option) => view === 'decided' || option !== 'decision')
                .map((option) => (
                  <MenuItem key={option} value={option}>
                    {groupLabels[option]}
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
              columns={pickerColumns}
              visible={visibleColumns.filter((id) => !hiddenInView(id))}
              onChange={(next) =>
                setVisibleColumns([...next, ...visibleColumns.filter((id) => hiddenInView(id))])
              }
              onReset={() => {
                setVisibleColumns([...defaultVisibleApprovalColumns]);
                columnOrder.reset();
              }}
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
                <Rows3 size={16} />
              </ToggleButton>
              <ToggleButton value="compact" aria-label="Compact rows">
                <Rows4 size={16} />
              </ToggleButton>
            </ToggleButtonGroup>
            {serializeApprovalSort(sortRules) !== serializeApprovalSort(defaultSort) && (
              <Button
                size="small"
                color="inherit"
                startIcon={<RotateCcw size={14} />}
                onClick={() => setSortRules(defaultSort)}
              >
                Reset sort
              </Button>
            )}
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
              label={`${viewRows.length.toLocaleString('en-IN')} ${viewRows.length === 1 ? 'request' : 'requests'}`}
              sx={{ fontWeight: 750, bgcolor: 'var(--g-accent-soft)', color: 'primary.dark' }}
            />
          </Stack>

          {isLoading ? (
            <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}>
              <CircularProgress aria-label="Loading approvals" />
            </Box>
          ) : (
            <DataGrid
              ariaLabel={
                kind === 'regularisations' ? 'Regularisation approvals' : 'Leave approvals'
              }
              rows={viewRows}
              columns={gridColumns}
              getRowId={(row) => row.id}
              sort={sortRules}
              onSort={(key, additive) => setSortRules(nextApprovalSort(sortRules, key, additive))}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={setPage}
              onRowsPerPageChange={(value) => {
                setRowsPerPage(value);
                setPage(0);
              }}
              density={density}
              emptyTitle={view === 'pending' ? 'Queue is clear' : 'No decisions yet'}
              emptyMessage={
                view === 'pending'
                  ? 'New requests inside your approval scope will appear here.'
                  : 'Requests you approve or reject will appear here.'
              }
              getRowGroup={groupBy === 'none' ? undefined : (row) => approvalGroupFor(row, groupBy)}
              collapsedGroups={collapsedGroups}
              onToggleGroup={(key) =>
                setCollapsedGroups((current) => {
                  const next = new Set(current);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              rowNoun={{ one: 'request', other: 'requests' }}
              onRowClick={selectRow}
              onColumnMove={(columnId, targetId, place) => {
                if (columnId === 'review' || targetId === 'review') return;
                columnOrder.move(columnId, targetId, place);
              }}
            />
          )}
        </>
      )}

      <ApprovalReviewDrawer
        selected={selected}
        comment={decisionComment}
        isUpdating={regularisations.isUpdating || leave.isUpdating}
        error={selected ? activeError?.message : undefined}
        onCommentChange={setDecisionComment}
        onClose={() => {
          setSelected(null);
          setDecisionComment('');
        }}
        onApprove={() => void decide('approved')}
        onReject={() => void decide('rejected')}
        readOnly={
          view === 'decided' || (selected !== null && !selected.item.status.startsWith('pending_'))
        }
      />
    </Stack>
  );
}

function CellText({ children }: { children: string | null | undefined }) {
  return children ? (
    <Typography noWrap sx={{ fontSize: 12.5 }}>
      {children}
    </Typography>
  ) : (
    <Typography sx={{ color: 'text.disabled', fontSize: 12.5 }}>—</Typography>
  );
}

function EmployeeCell({ name, code }: { name: string; code: string }) {
  return <PrimarySecondary primary={name} secondary={code} />;
}

function PrimarySecondary({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 750 }}>
        {primary}
      </Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>{secondary}</Typography>
    </Box>
  );
}

function ApprovalReviewDrawer({
  selected,
  comment,
  isUpdating,
  error,
  onCommentChange,
  onClose,
  onApprove,
  onReject,
  readOnly = false,
}: {
  readOnly?: boolean;
  selected: SelectedApproval | null;
  comment: string;
  isUpdating: boolean;
  error?: string;
  onCommentChange: (value: string) => void;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const title = selected
    ? selected.kind === 'regularisations'
      ? 'Regularisation approval'
      : 'Leave approval'
    : 'Approval review';
  const employee = selected?.item.employeeDisplayName;

  return (
    <Drawer
      anchor="right"
      open={Boolean(selected)}
      onClose={isUpdating ? undefined : onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 540 }, maxWidth: '100vw' } } }}
    >
      <Stack sx={{ height: '100%' }}>
        <Stack direction="row" sx={{ minHeight: 72, px: 2.5, alignItems: 'center', gap: 1.5 }}>
          <ShieldCheck size={19} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 850 }}>{title}</Typography>
            <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11 }}>
              {employee}
            </Typography>
          </Box>
          <Tooltip title="Close approval review">
            <IconButton aria-label="Close approval review" onClick={onClose} disabled={isUpdating}>
              <X size={19} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Divider />

        {selected && (
          <Stack spacing={2.5} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <ApprovalDetails selected={selected} />
            {!readOnly && <Divider />}
            {!readOnly && (
              <TextField
                multiline
                minRows={3}
                label="Decision comment"
                placeholder="Optional for approval; required for rejection."
                value={comment}
                onChange={(event) => onCommentChange(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 1_000 } }}
              />
            )}
          </Stack>
        )}

        {!readOnly && <Divider />}
        {!readOnly && (
          <Stack direction="row" spacing={1} sx={{ p: 2 }}>
            <Button
              fullWidth
              color="error"
              variant="outlined"
              disabled={!selected || comment.trim().length < 3 || isUpdating}
              startIcon={<X size={16} />}
              onClick={onReject}
            >
              Reject
            </Button>
            <Button
              fullWidth
              color="success"
              variant="contained"
              disabled={!selected || isUpdating}
              startIcon={isUpdating ? <CircularProgress size={15} /> : <Check size={16} />}
              onClick={onApprove}
            >
              Approve
            </Button>
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}

function ApprovalDetails({ selected }: { selected: SelectedApproval }) {
  if (selected.kind === 'regularisations') {
    const request = selected.item;
    return (
      <Stack spacing={2}>
        <DetailGrid
          values={[
            ['Employee code', request.employeeCode],
            ['Work date', request.workDate],
            [
              'Source',
              request.source === 'biometric'
                ? 'Biometric'
                : request.source === 'access_card'
                  ? 'Access card'
                  : 'Website timecard',
            ],
            ['Stage', regularisationStage(request)],
            ['Corrected start', formatIndiaTime(request.requestedStart)],
            ['Corrected end', formatIndiaTime(request.requestedEnd)],
            ['Duration', formatMinutes(request.requestedMinutes)],
            ['Missing event', request.missingEvent.replace('_', ' ')],
          ]}
        />
        <Detail label="Employee reason" value={request.reason} />
        {request.decisions.length > 0 && (
          <Box>
            <Typography sx={{ mb: 0.75, color: 'text.secondary', fontSize: 11.5 }}>
              Decisions
            </Typography>
            {request.decisions.map((decision) => (
              <Typography key={decision.decidedAt} sx={{ fontSize: 11.5 }}>
                Step {decision.step} approved by {decision.actorDisplayName}
                {decision.comment ? ` · ${decision.comment}` : ''}
              </Typography>
            ))}
          </Box>
        )}
      </Stack>
    );
  }
  const request = selected.item;
  return (
    <Stack spacing={2}>
      <DetailGrid
        values={[
          ['Employee code', request.employeeCode],
          ['Leave type', leaveTypeLabels[request.leaveType]],
          ['Start date', request.startDate],
          ['End date', request.endDate],
          ['Day part', request.dayPart.replaceAll('_', ' ')],
          ['Requested days', String(request.requestedDays)],
          ['Stage', leaveStage(request)],
          ['Approver 1', request.approver1DisplayName],
          ['Approver 2 pool', request.approver2DisplayName ?? 'Not required'],
        ]}
      />
      <Detail label="Private employee reason" value={request.reason} />
      {request.decisions.length > 0 && (
        <Box>
          <Typography sx={{ mb: 0.75, color: 'text.secondary', fontSize: 11.5 }}>
            Decisions
          </Typography>
          {request.decisions.map((decision) => (
            <Typography key={`${decision.step}-${decision.decidedAt}`} sx={{ fontSize: 11.5 }}>
              Step {decision.step} {decision.decision} by {decision.actorDisplayName}
              {decision.comment ? ` · ${decision.comment}` : ''}
            </Typography>
          ))}
        </Box>
      )}
    </Stack>
  );
}

function DetailGrid({ values }: { values: Array<[string, string]> }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 }}>
      {values.map(([label, value]) => (
        <Detail key={label} label={label} value={value} />
      ))}
    </Box>
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

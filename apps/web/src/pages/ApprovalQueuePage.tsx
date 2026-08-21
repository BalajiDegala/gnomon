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
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Check, ChevronRight, ShieldCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '../components/data-view/DataTable';
import { FilterBar } from '../components/data-view/FilterBar';
import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { useLeaveApprovals } from '../lib/leaves';
import { useRegularisationApprovals } from '../lib/regularisations';
import { formatIndiaTime } from '../lib/timecard';
import { formatMinutes } from '../lib/timesheets';
import { parseEnumValue, parseShortSearch, useUrlQueryState } from '../lib/url-query-state';
import { leaveTypeLabels } from './LeavePage';

type ApprovalTab = 'regularisations' | 'leave';
type ApprovalSortKey = 'employee' | 'date' | 'submitted' | 'days' | 'stage';
type SelectedApproval =
  | { kind: 'regularisations'; item: RegularisationRequestDto }
  | { kind: 'leave'; item: LeaveRequestDto };

const approvalTabs = ['regularisations', 'leave'] as const;
const approvalSortKeys = ['employee', 'date', 'submitted', 'days', 'stage'] as const;
const sortDirections = ['asc', 'desc'] as const;
const pageSizes = [10, 25, 50, 100] as const;

function parseApprovalTab(value: string): ApprovalTab | null {
  return parseEnumValue(value, approvalTabs);
}

function parseApprovalSort(value: string): ApprovalSortKey | null {
  return parseEnumValue(value, approvalSortKeys);
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

function regularisationStage(request: RegularisationRequestDto): string {
  return request.status === 'pending_manager' ? 'Manager review' : 'Final HR review';
}

function leaveStage(request: LeaveRequestDto): string {
  return request.status === 'pending_manager'
    ? `Approver 1 of ${request.approvalSteps}`
    : `Approver 2 of ${request.approvalSteps}`;
}

function matchesSearch(search: string, values: readonly string[]): boolean {
  const term = search.trim().toLowerCase();
  return !term || values.some((value) => value.toLowerCase().includes(term));
}

export function ApprovalQueuePage() {
  const regularisations = useRegularisationApprovals();
  const leave = useLeaveApprovals();
  const availableTabs = useMemo<ApprovalTab[]>(() => {
    const tabs: ApprovalTab[] = [];
    if (regularisations.canApprove) tabs.push('regularisations');
    if (leave.canApprove) tabs.push('leave');
    return tabs;
  }, [leave.canApprove, regularisations.canApprove]);
  const defaultTab = availableTabs[0] ?? 'regularisations';
  const [tab, setTab] = useUrlQueryState<ApprovalTab>('tab', defaultTab, parseApprovalTab);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [sortKey, setSortKey] = useUrlQueryState<ApprovalSortKey>(
    'sort',
    'submitted',
    parseApprovalSort,
  );
  const [sortDirection, setSortDirection] = useUrlQueryState<SortDirection>(
    'order',
    'asc',
    parseSortDirection,
  );
  const [pageNumber, setPageNumber] = useUrlQueryState('page', 1, parsePage);
  const [rowsPerPage, setRowsPerPage] = useUrlQueryState('size', 25, parsePageSize);
  const [selected, setSelected] = useState<SelectedApproval | null>(null);
  const [decisionComment, setDecisionComment] = useState('');

  useEffect(() => {
    if (availableTabs.length && !availableTabs.includes(tab)) setTab(defaultTab);
  }, [availableTabs, defaultTab, setTab, tab]);

  const tabs = useMemo<ReadonlyArray<PageTab<ApprovalTab>>>(
    () =>
      availableTabs.map((value) => ({
        value,
        label: value === 'regularisations' ? 'Regularisation' : 'Leave',
        count:
          value === 'regularisations' ? regularisations.requests.length : leave.requests.length,
      })),
    [availableTabs, leave.requests.length, regularisations.requests.length],
  );

  const activeError = tab === 'regularisations' ? regularisations.error : leave.error;
  const activeFilteredCount =
    tab === 'regularisations'
      ? regularisations.requests.filter((request) =>
          matchesSearch(search, [
            request.employeeDisplayName,
            request.employeeCode,
            request.reason,
            request.source,
          ]),
        ).length
      : leave.requests.filter((request) =>
          matchesSearch(search, [
            request.employeeDisplayName,
            request.employeeCode,
            request.reason,
            leaveTypeLabels[request.leaveType],
          ]),
        ).length;
  const totalCount = regularisations.requests.length + leave.requests.length;

  const updateSort = (key: ApprovalSortKey) => {
    if (key === sortKey) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPageNumber(1);
  };

  const selectApproval = (approval: SelectedApproval) => {
    setSelected(approval);
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

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        eyebrow="MANAGER WORKSPACE"
        title="Approvals"
        meta={`${totalCount} requests awaiting your decision`}
      />

      {activeError && !selected && <Alert severity="error">{activeError.message}</Alert>}
      {!availableTabs.length && (
        <Alert severity="info">Your account does not have an approval permission.</Alert>
      )}
      {regularisations.canApprove && (
        <Alert severity="info">
          Attendance corrections use two approvals: Step 1 reporting-manager review, followed by
          Step 2 final HR or Attendance Admin review. Access-card entry and exit corrections from
          the imported door data follow this workflow.
        </Alert>
      )}

      {availableTabs.length > 0 && (
        <>
          <Box>
            <PageTabs
              value={tab}
              tabs={tabs}
              onChange={(value) => {
                setTab(value);
                setSearch('');
                setSortKey('submitted');
                setSortDirection('asc');
                setPageNumber(1);
                setSelected(null);
              }}
              ariaLabel="Approval workflow"
            />
            <FilterBar
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPageNumber(1);
              }}
              searchLabel="Search approvals"
              resultCount={activeFilteredCount}
              resultLabel={activeFilteredCount === 1 ? 'request' : 'requests'}
              hasActiveFilters={Boolean(search)}
              onClear={() => {
                setSearch('');
                setPageNumber(1);
              }}
            />
          </Box>

          {tab === 'regularisations' ? (
            <RegularisationQueue
              requests={regularisations.requests}
              search={search}
              sortKey={sortKey}
              sortDirection={sortDirection}
              page={pageNumber - 1}
              rowsPerPage={rowsPerPage}
              isLoading={regularisations.isLoading}
              onSort={updateSort}
              onPageChange={(page) => setPageNumber(page + 1)}
              onRowsPerPageChange={(size) => {
                setRowsPerPage(size);
                setPageNumber(1);
              }}
              onSelect={(item) => selectApproval({ kind: 'regularisations', item })}
            />
          ) : (
            <LeaveQueue
              requests={leave.requests}
              search={search}
              sortKey={sortKey}
              sortDirection={sortDirection}
              page={pageNumber - 1}
              rowsPerPage={rowsPerPage}
              isLoading={leave.isLoading}
              onSort={updateSort}
              onPageChange={(page) => setPageNumber(page + 1)}
              onRowsPerPageChange={(size) => {
                setRowsPerPage(size);
                setPageNumber(1);
              }}
              onSelect={(item) => selectApproval({ kind: 'leave', item })}
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
      />
    </Stack>
  );
}

interface QueueProps {
  search: string;
  sortKey: ApprovalSortKey;
  sortDirection: SortDirection;
  page: number;
  rowsPerPage: number;
  isLoading: boolean;
  onSort: (key: ApprovalSortKey) => void;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (size: number) => void;
}

function RegularisationQueue({
  requests,
  search,
  sortKey,
  sortDirection,
  page,
  rowsPerPage,
  isLoading,
  onSort,
  onPageChange,
  onRowsPerPageChange,
  onSelect,
}: QueueProps & {
  requests: RegularisationRequestDto[];
  onSelect: (request: RegularisationRequestDto) => void;
}) {
  const rows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return requests
      .filter((request) =>
        matchesSearch(search, [
          request.employeeDisplayName,
          request.employeeCode,
          request.reason,
          request.source,
        ]),
      )
      .slice()
      .sort((left, right) => {
        const comparison =
          sortKey === 'employee'
            ? left.employeeDisplayName.localeCompare(right.employeeDisplayName)
            : sortKey === 'date'
              ? left.workDate.localeCompare(right.workDate)
              : sortKey === 'stage'
                ? left.status.localeCompare(right.status)
                : left.submittedAt.localeCompare(right.submittedAt);
        return comparison * direction || left.id.localeCompare(right.id);
      });
  }, [requests, search, sortDirection, sortKey]);
  const columns: ReadonlyArray<DataTableColumn<RegularisationRequestDto, ApprovalSortKey>> = [
    {
      id: 'employee',
      label: 'Employee',
      sortKey: 'employee',
      minWidth: 210,
      render: (request) => (
        <EmployeeCell name={request.employeeDisplayName} code={request.employeeCode} />
      ),
    },
    {
      id: 'date',
      label: 'Work date',
      sortKey: 'date',
      width: 120,
      render: (request) => request.workDate,
    },
    {
      id: 'source',
      label: 'Source',
      hideBelow: 'sm',
      width: 140,
      render: (request) =>
        request.source === 'biometric'
          ? 'Biometric'
          : request.source === 'access_card'
            ? 'Access card'
            : 'Website',
    },
    {
      id: 'correction',
      label: 'Corrected time',
      hideBelow: 'md',
      minWidth: 180,
      render: (request) =>
        `${formatIndiaTime(request.requestedStart)} – ${formatIndiaTime(request.requestedEnd)}`,
    },
    {
      id: 'reason',
      label: 'Reason',
      hideBelow: 'md',
      minWidth: 240,
      render: (request) => (
        <Typography noWrap sx={{ maxWidth: 320, fontSize: 12 }}>
          {request.reason}
        </Typography>
      ),
    },
    {
      id: 'stage',
      label: 'Stage',
      sortKey: 'stage',
      width: 145,
      render: (request) => (
        <Chip
          size="small"
          variant="outlined"
          color={request.status === 'pending_manager' ? 'warning' : 'info'}
          label={regularisationStage(request)}
        />
      ),
    },
    detailsColumn(onSelect),
  ];
  return (
    <DataTable
      ariaLabel="Regularisation approvals"
      rows={rows}
      columns={columns}
      getRowId={(request) => request.id}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={onSort}
      page={page}
      rowsPerPage={rowsPerPage}
      onPageChange={onPageChange}
      onRowsPerPageChange={onRowsPerPageChange}
      onRowClick={onSelect}
      isLoading={isLoading}
      emptyTitle="Queue is clear"
      emptyMessage="New regularisation requests inside your scope will appear here."
    />
  );
}

function LeaveQueue({
  requests,
  search,
  sortKey,
  sortDirection,
  page,
  rowsPerPage,
  isLoading,
  onSort,
  onPageChange,
  onRowsPerPageChange,
  onSelect,
}: QueueProps & {
  requests: LeaveRequestDto[];
  onSelect: (request: LeaveRequestDto) => void;
}) {
  const rows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;
    return requests
      .filter((request) =>
        matchesSearch(search, [
          request.employeeDisplayName,
          request.employeeCode,
          request.reason,
          leaveTypeLabels[request.leaveType],
        ]),
      )
      .slice()
      .sort((left, right) => {
        const comparison =
          sortKey === 'employee'
            ? left.employeeDisplayName.localeCompare(right.employeeDisplayName)
            : sortKey === 'date'
              ? left.startDate.localeCompare(right.startDate)
              : sortKey === 'days'
                ? left.requestedDays - right.requestedDays
                : left.submittedAt.localeCompare(right.submittedAt);
        return comparison * direction || left.id.localeCompare(right.id);
      });
  }, [requests, search, sortDirection, sortKey]);
  const columns: ReadonlyArray<DataTableColumn<LeaveRequestDto, ApprovalSortKey>> = [
    {
      id: 'employee',
      label: 'Employee',
      sortKey: 'employee',
      minWidth: 210,
      render: (request) => (
        <EmployeeCell name={request.employeeDisplayName} code={request.employeeCode} />
      ),
    },
    {
      id: 'dates',
      label: 'Dates',
      sortKey: 'date',
      minWidth: 175,
      render: (request) =>
        request.startDate === request.endDate
          ? request.startDate
          : `${request.startDate} – ${request.endDate}`,
    },
    {
      id: 'type',
      label: 'Type',
      hideBelow: 'sm',
      width: 130,
      render: (request) => leaveTypeLabels[request.leaveType],
    },
    {
      id: 'days',
      label: 'Days',
      sortKey: 'days',
      align: 'right',
      hideBelow: 'sm',
      width: 90,
      render: (request) => request.requestedDays,
    },
    {
      id: 'reason',
      label: 'Reason',
      hideBelow: 'md',
      minWidth: 260,
      render: (request) => (
        <Typography noWrap sx={{ maxWidth: 360, fontSize: 12 }}>
          {request.reason}
        </Typography>
      ),
    },
    {
      id: 'stage',
      label: 'Stage',
      sortKey: 'stage',
      width: 140,
      render: (request) => (
        <Chip
          size="small"
          variant="outlined"
          color={request.status === 'pending_manager' ? 'warning' : 'info'}
          label={leaveStage(request)}
        />
      ),
    },
    detailsColumn(onSelect),
  ];
  return (
    <DataTable
      ariaLabel="Leave approvals"
      rows={rows}
      columns={columns}
      getRowId={(request) => request.id}
      sortKey={sortKey}
      sortDirection={sortDirection}
      onSort={onSort}
      page={page}
      rowsPerPage={rowsPerPage}
      onPageChange={onPageChange}
      onRowsPerPageChange={onRowsPerPageChange}
      onRowClick={onSelect}
      isLoading={isLoading}
      emptyTitle="No leave decisions waiting"
      emptyMessage="New leave requests inside your reporting scope will appear here."
    />
  );
}

function detailsColumn<Row>(onSelect: (row: Row) => void): DataTableColumn<Row, ApprovalSortKey> {
  return {
    id: 'details',
    label: 'Review',
    align: 'right',
    width: 72,
    render: (row) => (
      <Tooltip title="Review request">
        <IconButton
          size="small"
          aria-label="Review request"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(row);
          }}
        >
          <ChevronRight size={17} />
        </IconButton>
      </Tooltip>
    ),
  };
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
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{secondary}</Typography>
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
}: {
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
            <Divider />
            <TextField
              multiline
              minRows={3}
              label="Decision comment"
              placeholder="Optional for approval; required for rejection."
              value={comment}
              onChange={(event) => onCommentChange(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1_000 } }}
            />
          </Stack>
        )}

        <Divider />
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
            <Typography sx={{ mb: 0.75, color: 'text.secondary', fontSize: 10.5 }}>
              Previous decisions
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
          <Typography sx={{ mb: 0.75, color: 'text.secondary', fontSize: 10.5 }}>
            Previous decisions
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
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{label}</Typography>
      <Typography sx={{ mt: 0.25, fontSize: 12.5, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}

import type { LeaveDayPart, LeaveRequestDto, LeaveStatus, LeaveType } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import { CalendarDays, ChevronRight, Plus, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '../components/data-view/DataTable';
import { FilterBar } from '../components/data-view/FilterBar';
import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { useAuth } from '../lib/auth';
import { readFormDraft, useSessionFormDraft } from '../lib/form-drafts';
import { useMyLeaves } from '../lib/leaves';
import { confirmDiscardChanges, useUnsavedChanges } from '../lib/unsaved-changes';
import { parseEnumValue, parseShortSearch, useUrlQueryState } from '../lib/url-query-state';

export const leaveTypeLabels: Record<LeaveType, string> = {
  casual: 'Casual leave',
  sick: 'Sick leave',
  earned: 'Earned leave',
  unpaid: 'Unpaid leave',
};

type LeaveTab = 'all' | LeaveStatus;
type LeaveSortKey = 'date' | 'type' | 'days' | 'status' | 'submitted';

const leaveTabs = ['all', 'pending_manager', 'approved', 'rejected', 'cancelled'] as const;
const leaveSortKeys = ['date', 'type', 'days', 'status', 'submitted'] as const;
const sortDirections = ['asc', 'desc'] as const;
const pageSizes = [10, 25, 50, 100] as const;

interface LeaveFormDraft {
  startDate: string;
  endDate: string;
  leaveType: LeaveType;
  dayPart: LeaveDayPart;
  reason: string;
}

function isLeaveFormDraft(value: unknown): value is LeaveFormDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<LeaveFormDraft>;
  return (
    typeof draft.startDate === 'string' &&
    typeof draft.endDate === 'string' &&
    ['casual', 'sick', 'earned', 'unpaid'].includes(draft.leaveType ?? '') &&
    ['full_day', 'first_half', 'second_half'].includes(draft.dayPart ?? '') &&
    typeof draft.reason === 'string'
  );
}

function nextWorkingDate(): string {
  const indiaDate = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
  const date = new Date(`${indiaDate}T00:00:00.000Z`);
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
  return date.toISOString().slice(0, 10);
}

function workingDayCount(
  startDate: string,
  endDate: string,
  dayPart: LeaveDayPart,
  holidayDates: ReadonlySet<string>,
): number {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  let count = 0;
  for (let date = start; date <= end; date = new Date(date.getTime() + 86_400_000)) {
    if (
      date.getUTCDay() !== 0 &&
      date.getUTCDay() !== 6 &&
      !holidayDates.has(date.toISOString().slice(0, 10))
    ) {
      count += 1;
    }
  }
  return dayPart === 'full_day' ? count : count ? 0.5 : 0;
}

function statusLabel(status: LeaveStatus): string {
  const labels: Record<LeaveStatus, string> = {
    pending_manager: 'Manager review',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return labels[status];
}

function statusColor(status: LeaveStatus): 'warning' | 'success' | 'error' | 'default' {
  if (status === 'pending_manager') return 'warning';
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  return 'default';
}

function dayPartLabel(dayPart: LeaveDayPart): string {
  if (dayPart === 'first_half') return 'First half';
  if (dayPart === 'second_half') return 'Second half';
  return 'Full day';
}

function parseLeaveTab(value: string): LeaveTab | null {
  return parseEnumValue(value, leaveTabs);
}

function parseLeaveSort(value: string): LeaveSortKey | null {
  return parseEnumValue(value, leaveSortKeys);
}

function parseSortDirection(value: string): SortDirection | null {
  return parseEnumValue(value, sortDirections);
}

function parsePage(value: string): number | null {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

function parsePageSize(value: string): number | null {
  const size = Number(value);
  return pageSizes.includes(size as (typeof pageSizes)[number]) ? size : null;
}

function parseYear(value: string): number | null {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2200 ? year : null;
}

function parseRequestId(value: string): string | null {
  return /^[a-f\d]{24}$/i.test(value) ? value : null;
}

function compareRequests(left: LeaveRequestDto, right: LeaveRequestDto, key: LeaveSortKey): number {
  if (key === 'date') return left.startDate.localeCompare(right.startDate);
  if (key === 'type')
    return leaveTypeLabels[left.leaveType].localeCompare(leaveTypeLabels[right.leaveType]);
  if (key === 'days') return left.requestedDays - right.requestedDays;
  if (key === 'status') return left.status.localeCompare(right.status);
  return left.submittedAt.localeCompare(right.submittedAt);
}

export function LeavePage() {
  const { user } = useAuth();
  const defaultDate = useMemo(nextWorkingDate, []);
  const draftKey = `${user?.employeeId ?? 'anonymous'}:leave-request`;
  const recoveredDraft = useMemo(() => readFormDraft(draftKey, isLeaveFormDraft), [draftKey]);
  const currentYear = Number(defaultDate.slice(0, 4));
  const [year, setYear] = useUrlQueryState('year', currentYear, parseYear);
  const [tab, setTab] = useUrlQueryState<LeaveTab>('tab', 'all', parseLeaveTab);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [sortKey, setSortKey] = useUrlQueryState<LeaveSortKey>('sort', 'date', parseLeaveSort);
  const [sortDirection, setSortDirection] = useUrlQueryState<SortDirection>(
    'order',
    'desc',
    parseSortDirection,
  );
  const [pageNumber, setPageNumber] = useUrlQueryState('page', 1, parsePage);
  const [rowsPerPage, setRowsPerPage] = useUrlQueryState('size', 25, parsePageSize);
  const [selectedRequestId, setSelectedRequestId] = useUrlQueryState('request', '', parseRequestId);
  const leaves = useMyLeaves(year);
  const [createOpen, setCreateOpen] = useState(Boolean(recoveredDraft));
  const [startDate, setStartDate] = useState(recoveredDraft?.startDate ?? defaultDate);
  const [endDate, setEndDate] = useState(recoveredDraft?.endDate ?? defaultDate);
  const [leaveType, setLeaveType] = useState<LeaveType>(recoveredDraft?.leaveType ?? 'casual');
  const [dayPart, setDayPart] = useState<LeaveDayPart>(recoveredDraft?.dayPart ?? 'full_day');
  const [reason, setReason] = useState(recoveredDraft?.reason ?? '');
  const holidayDates = useMemo(
    () => new Set(leaves.holidays.map((holiday) => holiday.date)),
    [leaves.holidays],
  );
  const requestedDays = workingDayCount(startDate, endDate, dayPart, holidayDates);
  const selectedBalance = leaves.balances.find((balance) => balance.leaveType === leaveType);
  const selectedRequest =
    leaves.requests.find((request) => request.id === selectedRequestId) ?? null;
  const formDirty =
    createOpen &&
    (startDate !== defaultDate ||
      endDate !== defaultDate ||
      leaveType !== 'casual' ||
      dayPart !== 'full_day' ||
      Boolean(reason));
  const draft = useMemo(
    () => ({ startDate, endDate, leaveType, dayPart, reason }),
    [dayPart, endDate, leaveType, reason, startDate],
  );
  const clearDraft = useSessionFormDraft(draftKey, draft, formDirty);
  useUnsavedChanges(formDirty);

  const closeCreate = () => {
    if (formDirty && !confirmDiscardChanges()) return;
    clearDraft();
    setStartDate(defaultDate);
    setEndDate(defaultDate);
    setLeaveType('casual');
    setDayPart('full_day');
    setReason('');
    setCreateOpen(false);
  };

  useEffect(() => {
    if (endDate < startDate || endDate.slice(0, 4) !== startDate.slice(0, 4)) {
      setEndDate(startDate);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    if (startDate !== endDate && dayPart !== 'full_day') setDayPart('full_day');
  }, [dayPart, endDate, startDate]);

  useEffect(() => {
    if (selectedRequestId && !selectedRequest && !leaves.isLoading) setSelectedRequestId('');
  }, [leaves.isLoading, selectedRequest, selectedRequestId, setSelectedRequestId]);

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();
    const direction = sortDirection === 'asc' ? 1 : -1;
    return leaves.requests
      .filter((request) => tab === 'all' || request.status === tab)
      .filter(
        (request) =>
          !term ||
          request.reason.toLowerCase().includes(term) ||
          request.startDate.includes(term) ||
          request.endDate.includes(term) ||
          leaveTypeLabels[request.leaveType].toLowerCase().includes(term) ||
          statusLabel(request.status).toLowerCase().includes(term),
      )
      .slice()
      .sort(
        (left, right) =>
          compareRequests(left, right, sortKey) * direction || left.id.localeCompare(right.id),
      );
  }, [leaves.requests, search, sortDirection, sortKey, tab]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredRequests.length / rowsPerPage));
    if (pageNumber > lastPage) setPageNumber(lastPage);
  }, [filteredRequests.length, pageNumber, rowsPerPage, setPageNumber]);

  const tabs = useMemo<ReadonlyArray<PageTab<LeaveTab>>>(
    () => [
      { value: 'all', label: 'All', count: leaves.requests.length },
      {
        value: 'pending_manager',
        label: 'Manager review',
        count: leaves.requests.filter((request) => request.status === 'pending_manager').length,
      },
      {
        value: 'approved',
        label: 'Approved',
        count: leaves.requests.filter((request) => request.status === 'approved').length,
      },
      {
        value: 'rejected',
        label: 'Rejected',
        count: leaves.requests.filter((request) => request.status === 'rejected').length,
      },
      {
        value: 'cancelled',
        label: 'Cancelled',
        count: leaves.requests.filter((request) => request.status === 'cancelled').length,
      },
    ],
    [leaves.requests],
  );

  const updateSort = (key: LeaveSortKey) => {
    if (sortKey === key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPageNumber(1);
  };

  const clearFilters = () => {
    setSearch('');
    setTab('all');
    setYear(currentYear);
    setPageNumber(1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await leaves.create({ leaveType, startDate, endDate, dayPart, reason });
      const requestYear = Number(startDate.slice(0, 4));
      clearDraft();
      setReason('');
      setCreateOpen(false);
      setYear(requestYear);
      setTab('all');
      setSelectedRequestId(result.request.id);
    } catch {
      // Mutation errors are rendered above the form.
    }
  };

  const cancel = async (requestId: string) => {
    try {
      await leaves.cancel(requestId);
    } catch {
      // Mutation errors are rendered on the page and in the drawer.
    }
  };

  const columns: ReadonlyArray<DataTableColumn<LeaveRequestDto, LeaveSortKey>> = [
    {
      id: 'date',
      label: 'Dates',
      sortKey: 'date',
      minWidth: 170,
      render: (request) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 800 }}>
            {request.startDate === request.endDate
              ? request.startDate
              : `${request.startDate} - ${request.endDate}`}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
            {leaveTypeLabels[request.leaveType]} - {dayPartLabel(request.dayPart)}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'type',
      label: 'Leave type',
      sortKey: 'type',
      hideBelow: 'sm',
      width: 150,
      render: (request) => leaveTypeLabels[request.leaveType],
    },
    {
      id: 'days',
      label: 'Days',
      sortKey: 'days',
      align: 'right',
      hideBelow: 'sm',
      width: 80,
      render: (request) => request.requestedDays,
    },
    {
      id: 'reason',
      label: 'Private reason',
      hideBelow: 'md',
      minWidth: 260,
      render: (request) => (
        <Typography noWrap sx={{ maxWidth: 380, fontSize: 12 }}>
          {request.reason}
        </Typography>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      sortKey: 'status',
      width: 145,
      render: (request) => (
        <Chip
          size="small"
          variant="outlined"
          color={statusColor(request.status)}
          label={statusLabel(request.status)}
        />
      ),
    },
    {
      id: 'actions',
      label: 'Actions',
      align: 'right',
      hideBelow: 'sm',
      width: 88,
      render: (request) => (
        <Stack direction="row" sx={{ justifyContent: 'flex-end', gap: 0.25 }}>
          {request.status === 'pending_manager' && (
            <Tooltip title="Cancel request">
              <IconButton
                size="small"
                color="error"
                aria-label={`Cancel ${request.startDate} leave`}
                disabled={leaves.isUpdating}
                onClick={(event) => {
                  event.stopPropagation();
                  void cancel(request.id);
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="View request">
            <IconButton
              size="small"
              aria-label={`View ${request.startDate} leave`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedRequestId(request.id);
              }}
            >
              <ChevronRight size={16} />
            </IconButton>
          </Tooltip>
        </Stack>
      ),
    },
  ];

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        eyebrow="TIME AWAY"
        title="Leave"
        meta={`${leaves.requests.length} requests in ${year}`}
        action={
          <Button
            variant="contained"
            startIcon={<Plus size={17} />}
            disabled={!leaves.canCreate}
            onClick={() => setCreateOpen(true)}
          >
            New request
          </Button>
        }
      />

      {!leaves.canCreate && (
        <Alert severity="warning">Your account cannot create leave requests.</Alert>
      )}
      {leaves.error && !createOpen && <Alert severity="error">{leaves.error.message}</Alert>}

      <BalanceSummary balances={leaves.balances} />

      <Box>
        <PageTabs
          value={tab}
          tabs={tabs}
          onChange={(value) => {
            setTab(value);
            setPageNumber(1);
          }}
          ariaLabel="Leave request status"
        />
        <FilterBar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPageNumber(1);
          }}
          searchLabel="Search leave requests"
          resultCount={filteredRequests.length}
          resultLabel={filteredRequests.length === 1 ? 'request' : 'requests'}
          hasActiveFilters={Boolean(search) || tab !== 'all' || year !== currentYear}
          onClear={clearFilters}
        >
          <TextField
            size="small"
            type="number"
            label="Year"
            value={year}
            onChange={(event) => {
              const nextYear = Number(event.target.value);
              if (nextYear >= 2000 && nextYear <= 2200) setYear(nextYear);
              setPageNumber(1);
            }}
            slotProps={{ htmlInput: { min: 2000, max: 2200 } }}
            sx={{ width: { xs: '100%', md: 120 } }}
          />
        </FilterBar>
      </Box>

      <DataTable
        ariaLabel="Leave requests"
        rows={filteredRequests}
        columns={columns}
        getRowId={(request) => request.id}
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
        onRowClick={(request) => setSelectedRequestId(request.id)}
        isLoading={leaves.isLoading}
        emptyTitle={leaves.requests.length ? 'No requests match this view' : 'No leave requests'}
        emptyMessage={
          leaves.requests.length
            ? 'Change or clear the status, year, or search filters.'
            : 'New requests and manager decisions will appear here.'
        }
      />

      <CreateLeaveDialog
        open={createOpen}
        leaveType={leaveType}
        startDate={startDate}
        endDate={endDate}
        dayPart={dayPart}
        reason={reason}
        requestedDays={requestedDays}
        selectedBalance={selectedBalance}
        hasHoliday={leaves.holidays.some(
          (holiday) => holiday.date >= startDate && holiday.date <= endDate,
        )}
        isUpdating={leaves.isUpdating}
        error={createOpen ? leaves.error?.message : undefined}
        onLeaveTypeChange={setLeaveType}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onDayPartChange={setDayPart}
        onReasonChange={setReason}
        onClose={closeCreate}
        onSubmit={submit}
      />

      <LeaveDetailsDrawer
        request={selectedRequest}
        isUpdating={leaves.isUpdating}
        error={selectedRequest ? leaves.error?.message : undefined}
        onCancel={(requestId) => void cancel(requestId)}
        onClose={() => setSelectedRequestId('')}
      />
    </Stack>
  );
}

function BalanceSummary({ balances }: { balances: ReturnType<typeof useMyLeaves>['balances'] }) {
  return (
    <Box
      aria-label="Leave balances"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, 1fr)' },
        gap: 1.5,
      }}
    >
      {balances.map((balance) => (
        <Box
          key={balance.leaveType}
          sx={{
            position: 'relative',
            minWidth: 0,
            p: { xs: 1.5, sm: 1.8 },
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '18px',
            bgcolor: '#fff',
            boxShadow: '0 10px 26px rgba(20,32,51,.045)',
            '&::after': {
              content: '""',
              position: 'absolute',
              width: 54,
              height: 54,
              right: -25,
              top: -24,
              borderRadius: '50%',
              bgcolor: 'rgba(18,148,161,.07)',
            },
          }}
        >
          <Typography noWrap sx={{ color: 'primary.dark', fontSize: 10.5, fontWeight: 750 }}>
            {leaveTypeLabels[balance.leaveType]}
          </Typography>
          <Typography sx={{ mt: 0.45, fontSize: { xs: 14, sm: 16 }, fontWeight: 850 }}>
            {balance.balanceTracked
              ? balance.availableDays === null
                ? 'Not set'
                : `${balance.availableDays} available`
              : 'As approved'}
          </Typography>
          <Typography sx={{ mt: 0.2, color: 'text.secondary', fontSize: 9.5 }}>
            {balance.pendingDays} pending - {balance.approvedDays} approved
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

interface CreateLeaveDialogProps {
  open: boolean;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  dayPart: LeaveDayPart;
  reason: string;
  requestedDays: number;
  selectedBalance: ReturnType<typeof useMyLeaves>['balances'][number] | undefined;
  hasHoliday: boolean;
  isUpdating: boolean;
  error?: string;
  onLeaveTypeChange: (value: LeaveType) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onDayPartChange: (value: LeaveDayPart) => void;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

function CreateLeaveDialog({
  open,
  leaveType,
  startDate,
  endDate,
  dayPart,
  reason,
  requestedDays,
  selectedBalance,
  hasHoliday,
  isUpdating,
  error,
  onLeaveTypeChange,
  onStartDateChange,
  onEndDateChange,
  onDayPartChange,
  onReasonChange,
  onClose,
  onSubmit,
}: CreateLeaveDialogProps) {
  return (
    <Dialog open={open} onClose={isUpdating ? undefined : onClose} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={onSubmit}>
        <DialogTitle>New leave request</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <FormControl fullWidth>
              <InputLabel id="leave-type-label">Leave type</InputLabel>
              <Select
                labelId="leave-type-label"
                label="Leave type"
                value={leaveType}
                onChange={(event) => onLeaveTypeChange(event.target.value as LeaveType)}
              >
                {Object.entries(leaveTypeLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
            >
              <TextField
                type="date"
                label="Start date"
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
              />
              <TextField
                type="date"
                label="End date"
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: startDate } }}
                required
              />
            </Box>
            <FormControl fullWidth>
              <InputLabel id="leave-day-part-label">Day portion</InputLabel>
              <Select
                labelId="leave-day-part-label"
                label="Day portion"
                value={dayPart}
                onChange={(event) => onDayPartChange(event.target.value as LeaveDayPart)}
              >
                <MenuItem value="full_day">Full day</MenuItem>
                {startDate === endDate && <MenuItem value="first_half">First half</MenuItem>}
                {startDate === endDate && <MenuItem value="second_half">Second half</MenuItem>}
              </Select>
            </FormControl>
            <TextField
              multiline
              minRows={4}
              label="Private reason"
              placeholder="Briefly explain the leave request."
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1_000 } }}
              helperText={`${reason.trim().length}/1000 - minimum 5 characters`}
              required
            />
            <Box sx={{ p: 1.5, bgcolor: '#f4f8f9', borderRadius: 1.5 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                  Working-day duration
                </Typography>
                <Typography sx={{ fontSize: 12.5, fontWeight: 850 }}>
                  {requestedDays} day{requestedDays === 1 ? '' : 's'}
                </Typography>
              </Stack>
              <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 10.5 }}>
                {selectedBalance?.availableDays === null
                  ? 'Entitlement is not configured yet; approval remains available.'
                  : selectedBalance?.availableDays !== undefined
                    ? `${selectedBalance.availableDays} configured days remain after pending and approved leave.`
                    : 'Loading balance policy...'}
              </Typography>
              {hasHoliday && (
                <Typography sx={{ mt: 0.45, color: 'primary.dark', fontSize: 10.5 }}>
                  Company holidays inside this range are excluded automatically.
                </Typography>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button color="inherit" onClick={onClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={requestedDays <= 0 || reason.trim().length < 5 || isUpdating}
            startIcon={isUpdating ? <CircularProgress size={16} /> : <Send size={17} />}
          >
            Submit for manager review
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function LeaveDetailsDrawer({
  request,
  isUpdating,
  error,
  onCancel,
  onClose,
}: {
  request: LeaveRequestDto | null;
  isUpdating: boolean;
  error?: string;
  onCancel: (requestId: string) => void;
  onClose: () => void;
}) {
  return (
    <Drawer
      anchor="right"
      open={Boolean(request)}
      onClose={isUpdating ? undefined : onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 500 }, maxWidth: '100vw' } } }}
    >
      <Stack sx={{ height: '100%' }}>
        <Stack direction="row" sx={{ minHeight: 72, px: 2.5, alignItems: 'center', gap: 1.25 }}>
          <CalendarDays size={19} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 850 }}>Leave request</Typography>
            <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11 }}>
              {request ? leaveTypeLabels[request.leaveType] : ''}
            </Typography>
          </Box>
          <Tooltip title="Close leave details">
            <IconButton aria-label="Close leave details" onClick={onClose} disabled={isUpdating}>
              <X size={19} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Divider />
        {request && (
          <Stack spacing={2.5} sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <DetailGrid
              values={[
                [
                  'Dates',
                  request.startDate === request.endDate
                    ? request.startDate
                    : `${request.startDate} - ${request.endDate}`,
                ],
                ['Day portion', dayPartLabel(request.dayPart)],
                ['Requested days', String(request.requestedDays)],
                ['Status', statusLabel(request.status)],
                ['Submitted', new Date(request.submittedAt).toLocaleString('en-IN')],
                ['Policy', request.approvalPolicyVersion],
              ]}
            />
            <Detail label="Private reason" value={request.reason} />
            {request.decision && (
              <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
                  {request.decision.decision === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                  {request.decision.actorDisplayName}
                </Typography>
                <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 11.5 }}>
                  {request.decision.comment || 'No decision comment.'}
                </Typography>
              </Box>
            )}
          </Stack>
        )}
        {request?.status === 'pending_manager' && (
          <>
            <Divider />
            <Box sx={{ p: 2 }}>
              <Button
                fullWidth
                color="error"
                variant="outlined"
                startIcon={<Trash2 size={16} />}
                disabled={isUpdating}
                onClick={() => onCancel(request.id)}
              >
                Cancel request
              </Button>
            </Box>
          </>
        )}
      </Stack>
    </Drawer>
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
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{label}</Typography>
      <Typography sx={{ mt: 0.25, fontSize: 12.5, fontWeight: 700, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  );
}

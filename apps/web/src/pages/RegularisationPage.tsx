import type {
  MissingEvent,
  RegularisationRequestDto,
  RegularisationSource,
  RegularisationStatus,
} from '@gnomon/shared';
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
import { CalendarClock, ChevronRight, Plus, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

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
import { useMyRegularisations } from '../lib/regularisations';
import { formatIndiaTime } from '../lib/timecard';
import { currentIndiaWorkDate, formatMinutes, indiaLocalInputToIso } from '../lib/timesheets';
import {
  parseEnumValue,
  parseIsoDate,
  parseShortSearch,
  useUrlQueryState,
} from '../lib/url-query-state';
import { confirmDiscardChanges, useUnsavedChanges } from '../lib/unsaved-changes';

type RegularisationTab = 'all' | RegularisationStatus;
type SourceFilter = 'all' | RegularisationSource;
type RegularisationSortKey = 'date' | 'source' | 'duration' | 'status' | 'submitted';

const regularisationTabs = [
  'all',
  'pending_manager',
  'pending_hr',
  'approved',
  'rejected',
  'cancelled',
] as const;
const sourceFilters = ['all', 'biometric', 'access_card', 'website'] as const;
const sortKeys = ['date', 'source', 'duration', 'status', 'submitted'] as const;
const sortDirections = ['asc', 'desc'] as const;
const pageSizes = [10, 25, 50, 100] as const;

interface RegularisationFormDraft {
  workDate: string;
  source: RegularisationSource;
  missingEvent: MissingEvent;
  requestedStart: string;
  requestedEnd: string;
  reason: string;
}

function isRegularisationFormDraft(value: unknown): value is RegularisationFormDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<RegularisationFormDraft>;
  return (
    typeof draft.workDate === 'string' &&
    ['biometric', 'access_card', 'website'].includes(draft.source ?? '') &&
    ['opening', 'closing', 'both'].includes(draft.missingEvent ?? '') &&
    typeof draft.requestedStart === 'string' &&
    typeof draft.requestedEnd === 'string' &&
    typeof draft.reason === 'string'
  );
}

function previousWorkingDate(): string {
  const current = new Date(`${currentIndiaWorkDate()}T00:00:00.000Z`);
  do current.setUTCDate(current.getUTCDate() - 1);
  while (current.getUTCDay() === 0 || current.getUTCDay() === 6);
  return current.toISOString().slice(0, 10);
}

function statusColor(
  status: RegularisationStatus,
): 'warning' | 'info' | 'success' | 'error' | 'default' {
  if (status === 'pending_manager') return 'warning';
  if (status === 'pending_hr') return 'info';
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  return 'default';
}

function statusLabel(status: RegularisationStatus): string {
  const labels: Record<RegularisationStatus, string> = {
    pending_manager: 'Manager review',
    pending_hr: 'HR / Attendance review',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return labels[status];
}

function sourceLabel(source: RegularisationSource): string {
  if (source === 'biometric') return 'Biometric';
  if (source === 'access_card') return 'Access card';
  return 'Website timecard';
}

function eventLabel(source: RegularisationSource, missingEvent: MissingEvent): string {
  const opening = source === 'biometric' ? 'in' : source === 'access_card' ? 'entry' : 'start';
  const closing = source === 'biometric' ? 'out' : source === 'access_card' ? 'exit' : 'stop';
  return missingEvent === 'both'
    ? `Missing ${opening} and ${closing}`
    : `Missing ${missingEvent === 'opening' ? opening : closing}`;
}

function parseTab(value: string): RegularisationTab | null {
  return parseEnumValue(value, regularisationTabs);
}

function parseSourceFilter(value: string): SourceFilter | null {
  return parseEnumValue(value, sourceFilters);
}

function parseSortKey(value: string): RegularisationSortKey | null {
  return parseEnumValue(value, sortKeys);
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

function parseRequestId(value: string): string | null {
  return /^[a-f\d]{24}$/i.test(value) ? value : null;
}

function compareRequests(
  left: RegularisationRequestDto,
  right: RegularisationRequestDto,
  key: RegularisationSortKey,
): number {
  if (key === 'date') return left.workDate.localeCompare(right.workDate);
  if (key === 'source') return left.source.localeCompare(right.source);
  if (key === 'duration') return left.requestedMinutes - right.requestedMinutes;
  if (key === 'status') return left.status.localeCompare(right.status);
  return left.submittedAt.localeCompare(right.submittedAt);
}

export function RegularisationPage() {
  const { user } = useAuth();
  const regularisations = useMyRegularisations();
  const defaultWorkDate = useMemo(previousWorkingDate, []);
  const draftKey = `${user?.employeeId ?? 'anonymous'}:regularisation-request`;
  const recoveredDraft = useMemo(
    () => readFormDraft(draftKey, isRegularisationFormDraft),
    [draftKey],
  );
  const [workDate, setWorkDate] = useUrlQueryState(
    'date',
    recoveredDraft?.workDate ?? defaultWorkDate,
    parseIsoDate,
  );
  const [tab, setTab] = useUrlQueryState<RegularisationTab>('tab', 'all', parseTab);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [sourceFilter, setSourceFilter] = useUrlQueryState<SourceFilter>(
    'source',
    'all',
    parseSourceFilter,
  );
  const [sortKey, setSortKey] = useUrlQueryState<RegularisationSortKey>(
    'sort',
    'date',
    parseSortKey,
  );
  const [sortDirection, setSortDirection] = useUrlQueryState<SortDirection>(
    'order',
    'desc',
    parseSortDirection,
  );
  const [pageNumber, setPageNumber] = useUrlQueryState('page', 1, parsePage);
  const [rowsPerPage, setRowsPerPage] = useUrlQueryState('size', 25, parsePageSize);
  const [selectedRequestId, setSelectedRequestId] = useUrlQueryState('request', '', parseRequestId);
  const [createOpen, setCreateOpen] = useState(Boolean(recoveredDraft));
  const [source, setSource] = useState<RegularisationSource>(recoveredDraft?.source ?? 'biometric');
  const [missingEvent, setMissingEvent] = useState<MissingEvent>(
    recoveredDraft?.missingEvent ?? 'closing',
  );
  const [requestedStart, setRequestedStart] = useState(
    recoveredDraft?.requestedStart ?? `${workDate}T09:00`,
  );
  const [requestedEnd, setRequestedEnd] = useState(
    recoveredDraft?.requestedEnd ?? `${workDate}T18:00`,
  );
  const [reason, setReason] = useState(recoveredDraft?.reason ?? '');
  const recoveredOnMount = useRef(Boolean(recoveredDraft && recoveredDraft.workDate === workDate));
  const selectedRequest =
    regularisations.requests.find((request) => request.id === selectedRequestId) ?? null;
  const formDirty =
    createOpen &&
    (workDate !== defaultWorkDate ||
      source !== 'biometric' ||
      missingEvent !== 'closing' ||
      requestedStart !== `${workDate}T09:00` ||
      requestedEnd !== `${workDate}T18:00` ||
      Boolean(reason));
  const draft = useMemo(
    () => ({ workDate, source, missingEvent, requestedStart, requestedEnd, reason }),
    [missingEvent, reason, requestedEnd, requestedStart, source, workDate],
  );
  const clearDraft = useSessionFormDraft(draftKey, draft, formDirty);
  useUnsavedChanges(formDirty);

  const closeCreate = () => {
    if (formDirty && !confirmDiscardChanges()) return;
    clearDraft();
    setSource('biometric');
    setMissingEvent('closing');
    setReason('');
    setWorkDate(defaultWorkDate);
    setRequestedStart(`${defaultWorkDate}T09:00`);
    setRequestedEnd(`${defaultWorkDate}T18:00`);
    setCreateOpen(false);
  };

  useEffect(() => {
    if (recoveredOnMount.current) {
      recoveredOnMount.current = false;
      return;
    }
    setRequestedStart(`${workDate}T09:00`);
    setRequestedEnd(`${workDate}T18:00`);
  }, [workDate]);

  useEffect(() => {
    if (selectedRequestId && !selectedRequest && !regularisations.isLoading) {
      setSelectedRequestId('');
    }
  }, [regularisations.isLoading, selectedRequest, selectedRequestId, setSelectedRequestId]);

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();
    const direction = sortDirection === 'asc' ? 1 : -1;
    return regularisations.requests
      .filter((request) => tab === 'all' || request.status === tab)
      .filter((request) => sourceFilter === 'all' || request.source === sourceFilter)
      .filter(
        (request) =>
          !term ||
          request.reason.toLowerCase().includes(term) ||
          request.workDate.includes(term) ||
          sourceLabel(request.source).toLowerCase().includes(term) ||
          eventLabel(request.source, request.missingEvent).toLowerCase().includes(term) ||
          statusLabel(request.status).toLowerCase().includes(term),
      )
      .slice()
      .sort(
        (left, right) =>
          compareRequests(left, right, sortKey) * direction || left.id.localeCompare(right.id),
      );
  }, [regularisations.requests, search, sortDirection, sortKey, sourceFilter, tab]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredRequests.length / rowsPerPage));
    if (pageNumber > lastPage) setPageNumber(lastPage);
  }, [filteredRequests.length, pageNumber, rowsPerPage, setPageNumber]);

  const tabs = useMemo<ReadonlyArray<PageTab<RegularisationTab>>>(
    () => [
      { value: 'all', label: 'All', count: regularisations.requests.length },
      {
        value: 'pending_manager',
        label: 'Manager review',
        count: regularisations.requests.filter((request) => request.status === 'pending_manager')
          .length,
      },
      {
        value: 'pending_hr',
        label: 'Final review',
        count: regularisations.requests.filter((request) => request.status === 'pending_hr').length,
      },
      {
        value: 'approved',
        label: 'Approved',
        count: regularisations.requests.filter((request) => request.status === 'approved').length,
      },
      {
        value: 'rejected',
        label: 'Rejected',
        count: regularisations.requests.filter((request) => request.status === 'rejected').length,
      },
      {
        value: 'cancelled',
        label: 'Cancelled',
        count: regularisations.requests.filter((request) => request.status === 'cancelled').length,
      },
    ],
    [regularisations.requests],
  );

  const updateSort = (key: RegularisationSortKey) => {
    if (sortKey === key) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPageNumber(1);
  };

  const clearFilters = () => {
    setSearch('');
    setSourceFilter('all');
    setTab('all');
    setPageNumber(1);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await regularisations.create({
        workDate,
        source,
        missingEvent,
        requestedStart: indiaLocalInputToIso(requestedStart),
        requestedEnd: indiaLocalInputToIso(requestedEnd),
        reason,
      });
      clearDraft();
      setReason('');
      setCreateOpen(false);
      setTab('all');
      setSelectedRequestId(result.request.id);
    } catch {
      // Mutation errors are rendered above the form.
    }
  };

  const cancel = async (requestId: string) => {
    try {
      await regularisations.cancel(requestId);
    } catch {
      // Mutation errors are rendered on the page and in the drawer.
    }
  };

  const columns: ReadonlyArray<DataTableColumn<RegularisationRequestDto, RegularisationSortKey>> = [
    {
      id: 'date',
      label: 'Work date',
      sortKey: 'date',
      width: 115,
      render: (request) => request.workDate,
    },
    {
      id: 'source',
      label: 'Source',
      sortKey: 'source',
      minWidth: 180,
      render: (request) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 800 }}>
            {sourceLabel(request.source)}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
            {eventLabel(request.source, request.missingEvent)} - {statusLabel(request.status)}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'correction',
      label: 'Corrected time',
      hideBelow: 'sm',
      minWidth: 185,
      render: (request) =>
        `${formatIndiaTime(request.requestedStart)} - ${formatIndiaTime(request.requestedEnd)}`,
    },
    {
      id: 'duration',
      label: 'Duration',
      sortKey: 'duration',
      align: 'right',
      hideBelow: 'md',
      width: 105,
      render: (request) => formatMinutes(request.requestedMinutes),
    },
    {
      id: 'reason',
      label: 'Reason',
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
      hideBelow: 'sm',
      width: 165,
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
                aria-label={`Cancel ${request.workDate} regularisation`}
                disabled={regularisations.isUpdating}
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
              aria-label={`View ${request.workDate} regularisation`}
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
        eyebrow="ATTENDANCE CORRECTION"
        title="Regularisation"
        meta={`${regularisations.requests.length} correction requests`}
        action={
          <Button
            variant="contained"
            startIcon={<Plus size={17} />}
            disabled={!regularisations.canCreate}
            onClick={() => setCreateOpen(true)}
          >
            New correction
          </Button>
        }
      />

      {!regularisations.canCreate && (
        <Alert severity="warning">Your account cannot create regularisation requests.</Alert>
      )}
      {regularisations.error && !createOpen && !selectedRequest && (
        <Alert severity="error">{regularisations.error.message}</Alert>
      )}

      <Box>
        <PageTabs
          value={tab}
          tabs={tabs}
          onChange={(value) => {
            setTab(value);
            setPageNumber(1);
          }}
          ariaLabel="Regularisation request status"
        />
        <FilterBar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPageNumber(1);
          }}
          searchLabel="Search correction requests"
          resultCount={filteredRequests.length}
          resultLabel={filteredRequests.length === 1 ? 'request' : 'requests'}
          hasActiveFilters={Boolean(search) || sourceFilter !== 'all' || tab !== 'all'}
          onClear={clearFilters}
        >
          <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 190 } }}>
            <InputLabel id="regularisation-source-filter-label">Source</InputLabel>
            <Select
              labelId="regularisation-source-filter-label"
              label="Source"
              value={sourceFilter}
              onChange={(event) => {
                setSourceFilter(event.target.value as SourceFilter);
                setPageNumber(1);
              }}
            >
              <MenuItem value="all">All sources</MenuItem>
              <MenuItem value="biometric">Biometric</MenuItem>
              <MenuItem value="access_card">Access card</MenuItem>
              <MenuItem value="website">Website timecard</MenuItem>
            </Select>
          </FormControl>
        </FilterBar>
      </Box>

      <DataTable
        ariaLabel="Regularisation requests"
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
        isLoading={regularisations.isLoading}
        emptyTitle={
          regularisations.requests.length ? 'No requests match this view' : 'No correction requests'
        }
        emptyMessage={
          regularisations.requests.length
            ? 'Change or clear the status, source, or search filters.'
            : 'New requests and two-step decisions will appear here.'
        }
      />

      <CreateRegularisationDialog
        open={createOpen}
        workDate={workDate}
        source={source}
        missingEvent={missingEvent}
        requestedStart={requestedStart}
        requestedEnd={requestedEnd}
        reason={reason}
        isUpdating={regularisations.isUpdating}
        error={createOpen ? regularisations.error?.message : undefined}
        onWorkDateChange={setWorkDate}
        onSourceChange={setSource}
        onMissingEventChange={setMissingEvent}
        onRequestedStartChange={setRequestedStart}
        onRequestedEndChange={setRequestedEnd}
        onReasonChange={setReason}
        onClose={closeCreate}
        onSubmit={submit}
      />

      <RegularisationDetailsDrawer
        request={selectedRequest}
        isUpdating={regularisations.isUpdating}
        error={selectedRequest ? regularisations.error?.message : undefined}
        onCancel={(requestId) => void cancel(requestId)}
        onClose={() => setSelectedRequestId('')}
      />
    </Stack>
  );
}

interface CreateDialogProps {
  open: boolean;
  workDate: string;
  source: RegularisationSource;
  missingEvent: MissingEvent;
  requestedStart: string;
  requestedEnd: string;
  reason: string;
  isUpdating: boolean;
  error?: string;
  onWorkDateChange: (value: string) => void;
  onSourceChange: (value: RegularisationSource) => void;
  onMissingEventChange: (value: MissingEvent) => void;
  onRequestedStartChange: (value: string) => void;
  onRequestedEndChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

function CreateRegularisationDialog({
  open,
  workDate,
  source,
  missingEvent,
  requestedStart,
  requestedEnd,
  reason,
  isUpdating,
  error,
  onWorkDateChange,
  onSourceChange,
  onMissingEventChange,
  onRequestedStartChange,
  onRequestedEndChange,
  onReasonChange,
  onClose,
  onSubmit,
}: CreateDialogProps) {
  return (
    <Dialog open={open} onClose={isUpdating ? undefined : onClose} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={onSubmit}>
        <DialogTitle>New correction request</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
              Corrections are available after the selected workday closes at 07:00.
            </Typography>
            <TextField
              type="date"
              label="Work date"
              value={workDate}
              onChange={(event) => onWorkDateChange(event.target.value)}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { max: currentIndiaWorkDate() },
              }}
              required
            />
            <Box
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
            >
              <FormControl fullWidth>
                <InputLabel id="regularisation-source-label">Missing source</InputLabel>
                <Select
                  labelId="regularisation-source-label"
                  label="Missing source"
                  value={source}
                  onChange={(event) => onSourceChange(event.target.value as RegularisationSource)}
                >
                  <MenuItem value="biometric">Biometric</MenuItem>
                  <MenuItem value="access_card">Access card</MenuItem>
                  <MenuItem value="website">Website timecard</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel id="regularisation-event-label">Missing event</InputLabel>
                <Select
                  labelId="regularisation-event-label"
                  label="Missing event"
                  value={missingEvent}
                  onChange={(event) => onMissingEventChange(event.target.value as MissingEvent)}
                >
                  <MenuItem value="opening">
                    {source === 'biometric'
                      ? 'In punch'
                      : source === 'access_card'
                        ? 'Entry swipe'
                        : 'Start'}
                  </MenuItem>
                  <MenuItem value="closing">
                    {source === 'biometric'
                      ? 'Out punch'
                      : source === 'access_card'
                        ? 'Exit swipe'
                        : 'Stop'}
                  </MenuItem>
                  <MenuItem value="both">Both events</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
            >
              <TextField
                type="datetime-local"
                label="Corrected start"
                value={requestedStart}
                onChange={(event) => onRequestedStartChange(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
              />
              <TextField
                type="datetime-local"
                label="Corrected end"
                value={requestedEnd}
                onChange={(event) => onRequestedEndChange(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
              />
            </Box>
            <TextField
              multiline
              minRows={4}
              label="Reason"
              placeholder="Explain why the attendance event was not captured."
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1_000 } }}
              helperText={`${reason.trim().length}/1000 - minimum 10 characters`}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button color="inherit" onClick={onClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={
              !workDate ||
              !requestedStart ||
              !requestedEnd ||
              reason.trim().length < 10 ||
              isUpdating
            }
            startIcon={isUpdating ? <CircularProgress size={16} /> : <Send size={17} />}
          >
            Submit for manager review
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function RegularisationDetailsDrawer({
  request,
  isUpdating,
  error,
  onCancel,
  onClose,
}: {
  request: RegularisationRequestDto | null;
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
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 }, maxWidth: '100vw' } } }}
    >
      <Stack sx={{ height: '100%' }}>
        <Stack direction="row" sx={{ minHeight: 72, px: 2.5, alignItems: 'center', gap: 1.25 }}>
          <CalendarClock size={19} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 17, fontWeight: 850 }}>Correction request</Typography>
            <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11 }}>
              {request ? `${request.workDate} - ${sourceLabel(request.source)}` : ''}
            </Typography>
          </Box>
          <Tooltip title="Close regularisation details">
            <IconButton
              aria-label="Close regularisation details"
              onClick={onClose}
              disabled={isUpdating}
            >
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
                ['Work date', request.workDate],
                ['Source', sourceLabel(request.source)],
                ['Missing event', eventLabel(request.source, request.missingEvent)],
                ['Status', statusLabel(request.status)],
                ['Corrected start', formatIndiaTime(request.requestedStart)],
                ['Corrected end', formatIndiaTime(request.requestedEnd)],
                ['Duration', formatMinutes(request.requestedMinutes)],
                ['Current step', String(request.currentStep)],
              ]}
            />
            <Detail label="Reason" value={request.reason} />
            {request.decisions.length > 0 && (
              <Box sx={{ pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography sx={{ mb: 1, fontSize: 12.5, fontWeight: 800 }}>
                  Decision history
                </Typography>
                <Stack spacing={1.25}>
                  {request.decisions.map((decision) => (
                    <Box key={`${decision.step}-${decision.decidedAt}`}>
                      <Typography sx={{ fontSize: 11.5, fontWeight: 750 }}>
                        Step {decision.step} {decision.decision} by {decision.actorDisplayName}
                      </Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: 10.75 }}>
                        {decision.comment || 'No decision comment.'}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
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

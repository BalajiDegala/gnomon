import type {
  SystemEventCategory,
  SystemEventDto,
  SystemEventParty,
  SystemEventSeverity,
} from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Copy, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { FilterBar } from '../components/data-view/FilterBar';
import { MultiSelectFilter } from '../components/data-view/MultiSelectFilter';
import { PageHeader } from '../components/data-view/PageHeader';
import { SoftCard } from '../components/soft';
import {
  SYSTEM_EVENT_RANGES,
  useSystemEvent,
  useSystemEvents,
  type SystemEventFilters,
  type SystemEventRange,
} from '../lib/system-events';
import { parseEnumValue, parseShortSearch, useUrlQueryState } from '../lib/url-query-state';

const CATEGORY_LABELS: Record<SystemEventCategory, string> = {
  auth: 'Sign-in',
  timecard: 'Timecard',
  timesheet: 'Timesheets',
  leave: 'Leave',
  regularisation: 'Regularisation',
  import: 'Imports',
  employee: 'Employees',
  security: 'Access & roles',
  administration: 'Administration',
  notification: 'Notifications',
  job: 'Background jobs',
  system: 'System',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as SystemEventCategory[];
const SEVERITIES: SystemEventSeverity[] = ['info', 'warn', 'error'];
const RANGE_LABELS: Record<SystemEventRange, string> = {
  '1h': 'Last hour',
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '180d': 'Last 180 days',
};
const SEVERITY_COLOR = { info: 'default', warn: 'warning', error: 'error' } as const;

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatTime(value: string): string {
  return timeFormat.format(new Date(value));
}

function partyLabel(party: SystemEventParty | null): string {
  if (!party) return '—';
  const name = party.label ?? party.id ?? party.type;
  return party.employeeCode && party.employeeCode !== name
    ? `${name} · ${party.employeeCode}`
    : name;
}

const parseList =
  <T extends string>(allowed: readonly T[]) =>
  (value: string): T[] | null => {
    const items = value.split(',').filter(Boolean);
    return items.every((item) => allowed.includes(item as T)) ? (items as T[]) : null;
  };
const serializeList = (values: readonly string[]) => values.join(',');
const parseCategories = parseList(CATEGORIES);
const parseSeverities = parseList(SEVERITIES);
const parseRange = (value: string) => parseEnumValue(value, SYSTEM_EVENT_RANGES);
const parseOutcome = (value: string) =>
  parseEnumValue(value, ['all', 'success', 'failure'] as const);
const EMPTY: never[] = [];

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function SystemEventsPage() {
  const [range, setRange] = useUrlQueryState<SystemEventRange>('range', '24h', parseRange);
  const [categories, setCategories] = useUrlQueryState<SystemEventCategory[]>(
    'category',
    EMPTY,
    parseCategories,
    serializeList,
  );
  const [severities, setSeverities] = useUrlQueryState<SystemEventSeverity[]>(
    'severity',
    EMPTY,
    parseSeverities,
    serializeList,
  );
  const [outcome, setOutcome] = useUrlQueryState<'all' | 'success' | 'failure'>(
    'outcome',
    'all',
    parseOutcome,
  );
  const [employeeCode, setEmployeeCode] = useUrlQueryState('employee', '', parseShortSearch);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search, 400);
  const debouncedEmployee = useDebounced(employeeCode, 400);
  const filters = useMemo<SystemEventFilters>(
    () => ({
      range,
      categories,
      severities,
      outcome,
      employeeCode: debouncedEmployee,
      q: debouncedSearch,
    }),
    [range, categories, severities, outcome, debouncedEmployee, debouncedSearch],
  );
  const events = useSystemEvents(filters, autoRefresh);

  const hasActiveFilters =
    range !== '24h' ||
    categories.length > 0 ||
    severities.length > 0 ||
    outcome !== 'all' ||
    Boolean(employeeCode) ||
    Boolean(search);
  const clearFilters = () => {
    setRange('24h');
    setCategories([]);
    setSeverities([]);
    setOutcome('all');
    setEmployeeCode('');
    setSearch('');
  };

  if (!events.canRead) {
    return <Alert severity="warning">Only system administrators can view system events.</Alert>;
  }

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Reporting"
        title="System events"
        meta="Sign-ins, changes, imports, background jobs and every failed request — newest first. Kept for 180 days."
        action={
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={autoRefresh}
                  onChange={(event) => setAutoRefresh(event.target.checked)}
                />
              }
              label={<Typography sx={{ fontSize: 12.5 }}>Auto-refresh</Typography>}
            />
            <Button
              variant="outlined"
              size="small"
              startIcon={
                events.isFetching ? <CircularProgress size={14} /> : <RefreshCw size={15} />
              }
              onClick={events.refresh}
            >
              Refresh
            </Button>
          </Stack>
        }
      />

      <FilterBar
        standalone
        search={search}
        onSearchChange={setSearch}
        searchLabel="Search message, action, path or reference"
        resultCount={events.events.length}
        resultLabel={events.hasMore ? 'loaded' : 'events'}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      >
        <FormControl size="small" sx={{ width: { xs: '100%', md: 150 } }}>
          <InputLabel id="event-range">Period</InputLabel>
          <Select
            labelId="event-range"
            label="Period"
            value={range}
            onChange={(event) => setRange(event.target.value as SystemEventRange)}
          >
            {SYSTEM_EVENT_RANGES.map((value) => (
              <MenuItem key={value} value={value}>
                {RANGE_LABELS[value]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <MultiSelectFilter
          label="Category"
          values={categories}
          options={CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
          onChange={(values) => setCategories(values as SystemEventCategory[])}
          width={170}
        />
        <MultiSelectFilter
          label="Severity"
          values={severities}
          options={SEVERITIES.map((value) => ({ value, label: value }))}
          onChange={(values) => setSeverities(values as SystemEventSeverity[])}
          width={140}
        />
        <FormControl size="small" sx={{ width: { xs: '100%', md: 130 } }}>
          <InputLabel id="event-outcome">Outcome</InputLabel>
          <Select
            labelId="event-outcome"
            label="Outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as typeof outcome)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="success">Success</MenuItem>
            <MenuItem value="failure">Failure</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="Employee code"
          value={employeeCode}
          onChange={(event) => setEmployeeCode(event.target.value)}
          sx={{ width: { xs: '100%', md: 140 } }}
          slotProps={{ htmlInput: { maxLength: 50 } }}
        />
      </FilterBar>

      {events.error && (
        <Alert severity="error">
          {events.error instanceof Error ? events.error.message : 'Events could not be loaded.'}
        </Alert>
      )}

      <SoftCard sx={{ p: 0, overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 'calc(100vh - 330px)', minHeight: 240 }}>
          <Table stickyHeader size="small" aria-label="System events">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 150 }}>Time (IST)</TableCell>
                <TableCell sx={{ width: 90 }}>Severity</TableCell>
                <TableCell sx={{ width: 130, display: { xs: 'none', md: 'table-cell' } }}>
                  Category
                </TableCell>
                <TableCell>What happened</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Who</TableCell>
                <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Subject</TableCell>
                <TableCell sx={{ width: 70, display: { xs: 'none', sm: 'table-cell' } }}>
                  Status
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {events.isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center' }}>
                    <CircularProgress size={22} />
                  </TableCell>
                </TableRow>
              ) : events.events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 700 }}>No events</Typography>
                    <Typography sx={{ color: 'text.secondary', fontSize: 12.5 }}>
                      Nothing matches these filters in the selected period.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                events.events.map((event) => (
                  <TableRow
                    key={event.id}
                    hover
                    selected={event.id === selectedId}
                    onClick={() => setSelectedId(event.id)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {formatTime(event.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={event.severity}
                        color={SEVERITY_COLOR[event.severity]}
                        variant={event.severity === 'info' ? 'outlined' : 'filled'}
                      />
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {CATEGORY_LABELS[event.category]}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 420 }}>
                      <Typography
                        sx={{ fontSize: 13, fontWeight: 600 }}
                        noWrap
                        title={event.message}
                      >
                        {event.message}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: 'text.secondary' }} noWrap>
                        {event.action}
                        {event.errorCode ? ` · ${event.errorCode}` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {partyLabel(event.actor)}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>
                      {partyLabel(event.subject)}
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {event.request?.status ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {events.hasMore && (
          <Box sx={{ p: 1.5, textAlign: 'center', borderTop: '1px solid var(--g-border)' }}>
            <Button size="small" onClick={events.loadMore} disabled={events.isLoadingMore}>
              {events.isLoadingMore ? 'Loading…' : 'Load older events'}
            </Button>
          </Box>
        )}
      </SoftCard>

      <EventDrawer
        eventId={selectedId}
        onClose={() => setSelectedId(null)}
        onFilterRequest={(requestId) => {
          setSearch(requestId);
          setRange('180d');
          setSelectedId(null);
        }}
        onFilterEmployee={(code) => {
          setEmployeeCode(code);
          setSelectedId(null);
        }}
      />
    </Stack>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '110px minmax(0, 1fr)', gap: 1, py: 0.6 }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
      <Box sx={{ fontSize: 12.5, wordBreak: 'break-word' }}>{children}</Box>
    </Box>
  );
}

function EventDrawer({
  eventId,
  onClose,
  onFilterRequest,
  onFilterEmployee,
}: {
  eventId: string | null;
  onClose: () => void;
  onFilterRequest: (requestId: string) => void;
  onFilterEmployee: (employeeCode: string) => void;
}) {
  const detail = useSystemEvent(eventId);
  const event: SystemEventDto | undefined = detail.data;
  const copy = (value: string) => void navigator.clipboard?.writeText(value).catch(() => undefined);
  const personCode = event?.actor?.employeeCode ?? event?.subject?.employeeCode ?? null;

  return (
    <Drawer
      anchor="right"
      open={Boolean(eventId)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: 520 }, p: 2.5 } } }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 800 }}>Event details</Typography>
        <IconButton aria-label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </Stack>
      {detail.isLoading && <CircularProgress size={22} sx={{ mt: 4, mx: 'auto' }} />}
      {detail.error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {detail.error instanceof Error ? detail.error.message : 'The event could not be loaded.'}
        </Alert>
      )}
      {event && (
        <Stack sx={{ mt: 1.5 }}>
          <Typography sx={{ fontWeight: 700 }}>{event.message}</Typography>
          <Stack direction="row" sx={{ gap: 0.75, mt: 1, mb: 1.5, flexWrap: 'wrap' }}>
            <Chip size="small" label={event.severity} color={SEVERITY_COLOR[event.severity]} />
            <Chip size="small" variant="outlined" label={CATEGORY_LABELS[event.category]} />
            <Chip size="small" variant="outlined" label={event.outcome} />
          </Stack>
          <Divider />
          <DetailRow label="Time (IST)">{formatTime(event.createdAt)}</DetailRow>
          <DetailRow label="Action">{event.action}</DetailRow>
          {event.errorCode && <DetailRow label="Error code">{event.errorCode}</DetailRow>}
          <DetailRow label="Who">{partyLabel(event.actor)}</DetailRow>
          <DetailRow label="Subject">
            {event.subject ? `${partyLabel(event.subject)} (${event.subject.type})` : '—'}
          </DetailRow>
          {event.request && (
            <>
              <DetailRow label="Request">
                {event.request.method} {event.request.path}
              </DetailRow>
              <DetailRow label="Status">
                {event.request.status ?? '—'}
                {event.request.durationMs !== null ? ` in ${event.request.durationMs} ms` : ''}
              </DetailRow>
              <DetailRow label="IP address">{event.request.ip ?? '—'}</DetailRow>
              <DetailRow label="Browser">{event.request.userAgent ?? '—'}</DetailRow>
            </>
          )}
          {event.requestId && (
            <DetailRow label="Reference">
              <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
                <Box component="code" sx={{ fontSize: 11.5 }}>
                  {event.requestId}
                </Box>
                <Tooltip title="Copy">
                  <IconButton size="small" onClick={() => copy(event.requestId!)}>
                    <Copy size={14} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </DetailRow>
          )}
          <Stack direction="row" sx={{ gap: 1, my: 1.5, flexWrap: 'wrap' }}>
            {event.requestId && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => onFilterRequest(event.requestId!)}
              >
                All events for this request
              </Button>
            )}
            {personCode && (
              <Button size="small" variant="outlined" onClick={() => onFilterEmployee(personCode)}>
                All events for {personCode}
              </Button>
            )}
          </Stack>
          <Divider />
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1.5, mb: 0.75 }}>
            Details
          </Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              borderRadius: 2,
              bgcolor: 'var(--g-base)',
              boxShadow: 'var(--g-inset-sm)',
              fontSize: 11.5,
              overflow: 'auto',
              maxHeight: 420,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {Object.keys(event.metadata ?? {}).length > 0
              ? JSON.stringify(event.metadata, null, 2)
              : 'No additional details.'}
          </Box>
        </Stack>
      )}
    </Drawer>
  );
}

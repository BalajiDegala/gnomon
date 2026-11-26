import {
  availabilityModeLabels,
  availabilityStatusLabels,
  type AvailabilityMode,
  type AvailabilityPerson,
  type AvailabilityStatus,
} from '@gnomon/shared';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  InputAdornment,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { DataGrid, type DataGridColumn, type GridSortRule } from '../components/data-view/DataGrid';
import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import {
  availabilityStatusColors,
  useAvailabilityDirectory,
  useMyAvailability,
} from '../lib/availability';
import { formatIndiaTime } from '../lib/timecard';

type StatusFilter = 'all' | AvailabilityStatus;
type SortKey = 'name' | 'status' | 'login' | 'email' | 'ip' | 'since';

const statusOrder: AvailabilityStatus[] = ['available', 'busy', 'away'];
const modes: AvailabilityMode[] = ['auto', 'busy', 'available'];

export function StatusDot({ status, size = 9 }: { status: AvailabilityStatus; size?: number }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'inline-block',
        bgcolor: availabilityStatusColors[status],
      }}
    />
  );
}

function sortValue(person: AvailabilityPerson, key: SortKey): string | number {
  switch (key) {
    case 'status':
      return statusOrder.indexOf(person.status);
    case 'login':
      return person.loginId;
    case 'email':
      return person.email.toLowerCase();
    case 'ip':
      return person.ipAddress ?? '￿';
    case 'since':
      return person.since ?? '￿';
    default:
      return person.fullName.toLowerCase();
  }
}

export function AvailabilityPage() {
  const directory = useAvailabilityDirectory();
  const mine = useMyAvailability();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<GridSortRule<SortKey>[]>([
    { key: 'status', direction: 'asc' },
    { key: 'name', direction: 'asc' },
  ]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const people = useMemo(() => directory.data?.people ?? [], [directory.data]);
  const tabs = useMemo<PageTab<StatusFilter>[]>(
    () => [
      { value: 'all', label: 'Everyone', count: people.length },
      ...statusOrder.map((value) => ({
        value,
        label: availabilityStatusLabels[value],
        count: people.filter((person) => person.status === value).length,
      })),
    ],
    [people],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = people.filter(
      (person) =>
        (status === 'all' || person.status === status) &&
        (!term ||
          [person.fullName, person.loginId, person.email, person.employeeCode, person.ipAddress]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(term))),
    );
    return [...filtered].sort((left, right) => {
      for (const rule of sort) {
        const a = sortValue(left, rule.key);
        const b = sortValue(right, rule.key);
        if (a < b) return rule.direction === 'asc' ? -1 : 1;
        if (a > b) return rule.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [people, search, sort, status]);

  const columns: DataGridColumn<AvailabilityPerson, SortKey>[] = [
    {
      id: 'name',
      label: 'Full name',
      sortKey: 'name',
      minWidth: 220,
      sticky: true,
      render: (person) => (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 650 }}>
            {person.fullName}
          </Typography>
          {person.isMe && <Chip size="small" label="You" sx={{ height: 20, fontSize: 11 }} />}
        </Stack>
      ),
    },
    {
      id: 'status',
      label: 'Status',
      sortKey: 'status',
      minWidth: 150,
      render: (person) => (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.9 }}>
          <StatusDot status={person.status} />
          <Typography sx={{ fontSize: 13 }}>{availabilityStatusLabels[person.status]}</Typography>
        </Stack>
      ),
    },
    {
      id: 'login',
      label: 'Login ID',
      sortKey: 'login',
      minWidth: 120,
      render: (person) => <Typography sx={{ fontSize: 13 }}>{person.loginId || '—'}</Typography>,
    },
    {
      id: 'email',
      label: 'Email',
      sortKey: 'email',
      minWidth: 220,
      render: (person) =>
        person.email ? (
          <Link href={`mailto:${person.email}`} underline="hover" sx={{ fontSize: 13 }}>
            {person.email}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      id: 'ip',
      label: 'IP address',
      sortKey: 'ip',
      minWidth: 130,
      render: (person) => (
        <Typography sx={{ fontSize: 13, fontFamily: 'monospace' }}>
          {person.ipAddress ?? '—'}
        </Typography>
      ),
    },
    {
      id: 'since',
      label: 'Working since',
      sortKey: 'since',
      minWidth: 120,
      render: (person) => (
        <Typography sx={{ fontSize: 13 }}>
          {person.since ? formatIndiaTime(person.since) : '—'}
        </Typography>
      ),
    },
  ];

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1800, mx: 'auto' }}>
      <PageHeader
        eyebrow="TEAM"
        title="Availability"
        meta="Available while the workday is running, away once it stops. Updates every minute."
        action={
          <TextField
            select
            size="small"
            label="Your status"
            value={mine.availability?.mode ?? 'auto'}
            disabled={!mine.availability || mine.setMode.isPending}
            onChange={(event) => mine.setMode.mutate(event.target.value as AvailabilityMode)}
            sx={{ minWidth: 190 }}
          >
            {modes.map((mode) => (
              <MenuItem key={mode} value={mode}>
                {availabilityModeLabels[mode]}
              </MenuItem>
            ))}
          </TextField>
        }
      />

      {directory.error && <Alert severity="error">{directory.error.message}</Alert>}
      {mine.setMode.error && <Alert severity="error">{mine.setMode.error.message}</Alert>}

      <PageTabs
        value={status}
        tabs={tabs}
        onChange={(value) => {
          setStatus(value);
          setPage(0);
        }}
        ariaLabel="Availability status"
      />

      <TextField
        size="small"
        placeholder="Search name, login ID, email or IP"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} />
              </InputAdornment>
            ),
          },
        }}
        sx={{ maxWidth: 420 }}
      />

      {directory.isLoading ? (
        <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading availability" />
        </Box>
      ) : (
        <DataGrid
          ariaLabel="Employee availability"
          rows={rows}
          columns={columns}
          getRowId={(person) => person.employeeId}
          sort={sort}
          onSort={(key, additive) =>
            setSort((current) => {
              const existing = current.find((rule) => rule.key === key);
              const direction =
                existing && existing.direction === 'asc' ? ('desc' as const) : ('asc' as const);
              if (additive) {
                return existing
                  ? current.map((rule) => (rule.key === key ? { key, direction } : rule))
                  : [...current, { key, direction: 'asc' }];
              }
              return [{ key, direction: existing ? direction : 'asc' }];
            })
          }
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={(value) => {
            setRowsPerPage(value);
            setPage(0);
          }}
          emptyTitle="No one matches"
          emptyMessage="Try another status tab or search."
        />
      )}
    </Stack>
  );
}

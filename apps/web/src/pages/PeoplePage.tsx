import type {
  CreateEmployeeRequest,
  EmployeeDirectoryItemDto,
  EmployeeStatus,
} from '@gnomon/shared';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { Pencil, Plus, UserRoundCog } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '../components/data-view/DataTable';
import { FilterBar } from '../components/data-view/FilterBar';
import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { useEmployeeDirectory } from '../lib/people';
import { parseEnumValue, parseShortSearch, useUrlQueryState } from '../lib/url-query-state';

interface EmployeeFormState {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  reportingManagerId: string;
  timezone: string;
  status: EmployeeStatus;
}

type EmployeeStatusFilter = 'all' | EmployeeStatus;
type PeopleSortKey = 'employee' | 'code' | 'email' | 'manager' | 'location' | 'status' | 'updated';

const emptyForm: EmployeeFormState = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  email: '',
  reportingManagerId: '',
  timezone: 'Asia/Kolkata',
  status: 'active',
};
const employeeStatusFilters = ['all', 'active', 'inactive'] as const;
const peopleSortKeys = [
  'employee',
  'code',
  'email',
  'manager',
  'location',
  'status',
  'updated',
] as const;
const sortDirections = ['asc', 'desc'] as const;
const pageSizes = [10, 25, 50, 100] as const;

function parseEmployeeStatusFilter(value: string): EmployeeStatusFilter | null {
  return parseEnumValue(value, employeeStatusFilters);
}

function parsePeopleSort(value: string): PeopleSortKey | null {
  return parseEnumValue(value, peopleSortKeys);
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

function parseDirectoryFilter(value: string): string | null {
  return value === 'all' || value === 'unassigned' || /^[a-f\d]{24}$/i.test(value) ? value : null;
}

function compareEmployees(
  left: EmployeeDirectoryItemDto,
  right: EmployeeDirectoryItemDto,
  key: PeopleSortKey,
): number {
  const leftValue =
    key === 'employee'
      ? left.displayName
      : key === 'manager'
        ? (left.reportingManager?.displayName ?? '')
        : key === 'location'
          ? (left.location?.name ?? '')
          : key === 'updated'
            ? left.updatedAt
            : key === 'code'
              ? left.employeeCode
              : key === 'email'
                ? left.email
                : left.status;
  const rightValue =
    key === 'employee'
      ? right.displayName
      : key === 'manager'
        ? (right.reportingManager?.displayName ?? '')
        : key === 'location'
          ? (right.location?.name ?? '')
          : key === 'updated'
            ? right.updatedAt
            : key === 'code'
              ? right.employeeCode
              : key === 'email'
                ? right.email
                : right.status;
  return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
}

export function PeoplePage() {
  const directory = useEmployeeDirectory();
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [status, setStatus] = useUrlQueryState<EmployeeStatusFilter>(
    'status',
    'active',
    parseEmployeeStatusFilter,
  );
  const [managerFilter, setManagerFilter] = useUrlQueryState(
    'manager',
    'all',
    parseDirectoryFilter,
  );
  const [locationFilter, setLocationFilter] = useUrlQueryState(
    'location',
    'all',
    parseDirectoryFilter,
  );
  const [sortKey, setSortKey] = useUrlQueryState<PeopleSortKey>(
    'sort',
    'employee',
    parsePeopleSort,
  );
  const [sortDirection, setSortDirection] = useUrlQueryState<SortDirection>(
    'order',
    'asc',
    parseSortDirection,
  );
  const [pageNumber, setPageNumber] = useUrlQueryState('page', 1, parsePage);
  const [rowsPerPage, setRowsPerPage] = useUrlQueryState('size', 25, parsePageSize);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeDirectoryItemDto | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(emptyForm);
  const [success, setSuccess] = useState('');

  const managers = useMemo(
    () =>
      directory.employees
        .filter((employee) => employee.status === 'active' && employee.id !== editing?.id)
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    [directory.employees, editing?.id],
  );
  const managerOptions = useMemo(() => {
    const values = new Map<string, { id: string; label: string }>();
    for (const employee of directory.employees) {
      if (employee.reportingManager) {
        values.set(employee.reportingManager.id, {
          id: employee.reportingManager.id,
          label: employee.reportingManager.displayName,
        });
      }
    }
    return [...values.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [directory.employees]);
  const locationOptions = useMemo(() => {
    const values = new Map<string, { id: string; label: string }>();
    for (const employee of directory.employees) {
      if (employee.location) {
        values.set(employee.location.id, {
          id: employee.location.id,
          label: employee.location.name,
        });
      }
    }
    return [...values.values()].sort((left, right) => left.label.localeCompare(right.label));
  }, [directory.employees]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    const direction = sortDirection === 'asc' ? 1 : -1;
    return directory.employees
      .filter((employee) => status === 'all' || employee.status === status)
      .filter((employee) => {
        if (managerFilter === 'all') return true;
        if (managerFilter === 'unassigned') return !employee.reportingManager;
        return employee.reportingManager?.id === managerFilter;
      })
      .filter((employee) => {
        if (locationFilter === 'all') return true;
        if (locationFilter === 'unassigned') return !employee.location;
        return employee.location?.id === locationFilter;
      })
      .filter(
        (employee) =>
          !term ||
          employee.displayName.toLowerCase().includes(term) ||
          employee.employeeCode.toLowerCase().includes(term) ||
          employee.email.toLowerCase().includes(term) ||
          employee.reportingManager?.displayName.toLowerCase().includes(term) ||
          employee.location?.name.toLowerCase().includes(term),
      )
      .slice()
      .sort(
        (left, right) =>
          compareEmployees(left, right, sortKey) * direction || left.id.localeCompare(right.id),
      );
  }, [directory.employees, locationFilter, managerFilter, search, sortDirection, sortKey, status]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredEmployees.length / rowsPerPage));
    if (pageNumber > lastPage) setPageNumber(lastPage);
  }, [filteredEmployees.length, pageNumber, rowsPerPage, setPageNumber]);

  const tabs = useMemo<ReadonlyArray<PageTab<EmployeeStatusFilter>>>(
    () => [
      {
        value: 'active',
        label: 'Active',
        count: directory.employees.filter((employee) => employee.status === 'active').length,
      },
      {
        value: 'inactive',
        label: 'Inactive',
        count: directory.employees.filter((employee) => employee.status === 'inactive').length,
      },
      { value: 'all', label: 'All', count: directory.employees.length },
    ],
    [directory.employees],
  );

  const openCreate = () => {
    setForm(emptyForm);
    setSuccess('');
    setCreateOpen(true);
  };
  const openEdit = (employee: EmployeeDirectoryItemDto) => {
    setForm({
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      reportingManagerId: employee.reportingManager?.id ?? '',
      timezone: employee.timezone,
      status: employee.status,
    });
    setSuccess('');
    setEditing(employee);
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    const input: CreateEmployeeRequest = {
      employeeCode: form.employeeCode,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      timezone: form.timezone,
      reportingManagerId: form.reportingManagerId || null,
    };
    try {
      await directory.create(input);
      setCreateOpen(false);
      setSuccess(`${form.employeeCode.toUpperCase()} was added to the employee directory.`);
    } catch {
      // Mutation errors are displayed above the directory.
    }
  };

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try {
      await directory.update(editing.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        timezone: form.timezone,
        reportingManagerId: form.reportingManagerId || null,
        status: form.status,
      });
      setEditing(null);
      setSuccess(`${editing.employeeCode} was updated.`);
    } catch {
      // Mutation errors are displayed above the directory.
    }
  };

  const updateSort = (key: PeopleSortKey) => {
    if (key === sortKey) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPageNumber(1);
  };
  const clearFilters = () => {
    setSearch('');
    setManagerFilter('all');
    setLocationFilter('all');
    setStatus('active');
    setPageNumber(1);
  };

  const columns: ReadonlyArray<DataTableColumn<EmployeeDirectoryItemDto, PeopleSortKey>> = [
    {
      id: 'employee',
      label: 'Employee',
      sortKey: 'employee',
      minWidth: 220,
      render: (employee) => <EmployeeIdentity employee={employee} />,
    },
    {
      id: 'email',
      label: 'Contact',
      sortKey: 'email',
      minWidth: 230,
      hideBelow: 'md',
      render: (employee) => employee.email,
    },
    {
      id: 'manager',
      label: 'Reporting manager',
      sortKey: 'manager',
      minWidth: 190,
      hideBelow: 'sm',
      render: (employee) => employee.reportingManager?.displayName ?? 'Not assigned',
    },
    {
      id: 'location',
      label: 'Location',
      sortKey: 'location',
      minWidth: 150,
      hideBelow: 'md',
      render: (employee) => employee.location?.name ?? 'Not assigned',
    },
    {
      id: 'status',
      label: 'Status',
      sortKey: 'status',
      width: 110,
      render: (employee) => <StatusChip status={employee.status} />,
    },
    ...(directory.canUpdate
      ? [
          {
            id: 'edit',
            label: 'Edit',
            align: 'right' as const,
            width: 70,
            render: (employee: EmployeeDirectoryItemDto) => (
              <Tooltip title="Edit employee">
                <IconButton
                  aria-label={`Edit ${employee.displayName}`}
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    openEdit(employee);
                  }}
                >
                  <Pencil size={16} />
                </IconButton>
              </Tooltip>
            ),
          },
        ]
      : []),
  ];

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        eyebrow="HR & TEAM STRUCTURE"
        title="People"
        meta={`${directory.employees.length} employees in your assigned scope`}
        action={
          directory.canCreate ? (
            <Button variant="contained" startIcon={<Plus size={17} />} onClick={openCreate}>
              Add employee
            </Button>
          ) : undefined
        }
      />

      {!directory.canRead && (
        <Alert severity="warning">Your account does not have employee directory access.</Alert>
      )}
      {directory.error && <Alert severity="error">{directory.error.message}</Alert>}
      {success && (
        <Alert severity="success" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Box>
        <PageTabs
          value={status}
          tabs={tabs}
          onChange={(value) => {
            setStatus(value);
            setPageNumber(1);
          }}
          ariaLabel="Employment status"
        />
        <FilterBar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPageNumber(1);
          }}
          searchLabel="Search people"
          resultCount={filteredEmployees.length}
          resultLabel={filteredEmployees.length === 1 ? 'employee' : 'employees'}
          hasActiveFilters={
            Boolean(search) ||
            status !== 'active' ||
            managerFilter !== 'all' ||
            locationFilter !== 'all'
          }
          onClear={clearFilters}
        >
          <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 210 } }}>
            <InputLabel id="people-manager-filter-label">Manager</InputLabel>
            <Select
              labelId="people-manager-filter-label"
              label="Manager"
              value={managerFilter}
              onChange={(event) => {
                setManagerFilter(event.target.value);
                setPageNumber(1);
              }}
            >
              <MenuItem value="all">All managers</MenuItem>
              <MenuItem value="unassigned">Not assigned</MenuItem>
              {managerOptions.map((manager) => (
                <MenuItem key={manager.id} value={manager.id}>
                  {manager.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 190 } }}>
            <InputLabel id="people-location-filter-label">Location</InputLabel>
            <Select
              labelId="people-location-filter-label"
              label="Location"
              value={locationFilter}
              onChange={(event) => {
                setLocationFilter(event.target.value);
                setPageNumber(1);
              }}
            >
              <MenuItem value="all">All locations</MenuItem>
              <MenuItem value="unassigned">Not assigned</MenuItem>
              {locationOptions.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {location.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </FilterBar>
      </Box>

      <DataTable
        ariaLabel="Employee directory"
        rows={filteredEmployees}
        columns={columns}
        getRowId={(employee) => employee.id}
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
        onRowClick={directory.canUpdate ? openEdit : undefined}
        isLoading={directory.isLoading}
        emptyTitle="No employees found"
        emptyMessage="Change or clear the active directory filters."
      />

      <EmployeeDialog
        title="Add employee"
        open={createOpen}
        form={form}
        managers={managers}
        isUpdating={directory.isUpdating}
        showEmployeeCode
        onChange={setForm}
        onClose={() => setCreateOpen(false)}
        onSubmit={submitCreate}
      />
      <EmployeeDialog
        title={editing ? `Edit ${editing.employeeCode}` : 'Edit employee'}
        open={Boolean(editing)}
        form={form}
        managers={managers}
        isUpdating={directory.isUpdating}
        showStatus
        onChange={setForm}
        onClose={() => setEditing(null)}
        onSubmit={submitEdit}
      />
    </Stack>
  );
}

function EmployeeDialog({
  title,
  open,
  form,
  managers,
  isUpdating,
  showEmployeeCode = false,
  showStatus = false,
  onChange,
  onClose,
  onSubmit,
}: {
  title: string;
  open: boolean;
  form: EmployeeFormState;
  managers: EmployeeDirectoryItemDto[];
  isUpdating: boolean;
  showEmployeeCode?: boolean;
  showStatus?: boolean;
  onChange: (form: EmployeeFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const update = (field: keyof EmployeeFormState, value: string) =>
    onChange({ ...form, [field]: value });
  return (
    <Dialog open={open} onClose={isUpdating ? undefined : onClose} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={(event) => void onSubmit(event)}>
        <DialogTitle sx={{ fontWeight: 800 }}>{title}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {showEmployeeCode && (
              <TextField
                label="Employee code"
                value={form.employeeCode}
                onChange={(event) => update('employeeCode', event.target.value.toUpperCase())}
                required
              />
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="First name"
                value={form.firstName}
                onChange={(event) => update('firstName', event.target.value)}
                required
              />
              <TextField
                fullWidth
                label="Last name"
                value={form.lastName}
                onChange={(event) => update('lastName', event.target.value)}
                required
              />
            </Stack>
            <TextField
              type="email"
              label="Work email"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              required
            />
            <FormControl>
              <InputLabel id={`${title}-manager-label`}>Reporting manager</InputLabel>
              <Select
                labelId={`${title}-manager-label`}
                label="Reporting manager"
                value={form.reportingManagerId}
                onChange={(event) => update('reportingManagerId', event.target.value)}
              >
                <MenuItem value="">Not assigned</MenuItem>
                {managers.map((manager) => (
                  <MenuItem key={manager.id} value={manager.id}>
                    {manager.employeeCode} · {manager.displayName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Timezone"
              value={form.timezone}
              onChange={(event) => update('timezone', event.target.value)}
              required
            />
            {showStatus && (
              <FormControl>
                <InputLabel id={`${title}-status-label`}>Employment status</InputLabel>
                <Select
                  labelId={`${title}-status-label`}
                  label="Employment status"
                  value={form.status}
                  onChange={(event) => update('status', event.target.value)}
                >
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button color="inherit" onClick={onClose} disabled={isUpdating}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isUpdating}
            startIcon={isUpdating ? <CircularProgress size={15} /> : <UserRoundCog size={16} />}
          >
            {showEmployeeCode ? 'Add employee' : 'Save changes'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function EmployeeIdentity({ employee }: { employee: EmployeeDirectoryItemDto }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <Avatar
        sx={{
          width: 34,
          height: 34,
          bgcolor: '#e5f6f7',
          color: '#087b88',
          fontSize: 12,
          fontWeight: 800,
        }}
      >
        {employee.firstName.at(0)}
        {employee.lastName.at(0)}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 13, fontWeight: 750 }}>
          {employee.displayName}
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>
          {employee.employeeCode}
        </Typography>
      </Box>
    </Stack>
  );
}

function StatusChip({ status }: { status: EmployeeStatus }) {
  return (
    <Chip
      size="small"
      label={status === 'active' ? 'Active' : 'Inactive'}
      color={status === 'active' ? 'success' : 'default'}
      variant="outlined"
    />
  );
}

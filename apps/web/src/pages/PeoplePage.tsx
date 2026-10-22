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
import { useEmployeeDirectory } from '../lib/people';
import { parseEnumValue, parseShortSearch, useUrlQueryState } from '../lib/url-query-state';
import { confirmDiscardChanges, useUnsavedChanges } from '../lib/unsaved-changes';

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
type PeopleSortKey = 'employee' | 'code' | 'email' | 'manager' | 'status' | 'updated';

const emptyForm: EmployeeFormState = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  email: '',
  reportingManagerId: '',
  timezone: 'Asia/Kolkata',
  status: 'active',
};

interface EmployeeFormDraft {
  mode: 'create' | 'edit';
  employeeId?: string;
  form: EmployeeFormState;
}

function isEmployeeFormState(value: unknown): value is EmployeeFormState {
  if (!value || typeof value !== 'object') return false;
  const form = value as Partial<EmployeeFormState>;
  return (
    typeof form.employeeCode === 'string' &&
    typeof form.firstName === 'string' &&
    typeof form.lastName === 'string' &&
    typeof form.email === 'string' &&
    typeof form.reportingManagerId === 'string' &&
    typeof form.timezone === 'string' &&
    ['active', 'inactive'].includes(form.status ?? '')
  );
}

function isEmployeeFormDraft(value: unknown): value is EmployeeFormDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<EmployeeFormDraft>;
  return (
    (draft.mode === 'create' || draft.mode === 'edit') &&
    (draft.employeeId === undefined || typeof draft.employeeId === 'string') &&
    isEmployeeFormState(draft.form)
  );
}

function formForEmployee(employee: EmployeeDirectoryItemDto): EmployeeFormState {
  return {
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    reportingManagerId: employee.reportingManager?.id ?? '',
    timezone: employee.timezone,
    status: employee.status,
  };
}

function formsMatch(left: EmployeeFormState, right: EmployeeFormState): boolean {
  return (Object.keys(left) as Array<keyof EmployeeFormState>).every(
    (field) => left[field] === right[field],
  );
}
const employeeStatusFilters = ['all', 'active', 'inactive'] as const;
const peopleSortKeys = ['employee', 'code', 'email', 'manager', 'status', 'updated'] as const;
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
        : key === 'updated'
          ? right.updatedAt
          : key === 'code'
            ? right.employeeCode
            : key === 'email'
              ? right.email
              : right.status;
  return leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
}

function contactEmail(employee: EmployeeDirectoryItemDto): string {
  return employee.email.endsWith('@gnomon.invalid') ? 'Not supplied in workbook' : employee.email;
}

export function PeoplePage() {
  const { user } = useAuth();
  const directory = useEmployeeDirectory();
  const draftKey = `${user?.employeeId ?? 'anonymous'}:employee-form`;
  const recoveredDraft = useMemo(() => readFormDraft(draftKey, isEmployeeFormDraft), [draftKey]);
  const recoveredApplied = useRef(recoveredDraft?.mode !== 'edit');
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
  const [createOpen, setCreateOpen] = useState(recoveredDraft?.mode === 'create');
  const [editing, setEditing] = useState<EmployeeDirectoryItemDto | null>(null);
  const [form, setForm] = useState<EmployeeFormState>(recoveredDraft?.form ?? emptyForm);
  const [success, setSuccess] = useState('');
  const formDirty = createOpen
    ? !formsMatch(form, emptyForm)
    : editing
      ? !formsMatch(form, formForEmployee(editing))
      : false;
  const draft = useMemo<EmployeeFormDraft>(
    () => ({ mode: editing ? 'edit' : 'create', employeeId: editing?.id, form }),
    [editing, form],
  );
  const clearDraft = useSessionFormDraft(draftKey, draft, formDirty);
  useUnsavedChanges(formDirty);

  useEffect(() => {
    if (recoveredApplied.current || !recoveredDraft || directory.isLoading) return;
    recoveredApplied.current = true;
    const employee = directory.employees.find(
      (candidate) => candidate.id === recoveredDraft.employeeId,
    );
    if (employee) {
      setForm(recoveredDraft.form);
      setEditing(employee);
    } else {
      clearDraft();
      setForm(emptyForm);
    }
  }, [clearDraft, directory.employees, directory.isLoading, recoveredDraft]);

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
      .filter(
        (employee) =>
          !term ||
          employee.displayName.toLowerCase().includes(term) ||
          employee.employeeCode.toLowerCase().includes(term) ||
          employee.email.toLowerCase().includes(term) ||
          employee.hrProfile?.userId.toLowerCase().includes(term) ||
          employee.hrProfile?.designation.toLowerCase().includes(term) ||
          employee.hrProfile?.departmentName.toLowerCase().includes(term) ||
          employee.biometricProfile?.designation?.toLowerCase().includes(term) ||
          employee.biometricProfile?.departmentName?.toLowerCase().includes(term) ||
          employee.hrProfile?.emailTriggers.some((email) => email.includes(term)) ||
          employee.attendanceIdentity?.cardNumber?.toLowerCase().includes(term) ||
          employee.attendanceIdentity?.departmentName?.toLowerCase().includes(term) ||
          employee.reportingManager?.displayName.toLowerCase().includes(term),
      )
      .slice()
      .sort(
        (left, right) =>
          compareEmployees(left, right, sortKey) * direction || left.id.localeCompare(right.id),
      );
  }, [directory.employees, managerFilter, search, sortDirection, sortKey, status]);

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
    setForm(formForEmployee(employee));
    setSuccess('');
    setEditing(employee);
  };

  const closeEmployeeForm = () => {
    if (formDirty && !confirmDiscardChanges()) return;
    clearDraft();
    setCreateOpen(false);
    setEditing(null);
    setForm(emptyForm);
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
      clearDraft();
      setCreateOpen(false);
      setForm(emptyForm);
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
      clearDraft();
      setEditing(null);
      setForm(emptyForm);
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
    setStatus('active');
    setPageNumber(1);
  };

  const columns: ReadonlyArray<DataTableColumn<EmployeeDirectoryItemDto, PeopleSortKey>> = [
    {
      id: 'employee',
      label: 'Emp name',
      sortKey: 'employee',
      minWidth: 220,
      render: (employee) => <EmployeeIdentity employee={employee} />,
    },
    {
      id: 'employee-code',
      label: 'Emp ID',
      sortKey: 'code',
      minWidth: 110,
      render: (employee) => employee.employeeCode,
    },
    {
      id: 'user-id',
      label: 'User ID',
      minWidth: 140,
      render: (employee) => employee.hrProfile?.userId ?? '—',
    },
    {
      id: 'email',
      label: 'Mail ID',
      sortKey: 'email',
      minWidth: 230,
      render: (employee) => contactEmail(employee),
    },
    {
      id: 'designation',
      label: 'New Designation',
      minWidth: 190,
      render: (employee) =>
        employee.hrProfile?.designation ?? employee.biometricProfile?.designation ?? '—',
    },
    {
      id: 'department',
      label: 'Dept',
      minWidth: 150,
      render: (employee) =>
        employee.hrProfile?.departmentName ?? employee.biometricProfile?.departmentName ?? '—',
    },
    {
      id: 'email-triggers',
      label: 'Email Triggers',
      minWidth: 240,
      render: (employee) => employee.hrProfile?.emailTriggers.join(', ') || '—',
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
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1600, mx: 'auto' }}>
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
          hasActiveFilters={Boolean(search) || status !== 'active' || managerFilter !== 'all'}
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
        onClose={closeEmployeeForm}
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
        onClose={closeEmployeeForm}
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

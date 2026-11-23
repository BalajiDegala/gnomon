import type {
  CreateEmployeeRequest,
  EmployeeDirectoryItemDto,
  EmployeeStatus,
} from '@gnomon/shared';
import {
  Alert,
  Autocomplete,
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
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Download,
  Pencil,
  Plus,
  RotateCcw,
  Rows3,
  Rows4,
  Search,
  UserRoundCog,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { ColumnPicker } from '../components/data-view/ColumnPicker';
import { DataGrid, type DataGridColumn } from '../components/data-view/DataGrid';
import { MultiSelectFilter } from '../components/data-view/MultiSelectFilter';
import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { useAuth } from '../lib/auth';
import { useStoredColumnOrder } from '../lib/column-order';
import { downloadCsv } from '../lib/csv';
import { readFormDraft, useSessionFormDraft } from '../lib/form-drafts';
import { useEmployeeDirectory } from '../lib/people';
import {
  buildPeopleExport,
  defaultPeopleSort,
  defaultVisiblePeopleColumns,
  facetOptions,
  filterPeople,
  nextPeopleSort,
  orderPeople,
  parsePeopleSort,
  parseVisiblePeopleColumns,
  peopleColumnIds,
  peopleColumnLabels,
  peopleGroupFor,
  peopleGroupLabels,
  peopleGroupOptions,
  personApprovers,
  personContactEmail,
  personDepartment,
  personPrimaryApprover,
  personDesignation,
  personSourceLabel,
  serializePeopleSort,
  type PeopleColumnId,
  type PeopleGroupBy,
  type PeopleSortRule,
} from '../lib/people-view';
import { parseEnumValue, parseShortSearch, useUrlQueryState } from '../lib/url-query-state';
import { confirmDiscardChanges, useUnsavedChanges } from '../lib/unsaved-changes';

interface EmployeeFormState {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  timezone: string;
  status: EmployeeStatus;
  departmentName: string;
  designation: string;
}

type EmployeeStatusFilter = 'all' | EmployeeStatus;

const emptyForm: EmployeeFormState = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  email: '',
  timezone: 'Asia/Kolkata',
  status: 'active',
  departmentName: '',
  designation: '',
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
    typeof form.timezone === 'string' &&
    typeof form.departmentName === 'string' &&
    typeof form.designation === 'string' &&
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
    timezone: employee.timezone,
    status: employee.status,
    departmentName: employeeDepartment(employee) ?? '',
    designation: employee.hrProfile?.designation ?? employee.biometricProfile?.designation ?? '',
  };
}

function employeeDepartment(employee: EmployeeDirectoryItemDto): string | null {
  return (
    employee.hrProfile?.departmentName ??
    employee.biometricProfile?.departmentName ??
    employee.attendanceIdentity?.departmentName ??
    null
  );
}

function formsMatch(left: EmployeeFormState, right: EmployeeFormState): boolean {
  return (Object.keys(left) as Array<keyof EmployeeFormState>).every(
    (field) => left[field] === right[field],
  );
}
const employeeStatusFilters = ['all', 'active', 'inactive'] as const;
const VISIBLE_COLUMNS_STORAGE_KEY = 'gnomon:people:visible-columns';
const COLUMN_ORDER_STORAGE_KEY = 'gnomon:people:column-order';
const DENSITY_STORAGE_KEY = 'gnomon:people:density';
const LIST_SEPARATOR = '|';

const parseGroupBy = (value: string) => parseEnumValue(value, peopleGroupOptions);
const parseList = (value: string): readonly string[] | null => {
  const items = value.split(LIST_SEPARATOR).filter(Boolean);
  return items.length <= 100 && items.every((item) => item.length <= 120) ? items : null;
};
const serializeList = (items: readonly string[]) => items.join(LIST_SEPARATOR);
const emptyList: readonly string[] = [];

function parseEmployeeStatusFilter(value: string): EmployeeStatusFilter | null {
  return parseEnumValue(value, employeeStatusFilters);
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
  const [departmentFilter, setDepartmentFilter] = useUrlQueryState(
    'dept',
    emptyList,
    parseList,
    serializeList,
  );
  const [designationFilter, setDesignationFilter] = useUrlQueryState(
    'designation',
    emptyList,
    parseList,
    serializeList,
  );
  const [locationFilter, setLocationFilter] = useUrlQueryState(
    'location',
    emptyList,
    parseList,
    serializeList,
  );
  const [approverFilter, setApproverFilter] = useUrlQueryState(
    'approver',
    emptyList,
    parseList,
    serializeList,
  );
  const [groupBy, setGroupBy] = useUrlQueryState<PeopleGroupBy>('group', 'none', parseGroupBy);
  const [sortRules, setSortRules] = useUrlQueryState<readonly PeopleSortRule[]>(
    'sort',
    defaultPeopleSort,
    parsePeopleSort,
    serializePeopleSort,
  );
  const [visibleColumns, setVisibleColumns] = useState<PeopleColumnId[]>(() =>
    readStored(VISIBLE_COLUMNS_STORAGE_KEY, parseVisiblePeopleColumns, [
      ...defaultVisiblePeopleColumns,
    ]),
  );
  const columnOrder = useStoredColumnOrder(COLUMN_ORDER_STORAGE_KEY, peopleColumnIds);
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

  const departments = useMemo(
    () =>
      [
        ...new Set(
          directory.employees
            .map(employeeDepartment)
            .filter((name): name is string => Boolean(name)),
        ),
      ].sort((left, right) => left.localeCompare(right)),
    [directory.employees],
  );
  useEffect(() => writeStored(VISIBLE_COLUMNS_STORAGE_KEY, visibleColumns), [visibleColumns]);
  useEffect(() => writeStored(DENSITY_STORAGE_KEY, density), [density]);

  const departmentOptions = useMemo(
    () =>
      facetOptions(
        directory.employees,
        (person) => ({ value: personDepartment(person) }),
        'No department',
      ),
    [directory.employees],
  );
  const designationOptions = useMemo(
    () =>
      facetOptions(
        directory.employees,
        (person) => ({ value: personDesignation(person) }),
        'No designation',
      ),
    [directory.employees],
  );
  const approverOptions = useMemo(
    () =>
      facetOptions(
        directory.employees,
        (person) => ({ value: personPrimaryApprover(person) }),
        'No leave approver',
      ),
    [directory.employees],
  );
  const locationOptions = useMemo(
    () =>
      facetOptions(
        directory.employees,
        (person) => ({ value: person.location?.id, label: person.location?.name }),
        'No location',
      ),
    [directory.employees],
  );
  const viewRows = useMemo(
    () =>
      orderPeople(
        filterPeople(directory.employees, {
          search,
          status,
          departments: departmentFilter,
          designations: designationFilter,
          locations: locationFilter,
          approvers: approverFilter,
        }),
        sortRules,
        groupBy,
      ),
    [
      approverFilter,
      departmentFilter,
      designationFilter,
      directory.employees,
      groupBy,
      locationFilter,
      search,
      sortRules,
      status,
    ],
  );
  const groupKeys = useMemo(
    () =>
      groupBy === 'none'
        ? []
        : [...new Set(viewRows.map((person) => peopleGroupFor(person, groupBy).key))],
    [groupBy, viewRows],
  );

  useEffect(
    () => setPage(0),
    [approverFilter, departmentFilter, designationFilter, groupBy, locationFilter, search, status],
  );
  useEffect(() => setCollapsedGroups(new Set()), [groupBy]);

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
      const original = formForEmployee(editing);
      await directory.update(editing.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        timezone: form.timezone,
        status: form.status,
        // HR fields are sent only when changed, so an untouched form never
        // creates an HR profile for someone who has none.
        ...(form.departmentName.trim() !== original.departmentName
          ? { departmentName: form.departmentName.trim() }
          : {}),
        ...(form.designation.trim() !== original.designation
          ? { designation: form.designation.trim() }
          : {}),
      });
      clearDraft();
      setEditing(null);
      setForm(emptyForm);
      setSuccess(`${editing.employeeCode} was updated.`);
    } catch {
      // Mutation errors are displayed above the directory.
    }
  };

  const hasFilters =
    Boolean(search) ||
    status !== 'active' ||
    departmentFilter.length > 0 ||
    designationFilter.length > 0 ||
    locationFilter.length > 0 ||
    approverFilter.length > 0 ||
    groupBy !== 'none';
  const clearFilters = () => {
    setSearch('');
    setStatus('active');
    setDepartmentFilter([]);
    setDesignationFilter([]);
    setLocationFilter([]);
    setApproverFilter([]);
    setGroupBy('none');
  };

  const allColumns: Record<
    PeopleColumnId,
    DataGridColumn<EmployeeDirectoryItemDto, PeopleColumnId>
  > = {
    employee: {
      id: 'employee',
      label: peopleColumnLabels.employee,
      sortKey: 'employee',
      minWidth: 220,
      sticky: true,
      render: (employee) => <EmployeeIdentity employee={employee} />,
    },
    code: {
      id: 'code',
      label: peopleColumnLabels.code,
      sortKey: 'code',
      minWidth: 110,
      render: (employee) => <CellText>{employee.employeeCode}</CellText>,
    },
    userId: {
      id: 'userId',
      label: peopleColumnLabels.userId,
      sortKey: 'userId',
      minWidth: 140,
      render: (employee) => <CellText>{employee.hrProfile?.userId}</CellText>,
    },
    email: {
      id: 'email',
      label: peopleColumnLabels.email,
      sortKey: 'email',
      minWidth: 230,
      render: (employee) => <CellText>{personContactEmail(employee)}</CellText>,
    },
    designation: {
      id: 'designation',
      label: peopleColumnLabels.designation,
      sortKey: 'designation',
      minWidth: 180,
      render: (employee) => <CellText>{personDesignation(employee)}</CellText>,
    },
    department: {
      id: 'department',
      label: peopleColumnLabels.department,
      sortKey: 'department',
      minWidth: 150,
      render: (employee) => <CellText>{personDepartment(employee)}</CellText>,
    },
    approver: {
      id: 'approver',
      label: peopleColumnLabels.approver,
      sortKey: 'approver',
      minWidth: 180,
      render: (employee) => <CellText>{personApprovers(employee)}</CellText>,
    },
    location: {
      id: 'location',
      label: peopleColumnLabels.location,
      sortKey: 'location',
      minWidth: 140,
      render: (employee) => <CellText>{employee.location?.name}</CellText>,
    },
    card: {
      id: 'card',
      label: peopleColumnLabels.card,
      sortKey: 'card',
      minWidth: 130,
      render: (employee) => <CellText>{employee.attendanceIdentity?.cardNumber}</CellText>,
    },
    source: {
      id: 'source',
      label: peopleColumnLabels.source,
      sortKey: 'source',
      minWidth: 140,
      render: (employee) => <CellText>{personSourceLabel(employee)}</CellText>,
    },
    status: {
      id: 'status',
      label: peopleColumnLabels.status,
      sortKey: 'status',
      width: 110,
      render: (employee) => <StatusChip status={employee.status} />,
    },
    updated: {
      id: 'updated',
      label: peopleColumnLabels.updated,
      sortKey: 'updated',
      minWidth: 150,
      render: (employee) => (
        <CellText>
          {new Date(employee.updatedAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </CellText>
      ),
    },
  };
  const orderedVisibleIds = columnOrder.order.filter(
    (id) =>
      visibleColumns.includes(id) &&
      !(groupBy === 'department' && id === 'department') &&
      !(groupBy === 'designation' && id === 'designation') &&
      !(groupBy === 'location' && id === 'location') &&
      !(groupBy === 'approver' && id === 'approver') &&
      !(groupBy === 'status' && id === 'status') &&
      !(groupBy === 'source' && id === 'source'),
  );
  const gridColumns: DataGridColumn<EmployeeDirectoryItemDto, PeopleColumnId>[] = [
    ...(orderedVisibleIds.length ? orderedVisibleIds : (['employee'] as const)).map(
      (id) => allColumns[id],
    ),
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
                  onClick={() => openEdit(employee)}
                >
                  <Pencil size={16} />
                </IconButton>
              </Tooltip>
            ),
          },
        ]
      : []),
  ];

  const moveColumn = (columnId: string, targetId: string, place: 'before' | 'after') => {
    if (columnId === 'edit' || targetId === 'edit') return;
    columnOrder.move(columnId, targetId, place);
  };

  const exportCsv = () => {
    const ids = columnOrder.order.filter((id) => visibleColumns.includes(id));
    const csv = buildPeopleExport(viewRows, ids, groupBy);
    const name = ['people', status, groupBy !== 'none' ? `by-${groupBy}` : null]
      .filter(Boolean)
      .join('-');
    downloadCsv(`${name}.csv`, csv.headers, csv.rows);
  };

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1800, mx: 'auto' }}>
      <PageHeader
        eyebrow="HR & TEAM STRUCTURE"
        title="People"
        meta={`${directory.employees.length} employees in your assigned scope`}
        action={
          <Stack direction="row" sx={{ gap: 1 }}>
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
            {directory.canCreate && (
              <Button variant="contained" startIcon={<Plus size={17} />} onClick={openCreate}>
                Add employee
              </Button>
            )}
          </Stack>
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
        <PageTabs value={status} tabs={tabs} onChange={setStatus} ariaLabel="Employment status" />
      </Box>

      <Stack direction="row" sx={{ gap: 1.25, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search name, ID, email, dept…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ width: { xs: '100%', sm: 260 }, ...fieldSx }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search people' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={15} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setSearch('')}>
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        <MultiSelectFilter
          label="Department"
          values={departmentFilter}
          options={departmentOptions}
          onChange={setDepartmentFilter}
          width={180}
          sx={fieldSx}
        />
        <MultiSelectFilter
          label="Designation"
          values={designationFilter}
          options={designationOptions}
          onChange={setDesignationFilter}
          width={180}
          sx={fieldSx}
        />
        <MultiSelectFilter
          label="Leave approver"
          values={approverFilter}
          options={approverOptions}
          onChange={setApproverFilter}
          width={190}
          sx={fieldSx}
        />
        <MultiSelectFilter
          label="Location"
          values={locationFilter}
          options={locationOptions}
          onChange={setLocationFilter}
          width={160}
          sx={fieldSx}
        />
        <TextField
          select
          size="small"
          label="Group by"
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value as PeopleGroupBy)}
          sx={{ width: 160, ...fieldSx }}
        >
          {peopleGroupOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {peopleGroupLabels[option]}
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
          columns={columnOrder.order.map((id) => ({ id, label: peopleColumnLabels[id] }))}
          visible={visibleColumns}
          onChange={setVisibleColumns}
          onReset={() => {
            setVisibleColumns([...defaultVisiblePeopleColumns]);
            columnOrder.reset();
          }}
        />
        <ToggleButtonGroup
          exclusive
          size="small"
          value={density}
          onChange={(_event, value: 'comfortable' | 'compact' | null) => value && setDensity(value)}
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
        {serializePeopleSort(sortRules) !== serializePeopleSort(defaultPeopleSort) && (
          <Button
            size="small"
            color="inherit"
            startIcon={<RotateCcw size={14} />}
            onClick={() => setSortRules(defaultPeopleSort)}
          >
            Reset sort
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        {hasFilters && (
          <Button color="inherit" size="small" startIcon={<X size={14} />} onClick={clearFilters}>
            Clear
          </Button>
        )}
        <Chip
          size="small"
          label={`${viewRows.length.toLocaleString('en-IN')} ${viewRows.length === 1 ? 'person' : 'people'}`}
          sx={{ fontWeight: 750, bgcolor: 'var(--g-accent-soft)', color: 'primary.dark' }}
        />
      </Stack>

      {directory.isLoading ? (
        <Box sx={{ minHeight: 360, display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading people" />
        </Box>
      ) : (
        <DataGrid
          ariaLabel="Employee directory"
          rows={viewRows}
          columns={gridColumns}
          getRowId={(employee) => employee.id}
          sort={sortRules}
          onSort={(key, additive) => setSortRules(nextPeopleSort(sortRules, key, additive))}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={(value) => {
            setRowsPerPage(value);
            setPage(0);
          }}
          density={density}
          emptyTitle="No employees found"
          emptyMessage="Change or clear the active directory filters."
          getRowGroup={groupBy === 'none' ? undefined : (person) => peopleGroupFor(person, groupBy)}
          collapsedGroups={collapsedGroups}
          onToggleGroup={(key) =>
            setCollapsedGroups((current) => {
              const next = new Set(current);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
          rowNoun={{ one: 'person', other: 'people' }}
          onRowClick={directory.canUpdate ? openEdit : undefined}
          onColumnMove={moveColumn}
        />
      )}

      <EmployeeDialog
        title="Add employee"
        open={createOpen}
        form={form}
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
        departments={departments}
        isUpdating={directory.isUpdating}
        showStatus
        showHrFields
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
  departments = [],
  isUpdating,
  showEmployeeCode = false,
  showStatus = false,
  showHrFields = false,
  onChange,
  onClose,
  onSubmit,
}: {
  title: string;
  open: boolean;
  form: EmployeeFormState;
  departments?: string[];
  isUpdating: boolean;
  showEmployeeCode?: boolean;
  showStatus?: boolean;
  showHrFields?: boolean;
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
            {showHrFields && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Autocomplete
                  freeSolo
                  fullWidth
                  options={departments}
                  inputValue={form.departmentName}
                  onInputChange={(_event, value) => update('departmentName', value)}
                  renderInput={(params) => <TextField {...params} label="Department" required />}
                />
                <TextField
                  fullWidth
                  label="Designation"
                  value={form.designation}
                  onChange={(event) => update('designation', event.target.value)}
                />
              </Stack>
            )}
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

function CellText({ children }: { children: string | null | undefined }) {
  return children ? (
    <Typography noWrap sx={{ fontSize: 12.5 }}>
      {children}
    </Typography>
  ) : (
    <Typography sx={{ color: 'text.disabled', fontSize: 12.5 }}>—</Typography>
  );
}

function EmployeeIdentity({ employee }: { employee: EmployeeDirectoryItemDto }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <Avatar
        sx={{
          width: 34,
          height: 34,
          bgcolor: 'var(--g-accent-soft)',
          color: 'var(--g-accent)',
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

import type { RoleCode, ScopeType, SecurityEmployeeAccessDto } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import {
  ChevronRight,
  KeyRound,
  Power,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '../components/data-view/DataTable';
import { FilterBar } from '../components/data-view/FilterBar';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { useAuth } from '../lib/auth';
import { useSecurityAdministration } from '../lib/security';
import { parseEnumValue, parseShortSearch, useUrlQueryState } from '../lib/url-query-state';

type AccessTab = 'all' | 'active' | 'disabled' | 'no_account';
type AccessSortKey = 'employee' | 'account' | 'roles' | 'last_login';
type DetailTab = 'account' | 'roles';

const accessTabs = ['all', 'active', 'disabled', 'no_account'] as const;
const accessSortKeys = ['employee', 'account', 'roles', 'last_login'] as const;
const sortDirections = ['asc', 'desc'] as const;
const pageSizes = [10, 25, 50, 100] as const;

const defaultScopes: Record<RoleCode, ScopeType> = {
  EMPLOYEE: 'self',
  REPORTING_MANAGER: 'direct_reports',
  LEAVE_APPROVER: 'self',
  SHOW_MANAGER: 'show',
  HR: 'company',
  ATTENDANCE_ADMIN: 'company',
  SYSTEM_ADMIN: 'company',
};

const scopeChoices: Record<RoleCode, ScopeType[]> = {
  EMPLOYEE: ['self'],
  REPORTING_MANAGER: ['direct_reports', 'company'],
  LEAVE_APPROVER: ['self'],
  SHOW_MANAGER: ['show', 'company'],
  HR: ['company'],
  ATTENDANCE_ADMIN: ['company'],
  SYSTEM_ADMIN: ['company'],
};

function parseAccessTab(value: string): AccessTab | null {
  return parseEnumValue(value, accessTabs);
}

function parseAccessSort(value: string): AccessSortKey | null {
  return parseEnumValue(value, accessSortKeys);
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

function parseEmployeeId(value: string): string | null {
  return value === '' || /^[a-f\d]{24}$/i.test(value) ? value : null;
}

function accountState(employee: SecurityEmployeeAccessDto): AccessTab {
  if (!employee.account) return 'no_account';
  return employee.account.status === 'active' ? 'active' : 'disabled';
}

function compareEmployees(
  left: SecurityEmployeeAccessDto,
  right: SecurityEmployeeAccessDto,
  key: AccessSortKey,
): number {
  if (key === 'account') return accountLabel(left).localeCompare(accountLabel(right));
  if (key === 'roles') {
    return (left.account?.assignments.length ?? 0) - (right.account?.assignments.length ?? 0);
  }
  if (key === 'last_login') {
    return (left.account?.lastLoginAt ?? '').localeCompare(right.account?.lastLoginAt ?? '');
  }
  return left.employeeDisplayName.localeCompare(right.employeeDisplayName, undefined, {
    numeric: true,
  });
}

function accountLabel(employee: SecurityEmployeeAccessDto): string {
  if (!employee.account) return 'No account';
  if (employee.account.status === 'active') return 'Active';
  if (employee.account.status === 'locked') return 'Locked';
  return 'Disabled';
}

function formatLastLogin(value: string | null | undefined): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

export function SecurityAdministrationSection() {
  const { user } = useAuth();
  const security = useSecurityAdministration();
  const [tab, setTab] = useUrlQueryState<AccessTab>('access', 'all', parseAccessTab);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [sortKey, setSortKey] = useUrlQueryState<AccessSortKey>(
    'sort',
    'employee',
    parseAccessSort,
  );
  const [sortDirection, setSortDirection] = useUrlQueryState<SortDirection>(
    'order',
    'asc',
    parseSortDirection,
  );
  const [pageNumber, setPageNumber] = useUrlQueryState('page', 1, parsePage);
  const [rowsPerPage, setRowsPerPage] = useUrlQueryState('size', 25, parsePageSize);
  const [selectedEmployeeId, setSelectedEmployeeId] = useUrlQueryState(
    'employee',
    '',
    parseEmployeeId,
  );
  const [detailTab, setDetailTab] = useState<DetailTab>('account');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [roleCode, setRoleCode] = useState<RoleCode>('EMPLOYEE');
  const [scopeType, setScopeType] = useState<ScopeType>('self');
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [success, setSuccess] = useState('');
  const directory = security.directory;
  const employees = directory?.employees ?? [];
  const selectedEmployee = employees.find((employee) => employee.employeeId === selectedEmployeeId);

  useEffect(() => {
    if (!security.isLoading && selectedEmployeeId && !selectedEmployee) setSelectedEmployeeId('');
  }, [security.isLoading, selectedEmployee, selectedEmployeeId, setSelectedEmployeeId]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    const direction = sortDirection === 'asc' ? 1 : -1;
    return employees
      .filter((employee) => tab === 'all' || accountState(employee) === tab)
      .filter((employee) => {
        if (!term) return true;
        return [
          employee.employeeCode,
          employee.employeeDisplayName,
          employee.employeeEmail,
          employee.biometricProfile?.departmentName ??
            employee.attendanceIdentity?.departmentName ??
            '',
          employee.attendanceIdentity?.cardNumber ?? '',
          employee.account?.email ?? '',
          ...(employee.account?.assignments.map((assignment) => assignment.roleName) ?? []),
        ].some((value) => value.toLowerCase().includes(term));
      })
      .slice()
      .sort(
        (left, right) =>
          compareEmployees(left, right, sortKey) * direction ||
          left.employeeCode.localeCompare(right.employeeCode),
      );
  }, [employees, search, sortDirection, sortKey, tab]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredEmployees.length / rowsPerPage));
    if (pageNumber > lastPage) setPageNumber(lastPage);
  }, [filteredEmployees.length, pageNumber, rowsPerPage, setPageNumber]);

  const tabDefinitions = useMemo<ReadonlyArray<PageTab<AccessTab>>>(
    () => [
      { value: 'all', label: 'All employees', count: employees.length },
      {
        value: 'active',
        label: 'Active accounts',
        count: employees.filter((employee) => accountState(employee) === 'active').length,
      },
      {
        value: 'disabled',
        label: 'Disabled / locked',
        count: employees.filter((employee) => accountState(employee) === 'disabled').length,
      },
      {
        value: 'no_account',
        label: 'No account',
        count: employees.filter((employee) => accountState(employee) === 'no_account').length,
      },
    ],
    [employees],
  );

  const scopeOptions = useMemo(() => {
    if (scopeType === 'show') return directory?.scopeOptions.shows ?? [];
    return [];
  }, [directory, scopeType]);

  const chooseEmployee = (employee: SecurityEmployeeAccessDto) => {
    security.clearError();
    setSelectedEmployeeId(employee.employeeId);
    setDetailTab('account');
    setTemporaryPassword('');
    setRoleCode('EMPLOYEE');
    setScopeType('self');
    setScopeIds([]);
    setSuccess('');
  };

  const closeDetails = () => {
    security.clearError();
    setSelectedEmployeeId('');
    setTemporaryPassword('');
    setSuccess('');
  };

  const chooseRole = (value: RoleCode) => {
    setRoleCode(value);
    setScopeType(defaultScopes[value]);
    setScopeIds([]);
  };

  const provision = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEmployee || temporaryPassword.length < 12) return;
    try {
      await security.provision({
        employeeId: selectedEmployee.employeeId,
        temporaryPassword,
      });
      setTemporaryPassword('');
      setSuccess(`Account provisioned for ${selectedEmployee.employeeCode}.`);
    } catch {
      // Mutation errors are displayed in the drawer.
    }
  };

  const assignRole = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEmployee?.account) return;
    try {
      await security.assignRole(selectedEmployee.account.userId, { roleCode, scopeType, scopeIds });
      setSuccess(`${roleCode.replaceAll('_', ' ')} access was assigned.`);
    } catch {
      // Mutation errors are displayed in the drawer.
    }
  };

  const resetPassword = async () => {
    if (!selectedEmployee?.account || temporaryPassword.length < 12) return;
    try {
      await security.updateAccount(selectedEmployee.account.userId, { temporaryPassword });
      setTemporaryPassword('');
      setSuccess(
        `Password reset for ${selectedEmployee.employeeCode}; existing sessions were revoked.`,
      );
    } catch {
      // Mutation errors are displayed in the drawer.
    }
  };

  const toggleStatus = async () => {
    if (!selectedEmployee?.account) return;
    try {
      const nextStatus = selectedEmployee.account.status === 'active' ? 'inactive' : 'active';
      await security.updateAccount(selectedEmployee.account.userId, { status: nextStatus });
      setSuccess(`Account status changed to ${nextStatus}.`);
    } catch {
      // Mutation errors are displayed in the drawer.
    }
  };

  const revoke = async (assignmentId: string) => {
    if (!selectedEmployee?.account) return;
    try {
      await security.revokeRole(selectedEmployee.account.userId, assignmentId);
      setSuccess('Role assignment revoked.');
    } catch {
      // Mutation errors are displayed in the drawer.
    }
  };

  const updateSort = (key: AccessSortKey) => {
    if (key === sortKey) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPageNumber(1);
  };

  const columns: ReadonlyArray<DataTableColumn<SecurityEmployeeAccessDto, AccessSortKey>> = [
    {
      id: 'employee',
      label: 'Employee',
      sortKey: 'employee',
      minWidth: 230,
      render: (employee) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 800 }}>
            {employee.employeeDisplayName}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
            {employee.employeeCode}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'account',
      label: 'Account',
      sortKey: 'account',
      minWidth: 210,
      render: (employee) => (
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <AccountStatusChip employee={employee} />
          <Typography noWrap sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 11.5 }}>
            {employee.account?.email ??
              (employee.employeeEmail.endsWith('@gnomon.invalid')
                ? 'No login email supplied'
                : employee.employeeEmail)}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'workbook-profile',
      label: 'Directory profile',
      minWidth: 185,
      hideBelow: 'md',
      render: (employee) => (
        <Box>
          <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 750 }}>
            {employee.biometricProfile?.departmentName ??
              employee.attendanceIdentity?.departmentName ??
              'Manual profile'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
            {employee.attendanceIdentity?.cardNumber
              ? `Card ${employee.attendanceIdentity.cardNumber}`
              : 'No card supplied'}
          </Typography>
        </Box>
      ),
    },
    {
      id: 'roles',
      label: 'Roles',
      sortKey: 'roles',
      minWidth: 220,
      hideBelow: 'sm',
      render: (employee) => {
        const assignments = employee.account?.assignments ?? [];
        return assignments.length
          ? assignments.map((assignment) => assignment.roleName).join(', ')
          : 'No roles';
      },
    },
    {
      id: 'last-login',
      label: 'Last login',
      sortKey: 'last_login',
      width: 175,
      hideBelow: 'md',
      render: (employee) => formatLastLogin(employee.account?.lastLoginAt),
    },
    {
      id: 'details',
      label: 'Manage',
      align: 'right',
      width: 76,
      render: (employee) => (
        <Tooltip title={`Manage access for ${employee.employeeDisplayName}`}>
          <IconButton
            size="small"
            aria-label={`Manage access for ${employee.employeeDisplayName}`}
            onClick={(event) => {
              event.stopPropagation();
              chooseEmployee(employee);
            }}
          >
            <ChevronRight size={17} />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  if (!security.canManage) return null;
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 850 }}>
          Access &amp; roles
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 12.5, mt: 0.5 }}>
          Login accounts and scoped system roles across the employee directory.
        </Typography>
      </Box>

      {security.error && !selectedEmployee && (
        <Alert severity="error">{security.error.message}</Alert>
      )}

      {security.isLoading ? (
        <Box sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading security administration" />
        </Box>
      ) : directory ? (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, 1fr)' },
              minHeight: 72,
              px: { xs: 1.5, sm: 2 },
              py: 1.25,
              gap: 2,
              alignItems: 'center',
              borderTop: '1px solid',
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: '#fff',
            }}
          >
            <Metric value={employees.length} label="Employees" icon={UsersRound} />
            <Metric
              value={employees.filter((employee) => employee.account).length}
              label="Login accounts"
              icon={KeyRound}
            />
            <Metric
              value={employees.filter((employee) => accountState(employee) === 'active').length}
              label="Active accounts"
              icon={ShieldCheck}
            />
            <Metric value={directory.roles.length} label="System roles" icon={ShieldCheck} />
          </Box>

          <Box>
            <PageTabs
              value={tab}
              tabs={tabDefinitions}
              onChange={(value) => {
                setTab(value);
                setPageNumber(1);
              }}
              ariaLabel="Account status"
            />
            <FilterBar
              search={search}
              onSearchChange={(value) => {
                setSearch(value);
                setPageNumber(1);
              }}
              searchLabel="Search access directory"
              resultCount={filteredEmployees.length}
              resultLabel={filteredEmployees.length === 1 ? 'employee' : 'employees'}
              hasActiveFilters={Boolean(search) || tab !== 'all'}
              onClear={() => {
                setSearch('');
                setTab('all');
                setPageNumber(1);
              }}
            />
          </Box>

          <DataTable
            ariaLabel="Access directory"
            rows={filteredEmployees}
            columns={columns}
            getRowId={(employee) => employee.employeeId}
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
            onRowClick={chooseEmployee}
            emptyTitle="No employees found"
            emptyMessage="Change the account tab or clear the directory search."
          />
        </>
      ) : null}

      <Drawer
        anchor="right"
        open={Boolean(selectedEmployee)}
        onClose={security.isUpdating ? undefined : closeDetails}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 }, maxWidth: '100vw' } } }}
      >
        {selectedEmployee && directory && (
          <Stack sx={{ minHeight: '100%' }}>
            <Stack direction="row" sx={{ minHeight: 76, px: 2.5, alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap sx={{ fontSize: 17, fontWeight: 850 }}>
                  {selectedEmployee.employeeDisplayName}
                </Typography>
                <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11 }}>
                  {selectedEmployee.employeeCode} | {selectedEmployee.employeeEmail}
                </Typography>
              </Box>
              <AccountStatusChip employee={selectedEmployee} />
              <Tooltip title="Close access details">
                <IconButton aria-label="Close access details" onClick={closeDetails}>
                  <X size={19} />
                </IconButton>
              </Tooltip>
            </Stack>
            <Divider />

            {(security.error || success) && (
              <Stack spacing={1} sx={{ px: 2.5, pt: 2 }}>
                {security.error && <Alert severity="error">{security.error.message}</Alert>}
                {success && (
                  <Alert severity="success" onClose={() => setSuccess('')}>
                    {success}
                  </Alert>
                )}
              </Stack>
            )}

            <PageTabs
              value={detailTab}
              tabs={[
                { value: 'account', label: 'Account' },
                {
                  value: 'roles',
                  label: 'Roles',
                  count: selectedEmployee.account?.assignments.length ?? 0,
                },
              ]}
              onChange={setDetailTab}
              ariaLabel="Access details"
            />

            {detailTab === 'account' ? (
              <AccountPanel
                employee={selectedEmployee}
                temporaryPassword={temporaryPassword}
                isUpdating={security.isUpdating}
                onPasswordChange={setTemporaryPassword}
                onProvision={provision}
                onResetPassword={() => void resetPassword()}
                onToggleStatus={() => void toggleStatus()}
              />
            ) : (
              <RolesPanel
                employee={selectedEmployee}
                directory={directory}
                currentUserId={user?.id}
                roleCode={roleCode}
                scopeType={scopeType}
                scopeIds={scopeIds}
                scopeOptions={scopeOptions}
                isUpdating={security.isUpdating}
                onRoleChange={chooseRole}
                onScopeTypeChange={(value) => {
                  setScopeType(value);
                  setScopeIds([]);
                }}
                onScopeIdsChange={setScopeIds}
                onAssign={assignRole}
                onRevoke={(assignmentId) => void revoke(assignmentId)}
              />
            )}
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}

function AccountPanel({
  employee,
  temporaryPassword,
  isUpdating,
  onPasswordChange,
  onProvision,
  onResetPassword,
  onToggleStatus,
}: {
  employee: SecurityEmployeeAccessDto;
  temporaryPassword: string;
  isUpdating: boolean;
  onPasswordChange: (value: string) => void;
  onProvision: (event: FormEvent) => void;
  onResetPassword: () => void;
  onToggleStatus: () => void;
}) {
  return (
    <Stack
      component="form"
      onSubmit={(event) => void onProvision(event)}
      spacing={2.5}
      sx={{ p: 2.5 }}
    >
      {employee.account && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
            pb: 2.5,
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <DetailValue label="Login email" value={employee.account.email} />
          <DetailValue label="Last login" value={formatLastLogin(employee.account.lastLoginAt)} />
        </Box>
      )}

      {!employee.account && employee.employeeStatus !== 'active' && (
        <Alert severity="warning">Inactive employees cannot receive a login account.</Alert>
      )}

      <TextField
        type="password"
        label={employee.account ? 'New temporary password' : 'Temporary password'}
        value={temporaryPassword}
        onChange={(event) => onPasswordChange(event.target.value)}
        helperText="Minimum 12 characters"
        autoComplete="new-password"
      />

      {employee.account ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<KeyRound size={16} />}
            disabled={temporaryPassword.length < 12 || isUpdating}
            onClick={onResetPassword}
          >
            Reset password
          </Button>
          <Button
            fullWidth
            color={employee.account.status === 'active' ? 'error' : 'success'}
            variant="outlined"
            startIcon={<Power size={16} />}
            disabled={isUpdating}
            onClick={onToggleStatus}
          >
            {employee.account.status === 'active' ? 'Disable account' : 'Activate account'}
          </Button>
        </Stack>
      ) : (
        <Button
          type="submit"
          variant="contained"
          startIcon={<UserPlus size={16} />}
          disabled={
            temporaryPassword.length < 12 || isUpdating || employee.employeeStatus !== 'active'
          }
        >
          Provision account
        </Button>
      )}
    </Stack>
  );
}

function RolesPanel({
  employee,
  directory,
  currentUserId,
  roleCode,
  scopeType,
  scopeIds,
  scopeOptions,
  isUpdating,
  onRoleChange,
  onScopeTypeChange,
  onScopeIdsChange,
  onAssign,
  onRevoke,
}: {
  employee: SecurityEmployeeAccessDto;
  directory: NonNullable<ReturnType<typeof useSecurityAdministration>['directory']>;
  currentUserId?: string;
  roleCode: RoleCode;
  scopeType: ScopeType;
  scopeIds: string[];
  scopeOptions: Array<{ id: string; code: string; name: string }>;
  isUpdating: boolean;
  onRoleChange: (value: RoleCode) => void;
  onScopeTypeChange: (value: ScopeType) => void;
  onScopeIdsChange: (value: string[]) => void;
  onAssign: (event: FormEvent) => void;
  onRevoke: (assignmentId: string) => void;
}) {
  if (!employee.account) {
    return (
      <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center', p: 3 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: 12.5, textAlign: 'center' }}>
          Provision a login account before assigning roles.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={3} sx={{ p: 2.5 }}>
      <Stack spacing={1}>
        {employee.account.assignments.map((assignment) => {
          const protectsCurrentAdmin =
            assignment.roleCode === 'SYSTEM_ADMIN' && employee.account?.userId === currentUserId;
          return (
            <Stack
              key={assignment.id}
              direction="row"
              sx={{
                p: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
                  {assignment.roleName}
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                  {assignment.scopeType.replaceAll('_', ' ')}
                  {assignment.scopeIds.length
                    ? ` | ${scopeLabels(assignment.scopeIds, directory)}`
                    : ''}
                </Typography>
              </Box>
              <Tooltip
                title={
                  protectsCurrentAdmin
                    ? 'You cannot revoke your own administrator role'
                    : 'Revoke role'
                }
              >
                <span>
                  <IconButton
                    aria-label={`Revoke ${assignment.roleName}`}
                    size="small"
                    color="error"
                    disabled={isUpdating || protectsCurrentAdmin}
                    onClick={() => onRevoke(assignment.id)}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          );
        })}
        {employee.account.assignments.length === 0 && (
          <Typography sx={{ py: 3, textAlign: 'center', color: 'text.secondary', fontSize: 12 }}>
            No active role assignments
          </Typography>
        )}
      </Stack>

      <Divider />

      <Stack component="form" onSubmit={(event) => void onAssign(event)} spacing={1.5}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 850 }}>Assign role</Typography>
        <FormControl size="small">
          <InputLabel id="security-role-label">Role</InputLabel>
          <Select
            labelId="security-role-label"
            label="Role"
            value={roleCode}
            onChange={(event) => onRoleChange(event.target.value as RoleCode)}
          >
            {directory.roles.map((role) => (
              <MenuItem key={role.code} value={role.code}>
                {role.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small">
          <InputLabel id="security-scope-label">Scope</InputLabel>
          <Select
            labelId="security-scope-label"
            label="Scope"
            value={scopeType}
            onChange={(event) => onScopeTypeChange(event.target.value as ScopeType)}
          >
            {scopeChoices[roleCode].map((scope) => (
              <MenuItem key={scope} value={scope}>
                {scope.replaceAll('_', ' ')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {scopeType === 'show' && (
          <FormControl size="small">
            <InputLabel id="security-scope-target-label">Scope targets</InputLabel>
            <Select
              multiple
              labelId="security-scope-target-label"
              label="Scope targets"
              value={scopeIds}
              onChange={(event) =>
                onScopeIdsChange(
                  typeof event.target.value === 'string'
                    ? event.target.value.split(',')
                    : event.target.value,
                )
              }
            >
              {scopeOptions.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.code} | {option.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <Button
          type="submit"
          variant="contained"
          startIcon={<ShieldCheck size={16} />}
          disabled={isUpdating || (scopeType === 'show' && scopeIds.length === 0)}
        >
          Assign role
        </Button>
      </Stack>
    </Stack>
  );
}

function AccountStatusChip({ employee }: { employee: SecurityEmployeeAccessDto }) {
  const label = accountLabel(employee);
  return (
    <Chip
      size="small"
      label={label}
      color={
        employee.account?.status === 'active'
          ? 'success'
          : employee.account?.status === 'locked'
            ? 'warning'
            : 'default'
      }
      variant="outlined"
    />
  );
}

function scopeLabels(
  ids: string[],
  directory: NonNullable<ReturnType<typeof useSecurityAdministration>['directory']>,
): string {
  const options = [...directory.scopeOptions.shows, ...directory.scopeOptions.locations];
  return ids
    .map((id) => options.find((option) => option.id === id)?.code ?? id.slice(-6))
    .join(', ');
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{label}</Typography>
      <Typography noWrap sx={{ mt: 0.25, fontSize: 12.5, fontWeight: 750 }}>
        {value}
      </Typography>
    </Box>
  );
}

function Metric({
  value,
  label,
  icon: Icon,
}: {
  value: number;
  label: string;
  icon: typeof UsersRound;
}) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <Icon size={18} color="#087b88" />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 18, fontWeight: 850 }}>{value}</Typography>
        <Typography noWrap sx={{ color: 'text.secondary', fontSize: 10.5 }}>
          {label}
        </Typography>
      </Box>
    </Stack>
  );
}

import type { RoleCode, ScopeType, SecurityEmployeeAccessDto } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
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
import { KeyRound, Power, ShieldCheck, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { useAuth } from '../lib/auth';
import { useSecurityAdministration } from '../lib/security';

const defaultScopes: Record<RoleCode, ScopeType> = {
  EMPLOYEE: 'self',
  REPORTING_MANAGER: 'direct_reports',
  SHOW_MANAGER: 'show',
  HR: 'company',
  ATTENDANCE_ADMIN: 'company',
  SYSTEM_ADMIN: 'company',
};

const scopeChoices: Record<RoleCode, ScopeType[]> = {
  EMPLOYEE: ['self'],
  REPORTING_MANAGER: ['direct_reports', 'company'],
  SHOW_MANAGER: ['show', 'company'],
  HR: ['company', 'location'],
  ATTENDANCE_ADMIN: ['company', 'location'],
  SYSTEM_ADMIN: ['company'],
};

export function SecurityAdministrationSection() {
  const { user } = useAuth();
  const security = useSecurityAdministration();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [roleCode, setRoleCode] = useState<RoleCode>('EMPLOYEE');
  const [scopeType, setScopeType] = useState<ScopeType>('self');
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [success, setSuccess] = useState('');
  const directory = security.directory;
  const selectedEmployee = directory?.employees.find(
    (employee) => employee.employeeId === selectedEmployeeId,
  );

  useEffect(() => {
    if (!directory?.employees.length) return;
    if (!directory.employees.some((employee) => employee.employeeId === selectedEmployeeId)) {
      setSelectedEmployeeId(directory.employees[0]!.employeeId);
    }
  }, [directory?.employees, selectedEmployeeId]);

  const scopeOptions = useMemo(() => {
    if (scopeType === 'show') return directory?.scopeOptions.shows ?? [];
    if (scopeType === 'location') return directory?.scopeOptions.locations ?? [];
    return [];
  }, [directory, scopeType]);

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
      // Mutation errors are displayed at the top of the section.
    }
  };
  const assignRole = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEmployee?.account) return;
    try {
      await security.assignRole(selectedEmployee.account.userId, { roleCode, scopeType, scopeIds });
      setSuccess(`${roleCode.replaceAll('_', ' ')} access was assigned.`);
    } catch {
      // Mutation errors are displayed at the top of the section.
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
      // Mutation errors are displayed at the top of the section.
    }
  };
  const toggleStatus = async () => {
    if (!selectedEmployee?.account) return;
    try {
      const nextStatus = selectedEmployee.account.status === 'active' ? 'inactive' : 'active';
      await security.updateAccount(selectedEmployee.account.userId, { status: nextStatus });
      setSuccess(`Account status changed to ${nextStatus}.`);
    } catch {
      // Mutation errors are displayed at the top of the section.
    }
  };
  const revoke = async (assignmentId: string) => {
    if (!selectedEmployee?.account) return;
    try {
      await security.revokeRole(selectedEmployee.account.userId, assignmentId);
      setSuccess('Role assignment revoked.');
    } catch {
      // Mutation errors are displayed at the top of the section.
    }
  };

  if (!security.canManage) return null;
  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 850 }}>
          Access &amp; roles
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 12.5, mt: 0.5 }}>
          Login accounts and scoped system roles.
        </Typography>
      </Box>
      {security.error && <Alert severity="error">{security.error.message}</Alert>}
      {success && (
        <Alert severity="success" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {security.isLoading ? (
        <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center' }}>
          <CircularProgress aria-label="Loading security administration" />
        </Box>
      ) : directory ? (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' },
              gap: 1.5,
            }}
          >
            <Metric value={directory.employees.length} label="Employees" icon={UsersRound} />
            <Metric
              value={directory.employees.filter((item) => item.account).length}
              label="Login accounts"
              icon={KeyRound}
            />
            <Metric value={directory.roles.length} label="System roles" icon={ShieldCheck} />
          </Box>

          <Card sx={{ boxShadow: 'none' }}>
            <CardContent sx={{ p: 2.5 }}>
              <FormControl fullWidth>
                <InputLabel id="security-employee-label">Employee account</InputLabel>
                <Select
                  labelId="security-employee-label"
                  label="Employee account"
                  value={selectedEmployeeId}
                  onChange={(event) => {
                    setSelectedEmployeeId(event.target.value);
                    setTemporaryPassword('');
                    setSuccess('');
                  }}
                >
                  {directory.employees.map((employee) => (
                    <MenuItem key={employee.employeeId} value={employee.employeeId}>
                      {employee.employeeCode} · {employee.employeeDisplayName}
                      {employee.account ? ` · ${employee.account.status}` : ' · no account'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </CardContent>
          </Card>

          {selectedEmployee && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
                gap: 2.5,
                alignItems: 'start',
              }}
            >
              <Card sx={{ boxShadow: 'none' }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack
                    direction="row"
                    sx={{
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 2,
                      mb: 2.5,
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 15, fontWeight: 800 }}>
                        {selectedEmployee.employeeDisplayName}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                        {selectedEmployee.employeeCode} · {selectedEmployee.employeeEmail}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={selectedEmployee.account?.status ?? 'No account'}
                      color={selectedEmployee.account?.status === 'active' ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </Stack>
                  <Stack component="form" onSubmit={(event) => void provision(event)} spacing={1.5}>
                    <TextField
                      type="password"
                      label={
                        selectedEmployee.account ? 'New temporary password' : 'Temporary password'
                      }
                      value={temporaryPassword}
                      onChange={(event) => setTemporaryPassword(event.target.value)}
                      helperText="Minimum 12 characters"
                    />
                    {selectedEmployee.account ? (
                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button
                          fullWidth
                          variant="outlined"
                          startIcon={<KeyRound size={16} />}
                          disabled={temporaryPassword.length < 12 || security.isUpdating}
                          onClick={() => void resetPassword()}
                        >
                          Reset password
                        </Button>
                        <Button
                          fullWidth
                          color={selectedEmployee.account.status === 'active' ? 'error' : 'success'}
                          variant="outlined"
                          startIcon={<Power size={16} />}
                          disabled={security.isUpdating}
                          onClick={() => void toggleStatus()}
                        >
                          {selectedEmployee.account.status === 'active'
                            ? 'Disable account'
                            : 'Activate account'}
                        </Button>
                      </Stack>
                    ) : (
                      <Button
                        type="submit"
                        variant="contained"
                        startIcon={<UserPlus size={16} />}
                        disabled={
                          temporaryPassword.length < 12 ||
                          security.isUpdating ||
                          selectedEmployee.employeeStatus !== 'active'
                        }
                      >
                        Provision account
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              <Card sx={{ boxShadow: 'none' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, mb: 2 }}>
                    Scoped roles
                  </Typography>
                  {selectedEmployee.account ? (
                    <>
                      <Stack spacing={1} sx={{ mb: 2.5 }}>
                        {selectedEmployee.account.assignments.map((assignment) => (
                          <Stack
                            key={assignment.id}
                            direction="row"
                            sx={{
                              p: 1.25,
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: 2,
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: 12.5, fontWeight: 750 }}>
                                {assignment.roleName}
                              </Typography>
                              <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>
                                {assignment.scopeType.replaceAll('_', ' ')}
                                {assignment.scopeIds.length
                                  ? ` · ${scopeLabels(assignment.scopeIds, directory)}`
                                  : ''}
                              </Typography>
                            </Box>
                            <Tooltip
                              title={
                                assignment.roleCode === 'SYSTEM_ADMIN' &&
                                selectedEmployee.account?.userId === user?.id
                                  ? 'You cannot revoke your own administrator role'
                                  : 'Revoke role'
                              }
                            >
                              <IconButton
                                aria-label={`Revoke ${assignment.roleName}`}
                                size="small"
                                color="error"
                                disabled={
                                  security.isUpdating ||
                                  (assignment.roleCode === 'SYSTEM_ADMIN' &&
                                    selectedEmployee.account?.userId === user?.id)
                                }
                                onClick={() => void revoke(assignment.id)}
                              >
                                <Trash2 size={15} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        ))}
                        {selectedEmployee.account.assignments.length === 0 && (
                          <Typography
                            sx={{
                              py: 2,
                              textAlign: 'center',
                              fontSize: 12,
                              color: 'text.secondary',
                            }}
                          >
                            No active role assignments
                          </Typography>
                        )}
                      </Stack>
                      <Stack
                        component="form"
                        onSubmit={(event) => void assignRole(event)}
                        spacing={1.5}
                      >
                        <FormControl size="small">
                          <InputLabel id="security-role-label">Role</InputLabel>
                          <Select
                            labelId="security-role-label"
                            label="Role"
                            value={roleCode}
                            onChange={(event) => chooseRole(event.target.value as RoleCode)}
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
                            onChange={(event) => {
                              setScopeType(event.target.value as ScopeType);
                              setScopeIds([]);
                            }}
                          >
                            {scopeChoices[roleCode].map((scope) => (
                              <MenuItem key={scope} value={scope}>
                                {scope.replaceAll('_', ' ')}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        {(scopeType === 'show' || scopeType === 'location') && (
                          <FormControl size="small">
                            <InputLabel id="security-scope-target-label">Scope targets</InputLabel>
                            <Select
                              multiple
                              labelId="security-scope-target-label"
                              label="Scope targets"
                              value={scopeIds}
                              onChange={(event) =>
                                setScopeIds(
                                  typeof event.target.value === 'string'
                                    ? event.target.value.split(',')
                                    : event.target.value,
                                )
                              }
                            >
                              {scopeOptions.map((option) => (
                                <MenuItem key={option.id} value={option.id}>
                                  {option.code} · {option.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                        <Button
                          type="submit"
                          variant="contained"
                          startIcon={<ShieldCheck size={16} />}
                          disabled={
                            security.isUpdating ||
                            ((scopeType === 'show' || scopeType === 'location') &&
                              scopeIds.length === 0)
                          }
                        >
                          Assign role
                        </Button>
                      </Stack>
                    </>
                  ) : (
                    <Typography
                      sx={{ py: 5, textAlign: 'center', fontSize: 12, color: 'text.secondary' }}
                    >
                      Provision a login account before assigning roles.
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Box>
          )}
        </>
      ) : null}
    </Stack>
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
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25 }}>
          <Icon size={18} color="#087b88" />
          <Box>
            <Typography sx={{ fontSize: 20, fontWeight: 850 }}>{value}</Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>{label}</Typography>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

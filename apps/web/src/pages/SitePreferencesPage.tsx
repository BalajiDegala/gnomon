import type {
  ApprovalEmployeeOption,
  DepartmentApprovalPolicyDto,
  UpdateDepartmentApprovalPolicyRequest,
} from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Save, UploadCloud, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { useApprovalPreferences } from '../lib/approval-preferences';

interface PolicyForm {
  approvalSteps: 1 | 2;
  approver1EmployeeId: string;
  approver2EmployeeIds: string[];
  emailTriggers: string;
}

function formFromPolicy(policy: DepartmentApprovalPolicyDto): PolicyForm {
  return {
    approvalSteps: policy.approvalSteps,
    approver1EmployeeId: policy.approver1?.id ?? '',
    approver2EmployeeIds: policy.approver2s.map((approver) => approver.id),
    emailTriggers: policy.emailTriggers.join(', '),
  };
}

function parseEmails(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function SitePreferencesPage() {
  const preferences = useApprovalPreferences();
  const [file, setFile] = useState<File | null>(null);
  const [approvalFile, setApprovalFile] = useState<File | null>(null);
  const [forms, setForms] = useState<Record<string, PolicyForm>>({});
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!preferences.preferences) return;
    setForms(
      Object.fromEntries(
        preferences.preferences.policies.map((policy) => [policy.id, formFromPolicy(policy)]),
      ),
    );
  }, [preferences.preferences]);

  const employeeOptions = preferences.preferences?.employeeOptions ?? [];
  const byDepartment = useMemo(() => {
    const grouped = new Map<string, ApprovalEmployeeOption[]>();
    for (const employee of employeeOptions) {
      const key = employee.departmentName ?? '';
      grouped.set(key, [...(grouped.get(key) ?? []), employee]);
    }
    return grouped;
  }, [employeeOptions]);
  const orderedOptions = (departmentName: string) => [
    ...(byDepartment.get(departmentName) ?? []),
    ...employeeOptions.filter((employee) => employee.departmentName !== departmentName),
  ];

  const importUsers = async () => {
    if (!file) return;
    try {
      const result = await preferences.upload(file);
      setSuccess(
        `${result.importedRows} users imported; ${result.attendanceIdentitiesLinked} linked to existing door identities.`,
      );
      setFile(null);
    } catch {
      // The shared error alert displays request failures.
    }
  };

  const importApprovalRoutes = async () => {
    if (!approvalFile) return;
    try {
      const result = await preferences.uploadApprovalRoutes(approvalFile);
      setSuccess(
        `${result.departmentsUpdated} department routes updated with ${result.secondApproversResolved} second approvers.`,
      );
      setApprovalFile(null);
    } catch {
      // The shared error alert displays request failures.
    }
  };

  const savePolicy = async (policy: DepartmentApprovalPolicyDto) => {
    const form = forms[policy.id];
    if (!form?.approver1EmployeeId) return;
    const input: UpdateDepartmentApprovalPolicyRequest = {
      approvalSteps: form.approvalSteps,
      approver1EmployeeId: form.approver1EmployeeId,
      approver2EmployeeIds: form.approvalSteps === 2 ? form.approver2EmployeeIds : [],
      emailTriggers: parseEmails(form.emailTriggers),
    };
    try {
      await preferences.update(policy.id, input);
      setSuccess(`${policy.departmentName} approval route saved.`);
    } catch {
      // The shared error alert displays request failures.
    }
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography sx={{ fontSize: 18, fontWeight: 850 }}>Site preferences</Typography>
        <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 12.5 }}>
          Keep the employee directory synchronized with users.csv and choose one or two leave
          approval stages for every department.
        </Typography>
      </Box>

      {preferences.error && (
        <Alert severity="error">
          {preferences.error instanceof Error ? preferences.error.message : 'The request failed.'}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {preferences.canImport && (
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', gap: 2 }}
            >
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 800 }}>User directory CSV</Typography>
                <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11.5 }}>
                  Exact columns: Emp ID, User ID, Mail ID, Emp name, New Designation, Dept, Leave
                  Approver 1, Leave Approver 2, Email Triggers.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
                <Button component="label" variant="outlined" startIcon={<UploadCloud size={16} />}>
                  {file?.name ?? 'Choose users.csv'}
                  <input
                    hidden
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </Button>
                <Button
                  variant="contained"
                  disabled={!file || preferences.isUploading}
                  startIcon={
                    preferences.isUploading ? (
                      <CircularProgress size={15} color="inherit" />
                    ) : (
                      <UsersRound size={16} />
                    )
                  }
                  onClick={() => void importUsers()}
                >
                  {preferences.isUploading ? 'Importing…' : 'Update directory'}
                </Button>
              </Stack>
            </Stack>
            {preferences.importResult && (
              <Alert
                severity={
                  preferences.importResult.unresolvedApproverNames.length > 0 ? 'warning' : 'info'
                }
                sx={{ mt: 2 }}
              >
                {preferences.importResult.createdEmployees} added,{' '}
                {preferences.importResult.updatedEmployees} updated,{' '}
                {preferences.importResult.usersWithoutAttendanceIdentity} without a door identity.
                {preferences.importResult.unresolvedApproverNames.length > 0 &&
                  ` Approver names requiring setup: ${preferences.importResult.unresolvedApproverNames.join(', ')}.`}
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {preferences.canImport && (
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', gap: 2 }}
            >
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 800 }}>
                  Leave approval routes CSV
                </Typography>
                <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11.5 }}>
                  Upload approvals.csv to apply artist first approvals and any-of second-approver
                  pools. Support rows remain governed by each employee's users.csv reporting route.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
                <Button component="label" variant="outlined" startIcon={<UploadCloud size={16} />}>
                  {approvalFile?.name ?? 'Choose approvals.csv'}
                  <input
                    hidden
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => setApprovalFile(event.target.files?.[0] ?? null)}
                  />
                </Button>
                <Button
                  variant="contained"
                  disabled={!approvalFile || preferences.isUploadingApprovalRoutes}
                  startIcon={
                    preferences.isUploadingApprovalRoutes ? (
                      <CircularProgress size={15} color="inherit" />
                    ) : (
                      <UsersRound size={16} />
                    )
                  }
                  onClick={() => void importApprovalRoutes()}
                >
                  {preferences.isUploadingApprovalRoutes ? 'Importing…' : 'Update routes'}
                </Button>
              </Stack>
            </Stack>
            {preferences.approvalRouteImportResult && (
              <Alert
                severity={
                  preferences.approvalRouteImportResult.unresolvedApproverNames.length > 0 ||
                  preferences.approvalRouteImportResult.warnings.length > 0
                    ? 'warning'
                    : 'info'
                }
                sx={{ mt: 2 }}
              >
                {preferences.approvalRouteImportResult.twoStageDepartments} two-stage departments,{' '}
                {preferences.approvalRouteImportResult.secondApproversResolved} second approvers.
                {preferences.approvalRouteImportResult.unresolvedApproverNames.length > 0 &&
                  ` Unresolved names: ${preferences.approvalRouteImportResult.unresolvedApproverNames.join(', ')}.`}
                {preferences.approvalRouteImportResult.warnings.length > 0 &&
                  ` ${preferences.approvalRouteImportResult.warnings.join(' ')}`}
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Department approvals</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
            Select one or two stages per department. If stage 2 has several people, any one person
            in that pool can complete the second approval.
          </Typography>
        </Box>
        <Chip
          size="small"
          label={`${preferences.preferences?.policies.length ?? 0} departments`}
          variant="outlined"
        />
      </Stack>

      {preferences.isLoading ? (
        <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', xl: 'repeat(2, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          {(preferences.preferences?.policies ?? []).map((policy) => {
            const form = forms[policy.id] ?? formFromPolicy(policy);
            const unresolved = !policy.approver1;
            const sameApprover =
              form.approvalSteps === 2 &&
              Boolean(form.approver1EmployeeId) &&
              form.approver2EmployeeIds.includes(form.approver1EmployeeId);
            const canSave =
              Boolean(form.approver1EmployeeId) &&
              (form.approvalSteps === 1 || form.approver2EmployeeIds.length > 0) &&
              !sameApprover;
            const routeApproverIds = [
              form.approver1EmployeeId,
              ...(form.approvalSteps === 2 ? form.approver2EmployeeIds : []),
            ].filter(Boolean);
            const approversWithoutAccess = employeeOptions.filter(
              (employee) => routeApproverIds.includes(employee.id) && !employee.canApproveLeave,
            );
            const updateForm = (change: Partial<PolicyForm>) =>
              setForms((current) => ({
                ...current,
                [policy.id]: { ...form, ...change },
              }));
            return (
              <Card key={policy.id} sx={{ boxShadow: 'none' }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                    <Box>
                      <Typography sx={{ fontSize: 14, fontWeight: 850 }}>
                        {policy.departmentName}
                      </Typography>
                      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                        {policy.employeeCount} employees · imported approver:{' '}
                        {policy.importedApprover1Name ?? 'none'}
                      </Typography>
                    </Box>
                    <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
                      {unresolved && <Chip size="small" color="warning" label="Needs approver" />}
                      {approversWithoutAccess.length > 0 && (
                        <Chip size="small" color="warning" label="Approval access needed" />
                      )}
                    </Stack>
                  </Stack>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '140px minmax(0, 1fr)' },
                      gap: 1.5,
                      mt: 2,
                    }}
                  >
                    <FormControl size="small">
                      <InputLabel id={`${policy.id}-steps`}>Approval stages</InputLabel>
                      <Select
                        labelId={`${policy.id}-steps`}
                        label="Approval stages"
                        value={form.approvalSteps}
                        onChange={(event) =>
                          updateForm({ approvalSteps: Number(event.target.value) as 1 | 2 })
                        }
                      >
                        <MenuItem value={1}>1 approval</MenuItem>
                        <MenuItem value={2}>2 approvals</MenuItem>
                      </Select>
                    </FormControl>
                    <ApproverSelect
                      label="Approver 1"
                      value={form.approver1EmployeeId}
                      options={orderedOptions(policy.departmentName)}
                      onChange={(value) => updateForm({ approver1EmployeeId: value })}
                    />
                    {form.approvalSteps === 2 && (
                      <Box sx={{ gridColumn: { sm: '2' } }}>
                        <ApproverMultiSelect
                          label="Approver 2 pool"
                          values={form.approver2EmployeeIds}
                          options={orderedOptions(policy.departmentName)}
                          onChange={(values) => updateForm({ approver2EmployeeIds: values })}
                        />
                      </Box>
                    )}
                    <TextField
                      size="small"
                      label="Email Triggers (comma separated)"
                      value={form.emailTriggers}
                      onChange={(event) => updateForm({ emailTriggers: event.target.value })}
                      sx={{ gridColumn: { sm: '1 / -1' } }}
                    />
                  </Box>
                  {sameApprover && (
                    <Typography sx={{ mt: 1, color: 'error.main', fontSize: 11 }}>
                      Approver 1 cannot also be in the Approver 2 pool.
                    </Typography>
                  )}
                  {approversWithoutAccess.length > 0 && (
                    <Typography sx={{ mt: 1, color: 'warning.dark', fontSize: 11 }}>
                      Provision an active account and leave-approval role in Access & Roles for:{' '}
                      {approversWithoutAccess.map((employee) => employee.displayName).join(', ')}.
                    </Typography>
                  )}
                  <Stack direction="row" sx={{ justifyContent: 'flex-end', mt: 1.5 }}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!canSave || preferences.isSaving}
                      startIcon={
                        preferences.savingPolicyId === policy.id ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <Save size={15} />
                        )
                      }
                      onClick={() => void savePolicy(policy)}
                    >
                      Save route
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}

function ApproverMultiSelect({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: ApprovalEmployeeOption[];
  onChange: (values: string[]) => void;
}) {
  const byId = new Map(options.map((employee) => [employee.id, employee]));
  const id = `${label.toLowerCase().replaceAll(' ', '-')}-select`;
  return (
    <FormControl fullWidth size="small">
      <InputLabel id={id}>{label}</InputLabel>
      <Select
        multiple
        labelId={id}
        label={label}
        value={values}
        onChange={(event) =>
          onChange(
            typeof event.target.value === 'string'
              ? event.target.value.split(',')
              : event.target.value,
          )
        }
        renderValue={(selected) =>
          selected.map((employeeId) => byId.get(employeeId)?.displayName ?? employeeId).join(', ')
        }
      >
        {options.map((employee) => (
          <MenuItem key={employee.id} value={employee.id}>
            <Checkbox checked={values.includes(employee.id)} />
            <ListItemText
              primary={`${employee.displayName} · ${employee.employeeCode}`}
              secondary={
                employee.canApproveLeave
                  ? (employee.departmentName ?? undefined)
                  : `${employee.departmentName ?? 'No department'} · approval access not configured`
              }
            />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function ApproverSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ApprovalEmployeeOption[];
  onChange: (value: string) => void;
}) {
  const id = `${label.toLowerCase().replaceAll(' ', '-')}-${value || 'empty'}`;
  return (
    <FormControl fullWidth size="small">
      <InputLabel id={id}>{label}</InputLabel>
      <Select
        labelId={id}
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <MenuItem value="">Select a person</MenuItem>
        {options.map((employee) => (
          <MenuItem key={employee.id} value={employee.id}>
            {employee.displayName} · {employee.employeeCode}
            {!employee.canApproveLeave ? ' · access needed' : ''}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

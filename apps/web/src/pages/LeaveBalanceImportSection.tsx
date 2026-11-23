import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { CalendarCheck, UploadCloud } from 'lucide-react';
import { useState } from 'react';

import { useLeaveBalanceImport } from '../lib/approval-preferences';

const MAX_LISTED = 12;

function listSome(values: string[]): string {
  const shown = values.slice(0, MAX_LISTED).join(', ');
  return values.length > MAX_LISTED ? `${shown} and ${values.length - MAX_LISTED} more` : shown;
}

export function LeaveBalanceImportSection({ onSaved }: { onSaved: (message: string) => void }) {
  const leaveBalances = useLeaveBalanceImport();
  const [file, setFile] = useState<File | null>(null);

  if (!leaveBalances.canImport) return null;

  const importBalances = async () => {
    if (!file) return;
    try {
      const result = await leaveBalances.upload(file);
      if (result.balancesWritten > 0) {
        onSaved(
          `${result.balancesWritten} leave balances updated for ${result.employeesUpdated} employees (${result.format} sheet, ${result.year}).`,
        );
      }
      setFile(null);
    } catch {
      // Shown by the error alert below.
    }
  };

  const result = leaveBalances.result;
  const ignored = result ? Object.entries(result.ignoredLeaveTypes) : [];
  const hasWarnings =
    result &&
    (result.balancesWritten === 0 ||
      result.unmatchedEmployeeCodes.length > 0 ||
      result.errors.length > 0);

  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', gap: 2 }}
        >
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Leave balances workbook</Typography>
            <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11.5 }}>
              Upload the HRMS permanent-employee leave summary (Employee ID, Leave Type, Leaves
              Available) or the contract sheet (Consultant Id, Closing Balance Leaves). Each
              user&apos;s leave page then shows these balances; leave applied afterwards is deducted
              from them.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
            <Button component="label" variant="outlined" startIcon={<UploadCloud size={16} />}>
              {file?.name ?? 'Choose .xlsx'}
              <input
                hidden
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
            </Button>
            <Button
              variant="contained"
              disabled={!file || leaveBalances.isUploading}
              startIcon={
                leaveBalances.isUploading ? (
                  <CircularProgress size={15} color="inherit" />
                ) : (
                  <CalendarCheck size={16} />
                )
              }
              onClick={() => void importBalances()}
            >
              {leaveBalances.isUploading ? 'Importing…' : 'Update balances'}
            </Button>
          </Stack>
        </Stack>
        {leaveBalances.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {leaveBalances.error instanceof Error
              ? leaveBalances.error.message
              : 'The leave balance import failed.'}
          </Alert>
        )}
        {result && (
          <Alert severity={hasWarnings ? 'warning' : 'info'} sx={{ mt: 2 }}>
            {result.fileName}: {result.totalRows} rows read, {result.balancesWritten} balances
            written for {result.employeesUpdated} employees ({result.year}
            {result.asOfLabel ? ` · ${result.asOfLabel}` : ''}).
            {ignored.length > 0 &&
              ` Not tracked in Gnomon: ${ignored.map(([type, count]) => `${type} (${count})`).join(', ')}.`}
            {result.unmatchedEmployeeCodes.length > 0 &&
              ` No matching user for: ${listSome(result.unmatchedEmployeeCodes)}.`}
            {result.errors.length > 0 &&
              ` Skipped rows: ${listSome(
                result.errors.map(
                  (error) =>
                    `row ${error.rowNumber}${error.employeeCode ? ` ${error.employeeCode}` : ''} – ${error.reason}`,
                ),
              )}.`}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

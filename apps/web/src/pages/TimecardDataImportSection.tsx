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
import { Clock3, UploadCloud } from 'lucide-react';
import { useState } from 'react';

import { useTimecardDataImport } from '../lib/approval-preferences';

const MAX_LISTED = 10;

function listSome(values: string[]): string {
  const shown = values.slice(0, MAX_LISTED).join(', ');
  return values.length > MAX_LISTED ? `${shown} and ${values.length - MAX_LISTED} more` : shown;
}

/** Upload timecard records exported from the other timecard application (JSON). */
export function TimecardDataImportSection({ onSaved }: { onSaved: (message: string) => void }) {
  const timecards = useTimecardDataImport();
  const [file, setFile] = useState<File | null>(null);

  if (!timecards.canImport) return null;

  const importTimecards = async () => {
    if (!file) return;
    try {
      const result = await timecards.upload(file);
      if (result.importedRecords > 0) {
        onSaved(
          `${result.importedRecords} timecard records imported (${result.sessionsCreated} new, ${result.sessionsUpdated} updated) with ${result.timesheetEntries} timesheet entries.`,
        );
      }
      setFile(null);
    } catch {
      // Shown by the error alert below.
    }
  };

  const result = timecards.result;
  const hasWarnings =
    result &&
    (result.importedRecords === 0 ||
      result.unmatchedLogins.length > 0 ||
      result.errors.length > 0 ||
      result.openSessions > 0);

  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between', gap: 2 }}
        >
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Timecard data (JSON)</Typography>
            <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11.5 }}>
              Import days recorded in the other timecard application (login, date, project, task,
              start_time, stop_time, work_time). Each record becomes that day&apos;s timecard
              session (India time) and one timesheet entry per project. Uploading the same file
              again updates what it imported before.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
            <Button component="label" variant="outlined" startIcon={<UploadCloud size={16} />}>
              {file?.name ?? 'Choose .json'}
              <input
                hidden
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  event.target.value = '';
                }}
              />
            </Button>
            <Button
              variant="contained"
              disabled={!file || timecards.isUploading}
              startIcon={
                timecards.isUploading ? (
                  <CircularProgress size={15} color="inherit" />
                ) : (
                  <Clock3 size={16} />
                )
              }
              onClick={() => void importTimecards()}
            >
              {timecards.isUploading ? 'Importing…' : 'Import timecards'}
            </Button>
          </Stack>
        </Stack>
        {timecards.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {timecards.error instanceof Error
              ? timecards.error.message
              : 'The timecard import failed.'}
          </Alert>
        )}
        {result && (
          <Alert severity={hasWarnings ? 'warning' : 'info'} sx={{ mt: 2 }}>
            {result.fileName}: {result.importedRecords} of {result.totalRecords} records imported (
            {result.sessionsCreated} new, {result.sessionsUpdated} updated sessions;{' '}
            {result.timesheetEntries} timesheet entries).
            {result.openSessions > 0 &&
              ` ${result.openSessions} still "Working" in the source: imported as unfinished days that need regularisation.`}
            {result.showsCreated.length > 0 &&
              ` New shows created: ${listSome(result.showsCreated)}.`}
            {result.unmatchedLogins.length > 0 &&
              ` No matching user for: ${listSome(result.unmatchedLogins)}.`}
            {result.errors.length > 0 &&
              ` Notes: ${listSome(
                result.errors.map(
                  (error) =>
                    `record ${error.rowNumber}${error.login ? ` (${error.login})` : ''} – ${error.reason}`,
                ),
              )}.`}
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

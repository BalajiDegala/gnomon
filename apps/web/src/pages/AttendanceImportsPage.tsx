import type {
  AttendanceImportSource,
  ImportBatchDto,
  AttendanceChangePreview,
} from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  DatabaseZap,
  Download,
  FileCheck2,
  Fingerprint,
  History,
  RefreshCw,
  UploadCloud,
  Trash2,
} from 'lucide-react';
import { useState, type DragEvent } from 'react';

import {
  downloadAttendanceTemplate,
  useAttendanceImports,
  type AttendanceUploadFormat,
  type AttendanceChangeInput,
} from '../lib/imports';

interface AttendanceImportsPageProps {
  onBack?: () => void;
  embedded?: boolean;
}

const requiredColumns = ['employee_code', 'occurred_at', 'event_type'];
const optionalColumns = ['source_event_id', 'device_id', 'device_name'];

function formatBatchDate(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

function sourceLabel(source: AttendanceImportSource): string {
  return source === 'biometric' ? 'Biometric' : 'Access card';
}

function uploadFormatLabel(format: AttendanceUploadFormat): string {
  if (format === 'door_workbook') return 'Door access workbook';
  return format === 'biometric' ? 'Biometric CSV' : 'Access-card CSV';
}

function statusColor(status: ImportBatchDto['status']): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'failed') return 'error';
  return 'info';
}

export function AttendanceImportsPage({ onBack, embedded = false }: AttendanceImportsPageProps) {
  const imports = useAttendanceImports();
  const [format, setFormat] = useState<AttendanceUploadFormat>('biometric');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [pendingChange, setPendingChange] = useState<{
    input: AttendanceChangeInput;
    preview: AttendanceChangePreview;
  } | null>(null);
  const busy = imports.isUploading || imports.isPreviewing || imports.isChanging;
  const isDoorWorkbook = format === 'door_workbook';

  const reviewChange = async (input: AttendanceChangeInput) => {
    try {
      const preview = await imports.previewChange(input);
      setReason('');
      setPendingChange({ input, preview });
    } catch {
      /* The mutation error is displayed below. */
    }
  };

  const confirmChange = async () => {
    if (!pendingChange) return;
    try {
      await imports.applyChange(pendingChange.input, {
        previewToken: pendingChange.preview.previewToken,
        reason,
      });
      setPendingChange(null);
    } catch {
      /* Keep the preview open when the operation fails. */
    }
  };

  const submitUpload = async () => {
    if (!file) return;
    if (mode === 'replace') {
      await reviewChange({ kind: 'replace', format, file, period: { from, to } });
    } else {
      try {
        await imports.upload(format, file);
      } catch {
        /* Displayed by uploadError. */
      }
    }
  };

  const acceptFile = (candidate?: File) => {
    if (candidate && !busy) setFile(candidate);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  };

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1280, mx: 'auto' }}>
      <Box>
        {!embedded && onBack && (
          <Button
            color="inherit"
            startIcon={<ArrowLeft size={16} />}
            onClick={onBack}
            sx={{ mb: 2 }}
          >
            Back to overview
          </Button>
        )}
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          ATTENDANCE ADMINISTRATION
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Attendance imports
        </Typography>
        <Typography sx={{ maxWidth: 760, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Add attendance punches, replace a source for a work-date range, or delete an import from
          history. Changes recalculate daily attendance and retain the original evidence for audit.
        </Typography>
      </Box>

      {!imports.canImport && (
        <Alert severity="warning">Your account does not have attendance import permission.</Alert>
      )}
      {imports.uploadError && <Alert severity="error">{imports.uploadError.message}</Alert>}
      {imports.historyError && <Alert severity="error">{imports.historyError.message}</Alert>}
      {imports.changeError && !pendingChange && (
        <Alert severity="error">{imports.changeError.message}</Alert>
      )}
      {imports.changeResult && (
        <Alert severity="success">
          {imports.changeResult.removedEvents} punches removed from active attendance;{' '}
          {imports.changeResult.reconciledTimecards} daily timecards recalculated.
          {imports.changeResult.batch &&
            ` ${imports.changeResult.batch.successfulRows} replacement punches imported.`}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.2fr) minmax(320px, .8fr)' },
          gap: 2.5,
        }}
      >
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}
            >
              <Box>
                <Typography sx={{ fontSize: 16, fontWeight: 800 }}>
                  New attendance import
                </Typography>
                <Typography sx={{ mt: 0.3, color: 'text.secondary', fontSize: 12 }}>
                  {isDoorWorkbook
                    ? 'Maximum 10 MB and 250,000 door transactions per workbook.'
                    : 'Maximum 5 MB and 20,000 attendance rows per CSV file.'}
                </Typography>
                {format === 'biometric' && (
                  <Typography sx={{ mt: 0.5, color: 'text.secondary', fontSize: 12 }}>
                    Missing employees are added from the file's employee code and name. Login access
                    is managed separately.
                  </Typography>
                )}
              </Box>
              {!isDoorWorkbook && (
                <Button
                  variant="outlined"
                  startIcon={<Download size={16} />}
                  onClick={() => downloadAttendanceTemplate(format)}
                >
                  Download template
                </Button>
              )}
            </Stack>

            <FormControl fullWidth sx={{ mt: 3 }} disabled={busy}>
              <InputLabel id="attendance-source-label">File type</InputLabel>
              <Select
                labelId="attendance-source-label"
                label="File type"
                value={format}
                onChange={(event) => {
                  setFormat(event.target.value as AttendanceUploadFormat);
                  setFile(null);
                }}
              >
                <MenuItem value="biometric">Biometric CSV</MenuItem>
                <MenuItem value="access_card">Access-card CSV</MenuItem>
                <MenuItem value="door_workbook">Door access workbook</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mt: 2 }} disabled={busy}>
              <InputLabel id="attendance-action-label">Upload action</InputLabel>
              <Select
                labelId="attendance-action-label"
                label="Upload action"
                value={mode}
                onChange={(event) => setMode(event.target.value as 'add' | 'replace')}
              >
                <MenuItem value="add">Add new punches</MenuItem>
                <MenuItem value="replace">Replace attendance for a period</MenuItem>
              </Select>
            </FormControl>
            {mode === 'replace' && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                <Alert severity="warning">
                  Replaces all {format === 'biometric' ? 'biometric' : 'access-card'} punches for
                  every employee in this work-date range, including punches from other uploads.
                  Upload the complete corrected data for this source and period. Punches omitted
                  from the new file will be removed. Other attendance sources are kept.
                </Alert>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    label="First work date"
                    type="date"
                    value={from}
                    disabled={busy}
                    slotProps={{ inputLabel: { shrink: true } }}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                  <TextField
                    fullWidth
                    label="Last work date"
                    type="date"
                    value={to}
                    disabled={busy}
                    slotProps={{ inputLabel: { shrink: true } }}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </Stack>
              </Stack>
            )}

            <Box
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
              sx={{
                mt: 2.5,
                minHeight: 220,
                px: 2,
                display: 'grid',
                placeItems: 'center',
                textAlign: 'center',
                border: '1.5px dashed',
                borderColor: isDragging ? 'primary.main' : file ? '#5bbf91' : 'divider',
                borderRadius: 3,
                bgcolor: isDragging ? '#edf9fa' : file ? '#f4fbf7' : '#fafbfd',
                transition: 'all .16s ease',
              }}
            >
              <Box>
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    mx: 'auto',
                    mb: 1.5,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 3,
                    bgcolor: file ? '#e2f5ea' : '#e8f6f8',
                    color: file ? '#26855c' : '#147f8d',
                  }}
                >
                  {file ? <FileCheck2 size={24} /> : <UploadCloud size={25} />}
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
                  {file ? file.name : `Drop a ${isDoorWorkbook ? 'workbook' : 'CSV file'} here`}
                </Typography>
                <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 11.5 }}>
                  {file ? `${(file.size / 1024).toFixed(1)} KB selected` : 'or choose it here'}
                </Typography>
                <Button component="label" size="small" variant="text" sx={{ mt: 1 }}>
                  {file
                    ? 'Choose another file'
                    : `Choose ${isDoorWorkbook ? 'workbook' : 'CSV file'}`}
                  <input
                    hidden
                    type="file"
                    accept={
                      isDoorWorkbook
                        ? '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                        : '.csv,text/csv'
                    }
                    onChange={(event) => acceptFile(event.target.files?.[0])}
                  />
                </Button>
              </Box>
            </Box>

            {isDoorWorkbook ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                Uses successful card swipes from NORTH/SOUTH ZONE ENTRY only. The earliest In and
                latest Out per employee workday become attendance; passage and intermediate swipes
                are ignored.
              </Alert>
            ) : format === 'biometric' ? (
              <Stack spacing={1.25} sx={{ mt: 2 }}>
                <Alert severity="info">
                  Accepts event CSVs and monthly biometric summaries with Date, Employee Code, In
                  Time, and Out Time. Empty Absent and WeeklyOff rows are ignored automatically.
                </Alert>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {['Date', 'Employee Code', 'In Time', 'Out Time'].map((column) => (
                    <Chip
                      key={column}
                      size="small"
                      color="primary"
                      label={column}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Stack>
            ) : (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 2 }}>
                {requiredColumns.map((column) => (
                  <Chip
                    key={column}
                    size="small"
                    color="primary"
                    label={column}
                    variant="outlined"
                  />
                ))}
                {optionalColumns.map((column) => (
                  <Chip
                    key={column}
                    size="small"
                    label={`${column} · optional`}
                    variant="outlined"
                  />
                ))}
              </Stack>
            )}

            <Button
              fullWidth
              size="large"
              variant="contained"
              disabled={
                !file ||
                !imports.canImport ||
                busy ||
                (mode === 'replace' && (!from || !to || from > to))
              }
              startIcon={
                busy ? <CircularProgress size={17} color="inherit" /> : <DatabaseZap size={18} />
              }
              onClick={() => void submitUpload()}
              sx={{ mt: 3, py: 1.35 }}
            >
              {busy
                ? 'Validating and importing…'
                : mode === 'replace'
                  ? 'Preview replacement'
                  : `Import ${uploadFormatLabel(format)}`}
            </Button>
          </CardContent>
        </Card>

        <Stack spacing={2.5}>
          <ImportResult
            result={
              imports.changeResult
                ? imports.changeResult.batch
                  ? { batch: imports.changeResult.batch, replayed: false }
                  : undefined
                : imports.result
            }
          />
          <Card sx={{ boxShadow: 'none' }}>
            <CardContent sx={{ p: 3 }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25 }}>
                <Fingerprint size={19} color="#6d5bd0" />
                <Typography sx={{ fontSize: 14.5, fontWeight: 800 }}>Timestamp handling</Typography>
              </Stack>
              <Typography
                sx={{ mt: 1.25, color: 'text.secondary', fontSize: 12, lineHeight: 1.65 }}
              >
                ISO 8601 timestamps are accepted. Values without an offset are interpreted in
                Asia/Kolkata. Events before 07:00 belong to the previous work date.
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      </Box>

      <ImportHistory
        batches={imports.batches}
        loading={imports.isHistoryLoading}
        canDelete={imports.canImport && !busy}
        onDelete={(batch) =>
          void reviewChange({ kind: 'delete', batchId: batch.id, fileName: batch.fileName })
        }
      />

      <Dialog
        open={Boolean(pendingChange)}
        onClose={() => !imports.isChanging && setPendingChange(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {pendingChange?.input.kind === 'delete'
            ? 'Delete attendance import?'
            : 'Replace attendance for this period?'}
        </DialogTitle>
        <DialogContent>
          {pendingChange && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography sx={{ overflowWrap: 'anywhere' }}>
                {pendingChange.input.kind === 'delete'
                  ? pendingChange.input.fileName
                  : pendingChange.input.file.name}
              </Typography>
              {pendingChange.input.kind === 'replace' && (
                <Typography>
                  {sourceLabel(pendingChange.preview.source)} · {pendingChange.input.period.from} to{' '}
                  {pendingChange.input.period.to} · all employees
                </Typography>
              )}
              <Alert severity="warning">
                This removes {pendingChange.preview.existingEvents} active punches affecting{' '}
                {pendingChange.preview.existingEmployees} employees and{' '}
                {pendingChange.preview.existingWorkdays} employee workdays.
                {pendingChange.input.kind === 'replace' &&
                  ` The new file supplies ${pendingChange.preview.replacementEvents} punch rows.`}
              </Alert>
              <Typography variant="body2" color="text.secondary">
                {pendingChange.input.kind === 'delete'
                  ? 'Only punches first created by this import are removed. Duplicate rows owned by another import are kept.'
                  : 'All punches for this source and period are replaced, including rows missing from the corrected file.'}{' '}
                Daily totals are recalculated. Employee profiles, website sessions, leave and
                approvals are retained. Removed punches remain in the audit history.
              </Typography>
              <TextField
                autoFocus
                required
                label="Reason for this change"
                value={reason}
                multiline
                minRows={2}
                disabled={imports.isChanging}
                onChange={(event) => setReason(event.target.value)}
                helperText="Enter 5–500 characters."
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
              {imports.changeError && <Alert severity="error">{imports.changeError.message}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={imports.isChanging} onClick={() => setPendingChange(null)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={imports.isChanging || reason.trim().length < 5}
            onClick={() => void confirmChange()}
          >
            {imports.isChanging
              ? 'Applying change…'
              : pendingChange?.input.kind === 'delete'
                ? 'Delete import'
                : 'Replace attendance'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function ImportResult({ result }: { result: ReturnType<typeof useAttendanceImports>['result'] }) {
  if (!result) {
    return (
      <Card sx={{ boxShadow: 'none' }}>
        <CardContent sx={{ p: 3 }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 800 }}>Latest result</Typography>
          <Typography sx={{ mt: 1, color: 'text.secondary', fontSize: 12 }}>
            Import a file to see accepted, duplicate, and rejected row counts here.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const { batch } = result;
  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: 14.5, fontWeight: 800 }}>Latest result</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
              {batch.fileName}
            </Typography>
          </Box>
          <Chip size="small" color={statusColor(batch.status)} label={batch.status} />
        </Stack>
        {result.replayed && (
          <Alert severity="info" sx={{ mt: 2 }}>
            This exact file was already processed. The original result is shown.
          </Alert>
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 1,
            mt: 2,
          }}
        >
          {[
            { label: 'Imported', value: batch.successfulRows, color: '#24855e' },
            { label: 'Duplicates', value: batch.duplicateRows, color: '#7a6ac8' },
            { label: 'Ignored', value: batch.ignoredRows, color: '#147f8d' },
            { label: 'Rejected', value: batch.failedRows, color: '#c45b5f' },
            { label: 'Employees added', value: batch.provisionedEmployees, color: '#3f6fa8' },
            { label: 'Timecards updated', value: batch.reconciledTimecards, color: '#8a5d9f' },
            { label: 'Total rows', value: batch.totalRows, color: '#526174' },
          ].map(({ label, value, color }) => (
            <Box key={label} sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f7f9fb' }}>
              <Typography sx={{ color, fontSize: 20, fontWeight: 850 }}>{value}</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{label}</Typography>
            </Box>
          ))}
        </Box>
        {batch.errors.length > 0 && (
          <Stack spacing={0.75} sx={{ mt: 2 }}>
            <Typography sx={{ fontSize: 11.5, fontWeight: 800 }}>Review required</Typography>
            {batch.errors.slice(0, 6).map((error) => (
              <Stack
                key={`${error.rowNumber}-${error.employeeCode}-${error.reason}`}
                direction="row"
                sx={{ gap: 1, alignItems: 'flex-start' }}
              >
                <AlertTriangle
                  size={14}
                  color="#c45b5f"
                  style={{ marginTop: 2, flex: '0 0 auto' }}
                />
                <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                  Row {error.rowNumber}
                  {error.employeeCode ? ` · ${error.employeeCode}` : ''}: {error.reason}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function ImportHistory({
  batches,
  loading,
  canDelete,
  onDelete,
}: {
  batches: ImportBatchDto[];
  loading: boolean;
  canDelete: boolean;
  onDelete: (batch: ImportBatchDto) => void;
}) {
  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}
        >
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Import history</Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
              Most recent biometric and access-card batches
            </Typography>
          </Box>
          {loading ? <CircularProgress size={18} /> : <History size={19} color="#748195" />}
        </Stack>

        {batches.length === 0 && !loading ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <RefreshCw size={22} color="#98a2b1" />
            <Typography sx={{ mt: 0.75, color: 'text.secondary', fontSize: 12 }}>
              No attendance files have been imported yet.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {batches.map((batch) => (
              <Box
                key={batch.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: '1fr auto',
                    md: '1.4fr .65fr .65fr .65fr .65fr auto auto',
                  },
                  gap: 1.5,
                  alignItems: 'center',
                  px: 1.5,
                  py: 1.35,
                  borderRadius: 2,
                  bgcolor: '#f8fafb',
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 750 }}>
                    {batch.fileName}
                  </Typography>
                  {batch.removedAt && (
                    <Typography
                      sx={{ color: 'text.secondary', fontSize: 10.5, overflowWrap: 'anywhere' }}
                    >
                      {batch.removedRows} punches removed · {batch.removalReason}
                    </Typography>
                  )}
                  <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                    {batch.importType === 'door_workbook'
                      ? 'Door access workbook'
                      : sourceLabel(batch.source)}{' '}
                    · {formatBatchDate(batch.createdAt)}
                  </Typography>
                </Box>
                <HistoryMetric label="Imported" value={batch.successfulRows} />
                <HistoryMetric label="Duplicate" value={batch.duplicateRows} />
                <HistoryMetric label="Ignored" value={batch.ignoredRows} />
                <HistoryMetric label="Rejected" value={batch.failedRows} />
                <Chip
                  size="small"
                  color={statusColor(batch.status)}
                  label={batch.status}
                  icon={batch.status === 'completed' ? <CheckCircle2 size={13} /> : undefined}
                />
                <Button
                  size="small"
                  color="error"
                  startIcon={<Trash2 size={14} />}
                  disabled={
                    !canDelete || batch.status === 'processing' || batch.status === 'deleted'
                  }
                  aria-label={`Delete import ${batch.fileName}`}
                  onClick={() => onDelete(batch)}
                >
                  Delete
                </Button>
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryMetric({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{ display: { xs: 'none', md: 'block' } }}>
      <Typography sx={{ fontSize: 12.5, fontWeight: 750 }}>{value}</Typography>
      <Typography sx={{ color: 'text.secondary', fontSize: 9.5 }}>{label}</Typography>
    </Box>
  );
}

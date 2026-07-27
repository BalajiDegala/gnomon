import type { AttendanceImportSource, ImportBatchDto } from '@gnomon/shared';
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
} from 'lucide-react';
import { useState, type DragEvent } from 'react';

import { downloadAttendanceTemplate, useAttendanceImports } from '../lib/imports';

interface AttendanceImportsPageProps {
  onBack: () => void;
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

function statusColor(status: ImportBatchDto['status']): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'failed') return 'error';
  return 'info';
}

export function AttendanceImportsPage({ onBack }: AttendanceImportsPageProps) {
  const imports = useAttendanceImports();
  const [source, setSource] = useState<AttendanceImportSource>('biometric');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptFile = (candidate?: File) => {
    if (candidate) setFile(candidate);
  };
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  };

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1280, mx: 'auto' }}>
      <Box>
        <Button color="inherit" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
          Back to overview
        </Button>
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          ATTENDANCE ADMINISTRATION
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Attendance imports
        </Typography>
        <Typography sx={{ maxWidth: 760, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Import biometric and access-card punches as immutable attendance evidence. Duplicate files
          and rows are detected automatically.
        </Typography>
      </Box>

      {!imports.canImport && (
        <Alert severity="warning">Your account does not have attendance import permission.</Alert>
      )}
      {imports.uploadError && <Alert severity="error">{imports.uploadError.message}</Alert>}
      {imports.historyError && <Alert severity="error">{imports.historyError.message}</Alert>}

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
                <Typography sx={{ fontSize: 16, fontWeight: 800 }}>New CSV import</Typography>
                <Typography sx={{ mt: 0.3, color: 'text.secondary', fontSize: 12 }}>
                  Maximum 5 MB and 20,000 attendance rows per file.
                </Typography>
              </Box>
              <Button
                variant="outlined"
                startIcon={<Download size={16} />}
                onClick={() => downloadAttendanceTemplate(source)}
              >
                Download template
              </Button>
            </Stack>

            <FormControl fullWidth sx={{ mt: 3 }}>
              <InputLabel id="attendance-source-label">Attendance source</InputLabel>
              <Select
                labelId="attendance-source-label"
                label="Attendance source"
                value={source}
                onChange={(event) => setSource(event.target.value as AttendanceImportSource)}
              >
                <MenuItem value="biometric">Biometric machine</MenuItem>
                <MenuItem value="access_card">Access-card system</MenuItem>
              </Select>
            </FormControl>

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
                  {file ? file.name : 'Drop a CSV file here'}
                </Typography>
                <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 11.5 }}>
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB selected`
                    : 'or choose it from this device'}
                </Typography>
                <Button component="label" size="small" variant="text" sx={{ mt: 1 }}>
                  {file ? 'Choose another file' : 'Choose CSV file'}
                  <input
                    hidden
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => acceptFile(event.target.files?.[0])}
                  />
                </Button>
              </Box>
            </Box>

            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 2 }}>
              {requiredColumns.map((column) => (
                <Chip key={column} size="small" color="primary" label={column} variant="outlined" />
              ))}
              {optionalColumns.map((column) => (
                <Chip key={column} size="small" label={`${column} · optional`} variant="outlined" />
              ))}
            </Stack>

            <Button
              fullWidth
              size="large"
              variant="contained"
              disabled={!file || !imports.canImport || imports.isUploading}
              startIcon={
                imports.isUploading ? (
                  <CircularProgress size={17} color="inherit" />
                ) : (
                  <DatabaseZap size={18} />
                )
              }
              onClick={() => file && void imports.upload(source, file)}
              sx={{ mt: 3, py: 1.35 }}
            >
              {imports.isUploading
                ? 'Validating and importing…'
                : `Import ${sourceLabel(source)} CSV`}
            </Button>
          </CardContent>
        </Card>

        <Stack spacing={2.5}>
          <ImportResult result={imports.result} />
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

      <ImportHistory batches={imports.batches} loading={imports.isHistoryLoading} />
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
            { label: 'Rejected', value: batch.failedRows, color: '#c45b5f' },
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

function ImportHistory({ batches, loading }: { batches: ImportBatchDto[]; loading: boolean }) {
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
                  gridTemplateColumns: { xs: '1fr auto', md: '1.4fr .7fr .7fr .7fr auto' },
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
                  <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                    {sourceLabel(batch.source)} · {formatBatchDate(batch.createdAt)}
                  </Typography>
                </Box>
                <HistoryMetric label="Imported" value={batch.successfulRows} />
                <HistoryMetric label="Duplicate" value={batch.duplicateRows} />
                <HistoryMetric label="Rejected" value={batch.failedRows} />
                <Chip
                  size="small"
                  color={statusColor(batch.status)}
                  label={batch.status}
                  icon={batch.status === 'completed' ? <CheckCircle2 size={13} /> : undefined}
                />
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

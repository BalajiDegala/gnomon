import type {
  MissingEvent,
  RegularisationRequestDto,
  RegularisationSource,
  RegularisationStatus,
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
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Fingerprint,
  History,
  MonitorCheck,
  Send,
  Trash2,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { useMyRegularisations } from '../lib/regularisations';
import { formatIndiaTime } from '../lib/timecard';
import { currentIndiaWorkDate, formatMinutes, indiaLocalInputToIso } from '../lib/timesheets';

interface RegularisationPageProps {
  onBack: () => void;
}

function previousWorkingDate(): string {
  const current = new Date(`${currentIndiaWorkDate()}T00:00:00.000Z`);
  do current.setUTCDate(current.getUTCDate() - 1);
  while (current.getUTCDay() === 0 || current.getUTCDay() === 6);
  return current.toISOString().slice(0, 10);
}

function statusColor(
  status: RegularisationStatus,
): 'warning' | 'info' | 'success' | 'error' | 'default' {
  if (status === 'pending_manager') return 'warning';
  if (status === 'pending_hr') return 'info';
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'error';
  return 'default';
}

function statusLabel(status: RegularisationStatus): string {
  const labels: Record<RegularisationStatus, string> = {
    pending_manager: 'Manager review',
    pending_hr: 'HR / Attendance review',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return labels[status];
}

function sourceLabel(source: RegularisationSource): string {
  return source === 'biometric' ? 'Biometric' : 'Website timecard';
}

function eventLabel(source: RegularisationSource, missingEvent: MissingEvent): string {
  const opening = source === 'biometric' ? 'in' : 'start';
  const closing = source === 'biometric' ? 'out' : 'stop';
  return missingEvent === 'both'
    ? `Missing ${opening} and ${closing}`
    : `Missing ${missingEvent === 'opening' ? opening : closing}`;
}

export function RegularisationPage({ onBack }: RegularisationPageProps) {
  const regularisations = useMyRegularisations();
  const [workDate, setWorkDate] = useState(previousWorkingDate);
  const [source, setSource] = useState<RegularisationSource>('biometric');
  const [missingEvent, setMissingEvent] = useState<MissingEvent>('closing');
  const [requestedStart, setRequestedStart] = useState(`${workDate}T09:00`);
  const [requestedEnd, setRequestedEnd] = useState(`${workDate}T18:00`);
  const [reason, setReason] = useState('');

  useEffect(() => {
    setRequestedStart(`${workDate}T09:00`);
    setRequestedEnd(`${workDate}T18:00`);
  }, [workDate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await regularisations.create({
        workDate,
        source,
        missingEvent,
        requestedStart: indiaLocalInputToIso(requestedStart),
        requestedEnd: indiaLocalInputToIso(requestedEnd),
        reason,
      });
      setReason('');
    } catch {
      // The mutation error is rendered by the hook.
    }
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
          ATTENDANCE CORRECTION
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Regularisation
        </Typography>
        <Typography sx={{ maxWidth: 780, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Request a corrected work window when a biometric punch or website start/stop was missed.
          Your Reporting Manager reviews first, followed by HR or Attendance Administration.
        </Typography>
      </Box>

      {!regularisations.canCreate && (
        <Alert severity="warning">Your account cannot create regularisation requests.</Alert>
      )}
      {regularisations.error && <Alert severity="error">{regularisations.error.message}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(360px, .75fr) minmax(0, 1.25fr)' },
          gap: 2.5,
          alignItems: 'start',
        }}
      >
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent component="form" onSubmit={(event) => void submit(event)} sx={{ p: 3 }}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2.5 }}>
              <CalendarClock size={19} color="#137f8d" />
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 800 }}>
                  New correction request
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
                  Available after the selected workday closes at 07:00.
                </Typography>
              </Box>
            </Stack>
            <Stack spacing={2}>
              <TextField
                type="date"
                label="Work date"
                value={workDate}
                onChange={(event) => setWorkDate(event.target.value)}
                slotProps={{
                  inputLabel: { shrink: true },
                  htmlInput: { max: currentIndiaWorkDate() },
                }}
                required
              />
              <Box
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}
              >
                <FormControl fullWidth>
                  <InputLabel id="regularisation-source-label">Missing source</InputLabel>
                  <Select
                    labelId="regularisation-source-label"
                    label="Missing source"
                    value={source}
                    onChange={(event) => setSource(event.target.value as RegularisationSource)}
                  >
                    <MenuItem value="biometric">Biometric</MenuItem>
                    <MenuItem value="website">Website timecard</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel id="regularisation-event-label">Missing event</InputLabel>
                  <Select
                    labelId="regularisation-event-label"
                    label="Missing event"
                    value={missingEvent}
                    onChange={(event) => setMissingEvent(event.target.value as MissingEvent)}
                  >
                    <MenuItem value="opening">
                      {source === 'biometric' ? 'In punch' : 'Start'}
                    </MenuItem>
                    <MenuItem value="closing">
                      {source === 'biometric' ? 'Out punch' : 'Stop'}
                    </MenuItem>
                    <MenuItem value="both">Both events</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                <TextField
                  type="datetime-local"
                  label="Corrected start"
                  value={requestedStart}
                  onChange={(event) => setRequestedStart(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
                <TextField
                  type="datetime-local"
                  label="Corrected end"
                  value={requestedEnd}
                  onChange={(event) => setRequestedEnd(event.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
              </Box>
              <TextField
                multiline
                minRows={4}
                label="Reason"
                placeholder="Explain why the attendance event was not captured."
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 1_000 } }}
                helperText={`${reason.trim().length}/1000 · minimum 10 characters`}
                required
              />
              <Button
                type="submit"
                size="large"
                variant="contained"
                disabled={
                  !workDate ||
                  !requestedStart ||
                  !requestedEnd ||
                  reason.trim().length < 10 ||
                  regularisations.isUpdating
                }
                startIcon={
                  regularisations.isUpdating ? <CircularProgress size={16} /> : <Send size={17} />
                }
              >
                Submit for manager review
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 2.25 }}>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Request history</Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                  Every decision remains visible as an audit trail.
                </Typography>
              </Box>
              <History size={19} color="#738094" />
            </Stack>
            {regularisations.isLoading ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            ) : regularisations.requests.length ? (
              <Stack spacing={1.25}>
                {regularisations.requests.map((request) => (
                  <RequestHistoryCard
                    key={request.id}
                    request={request}
                    isUpdating={regularisations.isUpdating}
                    onCancel={() => void regularisations.cancel(request.id).catch(() => undefined)}
                  />
                ))}
              </Stack>
            ) : (
              <Box
                sx={{
                  minHeight: 300,
                  display: 'grid',
                  placeItems: 'center',
                  textAlign: 'center',
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 2.5,
                }}
              >
                <Box>
                  <CheckCircle2 size={26} color="#8794a6" />
                  <Typography sx={{ mt: 0.75, fontSize: 13.5, fontWeight: 750 }}>
                    No correction requests
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                    New requests and decisions will appear here.
                  </Typography>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}

function RequestHistoryCard({
  request,
  isUpdating,
  onCancel,
}: {
  request: RegularisationRequestDto;
  isUpdating: boolean;
  onCancel: () => void;
}) {
  const SourceIcon = request.source === 'biometric' ? Fingerprint : MonitorCheck;
  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        sx={{ justifyContent: 'space-between', gap: 1.25 }}
      >
        <Stack direction="row" sx={{ gap: 1.25 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              display: 'grid',
              placeItems: 'center',
              flex: '0 0 auto',
              borderRadius: 2,
              bgcolor: request.source === 'biometric' ? '#f2efff' : '#e7f8fa',
              color: request.source === 'biometric' ? '#6d5bd0' : '#0d8b9b',
            }}
          >
            <SourceIcon size={18} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
              {sourceLabel(request.source)} · {eventLabel(request.source, request.missingEvent)}
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
              {request.workDate} · {formatIndiaTime(request.requestedStart)}–
              {formatIndiaTime(request.requestedEnd)} · {formatMinutes(request.requestedMinutes)}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, alignSelf: 'flex-start' }}>
          <Chip
            size="small"
            color={statusColor(request.status)}
            label={statusLabel(request.status)}
          />
          {request.status === 'pending_manager' && (
            <Button
              aria-label={`Cancel ${request.workDate} regularisation`}
              color="error"
              size="small"
              disabled={isUpdating}
              onClick={onCancel}
              sx={{ minWidth: 34, px: 0.75 }}
            >
              <Trash2 size={15} />
            </Button>
          )}
        </Stack>
      </Stack>
      <Typography sx={{ mt: 1.25, color: 'text.secondary', fontSize: 11.5 }}>
        {request.reason}
      </Typography>
      {request.decisions.length > 0 && (
        <Stack
          spacing={0.5}
          sx={{ mt: 1.25, pt: 1.25, borderTop: '1px solid', borderColor: 'divider' }}
        >
          {request.decisions.map((decision) => (
            <Stack
              key={`${decision.step}-${decision.decidedAt}`}
              direction="row"
              sx={{ gap: 0.75 }}
            >
              <Clock3 size={13} color="#8995a6" />
              <Typography sx={{ color: 'text.secondary', fontSize: 10.75 }}>
                Step {decision.step} {decision.decision} by {decision.actorDisplayName}
                {decision.comment ? ` · ${decision.comment}` : ''}
              </Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

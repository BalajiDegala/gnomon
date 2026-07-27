import type { TimesheetApprovalDto } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Check, Clock3, FileCheck2, Inbox, ReceiptText, X } from 'lucide-react';
import { useState } from 'react';

import { formatIndiaTime } from '../lib/timecard';
import { formatMinutes, useTimesheetApprovals } from '../lib/timesheets';

export function TimesheetApprovalSection() {
  const approvals = useTimesheetApprovals();
  const [comments, setComments] = useState<Record<string, string>>({});
  if (!approvals.canApprove) return null;

  const decide = async (entryId: string, decision: 'approved' | 'rejected') => {
    try {
      await approvals.decide(entryId, {
        decision,
        comment: comments[entryId]?.trim() ?? '',
      });
      setComments((current) => {
        const next = { ...current };
        delete next[entryId];
        return next;
      });
    } catch {
      // Mutation errors are rendered by the hook.
    }
  };

  const employeeCount = new Set(approvals.entries.map((entry) => entry.employeeId)).size;

  return (
    <Stack spacing={1.5}>
      {approvals.error && <Alert severity="error">{approvals.error.message}</Alert>}
      <Card
        sx={{
          border: 0,
          color: '#fff',
          background:
            'radial-gradient(circle at 88% 12%, rgba(255,185,85,.18), transparent 36%), linear-gradient(135deg, #2b2433, #171a2a)',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 2,
                  bgcolor: 'rgba(255,185,85,.14)',
                }}
              >
                <FileCheck2 size={19} color="#ffc574" />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 820 }}>Timesheet queue</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>
                  Show scope or direct-report review
                </Typography>
              </Box>
            </Stack>
            <Box sx={{ textAlign: { sm: 'right' } }}>
              <Typography sx={{ fontSize: 30, fontWeight: 850, lineHeight: 1 }}>
                {approvals.entries.length}
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 10.5 }}>
                entries · {employeeCount} employee{employeeCount === 1 ? '' : 's'}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {approvals.isLoading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <CircularProgress size={25} />
        </Box>
      ) : approvals.entries.length ? (
        approvals.entries.map((entry) => (
          <TimesheetApprovalCard
            key={entry.id}
            entry={entry}
            comment={comments[entry.id] ?? ''}
            isUpdating={approvals.isUpdating}
            onComment={(comment) => setComments((current) => ({ ...current, [entry.id]: comment }))}
            onApprove={() => void decide(entry.id, 'approved')}
            onReject={() => void decide(entry.id, 'rejected')}
          />
        ))
      ) : (
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent
            sx={{ minHeight: 190, display: 'grid', placeItems: 'center', textAlign: 'center' }}
          >
            <Box>
              <Inbox size={25} color="#8995a6" />
              <Typography sx={{ mt: 0.6, fontSize: 13, fontWeight: 800 }}>
                No timesheets waiting
              </Typography>
              <Typography sx={{ mt: 0.25, color: 'text.secondary', fontSize: 11 }}>
                Submitted entries inside your show or reporting scope will appear here.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

function TimesheetApprovalCard({
  entry,
  comment,
  isUpdating,
  onComment,
  onApprove,
  onReject,
}: {
  entry: TimesheetApprovalDto;
  comment: string;
  isUpdating: boolean;
  onComment: (comment: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 14, fontWeight: 820 }}>
                {entry.employeeDisplayName}
              </Typography>
              <Chip size="small" label={entry.employeeCode} variant="outlined" />
              <Chip size="small" color="warning" label="Awaiting decision" />
            </Stack>
            <Typography sx={{ mt: 0.45, color: 'text.secondary', fontSize: 11.5 }}>
              {entry.showCode} · {entry.showName} · work date {entry.workDate}
            </Typography>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                gap: 1,
                mt: 2,
              }}
            >
              <Metric label="Task" value={`${entry.taskCode} · ${entry.taskName}`} />
              <Metric
                label="Task interval"
                value={`${formatIndiaTime(entry.startedAt)} – ${formatIndiaTime(entry.endedAt)}`}
              />
              <Metric label="Recorded time" value={formatMinutes(entry.durationMinutes)} />
            </Box>
            <Box sx={{ mt: 1.25, p: 1.5, borderRadius: 2, bgcolor: '#f7f9fb' }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 0.65 }}>
                <ReceiptText size={13} color="#7b8797" />
                <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                  Task details · {entry.billable ? 'Billable' : 'Non-billable'}
                </Typography>
              </Stack>
              <Typography sx={{ mt: 0.35, fontSize: 12 }}>{entry.description}</Typography>
            </Box>
          </Box>

          <Stack sx={{ width: { md: 330 }, flex: '0 0 auto' }} spacing={1.25}>
            <TextField
              multiline
              minRows={3}
              label={`Decision comment for ${entry.taskCode}`}
              placeholder="Optional for approval; required for rejection."
              value={comment}
              onChange={(event) => onComment(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1_000 } }}
            />
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                color="error"
                variant="outlined"
                disabled={comment.trim().length < 3 || isUpdating}
                startIcon={<X size={16} />}
                onClick={onReject}
              >
                Reject
              </Button>
              <Button
                fullWidth
                color="success"
                variant="contained"
                disabled={isUpdating}
                startIcon={isUpdating ? <CircularProgress size={15} /> : <Check size={16} />}
                onClick={onApprove}
              >
                Approve
              </Button>
            </Stack>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 0.6 }}>
              <Clock3 size={13} color="#8995a6" />
              <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                Submitted{' '}
                {entry.approval.submittedAt
                  ? new Date(entry.approval.submittedAt).toLocaleDateString('en-IN')
                  : 'before approval tracking'}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: '#f7f9fb', minWidth: 0 }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{label}</Typography>
      <Typography sx={{ mt: 0.2, fontSize: 12.5, fontWeight: 800 }}>{value}</Typography>
    </Box>
  );
}

import type { RegularisationRequestDto } from '@gnomon/shared';
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
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  Fingerprint,
  Inbox,
  MonitorCheck,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { useRegularisationApprovals } from '../lib/regularisations';
import { formatIndiaTime } from '../lib/timecard';
import { formatMinutes } from '../lib/timesheets';
import { LeaveApprovalSection } from './LeaveApprovalSection';

interface ApprovalQueuePageProps {
  onBack: () => void;
}

export function ApprovalQueuePage({ onBack }: ApprovalQueuePageProps) {
  const approvals = useRegularisationApprovals();
  const [comments, setComments] = useState<Record<string, string>>({});

  const decide = async (requestId: string, decision: 'approved' | 'rejected') => {
    try {
      await approvals.decide(requestId, {
        decision,
        comment: comments[requestId]?.trim() ?? '',
      });
      setComments((current) => {
        const next = { ...current };
        delete next[requestId];
        return next;
      });
    } catch {
      // The mutation error is rendered by the hook.
    }
  };

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
      <Box>
        <Button color="inherit" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
          Back to overview
        </Button>
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          MANAGER WORKSPACE
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Approvals
        </Typography>
        <Typography sx={{ maxWidth: 780, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Decide regularisation and leave requests assigned to your reporting or HR/Attendance
          scope. Self approval is always blocked.
        </Typography>
      </Box>

      {!approvals.canApprove && (
        <Alert severity="info">
          Regularisation requests are hidden because this account does not have that approval
          permission.
        </Alert>
      )}
      {approvals.error && <Alert severity="error">{approvals.error.message}</Alert>}

      {approvals.canApprove && (
        <>
          <Card
            sx={{
              border: 0,
              color: '#fff',
              background:
                'radial-gradient(circle at 88% 15%, rgba(56,211,222,.2), transparent 38%), linear-gradient(135deg, #111c30, #0b1423)',
            }}
          >
            <CardContent sx={{ p: { xs: 2.75, md: 3.5 } }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}
              >
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 2.25,
                      bgcolor: 'rgba(56,211,222,.14)',
                    }}
                  >
                    <ShieldCheck size={20} color="#45d4df" />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 15.5, fontWeight: 820 }}>
                      Regularisation queue
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 11.5 }}>
                      Reporting Manager → HR / Attendance final approval
                    </Typography>
                  </Box>
                </Stack>
                <Box sx={{ textAlign: { sm: 'right' } }}>
                  <Typography sx={{ fontSize: 34, fontWeight: 850, lineHeight: 1 }}>
                    {approvals.requests.length}
                  </Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 10.5 }}>
                    awaiting your decision
                  </Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>

          {approvals.isLoading ? (
            <Box sx={{ py: 12, textAlign: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : approvals.requests.length ? (
            <Stack spacing={1.5}>
              {approvals.requests.map((request) => (
                <ApprovalCard
                  key={request.id}
                  request={request}
                  comment={comments[request.id] ?? ''}
                  isUpdating={approvals.isUpdating}
                  onComment={(comment) =>
                    setComments((current) => ({ ...current, [request.id]: comment }))
                  }
                  onApprove={() => void decide(request.id, 'approved')}
                  onReject={() => void decide(request.id, 'rejected')}
                />
              ))}
            </Stack>
          ) : (
            <Card sx={{ boxShadow: 'none' }}>
              <CardContent
                sx={{ minHeight: 360, display: 'grid', placeItems: 'center', textAlign: 'center' }}
              >
                <Box>
                  <Inbox size={30} color="#8995a6" />
                  <Typography sx={{ mt: 1, fontSize: 14, fontWeight: 800 }}>
                    Queue is clear
                  </Typography>
                  <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 12 }}>
                    New requests inside your authorization scope will appear here.
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <LeaveApprovalSection />
    </Stack>
  );
}

function ApprovalCard({
  request,
  comment,
  isUpdating,
  onComment,
  onApprove,
  onReject,
}: {
  request: RegularisationRequestDto;
  comment: string;
  isUpdating: boolean;
  onComment: (comment: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const SourceIcon = request.source === 'biometric' ? Fingerprint : MonitorCheck;
  const source = request.source === 'biometric' ? 'Biometric' : 'Website timecard';
  const opening = request.source === 'biometric' ? 'in' : 'start';
  const closing = request.source === 'biometric' ? 'out' : 'stop';
  const missing =
    request.missingEvent === 'both'
      ? `${opening} and ${closing}`
      : request.missingEvent === 'opening'
        ? opening
        : closing;
  const stage = request.status === 'pending_manager' ? 'Manager review' : 'Final HR review';

  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          sx={{ justifyContent: 'space-between', gap: 2.5 }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" sx={{ gap: 1.25, alignItems: 'flex-start' }}>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  borderRadius: 2.25,
                  bgcolor: request.source === 'biometric' ? '#f2efff' : '#e7f8fa',
                  color: request.source === 'biometric' ? '#6d5bd0' : '#0d8b9b',
                }}
              >
                <SourceIcon size={19} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 820 }}>
                    {request.employeeDisplayName}
                  </Typography>
                  <Chip size="small" label={request.employeeCode} variant="outlined" />
                  <Chip
                    size="small"
                    color={request.status === 'pending_manager' ? 'warning' : 'info'}
                    label={stage}
                  />
                </Stack>
                <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 11.5 }}>
                  {source} · missing {missing} · work date {request.workDate}
                </Typography>
              </Box>
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                gap: 1,
                mt: 2,
              }}
            >
              <Metric label="Corrected start" value={formatIndiaTime(request.requestedStart)} />
              <Metric label="Corrected end" value={formatIndiaTime(request.requestedEnd)} />
              <Metric label="Corrected duration" value={formatMinutes(request.requestedMinutes)} />
            </Box>
            <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: '#f7f9fb' }}>
              <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                Employee reason
              </Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12 }}>{request.reason}</Typography>
            </Box>

            {request.decisions.length > 0 && (
              <Stack spacing={0.6} sx={{ mt: 1.5 }}>
                {request.decisions.map((decision) => (
                  <Stack
                    key={`${decision.step}-${decision.decidedAt}`}
                    direction="row"
                    sx={{ alignItems: 'center', gap: 0.75 }}
                  >
                    <CheckCircle2 size={14} color="#269363" />
                    <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
                      Step {decision.step} approved by {decision.actorDisplayName}
                      {decision.comment ? ` · ${decision.comment}` : ''}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>

          <Stack sx={{ width: { md: 330 }, flex: '0 0 auto' }} spacing={1.25}>
            <TextField
              multiline
              minRows={3}
              label="Decision comment"
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
                Submitted {new Date(request.submittedAt).toLocaleDateString('en-IN')}
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
    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: '#f7f9fb' }}>
      <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{label}</Typography>
      <Typography sx={{ mt: 0.2, fontSize: 12.5, fontWeight: 800 }}>{value}</Typography>
    </Box>
  );
}

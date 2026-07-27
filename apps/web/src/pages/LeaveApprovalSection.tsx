import type { LeaveRequestDto } from '@gnomon/shared';
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
import { CalendarDays, Check, CheckCircle2, Inbox, X } from 'lucide-react';
import { useState } from 'react';

import { useLeaveApprovals } from '../lib/leaves';
import { leaveTypeLabels } from './LeavePage';

export function LeaveApprovalSection() {
  const approvals = useLeaveApprovals();
  const [comments, setComments] = useState<Record<string, string>>({});
  if (!approvals.canApprove) return null;

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
      // Mutation errors are rendered by the hook.
    }
  };

  return (
    <Stack spacing={1.5}>
      {approvals.error && <Alert severity="error">{approvals.error.message}</Alert>}
      <Card
        sx={{
          border: 0,
          color: '#fff',
          background: 'linear-gradient(135deg, #22304a, #162238)',
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
          <Stack
            direction="row"
            sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 2 }}
          >
            <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 2,
                  bgcolor: 'rgba(123,165,255,.14)',
                }}
              >
                <CalendarDays size={19} color="#9bbcff" />
              </Box>
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 820 }}>Leave queue</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>
                  Reporting Manager decision
                </Typography>
              </Box>
            </Stack>
            <Typography sx={{ fontSize: 30, fontWeight: 850 }}>
              {approvals.requests.length}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      {approvals.isLoading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}>
          <CircularProgress size={25} />
        </Box>
      ) : approvals.requests.length ? (
        approvals.requests.map((request) => (
          <LeaveApprovalCard
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
        ))
      ) : (
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent
            sx={{
              minHeight: 190,
              display: 'grid',
              placeItems: 'center',
              textAlign: 'center',
            }}
          >
            <Box>
              <Inbox size={25} color="#8995a6" />
              <Typography sx={{ mt: 0.6, fontSize: 13, fontWeight: 800 }}>
                No leave decisions waiting
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

function LeaveApprovalCard({
  request,
  comment,
  isUpdating,
  onComment,
  onApprove,
  onReject,
}: {
  request: LeaveRequestDto;
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
                {request.employeeDisplayName}
              </Typography>
              <Chip size="small" label={request.employeeCode} variant="outlined" />
              <Chip size="small" color="warning" label="Manager review" />
            </Stack>
            <Typography sx={{ mt: 0.45, color: 'text.secondary', fontSize: 11.5 }}>
              {leaveTypeLabels[request.leaveType]} · {request.startDate}
              {request.endDate !== request.startDate ? ` – ${request.endDate}` : ''} ·{' '}
              {request.requestedDays} day{request.requestedDays === 1 ? '' : 's'}
            </Typography>
            <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, bgcolor: '#f7f9fb' }}>
              <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                Private employee reason
              </Typography>
              <Typography sx={{ mt: 0.25, fontSize: 12 }}>{request.reason}</Typography>
            </Box>
          </Box>
          <Stack sx={{ width: { md: 330 }, flex: '0 0 auto' }} spacing={1.2}>
            <TextField
              multiline
              minRows={2}
              label="Decision comment"
              placeholder="Optional for approval; required for rejection."
              value={comment}
              onChange={(event) => onComment(event.target.value)}
            />
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                color="error"
                variant="outlined"
                disabled={comment.trim().length < 3 || isUpdating}
                startIcon={<X size={15} />}
                onClick={onReject}
              >
                Reject
              </Button>
              <Button
                fullWidth
                color="success"
                variant="contained"
                disabled={isUpdating}
                startIcon={isUpdating ? <CircularProgress size={14} /> : <Check size={15} />}
                onClick={onApprove}
              >
                Approve
              </Button>
            </Stack>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 0.6 }}>
              <CheckCircle2 size={13} color="#8995a6" />
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

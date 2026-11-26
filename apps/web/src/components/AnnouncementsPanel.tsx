import {
  announcementDurationOptions,
  type AnnouncementDepartment,
  type AnnouncementDto,
} from '@gnomon/shared';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Check, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useAnnouncementDepartments, useAnnouncements } from '../lib/announcements';
import { ConfirmDialog } from './ConfirmDialog';
import { SoftCard } from './soft';

const COLLAPSED_COUNT = 3;

const durationLabels: Record<(typeof announcementDurationOptions)[number], string> = {
  1: '1 day',
  3: '3 days',
  7: '1 week',
  14: '2 weeks',
  30: '30 days',
};

/**
 * Messages from managers on the Overview page, under the greeting: just the
 * title and message. Managers, HR and admins also get a "Send message" button.
 */
export function AnnouncementsPanel() {
  const announcements = useAnnouncements();
  const [composing, setComposing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [withdrawing, setWithdrawing] = useState<AnnouncementDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { items, canSend } = announcements;
  if (announcements.isLoading || (items.length === 0 && !canSend)) return null;

  const visible = expanded ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <Stack spacing={1.25}>
      {canSend && (
        <Button
          size="small"
          variant="contained"
          startIcon={<Send size={14} />}
          sx={{ alignSelf: 'flex-end' }}
          onClick={() => setComposing(true)}
        >
          Send message
        </Button>
      )}
      {actionError && (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {visible.map((item) => {
        const isUnread = !item.sentByMe && !item.readAt;
        return (
          <SoftCard
            key={item.id}
            sx={{
              position: 'relative',
              gap: 0.75,
              textAlign: 'center',
              justifyItems: 'center',
              px: { xs: 6, md: 9 },
              borderColor: isUnread ? 'primary.main' : 'var(--g-border)',
            }}
          >
            <Stack direction="row" sx={{ gap: 0.5, position: 'absolute', top: 8, right: 8 }}>
              {isUnread && (
                <Tooltip title="Mark as read">
                  <IconButton
                    size="small"
                    aria-label="Mark as read"
                    onClick={() =>
                      void announcements
                        .markRead(item.id)
                        .catch((error: Error) => setActionError(error.message))
                    }
                  >
                    <Check size={16} />
                  </IconButton>
                </Tooltip>
              )}
              {item.canWithdraw && (
                <Tooltip title="Withdraw">
                  <IconButton
                    size="small"
                    aria-label="Withdraw"
                    onClick={() => setWithdrawing(item)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
            <Typography sx={{ fontSize: 15, fontWeight: isUnread ? 700 : 600 }}>
              {item.title}
            </Typography>
            <Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {item.message}
            </Typography>
          </SoftCard>
        );
      })}
      {items.length > COLLAPSED_COUNT && (
        <Button size="small" sx={{ alignSelf: 'center' }} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer' : `Show all ${items.length} messages`}
        </Button>
      )}

      {composing && <SendAnnouncementDialog onClose={() => setComposing(false)} />}
      <ConfirmDialog
        open={Boolean(withdrawing)}
        title="Withdraw this message?"
        confirmLabel="Withdraw"
        onCancel={() => setWithdrawing(null)}
        onConfirm={() => {
          const target = withdrawing;
          setWithdrawing(null);
          if (target) {
            void announcements
              .withdraw(target.id)
              .catch((error: Error) => setActionError(error.message));
          }
        }}
      >
        &ldquo;{withdrawing?.title}&rdquo; will be removed from everyone&apos;s Overview page and
        notifications.
      </ConfirmDialog>
    </Stack>
  );
}

function SendAnnouncementDialog({ onClose }: { onClose: () => void }) {
  const announcements = useAnnouncements();
  const departments = useAnnouncementDepartments(true);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audienceType, setAudienceType] = useState<'all' | 'departments'>('all');
  const [selected, setSelected] = useState<AnnouncementDepartment[]>([]);
  const [durationDays, setDurationDays] = useState<number>(7);
  const [error, setError] = useState<string | null>(null);

  const everyoneCount = useMemo(
    () => (departments.data ?? []).reduce((sum, item) => sum + item.employeeCount, 0),
    [departments.data],
  );
  const recipientCount =
    audienceType === 'all'
      ? everyoneCount
      : selected.reduce((sum, item) => sum + item.employeeCount, 0);
  const valid =
    title.trim().length >= 3 &&
    message.trim().length >= 3 &&
    (audienceType === 'all' || selected.length > 0);

  const submit = async () => {
    setError(null);
    try {
      await announcements.send({
        title: title.trim(),
        message: message.trim(),
        audience:
          audienceType === 'all'
            ? { type: 'all' }
            : { type: 'departments', departments: selected.map((item) => item.name) },
        durationDays,
      });
      onClose();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'The message was not sent');
    }
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={announcements.isSending ? undefined : onClose}>
      <DialogTitle>Send a message</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Title"
            value={title}
            autoFocus
            required
            onChange={(event) => setTitle(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            label="Message"
            value={message}
            required
            multiline
            minRows={4}
            onChange={(event) => setMessage(event.target.value)}
            helperText={`${message.length} / 2000`}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, mb: 0.5 }}>Send to</Typography>
            <RadioGroup
              row
              value={audienceType}
              onChange={(event) => setAudienceType(event.target.value as 'all' | 'departments')}
            >
              <FormControlLabel value="all" control={<Radio size="small" />} label="Everyone" />
              <FormControlLabel
                value="departments"
                control={<Radio size="small" />}
                label="Specific departments"
              />
            </RadioGroup>
          </Box>
          {audienceType === 'departments' && (
            <Autocomplete
              multiple
              options={departments.data ?? []}
              loading={departments.isLoading}
              value={selected}
              onChange={(_event, value) => setSelected(value)}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.name === value.name}
              renderOption={(props, option) => {
                const { key, ...rest } = props;
                return (
                  <li key={key} {...rest}>
                    <Box sx={{ display: 'flex', width: '100%', justifyContent: 'space-between' }}>
                      <span>{option.name}</span>
                      <Typography component="span" sx={{ fontSize: 12, color: 'var(--g-muted)' }}>
                        {option.employeeCount}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField {...params} label="Departments" placeholder="Choose departments" />
              )}
            />
          )}
          {departments.error && <Alert severity="warning">{departments.error.message}</Alert>}
          <TextField
            select
            label="Show on Overview for"
            value={durationDays}
            onChange={(event) => setDurationDays(Number(event.target.value))}
          >
            {announcementDurationOptions.map((days) => (
              <MenuItem key={days} value={days}>
                {durationLabels[days]}
              </MenuItem>
            ))}
          </TextField>
          <Typography sx={{ fontSize: 12.5, color: 'var(--g-muted)' }}>
            {recipientCount > 0
              ? `About ${recipientCount} ${recipientCount === 1 ? 'person' : 'people'} will get a notification and see it on their Overview page.`
              : 'Each recipient gets a notification and sees it on their Overview page.'}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={announcements.isSending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!valid || announcements.isSending}
          startIcon={
            announcements.isSending ? (
              <CircularProgress size={14} color="inherit" />
            ) : (
              <Send size={14} />
            )
          }
          onClick={() => void submit()}
        >
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
}

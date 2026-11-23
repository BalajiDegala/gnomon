import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

/** Asks the user to confirm an action that is allowed but probably unintended. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Go back',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: 18, fontWeight: 850 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
          <TriangleAlert size={19} color="var(--g-pt)" />
          {title}
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.25} sx={{ fontSize: 13.5 }}>
          {children}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button color="inherit" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

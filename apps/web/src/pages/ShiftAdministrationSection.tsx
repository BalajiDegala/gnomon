import { shiftDurationMinutes, type ShiftDto, type ShiftRequest } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Pencil, Plus, Save, X } from 'lucide-react';
import { useState } from 'react';

import { useShiftAdministration } from '../lib/shifts';

const emptyForm: ShiftRequest = {
  name: '',
  startTime: '09:00',
  endTime: '18:00',
  isDefault: false,
  active: true,
};

function formatDuration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function ShiftAdministrationSection({ onSaved }: { onSaved: (message: string) => void }) {
  const shifts = useShiftAdministration();
  // null = closed, 'new' = adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ShiftRequest>(emptyForm);

  if (!shifts.canManage) return null;

  const openForm = (shift: ShiftDto | null) => {
    setEditing(shift?.id ?? 'new');
    setForm(
      shift
        ? {
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            isDefault: shift.isDefault,
            active: shift.active,
          }
        : emptyForm,
    );
  };

  const editingShift = shifts.shifts.find((shift) => shift.id === editing);
  const sameTimes = form.startTime === form.endTime;
  const canSave = form.name.trim().length >= 2 && !sameTimes && !(form.isDefault && !form.active);

  const submit = async () => {
    try {
      await shifts.save(editing === 'new' ? null : editing, { ...form, name: form.name.trim() });
      onSaved(`${form.name.trim()} saved.`);
      setEditing(null);
    } catch {
      // Shown through shifts.error.
    }
  };

  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1.5 }}
        >
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Shifts</Typography>
            <Typography sx={{ mt: 0.35, color: 'text.secondary', fontSize: 11.5 }}>
              Employees pick one of the active shifts, plus office or home, when they start their
              timecard. The default shift is preselected.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Plus size={16} />}
            disabled={editing === 'new'}
            onClick={() => openForm(null)}
          >
            Add shift
          </Button>
        </Stack>

        {shifts.error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {shifts.error instanceof Error ? shifts.error.message : 'The request failed.'}
          </Alert>
        )}

        {editing && (
          <Box
            sx={{
              mt: 2,
              p: 2,
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 2fr) 1fr 1fr' },
              gap: 1.5,
            }}
          >
            <TextField
              size="small"
              label="Shift name"
              placeholder="e.g. Night shift"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              autoFocus
            />
            <TextField
              size="small"
              type="time"
              label="Start"
              value={form.startTime}
              onChange={(event) => setForm({ ...form, startTime: event.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              size="small"
              type="time"
              label="End"
              value={form.endTime}
              error={sameTimes}
              helperText={
                sameTimes
                  ? 'Start and end must differ'
                  : `${formatDuration(shiftDurationMinutes(form.startTime, form.endTime))}${
                      form.endTime < form.startTime ? ' · ends next day' : ''
                    }`
              }
              onChange={(event) => setForm({ ...form, endTime: event.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ gridColumn: '1 / -1', justifyContent: 'space-between', gap: 1 }}
            >
              <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={form.active}
                      disabled={editingShift?.isDefault}
                      onChange={(event) => setForm({ ...form, active: event.target.checked })}
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>Available to employees</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={form.isDefault}
                      disabled={editingShift?.isDefault}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          isDefault: event.target.checked,
                          active: event.target.checked ? true : form.active,
                        })
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>Default shift</Typography>}
                />
              </Stack>
              <Stack direction="row" sx={{ gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  color="inherit"
                  startIcon={<X size={15} />}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  disabled={!canSave || shifts.isSaving}
                  startIcon={
                    shifts.isSaving ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <Save size={15} />
                    )
                  }
                  onClick={() => void submit()}
                >
                  Save shift
                </Button>
              </Stack>
            </Stack>
            {editingShift?.isDefault && (
              <Typography sx={{ gridColumn: '1 / -1', color: 'text.secondary', fontSize: 11 }}>
                To retire this shift, make another shift the default first.
              </Typography>
            )}
          </Box>
        )}

        <Stack spacing={1} sx={{ mt: 2 }}>
          {shifts.isLoading ? (
            <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={20} />
            </Box>
          ) : (
            shifts.shifts.map((shift) => (
              <Stack
                key={shift.id}
                direction="row"
                sx={{
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  px: 1.5,
                  py: 1.1,
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  opacity: shift.active ? 1 : 0.8,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{shift.name}</Typography>
                  <Typography
                    sx={{
                      color: 'text.secondary',
                      fontSize: 11.5,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {shift.startTime} – {shift.endTime} · {formatDuration(shift.durationMinutes)}
                    {shift.endTime < shift.startTime ? ' · overnight' : ''}
                  </Typography>
                </Box>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
                  {shift.isDefault && <Chip size="small" color="primary" label="Default" />}
                  {!shift.active && <Chip size="small" variant="outlined" label="Inactive" />}
                  <Button
                    size="small"
                    color="inherit"
                    startIcon={<Pencil size={14} />}
                    onClick={() => openForm(shift)}
                  >
                    Edit
                  </Button>
                </Stack>
              </Stack>
            ))
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

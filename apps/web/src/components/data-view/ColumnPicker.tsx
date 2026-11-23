import {
  Button,
  Checkbox,
  Divider,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import { Columns3 } from 'lucide-react';
import { useState } from 'react';

/**
 * "Columns" menu: show/hide columns, listed in their current order. Order is
 * changed by dragging grid headers; Reset restores both visibility and order.
 */
export function ColumnPicker<Id extends string>({
  columns,
  visible,
  onChange,
  onReset,
}: {
  columns: ReadonlyArray<{ id: Id; label: string }>;
  visible: readonly Id[];
  onChange: (visible: Id[]) => void;
  onReset: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const toggle = (id: Id) => {
    const next = visible.includes(id)
      ? visible.filter((column) => column !== id)
      : [...visible, id];
    if (next.length > 0) onChange(next);
  };
  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<Columns3 size={15} />}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{
          borderColor: 'divider',
          borderRadius: '10px',
          bgcolor: 'var(--g-base)',
          whiteSpace: 'nowrap',
        }}
      >
        Columns
        <Typography component="span" sx={{ ml: 0.75, color: 'text.secondary', fontSize: 12 }}>
          {visible.length}/{columns.length}
        </Typography>
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 280, maxHeight: 520 } } }}
      >
        {columns.map((column) => (
          <MenuItem key={column.id} dense onClick={() => toggle(column.id)}>
            <Checkbox
              size="small"
              checked={visible.includes(column.id)}
              disabled={visible.includes(column.id) && visible.length === 1}
              sx={{ p: 0.5, mr: 1 }}
            />
            <ListItemText primary={column.label} />
          </MenuItem>
        ))}
        <Divider />
        <Typography sx={{ px: 2, pt: 1, color: 'text.secondary', fontSize: 11.5 }}>
          Drag column headers to change their order. Export uses the same order.
        </Typography>
        <Stack direction="row" sx={{ justifyContent: 'space-between', px: 1, pt: 0.5 }}>
          <Button size="small" onClick={() => onChange(columns.map((column) => column.id))}>
            Show all
          </Button>
          <Button size="small" color="inherit" onClick={onReset}>
            Reset
          </Button>
        </Stack>
      </Menu>
    </>
  );
}

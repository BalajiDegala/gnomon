import { TextField } from '@mui/material';

interface MonthPickerProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export function MonthPicker({ label, value, onChange }: MonthPickerProps) {
  return (
    <TextField
      size="small"
      type="month"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{ inputLabel: { shrink: true } }}
      sx={{
        width: 180,
        '& .MuiInputLabel-root': {
          px: 0.45,
          borderRadius: 0.5,
          bgcolor: '#fff',
          color: '#607086',
          '&.Mui-focused': { color: 'primary.main' },
        },
        '& .MuiInputBase-input': {
          fontVariantNumeric: 'tabular-nums',
        },
      }}
    />
  );
}

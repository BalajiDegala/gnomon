import {
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  type SxProps,
  type Theme,
} from '@mui/material';

/** Compact multi-select used as a column filter in grid toolbars. */
export function MultiSelectFilter({
  label,
  values,
  options,
  onChange,
  width,
  sx,
}: {
  label: string;
  values: readonly string[];
  options: ReadonlyArray<{ value: string; label: string; secondary?: string }>;
  onChange: (values: string[]) => void;
  width: number;
  sx?: SxProps<Theme>;
}) {
  const id = `${label.toLowerCase().replaceAll(' ', '-')}-filter`;
  const labelByValue = new Map(options.map((option) => [option.value, option.label]));
  return (
    <FormControl size="small" sx={[{ width }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <InputLabel id={id}>{label}</InputLabel>
      <Select
        multiple
        labelId={id}
        value={[...values]}
        onChange={(event) =>
          onChange(
            typeof event.target.value === 'string'
              ? event.target.value.split(',')
              : event.target.value,
          )
        }
        input={<OutlinedInput label={label} />}
        renderValue={(selected) =>
          selected.length === 1
            ? (labelByValue.get(selected[0]!) ?? selected[0])
            : `${selected.length} selected`
        }
        MenuProps={{ slotProps: { paper: { sx: { maxHeight: 420, minWidth: 280 } } } }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value} dense>
            <Checkbox size="small" checked={values.includes(option.value)} sx={{ p: 0.5, mr: 1 }} />
            <ListItemText primary={option.label} secondary={option.secondary} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

import { Box, Button, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { RotateCcw, Search } from 'lucide-react';
import type { ReactNode } from 'react';

interface FilterBarProps {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchLabel?: string;
  resultCount: number;
  resultLabel: string;
  hasActiveFilters: boolean;
  onClear: () => void;
  children?: ReactNode;
}

export function FilterBar({
  search,
  onSearchChange,
  searchLabel,
  resultCount,
  resultLabel,
  hasActiveFilters,
  onClear,
  children,
}: FilterBarProps) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      sx={{
        minHeight: 64,
        p: 1.25,
        alignItems: { md: 'center' },
        gap: 1.25,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: '#fff',
      }}
    >
      {search !== undefined && onSearchChange && searchLabel && (
        <TextField
          size="small"
          label={searchLabel}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          sx={{ width: { xs: '100%', md: 320 } }}
          slotProps={{
            htmlInput: { maxLength: 100 },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
      {children}
      <Box sx={{ flex: 1 }} />
      {hasActiveFilters && (
        <Button color="inherit" size="small" startIcon={<RotateCcw size={15} />} onClick={onClear}>
          Clear filters
        </Button>
      )}
      <Typography sx={{ color: 'text.secondary', fontSize: 11.5, whiteSpace: 'nowrap' }}>
        {resultCount} {resultLabel}
      </Typography>
    </Stack>
  );
}

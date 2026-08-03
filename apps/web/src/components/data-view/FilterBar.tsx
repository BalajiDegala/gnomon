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
  standalone?: boolean;
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
  standalone = false,
}: FilterBarProps) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      sx={{
        minHeight: 64,
        px: { xs: 1.25, sm: 1.5 },
        py: 1.35,
        alignItems: { md: 'center' },
        gap: 1.25,
        border: '1px solid',
        borderTop: standalone ? '1px solid' : 0,
        borderColor: 'divider',
        borderRadius: standalone ? '18px' : '0 0 16px 16px',
        bgcolor: 'rgba(255,255,255,.9)',
        backgroundImage: 'linear-gradient(90deg, rgba(18,148,161,.025), transparent 32%)',
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
      <Typography
        sx={{
          px: 1,
          py: 0.5,
          borderRadius: 1.5,
          bgcolor: '#e9f5f6',
          color: 'primary.dark',
          fontSize: 11.5,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {resultCount} {resultLabel}
      </Typography>
    </Stack>
  );
}

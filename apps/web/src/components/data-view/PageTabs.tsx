import { Box, Chip, Stack, Tab, Tabs } from '@mui/material';

export interface PageTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface PageTabsProps<T extends string> {
  value: T;
  tabs: readonly PageTab<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}

export function PageTabs<T extends string>({ value, tabs, onChange, ariaLabel }: PageTabsProps<T>) {
  return (
    <Box
      sx={{
        px: { xs: 0.5, sm: 1 },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '16px 16px 0 0',
        bgcolor: 'rgba(255,255,255,.94)',
        boxShadow: '0 10px 26px rgba(20,32,51,.035)',
      }}
    >
      <Tabs
        value={value}
        onChange={(_event, nextValue: T) => onChange(nextValue)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label={ariaLabel}
        sx={{
          minHeight: 48,
          '& .MuiTabs-indicator': {
            height: 3,
            borderRadius: '3px 3px 0 0',
            background: 'linear-gradient(90deg, #10a5b3, #4fcbd5)',
          },
        }}
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.value}
            value={tab.value}
            label={
              <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <Chip
                    component="span"
                    size="small"
                    label={tab.count}
                    sx={{ height: 20, minWidth: 24, '& .MuiChip-label': { px: 0.75 } }}
                  />
                )}
              </Stack>
            }
            sx={{
              minHeight: 48,
              px: 1.75,
              fontSize: 12.5,
              fontWeight: 750,
              color: 'text.secondary',
              '&.Mui-selected': { color: 'primary.dark', fontWeight: 820 },
            }}
          />
        ))}
      </Tabs>
    </Box>
  );
}

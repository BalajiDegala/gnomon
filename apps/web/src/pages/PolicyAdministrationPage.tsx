import type {
  HolidayScopeType,
  LeaveBalanceAdministrationDto,
  LeaveType,
  UpdateLeaveBalanceRequest,
} from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CalendarDays, Check, Gauge, Search, Settings2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  useEmployeeLeaveBalanceAdministration,
  useHolidayAdministration,
  useLocationAdministration,
} from '../lib/policies';
import { LocationAdministrationSection } from './LocationAdministrationSection';
import { leaveTypeLabels } from './LeavePage';

function defaultHolidayDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function PolicyAdministrationPage() {
  const [year, setYear] = useState(() => Number(defaultHolidayDate().slice(0, 4)));
  const holidays = useHolidayAdministration(year);
  const locations = useLocationAdministration();
  const [holidayDate, setHolidayDate] = useState(defaultHolidayDate);
  const [holidayName, setHolidayName] = useState('');
  const [holidayScopeType, setHolidayScopeType] = useState<HolidayScopeType>('company');
  const [holidayLocationId, setHolidayLocationId] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [searchedEmployeeCode, setSearchedEmployeeCode] = useState('');
  const balances = useEmployeeLeaveBalanceAdministration(searchedEmployeeCode, year);
  const canUsePage = holidays.canManage || balances.canManage || locations.canRead;
  const policyLocations = useMemo(
    () =>
      locations.locations.filter(
        (location) => location.status === 'active' && location.canManagePolicy,
      ),
    [locations.locations],
  );

  useEffect(() => {
    if (
      !holidays.canManageCompany &&
      holidayScopeType === 'company' &&
      policyLocations.length > 0
    ) {
      setHolidayScopeType('location');
      return;
    }
    if (holidayScopeType !== 'location') return;
    if (!policyLocations.some((location) => location.id === holidayLocationId)) {
      setHolidayLocationId(policyLocations[0]?.id ?? '');
    }
  }, [holidayLocationId, holidayScopeType, holidays.canManageCompany, policyLocations]);

  const saveHoliday = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await holidays.upsert({
        date: holidayDate,
        name: holidayName,
        scopeType: holidayScopeType,
        locationId: holidayScopeType === 'location' ? holidayLocationId : null,
      });
      setHolidayName('');
    } catch {
      // The mutation error is rendered by the hook.
    }
  };

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          LEAVE & CALENDAR POLICY
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Leave & holidays
        </Typography>
        <Typography sx={{ maxWidth: 780, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Configure company or studio-location holidays, effective-dated employee locations, and
          annual entitlements without rewriting historical attendance evidence.
        </Typography>
      </Box>

      {!canUsePage && <Alert severity="warning">No leave-policy administration permission.</Alert>}
      {holidays.error && <Alert severity="error">{holidays.error.message}</Alert>}
      {balances.error && <Alert severity="error">{balances.error.message}</Alert>}

      <LocationAdministrationSection directory={locations} />

      <TextField
        type="number"
        label="Policy year"
        value={year}
        onChange={(event) => {
          const nextYear = Number(event.target.value);
          if (nextYear >= 2000 && nextYear <= 2200) setYear(nextYear);
        }}
        slotProps={{ htmlInput: { min: 2000, max: 2200 } }}
        sx={{ width: { xs: '100%', sm: 180 } }}
      />

      {holidays.canManage && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(320px, .72fr) minmax(0, 1.28fr)' },
            gap: 2.5,
            alignItems: 'start',
          }}
        >
          <Card sx={{ boxShadow: 'none' }}>
            <CardContent
              component="form"
              onSubmit={(event) => void saveHoliday(event)}
              sx={{ p: 3 }}
            >
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2.5 }}>
                <CalendarDays size={19} color="#137f8d" />
                <Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Holiday policy</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
                    Company-wide or one assigned studio location
                  </Typography>
                </Box>
              </Stack>
              <Stack spacing={2}>
                <FormControl fullWidth>
                  <InputLabel id="holiday-scope-label">Holiday scope</InputLabel>
                  <Select
                    labelId="holiday-scope-label"
                    label="Holiday scope"
                    value={holidayScopeType}
                    onChange={(event) =>
                      setHolidayScopeType(event.target.value as HolidayScopeType)
                    }
                  >
                    <MenuItem value="company" disabled={!holidays.canManageCompany}>
                      Company-wide
                    </MenuItem>
                    <MenuItem value="location" disabled={policyLocations.length === 0}>
                      One studio location
                    </MenuItem>
                  </Select>
                </FormControl>
                {holidayScopeType === 'location' && (
                  <FormControl fullWidth>
                    <InputLabel id="holiday-location-label">Studio location</InputLabel>
                    <Select
                      labelId="holiday-location-label"
                      label="Studio location"
                      value={holidayLocationId}
                      onChange={(event) => setHolidayLocationId(event.target.value)}
                    >
                      {policyLocations.map((location) => (
                        <MenuItem key={location.id} value={location.id}>
                          {location.code} · {location.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <TextField
                  type="date"
                  label="Holiday date"
                  value={holidayDate}
                  onChange={(event) => {
                    setHolidayDate(event.target.value);
                    const selectedYear = Number(event.target.value.slice(0, 4));
                    if (selectedYear >= 2000 && selectedYear <= 2200) setYear(selectedYear);
                  }}
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
                <TextField
                  label="Holiday name"
                  value={holidayName}
                  onChange={(event) => setHolidayName(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                  required
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={
                    holidayName.trim().length < 2 ||
                    (holidayScopeType === 'company' && !holidays.canManageCompany) ||
                    (holidayScopeType === 'location' && !holidayLocationId) ||
                    holidays.isUpdating
                  }
                  startIcon={
                    holidays.isUpdating ? <CircularProgress size={15} /> : <Check size={16} />
                  }
                >
                  Save holiday
                </Button>
              </Stack>
            </CardContent>
          </Card>
          <HolidayList
            holidays={holidays.holidays}
            loading={holidays.isLoading}
            updating={holidays.isUpdating}
            onArchive={(holidayId) => void holidays.archive(holidayId).catch(() => undefined)}
          />
        </Box>
      )}

      {balances.canManage && (
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, gap: 2 }}
            >
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1.2 }}>
                <Gauge size={19} color="#137f8d" />
                <Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 800 }}>
                    Employee leave balances
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
                    Paid entitlements by employee and calendar year
                  </Typography>
                </Box>
              </Stack>
              <Stack
                component="form"
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ gap: 1 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearchedEmployeeCode(employeeCode.trim().toUpperCase());
                }}
              >
                <TextField
                  size="small"
                  label="Employee code"
                  value={employeeCode}
                  onChange={(event) => setEmployeeCode(event.target.value.toUpperCase())}
                  slotProps={{ htmlInput: { maxLength: 50 } }}
                  required
                />
                <Button type="submit" variant="outlined" startIcon={<Search size={15} />}>
                  Load balances
                </Button>
              </Stack>
            </Stack>

            {balances.isLoading ? (
              <Box sx={{ py: 8, textAlign: 'center' }}>
                <CircularProgress size={25} />
              </Box>
            ) : balances.employee ? (
              <Box sx={{ mt: 2.5 }}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 820 }}>
                    {balances.employee.employeeDisplayName}
                  </Typography>
                  <Chip size="small" label={balances.employee.employeeCode} variant="outlined" />
                </Stack>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', xl: 'repeat(3, minmax(0, 1fr))' },
                    gap: 1.5,
                  }}
                >
                  {balances.employee.balances.map((balance) => (
                    <BalanceEditor
                      key={balance.leaveType}
                      balance={balance}
                      disabled={balances.isUpdating}
                      onSave={(input) => balances.update(input)}
                    />
                  ))}
                </Box>
              </Box>
            ) : (
              <Box
                sx={{
                  minHeight: 160,
                  mt: 2.5,
                  display: 'grid',
                  placeItems: 'center',
                  textAlign: 'center',
                  border: '1px dashed',
                  borderColor: 'divider',
                  borderRadius: 2.5,
                }}
              >
                <Box>
                  <Settings2 size={24} color="#8b97a8" />
                  <Typography sx={{ mt: 0.6, color: 'text.secondary', fontSize: 12 }}>
                    Enter an employee code to configure paid leave.
                  </Typography>
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}

function HolidayList({
  holidays,
  loading,
  updating,
  onArchive,
}: {
  holidays: ReturnType<typeof useHolidayAdministration>['holidays'];
  loading: boolean;
  updating: boolean;
  onArchive: (holidayId: string) => void;
}) {
  const active = holidays.filter((holiday) => holiday.status === 'active');
  return (
    <Card sx={{ boxShadow: 'none' }}>
      <CardContent sx={{ p: 3 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Holiday calendar</Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 11.5 }}>
          Active company and location dates for the selected year
        </Typography>
        {loading ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : active.length ? (
          <Stack spacing={1} sx={{ mt: 2 }}>
            {active.map((holiday) => (
              <Stack
                key={holiday.id}
                direction="row"
                sx={{
                  alignItems: 'center',
                  gap: 1.25,
                  p: 1.4,
                  borderRadius: 2,
                  bgcolor: '#f7f9fb',
                }}
              >
                <Box
                  sx={{
                    minWidth: 48,
                    px: 0.8,
                    py: 0.6,
                    textAlign: 'center',
                    borderRadius: 1.5,
                    bgcolor: '#f1edff',
                    color: '#6852a8',
                  }}
                >
                  <Typography sx={{ fontSize: 10, fontWeight: 850 }}>
                    {new Date(`${holiday.date}T00:00:00Z`).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      timeZone: 'UTC',
                    })}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 780 }}>
                    {holiday.name}
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                    {holiday.scopeType === 'company'
                      ? 'Company-wide'
                      : `${holiday.locationCode ?? 'Location'} · ${holiday.locationName ?? 'Unknown location'}`}
                  </Typography>
                </Box>
                <Button
                  color="error"
                  aria-label={`Archive ${holiday.name}`}
                  disabled={updating}
                  onClick={() => onArchive(holiday.id)}
                  sx={{ minWidth: 38, px: 0.8 }}
                >
                  <Trash2 size={15} />
                </Button>
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography sx={{ py: 7, textAlign: 'center', color: 'text.secondary', fontSize: 12 }}>
            No holidays configured for this year and policy scope.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function BalanceEditor({
  balance,
  disabled,
  onSave,
}: {
  balance: LeaveBalanceAdministrationDto;
  disabled: boolean;
  onSave: (input: UpdateLeaveBalanceRequest) => Promise<unknown>;
}) {
  const [entitledDays, setEntitledDays] = useState(balance.entitledDays);
  const [adjustedDays, setAdjustedDays] = useState(balance.adjustedDays);
  const [note, setNote] = useState(balance.note);
  const label = useMemo(() => leaveTypeLabels[balance.leaveType as LeaveType], [balance.leaveType]);

  useEffect(() => {
    setEntitledDays(balance.entitledDays);
    setAdjustedDays(balance.adjustedDays);
    setNote(balance.note);
  }, [balance]);

  return (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 820 }}>{label}</Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
            {balance.pendingDays} pending · {balance.approvedDays} approved
          </Typography>
        </Box>
        <Chip
          size="small"
          color={balance.configured ? 'success' : 'default'}
          label={balance.configured ? `${balance.availableDays} available` : 'Not set'}
        />
      </Stack>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth
            size="small"
            type="number"
            label={`${label} entitlement`}
            value={entitledDays}
            onChange={(event) => setEntitledDays(Number(event.target.value))}
            slotProps={{ htmlInput: { min: 0, max: 365, step: 0.5 } }}
          />
          <TextField
            fullWidth
            size="small"
            type="number"
            label={`${label} adjustment`}
            value={adjustedDays}
            onChange={(event) => setAdjustedDays(Number(event.target.value))}
            slotProps={{ htmlInput: { min: -365, max: 365, step: 0.5 } }}
          />
        </Stack>
        <TextField
          size="small"
          label={`${label} note`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 500 } }}
        />
        <Button
          variant="outlined"
          disabled={
            disabled || entitledDays + adjustedDays < balance.pendingDays + balance.approvedDays
          }
          onClick={() =>
            void onSave({
              leaveType: balance.leaveType,
              year: balance.year,
              entitledDays,
              adjustedDays,
              note,
            }).catch(() => undefined)
          }
        >
          Save {label.toLowerCase()}
        </Button>
      </Stack>
    </Box>
  );
}

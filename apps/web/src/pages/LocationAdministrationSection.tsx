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
import { Building2, Check, MapPin, Search, UserRoundCog } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { useEmployeeLocationAdministration, useLocationAdministration } from '../lib/policies';

export function LocationAdministrationSection({
  directory,
}: {
  directory: ReturnType<typeof useLocationAdministration>;
}) {
  const [locationCode, setLocationCode] = useState('');
  const [locationName, setLocationName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [searchedEmployeeCode, setSearchedEmployeeCode] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const employeeLocation = useEmployeeLocationAdministration(searchedEmployeeCode);
  const assignableLocations = directory.locations.filter(
    (location) => location.status === 'active' && location.canAssignEmployees,
  );

  useEffect(() => {
    if (employeeLocation.employee) {
      setSelectedLocationId(employeeLocation.employee.locationId ?? '');
    }
  }, [employeeLocation.employee]);

  const createLocation = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await directory.create({ code: locationCode, name: locationName });
      setLocationCode('');
      setLocationName('');
    } catch {
      // Mutation errors are rendered by the hook.
    }
  };

  if (!directory.canRead) return null;

  return (
    <Stack spacing={1.5}>
      {directory.error && <Alert severity="error">{directory.error.message}</Alert>}
      {employeeLocation.error && <Alert severity="error">{employeeLocation.error.message}</Alert>}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.05fr) minmax(320px, .95fr)' },
          gap: 2.5,
          alignItems: 'stretch',
        }}
      >
        <Card sx={{ boxShadow: 'none' }}>
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}
            >
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1.1 }}>
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 2,
                    bgcolor: '#e8f7f9',
                    color: '#137f8d',
                  }}
                >
                  <Building2 size={18} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 820 }}>Studio locations</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
                    Policy scope and current employee count
                  </Typography>
                </Box>
              </Stack>
              <Chip size="small" label={`${directory.locations.length} locations`} />
            </Stack>

            {directory.isLoading ? (
              <Box sx={{ py: 7, textAlign: 'center' }}>
                <CircularProgress size={24} />
              </Box>
            ) : directory.locations.length ? (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                  gap: 1,
                  mt: 2,
                }}
              >
                {directory.locations.map((location) => (
                  <Box
                    key={location.id}
                    sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f7f9fb', minWidth: 0 }}
                  >
                    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 800 }}>
                          {location.name}
                        </Typography>
                        <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                          {location.code} · {location.employeeCount} employee
                          {location.employeeCount === 1 ? '' : 's'}
                        </Typography>
                      </Box>
                      <MapPin size={15} color="#788597" />
                    </Stack>
                    <Stack direction="row" sx={{ mt: 1, gap: 0.6, flexWrap: 'wrap' }}>
                      {location.canManagePolicy && (
                        <Chip size="small" color="info" label="Holiday policy" />
                      )}
                      {location.canAssignEmployees && (
                        <Chip size="small" color="success" label="HR assignment" />
                      )}
                    </Stack>
                  </Box>
                ))}
              </Box>
            ) : (
              <Typography
                sx={{ py: 5, textAlign: 'center', color: 'text.secondary', fontSize: 12 }}
              >
                No studio locations have been configured.
              </Typography>
            )}

            {directory.canCreate && (
              <Stack
                component="form"
                direction={{ xs: 'column', sm: 'row' }}
                onSubmit={(event) => void createLocation(event)}
                sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider', gap: 1 }}
              >
                <TextField
                  size="small"
                  label="Location code"
                  value={locationCode}
                  onChange={(event) => setLocationCode(event.target.value.toUpperCase())}
                  slotProps={{ htmlInput: { maxLength: 24 } }}
                  required
                />
                <TextField
                  size="small"
                  label="Location name"
                  value={locationName}
                  onChange={(event) => setLocationName(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                  sx={{ flex: 1 }}
                  required
                />
                <Button
                  type="submit"
                  variant="outlined"
                  disabled={
                    locationCode.trim().length < 2 ||
                    locationName.trim().length < 2 ||
                    directory.isUpdating
                  }
                  startIcon={
                    directory.isUpdating ? <CircularProgress size={14} /> : <MapPin size={15} />
                  }
                >
                  Add location
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>

        {employeeLocation.canManage && (
          <Card sx={{ boxShadow: 'none' }}>
            <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1.1 }}>
                <UserRoundCog size={19} color="#6d5bd0" />
                <Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 820 }}>Employee location</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
                    Effective today with historical assignments retained
                  </Typography>
                </Box>
              </Stack>
              <Stack
                component="form"
                direction={{ xs: 'column', sm: 'row' }}
                sx={{ mt: 2, gap: 1 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearchedEmployeeCode(employeeCode.trim().toUpperCase());
                }}
              >
                <TextField
                  fullWidth
                  size="small"
                  label="Location employee code"
                  value={employeeCode}
                  onChange={(event) => setEmployeeCode(event.target.value.toUpperCase())}
                  slotProps={{ htmlInput: { maxLength: 50 } }}
                  required
                />
                <Button type="submit" variant="outlined" startIcon={<Search size={15} />}>
                  Load employee
                </Button>
              </Stack>

              {employeeLocation.isLoading ? (
                <Box sx={{ py: 5, textAlign: 'center' }}>
                  <CircularProgress size={23} />
                </Box>
              ) : employeeLocation.employee ? (
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#f7f9fb' }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
                      {employeeLocation.employee.employeeDisplayName}
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                      {employeeLocation.employee.employeeCode} · current:{' '}
                      {employeeLocation.employee.locationName ?? 'Unassigned'}
                    </Typography>
                  </Box>
                  <FormControl fullWidth size="small">
                    <InputLabel id="employee-location-label">Assigned location</InputLabel>
                    <Select
                      labelId="employee-location-label"
                      label="Assigned location"
                      value={selectedLocationId}
                      onChange={(event) => setSelectedLocationId(event.target.value)}
                    >
                      {employeeLocation.canClear && <MenuItem value="">Unassigned</MenuItem>}
                      {assignableLocations.map((location) => (
                        <MenuItem key={location.id} value={location.id}>
                          {location.code} · {location.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    disabled={
                      employeeLocation.isUpdating ||
                      selectedLocationId === (employeeLocation.employee.locationId ?? '')
                    }
                    startIcon={
                      employeeLocation.isUpdating ? (
                        <CircularProgress size={15} />
                      ) : (
                        <Check size={16} />
                      )
                    }
                    onClick={() =>
                      void employeeLocation
                        .update(selectedLocationId || null)
                        .catch(() => undefined)
                    }
                  >
                    Assign effective today
                  </Button>
                </Stack>
              ) : (
                <Typography
                  sx={{ py: 5, textAlign: 'center', color: 'text.secondary', fontSize: 12 }}
                >
                  Load an employee to review or change the current location.
                </Typography>
              )}
            </CardContent>
          </Card>
        )}
      </Box>
    </Stack>
  );
}

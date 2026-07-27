import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  ListChecks,
  Plus,
  Sparkles,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

import { useShowAdministration } from '../lib/shows';

interface ShowManagementPageProps {
  onBack: () => void;
}

export function ShowManagementPage({ onBack }: ShowManagementPageProps) {
  const administration = useShowAdministration();
  const [selectedShowId, setSelectedShowId] = useState('');
  const [showCode, setShowCode] = useState('');
  const [showName, setShowName] = useState('');
  const [taskCode, setTaskCode] = useState('');
  const [taskName, setTaskName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const selectedShow = administration.shows.find((show) => show.id === selectedShowId);

  useEffect(() => {
    if (!administration.shows.length) return;
    if (!administration.shows.some((show) => show.id === selectedShowId)) {
      setSelectedShowId(administration.shows[0]!.id);
    }
  }, [administration.shows, selectedShowId]);

  const submitShow = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response = await administration.createShow({ code: showCode, name: showName });
      setSelectedShowId(response.show.id);
      setShowCode('');
      setShowName('');
    } catch {
      // The mutation error is rendered by the administration hook.
    }
  };
  const submitTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedShow) return;
    try {
      await administration.createTask(selectedShow.id, { code: taskCode, name: taskName });
      setTaskCode('');
      setTaskName('');
    } catch {
      // The mutation error is rendered by the administration hook.
    }
  };
  const submitAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedShow) return;
    try {
      await administration.assignEmployee(selectedShow.id, { employeeCode });
      setEmployeeCode('');
    } catch {
      // The mutation error is rendered by the administration hook.
    }
  };

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1280, mx: 'auto' }}>
      <Box>
        <Button color="inherit" startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>
          Back to overview
        </Button>
        <Typography
          sx={{ color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: 1.3 }}
        >
          SHOW ADMINISTRATION
        </Typography>
        <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-0.035em' }}>
          Shows &amp; tasks
        </Typography>
        <Typography sx={{ maxWidth: 760, color: 'text.secondary', fontSize: 13.5, mt: 0.7 }}>
          Create VFX shows, define their task catalogue, and control which employees can record time
          against each show.
        </Typography>
      </Box>

      {!administration.canManage && (
        <Alert severity="warning">Your account does not have show management permission.</Alert>
      )}
      {administration.error && <Alert severity="error">{administration.error.message}</Alert>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(300px, .65fr) minmax(0, 1.35fr)' },
          gap: 2.5,
          alignItems: 'start',
        }}
      >
        <Stack spacing={2.5}>
          <Card sx={{ boxShadow: 'none' }}>
            <CardContent
              component="form"
              onSubmit={(event) => void submitShow(event)}
              sx={{ p: 3 }}
            >
              <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2.25 }}>
                <Plus size={18} color="#137f8d" />
                <Typography sx={{ fontSize: 15, fontWeight: 800 }}>Create a show</Typography>
              </Stack>
              <Stack spacing={2}>
                <TextField
                  label="Show code"
                  placeholder="SHOW-001"
                  value={showCode}
                  onChange={(event) => setShowCode(event.target.value.toUpperCase())}
                  slotProps={{ htmlInput: { maxLength: 24 } }}
                  required
                />
                <TextField
                  label="Show name"
                  placeholder="Project or production name"
                  value={showName}
                  onChange={(event) => setShowName(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 160 } }}
                  required
                />
                <Button
                  type="submit"
                  variant="contained"
                  disabled={
                    showCode.trim().length < 2 ||
                    showName.trim().length < 2 ||
                    administration.isUpdating
                  }
                  startIcon={<BriefcaseBusiness size={17} />}
                >
                  Create show
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ boxShadow: 'none' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 800 }}>Managed shows</Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 11, mt: 0.25, mb: 1.5 }}>
                Limited by the show scope on your active role assignments.
              </Typography>
              {administration.isLoading ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <CircularProgress size={22} />
                </Box>
              ) : administration.shows.length ? (
                <Stack spacing={0.75}>
                  {administration.shows.map((show) => (
                    <Button
                      key={show.id}
                      color="inherit"
                      onClick={() => setSelectedShowId(show.id)}
                      sx={{
                        justifyContent: 'flex-start',
                        px: 1.5,
                        py: 1.25,
                        textAlign: 'left',
                        border: '1px solid',
                        borderColor: show.id === selectedShowId ? 'primary.main' : 'divider',
                        bgcolor: show.id === selectedShowId ? '#eef9fa' : '#fff',
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 800 }}>
                          {show.code}
                        </Typography>
                        <Typography noWrap sx={{ color: 'text.secondary', fontSize: 11 }}>
                          {show.name}
                        </Typography>
                      </Box>
                    </Button>
                  ))}
                </Stack>
              ) : (
                <Typography
                  sx={{ py: 3, textAlign: 'center', color: 'text.secondary', fontSize: 12 }}
                >
                  No shows have been created in your scope.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Stack>

        {selectedShow ? (
          <Stack spacing={2.5}>
            <Card
              sx={{
                border: 0,
                color: '#fff',
                background:
                  'radial-gradient(circle at 85% 10%, rgba(56,211,222,.2), transparent 38%), linear-gradient(135deg, #111c30, #0b1423)',
              }}
            >
              <CardContent sx={{ p: { xs: 3, md: 3.5 } }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  sx={{ justifyContent: 'space-between', gap: 2 }}
                >
                  <Box>
                    <Chip
                      size="small"
                      color="success"
                      label={selectedShow.status}
                      icon={<CheckCircle2 size={13} />}
                    />
                    <Typography variant="h5" sx={{ mt: 1.5, fontWeight: 850 }}>
                      {selectedShow.name}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 12 }}>
                      {selectedShow.code}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1.25}>
                    <Metric value={selectedShow.tasks.length} label="Tasks" />
                    <Metric value={selectedShow.assignments.length} label="Artists" />
                  </Stack>
                </Stack>
              </CardContent>
            </Card>

            <Box
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}
            >
              <Card sx={{ boxShadow: 'none' }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2 }}>
                    <ListChecks size={18} color="#137f8d" />
                    <Typography sx={{ fontSize: 14.5, fontWeight: 800 }}>Task catalogue</Typography>
                  </Stack>
                  <Stack
                    component="form"
                    onSubmit={(event) => void submitTask(event)}
                    spacing={1.5}
                  >
                    <TextField
                      size="small"
                      label="Task code"
                      placeholder="COMP"
                      value={taskCode}
                      onChange={(event) => setTaskCode(event.target.value.toUpperCase())}
                      required
                    />
                    <TextField
                      size="small"
                      label="Task name"
                      placeholder="Compositing"
                      value={taskName}
                      onChange={(event) => setTaskName(event.target.value)}
                      required
                    />
                    <Button
                      type="submit"
                      variant="outlined"
                      disabled={
                        taskCode.trim().length < 2 ||
                        taskName.trim().length < 2 ||
                        administration.isUpdating
                      }
                    >
                      Add task
                    </Button>
                  </Stack>
                  <Stack spacing={0.75} sx={{ mt: 2 }}>
                    {selectedShow.tasks.map((task) => (
                      <Stack
                        key={task.id}
                        direction="row"
                        sx={{
                          justifyContent: 'space-between',
                          p: 1.25,
                          borderRadius: 2,
                          bgcolor: '#f7f9fb',
                        }}
                      >
                        <Box>
                          <Typography sx={{ fontSize: 12, fontWeight: 800 }}>
                            {task.code}
                          </Typography>
                          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                            {task.name}
                          </Typography>
                        </Box>
                        <Chip size="small" label={task.status} color="success" variant="outlined" />
                      </Stack>
                    ))}
                  </Stack>
                </CardContent>
              </Card>

              <Card sx={{ boxShadow: 'none' }}>
                <CardContent sx={{ p: 3 }}>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2 }}>
                    <UserPlus size={18} color="#137f8d" />
                    <Typography sx={{ fontSize: 14.5, fontWeight: 800 }}>
                      Employee assignment
                    </Typography>
                  </Stack>
                  <Stack
                    component="form"
                    onSubmit={(event) => void submitAssignment(event)}
                    spacing={1.5}
                  >
                    <TextField
                      size="small"
                      label="Employee code"
                      placeholder="DDI0001"
                      value={employeeCode}
                      onChange={(event) => setEmployeeCode(event.target.value.toUpperCase())}
                      required
                    />
                    <Button
                      type="submit"
                      variant="outlined"
                      disabled={!employeeCode.trim() || administration.isUpdating}
                    >
                      Assign employee
                    </Button>
                  </Stack>
                  <Stack spacing={0.75} sx={{ mt: 2 }}>
                    {selectedShow.assignments.map((assignment) => (
                      <Stack
                        key={assignment.id}
                        direction="row"
                        sx={{
                          alignItems: 'center',
                          gap: 1.25,
                          p: 1.25,
                          borderRadius: 2,
                          bgcolor: '#f7f9fb',
                        }}
                      >
                        <Box
                          sx={{
                            width: 30,
                            height: 30,
                            display: 'grid',
                            placeItems: 'center',
                            borderRadius: '50%',
                            bgcolor: '#e8f5f7',
                            color: '#137f8d',
                          }}
                        >
                          <UsersRound size={14} />
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography noWrap sx={{ fontSize: 12, fontWeight: 750 }}>
                            {assignment.displayName}
                          </Typography>
                          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                            {assignment.employeeCode}
                          </Typography>
                        </Box>
                        <Chip size="small" label={assignment.status} color="success" />
                      </Stack>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          </Stack>
        ) : (
          <Card sx={{ boxShadow: 'none' }}>
            <CardContent
              sx={{ minHeight: 420, display: 'grid', placeItems: 'center', textAlign: 'center' }}
            >
              <Box>
                <Sparkles size={28} color="#8c98a8" />
                <Typography sx={{ mt: 1, fontSize: 14, fontWeight: 800 }}>
                  Create the first show
                </Typography>
                <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 12 }}>
                  Tasks and employee assignments will appear here.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        )}
      </Box>
    </Stack>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <Box
      sx={{
        minWidth: 74,
        px: 1.5,
        py: 1,
        textAlign: 'center',
        borderRadius: 2,
        bgcolor: 'rgba(255,255,255,.08)',
      }}
    >
      <Typography sx={{ fontSize: 18, fontWeight: 850 }}>{value}</Typography>
      <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: 9.5 }}>{label}</Typography>
    </Box>
  );
}

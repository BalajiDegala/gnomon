import type { ShowAdminDto, ShowStatus } from '@gnomon/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { BriefcaseBusiness, ChevronRight, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import {
  DataTable,
  type DataTableColumn,
  type SortDirection,
} from '../components/data-view/DataTable';
import { FilterBar } from '../components/data-view/FilterBar';
import { PageHeader } from '../components/data-view/PageHeader';
import { PageTabs, type PageTab } from '../components/data-view/PageTabs';
import { useAuth } from '../lib/auth';
import { readFormDraft, useSessionFormDraft } from '../lib/form-drafts';
import { useShowAdministration } from '../lib/shows';
import { parseEnumValue, parseShortSearch, useUrlQueryState } from '../lib/url-query-state';
import { confirmDiscardChanges, useUnsavedChanges } from '../lib/unsaved-changes';

type ShowTab = 'all' | ShowStatus;
type ShowSortKey = 'name' | 'code' | 'status';

const showTabs = ['all', 'active', 'on_hold', 'completed', 'archived'] as const;
const showSortKeys = ['name', 'code', 'status'] as const;
const sortDirections = ['asc', 'desc'] as const;
const pageSizes = [10, 25, 50, 100] as const;

interface ShowFormDraft {
  mode: 'create' | 'edit';
  showId?: string;
  code: string;
  name: string;
  status: ShowStatus;
}

function isShowFormDraft(value: unknown): value is ShowFormDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ShowFormDraft>;
  return (
    (draft.mode === 'create' || draft.mode === 'edit') &&
    (draft.showId === undefined || typeof draft.showId === 'string') &&
    typeof draft.code === 'string' &&
    typeof draft.name === 'string' &&
    ['active', 'on_hold', 'completed', 'archived'].includes(draft.status ?? '')
  );
}

function parseShowTab(value: string): ShowTab | null {
  return parseEnumValue(value, showTabs);
}

function parseShowSort(value: string): ShowSortKey | null {
  return parseEnumValue(value, showSortKeys);
}

function parseSortDirection(value: string): SortDirection | null {
  return parseEnumValue(value, sortDirections);
}

function parsePage(value: string): number | null {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : null;
}

function parsePageSize(value: string): number | null {
  const pageSize = Number(value);
  return pageSizes.includes(pageSize as (typeof pageSizes)[number]) ? pageSize : null;
}

function parseShowId(value: string): string | null {
  return /^[a-f\d]{24}$/i.test(value) ? value : null;
}

function showStatusLabel(status: ShowStatus): string {
  return { active: 'Active', on_hold: 'On hold', completed: 'Completed', archived: 'Archived' }[
    status
  ];
}

function statusColor(status: ShowStatus): 'success' | 'warning' | 'info' | 'default' {
  if (status === 'active') return 'success';
  if (status === 'on_hold') return 'warning';
  if (status === 'completed') return 'info';
  return 'default';
}

export function ShowManagementPage() {
  const { user } = useAuth();
  const administration = useShowAdministration();
  const draftKey = `${user?.employeeId ?? 'anonymous'}:show-form`;
  const recoveredDraft = useMemo(() => readFormDraft(draftKey, isShowFormDraft), [draftKey]);
  const [tab, setTab] = useUrlQueryState<ShowTab>('tab', 'all', parseShowTab);
  const [search, setSearch] = useUrlQueryState('q', '', parseShortSearch);
  const [sortKey, setSortKey] = useUrlQueryState<ShowSortKey>('sort', 'name', parseShowSort);
  const [sortDirection, setSortDirection] = useUrlQueryState<SortDirection>(
    'order',
    'asc',
    parseSortDirection,
  );
  const [pageNumber, setPageNumber] = useUrlQueryState('page', 1, parsePage);
  const [rowsPerPage, setRowsPerPage] = useUrlQueryState('size', 25, parsePageSize);
  const [selectedShowId, setSelectedShowId] = useUrlQueryState(
    'show',
    recoveredDraft?.showId ?? '',
    parseShowId,
  );
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(recoveredDraft?.mode ?? null);
  const [showCode, setShowCode] = useState(recoveredDraft?.code ?? '');
  const [showName, setShowName] = useState(recoveredDraft?.name ?? '');
  const [showStatus, setShowStatus] = useState<ShowStatus>(recoveredDraft?.status ?? 'active');
  const selectedShow = administration.shows.find((show) => show.id === selectedShowId);
  const formOpen = formMode !== null;
  const formDirty = Boolean(
    formOpen &&
    (formMode === 'edit'
      ? selectedShow
        ? showCode !== selectedShow.code ||
          showName !== selectedShow.name ||
          showStatus !== selectedShow.status
        : Boolean(recoveredDraft)
      : Boolean(showCode) || Boolean(showName) || showStatus !== 'active'),
  );
  const draft = useMemo<ShowFormDraft>(
    () => ({
      mode: formMode === 'edit' ? 'edit' : 'create',
      showId: formMode === 'edit' ? selectedShowId : undefined,
      code: showCode,
      name: showName,
      status: showStatus,
    }),
    [formMode, selectedShowId, showCode, showName, showStatus],
  );
  const clearDraft = useSessionFormDraft(draftKey, draft, formDirty);
  useUnsavedChanges(formDirty);

  useEffect(() => {
    if (!administration.isLoading && selectedShowId && !selectedShow) setSelectedShowId('');
  }, [administration.isLoading, selectedShow, selectedShowId, setSelectedShowId]);

  const tabDefinitions = useMemo<ReadonlyArray<PageTab<ShowTab>>>(
    () => [
      { value: 'all', label: 'All', count: administration.shows.length },
      ...(['active', 'on_hold', 'completed', 'archived'] as const).map((status) => ({
        value: status,
        label: showStatusLabel(status),
        count: administration.shows.filter((show) => show.status === status).length,
      })),
    ],
    [administration.shows],
  );

  const filteredShows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const direction = sortDirection === 'asc' ? 1 : -1;
    return administration.shows
      .filter((show) => tab === 'all' || show.status === tab)
      .filter(
        (show) =>
          !term || show.code.toLowerCase().includes(term) || show.name.toLowerCase().includes(term),
      )
      .slice()
      .sort(
        (left, right) =>
          left[sortKey].localeCompare(right[sortKey], undefined, { numeric: true }) * direction ||
          left.code.localeCompare(right.code),
      );
  }, [administration.shows, search, sortDirection, sortKey, tab]);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filteredShows.length / rowsPerPage));
    if (pageNumber > lastPage) setPageNumber(lastPage);
  }, [filteredShows.length, pageNumber, rowsPerPage, setPageNumber]);

  const openCreate = () => {
    administration.clearError();
    setShowCode('');
    setShowName('');
    setShowStatus('active');
    setFormMode('create');
  };

  const openEdit = (show: ShowAdminDto) => {
    administration.clearError();
    setShowCode(show.code);
    setShowName(show.name);
    setShowStatus(show.status);
    setFormMode('edit');
  };

  const closeForm = () => {
    if (formDirty && !confirmDiscardChanges()) return;
    clearDraft();
    setFormMode(null);
    setShowCode('');
    setShowName('');
    setShowStatus('active');
    administration.clearError();
  };

  const submitShow = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const response =
        formMode === 'edit' && selectedShow
          ? await administration.updateShow(selectedShow.id, {
              code: showCode,
              name: showName,
              status: showStatus,
            })
          : await administration.createShow({ code: showCode, name: showName });
      clearDraft();
      setShowCode('');
      setShowName('');
      setFormMode(null);
      setSelectedShowId(response.show.id);
    } catch {
      // The mutation error is rendered in the dialog.
    }
  };

  const updateSort = (key: ShowSortKey) => {
    if (key === sortKey) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPageNumber(1);
  };

  const columns: ReadonlyArray<DataTableColumn<ShowAdminDto, ShowSortKey>> = [
    {
      id: 'show',
      label: 'Show',
      sortKey: 'name',
      minWidth: 280,
      render: (show) => (
        <Box>
          <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 800 }}>
            {show.name}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>{show.code}</Typography>
        </Box>
      ),
    },
    { id: 'code', label: 'Code', sortKey: 'code', width: 180, render: (show) => show.code },
    {
      id: 'status',
      label: 'Status',
      sortKey: 'status',
      width: 150,
      render: (show) => (
        <Chip
          size="small"
          variant="outlined"
          color={statusColor(show.status)}
          label={showStatusLabel(show.status)}
        />
      ),
    },
    {
      id: 'details',
      label: 'Details',
      align: 'right',
      width: 72,
      render: (show) => (
        <Tooltip title={`Open ${show.name}`}>
          <IconButton
            size="small"
            aria-label={`Open ${show.name}`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedShowId(show.id);
            }}
          >
            <ChevronRight size={17} />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 1440, mx: 'auto' }}>
      <PageHeader
        eyebrow="SHOW OPERATIONS"
        title="Shows"
        meta={`${administration.shows.length} managed shows`}
        action={
          administration.canManage ? (
            <Button variant="contained" startIcon={<Plus size={17} />} onClick={openCreate}>
              Add show
            </Button>
          ) : undefined
        }
      />

      {!administration.canManage && (
        <Alert severity="warning">Your account does not have show management permission.</Alert>
      )}
      {administration.error && !formOpen && (
        <Alert severity="error">{administration.error.message}</Alert>
      )}

      <Box>
        <PageTabs
          value={tab}
          tabs={tabDefinitions}
          onChange={(value) => {
            setTab(value);
            setPageNumber(1);
          }}
          ariaLabel="Show status"
        />
        <FilterBar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPageNumber(1);
          }}
          searchLabel="Search shows"
          resultCount={filteredShows.length}
          resultLabel={filteredShows.length === 1 ? 'show' : 'shows'}
          hasActiveFilters={Boolean(search) || tab !== 'all'}
          onClear={() => {
            setSearch('');
            setTab('all');
            setPageNumber(1);
          }}
        />
      </Box>

      <DataTable
        ariaLabel="Managed shows"
        rows={filteredShows}
        columns={columns}
        getRowId={(show) => show.id}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={updateSort}
        page={pageNumber - 1}
        rowsPerPage={rowsPerPage}
        onPageChange={(page) => setPageNumber(page + 1)}
        onRowsPerPageChange={(size) => {
          setRowsPerPage(size);
          setPageNumber(1);
        }}
        onRowClick={(show) => setSelectedShowId(show.id)}
        isLoading={administration.isLoading}
        emptyTitle={administration.shows.length ? 'No shows match this view' : 'No shows yet'}
        emptyMessage={
          administration.shows.length
            ? 'Change or clear the active filters.'
            : 'Add the first active show for employee time entry.'
        }
      />

      <Dialog
        open={formOpen}
        onClose={administration.isUpdating ? undefined : closeForm}
        fullWidth
        maxWidth="sm"
      >
        <Box component="form" onSubmit={(event) => void submitShow(event)}>
          <DialogTitle sx={{ fontSize: 18, fontWeight: 850 }}>
            {formMode === 'edit' ? 'Edit show' : 'Add show'}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              {administration.error && (
                <Alert severity="error">{administration.error.message}</Alert>
              )}
              <TextField
                autoFocus
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
              {formMode === 'edit' && (
                <FormControl fullWidth>
                  <InputLabel id="show-status-label">Status</InputLabel>
                  <Select
                    labelId="show-status-label"
                    label="Status"
                    value={showStatus}
                    onChange={(event) => setShowStatus(event.target.value as ShowStatus)}
                  >
                    {(['active', 'on_hold', 'completed', 'archived'] as const).map((status) => (
                      <MenuItem key={status} value={status}>
                        {showStatusLabel(status)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button color="inherit" onClick={closeForm} disabled={administration.isUpdating}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                showCode.trim().length < 2 ||
                showName.trim().length < 2 ||
                administration.isUpdating
              }
              startIcon={
                administration.isUpdating ? (
                  <CircularProgress size={15} />
                ) : (
                  <BriefcaseBusiness size={16} />
                )
              }
            >
              {formMode === 'edit' ? 'Save changes' : 'Create show'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Drawer
        anchor="right"
        open={Boolean(selectedShow)}
        onClose={() => setSelectedShowId('')}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 }, maxWidth: '100vw' } } }}
      >
        <Stack sx={{ height: '100%' }}>
          <Stack direction="row" sx={{ minHeight: 72, px: 2.5, alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap sx={{ fontSize: 17, fontWeight: 850 }}>
                {selectedShow?.name ?? 'Show details'}
              </Typography>
              <Typography sx={{ color: 'text.secondary', fontSize: 11 }}>
                {selectedShow?.code}
              </Typography>
            </Box>
            {selectedShow && (
              <Chip
                size="small"
                variant="outlined"
                color={statusColor(selectedShow.status)}
                label={showStatusLabel(selectedShow.status)}
              />
            )}
            <Tooltip title="Close show details">
              <IconButton aria-label="Close show details" onClick={() => setSelectedShowId('')}>
                <X size={19} />
              </IconButton>
            </Tooltip>
          </Stack>
          <Divider />
          {selectedShow && (
            <Stack spacing={2.5} sx={{ p: 2.5 }}>
              <Button
                variant="outlined"
                startIcon={<Pencil size={16} />}
                onClick={() => openEdit(selectedShow)}
                sx={{ alignSelf: 'flex-start' }}
              >
                Edit show
              </Button>
              <Box>
                <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>Show code</Typography>
                <Typography sx={{ mt: 0.25, fontSize: 13, fontWeight: 750 }}>
                  {selectedShow.code}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                  Timesheet availability
                </Typography>
                <Typography sx={{ mt: 0.25, fontSize: 13, fontWeight: 750 }}>
                  {selectedShow.status === 'active'
                    ? 'Available to every employee'
                    : 'Not available for new entries'}
                </Typography>
              </Box>
            </Stack>
          )}
        </Stack>
      </Drawer>
    </Stack>
  );
}

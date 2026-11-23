import {
  Box,
  ButtonBase,
  IconButton,
  Stack,
  TablePagination,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Inbox,
} from 'lucide-react';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

const HEADER_FONT_SIZE = 11.5;
const HEADER_LETTER_SPACING = 0.5;
const HEADER_PADDING = 24; // px: 1.5 spacing units on each side
const SORT_ICON_SPACE = 22; // icon + gap + multi-sort index
const DRAG_HANDLE_SPACE = 16; // grip icon shown when columns can be reordered
let measureContext: CanvasRenderingContext2D | null | undefined;

/** Width a header label needs so it is never truncated. */
function headerLabelWidth(label: string, sortable: boolean, draggable: boolean): number {
  const text = label.toUpperCase();
  if (measureContext === undefined) {
    try {
      measureContext = document.createElement('canvas').getContext('2d') ?? null;
    } catch {
      measureContext = null;
    }
  }
  let textWidth = text.length * 8.4;
  if (measureContext) {
    const family = getComputedStyle(document.body).fontFamily || 'Inter, system-ui, sans-serif';
    measureContext.font = `800 ${HEADER_FONT_SIZE}px ${family}`;
    // Small margin covers web-font swap after first paint.
    textWidth = measureContext.measureText(text).width * 1.06;
  }
  return Math.ceil(
    textWidth +
      text.length * HEADER_LETTER_SPACING +
      HEADER_PADDING +
      (sortable ? SORT_ICON_SPACE : 0) +
      (draggable ? DRAG_HANDLE_SPACE : 0),
  );
}

export type GridSortDirection = 'asc' | 'desc';

export interface GridSortRule<SortKey extends string> {
  key: SortKey;
  direction: GridSortDirection;
}

export interface DataGridColumn<Row, SortKey extends string> {
  id: string;
  label: string;
  sortKey?: SortKey;
  align?: 'left' | 'right' | 'center';
  width?: number;
  minWidth?: number;
  /** Keeps the column visible while scrolling horizontally. Only the first column may be sticky. */
  sticky?: boolean;
  render: (row: Row) => ReactNode;
}

export interface DataGridGroup {
  key: string;
  label: string;
  secondary?: string;
}

export type GridDensity = 'comfortable' | 'compact';

interface DataGridProps<Row, SortKey extends string> {
  ariaLabel: string;
  rows: readonly Row[];
  columns: readonly DataGridColumn<Row, SortKey>[];
  getRowId: (row: Row) => string;
  sort: readonly GridSortRule<SortKey>[];
  /** `additive` is true for Shift+click, which adds a secondary sort level. */
  onSort: (key: SortKey, additive: boolean) => void;
  page: number;
  rowsPerPage: number;
  rowsPerPageOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  density?: GridDensity;
  /** Maximum CSS height of the scrolling body; the header stays pinned inside it. */
  height?: string;
  /** Grow to fill a flex parent (used by full-screen mode) instead of using `height`. */
  fill?: boolean;
  emptyTitle: string;
  emptyMessage: string;
  getRowGroup?: (row: Row) => DataGridGroup;
  collapsedGroups?: ReadonlySet<string>;
  onToggleGroup?: (key: string) => void;
  renderGroupSummary?: (rows: readonly Row[]) => ReactNode;
  /** Noun for the per-group row count, e.g. "day" → "3 days". */
  rowNoun?: { one: string; other: string };
  /**
   * Enables drag-to-reorder on column headers. Called with the dragged column and
   * the column it was dropped on; the caller owns (and persists) the order.
   */
  onColumnMove?: (columnId: string, targetId: string, place: 'before' | 'after') => void;
  /** Makes rows clickable (e.g. to open details). Clicks on buttons/links inside are ignored. */
  onRowClick?: (row: Row) => void;
}

type GridItem<Row> =
  { type: 'group'; group: DataGridGroup; rows: Row[] } | { type: 'row'; row: Row };

const HEADER_BG = 'var(--g-base)';
const STICKY_SHADOW = '6px 0 10px -6px var(--g-lo)';

/**
 * Keeps a horizontal scrollbar above the grid in sync with the grid's own
 * scrollbar, so wide tables can be scrolled without reaching the bottom.
 */
function useSyncedTopScrollbar(deps: readonly unknown[]) {
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [clientWidth, setClientWidth] = useState(0);
  const syncing = useRef(false);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      setScrollWidth(body.scrollWidth);
      setClientWidth(body.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    if (body.firstElementChild) observer.observe(body.firstElementChild);
    return () => observer.disconnect();
  }, deps);

  const mirror = useCallback((from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to) return;
    if (syncing.current) {
      syncing.current = false;
      return;
    }
    syncing.current = true;
    to.scrollLeft = from.scrollLeft;
  }, []);

  return {
    topRef,
    bodyRef,
    hasOverflow: scrollWidth > clientWidth + 1,
    scrollWidth,
    clientWidth,
    onTopScroll: () => mirror(topRef.current, bodyRef.current),
    onBodyScroll: () => mirror(bodyRef.current, topRef.current),
  };
}

export function DataGrid<Row, SortKey extends string>({
  ariaLabel,
  rows,
  columns,
  getRowId,
  sort,
  onSort,
  page,
  rowsPerPage,
  rowsPerPageOptions = [25, 50, 100, 250],
  onPageChange,
  onRowsPerPageChange,
  density = 'comfortable',
  height = '60vh',
  fill = false,
  emptyTitle,
  emptyMessage,
  getRowGroup,
  collapsedGroups,
  onToggleGroup,
  renderGroupSummary,
  rowNoun = { one: 'day', other: 'days' },
  onColumnMove,
  onRowClick,
}: DataGridProps<Row, SortKey>) {
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; place: 'before' | 'after' } | null>(
    null,
  );
  const canReorder = (column: DataGridColumn<Row, SortKey>) =>
    Boolean(onColumnMove) && !column.sticky;
  const endDrag = () => {
    setDragColumnId(null);
    setDropTarget(null);
  };
  const dropPlace = (event: DragEvent<HTMLElement>): 'before' | 'after' => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  };
  // Grouped grids paginate over group headers and rows together, so a
  // collapsed group takes one line and expanding it reflows the pages.
  const items = useMemo<GridItem<Row>[]>(() => {
    if (!getRowGroup) return rows.map((row) => ({ type: 'row', row }));
    const groups: Array<{ group: DataGridGroup; rows: Row[] }> = [];
    const byKey = new Map<string, { group: DataGridGroup; rows: Row[] }>();
    for (const row of rows) {
      const group = getRowGroup(row);
      let entry = byKey.get(group.key);
      if (!entry) {
        entry = { group, rows: [] };
        byKey.set(group.key, entry);
        groups.push(entry);
      }
      entry.rows.push(row);
    }
    return groups.flatMap(({ group, rows: groupRows }) => [
      { type: 'group' as const, group, rows: groupRows },
      ...(collapsedGroups?.has(group.key)
        ? []
        : groupRows.map((row) => ({ type: 'row' as const, row }))),
    ]);
  }, [collapsedGroups, getRowGroup, rows]);

  const lastPage = Math.max(0, Math.ceil(items.length / rowsPerPage) - 1);
  const currentPage = Math.min(page, lastPage);
  const pageItems = items.slice(currentPage * rowsPerPage, (currentPage + 1) * rowsPerPage);
  const rowHeight = density === 'compact' ? 40 : 56;
  const cellPy = density === 'compact' ? 0.5 : 1;
  const gridTemplateColumns = useMemo(
    () =>
      columns
        .map((column) => {
          const headerWidth = headerLabelWidth(
            column.label,
            Boolean(column.sortKey),
            Boolean(onColumnMove) && !column.sticky,
          );
          if (column.width) return `${Math.max(column.width, headerWidth)}px`;
          const minWidth = Math.max(column.minWidth ?? 120, headerWidth);
          return `minmax(${minWidth}px, ${minWidth}fr)`;
        })
        .join(' '),
    [columns, onColumnMove],
  );
  const scroll = useSyncedTopScrollbar([columns, pageItems.length, density]);

  const sortIndex = (key: SortKey | undefined) =>
    key ? sort.findIndex((rule) => rule.key === key) : -1;

  const cellBase = (column: DataGridColumn<Row, SortKey>) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      column.align === 'right' ? 'flex-end' : column.align === 'center' ? 'center' : 'flex-start',
    minWidth: 0,
    px: 1.5,
    ...(column.sticky
      ? { position: 'sticky' as const, left: 0, zIndex: 1, boxShadow: STICKY_SHADOW }
      : {}),
  });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...(fill ? { flex: 1 } : {}),
        overflow: 'hidden',
        borderRadius: '20px',
        bgcolor: 'var(--g-base)',
        boxShadow: 'var(--g-raised)',
        border: '1px solid var(--g-border)',
      }}
    >
      {/* Top horizontal scrollbar, mirrored with the grid body. */}
      <Box
        ref={scroll.topRef}
        onScroll={scroll.onTopScroll}
        aria-hidden
        sx={{
          display: scroll.hasOverflow ? 'block' : 'none',
          flex: '0 0 auto',
          overflowX: 'auto',
          overflowY: 'hidden',
          height: 14,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'var(--g-base)',
        }}
      >
        <Box sx={{ width: scroll.scrollWidth, height: 1 }} />
      </Box>

      <Box
        ref={scroll.bodyRef}
        onScroll={scroll.onBodyScroll}
        role="table"
        aria-label={ariaLabel}
        aria-rowcount={rows.length + 1}
        sx={{ flex: 1, minHeight: 240, maxHeight: fill ? 'none' : height, overflow: 'auto' }}
      >
        <Box sx={{ minWidth: '100%', width: 'max-content' }}>
          {/* Header */}
          <Box
            role="row"
            sx={{
              display: 'grid',
              gridTemplateColumns,
              position: 'sticky',
              top: 0,
              zIndex: 3,
              height: 44,
              bgcolor: HEADER_BG,
              borderBottom: '1px solid',
              borderColor: 'var(--g-border)',
            }}
          >
            {columns.map((column) => {
              const index = sortIndex(column.sortKey);
              const rule = index >= 0 ? sort[index] : undefined;
              const label = (
                <Typography
                  noWrap
                  sx={{
                    fontSize: HEADER_FONT_SIZE,
                    fontWeight: 800,
                    letterSpacing: `${HEADER_LETTER_SPACING}px`,
                    textTransform: 'uppercase',
                    color: rule ? 'text.primary' : 'text.secondary',
                  }}
                >
                  {column.label}
                </Typography>
              );
              return (
                <Box
                  key={column.id}
                  role="columnheader"
                  aria-sort={
                    rule ? (rule.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  draggable={canReorder(column)}
                  onDragStart={(event: DragEvent<HTMLElement>) => {
                    if (!canReorder(column)) return;
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', column.id);
                    setDragColumnId(column.id);
                  }}
                  onDragOver={(event: DragEvent<HTMLElement>) => {
                    if (!dragColumnId || dragColumnId === column.id || !canReorder(column)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const place = dropPlace(event);
                    if (dropTarget?.id !== column.id || dropTarget.place !== place) {
                      setDropTarget({ id: column.id, place });
                    }
                  }}
                  onDrop={(event: DragEvent<HTMLElement>) => {
                    event.preventDefault();
                    if (dragColumnId && dragColumnId !== column.id && canReorder(column)) {
                      onColumnMove?.(dragColumnId, column.id, dropPlace(event));
                    }
                    endDrag();
                  }}
                  onDragEnd={endDrag}
                  sx={{
                    ...cellBase(column),
                    bgcolor: HEADER_BG,
                    zIndex: column.sticky ? 4 : 1,
                    gap: 0.25,
                    opacity: dragColumnId === column.id ? 0.45 : 1,
                    boxShadow:
                      dropTarget?.id === column.id
                        ? `inset ${dropTarget.place === 'before' ? 2 : -2}px 0 0 var(--g-accent)`
                        : column.sticky
                          ? STICKY_SHADOW
                          : undefined,
                    '&:hover .drag-handle': { opacity: 0.8 },
                  }}
                >
                  {canReorder(column) && (
                    <Tooltip title="Drag to move column" enterDelay={600}>
                      <Box
                        className="drag-handle"
                        aria-hidden
                        sx={{
                          display: 'inline-flex',
                          flexShrink: 0,
                          ml: -0.75,
                          color: 'text.disabled',
                          cursor: 'grab',
                          opacity: 0.35,
                          transition: 'opacity 120ms ease',
                        }}
                      >
                        <GripVertical size={13} />
                      </Box>
                    </Tooltip>
                  )}
                  {column.sortKey ? (
                    <Tooltip
                      title="Click to sort · Shift+click to add a sort level"
                      enterDelay={600}
                    >
                      <ButtonBase
                        onClick={(event: MouseEvent) => onSort(column.sortKey!, event.shiftKey)}
                        sx={{
                          gap: 0.6,
                          py: 0.5,
                          px: 0.5,
                          mx: -0.5,
                          borderRadius: 1,
                          maxWidth: '100%',
                          '&:hover .sort-icon': { opacity: 1 },
                        }}
                      >
                        {label}
                        <Box
                          className="sort-icon"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: rule ? 'primary.main' : 'text.disabled',
                            opacity: rule ? 1 : 0.45,
                          }}
                        >
                          {rule?.direction === 'asc' ? (
                            <ArrowUp size={13} />
                          ) : rule?.direction === 'desc' ? (
                            <ArrowDown size={13} />
                          ) : (
                            <ArrowUpDown size={13} />
                          )}
                          {rule && sort.length > 1 && (
                            <Typography sx={{ ml: 0.25, fontSize: 10.5, fontWeight: 850 }}>
                              {index + 1}
                            </Typography>
                          )}
                        </Box>
                      </ButtonBase>
                    </Tooltip>
                  ) : (
                    label
                  )}
                </Box>
              );
            })}
          </Box>

          {/* Body */}
          {pageItems.length === 0 ? (
            <Box sx={{ position: 'sticky', left: 0, width: scroll.clientWidth || '100%' }}>
              <Stack sx={{ minHeight: 260, alignItems: 'center', justifyContent: 'center', px: 2 }}>
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    mb: 1.25,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '12px',
                    bgcolor: 'var(--g-base)',
                    boxShadow: 'var(--g-raised-sm)',
                    color: 'var(--g-accent)',
                  }}
                >
                  <Inbox size={20} />
                </Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 800 }}>{emptyTitle}</Typography>
                <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 12 }}>
                  {emptyMessage}
                </Typography>
              </Stack>
            </Box>
          ) : (
            pageItems.map((item, index) => {
              if (item.type === 'group') {
                const collapsed = collapsedGroups?.has(item.group.key) ?? false;
                return (
                  <Box
                    key={`group:${item.group.key}`}
                    role="row"
                    sx={{
                      position: 'relative',
                      borderTop: index === 0 ? 0 : '1px solid',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'var(--g-accent-soft)',
                    }}
                  >
                    <Stack
                      direction="row"
                      role="cell"
                      sx={{
                        position: 'sticky',
                        left: 0,
                        width: 'fit-content',
                        maxWidth: '100vw',
                        alignItems: 'center',
                        gap: 1.25,
                        minHeight: density === 'compact' ? 38 : 46,
                        px: 1,
                      }}
                    >
                      {onToggleGroup && (
                        <IconButton
                          size="small"
                          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${item.group.label}`}
                          aria-expanded={!collapsed}
                          onClick={() => onToggleGroup(item.group.key)}
                        >
                          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        </IconButton>
                      )}
                      <Typography sx={{ fontSize: 13, fontWeight: 850, whiteSpace: 'nowrap' }}>
                        {item.group.label}
                      </Typography>
                      {item.group.secondary && (
                        <Typography
                          sx={{ color: 'text.secondary', fontSize: 11, whiteSpace: 'nowrap' }}
                        >
                          {item.group.secondary}
                        </Typography>
                      )}
                      <Typography
                        sx={{
                          px: 0.75,
                          py: 0.15,
                          borderRadius: '6px',
                          bgcolor: 'var(--g-base)',
                          border: '1px solid',
                          borderColor: 'divider',
                          fontSize: 11.5,
                          fontWeight: 750,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.rows.length} {item.rows.length === 1 ? rowNoun.one : rowNoun.other}
                      </Typography>
                      {renderGroupSummary?.(item.rows)}
                    </Stack>
                  </Box>
                );
              }
              const zebra = index % 2 === 1;
              return (
                <Box
                  key={getRowId(item.row)}
                  role="row"
                  onClick={
                    onRowClick
                      ? (event: MouseEvent<HTMLElement>) => {
                          const target = event.target as HTMLElement;
                          if (target.closest('button, a, input, [role=button]')) return;
                          onRowClick(item.row);
                        }
                      : undefined
                  }
                  sx={{
                    cursor: onRowClick ? 'pointer' : undefined,
                    display: 'grid',
                    gridTemplateColumns,
                    minHeight: rowHeight,
                    borderBottom: '1px solid',
                    borderColor: 'var(--g-line)',
                    bgcolor: zebra
                      ? 'color-mix(in srgb, var(--g-lo) 14%, var(--g-base))'
                      : 'var(--g-base)',
                    '& > [role=cell]': {
                      bgcolor: zebra
                        ? 'color-mix(in srgb, var(--g-lo) 14%, var(--g-base))'
                        : 'var(--g-base)',
                    },
                    '&:hover, &:hover > [role=cell]': {
                      bgcolor: 'color-mix(in srgb, var(--g-accent) 10%, var(--g-base))',
                    },
                  }}
                >
                  {columns.map((column) => (
                    <Box
                      key={column.id}
                      role="cell"
                      sx={{ ...cellBase(column), py: cellPy, fontSize: 12.5 }}
                    >
                      {column.render(item.row)}
                    </Box>
                  ))}
                </Box>
              );
            })
          )}
        </Box>
      </Box>

      <TablePagination
        component="div"
        count={items.length}
        page={currentPage}
        rowsPerPage={rowsPerPage}
        onPageChange={(_event, nextPage) => onPageChange(nextPage)}
        onRowsPerPageChange={(event) => onRowsPerPageChange(Number(event.target.value))}
        rowsPerPageOptions={rowsPerPageOptions}
        labelRowsPerPage="Rows per page"
        sx={{
          flex: '0 0 auto',
          minHeight: 52,
          bgcolor: 'var(--g-base)',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      />
    </Box>
  );
}

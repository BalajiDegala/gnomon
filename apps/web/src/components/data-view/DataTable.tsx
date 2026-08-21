import {
  Box,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Typography,
  type TableCellProps,
} from '@mui/material';
import { Inbox } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface DataTableColumn<Row, SortKey extends string> {
  id: string;
  label: string;
  sortKey?: SortKey;
  align?: TableCellProps['align'];
  width?: number | string;
  minWidth?: number;
  hideBelow?: 'sm' | 'md';
  render: (row: Row) => ReactNode;
}

interface DataTableProps<Row, SortKey extends string> {
  ariaLabel: string;
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row, SortKey>[];
  getRowId: (row: Row) => string;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  page: number;
  rowsPerPage: number;
  rowsPerPageOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  onRowClick?: (row: Row) => void;
  isLoading?: boolean;
  emptyTitle: string;
  emptyMessage: string;
  getRowGroup?: (row: Row) => { key: string; label: string; secondary?: string };
}

function responsiveCellSx(hideBelow: 'sm' | 'md' | undefined) {
  if (hideBelow === 'sm') return { display: { xs: 'none', sm: 'table-cell' } };
  if (hideBelow === 'md') return { display: { xs: 'none', md: 'table-cell' } };
  return undefined;
}

export function DataTable<Row, SortKey extends string>({
  ariaLabel,
  rows,
  columns,
  getRowId,
  sortKey,
  sortDirection,
  onSort,
  page,
  rowsPerPage,
  rowsPerPageOptions = [10, 25, 50, 100],
  onPageChange,
  onRowsPerPageChange,
  onRowClick,
  isLoading = false,
  emptyTitle,
  emptyMessage,
  getRowGroup,
}: DataTableProps<Row, SortKey>) {
  const visibleRows = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const emptyRows = Math.max(0, rowsPerPage - visibleRows.length);
  const groupCounts = new Map<string, number>();
  if (getRowGroup) {
    for (const row of rows) {
      const group = getRowGroup(row);
      groupCounts.set(group.key, (groupCounts.get(group.key) ?? 0) + 1);
    }
  }

  return (
    <Box
      sx={{
        overflow: 'hidden',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '22px',
        bgcolor: '#fff',
        boxShadow: '0 16px 42px rgba(20,32,51,.065)',
      }}
    >
      <TableContainer sx={{ bgcolor: '#fff' }}>
        <Table stickyHeader size="small" aria-label={ariaLabel}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align}
                  sortDirection={column.sortKey === sortKey ? sortDirection : false}
                  sx={{
                    ...responsiveCellSx(column.hideBelow),
                    width: column.width,
                    minWidth: column.minWidth,
                    height: 48,
                    bgcolor: '#f1f5f7',
                    color: 'text.secondary',
                    fontSize: 10,
                    fontWeight: 850,
                    letterSpacing: 0.55,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {column.sortKey ? (
                    <TableSortLabel
                      active={column.sortKey === sortKey}
                      direction={column.sortKey === sortKey ? sortDirection : 'asc'}
                      onClick={() => onSort(column.sortKey!)}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : (
                    column.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  {columns.map((column) => (
                    <TableCell key={column.id} sx={responsiveCellSx(column.hideBelow)}>
                      <Skeleton height={24} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : visibleRows.length ? (
              visibleRows.map((row, index) => {
                const group = getRowGroup?.(row);
                const previousGroup = index > 0 ? getRowGroup?.(visibleRows[index - 1]!) : null;
                const showGroup = Boolean(group && group.key !== previousGroup?.key);
                return (
                  <Fragment key={getRowId(row)}>
                    {showGroup && group && (
                      <TableRow>
                        <TableCell
                          colSpan={columns.length}
                          sx={{
                            py: 1,
                            bgcolor: '#eaf3f5',
                            borderTop: index === 0 ? 0 : '1px solid',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography component="span" sx={{ fontSize: 12, fontWeight: 850 }}>
                            {group.label}
                          </Typography>
                          {group.secondary && (
                            <Typography
                              component="span"
                              sx={{ ml: 1, color: 'text.secondary', fontSize: 10.5 }}
                            >
                              {group.secondary}
                            </Typography>
                          )}
                          <Typography
                            component="span"
                            sx={{ ml: 1, color: 'text.secondary', fontSize: 10.5 }}
                          >
                            · {groupCounts.get(group.key) ?? 0} records
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow
                      hover={Boolean(onRowClick)}
                      tabIndex={onRowClick ? 0 : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={
                        onRowClick
                          ? (event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onRowClick(row);
                              }
                            }
                          : undefined
                      }
                      sx={{
                        height: 56,
                        cursor: onRowClick ? 'pointer' : 'default',
                        transition: 'background-color 150ms ease, box-shadow 150ms ease',
                        '&:hover': { bgcolor: onRowClick ? '#f3fafb !important' : undefined },
                        '&:hover td:first-of-type': onRowClick
                          ? { boxShadow: 'inset 3px 0 0 #2bb4c0' }
                          : undefined,
                        '&:last-child td': { borderBottom: 0 },
                      }}
                    >
                      {columns.map((column) => (
                        <TableCell
                          key={column.id}
                          align={column.align}
                          sx={{
                            ...responsiveCellSx(column.hideBelow),
                            py: 1,
                            fontSize: 12.5,
                          }}
                        >
                          {column.render(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Box
                    sx={{
                      minHeight: 240,
                      display: 'grid',
                      placeItems: 'center',
                      px: 2,
                      background:
                        'radial-gradient(circle at center, rgba(18,148,161,.045), transparent 36%)',
                    }}
                  >
                    <Box sx={{ textAlign: 'center' }}>
                      <Box
                        sx={{
                          width: 46,
                          height: 46,
                          mx: 'auto',
                          mb: 1.25,
                          display: 'grid',
                          placeItems: 'center',
                          borderRadius: 2.5,
                          bgcolor: '#eaf5f6',
                          color: '#188d99',
                          boxShadow: '0 8px 22px rgba(18,148,161,.08)',
                        }}
                      >
                        <Inbox size={20} />
                      </Box>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 820 }}>{emptyTitle}</Typography>
                      <Typography sx={{ mt: 0.4, color: 'text.secondary', fontSize: 11.5 }}>
                        {emptyMessage}
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && visibleRows.length > 0 && emptyRows > 0 && rows.length > rowsPerPage && (
              <TableRow sx={{ height: 52 * emptyRows }}>
                <TableCell colSpan={columns.length} />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={rows.length}
        page={Math.min(page, Math.max(0, Math.ceil(rows.length / rowsPerPage) - 1))}
        rowsPerPage={rowsPerPage}
        onPageChange={(_event, nextPage) => onPageChange(nextPage)}
        onRowsPerPageChange={(event) => onRowsPerPageChange(Number(event.target.value))}
        rowsPerPageOptions={rowsPerPageOptions}
        labelRowsPerPage="Rows"
        sx={{
          minHeight: 56,
          bgcolor: '#f7fafb',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      />
    </Box>
  );
}

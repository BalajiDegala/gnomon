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
import type { ReactNode } from 'react';

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
}: DataTableProps<Row, SortKey>) {
  const visibleRows = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const emptyRows = Math.max(0, rowsPerPage - visibleRows.length);

  return (
    <Box
      sx={{ overflow: 'hidden', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
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
                    height: 44,
                    bgcolor: '#f7f9fb',
                    color: 'text.secondary',
                    fontSize: 11,
                    fontWeight: 800,
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
              visibleRows.map((row) => (
                <TableRow
                  key={getRowId(row)}
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
                    height: 52,
                    cursor: onRowClick ? 'pointer' : 'default',
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
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <Box sx={{ minHeight: 220, display: 'grid', placeItems: 'center', px: 2 }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 800 }}>{emptyTitle}</Typography>
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
        sx={{ bgcolor: '#fff', borderTop: '1px solid', borderColor: 'divider' }}
      />
    </Box>
  );
}

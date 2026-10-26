import { varAlpha } from 'minimal-shared/utils';
import { useMemo, useState, useEffect, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import TableContainer from '@mui/material/TableContainer';
import TablePagination from '@mui/material/TablePagination';

// ----------------------------------------------------------------------

export const bpmTableSx = {
  borderCollapse: 'separate',
  borderSpacing: 0,
  '& .MuiTableCell-root': {
    borderBottom: (theme: { vars: { palette: { grey: { '500Channel': string } } } }) =>
      `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.14)}`,
    borderRight: (theme: { vars: { palette: { grey: { '500Channel': string } } } }) =>
      `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.08)}`,
    py: 1.35,
    px: { xs: 2, lg: 1.25, xl: 2 },
    fontSize: 13,
    verticalAlign: 'middle',
    '&:last-of-type': { borderRight: 'none' },
  },
  '& .MuiTableHead-root .MuiTableCell-root': {
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: 0.2,
    color: 'text.secondary',
    bgcolor: (theme: { vars: { palette: { grey: { '500Channel': string } } } }) =>
      varAlpha(theme.vars.palette.grey['500Channel'], 0.06),
    whiteSpace: 'nowrap',
  },
  '& .MuiTableBody-root .MuiTableRow-root:hover .MuiTableCell-root': {
    bgcolor: (theme: { vars: { palette: { primary: { mainChannel: string } } } }) =>
      varAlpha(theme.vars.palette.primary.mainChannel, 0.04),
  },
  '& .MuiTableBody-root .MuiTableRow-root:last-of-type .MuiTableCell-root': {
    borderBottom: 'none',
  },
} as const;

export function useBpmTablePagination<T>(rows: T[], defaultRowsPerPage = 10) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);

  useEffect(() => {
    setPage(0);
  }, [rows.length, rowsPerPage]);

  const pageRows = useMemo(
    () => rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [rows, page, rowsPerPage],
  );

  return {
    page,
    setPage,
    rowsPerPage,
    setRowsPerPage,
    pageRows,
    total: rows.length,
  };
}

type BpmTableCardProps = {
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  totalLabel: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function BpmTableCard({
  searchLabel = 'Search',
  searchPlaceholder,
  searchValue,
  onSearchChange,
  totalLabel,
  children,
  footer,
}: BpmTableCardProps) {
  return (
    <Card
      sx={{
        overflow: 'hidden',
        border: (theme) => `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.12)}`,
        boxShadow: (theme) => theme.shadows[1],
      }}
    >
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{
          p: 2,
          alignItems: { sm: 'center' },
          borderBottom: (theme) =>
            `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.1)}`,
          bgcolor: (theme) => varAlpha(theme.vars.palette.grey['500Channel'], 0.02),
        }}
      >
        <TextField
          size="small"
          label={searchLabel}
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {totalLabel}
        </Typography>
      </Stack>
      <TableContainer>
        <Table size="small" sx={bpmTableSx}>
          {children}
        </Table>
      </TableContainer>
      {footer}
    </Card>
  );
}

type BpmTablePaginationProps = {
  page: number;
  rowsPerPage: number;
  total: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  rowsPerPageOptions?: number[];
};

export function BpmTablePagination({
  page,
  rowsPerPage,
  total,
  onPageChange,
  onRowsPerPageChange,
  rowsPerPageOptions = [5, 10, 25, 50],
}: BpmTablePaginationProps) {
  if (total <= rowsPerPage) {
    return null;
  }

  return (
    <Box
      sx={{
        borderTop: (theme) => `1px solid ${varAlpha(theme.vars.palette.grey['500Channel'], 0.1)}`,
      }}
    >
      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={rowsPerPageOptions}
        onPageChange={(_, nextPage) => onPageChange(nextPage)}
        onRowsPerPageChange={(event) => {
          onRowsPerPageChange(parseInt(event.target.value, 10));
          onPageChange(0);
        }}
      />
    </Box>
  );
}

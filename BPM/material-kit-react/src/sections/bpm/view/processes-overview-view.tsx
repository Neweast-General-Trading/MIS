import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useRouter } from 'src/routes/hooks';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { fetchDepartments } from 'src/sections/bpm/api';
import { useCompanies } from 'src/sections/bpm/companies';
import { downloadProcessWorkbook } from 'src/sections/bpm/process-export';
import { companyDisplayLabel } from 'src/sections/bpm/company-display.util';
import { ProcessEditDialog } from 'src/sections/bpm/components/process-edit-dialog';
import { type BpmProcess, type DepartmentFolder, folderOrgDepartmentName } from 'src/sections/bpm/storage';
import {
  BpmTableCard,
  BpmTablePagination,
  useBpmTablePagination,
} from 'src/sections/bpm/components/bpm-table-kit';

type ProcessRow = {
  departmentId: string;
  departmentCode: string;
  processFunctionName: string;
  orgDepartmentName: string;
  process: BpmProcess;
};

export function ProcessesOverviewView() {
  const router = useRouter();
  const { companies } = useCompanies();
  const [departments, setDepartments] = useState<DepartmentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editRow, setEditRow] = useState<ProcessRow | null>(null);

  useEffect(() => {
    fetchDepartments()
      .then((items) => setDepartments(items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo<ProcessRow[]>(
    () =>
      departments
        .flatMap((department) =>
          (department.processes ?? []).map((process) => ({
            departmentId: department.id,
            departmentCode: department.code,
            processFunctionName: department.name,
            orgDepartmentName: folderOrgDepartmentName(department),
            process,
          }))
        )
        .sort(
          (a, b) => new Date(a.process.createdAt).getTime() - new Date(b.process.createdAt).getTime()
        ),
    [departments]
  );

  const filteredRows = useMemo(() => {
    const byDept =
      selectedDepartmentId === 'all'
        ? rows
        : rows.filter((row) => row.departmentId === selectedDepartmentId);
    const byCompany =
      selectedCompany === 'all'
        ? byDept
        : byDept.filter((row) => row.process.companyCode === selectedCompany);
    const q = search.trim().toLowerCase();
    if (!q) return byCompany;
    return byCompany.filter((row) => {
      const p = row.process;
      const owners = (p.processOwners ?? []).join(' ');
      const hay =
        `${row.processFunctionName} ${row.orgDepartmentName} ${row.departmentCode} ${p.code} ${p.name} ${p.processName ?? ''} ${p.companyCode ?? ''} ${owners}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, selectedDepartmentId, selectedCompany, search]);

  const { page, setPage, rowsPerPage, setRowsPerPage, pageRows, total } = useBpmTablePagination(
    filteredRows,
    10,
  );

  const mergeProcessUpdate = (departmentId: string, updated: BpmProcess) => {
    setDepartments((prev) =>
      prev.map((d) =>
        d.id === departmentId
          ? {
              ...d,
              processes: (d.processes ?? []).map((p) => (p.id === updated.id ? updated : p)),
            }
          : d
      )
    );
  };

  return (
    <DashboardContent maxWidth={false}>
      <Stack spacing={3}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h4">Process</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              Same process list as under each process function, with filters.
            </Typography>
          </Box>
          <Button variant="outlined" onClick={() => router.push('/departments')}>
            Process Functions
          </Button>
        </Box>

        <Card sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
            <TextField
              select
              label="Process function"
              value={selectedDepartmentId}
              onChange={(event) => setSelectedDepartmentId(event.target.value)}
              sx={{ minWidth: 240 }}
            >
              <MenuItem value="all">All process functions</MenuItem>
              {departments.map((department) => (
                <MenuItem key={department.id} value={department.id}>
                  {department.name} ({department.code})
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Company"
              value={selectedCompany}
              onChange={(event) => setSelectedCompany(event.target.value)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All companies</MenuItem>
              {companies.map((company) => (
                <MenuItem key={company.code} value={company.code}>
                  {companyDisplayLabel(companies, company.code)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Card>

        <BpmTableCard
          searchLabel="Search (code or name)"
          searchPlaceholder="Filter processes…"
          searchValue={search}
          onSearchChange={setSearch}
          totalLabel={`${total} process(es)`}
          footer={
            <BpmTablePagination
              page={page}
              rowsPerPage={rowsPerPage}
              total={total}
              onPageChange={setPage}
              onRowsPerPageChange={setRowsPerPage}
            />
          }
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 140 }}>Company</TableCell>
              <TableCell sx={{ width: 180 }}>Process Functions</TableCell>
              <TableCell sx={{ width: 130 }}>Code</TableCell>
              <TableCell>Process name</TableCell>
              <TableCell sx={{ width: 120 }} align="right">
                # Sub-processes
              </TableCell>
              <TableCell align="right">Actions</TableCell>
              <TableCell sx={{ width: 160 }}>Created At</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                  Loading processes...
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pageRows.map((row) => (
                <TableRow key={row.process.id} hover>
                  <TableCell>{companyDisplayLabel(companies, row.process.companyCode)}</TableCell>
                  <TableCell>{row.processFunctionName}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{row.process.code}</TableCell>
                  <TableCell>
                    {row.process.processName?.trim() ||
                      row.process.name?.trim() ||
                      row.process.code ||
                      '—'}
                  </TableCell>
                  <TableCell align="right">{row.process.activities?.length ?? 0}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                          router.push(
                            `/departments/${row.departmentId}/processes/${row.process.id}/activities-table`
                          )
                        }
                      >
                        View Sub-processes Table
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                          downloadProcessWorkbook(row.process, {
                            orgDepartmentName: row.orgDepartmentName,
                            name: row.processFunctionName,
                          })
                        }
                      >
                        Export process (.xlsx)
                      </Button>
                      <Button size="small" variant="outlined" onClick={() => setEditRow(row)}>
                        <Iconify icon="solar:pen-bold" width={16} sx={{ mr: 0.75 }} />
                        Edit
                      </Button>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(row.process.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            {!loading && !pageRows.length && (
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                  No processes match the current filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </BpmTableCard>

        {error && <Alert severity="error">{error}</Alert>}
      </Stack>

      <ProcessEditDialog
        open={!!editRow}
        department={
          editRow ? { id: editRow.departmentId, name: editRow.processFunctionName } : null
        }
        process={editRow?.process ?? null}
        onClose={() => setEditRow(null)}
        onSaved={(finalUpdated) => {
          if (editRow) mergeProcessUpdate(editRow.departmentId, finalUpdated);
        }}
      />
    </DashboardContent>
  );
}

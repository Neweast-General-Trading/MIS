import { useMemo, useState, useEffect, useCallback } from 'react';

import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
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
import Tabs, { tabsClasses } from '@mui/material/Tabs';

import { DashboardContent } from 'src/layouts/dashboard';

import { useAccessProfile, isSuperAdminProfile } from 'src/sections/bpm/access-control';
import {
  BpmTableCard,
  BpmTablePagination,
  useBpmTablePagination,
} from 'src/sections/bpm/components/bpm-table-kit';
import {
  syncMasterDataComparison,
  fetchMasterDataComparison,
  type MasterDataComparisonResult,
} from 'src/sections/bpm/api';
import {
  compareStatusColor,
  type CompareStatus,
  summarizeCompareRows,
  type CompareDepartmentRow,
  buildDepartmentCompareRows,
  type CompareDesignationRow,
  type LegalEntityCompareRow,
  buildLegalEntityCompareRows,
  buildDesignationCompareRows,
} from 'src/sections/bpm/master-data-comparison.util';

type TabKey = 'legal_entity' | 'department' | 'designation';

type StatusFilter = 'all' | CompareStatus;

function StatusChip({ label, status }: { label: string; status: CompareStatus }) {
  return <Chip size="small" label={label} color={compareStatusColor(status)} variant="outlined" />;
}

function CompareSummaryBar({
  rows,
}: {
  rows: Array<{ status: CompareStatus }>;
}) {
  const summary = summarizeCompareRows(rows);
  if (!rows.length) return null;

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      <Chip size="small" label={`Match: ${summary.match}`} color="success" variant="outlined" />
      <Chip size="small" label={`Name differs: ${summary.mismatch}`} color="warning" variant="outlined" />
      <Chip size="small" label={`BPM only: ${summary.bpmOnly + summary.missingSql}`} color="info" variant="outlined" />
      <Chip size="small" label={`SQL only: ${summary.sqlOnly + summary.missingBpm}`} color="info" variant="outlined" />
    </Stack>
  );
}

function filterByCompanyAndSearch<T extends { bpmCode: string }>(
  rows: T[],
  companyFilter: string,
  search: string,
  searchFields: (row: T) => string[],
) {
  const company = companyFilter.trim();
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (company && row.bpmCode !== company) return false;
    if (!q) return true;
    return searchFields(row).some((value) => value.toLowerCase().includes(q));
  });
}

function filterByStatus<T extends { status: CompareStatus }>(rows: T[], statusFilter: StatusFilter) {
  if (statusFilter === 'all') return rows;
  return rows.filter((row) => row.status === statusFilter);
}

export function MasterDataComparisonView() {
  const profile = useAccessProfile();
  const isAdmin = isSuperAdminProfile(profile);

  const [tab, setTab] = useState<TabKey>('legal_entity');
  const [companyFilter, setCompanyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<MasterDataComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const loadCached = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const result = await fetchMasterDataComparison();
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  const syncFromSources = useCallback(async () => {
    if (!isAdmin) return;
    setSyncing(true);
    setError('');
    try {
      const result = await syncMasterDataComparison();
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void loadCached();
  }, [loadCached]);

  const companyOptions = useMemo(
    () => data?.companies.map((item) => item.bpmCode) ?? [],
    [data],
  );

  const legalEntityRows = useMemo(() => {
    if (!data) return [];
    const rows = buildLegalEntityCompareRows(data);
    return filterByStatus(
      filterByCompanyAndSearch(rows, companyFilter, search, (row) => [
        row.bpmCode,
        row.bpmName,
        row.sqlName,
        row.sqlDatabase,
        row.sqlBusinessUnit,
        row.statusLabel,
      ]),
      statusFilter,
    );
  }, [data, companyFilter, search, statusFilter]);

  const departmentRows = useMemo(() => {
    if (!data) return [];
    const rows = buildDepartmentCompareRows(data);
    return filterByStatus(
      filterByCompanyAndSearch(rows, companyFilter, search, (row) => [
        row.bpmCode,
        row.bpmCodeValue,
        row.bpmName,
        row.sqlCode,
        row.sqlName,
        row.statusLabel,
      ]),
      statusFilter,
    );
  }, [data, companyFilter, search, statusFilter]);

  const designationRows = useMemo(() => {
    if (!data) return [];
    const rows = buildDesignationCompareRows(data);
    return filterByStatus(
      filterByCompanyAndSearch(rows, companyFilter, search, (row) => [
        row.bpmCode,
        row.bpmName,
        row.sqlName,
        row.statusLabel,
      ]),
      statusFilter,
    );
  }, [data, companyFilter, search, statusFilter]);

  const legalPagination = useBpmTablePagination(legalEntityRows, 25);
  const departmentPagination = useBpmTablePagination(departmentRows, 25);
  const designationPagination = useBpmTablePagination(designationRows, 25);

  const pagination =
    tab === 'legal_entity'
      ? legalPagination
      : tab === 'department'
        ? departmentPagination
        : designationPagination;

  const summaryRows =
    tab === 'legal_entity'
      ? legalEntityRows
      : tab === 'department'
        ? departmentRows
        : designationRows;

  if (!isAdmin) {
    return (
      <DashboardContent>
        <Alert severity="warning">Only Super Admin can view BPM vs SQL master data.</Alert>
      </DashboardContent>
    );
  }

  return (
    <DashboardContent maxWidth={false}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ xs: 'stretch', sm: 'center' }}
          justifyContent="space-between"
        >
          <Stack spacing={0.5}>
            <Typography variant="h4">BPM vs SQL comparison</Typography>
            <Typography variant="body2" color="text.secondary">
              Side-by-side match analysis from BPM settings and SQL Server (Or_EmpMaster /
              Or_EXEmpMaster).
            </Typography>
            {data?.hasCache && data.cachedAt ? (
              <Typography variant="caption" color="text.secondary">
                Cached snapshot: {new Date(data.cachedAt).toLocaleString()}
                {data.fromCache ? ' · loaded from server cache' : ' · just synced from SQL'}
                {' · '}SQL {data.sqlConfigured ? 'connected' : 'not configured'}
                {data.sqlDatabases?.length ? ` · DB: ${data.sqlDatabases.join(', ')}` : ''}
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No cached snapshot yet. Click Sync to load SQL master data once.
              </Typography>
            )}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => void loadCached()} disabled={loading || syncing}>
              {loading ? 'Loading…' : 'Reload cache'}
            </Button>
            <Button variant="contained" onClick={() => void syncFromSources()} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync from SQL'}
            </Button>
          </Stack>
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {!loading && !syncing && data && !data.hasCache ? (
          <Alert severity="info">
            Click <strong>Sync from SQL</strong> to build the comparison snapshot.
          </Alert>
        ) : null}

        {data?.errors.length ? (
          <Alert severity="warning">
            Partial load errors:{' '}
            {data.errors
              .slice(0, 6)
              .map((item) => `${item.bpmCode} (${item.source}): ${item.message}`)
              .join(' · ')}
          </Alert>
        ) : null}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            label="Company"
            value={companyFilter}
            onChange={(event) => setCompanyFilter(event.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">All companies</MenuItem>
            {companyOptions.map((code) => (
              <MenuItem key={code} value={code}>
                {code}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Comparison status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">All statuses</MenuItem>
            <MenuItem value="match">Match</MenuItem>
            <MenuItem value="mismatch">Name differs</MenuItem>
            <MenuItem value="bpm_only">BPM only</MenuItem>
            <MenuItem value="sql_only">SQL only</MenuItem>
            <MenuItem value="missing_bpm">Missing BPM</MenuItem>
            <MenuItem value="missing_sql">Missing SQL</MenuItem>
          </TextField>
        </Stack>

        <CompareSummaryBar rows={summaryRows} />

        <Tabs
          value={tab}
          onChange={(_event, value: TabKey) => setTab(value)}
          sx={{
            px: 0.5,
            [`& .${tabsClasses.flexContainer}`]: { gap: 1 },
          }}
        >
          <Tab value="legal_entity" label="Legal Entity" />
          <Tab value="department" label="Department" />
          <Tab value="designation" label="Designation" />
        </Tabs>

        <BpmTableCard
          searchLabel="Search"
          searchPlaceholder={
            tab === 'legal_entity'
              ? 'Company, BPM, SQL, status…'
              : tab === 'department'
                ? 'Company, BPM code/name, SQL name…'
                : 'Company, BPM/SQL designation…'
          }
          searchValue={search}
          onSearchChange={setSearch}
          totalLabel={`${pagination.total} row(s)`}
          footer={
            <BpmTablePagination
              page={pagination.page}
              rowsPerPage={pagination.rowsPerPage}
              total={pagination.total}
              onPageChange={pagination.setPage}
              onRowsPerPageChange={pagination.setRowsPerPage}
              rowsPerPageOptions={[10, 25, 50, 100, 200]}
            />
          }
        >
          {tab === 'legal_entity' ? (
            <>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 90 }}>Company</TableCell>
                  <TableCell sx={{ width: 110 }}>Status</TableCell>
                  <TableCell>BPM legal entity</TableCell>
                  <TableCell>SQL legal entity</TableCell>
                  <TableCell sx={{ width: 140 }}>SQL database</TableCell>
                  <TableCell sx={{ width: 160 }}>SQL business unit</TableCell>
                  <TableCell sx={{ width: 90 }} align="right">
                    Employees
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && !legalPagination.pageRows.length ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 5, color: 'text.secondary' }}>
                      Loading cached snapshot…
                    </TableCell>
                  </TableRow>
                ) : null}
                {syncing && !legalPagination.pageRows.length ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 5, color: 'text.secondary' }}>
                      Syncing from SQL…
                    </TableCell>
                  </TableRow>
                ) : null}
                {!loading &&
                  (legalPagination.pageRows as LegalEntityCompareRow[]).map((row) => (
                    <TableRow key={row.bpmCode} hover>
                      <TableCell>{row.bpmCode}</TableCell>
                      <TableCell>
                        <StatusChip label={row.statusLabel} status={row.status} />
                      </TableCell>
                      <TableCell>{row.bpmName}</TableCell>
                      <TableCell>{row.sqlName}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {row.sqlDatabase}
                      </TableCell>
                      <TableCell>{row.sqlBusinessUnit}</TableCell>
                      <TableCell align="right">{row.sqlEmployeeCount}</TableCell>
                    </TableRow>
                  ))}
                {!loading && !syncing && !legalPagination.pageRows.length ? (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ py: 5, color: 'text.secondary' }}>
                      No rows match your filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </>
          ) : null}

          {tab === 'department' ? (
            <>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 90 }}>Company</TableCell>
                  <TableCell sx={{ width: 110 }}>Status</TableCell>
                  <TableCell sx={{ width: 100 }}>BPM code</TableCell>
                  <TableCell>BPM department</TableCell>
                  <TableCell sx={{ width: 120 }}>SQL code</TableCell>
                  <TableCell>SQL department</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && !departmentPagination.pageRows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 5, color: 'text.secondary' }}>
                      Loading cached snapshot…
                    </TableCell>
                  </TableRow>
                ) : null}
                {!loading &&
                  (departmentPagination.pageRows as CompareDepartmentRow[]).map((row, index) => (
                    <TableRow
                      key={`${row.bpmCode}-${row.bpmCodeValue}-${row.sqlCode}-${index}`}
                      hover
                    >
                      <TableCell>{row.bpmCode}</TableCell>
                      <TableCell>
                        <StatusChip label={row.statusLabel} status={row.status} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {row.bpmCodeValue}
                      </TableCell>
                      <TableCell>{row.bpmName}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {row.sqlCode}
                      </TableCell>
                      <TableCell>{row.sqlName}</TableCell>
                    </TableRow>
                  ))}
                {!loading && !syncing && !departmentPagination.pageRows.length ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 5, color: 'text.secondary' }}>
                      No rows match your filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </>
          ) : null}

          {tab === 'designation' ? (
            <>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 90 }}>Company</TableCell>
                  <TableCell sx={{ width: 110 }}>Status</TableCell>
                  <TableCell>BPM designation (RACI saved)</TableCell>
                  <TableCell>SQL designation (Job / Position)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && !designationPagination.pageRows.length ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ py: 5, color: 'text.secondary' }}>
                      Loading cached snapshot…
                    </TableCell>
                  </TableRow>
                ) : null}
                {!loading &&
                  (designationPagination.pageRows as CompareDesignationRow[]).map((row, index) => (
                    <TableRow key={`${row.bpmCode}-${row.bpmName}-${row.sqlName}-${index}`} hover>
                      <TableCell>{row.bpmCode}</TableCell>
                      <TableCell>
                        <StatusChip label={row.statusLabel} status={row.status} />
                      </TableCell>
                      <TableCell>{row.bpmName}</TableCell>
                      <TableCell>{row.sqlName}</TableCell>
                    </TableRow>
                  ))}
                {!loading && !syncing && !designationPagination.pageRows.length ? (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ py: 5, color: 'text.secondary' }}>
                      No rows match your filters.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </>
          ) : null}
        </BpmTableCard>
      </Stack>
    </DashboardContent>
  );
}

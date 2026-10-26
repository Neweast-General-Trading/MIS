import { useMemo, useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import TableContainer from '@mui/material/TableContainer';

import { useRouter } from 'src/routes/hooks';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { matchesTableSearch } from 'src/sections/bpm/table-search.util';
import { useCompanies, type CompanyCode } from 'src/sections/bpm/companies';
import { companyDisplayLabel } from 'src/sections/bpm/company-display.util';
import { BpmLocationTrail } from 'src/sections/bpm/components/bpm-location-trail';
import { ProcessEditDialog } from 'src/sections/bpm/components/process-edit-dialog';
import { CompanySelectField } from 'src/sections/bpm/components/company-select-field';
import { BpmGridImportDialog } from 'src/sections/bpm/components/bpm-grid-import-dialog';
import { hasPermission, canUseAiExport, useAccessProfile } from 'src/sections/bpm/access-control';
import { type BpmProcess, type DepartmentFolder, toDepartmentDisplayName } from 'src/sections/bpm/storage';
import {
  BpmTableCard,
  BpmTablePagination,
  useBpmTablePagination,
} from 'src/sections/bpm/components/bpm-table-kit';
import {
  useWordExportProgress,
  WordExportProgressDialog,
} from 'src/sections/bpm/components/word-export-progress-dialog';
import {
  deleteProcess,
  fetchDepartment,
  openProcessPdfInNewTab,
  downloadBpmImportTemplateXlsx,
  fetchActivityTemplatesForImport,
  type ImportWorkbookPerSheetResult,
} from 'src/sections/bpm/api';

export function DepartmentProcessesView() {
  const router = useRouter();
  const accessProfile = useAccessProfile();
  const { companies, isCompanyCode, reload: reloadCompanies, loading: companiesLoading } = useCompanies();
  /** Vendor-only users can browse but never write BPM data. */
  const canWriteBpm = hasPermission(accessProfile, 'activities');
  const { departmentId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const companyFilter = searchParams.get('company') ?? '';
  const activeCompany = isCompanyCode(companyFilter) ? companyFilter : null;

  const [department, setDepartment] = useState<DepartmentFolder | null>(null);
  const [error, setError] = useState('');
  const [printingId, setPrintingId] = useState<string | null>(null);

  const onPrintProcess = async (processId: string) => {
    setPrintingId(processId);
    try {
      await openProcessPdfInNewTab(departmentId, processId);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPrintingId(null);
    }
  };
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<BpmProcess | null>(null);

  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [importCompany, setImportCompany] = useState<CompanyCode | ''>('');
  const [importTemplateId, setImportTemplateId] = useState('');
  const [gridOwnersRaw, setGridOwnersRaw] = useState('');
  const [importError, setImportError] = useState('');
  const [templateDlBusy, setTemplateDlBusy] = useState(false);
  const [gridImportOpen, setGridImportOpen] = useState(false);
  const [gridMessage, setGridMessage] = useState('');
  const [gridError, setGridError] = useState('');
  const [perSheetLastResult, setPerSheetLastResult] = useState<ImportWorkbookPerSheetResult | null>(null);
  const [tableSearch, setTableSearch] = useState('');
  const [bundleWordNotice, setBundleWordNotice] = useState('');
  const wordExport = useWordExportProgress((warning) => setBundleWordNotice(warning ?? ''));

  useEffect(() => {
    fetchDepartment(departmentId)
      .then((item) => setDepartment(item))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [departmentId]);

  useEffect(() => {
    fetchActivityTemplatesForImport()
      .then((rows) => setTemplates(rows))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    if (department?.companyCode && isCompanyCode(department.companyCode)) {
      setImportCompany((prev) => prev || (department.companyCode as CompanyCode));
    }
  }, [department?.companyCode, isCompanyCode]);

  const onDownloadImportTemplate = async () => {
    setImportError('');
    if (!importTemplateId) {
      setImportError('Select a sub-process template first.');
      return;
    }
    setTemplateDlBusy(true);
    try {
      const t = templates.find((x) => x.id === importTemplateId);
      await downloadBpmImportTemplateXlsx(importTemplateId, t?.name);
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setTemplateDlBusy(false);
    }
  };

  const sortedProcesses = useMemo(() => {
    const list = [...(department?.processes ?? [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    if (!activeCompany) return list;
    return list.filter((p) => p.companyCode === activeCompany);
  }, [department?.processes, activeCompany]);

  const filteredProcesses = useMemo(() => {
    if (!tableSearch.trim()) return sortedProcesses;
    return sortedProcesses.filter((p) =>
      matchesTableSearch(
        tableSearch,
        p.code,
        p.name,
        p.processName,
        p.companyCode,
        (p.processOwners ?? []).join(' '),
      )
    );
  }, [sortedProcesses, tableSearch]);

  const { page, setPage, rowsPerPage, setRowsPerPage, pageRows, total } = useBpmTablePagination(
    filteredProcesses,
    10,
  );

  const onDownloadProcessFunctionWord = () => {
    if (!department || !filteredProcesses.length || wordExport.open) return;
    setBundleWordNotice('');
    setError('');
    void wordExport.start({ departmentId });
  };

  const trailSegments = useMemo(() => {
    if (!department) return [];
    const segs: Array<{ key: string; label: string; href?: string; current?: boolean }> = [];
    if (department.companyCode && isCompanyCode(department.companyCode)) {
      segs.push({
        key: 'co',
        label: companyDisplayLabel(companies, department.companyCode),
        href: `/companies/${department.companyCode}/departments`,
      });
    }
    segs.push({
      key: 'pf',
      label: toDepartmentDisplayName(department.code, department.name),
      href: `/departments/${department.id}/processes`,
    });
    segs.push({ key: 'here', label: 'Processes', current: true });
    return segs;
  }, [department, companies, isCompanyCode]);

  return (
    <DashboardContent maxWidth={false}>
      <Stack spacing={3}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'stretch', md: 'flex-start' },
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h4">Process Functions — Processes</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              {department
                ? `Processes for ${department.code}_${department.name}`
                : 'Process function not found.'}
            </Typography>
            {activeCompany && (
              <Chip
                size="small"
                label={`Company: ${companyDisplayLabel(companies, activeCompany)}`}
                sx={{ mt: 1 }}
                variant="outlined"
              />
            )}
          </Box>

          <Stack spacing={1.25} alignItems={{ xs: 'stretch', md: 'flex-end' }} sx={{ flexShrink: 0 }}>
            <BpmLocationTrail segments={trailSegments} />
            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
              {canUseAiExport(accessProfile) ? (
                <Button
                  variant="contained"
                  color="secondary"
                  disabled={!department || !filteredProcesses.length || wordExport.open}
                  onClick={() => void onDownloadProcessFunctionWord()}
                >
                  {wordExport.open ? 'Generating Word…' : 'Download process function Word'}
                </Button>
              ) : null}
              <Button variant="outlined" onClick={() => router.push('/departments')} sx={{ alignSelf: { md: 'flex-end' } }}>
                Back to Process Functions
              </Button>
            </Stack>
          </Stack>
        </Box>

        {department && canWriteBpm ? (
          <Card sx={{ p: 3, width: '100%' }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Import (grid only)
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              Use <strong>Open grid import</strong> to paste from Excel (no file upload). Optionally download the Excel
              layout as a reference, then copy data into the grid dialog. Process owners below apply to every sheet you
              import in that session.
            </Typography>
            <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} flexWrap="wrap" useFlexGap>
              <CompanySelectField
                companies={companies}
                loading={companiesLoading}
                value={importCompany}
                onChange={setImportCompany}
                disabled={Boolean(department.companyCode && isCompanyCode(department.companyCode))}
                onRefresh={() => void reloadCompanies()}
                refreshBusy={companiesLoading}
                helperText={
                  department?.companyCode && isCompanyCode(department.companyCode)
                    ? `Inherited from process function (${companyDisplayLabel(companies, department.companyCode)}).`
                    : undefined
                }
              />
              <TextField
                select
                label="Sub-process template"
                value={importTemplateId}
                onChange={(e) => setImportTemplateId(e.target.value)}
                sx={{ minWidth: 260 }}
                helperText={templates.length ? '' : 'No templates — create one in Sub-process Template Master.'}
              >
                <MenuItem value="">
                  <em>Select template</em>
                </MenuItem>
                {templates.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                color="inherit"
                disabled={!importTemplateId || templateDlBusy}
                onClick={() => void onDownloadImportTemplate()}
                sx={{ alignSelf: { xs: 'stretch', md: 'center' }, minHeight: 56 }}
              >
                {templateDlBusy ? 'Preparing…' : 'Download Excel template'}
              </Button>
              <Button
                variant="contained"
                disabled={!importTemplateId || !importCompany || templateDlBusy}
                onClick={() => {
                  setGridError('');
                  setImportError('');
                  setGridImportOpen(true);
                }}
                sx={{ alignSelf: { xs: 'stretch', md: 'center' }, minHeight: 56 }}
              >
                Open grid import
              </Button>
            </Stack>
            <TextField
              fullWidth
              label="Process owners for imported processes (comma / newline separated emails)"
              value={gridOwnersRaw}
              onChange={(e) => setGridOwnersRaw(e.target.value)}
              sx={{ mt: 2 }}
              placeholder="owner1@company.com, owner2@company.com"
            />
            {importError ? (
              <Alert severity="error" sx={{ mt: 2 }}>
                {importError}
              </Alert>
            ) : null}
            {gridMessage ? (
              <Alert severity="success" sx={{ mt: 2 }}>
                {gridMessage}
              </Alert>
            ) : null}
            {gridError ? (
              <Alert severity={gridMessage ? 'warning' : 'error'} sx={{ mt: 2 }}>
                {gridError}
              </Alert>
            ) : null}
            {perSheetLastResult?.sheets?.length ? (
              <TableContainer sx={{ mt: 2, maxHeight: 280 }}>
                <Table size="small" stickyHeader sx={{ '& .MuiTableCell-root': { textAlign: 'left' } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Sheet</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Process</TableCell>
                      <TableCell>Activities</TableCell>
                      <TableCell>Note</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {perSheetLastResult.sheets.map((row) => (
                      <TableRow key={row.sheet}>
                        <TableCell>{row.sheet}</TableCell>
                        <TableCell>
                          {row.ok ? (
                            <Chip size="small" color="success" label="OK" />
                          ) : row.message?.toLowerCase().includes('skipped') ? (
                            <Chip size="small" variant="outlined" label="Skipped" />
                          ) : (
                            <Chip size="small" color="error" label="Error" />
                          )}
                        </TableCell>
                        <TableCell>
                          {row.ok ? `${row.processCode ?? ''} ${row.processName ?? ''}`.trim() : '—'}
                        </TableCell>
                        <TableCell>{row.activitiesCreated}</TableCell>
                        <TableCell sx={{ maxWidth: 360, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {row.error ?? row.message ?? ''}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : null}
          </Card>
        ) : null}

        <BpmTableCard
          searchLabel="Search processes"
          searchPlaceholder="Code, name, company, owners…"
          searchValue={tableSearch}
          onSearchChange={setTableSearch}
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
              <TableCell sx={{ width: 100 }}>Company</TableCell>
              <TableCell sx={{ width: 130 }}>Code</TableCell>
              <TableCell>Name</TableCell>
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
                <TableCell colSpan={6} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                  Loading processes...
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pageRows.map((processItem) => (
                <TableRow key={processItem.id} hover>
                  <TableCell>{companyDisplayLabel(companies, processItem.companyCode)}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{processItem.code}</TableCell>
                  <TableCell>
                    {processItem.processName?.trim() ||
                      processItem.name?.trim() ||
                      processItem.code ||
                      '—'}
                  </TableCell>
                  <TableCell align="right">{processItem.activities?.length ?? 0}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ whiteSpace: 'nowrap' }}
                        onClick={() =>
                          router.push(
                            `/departments/${departmentId}/processes/${processItem.id}/activities-table`
                          )
                        }
                      >
                        View Sub-processes Table
                      </Button>
                      <Tooltip title="Print all sub-processes (PDF)">
                        <span>
                          <IconButton
                            size="small"
                            disabled={printingId === processItem.id}
                            onClick={() => void onPrintProcess(processItem.id)}
                          >
                            <Iconify icon="solar:printer-minimalistic-bold" width={18} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {canWriteBpm ? (
                        <Tooltip title="Edit process">
                          <IconButton size="small" onClick={() => setEditItem(processItem)}>
                            <Iconify icon="solar:pen-bold" width={18} />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      {canWriteBpm ? (
                        <Tooltip title="Delete process">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={async () => {
                              const ok = window.confirm(
                                `Are you sure you want to delete process "${processItem.processName || processItem.code}"?`
                              );
                              if (!ok) return;
                              try {
                                await deleteProcess(departmentId, processItem.id);
                                setDepartment((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        processes: (prev.processes ?? []).filter((p) => p.id !== processItem.id),
                                      }
                                    : prev
                                );
                                setError('');
                              } catch (err) {
                                setError((err as Error).message);
                              }
                            }}
                          >
                            <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(processItem.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}

            {!loading && !pageRows.length && (
              <TableRow>
                <TableCell colSpan={6} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                  {sortedProcesses.length ? 'No processes match your search.' : 'No processes yet for this department.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </BpmTableCard>
        {error && <Alert severity="error">{error}</Alert>}
        <WordExportProgressDialog
          controller={wordExport}
        />
        {bundleWordNotice ? <Alert severity="warning">{bundleWordNotice}</Alert> : null}
      </Stack>

      <BpmGridImportDialog
        key={gridImportOpen ? `grid-${importTemplateId}` : 'grid-closed'}
        open={gridImportOpen}
        onClose={() => setGridImportOpen(false)}
        departmentId={departmentId}
        departmentCode={department?.code ?? ''}
        processCodeLevels={department?.processCodeLevels === 4 ? 4 : 3}
        companyCode={importCompany}
        activityTemplateId={importTemplateId}
        processOwners={gridOwnersRaw}
        processOptions={(department?.processes ?? [])
          .filter((p) => !importCompany || p.companyCode === importCompany)
          .map((p) => ({
            id: p.id,
            code: String(p.code ?? ''),
            name: p.processName || p.name,
          }))}
        onImported={async (result) => {
          setPerSheetLastResult(result);
          setGridMessage(
            `Created ${result.totals.processesCreated} process(es) and ${result.totals.activitiesCreated} sub-process row(s) from the grid.`
          );
          setGridError('');
          const refreshed = await fetchDepartment(departmentId);
          setDepartment(refreshed);
        }}
      />

      <ProcessEditDialog
        open={!!editItem && !!department}
        department={department ? { id: department.id, name: department.name } : null}
        process={editItem}
        onClose={() => setEditItem(null)}
        onSaved={(finalUpdated) => {
          setDepartment((prev) =>
            prev
              ? {
                  ...prev,
                  processes: prev.processes.map((item) => (item.id === finalUpdated.id ? finalUpdated : item)),
                }
              : prev
          );
        }}
      />
    </DashboardContent>
  );
}

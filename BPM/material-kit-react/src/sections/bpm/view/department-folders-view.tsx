import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { useRouter } from 'src/routes/hooks';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { useHanaDepartments } from 'src/sections/bpm/hana-departments';
import { matchesTableSearch } from 'src/sections/bpm/table-search.util';
import { useCompanies, type CompanyCode } from 'src/sections/bpm/companies';
import { hasPermission, useAccessProfile } from 'src/sections/bpm/access-control';
import { CompanySelectField } from 'src/sections/bpm/components/company-select-field';
import { companyFullName, companyDisplayLabel } from 'src/sections/bpm/company-display.util';
import { computeNextProcessCodeForDepartment } from 'src/sections/bpm/hierarchy-code-display';
import {
  mapStoredOwnersToEmails,
  filterOwnersToKnownUsers,
} from 'src/sections/bpm/bpm-process-owners.util';
import {
  BpmTableCard,
  BpmTablePagination,
  useBpmTablePagination,
} from 'src/sections/bpm/components/bpm-table-kit';
import {
  type BpmProcess,
  type DepartmentFolder,
  DEPARTMENT_CODE_PATTERN,
  toDepartmentDisplayName,
} from 'src/sections/bpm/storage';
import {
  addProcess,
  companyBpmCode,
  type AccessUser,
  type BpmCompany,
  createDepartment,
  deleteDepartment,
  fetchDepartments,
  updateDepartment,
  fetchAccessUsers,
  type HanaDepartment,
  fetchActivityTemplates,
  openProcessFunctionPdfInNewTab,
} from 'src/sections/bpm/api';

function getNextProcessCode(deptCode: string, processes: BpmProcess[], processCodeLevels: 3 | 4) {
  return computeNextProcessCodeForDepartment({
    departmentCode: deptCode,
    existingProcessCodes: processes.map((p) => String(p.code ?? '')),
    processCodeLevels,
  });
}

function resolveHanaDepartmentPayload(
  departments: HanaDepartment[],
  deptCode: number | '',
  companies: BpmCompany[],
  bpmCode: string,
) {
  if (deptCode === '') return null;
  const dept = departments.find((item) => item.code === deptCode);
  if (!dept) return null;
  const companyRow = companies.find((item) => companyBpmCode(item) === bpmCode);
  const hanaBranch = dept.hanaBranch || companyRow?.hanaBranch || '';
  if (!hanaBranch) return null;
  return {
    hanaBranch,
    hanaDeptCode: dept.code,
    hanaDepartmentName: dept.name,
  };
}

export type DepartmentFoldersViewProps = {
  /** When set, process functions are scoped to this company (counts, links, default add-process company). */
  companyHubCode?: CompanyCode;
};

export function DepartmentFoldersView({ companyHubCode }: DepartmentFoldersViewProps) {
  const router = useRouter();
  const accessProfile = useAccessProfile();
  const { companies, loading: companiesLoading, error: companiesError, reload: reloadCompanies } = useCompanies();
  const companyLabel = companyHubCode
    ? companyDisplayLabel(companies, companyHubCode)
    : '';
  /** Vendor-only users have read access to navigate but cannot modify any BPM data. */
  const canWriteBpm = hasPermission(accessProfile, 'activities');
  const [name, setName] = useState('');
  const [hanaDeptCode, setHanaDeptCode] = useState<number | ''>('');
  const [code, setCode] = useState('');
  const [folderCompanyCode, setFolderCompanyCode] = useState<CompanyCode | ''>('');
  const [folderProcessCodeLevels, setFolderProcessCodeLevels] = useState<3 | 4>(3);
  const [error, setError] = useState('');
  const [printingId, setPrintingId] = useState<string | null>(null);

  const onPrintFolder = async (folderId: string) => {
    setPrintingId(folderId);
    try {
      await openProcessFunctionPdfInNewTab(folderId);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPrintingId(null);
    }
  };
  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState<DepartmentFolder[]>([]);
  const [editItem, setEditItem] = useState<DepartmentFolder | null>(null);
  const [editName, setEditName] = useState('');
  const [editHanaDeptCode, setEditHanaDeptCode] = useState<number | ''>('');
  const [editCode, setEditCode] = useState('');
  const [editCompanyCode, setEditCompanyCode] = useState<CompanyCode | ''>('');
  const [editProcessCodeLevels, setEditProcessCodeLevels] = useState<3 | 4>(3);
  const [editFolderOwners, setEditFolderOwners] = useState<string[]>([]);
  const [editError, setEditError] = useState('');
  const [folderTableSearch, setFolderTableSearch] = useState('');
  const [processItem, setProcessItem] = useState<DepartmentFolder | null>(null);
  const [processName, setProcessName] = useState('');
  const [processError, setProcessError] = useState('');
  const [addProcessDescription, setAddProcessDescription] = useState('');
  const [addProcessOwners, setAddProcessOwners] = useState<string[]>([]);
  const [addActivityTemplateId, setAddActivityTemplateId] = useState('');
  const [activityTemplates, setActivityTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [addProcessSaving, setAddProcessSaving] = useState(false);
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);

  const { hanaDepartments: createHanaDepartments, loading: createDeptsLoading, error: createDeptsError } =
    useHanaDepartments(folderCompanyCode);
  const { hanaDepartments: editHanaDepartments, loading: editDeptsLoading, error: editDeptsError } =
    useHanaDepartments(editCompanyCode);

  const reloadFolders = useCallback(() => {
    setLoading(true);
    setError('');
    fetchDepartments()
      .then((items) => setFolders(items))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const processCountForFolder = useCallback(
    (folder: DepartmentFolder) => {
      const list = folder.processes ?? [];
      if (!companyHubCode) return list.length;
      return list.filter((p) => p.companyCode === companyHubCode).length;
    },
    [companyHubCode],
  );

  useEffect(() => {
    reloadFolders();
    void reloadCompanies();
  }, [reloadFolders, reloadCompanies]);

  useEffect(() => {
    setFolderCompanyCode(companyHubCode ?? '');
  }, [companyHubCode]);

  useEffect(() => {
    setHanaDeptCode('');
  }, [folderCompanyCode]);

  const sortedFolders = useMemo(
    () =>
      [...folders].sort((a, b) =>
        String(a.code).localeCompare(String(b.code), undefined, { numeric: true }),
      ),
    [folders]
  );

  const visibleFolders = useMemo(() => {
    if (!companyHubCode) return sortedFolders;
    return sortedFolders.filter((folder) => folder.companyCode === companyHubCode);
  }, [sortedFolders, companyHubCode]);

  const filteredFolders = useMemo(() => {
    if (!folderTableSearch.trim()) return visibleFolders;
    return visibleFolders.filter((folder) =>
      matchesTableSearch(
        folderTableSearch,
        folder.code,
        folder.name,
        folder.orgDepartmentName,
        folder.hanaDepartmentName,
        folder.companyCode,
        toDepartmentDisplayName(folder.code, folder.name),
        String(processCountForFolder(folder)),
      )
    );
  }, [visibleFolders, folderTableSearch, processCountForFolder]);

  const subProcessCountForFolder = useCallback(
    (folder: DepartmentFolder) => {
      const processes = folder.processes ?? [];
      const scoped = companyHubCode
        ? processes.filter((p) => p.companyCode === companyHubCode)
        : processes;
      return scoped.reduce((sum, p) => sum + (p.activities?.length ?? 0), 0);
    },
    [companyHubCode],
  );

  const { page, setPage, rowsPerPage, setRowsPerPage, pageRows, total } = useBpmTablePagination(
    filteredFolders,
    10,
  );

  useEffect(() => {
    fetchAccessUsers()
      .then(setAccessUsers)
      .catch(() => setAccessUsers([]));
  }, []);

  const onCreateFolder = async () => {
    const normalizedName = name.trim();
    const normalizedCode = code.trim().toUpperCase();

    if (!folderCompanyCode) {
      setError('Company name is required.');
      return;
    }

    if (!normalizedName || !normalizedCode || hanaDeptCode === '') {
      setError('Process function name, department (SAP HANA), and code are required.');
      return;
    }

    const hanaPayload = resolveHanaDepartmentPayload(
      createHanaDepartments,
      hanaDeptCode,
      companies,
      folderCompanyCode,
    );
    if (!hanaPayload) {
      setError('Select a valid department from the SAP HANA list for this company.');
      return;
    }

    if (!DEPARTMENT_CODE_PATTERN.test(normalizedCode)) {
      setError('Department code format must be 000-000-000.');
      return;
    }

    try {
      const created = await createDepartment({
        code: normalizedCode,
        name: normalizedName,
        companyCode: folderCompanyCode,
        ...hanaPayload,
        processCodeLevels: folderProcessCodeLevels,
      });
      setFolders((prev) => [...prev, created]);
      setName('');
      setHanaDeptCode('');
      setCode('');
      setFolderCompanyCode(companyHubCode ?? '');
      setFolderProcessCodeLevels(3);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openEdit = (folder: DepartmentFolder) => {
    void reloadCompanies();
    setEditItem(folder);
    setEditName(folder.name);
    setEditHanaDeptCode(folder.hanaDeptCode ?? '');
    setEditCode(folder.code);
    setEditCompanyCode((folder.companyCode as CompanyCode) ?? '');
    setEditProcessCodeLevels(folder.processCodeLevels === 4 ? 4 : 3);
    setEditFolderOwners(
      accessUsers.length
        ? mapStoredOwnersToEmails(folder.processFunctionOwners ?? [], accessUsers)
        : [...(folder.processFunctionOwners ?? [])],
    );
    setEditError('');
  };

  const onDeleteFolder = async (folder: DepartmentFolder) => {
    const ok = window.confirm(
      `Delete process function "${folder.name}" and all related processes/sub-processes/data? This cannot be undone.`
    );
    if (!ok) return;
    try {
      await deleteDepartment(folder.id);
      setFolders((prev) => prev.filter((item) => item.id !== folder.id));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onSaveEdit = async () => {
    if (!editItem) return;

    const normalizedName = editName.trim();
    const normalizedCode = editCode.trim();

    if (!normalizedName || !normalizedCode || editHanaDeptCode === '') {
      setEditError('Process function name, department (SAP HANA), and code are required.');
      return;
    }

    const hanaPayload = resolveHanaDepartmentPayload(
      editHanaDepartments,
      editHanaDeptCode,
      companies,
      editCompanyCode,
    );
    if (!hanaPayload) {
      setEditError('Select a valid department from the SAP HANA list for this company.');
      return;
    }

    if (!DEPARTMENT_CODE_PATTERN.test(normalizedCode)) {
      setEditError('Department code format must be 000-000-000.');
      return;
    }

    if (!editCompanyCode) {
      setEditError('Company name is required.');
      return;
    }

    try {
      const ownersPayload =
        accessUsers.length > 0 ? filterOwnersToKnownUsers(editFolderOwners, accessUsers) : editFolderOwners;

      const updated = await updateDepartment(editItem.id, {
        code: normalizedCode,
        name: normalizedName,
        ...hanaPayload,
        companyCode: editCompanyCode,
        processFunctionOwners: ownersPayload,
        processCodeLevels: editProcessCodeLevels,
      });

      setFolders((prev) => prev.map((item) => (item.id === editItem.id ? updated : item)));
      setEditItem(null);
      setEditError('');
    } catch (err) {
      setEditError((err as Error).message);
    }
  };

  const openAddProcess = (folder: DepartmentFolder) => {
    setProcessItem(folder);
    setProcessName('');
    setProcessError('');
    setAddProcessDescription('');
    setAddProcessOwners(
      accessUsers.length
        ? mapStoredOwnersToEmails(folder.processFunctionOwners ?? [], accessUsers)
        : [...(folder.processFunctionOwners ?? [])],
    );
    setAddActivityTemplateId('');
  };

  useEffect(() => {
    if (!processItem) return;
    setProcessError('');
    fetchActivityTemplates()
      .then((items) => setActivityTemplates(items.map((item) => ({ id: item.id, name: item.name }))))
      .catch((err: Error) => setProcessError(err.message));
  }, [processItem]);

  const addOwnerEmailOptions = accessUsers.map((u) => u.email);
  const addOwnerChipLabel = (email: string) => {
    const u = accessUsers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    return u ? `${u.displayName} (${u.email})` : email;
  };

  const onSaveProcess = async () => {
    if (!processItem) return;

    const normalizedProcessName = processName.trim();

    if (!normalizedProcessName) {
      setProcessError('Process name is required.');
      return;
    }

    if (!addActivityTemplateId) {
      setProcessError('Sub-process template is required.');
      return;
    }

    const processCompanyCode = (processItem.companyCode as CompanyCode) || companyHubCode || '';
    if (!processCompanyCode) {
      setProcessError('Process function company is missing — edit the process function and select a company.');
      return;
    }

    if (!addProcessDescription.trim()) {
      setProcessError('Process description is required.');
      return;
    }

    try {
      setAddProcessSaving(true);
      const ownersPayload =
        accessUsers.length > 0 ? filterOwnersToKnownUsers(addProcessOwners, accessUsers) : addProcessOwners;

      const createdProcess = await addProcess(processItem.id, {
        processName: normalizedProcessName,
        companyCode: processCompanyCode,
        activityTemplateId: addActivityTemplateId,
        processOwners: ownersPayload,
        description: '',
        processDescription: addProcessDescription.trim(),
      });

      setFolders((prev) =>
        prev.map((item) =>
          item.id === processItem.id ? { ...item, processes: [...item.processes, createdProcess] } : item
        )
      );

      setProcessItem(null);
      setProcessError('');
    } catch (err) {
      setProcessError((err as Error).message);
    } finally {
      setAddProcessSaving(false);
    }
  };

  const nextProcessCodePreview = processItem
    ? getNextProcessCode(
        processItem.code,
        processItem.processes ?? [],
        processItem.processCodeLevels === 4 ? 4 : 3,
      )
    : '';
  const processIdPreview =
    processName.trim() && nextProcessCodePreview
      ? `${nextProcessCodePreview}_${processName.trim()}`
      : nextProcessCodePreview || '—';

  return (
    <DashboardContent>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="h4">
              {companyHubCode ? `${companyLabel} — Process Functions` : 'Process Functions'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              {companyHubCode
                ? `Process functions and processes for ${companyLabel}. Oracle: ${companyFullName(companies, companyHubCode)}`
                : 'Create reusable process functions with unique codes. Each row includes company and department from your BPM data.'}
            </Typography>
          </Box>
          {companyHubCode ? (
            <Button
              variant="text"
              size="small"
              color="inherit"
              sx={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}
              startIcon={<Iconify icon="solar:settings-bold-duotone" width={16} />}
              onClick={() => router.push(`/companies/${companyHubCode}/settings`)}
            >
              Company details
            </Button>
          ) : null}
        </Stack>

        {companiesError && (
          <Alert severity="warning">
            Could not load companies list: {companiesError}. Showing defaults until the API is available.
          </Alert>
        )}

        {canWriteBpm ? (
        <Card sx={{ p: 3 }}>
          <Stack
            direction="row"
            spacing={2}
            useFlexGap
            flexWrap="wrap"
            alignItems="flex-start"
          >
            <CompanySelectField
              companies={companies}
              loading={companiesLoading}
              value={folderCompanyCode}
              onChange={(nextCompanyCode) => {
                setFolderCompanyCode(nextCompanyCode);
                setHanaDeptCode('');
              }}
              disabled={!!companyHubCode}
              onRefresh={() => void reloadCompanies()}
              refreshBusy={companiesLoading}
              minWidth={260}
              helperText={
                companyHubCode
                  ? `Fixed to ${companyLabel} for this company hub.`
                  : undefined
              }
            />
            <TextField
              fullWidth
              label="Process function name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Planning & Procurement ISZ"
              sx={{ flex: '1 1 220px', minWidth: 200 }}
            />
            <TextField
              fullWidth
              select
              label="Department (SAP HANA)"
              value={hanaDeptCode === '' ? '' : String(hanaDeptCode)}
              onChange={(event) =>
                setHanaDeptCode(event.target.value ? Number(event.target.value) : '')
              }
              disabled={!folderCompanyCode || createDeptsLoading || !createHanaDepartments.length}
              sx={{ flex: '1 1 280px', minWidth: 260 }}
              SelectProps={{
                renderValue: (selected) => {
                  const deptCode = String(selected ?? '');
                  if (!deptCode) return 'Select department';
                  const match = createHanaDepartments.find((item) => String(item.code) === deptCode);
                  return match?.name || deptCode;
                },
                MenuProps: {
                  PaperProps: { sx: { maxWidth: 420 } },
                },
              }}
              helperText={
                !folderCompanyCode
                  ? 'Select company first.'
                  : createDeptsLoading
                    ? 'Loading departments from SAP HANA…'
                    : createDeptsError
                      ? createDeptsError
                      : createHanaDepartments.length
                        ? `${createHanaDepartments.length} departments — same list as Policy Creator`
                        : 'No departments — link a HANA company in Company details.'
              }
            >
              <MenuItem value="">
                <em>Select department</em>
              </MenuItem>
              {createHanaDepartments.map((item) => (
                <MenuItem key={item.code} value={String(item.code)} sx={{ whiteSpace: 'normal' }}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              label="Process function code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="001-000-000"
              sx={{ flex: '1 1 160px', minWidth: 150 }}
            />
            <TextField
              fullWidth
              select
              label="Process code levels"
              value={folderProcessCodeLevels}
              onChange={(event) => setFolderProcessCodeLevels(Number(event.target.value) === 4 ? 4 : 3)}
              helperText="3 => C1-C2-000, 4 => C1-C2-C3-000"
              sx={{ flex: '0 1 150px', minWidth: 140 }}
            >
              <MenuItem value={3}>3 levels</MenuItem>
              <MenuItem value={4}>4 levels</MenuItem>
            </TextField>
            <Button variant="contained" onClick={onCreateFolder} sx={{ minWidth: 160, height: 56, flex: '0 0 auto' }}>
              Create Folder
            </Button>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </Card>
        ) : null}

        <BpmTableCard
          searchLabel="Search process functions"
          searchPlaceholder="Code, name, company…"
          searchValue={folderTableSearch}
          onSearchChange={setFolderTableSearch}
          totalLabel={`${total} folder(s)`}
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
              <TableCell sx={{ width: 130 }}>Code</TableCell>
              <TableCell sx={{ width: 72 }}>Levels</TableCell>
              <TableCell>Process Functions</TableCell>
              <TableCell sx={{ width: 100 }} align="right">
                # Processes
              </TableCell>
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
                <TableCell colSpan={8} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                  Loading process functions...
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              pageRows.map((folder) => (
                <TableRow key={folder.id} hover>
                  <TableCell>{companyDisplayLabel(companies, folder.companyCode)}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{folder.code}</TableCell>
                  <TableCell>{folder.processCodeLevels === 4 ? '4' : '3'}</TableCell>
                  <TableCell>{folder.name}</TableCell>
                  <TableCell align="right">{processCountForFolder(folder)}</TableCell>
                  <TableCell align="right">{subProcessCountForFolder(folder)}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="View processes">
                        <IconButton
                          size="small"
                          onClick={() =>
                            router.push(
                              companyHubCode
                                ? `/departments/${folder.id}/processes?company=${companyHubCode}`
                                : `/departments/${folder.id}/processes`
                            )
                          }
                        >
                          <Iconify icon="solar:eye-bold" width={18} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Print process function (all processes & sub-processes, PDF)">
                        <span>
                          <IconButton
                            size="small"
                            disabled={printingId === folder.id}
                            onClick={() => void onPrintFolder(folder.id)}
                          >
                            <Iconify icon="solar:printer-minimalistic-bold" width={18} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      {canWriteBpm ? (
                        <Tooltip title="Add process">
                          <IconButton size="small" color="primary" onClick={() => openAddProcess(folder)}>
                            <Iconify icon="mingcute:add-line" width={18} />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      {canWriteBpm ? (
                        <Tooltip title="Edit process function">
                          <IconButton size="small" onClick={() => openEdit(folder)}>
                            <Iconify icon="solar:pen-bold" width={18} />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                      {canWriteBpm ? (
                        <Tooltip title="Delete process function">
                          <IconButton size="small" color="error" onClick={() => void onDeleteFolder(folder)}>
                            <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(folder.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            {!loading && !pageRows.length && (
              <TableRow>
                <TableCell colSpan={8} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                  {visibleFolders.length
                    ? 'No process functions match your search.'
                    : 'No process functions yet. Create your first entry.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </BpmTableCard>
      </Stack>

      <Dialog open={!!editItem} onClose={() => setEditItem(null)} fullWidth maxWidth="md">
        <DialogTitle>Edit Process Function</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <CompanySelectField
              companies={companies}
              loading={companiesLoading}
              value={editCompanyCode}
              onChange={(nextCompanyCode) => {
                setEditCompanyCode(nextCompanyCode);
                setEditHanaDeptCode('');
              }}
              disabled={!!companyHubCode}
              onRefresh={() => void reloadCompanies()}
              refreshBusy={companiesLoading}
              helperText={
                companyHubCode
                  ? `Fixed to ${companyLabel} for this company hub.`
                  : 'Changing company updates all processes under this process function.'
              }
            />
            <TextField
              fullWidth
              label="Process function name"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
            <TextField
              fullWidth
              select
              label="Department (SAP HANA — same as Policy Creator)"
              value={editHanaDeptCode === '' ? '' : String(editHanaDeptCode)}
              onChange={(event) =>
                setEditHanaDeptCode(event.target.value ? Number(event.target.value) : '')
              }
              disabled={!editCompanyCode || editDeptsLoading || !editHanaDepartments.length}
              helperText={
                editDeptsLoading
                  ? 'Loading departments from SAP HANA…'
                  : editDeptsError
                    ? editDeptsError
                    : 'Must match Policy Creator department for linking.'
              }
            >
              <MenuItem value="">
                <em>Select department</em>
              </MenuItem>
              {editHanaDepartments.map((item) => (
                <MenuItem key={item.code} value={String(item.code)}>
                  {item.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              label="Process function code"
              value={editCode}
              onChange={(event) => setEditCode(event.target.value)}
              placeholder="001-000-000"
            />
            <TextField
              fullWidth
              select
              label="Process code levels"
              value={editProcessCodeLevels}
              onChange={(event) => setEditProcessCodeLevels(Number(event.target.value) === 4 ? 4 : 3)}
              helperText="3 => C1-C2-000, 4 => C1-C2-C3-000"
            >
              <MenuItem value={3}>3 levels</MenuItem>
              <MenuItem value={4}>4 levels</MenuItem>
            </TextField>
            <Autocomplete
              multiple
              options={accessUsers.map((u) => u.email)}
              value={editFolderOwners}
              onChange={(_event, value) => setEditFolderOwners(value)}
              getOptionLabel={(email) => {
                const u = accessUsers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
                return u ? `${u.displayName} (${u.email})` : email;
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Process function owners (default)"
                  placeholder={accessUsers.length ? 'Pick users from Access Control' : 'Loading users…'}
                  helperText={
                    accessUsers.length
                      ? 'Saving applies these owners to every process and sub-process under this process function.'
                      : 'Load users failed — owners still save as typed emails if you save.'
                  }
                />
              )}
            />
            {editError && <Alert severity="error">{editError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditItem(null)} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={onSaveEdit}>
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!processItem} onClose={() => setProcessItem(null)} fullWidth maxWidth="lg">
        <DialogTitle>Add Process</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Company"
                  value={
                    processItem
                      ? companyDisplayLabel(companies, processItem.companyCode)
                      : '—'
                  }
                  disabled
                  helperText="Inherited from the process function."
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Process Name"
                  value={processName}
                  onChange={(event) => setProcessName(event.target.value)}
                  placeholder="Shipment"
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Process ID (code & name, after save)"
                  value={processIdPreview}
                  disabled
                  helperText="Generated when you add the process."
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Process function"
                  value={processItem ? toDepartmentDisplayName(processItem.code, processItem.name) : ''}
                  disabled
                />
              </Grid>
            </Grid>

            <Divider />

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  select
                  label="Sub-process Template"
                  value={addActivityTemplateId}
                  onChange={(event) => setAddActivityTemplateId(event.target.value)}
                >
                  {activityTemplates.map((template) => (
                    <MenuItem key={template.id} value={template.id}>
                      {template.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Autocomplete
                  multiple
                  options={addOwnerEmailOptions}
                  value={addProcessOwners}
                  onChange={(_event, value) => setAddProcessOwners(value)}
                  getOptionLabel={(email) => addOwnerChipLabel(email)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Process owners"
                      placeholder={accessUsers.length ? 'Pick users from the list' : 'Loading users…'}
                      helperText={
                        accessUsers.length
                          ? 'Owners apply to the whole process and its sub-processes.'
                          : 'Could not load users — check Access Control and your session.'
                      }
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Process Description"
                  value={addProcessDescription}
                  onChange={(event) => setAddProcessDescription(event.target.value)}
                />
              </Grid>
            </Grid>

            {processItem && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                The numeric process code is generated from process function code{' '}
                <strong>{processItem.code}</strong> (see preview fields above).
              </Typography>
            )}
            {processError && <Alert severity="error">{processError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProcessItem(null)} color="inherit" disabled={addProcessSaving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void onSaveProcess()} disabled={addProcessSaving}>
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
}

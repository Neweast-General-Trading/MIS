import { useRef, useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import Typography from '@mui/material/Typography';
import TableContainer from '@mui/material/TableContainer';
import TablePagination from '@mui/material/TablePagination';
import CircularProgress from '@mui/material/CircularProgress';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import {
  uploadProcessDocumentation,
  type ProcessDocumentationFile,
  deleteProcessDocumentationFile,
  type ProcessDocumentationTarget,
  downloadProcessDocumentationFile,
  fetchProcessDocumentationGrouped,
  fetchProcessDocumentationTargets,
  patchProcessDocumentationComments,
  uploadProcessFunctionDocumentation,
  type ProcessDocumentationGroupedRecord,
} from 'src/sections/bpm/api';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function FileDownloadButton({ file }: { file: ProcessDocumentationFile }) {
  return (
    <Button
      size="small"
      variant="outlined"
      sx={{ justifyContent: 'flex-start', textAlign: 'left', maxWidth: 280 }}
      startIcon={<Iconify icon="solar:share-bold" width={16} />}
      onClick={() => void downloadProcessDocumentationFile(file.id, file.originalName)}
    >
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {file.originalName}
      </Box>
    </Button>
  );
}

export function ProcessDocumentationView() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadScopeRef = useRef<{ departmentId: string; processId: string | null } | null>(
    null,
  );

  const [departments, setDepartments] = useState<ProcessDocumentationTarget[]>([]);
  const [uploadDepartmentId, setUploadDepartmentId] = useState('');
  const [uploadProcessId, setUploadProcessId] = useState('');

  const [filterPfCode, setFilterPfCode] = useState('');
  const [filterProcessCode, setFilterProcessCode] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterSource, setFilterSource] = useState<'' | 'automation' | 'upload'>('');

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [groups, setGroups] = useState<ProcessDocumentationGroupedRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);

  useEffect(() => {
    fetchProcessDocumentationTargets()
      .then(setDepartments)
      .catch(() => setDepartments([]));
  }, []);

  const uploadProcessOptions = useMemo(
    () =>
      [...(departments.find((d) => d.id === uploadDepartmentId)?.processes ?? [])].sort(
        (a, b) => a.code.localeCompare(b.code),
      ),
    [departments, uploadDepartmentId],
  );

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchProcessDocumentationGrouped({
        page: page + 1,
        pageSize,
        processFunctionCode: filterPfCode || undefined,
        processCode: filterProcessCode || undefined,
        search: filterSearch || undefined,
        source: filterSource || undefined,
      });
      setGroups(data.items);
      setTotal(data.total);
      setCommentDrafts((prev) => {
        const next = { ...prev };
        for (const group of data.items) {
          const key = group.scopeKey;
          if (next[key] === undefined) {
            next[key] = group.comments ?? '';
          }
        }
        return next;
      });
    } catch (err) {
      setGroups([]);
      setTotal(0);
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filterPfCode, filterProcessCode, filterSearch, filterSource, page, pageSize]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  const onRemoveFile = async (file: ProcessDocumentationFile) => {
    const ok = window.confirm(`Remove "${file.originalName}"?`);
    if (!ok) return;
    setActionError('');
    setActionSuccess('');
    try {
      await deleteProcessDocumentationFile(file.id);
      setActionSuccess('File removed.');
      await loadRecords();
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  const onSaveComments = async (group: ProcessDocumentationGroupedRecord) => {
    if (!group.commentTargetId) return;
    setSavingCommentId(group.scopeKey);
    setActionError('');
    setActionSuccess('');
    try {
      const text = commentDrafts[group.scopeKey] ?? '';
      await patchProcessDocumentationComments(group.commentTargetId, text.trim() || null);
      setActionSuccess('Comments saved.');
      await loadRecords();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setSavingCommentId(null);
    }
  };

  const triggerUpload = (group: ProcessDocumentationGroupedRecord) => {
    if (!group.departmentId) {
      setActionError('Cannot upload: missing process function on this row.');
      return;
    }
    uploadScopeRef.current = {
      departmentId: group.departmentId,
      processId: group.processId,
    };
    uploadInputRef.current?.click();
  };

  const onUploadSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const scope = uploadScopeRef.current;
    if (!file || !scope?.departmentId) return;

    setUploadBusy(true);
    setActionError('');
    setActionSuccess('');
    try {
      if (scope.processId) {
        await uploadProcessDocumentation(scope.departmentId, scope.processId, file);
      } else {
        await uploadProcessFunctionDocumentation(scope.departmentId, file);
      }
      setActionSuccess('File added on the same row.');
      await loadRecords();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setUploadBusy(false);
      uploadScopeRef.current = null;
    }
  };

  const applyFilters = () => {
    setPage(0);
    void loadRecords();
  };

  const onGlobalUploadPick = () => {
    if (!uploadDepartmentId) {
      setActionError('Select a process function before uploading.');
      return;
    }
    uploadScopeRef.current = {
      departmentId: uploadDepartmentId,
      processId: uploadProcessId || null,
    };
    uploadInputRef.current?.click();
  };

  return (
    <DashboardContent maxWidth="xl">
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4">Process Function Documentation</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            One row per process function or process. Automation and uploaded files appear
            together on the same line.
          </Typography>
        </Box>

        {loadError ? <Alert severity="error">{loadError}</Alert> : null}
        {actionError ? <Alert severity="error">{actionError}</Alert> : null}
        {actionSuccess ? <Alert severity="success">{actionSuccess}</Alert> : null}

        <Card sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            Upload new file
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              select
              label="Process function"
              size="small"
              value={uploadDepartmentId}
              onChange={(e) => {
                setUploadDepartmentId(e.target.value);
                setUploadProcessId('');
              }}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">
                <em>Select</em>
              </MenuItem>
              {departments.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Process (optional)"
              size="small"
              value={uploadProcessId}
              disabled={!uploadDepartmentId}
              onChange={(e) => setUploadProcessId(e.target.value)}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="">
                <em>Process function only</em>
              </MenuItem>
              {uploadProcessOptions.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              disabled={!uploadDepartmentId || uploadBusy}
              startIcon={<Iconify icon="mingcute:add-line" />}
              onClick={onGlobalUploadPick}
            >
              {uploadBusy ? 'Uploading…' : 'Choose file'}
            </Button>
          </Stack>
        </Card>

        <Card sx={{ p: 2.5 }}>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            Filters
          </Typography>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-end">
            <TextField
              label="Process function code"
              value={filterPfCode}
              onChange={(e) => setFilterPfCode(e.target.value)}
              size="small"
              sx={{ minWidth: 180 }}
            />
            <TextField
              label="Process code"
              value={filterProcessCode}
              onChange={(e) => setFilterProcessCode(e.target.value)}
              size="small"
              sx={{ minWidth: 160 }}
            />
            <TextField
              select
              label="Source"
              value={filterSource}
              onChange={(e) =>
                setFilterSource(e.target.value as '' | 'automation' | 'upload')
              }
              size="small"
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="automation">Automation</MenuItem>
              <MenuItem value="upload">Upload</MenuItem>
            </TextField>
            <TextField
              label="Search"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              size="small"
              placeholder="File name, comments, codes…"
              sx={{ flex: 1, minWidth: 200 }}
            />
            <Button variant="contained" onClick={applyFilters}>
              Apply filters
            </Button>
          </Stack>
        </Card>

        <Card>
          <input
            ref={uploadInputRef}
            type="file"
            hidden
            onChange={(e) => void onUploadSelected(e)}
          />
          <TableContainer>
            <Table size="small" sx={{ minWidth: 960 }}>
              <TableHead>
                <TableRow>
                  <TableCell width={140}>Process function</TableCell>
                  <TableCell width={120}>Process</TableCell>
                  <TableCell width="32%">Automation file</TableCell>
                  <TableCell width="32%">Uploaded files</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>Comments</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : !groups.length ? (
                  <TableRow>
                    <TableCell colSpan={5} sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">
                        No documentation yet. Approve from Automation BPM generation or upload
                        a file.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((group) => (
                    <TableRow key={group.scopeKey} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {group.processFunctionCode ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {group.processCode ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {group.automationFiles.length ? (
                          <Stack spacing={1}>
                            {group.automationFiles.map((file) => (
                              <Stack key={file.id} spacing={0.5}>
                                <Chip label="Automation" size="small" color="primary" />
                                <FileDownloadButton file={file} />
                                <Stack direction="row" spacing={1} alignItems="center">
                                  <Typography variant="caption" color="text.secondary">
                                    {formatBytes(file.fileSize)}
                                  </Typography>
                                  <Button
                                    size="small"
                                    color="error"
                                    onClick={() => void onRemoveFile(file)}
                                  >
                                    Remove
                                  </Button>
                                </Stack>
                              </Stack>
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            —
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Stack spacing={1}>
                          {group.uploadFiles.map((file) => (
                            <Stack key={file.id} direction="row" spacing={0.5} alignItems="center">
                              <FileDownloadButton file={file} />
                              <Button
                                size="small"
                                color="error"
                                onClick={() => void onRemoveFile(file)}
                              >
                                Remove
                              </Button>
                            </Stack>
                          ))}
                          <Button
                            size="small"
                            variant="contained"
                            disabled={uploadBusy || !group.departmentId}
                            startIcon={<Iconify icon="mingcute:add-line" />}
                            onClick={() => triggerUpload(group)}
                          >
                            Upload file
                          </Button>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          multiline
                          minRows={2}
                          maxRows={4}
                          placeholder="Notes…"
                          value={commentDrafts[group.scopeKey] ?? ''}
                          onChange={(e) =>
                            setCommentDrafts((prev) => ({
                              ...prev,
                              [group.scopeKey]: e.target.value,
                            }))
                          }
                        />
                        <Button
                          size="small"
                          sx={{ mt: 0.5 }}
                          disabled={
                            savingCommentId === group.scopeKey || !group.commentTargetId
                          }
                          onClick={() => void onSaveComments(group)}
                        >
                          {savingCommentId === group.scopeKey ? 'Saving…' : 'Save'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, next) => setPage(next)}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(e) => {
              setPageSize(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={PAGE_SIZE_OPTIONS}
          />
        </Card>
      </Stack>
    </DashboardContent>
  );
}

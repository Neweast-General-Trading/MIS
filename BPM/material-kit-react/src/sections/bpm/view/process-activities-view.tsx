import * as XLSX from 'xlsx';
import { useRef, useMemo, useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import MenuItem from '@mui/material/MenuItem';
import TableRow from '@mui/material/TableRow';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';

import { useRouter } from 'src/routes/hooks';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { useAccessProfile } from 'src/sections/bpm/access-control';
import { matchesTableSearch } from 'src/sections/bpm/table-search.util';
import { useHanaDesignations } from 'src/sections/bpm/hana-designations';
import { useOracleJobRoles } from 'src/sections/bpm/use-oracle-job-roles';
import { downloadActivitiesTableXlsx } from 'src/sections/bpm/process-export';
import { BpmLocationTrail } from 'src/sections/bpm/components/bpm-location-trail';
import { ActivityCommentBubble } from 'src/sections/bpm/components/activity-comment-bubble';
import { commentAuthorMatchesProfile } from 'src/sections/bpm/activity-comment-author.util';
import {
  diffNewCommentIds,
  mergeSeenCommentIds,
} from 'src/sections/bpm/activity-comments-sync';
import { isServerGeneratedActivityDetailKey } from 'src/sections/bpm/server-generated-activity-fields';
import { renderTemplateDetailFieldInput } from 'src/sections/bpm/components/bpm-template-detail-controls';
import {
  computeNextRootActivityCode,
  computeNextChildActivityCode,
} from 'src/sections/bpm/hierarchy-code-display';
import {
  type BpmProcess,
  type ActivityItem,
  type ActivityTemplate,
  type DepartmentFolder,
  toDepartmentDisplayName,
} from 'src/sections/bpm/storage';
import {
  fetchProcess,
  createActivity,
  fetchDepartment,
  addActivityComment,
  updateActivityComment,
  deleteActivityComment,
  fetchActivityTemplates,
} from 'src/sections/bpm/api';

function compareActivityCodes(a: ActivityItem, b: ActivityItem) {
  const slnDiff = (a.sln ?? 0) - (b.sln ?? 0);
  if (slnDiff !== 0) return slnDiff;
  const pa = a.code.split('-').map((s) => Number.parseInt(s, 10));
  const pb = b.code.split('-').map((s) => Number.parseInt(s, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

function getNextChildCodePreview(parent: ActivityItem, all: ActivityItem[]) {
  const siblings = all.filter((item) => item.parentActivityId === parent.id);
  return computeNextChildActivityCode(parent.code, siblings.map((s) => s.code));
}

export function ProcessActivitiesView() {
  const JOB_TITLES = [
    'Process Owner',
    'Process Analyst',
    'Operations Supervisor',
    'Finance Controller',
    'QA Specialist',
    'IT Coordinator',
  ];

  const router = useRouter();
  const { departmentId = '', processId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const lastConsumedParentQueryRef = useRef<string | null>(null);
  const [processItem, setProcessItem] = useState<BpmProcess | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [templateDetails, setTemplateDetails] = useState<Record<string, string | string[]>>({});
  const [activityName, setActivityName] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [status, setStatus] = useState('Draft');
  const [formError, setFormError] = useState('');
  const [discussionItem, setDiscussionItem] = useState<ActivityItem | null>(null);
  const [commentMessage, setCommentMessage] = useState('');
  const [commentError, setCommentError] = useState('');
  const [departmentFolder, setDepartmentFolder] = useState<DepartmentFolder | null>(null);
  const departmentName = departmentFolder?.name ?? '';
  const { designationOptions } = useHanaDesignations({
    hanaBranch: departmentFolder?.hanaBranch,
    bpmCode: departmentFolder?.companyCode,
  });
  const { jobRoleOptions } = useOracleJobRoles({
    hanaBranch: departmentFolder?.hanaBranch,
    bpmCode: departmentFolder?.companyCode,
  });
  /** Empty string = top-level sub-process under the process; otherwise UUID of parent activity. */
  const [parentActivityIdForAdd, setParentActivityIdForAdd] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const seenCommentIdsRef = useRef<Set<string>>(new Set());
  const discussionCommentsScrollRef = useRef<HTMLDivElement>(null);
  const [highlightNewCommentIds, setHighlightNewCommentIds] = useState<Set<string>>(() => new Set());
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null);

  const accessProfile = useAccessProfile();
  useEffect(() => {
    seenCommentIdsRef.current.clear();
    setHighlightNewCommentIds(new Set());
  }, [departmentId, processId]);

  useEffect(() => {
    lastConsumedParentQueryRef.current = null;
  }, [departmentId, processId]);

  useEffect(() => {
    fetchActivityTemplates()
      .then((items) => setTemplates(items))
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    fetchProcess(departmentId, processId)
      .then((item) => {
        setProcessItem(item);
        mergeSeenCommentIds(seenCommentIdsRef.current, item);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [departmentId, processId]);

  useEffect(() => {
    if (!departmentId || !processId || loading) {
      return undefined;
    }
    const intervalId = window.setInterval(async () => {
      try {
        const fresh = await fetchProcess(departmentId, processId);
        const newIds = diffNewCommentIds(seenCommentIdsRef.current, fresh);
        mergeSeenCommentIds(seenCommentIdsRef.current, fresh);
        setProcessItem(fresh);
        setDiscussionItem((prev) => {
          if (!prev) return null;
          const next = fresh.activities?.find((a) => a.id === prev.id);
          return next ?? prev;
        });
        if (newIds.size > 0) {
          setHighlightNewCommentIds(newIds);
          window.setTimeout(() => setHighlightNewCommentIds(new Set()), 2400);
        }
      } catch {
        /* silent */
      }
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, [departmentId, processId, loading]);

  useEffect(() => {
    if (!highlightNewCommentIds.size) return undefined;
    const el = discussionCommentsScrollRef.current;
    if (!el) return undefined;
    const raf = window.requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [highlightNewCommentIds]);

  useEffect(() => {
    fetchDepartment(departmentId)
      .then((item) => setDepartmentFolder(item))
      .catch(() => setDepartmentFolder(null));
  }, [departmentId]);

  useEffect(() => {
    const pid = searchParams.get('parentActivityId');
    if (!pid || !processItem?.activities?.length) return;
    if (lastConsumedParentQueryRef.current === pid) return;
    const parent = processItem.activities.find((a) => a.id === pid);
    if (!parent) return;
    lastConsumedParentQueryRef.current = pid;
    setParentActivityIdForAdd(pid);
    setTemplateDetails({});
    setActivityName('');
    setActivityDescription('');
    setStatus('Draft');
    setFormError('');
    setAddOpen(true);
    setSearchParams({}, { replace: true });
  }, [processItem, searchParams, setSearchParams]);

  const nextActivityMeta = useMemo(() => {
    if (!processItem) return { sln: 1, code: '' };
    const activities = processItem.activities ?? [];
    const maxSln = activities.reduce((max, item) => Math.max(max, item.sln ?? 0), 0);
    const nextSln = maxSln + 1;
    if (parentActivityIdForAdd) {
      const parent = activities.find((item) => item.id === parentActivityIdForAdd);
      if (!parent) return { sln: nextSln, code: '' };
      return {
        sln: nextSln,
        code: getNextChildCodePreview(parent, activities),
      };
    }
    const rootSiblingCodes = activities
      .filter((item) => !item.parentActivityId)
      .map((s) => s.code);
    return {
      sln: nextSln,
      code: computeNextRootActivityCode(processItem.code, rootSiblingCodes),
    };
  }, [processItem, parentActivityIdForAdd]);

  const selectedParentForAdd = useMemo(() => {
    if (!parentActivityIdForAdd || !processItem?.activities) return null;
    return processItem.activities.find((a) => a.id === parentActivityIdForAdd) ?? null;
  }, [parentActivityIdForAdd, processItem?.activities]);

  const parentOptionsForAdd = useMemo(
    () => [...(processItem?.activities ?? [])].sort((a, b) => compareActivityCodes(a, b)),
    [processItem?.activities]
  );

  const ownersOptions = processItem?.processOwners ?? [];
  const selectedTemplate = templates.find((item) => item.id === processItem?.activityTemplateId) ?? null;
  const sortedActivities = useMemo(
    () => [...(processItem?.activities ?? [])].sort((a, b) => compareActivityCodes(a, b)),
    [processItem?.activities]
  );

  const displayActivities = useMemo(() => {
    if (!tableSearch.trim()) return sortedActivities;
    return sortedActivities.filter((a) =>
      matchesTableSearch(
        tableSearch,
        a.code,
        a.activityName,
        a.templateName,
        a.status,
        (a.owners ?? []).join(' '),
        String(a.sln),
      )
    );
  }, [sortedActivities, tableSearch]);

  const trailSegments = useMemo(() => {
    if (!departmentFolder || !processItem) return [];
    const segs: Array<{ key: string; label: string; href?: string; current?: boolean }> = [];
    const { companyCode, code, name, id: deptId } = departmentFolder;
    if (companyCode?.trim()) {
      segs.push({
        key: 'co',
        label: companyCode,
        href: `/companies/${companyCode}/departments`,
      });
    }
    segs.push({
      key: 'pf',
      label: toDepartmentDisplayName(code, name),
      href: `/departments/${deptId}/processes`,
    });
    const processLabel = processItem.processName?.trim() || processItem.name || processItem.code;
    segs.push({
      key: 'proc',
      label: processLabel,
      href: `/departments/${deptId}/processes/${processItem.id}/activities`,
    });
    segs.push({ key: 'here', label: 'Sub-processes', current: true });
    return segs;
  }, [departmentFolder, processItem]);

  const buildHeaderRows = (activity: ActivityItem) => [
    ['Process Description', processItem?.description ?? '-'],
    ['Dept', departmentName || departmentId],
    ['Process Owners', (processItem?.processOwners ?? []).join(' | ') || '-'],
    ['Process ID', processItem?.code ?? '-'],
    ['Process Name', processItem?.processName ?? processItem?.name ?? '-'],
    ['Process Description', processItem?.processDescription ?? '-'],
    [],
    ['SL.No', 'Sub-process ID', 'Sub-process Name', 'Sub-process Description'],
    [activity.sln, activity.code, activity.activityName, activity.activityDescription ?? '-'],
  ];

  const sanitizeSheetName = (name: string) =>
    name
      .replace(/[\\/?*[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || 'Sub-process';

  const onDownloadProcessWorkbook = () => {
    if (!processItem) return;
    const workbook = XLSX.utils.book_new();

    const summaryRows = [
      ['Process Summary'],
      ['Dept', departmentName || departmentId],
      ['Process ID', processItem.code],
      ['Process Name', processItem.processName ?? processItem.name],
      ['Process Description', processItem.processDescription ?? processItem.description ?? '-'],
      ['# Sub-processes', sortedActivities.length],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Process Summary');

    sortedActivities.forEach((activity, index) => {
      const rows = buildHeaderRows(activity);
      const detailEntries = Object.entries(activity.details ?? {});
      if (detailEntries.length) {
        rows.push([], ['Field', 'Value']);
        detailEntries.forEach(([key, value]) => {
          rows.push([key, Array.isArray(value) ? value.join(', ') : String(value ?? '-')]);
        });
      }
      const activitySheet = XLSX.utils.aoa_to_sheet(rows);
      const sheetName = sanitizeSheetName(`${index + 1}-${activity.code}`);
      XLSX.utils.book_append_sheet(workbook, activitySheet, sheetName);
    });

    XLSX.writeFile(workbook, `${processItem.code}-sub-processes.xlsx`);
  };

  const closeAddDialog = () => {
    setAddOpen(false);
    setParentActivityIdForAdd('');
    lastConsumedParentQueryRef.current = null;
    setFormError('');
  };

  const openAddDialog = () => {
    setParentActivityIdForAdd('');
    setAddOpen(true);
    setTemplateDetails({});
    setActivityName('');
    setActivityDescription('');
    setStatus('Draft');
    setFormError('');
  };

  const onSaveActivity = async () => {
    const normalizedName = activityName.trim();
    if (!processItem?.activityTemplateId || !selectedTemplate) {
      setFormError('This process has no template. Define the sub-process template on the process first.');
      return;
    }
    if (!normalizedName) {
      setFormError('Sub-process name is required.');
      return;
    }

    try {
      const ownerFromSession = ownersOptions[0] ?? 'Current User';
      const resolvedFieldDiscussion = selectedTemplate.fields.reduce<Record<string, boolean>>((acc, field) => {
        acc[field.key] = !!field.openToDiscussion;
        return acc;
      }, {});

      await createActivity(departmentId, processId, {
        activityName: normalizedName,
        ...(parentActivityIdForAdd ? { parentActivityId: parentActivityIdForAdd } : {}),
        details: templateDetails,
        fieldDiscussion: resolvedFieldDiscussion,
        activityDescription: activityDescription.trim(),
        owners: [ownerFromSession],
        status,
        discussionEnabled: false,
      });

      const refreshed = await fetchProcess(departmentId, processId);
      mergeSeenCommentIds(seenCommentIdsRef.current, refreshed);
      setProcessItem(refreshed);
      closeAddDialog();
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  const updateDetailField = (fieldKey: string, value: string | string[]) => {
    setTemplateDetails((prev) => ({ ...prev, [fieldKey]: value }));
  };

  const openDiscussion = (item: ActivityItem) => {
    setDiscussionItem(item);
    setCommentMessage('');
    setCommentError('');
  };

  const onSendComment = async () => {
    if (!discussionItem) return;
    if (!commentMessage.trim()) {
      setCommentError('Message is required.');
      return;
    }

    try {
      const updatedProcess = await addActivityComment(departmentId, processId, discussionItem.id, {
        message: commentMessage.trim(),
      });
      const justAddedIds = diffNewCommentIds(seenCommentIdsRef.current, updatedProcess);
      mergeSeenCommentIds(seenCommentIdsRef.current, updatedProcess);
      setProcessItem(updatedProcess);
      const refreshed = (updatedProcess.activities ?? []).find((a) => a.id === discussionItem.id) ?? null;
      setDiscussionItem(refreshed);
      setCommentMessage('');
      setCommentError('');
      if (justAddedIds.size > 0) {
        setHighlightNewCommentIds(justAddedIds);
        window.setTimeout(() => setHighlightNewCommentIds(new Set()), 2400);
      }
    } catch (err) {
      setCommentError((err as Error).message);
    }
  };

  const patchDiscussionComment = async (commentId: string, fullMessage: string) => {
    if (!discussionItem) return;
    try {
      setCommentBusyId(commentId);
      setCommentError('');
      const updatedProcess = await updateActivityComment(
        departmentId,
        processId,
        discussionItem.id,
        commentId,
        { message: fullMessage },
      );
      mergeSeenCommentIds(seenCommentIdsRef.current, updatedProcess);
      setProcessItem(updatedProcess);
      const refreshed =
        (updatedProcess.activities ?? []).find((a) => a.id === discussionItem.id) ?? null;
      setDiscussionItem(refreshed);
    } catch (err) {
      setCommentError((err as Error).message);
    } finally {
      setCommentBusyId(null);
    }
  };

  const removeDiscussionComment = async (commentId: string) => {
    if (!discussionItem) return;
    try {
      setCommentBusyId(commentId);
      setCommentError('');
      const updatedProcess = await deleteActivityComment(
        departmentId,
        processId,
        discussionItem.id,
        commentId,
      );
      mergeSeenCommentIds(seenCommentIdsRef.current, updatedProcess);
      setProcessItem(updatedProcess);
      const refreshed =
        (updatedProcess.activities ?? []).find((a) => a.id === discussionItem.id) ?? null;
      setDiscussionItem(refreshed);
    } catch (err) {
      setCommentError((err as Error).message);
    } finally {
      setCommentBusyId(null);
    }
  };

  return (
    <DashboardContent>
      <Stack spacing={3}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h4">Process Sub-processes</Typography>
            <Typography
              variant="body2"
              sx={{ color: 'text.secondary', mt: 0.75, maxWidth: 720, lineHeight: 1.5 }}
            >
              {processItem
                ? `Sub-processes for ${processItem.processName?.trim() || processItem.name}`
                : 'Process not found.'}
            </Typography>
          </Box>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.25}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            justifyContent="space-between"
            useFlexGap
            flexWrap="wrap"
          >
            <BpmLocationTrail segments={trailSegments} />
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button variant="outlined" onClick={onDownloadProcessWorkbook} disabled={!processItem}>
                Export workbook (.xlsx)
              </Button>
              <Button
                variant="outlined"
                disabled={!processItem}
                onClick={() => {
                  if (!processItem) return;
                  downloadActivitiesTableXlsx(processItem.code, departmentName || departmentId, displayActivities);
                }}
              >
                Export table (.xlsx)
              </Button>
              <Button variant="contained" onClick={openAddDialog}>
                Add Sub-process
              </Button>
              <Button variant="outlined" onClick={() => router.push(`/departments/${departmentId}/processes`)}>
                Back to Processes
              </Button>
            </Stack>
          </Stack>
        </Stack>

        <Card>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Search sub-processes"
              placeholder="Code, name, owners, status…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
            />
            <Typography variant="caption" color="text.secondary">
              {displayActivities.length} row(s)
            </Typography>
          </Stack>
          <TableContainer>
            <Table sx={{ '& .MuiTableCell-root': { textAlign: 'left' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>SLN</TableCell>
                  <TableCell>Sub-process ID</TableCell>
                  <TableCell>Sub-process Name</TableCell>
                  <TableCell>Template</TableCell>
                  <TableCell>Owners</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Comments</TableCell>
                  <TableCell>Created At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                      Loading sub-processes...
                    </TableCell>
                  </TableRow>
                )}
                {displayActivities.map((activity) => (
                  <TableRow key={activity.id}>
                    <TableCell>{activity.sln}</TableCell>
                    <TableCell>{activity.code}</TableCell>
                    <TableCell>{activity.activityName}</TableCell>
                    <TableCell>{activity.templateName || '-'}</TableCell>
                    <TableCell>{activity.owners?.join(', ') || '-'}</TableCell>
                    <TableCell>{activity.status || 'Draft'}</TableCell>
                    <TableCell>
                      {activity.discussionEnabled ? (
                        <IconButton size="small" onClick={() => openDiscussion(activity)}>
                          <Iconify icon="solar:chat-round-dots-bold" width={18} />
                        </IconButton>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(activity.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {!loading && sortedActivities.length > 0 && !displayActivities.length && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                      No rows match your search.
                    </TableCell>
                  </TableRow>
                )}
                {!loading && !sortedActivities.length && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                      No sub-processes yet for this process.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>

      <Dialog open={addOpen} onClose={closeAddDialog} fullWidth maxWidth="xl">
        <DialogTitle>
          {parentActivityIdForAdd ? 'Add Sub Sub-process' : 'Add Sub-process'}
        </DialogTitle>
        <DialogContent sx={{ bgcolor: 'grey.100' }}>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              fullWidth
              select
              label="Parent sub-process (optional)"
              value={parentActivityIdForAdd}
              onChange={(event) => setParentActivityIdForAdd(event.target.value)}
              helperText="Leave empty for a top-level sub-process under this process, or choose a parent to nest under (Sub Sub-process)."
            >
              <MenuItem value="">
                <em>None — direct under process</em>
              </MenuItem>
              {parentOptionsForAdd.map((activity) => (
                <MenuItem key={activity.id} value={activity.id}>
                  {activity.code} — {activity.activityName}
                </MenuItem>
              ))}
            </TextField>
            {selectedParentForAdd && (
              <Alert severity="info" sx={{ py: 1.5 }}>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Parent sub-process
                </Typography>
                <Typography variant="body2">
                  <strong>Code:</strong> {selectedParentForAdd.code}
                </Typography>
                <Typography variant="body2">
                  <strong>Name:</strong> {selectedParentForAdd.activityName}
                </Typography>
              </Alert>
            )}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField fullWidth label="SLN" value={nextActivityMeta.sln} disabled />
              <TextField
                fullWidth
                label={parentActivityIdForAdd ? 'Sub Sub-process ID (after save)' : 'Sub-process ID'}
                value={nextActivityMeta.code}
                disabled
                helperText={
                  parentActivityIdForAdd
                    ? 'Generated as parent code + next segment (e.g. …-002-001).'
                    : 'Generated from process code and sequence.'
                }
              />
            </Stack>
            <TextField
              fullWidth
              label="Sub-process Name"
              value={activityName}
              onChange={(event) => setActivityName(event.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'grey.50',
                  '& fieldset': { borderColor: 'grey.500' },
                },
              }}
            />
            <TextField
              fullWidth
              multiline
              minRows={3}
              label="Sub-process Description"
              value={activityDescription}
              onChange={(event) => setActivityDescription(event.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'grey.50',
                  '& fieldset': { borderColor: 'grey.500' },
                },
              }}
            />
            {selectedTemplate && (
              <Stack spacing={2}>
                {selectedTemplate.fields
                  .filter((field) => {
                    const normalizedLabel = field.label.trim().toLowerCase();
                    return (
                      !['activityName', 'activity_name', 'activityDescription', 'activity_description'].includes(
                        field.key
                      ) &&
                      normalizedLabel !== 'activity name' &&
                      normalizedLabel !== 'activity description' &&
                      normalizedLabel !== 'sub-process name' &&
                      normalizedLabel !== 'sub-process description' &&
                      !isServerGeneratedActivityDetailKey(field.key)
                    );
                  })
                  .map((field) => {
                    const raw = templateDetails[field.key];
                    const value =
                      raw === undefined || raw === null
                        ? field.type === 'person_multi' ||
                            field.type === 'dropdown_multiselect' ||
                            field.type === 'oracle_job_role_multi' ||
                            field.type === 'app_master' ||
 field.type === 'approval_flow'
                          ? []
                          : ''
                        : raw;
                    return (
                      <Box key={field.key}>
                        {renderTemplateDetailFieldInput(field, value, (next) => updateDetailField(field.key, next), {
                          ownersOptions,
                          jobTitles: JOB_TITLES,
                          designations: designationOptions,
                          jobRoles: jobRoleOptions,
                        })}
                      </Box>
                    );
                  })}
              </Stack>
            )}
            <TextField
              fullWidth
              select
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <MenuItem value="Draft">Draft</MenuItem>
              <MenuItem value="Confirmed">Confirmed</MenuItem>
              <MenuItem value="In Progress">In Progress</MenuItem>
              <MenuItem value="Done">Done</MenuItem>
            </TextField>
            {formError && <Alert severity="error">{formError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAddDialog} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={onSaveActivity}>
            Save Sub-process
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!discussionItem} onClose={() => setDiscussionItem(null)} fullWidth maxWidth="md">
        <DialogTitle>Discussion — {discussionItem?.activityName ?? 'Sub-process'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Card
              ref={discussionCommentsScrollRef}
              variant="outlined"
              sx={{ p: 2, maxHeight: 280, overflowY: 'auto', scrollbarGutter: 'stable' }}
            >
              <Stack spacing={1.5}>
                {(discussionItem?.comments ?? []).map((comment) => (
                  <ActivityCommentBubble
                    key={comment.id}
                    comment={comment}
                    highlight={highlightNewCommentIds.has(comment.id)}
                    canMutate={commentAuthorMatchesProfile(comment, accessProfile)}
                    mutating={commentBusyId === comment.id}
                    onUpdate={(full) => patchDiscussionComment(comment.id, full)}
                    onDelete={() => removeDiscussionComment(comment.id)}
                  />
                ))}
                {!discussionItem?.comments?.length && (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    No discussion messages yet.
                  </Typography>
                )}
              </Stack>
            </Card>
            <TextField
              fullWidth
              label="Message"
              value={commentMessage}
              onChange={(event) => setCommentMessage(event.target.value)}
            />
            {commentError && <Alert severity="error">{commentError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDiscussionItem(null)} color="inherit">
            Close
          </Button>
          <Button variant="contained" onClick={onSendComment}>
            Send
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
}

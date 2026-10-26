import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { Iconify } from 'src/components/iconify';

import {
  fetchDepartmentsExplorerTree,
  type AddActivityRelationPayload,
} from 'src/sections/bpm/api';
import {
  type BpmProcess,
  type ActivityItem,
  type DepartmentFolder,
  toDepartmentDisplayName,
  type RelatedSubProcessLink,
} from 'src/sections/bpm/storage';

function formatRelatedLinkHint(link: RelatedSubProcessLink): string {
  return `${link.code}\n${toDepartmentDisplayName(link.departmentCode, link.departmentName)} / ${link.processName}`;
}

type ExplorerProcess = NonNullable<DepartmentFolder['processes']>[number];
type ExplorerActivity = NonNullable<ExplorerProcess['activities']>[number];

export function RelatedSubProcessLinksCell({
  links,
  onOpenLink,
  compact = true,
}: {
  links: RelatedSubProcessLink[] | undefined;
  onOpenLink: (link: RelatedSubProcessLink) => void;
  /** Table view: name-only chips (compact width). Editor: full name. */
  compact?: boolean;
}) {
  const items = links ?? [];
  if (!items.length) {
    return (
      <Typography variant="body2" color="text.disabled">
        —
      </Typography>
    );
  }

  return (
    <Stack spacing={0.5} sx={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
      {items.map((link) => {
        const name = link.activityName?.trim() || link.code;

        return (
        <Tooltip
          key={link.id}
          title={
            <Box component="span" sx={{ display: 'block', whiteSpace: 'pre-line', lineHeight: 1.4 }}>
              {name}
              {'\n'}
              {formatRelatedLinkHint(link)}
            </Box>
          }
          arrow
          placement="top"
          enterDelay={300}
        >
          <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
            <Chip
              size="small"
              variant="outlined"
              color="primary"
              clickable
              onClick={(event) => {
                event.stopPropagation();
                onOpenLink(link);
              }}
              icon={<Iconify icon="solar:share-bold" width={compact ? 12 : 14} />}
              label={name}
              sx={{
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                height: compact ? 22 : 26,
                justifyContent: 'flex-start',
                '& .MuiChip-label': {
                  display: 'block',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  lineHeight: 1.2,
                  py: 0,
                  px: 0.25,
                  fontSize: compact ? '0.6875rem' : '0.75rem',
                },
                '& .MuiChip-icon': {
                  ml: 0.5,
                  mr: -0.25,
                },
              }}
            />
          </Box>
        </Tooltip>
        );
      })}
    </Stack>
  );
}

export function RelatedSubProcessDetailDialog({
  open,
  link,
  onClose,
}: {
  open: boolean;
  link: RelatedSubProcessLink | null;
  onClose: () => void;
}) {
  if (!link) {
    return null;
  }

  const detailEntries = Object.entries(link.details ?? {}).filter(
    ([, value]) => value !== undefined && value !== null && String(value).trim() !== '',
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Relative Sub-process</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.secondary">
              Location
            </Typography>
            <Typography variant="body2">
              {formatRelatedLinkHint(link)}
            </Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.secondary">
              Sub-process ID
            </Typography>
            <Typography variant="body2">{link.code}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="overline" color="text.secondary">
              Sub-process Name
            </Typography>
            <Typography variant="body2">{link.activityName}</Typography>
          </Stack>
          {link.activityDescription ? (
            <Stack spacing={0.5}>
              <Typography variant="overline" color="text.secondary">
                Description
              </Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {link.activityDescription}
              </Typography>
            </Stack>
          ) : null}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Stack spacing={0.5} sx={{ flex: 1 }}>
              <Typography variant="overline" color="text.secondary">
                Status
              </Typography>
              <Typography variant="body2">{link.status ?? '-'}</Typography>
            </Stack>
            <Stack spacing={0.5} sx={{ flex: 1 }}>
              <Typography variant="overline" color="text.secondary">
                Owners
              </Typography>
              <Typography variant="body2">{(link.owners ?? []).join(', ') || '-'}</Typography>
            </Stack>
          </Stack>
          {detailEntries.length ? (
            <Stack spacing={1}>
              <Typography variant="overline" color="text.secondary">
                Details
              </Typography>
              {detailEntries.map(([key, value]) => (
                <Box key={key}>
                  <Typography variant="caption" color="text.secondary">
                    {key}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

/** Exact company entity match (FZCO ≠ FZCO-V1). */
function sameCompanyEntity(left?: string | null, right?: string | null): boolean {
  const a = left?.trim().toUpperCase() ?? '';
  const b = right?.trim().toUpperCase() ?? '';
  return Boolean(a && b && a === b);
}

type LinkPickerProps = {
  open: boolean;
  title?: string;
  sourceActivity: ActivityItem;
  companyCode?: string | null;
  onClose: () => void;
  onSave: (payload: AddActivityRelationPayload) => Promise<void>;
};

export function RelatedSubProcessLinkDialog({
  open,
  title = 'Link with Sub-process',
  sourceActivity,
  companyCode,
  onClose,
  onSave,
}: LinkPickerProps) {
  const [tree, setTree] = useState<DepartmentFolder[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [departmentId, setDepartmentId] = useState('');
  const [processId, setProcessId] = useState('');
  const [targetActivityId, setTargetActivityId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDepartmentId('');
    setProcessId('');
    setTargetActivityId('');
    setError('');
    setLoadingTree(true);
    fetchDepartmentsExplorerTree(companyCode)
      .then((rows) => setTree(rows ?? []))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingTree(false));
  }, [open, companyCode]);

  const companyTree = useMemo(
    () =>
      tree.filter((dept) => {
        if (!companyCode?.trim()) {
          return false;
        }
        if (sameCompanyEntity(dept.companyCode, companyCode)) {
          return true;
        }
        return (dept.processes ?? []).some((proc) =>
          sameCompanyEntity(proc.companyCode, companyCode),
        );
      }),
    [tree, companyCode],
  );

  const processes = useMemo<ExplorerProcess[]>(() => {
    const dept = companyTree.find((item) => item.id === departmentId);
    return (dept?.processes ?? []).filter((proc) => {
      if (!companyCode?.trim()) return false;
      if (sameCompanyEntity(proc.companyCode, companyCode)) return true;
      // Legacy rows with empty process.companyCode inherit department company.
      if (!proc.companyCode?.trim()) {
        return sameCompanyEntity(dept?.companyCode, companyCode);
      }
      return false;
    });
  }, [companyTree, departmentId, companyCode]);

  const activities = useMemo<ExplorerActivity[]>(() => {
    const proc = processes.find((item) => item.id === processId);
    return proc?.activities ?? [];
  }, [processes, processId]);

  const selectableActivities = useMemo(
    () =>
      activities.filter((item) => {
        if (item.id === sourceActivity.id) {
          return false;
        }
        const alreadyLinked = (sourceActivity.relatedSubProcesses ?? []).some(
          (link) => link.id === item.id,
        );
        return !alreadyLinked;
      }),
    [activities, sourceActivity],
  );

  const handleSave = async () => {
    if (!departmentId || !processId || !targetActivityId) {
      setError('Select department, process, and sub-process.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        targetDepartmentId: departmentId,
        targetProcessId: processId,
        targetActivityId,
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info" icon={false}>
            Linking from <strong>{sourceActivity.code}</strong> — {sourceActivity.activityName}
            {companyCode?.trim()
              ? ` · same company entity only (${companyCode.trim()})`
              : ''}
          </Alert>
          <TextField
            select
            fullWidth
            label="Department (Process Function)"
            value={departmentId}
            disabled={loadingTree}
            helperText={
              !loadingTree && companyCode?.trim() && companyTree.length === 0
                ? 'No process functions found for this company.'
                : undefined
            }
            onChange={(event) => {
              setDepartmentId(event.target.value);
              setProcessId('');
              setTargetActivityId('');
            }}
          >
            {companyTree.map((dept) => (
              <MenuItem key={dept.id} value={dept.id}>
                {toDepartmentDisplayName(dept.code, dept.name)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Process"
            value={processId}
            disabled={!departmentId}
            onChange={(event) => {
              setProcessId(event.target.value);
              setTargetActivityId('');
            }}
          >
            {processes.map((proc) => (
              <MenuItem key={proc.id} value={proc.id}>
                {proc.code} — {proc.processName ?? proc.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            label="Sub-process"
            value={targetActivityId}
            disabled={!processId}
            onChange={(event) => setTargetActivityId(event.target.value)}
          >
            {selectableActivities.map((activity) => (
              <MenuItem key={activity.id} value={activity.id}>
                {activity.code} — {activity.activityName}
              </MenuItem>
            ))}
          </TextField>
          {error ? <Alert severity="error">{error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save link'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

type EditorSectionProps = {
  activity: ActivityItem;
  canEdit: boolean;
  onOpenLink: (link: RelatedSubProcessLink) => void;
  onAddLink: () => void;
  onRemoveLink: (targetActivityId: string) => Promise<void>;
};

export function RelatedSubProcessEditorSection({
  activity,
  canEdit,
  onOpenLink,
  onAddLink,
  onRemoveLink,
}: EditorSectionProps) {
  const links = activity.relatedSubProcesses ?? [];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  return (
    <Card
      variant="outlined"
      sx={{
        p: 2,
        bgcolor: '#FFF6F6',
        borderColor: '#E8C8C8',
      }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle1">Relative Sub-process links</Typography>
          {canEdit ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Iconify icon="solar:share-bold" width={18} />}
              onClick={onAddLink}
            >
              Link sub-process
            </Button>
          ) : null}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Optional cross-links to other sub-processes. Links appear on both sides in the table.
        </Typography>
        <Divider />
        {!links.length ? (
          <Typography variant="body2" color="text.secondary">
            No linked sub-processes yet.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {links.map((link) => (
              <Stack
                key={link.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                alignItems={{ xs: 'stretch', sm: 'center' }}
                justifyContent="space-between"
              >
                <RelatedSubProcessLinksCell
                  links={[link]}
                  compact={false}
                  onOpenLink={onOpenLink}
                />
                {canEdit ? (
                  <Button
                    size="small"
                    color="error"
                    variant="outlined"
                    disabled={busyId === link.id}
                    onClick={() => {
                      void (async () => {
                        setBusyId(link.id);
                        setError('');
                        try {
                          await onRemoveLink(link.id);
                        } catch (err) {
                          setError((err as Error).message);
                        } finally {
                          setBusyId(null);
                        }
                      })();
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </Stack>
            ))}
          </Stack>
        )}
        {error ? <Alert severity="error">{error}</Alert> : null}
      </Stack>
    </Card>
  );
}

export type RelatedSubProcessRefreshHandler = (next: BpmProcess) => void;

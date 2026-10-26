import type { BpmProcess, DepartmentFolder } from 'src/sections/bpm/storage';

import { useState, useEffect } from 'react';

import Grid from '@mui/material/Grid';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import DialogTitle from '@mui/material/DialogTitle';
import Autocomplete from '@mui/material/Autocomplete';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import {
  mapStoredOwnersToEmails,
  filterOwnersToKnownUsers,
} from 'src/sections/bpm/bpm-process-owners.util';
import {
  defineProcess,
  type AccessUser,
  fetchAccessUsers,
  fetchActivityTemplates,
} from 'src/sections/bpm/api';

export type ProcessEditDialogProps = {
  open: boolean;
  department: Pick<DepartmentFolder, 'id' | 'name'> | null;
  process: BpmProcess | null;
  onClose: () => void;
  onSaved: (next: BpmProcess) => void;
};

export function ProcessEditDialog({ open, department, process, onClose, onSaved }: ProcessEditDialogProps) {
  const [editError, setEditError] = useState('');
  const [processName, setProcessName] = useState('');
  const [processDescription, setProcessDescription] = useState('');
  const [processOwners, setProcessOwners] = useState<string[]>([]);
  const [activityTemplateId, setActivityTemplateId] = useState('');
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!open) {
      return () => {};
    }
    let cancelled = false;
    setEditError('');
    Promise.all([fetchActivityTemplates(), fetchAccessUsers()])
      .then(([tplList, users]) => {
        if (cancelled) return;
        setTemplates(tplList.map((item) => ({ id: item.id, name: item.name })));
        setAccessUsers(users);
      })
      .catch((err: Error) => {
        if (!cancelled) setEditError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!process || !open) return;
    setProcessName((process.processName ?? '').trim());
    setProcessDescription(
      (process.processDescription ?? '').trim() || (process.description ?? '').trim() || '',
    );
    setActivityTemplateId(process.activityTemplateId ?? '');
    setEditError('');
    if (accessUsers.length) {
      setProcessOwners(mapStoredOwnersToEmails(process.processOwners, accessUsers));
    } else {
      setProcessOwners(process.processOwners ?? []);
    }
  }, [process, open, accessUsers]);

  const departmentDisplayValue = department?.name ?? '';
  const processIdPreview =
    process?.code && processName.trim()
      ? `${process.code}_${processName.trim()}`
      : (process?.name ?? '');

  const ownerEmailOptions = accessUsers.map((u) => u.email);

  const ownerChipLabel = (email: string) => {
    const u = accessUsers.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    return u ? `${u.displayName} (${u.email})` : email;
  };

  const onSaveEdit = async () => {
    if (!department || !process) return;

    try {
      setSavingEdit(true);
      const hasDefinitionInput =
        !!processDescription.trim() || processOwners.length > 0 || !!activityTemplateId;
      const hasExistingDefinition =
        !!process.activityTemplateId ||
        !!process.description ||
        !!process.processDescription ||
        (process.processOwners?.length ?? 0) > 0;

      if (!hasDefinitionInput && !hasExistingDefinition) {
        setEditError('Choose a sub-process template and fill process details, or cancel.');
        return;
      }

      if (!activityTemplateId) {
        setEditError('Sub-process template is required.');
        return;
      }

      const trimmedProcessName = processName.trim();
      if (!trimmedProcessName) {
        setEditError('Process name is required.');
        return;
      }

      const ownersPayload =
        accessUsers.length > 0 ? filterOwnersToKnownUsers(processOwners, accessUsers) : processOwners;

      const finalUpdated = await defineProcess(department.id, process.id, {
        activityTemplateId,
        description: '',
        processOwners: ownersPayload,
        processDescription: processDescription.trim(),
        processName: trimmedProcessName,
      });

      onSaved(finalUpdated);
      onClose();
      setEditError('');
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Edit Process</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                label="Process Name"
                value={processName}
                onChange={(event) => setProcessName(event.target.value)}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Process ID (code & name)" value={processIdPreview} disabled />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Process function" value={departmentDisplayValue} disabled />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Company" value={process?.companyCode ?? '—'} disabled />
            </Grid>
          </Grid>

          <Divider />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Sub-process Template"
                value={activityTemplateId}
                onChange={(event) => setActivityTemplateId(event.target.value)}
              >
                {templates.map((template) => (
                  <MenuItem key={template.id} value={template.id}>
                    {template.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Autocomplete
                multiple
                options={ownerEmailOptions}
                value={processOwners}
                onChange={(_event, value) => setProcessOwners(value)}
                getOptionLabel={(email) => ownerChipLabel(email)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Process owners"
                    placeholder={accessUsers.length ? 'Pick users from the list' : 'Loading users…'}
                    helperText={
                      accessUsers.length
                        ? 'These owners apply to the whole process; saving updates every sub-process row.'
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
                value={processDescription}
                onChange={(event) => setProcessDescription(event.target.value)}
              />
            </Grid>
          </Grid>
          {editError && <Alert severity="error">{editError}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            void onSaveEdit();
          }}
          disabled={savingEdit}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

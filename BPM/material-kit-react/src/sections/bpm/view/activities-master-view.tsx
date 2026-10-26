import { useMemo, useState, useEffect } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
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
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import TableContainer from '@mui/material/TableContainer';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { matchesTableSearch } from 'src/sections/bpm/table-search.util';
import { type ActivityTemplate, type ActivityTemplateField } from 'src/sections/bpm/storage';
import { withFixedFieldType, matchFixedTemplateField } from 'src/sections/bpm/template-fixed-fields';
import { invalidateBpmActivityTemplatesCache } from 'src/sections/bpm/components/bpm-grid-import-dialog';
import {
  createActivityTemplate,
  deleteActivityTemplate,
  fetchActivityTemplates,
  updateActivityTemplate,
} from 'src/sections/bpm/api';
import {
  reorderFieldRows,
  rowsToTemplateFields,
  templateFieldsToRows,
  emptyTemplateFieldRow,
  type TemplateFieldRow,
} from 'src/sections/bpm/template-field-rows.util';

const DRAG_MIME = 'application/x-bpm-template-field-index';

export function ActivitiesMasterView() {
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityTemplate | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<TemplateFieldRow[]>([emptyTemplateFieldRow()]);
  const [tableSearch, setTableSearch] = useState('');
  const sortedTemplates = [...templates].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const filteredTemplates = useMemo(() => {
    if (!tableSearch.trim()) return sortedTemplates;
    return sortedTemplates.filter((t) =>
      matchesTableSearch(tableSearch, t.name, t.description, String(t.fields.length)),
    );
  }, [sortedTemplates, tableSearch]);

  useEffect(() => {
    fetchActivityTemplates()
      .then(setTemplates)
      .catch((err: Error) => setError(err.message));
  }, []);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setFields([emptyTemplateFieldRow()]);
    setDialogOpen(true);
  };

  const openEdit = (template: ActivityTemplate) => {
    setEditing(template);
    setName(template.name);
    setDescription(template.description ?? '');
    setFields(
      template.fields.length
        ? templateFieldsToRows(template.fields).map((row) => withFixedFieldType(row))
        : [emptyTemplateFieldRow()],
    );
    setDialogOpen(true);
  };

  const onDeleteTemplate = async (template: ActivityTemplate) => {
    const ok = window.confirm(`Are you sure you want to delete template "${template.name}"?`);
    if (!ok) return;
    try {
      await deleteActivityTemplate(template.id);
      invalidateBpmActivityTemplatesCache();
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updateField = (index: number, patch: Partial<ActivityTemplateField>) => {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? withFixedFieldType({ ...f, ...patch }) : f)),
    );
  };

  const handleFieldDragStart = (index: number) => (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFieldDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleFieldDrop = (dropIndex: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData(DRAG_MIME);
    const from = Number.parseInt(raw, 10);
    if (Number.isNaN(from)) return;
    setFields((prev) => reorderFieldRows(prev, from, dropIndex));
  };

  const onSave = async () => {
    const stripped = rowsToTemplateFields(fields);
    const cleaned = stripped
      .map((f) => ({
        ...f,
        key: f.key.trim(),
        label: f.label.trim(),
        openToDiscussion: !!f.openToDiscussion,
        options: (f.options ?? []).map((o) => o.trim()).filter(Boolean),
      }))
      .filter((f) => f.key && f.label);

    if (!name.trim() || !cleaned.length) {
      setError('Template name and at least one field are required.');
      return;
    }

    try {
      const payload = { name: name.trim(), description: description.trim(), fields: cleaned };
      const saved = editing
        ? await updateActivityTemplate(editing.id, payload)
        : await createActivityTemplate(payload);

      invalidateBpmActivityTemplatesCache();
      setTemplates((prev) =>
        editing ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved]
      );
      setDialogOpen(false);
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <DashboardContent>
      <Stack spacing={3}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4">Sub-process Template Master</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              Create and maintain reusable sub-process templates. Field <strong>order</strong> (1, 2, 3…) is saved
              left-to-right — drag the handle or use arrows. Grid import uses the same order.
            </Typography>
          </Box>
          <Button variant="contained" onClick={openCreate}>
            New Template
          </Button>
        </Box>

        <Card>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Search templates"
              placeholder="Name, description…"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 220 }}
            />
            <Typography variant="caption" color="text.secondary">
              {filteredTemplates.length} template(s)
            </Typography>
          </Stack>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Template Name</TableCell>
                  <TableCell># Fields</TableCell>
                  <TableCell>Created At</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>{template.name}</TableCell>
                    <TableCell>{template.fields.length}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(template.createdAt).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Rename / Edit template">
                          <IconButton size="small" onClick={() => openEdit(template)}>
                            <Iconify icon="solar:pen-bold" width={18} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete template">
                          <IconButton size="small" color="error" onClick={() => void onDeleteTemplate(template)}>
                            <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {!filteredTemplates.length && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>
                      {sortedTemplates.length
                        ? 'No templates match your search.'
                        : 'No templates yet. Create your first sub-process master template.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
        {error && <Alert severity="error">{error}</Alert>}
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>{editing ? 'Edit Sub-process Template' : 'New Sub-process Template'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField fullWidth label="Template Name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
              Fields (order = column order in grid import &amp; process table)
            </Typography>
            <TableContainer sx={{ maxWidth: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small" sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 100 }}>Order</TableCell>
                    <TableCell>Field Key</TableCell>
                    <TableCell>Field Label</TableCell>
                    <TableCell sx={{ width: 160 }}>Type</TableCell>
                    <TableCell sx={{ width: 120 }}>Comments</TableCell>
                    <TableCell>Options</TableCell>
                    <TableCell align="right" sx={{ width: 112 }}>
                      Move
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow
                      key={field._rid}
                      hover
                      onDragOver={handleFieldDragOver}
                      onDrop={handleFieldDrop(index)}
                      sx={{ '&:last-of-type td': { borderBottom: 0 } }}
                    >
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <Stack direction="row" alignItems="center" spacing={0.75}>
                          <Chip label={index + 1} size="small" variant="outlined" sx={{ fontWeight: 700 }} />
                          <Tooltip title="Drag to reorder">
                            <Box
                              component="span"
                              draggable
                              onDragStart={handleFieldDragStart(index)}
                              sx={{
                                cursor: 'grab',
                                display: 'inline-flex',
                                alignItems: 'center',
                                p: 0.5,
                                borderRadius: 0.75,
                                '&:active': { cursor: 'grabbing' },
                                '&:hover': { bgcolor: 'action.hover' },
                              }}
                            >
                              <Iconify icon="carbon:chevron-sort" width={18} sx={{ color: 'text.secondary' }} />
                            </Box>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Key"
                          value={field.key}
                          onChange={(e) => updateField(index, { key: e.target.value })}
                        />
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Label"
                          value={field.label}
                          onChange={(e) => updateField(index, { label: e.target.value })}
                        />
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <TextField
                          fullWidth
                          size="small"
                          select
                          label="Type"
                          disabled={!!matchFixedTemplateField(field)}
                          helperText={
                            matchFixedTemplateField(field) ? 'Fixed by system' : undefined
                          }
                          value={field.type}
                          onChange={(e) =>
                            updateField(index, { type: e.target.value as ActivityTemplateField['type'] })
                          }
                        >
                          <MenuItem value="text">Text</MenuItem>
                          <MenuItem value="textarea">Textarea</MenuItem>
                          <MenuItem value="yes_no">Yes / No</MenuItem>
                          <MenuItem value="number">Number</MenuItem>
                          <MenuItem value="numeric_days">Numeric (Minutes)</MenuItem>
                          <MenuItem value="oracle_job_role_multi">Oracle Job Role (Multi)</MenuItem>
                          <MenuItem value="dropdown_job_title">Dropdown (Job Title)</MenuItem>
                          <MenuItem value="dropdown_person_name">Dropdown (Personal Name)</MenuItem>
                          <MenuItem value="dropdown_multiselect">Dropdown (Multiselect)</MenuItem>
                          <MenuItem value="dropdown">Dropdown (Options)</MenuItem>
                          <MenuItem value="app_master">APP_MASTER (Application Master, Multi)</MenuItem>
                          <MenuItem value="approval_flow">Approval Flow (Yes/No + ordered job roles)</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <TextField
                          fullWidth
                          size="small"
                          select
                          label="Comments"
                          value={field.openToDiscussion ? 'yes' : 'no'}
                          onChange={(e) => updateField(index, { openToDiscussion: e.target.value === 'yes' })}
                        >
                          <MenuItem value="yes">Yes</MenuItem>
                          <MenuItem value="no">No</MenuItem>
                        </TextField>
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <TextField
                          fullWidth
                          size="small"
                          label="Options"
                          placeholder={
                            field.type === 'app_master'
                              ? 'From Application Master'
                              : 'Comma separated'
                          }
                          disabled={!!matchFixedTemplateField(field) || field.type === 'app_master'}
                          value={(field.options ?? []).join(', ')}
                          onChange={(e) => updateField(index, { options: e.target.value.split(',') })}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ verticalAlign: 'top' }}>
                        <Stack direction="row" spacing={0.25} justifyContent="flex-end">
                          <Tooltip title="Move up">
                            <span>
                              <IconButton
                                size="small"
                                disabled={index === 0}
                                onClick={() => setFields((p) => reorderFieldRows(p, index, index - 1))}
                              >
                                <Iconify icon="eva:arrow-ios-upward-fill" width={18} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Move down">
                            <span>
                              <IconButton
                                size="small"
                                disabled={index === fields.length - 1}
                                onClick={() => setFields((p) => reorderFieldRows(p, index, index + 1))}
                              >
                                <Iconify icon="eva:arrow-ios-downward-fill" width={18} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Remove field">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={fields.length <= 1}
                                onClick={() => setFields((p) => p.filter((_, i) => i !== index))}
                              >
                                <Iconify icon="solar:trash-bin-trash-bold" width={18} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Button variant="text" onClick={() => setFields((prev) => [...prev, emptyTemplateFieldRow()])}>
              + Add Field
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void onSave()}>
            Save Template
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
}

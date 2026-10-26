import { useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';

import { DashboardContent } from 'src/layouts/dashboard';

import { Iconify } from 'src/components/iconify';

import { toDepartmentDisplayName } from 'src/sections/bpm/storage';
import {
  type AiBpmTarget,
  fetchAiBpmTargets,
  type AiBpmTemplate,
  fetchAiBpmTemplates,
  generateAiBpmContent,
  approveAiBpmDocument,
  type AiBpmGenerateResult,
} from 'src/sections/bpm/api';

const MIN_PROMPT_LENGTH = 20;

export function AiBpmGenerateView() {
  const [departments, setDepartments] = useState<AiBpmTarget[]>([]);
  const [templates, setTemplates] = useState<AiBpmTemplate[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);
  const [initError, setInitError] = useState('');

  const [departmentId, setDepartmentId] = useState('');
  const [processId, setProcessId] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveComments, setApproveComments] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [approveSuccess, setApproveSuccess] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [result, setResult] = useState<AiBpmGenerateResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingInit(true);
      setInitError('');
      try {
        const [tree, templateList] = await Promise.all([
          fetchAiBpmTargets(),
          fetchAiBpmTemplates(),
        ]);
        if (cancelled) return;
        setDepartments(tree);
        setTemplates(templateList);
      } catch (e) {
        if (!cancelled) {
          setInitError((e as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoadingInit(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDepartment = useMemo(
    () => departments.find((d) => d.id === departmentId),
    [departments, departmentId],
  );

  const selectedProcess = useMemo(
    () => selectedDepartment?.processes.find((p) => p.id === processId),
    [selectedDepartment, processId],
  );

  const trimmedPrompt = userPrompt.trim();
  const hasTemplates = selectedTemplateIds.length > 0;
  const hasPrompt = trimmedPrompt.length > 0;
  const promptOnlyTooShort = hasPrompt && !hasTemplates && trimmedPrompt.length < MIN_PROMPT_LENGTH;
  const canGenerate = Boolean(departmentId) && (hasTemplates || (hasPrompt && !promptOnlyTooShort));

  const toggleTemplate = (id: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setResult(null);
  };

  const selectAllTemplates = () => {
    setSelectedTemplateIds(templates.map((t) => t.id));
    setResult(null);
  };

  const clearTemplates = () => {
    setSelectedTemplateIds([]);
    setResult(null);
  };

  const handleDepartmentChange = (id: string) => {
    setDepartmentId(id);
    setProcessId('');
    setResult(null);
    setGenerateError('');
  };

  const isProcessFunctionScope = Boolean(departmentId && !processId);

  const openConfirm = () => {
    if (!departmentId) {
      setGenerateError('Select a process function first.');
      return;
    }
    if (!canGenerate) {
      if (!hasPrompt && !hasTemplates) {
        setGenerateError('Enter a prompt and/or select at least one deliverable.');
      } else if (promptOnlyTooShort) {
        setGenerateError(
          `Enter a longer prompt (at least ${MIN_PROMPT_LENGTH} characters) or select deliverables.`,
        );
      } else {
        setGenerateError('Select a process function first.');
      }
      return;
    }
    setGenerateError('');
    setConfirmOpen(true);
  };

  const runGenerate = useCallback(async () => {
    setConfirmOpen(false);
    setGenerating(true);
    setGenerateError('');
    setResult(null);
    try {
      const out = await generateAiBpmContent({
        departmentId,
        processId: processId || undefined,
        userPrompt: trimmedPrompt || undefined,
        templateIds: hasTemplates ? selectedTemplateIds : undefined,
      });
      setResult(out);
    } catch (e) {
      setGenerateError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }, [departmentId, processId, trimmedPrompt, selectedTemplateIds, hasTemplates]);

  const handleRemoveDocument = () => {
    setResult(null);
    setApproveSuccess('');
    setApproveError('');
    setApproveComments('');
  };

  const runApproveDocument = async () => {
    if (!result?.docxBase64 || !departmentId) return;
    setApproving(true);
    setApproveError('');
    setApproveSuccess('');
    try {
      await approveAiBpmDocument({
        departmentId,
        processId: processId || undefined,
        docxBase64: result.docxBase64,
        docxFilename: result.docxFilename,
        comments: approveComments.trim() || undefined,
      });
      setApproveOpen(false);
      setApproveSuccess(
        'Document approved and linked to Process Function Documentation.',
      );
    } catch (e) {
      setApproveError((e as Error).message);
    } finally {
      setApproving(false);
    }
  };

  const handleDownloadWord = () => {
    if (!result?.docxBase64) return;
    const binary = atob(result.docxBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.docxFilename || 'BPM-Document.docx';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadingInit) {
    return (
      <DashboardContent>
        <Stack spacing={2}>
          <PageHeader />
          <Card sx={{ p: 3 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <CircularProgress size={28} />
              <Box>
                <Typography variant="subtitle2">Loading workspace…</Typography>
                <Typography variant="caption" color="text.secondary">
                  Process functions and deliverable presets
                </Typography>
              </Box>
            </Stack>
          </Card>
        </Stack>
      </DashboardContent>
    );
  }

  return (
    <DashboardContent>
      <Stack spacing={2}>
        <PageHeader />
        {initError ? <Alert severity="error">{initError}</Alert> : null}
        {approveSuccess ? <Alert severity="success">{approveSuccess}</Alert> : null}
        {approveError ? <Alert severity="error">{approveError}</Alert> : null}

        <Card sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="subtitle1">1. Select scope</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                select
                fullWidth
                label="Process function"
                value={departmentId}
                onChange={(e) => handleDepartmentChange(e.target.value)}
              >
                <MenuItem value="">— Select —</MenuItem>
                {departments.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {toDepartmentDisplayName(d.code, d.name)} ({d.code})
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                fullWidth
                label="Process (optional)"
                value={processId}
                disabled={!departmentId}
                helperText={
                  departmentId && !processId
                    ? `All ${selectedDepartment?.processes.length ?? 0} accessible process(es) in this process function will be included.`
                    : 'Leave empty to generate for the entire process function.'
                }
                onChange={(e) => {
                  setProcessId(e.target.value);
                  setResult(null);
                }}
              >
                <MenuItem value="">
                  — All processes in this process function —
                </MenuItem>
                {(selectedDepartment?.processes ?? []).map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            {isProcessFunctionScope && (selectedDepartment?.processes.length ?? 0) > 0 ? (
              <Alert severity="info">
                Generation will include{' '}
                <strong>{selectedDepartment?.processes.length}</strong> process(es) and all
                their sub-processes. Comments are excluded. Large process functions may take
                longer to complete.
              </Alert>
            ) : null}

            <Divider />

            <Typography variant="subtitle1">2. Deliverables (optional)</Typography>
            <Typography variant="body2" color="text.secondary">
              Quick presets for common sections — optional. You can combine them with your own
              prompt below.
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button size="small" variant="outlined" onClick={selectAllTemplates}>
                Select all
              </Button>
              <Button size="small" variant="text" onClick={clearTemplates}>
                Clear
              </Button>
            </Stack>
            <Stack spacing={0.5}>
              {templates.map((template) => (
                <FormControlLabel
                  key={template.id}
                  control={
                    <Checkbox
                      checked={selectedTemplateIds.includes(template.id)}
                      onChange={() => toggleTemplate(template.id)}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        {template.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {template.description}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </Stack>

            <Divider />

            <Typography variant="subtitle1">3. Your prompt (optional)</Typography>
            <Typography variant="body2" color="text.secondary">
              Describe exactly what you want — sections, RACI, swimlanes, language, level of detail.
              When provided, Automation follows your prompt first and uses BPM data only.
            </Typography>
            <TextField
              multiline
              minRows={8}
              fullWidth
              placeholder={`Example:\nCreate a full BPM document with:\n- Executive summary\n- Process overview per sub-process\n- RACI matrix for every activity\n- Swimlane table by role\nUse formal English and Neweast naming.`}
              value={userPrompt}
              onChange={(e) => {
                setUserPrompt(e.target.value);
                setResult(null);
              }}
              error={promptOnlyTooShort}
              helperText={
                promptOnlyTooShort
                  ? `At least ${MIN_PROMPT_LENGTH} characters when no deliverables are selected`
                  : hasPrompt
                    ? `${trimmedPrompt.length} characters`
                    : 'Optional — or select deliverables above'
              }
            />

            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button
                variant="contained"
                size="large"
                disabled={generating || !canGenerate}
                startIcon={
                  generating ? (
                    <CircularProgress size={18} color="inherit" />
                  ) : (
                    <Iconify icon="solar:restart-bold" />
                  )
                }
                onClick={openConfirm}
              >
                Generate with Automation
              </Button>
            </Stack>

            {generateError ? <Alert severity="error">{generateError}</Alert> : null}
          </Stack>
        </Card>

        {generating ? (
          <Card sx={{ p: 4 }}>
            <Stack spacing={2} alignItems="center" textAlign="center">
              <CircularProgress size={40} />
              <Typography variant="subtitle1">Building your Word document…</Typography>
              <Stack spacing={0.5} sx={{ maxWidth: 420 }}>
                <Typography variant="body2" color="text.secondary">
                  Collecting BPM data and applying your prompt.
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  Large scopes may take up to two minutes — please keep this tab open.
                </Typography>
              </Stack>
            </Stack>
          </Card>
        ) : null}

        {result && !generating ? (
          <Card sx={{ p: 2 }}>
            <Stack spacing={2}>
              {result.warningMessage ? (
                <Alert severity="warning">{result.warningMessage}</Alert>
              ) : null}

              <Alert severity="success" icon={false}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  spacing={2}
                >
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {result.document.cover.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {result.document.cover.processTarget} · {result.sectionHeadings.length}{' '}
                      sections · {result.subProcessCount} sub-processes
                    </Typography>
                  </Box>
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    <Button
                      variant="contained"
                      size="large"
                      startIcon={<Iconify icon="solar:share-bold" />}
                      onClick={handleDownloadWord}
                    >
                      Download Word (.docx)
                    </Button>
                    <Button
                      variant="contained"
                      color="success"
                      size="large"
                      startIcon={<Iconify icon="solar:check-circle-bold" />}
                      onClick={() => {
                        setApproveError('');
                        setApproveOpen(true);
                      }}
                    >
                      Approve document
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      size="large"
                      startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
                      onClick={handleRemoveDocument}
                    >
                      Remove document
                    </Button>
                  </Stack>
                </Stack>
              </Alert>

              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: 'background.neutral',
                  border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                }}
              >
                <Typography variant="overline" color="text.secondary">
                  Generation inputs
                </Typography>
                {result.userPrompt ? (
                  <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                    <strong>Prompt:</strong> {result.userPrompt}
                  </Typography>
                ) : null}
                {result.templateNames.length > 0 ? (
                  <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1 }}>
                    {result.templateNames.map((name) => (
                      <Chip key={name} size="small" label={name} />
                    ))}
                  </Stack>
                ) : null}
              </Box>

              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: 'background.neutral',
                  border: (theme) => `1px solid ${theme.vars.palette.divider}`,
                }}
              >
                <Typography variant="overline" color="text.secondary">
                  Document outline (preview)
                </Typography>
                <Stack component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }} spacing={0.75}>
                  {result.sectionHeadings.map((heading) => (
                    <Typography key={heading} component="li" variant="body2">
                      {heading}
                    </Typography>
                  ))}
                </Stack>
              </Box>

              <Alert severity="info">
                The Word file has: <strong>page 1</strong> cover with title and details,{' '}
                <strong>page 2</strong> full table of contents, then body with bordered/highlighted
                tables and improved spacing. In Word, press <strong>F9</strong> (or right-click TOC →
                Update field) to refresh page numbers.
              </Alert>
            </Stack>
          </Card>
        ) : null}
      </Stack>

      <Dialog open={approveOpen} onClose={() => setApproveOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Approve document</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              This saves the generated Word file to{' '}
              <strong>Process Function Documentation</strong> for{' '}
              {selectedDepartment?.code ?? '—'}
              {processId && selectedProcess ? ` / ${selectedProcess.code}` : ''}.
            </Alert>
            <TextField
              label="Comments (optional)"
              multiline
              minRows={3}
              fullWidth
              value={approveComments}
              onChange={(e) => setApproveComments(e.target.value)}
              placeholder="Review notes, version, approval context…"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveOpen(false)} disabled={approving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={approving}
            onClick={() => void runApproveDocument()}
          >
            {approving ? 'Saving…' : 'Approve & link'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm generation</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              Automation will generate from your prompt and BPM data only.{' '}
              <strong>Comments are ignored.</strong>
            </Alert>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Process function
              </Typography>
              <Typography variant="subtitle1">
                {selectedDepartment
                  ? toDepartmentDisplayName(
                      selectedDepartment.code,
                      selectedDepartment.name,
                    )
                  : '—'}
              </Typography>
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Target
              </Typography>
              {processId && selectedProcess ? (
                <Typography variant="body2">
                  Single process: <strong>{selectedProcess.name}</strong> ({selectedProcess.code})
                </Typography>
              ) : (
                <Typography variant="body2">
                  <strong>All processes</strong> in this process function (
                  {selectedDepartment?.processes.length ?? 0} accessible)
                </Typography>
              )}
            </Box>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Deliverables
              </Typography>
              {selectedTemplateIds.length > 0 ? (
                <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 0.5 }}>
                  {templates
                    .filter((t) => selectedTemplateIds.includes(t.id))
                    .map((t) => (
                      <Chip key={t.id} size="small" label={t.name} />
                    ))}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  None selected
                </Typography>
              )}
            </Box>

            {trimmedPrompt ? (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Your prompt
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {trimmedPrompt}
                </Typography>
              </Box>
            ) : null}

            <Typography variant="body2" color="text.secondary">
              Output is a professional Microsoft Word (.docx) file. Generation may take 1–2 minutes.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => void runGenerate()}>
            Confirm &amp; generate
          </Button>
        </DialogActions>
      </Dialog>
    </DashboardContent>
  );
}

function PageHeader() {
  return (
    <div>
      <Typography variant="h4">Automation BPM generation</Typography>
      <Typography variant="body2" color="text.secondary">
        Write your own prompt and/or pick deliverable presets — Automation builds the Word document
        from your inputs and BPM data. Comments are excluded from BPM data.
      </Typography>
    </div>
  );
}

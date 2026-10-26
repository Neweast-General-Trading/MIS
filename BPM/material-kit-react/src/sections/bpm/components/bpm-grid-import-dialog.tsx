import type { ActivityTemplate, ActivityTemplateField } from 'src/sections/bpm/storage';

import { useRef, useMemo, useState, useEffect, useCallback } from 'react';

import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Link from '@mui/material/Link';
import Tabs from '@mui/material/Tabs';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import TableRow from '@mui/material/TableRow';
import MenuItem from '@mui/material/MenuItem';
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

import { Iconify } from 'src/components/iconify';

import { computeNextProcessCodeForDepartment } from 'src/sections/bpm/hierarchy-code-display';
import {
  importBpmGrid,
  fetchActivityTemplates,
  resolveBpmPublicFileUrl,
  type ImportBpmGridPayload,
  type ImportWorkbookPerSheetResult,
} from 'src/sections/bpm/api';

const GRID_INITIAL_ROWS = 24;
const GRID_ROW_CHUNK = 24;
const GRID_MAX_ROWS = 120;

/** Single-line cells only — everything else uses `<textarea>` so Excel Alt+Enter / long text is visible and kept. */
function gridFieldIsSingleLine(f: ActivityTemplateField): boolean {
  return f.key === 'si_no' || f.key === 'activity_id' || f.type === 'yes_no';
}

type GridSheetModel = {
  id: string;
  sheetName: string;
  parentProcessId: string;
  processName: string;
  processDescription: string;
  matrix: string[][];
};

function createSheet(id: string, name: string, fieldCount: number): GridSheetModel {
  return {
    id,
    sheetName: name,
    parentProcessId: '',
    processName: '',
    processDescription: '',
    matrix: Array.from({ length: GRID_INITIAL_ROWS }, () => Array(fieldCount).fill('')),
  };
}

let templatesListCache: { at: number; data: ActivityTemplate[] } | null = null;
const TEMPLATES_CACHE_MS = 45_000;

/** Call when templates may have changed (e.g. after editing field order) or before grid import opens. */
export function invalidateBpmActivityTemplatesCache() {
  templatesListCache = null;
}

async function fetchTemplatesCached() {
  const now = Date.now();
  if (templatesListCache && now - templatesListCache.at < TEMPLATES_CACHE_MS) {
    return templatesListCache.data;
  }
  const data = await fetchActivityTemplates();
  templatesListCache = { at: now, data };
  return data;
}

/** Works on HTTP (non-secure) pages where `crypto.randomUUID` is unavailable. */
function newSheetId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function normClipboardCell(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Office / Excel clipboard HTML wraps the real `<table>` between these markers. */
function clipOfficeHtmlFragment(html: string): string {
  const low = html.toLowerCase();
  const startMark = '<!--startfragment-->';
  const endMark = '<!--endfragment-->';
  const start = low.indexOf(startMark);
  const end = low.indexOf(endMark);
  if (start === -1 || end === -1 || end <= start) {
    return html;
  }
  const inner = html.slice(start + startMark.length, end).trim();
  return inner.length ? inner : html;
}

/** Expands `colspan` / `rowspan` so each logical column aligns with Excel’s grid (merged headers no longer collapse). */
function parseHtmlTableWithSpan(table: HTMLTableElement): string[][] {
  const trs = [...table.rows];
  const R = trs.length;
  if (!R) return [];

  let C = 0;
  for (let ri = 0; ri < R; ri += 1) {
    let w = 0;
    const { cells } = trs[ri]!;
    for (let j = 0; j < cells.length; j += 1) {
      const cs = Math.max(1, parseInt(cells[j]!.getAttribute('colspan') || '1', 10) || 1);
      w += cs;
    }
    C = Math.max(C, w);
  }
  if (C < 1) C = 1;

  const occ: boolean[][] = Array.from({ length: R }, () => Array(C).fill(false));
  const grid: string[][] = Array.from({ length: R }, () => Array(C).fill(''));

  for (let ri = 0; ri < R; ri += 1) {
    const row = trs[ri]!;
    let ci = 0;
    for (let j = 0; j < row.cells.length; j += 1) {
      const cell = row.cells[j]!;
      while (ci < C && occ[ri]![ci]) ci += 1;
      const cs = Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);
      const rs = Math.max(1, parseInt(cell.getAttribute('rowspan') || '1', 10) || 1);
      const text = (cell.textContent ?? '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();
      for (let dr = 0; dr < rs; dr += 1) {
        for (let dc = 0; dc < cs; dc += 1) {
          const r = ri + dr;
          const cIdx = ci + dc;
          if (r >= R || cIdx >= C) continue;
          occ[r]![cIdx] = true;
          if (dr === 0 && dc === 0) {
            grid[r]![cIdx] = text;
          }
        }
      }
      ci += cs;
    }
  }

  return grid;
}

/**
 * Excel puts a real HTML `<table>` on the clipboard. That keeps line breaks *inside* a cell;
 * raw `text/plain` uses newlines for rows unless cells are double-quoted (see `parseExcelPlainTsv`).
 */
function parseExcelClipboardHtml(html: string): string[][] | null {
  const trimmed = clipOfficeHtmlFragment(html ?? '').trim();
  if (!trimmed) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(trimmed, 'text/html');
  } catch {
    return null;
  }
  if (doc.querySelector('parsererror')) {
    return null;
  }
  const tables = [...doc.querySelectorAll('table')];
  if (!tables.length) return null;

  let best: string[][] = [];
  let bestScore = 0;
  for (const table of tables) {
    const grid = parseHtmlTableWithSpan(table);
    const score = grid.reduce((sum, row) => sum + row.reduce((s, c) => s + c.length, 0), 0);
    if (grid.length && score > bestScore) {
      best = grid;
      bestScore = score;
    }
  }
  return best.length ? best : null;
}

/**
 * Excel `text/plain` clipboard: tabs separate columns; cells that contain newlines are wrapped in
 * double quotes with `""` for an embedded quote. Without this parser, each inner newline becomes
 * a bogus extra row (column shift + empty "TBD" style rows from the sheet).
 */
function parseExcelPlainTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  const lastRowAllEmpty = row.every((c) => c === '');
  if (!lastRowAllEmpty || rows.length === 0) {
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1]!.every((c) => c === '')) {
    rows.pop();
  }
  return rows;
}

/** Same extra titles as API `HEADER_ALIASES` so merged / two-row Excel headers strip on paste. */
const PASTE_HEADER_ALIASES: Partial<Record<string, string[]>> = {
  activity_name: ['Sub-process Name', 'Sub process name', 'Subprocess Name'],
  activity_description: ['Sub-process Description', 'Sub process description'],
  dashboard: ['Dashboards'],
  controls: ['Control'],
  approvals_req: ['Approvals Req (Yes/No)', 'Approval Flow', 'Approvals', 'Approval'],
  reports: ['Deliveries', 'Deliverable', 'Deliverables'],
  risks: ['Risk'],
  policies: ['Policy'],
};

/** First pasted row(s) may be the template header (incl. sub-headers under merged titles). */
function pastedRowLooksLikeTemplateHeader(row: string[], fields: ActivityTemplateField[]): boolean {
  if (!row.length || !fields.length) return false;
  const need = Math.min(4, Math.max(2, Math.ceil(fields.length * 0.2)));
  let hits = 0;
  for (let i = 0; i < row.length; i += 1) {
    const cell = normClipboardCell(row[i] ?? '');
    if (!cell) continue;
    for (const f of fields) {
      const fl = normClipboardCell(f.label);
      if (!fl) continue;
      if (cell === fl || cell.includes(fl) || fl.includes(cell)) {
        hits += 1;
        break;
      }
      const aliases = PASTE_HEADER_ALIASES[f.key];
      if (
        aliases?.some((a) => {
          const al = normClipboardCell(a);
          return Boolean(al && (cell === al || cell.includes(al) || al.includes(cell)));
        })
      ) {
        hits += 1;
        break;
      }
    }
  }
  return hits >= need;
}

export type BpmGridImportDialogProps = {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  departmentCode?: string;
  processCodeLevels?: 3 | 4;
  companyCode: string;
  activityTemplateId: string;
  processOwners: string;
  processOptions?: Array<{ id: string; code: string; name: string }>;
  onImported: (result: ImportWorkbookPerSheetResult) => void;
};

export function BpmGridImportDialog({
  open,
  onClose,
  departmentId,
  departmentCode = '',
  processCodeLevels = 3,
  companyCode,
  activityTemplateId,
  processOwners,
  processOptions = [],
  onImported,
}: BpmGridImportDialogProps) {
  const [template, setTemplate] = useState<ActivityTemplate | null>(null);
  const [loadError, setLoadError] = useState('');
  const [sheets, setSheets] = useState<GridSheetModel[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const cursorRef = useRef({ si: 0, r: 0, c: 0 });

  const fields = useMemo(() => template?.fields ?? [], [template]);
  const normalizedProcessOptions = useMemo(
    () =>
      processOptions
        .map((p) => ({ ...p, code: String(p.code ?? '').trim() }))
        .filter((p) => p.code.length > 0),
    [processOptions],
  );
  const parentProcessOptions = useMemo(
    () => normalizedProcessOptions.filter((p) => p.code.split('-').length === 4),
    [normalizedProcessOptions],
  );
  const supportsParentProcess = processCodeLevels === 4;

  const processCodePreview = useMemo(() => {
    const current = sheets[activeIdx];
    if (!current) return '';
    const parentId = supportsParentProcess ? current.parentProcessId?.trim() : '';
    const parentCode = parentId
      ? parentProcessOptions.find((p) => p.id === parentId)?.code
      : undefined;
    return computeNextProcessCodeForDepartment({
      departmentCode,
      existingProcessCodes: normalizedProcessOptions.map((p) => p.code),
      processCodeLevels,
      parentProcessCode: parentCode,
    });
  }, [
    activeIdx,
    departmentCode,
    normalizedProcessOptions,
    parentProcessOptions,
    processCodeLevels,
    sheets,
    supportsParentProcess,
  ]);

  useEffect(() => {
    if (!open) {
      return () => {};
    }
    invalidateBpmActivityTemplatesCache();
    setLoadError('');
    setSubmitError('');
    if (!activityTemplateId) {
      setTemplate(null);
      setSheets([]);
      return () => {};
    }
    let cancelled = false;
    fetchTemplatesCached()
      .then((list) => {
        if (cancelled) return;
        const t = list.find((item) => item.id === activityTemplateId) ?? null;
        setTemplate(t);
        if (t?.fields?.length) {
          setSheets([createSheet(newSheetId(), 'Process_1', t.fields.length)]);
          setActiveIdx(0);
          cursorRef.current = { si: 0, r: 0, c: 0 };
        } else {
          setSheets([]);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setLoadError(err.message);
          setTemplate(null);
          setSheets([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, activityTemplateId]);

  useEffect(() => {
    if (!open) {
      setTemplate(null);
      setSheets([]);
      setActiveIdx(0);
      setLoadError('');
      setSubmitError('');
    }
  }, [open]);

  const templateUrl = resolveBpmPublicFileUrl('/docx/BPM-Files/templater.xls');

  const updateMatrixCell = useCallback(
    (sheetIndex: number, row: number, col: number, value: string) => {
      setSheets((prev) =>
        prev.map((s, si) => {
          if (si !== sheetIndex) return s;
          const mat = s.matrix.map((r) => [...r]);
          if (!mat[row]) return s;
          mat[row] = [...mat[row]];
          mat[row][col] = value;
          return { ...s, matrix: mat };
        })
      );
    },
    []
  );

  const onPasteCapture = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!fields.length || !e.clipboardData) return;

      const html = e.clipboardData.getData('text/html');
      let grid = parseExcelClipboardHtml(html);
      if (!grid?.length) {
        const text = e.clipboardData.getData('text/plain');
        if (!text?.trim()) return;
        grid = parseExcelPlainTsv(text);
      }
      if (!grid?.length) return;

      let stripHeaders = 0;
      while (grid.length && stripHeaders < 3 && pastedRowLooksLikeTemplateHeader(grid[0] ?? [], fields)) {
        grid = grid.slice(1);
        stripHeaders += 1;
      }

      const si = activeIdx;
      const startR = cursorRef.current.si === si ? cursorRef.current.r : 0;
      const startC = cursorRef.current.si === si ? cursorRef.current.c : 0;
      setSheets((prev) =>
        prev.map((s, sheetIndex) => {
          if (sheetIndex !== si) return s;
          const mat = s.matrix.map((row) => [...row]);
          let ri = startR;
          for (let i = 0; i < grid.length; i += 1) {
            if (ri >= mat.length) {
              mat.push(Array(fields.length).fill(''));
            }
            const cells = grid[i] ?? [];
            let cj = startC;
            for (let j = 0; j < cells.length; j += 1) {
              if (cj < fields.length) {
                mat[ri] = [...mat[ri]];
                mat[ri][cj] = cells[j] ?? '';
              }
              cj += 1;
            }
            ri += 1;
          }
          return { ...s, matrix: mat };
        })
      );
    },
    [activeIdx, fields]
  );

  const addSheet = () => {
    if (!fields.length) return;
    setSheets((prev) => {
      const next = [
        ...prev,
        createSheet(newSheetId(), `Process_${prev.length + 1}`, fields.length),
      ];
      setActiveIdx(next.length - 1);
      return next;
    });
  };

  const removeSheet = (idx: number) => {
    setSheets((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== idx);
      setActiveIdx((i) => Math.min(i, next.length - 1));
      return next;
    });
  };

  const buildPayload = useCallback((): ImportBpmGridPayload | null => {
    if (!companyCode || !activityTemplateId || !fields.length) return null;
    const owners = processOwners
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      companyCode,
      activityTemplateId,
      processOwners: owners,
      sheets: sheets.map((s) => ({
        sheetName: s.sheetName.trim() || 'Sheet',
        parentProcessId: supportsParentProcess ? s.parentProcessId.trim() || undefined : undefined,
        processName: s.processName.trim() || undefined,
        processDescription: s.processDescription.trim() || undefined,
        rows: s.matrix.map((cells) =>
          Object.fromEntries(fields.map((f, i) => [f.key, cells[i] ?? '']))
        ),
      })),
    };
  }, [sheets, companyCode, activityTemplateId, fields, processOwners, supportsParentProcess]);

  const addGridRows = () => {
    if (!fields.length) return;
    setSheets((prev) =>
      prev.map((s, si) => {
        if (si !== activeIdx) return s;
        if (s.matrix.length >= GRID_MAX_ROWS) return s;
        const add = Math.min(GRID_ROW_CHUNK, GRID_MAX_ROWS - s.matrix.length);
        const extra = Array.from({ length: add }, () => Array(fields.length).fill(''));
        return { ...s, matrix: [...s.matrix, ...extra] };
      })
    );
  };

  const onSubmit = async () => {
    setSubmitError('');
    const payload = buildPayload();
    if (!payload) {
      setSubmitError('Select company and template in the page behind this dialog.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await importBpmGrid(departmentId, payload);
      onImported(result);
      onClose();
    } catch (err) {
      setSubmitError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const current = sheets[activeIdx];

  const canSubmit = Boolean(template && companyCode && activityTemplateId && fields.length);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      scroll="paper"
      transitionDuration={{ enter: 200, exit: 150 }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        Import processes (grid — copy / paste from Excel)
        {template?.name ? (
          <Typography component="span" variant="body2" sx={{ display: 'block', mt: 0.5, fontWeight: 400, color: 'text.secondary' }}>
            Columns follow template: <strong>{template.name}</strong> ({fields.length} field{fields.length === 1 ? '' : 's'} — left-to-right order)
          </Typography>
        ) : null}
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <Iconify icon="mingcute:close-line" width={22} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ pt: 1 }}>
        <Stack spacing={2}>
          {loadError ? <Alert severity="error">{loadError}</Alert> : null}
          {submitError ? <Alert severity="error">{submitError}</Alert> : null}

          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Each tab = one BPM <strong>process</strong>. Columns are mapped <strong>by position</strong> to the
            selected template (same order as the downloaded Excel template). Your pasted block must have the{' '}
            <strong>same left-to-right column order</strong> — no extra leading column (e.g. row numbers / #). Click
            the cell under <strong>SI.No</strong> (or the first column you copied), then paste. Copy from{' '}
            <strong>Excel</strong>; we prefer HTML clipboard, else plain text with quoted line breaks.{' '}
            <strong>Activity Name</strong> marks each sub-process row. <strong>SI.No</strong> /{' '}
            <strong>Activity ID</strong> come from your pasted sheet when they already match the generated
            Process code stem; otherwise they are remapped onto that process so Word/PDF stay consistent.
          </Typography>

          <Typography variant="body2">
            Optional file on API server:{' '}
            <Link href={templateUrl} target="_blank" rel="noopener">
              {templateUrl}
            </Link>{' '}
            (place <code>templater.xls</code> under <code>docx/BPM-Files/</code> on the server if you use it).
          </Typography>

          {!template ? (
            <Alert severity="info">Choose a sub-process template on the page before opening this dialog.</Alert>
          ) : (
            <>
              <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                <Tabs
                  value={activeIdx}
                  onChange={(_e, v) => setActiveIdx(v)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ flex: 1, minWidth: 0 }}
                >
                  {sheets.map((s, i) => (
                    <Tab key={s.id} label={s.sheetName || `Tab ${i + 1}`} value={i} />
                  ))}
                </Tabs>
                <Button size="small" variant="outlined" onClick={addSheet} startIcon={<Iconify icon="mingcute:add-line" />}>
                  Add tab
                </Button>
              </Stack>

              {current ? (
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    {supportsParentProcess ? (
                      <TextField
                        label="Parent process (optional)"
                        select
                        value={current.parentProcessId}
                        onChange={(e) =>
                          setSheets((prev) =>
                            prev.map((s, i) =>
                              i === activeIdx ? { ...s, parentProcessId: e.target.value } : s,
                            ),
                          )
                        }
                        helperText="If selected (4-level mode), this process continues the same parent branch."
                        fullWidth
                      >
                        <MenuItem value="">
                          <em>No parent</em>
                        </MenuItem>
                        {parentProcessOptions.map((p) => (
                          <MenuItem key={p.id} value={p.id}>
                            {p.code} - {p.name}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : null}
                    <TextField
                      label="Process code"
                      value={processCodePreview || 'Auto-generated'}
                      disabled
                      helperText={
                        current.parentProcessId && processCodeLevels === 4
                          ? '4 levels with selected parent: C1-P-C-000 (same parent branch).'
                          : processCodeLevels === 4
                            ? '4 levels without selected parent: next parent branch starts at C1-P-001-000.'
                            : 'Without roots: code is generated as C1-C2-000.'
                      }
                      fullWidth
                    />
                    <TextField
                      label="Tab / sheet name"
                      value={current.sheetName}
                      onChange={(e) =>
                        setSheets((prev) =>
                          prev.map((s, i) => (i === activeIdx ? { ...s, sheetName: e.target.value } : s))
                        )
                      }
                      helperText="Used as process name if Process name is empty."
                      fullWidth
                    />
                    <TextField
                      label="Process name (optional)"
                      value={current.processName}
                      onChange={(e) =>
                        setSheets((prev) =>
                          prev.map((s, i) => (i === activeIdx ? { ...s, processName: e.target.value } : s))
                        )
                      }
                      fullWidth
                    />
                  </Stack>
                  <TextField
                    label="Process description (optional)"
                    value={current.processDescription}
                    onChange={(e) =>
                      setSheets((prev) =>
                        prev.map((s, i) => (i === activeIdx ? { ...s, processDescription: e.target.value } : s))
                      )
                    }
                    fullWidth
                    multiline
                    minRows={2}
                  />

                  <Box
                    tabIndex={0}
                    onPasteCapture={onPasteCapture}
                    sx={{ outline: 'none', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                  >
                    <Stack spacing={0.5} sx={{ px: 1, py: 0.5 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          Activity grid — click the top-left target cell, then Ctrl+V. Rows: {current.matrix.length} /{' '}
                          {GRID_MAX_ROWS}
                        </Typography>
                        <Button
                          size="small"
                          variant="text"
                          onClick={addGridRows}
                          disabled={current.matrix.length >= GRID_MAX_ROWS}
                        >
                          Add rows (+{GRID_ROW_CHUNK})
                        </Button>
                      </Stack>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        Column order and header names must match the template (e.g. <strong>Approvals Req</strong>, not
                        a column named only &quot;Req&quot;). Long cells show in multi-line boxes. Click the{' '}
                        <strong>SI.No</strong> cell before pasting. Positional paste; use HTTPS if paste misaligns.
                        Process summary rows above the table in Excel should not be included in the selection.
                        Activity IDs that do not match the generated Process code are remapped to that process stem.
                      </Typography>
                    </Stack>
                    <TableContainer sx={{ maxHeight: 'min(55vh, 480px)' }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ width: 48, bgcolor: 'background.paper' }}>#</TableCell>
                            {fields.map((f) => (
                              <TableCell key={f.key} sx={{ minWidth: 120, bgcolor: 'background.paper' }}>
                                {f.label}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {current.matrix.map((row, r) => (
                            <TableRow key={r}>
                              <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{r + 1}</TableCell>
                              {fields.map((f, c) => {
                                const singleLine = gridFieldIsSingleLine(f);
                                const val = row[c] ?? '';
                                const lineBreaks = val.split('\n').length;
                                const taRows = singleLine ? undefined : Math.min(12, Math.max(2, lineBreaks));
                                return (
                                  <TableCell key={f.key} sx={{ p: '2px', verticalAlign: 'top' }}>
                                    <Box
                                      component={singleLine ? 'input' : 'textarea'}
                                      {...(singleLine
                                        ? {}
                                        : {
                                            rows: taRows,
                                          })}
                                      value={val}
                                      onChange={(
                                        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                                      ) => updateMatrixCell(activeIdx, r, c, e.target.value)}
                                      onFocus={() => {
                                        cursorRef.current = { si: activeIdx, r, c };
                                      }}
                                      onClick={() => {
                                        cursorRef.current = { si: activeIdx, r, c };
                                      }}
                                      sx={{
                                        width: '100%',
                                        minWidth: 72,
                                        boxSizing: 'border-box',
                                        fontSize: 13,
                                        px: 0.75,
                                        py: 0.5,
                                        border: 1,
                                        borderColor: 'divider',
                                        borderRadius: 0.5,
                                        bgcolor: 'background.paper',
                                        fontFamily: 'inherit',
                                        display: 'block',
                                        ...(singleLine
                                          ? {}
                                          : {
                                              minHeight: 48,
                                              resize: 'vertical' as const,
                                              overflow: 'auto',
                                              lineHeight: 1.35,
                                            }),
                                        '&:focus': {
                                          outline: '2px solid',
                                          outlineColor: 'primary.main',
                                          outlineOffset: 0,
                                        },
                                      }}
                                    />
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>

                  {sheets.length > 1 ? (
                    <Button
                      color="error"
                      variant="outlined"
                      size="small"
                      onClick={() => removeSheet(activeIdx)}
                      startIcon={<Iconify icon="solar:trash-bin-trash-bold" />}
                    >
                      Remove current tab
                    </Button>
                  ) : null}
                </Stack>
              ) : null}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="contained" disabled={submitting || !canSubmit} onClick={() => void onSubmit()}>
          {submitting ? 'Saving…' : 'Import all tabs'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

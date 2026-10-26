import type { ActivityTemplateField } from 'src/activity-templates/entities/activity-template.entity';

/** Sheets not imported as processes in mode B (Index/Summary reserved; `_` = help / instructions). */
export function shouldSkipSheetForPerSheetImport(sheetName: string): boolean {
  const n = sheetName.trim().toLowerCase();
  if (n === 'index' || n === 'summary') {
    return true;
  }
  if (n.startsWith('_')) {
    return true;
  }
  return false;
}

/** Extra header texts accepted for template keys (UI / Excel variants). */
const HEADER_ALIASES: Partial<Record<string, string[]>> = {
  activity_name: ['Sub-process Name', 'Sub process name', 'Subprocess Name'],
  activity_description: ['Sub-process Description', 'Sub process description'],
  dashboard: ['Dashboards'],
  controls: ['Control'],
  approvals_req: [
    'Approvals Req (Yes/No)',
    'Approval Flow',
    'Approvals',
    'Approval',
  ],
  reports: ['Deliveries', 'Deliverable', 'Deliverables'],
  risks: ['Risk'],
  policies: ['Policy'],
};

function normsForField(f: ActivityTemplateField): string[] {
  const out = new Set<string>();
  out.add(normalizeHeaderCell(f.label));
  for (const a of HEADER_ALIASES[f.key] ?? []) {
    out.add(normalizeHeaderCell(a));
  }
  return [...out].filter(Boolean);
}

export function normalizeHeaderCell(raw: string): string {
  return String(raw ?? '')
    .trim()
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** How many template column labels must appear on a row to treat it as the activity table header. */
function defaultMinHeaderMatches(fieldCount: number): number {
  if (fieldCount <= 3) return 2;
  return Math.min(fieldCount, Math.max(3, Math.floor(fieldCount * 0.2)));
}

function headerCellMatchesField(cellNorm: string, fieldLabelNorm: string): boolean {
  if (!cellNorm || !fieldLabelNorm) return false;
  if (cellNorm === fieldLabelNorm) return true;
  if (cellNorm.includes(fieldLabelNorm) || fieldLabelNorm.includes(cellNorm)) return true;
  return false;
}

export function scoreRowAsTemplateHeader(
  row: (string | number | undefined)[],
  fields: ActivityTemplateField[],
): number {
  const cells = row.map((c) => normalizeHeaderCell(String(c ?? '')));
  let hits = 0;
  for (const f of fields) {
    const labelNorms = normsForField(f);
    if (!labelNorms.length) continue;
    if (labelNorms.some((fl) => cells.some((c) => headerCellMatchesField(c, fl)))) {
      hits += 1;
    }
  }
  return hits;
}

/**
 * Finds the row index of the activity/sub-process table header by matching template column labels.
 */
export function findActivityTableHeaderRowIndex(
  matrix: (string | number | undefined)[][],
  fields: ActivityTemplateField[],
  options?: { maxScanRows?: number; minMatches?: number },
): number | null {
  const maxScan = Math.min(options?.maxScanRows ?? 100, matrix.length);
  const minMatches = options?.minMatches ?? defaultMinHeaderMatches(fields.length);
  let bestIdx: number | null = null;
  let bestScore = 0;
  for (let i = 0; i < maxScan; i += 1) {
    const row = matrix[i];
    if (!row?.length) continue;
    const score = scoreRowAsTemplateHeader(row, fields);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx === null || bestScore < minMatches) {
    return null;
  }
  return bestIdx;
}

/**
 * Merges two consecutive Excel header rows: sub-header (row below) wins when non-empty so
 * grouped titles like “Activity Description” spanning columns do not hide “Roles”, “Systems”, …
 */
export function mergeAdjacentHeaderRows(
  top: (string | number | undefined)[],
  bottom: (string | number | undefined)[],
): (string | number | undefined)[] {
  const len = Math.max(top.length, bottom.length);
  return Array.from({ length: len }, (_, c) => {
    const b = String(bottom[c] ?? '').trim();
    const t = String(top[c] ?? '').trim();
    return b || t || '';
  });
}

type HeaderPick = {
  headerRowIndex: number;
  headerDepth: 1 | 2;
  syntheticHeader: (string | number | undefined)[];
  score: number;
  mapSize: number;
};

/**
 * Picks the best header block: either a single row or two merged rows (merged parent + sub-headers).
 * Prefer the layout that maps the most template columns (fixes merged “Activity Description” groups).
 */
export function findBestActivityTableHeaderLayout(
  matrix: (string | number | undefined)[][],
  fields: ActivityTemplateField[],
  options?: { maxScanRows?: number; minMatches?: number },
): HeaderPick | null {
  const maxScan = Math.min(options?.maxScanRows ?? 100, matrix.length);
  const minMatches = options?.minMatches ?? defaultMinHeaderMatches(fields.length);
  const candidates: HeaderPick[] = [];

  for (let i = 0; i < maxScan; i += 1) {
    const row = matrix[i];
    if (!row?.length) continue;

    const soloSynth = [...row];
    const scoreSolo = scoreRowAsTemplateHeader(soloSynth, fields);
    const mapSolo = mapColumnsToFieldKeys(soloSynth, fields);
    if (scoreSolo >= minMatches) {
      candidates.push({
        headerRowIndex: i,
        headerDepth: 1,
        syntheticHeader: soloSynth,
        score: scoreSolo,
        mapSize: mapSolo.size,
      });
    }

    if (i + 1 < matrix.length) {
      const merged = mergeAdjacentHeaderRows(matrix[i] ?? [], matrix[i + 1] ?? []);
      if (!merged.some((c) => String(c ?? '').trim())) continue;
      const scoreM = scoreRowAsTemplateHeader(merged, fields);
      const mapM = mapColumnsToFieldKeys(merged, fields);
      if (scoreM >= minMatches) {
        candidates.push({
          headerRowIndex: i,
          headerDepth: 2,
          syntheticHeader: merged,
          score: scoreM,
          mapSize: mapM.size,
        });
      }
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (b.mapSize !== a.mapSize) return b.mapSize - a.mapSize;
    if (b.score !== a.score) return b.score - a.score;
    return a.headerDepth - b.headerDepth;
  });

  return candidates[0] ?? null;
}

/** Map column index → template field key using the header row. */
export function mapColumnsToFieldKeys(
  headerRow: (string | number | undefined)[],
  fields: ActivityTemplateField[],
): Map<number, string> {
  const map = new Map<number, string>();
  const usedKeys = new Set<string>();
  headerRow.forEach((cell, colIdx) => {
    const cn = normalizeHeaderCell(String(cell ?? ''));
    if (!cn) return;
    for (const f of fields) {
      if (usedKeys.has(f.key)) continue;
      const matched = normsForField(f).some((fl) => headerCellMatchesField(cn, fl));
      if (matched) {
        map.set(colIdx, f.key);
        usedKeys.add(f.key);
        break;
      }
    }
  });
  return map;
}

/** Strip leading hierarchy / sheet-code noise so UI Name ≠ Code. */
export function stripLeadingCodeFromLabel(raw: string): string {
  let s = String(raw ?? '').trim();
  s = s.replace(/^[\[\]*?:/\\]+/, '').trim();
  // 002-001-001-Inbound… / 003-005-000_Goods…
  s = s.replace(/^\d{3}(?:-\d{3}){1,3}\s*[-_]?\s*/i, '');
  // TM003-Forecasted… / STEL0011 - TMS…
  s = s.replace(/^(?:tm|stel)\d+\s*[-_]?\s*/i, '');
  return s.trim() || String(raw ?? '').trim();
}

/**
 * Reads optional key/value rows above the activity table (label in col A, value in col B).
 * Also accepts inline `Process: …` / `Id: …` in a single cell (common in Operations workbooks).
 * Falls back to `sheetName` (with codes stripped) for process name when not found.
 */
export function extractProcessSummaryFromTopRows(
  matrix: (string | number | undefined)[][],
  headerRowIndex: number,
  sheetName: string,
): {
  processName: string;
  processDescription: string;
  /** Excel process id when present (e.g. Id: 003-001-001-000). */
  processCode?: string;
} {
  let processName = '';
  let processCode = '';
  const descParts: string[] = [];

  for (let r = 0; r < headerRowIndex; r += 1) {
    const row = matrix[r] ?? [];
    const cells = row.map((c) => String(c ?? '').trim()).filter(Boolean);
    for (const cell of cells) {
      const idMatch = cell.match(
        /\bid\s*[:：]\s*(\d{3}(?:-\d{3}){1,3}(?:-000)?)\b/i,
      );
      if (idMatch?.[1] && !processCode) {
        let code = idMatch[1].trim();
        // Normalize short ids like 002-001-014 → 002-001-014-000
        if (/^\d{3}-\d{3}-\d{3}$/.test(code) && !code.endsWith('-000')) {
          code = `${code}-000`;
        } else if (/^\d{3}-\d{3}$/.test(code)) {
          code = `${code}-000`;
        }
        processCode = code;
      }
      // "Process: Goods receiving" in one cell (not label/value columns).
      const processInline = cell.match(
        /^process\s*[:：]\s*(.+)$/i,
      );
      if (processInline?.[1] && !processName) {
        processName = processInline[1].trim();
      }
    }
    const label = normalizeHeaderCell(String(row[0] ?? ''));
    const value = String(row[1] ?? '').trim();
    const rest = row
      .slice(2)
      .map((c) => String(c ?? '').trim())
      .filter(Boolean)
      .join(' ');
    const combined = [value, rest].filter(Boolean).join(' ').trim();
    if (!label && !combined) continue;

    if (
      label.includes('process name') ||
      label === 'name' ||
      (label.includes('process') && label.includes('title'))
    ) {
      if (combined) processName = combined;
    } else if (
      label.includes('process description') ||
      label.includes('description') ||
      label.includes('objective')
    ) {
      if (combined) descParts.push(combined);
    } else if (label && combined) {
      descParts.push(`${String(row[0] ?? '').trim()}: ${combined}`);
    } else if (!label && combined) {
      descParts.push(combined);
    }
  }

  // Sheet titles like `006-002-001 Recruitment` (HR workbooks have no Id: cell).
  if (!processCode) {
    const sheetCodeMatch = sheetName
      .trim()
      .match(/^(\d{3}(?:-\d{3}){1,3})\b/);
    if (sheetCodeMatch?.[1]) {
      let code = sheetCodeMatch[1].trim();
      if (/^\d{3}-\d{3}-\d{3}$/.test(code) && !code.endsWith('-000')) {
        code = `${code}-000`;
      } else if (/^\d{3}-\d{3}$/.test(code)) {
        code = `${code}-000`;
      }
      processCode = code;
    }
  }

  const fallbackName = stripLeadingCodeFromLabel(
    sheetName.replace(/[\[\]*?:/\\]/g, ' ').trim(),
  );
  if (!processName) {
    processName = fallbackName || 'Imported process';
  } else {
    processName = stripLeadingCodeFromLabel(processName);
  }

  return {
    processName: processName.slice(0, 255),
    processDescription: descParts.join('\n').slice(0, 8000),
    ...(processCode ? { processCode } : {}),
  };
}

function rowToDetails(
  row: (string | number | undefined)[],
  colToKey: Map<number, string>,
): Record<string, string> {
  const details: Record<string, string> = {};
  colToKey.forEach((key, colIdx) => {
    const raw = row[colIdx];
    const s = raw === undefined || raw === null ? '' : String(raw).trim();
    details[key] = s;
  });
  return details;
}

export function buildActivityDetailsFromDataRow(
  row: (string | number | undefined)[],
  colToKey: Map<number, string>,
  fields: ActivityTemplateField[],
): Record<string, string> {
  const details = rowToDetails(row, colToKey);
  for (const f of fields) {
    if (details[f.key] === undefined) {
      details[f.key] = '';
    }
    if (f.type === 'yes_no' && details[f.key]) {
      const v = normalizeHeaderCell(details[f.key]);
      if (v === 'y' || v === 'yes' || v === '1' || v === 'true') details[f.key] = 'Yes';
      else if (v === 'n' || v === 'no' || v === '0' || v === 'false') details[f.key] = 'No';
    }
  }
  return details;
}

export function normalizeGridRowDetails(
  raw: Record<string, unknown>,
  fields: ActivityTemplateField[],
): Record<string, string> {
  const details: Record<string, string> = {};
  for (const f of fields) {
    const v = raw[f.key];
    details[f.key] = v === undefined || v === null ? '' : String(v).trim();
  }
  for (const f of fields) {
    if (f.type === 'yes_no' && details[f.key]) {
      const v = normalizeHeaderCell(details[f.key]);
      if (v === 'y' || v === 'yes' || v === '1' || v === 'true') {
        details[f.key] = 'Yes';
      } else if (v === 'n' || v === 'no' || v === '0' || v === 'false') {
        details[f.key] = 'No';
      }
    }
  }
  return details;
}

/** Turns pasted / JSON rows into activity rows (trims leading/trailing empty Activity Name rows). */
export function dataRowsFromGridRecords(
  rawRows: Record<string, unknown>[],
  fields: ActivityTemplateField[],
): Array<{ details: Record<string, string>; activityName: string }> {
  const mapped = rawRows.map((r) => {
    const details = normalizeGridRowDetails(r, fields);
    return { details, activityName: pickActivityNameFromDetails(details, '', fields) };
  });
  let start = 0;
  while (start < mapped.length && !mapped[start].activityName.trim()) {
    start += 1;
  }
  let end = mapped.length;
  while (end > start && !mapped[end - 1].activityName.trim()) {
    end -= 1;
  }
  return mapped.slice(start, end);
}

function normalizeFieldKeyForCompare(key: string): string {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
}

function fieldKeyLooksLikeNonTitleTextField(f: ActivityTemplateField): boolean {
  const key = normalizeFieldKeyForCompare(f.key);
  const label = normalizeHeaderCell(f.label);

  const noisyHints = [
    'description',
    'remark',
    'note',
    'comment',
    'detail',
    'justification',
    'attachment',
    'attach',
    'filename',
    'file',
    'link',
    'url',
    'owner',
    'user',
    'company',
    'department',
    'duration',
    'effort',
    'date',
    'time',
    'deadline',
    'status',
    'priority',
    'risk',
    'impact',
    'cost',
    'benefit',
    'metric',
    'kpi',
    'sla',
    'tool',
    'system',
    'sap',
    'transaction',
    'tcode',
  ];
  if (noisyHints.some((h) => key.includes(h))) {
    return true;
  }
  if (noisyHints.some((h) => label.includes(h))) {
    return true;
  }

  return false;
}

function fieldKeyLooksLikeSerialOrId(f: ActivityTemplateField): boolean {
  const key = normalizeFieldKeyForCompare(f.key);
  const label = normalizeHeaderCell(f.label);

  if (
    key === 'sino' ||
    key === 'slno' ||
    key.endsWith('sino') ||
    key.includes('serialno') ||
    key.includes('sequenceno')
  ) {
    return true;
  }
  if (label.includes('si no') || label.includes('s.no') || label.includes('serial no')) {
    return true;
  }

  if (key === 'id' || key.endsWith('id') || key.includes('activityid') || key.includes('subprocessid')) {
    return true;
  }
  if (label.includes('activity id') || label.includes('sub-process id') || label.includes('sub process id')) {
    return true;
  }

  return false;
}

function fieldLooksLikeActivityNameColumn(f: ActivityTemplateField): boolean {
  if (fieldKeyLooksLikeSerialOrId(f)) {
    return false;
  }
  if (fieldKeyLooksLikeNonTitleTextField(f)) {
    return false;
  }
  const key = normalizeFieldKeyForCompare(f.key);
  const label = normalizeHeaderCell(f.label);

  const keyHints = [
    'activityname',
    'subprocessname',
    'activitytitle',
    'subprocesstitle',
    'activitytask',
    'subprocesstask',
    'name',
    'title',
    'task',
    'step',
    'stage',
  ];
  const keySegments = key.split(/[^a-z0-9]+/).filter(Boolean);
  if (
    keyHints.some((h) => key.includes(h)) ||
    keySegments.some((seg) => seg === 'activity' || seg === 'subprocess')
  ) {
    return true;
  }

  const labelHints = [
    'activity name',
    'sub-process name',
    'sub process name',
    'sub process',
    'sub-process',
    'title',
    'task',
    'step',
    'stage',
  ];
  if (labelHints.some((h) => label.includes(h))) {
    return true;
  }

  return false;
}

function pickActivityNameFromTemplateDetails(
  details: Record<string, string>,
  fields: ActivityTemplateField[],
): string {
  for (const f of fields) {
    if (!fieldLooksLikeActivityNameColumn(f)) continue;
    const v = String(details[f.key] ?? '').trim();
    if (v) return v.slice(0, 255);
  }

  const longTextCandidates: string[] = [];
  const shortTextCandidates: string[] = [];
  for (const f of fields) {
    if (fieldKeyLooksLikeSerialOrId(f)) continue;
    const t = f.type;
    if (
      t !== 'text' &&
      t !== 'textarea' &&
      t !== 'dropdown' &&
      t !== 'boolean' &&
      t !== 'yes_no' &&
      t !== 'dropdown_job_title' &&
      t !== 'dropdown_person_name' &&
      t !== 'dropdown_multiselect' &&
      t !== 'person_multi' &&
      t !== 'job_title' &&
      t !== 'number' &&
      t !== 'numeric_days' &&
      t !== 'oracle_job_role_multi'
    ) {
      continue;
    }
    const v = String(details[f.key] ?? '').trim();
    if (!v) continue;
    if (v.length > 48) longTextCandidates.push(v);
    else shortTextCandidates.push(v);
  }

  if (shortTextCandidates.length) {
    return shortTextCandidates[0]!.slice(0, 255);
  }
  if (longTextCandidates.length) {
    const firstLine = longTextCandidates[0]!.split(/\r?\n/)[0] ?? '';
    return firstLine.trim().slice(0, 255);
  }

  return '';
}

export function pickActivityNameFromDetails(
  details: Record<string, string>,
  fallback: string,
  fields?: ActivityTemplateField[],
): string {
  let picked = '';
  if (fields?.length) {
    const fromTemplate = pickActivityNameFromTemplateDetails(details, fields);
    if (fromTemplate.trim()) {
      picked = fromTemplate;
    }
  }

  if (!picked) {
    const direct =
      details.activity_name?.trim() ||
      details.name?.trim() ||
      details.activityName?.trim() ||
      '';
    if (direct) picked = direct;
  }

  if (!picked) {
    const activityNameKeyNorms = new Set([
      'activity_name',
      'activity name',
      'activityname',
      'sub-process name',
      'sub process name',
      'subprocess name',
      // key-style variants commonly used in templates / exports
      'sub_process_name',
      'subprocess_name',
      'subprocessname',
      'subprocess',
      'sub_process',
    ]);
    const activityNameKeyDense = new Set(
      [...activityNameKeyNorms].map((k) => k.replace(/[\s._-]+/g, '')),
    );
    for (const [k, v] of Object.entries(details)) {
      const keyNorm = normalizeHeaderCell(k);
      const keyDense = k.trim().toLowerCase().replace(/[\s._-]+/g, '');
      if (!activityNameKeyNorms.has(keyNorm) && !activityNameKeyDense.has(keyDense)) {
        continue;
      }
      const value = String(v ?? '').trim();
      if (value) {
        picked = value;
        break;
      }
    }
  }

  if (!picked) picked = fallback.trim();
  return stripLeadingCodeFromLabel(picked).slice(0, 255);
}

export type ParsedPerSheetMatrix = {
  matrix: (string | number | undefined)[][];
  headerRowIndex: number;
  /** Number of sheet rows used as header (1 or 2 when a sub-header row sits under merged titles). */
  headerDepth: 1 | 2;
  colToKey: Map<number, string>;
  summary: {
    processName: string;
    processDescription: string;
    processCode?: string;
  };
};

export function parsePerSheetLayout(
  matrix: (string | number | undefined)[][],
  sheetName: string,
  fields: ActivityTemplateField[],
): ParsedPerSheetMatrix | { error: string } {
  if (!matrix.length) {
    return { error: 'Empty sheet' };
  }
  const picked = findBestActivityTableHeaderLayout(matrix, fields);
  if (picked === null) {
    return {
      error:
        'Could not find an activity table header row. Add a row whose cells match your sub-process template column titles (e.g. SI.No, Activity Name, …).',
    };
  }
  const { headerRowIndex, headerDepth, syntheticHeader } = picked;
  const colToKey = mapColumnsToFieldKeys(syntheticHeader, fields);
  if (!colToKey.size) {
    return { error: 'Header row found but no columns matched the template labels.' };
  }
  const summary = extractProcessSummaryFromTopRows(matrix, headerRowIndex, sheetName);
  return { matrix, headerRowIndex, headerDepth, colToKey, summary };
}

/** Excel “how to fill” row under headers (e.g. “Unique identifier per task (e.g., 008-001-002)”). */
function isGuidancePlaceholderRow(details: Record<string, string>): boolean {
  const id = String(
    details['Activity ID'] ??
      details.activity_id ??
      details['Process Id'] ??
      details.process_id ??
      '',
  ).trim();
  if (!id) return false;
  if (/^\d{3}(?:-\d{3}){2,3}$/.test(id)) return false;
  const low = id.toLowerCase();
  return (
    low.includes('e.g.') ||
    low.includes('example') ||
    low.includes('unique identifier') ||
    low.includes('identifier per') ||
    /[a-z]{3,}/i.test(id)
  );
}

export function iterDataRows(
  matrix: (string | number | undefined)[][],
  headerRowIndex: number,
  colToKey: Map<number, string>,
  fields: ActivityTemplateField[],
  headerDepth: 1 | 2 = 1,
): Array<{ rowIndex: number; details: Record<string, string>; activityName: string }> {
  const out: Array<{ rowIndex: number; details: Record<string, string>; activityName: string }> = [];
  const firstDataRow = headerRowIndex + headerDepth;
  for (let r = firstDataRow; r < matrix.length; r += 1) {
    const row = matrix[r] ?? [];
    const details = buildActivityDetailsFromDataRow(row, colToKey, fields);
    const activityName = pickActivityNameFromDetails(details, '', fields);
    if (!activityName.trim()) {
      if (out.length === 0) {
        continue;
      }
      break;
    }
    if (isGuidancePlaceholderRow(details)) {
      continue;
    }
    out.push({ rowIndex: r + 1, details, activityName });
  }
  return out;
}
